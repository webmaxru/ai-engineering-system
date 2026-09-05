import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const REPO_ROOT = resolve(import.meta.dirname, "..");
export const CHECK_SCHEMA = "northstar/check-evidence/1";
export const CHECK_STATUSES = Object.freeze([
  "pass",
  "fail",
  "skipped",
  "not-run",
]);

function gitHead() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

function filesUnder(path) {
  if (!existsSync(path)) return [];
  if (!statSync(path).isDirectory()) return [path];
  return readdirSync(path)
    .sort()
    .flatMap((entry) => filesUnder(join(path, entry)));
}

export function digestPath(relativePath) {
  if (!relativePath) return null;
  const absolute = resolve(REPO_ROOT, relativePath);
  const files = filesUnder(absolute);
  if (files.length === 0) return null;
  const hash = createHash("sha256");
  for (const file of files) {
    hash.update(file.slice(absolute.length));
    hash.update(readFileSync(file));
  }
  return hash.digest("hex");
}

export function createCheckRecord(input, env = process.env) {
  if (!input.id || !CHECK_STATUSES.includes(input.status)) {
    throw new Error("Check evidence requires an id and a valid status.");
  }
  const artifact = input.artifact ?? null;
  return {
    schema: CHECK_SCHEMA,
    id: input.id,
    category: input.category ?? "execution result",
    status: input.status,
    required: input.required !== false,
    summary: input.summary ?? "",
    artifact,
    artifactDigest: digestPath(artifact),
    producedAt: input.producedAt ?? new Date().toISOString(),
    provenance: {
      repository: env.GITHUB_REPOSITORY ?? "local",
      workflow: env.GITHUB_WORKFLOW ?? "local",
      job: env.NORTHSTAR_JOB_ID ?? env.GITHUB_JOB ?? "local",
      event: env.GITHUB_EVENT_NAME ?? "local",
      runId: env.NORTHSTAR_RUN_ID ?? env.GITHUB_RUN_ID ?? null,
      runAttempt: env.GITHUB_RUN_ATTEMPT ?? null,
      actor: env.GITHUB_ACTOR ?? "local",
      pullRequest: env.PR_NUMBER ? Number(env.PR_NUMBER) : null,
      headSha: env.NORTHSTAR_HEAD_SHA ?? env.GITHUB_SHA ?? gitHead(),
      baseSha: env.BASE_SHA ?? null,
    },
  };
}

export function writeCheckRecord(record, out) {
  const target = resolve(
    REPO_ROOT,
    out ?? `artifacts/checks/${record.id}.json`,
  );
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  return target;
}

function valueOf(flag) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

function main() {
  const id = valueOf("--id");
  const status = valueOf("--status");
  if (!id || !status) {
    process.stderr.write(
      "Pass --id <check> --status <pass|fail|skipped|not-run>.\n",
    );
    process.exit(2);
  }
  const record = createCheckRecord(
    {
      id,
      status,
      category: valueOf("--category"),
      summary: valueOf("--summary"),
      artifact: valueOf("--artifact"),
      required: !process.argv.includes("--optional"),
    },
    {
      ...process.env,
      NORTHSTAR_JOB_ID: valueOf("--job"),
    },
  );
  const target = writeCheckRecord(record, valueOf("--out"));
  process.stdout.write(
    `${record.id}=${record.status} sha=${record.provenance.headSha ?? "unknown"} artifact=${record.artifact ? basename(record.artifact) : "none"}\n${target}\n`,
  );
  if (record.status === "fail") {
    process.exitCode = 1;
  }
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  main();
}
