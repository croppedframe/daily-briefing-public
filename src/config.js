import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const DEFAULT_TOPIC = {
  id: "twitter-osint",
  title: "Twitter OSINT",
  kind: "x-search",
  query: "from:OSINTdefender -is:retweet",
};
const SUPPORTED_CADENCES = new Set([
  "always",
  "every_run",
  "twice_daily",
  "weekday_morning",
  "weekday_afternoon",
  "weekday",
  "morning",
  "afternoon",
]);

function parseEnvValue(value) {
  const trimmed = value.trim();
  const quote = trimmed[0];

  if ((quote === "\"" || quote === "'") && trimmed.endsWith(quote)) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

function loadLocalEnv(path = ".env") {
  if (!existsSync(path)) return;

  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;

    const separator = trimmed.indexOf("=");
    const key = trimmed.slice(0, separator).trim();
    const value = parseEnvValue(trimmed.slice(separator + 1));

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function parseInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseNumber(value) {
  if (value === undefined || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function isValidDateTime(value) {
  return !value || !Number.isNaN(new Date(value).getTime());
}

function resolveSaveState({ explicitValue, startTime }) {
  if (explicitValue !== undefined && explicitValue !== "") {
    return parseBoolean(explicitValue, true);
  }

  return !startTime;
}

function parseJsonTopics(value, source) {
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error(`${source} must be a non-empty array.`);
    }
    return parsed;
  } catch (error) {
    throw new Error(`Unable to parse ${source}: ${error.message}`);
  }
}

function parseTopics() {
  if (!process.env.TOPICS_JSON) return [DEFAULT_TOPIC];
  return parseJsonTopics(process.env.TOPICS_JSON, "TOPICS_JSON");
}

function loadTopicDefinitions() {
  if (process.env.TOPICS_JSON) return parseTopics();

  const topicsPath = process.env.TOPICS_FILE || "topics/topics.json";
  if (existsSync(topicsPath)) {
    return parseJsonTopics(readFileSync(topicsPath, "utf8"), topicsPath);
  }

  return [DEFAULT_TOPIC];
}

function loadTopicText(topic, pathKey, label, topicsPath = "topics/topics.json") {
  if (!topic[pathKey]) return undefined;

  const baseDir = dirname(resolve(topicsPath));
  const filePath = resolve(baseDir, topic[pathKey]);

  if (!existsSync(filePath)) {
    throw new Error(`Missing ${label} file for topic "${topic.id}": ${topic[pathKey]}`);
  }

  return readFileSync(filePath, "utf8").trim();
}

export function loadConfig() {
  loadLocalEnv();
  const lookbackHours = parseInteger(process.env.BRIEFING_LOOKBACK_HOURS, 24);
  const maxPosts = parseInteger(process.env.BRIEFING_MAX_POSTS, 25);
  const startTime = process.env.BRIEFING_START_TIME;

  const topicsPath = process.env.TOPICS_FILE || "topics/topics.json";

  return {
    x: {
      bearerToken: process.env.X_BEARER_TOKEN,
    },
    openai: {
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
    },
    email: {
      host: process.env.SMTP_HOST,
      port: parseInteger(process.env.SMTP_PORT, 587),
      secure: parseBoolean(process.env.SMTP_SECURE, false),
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
      from: process.env.EMAIL_FROM,
      to: process.env.EMAIL_TO,
    },
    briefing: {
      generatedAt: process.env.BRIEFING_GENERATED_AT,
      startTime,
      endTime: process.env.BRIEFING_END_TIME,
      disableSinceId: parseBoolean(process.env.BRIEFING_DISABLE_SINCE_ID, false),
      lookbackHours,
      maxPosts,
      runAllTopics: parseBoolean(process.env.BRIEFING_RUN_ALL_TOPICS, false),
      saveState: resolveSaveState({ explicitValue: process.env.BRIEFING_SAVE_STATE, startTime }),
      stateFile: process.env.BRIEFING_STATE_FILE || "data/briefing-state.json",
      runHistoryFile: process.env.BRIEFING_RUN_HISTORY_FILE || "data/run-history.jsonl",
      schedulerPatExpiresOn: process.env.SCHEDULER_PAT_EXPIRES_ON,
      schedulerPatReminderDays: parseInteger(process.env.SCHEDULER_PAT_REMINDER_DAYS, 21),
      timezone: process.env.BRIEFING_TIMEZONE || "America/New_York",
      costs: {
        xCostPerPost: parseNumber(process.env.X_COST_PER_POST_RETURNED),
        openAiInputCostPer1M: parseNumber(process.env.OPENAI_INPUT_COST_PER_1M_TOKENS),
        openAiOutputCostPer1M: parseNumber(process.env.OPENAI_OUTPUT_COST_PER_1M_TOKENS),
      },
      topics: loadTopicDefinitions().map((topic) => ({
        maxPosts,
        ...topic,
        framework: loadTopicText(topic, "frameworkPath", "framework", topicsPath),
        wizard: loadTopicText(topic, "wizardPath", "wizard answers", topicsPath),
      })),
    },
  };
}

export function validateConfig(config) {
  const missing = [];

  if (!config.x.bearerToken) missing.push("X_BEARER_TOKEN");
  if (!config.email.host) missing.push("SMTP_HOST");
  if (!config.email.from) missing.push("EMAIL_FROM");
  if (!config.email.to) missing.push("EMAIL_TO");

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }

  const dateFields = [
    ["BRIEFING_GENERATED_AT", config.briefing.generatedAt],
    ["BRIEFING_START_TIME", config.briefing.startTime],
    ["BRIEFING_END_TIME", config.briefing.endTime],
  ];
  const invalidDateFields = dateFields.filter(([, value]) => !isValidDateTime(value));
  if (invalidDateFields.length > 0) {
    throw new Error(`Invalid briefing date/time environment variables: ${invalidDateFields.map(([name]) => name).join(", ")}`);
  }

  if (config.briefing.endTime && !config.briefing.startTime) {
    throw new Error("BRIEFING_END_TIME requires BRIEFING_START_TIME.");
  }

  const topicsWithoutFramework = config.briefing.topics.filter((topic) => !topic.framework);
  if (topicsWithoutFramework.length > 0) {
    throw new Error(
      `Every briefing topic needs a standing framework before the briefing runs: ${topicsWithoutFramework
        .map((topic) => topic.id)
        .join(", ")}`,
    );
  }

  const topicsWithoutWizard = config.briefing.topics.filter((topic) => !topic.wizard);
  if (topicsWithoutWizard.length > 0) {
    throw new Error(
      `Every briefing topic needs user-answered wizard questions before the briefing runs: ${topicsWithoutWizard
        .map((topic) => topic.id)
        .join(", ")}`,
    );
  }

  const topicsWithUnsupportedCadence = config.briefing.topics.filter(
    (topic) => topic.cadence && !SUPPORTED_CADENCES.has(topic.cadence),
  );
  if (topicsWithUnsupportedCadence.length > 0) {
    throw new Error(
      `Unsupported topic cadence: ${topicsWithUnsupportedCadence
        .map((topic) => `${topic.id}=${topic.cadence}`)
        .join(", ")}`,
    );
  }

  const topicsWithUnsupportedBroadQueryCadence = config.briefing.topics.filter(
    (topic) => topic.broadQueryCadence && !SUPPORTED_CADENCES.has(topic.broadQueryCadence),
  );
  if (topicsWithUnsupportedBroadQueryCadence.length > 0) {
    throw new Error(
      `Unsupported broad query cadence: ${topicsWithUnsupportedBroadQueryCadence
        .map((topic) => `${topic.id}=${topic.broadQueryCadence}`)
        .join(", ")}`,
    );
  }
}
