function truncate(text, maxLength) {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 3)}...`;
}

function sourceDigest(posts) {
  return posts
    .map((post, index) => {
      const metrics = post.metrics;
      return [
        `${index + 1}. ${post.author.name} (@${post.author.username})`,
        `Time: ${post.createdAt}`,
        `Engagement: ${metrics.likes} likes, ${metrics.reposts} reposts, ${metrics.replies} replies`,
        `Status ID: ${post.id}`,
        `URL: ${post.url}`,
        `Text: ${truncate(post.text.replace(/\s+/g, " "), 700)}`,
      ].join("\n");
    })
    .join("\n\n");
}

function fallbackSummary(posts, collectionWarnings = []) {
  if (posts.length === 0) {
    return [
      collectionWarnings.length > 0 ? `Source collection warning: ${collectionWarnings.join(" ")}` : "",
      "No reliable update found in the collected sources for this briefing window.",
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  const topPosts = [...posts]
    .sort((a, b) => b.metrics.likes + b.metrics.reposts - (a.metrics.likes + a.metrics.reposts))
    .slice(0, 5);

  return [
    `${posts.length} matching X posts were found. OpenAI summarization is disabled, so this section lists the highest-engagement posts.`,
    ...topPosts.map((post) => `- ${post.text.replace(/\s+/g, " ")} (${post.url})`),
  ].join("\n");
}

function stripLeadingTitle(summary, title) {
  const escapedTitle = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const titlePattern = new RegExp(`^\\s*(#{1,6}\\s*)?${escapedTitle}\\s*\\n+`, "i");
  return summary.replace(titlePattern, "").trim();
}

function cleanSubjectLine(subject) {
  return subject
    .replace(/^["']|["']$/g, "")
    .replace(/^subject:\s*/i, "")
    .replace(/\bexecutive readout:\s*/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeUsage(usage = {}) {
  return {
    inputTokens: usage.input_tokens || usage.inputTokens || 0,
    outputTokens: usage.output_tokens || usage.outputTokens || 0,
    totalTokens: usage.total_tokens || usage.totalTokens || 0,
  };
}

export async function summarizeTopic({
  apiKey,
  model,
  topic,
  posts,
  marketContext,
  newsContext,
  sportsContext,
  collectionWarnings = [],
  usageSink,
}) {
  if (!apiKey) return fallbackSummary(posts, collectionWarnings);
  if (posts.length === 0 && !marketContext && !newsContext && !sportsContext && collectionWarnings.length === 0) {
    return fallbackSummary(posts);
  }

  const prompt = [
    `Write a concise daily intelligence briefing section titled "${topic.title}".`,
    "Use only the supplied X posts, market context, and Google News context. Do not invent facts. Keep uncertain claims clearly attributed.",
    `Do not include a heading or title for "${topic.title}" in your response; the email renderer adds the section title.`,
    topic.framework
      ? "Use the standing topic framework below as background, source guidance, and analytical structure. Do not restate the framework unless a supplied source changes it."
      : "Prioritize: major reported incidents, locations, actors, changes from routine, and what deserves monitoring next.",
    "Summarize only the new supplied posts. Connect updates back to the standing framework when useful.",
    "If the supplied posts are weak, noisy, promotional, or merely commentary, say that clearly and do not manufacture a development.",
    "When you use a supplied X post as evidence, include the post URL only as a source reference, not as part of the prose. The renderer shows source posts separately and hides raw X status URLs from the briefing body.",
    "Every material factual item in Notable items should be backed by at least one supplied post URL. Do not make an item prominent if you cannot cite a supplied source for it.",
    "Use the user briefing preferences below to decide depth, tone, source strictness, and what counts as high priority.",
    marketContext
      ? "This topic includes market context. Incorporate the latest/intraday and prior completed daily price action into the delivered analysis as a distinct Price action item. Explain whether the move appears to have a sourced catalyst or should be treated only as context."
      : "",
    newsContext
      ? "This topic includes Google News context. Use it to identify possible catalysts, but clearly separate signal from noise. Benzinga, Stocktwits, Barron's, and similar finance-media items often describe price moves, analyst chatter, or recycled context that are not catalysts."
      : "",
    sportsContext
      ? "This topic includes structured sports context. Use it for factual game results, upcoming games, probable starters, and standings. Do not invent box-score details beyond the supplied sports data."
      : "",
    collectionWarnings.length > 0
      ? "Some source collection failed after retries. Do not treat that as a development, and do not repeat the full error text. The renderer will show warning details separately; analyze whatever reliable context is available."
      : "",
    topic.confidenceTiers
      ? "In Notable items, group developments under these subheadings when useful: Confirmed / higher confidence, Watch item, and Low-confidence / needs corroboration. Do not let thin or recycled claims appear equal to better-sourced developments."
      : "",
    "Start with one concise opening paragraph, then use these headings: Notable items, Why this matters, Watch next. Do not use the label Executive readout.",
    topic.wizard ? ["", "User briefing preferences:", topic.wizard].join("\n") : "",
    topic.framework ? ["", "Standing topic framework:", topic.framework].join("\n") : "",
    marketContext ? ["", "Market context:", marketContext].join("\n") : "",
    newsContext ? ["", "Google News context:", newsContext].join("\n") : "",
    sportsContext?.text ? ["", "Sports context:", sportsContext.text].join("\n") : "",
    collectionWarnings.length > 0 ? ["", "Source collection warnings:", collectionWarnings.join("\n")].join("\n") : "",
    "",
    "Supplied X posts:",
    "",
    posts.length > 0 ? sourceDigest(posts) : "No source posts passed the reliability filter.",
  ]
    .filter(Boolean)
    .join("\n");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: prompt,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI summary request failed (${response.status}): ${body}`);
  }

  const payload = await response.json();
  if (payload.usage) {
    usageSink?.({
      type: "summary",
      topicId: topic.id,
      topicTitle: topic.title,
      model,
      usage: normalizeUsage(payload.usage),
    });
  }
  const outputText = payload.output_text;

  if (outputText) return stripLeadingTitle(outputText.trim(), topic.title);

  const textBlocks = payload.output
    ?.flatMap((item) => item.content || [])
    .filter((content) => content.type === "output_text")
    .map((content) => content.text);

  const summary = textBlocks?.join("\n").trim();
  return summary ? stripLeadingTitle(summary, topic.title) : fallbackSummary(posts, collectionWarnings);
}

export async function synthesizeBriefingSubject({ apiKey, model, sections, usageSink }) {
  if (!apiKey || sections.length === 0) return undefined;

  const briefingDigest = sections
    .map((section) =>
      [
        `Topic: ${section.label ? `${section.label} - ` : ""}${section.title}`,
        "Summary:",
        truncate(section.summary.replace(/\s+/g, " "), 1800),
      ].join("\n"),
    )
    .join("\n\n");

  const prompt = [
    "Write one concise push-notification email subject line for the completed briefing below.",
    "Use 2 or 3 comma-separated story slugs.",
    "Each story slug should be 2 or 3 words when possible, and no more than 4 words.",
    "Each word should add information. Avoid weak verb-only phrases like Ukraine Strike Hits; prefer concrete targets such as Voronezh Factory Hit.",
    "Do not overstate outcomes: use measured language and only describe developments supported by the cited sources.",
    "Examples of the desired style: Sox Win Series, Rotation Thin, SPY Up, Fed Path Unclear.",
    "Base the subject on the actual synthesized lead across the topics, not on topic labels alone.",
    "Do not base the subject on a development unless it is supported by a material cited source in the completed briefing.",
    "Prefer concrete developments over generic framing.",
    "If a topic has only noise or no real update, omit it unless needed; then use plain words such as Sox Quiet or Markets Quiet.",
    "Do not use internal topic labels or abbreviations such as SOX or SPY.",
    "Do not use the words Daily Briefing, Briefing, Update, Executive readout, Status, or No.",
    "Do not include the date or time.",
    "Keep it under 80 characters.",
    "Return only the subject line, with no quotes and no explanation.",
    "",
    "Completed briefing:",
    briefingDigest,
  ].join("\n");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: prompt,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI subject request failed (${response.status}): ${body}`);
  }

  const payload = await response.json();
  if (payload.usage) {
    usageSink?.({
      type: "subject",
      model,
      usage: normalizeUsage(payload.usage),
    });
  }
  const outputText = payload.output_text;
  if (outputText) return cleanSubjectLine(outputText);

  const textBlocks = payload.output
    ?.flatMap((item) => item.content || [])
    .filter((content) => content.type === "output_text")
    .map((content) => content.text);

  const subject = textBlocks?.join(" ").trim();
  return subject ? cleanSubjectLine(subject) : undefined;
}
