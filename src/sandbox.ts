/**
 * Isolated repository runtime. Credentials are attached by outbound handlers
 * in the Worker, never by the container or its repository processes.
 */
import { Sandbox as SandboxBase } from "@cloudflare/sandbox";
import type { Env as WorkerEnv } from "./env.js";
import { sanitizeContainerHeaders, stripCredentialParams } from "./provider-gateway.js";

type EgressEnv = Pick<WorkerEnv, "AI" | "GATEWAY_ID" | "AI_GATEWAY_TOKEN" | "GITHUB_TOKEN">;

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

async function forwardGoogle(request: Request, env: EgressEnv): Promise<Response> {
  const source = new URL(request.url);
  if (source.protocol !== "https:" || source.hostname !== "generativelanguage.googleapis.com") {
    return new Response("Invalid provider destination.", { status: 403 });
  }
  if (request.method !== "POST" && request.method !== "GET") {
    return new Response("Method not allowed.", { status: 405 });
  }
  try {
    // getUrl resolves the account from the binding; no account-id var or public callback.
    const base = await env.AI.gateway(env.GATEWAY_ID || "default").getUrl("google-ai-studio");
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

export class Sandbox<Env = WorkerEnv> extends SandboxBase<Env> {
  override defaultPort = 3000;
  override sleepAfter = "1m";
  override interceptHttps = true;

  /**
   * Deny-by-default egress allowlist. Anything unlisted cannot leave the
   * container, including from repository code OpenCode runs.
   *
   * Instance property (not static): the base Container class declares
   * `allowedHosts?: string[]` as an instance member and the egress gate
   * reads `this.allowedHosts` at runtime.
   */
  override allowedHosts = [
    "generativelanguage.googleapis.com",
    "github.com",
    "codeload.github.com", // git clone fetches packs here
  ];

  static override get outboundByHost() {
    return {
      "generativelanguage.googleapis.com": forwardGoogle,
      "github.com": forwardGitHub,
    };
  }
}
