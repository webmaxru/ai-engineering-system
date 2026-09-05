import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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

export function scanTrackedFiles(files) {
  return files.flatMap((file) => {
    try {
      return scanText(readFileSync(resolve(REPO_ROOT, file), "utf8"), file);
    } catch {
      return [];
    }
  });
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
  main();
}
