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
import { DiffViewer } from "./components/DiffViewer";
import { TaskForm } from "../../web/src/components/TaskForm";
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
  diff?: string;
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

// Diff output for completed live runs. The orchestrator surfaces the unified
// diff on the run record when present; anything else is not diff output.
function extractCompletedDiff(run: unknown): string | null {
  if (typeof run !== "object" || run === null) return null;
  const record = run as Record<string, unknown>;
  if (record["status"] !== "completed") return null;
  const direct = record["diff"];
  if (typeof direct === "string" && direct.trim() !== "") return direct;
  return null;
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
    <div className="min-h-screen bg-[#0f1419] text-[#e6edf3] font-sans selection:bg-[#4f9cf0] selection:text-[#06121f] flex flex-col xl:flex-row overflow-hidden">
      {/* SIDEBAR: Config & Task Form */}
      <aside className="w-full xl:w-96 border-r-0 xl:border-r border-[#2a3441] bg-[#182028] flex flex-col shrink-0 h-auto xl:h-screen overflow-y-auto">
        <div className="p-6 xl:p-8 border-b border-[#2a3441]">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-bold tracking-tight text-white">AI Intern</h1>
            <a href="/docs/" className="text-sm text-[#4f9cf0] hover:text-[#3b82f6] font-medium transition-colors">Docs</a>
          </div>
          <p className="text-sm text-[#8b98a9] leading-relaxed mb-6">
            Self-hosted on your Cloudflare account. Approval-gated coding tasks run in isolated Sandbox containers via OpenCode.
          </p>
          <div className="inline-flex items-center gap-2 border border-[#2a3441] bg-[#0f1419] rounded-full px-3 py-1.5 text-xs font-medium text-[#8b98a9]" role="status" aria-live="polite">
            <span className={`w-2 h-2 rounded-full ${agent.identified && !agent.connectionError ? "bg-[#4cc38a]" : "bg-[#8b98a9]"}`} aria-hidden="true" />
            {connectionState}
          </div>
        </div>

        <div className="p-6 xl:p-8 flex-1">
          <h2 className="text-xs font-bold uppercase tracking-wider text-[#8b98a9] mb-5">New Coding Task</h2>
          <TaskForm
            repoUrl={repoUrl}
            task={task}
            baseBranch={baseBranch}
            publishPullRequest={publishPullRequest}
            busy={busy}
            submitting={submitting}
            clearing={clearing}
            onRepoUrlChange={setRepoUrl}
            onTaskChange={setTask}
            onBaseBranchChange={setBaseBranch}
            onPublishPullRequestChange={setPublishPullRequest}
            onSubmit={submitTask}
            onClear={clearAll}
          />
          {notice ? <p className="mt-4 text-sm text-[#8b98a9] bg-[#0f1419] p-3 rounded-lg border border-[#2a3441]">{notice}</p> : null}
          {chat.error ? <p className="mt-4 text-sm text-[#f06666] bg-[#0f1419] p-3 rounded-lg border border-[#f06666]/30">Chat error: {chat.error.message}</p> : null}
          {runsError ? <p className="mt-4 text-sm text-[#f06666] bg-[#0f1419] p-3 rounded-lg border border-[#f06666]/30">Runs registry: {runsError}</p> : null}
        </div>
      </aside>

      {/* MAIN CONTENT: Conversation & Runs */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden bg-[#0f1419]">
        {/* TOP: PENDING APPROVALS ALERT */}
        {(pendingApprovals.length > 0 || approvalAnnouncement) ? (
          <div className="bg-[#182028] border-b border-[#2a3441] px-6 xl:px-10 py-4 flex items-center justify-between shadow-sm z-10 shrink-0">
             <p className="text-sm font-medium text-[#e6edf3]" role="status" aria-live="polite">
              {pendingApprovals.length > 0
                ? <span className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-[#c9a227] animate-pulse shadow-[0_0_8px_rgba(201,162,39,0.6)]"/> {pendingApprovals.length} task{pendingApprovals.length === 1 ? "" : "s"} waiting for your approval.</span>
                : approvalAnnouncement}
             </p>
          </div>
        ) : null}

        <div className="flex-1 overflow-y-auto p-6 xl:p-10 flex flex-col xl:flex-row gap-8 xl:gap-12">
            
            {/* CONVERSATION AREA */}
            <section className="flex-1 min-w-0 flex flex-col gap-6" aria-label="Conversation">
                <div className="flex items-center justify-between border-b border-[#2a3441] pb-3">
                    <h2 className="text-lg font-semibold text-white">Conversation</h2>
                </div>
                
                {chat.messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-48 border border-dashed border-[#2a3441] rounded-xl bg-[#182028]/50">
                    <p className="text-[#8b98a9] text-sm">No messages yet. Submit a task to start.</p>
                  </div>
                ) : (
                  <ol className="flex flex-col gap-6">
                    {chat.messages.map((message) => (
                      <li key={message.id} className={`flex flex-col ${message.role === 'user' ? 'items-end' : 'items-start'}`}>
                        <div className="text-xs font-semibold text-[#8b98a9] uppercase tracking-wider mb-1.5 px-1">{message.role === "user" ? "You" : "AI Intern"}</div>
                        <div className={`flex flex-col gap-2 max-w-[90%] md:max-w-[80%] ${message.role === 'user' ? 'bg-[#4f9cf0] text-[#06121f] rounded-2xl rounded-tr-sm p-4' : 'bg-[#182028] border border-[#2a3441] text-[#e6edf3] rounded-2xl rounded-tl-sm p-4'}`}>
                            {message.parts.map((part, index) => {
                                const text = partText(part);
                                if (text !== null) {
                                  return (
                                    <pre key={index} className="whitespace-pre-wrap font-sans text-sm break-words">
                                      {text}
                                    </pre>
                                  );
                                }
                                if (isToolUIPart(part)) {
                                  const state = getToolPartState(part);
                                  const approval = getToolApproval(part);
                                  return (
                                    <div key={index} className="flex flex-wrap items-center gap-2 mt-2 bg-[#0f1419]/50 p-2 rounded-lg border border-[#2a3441]/50">
                                      <span className="font-mono text-xs bg-[#2a3441] text-gray-200 rounded px-2 py-1">{toolDisplayName(part)}</span>
                                      <span className={`text-xs font-medium ${approval?.approved === false ? 'text-[#f06666]' : 'text-[#8b98a9]'}`}>{approval?.approved === false ? "Rejected" : state}</span>
                                    </div>
                                  );
                                }
                                return null;
                            })}
                        </div>
                      </li>
                    ))}
                  </ol>
                )}

                {pendingApprovals.length > 0 ? (
                  <div className="mt-4 border-t border-[#2a3441] pt-6 flex flex-col gap-4" role="group" aria-label="Pending approvals">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[#c9a227]">Waiting for your approval</h3>
                    {pendingApprovals.map((approval) => (
                      <div key={approval.approvalId} className="border border-[#c9a227]/50 bg-[#182028] rounded-xl p-5 shadow-lg shadow-[#c9a227]/5">
                        <div className="font-mono font-bold text-sm text-[#e6edf3] mb-3">{approval.tool}</div>
                        <pre className="whitespace-pre-wrap font-mono text-xs text-[#8b98a9] bg-[#0f1419] p-3 rounded-lg border border-[#2a3441] max-h-56 overflow-auto mb-4">
                          {typeof approval.input === "string" ? approval.input : JSON.stringify(approval.input, null, 2)}
                        </pre>
                        <p className="text-xs text-[#8b98a9] mb-4">
                          Approving starts an isolated sandbox run. Rejecting stops the tool call.
                        </p>
                        <div className="flex gap-3">
                          <button
                            type="button"
                            className="bg-[#4cc38a] hover:bg-[#3ba875] text-[#06121f] font-semibold py-2 px-5 rounded-lg transition-colors disabled:opacity-50 text-sm shadow-sm"
                            disabled={decisions[approval.approvalId] !== undefined}
                            onClick={() => decideApproval(approval.approvalId, true)}
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            className="bg-transparent border border-[#f06666] text-[#f06666] hover:bg-[#f06666]/10 font-semibold py-2 px-5 rounded-lg transition-colors disabled:opacity-50 text-sm"
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

            {/* RUNS AREA */}
            <section className="flex-1 min-w-0 flex flex-col gap-6" aria-label="Delegated runs">
                <div className="flex items-center justify-between border-b border-[#2a3441] pb-3">
                    <h2 className="text-lg font-semibold text-white">Delegated Runs</h2>
                    <button type="button" className="text-xs bg-[#182028] hover:bg-[#2a3441] border border-[#2a3441] text-[#e6edf3] font-medium py-1.5 px-3 rounded-md transition-colors" onClick={refreshRuns}>
                      Refresh
                    </button>
                </div>
                
                {toolRuns.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-24 border border-dashed border-[#2a3441] rounded-xl bg-[#182028]/50">
                      <p className="text-[#8b98a9] text-sm">No live runs. Approved tasks appear here while they execute.</p>
                    </div>
                ) : (
                  <ol className="flex flex-col gap-4">
                    {toolRuns.map((run) => {
                      const completedDiff = extractCompletedDiff(run);
                      const statusColors: Record<string, string> = {
                        completed: "text-[#4cc38a] border-[#4cc38a]/30 bg-[#4cc38a]/10",
                        running: "text-[#4f9cf0] border-[#4f9cf0]/30 bg-[#4f9cf0]/10",
                        pending: "text-[#c9a227] border-[#c9a227]/30 bg-[#c9a227]/10",
                        error: "text-[#f06666] border-[#f06666]/30 bg-[#f06666]/10",
                        aborted: "text-[#f06666] border-[#f06666]/30 bg-[#f06666]/10",
                        cancelled: "text-[#f06666] border-[#f06666]/30 bg-[#f06666]/10"
                      };
                      const sColor = statusColors[run.status] || "text-[#8b98a9] border-[#2a3441] bg-[#182028]";
                      
                      return (
                        <li key={run.runId} className="border border-[#2a3441] rounded-xl p-4 bg-[#182028] shadow-sm">
                          <div className="flex items-start justify-between gap-3 mb-2">
                            <span className="font-mono text-xs text-[#e6edf3] break-all">{run.runId}</span>
                            <span className={`text-[10px] font-bold uppercase tracking-wider border rounded-full px-2 py-0.5 shrink-0 ${sColor}`}>{run.status}</span>
                          </div>
                          <div className="text-xs text-[#8b98a9] mb-3">
                            {run.agentType}
                            {run.parentToolCallId ? ` · tool call ${run.parentToolCallId}` : ""}
                          </div>
                          {run.parts.length > 0 ? (
                            <pre className="font-mono text-xs text-[#8b98a9] bg-[#0f1419] p-3 rounded-lg border border-[#2a3441] max-h-40 overflow-auto whitespace-pre-wrap break-words mb-3">
                              {run.parts.map(runPartText).join("\n")}
                            </pre>
                          ) : null}
                          {run.summary ? <pre className="font-mono text-xs text-[#e6edf3] bg-[#0f1419] p-3 rounded-lg border border-[#2a3441] max-h-40 overflow-auto whitespace-pre-wrap break-words mb-3">{run.summary}</pre> : null}
                          {run.error ? <p className="text-xs text-[#f06666] bg-[#f06666]/10 p-3 rounded-lg border border-[#f06666]/20 mb-3">{run.error}</p> : null}
                          {run.status === "completed" && completedDiff ? (
                            <div className="mt-3"><DiffViewer diff={completedDiff} runId={run.runId} /></div>
                          ) : null}
                          {run.status === "completed" && !completedDiff ? (
                            <p className="text-xs text-[#8b98a9] italic">No file changes produced</p>
                          ) : null}
                        </li>
                      );
                    })}
                  </ol>
                )}

                <h3 className="text-xs font-bold uppercase tracking-wider text-[#8b98a9] mt-4 border-t border-[#2a3441] pt-6">Retained Runs</h3>
                {retainedRuns.length === 0 ? (
                  <p className="text-[#8b98a9] text-sm">No retained runs on the orchestrator yet.</p>
                ) : (
                  <ol className="flex flex-col gap-3">
                    {retainedRuns.map((run) => {
                      const statusColors: Record<string, string> = {
                        completed: "text-[#4cc38a] border-[#4cc38a]/30 bg-[#4cc38a]/10",
                        running: "text-[#4f9cf0] border-[#4f9cf0]/30 bg-[#4f9cf0]/10",
                        pending: "text-[#c9a227] border-[#c9a227]/30 bg-[#c9a227]/10",
                        error: "text-[#f06666] border-[#f06666]/30 bg-[#f06666]/10",
                      };
                      const sColor = statusColors[run.status] || "text-[#8b98a9] border-[#2a3441] bg-[#182028]";
                      
                      return (
                        <li key={run.runId} className="border border-[#2a3441] rounded-xl bg-[#182028] overflow-hidden">
                          <details className="group">
                            <summary className="flex items-center justify-between p-4 cursor-pointer hover:bg-[#2a3441]/30 transition-colors select-none" aria-label={`${run.task} — ${run.repoUrl} — ${run.status}`}>
                              <div className="flex items-center gap-3 overflow-hidden">
                                <svg className="w-4 h-4 text-[#8b98a9] transform group-open:rotate-90 transition-transform shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                                <span className="font-mono text-xs text-[#e6edf3] truncate">{run.repoUrl}</span>
                              </div>
                              <span className={`text-[10px] font-bold uppercase tracking-wider border rounded-full px-2 py-0.5 shrink-0 ml-3 ${sColor}`}>{run.status}</span>
                            </summary>
                            <div className="p-4 pt-0 border-t border-[#2a3441]/50 mt-1 flex flex-col gap-3">
                              <div className="text-[11px] text-[#8b98a9] font-mono">
                                {run.sandboxId} · {run.baseBranch}
                                {run.publishPullRequest ? " · pull request requested" : ""}
                              </div>
                              <pre className="font-sans text-sm text-[#e6edf3] whitespace-pre-wrap break-words">{run.task}</pre>
                              {run.summary ? <pre className="font-mono text-xs text-[#e6edf3] bg-[#0f1419] p-3 rounded-lg border border-[#2a3441] whitespace-pre-wrap break-words max-h-40 overflow-auto">{run.summary}</pre> : null}
                              {run.error ? <p className="text-xs text-[#f06666] bg-[#f06666]/10 p-3 rounded-lg border border-[#f06666]/20">{run.error}</p> : null}
                              {run.status === "completed" && run.diff ? (
                                <DiffViewer diff={run.diff} runId={run.runId} />
                              ) : null}
                              {(run.status === "pending" || run.status === "running") ? (
                                <button type="button" className="self-start text-xs bg-transparent border border-[#f06666] hover:bg-[#f06666]/10 text-[#f06666] font-medium py-1.5 px-3 rounded-md transition-colors mt-2" onClick={() => cancelRun(run.runId)}>
                                  Cancel run
                                </button>
                              ) : null}
                            </div>
                          </details>
                        </li>
                      )
                    })}
                  </ol>
                )}
            </section>
        </div>
      </main>
    </div>
  );
}
