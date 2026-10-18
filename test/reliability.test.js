import assert from "node:assert/strict";
import test from "node:test";
import { truncate } from "../src/summarizer.js";
import { fetchRecentXPosts, XApiRequestError, XCreditsDepletedError } from "../src/xClient.js";

test("summary truncation preserves Unicode and the existing length limit", () => {
  const prefix = "a".repeat(696);
  assert.equal(truncate(`${prefix}😀 trailing text`, 700), `${prefix}...`);
  assert.equal(truncate("short 😀", 700), "short 😀");
  assert.equal(truncate("a".repeat(701), 700), `${"a".repeat(697)}...`);
  assert.equal(truncate("broken \ud83d", 700), "broken �");
});

const staleCursor = { errors: [{ parameters: { since_id: ["123"] } }] };
const staleWindow = { errors: [{
  parameters: { start_time: ["2026-07-14T21:05Z"] },
  message: "'start_time' must be on or after 2026-07-27T20:35Z",
}] };
const options = {
  bearerToken: "test-token", query: "baseball", maxResults: 10,
  lookbackHours: 24, retries: 0,
};

async function withResponses(responses, run) {
  const originalFetch = globalThis.fetch;
  const urls = [];
  globalThis.fetch = async (url) => {
    urls.push(new URL(url));
    assert.ok(urls.length <= responses.length, "request count must stay bounded");
    const [status, body] = responses[urls.length - 1];
    return new Response(JSON.stringify(body), { status });
  };
  try { await run(urls); } finally { globalThis.fetch = originalFetch; }
}

test("stale cursor retries with the requested window even with retries disabled", async () => {
  await withResponses([[400, staleCursor], [200, { data: [], meta: {} }]], async (urls) => {
    const result = await fetchRecentXPosts({ ...options, sinceId: "123", startTime: "2026-07-28T00:00:00Z", endTime: "2026-07-29T00:00:00Z" });
    assert.equal(result.pagesFetched, 1);
    assert.equal(urls.length, 2);
    assert.equal(urls[0].searchParams.get("since_id"), "123");
    assert.equal(urls[1].searchParams.has("since_id"), false);
    assert.equal(urls[1].searchParams.get("start_time"), "2026-07-28T00:00:00Z");
    assert.equal(urls[1].searchParams.get("end_time"), "2026-07-29T00:00:00Z");
  });
});

test("stale search window retries one minute inside the server's lower bound", async () => {
  await withResponses([[400, staleWindow], [200, { data: [], meta: {} }]], async (urls) => {
    await fetchRecentXPosts({ ...options, startTime: "2026-07-14T21:05Z" });
    assert.equal(urls.length, 2);
    assert.equal(urls[1].searchParams.get("start_time"), "2026-07-27T20:36:00.000Z");
  });
});

test("cursor and window recovery can occur together without consuming the retry budget", async () => {
  await withResponses([[400, staleCursor], [400, staleWindow], [200, { data: [], meta: {} }]], async (urls) => {
    await fetchRecentXPosts({ ...options, sinceId: "123" });
    assert.equal(urls.length, 3);
  });
});

for (const [label, body, extra] of [
  ["cursor", staleCursor, { sinceId: "123" }],
  ["window", staleWindow, { startTime: "2026-07-14T21:05Z" }],
]) {
  test(`repeated invalid ${label} fails instead of looping`, async () => {
    await withResponses([[400, body], [400, body]], async (urls) => {
      await assert.rejects(fetchRecentXPosts({ ...options, ...extra }), XApiRequestError);
      assert.equal(urls.length, 2);
    });
  });
}

test("unrelated invalid requests and exhausted credits are not retried", async () => {
  for (const [status, body, error] of [[400, { errors: [{ parameters: { query: ["bad"] } }] }, XApiRequestError], [402, { title: "CreditsDepleted" }, XCreditsDepletedError]]) {
    await withResponses([[status, body]], async (urls) => {
      await assert.rejects(fetchRecentXPosts({ ...options, sinceId: "123" }), error);
      assert.equal(urls.length, 1);
    });
  }
});

test("pagination keeps its token and never resets a cursor mid-stream", async () => {
  await withResponses([[200, { data: [{ id: "1", text: "Example" }], meta: { next_token: "next" } }], [400, staleCursor]], async (urls) => {
    await assert.rejects(fetchRecentXPosts({ ...options, sinceId: "123", maxPages: 2 }), XApiRequestError);
    assert.equal(urls.length, 2);
    assert.equal(urls[1].searchParams.get("next_token"), "next");
  });
});
