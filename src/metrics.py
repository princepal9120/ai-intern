"""Anant Intern — SQLite metrics store."""

import sqlite3
import json
import os
from typing import Optional


class MetricsStore:
    """Store and query agent performance metrics."""
    
    def __init__(self, db_path: Optional[str] = None):
        if db_path is None:
            db_path = os.getenv("METRICS_DB", "./metrics.db")
        self.db_path = db_path
        self._init_db()
    
    def _init_db(self):
        with sqlite3.connect(self.db_path) as conn:
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS invocations (
                    id TEXT PRIMARY KEY,
                    ticket_id TEXT NOT NULL,
                    channel_id TEXT,
                    status TEXT DEFAULT 'pending',
                    plan_gist_url TEXT,
                    pr_url TEXT,
                    context TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    completed_at TIMESTAMP,
                    duration REAL,
                    cost REAL,
                    error TEXT
                );
                CREATE INDEX IF NOT EXISTS idx_invocations_status ON invocations(status);
            """)
    
    def create_invocation(self, invocation_id: str, ticket_id: str, channel_id: str, plan_gist_url: str, context: dict):
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                INSERT INTO invocations (id, ticket_id, channel_id, plan_gist_url, context, status)
                VALUES (?, ?, ?, ?, ?, 'awaiting_approval')
            """, (invocation_id, ticket_id, channel_id, plan_gist_url, json.dumps(context, default=str)))
    
    def get_invocation(self, invocation_id: str) -> Optional[dict]:
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            row = conn.execute("SELECT * FROM invocations WHERE id = ?", (invocation_id,)).fetchone()
            return dict(row) if row else None
    
    def update_status(self, invocation_id: str, status: str):
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("UPDATE invocations SET status = ? WHERE id = ?", (status, invocation_id))
    
    def record_completion(self, invocation_id: str, success: bool):
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                UPDATE invocations SET status = 'completed', completed_at = CURRENT_TIMESTAMP,
                duration = (julianday('now') - julianday(created_at)) * 86400 WHERE id = ?
            """, (invocation_id,))
    
    def get_stats(self) -> dict:
        with sqlite3.connect(self.db_path) as conn:
            total = conn.execute("SELECT COUNT(*) FROM invocations").fetchone()[0]
            by_status = {}
            for row in conn.execute("SELECT status, COUNT(*) FROM invocations GROUP BY status"):
                by_status[row[0]] = row[1]
            avg_duration = conn.execute("SELECT AVG(duration) FROM invocations WHERE status = 'completed'").fetchone()[0]
            prs = conn.execute("SELECT COUNT(*) FROM invocations WHERE pr_url IS NOT NULL").fetchone()[0]
            return {"total_invocations": total, "by_status": by_status, "avg_duration_seconds": avg_duration, "total_prs": prs}
    
    def get_leaderboard(self) -> list:
        with sqlite3.connect(self.db_path) as conn:
            rows = conn.execute("""
                SELECT ticket_id, status, duration, cost, created_at FROM invocations
                WHERE status = 'completed' ORDER BY created_at DESC LIMIT 50
            """).fetchall()
            return [{"ticket": r[0], "status": r[1], "duration": r[2], "cost": r[3], "created": r[4]} for r in rows]
