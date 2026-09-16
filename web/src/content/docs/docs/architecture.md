---
title: Architecture
description: Components, data flow, and unfinished integration boundaries.
---

~~~text
Browser dashboard / + static Starlight docs /docs/
  | chat, approvals and delegated events over SDK connections
CodingOrchestrator (Think + Durable Object, name default)
  | delegate_coding_task, needsApproval: true
OpenCodeAgent (AIChatAgent + structured task envelope)
  | Sandbox runtime adapter
Sandbox Durable Object + container (one ID per run, max 3)
  | OpenCode with dummy Google key
Worker /api/provider/google -> account AI Gateway -> Google model

Worker /api/runs -> retained registry
Worker GitHub REST calls -> optional branch and PR
Worker /api/github/webhook -> verified acknowledgment only
~~~

The parent uses Workers AI for planning. Real model-provider and GitHub credentials are not supplied to the container by this implementation. The callback's authentication remains incomplete; the diagram is not a validated production security boundary.

## Source map

| Path | Responsibility |
| --- | --- |
| src/index.ts | Assets, SDK routes, run API, provider forwarding, webhook |
| src/agents/orchestrator.ts | Planning, approval, delegation, retained registry |
| src/agents/opencode-agent.ts | Sandbox SDK operations, progress and publishing |
| src/runtime.ts | Clone, OpenCode execution, bounded file/diff collection |
| src/provider-gateway.ts | Server-side provider forwarding |
| src/github.ts | GitHub REST publication |
| src/runs.ts and src/transcript.ts | State and transcript helpers |
| client/main.tsx and client/app.tsx | Mounted dashboard |
| docs/ and scripts/ | Static documentation and build checks |

No D1, KV, Queues, R2, Postgres, Redis, or separate frontend service is required. State resides in Agents/Sandbox Durable Objects.

The runtime emits clone/configure/code/collect phases but awaits OpenCode execution; it does not stream every JSON event. The registry stores metadata and summary/error, not separate diff/file fields.

The specification requires Sandbox HTTPS interception, private Git transport credentials, and retained-registry gating of child routes. The present Worker proxy and direct SDK routing do not provide those guarantees. See [Readiness](/docs/readiness/).

## Alternative runtimes

The computer adapter is a guarded refusal, not an implemented runtime. The intended fit of @cloudflare/computer includes persistent SQLite-backed VFS, typed Git operations, agent tools, and Worker-shell/container backends. It is not installed here. Verify current APIs and preview status in the [package documentation](https://www.npmjs.com/package/@cloudflare/computer) before implementing it. The code retains the preview-only warning and defaults to Sandbox.

celld is not a deployment target: Workers-compatible execution alone does not provide the managed Sandbox/Containers bindings this repository uses.

Official sources: [Agents](https://developers.cloudflare.com/agents/), [Sandbox](https://developers.cloudflare.com/sandbox/), [Containers](https://developers.cloudflare.com/containers/), [AI Gateway](https://developers.cloudflare.com/ai-gateway/).

