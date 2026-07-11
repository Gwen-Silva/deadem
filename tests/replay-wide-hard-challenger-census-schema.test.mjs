import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { validateJsonSchema } from "../tools/lib/json-schema-validator.mjs";
import { validateCensusSummary } from "../tools/emit-replay-wide-hard-challenger-census.mjs";

export const schema = JSON.parse(await readFile(new URL("../schemas/replay-wide-hard-challenger-census.schema.json", import.meta.url)));
const horizons = [10, 20, 30, 60, 120, 180];
export const validSummary = {
  schemaVersion: 1,
  runKind: "task193-pilot",
  artifactClass: "replay_wide_structural_hard_challenger_census",
  manifestIdentity: "fixture",
  replayIds: ["replay_001"],
  sourceBaselines: ["task180_participant_identity", "task183_death_event_anchors", "task190_one_second_surface_observations", "task192_hard_challenger_contract"],
  primaryExclusionWindowSeconds: 5,
  exclusionWindowsSeconds: [3, 5, 10],
  horizonResults: horizons.map(horizonSeconds => ({ horizonSeconds, eligibleClusterCount: horizonSeconds <= 30 ? 30 : 0, replayCoverageCount: horizonSeconds <= 30 ? 1 : 0 })),
  replayCount: 1,
  parserCompleted: 1,
  parserExpected: 1,
  participantMappingFailures: 0,
  protectedReplayAccessCount: 0,
  preOpenBridgeFailures: 0,
  anchorCount: 1,
  forwardObservationCount: 35,
  persistentObservationCount: 32,
  immediatePersistenceFailureCount: 3,
  clusterCount: 31,
  eligibleClusterCount: 30,
  excludedClusterCount: 1,
  deduplicatedObservationCount: 1,
  sourceReuseCount: 0,
  clusterReuseCount: 0,
  ambiguityCount: 0,
  familyComposition: { healthBoundary: 10, booleanAlive: 10, respawnBoundary: 10, pawnLinkPresence: 0 },
  surfaceOpportunityComposition: { zero: 0, one: 20, two: 10 },
  feasibility: { assessment: "limited", primaryHorizonSeconds: 30, primaryEligibleClusterCount: 30, thresholds: { limitedMinimum: 30, sufficientMinimum: 100 } },
  technicalStatus: "passed",
  specificityComparisonPerformed: false,
  finalFactsProduced: false,
  attributionEmitted: false,
  readiness: { replayWideCensusAvailable: true, readyForSpecificityComparison: false, readyForFinalDeathFacts: false, readyForConfirmedWhoDied: false, readyForAttribution: false, readyForKillerVictim: false, readyForTeamfight: false, readyForGameplayInterpretation: false },
  limitations: ["Census only."],
};

test("replay-wide census summary passes strict schema and semantic validation", () => {
  assert.deepEqual(validateJsonSchema(schema, validSummary).errors, []);
  assert.deepEqual(validateCensusSummary(validSummary, schema), []);
});

test("schema and semantic mutations fail closed", () => {
  for (const mutate of [
    value => { value.finalFactsProduced = true; },
    value => { value.specificityComparisonPerformed = true; },
    value => { value.sourceReuseCount = 1; },
    value => { value.horizonResults[1].eligibleClusterCount = 31; },
    value => { value.feasibility.assessment = "sufficient"; },
    value => { value.replayIds[0] = "replay_005"; },
    value => { value.surfaceOpportunityComposition.one = 19; },
  ]) {
    const changed = structuredClone(validSummary);
    mutate(changed);
    assert.ok(validateCensusSummary(changed, schema).length > 0);
  }
});
