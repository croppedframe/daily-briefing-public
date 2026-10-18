export function truncate(text, maxLength) {
  const safeText = text.toWellFormed();
  if (safeText.length <= maxLength) return safeText;

  let end = maxLength - 3;
  const lastCodeUnit = safeText.charCodeAt(end - 1);
  const nextCodeUnit = safeText.charCodeAt(end);
  if (
    lastCodeUnit >= 0xD800 && lastCodeUnit <= 0xDBFF
    && nextCodeUnit >= 0xDC00 && nextCodeUnit <= 0xDFFF
  ) {
    end -= 1;
  }

  return `${safeText.slice(0, end)}...`;
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
    ...topPosts.map((post) => `- ${post.text.replace(/\s+/g, " ")} [@${post.author.username.replace(/^@/, "")}](${post.url})`),
  ].join("\n");
}

function stripLeadingTitle(summary, title) {
  const escapedTitle = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const titlePattern = new RegExp(`^\\s*(#{1,6}\\s*)?${escapedTitle}\\s*\\n+`, "i");
  return summary.replace(titlePattern, "").trim();
}

function normalizedUrl(value) {
  try {
    const url = new URL(value);
    url.hash = "";
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    return url.toString();
  } catch {
    return undefined;
  }
}

export function suppliedCitationUrls({ posts = [], newsContext = "", sportsContext } = {}) {
  const urls = posts.map((post) => post.url).filter(Boolean);
  for (const match of String(newsContext).matchAll(/^Direct publisher URL:\s*(https?:\/\/\S+)\s*$/gim)) {
    urls.push(match[1]);
  }
  urls.push(...(sportsContext?.sourceUrls || []));
  return new Set(urls.map(normalizedUrl).filter(Boolean));
}

export function removeUnsuppliedLinks(summary, allowedUrls) {
  const allowed = allowedUrls instanceof Set ? allowedUrls : new Set(allowedUrls || []);
  const withoutInventedMarkdown = String(summary).replace(
    /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
    (match, label, url) => allowed.has(normalizedUrl(url)) ? match : label,
  );
  return withoutInventedMarkdown.replace(/https?:\/\/[^\s<]+/g, (match) => {
    const trailing = match.match(/[),.;:!?]+$/)?.[0] || "";
    const url = trailing ? match.slice(0, -trailing.length) : match;
    return allowed.has(normalizedUrl(url)) ? match : trailing;
  });
}

export function applySummaryMode(summary) {
  const text = String(summary || "").trim();
  const [firstLine, ...remainingLines] = text.split(/\r?\n/);
  const marker = firstLine.match(/^QUIET:\s*(.*)$/i);
  if (!marker) return text;

  const inlineSummary = marker[1].trim();
  return inlineSummary || remainingLines.join("\n").trim();
}

function cleanSubjectLine(subject) {
  return subject
    .replace(/^["']|["']$/g, "")
    .replace(/^subject:\s*/i, "")
    .replace(/\bexecutive readout:\s*/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

import { requestOpenAi } from "./openaiClient.js";

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
    "Use only the supplied X posts, market context, Google News context, and structured sports context. Do not invent facts. Keep uncertain claims clearly attributed.",
    `Do not include a heading or title for "${topic.title}" in your response; the email renderer adds the section title.`,
    topic.framework
      ? "Use the standing topic framework below as background, source guidance, and analytical structure. Do not restate the framework unless a supplied source changes it."
      : "Prioritize: major reported incidents, locations, actors, changes from routine, and what deserves monitoring next.",
    "Summarize only the new supplied posts. Connect updates back to the standing framework when useful.",
    "Use an economy of words suitable for a commute read. Never restate the standing thesis, repeat unchanged watch items, or pad a quiet section with boilerplate.",
    "If the supplied posts are weak, noisy, promotional, or merely commentary, say that clearly and do not manufacture a development.",
    "If and only if the entire topic has no material update or credible decision-useful watch item, return exactly `QUIET: <one plain sentence of 30 words or fewer>` as the entire response. Do not use the QUIET marker when any concrete update is worth retaining, even if another metric, source category, or subtopic has no update. A material response must not include the QUIET marker anywhere.",
    "When you use a supplied X post as evidence, label its inline markdown link with the author's X handle, for example [@account](SUPPLIED_POST_URL); never label it source. For news, name the publication and, only when a direct publisher URL is supplied, use the publication as the link label, for example [Reuters](DIRECT_PUBLISHER_URL). Never print a bare URL, use a generic source label, or cite a news.google.com redirect. Do not invent a direct article URL. The renderer also shows X source posts separately.",
    "Every reported development, including the opening paragraph and watch items, must include an inline markdown link to a supplied post URL, direct publisher article URL, or supplied sports source URL. Naming a publication without a link is insufficient. Omit stories without a usable supplied link; caveats about missing primary documents do not excuse missing article links.",
    "Use the user briefing preferences below to decide depth, tone, source strictness, and what counts as high priority.",
    marketContext
      ? "The renderer already inserts latest/intraday and prior completed daily price action above this summary. Do not repeat prices or create a Price action heading. On a quiet stock or ETF, add only one short sentence stating whether a material sourced catalyst was absent."
      : "",
    newsContext
      ? "This topic includes Google News context. Use it to identify possible catalysts, but clearly separate signal from noise. Benzinga, Stocktwits, Barron's, and similar finance-media items often describe price moves, analyst chatter, or recycled context that are not catalysts."
      : "",
    sportsContext
      ? "This topic includes structured sports context. Use it for factual game results, upcoming games, probable starters, and standings. Do not invent details beyond the supplied data. Cite the supplied sports source URLs. The renderer already shows the sports tables."
      : "",
    collectionWarnings.length > 0
      ? "Some source collection failed after retries. Do not treat that as a development, and do not repeat the full error text. The renderer will show warning details separately; analyze whatever reliable context is available."
      : "",
    topic.confidenceTiers
      ? "In Notable items, group developments under these subheadings when useful: Confirmed / higher confidence, Watch item, and Low-confidence / needs corroboration. Do not let thin or recycled claims appear equal to better-sourced developments."
      : "",
    "When there are material updates, start with one concise opening paragraph. Use Notable items, Why this matters, or Watch next only when each adds new decision-useful information; omit empty or repetitive headings. Keep Watch next to at most two specific near-term items. Do not use the label Executive readout.",
    topic.wizard ? ["", "User briefing preferences:", topic.wizard].join("\n") : "",
    topic.framework ? ["", "Standing topic framework:", topic.framework].join("\n") : "",
    marketContext ? ["", "Market context:", marketContext].join("\n") : "",
    newsContext ? ["", "Google News context:", newsContext].join("\n") : "",
    sportsContext?.text ? ["", "Sports context:", sportsContext.text, ...(sportsContext.sourceUrls || []).map((url) => `Sports source URL: ${url}`)].join("\n") : "",
    collectionWarnings.length > 0 ? ["", "Source collection warnings:", collectionWarnings.join("\n")].join("\n") : "",
    "",
    "Supplied X posts:",
    "",
    posts.length > 0 ? sourceDigest(posts) : "No source posts passed the reliability filter.",
  ]
    .filter(Boolean)
    .join("\n");

  const request = {
    apiKey,
    model,
    input: prompt,
    provider: "OpenAI summary",
    usageSink,
    usageMetadata: { type: "summary", topicId: topic.id, topicTitle: topic.title },
  };
  const allowedUrls = suppliedCitationUrls({ posts, newsContext, sportsContext });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { text } = await requestOpenAi({
      ...request,
      input: attempt === 0 ? prompt : `${prompt}\n\nThe previous response lacked valid citations. Include supplied inline article, post, or sports source links for reported developments. If none can be supported, return QUIET: No linked update is available.`,
    });
    if (!text) break;
    const cleaned = removeUnsuppliedLinks(stripLeadingTitle(text, topic.title), allowedUrls);
    if (/^QUIET:\s*[^\n]+$/i.test(cleaned) || /\[[^\]]+\]\(https?:\/\/[^)\s]+\)/.test(cleaned)) {
      return applySummaryMode(cleaned);
    }
  }
  return "Summary withheld because it could not be supported with valid source links.";
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

  const { text } = await requestOpenAi({
    apiKey,
    model,
    input: prompt,
    provider: "OpenAI subject",
    usageSink,
    usageMetadata: { type: "subject" },
    outputSeparator: " ",
  });
  return text ? cleanSubjectLine(text) : undefined;
}
