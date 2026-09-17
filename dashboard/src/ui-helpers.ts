// Pure helpers shared by the dashboard. Keep deterministic: no fetch, no React.
import {
  getToolApproval,
  getToolCallId,
  getToolInput,
  getToolPartState,
} from "@cloudflare/ai-chat/react";
import { isToolUIPart, type UIMessage } from "ai";

export type ToolPart = UIMessage["parts"][number];

export interface PendingApproval {
  messageId: string;
  toolCallId: string;
  approvalId: string;
  tool: string;
  input: unknown;
}

// Mirrors app.tsx: only tool parts sitting in "waiting-approval" with an approval id.
export function extractPendingApprovals(messages: UIMessage[]): PendingApproval[] {
  const approvals: PendingApproval[] = [];
  for (const message of messages) {
    for (const part of message.parts) {
      if (!isToolUIPart(part)) continue;
      if (getToolPartState(part) !== "waiting-approval") continue;
      const approval = getToolApproval(part);
      if (!approval) continue;
      approvals.push({
        messageId: message.id,
        toolCallId: getToolCallId(part),
        approvalId: approval.id,
        tool: toolDisplayName(part),
        input: getToolInput(part),
      });
    }
  }
  return approvals;
}

export function toolDisplayName(part: ToolPart): string {
  const raw = (part as { type?: unknown }).type;
  if (typeof raw === "string" && raw.startsWith("tool-")) {
    return raw.slice("tool-".length);
  }
  return typeof raw === "string" ? raw : "tool";
}

// Registry statuses: pending|running|completed|error|aborted|cancelled.
const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  running: "Running",
  completed: "Completed",
  error: "Error",
  aborted: "Aborted",
  cancelled: "Cancelled",
};

export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

export function emptyDiffText(): string {
  return "No file changes produced";
}
