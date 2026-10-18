import { fetchProviderJson, ProviderRequestError, sanitizeProviderMessage } from "./providerFetch.js";

const DEFAULT_OPENAI_TIMEOUT_MS = 60_000;

export function openAiTimeoutMs(value = process.env.OPENAI_REQUEST_TIMEOUT_MS) {
  const configured = Number(value);
  return Number.isFinite(configured) && configured >= 1_000 && configured <= 120_000
    ? configured
    : DEFAULT_OPENAI_TIMEOUT_MS;
}

export class OpenAiCreditsDepletedError extends Error {
  constructor({ status, detail, type, code, cause }) {
    super(detail || "OpenAI API credits are depleted.");
    this.name = "OpenAiCreditsDepletedError";
    this.provider = "OpenAI";
    this.status = status;
    this.detail = sanitizeProviderMessage(detail);
    this.type = type;
    this.code = code;
    this.cause = cause;
  }
}

function parseOpenAiError(body) {
  try {
    return JSON.parse(body)?.error;
  } catch {
    return undefined;
  }
}

export function isOpenAiCreditsDepleted(error) {
  if (!(error instanceof ProviderRequestError) || error.status !== 429) return false;
  const apiError = parseOpenAiError(error.body);
  return apiError?.type === "insufficient_quota"
    || ["credit_balance_exhausted", "billing_hard_limit_reached"].includes(apiError?.code)
    || /no credits remaining|credit balance (?:is )?exhausted|billing hard limit/i.test(apiError?.message || error.body);
}

export const isOpenAiCreditsDepletedError = isOpenAiCreditsDepleted;

export function normalizeOpenAiUsage(usage = {}) {
  return {
    inputTokens: usage.input_tokens || usage.inputTokens || 0,
    outputTokens: usage.output_tokens || usage.outputTokens || 0,
    totalTokens: usage.total_tokens || usage.totalTokens || 0,
  };
}

export function extractOpenAiText(payload, separator = "\n") {
  if (payload?.output_text) return String(payload.output_text).trim();
  return payload?.output?.flatMap((item) => item.content || [])
    .filter((content) => content.type === "output_text")
    .map((content) => content.text)
    .join(separator).trim() || "";
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchOpenAiPayload(url, options) {
  // Retry only the empty 404 observed from the Responses endpoint. Structured
  // model/access errors and ambiguous transport failures must still fail fast.
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await fetchProviderJson(url, options);
    } catch (error) {
      if (error instanceof ProviderRequestError && error.status === 404 && error.emptyBody && attempt < 2) {
        console.warn(`${error.message}; retrying OpenAI request (${attempt + 1}/2).`);
        await sleep(500 * 2 ** attempt);
        continue;
      }
      if (!isOpenAiCreditsDepleted(error)) throw error;
      const apiError = parseOpenAiError(error.body) || {};
      throw new OpenAiCreditsDepletedError({
        status: error.status,
        detail: apiError.message || error.body,
        type: apiError.type,
        code: apiError.code,
        cause: error,
      });
    }
  }
}

export async function requestOpenAi({
  apiKey,
  model,
  input,
  provider = "OpenAI",
  usageSink,
  usageMetadata = {},
  outputSeparator = "\n",
  timeout = openAiTimeoutMs(),
}) {
  const payload = await fetchOpenAiPayload("https://api.openai.com/v1/responses", {
    provider, method: "POST", timeout,
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, input }),
  });
  if (payload.usage) usageSink?.({ ...usageMetadata, model, usage: normalizeOpenAiUsage(payload.usage) });
  return { payload, text: extractOpenAiText(payload, outputSeparator) };
}
