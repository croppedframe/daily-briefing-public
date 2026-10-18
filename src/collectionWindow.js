import { lastRunAtForTopic, updatedAtForQuery } from "./state.js";

function validStartTime(value, generatedAt) {
  if (!value) return undefined;

  const start = new Date(value);
  if (Number.isNaN(start.getTime()) || start >= generatedAt) return undefined;
  return start.toISOString();
}

export function queryStartTime({ explicitStartTime, state, topicId, cursorKey, generatedAt }) {
  if (explicitStartTime) return explicitStartTime;

  return validStartTime(
    updatedAtForQuery(state, cursorKey) || lastRunAtForTopic(state, topicId),
    generatedAt,
  );
}
