function cleanSubjectText(value) {
  return String(value)
    .replace(/\[[^\]]+\]\([^)]+\)/g, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[*_`#>]/g, "")
    .replace(/^\s*[-:•]+\s*/, "")
    .replace(/^\s*\d+\.\s*/, "")
    .replace(/^(summary|executive readout|notable items|why this matters|watch next|price action|sources?|source collection warnings):\s*/i, "")
    .replace(/\bSOX\b/g, "Red Sox")
    .replace(/\bSPY\b/g, "S&P 500")
    .replace(/\s+/g, " ")
    .trim();
}

function titleCaseSubjectPart(value) {
  return value.replace(/\b[a-z][a-z']*\b/g, (word) => word[0].toUpperCase() + word.slice(1));
}

function truncateSubjectPart(value, maxLength) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 3).trim()}...`;
}

function quietSubjectSlug(section) {
  if (section.id === "boston-red-sox") return "Sox Quiet";
  if (section.id === "sp500-market") return "Markets Quiet";
  return `${section.title} Quiet`;
}

function compactWords(value, maxWords = 4) {
  const [firstPhrase] = cleanSubjectText(value)
    .replace(/[.;:]+$/g, "")
    .split(/\s+(?:and|but|while)\s+|[,;]/i);
  const words = String(firstPhrase || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, maxWords);

  return titleCaseSubjectPart(words.join(" "));
}

function compactSubjectPart(value, maxWords = 4) {
  return compactWords(value, maxWords);
}

function compactNotificationSubject(value) {
  const text = cleanSubjectText(value);
  if (!text) return "";

  const parts = text
    .split(/\s*,\s*|\s*;\s*/)
    .map((part) => compactSubjectPart(part, 3))
    .filter(Boolean);

  if (parts.length > 1) return truncateSubjectPart(parts.slice(0, 3).join(", "), 78);

  const clauses = text
    .split(/\s+as\s+|\s+and\s+/i)
    .map((part) => compactSubjectPart(part, 3))
    .filter(Boolean);
  if (clauses.length > 1) return truncateSubjectPart(clauses.slice(0, 3).join(", "), 78);

  return truncateSubjectPart(compactSubjectPart(text, 6), 78);
}

function headlinesForSection(section, maxHeadlines = 1) {
  const lines = String(section.summary || "")
    .split(/\r?\n/)
    .map(cleanSubjectText)
    .filter(Boolean)
    .filter((line) => !/^(summary|executive readout|notable items|why this matters|watch next|price action|sources?|source collection warnings):?$/i.test(line))
    .filter((line) => !/^no (reliable|meaningful) update/i.test(line) && !/^no source posts were cited/i.test(line))
    .filter((line) => !/^(the )?new posts\b/i.test(line) && !/\bmostly noise\b/i.test(line) && !/\bdo not change\b/i.test(line) && !/\blooks slightly\b/i.test(line));
  const fallback = quietSubjectSlug(section);
  const seen = new Set();
  const headlines = [];
  for (const line of lines) {
    const headline = compactSubjectPart(line || fallback, 3);
    const key = headline.toLowerCase();
    if (!headline || seen.has(key)) continue;
    seen.add(key);
    headlines.push(truncateSubjectPart(headline, 42));
    if (headlines.length >= maxHeadlines) break;
  }
  return headlines.length > 0 ? headlines : [fallback];
}

export function subjectForBriefing({ sections, subject, singleTopicHeadlineCount = 1 }) {
  if (subject) return compactNotificationSubject(subject);
  const headlines = sections.length === 1 && singleTopicHeadlineCount > 1
    ? headlinesForSection(sections[0], singleTopicHeadlineCount).join(", ")
    : sections.map((section) => headlinesForSection(section, 1)[0]).join(", ");
  return compactNotificationSubject(headlines);
}

export function headingForBriefing(subject) {
  return subject ? cleanSubjectText(subject) : "Daily Briefing";
}
