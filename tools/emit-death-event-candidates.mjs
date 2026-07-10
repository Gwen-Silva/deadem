#!/usr/bin/env node
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const THIS_FILE = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(THIS_FILE), '..');
const ARTIFACT_CLASS = 'death_event_candidates';
const MODE = 'death_event_candidates_emission';
const GENERATED_BY = 'tools/emit-death-event-candidates.mjs';
const GENERATED_AT = 'task_183';
const OUTPUT_ROOT_PREFIX = 'output/local-replay-processing/death-event-candidates/';
const SCHEMA_PATH = 'schemas/death-event-candidates.schema.json';
const MAX_ARTIFACT_BYTES = 512 * 1024;
const MAX_RUN_BYTES = 16 * 1024 * 1024;
const PILOT_READY_GATE = 'death_event_candidates_pilot_ready';
const PILOT_BLOCKED_GATE = 'death_event_candidates_pilot_blocked';
const BOUNDED32_READY_GATE = 'death_event_candidates_bounded32_ready';
const BOUNDED32_BLOCKED_GATE = 'death_event_candidates_bounded32_blocked';
const EVENT_COUNT_MEANING = 'source_observed_counter_transition_candidate_count_not_final_death_fact';

export const FORBIDDEN_REPLAY_IDS = new Set(['replay_005', 'replay_006', 'replay_007', 'replay_008']);
export const FORBIDDEN_OUTPUT_KEYS = new Set([
    'playerName',
    'playerNames',
    'heroName',
    'heroNames',
    'teamName',
    'teamNames',
    'entityId',
    'entityIds',
    'rawEntityId',
    'rawEntityIds',
    'handle',
    'handles',
    'controllerHandle',
    'accountId',
    'accountIds',
    'steamId',
    'steamIds',
    'playerSlot',
    'playerSlots',
    'heroId',
    'heroIds',
    'teamNumber',
    'teamNumbers',
    'fieldValues',
    'rawValues',
    'rawTick',
    'rawTicks',
    'rawTimestamp',
    'rawTimestamps',
    'tick',
    'ticks',
    'timestamp',
    'timestamps',
    'position',
    'positions',
    'killer',
    'victim',
    'assist',
    'assists',
    'damageSource',
    'objectiveId',
    'deathFact',
    'deathFacts',
    'confirmedDeath',
    'confirmedDeaths',
    'finalDeath',
    'finalDeaths',
    'deathEvents',
    'respawnEvents',
    'teamfight',
    'teamfights',
    'snapshot',
    'snapshots',
    'entityHistory',
    'entityHistories'
]);

export const FORBIDDEN_SURFACES = [
    'player_names',
    'hero_names',
    'team_names',
    'raw_entity_ids',
    'raw_values',
    'raw_ticks',
    'raw_timestamps',
    'field_values',
    'map_positions',
    'attribution',
    'final_facts',
    'final_death_events',
    'final_respawn_events',
    'gameplay_interpretation'
];

function slash(value) {
    return String(value).replaceAll(path.sep, '/');
}

function assertRelativeRepositoryPath(value, label) {
    if (!value || path.isAbsolute(value)) throw new Error(`${label} must be a relative repository path`);
    const normalized = slash(value);
    if (normalized === '..' || normalized.startsWith('../') || normalized.includes('/../')) {
        throw new Error(`${label} must stay inside the repository`);
    }
    if (normalized.toLowerCase().endsWith('.dem')) throw new Error(`${label} must not reference a replay file`);
    if (normalized.toLowerCase().startsWith('output/replays/')) throw new Error(`${label} must not use output/replays`);
    return normalized;
}

function parseArgs(argv) {
    const args = new Map();
    for (let index = 0; index < argv.length; index += 2) {
        const key = argv[index];
        const value = argv[index + 1];
        if (!key?.startsWith('--') || value === undefined) throw new Error(`Invalid argument near ${key ?? '<end>'}`);
        args.set(key.slice(2), value);
    }
    for (const required of ['manifest', 'summary-output']) {
        if (!args.has(required)) throw new Error(`missing --${required}`);
    }
    return args;
}

async function readJson(relativePath) {
    return JSON.parse(await readFile(path.resolve(REPO_ROOT, relativePath), 'utf8'));
}

async function writeJson(filePath, value) {
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function artifactSizeBytes(value) {
    return Buffer.byteLength(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function sixDigit(index) {
    return String(index).padStart(6, '0');
}

function duplicateCount(values) {
    const seen = new Set();
    let duplicates = 0;
    for (const value of values) {
        if (seen.has(value)) duplicates += 1;
        seen.add(value);
    }
    return duplicates;
}

function collectForbiddenOutputKeys(value, prefix = '') {
    if (Array.isArray(value)) {
        return value.flatMap((item, index) => collectForbiddenOutputKeys(item, `${prefix}[${index}]`));
    }
    if (value === null || typeof value !== 'object') return [];
    const matches = [];
    for (const [key, child] of Object.entries(value)) {
        const current = prefix ? `${prefix}.${key}` : key;
        if (FORBIDDEN_OUTPUT_KEYS.has(key)) matches.push(current);
        matches.push(...collectForbiddenOutputKeys(child, current));
    }
    return matches;
}

export function validateDeathEventManifestShape(manifest) {
    if (typeof manifest !== 'object' || manifest === null || Array.isArray(manifest)) throw new Error('manifest must be an object');
    if (manifest.schemaVersion !== 1) throw new Error('manifest schemaVersion must be 1');
    if (!manifest.manifestId) throw new Error('manifestId is required');
    if (!['task183-pilot', 'task183-bounded32'].includes(manifest.runKind)) throw new Error('manifest runKind is invalid');
    if (manifest.mode !== MODE) throw new Error(`manifest mode must be ${MODE}`);
    if (manifest.artifactClass !== ARTIFACT_CLASS) throw new Error(`manifest artifactClass must be ${ARTIFACT_CLASS}`);
    if (manifest.replayProcessingAllowed !== false) throw new Error('manifest must forbid replay processing');
    if (manifest.replayFileAccessAllowed !== false) throw new Error('manifest must forbid replay file access');
    if (manifest.realArtifactEmissionAllowed !== true) throw new Error('manifest must explicitly allow real artifact emission');
    if (manifest.generationLabel !== GENERATED_AT) throw new Error(`manifest generationLabel must be ${GENERATED_AT}`);
    for (const flag of ['rawDataCaptured', 'fieldValuesCaptured', 'rawTicksIncluded', 'rawTimestampsIncluded', 'finalFactsProduced', 'gameplayInterpretationProduced', 'attributionEmitted']) {
        if (manifest[flag] !== false) throw new Error(`manifest ${flag} must be false`);
    }
    if (!Array.isArray(manifest.allowedReplays) || manifest.allowedReplays.length === 0) throw new Error('manifest allowedReplays must be non-empty');
    if (!Array.isArray(manifest.blockedReplays)) throw new Error('manifest blockedReplays must be an array');
    for (const replayId of FORBIDDEN_REPLAY_IDS) {
        if (!manifest.blockedReplays.includes(replayId)) throw new Error(`manifest blockedReplays must include ${replayId}`);
    }
    if (!Array.isArray(manifest.forbiddenOutputSurfaces)) throw new Error('manifest forbiddenOutputSurfaces must be an array');
    for (const surface of FORBIDDEN_SURFACES) {
        if (!manifest.forbiddenOutputSurfaces.includes(surface)) throw new Error(`manifest forbiddenOutputSurfaces must include ${surface}`);
    }
    return manifest;
}

export function validateDeathEventOutputRoot(summaryOutput, manifest) {
    const normalized = assertRelativeRepositoryPath(summaryOutput, 'summary output').replace(/\/?$/u, '/');
    const expected = `${OUTPUT_ROOT_PREFIX}${manifest.runKind}/`;
    if (normalized !== expected) throw new Error(`summary output root must be exactly ${expected}`);
    return { normalized, absolutePath: path.resolve(REPO_ROOT, normalized) };
}

function normalizeReplay(replay) {
    return {
        replayId: replay?.replayId ?? null,
        selectionGroup: replay?.selectionGroup ?? null,
        participantIdentityArtifactPath: replay?.participantIdentityArtifactPath ?? null,
        lifeStateTransitionArtifactPath: replay?.lifeStateTransitionArtifactPath ?? null,
        requestedMode: replay?.requestedMode ?? replay?.mode ?? MODE
    };
}

function forbiddenReplayReasons(replay) {
    const replayId = String(replay?.replayId ?? '');
    const paths = [replay?.participantIdentityArtifactPath, replay?.lifeStateTransitionArtifactPath]
        .filter(Boolean)
        .map(value => slash(value).toLowerCase());
    const reasons = [];
    if (FORBIDDEN_REPLAY_IDS.has(replayId)) reasons.push(`${replayId}_globally_blocked`);
    for (const value of paths) {
        if (path.isAbsolute(value)) reasons.push('absolute_path_forbidden');
        if (value === '..' || value.startsWith('../') || value.includes('/../')) reasons.push('path_traversal_forbidden');
        if (value.endsWith('.dem')) reasons.push('replay_file_path_forbidden');
        if (value.startsWith('output/replays/')) reasons.push('output_replays_path_forbidden');
        if (/replay[_-]?00?5/u.test(value) || /partida[_-]?00?5/u.test(value)) reasons.push('protected_replay_005_final_holdout');
        if (/partida[_-]?00?[6-8]/u.test(value) || /replay[_-]?00?[6-8]/u.test(value)) reasons.push('unsupported_bot_fixture_006_008');
    }
    return [...new Set(reasons)];
}

function compactBlockedStatus(replay, reasons) {
    return {
        schemaVersion: 1,
        replayId: replay?.replayId ?? null,
        status: 'blocked',
        reasons,
        replayFileAccessAttempted: false,
        parserExecuted: false,
        artifactClassEmitted: null,
        rawDataCaptured: false,
        fieldValuesCaptured: false,
        rawTicksIncluded: false,
        rawTimestampsIncluded: false,
        finalFactsProduced: false,
        gameplayInterpretationProduced: false,
        attributionEmitted: false
    };
}

export function buildDeathEventPlan(manifest) {
    validateDeathEventManifestShape(manifest);
    const allowlist = manifest.allowedReplays.map(normalizeReplay);
    const requested = (Array.isArray(manifest.requestedReplays) && manifest.requestedReplays.length > 0
        ? manifest.requestedReplays
        : manifest.allowedReplays).map(normalizeReplay);
    const allowlistById = new Map();
    for (const replay of allowlist) {
        if (!replay.replayId || !replay.participantIdentityArtifactPath || !replay.lifeStateTransitionArtifactPath) {
            throw new Error('allowedReplays entries require replayId, participantIdentityArtifactPath, and lifeStateTransitionArtifactPath');
        }
        if (allowlistById.has(replay.replayId)) throw new Error(`duplicate allowed replay id: ${replay.replayId}`);
        allowlistById.set(replay.replayId, replay);
    }

    const readyInputs = [];
    const blockedReplayAudit = [];
    const perReplayStatus = [];
    for (const replay of requested) {
        const reasons = forbiddenReplayReasons(replay);
        const allowed = allowlistById.get(replay.replayId);
        if (!allowed) reasons.push('not_in_manifest_allowlist');
        if (manifest.blockedReplays.includes(replay.replayId)) reasons.push('manifest_blocked_replay');
        if (replay.requestedMode !== MODE) reasons.push('unsupported_requested_mode');
        if (allowed && replay.participantIdentityArtifactPath && slash(replay.participantIdentityArtifactPath) !== slash(allowed.participantIdentityArtifactPath)) {
            reasons.push('participant_identity_path_mismatch');
        }
        if (allowed && replay.lifeStateTransitionArtifactPath && slash(replay.lifeStateTransitionArtifactPath) !== slash(allowed.lifeStateTransitionArtifactPath)) {
            reasons.push('life_state_transition_path_mismatch');
        }
        if (reasons.length > 0) {
            const blocked = compactBlockedStatus(replay, [...new Set(reasons)]);
            blockedReplayAudit.push(blocked);
            perReplayStatus.push(blocked);
            continue;
        }
        const input = {
            ...allowed,
            participantIdentityArtifactPath: assertRelativeRepositoryPath(allowed.participantIdentityArtifactPath, `${allowed.replayId} participantIdentityArtifactPath`),
            lifeStateTransitionArtifactPath: assertRelativeRepositoryPath(allowed.lifeStateTransitionArtifactPath, `${allowed.replayId} lifeStateTransitionArtifactPath`)
        };
        readyInputs.push(input);
        perReplayStatus.push({
            schemaVersion: 1,
            replayId: input.replayId,
            status: 'planned',
            replayFileAccessAttempted: false,
            parserExecuted: false,
            artifactClassEmitted: null,
            rawDataCaptured: false,
            fieldValuesCaptured: false,
            rawTicksIncluded: false,
            rawTimestampsIncluded: false,
            finalFactsProduced: false,
            gameplayInterpretationProduced: false,
            attributionEmitted: false
        });
    }
    return { readyInputs, blockedReplayAudit, perReplayStatus };
}

async function loadParticipantIdentity(input) {
    const artifact = await readJson(input.participantIdentityArtifactPath);
    if (artifact.replayId !== input.replayId) throw new Error(`${input.replayId} participant identity replayId mismatch`);
    if (artifact.artifactClass !== 'participant_identity') throw new Error(`${input.replayId} participant identity artifact class mismatch`);
    if (artifact.generatedAt !== 'task_180') throw new Error(`${input.replayId} participant identity artifact must use task_180 provenance`);
    for (const flag of ['rawDataCaptured', 'fieldValuesCaptured', 'finalFactsProduced', 'gameplayInterpretationProduced', 'playerNamesIncluded', 'heroNamesIncluded', 'teamNamesIncluded', 'entityIdsIncluded', 'mapPositionsIncluded', 'eventRowsIncluded', 'attributionEmitted']) {
        if (artifact[flag] !== false) throw new Error(`${input.replayId} participant identity ${flag} must be false`);
    }
    if (!Array.isArray(artifact.participants) || artifact.participants.length === 0) throw new Error(`${input.replayId} participant identity has no participants`);
    return artifact;
}

async function loadLifeStateTransitions(input) {
    const artifact = await readJson(input.lifeStateTransitionArtifactPath);
    if (artifact.replayId !== input.replayId) throw new Error(`${input.replayId} life-state transition replayId mismatch`);
    if (artifact.artifactClass !== 'life_state_transition_candidates') throw new Error(`${input.replayId} life-state transition artifact class mismatch`);
    if (artifact.generatedAt !== 'task_182') throw new Error(`${input.replayId} life-state transition artifact must use task_182 provenance`);
    for (const flag of ['rawDataCaptured', 'fieldValuesCaptured', 'rawTicksIncluded', 'rawTimestampsIncluded', 'finalFactsProduced', 'gameplayInterpretationProduced']) {
        if (artifact[flag] !== false) throw new Error(`${input.replayId} life-state transition ${flag} must be false`);
    }
    if (!Array.isArray(artifact.transitionCandidates) || artifact.transitionCandidates.length === 0) {
        throw new Error(`${input.replayId} life-state transition artifact has no transition candidates`);
    }
    return artifact;
}

function participantLookup(participantIdentity) {
    const map = new Map();
    for (const participant of participantIdentity.participants) map.set(participant.participantKey, participant);
    return map;
}

export function createDeathEventCandidateArtifact({ replayId, participantIdentity, lifeStateTransitions }) {
    const participants = participantLookup(participantIdentity);
    const candidates = [];
    let unmappedCandidates = 0;
    for (const transition of lifeStateTransitions.transitionCandidates) {
        const participant = participants.get(transition.participantKey);
        if (!participant) {
            unmappedCandidates += 1;
            continue;
        }
        const ordinal = candidates.length + 1;
        candidates.push({
            eventCandidateKey: `death_event_candidate_${sixDigit(ordinal)}`,
            participantKey: transition.participantKey,
            heroRefKey: participant.heroRefKey,
            teamRefKey: participant.teamRefKey,
            normalizedElapsedSecond: transition.normalizedElapsedSecond,
            sourceTransitionKey: transition.transitionKey,
            sourceEvidenceType: 'controller_death_counter_increment_candidate',
            sourceObservationConfidence: transition.candidateConfidence,
            confidenceMeaning: 'confidence_in_source_counter_increment_observation_not_death_truth',
            deathTruthStatus: 'unconfirmed_candidate',
            finalFact: false
        });
    }
    const duplicateCandidateCount = duplicateCount(candidates.map(candidate => candidate.eventCandidateKey));
    const lifeStateCount = lifeStateTransitions.transitionCandidates.length;
    const candidateCount = candidates.length;
    return {
        schemaVersion: 1,
        replayId,
        artifactClass: ARTIFACT_CLASS,
        sourceMethod: 'normalized_death_counter_candidate_canonicalization',
        generatedBy: GENERATED_BY,
        generatedAt: GENERATED_AT,
        rawDataCaptured: false,
        fieldValuesCaptured: false,
        rawTicksIncluded: false,
        rawTimestampsIncluded: false,
        finalFactsProduced: false,
        gameplayInterpretationProduced: false,
        attributionEmitted: false,
        participantIdentityArtifactFound: true,
        lifeStateTransitionArtifactFound: true,
        candidateCount,
        candidates,
        summary: {
            totalCandidates: candidateCount,
            candidatesWithParticipantRef: candidates.filter(candidate => /^participant_[0-9]{2}$/u.test(candidate.participantKey)).length,
            candidatesWithHeroRef: candidates.filter(candidate => /^hero_ref_(?:[0-9]{2}|unknown_[0-9]{2})$/u.test(candidate.heroRefKey)).length,
            candidatesWithTeamRef: candidates.filter(candidate => /^team_ref_(?:[0-9]{2}|unknown_[0-9]{2})$/u.test(candidate.teamRefKey)).length,
            candidatesWithNormalizedTime: candidates.filter(candidate => Number.isInteger(candidate.normalizedElapsedSecond)).length,
            unmappedCandidates,
            duplicateCandidateCount
        },
        sourceBridge: {
            lifeStateTransitionCandidateCount: lifeStateCount,
            deathEventCandidateCount: candidateCount,
            matchStatus: lifeStateCount === candidateCount ? 'matched' : 'mismatch'
        },
        readiness: {
            readyForDeathEventCandidateConsumption: true,
            readyForFinalDeathEventEmission: false,
            readyForAttribution: false,
            readyForTeamfightDetection: false
        },
        limitations: [
            'Each row is a death-event candidate derived from a replay-sourced death-counter increment candidate, not a confirmed death event.',
            'participantKey, heroRefKey, and teamRefKey are synthetic replay-local references; names and raw IDs are not emitted.',
            'sourceObservationConfidence high means confidence in the source counter increment observation, not death truth.',
            'No killer, victim, assist, respawn, damage, spatial, teamfight, decision, or gameplay interpretation is emitted.'
        ]
    };
}

export function validateDeathEventCandidateArtifact(artifact, _schema = null) {
    const errors = [];
    if (artifact.schemaVersion !== 1) errors.push('schemaVersion must be 1');
    if (!/^replay_[0-9]{3}$/u.test(String(artifact.replayId ?? ''))) errors.push('replayId pattern violation');
    if (artifact.artifactClass !== ARTIFACT_CLASS) errors.push(`artifactClass must be ${ARTIFACT_CLASS}`);
    if (artifact.sourceMethod !== 'normalized_death_counter_candidate_canonicalization') errors.push('sourceMethod violation');
    if (artifact.generatedBy !== GENERATED_BY) errors.push(`generatedBy must be ${GENERATED_BY}`);
    if (artifact.generatedAt !== GENERATED_AT) errors.push(`generatedAt must be ${GENERATED_AT}`);
    for (const flag of ['rawDataCaptured', 'fieldValuesCaptured', 'rawTicksIncluded', 'rawTimestampsIncluded', 'finalFactsProduced', 'gameplayInterpretationProduced', 'attributionEmitted']) {
        if (artifact[flag] !== false) errors.push(`${flag} must be false`);
    }
    if (artifact.participantIdentityArtifactFound !== true) errors.push('participantIdentityArtifactFound must be true');
    if (artifact.lifeStateTransitionArtifactFound !== true) errors.push('lifeStateTransitionArtifactFound must be true');
    if (!Array.isArray(artifact.candidates) || artifact.candidates.length < 1) errors.push('candidates must contain at least one row');
    if (artifact.candidateCount !== artifact.candidates?.length) errors.push('candidateCount must equal candidates length');
    const candidateKeys = new Set();
    for (const [index, candidate] of (artifact.candidates ?? []).entries()) {
        const label = `candidates[${index}]`;
        if (!/^death_event_candidate_[0-9]{6}$/u.test(String(candidate.eventCandidateKey ?? ''))) errors.push(`${label}.eventCandidateKey pattern violation`);
        if (candidateKeys.has(candidate.eventCandidateKey)) errors.push(`${label}.eventCandidateKey duplicate`);
        candidateKeys.add(candidate.eventCandidateKey);
        if (!/^participant_[0-9]{2}$/u.test(String(candidate.participantKey ?? ''))) errors.push(`${label}.participantKey pattern violation`);
        if (!/^hero_ref_(?:[0-9]{2}|unknown_[0-9]{2})$/u.test(String(candidate.heroRefKey ?? ''))) errors.push(`${label}.heroRefKey pattern violation`);
        if (!/^team_ref_(?:[0-9]{2}|unknown_[0-9]{2})$/u.test(String(candidate.teamRefKey ?? ''))) errors.push(`${label}.teamRefKey pattern violation`);
        if (!Number.isInteger(candidate.normalizedElapsedSecond) || candidate.normalizedElapsedSecond < 0) {
            errors.push(`${label}.normalizedElapsedSecond must be non-negative integer`);
        }
        if (!/^life_transition_[0-9]{6}$/u.test(String(candidate.sourceTransitionKey ?? ''))) errors.push(`${label}.sourceTransitionKey pattern violation`);
        if (candidate.sourceEvidenceType !== 'controller_death_counter_increment_candidate') errors.push(`${label}.sourceEvidenceType violation`);
        if (candidate.sourceObservationConfidence !== 'high') errors.push(`${label}.sourceObservationConfidence violation`);
        if (candidate.confidenceMeaning !== 'confidence_in_source_counter_increment_observation_not_death_truth') errors.push(`${label}.confidenceMeaning violation`);
        if (candidate.deathTruthStatus !== 'unconfirmed_candidate') errors.push(`${label}.deathTruthStatus violation`);
        if (candidate.finalFact !== false) errors.push(`${label}.finalFact must be false`);
    }
    const summary = artifact.summary ?? {};
    if (summary.totalCandidates !== artifact.candidates?.length) errors.push('summary.totalCandidates must equal candidates length');
    if (summary.candidatesWithParticipantRef !== artifact.candidates?.length) errors.push('all candidates must have participant refs');
    if (summary.candidatesWithHeroRef !== artifact.candidates?.length) errors.push('all candidates must have hero refs');
    if (summary.candidatesWithTeamRef !== artifact.candidates?.length) errors.push('all candidates must have team refs');
    if (summary.candidatesWithNormalizedTime !== artifact.candidates?.length) errors.push('all candidates must have normalized time');
    if (summary.unmappedCandidates !== 0) errors.push('unmappedCandidates must be 0');
    if (summary.duplicateCandidateCount !== 0) errors.push('duplicateCandidateCount must be 0');
    if (artifact.sourceBridge?.lifeStateTransitionCandidateCount !== artifact.candidates?.length) {
        errors.push('lifeStateTransitionCandidateCount must equal candidates length');
    }
    if (artifact.sourceBridge?.deathEventCandidateCount !== artifact.candidates?.length) {
        errors.push('deathEventCandidateCount must equal candidates length');
    }
    if (artifact.sourceBridge?.matchStatus !== 'matched') errors.push('sourceBridge.matchStatus must be matched');
    if (artifact.readiness?.readyForDeathEventCandidateConsumption !== true) errors.push('readyForDeathEventCandidateConsumption must be true');
    if (artifact.readiness?.readyForFinalDeathEventEmission !== false) errors.push('readyForFinalDeathEventEmission must be false');
    if (artifact.readiness?.readyForAttribution !== false) errors.push('readyForAttribution must be false');
    if (artifact.readiness?.readyForTeamfightDetection !== false) errors.push('readyForTeamfightDetection must be false');
    if (!Array.isArray(artifact.limitations) || artifact.limitations.length < 1 || artifact.limitations.length > 12) {
        errors.push('limitations must contain 1..12 strings');
    }
    for (const keyPath of collectForbiddenOutputKeys(artifact)) errors.push(`forbidden key ${keyPath}`);
    return [...new Set(errors)];
}

export function auditDeathEventPolicy(artifact) {
    const forbiddenKeyPaths = collectForbiddenOutputKeys(artifact);
    const rowViolations = [];
    for (const [index, candidate] of artifact.candidates.entries()) {
        if (candidate.finalFact !== false) rowViolations.push(`candidates[${index}].finalFact must be false`);
        if (candidate.deathTruthStatus !== 'unconfirmed_candidate') rowViolations.push(`candidates[${index}].deathTruthStatus must be unconfirmed_candidate`);
        if (!Number.isInteger(candidate.normalizedElapsedSecond)) rowViolations.push(`candidates[${index}].normalizedElapsedSecond must be integer`);
    }
    return {
        schemaVersion: 1,
        replayId: artifact.replayId,
        artifactClass: artifact.artifactClass,
        outputPolicyStatus: forbiddenKeyPaths.length === 0 && rowViolations.length === 0 ? 'passed' : 'failed',
        forbiddenKeyPaths,
        rowViolations,
        rawDataCaptured: artifact.rawDataCaptured,
        fieldValuesCaptured: artifact.fieldValuesCaptured,
        rawTicksIncluded: artifact.rawTicksIncluded,
        rawTimestampsIncluded: artifact.rawTimestampsIncluded,
        finalFactsProduced: artifact.finalFactsProduced,
        gameplayInterpretationProduced: artifact.gameplayInterpretationProduced,
        attributionEmitted: artifact.attributionEmitted
    };
}

async function transformReplay(input) {
    const participantIdentity = await loadParticipantIdentity(input);
    const lifeStateTransitions = await loadLifeStateTransitions(input);
    const artifact = createDeathEventCandidateArtifact({
        replayId: input.replayId,
        participantIdentity,
        lifeStateTransitions
    });
    return {
        artifact,
        summary: {
            schemaVersion: 1,
            replayId: input.replayId,
            status: 'ready',
            participantIdentityArtifactFound: true,
            lifeStateTransitionArtifactFound: true,
            candidateCount: artifact.candidateCount,
            candidatesWithParticipantRef: artifact.summary.candidatesWithParticipantRef,
            candidatesWithHeroRef: artifact.summary.candidatesWithHeroRef,
            candidatesWithTeamRef: artifact.summary.candidatesWithTeamRef,
            candidatesWithNormalizedTime: artifact.summary.candidatesWithNormalizedTime,
            unmappedCandidates: artifact.summary.unmappedCandidates,
            duplicateCandidateCount: artifact.summary.duplicateCandidateCount,
            sourceBridgeMatchStatus: artifact.sourceBridge.matchStatus,
            replayFileAccessAttempted: false,
            parserExecuted: false,
            rawDataCaptured: false,
            fieldValuesCaptured: false,
            rawTicksIncluded: false,
            rawTimestampsIncluded: false,
            finalFactsProduced: false,
            gameplayInterpretationProduced: false,
            attributionEmitted: false
        }
    };
}

function buildSourceBridgeComparison(artifacts) {
    return {
        schemaVersion: 1,
        replayCount: artifacts.length,
        matchedCount: artifacts.filter(artifact => artifact.sourceBridge.matchStatus === 'matched').length,
        mismatchCount: artifacts.filter(artifact => artifact.sourceBridge.matchStatus === 'mismatch').length,
        totalLifeStateTransitionCandidateCount: artifacts.reduce((sum, artifact) => sum + artifact.sourceBridge.lifeStateTransitionCandidateCount, 0),
        totalDeathEventCandidateCount: artifacts.reduce((sum, artifact) => sum + artifact.sourceBridge.deathEventCandidateCount, 0),
        matchStatus: artifacts.every(artifact => artifact.sourceBridge.matchStatus === 'matched') ? 'matched' : 'mismatch',
        finalFactsProduced: false,
        gameplayInterpretationProduced: false
    };
}

function buildIdentityEnrichmentAudit(artifacts) {
    const totals = artifacts.reduce((acc, artifact) => {
        acc.candidateCount += artifact.candidateCount;
        acc.candidatesWithParticipantRef += artifact.summary.candidatesWithParticipantRef;
        acc.candidatesWithHeroRef += artifact.summary.candidatesWithHeroRef;
        acc.candidatesWithTeamRef += artifact.summary.candidatesWithTeamRef;
        acc.candidatesWithNormalizedTime += artifact.summary.candidatesWithNormalizedTime;
        acc.unmappedCandidates += artifact.summary.unmappedCandidates;
        return acc;
    }, {
        candidateCount: 0,
        candidatesWithParticipantRef: 0,
        candidatesWithHeroRef: 0,
        candidatesWithTeamRef: 0,
        candidatesWithNormalizedTime: 0,
        unmappedCandidates: 0
    });
    return {
        schemaVersion: 1,
        identityEnrichmentStatus: totals.unmappedCandidates === 0
            && totals.candidateCount === totals.candidatesWithParticipantRef
            && totals.candidateCount === totals.candidatesWithHeroRef
            && totals.candidateCount === totals.candidatesWithTeamRef
            ? 'passed'
            : 'blocked',
        ...totals,
        refsAreSyntheticReplayLocal: true,
        rawIdentityPersisted: false,
        playerNamesIncluded: false,
        heroNamesIncluded: false,
        teamNamesIncluded: false
    };
}

function buildReadinessSummary(artifacts) {
    return {
        schemaVersion: 1,
        replayCount: artifacts.length,
        readyForDeathEventCandidateConsumptionCount: artifacts.filter(artifact => artifact.readiness.readyForDeathEventCandidateConsumption).length,
        readyForFinalDeathEventEmissionCount: artifacts.filter(artifact => artifact.readiness.readyForFinalDeathEventEmission).length,
        readyForAttributionCount: artifacts.filter(artifact => artifact.readiness.readyForAttribution).length,
        readyForTeamfightDetectionCount: artifacts.filter(artifact => artifact.readiness.readyForTeamfightDetection).length,
        readyForCanonicalDeathEventCandidateDesign: artifacts.length > 0,
        readyForFinalDeathEventEmission: false,
        readyForAttribution: false,
        readyForTeamfightDetection: false,
        rawDataCaptured: false,
        fieldValuesCaptured: false,
        finalFactsProduced: false,
        gameplayInterpretationProduced: false
    };
}

export async function runDeathEventCandidateEmission({ manifest, summaryOutput }) {
    validateDeathEventManifestShape(manifest);
    const summaryRoot = validateDeathEventOutputRoot(summaryOutput, manifest);
    const schema = await readJson(SCHEMA_PATH);
    const plan = buildDeathEventPlan(manifest);
    const replayResults = [];
    const artifactWrites = [];
    const perReplayStatus = [...plan.perReplayStatus];

    if (plan.blockedReplayAudit.length === 0) {
        for (const input of plan.readyInputs) {
            const result = await transformReplay(input);
            replayResults.push(result);
            const row = perReplayStatus.find(status => status.replayId === input.replayId);
            Object.assign(row, {
                ...result.summary,
                artifactClassEmitted: ARTIFACT_CLASS
            });
            artifactWrites.push({
                artifactPath: path.join(summaryRoot.normalized, 'artifacts', input.replayId, 'death_event_candidates.json'),
                artifact: result.artifact
            });
        }
    }

    const artifacts = replayResults.map(result => result.artifact).filter(Boolean);
    const schemaRows = artifacts.map(artifact => {
        const errors = validateDeathEventCandidateArtifact(artifact, schema);
        return { replayId: artifact.replayId, schemaValidationStatus: errors.length === 0 ? 'passed' : 'failed', errors };
    });
    const policyRows = artifacts.map(auditDeathEventPolicy);
    const sizeRows = artifacts.map(artifact => ({
        replayId: artifact.replayId,
        artifactBytes: artifactSizeBytes(artifact),
        maxArtifactBytes: MAX_ARTIFACT_BYTES,
        sizeStatus: artifactSizeBytes(artifact) <= MAX_ARTIFACT_BYTES ? 'passed' : 'failed'
    }));
    const sourceBridgeComparison = buildSourceBridgeComparison(artifacts);
    const identityEnrichmentAudit = buildIdentityEnrichmentAudit(artifacts);
    const readinessSummary = buildReadinessSummary(artifacts);

    const allReady = plan.blockedReplayAudit.length === 0
        && replayResults.length === plan.readyInputs.length
        && artifacts.length === plan.readyInputs.length
        && artifacts.every(artifact => artifact.candidateCount > 0)
        && artifacts.every(artifact => artifact.summary.unmappedCandidates === 0)
        && artifacts.every(artifact => artifact.summary.duplicateCandidateCount === 0)
        && artifacts.every(artifact => artifact.sourceBridge.matchStatus === 'matched')
        && schemaRows.every(row => row.schemaValidationStatus === 'passed')
        && policyRows.every(row => row.outputPolicyStatus === 'passed')
        && sizeRows.every(row => row.sizeStatus === 'passed')
        && identityEnrichmentAudit.identityEnrichmentStatus === 'passed';
    const gateName = allReady
        ? (manifest.runKind === 'task183-pilot' ? PILOT_READY_GATE : BOUNDED32_READY_GATE)
        : (manifest.runKind === 'task183-pilot' ? PILOT_BLOCKED_GATE : BOUNDED32_BLOCKED_GATE);
    const gatePrefix = manifest.runKind === 'task183-pilot' ? 'death-event-candidates-pilot' : 'death-event-candidates-bounded32';

    if (allReady) {
        await rm(path.join(summaryRoot.absolutePath, 'artifacts'), { recursive: true, force: true });
        for (const write of artifactWrites) await writeJson(path.resolve(REPO_ROOT, write.artifactPath), write.artifact);
    }

    const totalCandidates = artifacts.reduce((sum, artifact) => sum + artifact.candidateCount, 0);
    const gate = {
        schemaVersion: 1,
        gate: gateName,
        status: allReady ? 'ready' : 'blocked',
        manifestId: manifest.manifestId,
        runKind: manifest.runKind,
        replayCount: plan.readyInputs.length,
        artifactsEmitted: allReady ? artifacts.length : 0,
        candidateCount: allReady ? totalCandidates : 0,
        replayFileAccessed: false,
        parserExecuted: false,
        rawDataCaptured: false,
        fieldValuesCaptured: false,
        rawTicksIncluded: false,
        rawTimestampsIncluded: false,
        finalFactsProduced: false,
        gameplayInterpretationProduced: false,
        attributionEmitted: false
    };
    const summary = {
        schemaVersion: 1,
        manifestId: manifest.manifestId,
        runKind: manifest.runKind,
        replayCount: plan.readyInputs.length,
        artifactsEmitted: allReady ? artifacts.length : 0,
        candidateCount: allReady ? totalCandidates : 0,
        candidatesWithParticipantRef: allReady ? identityEnrichmentAudit.candidatesWithParticipantRef : 0,
        candidatesWithHeroRef: allReady ? identityEnrichmentAudit.candidatesWithHeroRef : 0,
        candidatesWithTeamRef: allReady ? identityEnrichmentAudit.candidatesWithTeamRef : 0,
        candidatesWithNormalizedTime: allReady ? identityEnrichmentAudit.candidatesWithNormalizedTime : 0,
        unmappedCandidates: allReady ? identityEnrichmentAudit.unmappedCandidates : 0,
        duplicateCandidateCount: allReady
            ? artifacts.reduce((sum, artifact) => sum + artifact.summary.duplicateCandidateCount, 0)
            : 0,
        sourceBridgeMatchStatus: sourceBridgeComparison.matchStatus,
        readyForDeathEventCandidateConsumption: allReady,
        readyForFinalDeathEventEmission: false,
        readyForAttribution: false,
        readyForTeamfightDetection: false,
        schemaValidationStatus: schemaRows.every(row => row.schemaValidationStatus === 'passed') ? 'passed' : 'failed',
        outputPolicyStatus: policyRows.every(row => row.outputPolicyStatus === 'passed') ? 'passed' : 'failed',
        sizeAuditStatus: sizeRows.every(row => row.sizeStatus === 'passed') ? 'passed' : 'failed',
        protectionAuditStatus: plan.blockedReplayAudit.length === 0 ? 'passed' : 'blocked',
        replayFileAccessed: false,
        parserExecuted: false,
        rawDataCaptured: false,
        fieldValuesCaptured: false,
        rawTicksIncluded: false,
        rawTimestampsIncluded: false,
        finalFactsProduced: false,
        gameplayInterpretationProduced: false,
        attributionEmitted: false
    };
    const schemaValidationSummary = { schemaVersion: 1, schemaValidationStatus: summary.schemaValidationStatus, rows: schemaRows };
    const outputPolicyAudit = {
        schemaVersion: 1,
        outputPolicyStatus: summary.outputPolicyStatus,
        forbiddenSurfaces: FORBIDDEN_SURFACES,
        rows: policyRows,
        rawDataCaptured: false,
        fieldValuesCaptured: false,
        rawTicksIncluded: false,
        rawTimestampsIncluded: false,
        finalFactsProduced: false,
        gameplayInterpretationProduced: false,
        attributionEmitted: false
    };
    const sizeAudit = {
        schemaVersion: 1,
        sizeAuditStatus: summary.sizeAuditStatus,
        maxArtifactBytes: MAX_ARTIFACT_BYTES,
        maxRunBytes: MAX_RUN_BYTES,
        totalArtifactBytes: sizeRows.reduce((sum, row) => sum + row.artifactBytes, 0),
        rows: sizeRows
    };
    const protectionAudit = {
        schemaVersion: 1,
        protectionAuditStatus: summary.protectionAuditStatus,
        transformedOnlyVersionedArtifacts: true,
        replayFilesAccessed: false,
        replayBytesRead: false,
        parserExecuted: false,
        processedReplayIds: plan.readyInputs.map(input => input.replayId),
        replay005Accessed: false,
        bots006To008Processed: false,
        outputReplaysUsed: false,
        blockedReplayAudit: plan.blockedReplayAudit,
        parserEngineBehaviorModified: false,
        packagesDeademModified: false,
        recoveryAdded: false,
        skipModeAdded: false,
        placeholderAdded: false,
        defaultBehaviorChanged: false,
        newOptInAdded: false,
        task184Created: false,
        rawDataCaptured: false,
        fieldValuesCaptured: false,
        rawTicksIncluded: false,
        rawTimestampsIncluded: false,
        finalFactsProduced: false,
        gameplayInterpretationProduced: false,
        attributionEmitted: false
    };

    await writeJson(path.join(summaryRoot.absolutePath, `${gatePrefix}-gate.json`), gate);
    await writeJson(path.join(summaryRoot.absolutePath, `${gatePrefix}-summary.json`), summary);
    await writeJson(path.join(summaryRoot.absolutePath, `${gatePrefix}-schema-validation-summary.json`), schemaValidationSummary);
    await writeJson(path.join(summaryRoot.absolutePath, `${gatePrefix}-output-policy-audit.json`), outputPolicyAudit);
    await writeJson(path.join(summaryRoot.absolutePath, `${gatePrefix}-size-audit.json`), sizeAudit);
    await writeJson(path.join(summaryRoot.absolutePath, `${gatePrefix}-protection-audit.json`), protectionAudit);
    await writeJson(path.join(summaryRoot.absolutePath, `${gatePrefix}-source-bridge-comparison.json`), sourceBridgeComparison);
    await writeJson(path.join(summaryRoot.absolutePath, `${gatePrefix}-identity-enrichment-audit.json`), identityEnrichmentAudit);
    await writeJson(path.join(summaryRoot.absolutePath, `${gatePrefix}-readiness-summary.json`), readinessSummary);

    return {
        gate,
        summary,
        sourceBridgeComparison,
        identityEnrichmentAudit,
        readinessSummary,
        artifacts,
        perReplayStatus,
        blockedReplayAudit: plan.blockedReplayAudit
    };
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const manifestPath = assertRelativeRepositoryPath(args.get('manifest'), 'manifest');
    const manifest = await readJson(manifestPath);
    const result = await runDeathEventCandidateEmission({
        manifest,
        summaryOutput: args.get('summary-output')
    });
    console.log(JSON.stringify(result.gate, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    main().catch(error => {
        console.error(error);
        process.exitCode = 1;
    });
}
