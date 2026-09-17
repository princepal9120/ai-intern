import { describe, expect, it } from "vitest";
import { estimateRunCost, SANDBOX_RATE_PER_SECOND } from "../src/costs.js";

describe("estimateRunCost", () => {
  it("estimates cost for a 5-minute run", () => {
    const durationMs = 5 * 60 * 1000;
    const tokens = 10000;
    const result = estimateRunCost({ durationMs, tokens });
    expect(result.sandboxCost).toBeCloseTo(300 * SANDBOX_RATE_PER_SECOND, 10);
    expect(result.tokenCost).toBeCloseTo(0.1, 10);
    expect(result.total).toBeCloseTo(result.sandboxCost + result.tokenCost, 10);
  });
});
