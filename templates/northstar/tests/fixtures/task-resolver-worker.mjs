import { createHash } from "node:crypto";
import process from "node:process";
import { resolveTask } from "../../scripts/resolve-task.mjs";

const issue = Number(process.env.TASK_ISSUE);
const taskId = process.env.TASK_ID;
const sessionId = process.env.TEST_SESSION_ID;
const digest = createHash("sha256").update(`${issue}:${taskId}`).digest("hex");
if (!Number.isSafeInteger(issue) || issue < 1 || !taskId || !sessionId) {
  throw new Error("Task resolver worker inputs are incomplete.");
}

const contract = {
  schema: "northstar/task-contract/3",
  id: taskId,
  source: {
    kind: `issue #${issue}`,
    issue,
    url: `https://github.com/fixture/northstar/issues/${issue}`,
    actor: "fixture-owner",
    association: "OWNER",
    trusted: true,
    bodyDigest: digest,
  },
  inputs: {
    goal: "Concurrent resolver fixture.",
    scope: { allowed: [], prohibited: [] },
    constraints: [],
    nonGoals: [],
    authoritativeSources: [],
  },
  successCriteria: [{ id: "AC1", statement: "Fixture.", provenBy: "fixture test" }],
  stopConditions: [],
};

const result = resolveTask(issue, {
  root: process.env.TASK_WORKTREE_ROOT,
  role: "plan",
  sessionId,
  cloud: false,
  readContract: () => contract,
  readApprovedPlan: () => null,
});
process.stdout.write(JSON.stringify({
  approvalState: result.approvalState,
  taskId: result.contract.id,
  sessionId,
}));
