/**
 * Persist a validated plan proposal when the planning agent stops.
 *
 * The plan agent is read-only by design, so it cannot write its own plan
 * anywhere. That is the right capability boundary and the wrong outcome: the
 * plan then exists only in a chat thread, which is not "an inspectable plan"
 * and not an artifact anyone else can review, resume, or hand to an
 * implementer.
 *
 * The hook resolves the durability problem without publishing. It runs outside
 * the agent's tool boundary, validates the human-readable and machine-readable
 * plan, and writes both under artifacts/. A human explicitly publishes the
 * plan-only pull request after inspection.
 *
 * If the transcript cannot be read or the plan contract is invalid, it says so
 * rather than reporting success and persisting nothing.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Buffer } from "node:buffer";
import { extractPlan } from "./publish-plan.mjs";
import {
  extractPlanContract,
  validatePlanContract,
} from "./plan-contract.mjs";
import { CONTRACT_CACHE, loadTaskContract } from "./task-contract.mjs";
import { readEvidenceJson } from "./evidence-record.mjs";
import {
  assertWorkspaceOwner,
  claimWorkspaceOwner,
  readWorkspaceOwner,
  releaseWorkspaceClaim,
  workspaceOwnerIdentity,
} from "./workspace-owner.mjs";
import { workspacePath } from "./workspace-path.mjs";

const REPO_ROOT = resolve(import.meta.dirname, "..");

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

function emit(systemMessage, failed = false, repeated = false) {
  process.stdout.write(`${JSON.stringify({
    systemMessage, additionalContext: systemMessage,
    ...(failed && !repeated ? { decision: "block", reason: systemMessage } : {}),
  }, null, 2)}\n`);
}

export function claimOwnedPlanSession(input, {
  root = REPO_ROOT,
  env = process.env,
} = {}) {
  const sessionId = input?.session_id ?? input?.sessionId;
  if (typeof sessionId !== "string" || !sessionId.trim()) {
    throw new Error("The planning Stop event must include the current session identity.");
  }
  const existing = readWorkspaceOwner(root);
  if (!existing || existing.issue === null || !existing.taskId || !existing.contractDigest) {
    throw new Error("No complete task workspace owner exists; plan artifacts were preserved.");
  }
  const ownerEnv = { ...env, GITHUB_REPOSITORY: existing.repository };
  const expected = workspaceOwnerIdentity({
    root,
    issue: existing.issue,
    taskId: existing.taskId,
    contractDigest: existing.contractDigest,
    sessionId,
    env: ownerEnv,
  });
  assertWorkspaceOwner(root, expected);
  const claim = claimWorkspaceOwner({
    root,
    issue: existing.issue,
    taskId: existing.taskId,
    contractDigest: existing.contractDigest,
    sessionId,
    env: ownerEnv,
  });
  try {
    const contract = loadTaskContract(CONTRACT_CACHE, root);
    const session = readEvidenceJson("artifacts/task-session.json", root);
    if (!contract?.source?.trusted ||
        contract.source.issue !== existing.issue ||
        contract.id !== existing.taskId ||
        contract.source.bodyDigest !== existing.contractDigest ||
        !session || session.role !== "plan" ||
        session.issue !== existing.issue ||
        session.taskId !== existing.taskId ||
        session.contractDigest !== existing.contractDigest ||
        session.sessionId !== sessionId ||
        session.workspaceOwner !== existing.ownerKey) {
      throw new Error("The plan Stop event does not match the active task owner and session.");
    }
    return { claim, contract, session };
  } catch (error) {
    releaseWorkspaceClaim(claim);
    throw error;
  }
}

async function main() {
  const raw = (await readStdin()).trim();
  let input;
  try {
    input = raw ? JSON.parse(raw) : {};
  } catch {
    emit("Plan not persisted: malformed Stop input. No publication or approval occurred.", true);
    return;
  }
  let authorization;
  try {
    authorization = claimOwnedPlanSession(input);
  } catch (error) {
    emit(
      `Plan not persisted: ${error.message}. No other task's artifacts were changed.`,
      true,
      input.stop_hook_active === true,
    );
    return;
  }

  const { claim, contract, session } = authorization;
  try {
    if (session.approvalState === "approved") {
      emit("Plan not persisted: the current session already has an approved plan, which was preserved.", true);
      return;
    }

    let body = null;
    const response = input.last_assistant_message ?? input.response;
    const transcriptPath = input.transcript_path ?? input.transcriptPath;
    if (typeof response === "string") body = response;
    else if (transcriptPath) {
      try {
        body = extractPlan(readFileSync(transcriptPath, "utf8"));
      } catch (error) {
        process.stderr.write(`The planner transcript could not be read (${error.code ?? "invalid content"}).\n`);
      }
    }

    if (!body) {
      emit(
        "Plan not persisted: the session transcript could not be read, so no pull request was opened. " +
          "The plan currently exists only in this chat. Save it and run: " +
          "node scripts/publish-plan.mjs --file <plan.md>",
        true,
        input.stop_hook_active === true,
      );
      return;
    }

    let plan;
    try {
      plan = extractPlanContract(body);
    } catch {
      emit("Plan not persisted: malformed machine-readable contract. Return a valid proposal.", true, input.stop_hook_active === true);
      return;
    }
    const validation = validatePlanContract(plan, contract);
    if (!validation.ok) {
      emit(
        `Plan not persisted: ${validation.errors.join(" ")} ` +
          "Return a complete northstar/plan/1 contract and stop again.",
        true,
        input.stop_hook_active === true,
      );
      return;
    }

    const proposalPath = workspacePath("artifacts/plan-proposal.md", REPO_ROOT);
    const planPath = workspacePath("artifacts/plan.json", REPO_ROOT);
    mkdirSync(resolve(REPO_ROOT, "artifacts"), { recursive: true });
    writeFileSync(proposalPath, `${body.trim()}\n`, "utf8");
    writeFileSync(
      planPath,
      `${JSON.stringify({ ...plan, planDigest: validation.planDigest }, null, 2)}\n`,
      "utf8",
    );
    emit(
      "Plan proposal persisted locally at artifacts/plan-proposal.md and artifacts/plan.json. " +
        "No branch, push, or pull request was created. A human may publish it explicitly with " +
        "`npm run plan:publish -- --file artifacts/plan-proposal.md`, then approve the plan-only pull request.",
    );
  } catch (error) {
    emit(`Plan not persisted: ${error.message}. Owner state was not released.`, true);
  } finally {
    releaseWorkspaceClaim(claim);
  }
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  await main();
}
