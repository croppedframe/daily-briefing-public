const ALWAYS_CADENCES = new Set(["always", "every_run", "twice_daily"]);

function localTimeParts(date, timezone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    hour: "numeric",
    hourCycle: "h23",
    timeZone: timezone,
  }).formatToParts(date);

  return {
    weekday: parts.find((part) => part.type === "weekday")?.value,
    hour: Number(parts.find((part) => part.type === "hour")?.value),
  };
}

function isWeekday(weekday) {
  return weekday !== "Sat" && weekday !== "Sun";
}

export function topicIsDue(topic, date, timezone) {
  const cadence = topic.cadence || "every_run";
  if (ALWAYS_CADENCES.has(cadence)) return true;

  const parts = localTimeParts(date, timezone);
  const weekday = isWeekday(parts.weekday);
  const morning = parts.hour < 12;
  const afternoon = parts.hour >= 12;

  if (cadence === "weekday") return weekday;
  if (cadence === "morning") return morning;
  if (cadence === "afternoon") return afternoon;
  if (cadence === "weekday_morning") return weekday && morning;
  if (cadence === "weekday_afternoon") return weekday && afternoon;

  throw new Error(`Unsupported cadence "${cadence}" for topic "${topic.id}".`);
}

export function topicsForRun(topics, date, timezone, { runAllTopics = false } = {}) {
  if (runAllTopics) return topics;
  return topics.filter((topic) => topicIsDue(topic, date, timezone));
}
