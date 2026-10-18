import assert from "node:assert/strict";
import test from "node:test";

import { parseBoolean, parseInteger, parseNumber, validateConfig } from "../src/config.js";

function validConfig() {
  return {
    x: { bearerToken: "test-token" },
    openai: { model: "test-model" },
    email: {
      host: "smtp.example.com",
      port: 587,
      secure: false,
      from: "Briefing <briefing@example.com>",
      to: "reader@example.com",
    },
    briefing: {
      generatedAt: undefined,
      startTime: undefined,
      endTime: undefined,
      disableSinceId: false,
      lookbackHours: 24,
      maxPosts: 25,
      runAllTopics: false,
      saveState: true,
      stateFile: "data/state.json",
      runHistoryFile: "data/history.jsonl",
      schedulerPatExpiresOn: "2026-09-15",
      schedulerPatReminderDays: 21,
      timezone: "America/New_York",
      costs: {},
      sharedRoutes: [{ to: "friend@example.com", topicIds: ["example"] }],
      topics: [{
        id: "example",
        title: "Example Topic",
        label: "EX",
        kind: "x-search",
        cadence: "weekday_morning",
        query: "example -is:retweet",
        maxPosts: 10,
        searchMaxPosts: 20,
        maxPages: 1,
        lookbackHours: 24,
        framework: "Standing framework",
        wizard: "User preferences",
        trustedAccounts: ["reporter"],
        relevanceAllGroups: [["example"], ["update"]],
      }],
    },
  };
}

test("strict environment parsers reject typos, partial integers, and invalid costs", () => {
  assert.equal(parseBoolean("off", true, "FEATURE"), false);
  assert.throws(() => parseBoolean("flase", true, "FEATURE"), /FEATURE must be a boolean/);
  assert.equal(parseInteger("25", 10, "COUNT", { min: 1 }), 25);
  assert.throws(() => parseInteger("25posts", 10, "COUNT"), /COUNT must be an integer/);
  assert.throws(() => parseInteger("0", 10, "COUNT", { min: 1 }), /at least 1/);
  assert.equal(parseNumber("0.25", "COST", { min: 0 }), 0.25);
  assert.throws(() => parseNumber("free", "COST", { min: 0 }), /finite number/);
  assert.throws(() => parseNumber("-1", "COST", { min: 0 }), /at least 0/);
});

test("a production-shaped configuration passes validation", () => {
  assert.doesNotThrow(() => validateConfig(validConfig()));
});

test("validation reports malformed environment and topic values together", () => {
  const config = validConfig();
  config.email.port = 70000;
  config.briefing.timezone = "Mars/Olympus_Mons";
  config.briefing.startTime = "2026-07-11T15:00:00Z";
  config.briefing.endTime = "2026-07-11T14:00:00Z";
  config.briefing.schedulerPatExpiresOn = "2026-02-30";
  config.briefing.topics[0].maxPosts = -1;
  config.briefing.topics[0].trustedAccounts = "reporter";
  config.briefing.topics.push({ ...config.briefing.topics[0], title: "Duplicate" });

  assert.throws(
    () => validateConfig(config),
    (error) => {
      assert.match(error.message, /SMTP_PORT/);
      assert.match(error.message, /BRIEFING_TIMEZONE/);
      assert.match(error.message, /START_TIME must be earlier/);
      assert.match(error.message, /real calendar date/);
      assert.match(error.message, /topics\[0\]\.maxPosts/);
      assert.match(error.message, /topics\[0\]\.trustedAccounts/);
      assert.match(error.message, /Topic IDs must be unique/);
      return true;
    },
  );
});

test("enabled X topics require a usable source and nested provider config is validated", () => {
  const config = validConfig();
  delete config.briefing.topics[0].query;
  config.briefing.topics[0].news = { query: "" };

  assert.throws(
    () => validateConfig(config),
    (error) => {
      assert.match(error.message, /news\.query/);
      return true;
    },
  );
});
