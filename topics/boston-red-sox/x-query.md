# Boston Red Sox X Query Notes

## Trusted Query

```text
(from:RedSox OR from:MLB OR from:IanMBrowne OR from:alexspeier OR from:ChrisCotillo OR from:PeteAbe OR from:Sean_McAdam) ("Red Sox" OR RedSox OR Boston OR Sox OR Fenway OR roster OR lineup OR injury OR IL OR rehab OR trade OR prospect OR Worcester OR WooSox OR game OR series) -is:retweet -is:reply
```

## Broad Query

```text
("Red Sox" OR RedSox OR "Boston Red Sox" OR Fenway OR WooSox) (injury OR injured OR IL OR lineup OR roster OR trade OR call-up OR optioned OR DFA OR prospect OR starter OR bullpen OR standings OR series) -is:retweet -is:reply
```

## Notes

- Trusted query should carry most runs.
- Broad query is morning-only insurance and should be skipped when trusted sources produce enough signal.
- Keep betting, fantasy, ticket, and merch language in excludes.
