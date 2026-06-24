function formatDateOnly(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function formatGameTime(value, timezone) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || "n/a";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone,
    timeZoneName: "short",
  }).format(date);
}

function gameTeamName(game, side) {
  return game.teams?.[side]?.team?.name || side;
}

function probablePitcher(game, side) {
  return game.teams?.[side]?.probablePitcher?.fullName || "TBD";
}

function gameIsFinal(game) {
  return game.status?.abstractGameState === "Final" || /final/i.test(game.status?.detailedState || "");
}

function resultRow(game, timezone) {
  const away = game.teams?.away || {};
  const home = game.teams?.home || {};
  const winner = game.decisions?.winner?.fullName;
  const loser = game.decisions?.loser?.fullName;
  const save = game.decisions?.save?.fullName;
  const note = [
    winner ? `W: ${winner}` : "",
    loser ? `L: ${loser}` : "",
    save ? `SV: ${save}` : "",
  ]
    .filter(Boolean)
    .join("; ");

  return {
    date: formatGameTime(game.gameDate, timezone),
    matchup: `${gameTeamName(game, "away")} at ${gameTeamName(game, "home")}`,
    score: Number.isFinite(away.score) && Number.isFinite(home.score) ? `${away.score}-${home.score}` : "n/a",
    status: game.status?.detailedState || "Final",
    note: note || game.venue?.name || "",
  };
}

function nextGameRow(game, timezone) {
  return {
    date: formatGameTime(game.gameDate, timezone),
    matchup: `${gameTeamName(game, "away")} at ${gameTeamName(game, "home")}`,
    probablePitchers: `${probablePitcher(game, "away")} vs ${probablePitcher(game, "home")}`,
    venue: game.venue?.name || "",
    status: game.status?.detailedState || "",
  };
}

function standingsRows(payload, divisionId, teamId) {
  const records = payload.records || [];
  const divisionRecords = divisionId
    ? records.filter((record) => Number(record.division?.id) === Number(divisionId))
    : records;

  return divisionRecords
    .flatMap((record) => record.teamRecords || [])
    .sort((a, b) => Number(a.divisionRank || 999) - Number(b.divisionRank || 999))
    .map((record) => ({
      team: record.team?.name || "Unknown",
      record: `${record.wins}-${record.losses}`,
      pct: record.winningPercentage || "",
      gamesBack: record.gamesBack || "-",
      streak: record.streak?.streakCode || "",
      highlight: Number(record.team?.id) === Number(teamId),
    }));
}

function textTable(rows, columns) {
  if (!rows.length) return "No rows available.";

  return rows
    .map((row) => columns.map(([label, key]) => `${label}: ${row[key] || "n/a"}`).join(" | "))
    .join("\n");
}

function sportsContextText(context) {
  return [
    `Sports data: ${context.teamName}`,
    `Schedule window: ${context.window.startDate} to ${context.window.endDate}`,
    "",
    "Recent results:",
    textTable(context.recentResults, [
      ["Date", "date"],
      ["Matchup", "matchup"],
      ["Score", "score"],
      ["Status", "status"],
      ["Note", "note"],
    ]),
    "",
    "Upcoming games:",
    textTable(context.nextGames, [
      ["Date", "date"],
      ["Matchup", "matchup"],
      ["Probables", "probablePitchers"],
      ["Venue", "venue"],
      ["Status", "status"],
    ]),
    "",
    "Standings:",
    textTable(context.standings, [
      ["Team", "team"],
      ["Record", "record"],
      ["Pct", "pct"],
      ["GB", "gamesBack"],
      ["Streak", "streak"],
    ]),
  ].join("\n");
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`request failed (${response.status})`);
  return response.json();
}

export async function fetchSportsContext(sportsData, { generatedAt = new Date(), timezone = "America/New_York" } = {}) {
  if (!sportsData?.league) return undefined;
  if (sportsData.league !== "mlb") return undefined;

  const teamId = sportsData.teamId;
  const teamName = sportsData.teamName || `MLB team ${teamId}`;
  const startDate = formatDateOnly(addDays(generatedAt, -(sportsData.lookbackDays ?? 3)));
  const endDate = formatDateOnly(addDays(generatedAt, sportsData.lookaheadDays ?? 3));
  const season = generatedAt.getUTCFullYear();

  try {
    const scheduleUrl = `https://statsapi.mlb.com/api/v1/schedule?sportId=1&teamId=${encodeURIComponent(teamId)}&startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}&hydrate=team,linescore,decisions,probablePitcher,venue`;
    const standingsUrl = `https://statsapi.mlb.com/api/v1/standings?leagueId=103&season=${encodeURIComponent(season)}&standingsTypes=regularSeason&hydrate=team`;

    const [schedule, standings] = await Promise.all([fetchJson(scheduleUrl), fetchJson(standingsUrl)]);
    const games = (schedule.dates || []).flatMap((date) => date.games || []);
    const finals = games.filter(gameIsFinal).slice(-(sportsData.maxRecentResults ?? 4));
    const upcoming = games.filter((game) => !gameIsFinal(game)).slice(0, sportsData.maxNextGames ?? 3);

    const context = {
      type: "mlb",
      teamId,
      teamName,
      window: { startDate, endDate },
      recentResults: finals.map((game) => resultRow(game, timezone)),
      nextGames: upcoming.map((game) => nextGameRow(game, timezone)),
      standings: standingsRows(standings, sportsData.divisionId, teamId),
      error: undefined,
    };

    return {
      ...context,
      text: sportsContextText(context),
    };
  } catch (error) {
    return {
      type: "mlb",
      teamId,
      teamName,
      window: { startDate, endDate },
      recentResults: [],
      nextGames: [],
      standings: [],
      error: error.message,
      text: `Sports data: ${teamName}\nSports context unavailable: ${error.message}`,
    };
  }
}
