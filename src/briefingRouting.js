import { sendEmail } from "./emailer.js";
import { renderBriefing } from "./render.js";
import { runHealthTotals } from "./runHealth.js";
import { synthesizeBriefingSubject } from "./summarizer.js";
import { OpenAiCreditsDepletedError } from "./openaiClient.js";

export function filterRunHealth(runHealth, topicIds) {
  if (!runHealth?.totals) return undefined;

  const allowed = new Set(topicIds);
  const topics = runHealth.topics.filter((topic) => allowed.has(topic.id));
  return {
    ...runHealth,
    topics,
    totals: runHealthTotals({ topics }),
  };
}

export function routeIncludesAllSections(routeTopicIds, sections) {
  if (routeTopicIds.length !== sections.length) return false;

  const routeTopics = new Set(routeTopicIds);
  return sections.every((section) => routeTopics.has(section.id));
}

export function sharedRouteKey(topicIds) {
  return [...new Set(topicIds)].sort().join(",");
}

export async function synthesizeSharedRouteSubjects({
  apiKey,
  model,
  routes,
  sections,
  subject,
  usageSink,
  synthesize = synthesizeBriefingSubject,
}) {
  const subjects = new Map();

  for (const route of routes) {
    const key = sharedRouteKey(route.topicIds);
    if (subjects.has(key)) continue;
    if (routeIncludesAllSections(route.topicIds, sections)) {
      subjects.set(key, subject);
      continue;
    }

    const sharedTopicIds = new Set(route.topicIds);
    const sharedSections = sections.filter((section) => sharedTopicIds.has(section.id));
    if (sharedSections.length === 0) continue;

    try {
      subjects.set(key, await synthesize({ apiKey, model, sections: sharedSections, usageSink }));
    } catch (error) {
      if (error instanceof OpenAiCreditsDepletedError) throw error;
      console.warn(`Shared briefing subject synthesis failed for ${key}; using fallback subject: ${error.message}`);
    }
  }

  return subjects;
}

export function sharedSubjectOptions({ route, sections, sharedSections, subject, sharedSubjects }) {
  const sharedSubject = sharedSubjects?.get(sharedRouteKey(route.topicIds));
  if (sharedSubject) return { subject: sharedSubject };
  if (routeIncludesAllSections(route.topicIds, sections)) return { subject };
  if (sections.length > 1 && sharedSections.length === 1) return { singleTopicHeadlineCount: 3 };
  return {};
}

export async function sendSharedBriefing(config, {
  subject,
  sharedSubjects,
  generatedAt,
  runHealth,
  coverageWindow,
  sections,
}) {
  if (config.briefing.sharedRoutes.length === 0) return;

  for (const route of config.briefing.sharedRoutes) {
    const sharedTopicIds = new Set(route.topicIds);
    const sharedSections = sections.filter((section) => sharedTopicIds.has(section.id));
    if (sharedSections.length === 0) {
      console.warn(`Shared briefing skipped for ${route.to}: no sections matched ${route.topicIds.join(", ")}.`);
      continue;
    }

    const message = renderBriefing({
      ...sharedSubjectOptions({ route, sections, sharedSections, subject, sharedSubjects }),
      generatedAt,
      timezone: config.briefing.timezone,
      runHealth: filterRunHealth(runHealth, route.topicIds),
      coverageWindow,
      sections: sharedSections,
    });

    try {
      const result = await sendEmail({ ...config.email, to: route.to }, message);
      console.log(`Shared briefing sent to ${route.to}: ${result.messageId || "ok"}`);
    } catch (error) {
      console.warn(`Shared briefing send failed for ${route.to}: ${error.message}`);
    }
  }
}
