import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../../src/app.js";
import { InMemoryOrderRepository } from "../../src/repositories/in-memory-order-repository.js";
import { BasicOrderService } from "../../src/services/order-service.js";

const apps: ReturnType<typeof buildApp>[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe("POST /orders", () => {
  it("returns a created order", async () => {
    const app = buildApp(new BasicOrderService(new InMemoryOrderRepository()));
    apps.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/orders",
      payload: { sku: "WIDGET-1", quantity: 2 },
    });

    expect(response.statusCode).toBe(201);
    expect(response.headers["x-idempotent-replay"]).toBe("false");
    expect(response.json()).toMatchObject({ sku: "WIDGET-1", quantity: 2 });
  });

  it("rejects invalid input without echoing the payload", async () => {
    const app = buildApp(new BasicOrderService(new InMemoryOrderRepository()));
    apps.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/orders",
      payload: { sku: "contains spaces", quantity: 0 },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: "invalid_order",
      message: "sku must contain 3-32 uppercase letters, numbers, or hyphens",
    });
  });
});

