import { topicsForRun } from "./cadence.js";
import { collectTopic } from "./collection.js";
import { loadConfig, validateConfig } from "./config.js";
import { sendEmail } from "./emailer.js";
import {
  operationalReminders,
  persistRunOutcome,
  sendCreditsDepletedNotification,
} from "./operations.js";
import { renderBriefing } from "./render.js";
import { sendSharedBriefing, synthesizeSharedRouteSubjects } from "./briefingRouting.js";
import { aggregateOpenAiUsage, estimateCosts } from "./runHistory.js";
import { createRunHealth, runHealthTotals } from "./runHealth.js";
import { loadBriefingState } from "./state.js";
import { synthesizeBriefingSubject } from "./summarizer.js";
import { XCreditsDepletedError } from "./xClient.js";
import { OpenAiCreditsDepletedError } from "./openaiClient.js";

async function main() {
  const config = loadConfig();
  validateConfig(config);
  const state = loadBriefingState(config.briefing.stateFile);
  const runHealth = createRunHealth(state, config);
  const generatedAt = config.briefing.generatedAt ? new Date(config.briefing.generatedAt) : new Date();
  const topics = topicsForRun(config.briefing.topics, generatedAt, config.briefing.timezone, {
    runAllTopics: config.briefing.runAllTopics,
  });

  const sections = [];
  const openAiUsageCalls = [];
  for (const topic of topics) {
    const section = await collectTopic(config, topic, state, generatedAt, openAiUsageCalls);
    sections.push(section);
    runHealth.topics.push(section.health);
  }
  runHealth.totals = runHealthTotals(runHealth);

  let subject;
  try {
    subject = await synthesizeBriefingSubject({
      apiKey: config.openai.apiKey,
      model: config.openai.model,
      sections,
      usageSink: (usage) => openAiUsageCalls.push(usage),
    });
  } catch (error) {
    if (error instanceof OpenAiCreditsDepletedError) throw error;
    console.warn(`Briefing subject synthesis failed; using fallback subject: ${error.message}`);
  }

  const sharedSubjects = await synthesizeSharedRouteSubjects({
    apiKey: config.openai.apiKey,
    model: config.openai.model,
    routes: config.briefing.sharedRoutes,
    sections,
    subject,
    usageSink: (usage) => openAiUsageCalls.push(usage),
  });


  const openAiUsage = aggregateOpenAiUsage(openAiUsageCalls);
  const costs = estimateCosts({ runHealth, openAiUsage, costs: config.briefing.costs });
  const coverageWindow = {
    startTime: config.briefing.startTime,
    endTime: config.briefing.endTime,
  };
  const message = renderBriefing({
    subject,
    generatedAt,
    timezone: config.briefing.timezone,
    reminders: operationalReminders(config, generatedAt),
    runHealth,
    coverageWindow,
    sections,
  });

  const result = await sendEmail(config.email, message);
  persistRunOutcome({
    config,
    state,
    generatedAt,
    sections,
    runHealth,
    openAiUsage,
    costs,
    message,
    result,
  });
  await sendSharedBriefing(config, {
    subject,
    sharedSubjects,
    generatedAt,
    runHealth,
    coverageWindow,
    sections,
  });
}

main().catch(async (error) => {
  if (error instanceof XCreditsDepletedError || error instanceof OpenAiCreditsDepletedError) {
    try {
      const config = loadConfig();
      validateConfig(config);
      await sendCreditsDepletedNotification(config, error);
    } catch (notificationError) {
      console.error("Failed to send credits depleted notification:");
      console.error(notificationError.stack || notificationError.message);
    }
  }

  console.error(error.stack || error.message);
  process.exitCode = 1;
});
