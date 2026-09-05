import { describe, expect, it } from "vitest";
import { evaluateValidationAuthority } from "../../scripts/check-validation-authority.mjs";

describe("trusted validation authority", () => {
  it("allows application changes judged by unchanged control-plane code", () => {
    expect(
      evaluateValidationAuthority([
        "src/services/order-service.ts",
        "tests/acceptance/idempotency.acceptance.test.ts",
      ]),
    ).toMatchObject({ ok: true, changedAuthority: [] });
  });

  it("prevents a pull request from self-certifying changed validators", () => {
    expect(
      evaluateValidationAuthority([
        ".github/workflows/governed-change.yml",
        "scripts/build-execution-report.mjs",
      ]),
    ).toMatchObject({
      ok: false,
      changedAuthority: [
        ".github/workflows/governed-change.yml",
        "scripts/build-execution-report.mjs",
      ],
    });
  });
});
