/**
 * Resolve the task contract from its issue and cache it for the gates.
 *
 * Usage:
 *   node scripts/fetch-task-contract.mjs --issue 12
 *   node scripts/fetch-task-contract.mjs --file tests/fixtures/WI-1842.issue.md
 *
 * The issue is the contract. A fixture file is accepted only for offline tests
 * and demos; the resolved contract records that it is not trusted authority.
 */

import { CONTRACT_CACHE, contractFromFile } from "./task-contract.mjs";
import { resolveTask } from "./resolve-task.mjs";
import { resolve } from "node:path";

function valueOf(flag) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

const issue = valueOf("--issue");
const file = valueOf("--file");

if (!issue && !file) {
  process.stderr.write(
    "Pass --issue <number> to read the live issue, or --file <path> to use an offline fixture.\n",
  );
  process.exit(2);
}

let contract;
let target;
try {
  if (issue) {
    const result = resolveTask(Number(issue), {
      sessionId: valueOf("--session-id") ??
        process.env.COPILOT_SESSION_ID ??
        process.env.COPILOT_SESSION_UUID ??
        process.env.COPILOT_AGENT_SESSION_ID ??
        null,
    });
    contract = result.contract;
    target = resolve(import.meta.dirname, "..", CONTRACT_CACHE);
  } else {
    contract = contractFromFile(file);
    target = null;
  }
} catch (error) {
  process.stderr.write(`${/** @type {Error} */ (error).message}\n`);
  process.exit(1);
}

process.stdout.write(
  [
    `task=${contract.id}`,
    `source=${contract.source.kind}`,
    `scope=${contract.inputs.scope.allowed.join(" ")}`,
    `criteria=${contract.successCriteria.length}`,
  ].join("  ") + `\n${target ?? "offline fixture parsed only; untrusted fixture was not cached"}\n`,
);
