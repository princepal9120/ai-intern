import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const CONFIG = readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8");

describe("wrangler cron triggers (finding #4)", () => {
  it("configures no cron until a scheduled() handler ships", () => {
    expect(CONFIG).not.toContain('"triggers"');
    expect(CONFIG).not.toContain("crons");
  });
});
