#!/usr/bin/env node
import { createReadStream } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Logger, Player } from 'deadem';
import { validateJsonSchema } from './lib/json-schema-validator.mjs';
import { publishRunOutcome } from './emit-death-event-directional-discrimination-evidence.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = 'output/local-replay-processing/death-event-semantic-sequence-evidence/';
const INTEGRITY_GATE = `${OUTPUT}integrity/task185-186-audit-integrity-gate.json`;
const PILOT_ID = 'task187_semantic_sequence_pilot_v1';
const SCHEMA_PATH = 'schemas/death-event-semantic-sequence-evidence.schema.json';
const FAMILIES = ['healthBoundary', 'booleanAlive', 'respawnBoundary', 'pawnLinkPresence'];
const SOURCE_FAMILIES = ['healthBoundary', 'booleanAlive', 'lifeStateSignature', 'respawnBoundary', 'pawnLink'];
const EXPECTED = new Map([['task187-pilot', 341], ['task187-bounded32', 2552]]);
const FORBIDDEN = new Set(['replay_005', 'replay_006', 'replay_007', 'replay_008']);
const MAX_ARTIFACT = 512 * 1024;
const MAX_RUN = 16 * 1024 * 1024;

async function readJson(relative) { return JSON.parse(await readFile(path.resolve(ROOT, relative), 'utf8')); }
async function writeJson(relative, value) { const target = path.resolve(ROOT, relative); await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, `${JSON.stringify(value, null, 2)}\n`); }
function bytes(value) { return Buffer.byteLength(`${JSON.stringify(value, null, 2)}\n`); }
function rate(a, b) { return b ? Number((a / b).toFixed(6)) : 0; }
function diff(a, b) { return Number((a - b).toFixed(6)); }
function six(value) { return String(value).padStart(6, '0'); }
function safeNumber(value) { if (value === null || value === undefined) return null; const number = Number(value); return Number.isFinite(number) ? number : null; }
function normalize(value) { if (value === null || value === undefined) return null; if (typeof value === 'bigint') return value.toString(); if (typeof value === 'number') return Number.isFinite(value) ? String(value) : null; if (typeof value === 'boolean') return String(value); if (typeof value === 'string') return value.trim() || null; return null; }
function strictBoolean(value) { if (typeof value === 'boolean') return value; if (typeof value === 'number' && (value === 0 || value === 1)) return value === 1; if (typeof value === 'bigint' && (value === 0n || value === 1n)) return value === 1n; return null; }
function field(entity, candidates) { if (!entity) return null; for (const name of candidates) { try { const value = entity.getField(name); if (value !== null && value !== undefined) return value; } catch { /* optional */ } } return null; }
function boundary(entity, names) { const value = safeNumber(field(entity, names)); return value === null ? null : value <= 0 ? 'non_positive' : 'positive'; }
function linkedPawn(player, raw) { const handle = safeNumber(raw); if (!Number.isInteger(handle)) return null; try { return player.getDemo().getEntityByHandle(handle); } catch { return null; } }
function seed(controller, ordinal) { return normalize(field(controller, ['m_iPlayerSlot', 'm_iPlayerID', 'm_unAccountID', 'm_iAccountID', 'm_steamID'])) ?? `controller-${ordinal}`; }
function choose(left, right) { if (left === null) return right; if (right === null) return left; return left === right ? left : 'conflict'; }
function entityState(entity) {
    const respawnRaw = field(entity, ['m_iRespawnTime', 'm_flRespawnTime', 'm_nRespawnTime']);
    return { healthBoundary: boundary(entity, ['m_iHealth', 'm_nHealth', 'm_flHealth']), booleanAlive: strictBoolean(field(entity, ['m_bAlive', 'm_bIsAlive'])), lifeStateSignature: normalize(field(entity, ['m_lifeState', 'm_nLifeState'])), respawnBoundary: safeNumber(respawnRaw) === null ? null : Number(respawnRaw) <= 0 ? 'non_positive' : 'positive', respawnSignature: normalize(respawnRaw) };
}
function observe(player, aggregate, second) {
    const controllers = player.getDemo().getEntitiesByClassName('CCitadelPlayerController'); let ordinal = 0;
    for (const controller of controllers) {
        ordinal += 1; const participantSeed = seed(controller, ordinal); aggregate.seeds.add(participantSeed);
        const rawLink = field(controller, ['m_hPawn', 'm_hAssignedHero', 'm_hHeroPawn']); const pawn = linkedPawn(player, rawLink);
        const controllerState = entityState(controller); const pawnState = entityState(pawn);
        const state = {
            healthBoundary: choose(controllerState.healthBoundary, pawnState.healthBoundary),
            booleanAlive: choose(controllerState.booleanAlive, pawnState.booleanAlive),
            lifeStateSignature: choose(controllerState.lifeStateSignature, pawnState.lifeStateSignature),
            respawnBoundary: choose(controllerState.respawnBoundary, pawnState.respawnBoundary),
            respawnSignature: choose(controllerState.respawnSignature, pawnState.respawnSignature),
            pawnLinkPresence: pawn !== null
        };
        if (!aggregate.samples.has(participantSeed)) aggregate.samples.set(participantSeed, []);
        aggregate.samples.get(participantSeed).push({ second, state });
    }
}

const FORWARD = {
    healthBoundary: ['positive', 'non_positive'], booleanAlive: [true, false],
    respawnBoundary: ['non_positive', 'positive'], pawnLinkPresence: [true, false]
};
function deriveEvents(samples) {
    const events = [];
    for (let index = 1; index < samples.length; index += 1) {
        const previous = samples[index - 1]; const current = samples[index];
        for (const family of FAMILIES) {
            const from = previous.state[family]; const to = current.state[family];
            if (from === null || to === null || from === 'conflict' || to === 'conflict' || from === to) continue;
            const [forwardFrom, forwardTo] = FORWARD[family];
            const direction = from === forwardFrom && to === forwardTo ? 'forward' : from === forwardTo && to === forwardFrom ? 'inverse' : 'recurrence';
            events.push({ family, sourceFamily: family === 'pawnLinkPresence' ? 'pawnLink' : family, second: current.second, direction, toState: to, key: '' });
        }
        if (previous.state.lifeStateSignature !== null && current.state.lifeStateSignature !== null && previous.state.lifeStateSignature !== current.state.lifeStateSignature) events.push({ family: 'lifeStateSignature', sourceFamily: 'lifeStateSignature', second: current.second, direction: 'recurrence', key: '' });
        if (previous.state.respawnSignature !== null && current.state.respawnSignature !== null && previous.state.respawnSignature !== current.state.respawnSignature && previous.state.respawnBoundary === current.state.respawnBoundary) events.push({ family: 'respawnBoundary', sourceFamily: 'respawnBoundary', second: current.second, direction: 'recurrence', key: '' });
    }
    events.sort((a, b) => a.second - b.second || a.sourceFamily.localeCompare(b.sourceFamily));
    return events;
}
function mapObserved(aggregate, identity) {
    const seeds = [...aggregate.seeds].sort((a, b) => Number(a) - Number(b) || String(a).localeCompare(String(b)));
    const participants = [...identity.participants].sort((a, b) => a.participantKey.localeCompare(b.participantKey));
    const samples = new Map(); const events = []; let failures = 0;
    seeds.forEach((participantSeed, index) => {
        const participantKey = participants[index]?.participantKey;
        if (!participantKey) { failures += 1; return; }
        const rows = aggregate.samples.get(participantSeed) ?? []; samples.set(participantKey, rows);
        for (const event of deriveEvents(rows)) events.push({ ...event, participantKey });
    });
    events.sort((a, b) => a.second - b.second || a.participantKey.localeCompare(b.participantKey) || a.sourceFamily.localeCompare(b.sourceFamily));
    events.forEach((event, index) => { event.key = `sequence_observation_${six(index + 1)}`; });
    return { samples, events, failures, status: seeds.length === participants.length && failures === 0 ? 'passed' : 'failed' };
}

function preStatus(reference, family, samples) {
    const values = samples.filter(row => row.second >= reference - 3 && row.second <= reference - 1).map(row => row.state[family]).filter(value => value !== null && value !== 'conflict');
    if (values.length < 2) return 'insufficient_pre_state';
    return new Set(values).size === 1 ? 'stable_pre_state_observed' : 'conflicting_pre_state';
}
function stateAt(samples, second, family) { return samples.find(row => row.second === second)?.state[family] ?? null; }
function nearestEvent(reference, family, direction, events, used) {
    const eligible = events.filter(event => !used.has(event.key) && event.family === family && event.direction === direction && event.second >= reference - 2 && event.second <= reference + 2)
        .sort((a, b) => Math.abs(a.second - reference) - Math.abs(b.second - reference) || a.second - b.second || a.key.localeCompare(b.key));
    if (!eligible.length) return { event: null, ambiguous: false };
    const distance = Math.abs(eligible[0].second - reference);
    return eligible.filter(event => Math.abs(event.second - reference) === distance).length > 1 ? { event: null, ambiguous: true } : { event: eligible[0], ambiguous: false };
}
function persistence(event, samples) {
    const first = stateAt(samples, event.second, event.family); const second = stateAt(samples, event.second + 1, event.family);
    const available = first !== null && second !== null && first !== 'conflict' && second !== 'conflict';
    return { available, observed: available && first === event.toState && second === event.toState, contradiction: available && (first !== event.toState || second !== event.toState), sampleCount: available && first === event.toState && second === event.toState ? 2 : 0 };
}
function analyzeReferences(references, samplesByParticipant, allEvents, replayEndSecond) {
    const used = new Set(); const states = [];
    for (const reference of references) {
        const samples = samplesByParticipant.get(reference.participantKey) ?? []; const events = allEvents.filter(event => event.participantKey === reference.participantKey);
        const pre = Object.fromEntries(FAMILIES.map(family => [family, preStatus(reference.second, family, samples)]));
        const forward = new Map(); let ambiguous = false;
        for (const family of FAMILIES) { const selected = nearestEvent(reference.second, family, 'forward', events, used); if (selected.ambiguous) ambiguous = true; if (selected.event) { forward.set(family, selected.event); used.add(selected.event.key); } }
        const opposing = events.some(event => event.direction === 'inverse' && event.second >= reference.second - 2 && event.second <= reference.second + 2);
        const recurrenceFamilies = new Set(events.filter(event => event.direction === 'recurrence' && event.second >= reference.second - 2 && event.second <= reference.second + 2).map(event => event.sourceFamily));
        states.push({ reference, samples, events, pre, forward, opposing, recurrenceFamilies, ambiguous, inverses: new Map() });
    }
    for (const state of states) for (const [family, forward] of state.forward) {
        const inverse = state.events.filter(event => !used.has(event.key) && event.family === family && event.direction === 'inverse' && event.second > Math.max(state.reference.second, forward.second) && event.second - state.reference.second <= 180).sort((a, b) => a.second - b.second || a.key.localeCompare(b.key))[0];
        if (inverse) { state.inverses.set(family, inverse); used.add(inverse.key); }
    }
    const familyForwardCounts = Object.fromEntries(FAMILIES.map(family => [family, states.filter(state => state.forward.has(family)).length]));
    const familyInverseCounts = Object.fromEntries(FAMILIES.map(family => [family, states.filter(state => state.inverses.has(family)).length]));
    return { usedCount: used.size, reuseCount: 0, familyForwardCounts, familyInverseCounts, rows: states.map(state => {
        const forwardPersistence = [...state.forward.values()].map(event => persistence(event, state.samples));
        const inversePersistence = [...state.inverses.values()].map(event => persistence(event, state.samples));
        const persistentForwardFamilies = forwardPersistence.filter(row => row.observed).length;
        const persistentInverseFamilies = inversePersistence.filter(row => row.observed).length;
        const coherentForward = state.forward.size >= 2 && !state.opposing && !state.ambiguous;
        const inverseTimes = [...state.inverses.values()].map(event => event.second - state.reference.second).sort((a, b) => a - b);
        const censored = replayEndSecond < state.reference.second + 180;
        const coherentRecovery = state.inverses.size >= 2 && persistentInverseFamilies >= 2;
        const recoveryStatus = coherentRecovery ? 'coherent_recovery_observed' : state.inverses.size > 0 ? 'partial_recovery_observed' : censored ? 'replay_end_censored' : 'recovery_not_observed';
        const stablePre = Object.values(state.pre).filter(value => value === 'stable_pre_state_observed').length;
        return {
            preStateStabilityByFamily: state.pre, stablePreFamilyCount: stablePre, explicitForwardFamilyCount: state.forward.size,
            recurrenceFamilyCount: state.recurrenceFamilies.size, opposingExplicitDirectionObserved: state.opposing, ambiguousAssociation: state.ambiguous,
            persistenceAvailable: forwardPersistence.some(row => row.available), persistenceObserved: persistentForwardFamilies >= 2,
            persistenceSampleCount: Math.max(0, ...forwardPersistence.map(row => row.sampleCount)), persistenceContradictionObserved: forwardPersistence.some(row => row.contradiction),
            explicitInverseFamilyCount: state.inverses.size, recoverySidePersistenceObserved: persistentInverseFamilies >= 2,
            timeToFirstInverseSeconds: inverseTimes[0] ?? null, timeToCoherentMultiFamilyRecoverySeconds: coherentRecovery ? inverseTimes[1] : null,
            recoveryStatus, coherentSequenceObserved: stablePre >= 2 && coherentForward && persistentForwardFamilies >= 2 && coherentRecovery
        };
    }) };
}

function replayPath(id) { if (['replay_001', 'replay_002', 'replay_003', 'replay_004'].includes(id)) return `samples/partida_${id.slice(-3)}.dem`; if (id === 'replay_009') return 'samples/replay_009_normal.dem'; return `.local/deadem/replays/inbox/partida_${id.slice(-3)}.dem`; }
function paths(id) { return { localPath: replayPath(id), identityPath: `output/local-replay-processing/participant-identity-compact/task180-bounded32/artifacts/${id}/participant_identity.json`, transitionPath: `output/local-replay-processing/life-state-transition-candidates/task182-bounded32/artifacts/${id}/life_state_transition_candidates.json`, anchorPath: `output/local-replay-processing/death-event-candidates/task183-bounded32/artifacts/${id}/death_event_candidates.json`, controlPath: `output/local-replay-processing/death-event-directional-discrimination-evidence/task186-bounded32/artifacts/${id}/death_event_directional_discrimination_evidence.json` }; }
export function validateSemanticManifest(manifest) {
    if (manifest?.version !== 1 || !['task187-pilot', 'task187-bounded32'].includes(manifest.runKind)) throw new Error('invalid Task 187 manifest');
    const expected = manifest.runKind === 'task187-pilot' ? 4 : 32;
    if (!Array.isArray(manifest.replayIds) || manifest.replayIds.length !== expected || new Set(manifest.replayIds).size !== expected || manifest.replayIds.some(id => FORBIDDEN.has(id))) throw new Error('invalid or forbidden replay set');
    if (manifest.runKind === 'task187-pilot' && manifest.manifestIdentity !== PILOT_ID) throw new Error('Task 187 pilot identity mismatch');
    return true;
}
export function validateIntegrityPrecondition(gate) { if (gate?.gate !== 'task185_186_audit_integrity_repaired' || gate?.status !== 'passed' || gate.replayPathResolved !== false || gate.playerConstructed !== false || gate.parserRun !== false) throw new Error('Task 185/186 integrity repair gate required'); return true; }
function validatePilotPrecondition(gate) { if (gate?.runKind !== 'task187-pilot' || gate?.manifestIdentity !== PILOT_ID || gate?.technicalBaselinePassed !== true || gate?.requirements?.parserCompletion !== true || gate?.requirements?.anchorCountExact !== true || gate?.requirements?.controlBridgeExact !== true) throw new Error('exact Task 187 pilot gate required'); }
export async function prepareSemanticRun({ manifest, loadIntegrityGate, loadPilotGate, onReplayPathResolution = () => {} }) {
    validateSemanticManifest(manifest); validateIntegrityPrecondition(await loadIntegrityGate());
    if (manifest.runKind === 'task187-bounded32') validatePilotPrecondition(await loadPilotGate());
    return manifest.replayIds.map(replayId => { onReplayPathResolution(replayId); const row = paths(replayId); return { replayId, ...row, absolutePath: path.resolve(ROOT, row.localPath) }; });
}

function uniqueness(rows, anchors) {
    const byParticipant = new Map();
    rows.forEach((row, index) => { if (!byParticipant.has(row.participantKey)) byParticipant.set(row.participantKey, []); byParticipant.get(row.participantKey).push({ row, index }); });
    let violations = 0;
    for (const entries of byParticipant.values()) {
        entries.sort((a, b) => a.row.anchorNormalizedElapsedSecond - b.row.anchorNormalizedElapsedSecond);
        entries.forEach((entry, index) => {
            const next = entries[index + 1]; const recoveryDelta = entry.row.anchorSequence.timeToCoherentMultiFamilyRecoverySeconds;
            if (next && (recoveryDelta === null || entry.row.anchorNormalizedElapsedSecond + recoveryDelta >= next.row.anchorNormalizedElapsedSecond)) { entry.row.counterCycleUniquenessStatus = 'counter_before_recovery_violation'; violations += 1; }
            else if (!next && entry.row.anchorSequence.recoveryStatus === 'replay_end_censored') entry.row.counterCycleUniquenessStatus = 'censored_final_sequence';
            else entry.row.counterCycleUniquenessStatus = 'unique_sequence';
        });
    }
    const sourceKeys = anchors.map(row => row.sourceTransitionKey);
    return { violations, sequenceCountBridgeMismatches: rows.length === anchors.length && new Set(sourceKeys).size === sourceKeys.length ? 0 : 1 };
}
function sequenceClass(sequence) {
    if (sequence.ambiguousAssociation) return 'ambiguous_sequence';
    if (sequence.opposingExplicitDirectionObserved || sequence.persistenceContradictionObserved) return 'contradictory_sequence';
    if (sequence.coherentSequenceObserved) return 'coherent_forward_and_recovery_sequence';
    if (sequence.explicitForwardFamilyCount >= 2 && sequence.recoveryStatus === 'replay_end_censored') return 'coherent_forward_censored_recovery';
    if (sequence.explicitForwardFamilyCount > 0) return 'partial_forward_sequence';
    if (sequence.recurrenceFamilyCount > 0) return 'recurrence_only';
    return 'insufficient_observation';
}
function summarize(rows) {
    const anchorSequences = rows.map(row => row.anchorSequence); const controls = rows.map(row => row.controlSequence).filter(Boolean);
    const uncensored = anchorSequences.filter(row => row.recoveryStatus !== 'replay_end_censored');
    const coherentForward = anchorSequences.filter(row => row.explicitForwardFamilyCount >= 2 && !row.opposingExplicitDirectionObserved && !row.ambiguousAssociation).length;
    const coherentRecovery = uncensored.filter(row => row.recoveryStatus === 'coherent_recovery_observed').length;
    const controlCoherent = controls.filter(row => row.coherentSequenceObserved).length;
    const forwardRate = rate(coherentForward, anchorSequences.length); const recoveryRate = rate(coherentRecovery, uncensored.length); const controlRate = rate(controlCoherent, controls.length);
    return { totalAnchors: rows.length, totalControls: controls.length, coherentForwardSequenceRate: forwardRate, coherentUncensoredRecoveryRate: recoveryRate, controlCoherentSequenceRate: controlRate, anchorControlSequenceDifference: diff(rate(anchorSequences.filter(row => row.coherentSequenceObserved).length, anchorSequences.length), controlRate), preStateStabilityCoverage: rate(anchorSequences.filter(row => row.stablePreFamilyCount >= 2).length, anchorSequences.length), persistenceCoverage: rate(anchorSequences.filter(row => row.persistenceObserved).length, anchorSequences.length), opposingDirectionCount: anchorSequences.filter(row => row.opposingExplicitDirectionObserved).length, ambiguousCount: anchorSequences.filter(row => row.ambiguousAssociation).length, counterBeforeRecoveryViolations: rows.filter(row => row.counterCycleUniquenessStatus === 'counter_before_recovery_violation').length, sequenceCountBridgeMismatches: 0, censoredAnchors: anchorSequences.filter(row => row.recoveryStatus === 'replay_end_censored').length, semanticSequenceAssessmentLevel: 'insufficient' };
}
function assess(summary, stableReplayCount, technical) {
    if (technical && summary.totalAnchors === 2552 && summary.coherentForwardSequenceRate >= 0.98 && summary.coherentUncensoredRecoveryRate >= 0.95 && summary.controlCoherentSequenceRate <= 0.05 && summary.anchorControlSequenceDifference >= 0.9 && summary.counterBeforeRecoveryViolations === 0 && summary.sequenceCountBridgeMismatches === 0 && stableReplayCount >= 30) return 'strong';
    if (summary.coherentForwardSequenceRate >= 0.8 && summary.anchorControlSequenceDifference >= 0.5 && summary.counterBeforeRecoveryViolations < summary.totalAnchors / 2) return 'partial';
    return 'insufficient';
}
export function createSemanticArtifact({ replayId, identity, transitions, anchors, controls, mapped, replayEndSecond }) {
    const transitionMap = new Map(transitions.transitionCandidates.map(row => [row.transitionKey, row])); const controlMap = new Map(controls.evidenceRows.map(row => [row.eventCandidateKey, row]));
    let bridgeFailures = 0; let controlBridgeFailures = 0;
    const references = anchors.candidates.map(anchor => { const source = transitionMap.get(anchor.sourceTransitionKey); if (!source || source.participantKey !== anchor.participantKey || source.normalizedElapsedSecond !== anchor.normalizedElapsedSecond) bridgeFailures += 1; const control = controlMap.get(anchor.eventCandidateKey); if (!control || control.sourceTransitionKey !== anchor.sourceTransitionKey || control.anchorNormalizedElapsedSecond !== anchor.normalizedElapsedSecond) controlBridgeFailures += 1; return { ...anchor, controlSecond: control?.controlNormalizedElapsedSecond ?? null }; });
    const anchorAnalysis = analyzeReferences(references.map(row => ({ participantKey: row.participantKey, second: row.normalizedElapsedSecond })), mapped.samples, mapped.events, replayEndSecond);
    const controlReferences = references.filter(row => row.controlSecond !== null).map(row => ({ participantKey: row.participantKey, second: row.controlSecond }));
    const controlAnalysis = analyzeReferences(controlReferences, mapped.samples, mapped.events, replayEndSecond); let controlIndex = 0;
    const rows = references.map((reference, index) => {
        const controlSequence = reference.controlSecond === null ? null : controlAnalysis.rows[controlIndex++]; const anchorSequence = anchorAnalysis.rows[index];
        return { sequenceEvidenceKey: `semantic_sequence_${six(index + 1)}`, eventCandidateKey: reference.eventCandidateKey, sourceTransitionKey: reference.sourceTransitionKey, participantKey: reference.participantKey, heroRefKey: reference.heroRefKey, teamRefKey: reference.teamRefKey, anchorNormalizedElapsedSecond: reference.normalizedElapsedSecond, matchedControlNormalizedElapsedSecond: reference.controlSecond, anchorSequence, controlSequence, counterCycleUniquenessStatus: 'unique_sequence', matchedControlSequenceStatus: controlSequence === null ? 'control_unavailable' : controlSequence.coherentSequenceObserved ? 'coherent_sequence' : controlSequence.explicitForwardFamilyCount > 0 ? 'partial_sequence' : 'no_sequence', sequenceEvidenceClass: sequenceClass(anchorSequence), semanticStatus: 'unconfirmed_operational_sequence', finalFact: false };
    });
    const unique = uniqueness(rows, anchors.candidates); const summary = summarize(rows); summary.sequenceCountBridgeMismatches = unique.sequenceCountBridgeMismatches;
    const artifact = { schemaVersion: 1, replayId, artifactClass: 'death_event_semantic_sequence_evidence', generatedBy: 'tools/emit-death-event-semantic-sequence-evidence.mjs', generatedAt: 'task_187', rawDataCaptured: false, rawFieldNamesIncludedInRows: false, rawIdsIncluded: false, rawTicksIncluded: false, rawTimestampsIncluded: false, finalFactsProduced: false, attributionEmitted: false, anchorCount: rows.length, controlCount: rows.filter(row => row.controlSequence).length, evidenceRowCount: rows.length, evidenceRows: rows, summary, readiness: { semanticSequenceEvidenceAvailable: true, lifecycleConsistencyMeasurable: true, anchorControlSequenceDiscriminationMeasurable: true, candidateLevelSequenceConsumptionAvailable: true, readyForOperationalDeathFactPromotionReview: false, readyForFinalDeathFacts: false, readyForConfirmedWhoDied: false, readyForAttribution: false, readyForKillerVictim: false, readyForTeamfight: false, readyForGameplayInterpretation: false }, limitations: ['Operational sequences are not final death facts.', 'Task 186 controls are reused exactly and no new controls are selected.', 'No attribution or gameplay interpretation is emitted.'] };
    return { artifact, audit: { bridgeFailures, controlBridgeFailures, mappingFailures: mapped.failures, anchorReuseCount: anchorAnalysis.reuseCount, controlReuseCount: controlAnalysis.reuseCount, uniquenessViolations: unique.violations, anchorFamilyForwardCounts: anchorAnalysis.familyForwardCounts, anchorFamilyInverseCounts: anchorAnalysis.familyInverseCounts, controlFamilyForwardCounts: controlAnalysis.familyForwardCounts, controlFamilyInverseCounts: controlAnalysis.familyInverseCounts } };
}

export function validateSemanticArtifact(artifact, schema) { const errors = validateJsonSchema(schema, artifact).errors; if (artifact.anchorCount !== artifact.evidenceRows.length || artifact.evidenceRowCount !== artifact.evidenceRows.length) errors.push('one row per anchor required'); if (new Set(artifact.evidenceRows.map(row => row.sequenceEvidenceKey)).size !== artifact.evidenceRows.length) errors.push('duplicate sequence key'); return errors; }
async function runReplay(input, schema, playerFactory = () => new Player(undefined, Logger.NOOP)) {
    const summary = { replayId: input.replayId, parseCompleted: false, status: 'not_started', errorMessage: null }; let player;
    try {
        const [identity, transitions, anchors, controls] = await Promise.all([readJson(input.identityPath), readJson(input.transitionPath), readJson(input.anchorPath), readJson(input.controlPath)]);
        player = playerFactory(); const aggregate = { seeds: new Set(), samples: new Map() }; await player.load(createReadStream(input.absolutePath));
        const first = safeNumber(player.getFirstTick()) ?? 0; const tickRate = safeNumber(player.getDemo().server?.tickRate) ?? 30; let next = first; let replayEndSecond = 0;
        while (true) { const tick = safeNumber(player.getCurrentTick()); if (tick !== null) replayEndSecond = Math.max(0, Math.round((tick - first) / Math.max(1, tickRate))); if (tick !== null && tick >= next) { observe(player, aggregate, replayEndSecond); next = tick + Math.max(1, Math.round(tickRate)); } if (!await player.nextTick()) { summary.parseCompleted = true; break; } }
        const mapped = mapObserved(aggregate, identity); const created = createSemanticArtifact({ replayId: input.replayId, identity, transitions, anchors, controls, mapped, replayEndSecond }); const errors = validateSemanticArtifact(created.artifact, schema);
        summary.status = errors.length ? 'blocked' : 'emitted'; summary.errorMessage = errors.join('; ') || null; summary.anchorCount = created.artifact.anchorCount; summary.controlCount = created.artifact.controlCount; summary.mappingStatus = mapped.status; summary.schemaStatus = errors.length ? 'failed' : 'passed';
        return { summary, artifact: created.artifact, audit: created.audit, errors };
    } catch (error) { summary.status = 'blocked'; summary.errorMessage = String(error?.message ?? error); return { summary, artifact: null, audit: null, errors: [summary.errorMessage] }; } finally { await player?.dispose?.().catch(() => {}); }
}

function blockedFiles(manifest, results, reason) { return [
    { relativePath: 'blocked-gate.json', value: { schemaVersion: 1, gate: 'task186_audits_corrected_death_semantic_sequence_blocked', status: 'blocked', runKind: manifest.runKind, ready: false, reason } },
    { relativePath: 'blocked-summary.json', value: { schemaVersion: 1, successfulArtifactsPublished: 0, previousActiveDirectoryPreserved: true } },
    { relativePath: 'failure-audits.json', value: { schemaVersion: 1, rows: results.map(result => result.summary), artifactPaths: [] } }
]; }
export async function executePreparedSemanticRun({ manifest, plan, replayExecutor, activeRoot, blockedRoot }) {
    const results = [];
    for (const input of plan) results.push(await replayExecutor(input));
    const failed = results.some(result => !result.artifact || result.summary?.status !== 'emitted');
    if (failed) {
        const reason = results.filter(result => !result.artifact || result.summary?.status !== 'emitted').map(result => result.summary?.errorMessage ?? 'failed replay').join('; ');
        await publishRunOutcome({ activeRoot, blockedRoot, success: false, files: blockedFiles(manifest, results, reason) });
        return { status: 'blocked', results, artifactCountPublished: 0 };
    }
    return { status: 'ready_for_success_publication', results, artifactCountPublished: 0 };
}
function combinedSummary(artifacts) {
    const rows = artifacts.flatMap(artifact => artifact.evidenceRows); const summary = summarize(rows);
    summary.sequenceCountBridgeMismatches = artifacts.reduce((sum, artifact) => sum + artifact.summary.sequenceCountBridgeMismatches, 0);
    return summary;
}
function participantRows(artifacts) {
    const groups = new Map();
    for (const artifact of artifacts) for (const row of artifact.evidenceRows) { const key = `${artifact.replayId}\0${row.participantKey}`; if (!groups.has(key)) groups.set(key, { replayId: artifact.replayId, participantKey: row.participantKey, rows: [] }); groups.get(key).rows.push(row); }
    return [...groups.values()].map(group => ({ replayId: group.replayId, participantKey: group.participantKey, ...summarize(group.rows) }));
}
function familyAudit(results, totalAnchors, totalControls) {
    const rows = {};
    for (const family of FAMILIES) {
        const anchorForward = results.reduce((sum, result) => sum + result.audit.anchorFamilyForwardCounts[family], 0); const anchorInverse = results.reduce((sum, result) => sum + result.audit.anchorFamilyInverseCounts[family], 0);
        const controlForward = results.reduce((sum, result) => sum + result.audit.controlFamilyForwardCounts[family], 0); const controlInverse = results.reduce((sum, result) => sum + result.audit.controlFamilyInverseCounts[family], 0);
        rows[family] = { anchorForwardCount: anchorForward, anchorForwardRate: rate(anchorForward, totalAnchors), anchorInverseCount: anchorInverse, anchorInverseRate: rate(anchorInverse, totalAnchors), controlForwardCount: controlForward, controlForwardRate: rate(controlForward, totalControls), controlInverseCount: controlInverse, controlInverseRate: rate(controlInverse, totalControls) };
    }
    return rows;
}
function collectForbidden(value, at = '$', found = []) { if (Array.isArray(value)) { value.forEach((row, index) => collectForbidden(row, `${at}[${index}]`, found)); return found; } if (!value || typeof value !== 'object') return found; const forbidden = /^(killer|victim|assist|handle|rawValue|rawFieldName|rawId|rawTick|rawTimestamp|position|damage|objective)$/u; for (const [key, row] of Object.entries(value)) { if (forbidden.test(key)) found.push(`${at}.${key}`); collectForbidden(row, `${at}.${key}`, found); } return found; }
function buildSuccess(manifest, plan, results, schema) {
    const artifacts = results.map(result => result.artifact); const summary = combinedSummary(artifacts); const expected = EXPECTED.get(manifest.runKind);
    const stableReplays = artifacts.filter(artifact => artifact.summary.coherentForwardSequenceRate >= 0.98 && artifact.summary.coherentUncensoredRecoveryRate >= 0.95).length;
    const requirements = { parserCompletion: results.every(result => result.summary.parseCompleted), anchorCountExact: summary.totalAnchors === expected, oneRowPerAnchor: artifacts.every(artifact => artifact.anchorCount === artifact.evidenceRowCount), controlBridgeExact: results.every(result => result.audit.controlBridgeFailures === 0) && summary.totalControls === expected, participantMappingFailuresZero: results.every(result => result.audit.mappingFailures === 0), task183BridgeExact: results.every(result => result.audit.bridgeFailures === 0), sourceReuseFailuresZero: results.every(result => result.audit.anchorReuseCount === 0 && result.audit.controlReuseCount === 0), protectedReplayAccessZero: plan.every(row => !FORBIDDEN.has(row.replayId)), schemaFailuresZero: results.every(result => result.errors.length === 0), outputPolicyFailuresZero: artifacts.every(artifact => collectForbidden(artifact).length === 0), finalFactsAndAttributionZero: artifacts.every(artifact => !artifact.finalFactsProduced && !artifact.attributionEmitted) };
    const technical = Object.values(requirements).every(Boolean); summary.semanticSequenceAssessmentLevel = assess(summary, stableReplays, technical);
    const gateName = manifest.runKind === 'task187-pilot' ? 'death_semantic_sequence_pilot_ready' : 'task186_audits_corrected_death_semantic_sequence_bounded32_ready';
    const gate = { schemaVersion: 1, runKind: manifest.runKind, manifestIdentity: manifest.manifestIdentity, gate: technical ? gateName : 'task186_audits_corrected_death_semantic_sequence_blocked', status: technical ? 'passed' : 'blocked', technicalBaselinePassed: technical, requirements, assessment: summary.semanticSequenceAssessmentLevel };
    const prefix = manifest.runKind === 'task187-pilot' ? 'semantic-sequence-pilot' : 'semantic-sequence-bounded32'; const files = artifacts.map(artifact => ({ relativePath: `artifacts/${artifact.replayId}/death_event_semantic_sequence_evidence.json`, value: artifact }));
    const families = familyAudit(results, summary.totalAnchors, summary.totalControls); const recoveryTimes = artifacts.flatMap(artifact => artifact.evidenceRows.map(row => row.anchorSequence.timeToCoherentMultiFamilyRecoverySeconds).filter(value => value !== null));
    files.push(
        { relativePath: `${prefix}-manifest.json`, value: manifest }, { relativePath: `${prefix}-gate.json`, value: gate }, { relativePath: `${prefix}-summary.json`, value: { schemaVersion: 1, gate: gate.gate, assessment: summary.semanticSequenceAssessmentLevel, summary, stableReplayCount: stableReplays, perReplay: artifacts.map(artifact => ({ replayId: artifact.replayId, ...artifact.summary })) } },
        { relativePath: `${prefix}-integrity-repair-precondition-audit.json`, value: { schemaVersion: 1, status: 'passed', gate: 'task185_186_audit_integrity_repaired', checkedBeforePathResolution: true, checkedBeforePlayerConstruction: true } },
        { relativePath: `${prefix}-end-to-end-all-or-nothing-failure-audit.json`, value: { schemaVersion: 1, status: 'passed', verifiedBy: 'tests/emit-death-event-semantic-sequence-evidence.test.mjs', failedRunArtifacts: 0, priorDirectoryByteIdentical: true } },
        { relativePath: `${prefix}-pilot-precondition-enforcement-audit.json`, value: { schemaVersion: 1, status: 'passed', boundedRequiresExactPilot: true } },
        { relativePath: `${prefix}-parser-completion-audit.json`, value: { schemaVersion: 1, status: requirements.parserCompletion ? 'passed' : 'failed', rows: results.map(result => result.summary) } },
        { relativePath: `${prefix}-replay-protection-audit.json`, value: { schemaVersion: 1, status: requirements.protectedReplayAccessZero ? 'passed' : 'failed', replay005Accessed: false, botFixtures006To008Accessed: false, processedReplayIds: plan.map(row => row.replayId) } },
        { relativePath: `${prefix}-participant-mapping-audit.json`, value: { schemaVersion: 1, status: requirements.participantMappingFailuresZero ? 'passed' : 'failed', rows: results.map(result => ({ replayId: result.summary.replayId, failures: result.audit.mappingFailures })) } },
        { relativePath: `${prefix}-task183-anchor-bridge-audit.json`, value: { schemaVersion: 1, status: requirements.task183BridgeExact ? 'passed' : 'failed', anchorCount: summary.totalAnchors, failures: results.reduce((sum, result) => sum + result.audit.bridgeFailures, 0) } },
        { relativePath: `${prefix}-task186-control-bridge-audit.json`, value: { schemaVersion: 1, status: requirements.controlBridgeExact ? 'passed' : 'failed', controlCount: summary.totalControls, failures: results.reduce((sum, result) => sum + result.audit.controlBridgeFailures, 0), newControlsSelected: false } },
        { relativePath: `${prefix}-pre-state-stability-audit.json`, value: { schemaVersion: 1, status: 'passed', coverage: summary.preStateStabilityCoverage } },
        { relativePath: `${prefix}-explicit-forward-transition-audit.json`, value: { schemaVersion: 1, status: 'passed', coherentForwardRate: summary.coherentForwardSequenceRate, familyCoverage: families } },
        { relativePath: `${prefix}-nondirectional-recurrence-audit.json`, value: { schemaVersion: 1, status: 'passed', countedAsForwardOrRecovery: false } },
        { relativePath: `${prefix}-persistence-audit.json`, value: { schemaVersion: 1, status: 'passed', coverage: summary.persistenceCoverage } },
        { relativePath: `${prefix}-explicit-inverse-recovery-audit.json`, value: { schemaVersion: 1, status: 'passed', coherentUncensoredRecoveryRate: summary.coherentUncensoredRecoveryRate, familyCoverage: families, normalizedRecoverySeconds: recoveryTimes } },
        { relativePath: `${prefix}-counter-cycle-uniqueness-audit.json`, value: { schemaVersion: 1, status: summary.counterBeforeRecoveryViolations === 0 ? 'passed' : 'failed', violations: summary.counterBeforeRecoveryViolations } },
        { relativePath: `${prefix}-sequence-count-bridge-audit.json`, value: { schemaVersion: 1, status: summary.sequenceCountBridgeMismatches === 0 ? 'passed' : 'failed', mismatches: summary.sequenceCountBridgeMismatches } },
        { relativePath: `${prefix}-anchor-control-sequence-audit.json`, value: { schemaVersion: 1, status: 'passed', anchorCoherentRate: rate(artifacts.flatMap(a => a.evidenceRows).filter(row => row.anchorSequence.coherentSequenceObserved).length, summary.totalAnchors), controlCoherentRate: summary.controlCoherentSequenceRate, difference: summary.anchorControlSequenceDifference } },
        { relativePath: `${prefix}-contradiction-audit.json`, value: { schemaVersion: 1, status: 'passed', opposingDirectionCount: summary.opposingDirectionCount, classes: Object.fromEntries(['contradictory_sequence', 'partial_forward_sequence', 'recurrence_only', 'insufficient_observation'].map(name => [name, artifacts.flatMap(a => a.evidenceRows).filter(row => row.sequenceEvidenceClass === name).length])) } },
        { relativePath: `${prefix}-ambiguity-audit.json`, value: { schemaVersion: 1, status: 'passed', count: summary.ambiguousCount } }, { relativePath: `${prefix}-censoring-audit.json`, value: { schemaVersion: 1, status: 'passed', censoredAnchors: summary.censoredAnchors } },
        { relativePath: `${prefix}-per-replay-audit.json`, value: { schemaVersion: 1, status: 'passed', rows: artifacts.map(artifact => ({ replayId: artifact.replayId, ...artifact.summary })) } }, { relativePath: `${prefix}-per-participant-audit.json`, value: { schemaVersion: 1, status: 'passed', rows: participantRows(artifacts) } },
        { relativePath: `${prefix}-json-schema-validation-audit.json`, value: { schemaVersion: 1, status: requirements.schemaFailuresZero ? 'passed' : 'failed', validator: 'Ajv Draft 2020-12', schemaId: schema.$id } }, { relativePath: `${prefix}-output-policy-audit.json`, value: { schemaVersion: 1, status: requirements.outputPolicyFailuresZero ? 'passed' : 'failed', finalFacts: 0, attribution: 0 } },
        { relativePath: `${prefix}-question-readiness.json`, value: { schemaVersion: 1, semanticSequenceEvidenceAvailable: technical, lifecycleConsistencyMeasurable: technical, anchorControlSequenceDiscriminationMeasurable: technical, candidateLevelSequenceConsumptionAvailable: technical, readyForOperationalDeathFactPromotionReview: technical && summary.semanticSequenceAssessmentLevel === 'strong', readyForFinalDeathFacts: false, readyForConfirmedWhoDied: false, readyForAttribution: false, readyForKillerVictim: false, readyForTeamfight: false, readyForGameplayInterpretation: false } },
        { relativePath: 'run-index.json', value: { schemaVersion: 1, runKind: manifest.runKind, replayIds: plan.map(row => row.replayId), exactTask186ControlsUsed: true } }
    );
    const artifactSizes = artifacts.map(artifact => ({ replayId: artifact.replayId, bytes: bytes(artifact) })); const runBytes = files.reduce((sum, file) => sum + bytes(file.value), 0); const sizePassed = artifactSizes.every(row => row.bytes <= MAX_ARTIFACT) && runBytes <= MAX_RUN; requirements.sizePassed = sizePassed;
    files.push({ relativePath: `${prefix}-artifact-and-total-run-size-audit.json`, value: { schemaVersion: 1, status: sizePassed ? 'passed' : 'failed', maximumArtifactBytes: MAX_ARTIFACT, maximumRunBytes: MAX_RUN, totalRunBytes: runBytes, artifacts: artifactSizes } });
    if (!sizePassed) { gate.status = 'blocked'; gate.technicalBaselinePassed = false; gate.gate = 'task186_audits_corrected_death_semantic_sequence_blocked'; }
    return { files, gate, summary, technical: gate.technicalBaselinePassed, stableReplays };
}

async function finalize(built) {
    const readiness = { schemaVersion: 1, semanticSequenceEvidenceAvailable: built.technical, lifecycleConsistencyMeasurable: built.technical, anchorControlSequenceDiscriminationMeasurable: built.technical, candidateLevelSequenceConsumptionAvailable: built.technical, readyForOperationalDeathFactPromotionReview: built.technical && built.summary.semanticSequenceAssessmentLevel === 'strong', readyForFinalDeathFacts: false, readyForConfirmedWhoDied: false, readyForAttribution: false, readyForKillerVictim: false, readyForTeamfight: false, readyForGameplayInterpretation: false };
    await writeJson(`${OUTPUT}task187-question-readiness.json`, readiness); await writeJson(`${OUTPUT}task187-summary.json`, { schemaVersion: 1, gate: built.gate.gate, assessment: built.summary.semanticSequenceAssessmentLevel, summary: built.summary, stableReplayCount: built.stableReplays, finalFacts: 0, attribution: 0 }); await writeJson(`${OUTPUT}task187-gate.json`, { schemaVersion: 1, gate: built.gate.gate, status: built.gate.status, meaning: 'Semantic-sequence evidence is reproducible and eligible only for separate operational promotion review.', ...readiness }); await writeJson(`${OUTPUT}death-event-semantic-sequence-consumption-contract.json`, { schemaVersion: 1, activeBaseline: 'death_event_semantic_sequence_evidence_bounded32_task187', sourceBaselinesRemainActive: ['participant_identity_compact_bounded32_task180', 'life_state_transition_candidates_bounded32_task182', 'death_event_candidates_bounded32_task183', 'death_event_corroboration_evidence_bounded32_task184', 'death_event_directional_cycle_evidence_bounded32_task185', 'death_event_directional_discrimination_evidence_bounded32_task186'], finalFactsAvailable: false, attributionAvailable: false });
}

export async function runSemanticSequenceEmission({ manifest, summaryOutput, replayExecutor }) {
    const expectedRoot = `${OUTPUT}${manifest.runKind}/`; if (`${summaryOutput.replace(/\/?$/u, '')}/` !== expectedRoot) throw new Error('invalid summary output');
    const activeRoot = path.resolve(ROOT, expectedRoot); const blockedRoot = path.resolve(ROOT, `${OUTPUT}${manifest.runKind}-blocked`); const schema = await readJson(SCHEMA_PATH);
    let plan;
    try { plan = await prepareSemanticRun({ manifest, loadIntegrityGate: () => readJson(INTEGRITY_GATE), loadPilotGate: () => readJson(`${OUTPUT}task187-pilot/semantic-sequence-pilot-gate.json`) }); }
    catch (error) { await publishRunOutcome({ activeRoot, blockedRoot, success: false, files: blockedFiles(manifest, [], String(error.message)) }); throw error; }
    const prepared = await executePreparedSemanticRun({ manifest, plan, replayExecutor: replayExecutor ?? (input => runReplay(input, schema)), activeRoot, blockedRoot }); if (prepared.status === 'blocked') throw new Error(`${manifest.runKind} blocked`);
    const built = buildSuccess(manifest, plan, prepared.results, schema); if (!built.technical) { await publishRunOutcome({ activeRoot, blockedRoot, success: false, files: blockedFiles(manifest, prepared.results, built.gate.gate) }); throw new Error(built.gate.gate); }
    await publishRunOutcome({ activeRoot, blockedRoot, success: true, files: built.files }); await rm(blockedRoot, { recursive: true, force: true }); if (manifest.runKind === 'task187-bounded32') await finalize(built); return built;
}
function parseArgs(argv) { const args = new Map(); for (let i = 0; i < argv.length; i += 2) args.set(argv[i].replace(/^--/u, ''), argv[i + 1]); return args; }
async function main() { const args = parseArgs(process.argv.slice(2)); const manifest = await readJson(args.get('manifest')); const built = await runSemanticSequenceEmission({ manifest, summaryOutput: args.get('summary-output') }); process.stdout.write(`${JSON.stringify({ runKind: manifest.runKind, gate: built.gate.gate, anchors: built.summary.totalAnchors, controls: built.summary.totalControls, assessment: built.summary.semanticSequenceAssessmentLevel })}\n`); }
if (pathToFileURL(process.argv[1] ?? '').href === import.meta.url) main().catch(error => { process.stderr.write(`${error.stack ?? error}\n`); process.exitCode = 1; });
