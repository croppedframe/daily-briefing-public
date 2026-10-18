import assert from "node:assert/strict";
import test from "node:test";

import { fetchProvider, ProviderRequestError, sanitizeProviderMessage } from "../src/providerFetch.js";

test("provider fetch retries transient GET failures and returns the eventual response", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return calls === 1 ? new Response("temporary", { status: 503 }) : new Response("ok", { status: 200 });
  };
  try {
    const response = await fetchProvider("https://example.test", { provider: "Example", timeout: 1000, retries: 1 });
    assert.equal(await response.text(), "ok");
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("provider fetch does not retry non-idempotent POST requests", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response("upstream unavailable", { status: 503 });
  };
  try {
    await assert.rejects(
      fetchProvider("https://example.test", { provider: "Example", method: "POST", timeout: 1000, retries: 3 }),
      (error) => error instanceof ProviderRequestError && error.status === 503,
    );
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("provider errors redact credentials and cap response detail", () => {
  const message = sanitizeProviderMessage(`Bearer super-secret-token api_key=abc123 ${"x".repeat(1000)}`);
  assert.doesNotMatch(message, /super-secret-token|abc123/);
  assert.ok(message.length <= 600);
});
