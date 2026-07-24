import assert from "node:assert/strict";
import test from "node:test";
import {
  assertAuthorizedReplayId,
  buildCandidateArtifact,
  buildDetectorSummary,
  scoreStructuralCluster,
} from "../tools/emit-functional-death-candidate-detector.mjs";

function cluster(overrides = {}) {
  return {
    clusterKey: "replay_010:participant_01:forward_transition:42",
    replayId: "replay_010",
    participantKey: "participant_01",
    actualTransitionSecond: 42,
    familyNames: ["booleanAlive", "healthBoundary", "respawnBoundary"],
    surfaceNames: ["controller", "linked_pawn"],
    immediatePersistence: true,
    ambiguous: false,
    minimumAnchorDistanceSeconds: 0,
    outsideAnchorWindows: { "3": false, "5": false, "10": false },
    availableFollowUpSeconds: 60,
    ...overrides,
  };
}

function result(clusters) {
  return { replayId: "replay_010", parserCompleted: true, clusters };
}

test("structural score is deterministic and independent from evaluation overlap", () => {
  const anchor = cluster();
  const challenger = cluster({
    minimumAnchorDistanceSeconds: 20,
    outsideAnchorWindows: { "3": true, "5": true, "10": true },
  });
  assert.deepEqual(scoreStructuralCluster(anchor), scoreStructuralCluster(challenger));
  assert.equal(scoreStructuralCluster(anchor).structuralScore, 1);
});

test("detector emits a usable candidate and excludes weak or ambiguous clusters", () => {
  const artifact = buildCandidateArtifact(["replay_010"], [result([
    cluster(),
    cluster({ clusterKey: "weak", actualTransitionSecond: 50, familyNames: ["healthBoundary"], surfaceNames: ["controller"], availableFollowUpSeconds: 5 }),
    cluster({ clusterKey: "ambiguous", actualTransitionSecond: 60, ambiguous: true }),
  ])], "task196-single-replay_010");
  assert.equal(artifact.candidateCount, 1);
  assert.deepEqual(Object.keys(artifact.candidates[0]), [
    "candidateId", "replayId", "timestampSeconds", "structuralScore", "contributingSignals",
    "observedHorizonSeconds", "abstractSurfaceId", "evaluationOverlap", "semanticStatus", "finalFact",
  ]);
  assert.equal(artifact.candidates[0].timestampSeconds, 42);
  assert.equal(artifact.candidates[0].observedHorizonSeconds, 60);
  assert.equal(artifact.candidates[0].abstractSurfaceId, "participant_01:controller+linked_pawn");
  assert.equal(artifact.candidates[0].finalFact, false);
});

test("summary reports replay coverage, score distribution and evaluation overlaps", () => {
  const artifact = buildCandidateArtifact(["replay_010"], [result([
    cluster(),
    cluster({ clusterKey: "challenger", actualTransitionSecond: 80, minimumAnchorDistanceSeconds: 20, outsideAnchorWindows: { "3": true, "5": true, "10": true } }),
  ])], "task196-single-replay_010");
  const summary = buildDetectorSummary({ artifact, censusResults: [result([])], durationSeconds: 1.23456 });
  assert.equal(summary.replaysProcessed, 1);
  assert.equal(summary.replayCoveragePercent, 100);
  assert.equal(summary.candidatesEmitted, 2);
  assert.equal(summary.knownStructuralAnchorMatches, 1);
  assert.equal(summary.hardChallengerPopulationMatches, 1);
  assert.equal(summary.durationSeconds, 1.235);
  assert.match(summary.candidateArtifactSha256, /^[0-9a-f]{64}$/u);
});

test("protected and outside-membership replay ids fail before use", () => {
  const accepted = ["replay_010"];
  assert.doesNotThrow(() => assertAuthorizedReplayId("replay_010", accepted));
  assert.throws(() => assertAuthorizedReplayId("replay_005", accepted), /protected replay/u);
  assert.throws(() => assertAuthorizedReplayId("replay_099", accepted), /outside accepted/u);
});
