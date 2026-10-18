import { renderBriefingHtml } from "./render/html.js";
import { headingForBriefing, subjectForBriefing } from "./render/subject.js";
import { renderBriefingText } from "./render/text.js";
import { escapeHtml, formatCoverageWindow, formatDate, topicTitleList } from "./render/utils.js";

export function renderCreditsDepletedNotification({ generatedAt, timezone, error }) {
  const generatedAtText = formatDate(generatedAt, timezone);
  const provider = error.provider === "OpenAI" ? "OpenAI" : "X";
  const isOpenAi = provider === "OpenAI";
  const subject = `Briefing paused: ${provider} API credits depleted`;
  const accountLine = isOpenAi
    ? undefined
    : error.accountId ? `X account: ${error.accountId}` : "X account: not provided by API";
  const rejectedAction = isOpenAi ? "summarization request" : "search request";
  const action = isOpenAi
    ? "Add OpenAI API credits or update billing at platform.openai.com."
    : "Add X API credits or update billing in the X Developer Portal.";
  const statusTitle = error.title || error.code || error.type || "CreditsDepleted";
  const text = [
    subject, "", `Checked at: ${generatedAtText}`, accountLine, "",
    `The scheduled daily briefing started, but ${provider} rejected the ${rejectedAction} because the account has no usable API credits left.`,
    "", `${provider} API response: ${error.detail || error.message}`, "",
    `Action needed: ${action} The briefing will resume on the next scheduled run after credits are available.`,
  ].filter((line) => line !== undefined).join("\n");
  const html = `
    <!doctype html><html><body style="margin: 0; background: #f5f7fa; font-family: -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif; color: #17202a; line-height: 1.5;">
      <main style="max-width: 680px; margin: 0 auto; padding: 28px 18px;"><section style="background: #ffffff; border: 1px solid #d9e1ea; border-radius: 8px; padding: 24px;">
        <p style="margin: 0 0 8px; color: #a24100; font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0;">Action needed</p>
        <h1 style="margin: 0 0 16px; font-size: 24px; line-height: 1.25;">Briefing paused</h1>
        <p style="margin: 0 0 16px;">The scheduled daily briefing started, but ${provider} rejected the ${rejectedAction} because the account has no usable API credits left.</p>
        <table style="width: 100%; border-collapse: collapse; margin: 0 0 18px;">
          <tr><td style="padding: 8px 0; color: #536471; width: 120px;">Checked at</td><td style="padding: 8px 0;">${escapeHtml(generatedAtText)}</td></tr>
          ${isOpenAi ? "" : `<tr><td style="padding: 8px 0; color: #536471;">X account</td><td style="padding: 8px 0;">${escapeHtml(error.accountId || "Not provided by API")}</td></tr>`}
          <tr><td style="padding: 8px 0; color: #536471;">API status</td><td style="padding: 8px 0;">${escapeHtml(statusTitle)} (${escapeHtml(error.status || (isOpenAi ? 429 : 402))})</td></tr>
        </table>
        <p style="margin: 0 0 16px; padding: 12px; background: #fff7ed; border: 1px solid #fed7aa; border-radius: 6px;">${escapeHtml(error.detail || error.message)}</p>
        <p style="margin: 0;">${action} The briefing will resume on the next scheduled run after credits are available.</p>
      </section></main>
    </body></html>`;
  return { subject, text, html };
}

export function renderBriefing({ subject, singleTopicHeadlineCount, generatedAt, timezone, reminders = [], runHealth, coverageWindow, sections }) {
  const renderedSubject = subjectForBriefing({ sections, subject, singleTopicHeadlineCount });
  const shared = {
    heading: headingForBriefing(subject || renderedSubject),
    generatedAtText: formatDate(generatedAt, timezone),
    coverageWindowText: formatCoverageWindow(coverageWindow, timezone),
    coverage: topicTitleList(sections),
    timezone, generatedAt, reminders, runHealth, sections,
  };
  return {
    subject: renderedSubject,
    text: renderBriefingText(shared),
    html: renderBriefingHtml(shared),
  };
}
