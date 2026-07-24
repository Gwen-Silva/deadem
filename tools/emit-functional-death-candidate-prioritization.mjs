#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { validateJsonSchema } from "./lib/json-schema-validator.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = "output/local-replay-processing/functional-death-candidate-detector";
const V1_ARTIFACT = `${OUTPUT}/task196-bounded32/functional-death-candidates.json`;
const V1_SUMMARY = `${OUTPUT}/task196-summary.json`;
const CENSUS_LEDGER = "output/local-replay-processing/replay-wide-hard-challenger-census/task193-bounded32/structural-cluster-ledger.json";
const RUN_KIND = "task197-bounded32";
const PROTECTED = new Set(["replay_005", "replay_006", "replay_007", "replay_008"]);

export const RESERVED_VALIDATION_REPLAYS = Object.freeze([
  "replay_004", "replay_012", "replay_016", "replay_020",
  "replay_024", "replay_028", "replay_032", "replay_036",
]);

// Frozen from the 24-replay development split before reserved-validation execution.
export const FROZEN_V2_CONFIG = Object.freeze({
  configurationId: "task197-development-frozen-v2",
  weights: Object.freeze({
    family_diversity: 0.2,
    surface_support: 0.25,
    observed_horizon: 0.25,
    same_surface_recurrence: 0.2,
    temporal_density: 0.1,
  }),
  normalization: Object.freeze({
    maximumFamilies: 3,
    maximumSurfaces: 2,
    maximumHorizonSeconds: 180,
    maximumRecurrence: 10,
    maximumNearestGapSeconds: 1800,
  }),
  selectionThreshold: 0.65,
  priorityThresholds: Object.freeze({ high: 0.9, medium: 0.78, low: 0.65 }),
  scoreInputs: Object.freeze([
    "family_count", "surface_count", "observed_horizon_seconds",
    "same_surface_recurrence", "nearest_same_surface_gap_seconds",
  ]),
});

export const BASELINE_V1 = Object.freeze({
  clusters: 2815,
  candidates: 2664,
  anchorPopulation: 2552,
  anchorMatches: 2434,
  hardChallengerPopulation: 91,
  hardChallengerMatches: 85,
  scoreP50: 1,
  scoreP90: 1,
});

const round = (value, digits = 6) => Number(value.toFixed(digits));
const rate = (numerator, denominator) => denominator ? round(100 * numerator / denominator, 3) : 0;
const bytes = (value) => `${JSON.stringify(value, null, 2)}\n`;
const sha256 = (value) => createHash("sha256").update(typeof value === "string" ? value : bytes(value)).digest("hex");

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.resolve(ROOT, relativePath), "utf8"));
}

async function writeJson(relativePath, value) {
  const target = path.resolve(ROOT, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, bytes(value));
}

function percentile(sorted, fraction) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * fraction))];
}

function clusterKeyForCandidate(candidate) {
  const participantKey = candidate.abstractSurfaceId.split(":", 1)[0];
  return `${candidate.replayId}:${participantKey}:forward_transition:${candidate.timestampSeconds}`;
}

export function buildSplit(replayIds) {
  if (replayIds.some((replayId) => PROTECTED.has(replayId))) throw new Error("protected replay in V1 membership");
  const validationSet = new Set(RESERVED_VALIDATION_REPLAYS);
  const validation = replayIds.filter((replayId) => validationSet.has(replayId));
  const development = replayIds.filter((replayId) => !validationSet.has(replayId));
  if (validation.length !== 8 || development.length !== 24) throw new Error("development/validation split is not exact");
  return { development, validation };
}

export function scorePriorityV2(features, config = FROZEN_V2_CONFIG) {
  const { weights, normalization } = config;
  const normalized = {
    family_diversity: Math.min(features.familyCount, normalization.maximumFamilies) / normalization.maximumFamilies,
    surface_support: Math.min(features.surfaceCount, normalization.maximumSurfaces) / normalization.maximumSurfaces,
    observed_horizon: Math.min(features.observedHorizonSeconds, normalization.maximumHorizonSeconds) / normalization.maximumHorizonSeconds,
    same_surface_recurrence: Math.min(features.sameSurfaceRecurrence, normalization.maximumRecurrence) / normalization.maximumRecurrence,
    temporal_density: 1 - Math.min(features.nearestSameSurfaceGapSeconds, normalization.maximumNearestGapSeconds) / normalization.maximumNearestGapSeconds,
  };
  const featureContributions = Object.keys(weights).map((signal) => ({
    signal,
    normalizedValue: round(normalized[signal]),
    weight: weights[signal],
    contribution: round(weights[signal] * normalized[signal]),
  }));
  return {
    priorityScore: round(featureContributions.reduce((sum, row) => sum + row.contribution, 0)),
    featureContributions,
  };
}

export function priorityLevel(score, config = FROZEN_V2_CONFIG) {
  if (score >= config.priorityThresholds.high) return "high";
  if (score >= config.priorityThresholds.medium) return "medium";
  return "low";
}

export function buildPrioritizationArtifact(v1Artifact, ledger, config = FROZEN_V2_CONFIG) {
  const clusterByKey = new Map(ledger.rows.map((cluster) => [cluster.clusterKey, cluster]));
  const groups = new Map();
  for (const candidate of v1Artifact.candidates) {
    const key = `${candidate.replayId}\0${candidate.abstractSurfaceId}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(candidate);
  }
  for (const group of groups.values()) group.sort((a, b) => a.timestampSeconds - b.timestampSeconds || a.candidateId.localeCompare(b.candidateId));

  const selected = [];
  for (const candidate of v1Artifact.candidates) {
    const cluster = clusterByKey.get(clusterKeyForCandidate(candidate));
    if (!cluster) throw new Error(`missing census cluster for ${candidate.candidateId}`);
    const group = groups.get(`${candidate.replayId}\0${candidate.abstractSurfaceId}`);
    const index = group.findIndex((row) => row.candidateId === candidate.candidateId);
    const gaps = [];
    if (index > 0) gaps.push(candidate.timestampSeconds - group[index - 1].timestampSeconds);
    if (index + 1 < group.length) gaps.push(group[index + 1].timestampSeconds - candidate.timestampSeconds);
    const features = {
      familyCount: cluster.familyCount,
      surfaceCount: cluster.surfaceOpportunityCount,
      observedHorizonSeconds: candidate.observedHorizonSeconds,
      sameSurfaceRecurrence: group.length,
      nearestSameSurfaceGapSeconds: gaps.length ? Math.min(...gaps) : config.normalization.maximumNearestGapSeconds,
    };
    const scored = scorePriorityV2(features, config);
    if (scored.priorityScore < config.selectionThreshold) continue;
    selected.push({
      candidateId: candidate.candidateId,
      replayId: candidate.replayId,
      timestampSeconds: candidate.timestampSeconds,
      priorityScore: scored.priorityScore,
      priorityLevel: priorityLevel(scored.priorityScore, config),
      rankInReplay: 0,
      featureContributions: scored.featureContributions,
      observedHorizonSeconds: candidate.observedHorizonSeconds,
      abstractSurfaceId: candidate.abstractSurfaceId,
      evaluationLabels: {
        knownStructuralAnchor: candidate.evaluationOverlap.knownStructuralAnchor,
        hardChallengerPopulation: candidate.evaluationOverlap.hardChallengerPopulation,
      },
      semanticStatus: "unconfirmed_structural_death_candidate_priority",
      finalFact: false,
    });
  }
  selected.sort((a, b) => a.replayId.localeCompare(b.replayId)
    || b.priorityScore - a.priorityScore
    || a.timestampSeconds - b.timestampSeconds
    || a.candidateId.localeCompare(b.candidateId));
  const rankByReplay = new Map();
  for (const candidate of selected) {
    const rank = (rankByReplay.get(candidate.replayId) ?? 0) + 1;
    rankByReplay.set(candidate.replayId, rank);
    candidate.rankInReplay = rank;
  }
  return {
    schemaVersion: 1,
    runKind: RUN_KIND,
    artifactClass: "functional_death_candidate_prioritization",
    generatedBy: "tools/emit-functional-death-candidate-prioritization.mjs",
    generatedAt: "task_197",
    prioritizationModel: "deterministic_structural_priority_v2",
    configurationId: config.configurationId,
    scoreInputs: [...config.scoreInputs],
    selectionThreshold: config.selectionThreshold,
    priorityThresholds: { ...config.priorityThresholds },
    replayIds: [...v1Artifact.replayIds],
    v1CandidateCount: v1Artifact.candidateCount,
    candidateCount: selected.length,
    candidates: selected,
    finalFactsProduced: false,
    attributionEmitted: false,
    limitations: [
      "Priorities rank structural hypotheses; they do not confirm deaths or non-deaths.",
      "Evaluation labels are attached after scoring and never enter the V2 score.",
    ],
  };
}

export function validatePrioritizationArtifact(artifact, schema) {
  const errors = validateJsonSchema(schema, artifact).errors.map((error) => `schema:${error}`);
  if (artifact.replayIds.some((replayId) => PROTECTED.has(replayId))) errors.push("protected-replay");
  if (artifact.candidateCount !== artifact.candidates.length) errors.push("candidate-denominator");
  if (new Set(artifact.candidates.map((row) => row.candidateId)).size !== artifact.candidateCount) errors.push("candidate-identity-reuse");
  if (artifact.scoreInputs.some((name) => /anchor|challenger|label|overlap/iu.test(name))) errors.push("evaluation-label-score-input");
  const expectedRanks = new Map();
  for (const candidate of artifact.candidates) {
    const total = round(candidate.featureContributions.reduce((sum, row) => sum + row.contribution, 0));
    if (total !== candidate.priorityScore) errors.push(`score-ledger:${candidate.candidateId}`);
    if (candidate.featureContributions.some((row) => /anchor|challenger|label|overlap/iu.test(row.signal))) errors.push(`evaluation-label-contribution:${candidate.candidateId}`);
    if (candidate.priorityScore < artifact.selectionThreshold) errors.push(`score-threshold:${candidate.candidateId}`);
    const rank = (expectedRanks.get(candidate.replayId) ?? 0) + 1;
    expectedRanks.set(candidate.replayId, rank);
    if (candidate.rankInReplay !== rank) errors.push(`rank:${candidate.candidateId}`);
    if (candidate.priorityLevel !== priorityLevel(candidate.priorityScore, { ...FROZEN_V2_CONFIG, priorityThresholds: artifact.priorityThresholds })) errors.push(`priority:${candidate.candidateId}`);
    if (candidate.finalFact || candidate.semanticStatus !== "unconfirmed_structural_death_candidate_priority") errors.push(`truth-boundary:${candidate.candidateId}`);
  }
  if (artifact.finalFactsProduced || artifact.attributionEmitted) errors.push("artifact-truth-boundary");
  return errors;
}

export function buildSplitMetrics({ replayIds, artifact, v1Artifact, ledger }) {
  const replaySet = new Set(replayIds);
  const clusters = ledger.rows.filter((row) => replaySet.has(row.replayId));
  const candidates = artifact.candidates.filter((row) => replaySet.has(row.replayId));
  const v1Candidates = v1Artifact.candidates.filter((row) => replaySet.has(row.replayId));
  const anchors = clusters.filter((row) => row.minimumAnchorDistanceSeconds === 0);
  const hard = clusters.filter((row) => row.outsideAnchorWindows["5"] && row.availableFollowUpSeconds >= 30);
  const anchorMatches = candidates.filter((row) => row.evaluationLabels.knownStructuralAnchor).length;
  const hardMatches = candidates.filter((row) => row.evaluationLabels.hardChallengerPopulation).length;
  const scores = candidates.map((row) => row.priorityScore).sort((a, b) => a - b);
  const anchorCapturePercent = rate(anchorMatches, anchors.length);
  const hardChallengerCapturePercent = rate(hardMatches, hard.length);
  return {
    replayCount: replayIds.length,
    replayIds,
    clusterCount: clusters.length,
    v1CandidateCount: v1Candidates.length,
    v2CandidateCount: candidates.length,
    candidateReduction: v1Candidates.length - candidates.length,
    anchorPopulation: anchors.length,
    anchorMatches,
    anchorCapturePercent,
    hardChallengerPopulation: hard.length,
    hardChallengerMatches: hardMatches,
    hardChallengerCapturePercent,
    captureDifferencePercentagePoints: round(anchorCapturePercent - hardChallengerCapturePercent, 3),
    priorityDistribution: {
      high: candidates.filter((row) => row.priorityLevel === "high").length,
      medium: candidates.filter((row) => row.priorityLevel === "medium").length,
      low: candidates.filter((row) => row.priorityLevel === "low").length,
    },
    scoreDistribution: {
      minimum: scores[0] ?? 0,
      maximum: scores.at(-1) ?? 0,
      mean: scores.length ? round(scores.reduce((sum, value) => sum + value, 0) / scores.length) : 0,
      p50: percentile(scores, 0.5),
      p90: percentile(scores, 0.9),
    },
  };
}

export function evaluateValidationGate(metrics, representedReplayCount) {
  const criteria = {
    anchorCaptureAtLeast90Percent: metrics.anchorCapturePercent >= 90,
    hardChallengerAtLeast10PointsBelowAnchors: metrics.captureDifferencePercentagePoints >= 10,
    fewerCandidatesThanV1: metrics.v2CandidateCount < metrics.v1CandidateCount,
    scorePercentilesNotBothSaturated: !(metrics.scoreDistribution.p50 === 1 && metrics.scoreDistribution.p90 === 1),
    allPriorityLevelsPopulated: Object.values(metrics.priorityDistribution).every((count) => count > 0),
    all32ReplaysRepresented: representedReplayCount === 32,
  };
  return {
    criteria,
    passed: Object.values(criteria).every(Boolean),
  };
}

function assertBaseline(v1Artifact, v1Summary, ledger) {
  const actual = {
    clusters: ledger.rows.length,
    candidates: v1Artifact.candidateCount,
    anchorPopulation: ledger.rows.filter((row) => row.minimumAnchorDistanceSeconds === 0).length,
    anchorMatches: v1Summary.knownStructuralAnchorMatches,
    hardChallengerPopulation: ledger.rows.filter((row) => row.outsideAnchorWindows["5"] && row.availableFollowUpSeconds >= 30).length,
    hardChallengerMatches: v1Summary.hardChallengerPopulationMatches,
    scoreP50: v1Summary.scoreDistribution.p50,
    scoreP90: v1Summary.scoreDistribution.p90,
  };
  if (JSON.stringify(actual) !== JSON.stringify(BASELINE_V1)) throw new Error(`V1 baseline mismatch: ${JSON.stringify(actual)}`);
}

export async function executePrioritization({ publish = false } = {}) {
  const [coordination, v1Artifact, v1Summary, ledger, schema] = await Promise.all([
    readJson("data/project-coordination-state.json"), readJson(V1_ARTIFACT), readJson(V1_SUMMARY), readJson(CENSUS_LEDGER),
    readJson("schemas/functional-death-candidate-prioritization.schema.json"),
  ]);
  if (coordination.lastAcceptedTaskId !== "196" || coordination.lastAcceptedCommit !== "bf42beee0b22bd921c245ce1b6485a1b617543a8") {
    throw new Error("Task 196 accepted-base bridge failed");
  }
  assertBaseline(v1Artifact, v1Summary, ledger);
  const split = buildSplit(v1Artifact.replayIds);
  const artifact = buildPrioritizationArtifact(v1Artifact, ledger);
  const validationErrors = validatePrioritizationArtifact(artifact, schema);
  if (validationErrors.length) throw new Error(`prioritization artifact invalid: ${validationErrors.join("; ")}`);
  const developmentMetrics = buildSplitMetrics({ replayIds: split.development, artifact, v1Artifact, ledger });
  const validationMetrics = buildSplitMetrics({ replayIds: split.validation, artifact, v1Artifact, ledger });
  const evaluation = evaluateValidationGate(validationMetrics, artifact.replayIds.length);
  const replay010 = { ...artifact, replayIds: ["replay_010"], candidates: artifact.candidates.filter((row) => row.replayId === "replay_010") };
  replay010.candidateCount = replay010.candidates.length;
  replay010.v1CandidateCount = v1Artifact.candidates.filter((row) => row.replayId === "replay_010").length;
  const firstBytes = bytes(replay010);
  const secondArtifact = buildPrioritizationArtifact(v1Artifact, ledger);
  const secondReplay010 = { ...secondArtifact, replayIds: ["replay_010"], candidates: secondArtifact.candidates.filter((row) => row.replayId === "replay_010") };
  secondReplay010.candidateCount = secondReplay010.candidates.length;
  secondReplay010.v1CandidateCount = replay010.v1CandidateCount;
  const secondBytes = bytes(secondReplay010);
  const reproducibility = {
    schemaVersion: 1, replayId: "replay_010", executions: 2,
    candidateCount: replay010.candidateCount, firstSha256: sha256(firstBytes), secondSha256: sha256(secondBytes),
    byteIdentical: firstBytes === secondBytes, protectedReplayAccessCount: 0,
  };
  if (!reproducibility.byteIdentical) throw new Error("replay_010 prioritization is not reproducible");
  const technicalGateStatus = evaluation.passed
    ? "death_candidate_selectivity_and_ranking_v2_ready"
    : "structural_features_insufficient_for_candidate_selectivity";
  const fullMetrics = buildSplitMetrics({ replayIds: artifact.replayIds, artifact, v1Artifact, ledger });
  const summary = {
    schemaVersion: 1, runKind: RUN_KIND, module: "Death-Candidate Selectivity And Ranking",
    moduleStatus: evaluation.passed ? "SELECTIVITY_READY" : "STRUCTURAL_FEATURES_INSUFFICIENT",
    technicalGateStatus, thresholdsFrozenBeforeReservedValidation: true,
    baselineV1: BASELINE_V1, development: developmentMetrics, validation: validationMetrics, overall: fullMetrics,
    replaysPlanned: 32, replaysProcessed: 32, replayFailures: 0,
    deterministicReplay010: reproducibility.byteIdentical, prioritizedArtifactSha256: sha256(artifact),
    protectedReplayAccessCount: 0, finalFacts: 0, attribution: 0,
  };
  const gate = {
    schemaVersion: 1, runKind: RUN_KIND, technicalGateStatus,
    status: evaluation.passed ? "passed" : "conclusive_negative", criteria: evaluation.criteria,
    thresholdsFrozenBeforeReservedValidation: true, deterministicReplay010: reproducibility.byteIdentical,
    replaysProcessed: 32, replaysExpected: 32, replayFailures: 0,
    candidatesBefore: BASELINE_V1.candidates, candidatesAfter: artifact.candidateCount,
    protectedReplayAccessCount: 0, finalFacts: 0, attribution: 0,
  };
  const frozenConfig = {
    schemaVersion: 1, frozenBeforeReservedValidation: true,
    selectionBasis: "development_split_only", developmentReplayIds: split.development,
    reservedValidationReplayIds: split.validation, configuration: FROZEN_V2_CONFIG,
    developmentMetricsAtFreeze: developmentMetrics, configurationSha256: sha256(FROZEN_V2_CONFIG),
  };
  if (publish) {
    const root = `${OUTPUT}/${RUN_KIND}`;
    await Promise.all([
      writeJson(`${root}/manifest.json`, { schemaVersion: 1, runKind: RUN_KIND, replayIds: artifact.replayIds, developmentReplayIds: split.development, reservedValidationReplayIds: split.validation, membershipExact: true }),
      writeJson(`${root}/frozen-development-config.json`, frozenConfig),
      writeJson(`${root}/prioritized-candidates.json`, artifact),
      writeJson(`${root}/development-metrics.json`, developmentMetrics),
      writeJson(`${root}/validation-metrics.json`, validationMetrics),
      writeJson(`${root}/reproducibility-audit.json`, reproducibility),
      writeJson(`${root}/summary.json`, summary),
      writeJson(`${root}/gate.json`, gate),
      writeJson(`${OUTPUT}/task197-summary.json`, summary),
      writeJson(`${OUTPUT}/task197-gate.json`, gate),
    ]);
  }
  return { artifact, frozenConfig, developmentMetrics, validationMetrics, reproducibility, summary, gate };
}

async function main() {
  const result = await executePrioritization({ publish: true });
  process.stdout.write(`${JSON.stringify({ gate: result.gate.technicalGateStatus, candidates: result.artifact.candidateCount, validation: result.validationMetrics })}\n`);
}

if (pathToFileURL(process.argv[1] ?? "").href === import.meta.url) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error}\n`);
    process.exitCode = 1;
  });
}
