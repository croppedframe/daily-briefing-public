import assert from "node:assert/strict";
import test from "node:test";

import { selectSignalPosts, sourcePostsForSection } from "../src/postFilter.js";

function post(id, text, username, likes = 0) {
  return {
    id,
    text,
    url: `https://x.com/i/web/status/${id}`,
    author: { username, name: username },
    metrics: { likes, reposts: 0, replies: 0 },
  };
}

test("filtering removes promotions and irrelevant posts and keeps trusted sources subject to relevance", () => {
  const topic = {
    maxPosts: 5,
    relevanceTerms: ["baseball"],
    trustedAccounts: ["trusted"],
    minEngagement: 2,
  };
  const selected = selectSignalPosts(topic, [
    post("1", "Unrelated but authoritative", "trusted"),
    post("2", "Baseball roster update", "reporter", 4),
    post("3", "Baseball hot stock picks join my trading group", "promoter", 100),
    post("4", "Unrelated chatter", "random", 20),
  ]);

  assert.deepEqual(selected.map((item) => item.id), ["2"]);
});

test("filtering deduplicates posts and honors the topic result limit", () => {
  const duplicate = post("1", "Baseball update", "reporter", 1);
  const selected = selectSignalPosts(
    { maxPosts: 1, relevanceTerms: ["baseball"] },
    [duplicate, duplicate, post("2", "Baseball bigger update", "other", 10)],
  );
  assert.deepEqual(selected.map((item) => item.id), ["2"]);
});

test("cited-source mode retains material citations and excludes citations described as noise", () => {
  const material = post("1", "Material", "source");
  const noise = post("2", "Noise", "source");
  const separation = "Additional confirmed context. ".repeat(24);
  const summary = `Material development [source](${material.url}). ${separation} Promotional noise only [source](${noise.url}).`;
  const sources = sourcePostsForSection(
    { citedSourcesOnly: true, materialSourcesOnly: true, maxSourcePosts: 8 },
    [material, noise],
    summary,
  );
  assert.deepEqual(sources.map((item) => item.id), ["1"]);
});
