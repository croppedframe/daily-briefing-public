import assert from "node:assert/strict";
import test from "node:test";

import {
  filterRunHealth,
  routeIncludesAllSections,
  sharedRouteKey,
  sharedSubjectOptions,
  synthesizeSharedRouteSubjects,
} from "../src/briefingRouting.js";

function health(id, fetchedPosts) {
  return {
    id,
    queriesAttempted: 1,
    queriesSucceeded: 1,
    queriesFailed: 0,
    queriesSkipped: 0,
    pagesFetched: 1,
    fetchedPosts,
    alreadySeenPosts: 0,
    collectedPosts: fetchedPosts,
    signalPosts: fetchedPosts,
    citedPosts: fetchedPosts,
    collectionWarnings: 0,
  };
}

test("recipient route receives only its topic health and recomputed totals", () => {
  const runHealth = { totals: { fetchedPosts: 7 }, topics: [health("world", 5), health("stocks", 2)] };
  const filtered = filterRunHealth(runHealth, ["stocks"]);

  assert.deepEqual(filtered.topics.map((topic) => topic.id), ["stocks"]);
  assert.equal(filtered.totals.fetchedPosts, 2);
  assert.equal(filtered.totals.queriesAttempted, 1);
});

test("full routes retain the synthesized subject while single-topic routes request more fallback headlines", () => {
  const sections = [{ id: "world" }, { id: "stocks" }];
  assert.equal(routeIncludesAllSections(["stocks", "world"], sections), true);
  assert.deepEqual(
    sharedSubjectOptions({ route: { topicIds: ["world", "stocks"] }, sections, sharedSections: sections, subject: "Lead" }),
    { subject: "Lead" },
  );
  assert.deepEqual(
    sharedSubjectOptions({ route: { topicIds: ["stocks"] }, sections, sharedSections: [sections[1]], subject: "Lead" }),
    { singleTopicHeadlineCount: 3 },
  );
});

test("shared route subjects are synthesized once per unique filtered topic set", async () => {
  const sections = [
    { id: "world", summary: "World summary" },
    { id: "stocks", summary: "Stocks summary" },
    { id: "energy", summary: "Energy summary" },
  ];
  const routes = [
    { to: "one@example.com", topicIds: ["world", "stocks"] },
    { to: "two@example.com", topicIds: ["stocks", "world"] },
    { to: "three@example.com", topicIds: ["energy"] },
    { to: "four@example.com", topicIds: ["world", "stocks", "energy"] },
  ];
  const calls = [];
  const synthesize = async ({ sections: selectedSections, usageSink }) => {
    calls.push(selectedSections.map((section) => section.id));
    usageSink({ type: "subject" });
    return `Subject for ${selectedSections.map((section) => section.id).join("+")}`;
  };
  const usage = [];

  const subjects = await synthesizeSharedRouteSubjects({
    apiKey: "test",
    model: "test-model",
    routes,
    sections,
    subject: "Main subject",
    usageSink: (item) => usage.push(item),
    synthesize,
  });

  assert.deepEqual(calls, [["world", "stocks"], ["energy"]]);
  assert.equal(usage.length, 2);
  assert.equal(subjects.get(sharedRouteKey(["stocks", "world"])), "Subject for world+stocks");
  assert.equal(subjects.get(sharedRouteKey(["energy"])), "Subject for energy");
  assert.equal(subjects.get(sharedRouteKey(["world", "stocks", "energy"])), "Main subject");
});

test("shared subject options prefer a route-specific synthesized subject", () => {
  const sections = [{ id: "world" }, { id: "stocks" }, { id: "energy" }];
  const route = { topicIds: ["world", "stocks"] };
  const sharedSections = sections.slice(0, 2);
  const sharedSubjects = new Map([[sharedRouteKey(route.topicIds), "Filtered lead"]]);

  assert.deepEqual(
    sharedSubjectOptions({ route, sections, sharedSections, subject: "Main lead", sharedSubjects }),
    { subject: "Filtered lead" },
  );
});

test("missing run health remains omitted for routed messages", () => {
  assert.equal(filterRunHealth(undefined, ["world"]), undefined);
});
