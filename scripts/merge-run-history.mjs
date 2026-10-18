import { readFileSync, writeFileSync } from "node:fs";

function readRecords(path) {
  return readFileSync(path, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`Invalid JSONL record in "${path}" at line ${index + 1}: ${error.message}`);
      }
    });
}

function recordKey(record) {
  return [record.version || 1, record.generatedAt || "", record.completedAt || ""].join(":");
}

export function mergeRunHistory(left, right) {
  const records = new Map();
  for (const record of [...left, ...right]) records.set(recordKey(record), record);

  return [...records.values()].sort((a, b) => {
    const leftTime = a.completedAt || a.generatedAt || "";
    const rightTime = b.completedAt || b.generatedAt || "";
    return leftTime.localeCompare(rightTime);
  });
}

function main() {
  const [, , leftPath, rightPath, outputPath = rightPath] = process.argv;
  if (!leftPath || !rightPath) {
    throw new Error("Usage: node scripts/merge-run-history.mjs <left.jsonl> <right.jsonl> [output.jsonl]");
  }

  const merged = mergeRunHistory(readRecords(leftPath), readRecords(rightPath));
  writeFileSync(outputPath, `${merged.map((record) => JSON.stringify(record)).join("\n")}\n`);
  console.log(`Merged run history: ${merged.length} records.`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
