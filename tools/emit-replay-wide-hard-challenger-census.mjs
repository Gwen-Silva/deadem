#!/usr/bin/env node
import { createReadStream } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Logger, Player } from "deadem";
import { validateJsonSchema } from "./lib/json-schema-validator.mjs";
import { publishRunOutcome } from "./emit-death-event-directional-discrimination-evidence.mjs";
import {
  mapReplayWideSurfaceObservations,
  observeReplayWideSurfaceSample,
  prepareSurfaceResolvedRun,
} from "./emit-death-event-surface-resolved-lifecycle-evidence.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = "output/local-replay-processing/replay-wide-hard-challenger-census";
const TASK190 = "output/local-replay-processing/death-event-surface-resolved-lifecycle-evidence";
const TASK192 = "output/local-replay-processing/death-event-hard-challenger-lifecycle-specificity";
const HORIZONS = [10, 20, 30, 60, 120, 180];
const WINDOWS = [3, 5, 10];
const PROTECTED = new Set(["replay_005", "replay_006", "replay_007", "replay_008"]);
const FEASIBILITY = Object.freeze({ limitedMinimum: 30, sufficientMinimum: 100 });

async function readJson(relative) {
  return JSON.parse(await readFile(path.resolve(ROOT, relative), "utf8"));
}
async function writeJson(relative, value) {
  const target = path.resolve(ROOT, relative);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(value, null, 2)}\n`);
}
const safeNumber = value => Number.isFinite(Number(value)) ? Number(value) : null;

function sourceRunKind(runKind) {
  if (runKind === "task193-pilot") return "task190-pilot";
  if (runKind === "task193-bounded32") return "task190-bounded32";
  throw new Error(`unsupported census run kind: ${runKind}`);
}
function sourcePrefix(sourceKind) {
  return sourceKind === "task190-pilot" ? "surface-resolved-lifecycle-pilot" : "surface-resolved-lifecycle-bounded32";
}

export function validateCensusBridges(sourceManifest, task190Gate, task192Gate, task192Summary) {
  const errors = [];
  if (sourceManifest.replayIds.some(replayId => PROTECTED.has(replayId))) errors.push("protected-replay-membership");
  if (task190Gate.technicalGateStatus !== "passed" || task190Gate.integrityStatus !== "passed" || task190Gate.measurementStatus !== "completed") errors.push("task190-technical-gate");
  if (task190Gate.protectedReplayAccessCount !== 0 || task190Gate.participantMappingFailures !== 0 || task190Gate.bridgeFailures !== 0 || task190Gate.parserCompleted !== task190Gate.parserExpected) errors.push("task190-integrity-counters");
  if (task192Gate.technicalGateStatus !== "task190_hard_challenger_lifecycle_specificity_bounded32_ready" || task192Gate.integrityStatus !== "passed" || task192Gate.measurementStatus !== "completed") errors.push("task192-technical-gate");
  if (task192Gate.finalFacts !== 0 || task192Gate.attribution !== 0 || task192Gate.operationalSpecificityAssessment !== "insufficient") errors.push("task192-truth-boundary");
  if (task192Summary.finalFactsProduced !== false || task192Summary.attributionEmitted !== false || task192Summary.assessment !== "insufficient") errors.push("task192-summary-boundary");
  return errors;
}

export async function prepareCensusRun({
  sourceManifest,
  loadTask190Gate,
  loadTask192Gate,
  loadTask192Summary,
  preparePlan,
}) {
  const [task190Gate, task192Gate, task192Summary] = await Promise.all([loadTask190Gate(), loadTask192Gate(), loadTask192Summary()]);
  const errors = validateCensusBridges(sourceManifest, task190Gate, task192Gate, task192Summary);
  if (errors.length) throw new Error(`pre-open accepted-baseline bridge failed: ${errors.join("; ")}`);
  const plan = await preparePlan();
  return { plan, task190Gate, task192Gate };
}

function immediatePersistence(event, sampleIndex) {
  const next = sampleIndex.get(event.second + 1)?.[event.family]?.[event.surface];
  return next !== null && next !== undefined && typeof next === typeof event.toState && next === event.toState;
}
function ambiguity(sources) {
  const byFamily = new Map();
  for (const source of sources) {
    if (!byFamily.has(source.family)) byFamily.set(source.family, new Set());
    byFamily.get(source.family).add(`${typeof source.toState}:${String(source.toState)}`);
  }
  return [...byFamily.values()].some(values => values.size > 1);
}
function followUp(second, replayEndSecond, participantAnchors) {
  const nextAnchor = participantAnchors.filter(anchor => anchor > second).sort((left, right) => left - right)[0] ?? null;
  const replayAvailable = Math.max(0, replayEndSecond - second);
  const anchorAvailable = nextAnchor === null ? Number.POSITIVE_INFINITY : Math.max(0, nextAnchor - second - 1);
  const availableFollowUpSeconds = Math.min(180, replayAvailable, anchorAvailable);
  const causes = [];
  if (availableFollowUpSeconds === 180) causes.push("policy_cap_180");
  if (availableFollowUpSeconds === replayAvailable) causes.push("replay_end");
  if (availableFollowUpSeconds === anchorAvailable) causes.push("next_participant_anchor");
  return { availableFollowUpSeconds, followUpCause: causes.sort().join("+") };
}

export function deriveReplayWideCensus({ replayId, mapped, replayEndSecond, anchors }) {
  const anchorsByParticipant = new Map();
  for (const anchor of anchors) {
    if (!anchorsByParticipant.has(anchor.participantKey)) anchorsByParticipant.set(anchor.participantKey, []);
    anchorsByParticipant.get(anchor.participantKey).push(anchor.normalizedElapsedSecond);
  }
  const forward = [];
  const persistent = [];
  for (const [participantKey, events] of mapped.events) {
    const sampleIndex = mapped.sampleIndexes.get(participantKey) ?? new Map();
    for (const event of events.filter(row => row.direction === "forward")) {
      const source = { participantKey, ...event };
      forward.push(source);
      if (immediatePersistence(event, sampleIndex)) persistent.push(source);
    }
  }
  const grouped = new Map();
  for (const source of persistent) {
    const clusterKey = `${replayId}:${source.participantKey}:forward_transition:${source.second}`;
    if (!grouped.has(clusterKey)) grouped.set(clusterKey, []);
    grouped.get(clusterKey).push(source);
  }
  const clusters = [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([clusterKey, sources], index) => {
    const participantKey = sources[0].participantKey;
    const actualTransitionSecond = sources[0].second;
    const participantAnchors = anchorsByParticipant.get(participantKey) ?? [];
    const distances = participantAnchors.map(anchor => Math.abs(anchor - actualTransitionSecond));
    const minimumAnchorDistanceSeconds = distances.length ? Math.min(...distances) : null;
    const outsideAnchorWindows = Object.fromEntries(WINDOWS.map(windowSeconds => [String(windowSeconds), minimumAnchorDistanceSeconds === null || minimumAnchorDistanceSeconds > windowSeconds]));
    const surfaces = [...new Set(sources.map(source => source.surface))].sort();
    const families = [...new Set(sources.map(source => source.family))].sort();
    return {
      clusterKey,
      clusterOrdinal: index + 1,
      replayId,
      participantKey,
      actualTransitionSecond,
      sourceObservationKeys: sources.map(source => source.key).sort(),
      familyNames: families,
      surfaceNames: surfaces,
      familyCount: families.length,
      surfaceOpportunityCount: Math.min(2, surfaces.length),
      immediatePersistence: true,
      ambiguous: ambiguity(sources),
      minimumAnchorDistanceSeconds,
      outsideAnchorWindows,
      ...followUp(actualTransitionSecond, replayEndSecond, participantAnchors),
    };
  });
  const sourceKeys = clusters.flatMap(cluster => cluster.sourceObservationKeys);
  const clusterKeys = clusters.map(cluster => cluster.clusterKey);
  const sourceReuseCount = sourceKeys.length - new Set(sourceKeys).size;
  const clusterReuseCount = clusterKeys.length - new Set(clusterKeys).size;
  return {
    replayId,
    parserCompleted: true,
    mappingStatus: mapped.status,
    mappingFailures: mapped.failures,
    replayEndSecond,
    anchorCount: anchors.length,
    forwardObservationCount: forward.length,
    persistentObservationCount: persistent.length,
    immediatePersistenceFailureCount: forward.length - persistent.length,
    clusterCount: clusters.length,
    deduplicatedObservationCount: persistent.length - clusters.length,
    sourceReuseCount,
    clusterReuseCount,
    clusters,
  };
}

export async function parseReplayWideCensus(input, playerFactory = () => new Player(undefined, Logger.NOOP), streamFactory = createReadStream) {
  let player;
  try {
    player = playerFactory();
    const aggregate = { seeds: new Set(), samples: new Map() };
    await player.load(streamFactory(input.absolutePath));
    const first = safeNumber(player.getFirstTick()) ?? 0;
    const tickRate = safeNumber(player.getDemo().server?.tickRate) ?? 30;
    let next = first;
    let replayEndSecond = 0;
    while (true) {
      const tick = safeNumber(player.getCurrentTick());
      if (tick !== null) replayEndSecond = Math.max(0, Math.round((tick - first) / Math.max(1, tickRate)));
      if (tick !== null && tick >= next) {
        observeReplayWideSurfaceSample(player, aggregate, replayEndSecond);
        next = tick + Math.max(1, Math.round(tickRate));
      }
      if (!(await player.nextTick())) break;
    }
    const mapped = mapReplayWideSurfaceObservations(aggregate, input.sources.identity);
    return deriveReplayWideCensus({ replayId: input.replayId, mapped, replayEndSecond, anchors: input.sources.candidates.candidates });
  } finally {
    await player?.dispose?.().catch(() => {});
  }
}

function feasibility(primaryEligibleClusterCount) {
  const assessment = primaryEligibleClusterCount >= FEASIBILITY.sufficientMinimum ? "sufficient" : primaryEligibleClusterCount >= FEASIBILITY.limitedMinimum ? "limited" : "insufficient";
  return { assessment, primaryHorizonSeconds: 30, primaryEligibleClusterCount, thresholds: FEASIBILITY };
}
function readiness() {
  return { replayWideCensusAvailable: true, readyForSpecificityComparison: false, readyForFinalDeathFacts: false, readyForConfirmedWhoDied: false, readyForAttribution: false, readyForKillerVictim: false, readyForTeamfight: false, readyForGameplayInterpretation: false };
}

export function buildCensusSummary(runKind, sourceManifest, results) {
  const clusters = results.flatMap(result => result.clusters);
  const eligible = clusters.filter(cluster => cluster.outsideAnchorWindows["5"]);
  const horizonResults = HORIZONS.map(horizonSeconds => {
    const rows = eligible.filter(cluster => cluster.availableFollowUpSeconds >= horizonSeconds);
    return { horizonSeconds, eligibleClusterCount: rows.length, replayCoverageCount: new Set(rows.map(row => row.replayId)).size };
  });
  const primary = horizonResults.find(row => row.horizonSeconds === 30);
  const familyComposition = Object.fromEntries(["healthBoundary", "booleanAlive", "respawnBoundary", "pawnLinkPresence"].map(family => [family, eligible.filter(cluster => cluster.familyNames.includes(family)).length]));
  const surfaceOpportunityComposition = { zero: eligible.filter(cluster => cluster.surfaceOpportunityCount === 0).length, one: eligible.filter(cluster => cluster.surfaceOpportunityCount === 1).length, two: eligible.filter(cluster => cluster.surfaceOpportunityCount === 2).length };
  return {
    schemaVersion: 1,
    runKind,
    artifactClass: "replay_wide_structural_hard_challenger_census",
    manifestIdentity: `${runKind}_replay_wide_census_v1`,
    replayIds: sourceManifest.replayIds,
    sourceBaselines: ["task180_participant_identity", "task183_death_event_anchors", "task190_one_second_surface_observations", "task192_hard_challenger_contract"],
    primaryExclusionWindowSeconds: 5,
    exclusionWindowsSeconds: WINDOWS,
    horizonResults,
    replayCount: sourceManifest.replayIds.length,
    parserCompleted: results.filter(result => result.parserCompleted).length,
    parserExpected: sourceManifest.replayIds.length,
    participantMappingFailures: results.reduce((sum, result) => sum + result.mappingFailures, 0),
    protectedReplayAccessCount: 0,
    preOpenBridgeFailures: 0,
    anchorCount: results.reduce((sum, result) => sum + result.anchorCount, 0),
    forwardObservationCount: results.reduce((sum, result) => sum + result.forwardObservationCount, 0),
    persistentObservationCount: results.reduce((sum, result) => sum + result.persistentObservationCount, 0),
    immediatePersistenceFailureCount: results.reduce((sum, result) => sum + result.immediatePersistenceFailureCount, 0),
    clusterCount: clusters.length,
    eligibleClusterCount: eligible.length,
    excludedClusterCount: clusters.length - eligible.length,
    deduplicatedObservationCount: results.reduce((sum, result) => sum + result.deduplicatedObservationCount, 0),
    sourceReuseCount: results.reduce((sum, result) => sum + result.sourceReuseCount, 0),
    clusterReuseCount: results.reduce((sum, result) => sum + result.clusterReuseCount, 0),
    ambiguityCount: eligible.filter(cluster => cluster.ambiguous).length,
    familyComposition,
    surfaceOpportunityComposition,
    feasibility: feasibility(primary.eligibleClusterCount),
    technicalStatus: "passed",
    specificityComparisonPerformed: false,
    finalFactsProduced: false,
    attributionEmitted: false,
    readiness: readiness(),
    limitations: ["Structural clusters are replay-sourced feasibility observations, not truth-labeled deaths or non-deaths.", "This census does not run a lifecycle specificity comparison."],
  };
}

export function validateCensusSummary(summary, schema) {
  const errors = validateJsonSchema(schema, summary).errors.map(error => `schema:${error}`);
  if (summary.replayCount !== summary.replayIds.length || summary.parserCompleted !== summary.parserExpected || summary.parserExpected !== summary.replayCount) errors.push("replay-parser-count");
  if (summary.replayIds.some(replayId => PROTECTED.has(replayId)) || summary.protectedReplayAccessCount !== 0) errors.push("protected-replay");
  if (summary.horizonResults.map(row => row.horizonSeconds).join(",") !== HORIZONS.join(",")) errors.push("horizon-order");
  if (summary.horizonResults.some((row, index, rows) => index > 0 && row.eligibleClusterCount > rows[index - 1].eligibleClusterCount)) errors.push("horizon-denominator-monotonicity");
  if (summary.sourceReuseCount !== 0 || summary.clusterReuseCount !== 0 || summary.participantMappingFailures !== 0 || summary.preOpenBridgeFailures !== 0) errors.push("integrity-counter");
  if (summary.eligibleClusterCount + summary.excludedClusterCount !== summary.clusterCount) errors.push("cluster-denominator");
  if (summary.surfaceOpportunityComposition.zero + summary.surfaceOpportunityComposition.one + summary.surfaceOpportunityComposition.two !== summary.eligibleClusterCount) errors.push("surface-denominator");
  const primary = summary.horizonResults.find(row => row.horizonSeconds === 30)?.eligibleClusterCount;
  if (summary.feasibility.primaryEligibleClusterCount !== primary || summary.feasibility.assessment !== feasibility(primary).assessment) errors.push("feasibility-threshold");
  if (summary.specificityComparisonPerformed || summary.finalFactsProduced || summary.attributionEmitted || Object.entries(summary.readiness).some(([key, value]) => key !== "replayWideCensusAvailable" && value)) errors.push("truth-boundary");
  return errors;
}

function buildOutputFiles(runKind, sourceManifest, prepared, results, summary) {
  const clusters = results.flatMap(result => result.clusters);
  const sourceKeys = clusters.flatMap(cluster => cluster.sourceObservationKeys);
  const eligibleByWindow = WINDOWS.map(windowSeconds => ({ windowSeconds, eligibleClusterCount: clusters.filter(cluster => cluster.outsideAnchorWindows[String(windowSeconds)]).length, excludedClusterCount: clusters.filter(cluster => !cluster.outsideAnchorWindows[String(windowSeconds)]).length }));
  const gate = { schemaVersion: 1, technicalGateStatus: runKind === "task193-bounded32" ? "replay_wide_hard_challenger_census_bounded32_ready" : "replay_wide_hard_challenger_census_pilot_ready", runKind, integrityStatus: "passed", measurementStatus: "completed", censusFeasibilityAssessment: summary.feasibility.assessment, parserCompleted: summary.parserCompleted, parserExpected: summary.parserExpected, participantMappingFailures: 0, preOpenBridgeFailures: 0, protectedReplayAccessCount: 0, sourceReuseCount: 0, clusterReuseCount: 0, specificityComparisons: 0, finalFacts: 0, attribution: 0, atomicPublication: true };
  return { gate, files: [
    { relativePath: "manifest.json", value: { schemaVersion: 1, runKind, sourceManifestIdentity: sourceManifest.manifestIdentity, replayIds: sourceManifest.replayIds, membershipExact: true } },
    { relativePath: "task180-183-190-192-pre-open-bridge-audit.json", value: { schemaVersion: 1, integrityStatus: "passed", replayPathResolutionAfterBridge: true, task190GateStatus: prepared.task190Gate.technicalGateStatus, task192GateStatus: prepared.task192Gate.technicalGateStatus, replayIds: sourceManifest.replayIds, bridgeFailures: 0, protectedReplayAccessCount: 0 } },
    { relativePath: "summary.json", value: summary },
    { relativePath: "per-replay-census.json", value: { schemaVersion: 1, rows: results.map(({ clusters: _clusters, ...result }) => result) } },
    { relativePath: "structural-cluster-ledger.json", value: { schemaVersion: 1, clusterIdentity: "replay_participant_actual_transition_second", rows: clusters } },
    { relativePath: "actual-second-exclusion-sensitivity-audit.json", value: { schemaVersion: 1, primaryWindowSeconds: 5, windows: eligibleByWindow } },
    { relativePath: "immediate-persistence-audit.json", value: { schemaVersion: 1, forwardObservationCount: summary.forwardObservationCount, persistentObservationCount: summary.persistentObservationCount, failureCount: summary.immediatePersistenceFailureCount, requirement: "same family and surface retains the forward state at actual transition second plus one" } },
    { relativePath: "family-surface-composition.json", value: { schemaVersion: 1, familyComposition: summary.familyComposition, surfaceOpportunityComposition: summary.surfaceOpportunityComposition, surfaceOpportunityScale: "zero, one, or at-least-two observable abstract surfaces capped at two" } },
    { relativePath: "horizon-eligibility.json", value: { schemaVersion: 1, primaryExclusionWindowSeconds: 5, horizons: summary.horizonResults } },
    { relativePath: "deduplication-reuse-ledger.json", value: { schemaVersion: 1, persistentObservationAssignments: sourceKeys.length, uniqueSourceObservations: new Set(sourceKeys).size, sourceReuseCount: sourceKeys.length - new Set(sourceKeys).size, clusterAssignments: clusters.length, uniqueClusters: new Set(clusters.map(cluster => cluster.clusterKey)).size, clusterReuseCount: clusters.length - new Set(clusters.map(cluster => cluster.clusterKey)).size } },
    { relativePath: "feasibility-thresholds.json", value: { schemaVersion: 1, primaryHorizonSeconds: 30, thresholds: FEASIBILITY, assessment: summary.feasibility.assessment, eligibleClusterCount: summary.feasibility.primaryEligibleClusterCount, specificityComparisonPerformed: false } },
    { relativePath: "gate.json", value: gate },
  ] };
}

export async function publishCensusRun({ runKind, sourceManifest, prepared, results, schema }) {
  const summary = buildCensusSummary(runKind, sourceManifest, results);
  const errors = validateCensusSummary(summary, schema);
  if (errors.length) throw new Error(`census summary invalid: ${errors.join("; ")}`);
  const built = buildOutputFiles(runKind, sourceManifest, prepared, results, summary);
  const activeRoot = path.resolve(ROOT, `${OUTPUT}/${runKind}`);
  const blockedRoot = `${activeRoot}-blocked`;
  await publishRunOutcome({ activeRoot, blockedRoot, success: true, files: built.files });
  await rm(blockedRoot, { recursive: true, force: true });
  if (runKind === "task193-bounded32") {
    await writeJson(`${OUTPUT}/task193-summary.json`, summary);
    await writeJson(`${OUTPUT}/task193-gate.json`, built.gate);
  }
  return { summary, gate: built.gate };
}

export async function publishBlockedCensus(runKind, sourceManifest, error) {
  const message = String(error?.message ?? error);
  const blockerCode = /ENOENT|no such file or directory/u.test(message) ? "authorized_replay_files_unavailable" : "census_execution_precondition_failed";
  const gate = { schemaVersion: 1, technicalGateStatus: "replay_wide_hard_challenger_census_blocked", runKind, integrityStatus: "passed", measurementStatus: "blocked", blockerCode, protectedReplayAccessCount: 0, specificityComparisons: 0, finalFacts: 0, attribution: 0, atomicPublication: true };
  const summary = { schemaVersion: 1, runKind, status: "blocked", blockerCode, missingCapability: blockerCode === "authorized_replay_files_unavailable" ? "authorized replay files for replay-wide one-second observation" : "validated census execution precondition", sourceManifestIdentity: sourceManifest.manifestIdentity, replayIds: sourceManifest.replayIds, parserCompleted: 0, parserExpected: sourceManifest.replayIds.length, activeOutputsReplaced: false, specificityComparisonPerformed: false, finalFactsProduced: false, attributionEmitted: false };
  const activeRoot = path.resolve(ROOT, `${OUTPUT}/${runKind}`);
  const blockedRoot = `${activeRoot}-blocked`;
  await publishRunOutcome({ activeRoot, blockedRoot, success: false, files: [{ relativePath: "gate.json", value: gate }, { relativePath: "summary.json", value: summary }] });
  await writeJson(`${OUTPUT}/task193-gate.json`, gate);
  await writeJson(`${OUTPUT}/task193-summary.json`, summary);
  return { gate, summary };
}

export async function runReplayWideCensus(runKind, dependencies = {}) {
  const sourceKind = sourceRunKind(runKind);
  const prefix = sourcePrefix(sourceKind);
  const sourceManifest = await readJson(`${TASK190}/${sourceKind}/${prefix}-manifest.json`);
  try {
    let pathResolutionCount = 0;
    const prepared = await prepareCensusRun({
      sourceManifest,
      loadTask190Gate: dependencies.loadTask190Gate ?? (() => readJson(`${TASK190}/task190-gate.json`)),
      loadTask192Gate: dependencies.loadTask192Gate ?? (() => readJson(`${TASK192}/task192-gate.json`)),
      loadTask192Summary: dependencies.loadTask192Summary ?? (() => readJson(`${TASK192}/task192-summary.json`)),
      preparePlan: dependencies.preparePlan ?? (() => prepareSurfaceResolvedRun({ manifest: sourceManifest, loadIntegrityGate: () => readJson(`${TASK190}/integrity/task189-lifecycle-integrity-gate.json`), loadPilotGate: () => readJson(`${TASK190}/task190-pilot/surface-resolved-lifecycle-pilot-gate.json`), onReplayPathResolution: replayId => { if (PROTECTED.has(replayId)) throw new Error("protected replay path resolution"); pathResolutionCount += 1; } })),
    });
    if (pathResolutionCount && pathResolutionCount !== sourceManifest.replayIds.length) throw new Error("replay path resolution count mismatch");
    const results = [];
    for (const input of prepared.plan) results.push(await (dependencies.replayExecutor ?? parseReplayWideCensus)(input));
    if (results.some(result => !result.parserCompleted || result.mappingStatus !== "passed" || result.sourceReuseCount !== 0 || result.clusterReuseCount !== 0)) throw new Error("replay-wide census integrity failed");
    const schema = dependencies.schema ?? await readJson("schemas/replay-wide-hard-challenger-census.schema.json");
    return publishCensusRun({ runKind, sourceManifest, prepared, results, schema });
  } catch (error) {
    await publishBlockedCensus(runKind, sourceManifest, error);
    throw error;
  }
}

async function main() {
  const runKind = process.argv.includes("--pilot") ? "task193-pilot" : "task193-bounded32";
  const built = await runReplayWideCensus(runKind);
  process.stdout.write(`${JSON.stringify({ runKind, gate: built.gate.technicalGateStatus, clusters: built.summary.eligibleClusterCount, feasibility: built.summary.feasibility.assessment })}\n`);
}
if (pathToFileURL(process.argv[1] ?? "").href === import.meta.url) main().catch(error => { process.stderr.write(`${error.stack ?? error}\n`); process.exitCode = 1; });
