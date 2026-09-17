/**
 * Automation trigger engine (PLAN T18).
 *
 * Capy's model: 1–20 triggers OR'd together, at most one run per event.
 * An automation holds `{id, prompt, triggers[], repoUrl, enabled, runAs,
 * lastTriggeredAt, runCount}`; a future `Automations` Durable Object will
 * own these records and a `scheduled()` Worker entrypoint will fan out due
 * schedules via {@link collectDueSchedules}.
 *
 * Trigger kinds:
 * - schedule — five-field cron, floor of one run per 5 minutes (matching
 *   Capy). Missed occurrences coalesce into one run, never a backlog.
 * - github — matched against the existing `/api/github/webhook` event
 *   (PR opened/pushed/merged, comments, reviews, labels, check runs).
 * - slack — matched against the P3 events endpoint; reuses burst grouping
 *   upstream, so this layer only applies channel/author/text conditions.
 * - webhook — `POST /api/automations/{id}/trigger` with a per-automation
 *   secret. The secret is returned once on create and never again.
 * - manual — on demand from the dashboard button or Slack command.
 *
 * Pure and dependency-free (WebCrypto + Date only) so it runs in the
 * Worker, in Vitest, and anywhere else without modification.
 */
import { InputError, parseGitHubRepoUrl } from "./security.js";

/** Minimum gap between two schedule firings, in minutes. */
export const SCHEDULE_FLOOR_MINUTES = 5;

/** Worker-level cron tick that drives the scheduled() fan-out. */
export const AUTOMATION_CRON_TICK = "*/5 * * * *";

export interface ScheduleTrigger {
  kind: "schedule";
  /** Five-field cron (`minute hour dom month dow`). 5-minute floor enforced. */
  cron: string;
}

export interface GitHubTrigger {
  kind: "github";
  /** e.g. `"pull_request:opened"`, `"push"`. Bare names match any action. */
  events: string[];
  /** Optional conditions — absent/empty means unconstrained. */
  repos?: string[];
  branches?: string[];
  authors?: string[];
  labels?: string[];
}

export interface SlackTrigger {
  kind: "slack";
  channels?: string[];
  authors?: string[];
  /** Case-insensitive substrings; any one matching fires. */
  textContains?: string[];
}

export interface WebhookTrigger {
  kind: "webhook";
}

export interface ManualTrigger {
  kind: "manual";
}

export type AutomationTrigger =
  | ScheduleTrigger
  | GitHubTrigger
  | SlackTrigger
  | WebhookTrigger
  | ManualTrigger;

export interface Automation {
  id: string;
  prompt: string;
  repoUrl: string;
  triggers: AutomationTrigger[];
  enabled: boolean;
  runAs?: string;
  /** Set only when a webhook trigger exists. Never re-issued — see createAutomation. */
  webhookSecret?: string;
  lastTriggeredAt?: number;
  runCount: number;
}

export interface GitHubAutomationEvent {
  /** Webhook name: `pull_request`, `push`, `issues`, `issue_comment`, … */
  event: string;
  action?: string;
  /** `owner/repo`. */
  repo?: string;
  branch?: string;
  author?: string;
  labels?: string[];
}

export interface SlackAutomationEvent {
  channel?: string;
  author?: string;
  text?: string;
}

export type AutomationMatchEvent =
  | ({ kind: "github" } & GitHubAutomationEvent)
  | ({ kind: "slack" } & SlackAutomationEvent)
  | { kind: "webhook"; secret: string }
  | { kind: "schedule"; nowMs: number }
  | { kind: "manual" };

export interface MatchedTrigger {
  triggerIndex: number;
  trigger: AutomationTrigger;
}

// ---------------------------------------------------------------------------
// Cron
// ---------------------------------------------------------------------------

const CRON_RANGES = [
  { min: 0, max: 59 }, // minute
  { min: 0, max: 23 }, // hour
  { min: 1, max: 31 }, // day of month
  { min: 1, max: 12 }, // month
  { min: 0, max: 7 }, // day of week (7 is Sunday, normalized to 0)
] as const;

const MONTH_NAMES: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

const DOW_NAMES: Record<string, number> = {
  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
};

interface ParsedCron {
  minute: Set<number>;
  hour: Set<number>;
  dom: Set<number>;
  month: Set<number>;
  dow: Set<number>;
  domStar: boolean;
  dowStar: boolean;
}

function parseCronValue(
  token: string,
  min: number,
  max: number,
  names: Record<string, number>,
  isDow: boolean,
): number | null {
  const key = token.toLowerCase();
  if (key in names) {
    return names[key] ?? null;
  }
  if (!/^\d+$/.test(token)) {
    return null;
  }
  const value = Number(token);
  if (!Number.isInteger(value) || value < min || value > max) {
    return null;
  }
  // Normalize Sunday 7 → 0 so sets compare cleanly.
  if (isDow && value === 7) {
    return 0;
  }
  return value;
}

function parseCronField(
  field: string,
  min: number,
  max: number,
  names: Record<string, number>,
  isDow: boolean,
): Set<number> | null {
  const values = new Set<number>();
  const parts = field.split(",");
  if (parts.length === 0) {
    return null;
  }
  for (const rawPart of parts) {
    const part = rawPart.trim();
    if (part === "") {
      return null;
    }
    const slash = part.split("/");
    if (slash.length > 2) {
      return null;
    }
    const base = slash[0] ?? "";
    let step = 1;
    if (slash.length === 2) {
      const stepText = slash[1] ?? "";
      if (!/^\d+$/.test(stepText)) {
        return null;
      }
      step = Number(stepText);
      if (!Number.isInteger(step) || step < 1 || step > max) {
        return null;
      }
    }
    let start: number;
    let end: number;
    if (base === "*") {
      start = min;
      end = max === 7 && isDow ? 6 : max;
    } else if (base.includes("-")) {
      const bounds = base.split("-");
      if (bounds.length !== 2) {
        return null;
      }
      const low = parseCronValue((bounds[0] ?? "").trim(), min, max, names, isDow);
      const high = parseCronValue((bounds[1] ?? "").trim(), min, max, names, isDow);
      if (low === null || high === null || low > high) {
        return null;
      }
      start = low;
      end = high;
    } else {
      const single = parseCronValue(base, min, max, names, isDow);
      if (single === null) {
        return null;
      }
      start = single;
      end = single;
    }
    for (let value = start; value <= end; value += step) {
      values.add(value);
    }
  }
  return values.size === 0 ? null : values;
}

function parseCron(expr: string): ParsedCron | null {
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) {
    return null;
  }
  const [minuteText, hourText, domText, monthText, dowText] = fields as [
    string, string, string, string, string,
  ];
  const minute = parseCronField(minuteText, CRON_RANGES[0].min, CRON_RANGES[0].max, {}, false);
  const hour = parseCronField(hourText, CRON_RANGES[1].min, CRON_RANGES[1].max, {}, false);
  const dom = parseCronField(domText, CRON_RANGES[2].min, CRON_RANGES[2].max, {}, false);
  const month = parseCronField(monthText, CRON_RANGES[3].min, CRON_RANGES[3].max, MONTH_NAMES, false);
  const dow = parseCronField(dowText, CRON_RANGES[4].min, CRON_RANGES[4].max, DOW_NAMES, true);
  if (!minute || !hour || !dom || !month || !dow) {
    return null;
  }
  return { minute, hour, dom, month, dow, domStar: domText === "*", dowStar: dowText === "*" };
}

/** Smallest gap in minutes between consecutive minute-field firings (wraps the hour). */
function minuteFieldGap(minutes: Set<number>): number {
  const sorted = [...minutes].sort((a, b) => a - b);
  if (sorted.length <= 1) {
    return 60;
  }
  let gap = 60;
  for (let i = 1; i < sorted.length; i++) {
    gap = Math.min(gap, (sorted[i] ?? 0) - (sorted[i - 1] ?? 0));
  }
  gap = Math.min(gap, (sorted[0] ?? 0) + 60 - (sorted[sorted.length - 1] ?? 0));
  return gap;
}

/**
 * Five-field cron, with the 5-minute floor enforced on the minute field:
 * `* * * * *` and `*\/2 * * * *` are rejected because they would fire more
 * often than the platform tick that drives them.
 */
export function validateCron(expr: string): boolean {
  const parsed = parseCron(expr);
  if (!parsed) {
    return false;
  }
  return minuteFieldGap(parsed.minute) >= SCHEDULE_FLOOR_MINUTES;
}

function matchesCron(parsed: ParsedCron, date: Date): boolean {
  if (!parsed.minute.has(date.getUTCMinutes())) {
    return false;
  }
  if (!parsed.hour.has(date.getUTCHours())) {
    return false;
  }
  if (!parsed.month.has(date.getUTCMonth() + 1)) {
    return false;
  }
  // Standard cron day semantics: when both dom and dow are restricted,
  // either matching fires; when one is `*`, the other decides.
  let dayOk: boolean;
  if (parsed.domStar && parsed.dowStar) {
    dayOk = true;
  } else {
    const domOk = !parsed.domStar && parsed.dom.has(date.getUTCDate());
    const dowOk = !parsed.dowStar && parsed.dow.has(date.getUTCDay());
    dayOk = domOk || dowOk;
  }
  return dayOk;
}

/**
 * True when `cron` matches `nowMs` and nothing fired in the current minute
 * bucket. A stale `lastTriggeredAt` (missed ticks while the worker was
 * down) still yields exactly one run — occurrences coalesce, never queue.
 */
export function isScheduleDue(cron: string, nowMs: number, lastTriggeredAtMs?: number): boolean {
  const parsed = parseCron(cron);
  if (!parsed || !matchesCron(parsed, new Date(nowMs))) {
    return false;
  }
  if (lastTriggeredAtMs === undefined) {
    return true;
  }
  return lastTriggeredAtMs < Math.floor(nowMs / 60000) * 60000;
}

// ---------------------------------------------------------------------------
// Trigger matching
// ---------------------------------------------------------------------------

function matchesCondition(value: string | undefined, allowed: string[] | undefined): boolean {
  if (!allowed || allowed.length === 0) {
    return true;
  }
  if (value === undefined) {
    return false;
  }
  return allowed.some((entry) => entry.toLowerCase() === value.toLowerCase());
}

/**
 * GitHub event match: the `event[:action]` pair must be listed, and every
 * repo/branch/author/label condition must hold. Label conditions are AND —
 * the event must carry each required label.
 */
export function matchGitHubTrigger(trigger: GitHubTrigger, event: GitHubAutomationEvent): boolean {
  const wanted = event.event.toLowerCase();
  const action = event.action?.toLowerCase();
  const pairHit = trigger.events.some((entry) => {
    const [name, entryAction] = entry.toLowerCase().split(":");
    if (name !== wanted) {
      return false;
    }
    if (entryAction !== undefined && entryAction !== action) {
      return false;
    }
    return true;
  });
  if (!pairHit) {
    return false;
  }
  if (!matchesCondition(event.repo, trigger.repos)) {
    return false;
  }
  if (!matchesCondition(event.branch, trigger.branches)) {
    return false;
  }
  if (!matchesCondition(event.author, trigger.authors)) {
    return false;
  }
  if (trigger.labels && trigger.labels.length > 0) {
    const carried = new Set((event.labels ?? []).map((label) => label.toLowerCase()));
    if (!trigger.labels.every((label) => carried.has(label.toLowerCase()))) {
      return false;
    }
  }
  return true;
}

/** Slack match: every configured channel/author/text condition must hold. */
export function matchSlackTrigger(trigger: SlackTrigger, event: SlackAutomationEvent): boolean {
  if (trigger.channels && trigger.channels.length > 0) {
    if (event.channel === undefined || !trigger.channels.includes(event.channel)) {
      return false;
    }
  }
  if (trigger.authors && trigger.authors.length > 0) {
    if (event.author === undefined || !trigger.authors.includes(event.author)) {
      return false;
    }
  }
  if (trigger.textContains && trigger.textContains.length > 0) {
    const text = (event.text ?? "").toLowerCase();
    if (!trigger.textContains.some((needle) => text.includes(needle.toLowerCase()))) {
      return false;
    }
  }
  return true;
}

/** Constant-time secret comparison. Length mismatch returns false. */
function timingSafeEqualString(actual: string, expected: string): boolean {
  if (actual.length !== expected.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ actual.charCodeAt(i);
  }
  return diff === 0;
}

/** True only when the automation carries a webhook trigger holding this secret. */
export function verifyWebhookSecret(automation: Automation, provided: string): boolean {
  if (!automation.webhookSecret) {
    return false;
  }
  return timingSafeEqualString(provided, automation.webhookSecret);
}

function randomHex(bytes: number): string {
  const raw = crypto.getRandomValues(new Uint8Array(bytes));
  return Array.from(raw)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

export interface CreateAutomationInput {
  id?: string;
  prompt: string;
  repoUrl: string;
  triggers: AutomationTrigger[];
  enabled?: boolean;
  runAs?: string;
}

export interface CreatedAutomation {
  automation: Automation;
  /**
   * The per-automation webhook secret. Returned ONCE on create and never
   * again — the API response and the docs must say so. Null when the
   * automation has no webhook trigger.
   */
  webhookSecret: string | null;
}

/**
 * Validate and build an automation record. Throws {@link InputError} on a
 * bad prompt, repo URL, id, empty trigger list, invalid cron, or a GitHub
 * trigger with no events.
 */
export function createAutomation(input: CreateAutomationInput): CreatedAutomation {
  const prompt = input.prompt.trim();
  if (!prompt) {
    throw new InputError("Automation prompt must be a non-empty string.");
  }
  parseGitHubRepoUrl(input.repoUrl);
  const id = input.id ?? `auto-${randomHex(8)}`;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) {
    throw new InputError("Automation id must be 1–64 chars of letters, digits, - or _.");
  }
  if (input.triggers.length === 0) {
    throw new InputError("Automation needs at least one trigger.");
  }
  for (const trigger of input.triggers) {
    if (trigger.kind === "schedule" && !validateCron(trigger.cron)) {
      throw new InputError(
        `Invalid schedule cron "${trigger.cron}": want five fields, at most one run per 5 minutes.`,
      );
    }
    if (trigger.kind === "github" && trigger.events.length === 0) {
      throw new InputError("GitHub triggers need at least one event.");
    }
  }
  const needsSecret = input.triggers.some((trigger) => trigger.kind === "webhook");
  const webhookSecret = needsSecret ? randomHex(32) : null;
  return {
    automation: {
      id,
      prompt,
      repoUrl: input.repoUrl,
      triggers: input.triggers,
      enabled: input.enabled ?? true,
      ...(input.runAs !== undefined ? { runAs: input.runAs } : {}),
      ...(webhookSecret !== null ? { webhookSecret } : {}),
      runCount: 0,
    },
    webhookSecret,
  };
}

/**
 * First matching trigger wins (triggers are OR'd, at most one run per
 * event). Disabled automations never match. Webhook events must carry the
 * per-automation secret; schedule events fire only when due (coalesced).
 */
export function matchAutomationEvent(
  automation: Automation,
  event: AutomationMatchEvent,
): MatchedTrigger | null {
  if (!automation.enabled) {
    return null;
  }
  for (let index = 0; index < automation.triggers.length; index++) {
    const trigger = automation.triggers[index] as AutomationTrigger;
    if (event.kind === "github" && trigger.kind === "github") {
      if (matchGitHubTrigger(trigger, event)) {
        return { triggerIndex: index, trigger };
      }
    } else if (event.kind === "slack" && trigger.kind === "slack") {
      if (matchSlackTrigger(trigger, event)) {
        return { triggerIndex: index, trigger };
      }
    } else if (event.kind === "webhook" && trigger.kind === "webhook") {
      if (verifyWebhookSecret(automation, event.secret)) {
        return { triggerIndex: index, trigger };
      }
      return null;
    } else if (event.kind === "schedule" && trigger.kind === "schedule") {
      if (isScheduleDue(trigger.cron, event.nowMs, automation.lastTriggeredAt)) {
        return { triggerIndex: index, trigger };
      }
    } else if (event.kind === "manual" && trigger.kind === "manual") {
      return { triggerIndex: index, trigger };
    }
  }
  return null;
}

/** Stamp a firing: set lastTriggeredAt and bump runCount. */
export function recordTrigger(automation: Automation, nowMs: number = Date.now()): Automation {
  return { ...automation, lastTriggeredAt: nowMs, runCount: automation.runCount + 1 };
}

/** Extract the automation id from `/api/automations/{id}/trigger`, else null. */
export function parseAutomationWebhookPath(pathname: string): string | null {
  const match = /^\/api\/automations\/([^/]+)\/trigger\/?$/.exec(pathname);
  const id = match?.[1];
  return id && id.length > 0 ? id : null;
}

// ---------------------------------------------------------------------------
// Storage + scheduled() fan-out
// ---------------------------------------------------------------------------

/**
 * Minimal in-memory store behind the future `Automations` Durable Object,
 * which will hold `{id, prompt, triggers[], repoUrl, enabled, runAs,
 * lastTriggeredAt, runCount}` per automation in DO state.
 */
export class AutomationStore {
  private readonly items = new Map<string, Automation>();

  upsert(automation: Automation): void {
    this.items.set(automation.id, automation);
  }

  get(id: string): Automation | undefined {
    return this.items.get(id);
  }

  remove(id: string): boolean {
    return this.items.delete(id);
  }

  list(): Automation[] {
    return [...this.items.values()];
  }
}

/**
 * The `scheduled()` fan-out: every enabled automation with at least one due
 * schedule trigger fires exactly once per tick. Callers {@link recordTrigger}
 * each returned automation so the next tick coalesces.
 */
export function collectDueSchedules(automations: Automation[], nowMs: number): Automation[] {
  return automations.filter(
    (automation) => matchAutomationEvent(automation, { kind: "schedule", nowMs }) !== null,
  );
}
