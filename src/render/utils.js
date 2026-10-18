export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function formatDate(date, timezone) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: timezone,
  }).format(date);
}

export function topicLabel(section) {
  return section.label || section.title;
}

export function topicTitleList(sections) {
  return sections.map((section) => section.title).join(" / ");
}

export function formatCoverageWindow(coverageWindow, timezone) {
  if (!coverageWindow?.startTime || !coverageWindow?.endTime) return undefined;
  const start = new Date(coverageWindow.startTime);
  const end = new Date(coverageWindow.endTime);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return undefined;
  return `${formatDate(start, timezone)} to ${formatDate(end, timezone)}`;
}

export function displayTitle(section) {
  return section.label ? `${section.label} - ${section.title}` : section.title;
}

export function topicAccent(section) {
  const label = topicLabel(section);
  if (label === "SOX") return "#bd3039";
  if (label === "SPY") return "#067647";
  return "#475467";
}

export function marketContextLines(marketContext) {
  if (!marketContext) return [];
  return String(marketContext)
    .split(/\r?\n/)
    .filter((line) => /^(Ticker|Latest\/intraday price|Prior completed daily move|Market context unavailable):/.test(line));
}

function restorePlaceholders(value, placeholders) {
  return placeholders.reduce((text, placeholder, index) => text.replaceAll(`@@LINK_${index}@@`, placeholder), value);
}

export function summaryForDisplay(summary) {
  return String(summary)
    .split(/\r?\n/)
    .map((line) => {
      const links = [];
      const protectedLine = line.replace(/\[([^\]]+)\]\((https:\/\/x\.com\/i\/web\/status\/\d+)\)/gi, (match) => {
        const token = `@@LINK_${links.length}@@`;
        links.push(match);
        return token;
      });
      const cleaned = protectedLine
        .replace(/^(\s*(?:[-*]\s*)?(?:\*\*)?)executive readout(?:\*\*)?\s*:\s*/i, "$1")
        .replace(/\s*\[[^\]]*source[^\]]*\]\(\s*\)[.;,]?/gi, "")
        .replace(/\s*\[\s*sources?\s*\][.;,]?/gi, "")
        .replace(/\s+from\s+(?:sources?|source):\s*(?:\(?https:\/\/x\.com\/i\/web\/status\/\d+\)?[.;,]?\s*)+/gi, " ")
        .replace(/\s*(?:Sources?|Source):\s*(?:\(?https:\/\/x\.com\/i\/web\/status\/\d+\)?[.;,]?\s*)+/gi, " ")
        .replace(/(?:\s*\(?https:\/\/x\.com\/i\/web\/status\/\d+\)?[.;,]?\s*)+/g, " ")
        .replace(/\[\s*\]/g, "")
        .replace(/\s*(?:Sources?|Source):\s*$/i, "")
        .replace(/\s+([.,;:])/g, "$1")
        .replace(/;\s*$/g, "")
        .replace(/\s{2,}/g, " ")
        .trimEnd();
      return restorePlaceholders(cleaned, links);
    })
    .filter((line) => !/^[-*;]\s*$/.test(line.trim()))
    .join("\n")
    .trim();
}

export function signalRatio(signalPosts, fetchedPosts) {
  if (!fetchedPosts) return "n/a";
  return `${Math.round((signalPosts / fetchedPosts) * 100)}%`;
}

export function plural(count, singular, pluralValue = `${singular}s`) {
  return Number(count) === 1 ? singular : pluralValue;
}
