#!/usr/bin/env node
import { createReadStream } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Logger, Player } from 'deadem';

const THIS_FILE = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(THIS_FILE), '..');
const ARTIFACT_CLASS = 'participant_identity';
const MODE = 'participant_identity_compact_emission';
const GENERATED_BY = 'tools/emit-participant-identity-compact-artifacts.mjs';
const GENERATED_AT = 'task_180';
const OUTPUT_ROOT_PREFIX = 'output/local-replay-processing/participant-identity-compact/';
const CONTROLLER_CLASS = 'CCitadelPlayerController';
const MAX_ARTIFACT_BYTES = 48 * 1024;
const MAX_RUN_BYTES = 2 * 1024 * 1024;
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
    'events',
    'eventRows',
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
    'deathEvents',
    'respawnEvents',
    'snapshot',
    'snapshots',
    'entityHistory',
    'entityHistories'
]);

export const FORBIDDEN_SURFACES = [
    'death_validation_emission',
    'semantic_foundation_emission',
    'death_events',
    'respawn_events',
    'timelines',
    'objective_lifecycle',
    'player_names',
    'hero_names',
    'team_names',
    'raw_entity_ids',
    'raw_handles',
    'account_ids',
    'steam_ids',
    'raw_player_slots',
    'raw_hero_ids',
    'raw_team_numbers',
    'field_values',
    'map_positions',
    'event_rows',
    'attribution',
    'final_facts',
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
    if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed.length > 0 ? trimmed : null;
    }
    if (typeof value === 'object') return String(value);
    return null;
}

function safeField(entity, candidates) {
    for (const candidate of candidates) {
        try {
            const value = entity.getField(candidate);
            const normalized = normalizeValue(value);
            if (normalized !== null) return normalized;
        } catch {
            // Field absence is expected while probing compact signal availability.
        }
    }
    return null;
}

function statusFromCounts(count, total) {
    if (total <= 0) return 'blocked';
    if (count === total) return 'available';
    if (count > 0) return 'partial';
    return 'blocked';
}

function linkStatus({ observed, samples }) {
    if (!observed) return 'blocked';
    return samples > 1 ? 'stable' : 'observed';
}

function twoDigit(index) {
    return String(index).padStart(2, '0');
}

function compactBlockedStatus(replay, reasons) {
    return {
        schemaVersion: 1,
        replayId: replay?.replayId ?? null,
        localPath: replay?.localPath ?? null,
        status: 'blocked',
        reasons,
        filesystemAccessAttempted: false,
        openReadStreamAttempted: false,
        parseAttempted: false,
        artifactClassEmitted: null,
        rawDataCaptured: false,
        fieldValuesCaptured: false,
        finalFactsProduced: false,
        gameplayInterpretationProduced: false
    };
}

function forbiddenReplayReasons(replay) {
    const replayId = String(replay?.replayId ?? '');
    const localPath = slash(replay?.localPath ?? '');
    const lowerPath = localPath.toLowerCase();
    const reasons = [];
    if (FORBIDDEN_REPLAY_IDS.has(replayId)) reasons.push(`${replayId}_globally_blocked`);
    if (/replay[_-]?00?5/iu.test(lowerPath) || /(?:^|\/)(?:partida|replay|match)[_-]?00?5(?:\.dem)?$/iu.test(lowerPath)) {
        reasons.push('protected_replay_005_final_holdout');
    }
    if (/(?:^|\/)(?:partida|replay|match)[_-]?00?[6-8](?:\.dem)?$/iu.test(lowerPath)) {
        reasons.push('unsupported_bot_fixture_006_008');
    }
    if (path.isAbsolute(localPath)) reasons.push('absolute_path_forbidden');
    if (lowerPath === '..' || lowerPath.startsWith('../') || lowerPath.includes('/../')) reasons.push('path_traversal_forbidden');
    if (lowerPath.startsWith('output/replays/')) reasons.push('output_replays_path_forbidden');
    return [...new Set(reasons)];
}

function normalizeReplay(replay) {
    return {
        replayId: replay?.replayId ?? null,
        localPath: replay?.localPath ?? null,
        selectionGroup: replay?.selectionGroup ?? null,
        requestedMode: replay?.requestedMode ?? replay?.mode ?? MODE,
        semanticFoundationArtifactPath: replay?.semanticFoundationArtifactPath ?? null,
        deathValidationArtifactPath: replay?.deathValidationArtifactPath ?? null
    };
}

export function validateParticipantIdentityManifestShape(manifest) {
    if (typeof manifest !== 'object' || manifest === null || Array.isArray(manifest)) throw new Error('manifest must be an object');
    if (manifest.schemaVersion !== 1) throw new Error('manifest schemaVersion must be 1');
    if (!manifest.manifestId) throw new Error('manifestId is required');
    if (manifest.mode !== MODE) throw new Error(`manifest mode must be ${MODE}`);
    if (manifest.artifactClass !== ARTIFACT_CLASS) throw new Error(`manifest artifactClass must be ${ARTIFACT_CLASS}`);
    if (manifest.replayProcessingAllowed !== true) throw new Error('manifest must explicitly allow replay processing');
    if (manifest.realArtifactEmissionAllowed !== true) throw new Error('manifest must explicitly allow real artifact emission');
    if (manifest.generationLabel !== GENERATED_AT) throw new Error(`manifest generationLabel must be ${GENERATED_AT}`);
    if (manifest.rawDataCaptured !== false) throw new Error('manifest rawDataCaptured must be false');
    if (manifest.fieldValuesCaptured !== false) throw new Error('manifest fieldValuesCaptured must be false');
    if (manifest.finalFactsProduced !== false) throw new Error('manifest finalFactsProduced must be false');
    if (manifest.gameplayInterpretationProduced !== false) throw new Error('manifest gameplayInterpretationProduced must be false');
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

export function validateParticipantIdentityOutputRoot(summaryOutput, manifest) {
    const normalized = assertRelativeRepositoryPath(summaryOutput, 'summary output').replace(/\/?$/u, '/');
    const expected = `${OUTPUT_ROOT_PREFIX}${manifest.runKind}/`;
    if (normalized !== expected) throw new Error(`summary output root must be exactly ${expected}`);
    return { normalized, absolutePath: path.resolve(REPO_ROOT, normalized) };
}

export function buildParticipantIdentityPlan(manifest) {
    validateParticipantIdentityManifestShape(manifest);
    const allowlist = manifest.allowedReplays.map(normalizeReplay);
    const requested = (Array.isArray(manifest.requestedReplays) && manifest.requestedReplays.length > 0
        ? manifest.requestedReplays
        : manifest.allowedReplays).map(normalizeReplay);
    const allowlistById = new Map();
    for (const replay of allowlist) {
        if (!replay.replayId || !replay.localPath || !replay.semanticFoundationArtifactPath || !replay.deathValidationArtifactPath) {
            throw new Error('allowedReplays entries require replayId, localPath, semanticFoundationArtifactPath, and deathValidationArtifactPath');
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
        if (allowed && replay.localPath && slash(replay.localPath) !== slash(allowed.localPath)) reasons.push('manifest_path_mismatch');
        if (reasons.length > 0) {
            const blocked = compactBlockedStatus(replay, [...new Set(reasons)]);
            blockedReplayAudit.push(blocked);
            perReplayStatus.push(blocked);
            continue;
        }
        const normalizedPath = assertRelativeRepositoryPath(allowed.localPath, `${allowed.replayId} localPath`);
        const semanticFoundationArtifactPath = assertRelativeRepositoryPath(
            allowed.semanticFoundationArtifactPath,
            `${allowed.replayId} semanticFoundationArtifactPath`
        );
        const deathValidationArtifactPath = assertRelativeRepositoryPath(allowed.deathValidationArtifactPath, `${allowed.replayId} deathValidationArtifactPath`);
        const input = {
            ...allowed,
            localPath: normalizedPath,
            semanticFoundationArtifactPath,
            deathValidationArtifactPath,
            absolutePath: path.resolve(REPO_ROOT, normalizedPath),
            inputLabel: path.basename(normalizedPath)
        };
        readyInputs.push(input);
        perReplayStatus.push({
            schemaVersion: 1,
            replayId: input.replayId,
            localPath: input.localPath,
            status: 'planned',
            filesystemAccessAttempted: false,
            openReadStreamAttempted: false,
            parseAttempted: false,
            artifactClassEmitted: null,
            rawDataCaptured: false,
            fieldValuesCaptured: false,
            finalFactsProduced: false,
            gameplayInterpretationProduced: false
        });
    }
    return { readyInputs, blockedReplayAudit, perReplayStatus };
}

function observeParticipants(player, aggregate) {
    const controllers = player.getDemo().getEntitiesByClassName(CONTROLLER_CLASS);
    let fallbackOrdinal = 0;
    for (const controller of controllers) {
        fallbackOrdinal += 1;
        const participantSeed = safeField(controller, ['m_iPlayerSlot', 'm_iPlayerID', 'm_unAccountID', 'm_iAccountID', 'm_steamID'])
            ?? `observed-controller-${fallbackOrdinal}`;
        const record = aggregate.participants.get(participantSeed) ?? {
            participantSeed,
            samples: 0,
            controllerObserved: false,
            pawnSeed: null,
            teamSeed: null,
            heroSeed: null,
            deathCounter: false,
            aliveDead: false,
            respawn: false
        };
        record.samples += 1;
        record.controllerObserved = true;
        record.pawnSeed ??= safeField(controller, ['m_hPawn', 'm_hAssignedHero', 'm_hHeroPawn']);
        record.teamSeed ??= safeField(controller, ['m_iTeamNum', 'm_iTeam', 'm_nTeamNum']);
        record.heroSeed ??= safeField(controller, ['m_nHeroID', 'm_eHeroType', 'm_iHeroID', 'm_iSelectedHero']);
        record.deathCounter = record.deathCounter || safeField(controller, ['m_iDeaths']) !== null;
        record.aliveDead = record.aliveDead || safeField(controller, ['m_lifeState', 'm_iHealth', 'm_bAlive']) !== null;
        record.respawn = record.respawn || safeField(controller, ['m_iRespawnTime', 'm_flRespawnTime', 'm_bRespawning']) !== null;
        aggregate.participants.set(participantSeed, record);
    }
}

function stableSorted(values) {
    return [...values].sort((left, right) => {
        const leftNumber = Number(left);
        const rightNumber = Number(right);
        if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) return leftNumber - rightNumber;
        return String(left).localeCompare(String(right));
    });
}

function syntheticMap(seeds, prefix) {
    const map = new Map();
    stableSorted(seeds).forEach((seed, index) => map.set(seed, `${prefix}_${twoDigit(index + 1)}`));
    return map;
}

export function createParticipantIdentityArtifact({ replayId, participantRecords, timeSignals, semanticFoundation, deathValidation }) {
    const sortedRecords = stableSorted(participantRecords.map(record => record.participantSeed))
        .map(seed => participantRecords.find(record => record.participantSeed === seed));
    const teamMap = syntheticMap(sortedRecords.map(record => record.teamSeed).filter(Boolean), 'team_ref');
    const heroMap = syntheticMap(sortedRecords.map(record => record.heroSeed).filter(Boolean), 'hero_ref');
    const participantCount = sortedRecords.length;
    const participants = sortedRecords.map((record, index) => {
        const ordinal = twoDigit(index + 1);
        const hasLifeSignal = record.deathCounter || record.aliveDead || record.respawn;
        return {
            participantKey: `participant_${ordinal}`,
            controllerRefKey: `controller_ref_${ordinal}`,
            pawnRefKey: record.pawnSeed ? `pawn_ref_${ordinal}` : `pawn_ref_unknown_${ordinal}`,
            teamRefKey: record.teamSeed ? teamMap.get(record.teamSeed) : `team_ref_unknown_${ordinal}`,
            heroRefKey: record.heroSeed ? heroMap.get(record.heroSeed) : `hero_ref_unknown_${ordinal}`,
            controllerLinkStatus: linkStatus({ observed: record.controllerObserved, samples: record.samples }),
            pawnLinkStatus: linkStatus({ observed: Boolean(record.pawnSeed), samples: record.samples }),
            teamSignalStatus: record.teamSeed ? 'available' : 'blocked',
            heroSignalStatus: record.heroSeed ? 'available' : 'blocked',
            lifeStateSignalStatus: hasLifeSignal ? 'available' : 'blocked'
        };
    });
    const participantsWithTeamSignal = participants.filter(participant => participant.teamSignalStatus === 'available').length;
    const participantsWithHeroSignal = participants.filter(participant => participant.heroSignalStatus === 'available').length;
    const deathCounterCount = sortedRecords.filter(record => record.deathCounter).length;
    const aliveDeadCount = sortedRecords.filter(record => record.aliveDead).length;
    const respawnCount = sortedRecords.filter(record => record.respawn).length;
    const identityStatus = participantCount > 0 && participants.every(participant => participant.controllerLinkStatus !== 'blocked')
        ? 'available'
        : participantCount > 0 ? 'partial' : 'blocked';
    const readyForAliveDeadRespawnArtifact = participantCount > 0 && deathCounterCount > 0 && (aliveDeadCount > 0 || respawnCount > 0);
    const timeAvailable = timeSignals.tickProgressionObserved
        && semanticFoundation.timeSignals?.timeNormalizationStatus === 'available';

    return {
        schemaVersion: 1,
        replayId,
        artifactClass: ARTIFACT_CLASS,
        sourceMethod: 'synthetic_participant_identity_mapping',
        generatedBy: GENERATED_BY,
        generatedAt: GENERATED_AT,
        rawDataCaptured: false,
        fieldValuesCaptured: false,
        finalFactsProduced: false,
        gameplayInterpretationProduced: false,
        playerNamesIncluded: false,
        heroNamesIncluded: false,
        teamNamesIncluded: false,
        entityIdsIncluded: false,
        mapPositionsIncluded: false,
        eventRowsIncluded: false,
        deathEventsEmitted: false,
        attributionEmitted: false,
        participantCount,
        syntheticParticipantKeyPattern: 'participant_##',
        participantIdentityStatus: identityStatus,
        participants,
        teamPartition: {
            teamPartitionStatus: statusFromCounts(participantsWithTeamSignal, participantCount),
            teamRefCount: teamMap.size,
            participantsWithTeamSignal
        },
        heroCoverage: {
            heroCoverageStatus: statusFromCounts(participantsWithHeroSignal, participantCount),
            participantsWithHeroSignal
        },
        timeFoundation: {
            tickProgressionObserved: timeSignals.tickProgressionObserved,
            timeNormalizationStatus: timeAvailable ? 'available' : timeSignals.tickProgressionObserved ? 'partial' : 'blocked',
            normalizedTimeBaseAvailable: timeAvailable,
            perEventTicksEmitted: false,
            perEventTimestampsEmitted: false
        },
        lifeStateFoundation: {
            deathCounterCoverageStatus: statusFromCounts(deathCounterCount, participantCount),
            aliveDeadSignalCoverageStatus: statusFromCounts(aliveDeadCount, participantCount),
            respawnSignalCoverageStatus: statusFromCounts(respawnCount, participantCount),
            readyForAliveDeadRespawnArtifact
        },
        deathValidationBridge: {
            deathValidationArtifactFound: deathValidation.found,
            eventCount: deathValidation.eventCount,
            eventCountMeaning: EVENT_COUNT_MEANING,
            canUseAsDeathEventSourceAlone: false
        },
        readiness: {
            readyForParticipantIdentityConsumption: identityStatus === 'available',
            readyForAliveDeadRespawnArtifact,
            readyForCanonicalDeathEventDesign: false,
            readyForAttribution: false,
            readyForTeamfightDetection: false
        },
        limitations: [
            'Participant, controller, pawn, team, and hero refs are synthetic and replay-local; raw source values are not persisted.',
            'This artifact emits no player names, hero names, team names, raw IDs, handles, slots, field values, positions, or event rows.',
            'deathValidationBridge.eventCount is a source-observed counter-transition candidate count, not a final death fact.',
            'Canonical death events, attribution, teamfight detection, and gameplay interpretation remain unauthorized.'
        ]
    };
}

function validateNestedObject(name, value, required) {
    const errors = [];
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return [`${name} must be object`];
    for (const key of required) {
        if (!(key in value)) errors.push(`${name}.${key} missing`);
    }
    return errors;
}

export function validateParticipantIdentityArtifact(artifact, schema) {
    const errors = [];
    if (typeof artifact !== 'object' || artifact === null || Array.isArray(artifact)) return ['artifact must be object'];
    for (const required of schema.required) {
        if (!(required in artifact)) errors.push(`missing required ${required}`);
    }
    for (const key of Object.keys(artifact)) {
        if (!(key in schema.properties)) errors.push(`additional property ${key} is forbidden`);
        if (FORBIDDEN_OUTPUT_KEYS.has(key)) errors.push(`forbidden key ${key}`);
    }
    const serialized = JSON.stringify(artifact);
    for (const forbidden of FORBIDDEN_OUTPUT_KEYS) {
        if (new RegExp(`\"${forbidden}\"\\s*:`, 'u').test(serialized)) errors.push(`forbidden nested key ${forbidden}`);
    }
    if (artifact.schemaVersion !== 1) errors.push('schemaVersion must be 1');
    if (!/^replay_[0-9]{3}$/u.test(String(artifact.replayId ?? ''))) errors.push('replayId pattern violation');
    if (artifact.artifactClass !== ARTIFACT_CLASS) errors.push(`artifactClass must be ${ARTIFACT_CLASS}`);
    if (artifact.sourceMethod !== 'synthetic_participant_identity_mapping') errors.push('sourceMethod violation');
    if (artifact.generatedBy !== GENERATED_BY) errors.push('generatedBy violation');
    if (artifact.generatedAt !== GENERATED_AT) errors.push('generatedAt violation');
    for (const booleanFalse of [
        'rawDataCaptured',
        'fieldValuesCaptured',
        'finalFactsProduced',
        'gameplayInterpretationProduced',
        'playerNamesIncluded',
        'heroNamesIncluded',
        'teamNamesIncluded',
        'entityIdsIncluded',
        'mapPositionsIncluded',
        'eventRowsIncluded',
        'deathEventsEmitted',
        'attributionEmitted'
    ]) {
        if (artifact[booleanFalse] !== false) errors.push(`${booleanFalse} must be false`);
    }
    if (!Number.isInteger(artifact.participantCount) || artifact.participantCount < 0 || artifact.participantCount > 24) {
        errors.push('participantCount must be integer 0..24');
    }
    if (!Array.isArray(artifact.participants) || artifact.participants.length !== artifact.participantCount) {
        errors.push('participants length must match participantCount');
    }
    const participantKeys = new Set();
    for (const participant of artifact.participants ?? []) {
        for (const key of ['participantKey', 'controllerRefKey', 'pawnRefKey', 'teamRefKey', 'heroRefKey']) {
            if (typeof participant[key] !== 'string') errors.push(`participant.${key} must be string`);
        }
        if (participantKeys.has(participant.participantKey)) errors.push(`duplicate participantKey ${participant.participantKey}`);
        participantKeys.add(participant.participantKey);
    }
    errors.push(...validateNestedObject('teamPartition', artifact.teamPartition, ['teamPartitionStatus', 'teamRefCount', 'participantsWithTeamSignal']));
    errors.push(...validateNestedObject('heroCoverage', artifact.heroCoverage, ['heroCoverageStatus', 'participantsWithHeroSignal']));
    errors.push(...validateNestedObject('timeFoundation', artifact.timeFoundation, [
        'tickProgressionObserved',
        'timeNormalizationStatus',
        'normalizedTimeBaseAvailable',
        'perEventTicksEmitted',
        'perEventTimestampsEmitted'
    ]));
    errors.push(...validateNestedObject('lifeStateFoundation', artifact.lifeStateFoundation, [
        'deathCounterCoverageStatus',
        'aliveDeadSignalCoverageStatus',
        'respawnSignalCoverageStatus',
        'readyForAliveDeadRespawnArtifact'
    ]));
    errors.push(...validateNestedObject('deathValidationBridge', artifact.deathValidationBridge, [
        'deathValidationArtifactFound',
        'eventCount',
        'eventCountMeaning',
        'canUseAsDeathEventSourceAlone'
    ]));
    errors.push(...validateNestedObject('readiness', artifact.readiness, [
        'readyForParticipantIdentityConsumption',
        'readyForAliveDeadRespawnArtifact',
        'readyForCanonicalDeathEventDesign',
        'readyForAttribution',
        'readyForTeamfightDetection'
    ]));
    if (artifact.timeFoundation?.perEventTicksEmitted !== false) errors.push('perEventTicksEmitted must be false');
    if (artifact.timeFoundation?.perEventTimestampsEmitted !== false) errors.push('perEventTimestampsEmitted must be false');
    if (artifact.deathValidationBridge?.eventCountMeaning !== EVENT_COUNT_MEANING) errors.push('eventCountMeaning violation');
    if (artifact.deathValidationBridge?.canUseAsDeathEventSourceAlone !== false) errors.push('canUseAsDeathEventSourceAlone must be false');
    if (artifact.readiness?.readyForCanonicalDeathEventDesign !== false) errors.push('readyForCanonicalDeathEventDesign must be false');
    if (artifact.readiness?.readyForAttribution !== false) errors.push('readyForAttribution must be false');
    if (artifact.readiness?.readyForTeamfightDetection !== false) errors.push('readyForTeamfightDetection must be false');
    if (!Array.isArray(artifact.limitations) || artifact.limitations.length < 1 || artifact.limitations.length > 12) {
        errors.push('limitations must contain 1..12 strings');
    }
    return [...new Set(errors)];
}

export function auditParticipantIdentityPolicy(artifact) {
    const serialized = JSON.stringify(artifact);
    const forbiddenTokens = [
        '"playerName"',
        '"heroName"',
        '"teamName"',
        '"entityId"',
        '"handle"',
        '"accountId"',
        '"steamId"',
        '"playerSlot"',
        '"heroId"',
        '"teamNumber"',
        '"fieldValues"',
        '"rawValues"',
        '"events"',
        '"eventRows"',
        '"tick"',
        '"timestamp"',
        '"position"',
        '"killer"',
        '"victim"',
        '"damageSource"',
        '"objectiveId"',
        '"deathEvents"',
        '"respawnEvents"',
        '"finalFactsProduced":true',
        '"gameplayInterpretationProduced":true'
    ];
    const violations = forbiddenTokens.filter(token => serialized.includes(token));
    return {
        schemaVersion: 1,
        replayId: artifact.replayId,
        artifactClass: artifact.artifactClass,
        policyStatus: violations.length === 0 ? 'passed' : 'failed',
        violations,
        rawDataCaptured: artifact.rawDataCaptured,
        fieldValuesCaptured: artifact.fieldValuesCaptured,
        finalFactsProduced: artifact.finalFactsProduced,
        gameplayInterpretationProduced: artifact.gameplayInterpretationProduced,
        playerNamesIncluded: artifact.playerNamesIncluded,
        heroNamesIncluded: artifact.heroNamesIncluded,
        teamNamesIncluded: artifact.teamNamesIncluded,
        entityIdsIncluded: artifact.entityIdsIncluded,
        mapPositionsIncluded: artifact.mapPositionsIncluded,
        eventRowsIncluded: artifact.eventRowsIncluded,
        deathEventsEmitted: artifact.deathEventsEmitted,
        attributionEmitted: artifact.attributionEmitted
    };
}

async function loadSemanticFoundation(input) {
    const artifact = await readJson(input.semanticFoundationArtifactPath);
    if (artifact.artifactClass !== 'semantic_foundation') throw new Error(`${input.replayId} semantic foundation artifact class mismatch`);
    if (artifact.generatedAt !== 'task_179') throw new Error(`${input.replayId} semantic foundation artifact must use task_179 provenance`);
    if (artifact.finalFactsProduced !== false || artifact.rawDataCaptured !== false || artifact.fieldValuesCaptured !== false) {
        throw new Error(`${input.replayId} semantic foundation artifact policy flags are unsafe`);
    }
    return artifact;
}

async function loadDeathValidationBridge(input) {
    const deathValidation = await readJson(input.deathValidationArtifactPath);
    if (deathValidation.artifactClass !== 'death_validation') throw new Error(`${input.replayId} death validation artifact class mismatch`);
    if (deathValidation.generatedAt !== 'task_177') throw new Error(`${input.replayId} death validation artifact must use task_177 provenance`);
    if (deathValidation.finalFactsProduced !== false || deathValidation.rawDataCaptured !== false) {
        throw new Error(`${input.replayId} death validation artifact policy flags are unsafe`);
    }
    const eventCount = Number(deathValidation.eventCount);
    return { found: true, eventCount: Number.isFinite(eventCount) ? eventCount : 0 };
}

async function runReplayParticipantObservation(input) {
    const player = new Player(undefined, Logger.NOOP);
    const started = performance.now();
    const summary = {
        schemaVersion: 1,
        replayId: input.replayId,
        inputLabel: input.inputLabel,
        parserLoadSucceeded: false,
        parseCompleted: false,
        reachedEnd: false,
        ticksAdvanced: 0,
        samplesAttempted: 0,
        status: 'not_started',
        errorMessage: null
    };
    const aggregate = { participants: new Map() };
    const timeSignals = { tickProgressionObserved: false };

    try {
        const semanticFoundation = await loadSemanticFoundation(input);
        const deathValidation = await loadDeathValidationBridge(input);
        await player.load(createReadStream(input.absolutePath));
        summary.parserLoadSucceeded = true;
        const firstTick = Number(player.getFirstTick()) || Number(player.getCurrentTick()) || 0;
        const tickRate = Number(player.getDemo().server?.tickRate) || 30;
        let nextSampleTick = firstTick;
        let previousTick = Number(player.getCurrentTick());

        while (true) {
            const currentTick = Number(player.getCurrentTick());
            if (Number.isFinite(currentTick) && currentTick >= nextSampleTick) {
                summary.samplesAttempted += 1;
                observeParticipants(player, aggregate);
                nextSampleTick = currentTick + Math.max(1, Math.round(tickRate));
            }
            const advanced = await player.nextTick();
            const afterTick = Number(player.getCurrentTick());
            if (Number.isFinite(previousTick) && Number.isFinite(afterTick)) {
                const delta = Math.max(0, afterTick - previousTick);
                summary.ticksAdvanced += delta;
                if (delta > 0) timeSignals.tickProgressionObserved = true;
            }
            previousTick = afterTick;
            if (!advanced) {
                summary.parseCompleted = true;
                summary.reachedEnd = true;
                break;
            }
        }

        const artifact = createParticipantIdentityArtifact({
            replayId: input.replayId,
            participantRecords: [...aggregate.participants.values()],
            timeSignals,
            semanticFoundation,
            deathValidation
        });
        summary.status = 'emitted';
        summary.durationMs = Math.round(performance.now() - started);
        return { summary, artifact };
    } catch (error) {
        summary.status = 'blocked';
        summary.errorMessage = String(error?.message ?? error);
        summary.durationMs = Math.round(performance.now() - started);
        return { summary, artifact: null };
    }
}

function summarizeCoverage(artifacts, selector) {
    const total = artifacts.length;
    const available = artifacts.filter(artifact => selector(artifact) === 'available').length;
    const partial = artifacts.filter(artifact => selector(artifact) === 'partial').length;
    const blocked = artifacts.filter(artifact => selector(artifact) === 'blocked').length;
    return {
        total,
        available,
        partial,
        blocked,
        availabilityRatio: total === 0 ? 0 : Number((available / total).toFixed(4))
    };
}

function buildReadinessSummary(artifacts) {
    return {
        schemaVersion: 1,
        replayCount: artifacts.length,
        participantIdentityCoverage: summarizeCoverage(artifacts, artifact => artifact.participantIdentityStatus),
        heroCoverage: summarizeCoverage(artifacts, artifact => artifact.heroCoverage.heroCoverageStatus),
        teamCoverage: summarizeCoverage(artifacts, artifact => artifact.teamPartition.teamPartitionStatus),
        timeFoundationCoverage: summarizeCoverage(artifacts, artifact => artifact.timeFoundation.timeNormalizationStatus),
        lifeStateFoundationCoverage: summarizeCoverage(artifacts, artifact => artifact.lifeStateFoundation.readyForAliveDeadRespawnArtifact ? 'available' : 'blocked'),
        readyForAliveDeadRespawnArtifactCount: artifacts.filter(artifact => artifact.readiness.readyForAliveDeadRespawnArtifact).length,
        readyForCanonicalDeathEventDesignCount: artifacts.filter(artifact => artifact.readiness.readyForCanonicalDeathEventDesign).length,
        readyForAttributionCount: artifacts.filter(artifact => artifact.readiness.readyForAttribution).length,
        readyForTeamfightDetectionCount: artifacts.filter(artifact => artifact.readiness.readyForTeamfightDetection).length
    };
}

function buildTeamHeroCoverageSummary(artifacts) {
    return {
        schemaVersion: 1,
        replayCount: artifacts.length,
        totalParticipants: artifacts.reduce((sum, artifact) => sum + artifact.participantCount, 0),
        totalParticipantsWithTeamSignal: artifacts.reduce((sum, artifact) => sum + artifact.teamPartition.participantsWithTeamSignal, 0),
        totalParticipantsWithHeroSignal: artifacts.reduce((sum, artifact) => sum + artifact.heroCoverage.participantsWithHeroSignal, 0),
        rawDataCaptured: false,
        fieldValuesCaptured: false,
        finalFactsProduced: false,
        gameplayInterpretationProduced: false
    };
}

function buildDeathValidationBridgeSummary(artifacts) {
    return {
        schemaVersion: 1,
        replayCount: artifacts.length,
        deathValidationArtifactFoundCount: artifacts.filter(artifact => artifact.deathValidationBridge.deathValidationArtifactFound).length,
        eventCountMeaning: EVENT_COUNT_MEANING,
        totalEventCount: artifacts.reduce((sum, artifact) => sum + artifact.deathValidationBridge.eventCount, 0),
        canUseAsDeathEventSourceAlone: false,
        finalFactsProduced: false,
        gameplayInterpretationProduced: false
    };
}

export async function runParticipantIdentityEmission({ manifest, summaryOutput }) {
    validateParticipantIdentityManifestShape(manifest);
    const summaryRoot = validateParticipantIdentityOutputRoot(summaryOutput, manifest);
    const schema = await readJson('schemas/participant-identity-compact.schema.json');
    const plan = buildParticipantIdentityPlan(manifest);
    const perReplayStatus = [...plan.perReplayStatus];
    const replayResults = [];
    const artifactWrites = [];

    if (plan.blockedReplayAudit.length === 0) {
        for (const input of plan.readyInputs) {
            const result = await runReplayParticipantObservation(input);
            replayResults.push(result);
            const row = perReplayStatus.find(status => status.replayId === input.replayId);
            Object.assign(row, {
                status: result.summary.status,
                parserLoadSucceeded: result.summary.parserLoadSucceeded,
                parseCompleted: result.summary.parseCompleted,
                reachedEnd: result.summary.reachedEnd,
                ticksAdvanced: result.summary.ticksAdvanced,
                samplesAttempted: result.summary.samplesAttempted,
                errorMessage: result.summary.errorMessage,
                filesystemAccessAttempted: true,
                openReadStreamAttempted: true,
                parseAttempted: true,
                artifactClassEmitted: result.artifact ? ARTIFACT_CLASS : null
            });
            if (result.artifact) {
                artifactWrites.push({
                    artifactPath: path.join(summaryRoot.normalized, 'artifacts', input.replayId, 'participant_identity.json'),
                    artifact: result.artifact
                });
            }
        }
    }

    const artifacts = replayResults.map(result => result.artifact).filter(Boolean);
    const schemaValidationRows = artifacts.map(artifact => {
        const errors = validateParticipantIdentityArtifact(artifact, schema);
        return { replayId: artifact.replayId, schemaValidationStatus: errors.length === 0 ? 'passed' : 'failed', errors };
    });
    const policyRows = artifacts.map(auditParticipantIdentityPolicy);
    const sizeRows = artifacts.map(artifact => ({
        replayId: artifact.replayId,
        artifactBytes: artifactSizeBytes(artifact),
        maxArtifactBytes: MAX_ARTIFACT_BYTES,
        sizeStatus: artifactSizeBytes(artifact) <= MAX_ARTIFACT_BYTES ? 'passed' : 'failed'
    }));

    const allReady = plan.blockedReplayAudit.length === 0
        && replayResults.length === plan.readyInputs.length
        && replayResults.every(result => result.artifact)
        && schemaValidationRows.every(row => row.schemaValidationStatus === 'passed')
        && policyRows.every(row => row.policyStatus === 'passed')
        && sizeRows.every(row => row.sizeStatus === 'passed');
    const gateName = allReady
        ? (manifest.runKind === 'task180-pilot' ? 'participant_identity_compact_pilot_ready' : 'participant_identity_compact_bounded32_ready')
        : (manifest.runKind === 'task180-pilot' ? 'participant_identity_compact_pilot_blocked' : 'participant_identity_compact_bounded32_blocked');
    if (allReady) {
        for (const write of artifactWrites) await writeJson(path.resolve(REPO_ROOT, write.artifactPath), write.artifact);
    }

    const readinessSummary = buildReadinessSummary(artifacts);
    const gatePrefix = manifest.runKind === 'task180-pilot' ? 'participant-identity-pilot' : 'participant-identity-bounded32';
    const gate = {
        schemaVersion: 1,
        gate: gateName,
        status: allReady ? 'ready' : 'blocked',
        manifestId: manifest.manifestId,
        runKind: manifest.runKind,
        replayCount: plan.readyInputs.length,
        artifactsEmitted: allReady ? artifacts.length : 0,
        rawDataCaptured: false,
        fieldValuesCaptured: false,
        finalFactsProduced: false,
        gameplayInterpretationProduced: false
    };
    const summary = {
        schemaVersion: 1,
        manifestId: manifest.manifestId,
        runKind: manifest.runKind,
        replayCount: plan.readyInputs.length,
        artifactsEmitted: allReady ? artifacts.length : 0,
        participantIdentityCoverage: readinessSummary.participantIdentityCoverage,
        heroCoverage: readinessSummary.heroCoverage,
        teamCoverage: readinessSummary.teamCoverage,
        timeFoundationCoverage: readinessSummary.timeFoundationCoverage,
        lifeStateFoundationCoverage: readinessSummary.lifeStateFoundationCoverage,
        readyForAliveDeadRespawnArtifact: readinessSummary.readyForAliveDeadRespawnArtifactCount === artifacts.length && artifacts.length > 0,
        readyForCanonicalDeathEventDesign: false,
        readyForAttribution: false,
        schemaValidationStatus: schemaValidationRows.every(row => row.schemaValidationStatus === 'passed') ? 'passed' : 'failed',
        outputPolicyStatus: policyRows.every(row => row.policyStatus === 'passed') ? 'passed' : 'failed',
        sizeAuditStatus: sizeRows.every(row => row.sizeStatus === 'passed') ? 'passed' : 'failed',
        protectionAuditStatus: plan.blockedReplayAudit.length === 0 ? 'passed' : 'blocked',
        rawDataCaptured: false,
        fieldValuesCaptured: false,
        finalFactsProduced: false,
        gameplayInterpretationProduced: false
    };
    const schemaValidationSummary = { schemaVersion: 1, schemaValidationStatus: summary.schemaValidationStatus, rows: schemaValidationRows };
    const outputPolicyAudit = {
        schemaVersion: 1,
        outputPolicyStatus: summary.outputPolicyStatus,
        forbiddenSurfaces: FORBIDDEN_SURFACES,
        rows: policyRows,
        rawDataCaptured: false,
        fieldValuesCaptured: false,
        finalFactsProduced: false,
        gameplayInterpretationProduced: false
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
        replayFilesAccessedOnlyFromManifest: true,
        replay005Accessed: false,
        bots006To008Processed: false,
        outputReplaysUsed: false,
        blockedReplayAudit: plan.blockedReplayAudit,
        parserEngineBehaviorModified: false,
        packagesDeademModified: false,
        deathValidationArtifactsEmitted: false,
        semanticFoundationArtifactsEmitted: false,
        finalFactsProduced: false,
        gameplayInterpretationProduced: false,
        task181Created: false
    };

    await writeJson(path.join(summaryRoot.absolutePath, `${gatePrefix}-gate.json`), gate);
    await writeJson(path.join(summaryRoot.absolutePath, `${gatePrefix}-summary.json`), summary);
    await writeJson(path.join(summaryRoot.absolutePath, `${gatePrefix}-schema-validation-summary.json`), schemaValidationSummary);
    await writeJson(path.join(summaryRoot.absolutePath, `${gatePrefix}-output-policy-audit.json`), outputPolicyAudit);
    await writeJson(path.join(summaryRoot.absolutePath, `${gatePrefix}-size-audit.json`), sizeAudit);
    await writeJson(path.join(summaryRoot.absolutePath, `${gatePrefix}-protection-audit.json`), protectionAudit);
    await writeJson(path.join(summaryRoot.absolutePath, `${gatePrefix}-readiness-summary.json`), readinessSummary);
    if (manifest.runKind === 'task180-bounded32') {
        await writeJson(path.join(summaryRoot.absolutePath, 'participant-identity-bounded32-team-hero-coverage-summary.json'), buildTeamHeroCoverageSummary(artifacts));
        await writeJson(path.join(summaryRoot.absolutePath, 'participant-identity-bounded32-death-validation-bridge-summary.json'), buildDeathValidationBridgeSummary(artifacts));
    }
    return { gate, summary, readinessSummary, artifacts, perReplayStatus, blockedReplayAudit: plan.blockedReplayAudit };
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const manifestPath = assertRelativeRepositoryPath(args.get('manifest'), 'manifest');
    const manifest = await readJson(manifestPath);
    const result = await runParticipantIdentityEmission({
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
