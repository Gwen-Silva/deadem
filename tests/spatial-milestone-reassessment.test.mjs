import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

test("selects cross-replay canonical generalization and pauses replay-009 transform work", () => {
  const decision = readJson("output/spatial-milestone-reassessment/milestone-decision.json");
  assert.equal(decision.primaryMilestone, "cross_replay_canonical_generalization");
  assert.equal(decision.nextExecutableTask.preferredFixture, "002");
  assert.ok(decision.pausedTracks.some((track) => track.track === "replay_009_world_to_map_transform"));
  assert.ok(decision.forbiddenNextActions.includes("fit transforms from coordinate ordering, symmetry, nearest landmark, or permutation search"));
});

test("marks immediate replay-009 spatial continuation as exhausted under current sources", () => {
  const continuation = readJson("output/spatial-milestone-reassessment/replay-009-spatial-continuation.json");
  assert.equal(continuation.classification, "exhausted_under_current_sources");
  assert.ok(continuation.redundantWithTasks.includes("077"));
  assert.ok(continuation.redundantWithTasks.includes("079"));
  assert.equal(continuation.decision, "do_not_continue_immediate_replay_009_transform_work");
});

test("assesses all four compatible controls and chooses replay 002", () => {
  const assessment = readJson("output/spatial-milestone-reassessment/cross-replay-generalization-assessment.json");
  assert.equal(assessment.fixtures.length, 4);
  assert.equal(assessment.preferredNextReplay, "002");
  const selected = assessment.fixtures.filter((fixture) => fixture.candidateAsNextReplay);
  assert.equal(selected.length, 1);
  assert.equal(selected[0].fixture, "002");
  assert.equal(selected[0].structurallyCompatible, true);
  assert.equal(selected[0].canonicalOutputExists, false);
});

test("spatial resume contract requires non-circular new evidence", () => {
  const contract = readJson("output/spatial-milestone-reassessment/spatial-resume-contract.json");
  assert.ok(contract.note.includes("New minimap screenshots alone are insufficient"));
  assert.ok(contract.conditions.length >= 5);
  for (const condition of contract.conditions) {
    assert.ok(condition.whyItIsNew);
    assert.ok(condition.whyItIsNonCircular);
    assert.ok(condition.minimumAcceptanceEvidence.length > 0);
  }
});

test("gate preserves protections and emits no spatial or macro outputs", () => {
  const summary = readJson("output/spatial-milestone-reassessment/reassessment-summary.json");
  const gate = readJson("output/spatial-milestone-reassessment/reassessment-gate.json");
  assert.equal(gate.gate, "deadem_milestone_cross_replay_generalization_selected");
  assert.equal(summary.protections.replay005Read, false);
  assert.equal(summary.protections.botFixturesProcessed, false);
  assert.equal(summary.protections.transformFitted, false);
  assert.equal(summary.protections.residualsCalculated, false);
  assert.equal(summary.protections.spatialOutputsEmitted, false);
  assert.equal(summary.protections.macroOutputsEmitted, false);
});
