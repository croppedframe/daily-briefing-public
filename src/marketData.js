function formatCurrency(value) {
  if (!Number.isFinite(value)) return "n/a";
  return `$${value.toFixed(2)}`;
}

function formatPercent(value) {
  if (!Number.isFinite(value)) return "n/a";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function formatChange(value) {
  if (!Number.isFinite(value)) return "n/a";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}`;
}

function marketTime(timestamp) {
  if (!timestamp) return "n/a";
  return new Date(timestamp * 1000).toISOString();
}

function quoteSummary(symbol, meta, dailyQuotes) {
  const lastPrice = meta.regularMarketPrice;
  const previousClose = meta.previousClose;
  const intradayChange = Number.isFinite(lastPrice) && Number.isFinite(previousClose) ? lastPrice - previousClose : undefined;
  const intradayPercent = Number.isFinite(intradayChange) && previousClose ? (intradayChange / previousClose) * 100 : undefined;

  const completedDaily = dailyQuotes.filter((quote) => Number.isFinite(quote.close));
  const marketDate = meta.regularMarketTime
    ? new Date(meta.regularMarketTime * 1000).toISOString().slice(0, 10)
    : undefined;
  const priorDailyQuotes =
    marketDate && completedDaily.at(-1)?.date === marketDate ? completedDaily.slice(0, -1) : completedDaily;
  const latestCompleted = priorDailyQuotes.at(-1);
  const priorCompleted = priorDailyQuotes.at(-2);
  const priorDayChange = latestCompleted && priorCompleted ? latestCompleted.close - priorCompleted.close : undefined;
  const priorDayPercent =
    Number.isFinite(priorDayChange) && priorCompleted?.close ? (priorDayChange / priorCompleted.close) * 100 : undefined;

  return [
    `Ticker: ${symbol}`,
    `Latest/intraday price: ${formatCurrency(lastPrice)} (${formatChange(intradayChange)}, ${formatPercent(intradayPercent)} vs previous close ${formatCurrency(previousClose)})`,
    `Latest market timestamp: ${marketTime(meta.regularMarketTime)}`,
    latestCompleted && priorCompleted
      ? `Prior completed daily move: ${formatCurrency(priorCompleted.close)} -> ${formatCurrency(latestCompleted.close)} (${formatChange(priorDayChange)}, ${formatPercent(priorDayPercent)}) on ${latestCompleted.date}`
      : "Prior completed daily move: n/a",
    "Use this as market context, not as a standalone catalyst unless paired with a sourced development.",
  ].join("\n");
}

function dailyQuotesFromChart(payload) {
  const result = payload.chart?.result?.[0];
  const timestamps = result?.timestamp || [];
  const closes = result?.indicators?.quote?.[0]?.close || [];

  return timestamps.map((timestamp, index) => ({
    date: new Date(timestamp * 1000).toISOString().slice(0, 10),
    close: closes[index],
  }));
}

export async function fetchMarketContext(marketData) {
  if (!marketData?.symbol) return undefined;

  const symbol = marketData.symbol.toUpperCase();

  try {
    const quoteUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=5m`;
    const dailyUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5d&interval=1d`;

    const [quoteResponse, dailyResponse] = await Promise.all([fetch(quoteUrl), fetch(dailyUrl)]);
    if (!quoteResponse.ok) throw new Error(`quote request failed (${quoteResponse.status})`);
    if (!dailyResponse.ok) throw new Error(`daily request failed (${dailyResponse.status})`);

    const quotePayload = await quoteResponse.json();
    const dailyPayload = await dailyResponse.json();
    const meta = quotePayload.chart?.result?.[0]?.meta || {};

    return quoteSummary(symbol, meta, dailyQuotesFromChart(dailyPayload));
  } catch (error) {
    return `Ticker: ${symbol}\nMarket context unavailable: ${error.message}`;
  }
}
