import { describe, expect, it } from "vitest";
import { InMemoryOrderRepository } from "../../src/repositories/in-memory-order-repository.js";
import { BasicOrderService } from "../../src/services/order-service.js";

describe("BasicOrderService", () => {
  it("creates an order", async () => {
    const repository = new InMemoryOrderRepository();
    const service = new BasicOrderService(repository);

    const result = await service.placeOrder({ sku: "WIDGET-1", quantity: 2 });

    expect(result.statusCode).toBe(201);
    expect(result.replayed).toBe(false);
    expect(result.order).toMatchObject({ sku: "WIDGET-1", quantity: 2 });
    expect(await repository.count()).toBe(1);
  });

  it("does not provide idempotency in the baseline implementation", async () => {
    const repository = new InMemoryOrderRepository();
    const service = new BasicOrderService(repository);

    const first = await service.placeOrder({ sku: "WIDGET-1", quantity: 1 }, "retry-key");
    const second = await service.placeOrder({ sku: "WIDGET-1", quantity: 1 }, "retry-key");

    expect(first.order.id).not.toBe(second.order.id);
    expect(await repository.count()).toBe(2);
  });
});

