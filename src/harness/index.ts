/** Harness registry (PLAN.md T22). Selection is by name, default OpenCode. */
import { claudeCodeHarness } from "./claude-code.js";
import { codexHarness } from "./codex.js";
import { opencodeHarness } from "./opencode.js";
import { GIT_EGRESS_HOSTS, type AgentHarness, type AgentHarnessName } from "./types.js";

export const HARNESSES: Record<string, AgentHarness> = {
  opencode: opencodeHarness,
  "claude-code": claudeCodeHarness,
  codex: codexHarness,
};

export function resolveHarness(name: string | undefined): AgentHarness {
  if (name === undefined || name.trim() === "") return opencodeHarness;
  const harness = HARNESSES[name.trim().toLowerCase()];
  if (!harness) {
    throw new Error(
      `Unknown agent harness ${JSON.stringify(name)}: expected one of ${Object.keys(HARNESSES).join(", ")}.`,
    );
  }
  return harness;
}

/**
 * Hosts a run may reach: the SELECTED harness's provider host plus git.
 * Never the union across harnesses — deny-by-default stays deny-by-default.
 */
export function allowedHostsFor(harness: AgentHarness, model: string): string[] {
  return [...harness.egressHosts(model), ...GIT_EGRESS_HOSTS];
}

export type { AgentHarness, AgentHarnessName };
