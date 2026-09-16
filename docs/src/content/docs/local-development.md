---
title: Local development
description: UI, docs, tests, and the distinction between local builds and live integration.
---

Use Node.js **22.12.0 or newer** and npm **9.6.5 or newer** (the installed Astro engine requirement). Install the locked dependencies with `npm ci`.

## Dashboard only

```sh
npm run dev
```

Vite serves the dashboard at `http://localhost:5173`. It does not start the Worker and has no API/WebSocket proxy configured. Connection and run-fetch errors are expected in this UI-only mode. This is not a working local coding backend.

## Worker and built assets

```sh
cp .dev.vars.example .dev.vars
npm run build
npx wrangler dev
```

Use the URL printed by Wrangler (normally port 8787). A compatible local Docker engine is required by the container configuration; startup itself may fail without it. Cloudflare bindings and model calls can also require account configuration and network access.

The sandbox must reach `WORKER_ORIGIN`; localhost inside a container is not your host's Worker. The provider callback/authentication integration is unresolved—see [Readiness](/docs/readiness/). Do not expose an unauthenticated tunnel to work around it. Unit tests use fakes and need no container or cloud account.

## Documentation

```sh
npm run docs:dev       # http://localhost:4321/docs/
npm run docs:check
npm run docs:build
npm run docs:preview   # built site; Pagefind search is available here
```

`docs:build` writes `docs/dist`. `npm run build` first builds the dashboard into `public`, then builds and copies docs into `public/docs`, then checks local links, anchors, and search artifacts. This order prevents Vite from deleting the documentation output.

## Verification

```sh
npm run typecheck
npm run lint
npm test
npm run docs:check
npm run build
npx wrangler deploy --dry-run
```

Do not claim real model execution, browser interactions, or deployment success from a static build or mocked unit tests.
