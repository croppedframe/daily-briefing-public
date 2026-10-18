import assert from "node:assert/strict";
import test from "node:test";

import { mergeRunHistory } from "../scripts/merge-run-history.mjs";

test("run-history merge preserves remote and local records without duplicates", () => {
  const remoteOnly = { version: 1, generatedAt: "2026-07-10T09:00:00Z", completedAt: "2026-07-10T09:01:00Z" };
  const shared = { version: 1, generatedAt: "2026-07-10T21:00:00Z", completedAt: "2026-07-10T21:01:00Z" };
  const localOnly = { version: 1, generatedAt: "2026-07-11T09:00:00Z", completedAt: "2026-07-11T09:01:00Z" };

  assert.deepEqual(mergeRunHistory([remoteOnly, shared], [shared, localOnly]), [remoteOnly, shared, localOnly]);
});
