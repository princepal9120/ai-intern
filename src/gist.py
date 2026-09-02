"""Anant Intern — GitHub Gist creation."""

import os
import subprocess
import tempfile


def create_gist(description: str, files: dict) -> str:
    """Create a GitHub Gist."""
    cmd = ["gh", "gist", "create", "--description", description]
    
    for filename, content_dict in files.items():
        cmd.extend(["--filename", filename])
        with tempfile.NamedTemporaryFile(mode='w', suffix=f'-{filename}', delete=False) as f:
            f.write(content_dict["content"])
            cmd.append(f.name)
    
    result = subprocess.run(cmd, capture_output=True, text=True, check=True)
    url = result.stdout.strip()
    
    for arg in cmd[6:]:
        if arg.startswith('/tmp'):
            try:
                os.unlink(arg)
            except Exception:
                pass
    
    return url
