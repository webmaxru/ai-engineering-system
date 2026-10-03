/**
 * Build the machine-readable execution report used by the final evidence gate.
 *
 * Every producer emits a northstar/check-evidence/1 envelope bound to the
 * task, plan, source, and exact run attempt. Local validation can reach
 * ready_for_review, including when a validated plan explicitly defers a
 * criterion to post-acceptance. Deferred criteria remain unverified and block
 * ready_for_acceptance.
 */

import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  evidenceContext,
  evidencePath,
  hasLiveTaskIdentity,
  readEvidenceJson,
  validateCheckRecord,
} from "./evidence-record.mjs";
import {
  planDigest,
  validatePlanContract,
} from "./plan-contract.mjs";
import { loadTaskContract } from "./task-contract.mjs";

const REPO_ROOT = resolve(import.meta.dirname, "..");
const HOSTED_ONLY_CHECKS = new Set([
  "plan-approval",
  "codeql",
  "human-review",
  "production-environment",
  "repository-controls",
  "validation-authority",
  "browser-plan-canary",
]);
function decodeXml(value) {
  return String(value)
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (_, code) =>
      String.fromCodePoint(code[0].toLowerCase() === "x" ? parseInt(code.slice(1), 16) : Number(code)))
    .replaceAll("&gt;", ">")
    .replaceAll("&lt;", "<")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");
}

function xmlTree(xml) {
  const root = { name: "", children: [] };
  const stack = [root];
  const tokens = /<!--[\s\S]*?-->|<\?xml\b[\s\S]*?\?>|<!\[CDATA\[[\s\S]*?\]\]>|<\/?[A-Za-z_][^<>]*>|[^<]+/g;
  let offset = 0;
  for (const token of xml.matchAll(tokens)) {
    if (token.index !== offset) throw new Error("Malformed XML token.");
    offset += token[0].length;
    const text = token[0];
    if (/^(<!--|<\?xml|<!\[CDATA\[)/.test(text)) continue;
    if (!text.startsWith("<")) {
      if ((stack.length === 1 && text.trim()) || /&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);)/i.test(text)) {
        throw new Error("Malformed XML text.");
      }
      continue;
    }
    if (text.startsWith("</")) {
      const close = /^<\/([A-Za-z_][\w:.-]*)\s*>$/.exec(text);
      if (stack.length === 1 || close?.[1] !== stack.at(-1).name) {
        throw new Error("Mismatched XML closing tag.");
      }
      stack.pop();
      continue;
    }
    const open = /^<([A-Za-z_][\w:.-]*)([\s\S]*?)(\/?)>$/.exec(text);
    if (!open) throw new Error("Malformed XML opening tag.");
    const attributes = {};
    const attributesText = open[2];
    const pattern = /\s+([A-Za-z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
    let consumed = 0;
    for (const attribute of attributesText.matchAll(pattern)) {
      const value = attribute[2] ?? attribute[3];
      if (attribute.index !== consumed || Object.hasOwn(attributes, attribute[1]) ||
        /<|&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);)/i.test(value)) {
        throw new Error("Malformed XML attribute.");
      }
      consumed += attribute[0].length;
      attributes[attribute[1]] = decodeXml(value);
    }
    if (attributesText.slice(consumed).trim()) throw new Error("Malformed XML attributes.");
    const node = { name: open[1], attributes, children: [] };
    stack.at(-1).children.push(node);
    if (!open[3]) stack.push(node);
  }
  if (offset !== xml.length || stack.length !== 1 || root.children.length !== 1) {
    throw new Error("Incomplete XML document.");
  }
  return root.children[0];
}

function descendants(node, name) {
  return node.children.flatMap((child) => [
    ...(child.name === name ? [child] : []), ...descendants(child, name),
  ]);
}

export function parseJUnit(xml, relativePath = "<memory>") {
  try {
    const tree = xmlTree(xml);
    if (!["testsuites", "testsuite"].includes(tree.name)) throw new Error("JUnit root is not a test suite.");
    const children = {
      testsuites: ["testsuite"],
      testsuite: ["testsuite", "testcase", "properties", "system-out", "system-err"],
      testcase: ["failure", "error", "skipped", "properties", "system-out", "system-err"],
      properties: ["property"], property: [],
      failure: [], error: [], skipped: [], "system-out": [], "system-err": [],
    };
    const validateChildren = (node) => {
      if (!children[node.name] || node.children.some((child) => !children[node.name].includes(child.name))) {
        throw new Error("Invalid JUnit element nesting.");
      }
      node.children.forEach(validateChildren);
    };
    validateChildren(tree);
    const suites = tree.name === "testsuite" ? [tree, ...descendants(tree, "testsuite")] : descendants(tree, "testsuite");
    if (suites.length === 0) throw new Error("JUnit has no test suites.");
    const cases = descendants(tree, "testcase");
    if (cases.some((node) => typeof node.attributes.name !== "string" || !node.attributes.name.trim())) {
      throw new Error("JUnit testcase name is missing.");
    }
    const count = (nodes, tag) => nodes.filter((node) => node.children.some(({ name }) => name === tag)).length;
    const counters = (nodes) => ({
      tests: nodes.length, failures: count(nodes, "failure"), errors: count(nodes, "error"), skipped: count(nodes, "skipped"),
    });
    for (const suite of [...suites, ...(tree.name === "testsuites" ? [tree] : [])]) {
      const actual = counters(descendants(suite, "testcase"));
      for (const [attribute, value] of Object.entries(actual)) {
        const declared = suite.attributes[attribute];
        if (declared === undefined && (suite.name === "testsuites" || attribute === "skipped")) continue;
        if (!/^\d+$/.test(declared ?? "") || Number(declared) !== value) {
          throw new Error(`JUnit ${attribute} count does not match its testcases.`);
        }
      }
    }
    const counts = counters(cases);
    const passed = counts.failures + counts.errors === 0 && counts.tests > counts.skipped;
    return {
      present: true,
      path: relativePath,
      ...counts,
      passed,
      validationErrors: [],
      testNames: cases.filter((node) => !node.children.some(({ name }) =>
        ["failure", "error", "skipped"].includes(name))).map(({ attributes }) => attributes.name),
      skippedTestNames: cases.filter((node) => node.children.some(({ name }) =>
        name === "skipped")).map(({ attributes }) => attributes.name),
    };
  } catch (error) {
    return {
      present: true, path: relativePath, passed: false,
      tests: 0, failures: 0, errors: 0, skipped: 0, testNames: [], skippedTestNames: [],
      validationErrors: [`Malformed JUnit: ${error.message}`],
    };
  }
}

export function readJUnit(relativePath, root = REPO_ROOT) {
  try {
    const bytes = readFileSync(evidencePath(relativePath, root));
    return {
      ...parseJUnit(bytes.toString("utf8"), relativePath),
      digest: createHash("sha256").update(bytes).digest("hex"),
    };
  } catch (error) {
    return {
      present: false, path: relativePath, passed: false,
      validationErrors: [`JUnit unavailable: ${error.message}`],
    };
  }
}

export function criterionCoverage(criteria, testNames) {
  const leafNames = new Set(
    testNames.map((name) => name.split(" > ").at(-1)?.trim().toLowerCase()),
  );
  return criteria.map((criterion) => ({
    id: criterion.id,
    statement: criterion.statement,
    proven: leafNames.has(String(criterion.provenBy).trim().toLowerCase()),
    provenBy: criterion.provenBy,
  }));
}

export function loadCheckRecords(directory = "artifacts/checks", root = REPO_ROOT) {
  const absolute = evidencePath(directory, root);
  if (!existsSync(absolute)) return [];
  return readdirSync(absolute)
    .filter((name) => name.endsWith(".json") && !name.startsWith(".") && name !== "source-run.json")
    .sort()
    .map((name) => readEvidenceJson(resolve(absolute, name), root));
}

export function buildExecutionReport({
  contract,
  plan,
  records,
  unit,
  acceptance,
  hosted,
  env = process.env,
  root = REPO_ROOT,
}) {
  if (!contract?.id || !/^[0-9a-f]{64}$/.test(contract.source?.bodyDigest ?? "") ||
    !Array.isArray(contract.successCriteria) || contract.successCriteria.length === 0 ||
    contract.successCriteria.some((criterion) => !criterion?.id || !criterion?.provenBy)) {
    throw new Error("A complete task contract is required for execution evidence.");
  }
  let planValidation;
  try {
    planValidation = validatePlanContract(plan, contract);
  } catch (error) {
    planValidation = { ok: false, errors: [`Malformed plan: ${error.message}`] };
  }
  const expected = evidenceContext(env, { root, contract, plan });
  const contextErrors = [];
  if (expected.source.dirty) contextErrors.push("Source worktree is dirty; evidence is not commit-bound.");
  if (expected.baseSha !== plan?.baseSha) contextErrors.push("Expected base does not match the plan.");
  if (!hosted && expected.source.headSha !== expected.headSha) contextErrors.push("Source HEAD does not match the requested HEAD.");
  if (!expected.runId || !/^[1-9]\d*$/.test(expected.runAttempt ?? "")) contextErrors.push("Exact validation run and attempt are required.");
  if (hosted && (!env.GITHUB_RUN_ID || !env.GITHUB_RUN_ATTEMPT ||
    !/^[^/\s]+\/[^/\s]+$/.test(expected.repository) ||
    !Number.isSafeInteger(expected.pullRequest) || expected.pullRequest < 1)) {
    contextErrors.push("Hosted execution identity is incomplete.");
  }
  const currentJUnit = (input, path) => {
    const current = readJUnit(path, root);
    if (input?.path !== path || !current.digest || input?.digest !== current.digest) {
      current.passed = false;
      current.validationErrors = [...(current.validationErrors ?? []), "JUnit input is missing, changed, or not the required artifact."];
    }
    return current;
  };
  unit = currentJUnit(unit, "artifacts/unit-junit.xml");
  acceptance = currentJUnit(acceptance, "artifacts/acceptance-junit.xml");
  const requiredChecks = [
    ...new Set([
      ...(Array.isArray(plan?.requiredChecks) ? plan.requiredChecks.filter((id) => typeof id === "string") : []),
      ...(hosted ? ["validation-authority"] : []),
    ]),
  ]
    .filter((id) => id !== "evidence");
  const checks = requiredChecks.map((id) => {
    const candidates = records.filter((candidate) => candidate?.id === id);
    const record = candidates.length === 1 ? candidates[0] : null;
    const validation = record
      ? validateCheckRecord(record, expected, { root, hosted })
      : {
          valid: false,
          reasons: [candidates.length > 1 ? "duplicate evidence" : "missing"],
        };
    return {
      id,
      hostedOnly: HOSTED_ONLY_CHECKS.has(id),
      present: Boolean(record),
      status: record?.status ?? "not-run",
      valid: validation.valid,
      reasons: validation.reasons,
      record: record ?? null,
    };
  });

  const deferredCriteria = planValidation.ok && Array.isArray(plan?.deferredCriteria)
    ? plan.deferredCriteria
    : [];
  const deferredIds = new Set(deferredCriteria.map(({ id }) => id));
  const canaryCheck = checks.find(({ id }) => id === "browser-plan-canary");
  const canaryEvidence = canaryCheck?.present && canaryCheck.valid &&
    canaryCheck.status === "pass" && typeof canaryCheck.record?.artifact === "string"
    ? readEvidenceJson(canaryCheck.record.artifact, root)
    : null;
  const canaryProven = new Set(Array.isArray(canaryEvidence?.criterionIds)
    ? canaryEvidence.criterionIds : []);
  const successCriteria = criterionCoverage(contract.successCriteria, [
    ...(unit.testNames ?? []),
    ...(acceptance.testNames ?? []),
  ]).map((criterion) => deferredIds.has(criterion.id)
    ? { ...criterion, proven: canaryProven.has(criterion.id) }
    : criterion);
  const unprovenCriteria = successCriteria
    .filter(({ proven }) => !proven)
    .map(({ id }) => id);
  const blockingUnprovenCriteria = unprovenCriteria.filter(
    (id) => !deferredIds.has(id),
  );
  const deferredCriteriaReport = deferredCriteria.map((criterion) => ({
    ...criterion,
    status: canaryProven.has(criterion.id) ? "proven" : "unverified",
  }));

  const localChecks = checks.filter(({ hostedOnly }) => !hostedOnly);
  const hostedChecks = checks.filter(({ hostedOnly }) => hostedOnly);
  const failedLocalChecks = localChecks
    .filter(({ present, status, valid }) => !present || status !== "pass" || !valid)
    .map(({ id }) => id);
  const failedHostedChecks = hostedChecks
    .filter(({ present, status, valid }) => !present || status !== "pass" || !valid)
    .map(({ id }) => id);

  const localReady =
    Boolean(plan) &&
    planValidation.ok &&
    contextErrors.length === 0 &&
    unit.present &&
    unit.passed &&
    Number(unit.tests ?? 0) > 0 &&
    acceptance.present &&
    acceptance.passed &&
    Number(acceptance.tests ?? 0) > 0 &&
    failedLocalChecks.length === 0 &&
    blockingUnprovenCriteria.length === 0;
  const hostedReady =
    localReady &&
    hasLiveTaskIdentity(contract, expected.repository) &&
    failedHostedChecks.length === 0 &&
    unprovenCriteria.length === 0;
  const decision = !localReady
    ? "review_required"
    : hosted && hostedReady
      ? "ready_for_acceptance"
      : "ready_for_review";

  return {
    schema: "northstar/execution-report/4",
    workItem: contract.id,
    contractSource: contract.source,
    generatedAt: new Date().toISOString(),
    validationLevel: hosted ? "hosted-integration" : "local-reference",
    provenance: expected,
    contextErrors,
    plan: plan
      ? {
          present: true,
          schema: plan.schema,
          risk: plan.risk,
          digest: planDigest(plan),
          contractDigest: plan.contractDigest,
          baseSha: plan.baseSha,
          valid: planValidation.ok,
          errors: planValidation.errors,
        }
      : { present: false, valid: false, errors: planValidation.errors },
    tests: { unit, acceptance },
    checks,
    successCriteria,
    failedLocalChecks,
    pendingHostedEvidence: failedHostedChecks,
    unprovenCriteria,
    deferredCriteria: deferredCriteriaReport,
    decision,
    limits: [
      ...deferredCriteriaReport.filter(({ status }) => status === "unverified").map(({ id, reason }) =>
        `${id} remains unverified until its trusted post-bootstrap canary is verified: ${reason}`,
      ),
      ...(!contract.source.trusted
        ? [
            "The task contract came from an offline fixture, not a live trusted GitHub issue.",
          ]
        : []),
      ...(!hosted
        ? [
            "Hosted PR reviews, workflow runs, rulesets, secret scanning, push protection, and environment approvals were not exercised locally.",
          ]
        : []),
    ],
  };
}

/**
 * Emit stable failure labels rather than arbitrary producer-supplied text.
 * @param {Array<{id: string, status: string, reasons: string[]}>} checks
 * @param {string[]} failedIds
 */
export function checkFailureDiagnostics(checks, failedIds) {
  const selected = new Set(failedIds);
  return checks
    .filter(({ id }) => selected.has(id))
    .map(({ id, status, reasons }) => {
      const codes = reasons
        .map((reason) => String(reason).split(":")[0]
          .replace(/[^A-Za-z0-9._ -]/g, "")
          .replace(/\s+/g, " ")
          .trim())
        .filter(Boolean);
      return `${id}: ${codes.length > 0 ? codes.join(", ") : `status ${status}`}`;
    });
}

function valueOf(flag) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

function main() {
  const out = valueOf("--out") ?? "artifacts/report.json";
  const target = evidencePath(out);
  rmSync(target, { force: true });
  const contract = loadTaskContract();
  if (!contract) {
    process.stderr.write(
      "No task contract resolved. Run npm run contract:fetch -- --issue <number>.\n",
    );
    process.exit(2);
  }

  const report = buildExecutionReport({
    contract,
    plan: readEvidenceJson(valueOf("--plan") ?? "artifacts/plan.json"),
    records: loadCheckRecords(valueOf("--checks")),
    unit: readJUnit("artifacts/unit-junit.xml"),
    acceptance: readJUnit("artifacts/acceptance-junit.xml"),
    hosted: process.argv.includes("--hosted") || process.env.GITHUB_ACTIONS === "true",
  });

  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  process.stdout.write(
    [
      `task=${report.workItem}`,
      `level=${report.validationLevel}`,
      `decision=${report.decision}`,
      `unit=${report.tests.unit.present ? `${report.tests.unit.tests} tests, ${report.tests.unit.failures + report.tests.unit.errors} failed` : "absent"}`,
      `acceptance=${report.tests.acceptance.present ? `${report.tests.acceptance.tests} tests, ${report.tests.acceptance.failures + report.tests.acceptance.errors} failed` : "absent"}`,
      `criteriaProven=${report.successCriteria.filter(({ proven }) => proven).length}/${report.successCriteria.length}`,
    ].join("  ") + `\n${target}\n`,
  );

  if (report.deferredCriteria.some(({ status }) => status === "unverified")) {
    process.stdout.write(
      `deferred criteria: ${report.deferredCriteria.filter(({ status }) => status === "unverified").map(({ id }) => id).join(", ")} (unverified)\n`,
    );
  }

  if (report.decision === "review_required") {
    const failedIds = [...report.failedLocalChecks, ...report.pendingHostedEvidence];
    const diagnostics = checkFailureDiagnostics(report.checks, failedIds);
    process.stdout.write(
      `failed local checks: ${report.failedLocalChecks.join(", ") || "none"}; ` +
        `check diagnostics: ${diagnostics.join("; ") || "none"}; ` +
        `unproven criteria: ${report.unprovenCriteria.join(", ") || "none"}\n`,
    );
    process.exitCode = 1;
  } else if (report.pendingHostedEvidence.length > 0) {
    process.stdout.write(
      `pending hosted evidence: ${report.pendingHostedEvidence.join(", ")}\n`,
    );
  }
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`Execution evidence failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}
