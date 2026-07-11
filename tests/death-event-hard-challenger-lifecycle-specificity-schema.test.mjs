import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { validateJsonSchema } from "../tools/lib/json-schema-validator.mjs";
import { validateHardChallengerSummary } from "../tools/emit-death-event-hard-challenger-lifecycle-specificity.mjs";

export const schema = JSON.parse(await readFile(new URL("../schemas/death-event-hard-challenger-lifecycle-specificity.schema.json", import.meta.url)));
const horizons = [10, 20, 30, 60, 120, 180];
export const validSummary = {
  schemaVersion: 1, runKind: "task192-pilot", artifactClass: "death_event_hard_challenger_lifecycle_specificity",
  manifestIdentity: "fixture", replayIds: ["replay_001"], sourceBaseline: "task190_surface_resolved_lifecycle_evidence", exclusionWindowSeconds: 5,
  horizonResults: horizons.map(horizonSeconds => ({ horizonSeconds, eligibleAnchorCount: 1, eligibleChallengerCount: 1, matchedPairCount: 1, anchorLifecycleRate: 1, challengerLifecycleRate: 0, pairedDifference: 1, anchorAssignmentCount: 1, challengerAssignmentCount: 1, sourceReuseCount: 0 })),
  replayCount: 1, anchorCount: 1, challengerCount: 1, sourceReuseCount: 0, ambiguityCount: 0, assessment: "insufficient", technicalStatus: "passed", finalFactsProduced: false, attributionEmitted: false,
  readiness: { hardChallengerSpecificityEvidenceAvailable: true, readyForFinalDeathFacts: false, readyForConfirmedWhoDied: false, readyForAttribution: false, readyForKillerVictim: false, readyForTeamfight: false, readyForGameplayInterpretation: false },
  limitations: ["Unconfirmed structural challenger only."],
};

test("hard-challenger summary passes strict schema and semantic invariants", () => {
  assert.deepEqual(validateJsonSchema(schema, validSummary).errors, []);
  assert.deepEqual(validateHardChallengerSummary(validSummary, schema), []);
});

test("schema and semantic mutations fail closed", () => {
  for (const mutate of [
    value => { value.finalFactsProduced = true; },
    value => { value.attributionEmitted = true; },
    value => { value.horizonResults[0].sourceReuseCount = 1; },
    value => { value.horizonResults[0].pairedDifference = 0; },
    value => { value.readiness.readyForConfirmedWhoDied = true; },
    value => { value.replayIds[0] = "replay_005"; },
  ]) {
    const changed = structuredClone(validSummary); mutate(changed);
    assert.ok(validateHardChallengerSummary(changed, schema).length > 0);
  }
});
