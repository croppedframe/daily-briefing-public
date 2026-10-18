import { escapeHtml, topicAccent } from "./utils.js";

function formatPostCreatedAt(post, timezone) {
  const createdAt = new Date(post.createdAt);
  if (Number.isNaN(createdAt.getTime())) return post.createdAt;
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
    timeZone: timezone, timeZoneName: "short",
  }).format(createdAt);
}

function formatPostAge(post, generatedAt) {
  const createdAt = new Date(post.createdAt);
  if (Number.isNaN(createdAt.getTime())) return undefined;
  const ageMinutes = Math.max(0, Math.round((generatedAt.getTime() - createdAt.getTime()) / 60000));
  if (ageMinutes < 60) return `${ageMinutes}m ago`;
  const ageHours = Math.round(ageMinutes / 60);
  if (ageHours < 48) return `${ageHours}h ago`;
  return `${Math.round(ageHours / 24)}d ago`;
}

export function sourceStats(section) {
  return `${section.posts.length} cited posts from ${section.signalPostCount || 0} signal posts / ${section.rawPostCount || 0} new posts analyzed`;
}

export function textForPost(post, timezone, generatedAt) {
  const age = formatPostAge(post, generatedAt);
  const references = (post.referencedPosts || []).map((reference) => `Referenced ${reference.type}: ${reference.url}`);
  return [
    `${post.author.name} (@${post.author.username}) - ${formatPostCreatedAt(post, timezone)}${age ? ` - ${age}` : ""}`,
    post.text,
    `Metrics: ${post.metrics.likes} likes, ${post.metrics.reposts} reposts, ${post.metrics.replies} replies`,
    post.url,
    ...references,
  ].join("\n");
}

export function renderSourceCardsHtml(section, timezone, generatedAt) {
  const accent = topicAccent(section);
  return section.posts.map((post) => {
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
          ${(post.referencedPosts || []).map((reference) => `&nbsp;·&nbsp; <a style="color: #667085; text-decoration: none;" href="${escapeHtml(reference.url)}">Referenced ${escapeHtml(reference.type)} post</a>`).join("")}
        </p>
      </li>
    `;
  }).join("");
}
