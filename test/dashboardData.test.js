import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { buildDashboardData, readJsonl, readState, summarizeRuns } from "../scripts/dashboard-data.mjs";

function run(generatedAt, fetchedPosts, totalCost) {
  return {
    generatedAt,
    subject: `Run ${generatedAt}`,
    runHealth: { totals: { fetchedPosts, signalPosts: fetchedPosts - 1, citedPosts: fetchedPosts - 2, alreadySeenPosts: 1, queriesAttempted: 2, queriesSucceeded: 1, queriesFailed: 1, queriesSkipped: 0, pagesFetched: 2 } },
    openAi: { calls: 1, inputTokens: 100, outputTokens: 20, totalTokens: 120 },
    costs: { x: 0.1, openAi: 0.2, total: totalCost },
  };
}

test("dashboard parser preserves valid JSONL and marks malformed lines", () => {
  const dir = mkdtempSync(join(tmpdir(), "dashboard-data-"));
  const history = join(dir, "history.jsonl");
  writeFileSync(history, `${JSON.stringify(run("2026-07-11T12:00:00Z", 4, 0.3))}\nnot-json\n`);

  const records = readJsonl(history);
  assert.equal(records.length, 2);
  assert.equal(records[0].runHealth.totals.fetchedPosts, 4);
  assert.match(records[1].subject, /Unparseable history line 2/);
  assert.ok(records[1].parseError);
});

test("run aggregation sums retrieval, token, and cost metrics", () => {
  const totals = summarizeRuns([run("2026-07-11T12:00:00Z", 4, 0.3), run("2026-07-11T13:00:00Z", 6, 0.4)]);

  assert.equal(totals.runs, 2);
  assert.equal(totals.fetchedPosts, 10);
  assert.equal(totals.signalPosts, 8);
  assert.equal(totals.queriesFailed, 2);
  assert.equal(totals.totalTokens, 240);
  assert.equal(totals.totalCost, 0.7);
});

test("dashboard data sorts runs and summarizes state without exposing its contents", () => {
  const dir = mkdtempSync(join(tmpdir(), "dashboard-data-"));
  const history = join(dir, "history.jsonl");
  const state = join(dir, "state.json");
  writeFileSync(history, `${JSON.stringify(run("2026-07-11T13:00:00Z", 6, 0.4))}\n${JSON.stringify(run("2026-07-11T12:00:00Z", 4, 0.3))}\n`);
  writeFileSync(state, JSON.stringify({ updatedAt: "2026-07-11T13:01:00Z", seenPostIds: ["1", "2"], queries: { a: {}, b: {} } }));

  const data = buildDashboardData({ historyPath: history, statePath: state, generatedAt: new Date("2026-07-11T14:00:00Z") });
  assert.equal(data.runs[0].generatedAt, "2026-07-11T12:00:00Z");
  assert.equal(data.latest.generatedAt, "2026-07-11T13:00:00Z");
  assert.deepEqual(data.state, { updatedAt: "2026-07-11T13:01:00Z", seenPostIds: 2, queryCount: 2 });
  assert.equal(readState(state).seenPostIds.length, 2);
});

test("missing dashboard files produce empty, stable data", () => {
  const data = buildDashboardData({ historyPath: "/tmp/no-history-dashboard.jsonl", statePath: "/tmp/no-state-dashboard.json" });
  assert.deepEqual(data.runs, []);
  assert.equal(data.latest, undefined);
  assert.equal(data.totals.runs, 0);
  assert.equal(data.state, undefined);
});
