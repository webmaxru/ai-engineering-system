import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export function selectWorkflowPullRequest({
  pulls,
  sha,
  repository,
  defaultBranch,
  expectedNumber,
}) {
  const matches = (pulls ?? []).filter(
    (pull) =>
      pull.state === "open" &&
      pull.head?.sha === sha &&
      pull.head?.repo?.full_name === repository &&
      pull.base?.repo?.full_name === repository &&
      pull.base?.ref === defaultBranch &&
      (!expectedNumber || Number(pull.number) === Number(expectedNumber)),
  );
  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly one open same-repository pull request for ${sha} targeting ${defaultBranch}; found ${matches.length}.`,
    );
  }
  return matches[0];
}

function gh(args) {
  return JSON.parse(
    execFileSync("gh", ["api", ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }),
  );
}

function valueOf(flag) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

function main() {
  const sha = valueOf("--sha");
  const repository = process.env.GITHUB_REPOSITORY;
  if (!sha || !repository) {
    process.stderr.write("--sha and GITHUB_REPOSITORY are required.\n");
    process.exit(2);
  }
  try {
    const repo = gh([`repos/${repository}`]);
    const pulls = gh([
      `repos/${repository}/commits/${sha}/pulls`,
      "-H",
      "Accept: application/vnd.github+json",
    ]);
    const pull = selectWorkflowPullRequest({
      pulls,
      sha,
      repository,
      defaultBranch: repo.default_branch,
      expectedNumber: process.env.PR_NUMBER,
    });
    if (process.env.GITHUB_ENV) {
      appendFileSync(
        process.env.GITHUB_ENV,
        `PR_NUMBER=${pull.number}\nBASE_BRANCH=${pull.base.ref}\n`,
        "utf8",
      );
    }
    if (process.env.GITHUB_OUTPUT) {
      appendFileSync(
        process.env.GITHUB_OUTPUT,
        `pull_request=${pull.number}\nbase_branch=${pull.base.ref}\n`,
        "utf8",
      );
    }
    process.stdout.write(
      `pull_request=${pull.number} head=${pull.head.sha} base=${pull.base.ref}\n`,
    );
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
