import assert from "node:assert/strict";
import test from "node:test";

import {
  filterNewsItemsByWindow,
  formatNewsItems,
  googleNewsArticleId,
  isLikelyArticleUrl,
  parseGoogleNewsBatchResponse,
  parseRssItems,
  resolveNewsItemLinks,
} from "../src/newsContext.js";

test("RSS parser handles escaped fields, CDATA, and multiline item content", () => {
  const xml = `
    <rss><channel>
      <item>
        <title><![CDATA[Oil &amp; gas: <update>]]></title>
        <source>Example &amp; Co</source>
        <link>https://example.com/one?a=1&amp;b=2</link>
        <pubDate>Sat, 11 Jul 2026 12:00:00 GMT</pubDate>
      </item>
    </channel></rss>`;
  assert.deepEqual(parseRssItems(xml), [{
    title: "Oil & gas: <update>",
    source: "Example & Co",
    link: "https://example.com/one?a=1&b=2",
    publishedAt: "Sat, 11 Jul 2026 12:00:00 GMT",
  }]);
});

test("RSS parser returns all items and keeps missing optional fields empty", () => {
  const xml = "<channel><item><title>First</title><link>https://example.com/1</link></item><item><title>Second</title><source>Wire</source></item></channel>";
  assert.deepEqual(parseRssItems(xml), [
    { title: "First", source: "", link: "https://example.com/1", publishedAt: "" },
    { title: "Second", source: "Wire", link: "", publishedAt: "" },
  ]);
});

test("RSS parser ignores non-item markup and does not throw on malformed feeds", () => {
  assert.deepEqual(parseRssItems("<rss><channel><title>Only channel title</title></channel></rss>"), []);
  assert.deepEqual(parseRssItems("not xml <item><title>Unclosed"), []);
});

test("news context excludes unresolved stories instead of supplying unlinked headlines", () => {
  const formatted = formatNewsItems([
    {
      title: "Agency update",
      source: "Reuters",
      link: "https://news.google.com/rss/articles/long-token?oc=5",
      publishedAt: "Wed, 29 Jul 2026 12:00:00 GMT",
    },
  ], []);

  assert.match(formatted, /omitted because no direct article links/);
  assert.doesNotMatch(formatted, /Agency update|Reuters/);
  assert.doesNotMatch(formatted, /news\.google\.com/);
});

test("news context retains linked articles and excludes empty links and homepages", () => {
  const formatted = formatNewsItems([
    { title: "Linked story", source: "Wire", link: "https://example.com/news/story" },
    { title: "Missing story", source: "Wire", link: "" },
    { title: "Homepage story", source: "Wire", link: "https://example.com/" },
  ], []);
  assert.match(formatted, /Linked story/);
  assert.match(formatted, /Direct publisher URL: https:\/\/example.com\/news\/story/);
  assert.doesNotMatch(formatted, /Missing story|Homepage story/);
});

test("Google News URL resolution accepts article URLs and rejects publisher homepages", () => {
  assert.equal(googleNewsArticleId("https://news.google.com/rss/articles/encoded-id?oc=5"), "encoded-id");
  assert.equal(isLikelyArticleUrl("https://time.com/"), false);
  assert.equal(isLikelyArticleUrl("https://itep.org/"), false);
  assert.equal(isLikelyArticleUrl("https://www.reuters.com/world/example-story-2026-08-12/"), true);

  const article = JSON.stringify(["garturlres", "https://www.reuters.com/world/example-story-2026-08-12/"]);
  const homepage = JSON.stringify(["garturlres", "https://time.com/"]);
  const response = `)]}'\n\n${JSON.stringify([["wrb.fr", "Fbv4je", article], ["wrb.fr", "Fbv4je", homepage]])}`;
  assert.deepEqual(parseGoogleNewsBatchResponse(response), ["https://www.reuters.com/world/example-story-2026-08-12/", undefined]);
});

test("failed Google URL resolution removes the redirect and preserves publisher context", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => new Response("", { status: 200 });
  try {
    const [item] = await resolveNewsItemLinks([{
      title: "Agency update",
      source: "Roll Call",
      link: "https://news.google.com/rss/articles/encoded-id?oc=5",
      publishedAt: "",
    }]);
    assert.equal(item.link, "");
    assert.equal(item.source, "Roll Call");
  } finally {
    global.fetch = originalFetch;
  }
});

test("Google News items use a strict publication window", () => {
  const items = [
    { title: "At boundary", publishedAt: "Wed, 19 Aug 2026 10:00:00 GMT" },
    { title: "Inside", publishedAt: "Wed, 19 Aug 2026 10:00:01 GMT" },
    { title: "At end", publishedAt: "Thu, 20 Aug 2026 10:00:00 GMT" },
    { title: "After end", publishedAt: "Thu, 20 Aug 2026 10:00:01 GMT" },
    { title: "Undated", publishedAt: "" },
  ];

  const filtered = filterNewsItemsByWindow(items, {
    startTime: "2026-08-19T10:00:00.000Z",
    endTime: "2026-08-20T10:00:00.000Z",
  });

  assert.deepEqual(filtered.map((item) => item.title), ["Inside", "At end"]);
});
