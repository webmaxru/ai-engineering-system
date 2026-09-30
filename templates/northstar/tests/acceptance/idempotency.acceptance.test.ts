import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../src/app.js";
import { IdempotencyConflictError } from "../../src/domain/order.js";
import {
  createIdempotencyHarness,
  type IdempotencyHarness,
} from "../../src/services/idempotency-harness.js";
import {
  createIsolatedPostgresDatabase,
  type IsolatedPostgresDatabase,
} from "./postgres-test-database.js";

describe.sequential("WI-1842 idempotency acceptance", () => {
  let harness: IdempotencyHarness;
  let isolatedDatabase: IsolatedPostgresDatabase | undefined;

  beforeEach(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (databaseUrl) {
      isolatedDatabase = await createIsolatedPostgresDatabase(databaseUrl);
      harness = await createIdempotencyHarness({
        databaseUrl: isolatedDatabase.connectionString,
      });
    } else {
      harness = await createIdempotencyHarness({});
    }
    await harness.reset();
  });

  afterEach(async () => {
    const errors: unknown[] = [];
    try {
      await harness?.close();
    } catch (error) {
      errors.push(error);
    }
    try {
      await isolatedDatabase?.close();
    } catch (error) {
      errors.push(error);
    }
    isolatedDatabase = undefined;
    if (errors.length > 0) {
      throw new AggregateError(errors, "Idempotency acceptance cleanup failed.");
    }
  });

  it("replays the original response on the same instance", async () => {
    const first = await harness.services[0].placeOrder(
      { sku: "WIDGET-1", quantity: 2 },
      "same-instance-key",
    );
    const replay = await harness.services[0].placeOrder(
      { sku: "WIDGET-1", quantity: 2 },
      "same-instance-key",
    );

    expect(replay.order.id).toBe(first.order.id);
    expect(replay.statusCode).toBe(200);
    expect(replay.replayed).toBe(true);
    expect(await harness.orderCount()).toBe(1);
  });

  it("replays the original response across instances", async () => {
    const first = await harness.services[0].placeOrder(
      { sku: "WIDGET-1", quantity: 2 },
      "cross-instance-key",
    );
    const replay = await harness.services[1].placeOrder(
      { sku: "WIDGET-1", quantity: 2 },
      "cross-instance-key",
    );

    expect(replay.order.id).toBe(first.order.id);
    expect(replay.replayed).toBe(true);
    expect(await harness.orderCount()).toBe(1);
  });

  it("rejects a different payload for the same key", async () => {
    await harness.services[0].placeOrder(
      { sku: "WIDGET-1", quantity: 1 },
      "conflict-key",
    );

    await expect(
      harness.services[1].placeOrder(
        { sku: "WIDGET-1", quantity: 2 },
        "conflict-key",
      ),
    ).rejects.toBeInstanceOf(IdempotencyConflictError);
    expect(await harness.orderCount()).toBe(1);
  });

  it("creates exactly one order under concurrent cross-instance retries", async () => {
    const requests = Array.from({ length: 12 }, (_, index) =>
      harness.services[index % 2]!.placeOrder(
        { sku: "WIDGET-1", quantity: 3 },
        "concurrent-key",
      ),
    );
    const results = await Promise.all(requests);

    expect(new Set(results.map((result) => result.order.id)).size).toBe(1);
    expect(results.filter((result) => result.replayed).length).toBe(11);
    expect(await harness.orderCount()).toBe(1);
  });

  it("preserves baseline behavior without an idempotency key", async () => {
    const first = await harness.services[0].placeOrder({ sku: "WIDGET-1", quantity: 1 });
    const second = await harness.services[1].placeOrder({ sku: "WIDGET-1", quantity: 1 });

    expect(first.order.id).not.toBe(second.order.id);
    expect(await harness.orderCount()).toBe(2);
  });

  it("emits replay and conflict metrics", async () => {
    await harness.services[0].placeOrder({ sku: "WIDGET-1", quantity: 1 }, "metric-key");
    await harness.services[1].placeOrder({ sku: "WIDGET-1", quantity: 1 }, "metric-key");
    await expect(
      harness.services[0].placeOrder({ sku: "WIDGET-2", quantity: 1 }, "metric-key"),
    ).rejects.toBeInstanceOf(IdempotencyConflictError);

    expect(harness.metrics.snapshot()).toEqual({ replays: 1, conflicts: 1 });
  });

  it("exposes replay and conflict behavior through two HTTP app instances", async () => {
    const firstApp = buildApp(harness.services[0]);
    const secondApp = buildApp(harness.services[1]);

    try {
      const first = await firstApp.inject({
        method: "POST",
        url: "/orders",
        headers: { "idempotency-key": "http-cross-instance-key" },
        payload: { sku: "WIDGET-1", quantity: 4 },
      });
      const replay = await secondApp.inject({
        method: "POST",
        url: "/orders",
        headers: { "idempotency-key": "http-cross-instance-key" },
        payload: { sku: "WIDGET-1", quantity: 4 },
      });
      const conflict = await secondApp.inject({
        method: "POST",
        url: "/orders",
        headers: { "idempotency-key": "http-cross-instance-key" },
        payload: { sku: "WIDGET-2", quantity: 4 },
      });

      expect(first.statusCode).toBe(201);
      expect(replay.statusCode).toBe(200);
      expect(replay.headers["x-idempotent-replay"]).toBe("true");
      expect(replay.json().id).toBe(first.json().id);
      expect(conflict.statusCode).toBe(409);
      expect(await harness.orderCount()).toBe(1);
    } finally {
      await Promise.all([firstApp.close(), secondApp.close()]);
    }
  });
});
