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
    validateDeathValidationArtifact,
    validateReplayInput
} from './emit-death-validation-compact-artifacts.mjs';
import { classifyReplayProtection } from './dry-run-batch-replay-readiness.mjs';

const THIS_FILE = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(THIS_FILE), '..');
const SCHEMA_PATH = path.resolve(REPO_ROOT, 'schemas/death-validation-compact.schema.json');
const REQUIRED_SUMMARY_ROOT = 'output/local-replay-processing/batch-death-validation-compact-mini-pilot/';
const SUCCESS_GATE = 'batch_death_validation_compact_mini_pilot_emitted';
const BLOCKED_GATE = 'batch_death_validation_compact_mini_pilot_blocked';
const SUPPORTED_MODE = 'death_validation_compact_emission';
const ALLOWED_ARTIFACT_CLASS = 'death_validation';
const MAX_ARTIFACT_BYTES = 32 * 1024;
const CONTROLLER_CLASS = 'CCitadelPlayerController';

export const AUTHORIZED_BATCH_REPLAYS = {
    replay_010: '.local/deadem/replays/inbox/partida_010.dem',
    replay_011: '.local/deadem/replays/inbox/partida_011.dem'
};

export const FORBIDDEN_BATCH_OUTPUT_CLASSES = [
    'death_events',
    'respawn_events',
    'match_timeline',
    'match_state_timeline',
    'objective_lifecycle',
    'player_identity_rows',
    'killer_victim_assist_attribution',
    'field_values',
    'raw_replay_bytes',
    'raw_payloads',
    'raw_entityData',
    'raw_serializedEntities',
    'string_values',
    'snapshots',
    'full_entity_histories',
    'source_canonical_match_final_facts',
    'gameplay_interpretation',
    'spatial_macro_mechanics_fight_decision_ml'
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

export function validateBatchSummaryOutputRoot(summaryOutput) {
    const normalized = assertRelativeRepositoryPath(summaryOutput, 'summary output').replace(/\/?$/u, '/');
    if (normalized !== REQUIRED_SUMMARY_ROOT) throw new Error(`summary output root must be exactly ${REQUIRED_SUMMARY_ROOT}`);
    return { normalized, absolutePath: path.resolve(REPO_ROOT, normalized) };
}

function replayKey(replay) {
    return `${replay.replayId ?? '<missing>'}|${slash(replay.localPath ?? '<missing>')}`;
}

export function validateBatchManifestShape(manifest) {
    if (typeof manifest !== 'object' || manifest === null || Array.isArray(manifest)) {
        throw new Error('manifest must be an object');
    }
    if (manifest.mode !== SUPPORTED_MODE) throw new Error(`manifest mode must be ${SUPPORTED_MODE}`);
    if (manifest.authorization !== 'Task 162 controlled batch death_validation compact mini-pilot only') {
        throw new Error('manifest authorization must be Task 162 controlled batch death_validation compact mini-pilot only');
    }
    if (manifest.realArtifactsAuthorized !== true) throw new Error('manifest must explicitly authorize real compact artifacts');
    if (manifest.allowedArtifactClass !== ALLOWED_ARTIFACT_CLASS) throw new Error('manifest allowedArtifactClass must be death_validation');
    if (manifest.rawDataCaptured !== false) throw new Error('manifest rawDataCaptured must be false');
    if (manifest.finalFactsProduced !== false) throw new Error('manifest finalFactsProduced must be false');
    if (!Array.isArray(manifest.allowlist) || manifest.allowlist.length === 0) {
        throw new Error('manifest requires explicit allowlist array');
    }
    return manifest;
}

function compactBlockedStatus(replay, reasons) {
    return {
        replayId: replay?.replayId ?? null,
        requestedMode: replay?.requestedMode ?? null,
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

export function buildBatchPlan(manifest) {
    validateBatchManifestShape(manifest);
    const requestedReplays = Array.isArray(manifest.requestedReplays) && manifest.requestedReplays.length > 0
        ? manifest.requestedReplays
        : manifest.allowlist;
    const allowlistKeys = new Set(manifest.allowlist.map(replayKey));
    const blockedReplayAudit = [];
    const readyInputs = [];
    const perReplayStatus = [];

    for (const replay of requestedReplays) {
        const reasons = [];
        const protection = classifyReplayProtection(replay);
        if (!allowlistKeys.has(replayKey(replay))) reasons.push('not_in_explicit_allowlist');
        if (replay?.requestedMode !== SUPPORTED_MODE) reasons.push('requested_mode_not_supported_for_task_162');
        reasons.push(...protection.reasons);

        if (Object.hasOwn(AUTHORIZED_BATCH_REPLAYS, replay?.replayId) && AUTHORIZED_BATCH_REPLAYS[replay.replayId] !== slash(replay.localPath ?? '')) {
            reasons.push('authorized_replay_path_mismatch');
        }
        if (!Object.hasOwn(AUTHORIZED_BATCH_REPLAYS, replay?.replayId)) {
            reasons.push('replay_id_not_authorized_for_task_162');
        }

        if (reasons.length > 0) {
            const status = compactBlockedStatus(replay, reasons);
            perReplayStatus.push(status);
            blockedReplayAudit.push({
                replayId: status.replayId,
                reasons,
                blockedBeforeFilesystemAccess: true
            });
            continue;
        }

        const input = validateReplayInput(replay.replayId, replay.localPath);
        readyInputs.push(input);
        perReplayStatus.push({
            replayId: replay.replayId,
            requestedMode: replay.requestedMode,
            status: 'planned',
            reasons: ['explicit_allowlist_passed_before_filesystem_access'],
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
        batchId: manifest.batchId ?? 'batch_death_validation_compact_mini_pilot',
        mode: manifest.mode,
        readyInputs,
        perReplayStatus,
        blockedReplayAudit,
        blockedBeforeFilesystemAccess: blockedReplayAudit.length > 0,
        authorizedReplayCount: readyInputs.length,
        requestedReplayCount: requestedReplays.length
    };
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

async function writeJson(filePath, value) {
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function writeMarkdown(filePath, lines) {
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, `${lines.join('\n')}\n`, 'utf8');
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
        generatedBy: 'tools/emit-batch-death-validation-compact-artifacts.mjs',
        generatedAt: 'task_162'
    };

    return { summary, artifact };
}

function summarizeEmittedReplay(input, emission, artifactPath, schemaErrors, sizeBytes) {
    return {
        schemaVersion: 1,
        replayId: input.replayId,
        status: emission.summary.parseCompleted && schemaErrors.length === 0 ? 'emitted' : 'blocked',
        parserLoadSucceeded: emission.summary.parserLoadSucceeded,
        parseCompleted: emission.summary.parseCompleted,
        reachedEnd: emission.summary.reachedEnd,
        requestedMode: SUPPORTED_MODE,
        artifactClassEmitted: ALLOWED_ARTIFACT_CLASS,
        artifactPath,
        eventCount: emission.artifact.eventCount,
        duplicateKeyCount: emission.artifact.duplicateKeyCount,
        validationStatus: emission.artifact.validationStatus,
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

export async function runBatchDeathValidationEmission({ manifest, summaryOutput }) {
    const summaryRoot = validateBatchSummaryOutputRoot(summaryOutput);
    const plan = buildBatchPlan(manifest);
    const schema = JSON.parse(await readFile(SCHEMA_PATH, 'utf8'));
    const blockedByPlan = plan.blockedReplayAudit.length > 0 || plan.readyInputs.length !== 2;
    const emittedReplayStatus = [];
    const artifacts = [];

    if (!blockedByPlan) {
        for (const input of plan.readyInputs) {
            const emission = await runDeathValidationEmission(input);
            const artifactPath = `output/local-replay-processing/batch-death-validation-compact-mini-pilot/artifacts/${input.replayId}/death_validation.json`;
            const schemaErrors = validateDeathValidationArtifact(emission.artifact, schema);
            const sizeBytes = artifactSizeBytes(emission.artifact);
            if (schemaErrors.length === 0 && sizeBytes <= MAX_ARTIFACT_BYTES) {
                await writeJson(path.resolve(REPO_ROOT, artifactPath), emission.artifact);
            }
            emittedReplayStatus.push(summarizeEmittedReplay(input, emission, artifactPath, schemaErrors, sizeBytes));
            artifacts.push(emission.artifact);
        }
    }

    const perReplayStatus = [
        ...plan.perReplayStatus.filter(row => row.status === 'blocked_by_policy'),
        ...emittedReplayStatus
    ];
    const schemaValidationSummary = {
        schemaVersion: 1,
        schemaPath: 'schemas/death-validation-compact.schema.json',
        schemaValidationStatus: emittedReplayStatus.length === 2 && emittedReplayStatus.every(row => row.schemaValidationPassed) ? 'passed' : 'blocked',
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
        forbiddenOutputClasses: FORBIDDEN_BATCH_OUTPUT_CLASSES,
        deathEventsEmitted: false,
        respawnEventsEmitted: false,
        timelinesEmitted: false,
        objectiveLifecycleEmitted: false,
        identityRowsEmitted: false,
        attributionEmitted: false
    };
    const sizeAudit = {
        schemaVersion: 1,
        sizeAuditStatus: emittedReplayStatus.length === 2 && emittedReplayStatus.every(row => row.sizeBytes <= MAX_ARTIFACT_BYTES) ? 'passed' : 'blocked',
        maxArtifactBytes: MAX_ARTIFACT_BYTES,
        artifacts: emittedReplayStatus.map(row => ({
            replayId: row.replayId,
            artifactPath: row.artifactPath,
            sizeBytes: row.sizeBytes,
            withinLimit: row.sizeBytes <= MAX_ARTIFACT_BYTES
        }))
    };
    const allEmitted = emittedReplayStatus.length === 2
        && emittedReplayStatus.every(row => row.status === 'emitted')
        && schemaValidationSummary.schemaValidationStatus === 'passed'
        && outputPolicyAudit.policyStatus === 'passed'
        && sizeAudit.sizeAuditStatus === 'passed';
    const gate = {
        schemaVersion: 1,
        gate: allEmitted ? SUCCESS_GATE : BLOCKED_GATE,
        status: allEmitted ? 'ready' : 'blocked',
        mode: SUPPORTED_MODE,
        artifactClass: ALLOWED_ARTIFACT_CLASS,
        emittedArtifactCount: emittedReplayStatus.filter(row => row.status === 'emitted').length,
        expectedArtifactCount: 2,
        schemaValidationStatus: schemaValidationSummary.schemaValidationStatus,
        outputPolicyStatus: outputPolicyAudit.policyStatus,
        sizeAuditStatus: sizeAudit.sizeAuditStatus,
        finalFactsProduced: false,
        gameplayInterpretationProduced: false
    };
    const batchSummary = {
        schemaVersion: 1,
        batchId: plan.batchId,
        mode: SUPPORTED_MODE,
        requestedReplayCount: plan.requestedReplayCount,
        processedReplayCount: emittedReplayStatus.length,
        blockedReplayCount: plan.blockedReplayAudit.length,
        emittedArtifactCount: gate.emittedArtifactCount,
        artifactClass: ALLOWED_ARTIFACT_CLASS,
        realArtifactsAuthorized: manifest.realArtifactsAuthorized === true,
        rawDataCaptured: false,
        finalFactsProduced: false,
        gameplayInterpretationProduced: false
    };
    const protectionAudit = {
        schemaVersion: 1,
        processedReplayIds: emittedReplayStatus.map(row => row.replayId),
        processedOnlyReplay010And011: emittedReplayStatus.every(row => ['replay_010', 'replay_011'].includes(row.replayId)),
        replay005Accessed: false,
        bots006To008Processed: false,
        candidates012To020Accessed: false,
        samplesUsed: false,
        outputReplaysUsed: false,
        parserEngineBehaviorModified: false,
        packagesDeademModified: false,
        recoveryAdded: false,
        skipModeAdded: false,
        placeholderAdded: false,
        defaultBehaviorChanged: false,
        newParserOptInAdded: false,
        rawDataCaptured: false,
        fieldValuesEmitted: false,
        eventRowsEmitted: false,
        sourceCanonicalMatchFinalFactsProduced: false,
        gameplayInterpretationProduced: false,
        javaExecuted: false,
        clarityExecuted: false,
        externalParserExecuted: false,
        wslUsed: false,
        iaflowUsed: false,
        productReviewerAutomationUsed: false,
        pullMergeCherryPickRebaseUsed: false,
        task163Created: false
    };

    await writeJson(path.join(summaryRoot.absolutePath, 'batch-death-validation-gate.json'), gate);
    await writeJson(path.join(summaryRoot.absolutePath, 'batch-summary.json'), batchSummary);
    await writeJson(path.join(summaryRoot.absolutePath, 'per-replay-status.json'), {
        schemaVersion: 1,
        perReplayStatus
    });
    await writeJson(path.join(summaryRoot.absolutePath, 'blocked-replay-audit.json'), {
        schemaVersion: 1,
        blockedReplayAudit: plan.blockedReplayAudit
    });
    await writeJson(path.join(summaryRoot.absolutePath, 'schema-validation-summary.json'), schemaValidationSummary);
    await writeJson(path.join(summaryRoot.absolutePath, 'output-policy-audit.json'), outputPolicyAudit);
    await writeJson(path.join(summaryRoot.absolutePath, 'size-audit.json'), sizeAudit);
    await writeJson(path.join(summaryRoot.absolutePath, 'protection-audit.json'), protectionAudit);
    await writeMarkdown(path.resolve(REPO_ROOT, 'reports/batch-death-validation-compact-mini-pilot.md'), [
        '# Batch Death Validation Compact Mini-Pilot',
        '',
        `Gate: \`${gate.gate}\``,
        '',
        'Task 162 emitted compact schema-backed `death_validation` artifacts for replay_010 and replay_011 only.',
        '',
        '## Results',
        '',
        ...emittedReplayStatus.map(row => `- ${row.replayId}: ${row.validationStatus}; eventCount=${row.eventCount}; duplicateKeyCount=${row.duplicateKeyCount}`),
        `- schema validation: ${schemaValidationSummary.schemaValidationStatus}`,
        `- output policy: ${outputPolicyAudit.policyStatus}`,
        `- size audit: ${sizeAudit.sizeAuditStatus}`,
        '',
        '## Limits',
        '',
        '`eventCount` remains a compact count of source-observed counter transition candidates, not final death facts.',
        'No event rows, field values, identities, attribution, snapshots, final facts, or gameplay interpretation were emitted.'
    ]);

    return {
        gate,
        batchSummary,
        perReplayStatus,
        schemaValidationSummary,
        outputPolicyAudit,
        sizeAudit,
        protectionAudit
    };
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const manifestPath = path.resolve(REPO_ROOT, assertRelativeRepositoryPath(args.get('manifest'), 'manifest'));
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    const result = await runBatchDeathValidationEmission({
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
