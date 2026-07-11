import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  summarizeSurfaceRows,
  validateSurfaceResolvedArtifact,
} from "../tools/emit-death-event-surface-resolved-lifecycle-evidence.mjs";

const schema = JSON.parse(
  await readFile(
    new URL(
      "../schemas/death-event-surface-resolved-lifecycle-evidence.schema.json",
      import.meta.url
    ),
    "utf8"
  )
);
const surfaces = {
  preState: "controller_only",
  forward: "controller_only",
  forwardPersistence: "controller_only",
  inverse: "controller_only",
  recoveryPersistence: "controller_only",
};
const complete = {
  eventRelativePreStateStatus: "event_relative_origin_continuous",
  forwardObserved: true,
  forwardDeltaSeconds: 0,
  forwardPersistenceObserved: true,
  inverseObserved: true,
  inverseDeltaSeconds: 8,
  recoveryPersistenceObserved: true,
  completionDeltaSeconds: 9,
  completeSameFamilyLifecycle: true,
  stageSurfaceStatus: surfaces,
  failureReason: "none",
};
const empty = {
  eventRelativePreStateStatus: "event_relative_insufficient_pre_state",
  forwardObserved: false,
  forwardDeltaSeconds: null,
  forwardPersistenceObserved: false,
  inverseObserved: false,
  inverseDeltaSeconds: null,
  recoveryPersistenceObserved: false,
  completionDeltaSeconds: null,
  completeSameFamilyLifecycle: false,
  stageSurfaceStatus: {
    preState: "surface_unavailable",
    forward: "surface_unavailable",
    forwardPersistence: "surface_unavailable",
    inverse: "surface_unavailable",
    recoveryPersistence: "surface_unavailable",
  },
  failureReason: "forward_not_observed",
};
const anchorFamilies = {
  healthBoundary: empty,
  booleanAlive: complete,
  respawnBoundary: complete,
  pawnLinkPresence: empty,
};
const controlFamilies = {
  healthBoundary: empty,
  booleanAlive: empty,
  respawnBoundary: empty,
  pawnLinkPresence: empty,
};
const horizons = [10, 20, 30, 60, 120, 180];
const row = {
  surfaceResolvedLifecycleEvidenceKey: "surface_resolved_lifecycle_000001",
  eventCandidateKey: "death_event_candidate_000001",
  sourceTransitionKey: "life_transition_000001",
  participantKey: "participant_01",
  heroRefKey: "hero_ref_01",
  teamRefKey: "team_ref_01",
  anchorNormalizedElapsedSecond: 10,
  matchedControlNormalizedElapsedSecond: 40,
  anchorAvailableFollowUpSeconds: 180,
  controlAvailableFollowUpSeconds: 180,
  pairedCommonFollowUpSeconds: 180,
  anchorFollowUpCause: "policy_cap_180",
  controlFollowUpCause: "policy_cap_180",
  commonFollowUpLimitingSide: "equal_horizon",
  pairExposureStatus: "fully_exposure_matched",
  anchorFamilies,
  controlFamilies,
  anchorCompleteFamilyCount: 2,
  controlCompleteFamilyCount: 0,
  anchorCoherentLifecycle: true,
  controlCoherentLifecycle: false,
  surfaceSupportClass: "boolean_respawn_same_surface_only",
  actualCrossSurfaceSupport: false,
  crossBoundaryRecoveryObserved: false,
  contradictionObserved: false,
  ambiguousAssociation: false,
  lifecycleEvidenceClass: "coherent_surface_resolved_lifecycle",
  horizonSpecificEvidence: horizons.map((horizonSeconds) => ({
    horizonSeconds,
    eligible: true,
    anchorCoherentLifecycle: true,
    controlCoherentLifecycle: false,
    anchorAssignmentCount: 4,
    controlAssignmentCount: 0,
    sourceReuseCount: 0,
  })),
  fixed180CumulativeEvidence: horizons.map((horizonSeconds) => ({
    horizonSeconds,
    eligibleForFixedCohort: true,
    anchorCoherentLifecycle: true,
    controlCoherentLifecycle: false,
    anchorAssignmentCount: 4,
    controlAssignmentCount: 0,
    sourceReuseCount: 0,
  })),
  semanticStatus: "unconfirmed_surface_resolved_lifecycle",
  finalFact: false,
};
const summary = summarizeSurfaceRows([row]);
const readiness = {
  eventWindowSymmetricLifecycleEvidenceAvailable: true,
  independentlyRematchedHorizonEvidenceAvailable: true,
  surfaceProvenanceMeasurable: true,
  fixedCohortCompletionCurvesAvailable: true,
  candidateLevelSurfaceResolvedLifecycleConsumptionAvailable: true,
  readyForOperationalDeathFactPromotionReview: false,
  readyForFinalDeathFacts: false,
  readyForConfirmedWhoDied: false,
  readyForAttribution: false,
  readyForKillerVictim: false,
  readyForTeamfight: false,
  readyForGameplayInterpretation: false,
};
const artifact = {
  schemaVersion: 1,
  replayId: "replay_010",
  artifactClass: "death_event_surface_resolved_lifecycle_evidence",
  generatedBy: "tools/emit-death-event-surface-resolved-lifecycle-evidence.mjs",
  generatedAt: "task_190",
  rawDataCaptured: false,
  rawFieldNamesIncludedInRows: false,
  rawIdsIncluded: false,
  rawTicksIncluded: false,
  rawTimestampsIncluded: false,
  finalFactsProduced: false,
  attributionEmitted: false,
  anchorCount: 1,
  controlCount: 1,
  exactPairCount: 1,
  evidenceRowCount: 1,
  evidenceRows: [row],
  summary,
  readiness,
  limitations: ["Unconfirmed candidate evidence only."],
};

export function validArtifact() {
  return structuredClone(artifact);
}
export { schema };
test("surface-resolved schema and semantic invariants accept a safe artifact", () =>
  assert.deepEqual(
    validateSurfaceResolvedArtifact(validArtifact(), schema),
    []
  ));
test("schema rejects raw fields and final facts", () => {
  const value = validArtifact();
  value.evidenceRows[0].rawValue = 1;
  value.evidenceRows[0].finalFact = true;
  const errors = validateSurfaceResolvedArtifact(value, schema);
  assert.ok(errors.some((error) => error.startsWith("schema:")));
  assert.ok(errors.some((error) => error.includes("final-fact")));
});
