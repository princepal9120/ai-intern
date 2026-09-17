# Verification Results

**Last run: 2026-09-17.**

## Status: PASS with one documented environment limitation

| Check | Result |
|-------|--------|
| `pnpm typecheck` | PASS |
| `pnpm lint` | PASS |
| `pnpm test` | PASS (285/288 across 22 files; 3 skip without `pnpm build` output) |
| `pnpm build` | PASS |
| `npx wrangler deploy --dry-run` | **FAIL: Docker CLI not available on this machine** |
| Live cloud run (PLAN.md T10) | **NOT ATTEMPTED** |

## Limitations, stated plainly

**`wrangler deploy --dry-run` cannot complete here.** It packages the container image and there is no Docker CLI installed. This is an environment gap, not a code defect — but it also means T1–T3 (the SQLite migration, the instance type, and the model id) have **not** been validated by the tool that would catch them. Run the dry run on a machine with Docker before P2.

**No live end-to-end cloud run has been performed.** `spec/GOAL.md` forbids deploying from this environment. Every claim below rests on mocked unit tests, which cannot establish that any of this works in the cloud. Until a dated live run against the PLAN.md §15 P2 bar is recorded here, the honest status stays **local prototype**.

Specifically unmeasured: peak container memory (which decides `basic` vs `standard-1`, and per PLAN.md §8 is the binding cost constraint), cold-start time, and whether the `agents` SDK uses the WebSocket Hibernation API.

**The Claude Code and Codex harnesses are not runnable from the shipped image.** The Dockerfile installs `opencode-ai` only. Their config, argv, env, and event parsers are unit-tested; neither has been run against a live CLI, so their stream formats are asserted from documentation, not observation. Setting `AGENT_HARNESS=claude-code` or `codex` today fails at exec.

## What the 269 tests do cover

- **Egress credential boundary.** `github.com` defaults to refusal; the credential is attached only for the run's own `/owner/repo`, with prefix-confusion siblings (`/owner/repo-evil`) and non-GitHub destinations refused, and no `Authorization` header reaching a refused request. The scope is proven to be installed *before* the clone, not after.
- **Automation safety.** Approval required by default; unattended mode refused for a non-allowlisted repo and for any run mutating more than a pull request; the daily budget refusing run N+1 with its reason and resetting on the next UTC day; both kill switches.
- **The `run_when` gate failing closed** on a model error, an empty answer, and an unparseable answer.
- **Harness isolation.** Each harness's `allowedHosts` contains only its own provider host plus git, never another harness's; every harness passes the container the dummy key and nothing matching a real credential shape; OpenCode's argv, config path, config contents, and env are pinned byte for byte against the pre-T22 behavior.
- Run result envelope parsing (an `error` envelope never reads `completed`), Slack signature verification and replay bounds, approver allowlisting, burst grouping, cron parsing and coalescing, GitHub tree publishing including deletions.

## Fix history

**2026-09-17 (this pass)**
- T6: scoped the GitHub credential per run; extracted `src/egress.ts` so the security-critical handlers are testable at all (`src/sandbox.ts` imports `cloudflare:` builtins and cannot load under vitest).
- T19/T20: `run_when` gate and the three automation safety controls.
- B10: `MAX_CONCURRENT_RUNS` 3 → 5, matching `max_instances`. The tests hardcoded 3 and are now limit-relative.
- T4 residual: removed `CF_ACCOUNT_ID` from `src/env.ts` and the stale `gemini-2.0-flash` reference.

**Earlier**
- Typecheck errors (5): dashboard import path, missing runtime test imports, unused label.
- Test failures (7): `streamProgress` propagating `OpenCodeErrorEvent` instead of swallowing it; `runCodingTask` returning error details; `collectChanges` skipping deleted files; `redactSecrets` covering `AI_GATEWAY_TOKEN=`; progress cap counting only streamed events.
- Lint errors (2): unused `signal` param, unused label.

