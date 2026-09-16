---
title: Troubleshooting
description: Diagnose local builds and known integration limitations honestly.
---

| Symptom | Check or action |
| --- | --- |
| Node engine error | Use Node 22.12.0+ and npm 9.6.5+; run npm ci |
| Missing package export after partial install | Reinstall locked dependencies with npm ci; do not patch node_modules |
| Unknown docs script | Run from the repository root and inspect package.json |
| Docs search absent in dev | Build and run npm run docs:preview; Pagefind is production-only |
| Docs 404 or stale output | Run the combined npm run build; Vite alone clears public/docs |
| Vite dashboard cannot connect | Vite has no Worker API/WebSocket proxy; this is UI-only mode |
| Wrangler/container startup fails | Check the actual error and local container engine; static build success is unrelated |
| WORKER_ORIGIN is not configured | Current orchestrator requires it, but setting it cannot resolve the disabled callback |
| Provider callback 503 | Intentionally disabled until authenticated Sandbox egress integration is implemented |
| Provider helper 403 | Its host/model/path allowlist rejected the request; do not weaken it |
| Provider helper 502 | Check account AI binding, gateway setup, supported model, and upstream failure |
| Publish requires GITHUB_TOKEN | Configure the optional secret or leave publishing off |
| Private repository clone fails | Private clone credentials are not wired; use a public test repository |
| Already running 3 coding tasks | Wait or request cancellation; verify actual shutdown |
| Completed badge with error text | Known parent result-classification gap; inspect transcript |
| PR missing deletions or file modes | Publisher is content-based, not a complete Git patch transport |

Do not send secrets in bug reports. Include command, dependency versions, bounded redacted error output, expected/actual behavior, and whether the failure is a local build, mocked test, or live integration. Never report a failed dry run as a successful deployment.

See [Readiness](/docs/readiness/) for remaining work and the account-owned acceptance procedure.

