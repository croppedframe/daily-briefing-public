export function parseBackfillArgs(args) {
  const values = new Map();
  let execute = false;
  let saveState = false;
  let disableSinceId = true;
  let runAllTopics = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--execute") execute = true;
    else if (arg === "--save-state") saveState = true;
    else if (arg === "--use-since-id") disableSinceId = false;
    else if (arg === "--all-topics") runAllTopics = true;
    else if (arg === "--help" || arg === "-h") return { help: true };
    else if (["--start", "--end", "--generated-at", "--topics-file"].includes(arg)) {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value.`);
      values.set(arg.slice(2), value);
      index += 1;
    } else {
      throw new Error(`Unknown backfill option: ${arg}`);
    }
  }

  const start = values.get("start");
  const end = values.get("end");
  if (!start || !end) throw new Error("Backfill requires --start and --end ISO timestamps.");
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) throw new Error("Backfill --start and --end must be valid ISO timestamps.");
  if (startDate >= endDate) throw new Error("Backfill --start must be earlier than --end.");

  return {
    start: startDate.toISOString(),
    end: endDate.toISOString(),
    generatedAt: values.get("generated-at") ? new Date(values.get("generated-at")).toISOString() : endDate.toISOString(),
    topicsFile: values.get("topics-file"),
    execute,
    saveState,
    disableSinceId,
    runAllTopics,
  };
}

export function backfillHelp() {
  return [
    "Usage: npm run briefing:backfill -- --start ISO --end ISO [options]",
    "",
    "Defaults to validation-only; add --execute to send the backfill email.",
    "  --generated-at ISO   Timestamp shown as the briefing generation time (defaults to --end)",
    "  --all-topics         Run every configured topic regardless of cadence",
    "  --save-state         Persist seen IDs/cursors after the backfill (default: disabled)",
    "  --use-since-id       Do not disable since_id for the exact-window run",
    "  --topics-file PATH   Use an alternate topic definition file",
  ].join("\n");
}
