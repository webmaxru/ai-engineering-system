import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.argv[2];
if (!root) {
  console.error("Usage: node scripts/check-sarif.mjs <directory>");
  process.exit(2);
}

function findSarifFiles(directory) {
  return readdirSync(directory).flatMap((entry) => {
    const fullPath = join(directory, entry);
    return statSync(fullPath).isDirectory()
      ? findSarifFiles(fullPath)
      : fullPath.endsWith(".sarif")
        ? [fullPath]
        : [];
  });
}

const files = findSarifFiles(root);
if (files.length === 0) {
  console.error(`No SARIF files found under ${root}`);
  process.exit(1);
}

const findings = [];
for (const file of files) {
  const sarif = JSON.parse(readFileSync(file, "utf8"));
  for (const run of sarif.runs ?? []) {
    for (const result of run.results ?? []) {
      findings.push({
        file,
        level: result.level ?? "warning",
        ruleId: result.ruleId ?? "unknown-rule",
        message: result.message?.text ?? "No message",
      });
    }
  }
}

if (findings.length > 0) {
  for (const finding of findings.slice(0, 20)) {
    console.error(`${finding.level} ${finding.ruleId}: ${finding.message}`);
  }
  console.error(`CodeQL produced ${findings.length} finding(s).`);
  process.exit(1);
}

console.log(`CodeQL gate passed: ${files.length} SARIF file(s), 0 findings.`);

