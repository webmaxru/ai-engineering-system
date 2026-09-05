import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const REPO_ROOT = resolve(import.meta.dirname, "..");

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

const manifest = {
  schema: "northstar/system-maintenance-manifest/1",
  repository: required("GITHUB_REPOSITORY"),
  pullRequest: Number(required("PR_NUMBER")),
  headSha: required("NORTHSTAR_HEAD_SHA"),
  sourceRunId: Number(required("NORTHSTAR_RUN_ID")),
  evidenceRunId: Number(required("GITHUB_RUN_ID")),
  sourceWorkflow: ".github/workflows/governed-change.yml",
  evidenceWorkflow: ".github/workflows/publish-evidence.yml",
  generatedAt: new Date().toISOString(),
};

const target = resolve(REPO_ROOT, "artifacts/maintenance-manifest.json");
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
process.stdout.write(`${target}\n`);
