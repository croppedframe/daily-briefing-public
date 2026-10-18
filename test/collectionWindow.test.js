import assert from "node:assert/strict";
import test from "node:test";

import { queryStartTime } from "../src/collectionWindow.js";
import { noteFetchedPosts, noteTopicRun, updatedAtForQuery } from "../src/state.js";

function emptyState() {
  return {
    version: 1,
    updatedAt: null,
    seenPostIds: [],
    queries: {},
    topics: {},
  };
}

test("a failed source retains the last successful topic window while successful sources use their own cursors", () => {
  const state = emptyState();
  const previousTopicRun = "2026-07-10T12:00:00.000Z";
  const successfulQuery = "from:successful-source -is:retweet";
  const failedQuery = "from:failed-source -is:retweet";

  noteTopicRun(state, "example-topic", previousTopicRun);
  noteFetchedPosts(state, successfulQuery, [{ id: "1950000000000000000" }]);

  const successfulCursor = updatedAtForQuery(state, successfulQuery);
  const generatedAt = new Date(new Date(successfulCursor).getTime() + 60_000);

  assert.equal(
    queryStartTime({ state, topicId: "example-topic", cursorKey: successfulQuery, generatedAt }),
    successfulCursor,
  );
  assert.equal(
    queryStartTime({ state, topicId: "example-topic", cursorKey: failedQuery, generatedAt }),
    previousTopicRun,
  );
});

test("an explicit backfill start time overrides all saved cursors", () => {
  const explicitStartTime = "2026-07-01T00:00:00Z";

  assert.equal(
    queryStartTime({
      explicitStartTime,
      state: emptyState(),
      topicId: "example-topic",
      cursorKey: "query",
      generatedAt: new Date("2026-07-11T00:00:00Z"),
    }),
    explicitStartTime,
  );
});
