import { topicIsDue } from "./cadence.js";
import { queryStartTime } from "./collectionWindow.js";
import { fetchMarketContext } from "./marketData.js";
import { fetchNewsContext } from "./newsContext.js";
import { selectSignalPosts, sourcePostsForSection } from "./postFilter.js";
import {
  createSeenPostIndex,
  noteFetchedPosts,
  sinceIdForQuery,
} from "./state.js";
import { fetchSportsContext } from "./sportsData.js";
import { summarizeTopic } from "./summarizer.js";
import { fetchRecentXPosts, XCreditsDepletedError } from "./xClient.js";

function broadQueryIsDue(config, topic, generatedAt) {
  if (!topic.broadQueryCadence) return true;
  return topicIsDue({ id: topic.id, cadence: topic.broadQueryCadence }, generatedAt, config.briefing.timezone);
}

export async function collectTopic(config, topic, state, generatedAt, openAiUsageCalls) {
  if (topic.kind !== "x-search") {
    throw new Error(`Unsupported topic kind "${topic.kind}" for topic "${topic.id}".`);
  }

  const queries = [
    topic.trustedQuery ? { type: "trusted", query: topic.trustedQuery, useSinceId: true } : undefined,
    topic.query ? { type: "broad", query: topic.query, useSinceId: Boolean(topic.broadQueryUseSinceId) } : undefined,
  ].filter(Boolean);
  const rawPosts = [];
  const collectionWarnings = [];
  const seenPostIndex = createSeenPostIndex(state);
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
      const cursorKey = query;
      const startTime = queryStartTime({
        explicitStartTime: config.briefing.startTime,
        state,
        topicId: topic.id,
        cursorKey,
        generatedAt,
      });
      const request = {
        bearerToken: config.x.bearerToken,
        maxResults: topic.searchMaxPosts || topic.maxPosts,
        maxPages: topic.maxPages,
        lookbackHours: topic.lookbackHours || config.briefing.lookbackHours,
        sinceId: useSinceId && !config.briefing.disableSinceId ? sinceIdForQuery(state, cursorKey) : undefined,
        startTime,
        endTime: config.briefing.endTime,
      };
      const result = await fetchRecentXPosts({ ...request, query });
      const fetchedPosts = result.posts;
      const newPosts = fetchedPosts.filter((post) => !seenPostIndex.has(post.id));
      rawPosts.push(...newPosts);
      health.queriesSucceeded += 1;
      health.pagesFetched += result.pagesFetched;
      health.fetchedPosts += fetchedPosts.length;
      health.alreadySeenPosts += fetchedPosts.length - newPosts.length;
      noteFetchedPosts(state, cursorKey, fetchedPosts, {
        topicId: topic.id,
        type,
        label: query,
        query,
      });
      seenPostIndex.add(fetchedPosts);
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
  const newsStartTime = queryStartTime({
    explicitStartTime: config.briefing.startTime,
    state,
    topicId: topic.id,
    cursorKey: `google-news:${topic.news?.query || topic.id}`,
    generatedAt,
  });
  const newsContext = await fetchNewsContext(topic.news, {
    startTime: newsStartTime,
    endTime: config.briefing.endTime || generatedAt.toISOString(),
  });
  const sportsContext = await fetchSportsContext(topic.sportsData, { generatedAt, timezone: config.briefing.timezone });
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
