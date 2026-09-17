# AI Intern

An account-owned Cloudflare coding workspace: describe a GitHub task, review the proposed delegation, approve or reject it, and inspect a sandbox-generated diff. The intended runtime is Cloudflare Agents + Sandbox containers running OpenCode, with a React dashboard and Astro/Starlight documentation served by one Worker.

**Status: local prototype, not production-ready.** The provider callback is explicitly disabled (503) pending authenticated Sandbox egress integration. Private cloning, child-route authorization, reliable parent result classification, and lossless PR publication remain incomplete. No live end-to-end cloud run is claimed. See [readiness](docs/src/content/docs/readiness.md).

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
Coding model target: internal AI Gateway binding via Sandbox egress
Current public provider callback: disabled, 503
Optional PR publishing: GitHub REST API from Worker, never container token
~~~

One installation is single-tenant and account-owned. No Python backend, Docker Compose, Postgres, Redis, or separate Next.js service is required by this implementation. Default concurrency is three retained active coding runs and three configured container instances.

## Configuration and models

Non-secret defaults in wrangler.jsonc:

| Setting | Default |
| --- | --- |
| GATEWAY_ID | default |
| ORCHESTRATOR_MODEL | @cf/meta/llama-3.1-8b-instruct |
| CODING_MODEL | google/gemini-2.0-flash |
| RUNTIME | sandbox |

Only google/* coding models are accepted. Verify current availability in your account; the checked-in model name is not a service guarantee. The assistant model used to edit this project is independent of the application's runtime models.

WORKER_ORIGIN remains required by the current orchestrator to build its callback URL, but that callback is disabled. CF_ACCOUNT_ID and AI_GATEWAY_TOKEN are legacy optional environment fields and are not consumed by the current binding-based provider helper. Do not add provider credentials to the container.

Copy .dev.vars.example to the ignored .dev.vars for local configuration. Optional GITHUB_TOKEN is used for Worker-side publication, not private cloning. GITHUB_WEBHOOK_SECRET verifies acknowledgment-only webhook requests.

## Deployment preparation

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/princepal9120/ai-intern)

### Prerequisites

1. Workers Paid plan (Durable Objects + Containers require it).
2. An AI Gateway with a stored Google AI Studio key ([BYOK](https://developers.cloudflare.com/ai-gateway/configuration/bring-your-own-keys/)) — the key never enters this repo or the container.
3. Cloudflare Access in front of the Worker route, with a bypass for `/api/slack/*` and `/api/github/webhook`, before any non-local use.
4. Optional `GITHUB_TOKEN` secret — required for PR publishing.
5. Optional Slack app — see the Slack docs.

**Resolve the readiness blockers before deploying.** Confirm Workers/Containers plan eligibility, quotas, and account billing in current Cloudflare documentation. Configure an account-owned AI Gateway with supported Google stored BYOK or Unified Billing, and select available models. The internal helper uses AI.gateway(GATEWAY_ID).run; the Sandbox interception connection is not wired yet.

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

Protect every reachable hostname with Cloudflare Access or equivalent authentication. An obscure URL is not access control. Browser approval is not route authorization. Never expose a public provider callback to bypass Access. Review the [security guide](docs/src/content/docs/security.md) before live operation.

## What is and is not implemented

- Structured delegation input and SDK approval UI exist.
- Sandbox clone/configure/code/collect flow has unit tests using fakes.
- Public diff-only repository support is the intended baseline; live coding is blocked by provider integration.
- Phase updates exist; token-level OpenCode JSON event streaming does not.
- Registry lookup rejects unknown IDs, but direct child SDK routes are not gated by it.
- Cancellation is best-effort; clearing registry/history is not process cancellation or complete Durable Object erasure.
- GitHub publishing uses captured contents, not a lossless Git patch. Deletions, renames, file modes, and large files need further work. Webhooks acknowledge events only.
- The parent can label string error output completed; inspect transcripts, not just badges.

## Alternative runtimes

The computer adapter deliberately refuses execution. @cloudflare/computer's intended fit is persistent SQLite-backed VFS, typed Git, agent tools, and Worker-shell/container backends. It is not installed; verify current preview status before any implementation. Sandbox remains the default. celld is not a target because Workers compatibility does not supply managed Sandbox/Containers bindings.

## Troubleshooting and costs

Start with [troubleshooting](docs/src/content/docs/troubleshooting.md). Static builds do not require cloud credentials. Live container execution does. A 503 provider callback is intentional until the egress integration is complete.

Cost surfaces include Workers, Workers AI planning inference, Durable Objects, Containers, AI Gateway/provider inference, and GitHub API quotas. No prices, free-tier suitability, or provisioning time guarantees are invented. Review current limits before deployment.

## Official sources

- [Cloudflare Agents](https://developers.cloudflare.com/agents/)
- [Sandbox](https://developers.cloudflare.com/sandbox/)
- [Containers](https://developers.cloudflare.com/containers/)
- [AI Gateway](https://developers.cloudflare.com/ai-gateway/)
- [Access](https://developers.cloudflare.com/cloudflare-one/access-controls/)
- [Computer package](https://www.npmjs.com/package/@cloudflare/computer)
- [Astro](https://docs.astro.build/)
- [Starlight](https://starlight.astro.build/)

## License

MIT. See LICENSE.
