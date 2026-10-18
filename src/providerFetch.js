const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_ERROR_LENGTH = 600;

function timeoutMs() {
  const configured = Number(process.env.BRIEFING_NETWORK_TIMEOUT_MS);
  return Number.isFinite(configured) && configured >= 1_000 && configured <= 120_000 ? configured : DEFAULT_TIMEOUT_MS;
}

export function sanitizeProviderMessage(value) {
  return String(value || "")
    .replace(/Bearer\s+[A-Za-z0-9._~+\-/]+=*/gi, "Bearer [redacted]")
    .replace(/(api[_-]?key|token|secret|password)\s*[:=]\s*[^\s,;]+/gi, "$1=[redacted]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_ERROR_LENGTH);
}

export class ProviderRequestError extends Error {
  constructor({ provider, status, body, cause, method, requestId }) {
    const detail = sanitizeProviderMessage(body || cause?.message || "request failed") || "request failed";
    super(`${provider} request failed${status ? ` (${status})` : ""}: ${detail}`);
    this.name = "ProviderRequestError";
    this.provider = provider;
    this.status = status;
    this.body = detail;
    this.cause = cause;
    this.method = method;
    this.requestId = sanitizeProviderMessage(requestId);
    this.emptyBody = !String(body || "").trim();
    if (method) this.message += ` [method=${method}${this.requestId ? `, request_id=${this.requestId}` : ""}]`;
  }
}

function retryableStatus(status) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchProvider(url, {
  provider,
  method = "GET",
  retries = method === "GET" ? 2 : 0,
  timeout = timeoutMs(),
  throwOnHttpError = true,
  ...options
} = {}) {
  const canRetry = method === "GET" || method === "HEAD";
  let attempt = 0;
  while (true) {
    try {
      const response = await fetch(url, {
        ...options,
        method,
        signal: options.signal || AbortSignal.timeout(timeout),
      });
      if (response.ok || !throwOnHttpError) return response;
      const body = await response.text();
      if (canRetry && retryableStatus(response.status) && attempt < retries) {
        await sleep(500 * 2 ** attempt);
        attempt += 1;
        continue;
      }
      throw new ProviderRequestError({
        provider, status: response.status, body, method,
        requestId: response.headers.get("x-request-id"),
      });
    } catch (error) {
      if (error instanceof ProviderRequestError) throw error;
      if (canRetry && attempt < retries) {
        await sleep(500 * 2 ** attempt);
        attempt += 1;
        continue;
      }
      throw new ProviderRequestError({ provider, cause: error });
    }
  }
}

export async function fetchProviderJson(url, options = {}) {
  const response = await fetchProvider(url, options);
  try {
    return await response.json();
  } catch (error) {
    throw new ProviderRequestError({ provider: options.provider || "provider", cause: error });
  }
}
