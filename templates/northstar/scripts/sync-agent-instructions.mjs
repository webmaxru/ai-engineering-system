/**
 * Generate .github/copilot-instructions.md from AGENTS.md.
 *
 * AGENTS.md is the vendor-neutral convention and the only file authored by
 * hand. GitHub's support matrix shows agent instructions are not read by every
 * Copilot surface yet - notably Copilot Chat on GitHub.com, and Chat or code
 * review in Visual Studio, JetBrains, Eclipse, and Xcode - so a repository-wide
 * instructions file still has to exist for those.
 *
 * Generating it keeps one source of truth. Two hand-maintained files saying the
 * same thing is how durable context drifts.
 *
 * Usage:
 *   node scripts/sync-agent-instructions.mjs           # write
 *   node scripts/sync-agent-instructions.mjs --check   # exit 1 if stale
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const REPO_ROOT = resolve(import.meta.dirname, "..");
const SOURCE = "AGENTS.md";
const TARGET = ".github/copilot-instructions.md";

const HEADER = [
  "<!--",
  "  GENERATED FILE - DO NOT EDIT.",
  "",
  "  Source: AGENTS.md",
  "  Regenerate: npm run instructions:sync",
  "",
  "  AGENTS.md is the vendor-neutral convention and the only file authored by",
  "  hand. This copy exists because some Copilot surfaces do not read AGENTS.md",
  "  yet. See the support matrix:",
  "  https://docs.github.com/en/copilot/reference/custom-instructions-support",
  "-->",
  "",
].join("\n");

export function render(source) {
  return `${HEADER}${source.replace(/\r\n?/g, "\n").trimEnd()}\n`;
}

const sourceText = readFileSync(resolve(REPO_ROOT, SOURCE), "utf8");
const expected = render(sourceText);
const targetPath = resolve(REPO_ROOT, TARGET);

if (process.argv.includes("--check")) {
  let actual;
  try {
    actual = readFileSync(targetPath, "utf8").replace(/\r\n?/g, "\n");
  } catch {
    actual = "";
  }
  if (actual !== expected) {
    process.stderr.write(
      `${TARGET} is out of date with ${SOURCE}. Run: npm run instructions:sync\n`,
    );
    process.exit(1);
  }
  process.stdout.write(`${TARGET} is in sync with ${SOURCE}\n`);
} else {
  writeFileSync(targetPath, expected, "utf8");
  process.stdout.write(`wrote ${TARGET} from ${SOURCE}\n`);
}
