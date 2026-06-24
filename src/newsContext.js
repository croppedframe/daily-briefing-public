const DEFAULT_CAUTION_PUBLISHERS = ["Benzinga", "Stocktwits", "Barron's", "InvestorPlace", "The Motley Fool"];

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
  return match ? decodeXml(match[1].replace(/<!\\[CDATA\\[|\\]\\]>/g, "").trim()) : "";
}

function itemsFromRss(xml) {
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

function formatItems(items, cautionPublishers) {
  if (items.length === 0) return "No recent Google News items found.";

  return items
    .map((item, index) => {
      const caution = cautionPublishers.some((publisher) => item.source.toLowerCase().includes(publisher.toLowerCase()));
      return [
        `${index + 1}. ${item.title}`,
        `Source: ${item.source || "Unknown"}${caution ? " (use caution: often produces market-chatter/noise)" : ""}`,
        `Published: ${item.publishedAt || "n/a"}`,
        `URL: ${item.link}`,
      ].join("\n");
    })
    .join("\n\n");
}

export async function fetchNewsContext(newsConfig) {
  if (!newsConfig?.query) return undefined;

  const maxItems = newsConfig.maxItems ?? 6;
  const cautionPublishers = newsConfig.cautionPublishers || DEFAULT_CAUTION_PUBLISHERS;
  const query = `${newsConfig.query} when:${newsConfig.when || "2d"}`;
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Google News request failed (${response.status})`);

    const xml = await response.text();
    const items = itemsFromRss(xml).slice(0, maxItems);

    return [
      `Google News query: ${query}`,
      "Use these articles as context only. Separate concrete catalysts from recap, opinion, price-action filler, and syndicated finance-media chatter.",
      formatItems(items, cautionPublishers),
    ].join("\n\n");
  } catch (error) {
    return `Google News query: ${query}\nNews context unavailable: ${error.message}`;
  }
}
