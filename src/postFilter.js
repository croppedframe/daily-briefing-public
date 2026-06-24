const DEFAULT_EXCLUDE_TERMS = [
  "whatsapp",
  "trading group",
  "invite link",
  "sign up using my",
  "hot stock picks",
  "message me",
  "link on my homepage",
  "promo converting",
];

function normalizedText(post) {
  return `${post.text || ""} ${post.author?.username || ""} ${post.author?.name || ""}`.toLowerCase();
}

function postScore(post, trustedAccounts = []) {
  const username = post.author?.username?.toLowerCase();
  const trusted = trustedAccounts.map((account) => account.toLowerCase().replace(/^@/, ""));
  const metrics = post.metrics || {};

  let score = 0;
  if (trusted.includes(username)) score += 100;
  score += Math.min(metrics.likes || 0, 25);
  score += Math.min((metrics.reposts || 0) * 3, 30);
  score += Math.min((metrics.replies || 0) * 2, 20);
  if (post.text?.includes("http")) score += 2;

  return score;
}

function engagement(post) {
  const metrics = post.metrics || {};
  return (metrics.likes || 0) + (metrics.reposts || 0) + (metrics.replies || 0);
}

function trustedUsername(post, trustedAccounts = []) {
  const username = post.author?.username?.toLowerCase();
  const trusted = trustedAccounts.map((account) => account.toLowerCase().replace(/^@/, ""));
  return trusted.includes(username);
}

function hasExcludedTerm(post, excludeTerms) {
  const text = normalizedText(post);
  return excludeTerms.some((term) => text.includes(term.toLowerCase()));
}

function hasExcludedAccount(post, excludeAccounts) {
  const username = post.author?.username?.toLowerCase();
  const excluded = excludeAccounts.map((account) => account.toLowerCase().replace(/^@/, ""));
  return excluded.includes(username);
}

function matchesTerm(text, term) {
  return text.includes(String(term).toLowerCase());
}

function matchesRelevance(post, topic) {
  const text = normalizedText(post);
  const groups = topic.relevanceAllGroups || [];
  const terms = topic.relevanceTerms || [];

  if (groups.length > 0) {
    return groups.every((group) => group.some((term) => matchesTerm(text, term)));
  }

  if (terms.length > 0) {
    return terms.some((term) => matchesTerm(text, term));
  }

  return true;
}

function isLikelyReply(post) {
  return post.text?.trim().startsWith("@");
}

function isLikelyGeneratedUsername(username = "") {
  const clean = username.replace(/^@/, "");
  return /[a-z]{4,}\d{3,}$/i.test(clean) || /^[A-Z]?[a-z]{1,4}[A-Z]?[a-z]{1,4}\d{3,}$/i.test(clean);
}

function isTickerLinkDrop(post, topic) {
  const text = post.text || "";
  const words = text.replace(/https?:\/\/\S+/g, "").split(/\s+/).filter(Boolean);
  const hasTicker = (topic.relevanceTerms || []).some((term) => text.toLowerCase().includes(String(term).toLowerCase()));
  return hasTicker && /https?:\/\/|t\.co\//i.test(text) && words.length <= 8;
}

function isLowQualityUntrustedLinkDrop(post, topic, trustedAccounts) {
  if (trustedUsername(post, trustedAccounts)) return false;
  if (engagement(post) > 0) return false;
  if (!/https?:\/\/|t\.co\//i.test(post.text || "")) return false;

  return topic.rejectZeroEngagementLinkDrops || topic.rejectGeneratedUsernames || isTickerLinkDrop(post, topic);
}

function passesQualityGates(post, topic, trustedAccounts) {
  if (topic.rejectGeneratedUsernames && !trustedUsername(post, trustedAccounts) && engagement(post) === 0) {
    if (isLikelyGeneratedUsername(post.author?.username)) return false;
  }

  if (topic.rejectZeroEngagementLinkDrops && isLowQualityUntrustedLinkDrop(post, topic, trustedAccounts)) return false;
  if (topic.rejectTickerLinkDrops && isTickerLinkDrop(post, topic) && !trustedUsername(post, trustedAccounts)) return false;

  return true;
}

function materialContext(summary, post) {
  const needles = [post.url, post.id].filter(Boolean);
  const index = needles.map((needle) => summary.indexOf(needle)).find((position) => position >= 0);
  if (index === undefined || index < 0) return "";

  const start = Math.max(0, index - 260);
  const end = Math.min(summary.length, index + 260);
  return summary.slice(start, end).toLowerCase();
}

function isNoiseCitation(summary, post) {
  const context = materialContext(summary, post);
  if (!context) return false;

  return [
    "noise",
    "spammy",
    "promotional",
    "low-quality",
    "low quality",
    "not a fresh",
    "not a confirmed",
    "not a sourced",
    "not a usable",
    "not evidence",
    "not a new",
    "does not change",
    "do not change",
    "no material",
    "no reliable",
    "no new investable",
    "commentary",
    "duplicative",
    "anecdotal",
    "low-confidence",
    "needs corroboration",
    "link drop",
    "bait",
    "unrelated",
    "should be treated as noise",
  ].some((term) => context.includes(term));
}

export function selectSignalPosts(topic, posts) {
  const excludeTerms = [...DEFAULT_EXCLUDE_TERMS, ...(topic.excludeTerms || [])];
  const excludeAccounts = topic.excludeAccounts || [];
  const trustedAccounts = topic.trustedAccounts || [];
  const minEngagement = topic.minEngagement ?? 0;

  const deduped = new Map();
  for (const post of posts) {
    if (!deduped.has(post.id)) deduped.set(post.id, post);
  }

  return [...deduped.values()]
    .filter((post) => !hasExcludedAccount(post, excludeAccounts))
    .filter((post) => !hasExcludedTerm(post, excludeTerms))
    .filter((post) => topic.allowReplies || !isLikelyReply(post))
    .filter((post) => matchesRelevance(post, topic))
    .filter((post) => passesQualityGates(post, topic, trustedAccounts))
    .filter((post) => {
      const trusted = trustedUsername(post, trustedAccounts);
      return trusted || engagement(post) >= minEngagement || post.text?.includes("http");
    })
    .sort((a, b) => postScore(b, trustedAccounts) - postScore(a, trustedAccounts))
    .slice(0, topic.maxPosts);
}

export function sourcePostsForSection(topic, posts, summary = "") {
  if (topic.citedSourcesOnly) {
    const cited = posts
      .filter((post) => summary.includes(post.url) || summary.includes(post.id))
      .filter((post) => !topic.materialSourcesOnly || !isNoiseCitation(summary, post));
    return cited.slice(0, topic.maxSourcePosts ?? 8);
  }

  return posts.slice(0, topic.maxSourcePosts ?? 8);
}
