import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const REPO_ROOT = resolve(import.meta.dirname, "..");

export const SECRET_PATTERNS = [
  { id: "github-token", pattern: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b/g },
  { id: "github-fine-grained-token", pattern: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g },
  { id: "aws-access-key", pattern: /\bAKIA[0-9A-Z]{16}\b/g },
  {
    id: "private-key",
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
  },
  { id: "openai-key", pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/g },
];

export function scanText(text, file = "<memory>") {
  const findings = [];
  for (const { id, pattern } of SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of String(text).matchAll(pattern)) {
      const prefix = String(text).slice(0, match.index);
      findings.push({
        id,
        file,
        line: prefix.split(/\r?\n/).length,
      });
    }
  }
  return findings;
}

export function scanTrackedFiles(files, { root = REPO_ROOT, read = (file) => readFileSync(file, "utf8") } = {}) {
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error("No source files were supplied; no secret scan was verified.");
  }
  const findings = [];
  const errors = [];
  for (const file of [...new Set(files)]) {
    try {
      if (typeof file !== "string" || !file.trim()) throw new Error("Invalid source path.");
      const absolute = resolve(root, file);
      const path = relative(root, absolute);
      if (!path || isAbsolute(path) || path === ".." || path.startsWith(`..${sep}`)) {
        throw new Error("Source path is outside the repository.");
      }
      let cursor = resolve(root);
      for (const part of path.split(sep)) {
        cursor = join(cursor, part);
        if (lstatSync(cursor).isSymbolicLink()) throw new Error("Symbolic links are not source scan inputs.");
      }
      if (!lstatSync(absolute).isFile()) throw new Error("Source path is not a regular file.");
      findings.push(...scanText(read(absolute), file));
    } catch (error) {
      errors.push(new Error(`Secret scan could not read ${file} (${error.code ?? error.name}).`));
    }
  }
  if (errors.length > 0) {
    throw new AggregateError(errors, `Secret scan incomplete: ${errors.length} unreadable or invalid input(s); ${findings.length} finding(s) in readable inputs.`);
  }
  return findings;
}

function main() {
  const raw = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    {
    cwd: REPO_ROOT,
    encoding: "utf8",
    },
  );
  const files = raw.split("\0").filter(Boolean);
  const findings = scanTrackedFiles(files);
  if (findings.length > 0) {
    for (const finding of findings) {
      process.stderr.write(
        `${finding.id}: ${finding.file}:${finding.line}\n`,
      );
    }
    process.exit(1);
  }
  process.stdout.write(`secret scan passed: ${files.length} source files\n`);
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`Secret scan failed: ${error.message}\n`);
    if (error instanceof AggregateError) {
      for (const failure of error.errors) process.stderr.write(`${failure.message}\n`);
    }
    process.exitCode = 1;
  }
}
