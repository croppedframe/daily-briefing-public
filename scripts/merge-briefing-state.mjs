import { readFileSync, writeFileSync } from "node:fs";

const MAX_SEEN_POST_IDS = 5000;

function readState(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function maxTweetId(left, right) {
  if (!left) return right;
  if (!right) return left;
  return BigInt(left) > BigInt(right) ? left : right;
}

function latestTimestamp(left, right) {
  return [left, right].filter(Boolean).sort().at(-1) || null;
}

function mergeQueries(left = {}, right = {}) {
  const merged = { ...left };

  for (const [key, value] of Object.entries(right)) {
    const existing = merged[key];
    if (!existing) {
      merged[key] = value;
      continue;
    }

    merged[key] = {
      ...existing,
      ...value,
      sinceId: maxTweetId(existing.sinceId, value.sinceId),
      updatedAt: latestTimestamp(existing.updatedAt, value.updatedAt),
    };
  }

  return merged;
}

function mergeTopics(left = {}, right = {}) {
  const merged = { ...left };

  for (const [key, value] of Object.entries(right)) {
    const existing = merged[key];
    if (!existing) {
      merged[key] = value;
      continue;
    }

    merged[key] = {
      ...existing,
      ...value,
      lastRunAt: latestTimestamp(existing.lastRunAt, value.lastRunAt),
      updatedAt: latestTimestamp(existing.updatedAt, value.updatedAt),
    };
  }

  return merged;
}

export function mergeBriefingStates(left, right) {
  const seenPostIds = [...new Set([...(left.seenPostIds || []), ...(right.seenPostIds || [])])]
    .sort((a, b) => {
      if (BigInt(a) === BigInt(b)) return 0;
      return BigInt(a) > BigInt(b) ? -1 : 1;
    })
    .slice(0, MAX_SEEN_POST_IDS);

  return {
    version: Math.max(left.version || 1, right.version || 1),
    updatedAt: latestTimestamp(left.updatedAt, right.updatedAt),
    seenPostIds,
    queries: mergeQueries(left.queries, right.queries),
    topics: mergeTopics(left.topics, right.topics),
  };
}

function main() {
  const [, , leftPath, rightPath, outputPath = rightPath] = process.argv;
  if (!leftPath || !rightPath) {
    throw new Error("Usage: node scripts/merge-briefing-state.mjs <left-state.json> <right-state.json> [output-state.json]");
  }

  const merged = mergeBriefingStates(readState(leftPath), readState(rightPath));
  writeFileSync(outputPath, `${JSON.stringify(merged, null, 2)}\n`);

  console.log(
    `Merged briefing state: ${merged.seenPostIds.length} seen post IDs, ${Object.keys(merged.queries).length} query cursors, ${Object.keys(merged.topics).length} topic cursors.`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
