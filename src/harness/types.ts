/**
 * Agent harness seam (PLAN.md T21).
 *
 * RuntimeAdapter (src/runtime.ts) abstracts *where* work runs — sandbox vs
 * computer. This interface abstracts *what agent* runs inside it: config,
 * argv, and event parsing. Clone, collect, diff, and publish are
 * harness-independent and stay in the runtime adapter.
 *
 * Shape note: the PLAN sketch shows buildConfig returning
 * { path, contents } and parseEvent returning ProgressEvent. T21 keeps the
 * narrower behavior-preserving shapes instead — the config object (the
 * runtime owns the file path, which derives from sandboxId) and progress
 * text (the runtime owns phase/fraction, which derive from the emitted
 * count). Byte-identical OpenCode output outranks the sketch; T22 can widen
 * the seam when a second harness lands.
 */
import type { CodingTaskInput } from "../opencode-input.js";

export type AgentHarnessName = "opencode" | "claude-code" | "codex" | "aider";

export interface AgentHarness {
  readonly name: AgentHarnessName;
  /** Hosts this harness must reach. Feeds Sandbox.allowedHosts (T5). */
  readonly egressHosts: string[];
  buildConfig(input: CodingTaskInput): Record<string, unknown>;
  buildArgv(input: CodingTaskInput, workdir: string): string[];
  /**
   * Parse one streamed event line into progress text. Returns null for blank
   * lines. Throws the harness's event error (e.g. OpenCodeErrorEvent) for
   * error events so the run fails honestly instead of pretending success.
   */
  parseEvent(line: string): string | null;
}
