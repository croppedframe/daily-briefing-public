import { fetchProvider } from "./providerFetch.js";
const X_API_BASE = "https://api.x.com/2";

export class XCreditsDepletedError extends Error {
  constructor({ status, detail, title, type, accountId }) {
    super(detail || "X API credits are depleted.");
    this.name = "XCreditsDepletedError";
    this.status = status;
    this.detail = detail;
    this.title = title;
    this.type = type;
    this.accountId = accountId;
  }
}

export class XApiRequestError extends Error {
  constructor({ status, body, query, cause }) {
    super(status ? `X API request failed (${status}): ${body}` : `X API request failed: ${cause?.message || body}`);
    this.name = "XApiRequestError";
    this.status = status;
    this.body = body;
    this.query = query;
    this.cause = cause;
  }
}

function parseXErrorBody(body) {
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

function accountIdFromDetail(detail) {
  return detail?.match(/account \[([^\]]+)\]/i)?.[1];
}

function isCreditsDepleted(status, payload) {
  return status === 402 && (payload?.title === "CreditsDepleted" || payload?.type?.includes("/credits"));
}

function isRetryableStatus(status) {
  return status === 429 || status >= 500;
}

function isRetryableError(error) {
  if (!(error instanceof XApiRequestError)) return false;
  return error.status === undefined || isRetryableStatus(error.status);
}

function isInvalidSinceIdError(error) {
  if (!(error instanceof XApiRequestError) || error.status !== 400) return false;
  const payload = parseXErrorBody(error.body);
  return (payload?.errors || []).some((item) => item.parameters?.since_id);
}

function minimumRecentStartTime(error) {
  if (!(error instanceof XApiRequestError) || error.status !== 400) return undefined;
  const payload = parseXErrorBody(error.body);
  const startTimeError = (payload?.errors || []).find((item) => item.parameters?.start_time);
  const match = startTimeError?.message?.match(/start_time.*on or after\s+([^\s"']+)/i);
  if (!match) return undefined;

  const minimum = new Date(match[1]);
  if (Number.isNaN(minimum.getTime())) return undefined;

  // X reports the lower bound at minute precision while its rolling window
  // continues advancing. Move one minute inside the window before retrying.
  return new Date(minimum.getTime() + 60_000).toISOString();
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function toIsoHoursAgo(hours) {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

function formatMetrics(metrics = {}) {
  return {
    replies: metrics.reply_count || 0,
    reposts: metrics.retweet_count || 0,
    likes: metrics.like_count || 0,
    quotes: metrics.quote_count || 0,
    bookmarks: metrics.bookmark_count || 0,
    impressions: metrics.impression_count || 0,
  };
}

async function fetchRecentXPostsOnce({
  bearerToken,
  query,
  maxResults,
  lookbackHours,
  sinceId,
  startTime,
  endTime,
  nextToken,
}) {
  const params = new URLSearchParams({
    query,
    max_results: String(Math.min(Math.max(maxResults, 10), 100)),
    "tweet.fields": "created_at,public_metrics,entities,context_annotations,author_id,note_tweet,referenced_tweets",
    expansions: "author_id,referenced_tweets.id",
    "user.fields": "name,username,verified",
  });
  if (sinceId) {
    params.set("since_id", sinceId);
  } else if (startTime) {
    params.set("start_time", startTime);
  } else {
    params.set("start_time", toIsoHoursAgo(lookbackHours));
  }
  if (endTime && !sinceId) params.set("end_time", endTime);
  if (nextToken) params.set("next_token", nextToken);

  let response;
  try {
    response = await fetchProvider(`${X_API_BASE}/tweets/search/recent?${params}`, {
      provider: "X", retries: 0, throwOnHttpError: false,
      headers: {
        Authorization: `Bearer ${bearerToken}`,
      },
    });
  } catch (error) {
    throw new XApiRequestError({ query, cause: error });
  }

  if (!response.ok) {
    const body = await response.text();
    const payload = parseXErrorBody(body);

    if (isCreditsDepleted(response.status, payload)) {
      throw new XCreditsDepletedError({
        status: response.status,
        detail: payload.detail,
        title: payload.title,
        type: payload.type,
        accountId: accountIdFromDetail(payload.detail),
      });
    }

    throw new XApiRequestError({ status: response.status, body, query });
  }

  const payload = await response.json();
  const usersById = new Map((payload.includes?.users || []).map((user) => [user.id, user]));

  const posts = (payload.data || []).map((post) => {
    const author = usersById.get(post.author_id);
    return {
      id: post.id,
      text: post.note_tweet?.text || post.text,
      createdAt: post.created_at,
      url: `https://x.com/i/web/status/${post.id}`,
      author: {
        name: author?.name || "Unknown",
        username: author?.username || "unknown",
        verified: Boolean(author?.verified),
      },
      metrics: formatMetrics(post.public_metrics),
    };
  });

  return {
    nextToken: payload.meta?.next_token,
    posts,
  };
}

export async function fetchRecentXPosts({
  bearerToken,
  query,
  maxResults,
  lookbackHours,
  sinceId,
  startTime,
  endTime,
  maxPages = 1,
  retries = 2,
}) {
  const pages = Math.max(1, maxPages);
  const posts = [];
  let nextToken;
  let pagesFetched = 0;
  let activeSinceId = sinceId;
  let activeStartTime = startTime;
  let retriedWithoutSinceId = false;
  let adjustedStartTime = false;

  for (let page = 0; page < pages; page += 1) {
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        const result = await fetchRecentXPostsOnce({
          bearerToken,
          query,
          maxResults,
          lookbackHours,
          sinceId: activeSinceId,
          startTime: activeStartTime,
          endTime,
          nextToken,
        });
        posts.push(...result.posts);
        nextToken = result.nextToken;
        pagesFetched += 1;
        break;
      } catch (error) {
        if (error instanceof XCreditsDepletedError) throw error;

        if (activeSinceId && !nextToken && !retriedWithoutSinceId && isInvalidSinceIdError(error)) {
          console.warn(`X rejected stale since_id for query "${query}"; retrying with lookback window.`);
          activeSinceId = undefined;
          retriedWithoutSinceId = true;
          attempt -= 1;
          continue;
        }

        const minimumStartTime = !nextToken && !adjustedStartTime
          ? minimumRecentStartTime(error)
          : undefined;
        if (!activeSinceId && minimumStartTime) {
          console.warn(`X rejected stale start_time for query "${query}"; retrying from ${minimumStartTime}.`);
          activeStartTime = minimumStartTime;
          adjustedStartTime = true;
          attempt -= 1;
          continue;
        }

        const canRetry = isRetryableError(error) && attempt < retries;
        if (!canRetry) throw error;

        const delayMs = 1000 * 2 ** attempt;
        console.warn(`X API request failed for query "${query}" (${error.status || "network"}); retrying in ${delayMs}ms.`);
        await sleep(delayMs);
      }
    }

    if (!nextToken) break;
  }

  return { pagesFetched, posts };
}
