#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { publishRunOutcome } from "./emit-death-event-directional-discrimination-evidence.mjs";
import { prepareSurfaceResolvedRun } from "./emit-death-event-surface-resolved-lifecycle-evidence.mjs";
import {
  parseReplayWideCensus,
  prepareCensusRun,
} from "./emit-replay-wide-hard-challenger-census.mjs";
import { validateJsonSchema } from "./lib/json-schema-validator.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = "output/local-replay-processing/functional-death-candidate-detector";
const TASK190 = "output/local-replay-processing/death-event-surface-resolved-lifecycle-evidence";
const TASK192 = "output/local-replay-processing/death-event-hard-challenger-lifecycle-specificity";
const TASK195 = "output/local-replay-processing/replay-wide-hard-challenger-census";
const RUN_KIND = "task196-bounded32";
const SCORE_THRESHOLD = 0.85;
const HORIZONS = [10, 20, 30, 60, 120, 180];
const PROTECTED = new Set(["replay_005", "replay_006", "replay_007", "replay_008"]);
let candidateSchema;

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.resolve(ROOT, relativePath), "utf8"));
}

async function writeJson(relativePath, value) {
  const target = path.resolve(ROOT, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(value, null, 2)}\n`);
}

async function loadCandidateSchema() {
  candidateSchema ??= await readJson("schemas/functional-death-candidate-detector.schema.json");
  return candidateSchema;
}

const round = (value, digits = 6) => Number(value.toFixed(digits));

export function assertAuthorizedReplayId(replayId, acceptedReplayIds) {
  if (PROTECTED.has(replayId)) throw new Error(`protected replay is forbidden: ${replayId}`);
  if (!acceptedReplayIds.includes(replayId)) throw new Error(`replay is outside accepted bounded membership: ${replayId}`);
}

export function observedHorizon(availableFollowUpSeconds) {
  return HORIZONS.filter((seconds) => availableFollowUpSeconds >= seconds).at(-1) ?? 0;
}

export function scoreStructuralCluster(cluster) {
  const contributions = [
    { signal: "immediate_persistence", weight: cluster.immediatePersistence ? 0.3 : 0 },
    ...cluster.familyNames.slice(0, 3).map((family) => ({ signal: `family:${family}`, weight: 0.1 })),
    ...cluster.surfaceNames.slice(0, 2).map((surface) => ({ signal: `surface:${surface}`, weight: 0.1 })),
    {
      signal: "observed_follow_up",
      weight: round(0.2 * Math.min(30, Math.max(0, cluster.availableFollowUpSeconds)) / 30),
    },
  ].filter((row) => row.weight > 0);
  const structuralScore = round(contributions.reduce((sum, row) => sum + row.weight, 0));
  return { structuralScore, contributions };
}

export function buildCandidate(cluster, ordinal) {
  const scored = scoreStructuralCluster(cluster);
  if (cluster.ambiguous || scored.structuralScore < SCORE_THRESHOLD) return null;
  return {
    candidateId: `${cluster.replayId}_candidate_${String(ordinal).padStart(4, "0")}`,
    replayId: cluster.replayId,
    timestampSeconds: cluster.actualTransitionSecond,
    structuralScore: scored.structuralScore,
    contributingSignals: scored.contributions,
    observedHorizonSeconds: observedHorizon(cluster.availableFollowUpSeconds),
    abstractSurfaceId: `${cluster.participantKey}:${cluster.surfaceNames.join("+")}`,
    evaluationOverlap: {
      knownStructuralAnchor: cluster.minimumAnchorDistanceSeconds === 0,
      hardChallengerPopulation: cluster.outsideAnchorWindows["5"] && cluster.availableFollowUpSeconds >= 30,
    },
    semanticStatus: "unconfirmed_structural_death_candidate",
    finalFact: false,
  };
}

export function buildCandidateArtifact(replayIds, censusResults, runKind = RUN_KIND) {
  const clusters = censusResults.flatMap((result) => result.clusters).sort((left, right) =>
    left.replayId.localeCompare(right.replayId)
      || left.actualTransitionSecond - right.actualTransitionSecond
      || left.clusterKey.localeCompare(right.clusterKey));
  const candidates = [];
  for (const cluster of clusters) {
    const candidate = buildCandidate(cluster, candidates.length + 1);
    if (candidate) candidates.push(candidate);
  }
  return {
    schemaVersion: 1,
    runKind,
    artifactClass: "functional_death_candidate_detector",
    generatedBy: "tools/emit-functional-death-candidate-detector.mjs",
    generatedAt: "task_196",
    detectorModel: "deterministic_structural_heuristic_v1",
    scoreThreshold: SCORE_THRESHOLD,
    replayIds,
    candidateCount: candidates.length,
    candidates,
    finalFactsProduced: false,
    attributionEmitted: false,
    limitations: [
      "Candidates are structural hypotheses, not confirmed deaths or confirmed non-deaths.",
      "Known-anchor and hard-challenger overlap are evaluation annotations and do not contribute to structural scores.",
    ],
  };
}

export function validateCandidateArtifact(artifact, schema) {
  const errors = validateJsonSchema(schema, artifact).errors.map((error) => `schema:${error}`);
  if (artifact.replayIds.some((replayId) => PROTECTED.has(replayId))) errors.push("protected-replay");
  if (artifact.candidateCount !== artifact.candidates.length) errors.push("candidate-denominator");
  if (new Set(artifact.candidates.map((row) => row.candidateId)).size !== artifact.candidateCount) errors.push("candidate-identity-reuse");
  for (const candidate of artifact.candidates) {
    const contributionTotal = round(candidate.contributingSignals.reduce((sum, row) => sum + row.weight, 0));
    if (contributionTotal !== candidate.structuralScore) errors.push(`score-ledger:${candidate.candidateId}`);
    if (candidate.structuralScore < artifact.scoreThreshold) errors.push(`score-threshold:${candidate.candidateId}`);
    if (candidate.finalFact || candidate.semanticStatus !== "unconfirmed_structural_death_candidate") errors.push(`truth-boundary:${candidate.candidateId}`);
  }
  if (artifact.finalFactsProduced || artifact.attributionEmitted) errors.push("artifact-truth-boundary");
  return errors;
}

function percentile(sorted, fraction) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * fraction))];
}

export function buildDetectorSummary({ artifact, censusResults, durationSeconds }) {
  const scores = artifact.candidates.map((candidate) => candidate.structuralScore).sort((a, b) => a - b);
  const perReplay = artifact.replayIds.map((replayId) => ({
    replayId,
    candidateCount: artifact.candidates.filter((candidate) => candidate.replayId === replayId).length,
  }));
  const processed = censusResults.filter((result) => result.parserCompleted).length;
  return {
    schemaVersion: 1,
    runKind: artifact.runKind,
    moduleStatus: "MVP_COMPLETE",
    detectorModel: artifact.detectorModel,
    scoreThreshold: artifact.scoreThreshold,
    replaysPlanned: artifact.replayIds.length,
    replaysProcessed: processed,
    replayFailures: artifact.replayIds.length - processed,
    replayCoveragePercent: round(100 * processed / artifact.replayIds.length, 3),
    candidatesEmitted: artifact.candidateCount,
    candidatesPerReplay: perReplay,
    scoreDistribution: {
      minimum: scores[0] ?? 0,
      maximum: scores.at(-1) ?? 0,
      mean: scores.length ? round(scores.reduce((sum, value) => sum + value, 0) / scores.length) : 0,
      p50: percentile(scores, 0.5),
      p90: percentile(scores, 0.9),
      thresholdToBelow090: scores.filter((value) => value < 0.9).length,
      from090ToBelow095: scores.filter((value) => value >= 0.9 && value < 0.95).length,
      from095To100: scores.filter((value) => value >= 0.95).length,
    },
    knownStructuralAnchorMatches: artifact.candidates.filter((candidate) => candidate.evaluationOverlap.knownStructuralAnchor).length,
    hardChallengerPopulationMatches: artifact.candidates.filter((candidate) => candidate.evaluationOverlap.hardChallengerPopulation).length,
    durationSeconds: round(durationSeconds, 3),
    candidateArtifactSha256: createHash("sha256").update(`${JSON.stringify(artifact, null, 2)}\n`).digest("hex"),
    finalFactsProduced: false,
    attributionEmitted: false,
  };
}

async function preparePlan() {
  const sourceManifest = await readJson(`${TASK190}/task190-bounded32/surface-resolved-lifecycle-bounded32-manifest.json`);
  const [coordination, task195Gate] = await Promise.all([
    readJson("data/project-coordination-state.json"),
    readJson(`${TASK195}/task195-gate.json`),
  ]);
  if (coordination.lastAcceptedTaskId !== "195" || coordination.lastAcceptedCommit !== "edf5dd86afae10b976d586e05c4b5016b7556700") {
    throw new Error("Task 195 accepted-base bridge failed before replay path resolution");
  }
  if (task195Gate.technicalGateStatus !== "replay_wide_hard_challenger_census_bounded32_complete" || task195Gate.protectedReplayAccessCount !== 0) {
    throw new Error("Task 195 census gate bridge failed before replay path resolution");
  }
  const prepared = await prepareCensusRun({
    sourceManifest,
    loadTask190Gate: () => readJson(`${TASK190}/task190-gate.json`),
    loadTask192Gate: () => readJson(`${TASK192}/task192-gate.json`),
    loadTask192Summary: () => readJson(`${TASK192}/task192-summary.json`),
    preparePlan: () => prepareSurfaceResolvedRun({
      manifest: sourceManifest,
      loadIntegrityGate: () => readJson(`${TASK190}/integrity/task189-lifecycle-integrity-gate.json`),
      loadPilotGate: () => readJson(`${TASK190}/task190-pilot/surface-resolved-lifecycle-pilot-gate.json`),
      onReplayPathResolution: (replayId) => assertAuthorizedReplayId(replayId, sourceManifest.replayIds),
    }),
  });
  return { sourceManifest, plan: prepared.plan };
}

export async function executeDetector({ replayId = null, publish = false, replayExecutor = parseReplayWideCensus } = {}) {
  const { sourceManifest, plan } = await preparePlan();
  if (replayId !== null) assertAuthorizedReplayId(replayId, sourceManifest.replayIds);
  const selectedPlan = replayId === null ? plan : plan.filter((input) => input.replayId === replayId);
  if (!selectedPlan.length) throw new Error("no authorized replay selected");
  const started = performance.now();
  const censusResults = [];
  for (const input of selectedPlan) censusResults.push(await replayExecutor(input));
  const replayIds = selectedPlan.map((input) => input.replayId);
  const runKind = replayId === null ? RUN_KIND : `task196-single-${replayId}`;
  const artifact = buildCandidateArtifact(replayIds, censusResults, runKind);
  const schema = await loadCandidateSchema();
  const errors = validateCandidateArtifact(artifact, schema);
  if (errors.length) throw new Error(`functional candidate artifact invalid: ${errors.join("; ")}`);
  const summary = buildDetectorSummary({ artifact, censusResults, durationSeconds: (performance.now() - started) / 1000 });
  const gate = {
    schemaVersion: 1,
    technicalGateStatus: "functional_death_candidate_detector_mvp_bounded32_ready",
    runKind,
    integrityStatus: "passed",
    measurementStatus: "completed",
    moduleStatus: "MVP_COMPLETE",
    replaysProcessed: summary.replaysProcessed,
    replaysExpected: replayIds.length,
    replayFailures: summary.replayFailures,
    candidatesEmitted: summary.candidatesEmitted,
    protectedReplayAccessCount: 0,
    finalFacts: 0,
    attribution: 0,
    atomicPublication: true,
  };
  if (publish) {
    const activeRoot = path.resolve(ROOT, `${OUTPUT}/${RUN_KIND}`);
    await publishRunOutcome({ activeRoot, blockedRoot: `${activeRoot}-blocked`, success: true, files: [
      { relativePath: "manifest.json", value: { schemaVersion: 1, runKind: RUN_KIND, replayIds, membershipExact: true } },
      { relativePath: "functional-death-candidates.json", value: artifact },
      { relativePath: "summary.json", value: summary },
      { relativePath: "gate.json", value: gate },
    ] });
    await writeJson(`${OUTPUT}/task196-summary.json`, summary);
    await writeJson(`${OUTPUT}/task196-gate.json`, gate);
  }
  return { artifact, summary, gate };
}

export async function runReproducibilityCheck(replayId) {
  const first = await executeDetector({ replayId });
  const second = await executeDetector({ replayId });
  const firstBytes = `${JSON.stringify(first.artifact, null, 2)}\n`;
  const secondBytes = `${JSON.stringify(second.artifact, null, 2)}\n`;
  const firstSha256 = createHash("sha256").update(firstBytes).digest("hex");
  const secondSha256 = createHash("sha256").update(secondBytes).digest("hex");
  const audit = {
    schemaVersion: 1,
    replayId,
    executions: 2,
    candidateCount: first.artifact.candidateCount,
    firstSha256,
    secondSha256,
    byteIdentical: firstBytes === secondBytes,
    protectedReplayAccessCount: 0,
  };
  if (!audit.byteIdentical) throw new Error("candidate output is not reproducible");
  await writeJson(`${OUTPUT}/task196-reproducibility-audit.json`, audit);
  return audit;
}

async function main() {
  const replayIndex = process.argv.indexOf("--replay");
  const reproIndex = process.argv.indexOf("--repro-check");
  if (reproIndex >= 0) {
    const audit = await runReproducibilityCheck(process.argv[reproIndex + 1]);
    process.stdout.write(`${JSON.stringify(audit)}\n`);
    return;
  }
  if (replayIndex >= 0) {
    const result = await executeDetector({ replayId: process.argv[replayIndex + 1] });
    process.stdout.write(`${JSON.stringify(result.artifact)}\n`);
    return;
  }
  const result = await executeDetector({ publish: true });
  process.stdout.write(`${JSON.stringify({ gate: result.gate.technicalGateStatus, replays: result.summary.replaysProcessed, candidates: result.summary.candidatesEmitted })}\n`);
}

if (pathToFileURL(process.argv[1] ?? "").href === import.meta.url) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error}\n`);
    process.exitCode = 1;
  });
}
