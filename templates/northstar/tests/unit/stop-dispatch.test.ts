import { describe, expect, it } from "vitest";
import { selectStopHandler } from "../../scripts/stop-dispatch.mjs";

describe("single role-aware Stop dispatcher", () => {
  it("routes only the explicit matching task role", () => {
    expect(selectStopHandler({ role: "plan", sessionId: "session-1" }, { session_id: "session-1" })).toBe("plan-stop.mjs");
    expect(selectStopHandler({ role: "implement", sessionId: "session-1" }, { sessionId: "session-1" })).toBe("agent-stop.mjs");
    expect(selectStopHandler(null, {})).toBeNull();
    expect(selectStopHandler({ role: "review" }, {})).toBeNull();
    expect(() => selectStopHandler({ role: "implement", sessionId: "old" }, { session_id: "new" })).toThrow(/does not match/);
  });
});
