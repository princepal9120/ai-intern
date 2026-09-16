import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  agent: {
    connectionError: null,
    identified: true,
  },
  chat: {
    messages: [] as Array<{ id: string; role: string; parts: unknown[] }>,
    error: null as Error | null,
    isStreaming: false,
    status: "ready",
    sendMessage: vi.fn(),
    clearHistory: vi.fn(),
    addToolApprovalResponse: vi.fn(),
  },
  runsById: {} as Record<string, unknown>,
}));

vi.mock("agents/react", () => ({
  useAgent: () => mocks.agent,
  useAgentToolEvents: () => ({ runsById: mocks.runsById }),
}));

vi.mock("@cloudflare/ai-chat/react", () => ({
  useAgentChat: () => mocks.chat,
  getToolApproval: (part: { approvalId?: string }) =>
    part.approvalId ? { id: part.approvalId } : undefined,
  getToolCallId: (part: { toolCallId?: string }) => part.toolCallId ?? "call",
  getToolInput: (part: { input?: unknown }) => part.input,
  getToolPartState: (part: { state?: string }) => part.state,
}));

vi.mock("ai", () => ({
  isToolUIPart: (part: { type?: unknown }) =>
    typeof part.type === "string" && part.type.startsWith("tool-"),
}));

import { App } from "../dashboard/app";

afterEach(() => {
  mocks.chat.messages = [];
  mocks.chat.error = null;
  mocks.chat.isStreaming = false;
  mocks.chat.status = "ready";
  mocks.runsById = {};
  vi.clearAllMocks();
});

function renderApp() {
  return renderToStaticMarkup(React.createElement(App));
}

describe("dashboard rendering", () => {
  it("shows useful empty states when no task has started", () => {
    const markup = renderApp();

    expect(markup).toContain("No messages yet. Submit a task to start.");
    expect(markup).toContain("No live runs. Approved tasks appear here while they execute.");
    expect(markup).toContain("No retained runs on the orchestrator yet.");
  });

  it("renders a pending approval with its tool input and actions", () => {
    mocks.chat.messages = [
      {
        id: "message-1",
        role: "assistant",
        parts: [
          {
            type: "tool-runSandbox",
            state: "waiting-approval",
            approvalId: "approval-1",
            toolCallId: "call-1",
            input: { command: "npm test" },
          },
        ],
      },
    ];

    const markup = renderApp();

    expect(markup).toContain("Waiting for your approval");
    expect(markup).toContain("runSandbox");
    expect(markup).toContain("&quot;command&quot;: &quot;npm test&quot;");
    expect(markup).toContain("Approve");
    expect(markup).toContain("Reject");
  });

  it("renders chat errors and live run output without hiding the run state", () => {
    mocks.chat.error = new Error("stream failed");
    mocks.runsById = {
      "run-1": {
        runId: "run-1",
        status: "error",
        agentType: "coding-agent",
        parentToolCallId: "call-1",
        parts: [{ text: "sandbox failed" }],
        summary: "The sandbox exited early.",
        error: "exit code 1",
      },
    };

    const markup = renderApp();

    expect(markup).toContain("Chat error: stream failed");
    expect(markup).toContain("run-1");
    expect(markup).toContain("error");
    expect(markup).toContain("sandbox failed");
    expect(markup).toContain("The sandbox exited early.");
    expect(markup).toContain("exit code 1");
  });
});
