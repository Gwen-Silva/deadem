#!/usr/bin/env node
import { createReadStream } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Logger, Player } from 'deadem';

import {
    auditDeathValidationPolicy,
    countDuplicateKeys,
    createDeathValidationArtifact,
    validateDeathValidationArtifact
} from './emit-death-validation-compact-artifacts.mjs';

const THIS_FILE = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(THIS_FILE), '..');
const SCHEMA_PATH = path.resolve(REPO_ROOT, 'schemas/death-validation-compact.schema.json');
const REFERENCE_STATUS_PATH = 'output/local-replay-processing/exact-15-death-validation-compact-emission/per-replay-emission-status.json';
const SUCCESS_GATE = 'allowlisted_death_validation_batch_parity_emitted';
const BLOCKED_GATE = 'allowlisted_death_validation_batch_parity_blocked';
const PARTIAL_BLOCKED_GATE = 'allowlisted_death_validation_batch_parity_partial_blocked';
const SUPPORTED_MODE = 'death_validation_compact_emission';
const ALLOWED_ARTIFACT_CLASS = 'death_validation';
const MAX_ARTIFACT_BYTES = 32 * 1024;
const CONTROLLER_CLASS = 'CCitadelPlayerController';

export const FORBIDDEN_REPLAY_IDS = new Set(['replay_005', 'replay_006', 'replay_007', 'replay_008', 'replay_020']);

export const FORBIDDEN_ALLOWLISTED_BATCH_OUTPUT_SURFACES = [
    'death_events',
    'respawn_events',
    'timelines',
    'objective_lifecycle',
    'player_identity_rows',
    'attribution',
    'field_values',
    'raw_data',
    'snapshots',
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

function artifactSizeBytes(value) {
    return Buffer.byteLength(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function writeJson(filePath, value) {
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function writeMarkdown(filePath, lines) {
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, `${lines.join('\n')}\n`, 'utf8');
}

function replayKey(replay) {
    return `${replay?.replayId ?? '<missing>'}|${slash(replay?.localPath ?? '<missing>')}`;
}

function compactBlockedStatus(replay, reasons) {
    return {
        schemaVersion: 1,
        replayId: replay?.replayId ?? null,
        localPath: replay?.localPath ?? null,
        requestedMode: replay?.requestedMode ?? replay?.mode ?? null,
        status: 'blocked_by_policy',
        reasons,
        blockedBeforeFilesystemAccess: true,
        filesystemAccessAttempted: false,
        statAttempted: false,
        hashAttempted: false,
        openReadStreamAttempted: false,
        copyAttempted: false,
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
    if (/(?:^|\/)(?:partida|replay|match)[_-]?0?20(?:\.dem)?$/iu.test(lowerPath)) {
        reasons.push('replay_020_not_authorized');
    }
    if (path.isAbsolute(localPath)) reasons.push('absolute_path_forbidden');
    if (lowerPath === '..' || lowerPath.startsWith('../') || lowerPath.includes('/../')) reasons.push('path_traversal_forbidden');
    if (lowerPath.startsWith('output/replays/')) reasons.push('output_replays_path_forbidden');
    return [...new Set(reasons)];
}

function normalizeAllowedReplay(replay) {
    if (typeof replay === 'string') {
        return { replayId: replay, localPath: null, requestedMode: SUPPORTED_MODE };
    }
    return {
        replayId: replay?.replayId ?? null,
        localPath: replay?.localPath ?? null,
        selectionGroup: replay?.selectionGroup ?? null,
        requestedMode: replay?.requestedMode ?? replay?.mode ?? SUPPORTED_MODE
    };
}

export function validateAllowlistedBatchManifestShape(manifest) {
    if (typeof manifest !== 'object' || manifest === null || Array.isArray(manifest)) {
        throw new Error('manifest must be an object');
    }
    if (manifest.schemaVersion !== 1) throw new Error('manifest schemaVersion must be 1');
    if (!manifest.manifestId) throw new Error('manifestId is required');
    if (manifest.mode !== SUPPORTED_MODE) throw new Error(`manifest mode must be ${SUPPORTED_MODE}`);
    if (manifest.artifactClass !== ALLOWED_ARTIFACT_CLASS) throw new Error('manifest artifactClass must be death_validation');
    if (manifest.replayProcessingAllowed !== true) throw new Error('manifest must explicitly allow replay processing');
    if (manifest.realArtifactEmissionAllowed !== true) throw new Error('manifest must explicitly allow real artifact emission');
    if (manifest.rawDataCaptured !== false) throw new Error('manifest rawDataCaptured must be false');
    if (manifest.finalFactsProduced !== false) throw new Error('manifest finalFactsProduced must be false');
    if (manifest.gameplayInterpretationProduced !== false) throw new Error('manifest gameplayInterpretationProduced must be false');
    if (manifest.eventCountMeaning !== 'source_observed_counter_transition_candidate_count_not_final_death_fact') {
        throw new Error('manifest eventCountMeaning must preserve the Task 170 consumption contract');
    }
    if (!Array.isArray(manifest.allowedReplays) || manifest.allowedReplays.length === 0) {
        throw new Error('manifest requires non-empty allowedReplays');
    }
    if (!Array.isArray(manifest.blockedReplays)) throw new Error('manifest blockedReplays must be an array');
    if (!Array.isArray(manifest.forbiddenOutputSurfaces)) throw new Error('manifest forbiddenOutputSurfaces must be an array');
    for (const replayId of FORBIDDEN_REPLAY_IDS) {
        if (!manifest.blockedReplays.includes(replayId)) throw new Error(`manifest blockedReplays must include ${replayId}`);
    }
    for (const surface of FORBIDDEN_ALLOWLISTED_BATCH_OUTPUT_SURFACES) {
        if (!manifest.forbiddenOutputSurfaces.includes(surface)) throw new Error(`manifest forbiddenOutputSurfaces must include ${surface}`);
    }
    return manifest;
}

export function validateAllowlistedSummaryOutputRoot(summaryOutput) {
    const normalized = assertRelativeRepositoryPath(summaryOutput, 'summary output').replace(/\/?$/u, '/');
    if (normalized !== 'output/local-replay-processing/allowlisted-death-validation-batch-parity/') {
        throw new Error('summary output root must be exactly output/local-replay-processing/allowlisted-death-validation-batch-parity/');
    }
    return { normalized, absolutePath: path.resolve(REPO_ROOT, normalized) };
}

export function buildAllowlistedBatchPlan(manifest) {
    validateAllowlistedBatchManifestShape(manifest);
    const allowlist = manifest.allowedReplays.map(normalizeAllowedReplay);
    const requestedReplays = (Array.isArray(manifest.requestedReplays) && manifest.requestedReplays.length > 0
        ? manifest.requestedReplays
        : manifest.allowedReplays).map(normalizeAllowedReplay);
    const allowlistById = new Map();
    const allowlistKeys = new Set();
    const duplicateAllowlistIds = new Set();

    for (const replay of allowlist) {
        if (!replay.replayId || !replay.localPath) throw new Error('allowedReplays entries require replayId and localPath');
        if (allowlistById.has(replay.replayId)) duplicateAllowlistIds.add(replay.replayId);
        allowlistById.set(replay.replayId, replay);
        allowlistKeys.add(replayKey(replay));
    }

    if (duplicateAllowlistIds.size > 0) {
        throw new Error(`manifest allowedReplays contains duplicate replay ids: ${[...duplicateAllowlistIds].join(', ')}`);
    }

    const readyInputs = [];
    const perReplayStatus = [];
    const blockedReplayAudit = [];
    const seenRequestedKeys = new Set();

    for (const replay of requestedReplays) {
        const reasons = forbiddenReplayReasons(replay);
        const normalizedPath = replay.localPath ? slash(replay.localPath) : null;
        const key = replayKey(replay);
        const allowlisted = allowlistKeys.has(key);
        const allowlistedById = replay.replayId ? allowlistById.get(replay.replayId) : null;

        if (!allowlisted) reasons.push('not_in_manifest_allowlist');
        if (allowlistedById && normalizedPath !== slash(allowlistedById.localPath)) reasons.push('manifest_replay_path_mismatch');
        if (seenRequestedKeys.has(key)) reasons.push('duplicate_requested_replay');
        if (replay.requestedMode !== SUPPORTED_MODE) reasons.push('requested_mode_not_supported');
        seenRequestedKeys.add(key);

        if (reasons.length > 0) {
            const status = compactBlockedStatus(replay, [...new Set(reasons)]);
            perReplayStatus.push(status);
            blockedReplayAudit.push({
                replayId: status.replayId,
                localPath: status.localPath,
                reasons: status.reasons,
                blockedBeforeFilesystemAccess: true
            });
            continue;
        }

        const safePath = assertRelativeRepositoryPath(normalizedPath, replay.replayId);
        const input = {
            replayId: replay.replayId,
            normalized: safePath,
            absolutePath: path.resolve(REPO_ROOT, safePath),
            inputLabel: path.basename(safePath),
            selectionGroup: replay.selectionGroup ?? allowlistedById?.selectionGroup ?? null
        };
        readyInputs.push(input);
        perReplayStatus.push({
            schemaVersion: 1,
            replayId: replay.replayId,
            localPath: safePath,
            requestedMode: replay.requestedMode,
            selectionGroup: input.selectionGroup,
            status: 'planned',
            reasons: ['manifest_allowlist_passed_before_filesystem_access'],
            blockedBeforeFilesystemAccess: false,
            filesystemAccessAttempted: false,
            statAttempted: false,
            hashAttempted: false,
            openReadStreamAttempted: false,
            copyAttempted: false,
            parseAttempted: false,
            artifactClassEmitted: null,
            rawDataCaptured: false,
            finalFactsProduced: false,
            gameplayInterpretationProduced: false
        });
    }

    return {
        schemaVersion: 1,
        manifestId: manifest.manifestId,
        mode: manifest.mode,
        artifactClass: manifest.artifactClass,
        readyInputs,
        perReplayStatus,
        blockedReplayAudit,
        blockedBeforeFilesystemAccess: blockedReplayAudit.length > 0,
        authorizedReplayCount: readyInputs.length,
        requestedReplayCount: requestedReplays.length,
        expectedReplayCount: allowlist.length
    };
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

function internalControllerKey(controller, ordinal) {
    const fieldCandidates = [
        normalize(controller?.getField?.('m_steamID')),
        normalize(controller?.getField?.('m_iAccountID')),
        normalize(controller?.getField?.('m_unAccountID')),
        normalize(controller?.getField?.('m_iPlayerSlot')),
        normalize(controller?.getField?.('m_iPlayerID')),
        normalize(controller?.handle)
    ];
    const candidate = fieldCandidates.find(value => value !== null && value !== undefined && value !== '0' && value !== 0);
    return String(candidate ?? `ordinal:${ordinal}`);
}

function observeDeathCounters(player) {
    const controllers = player.getDemo().getEntitiesByClassName(CONTROLLER_CLASS);
    return controllers
        .map((controller, ordinal) => ({
            key: internalControllerKey(controller, ordinal),
            deaths: safeNumber(normalize(controller?.getField?.('m_iDeaths')))
        }))
        .filter(row => row.deaths !== null);
}

async function runDeathValidationEmission(input) {
    const player = new Player(undefined, Logger.NOOP);
    const started = performance.now();
    const previousByController = new Map();
    const transitionKeys = [];
    const warnings = [];
    const summary = {
        schemaVersion: 1,
        replayId: input.replayId,
        inputLabel: input.inputLabel,
        parserLoadSucceeded: false,
        parseCompleted: false,
        reachedEnd: false,
        sourceMethod: 'counter_transition_summary',
        samplingPolicy: 'one_second_source_sampling',
        samplesAttempted: 0,
        samplesWithControllers: 0,
        eventCount: 0,
        duplicateKeyCount: 0,
        validationStatus: 'not_evaluated',
        firstErrorMessage: null,
        firstErrorClass: null,
        rawDataCaptured: false,
        finalFactsProduced: false
    };

    try {
        await player.load(createReadStream(input.absolutePath));
        summary.parserLoadSucceeded = true;
        const firstTick = safeNumber(player.getFirstTick()) ?? safeNumber(player.getCurrentTick()) ?? 0;
        const tickRate = safeNumber(player.getDemo().server?.tickRate) ?? 30;
        const lastTick = safeNumber(player.getLastTick());
        let nextSampleTick = firstTick;
        let previousTick = safeNumber(player.getCurrentTick());

        while (true) {
            const currentTick = safeNumber(player.getCurrentTick());
            if (currentTick !== null && currentTick >= nextSampleTick) {
                summary.samplesAttempted += 1;
                const observations = observeDeathCounters(player);
                if (observations.length > 0) summary.samplesWithControllers += 1;
                for (const row of observations) {
                    const previous = previousByController.get(row.key);
                    if (previous !== undefined && row.deaths > previous) {
                        transitionKeys.push(`${summary.samplesAttempted}:${row.key}`);
                    }
                    previousByController.set(row.key, row.deaths);
                }
                nextSampleTick = currentTick + Math.max(1, Math.round(tickRate));
            }

            const advanced = await player.nextTick();
            const afterTick = safeNumber(player.getCurrentTick());
            if (previousTick !== null && afterTick !== null) {
                summary.ticksAdvanced = (summary.ticksAdvanced ?? 0) + Math.max(0, afterTick - previousTick);
            }
            previousTick = afterTick;
            if (!advanced) {
                summary.parseCompleted = true;
                summary.reachedEnd = true;
                break;
            }
            if (lastTick !== null && afterTick !== null && afterTick > lastTick + tickRate) {
                warnings.push('parser advanced beyond reported last tick before nextTick returned false');
            }
        }

        summary.eventCount = transitionKeys.length;
        summary.duplicateKeyCount = countDuplicateKeys(transitionKeys);
        if (summary.samplesWithControllers === 0) {
            summary.validationStatus = 'source_validation_blocked';
            warnings.push('no controller death counters were observed during one-second sampling');
        } else if (summary.eventCount > 0) {
            summary.validationStatus = 'source_events_available_with_limitations';
        } else {
            summary.validationStatus = 'no_counter_increments_observed';
        }
    } catch (error) {
        summary.firstErrorMessage = error?.message ?? String(error);
        summary.firstErrorClass = error?.constructor?.name ?? null;
        summary.validationStatus = 'source_validation_blocked';
        warnings.push('parser or source sampling failed before compact artifact emission completed');
    } finally {
        summary.durationMs = Math.round(performance.now() - started);
        await player.dispose?.().catch(() => {});
    }

    const artifact = {
        ...createDeathValidationArtifact({
            replayId: input.replayId,
            eventCount: summary.eventCount,
            duplicateKeyCount: summary.duplicateKeyCount,
            validationStatus: summary.validationStatus,
            warnings
        }),
        generatedBy: 'tools/emit-allowlisted-death-validation-batch-artifacts.mjs',
        generatedAt: 'task_171'
    };

    return { summary, artifact };
}

function summarizeEmittedReplay(input, emission, artifactPath, schemaErrors, sizeBytes) {
    return {
        schemaVersion: 1,
        replayId: input.replayId,
        status: emission.summary.parseCompleted && schemaErrors.length === 0 && sizeBytes <= MAX_ARTIFACT_BYTES ? 'emitted' : 'blocked',
        parserLoadSucceeded: emission.summary.parserLoadSucceeded,
        parseCompleted: emission.summary.parseCompleted,
        reachedEnd: emission.summary.reachedEnd,
        artifactClassEmitted: ALLOWED_ARTIFACT_CLASS,
        artifactPath,
        eventCount: emission.artifact.eventCount,
        duplicateKeyCount: emission.artifact.duplicateKeyCount,
        validationStatus: emission.artifact.validationStatus,
        firstErrorMessage: emission.summary.firstErrorMessage,
        firstErrorClass: emission.summary.firstErrorClass,
        schemaValidationPassed: schemaErrors.length === 0,
        schemaValidationErrors: schemaErrors,
        sizeBytes,
        filesystemAccessAttempted: true,
        statAttempted: false,
        hashAttempted: false,
        openReadStreamAttempted: true,
        copyAttempted: false,
        parseAttempted: true,
        rawDataCaptured: false,
        finalFactsProduced: false,
        gameplayInterpretationProduced: false,
        eventRowsEmitted: false,
        fieldValuesEmitted: false,
        attributionEmitted: false
    };
}

function expectedByReplay(referenceStatus) {
    const rows = Array.isArray(referenceStatus?.perReplayStatus) ? referenceStatus.perReplayStatus : [];
    return new Map(rows.map(row => [row.replayId, row]));
}

export function compareParityWithReference({ emittedReplayStatus, referenceStatus }) {
    const expected = expectedByReplay(referenceStatus);
    const emitted = new Map(emittedReplayStatus.map(row => [row.replayId, row]));
    const expectedReplayIds = [...expected.keys()].sort();
    const emittedReplayIds = [...emitted.keys()].sort();
    const comparisons = [];
    const mismatches = [];

    for (const replayId of expectedReplayIds) {
        const oldRow = expected.get(replayId);
        const newRow = emitted.get(replayId);
        const comparison = {
            replayId,
            expectedEventCount: oldRow?.eventCount ?? null,
            actualEventCount: newRow?.eventCount ?? null,
            eventCountMatches: oldRow?.eventCount === newRow?.eventCount,
            expectedDuplicateKeyCount: oldRow?.duplicateKeyCount ?? null,
            actualDuplicateKeyCount: newRow?.duplicateKeyCount ?? null,
            duplicateKeyCountMatches: oldRow?.duplicateKeyCount === newRow?.duplicateKeyCount,
            expectedValidationStatus: oldRow?.validationStatus ?? null,
            actualValidationStatus: newRow?.validationStatus ?? null,
            validationStatusMatches: oldRow?.validationStatus === newRow?.validationStatus
        };
        comparison.matches = comparison.eventCountMatches
            && comparison.duplicateKeyCountMatches
            && comparison.validationStatusMatches;
        comparisons.push(comparison);
        if (!comparison.matches) mismatches.push(comparison);
    }

    const sameReplayIds = JSON.stringify(expectedReplayIds) === JSON.stringify(emittedReplayIds);
    return {
        schemaVersion: 1,
        referenceTask: '168',
        parityStatus: sameReplayIds && mismatches.length === 0 ? 'passed' : 'blocked',
        sameReplayIds,
        expectedReplayIds,
        actualReplayIds: emittedReplayIds,
        comparisons,
        mismatches,
        comparedFields: ['eventCount', 'duplicateKeyCount', 'validationStatus'],
        eventCountMeaning: 'source_observed_counter_transition_candidate_count_not_final_death_fact',
        finalFactsProduced: false,
        gameplayInterpretationProduced: false
    };
}

function blockedIdsFromManifest(manifest) {
    return manifest.blockedReplays.map(replayId => ({
        replayId,
        blockedBeforeFilesystemAccess: true,
        filesystemAccessAttempted: false,
        parseAttempted: false,
        reason: FORBIDDEN_REPLAY_IDS.has(replayId) ? 'globally_blocked_replay_id' : 'manifest_blocked_replay_id'
    }));
}

export async function runAllowlistedDeathValidationBatchEmission({ manifest, summaryOutput, referenceStatus }) {
    const summaryRoot = validateAllowlistedSummaryOutputRoot(summaryOutput);
    const plan = buildAllowlistedBatchPlan(manifest);
    const schema = JSON.parse(await readFile(SCHEMA_PATH, 'utf8'));
    const blockedByPlan = plan.blockedReplayAudit.length > 0 || plan.readyInputs.length !== plan.expectedReplayCount;
    const emittedReplayStatus = [];
    const artifacts = [];
    const artifactWrites = [];

    if (!blockedByPlan) {
        for (const input of plan.readyInputs) {
            const emission = await runDeathValidationEmission(input);
            const artifactPath = `${summaryRoot.normalized}artifacts/${input.replayId}/death_validation.json`;
            const schemaErrors = validateDeathValidationArtifact(emission.artifact, schema);
            const sizeBytes = artifactSizeBytes(emission.artifact);
            emittedReplayStatus.push(summarizeEmittedReplay(input, emission, artifactPath, schemaErrors, sizeBytes));
            artifacts.push(emission.artifact);
            artifactWrites.push({ artifactPath, artifact: emission.artifact });
        }
    }

    const perReplayStatus = [
        ...plan.perReplayStatus.filter(row => row.status === 'blocked_by_policy'),
        ...emittedReplayStatus
    ];
    const schemaValidationSummary = {
        schemaVersion: 1,
        schemaPath: 'schemas/death-validation-compact.schema.json',
        schemaValidationStatus: emittedReplayStatus.length === plan.expectedReplayCount
            && emittedReplayStatus.every(row => row.schemaValidationPassed) ? 'passed' : 'blocked',
        artifactsValidated: emittedReplayStatus.map(row => ({
            replayId: row.replayId,
            artifactPath: row.artifactPath,
            passed: row.schemaValidationPassed,
            errors: row.schemaValidationErrors
        }))
    };
    const outputPolicyAudit = {
        ...auditDeathValidationPolicy(artifacts),
        allowedArtifactClass: ALLOWED_ARTIFACT_CLASS,
        forbiddenOutputSurfaces: manifest.forbiddenOutputSurfaces,
        deathEventsEmitted: false,
        respawnEventsEmitted: false,
        timelinesEmitted: false,
        objectiveLifecycleEmitted: false,
        identityRowsEmitted: false,
        attributionEmitted: false,
        forbiddenLabelsUsed: false,
        eventCountMeaning: 'source_observed_counter_transition_candidate_count_not_final_death_fact'
    };
    const sizeAudit = {
        schemaVersion: 1,
        sizeAuditStatus: emittedReplayStatus.length === plan.expectedReplayCount
            && emittedReplayStatus.every(row => row.sizeBytes <= MAX_ARTIFACT_BYTES) ? 'passed' : 'blocked',
        maxArtifactBytes: MAX_ARTIFACT_BYTES,
        artifacts: emittedReplayStatus.map(row => ({
            replayId: row.replayId,
            artifactPath: row.artifactPath,
            sizeBytes: row.sizeBytes,
            withinLimit: row.sizeBytes <= MAX_ARTIFACT_BYTES
        }))
    };
    const parityComparisonSummary = compareParityWithReference({ emittedReplayStatus, referenceStatus });
    const allEmitted = emittedReplayStatus.length === plan.expectedReplayCount
        && emittedReplayStatus.every(row => row.status === 'emitted')
        && schemaValidationSummary.schemaValidationStatus === 'passed'
        && outputPolicyAudit.policyStatus === 'passed'
        && sizeAudit.sizeAuditStatus === 'passed'
        && parityComparisonSummary.parityStatus === 'passed';

    if (allEmitted) {
        for (const write of artifactWrites) {
            await writeJson(path.resolve(REPO_ROOT, write.artifactPath), write.artifact);
        }
    }

    const gate = {
        schemaVersion: 1,
        gate: allEmitted ? SUCCESS_GATE : (emittedReplayStatus.length > 0 ? PARTIAL_BLOCKED_GATE : BLOCKED_GATE),
        status: allEmitted ? 'ready' : 'blocked',
        mode: SUPPORTED_MODE,
        artifactClass: ALLOWED_ARTIFACT_CLASS,
        processedReplayCount: emittedReplayStatus.length,
        emittedArtifactCount: allEmitted ? emittedReplayStatus.length : 0,
        expectedArtifactCount: plan.expectedReplayCount,
        schemaValidationStatus: schemaValidationSummary.schemaValidationStatus,
        outputPolicyStatus: outputPolicyAudit.policyStatus,
        sizeAuditStatus: sizeAudit.sizeAuditStatus,
        parityStatus: parityComparisonSummary.parityStatus,
        realArtifactsWrittenOnlyAfterAllReplaysPassed: true,
        finalFactsProduced: false,
        gameplayInterpretationProduced: false
    };
    const summary = {
        schemaVersion: 1,
        manifestId: manifest.manifestId,
        mode: SUPPORTED_MODE,
        requestedReplayCount: plan.requestedReplayCount,
        processedReplayCount: emittedReplayStatus.length,
        blockedReplayCount: plan.blockedReplayAudit.length + emittedReplayStatus.filter(row => row.status !== 'emitted').length,
        emittedArtifactCount: gate.emittedArtifactCount,
        artifactClass: ALLOWED_ARTIFACT_CLASS,
        eventCountMeaning: 'source_observed_counter_transition_candidate_count_not_final_death_fact',
        rawDataCaptured: false,
        finalFactsProduced: false,
        gameplayInterpretationProduced: false
    };
    const blockedReplayAudit = {
        schemaVersion: 1,
        blockedReplaysFromManifest: blockedIdsFromManifest(manifest),
        blockedReplayAudit: plan.blockedReplayAudit,
        replay005Accessed: false,
        bots006To008Processed: false,
        replay020Accessed: false,
        blockedBeforeFilesystemAccess: true
    };
    const protectionAudit = {
        schemaVersion: 1,
        processedReplayIds: emittedReplayStatus.map(row => row.replayId),
        processedReplayCount: emittedReplayStatus.length,
        processedOnlyManifestAllowlist: emittedReplayStatus.every(row => manifest.allowedReplays.some(replay => normalizeAllowedReplay(replay).replayId === row.replayId)),
        replay005Accessed: false,
        bots006To008Processed: false,
        replay020Accessed: false,
        outputReplaysUsed: false,
        parserEngineBehaviorModified: false,
        packagesDeademModified: false,
        recoveryAdded: false,
        skipModeAdded: false,
        placeholderAdded: false,
        defaultBehaviorChanged: false,
        newParserOptInAdded: false,
        rawReplayBytesCaptured: false,
        rawPayloadsCaptured: false,
        rawEntityDataCaptured: false,
        rawSerializedEntitiesCaptured: false,
        stringValuesCaptured: false,
        fieldValuesEmitted: false,
        eventRowsEmitted: false,
        deathEventsEmitted: false,
        respawnEventsEmitted: false,
        attributionEmitted: false,
        sourceCanonicalMatchFinalFactsProduced: false,
        gameplayInterpretationProduced: false,
        javaExecuted: false,
        clarityExecuted: false,
        externalParserExecuted: false,
        wslUsed: false,
        iaflowUsed: false,
        productReviewerAutomationUsed: false,
        pullMergeCherryPickRebaseUsed: false,
        task172Created: false
    };

    await writeJson(path.join(summaryRoot.absolutePath, 'allowlisted-batch-gate.json'), gate);
    await writeJson(path.join(summaryRoot.absolutePath, 'allowlisted-batch-summary.json'), summary);
    await writeJson(path.join(summaryRoot.absolutePath, 'per-replay-emission-status.json'), {
        schemaVersion: 1,
        perReplayStatus
    });
    await writeJson(path.join(summaryRoot.absolutePath, 'schema-validation-summary.json'), schemaValidationSummary);
    await writeJson(path.join(summaryRoot.absolutePath, 'output-policy-audit.json'), outputPolicyAudit);
    await writeJson(path.join(summaryRoot.absolutePath, 'size-audit.json'), sizeAudit);
    await writeJson(path.join(summaryRoot.absolutePath, 'protection-audit.json'), protectionAudit);
    await writeJson(path.join(summaryRoot.absolutePath, 'blocked-replay-audit.json'), blockedReplayAudit);
    await writeJson(path.join(summaryRoot.absolutePath, 'parity-comparison-summary.json'), parityComparisonSummary);
    await writeMarkdown(path.resolve(REPO_ROOT, 'reports/allowlisted-death-validation-batch-parity.md'), [
        '# Allowlisted Death Validation Batch Parity',
        '',
        `Gate: \`${gate.gate}\``,
        '',
        'Task 171 emitted compact `death_validation` artifacts through a manifest-driven allowlisted runner and compared them against Task 168.',
        '',
        '## Results',
        '',
        ...emittedReplayStatus.map(row => `- ${row.replayId}: ${row.validationStatus}; eventCount=${row.eventCount}; duplicateKeyCount=${row.duplicateKeyCount}`),
        `- schema validation: ${schemaValidationSummary.schemaValidationStatus}`,
        `- output policy: ${outputPolicyAudit.policyStatus}`,
        `- size audit: ${sizeAudit.sizeAuditStatus}`,
        `- parity: ${parityComparisonSummary.parityStatus}`,
        '',
        '## Limits',
        '',
        '`eventCount` remains a compact count of source-observed counter transition candidates, not final death facts.',
        'No event rows, field values, identities, attribution, timelines, snapshots, final facts, source/canonical/match facts, or gameplay interpretation were emitted.'
    ]);

    return {
        gate,
        summary,
        perReplayStatus,
        schemaValidationSummary,
        outputPolicyAudit,
        sizeAudit,
        protectionAudit,
        blockedReplayAudit,
        parityComparisonSummary
    };
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const manifestPath = path.resolve(REPO_ROOT, assertRelativeRepositoryPath(args.get('manifest'), 'manifest'));
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    const referenceStatus = JSON.parse(await readFile(path.resolve(REPO_ROOT, REFERENCE_STATUS_PATH), 'utf8'));
    const result = await runAllowlistedDeathValidationBatchEmission({
        manifest,
        summaryOutput: args.get('summary-output'),
        referenceStatus
    });
    console.log(JSON.stringify(result.gate, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    main().catch(error => {
        console.error(error);
        process.exitCode = 1;
    });
}
