/**
 * Durable run registry helpers. The orchestrator keeps these records in
 * Durable Object state; the Worker gates drill-in routes on them.
 */

export type RunStatus =
  | "pending"
  | "running"
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
}

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
  };
}

export function transitionRun(
  run: DelegatedRun,
  status: RunStatus,
  patch?: { summary?: string; error?: string; diff?: string },
  now?: number,
): DelegatedRun {
  if (run.status === "cancelled" || run.status === "aborted") return run;
  return {
    ...run,
    status,
    summary: patch?.summary ?? run.summary,
    error: patch?.error ?? run.error,
    diff: patch?.diff ?? run.diff,
    updatedAt: now ?? Date.now(),
  };
}

export function isActiveStatus(status: RunStatus): boolean {
  return status === "pending" || status === "running";
}

export function countActiveRuns(runs: DelegatedRun[]): number {
  return runs.filter((run) => isActiveStatus(run.status)).length;
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

  transition(
    runId: string,
    status: RunStatus,
    patch?: { summary?: string; error?: string; diff?: string },
  ): DelegatedRun | null {
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

  clear(): void {
    this.write([]);
  }
}

