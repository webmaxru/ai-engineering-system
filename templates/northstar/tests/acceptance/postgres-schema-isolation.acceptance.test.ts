import { Pool } from "pg";
import { afterEach, describe, expect, it } from "vitest";
import {
  createIsolatedPostgresDatabase,
  type IsolatedPostgresDatabase,
} from "./postgres-test-database.js";

describe("PostgreSQL acceptance schema isolation", () => {
  const databases: IsolatedPostgresDatabase[] = [];
  const pools: Pool[] = [];

  afterEach(async () => {
    const errors: unknown[] = [];
    for (const pool of pools.splice(0)) {
      try {
        await pool.end();
      } catch (error) {
        errors.push(error);
      }
    }
    for (const database of databases.splice(0)) {
      try {
        await database.close();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length > 0) {
      throw new AggregateError(errors, "Schema-isolation acceptance cleanup failed.");
    }
  });

  it("isolates PostgreSQL acceptance schemas per suite", async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error("DATABASE_URL is required");
    const [first, second] = await Promise.all([
      createIsolatedPostgresDatabase(databaseUrl),
      createIsolatedPostgresDatabase(databaseUrl),
    ]);
    databases.push(first, second);
    expect(first.schema).not.toBe(second.schema);

    const firstPool = new Pool({ connectionString: first.connectionString });
    const secondPool = new Pool({ connectionString: second.connectionString });
    pools.push(firstPool, secondPool);
    await Promise.all([
      firstPool.query("CREATE TABLE isolation_probe (id integer PRIMARY KEY)"),
      secondPool.query("CREATE TABLE isolation_probe (id integer PRIMARY KEY)"),
    ]);
    await firstPool.query("INSERT INTO isolation_probe (id) VALUES (1)");
    expect((await firstPool.query("SELECT id FROM isolation_probe")).rows).toEqual([{ id: 1 }]);
    expect((await secondPool.query("SELECT id FROM isolation_probe")).rows).toEqual([]);
  });
});
