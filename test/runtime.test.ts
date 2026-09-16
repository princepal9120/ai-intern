import { execFileSync } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Sandbox } from "../src/sandbox.js";

vi.mock("@cloudflare/sandbox", () => ({ Sandbox: class {} }));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
import type { Env } from "../src/env.js";
import type { CodingTaskInput } from "../src/opencode-input.js";
import {
  COMPUTER_PREVIEW_MESSAGE,
  ComputerPreviewAdapter,
  SandboxRuntimeAdapter,
  buildOpencodeArgv,
  buildOpencodeConfig,
  createRuntimeAdapter,
  parsePorcelainStatus,
  resolveRuntimeName,
  type ProgressEvent,
  type SandboxOps,
} from "../src/runtime.js";

const INPUT: CodingTaskInput = {
  repoUrl: "https://github.com/owner/repo",
  task: "Fix it; rm -rf /",
  baseBranch: "main",
  publishPullRequest: false,
  sandboxId: "run-abcdef12345678",
  codingModel: "google/gemini-2.0-flash",
  providerBaseUrl: "https://generativelanguage.googleapis.com",
};

interface RecordedExec {
  command: string;
  cwd?: string;
  env?: Record<string, string>;
}

function makeFakeOps(overrides: Partial<SandboxOps> = {}): SandboxOps & { execs: RecordedExec[] } {
  const execs: RecordedExec[] = [];
  return {
    execs,
    async gitCheckout() {},
    async writeFile() {},
    async exec(command, opts) {
      execs.push({ command, cwd: opts?.cwd, env: opts?.env });
      if (command.includes("opencode")) {
        return { stdout: "run output", stderr: "", exitCode: 0 };
      }
      if (command.includes("status")) {
        return { stdout: " M src/a.ts\n?? new.txt\n", stderr: "", exitCode: 0 };
      }
      if (command.includes("diff")) {
        return { stdout: "diff --git a/src/a.ts", stderr: "", exitCode: 0 };
      }
      return { stdout: "", stderr: "", exitCode: 0 };
    },
    async readFile() {
      return { kind: "utf8", content: "file content" };
    },
    ...overrides,
  };
}

describe("SandboxRuntimeAdapter", () => {
  it("clones, configures, runs, and collects changes", async () => {
    const ops = makeFakeOps();
    const seen: string[] = [];
    let checkoutArgs: { repoUrl: string; branch: string; targetDir: string } | null = null;
    ops.gitCheckout = async (repoUrl, opts) => {
      checkoutArgs = { repoUrl, branch: opts.branch, targetDir: `/x${opts.targetDir}`.slice(2) };
    };
    const events: ProgressEvent[] = [];
    const adapter = new SandboxRuntimeAdapter();
    const result = await adapter.runCodingTask(ops, INPUT, (event) => {
      events.push(event);
      seen.push(event.phase);
    });
    expect(checkoutArgs).toEqual({
      repoUrl: INPUT.repoUrl,
      branch: "main",
      targetDir: "/workspace/run-abcdef12345678",
    });
    expect(result.status).toBe("completed");
    expect(result.exitCode).toBe(0);
    expect(result.changedFiles).toEqual(["src/a.ts", "new.txt"]);
    expect(result.diff).toContain("diff --git");
    expect(result.files).toHaveLength(2);
    expect(seen).toEqual(["clone", "configure", "code", "collect", "collect"]);
  });

  it("quotes the task so shell metacharacters cannot escape", async () => {
    const ops = makeFakeOps();
    const adapter = new SandboxRuntimeAdapter();
    await adapter.runCodingTask(ops, INPUT, () => {});
    const opencodeExec = ops.execs.find((exec) => exec.command.includes("opencode"));
    expect(opencodeExec).toBeDefined();
    // The hostile task must appear as one single-quoted word.
    expect(opencodeExec?.command).toContain(`'Fix it; rm -rf /'`);
    const taskWord = `'Fix it; rm -rf /'`;
    expect(execFileSync("sh", ["-c", `printf '%s' ${taskWord}`], { encoding: "utf8" })).toBe(
      "Fix it; rm -rf /",
    );
  });

  it("never passes real provider credentials into the container", async () => {
    const ops = makeFakeOps();
    const adapter = new SandboxRuntimeAdapter();
    await adapter.runCodingTask(ops, INPUT, () => {});
    const envText = JSON.stringify(ops.execs.map((exec) => exec.env));
    expect(envText).not.toContain("AI_GATEWAY_TOKEN");
    expect(envText).not.toContain("GITHUB_TOKEN");
    expect(envText).toContain("ai-intern-dummy-key");
  });

  it("reports clone failures honestly", async () => {
    const ops = makeFakeOps({
      async gitCheckout() {
        throw new Error("authentication required");
      },
    });
    const adapter = new SandboxRuntimeAdapter();
    const result = await adapter.runCodingTask(ops, INPUT, () => {});
    expect(result.status).toBe("error");
    expect(result.summary).toContain("Clone failed");
  });

  it("reports non-zero OpenCode exits with a bounded stderr tail", async () => {
    const ops = makeFakeOps({
      async exec() {
        return { stdout: "", stderr: `x\n${"e".repeat(50_000)}`, exitCode: 3 };
      },
    });
    const adapter = new SandboxRuntimeAdapter();
    const result = await adapter.runCodingTask(ops, INPUT, () => {});
    expect(result.status).toBe("error");
    expect(result.exitCode).toBe(3);
    expect(result.stderrTail.length).toBeLessThan(20_000);
  });

  it("honors cancellation between phases", async () => {
    const ops = makeFakeOps();
    const adapter = new SandboxRuntimeAdapter();
    const controller = new AbortController();
    controller.abort();
    await expect(adapter.runCodingTask(ops, INPUT, () => {}, { signal: controller.signal })).rejects.toThrow(
      /cancelled/i,
    );
  });
});

describe("opencode config and argv", () => {
  it("builds an isolated google-provider config with a dummy key", () => {
    const config = buildOpencodeConfig(INPUT);
    expect(config).toMatchObject({
      model: "google/gemini-2.0-flash",
      enabled_providers: ["google"],
      autoupdate: false,
    });
    const options = (config.provider as Record<string, { options: Record<string, string> }>)["google"];
    expect(options?.options.apiKey).toBe("ai-intern-dummy-key");
    expect(options?.options).not.toHaveProperty("baseURL");
  });

  it("rejects non-google coding models", () => {
    expect(() => buildOpencodeConfig({ ...INPUT, codingModel: "openai/gpt-5" })).toThrow();
  });

  it("builds a headless JSON argv array", () => {
    expect(buildOpencodeArgv(INPUT, "/workspace/x")).toEqual([
      "opencode",
      "run",
      "--format",
      "json",
      "--model",
      "google/gemini-2.0-flash",
      "--dir",
      "/workspace/x",
      INPUT.task,
    ]);
  });
});

describe("parsePorcelainStatus", () => {
  it("parses modifications, additions, and renames", () => {
    expect(parsePorcelainStatus(' M a.ts\nA  b.ts\nR  old.ts -> new.ts\n?? "sp ace.ts"\n')).toEqual([
      "a.ts",
      "b.ts",
      "new.ts",
      "sp ace.ts",
    ]);
  });

  it("drops unsafe paths", () => {
    expect(parsePorcelainStatus(" M ../escape\n M /absolute\n")).toEqual([]);
  });
});

describe("sandbox HTTPS egress", () => {
  function env(token?: string) {
    const getUrl = vi.fn().mockResolvedValue(
      "https://gateway.ai.cloudflare.com/v1/binding-account/default/google-ai-studio",
    );
    const gateway = vi.fn().mockReturnValue({ getUrl });
    return {
      AI: { gateway } as unknown as Env["AI"],
      GATEWAY_ID: "default",
      GITHUB_TOKEN: token,
      AI_GATEWAY_TOKEN: token,
      gateway,
      getUrl,
    };
  }

  it("rewrites native Google HTTPS egress using the binding and strips container credentials", async () => {
    const upstream = new Response("data: streamed reply\n\n");
    const fetchMock = vi.fn().mockResolvedValue(upstream);
    vi.stubGlobal("fetch", fetchMock);
    const bindings = env("worker-only-secret");
    const request = new Request(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini:streamGenerateContent?alt=sse&key=dummy&api_key=smuggled&apiKey=other",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer container-secret",
          "x-goog-api-key": "dummy",
          "x-api-key": "smuggled",
          "cf-aig-authorization": "Bearer container-gateway-token",
          "cf-aig-byok-alias": "container-chosen-key",
          "content-type": "application/json",
        },
        body: '{"contents":[]}',
      },
    );
    const response = await Sandbox.outboundByHost["generativelanguage.googleapis.com"](request, bindings);
    expect(response).toBe(upstream);
    expect(bindings.gateway).toHaveBeenCalledWith("default");
    expect(bindings.getUrl).toHaveBeenCalledWith("google-ai-studio");
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe(
      "https://gateway.ai.cloudflare.com/v1/binding-account/default/google-ai-studio/v1beta/models/gemini:streamGenerateContent?alt=sse",
    );
    const headers = new Headers(init.headers);
    for (const name of ["authorization", "x-goog-api-key", "x-api-key", "cf-aig-byok-alias"]) {
      expect(headers.has(name)).toBe(false);
    }
    expect(headers.get("cf-aig-authorization")).toBe("Bearer worker-only-secret");
    expect(headers.get("content-type")).toBe("application/json");
    expect(init.body).toBe(request.body);
    expect(init.redirect).toBe("manual");
  });

  it("uses no provider credential when the gateway supplies BYOK", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("ok"));
    vi.stubGlobal("fetch", fetchMock);
    await Sandbox.outboundByHost["generativelanguage.googleapis.com"](
      new Request("https://generativelanguage.googleapis.com/v1beta/models", {
        headers: { "cf-aig-authorization": "Bearer untrusted" },
      }),
      env(),
    );
    const headers = new Headers(fetchMock.mock.calls[0]?.[1].headers);
    expect(headers.has("authorization")).toBe(false);
    expect(headers.has("cf-aig-authorization")).toBe(false);
  });

  it.each([undefined, "github-worker-secret"])("authenticates GitHub only with a configured token (%s)", async (token) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("git advertisement"));
    vi.stubGlobal("fetch", fetchMock);
    await Sandbox.outboundByHost["github.com"](
      new Request("https://github.com/owner/repo.git/info/refs?service=git-upload-pack", {
        headers: { Authorization: "Bearer container-token" },
      }),
      env(token),
    );
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://github.com/owner/repo.git/info/refs?service=git-upload-pack");
    expect(new Headers(init.headers).get("authorization")).toBe(
      token ? `Basic ${btoa(`x-access-token:${token}`)}` : null,
    );
    expect(init.redirect).toBe("manual");
    expect(url.toString()).not.toContain("secret");
  });

  it("does not forward credentials to insecure or mismatched destinations", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    for (const handler of Object.values(Sandbox.outboundByHost)) {
      expect((await handler(new Request("https://attacker.example/"), env("secret"))).status).toBe(403);
      expect((await handler(new Request("http://github.com/"), env("secret"))).status).toBe(403);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps authenticated fetch errors out of responses and logs", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Authorization: worker-only-secret")));
    const logs = [vi.spyOn(console, "error"), vi.spyOn(console, "warn"), vi.spyOn(console, "log")];
    for (const [host, handler] of Object.entries(Sandbox.outboundByHost)) {
      const response = await handler(new Request(`https://${host}/`), env("worker-only-secret"));
      expect(response.status).toBe(502);
      expect(await response.text()).not.toContain("worker-only-secret");
    }
    for (const log of logs) expect(log).not.toHaveBeenCalled();
  });
});

describe("streamed opencode progress", () => {
  it("emits bounded progress from streamed stdout JSON events", async () => {
    const ops = makeFakeOps();
    const events: string[] = [];
    ops.exec = async (command, opts) => {
      execs: for (const line of [
        JSON.stringify({ type: "step-start", part: "reading src/a.ts" }),
        "not json at all",
        JSON.stringify({ type: "step-finish" }),
      ]) {
        opts?.onOutput?.("stdout", `${line}\n`);
      }
      void execs;
      return { stdout: "", stderr: "", exitCode: 0 };
    };
    const adapter = new SandboxRuntimeAdapter();
    const result = await adapter.runCodingTask(ops, INPUT, (event) => {
      if (event.phase === "code") events.push(event.message);
    });
    expect(result.status).toBe("completed");
    expect(events.length).toBe(3);
    expect(events[0]).toContain("reading src/a.ts");
    expect(events[1]).toContain("malformed event line (redacted)");
    expect(events[2]).not.toContain("undefined");
  });

  it("surfaces an opencode error event instead of pretending success", async () => {
    const ops = makeFakeOps();
    ops.exec = async (_command, opts) => {
      opts?.onOutput?.("stdout", `${JSON.stringify({ type: "error", message: "quota exhausted" })}\n`);
      return { stdout: "", stderr: "", exitCode: 0 };
    };
    const adapter = new SandboxRuntimeAdapter();
    const result = await adapter.runCodingTask(ops, INPUT, () => {});
    expect(result.status).toBe("error");
    expect(result.summary).toContain("quota exhausted");
  });

  it("caps progress events so a chatty run cannot flood the stream", async () => {
    const ops = makeFakeOps();
    ops.exec = async (_command, opts) => {
      for (let i = 0; i < 5000; i += 1) {
        opts?.onOutput?.("stdout", `${JSON.stringify({ type: "log", part: `line ${i}` })}\n`);
      }
      return { stdout: "", stderr: "", exitCode: 0 };
    };
    const events: ProgressEvent[] = [];
    const adapter = new SandboxRuntimeAdapter();
    const result = await adapter.runCodingTask(ops, INPUT, (event) => events.push(event));
    expect(result.status).toBe("completed");
    const codeEvents = events.filter((event) => event.phase === "code");
    expect(codeEvents.length).toBe(MAX_PROGRESS_EVENTS);
  });

  it("redacts secrets from the stderr tail", async () => {
    const ops = makeFakeOps({
      async exec() {
        return { stdout: "", stderr: "boom AI_GATEWAY_TOKEN=real-secret-value", exitCode: 0 };
      },
    });
    const adapter = new SandboxRuntimeAdapter();
    const result = await adapter.runCodingTask(ops, INPUT, () => {});
    expect(result.status).toBe("completed");
    expect(result.stderrTail).not.toContain("real-secret-value");
  });
});

describe("complete file collection bounds", () => {
  it("passes per-file maxBytes and cancellation signal to readFile", async () => {
    const ops = makeFakeOps();
    const calls: Array<{ path: string; opts?: { maxBytes?: number; signal?: AbortSignal } }> = [];
    ops.readFile = async (path, opts) => {
      calls.push({ path, opts });
      return { kind: "utf8", content: "file content" };
    };
    const controller = new AbortController();
    const adapter = new SandboxRuntimeAdapter();
    const result = await adapter.runCodingTask(ops, INPUT, () => {}, { signal: controller.signal });
    expect(result.status).toBe("completed");
    expect(calls).toHaveLength(2);
    for (const call of calls) {
      expect(call.opts?.maxBytes).toBe(MAX_FILE_CHARS);
      expect(call.opts?.signal).toBe(controller.signal);
    }
  });

  it("fails the whole run when a file exceeds its bound instead of truncating", async () => {
    const ops = makeFakeOps({
      async readFile(_path, opts) {
        if ((opts?.maxBytes ?? 0) < 1_000_000) {
          throw new Error("readFile exceeded maxBytes: never truncating captured file content.");
        }
        return { kind: "utf8", content: "file content" };
      },
    });
    const adapter = new SandboxRuntimeAdapter();
    const result = await adapter.runCodingTask(ops, INPUT, () => {});
    expect(result.status).toBe("error");
    expect(result.summary).toContain("maxBytes");
    expect(result.files).toHaveLength(0);
  });

  it("counts deleted files without reading them", async () => {
    const ops = makeFakeOps();
    const reads: string[] = [];
    ops.exec = async (command, opts) => {
      if (command.includes("opencode")) {
        opts?.onOutput?.("stdout", "");
        return { stdout: "", stderr: "", exitCode: 0 };
      }
      if (command.includes("status")) {
        return { stdout: " D src/deleted.ts\n M src/a.ts\n", stderr: "", exitCode: 0 };
      }
      return { stdout: "", stderr: "", exitCode: 0 };
    };
    ops.readFile = async (path) => {
      reads.push(path);
      return { kind: "utf8", content: "content" };
    };
    const adapter = new SandboxRuntimeAdapter();
    const result = await adapter.runCodingTask(ops, INPUT, () => {});
    expect(result.changedFiles).toEqual(["src/deleted.ts", "src/a.ts"]);
    expect(reads).toEqual(["/workspace/run-abcdef12345678/src/a.ts"]);
    expect(result.files).toHaveLength(1);
  });
});

describe("runtime seam", () => {
  it("defaults to sandbox and rejects unknown runtimes", () => {
    expect(resolveRuntimeName(undefined)).toBe("sandbox");
    expect(resolveRuntimeName("")).toBe("sandbox");
    expect(resolveRuntimeName("sandbox")).toBe("sandbox");
    expect(resolveRuntimeName("computer")).toBe("computer");
    expect(() => resolveRuntimeName("docker")).toThrow();
  });

  it("creates the sandbox adapter by default", async () => {
    const adapter = createRuntimeAdapter("sandbox");
    expect(adapter.name).toBe("sandbox");
    expect(adapter).toBeInstanceOf(SandboxRuntimeAdapter);
  });

  it("refuses computer runs with a preview message", async () => {
    const adapter = createRuntimeAdapter("computer");
    expect(adapter).toBeInstanceOf(ComputerPreviewAdapter);
    await expect(adapter.runCodingTask(makeFakeOps(), INPUT, () => {})).rejects.toThrow(
      COMPUTER_PREVIEW_MESSAGE,
    );
  });
});
