---
title: Configuration
description: Current runtime variables, optional secrets, and model boundaries.
---

Non-secret defaults live in wrangler.jsonc. Local overrides and secrets may be placed in the ignored .dev.vars file. Production secrets are set through Wrangler; .dev.vars is not uploaded as production configuration.

| Setting | Default | Purpose |
| --- | --- | --- |
| GATEWAY_ID | default | Account-owned AI Gateway selected by the AI binding |
| ORCHESTRATOR_MODEL | @cf/meta/llama-3.1-8b-instruct | Parent planning via Workers AI |
| CODING_MODEL | google/gemini-3.5-flash-lite | Coding model; validated against the selected harness |
| RUNTIME | sandbox | Default adapter; computer refuses execution |
| AGENT_HARNESS | opencode | opencode, claude-code, or codex |

Provider traffic is intercepted at Sandbox egress. There is no public `/api/provider` callback. Keep provider keys in AI Gateway BYOK; they never enter the container.

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

