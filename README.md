# AI Intern

An account-owned Cloudflare coding workspace: describe a GitHub task, review the proposed delegation, approve or reject it, and inspect a sandbox-generated diff. The runtime is Cloudflare Agents + Sandbox containers running OpenCode, with a React dashboard and Astro/Starlight documentation served by one Worker.

**Status: local prototype, not production-ready.** No live end-to-end cloud run is claimed. `VERIFICATION.md` records the current evidence: `npm run typecheck`, `npm run lint`, `npm test` (111/111), and `npm run build` pass locally; `npx wrangler deploy --dry-run` fails on this machine because no Docker CLI is available to package the container image. Until a dated live run is recorded in `VERIFICATION.md` against the P2 acceptance bar in `PLAN.md` §15 (submit → approve → clone/code/collect with a diff that matches reality, rejection starting no container, honest failure exit codes, PR with deletions shown as deleted, peak memory measured), the honest status stays "local prototype".

Provider traffic is intercepted at the Sandbox egress boundary and forwarded through the account owner's AI Gateway binding — there is no provider callback route (the dead callback path was deleted; the forwarder and its route no longer exist).

## Deploy

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/princepal9120/ai-intern)

### Prerequisites (in order)

1. Workers Paid plan (Durable Objects + Containers require it).
2. An AI Gateway with a stored provider key ([BYOK](https://developers.cloudflare.com/ai-gateway/configuration/bring-your-own-keys/)) — the key never enters this repo or the container.
3. Cloudflare Access on the Worker route, **with a bypass for `/api/slack/*` and `/api/github/webhook`** (Slack and GitHub cannot complete an Access login).
4. `GITHUB_TOKEN` secret — required for PR publishing, so effectively required for Slack.
5. Optional Slack app — see the Slack section below.

**Resolve the readiness blockers before deploying.** Confirm Workers/Containers plan eligibility, quotas, and account billing in current Cloudflare documentation. Configure an account-owned AI Gateway with a stored Google BYOK key or Unified Billing, and select an available model id (model ids retire — see Configuration).

After implementing and validating the missing security boundaries, operator commands are:

~~~sh
npx wrangler login
# Optional account mutations:
npx wrangler secret put GITHUB_TOKEN
npx wrangler secret put GITHUB_WEBHOOK_SECRET
npm run build
npm run deploy
~~~

These commands change the operator's account. They were not executed as part of this documentation work. npm run deploy invokes Wrangler; it does not automatically build the static assets first.

Protect every reachable hostname with Cloudflare Access or equivalent authentication. An obscure URL is not access control. Browser approval is not route authorization. Review the security docs before live operation.

## Local quickstart

Requirements: Node.js **22.12.0+**, npm **9.6.5+**. A Docker CLI is also
required for Wrangler container image packaging; a missing Docker daemon
fails even the local dry run.

~~~sh
npm ci
npm run typecheck
npm run lint
npm test
npm run docs:check
npm run build
npm run docs:preview
~~~

Open **http://localhost:4321/docs/** to read the built documentation with search.

- Dashboard only: npm run dev (port 5173; no Worker API proxy).
- Docs editing: npm run docs:dev (port 4321/docs/; search requires a production build).
- Built Worker/assets: npm run build, then npx wrangler dev. Containers require a compatible local engine; startup may fail without it.
- Local deployment packaging: npx wrangler deploy --dry-run. This is not a deployment or proof of a live coding run.

## Documentation

The documentation site at /docs/ includes setup, configuration, local development, dashboard usage, deployment, GitHub integration, security, architecture, API reference, troubleshooting, cost surfaces, contributing, and an end-to-end acceptance checklist.

Source entry: [docs index](docs/src/content/docs/index.md). Content lives in docs/src/content/docs/. The root build runs Vite first, builds Astro, copies docs/dist into public/docs, and verifies local links, anchors, assets, and Pagefind output.

## Architecture

~~~text
Browser dashboard / + Starlight docs /docs/
  -> CodingOrchestrator (Think Durable Object; human-approved tool)
  -> OpenCodeAgent (AIChatAgent; structured task envelope)
  -> Sandbox Durable Object + container + OpenCode

Planning model: Workers AI binding
Coding model path: container -> Sandbox egress interception -> AI Gateway binding
No public provider callback: the container never holds a real provider key
Optional PR publishing: GitHub REST API from Worker, never container token
~~~

One installation is single-tenant and account-owned. No Python backend, Docker Compose, Postgres, Redis, or separate Next.js service is required by this implementation. Runs are routed to per-user orchestrator Durable Objects via the `CF-Access-Authenticated-User-Email` header. Default concurrency is five retained active coding runs and five configured container instances (`MAX_CONCURRENT_RUNS = 5`, `max_instances: 5`, `instance_type: standard-1`).

## Platform ceiling

Cloudflare Containers max out at **`standard-4` (4 vCPU / 12 GiB / 20 GB)** — see [Containers limits](https://developers.cloudflare.com/containers/platform/limits/). Heavy builds and large monorepo test suites are out of reach on this platform, by design. Do not expect Capy-class machine sizes (16 vCPU / 128 GB) here.

## Configuration and models

Non-secret defaults in wrangler.jsonc:

| Setting | Default |
| --- | --- |
| GATEWAY_ID | default |
| ORCHESTRATOR_MODEL | @cf/meta/llama-3.1-8b-instruct |
| CODING_MODEL | google/gemini-3.5-flash-lite |
| RUNTIME | sandbox |

Only google/* coding models are accepted (`buildOpencodeConfig` in `src/runtime.ts` rejects anything else). Model ids retire — `gemini-2.0-flash` was shut down 2026-06-01, which is why the default moved. Verify current availability in your account; the checked-in model name is not a service guarantee. The assistant model used to edit this project is independent of the application's runtime models.

Do not add provider credentials to the container. The container gets a dummy key (`DUMMY_PROVIDER_KEY`); the Sandbox Durable Object swaps in the real AI Gateway credential outside the container. Copy .dev.vars.example to the ignored .dev.vars for local configuration. Optional GITHUB_TOKEN is used for Worker-side publication, not private cloning. GITHUB_WEBHOOK_SECRET verifies acknowledgment-only webhook requests.

## Pinned versions

These versions are pinned because silent upgrades break the run contract:

| Pin | Coupling |
| --- | --- |
| `opencode-ai@1.18.31` (Dockerfile) | `parseOpencodeEvent` in `src/runtime.ts` couples to its JSON event shape |
| `@cloudflare/sandbox@0.12.9` (package.json) | Must match the base image tag `cloudflare/sandbox:0.12.9-opencode` |
| `CODING_MODEL` (`google/gemini-3.5-flash-lite`) | Provider model ids retire without warning |

Bumping any of them requires re-running the P2 live acceptance run before claiming it works.

## Slack

Shipped: the `/ai-intern <github-repo-url> <task>` slash command (`POST /api/slack/command`), verified with HMAC-SHA256 and a 5-minute replay window, queues an orchestrator run and replies ephemerally. See `src/slack.ts` and `src/slack-routes.ts`.

Not built: the `app_mention` events endpoint, in-thread Block Kit approval cards with an approver allowlist, burst grouping, and thread-context gathering. No P3 live workspace verification is claimed; the P3 acceptance bar in `PLAN.md` §15 (Request URL verification with Access enabled, non-approver clicks refused with no container started, one run per burst, secret redaction) is pending.

## Automations

Not built. There is no Automations Durable Object, no cron trigger block, no `run_when` gate, and no unattended mode. Scheduled or webhook-driven runs do not exist yet.

## Agent harnesses

OpenCode only. `buildOpencodeArgv` invokes `opencode run --format json`; there is no Claude Code, Codex, or Aider harness, and provider choice is limited to `google/*` (see Configuration). The computer adapter deliberately refuses execution — `@cloudflare/computer` is preview-only, so Sandbox remains the default.

## What is and is not implemented

- Structured delegation input and SDK approval UI exist.
- Sandbox clone/configure/code/collect flow has unit tests using fakes.
- Provider traffic interception at the Sandbox egress boundary is implemented in `src/sandbox.ts`; there is no callback route to enable.
- Phase updates exist; token-level OpenCode JSON event streaming is partially surfaced via `streamProgress`.
- Per-user orchestrator routing exists (`getUserId` in `src/index.ts`); unauthenticated `/api/runs` returns 401. Full Access JWT verification is not implemented.
- No deny-by-default egress allowlist yet — `outboundByHost` routes two hosts but anything else falls through. Do not expose untrusted runs publicly on this basis.
- GitHub credential is attached to any github.com request from the container — not yet scoped to the run's repo.
- Cancellation is best-effort; clearing registry/history is not process cancellation or complete Durable Object erasure.
- GitHub publishing uses captured contents, not a lossless Git patch. File modes and large files need further work. Webhooks acknowledge events only.
- The parent result envelope exists (`RESULT_MARKER`); trust the parsed envelope, not the transport type — inspect transcripts, not just badges.
- Run cost estimation helpers exist (`src/costs.ts`) as pure functions; they are estimates, not bills.

## Alternative runtimes

The computer adapter deliberately refuses execution. @cloudflare/computer's intended fit is persistent SQLite-backed VFS, typed Git, agent tools, and Worker-shell/container backends. It is not installed; verify current preview status before any implementation. Sandbox remains the default. celld is not a target because Workers compatibility does not supply managed Sandbox/Containers bindings.

## Troubleshooting and costs

Start with the troubleshooting docs. Static builds do not require cloud credentials. Live container execution does.

Cost surfaces include Workers, Workers AI planning inference, Durable Objects, Containers, AI Gateway/provider inference, and GitHub API quotas. No prices, free-tier suitability, or provisioning time guarantees are invented. Tokens dominate the bill (roughly 20–40× compute); review current limits and provider pricing before deployment.

## Official sources

- [Cloudflare Agents](https://developers.cloudflare.com/agents/)
- [Sandbox](https://developers.cloudflare.com/sandbox/)
- [Containers](https://developers.cloudflare.com/containers/)
- [Containers limits](https://developers.cloudflare.com/containers/platform/limits/)
- [AI Gateway](https://developers.cloudflare.com/ai-gateway/)
- [AI Gateway BYOK](https://developers.cloudflare.com/ai-gateway/configuration/bring-your-own-keys/)
- [Access](https://developers.cloudflare.com/cloudflare-one/access-controls/)
- [Computer package](https://www.npmjs.com/package/@cloudflare/computer)
- [Astro](https://docs.astro.build/)
- [Starlight](https://starlight.astro.build/)

## License

MIT. See LICENSE.
