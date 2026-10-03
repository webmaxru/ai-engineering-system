import { randomBytes } from "node:crypto";
import { Pool } from "pg";

export interface IsolatedPostgresDatabase {
  schema: string;
  connectionString: string;
  close(): Promise<void>;
}

const LOCAL_TEST_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "[::1]",
  "postgres",
  "host.docker.internal",
]);

export function validateAcceptanceDatabaseUrl(
  databaseUrl: string,
  disposableConfirmed = process.env.NORTHSTAR_ACCEPTANCE_DATABASE_DISPOSABLE === "true",
): URL {
  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch (error) {
    throw new Error("DATABASE_URL must be a valid PostgreSQL URL.", { cause: error });
  }
  if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
    throw new Error("Acceptance schema isolation requires a PostgreSQL URL.");
  }
  if (!LOCAL_TEST_HOSTS.has(parsed.hostname.toLowerCase())) {
    throw new Error(
      "Acceptance schema isolation refuses remote database hosts; use local or ephemeral test PostgreSQL.",
    );
  }
  if (!disposableConfirmed) {
    throw new Error(
      "Set NORTHSTAR_ACCEPTANCE_DATABASE_DISPOSABLE=true only after confirming DATABASE_URL targets a disposable test database.",
    );
  }
  if (!parsed.pathname || parsed.pathname === "/") {
    throw new Error("DATABASE_URL must name the disposable test database.");
  }
  return parsed;
}

export async function createIsolatedPostgresDatabase(
  databaseUrl = process.env.DATABASE_URL,
): Promise<IsolatedPostgresDatabase> {
  if (!databaseUrl) throw new Error("DATABASE_URL is required");

  const parsedDatabaseUrl = validateAcceptanceDatabaseUrl(databaseUrl);
  const schema = `northstar_acceptance_${randomBytes(12).toString("hex")}`;
  const control = new Pool({
    connectionString: parsedDatabaseUrl.toString(),
    connectionTimeoutMillis: 10_000,
  });
  try {
    await control.query(`CREATE SCHEMA "${schema}"`);
  } catch (error) {
    try {
      await control.end();
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        "Acceptance schema creation and control-pool cleanup failed.",
        { cause: cleanupError },
      );
    }
    throw error;
  }

  const scopedUrl = new URL(parsedDatabaseUrl);
  const existingOptions = scopedUrl.searchParams.get("options");
  scopedUrl.searchParams.set(
    "options",
    [existingOptions, `-c search_path=${schema}`].filter(Boolean).join(" "),
  );
  let closed = false;

  return {
    schema,
    connectionString: scopedUrl.toString(),
    async close() {
      if (closed) return;
      closed = true;
      const errors: unknown[] = [];
      try {
        await control.query(`DROP SCHEMA "${schema}" CASCADE`);
      } catch (error) {
        errors.push(error);
      }
      try {
        await control.end();
      } catch (error) {
        errors.push(error);
      }
      if (errors.length > 0) {
        throw new AggregateError(errors, `Acceptance schema ${schema} cleanup failed.`);
      }
    },
  };
}
