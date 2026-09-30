import { fork, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { expect, it } from "vitest";
import { createIsolatedPostgresDatabase } from "./postgres-test-database.js";

interface Server {
  child: ChildProcess;
  url: string;
  pid: number;
}

async function startServer(databaseUrl: string): Promise<Server> {
  const child = fork(fileURLToPath(new URL("../fixtures/idempotency-http-server.ts", import.meta.url)), {
    execArgv: ["--import", "tsx"],
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: ["ignore", "ignore", "ignore", "ipc"],
  });
  return new Promise<Server>((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timeout);
      child.off("message", ready);
      child.off("exit", exited);
      child.off("error", failed);
    };
    const failed = (error: Error) => {
      cleanup();
      child.kill();
      reject(new Error("Acceptance server could not start.", { cause: error }));
    };
    const exited = (code: number | null) => failed(new Error(`Acceptance server exited before readiness (${code}).`));
    const ready = (message: unknown) => {
      if (!message || typeof message !== "object" ||
          !("schema" in message) || message.schema !== "northstar/acceptance-server/1" ||
          !("url" in message) || typeof message.url !== "string" ||
          !/^http:\/\/127\.0\.0\.1:\d+$/.test(message.url) ||
          !("pid" in message) || typeof child.pid !== "number" ||
          message.pid !== child.pid) return;
      cleanup();
      resolve({ child, url: message.url, pid: child.pid });
    };
    const timeout = setTimeout(() => failed(new Error("Acceptance server readiness deadline exceeded.")), 30_000);
    child.on("message", ready);
    child.once("exit", exited);
    child.once("error", failed);
  });
}

async function stopServer(server: Server): Promise<void> {
  if (server.child.exitCode !== null || server.child.signalCode !== null) return;
  await new Promise<void>((resolve, reject) => {
    const deadline = setTimeout(() => {
      server.child.kill("SIGKILL");
      reject(new Error("Acceptance server did not exit within its teardown deadline."));
    }, 10_000);
    server.child.once("exit", () => { clearTimeout(deadline); resolve(); });
    server.child.once("error", (error) => { clearTimeout(deadline); reject(error); });
    server.child.kill("SIGTERM");
  });
}

async function placeOrder(server: Server, key?: string, quantity = 3) {
  const response = await fetch(`${server.url}/orders`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(key ? { "idempotency-key": key } : {}) },
    body: JSON.stringify({ sku: "FICTIONAL-PROCESS-DEMO", quantity }),
    signal: AbortSignal.timeout(10_000),
  });
  const body: unknown = await response.json();
  return { status: response.status, replay: response.headers.get("x-idempotent-replay"), body };
}

it("isolates concurrent local test resources", async () => {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for process acceptance.");
  const isolatedDatabase = await createIsolatedPostgresDatabase(process.env.DATABASE_URL);
  const pool = new Pool({
    connectionString: isolatedDatabase.connectionString,
    connectionTimeoutMillis: 10_000,
  });
  const servers: Server[] = [];
  let failure: unknown;
  const errors: unknown[] = [];
  try {
    const first = await startServer(isolatedDatabase.connectionString);
    servers.push(first);
    const second = await startServer(isolatedDatabase.connectionString);
    servers.push(second);
    expect(first.pid).not.toBe(second.pid);
    expect(first.url).not.toBe(second.url);
    const key = `process-${randomBytes(8).toString("hex")}`;
    const results = await Promise.all(Array.from({ length: 12 }, (_, index) =>
      placeOrder(index % 2 ? first : second, key),
    ));
    expect(results.filter(({ status }) => status === 201)).toHaveLength(1);
    expect(results.filter(({ status, replay }) => status === 200 && replay === "true")).toHaveLength(11);
    const ids = results.map(({ body }) => {
      if (!body || typeof body !== "object" || !("id" in body) || typeof body.id !== "string") {
        throw new Error("The server did not return an order identity.");
      }
      return body.id;
    });
    expect(new Set(ids).size).toBe(1);
    expect((await placeOrder(second, key, 4)).status).toBe(409);
    await stopServer(first);
    const replacement = await startServer(isolatedDatabase.connectionString);
    servers.push(replacement);
    expect(replacement.pid).not.toBe(first.pid);
    const replay = await placeOrder(replacement, key);
    expect(replay).toMatchObject({ status: 200, replay: "true", body: { id: ids[0] } });
    const withoutKey = await Promise.all([placeOrder(second), placeOrder(replacement)]);
    expect(withoutKey.every(({ status }) => status === 201)).toBe(true);
    const count = await pool.query<{ count: number }>("SELECT count(*)::int AS count FROM orders");
    expect(count.rows[0]?.count).toBe(3);
  } catch (error) {
    failure = error;
  } finally {
    const stopped = await Promise.allSettled(servers.map(stopServer));
    for (const result of stopped) if (result.status === "rejected") errors.push(result.reason);
    try { await pool.end(); } catch (error) { errors.push(error); }
    try { await isolatedDatabase.close(); } catch (error) { errors.push(error); }
  }
  if (failure && errors.length) throw new AggregateError([failure, ...errors], "Process acceptance and cleanup failed.");
  if (failure) throw failure;
  if (errors.length) throw new AggregateError(errors, "Process acceptance cleanup failed.");
}, 120_000);
