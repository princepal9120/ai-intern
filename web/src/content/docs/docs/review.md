---
title: Reviews
description: Learn how AI Intern's review agent checks pull request diffs and posts structured findings as inline GitHub comments.
---

AI Intern reviews pull requests with a dedicated review agent. It reads the diff in an isolated Cloudflare Sandbox checkout of your repository at the PR's exact head, runs test and lint suites, and posts findings as inline GitHub comments. Every finding is also recorded in the dashboard and relayed to responsible agent threads.

---

## Findings

Each finding names a failure scenario and carries a category, a severity, a confidence level, and an exact file and line number.

| Category | What it covers |
| :--- | :--- |
| **Bug** | Logic errors, incorrect behavior, crashes, unhandled edge cases |
| **Risk** | Security vulnerabilities, race conditions, secret leaks, data loss |
| **Maintainability** | Code clarity, naming conventions, missing types, documentation gaps |
| **Refactor** | Architectural improvements, code duplication, pattern violations |

<br />

| Severity | Meaning |
| :--- | :--- |
| **High** | Critical correctness, security vulnerabilities, or data loss defects |
| **Medium** | Important maintainability concerns, regressions, or missed validations |
| **Low** | Code style, minor optimizations, and non-blocking improvements |

**Confirmed** means the diff plus executed sandbox tests prove the defect. **Investigate** means a concrete risk with a verification target for human review.

A review can also leave **notes**: anchored observations that name no failure, such as verifying that an unusual pattern is intentional and safe.

---

## Starting a review

You can trigger pull request reviews in four ways:

1. **Automatically via GitHub Webhooks.** When a pull request is opened or updated with new commits (`pull_request:opened`, `pull_request:synchronize`), Cloudflare Worker's `/api/github/webhook` endpoint triggers a review round.
2. **Manually from the Dashboard.** Open any run or pull request in the AI Intern dashboard (`/app/`) and click **Start Review**.
3. **From a GitHub PR comment.** Mention the agent in any comment on the pull request:
   ```markdown
   @ai-intern review
   ```
   Trailing text provides focused instructions for the review round:
   ```markdown
   @ai-intern review focus on database query performance and auth checks
   ```
4. **From the API.** Send a `POST` request to start a review round for a repository and pull request:
   ```bash
   curl -X POST https://ai-intern.your-subdomain.workers.dev/api/runs \
     -H "Content-Type: application/json" \
     -H "CF-Access-Authenticated-User-Email: user@company.com" \
     -d '{
       "task": "Review pull request #42 for security flaws and test coverage",
       "repoUrl": "https://github.com/org/web-app",
       "baseBranch": "main"
     }'
   ```

A push while a review is running cancels the obsolete analysis and starts a fresh round against the new commit head.

When a review runs on a PR that AI Intern itself opened, the agent receives the verdict, triages the findings, and can automatically push fixes before notifying you.

---

## What posts to GitHub

Findings at or above the repository's configured posting threshold post as inline GitHub review comments directly on the pull request diff:

```markdown
### ⚠️ Potential race condition in token refresh

In `src/auth.ts:84`, concurrent refresh requests within the expiration window
can issue multiple renewal tokens simultaneously.

```suggestion
  const token = await lock.acquire(userId, () => refreshToken(session));
```
```

Re-reviews do not flag the same issue twice. When a finding is marked **resolved** or **irrelevant**, AI Intern resolves the corresponding GitHub conversation thread automatically.

---

## Triage

Each finding has a triage status tracked in Durable Object storage:

| Status | Meaning |
| :--- | :--- |
| **Open** | Active issue that needs developer attention |
| **Resolved** | The issue has been fixed in a subsequent commit |
| **Irrelevant** | False positive or intentionally accepted behavior |

When an AI Intern thread owns the pull request, it triages after each review: it marks false positives **irrelevant**, confirms fixed issues as **resolved**, and fixes high-severity issues before reporting the PR ready. You can override any triage decision from the dashboard at any time.

---

## Re-reviews

Re-reviews are incremental: only code changed since the last reviewed head is analyzed in detail, with the complete PR diff retained as surrounding context.

- Open findings carry forward across commit pushes.
- The review agent marks findings as **resolved** once it verifies in the Sandbox container that the issue is gone.
- Findings marked **irrelevant** by a reviewer are never re-flagged.
- A **resolved** finding whose fix regressed comes back as a fresh finding.

---

## Steering reviews

The review agent reads your repository's `.github/AGENTS.md` or `AGENTS.md` file and enforces your team's conventions as first-class findings:

```markdown
## Reviews

- Snapshot ID changes are expected in this repo; do not flag them
- Always check for SQL injection or unsafe raw queries in D1 / SQLite models
- Flag any direct database queries outside the repository layer
- Require unit tests for every new route added in `src/routes/`
```

Instructions in `AGENTS.md` take effect on the very next review round without requiring any changes to the Worker configuration.
