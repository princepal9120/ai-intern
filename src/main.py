"""Anant Intern — FastAPI main application."""

import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional, List

from .setup import run_setup_wizard, SetupConfig
from .orchestrator import Orchestrator


app = FastAPI(title="Anant Intern", version="0.1.0")

# CORS for dashboard
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize orchestrator
orchestrator = Orchestrator()


class SetupRequest(BaseModel):
    """Setup wizard request."""
    slack_bot_token: Optional[str] = None
    slack_signing_secret: Optional[str] = None
    slack_app_token: Optional[str] = None
    github_token: Optional[str] = None
    jira_url: Optional[str] = None
    jira_email: Optional[str] = None
    jira_api_token: Optional[str] = None
    jira_project_key: Optional[str] = None
    default_agent: str = "claude-code"
    agent_routing: str = "smart"
    anthropic_api_key: Optional[str] = None
    openai_api_key: Optional[str] = None
    xai_api_key: Optional[str] = None
    use_local_llm: bool = False
    ollama_model: str = "qwen2.5-coder:7b"
    repos: Optional[str] = None


class InvokeRequest(BaseModel):
    """Invocation request."""
    ticket_id: str
    channel_id: Optional[str] = None
    source: str = "api"


class ApprovalRequest(BaseModel):
    """Approval request."""
    invocation_id: str
    approved: bool
    feedback: Optional[str] = None


@app.get("/")
async def root():
    return {"status": "ok", "service": "Anant Intern", "version": "0.1.0"}


@app.get("/health")
async def health():
    return {"status": "healthy"}


@app.post("/setup")
async def setup(req: SetupRequest):
    """Run setup wizard."""
    config = SetupConfig(**req.dict())
    result = run_setup_wizard(config)
    return result


@app.get("/agents")
async def list_agents():
    """List available agents."""
    from .agent import AgentRouter
    router = AgentRouter()
    
    agents = []
    for name, config in AgentRouter.AGENTS.items():
        available = router._is_agent_available(name)
        agents.append({
            "name": name,
            "available": available,
            "command": config["cmd"],
        })
    
    return {"agents": agents}


@app.post("/invoke")
async def invoke(req: InvokeRequest):
    """Invoke the AI intern for a ticket."""
    result = await orchestrator.handle_invocation(
        ticket_id=req.ticket_id,
        channel_id=req.channel_id,
        source=req.source,
    )
    return result


@app.post("/approve")
async def approve(req: ApprovalRequest):
    """Approve or reject an invocation."""
    result = await orchestrator.handle_approval(
        invocation_id=req.invocation_id,
        approved=req.approved,
        feedback=req.feedback,
    )
    return result


@app.get("/stats")
async def stats():
    """Get metrics."""
    return orchestrator.metrics.get_stats()


@app.get("/invocations")
async def list_invocations():
    """List recent invocations."""
    return orchestrator.metrics.get_leaderboard()


@app.get("/config")
async def get_config():
    """Get current configuration (secrets masked)."""
    return {
        "slack_configured": bool(os.getenv("SLACK_BOT_TOKEN")),
        "github_configured": bool(os.getenv("GITHUB_TOKEN")),
        "jira_configured": bool(os.getenv("JIRA_URL")),
        "default_agent": os.getenv("DEFAULT_AGENT", "claude-code"),
        "agent_routing": os.getenv("AGENT_ROUTING", "smart"),
        "local_llm": os.getenv("USE_LOCAL_LLM", "false"),
    }


# Serve dashboard static files
dashboard_dir = os.path.join(os.path.dirname(__file__), "..", "dashboard", "out")
if os.path.exists(dashboard_dir):
    app.mount("/dashboard", StaticFiles(directory=dashboard_dir, html=True), name="dashboard")
