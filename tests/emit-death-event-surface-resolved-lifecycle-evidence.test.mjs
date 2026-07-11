import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  analyzeSurfaceCohort,
  buildSurfacePairs,
  executePreparedSurfaceRun,
  prepareSurfaceResolvedRun,
  summarizeSurfaceRows,
  validateSurfaceResolvedArtifact,
} from "../tools/emit-death-event-surface-resolved-lifecycle-evidence.mjs";
import { PILOT_IDS } from "../tools/validate-task187-sequence-integrity.mjs";
import {
  schema,
  validArtifact,
} from "./death-event-surface-resolved-lifecycle-evidence-schema.test.mjs";

const participantKey = "participant_01";
const state = (controller, pawn = controller, link = true) => ({
  healthBoundary: {
    controller: controller.health,
    linked_pawn: pawn.health,
    link_relation: null,
  },
  booleanAlive: {
    controller: controller.alive,
    linked_pawn: pawn.alive,
    link_relation: null,
  },
  respawnBoundary: {
    controller: controller.respawn,
    linked_pawn: pawn.respawn,
    link_relation: null,
  },
  pawnLinkPresence: {
    controller: null,
    linked_pawn: null,
    link_relation: link,
  },
});
const origin = { health: "positive", alive: true, respawn: "non_positive" };
const changed = { health: "non_positive", alive: false, respawn: "positive" };
function mapped(samples, events) {
  return {
    samples: new Map([[participantKey, samples]]),
    sampleIndexes: new Map([
      [participantKey, new Map(samples.map((row) => [row.second, row.states]))],
    ]),
    events: new Map([[participantKey, events]]),
  };
}
function coherentNegativeOffset() {
  const samples = [5, 6, 7].map((second) => ({
    second,
    states: state(origin),
  }));
  samples.push(
    { second: 8, states: state(changed) },
    { second: 9, states: state(changed) },
    { second: 15, states: state(origin) },
    { second: 16, states: state(origin) }
  );
  const events = [];
  for (const family of ["booleanAlive", "respawnBoundary"]) {
    const toForward = family === "booleanAlive" ? false : "positive";
    const toInverse = family === "booleanAlive" ? true : "non_positive";
    events.push(
      {
        key: `${family}-f-c`,
        family,
        surface: "controller",
        second: 8,
        direction: "forward",
        toState: toForward,
      },
      {
        key: `${family}-f-p`,
        family,
        surface: "linked_pawn",
        second: 8,
        direction: "forward",
        toState: toForward,
      },
      {
        key: `${family}-i-c`,
        family,
        surface: "controller",
        second: 15,
        direction: "inverse",
        toState: toInverse,
      },
      {
        key: `${family}-i-p`,
        family,
        surface: "linked_pawn",
        second: 15,
        direction: "inverse",
        toState: toInverse,
      }
    );
  }
  return mapped(samples, events);
}
const reference = {
  participantKey,
  second: 10,
  key: "anchor",
  naturalBoundarySecond: 50,
};

test("negative offset uses event-relative pre-state and controller/pawn agreement", () => {
  const result = analyzeSurfaceCohort(
    [reference],
    coherentNegativeOffset(),
    "anchor",
    30
  ).results.get("anchor");
  assert.equal(result.coherent, true);
  assert.equal(result.families.booleanAlive.forwardDeltaSeconds, -2);
  assert.equal(
    result.families.booleanAlive.eventRelativePreStateStatus,
    "event_relative_origin_continuous"
  );
  assert.equal(
    result.families.booleanAlive.stageSurfaceStatus.forward,
    "controller_and_pawn_agree"
  );
});
test("equal-distance forward candidates remain ambiguous", () => {
  const input = coherentNegativeOffset();
  input.events
    .get(participantKey)
    .push(
      {
        key: "left",
        family: "healthBoundary",
        surface: "controller",
        second: 9,
        direction: "forward",
        toState: "non_positive",
      },
      {
        key: "right",
        family: "healthBoundary",
        surface: "controller",
        second: 11,
        direction: "forward",
        toState: "non_positive",
      }
    );
  const result = analyzeSurfaceCohort(
    [reference],
    input,
    "anchor",
    30
  ).results.get("anchor");
  assert.equal(result.ambiguous, true);
  assert.equal(result.families.healthBoundary.forwardObserved, false);
});
test("missing F-1 is a bounded event-relative failure", () => {
  const input = coherentNegativeOffset();
  input.samples.set(
    participantKey,
    input.samples.get(participantKey).filter((row) => row.second !== 7)
  );
  input.sampleIndexes.set(
    participantKey,
    new Map(
      input.samples.get(participantKey).map((row) => [row.second, row.states])
    )
  );
  const result = analyzeSurfaceCohort(
    [reference],
    input,
    "anchor",
    30
  ).results.get("anchor");
  assert.equal(
    result.families.booleanAlive.eventRelativePreStateStatus,
    "event_relative_missing_immediate_pre_sample"
  );
});
test("fresh horizon ledgers may independently assign the same observation", () => {
  const first = analyzeSurfaceCohort(
    [reference],
    coherentNegativeOffset(),
    "anchor",
    10
  );
  const second = analyzeSurfaceCohort(
    [reference],
    coherentNegativeOffset(),
    "anchor",
    20
  );
  assert.equal(first.ledger.sourceReuseCount, 0);
  assert.equal(second.ledger.sourceReuseCount, 0);
  assert.ok(
    first.assignments.some((row) =>
      second.assignments.some(
        (other) => other.observationKey === row.observationKey
      )
    )
  );
});
test("truncation causes and limiting side are cause-specific", () => {
  const anchors = {
    candidates: [
      {
        eventCandidateKey: "death_event_candidate_000001",
        participantKey,
        normalizedElapsedSecond: 10,
      },
      {
        eventCandidateKey: "death_event_candidate_000002",
        participantKey,
        normalizedElapsedSecond: 40,
      },
    ],
  };
  const controls = {
    evidenceRows: [
      {
        eventCandidateKey: "death_event_candidate_000001",
        controlNormalizedElapsedSecond: 100,
      },
      {
        eventCandidateKey: "death_event_candidate_000002",
        controlNormalizedElapsedSecond: 200,
      },
    ],
  };
  const pair = buildSurfacePairs(anchors, controls, 150)[0];
  assert.equal(pair.anchorFollowUp.cause, "next_participant_anchor");
  assert.equal(pair.controlFollowUp.cause, "replay_end");
  assert.equal(pair.limitingSide, "anchor_side");
});

test("semantic validator mutation coverage spans every invariant category", () => {
  const mutations = [
    [
      (value) => {
        value.evidenceRows[0].pairedCommonFollowUpSeconds = 179;
      },
      "common-follow-up",
    ],
    [
      (value) => {
        value.evidenceRows[0].commonFollowUpLimitingSide = "anchor_side";
      },
      "limiting-side",
    ],
    [
      (value) => {
        value.evidenceRows[0].pairExposureStatus = "partially_exposure_matched";
      },
      "exposure-status",
    ],
    [
      (value) => {
        value.evidenceRows[0].anchorAvailableFollowUpSeconds = 20;
        value.evidenceRows[0].anchorFollowUpCause = "policy_cap_180";
      },
      "anchor-cause",
    ],
    [
      (value) => {
        value.evidenceRows[0].anchorCompleteFamilyCount = 1;
      },
      "anchor-family-count",
    ],
    [
      (value) => {
        value.evidenceRows[0].anchorCoherentLifecycle = true;
        value.evidenceRows[0].anchorFamilies.respawnBoundary = structuredClone(
          value.evidenceRows[0].anchorFamilies.healthBoundary
        );
      },
      "anchor-coherence",
    ],
    [
      (value) => {
        value.evidenceRows[0].anchorFamilies.booleanAlive.completionDeltaSeconds =
          null;
      },
      "completion-presence",
    ],
    [
      (value) => {
        value.evidenceRows[0].anchorFamilies.booleanAlive.completionDeltaSeconds = 31;
      },
      "completion-limit",
    ],
    [
      (value) => {
        value.evidenceRows[0].anchorFamilies.booleanAlive.eventRelativePreStateStatus =
          "event_relative_wrong_origin";
      },
      "origin-completion",
    ],
    [
      (value) => {
        value.evidenceRows[0].surfaceSupportClass =
          "health_supported_same_surface";
      },
      "surface-support",
    ],
    [
      (value) => {
        value.evidenceRows[0].lifecycleEvidenceClass =
          "partial_surface_resolved_lifecycle";
      },
      "evidence-class",
    ],
    [
      (value) => {
        value.evidenceRows[0].horizonSpecificEvidence[0].eligible = false;
      },
      "horizon-evidence",
    ],
    [
      (value) => {
        value.evidenceRows[0].fixed180CumulativeEvidence[0].eligibleForFixedCohort = false;
      },
      "fixed-evidence",
    ],
    [
      (value) => {
        value.anchorCount = 2;
      },
      "artifact:count-invariant",
    ],
    [
      (value) => {
        value.evidenceRows.push(structuredClone(value.evidenceRows[0]));
        value.anchorCount = 2;
        value.controlCount = 2;
        value.exactPairCount = 2;
        value.evidenceRowCount = 2;
      },
      "duplicate-evidence-key",
    ],
    [
      (value) => {
        value.summary.totalAnchors = 2;
      },
      "summary-reproduction",
    ],
    [
      (value) => {
        value.readiness.readyForFinalDeathFacts = true;
      },
      "artifact:readiness",
    ],
  ];
  for (const [mutate, expected] of mutations) {
    const value = validArtifact();
    mutate(value);
    const errors = validateSurfaceResolvedArtifact(value, schema);
    assert.ok(
      errors.some((error) => error.includes(expected)),
      `${expected}: ${errors.join(",")}`
    );
  }
});
test("source bridge invariants reject Task 183 and Task 186 mutations", () => {
  const source = {
    candidates: {
      candidates: [
        {
          eventCandidateKey: "death_event_candidate_000001",
          sourceTransitionKey: "life_transition_000001",
          participantKey,
          heroRefKey: "hero_ref_01",
          teamRefKey: "team_ref_01",
          normalizedElapsedSecond: 10,
        },
      ],
    },
    controls: {
      evidenceRows: [
        {
          eventCandidateKey: "death_event_candidate_000001",
          controlNormalizedElapsedSecond: 40,
        },
      ],
    },
  };
  assert.deepEqual(
    validateSurfaceResolvedArtifact(validArtifact(), schema, source),
    []
  );
  source.controls.evidenceRows[0].controlNormalizedElapsedSecond = 41;
  assert.ok(
    validateSurfaceResolvedArtifact(validArtifact(), schema, source).some(
      (error) => error.includes("task186-control")
    )
  );
});
test("source mismatch blocks before replay path resolution", async () => {
  let resolved = 0;
  const manifest = {
    version: 1,
    runKind: "task190-pilot",
    manifestIdentity: "task190_surface_resolved_pilot_v1",
    replayIds: PILOT_IDS,
  };
  await assert.rejects(() =>
    prepareSurfaceResolvedRun({
      manifest,
      loadIntegrityGate: async () => ({
        gate: "task189_lifecycle_integrity_repaired",
        technicalGateStatus: "passed",
        replayPathResolved: false,
        playerConstructed: false,
        createReadStreamCalled: false,
      }),
      loadPilotGate: async () => ({}),
      sourceLoader: async (replayId) => ({
        identity: { replayId },
        transitions: {},
        candidates: {},
        controls: {},
        historical: {},
      }),
      onReplayPathResolution: () => {
        resolved += 1;
      },
    })
  );
  assert.equal(resolved, 0);
});
test("multi-replay failure preserves active bytes and publishes blocked metadata only", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "task190-"));
  const activeRoot = path.join(root, "active");
  const blockedRoot = path.join(root, "blocked");
  await mkdir(activeRoot);
  await writeFile(path.join(activeRoot, "marker.bin"), Buffer.from([1, 9, 0]));
  const before = await readFile(path.join(activeRoot, "marker.bin"));
  const plan = PILOT_IDS.map((replayId) => ({ replayId }));
  let call = 0;
  const result = await executePreparedSurfaceRun({
    manifest: { runKind: "task190-pilot" },
    plan,
    activeRoot,
    blockedRoot,
    replayExecutor: async (input) => {
      call += 1;
      return call === 2
        ? {
            summary: {
              replayId: input.replayId,
              status: "blocked",
              errorMessage: "intentional",
            },
            artifact: null,
          }
        : {
            summary: { replayId: input.replayId, status: "emitted" },
            artifact: { replayId: input.replayId },
          };
    },
  });
  assert.equal(result.status, "blocked");
  assert.deepEqual(await readFile(path.join(activeRoot, "marker.bin")), before);
  assert.deepEqual((await readdir(blockedRoot)).sort(), [
    "blocked-gate.json",
    "blocked-summary.json",
    "failure-audits.json",
  ]);
});
test("summary is exactly reproducible from rows", () => {
  const value = validArtifact();
  assert.deepEqual(summarizeSurfaceRows(value.evidenceRows), value.summary);
});
