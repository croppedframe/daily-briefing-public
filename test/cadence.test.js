import assert from "node:assert/strict";
import test from "node:test";

import { topicIsDue, topicsForRun } from "../src/cadence.js";

const timezone = "America/New_York";

test("cadence uses briefing-local weekday and time-of-day boundaries", () => {
  const mondayMorning = new Date("2026-07-06T13:00:00Z");
  const mondayAfternoon = new Date("2026-07-06T17:00:00Z");
  const saturdayMorning = new Date("2026-07-11T13:00:00Z");

  assert.equal(topicIsDue({ id: "a", cadence: "weekday_morning" }, mondayMorning, timezone), true);
  assert.equal(topicIsDue({ id: "a", cadence: "weekday_morning" }, mondayAfternoon, timezone), false);
  assert.equal(topicIsDue({ id: "a", cadence: "weekday_morning" }, saturdayMorning, timezone), false);
  assert.equal(topicIsDue({ id: "a", cadence: "afternoon" }, mondayAfternoon, timezone), true);
});

test("topicsForRun filters cadence unless an all-topic run is requested", () => {
  const topics = [
    { id: "always", cadence: "every_run" },
    { id: "weekday", cadence: "weekday" },
  ];
  const saturday = new Date("2026-07-11T13:00:00Z");

  assert.deepEqual(topicsForRun(topics, saturday, timezone).map((topic) => topic.id), ["always"]);
  assert.deepEqual(topicsForRun(topics, saturday, timezone, { runAllTopics: true }), topics);
});

test("unsupported cadence fails with topic context", () => {
  assert.throws(
    () => topicIsDue({ id: "broken-topic", cadence: "sometimes" }, new Date(), timezone),
    /Unsupported cadence "sometimes" for topic "broken-topic"/,
  );
});
