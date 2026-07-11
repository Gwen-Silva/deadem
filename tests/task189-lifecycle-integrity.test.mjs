import test from "node:test";
import assert from "node:assert/strict";
import {
  BOUNDED_IDS,
  PILOT_IDS,
} from "../tools/validate-task187-sequence-integrity.mjs";
import {
  calculateAssignmentLedger,
  exactTask189CommitChecks,
  validateExactManifest,
  validateExactPilotGate,
  validateManifestSourcesBeforeReplay,
  validatePreOpenSources,
} from "../tools/validate-task189-lifecycle-integrity.mjs";

function sources() {
  const participant = {
    participantKey: "participant_01",
    heroRefKey: "hero_ref_01",
    teamRefKey: "team_ref_01",
  };
  const candidate = {
    eventCandidateKey: "death_event_candidate_000001",
    sourceTransitionKey: "life_transition_000001",
    participantKey: participant.participantKey,
    heroRefKey: participant.heroRefKey,
    teamRefKey: participant.teamRefKey,
    normalizedElapsedSecond: 10,
  };
  return {
    identity: {
      replayId: "replay_010",
      artifactClass: "participant_identity",
      generatedAt: "task_180",
      participantCount: 1,
      participants: [participant],
    },
    transitions: {
      replayId: "replay_010",
      artifactClass: "life_state_transition_candidates",
      generatedAt: "task_182",
      transitionCandidates: [
        {
          transitionKey: candidate.sourceTransitionKey,
          participantKey: candidate.participantKey,
          normalizedElapsedSecond: 10,
          finalFact: false,
        },
      ],
      transitionCandidateSummary: { totalTransitionCandidates: 1 },
    },
    candidates: {
      replayId: "replay_010",
      artifactClass: "death_event_candidates",
      generatedAt: "task_183",
      candidateCount: 1,
      candidates: [candidate],
    },
    controls: {
      replayId: "replay_010",
      artifactClass: "death_event_directional_discrimination_evidence",
      generatedAt: "task_186",
      anchorCount: 1,
      matchedControlCount: 1,
      evidenceRowCount: 1,
      evidenceRows: [
        {
          ...candidate,
          anchorNormalizedElapsedSecond: 10,
          controlSelectionStatus: "selected",
          controlNormalizedElapsedSecond: 20,
          truthStatus: "unconfirmed_candidate",
          finalFact: false,
        },
      ],
    },
    historical: {
      replayId: "replay_010",
      artifactClass: "death_event_exposure_matched_lifecycle_evidence",
      generatedAt: "task_189",
      anchorCount: 1,
      exactPairCount: 1,
      evidenceRowCount: 1,
      evidenceRows: [
        {
          ...candidate,
          anchorNormalizedElapsedSecond: 10,
          matchedControlNormalizedElapsedSecond: 20,
          semanticStatus: "unconfirmed_exposure_matched_lifecycle",
          finalFact: false,
        },
      ],
    },
  };
}

test("Task 189 commit belongs only to Task 189", () => {
  const checks = exactTask189CommitChecks(
    {
      tasks: [
        {
          taskId: "189",
          commitSha: "ac04dcc5c168da306fada4f6d32f590c39c16721",
        },
      ],
    },
    "Commit: ac04dcc5c168da306fada4f6d32f590c39c16721",
    "## Task 189\nTask 189 commit: `ac04dcc5c168da306fada4f6d32f590c39c16721`."
  );
  assert.ok(Object.values(checks).every(Boolean));
});
test("full pre-open bridge accepts exact sources and rejects Task 189 mismatch", () => {
  const value = sources();
  assert.equal(
    validatePreOpenSources("replay_010", value).integrityStatus,
    "passed"
  );
  value.historical.evidenceRows[0].matchedControlNormalizedElapsedSecond = 21;
  assert.equal(
    validatePreOpenSources("replay_010", value).integrityStatus,
    "failed"
  );
});
test("source mismatch blocks before path, Player, and stream hooks", async () => {
  let paths = 0;
  let players = 0;
  let streams = 0;
  const manifest = {
    version: 1,
    runKind: "task190-pilot",
    manifestIdentity: "task190_surface_resolved_pilot_v1",
    replayIds: PILOT_IDS,
  };
  await assert.rejects(() =>
    validateManifestSourcesBeforeReplay(manifest, async (replayId) => {
      const value = sources();
      for (const artifact of [
        value.identity,
        value.transitions,
        value.candidates,
        value.controls,
        value.historical,
      ])
        artifact.replayId = replayId;
      value.transitions.transitionCandidates[0].normalizedElapsedSecond = 11;
      return value;
    }).then(() => {
      paths += 1;
      players += 1;
      streams += 1;
    })
  );
  assert.deepEqual(
    { paths, players, streams },
    { paths: 0, players: 0, streams: 0 }
  );
});
test("horizon ledger calculates duplicate reuse independently", () => {
  const row = {
    horizonSeconds: 30,
    cohort: "anchor",
    participantKey: "participant_01",
    observationKey: "surface_observation_000001",
    referenceKey: "death_event_candidate_000001",
    family: "booleanAlive",
    stage: "forward",
  };
  assert.equal(calculateAssignmentLedger([row]).sourceReuseCount, 0);
  const duplicate = calculateAssignmentLedger([
    row,
    { ...row, referenceKey: "death_event_candidate_000002" },
  ]);
  assert.equal(duplicate.sourceReuseCount, 1);
  assert.equal(duplicate.integrityStatus, "failed");
  assert.equal(
    calculateAssignmentLedger([row, { ...row, horizonSeconds: 60 }])
      .sourceReuseCount,
    0
  );
});
test("exact manifests and every pilot gate field are mandatory", () => {
  assert.equal(
    validateExactManifest({
      version: 1,
      runKind: "task190-bounded32",
      manifestIdentity: "task190_surface_resolved_bounded32_v1",
      replayIds: BOUNDED_IDS,
    }),
    true
  );
  const gate = {
    gate: "surface_resolved_lifecycle_pilot_ready",
    technicalGateStatus: "passed",
    manifestIdentity: "task190_surface_resolved_pilot_v1",
    replayIds: PILOT_IDS,
    parserCompleted: 4,
    parserExpected: 4,
    anchorCount: 341,
    controlCount: 341,
    exactPairCount: 341,
    evidenceRowCount: 341,
    eventRelativePreStateEmitted: true,
    offsetDistributionEmitted: true,
    independentlyRematchedHorizonCount: 6,
    fixed180CohortCurveEmitted: true,
    surfaceProvenanceEmitted: true,
    artifactInvariantFailures: 0,
    horizonSourceReuseCount: 0,
    participantMappingFailures: 0,
    provenanceFailures: 0,
    bridgeFailures: 0,
    schemaFailures: 0,
    outputPolicyFailures: 0,
    protectedReplayAccessCount: 0,
    finalFacts: 0,
    attribution: 0,
    sizeGatePassed: true,
    allOrNothingGatePassed: true,
  };
  assert.doesNotThrow(() => validateExactPilotGate(gate));
  for (const field of Object.keys(gate))
    assert.throws(
      () => validateExactPilotGate({ ...gate, [field]: null }),
      field
    );
});
