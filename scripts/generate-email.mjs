import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { loadConfig } from "../src/config.js";
import { fetchMarketContext } from "../src/marketData.js";
import { fetchNewsContext } from "../src/newsContext.js";
import { selectSignalPosts, sourcePostsForSection } from "../src/postFilter.js";
import { renderBriefing } from "../src/render.js";
import { fetchSportsContext } from "../src/sportsData.js";
import { summarizeTopic, synthesizeBriefingSubject } from "../src/summarizer.js";
import { fetchRecentXPosts } from "../src/xClient.js";

function writeFile(path, contents) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

function crlf(value) {
  return String(value).replace(/\r?\n/g, "\r\n");
}

function emlMessage({ subject, text, html, generatedAt }) {
  const boundary = `daily-briefing-generated-${generatedAt.getTime()}`;

  return crlf([
    "From: Daily Briefing Preview <briefing@example.com>",
    "To: Preview Reader <reader@example.com>",
    `Subject: ${subject}`,
    `Date: ${generatedAt.toUTCString()}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    text,
    "",
    `--${boundary}`,
    "Content-Type: text/html; charset=utf-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    html,
    "",
    `--${boundary}--`,
    "",
  ].join("\n"));
}

function emptyHealth(topic) {
  return {
    id: topic.id,
    title: topic.title,
    queriesAttempted: 0,
    queriesSucceeded: 0,
    queriesFailed: 0,
    queriesSkipped: 0,
    pagesFetched: 0,
    fetchedPosts: 0,
    alreadySeenPosts: 0,
    collectedPosts: 0,
    signalPosts: 0,
    citedPosts: 0,
    collectionWarnings: 0,
  };
}

function totals(healthTopics) {
  return healthTopics.reduce(
    (memo, topic) => ({
      queriesAttempted: memo.queriesAttempted + topic.queriesAttempted,
      queriesSucceeded: memo.queriesSucceeded + topic.queriesSucceeded,
      queriesFailed: memo.queriesFailed + topic.queriesFailed,
      queriesSkipped: memo.queriesSkipped + topic.queriesSkipped,
      pagesFetched: memo.pagesFetched + topic.pagesFetched,
      fetchedPosts: memo.fetchedPosts + topic.fetchedPosts,
      alreadySeenPosts: memo.alreadySeenPosts + topic.alreadySeenPosts,
      collectedPosts: memo.collectedPosts + topic.collectedPosts,
      signalPosts: memo.signalPosts + topic.signalPosts,
      citedPosts: memo.citedPosts + topic.citedPosts,
      collectionWarnings: memo.collectionWarnings + topic.collectionWarnings,
    }),
    {
      queriesAttempted: 0,
      queriesSucceeded: 0,
      queriesFailed: 0,
      queriesSkipped: 0,
      pagesFetched: 0,
      fetchedPosts: 0,
      alreadySeenPosts: 0,
      collectedPosts: 0,
      signalPosts: 0,
      citedPosts: 0,
      collectionWarnings: 0,
    },
  );
}

async function collectXPosts({ config, topic, health, collectionWarnings }) {
  const queries = [
    topic.trustedQuery ? { type: "trusted", query: topic.trustedQuery } : undefined,
    topic.query ? { type: "broad", query: topic.query } : undefined,
  ].filter(Boolean);

  if (queries.length === 0) return [];

  if (!config.x.bearerToken) {
    health.queriesSkipped += queries.length;
    collectionWarnings.push("X collection skipped because X_BEARER_TOKEN is not set.");
    return [];
  }

  const rawPosts = [];
  for (const { query } of queries) {
    health.queriesAttempted += 1;

    try {
      const result = await fetchRecentXPosts({
        bearerToken: config.x.bearerToken,
        query,
        maxResults: topic.searchMaxPosts || topic.maxPosts,
        maxPages: topic.maxPages,
        lookbackHours: topic.lookbackHours || config.briefing.lookbackHours,
      });

      rawPosts.push(...result.posts);
      health.queriesSucceeded += 1;
      health.pagesFetched += result.pagesFetched;
      health.fetchedPosts += result.posts.length;
    } catch (error) {
      health.queriesFailed += 1;
      collectionWarnings.push(`X source collection failed for query "${query}": ${error.message}`);
    }
  }

  return rawPosts;
}

async function collectSection({ config, topic, generatedAt, openAiUsageCalls }) {
  const health = emptyHealth(topic);
  const collectionWarnings = [];
  const rawPosts = await collectXPosts({ config, topic, health, collectionWarnings });
  const posts = selectSignalPosts(topic, rawPosts);
  const marketContext = await fetchMarketContext(topic.marketData);
  const newsContext = await fetchNewsContext(topic.news);
  const sportsContext = await fetchSportsContext(topic.sportsData, {
    generatedAt,
    timezone: config.briefing.timezone,
  });

  const summary = await summarizeTopic({
    apiKey: config.openai.apiKey,
    model: config.openai.model,
    topic,
    posts,
    marketContext,
    newsContext,
    sportsContext,
    collectionWarnings,
    usageSink: (usage) => openAiUsageCalls.push(usage),
  });
  const citedPosts = sourcePostsForSection(topic, posts, summary);

  health.collectedPosts = rawPosts.length;
  health.signalPosts = posts.length;
  health.citedPosts = citedPosts.length;
  health.collectionWarnings = collectionWarnings.length;

  return {
    id: topic.id,
    title: topic.title,
    label: topic.label,
    summary,
    posts: citedPosts,
    rawPostCount: rawPosts.length,
    signalPostCount: posts.length,
    marketContext,
    newsContext,
    sportsContext,
    collectionWarnings,
    health,
  };
}

const config = loadConfig();
const generatedAt = config.briefing.generatedAt ? new Date(config.briefing.generatedAt) : new Date();
const openAiUsageCalls = [];
const sections = [];

for (const topic of config.briefing.topics) {
  const section = await collectSection({ config, topic, generatedAt, openAiUsageCalls });
  sections.push(section);
}

let subject;
try {
  subject = await synthesizeBriefingSubject({
    apiKey: config.openai.apiKey,
    model: config.openai.model,
    sections,
    usageSink: (usage) => openAiUsageCalls.push(usage),
  });
} catch (error) {
  console.warn(`Subject generation failed; using fallback subject: ${error.message}`);
}

const runHealth = {
  stateSaveEnabled: false,
  stateUpdatedAtBeforeRun: "not loaded for local generation",
  seenPostIdsBeforeRun: 0,
  topics: sections.map((section) => section.health),
};
runHealth.totals = totals(runHealth.topics);

const message = renderBriefing({
  subject,
  generatedAt,
  timezone: config.briefing.timezone,
  runHealth,
  coverageWindow: {
    startTime: config.briefing.startTime,
    endTime: config.briefing.endTime,
  },
  sections,
});

const stamp = generatedAt.toISOString().replace(/[:.]/g, "-");
const base = `generated/briefing-${stamp}`;
writeFile(`${base}.html`, message.html);
writeFile(`${base}.txt`, message.text);
writeFile(`${base}.eml`, emlMessage({ ...message, generatedAt }));
writeFile("generated/latest.html", message.html);
writeFile("generated/latest.txt", message.text);
writeFile("generated/latest.eml", emlMessage({ ...message, generatedAt }));

console.log("Generated live local email artifacts:");
console.log(`- ${base}.html`);
console.log(`- ${base}.txt`);
console.log(`- ${base}.eml`);
console.log("- generated/latest.html");
console.log("- generated/latest.txt");
console.log("- generated/latest.eml");
console.log("");
console.log("No SMTP send happened, and briefing state was not loaded or saved.");
