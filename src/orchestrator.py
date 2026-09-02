"""Anant Intern — Orchestrator (7-phase workflow)."""

import os
import subprocess
import tempfile
import shutil
from pathlib import Path
from datetime import datetime
from typing import Optional

from .context import gather_context
from .gist import create_gist
from .agent import AgentRouter
from .metrics import MetricsStore


class Orchestrator:
    """Main workflow orchestrator for Anant Intern."""

    def __init__(self):
        self.metrics = MetricsStore()
        self.agent_router = AgentRouter()
        self.workspace = Path(os.getenv("WORKING_DIR", "./workspace"))
        self.workspace.mkdir(exist_ok=True)

    async def handle_invocation(self, ticket_id: str, channel_id: str, source: str = "api"):
        invocation_id = f"{ticket_id}-{datetime.now().strftime('%Y%m%d%H%M%S')}"

        try:
            context = await gather_context(ticket_id, source)
            
            if not context.get("repo"):
                return {"status": "error", "message": "No repo specified"}

            plan = await self._create_plan(context)
            gist_url = create_gist(f"Plan for {ticket_id}", {"plan.md": {"content": plan}})
            
            self.metrics.create_invocation(invocation_id, ticket_id, channel_id, gist_url, context)
            
            return {
                "status": "awaiting_approval",
                "invocation_id": invocation_id,
                "plan": plan,
                "gist_url": gist_url,
            }
        except Exception as e:
            return {"status": "error", "message": str(e)}

    async def handle_approval(self, invocation_id: str, approved: bool, feedback: Optional[str]):
        invocation = self.metrics.get_invocation(invocation_id)
        if not invocation:
            return {"status": "error", "message": "Invocation not found"}

        if not approved:
            self.metrics.update_status(invocation_id, "rejected")
            return {"status": "rejected"}

        self.metrics.update_status(invocation_id, "executing")

        try:
            result = await self._execute(invocation)
            verification = await self._verify(invocation, result)
            pr_url = await self._create_pr(invocation, result, verification)
            
            self.metrics.update_status(invocation_id, "completed")
            self.metrics.record_completion(invocation_id, verification.get("passed", False))
            
            return {
                "status": "completed",
                "pr_url": pr_url,
                "verification": verification,
            }
        except Exception as e:
            self.metrics.update_status(invocation_id, "error")
            return {"status": "error", "message": str(e)}

    async def _create_plan(self, context: dict) -> str:
        agent = self.agent_router.get_agent_for_task(context)
        return await agent.run(self._build_plan_prompt(context), mode="plan")

    async def _execute(self, invocation: dict) -> dict:
        context = invocation["context"]
        repo = context["repo"]
        worktree_path = self.workspace / invocation["invocation_id"]
        
        subprocess.run(
            ["git", "worktree", "add", str(worktree_path), "-b", f"anant/{invocation['invocation_id']}"],
            cwd=self._get_repo_path(repo), check=True)

        agent = self.agent_router.get_agent_for_task(context)
        result = await agent.run(self._build_execution_prompt(invocation), mode="execute", cwd=worktree_path)
        return {"worktree": worktree_path, "output": result}

    async def _verify(self, invocation: dict, result: dict) -> dict:
        worktree = result["worktree"]
        test_result = subprocess.run(["npm", "test"], cwd=worktree, capture_output=True, text=True, timeout=120)
        lint_result = subprocess.run(["npm", "run", "lint"], cwd=worktree, capture_output=True, text=True, timeout=60)
        return {
            "passed": test_result.returncode == 0 and lint_result.returncode == 0,
            "test_output": test_result.stdout[-500:],
            "lint_output": lint_result.stdout[-500:],
        }

    async def _create_pr(self, invocation: dict, result: dict, verification: dict) -> str:
        worktree = result["worktree"]
        context = invocation["context"]
        subprocess.run(["git", "push", "origin", f"anant/{invocation['invocation_id']}"], cwd=worktree, check=True)
        pr_body = self._build_pr_body(invocation, verification)
        pr_result = subprocess.run(
            ["gh", "pr", "create", "--title", f"[AI Intern] {context.get('summary', invocation['ticket_id'])}",
             "--body", pr_body, "--head", f"anant/{invocation['invocation_id']}", "--base", context.get("base_branch", "main")],
            cwd=worktree, capture_output=True, text=True, check=True)
        return pr_result.stdout.strip()

    def _build_plan_prompt(self, context: dict) -> str:
        return f"You are AI intern.\nTask: {context.get('summary')}\nDesc: {context.get('description')}\nFiles: {context.get('file_list')}\n\nOutput a plan."

    def _build_execution_prompt(self, invocation: dict) -> str:
        return f"Execute:\n{invocation.get('plan')}\n\nCommit your changes."

    def _build_pr_body(self, invocation: dict, verification: dict) -> str:
        return f"## Summary\n{invocation['context'].get('summary', '')}\n\n## Plan\n{invocation.get('plan', '')[:500]}\n\n## Tests\n{'✅' if verification.get('passed') else '❌'}\n\n🤖 AI Intern"

    def _get_repo_path(self, repo: str) -> Path:
        repo_path = self.workspace / "repos" / repo.replace("/", "_")
        if not repo_path.exists():
            repo_path.parent.mkdir(parents=True, exist_ok=True)
            subprocess.run(["git", "clone", f"https://github.com/{repo}.git", str(repo_path)], check=True)
        return repo_path
