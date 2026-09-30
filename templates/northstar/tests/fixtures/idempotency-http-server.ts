import { buildApp } from "../../src/app.js";
import { createIdempotencyHarness } from "../../src/services/idempotency-harness.js";

if (!process.send || !process.env.DATABASE_URL) {
  throw new Error("This fixture requires an isolated acceptance parent and database.");
}
const harness = await createIdempotencyHarness({ databaseUrl: process.env.DATABASE_URL });
const app = buildApp(harness.services[0]);
app.addHook("onClose", () => harness.close());
let closing = false;
const close = async () => {
  if (closing) return;
  closing = true;
  await app.close();
  process.exit(0);
};
process.once("SIGTERM", () => { void close(); });
process.once("SIGINT", () => { void close(); });
const url = await app.listen({ host: "127.0.0.1", port: 0 });
process.send({ schema: "northstar/acceptance-server/1", url, pid: process.pid });
