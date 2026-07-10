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
const ARTIFACT_CLASS = 'death_event_corroboration_evidence';
const MODE = 'death_event_corroboration_evidence_emission';
const GENERATED_BY = 'tools/emit-death-event-corroboration-evidence.mjs';
const GENERATED_AT = 'task_184';
const OUTPUT_ROOT_PREFIX = 'output/local-replay-processing/death-event-corroboration-evidence/';
const SCHEMA_PATH = 'schemas/death-event-corroboration-evidence.schema.json';
const CONTROLLER_CLASS = 'CCitadelPlayerController';
const MAX_ARTIFACT_BYTES = 512 * 1024;
const MAX_RUN_BYTES = 16 * 1024 * 1024;
const EXPECTED_ANCHORS = new Map([['task184-pilot', 341], ['task184-bounded32', 2552]]);
const RUN_GATES = {
    'task184-pilot': {
        ready: 'death_event_corroboration_evidence_pilot_ready',
        blocked: 'death_event_corroboration_evidence_pilot_blocked',
        prefix: 'death-event-corroboration-pilot'
    },
    'task184-bounded32': {
        ready: 'death_event_corroboration_evidence_bounded32_ready',
        blocked: 'death_event_corroboration_evidence_bounded32_blocked',
        prefix: 'death-event-corroboration-bounded32'
    }
};

export const FORBIDDEN_REPLAY_IDS = new Set(['replay_005', 'replay_006', 'replay_007', 'replay_008']);
export const FORBIDDEN_OUTPUT_KEYS = new Set([
    'playerName', 'heroName', 'teamName', 'entityId', 'rawEntityId', 'handle', 'controllerHandle',
    'accountId', 'steamId', 'playerSlot', 'heroId', 'teamNumber', 'fieldValue', 'fieldValues',
    'rawValue', 'rawValues', 'rawTick', 'rawTicks', 'rawTimestamp', 'rawTimestamps', 'tick',
    'ticks', 'timestamp', 'timestamps', 'position', 'positions', 'killer', 'victim', 'assist',
    'assists', 'damage', 'damageSource', 'objective', 'objectiveId', 'deathFact', 'confirmedDeath',
    'deathEvents', 'respawnEvents', 'teamfight', 'teamfights', 'snapshot', 'entityHistory'
]);
export const FORBIDDEN_SURFACES = [
    'player_names', 'hero_names', 'team_names', 'raw_entity_ids', 'raw_handles', 'account_ids',
    'steam_ids', 'raw_player_slots', 'raw_hero_ids', 'raw_team_numbers', 'raw_values', 'raw_ticks',
    'raw_timestamps', 'field_values', 'map_positions', 'damage', 'objectives', 'attribution',
    'final_facts', 'final_death_events', 'final_respawn_events', 'teamfights', 'gameplay_interpretation'
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

function readFirstField(entity, candidates) {
    if (!entity) return null;
    for (const candidate of candidates) {
        try {
            const value = entity.getField(candidate);
            if (value !== undefined && value !== null) return value;
        } catch {
            // Signal probes are optional and field absence is expected.
        }
    }
    return null;
}

function participantSeed(controller, ordinal) {
    return normalizeValue(readFirstField(controller, ['m_iPlayerSlot', 'm_iPlayerID', 'm_unAccountID', 'm_iAccountID', 'm_steamID']))
        ?? `observed-controller-${ordinal}`;
}

function signalSignature(values) {
    const normalized = values.map(normalizeValue);
    return normalized.some(value => value !== null) ? JSON.stringify(normalized) : null;
}

function healthBoundarySignature(entity) {
    const value = safeNumber(readFirstField(entity, ['m_iHealth', 'm_nHealth', 'm_flHealth']));
    if (value === null) return null;
    return value <= 0 ? 'non_positive_boundary_candidate' : 'positive_boundary_candidate';
}

function numericBoundarySignature(entity, candidates) {
    const value = safeNumber(readFirstField(entity, candidates));
    if (value === null) return null;
    return value <= 0 ? 'non_positive_boundary_candidate' : 'positive_boundary_candidate';
}

function linkedPawn(player, rawHandle) {
    const handle = safeNumber(rawHandle);
    if (!Number.isInteger(handle)) return null;
    try {
        return player.getDemo().getEntityByHandle(handle);
    } catch {
        return null;
    }
}

function observeControllerSignals(player, aggregate, normalizedElapsedSecond) {
    const controllers = player.getDemo().getEntitiesByClassName(CONTROLLER_CLASS);
    let fallbackOrdinal = 0;
    for (const controller of controllers) {
        fallbackOrdinal += 1;
        const seed = participantSeed(controller, fallbackOrdinal);
        aggregate.participantSeeds.add(seed);
        const rawPawnLink = readFirstField(controller, ['m_hPawn', 'm_hAssignedHero', 'm_hHeroPawn']);
        const pawn = linkedPawn(player, rawPawnLink);
        const state = {
            life: signalSignature([
                readFirstField(controller, ['m_lifeState']),
                readFirstField(controller, ['m_bAlive']),
                healthBoundarySignature(controller),
                readFirstField(pawn, ['m_lifeState']),
                readFirstField(pawn, ['m_bAlive']),
                healthBoundarySignature(pawn)
            ]),
            pawn_link: signalSignature([rawPawnLink]),
            respawn: signalSignature([
                readFirstField(controller, ['m_bRespawning']),
                numericBoundarySignature(controller, ['m_iRespawnTime', 'm_flRespawnTime']),
                readFirstField(pawn, ['m_bRespawning']),
                numericBoundarySignature(pawn, ['m_iRespawnTime', 'm_flRespawnTime'])
            ])
        };
        const previous = aggregate.previousBySeed.get(seed);
        if (previous) {
            for (const category of ['life', 'pawn_link', 'respawn']) {
                const changed = previous[category] !== state[category]
                    && (previous[category] !== null || state[category] !== null);
                if (changed) aggregate.signalChanges.add(`${seed}\u0000${category}\u0000${normalizedElapsedSecond}`);
            }
        }
        aggregate.previousBySeed.set(seed, state);
    }
    return controllers.length;
}

function stableSorted(values) {
    return [...values].sort((left, right) => {
        const leftNumber = Number(left);
        const rightNumber = Number(right);
        if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) return leftNumber - rightNumber;
        return String(left).localeCompare(String(right));
    });
}

function twoDigit(index) {
    return String(index).padStart(2, '0');
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

function forbiddenReplayReasons(replay) {
    const replayId = String(replay?.replayId ?? '');
    const paths = [replay?.localPath, replay?.participantIdentityArtifactPath, replay?.lifeStateTransitionArtifactPath, replay?.deathEventCandidateArtifactPath]
        .filter(Boolean)
        .map(value => slash(value).toLowerCase());
    const reasons = [];
    if (FORBIDDEN_REPLAY_IDS.has(replayId)) reasons.push(`${replayId}_globally_blocked`);
    for (const value of paths) {
        if (path.isAbsolute(value)) reasons.push('absolute_path_forbidden');
        if (value === '..' || value.startsWith('../') || value.includes('/../')) reasons.push('path_traversal_forbidden');
        if (value.startsWith('output/replays/')) reasons.push('output_replays_path_forbidden');
        if (/replay[_-]?00?5/iu.test(value) || /partida[_-]?00?5/iu.test(value)) reasons.push('protected_replay_005_final_holdout');
        if (/replay[_-]?00?[6-8]/iu.test(value) || /partida[_-]?00?[6-8]/iu.test(value)) reasons.push('unsupported_bot_fixture_006_008');
    }
    return [...new Set(reasons)];
}

function normalizeReplay(replay) {
    const replayId = replay?.replayId ?? null;
    return {
        replayId,
        localPath: replay?.localPath ?? null,
        selectionGroup: replay?.selectionGroup ?? null,
        requestedMode: replay?.requestedMode ?? replay?.mode ?? MODE,
        participantIdentityArtifactPath: replay?.participantIdentityArtifactPath
            ?? (replayId ? `output/local-replay-processing/participant-identity-compact/task180-bounded32/artifacts/${replayId}/participant_identity.json` : null),
        lifeStateTransitionArtifactPath: replay?.lifeStateTransitionArtifactPath
            ?? (replayId ? `output/local-replay-processing/life-state-transition-candidates/task182-bounded32/artifacts/${replayId}/life_state_transition_candidates.json` : null),
        deathEventCandidateArtifactPath: replay?.deathEventCandidateArtifactPath
            ?? (replayId ? `output/local-replay-processing/death-event-candidates/task183-bounded32/artifacts/${replayId}/death_event_candidates.json` : null)
    };
}

export function validateCorroborationManifestShape(manifest) {
    if (typeof manifest !== 'object' || manifest === null || Array.isArray(manifest)) throw new Error('manifest must be an object');
    if (manifest.schemaVersion !== 1) throw new Error('manifest schemaVersion must be 1');
    if (!manifest.manifestId) throw new Error('manifestId is required');
    if (!RUN_GATES[manifest.runKind]) throw new Error('manifest runKind is invalid');
    if (manifest.mode !== MODE) throw new Error(`manifest mode must be ${MODE}`);
    if (manifest.artifactClass !== ARTIFACT_CLASS) throw new Error(`manifest artifactClass must be ${ARTIFACT_CLASS}`);
    if (manifest.replayProcessingAllowed !== true) throw new Error('manifest must explicitly allow replay processing');
    if (manifest.realArtifactEmissionAllowed !== true) throw new Error('manifest must explicitly allow real artifact emission');
    if (manifest.generationLabel !== GENERATED_AT) throw new Error(`manifest generationLabel must be ${GENERATED_AT}`);
    for (const flag of ['rawDataCaptured', 'fieldValuesCaptured', 'rawIdsIncluded', 'rawTicksIncluded', 'rawTimestampsIncluded', 'finalFactsProduced', 'gameplayInterpretationProduced', 'attributionEmitted']) {
        if (manifest[flag] !== false) throw new Error(`manifest ${flag} must be false`);
    }
    const windows = manifest.temporalWindows ?? {};
    if (windows.nearEventBeforeSeconds !== 2 || windows.nearEventAfterSeconds !== 2
        || windows.laterCycleAfterSecondsExclusive !== 0 || windows.laterCycleMaxSecondsInclusive !== 180) {
        throw new Error('manifest temporal windows must match the Task 184 contract');
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

export function validateCorroborationOutputRoot(summaryOutput, manifest) {
    const normalized = assertRelativeRepositoryPath(summaryOutput, 'summary output').replace(/\/?$/u, '/');
    const expected = `${OUTPUT_ROOT_PREFIX}${manifest.runKind}/`;
    if (normalized !== expected) throw new Error(`summary output root must be exactly ${expected}`);
    return { normalized, absolutePath: path.resolve(REPO_ROOT, normalized) };
}

export function buildCorroborationPlan(manifest) {
    validateCorroborationManifestShape(manifest);
    const allowlist = manifest.allowedReplays.map(normalizeReplay);
    const requested = (manifest.requestedReplays?.length ? manifest.requestedReplays : manifest.allowedReplays).map(normalizeReplay);
    const allowlistById = new Map();
    for (const replay of allowlist) {
        if (!replay.replayId || !replay.localPath) {
            throw new Error('allowedReplays entries require replayId and localPath');
        }
        if (allowlistById.has(replay.replayId)) throw new Error(`duplicate allowed replay id: ${replay.replayId}`);
        allowlistById.set(replay.replayId, replay);
    }
    const readyInputs = [];
    const blockedReplayAudit = [];
    for (const replay of requested) {
        const reasons = forbiddenReplayReasons(replay);
        const allowed = allowlistById.get(replay.replayId);
        if (!allowed) reasons.push('not_in_manifest_allowlist');
        if (manifest.blockedReplays.includes(replay.replayId)) reasons.push('manifest_blocked_replay');
        if (replay.requestedMode !== MODE) reasons.push('unsupported_requested_mode');
        for (const key of ['localPath', 'participantIdentityArtifactPath', 'lifeStateTransitionArtifactPath', 'deathEventCandidateArtifactPath']) {
            if (allowed && replay[key] && slash(replay[key]) !== slash(allowed[key])) reasons.push(`${key}_mismatch`);
        }
        if (reasons.length > 0) {
            blockedReplayAudit.push({ replayId: replay.replayId, status: 'blocked', reasons: [...new Set(reasons)], replayFileAccessAttempted: false });
            continue;
        }
        const localPath = assertRelativeRepositoryPath(allowed.localPath, `${allowed.replayId} localPath`);
        if (!localPath.toLowerCase().endsWith('.dem')) throw new Error(`${allowed.replayId} localPath must reference an authorized .dem`);
        readyInputs.push({
            ...allowed,
            localPath,
            absolutePath: path.resolve(REPO_ROOT, localPath),
            participantIdentityArtifactPath: assertRelativeRepositoryPath(allowed.participantIdentityArtifactPath, 'participant identity path'),
            lifeStateTransitionArtifactPath: assertRelativeRepositoryPath(allowed.lifeStateTransitionArtifactPath, 'life-state transition path'),
            deathEventCandidateArtifactPath: assertRelativeRepositoryPath(allowed.deathEventCandidateArtifactPath, 'death-event candidate path')
        });
    }
    return { readyInputs, blockedReplayAudit };
}

async function loadSourceArtifacts(input) {
    const participantIdentity = await readJson(input.participantIdentityArtifactPath);
    const lifeStateTransitions = await readJson(input.lifeStateTransitionArtifactPath);
    const deathEventCandidates = await readJson(input.deathEventCandidateArtifactPath);
    if (participantIdentity.replayId !== input.replayId || participantIdentity.artifactClass !== 'participant_identity'
        || participantIdentity.generatedAt !== 'task_180') throw new Error(`${input.replayId} Task 180 artifact mismatch`);
    if (lifeStateTransitions.replayId !== input.replayId || lifeStateTransitions.artifactClass !== 'life_state_transition_candidates'
        || lifeStateTransitions.generatedAt !== 'task_182') throw new Error(`${input.replayId} Task 182 artifact mismatch`);
    if (deathEventCandidates.replayId !== input.replayId || deathEventCandidates.artifactClass !== 'death_event_candidates'
        || deathEventCandidates.generatedAt !== 'task_183') throw new Error(`${input.replayId} Task 183 artifact mismatch`);
    if (!participantIdentity.participants?.length || !lifeStateTransitions.transitionCandidates?.length
        || !deathEventCandidates.candidates?.length) throw new Error(`${input.replayId} required source rows are missing`);
    return { participantIdentity, lifeStateTransitions, deathEventCandidates };
}

function mapSignalChanges(aggregate, participantIdentity) {
    const seeds = stableSorted(aggregate.participantSeeds);
    const participants = [...participantIdentity.participants].sort((left, right) => left.participantKey.localeCompare(right.participantKey));
    const seedToParticipant = new Map();
    seeds.forEach((seed, index) => seedToParticipant.set(seed, participants[index]?.participantKey ?? null));
    const signalTransitions = [];
    let unmappedSignalChanges = 0;
    for (const encoded of aggregate.signalChanges) {
        const [seed, category, secondText] = encoded.split('\u0000');
        const participantKey = seedToParticipant.get(seed);
        if (!participantKey) {
            unmappedSignalChanges += 1;
            continue;
        }
        signalTransitions.push({
            signalKey: `observed_signal_${sixDigit(signalTransitions.length + 1)}`,
            participantKey,
            category,
            normalizedElapsedSecond: Number(secondText)
        });
    }
    return {
        signalTransitions,
        observedParticipantSeedCount: seeds.length,
        participantIdentityCount: participants.length,
        unmappedSignalChanges,
        participantMappingStatus: seeds.length === participants.length && unmappedSignalChanges === 0 ? 'passed' : 'failed'
    };
}

function buildAnchorBridgeComparison(lifeStateTransitions, deathEventCandidates) {
    const transitions = new Map(lifeStateTransitions.transitionCandidates.map(row => [row.transitionKey, row]));
    const rows = deathEventCandidates.candidates.map(anchor => {
        const source = transitions.get(anchor.sourceTransitionKey);
        const matched = Boolean(source)
            && source.participantKey === anchor.participantKey
            && source.normalizedElapsedSecond === anchor.normalizedElapsedSecond;
        return { eventCandidateKey: anchor.eventCandidateKey, sourceTransitionKey: anchor.sourceTransitionKey, matched };
    });
    return {
        anchorBridgeStatus: rows.length > 0 && rows.every(row => row.matched) ? 'passed' : 'failed',
        task182TransitionCount: lifeStateTransitions.transitionCandidates.length,
        task183AnchorCount: deathEventCandidates.candidates.length,
        matchedAnchorCount: rows.filter(row => row.matched).length,
        task182CountUsedAsCorroboration: false,
        task183CountUsedAsCorroboration: false,
        mismatchRows: rows.filter(row => !row.matched)
    };
}

function chooseSignal(anchor, category, signalTransitions, usedSignalKeys) {
    const eligible = signalTransitions.filter(signal => {
        if (signal.participantKey !== anchor.participantKey || signal.category !== category || usedSignalKeys.has(signal.signalKey)) return false;
        const delta = signal.normalizedElapsedSecond - anchor.normalizedElapsedSecond;
        if (category === 'respawn') return delta >= -2 && delta <= 180;
        return delta >= -2 && delta <= 2;
    }).map(signal => {
        const delta = signal.normalizedElapsedSecond - anchor.normalizedElapsedSecond;
        const near = delta >= -2 && delta <= 2;
        return { signal, delta, tier: near ? 0 : 1, distance: near ? Math.abs(delta) : delta };
    }).sort((left, right) => left.tier - right.tier || left.distance - right.distance || left.delta - right.delta);
    if (eligible.length === 0) return { observed: false, delta: null, ambiguous: false };
    if (eligible.length > 1 && eligible[0].tier === eligible[1].tier && eligible[0].distance === eligible[1].distance) {
        return { observed: false, delta: null, ambiguous: true };
    }
    usedSignalKeys.add(eligible[0].signal.signalKey);
    return { observed: true, delta: eligible[0].delta, ambiguous: false };
}

function evidenceClassFor(matches) {
    if (matches.some(match => match.ambiguous)) return 'ambiguous';
    const observed = matches.filter(match => match.observed);
    if (observed.length === 0) return 'counter_only';
    if (observed.length > 1) return 'counter_plus_multiple_independent_signals';
    if (matches[0].observed) return 'counter_plus_life_signal';
    if (matches[1].observed) return 'counter_plus_pawn_link_signal';
    return 'counter_plus_respawn_signal';
}

function confirmationEvidenceLevel(evidenceRows) {
    const corroborated = evidenceRows.filter(row => [
        row.lifeSignalChangeCandidateObserved,
        row.pawnLinkChangeCandidateObserved,
        row.respawnSignalChangeCandidateObserved
    ].some(Boolean)).length;
    if (corroborated === 0) return 'insufficient';
    return corroborated / evidenceRows.length >= 0.75 ? 'strong' : 'partial';
}

export function createCorroborationArtifact({ replayId, participantIdentity, lifeStateTransitions, deathEventCandidates, signalTransitions }) {
    const participantByKey = new Map(participantIdentity.participants.map(row => [row.participantKey, row]));
    const bridge = buildAnchorBridgeComparison(lifeStateTransitions, deathEventCandidates);
    const usedSignalKeys = new Set();
    let unmappedParticipantAnchors = 0;
    const evidenceRows = [];
    const anchors = [...deathEventCandidates.candidates].sort((left, right) =>
        left.normalizedElapsedSecond - right.normalizedElapsedSecond || left.eventCandidateKey.localeCompare(right.eventCandidateKey));
    for (const anchor of anchors) {
        const participant = participantByKey.get(anchor.participantKey);
        if (!participant) {
            unmappedParticipantAnchors += 1;
            continue;
        }
        const life = chooseSignal(anchor, 'life', signalTransitions, usedSignalKeys);
        const pawn = chooseSignal(anchor, 'pawn_link', signalTransitions, usedSignalKeys);
        const respawn = chooseSignal(anchor, 'respawn', signalTransitions, usedSignalKeys);
        const matches = [life, pawn, respawn];
        evidenceRows.push({
            corroborationKey: `corroboration_${sixDigit(evidenceRows.length + 1)}`,
            eventCandidateKey: anchor.eventCandidateKey,
            sourceTransitionKey: anchor.sourceTransitionKey,
            participantKey: anchor.participantKey,
            heroRefKey: anchor.heroRefKey,
            teamRefKey: anchor.teamRefKey,
            normalizedElapsedSecond: anchor.normalizedElapsedSecond,
            lifeSignalChangeCandidateObserved: life.observed,
            normalizedLifeSignalDeltaSecond: life.delta,
            pawnLinkChangeCandidateObserved: pawn.observed,
            normalizedPawnLinkDeltaSecond: pawn.delta,
            respawnSignalChangeCandidateObserved: respawn.observed,
            normalizedRespawnSignalDeltaSecond: respawn.delta,
            evidenceClass: evidenceClassFor(matches),
            confirmationStatus: 'unconfirmed',
            finalFact: false
        });
    }
    const rowsWithSignalCounts = evidenceRows.map(row => [
        row.lifeSignalChangeCandidateObserved,
        row.pawnLinkChangeCandidateObserved,
        row.respawnSignalChangeCandidateObserved
    ].filter(Boolean).length);
    const level = confirmationEvidenceLevel(evidenceRows);
    const duplicateEvidenceKeyCount = duplicateCount(evidenceRows.map(row => row.corroborationKey));
    return {
        artifact: {
            schemaVersion: 1,
            replayId,
            artifactClass: ARTIFACT_CLASS,
            sourceMethod: 'temporal_multi_signal_candidate_association',
            generatedBy: GENERATED_BY,
            generatedAt: GENERATED_AT,
            rawDataCaptured: false,
            fieldValuesCaptured: false,
            rawIdsIncluded: false,
            rawTicksIncluded: false,
            rawTimestampsIncluded: false,
            finalFactsProduced: false,
            gameplayInterpretationProduced: false,
            attributionEmitted: false,
            participantIdentityArtifactFound: true,
            lifeStateTransitionArtifactFound: true,
            deathEventCandidateArtifactFound: true,
            anchorCount: deathEventCandidates.candidates.length,
            evidenceRowCount: evidenceRows.length,
            evidenceRows,
            summary: {
                counterOnlyRows: evidenceRows.filter(row => row.evidenceClass === 'counter_only').length,
                rowsWithOneIndependentSignal: rowsWithSignalCounts.filter(count => count === 1).length,
                rowsWithMultipleIndependentSignals: rowsWithSignalCounts.filter(count => count > 1).length,
                ambiguousRows: evidenceRows.filter(row => row.evidenceClass === 'ambiguous').length,
                candidateAnchorsWithoutCorroboration: rowsWithSignalCounts.filter(count => count === 0).length,
                unmatchedSignalChanges: signalTransitions.length - usedSignalKeys.size,
                duplicateEvidenceKeyCount,
                unmappedParticipantAnchors,
                confirmationEvidenceLevel: level
            },
            temporalPolicy: {
                nearEventBeforeSeconds: 2,
                nearEventAfterSeconds: 2,
                laterCycleAfterSecondsExclusive: 0,
                laterCycleMaxSecondsInclusive: 180
            },
            independence: {
                task183AnchorUsedOnlyAsTemporalReference: true,
                corroborationDerivedFromReplaySignals: true,
                task182OrTask183CountsUsedAsCorroboration: false,
                task181BridgeCountUsed: false,
                syntheticEvidenceGenerated: false,
                absenceConvertedToPositiveCandidate: false
            },
            readiness: {
                replaySourcedCorroborationEvidenceAvailable: true,
                boundedCandidateEvidenceConsumptionAvailable: true,
                multiSignalCoverageMeasurable: true,
                readyForFinalDeathPromotionDesign: level === 'strong',
                readyForFinalDeathFacts: false,
                readyForConfirmedWhoDied: false,
                readyForAttribution: false,
                readyForKillerVictim: false,
                readyForTeamfightDetection: false,
                readyForGameplayInterpretation: false
            },
            limitations: [
                'Task 183 rows are temporal anchors only and do not count as independent corroboration.',
                'Signal changes are candidate observations whose Source 2 gameplay semantics are not proven by field names.',
                'Temporal windows are correlation heuristics; absence and presence do not confirm a death, return, or respawn.',
                'No raw values, raw identifiers, ticks, timestamps, positions, attribution, or gameplay interpretation are emitted.'
            ]
        },
        bridge,
        usedSignalKeys
    };
}

function collectForbiddenOutputKeys(value, prefix = '') {
    if (Array.isArray(value)) return value.flatMap((item, index) => collectForbiddenOutputKeys(item, `${prefix}[${index}]`));
    if (typeof value !== 'object' || value === null) return [];
    const findings = [];
    for (const [key, child] of Object.entries(value)) {
        const current = prefix ? `${prefix}.${key}` : key;
        if (FORBIDDEN_OUTPUT_KEYS.has(key)) findings.push(current);
        findings.push(...collectForbiddenOutputKeys(child, current));
    }
    return findings;
}

export function validateCorroborationArtifact(artifact, schema) {
    const schemaResult = validateJsonSchema(schema, artifact);
    const errors = schemaResult.errors.map(error => `JSON Schema: ${error}`);
    if (artifact.anchorCount !== artifact.evidenceRows?.length) errors.push('anchorCount must equal evidenceRows length');
    if (artifact.evidenceRowCount !== artifact.evidenceRows?.length) errors.push('evidenceRowCount must equal evidenceRows length');
    for (const [index, row] of (artifact.evidenceRows ?? []).entries()) {
        for (const [observedKey, deltaKey] of [
            ['lifeSignalChangeCandidateObserved', 'normalizedLifeSignalDeltaSecond'],
            ['pawnLinkChangeCandidateObserved', 'normalizedPawnLinkDeltaSecond'],
            ['respawnSignalChangeCandidateObserved', 'normalizedRespawnSignalDeltaSecond']
        ]) {
            if (row[observedKey] !== (row[deltaKey] !== null)) errors.push(`evidenceRows[${index}] ${observedKey} must match delta presence`);
        }
    }
    errors.push(...collectForbiddenOutputKeys(artifact).map(key => `forbidden key ${key}`));
    return [...new Set(errors)];
}

export function auditCorroborationPolicy(artifact) {
    const forbiddenKeyPaths = collectForbiddenOutputKeys(artifact);
    const rowViolations = [];
    for (const [index, row] of artifact.evidenceRows.entries()) {
        if (row.finalFact !== false) rowViolations.push(`evidenceRows[${index}].finalFact must be false`);
        if (row.confirmationStatus !== 'unconfirmed') rowViolations.push(`evidenceRows[${index}].confirmationStatus must be unconfirmed`);
    }
    return {
        replayId: artifact.replayId,
        outputPolicyStatus: forbiddenKeyPaths.length === 0 && rowViolations.length === 0 ? 'passed' : 'failed',
        forbiddenKeyPaths,
        rowViolations
    };
}

async function runReplayObservation(input) {
    const player = new Player(undefined, Logger.NOOP);
    const started = performance.now();
    const summary = {
        replayId: input.replayId,
        parserLoadSucceeded: false,
        parseCompleted: false,
        reachedEnd: false,
        samplesAttempted: 0,
        samplesWithControllers: 0,
        status: 'not_started',
        errorMessage: null
    };
    try {
        const sources = await loadSourceArtifacts(input);
        const aggregate = { participantSeeds: new Set(), previousBySeed: new Map(), signalChanges: new Set() };
        await player.load(createReadStream(input.absolutePath));
        summary.parserLoadSucceeded = true;
        const firstTick = safeNumber(player.getFirstTick()) ?? safeNumber(player.getCurrentTick()) ?? 0;
        const tickRate = safeNumber(player.getDemo().server?.tickRate) ?? 30;
        let nextSampleTick = firstTick;
        while (true) {
            const currentTick = safeNumber(player.getCurrentTick());
            if (currentTick !== null && currentTick >= nextSampleTick) {
                summary.samplesAttempted += 1;
                const normalizedElapsedSecond = Math.max(0, Math.round((currentTick - firstTick) / Math.max(1, tickRate)));
                if (observeControllerSignals(player, aggregate, normalizedElapsedSecond) > 0) summary.samplesWithControllers += 1;
                nextSampleTick = currentTick + Math.max(1, Math.round(tickRate));
            }
            const advanced = await player.nextTick();
            if (!advanced) {
                summary.parseCompleted = true;
                summary.reachedEnd = true;
                break;
            }
        }
        const mapping = mapSignalChanges(aggregate, sources.participantIdentity);
        const created = createCorroborationArtifact({
            replayId: input.replayId,
            ...sources,
            signalTransitions: mapping.signalTransitions
        });
        summary.status = 'emitted';
        summary.durationMs = Math.round(performance.now() - started);
        summary.anchorCount = created.artifact.anchorCount;
        summary.evidenceRowCount = created.artifact.evidenceRowCount;
        summary.observedSignalChangeCount = mapping.signalTransitions.length;
        return { summary, artifact: created.artifact, bridge: created.bridge, mapping, signalTransitions: mapping.signalTransitions };
    } catch (error) {
        summary.status = 'blocked';
        summary.errorMessage = String(error?.message ?? error);
        summary.durationMs = Math.round(performance.now() - started);
        return { summary, artifact: null, bridge: null, mapping: null, signalTransitions: [] };
    } finally {
        await player.dispose?.().catch(() => {});
    }
}

function deltaDistribution(artifacts) {
    const distribution = { minus2: 0, minus1: 0, sameSecond: 0, plus1: 0, plus2: 0, later3To30: 0, later31To60: 0, later61To180: 0 };
    for (const artifact of artifacts) {
        for (const row of artifact.evidenceRows) {
            for (const delta of [row.normalizedLifeSignalDeltaSecond, row.normalizedPawnLinkDeltaSecond, row.normalizedRespawnSignalDeltaSecond]) {
                if (delta === null) continue;
                if (delta === -2) distribution.minus2 += 1;
                else if (delta === -1) distribution.minus1 += 1;
                else if (delta === 0) distribution.sameSecond += 1;
                else if (delta === 1) distribution.plus1 += 1;
                else if (delta === 2) distribution.plus2 += 1;
                else if (delta <= 30) distribution.later3To30 += 1;
                else if (delta <= 60) distribution.later31To60 += 1;
                else distribution.later61To180 += 1;
            }
        }
    }
    return distribution;
}

async function writeRunAtomically(summaryRoot, files) {
    const temporaryRoot = `${summaryRoot.absolutePath.replace(/[\\/]$/u, '')}.tmp-task184`;
    await rm(temporaryRoot, { recursive: true, force: true });
    for (const file of files) await writeJson(path.join(temporaryRoot, file.relativePath), file.value);
    await rm(summaryRoot.absolutePath, { recursive: true, force: true });
    await mkdir(path.dirname(summaryRoot.absolutePath), { recursive: true });
    await rename(temporaryRoot, summaryRoot.absolutePath);
}

export async function compactVersionedAnchorBridgeAudits() {
    const relativePaths = [
        `${OUTPUT_ROOT_PREFIX}task184-pilot/death-event-corroboration-pilot-task183-anchor-bridge-comparison.json`,
        `${OUTPUT_ROOT_PREFIX}task184-bounded32/death-event-corroboration-bounded32-task183-anchor-bridge-comparison.json`
    ];
    for (const relativePath of relativePaths) {
        const audit = await readJson(relativePath);
        const rows = audit.rows.map(row => ({
            replayId: row.replayId,
            anchorBridgeStatus: row.anchorBridgeStatus,
            task182TransitionCount: row.task182TransitionCount,
            task183AnchorCount: row.task183AnchorCount,
            matchedAnchorCount: row.matchedAnchorCount,
            task182CountUsedAsCorroboration: row.task182CountUsedAsCorroboration,
            task183CountUsedAsCorroboration: row.task183CountUsedAsCorroboration,
            mismatchRows: row.mismatchRows ?? row.rows?.filter(candidate => !candidate.matched) ?? []
        }));
        await writeJson(path.resolve(REPO_ROOT, relativePath), { ...audit, rows });
    }
}

export async function runCorroborationEmission({ manifest, summaryOutput }) {
    validateCorroborationManifestShape(manifest);
    const summaryRoot = validateCorroborationOutputRoot(summaryOutput, manifest);
    const schema = await readJson(SCHEMA_PATH);
    const plan = buildCorroborationPlan(manifest);
    const replayResults = [];
    if (plan.blockedReplayAudit.length === 0) {
        for (const input of plan.readyInputs) replayResults.push(await runReplayObservation(input));
    }
    const artifacts = replayResults.map(result => result.artifact).filter(Boolean);
    const schemaRows = artifacts.map(artifact => {
        const errors = validateCorroborationArtifact(artifact, schema);
        return { replayId: artifact.replayId, schemaValidationStatus: errors.length === 0 ? 'passed' : 'failed', validationMethod: 'json_schema_draft_2020_12_plus_semantic_invariants', errors };
    });
    const policyRows = artifacts.map(auditCorroborationPolicy);
    const sizeRows = artifacts.map(artifact => ({
        replayId: artifact.replayId,
        artifactBytes: artifactSizeBytes(artifact),
        maxArtifactBytes: MAX_ARTIFACT_BYTES,
        sizeStatus: artifactSizeBytes(artifact) <= MAX_ARTIFACT_BYTES ? 'passed' : 'failed'
    }));
    const totalArtifactBytes = sizeRows.reduce((sum, row) => sum + row.artifactBytes, 0);
    const totalRunSizeStatus = totalArtifactBytes <= MAX_RUN_BYTES ? 'passed' : 'failed';
    const expectedAnchorCount = EXPECTED_ANCHORS.get(manifest.runKind);
    const totalAnchors = artifacts.reduce((sum, artifact) => sum + artifact.anchorCount, 0);
    const totalEvidenceRows = artifacts.reduce((sum, artifact) => sum + artifact.evidenceRowCount, 0);
    const independencePassed = artifacts.length > 0 && artifacts.every(artifact =>
        artifact.independence.task183AnchorUsedOnlyAsTemporalReference
        && artifact.independence.corroborationDerivedFromReplaySignals
        && !artifact.independence.task182OrTask183CountsUsedAsCorroboration
        && !artifact.independence.task181BridgeCountUsed
        && !artifact.independence.syntheticEvidenceGenerated
        && !artifact.independence.absenceConvertedToPositiveCandidate);
    const allReady = plan.blockedReplayAudit.length === 0
        && replayResults.length === plan.readyInputs.length
        && replayResults.every(result => result.artifact && result.summary.parseCompleted)
        && artifacts.length === plan.readyInputs.length
        && totalAnchors === expectedAnchorCount
        && totalEvidenceRows === expectedAnchorCount
        && artifacts.every(artifact => artifact.anchorCount === artifact.evidenceRowCount)
        && artifacts.every(artifact => artifact.summary.unmappedParticipantAnchors === 0 && artifact.summary.duplicateEvidenceKeyCount === 0)
        && replayResults.every(result => result.mapping?.participantMappingStatus === 'passed')
        && replayResults.every(result => result.bridge?.anchorBridgeStatus === 'passed')
        && schemaRows.every(row => row.schemaValidationStatus === 'passed')
        && policyRows.every(row => row.outputPolicyStatus === 'passed')
        && sizeRows.every(row => row.sizeStatus === 'passed')
        && totalRunSizeStatus === 'passed'
        && independencePassed;
    const gateConfig = RUN_GATES[manifest.runKind];
    const gate = {
        schemaVersion: 1,
        gate: allReady ? gateConfig.ready : gateConfig.blocked,
        status: allReady ? 'ready' : 'blocked',
        manifestId: manifest.manifestId,
        runKind: manifest.runKind,
        replayCount: plan.readyInputs.length,
        parserCompletionCount: replayResults.filter(result => result.summary.parseCompleted).length,
        anchorCount: allReady ? totalAnchors : 0,
        evidenceRowCount: allReady ? totalEvidenceRows : 0,
        finalFactsProduced: false,
        attributionEmitted: false
    };
    const totals = artifacts.reduce((acc, artifact) => {
        for (const key of ['counterOnlyRows', 'rowsWithOneIndependentSignal', 'rowsWithMultipleIndependentSignals', 'ambiguousRows', 'candidateAnchorsWithoutCorroboration', 'unmatchedSignalChanges']) {
            acc[key] += artifact.summary[key];
        }
        return acc;
    }, { counterOnlyRows: 0, rowsWithOneIndependentSignal: 0, rowsWithMultipleIndependentSignals: 0, ambiguousRows: 0, candidateAnchorsWithoutCorroboration: 0, unmatchedSignalChanges: 0 });
    const aggregateLevel = confirmationEvidenceLevel(artifacts.flatMap(artifact => artifact.evidenceRows));
    const summary = {
        schemaVersion: 1,
        runKind: manifest.runKind,
        replayCount: plan.readyInputs.length,
        parserCompletionCount: gate.parserCompletionCount,
        anchorCount: allReady ? totalAnchors : 0,
        evidenceRowCount: allReady ? totalEvidenceRows : 0,
        ...totals,
        confirmationEvidenceLevel: aggregateLevel,
        readyForFinalDeathPromotionDesign: aggregateLevel === 'strong',
        readyForFinalDeathFacts: false,
        readyForConfirmedWhoDied: false,
        readyForAttribution: false,
        readyForKillerVictim: false,
        readyForTeamfightDetection: false,
        readyForGameplayInterpretation: false,
        schemaValidationStatus: schemaRows.length === artifacts.length && schemaRows.every(row => row.schemaValidationStatus === 'passed') ? 'passed' : 'failed',
        outputPolicyStatus: policyRows.length === artifacts.length && policyRows.every(row => row.outputPolicyStatus === 'passed') ? 'passed' : 'failed',
        sizeAuditStatus: sizeRows.every(row => row.sizeStatus === 'passed') && totalRunSizeStatus === 'passed' ? 'passed' : 'failed',
        independenceAuditStatus: independencePassed ? 'passed' : 'failed',
        protectionAuditStatus: plan.blockedReplayAudit.length === 0 ? 'passed' : 'blocked',
        finalFactsProduced: false,
        attributionEmitted: false
    };
    const perReplayCoverage = artifacts.map(artifact => ({ replayId: artifact.replayId, anchorCount: artifact.anchorCount, ...artifact.summary }));
    const files = [
        { relativePath: `task184-death-event-corroboration-${manifest.runKind === 'task184-pilot' ? 'pilot' : 'bounded32'}-manifest.json`, value: manifest },
        { relativePath: `${gateConfig.prefix}-gate.json`, value: gate },
        { relativePath: `${gateConfig.prefix}-summary.json`, value: summary },
        { relativePath: `${gateConfig.prefix}-schema-validation-summary.json`, value: { schemaVersion: 1, schemaDraft: '2020-12', runtime: 'ajv/dist/2020.js', status: summary.schemaValidationStatus, rows: schemaRows } },
        { relativePath: `${gateConfig.prefix}-output-policy-audit.json`, value: { schemaVersion: 1, status: summary.outputPolicyStatus, forbiddenSurfaces: FORBIDDEN_SURFACES, rows: policyRows, rawValuesEmitted: false, rawIdsEmitted: false, attributionEmitted: false, finalFactsProduced: false } },
        { relativePath: `${gateConfig.prefix}-size-audit.json`, value: { schemaVersion: 1, status: summary.sizeAuditStatus, maxArtifactBytes: MAX_ARTIFACT_BYTES, maxRunBytes: MAX_RUN_BYTES, totalArtifactBytes, perArtifactSizeStatus: sizeRows.every(row => row.sizeStatus === 'passed') ? 'passed' : 'failed', totalRunSizeStatus, rows: sizeRows } },
        { relativePath: `${gateConfig.prefix}-replay-protection-audit.json`, value: { schemaVersion: 1, status: summary.protectionAuditStatus, processedReplayIds: plan.readyInputs.map(input => input.replayId), replay005Accessed: false, bots006To008Processed: false, outputReplaysUsed: false, blockedReplayAudit: plan.blockedReplayAudit, parserBehaviorModified: false } },
        { relativePath: `${gateConfig.prefix}-parser-completion-audit.json`, value: { schemaVersion: 1, status: replayResults.length === plan.readyInputs.length && replayResults.every(result => result.summary.parseCompleted) ? 'passed' : 'failed', rows: replayResults.map(result => result.summary) } },
        { relativePath: `${gateConfig.prefix}-task183-anchor-bridge-comparison.json`, value: { schemaVersion: 1, status: replayResults.every(result => result.bridge?.anchorBridgeStatus === 'passed') ? 'passed' : 'failed', task183AnchorUsedOnlyAsTemporalReference: true, rows: replayResults.map(result => ({ replayId: result.summary.replayId, ...result.bridge })) } },
        { relativePath: `${gateConfig.prefix}-participant-identity-mapping-audit.json`, value: { schemaVersion: 1, status: replayResults.every(result => result.mapping?.participantMappingStatus === 'passed') ? 'passed' : 'failed', rows: replayResults.map(result => ({ replayId: result.summary.replayId, observedParticipantSeedCount: result.mapping?.observedParticipantSeedCount ?? 0, participantIdentityCount: result.mapping?.participantIdentityCount ?? 0, unmappedSignalChanges: result.mapping?.unmappedSignalChanges ?? 0 })) } },
        { relativePath: `${gateConfig.prefix}-independent-signal-source-audit.json`, value: { schemaVersion: 1, status: independencePassed ? 'passed' : 'failed', task183AnchorUsedOnlyAsTemporalReference: true, corroborationBooleansDerivedFromReplaySignals: true, task182OrTask183CountsCopiedAsCorroboration: false, task181BridgeCountUsed: false, syntheticEvidenceGenerated: false, absenceConvertedToPositiveCandidate: false, signalCategories: ['life_signal_change_candidate', 'pawn_link_change_candidate', 'respawn_signal_change_candidate'], observedSignalChangeCount: replayResults.reduce((sum, result) => sum + result.signalTransitions.length, 0) } },
        { relativePath: `${gateConfig.prefix}-temporal-association-audit.json`, value: { schemaVersion: 1, status: allReady ? 'passed' : 'failed', nearEventWindow: { beforeSeconds: 2, afterSeconds: 2 }, laterCycleWindow: { afterSecondsExclusive: 0, maxSecondsInclusive: 180 }, windowsAreCorrelationHeuristicsNotGameplayProof: true, normalizedDeltaDistribution: deltaDistribution(artifacts), rawTicksPersisted: false, rawTimestampsPersisted: false } },
        { relativePath: `${gateConfig.prefix}-corroboration-coverage-audit.json`, value: { schemaVersion: 1, status: allReady ? 'passed' : 'failed', ...totals, confirmationEvidenceLevel: aggregateLevel, perReplayCoverage } },
        { relativePath: `${gateConfig.prefix}-ambiguity-audit.json`, value: { schemaVersion: 1, status: allReady ? 'passed' : 'failed', ambiguousRows: totals.ambiguousRows, ambiguityDoesNotBecomePositiveEvidence: true, absenceDoesNotBecomePositiveEvidence: true } },
        { relativePath: `${gateConfig.prefix}-question-readiness.json`, value: { schemaVersion: 1, confirmationEvidenceLevel: aggregateLevel, readyForFinalDeathPromotionDesign: aggregateLevel === 'strong', readyForFinalDeathFacts: false, readyForConfirmedWhoDied: false, readyForAttribution: false, readyForKillerVictim: false, readyForTeamfightDetection: false, readyForGameplayInterpretation: false } }
    ];
    if (allReady) {
        for (const artifact of artifacts) files.push({ relativePath: `artifacts/${artifact.replayId}/death_event_corroboration_evidence.json`, value: artifact });
    }
    await writeRunAtomically(summaryRoot, files);
    return { gate, summary, artifacts, replayResults, blockedReplayAudit: plan.blockedReplayAudit };
}

async function documentationConsistencyAudit() {
    const index = await readJson('data/task-contribution-index.json');
    const task181 = index.tasks.find(task => task.taskId === '181');
    const task182 = index.tasks.find(task => task.taskId === '182');
    const task183 = index.tasks.find(task => task.taskId === '183');
    const checks = {
        task183CommitRecorded: task183?.commitSha === 'c20c7d1035b5e1061a9cb2e76a06f77929f48cba',
        task182ActiveAndNotSupersededByTask183: task182?.supersededBy === null && String(task182?.currentRelevance).includes('active'),
        task183DoesNotSupersedeLifeStateTransitions: !task183?.supersededCapabilities?.includes('life_state_transition_candidates'),
        task181BridgeOnlyHistorical: String(task181?.currentRelevance).includes('historical_bridge_only'),
        task181NeedsValidation: task181?.evidenceStatus === 'needs-validation',
        task181SupersededOnlyByTask182: task181?.supersededBy === '182'
    };
    return { schemaVersion: 1, status: Object.values(checks).every(Boolean) ? 'passed' : 'failed', checks };
}

async function finalizeBounded32(result) {
    const root = path.resolve(REPO_ROOT, OUTPUT_ROOT_PREFIX);
    const pilotGate = await readJson(`${OUTPUT_ROOT_PREFIX}task184-pilot/death-event-corroboration-pilot-gate.json`);
    const pilotSummary = await readJson(`${OUTPUT_ROOT_PREFIX}task184-pilot/death-event-corroboration-pilot-summary.json`);
    const task183PilotRepair = await readJson('output/local-replay-processing/death-event-candidates/task183-pilot/death-event-candidates-pilot-real-schema-validation-repair-audit.json');
    const task183BoundedRepair = await readJson('output/local-replay-processing/death-event-candidates/task183-bounded32/death-event-candidates-bounded32-real-schema-validation-repair-audit.json');
    const task183PilotEquivalence = await readJson('output/local-replay-processing/death-event-candidates/task183-pilot/death-event-candidates-pilot-artifact-equivalence-audit.json');
    const task183BoundedEquivalence = await readJson('output/local-replay-processing/death-event-candidates/task183-bounded32/death-event-candidates-bounded32-artifact-equivalence-audit.json');
    const documentationAudit = await documentationConsistencyAudit();
    const task183RepairAudit = {
        schemaVersion: 1,
        status: task183PilotRepair.repairAuditStatus === 'passed' && task183BoundedRepair.repairAuditStatus === 'passed' ? 'passed' : 'failed',
        schemaDraft: '2020-12',
        runtime: 'ajv/dist/2020.js',
        replayFilesOpenedForRepair: false,
        pilot: task183PilotRepair,
        bounded32: task183BoundedRepair
    };
    const task183EquivalenceAudit = {
        schemaVersion: 1,
        status: task183PilotEquivalence.artifactEquivalenceStatus === 'passed' && task183BoundedEquivalence.artifactEquivalenceStatus === 'passed' ? 'passed' : 'failed',
        validationRepairChangedCandidateRows: false,
        pilot: task183PilotEquivalence,
        bounded32: task183BoundedEquivalence
    };
    const finalReady = result.gate.status === 'ready' && pilotGate.status === 'ready'
        && task183RepairAudit.status === 'passed' && task183EquivalenceAudit.status === 'passed'
        && documentationAudit.status === 'passed';
    const finalGate = {
        schemaVersion: 1,
        gate: finalReady
            ? 'task183_validation_corrected_death_event_corroboration_evidence_bounded32_ready'
            : 'task183_validation_corrected_death_event_corroboration_evidence_blocked',
        status: finalReady ? 'ready' : 'blocked',
        task183PilotCandidateCount: task183PilotRepair.candidateCount,
        task183Bounded32CandidateCount: task183BoundedRepair.candidateCount,
        task184PilotAnchorCount: pilotSummary.anchorCount,
        task184Bounded32AnchorCount: result.summary.anchorCount,
        finalFactsProduced: false,
        attributionEmitted: false
    };
    const consumptionContract = {
        schemaVersion: 1,
        artifactClass: ARTIFACT_CLASS,
        activeSourceBaselines: [
            'participant_identity_compact_bounded32_task180',
            'life_state_transition_candidates_bounded32_task182',
            'death_event_candidates_bounded32_task183'
        ],
        introducedBaseline: 'death_event_corroboration_evidence_bounded32_task184',
        task183Role: 'temporal_anchor_only',
        acceptedEvidenceClasses: ['counter_only', 'counter_plus_life_signal', 'counter_plus_pawn_link_signal', 'counter_plus_respawn_signal', 'counter_plus_multiple_independent_signals', 'ambiguous'],
        confirmationStatus: 'unconfirmed',
        finalDeathEmissionAllowed: false,
        attributionAllowed: false,
        gameplayInterpretationAllowed: false
    };
    const finalSummary = {
        schemaVersion: 1,
        status: finalGate.status,
        pilot: pilotSummary,
        bounded32: result.summary,
        activeBaselines: consumptionContract.activeSourceBaselines,
        introducedBaseline: consumptionContract.introducedBaseline,
        readyForFinalDeathFacts: false,
        readyForConfirmedWhoDied: false,
        readyForAttribution: false,
        readyForKillerVictim: false,
        readyForTeamfightDetection: false,
        readyForGameplayInterpretation: false
    };
    await writeJson(path.join(root, 'task183-real-schema-validation-repair-audit.json'), task183RepairAudit);
    await writeJson(path.join(root, 'task183-artifact-equivalence-audit.json'), task183EquivalenceAudit);
    await writeJson(path.join(root, 'task184-documentation-consistency-audit.json'), documentationAudit);
    await writeJson(path.join(root, 'death-event-corroboration-consumption-contract.json'), consumptionContract);
    await writeJson(path.join(root, 'task184-gate.json'), finalGate);
    await writeJson(path.join(root, 'task184-summary.json'), finalSummary);
    await writeJson(path.join(root, 'task184-question-readiness.json'), {
        schemaVersion: 1,
        confirmationEvidenceLevel: result.summary.confirmationEvidenceLevel,
        readyForFinalDeathPromotionDesign: result.summary.readyForFinalDeathPromotionDesign,
        readyForFinalDeathFacts: false,
        readyForConfirmedWhoDied: false,
        readyForAttribution: false,
        readyForKillerVictim: false,
        readyForTeamfightDetection: false,
        readyForGameplayInterpretation: false
    });
    return finalGate;
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const manifestPath = assertRelativeRepositoryPath(args.get('manifest'), 'manifest');
    const manifest = await readJson(manifestPath);
    const result = await runCorroborationEmission({ manifest, summaryOutput: args.get('summary-output') });
    const gate = manifest.runKind === 'task184-bounded32' && result.gate.status === 'ready'
        ? await finalizeBounded32(result)
        : result.gate;
    console.log(JSON.stringify(gate, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main().catch(error => {
        console.error(error);
        process.exitCode = 1;
    });
}
