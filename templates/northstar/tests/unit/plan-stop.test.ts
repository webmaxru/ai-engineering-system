import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { claimOwnedPlanSession } from "../../scripts/plan-stop.mjs";
import { contractFromFile } from "../../scripts/task-contract.mjs";
import {
  bindWorkspaceOwner,
  claimWorkspaceOwner,
  releaseWorkspaceClaim,
} from "../../scripts/workspace-owner.mjs";

const roots: string[] = [];
const repository = "fixture/northstar";

function temp() {
  const root = mkdtempSync(join(tmpdir(), "northstar-plan-stop-owner-"));
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("plan Stop owner binding", () => {
  it("rejects a foreign session before it can reach plan artifacts", () => {
    const root = temp();
    const fixture = contractFromFile("tests/fixtures/WI-1842.issue.md");
    const contract = {
      ...fixture,
      source: {
        ...fixture.source,
        trusted: true,
        issue: 41,
        bodyDigest: "a".repeat(64),
      },
    };
    const owner = claimWorkspaceOwner({
      root,
      issue: 41,
      taskId: contract.id,
      contractDigest: contract.source.bodyDigest,
      sessionId: "plan-owner",
      env: { GITHUB_REPOSITORY: repository },
    });
    bindWorkspaceOwner(owner, contract);
    mkdirSync(join(root, "artifacts"), { recursive: true });
    writeFileSync(join(root, "artifacts", "task-contract.json"), JSON.stringify(contract));
    writeFileSync(join(root, "artifacts", "task-session.json"), JSON.stringify({
      issue: 41,
      taskId: contract.id,
      contractDigest: contract.source.bodyDigest,
      role: "plan",
      sessionId: "plan-owner",
      approvalState: "missing",
      workspaceOwner: owner.identity.ownerKey,
    }));
    writeFileSync(join(root, "artifacts", "plan.json"), '{"owner":"plan-owner"}');
    writeFileSync(join(root, "artifacts", "plan-proposal.md"), "existing proposal");
    releaseWorkspaceClaim(owner);
    const planBefore = readFileSync(join(root, "artifacts", "plan.json"));
    const proposalBefore = readFileSync(join(root, "artifacts", "plan-proposal.md"));

    expect(() => claimOwnedPlanSession({ session_id: "foreign-session" }, {
      root,
      env: { GITHUB_REPOSITORY: repository },
    })).toThrow(/owned by another session/);
    expect(readFileSync(join(root, "artifacts", "plan.json"))).toEqual(planBefore);
    expect(readFileSync(join(root, "artifacts", "plan-proposal.md"))).toEqual(proposalBefore);

    const active = claimOwnedPlanSession({ session_id: "plan-owner" }, {
      root,
      env: { GITHUB_REPOSITORY: repository },
    });
    expect(active.session.workspaceOwner).toBe(owner.identity.ownerKey);
    releaseWorkspaceClaim(active.claim);
  });
});
