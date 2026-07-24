import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildCandidateArtifact,
  validateCandidateArtifact,
} from "../tools/emit-functional-death-candidate-detector.mjs";

const schema = JSON.parse(await readFile(
  new URL("../schemas/functional-death-candidate-detector.schema.json", import.meta.url),
));

const sourceCluster = {
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
  availableFollowUpSeconds: 180,
};

function validArtifact() {
  return buildCandidateArtifact(["replay_010"], [{
    replayId: "replay_010",
    parserCompleted: true,
    clusters: [structuredClone(sourceCluster)],
  }], "task196-single-replay_010");
}

test("functional candidate artifact passes strict schema and semantic validation", () => {
  assert.deepEqual(validateCandidateArtifact(validArtifact(), schema), []);
});

test("schema and semantic boundaries fail closed", () => {
  for (const mutate of [
    (value) => { value.finalFactsProduced = true; },
    (value) => { value.candidates[0].finalFact = true; },
    (value) => { value.candidates[0].semanticStatus = "confirmed_death"; },
    (value) => { value.candidates[0].contributingSignals[0].weight = 0.1; },
    (value) => { value.replayIds[0] = "replay_005"; value.candidates[0].replayId = "replay_005"; },
    (value) => { value.candidateCount = 2; },
  ]) {
    const changed = validArtifact();
    mutate(changed);
    assert.ok(validateCandidateArtifact(changed, schema).length > 0);
  }
});
