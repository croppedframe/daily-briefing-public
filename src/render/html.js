import { renderSportsContextHtml } from "./sports.js";
import { renderSourceCardsHtml, sourceStats } from "./sourceCards.js";
import { escapeHtml, marketContextLines, plural, signalRatio, summaryForDisplay, topicAccent, topicLabel } from "./utils.js";

function restorePlaceholders(value, placeholders) {
  return placeholders.reduce((text, placeholder, index) => text.replaceAll(`@@LINK_${index}@@`, placeholder), value);
}

const PUBLICATION_NAMES = new Map([
  ["apnews.com", "AP"],
  ["archives.gov", "National Archives"],
  ["bloomberg.com", "Bloomberg"],
  ["congress.gov", "Congress.gov"],
  ["federalnewsnetwork.com", "Federal News Network"],
  ["federalregister.gov", "Federal Register"],
  ["irs.gov", "IRS"],
  ["news.google.com", "Google News"],
  ["nytimes.com", "New York Times"],
  ["reuters.com", "Reuters"],
  ["treasury.gov", "U.S. Treasury"],
  ["washingtonpost.com", "Washington Post"],
  ["wsj.com", "Wall Street Journal"],
]);

function sourceNameForUrl(url, proposedLabel, sourcePosts) {
  const matchingPost = sourcePosts.find((post) => post.url === url || (post.id && url.includes(`/status/${post.id}`)));
  if (matchingPost?.author?.username) return `@${matchingPost.author.username.replace(/^@/, "")}`;

  const conciseLabel = String(proposedLabel || "").trim();
  const genericLabel = !conciseLabel || conciseLabel.length > 50 || /^https?:\/\//i.test(conciseLabel)
    || /^(?:sources?|link|article|full article|read more)$/i.test(conciseLabel);
  if (!genericLabel) return conciseLabel;

  try {
    const hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    if (hostname === "x.com" || hostname === "twitter.com") {
      const account = new URL(url).pathname.split("/").filter(Boolean)[0];
      return account && account !== "i" ? `@${account}` : "X";
    }
    return PUBLICATION_NAMES.get(hostname) || hostname;
  } catch {
    return "link";
  }
}

function inlineMarkdownToHtml(value, sourcePosts = []) {
  const links = [];
  const linkHtml = (url, label) => `<a style="color: #175cd3; text-decoration: none; font-weight: 600;" href="${escapeHtml(url)}">${escapeHtml(sourceNameForUrl(url, label, sourcePosts))}</a>`;
  const markdownProtected = String(value).replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (match, label, url) => {
    const token = `@@LINK_${links.length}@@`;
    links.push(linkHtml(url, label));
    return token;
  });
  const text = markdownProtected.replace(/https?:\/\/[^\s<]+/g, (match) => {
    const trailing = match.match(/[),.;:!?]+$/)?.[0] || "";
    const url = trailing ? match.slice(0, -trailing.length) : match;
    const token = `@@LINK_${links.length}@@`;
    links.push(linkHtml(url));
    return `${token}${trailing}`;
  });
  return restorePlaceholders(
    escapeHtml(text).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/\*([^*]+)\*/g, "<em>$1</em>"),
    links,
  );
}

export function markdownToHtml(markdown, sourcePosts = []) {
  const lines = String(markdown).split(/\r?\n/);
  const html = [];
  let listOpen = false;
  const closeList = () => {
    if (listOpen) {
      html.push("</ul>");
      listOpen = false;
    }
  };
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      closeList();
      continue;
    }
    if (/^(summary|executive readout|notable items|why this matters|watch next)$/i.test(trimmed.replace(/:$/, ""))) {
      closeList();
      const headingText = trimmed.replace(/:$/, "").replace(/^executive readout$/i, "Summary");
      html.push(`<h3 style="margin: 18px 0 8px; font-size: 14px; line-height: 1.35; color: #344054; text-transform: uppercase; letter-spacing: 0;">${inlineMarkdownToHtml(headingText, sourcePosts)}</h3>`);
      continue;
    }
    const heading = trimmed.match(/^(#{2,4})\s+(.+)$/);
    if (heading) {
      closeList();
      const level = Math.min(heading[1].length + 1, 4);
      html.push(`<h${level} style="margin: 18px 0 8px; font-size: ${level === 3 ? "16px" : "15px"}; line-height: 1.35; color: #101828;">${inlineMarkdownToHtml(heading[2], sourcePosts)}</h${level}>`);
      continue;
    }
    const bullet = trimmed.match(/^-\s+(.+)$/);
    if (bullet) {
      if (!listOpen) {
        html.push('<ul style="margin: 8px 0 14px; padding-left: 20px;">');
        listOpen = true;
      }
      html.push(`<li style="margin: 6px 0;">${inlineMarkdownToHtml(bullet[1], sourcePosts)}</li>`);
      continue;
    }
    closeList();
    html.push(`<p style="margin: 8px 0 14px;">${inlineMarkdownToHtml(trimmed, sourcePosts)}</p>`);
  }
  closeList();
  return html.join("\n");
}

function renderMarketContextHtml(marketContext) {
  const lines = marketContextLines(marketContext);
  if (lines.length === 0) return "";
  return `
    <aside style="border: 1px solid #d0d5dd; border-radius: 8px; padding: 12px 14px; margin: 14px 0 18px; background: #f8fafc;">
      <h3 style="margin: 0 0 8px; font-size: 14px; line-height: 1.3; color: #344054;">Price action</h3>
      <ul style="margin: 0; padding-left: 18px; color: #344054;">${lines.map((line) => `<li style="margin: 4px 0;">${escapeHtml(line)}</li>`).join("")}</ul>
    </aside>
  `;
}

function renderRunHealthHtml(runHealth) {
  if (!runHealth?.totals) return "";
  const totals = runHealth.totals;
  const warningText = totals.collectionWarnings ? `; ${totals.collectionWarnings} warnings` : "";
  const skippedQueries = `${totals.queriesSkipped} ${plural(totals.queriesSkipped, "query", "queries")}`;
  return `
    <section style="border-top: 1px solid #eaecf0; margin-top: 28px; padding-top: 16px; color: #667085; font-size: 13px;">
      <h2 style="margin: 0 0 6px; font-size: 14px; line-height: 1.35; color: #475467;">Operations</h2>
      <p style="margin: 0 0 6px;">${escapeHtml(totals.fetchedPosts)} X posts fetched; ${escapeHtml(totals.signalPosts)} signal (${escapeHtml(signalRatio(totals.signalPosts, totals.fetchedPosts))}); ${escapeHtml(totals.citedPosts)} cited; ${escapeHtml(skippedQueries)} skipped by cost controls${escapeHtml(warningText)}.</p>
      <p style="margin: 0;">For full retrieval, token, and cost metrics, run <code style="font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;">npm run dashboard</code> within your local repository.</p>
    </section>
  `;
}

function renderSection(section, timezone, generatedAt) {
  const accent = topicAccent(section);
  const posts = renderSourceCardsHtml(section, timezone, generatedAt);
  return `
    <section style="border-top: 4px solid ${accent}; margin-top: 28px; padding-top: 18px;">
      <p style="margin: 0 0 6px; color: ${accent}; font-size: 12px; font-weight: 700; letter-spacing: 0; text-transform: uppercase;">${escapeHtml(topicLabel(section))}</p>
      <h2 style="margin: 0 0 14px; font-size: 22px; line-height: 1.25; color: #101828;">${escapeHtml(section.title)}</h2>
      ${renderMarketContextHtml(section.marketContext)}
      ${renderSportsContextHtml(section.sportsContext)}
      <div style="font-size: 15px; color: #1d2939;">${markdownToHtml(summaryForDisplay(section.summary), section.posts)}</div>
      ${section.collectionWarnings?.length ? `<div style="margin: 16px 0; padding: 12px 14px; border: 1px solid #fedf89; border-radius: 8px; background: #fffaeb;"><h3 style="margin: 0 0 8px; color: #93370d; font-size: 14px;">Source collection warnings</h3><ul style="margin: 0; padding-left: 18px;">${section.collectionWarnings.map((warning) => `<li style="margin: 4px 0;">${escapeHtml(warning)}</li>`).join("")}</ul></div>` : ""}
      <h3 style="margin: 20px 0 6px; font-size: 15px; color: #344054;">Sources</h3>
      <p style="margin: 0 0 10px; color: #667085; font-size: 13px;">${escapeHtml(sourceStats(section))}.</p>
      <ol style="list-style: none; margin: 0; padding: 0;">${posts || '<li style="padding: 12px 14px; border: 1px solid #eaecf0; border-radius: 8px; color: #667085;">No source posts were cited in the final summary.</li>'}</ol>
    </section>
  `;
}

export function renderBriefingHtml({ heading, generatedAtText, coverageWindowText, coverage, timezone, generatedAt, reminders, runHealth, sections }) {
  const htmlSections = sections.map((section) => renderSection(section, timezone, generatedAt)).join("");
  return `
    <!doctype html>
    <html>
      <body style="margin: 0; padding: 0; background: #f2f4f7; font-family: -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif; color: #17202a; line-height: 1.5;">
        <main style="max-width: 760px; margin: 0 auto; padding: 24px 12px;">
          <section style="background: #ffffff; border: 1px solid #d0d5dd; border-radius: 10px; overflow: hidden;">
            <div style="padding: 24px 26px 18px; border-bottom: 1px solid #eaecf0; background: #f9fafb;">
              <p style="margin: 0 0 8px; color: #667085; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0;">Daily Briefing</p>
              <h1 style="margin: 0; color: #101828; font-size: 28px; line-height: 1.18;">${escapeHtml(heading)}</h1>
              <p style="margin: 12px 0 0; color: #475467; font-size: 14px;">Generated: ${escapeHtml(generatedAtText)}<br>${coverageWindowText ? `Coverage window: ${escapeHtml(coverageWindowText)}<br>` : ""}Coverage: ${escapeHtml(coverage)}</p>
            </div>
            <div style="padding: 4px 26px 26px;">
              ${htmlSections}
              ${renderRunHealthHtml(runHealth)}
              ${reminders.length > 0 ? `<section style="border-top: 1px solid #eaecf0; margin-top: 24px; padding-top: 18px;"><h2 style="margin: 0 0 8px; font-size: 16px; color: #344054;">Operational reminders</h2><ul style="margin: 0; padding-left: 18px;">${reminders.map((reminder) => `<li style="margin: 5px 0;">${escapeHtml(reminder)}</li>`).join("")}</ul></section>` : ""}
            </div>
          </section>
        </main>
      </body>
    </html>
  `;
}
