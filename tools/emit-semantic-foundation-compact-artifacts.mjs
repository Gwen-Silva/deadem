#!/usr/bin/env node
import { createReadStream } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Logger, Player } from 'deadem';

const THIS_FILE = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(THIS_FILE), '..');
const SCHEMA_PATH = path.resolve(REPO_ROOT, 'schemas/semantic-foundation-compact.schema.json');
const ARTIFACT_CLASS = 'semantic_foundation';
const MODE = 'semantic_foundation_compact_emission';
const GENERATED_BY = 'tools/emit-semantic-foundation-compact-artifacts.mjs';
const GENERATED_AT = 'task_179';
const MAX_ARTIFACT_BYTES = 32 * 1024;
const MAX_RUN_BYTES = 1024 * 1024;
const CONTROLLER_CLASS = 'CCitadelPlayerController';
const OUTPUT_ROOT_PREFIX = 'output/local-replay-processing/semantic-foundation-compact/';
const EVENT_COUNT_MEANING = 'source_observed_counter_transition_candidate_count_not_final_death_fact';

export const FORBIDDEN_REPLAY_IDS = new Set(['replay_005', 'replay_006', 'replay_007', 'replay_008']);
export const FORBIDDEN_OUTPUT_KEYS = new Set([
    'events',
    'eventRows',
    'rows',
    'players',
    'playerRows',
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
    'playerId',
    'playerIds',
    'steamId',
    'accountId',
    'controllerHandle',
    'pawnEntityIndex',
    'killer',
    'victim',
    'assister',
    'damageSource',
    'fightId',
    'objectiveId',
    'fieldValues',
    'rawValues',
    'tick',
    'ticks',
    'timestamp',
    'timestamps',
    'gameTimeSeconds',
    'position',
    'positions',
    'mapPosition',
    'mapPositions',
    'snapshot',
    'snapshots',
    'entityHistory',
    'entityHistories'
]);

export const FORBIDDEN_SURFACES = [
    'death_validation_emission',
    'death_events',
    'respawn_events',
    'timelines',
    'objective_lifecycle',
    'player_identity_rows_with_names',
    'hero_names',
    'team_names',
    'raw_entity_ids',
    'field_values',
    'map_positions',
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

function safeNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function normalize(value) {
    if (value === undefined || value === null) return null;
    if (typeof value === 'bigint') return Number(value);
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed === '') return null;
        const numeric = Number(trimmed);
        return Number.isFinite(numeric) ? numeric : trimmed;
    }
    return value;
}

function safeField(entity, names) {
    for (const name of names) {
        try {
            const value = normalize(entity?.getField?.(name));
            if (value !== null && value !== undefined && value !== '0' && value !== 0 && value !== false) return value;
        } catch {
            // Field absence is a signal gap, not a runner failure.
        }
    }
    return null;
}

function statusFrom({ available, partial }) {
    if (available) return 'available';
    if (partial) return 'partial';
    return 'blocked';
}

function compactBlockedStatus(replay, reasons) {
    return {
        schemaVersion: 1,
        replayId: replay?.replayId ?? null,
        localPath: replay?.localPath ?? null,
        status: 'blocked_by_policy',
        reasons,
        blockedBeforeFilesystemAccess: true,
        filesystemAccessAttempted: false,
        openReadStreamAttempted: false,
        parseAttempted: false,
        artifactClassEmitted: null,
        rawDataCaptured: false,
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
        deathValidationArtifactPath: replay?.deathValidationArtifactPath ?? null
    };
}

export function validateSemanticFoundationManifestShape(manifest) {
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

export function validateSemanticFoundationOutputRoot(summaryOutput, manifest) {
    const normalized = assertRelativeRepositoryPath(summaryOutput, 'summary output').replace(/\/?$/u, '/');
    const expected = `${OUTPUT_ROOT_PREFIX}${manifest.runKind}/`;
    if (normalized !== expected) throw new Error(`summary output root must be exactly ${expected}`);
    return { normalized, absolutePath: path.resolve(REPO_ROOT, normalized) };
}

export function buildSemanticFoundationPlan(manifest) {
    validateSemanticFoundationManifestShape(manifest);
    const allowlist = manifest.allowedReplays.map(normalizeReplay);
    const requested = (Array.isArray(manifest.requestedReplays) && manifest.requestedReplays.length > 0
        ? manifest.requestedReplays
        : manifest.allowedReplays).map(normalizeReplay);
    const allowlistById = new Map();
    const duplicateIds = new Set();
    for (const replay of allowlist) {
        if (!replay.replayId || !replay.localPath || !replay.deathValidationArtifactPath) {
            throw new Error('allowedReplays entries require replayId, localPath, and deathValidationArtifactPath');
        }
        if (allowlistById.has(replay.replayId)) duplicateIds.add(replay.replayId);
        allowlistById.set(replay.replayId, replay);
    }
    if (duplicateIds.size > 0) throw new Error(`duplicate allowed replay ids: ${[...duplicateIds].join(', ')}`);

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
        const normalizedDeathValidationPath = assertRelativeRepositoryPath(allowed.deathValidationArtifactPath, `${allowed.replayId} deathValidationArtifactPath`);
        const input = {
            ...allowed,
            localPath: normalizedPath,
            deathValidationArtifactPath: normalizedDeathValidationPath,
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
            finalFactsProduced: false,
            gameplayInterpretationProduced: false
        });
    }
    return { readyInputs, blockedReplayAudit, perReplayStatus };
}

function observeSemanticSignals(player) {
    const demo = player.getDemo();
    const controllers = demo.getEntitiesByClassName(CONTROLLER_CLASS);
    const participantKeys = new Set();
    let participantSlotCandidatesObserved = 0;
    let controllerToPawnLinkSignalAvailable = false;
    let heroSignalAvailable = false;
    let teamSignalAvailable = false;
    let deathCounterSignalAvailable = false;
    let aliveDeadSignalAvailable = false;
    let respawnSignalAvailable = false;

    for (const controller of controllers) {
        const participantKey = safeField(controller, ['m_iPlayerSlot', 'm_iPlayerID', 'm_unAccountID', 'm_iAccountID', 'm_steamID']);
        if (participantKey !== null) {
            participantSlotCandidatesObserved += 1;
            participantKeys.add(String(participantKey));
        }
        if (safeField(controller, ['m_hPawn', 'm_hAssignedHero', 'm_hHeroPawn']) !== null) controllerToPawnLinkSignalAvailable = true;
        if (safeField(controller, ['m_nHeroID', 'm_eHeroType', 'm_iHeroID', 'm_iSelectedHero']) !== null) heroSignalAvailable = true;
        if (safeField(controller, ['m_iTeamNum', 'm_iTeam', 'm_nTeamNum']) !== null) teamSignalAvailable = true;
        if (safeField(controller, ['m_iDeaths']) !== null) deathCounterSignalAvailable = true;
        if (safeField(controller, ['m_lifeState', 'm_iHealth', 'm_bAlive']) !== null) aliveDeadSignalAvailable = true;
        if (safeField(controller, ['m_iRespawnTime', 'm_flRespawnTime', 'm_bRespawning']) !== null) respawnSignalAvailable = true;
    }

    return {
        controllerCandidatesObserved: controllers.length,
        participantSlotCandidatesObserved,
        controllerToPawnLinkSignalAvailable,
        stableParticipantKeyPossible: participantKeys.size > 0 && participantKeys.size === participantSlotCandidatesObserved,
        heroSignalAvailable,
        teamSignalAvailable,
        deathCounterSignalAvailable,
        aliveDeadSignalAvailable,
        respawnSignalAvailable
    };
}

export function createSemanticFoundationArtifact({ replayId, signals, timeSignals, deathValidation }) {
    const identityAvailable = signals.controllerCandidatesObserved > 0
        && signals.participantSlotCandidatesObserved > 0
        && signals.stableParticipantKeyPossible
        && signals.controllerToPawnLinkSignalAvailable;
    const identityPartial = signals.controllerCandidatesObserved > 0
        || signals.participantSlotCandidatesObserved > 0
        || signals.controllerToPawnLinkSignalAvailable;
    const heroTeamAvailable = signals.heroSignalAvailable && signals.teamSignalAvailable;
    const heroTeamPartial = signals.heroSignalAvailable || signals.teamSignalAvailable;
    const timeAvailable = timeSignals.tickProgressionObserved
        && timeSignals.tickRateSignalAvailable
        && timeSignals.durationSignalAvailable;
    const lifeAvailable = signals.deathCounterSignalAvailable
        && (signals.aliveDeadSignalAvailable || signals.respawnSignalAvailable);
    const lifePartial = signals.deathCounterSignalAvailable
        || signals.aliveDeadSignalAvailable
        || signals.respawnSignalAvailable;

    return {
        schemaVersion: 1,
        replayId,
        artifactClass: ARTIFACT_CLASS,
        sourceMethod: 'compact_semantic_signal_observation',
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
        identitySignals: {
            controllerCandidatesObserved: signals.controllerCandidatesObserved,
            participantSlotCandidatesObserved: signals.participantSlotCandidatesObserved,
            controllerToPawnLinkSignalAvailable: signals.controllerToPawnLinkSignalAvailable,
            stableParticipantKeyPossible: signals.stableParticipantKeyPossible,
            identityMappingStatus: statusFrom({ available: identityAvailable, partial: identityPartial })
        },
        heroTeamSignals: {
            heroSignalAvailable: signals.heroSignalAvailable,
            teamSignalAvailable: signals.teamSignalAvailable,
            heroTeamMappingStatus: statusFrom({ available: heroTeamAvailable, partial: heroTeamPartial })
        },
        timeSignals: {
            tickProgressionObserved: timeSignals.tickProgressionObserved,
            tickRateSignalAvailable: timeSignals.tickRateSignalAvailable,
            durationSignalAvailable: timeSignals.durationSignalAvailable,
            timeNormalizationStatus: statusFrom({ available: timeAvailable, partial: timeSignals.tickProgressionObserved })
        },
        lifeStateSignals: {
            deathCounterSignalAvailable: signals.deathCounterSignalAvailable,
            aliveDeadSignalAvailable: signals.aliveDeadSignalAvailable,
            respawnSignalAvailable: signals.respawnSignalAvailable,
            lifeStateReadinessStatus: statusFrom({ available: lifeAvailable, partial: lifePartial })
        },
        deathValidationBridge: {
            deathValidationArtifactFound: deathValidation.found,
            eventCount: deathValidation.eventCount,
            eventCountMeaning: EVENT_COUNT_MEANING,
            canUseAsDeathEventSourceAlone: false
        },
        readiness: {
            readyForIdentityMappingArtifact: identityAvailable,
            readyForHeroTeamMappingArtifact: heroTeamAvailable,
            readyForTimeNormalizationArtifact: timeAvailable,
            readyForAliveDeadRespawnArtifact: lifeAvailable,
            readyForCanonicalDeathEventDesign: false
        },
        limitations: [
            'Compact signal availability only; no player, hero, team, entity, tick, position, or event rows are emitted.',
            'deathValidationBridge.eventCount is a source-observed counter-transition candidate count, not a final death fact.',
            'This artifact does not authorize killer, victim, assist, damage, objective, fight, decision, or gameplay interpretation.',
            'Canonical death-event design still requires explicit identity, time, life-state, and attribution contracts.'
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

export function validateSemanticFoundationArtifact(artifact, schema) {
    const errors = [];
    if (typeof artifact !== 'object' || artifact === null || Array.isArray(artifact)) return ['artifact must be object'];
    for (const required of schema.required) {
        if (!(required in artifact)) errors.push(`missing required ${required}`);
    }
    for (const key of Object.keys(artifact)) {
        if (!(key in schema.properties)) errors.push(`additional property ${key} is forbidden`);
        if (FORBIDDEN_OUTPUT_KEYS.has(key)) errors.push(`forbidden key ${key}`);
    }
    for (const [key, value] of Object.entries(artifact)) {
        if (typeof value === 'object' && value !== null) {
            const text = JSON.stringify(value);
            for (const forbidden of FORBIDDEN_OUTPUT_KEYS) {
                if (new RegExp(`\"${forbidden}\"\\s*:`, 'u').test(text)) errors.push(`forbidden nested key ${forbidden}`);
            }
        }
    }
    if (artifact.schemaVersion !== 1) errors.push('schemaVersion must be 1');
    if (!/^replay_[0-9]{3}$/u.test(String(artifact.replayId ?? ''))) errors.push('replayId pattern violation');
    if (artifact.artifactClass !== ARTIFACT_CLASS) errors.push(`artifactClass must be ${ARTIFACT_CLASS}`);
    if (artifact.sourceMethod !== 'compact_semantic_signal_observation') errors.push('sourceMethod violation');
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
        'eventRowsIncluded'
    ]) {
        if (artifact[booleanFalse] !== false) errors.push(`${booleanFalse} must be false`);
    }
    errors.push(...validateNestedObject('identitySignals', artifact.identitySignals, [
        'controllerCandidatesObserved',
        'participantSlotCandidatesObserved',
        'controllerToPawnLinkSignalAvailable',
        'stableParticipantKeyPossible',
        'identityMappingStatus'
    ]));
    errors.push(...validateNestedObject('heroTeamSignals', artifact.heroTeamSignals, [
        'heroSignalAvailable',
        'teamSignalAvailable',
        'heroTeamMappingStatus'
    ]));
    errors.push(...validateNestedObject('timeSignals', artifact.timeSignals, [
        'tickProgressionObserved',
        'tickRateSignalAvailable',
        'durationSignalAvailable',
        'timeNormalizationStatus'
    ]));
    errors.push(...validateNestedObject('lifeStateSignals', artifact.lifeStateSignals, [
        'deathCounterSignalAvailable',
        'aliveDeadSignalAvailable',
        'respawnSignalAvailable',
        'lifeStateReadinessStatus'
    ]));
    errors.push(...validateNestedObject('deathValidationBridge', artifact.deathValidationBridge, [
        'deathValidationArtifactFound',
        'eventCount',
        'eventCountMeaning',
        'canUseAsDeathEventSourceAlone'
    ]));
    errors.push(...validateNestedObject('readiness', artifact.readiness, [
        'readyForIdentityMappingArtifact',
        'readyForHeroTeamMappingArtifact',
        'readyForTimeNormalizationArtifact',
        'readyForAliveDeadRespawnArtifact',
        'readyForCanonicalDeathEventDesign'
    ]));
    const statusEnum = new Set(['available', 'partial', 'blocked', 'unknown']);
    for (const status of [
        artifact.identitySignals?.identityMappingStatus,
        artifact.heroTeamSignals?.heroTeamMappingStatus,
        artifact.timeSignals?.timeNormalizationStatus,
        artifact.lifeStateSignals?.lifeStateReadinessStatus
    ]) {
        if (!statusEnum.has(status)) errors.push(`status enum violation: ${status}`);
    }
    if (!Number.isInteger(artifact.identitySignals?.controllerCandidatesObserved) || artifact.identitySignals.controllerCandidatesObserved < 0) {
        errors.push('controllerCandidatesObserved must be non-negative integer');
    }
    if (!Number.isInteger(artifact.identitySignals?.participantSlotCandidatesObserved) || artifact.identitySignals.participantSlotCandidatesObserved < 0) {
        errors.push('participantSlotCandidatesObserved must be non-negative integer');
    }
    if (!Number.isInteger(artifact.deathValidationBridge?.eventCount) || artifact.deathValidationBridge.eventCount < 0) {
        errors.push('deathValidationBridge.eventCount must be non-negative integer');
    }
    if (artifact.deathValidationBridge?.eventCountMeaning !== EVENT_COUNT_MEANING) errors.push('eventCountMeaning violation');
    if (artifact.deathValidationBridge?.canUseAsDeathEventSourceAlone !== false) errors.push('canUseAsDeathEventSourceAlone must be false');
    if (artifact.readiness?.readyForCanonicalDeathEventDesign !== false) errors.push('readyForCanonicalDeathEventDesign must be false');
    if (!Array.isArray(artifact.limitations) || artifact.limitations.length < 1 || artifact.limitations.length > 12) {
        errors.push('limitations must contain 1..12 strings');
    }
    return [...new Set(errors)];
}

export function auditSemanticFoundationPolicy(artifact) {
    const serialized = JSON.stringify(artifact);
    const forbiddenTokens = [
        '"playerName"',
        '"heroName"',
        '"teamName"',
        '"entityId"',
        '"fieldValues"',
        '"rawValues"',
        '"position"',
        '"killer"',
        '"victim"',
        '"events"',
        '"eventRows"',
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
        eventRowsIncluded: artifact.eventRowsIncluded
    };
}

async function loadDeathValidationBridge(input) {
    const deathValidation = await readJson(input.deathValidationArtifactPath);
    if (deathValidation.artifactClass !== 'death_validation') throw new Error(`${input.replayId} death validation artifact class mismatch`);
    if (deathValidation.generatedAt !== 'task_177') throw new Error(`${input.replayId} death validation artifact must use task_177 provenance`);
    if (deathValidation.finalFactsProduced !== false || deathValidation.rawDataCaptured !== false) {
        throw new Error(`${input.replayId} death validation artifact policy flags are unsafe`);
    }
    return {
        found: true,
        eventCount: safeNumber(deathValidation.eventCount) ?? 0
    };
}

async function runReplaySemanticObservation(input) {
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
    const aggregate = {
        controllerCandidatesObserved: 0,
        participantSlotCandidatesObserved: 0,
        controllerToPawnLinkSignalAvailable: false,
        stableParticipantKeyPossible: false,
        heroSignalAvailable: false,
        teamSignalAvailable: false,
        deathCounterSignalAvailable: false,
        aliveDeadSignalAvailable: false,
        respawnSignalAvailable: false
    };
    const timeSignals = {
        tickProgressionObserved: false,
        tickRateSignalAvailable: false,
        durationSignalAvailable: false
    };

    try {
        const deathValidation = await loadDeathValidationBridge(input);
        await player.load(createReadStream(input.absolutePath));
        summary.parserLoadSucceeded = true;
        const firstTick = safeNumber(player.getFirstTick()) ?? safeNumber(player.getCurrentTick()) ?? 0;
        const tickRate = safeNumber(player.getDemo().server?.tickRate);
        const lastTick = safeNumber(player.getLastTick());
        timeSignals.tickRateSignalAvailable = tickRate !== null && tickRate > 0;
        timeSignals.durationSignalAvailable = lastTick !== null && lastTick >= firstTick;
        let nextSampleTick = firstTick;
        let previousTick = safeNumber(player.getCurrentTick());

        while (true) {
            const currentTick = safeNumber(player.getCurrentTick());
            if (currentTick !== null && currentTick >= nextSampleTick) {
                summary.samplesAttempted += 1;
                const signals = observeSemanticSignals(player);
                aggregate.controllerCandidatesObserved = Math.max(aggregate.controllerCandidatesObserved, signals.controllerCandidatesObserved);
                aggregate.participantSlotCandidatesObserved = Math.max(
                    aggregate.participantSlotCandidatesObserved,
                    signals.participantSlotCandidatesObserved
                );
                for (const key of [
                    'controllerToPawnLinkSignalAvailable',
                    'stableParticipantKeyPossible',
                    'heroSignalAvailable',
                    'teamSignalAvailable',
                    'deathCounterSignalAvailable',
                    'aliveDeadSignalAvailable',
                    'respawnSignalAvailable'
                ]) {
                    aggregate[key] = aggregate[key] || signals[key];
                }
                nextSampleTick = currentTick + Math.max(1, Math.round(tickRate ?? 30));
            }

            const advanced = await player.nextTick();
            const afterTick = safeNumber(player.getCurrentTick());
            if (previousTick !== null && afterTick !== null) {
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

        const artifact = createSemanticFoundationArtifact({
            replayId: input.replayId,
            signals: aggregate,
            timeSignals,
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
        identitySignalCoverage: summarizeCoverage(artifacts, artifact => artifact.identitySignals.identityMappingStatus),
        heroTeamSignalCoverage: summarizeCoverage(artifacts, artifact => artifact.heroTeamSignals.heroTeamMappingStatus),
        timeSignalCoverage: summarizeCoverage(artifacts, artifact => artifact.timeSignals.timeNormalizationStatus),
        lifeStateSignalCoverage: summarizeCoverage(artifacts, artifact => artifact.lifeStateSignals.lifeStateReadinessStatus),
        readyForIdentityMappingArtifactCount: artifacts.filter(artifact => artifact.readiness.readyForIdentityMappingArtifact).length,
        readyForHeroTeamMappingArtifactCount: artifacts.filter(artifact => artifact.readiness.readyForHeroTeamMappingArtifact).length,
        readyForTimeNormalizationArtifactCount: artifacts.filter(artifact => artifact.readiness.readyForTimeNormalizationArtifact).length,
        readyForAliveDeadRespawnArtifactCount: artifacts.filter(artifact => artifact.readiness.readyForAliveDeadRespawnArtifact).length,
        readyForCanonicalDeathEventDesignCount: artifacts.filter(artifact => artifact.readiness.readyForCanonicalDeathEventDesign).length
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

export async function runSemanticFoundationEmission({ manifest, summaryOutput }) {
    validateSemanticFoundationManifestShape(manifest);
    const summaryRoot = validateSemanticFoundationOutputRoot(summaryOutput, manifest);
    const schema = await readJson('schemas/semantic-foundation-compact.schema.json');
    const plan = buildSemanticFoundationPlan(manifest);
    const perReplayStatus = [...plan.perReplayStatus];
    const replayResults = [];
    const artifactWrites = [];

    if (plan.blockedReplayAudit.length === 0) {
        for (const input of plan.readyInputs) {
            const result = await runReplaySemanticObservation(input);
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
                    artifactPath: path.join(summaryRoot.normalized, 'artifacts', input.replayId, 'semantic_foundation.json'),
                    artifact: result.artifact
                });
            }
        }
    }

    const artifacts = replayResults.map(result => result.artifact).filter(Boolean);
    const schemaValidationRows = artifacts.map(artifact => ({
        replayId: artifact.replayId,
        schemaValidationStatus: validateSemanticFoundationArtifact(artifact, schema).length === 0 ? 'passed' : 'failed',
        errors: validateSemanticFoundationArtifact(artifact, schema)
    }));
    const policyRows = artifacts.map(auditSemanticFoundationPolicy);
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
        ? (manifest.runKind === 'task179-pilot' ? 'semantic_foundation_compact_pilot_ready' : 'semantic_foundation_compact_bounded32_ready')
        : (manifest.runKind === 'task179-pilot' ? 'semantic_foundation_compact_pilot_blocked' : 'semantic_foundation_compact_bounded32_blocked');
    if (allReady) {
        for (const write of artifactWrites) {
            await writeJson(path.resolve(REPO_ROOT, write.artifactPath), write.artifact);
        }
    }

    const readinessSummary = buildReadinessSummary(artifacts);
    const gatePrefix = manifest.runKind === 'task179-pilot' ? 'semantic-foundation-pilot' : 'semantic-foundation-bounded32';
    const gate = {
        schemaVersion: 1,
        gate: gateName,
        status: allReady ? 'ready' : 'blocked',
        manifestId: manifest.manifestId,
        runKind: manifest.runKind,
        replayCount: plan.readyInputs.length,
        artifactsEmitted: allReady ? artifacts.length : 0,
        rawDataCaptured: false,
        finalFactsProduced: false,
        gameplayInterpretationProduced: false
    };
    const summary = {
        schemaVersion: 1,
        manifestId: manifest.manifestId,
        runKind: manifest.runKind,
        replayCount: plan.readyInputs.length,
        artifactsEmitted: allReady ? artifacts.length : 0,
        schemaValidationStatus: schemaValidationRows.every(row => row.schemaValidationStatus === 'passed') ? 'passed' : 'failed',
        outputPolicyStatus: policyRows.every(row => row.policyStatus === 'passed') ? 'passed' : 'failed',
        sizeAuditStatus: sizeRows.every(row => row.sizeStatus === 'passed') ? 'passed' : 'failed',
        protectionAuditStatus: plan.blockedReplayAudit.length === 0 ? 'passed' : 'blocked',
        identitySignalCoverage: readinessSummary.identitySignalCoverage,
        heroTeamSignalCoverage: readinessSummary.heroTeamSignalCoverage,
        timeSignalCoverage: readinessSummary.timeSignalCoverage,
        lifeStateSignalCoverage: readinessSummary.lifeStateSignalCoverage,
        readyForNextIdentityMappingTask: readinessSummary.readyForIdentityMappingArtifactCount > 0,
        readyForNextCanonicalDeathEventDesign: false,
        rawDataCaptured: false,
        finalFactsProduced: false,
        gameplayInterpretationProduced: false
    };
    const schemaValidationSummary = {
        schemaVersion: 1,
        schemaValidationStatus: summary.schemaValidationStatus,
        rows: schemaValidationRows
    };
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
        finalFactsProduced: false,
        gameplayInterpretationProduced: false,
        task180Created: false
    };

    await writeJson(path.join(summaryRoot.absolutePath, `${gatePrefix}-gate.json`), gate);
    await writeJson(path.join(summaryRoot.absolutePath, `${gatePrefix}-summary.json`), summary);
    await writeJson(path.join(summaryRoot.absolutePath, `${gatePrefix}-schema-validation-summary.json`), schemaValidationSummary);
    await writeJson(path.join(summaryRoot.absolutePath, `${gatePrefix}-output-policy-audit.json`), outputPolicyAudit);
    await writeJson(path.join(summaryRoot.absolutePath, `${gatePrefix}-size-audit.json`), sizeAudit);
    await writeJson(path.join(summaryRoot.absolutePath, `${gatePrefix}-protection-audit.json`), protectionAudit);
    await writeJson(path.join(summaryRoot.absolutePath, `${gatePrefix}-readiness-summary.json`), readinessSummary);
    if (manifest.runKind === 'task179-bounded32') {
        await writeJson(path.join(summaryRoot.absolutePath, 'semantic-foundation-bounded32-death-validation-bridge-summary.json'), buildDeathValidationBridgeSummary(artifacts));
    }
    return { gate, summary, readinessSummary, artifacts, perReplayStatus, blockedReplayAudit: plan.blockedReplayAudit };
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const manifestPath = assertRelativeRepositoryPath(args.get('manifest'), 'manifest');
    const manifest = await readJson(manifestPath);
    const result = await runSemanticFoundationEmission({
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
