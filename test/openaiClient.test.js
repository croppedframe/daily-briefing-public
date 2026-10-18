import assert from "node:assert/strict";
import test from "node:test";

import {
  extractOpenAiText,
  isOpenAiCreditsDepletedError,
  normalizeOpenAiUsage,
  OpenAiCreditsDepletedError,
  openAiTimeoutMs,
  requestOpenAi,
} from "../src/openaiClient.js";
import { ProviderRequestError } from "../src/providerFetch.js";

test("OpenAI client uses a longer bounded timeout and falls back for invalid values", () => {
  assert.equal(openAiTimeoutMs(""), 60_000);
  assert.equal(openAiTimeoutMs("90000"), 90_000);
  assert.equal(openAiTimeoutMs("999"), 60_000);
  assert.equal(openAiTimeoutMs("120001"), 60_000);
});

test("OpenAI client extracts direct and nested response text consistently", () => {
  assert.equal(extractOpenAiText({ output_text: " direct " }), "direct");
  assert.equal(extractOpenAiText({ output: [{ content: [{ type: "output_text", text: "first" }] }, { content: [{ type: "output_text", text: "second" }] }] }), "first\nsecond");
  assert.deepEqual(normalizeOpenAiUsage({ input_tokens: 4, output_tokens: 3, total_tokens: 7 }), { inputTokens: 4, outputTokens: 3, totalTokens: 7 });
});

test("OpenAI client distinguishes exhausted credits from transient rate limits", () => {
  const exhausted = new ProviderRequestError({
    provider: "OpenAI",
    status: 429,
    body: JSON.stringify({ error: { type: "insufficient_quota", code: "credit_balance_exhausted" } }),
  });
  const rateLimited = new ProviderRequestError({
    provider: "OpenAI",
    status: 429,
    body: JSON.stringify({ error: { type: "rate_limit_error", code: "rate_limit_exceeded" } }),
  });

  assert.equal(isOpenAiCreditsDepletedError(exhausted), true);
  assert.equal(isOpenAiCreditsDepletedError(rateLimited), false);
  assert.equal(isOpenAiCreditsDepletedError(new Error("credit_balance_exhausted")), false);
});

test("OpenAI client classifies an exhausted credit balance for notification handling", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    error: {
      message: "You have no credits remaining. Add credits to continue using the API.",
      type: "insufficient_quota",
      code: "credit_balance_exhausted",
    },
  }), { status: 429 });

  try {
    await assert.rejects(
      requestOpenAi({ apiKey: "test-key", model: "test-model", input: "prompt" }),
      (error) => error instanceof OpenAiCreditsDepletedError
        && error.status === 429
        && error.code === "credit_balance_exhausted",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("OpenAI client sends one standard request and reports normalized usage", async () => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify({ output_text: "answer", usage: { input_tokens: 2, output_tokens: 1, total_tokens: 3 } }), { status: 200 });
  };
  const calls = [];
  try {
    const result = await requestOpenAi({ apiKey: "test-key", model: "test-model", input: "prompt", usageSink: (usage) => calls.push(usage) });
    assert.equal(result.text, "answer");
    assert.equal(request.url, "https://api.openai.com/v1/responses");
    assert.equal(JSON.parse(request.options.body).model, "test-model");
    assert.equal(request.options.headers.Authorization, "Bearer test-key");
    assert.deepEqual(calls[0].usage, { inputTokens: 2, outputTokens: 1, totalTokens: 3 });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("OpenAI client applies an explicit request timeout", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, options) => new Promise((_resolve, reject) => {
    const keepAlive = setTimeout(() => {}, 100);
    options.signal.addEventListener("abort", () => {
      clearTimeout(keepAlive);
      reject(options.signal.reason);
    }, { once: true });
  });
  try {
    await assert.rejects(
      requestOpenAi({ apiKey: "test-key", model: "test-model", input: "prompt", timeout: 5 }),
      /OpenAI request failed: The operation was aborted due to timeout/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

for (const scenario of ["recovered", "exhausted", "model_error"]) {
  test(`OpenAI empty 404 handling: ${scenario}`, async () => {
    const originalFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      if (scenario === "recovered" && calls === 2) return Response.json({ output_text: "answer" });
      return new Response(scenario === "model_error" ? '{"error":{"code":"model_not_found"}}' : "", {
        status: 404, headers: { "x-request-id": "req_test" },
      });
    };
    try {
      const request = requestOpenAi({ apiKey: "test-key", model: "test-model", input: "prompt" });
      if (scenario === "recovered") {
        assert.equal((await request).text, "answer");
        assert.equal(calls, 2);
      } else {
        await assert.rejects(request, (error) => {
          assert.equal(error.status, 404);
          assert.equal(error.requestId, "req_test");
          assert.match(error.message, /method=POST, request_id=req_test/);
          assert.doesNotMatch(error.message, /test-key|prompt/);
          return true;
        });
        assert.equal(calls, scenario === "exhausted" ? 3 : 1);
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
}
