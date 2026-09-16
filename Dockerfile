// Pinned to the @cloudflare/sandbox npm version in package.json (0.12.9).
// The "-opencode" variant ships the sandbox container server plus git,
// node, and micellaneous dev tools. We pin opencode-ai on top so the exact
// CLI version is deterministic regardless of what the base image baked in.
FROM docker.io/cloudflare/sandbox:0.12.9-opencode

RUN npm i -g opencode-ai@1.18.31 \
  && opencode --version

EXPOSE 4096
