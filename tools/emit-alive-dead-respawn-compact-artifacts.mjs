#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const THIS_FILE = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(THIS_FILE), '..');
const ARTIFACT_CLASS = 'alive_dead_respawn';
const MODE = 'alive_dead_respawn_compact_emission';
const GENERATED_BY = 'tools/emit-alive-dead-respawn-compact-artifacts.mjs';
const GENERATED_AT = 'task_181';
const OUTPUT_ROOT_PREFIX = 'output/local-replay-processing/alive-dead-respawn-compact/';
const MAX_ARTIFACT_BYTES = 64 * 1024;
const MAX_RUN_BYTES = 3 * 1024 * 1024;
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
    'participant_identity_emission',
    'death_events',
    'respawn_events',
    'general_timelines',
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
    'raw_ticks',
    'raw_timestamps',
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

function statusFromCounts(count, total) {
    if (total <= 0) return 'blocked';
    if (count === total) return 'available';
    if (count > 0) return 'partial';
    return 'blocked';
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
        participantIdentityArtifactPath: replay?.participantIdentityArtifactPath ?? null,
        semanticFoundationArtifactPath: replay?.semanticFoundationArtifactPath ?? null,
        deathValidationArtifactPath: replay?.deathValidationArtifactPath ?? null
    };
}

export function validateAliveDeadRespawnManifestShape(manifest) {
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

export function validateAliveDeadRespawnOutputRoot(summaryOutput, manifest) {
    const normalized = assertRelativeRepositoryPath(summaryOutput, 'summary output').replace(/\/?$/u, '/');
    const expected = `${OUTPUT_ROOT_PREFIX}${manifest.runKind}/`;
    if (normalized !== expected) throw new Error(`summary output root must be exactly ${expected}`);
    return { normalized, absolutePath: path.resolve(REPO_ROOT, normalized) };
}

export function buildAliveDeadRespawnPlan(manifest) {
    validateAliveDeadRespawnManifestShape(manifest);
    const allowlist = manifest.allowedReplays.map(normalizeReplay);
    const requested = (Array.isArray(manifest.requestedReplays) && manifest.requestedReplays.length > 0
        ? manifest.requestedReplays
        : manifest.allowedReplays).map(normalizeReplay);
    const allowlistById = new Map();
    for (const replay of allowlist) {
        if (!replay.replayId || !replay.localPath || !replay.participantIdentityArtifactPath || !replay.semanticFoundationArtifactPath || !replay.deathValidationArtifactPath) {
            throw new Error('allowedReplays entries require replayId, localPath, participantIdentityArtifactPath, semanticFoundationArtifactPath, and deathValidationArtifactPath');
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
        const input = {
            ...allowed,
            localPath: assertRelativeRepositoryPath(allowed.localPath, `${allowed.replayId} localPath`),
            participantIdentityArtifactPath: assertRelativeRepositoryPath(allowed.participantIdentityArtifactPath, `${allowed.replayId} participantIdentityArtifactPath`),
            semanticFoundationArtifactPath: assertRelativeRepositoryPath(allowed.semanticFoundationArtifactPath, `${allowed.replayId} semanticFoundationArtifactPath`),
            deathValidationArtifactPath: assertRelativeRepositoryPath(allowed.deathValidationArtifactPath, `${allowed.replayId} deathValidationArtifactPath`)
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

function coverageCount(status, participantCount) {
    return status === 'available' ? participantCount : 0;
}

export function createAliveDeadRespawnArtifact({ replayId, participantIdentity, semanticFoundation, deathValidation }) {
    const participantCount = Number(participantIdentity.participantCount) || 0;
    const activeParticipantCandidateCount = Array.isArray(participantIdentity.participants)
        ? participantIdentity.participants.filter(participant => participant.lifeStateSignalStatus === 'available').length
        : 0;
    const deathCounterCount = coverageCount(participantIdentity.lifeStateFoundation?.deathCounterCoverageStatus, participantCount);
    const aliveDeadCount = coverageCount(participantIdentity.lifeStateFoundation?.aliveDeadSignalCoverageStatus, participantCount);
    const respawnCount = coverageCount(participantIdentity.lifeStateFoundation?.respawnSignalCoverageStatus, participantCount);
    const eventCount = Number(deathValidation.eventCount) || 0;
    const duplicateTransitionCandidateCount = Number(deathValidation.duplicateKeyCount) || 0;
    const coverageStatus = statusFromCounts(Math.min(deathCounterCount, aliveDeadCount, respawnCount), participantCount);
    const hasRequiredReadiness = participantIdentity.readiness?.readyForAliveDeadRespawnArtifact === true
        && semanticFoundation.readiness?.readyForAliveDeadRespawnArtifact === true
        && eventCount >= 0;

    return {
        schemaVersion: 1,
        replayId,
        artifactClass: ARTIFACT_CLASS,
        sourceMethod: 'compact_life_state_transition_observation',
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
        rawTicksIncluded: false,
        rawTimestampsIncluded: false,
        deathEventsEmitted: false,
        respawnEventsEmitted: false,
        attributionEmitted: false,
        participantIdentityArtifactFound: true,
        participantCount,
        activeParticipantCandidateCount,
        participantFilterStatus: participantIdentity.participantIdentityStatus ?? 'blocked',
        lifeStateSignalCoverage: {
            participantsWithDeathCounter: deathCounterCount,
            participantsWithAliveDeadSignal: aliveDeadCount,
            participantsWithRespawnSignal: respawnCount,
            coverageStatus
        },
        transitionCandidateSummary: {
            deathCounterIncrementCandidates: eventCount,
            aliveToDeadTransitionCandidates: 0,
            deadToAliveTransitionCandidates: 0,
            respawnSignalCandidates: 0,
            ambiguousTransitionCandidates: 0,
            duplicateTransitionCandidateCount
        },
        transitionCandidates: [],
        deathValidationBridge: {
            deathValidationArtifactFound: true,
            eventCount,
            eventCountMeaning: EVENT_COUNT_MEANING,
            deathCounterIncrementCandidatesMatchDeathValidation: true,
            canUseAsDeathEventSourceAlone: false
        },
        readiness: {
            readyForAliveDeadRespawnConsumption: hasRequiredReadiness && participantCount > 0,
            readyForCanonicalDeathEventDesign: false,
            readyForAttribution: false,
            readyForTeamfightDetection: false
        },
        limitations: [
            'transitionCandidateSummary uses compact counts only; no per-participant transition rows are materialized in this baseline.',
            'deathValidationBridge.eventCount is a source-observed counter-transition candidate count, not a final death fact.',
            'participant keys are synthetic replay-local refs inherited from participant_identity; raw source IDs and names are not persisted.',
            'Canonical death events, attribution, teamfight detection, raw ticks, raw timestamps, and gameplay interpretation remain unauthorized.'
        ]
    };
}

function validateRequiredKeys(prefix, value, keys) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return [`${prefix} must be an object`];
    return keys.filter(key => !(key in value)).map(key => `${prefix}.${key} is required`);
}

export function validateAliveDeadRespawnArtifact(artifact, schema) {
    const errors = [];
    const required = schema?.required ?? [];
    for (const key of required) if (!(key in artifact)) errors.push(`${key} is required`);
    if (artifact.schemaVersion !== 1) errors.push('schemaVersion must be 1');
    if (!/^replay_[0-9]{3}$/u.test(String(artifact.replayId))) errors.push('replayId must be replay_###');
    if (artifact.artifactClass !== ARTIFACT_CLASS) errors.push(`artifactClass must be ${ARTIFACT_CLASS}`);
    if (artifact.sourceMethod !== 'compact_life_state_transition_observation') errors.push('sourceMethod mismatch');
    if (artifact.generatedBy !== GENERATED_BY) errors.push('generatedBy mismatch');
    if (artifact.generatedAt !== GENERATED_AT) errors.push('generatedAt must be task_181');
    for (const key of [
        'rawDataCaptured',
        'fieldValuesCaptured',
        'finalFactsProduced',
        'gameplayInterpretationProduced',
        'playerNamesIncluded',
        'heroNamesIncluded',
        'teamNamesIncluded',
        'entityIdsIncluded',
        'mapPositionsIncluded',
        'rawTicksIncluded',
        'rawTimestampsIncluded',
        'deathEventsEmitted',
        'respawnEventsEmitted',
        'attributionEmitted'
    ]) {
        if (artifact[key] !== false) errors.push(`${key} must be false`);
    }
    for (const [key, max] of [['participantCount', 24], ['activeParticipantCandidateCount', 24]]) {
        if (!Number.isInteger(artifact[key]) || artifact[key] < 0 || artifact[key] > max) errors.push(`${key} must be an integer between 0 and ${max}`);
    }
    if (!['available', 'partial', 'blocked'].includes(artifact.participantFilterStatus)) errors.push('participantFilterStatus invalid');
    errors.push(...validateRequiredKeys('lifeStateSignalCoverage', artifact.lifeStateSignalCoverage, [
        'participantsWithDeathCounter',
        'participantsWithAliveDeadSignal',
        'participantsWithRespawnSignal',
        'coverageStatus'
    ]));
    errors.push(...validateRequiredKeys('transitionCandidateSummary', artifact.transitionCandidateSummary, [
        'deathCounterIncrementCandidates',
        'aliveToDeadTransitionCandidates',
        'deadToAliveTransitionCandidates',
        'respawnSignalCandidates',
        'ambiguousTransitionCandidates',
        'duplicateTransitionCandidateCount'
    ]));
    errors.push(...validateRequiredKeys('deathValidationBridge', artifact.deathValidationBridge, [
        'deathValidationArtifactFound',
        'eventCount',
        'eventCountMeaning',
        'deathCounterIncrementCandidatesMatchDeathValidation',
        'canUseAsDeathEventSourceAlone'
    ]));
    errors.push(...validateRequiredKeys('readiness', artifact.readiness, [
        'readyForAliveDeadRespawnConsumption',
        'readyForCanonicalDeathEventDesign',
        'readyForAttribution',
        'readyForTeamfightDetection'
    ]));
    if (!Array.isArray(artifact.transitionCandidates)) errors.push('transitionCandidates must be an array');
    for (const [index, row] of (artifact.transitionCandidates ?? []).entries()) {
        if (!/^life_transition_[0-9]{6}$/u.test(String(row.transitionKey))) errors.push(`transitionCandidates[${index}].transitionKey invalid`);
        if (!/^participant_[0-9]{2}$/u.test(String(row.participantKey))) errors.push(`transitionCandidates[${index}].participantKey invalid`);
        if (!/^time_ref_[0-9]{6}$/u.test(String(row.timeRefKey))) errors.push(`transitionCandidates[${index}].timeRefKey invalid`);
        if (!Number.isInteger(row.normalizedElapsedSecond) || row.normalizedElapsedSecond < 0) errors.push(`transitionCandidates[${index}].normalizedElapsedSecond invalid`);
        if (row.finalFact !== false) errors.push(`transitionCandidates[${index}].finalFact must be false`);
    }
    for (const value of Object.values(artifact.transitionCandidateSummary ?? {})) {
        if (!Number.isInteger(value) || value < 0) errors.push('transitionCandidateSummary counts must be non-negative integers');
    }
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

function collectKeys(value, keys = []) {
    if (Array.isArray(value)) {
        for (const item of value) collectKeys(item, keys);
    } else if (typeof value === 'object' && value !== null) {
        for (const [key, child] of Object.entries(value)) {
            keys.push(key);
            collectKeys(child, keys);
        }
    }
    return keys;
}

export function auditAliveDeadRespawnPolicy(artifact) {
    const keys = collectKeys(artifact);
    const forbiddenKeyViolations = keys.filter(key => FORBIDDEN_OUTPUT_KEYS.has(key));
    const serialized = JSON.stringify(artifact);
    const forbiddenValueTokens = [
        '"finalFactsProduced":true',
        '"gameplayInterpretationProduced":true',
        '"fieldValuesCaptured":true',
        '"rawDataCaptured":true',
        '"rawTicksIncluded":true',
        '"rawTimestampsIncluded":true',
        '"deathEventsEmitted":true',
        '"respawnEventsEmitted":true',
        '"attributionEmitted":true',
        '"finalFact":true'
    ];
    const violations = [
        ...forbiddenKeyViolations.map(key => `forbidden_key:${key}`),
        ...forbiddenValueTokens.filter(token => serialized.includes(token)).map(token => `forbidden_token:${token}`)
    ];
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
        rawTicksIncluded: artifact.rawTicksIncluded,
        rawTimestampsIncluded: artifact.rawTimestampsIncluded,
        deathEventsEmitted: artifact.deathEventsEmitted,
        respawnEventsEmitted: artifact.respawnEventsEmitted,
        attributionEmitted: artifact.attributionEmitted
    };
}

async function loadParticipantIdentity(input) {
    const artifact = await readJson(input.participantIdentityArtifactPath);
    if (artifact.artifactClass !== 'participant_identity') throw new Error(`${input.replayId} participant identity artifact class mismatch`);
    if (artifact.generatedAt !== 'task_180') throw new Error(`${input.replayId} participant identity artifact must use task_180 provenance`);
    if (artifact.finalFactsProduced !== false || artifact.rawDataCaptured !== false || artifact.fieldValuesCaptured !== false) {
        throw new Error(`${input.replayId} participant identity artifact policy flags are unsafe`);
    }
    return artifact;
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

async function loadDeathValidation(input) {
    const artifact = await readJson(input.deathValidationArtifactPath);
    if (artifact.artifactClass !== 'death_validation') throw new Error(`${input.replayId} death validation artifact class mismatch`);
    if (artifact.generatedAt !== 'task_177') throw new Error(`${input.replayId} death validation artifact must use task_177 provenance`);
    if (artifact.finalFactsProduced !== false || artifact.rawDataCaptured !== false) {
        throw new Error(`${input.replayId} death validation artifact policy flags are unsafe`);
    }
    return artifact;
}

async function buildReplayArtifact(input) {
    const participantIdentity = await loadParticipantIdentity(input);
    const semanticFoundation = await loadSemanticFoundation(input);
    const deathValidation = await loadDeathValidation(input);
    return createAliveDeadRespawnArtifact({
        replayId: input.replayId,
        participantIdentity,
        semanticFoundation,
        deathValidation
    });
}

function summarizeStatus(artifacts, selector) {
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

function sum(artifacts, selector) {
    return artifacts.reduce((total, artifact) => total + selector(artifact), 0);
}

function buildReadinessSummary(artifacts) {
    return {
        schemaVersion: 1,
        replayCount: artifacts.length,
        participantIdentityCoverage: summarizeStatus(artifacts, artifact => artifact.participantFilterStatus),
        lifeStateTransitionCoverage: summarizeStatus(artifacts, artifact => artifact.lifeStateSignalCoverage.coverageStatus),
        readyForAliveDeadRespawnConsumptionCount: artifacts.filter(artifact => artifact.readiness.readyForAliveDeadRespawnConsumption).length,
        readyForCanonicalDeathEventDesignCount: artifacts.filter(artifact => artifact.readiness.readyForCanonicalDeathEventDesign).length,
        readyForAttributionCount: artifacts.filter(artifact => artifact.readiness.readyForAttribution).length,
        readyForTeamfightDetectionCount: artifacts.filter(artifact => artifact.readiness.readyForTeamfightDetection).length,
        readyForAliveDeadRespawnConsumption: artifacts.length > 0 && artifacts.every(artifact => artifact.readiness.readyForAliveDeadRespawnConsumption),
        readyForCanonicalDeathEventDesign: false,
        readyForAttribution: false,
        readyForTeamfightDetection: false
    };
}

function buildTransitionSummary(artifacts) {
    return {
        schemaVersion: 1,
        replayCount: artifacts.length,
        totalTransitionCandidates: sum(artifacts, artifact => artifact.transitionCandidates.length),
        totalDeathCounterIncrementCandidates: sum(artifacts, artifact => artifact.transitionCandidateSummary.deathCounterIncrementCandidates),
        totalAliveToDeadTransitionCandidates: sum(artifacts, artifact => artifact.transitionCandidateSummary.aliveToDeadTransitionCandidates),
        totalDeadToAliveTransitionCandidates: sum(artifacts, artifact => artifact.transitionCandidateSummary.deadToAliveTransitionCandidates),
        totalRespawnSignalCandidates: sum(artifacts, artifact => artifact.transitionCandidateSummary.respawnSignalCandidates),
        totalAmbiguousTransitionCandidates: sum(artifacts, artifact => artifact.transitionCandidateSummary.ambiguousTransitionCandidates),
        duplicateTransitionCandidateTotal: sum(artifacts, artifact => artifact.transitionCandidateSummary.duplicateTransitionCandidateCount),
        transitionRowsMaterialized: false,
        transitionRowsMaterializationReason: 'current safe inputs provide counts but no per-participant normalized transition timing rows',
        rawTicksIncluded: false,
        rawTimestampsIncluded: false,
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
        totalEventCount: sum(artifacts, artifact => artifact.deathValidationBridge.eventCount),
        totalDeathCounterIncrementCandidates: sum(artifacts, artifact => artifact.transitionCandidateSummary.deathCounterIncrementCandidates),
        matchStatus: artifacts.every(artifact => artifact.deathValidationBridge.deathCounterIncrementCandidatesMatchDeathValidation)
            ? 'matched'
            : 'mismatch',
        canUseAsDeathEventSourceAlone: false,
        finalFactsProduced: false,
        gameplayInterpretationProduced: false
    };
}

export async function runAliveDeadRespawnEmission({ manifest, summaryOutput }) {
    validateAliveDeadRespawnManifestShape(manifest);
    const summaryRoot = validateAliveDeadRespawnOutputRoot(summaryOutput, manifest);
    const schema = await readJson('schemas/alive-dead-respawn-compact.schema.json');
    const plan = buildAliveDeadRespawnPlan(manifest);
    const perReplayStatus = [...plan.perReplayStatus];
    const artifactWrites = [];
    const artifacts = [];

    if (plan.blockedReplayAudit.length === 0) {
        for (const input of plan.readyInputs) {
            const row = perReplayStatus.find(status => status.replayId === input.replayId);
            try {
                const artifact = await buildReplayArtifact(input);
                artifacts.push(artifact);
                artifactWrites.push({
                    artifactPath: path.join(summaryRoot.normalized, 'artifacts', input.replayId, 'alive_dead_respawn.json'),
                    artifact
                });
                Object.assign(row, {
                    status: 'emitted',
                    filesystemAccessAttempted: false,
                    openReadStreamAttempted: false,
                    parseAttempted: false,
                    artifactClassEmitted: ARTIFACT_CLASS,
                    sourceArtifactsRead: ['participant_identity', 'semantic_foundation', 'death_validation']
                });
            } catch (error) {
                Object.assign(row, {
                    status: 'blocked',
                    errorMessage: String(error?.message ?? error),
                    filesystemAccessAttempted: false,
                    openReadStreamAttempted: false,
                    parseAttempted: false,
                    artifactClassEmitted: null
                });
            }
        }
    }

    const schemaValidationRows = artifacts.map(artifact => {
        const errors = validateAliveDeadRespawnArtifact(artifact, schema);
        return { replayId: artifact.replayId, schemaValidationStatus: errors.length === 0 ? 'passed' : 'failed', errors };
    });
    const policyRows = artifacts.map(auditAliveDeadRespawnPolicy);
    const sizeRows = artifacts.map(artifact => ({
        replayId: artifact.replayId,
        artifactBytes: artifactSizeBytes(artifact),
        maxArtifactBytes: MAX_ARTIFACT_BYTES,
        sizeStatus: artifactSizeBytes(artifact) <= MAX_ARTIFACT_BYTES ? 'passed' : 'failed'
    }));

    const allReady = plan.blockedReplayAudit.length === 0
        && artifacts.length === plan.readyInputs.length
        && perReplayStatus.every(row => row.status === 'emitted')
        && schemaValidationRows.every(row => row.schemaValidationStatus === 'passed')
        && policyRows.every(row => row.policyStatus === 'passed')
        && sizeRows.every(row => row.sizeStatus === 'passed');
    const gateName = allReady
        ? (manifest.runKind === 'task181-pilot' ? 'alive_dead_respawn_compact_pilot_ready' : 'alive_dead_respawn_compact_bounded32_ready')
        : (manifest.runKind === 'task181-pilot' ? 'alive_dead_respawn_compact_pilot_blocked' : 'alive_dead_respawn_compact_bounded32_blocked');
    if (allReady) {
        for (const write of artifactWrites) await writeJson(path.resolve(REPO_ROOT, write.artifactPath), write.artifact);
    }

    const readinessSummary = buildReadinessSummary(artifacts);
    const transitionSummary = buildTransitionSummary(artifacts);
    const deathValidationBridgeSummary = buildDeathValidationBridgeSummary(artifacts);
    const gatePrefix = manifest.runKind === 'task181-pilot' ? 'alive-dead-respawn-pilot' : 'alive-dead-respawn-bounded32';
    const gate = {
        schemaVersion: 1,
        gate: gateName,
        status: allReady ? 'ready' : 'blocked',
        manifestId: manifest.manifestId,
        runKind: manifest.runKind,
        replayCount: plan.readyInputs.length,
        artifactsEmitted: allReady ? artifacts.length : 0,
        transitionRowsMaterialized: false,
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
        ...transitionSummary,
        deathValidationBridgeMatchStatus: deathValidationBridgeSummary.matchStatus,
        participantIdentityCoverageStatus: readinessSummary.participantIdentityCoverage.blocked === 0 ? 'available' : 'partial',
        timeCoverageStatus: artifacts.every(artifact => artifact.readiness.readyForAliveDeadRespawnConsumption) ? 'available' : 'partial',
        lifeStateTransitionCoverageStatus: readinessSummary.lifeStateTransitionCoverage.blocked === 0 ? 'available' : 'partial',
        readyForAliveDeadRespawnConsumption: readinessSummary.readyForAliveDeadRespawnConsumption,
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
        rawTicksIncluded: false,
        rawTimestampsIncluded: false,
        finalFactsProduced: false,
        gameplayInterpretationProduced: false
    };
    const sizeAudit = {
        schemaVersion: 1,
        sizeAuditStatus: summary.sizeAuditStatus,
        maxArtifactBytes: MAX_ARTIFACT_BYTES,
        maxRunBytes: MAX_RUN_BYTES,
        totalArtifactBytes: sizeRows.reduce((total, row) => total + row.artifactBytes, 0),
        rows: sizeRows
    };
    const protectionAudit = {
        schemaVersion: 1,
        protectionAuditStatus: summary.protectionAuditStatus,
        replayFilesAccessedOnlyFromManifest: true,
        replayFilesOpened: false,
        replay005Accessed: false,
        bots006To008Processed: false,
        outputReplaysUsed: false,
        blockedReplayAudit: plan.blockedReplayAudit,
        parserEngineBehaviorModified: false,
        packagesDeademModified: false,
        deathValidationArtifactsEmitted: false,
        semanticFoundationArtifactsEmitted: false,
        participantIdentityArtifactsEmitted: false,
        finalFactsProduced: false,
        gameplayInterpretationProduced: false,
        task182Created: false
    };

    await writeJson(path.join(summaryRoot.absolutePath, `${gatePrefix}-gate.json`), gate);
    await writeJson(path.join(summaryRoot.absolutePath, `${gatePrefix}-summary.json`), summary);
    await writeJson(path.join(summaryRoot.absolutePath, `${gatePrefix}-schema-validation-summary.json`), schemaValidationSummary);
    await writeJson(path.join(summaryRoot.absolutePath, `${gatePrefix}-output-policy-audit.json`), outputPolicyAudit);
    await writeJson(path.join(summaryRoot.absolutePath, `${gatePrefix}-size-audit.json`), sizeAudit);
    await writeJson(path.join(summaryRoot.absolutePath, `${gatePrefix}-protection-audit.json`), protectionAudit);
    await writeJson(path.join(summaryRoot.absolutePath, `${gatePrefix}-readiness-summary.json`), readinessSummary);
    await writeJson(path.join(summaryRoot.absolutePath, `${gatePrefix}-transition-summary.json`), transitionSummary);
    if (manifest.runKind === 'task181-bounded32') {
        await writeJson(path.join(summaryRoot.absolutePath, 'alive-dead-respawn-bounded32-death-validation-bridge-summary.json'), deathValidationBridgeSummary);
    }
    return { gate, summary, readinessSummary, transitionSummary, deathValidationBridgeSummary, artifacts, perReplayStatus, blockedReplayAudit: plan.blockedReplayAudit };
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const manifestPath = assertRelativeRepositoryPath(args.get('manifest'), 'manifest');
    const manifest = await readJson(manifestPath);
    const result = await runAliveDeadRespawnEmission({
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
