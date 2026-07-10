#!/usr/bin/env node
import { createReadStream } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Logger, Player } from 'deadem';

const THIS_FILE = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(THIS_FILE), '..');
const ARTIFACT_CLASS = 'life_state_transition_candidates';
const MODE = 'life_state_transition_candidates_emission';
const GENERATED_BY = 'tools/emit-life-state-transition-candidates.mjs';
const GENERATED_AT = 'task_182';
const OUTPUT_ROOT_PREFIX = 'output/local-replay-processing/life-state-transition-candidates/';
const SCHEMA_PATH = 'schemas/life-state-transition-candidates.schema.json';
const CONTROLLER_CLASS = 'CCitadelPlayerController';
const MAX_ARTIFACT_BYTES = 512 * 1024;
const MAX_RUN_BYTES = 16 * 1024 * 1024;
const EVENT_COUNT_MEANING = 'source_observed_counter_transition_candidate_count_not_final_death_fact';
const PILOT_READY_GATE = 'life_state_transition_candidates_pilot_ready';
const PILOT_BLOCKED_GATE = 'life_state_transition_candidates_pilot_blocked';
const BOUNDED32_READY_GATE = 'life_state_transition_candidates_bounded32_ready';
const BOUNDED32_BLOCKED_GATE = 'life_state_transition_candidates_bounded32_blocked';

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
    'deathEvents',
    'respawnEvents',
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
    'raw_handles',
    'account_ids',
    'steam_ids',
    'raw_player_slots',
    'raw_hero_ids',
    'raw_team_numbers',
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

function safeNumber(value) {
    if (value === undefined || value === null) return null;
    if (typeof value === 'bigint') return Number(value);
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
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

function twoDigit(index) {
    return String(index).padStart(2, '0');
}

function sixDigit(index) {
    return String(index).padStart(6, '0');
}

function stableSorted(values) {
    return [...values].sort((left, right) => {
        const leftNumber = Number(left);
        const rightNumber = Number(right);
        if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) return leftNumber - rightNumber;
        return String(left).localeCompare(String(right));
    });
}

function participantSeed(controller, ordinal) {
    return safeField(controller, ['m_iPlayerSlot', 'm_iPlayerID', 'm_unAccountID', 'm_iAccountID', 'm_steamID'])
        ?? `observed-controller-${ordinal}`;
}

function deathCounter(controller) {
    return safeNumber(safeField(controller, ['m_iDeaths']));
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
        deathValidationArtifactPath: replay?.deathValidationArtifactPath ?? null
    };
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
        rawTicksIncluded: false,
        rawTimestampsIncluded: false,
        finalFactsProduced: false,
        gameplayInterpretationProduced: false
    };
}

export function validateLifeStateManifestShape(manifest) {
    if (typeof manifest !== 'object' || manifest === null || Array.isArray(manifest)) throw new Error('manifest must be an object');
    if (manifest.schemaVersion !== 1) throw new Error('manifest schemaVersion must be 1');
    if (!manifest.manifestId) throw new Error('manifestId is required');
    if (!['task182-pilot', 'task182-bounded32'].includes(manifest.runKind)) throw new Error('manifest runKind is invalid');
    if (manifest.mode !== MODE) throw new Error(`manifest mode must be ${MODE}`);
    if (manifest.artifactClass !== ARTIFACT_CLASS) throw new Error(`manifest artifactClass must be ${ARTIFACT_CLASS}`);
    if (manifest.replayProcessingAllowed !== true) throw new Error('manifest must explicitly allow replay processing');
    if (manifest.realArtifactEmissionAllowed !== true) throw new Error('manifest must explicitly allow real artifact emission');
    if (manifest.generationLabel !== GENERATED_AT) throw new Error(`manifest generationLabel must be ${GENERATED_AT}`);
    if (manifest.rawDataCaptured !== false) throw new Error('manifest rawDataCaptured must be false');
    if (manifest.fieldValuesCaptured !== false) throw new Error('manifest fieldValuesCaptured must be false');
    if (manifest.rawTicksIncluded !== false) throw new Error('manifest rawTicksIncluded must be false');
    if (manifest.rawTimestampsIncluded !== false) throw new Error('manifest rawTimestampsIncluded must be false');
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

export function validateLifeStateOutputRoot(summaryOutput, manifest) {
    const normalized = assertRelativeRepositoryPath(summaryOutput, 'summary output').replace(/\/?$/u, '/');
    const expected = `${OUTPUT_ROOT_PREFIX}${manifest.runKind}/`;
    if (normalized !== expected) throw new Error(`summary output root must be exactly ${expected}`);
    return { normalized, absolutePath: path.resolve(REPO_ROOT, normalized) };
}

export function buildLifeStatePlan(manifest) {
    validateLifeStateManifestShape(manifest);
    const allowlist = manifest.allowedReplays.map(normalizeReplay);
    const requested = (Array.isArray(manifest.requestedReplays) && manifest.requestedReplays.length > 0
        ? manifest.requestedReplays
        : manifest.allowedReplays).map(normalizeReplay);
    const allowlistById = new Map();
    for (const replay of allowlist) {
        if (!replay.replayId || !replay.localPath || !replay.participantIdentityArtifactPath || !replay.deathValidationArtifactPath) {
            throw new Error('allowedReplays entries require replayId, localPath, participantIdentityArtifactPath, and deathValidationArtifactPath');
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
        const localPath = assertRelativeRepositoryPath(allowed.localPath, `${allowed.replayId} localPath`);
        const participantIdentityArtifactPath = assertRelativeRepositoryPath(
            allowed.participantIdentityArtifactPath,
            `${allowed.replayId} participantIdentityArtifactPath`
        );
        const deathValidationArtifactPath = assertRelativeRepositoryPath(
            allowed.deathValidationArtifactPath,
            `${allowed.replayId} deathValidationArtifactPath`
        );
        const input = {
            ...allowed,
            localPath,
            participantIdentityArtifactPath,
            deathValidationArtifactPath,
            absolutePath: path.resolve(REPO_ROOT, localPath),
            inputLabel: path.basename(localPath)
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
            rawTicksIncluded: false,
            rawTimestampsIncluded: false,
            finalFactsProduced: false,
            gameplayInterpretationProduced: false
        });
    }
    return { readyInputs, blockedReplayAudit, perReplayStatus };
}

async function loadParticipantIdentity(input) {
    const artifact = await readJson(input.participantIdentityArtifactPath);
    if (artifact.artifactClass !== 'participant_identity') throw new Error(`${input.replayId} participant identity artifact class mismatch`);
    if (artifact.generatedAt !== 'task_180') throw new Error(`${input.replayId} participant identity artifact must use task_180 provenance`);
    if (artifact.finalFactsProduced !== false || artifact.rawDataCaptured !== false || artifact.fieldValuesCaptured !== false) {
        throw new Error(`${input.replayId} participant identity artifact policy flags are unsafe`);
    }
    if (!Array.isArray(artifact.participants) || artifact.participants.length === 0) {
        throw new Error(`${input.replayId} participant identity artifact has no participants`);
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
    const eventCount = Number(artifact.eventCount);
    return { found: true, eventCount: Number.isFinite(eventCount) ? eventCount : 0 };
}

function observeControllerCounters(player) {
    const controllers = player.getDemo().getEntitiesByClassName(CONTROLLER_CLASS);
    let fallbackOrdinal = 0;
    const observations = [];
    for (const controller of controllers) {
        fallbackOrdinal += 1;
        const seed = participantSeed(controller, fallbackOrdinal);
        const deaths = deathCounter(controller);
        if (deaths !== null) observations.push({ seed, deaths });
    }
    return observations;
}

function buildParticipantKeyMap(seeds, participantIdentity) {
    const sortedSeeds = stableSorted(seeds);
    const participantKeys = participantIdentity.participants.map(participant => participant.participantKey);
    const expectedKeys = sortedSeeds.map((_, index) => `participant_${twoDigit(index + 1)}`);
    const participantKeysMatch = participantKeys.length === expectedKeys.length
        && expectedKeys.every(key => participantKeys.includes(key));
    if (!participantKeysMatch) {
        throw new Error(`participant mapping count/key mismatch; observed=${expectedKeys.length}; artifact=${participantKeys.length}`);
    }
    const map = new Map();
    sortedSeeds.forEach((seed, index) => map.set(seed, `participant_${twoDigit(index + 1)}`));
    return map;
}

function createTransitionRows(rawTransitions, participantKeyMap) {
    let unmappedParticipantCandidates = 0;
    const rows = [];
    for (const transition of rawTransitions) {
        const participantKey = participantKeyMap.get(transition.seed);
        if (!participantKey) {
            unmappedParticipantCandidates += 1;
            continue;
        }
        const ordinal = rows.length + 1;
        rows.push({
            transitionKey: `life_transition_${sixDigit(ordinal)}`,
            participantKey,
            transitionType: 'death_counter_increment_candidate',
            timeRefKey: `time_ref_${sixDigit(ordinal)}`,
            normalizedElapsedSecond: transition.normalizedElapsedSecond,
            sourceSignal: 'controller_death_counter_increment',
            sourceSignalStatus: 'available',
            candidateConfidence: 'high',
            finalFact: false
        });
    }
    return { rows, unmappedParticipantCandidates };
}

function duplicateCount(keys) {
    const seen = new Set();
    let duplicates = 0;
    for (const key of keys) {
        if (seen.has(key)) duplicates += 1;
        seen.add(key);
    }
    return duplicates;
}

export function createLifeStateTransitionArtifact({ replayId, transitionCandidates, unmappedParticipantCandidates, deathValidation }) {
    const duplicateTransitionCandidateCount = duplicateCount(transitionCandidates.map(row => row.transitionKey));
    const materializedCount = transitionCandidates.length;
    const bridgeMatchStatus = materializedCount === deathValidation.eventCount ? 'matched' : 'mismatch';
    return {
        schemaVersion: 1,
        replayId,
        artifactClass: ARTIFACT_CLASS,
        sourceMethod: 'replay_sourced_compact_transition_observation',
        generatedBy: GENERATED_BY,
        generatedAt: GENERATED_AT,
        rawDataCaptured: false,
        fieldValuesCaptured: false,
        rawTicksIncluded: false,
        rawTimestampsIncluded: false,
        finalFactsProduced: false,
        gameplayInterpretationProduced: false,
        participantIdentityArtifactFound: true,
        participantMappingStatus: unmappedParticipantCandidates === 0 ? 'available' : 'blocked',
        samplingPolicy: 'one_second_source_sampling',
        normalizedTimeBaseStatus: 'available',
        transitionCandidates,
        transitionCandidateSummary: {
            totalTransitionCandidates: materializedCount,
            deathCounterIncrementCandidates: materializedCount,
            lifeSignalChangeCandidates: 0,
            respawnSignalChangeCandidates: 0,
            ambiguousTransitionCandidates: 0,
            unmappedParticipantCandidates,
            duplicateTransitionCandidateCount
        },
        deathValidationBridge: {
            deathValidationArtifactFound: true,
            eventCount: deathValidation.eventCount,
            eventCountMeaning: EVENT_COUNT_MEANING,
            materializedDeathCounterCandidateCount: materializedCount,
            bridgeMatchStatus,
            canUseAsFinalDeathEventSource: false
        },
        readiness: {
            readyForTransitionCandidateConsumption: materializedCount > 0 && unmappedParticipantCandidates === 0,
            readyForCanonicalDeathEventCandidateDesign: materializedCount > 0 && unmappedParticipantCandidates === 0 && bridgeMatchStatus === 'matched',
            readyForCanonicalDeathEventEmission: false,
            readyForAttribution: false,
            readyForTeamfightDetection: false
        },
        limitations: [
            'Transition rows are replay-sourced death-counter increment candidates, not final death events.',
            'Participant keys are synthetic replay-local keys reproduced from the Task 180 deterministic ordering; raw identity values are not persisted.',
            'normalizedElapsedSecond is a bounded time reference; raw ticks, raw timestamps, and tick rate are not persisted per transition.',
            'No killer, victim, assist, damage, objective, spatial, fight, decision, or gameplay causality is emitted.'
        ]
    };
}

async function runReplayTransitionObservation(input) {
    const player = new Player(undefined, Logger.NOOP);
    const started = performance.now();
    const summary = {
        schemaVersion: 1,
        replayId: input.replayId,
        inputLabel: input.inputLabel,
        parserLoadSucceeded: false,
        parseCompleted: false,
        reachedEnd: false,
        samplesAttempted: 0,
        samplesWithControllers: 0,
        transitionRowsMaterialized: 0,
        mappedParticipantRows: 0,
        unmappedParticipantRows: 0,
        normalizedTimeRows: 0,
        deathValidationEventCount: 0,
        bridgeMatchStatus: 'mismatch',
        participantMappingStatus: 'blocked',
        status: 'not_started',
        errorMessage: null,
        rawDataCaptured: false,
        fieldValuesCaptured: false,
        rawTicksIncluded: false,
        rawTimestampsIncluded: false,
        finalFactsProduced: false,
        gameplayInterpretationProduced: false
    };
    const previousBySeed = new Map();
    const participantSeeds = new Set();
    const rawTransitions = [];

    try {
        const participantIdentity = await loadParticipantIdentity(input);
        const deathValidation = await loadDeathValidation(input);
        summary.deathValidationEventCount = deathValidation.eventCount;
        await player.load(createReadStream(input.absolutePath));
        summary.parserLoadSucceeded = true;
        const firstTick = safeNumber(player.getFirstTick()) ?? safeNumber(player.getCurrentTick()) ?? 0;
        const tickRate = safeNumber(player.getDemo().server?.tickRate) ?? 30;
        let nextSampleTick = firstTick;

        while (true) {
            const currentTick = safeNumber(player.getCurrentTick());
            if (currentTick !== null && currentTick >= nextSampleTick) {
                summary.samplesAttempted += 1;
                const observations = observeControllerCounters(player);
                if (observations.length > 0) summary.samplesWithControllers += 1;
                const normalizedElapsedSecond = Math.max(0, Math.round((currentTick - firstTick) / Math.max(1, tickRate)));
                for (const row of observations) {
                    participantSeeds.add(row.seed);
                    const previous = previousBySeed.get(row.seed);
                    if (previous !== undefined && row.deaths > previous) {
                        rawTransitions.push({ seed: row.seed, normalizedElapsedSecond });
                    }
                    previousBySeed.set(row.seed, row.deaths);
                }
                nextSampleTick = currentTick + Math.max(1, Math.round(tickRate));
            }
            const advanced = await player.nextTick();
            if (!advanced) {
                summary.parseCompleted = true;
                summary.reachedEnd = true;
                break;
            }
        }

        const participantKeyMap = buildParticipantKeyMap(participantSeeds, participantIdentity);
        const materialized = createTransitionRows(rawTransitions, participantKeyMap);
        const artifact = createLifeStateTransitionArtifact({
            replayId: input.replayId,
            transitionCandidates: materialized.rows,
            unmappedParticipantCandidates: materialized.unmappedParticipantCandidates,
            deathValidation
        });
        summary.transitionRowsMaterialized = artifact.transitionCandidateSummary.totalTransitionCandidates;
        summary.mappedParticipantRows = artifact.transitionCandidateSummary.totalTransitionCandidates;
        summary.unmappedParticipantRows = artifact.transitionCandidateSummary.unmappedParticipantCandidates;
        summary.normalizedTimeRows = artifact.transitionCandidateSummary.totalTransitionCandidates;
        summary.bridgeMatchStatus = artifact.deathValidationBridge.bridgeMatchStatus;
        summary.participantMappingStatus = artifact.participantMappingStatus;
        summary.status = 'emitted';
        summary.durationMs = Math.round(performance.now() - started);
        return { summary, artifact };
    } catch (error) {
        summary.status = 'blocked';
        summary.errorMessage = String(error?.message ?? error);
        summary.durationMs = Math.round(performance.now() - started);
        return { summary, artifact: null };
    } finally {
        await player.dispose?.().catch(() => {});
    }
}

function collectForbiddenOutputKeys(value, pathParts = []) {
    const findings = [];
    if (Array.isArray(value)) {
        for (let index = 0; index < value.length; index += 1) {
            findings.push(...collectForbiddenOutputKeys(value[index], [...pathParts, String(index)]));
        }
        return findings;
    }
    if (typeof value !== 'object' || value === null) return findings;
    for (const [key, nested] of Object.entries(value)) {
        if (FORBIDDEN_OUTPUT_KEYS.has(key)) findings.push([...pathParts, key].join('.'));
        findings.push(...collectForbiddenOutputKeys(nested, [...pathParts, key]));
    }
    return findings;
}

export function validateLifeStateTransitionArtifact(artifact, schema) {
    const errors = [];
    if (typeof artifact !== 'object' || artifact === null || Array.isArray(artifact)) return ['artifact must be object'];
    for (const required of schema.required) {
        if (!(required in artifact)) errors.push(`missing required ${required}`);
    }
    for (const key of Object.keys(artifact)) {
        if (!(key in schema.properties)) errors.push(`additional property ${key} is forbidden`);
        if (FORBIDDEN_OUTPUT_KEYS.has(key)) errors.push(`forbidden key ${key}`);
    }
    if (artifact.schemaVersion !== 1) errors.push('schemaVersion must be 1');
    if (!/^replay_[0-9]{3}$/u.test(String(artifact.replayId ?? ''))) errors.push('replayId pattern violation');
    if (artifact.artifactClass !== ARTIFACT_CLASS) errors.push(`artifactClass must be ${ARTIFACT_CLASS}`);
    if (artifact.generatedAt !== GENERATED_AT) errors.push(`generatedAt must be ${GENERATED_AT}`);
    for (const flag of ['rawDataCaptured', 'fieldValuesCaptured', 'rawTicksIncluded', 'rawTimestampsIncluded', 'finalFactsProduced', 'gameplayInterpretationProduced']) {
        if (artifact[flag] !== false) errors.push(`${flag} must be false`);
    }
    if (artifact.participantIdentityArtifactFound !== true) errors.push('participantIdentityArtifactFound must be true');
    if (artifact.participantMappingStatus !== 'available') errors.push('participantMappingStatus must be available');
    if (artifact.samplingPolicy !== 'one_second_source_sampling') errors.push('samplingPolicy violation');
    if (artifact.normalizedTimeBaseStatus !== 'available') errors.push('normalizedTimeBaseStatus must be available');
    if (!Array.isArray(artifact.transitionCandidates) || artifact.transitionCandidates.length < 1) errors.push('transitionCandidates must contain at least one row');
    const transitionKeys = new Set();
    for (const [index, row] of (artifact.transitionCandidates ?? []).entries()) {
        const label = `transitionCandidates[${index}]`;
        if (!/^life_transition_[0-9]{6}$/u.test(String(row.transitionKey ?? ''))) errors.push(`${label}.transitionKey pattern violation`);
        if (transitionKeys.has(row.transitionKey)) errors.push(`${label}.transitionKey duplicate`);
        transitionKeys.add(row.transitionKey);
        if (!/^participant_[0-9]{2}$/u.test(String(row.participantKey ?? ''))) errors.push(`${label}.participantKey pattern violation`);
        if (row.transitionType !== 'death_counter_increment_candidate') errors.push(`${label}.transitionType violation`);
        if (!/^time_ref_[0-9]{6}$/u.test(String(row.timeRefKey ?? ''))) errors.push(`${label}.timeRefKey pattern violation`);
        if (!Number.isInteger(row.normalizedElapsedSecond) || row.normalizedElapsedSecond < 0) errors.push(`${label}.normalizedElapsedSecond must be non-negative integer`);
        if (row.sourceSignal !== 'controller_death_counter_increment') errors.push(`${label}.sourceSignal violation`);
        if (row.sourceSignalStatus !== 'available') errors.push(`${label}.sourceSignalStatus violation`);
        if (row.candidateConfidence !== 'high') errors.push(`${label}.candidateConfidence violation`);
        if (row.finalFact !== false) errors.push(`${label}.finalFact must be false`);
    }
    const summary = artifact.transitionCandidateSummary ?? {};
    if (summary.totalTransitionCandidates !== artifact.transitionCandidates?.length) errors.push('totalTransitionCandidates must equal transitionCandidates length');
    if (summary.deathCounterIncrementCandidates !== artifact.transitionCandidates?.length) errors.push('deathCounterIncrementCandidates must equal transitionCandidates length');
    if (summary.unmappedParticipantCandidates !== 0) errors.push('unmappedParticipantCandidates must be 0');
    if (summary.duplicateTransitionCandidateCount !== 0) errors.push('duplicateTransitionCandidateCount must be 0');
    if (artifact.deathValidationBridge?.deathValidationArtifactFound !== true) errors.push('deathValidationArtifactFound must be true');
    if (artifact.deathValidationBridge?.eventCountMeaning !== EVENT_COUNT_MEANING) errors.push('eventCountMeaning violation');
    if (artifact.deathValidationBridge?.materializedDeathCounterCandidateCount !== artifact.transitionCandidates?.length) {
        errors.push('materializedDeathCounterCandidateCount must equal transitionCandidates length');
    }
    if (!['matched', 'mismatch'].includes(artifact.deathValidationBridge?.bridgeMatchStatus)) errors.push('bridgeMatchStatus violation');
    if (artifact.deathValidationBridge?.canUseAsFinalDeathEventSource !== false) errors.push('canUseAsFinalDeathEventSource must be false');
    if (artifact.readiness?.readyForTransitionCandidateConsumption !== true) errors.push('readyForTransitionCandidateConsumption must be true');
    if (artifact.readiness?.readyForCanonicalDeathEventEmission !== false) errors.push('readyForCanonicalDeathEventEmission must be false');
    if (artifact.readiness?.readyForAttribution !== false) errors.push('readyForAttribution must be false');
    if (artifact.readiness?.readyForTeamfightDetection !== false) errors.push('readyForTeamfightDetection must be false');
    if (artifact.readiness?.readyForCanonicalDeathEventCandidateDesign !== (artifact.deathValidationBridge?.bridgeMatchStatus === 'matched')) {
        errors.push('readyForCanonicalDeathEventCandidateDesign must reflect bridge match status');
    }
    if (!Array.isArray(artifact.limitations) || artifact.limitations.length < 1 || artifact.limitations.length > 12) {
        errors.push('limitations must contain 1..12 strings');
    }
    for (const keyPath of collectForbiddenOutputKeys(artifact)) errors.push(`forbidden key ${keyPath}`);
    return [...new Set(errors)];
}

export function auditLifeStatePolicy(artifact) {
    const forbiddenKeyPaths = collectForbiddenOutputKeys(artifact);
    const rowViolations = [];
    for (const [index, row] of artifact.transitionCandidates.entries()) {
        if (row.finalFact !== false) rowViolations.push(`transitionCandidates[${index}].finalFact must be false`);
        if (!Number.isInteger(row.normalizedElapsedSecond)) rowViolations.push(`transitionCandidates[${index}].normalizedElapsedSecond must be integer`);
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
        attributionIncluded: false,
        finalDeathEventsEmitted: false,
        finalRespawnEventsEmitted: false
    };
}

function buildReadinessSummary(artifacts) {
    return {
        schemaVersion: 1,
        replayCount: artifacts.length,
        readyForTransitionCandidateConsumptionCount: artifacts.filter(artifact => artifact.readiness.readyForTransitionCandidateConsumption).length,
        readyForCanonicalDeathEventCandidateDesignCount: artifacts.filter(artifact => artifact.readiness.readyForCanonicalDeathEventCandidateDesign).length,
        readyForCanonicalDeathEventEmissionCount: artifacts.filter(artifact => artifact.readiness.readyForCanonicalDeathEventEmission).length,
        readyForAttributionCount: artifacts.filter(artifact => artifact.readiness.readyForAttribution).length,
        readyForTeamfightDetectionCount: artifacts.filter(artifact => artifact.readiness.readyForTeamfightDetection).length,
        rawDataCaptured: false,
        fieldValuesCaptured: false,
        rawTicksIncluded: false,
        rawTimestampsIncluded: false,
        finalFactsProduced: false,
        gameplayInterpretationProduced: false
    };
}

function buildBridgeComparison(artifacts) {
    return {
        schemaVersion: 1,
        replayCount: artifacts.length,
        matchedCount: artifacts.filter(artifact => artifact.deathValidationBridge.bridgeMatchStatus === 'matched').length,
        mismatchCount: artifacts.filter(artifact => artifact.deathValidationBridge.bridgeMatchStatus === 'mismatch').length,
        totalDeathValidationEventCount: artifacts.reduce((sum, artifact) => sum + artifact.deathValidationBridge.eventCount, 0),
        totalMaterializedDeathCounterCandidateCount: artifacts.reduce(
            (sum, artifact) => sum + artifact.deathValidationBridge.materializedDeathCounterCandidateCount,
            0
        ),
        eventCountMeaning: EVENT_COUNT_MEANING,
        canUseAsFinalDeathEventSource: false
    };
}

function buildTransitionSummary(artifacts) {
    return {
        schemaVersion: 1,
        replayCount: artifacts.length,
        totalTransitionCandidates: artifacts.reduce((sum, artifact) => sum + artifact.transitionCandidateSummary.totalTransitionCandidates, 0),
        deathCounterIncrementCandidates: artifacts.reduce((sum, artifact) => sum + artifact.transitionCandidateSummary.deathCounterIncrementCandidates, 0),
        lifeSignalChangeCandidates: 0,
        respawnSignalChangeCandidates: 0,
        ambiguousTransitionCandidates: 0,
        unmappedParticipantCandidates: artifacts.reduce((sum, artifact) => sum + artifact.transitionCandidateSummary.unmappedParticipantCandidates, 0),
        duplicateTransitionCandidateCount: artifacts.reduce((sum, artifact) => sum + artifact.transitionCandidateSummary.duplicateTransitionCandidateCount, 0),
        finalFactsProduced: false,
        gameplayInterpretationProduced: false
    };
}

export async function runLifeStateTransitionEmission({ manifest, summaryOutput }) {
    validateLifeStateManifestShape(manifest);
    const summaryRoot = validateLifeStateOutputRoot(summaryOutput, manifest);
    const schema = await readJson(SCHEMA_PATH);
    const plan = buildLifeStatePlan(manifest);
    const perReplayStatus = [...plan.perReplayStatus];
    const replayResults = [];
    const artifactWrites = [];

    if (plan.blockedReplayAudit.length === 0) {
        for (const input of plan.readyInputs) {
            const result = await runReplayTransitionObservation(input);
            replayResults.push(result);
            const row = perReplayStatus.find(status => status.replayId === input.replayId);
            Object.assign(row, {
                status: result.summary.status,
                parserLoadSucceeded: result.summary.parserLoadSucceeded,
                parseCompleted: result.summary.parseCompleted,
                reachedEnd: result.summary.reachedEnd,
                samplesAttempted: result.summary.samplesAttempted,
                samplesWithControllers: result.summary.samplesWithControllers,
                transitionRowsMaterialized: result.summary.transitionRowsMaterialized,
                mappedParticipantRows: result.summary.mappedParticipantRows,
                unmappedParticipantRows: result.summary.unmappedParticipantRows,
                normalizedTimeRows: result.summary.normalizedTimeRows,
                deathValidationEventCount: result.summary.deathValidationEventCount,
                bridgeMatchStatus: result.summary.bridgeMatchStatus,
                participantMappingStatus: result.summary.participantMappingStatus,
                errorMessage: result.summary.errorMessage,
                filesystemAccessAttempted: true,
                openReadStreamAttempted: true,
                parseAttempted: true,
                artifactClassEmitted: result.artifact ? ARTIFACT_CLASS : null
            });
            if (result.artifact) {
                artifactWrites.push({
                    artifactPath: path.join(summaryRoot.normalized, 'artifacts', input.replayId, 'life_state_transition_candidates.json'),
                    artifact: result.artifact
                });
            }
        }
    }

    const artifacts = replayResults.map(result => result.artifact).filter(Boolean);
    const schemaRows = artifacts.map(artifact => {
        const errors = validateLifeStateTransitionArtifact(artifact, schema);
        return { replayId: artifact.replayId, schemaValidationStatus: errors.length === 0 ? 'passed' : 'failed', errors };
    });
    const policyRows = artifacts.map(auditLifeStatePolicy);
    const sizeRows = artifacts.map(artifact => ({
        replayId: artifact.replayId,
        artifactBytes: artifactSizeBytes(artifact),
        maxArtifactBytes: MAX_ARTIFACT_BYTES,
        sizeStatus: artifactSizeBytes(artifact) <= MAX_ARTIFACT_BYTES ? 'passed' : 'failed'
    }));

    const allReady = plan.blockedReplayAudit.length === 0
        && replayResults.length === plan.readyInputs.length
        && replayResults.every(result => result.artifact && result.summary.parseCompleted)
        && artifacts.every(artifact => artifact.transitionCandidates.length > 0)
        && artifacts.every(artifact => artifact.transitionCandidateSummary.unmappedParticipantCandidates === 0)
        && artifacts.every(artifact => artifact.deathValidationBridge.bridgeMatchStatus === 'matched')
        && schemaRows.every(row => row.schemaValidationStatus === 'passed')
        && policyRows.every(row => row.outputPolicyStatus === 'passed')
        && sizeRows.every(row => row.sizeStatus === 'passed');
    const gateName = allReady
        ? (manifest.runKind === 'task182-pilot' ? PILOT_READY_GATE : BOUNDED32_READY_GATE)
        : (manifest.runKind === 'task182-pilot' ? PILOT_BLOCKED_GATE : BOUNDED32_BLOCKED_GATE);

    if (allReady) {
        for (const write of artifactWrites) await writeJson(path.resolve(REPO_ROOT, write.artifactPath), write.artifact);
    }

    const gatePrefix = manifest.runKind === 'task182-pilot' ? 'life-state-transition-pilot' : 'life-state-transition-bounded32';
    const transitionSummary = buildTransitionSummary(artifacts);
    const bridgeComparison = buildBridgeComparison(artifacts);
    const readinessSummary = buildReadinessSummary(artifacts);
    const gate = {
        schemaVersion: 1,
        gate: gateName,
        status: allReady ? 'ready' : 'blocked',
        manifestId: manifest.manifestId,
        runKind: manifest.runKind,
        replayCount: plan.readyInputs.length,
        artifactsEmitted: allReady ? artifacts.length : 0,
        transitionRowsMaterialized: allReady ? transitionSummary.totalTransitionCandidates : 0,
        rawDataCaptured: false,
        fieldValuesCaptured: false,
        rawTicksIncluded: false,
        rawTimestampsIncluded: false,
        finalFactsProduced: false,
        gameplayInterpretationProduced: false
    };
    const summary = {
        schemaVersion: 1,
        manifestId: manifest.manifestId,
        runKind: manifest.runKind,
        replayCount: plan.readyInputs.length,
        parserCompletionCount: replayResults.filter(result => result.summary.parseCompleted).length,
        artifactsEmitted: allReady ? artifacts.length : 0,
        totalTransitionRows: allReady ? transitionSummary.totalTransitionCandidates : 0,
        mappedParticipantRows: allReady ? transitionSummary.deathCounterIncrementCandidates : 0,
        unmappedParticipantRows: allReady ? transitionSummary.unmappedParticipantCandidates : 0,
        normalizedTimeRows: allReady ? transitionSummary.totalTransitionCandidates : 0,
        bridgeMatchStatus: bridgeComparison.mismatchCount === 0 && bridgeComparison.matchedCount === artifacts.length ? 'matched' : 'mismatch',
        readyForCanonicalDeathEventCandidateDesign: allReady,
        readyForCanonicalDeathEventEmission: false,
        readyForAttribution: false,
        readyForTeamfightDetection: false,
        schemaValidationStatus: schemaRows.every(row => row.schemaValidationStatus === 'passed') ? 'passed' : 'failed',
        outputPolicyStatus: policyRows.every(row => row.outputPolicyStatus === 'passed') ? 'passed' : 'failed',
        sizeAuditStatus: sizeRows.every(row => row.sizeStatus === 'passed') ? 'passed' : 'failed',
        protectionAuditStatus: plan.blockedReplayAudit.length === 0 ? 'passed' : 'blocked',
        rawDataCaptured: false,
        fieldValuesCaptured: false,
        rawTicksIncluded: false,
        rawTimestampsIncluded: false,
        finalFactsProduced: false,
        gameplayInterpretationProduced: false
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
    const mappingAudit = {
        schemaVersion: 1,
        mappingAuditStatus: artifacts.every(artifact => artifact.participantMappingStatus === 'available') ? 'passed' : 'blocked',
        replayCount: artifacts.length,
        unmappedParticipantRows: transitionSummary.unmappedParticipantCandidates,
        participantKeyAlgorithm: 'task180_seed_sort_reproduced_in_memory',
        rawIdentityPersisted: false,
        rawDataCaptured: false,
        fieldValuesCaptured: false
    };
    const protectionAudit = {
        schemaVersion: 1,
        protectionAuditStatus: summary.protectionAuditStatus,
        replayFilesAccessedOnlyFromManifest: true,
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
        rawDataCaptured: false,
        fieldValuesCaptured: false,
        rawTicksIncluded: false,
        rawTimestampsIncluded: false,
        finalFactsProduced: false,
        gameplayInterpretationProduced: false,
        task183Created: false
    };

    await writeJson(path.join(summaryRoot.absolutePath, `${gatePrefix}-gate.json`), gate);
    await writeJson(path.join(summaryRoot.absolutePath, `${gatePrefix}-summary.json`), summary);
    await writeJson(path.join(summaryRoot.absolutePath, `${gatePrefix}-schema-validation-summary.json`), schemaValidationSummary);
    await writeJson(path.join(summaryRoot.absolutePath, `${gatePrefix}-output-policy-audit.json`), outputPolicyAudit);
    await writeJson(path.join(summaryRoot.absolutePath, `${gatePrefix}-size-audit.json`), sizeAudit);
    await writeJson(path.join(summaryRoot.absolutePath, `${gatePrefix}-protection-audit.json`), protectionAudit);
    await writeJson(path.join(summaryRoot.absolutePath, `${gatePrefix}-mapping-audit.json`), mappingAudit);
    await writeJson(path.join(summaryRoot.absolutePath, `${gatePrefix}-bridge-comparison.json`), bridgeComparison);
    if (manifest.runKind === 'task182-bounded32') {
        await writeJson(path.join(summaryRoot.absolutePath, 'life-state-transition-bounded32-readiness-summary.json'), readinessSummary);
    }
    return { gate, summary, readinessSummary, transitionSummary, bridgeComparison, artifacts, perReplayStatus, blockedReplayAudit: plan.blockedReplayAudit };
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const manifestPath = assertRelativeRepositoryPath(args.get('manifest'), 'manifest');
    const manifest = await readJson(manifestPath);
    const result = await runLifeStateTransitionEmission({
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
