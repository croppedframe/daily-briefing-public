import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { loadConfig } from "./config.js";
import { renderBriefing } from "./render.js";

function samplePost(topic, generatedAt) {
  const createdAt = new Date(generatedAt.getTime() - 2 * 60 * 60 * 1000).toISOString();
  const id = "1234567890123456789";

  return {
    id,
    text: `Sample source post for ${topic.title}. This preview does not call X, OpenAI, SMTP, or market data providers.`,
    createdAt,
    url: `https://x.com/i/web/status/${id}`,
    author: {
      name: "Preview Source",
      username: "preview",
    },
    metrics: {
      likes: 12,
      reposts: 3,
      replies: 2,
    },
  };
}

function sampleMarketContext(topic) {
  const symbol = topic.marketData?.symbol?.toUpperCase();
  if (!symbol) return undefined;

  return [
    `Ticker: ${symbol}`,
    "Latest/intraday price: $42.00 (+0.50, +1.20% vs previous close $41.50)",
    "Prior completed daily move: $40.75 -> $41.50 (+0.75, +1.84%) on 2026-06-18",
    "Use this as market context, not as a standalone catalyst unless paired with a sourced development.",
  ].join("\n");
}

function sampleSportsContext(topic) {
  if (!topic.sportsData) return undefined;

  return {
    type: "mlb",
    teamId: topic.sportsData.teamId,
    teamName: topic.sportsData.teamName,
    window: {
      startDate: "2026-06-19",
      endDate: "2026-06-25",
    },
    recentResults: [
      {
        date: "Jun 21, 1:35 PM EDT",
        matchup: "Boston Red Sox at San Francisco Giants",
        score: "5-3",
        status: "Final",
        note: "W: Preview Pitcher; SV: Preview Closer",
      },
    ],
    nextGames: [
      {
        date: "Jun 23, 7:10 PM EDT",
        matchup: "Boston Red Sox at Los Angeles Angels",
        probablePitchers: "TBD vs TBD",
        venue: "Angel Stadium",
      },
    ],
    standings: [
      { team: "New York Yankees", record: "46-31", pct: ".597", gamesBack: "-", streak: "W2" },
      { team: "Boston Red Sox", record: "40-37", pct: ".519", gamesBack: "6.0", streak: "W1", highlight: true },
      { team: "Tampa Bay Rays", record: "39-38", pct: ".506", gamesBack: "7.0", streak: "L1" },
    ],
    text: "Sports data preview.",
  };
}

function sampleHealth(topic) {
  return {
    id: topic.id,
    title: topic.title,
    queriesAttempted: Number(Boolean(topic.trustedQuery)) + Number(Boolean(topic.query)),
    queriesSucceeded: Number(Boolean(topic.trustedQuery)) + Number(Boolean(topic.query)),
    queriesFailed: 0,
    queriesSkipped: 0,
    pagesFetched: Number(Boolean(topic.trustedQuery)) + Number(Boolean(topic.query)),
    fetchedPosts: 4,
    alreadySeenPosts: 1,
    collectedPosts: 3,
    signalPosts: 1,
    citedPosts: 1,
    collectionWarnings: 0,
  };
}

function totals(topics) {
  return topics.reduce(
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

function writeFile(path, contents) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

const config = loadConfig();
const generatedAt = new Date();
const healthTopics = config.briefing.topics.map(sampleHealth);

const sections = config.briefing.topics.map((topic) => {
  const post = samplePost(topic, generatedAt);
  return {
    id: topic.id,
    title: topic.title,
    label: topic.label,
    summary: [
      "Executive readout",
      "- Preview render only; no live collection ran.",
      "",
      "Notable items",
      "- Source formatting, local time display, status IDs, and source counts are visible here.",
      "",
      "Why this matters",
      "- This lets you review the email layout without burning API calls or sending yourself a test email.",
      "",
      "Watch next",
      "- Run the real briefing when the preview shape looks right.",
    ].join("\n"),
    posts: [post],
    rawPostCount: 3,
    signalPostCount: 1,
    marketContext: sampleMarketContext(topic),
    sportsContext: sampleSportsContext(topic),
    newsContext: undefined,
    collectionWarnings: [],
    health: sampleHealth(topic),
  };
});

const message = renderBriefing({
  generatedAt,
  timezone: config.briefing.timezone,
  runHealth: {
    stateSaveEnabled: true,
    stateUpdatedAtBeforeRun: "preview only",
    seenPostIdsBeforeRun: 788,
    topics: healthTopics,
    totals: totals(healthTopics),
  },
  sections,
});

writeFile("data/preview.html", message.html);
writeFile("data/preview.txt", message.text);

console.log("Preview written to data/preview.html and data/preview.txt");
