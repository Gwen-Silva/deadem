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
const SELECTION_PATH = 'output/local-replay-processing/exact-15-death-validation-selection/selected-replay-set.json';
const SUMMARY_ROOT = 'output/local-replay-processing/exact-15-death-validation-compact-emission/';
const SCHEMA_PATH = path.resolve(REPO_ROOT, 'schemas/death-validation-compact.schema.json');
const SUCCESS_GATE = 'exact_15_death_validation_compact_emitted';
const BLOCKED_GATE = 'exact_15_death_validation_compact_blocked';
const PARTIAL_BLOCKED_GATE = 'exact_15_death_validation_compact_partial_blocked';
const MODE = 'death_validation_compact_emission';
const ARTIFACT_CLASS = 'death_validation';
const MAX_ARTIFACT_BYTES = 32 * 1024;
const CONTROLLER_CLASS = 'CCitadelPlayerController';

export const EXACT_15_AUTHORIZED_REPLAYS = {
    replay_001: 'samples/partida_001.dem',
    replay_002: 'samples/partida_002.dem',
    replay_003: 'samples/partida_003.dem',
    replay_004: 'samples/partida_004.dem',
    replay_009: 'samples/replay_009_normal.dem',
    replay_010: '.local/deadem/replays/inbox/partida_010.dem',
    replay_011: '.local/deadem/replays/inbox/partida_011.dem',
    replay_012: '.local/deadem/replays/inbox/partida_012.dem',
    replay_013: '.local/deadem/replays/inbox/partida_013.dem',
    replay_014: '.local/deadem/replays/inbox/partida_014.dem',
    replay_015: '.local/deadem/replays/inbox/partida_015.dem',
    replay_016: '.local/deadem/replays/inbox/partida_016.dem',
    replay_017: '.local/deadem/replays/inbox/partida_017.dem',
    replay_018: '.local/deadem/replays/inbox/partida_018.dem',
    replay_019: '.local/deadem/replays/inbox/partida_019.dem'
};

export const FORBIDDEN_EXACT_15_OUTPUT_CLASSES = [
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

function parseArgs(argv) {
    const args = new Map();
    for (let index = 0; index < argv.length; index += 2) {
        const key = argv[index];
        const value = argv[index + 1];
        if (!key?.startsWith('--') || value === undefined) throw new Error(`Invalid argument near ${key ?? '<end>'}`);
        args.set(key.slice(2), value);
    }
    for (const required of ['selection', 'summary-output']) {
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

function validateFixedPath(value, expected, label) {
    const normalized = assertRelativeRepositoryPath(value, label).replace(/\/?$/u, expected.endsWith('/') ? '/' : '');
    if (normalized !== expected) throw new Error(`${label} must be exactly ${expected}`);
    return { normalized, absolutePath: path.resolve(REPO_ROOT, normalized) };
}

function compactBlockedStatus(replay, reasons) {
    return {
        replayId: replay?.replayId ?? null,
        localPath: replay?.localPath ?? null,
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

    if (replayId === 'replay_005' || /(?:^|\/)(?:partida|replay|match)[_-]?00?5(?:\.dem)?$/iu.test(lowerPath)) {
        reasons.push('protected_replay_005_final_holdout');
    }
    if (/^replay_00[6-8]$/u.test(replayId) || /(?:^|\/)(?:partida|replay|match)[_-]?00?[6-8](?:\.dem)?$/iu.test(lowerPath)) {
        reasons.push('unsupported_bot_fixture_006_008');
    }
    if (replayId === 'replay_020' || /(?:^|\/)(?:partida|replay|match)[_-]?0?20(?:\.dem)?$/iu.test(lowerPath)) {
        reasons.push('replay_020_not_authorized_for_exact_15');
    }
    if (lowerPath.startsWith('output/replays/')) reasons.push('output_replays_path_forbidden');
    return reasons;
}

export function validateExact15Selection(selection) {
    if (typeof selection !== 'object' || selection === null || Array.isArray(selection)) {
        throw new Error('selection must be an object');
    }
    if (selection.selectionId !== 'exact_15_death_validation_selection') {
        throw new Error('selectionId must be exact_15_death_validation_selection');
    }
    if (selection.selectedReplayCount !== 15) throw new Error('selectedReplayCount must be 15');
    if (!Array.isArray(selection.selectedReplays) || selection.selectedReplays.length !== 15) {
        throw new Error('selection must contain exactly 15 selectedReplays');
    }
    return selection;
}

export function buildExact15Plan(selection) {
    validateExact15Selection(selection);
    const expectedKeys = new Set(Object.entries(EXACT_15_AUTHORIZED_REPLAYS).map(([replayId, localPath]) => `${replayId}|${localPath}`));
    const seenKeys = new Set();
    const readyInputs = [];
    const perReplayStatus = [];
    const blockedReplayAudit = [];

    for (const replay of selection.selectedReplays) {
        const normalizedPath = slash(replay?.localPath ?? '');
        const key = `${replay?.replayId ?? '<missing>'}|${normalizedPath}`;
        const reasons = forbiddenReplayReasons(replay);

        if (!expectedKeys.has(key)) reasons.push('not_in_exact_15_authorized_set');
        if (seenKeys.has(key)) reasons.push('duplicate_selected_replay');
        seenKeys.add(key);

        if (reasons.length > 0) {
            const status = compactBlockedStatus(replay, reasons);
            perReplayStatus.push(status);
            blockedReplayAudit.push({
                replayId: status.replayId,
                localPath: status.localPath,
                reasons,
                blockedBeforeFilesystemAccess: true
            });
            continue;
        }

        perReplayStatus.push({
            replayId: replay.replayId,
            localPath: normalizedPath,
            selectionGroup: replay.selectionGroup ?? null,
            status: 'planned',
            reasons: ['exact_15_allowlist_passed_before_filesystem_access'],
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
        readyInputs.push({
            replayId: replay.replayId,
            normalized: normalizedPath,
            absolutePath: path.resolve(REPO_ROOT, normalizedPath),
            inputLabel: path.basename(normalizedPath),
            selectionGroup: replay.selectionGroup ?? null
        });
    }

    const missingExpected = [...expectedKeys].filter(key => !seenKeys.has(key));
    for (const key of missingExpected) {
        const [replayId, localPath] = key.split('|');
        blockedReplayAudit.push({
            replayId,
            localPath,
            reasons: ['missing_from_selected_replay_set'],
            blockedBeforeFilesystemAccess: true
        });
    }

    return {
        schemaVersion: 1,
        batchId: 'exact_15_death_validation_compact_emission',
        mode: MODE,
        readyInputs,
        perReplayStatus,
        blockedReplayAudit,
        blockedBeforeFilesystemAccess: blockedReplayAudit.length > 0,
        authorizedReplayCount: readyInputs.length,
        expectedReplayCount: 15
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
        generatedBy: 'tools/emit-exact-15-death-validation-compact-artifacts.mjs',
        generatedAt: 'task_168'
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
        artifactClassEmitted: ARTIFACT_CLASS,
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

export async function runExact15DeathValidationEmission({ selection, summaryOutput }) {
    const summaryRoot = validateFixedPath(summaryOutput, SUMMARY_ROOT, 'summary output');
    const plan = buildExact15Plan(selection);
    const schema = JSON.parse(await readFile(SCHEMA_PATH, 'utf8'));
    const blockedByPlan = plan.blockedReplayAudit.length > 0 || plan.readyInputs.length !== 15;
    const emittedReplayStatus = [];
    const artifacts = [];
    const artifactWrites = [];

    if (!blockedByPlan) {
        for (const input of plan.readyInputs) {
            const emission = await runDeathValidationEmission(input);
            const artifactPath = `${SUMMARY_ROOT}artifacts/${input.replayId}/death_validation.json`;
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
        schemaValidationStatus: emittedReplayStatus.length === 15 && emittedReplayStatus.every(row => row.schemaValidationPassed) ? 'passed' : 'blocked',
        artifactsValidated: emittedReplayStatus.map(row => ({
            replayId: row.replayId,
            artifactPath: row.artifactPath,
            passed: row.schemaValidationPassed,
            errors: row.schemaValidationErrors
        }))
    };
    const outputPolicyAudit = {
        ...auditDeathValidationPolicy(artifacts),
        allowedArtifactClass: ARTIFACT_CLASS,
        forbiddenOutputClasses: FORBIDDEN_EXACT_15_OUTPUT_CLASSES,
        deathEventsEmitted: false,
        respawnEventsEmitted: false,
        timelinesEmitted: false,
        objectiveLifecycleEmitted: false,
        identityRowsEmitted: false,
        attributionEmitted: false
    };
    const sizeAudit = {
        schemaVersion: 1,
        sizeAuditStatus: emittedReplayStatus.length === 15 && emittedReplayStatus.every(row => row.sizeBytes <= MAX_ARTIFACT_BYTES) ? 'passed' : 'blocked',
        maxArtifactBytes: MAX_ARTIFACT_BYTES,
        artifacts: emittedReplayStatus.map(row => ({
            replayId: row.replayId,
            artifactPath: row.artifactPath,
            sizeBytes: row.sizeBytes,
            withinLimit: row.sizeBytes <= MAX_ARTIFACT_BYTES
        }))
    };
    const allEmitted = emittedReplayStatus.length === 15
        && emittedReplayStatus.every(row => row.status === 'emitted')
        && schemaValidationSummary.schemaValidationStatus === 'passed'
        && outputPolicyAudit.policyStatus === 'passed'
        && sizeAudit.sizeAuditStatus === 'passed';

    if (allEmitted) {
        for (const write of artifactWrites) {
            await writeJson(path.resolve(REPO_ROOT, write.artifactPath), write.artifact);
        }
    }

    const gate = {
        schemaVersion: 1,
        gate: allEmitted ? SUCCESS_GATE : (emittedReplayStatus.length > 0 ? PARTIAL_BLOCKED_GATE : BLOCKED_GATE),
        status: allEmitted ? 'ready' : 'blocked',
        mode: MODE,
        artifactClass: ARTIFACT_CLASS,
        processedReplayCount: emittedReplayStatus.length,
        emittedArtifactCount: allEmitted ? emittedReplayStatus.length : 0,
        expectedArtifactCount: 15,
        schemaValidationStatus: schemaValidationSummary.schemaValidationStatus,
        outputPolicyStatus: outputPolicyAudit.policyStatus,
        sizeAuditStatus: sizeAudit.sizeAuditStatus,
        realArtifactsWrittenOnlyAfterAllReplaysPassed: true,
        finalFactsProduced: false,
        gameplayInterpretationProduced: false
    };
    const emissionSummary = {
        schemaVersion: 1,
        batchId: plan.batchId,
        mode: MODE,
        selectedReplayCount: selection.selectedReplayCount,
        processedReplayCount: emittedReplayStatus.length,
        blockedReplayCount: plan.blockedReplayAudit.length + emittedReplayStatus.filter(row => row.status !== 'emitted').length,
        emittedArtifactCount: gate.emittedArtifactCount,
        artifactClass: ARTIFACT_CLASS,
        rawDataCaptured: false,
        finalFactsProduced: false,
        gameplayInterpretationProduced: false
    };
    const protectionAudit = {
        schemaVersion: 1,
        processedReplayIds: emittedReplayStatus.map(row => row.replayId),
        processedOnlyExact15: emittedReplayStatus.every(row => Object.hasOwn(EXACT_15_AUTHORIZED_REPLAYS, row.replayId)),
        replay005Accessed: false,
        bots006To008Processed: false,
        replay020Accessed: false,
        candidates012To019Accessed: emittedReplayStatus.some(row => /^replay_01[2-9]$/u.test(row.replayId)),
        candidates012To019AuthorizedByTask168: true,
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
        sourceCanonicalMatchFinalFactsProduced: false,
        gameplayInterpretationProduced: false,
        javaExecuted: false,
        clarityExecuted: false,
        externalParserExecuted: false,
        wslUsed: false,
        iaflowUsed: false,
        productReviewerAutomationUsed: false,
        pullMergeCherryPickRebaseUsed: false,
        task169Created: false
    };

    await writeJson(path.join(summaryRoot.absolutePath, 'exact-15-emission-gate.json'), gate);
    await writeJson(path.join(summaryRoot.absolutePath, 'exact-15-emission-summary.json'), emissionSummary);
    await writeJson(path.join(summaryRoot.absolutePath, 'per-replay-emission-status.json'), {
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
    await writeMarkdown(path.resolve(REPO_ROOT, 'reports/exact-15-death-validation-compact-emission.md'), [
        '# Exact 15 Death Validation Compact Emission',
        '',
        `Gate: \`${gate.gate}\``,
        '',
        'Task 168 emitted compact schema-backed `death_validation` artifacts only after all 15 authorized replays passed parser, schema, output-policy, and size checks.',
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
        'No event rows, field values, identities, attribution, snapshots, final facts, source/canonical/match facts, or gameplay interpretation were emitted.'
    ]);

    return {
        gate,
        emissionSummary,
        perReplayStatus,
        schemaValidationSummary,
        outputPolicyAudit,
        sizeAudit,
        protectionAudit
    };
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const selectionPath = validateFixedPath(args.get('selection'), SELECTION_PATH, 'selection').absolutePath;
    const selection = JSON.parse(await readFile(selectionPath, 'utf8'));
    const result = await runExact15DeathValidationEmission({
        selection,
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
