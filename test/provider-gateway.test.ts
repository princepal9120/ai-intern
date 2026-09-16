import { describe, expect, it, vi } from "vitest";
import {
  DUMMY_PROVIDER_KEY,
  GOOGLE_API_HOST,
  forwardProviderRequest,
  sanitizeContainerHeaders,
  stripCredentialParams,
} from "../src/provider-gateway.js";

function setup() {
  const run = vi.fn<AiGateway["run"]>().mockResolvedValue(new Response("ok"));
  const gateway = vi.fn().mockReturnValue({ run });
  return { run, gateway, env: { AI: { gateway }, GATEWAY_ID: "gw", CODING_MODEL: "google/gemini-2.0-flash" } };
}

function providerRequest(method = "generateContent", streaming = false): Request {
  const url = new URL(`/v1beta/models/gemini-2.0-flash:${method}`, `https://${GOOGLE_API_HOST}`);
  url.searchParams.set("key", DUMMY_PROVIDER_KEY);
  if (streaming) url.searchParams.set("alt", "sse");
  return new Request(url, {
    method: "POST",
    headers: { Authorization: "Bearer dummy", "Content-Type": "application/json", "cf-aig-byok-alias": "untrusted" },
    body: JSON.stringify({ contents: [] }),
  });
}

describe("provider gateway", () => {
  it("keeps only content headers and strips credential parameters", () => {
    const out = sanitizeContainerHeaders(providerRequest().headers);
    expect([...out.keys()]).toEqual(["content-type"]);
    expect(stripCredentialParams("key=dummy&alt=sse&API_KEY=x&api_key=y")).toBe("alt=sse");
    expect(stripCredentialParams("")).toBe("");
  });

  it("forwards provider-native JSON through the account binding without credentials", async () => {
    const { run, gateway, env } = setup();
    const request = providerRequest();
    const response = await forwardProviderRequest(request, env);
    expect(await response.text()).toBe("ok");
    expect(gateway).toHaveBeenCalledWith("gw");
    expect(run).toHaveBeenCalledExactlyOnceWith({
      provider: "google-ai-studio",
      endpoint: `https://${GOOGLE_API_HOST}/v1beta/models/gemini-2.0-flash:generateContent`,
      headers: { "content-type": "application/json" },
      query: { contents: [] },
    }, { signal: request.signal });
  });

  it("preserves streaming query and returns the upstream response unchanged", async () => {
    const { run, env } = setup();
    const upstream = new Response("data: hello\n\n", { headers: { "content-type": "text/event-stream" } });
    run.mockResolvedValueOnce(upstream);
    expect(await forwardProviderRequest(providerRequest("streamGenerateContent", true), env)).toBe(upstream);
    expect(run.mock.calls[0]?.[0]).toMatchObject({
      endpoint: `https://${GOOGLE_API_HOST}/v1beta/models/gemini-2.0-flash:streamGenerateContent?alt=sse`,
    });
  });

  it("rejects unsupported hosts, models and methods without invoking the binding", async () => {
    const { run, env } = setup();
    const foreign = new Request("https://example.com/v1beta/models/gemini-2.0-flash:generateContent", { method: "POST", body: "{}" });
    expect((await forwardProviderRequest(foreign, env)).status).toBe(403);
    expect((await forwardProviderRequest(providerRequest("deleteModel"), env)).status).toBe(403);
    expect((await forwardProviderRequest(providerRequest(), { ...env, CODING_MODEL: "google/other" })).status).toBe(403);
    expect((await forwardProviderRequest(new Request(providerRequest().url), env)).status).toBe(405);
    expect(run).not.toHaveBeenCalled();
  });

  it("rejects non-default ports and plaintext http origins", async () => {
    const { run, env } = setup();
    expect(
      (await forwardProviderRequest(
        new Request(`https://${GOOGLE_API_HOST}:8443/v1beta/models/gemini-2.0-flash:generateContent`, { method: "POST", body: "{}" }),
        env,
      )).status,
    ).toBe(403);
    expect(
      (await forwardProviderRequest(
        new Request(`http://${GOOGLE_API_HOST}/v1beta/models/gemini-2.0-flash:generateContent`, { method: "POST", body: "{}" }),
        env,
      )).status,
    ).toBe(403);
    expect(run).not.toHaveBeenCalled();
  });

  it.each(["[1,2]", "null", "invalid"])("rejects invalid body %s", async (body) => {
    const { run, env } = setup();
    const request = new Request(providerRequest().url, { method: "POST", body });
    expect((await forwardProviderRequest(request, env)).status).toBe(400);
    expect(run).not.toHaveBeenCalled();
  });

  it("redacts gateway failures", async () => {
    const { run, env } = setup();
    run.mockRejectedValueOnce(new Error("boom ghp_1234567890abcd"));
    const response = await forwardProviderRequest(providerRequest(), env);
    expect(response.status).toBe(502);
    expect(await response.text()).toContain("boom [redacted]");
  });
});
