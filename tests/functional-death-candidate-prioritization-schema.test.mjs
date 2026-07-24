import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildPrioritizationArtifact, validatePrioritizationArtifact } from "../tools/emit-functional-death-candidate-prioritization.mjs";

const schema = JSON.parse(await readFile(new URL("../schemas/functional-death-candidate-prioritization.schema.json", import.meta.url)));
const replayIds = ["001", "002", "003", "004", "009", ...Array.from({ length: 27 }, (_, i) => String(i + 10).padStart(3, "0"))].map((id) => `replay_${id}`);

function validArtifact() {
  const candidate = {
    candidateId: "replay_010_candidate_0001", replayId: "replay_010", timestampSeconds: 42,
    structuralScore: 1, contributingSignals: [], observedHorizonSeconds: 180,
    abstractSurfaceId: "participant_01:controller+linked_pawn",
    evaluationOverlap: { knownStructuralAnchor: true, hardChallengerPopulation: false },
    semanticStatus: "unconfirmed_structural_death_candidate", finalFact: false,
  };
  const artifact = buildPrioritizationArtifact({ replayIds, candidateCount: 2664, candidates: [candidate] }, { rows: [{
    clusterKey: "replay_010:participant_01:forward_transition:42", replayId: "replay_010", familyCount: 3,
    surfaceOpportunityCount: 2, minimumAnchorDistanceSeconds: 0, outsideAnchorWindows: { "5": false }, availableFollowUpSeconds: 180,
  }] });
  artifact.v1CandidateCount = 2664;
  return artifact;
}

test("prioritization artifact passes strict schema and semantic validation", () => {
  assert.deepEqual(validatePrioritizationArtifact(validArtifact(), schema), []);
});

test("schema and semantic boundaries fail closed", () => {
  for (const mutate of [
    (value) => { value.finalFactsProduced = true; },
    (value) => { value.candidates[0].finalFact = true; },
    (value) => { value.candidates[0].semanticStatus = "confirmed_death"; },
    (value) => { value.scoreInputs[0] = "known_anchor_label"; },
    (value) => { value.candidates[0].featureContributions[0].signal = "hard_challenger_label"; },
    (value) => { value.candidates[0].featureContributions[0].contribution = 0; },
    (value) => { value.replayIds[0] = "replay_005"; },
    (value) => { value.candidateCount = 2; },
  ]) {
    const changed = validArtifact();
    mutate(changed);
    assert.ok(validatePrioritizationArtifact(changed, schema).length > 0);
  }
});
