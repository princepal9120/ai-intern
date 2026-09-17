
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
