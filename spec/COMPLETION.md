# AI Intern Swarm Contract

## Project
Self-hosted Cloudflare coding agent platform. Users run agents on their OWN Cloudflare subscription (Workers $5/mo + AI Gateway per-token + Sandbox ~$2.50/hr) instead of paying $20-50/mo per-seat SaaS fees.

Location: /Users/princepal/oss/ai-intern
Full plan: /Users/princepal/oss/ai-intern/PLAN.md

## Bootstrap
- Node.js 22.12.0+, pnpm 10.0.0+
- Docker CLI required for Wrangler container image packaging
- Git repo at /Users/princepal/oss/ai-intern
- Test: `npx vitest run` (from project root)
- Typecheck: `pnpm typecheck`
- Lint: `pnpm lint`
- Build: `pnpm build`
- Deploy dry-run: `npx wrangler deploy --dry-run`

## Hard Rules
1. Write failing test FIRST, run to verify FAIL, then implement, then verify PASS
2. Do NOT modify wrangler.jsonc, package.json, or Dockerfile
3. Do NOT run `npx wrangler deploy` — only `--dry-run`
4. If a task fails twice, stop and report in `.build/status/completeN.done` with error
5. Commit after each task with conventional commits
6. Each agent owns ONLY its assigned files. Never touch other agents' files.
7. After finishing, write `.build/status/completeN.done` with a summary

## File Ownership (EXCLUSIVE — do not touch files owned by other agents)

### Agent 1 — Provider Route (CRITICAL)
- Owns: `src/index.ts` (lines 28-38 only), `test/provider-gateway.test.ts`
- Task: Wire provider route, replace 503 with forwardProviderRequest
- Test: `npx vitest run test/provider-gateway.test.ts`

### Agent 2 — Provider Tests
- Owns: `test/provider-gateway.test.ts`
- Task: Add integration tests for successful forwarding (200) and rejected paths (403)
- Test: `npx vitest run test/provider-gateway.test.ts`

### Agent 3 — Deletion PR
- Owns: `src/github.ts` (tree creation section), `test/github.test.ts`
- Task: Handle file deletions (sha: null) in GitHub tree
- Test: `npx vitest run test/github.test.ts -t "creates tree with null sha"`

### Agent 4 — Rename PR
- Owns: `src/opencode-input.ts`, `src/github.ts`, `test/github.test.ts`
- Task: Add renames field, process rename entries as delete+create
- Test: `npx vitest run test/github.test.ts -t "publishes rename"`

### Agent 5 — Task Form
- Owns: `web/src/components/TaskForm.tsx`, `web/src/App.tsx`
- Task: Task submission form with repo URL, task, branch, publish PR checkbox
- Test: `npx vitest run test/dashboard.test.ts -t "renders task submission form"`

### Agent 6 — Diff Viewer
- Owns: `web/src/components/DiffViewer.tsx`, `web/src/App.tsx`
- Task: Syntax-highlighted unified diff viewer
- Test: `npx vitest run test/dashboard.test.ts -t "renders diff output"`

### Agent 7 — Slack Adapter
- Owns: `src/slack.ts`, `test/slack.test.ts`
- Task: Slack HMAC-SHA256 signature verification with 5-min replay protection
- Test: `npx vitest run test/slack.test.ts -t "verifies valid Slack signature"`

### Agent 8 — Slack Routes
- Owns: `src/slack-routes.ts`, `src/index.ts` (add handleSlackCommand route), `test/slack.test.ts`
- Task: Wire /api/slack/command to orchestrator
- Test: `npx vitest run test/slack.test.ts -t "routes slash command"`

### Agent 9 — Multi-Tenancy
- Owns: `src/index.ts` (handleRuns function), `test/runtime.test.ts`
- Task: Per-user orchestrator DO scoping via CF-Access-Authenticated-User-Email header
- Test: `npx vitest run test/runtime.test.ts -t "routes requests to per-user orchestrator"`

### Agent 10 — Deploy Docs + Cost
- Owns: `README.md`, `src/costs.ts`, `test/costs.test.ts`
- Task: Deploy button, prerequisites, cost estimation
- Test: `npx vitest run test/costs.test.ts`

## Acceptance Criteria
- [ ] Provider callback returns 200 (not 503)
- [ ] File deletions produce correct PRs
- [ ] File renames produce correct PRs
- [ ] Dashboard has task submission form
- [ ] Dashboard shows diff viewer
- [ ] Slack /ai-intern command queues tasks
- [ ] Per-user orchestrator isolation works
- [ ] README has deploy button
- [ ] Cost estimation calculated
- [ ] All tests pass, typecheck clean, build succeeds

## Dependencies
- Agent 1 MUST complete before Agents 3-10
- Agent 2 can run in parallel with Agent 1
- Agents 3-10 can all run in parallel after Agent 1 completes

