/**
 * Worker entry. Serves the dashboard from Static Assets, routes Agent
 * traffic, proxies provider calls through AI Gateway, exposes the
 * retained run registry, and verifies GitHub webhooks.
 */
import { ContainerProxy, proxyToSandbox, type Sandbox as SandboxBinding } from "@cloudflare/sandbox";
import { getAgentByName, routeAgentRequest } from "agents/routing";
import { OpenCodeAgent } from "./agents/opencode-agent.js";
import { CodingOrchestrator } from "./agents/orchestrator.js";
import type { Env } from "./env.js";
import { Sandbox } from "./sandbox.js";
import { redactSecrets, verifyGitHubWebhookSignature } from "./security.js";

export { CodingOrchestrator, OpenCodeAgent, Sandbox, ContainerProxy };

const ORCHESTRATOR_NAME = "default";

async function handleRuns(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/runs")) {
    return null;
  }
  const stub = await getAgentByName(env.CodingOrchestrator, ORCHESTRATOR_NAME);
  const rewritten = new Request(new URL(url.pathname + url.search, request.url), request);
  return stub.fetch(rewritten);
}

async function handleProvider(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/api\/provider\/(google)(?:\/(.*))?$/);
  if (!match) {
    return null;
  }
  return Response.json(
    { error: "Provider callback disabled pending authenticated Sandbox egress integration." },
    { status: 503 },
  );
}

async function handleGitHubWebhook(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== "/api/github/webhook" || request.method !== "POST") {
    return null;
  }
  const secret = env.GITHUB_WEBHOOK_SECRET ?? "";
  if (!secret) {
    return Response.json(
      { error: "Webhooks are not configured: set the GITHUB_WEBHOOK_SECRET secret." },
      { status: 503 },
    );
  }
  const payload = await request.text();
  const signature = request.headers.get("x-hub-signature-256");
  const valid = await verifyGitHubWebhookSignature({ secret, payload, signature });
  if (!valid) {
    return Response.json({ error: "Invalid webhook signature." }, { status: 401 });
  }
  let event: unknown = null;
  try {
    event = JSON.parse(payload);
  } catch {
    return Response.json({ error: "Webhook payload is not valid JSON." }, { status: 400 });
  }
  const action = typeof event === "object" && event !== null
    ? (event as { action?: unknown }).action
    : undefined;
  return Response.json({
    ok: true,
    event: request.headers.get("x-github-event") ?? "unknown",
    action: typeof action === "string" ? action : null,
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      // proxyToSandbox only needs the Sandbox binding; adapt the type.
      const sandboxEnv = {
        Sandbox: env.Sandbox as unknown as DurableObjectNamespace<SandboxBinding>,
      };
      const sandboxResponse = await proxyToSandbox(request, sandboxEnv);
      if (sandboxResponse) {
        return sandboxResponse;
      }
      const runsResponse = await handleRuns(request, env);
      if (runsResponse) {
        return runsResponse;
      }
      const providerResponse = await handleProvider(request);
      if (providerResponse) {
        return providerResponse;
      }
      const webhookResponse = await handleGitHubWebhook(request, env);
      if (webhookResponse) {
        return webhookResponse;
      }
      const agentResponse = await routeAgentRequest(request, env);
      if (agentResponse) {
        return agentResponse;
      }
      return env.ASSETS.fetch(request);
    } catch (error) {
      const message = redactSecrets(error instanceof Error ? error.message : String(error));
      return Response.json({ error: message }, { status: 500 });
    }
  },
} satisfies ExportedHandler<Env>;
