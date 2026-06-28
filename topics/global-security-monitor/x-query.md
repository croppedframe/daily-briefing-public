# Draft X Queries

These are neutral starter patterns, not a private watchlist. Tune them before enabling live collection.

## Trusted Query

```text
(security OR conflict OR diplomacy OR sanctions OR infrastructure OR humanitarian OR cyber OR shipping OR energy) (reported OR confirmed OR official OR statement OR update OR advisory) -is:retweet -is:reply
```

## Broad Query

```text
("global security" OR "security update" OR "official statement" OR "humanitarian update" OR "infrastructure disruption" OR "shipping disruption" OR "energy security" OR "cyber incident") -is:retweet -is:reply
```

## Notes

- Prefer official accounts, established reporters, and transparent public-source analysts when converting these into `trustedQuery`.
- Keep broad queries narrow enough to control X pay-as-you-go cost.
- Exclude graphic, sensational, or rumor-heavy terms in `topics/topics.json`.
