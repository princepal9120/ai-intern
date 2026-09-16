const PUBLIC = "github.com";

export class ConfigError extends Error {
  readonly code = "config_error";
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export class InputError extends Error {
  readonly code = "input_error";
  constructor(message: string) {
    super(message);
    this.name = "InputError";
  }
}

export interface GitHubRepo {
  owner: string;
  repo: string;
}

export function parseGitHubRepoUrl(raw: string): GitHubRepo {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 2048) {
    throw new InputError("Repository URL must be a non-empty string.");
  }
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new InputError("Repository URL is not a valid URL.");
  }
  if (url.protocol !== "https:") {
    throw new InputError("Repository URL must use HTTPS.");
  }
  if (url.hostname.toLowerCase() !== PUBLIC) {
    throw new InputError("Repository URL must point to github.com.");
  }
  if (url.username !== "" || url.password !== "") {
    throw new InputError("Repository URL must not embed credentials.");
  }
  const segments = url.pathname.replace(/\/+$/, "").split("/").filter(Boolean);
  if (segments.length !== 2) {
    throw new InputError("Repository URL must look like https://github.com/owner/repo.");
  }
  const namePattern = /^[A-Za-z0-9_.-]+$/;
  const owner = segments[0] as string;
  let repo = segments[1] as string;
  if (repo.toLowerCase().endsWith(".git")) {
    repo = repo.slice(0, -4);
  }
  if (owner === "" || repo === "" || owner === "." || owner === ".." || repo === "." || repo === "..") {
    throw new InputError("Repository URL has an invalid owner or repo name.");
  }
  if (!namePattern.test(owner) || !namePattern.test(repo)) {
    throw new InputError("Repository URL has an invalid owner or repo name.");
  }
  return { owner, repo };
}

export function shellQuote(arg: string): string {
  return `'${arg.replace(/'/g, `'\\''`)}'`;
}

export function shellJoin(argv: string[]): string {
  return argv.map(shellQuote).join(" ");
}

export function redactSecrets(text: string): string {
  let out = text;
  const patterns: RegExp[] = [
    /ghp_[A-Za-z0-9]{8,}/g,
    /gho_[A-Za-z0-9]{8,}/g,
    /ghu_[A-Za-z0-9]{8,}/g,
    /github_pat_[A-Za-z0-9_]{8,}/g,
    /AIza[A-Za-z0-9_-]{8,}/g,
    /sk-[A-Za-z0-9]{8,}/g,
    /xox[bpas]-[A-Za-z0-9-]{8,}/g,
    /Bearer\s+[A-Za-z0-9._~+/-]{8,}={0,2}/gi,
    /api[_-]?key\s*[:=]\s*['"]?[A-Za-z0-9._~+/-]{8,}['"]?/gi,
  ];
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    out = out.replace(pattern, "[redacted]");
  }
  return out;
}

export function boundTail(text: string, maxChars: number): string {
  if (maxChars <= 0) return "";
  if (text.length <= maxChars) return text;
  return `…[truncated ${text.length - maxChars} chars]\n${text.slice(-maxChars)}`;
}
