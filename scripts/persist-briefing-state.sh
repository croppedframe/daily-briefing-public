#!/usr/bin/env bash
set -euo pipefail

# Merge each push attempt against fresh remote state without changing the run checkout.
repo_dir=$(git rev-parse --show-toplevel)
state_dir=$(mktemp -d "${TMPDIR:-/tmp}/briefing-persist.XXXXXX")
cleanup() {
  if [ -d "$state_dir/checkout" ]; then
    git worktree remove --force "$state_dir/checkout"
  fi
  rm -rf "$state_dir"
}
trap cleanup EXIT
cp "$repo_dir/data/briefing-state.json" "$state_dir/local-state.json"
cp "$repo_dir/data/run-history.jsonl" "$state_dir/local-history.jsonl"

for attempt in 1 2 3; do
  git fetch origin main
  git worktree add --detach "$state_dir/checkout" origin/main
  mkdir -p "$state_dir/checkout/data"
  for pair in "briefing-state.json:local-state.json:merge-briefing-state.mjs" "run-history.jsonl:local-history.jsonl:merge-run-history.mjs"; do
    IFS=: read -r filename local_file merger <<< "$pair"
    destination="$state_dir/checkout/data/$filename"
    if [ -f "$destination" ]; then
      node "$repo_dir/scripts/$merger" "$destination" "$state_dir/$local_file" "$destination"
    else
      cp "$state_dir/$local_file" "$destination"
    fi
  done
  git -C "$state_dir/checkout" add -f data/briefing-state.json data/run-history.jsonl
  if git -C "$state_dir/checkout" diff --cached --quiet; then exit 0; fi
  git -C "$state_dir/checkout" -c user.name="github-actions[bot]" -c user.email="41898282+github-actions[bot]@users.noreply.github.com" commit -m "Update briefing state"
  if git -C "$state_dir/checkout" push origin HEAD:main; then exit 0; fi
  git worktree remove --force "$state_dir/checkout"
  echo "Push attempt $attempt failed; merging again against current remote state."
done
echo "Unable to publish briefing state after 3 attempts."
exit 1
