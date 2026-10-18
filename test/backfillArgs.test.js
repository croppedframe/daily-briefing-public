import assert from "node:assert/strict";
import test from "node:test";

import { parseBackfillArgs } from "../src/backfillArgs.js";

test("backfill arguments default to safe exact-window behavior", () => {
  assert.deepEqual(parseBackfillArgs(["--start", "2026-07-10T00:00:00Z", "--end", "2026-07-11T00:00:00Z"]), {
    start: "2026-07-10T00:00:00.000Z",
    end: "2026-07-11T00:00:00.000Z",
    generatedAt: "2026-07-11T00:00:00.000Z",
    topicsFile: undefined,
    execute: false,
    saveState: false,
    disableSinceId: true,
    runAllTopics: false,
  });
});

test("backfill requires ordered timestamps and explicit execution", () => {
  assert.throws(() => parseBackfillArgs(["--start", "2026-07-11T00:00:00Z", "--end", "2026-07-10T00:00:00Z"]), /earlier/);
  const options = parseBackfillArgs([
    "--start", "2026-07-10T00:00:00Z", "--end", "2026-07-11T00:00:00Z",
    "--execute", "--save-state", "--all-topics", "--use-since-id", "--topics-file", "examples/topics.json",
  ]);
  assert.equal(options.execute, true);
  assert.equal(options.saveState, true);
  assert.equal(options.disableSinceId, false);
  assert.equal(options.runAllTopics, true);
  assert.equal(options.topicsFile, "examples/topics.json");
});
