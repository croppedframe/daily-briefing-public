import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { loadConfig } from "../src/config.js";
import { renderBriefing } from "../src/render.js";

function writeFile(path, contents) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

function crlf(value) {
  return String(value).replace(/\r?\n/g, "\r\n");
}

function emlMessage({ subject, text, html, generatedAt }) {
  const boundary = `daily-briefing-example-${generatedAt.getTime()}`;

  return crlf([
    "From: Daily Briefing Example <briefing@example.com>",
    "To: Example Reader <reader@example.com>",
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

function post(id, topicTitle, generatedAt) {
  const createdAt = new Date(generatedAt.getTime() - 2 * 60 * 60 * 1000).toISOString();

  return {
    id,
    text: `Example source post for ${topicTitle}. This local example does not call X, OpenAI, SMTP, market data, sports data, or news providers.`,
    createdAt,
    url: `https://x.com/i/web/status/${id}`,
    author: {
      name: "Example Source",
      username: "example",
    },
    metrics: {
      likes: 128,
      reposts: 24,
      replies: 9,
    },
  };
}

const generatedAt = new Date("2026-06-23T13:30:00-04:00");
const config = loadConfig();

const sections = [
  {
    id: "boston-red-sox",
    label: "SOX",
    title: "Boston Red Sox",
    summary: [
      "Executive readout",
      "- The example render leads with structured sports context: recent result, next game, and AL East table.",
      "",
      "Notable items",
      "- Roster and injury notes would be sourced from trusted team, MLB, or beat-reporter posts.",
      "- Game results and standings come from structured sports data, so they do not need social citations.",
      "",
      "Why this matters",
      "- The section demonstrates how sports tables and source cards sit together in the email.",
      "",
      "Watch next",
      "- Probable starters, bullpen availability, roster moves, and AL East movement.",
    ].join("\n"),
    posts: [post("1234567890123456781", "Boston Red Sox", generatedAt)],
    rawPostCount: 9,
    signalPostCount: 4,
    sportsContext: {
      recentResults: [
        {
          date: "Jun 22, 7:10 PM EDT",
          matchup: "Boston Red Sox at Los Angeles Angels",
          score: "6-4",
          status: "Final",
          note: "W: Example Starter; SV: Example Closer",
        },
      ],
      nextGames: [
        {
          date: "Jun 23, 9:38 PM EDT",
          matchup: "Boston Red Sox at Los Angeles Angels",
          probablePitchers: "TBD vs TBD",
          venue: "Angel Stadium",
        },
      ],
      standings: [
        { team: "New York Yankees", record: "46-31", pct: ".597", gamesBack: "-", streak: "W2" },
        { team: "Boston Red Sox", record: "40-37", pct: ".519", gamesBack: "6.0", streak: "W1", highlight: true },
        { team: "Tampa Bay Rays", record: "39-38", pct: ".506", gamesBack: "7.0", streak: "L1" },
        { team: "Toronto Blue Jays", record: "38-39", pct: ".494", gamesBack: "8.0", streak: "W1" },
        { team: "Baltimore Orioles", record: "33-44", pct: ".429", gamesBack: "13.0", streak: "L2" },
      ],
    },
    marketContext: undefined,
    collectionWarnings: [],
  },
  {
    id: "sp500-market",
    label: "SPY",
    title: "S&P 500 Market",
    summary: [
      "Executive readout",
      "- SPY is modestly higher in this example, with price action shown as context rather than a standalone catalyst.",
      "",
      "Notable items",
      "- Market-news context would focus on Fed, inflation, yields, earnings, and broad index drivers.",
      "- The default public topic avoids broad X search because market social feeds are noisy.",
      "",
      "Why this matters",
      "- The section shows how the same briefing can mix sports tables and market context cleanly.",
      "",
      "Watch next",
      "- Fed-rate expectations, Treasury yields, earnings breadth, volatility, and index concentration.",
    ].join("\n"),
    posts: [],
    rawPostCount: 0,
    signalPostCount: 0,
    marketContext: [
      "Ticker: SPY",
      "Latest/intraday price: $542.37 (+2.14, +0.40% vs previous close $540.23)",
      "Prior completed daily move: $538.50 -> $540.23 (+1.73, +0.32%) on 2026-06-22",
      "Use this as market context, not as a standalone catalyst unless paired with a sourced development.",
    ].join("\n"),
    collectionWarnings: [],
  },
];

const healthTopics = [
  {
    id: "boston-red-sox",
    title: "Boston Red Sox",
    queriesAttempted: 2,
    queriesSucceeded: 2,
    queriesFailed: 0,
    queriesSkipped: 0,
    pagesFetched: 2,
    fetchedPosts: 12,
    alreadySeenPosts: 3,
    collectedPosts: 9,
    signalPosts: 4,
    citedPosts: 1,
    collectionWarnings: 0,
  },
  {
    id: "sp500-market",
    title: "S&P 500 Market",
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
];

const totals = healthTopics.reduce(
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

const message = renderBriefing({
  subject: "Example Briefing: Red Sox Tables, SPY Price Action",
  generatedAt,
  timezone: config.briefing.timezone,
  runHealth: {
    stateSaveEnabled: false,
    stateUpdatedAtBeforeRun: "example only",
    seenPostIdsBeforeRun: 0,
    topics: healthTopics,
    totals,
  },
  coverageWindow: {
    startTime: "2026-06-22T13:30:00-04:00",
    endTime: "2026-06-23T13:30:00-04:00",
  },
  sections,
});

writeFile("examples/briefing.html", message.html);
writeFile("examples/briefing.txt", message.text);
writeFile("examples/briefing.eml", emlMessage({ ...message, generatedAt }));

console.log("Example files written:");
console.log("- examples/briefing.html");
console.log("- examples/briefing.txt");
console.log("- examples/briefing.eml");
