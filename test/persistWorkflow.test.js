import assert from "node:assert/strict";
import test from "node:test";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

test("workflow persistence merges remote history, survives a push race and leaves the run checkout intact", () => {
  const root = mkdtempSync(join(tmpdir(), "briefing-workflow-test-"));
  const remote = join(root, "remote.git");
  const run = join(root, "run");
  const peer = join(root, "peer");
  const git = (cwd, ...args) => execFileSync("git", ["-C", cwd, ...args], {
    encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, GIT_AUTHOR_NAME: "Test", GIT_AUTHOR_EMAIL: "test@example.com", GIT_COMMITTER_NAME: "Test", GIT_COMMITTER_EMAIL: "test@example.com" },
  }).trim();
  const record = (day) => ({ version: 1, generatedAt: `2026-10-${day}T10:00:00Z`, completedAt: `2026-10-${day}T10:01:00Z` });
  const data = (dir, ids, days) => {
    mkdirSync(join(dir, "data"), { recursive: true });
    writeFileSync(join(dir, "data/briefing-state.json"), JSON.stringify({ version: 2, seenPostIds: ids, queries: {}, topics: {} }));
    writeFileSync(join(dir, "data/run-history.jsonl"), days.map(day => JSON.stringify(record(day))).join("\n") + "\n");
  };
  try {
    git(root, "init", "--bare", "--initial-branch=main", remote);
    git(root, "clone", remote, run);
    mkdirSync(join(run, "scripts"));
    for (const file of ["persist-briefing-state.sh", "merge-briefing-state.mjs", "merge-run-history.mjs"]) {
      cpSync(resolve("scripts", file), join(run, "scripts", file));
    }
    writeFileSync(join(run, "README.md"), "Original checkout\n");
    data(run, ["1"], ["16"]);
    git(run, "add", "."); git(run, "commit", "-m", "Initial fixture"); git(run, "push", "origin", "main");
    const initialHead = git(run, "rev-parse", "HEAD");
    git(root, "clone", remote, peer);
    data(peer, ["1", "2"], ["16", "17"]);
    writeFileSync(join(peer, "README.md"), "Concurrent remote change\n");
    git(peer, "add", "."); git(peer, "commit", "-m", "Concurrent update");
    const racingHead = git(peer, "rev-parse", "HEAD");
    git(peer, "push", "origin", "HEAD:refs/heads/race-fixture");
    // Move main only after the first push has read the old remote head.
    writeFileSync(join(run, ".git/hooks/pre-push"), `#!/bin/sh
if [ ! -f '${root}/raced' ]; then
  git --git-dir='${remote}' update-ref refs/heads/main '${racingHead}'
  touch '${root}/raced'
fi
`, { mode: 0o755 });
    data(run, ["1", "3"], ["16", "18"]);
    const execute = () => execFileSync("bash", ["scripts/persist-briefing-state.sh"], {
      cwd: run, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 20_000,
    });
    const output = execute();
    assert.match(output, /Push attempt 1 failed/);
    const state = JSON.parse(git(root, "--git-dir=" + remote, "show", "main:data/briefing-state.json"));
    assert.deepEqual(new Set(state.seenPostIds), new Set(["1", "2", "3"]));
    const history = git(root, "--git-dir=" + remote, "show", "main:data/run-history.jsonl").split("\n").map(JSON.parse);
    assert.equal(history.length, 3);
    assert.equal(git(root, "--git-dir=" + remote, "show", "main:README.md"), "Concurrent remote change");
    assert.equal(git(run, "rev-parse", "HEAD"), initialHead);
    assert.equal(readFileSync(join(run, "README.md"), "utf8"), "Original checkout\n");
    const published = git(root, "--git-dir=" + remote, "rev-parse", "main");
    execute();
    assert.equal(git(root, "--git-dir=" + remote, "rev-parse", "main"), published);
    assert.equal(git(run, "worktree", "list", "--porcelain").match(/^worktree /gm).length, 1);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
