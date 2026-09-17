/**
 * Durable run registry helpers. The orchestrator keeps these records in
 * Durable Object state; the Worker gates drill-in routes on them.
 *
 * Cloudbox-style: a run is an append-only receipt log plus an optional
 * R2 snapshot (stop/resume/fork). `stopped` releases the concurrency
 * slot but is resumable; completed/error/cancelled/aborted stay terminal.
 */
import { appendReceipt, makeReceipt, type Receipt } from "./receipts.js";

export type RunStatus =
  | "pending"
  | "running"
  | "stopped"
  | "completed"
  | "error"
  | "aborted"
  | "cancelled";

export interface DelegatedRun {
  runId: string;
  sandboxId: string;
  repoUrl: string;
  task: string;
  baseBranch: string;
  publishPullRequest: boolean;
  status: RunStatus;
  createdAt: number;
  updatedAt: number;
  summary?: string;
  error?: string;
  diff?: string;
  receipts?: Receipt[];
  snapshotKey?: string;
  parentRunId?: string;
}

export type RunPatch = {
  summary?: string;
  error?: string;
  diff?: string;
  snapshotKey?: string;
  receipts?: Receipt[];
  sandboxId?: string;
  parentRunId?: string;
};

/**
 * Maximum concurrent coding agents. Must match `max_instances` in
 * wrangler.jsonc; this is policy, not a platform limit (Cloudflare's own
 * default is 20). Parallel runs cost no more — billing is container-seconds.
 */
export const MAX_CONCURRENT_RUNS = 5;

export function createRun(args: {
  runId: string;
  sandboxId: string;
  repoUrl: string;
  task: string;
  baseBranch: string;
  publishPullRequest: boolean;
  now?: number;
  parentRunId?: string;
  snapshotKey?: string;
}): DelegatedRun {
  const now = args.now ?? Date.now();
  return {
    runId: args.runId,
    sandboxId: args.sandboxId,
    repoUrl: args.repoUrl,
    task: args.task,
    baseBranch: args.baseBranch,
    publishPullRequest: args.publishPullRequest,
    status: "pending",
    createdAt: now,
    updatedAt: now,
    parentRunId: args.parentRunId,
    snapshotKey: args.snapshotKey,
    receipts: [makeReceipt("init", `Queued ${args.repoUrl} (${args.baseBranch}).`, now)],
  };
}

export function isTerminalStatus(status: RunStatus): boolean {
  return status === "completed" || status === "error" || status === "aborted" || status === "cancelled";
}

export function isActiveStatus(status: RunStatus): boolean {
  return status === "pending" || status === "running";
}

export function canResumeStatus(status: RunStatus): boolean {
  return status === "stopped";
}

function applyPatch(run: DelegatedRun, patch: RunPatch | undefined): DelegatedRun {
  if (!patch) return run;
  const next: DelegatedRun = { ...run };
  if (patch.summary !== undefined) next.summary = patch.summary;
  if (patch.error !== undefined) next.error = patch.error;
  if (patch.diff !== undefined) next.diff = patch.diff;
  if (patch.snapshotKey !== undefined) next.snapshotKey = patch.snapshotKey;
  if (patch.receipts !== undefined) next.receipts = patch.receipts;
  if (patch.sandboxId !== undefined) next.sandboxId = patch.sandboxId;
  if (patch.parentRunId !== undefined) next.parentRunId = patch.parentRunId;
  return next;
}

export function transitionRun(
  run: DelegatedRun,
  status: RunStatus,
  patch?: RunPatch,
  now?: number,
): DelegatedRun {
  if (isTerminalStatus(run.status)) return run;
  if (run.status === "stopped" && status !== "running" && status !== "cancelled" && status !== "stopped") {
    return run;
  }
  const stamped = now ?? Date.now();
  const next = applyPatch(run, patch);
  const kind =
    status === "stopped"
      ? "stop"
      : status === "error" || status === "aborted"
        ? "error"
        : status === "completed"
          ? "submit"
          : status === "running" && run.status === "stopped"
            ? "resume"
            : undefined;
  const receipts = kind
    ? appendReceipt(next.receipts, makeReceipt(kind, patch?.error ?? patch?.summary ?? status, stamped))
    : next.receipts;
  return {
    ...next,
    status,
    receipts,
    updatedAt: stamped,
  };
}

export function recordReceipt(run: DelegatedRun, receipt: Receipt): DelegatedRun {
  return { ...run, receipts: appendReceipt(run.receipts, receipt), updatedAt: receipt.at };
}

export function countActiveRuns(runs: DelegatedRun[]): number {
  return runs.filter((run) => isActiveStatus(run.status)).length;
}

// Reclaim runs orphaned by eviction so they cannot hold slots indefinitely.
// Above the sum of per-phase timeouts (clone 5m + harness 15m + git 5m) so a
// healthy worst-case run is never reaped; eviction is the only orphan source.
export const RUN_DEADLINE_MS = 45 * 60 * 1000;

// Terminal records stay immutable even when a child finishes after reclamation.
export function reclaimStaleRuns(
  runs: DelegatedRun[],
  now: number,
  deadlineMs: number = RUN_DEADLINE_MS,
): { runs: DelegatedRun[]; reclaimed: string[] } {
  const reclaimed: string[] = [];
  const next = runs.map((run) => {
    if (!isActiveStatus(run.status) || now - run.updatedAt <= deadlineMs) {
      return run;
    }
    reclaimed.push(run.runId);
    return transitionRun(
      run,
      "error",
      { error: `Run exceeded its ${Math.round(deadlineMs / 60000)}-minute deadline and was reclaimed.` },
      now,
    );
  });
  return { runs: next, reclaimed };
}

export function canStartRun(runs: DelegatedRun[]): boolean {
  return countActiveRuns(runs) < MAX_CONCURRENT_RUNS;
}

/**
 * Owns the find/map/replace pattern against the retained run list so callers
 * (orchestrator transitions, the run-detail route) don't each re-derive it.
 * State storage itself stays injected — the store doesn't know it's a
 * Durable Object.
 */
export class RunStore {
  constructor(
    private readonly read: () => DelegatedRun[],
    private readonly write: (runs: DelegatedRun[]) => void,
  ) {}

  list(): DelegatedRun[] {
    return this.read();
  }

  get(runId: string): DelegatedRun | null {
    return this.read().find((run) => run.runId === runId) ?? null;
  }

  add(run: DelegatedRun): void {
    this.write([...this.read(), run]);
  }

  transition(runId: string, status: RunStatus, patch?: RunPatch): DelegatedRun | null {
    let updated: DelegatedRun | null = null;
    this.write(
      this.read().map((run) => {
        if (run.runId !== runId) return run;
        updated = transitionRun(run, status, patch);
        return updated;
      }),
    );
    return updated;
  }

  replace(runId: string, next: DelegatedRun): void {
    this.write(this.read().map((run) => (run.runId === runId ? next : run)));
  }

  clear(): void {
    this.write([]);
  }
}

