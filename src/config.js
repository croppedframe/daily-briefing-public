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

export function parseBoolean(value, fallback = false, name = "value") {
  if (value === undefined || value === "") return fallback;
  const normalized = String(value).toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  throw new Error(`${name} must be a boolean (true/false, yes/no, on/off, or 1/0); received "${value}".`);
}

export function parseInteger(value, fallback, name = "value", { min, max } = {}) {
  if (value === undefined || value === "") return fallback;
  if (!/^-?\d+$/.test(String(value))) throw new Error(`${name} must be an integer; received "${value}".`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error(`${name} must be a safe integer; received "${value}".`);
  if (min !== undefined && parsed < min) throw new Error(`${name} must be at least ${min}; received ${parsed}.`);
  if (max !== undefined && parsed > max) throw new Error(`${name} must be at most ${max}; received ${parsed}.`);
  return parsed;
}

export function parseNumber(value, name = "value", { min, max } = {}) {
  if (value === undefined || value === "") return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${name} must be a finite number; received "${value}".`);
  if (min !== undefined && parsed < min) throw new Error(`${name} must be at least ${min}; received ${parsed}.`);
  if (max !== undefined && parsed > max) throw new Error(`${name} must be at most ${max}; received ${parsed}.`);
  return parsed;
}

function parseCsv(value, fallback = []) {
  if (value === undefined || value === "") return fallback;
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseSharedRoutes(value) {
  if (value === undefined || value === "") return [];

  const routes = String(value)
    .split(";")
    .map((route) => route.trim())
    .filter(Boolean)
    .map((route) => {
      const separator = route.indexOf(":");
      if (separator === -1) {
        throw new Error("BRIEFING_SHARED_ROUTES entries must use email:TOPIC,TOPIC format.");
      }

      const to = route.slice(0, separator).trim();
      const topicRefs = parseCsv(route.slice(separator + 1));
      if (!to || topicRefs.length === 0) {
        throw new Error("BRIEFING_SHARED_ROUTES entries require both an email address and at least one topic.");
      }

      return { to, topicRefs };
    });

  return routes;
}

function topicKey(value) {
  return String(value || "").trim().toLowerCase();
}

function resolveSharedRouteTopicIds(routes, topics) {
  const topicLookup = new Map();
  for (const topic of topics) {
    topicLookup.set(topicKey(topic.id), topic.id);
    topicLookup.set(topicKey(topic.label), topic.id);
    topicLookup.set(topicKey(topic.title), topic.id);
  }

  return routes.map((route) => ({
    to: route.to,
    topicIds: route.topicRefs.map((topicRef) => topicLookup.get(topicKey(topicRef)) || topicRef),
  }));
}

function isValidDateTime(value) {
  return !value || !Number.isNaN(new Date(value).getTime());
}

function resolveSaveState({ explicitValue, startTime }) {
  if (explicitValue !== undefined && explicitValue !== "") {
    return parseBoolean(explicitValue, true, "BRIEFING_SAVE_STATE");
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
  const lookbackHours = parseInteger(process.env.BRIEFING_LOOKBACK_HOURS, 24, "BRIEFING_LOOKBACK_HOURS", { min: 1 });
  const maxPosts = parseInteger(process.env.BRIEFING_MAX_POSTS, 25, "BRIEFING_MAX_POSTS", { min: 1 });
  const startTime = process.env.BRIEFING_START_TIME;

  const topicsPath = process.env.TOPICS_FILE || "topics/topics.json";
  const topics = loadTopicDefinitions().map((topic) => ({
    maxPosts,
    ...topic,
    framework: loadTopicText(topic, "frameworkPath", "framework", topicsPath),
    wizard: loadTopicText(topic, "wizardPath", "wizard answers", topicsPath),
  }));
  const legacySharedTopicIds = parseCsv(process.env.BRIEFING_SHARED_TOPIC_IDS, []);
  const sharedRoutes = resolveSharedRouteTopicIds(
    [
      ...parseSharedRoutes(process.env.BRIEFING_SHARED_ROUTES),
      ...(process.env.BRIEFING_SHARED_EMAIL_TO
        ? [{ to: process.env.BRIEFING_SHARED_EMAIL_TO, topicRefs: legacySharedTopicIds }]
        : []),
    ],
    topics,
  );

  return {
    x: {
      bearerToken: process.env.X_BEARER_TOKEN,
    },
    openai: {
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_MODEL || "gpt-5.4-mini",
    },
    email: {
      host: process.env.SMTP_HOST,
      port: parseInteger(process.env.SMTP_PORT, 587, "SMTP_PORT", { min: 1, max: 65535 }),
      secure: parseBoolean(process.env.SMTP_SECURE, false, "SMTP_SECURE"),
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
      from: process.env.EMAIL_FROM,
      to: process.env.EMAIL_TO,
    },
    briefing: {
      generatedAt: process.env.BRIEFING_GENERATED_AT,
      startTime,
      endTime: process.env.BRIEFING_END_TIME,
      disableSinceId: parseBoolean(process.env.BRIEFING_DISABLE_SINCE_ID, false, "BRIEFING_DISABLE_SINCE_ID"),
      lookbackHours,
      maxPosts,
      runAllTopics: parseBoolean(process.env.BRIEFING_RUN_ALL_TOPICS, false, "BRIEFING_RUN_ALL_TOPICS"),
      saveState: resolveSaveState({ explicitValue: process.env.BRIEFING_SAVE_STATE, startTime }),
      stateFile: process.env.BRIEFING_STATE_FILE || "data/briefing-state.json",
      runHistoryFile: process.env.BRIEFING_RUN_HISTORY_FILE || "data/run-history.jsonl",
      schedulerPatExpiresOn: process.env.SCHEDULER_PAT_EXPIRES_ON,
      schedulerPatReminderDays: parseInteger(
        process.env.SCHEDULER_PAT_REMINDER_DAYS,
        21,
        "SCHEDULER_PAT_REMINDER_DAYS",
        { min: 0 },
      ),
      timezone: process.env.BRIEFING_TIMEZONE || "America/New_York",
      costs: {
        xCostPerPost: parseNumber(process.env.X_COST_PER_POST_RETURNED, "X_COST_PER_POST_RETURNED", { min: 0 }),
        openAiInputCostPer1M: parseNumber(
          process.env.OPENAI_INPUT_COST_PER_1M_TOKENS,
          "OPENAI_INPUT_COST_PER_1M_TOKENS",
          { min: 0 },
        ),
        openAiOutputCostPer1M: parseNumber(
          process.env.OPENAI_OUTPUT_COST_PER_1M_TOKENS,
          "OPENAI_OUTPUT_COST_PER_1M_TOKENS",
          { min: 0 },
        ),
      },
      sharedRoutes,
      topics,
    },
  };
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function validateStringArray(errors, value, path) {
  if (value === undefined) return;
  if (!Array.isArray(value) || value.some((item) => !nonEmptyString(item))) {
    errors.push(`${path} must be an array of non-empty strings.`);
  }
}

function validateIntegerField(errors, value, path, { min = 0 } = {}) {
  if (value === undefined) return;
  if (!Number.isSafeInteger(value) || value < min) errors.push(`${path} must be an integer of at least ${min}.`);
}

function validateBooleanField(errors, value, path) {
  if (value !== undefined && typeof value !== "boolean") errors.push(`${path} must be a boolean.`);
}

function validateTopic(errors, topic, index) {
  const path = `topics[${index}]`;
  if (!topic || typeof topic !== "object" || Array.isArray(topic)) {
    errors.push(`${path} must be an object.`);
    return;
  }

  for (const field of ["id", "title", "framework", "wizard"]) {
    if (!nonEmptyString(topic[field])) errors.push(`${path}.${field} must be a non-empty string.`);
  }
  if (topic.kind !== "x-search") errors.push(`${path}.kind must be "x-search".`);
  if (topic.cadence && !SUPPORTED_CADENCES.has(topic.cadence)) errors.push(`${path}.cadence is unsupported: ${topic.cadence}.`);
  if (topic.broadQueryCadence && !SUPPORTED_CADENCES.has(topic.broadQueryCadence)) {
    errors.push(`${path}.broadQueryCadence is unsupported: ${topic.broadQueryCadence}.`);
  }
  if (!nonEmptyString(topic.query) && !nonEmptyString(topic.trustedQuery) && !topic.marketData && !topic.news && !topic.sportsData) {
    errors.push(`${path} must configure query or trustedQuery, or a market, news, or sports provider.`);
  }

  for (const field of ["searchMaxPosts", "maxPages", "lookbackHours", "maxSourcePosts"]) {
    validateIntegerField(errors, topic[field], `${path}.${field}`, { min: 1 });
  }
  validateIntegerField(errors, topic.maxPosts, `${path}.maxPosts`, { min: 0 });
  for (const field of ["minEngagement", "broadQuerySkipTrustedCount"]) {
    validateIntegerField(errors, topic[field], `${path}.${field}`, { min: 0 });
  }
  for (const field of [
    "allowReplies",
    "confidenceTiers",
    "broadQueryUseSinceId",
    "citedSourcesOnly",
    "materialSourcesOnly",
    "rejectGeneratedUsernames",
    "rejectTickerLinkDrops",
    "rejectZeroEngagementLinkDrops",
  ]) {
    validateBooleanField(errors, topic[field], `${path}.${field}`);
  }
  for (const field of ["trustedAccounts", "cautionAccounts", "excludeAccounts", "excludeTerms", "relevanceTerms"]) {
    validateStringArray(errors, topic[field], `${path}.${field}`);
  }

  if (topic.relevanceAllGroups !== undefined) {
    if (
      !Array.isArray(topic.relevanceAllGroups) ||
      topic.relevanceAllGroups.length === 0 ||
      topic.relevanceAllGroups.some(
        (group) => !Array.isArray(group) || group.length === 0 || group.some((term) => !nonEmptyString(term)),
      )
    ) {
      errors.push(`${path}.relevanceAllGroups must be a non-empty array of non-empty string arrays.`);
    }
  }

  for (const [field, requiredField] of [["marketData", "symbol"], ["news", "query"]]) {
    const value = topic[field];
    if (value !== undefined && (!value || typeof value !== "object" || Array.isArray(value) || !nonEmptyString(value[requiredField]))) {
      errors.push(`${path}.${field}.${requiredField} must be a non-empty string.`);
    }
  }
  if (topic.news && typeof topic.news === "object") {
    validateIntegerField(errors, topic.news.maxItems, `${path}.news.maxItems`, { min: 1 });
    validateStringArray(errors, topic.news.cautionPublishers, `${path}.news.cautionPublishers`);
    if (topic.news.when !== undefined && !nonEmptyString(topic.news.when)) errors.push(`${path}.news.when must be a non-empty string.`);
  }
  if (topic.sportsData !== undefined) {
    const sports = topic.sportsData;
    if (!sports || typeof sports !== "object" || Array.isArray(sports) || sports.league !== "mlb") {
      errors.push(`${path}.sportsData must configure the mlb league.`);
    } else {
      if (!Number.isSafeInteger(sports.teamId) || sports.teamId < 1) errors.push(`${path}.sportsData.teamId must be a positive integer.`);
      for (const field of ["divisionId", "maxRecentResults", "maxNextGames"]) {
        validateIntegerField(errors, sports[field], `${path}.sportsData.${field}`, { min: 1 });
      }
      for (const field of ["lookbackDays", "lookaheadDays"]) {
        validateIntegerField(errors, sports[field], `${path}.sportsData.${field}`, { min: 0 });
      }
    }
  }

}

function timezoneIsValid(timezone) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format();
    return true;
  } catch {
    return false;
  }
}

function dateOnlyIsValid(value) {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.toISOString().slice(0, 10) === value;
}

export function validateConfig(config) {
  const errors = [];
  if (!config || typeof config !== "object") throw new Error("Configuration validation failed:\n- config must be an object.");

  if (!nonEmptyString(config.x?.bearerToken)) errors.push("X_BEARER_TOKEN is required.");
  if (!nonEmptyString(config.email?.host)) errors.push("SMTP_HOST is required.");
  if (!nonEmptyString(config.email?.from)) errors.push("EMAIL_FROM is required.");
  if (!nonEmptyString(config.email?.to)) errors.push("EMAIL_TO is required.");
  if (!Number.isSafeInteger(config.email?.port) || config.email.port < 1 || config.email.port > 65535) {
    errors.push("SMTP_PORT must be an integer from 1 through 65535.");
  }
  if (typeof config.email?.secure !== "boolean") errors.push("SMTP_SECURE must be a boolean.");

  const briefing = config.briefing || {};
  for (const [name, value] of [
    ["BRIEFING_GENERATED_AT", briefing.generatedAt],
    ["BRIEFING_START_TIME", briefing.startTime],
    ["BRIEFING_END_TIME", briefing.endTime],
  ]) {
    if (!isValidDateTime(value)) errors.push(`${name} must be a valid date/time.`);
  }
  if (briefing.endTime && !briefing.startTime) errors.push("BRIEFING_END_TIME requires BRIEFING_START_TIME.");
  if (
    isValidDateTime(briefing.startTime) &&
    isValidDateTime(briefing.endTime) &&
    briefing.startTime &&
    briefing.endTime &&
    new Date(briefing.startTime) >= new Date(briefing.endTime)
  ) {
    errors.push("BRIEFING_START_TIME must be earlier than BRIEFING_END_TIME.");
  }
  if (!nonEmptyString(briefing.timezone) || !timezoneIsValid(briefing.timezone)) {
    errors.push(`BRIEFING_TIMEZONE is invalid: ${briefing.timezone || "missing"}.`);
  }
  validateIntegerField(errors, briefing.lookbackHours, "BRIEFING_LOOKBACK_HOURS", { min: 1 });
  validateIntegerField(errors, briefing.maxPosts, "BRIEFING_MAX_POSTS", { min: 1 });
  validateIntegerField(errors, briefing.schedulerPatReminderDays, "SCHEDULER_PAT_REMINDER_DAYS", { min: 0 });
  for (const field of ["disableSinceId", "runAllTopics", "saveState"]) {
    validateBooleanField(errors, briefing[field], `briefing.${field}`);
  }

  if (briefing.schedulerPatExpiresOn && !dateOnlyIsValid(briefing.schedulerPatExpiresOn)) {
    errors.push("SCHEDULER_PAT_EXPIRES_ON must be a real calendar date in YYYY-MM-DD format.");
  }
  for (const field of ["stateFile", "runHistoryFile"]) {
    if (!nonEmptyString(briefing[field])) errors.push(`briefing.${field} must be a non-empty path.`);
  }
  if (!Array.isArray(briefing.topics) || briefing.topics.length === 0) {
    errors.push("briefing.topics must be a non-empty array.");
  } else {
    briefing.topics.forEach((topic, index) => validateTopic(errors, topic, index));
    const ids = briefing.topics.map((topic) => topicKey(topic?.id)).filter(Boolean);
    const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
    if (duplicateIds.length > 0) errors.push(`Topic IDs must be unique: ${duplicateIds.join(", ")}.`);
  }

  const topicIds = new Set((Array.isArray(briefing.topics) ? briefing.topics : []).map((topic) => topic?.id));
  if (!Array.isArray(briefing.sharedRoutes)) {
    errors.push("briefing.sharedRoutes must be an array.");
  } else {
    briefing.sharedRoutes.forEach((route, index) => {
      if (!nonEmptyString(route?.to)) errors.push(`briefing.sharedRoutes[${index}].to must be non-empty.`);
      if (!Array.isArray(route?.topicIds) || route.topicIds.length === 0) {
        errors.push(`briefing.sharedRoutes[${index}].topicIds must be a non-empty array.`);
      } else {
        const unknown = route.topicIds.filter((topicId) => !topicIds.has(topicId));
        if (unknown.length > 0) errors.push(`Unknown shared briefing topic values: ${unknown.join(", ")}.`);
      }
    });
  }

  for (const [field, value] of Object.entries(briefing.costs || {})) {
    if (value !== undefined && (!Number.isFinite(value) || value < 0)) errors.push(`briefing.costs.${field} must be non-negative.`);
  }

  if (errors.length > 0) throw new Error(`Configuration validation failed:\n- ${errors.join("\n- ")}`);
}
