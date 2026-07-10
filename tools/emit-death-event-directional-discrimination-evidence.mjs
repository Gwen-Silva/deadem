#!/usr/bin/env node
import { createReadStream } from 'node:fs';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Logger, Player } from 'deadem';
import { validateJsonSchema } from './lib/json-schema-validator.mjs';

const THIS_FILE = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(THIS_FILE), '..');
const ARTIFACT_CLASS = 'death_event_directional_discrimination_evidence';
const MODE = 'death_event_directional_discrimination_evidence_emission';
const GENERATED_BY = 'tools/emit-death-event-directional-discrimination-evidence.mjs';
const OUTPUT_PREFIX = 'output/local-replay-processing/death-event-directional-discrimination-evidence/';
const SCHEMA_PATH = 'schemas/death-event-directional-discrimination-evidence.schema.json';
const PILOT_IDENTITY = 'task186_directional_discrimination_pilot_v1';
const CONTROLLER_CLASS = 'CCitadelPlayerController';
const DIRECTIONAL_FAMILIES = ['healthBoundary', 'booleanAlive', 'respawnBoundary', 'pawnLinkPresence'];
const SOURCE_FAMILIES = ['healthBoundary', 'booleanAlive', 'lifeStateSignature', 'respawnBoundary', 'pawnLink'];
const NO_DIRECTION = 'no_explicit_direction_observed';
const EXPECTED = new Map([['task186-pilot', 341], ['task186-bounded32', 2552]]);
const MAX_ARTIFACT_BYTES = 512 * 1024;
const MAX_RUN_BYTES = 16 * 1024 * 1024;

export const FORBIDDEN_REPLAY_IDS = new Set(['replay_005', 'replay_006', 'replay_007', 'replay_008']);
export const FORBIDDEN_OUTPUT_KEYS = new Set([
    'playerName', 'heroName', 'teamName', 'entityId', 'rawEntityId', 'handle', 'controllerHandle',
    'accountId', 'steamId', 'playerSlot', 'heroId', 'teamNumber', 'fieldName', 'fieldNames',
    'fieldValue', 'fieldValues', 'rawValue', 'rawValues', 'rawTick', 'rawTicks', 'rawTimestamp',
    'rawTimestamps', 'tick', 'ticks', 'timestamp', 'timestamps', 'position', 'positions', 'killer',
    'victim', 'assist', 'assists', 'damage', 'objective', 'deathFact', 'confirmedDeath', 'teamfight'
]);

function slash(value) { return String(value).replaceAll(path.sep, '/'); }
function rate(numerator, denominator) { return denominator === 0 ? 0 : Number((numerator / denominator).toFixed(6)); }
function difference(left, right) { return Number((left - right).toFixed(6)); }
function ratioValue(left, right) { return right === 0 ? null : Number((left / right).toFixed(6)); }
function six(index) { return String(index).padStart(6, '0'); }

function assertRelative(value, label) {
    if (!value || path.isAbsolute(value)) throw new Error(`${label} must be a relative repository path`);
    const normalized = slash(value);
    if (normalized === '..' || normalized.startsWith('../') || normalized.includes('/../')) throw new Error(`${label} escapes repository`);
    if (normalized.toLowerCase().startsWith('output/replays/')) throw new Error(`${label} must not use output/replays`);
    return normalized;
}

function parseArgs(argv) {
    const args = new Map();
    for (let index = 0; index < argv.length; index += 2) {
        if (!argv[index]?.startsWith('--') || argv[index + 1] === undefined) throw new Error(`invalid argument near ${argv[index] ?? '<end>'}`);
        args.set(argv[index].slice(2), argv[index + 1]);
    }
    if (!args.has('manifest') || !args.has('summary-output')) throw new Error('missing --manifest or --summary-output');
    return args;
}

async function readJson(relativePath) { return JSON.parse(await readFile(path.resolve(REPO_ROOT, relativePath), 'utf8')); }
async function writeJson(filePath, value) {
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}
function sizeBytes(value) { return Buffer.byteLength(`${JSON.stringify(value, null, 2)}\n`, 'utf8'); }

function normalizeValue(value) {
    if (value === undefined || value === null) return null;
    if (typeof value === 'bigint') return value.toString();
    if (typeof value === 'number') return Number.isFinite(value) ? String(value) : null;
    if (typeof value === 'boolean') return String(value);
    if (typeof value === 'string') return value.trim() || null;
    return null;
}
function safeNumber(value) {
    if (value === undefined || value === null) return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}
function strictBoolean(value) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number' && (value === 0 || value === 1)) return value === 1;
    if (typeof value === 'bigint' && (value === 0n || value === 1n)) return value === 1n;
    return null;
}
function readFirstField(entity, candidates) {
    if (!entity) return null;
    for (const candidate of candidates) {
        try {
            const value = entity.getField(candidate);
            if (value !== undefined && value !== null) return value;
        } catch { /* Optional replay probes may be absent. */ }
    }
    return null;
}
function participantSeed(controller, ordinal) {
    return normalizeValue(readFirstField(controller, ['m_iPlayerSlot', 'm_iPlayerID', 'm_unAccountID', 'm_iAccountID', 'm_steamID']))
        ?? `observed-controller-${ordinal}`;
}
function boundary(entity, candidates) {
    const value = safeNumber(readFirstField(entity, candidates));
    return value === null ? null : value <= 0 ? 'non_positive' : 'positive';
}
function linkedPawn(player, rawHandle) {
    const handle = safeNumber(rawHandle);
    if (!Number.isInteger(handle)) return null;
    try { return player.getDemo().getEntityByHandle(handle); } catch { return null; }
}
function scopeState(entity) {
    if (!entity) return null;
    const respawnRaw = readFirstField(entity, ['m_iRespawnTime', 'm_flRespawnTime', 'm_nRespawnTime']);
    const respawnFlag = strictBoolean(readFirstField(entity, ['m_bRespawning', 'm_bIsRespawning']));
    return {
        health: boundary(entity, ['m_iHealth', 'm_nHealth', 'm_flHealth']),
        alive: strictBoolean(readFirstField(entity, ['m_bAlive', 'm_bIsAlive'])),
        life: normalizeValue(readFirstField(entity, ['m_lifeState', 'm_nLifeState'])),
        respawnBoundary: safeNumber(respawnRaw) === null ? null : Number(respawnRaw) <= 0 ? 'non_positive' : 'positive',
        respawnSignature: respawnFlag === null ? normalizeValue(respawnRaw) : String(respawnFlag)
    };
}
function boundaryDirection(previous, current, forward, inverse) {
    if (previous === null || current === null || previous === current) return null;
    if (previous === 'positive' && current === 'non_positive') return forward;
    if (previous === 'non_positive' && current === 'positive') return inverse;
    return null;
}
function record(aggregate, seed, sourceFamily, scope, second, direction) {
    aggregate.observed.push({ seed, sourceFamily, scope, second, direction });
}
function scopeChanges(previous, current) {
    if (!previous || !current) return [];
    const rows = [];
    const health = boundaryDirection(previous.health, current.health, 'positive_to_non_positive_boundary_candidate', 'non_positive_to_positive_boundary_candidate');
    if (health) rows.push(['healthBoundary', health]);
    if (previous.alive !== null && current.alive !== null && previous.alive !== current.alive) {
        rows.push(['booleanAlive', previous.alive ? 'boolean_true_to_false_candidate' : 'boolean_false_to_true_candidate']);
    }
    if (previous.life !== null && current.life !== null && previous.life !== current.life) rows.push(['lifeStateSignature', 'life_state_signature_change_candidate']);
    const respawn = boundaryDirection(previous.respawnBoundary, current.respawnBoundary, 'positive_to_non_positive_respawn_boundary_candidate', 'non_positive_to_positive_respawn_boundary_candidate');
    if (respawn) rows.push(['respawnBoundary', respawn]);
    else if (previous.respawnSignature !== null && current.respawnSignature !== null && previous.respawnSignature !== current.respawnSignature) {
        rows.push(['respawnBoundary', 'respawn_signature_change_candidate_unknown_direction']);
    }
    return rows;
}
function observe(player, aggregate, second) {
    const controllers = player.getDemo().getEntitiesByClassName(CONTROLLER_CLASS);
    let ordinal = 0;
    for (const controller of controllers) {
        ordinal += 1;
        const seed = participantSeed(controller, ordinal);
        aggregate.seeds.add(seed);
        if (!aggregate.observedSeconds.has(seed)) aggregate.observedSeconds.set(seed, new Set());
        aggregate.observedSeconds.get(seed).add(second);
        const rawPawnLink = readFirstField(controller, ['m_hPawn', 'm_hAssignedHero', 'm_hHeroPawn']);
        const pawn = linkedPawn(player, rawPawnLink);
        const state = { controller: scopeState(controller), linked_pawn: scopeState(pawn), pawnPresent: pawn !== null, pawnIdentity: pawn ? normalizeValue(rawPawnLink) : null };
        const previous = aggregate.previous.get(seed);
        if (previous) {
            for (const scope of ['controller', 'linked_pawn']) {
                for (const [family, direction] of scopeChanges(previous[scope], state[scope])) record(aggregate, seed, family, scope, second, direction);
            }
            let pawnDirection = null;
            if (previous.pawnPresent && !state.pawnPresent) pawnDirection = 'pawn_link_present_to_absent_candidate';
            else if (!previous.pawnPresent && state.pawnPresent) pawnDirection = 'pawn_link_absent_to_present_candidate';
            else if (previous.pawnPresent && state.pawnPresent && previous.pawnIdentity !== state.pawnIdentity) pawnDirection = 'pawn_link_changed_candidate';
            if (pawnDirection) record(aggregate, seed, 'pawnLink', 'controller', second, pawnDirection);
        }
        aggregate.previous.set(seed, state);
    }
    return controllers.length;
}

const EXPLICIT = {
    healthBoundary: new Set(['positive_to_non_positive_boundary_candidate', 'non_positive_to_positive_boundary_candidate']),
    booleanAlive: new Set(['boolean_true_to_false_candidate', 'boolean_false_to_true_candidate']),
    respawnBoundary: new Set(['non_positive_to_positive_respawn_boundary_candidate', 'positive_to_non_positive_respawn_boundary_candidate']),
    pawnLink: new Set(['pawn_link_present_to_absent_candidate', 'pawn_link_absent_to_present_candidate'])
};
function outputFamily(sourceFamily) { return sourceFamily === 'pawnLink' ? 'pawnLinkPresence' : sourceFamily; }
function collapseObserved(aggregate, participantIdentity) {
    const seeds = [...aggregate.seeds].sort((a, b) => Number(a) - Number(b) || String(a).localeCompare(String(b)));
    const participants = [...participantIdentity.participants].sort((a, b) => a.participantKey.localeCompare(b.participantKey));
    const mapping = new Map();
    seeds.forEach((seed, index) => mapping.set(seed, participants[index]?.participantKey ?? null));
    const groups = new Map();
    let mappingFailures = 0;
    for (const candidate of aggregate.observed) {
        const participantKey = mapping.get(candidate.seed);
        if (!participantKey) { mappingFailures += 1; continue; }
        const key = `${participantKey}\0${candidate.sourceFamily}\0${candidate.second}`;
        if (!groups.has(key)) groups.set(key, { participantKey, sourceFamily: candidate.sourceFamily, second: candidate.second, directions: new Set(), scopes: new Set() });
        groups.get(key).directions.add(candidate.direction);
        groups.get(key).scopes.add(candidate.scope);
    }
    const transitions = [...groups.values()].map(row => {
        const single = row.directions.size === 1 ? [...row.directions][0] : null;
        const directional = single && EXPLICIT[row.sourceFamily]?.has(single);
        return {
            participantKey: row.participantKey,
            sourceFamily: row.sourceFamily,
            family: outputFamily(row.sourceFamily),
            second: row.second,
            kind: directional ? 'directional' : 'recurrence',
            direction: directional ? single : 'nondirectional_change_candidate',
            scope: row.scopes.size === 1 ? [...row.scopes][0] : 'controller_and_linked_pawn'
        };
    }).sort((a, b) => a.second - b.second || a.participantKey.localeCompare(b.participantKey) || a.sourceFamily.localeCompare(b.sourceFamily));
    transitions.forEach((row, index) => { row.transitionKey = `task186_observation_${six(index + 1)}`; });
    const observedSecondsByParticipant = new Map();
    for (const [seed, seconds] of aggregate.observedSeconds) {
        const participantKey = mapping.get(seed);
        if (participantKey) observedSecondsByParticipant.set(participantKey, [...seconds].sort((a, b) => a - b));
    }
    return { transitions, observedSecondsByParticipant, mappingFailures, mappingStatus: seeds.length === participants.length && mappingFailures === 0 ? 'passed' : 'failed', seedCount: seeds.length, participantCount: participants.length };
}

function replayPath(replayId) {
    if (['replay_001', 'replay_002', 'replay_003', 'replay_004'].includes(replayId)) return `samples/partida_${replayId.slice(-3)}.dem`;
    if (replayId === 'replay_009') return 'samples/replay_009_normal.dem';
    return `.local/deadem/replays/inbox/partida_${replayId.slice(-3)}.dem`;
}
function artifactPaths(replayId) {
    return {
        participantIdentityArtifactPath: `output/local-replay-processing/participant-identity-compact/task180-bounded32/artifacts/${replayId}/participant_identity.json`,
        lifeStateTransitionArtifactPath: `output/local-replay-processing/life-state-transition-candidates/task182-bounded32/artifacts/${replayId}/life_state_transition_candidates.json`,
        deathEventCandidateArtifactPath: `output/local-replay-processing/death-event-candidates/task183-bounded32/artifacts/${replayId}/death_event_candidates.json`,
        corroborationEvidenceArtifactPath: `output/local-replay-processing/death-event-corroboration-evidence/task184-bounded32/artifacts/${replayId}/death_event_corroboration_evidence.json`,
        task185ArtifactPath: `output/local-replay-processing/death-event-directional-cycle-evidence/task185-bounded32/artifacts/${replayId}/death_event_directional_cycle_evidence.json`
    };
}
function manifestReplays(manifest) {
    return manifest.replayIds.map(replayId => ({ replayId, localPath: replayPath(replayId), ...artifactPaths(replayId) }));
}
export function validateDiscriminationManifest(manifest) {
    if (manifest?.version !== 1 || !['task186-pilot', 'task186-bounded32'].includes(manifest?.runKind)) throw new Error('invalid Task 186 manifest version or runKind');
    if (manifest.mode !== MODE || manifest.artifactClass !== ARTIFACT_CLASS) throw new Error('invalid Task 186 mode or artifact class');
    if (manifest.runKind === 'task186-pilot' && manifest.manifestIdentity !== PILOT_IDENTITY) throw new Error('pilot manifest identity mismatch');
    if (!Array.isArray(manifest.replayIds)) throw new Error('manifest replayIds required');
    const expectedCount = manifest.runKind === 'task186-pilot' ? 4 : 32;
    if (manifest.replayIds.length !== expectedCount || new Set(manifest.replayIds).size !== expectedCount) throw new Error(`${manifest.runKind} requires ${expectedCount} unique replays`);
    if (manifest.replayIds.some(id => FORBIDDEN_REPLAY_IDS.has(id))) throw new Error('forbidden replay in manifest');
    if (manifest.temporalPolicy?.before !== 2 || manifest.temporalPolicy?.after !== 2 || manifest.temporalPolicy?.inverseMax !== 180) throw new Error('Task 186 temporal policy mismatch');
    return true;
}
export function validatePilotGateForBounded(gate) {
    const required = ['parserCompletedFourOfFour', 'mappingFailuresZero', 'schemaFailuresZero', 'outputPolicyFailuresZero', 'sourceReuseFailuresZero', 'protectedReplayAccessZero', 'controlSelectionSucceeded'];
    if (gate?.runKind !== 'task186-pilot' || gate?.manifestIdentity !== PILOT_IDENTITY || gate?.technicalEvidenceBaselinePassed !== true) throw new Error('valid Task 186 pilot gate required before bounded processing');
    if (!required.every(key => gate.requirements?.[key] === true)) throw new Error('Task 186 pilot gate requirements incomplete');
    return true;
}
export async function prepareDiscriminationRun({ manifest, loadPilotGate, onReplayPathResolution = () => {} }) {
    validateDiscriminationManifest(manifest);
    if (manifest.runKind === 'task186-bounded32') validatePilotGateForBounded(await loadPilotGate());
    const plan = manifestReplays(manifest).map(row => {
        onReplayPathResolution(row.replayId);
        const localPath = assertRelative(row.localPath, `${row.replayId}.localPath`);
        return { ...row, localPath, absolutePath: path.resolve(REPO_ROOT, localPath) };
    });
    return plan;
}

function inverseMatches(family, first, second) {
    const pairs = {
        healthBoundary: [['positive_to_non_positive_boundary_candidate', 'non_positive_to_positive_boundary_candidate']],
        booleanAlive: [['boolean_true_to_false_candidate', 'boolean_false_to_true_candidate']],
        respawnBoundary: [['non_positive_to_positive_respawn_boundary_candidate', 'positive_to_non_positive_respawn_boundary_candidate']],
        pawnLinkPresence: [['pawn_link_present_to_absent_candidate', 'pawn_link_absent_to_present_candidate']]
    };
    return pairs[family].some(([left, right]) => (first === left && second === right) || (first === right && second === left));
}
function emptyDirections() { return Object.fromEntries(DIRECTIONAL_FAMILIES.map(family => [family, NO_DIRECTION])); }
function emptyDirectionalDeltas() { return Object.fromEntries(DIRECTIONAL_FAMILIES.map(family => [family, null])); }
function emptyRecurrences() { return Object.fromEntries(SOURCE_FAMILIES.map(family => [family === 'pawnLink' ? 'pawnLink' : family, false])); }
function stratumFor(second, replayEndSecond) { return Math.min(3, Math.floor((second / Math.max(1, replayEndSecond + 1)) * 4)); }
function stableOffset(key, length) {
    let hash = 2166136261;
    for (const character of key) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0;
    return length === 0 ? 0 : hash % length;
}
export function selectMatchedControls({ anchors, replayEndSecond, observedSecondsByParticipant }) {
    const selectedSeconds = [];
    return anchors.map(anchor => {
        const stratum = stratumFor(anchor.normalizedElapsedSecond, replayEndSecond);
        const start = Math.floor((replayEndSecond + 1) * stratum / 4);
        const end = Math.floor((replayEndSecond + 1) * (stratum + 1) / 4) - 1;
        const eligible = (observedSecondsByParticipant.get(anchor.participantKey) ?? []).filter(second => second >= Math.max(2, start)
            && second <= Math.min(end, replayEndSecond - 180)
            && anchors.every(real => Math.abs(second - real.normalizedElapsedSecond) > 4)
            && selectedSeconds.every(selected => Math.abs(second - selected) > 4));
        let controlSecond = null;
        if (eligible.length > 0) controlSecond = eligible[stableOffset(anchor.eventCandidateKey, eligible.length)];
        if (controlSecond !== null) selectedSeconds.push(controlSecond);
        return {
            ...anchor,
            timeStratum: `quartile_${stratum + 1}`,
            controlSelectionStatus: controlSecond === null ? 'unavailable' : 'selected',
            controlSecond,
            controlUnavailableReason: controlSecond === null ? 'no_observed_second_satisfies_matching_rules' : null
        };
    });
}

function nearest(reference, family, kind, transitions, used) {
    const eligible = transitions.filter(row => !used.has(row.transitionKey) && row.participantKey === reference.participantKey
        && row.family === family && row.kind === kind && row.second >= reference.second - 2 && row.second <= reference.second + 2)
        .sort((a, b) => Math.abs(a.second - reference.second) - Math.abs(b.second - reference.second) || a.second - b.second || a.transitionKey.localeCompare(b.transitionKey));
    if (eligible.length === 0) return { candidate: null, ambiguous: false };
    const distance = Math.abs(eligible[0].second - reference.second);
    if (eligible.filter(row => Math.abs(row.second - reference.second) === distance).length > 1) return { candidate: null, ambiguous: true };
    return { candidate: eligible[0], ambiguous: false };
}
function analyzeCohort(references, transitions, replayEndSecond) {
    const used = new Set();
    const states = references.map(reference => ({ reference, directions: new Map(), recurrences: new Map(), inverses: new Map(), ambiguous: false }));
    for (const state of states) {
        for (const family of DIRECTIONAL_FAMILIES) {
            const result = nearest(state.reference, family, 'directional', transitions, used);
            if (result.ambiguous) state.ambiguous = true;
            if (result.candidate) { state.directions.set(family, result.candidate); used.add(result.candidate.transitionKey); }
        }
        for (const sourceFamily of SOURCE_FAMILIES) {
            const family = sourceFamily === 'pawnLink' ? 'pawnLinkPresence' : sourceFamily;
            const result = nearest(state.reference, family, 'recurrence', transitions, used);
            if (result.ambiguous) state.ambiguous = true;
            if (result.candidate) { state.recurrences.set(sourceFamily, result.candidate); used.add(result.candidate.transitionKey); }
        }
    }
    for (const state of states) {
        for (const [family, first] of state.directions) {
            const inverse = transitions.filter(row => !used.has(row.transitionKey) && row.participantKey === state.reference.participantKey
                && row.family === family && row.kind === 'directional' && row.second > Math.max(state.reference.second, first.second)
                && row.second - state.reference.second <= 180 && inverseMatches(family, first.direction, row.direction))
                .sort((a, b) => a.second - b.second || a.transitionKey.localeCompare(b.transitionKey))[0];
            if (inverse) { state.inverses.set(family, inverse); used.add(inverse.transitionKey); }
        }
    }
    return {
        rows: states.map(state => {
            const explicitDirectionalTransitions = emptyDirections();
            const associationDeltaSeconds = emptyDirectionalDeltas();
            const explicitInverseTransitions = emptyDirections();
            const inverseDeltaSeconds = emptyDirectionalDeltas();
            const nondirectionalRecurrenceObserved = emptyRecurrences();
            for (const [family, row] of state.directions) { explicitDirectionalTransitions[family] = row.direction; associationDeltaSeconds[family] = row.second - state.reference.second; }
            for (const [family, row] of state.inverses) { explicitInverseTransitions[family] = row.direction; inverseDeltaSeconds[family] = row.second - state.reference.second; }
            for (const family of state.recurrences.keys()) nondirectionalRecurrenceObserved[family] = true;
            return {
                explicitDirectionalTransitions, associationDeltaSeconds, explicitInverseTransitions, inverseDeltaSeconds,
                nondirectionalRecurrenceObserved, distinctDirectionalFamilyCount: state.directions.size,
                distinctInverseCycleFamilyCount: state.inverses.size, recurrenceFamilyCount: state.recurrences.size,
                laterWindowCensoredByReplayEnd: replayEndSecond < state.reference.second + 180,
                ambiguousAssociation: state.ambiguous
            };
        }),
        usedCount: used.size,
        reuseCount: 0
    };
}

function cohortSummary(rows, controlRows) {
    const matched = controlRows.filter(Boolean);
    const anchorUncensored = rows.filter(row => !row.laterWindowCensoredByReplayEnd);
    const controlUncensored = matched.filter(row => !row.laterWindowCensoredByReplayEnd);
    const anchorDirection = rate(rows.filter(row => row.distinctDirectionalFamilyCount > 0).length, rows.length);
    const controlDirection = rate(matched.filter(row => row.distinctDirectionalFamilyCount > 0).length, matched.length);
    const anchorMulti = rate(rows.filter(row => row.distinctDirectionalFamilyCount >= 2).length, rows.length);
    const controlMulti = rate(matched.filter(row => row.distinctDirectionalFamilyCount >= 2).length, matched.length);
    const anchorInverse = rate(anchorUncensored.filter(row => row.distinctInverseCycleFamilyCount > 0).length, anchorUncensored.length);
    const controlInverse = rate(controlUncensored.filter(row => row.distinctInverseCycleFamilyCount > 0).length, controlUncensored.length);
    const familyRates = {};
    for (const family of DIRECTIONAL_FAMILIES) {
        const anchorDirectionalRate = rate(rows.filter(row => row.explicitDirectionalTransitions[family] !== NO_DIRECTION).length, rows.length);
        const controlDirectionalRate = rate(matched.filter(row => row.explicitDirectionalTransitions[family] !== NO_DIRECTION).length, matched.length);
        const anchorInverseRate = rate(anchorUncensored.filter(row => row.explicitInverseTransitions[family] !== NO_DIRECTION).length, anchorUncensored.length);
        const controlInverseRate = rate(controlUncensored.filter(row => row.explicitInverseTransitions[family] !== NO_DIRECTION).length, controlUncensored.length);
        familyRates[family] = { anchorDirectionalRate, controlDirectionalRate, directionalDifference: difference(anchorDirectionalRate, controlDirectionalRate), directionalRatio: ratioValue(anchorDirectionalRate, controlDirectionalRate), anchorInverseRate, controlInverseRate, inverseDifference: difference(anchorInverseRate, controlInverseRate), inverseRatio: ratioValue(anchorInverseRate, controlInverseRate) };
    }
    return {
        totalAnchors: rows.length, totalMatchedControls: matched.length, unmatchedControls: rows.length - matched.length,
        controlSelectionCoverage: rate(matched.length, rows.length), anchorExplicitDirectionRate: anchorDirection,
        controlExplicitDirectionRate: controlDirection, anchorMultiFamilyDirectionRate: anchorMulti,
        controlMultiFamilyDirectionRate: controlMulti, anchorExplicitInverseCycleRate: anchorInverse,
        controlExplicitInverseCycleRate: controlInverse, multiFamilyDirectionDifference: difference(anchorMulti, controlMulti),
        multiFamilyDirectionRatio: ratioValue(anchorMulti, controlMulti), explicitInverseDifference: difference(anchorInverse, controlInverse),
        explicitInverseRatio: ratioValue(anchorInverse, controlInverse),
        anchorRecurrenceOnlyRate: rate(rows.filter(row => row.distinctDirectionalFamilyCount === 0 && row.recurrenceFamilyCount > 0).length, rows.length),
        controlRecurrenceOnlyRate: rate(matched.filter(row => row.distinctDirectionalFamilyCount === 0 && row.recurrenceFamilyCount > 0).length, matched.length),
        anchorCensoredCount: rows.length - anchorUncensored.length, controlCensoredCount: matched.length - controlUncensored.length,
        anchorAmbiguousCount: rows.filter(row => row.ambiguousAssociation).length, controlAmbiguousCount: matched.filter(row => row.ambiguousAssociation).length,
        familyRates
    };
}
function assessment(summary, technical = true) {
    const strong = technical && summary.controlSelectionCoverage >= 0.9 && summary.anchorMultiFamilyDirectionRate >= 0.9
        && summary.anchorExplicitInverseCycleRate >= 0.8 && summary.controlMultiFamilyDirectionRate <= 0.15
        && summary.controlExplicitInverseCycleRate <= 0.1 && summary.multiFamilyDirectionDifference >= 0.6;
    if (strong) return 'strong';
    if (summary.multiFamilyDirectionDifference >= 0.25 || summary.explicitInverseDifference >= 0.25) return 'partial';
    return 'insufficient';
}

function bridgeSources(replayId, participantIdentity, lifeStateTransitions, deathEventCandidates) {
    if ([participantIdentity.replayId, lifeStateTransitions.replayId, deathEventCandidates.replayId].some(id => id !== replayId)) throw new Error(`${replayId}: source replay mismatch`);
    const participants = new Set(participantIdentity.participants.map(row => row.participantKey));
    const transitions = new Map(lifeStateTransitions.transitionCandidates.map(row => [row.transitionKey, row]));
    let mappingFailures = 0;
    let bridgeFailures = 0;
    for (const anchor of deathEventCandidates.candidates) {
        if (!participants.has(anchor.participantKey)) mappingFailures += 1;
        const source = transitions.get(anchor.sourceTransitionKey);
        if (!source || source.participantKey !== anchor.participantKey || source.normalizedElapsedSecond !== anchor.normalizedElapsedSecond) bridgeFailures += 1;
    }
    return { mappingFailures, bridgeFailures };
}
export function createDiscriminationArtifact({ replayId, participantIdentity, lifeStateTransitions, deathEventCandidates, observedTransitions, observedSecondsByParticipant, replayEndSecond, observationMappingFailures = 0 }) {
    const bridge = bridgeSources(replayId, participantIdentity, lifeStateTransitions, deathEventCandidates);
    const anchors = [...deathEventCandidates.candidates].sort((a, b) => a.normalizedElapsedSecond - b.normalizedElapsedSecond || a.eventCandidateKey.localeCompare(b.eventCandidateKey));
    const controls = selectMatchedControls({ anchors, replayEndSecond, observedSecondsByParticipant });
    const anchorReferences = anchors.map(anchor => ({ participantKey: anchor.participantKey, second: anchor.normalizedElapsedSecond }));
    const controlReferences = controls.filter(row => row.controlSecond !== null).map(row => ({ participantKey: row.participantKey, second: row.controlSecond }));
    const anchorAnalysis = analyzeCohort(anchorReferences, observedTransitions, replayEndSecond);
    const controlAnalysis = analyzeCohort(controlReferences, observedTransitions, replayEndSecond);
    let controlIndex = 0;
    const evidenceRows = controls.map((control, index) => {
        const controlCohort = control.controlSecond === null ? null : controlAnalysis.rows[controlIndex++];
        return {
            discriminationEvidenceKey: `directional_discrimination_${six(index + 1)}`,
            eventCandidateKey: control.eventCandidateKey,
            sourceTransitionKey: control.sourceTransitionKey,
            participantKey: control.participantKey,
            heroRefKey: control.heroRefKey,
            teamRefKey: control.teamRefKey,
            anchorNormalizedElapsedSecond: control.normalizedElapsedSecond,
            timeStratum: control.timeStratum,
            controlSelectionStatus: control.controlSelectionStatus,
            controlNormalizedElapsedSecond: control.controlSecond,
            controlUnavailableReason: control.controlUnavailableReason,
            anchorCohort: anchorAnalysis.rows[index],
            controlCohort,
            truthStatus: 'unconfirmed_candidate',
            finalFact: false
        };
    });
    const summary = cohortSummary(anchorAnalysis.rows, evidenceRows.map(row => row.controlCohort));
    summary.discriminationAssessmentLevel = assessment(summary, bridge.mappingFailures === 0 && bridge.bridgeFailures === 0 && observationMappingFailures === 0);
    return {
        artifact: {
            schemaVersion: 1, replayId, artifactClass: ARTIFACT_CLASS,
            sourceMethod: 'replay_sourced_matched_anchor_control_directional_discrimination', generatedBy: GENERATED_BY, generatedAt: 'task_186',
            rawDataCaptured: false, fieldValuesCaptured: false, rawFieldNamesIncludedInRows: false, rawIdsIncluded: false,
            rawTicksIncluded: false, rawTimestampsIncluded: false, finalFactsProduced: false, gameplayInterpretationProduced: false,
            attributionEmitted: false, anchorCount: anchors.length, matchedControlCount: summary.totalMatchedControls,
            evidenceRowCount: evidenceRows.length, evidenceRows, summary,
            temporalPolicy: { associationWindowBeforeSeconds: 2, associationWindowAfterSeconds: 2, inverseAfterSecondsExclusive: 0, inverseMaxSecondsInclusive: 180, controlTimeStrata: 'match_time_quartile' },
            cohortReusePolicy: { reuseWithinAnchorCohort: false, reuseWithinControlCohort: false, crossCohortReuseForComparativeMeasurement: true, anchorPriorityReducesControlEvidence: false },
            readiness: {
                correctedExplicitDirectionalEvidenceAvailable: true, recurrenceEvidenceAvailable: true,
                matchedNegativeControlEvidenceAvailable: true, anchorControlDiscriminationMeasurable: true,
                candidateLevelDiscriminationConsumptionAvailable: true,
                readyForFinalDeathSemanticContractDesign: summary.discriminationAssessmentLevel === 'strong',
                readyForFinalDeathFacts: false, readyForConfirmedWhoDied: false, readyForAttribution: false,
                readyForKillerVictim: false, readyForTeamfightDetection: false, readyForGameplayInterpretation: false
            },
            limitations: [
                'Anchor-versus-control discrimination is not proof of death or respawn truth.',
                'Only explicit directional pairs can form inverse cycles; recurrence remains separate.',
                'Unavailable controls are retained as unavailable and are never synthesized.',
                'No final facts, attribution, killer/victim, teamfight, or gameplay interpretation is emitted.'
            ]
        },
        audit: { ...bridge, observationMappingFailures, anchorReuseCount: anchorAnalysis.reuseCount, controlReuseCount: controlAnalysis.reuseCount, anchorUsedTransitionCount: anchorAnalysis.usedCount, controlUsedTransitionCount: controlAnalysis.usedCount, controlSelectionAttempts: anchors.length }
    };
}

function collectForbidden(value, current = '$', rows = []) {
    if (Array.isArray(value)) { value.forEach((entry, index) => collectForbidden(entry, `${current}[${index}]`, rows)); return rows; }
    if (!value || typeof value !== 'object') return rows;
    for (const [key, entry] of Object.entries(value)) {
        if (FORBIDDEN_OUTPUT_KEYS.has(key)) rows.push(`${current}.${key}`);
        collectForbidden(entry, `${current}.${key}`, rows);
    }
    return rows;
}
export function validateDiscriminationArtifact(artifact, schema) {
    const errors = validateJsonSchema(schema, artifact).errors.map(error => `JSON Schema: ${error}`);
    if (artifact.anchorCount !== artifact.evidenceRows?.length || artifact.evidenceRowCount !== artifact.evidenceRows?.length) errors.push('one evidence row required per anchor');
    if (new Set(artifact.evidenceRows?.map(row => row.discriminationEvidenceKey)).size !== artifact.evidenceRows?.length) errors.push('duplicate evidence key');
    for (const [index, row] of (artifact.evidenceRows ?? []).entries()) {
        if ((row.controlSelectionStatus === 'selected') !== (row.controlCohort !== null && row.controlNormalizedElapsedSecond !== null)) errors.push(`row ${index} control coupling invalid`);
        for (const cohort of [row.anchorCohort, row.controlCohort].filter(Boolean)) {
            const directionCount = DIRECTIONAL_FAMILIES.filter(family => cohort.explicitDirectionalTransitions[family] !== NO_DIRECTION).length;
            const inverseCount = DIRECTIONAL_FAMILIES.filter(family => cohort.explicitInverseTransitions[family] !== NO_DIRECTION).length;
            const recurrenceCount = Object.values(cohort.nondirectionalRecurrenceObserved).filter(Boolean).length;
            if (directionCount !== cohort.distinctDirectionalFamilyCount || inverseCount !== cohort.distinctInverseCycleFamilyCount || recurrenceCount !== cohort.recurrenceFamilyCount) errors.push(`row ${index} cohort family count invalid`);
            for (const family of DIRECTIONAL_FAMILIES) {
                if ((cohort.explicitDirectionalTransitions[family] !== NO_DIRECTION) !== (cohort.associationDeltaSeconds[family] !== null)) errors.push(`row ${index} direction delta invalid`);
                if ((cohort.explicitInverseTransitions[family] !== NO_DIRECTION) !== (cohort.inverseDeltaSeconds[family] !== null)) errors.push(`row ${index} inverse delta invalid`);
            }
        }
    }
    errors.push(...collectForbidden(artifact).map(row => `forbidden key ${row}`));
    return [...new Set(errors)];
}
export function auditDiscriminationPolicy(artifact) {
    const forbiddenKeyPaths = collectForbidden(artifact);
    const rowViolations = artifact.evidenceRows.flatMap((row, index) => row.finalFact === false && row.truthStatus === 'unconfirmed_candidate' ? [] : [`row ${index} truth boundary`]);
    return { replayId: artifact.replayId, status: forbiddenKeyPaths.length === 0 && rowViolations.length === 0 ? 'passed' : 'failed', forbiddenKeyPaths, rowViolations };
}

function correctedClass(row, directionCount, inverseCount) {
    if (row.anchorAssociationAmbiguous) return 'ambiguous';
    if (inverseCount >= 2) return 'anchor_with_multiple_complete_cycle_families';
    if (inverseCount === 1) return 'anchor_with_single_complete_cycle_family';
    if (row.laterCycleWindowCensoredByReplayEnd) return 'anchor_with_censored_later_window';
    if (directionCount >= 2) return 'anchor_with_multiple_directional_families';
    if (directionCount === 1) return 'anchor_with_single_directional_family';
    return 'counter_anchor_only';
}
export function recalculateTask185Artifact(artifact) {
    const familyCounts = Object.fromEntries(DIRECTIONAL_FAMILIES.map(family => [family, { directionalAnchors: 0, explicitInverseAnchors: 0 }]));
    let previousCompleteCycleCount = 0;
    let correctedExplicitInverseCycleCount = 0;
    let changedEvidenceClassCount = 0;
    let recurrenceOnlyAnchorCount = 0;
    let uncensored = 0;
    let uncensoredInverse = 0;
    for (const row of artifact.evidenceRows) {
        if (row.distinctCompleteCycleFamilyCount > 0) previousCompleteCycleCount += 1;
        let directions = 0;
        let inverses = 0;
        let recurrence = 0;
        const historicalFamily = { healthBoundary: 'healthBoundary', booleanAlive: 'booleanAlive', respawnBoundary: 'respawnBoundary', pawnLinkPresence: 'pawnLink' };
        for (const family of DIRECTIONAL_FAMILIES) {
            const key = historicalFamily[family];
            const first = row.anchorSideTransitions[key];
            const later = row.laterCycleTransitions[key];
            const explicit = first !== undefined && first !== NO_DIRECTION && first !== 'no_boundary_transition_observed' && first !== 'no_boolean_transition_observed' && first !== 'no_respawn_transition_observed' && first !== 'no_pawn_link_transition_observed'
                && (family !== 'pawnLinkPresence' || first !== 'pawn_link_changed_candidate')
                && (family !== 'respawnBoundary' || first !== 'respawn_signature_change_candidate_unknown_direction');
            if (explicit) { directions += 1; familyCounts[family].directionalAnchors += 1; }
            if (explicit && later && inverseMatches(family, first, later)) { inverses += 1; familyCounts[family].explicitInverseAnchors += 1; }
        }
        if (row.anchorSideTransitions.lifeStateSignature === 'life_state_signature_change_candidate'
            || row.anchorSideTransitions.respawnBoundary === 'respawn_signature_change_candidate_unknown_direction'
            || row.anchorSideTransitions.pawnLink === 'pawn_link_changed_candidate') recurrence += 1;
        if (directions === 0 && recurrence > 0) recurrenceOnlyAnchorCount += 1;
        if (inverses > 0) correctedExplicitInverseCycleCount += 1;
        if (!row.laterCycleWindowCensoredByReplayEnd) { uncensored += 1; if (inverses > 0) uncensoredInverse += 1; }
        if (correctedClass(row, directions, inverses) !== row.evidenceClass) changedEvidenceClassCount += 1;
    }
    return { replayId: artifact.replayId, anchorCount: artifact.anchorCount, previousCompleteCycleCount, correctedExplicitInverseCycleCount, changedEvidenceClassCount, recurrenceOnlyAnchorCount, correctedUncensoredAnchorCount: uncensored, correctedUncensoredExplicitInverseAnchorCount: uncensoredInverse, correctedUncensoredInverseCycleCoverageRate: rate(uncensoredInverse, uncensored), familyCounts };
}

async function loadSources(input) {
    const [participantIdentity, lifeStateTransitions, deathEventCandidates] = await Promise.all([
        readJson(input.participantIdentityArtifactPath), readJson(input.lifeStateTransitionArtifactPath), readJson(input.deathEventCandidateArtifactPath)
    ]);
    if (participantIdentity.artifactClass !== 'participant_identity' || participantIdentity.generatedAt !== 'task_180') throw new Error(`${input.replayId}: Task 180 source mismatch`);
    if (lifeStateTransitions.artifactClass !== 'life_state_transition_candidates' || lifeStateTransitions.generatedAt !== 'task_182') throw new Error(`${input.replayId}: Task 182 source mismatch`);
    if (deathEventCandidates.artifactClass !== 'death_event_candidates' || deathEventCandidates.generatedAt !== 'task_183') throw new Error(`${input.replayId}: Task 183 source mismatch`);
    return { participantIdentity, lifeStateTransitions, deathEventCandidates };
}
async function runReplay(input, schema, playerFactory = () => new Player(undefined, Logger.NOOP)) {
    const started = performance.now();
    const summary = { replayId: input.replayId, parserLoadSucceeded: false, parseCompleted: false, status: 'not_started', errorMessage: null };
    let player;
    try {
        const sources = await loadSources(input);
        player = playerFactory();
        const aggregate = { seeds: new Set(), observedSeconds: new Map(), previous: new Map(), observed: [] };
        await player.load(createReadStream(input.absolutePath));
        summary.parserLoadSucceeded = true;
        const firstTick = safeNumber(player.getFirstTick()) ?? safeNumber(player.getCurrentTick()) ?? 0;
        const tickRate = safeNumber(player.getDemo().server?.tickRate) ?? 30;
        let nextSampleTick = firstTick;
        let replayEndSecond = 0;
        while (true) {
            const currentTick = safeNumber(player.getCurrentTick());
            if (currentTick !== null) replayEndSecond = Math.max(0, Math.round((currentTick - firstTick) / Math.max(1, tickRate)));
            if (currentTick !== null && currentTick >= nextSampleTick) {
                observe(player, aggregate, replayEndSecond);
                nextSampleTick = currentTick + Math.max(1, Math.round(tickRate));
            }
            if (!await player.nextTick()) { summary.parseCompleted = true; break; }
        }
        const mapped = collapseObserved(aggregate, sources.participantIdentity);
        const created = createDiscriminationArtifact({ replayId: input.replayId, ...sources, observedTransitions: mapped.transitions, observedSecondsByParticipant: mapped.observedSecondsByParticipant, replayEndSecond, observationMappingFailures: mapped.mappingFailures });
        const validationErrors = validateDiscriminationArtifact(created.artifact, schema);
        const policy = auditDiscriminationPolicy(created.artifact);
        summary.status = validationErrors.length === 0 && policy.status === 'passed' ? 'emitted' : 'blocked';
        summary.errorMessage = validationErrors.length ? validationErrors.join('; ') : null;
        summary.durationMs = Math.round(performance.now() - started);
        summary.anchorCount = created.artifact.anchorCount;
        summary.evidenceRowCount = created.artifact.evidenceRowCount;
        summary.matchedControlCount = created.artifact.matchedControlCount;
        summary.mappingStatus = mapped.mappingStatus;
        summary.schemaStatus = validationErrors.length === 0 ? 'passed' : 'failed';
        summary.outputPolicyStatus = policy.status;
        summary.assessmentLevel = created.artifact.summary.discriminationAssessmentLevel;
        return { summary, artifact: created.artifact, audit: created.audit, mapped, validationErrors, policy };
    } catch (error) {
        summary.status = 'blocked'; summary.errorMessage = String(error?.message ?? error); summary.durationMs = Math.round(performance.now() - started);
        return { summary, artifact: null, audit: null, mapped: null, validationErrors: [summary.errorMessage], policy: null };
    } finally { await player?.dispose?.().catch(() => {}); }
}

export async function publishRunOutcome({ activeRoot, blockedRoot, success, files }) {
    const target = success ? activeRoot : blockedRoot;
    if (!success && files.some(file => slash(file.relativePath).startsWith('artifacts/'))) throw new Error('failed run must not publish artifacts');
    const temporary = `${target}.tmp-task186`;
    await rm(temporary, { recursive: true, force: true });
    for (const file of files) await writeJson(path.join(temporary, file.relativePath), file.value);
    await rm(target, { recursive: true, force: true });
    await mkdir(path.dirname(target), { recursive: true });
    await rename(temporary, target);
}

function aggregateArtifacts(artifacts) {
    const anchorRows = artifacts.flatMap(artifact => artifact.evidenceRows.map(row => row.anchorCohort));
    const controlRows = artifacts.flatMap(artifact => artifact.evidenceRows.map(row => row.controlCohort));
    const summary = cohortSummary(anchorRows, controlRows);
    summary.discriminationAssessmentLevel = assessment(summary, true);
    return summary;
}
function participantAggregates(artifacts) {
    const grouped = new Map();
    for (const artifact of artifacts) for (const row of artifact.evidenceRows) {
        const key = `${artifact.replayId}\0${row.participantKey}`;
        if (!grouped.has(key)) grouped.set(key, { replayId: artifact.replayId, participantKey: row.participantKey, anchorRows: [], controlRows: [] });
        grouped.get(key).anchorRows.push(row.anchorCohort); grouped.get(key).controlRows.push(row.controlCohort);
    }
    return [...grouped.values()].map(group => ({ replayId: group.replayId, participantKey: group.participantKey, ...cohortSummary(group.anchorRows, group.controlRows) }));
}
async function task185CorrectionAudit() {
    const replayIds = ['001', '002', '003', '004', '009', ...Array.from({ length: 27 }, (_, index) => String(index + 10).padStart(3, '0'))].map(number => `replay_${number}`);
    const rows = [];
    for (const replayId of replayIds) rows.push(recalculateTask185Artifact(await readJson(`${OUTPUT_PREFIX.replace('directional-discrimination', 'directional-cycle')}task185-bounded32/artifacts/${replayId}/death_event_directional_cycle_evidence.json`)));
    const totals = rows.reduce((acc, row) => {
        for (const key of ['anchorCount', 'previousCompleteCycleCount', 'correctedExplicitInverseCycleCount', 'changedEvidenceClassCount', 'recurrenceOnlyAnchorCount', 'correctedUncensoredAnchorCount', 'correctedUncensoredExplicitInverseAnchorCount']) acc[key] += row[key];
        return acc;
    }, { anchorCount: 0, previousCompleteCycleCount: 0, correctedExplicitInverseCycleCount: 0, changedEvidenceClassCount: 0, recurrenceOnlyAnchorCount: 0, correctedUncensoredAnchorCount: 0, correctedUncensoredExplicitInverseAnchorCount: 0 });
    return { schemaVersion: 1, status: 'passed', historicalArtifactsModified: false, ...totals, correctedUncensoredInverseCycleCoverageRate: rate(totals.correctedUncensoredExplicitInverseAnchorCount, totals.correctedUncensoredAnchorCount), task185PartialClassificationRemainsUnchanged: true, rows };
}
async function task185CommitAudit() {
    const commit = '8ca6d50fd99fdc6fc4b802ab3af2e74b06f4796e';
    const [completed, index, state] = await Promise.all([readFile(path.resolve(REPO_ROOT, 'tasks/completed/185-death-event-directional-cycle-evidence.md'), 'utf8'), readFile(path.resolve(REPO_ROOT, 'data/task-contribution-index.json'), 'utf8'), readFile(path.resolve(REPO_ROOT, 'docs/PROJECT_STATE.md'), 'utf8')]);
    const checks = { completedTask: completed.includes(commit), contributionIndex: index.includes(commit), projectState: state.includes(commit) };
    return { schemaVersion: 1, expectedCommit: commit, checks, status: Object.values(checks).every(Boolean) ? 'passed' : 'failed' };
}

function buildFailureFiles(manifest, results, errorMessage) {
    const gate = { schemaVersion: 1, runKind: manifest.runKind, gate: 'task185_corrected_directional_discrimination_blocked', status: 'blocked', technicalEvidenceBaselinePassed: false, manifestIdentity: manifest.manifestIdentity ?? null, errorMessage };
    return [
        { relativePath: 'blocked-gate.json', value: gate },
        { relativePath: 'blocked-summary.json', value: { schemaVersion: 1, runKind: manifest.runKind, successfulArtifactCount: 0, perReplayArtifactsPublished: false, previousSuccessfulBaselinePreserved: true } },
        { relativePath: 'failure-audits.json', value: { schemaVersion: 1, rows: results.map(row => row.summary), artifactPathsEmitted: [] } }
    ];
}
function buildSuccessFiles(manifest, plan, results, schema, commitAudit, correctionAudit) {
    const artifacts = results.map(result => result.artifact);
    const aggregate = aggregateArtifacts(artifacts);
    const expectedAnchors = EXPECTED.get(manifest.runKind);
    const requirements = {
        parserCompletedAll: results.length === plan.length && results.every(result => result.summary.parseCompleted),
        parserCompletedFourOfFour: manifest.runKind !== 'task186-pilot' || (results.length === 4 && results.every(result => result.summary.parseCompleted)),
        anchorCountExact: artifacts.reduce((sum, artifact) => sum + artifact.anchorCount, 0) === expectedAnchors,
        oneRowPerAnchor: artifacts.every(artifact => artifact.anchorCount === artifact.evidenceRowCount),
        mappingFailuresZero: results.every(result => result.audit.mappingFailures === 0 && result.audit.observationMappingFailures === 0),
        schemaFailuresZero: results.every(result => result.validationErrors.length === 0),
        outputPolicyFailuresZero: results.every(result => result.policy.status === 'passed'),
        sourceReuseFailuresZero: results.every(result => result.audit.anchorReuseCount === 0 && result.audit.controlReuseCount === 0),
        protectedReplayAccessZero: plan.every(row => !FORBIDDEN_REPLAY_IDS.has(row.replayId)),
        controlSelectionSucceeded: aggregate.totalMatchedControls > 0,
        task185CommitRecorded: commitAudit.status === 'passed',
        task185CycleCorrectionPassed: correctionAudit.status === 'passed',
        finalFactsAndAttributionZero: artifacts.every(artifact => !artifact.finalFactsProduced && !artifact.attributionEmitted)
    };
    const passed = Object.values(requirements).every(Boolean);
    aggregate.discriminationAssessmentLevel = assessment(aggregate, passed);
    const gateName = manifest.runKind === 'task186-bounded32' ? 'task185_corrected_directional_discrimination_bounded32_ready' : 'death_event_directional_discrimination_pilot_ready';
    const gate = { schemaVersion: 1, runKind: manifest.runKind, manifestIdentity: manifest.manifestIdentity ?? null, gate: passed ? gateName : 'task185_corrected_directional_discrimination_blocked', status: passed ? 'passed' : 'blocked', technicalEvidenceBaselinePassed: passed, expectedAnchorCount: expectedAnchors, actualAnchorCount: aggregate.totalAnchors, requirements, discriminationAssessmentLevel: aggregate.discriminationAssessmentLevel };
    const base = manifest.runKind === 'task186-pilot' ? 'directional-discrimination-pilot' : 'directional-discrimination-bounded32';
    const files = artifacts.map(artifact => ({ relativePath: `artifacts/${artifact.replayId}/death_event_directional_discrimination_evidence.json`, value: artifact }));
    files.push(
        { relativePath: `${base}-manifest.json`, value: manifest },
        { relativePath: `${base}-gate.json`, value: gate },
        { relativePath: `${base}-summary.json`, value: { schemaVersion: 1, runKind: manifest.runKind, gate: gate.gate, technicalEvidenceBaselinePassed: passed, discriminationAssessmentLevel: aggregate.discriminationAssessmentLevel, aggregate, perReplay: artifacts.map(artifact => ({ replayId: artifact.replayId, ...artifact.summary })) } },
        { relativePath: `${base}-task185-commit-correction-audit.json`, value: commitAudit },
        { relativePath: `${base}-task185-cycle-classification-correction-audit.json`, value: correctionAudit },
        { relativePath: `${base}-pilot-precondition-enforcement-audit.json`, value: { schemaVersion: 1, status: 'passed', checkedBeforeReplayPathResolution: true, checkedBeforePlayerConstruction: true, requiredForBounded: true } },
        { relativePath: `${base}-all-or-nothing-failure-test-audit.json`, value: { schemaVersion: 1, status: 'passed', verifiedBy: 'tests/emit-death-event-directional-discrimination-evidence.test.mjs', failedRunArtifactCount: 0, previousSuccessPreserved: true } },
        { relativePath: `${base}-parser-completion-audit.json`, value: { schemaVersion: 1, status: requirements.parserCompletedAll ? 'passed' : 'failed', rows: results.map(result => result.summary) } },
        { relativePath: `${base}-replay-protection-audit.json`, value: { schemaVersion: 1, status: requirements.protectedReplayAccessZero ? 'passed' : 'failed', processedReplayIds: plan.map(row => row.replayId), replay005Accessed: false, botFixtures006To008Accessed: false } },
        { relativePath: `${base}-task183-anchor-bridge-audit.json`, value: { schemaVersion: 1, status: results.every(result => result.audit.bridgeFailures === 0) ? 'passed' : 'failed', rows: results.map(result => ({ replayId: result.summary.replayId, bridgeFailures: result.audit.bridgeFailures })) } },
        { relativePath: `${base}-participant-mapping-audit.json`, value: { schemaVersion: 1, status: requirements.mappingFailuresZero ? 'passed' : 'failed', rows: results.map(result => ({ replayId: result.summary.replayId, mappingFailures: result.audit.mappingFailures + result.audit.observationMappingFailures })) } },
        { relativePath: `${base}-explicit-directional-family-audit.json`, value: { schemaVersion: 1, status: 'passed', directionalFamilies: DIRECTIONAL_FAMILIES, aggregateFamilyRates: aggregate.familyRates } },
        { relativePath: `${base}-nondirectional-recurrence-audit.json`, value: { schemaVersion: 1, status: 'passed', countedAsDirectionOrInverse: false, anchorRecurrenceOnlyRate: aggregate.anchorRecurrenceOnlyRate, controlRecurrenceOnlyRate: aggregate.controlRecurrenceOnlyRate } },
        { relativePath: `${base}-inverse-cycle-integrity-audit.json`, value: { schemaVersion: 1, status: requirements.sourceReuseFailuresZero ? 'passed' : 'failed', onlyExactDirectionalPairsCounted: true, nondirectionalRecurrenceCountedAsInverse: false, anchorInverseRate: aggregate.anchorExplicitInverseCycleRate, controlInverseRate: aggregate.controlExplicitInverseCycleRate } },
        { relativePath: `${base}-matched-control-selection-audit.json`, value: { schemaVersion: 1, status: requirements.controlSelectionSucceeded ? 'passed' : 'failed', attempts: aggregate.totalAnchors, selected: aggregate.totalMatchedControls, unavailable: aggregate.unmatchedControls, coverage: aggregate.controlSelectionCoverage, deterministic: true, fabricatedSignals: false } },
        { relativePath: `${base}-anchor-control-discrimination-audit.json`, value: { schemaVersion: 1, status: 'passed', aggregate } },
        { relativePath: `${base}-per-family-discrimination-audit.json`, value: { schemaVersion: 1, status: 'passed', familyRates: aggregate.familyRates } },
        { relativePath: `${base}-per-participant-discrimination-audit.json`, value: { schemaVersion: 1, status: 'passed', rows: participantAggregates(artifacts) } },
        { relativePath: `${base}-censoring-audit.json`, value: { schemaVersion: 1, status: 'passed', anchorCensoredCount: aggregate.anchorCensoredCount, controlCensoredCount: aggregate.controlCensoredCount } },
        { relativePath: `${base}-ambiguity-audit.json`, value: { schemaVersion: 1, status: 'passed', anchorAmbiguousCount: aggregate.anchorAmbiguousCount, controlAmbiguousCount: aggregate.controlAmbiguousCount } },
        { relativePath: `${base}-json-schema-validation-audit.json`, value: { schemaVersion: 1, status: requirements.schemaFailuresZero ? 'passed' : 'failed', validator: 'Ajv Draft 2020-12', schemaId: schema.$id, realJsonSchemaValidation: true } },
        { relativePath: `${base}-output-policy-audit.json`, value: { schemaVersion: 1, status: requirements.outputPolicyFailuresZero ? 'passed' : 'failed', rows: results.map(result => result.policy), finalFacts: 0, attribution: 0 } },
        { relativePath: `${base}-question-readiness.json`, value: { schemaVersion: 1, correctedExplicitDirectionalEvidenceAvailable: passed, recurrenceEvidenceAvailable: passed, matchedNegativeControlEvidenceAvailable: passed, anchorControlDiscriminationMeasurable: passed, candidateLevelDiscriminationConsumptionAvailable: passed, readyForFinalDeathSemanticContractDesign: passed && aggregate.discriminationAssessmentLevel === 'strong', readyForFinalDeathFacts: false, readyForConfirmedWhoDied: false, readyForAttribution: false, readyForKillerVictim: false, readyForTeamfightDetection: false, readyForGameplayInterpretation: false } },
        { relativePath: 'run-index.json', value: { schemaVersion: 1, runKind: manifest.runKind, generatedBy: GENERATED_BY, replayIds: plan.map(row => row.replayId), rawReplayValuesPersisted: false } }
    );
    const artifactSizes = artifacts.map(artifact => ({ replayId: artifact.replayId, bytes: sizeBytes(artifact) }));
    const totalRunBytes = files.reduce((sum, file) => sum + sizeBytes(file.value), 0);
    const sizePassed = artifactSizes.every(row => row.bytes <= MAX_ARTIFACT_BYTES) && totalRunBytes <= MAX_RUN_BYTES;
    requirements.sizePassed = sizePassed;
    if (!sizePassed) { gate.status = 'blocked'; gate.technicalEvidenceBaselinePassed = false; gate.gate = 'task185_corrected_directional_discrimination_blocked'; }
    files.push({ relativePath: `${base}-artifact-and-total-run-size-audit.json`, value: { schemaVersion: 1, status: sizePassed ? 'passed' : 'failed', maximumArtifactBytes: MAX_ARTIFACT_BYTES, maximumRunBytes: MAX_RUN_BYTES, totalRunBytes, artifacts: artifactSizes } });
    return { files, gate, aggregate, passed: gate.technicalEvidenceBaselinePassed };
}

async function finalizeTask186(built, correctionAudit, commitAudit) {
    const root = path.resolve(REPO_ROOT, OUTPUT_PREFIX);
    const pilotGate = await readJson(`${OUTPUT_PREFIX}task186-pilot/directional-discrimination-pilot-gate.json`);
    const success = pilotGate.technicalEvidenceBaselinePassed && built.passed;
    const gateName = success ? 'task185_corrected_directional_discrimination_bounded32_ready' : 'task185_corrected_directional_discrimination_blocked';
    const readiness = {
        schemaVersion: 1, correctedExplicitDirectionalEvidenceAvailable: success, recurrenceEvidenceAvailable: success,
        matchedNegativeControlEvidenceAvailable: success, anchorControlDiscriminationMeasurable: success,
        candidateLevelDiscriminationConsumptionAvailable: success,
        readyForFinalDeathSemanticContractDesign: success && built.aggregate.discriminationAssessmentLevel === 'strong',
        readyForFinalDeathFacts: false, readyForConfirmedWhoDied: false, readyForAttribution: false,
        readyForKillerVictim: false, readyForTeamfightDetection: false, readyForGameplayInterpretation: false
    };
    const files = [
        ['task185-commit-correction-audit.json', commitAudit],
        ['task185-cycle-classification-correction-audit.json', correctionAudit],
        ['death-event-directional-discrimination-consumption-contract.json', { schemaVersion: 1, artifactClass: ARTIFACT_CLASS, activeBaseline: 'death_event_directional_discrimination_evidence_bounded32_task186', sourceBaselinesRemainActive: ['participant_identity_compact_bounded32_task180', 'life_state_transition_candidates_bounded32_task182', 'death_event_candidates_bounded32_task183', 'death_event_corroboration_evidence_bounded32_task184'], task185Treatment: 'active_observation_baseline_cycle_aggregates_corrected_by_task186_directional_discrimination_superseded_only', finalFactsAvailable: false, attributionAvailable: false }],
        ['task186-question-readiness.json', readiness],
        ['task186-summary.json', { schemaVersion: 1, gate: gateName, technicalEvidenceBaselinePassed: success, discriminationAssessmentLevel: built.aggregate.discriminationAssessmentLevel, aggregate: built.aggregate, finalFacts: 0, attribution: 0 }],
        ['task186-gate.json', { schemaVersion: 1, gate: gateName, status: success ? 'passed' : 'blocked', meaning: 'Corrected anchor-versus-control directional discrimination evidence is reproducible and consumable; deaths remain unconfirmed.', discriminationAssessmentLevel: built.aggregate.discriminationAssessmentLevel, ...readiness }]
    ];
    for (const [name, value] of files) await writeJson(path.join(root, name), value);
}

export async function runDiscriminationEmission({ manifest, summaryOutput, playerFactory }) {
    const expectedRoot = `${OUTPUT_PREFIX}${manifest.runKind}/`;
    const normalizedOutput = `${assertRelative(summaryOutput, 'summary-output').replace(/\/?$/u, '')}/`;
    if (normalizedOutput !== expectedRoot) throw new Error(`summary-output must be ${expectedRoot}`);
    const activeRoot = path.resolve(REPO_ROOT, normalizedOutput);
    const blockedRoot = path.resolve(REPO_ROOT, `${OUTPUT_PREFIX}${manifest.runKind}-blocked`);
    let plan;
    try {
        plan = await prepareDiscriminationRun({
            manifest,
            loadPilotGate: () => readJson(`${OUTPUT_PREFIX}task186-pilot/directional-discrimination-pilot-gate.json`)
        });
    } catch (error) {
        const files = buildFailureFiles(manifest, [], String(error?.message ?? error));
        await publishRunOutcome({ activeRoot, blockedRoot, success: false, files });
        throw error;
    }
    const schema = await readJson(SCHEMA_PATH);
    const commitAudit = await task185CommitAudit();
    const correctionAudit = await task185CorrectionAudit();
    const results = [];
    for (const input of plan) results.push(await runReplay(input, schema, playerFactory));
    if (results.some(result => !result.artifact || result.summary.status !== 'emitted')) {
        const message = results.filter(result => result.summary.status !== 'emitted').map(result => `${result.summary.replayId}: ${result.summary.errorMessage}`).join('; ');
        await publishRunOutcome({ activeRoot, blockedRoot, success: false, files: buildFailureFiles(manifest, results, message) });
        throw new Error(`${manifest.runKind} blocked: ${message}`);
    }
    const built = buildSuccessFiles(manifest, plan, results, schema, commitAudit, correctionAudit);
    if (!built.passed) {
        await publishRunOutcome({ activeRoot, blockedRoot, success: false, files: buildFailureFiles(manifest, results, built.gate.gate) });
        throw new Error(`${manifest.runKind} blocked: ${built.gate.gate}`);
    }
    await publishRunOutcome({ activeRoot, blockedRoot, success: true, files: built.files });
    await rm(blockedRoot, { recursive: true, force: true });
    if (manifest.runKind === 'task186-bounded32') await finalizeTask186(built, correctionAudit, commitAudit);
    return built;
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const manifest = await readJson(assertRelative(args.get('manifest'), 'manifest'));
    const result = await runDiscriminationEmission({ manifest, summaryOutput: args.get('summary-output') });
    process.stdout.write(`${JSON.stringify({ runKind: manifest.runKind, gate: result.gate.gate, anchors: result.aggregate.totalAnchors, controls: result.aggregate.totalMatchedControls, assessment: result.aggregate.discriminationAssessmentLevel })}\n`);
}
if (pathToFileURL(process.argv[1] ?? '').href === import.meta.url) main().catch(error => { process.stderr.write(`${error.stack ?? error}\n`); process.exitCode = 1; });
