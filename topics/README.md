# Briefing Topics

This folder is the editorial workspace for the daily briefing. Each topic has:

- `wizard.md`: user-answered briefing preferences. Required before a live topic can run.
- `brief.md`: the standing prompt and editorial shape for the section.
- `sources.md`: trusted sources, watchlists, and source-handling notes.
- `x-query.md`: draft X recent-search queries that can become `TOPICS_JSON`.
- `framework.md` or a topic-named framework note: durable context, scorecards, key dates, and watch threads.

The live app reads topics from `topics/topics.json` by default. `TOPICS_JSON` can still override this, but every live topic must provide both `wizardPath` and `frameworkPath`.

Use `TOPIC_WIZARD_TEMPLATE.md` and `TOPIC_TEMPLATE.md` when adding a new topic or upgrading a lightweight topic into a full briefing framework.

## Current Topics

1. `boston-red-sox`
2. `sp500-market`

## Topic Pattern

Each topic should keep source hierarchy, stable analytical framework, key dates, open threads, and daily format notes in its framework file. The goal is to keep reusable background out of the daily summary while making it easy for the model to recognize what changed.

The public template now uses harmless example topics:

- `boston-red-sox`: sports/team briefing with trusted X sources and future structured sports-data support.
- `sp500-market`: broad market briefing centered on SPY price action, Google News context, and minimal/no X pulling because market X search is noisy.

## Wizard

Answer these once per topic in that topic's `wizard.md`. Short answers are fine. The briefing validates these files before it runs so the model has your standing preferences before it tries to interpret daily developments.

1. What decision should this topic help you make?
2. What is the ideal briefing length: 3 bullets, 1 paragraph, or deeper analysis?
3. Which sources do you trust most?
4. Which sources are useful but need caution?
5. Which sources should be excluded?
6. What keywords, accounts, tickers, sports teams, geographies, or companies define the topic?
7. What should count as high priority?
8. What should be ignored as noise?
9. Should the section include links to source posts/articles every time?
10. Should the tone be neutral analyst, market-oriented, fan of a team, or executive summary?
11. Which X accounts are reliable enough to prioritize for this topic?

## Draft `TOPICS_JSON`

Use this only after the queries are tuned. Include `wizardPath` and `frameworkPath` for every live topic:

```json
[
  {
    "id": "boston-red-sox",
    "title": "Boston Red Sox",
    "kind": "x-search",
    "trustedQuery": "(from:RedSox OR from:MLB OR from:IanMBrowne) (\"Red Sox\" OR RedSox OR lineup OR injury OR roster OR trade) -is:retweet -is:reply",
    "query": "(\"Red Sox\" OR RedSox OR \"Boston Red Sox\") (injury OR lineup OR roster OR trade OR prospect OR standings) -is:retweet -is:reply",
    "maxPosts": 20,
    "wizardPath": "boston-red-sox/wizard.md",
    "frameworkPath": "boston-red-sox/framework.md"
  },
  {
    "id": "sp500-market",
    "title": "S&P 500 Market",
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
]
```
