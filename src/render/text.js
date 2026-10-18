import { renderSportsContextText } from "./sports.js";
import { displayTitle, marketContextLines, plural, signalRatio, summaryForDisplay } from "./utils.js";
import { sourceStats, textForPost } from "./sourceCards.js";

function renderMarketContextText(marketContext) {
  const lines = marketContextLines(marketContext);
  return lines.length === 0 ? [] : ["Price action", ...lines.map((line) => `- ${line}`), ""];
}

function renderRunHealthText(runHealth) {
  if (!runHealth?.totals) return [];
  const totals = runHealth.totals;
  const warningText = totals.collectionWarnings ? `; ${totals.collectionWarnings} warnings` : "";
  const skippedQueries = `${totals.queriesSkipped} ${plural(totals.queriesSkipped, "query", "queries")}`;
  return [
    "Operations",
    `${totals.fetchedPosts} X posts fetched; ${totals.signalPosts} signal (${signalRatio(totals.signalPosts, totals.fetchedPosts)}); ${totals.citedPosts} cited; ${skippedQueries} skipped by cost controls${warningText}.`,
    "For full retrieval, token, and cost metrics, run npm run dashboard within your local repository.",
    "",
  ];
}

export function renderBriefingText({ heading, generatedAtText, coverageWindowText, coverage, timezone, generatedAt, reminders, runHealth, sections }) {
  return [
    "Daily Briefing",
    heading,
    `Generated: ${generatedAtText}`,
    ...(coverageWindowText ? [`Coverage window: ${coverageWindowText}`] : []),
    `Coverage: ${coverage}`,
    "",
    ...sections.flatMap((section) => [
      displayTitle(section),
      "=".repeat(displayTitle(section).length),
      "",
      ...renderMarketContextText(section.marketContext),
      ...renderSportsContextText(section.sportsContext),
      summaryForDisplay(section.summary),
      "",
      ...(section.collectionWarnings?.length
        ? ["Source collection warnings", ...section.collectionWarnings.map((warning) => `- ${warning}`), ""]
        : []),
      `Sources (${sourceStats(section)})`,
      ...(section.posts.length > 0
        ? section.posts.map((post) => `- ${textForPost(post, timezone, generatedAt).replace(/\n/g, "\n  ")}`)
        : ["- No source posts were cited in the final summary."]),
      "",
    ]),
    ...renderRunHealthText(runHealth),
    ...(reminders.length > 0 ? ["Operational reminders", ...reminders.map((reminder) => `- ${reminder}`), ""] : []),
  ].join("\n");
}
