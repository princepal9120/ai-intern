/**
 * Functional AI Intern dashboard. One form starts an approval-gated
 * coding task; the conversation shows planning text, approval cards,
 * and delegated sandbox runs with OpenCode output.
 */
import {
  getToolApproval,
  getToolPartState,
  useAgentChat,
} from "@cloudflare/ai-chat/react";
import { useAgent, useAgentToolEvents } from "agents/react";
import { isToolUIPart, type UIMessage } from "ai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { extractPendingApprovals, toolDisplayName } from "./ui-helpers";

const ORCHESTRATOR_AGENT = "coding-orchestrator";
const ORCHESTRATOR_NAME = "default";

interface RetainedRun {
  runId: string;
  sandboxId: string;
  repoUrl: string;
  task: string;
  baseBranch: string;
  publishPullRequest: boolean;
  status: string;
  createdAt: number;
  updatedAt: number;
  summary?: string;
  error?: string;
}

function partText(part: UIMessage["parts"][number]): string | null {
  if (typeof part !== "object" || part === null) return null;
  const typed = part as { type?: unknown; text?: unknown };
  if (typed.type === "text" && typeof typed.text === "string") {
    return typed.text;
  }
  return null;
}

function runPartText(part: unknown): string {
  if (typeof part !== "object" || part === null) return "";
  const typed = part as Record<string, unknown>;
  for (const key of ["text", "delta", "message", "body"]) {
    if (typeof typed[key] === "string") return typed[key] as string;
  }
  try {
    return JSON.stringify(part);
  } catch {
    return String(part);
  }
}

function useRetainedRuns(refreshToken: number): { runs: RetainedRun[]; error: string | null } {
  const [runs, setRuns] = useState<RetainedRun[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/runs")
      .then(async (response) => {
        if (!response.ok) throw new Error(`Runs request failed: ${response.status}`);
        const body = (await response.json()) as { runs?: RetainedRun[] };
        if (!cancelled) {
          setRuns(Array.isArray(body.runs) ? body.runs : []);
          setError(null);
        }
      })
      .catch((fetchError: unknown) => {
        if (!cancelled) {
          setError(fetchError instanceof Error ? fetchError.message : String(fetchError));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [refreshToken]);
  return { runs, error };
}

export function App(): React.JSX.Element {
  const [repoUrl, setRepoUrl] = useState("");
  const [baseBranch, setBaseBranch] = useState("main");
  const [task, setTask] = useState("");
  const [publishPullRequest, setPublishPullRequest] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [clearing, setClearing] = useState(false);
  const submitFailed = useRef(false);
  const submitInFlight = useRef(false);
  const clearInFlight = useRef(false);
  const [decisions, setDecisions] = useState<Record<string, boolean>>({});
  const [approvalAnnouncement, setApprovalAnnouncement] = useState("");

  const agent = useAgent({ agent: ORCHESTRATOR_AGENT, name: ORCHESTRATOR_NAME });
  const chat = useAgentChat({
    agent,
    onError: () => {
      submitFailed.current = true;
    },
  });
  const { runsById } = useAgentToolEvents({ agent });
  const { runs: retainedRuns, error: runsError } = useRetainedRuns(refreshToken);

  const toolRuns = useMemo(() => Object.values(runsById), [runsById]);

  const pendingApprovals = useMemo(
    () => extractPendingApprovals(chat.messages),
    [chat.messages],
  );

  const decidedRef = useRef<Set<string>>(new Set());

  const refreshRuns = useCallback(() => setRefreshToken((token) => token + 1), []);

  // Drop decision bookkeeping for approvals that no longer wait on us.
  useEffect(() => {
    const waiting = new Set(pendingApprovals.map((approval) => approval.approvalId));
    for (const id of Array.from(decidedRef.current)) {
      if (!waiting.has(id)) decidedRef.current.delete(id);
    }
    setDecisions((current) => {
      const next: Record<string, boolean> = {};
      let changed = false;
      for (const [id, approved] of Object.entries(current)) {
        if (waiting.has(id)) {
          next[id] = approved;
        } else {
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [pendingApprovals]);

  // One synchronous guard per approvalId: duplicate clicks are inert, and the
  // guard clears when the part leaves "waiting-approval".
  const decideApproval = useCallback(
    async (approvalId: string, approved: boolean) => {
      if (decidedRef.current.has(approvalId)) return;
      decidedRef.current.add(approvalId);
      setDecisions((current) => ({ ...current, [approvalId]: approved }));
      try {
        await chat.addToolApprovalResponse({ id: approvalId, approved });
        setApprovalAnnouncement(
          `Task ${approved ? "approved" : "rejected"}. ${
            approved ? "Sandbox execution is now permitted." : "No sandbox will start for this tool call."
          }`,
        );
        setNotice(null);
      } catch (decisionError) {
        // Decision failed: buttons re-enable for a retry.
        decidedRef.current.delete(approvalId);
        setDecisions((current) => {
          const next = { ...current };
          delete next[approvalId];
          return next;
        });
        setNotice(
          `${approved ? "Approval" : "Rejection"} could not be recorded: ${
            decisionError instanceof Error ? decisionError.message : String(decisionError)
          }`,
        );
      }
    },
    [chat],
  );

  useEffect(() => {
    if (chat.status === "streaming" || chat.isStreaming) {
      const timer = window.setTimeout(refreshRuns, 3000);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [chat.status, chat.isStreaming, chat.messages.length, refreshRuns]);

  const submitTask = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (submitInFlight.current || clearInFlight.current) return;
      if (!repoUrl.trim() || !task.trim()) {
        setNotice("Enter a repository URL and a task first.");
        return;
      }
      setNotice(null);
      const branch = baseBranch.trim() || "main";
      const text = [
        `Repository: ${repoUrl.trim()}`,
        `Base branch: ${branch}`,
        `Open a pull request with the result: ${publishPullRequest ? "yes" : "no"}`,
        "",
        `Task: ${task.trim()}`,
      ].join("\n");
      submitInFlight.current = true;
      submitFailed.current = false;
      setSubmitting(true);
      try {
        await chat.sendMessage({ text });
        // The SDK reports transport failures through onError without rejecting.
        if (!submitFailed.current) {
          setTask((current) => current === task ? "" : current);
          refreshRuns();
        }
      } catch (error) {
        setNotice(`Task could not be sent: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        submitInFlight.current = false;
        setSubmitting(false);
      }
    },
    [repoUrl, baseBranch, task, publishPullRequest, chat, refreshRuns],
  );

  const clearAll = useCallback(async () => {
    if (clearInFlight.current || submitInFlight.current) return;
    if (!window.confirm("Clear conversation history and retained runs?")) return;
    clearInFlight.current = true;
    setClearing(true);
    setNotice(null);
    let historyCleared = false;
    try {
      await chat.clearHistory();
      historyCleared = true;
      const response = await fetch("/api/runs", { method: "DELETE" });
      if (!response.ok) throw new Error(`Runs clear failed: ${response.status}`);
      setNotice("Conversation history and run registry cleared.");
      refreshRuns();
    } catch (error) {
      setNotice(historyCleared
        ? "History cleared locally; run registry could not be cleared"
        : `History could not be cleared: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      clearInFlight.current = false;
      setClearing(false);
    }
  }, [chat, refreshRuns]);

  const cancelRun = useCallback(
    async (runId: string) => {
      try {
        const response = await fetch(`/api/runs/${encodeURIComponent(runId)}`, { method: "DELETE" });
        if (!response.ok) throw new Error(`Request failed: ${response.status}`);
        setNotice(`Cancellation requested for ${runId}.`);
        refreshRuns();
      } catch (error) {
        setNotice(`Cancellation could not be requested: ${error instanceof Error ? error.message : String(error)}`);
      }
    },
    [refreshRuns],
  );

  const connectionState = agent.connectionError
    ? `Connection error: ${agent.connectionError.message ?? "unknown"}`
    : agent.identified
      ? "Connected"
      : "Connecting";
  const busy = submitting || clearing || chat.isStreaming || chat.status === "streaming" || chat.status === "submitted";

  return (
    <div className="page">
      <header className="header">
        <div>
          <h1>AI Intern</h1>
          <a href="/docs/">Documentation</a>
          <p className="subtitle">
            Self-hosted on your Cloudflare account. Approval-gated coding tasks run in isolated
            Sandbox containers via OpenCode. Nothing executes before you approve it.
          </p>
        </div>
        <div className="connection" role="status" aria-live="polite">
          <span className={agent.identified && !agent.connectionError ? "dot on" : "dot"} aria-hidden="true" />
          {connectionState}
        </div>
      </header>
      <p role="status" aria-live="polite">
        {pendingApprovals.length > 0
          ? `${pendingApprovals.length} task${pendingApprovals.length === 1 ? "" : "s"} waiting for your approval.`
          : approvalAnnouncement}
      </p>

      <main className="layout">
        <section className="panel" aria-label="New coding task">
          <h2>New coding task</h2>
          <form onSubmit={submitTask} className="form">
            <label className="field">
              <span>Repository URL</span>
              <input
                type="url"
                inputMode="url"
                required
                placeholder="https://github.com/owner/repo"
                value={repoUrl}
                onChange={(event) => setRepoUrl(event.target.value)}
              />
            </label>
            <label className="field">
              <span>Base branch</span>
              <input
                type="text"
                value={baseBranch}
                onChange={(event) => setBaseBranch(event.target.value)}
                placeholder="main"
              />
            </label>
            <label className="field">
              <span>Task</span>
              <textarea
                required
                rows={5}
                placeholder="Describe the change you want, e.g. fix the login redirect and add a test."
                value={task}
                onChange={(event) => setTask(event.target.value)}
              />
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={publishPullRequest}
                onChange={(event) => setPublishPullRequest(event.target.checked)}
              />
              <span>Open a pull request with the result (requires GITHUB_TOKEN)</span>
            </label>
            <div className="actions">
              <button type="submit" disabled={busy}>
                {submitting ? "Submitting" : busy ? "Working" : "Send for approval"}
              </button>
              <button type="button" onClick={clearAll} className="secondary" disabled={busy}>
                {clearing ? "Clearing history" : "Clear history"}
              </button>
            </div>
          </form>
          {notice ? <p className="notice">{notice}</p> : null}
          {chat.error ? <p className="error">Chat error: {chat.error.message}</p> : null}
          {runsError ? <p className="error">Runs registry: {runsError}</p> : null}
        </section>

        <section className="panel" aria-label="Conversation">
          <h2>Conversation</h2>
          {chat.messages.length === 0 ? (
            <p className="muted">No messages yet. Submit a task to start.</p>
          ) : (
            <ol className="messages">
              {chat.messages.map((message) => (
                <li key={message.id} className={`message ${message.role}`}>
                  <div className="role">{message.role === "user" ? "You" : "AI Intern"}</div>
                  {message.parts.map((part, index) => {
                    const text = partText(part);
                    if (text !== null) {
                      return (
                        <pre key={index} className="text">
                          {text}
                        </pre>
                      );
                    }
                    if (isToolUIPart(part)) {
                      const state = getToolPartState(part);
                      const approval = getToolApproval(part);
                      return (
                        <div key={index} className="toolpart">
                          <span className="toolname">{toolDisplayName(part)}</span>
                          <span className="toolstate">{approval?.approved === false ? "Rejected" : state}</span>
                        </div>
                      );
                    }
                    return null;
                  })}
                </li>
              ))}
            </ol>
          )}

          {pendingApprovals.length > 0 ? (
            <div className="approvals" role="group" aria-label="Pending approvals">
              <h3>Waiting for your approval</h3>
              {pendingApprovals.map((approval) => (
                <div key={approval.approvalId} className="approval">
                  <div className="approval-title">{approval.tool}</div>
                  <pre className="approval-input">
                    {typeof approval.input === "string"
                      ? approval.input
                      : JSON.stringify(approval.input, null, 2)}
                  </pre>
                  <p className="muted">
                    Approving starts an isolated sandbox run. Rejecting stops the tool call.
                  </p>
                  <div className="actions">
                    <button
                      type="button"
                      disabled={decisions[approval.approvalId] !== undefined}
                      onClick={() => decideApproval(approval.approvalId, true)}
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      disabled={decisions[approval.approvalId] !== undefined}
                      onClick={() => decideApproval(approval.approvalId, false)}
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </section>

        <section className="panel" aria-label="Delegated runs">
          <div className="panelhead">
            <h2>Delegated runs</h2>
            <button type="button" className="secondary" onClick={refreshRuns}>
              Refresh
            </button>
          </div>
          {toolRuns.length === 0 ? (
            <p className="muted">No live runs. Approved tasks appear here while they execute.</p>
          ) : (
            <ol className="runs">
              {toolRuns.map((run) => (
                <li key={run.runId} className="run">
                  <div className="runhead">
                    <span className="runid">{run.runId}</span>
                    <span className={`status ${run.status}`}>{run.status}</span>
                  </div>
                  <div className="muted">
                    {run.agentType}
                    {run.parentToolCallId ? ` · tool call ${run.parentToolCallId}` : ""}
                  </div>
                  {run.parts.length > 0 ? (
                    <pre className="text">{run.parts.map(runPartText).join("\n")}</pre>
                  ) : null}
                  {run.summary ? <pre className="text">{run.summary}</pre> : null}
                  {run.error ? <p className="error">{run.error}</p> : null}
                </li>
              ))}
            </ol>
          )}

          <h3>Retained runs</h3>
          {retainedRuns.length === 0 ? (
            <p className="muted">No retained runs on the orchestrator yet.</p>
          ) : (
            <ol className="runs">
              {retainedRuns.map((run) => (
                <li key={run.runId} className="run">
                  <details>
                    <summary aria-label={`${run.task} — ${run.repoUrl} — ${run.status}`}>
                      <span className="runid">{run.repoUrl}</span>{" "}
                      <span className={`status ${run.status}`}>{run.status}</span>
                    </summary>
                    <div className="muted">
                      {run.sandboxId} · {run.baseBranch}
                      {run.publishPullRequest ? " · pull request requested" : ""}
                    </div>
                    <pre className="text">{run.task}</pre>
                    {run.summary ? <pre className="text">{run.summary}</pre> : null}
                    {run.error ? <p className="error">{run.error}</p> : null}
                    {run.status === "pending" || run.status === "running" ? (
                      <button type="button" className="secondary" onClick={() => cancelRun(run.runId)}>
                        Cancel run
                      </button>
                    ) : null}
                  </details>
                </li>
              ))}
            </ol>
          )}
        </section>
      </main>
    </div>
  );
}
