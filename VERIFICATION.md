# Verification Results

**Last run: 2026-09-18 (rev 5, plan-review pass).**

## Status: PASS, every check green including the dry run

| Check | Result |
|-------|--------|
| `pnpm typecheck` | PASS |
| `pnpm lint` | PASS |
| `pnpm test` | PASS (374/374 across 30 files) |
| `pnpm build` | PASS (docs: 22 pages, 904 links verified) |
| `pnpm docs:check` | PASS |
| `npx wrangler deploy --dry-run` | **PASS (2026-09-18)** — OrbStack daemon started locally; container image `cloudflare/sandbox:0.12.9-opencode` + `opencode-ai@1.18.31` built and exported; all four DOs (`CodingOrchestrator`, `OpenCodeAgent`, `Sandbox`, `Automations`) bound with `new_sqlite_classes` migrations v1/v2 accepted; `instance_type: standard-1` accepted. **T1–T3 are now validated by the tool that catches them.** |
| Live cloud run (PLAN.md T10) | **NOT ATTEMPTED** — requires a Cloudflare account; `spec/GOAL.md` forbids deploying from this environment. |

## Limitations, stated plainly

**The dry run no longer blocks anything.** The prior "no Docker CLI / no daemon" limitation is retired: OrbStack was running this pass and the full dry run completed. T1–T3 (SQLite migration, instance type, model id) are validated.

**No live end-to-end cloud run has been performed.** `spec/GOAL.md` forbids deploying from this environment. Every claim below rests on mocked unit tests, which cannot establish that any of this works in the cloud. Until a dated live run against the PLAN.md §15 P2 bar is recorded here, the honest status stays **local prototype**.

Specifically unmeasured: peak container memory (which decides `basic` vs `standard-1`, and per PLAN.md §8 is the binding cost constraint), cold-start time, and whether the `agents` SDK uses the WebSocket Hibernation API.

**The Claude Code and Codex harnesses are not runnable from the shipped image.** The Dockerfile installs `opencode-ai` only. Their config, argv, env, and event parsers are unit-tested; neither has been run against a live CLI, so their stream formats are asserted from documentation, not observation. Setting `AGENT_HARNESS=claude-code` or `codex` today fails at exec.

## What the 374 tests do cover

- **Egress credential boundary.** `github.com` defaults to refusal; the credential is attached only for the run's own `/owner/repo`, with prefix-confusion siblings (`/owner/repo-evil`) and non-GitHub destinations refused, and no `Authorization` header reaching a refused request. The scope is proven to be installed *before* the clone, not after.
- **Automation safety.** Approval required by default; unattended mode refused for a non-allowlisted repo and for any run mutating more than a pull request; the daily budget refusing run N+1 with its reason and resetting on the next UTC day; both kill switches.
- **The `run_when` gate failing closed** on a model error, an empty answer, an unparseable answer, TypeSafe HTTP/parse errors, and noul below 0.8.
- **Harness isolation.** Each harness's `allowedHosts` contains only its own provider host plus git, never another harness's; every harness passes the container the dummy key and nothing matching a real credential shape; OpenCode's argv, config path, config contents, and env are pinned byte for byte against the pre-T22 behavior.
- Run result envelope parsing (an `error` envelope never reads `completed`), Slack signature verification and replay bounds, approver allowlisting, burst grouping, cron parsing and coalescing, GitHub tree publishing including deletions.

## Fix history

**2026-09-18 (review-findings pass)**
- Slack approval lane closed end to end: POST /api/runs queues a durable pending approval in the orchestrator DO (frozen delegation input, 30-min TTL, resolve-exactly-once, non-object bodies rejected at the route). Slash-command replies and `@mention` cards (`SLACK_BOT_TOKEN`) both carry Block Kit; `/api/slack/interact` resolves on the pointer `threadKey` DO (`default` for slash, `slack:{team}:{channel}:{thread_ts}` for mentions). Empty bot token: no mention card and no run. Repo: GitHub URL, else `SLACK_CHANNEL_REPOS`, else an in-thread ask.
- Run lifecycle: 30-minute deadline reclaim (reclaim-on-access), cancellation propagation via per-run AbortController, terminal runs immutable, sandbox destroyed on cancel/reclaim/finish.
- Capture integrity: oversized trees fail the run instead of publishing a partial PR; `..` now rejected as a whole path segment only.
- Dead cron trigger removed from wrangler.jsonc (finding #4); dashboard identity via /api/whoami (finding #5).
- Correctness-pass fixes: porcelain octal escapes decode as UTF-8 (non-ASCII paths no longer fail change collection); approve preflights concurrency cap/token/URL before consuming the pointer (409 keeps it retryable); run deadline 30 -> 45 min, above the worst-case phase budget.

**2026-09-17 (earlier pass)**
- T6: scoped the GitHub credential per run; extracted `src/egress.ts` so the security-critical handlers are testable at all (`src/sandbox.ts` imports `cloudflare:` builtins and cannot load under vitest).
- T19/T20: `run_when` gate and the three automation safety controls.
- B10: `MAX_CONCURRENT_RUNS` 3 → 5, matching `max_instances`. The tests hardcoded 3 and are now limit-relative.
- T4 residual: removed `CF_ACCOUNT_ID` from `src/env.ts` and the stale `gemini-2.0-flash` reference.

**Earlier**
- Typecheck errors (5): dashboard import path, missing runtime test imports, unused label.
- Test failures (7): `streamProgress` propagating `OpenCodeErrorEvent` instead of swallowing it; `runCodingTask` returning error details; `collectChanges` skipping deleted files; `redactSecrets` covering `AI_GATEWAY_TOKEN=`; progress cap counting only streamed events.
- Lint errors (2): unused `signal` param, unused label.
- **TypeSafe Choice intent wired** (handleSlackEvent). When TYPESAFE_API_KEY is set, classifySlackMentionIntent classifies Slack mention intent (fix/implement/explain/other) and prepends an intentHint sentence to the queued task. Fail-open — null leaves task unchanged. SlackMentionDeps.typeSafeFetch allows test injection. 374 tests include the wired path with mock fetch.
- **TypeSafe Score result wired** (orchestrator.ts finish completed). When TYPESAFE_API_KEY is set, evaluateResultQuality scores run output quality and annotates the run summary with the grade level. Fire-and-forget — never delays run completion.
- **TypeSafe Score result quality** (src/result-quality.ts). evaluateResultQuality returns null on missing key, HTTP errors, parse failures, and network errors; parses score + confidence + level correctly; sends the correct Score request shape.
- **TypeSafe Choice intent classification** (src/slack-mention.ts classifySlackMentionIntent). Returns null on missing key, empty mention, HTTP/parse/network errors; classifies fix/implement/explain/other; maps unknown choices to other; sends correct Choice request shape. intentHint returns sharpened prompt text per intent.
