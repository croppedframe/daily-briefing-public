# Daily Briefing

A personal email briefing engine that turns trusted sources, topic rules, standing context, market data, sports data, and news context into scheduled briefings.

![Daily Briefing example email](./Daily%20Briefing%20Example%20Screenshot.png)

[Download the example email](./Daily%20Briefing%20Example.eml)

The public template ships with two example topics:

- **Boston Red Sox:** team news, roster signal, recent results, next games, and AL East standings.
- **S&P 500 Market:** SPY price action and broad market catalysts, with little to no X pulling because market X search is noisy.

## What It Does

- Pulls recent X posts using the X API v2 recent-search endpoint when a topic defines X queries.
- Adds structured SPY price action for market topics.
- Adds structured sports context such as recent results, upcoming games, and standings when configured.
- Adds Google News context for topics that define a `news` query.
- Filters sources through topic-specific trusted accounts, relevance gates, exclusions, and source-quality rules.
- Summarizes each topic with OpenAI when `OPENAI_API_KEY` is set, using each topic's `wizard.md` and `framework.md`.
- Sends one SMTP email with both HTML and plain-text versions.
- Tracks seen X posts in `data/briefing-state.json` so scheduled runs can avoid repeated source posts.
- Logs run health to `data/run-history.jsonl` for the local dashboard.

## Setup

Install dependencies:

```sh
npm install
```

Copy the environment template:

```sh
cp .env.example .env
```

Fill in `.env`:

- `X_BEARER_TOKEN`: X developer bearer token with read access. Required for topics that use X queries.
- `OPENAI_API_KEY`: optional but recommended for generated summaries.
- `SMTP_*`, `EMAIL_FROM`, `EMAIL_TO`: email sending details.

Run a preview without calling X, OpenAI, market data, sports data, or SMTP:

```sh
npm run preview
```

This writes:

- `data/preview.html`
- `data/preview.txt`

To generate shareable local example artifacts without any API keys or SMTP settings:

```sh
npm run example
```

This writes:

- `examples/briefing.html`
- `examples/briefing.txt`
- `examples/briefing.eml`

Open `examples/briefing.html` in a browser to capture screenshots, or open `examples/briefing.eml` in a mail client to inspect the email version.

To generate a live local email artifact on demand without sending SMTP or saving state:

```sh
npm run generate
```

This uses whatever local credentials are available:

- `OPENAI_API_KEY` enables generated summaries and subject line.
- `X_BEARER_TOKEN` enables live X collection for topics with X queries.
- Market data, sports data, and Google News context are fetched when configured.

It writes timestamped files under `generated/` plus convenient latest pointers:

- `generated/latest.html`
- `generated/latest.txt`
- `generated/latest.eml`

To send one real generated email immediately, fill in `.env` and run:

```sh
npm run send:now
```

This uses live collection/generation plus SMTP delivery, forces all configured topics to run, and sets `BRIEFING_SAVE_STATE=false` so the test send does not update seen-post memory.

At minimum, `.env` needs:

```sh
X_BEARER_TOKEN=...
OPENAI_API_KEY=...
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=...
SMTP_PASS=...
EMAIL_FROM="Daily Briefing <briefing@example.com>"
EMAIL_TO=you@example.com
```

Run a live briefing:

```sh
npm run briefing
```

View local run health, retrieval metrics, token usage, and estimated spend:

```sh
npm run dashboard
```

Then open `http://localhost:3010`.

## Topics

Topics live in `topics/topics.json`. Each topic should provide:

- `wizardPath`: user preferences, source standards, and noise boundaries.
- `frameworkPath`: stable context, scorecards, calendars, and format rules.

The app validates these files before running so a scheduled briefing cannot silently fall back to generic instructions.

New topics are intended to be created with a coding agent. Use a prompt like:

```text
Add a new briefing topic for [TOPIC NAME]. Use topics/TOPIC_WIZARD_TEMPLATE.md as the starting point for topics/[topic-id]/wizard.md, and use topics/TOPIC_TEMPLATE.md as the starting point for topics/[topic-id]/framework.md. Add sources.md and x-query.md if useful, then update topics/topics.json. Run npm run check when done.
```

The collector supports a trusted-first pattern:

- `trustedQuery`: narrow X query for reliable accounts.
- `query`: broader X query used as insurance.
- `broadQuerySkipTrustedCount`: skip the broad query when trusted sources already found enough posts.
- `broadQueryCadence`: run broad searches less often than trusted searches.
- `broadQueryUseSinceId`: avoid rescanning the full window for broad searches.

Topics can also use:

- `marketData.symbol`: fetches latest/intraday and prior completed daily price action.
- `news.query`: fetches Google News RSS context.
- `sportsData`: fetches structured sports context. The bundled example uses MLB team ID `111` for the Boston Red Sox.

## Example Topic Shapes

Red Sox sports topic:

```json
{
  "id": "boston-red-sox",
  "title": "Boston Red Sox",
  "label": "SOX",
  "cadence": "every_run",
  "kind": "x-search",
  "trustedQuery": "(from:RedSox OR from:MLB) (\"Red Sox\" OR RedSox OR lineup OR injury OR roster) -is:retweet -is:reply",
  "query": "(\"Red Sox\" OR RedSox OR \"Boston Red Sox\") (injury OR lineup OR roster OR trade OR standings) -is:retweet -is:reply",
  "sportsData": {
    "league": "mlb",
    "teamId": 111,
    "teamName": "Boston Red Sox",
    "divisionId": 201,
    "lookbackDays": 3,
    "lookaheadDays": 3
  },
  "wizardPath": "boston-red-sox/wizard.md",
  "frameworkPath": "boston-red-sox/framework.md"
}
```

S&P 500 market topic with no default X query:

```json
{
  "id": "sp500-market",
  "title": "S&P 500 Market",
  "label": "SPY",
  "cadence": "weekday_morning",
  "kind": "x-search",
  "maxPosts": 0,
  "marketData": {
    "symbol": "SPY"
  },
  "news": {
    "query": "S&P 500 SPY stock market Federal Reserve inflation earnings yields",
    "when": "2d",
    "maxItems": 8
  },
  "wizardPath": "sp500-market/wizard.md",
  "frameworkPath": "sp500-market/framework.md"
}
```

## Cadence

Supported topic cadences:

- `every_run`, `twice_daily`, or `always`: run whenever the app runs.
- `weekday_morning`: run before noon Monday through Friday in `BRIEFING_TIMEZONE`.
- `weekday_afternoon`: run at noon or later Monday through Friday in `BRIEFING_TIMEZONE`.
- `weekday`: run Monday through Friday.
- `morning`: run before noon.
- `afternoon`: run at noon or later.

Set `BRIEFING_RUN_ALL_TOPICS=true` to force every topic during a manual test.

## Backfill Runs

For a one-off continuity email after missed runs, use exact UTC timestamps:

```sh
BRIEFING_START_TIME=2026-06-19T21:05:00Z \
BRIEFING_END_TIME=2026-06-21T09:05:00Z \
BRIEFING_GENERATED_AT=2026-06-21T09:05:00Z \
BRIEFING_DISABLE_SINCE_ID=true \
BRIEFING_RUN_ALL_TOPICS=true \
npm run briefing
```

Backfills do not save `data/briefing-state.json` by default. To intentionally update seen-post memory from a backfill, add:

```sh
BRIEFING_SAVE_STATE=true
```

## Scheduling

The included GitHub Actions workflow runs by manual dispatch. You can use an external scheduler such as cron-job.org to call GitHub's `workflow_dispatch` API on your preferred schedule.

Configure these repository secrets before running in GitHub Actions:

- `X_BEARER_TOKEN`
- `OPENAI_API_KEY`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USER`
- `SMTP_PASS`
- `EMAIL_FROM`
- `EMAIL_TO`


Set day-to-day briefing intervals in `topics/topics.json`, not GitHub secrets. The scheduler wakes the app up; `cadence` decides whether each topic runs on that wakeup, and `lookbackHours` decides how much source history that topic collects.

Native GitHub scheduled runs are intentionally disabled because they can be delayed or occasionally dropped during high load.

Dispatch endpoint:

```text
POST https://api.github.com/repos/OWNER/REPO/actions/workflows/daily-briefing.yml/dispatches
```

Headers:

```text
Authorization: Bearer YOUR_GITHUB_TOKEN
Accept: application/vnd.github+json
X-GitHub-Api-Version: 2026-03-10
Content-Type: application/json
```

Body:

```json
{ "ref": "main" }
```

Good lightweight scheduler options:

- Google Apps Script time-driven trigger, if you already use Google.
- cron-job.org, if you want a free web scheduler without Google Workspace.
- Cloudflare Workers Cron, AWS EventBridge, or another cloud scheduler if you already use one.

For a local daily run on a machine you control, add a cron entry like:

```cron
0 7 * * * cd "/path/to/daily-briefing" && /usr/local/bin/npm run briefing >> briefing.log 2>&1
```

Use the full path to your `npm` binary from `which npm`.

The workflow has an optional `persist_state` input. When enabled, it commits `data/briefing-state.json` and `data/run-history.jsonl` back to the repository so GitHub-hosted runs remember seen posts and dashboard history. Leave it off for a simpler setup.

## Email Delivery Notes

If you send the briefing to Gmail or Google Workspace, consider creating a filter for the briefing sender:

- Apply a label such as `Daily Briefing`.
- Never send it to Spam.
- Always mark it as important.

For best results, send from a dedicated sender or alias.

## Development

Run syntax checks:

```sh
npm run check
```
