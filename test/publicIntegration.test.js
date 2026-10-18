import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { collectTopic } from "../src/collection.js";
import { renderBriefing } from "../src/render.js";
import { migrateBriefingState } from "../src/state.js";

test("the shipped public topic configuration validates, including the news-only market topic", () => {
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", `
    import { loadConfig, validateConfig } from './src/config.js';
    const config = loadConfig();
    validateConfig(config);
    if (config.openai.model !== 'gpt-5.4-mini') throw new Error('Public model default changed');
    if (!config.briefing.topics.some(t => t.maxPosts === 0 && t.news)) throw new Error('Missing market example');
  `], { encoding: "utf8", env: {
    PATH: process.env.PATH, X_BEARER_TOKEN: "test-token", SMTP_HOST: "smtp.example.com",
    EMAIL_FROM: "sender@example.com", EMAIL_TO: "reader@example.com",
  } });
  assert.equal(result.status, 0, result.stderr);
});

test("collection preserves sports facts, supplied citations, news cutoffs and both email formats", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (value, options) => {
    const url = String(value);
    requests.push(url);
    if (url.includes("api.x.com")) return Response.json({ data: [], meta: {} });
    if (url.includes("news.google.com/rss/search")) return new Response(`<rss><channel>
      <item><title>Roster move</title><source>Example Sports</source><link>https://example.com/news/roster</link><pubDate>Sun, 18 Oct 2026 12:00:00 GMT</pubDate></item>
      <item><title>Too new</title><source>Example Sports</source><link>https://example.com/news/future</link><pubDate>Mon, 19 Oct 2026 12:00:00 GMT</pubDate></item>
      <item><title>Too old</title><source>Example Sports</source><link>https://example.com/news/old</link><pubDate>Sat, 17 Oct 2026 12:00:00 GMT</pubDate></item>
    </channel></rss>`);
    if (url.includes("/schedule?")) return Response.json({ dates: [{ games: [{
      gameDate: "2026-10-18T12:00:00Z", status: { abstractGameState: "Final", detailedState: "Final" },
      teams: { away: { team: { name: "Visitors" }, score: 2 }, home: { team: { name: "Boston" }, score: 4 } },
    }] }] });
    if (url.includes("/standings?")) return Response.json({ records: [] });
    if (url.includes("api.openai.com")) {
      const prompt = JSON.parse(options.body).input;
      assert.match(prompt, /Score: 2-4/);
      assert.match(prompt, /Direct publisher URL: https:\/\/example.com\/news\/roster/);
      assert.doesNotMatch(prompt, /Too new|Too old/);
      const sportsUrl = prompt.match(/Sports source URL: (\S+)/)[1];
      return Response.json({ output_text: `Boston won 4-2. [MLB](${sportsUrl})\nRoster move confirmed. [Example Sports](https://example.com/news/roster)` });
    }
    throw new Error(`Unexpected request: ${url}`);
  };
  try {
    const generatedAt = new Date("2026-10-18T15:00:00Z");
    const config = {
      x: { bearerToken: "test" }, openai: { apiKey: "test", model: "test" },
      briefing: { timezone: "America/New_York", lookbackHours: 24, startTime: "2026-10-18T00:00:00Z", endTime: generatedAt.toISOString(), disableSinceId: true },
    };
    const topic = {
      id: "sports", title: "Baseball", kind: "x-search", query: "baseball", maxPosts: 10,
      news: { query: "baseball", cautionPublishers: [] }, sportsData: { league: "mlb", teamId: 111 },
    };
    const section = await collectTopic(config, topic, migrateBriefingState({}), generatedAt, []);
    assert.equal(section.sportsContext.recentResults[0].score, "2-4");
    assert.equal(section.health.queriesSucceeded, 1);
    assert.match(section.summary, /Boston won 4-2/);
    assert.match(section.summary, /\[MLB\]\(https:\/\/statsapi.mlb.com/);
    const message = renderBriefing({ generatedAt, timezone: config.briefing.timezone, sections: [section] });
    for (const format of [message.text, message.html]) {
      assert.match(format, /Recent results/);
      assert.match(format, /2-4/);
      assert.match(format, /Boston won 4-2/);
    }
    assert.match(message.html, />Example Sports<\/a>/);
    assert.equal(requests.filter(url => url.includes("api.openai.com")).length, 1);
  } finally { globalThis.fetch = originalFetch; }
});
