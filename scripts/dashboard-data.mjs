import { existsSync, readFileSync } from "node:fs";

export function readJsonl(path) {
  if (!existsSync(path)) return [];

  return readFileSync(path, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        return {
          version: 1,
          generatedAt: undefined,
          completedAt: undefined,
          subject: `Unparseable history line ${index + 1}`,
          parseError: error.message,
        };
      }
    });
}

export function readState(path) {
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return undefined;
  }
}

function num(value) {
  return Number.isFinite(value) ? value : 0;
}

export function summarizeRuns(runs) {
  return runs.reduce(
    (totals, run) => {
      const health = run.runHealth?.totals || {};
      const openAi = run.openAi || {};
      const costs = run.costs || {};
      return {
        runs: totals.runs + 1,
        fetchedPosts: totals.fetchedPosts + num(health.fetchedPosts),
        signalPosts: totals.signalPosts + num(health.signalPosts),
        citedPosts: totals.citedPosts + num(health.citedPosts),
        duplicatePosts: totals.duplicatePosts + num(health.alreadySeenPosts),
        queriesAttempted: totals.queriesAttempted + num(health.queriesAttempted),
        queriesSucceeded: totals.queriesSucceeded + num(health.queriesSucceeded),
        queriesFailed: totals.queriesFailed + num(health.queriesFailed),
        queriesSkipped: totals.queriesSkipped + num(health.queriesSkipped),
        pagesFetched: totals.pagesFetched + num(health.pagesFetched),
        openAiCalls: totals.openAiCalls + num(openAi.calls),
        inputTokens: totals.inputTokens + num(openAi.inputTokens),
        outputTokens: totals.outputTokens + num(openAi.outputTokens),
        totalTokens: totals.totalTokens + num(openAi.totalTokens),
        xCost: Number.isFinite(costs.x) ? totals.xCost + costs.x : totals.xCost,
        openAiCost: Number.isFinite(costs.openAi) ? totals.openAiCost + costs.openAi : totals.openAiCost,
        totalCost: Number.isFinite(costs.total) ? totals.totalCost + costs.total : totals.totalCost,
      };
    },
    {
      runs: 0, fetchedPosts: 0, signalPosts: 0, citedPosts: 0, duplicatePosts: 0,
      queriesAttempted: 0, queriesSucceeded: 0, queriesFailed: 0, queriesSkipped: 0,
      pagesFetched: 0, openAiCalls: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0,
      xCost: 0, openAiCost: 0, totalCost: 0,
    },
  );
}

export function buildDashboardData({ historyPath, statePath, costRates = {}, timezone = "America/New_York", generatedAt = new Date() }) {
  const runs = readJsonl(historyPath).sort((a, b) => new Date(a.generatedAt || 0) - new Date(b.generatedAt || 0));
  const state = readState(statePath);
  return {
    generatedAt: generatedAt instanceof Date ? generatedAt.toISOString() : new Date(generatedAt).toISOString(),
    historyFile: historyPath,
    stateFile: statePath,
    timezone,
    costRates,
    latest: runs.at(-1),
    state: state
      ? { updatedAt: state.updatedAt, seenPostIds: state.seenPostIds?.length || 0, queryCount: Object.keys(state.queries || {}).length }
      : undefined,
    totals: summarizeRuns(runs),
    runs,
  };
}
