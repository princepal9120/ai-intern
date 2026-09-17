/**
 * Container egress handlers. They run in the Worker, not the container, so
 * credentials are attached here and never reach repository processes.
 *
 * Kept out of sandbox.ts: that module imports the Sandbox SDK, which pulls
 * `cloudflare:` builtins and cannot be loaded by the node test runner.
 */
import type { Env as WorkerEnv } from "./env.js";
import { sanitizeContainerHeaders, stripCredentialParams } from "./provider-gateway.js";

export type EgressEnv = Pick<WorkerEnv, "AI" | "GATEWAY_ID" | "AI_GATEWAY_TOKEN" | "GITHUB_TOKEN">;

/**
 * Handler ctx carries the per-run params passed to `setOutboundByHost`. The
 * SDK types `params` as `unknown`, so the shape is narrowed at the use site.
 */
export interface OutboundHandlerCtx {
  params?: unknown;
}

function approvedPath(ctx?: OutboundHandlerCtx): string | undefined {
  const params = ctx?.params;
  if (typeof params !== "object" || params === null) return undefined;
  const value = (params as { allowedPath?: unknown }).allowedPath;
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function outboundHeaders(request: Request): Headers {
  const headers = sanitizeContainerHeaders(request.headers);
  // Gateway controls and credentials must not be chosen by repository code.
  for (const name of [...headers.keys()]) {
    if (name.startsWith("cf-aig-")) headers.delete(name);
  }
  headers.delete("host");
  headers.delete("cookie");
  headers.delete("proxy-authorization");
  return headers;
}

/**
 * The AI Gateway provider slug behind each API host. Adding a harness (T22)
 * means adding an entry here, not a new mechanism.
 */
export const GATEWAY_PROVIDERS: Record<string, string> = {
  "generativelanguage.googleapis.com": "google-ai-studio",
  "api.anthropic.com": "anthropic",
  "api.openai.com": "openai",
};

async function forwardProvider(request: Request, env: EgressEnv, host: string): Promise<Response> {
  const source = new URL(request.url);
  if (source.protocol !== "https:" || source.hostname !== host) {
    return new Response("Invalid provider destination.", { status: 403 });
  }
  if (request.method !== "POST" && request.method !== "GET") {
    return new Response("Method not allowed.", { status: 405 });
  }
  const slug = GATEWAY_PROVIDERS[host];
  if (!slug) {
    return new Response("Invalid provider destination.", { status: 403 });
  }
  try {
    // getUrl resolves the account from the binding; no account-id var or public callback.
    const base = await env.AI.gateway(env.GATEWAY_ID || "default").getUrl(slug);
    const target = new URL(base);
    target.pathname = `${target.pathname.replace(/\/+$/, "")}${source.pathname}`;
    target.search = stripCredentialParams(source.search);
    const headers = outboundHeaders(request);
    if (env.AI_GATEWAY_TOKEN) headers.set("cf-aig-authorization", `Bearer ${env.AI_GATEWAY_TOKEN}`);
    // The gateway injects its stored BYOK credential; preserve the native body/stream.
    return await fetch(target, {
      method: request.method,
      headers,
      body: request.method === "POST" ? request.body : undefined,
      redirect: "manual",
    });
  } catch {
    // Fetch errors can embed authenticated request details; never return or log them.
    return new Response("Provider gateway request failed.", { status: 502 });
  }
}

export function forwardGoogle(request: Request, env: EgressEnv): Promise<Response> {
  return forwardProvider(request, env, "generativelanguage.googleapis.com");
}

export function forwardAnthropic(request: Request, env: EgressEnv): Promise<Response> {
  return forwardProvider(request, env, "api.anthropic.com");
}

export function forwardOpenAI(request: Request, env: EgressEnv): Promise<Response> {
  return forwardProvider(request, env, "api.openai.com");
}

async function forwardGitHub(request: Request, env: EgressEnv): Promise<Response> {
  const target = new URL(request.url);
  if (target.protocol !== "https:" || target.hostname !== "github.com") {
    return new Response("Invalid repository destination.", { status: 403 });
  }
  target.username = "";
  target.password = "";
  target.search = stripCredentialParams(target.search);
  const headers = outboundHeaders(request);
  if (env.GITHUB_TOKEN) {
    headers.set("Authorization", `Basic ${btoa(`x-access-token:${env.GITHUB_TOKEN}`)}`);
  }
  try {
    return await fetch(target, {
      method: request.method,
      headers,
      body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
      redirect: "manual",
    });
  } catch {
    return new Response("Repository request failed.", { status: 502 });
  }
}

/**
 * True only for the approved repo itself, not a sibling that shares its prefix:
 * `/o/repo-evil` must not match `/o/repo`. GitHub paths are case-insensitive.
 */
export function isWithinRepoScope(pathname: string, allowedPath: string): boolean {
  const path = pathname.toLowerCase();
  const scope = allowedPath.toLowerCase();
  if (!scope.startsWith("/") || scope === "/") return false;
  if (path === scope || path === `${scope}.git`) return true;
  return path.startsWith(`${scope}/`) || path.startsWith(`${scope}.git/`);
}

/**
 * B6: the credential is scoped to the one repo this run was approved for, so
 * repository code cannot reach every other repo the token can.
 */
export async function forwardGitHubScoped(
  request: Request,
  env: EgressEnv,
  ctx?: OutboundHandlerCtx,
): Promise<Response> {
  const allowedPath = approvedPath(ctx);
  if (!allowedPath) {
    return new Response("Repository scope was never approved for this run.", { status: 403 });
  }
  const target = new URL(request.url);
  if (target.protocol !== "https:" || target.hostname !== "github.com") {
    return new Response("Invalid repository destination.", { status: 403 });
  }
  if (!isWithinRepoScope(target.pathname, allowedPath)) {
    return new Response("Repository outside the approved scope.", { status: 403 });
  }
  return forwardGitHub(request, env);
}

/** No run has claimed a repo yet, so no credential may leave. */
export function denyUnscopedGitHub(): Promise<Response> {
  return Promise.resolve(
    new Response("Repository scope was never approved for this run.", { status: 403 }),
  );
}
