import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const index = JSON.parse(readFileSync(new URL("../data/task-contribution-index.json", import.meta.url), "utf8"));
const tasks = new Map(index.tasks.map((task) => [task.taskId, task]));

const criticalAcceptedMappings = Object.freeze({
  "205": {
    commitSha: "1a0365a3a59596da267fbf3480adb5488034cb20",
    title: "Build Timestamped Call Evidence Pipeline",
    status: "accepted_with_blocker",
    gate: "two_match_audio_call_evidence_ready_with_asr_gaps",
    currentRelevance: "accepted_with_mixed_vod_asr_semantic_accuracy_blocker",
    evidenceStatus: "accepted_two_match_audio_call_evidence_ready_with_asr_gaps",
  },
  "218": {
    commitSha: "3d1daa401a1e2ceef79cac1b58026ab53721a107",
    title: "Build Generic Scrim Intake V1",
    status: "accepted_with_blocker",
    gate: "generic_scrim_intake_v1_partial_with_declared_gaps",
    currentRelevance: "accepted_functional_baseline_with_protected_alias_blocker",
    evidenceStatus: "ACCEPTED_WITH_BLOCKER_by_Work",
  },
  "219": {
    commitSha: "4d0858d51f7ab4aad86246595bd07b473a1675d1",
    title: "Close Generic Intake Protected-Alias Boundary",
    status: "accepted_with_blocker",
    gate: "generic_scrim_intake_protected_alias_boundary_closed",
    currentRelevance: "accepted_functional_boundary_with_audit_consistency_blocker",
    evidenceStatus: "ACCEPTED_WITH_BLOCKER_by_Work",
  },
});

test("critical Continuous Review tasks retain exact accepted commit, title, status, gate and evidence mappings", () => {
  for (const [taskId, expected] of Object.entries(criticalAcceptedMappings)) {
    const actual = tasks.get(taskId);
    assert.ok(actual, `Task ${taskId} must remain indexed`);
    for (const [field, value] of Object.entries(expected)) assert.equal(actual[field], value, `Task ${taskId} ${field}`);
  }
});

test("critical accepted commits remain distinct across Tasks 205, 218 and 219", () => {
  const commits = Object.values(criticalAcceptedMappings).map(({ commitSha }) => commitSha);
  assert.equal(new Set(commits).size, commits.length);
  for (const commit of commits) assert.match(commit, /^[0-9a-f]{40}$/u);
});

test("accepted blocker chronology distinguishes functional remediation from audit repair", () => {
  const task218Notes = tasks.get("218").reworkRiskNotes.join("\n");
  const task219Notes = tasks.get("219").reworkRiskNotes.join("\n");
  assert.match(task218Notes, /protected_alias_pre_filesystem_guard_incomplete/u);
  assert.match(task218Notes, /Task 219/u);
  assert.match(task219Notes, /historical_task_contribution_index_commit_misattributed/u);
  assert.match(task219Notes, /closes Task 218 blocker/u);
});
