import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname } from "node:path";

const DEFAULT_STATE = {
  version: 1,
  updatedAt: null,
  seenPostIds: [],
  queries: {},
  topics: {},
};

const MAX_SEEN_POST_IDS = 5000;

function queryKey(query) {
  return createHash("sha256").update(query).digest("hex").slice(0, 16);
}

function maxTweetId(ids) {
  return ids.reduce((max, id) => {
    if (!id) return max;
    if (!max) return id;
    return BigInt(id) > BigInt(max) ? id : max;
  }, undefined);
}

export function loadBriefingState(path) {
  if (!existsSync(path)) return { ...DEFAULT_STATE };

  try {
    const state = JSON.parse(readFileSync(path, "utf8"));
    return {
      ...DEFAULT_STATE,
      ...state,
      seenPostIds: Array.isArray(state.seenPostIds) ? state.seenPostIds : [],
      queries: state.queries && typeof state.queries === "object" ? state.queries : {},
      topics: state.topics && typeof state.topics === "object" ? state.topics : {},
    };
  } catch (error) {
    throw new Error(`Unable to read briefing state file "${path}": ${error.message}`);
  }
}

export function isSeenPost(state, postId) {
  return state.seenPostIds.includes(postId);
}

export function sinceIdForQuery(state, query) {
  return state.queries[queryKey(query)]?.sinceId;
}

export function updatedAtForQuery(state, query) {
  return state.queries[queryKey(query)]?.updatedAt;
}

export function lastRunAtForTopic(state, topicId) {
  return state.topics[topicId]?.lastRunAt;
}

export function noteFetchedPosts(state, query, posts) {
  const key = queryKey(query);
  const ids = posts.map((post) => post.id).filter(Boolean);
  const sinceId = maxTweetId([state.queries[key]?.sinceId, ...ids]);

  if (sinceId) {
    state.queries[key] = {
      sinceId,
      updatedAt: new Date().toISOString(),
    };
  }

  const seen = new Set([...state.seenPostIds, ...ids]);
  state.seenPostIds = [...seen]
    .sort((a, b) => {
      if (BigInt(a) === BigInt(b)) return 0;
      return BigInt(a) > BigInt(b) ? -1 : 1;
    })
    .slice(0, MAX_SEEN_POST_IDS);
  state.updatedAt = new Date().toISOString();
}

export function noteTopicRun(state, topicId, ranAt) {
  state.topics[topicId] = {
    ...state.topics[topicId],
    lastRunAt: ranAt instanceof Date ? ranAt.toISOString() : new Date(ranAt).toISOString(),
    updatedAt: new Date().toISOString(),
  };
  state.updatedAt = new Date().toISOString();
}

export function saveBriefingState(path, state) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(`${path}.tmp`, `${JSON.stringify(state, null, 2)}\n`);
  renameSync(`${path}.tmp`, path);
}
