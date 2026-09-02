# Anant Intern — AI Intern Platform

> Slack/Jira → Plan → Execute → Verify → PR. Multi-agent. Approval-gated. Plug and play.

An open-source AI intern that lives in your Slack workspace. Tag it like a colleague, assign it Jira tickets, and it plans, codes, tests, and opens PRs — with full approval gates and metrics.

## Quick Start (3 commands)

```bash
git clone https://github.com/princepal9120/prinslabs.git
cd prinslabs
docker compose up -d
```

Then open http://localhost:3000 and follow the setup wizard.

## Features

- **Slack-native:** `@anant-intern PROJ-123` starts work
- **Multi-agent:** Claude Code, Codex, Cursor, OpenCode, Grok, Ollama (local) — one config to switch
- **Approval-gated:** Proposes plan → you approve → executes
- **Evidence-backed:** Every PR includes plan, diff, test output
- **Multi-tracker:** Jira, Linear, GitHub Issues
- **Web dashboard:** Track metrics, manage repos, configure agents
- **Local LLM support:** Run with Ollama for $0 cost (no API keys needed)
- **Team-ready:** Multiple users, per-repo configuration, audit logs

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        AI INTERN PLATFORM                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ┌──────────┐    ┌──────────┐    ┌──────────┐                 │
│   │  Slack   │    │  Web UI  │    │   Jira   │                 │
│   │   Bot    │    │Dashboard │    │ Webhook  │                 │
│   └────┬─────┘    └────┬─────┘    └────┬─────┘                 │
│        │               │               │                        │
│        └───────────────┼───────────────┘                        │
│                        │                                        │
│                 ┌──────▼──────┐                                 │
│                 │  API Server │                                 │
│                 │   (FastAPI) │                                 │
│                 └──────┬──────┘                                 │
│                        │                                        │
│            ┌───────────┼───────────┐                            │
│            │           │           │                            │
│     ┌──────▼──┐  ┌────▼───┐  ┌────▼────┐                      │
│     │  Queue  │  │ Worker │  │ Metrics │                      │
│     │ (Redis) │  │(Agent) │  │(Postgres│                      │
│     └─────────┘  └────────┘  └─────────┘                      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Agent Support

| Agent | Best For | Cost | Setup |
|-------|----------|------|-------|
| **Claude Code** | Complex tasks | $$$ | API key |
| **Codex** | Medium features | $$ | API key |
| **Cursor** | UI work | $$ | API key |
| **OpenCode** | Cheap, multi-model | $ | API key |
| **Ollama** | Local, private | $0 | Docker auto-setup |

## Configuration

All via web UI — no code changes needed:

1. Connect Slack workspace
2. Connect Jira project
3. Select agent(s)
4. Add repos
5. Start assigning tickets

## License

MIT
