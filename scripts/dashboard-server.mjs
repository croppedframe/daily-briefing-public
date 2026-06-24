import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { extname } from "node:path";

const PORT = Number(process.env.PORT || 3010);
const HISTORY_FILE = process.env.BRIEFING_RUN_HISTORY_FILE || "data/run-history.jsonl";
const STATE_FILE = process.env.BRIEFING_STATE_FILE || "data/briefing-state.json";

function parseEnvValue(value) {
  const trimmed = value.trim();
  const quote = trimmed[0];
  if ((quote === "\"" || quote === "'") && trimmed.endsWith(quote)) return trimmed.slice(1, -1);
  return trimmed;
}

function loadLocalEnv(path = ".env") {
  if (!existsSync(path)) return;

  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;

    const separator = trimmed.indexOf("=");
    const key = trimmed.slice(0, separator).trim();
    const value = parseEnvValue(trimmed.slice(separator + 1));
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

function readJsonl(path) {
  if (!existsSync(path)) return [];

  return readFileSync(path, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        return {
          version: 1,
          generatedAt: undefined,
          completedAt: undefined,
          subject: `Unparseable history line ${index + 1}`,
          parseError: error.message,
        };
      }
    });
}

function readState(path) {
  if (!existsSync(path)) return undefined;

  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return undefined;
  }
}

function money(value) {
  if (!Number.isFinite(value)) return "Not configured";
  if (value < 0.01) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(2)}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function num(value) {
  return Number.isFinite(value) ? value : 0;
}

function pct(part, whole) {
  if (!whole) return "n/a";
  return `${Math.round((part / whole) * 100)}%`;
}

function dateText(value) {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: process.env.BRIEFING_TIMEZONE || "America/New_York",
    timeZoneName: "short",
  }).format(date);
}

function summarizeRuns(runs) {
  return runs.reduce(
    (totals, run) => {
      const health = run.runHealth?.totals || {};
      const openAi = run.openAi || {};
      const costs = run.costs || {};

      return {
        runs: totals.runs + 1,
        fetchedPosts: totals.fetchedPosts + num(health.fetchedPosts),
        signalPosts: totals.signalPosts + num(health.signalPosts),
        citedPosts: totals.citedPosts + num(health.citedPosts),
        duplicatePosts: totals.duplicatePosts + num(health.alreadySeenPosts),
        queriesAttempted: totals.queriesAttempted + num(health.queriesAttempted),
        queriesSucceeded: totals.queriesSucceeded + num(health.queriesSucceeded),
        queriesFailed: totals.queriesFailed + num(health.queriesFailed),
        queriesSkipped: totals.queriesSkipped + num(health.queriesSkipped),
        pagesFetched: totals.pagesFetched + num(health.pagesFetched),
        openAiCalls: totals.openAiCalls + num(openAi.calls),
        inputTokens: totals.inputTokens + num(openAi.inputTokens),
        outputTokens: totals.outputTokens + num(openAi.outputTokens),
        totalTokens: totals.totalTokens + num(openAi.totalTokens),
        xCost: Number.isFinite(costs.x) ? totals.xCost + costs.x : totals.xCost,
        openAiCost: Number.isFinite(costs.openAi) ? totals.openAiCost + costs.openAi : totals.openAiCost,
        totalCost: Number.isFinite(costs.total) ? totals.totalCost + costs.total : totals.totalCost,
      };
    },
    {
      runs: 0,
      fetchedPosts: 0,
      signalPosts: 0,
      citedPosts: 0,
      duplicatePosts: 0,
      queriesAttempted: 0,
      queriesSucceeded: 0,
      queriesFailed: 0,
      queriesSkipped: 0,
      pagesFetched: 0,
      openAiCalls: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      xCost: 0,
      openAiCost: 0,
      totalCost: 0,
    },
  );
}

function dashboardData() {
  loadLocalEnv();
  const runs = readJsonl(process.env.BRIEFING_RUN_HISTORY_FILE || HISTORY_FILE)
    .sort((a, b) => new Date(a.generatedAt || 0) - new Date(b.generatedAt || 0));
  const latest = runs.at(-1);
  const state = readState(process.env.BRIEFING_STATE_FILE || STATE_FILE);

  return {
    generatedAt: new Date().toISOString(),
    historyFile: process.env.BRIEFING_RUN_HISTORY_FILE || HISTORY_FILE,
    stateFile: process.env.BRIEFING_STATE_FILE || STATE_FILE,
    costRates: {
      xCostPerPost: process.env.X_COST_PER_POST_RETURNED || "",
      openAiInputCostPer1M: process.env.OPENAI_INPUT_COST_PER_1M_TOKENS || "",
      openAiOutputCostPer1M: process.env.OPENAI_OUTPUT_COST_PER_1M_TOKENS || "",
    },
    latest,
    state: state
      ? {
          updatedAt: state.updatedAt,
          seenPostIds: state.seenPostIds?.length || 0,
          queryCount: Object.keys(state.queries || {}).length,
        }
      : undefined,
    totals: summarizeRuns(runs),
    runs,
  };
}

function renderSparkline(runs, key) {
  const values = runs.slice(-24).map((run) => num(key(run)));
  if (values.length === 0) return "";
  const max = Math.max(...values, 1);
  const points = values
    .map((value, index) => {
      const x = values.length === 1 ? 0 : (index / (values.length - 1)) * 100;
      const y = 36 - (value / max) * 32;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return `<svg class="spark" viewBox="0 0 100 40" preserveAspectRatio="none"><polyline points="${points}"></polyline></svg>`;
}

function renderHtml(data) {
  const latest = data.latest;
  const totals = data.totals;
  const latestTotals = latest?.runHealth?.totals || {};
  const latestOpenAi = latest?.openAi || {};
  const latestCosts = latest?.costs || {};
  const latestTopics = latest?.runHealth?.topics || [];
  const runsDesc = [...data.runs].reverse().slice(0, 25);
  const hasRates =
    data.costRates.xCostPerPost && data.costRates.openAiInputCostPer1M && data.costRates.openAiOutputCostPer1M;

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Daily Briefing Ops</title>
  <style>
    :root { color-scheme: light; --ink: #111827; --muted: #667085; --line: #d0d5dd; --soft: #f8fafc; --blue: #175cd3; --green: #067647; --red: #b42318; }
    * { box-sizing: border-box; }
    body { margin: 0; font: 14px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #eef2f6; color: var(--ink); }
    main { max-width: 1180px; margin: 0 auto; padding: 24px; }
    header { display: flex; justify-content: space-between; gap: 16px; align-items: flex-end; margin-bottom: 18px; }
    h1 { margin: 0; font-size: 28px; letter-spacing: 0; }
    h2 { margin: 0 0 10px; font-size: 16px; }
    .muted { color: var(--muted); }
    .grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
    .wide { grid-column: span 2; }
    .panel, .metric { background: white; border: 1px solid var(--line); border-radius: 8px; padding: 14px; }
    .metric .label { color: var(--muted); font-size: 12px; text-transform: uppercase; font-weight: 700; }
    .metric .value { font-size: 26px; font-weight: 760; margin-top: 6px; }
    .metric .sub { color: var(--muted); margin-top: 4px; min-height: 20px; }
    .spark { width: 100%; height: 42px; margin-top: 8px; }
    .spark polyline { fill: none; stroke: var(--blue); stroke-width: 3; vector-effect: non-scaling-stroke; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 8px 10px; border-top: 1px solid #eaecf0; vertical-align: top; }
    th { color: var(--muted); font-size: 12px; text-transform: uppercase; }
    .ok { color: var(--green); font-weight: 700; }
    .bad { color: var(--red); font-weight: 700; }
    .notice { border-left: 4px solid var(--blue); }
    @media (max-width: 900px) { .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .wide { grid-column: span 2; } }
    @media (max-width: 620px) { main { padding: 14px; } header { display: block; } .grid { grid-template-columns: 1fr; } .wide { grid-column: span 1; } }
  </style>
</head>
<body>
<main>
  <header>
    <div>
      <h1>Daily Briefing Ops</h1>
      <div class="muted">Local retrieval, cost, and run-health dashboard</div>
    </div>
    <div class="muted">Updated ${escapeHtml(dateText(data.generatedAt))}</div>
  </header>

  ${
    data.runs.length === 0
      ? `<section class="panel notice"><h2>No run history yet</h2><p class="muted">Future successful briefing runs will append to <code>${escapeHtml(data.historyFile)}</code>. Run <code>npm run briefing</code> once, then refresh this page.</p></section>`
      : ""
  }

  <section class="grid" style="margin-bottom: 12px;">
    <div class="metric">
      <div class="label">Latest Run</div>
      <div class="value">${escapeHtml(latest ? dateText(latest.generatedAt) : "None")}</div>
      <div class="sub">${escapeHtml(latest?.subject || "No successful run logged yet")}</div>
    </div>
    <div class="metric">
      <div class="label">Fetched Posts</div>
      <div class="value">${num(latestTotals.fetchedPosts)}</div>
      <div class="sub">${totals.fetchedPosts} all-time</div>
      ${renderSparkline(data.runs, (run) => run.runHealth?.totals?.fetchedPosts)}
    </div>
    <div class="metric">
      <div class="label">Signal Ratio</div>
      <div class="value">${pct(num(latestTotals.signalPosts), num(latestTotals.fetchedPosts))}</div>
      <div class="sub">${num(latestTotals.signalPosts)} signal / ${num(latestTotals.fetchedPosts)} fetched</div>
      ${renderSparkline(data.runs, (run) => run.runHealth?.totals?.signalPosts)}
    </div>
    <div class="metric">
      <div class="label">Est. Latest Spend</div>
      <div class="value">${money(latestCosts.total)}</div>
      <div class="sub">${hasRates ? "X + OpenAI estimate" : "Set cost env vars for dollars"}</div>
    </div>
  </section>

  <section class="grid" style="margin-bottom: 12px;">
    <div class="metric">
      <div class="label">Queries</div>
      <div class="value">${num(latestTotals.queriesSucceeded)}/${num(latestTotals.queriesAttempted)}</div>
      <div class="sub">${num(latestTotals.queriesSkipped)} skipped by cost controls</div>
    </div>
    <div class="metric">
      <div class="label">OpenAI Tokens</div>
      <div class="value">${num(latestOpenAi.totalTokens).toLocaleString()}</div>
      <div class="sub">${num(latestOpenAi.calls)} calls; ${num(latestOpenAi.inputTokens).toLocaleString()} in / ${num(latestOpenAi.outputTokens).toLocaleString()} out</div>
    </div>
    <div class="metric">
      <div class="label">State Memory</div>
      <div class="value">${data.state?.seenPostIds || 0}</div>
      <div class="sub">${escapeHtml(data.state ? `${data.state.queryCount} tracked queries` : "state file missing")}</div>
    </div>
    <div class="metric">
      <div class="label">All-Time Est. Spend</div>
      <div class="value">${money(totals.totalCost)}</div>
      <div class="sub">${money(totals.xCost)} X / ${money(totals.openAiCost)} OpenAI</div>
    </div>
  </section>

  <section class="grid">
    <div class="panel wide">
      <h2>Latest Topic Health</h2>
      <table>
        <thead><tr><th>Topic</th><th>Queries</th><th>Fetched</th><th>Signal</th><th>Cited</th><th>Ratio</th></tr></thead>
        <tbody>
          ${
            latestTopics
              .map(
                (topic) => `<tr>
                  <td>${escapeHtml(topic.title)}</td>
                  <td>${num(topic.queriesSucceeded)}/${num(topic.queriesAttempted)} <span class="muted">(${num(topic.queriesSkipped)} skipped)</span></td>
                  <td>${num(topic.fetchedPosts)}</td>
                  <td>${num(topic.signalPosts)}</td>
                  <td>${num(topic.citedPosts)}</td>
                  <td>${pct(num(topic.signalPosts), num(topic.fetchedPosts))}</td>
                </tr>`,
              )
              .join("") || `<tr><td colspan="6" class="muted">No topic health yet.</td></tr>`
          }
        </tbody>
      </table>
    </div>

    <div class="panel wide">
      <h2>Recent Runs</h2>
      <table>
        <thead><tr><th>Run</th><th>Subject</th><th>Fetched</th><th>Signal</th><th>Skipped</th><th>Tokens</th><th>Spend</th></tr></thead>
        <tbody>
          ${
            runsDesc
              .map((run) => {
                const health = run.runHealth?.totals || {};
                return `<tr>
                  <td>${escapeHtml(dateText(run.generatedAt))}</td>
                  <td>${escapeHtml(run.subject || "")}</td>
                  <td>${num(health.fetchedPosts)}</td>
                  <td>${num(health.signalPosts)}</td>
                  <td>${num(health.queriesSkipped)}</td>
                  <td>${num(run.openAi?.totalTokens).toLocaleString()}</td>
                  <td>${money(run.costs?.total)}</td>
                </tr>`;
              })
              .join("") || `<tr><td colspan="7" class="muted">No successful run history yet.</td></tr>`
          }
        </tbody>
      </table>
    </div>
  </section>
</main>
</body>
</html>`;
}

function send(res, status, body, contentType = "text/html; charset=utf-8") {
  res.writeHead(status, {
    "Content-Type": contentType,
    "Cache-Control": "no-store",
  });
  res.end(body);
}

createServer((req, res) => {
  const url = new URL(req.url || "/", `http://localhost:${PORT}`);
  const data = dashboardData();

  if (url.pathname === "/api/runs") {
    send(res, 200, JSON.stringify(data, null, 2), "application/json; charset=utf-8");
    return;
  }

  if (url.pathname === "/" || extname(url.pathname) === "") {
    send(res, 200, renderHtml(data));
    return;
  }

  send(res, 404, "Not found", "text/plain; charset=utf-8");
}).listen(PORT, "127.0.0.1", () => {
  console.log(`Daily Briefing Ops dashboard: http://localhost:${PORT}`);
});
