import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const REPO_ROOT = resolve(import.meta.dirname, "..");

export function runGitHub(args, { token } = {}) {
  const env = { ...process.env };
  if (token) {
    env.GH_TOKEN = token;
  } else if (!env.GH_TOKEN && env.GITHUB_COPILOT_GIT_TOKEN) {
    env.GH_TOKEN = env.GITHUB_COPILOT_GIT_TOKEN;
  }
  return execFileSync("gh", args, {
    cwd: REPO_ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env,
  });
}

export function githubJson(route, { run = runGitHub } = {}) {
  return JSON.parse(run(["api", route]));
}

export function githubPages(route, { run = runGitHub } = {}) {
  const pages = JSON.parse(run(["api", "--paginate", "--slurp", route]));
  if (!Array.isArray(pages) || !pages.every(Array.isArray)) {
    throw new Error(`Expected paginated GitHub arrays for ${route}.`);
  }
  return pages.flat();
}
