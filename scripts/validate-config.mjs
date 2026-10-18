import { loadConfig, validateConfig } from "../src/config.js";

try {
  const config = loadConfig();
  validateConfig(config);
  console.log(`Configuration valid: ${config.briefing.topics.length} topics, timezone ${config.briefing.timezone}.`);
  console.log("No network calls or email delivery were performed.");
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
