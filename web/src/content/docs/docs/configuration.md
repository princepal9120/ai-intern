---
title: Configuration
description: Current runtime variables, optional secrets, and model boundaries.
---

Non-secret defaults live in wrangler.jsonc. Local overrides and secrets may be placed in the ignored .dev.vars file. Production secrets are set through Wrangler; .dev.vars is not uploaded as production configuration.

| Setting | Default | Purpose |
| --- | --- | --- |
| GATEWAY_ID | default | Account-owned AI Gateway selected by the AI binding |
| ORCHESTRATOR_MODEL | @cf/meta/llama-3.1-8b-instruct | Parent planning via Workers AI |
| CODING_MODEL | google/gemini-2.0-flash | OpenCode model; only google/* accepted |
| RUNTIME | sandbox | Default adapter; computer refuses execution |
| WORKER_ORIGIN | unset | Still required by the orchestrator to construct its callback URL |

**The public provider callback is disabled and returns 503.** Setting WORKER_ORIGIN does not make live coding work. The binding-based helper in src/provider-gateway.ts is not yet connected to Sandbox egress. CF_ACCOUNT_ID and AI_GATEWAY_TOKEN remain legacy optional fields but are not consumed by that helper.

Select a currently available model in your account. The checked-in default is not an availability guarantee. The assistant model used to edit this repository is independent of these application settings; an anonymous model name is not a usable endpoint.

## Optional secrets

| Name | Purpose |
| --- | --- |
| GITHUB_TOKEN | Worker-side PR publishing, not private clone access |
| GITHUB_WEBHOOK_SECRET | HMAC verification for acknowledgment-only webhooks |

~~~sh
cp .dev.vars.example .dev.vars
# Edit locally; never commit secrets.
~~~

After resolving [readiness blockers](/docs/readiness/), production operators may configure:

~~~sh
npx wrangler secret put GITHUB_TOKEN
npx wrangler secret put GITHUB_WEBHOOK_SECRET
~~~

These commands modify your Cloudflare account. They are not local validation steps. Keep actual provider keys in the supported gateway credential store, never in container configuration. See [Deployment](/docs/deployment/#ai-gateway-setup).

