---
title: Overview
description: What AI Intern runs today, what it returns, and which limits matter.
---

AI Intern is an account-owned coding workspace built around a Cloudflare
Worker, durable agents, and a Sandbox container running OpenCode.
The deployed resources are declared in `wrangler.jsonc`; the runtime flow is
implemented in `src/agents/orchestrator.ts` and `src/runtime.ts`.

## The workflow

1. Describe a task and supply an HTTPS GitHub repository URL.
2. Review the proposed `delegate_coding_task` input.
3. Approve or reject that exact delegation.
4. Follow phase progress while the sandbox clones and edits the repository.
5. Review the returned files and diff before adopting the changes.

The delegation tool sets `needsApproval: true`. Its input contains `repoUrl`,
`task`, `baseBranch` (default `main`), and `publishPullRequest` (default `false`).
These are source contracts, not a guarantee that every generated change is correct.
Source: `src/agents/orchestrator.ts`, `delegateInputSchema` and `getTools`.

## What a run returns

The sandbox runtime returns a summary, changed paths, a unified diff, captured
file contents, an exit code, and a bounded stderr tail. New files are added
with Git intent-to-add before the diff is collected.
Source: `src/runtime.ts`, `runCodingTask` and `collectChanges`.

The retained run registry is smaller: it contains status, task metadata,
timestamps, and optional summary or error. Files and diffs belong to the
transcript, not the registry response. See [Dashboard](/docs/dashboard/).
Source: `src/runs.ts`, `DelegatedRun`; `src/transcript.ts`.

## Ownership and exposure

Treat one installation as **single-tenant and account-owned**. Cloudflare
Access or equivalent authentication is required before exposing it to a team
or the public internet. An obscure Worker URL is not access control.
This is the deployment requirement in `spec/GOAL.md`, not authentication
implemented by `src/index.ts`. Read [Security](/docs/security/) first.

## Current behavior (as implemented)

Sandbox is the working runtime adapter. The `computer` adapter deliberately
refuses execution. OpenCode is configured with a dummy container key; the
real provider credential is swapped in at Sandbox egress. There is no public
provider callback. Private Git clone still uses HTTPS without a clone-time
token; path-scoped `GITHUB_TOKEN` is attached only for the approved repo.
Sources: `src/runtime.ts`, `src/egress.ts`, `src/agents/opencode-agent.ts`.

## Specification target (GOAL)

`spec/GOAL.md` additionally calls for Sandbox HTTPS interception for provider
and Git transport traffic, plus retained-registry gating of child routes.
Those are not guarantees of the current implementation. The distinctions are
explained in [Architecture](/docs/architecture/) and [GitHub](/docs/github/).

## Next steps

Start with [Getting started](/docs/getting-started/), then set the
[Configuration](/docs/configuration/). Use
[Local development](/docs/local-development/) before
[Deployment](/docs/deployment/).
