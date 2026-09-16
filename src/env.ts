/**
 * Worker environment. Non-secret settings are plain vars from
 * wrangler.jsonc; credentials are Wrangler secrets and never leave
 * Worker code.
 */
import type { OpenCodeAgent } from "./agents/opencode-agent.js";
import type { CodingOrchestrator } from "./agents/orchestrator.js";
import type { Sandbox } from "./sandbox.js";

export interface Env {
  AI: Ai;
  CodingOrchestrator: DurableObjectNamespace<CodingOrchestrator>;
  OpenCodeAgent: DurableObjectNamespace<OpenCodeAgent>;
  Sandbox: DurableObjectNamespace<Sandbox>;
  ASSETS: Fetcher;
  /** AI Gateway id. Default "default". */
  GATEWAY_ID: string;
  /** Model id for the parent planning agent (Workers AI id). */
  ORCHESTRATOR_MODEL: string;
  /** Coding model in opencode provider/model format, e.g. google/gemini-2.0-flash. */
  CODING_MODEL: string;
  /** Account id that owns the AI Gateway. Required for provider calls. */
  CF_ACCOUNT_ID?: string;
  /** Public origin of this Worker, e.g. https://ai-intern.example.workers.dev. */
  WORKER_ORIGIN?: string;
  /** "sandbox" (default) or "computer" (preview-only refusal). */
  RUNTIME?: string;
  /** Optional. Required only to open pull requests. Never sent to containers. */
  GITHUB_TOKEN?: string;
  /** Optional. Server-side credential for AI Gateway. Never sent to containers. */
  AI_GATEWAY_TOKEN?: string;
  /** Optional. Verifies incoming GitHub webhook signatures. */
  GITHUB_WEBHOOK_SECRET?: string;
}
