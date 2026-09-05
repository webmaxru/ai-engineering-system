import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { matchesPattern } from "./task-contract.mjs";

const REPO_ROOT = resolve(import.meta.dirname, "..");
const AUTHORITY_PATHS = [
  ".github/workflows/**",
  ".github/governance/**",
  ".github/hooks/**",
  ".github/agents/**",
  ".github/instructions/**",
  "scripts/**",
  "package.json",
  "package-lock.json",
  "eslint.config.js",
  "tsconfig.json",
  "tsconfig.build.json",
  "vitest.config.ts",
];

export function evaluateValidationAuthority(paths) {
  const changedAuthority = [...new Set(paths)].filter((path) =>
    AUTHORITY_PATHS.some((pattern) => matchesPattern(path, pattern)),
  );
  return {
    ok: changedAuthority.length === 0,
    authorityPaths: AUTHORITY_PATHS,
    changedAuthority,
  };
}

function valueOf(flag) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

function main() {
  const pr = valueOf("--pr");
  if (!pr) {
    process.stderr.write("Pass --pr <number>.\n");
    process.exit(2);
  }
  try {
    const expectedHead = valueOf("--expected-head");
    const before = JSON.parse(
      execFileSync(
        "gh",
        ["pr", "view", pr, "--json", "changedFiles,headRefOid"],
        { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
      ),
    );
    if (expectedHead && before.headRefOid !== expectedHead) {
      throw new Error(
        `Pull request head ${before.headRefOid} does not match expected workflow SHA ${expectedHead}.`,
      );
    }
  const pages = JSON.parse(
    execFileSync(
      "gh",
      [
        "api",
        "--paginate",
        "--slurp",
        `repos/{owner}/{repo}/pulls/${pr}/files`,
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    ),
  );
  const files = pages.flat();
  if (files.length !== before.changedFiles) {
    throw new Error(
      `Pull request file list is incomplete: API returned ${files.length} of ${before.changedFiles} changed files.`,
    );
  }
  const paths = [
    ...new Set(
      files.flatMap((file) =>
        [file.previous_filename, file.filename].filter(Boolean),
      ),
    ),
  ];
  const after = JSON.parse(
    execFileSync(
      "gh",
      ["pr", "view", pr, "--json", "headRefOid"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    ),
  );
  if (expectedHead && after.headRefOid !== expectedHead) {
    throw new Error(
      `Pull request head changed during validation-authority evaluation: expected ${expectedHead}, found ${after.headRefOid}.`,
    );
  }
  const result = evaluateValidationAuthority(paths);
  const report = {
    schema: "northstar/validation-authority-report/1",
    pullRequest: Number(pr),
    headSha: before.headRefOid,
    ...result,
    generatedAt: new Date().toISOString(),
    note:
      result.changedAuthority.length === 0
        ? "The pull request does not modify the workflow or validation authority that judges it."
        : "This pull request changes its own validation authority. Merge requires an external bootstrap review; it cannot self-certify ready_for_acceptance.",
  };
  const target = resolve(
    REPO_ROOT,
    "artifacts/validation-authority-report.json",
  );
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  process.stdout.write(
    `${report.ok ? "pass" : "fail"}: ${report.note}\n${target}\n`,
  );
  // Exit 3 means the check ran successfully and found a control-plane change.
  // Exit 1 remains reserved for operational or input failures.
  process.exit(report.ok ? 0 : 3);
  } catch (error) {
    process.stderr.write(`${/** @type {Error} */ (error).message}\n`);
    process.exit(1);
  }
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  main();
}
