---
title: Readiness and acceptance checklist
description: Known gaps and evidence required before production use.
---

## Status

The static documentation/dashboard build and mocked tests do not establish that a deployed coding task works end to end. This is a prototype. Do not expose it publicly or call it production-ready. spec/GOAL.md contains targets beyond the current implementation.

## Remaining blockers

- **Provider integration:** the public callback returns 503 deliberately. The internal Google helper now uses the AI Gateway binding, but Sandbox egress interception is not wired to it. Live coding is unavailable through the present callback path. WORKER_ORIGIN remains required by the orchestrator; CF_ACCOUNT_ID and AI_GATEWAY_TOKEN are legacy fields, not used by the helper.
- **Authorization:** direct SDK child routes are not gated by the retained registry. Authentication must cover every reachable hostname and service path before exposure.
- **Private cloning:** the GitHub token is used for publishing, not clone transport.
- **Result fidelity:** the parent treats string child output as completed without parsing the structured result. Inspect transcripts rather than trusting the badge.
- **Publication fidelity:** capture limits, deleted files, renames, modes, and binary/large-file round trips are not fully supported. Publishing is not a complete Git patch transport.
- **Streaming:** phase events exist; per-event OpenCode JSON streaming is not implemented.
- **Lifecycle:** cancellation is best-effort; registry clear is not complete data erasure or container shutdown.

## Local acceptance

~~~sh
pnpm install
pnpm typecheck
pnpm lint
pnpm test
pnpm docs:check
pnpm build
pnpm docs:verify
npx wrangler deploy --dry-run
~~~

Record actual failures, including missing container runtime/image support. Do not replace a dry run with a real deployment to get a green result. Review package audit findings separately; do not force dependency upgrades without compatibility review.

## Account-owned integration acceptance (not executed by these docs)

After implementing the missing boundaries, use an isolated test installation and a repository you own:

1. Verify unauthorized browser, run API, child-agent, and service requests are denied. Verify authorized browser WebSockets and server-side provider requests work.
2. Submit a harmless README task without publishing; verify no container starts before approval. Reject it and verify no work occurs.
3. Submit again, compare exact proposed input, approve, and observe clone/configure/code/collect phases.
4. Compare actual changes to the transcript, including new files, diff, exit status, truncation, and redaction.
5. Verify no-change and controlled failure tasks are reported honestly.
6. Cancel during execution, verify the process stops, and confirm late output cannot revive a cancelled record.
7. Exercise the three-run limit, reconnect, retained history, and clear-history partial failures.
8. On a dedicated test repository, explicitly approve publishing and verify the intended branch and PR; do not use production repositories for this test.
9. Check keyboard operation, narrow/desktop layouts, docs navigation/search, and missing-path 404 behavior.

Record date, revisions, versions, environment, results, and unresolved failures. Mocked tests alone are insufficient to mark the product complete.


