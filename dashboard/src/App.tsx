import React, { useEffect, useRef, useState } from "react";
import { useAgent, useAgentToolEvents } from "agents/react";
import {
  GitFork,
  Loader2,
  Check,
  XCircle,
  File,
  ChevronDown,
  ChevronRight,
  FileCode,
} from "lucide-react";
import styles from "./App.module.css";

const DIR = import.meta.env.VITE_API_ORIGIN ?? window.location.origin;
const RUNS_PATH = `${DIR}/api/runs`;
const AGENT_NAME = "CodingOrchestrator";

type RunStatus = "pending" | "running" | "completed" | "error" | "cancelled";

interface RunRecord {
  runId: string;
  status: RunStatus;
  repoUrl: string;
  task: string;
  baseBranch: string;
  publishPullRequest: boolean;
  reason?: string;
  error?: string;
  summary?: string;
  exitCode?: number;
  changedFiles: string[];
  diff?: string;
  pullUrl?: string;
  files?: Array<{ path: string; content: string; encoding: "utf8" | "base64" }>;
  updatedAt: number;
  createdAt: number;
}

export function App() {
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [repoUrl, setRepoUrl] = useState("");
  const [task, setTask] = useState("");
  const [baseBranch, setBaseBranch] = useState("main");
  const [publishPullRequest, setPublishPullRequest] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const agent = useAgent({ agent: AGENT_NAME, name: "default" });
  useAgentToolEvents({ agent });

  useEffect(() => {
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    let mounted = true;
    let retryTimeout: ReturnType<typeof setTimeout> | null = null;

    const fetchRuns = async () => {
      try {
        const response = await fetch(RUNS_PATH, { signal });
        if (!response.ok) return;
        const json = (await response.json()) as { runs?: RunRecord[] };
        if (mounted) {
          setRuns(json.runs ?? []);
        }
      } catch (currentError) {
        if ((currentError as Error).name === "AbortError") return;
        if (mounted) {
          setError((currentError as Error).message);
        }
      }
    };

    fetchRuns();

    const poll = async () => {
      await fetchRuns();
      retryTimeout = setTimeout(poll, 1500);
    };
    poll();

    return () => {
      mounted = false;
      if (retryTimeout) clearTimeout(retryTimeout);
      abortControllerRef.current?.abort();
    };
  }, [RUNS_PATH]);

  const submitTask = async (approve = true) => {
    setError(null);
    setLoading(true);
    try {
      const body = JSON.stringify({
        repoUrl,
        task,
        baseBranch,
        publishPullRequest,
      });

      const response = await fetch(RUNS_PATH, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });

      if (!response.ok) {
        const message = await response.text().catch(() => "Request failed");
        throw new Error(message);
      }

      if (!approve) {
        setRepoUrl("");
        setTask("");
        return;
      }

      setRepoUrl("");
      setTask("");
      const runsResponse = await fetch(RUNS_PATH);
      if (!runsResponse.ok) throw new Error(`Runs request failed: ${runsResponse.status}`);
      const json = (await runsResponse.json()) as { runs?: RunRecord[] };
      setRuns(json.runs ?? []);
    } catch (currentError) {
      setError((currentError as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const approve = async (approvalId: string, toolCallId: string, allow = true) => {
    try {
      const approvalMessage = JSON.stringify({
        type: "cf_agent_tool_approval",
        body: JSON.stringify({
          type: "tool-approval-response",
          approvalId,
          approved: allow,
          reason: allow ? "Approved by user" : "Rejected by user",
        }),
      });
      agent.send(approvalMessage);
    } catch (currentError) {
      setError((currentError as Error).message);
    }
  };

  const pendingApprovals: Array<{
    approvalId: string;
    toolCallId: string;
    toolName: string;
    input: unknown;
  }> = [];

  const selectedRun = selectedRunId
    ? runs.find((run) => run.runId === selectedRunId)
    : undefined;

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <h1>AI Intern</h1>
        <p>Approval-gated coding tasks on Cloudflare Workers.</p>
      </header>

      {error && (
        <div className={styles.error} role="alert">
          {error}
        </div>
      )}

      <section className={styles.taskCard}>
        <label htmlFor="repoUrl">Repository URL</label>
        <input
          id="repoUrl"
          type="url"
          placeholder="https://github.com/owner/repo"
          value={repoUrl}
          onChange={(event) => setRepoUrl(event.target.value)}
        />

        <label htmlFor="task">Task</label>
        <textarea
          id="task"
          rows={4}
          placeholder="Describe the change you want in this repository."
          value={task}
          onChange={(event) => setTask(event.target.value)}
        />

        <label htmlFor="baseBranch">Base branch</label>
        <input
          id="baseBranch"
          type="text"
          value={baseBranch}
          onChange={(event) => setBaseBranch(event.target.value)}
        />

        <label className={styles.checkbox}>
          <input
            type="checkbox"
            checked={publishPullRequest}
            onChange={(event) => setPublishPullRequest(event.target.checked)}
          />
          Open a pull request
        </label>

        <div className={styles.actions}>
          <button
            className={styles.submit}
            type="button"
            disabled={!repoUrl || !task || loading}
            onClick={() => submitTask(true)}
          >
            {loading ? <Loader2 className={styles.spinner} /> : <GitFork />}
            Run task
          </button>
          <button
            type="button"
            disabled={!repoUrl || !task || loading}
            onClick={() => submitTask(false)}
          >
            Review only
          </button>
        </div>
      </section>

      {pendingApprovals.length > 0 && (
        <section className={styles.approvalCard} aria-live="polite">
          <h2>Pending approval</h2>
          {pendingApprovals.map((item) => (
            <div key={item.approvalId} className={styles.approvalRow}>
              <div className={styles.approvalBody}>
                <span className={styles.approvalTool}>{item.toolName}</span>
                <pre className={styles.approvalInput}>
                  {JSON.stringify(item.input, null, 2)}
                </pre>
              </div>
              <div className={styles.approvalActions}>
                <button
                  type="button"
                  className={styles.approvalButton}
                  onClick={() => approve(item.approvalId, item.toolCallId, true)}
                >
                  <Check /> Approve
                </button>
                <button
                  type="button"
                  className={styles.rejectButton}
                  onClick={() => approve(item.approvalId, item.toolCallId, false)}
                >
                  <XCircle /> Reject
                </button>
              </div>
            </div>
          ))}
        </section>
      )}

      <section className={styles.runs}>
        <h2>Recent runs</h2>
        {runs.length === 0 ? (
          <p className={styles.empty}>No runs yet.</p>
        ) : (
          <ul className={styles.runList}>
            {runs.map((run) => (
              <li key={run.runId} className={styles.runItem}>
                <button
                  type="button"
                  className={styles.runHeader}
                  onClick={() =>
                    setSelectedRunId(selectedRunId === run.runId ? null : run.runId)
                  }
                >
                  <span className={styles.runStatus} data-status={run.status}>
                    {run.status === "running" ? <Loader2 className={styles.spinner} /> : run.status}
                  </span>
                  <span className={styles.runSummary}>{run.task.slice(0, 80)}</span>
                  {run.status !== "running" &&
                    (run.status === "completed" ? <Check /> : <XCircle />)}
                  {run.runId === selectedRunId ? (
                    <ChevronDown />
                  ) : (
                    <ChevronRight />
                  )}
                </button>
                {run.runId === selectedRunId && selectedRun && (
                  <div className={styles.runDetail}>
                    <dl className={styles.runMeta}>
                      <dt>Repository</dt>
                      <dd>{run.repoUrl}</dd>
                      <dt>Branch</dt>
                      <dd>{run.baseBranch}</dd>
                      <dt>Status</dt>
                      <dd data-status={run.status}>{run.status}</dd>
                      {run.error ? (
                        <>
                          <dt>Error</dt>
                          <dd className={styles.errorText}>{run.error}</dd>
                        </>
                      ) : run.status === "completed" && run.changedFiles.length > 0 ? (
                        <>
                          <dt>Changed files</dt>
                          <dd className={styles.fileList}>
                            {run.changedFiles.slice(0, 20).map((path) => (
                              <span key={path} className={styles.file}>
                                <File />
                                {path}
                              </span>
                            ))}
                            {run.changedFiles.length > 20 && (
                              <span className={styles.moreFiles}>
                                +{run.changedFiles.length - 20} more
                              </span>
                            )}
                          </dd>
                          <dt>Diff</dt>
                          <dd className={styles.diff}>
                            <FileCode />
                            <pre>{run.diff ?? ""}</pre>
                          </dd>
                        </>
                      ) : run.summary ? (
                        <>
                          <dt>Summary</dt>
                          <dd>{run.summary}</dd>
                        </>
                      ) : null}
                      {run.pullUrl && (
                        <>
                          <dt>Pull request</dt>
                          <dd>
                            <a href={run.pullUrl} target="_blank" rel="noreferrer">
                              {run.pullUrl}
                            </a>
                          </dd>
                        </>
                      )}
                    </dl>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <footer className={styles.footer}>
        <p>Cloudflare Workers app. No central control plane.</p>
      </footer>
    </div>
  );
}
