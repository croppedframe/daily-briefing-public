import assert from "node:assert/strict";
import test from "node:test";

import { mergeBriefingStates } from "../scripts/merge-briefing-state.mjs";
import { createSeenPostIndex, loadBriefingState, migrateBriefingState, noteFetchedPosts } from "../src/state.js";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("state merge unions seen IDs and keeps monotonic query and topic cursors", () => {
  const remote = {
    version: 1,
    updatedAt: "2026-07-11T10:00:00Z",
    seenPostIds: ["30", "20"],
    queries: { queryA: { sinceId: "300", updatedAt: "2026-07-11T10:00:00Z", metadata: "remote" } },
    topics: { topicA: { lastRunAt: "2026-07-11T09:00:00Z", updatedAt: "2026-07-11T10:00:00Z" } },
  };
  const local = {
    version: 2,
    updatedAt: "2026-07-11T11:00:00Z",
    seenPostIds: ["40", "20"],
    queries: { queryA: { sinceId: "250", updatedAt: "2026-07-11T11:00:00Z", localField: true } },
    topics: { topicA: { lastRunAt: "2026-07-11T08:00:00Z", updatedAt: "2026-07-11T11:00:00Z" } },
  };

  const merged = mergeBriefingStates(remote, local);
  assert.equal(merged.version, 2);
  assert.deepEqual(merged.seenPostIds, ["40", "30", "20"]);
  assert.deepEqual(merged.queries.queryA, {
    sinceId: "300",
    updatedAt: "2026-07-11T11:00:00Z",
    metadata: "remote",
    localField: true,
  });
  assert.equal(merged.topics.topicA.lastRunAt, "2026-07-11T09:00:00Z");
  assert.equal(merged.topics.topicA.updatedAt, "2026-07-11T11:00:00Z");
});

test("state merge caps seen IDs at the newest 5000", () => {
  const older = Array.from({ length: 3000 }, (_, index) => String(index + 1));
  const newer = Array.from({ length: 3000 }, (_, index) => String(index + 3001));
  const merged = mergeBriefingStates({ seenPostIds: older }, { seenPostIds: newer });

  assert.equal(merged.seenPostIds.length, 5000);
  assert.equal(merged.seenPostIds[0], "6000");
  assert.equal(merged.seenPostIds.at(-1), "1001");
});

test("v1 state migrates to v2 without losing cursors", () => {
  const migrated = migrateBriefingState({
    version: 1,
    seenPostIds: ["10"],
    queries: { oldKey: { sinceId: "10", updatedAt: "2026-07-10T00:00:00Z" } },
    topics: { topic: { lastRunAt: "2026-07-10T00:00:00Z" } },
  });

  assert.equal(migrated.version, 2);
  assert.equal(migrated.queries.oldKey.sinceId, "10");
  assert.deepEqual(migrated.queries.oldKey.metadata, undefined);

  const dir = mkdtempSync(join(tmpdir(), "briefing-state-"));
  const path = join(dir, "state.json");
  writeFileSync(path, JSON.stringify({ version: 1, queries: { oldKey: { sinceId: "10" } } }));
  assert.equal(loadBriefingState(path).version, 2);
});

test("new query cursors retain ownership metadata", () => {
  const state = migrateBriefingState({});
  noteFetchedPosts(state, "from:example", [{ id: "20" }], {
    topicId: "example-topic",
    type: "trusted",
    label: "@example",
    query: "from:example -is:retweet",
  });

  const record = Object.values(state.queries)[0];
  assert.deepEqual(record.metadata, {
    topicId: "example-topic",
    type: "trusted",
    label: "@example",
    query: "from:example -is:retweet",
  });
});

test("per-run seen-post index supports constant-time membership and incremental additions", () => {
  const index = createSeenPostIndex({ seenPostIds: ["10", "20"] });

  assert.equal(index.has("10"), true);
  assert.equal(index.has("30"), false);
  index.add([{ id: "30" }, { id: "40" }]);
  assert.equal(index.has("30"), true);
  assert.equal(index.has("40"), true);
});

test("new state instances do not share mutable query or topic containers", () => {
  const dir = mkdtempSync(join(tmpdir(), "briefing-fresh-state-"));
  const first = loadBriefingState(join(dir, "first.json"));
  const second = loadBriefingState(join(dir, "second.json"));
  first.queries.example = { sinceId: "123" };
  first.topics.example = { lastRunAt: "2026-10-18T00:00:00Z" };
  first.seenPostIds.push("123");
  assert.deepEqual(second.queries, {});
  assert.deepEqual(second.topics, {});
  assert.deepEqual(second.seenPostIds, []);
});
