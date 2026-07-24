import assert from "node:assert/strict";
import test from "node:test";
import {
  FROZEN_V2_CONFIG, RESERVED_VALIDATION_REPLAYS, buildPrioritizationArtifact,
  buildSplit, evaluateValidationGate, priorityLevel, scorePriorityV2,
} from "../tools/emit-functional-death-candidate-prioritization.mjs";

function v1Candidate(overrides = {}) {
  return {
    candidateId: "replay_010_candidate_0001", replayId: "replay_010", timestampSeconds: 42,
    structuralScore: 1, contributingSignals: [], observedHorizonSeconds: 180,
    abstractSurfaceId: "participant_01:controller+linked_pawn",
    evaluationOverlap: { knownStructuralAnchor: true, hardChallengerPopulation: false },
    semanticStatus: "unconfirmed_structural_death_candidate", finalFact: false, ...overrides,
  };
}

function ledgerRow(overrides = {}) {
  return {
    clusterKey: "replay_010:participant_01:forward_transition:42", replayId: "replay_010",
    familyCount: 3, surfaceOpportunityCount: 2, minimumAnchorDistanceSeconds: 0,
    outsideAnchorWindows: { "5": false }, availableFollowUpSeconds: 180, ...overrides,
  };
}

test("frozen score is deterministic and evaluation-label independent", () => {
  const features = { familyCount: 3, surfaceCount: 2, observedHorizonSeconds: 180, sameSurfaceRecurrence: 5, nearestSameSurfaceGapSeconds: 900 };
  const first = scorePriorityV2(features);
  const second = scorePriorityV2({ ...features, knownStructuralAnchor: false, hardChallengerPopulation: true });
  assert.deepEqual(first, second);
  assert.equal(first.priorityScore, 0.85);
  assert.equal(priorityLevel(first.priorityScore), "medium");
  assert.ok(FROZEN_V2_CONFIG.scoreInputs.every((name) => !/anchor|challenger/u.test(name)));
});

test("artifact is ranked per replay and labels are attached after scoring", () => {
  const candidates = [
    v1Candidate(),
    v1Candidate({ candidateId: "replay_010_candidate_0002", timestampSeconds: 52, evaluationOverlap: { knownStructuralAnchor: false, hardChallengerPopulation: true } }),
  ];
  const rows = [ledgerRow(), ledgerRow({ clusterKey: "replay_010:participant_01:forward_transition:52", minimumAnchorDistanceSeconds: 20, outsideAnchorWindows: { "5": true } })];
  const artifact = buildPrioritizationArtifact({ replayIds: ["replay_010"], candidateCount: 2, candidates }, { rows });
  assert.equal(artifact.candidateCount, 2);
  assert.deepEqual(artifact.candidates.map((row) => row.rankInReplay), [1, 2]);
  assert.equal(artifact.candidates[1].evaluationLabels.hardChallengerPopulation, true);
  assert.ok(artifact.candidates.every((row) => row.semanticStatus === "unconfirmed_structural_death_candidate_priority" && !row.finalFact));
});

test("declared split is exact and rejects protected membership", () => {
  const ids = ["001", "002", "003", "004", "009", ...Array.from({ length: 27 }, (_, i) => String(i + 10).padStart(3, "0"))].map((id) => `replay_${id}`);
  const split = buildSplit(ids);
  assert.equal(split.development.length, 24);
  assert.deepEqual(split.validation, RESERVED_VALIDATION_REPLAYS);
  assert.throws(() => buildSplit([...ids.slice(0, 31), "replay_005"]), /protected replay/u);
});

test("validation gate supports both positive and useful negative conclusions", () => {
  const passing = { anchorCapturePercent: 92, captureDifferencePercentagePoints: 12, v2CandidateCount: 80, v1CandidateCount: 100, scoreDistribution: { p50: 0.8, p90: 0.95 }, priorityDistribution: { high: 1, medium: 2, low: 3 } };
  assert.equal(evaluateValidationGate(passing, 32).passed, true);
  assert.equal(evaluateValidationGate({ ...passing, captureDifferencePercentagePoints: 9.999 }, 32).passed, false);
});
