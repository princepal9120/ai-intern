/**
 * OpenCode harness (PLAN.md T21).
 *
 * The pre-refactor OpenCode logic moved verbatim behind the AgentHarness
 * interface: config, argv, and event parsing. No behavior change — the
 * runtime adapter owns clone, collect, diff, publish, progress fractions,
 * and the container env. A second harness (T22) implements AgentHarness
 * beside this one; nothing here is OpenCode-specific by accident.
 */
import type { CodingTaskInput } from "../opencode-input.js";
import { DUMMY_PROVIDER_KEY } from "../provider-gateway.js";
import { boundTail } from "../security.js";
import type { AgentHarness } from "./types.js";

/** Thrown when a streamed OpenCode event line is malformed. */
export class OpenCodeEventError extends Error {}

/** Thrown when OpenCode emits an error event (type=error). */
export class OpenCodeErrorEvent extends Error {
  readonly detail: string;
  constructor(detail: string) {
    super(detail);
    this.name = "OpenCodeErrorEvent";
    this.detail = detail;
  }
}

/**
 * Parse one `--format json` event line into progress text. OpenCode emits
 * newline-delimited JSON; anything else is surfaced as an honest error.
 * Error events throw OpenCodeErrorEvent so callers can propagate them.
 */
export function parseOpencodeEvent(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  let event: unknown;
  try {
    event = JSON.parse(trimmed);
  } catch {
    throw new OpenCodeEventError(`Unparseable OpenCode event: ${boundTail(trimmed, 200)}`);
  }
  if (event === null || typeof event !== "object" || Array.isArray(event)) {
    throw new OpenCodeEventError("OpenCode event is not an object.");
  }
  const record = event as Record<string, unknown>;
  if (record.type === "error") {
    const detail = typeof record.message === "string" ? record.message : JSON.stringify(record);
    throw new OpenCodeErrorEvent(boundTail(detail, 500));
  }
  const part = record.part ?? record.parts;
  const text = typeof part === "string" ? part : summarizeUnknown(record);
  return boundTail(text.trim() || summarizeUnknown(record), 500);
}

function summarizeUnknown(record: Record<string, unknown>): string {
  const type = typeof record.type === "string" ? record.type : "event";
  const keys = Object.keys(record).filter((key) => key !== "type" && key !== "part").slice(0, 6);
  return keys.length ? `${type} (${keys.join(", ")})` : type;
}

/**
 * OpenCode uses the native Google endpoint with a dummy key. Sandbox HTTPS
 * egress rewrites provider requests to AI Gateway outside the container.
 * Only the allow-listed provider is enabled.
 */
export function buildOpencodeConfig(input: CodingTaskInput): Record<string, unknown> {
  const model = input.codingModel;
  if (!model.startsWith("google/")) {
    throw new Error(`Unsupported coding model ${JSON.stringify(model)}: only google/* models are supported.`);
  }
  return {
    $schema: "https://opencode.ai/config.json",
    model,
    enabled_providers: ["google"],
    autoupdate: false,
    provider: {
      google: {
        options: {
          apiKey: DUMMY_PROVIDER_KEY,
        },
      },
    },
  };
}

/**
 * argv for a headless JSON-event run. Callers must quote with shellJoin;
 * never interpolate the task into a shell string by hand.
 */
export function buildOpencodeArgv(input: CodingTaskInput, workdir: string): string[] {
  return [
    "opencode",
    "run",
    "--format",
    "json",
    "--model",
    input.codingModel,
    "--dir",
    workdir,
    input.task,
  ];
}

export class OpenCodeHarness implements AgentHarness {
  readonly name = "opencode" as const;
  readonly egressHosts = ["generativelanguage.googleapis.com"];

  buildConfig(input: CodingTaskInput): Record<string, unknown> {
    return buildOpencodeConfig(input);
  }

  buildArgv(input: CodingTaskInput, workdir: string): string[] {
    return buildOpencodeArgv(input, workdir);
  }

  parseEvent(line: string): string | null {
    return parseOpencodeEvent(line);
  }
}

export const opencodeHarness = new OpenCodeHarness();
