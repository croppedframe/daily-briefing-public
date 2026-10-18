import { escapeHtml } from "./utils.js";

function renderSportsRowsText(title, rows, columns) {
  if (!rows?.length) return [];

  return [
    title,
    ...rows.map((row) => `- ${columns.map(([label, key]) => `${label}: ${row[key] || "n/a"}`).join(" | ")}`),
    "",
  ];
}

export function renderSportsContextText(sportsContext) {
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

export function renderSportsContextHtml(sportsContext) {
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
