import { resolveTask } from "./resolve-task.mjs";
import { copyFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const REPO_ROOT = resolve(import.meta.dirname, "..");

function valueOf(flag) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

const issue = valueOf("--issue");
if (!issue) {
  process.stderr.write("Pass --issue <number>.\n");
  process.exit(2);
}

try {
  const expectedPath = valueOf("--expected-plan");
  const expected = expectedPath
    ? JSON.parse(readFileSync(resolve(REPO_ROOT, expectedPath), "utf8"))
    : null;
  const { contract, plan } = resolveTask(Number(issue));
  if (!plan) {
    process.stderr.write(
      `No human-approved plan matches ${contract.id}. Implementation remains blocked.\n`,
    );
    process.exit(1);
  }
  const approved = JSON.parse(
    readFileSync(resolve(REPO_ROOT, "artifacts/plan.json"), "utf8"),
  );
  if (expected && expected.planDigest !== approved.planDigest) {
    process.stderr.write(
      "The implementation pull request plan does not match the human-approved plan digest.\n",
    );
    process.exit(1);
  }
  copyFileSync(
    resolve(REPO_ROOT, "artifacts/plan.json"),
    resolve(REPO_ROOT, "artifacts/approved-plan.json"),
  );
  process.stdout.write(
    `approved plan for ${contract.id} cached at artifacts/task-plan.md and artifacts/approved-plan.json\n`,
  );
} catch (error) {
  process.stderr.write(`${/** @type {Error} */ (error).message}\n`);
  process.exit(1);
}
