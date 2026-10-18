import assert from "node:assert/strict";
import test from "node:test";

import {
  applySummaryMode,
  removeUnsuppliedLinks,
  suppliedCitationUrls,
  summarizeTopic,
  truncate,
} from "../src/summarizer.js";

test("unlinked roster summaries are repaired or withheld after citation sanitization", async () => {
  const originalFetch = globalThis.fetch;
  const articleUrl = "https://example.com/news/roster";
  const args = {
    apiKey: "test-key", model: "test-model", topic: { id: "team-news", title: "Team News" }, posts: [],
    newsContext: `Direct publisher URL: ${articleUrl}`,
  };
  try {
    for (const repair of [
      `The team announced roster actions. [Publisher](${articleUrl})`,
      "The team are stepping up roster according to a sports publication.",
      "The team announced actions. [Invented](https://invented.example/story)",
    ]) {
      let calls = 0;
      globalThis.fetch = async () => new Response(JSON.stringify({
        output_text: ++calls === 1 ? "The team are stepping up roster according to a sports publication." : repair,
      }));
      const summary = await summarizeTopic(args);
      assert.equal(calls, 2);
      assert.equal(summary, repair.includes(articleUrl) ? repair : "Summary withheld because it could not be supported with valid source links.");
    }
    globalThis.fetch = async () => new Response(JSON.stringify({ output_text: "QUIET: No material update found." }));
    assert.equal(await summarizeTopic(args), "No material update found.");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("truncation does not split an emoji surrogate pair", () => {
  const prefix = "a".repeat(696);
  const truncated = truncate(`${prefix}😀 trailing text`, 700);

  assert.equal(truncated, `${prefix}...`);
  assert.doesNotMatch(JSON.stringify(truncated), /\\ud83d/i);
});

test("summary citations are limited to URLs actually supplied to the model", () => {
  const postUrl = "https://x.com/i/web/status/123";
  const articleUrl = "https://www.reuters.com/world/example-story/";
  const allowed = suppliedCitationUrls({
    posts: [{ url: postUrl }],
    newsContext: `Publisher: Reuters\nDirect publisher URL: ${articleUrl}`,
  });
  const summary = [
    `Confirmed [@account](${postUrl}).`,
    `Reported by [Reuters](${articleUrl}).`,
    "Invented [TIME](https://time.com/) and [ITEP](https://itep.org/).",
    "Bare invention https://taxpayer.net/.",
  ].join("\n");

  const cleaned = removeUnsuppliedLinks(summary, allowed);
  assert.match(cleaned, new RegExp(`\\[@account\\]\\(${postUrl.replaceAll("/", "\\/")}\\)`));
  assert.match(cleaned, /\[Reuters\]\(https:\/\/www\.reuters\.com\/world\/example-story\/\)/);
  assert.match(cleaned, /Invented TIME and ITEP\./);
  assert.doesNotMatch(cleaned, /https:\/\/time\.com|https:\/\/itep\.org|https:\/\/taxpayer\.net/);
});

test("an explicit first-line quiet marker is removed from the delivered summary", () => {
  assert.equal(
    applySummaryMode("QUIET: No material company-specific catalyst emerged in this window."),
    "No material company-specific catalyst emerged in this window.",
  );
});

test("unmarked quiet prose is preserved instead of being heuristically collapsed", () => {
  const summary = "No material company-specific catalyst emerged.\n\n### Context\nThe source mix was mostly recap.";
  assert.equal(applySummaryMode(summary), summary);
});

test("mixed material summaries retain citations and incidental no-update language", () => {
  const summary = [
    "Baseball confirmed a roster move [@Baseball](https://x.com/i/web/status/123).",
    "",
    "### Notable items",
    "- No reliable update on cash or financing was supplied.",
  ].join("\n");
  assert.equal(applySummaryMode(summary), summary);
});

test("a quiet phrase or marker below the first line cannot collapse a material summary", () => {
  const summary = "A team announced a new signing.\n\nQUIET: No fresh catalyst appeared in price action.";
  assert.equal(applySummaryMode(summary), summary);
});
