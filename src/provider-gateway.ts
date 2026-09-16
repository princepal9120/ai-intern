import { redactSecrets } from "./security.js";

export const DUMMY_PROVIDER_KEY = "ai-intern-dummy-key";
export const GOOGLE_API_HOST = "generativelanguage.googleapis.com";

export function sanitizeContainerHeaders(incoming: Headers): Headers {
  const headers = new Headers();
  for (const name of ["content-type", "accept"]) {
    const value = incoming.get(name);
    if (value) headers.set(name, value);
  }
  return headers;
}

export function stripCredentialParams(query: string): string {
  const params = new URLSearchParams(query);
  for (const key of [...params.keys()]) {
    if (["key", "api_key", "apikey"].includes(key.toLowerCase())) params.delete(key);
  }
  return params.toString();
}

export async function forwardProviderRequest(
  request: Request,
  env: { AI: Pick<Ai, "gateway">; GATEWAY_ID?: string; CODING_MODEL?: string },
): Promise<Response> {
  const url = new URL(request.url);
  const model = (env.CODING_MODEL || "google/gemini-2.0-flash").replace(/^google\//, "");
  const allowedPaths = ["generateContent", "streamGenerateContent", "countTokens"].map(
    (method) => `/v1beta/models/${model}:${method}`,
  );
  if (url.origin !== `https://${GOOGLE_API_HOST}` || url.username || url.password || !allowedPaths.includes(url.pathname)) {
    return new Response("Provider endpoint not allowed.", { status: 403 });
  }
  if (request.method !== "POST") return new Response("Method not allowed.", { status: 405 });
  let query: unknown;
  try {
    query = await request.json();
  } catch {
    return new Response("Provider body must be JSON.", { status: 400 });
  }
  if (!query || typeof query !== "object" || Array.isArray(query)) {
    return new Response("Provider body must be an object.", { status: 400 });
  }
  const endpoint = new URL(url.pathname, `https://${GOOGLE_API_HOST}`);
  if (url.searchParams.get("alt") === "sse") endpoint.searchParams.set("alt", "sse");
  try {
    return await env.AI.gateway(env.GATEWAY_ID || "default").run(
      {
        provider: "google-ai-studio",
        endpoint: endpoint.href,
        headers: Object.fromEntries(sanitizeContainerHeaders(request.headers)),
        query,
      },
      { signal: request.signal },
    );
  } catch (error) {
    return Response.json(
      { error: `Provider gateway error: ${redactSecrets(String(error))}` },
      { status: 502 },
    );
  }
}
