---
title: Security
description: Authentication, credential boundaries, and known limitations.
---

## Installation boundary

Each installation is single-tenant and account-owned. There is no built-in user authentication or multi-tenant isolation. Require Cloudflare Access or equivalent verified authentication before exposure. An obscure URL is not protection.

The Worker routes child agents through the SDK without consulting the retained registry. A run lookup returning 404 does not protect child routes. Approval is a workflow gate, not a substitute for route authorization.

The former public provider callback now **fails closed with HTTP 503** pending authenticated Sandbox egress integration. The internal binding-based helper is not yet connected to container egress. The dummy model key is not an authentication credential. Do not re-enable a public credential proxy just to make coding work.

Browser Access login would also block unauthenticated container callbacks. Prefer the planned server-side egress interception, or implement a reviewed authenticated service design. Do not exempt the provider path from authentication.

## Implemented safeguards and limits

- Repository URL validation requires HTTPS GitHub and rejects embedded credentials.
- Dynamic shell arguments use tested POSIX quoting helpers.
- The parent delegation tool requests human approval of structured input.
- GitHub publishing uses a Worker-side token; private clone authorization is not implemented.
- Several output paths use bounds and known-pattern redaction. This is not a guarantee against arbitrary secrets or binary data leaks. Never put secrets in tasks or repositories.
- Cancellation retains its terminal registry state against late completion; container destruction is best-effort.

## Retention and review

Users share the default orchestrator. Clearing history/registry does not erase all child Durable Object data or stop containers. Review retention and deletion requirements before using confidential repositories.

Treat generated code as untrusted. Review changes and run tests. Use least-privilege credentials restricted to test repositories. Publishing does not merge PRs, and current publication is not a lossless Git patch transport.

Sources: [Access](https://developers.cloudflare.com/cloudflare-one/access-controls/), [service tokens](https://developers.cloudflare.com/cloudflare-one/identity/service-tokens/), [Sandbox](https://developers.cloudflare.com/sandbox/), [AI Gateway](https://developers.cloudflare.com/ai-gateway/).

Local implementation: src/index.ts, src/security.ts, src/runtime.ts, src/agents/orchestrator.ts, and src/provider-gateway.ts. See [Readiness](/docs/readiness/).

