import {
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const REPO_ROOT = resolve(import.meta.dirname, "..");
const ALLOWED = new Set([
  "unit-junit.xml",
  "acceptance-junit.xml",
  "dependency-audit.json",
  "governance-report.json",
  "merge-report.json",
  "codeql",
]);
const IGNORED = [
  "checks/**",
  "task-contract.json",
  "plan.json",
  "approved-plan.json",
  "scope-report.json",
  "repository-controls-report.json",
  "validation-authority-report.json",
];
const MAINTENANCE_ALLOWED = [
  "task-contract.json",
  "candidate-plan.json",
  "approved-plan.json",
  "unit-junit.xml",
  "acceptance-junit.xml",
  "dependency-audit.json",
  "governance-report.json",
  "repository-controls-report.json",
  "merge-report.json",
  "scope-report.json",
  "validation-authority-report.json",
  "report.json",
  "maintenance-manifest.json",
  "checks/**",
  "codeql/**",
];

function normalized(path) {
  return path.replace(/\\/g, "/");
}

function allowed(path) {
  return [...ALLOWED].some(
    (entry) => path === entry || path.startsWith(`${entry}/`),
  );
}

function ignored(path) {
  return IGNORED.some((pattern) => {
    if (pattern.endsWith("/**")) {
      const prefix = pattern.slice(0, -3);
      return path === prefix || path.startsWith(`${prefix}/`);
    }
    return path === pattern;
  });
}

function matchesList(path, patterns) {
  return patterns.some((pattern) => {
    if (pattern.endsWith("/**")) {
      const prefix = pattern.slice(0, -3);
      return path === prefix || path.startsWith(`${prefix}/`);
    }
    return path === pattern;
  });
}

function filesUnder(root) {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(root, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`Evidence artifact contains a symbolic link: ${path}`);
    }
    return entry.isDirectory() ? filesUnder(path) : [path];
  });
}

export function importEvidenceArtifacts(
  source,
  destination = REPO_ROOT,
  options = {},
) {
  const sourceRoot = resolve(source);
  const imported = [];
  const unexpected = [];
  for (const file of filesUnder(sourceRoot)) {
    if (!lstatSync(file).isFile()) continue;
    const path = normalized(relative(sourceRoot, file));
    const logicalPath = path.startsWith("artifacts/")
      ? path.slice("artifacts/".length)
      : path;
    if (options.maintenance && matchesList(logicalPath, MAINTENANCE_ALLOWED)) {
      const target = resolve(destination, "artifacts", logicalPath);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, readFileSync(file));
      imported.push(`artifacts/${logicalPath}`);
      continue;
    }
    if (ignored(logicalPath)) {
      continue;
    }
    if (!allowed(logicalPath)) {
      unexpected.push(path);
      continue;
    }
    const target = resolve(destination, "artifacts", logicalPath);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, readFileSync(file));
    imported.push(`artifacts/${logicalPath}`);
  }
  if (unexpected.length > 0) {
    throw new Error(
      `Downloaded evidence contained unexpected paths: ${unexpected.join(", ")}`,
    );
  }
  return imported;
}

function valueOf(flag) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  const source = valueOf("--from");
  if (!source) {
    process.stderr.write("Pass --from <download-directory>.\n");
    process.exit(2);
  }
  try {
    const imported = importEvidenceArtifacts(source, REPO_ROOT, {
      maintenance: process.argv.includes("--maintenance"),
    });
    process.stdout.write(
      `imported ${imported.length} allowlisted evidence file(s)\n`,
    );
  } catch (error) {
    process.stderr.write(`${/** @type {Error} */ (error).message}\n`);
    process.exit(1);
  }
}
