import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname } from "node:path";

export const CURRENT_STATE_VERSION = 2;

const DEFAULT_STATE = {
  version: CURRENT_STATE_VERSION,
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

function normalizeQueryRecord(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) return {};
  const normalized = { ...record };
  if (record.metadata && typeof record.metadata === "object" && !Array.isArray(record.metadata)) {
    normalized.metadata = { ...record.metadata };
  }
  return normalized;
}

export function migrateBriefingState(state) {
  const migrated = {
    ...DEFAULT_STATE,
    ...state,
    version: CURRENT_STATE_VERSION,
    seenPostIds: Array.isArray(state?.seenPostIds) ? state.seenPostIds : [],
    queries: {},
    topics: state?.topics && typeof state.topics === "object" && !Array.isArray(state.topics) ? state.topics : {},
  };

  const sourceQueries = state?.queries && typeof state.queries === "object" && !Array.isArray(state.queries)
    ? state.queries
    : {};
  for (const [key, record] of Object.entries(sourceQueries)) migrated.queries[key] = normalizeQueryRecord(record);
  return migrated;
}

export function loadBriefingState(path) {
  if (!existsSync(path)) return migrateBriefingState({});

  try {
    const state = JSON.parse(readFileSync(path, "utf8"));
    return migrateBriefingState(state);
  } catch (error) {
    throw new Error(`Unable to read briefing state file "${path}": ${error.message}`);
  }
}

export function isSeenPost(state, postId) {
  return state.seenPostIds.includes(postId);
}

export function createSeenPostIndex(state) {
  const seenPostIds = new Set(state.seenPostIds);
  return {
    has(postId) {
      return seenPostIds.has(postId);
    },
    add(posts) {
      for (const post of posts) {
        if (post?.id) seenPostIds.add(post.id);
      }
    },
  };
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

export function noteFetchedPosts(state, query, posts, metadata = {}) {
  const key = queryKey(query);
  const ids = posts.map((post) => post.id).filter(Boolean);
  const existing = state.queries[key] || {};
  const sinceId = maxTweetId([existing.sinceId, ...ids]);

  if (sinceId) {
    state.queries[key] = {
      ...existing,
      sinceId,
      updatedAt: new Date().toISOString(),
      ...(Object.keys(metadata).length > 0 ? { metadata: { ...(existing.metadata || {}), ...metadata } } : {}),
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
