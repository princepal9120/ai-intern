/**
 * Durable pending-approval records for the Slack approval path (finding #2).
 * Pure list transforms so the orchestrator stores them in DO state the same
 * way it stores runs; the click handler resolves a pointer exactly once.
 */

export const APPROVAL_TTL_MS = 30 * 60 * 1000;

export interface PendingApproval {
  threadKey: string;
  approvalId: string;
  repoUrl: string;
  task: string;
  /** Exact delegation input frozen at queue time; executed verbatim on approve. */
  baseBranch?: string;
  publishPullRequest?: boolean;
  status: "pending" | "approved" | "rejected";
  createdAt: number;
  decidedBy?: string;
  decidedAt?: number;
}

export interface CreateApprovalInput {
  threadKey: string;
  approvalId: string;
  repoUrl: string;
  task: string;
  baseBranch?: string;
  publishPullRequest?: boolean;
  createdAt: number;
}

export function createPendingApproval(
  approvals: PendingApproval[],
  input: CreateApprovalInput,
): PendingApproval[] {
  if (approvals.some((a) => a.approvalId === input.approvalId)) {
    throw new Error(`Approval ${input.approvalId} is already pending or resolved.`);
  }
  return [
    ...approvals,
    {
      threadKey: input.threadKey,
      approvalId: input.approvalId,
      repoUrl: input.repoUrl,
      task: input.task,
      ...(input.baseBranch !== undefined ? { baseBranch: input.baseBranch } : {}),
      ...(input.publishPullRequest !== undefined ? { publishPullRequest: input.publishPullRequest } : {}),
      status: "pending",
      createdAt: input.createdAt,
    },
  ];
}

export interface ResolveApprovalInput {
  threadKey: string;
  approvalId: string;
  approved: boolean;
  decidedBy: string;
}

export type ResolveResult = "approved" | "rejected" | "expired" | "unknown";

export function resolvePendingApproval(
  approvals: PendingApproval[],
  input: ResolveApprovalInput,
  now: number,
): { result: ResolveResult; approvals: PendingApproval[] } {
  const index = approvals.findIndex(
    (a) => a.approvalId === input.approvalId && a.threadKey === input.threadKey,
  );
  if (index < 0) {
    return { result: "unknown", approvals };
  }
  const record = approvals[index]!;
  if (now - record.createdAt > APPROVAL_TTL_MS) {
    // Expired pointers resolve nothing and are pruned, like stale cards.
    return { result: "unknown", approvals: approvals.filter((a) => a.approvalId !== input.approvalId) };
  }
  if (record.status !== "pending") {
    return { result: "unknown", approvals };
  }
  const next = approvals.map((a, i) =>
    i === index
      ? { ...a, status: input.approved ? ("approved" as const) : ("rejected" as const), decidedBy: input.decidedBy, decidedAt: now }
      : a,
  );
  return { result: input.approved ? "approved" : "rejected", approvals: next };
}

/** Drop pending approvals past their TTL; resolved records stay for audit. */
export function pruneExpiredApprovals(approvals: PendingApproval[], now: number): PendingApproval[] {
  return approvals.filter((a) => a.status !== "pending" || !isApprovalExpired(a, now));
}

/** Approval expiry shares the pointer contract; see resolvePendingApproval. */
export function isApprovalExpired(record: PendingApproval, now: number): boolean {
  return now - record.createdAt > APPROVAL_TTL_MS;
}

