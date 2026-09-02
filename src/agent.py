"""Anant Intern — Multi-agent coding agent router."""

import os
import subprocess
import shutil
from typing import Optional
from pathlib import Path


class AgentRouter:
    """Routes tasks to the appropriate coding agent."""
    
    AGENTS = {
        "claude-code": {
            "cmd": "claude",
            "args": ["--print", "--dangerously-skip-permissions"],
            "env_key": "ANTHROPIC_API_KEY",
        },
        "codex": {
            "cmd": "codex",
            "args": ["exec", "--full-auto"],
            "env_key": "OPENAI_API_KEY",
        },
        "cursor": {
            "cmd": "cursor-agent",
            "args": ["--prompt"],
            "env_key": "CURSOR_API_KEY",
        },
        "opencode": {
            "cmd": "opencode",
            "args": ["run"],
            "env_key": "OPENCODE_API_KEY",
        },
        "grok": {
            "cmd": "grok-agent",
            "args": ["--prompt"],
            "env_key": "XAI_API_KEY",
        },
        "aider": {
            "cmd": "aider",
            "args": ["--message"],
            "env_key": "ANTHROPIC_API_KEY",
        },
        "ollama": {
            "cmd": "ollama",
            "args": ["run"],
            "env_key": None,
        },
    }

    def __init__(self):
        self.default_agent = os.getenv("DEFAULT_AGENT", "claude-code")
        self.routing_mode = os.getenv("AGENT_ROUTING", "smart")

    def get_agent_for_task(self, context: dict) -> "Agent":
        """Select the best agent for the task."""
        if self.routing_mode == "specific":
            agent_name = self.default_agent
        elif self.routing_mode == "cheapest":
            agent_name = self._cheapest_agent()
        elif self.routing_mode == "fastest":
            agent_name = self._fastest_agent()
        else:
            agent_name = self._smart_route(context)
        
        return Agent(agent_name, self.AGENTS[agent_name])

    def _smart_route(self, context: dict) -> str:
        """Route based on task characteristics."""
        summary = context.get("summary", "").lower()
        description = context.get("description", "").lower()
        text = f"{summary} {description}"
        
        # UI/frontend work → Cursor
        if any(kw in text for kw in ["ui", "css", "component", "frontend", "design", "figma"]):
            if self._is_agent_available("cursor"):
                return "cursor"
        
        # Quick/simple tasks → Aider (cheap)
        if any(kw in text for kw in ["typo", "fix", "small", "quick", "simple"]):
            if self._is_agent_available("aider"):
                return "aider"
        
        # Complex/architecture → Claude Code
        if any(kw in text for kw in ["refactor", "architecture", "complex", "multi-file", "design"]):
            if self._is_agent_available("claude-code"):
                return "claude-code"
        
        # Default
        return self.default_agent

    def _cheapest_agent(self) -> str:
        """Pick the cheapest available agent."""
        if self._is_agent_available("aider"):
            return "aider"
        if self._is_agent_available("opencode"):
            return "opencode"
        return self.default_agent

    def _fastest_agent(self) -> str:
        """Pick the fastest available agent."""
        if self._is_agent_available("codex"):
            return "codex"
        return self.default_agent

    def _is_agent_available(self, agent_name: str) -> bool:
        """Check if agent CLI is installed and configured."""
        if agent_name not in self.AGENTS:
            return False
        
        agent = self.AGENTS[agent_name]
        if not shutil.which(agent["cmd"]):
            return False
        
        env_key = agent.get("env_key")
        if env_key and not os.getenv(env_key):
            return False
        
        return True


class Agent:
    """Wrapper for a specific coding agent."""
    
    def __init__(self, name: str, config: dict):
        self.name = name
        self.config = config

    async def run(self, prompt: str, mode: str = "plan", cwd: Optional[Path] = None) -> str:
        """Run the agent with a prompt."""
        cmd = [self.config["cmd"]] + self.config["args"]
        
        if mode == "plan":
            if self.name == "claude-code":
                cmd.extend(["--permission-mode", "plan"])
        elif mode == "execute":
            pass
        
        cmd.append(prompt)
        
        result = subprocess.run(
            cmd,
            cwd=cwd,
            capture_output=True,
            text=True,
            timeout=600,
        )
        
        if result.returncode != 0:
            raise RuntimeError(f"Agent {self.name} failed: {result.stderr}")
        
        return result.stdout
