---
title: API reference
description: Current routes, responses, and SDK approval transport.
---

All paths are relative to the Worker origin. The shared orchestrator name is default. These routes do not implement their own user authorization; protect the installation before exposure.

## Run registry

| Method | Path | Response |
| --- | --- | --- |
| GET | /api/runs | JSON object containing runs array |
| GET | /api/runs/:id | JSON object containing run; unknown ID returns 404 |
| DELETE | /api/runs/:id | Cancellation request; returns run, or 404 if unknown |
| DELETE | /api/runs | Clears registry; returns ok: true |

URL-encode the entire run ID, which can include colons. Records contain runId, sandboxId, repoUrl, task, baseBranch, publishPullRequest, status, createdAt, updatedAt, and optional summary/error. Timestamps are Unix milliseconds. Statuses: pending, running, completed, error, aborted, cancelled. Diffs/files belong to the transcript, not independent registry fields.

Cancellation updates state before best-effort destruction. Registry clearing does not stop work or erase child storage. Other methods return 405.

## Submit and approve

There is **no POST /api/runs** endpoint. The dashboard uses useAgent/useAgentChat with coding-orchestrator, name default, and SDK routes under /agents/.

The delegate_coding_task tool accepts:

~~~json
{
  "repoUrl": "https://github.com/owner/repository",
  "task": "Describe a bounded coding task",
  "baseBranch": "main",
  "publishPullRequest": false
}
~~~

The tool sets needsApproval: true. Decisions use addToolApprovalResponse({ id, approved }); delegated events use useAgentToolEvents. There are no custom approval WebSocket messages.

## Provider callback

/api/provider/google and its subpaths return **503**, with an explicit disabled-integration error. The binding-based helper is internal and is not connected to this public callback. It accepts only configured Google model POST operations, validates JSON, and uses AI.gateway(GATEWAY_ID).run. Its own rejection statuses are 403 (endpoint), 405 (method), 400 (body), and 502 (gateway error). Those helper tests do not prove a functioning public provider route.

## GitHub webhook

POST /api/github/webhook requires GITHUB_WEBHOOK_SECRET and valid x-hub-signature-256. Missing configuration returns 503, invalid signatures 401, and invalid JSON 400. Valid payloads return ok, event name, and optional action. This handler acknowledges events only; it does not create coding tasks.

Source: src/index.ts and src/agents/orchestrator.ts.

