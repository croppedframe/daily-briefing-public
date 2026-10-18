import { loadConfig, validateConfig } from "../src/config.js";
import { backfillHelp, parseBackfillArgs } from "../src/backfillArgs.js";

let options;
try {
  options = parseBackfillArgs(process.argv.slice(2));
} catch (error) {
  console.error(`Backfill argument error: ${error.message}`);
  console.error(backfillHelp());
  process.exitCode = 1;
}

if (options?.help) {
  console.log(backfillHelp());
} else if (options) {
  process.env.BRIEFING_START_TIME = options.start;
  process.env.BRIEFING_END_TIME = options.end;
  process.env.BRIEFING_GENERATED_AT = options.generatedAt;
  process.env.BRIEFING_SAVE_STATE = String(options.saveState);
  process.env.BRIEFING_DISABLE_SINCE_ID = String(options.disableSinceId);
  process.env.BRIEFING_RUN_ALL_TOPICS = String(options.runAllTopics);
  if (options.topicsFile) process.env.TOPICS_FILE = options.topicsFile;

  try {
    const config = loadConfig();
    validateConfig(config);
    console.log(`Backfill validated: ${options.start} to ${options.end}.`);
    console.log(`State saving: ${options.saveState ? "enabled" : "disabled"}; since_id: ${options.disableSinceId ? "disabled" : "enabled"}.`);
    if (!options.execute) {
      console.log("Dry run only. Add --execute to send the backfill email.");
    } else {
      await import("../src/index.js");
    }
  } catch (error) {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}
