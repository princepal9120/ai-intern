"""Anant Intern — Context gathering from Jira, Slack, GitHub."""

import os
import re
from typing import Optional


async def gather_context(ticket_id: str, source: str = "api") -> dict:
    """Gather context for a ticket."""
    context = {"ticket_id": ticket_id, "source": source}
    
    jira_context = _fetch_jira_context(ticket_id)
    if jira_context:
        context.update(jira_context)
    
    if not context.get("repo"):
        context["repo"] = _extract_repo(context)
    
    if context.get("repo"):
        context.update(_extract_relevant_files(context))
    
    return context


def _fetch_jira_context(ticket_id: str) -> Optional[dict]:
    """Fetch ticket from Jira."""
    jira_url = os.getenv("JIRA_URL")
    jira_email = os.getenv("JIRA_EMAIL")
    jira_token = os.getenv("JIRA_API_TOKEN")
    
    if not all([jira_url, jira_email, jira_token]):
        return None
    
    try:
        from jira import JIRA
        client = JIRA(server=jira_url, basic_auth=(jira_email, jira_token))
        issue = client.issue(ticket_id)
        return {
            "summary": issue.fields.summary,
            "description": issue.fields.description or "",
            "status": issue.fields.status.name,
        }
    except Exception:
        return None


def _extract_repo(context: dict) -> Optional[str]:
    """Extract repo from context."""
    text = f"{context.get('summary', '')} {context.get('description', '')}"
    match = re.search(r'repo:([a-zA-Z0-9_-]+/[a-zA-Z0-9_-]+)', text)
    if match:
        return match.group(1)
    match = re.search(r'github\.com/([a-zA-Z0-9_-]+/[a-zA-Z0-9_-]+)', text)
    if match:
        return match.group(1)
    return os.getenv("DEFAULT_REPO")


def _extract_relevant_files(context: dict) -> dict:
    """Extract relevant files from context."""
    text = f"{context.get('summary', '')} {context.get('description', '')}"
    file_patterns = re.findall(r'[\w/]+\.(ts|tsx|js|jsx|py|go|java|rs|rb)', text)
    return {
        "relevant_files": len(file_patterns),
        "file_list": "\n".join(f"- {f}" for f in file_patterns[:10]),
        "base_branch": os.getenv("DEFAULT_BASE_BRANCH", "main"),
    }
