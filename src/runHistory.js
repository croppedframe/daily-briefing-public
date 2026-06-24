import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

function num(value) {
  return Number.isFinite(value) ? value : 0;
}

export function aggregateOpenAiUsage(calls = []) {
  return calls.reduce(
    (totals, call) => {
      const usage = call.usage || {};
      return {
        calls: totals.calls + 1,
        inputTokens: totals.inputTokens + num(usage.inputTokens),
        outputTokens: totals.outputTokens + num(usage.outputTokens),
        totalTokens: totals.totalTokens + num(usage.totalTokens),
        byCall: [...totals.byCall, call],
      };
    },
    {
      calls: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      byCall: [],
    },
  );
}

export function estimateCosts({ runHealth, openAiUsage, costs }) {
  const xPosts = runHealth?.totals?.fetchedPosts || 0;
  const xCost =
    Number.isFinite(costs.xCostPerPost) && costs.xCostPerPost >= 0 ? xPosts * costs.xCostPerPost : undefined;

  const openAiInputCost =
    Number.isFinite(costs.openAiInputCostPer1M) && costs.openAiInputCostPer1M >= 0
      ? (openAiUsage.inputTokens / 1_000_000) * costs.openAiInputCostPer1M
      : undefined;
  const openAiOutputCost =
    Number.isFinite(costs.openAiOutputCostPer1M) && costs.openAiOutputCostPer1M >= 0
      ? (openAiUsage.outputTokens / 1_000_000) * costs.openAiOutputCostPer1M
      : undefined;
  const openAiCost =
    openAiInputCost === undefined || openAiOutputCost === undefined ? undefined : openAiInputCost + openAiOutputCost;

  return {
    x: xCost,
    openAi: openAiCost,
    total: xCost === undefined || openAiCost === undefined ? undefined : xCost + openAiCost,
    rates: {
      xCostPerPost: costs.xCostPerPost,
      openAiInputCostPer1M: costs.openAiInputCostPer1M,
      openAiOutputCostPer1M: costs.openAiOutputCostPer1M,
    },
  };
}

export function appendRunHistory(path, record) {
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${JSON.stringify(record)}\n`);
}
