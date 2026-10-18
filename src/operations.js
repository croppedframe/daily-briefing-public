import { sendEmail } from "./emailer.js";
import { renderCreditsDepletedNotification } from "./render.js";
import { appendRunHistory } from "./runHistory.js";
import { noteTopicRun, saveBriefingState } from "./state.js";

function parseDateOnly(value) {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return undefined;
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

function dateOnlyToUtcMs(date) {
  return Date.UTC(date.year, date.month - 1, date.day);
}

function formatDateOnly(date) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" }).format(
    new Date(dateOnlyToUtcMs(date)),
  );
}

export function operationalReminders(config, generatedAt) {
  const reminders = [];
  const patExpiresOn = parseDateOnly(config.briefing.schedulerPatExpiresOn);
  const patReminderDays = config.briefing.schedulerPatReminderDays;

  if (patExpiresOn) {
    const todayUtc = Date.UTC(generatedAt.getUTCFullYear(), generatedAt.getUTCMonth(), generatedAt.getUTCDate());
    const daysUntil = Math.ceil((dateOnlyToUtcMs(patExpiresOn) - todayUtc) / (24 * 60 * 60 * 1000));
    const dayText = daysUntil === 0 ? "today" : daysUntil < 0 ? `${Math.abs(daysUntil)} days ago` : `in ${daysUntil} days`;
    if (daysUntil <= patReminderDays) {
      reminders.push(`Scheduler GitHub PAT expires ${dayText} (${formatDateOnly(patExpiresOn)}).`);
    }
  }

  return reminders;
}

export function persistRunOutcome({ config, state, generatedAt, sections, runHealth, openAiUsage, costs, message, result }) {
  try {
    appendRunHistory(config.briefing.runHistoryFile, {
      version: 1,
      generatedAt: generatedAt.toISOString(),
      completedAt: new Date().toISOString(),
      subject: message.subject,
      topics: sections.map((section) => ({
        id: section.id,
        title: section.title,
        label: section.label,
        rawPostCount: section.rawPostCount,
        signalPostCount: section.signalPostCount,
        citedPostCount: section.posts.length,
      })),
      runHealth,
      openAi: openAiUsage,
      costs,
    });
  } catch (error) {
    console.warn(`Briefing sent, but run history was not recorded: ${error.message}`);
  }

  if (config.briefing.saveState) {
    for (const section of sections) {
      if (section.health.queriesFailed === 0) noteTopicRun(state, section.id, generatedAt);
    }
    saveBriefingState(config.briefing.stateFile, state);
    console.log(`Briefing sent to ${config.email.to}: ${result.messageId || "ok"}`);
  } else {
    console.log(`Briefing sent to ${config.email.to}: ${result.messageId || "ok"}; state save skipped.`);
  }
}

export async function sendCreditsDepletedNotification(config, error) {
  const message = renderCreditsDepletedNotification({
    generatedAt: new Date(),
    timezone: config.briefing.timezone,
    error,
  });
  const result = await sendEmail(config.email, message);
  console.log(`Credits depleted notification sent to ${config.email.to}: ${result.messageId || "ok"}`);
}
