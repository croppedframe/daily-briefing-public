import { loadConfig, validateConfig } from "./config.js";
import { sendEmail } from "./emailer.js";
import { renderBriefing, renderCreditsDepletedNotification } from "./render.js";
import { summarizeTopic, synthesizeBriefingSubject } from "./summarizer.js";
import { fetchRecentXPosts, XCreditsDepletedError } from "./xClient.js";
import { selectSignalPosts, sourcePostsForSection } from "./postFilter.js";
import { fetchMarketContext } from "./marketData.js";
import { fetchNewsContext } from "./newsContext.js";
import { fetchSportsContext } from "./sportsData.js";
import { isSeenPost, loadBriefingState, noteFetchedPosts, saveBriefingState, sinceIdForQuery } from "./state.js";
import { topicIsDue, topicsForRun } from "./cadence.js";
import { aggregateOpenAiUsage, appendRunHistory, estimateCosts } from "./runHistory.js";

function parseDateOnly(value) {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return undefined;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return { year, month, day };
}

function dateOnlyToUtcMs(date) {
  return Date.UTC(date.year, date.month - 1, date.day);
}

function formatDateOnly(date) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(new Date(dateOnlyToUtcMs(date)));
}

function operationalReminders(config, generatedAt) {
  const reminders = [];
  const patExpiresOn = parseDateOnly(config.briefing.schedulerPatExpiresOn);
  const patReminderDays = config.briefing.schedulerPatReminderDays;

  if (patExpiresOn) {
    const todayUtc = Date.UTC(generatedAt.getUTCFullYear(), generatedAt.getUTCMonth(), generatedAt.getUTCDate());
    const daysUntil = Math.ceil((dateOnlyToUtcMs(patExpiresOn) - todayUtc) / (24 * 60 * 60 * 1000));
    const dayText = daysUntil === 0 ? "today" : daysUntil < 0 ? `${Math.abs(daysUntil)} days ago` : `in ${daysUntil} days`;

    if (daysUntil <= patReminderDays) {
      reminders.push(`Scheduler GitHub PAT expires ${dayText} (${formatDateOnly(patExpiresOn)}).`);
    }
  }

  return reminders;
}

function createRunHealth(state, config) {
  return {
    stateSaveEnabled: config.briefing.saveState,
    stateUpdatedAtBeforeRun: state.updatedAt,
    seenPostIdsBeforeRun: state.seenPostIds.length,
    totals: undefined,
    topics: [],
  };
}

function runHealthTotals(runHealth) {
  return runHealth.topics.reduce(
    (totals, topic) => ({
      queriesAttempted: totals.queriesAttempted + topic.queriesAttempted,
      queriesSucceeded: totals.queriesSucceeded + topic.queriesSucceeded,
      queriesFailed: totals.queriesFailed + topic.queriesFailed,
      queriesSkipped: totals.queriesSkipped + topic.queriesSkipped,
      pagesFetched: totals.pagesFetched + topic.pagesFetched,
      fetchedPosts: totals.fetchedPosts + topic.fetchedPosts,
      alreadySeenPosts: totals.alreadySeenPosts + topic.alreadySeenPosts,
      collectedPosts: totals.collectedPosts + topic.collectedPosts,
      signalPosts: totals.signalPosts + topic.signalPosts,
      citedPosts: totals.citedPosts + topic.citedPosts,
      collectionWarnings: totals.collectionWarnings + topic.collectionWarnings,
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

function broadQueryIsDue(config, topic, generatedAt) {
  if (!topic.broadQueryCadence) return true;
  return topicIsDue({ id: topic.id, cadence: topic.broadQueryCadence }, generatedAt, config.briefing.timezone);
}

async function collectTopic(config, topic, state, generatedAt, openAiUsageCalls) {
  if (topic.kind !== "x-search") {
    throw new Error(`Unsupported topic kind "${topic.kind}" for topic "${topic.id}".`);
  }

  const queries = [
    topic.trustedQuery ? { type: "trusted", query: topic.trustedQuery, useSinceId: true } : undefined,
    topic.query ? { type: "broad", query: topic.query, useSinceId: Boolean(topic.broadQueryUseSinceId) } : undefined,
  ].filter(Boolean);
  const rawPosts = [];
  const collectionWarnings = [];
  const health = {
    id: topic.id,
    title: topic.title,
    queriesAttempted: queries.length,
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

  for (const { type, query, useSinceId } of queries) {
    if (type === "broad" && !broadQueryIsDue(config, topic, generatedAt)) {
      health.queriesSkipped += 1;
      continue;
    }

    if (
      type === "broad" &&
      Number.isFinite(topic.broadQuerySkipTrustedCount) &&
      rawPosts.length >= topic.broadQuerySkipTrustedCount
    ) {
      health.queriesSkipped += 1;
      continue;
    }

    try {
      const result = await fetchRecentXPosts({
        bearerToken: config.x.bearerToken,
        query,
        maxResults: topic.searchMaxPosts || topic.maxPosts,
        maxPages: topic.maxPages,
        lookbackHours: topic.lookbackHours || config.briefing.lookbackHours,
        sinceId: useSinceId && !config.briefing.disableSinceId ? sinceIdForQuery(state, query) : undefined,
        startTime: config.briefing.startTime,
        endTime: config.briefing.endTime,
      });
      const fetchedPosts = result.posts;
      const newPosts = fetchedPosts.filter((post) => !isSeenPost(state, post.id));
      rawPosts.push(...newPosts);
      health.queriesSucceeded += 1;
      health.pagesFetched += result.pagesFetched;
      health.fetchedPosts += fetchedPosts.length;
      health.alreadySeenPosts += fetchedPosts.length - newPosts.length;
      noteFetchedPosts(state, query, fetchedPosts);
    } catch (error) {
      if (error instanceof XCreditsDepletedError) throw error;

      const warning = `X source collection failed for query "${query}": ${error.message}`;
      collectionWarnings.push(warning);
      health.queriesFailed += 1;
      console.warn(warning);
    }
  }

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

async function sendCreditsDepletedNotification(config, error) {
  const message = renderCreditsDepletedNotification({
    generatedAt: new Date(),
    timezone: config.briefing.timezone,
    error,
  });

  const result = await sendEmail(config.email, message);
  console.log(`Credits depleted notification sent to ${config.email.to}: ${result.messageId || "ok"}`);
}

async function main() {
  const config = loadConfig();
  validateConfig(config);
  const state = loadBriefingState(config.briefing.stateFile);
  const runHealth = createRunHealth(state, config);
  const generatedAt = config.briefing.generatedAt ? new Date(config.briefing.generatedAt) : new Date();
  const topics = topicsForRun(config.briefing.topics, generatedAt, config.briefing.timezone, {
    runAllTopics: config.briefing.runAllTopics,
  });

  const sections = [];
  const openAiUsageCalls = [];
  for (const topic of topics) {
    const section = await collectTopic(config, topic, state, generatedAt, openAiUsageCalls);
    sections.push(section);
    runHealth.topics.push(section.health);
  }
  runHealth.totals = runHealthTotals(runHealth);

  let subject;
  try {
    subject = await synthesizeBriefingSubject({
      apiKey: config.openai.apiKey,
      model: config.openai.model,
      sections,
      usageSink: (usage) => openAiUsageCalls.push(usage),
    });
  } catch (error) {
    console.warn(`Briefing subject synthesis failed; using fallback subject: ${error.message}`);
  }
  const finalOpenAiUsage = aggregateOpenAiUsage(openAiUsageCalls);
  const finalCostEstimates = estimateCosts({
    runHealth,
    openAiUsage: finalOpenAiUsage,
    costs: config.briefing.costs,
  });

  const message = renderBriefing({
    subject,
    generatedAt,
    timezone: config.briefing.timezone,
    reminders: operationalReminders(config, generatedAt),
    runHealth,
    coverageWindow: {
      startTime: config.briefing.startTime,
      endTime: config.briefing.endTime,
    },
    sections,
  });

  const result = await sendEmail(config.email, message);
  try {
    appendRunHistory(config.briefing.runHistoryFile, {
      version: 1,
      generatedAt: generatedAt.toISOString(),
      completedAt: new Date().toISOString(),
      subject: message.subject,
      topics: sections.map((section) => ({
        id: section.id,
        title: section.title,
        label: section.label,
        rawPostCount: section.rawPostCount,
        signalPostCount: section.signalPostCount,
        citedPostCount: section.posts.length,
      })),
      runHealth,
      openAi: finalOpenAiUsage,
      costs: finalCostEstimates,
    });
  } catch (error) {
    console.warn(`Briefing sent, but run history was not recorded: ${error.message}`);
  }
  if (config.briefing.saveState) {
    saveBriefingState(config.briefing.stateFile, state);
    console.log(`Briefing sent to ${config.email.to}: ${result.messageId || "ok"}`);
  } else {
    console.log(`Briefing sent to ${config.email.to}: ${result.messageId || "ok"}; state save skipped.`);
  }
}

main().catch(async (error) => {
  if (error instanceof XCreditsDepletedError) {
    try {
      const config = loadConfig();
      validateConfig(config);
      await sendCreditsDepletedNotification(config, error);
    } catch (notificationError) {
      console.error("Failed to send credits depleted notification:");
      console.error(notificationError.stack || notificationError.message);
    }
  }

  console.error(error.stack || error.message);
  process.exitCode = 1;
});
