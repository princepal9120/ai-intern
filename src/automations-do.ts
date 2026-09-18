/**
 * Durable Object that owns automation records and the fire path.
 * One instance (`default`) holds the full set so scheduled ticks and
 * webhooks share lastTriggeredAt / daily budget / lastSkip.
 */
import { getAgentByName } from "agents/routing";
import {
  AUTOMATIONS_DO_NAME,
  fireMatchingAutomations,
  githubWebhookToEvent,
  slackEventToAutomation,
  type FireAutomationDeps,
} from "./automation-runner.js";
import {
  AutomationStore,
  automationsEnabled,
  collectDueSchedules,
  createAutomation,
  parseAutomationWebhookPath,
  verifyWebhookSecret,
  type Automation,
  type AutomationMatchEvent,
  type CreateAutomationInput,
} from "./automations.js";
import type { Env } from "./env.js";
import { InputError } from "./security.js";
import { ORCHESTRATOR_NAME } from "./slack-routes.js";

export { AUTOMATIONS_DO_NAME };

export interface AutomationsState {
  items: Automation[];
}

export interface OrchestratorStub {
  fetch: (request: Request) => Promise<Response>;
}

async function queueOnOrchestrator(
  stub: OrchestratorStub,
  input: { repoUrl: string; task: string; publishPullRequest: boolean; threadKey: string },
): Promise<{ approvalId: string }> {
  const queued = await stub.fetch(
    new Request("https://internal/api/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
  if (!queued.ok) throw new Error(`Queue failed (${queued.status}).`);
  const body = (await queued.json().catch(() => ({}))) as { approvalId?: string };
  if (!body.approvalId) throw new Error("Orchestrator did not return an approval id.");
  return { approvalId: body.approvalId };
}

async function resolveOnOrchestrator(
  stub: OrchestratorStub,
  input: { threadKey: string; approvalId: string; approved: boolean; decidedBy: string },
): Promise<void> {
  const resolved = await stub.fetch(
    new Request("https://internal/api/approvals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
  if (!resolved.ok) throw new Error(`Auto-approve failed (${resolved.status}).`);
}

export class Automations {
  constructor(
    private readonly ctx: DurableObjectState,
    private readonly env: Env,
  ) {}

  private storeFrom(items: Automation[]): AutomationStore {
    const store = new AutomationStore();
    for (const item of items) store.upsert(item);
    return store;
  }

  private async load(): Promise<AutomationStore> {
    const state = (await this.ctx.storage.get<AutomationsState>("state")) ?? { items: [] };
    return this.storeFrom(state.items);
  }

  private async save(store: AutomationStore): Promise<void> {
    await this.ctx.storage.put("state", { items: store.list() } satisfies AutomationsState);
  }

  private fireDeps(orchestrator: OrchestratorStub, nowMs: number): FireAutomationDeps {
    return {
      ai: this.env.AI,
      model: this.env.ORCHESTRATOR_MODEL,
      typeSafeApiKey: this.env.TYPESAFE_API_KEY,
      nowMs,
      globalEnabled: automationsEnabled(this.env.AUTOMATIONS_ENABLED),
      queueRun: (input) => queueOnOrchestrator(orchestrator, input),
      resolveApproval: (input) => resolveOnOrchestrator(orchestrator, input),
    };
  }

  async fireEvent(
    event: AutomationMatchEvent,
    orchestrator: OrchestratorStub,
    nowMs = Date.now(),
  ): Promise<{ fired: number; skipped: number }> {
    const store = await this.load();
    const { results, automations } = await fireMatchingAutomations(
      store.list(),
      event,
      this.fireDeps(orchestrator, nowMs),
    );
    const next = new AutomationStore();
    for (const item of automations) next.upsert(item);
    await this.save(next);
    return {
      fired: results.filter((r) => r.fired).length,
      skipped: results.filter((r) => !r.fired).length,
    };
  }

  async tick(orchestrator: OrchestratorStub, nowMs = Date.now()): Promise<{ fired: number }> {
    const store = await this.load();
    const due = collectDueSchedules(store.list(), nowMs);
    if (due.length === 0) return { fired: 0 };
    const event: AutomationMatchEvent = { kind: "schedule", nowMs };
    const { results, automations } = await fireMatchingAutomations(
      store.list(),
      event,
      this.fireDeps(orchestrator, nowMs),
    );
    const next = new AutomationStore();
    for (const item of automations) next.upsert(item);
    await this.save(next);
    return { fired: results.filter((r) => r.fired).length };
  }

  private async orchestrator(): Promise<OrchestratorStub> {
    return getAgentByName(this.env.CodingOrchestrator, ORCHESTRATOR_NAME);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/internal/tick") {
      const result = await this.tick(await this.orchestrator());
      return Response.json(result);
    }
    if (request.method === "POST" && url.pathname === "/internal/github") {
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return Response.json({ error: "Request body is not valid JSON." }, { status: 400 });
      }
      const record = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
      const githubEvent = typeof record.event === "string" ? record.event : "unknown";
      const mapped = githubWebhookToEvent(githubEvent, record.payload);
      const result = await this.fireEvent({ kind: "github", ...mapped }, await this.orchestrator());
      return Response.json(result);
    }
    if (request.method === "POST" && url.pathname === "/internal/slack") {
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return Response.json({ error: "Request body is not valid JSON." }, { status: 400 });
      }
      const mapped = slackEventToAutomation(body);
      const result = await this.fireEvent({ kind: "slack", ...mapped }, await this.orchestrator());
      return Response.json(result);
    }
    if (request.method === "GET" && url.pathname === "/api/automations") {
      const store = await this.load();
      return Response.json({ automations: store.list().map(publicAutomation) });
    }
    if (request.method === "POST" && url.pathname === "/api/automations") {
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return Response.json({ error: "Request body is not valid JSON." }, { status: 400 });
      }
      try {
        const created = createAutomation(body as CreateAutomationInput);
        const store = await this.load();
        store.upsert(created.automation);
        await this.save(store);
        return Response.json(
          { automation: publicAutomation(created.automation), webhookSecret: created.webhookSecret },
          { status: 201 },
        );
      } catch (error) {
        const message = error instanceof InputError ? error.message : "Invalid automation.";
        return Response.json({ error: message }, { status: 400 });
      }
    }
    const webhookId = parseAutomationWebhookPath(url.pathname);
    if (webhookId && request.method === "POST") {
      const store = await this.load();
      const automation = store.get(webhookId);
      if (!automation) {
        return Response.json({ error: "Automation not found." }, { status: 404 });
      }
      const secret =
        request.headers.get("x-automation-secret") ??
        new URL(request.url).searchParams.get("secret") ??
        "";
      if (!verifyWebhookSecret(automation, secret)) {
        return Response.json({ error: "Invalid automation secret." }, { status: 401 });
      }
      const result = await this.fireEvent({ kind: "webhook", secret }, await this.orchestrator());
      return Response.json({ ok: true, id: webhookId, ...result });
    }
    return Response.json({ error: "Not found." }, { status: 404 });
  }
}

function publicAutomation(automation: Automation): Omit<Automation, "webhookSecret"> & { hasWebhookSecret: boolean } {
  const { webhookSecret, ...rest } = automation;
  return { ...rest, hasWebhookSecret: Boolean(webhookSecret) };
}
