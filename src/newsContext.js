const DEFAULT_CAUTION_PUBLISHERS = ["Benzinga", "Stocktwits", "Barron's", "InvestorPlace", "The Motley Fool"];

import { fetchProvider } from "./providerFetch.js";

const GOOGLE_NEWS_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/129.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

function decodeXml(value = "") {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", "\"")
    .replaceAll("&#39;", "'")
    .replaceAll("&apos;", "'");
}

function textBetween(value, tag) {
  const match = value.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? decodeXml(match[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim()) : "";
}

export function parseRssItems(xml) {
  return [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)].map((match) => {
    const item = match[0];
    const source = textBetween(item, "source");
    const title = textBetween(item, "title");
    const link = textBetween(item, "link");
    const publishedAt = textBetween(item, "pubDate");

    return {
      title,
      source,
      link,
      publishedAt,
    };
  });
}

function isGoogleNewsUrl(value) {
  try {
    return new URL(value).hostname === "news.google.com";
  } catch {
    return false;
  }
}

export function googleNewsArticleId(value) {
  try {
    const url = new URL(value);
    const parts = url.pathname.split("/").filter(Boolean);
    const articleIndex = parts.findIndex((part) => part === "articles" || part === "read");
    return url.hostname === "news.google.com" && articleIndex >= 0 ? parts[articleIndex + 1] : undefined;
  } catch {
    return undefined;
  }
}

export function isLikelyArticleUrl(value) {
  try {
    const url = new URL(value);
    if (!/^https?:$/.test(url.protocol) || isGoogleNewsUrl(value)) return false;
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length === 0) return false;
    const genericSections = new Set(["articles", "business", "home", "latest", "news", "politics", "tax", "technology", "world"]);
    return parts.length > 1 || !genericSections.has(parts[0].toLowerCase());
  } catch {
    return false;
  }
}

function attributeValue(html, name) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return html.match(new RegExp(`${escapedName}=["']([^"']+)["']`, "i"))?.[1];
}

async function decodingParams(link) {
  const articleId = googleNewsArticleId(link);
  if (!articleId) return undefined;

  const response = await fetchProvider(`https://news.google.com/rss/articles/${articleId}`, {
    provider: "Google News URL resolver",
    headers: GOOGLE_NEWS_HEADERS,
    retries: 1,
  });
  const html = await response.text();
  const signature = attributeValue(html, "data-n-a-sg");
  const timestamp = attributeValue(html, "data-n-a-ts");
  if (!signature || !timestamp) return undefined;
  return { articleId, signature, timestamp, sourceUrl: link };
}

export function parseGoogleNewsBatchResponse(text) {
  return String(text)
    .split(/\n\n+/)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.startsWith("["))
    .flatMap((chunk) => {
      try {
        const parsed = JSON.parse(chunk);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    })
    .filter((row) => Array.isArray(row) && ["wrb.fr", "w779db"].includes(row[0]) && row[1] === "Fbv4je")
    .map((row) => {
      try {
        const decodedUrl = JSON.parse(row[2])?.[1];
        return isLikelyArticleUrl(decodedUrl) ? decodedUrl : undefined;
      } catch {
        return undefined;
      }
    });
}

async function resolveGoogleNewsLink(link) {
  try {
    const params = await decodingParams(link);
    if (!params) return undefined;
    const payload = [
    "Fbv4je",
      `["garturlreq",[["X","X",["X","X"],null,null,1,1,"US:en",null,1,null,null,null,null,null,0,1],"X","X",1,[1,1,1],1,1,null,0,0,null,0],"${params.articleId}",${params.timestamp},"${params.signature}"]`,
    ];
    const response = await fetchProvider("https://news.google.com/_/DotsSplashUi/data/batchexecute", {
      provider: "Google News URL resolver",
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        "User-Agent": GOOGLE_NEWS_HEADERS["User-Agent"],
        Origin: "https://news.google.com",
        Referer: "https://news.google.com/",
      },
      body: `f.req=${encodeURIComponent(JSON.stringify([[payload]]))}`,
    });
    return parseGoogleNewsBatchResponse(await response.text())[0];
  } catch {
    return undefined;
  }
}

async function resolveGoogleNewsLinks(links) {
  const resolved = await Promise.all(links.map(async (link) => [link, await resolveGoogleNewsLink(link)]));
  return new Map(resolved.filter(([, url]) => url));
}

export async function resolveNewsItemLinks(items) {
  const googleLinks = [...new Set(items.map((item) => item.link).filter(isGoogleNewsUrl))];
  let decodedLinks = new Map();
  try {
    decodedLinks = await resolveGoogleNewsLinks(googleLinks);
  } catch {
    // Best effort: keep the publisher and headline, but never expose a broken redirect.
  }

  return items.map((item) => ({
    ...item,
    link: isGoogleNewsUrl(item.link) ? decodedLinks.get(item.link) || "" : item.link,
  }));
}

export function formatNewsItems(items, cautionPublishers) {
  if (items.length === 0) return "No recent Google News items found.";
  items = items.filter((item) => isLikelyArticleUrl(item.link));
  if (items.length === 0) return "News items omitted because no direct article links could be resolved.";

  return items
    .map((item, index) => {
      const caution = cautionPublishers.some((publisher) => item.source.toLowerCase().includes(publisher.toLowerCase()));
      return [
        `${index + 1}. ${item.title}`,
        `Publisher: ${item.source || "Unknown"}${caution ? " (use caution: often produces market-chatter/noise)" : ""}`,
        `Published: ${item.publishedAt || "n/a"}`,
        item.link && !isGoogleNewsUrl(item.link) ? `Direct publisher URL: ${item.link}` : "",
      ].join("\n");
    })
    .join("\n\n");
}

function validBoundary(value) {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export function filterNewsItemsByWindow(items, { startTime, endTime } = {}) {
  const start = validBoundary(startTime);
  const end = validBoundary(endTime);
  if (!start && !end) return items;

  return items.filter((item) => {
    const published = validBoundary(item.publishedAt);
    if (!published) return false;
    if (start && published <= start) return false;
    if (end && published > end) return false;
    return true;
  });
}

export async function fetchNewsContext(newsConfig, { startTime, endTime } = {}) {
  if (!newsConfig?.query) return undefined;

  const maxItems = newsConfig.maxItems ?? 6;
  const cautionPublishers = newsConfig.cautionPublishers || DEFAULT_CAUTION_PUBLISHERS;
  const query = `${newsConfig.query} when:${newsConfig.when || "2d"}`;
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;

  try {
    const response = await fetchProvider(url, { provider: "Google News" });
    const xml = await response.text();
    const windowedItems = filterNewsItemsByWindow(parseRssItems(xml), { startTime, endTime }).slice(0, maxItems);
    const items = await resolveNewsItemLinks(windowedItems);
    const coverage = [
      startTime ? `after ${new Date(startTime).toISOString()}` : undefined,
      endTime ? `through ${new Date(endTime).toISOString()}` : undefined,
    ].filter(Boolean).join(" ");

    return [
      `Google News query: ${query}`,
      coverage ? `Google News publication cutoff: ${coverage}.` : "",
      "Use these articles as context only. Separate concrete catalysts from recap, opinion, price-action filler, and syndicated finance-media chatter. Cite each reported item with an inline markdown link to its supplied direct publisher URL. Items without direct article links are excluded. Never invent a URL.",
      formatNewsItems(items, cautionPublishers),
    ].filter(Boolean).join("\n\n");
  } catch (error) {
    return `Google News query: ${query}\nNews context unavailable: ${error.message}`;
  }
}
