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
import { loadTaskContract } from "./task-contract.mjs";

const REPO_ROOT = resolve(import.meta.dirname, "..");

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

function emit(systemMessage) {
  process.stdout.write(`${JSON.stringify({ systemMessage }, null, 2)}\n`);
}

async function main() {
  const raw = (await readStdin()).trim();
  let input;
  try {
    input = raw ? JSON.parse(raw) : {};
  } catch {
    input = {};
  }

  if (input.stop_hook_active) {
    return;
  }

  const contract = loadTaskContract();
  if (!contract) {
    emit(
      "Plan not persisted: no task contract is active, so there is nowhere durable to put it. " +
        "Run /plan <issue>, then node scripts/publish-plan.mjs --file <plan.md>.",
    );
    return;
  }

  let body = null;
  if (input.transcript_path) {
    try {
      body = extractPlan(readFileSync(input.transcript_path, "utf8"));
    } catch {
      body = null;
    }
  }

  if (!body) {
    emit(
      "Plan not persisted: the session transcript could not be read, so no pull request was opened. " +
        "The plan currently exists only in this chat. Save it and run: " +
        "node scripts/publish-plan.mjs --file <plan.md>",
    );
    return;
  }

  const plan = extractPlanContract(body);
  const validation = validatePlanContract(plan, contract);
  if (!validation.ok) {
    emit(
      `Plan not persisted: ${validation.errors.join(" ")} ` +
        "Return a complete northstar/plan/1 contract and stop again.",
    );
    return;
  }

  const proposalPath = resolve(REPO_ROOT, "artifacts/plan-proposal.md");
  const planPath = resolve(REPO_ROOT, "artifacts/plan.json");
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
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  await main();
}
