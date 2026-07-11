import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCensusSummary,
  deriveReplayWideCensus,
  prepareCensusRun,
  validateCensusBridges,
} from "../tools/emit-replay-wide-hard-challenger-census.mjs";

function states(values = {}) {
  const empty = () => ({ controller: null, linked_pawn: null, link_relation: null });
  const result = { healthBoundary: empty(), booleanAlive: empty(), respawnBoundary: empty(), pawnLinkPresence: empty() };
  for (const [key, value] of Object.entries(values)) {
    const [family, surface] = key.split(":");
    result[family][surface] = value;
  }
  return result;
}
function mappedFixture() {
  return {
    status: "passed",
    failures: 0,
    events: new Map([["participant_01", [
      { key: "obs_1", family: "healthBoundary", surface: "controller", second: 10, direction: "forward", toState: "non_positive" },
      { key: "obs_2", family: "healthBoundary", surface: "linked_pawn", second: 10, direction: "forward", toState: "non_positive" },
      { key: "obs_3", family: "booleanAlive", surface: "controller", second: 30, direction: "forward", toState: false },
      { key: "obs_4", family: "respawnBoundary", surface: "controller", second: 40, direction: "forward", toState: "positive" },
      { key: "obs_inverse", family: "healthBoundary", surface: "controller", second: 50, direction: "inverse", toState: "positive" },
    ]]]),
    sampleIndexes: new Map([["participant_01", new Map([
      [11, states({ "healthBoundary:controller": "non_positive", "healthBoundary:linked_pawn": "non_positive" })],
      [31, states({ "booleanAlive:controller": false })],
      [41, states({ "respawnBoundary:controller": "non_positive" })],
    ])]]),
  };
}
const anchors = [{ participantKey: "participant_01", normalizedElapsedSecond: 15 }];

test("census clusters use actual seconds, immediate persistence, deduplication and all anchor windows", () => {
  const result = deriveReplayWideCensus({ replayId: "replay_001", mapped: mappedFixture(), replayEndSecond: 100, anchors });
  assert.equal(result.forwardObservationCount, 4);
  assert.equal(result.persistentObservationCount, 3);
  assert.equal(result.immediatePersistenceFailureCount, 1);
  assert.equal(result.clusterCount, 2);
  assert.equal(result.deduplicatedObservationCount, 1);
  assert.equal(result.sourceReuseCount, 0);
  assert.equal(result.clusterReuseCount, 0);
  const atTen = result.clusters.find(cluster => cluster.actualTransitionSecond === 10);
  assert.equal(atTen.surfaceOpportunityCount, 2);
  assert.deepEqual(atTen.sourceObservationKeys, ["obs_1", "obs_2"]);
  assert.deepEqual(atTen.outsideAnchorWindows, { "3": true, "5": false, "10": false });
  const atThirty = result.clusters.find(cluster => cluster.actualTransitionSecond === 30);
  assert.deepEqual(atThirty.outsideAnchorWindows, { "3": true, "5": true, "10": true });
  assert.match(atThirty.clusterKey, /forward_transition:30$/u);
});

test("accepted-baseline bridge failures stop before replay path planning", async () => {
  const sourceManifest = { replayIds: ["replay_001"] };
  const task190Gate = { technicalGateStatus: "passed", integrityStatus: "passed", measurementStatus: "completed", protectedReplayAccessCount: 0, participantMappingFailures: 0, bridgeFailures: 0, parserCompleted: 32, parserExpected: 32 };
  const task192Gate = { technicalGateStatus: "task190_hard_challenger_lifecycle_specificity_bounded32_ready", integrityStatus: "passed", measurementStatus: "completed", finalFacts: 0, attribution: 0, operationalSpecificityAssessment: "insufficient" };
  const task192Summary = { finalFactsProduced: false, attributionEmitted: false, assessment: "insufficient" };
  assert.deepEqual(validateCensusBridges(sourceManifest, task190Gate, task192Gate, task192Summary), []);
  let planned = false;
  await assert.rejects(() => prepareCensusRun({ sourceManifest, loadTask190Gate: async () => task190Gate, loadTask192Gate: async () => ({ ...task192Gate, finalFacts: 1 }), loadTask192Summary: async () => task192Summary, preparePlan: async () => { planned = true; return []; } }), /pre-open/u);
  assert.equal(planned, false);
  await assert.rejects(() => prepareCensusRun({ sourceManifest: { replayIds: ["replay_005"] }, loadTask190Gate: async () => task190Gate, loadTask192Gate: async () => task192Gate, loadTask192Summary: async () => task192Summary, preparePlan: async () => { planned = true; return []; } }), /protected-replay/u);
  assert.equal(planned, false);
});

test("summary applies declared feasibility thresholds without running specificity", () => {
  const base = deriveReplayWideCensus({ replayId: "replay_001", mapped: mappedFixture(), replayEndSecond: 100, anchors });
  const rows = Array.from({ length: 15 }, (_, index) => ({ ...base, replayId: `replay_${String(index + 1).padStart(3, "0")}`, clusters: base.clusters.map((cluster, clusterIndex) => ({ ...cluster, replayId: `replay_${String(index + 1).padStart(3, "0")}`, clusterKey: `cluster_${index}_${clusterIndex}` })) }));
  const summary = buildCensusSummary("task193-pilot", { replayIds: rows.map(row => row.replayId) }, rows);
  assert.equal(summary.feasibility.primaryEligibleClusterCount, 15);
  assert.equal(summary.feasibility.assessment, "insufficient");
  assert.equal(summary.specificityComparisonPerformed, false);
  const sufficientRows = [...rows, ...rows, ...rows, ...rows, ...rows, ...rows, ...rows];
  const sufficient = buildCensusSummary("task193-pilot", { replayIds: sufficientRows.map((_, index) => `replay_${String(index + 1).padStart(3, "0")}`) }, sufficientRows);
  assert.equal(sufficient.feasibility.assessment, "sufficient");
});
