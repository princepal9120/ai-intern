/**
 * Runtime adapter seam. The default adapter wraps the Sandbox SDK.
 * An experimental adapter for @cloudflare/computer exists only as a
 * guarded refusal: Computer is preview-only, so it must never silently
 * replace the default Sandbox path.
 */
import type { CodingTaskInput, CodingTaskResult } from "./opencode-input.js";
import { DUMMY_PROVIDER_KEY } from "./provider-gateway.js";
import { boundTail, redactSecrets, shellJoin, shellQuote } from "./security.js";

export const MAX_DIFF_CHARS = 120_000;
export const MAX_STDERR_TAIL_CHARS = 8_000;
export const MAX_STDOUT_TAIL_CHARS = 30_000;
export const MAX_CAPTURED_FILES = 50;
export const MAX_FILE_CHARS = 100_000;
export const MAX_TOTAL_FILE_CHARS = 500_000;
export const OPENCODE_TIMEOUT_MS = 15 * 60 * 1000;
export const GIT_TIMEOUT_MS = 5 * 60 * 1000;

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface SandboxOps {
  gitCheckout(repoUrl: string, opts: { branch: string; targetDir: string }): Promise<void>;
  writeFile(path: string, content: string): Promise<void>;
  exec(
    command: string,
    opts?: { cwd?: string; timeoutMs?: number; env?: Record<string, string>; signal?: AbortSignal },
  ): Promise<ExecResult>;
  readFile(path: string): Promise<{ kind: "utf8"; content: string } | { kind: "base64"; content: string }>;
}

export interface ProgressEvent {
  phase: "clone" | "configure" | "code" | "collect";
  message: string;
  fraction: number;
}

export type ProgressEmitter = (event: ProgressEvent) => void | Promise<void>;

export interface RuntimeAdapter {
  readonly name: "sandbox" | "computer";
  runCodingTask(
    ops: SandboxOps,
    input: CodingTaskInput,
    emit: ProgressEmitter,
    opts?: { signal?: AbortSignal },
  ): Promise<CodingTaskResult>;
}

export const COMPUTER_PREVIEW_MESSAGE =
  "@cloudflare/computer is preview-only and not production-ready, so it is disabled. " +
  "Set RUNTIME=sandbox (the default) or wait for Computer to graduate from preview. " +
  "Sandbox remains the default isolated repository runtime.";

export class SandboxRuntimeAdapter implements RuntimeAdapter {
  readonly name = "sandbox" as const;

  async runCodingTask(
    ops: SandboxOps,
    input: CodingTaskInput,
    emit: ProgressEmitter,
    opts?: { signal?: AbortSignal },
  ): Promise<CodingTaskResult> {
    const workdir = `/workspace/${input.sandboxId}`;
    const configPath = `/workspace/${input.sandboxId}.opencode.json`;

    throwIfAborted(opts?.signal);
    await emit({ phase: "clone", message: `Cloning ${input.repoUrl} (branch ${input.baseBranch}).`, fraction: 0.05 });
    try {
      await ops.gitCheckout(input.repoUrl, { branch: input.baseBranch, targetDir: workdir });
    } catch (error) {
      return failureResult(`Clone failed: ${shortError(error)}`, 0, "");
    }

    await emit({ phase: "configure", message: "Writing isolated OpenCode config.", fraction: 0.15 });
    throwIfAborted(opts?.signal);
    try {
      await ops.writeFile(configPath, JSON.stringify(buildOpencodeConfig(input), null, 2));
    } catch (error) {
      return failureResult(`Config write failed: ${shortError(error)}`, 0, "");
    }

    await emit({ phase: "code", message: "Running OpenCode headlessly.", fraction: 0.25 });
    throwIfAborted(opts?.signal);
    const argv = buildOpencodeArgv(input, workdir);
    let run: ExecResult;
    try {
      run = await ops.exec(shellJoin(argv), {
        cwd: workdir,
        timeoutMs: OPENCODE_TIMEOUT_MS,
        signal: opts?.signal,
        env: {
          OPENCODE_CONFIG: configPath,
          OPENCODE_DISABLE_AUTOUPDATE: "true",
          GOOGLE_GENERATIVE_AI_API_KEY: DUMMY_PROVIDER_KEY,
        },
      });
    } catch (error) {
      return failureResult(`OpenCode execution failed: ${shortError(error)}`, 0, "");
    }
    const stderrTail = boundTail(run.stderr, MAX_STDERR_TAIL_CHARS);
    if (run.exitCode !== 0) {
      return failureResult(
        `OpenCode exited with code ${run.exitCode}.`,
        run.exitCode,
        stderrTail,
      );
    }

    await emit({ phase: "collect", message: "Collecting changed files and diff.", fraction: 0.85 });
    throwIfAborted(opts?.signal);
    try {
      const collection = await collectChanges(ops, workdir, opts?.signal);
      await emit({ phase: "collect", message: `Done: ${collection.changedFiles.length} changed files.`, fraction: 1 });
      return {
        status: "completed",
        exitCode: 0,
        stderrTail,
        changedFiles: collection.changedFiles,
        diff: collection.diff,
        files: collection.files,
        summary: summarizeRun(input, collection.changedFiles, boundTail(run.stdout, MAX_STDOUT_TAIL_CHARS)),
      };
    } catch (error) {
      return failureResult(`Change collection failed: ${shortError(error)}`, run.exitCode, stderrTail);
    }
  }
}

export class ComputerPreviewAdapter implements RuntimeAdapter {
  readonly name = "computer" as const;
  async runCodingTask(): Promise<CodingTaskResult> {
    throw new Error(COMPUTER_PREVIEW_MESSAGE);
  }
}

export function resolveRuntimeName(raw: string | undefined): "sandbox" | "computer" {
  if (raw === undefined || raw === "") return "sandbox";
  if (raw === "sandbox" || raw === "computer") return raw;
  throw new Error(`Unknown RUNTIME ${JSON.stringify(raw)}: expected "sandbox" or "computer".`);
}

export function createRuntimeAdapter(name: "sandbox" | "computer"): RuntimeAdapter {
  return name === "computer" ? new ComputerPreviewAdapter() : new SandboxRuntimeAdapter();
}

function failureResult(summary: string, exitCode: number, stderrTail: string): CodingTaskResult {
  return {
    status: "error",
    exitCode,
    stderrTail,
    changedFiles: [],
    diff: "",
    files: [],
    summary: redactSecrets(summary),
  };
}

function shortError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return redactSecrets(boundTail(message, 2000));
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new Error("Run cancelled.");
  }
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

function summarizeRun(input: CodingTaskInput, changedFiles: string[], stdoutTail: string): string {
  const header = `OpenCode completed for ${input.repoUrl} (${input.baseBranch}): ${changedFiles.length} changed files.`;
  if (changedFiles.length === 0) {
    return `${header} No file changes detected.`;
  }
  const preview = stdoutTail.trim().slice(-2000);
  return preview ? `${header}\n${preview}` : header;
}

interface CollectedChanges {
  changedFiles: string[];
  diff: string;
  files: Array<{ path: string; content: string; encoding: "utf8" | "base64" }>;
}

/** Parse `git status --porcelain` output into repo-relative paths. */
export function parsePorcelainStatus(output: string): string[] {
  const paths: string[] = [];
  for (const line of output.split("\n")) {
    if (line.length < 4) continue;
    const rest = line.slice(3).trim();
    if (!rest) continue;
    // Rename entries look like "old -> new"; the new path is what changed.
    const arrow = rest.indexOf(" -> ");
    const path = arrow >= 0 ? rest.slice(arrow + 4) : rest;
    const unquoted = path.startsWith('"') && path.endsWith('"') ? path.slice(1, -1) : path;
    if (unquoted && !unquoted.includes("..") && !unquoted.startsWith("/")) {
      paths.push(unquoted);
    }
  }
  return [...new Set(paths)];
}

async function collectChanges(ops: SandboxOps, workdir: string, signal?: AbortSignal): Promise<CollectedChanges> {
  const status = await ops.exec(shellJoin(["git", "status", "--porcelain"]), {
    cwd: workdir,
    timeoutMs: GIT_TIMEOUT_MS,
    signal,
  });
  if (status.exitCode !== 0) {
    throw new Error(`git status failed: ${boundTail(status.stderr, 1000)}`);
  }
  const changedFiles = parsePorcelainStatus(status.stdout).slice(0, MAX_CAPTURED_FILES);
  if (changedFiles.length > 0) {
    // Intent-to-add makes new files show up in the worktree diff.
    const add = await ops.exec(
      ["git", "add", "-N", "--", ...changedFiles].map(shellQuote).join(" "),
      { cwd: workdir, timeoutMs: GIT_TIMEOUT_MS, signal },
    );
    if (add.exitCode !== 0) {
      throw new Error(`git add failed: ${boundTail(add.stderr, 1000)}`);
    }
  }
  const diffResult = await ops.exec(shellJoin(["git", "diff", "--", "."]), {
    cwd: workdir,
    timeoutMs: GIT_TIMEOUT_MS,
    signal,
  });
  if (diffResult.exitCode !== 0) {
    throw new Error(`git diff failed: ${boundTail(diffResult.stderr, 1000)}`);
  }
  const diff = boundTail(diffResult.stdout, MAX_DIFF_CHARS);

  const files: CollectedChanges["files"] = [];
  let totalChars = 0;
  for (const path of changedFiles) {
    if (totalChars >= MAX_TOTAL_FILE_CHARS) break;
    const fullPath = `${workdir}/${path}`;
    const read = await ops.readFile(fullPath);
    if (read.kind === "utf8") {
      const content = read.content.slice(0, MAX_FILE_CHARS);
      totalChars += content.length;
      files.push({ path, content, encoding: "utf8" });
    } else {
      const content = read.content.slice(0, MAX_FILE_CHARS);
      totalChars += content.length;
      files.push({ path, content, encoding: "base64" });
    }
  }
  return { changedFiles, diff, files };
}
