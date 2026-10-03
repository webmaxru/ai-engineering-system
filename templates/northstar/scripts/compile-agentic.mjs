import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { stripVTControlCharacters } from "node:util";
import { pathToFileURL } from "node:url";
import { validateSarif } from "./check-sarif.mjs";

const REPO_ROOT = resolve(import.meta.dirname, "..");
// CUSTOMIZE only after reviewing the compiler release and generated diff together.
const COMPILER_VERSION = "v0.81.6";
const ACTION_REVISION = "eed4304d8740f0593f2797276cb8299d228ffd9b";
const POUTINE_IMAGE = "ghcr.io/boostsecurityio/poutine@sha256:722a8e0999b583c1540fe2974e691032b2d9d21b9256a17965132b6bfd0081b0";

export function compilationResult(result) {
  const output = stripVTControlCharacters(`${result.stdout ?? ""}\n${result.stderr ?? ""}`);
  const diagnosticFailure = /(?:^|\n)\s*(?:[✗✘×]\s*)?(?:error|fatal)(?::|\s|\[)|:\d+:\d+:\s*error:|\b[1-9]\d*\s+errors?\b|\berrors?\s*:\s*[1-9]\d*|\blevel[=:]\s*(?:error|fatal)\b/im.test(output);
  if (result.error || result.status !== 0 || diagnosticFailure) {
    return { ok: false, reason: "Agentic workflow compilation or a security scanner failed; a zero exit code does not override error diagnostics." };
  }
  return { ok: true, reason: "The command completed without error diagnostics." };
}

function workflowDigest() {
  const files = [];
  const collect = (directory) => {
    for (const entry of readdirSync(resolve(REPO_ROOT, directory), { withFileTypes: true })) {
      const file = `${directory}/${entry.name}`;
      if (entry.isSymbolicLink()) throw new Error("Scanner input contains a symbolic link.");
      if (entry.isDirectory()) collect(file);
      else if (entry.isFile()) files.push(file);
    }
  };
  collect(".github");
  if (existsSync(resolve(REPO_ROOT, ".poutine.yml"))) files.push(".poutine.yml");
  const hash = createHash("sha256");
  for (const file of files.sort()) hash.update(file).update(readFileSync(resolve(REPO_ROOT, file)));
  return hash.digest("hex");
}

function main() {
  const version = spawnSync("gh", ["aw", "--version"], { cwd: REPO_ROOT, encoding: "utf8", timeout: 30_000 });
  if (version.error || version.status !== 0 ||
      !new RegExp(`\\b${COMPILER_VERSION.replaceAll(".", "\\.")}\\b`).test(`${version.stdout ?? ""}\n${version.stderr ?? ""}`)) {
    throw new Error(`Install the reviewed gh-aw ${COMPILER_VERSION} compiler before validation.`);
  }
  const result = spawnSync("gh", [
    "aw", "compile", "daily-repository-status", "--validate", "--strict",
    "--action-mode", "release", "--action-tag", ACTION_REVISION,
    "--no-check-update",
  ], { cwd: REPO_ROOT, encoding: "utf8", timeout: 300_000, maxBuffer: 8 * 1024 * 1024 });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  const outcome = compilationResult(result);
  if (!outcome.ok) {
    if (result.error) process.stderr.write(`Compiler/scanner process error: ${result.error.code ?? result.error.message}\n`);
    else if (result.status !== 0) process.stderr.write(`Compiler/scanner exit status: ${result.status}\n`);
    process.stderr.write(`${outcome.reason}\n`);
    process.exitCode = 1;
    return;
  }
  const artifact = resolve(REPO_ROOT, "artifacts/poutine.sarif");
  const reportPath = resolve(REPO_ROOT, "artifacts/poutine-report.json");
  mkdirSync(resolve(REPO_ROOT, "artifacts"), { recursive: true });
  rmSync(artifact, { force: true });
  rmSync(reportPath, { force: true });
  const sourceDigest = workflowDigest();
  const configMount = existsSync(resolve(REPO_ROOT, ".poutine.yml"))
    ? ["-v", `${resolve(REPO_ROOT, ".poutine.yml")}:/scan/.poutine.yml:ro`] : [];
  // Scan the whole GitHub control plane, not installed dependencies or inert test fixtures.
  const scanner = spawnSync("docker", [
    "run", "--rm", "--network=none",
    "-v", `${resolve(REPO_ROOT, ".github")}:/scan/.github:ro`,
    ...configMount, "-w", "/scan", POUTINE_IMAGE,
    "--disable-version-check", "--fail-on-violation", "--format", "sarif",
    "analyze_local", "/scan",
  ], { cwd: REPO_ROOT, encoding: "utf8", timeout: 180_000, maxBuffer: 16 * 1024 * 1024 });
  if (scanner.stderr) process.stderr.write(scanner.stderr);
  let sarif;
  try {
    sarif = JSON.parse(scanner.stdout || "");
  } catch {
    process.stderr.write("Poutine did not produce valid SARIF JSON.\n");
    writeFileSync(reportPath, `${JSON.stringify({
      ok: false, image: POUTINE_IMAGE, sourceDigest, exitCode: scanner.status,
      processError: scanner.error?.code ?? null, errors: ["Poutine did not produce valid SARIF JSON."],
    }, null, 2)}\n`);
    process.exitCode = 1;
    return;
  }
  writeFileSync(artifact, scanner.stdout, "utf8");
  const validation = validateSarif(sarif, artifact);
  const ok = !scanner.error && scanner.status === 0 && validation.ok &&
    validation.tools.some(({ name }) => /poutine/i.test(name)) &&
    workflowDigest() === sourceDigest;
  const report = {
    ...validation,
    ok, image: POUTINE_IMAGE, sourceDigest, artifact: "artifacts/poutine.sarif",
    exitCode: scanner.status, processError: scanner.error?.code ?? null,
    errors: [
      ...validation.errors,
      ...(scanner.error || scanner.status !== 0 ? ["Poutine failed to complete successfully."] : []),
      ...(workflowDigest() !== sourceDigest ? ["Workflow sources changed during scanning."] : []),
      ...(!validation.tools.some(({ name }) => /poutine/i.test(name)) ? ["Poutine tool identity is missing from SARIF."] : []),
    ],
  };
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!ok) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
