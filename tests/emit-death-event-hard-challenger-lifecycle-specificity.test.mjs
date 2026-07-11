import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  buildHardChallengerRun,
  baselineHorizonState,
  deriveStructuralChallengers,
  matchHorizon,
  publishHardChallengerRun,
  surfaceOpportunityForStatuses,
  validateTask190Bridge,
  validateMatchingLedger,
} from "../tools/emit-death-event-hard-challenger-lifecycle-specificity.mjs";

const family = (forward, coherent = false, delta = 0) => ({
  eventRelativePreStateStatus: "event_relative_origin_continuous", forwardObserved: forward,
  forwardDeltaSeconds: forward ? delta : null, forwardPersistenceObserved: forward, inverseObserved: coherent,
  inverseDeltaSeconds: coherent ? 8 : null, recoveryPersistenceObserved: coherent, completionDeltaSeconds: coherent ? 9 : null,
  completeSameFamilyLifecycle: coherent, stageSurfaceStatus: { preState: "controller_only", forward: "controller_only", forwardPersistence: "controller_only", inverse: coherent ? "controller_only" : "surface_unavailable", recoveryPersistence: coherent ? "controller_only" : "surface_unavailable" }, failureReason: coherent ? "none" : "inverse_not_observed_within_horizon",
});
const families = (forward, delta = 0) => ({ healthBoundary: family(forward, false, delta), booleanAlive: family(forward, false, delta), respawnBoundary: family(false), pawnLinkPresence: family(false) });
function row(key, anchor, control, participant = "participant_01", delta = 0) { return { eventCandidateKey: key, participantKey: participant, anchorNormalizedElapsedSecond: anchor, matchedControlNormalizedElapsedSecond: control, anchorAvailableFollowUpSeconds: 180, controlAvailableFollowUpSeconds: 180, pairedCommonFollowUpSeconds: 180, anchorCoherentLifecycle: true, controlCoherentLifecycle: false, actualCrossSurfaceSupport: false, surfaceSupportClass: "health_supported_same_surface", controlFamilies: families(true, delta), ambiguousAssociation: false, controlFollowUpCause: "policy_cap_180", horizonSpecificEvidence: [10, 20, 30, 60, 120, 180].map(horizonSeconds => ({ horizonSeconds, eligible: true, anchorCoherentLifecycle: horizonSeconds >= 20, controlCoherentLifecycle: false, anchorAssignmentCount: 1, controlAssignmentCount: 0, sourceReuseCount: 0 })) }; }

test("surface opportunity uses the anchor-compatible 0/1/2 observable-surface scale", () => {
  assert.equal(surfaceOpportunityForStatuses(Array(5).fill("controller_and_pawn_agree")), 2);
  assert.equal(surfaceOpportunityForStatuses(Array(5).fill("controller_only")), 1);
  assert.equal(surfaceOpportunityForStatuses(["surface_unavailable", "linked_pawn_only"]), 1);
  assert.equal(surfaceOpportunityForStatuses(["controller_only", "linked_pawn_only", "controller_and_pawn_agree", "controller_pawn_conflict"]), 2);
  assert.throws(() => surfaceOpportunityForStatuses(["future_unmapped_status"]), /unknown surface status/u);
});

test("surface opportunity consolidates conservatively from family to source row to cluster", () => {
  const twoSurfaceRow = row("two", 100, 400);
  for (const value of Object.values(twoSurfaceRow.controlFamilies)) {
    if (value.forwardObserved) value.stageSurfaceStatus = Object.fromEntries(Object.keys(value.stageSurfaceStatus).map(stage => [stage, "controller_and_pawn_agree"]));
  }
  const alsoTwoSurfaceRow = structuredClone(twoSurfaceRow);
  alsoTwoSurfaceRow.eventCandidateKey = "also_two";
  alsoTwoSurfaceRow.anchorNormalizedElapsedSecond = 200;
  assert.equal(deriveStructuralChallengers({ replayId: "replay_001", evidenceRows: [twoSurfaceRow, alsoTwoSurfaceRow] }, 5).candidates[0].surfaceOpportunityCount, 2);

  alsoTwoSurfaceRow.controlFamilies.healthBoundary.stageSurfaceStatus = Object.fromEntries(Object.keys(alsoTwoSurfaceRow.controlFamilies.healthBoundary.stageSurfaceStatus).map(stage => [stage, "controller_only"]));
  assert.equal(deriveStructuralChallengers({ replayId: "replay_001", evidenceRows: [twoSurfaceRow, alsoTwoSurfaceRow] }, 5).candidates[0].surfaceOpportunityCount, 1);
});

test("challengers are structural, outside anchor windows and independently matched", () => {
  const artifact = { replayId: "replay_001", evidenceRows: [row("a", 100, 400), row("b", 500, 102), row("c", 700, 900)] };
  const derived = deriveStructuralChallengers(artifact, 5);
  assert.equal(derived.excluded, 1);
  assert.equal(derived.candidates.length, 2);
  const matched = matchHorizon(artifact, derived.candidates, 10);
  assert.equal(matched.result.sourceReuseCount, 0);
  assert.equal(matched.result.anchorLifecycleRate, 0);
  assert.equal(new Set(matched.ledger.map(item => item.challengerKey)).size, matched.ledger.length);
  assert.ok(matched.ledger.every(item => !item.sourceEventKeys.includes(item.anchorKey)));
  assert.deepEqual(validateMatchingLedger(matched.ledger, "replay_001", 10), []);
  const duplicate = [...matched.ledger, matched.ledger[0]];
  assert.ok(validateMatchingLedger(duplicate, "replay_001", 10).length > 0);
});

test("duplicate source rows at one control second collapse to one structural cluster and one use", () => {
  const artifact = { replayId: "replay_001", evidenceRows: [row("a", 100, 400), row("b", 200, 400), row("c", 700, 900)] };
  const derived = deriveStructuralChallengers(artifact, 5);
  const cluster = derived.candidates.find(item => item.second === 400);
  assert.deepEqual(cluster.sourceEventKeys, ["a", "b"]);
  assert.equal(derived.candidates.filter(item => item.second === 400).length, 1);
  assert.equal(derived.deduplicatedSourceRowCount, 1);
  const matched = matchHorizon(artifact, derived.candidates, 10);
  assert.ok(matched.ledger.filter(item => item.sourceTransitionKey === cluster.clusterKey).length <= 1);
  const original = matched.ledger[0];
  const collision = { ...original, assignmentKey: "replay_001_h10_999999", anchorKey: "different_anchor", challengerKey: "different_challenger", sourceEventKeys: ["different_source_event"] };
  assert.ok(validateMatchingLedger([original, collision], "replay_001", 10).includes("source-reuse"));
});

test("exclusion and deduplication use actual forward transition second", () => {
  const edge = { replayId: "replay_001", evidenceRows: [row("edge", 394, 400, "participant_01", -2)] };
  const excluded = deriveStructuralChallengers(edge, 5);
  assert.equal(excluded.candidates.length, 0);
  assert.equal(excluded.excluded, 1);

  const converged = { replayId: "replay_001", evidenceRows: [
    row("a", 100, 400, "participant_01", -2),
    row("b", 200, 399, "participant_01", -1),
  ] };
  const derived = deriveStructuralChallengers(converged, 5);
  assert.equal(derived.candidates.length, 1);
  assert.equal(derived.candidates[0].second, 398);
  assert.match(derived.candidates[0].clusterKey, /forward_transition:398$/u);
  assert.deepEqual(derived.candidates[0].sourceEventKeys, ["a", "b"]);
});

test("real replay_013 regression uses 10-second baseline evidence instead of primary 30-second status", async () => {
  const artifact = JSON.parse(await readFile(new URL("../output/local-replay-processing/death-event-surface-resolved-lifecycle-evidence/task190-bounded32/artifacts/replay_013/death_event_surface_resolved_lifecycle_evidence.json", import.meta.url)));
  const row = artifact.evidenceRows.find(item => item.eventCandidateKey === "death_event_candidate_000006");
  assert.equal(row.anchorCoherentLifecycle, true);
  assert.equal(baselineHorizonState(row, 10, "anchor").coherentLifecycle, false);
  assert.equal(baselineHorizonState(row, 20, "anchor").coherentLifecycle, true);
  const built = await buildHardChallengerRun("task192-bounded32");
  const ten = built.ledgers[10].find(item => item.replayId === "replay_013" && item.anchorKey === "death_event_candidate_000006");
  const twenty = built.ledgers[20].find(item => item.replayId === "replay_013" && item.anchorKey === "death_event_candidate_000006");
  assert.equal(ten.anchorCoherentLifecycle, false);
  assert.equal(twenty.anchorCoherentLifecycle, true);
});

test("Task190 accepted source bridge fails closed before challenger construction", () => {
  const manifest = { manifestIdentity: "m", replayIds: ["replay_001"] };
  const gate = { technicalGateStatus: "passed", integrityStatus: "passed", measurementStatus: "completed", manifestIdentity: "m", replayIds: ["replay_001"], parserCompleted: 1, parserExpected: 1, independentlyRematchedHorizonCount: 6, surfaceProvenanceEmitted: true, allOrNothingGatePassed: true };
  for (const field of ["artifactInvariantFailures", "horizonSourceReuseCount", "participantMappingFailures", "provenanceFailures", "bridgeFailures", "schemaFailures", "outputPolicyFailures", "protectedReplayAccessCount", "finalFacts", "attribution"]) gate[field] = 0;
  assert.deepEqual(validateTask190Bridge(gate, manifest), []);
  const changed = structuredClone(gate); changed.bridgeFailures = 1;
  assert.ok(validateTask190Bridge(changed, manifest).length > 0);
});

test("pilot and bounded32 build and publish atomically with final facts false", async () => {
  const pilot = await publishHardChallengerRun("task192-pilot");
  const bounded = await publishHardChallengerRun("task192-bounded32");
  assert.equal(pilot.summary.technicalStatus, "passed");
  assert.equal(bounded.summary.technicalStatus, "passed");
  assert.equal(bounded.summary.replayCount, 32);
  assert.equal(bounded.summary.finalFactsProduced, false);
  assert.equal(bounded.summary.attributionEmitted, false);
  assert.equal(bounded.summary.sourceReuseCount, 0);
  const pilotGate = JSON.parse(await readFile(new URL("../output/local-replay-processing/death-event-hard-challenger-lifecycle-specificity/task192-pilot/gate.json", import.meta.url)));
  const boundedGate = JSON.parse(await readFile(new URL("../output/local-replay-processing/death-event-hard-challenger-lifecycle-specificity/task192-bounded32/gate.json", import.meta.url)));
  assert.equal(pilotGate.technicalGateStatus, "task190_hard_challenger_lifecycle_specificity_pilot_ready");
  assert.equal(boundedGate.technicalGateStatus, "task190_hard_challenger_lifecycle_specificity_bounded32_ready");
  assert.ok((await buildHardChallengerRun("task192-bounded32")).summary.horizonResults.every(row => row.sourceReuseCount === 0));
});
