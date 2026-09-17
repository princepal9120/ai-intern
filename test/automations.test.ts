import { describe, expect, it } from "vitest";
import {
  collectDueSchedules,
  createAutomation,
  isScheduleDue,
  matchAutomationEvent,
  matchGitHubTrigger,
  matchSlackTrigger,
  parseAutomationWebhookPath,
  recordTrigger,
  validateCron,
  verifyWebhookSecret,
} from "../src/automations.js";

const REPO = "https://github.com/owner/repo";

function githubAutomation() {
  return createAutomation({
    id: "auto-github",
    prompt: "Fix failing CI",
    repoUrl: REPO,
    triggers: [
      {
        kind: "github",
        events: ["pull_request:opened", "push"],
        repos: ["owner/repo"],
        branches: ["main"],
        authors: ["alice"],
      },
    ],
  }).automation;
}

describe("schedule triggers", () => {
  it("accepts a 5-minute cron and rejects sub-5-minute crons", () => {
    expect(validateCron("*/5 * * * *")).toBe(true);
    expect(validateCron("0 * * * *")).toBe(true);
    expect(validateCron("* * * * *")).toBe(false);
    expect(validateCron("*/1 * * * *")).toBe(false);
    expect(validateCron("*/2 * * * *")).toBe(false);
    expect(validateCron("not-a-cron")).toBe(false);
  });

  it("fires once per matching bucket and coalesces missed occurrences into one run", () => {
    // 2026-09-17 12:00:30 UTC — minute 0 matches */5.
    const now = Date.UTC(2026, 8, 17, 12, 0, 30);
    // Missed several ticks while the worker was down: still exactly one run.
    expect(isScheduleDue("*/5 * * * *", now, now - 60 * 60 * 1000)).toBe(true);
    // Non-matching minute never fires.
    expect(isScheduleDue("*/5 * * * *", Date.UTC(2026, 8, 17, 12, 3, 0), undefined)).toBe(false);
    // Already fired in this bucket: coalesced, no backlog run.
    const fired = recordTrigger(
      createAutomation({
        id: "auto-cron",
        prompt: "Nightly review",
        repoUrl: REPO,
        triggers: [{ kind: "schedule", cron: "*/5 * * * *" }],
      }).automation,
      now,
    );
    expect(fired.runCount).toBe(1);
    expect(fired.lastTriggeredAt).toBe(now);
    expect(isScheduleDue("*/5 * * * *", now + 1000, fired.lastTriggeredAt)).toBe(false);
  });

  it("collects only due schedules for the scheduled() fan-out", () => {
    const now = Date.UTC(2026, 8, 17, 12, 0, 30);
    const due = createAutomation({
      id: "due",
      prompt: "Due task",
      repoUrl: REPO,
      triggers: [{ kind: "schedule", cron: "*/5 * * * *" }],
    }).automation;
    const idle = createAutomation({
      id: "idle",
      prompt: "Disabled task",
      repoUrl: REPO,
      enabled: false,
      triggers: [{ kind: "schedule", cron: "*/5 * * * *" }],
    }).automation;
    expect(collectDueSchedules([due, idle], now).map((a) => a.id)).toEqual(["due"]);
  });
});

describe("GitHub triggers", () => {
  it("matches PR opened on the allowed repo, branch, and author", () => {
    const trigger = githubAutomation().triggers[0];
    expect(trigger?.kind).toBe("github");
    if (trigger?.kind !== "github") throw new Error("expected github trigger");
    expect(
      matchGitHubTrigger(trigger, {
        event: "pull_request",
        action: "opened",
        repo: "owner/repo",
        branch: "main",
        author: "alice",
      }),
    ).toBe(true);
  });

  it("rejects wrong repo, branch, author, or action", () => {
    const trigger = githubAutomation().triggers[0];
    if (trigger?.kind !== "github") throw new Error("expected github trigger");
    expect(
      matchGitHubTrigger(trigger, {
        event: "pull_request",
        action: "opened",
        repo: "owner/other",
        branch: "main",
        author: "alice",
      }),
    ).toBe(false);
    expect(
      matchGitHubTrigger(trigger, {
        event: "pull_request",
        action: "opened",
        repo: "owner/repo",
        branch: "feature",
        author: "alice",
      }),
    ).toBe(false);
    expect(
      matchGitHubTrigger(trigger, {
        event: "pull_request",
        action: "closed",
        repo: "owner/repo",
        branch: "main",
        author: "alice",
      }),
    ).toBe(false);
  });

  it("filters labels when the trigger requires them", () => {
    const { automation } = createAutomation({
      id: "auto-labels",
      prompt: "Triage bugs",
      repoUrl: REPO,
      triggers: [{ kind: "github", events: ["issues:opened"], labels: ["bug"] }],
    });
    const trigger = automation.triggers[0];
    if (trigger?.kind !== "github") throw new Error("expected github trigger");
    expect(
      matchGitHubTrigger(trigger, { event: "issues", action: "opened", labels: ["bug", "p1"] }),
    ).toBe(true);
    expect(matchGitHubTrigger(trigger, { event: "issues", action: "opened", labels: ["docs"] })).toBe(
      false,
    );
  });
});

describe("Slack triggers", () => {
  it("matches channel, author, and text conditions", () => {
    const { automation } = createAutomation({
      id: "auto-slack",
      prompt: "Handle incident",
      repoUrl: REPO,
      triggers: [
        { kind: "slack", channels: ["C123"], authors: ["U456"], textContains: ["fix this"] },
      ],
    });
    const trigger = automation.triggers[0];
    if (trigger?.kind !== "slack") throw new Error("expected slack trigger");
    expect(
      matchSlackTrigger(trigger, { channel: "C123", author: "U456", text: "@ai-intern fix this now" }),
    ).toBe(true);
    expect(
      matchSlackTrigger(trigger, { channel: "C999", author: "U456", text: "@ai-intern fix this now" }),
    ).toBe(false);
    expect(
      matchSlackTrigger(trigger, { channel: "C123", author: "U456", text: "hello there" }),
    ).toBe(false);
  });
});

describe("webhook triggers", () => {
  it("returns the per-automation secret once on create and verifies it", () => {
    const { automation, webhookSecret } = createAutomation({
      id: "auto-hook",
      prompt: "Deploy on demand",
      repoUrl: REPO,
      triggers: [{ kind: "webhook" }],
    });
    expect(typeof webhookSecret).toBe("string");
    expect(webhookSecret!.length).toBeGreaterThanOrEqual(32);
    expect(verifyWebhookSecret(automation, webhookSecret!)).toBe(true);
    expect(verifyWebhookSecret(automation, "wrong-secret")).toBe(false);
    // No webhook trigger means no secret is ever issued.
    expect(createAutomation({ id: "x", prompt: "p", repoUrl: REPO, triggers: [{ kind: "manual" }] }).webhookSecret).toBeNull();
  });

  it("dispatches POST /api/automations/{id}/trigger only with the right secret", () => {
    const { automation, webhookSecret } = createAutomation({
      id: "auto-hook",
      prompt: "Deploy on demand",
      repoUrl: REPO,
      triggers: [{ kind: "webhook" }],
    });
    expect(parseAutomationWebhookPath("/api/automations/auto-hook/trigger")).toBe("auto-hook");
    expect(parseAutomationWebhookPath("/api/automations/auto-hook")).toBeNull();
    expect(
      matchAutomationEvent(automation, { kind: "webhook", secret: webhookSecret! }),
    ).not.toBeNull();
    expect(matchAutomationEvent(automation, { kind: "webhook", secret: "nope" })).toBeNull();
  });
});

describe("on demand and gating", () => {
  it("fires manual triggers while enabled and never while disabled", () => {
    const { automation } = createAutomation({
      id: "auto-manual",
      prompt: "Run now",
      repoUrl: REPO,
      triggers: [{ kind: "manual" }],
    });
    expect(matchAutomationEvent(automation, { kind: "manual" })).not.toBeNull();
    const disabled = { ...automation, enabled: false };
    expect(matchAutomationEvent(disabled, { kind: "manual" })).toBeNull();
    expect(
      matchAutomationEvent(disabled, {
        kind: "github",
        event: "push",
        repo: "owner/repo",
      }),
    ).toBeNull();
  });

  it("records trigger runs with runCount and timestamp", () => {
    const { automation } = createAutomation({
      id: "auto-manual",
      prompt: "Run now",
      repoUrl: REPO,
      triggers: [{ kind: "manual" }],
    });
    const once = recordTrigger(automation, 1000);
    const twice = recordTrigger(once, 2000);
    expect(twice.runCount).toBe(2);
    expect(twice.lastTriggeredAt).toBe(2000);
  });
});
