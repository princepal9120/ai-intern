/**
 * Planning and delegation agent. It never edits repositories itself:
 * the only repository-touching capability is delegate_coding_task, which
 * requires explicit human approval and runs inside an isolated Sandbox
 * container driven by OpenCodeAgent.
 */
import { Think } from "@cloudflare/think";
import { agentTool } from "agents/agent-tools";
import { tool, type ToolSet } from "ai";
import { z } from "zod";
import type { Env } from "../env.js";
import {
  formatAgentToolInput,
  type CodingTaskInput,
} from "../opencode-input.js";
import {
  MAX_CONCURRENT_RUNS,
  canStartRun,
  createRun,
  transitionRun,
  type DelegatedRun,
  type RunStatus,
} from "../runs.js";
import { makeSandboxId, parseGitHubRepoUrl, redactSecrets } from "../security.js";
import { OpenCodeAgent } from "./opencode-agent.js";

export interface OrchestratorState {
  runs: DelegatedRun[];
}

const delegateInputSchema = z.object({
  repoUrl: z.string().describe("HTTPS GitHub repository URL, e.g. https://github.com/owner/repo."),
  task: z.string().describe("The coding task to perform in the repository."),
  baseBranch: z
    .string()
    .optional()
    .default("main")
    .describe("Base branch to clone. Defaults to main."),
  publishPullRequest: z
    .boolean()
    .optional()
    .default(false)
    .describe("Open a pull request with the result. Requires GITHUB_TOKEN."),
});

type DelegateInput = z.infer<typeof delegateInputSchema>;

const DEFAULT_ORCHESTRATOR_MODEL = "@cf/meta/llama-3.1-8b-instruct";
const DEFAULT_CODING_MODEL = "google/gemini-2.0-flash";

export class CodingOrchestrator extends Think<Env, OrchestratorState> {
  /** The orchestrator plans and delegates; it never runs shell commands. */
  override workspaceBash = false;

  private runs(): DelegatedRun[] {
    return this.state?.runs ?? [];
  }

  private saveRuns(runs: DelegatedRun[]): void {
    this.setState({ runs });
  }

  override getModel(): string {
    return this.env.ORCHESTRATOR_MODEL || DEFAULT_ORCHESTRATOR_MODEL;
  }

  override getSystemPrompt(): string {
    return [
      "You are AI Intern, a planning and delegation agent.",
      "You never edit repositories yourself. When the user describes a coding task,",
      "call delegate_coding_task with the repository URL and the task.",
      "The tool requires human approval before anything runs: summarize exactly",
      "what will happen (repository, branch, task, whether a pull request is requested).",
      "After the run finishes, report the summary, changed files, and diff to the user.",
      "If the run fails, report the failure honestly with the exit code and error.",
    ].join(" ");
  }

  override getTools(): ToolSet {
    const child = agentTool(OpenCodeAgent, {
      description:
        "Delegate a coding task to an isolated Cloudflare Sandbox container running OpenCode. " +
        "The container clones the repository, runs the task headlessly, and returns changed files plus a unified diff.",
      inputSchema: delegateInputSchema,
      displayName: "Sandbox coding run",
    });
    const childExecute = child.execute;
    if (typeof childExecute !== "function") {
      throw new Error("delegate_coding_task misconfigured: child tool has no execute function.");
    }
    const delegate = tool({
      description:
        "Delegate a coding task to an isolated Cloudflare Sandbox container running OpenCode. " +
        "Requires human approval before anything runs.",
      inputSchema: delegateInputSchema,
      needsApproval: true,
      execute: async (input: DelegateInput, options?: { toolCallId?: string }) => {
        return this.executeDelegatedTask(input, childExecute, options?.toolCallId);
      },
    });
    return { ...super.getTools(), delegate_coding_task: delegate };
  }

  private async executeDelegatedTask(
    input: DelegateInput,
    childExecute: NonNullable<ReturnType<typeof agentTool>["execute"]>,
    toolCallId: string | undefined,
  ): Promise<string> {
    const runs = this.runs();
    if (!canStartRun(runs)) {
      throw new Error(
        `Already running ${MAX_CONCURRENT_RUNS} coding tasks. Wait for one to finish before starting another.`,
      );
    }
    parseGitHubRepoUrl(input.repoUrl);
    if (input.publishPullRequest && !this.env.GITHUB_TOKEN) {
      throw new Error(
        "publishPullRequest was requested but GITHUB_TOKEN is not configured. " +
          "Set the GITHUB_TOKEN secret or retry without requesting a pull request.",
      );
    }
    const origin = (this.env.WORKER_ORIGIN ?? "").replace(/\/+$/, "");
    if (!origin) {
      throw new Error(
        "WORKER_ORIGIN is not configured, so the sandbox cannot reach the provider gateway. " +
          "Set WORKER_ORIGIN to the public URL of this Worker.",
      );
    }
    const callId = toolCallId ?? crypto.randomUUID();
    const runId = `agent-tool:${callId}`;
    const sandboxId = makeSandboxId(input.repoUrl, input.task, callId);
    const fullInput: CodingTaskInput = {
      repoUrl: input.repoUrl,
      task: input.task,
      baseBranch: input.baseBranch,
      publishPullRequest: input.publishPullRequest,
      sandboxId,
      codingModel: this.env.CODING_MODEL || DEFAULT_CODING_MODEL,
      providerBaseUrl: `${origin}/api/provider/google`,
    };
    this.saveRuns([
      ...runs,
      createRun({
        runId,
        sandboxId,
        repoUrl: fullInput.repoUrl,
        task: fullInput.task,
        baseBranch: fullInput.baseBranch,
        publishPullRequest: fullInput.publishPullRequest,
      }),
    ]);
    const finish = (status: RunStatus, patch?: { summary?: string; error?: string }) => {
      this.saveRuns(
        this.runs().map((run) => (run.runId === runId ? transitionRun(run, status, patch) : run)),
      );
    };
    this.markRunning(runId);
    try {
      const output = await childExecute(formatAgentToolInput(fullInput), { toolCallId: callId });
      if (typeof output === "string") {
        finish("completed", { summary: output.slice(0, 4000) });
        return output;
      }
      const message = `Coding run failed: ${JSON.stringify(output).slice(0, 2000)}`;
      finish("error", { error: redactSecrets(message) });
      throw new Error(message);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      finish("error", { error: redactSecrets(message).slice(0, 4000) });
      throw error;
    }
  }

  private markRunning(runId: string): void {
    this.saveRuns(
      this.runs().map((run) => (run.runId === runId ? transitionRun(run, "running") : run)),
    );
  }

  /** Cancel a retained run and destroy its sandbox. Returns null when unknown. */
  async cancelRun(runId: string): Promise<DelegatedRun | null> {
    const run = this.runs().find((candidate) => candidate.runId === runId) ?? null;
    if (!run) return null;
    this.saveRuns(
      this.runs().map((candidate) =>
        candidate.runId === runId ? transitionRun(candidate, "cancelled") : candidate,
      ),
    );
    try {
      const { getSandbox } = await import("@cloudflare/sandbox");
      await getSandbox(this.env.Sandbox, run.sandboxId).destroy();
    } catch (error) {
      // Best effort: the registry already records the cancellation.
      console.warn(`Failed to destroy sandbox ${run.sandboxId}: ${redactSecrets(String(error))}`);
    }
    return { ...run, status: "cancelled" as const };
  }

  async clearRuns(): Promise<void> {
    this.saveRuns([]);
  }

  override async onRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const match = url.pathname.match(/^\/api\/runs(?:\/([^/]+))?$/);
    if (!match) {
      return super.onRequest(request);
    }
    const id = match[1] ? decodeURIComponent(match[1]) : null;
    if (request.method === "GET" && id === null) {
      return Response.json({ runs: this.runs() });
    }
    if (request.method === "DELETE" && id === null) {
      await this.clearRuns();
      return Response.json({ ok: true });
    }
    if (id !== null && request.method === "GET") {
      const run = this.runs().find((candidate) => candidate.runId === id) ?? null;
      return run ? Response.json({ run }) : Response.json({ error: "Run not found." }, { status: 404 });
    }
    if (id !== null && request.method === "DELETE") {
      const run = await this.cancelRun(id);
      return run ? Response.json({ run }) : Response.json({ error: "Run not found." }, { status: 404 });
    }
    return Response.json({ error: "Method not allowed." }, { status: 405 });
  }
}
