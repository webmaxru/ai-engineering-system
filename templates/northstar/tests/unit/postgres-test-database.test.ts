import { describe, expect, it } from "vitest";
import { validateAcceptanceDatabaseUrl } from "../acceptance/postgres-test-database.js";

describe("PostgreSQL acceptance target validation", () => {
  it("requires a disposable acknowledgement even for a local server", () => {
    expect(() => validateAcceptanceDatabaseUrl(
      "postgresql://postgres:postgres@localhost:5432/northstar",
      false,
    )).toThrow(/NORTHSTAR_ACCEPTANCE_DATABASE_DISPOSABLE=true/);
  });

  it("allows an acknowledged local test database", () => {
    expect(validateAcceptanceDatabaseUrl(
      "postgresql://postgres:postgres@localhost:5432/northstar",
      true,
    ).hostname).toBe("localhost");
  });

  it("rejects remote hosts even when the disposable acknowledgement is set", () => {
    expect(() => validateAcceptanceDatabaseUrl(
      "postgresql://user:secret@db.example.invalid:5432/production",
      true,
    )).toThrow(/refuses remote database hosts/);
  });

  it("rejects a database URL without a database name", () => {
    expect(() => validateAcceptanceDatabaseUrl(
      "postgresql://postgres:postgres@localhost:5432/",
      true,
    )).toThrow(/must name the disposable test database/);
  });
});
