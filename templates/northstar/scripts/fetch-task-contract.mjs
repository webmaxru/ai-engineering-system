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

import { cacheContract, contractFromFile, contractFromIssue } from "./task-contract.mjs";

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
try {
  contract = issue ? contractFromIssue(issue) : contractFromFile(file);
} catch (error) {
  process.stderr.write(`${/** @type {Error} */ (error).message}\n`);
  process.exit(1);
}

const target = cacheContract(contract);

process.stdout.write(
  [
    `task=${contract.id}`,
    `source=${contract.source.kind}`,
    `scope=${contract.inputs.scope.allowed.join(" ")}`,
    `criteria=${contract.successCriteria.length}`,
  ].join("  ") + `\n${target}\n`,
);
