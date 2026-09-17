---
title: Deployment
description: Account preparation and remaining rollout blockers.
---

## Readiness first

**Do not deploy this prototype publicly.** The public provider callback is intentionally disabled and authenticated Sandbox egress is not connected. Child-route authorization and result/publication fidelity also need work. Read [Security](/docs/security/) and [Readiness](/docs/readiness/) before exposing an installation.

Live operation requires a Cloudflare account with Workers, Durable Objects, Workers AI, and Containers/Sandbox access. Check current eligibility, quotas, and pricing in the [Containers](https://developers.cloudflare.com/containers/) and [Sandbox](https://developers.cloudflare.com/sandbox/) documentation. No provisioning time is guaranteed.

## AI Gateway setup

1. Create or select an account-owned AI Gateway. Its ID is GATEWAY_ID.
2. Review the [Google AI Studio provider guide](https://developers.cloudflare.com/ai-gateway/usage/providers/google-ai-studio/) and configure supported stored BYOK credentials or Unified Billing.
3. The current internal helper uses AI.gateway(GATEWAY_ID).run with the native Google endpoint and provider-native JSON. It does not use CF_ACCOUNT_ID or AI_GATEWAY_TOKEN. The Worker AI binding supplies account access.
4. Keep real provider credentials outside the container. OpenCode uses a dummy Google key.
5. Complete the missing Sandbox egress connection and validate a real request before claiming coding works. The older public callback returns 503 rather than exposing an unauthenticated credential proxy.

For direct HTTP integrations outside this code, authenticated gateways use cf-aig-authorization, not an interchangeable generic Authorization header. Consult [gateway authentication](https://developers.cloudflare.com/ai-gateway/configuration/authentication/) and [stored BYOK](https://developers.cloudflare.com/ai-gateway/configuration/bring-your-own-keys/). Do not copy obsolete token-proxy instructions into this implementation.

## Prepare locally

~~~sh
pnpm install
pnpm typecheck
pnpm lint
pnpm test
pnpm docs:check
pnpm build
npx wrangler deploy --dry-run
~~~

The dry run is packaging validation, not deployment. Record missing Docker, image, or runtime limitations honestly. Building the docs does not require live coding credentials.

## Deployment commands after blockers are resolved

~~~sh
npx wrangler login
# Configure optional GitHub secrets described in Configuration.
pnpm build
pnpm deploy
~~~

These commands change your Cloudflare account. pnpm deploy does not automatically build assets. Wrangler uses ./Dockerfile for the image and ./public for assets; the dashboard is at / and docs at /docs/. Static missing paths use 404-page rather than an SPA catch-all.

Protect every reachable hostname, including alternate workers.dev routes, with reviewed authentication. Browser login alone does not authenticate service callbacks. Never make a provider callback public to work around Access. Complete the [acceptance procedure](/docs/readiness/) in an isolated test installation before inviting users.

## Updates and recovery

Preserve the previous revision and lockfile. Re-run checks, review Durable Object migrations, and validate in a test installation. Code rollback does not automatically restore Durable Object data or undo GitHub branches/PRs. Avoid deleting runtime data as part of a routine docs update.


