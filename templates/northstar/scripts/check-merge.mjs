import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const REPO_ROOT = resolve(import.meta.dirname, "..");

function valueOf(flag) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

export function checkMerge(base, { run = execFileSync } = {}) {
  try {
    const output = run(
      "git",
      ["merge-tree", "--write-tree", base, "HEAD"],
      {
        cwd: REPO_ROOT,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    return { ok: true, tree: String(output).trim(), message: "mergeable" };
  } catch (error) {
    return {
      ok: false,
      tree: null,
      message: `${error.stdout ?? ""}\n${error.stderr ?? ""}`.trim() ||
        /** @type {Error} */ (error).message,
    };
  }
}

function main() {
  const base = valueOf("--base") ?? process.env.GITHUB_BASE_REF;
  if (!base) {
    process.stderr.write("Pass --base <branch-or-sha>.\n");
    process.exit(2);
  }
  const baseRef = /^[0-9a-f]{40}$/i.test(base) || base.includes("/")
    ? base
    : `origin/${base}`;
  const result = checkMerge(baseRef);
  const report = {
    schema: "northstar/merge-report/1",
    base: baseRef,
    generatedAt: new Date().toISOString(),
    ...result,
  };
  const out = valueOf("--out") ?? "artifacts/merge-report.json";
  const target = resolve(REPO_ROOT, out);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  process.stdout.write(
    `merge=${result.ok ? "pass" : "fail"} base=${baseRef}\n${target}\n`,
  );
  if (!result.ok) process.exitCode = 1;
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  main();
}
