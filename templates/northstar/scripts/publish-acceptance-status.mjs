import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const REPO_ROOT = resolve(import.meta.dirname, "..");
const report = JSON.parse(
  readFileSync(resolve(REPO_ROOT, "artifacts/report.json"), "utf8"),
);
const sha = process.env.NORTHSTAR_HEAD_SHA;
if (!sha) {
  process.stderr.write("NORTHSTAR_HEAD_SHA is required.\n");
  process.exit(2);
}

const ready = report.decision === "ready_for_acceptance";
const targetUrl =
  process.env.GITHUB_SERVER_URL &&
  process.env.GITHUB_REPOSITORY &&
  process.env.GITHUB_RUN_ID
    ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
    : undefined;
const args = [
  "api",
  "--method",
  "POST",
  `repos/{owner}/{repo}/statuses/${sha}`,
  "-f",
  `state=${ready ? "success" : "failure"}`,
  "-f",
  "context=trusted-acceptance",
  "-f",
  `description=${ready ? "Hosted evidence is ready for acceptance" : "Hosted evidence is incomplete or failed"}`,
];
if (targetUrl) {
  args.push("-f", `target_url=${targetUrl}`);
}
execFileSync("gh", args, { stdio: "inherit" });
process.exit(0);
