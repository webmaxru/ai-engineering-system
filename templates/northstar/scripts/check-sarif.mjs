import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const REPO_ROOT = resolve(import.meta.dirname, "..");
export const ZIZMOR_VERSION = "1.30.0";
// Audited 1.30.0 image, OCI revision fb814d6687450fc8e0b0fba8d958b1ac40c0647f.
export const ZIZMOR_IMAGE = "ghcr.io/zizmorcore/zizmor@sha256:1ba0035c343f50e85fde29beb0d78e4db448eaa0c762a11a09805d241424ee03";
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const nonempty = (value) => typeof value === "string" && value.trim().length > 0;

function diagnosticMessage(message) {
  return object(message) &&
    (typeof message.text === "string" || typeof message.markdown === "string" || nonempty(message.id)) &&
    (message.text === undefined || typeof message.text === "string") &&
    (message.markdown === undefined || typeof message.markdown === "string") &&
    (message.id === undefined || nonempty(message.id));
}

function regularFiles(path) {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink()) throw new Error("Symbolic links are not security scan inputs.");
  if (stat.isFile()) return [path];
  if (!stat.isDirectory()) throw new Error("Security scan input is not a regular file or directory.");
  return readdirSync(path).sort().flatMap((name) => regularFiles(join(path, name)));
}

function inputError(file, error) {
  return `Security evidence ${file} is unreadable or invalid (${error.code ?? error.name ?? "error"}).`;
}

export function validateSarif(sarif, file = "<memory>") {
  const errors = [];
  const findings = [];
  const tools = [];
  if (!object(sarif) || sarif.version !== "2.1.0" ||
    !Array.isArray(sarif.runs) || sarif.runs.length === 0) {
    return { ok: false, errors: [`${file}: expected a SARIF 2.1.0 log with at least one run.`], findings, tools };
  }
  for (const [index, run] of sarif.runs.entries()) {
    const context = `${file}: run ${index + 1}`;
    const driver = run?.tool?.driver;
    if (!object(run) || !object(driver) || !nonempty(driver.name) || !Array.isArray(run.results)) {
      errors.push(`${context}: tool identity and a results array are required.`);
      continue;
    }
    const version = driver.semanticVersion ?? driver.version;
    if ([driver.version, driver.semanticVersion].some((value) => value !== undefined && !nonempty(value))) {
      errors.push(`${context}: invalid tool version identity.`);
    }
    tools.push({ name: driver.name, version: nonempty(version) ? version : null });
    if (driver.rules !== undefined && (!Array.isArray(driver.rules) ||
      driver.rules.some((rule) => !object(rule) || !nonempty(rule.id)))) {
      errors.push(`${context}: invalid rule descriptors.`);
    }
    if (run.invocations !== undefined) {
      if (!Array.isArray(run.invocations) || run.invocations.length === 0) {
        errors.push(`${context}: invalid invocation evidence.`);
      } else {
        for (const invocation of run.invocations) {
          if (!object(invocation) || invocation.executionSuccessful !== true) {
            errors.push(`${context}: scanner execution was unsuccessful or unverified.`);
            continue;
          }
          for (const field of ["toolExecutionNotifications", "toolConfigurationNotifications"]) {
            if (invocation[field] === undefined) continue;
            if (!Array.isArray(invocation[field]) || invocation[field].some((notice) =>
              !object(notice) || !diagnosticMessage(notice.message) ||
              (notice.level !== undefined && !["none", "note", "warning", "error"].includes(notice.level)))) {
              errors.push(`${context}: malformed scanner diagnostics.`);
            } else if (invocation[field].some(({ level }) => level === "error")) {
              errors.push(`${context}: scanner reported an execution or configuration error.`);
            }
          }
        }
      }
    }
    for (const [resultIndex, result] of run.results.entries()) {
      const at = `${context}, result ${resultIndex + 1}`;
      if (!object(result) || !object(result.message) ||
        ![result.message.text, result.message.markdown, result.message.id].some(nonempty) ||
        (result.level !== undefined && !["none", "note", "warning", "error"].includes(result.level))) {
        errors.push(`${at}: invalid result message or severity.`);
        continue;
      }
      const rule = Number.isSafeInteger(result.ruleIndex) && result.ruleIndex >= 0
        ? driver.rules?.[result.ruleIndex] : null;
      const ruleId = result.ruleId ?? rule?.id;
      if (!nonempty(ruleId) ||
        (result.ruleIndex !== undefined && (!rule || (result.ruleId !== undefined && rule.id !== result.ruleId)))) {
        errors.push(`${at}: missing or inconsistent rule identity.`);
        continue;
      }
      if (result.suppressions !== undefined && (!Array.isArray(result.suppressions) ||
        result.suppressions.some((suppression) => !object(suppression) ||
          !["inSource", "external"].includes(suppression.kind) ||
          (suppression.status !== undefined && !["accepted", "underReview", "rejected"].includes(suppression.status))))) {
        errors.push(`${at}: malformed suppression metadata.`);
      }
      if (result.locations !== undefined && (!Array.isArray(result.locations) ||
        result.locations.some((location) => !object(location) ||
          (location.physicalLocation !== undefined && (
            !object(location.physicalLocation) ||
            !object(location.physicalLocation.artifactLocation) ||
            !nonempty(location.physicalLocation.artifactLocation.uri) ||
            (location.physicalLocation.region?.startLine !== undefined &&
              (!Number.isSafeInteger(location.physicalLocation.region.startLine) || location.physicalLocation.region.startLine < 1))
          ))))) {
        errors.push(`${at}: malformed result locations.`);
      }
      const locations = Array.isArray(result.locations) ? result.locations.flatMap((location) => {
        const physical = location?.physicalLocation;
        if (!nonempty(physical?.artifactLocation?.uri)) return [];
        const line = physical.region?.startLine;
        return [{
          uri: physical.artifactLocation.uri,
          line: Number.isSafeInteger(line) && line > 0 ? line : null,
        }];
      }) : [];
      findings.push({
        file, ruleId, level: result.level ?? "warning",
        suppressed: Array.isArray(result.suppressions) && result.suppressions.length > 0,
        uri: locations[0]?.uri ?? null,
        line: locations[0]?.line ?? null,
        locations,
      });
    }
  }
  return { ok: errors.length === 0 && findings.length === 0, errors, findings, tools };
}

export function checkSarif(path, { read = (file) => readFileSync(file, "utf8") } = {}) {
  const errors = [];
  const findings = [];
  const tools = [];
  let files = [];
  try {
    files = regularFiles(resolve(path)).filter((file) => file.endsWith(".sarif"));
    if (files.length === 0) errors.push("No SARIF files were found; no scan was verified.");
  } catch (error) {
    errors.push(inputError(path, error));
  }
  for (const file of files) {
    try {
      const result = validateSarif(JSON.parse(read(file)), file);
      errors.push(...result.errors);
      findings.push(...result.findings);
      tools.push(...result.tools);
    } catch (error) {
      errors.push(inputError(file, error));
    }
  }
  return { ok: errors.length === 0 && findings.length === 0, files, errors, findings, tools };
}

export function scanWorkflows({
  root = REPO_ROOT,
  spawn = spawnSync,
  read = (file) => readFileSync(file, "utf8"),
} = {}) {
  const errors = [];
  const files = [];
  const suppressionDirectives = [];
  let configuration = null;
  let sourceDigest = null;
  let diagnosticsDigest = null;
  let artifact = null;
  let artifactDigest = null;
  let scannerExitCode = null;
  let exitCode = 1;
  let findings = [];
  const snapshot = () => {
    const hash = createHash("sha256");
    for (const directory of [resolve(root, ".github"), resolve(root, ".github", "workflows")]) {
      if (!lstatSync(directory).isDirectory() || lstatSync(directory).isSymbolicLink()) {
        throw new Error("Workflow directories must be regular in-repository directories.");
      }
    }
    const candidates = regularFiles(resolve(root, ".github", "workflows"))
      .filter((file) => /\.ya?ml$/i.test(file));
    if (candidates.length === 0) throw new Error("No workflow YAML inputs were found.");
    for (const file of candidates) {
      const path = relative(root, file);
      if (isAbsolute(path) || path.startsWith(`..${sep}`)) throw new Error("Workflow input is outside the repository.");
      const content = read(file);
      if (!nonempty(content)) throw new Error(`Workflow ${path} is empty.`);
      hash.update(`${path}\0${content.length}\0${content}`);
    }
    // CUSTOMIZE repository-local zizmor configuration for reviewed exceptions only.
    // Match zizmor's documented discovery order; never inherit machine-wide configuration.
    const configs = [".github/zizmor.yml", ".github/zizmor.yaml", "zizmor.yml", "zizmor.yaml"];
    let selected = null;
    for (const path of configs) {
      const absolute = resolve(root, path);
      let stat;
      try {
        stat = lstatSync(absolute);
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
        continue;
      }
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("Scanner configuration must be a regular file.");
      const content = read(absolute);
      hash.update(`${path}\0${content.length}\0${content}`);
      if (!selected) selected = path;
    }
    return { candidates, configuration: selected, digest: hash.digest("hex") };
  };
  try {
    const artifactDirectory = resolve(root, "artifacts");
    mkdirSync(artifactDirectory, { recursive: true });
    const directoryStat = lstatSync(artifactDirectory);
    if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) {
      throw new Error("Scanner artifact directory must be a regular in-repository directory.");
    }
    const artifactPath = resolve(artifactDirectory, "zizmor.sarif");
    try {
      const stat = lstatSync(artifactPath);
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("Scanner artifact must be a regular file.");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    rmSync(artifactPath, { force: true });
    const before = snapshot();
    configuration = before.configuration;
    sourceDigest = before.digest;
    for (const file of before.candidates) {
      const path = relative(root, file).replace(/\\/g, "/");
      files.push(path);
      for (const [line, text] of read(file).split(/\r?\n/).entries()) {
        const directive = /#\s*zizmor:\s*ignore\[([^\]]+)\]/.exec(text);
        if (directive) suppressionDirectives.push({ file: path, line: line + 1, rules: directive[1].split(",").map((id) => id.trim()) });
      }
    }
    const result = spawn("docker", [
      "run", "--rm", "--pull=never", "--network", "none", "--volume", `${resolve(root)}:/workdir:ro`,
      "--workdir", "/workdir", ZIZMOR_IMAGE,
      "--offline", "--strict-collection", "--format", "sarif", "--color", "never", "--no-progress",
      "--persona", "regular",
      ...(configuration ? ["--config", configuration] : ["--no-config"]),
      ...files,
    ], {
      cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], shell: false,
      timeout: 120000, maxBuffer: 16 * 1024 * 1024,
    });
    const diagnostics = String(result.stderr ?? "");
    diagnosticsDigest = createHash("sha256").update(diagnostics).digest("hex");
    scannerExitCode = result.status;
    const raw = String(result.stdout ?? "");
    if (raw.length > 0) {
      writeFileSync(artifactPath, raw, { encoding: "utf8", flag: "wx" });
      artifact = "artifacts/zizmor.sarif";
      artifactDigest = createHash("sha256").update(raw).digest("hex");
    }
    exitCode = Number.isInteger(result.status) && result.status > 0 ? result.status : 1;
    if (result.error) errors.push(`Workflow scanner could not start or complete (${result.error.code ?? "process error"}).`);
    if (result.signal) errors.push(`Workflow scanner terminated by signal ${result.signal}.`);
    if (result.status !== 0) errors.push(`Workflow scanner exited unsuccessfully (${result.status ?? "no exit status"}).`);
    if (/(?:^|[\s\]])(?:ERROR\b|error(?:\[[^\]]+\])?:|fatal:)|\bWARN(?:ING)?\b[^\n]*(?:fail|skip|unable|cannot|could not)/i.test(diagnostics)) {
      errors.push("Workflow scanner emitted failure diagnostics; a zero exit code is insufficient.");
    }
    let sarif;
    try {
      const document = JSON.parse(raw);
      sarif = validateSarif(document, artifact ?? "zizmor");
      errors.push(...sarif.errors);
      findings = sarif.findings;
      if (sarif.tools.length !== 1 || sarif.tools[0].name !== "zizmor" || sarif.tools[0].version !== ZIZMOR_VERSION) {
        errors.push("Workflow scanner output does not match the reviewed zizmor version.");
      }
      if (!Array.isArray(document?.runs) || document.runs.some((run) =>
        !Array.isArray(run?.invocations) || run.invocations.length === 0)) {
        errors.push("Workflow scanner did not attest successful execution in its SARIF output.");
      }
    } catch {
      errors.push("Workflow scanner did not produce valid SARIF JSON.");
    }
    if (snapshot().digest !== sourceDigest) errors.push("Workflow inputs or configuration changed during the scan.");
    if (errors.length === 0 && findings.length === 0) exitCode = 0;
  } catch (error) {
    errors.push(`Workflow scan failed before validation completed: ${error.code ?? error.message}`);
  }
  return {
    ok: errors.length === 0 && findings.length === 0 && files.length > 0,
    generatedAt: new Date().toISOString(),
    image: ZIZMOR_IMAGE, version: ZIZMOR_VERSION, files, sourceDigest,
    artifact, artifactDigest, scannerExitCode,
    configuration, suppressionDirectives, diagnosticsDigest, findings, errors, exitCode,
    limits: [
      "Offline scanning does not execute network-dependent audits.",
      "SARIF contains emitted findings; regular-persona and configuration suppressions may omit additional findings.",
      "Suppression directives are inventoried, not counted as verified suppressed findings; existing exceptions are not changed.",
      "Raw SARIF can contain source snippets; retain it locally and review before publication.",
    ],
  };
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  if (!process.argv[2]) {
    process.stderr.write("Usage: node scripts/check-sarif.mjs <directory|file.sarif>\n");
    process.exitCode = 2;
  } else {
    const result = checkSarif(process.argv[2]);
    for (const error of result.errors) process.stderr.write(`${error}\n`);
    for (const finding of result.findings.slice(0, 20)) {
      const location = `${finding.uri ?? finding.file}${finding.line === null ? "" : `:${finding.line}`}`;
      process.stderr.write(`${finding.level} ${finding.ruleId}: ${location}${finding.suppressed ? " (suppression metadata retained)" : ""}\n`);
    }
    process.stdout.write(`SARIF gate ${result.ok ? "passed" : "failed"}: ${result.files.length} files, ${result.findings.length} findings, ${result.errors.length} errors.\n`);
    if (!result.ok) process.exitCode = 1;
  }
}
