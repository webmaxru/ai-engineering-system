import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  approvalEvidenceInput, cacheExecutionPlan, executionPlanRequirements, selectExecutionPlan,
} from "../../scripts/select-execution-plan.mjs";
import { buildExecutionReport, readJUnit } from "../../scripts/build-execution-report.mjs";
import { createCheckRecord } from "../../scripts/evidence-record.mjs";
import type { CheckRecord } from "../../scripts/evidence-record.mjs";
import type { NativeApprovalRecord } from "../../scripts/plan-approval.mjs";
import { planDigest, renderPlanContract } from "../../scripts/plan-contract.mjs";
import type { PlanContract } from "../../scripts/plan-contract.mjs";
import { renderPlan } from "../../scripts/publish-plan.mjs";
import { requiredChecksForRisk } from "../../scripts/risk-policy.mjs";
import type { Risk } from "../../scripts/risk-policy.mjs";
import { parseIssueBody } from "../../scripts/task-contract.mjs";
import { claimWorkspaceOwner, releaseWorkspaceClaim } from "../../scripts/workspace-owner.mjs";

const root = mkdtempSync(join(tmpdir(), "northstar-combined-workflow-"));
const repository = "fixture/northstar";
const issue = 71;
const pullRequest = 72;
const baseSha = "b".repeat(40);
let headSha: string;
const contract = parseIssueBody(`
### Task id
COMBINED-WORKFLOW
### Goal
Prove bounded combined execution in an offline fixture.
### Authoritative sources
AGENTS.md
### Allowed scope
src/**
docs/**
.github/**
### Prohibited scope
production
### Constraints
Never infer approval.
### Outputs
change | An isolated fixture change.
### Success criteria
AC1 | Combined evidence remains risk-aware | proves combined workflow evidence
### Stop conditions
Missing required approval.
`, {
  number: issue, source: `issue #${issue}`, url: `https://github.com/${repository}/issues/${issue}`,
  actor: "fixture-owner", association: "OWNER", trusted: true,
});

function write(path: string, value: string) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), value);
}
function json(path: string, value: unknown) { write(path, JSON.stringify(value)); }
function readJson(path: string): unknown { return JSON.parse(readFileSync(join(root, path), "utf8")); }

beforeAll(() => {
  const git = (args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  git(["init", "--quiet"]);
  write(".gitignore", "artifacts/\n");
  git(["add", ".gitignore"]);
  git(["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "-c", "core.hooksPath=.git/hooks",
    "-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "Offline combined-workflow fixture"]);
  headSha = git(["rev-parse", "HEAD"]);
}, 60000);
beforeEach(() => {
  rmSync(join(root, "artifacts"), { recursive: true, force: true });
  const owner = claimWorkspaceOwner({
    root,
    issue,
    taskId: contract.id,
    contractDigest: contract.source.bodyDigest,
    env: hostedEnv(),
  });
  releaseWorkspaceClaim(owner);
}, 60000);
afterAll(() => rmSync(root, { recursive: true, force: true }), 60000);

function fixture(risk: Risk = "medium") {
  const candidate: PlanContract = {
    schema: "northstar/plan/1", taskId: contract.id, contractDigest: contract.source.bodyDigest,
    baseSha, baseBranch: "main", risk, objective: contract.inputs.goal,
    scope: { allowed: risk === "low" ? ["docs/**"] : risk === "medium" ? ["src/**"] : [".github/**"], prohibited: [] },
    ...(risk === "critical" ? { operations: ["production-deployment"] } : {}),
    steps: ["Implement only the fixture."], requiredChecks: requiredChecksForRisk(risk),
    successCriteria: contract.successCriteria.map(({ id, provenBy }) => ({ id, provenBy })),
    evidence: ["Exact input evidence."], decisionsAndHandoffs: ["Independent review remains required."],
    risks: ["Fixture only."], rollbackAndEscalation: ["Stop on missing authority."],
  };
  candidate.planDigest = planDigest(candidate);
  const body = renderPlan(renderPlanContract(candidate), { issue });
  const pull = {
    number: pullRequest, state: "open", draft: true, body, changed_files: 2,
    html_url: `https://github.com/${repository}/pull/${pullRequest}`,
    user: { login: "fixture-implementer" },
    head: { sha: headSha, ref: "agent/implement/combined-workflow", repo: { full_name: repository } },
    base: { sha: baseSha, ref: "main", repo: { full_name: repository } },
  };
  const calls: string[][] = [];
  const run = (args: string[]) => {
    calls.push(args);
    const route = args.at(-1)!;
    if (route === `repos/{owner}/{repo}/pulls/${pullRequest}`) return JSON.stringify(pull);
    if (route === "repos/{owner}/{repo}") return JSON.stringify({ full_name: repository });
    if (route === `repos/{owner}/{repo}/compare/${baseSha}...${headSha}`) {
      return JSON.stringify({ merge_base_commit: { sha: baseSha }, status: "ahead" });
    }
    throw new Error(`Unexpected offline API call: ${route}`);
  };
  const approval: NativeApprovalRecord = {
    schema: "northstar/plan-approval/2", source: "github-review", repository,
    taskId: contract.id, contractDigest: contract.source.bodyDigest, planDigest: candidate.planDigest,
    planPr: 73, planUrl: `https://github.com/${repository}/pull/73`, reviewId: 100,
    reviewer: "fixture-reviewer", reviewedCommit: "c".repeat(40), baseSha,
    approvedAt: "2026-09-01T10:00:00Z", planOnly: true,
    artifactPath: "docs/plans/combined-workflow.md", artifactBlobSha: "d".repeat(40),
  };
  const approved = {
    body: renderPlanContract(candidate), plan: candidate, approval,
    pr: {
      number: 73, body, url: approval.planUrl, author: { login: "fixture-plan-author" },
      headRefOid: approval.reviewedCommit, baseRefOid: baseSha, isDraft: false,
    },
  };
  return {
    candidate, pull, calls, run, approved,
    input: { contract, candidate, pullRequest, expectedHead: headSha },
  };
}

function hostedEnv() {
  return {
    GITHUB_ACTIONS: "true", GITHUB_REPOSITORY: repository, PR_NUMBER: String(pullRequest),
    NORTHSTAR_HEAD_SHA: headSha, BASE_SHA: baseSha,
    NORTHSTAR_RUN_ID: "42", NORTHSTAR_RUN_ATTEMPT: "1",
    GITHUB_RUN_ID: "43", GITHUB_RUN_ATTEMPT: "1", GITHUB_WORKFLOW: "Publish Evidence",
    GITHUB_EVENT_NAME: "workflow_run", GITHUB_ACTOR: "fixture-publisher",
  };
}

describe("risk-aware hosted execution-plan selection", { timeout: 90000 }, () => {
  it.each(["low", "medium"] as const)("uses the plan in the actual %s-risk implementation PR without looking for a plan PR", (risk) => {
    const f = fixture(risk);
    const readApprovedPlan = vi.fn(() => { throw new Error("An approved plan must not be requested."); });
    const result = selectExecutionPlan(f.input, { run: f.run, readApprovedPlan });
    expect(result).toMatchObject({
      approvalState: "proposed", approvalRequired: false, risk,
      planPath: "artifacts/candidate-plan.json", planDigest: f.candidate.planDigest,
    });
    expect(Object.hasOwn(result.plan, "approval")).toBe(false);
    expect(readApprovedPlan).not.toHaveBeenCalled();
    expect(f.calls.every((args) => args[0] === "api")).toBe(true);
    expect(f.calls.some((args) => args.includes("list"))).toBe(false);
    expect(f.pull.changed_files).toBe(2);
    expect(approvalEvidenceInput(result)).toMatchObject({ status: "skipped", required: false, summary: expect.stringContaining("not-required") });
  });

  it.each(["high", "critical"] as const)("requires live independent approval for %s without a lower-risk fallback", (risk) => {
    const f = fixture(risk);
    const readApprovedPlan = vi.fn(() => f.approved);
    const readProposedPlan = vi.fn(() => { throw new Error("High-risk work cannot fall back to a proposal."); });
    const result = selectExecutionPlan(f.input, { run: f.run, readApprovedPlan, readProposedPlan });
    expect(result).toMatchObject({
      approvalState: "approved", approvalRequired: true, planPath: "artifacts/approved-plan.json",
      plan: { approval: f.approved.approval },
    });
    expect(readApprovedPlan).toHaveBeenCalledExactlyOnceWith(contract, { run: f.run });
    expect(readProposedPlan).not.toHaveBeenCalled();
    expect(approvalEvidenceInput(result)).toMatchObject({ status: "pass", required: true });
  });

  it("resolves a canary plan approval from the exact canary PR, not the bootstrap plan PR", () => {
    const f = fixture("high");
    const canary: PlanContract = {
      ...f.candidate,
      requiredChecks: [...f.candidate.requiredChecks, "browser-plan-canary"],
      canaryFor: {
        sourceTaskId: contract.id,
        sourceContractDigest: contract.source.bodyDigest,
        sourcePlanDigest: "a".repeat(64),
        sourceBaseSha: baseSha,
        sourcePullRequest: 71,
        sourceHeadSha: "c".repeat(40),
        sourceRunId: "91",
        sourceRunAttempt: "2",
        sourceEvidenceRunId: "92",
        bootstrapPlanPr: 73,
        bootstrapPlanHeadSha: "d".repeat(40),
        bootstrapReviewId: 93,
        bootstrapReviewer: "fixture-reviewer",
      },
    };
    canary.planDigest = planDigest(canary);
    f.pull.body = renderPlan(renderPlanContract(canary), { issue });
    const approval: NativeApprovalRecord = {
      ...f.approved.approval,
      planPr: pullRequest,
      planDigest: canary.planDigest,
      reviewedCommit: headSha,
      baseSha,
    };
    const canaryApproval = {
      ...f.approved,
      body: renderPlanContract(canary),
      plan: canary,
      approval,
      pr: {
        ...f.approved.pr,
        number: pullRequest,
        headRefOid: headSha,
        baseRefOid: baseSha,
      },
    };
    const readApprovedPlan = vi.fn(() => canaryApproval);

    const selected = selectExecutionPlan(
      { ...f.input, candidate: canary },
      { run: f.run, readApprovedPlan },
    );

    expect(selected.planDigest).toBe(canary.planDigest);
    expect(readApprovedPlan).toHaveBeenCalledExactlyOnceWith(contract, {
      run: f.run,
      planPrNumber: pullRequest,
    });
  });

  it("does not turn missing or unavailable high-risk approval into combined execution", () => {
    const f = fixture("high");
    const readProposedPlan = vi.fn(() => { throw new Error("No fallback allowed."); });
    expect(() => selectExecutionPlan(f.input, { run: f.run, readApprovedPlan: () => null, readProposedPlan }))
      .toThrow(/No current independent plan-only approval/);
    expect(() => selectExecutionPlan(f.input, { run: f.run, readApprovedPlan: () => { throw new Error("HTTP 403"); }, readProposedPlan }))
      .toThrow(/HTTP 403/);
    expect(readProposedPlan).not.toHaveBeenCalled();
  });

  it("does not infer lower risk from malformed or understated plans", () => {
    const f = fixture("high");
    const readApprovedPlan = vi.fn(() => f.approved);
    const understated = { ...f.candidate, risk: "medium" as const };
    understated.planDigest = planDigest(understated);
    expect(() => selectExecutionPlan({ ...f.input, candidate: understated }, { run: f.run, readApprovedPlan })).toThrow(/deterministic floor/);
    expect(() => selectExecutionPlan({ ...f.input, candidate: null }, { run: f.run, readApprovedPlan })).toThrow(/Invalid execution plan/);
    expect(readApprovedPlan).not.toHaveBeenCalled();
  });

  it("rejects approval claims and contradictory approval checks in a combined plan", () => {
    const f = fixture();
    const claimed = { ...f.candidate, approval: f.approved.approval };
    expect(() => executionPlanRequirements(contract, claimed)).toThrow(/must not claim or require/);
    const contradictory = { ...f.candidate, requiredChecks: [...f.candidate.requiredChecks, "plan-approval"] };
    contradictory.planDigest = planDigest(contradictory);
    expect(() => executionPlanRequirements(contract, contradictory)).toThrow(/must not claim or require/);
  });

  it("preserves exact live-base rejection instead of rebasing or rewriting the plan", () => {
    const f = fixture();
    f.pull.base.sha = "13eb5a7dad21a974085383949f3a19b1c82af668";
    expect(() => selectExecutionPlan(f.input, { run: f.run })).toThrow(/base, or head/);
    expect(f.candidate.baseSha).toBe(baseSha);
  });

  it("accepts an explicitly allowed merged source PR without rebasing its approved plan", () => {
    const f = fixture("high");
    f.pull.state = "closed";
    Object.assign(f.pull, {
      merged: true,
      merged_at: "2026-09-02T10:00:00Z",
      merge_commit_sha: "f".repeat(40),
    });
    f.pull.base.sha = "e".repeat(40);
    const readApprovedPlan = vi.fn(() => f.approved);

    expect(() =>
      selectExecutionPlan(f.input, { run: f.run, readApprovedPlan }),
    ).toThrow(/does not match the selected task/);
    expect(
      selectExecutionPlan(f.input, {
        run: f.run,
        readApprovedPlan,
        allowMerged: true,
      }),
    ).toMatchObject({ approvalState: "approved", planDigest: f.candidate.planDigest });
    expect(readApprovedPlan).toHaveBeenCalledTimes(1);
  });

  it.each(["head", "repository", "task", "base-branch", "plan-body"] as const)("rejects mismatched %s identity", (field) => {
    const f = fixture();
    if (field === "head") f.pull.head.sha = "e".repeat(40);
    if (field === "repository") f.pull.head.repo.full_name = "another/repository";
    if (field === "task") f.pull.body = f.pull.body.replace(`Closes #${issue}`, "Closes #99");
    if (field === "base-branch") f.pull.base.ref = "different";
    if (field === "plan-body") f.pull.body = renderPlan(renderPlanContract({ ...f.candidate, objective: "different" }), { issue });
    expect(() => selectExecutionPlan(f.input, { run: f.run })).toThrow();
  });

  it("rejects a same-head plan or base mutation during selection", () => {
    const f = fixture("high");
    expect(() => selectExecutionPlan(f.input, {
      run: f.run, readApprovedPlan: () => { f.pull.body += "\nChanged during lookup."; return f.approved; },
    })).toThrow(/changed during execution-plan selection/);
  });

  it("rejects missing explicit PR/head identity and false base ancestry", () => {
    const f = fixture();
    expect(() => selectExecutionPlan({ contract, candidate: f.candidate }, { run: f.run })).toThrow(/explicit PR/);
    expect(() => selectExecutionPlan(f.input, {
      run: (args) => args.at(-1)?.includes("/compare/")
        ? JSON.stringify({ merge_base_commit: { sha: "e".repeat(40) }, status: "diverged" }) : f.run(args),
    })).toThrow(/exact plan base/);
  });

  it("emits requirements only after validation, without treating an embedded approval as authority", () => {
    const f = fixture("high");
    const readApprovedPlan = vi.fn(() => f.approved);
    const selected = selectExecutionPlan({
      ...f.input, candidate: { ...f.candidate, approval: f.approved.approval },
    }, { run: f.run, requirementsOnly: true, readApprovedPlan });
    expect(selected).toMatchObject({ approvalRequired: true, approvalState: "missing" });
    expect(Object.hasOwn(selected.plan, "approval")).toBe(false);
    expect(readApprovedPlan).not.toHaveBeenCalled();
    expect(() => approvalEvidenceInput(selected)).toThrow(/cannot produce passing/);
  });

  it("clears stale approval artifacts and records not-required rather than pass for medium risk", () => {
    const f = fixture();
    json("artifacts/approved-plan.json", { stale: true });
    json("artifacts/checks/plan-approval.json", { status: "pass" });
    const selected = cacheExecutionPlan(f.input, { root, env: hostedEnv(), recordApproval: true, run: f.run });
    expect(existsSync(join(root, "artifacts", "approved-plan.json"))).toBe(false);
    expect(readJson("artifacts/plan.json")).toEqual(selected.plan);
    expect(readJson("artifacts/candidate-plan.json")).toEqual(selected.plan);
    expect(readJson("artifacts/checks/plan-approval.json")).toMatchObject({ status: "skipped", required: false });
  });

  it("records failed high-risk selection without retaining an older approved plan", () => {
    const f = fixture("high");
    json("artifacts/approved-plan.json", f.approved.plan);
    json("artifacts/plan.json", f.candidate);
    expect(() => cacheExecutionPlan(f.input, {
      root, env: hostedEnv(), run: f.run, recordApproval: true, readApprovedPlan: () => null,
    })).toThrow(/No current independent/);
    for (const file of ["plan.json", "approved-plan.json", "candidate-plan.json"]) {
      expect(existsSync(join(root, "artifacts", file))).toBe(false);
    }
    expect(readJson("artifacts/checks/plan-approval.json")).toMatchObject({ required: true, status: "fail" });
  });

  it("keeps candidate bytes stable when a later source fan-in selects the approved plan", () => {
    const f = fixture("high");
    cacheExecutionPlan(f.input, { root, env: hostedEnv(), run: f.run, requirementsOnly: true });
    const producerBytes = readFileSync(join(root, "artifacts", "plan.json"), "utf8");
    cacheExecutionPlan(f.input, { root, env: hostedEnv(), run: f.run, readApprovedPlan: () => f.approved });
    expect(readFileSync(join(root, "artifacts", "candidate-plan.json"), "utf8")).toBe(producerBytes);
    expect(readJson("artifacts/approved-plan.json")).toMatchObject({ approval: f.approved.approval });
  });

  it("retains the approval-only CLI semantics without manufacturing approval for a medium plan", () => {
    const f = fixture();
    const readApprovedPlan = vi.fn(() => f.approved);
    expect(() => selectExecutionPlan(f.input, { run: f.run, approvalOnly: true, readApprovedPlan })).toThrow(/not required/);
    expect(readApprovedPlan).not.toHaveBeenCalled();
  });

  it("cannot bypass the approval-only operation with a requirements-only flag", () => {
    const f = fixture("high");
    expect(() => selectExecutionPlan(f.input, {
      run: f.run, requirementsOnly: true, approvalOnly: true,
    })).toThrow(/cannot bypass live approval/);
  });

  it.each([
    ["PR_NUMBER", "99"], ["NORTHSTAR_HEAD_SHA", "e".repeat(40)],
    ["BASE_SHA", "f".repeat(40)], ["GITHUB_REPOSITORY", "other/repository"],
  ])("does not reattribute a selected proposal to mismatched %s", (key, value) => {
    const f = fixture();
    expect(() => cacheExecutionPlan(f.input, {
      root, run: f.run, env: { ...hostedEnv(), [key]: value },
    })).toThrow(key === "GITHUB_REPOSITORY"
      ? /already owned/
      : /workflow execution context differs/);
    expect(existsSync(join(root, "artifacts", "plan.json"))).toBe(false);
    expect(existsSync(join(root, "artifacts", "approved-plan.json"))).toBe(false);
  });

  it("lets complete medium hosted evidence use the candidate while preserving required failures and human review", () => {
    const f = fixture();
    const selected = cacheExecutionPlan(f.input, { root, env: hostedEnv(), run: f.run, recordApproval: true });
    const junit = '<testsuites><testsuite tests="1" failures="0" errors="0"><testcase name="proves combined workflow evidence"/></testsuite></testsuites>';
    write("artifacts/unit-junit.xml", junit);
    write("artifacts/acceptance-junit.xml", junit);
    json("artifacts/scope-report.json", { schema: "northstar/scope-report/1", taskId: contract.id, contractDigest: contract.source.bodyDigest, ok: true, paths: ["src/example.ts"], violations: [] });
    json("artifacts/dependency-audit.json", { metadata: { vulnerabilities: { high: 0, critical: 0 } } });
    json("artifacts/merge-report.json", { schema: "northstar/merge-report/1", base: baseSha, ok: true });
    json("artifacts/validation-authority-report.json", { schema: "northstar/validation-authority-report/1", pullRequest, headSha, ok: true, changedAuthority: [] });
    const artifacts: Record<string, string | null> = {
      "plan-contract": "artifacts/candidate-plan.json", "scope-policy": "artifacts/scope-report.json",
      quality: "artifacts/unit-junit.xml", acceptance: "artifacts/acceptance-junit.xml",
      "dependency-review": "artifacts/dependency-audit.json", "merge-validation": "artifacts/merge-report.json",
      "validation-authority": "artifacts/validation-authority-report.json",
    };
    const revalidated = new Set(["plan-contract", "scope-policy", "human-review", "validation-authority"]);
    const records = [...f.candidate.requiredChecks.filter((id) => id !== "evidence"), "validation-authority"].map((id) =>
      createCheckRecord({ id, status: "pass", artifact: artifacts[id] ?? null }, {
        ...hostedEnv(), NORTHSTAR_JOB_ID: id,
        ...(!revalidated.has(id) ? {
          GITHUB_RUN_ID: "42", GITHUB_WORKFLOW: "Governed Change",
          GITHUB_EVENT_NAME: "pull_request", GITHUB_ACTOR: "fixture-producer",
        } : {}),
      }, { root, contract, plan: selected.plan }));
    const report = (checks: CheckRecord[]) => buildExecutionReport({
      root, contract, plan: selected.plan, records: checks, hosted: true, env: hostedEnv(),
      unit: readJUnit("artifacts/unit-junit.xml", root), acceptance: readJUnit("artifacts/acceptance-junit.xml", root),
    });
    expect(report(records).decision).toBe("ready_for_acceptance");
    expect(report(records).checks.some(({ id }) => id === "plan-approval")).toBe(false);
    expect(existsSync(join(root, "artifacts", "approved-plan.json"))).toBe(false);
    expect(report(records.map((record) => record.id === "quality" ? { ...record, status: "fail" } : record)).decision).toBe("review_required");
    expect(report(records.map((record) => record.id === "human-review" ? { ...record, status: "fail" } : record)))
      .toMatchObject({ decision: "ready_for_review", pendingHostedEvidence: ["human-review"] });
  });
});

function workflow(name: string) {
  return readFileSync(join(import.meta.dirname, "..", "..", ".github", "workflows", name), "utf8");
}
function job(source: string, name: string) {
  return new RegExp(`^ {2}${name}:\\r?\\n([\\s\\S]*?)(?=^ {2}[a-z][a-z-]*:|$(?![\\s\\S]))`, "m").exec(source)?.[1] ?? "";
}

describe("combined-mode hosted workflow wiring", () => {
  it("conditions the plan-approval job on validated high/critical requirements", () => {
    const source = workflow("governed-change.yml");
    expect(job(source, "plan-contract")).toContain("approval_required: ${{ steps.plan.outputs.approval_required }}");
    expect(job(source, "plan-contract")).toContain("--requirements-only");
    expect(job(source, "plan-approval")).toContain("needs.plan-contract.outputs.approval_required == 'true'");
    expect(job(source, "plan-approval")).toContain('--expected-head "$NORTHSTAR_HEAD_SHA"');
  });

  it("resolves live task authority in policy jobs and quarantines producer plan caches", () => {
    const source = workflow("governed-change.yml");
    for (const name of ["plan-approval", "scope-policy", "human-review"]) {
      const policyJob = job(source, name);
      expect(policyJob).not.toContain("actions/download-artifact@v7");
      expect(policyJob).toContain("issues: read");
      expect(policyJob).toContain('npm run contract:from-pr -- --pr "$PR_NUMBER"');
      expect(policyJob).toContain('npm run plan:gate -- --pr "$PR_NUMBER" --expected-head "$NORTHSTAR_HEAD_SHA"');
      expect(policyJob).toContain("node scripts/select-execution-plan.mjs");
    }

    const planContract = job(source, "plan-contract");
    const planContextUpload = /name: northstar-plan-context\r?\n[\s\S]*?\r?\n {10}retention-days: 90/
      .exec(planContract)?.[0] ?? "";
    expect(planContextUpload).toContain("artifacts/plan.json");
    expect(planContextUpload).not.toContain("artifacts/task-contract.json");
    expect(planContextUpload).not.toContain("artifacts/checks/plan-contract.json");
    expect(planContract).toContain("name: northstar-check-plan-contract");
    expect(planContract).toContain("path: artifacts/**/plan-contract.json");

    const approvalUpload = /name: northstar-check-plan-approval\r?\n[\s\S]*?\r?\n {10}retention-days: 90/
      .exec(job(source, "plan-approval"))?.[0] ?? "";
    expect(approvalUpload).toContain("path: artifacts/**/plan-approval.json");
    expect(approvalUpload).not.toContain("artifacts/approved-plan.json");

    const scopePolicy = job(source, "scope-policy");
    expect(scopePolicy).toContain("name: northstar-check-scope");
    expect(scopePolicy).toContain("path: artifacts/**/scope-policy.json");
    expect(scopePolicy).toContain("name: northstar-check-scope-report");
    expect(scopePolicy).toContain("path: artifacts/scope-report.json");

    const evidence = job(source, "evidence");
    expect(evidence).toContain("pattern: northstar-check-*");
    expect(evidence).not.toContain("pattern: northstar-*");
  });

  it.each(["governed-change.yml", "publish-evidence.yml", "system-maintenance-approval.yml"])(
    "selects the right report plan and invalidates caches after failed selection in %s", (name) => {
      const source = workflow(name);
      expect(source).toContain("node scripts/select-execution-plan.mjs");
      expect(source).toContain("PLAN_PATH: ${{ steps.execution-plan.outputs.plan_path }}");
      expect(source).toContain('node scripts/build-execution-report.mjs --hosted --plan "$PLAN_PATH"');
      expect(source).not.toContain("--hosted --plan artifacts/approved-plan.json");
      expect(source).toContain('if [ "$SELECTION_OUTCOME" != "success" ]; then');
      expect(source).toContain("rm -f artifacts/plan.json artifacts/approved-plan.json artifacts/candidate-plan.json");
    },
  );

  it("preserves producer plan bytes and keeps all required security and review jobs", () => {
    const source = workflow("governed-change.yml");
    expect(job(source, "evidence")).toContain("cp artifacts/candidate-plan.json artifacts/plan.json");
    expect(job(source, "evidence")).toContain('node scripts/check-plan.mjs --pr "$PR_NUMBER" --expected-head "$NORTHSTAR_HEAD_SHA"');
    expect(job(source, "codeql")).toContain("steps.analyze.outcome == 'success' && steps.gate.outcome == 'success'");
    expect(job(source, "human-review")).toContain('node scripts/check-human-review.mjs --pr "$PR_NUMBER"');
    expect(job(source, "evidence")).toContain("      - plan-approval");
    expect(job(source, "evidence")).toContain("      - codeql");
    expect(job(source, "evidence")).toContain("      - human-review");
    expect(job(source, "evidence")).toContain("if: always()");
  });

  it("never copies a proposal into an approved artifact or executes PR-head code in the trusted publisher", () => {
    const fetcher = readFileSync(join(import.meta.dirname, "..", "..", "scripts", "fetch-approved-plan.mjs"), "utf8");
    expect(fetcher).toContain("approvalOnly: true");
    expect(fetcher).not.toMatch(/copyFileSync|resolveTask/);
    const publisher = workflow("publish-evidence.yml");
    expect(publisher).toMatch(/^ {10}ref: main$/m);
    expect(publisher).not.toMatch(/^ {10}ref:.*(?:head_sha|head_ref|head\.sha)/m);
    for (const source of [publisher, workflow("system-maintenance-approval.yml")]) {
      expect(source).toContain("--record-approval");
      expect(source).not.toContain("node scripts/fetch-approved-plan.mjs");
      expect(source).toContain('[ "$SELECTION_STATUS" -eq 0 ]');
    }
  });
});
