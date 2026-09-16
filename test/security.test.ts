import { describe, expect, it } from "vitest";
import {
  boundTail,
  parseGitHubRepoUrl,
  redactSecrets,
  shellJoin,
  shellQuote,
  InputError,
} from "../src/security.js";

describe("parseGitHubRepoUrl", () => {
  it("accepts a canonical repository URL", () => {
    expect(parseGitHubRepoUrl("https://github.com/owner/repo")).toEqual({
      owner: "owner",
      repo: "repo",
    });
  });

  it("accepts a .git suffix and trailing slash", () => {
    expect(parseGitHubRepoUrl("https://github.com/owner/repo.git/")).toEqual({
      owner: "owner",
      repo: "repo",
    });
  });

  it("rejects non-HTTPS URLs", () => {
    expect(() => parseGitHubRepoUrl("http://github.com/owner/repo")).toThrow();
  });

  it("rejects non-GitHub hosts", () => {
    expect(() => parseGitHubRepoUrl("https://gitlab.com/owner/repo")).toThrow();
    expect(() => parseGitHubRepoUrl("https://evilgithub.com/owner/repo")).toThrow();
    expect(() => parseGitHubRepoUrl("https://github.com.evil.com/owner/repo")).toThrow();
  });

  it("rejects embedded credentials", () => {
    expect(() => parseGitHubRepoUrl("https://user:pass@github.com/owner/repo")).toThrow();
  });

  it("rejects wrong path shapes", () => {
    expect(() => parseGitHubRepoUrl("https://github.com/owner")).toThrow();
    expect(() => parseGitHubRepoUrl("https://github.com/a/b/c")).toThrow();
    expect(() => parseGitHubRepoUrl("https://github.com/../x")).toThrow();
  });

  it("rejects non-URLs", () => {
    expect(() => parseGitHubRepoUrl("not a url")).toThrow();
    expect(() => parseGitHubRepoUrl("")).toThrow();
  });
});

describe("shellQuote", () => {
  it("quotes spaces and metacharacters", () => {
    expect(shellQuote("hello world")).toBe("'hello world'");
  });

  it("neutralizes single quotes", () => {
    const evil = `x'; echo pwned; '`;
    const quoted = shellQuote(evil);
    expect(quoted.startsWith("'")).toBe(true);
    expect(quoted.endsWith("'")).toBe(true);
  });

  it("shellJoin quotes every argument", () => {
    const joined = shellJoin(["git", "clone", "--branch", "a;bad", "https://github.com/o/r"]);
    expect(joined).toBe(`'git' 'clone' '--branch' 'a;bad' 'https://github.com/o/r'`);
  });
});

describe("redactSecrets", () => {
  it("redacts GitHub tokens, bearer headers, and provider keys", () => {
    const text = "token ghp_abcdefgh12345678 and Bearer abcdefgh.1234 plus AIzaabcdefgh12345678";
    const redacted = redactSecrets(text);
    expect(redacted).not.toContain("ghp_abcdefgh");
    expect(redacted).not.toContain("AIza");
    expect(redacted).toContain("[redacted]");
  });

  it("leaves ordinary text alone", () => {
    expect(redactSecrets("hello world")).toBe("hello world");
  });
});

describe("boundTail", () => {
  it("keeps short text intact", () => {
    expect(boundTail("abc", 10)).toBe("abc");
  });

  it("truncates long text from the front with a marker", () => {
    const out = boundTail("x".repeat(100), 10);
    expect(out.endsWith("x".repeat(10))).toBe(true);
    expect(out).toContain("truncated");
  });
});

describe("error shapes", () => {
  it("ConfigError exposes a stable code", () => {
    expect(new InputError("bad").code).toBe("input_error");
  });
});
