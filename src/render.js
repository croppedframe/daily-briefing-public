function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(date, timezone) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: timezone,
  }).format(date);
}

function formatShortDate(date, timezone) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone,
    timeZoneName: "short",
  }).format(date);
}

function topicLabel(section) {
  return section.label || section.title;
}

function topicLabelList(sections) {
  return sections.map(topicLabel).join(" / ");
}

function topicTitleList(sections) {
  return sections.map((section) => section.title).join(" / ");
}

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

function headlineForSection(section) {
  const lines = String(section.summary || "")
    .split(/\r?\n/)
    .map(cleanSubjectText)
    .filter(Boolean)
    .filter(
      (line) =>
        !/^(summary|executive readout|notable items|why this matters|watch next|price action|sources?|source collection warnings):?$/i.test(
          line,
        ),
    )
    .filter((line) => !/^no (reliable|meaningful) update/i.test(line))
    .filter((line) => !/^no source posts were cited/i.test(line))
    .filter(
      (line) =>
        !/^(the )?new posts\b/i.test(line) &&
        !/\bmostly noise\b/i.test(line) &&
        !/\bdo not change\b/i.test(line) &&
        !/\blooks slightly\b/i.test(line),
    );

  const fallback = quietSubjectSlug(section);
  const headline = compactSubjectPart(lines[0] || fallback, 3);
  return truncateSubjectPart(headline || fallback, 42);
}

function subjectForBriefing({ sections, subject }) {
  if (subject) return compactNotificationSubject(subject);

  const topicHeadlines = sections.map(headlineForSection).join(", ");
  return compactNotificationSubject(topicHeadlines);
}

function headingForBriefing(subject) {
  return subject ? cleanSubjectText(subject) : "Daily Briefing";
}

function formatCoverageWindow(coverageWindow, timezone) {
  if (!coverageWindow?.startTime || !coverageWindow?.endTime) return undefined;

  const start = new Date(coverageWindow.startTime);
  const end = new Date(coverageWindow.endTime);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return undefined;

  return `${formatDate(start, timezone)} to ${formatDate(end, timezone)}`;
}

function formatPostCreatedAt(post, timezone) {
  const createdAt = new Date(post.createdAt);
  if (Number.isNaN(createdAt.getTime())) return post.createdAt;

  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone,
    timeZoneName: "short",
  }).format(createdAt);
}

function formatPostAge(post, generatedAt) {
  const createdAt = new Date(post.createdAt);
  if (Number.isNaN(createdAt.getTime())) return undefined;

  const ageMinutes = Math.max(0, Math.round((generatedAt.getTime() - createdAt.getTime()) / 60000));
  if (ageMinutes < 60) return `${ageMinutes}m ago`;

  const ageHours = Math.round(ageMinutes / 60);
  if (ageHours < 48) return `${ageHours}h ago`;

  const ageDays = Math.round(ageHours / 24);
  return `${ageDays}d ago`;
}

function displayTitle(section) {
  return section.label ? `${section.label} - ${section.title}` : section.title;
}

function topicAccent(section) {
  const label = topicLabel(section);
  if (label === "SOX") return "#bd3039";
  if (label === "SPY") return "#067647";
  return "#475467";
}

function sourceStats(section) {
  const collected = section.rawPostCount || 0;
  const signal = section.signalPostCount || 0;
  const cited = section.posts.length;
  return `${cited} cited posts from ${signal} signal posts / ${collected} new posts analyzed`;
}

function signalRatio(signalPosts, fetchedPosts) {
  if (!fetchedPosts) return "n/a";
  return `${Math.round((signalPosts / fetchedPosts) * 100)}%`;
}

function plural(count, singular, pluralValue = `${singular}s`) {
  return Number(count) === 1 ? singular : pluralValue;
}

function textForPost(post, timezone, generatedAt) {
  const metrics = post.metrics;
  const age = formatPostAge(post, generatedAt);
  return [
    `${post.author.name} (@${post.author.username}) - ${formatPostCreatedAt(post, timezone)}${age ? ` - ${age}` : ""}`,
    post.text,
    `Metrics: ${metrics.likes} likes, ${metrics.reposts} reposts, ${metrics.replies} replies`,
    post.url,
  ].join("\n");
}

function marketContextLines(marketContext) {
  if (!marketContext) return [];

  return String(marketContext)
    .split(/\r?\n/)
    .filter((line) => /^(Ticker|Latest\/intraday price|Prior completed daily move|Market context unavailable):/.test(line));
}

function renderMarketContextText(marketContext) {
  const lines = marketContextLines(marketContext);
  if (lines.length === 0) return [];

  return ["Price action", ...lines.map((line) => `- ${line}`), ""];
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

function renderSportsRowsText(title, rows, columns) {
  if (!rows?.length) return [];

  return [
    title,
    ...rows.map((row) => `- ${columns.map(([label, key]) => `${label}: ${row[key] || "n/a"}`).join(" | ")}`),
    "",
  ];
}

function renderSportsContextText(sportsContext) {
  if (!sportsContext) return [];
  if (sportsContext.error) return ["Sports context", `- ${sportsContext.text}`, ""];

  return [
    "Sports context",
    ...renderSportsRowsText("Recent results", sportsContext.recentResults, [
      ["Date", "date"],
      ["Matchup", "matchup"],
      ["Score", "score"],
      ["Status", "status"],
      ["Note", "note"],
    ]),
    ...renderSportsRowsText("Upcoming games", sportsContext.nextGames, [
      ["Date", "date"],
      ["Matchup", "matchup"],
      ["Probables", "probablePitchers"],
      ["Venue", "venue"],
    ]),
    ...renderSportsRowsText("Standings", sportsContext.standings, [
      ["Team", "team"],
      ["Record", "record"],
      ["Pct", "pct"],
      ["GB", "gamesBack"],
      ["Streak", "streak"],
    ]),
  ];
}

function renderSportsTableHtml(title, rows, columns) {
  if (!rows?.length) return "";

  return `
    <h3 style="margin: 14px 0 6px; font-size: 14px; line-height: 1.3; color: #344054;">${escapeHtml(title)}</h3>
    <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
      <thead>
        <tr>
          ${columns.map(([label]) => `<th style="padding: 6px 8px 6px 0; text-align: left; color: #667085; border-bottom: 1px solid #d0d5dd;">${escapeHtml(label)}</th>`).join("")}
        </tr>
      </thead>
      <tbody>
        ${rows
          .map(
            (row) => `
              <tr style="${row.highlight ? "font-weight: 700;" : ""}">
                ${columns
                  .map(
                    ([, key]) =>
                      `<td style="padding: 6px 8px 6px 0; color: #344054; border-bottom: 1px solid #eaecf0;">${escapeHtml(row[key] || "n/a")}</td>`,
                  )
                  .join("")}
              </tr>
            `,
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function renderSportsContextHtml(sportsContext) {
  if (!sportsContext) return "";

  if (sportsContext.error) {
    return `
      <aside style="border: 1px solid #fedf89; border-radius: 8px; padding: 12px 14px; margin: 14px 0 18px; background: #fffaeb;">
        <h3 style="margin: 0 0 8px; font-size: 14px; line-height: 1.3; color: #93370d;">Sports context</h3>
        <p style="margin: 0; color: #93370d;">${escapeHtml(sportsContext.text)}</p>
      </aside>
    `;
  }

  return `
    <aside style="border: 1px solid #d0d5dd; border-radius: 8px; padding: 12px 14px; margin: 14px 0 18px; background: #f8fafc;">
      <h3 style="margin: 0 0 8px; font-size: 14px; line-height: 1.3; color: #344054;">Sports context</h3>
      ${renderSportsTableHtml("Recent results", sportsContext.recentResults, [
        ["Date", "date"],
        ["Matchup", "matchup"],
        ["Score", "score"],
        ["Status", "status"],
        ["Note", "note"],
      ])}
      ${renderSportsTableHtml("Upcoming games", sportsContext.nextGames, [
        ["Date", "date"],
        ["Matchup", "matchup"],
        ["Probables", "probablePitchers"],
        ["Venue", "venue"],
      ])}
      ${renderSportsTableHtml("Standings", sportsContext.standings, [
        ["Team", "team"],
        ["Record", "record"],
        ["Pct", "pct"],
        ["GB", "gamesBack"],
        ["Streak", "streak"],
      ])}
    </aside>
  `;
}

function inlineMarkdownToHtml(value) {
  return escapeHtml(value)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
}

function markdownToHtml(markdown) {
  const lines = String(markdown).split(/\r?\n/);
  const html = [];
  let listOpen = false;

  function closeList() {
    if (listOpen) {
      html.push("</ul>");
      listOpen = false;
    }
  }

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      closeList();
      continue;
    }

    if (/^(summary|executive readout|notable items|why this matters|watch next)$/i.test(trimmed.replace(/:$/, ""))) {
      closeList();
      const headingText = trimmed.replace(/:$/, "").replace(/^executive readout$/i, "Summary");
      html.push(
        `<h3 style="margin: 18px 0 8px; font-size: 14px; line-height: 1.35; color: #344054; text-transform: uppercase; letter-spacing: 0;">${inlineMarkdownToHtml(headingText)}</h3>`,
      );
      continue;
    }

    const heading = trimmed.match(/^(#{2,4})\s+(.+)$/);
    if (heading) {
      closeList();
      const level = Math.min(heading[1].length + 1, 4);
      html.push(
        `<h${level} style="margin: 18px 0 8px; font-size: ${level === 3 ? "16px" : "15px"}; line-height: 1.35; color: #101828;">${inlineMarkdownToHtml(heading[2])}</h${level}>`,
      );
      continue;
    }

    const bullet = trimmed.match(/^-\s+(.+)$/);
    if (bullet) {
      if (!listOpen) {
        html.push('<ul style="margin: 8px 0 14px; padding-left: 20px;">');
        listOpen = true;
      }
      html.push(`<li style="margin: 6px 0;">${inlineMarkdownToHtml(bullet[1])}</li>`);
      continue;
    }

    closeList();
    html.push(`<p style="margin: 8px 0 14px;">${inlineMarkdownToHtml(trimmed)}</p>`);
  }

  closeList();
  return html.join("\n");
}

function summaryForDisplay(summary) {
  return String(summary)
    .split(/\r?\n/)
    .map((line) =>
      line
        .replace(/^(\s*(?:[-*]\s*)?(?:\*\*)?)executive readout(?:\*\*)?\s*:\s*/i, "$1")
        .replace(
          /\s+from\s+(?:sources?|source):\s*(?:\(?https:\/\/x\.com\/i\/web\/status\/\d+\)?[.;,]?\s*)+/gi,
          " ",
        )
        .replace(
          /\s*(?:Sources?|Source):\s*(?:\(?https:\/\/x\.com\/i\/web\/status\/\d+\)?[.;,]?\s*)+/gi,
          " ",
        )
        .replace(/(?:\s*\(?https:\/\/x\.com\/i\/web\/status\/\d+\)?[.;,]?\s*)+/g, " ")
        .replace(/\s*(?:Sources?|Source):\s*$/i, "")
        .replace(/\s+([.,;:])/g, "$1")
        .replace(/;\s*$/g, "")
        .replace(/\s{2,}/g, " ")
        .trimEnd(),
    )
    .filter((line) => !/^[-*;]\s*$/.test(line.trim()))
    .join("\n")
    .trim();
}

function renderRunHealthText(runHealth) {
  if (!runHealth?.totals) return [];

  const totals = runHealth.totals;
  const warningText = totals.collectionWarnings ? `; ${totals.collectionWarnings} warnings` : "";
  const skippedQueries = `${totals.queriesSkipped} ${plural(totals.queriesSkipped, "query", "queries")}`;
  return [
    "Operations",
    `${totals.fetchedPosts} X posts fetched; ${totals.signalPosts} signal (${signalRatio(totals.signalPosts, totals.fetchedPosts)}); ${totals.citedPosts} cited; ${skippedQueries} skipped by cost controls${warningText}.`,
    "For full retrieval, token, and cost metrics, run npm run dashboard within your local repository.",
    "",
  ];
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

export function renderCreditsDepletedNotification({ generatedAt, timezone, error }) {
  const generatedAtText = formatDate(generatedAt, timezone);
  const subject = "Briefing paused: X API credits depleted";
  const accountLine = error.accountId ? `X account: ${error.accountId}` : "X account: not provided by API";

  const text = [
    subject,
    "",
    `Checked at: ${generatedAtText}`,
    accountLine,
    "",
    "The scheduled daily briefing started, but X rejected the search request because the account has no usable API credits left.",
    "",
    `X API response: ${error.detail || error.message}`,
    "",
    "Action needed: add X API credits or update billing in the X Developer Portal. The briefing will resume on the next scheduled run after credits are available.",
  ].join("\n");

  const html = `
    <!doctype html>
    <html>
      <body style="margin: 0; background: #f5f7fa; font-family: -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif; color: #17202a; line-height: 1.5;">
        <main style="max-width: 680px; margin: 0 auto; padding: 28px 18px;">
          <section style="background: #ffffff; border: 1px solid #d9e1ea; border-radius: 8px; padding: 24px;">
            <p style="margin: 0 0 8px; color: #a24100; font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0;">Action needed</p>
            <h1 style="margin: 0 0 16px; font-size: 24px; line-height: 1.25;">Briefing paused</h1>
            <p style="margin: 0 0 16px;">The scheduled daily briefing started, but X rejected the search request because the account has no usable API credits left.</p>
            <table style="width: 100%; border-collapse: collapse; margin: 0 0 18px;">
              <tr>
                <td style="padding: 8px 0; color: #536471; width: 120px;">Checked at</td>
                <td style="padding: 8px 0;">${escapeHtml(generatedAtText)}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #536471;">X account</td>
                <td style="padding: 8px 0;">${escapeHtml(error.accountId || "Not provided by API")}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #536471;">API status</td>
                <td style="padding: 8px 0;">${escapeHtml(error.title || "CreditsDepleted")} (${escapeHtml(error.status || 402)})</td>
              </tr>
            </table>
            <p style="margin: 0 0 16px; padding: 12px; background: #fff7ed; border: 1px solid #fed7aa; border-radius: 6px;">${escapeHtml(error.detail || error.message)}</p>
            <p style="margin: 0;">Add X API credits or update billing in the X Developer Portal. The briefing will resume on the next scheduled run after credits are available.</p>
          </section>
        </main>
      </body>
    </html>
  `;

  return { subject, text, html };
}

export function renderBriefing({ subject, generatedAt, timezone, reminders = [], runHealth, coverageWindow, sections }) {
  const renderedSubject = subjectForBriefing({ sections, subject });
  const heading = headingForBriefing(subject || renderedSubject);
  const coverage = topicTitleList(sections);
  const generatedAtText = formatDate(generatedAt, timezone);
  const coverageWindowText = formatCoverageWindow(coverageWindow, timezone);

  const text = [
    "Daily Briefing",
    heading,
    `Generated: ${generatedAtText}`,
    ...(coverageWindowText ? [`Coverage window: ${coverageWindowText}`] : []),
    `Coverage: ${coverage}`,
    "",
    ...sections.flatMap((section) => [
      displayTitle(section),
      "=".repeat(displayTitle(section).length),
      "",
      ...renderMarketContextText(section.marketContext),
      ...renderSportsContextText(section.sportsContext),
      summaryForDisplay(section.summary),
      "",
      ...(section.collectionWarnings?.length
        ? ["Source collection warnings", ...section.collectionWarnings.map((warning) => `- ${warning}`), ""]
        : []),
      `Sources (${sourceStats(section)})`,
      ...(section.posts.length > 0
        ? section.posts.map((post) => `- ${textForPost(post, timezone, generatedAt).replace(/\n/g, "\n  ")}`)
        : ["- No source posts were cited in the final summary."]),
      "",
    ]),
    ...renderRunHealthText(runHealth),
    ...(reminders.length > 0 ? ["Operational reminders", ...reminders.map((reminder) => `- ${reminder}`), ""] : []),
  ].join("\n");

  const htmlSections = sections
    .map((section) => {
      const accent = topicAccent(section);
      const posts = section.posts
        .map(
          (post) => {
            const age = formatPostAge(post, generatedAt);
            return `
              <li style="margin: 0 0 12px; padding: 12px 14px; border: 1px solid #eaecf0; border-radius: 8px; background: #fcfcfd;">
                <p style="margin: 0 0 8px; color: #101828;">${escapeHtml(post.text)}</p>
                <p style="margin: 0; color: #667085; font-size: 13px; line-height: 1.45;">
                  <strong style="color: #344054;">${escapeHtml(post.author.name)} (@${escapeHtml(post.author.username)})</strong>
                  &nbsp;·&nbsp; ${escapeHtml(formatPostCreatedAt(post, timezone))}
                  ${age ? `&nbsp;·&nbsp; ${escapeHtml(age)}` : ""}
                  &nbsp;·&nbsp; ${post.metrics.likes} likes
                  &nbsp;·&nbsp; ${post.metrics.reposts} reposts
                  &nbsp;·&nbsp; ${post.metrics.replies} replies
                  &nbsp;·&nbsp; <a style="color: ${accent}; text-decoration: none; font-weight: 600;" href="${escapeHtml(post.url)}">Open tweet</a>
                </p>
              </li>
            `;
          },
        )
        .join("");

      return `
        <section style="border-top: 4px solid ${accent}; margin-top: 28px; padding-top: 18px;">
          <p style="margin: 0 0 6px; color: ${accent}; font-size: 12px; font-weight: 700; letter-spacing: 0; text-transform: uppercase;">${escapeHtml(topicLabel(section))}</p>
          <h2 style="margin: 0 0 14px; font-size: 22px; line-height: 1.25; color: #101828;">${escapeHtml(section.title)}</h2>
          ${renderMarketContextHtml(section.marketContext)}
          ${renderSportsContextHtml(section.sportsContext)}
          <div style="font-size: 15px; color: #1d2939;">${markdownToHtml(summaryForDisplay(section.summary))}</div>
          ${
            section.collectionWarnings?.length
              ? `<div style="margin: 16px 0; padding: 12px 14px; border: 1px solid #fedf89; border-radius: 8px; background: #fffaeb;"><h3 style="margin: 0 0 8px; color: #93370d; font-size: 14px;">Source collection warnings</h3><ul style="margin: 0; padding-left: 18px;">${section.collectionWarnings
                  .map((warning) => `<li style="margin: 4px 0;">${escapeHtml(warning)}</li>`)
                  .join("")}</ul></div>`
              : ""
          }
          <h3 style="margin: 20px 0 6px; font-size: 15px; color: #344054;">Sources</h3>
          <p style="margin: 0 0 10px; color: #667085; font-size: 13px;">${escapeHtml(sourceStats(section))}.</p>
          <ol style="list-style: none; margin: 0; padding: 0;">${posts || '<li style="padding: 12px 14px; border: 1px solid #eaecf0; border-radius: 8px; color: #667085;">No source posts were cited in the final summary.</li>'}</ol>
        </section>
      `;
    })
    .join("");

  const html = `
    <!doctype html>
    <html>
      <body style="margin: 0; padding: 0; background: #f2f4f7; font-family: -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif; color: #17202a; line-height: 1.5;">
        <main style="max-width: 760px; margin: 0 auto; padding: 24px 12px;">
          <section style="background: #ffffff; border: 1px solid #d0d5dd; border-radius: 10px; overflow: hidden;">
            <div style="padding: 24px 26px 18px; border-bottom: 1px solid #eaecf0; background: #f9fafb;">
              <p style="margin: 0 0 8px; color: #667085; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0;">Daily Briefing</p>
              <h1 style="margin: 0; color: #101828; font-size: 28px; line-height: 1.18;">${escapeHtml(heading)}</h1>
              <p style="margin: 12px 0 0; color: #475467; font-size: 14px;">
                Generated: ${escapeHtml(generatedAtText)}<br>
                ${coverageWindowText ? `Coverage window: ${escapeHtml(coverageWindowText)}<br>` : ""}
                Coverage: ${escapeHtml(coverage)}
              </p>
            </div>
            <div style="padding: 4px 26px 26px;">
          ${htmlSections}
          ${renderRunHealthHtml(runHealth)}
          ${
            reminders.length > 0
              ? `<section style="border-top: 1px solid #eaecf0; margin-top: 24px; padding-top: 18px;">
                  <h2 style="margin: 0 0 8px; font-size: 16px; color: #344054;">Operational reminders</h2>
                  <ul style="margin: 0; padding-left: 18px;">${reminders.map((reminder) => `<li style="margin: 5px 0;">${escapeHtml(reminder)}</li>`).join("")}</ul>
                </section>`
              : ""
          }
            </div>
          </section>
        </main>
      </body>
    </html>
  `;

  return { subject: renderedSubject, text, html };
}
