/**
 * Worker entry. Serves the dashboard from Static Assets, routes Agent
 * traffic, exposes the retained run registry, and verifies GitHub webhooks.
 * Provider traffic is intercepted at the Sandbox egress boundary — no callback route.
 */
import { ContainerProxy, proxyToSandbox, type Sandbox as SandboxBinding } from "@cloudflare/sandbox";
import { getAgentByName, routeAgentRequest } from "agents/routing";
import { OpenCodeAgent } from "./agents/opencode-agent.js";
import { CodingOrchestrator } from "./agents/orchestrator.js";
import type { Env } from "./env.js";
import { Sandbox } from "./sandbox.js";
import { redactSecrets, verifyGitHubWebhookSignature } from "./security.js";
import { handleSlackEvents } from "./slack-events.js";
import { handleSlackCommand } from "./slack-routes.js";

export { CodingOrchestrator, OpenCodeAgent, Sandbox, ContainerProxy };

export function getUserId(request: Request): string | null {
  const email = request.headers.get("CF-Access-Authenticated-User-Email");
  if (!email || email.trim() === "") {
    return null;
  }
  return email;
}

// Signature-authenticated paths must not sit behind Access; Slack and GitHub
// cannot complete an Access login. Write the exemption with T7, not T12.
export const SIGNATURE_AUTHENTICATED = ["/api/slack/", "/api/github/webhook"];

export function isAuthenticated(request: Request, env: Env): boolean {
  const { pathname } = new URL(request.url);
  if (SIGNATURE_AUTHENTICATED.some((p) => pathname.startsWith(p))) return true;
  if (!env.REQUIRE_ACCESS) return true; // opt-out for `wrangler dev`
  return request.headers.has("cf-access-authenticated-user-email");
}

async function handleRuns(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/runs")) {
    return null;
  }
  if (!isAuthenticated(request, env)) {
    return Response.json({ error: "Authentication required." }, { status: 401 });
  }
  // With REQUIRE_ACCESS set, isAuthenticated already guarantees the header.
  // Without it (wrangler dev), fall back to the shared "default" orchestrator.
  const userId = getUserId(request) ?? "default";
  const stub = await getAgentByName(env.CodingOrchestrator, userId);
  const rewritten = new Request(new URL(url.pathname + url.search, request.url), request);
  return stub.fetch(rewritten);
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
  async fetch(request: Request, env: Env, ctx?: ExecutionContext): Promise<Response> {
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
      const slackEventsResponse = await handleSlackEvents(request, env, ctx ?? { waitUntil: () => {} } as unknown as ExecutionContext);
      if (slackEventsResponse) {
        return slackEventsResponse;
      }
      const slackResponse = await handleSlackCommand(request, env);
      if (slackResponse) {
        return slackResponse;
      }
      const webhookResponse = await handleGitHubWebhook(request, env);
      if (webhookResponse) {
        return webhookResponse;
      }
      // Layer 2 — fail closed in the Worker. Access gate for the agent
      // WebSocket/HTTP routes and the dashboard assets. Signature-
      // authenticated Slack/GitHub routes already returned above.
      // NOTE: header check is not JWT verification; the route must stay
      // behind Access. JWT verification is filed as v0.2.
      if (!isAuthenticated(request, env)) {
        return Response.json({ error: "Authentication required." }, { status: 401 });
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
