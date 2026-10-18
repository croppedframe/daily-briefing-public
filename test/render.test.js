import assert from "node:assert/strict";
import test from "node:test";

import { renderBriefing, renderCreditsDepletedNotification } from "../src/render.js";
import { markdownToHtml } from "../src/render/html.js";
import { renderSourceCardsHtml, sourceStats, textForPost } from "../src/render/sourceCards.js";
import { headingForBriefing, subjectForBriefing } from "../src/render/subject.js";

function section() {
  return {
    id: "sports-news",
    title: "Sports <News>",
    label: "SPORTS",
    summary: "Opening signal.\n\n## Notable items\n- Verified development [source](https://x.com/i/web/status/123).",
    posts: [{
      id: "123",
      text: "Source <script>alert('x')</script>",
      createdAt: "2026-07-11T12:00:00Z",
      url: "https://x.com/i/web/status/123",
      author: { name: "Source & Co", username: "source" },
      metrics: { likes: 3, reposts: 2, replies: 1 },
    }],
    rawPostCount: 2,
    signalPostCount: 1,
    collectionWarnings: ["One source timed out <temporarily>."],
  };
}

test("briefing rendering produces stable text and escaped HTML invariants", () => {
  const message = renderBriefing({
    subject: "Concrete Lead",
    generatedAt: new Date("2026-07-11T14:00:00Z"),
    timezone: "America/New_York",
    reminders: ["Rotate credentials soon."],
    coverageWindow: { startTime: "2026-07-11T09:00:00Z", endTime: "2026-07-11T14:00:00Z" },
    sections: [section()],
  });

  assert.equal(message.subject, "Concrete Lead");
  assert.match(message.text, /Coverage: Sports <News>/);
  assert.match(message.text, /Source collection warnings/);
  assert.match(message.text, /Rotate credentials soon/);
  assert.match(message.html, /Sports &lt;News&gt;/);
  assert.match(message.html, /Source &lt;script&gt;alert\(&#039;x&#039;\)&lt;\/script&gt;/);
  assert.match(message.html, />@source<\/a>/);
  assert.doesNotMatch(message.html, /<script>/);
  assert.doesNotMatch(message.html, /undefined/);
});

test("credits-depleted notification includes action context without unescaped provider text", () => {
  const message = renderCreditsDepletedNotification({
    generatedAt: new Date("2026-07-11T14:00:00Z"),
    timezone: "America/New_York",
    error: { status: 402, title: "CreditsDepleted", accountId: "acct-1", detail: "Credits <empty>" },
  });

  assert.match(message.subject, /X API credits depleted/);
  assert.match(message.text, /acct-1/);
  assert.match(message.html, /Credits &lt;empty&gt;/);
  assert.doesNotMatch(message.html, /Credits <empty>/);
});

test("credits-depleted notification identifies OpenAI and links the correct billing action", () => {
  const message = renderCreditsDepletedNotification({
    generatedAt: new Date("2026-08-05T10:05:00Z"),
    timezone: "America/New_York",
    error: {
      provider: "OpenAI",
      status: 429,
      type: "insufficient_quota",
      code: "credit_balance_exhausted",
      detail: "You have no credits remaining.",
    },
  });

  assert.match(message.subject, /OpenAI API credits depleted/);
  assert.match(message.text, /platform\.openai\.com/);
  assert.match(message.html, /credit_balance_exhausted/);
  assert.doesNotMatch(message.html, /X account/);
});

test("subject rendering compacts supplied subjects and provides quiet fallbacks", () => {
  assert.equal(
    subjectForBriefing({ sections: [section()], subject: "Team wins league series and shipping slows" }),
    "Team Wins League, Shipping Slows",
  );
  assert.equal(
    subjectForBriefing({ sections: [{ id: "market-example", title: "Markets", summary: "No reliable update." }] }),
    "Markets Quiet",
  );
  assert.equal(headingForBriefing("Executive readout: Concrete lead"), "Concrete lead");
});

test("source-card module renders text metrics and escaped HTML independently", () => {
  const item = section();
  const generatedAt = new Date("2026-07-11T14:00:00Z");
  assert.equal(sourceStats(item), "1 cited posts from 1 signal posts / 2 new posts analyzed");
  assert.match(textForPost(item.posts[0], "America/New_York", generatedAt), /Metrics: 3 likes, 2 reposts, 1 replies/);

  const html = renderSourceCardsHtml(item, "America/New_York", generatedAt);
  assert.match(html, /Source &lt;script&gt;/);
  assert.match(html, /Open tweet/);
  assert.doesNotMatch(html, /<script>/);
});

test("source cards distinguish the collected tweet from referenced tweets", () => {
  const item = section();
  item.posts[0].referencedPosts = [{ type: "quoted", url: "https://x.com/i/web/status/456" }];
  const generatedAt = new Date("2026-07-11T14:00:00Z");
  assert.match(textForPost(item.posts[0], "America/New_York", generatedAt), /Referenced quoted: https:\/\/x.com\/i\/web\/status\/456/);
  assert.match(renderSourceCardsHtml(item, "America/New_York", generatedAt), /Referenced quoted post/);
});

test("HTML markdown conversion names publications and avoids generic source labels", () => {
  const html = markdownToHtml(
    "## Notable items\n- **Confirmed** [source](https://www.reuters.com/item) and https://example.com/long-token.",
  );
  assert.match(html, /<h3/);
  assert.match(html, /<ul/);
  assert.match(html, /<strong>Confirmed<\/strong>/);
  assert.match(html, /href="https:\/\/www.reuters.com\/item"/);
  assert.match(html, /href="https:\/\/example.com\/long-token"/);
  assert.match(html, />Reuters<\/a>/);
  assert.match(html, />example.com<\/a>/);
  assert.doesNotMatch(html, />source<\/a>/);
  assert.doesNotMatch(html, />https:\/\//);
});

test("HTML markdown conversion relabels legacy source citations with X accounts", () => {
  const post = section().posts[0];
  const html = markdownToHtml(`[source](${post.url})`, [post]);
  assert.match(html, />@source<\/a>/);
  assert.doesNotMatch(html, />source<\/a>/);
});
