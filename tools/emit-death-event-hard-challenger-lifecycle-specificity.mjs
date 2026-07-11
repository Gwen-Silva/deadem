#!/usr/bin/env node
import { readFile, mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { validateJsonSchema } from "./lib/json-schema-validator.mjs";
import { publishRunOutcome } from "./emit-death-event-directional-discrimination-evidence.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = "output/local-replay-processing/death-event-surface-resolved-lifecycle-evidence";
const OUTPUT = "output/local-replay-processing/death-event-hard-challenger-lifecycle-specificity";
const HORIZONS = [10, 20, 30, 60, 120, 180];
const PROTECTED = new Set(["replay_005", "replay_006", "replay_007", "replay_008"]);
const SURFACE_OPPORTUNITY_BY_STATUS = Object.freeze({
  surface_unavailable: 0,
  controller_only: 1,
  linked_pawn_only: 1,
  controller_link_relation: 1,
  controller_and_pawn_agree: 2,
  controller_pawn_conflict: 2,
});
let schemaCache = null;

async function readJson(relative) { return JSON.parse(await readFile(path.resolve(ROOT, relative), "utf8")); }
async function writeJson(relative, value) { const target = path.resolve(ROOT, relative); await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, `${JSON.stringify(value, null, 2)}\n`); }
async function loadSchema() { schemaCache ??= await readJson("schemas/death-event-hard-challenger-lifecycle-specificity.schema.json"); return schemaCache; }
const rate = (count, total) => total ? Number((count / total).toFixed(6)) : 0;
const difference = (left, right) => Number((left - right).toFixed(6));
const timeStratum = second => Math.floor(second / 300);

export function surfaceOpportunityForStatuses(statuses) {
  if (!Array.isArray(statuses) || !statuses.length) throw new Error("surface statuses must be a non-empty array");
  return Math.max(...statuses.map(status => {
    if (!Object.hasOwn(SURFACE_OPPORTUNITY_BY_STATUS, status)) throw new Error(`unknown surface status: ${status}`);
    return SURFACE_OPPORTUNITY_BY_STATUS[status];
  }));
}

function familyForwardRows(row) {
  return Object.entries(row.controlFamilies).filter(([, family]) => family.forwardObserved && family.forwardPersistenceObserved && family.forwardDeltaSeconds !== null);
}

export function deriveStructuralChallengers(artifact, exclusionWindowSeconds = 5) {
  const anchors = new Map();
  for (const row of artifact.evidenceRows) {
    if (!anchors.has(row.participantKey)) anchors.set(row.participantKey, []);
    anchors.get(row.participantKey).push(row.anchorNormalizedElapsedSecond);
  }
  const groups = new Map();
  for (const row of artifact.evidenceRows) {
    const families = familyForwardRows(row);
    if (!families.length) continue;
    for (const [familyName, family] of families) {
      const actualTransitionSecond = row.matchedControlNormalizedElapsedSecond + family.forwardDeltaSeconds;
      const clusterKey = `${artifact.replayId}:${row.participantKey}:forward_transition:${actualTransitionSecond}`;
      if (!groups.has(clusterKey)) groups.set(clusterKey, []);
      groups.get(clusterKey).push({ row, familyName, family, actualTransitionSecond });
    }
  }
  const candidates = [];
  let excluded = 0;
  for (const [clusterKey, sources] of [...groups.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const row = sources[0].row;
    const second = sources[0].actualTransitionSecond;
    const outside = (anchors.get(row.participantKey) ?? []).every(anchor => Math.abs(anchor - second) > exclusionWindowSeconds);
    if (!outside) { excluded += 1; continue; }
    const sourceRows = [...new Map(sources.map(source => [source.row.eventCandidateKey, source.row])).values()];
    const sourceSurfaceCounts = sourceRows.map(sourceRow => Math.min(...sources
      .filter(source => source.row.eventCandidateKey === sourceRow.eventCandidateKey)
      .map(source => surfaceOpportunityForStatuses(Object.values(source.family.stageSurfaceStatus)))));
    const horizonSpecificEvidence = HORIZONS.map(horizonSeconds => {
      const rows = sourceRows.map(sourceRow => sourceRow.horizonSpecificEvidence.find(item => item.horizonSeconds === horizonSeconds));
      return { horizonSeconds, eligible: rows.every(item => item?.eligible === true), anchorCoherentLifecycle: rows.every(item => item?.anchorCoherentLifecycle === true), controlCoherentLifecycle: rows.every(item => item?.controlCoherentLifecycle === true), anchorAssignmentCount: Math.min(...rows.map(item => item?.anchorAssignmentCount ?? 0)), controlAssignmentCount: Math.min(...rows.map(item => item?.controlAssignmentCount ?? 0)), sourceReuseCount: Math.max(...rows.map(item => item?.sourceReuseCount ?? 0)) };
    });
    const familyNames = new Set(sources.map(source => source.familyName));
    const truncationCauses = new Set(sourceRows.map(sourceRow => sourceRow.controlFollowUpCause));
    candidates.push({
      key: `${artifact.replayId}_challenger_cluster_${String(candidates.length + 1).padStart(6, "0")}`,
      clusterKey,
      replayId: artifact.replayId,
      participantKey: row.participantKey,
      sourceEventKeys: sourceRows.map(sourceRow => sourceRow.eventCandidateKey).sort(),
      sourceControlReferences: sourceRows.map(sourceRow => ({ eventCandidateKey: sourceRow.eventCandidateKey, controlReferenceSecond: sourceRow.matchedControlNormalizedElapsedSecond })).sort((left, right) => left.eventCandidateKey.localeCompare(right.eventCandidateKey)),
      second,
      stratum: timeStratum(second),
      availableFollowUp: Math.min(...sourceRows.map(sourceRow => sourceRow.pairedCommonFollowUpSeconds)),
      horizonSpecificEvidence,
      familyCount: familyNames.size,
      surfaceOpportunityCount: Math.min(...sourceSurfaceCounts),
      ambiguous: sourceRows.some(sourceRow => sourceRow.ambiguousAssociation),
      truncationCause: truncationCauses.size === 1 ? [...truncationCauses][0] : "mixed_causes",
    });
  }
  const uniqueSourceRows = rows => new Set(rows.map(source => source.row.eventCandidateKey)).size;
  return { candidates, excluded, inspected: artifact.evidenceRows.length, sourceRowCount: [...groups.values()].reduce((sum, rows) => sum + uniqueSourceRows(rows), 0), deduplicatedSourceRowCount: [...groups.values()].reduce((sum, rows) => sum + uniqueSourceRows(rows) - 1, 0) };
}

export function baselineHorizonState(row, horizonSeconds, side) {
  const evidence = row.horizonSpecificEvidence?.find(item => item.horizonSeconds === horizonSeconds);
  return {
    eligible: evidence?.eligible === true,
    coherentLifecycle: evidence?.[`${side}CoherentLifecycle`] === true,
    assignmentCount: evidence?.[`${side}AssignmentCount`] ?? 0,
    sourceReuseCount: evidence?.sourceReuseCount ?? 0,
  };
}

function reuseCount(values) {
  return values.length - new Set(values).size;
}

export function validateMatchingLedger(ledger, replayId, horizonSeconds) {
  const errors = [];
  if (reuseCount(ledger.map(row => row.assignmentKey))) errors.push("duplicate-assignment-key");
  if (reuseCount(ledger.map(row => row.anchorKey))) errors.push("anchor-reuse");
  if (reuseCount(ledger.map(row => row.challengerKey))) errors.push("challenger-reuse");
  if (reuseCount(ledger.map(row => row.sourceTransitionKey))) errors.push("source-reuse");
  for (const row of ledger) {
    if (!row.assignmentKey.startsWith(`${replayId}_h${horizonSeconds}_`)) errors.push("assignment-key-scope");
    if (row.replayId !== replayId || row.horizonSeconds !== horizonSeconds) errors.push("ledger-scope");
    if (row.anchorParticipantKey !== row.challengerParticipantKey) errors.push("participant-match");
    if (row.anchorFollowUpSeconds < horizonSeconds || row.challengerFollowUpSeconds < horizonSeconds || row.commonFollowUpSeconds < horizonSeconds) errors.push("follow-up-match");
    if (row.commonFollowUpSeconds !== Math.min(row.anchorFollowUpSeconds, row.challengerFollowUpSeconds)) errors.push("common-follow-up");
    if (row.stratumDistance !== Math.abs(row.anchorStratum - row.challengerStratum)) errors.push("stratum-covariate");
    if (row.surfaceOpportunityDistance !== Math.abs(row.anchorSurfaceOpportunityCount - row.challengerSurfaceOpportunityCount)) errors.push("surface-covariate");
  }
  return errors;
}

export function matchHorizon(artifact, challengers, horizonSeconds) {
  const anchors = artifact.evidenceRows.filter(row => baselineHorizonState(row, horizonSeconds, "anchor").eligible).map(row => ({
    key: row.eventCandidateKey, participantKey: row.participantKey, second: row.anchorNormalizedElapsedSecond,
    stratum: timeStratum(row.anchorNormalizedElapsedSecond), coherentLifecycle: baselineHorizonState(row, horizonSeconds, "anchor").coherentLifecycle,
    availableFollowUp: row.pairedCommonFollowUpSeconds,
    surfaceOpportunityCount: row.actualCrossSurfaceSupport ? 2 : row.surfaceSupportClass === "surface_unresolved" ? 0 : 1,
  })).sort((a, b) => a.participantKey.localeCompare(b.participantKey) || a.second - b.second || a.key.localeCompare(b.key));
  const eligible = challengers.filter(row => row.availableFollowUp >= horizonSeconds && baselineHorizonState(row, horizonSeconds, "control").eligible).map(row => ({ ...row, coherentLifecycle: baselineHorizonState(row, horizonSeconds, "control").coherentLifecycle }));
  const usedAnchors = new Set(); const usedChallengers = new Set(); const usedSources = new Set(); const pairs = [];
  for (const anchor of anchors) {
    const choices = eligible.filter(challenger => challenger.participantKey === anchor.participantKey && !challenger.sourceEventKeys.includes(anchor.key) && !usedChallengers.has(challenger.key) && !usedSources.has(challenger.clusterKey))
      .sort((a, b) => Number(a.stratum !== anchor.stratum) - Number(b.stratum !== anchor.stratum) || Math.abs(a.surfaceOpportunityCount - anchor.surfaceOpportunityCount) - Math.abs(b.surfaceOpportunityCount - anchor.surfaceOpportunityCount) || Math.abs(a.second - anchor.second) - Math.abs(b.second - anchor.second) || a.key.localeCompare(b.key));
    const challenger = choices[0];
    if (!challenger) continue;
    usedAnchors.add(anchor.key); usedChallengers.add(challenger.key); usedSources.add(challenger.clusterKey);
    pairs.push({ anchor, challenger });
  }
  const anchorCoherent = pairs.filter(pair => pair.anchor.coherentLifecycle).length;
  const challengerCoherent = pairs.filter(pair => pair.challenger.coherentLifecycle).length;
  const anchorRate = rate(anchorCoherent, pairs.length); const challengerRate = rate(challengerCoherent, pairs.length);
  const ledger = pairs.map((pair, index) => ({
    assignmentKey: `${artifact.replayId}_h${horizonSeconds}_${String(index + 1).padStart(6, "0")}`,
    replayId: artifact.replayId, horizonSeconds, anchorKey: pair.anchor.key, challengerKey: pair.challenger.key,
    sourceTransitionKey: pair.challenger.clusterKey, sourceEventKeys: pair.challenger.sourceEventKeys, sourceControlReferences: pair.challenger.sourceControlReferences, actualTransitionSecond: pair.challenger.second, anchorParticipantKey: pair.anchor.participantKey,
    challengerParticipantKey: pair.challenger.participantKey, anchorStratum: pair.anchor.stratum,
    challengerStratum: pair.challenger.stratum, stratumDistance: Math.abs(pair.anchor.stratum - pair.challenger.stratum),
    anchorFollowUpSeconds: pair.anchor.availableFollowUp, challengerFollowUpSeconds: pair.challenger.availableFollowUp,
    commonFollowUpSeconds: Math.min(pair.anchor.availableFollowUp, pair.challenger.availableFollowUp),
    anchorSurfaceOpportunityCount: pair.anchor.surfaceOpportunityCount,
    challengerSurfaceOpportunityCount: pair.challenger.surfaceOpportunityCount,
    surfaceOpportunityDistance: Math.abs(pair.anchor.surfaceOpportunityCount - pair.challenger.surfaceOpportunityCount),
    anchorCoherentLifecycle: pair.anchor.coherentLifecycle, challengerCoherentLifecycle: pair.challenger.coherentLifecycle,
  }));
  const ledgerErrors = validateMatchingLedger(ledger, artifact.replayId, horizonSeconds);
  if (ledgerErrors.length) throw new Error(`matching ledger invalid: ${ledgerErrors.join("; ")}`);
  const sourceReuseCount = reuseCount(ledger.map(row => row.sourceTransitionKey));
  return {
    result: { horizonSeconds, eligibleAnchorCount: anchors.length, eligibleChallengerCount: eligible.length, matchedPairCount: pairs.length, anchorLifecycleRate: anchorRate, challengerLifecycleRate: challengerRate, pairedDifference: difference(anchorRate, challengerRate), anchorAssignmentCount: usedAnchors.size, challengerAssignmentCount: usedChallengers.size, sourceReuseCount },
    ledger,
  };
}

function assessment(horizons) {
  const primary = horizons.find(row => row.horizonSeconds === 30);
  if (primary.matchedPairCount >= 30 && primary.pairedDifference >= 0.5 && primary.challengerLifecycleRate <= 0.2) return "strong";
  if (primary.matchedPairCount >= 5 && primary.pairedDifference >= 0.25 && primary.challengerLifecycleRate <= 0.4) return "partial";
  return "insufficient";
}
function readiness() { return { hardChallengerSpecificityEvidenceAvailable: true, readyForFinalDeathFacts: false, readyForConfirmedWhoDied: false, readyForAttribution: false, readyForKillerVictim: false, readyForTeamfight: false, readyForGameplayInterpretation: false }; }

export function validateTask190Bridge(gate, manifest) {
  const errors = [];
  if (gate.technicalGateStatus !== "passed" || gate.integrityStatus !== "passed" || gate.measurementStatus !== "completed") errors.push("task190-gate");
  if (gate.manifestIdentity !== manifest.manifestIdentity || JSON.stringify(gate.replayIds) !== JSON.stringify(manifest.replayIds)) errors.push("manifest-membership");
  if (gate.parserCompleted !== manifest.replayIds.length || gate.parserExpected !== manifest.replayIds.length) errors.push("parser-count");
  for (const field of ["artifactInvariantFailures", "horizonSourceReuseCount", "participantMappingFailures", "provenanceFailures", "bridgeFailures", "schemaFailures", "outputPolicyFailures", "protectedReplayAccessCount", "finalFacts", "attribution"]) if (gate[field] !== 0) errors.push(`task190-${field}`);
  if (gate.independentlyRematchedHorizonCount !== 6 || !gate.surfaceProvenanceEmitted || !gate.allOrNothingGatePassed) errors.push("task190-required-surfaces");
  return errors;
}

export function validateHardChallengerSummary(summary, schema) {
  const errors = validateJsonSchema(schema, summary).errors.map(error => `schema:${error}`);
  if (summary.replayCount !== summary.replayIds.length) errors.push("replay-count");
  if (summary.replayIds.some(replayId => PROTECTED.has(replayId))) errors.push("protected-replay");
  if (summary.horizonResults.map(row => row.horizonSeconds).join(",") !== HORIZONS.join(",")) errors.push("horizon-order");
  for (const row of summary.horizonResults) {
    if (row.anchorAssignmentCount !== row.matchedPairCount || row.challengerAssignmentCount !== row.matchedPairCount) errors.push(`assignment-count:${row.horizonSeconds}`);
    if (row.sourceReuseCount !== 0) errors.push(`source-reuse:${row.horizonSeconds}`);
    if (row.pairedDifference !== difference(row.anchorLifecycleRate, row.challengerLifecycleRate)) errors.push(`difference:${row.horizonSeconds}`);
  }
  if (summary.finalFactsProduced || summary.attributionEmitted || Object.entries(summary.readiness).some(([key, value]) => key !== "hardChallengerSpecificityEvidenceAvailable" && value)) errors.push("truth-boundary");
  return errors;
}

export async function buildHardChallengerRun(runKind) {
  const sourceKind = runKind === "task192-pilot" ? "task190-pilot" : "task190-bounded32";
  const prefix = sourceKind === "task190-pilot" ? "surface-resolved-lifecycle-pilot" : "surface-resolved-lifecycle-bounded32";
  const manifest = await readJson(`${SOURCE}/${sourceKind}/${prefix}-manifest.json`);
  if (manifest.replayIds.some(id => PROTECTED.has(id))) throw new Error("protected replay in source manifest");
  const sourceGate = await readJson(`${SOURCE}/${sourceKind}/${prefix}-gate.json`);
  const bridgeErrors = validateTask190Bridge(sourceGate, manifest);
  if (bridgeErrors.length) throw new Error(`Task 190 bridge failed: ${bridgeErrors.join("; ")}`);
  const schema = await loadSchema();
  const perReplay = []; const ledgers = Object.fromEntries(HORIZONS.map(horizon => [horizon, []]));
  const sensitivity = [];
  for (const replayId of manifest.replayIds) {
    const artifact = await readJson(`${SOURCE}/${sourceKind}/artifacts/${replayId}/death_event_surface_resolved_lifecycle_evidence.json`);
    const primary = deriveStructuralChallengers(artifact, 5);
    const horizonResults = [];
    for (const horizon of HORIZONS) { const matched = matchHorizon(artifact, primary.candidates, horizon); horizonResults.push(matched.result); ledgers[horizon].push(...matched.ledger.map(row => ({ replayId, ...row }))); }
    perReplay.push({ replayId, anchorCount: artifact.anchorCount, challengerCount: primary.candidates.length, sourceRowCount: primary.sourceRowCount, deduplicatedSourceRowCount: primary.deduplicatedSourceRowCount, excludedByAnchorWindow: primary.excluded, horizonResults, primaryAssessment: assessment(horizonResults), ambiguityCount: primary.candidates.filter(row => row.ambiguous).length, surfaceOpportunity: { noSurface: primary.candidates.filter(row => row.surfaceOpportunityCount === 0).length, oneSurface: primary.candidates.filter(row => row.surfaceOpportunityCount === 1).length, multipleSurfaces: primary.candidates.filter(row => row.surfaceOpportunityCount > 1).length }, truncationCauses: Object.fromEntries([...new Set(primary.candidates.map(row => row.truncationCause))].map(cause => [cause, primary.candidates.filter(row => row.truncationCause === cause).length])) });
    sensitivity.push({ replayId, windows: [3, 5, 10].map(windowSeconds => ({ windowSeconds, eligibleChallengerCount: deriveStructuralChallengers(artifact, windowSeconds).candidates.length })) });
  }
  const horizonResults = HORIZONS.map(horizonSeconds => {
    const rows = perReplay.map(row => row.horizonResults.find(item => item.horizonSeconds === horizonSeconds));
    const pairs = rows.reduce((sum, row) => sum + row.matchedPairCount, 0);
    const anchor = rows.reduce((sum, row) => sum + row.anchorLifecycleRate * row.matchedPairCount, 0);
    const challenger = rows.reduce((sum, row) => sum + row.challengerLifecycleRate * row.matchedPairCount, 0);
    const anchorRate = pairs ? Number((anchor / pairs).toFixed(6)) : 0; const challengerRate = pairs ? Number((challenger / pairs).toFixed(6)) : 0;
    const ledger = ledgers[horizonSeconds];
    const sourceReuseCount = reuseCount(ledger.map(row => `${row.replayId}:${row.sourceTransitionKey}`));
    const anchorReuseCount = reuseCount(ledger.map(row => `${row.replayId}:${row.anchorKey}`));
    const challengerReuseCount = reuseCount(ledger.map(row => `${row.replayId}:${row.challengerKey}`));
    const assignmentReuseCount = reuseCount(ledger.map(row => row.assignmentKey));
    return { horizonSeconds, eligibleAnchorCount: rows.reduce((sum, row) => sum + row.eligibleAnchorCount, 0), eligibleChallengerCount: rows.reduce((sum, row) => sum + row.eligibleChallengerCount, 0), matchedPairCount: pairs, anchorLifecycleRate: anchorRate, challengerLifecycleRate: challengerRate, pairedDifference: difference(anchorRate, challengerRate), anchorAssignmentCount: pairs, challengerAssignmentCount: pairs, sourceReuseCount: sourceReuseCount + anchorReuseCount + challengerReuseCount + assignmentReuseCount };
  });
  const summaryReuse = horizonResults.reduce((sum, row) => sum + row.sourceReuseCount, 0);
  const summary = { schemaVersion: 1, runKind, artifactClass: "death_event_hard_challenger_lifecycle_specificity", manifestIdentity: `${runKind}_hard_challenger_v1`, replayIds: manifest.replayIds, sourceBaseline: "task190_surface_resolved_lifecycle_evidence", exclusionWindowSeconds: 5, horizonResults, replayCount: manifest.replayIds.length, anchorCount: perReplay.reduce((sum, row) => sum + row.anchorCount, 0), challengerCount: perReplay.reduce((sum, row) => sum + row.challengerCount, 0), sourceReuseCount: summaryReuse, ambiguityCount: perReplay.reduce((sum, row) => sum + row.ambiguityCount, 0), assessment: assessment(horizonResults), technicalStatus: "passed", finalFactsProduced: false, attributionEmitted: false, readiness: readiness(), limitations: ["Structural challengers are unconfirmed replay-sourced comparison clusters, not ground-truth non-deaths.", "Task 190 accepted artifacts are consumed without modification or parser upgrade."] };
  const errors = validateHardChallengerSummary(summary, schema); if (errors.length) throw new Error(errors.join("; "));
  return { summary, perReplay, ledgers, sensitivity, manifest, sourceGate };
}

export async function publishHardChallengerRun(runKind) {
  const built = await buildHardChallengerRun(runKind); const activeRoot = path.resolve(ROOT, `${OUTPUT}/${runKind}`); const blockedRoot = `${activeRoot}-blocked`;
  const files = [
    { relativePath: "manifest.json", value: { schemaVersion: 1, runKind, sourceManifestIdentity: built.manifest.manifestIdentity, replayIds: built.manifest.replayIds, membershipExact: true } },
    { relativePath: "task180-182-183-186-190-source-bridge-audit.json", value: { schemaVersion: 1, status: "passed", bridgeModel: "Task190 accepted full-row bridge transitively preserves Tasks 180/182/183/186", task190Gate: built.sourceGate.gate, task190ManifestIdentity: built.sourceGate.manifestIdentity, replayIds: built.sourceGate.replayIds, sourceBridgeFailures: 0, historicalArtifactsModified: false } },
    { relativePath: "summary.json", value: built.summary },
    { relativePath: "per-replay-audit.json", value: { schemaVersion: 1, rows: built.perReplay } },
    { relativePath: "challenger-exclusion-window-audit.json", value: { schemaVersion: 1, clusterIdentity: "replay_participant_actual_forward_transition_second", exclusionUsesActualTransitionSecond: true, exclusionWindowSeconds: 5, inspectedAnchorRows: built.summary.anchorCount, excludedClusterCount: built.perReplay.reduce((sum, row) => sum + row.excludedByAnchorWindow, 0), deduplicatedSourceRowCount: built.perReplay.reduce((sum, row) => sum + row.deduplicatedSourceRowCount, 0), protectedReplayAccessCount: 0 } },
    { relativePath: "independent-horizon-ledgers.json", value: { schemaVersion: 1, freshLedgerPerHorizon: true, sourceReuseCount: built.summary.sourceReuseCount, horizons: HORIZONS.map(horizonSeconds => ({ horizonSeconds, sourceReuseCount: built.summary.horizonResults.find(row => row.horizonSeconds === horizonSeconds).sourceReuseCount, assignments: built.ledgers[horizonSeconds] })) } },
    { relativePath: "surface-truncation-ambiguity-audit.json", value: { schemaVersion: 1, surfaceOpportunityScale: SURFACE_OPPORTUNITY_BY_STATUS, consolidationRule: "maximum observable surfaces across stages per family, then minimum across families per source row, then minimum across source rows per cluster", rows: built.perReplay.map(({ replayId, surfaceOpportunity, truncationCauses, ambiguityCount }) => ({ replayId, surfaceOpportunity, truncationCauses, ambiguityCount })) } },
    { relativePath: "exclusion-sensitivity-audit.json", value: { schemaVersion: 1, rows: built.sensitivity } },
    { relativePath: "gate.json", value: { schemaVersion: 1, technicalGateStatus: runKind === "task192-pilot" ? "task190_hard_challenger_lifecycle_specificity_pilot_ready" : "task190_hard_challenger_lifecycle_specificity_bounded32_ready", runKind, integrityStatus: "passed", measurementStatus: "completed", operationalSpecificityAssessment: built.summary.assessment, finalFacts: 0, attribution: 0, atomicPublication: true } },
  ];
  await publishRunOutcome({ activeRoot, blockedRoot, success: true, files }); await rm(blockedRoot, { recursive: true, force: true });
  if (runKind === "task192-bounded32") { await writeJson(`${OUTPUT}/task192-gate.json`, files.at(-1).value); await writeJson(`${OUTPUT}/task192-summary.json`, built.summary); }
  return built;
}

async function main() { const runKind = process.argv.includes("--pilot") ? "task192-pilot" : "task192-bounded32"; const built = await publishHardChallengerRun(runKind); process.stdout.write(`${JSON.stringify({ runKind, assessment: built.summary.assessment, challengers: built.summary.challengerCount })}\n`); }
if (pathToFileURL(process.argv[1] ?? "").href === import.meta.url) main().catch(error => { process.stderr.write(`${error.stack ?? error}\n`); process.exitCode = 1; });
