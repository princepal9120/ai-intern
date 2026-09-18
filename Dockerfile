# Pinned to the @cloudflare/sandbox npm version in package.json (0.12.9).
# The "-opencode" variant ships the sandbox container server plus git,
# node, and miscellaneous dev tools. Harness CLIs are pinned on top so the
# exact versions are deterministic regardless of what the base image baked in.
FROM docker.io/cloudflare/sandbox:0.12.9-opencode

# One image carries every harness (opencode, Claude Code, Codex); a run picks
# one at exec time. The credential invariant is unchanged: each gets the dummy
# key, and the real credential is swapped in at the Worker's egress boundary.
# Bumping any of these versions requires re-running the T10 live acceptance
# checklist — the harness event parsers couple to the JSON stream formats.
RUN npm i -g opencode-ai@1.18.31 @anthropic-ai/claude-code@2.1.277 @openai/codex@0.155.0 \
  && opencode --version && claude --version && codex --version

EXPOSE 4096
