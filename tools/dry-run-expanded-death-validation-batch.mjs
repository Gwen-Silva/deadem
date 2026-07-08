#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const THIS_FILE = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(THIS_FILE), '..');

export const DEFAULT_MANIFEST_PATH = 'output/local-replay-processing/materialized-expanded-death-validation-dry-run-authorization/materialized-expanded-dry-run-manifest.json';
export const DEFAULT_SUMMARY_OUTPUT = 'output/local-replay-processing/expanded-death-validation-dry-run/';
export const SUCCESS_GATE = 'expanded_death_validation_dry_run_ready';
export const BLOCKED_GATE = 'expanded_death_validation_dry_run_blocked';
export const SUPPORTED_MODE = 'death_validation_compact_emission';
export const SUPPORTED_ALLOWED_ARTIFACT_CLASS = 'death_validation';
export const ELIGIBLE_DRY_RUN_STATUS = 'dry_run_ready';
export const BLOCKED_REPLAY_STATUS = 'blocked_by_policy';
export const EXPECTED_ELIGIBLE_REPLAYS = [
    'replay_001',
    'replay_002',
    'replay_003',
    'replay_004',
    'replay_009',
    'replay_010',
    'replay_011',
    'replay_012',
    'replay_013',
    'replay_014',
    'replay_015',
    'replay_016',
    'replay_017',
    'replay_018',
    'replay_019',
    'replay_020'
];
export const EXPECTED_BLOCKED_REPLAYS = ['replay_005', 'replay_006', 'replay_007', 'replay_008'];

const OUTPUT_FILES = {
    gate: 'expanded-dry-run-gate.json',
    summary: 'expanded-dry-run-summary.json',
    perReplay: 'per-replay-dry-run-status.json',
    blocked: 'blocked-replay-audit.json',
    policy: 'policy-readiness-summary.json',
    schema: 'schema-readiness-summary.json',
    size: 'size-readiness-summary.json',
    fifteen: 'fifteen-replay-selection-note.json',
    protection: 'protection-audit.json'
};

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

export function validateSummaryOutputRoot(summaryOutput) {
    const normalized = assertRelativeRepositoryPath(summaryOutput, 'summary output').replace(/\/?$/u, '/');
    if (normalized !== DEFAULT_SUMMARY_OUTPUT) {
        throw new Error(`summary output root must be exactly ${DEFAULT_SUMMARY_OUTPUT}`);
    }
    return {
        normalized,
        absolutePath: path.resolve(REPO_ROOT, normalized)
    };
}

export function validateManifestPath(manifestPath) {
    const normalized = assertRelativeRepositoryPath(manifestPath, 'manifest');
    if (normalized !== DEFAULT_MANIFEST_PATH) {
        throw new Error(`manifest path must be exactly ${DEFAULT_MANIFEST_PATH}`);
    }
    return path.resolve(REPO_ROOT, normalized);
}

function sortedReplayIds(rows) {
    return rows.map(row => row.replayId).sort();
}

function arraysEqual(left, right) {
    return left.length === right.length && left.every((value, index) => value === right[index]);
}

function validateExpandedManifest(manifest) {
    if (typeof manifest !== 'object' || manifest === null || Array.isArray(manifest)) {
        throw new Error('manifest must be an object');
    }
    if (manifest.mode !== SUPPORTED_MODE) throw new Error(`manifest mode must be ${SUPPORTED_MODE}`);
    if (manifest.allowedArtifactClass !== SUPPORTED_ALLOWED_ARTIFACT_CLASS) {
        throw new Error(`allowed artifact class must be ${SUPPORTED_ALLOWED_ARTIFACT_CLASS}`);
    }
    if (manifest.expandedDryRunAuthorized !== true) throw new Error('expanded dry-run authorization is required');
    if (manifest.realEmissionAuthorizedForExpansion !== false) {
        throw new Error('real emission must remain unauthorized for expanded dry-run');
    }
    if (manifest.rawDataCaptured !== false || manifest.finalFactsProduced !== false) {
        throw new Error('manifest must preserve rawDataCaptured=false and finalFactsProduced=false');
    }
    if (!Array.isArray(manifest.authorizedForFutureExpandedDryRun)) {
        throw new Error('manifest requires authorizedForFutureExpandedDryRun array');
    }
    if (!Array.isArray(manifest.blockedReplays)) throw new Error('manifest requires blockedReplays array');

    const eligibleIds = sortedReplayIds(manifest.authorizedForFutureExpandedDryRun);
    const blockedIds = sortedReplayIds(manifest.blockedReplays);
    if (!arraysEqual(eligibleIds, [...EXPECTED_ELIGIBLE_REPLAYS].sort())) {
        throw new Error('eligible replay set does not match Task 165 materialized authorization');
    }
    if (!arraysEqual(blockedIds, [...EXPECTED_BLOCKED_REPLAYS].sort())) {
        throw new Error('blocked replay set does not preserve Task 165 blocked policy');
    }
    return manifest;
}

function buildEligibleStatus(row) {
    return {
        replayId: row.replayId,
        localPath: row.localPath,
        authorizationStatus: row.authorizationStatus,
        dryRunStatus: ELIGIBLE_DRY_RUN_STATUS,
        reason: 'authorized_entry_evaluated_without_replay_filesystem_access',
        replayProcessingPerformed: false,
        filesystemAccessPerformed: false,
        openAttempted: false,
        hashAttempted: false,
        copyAttempted: false,
        inspectAttempted: false,
        parseAttempted: false,
        realEmissionAuthorizedForExpansion: false,
        newRealArtifactsEmitted: false,
        finalFactsProduced: false,
        gameplayInterpretationProduced: false,
        rawDataCaptured: false
    };
}

function buildBlockedStatus(row) {
    return {
        replayId: row.replayId,
        localPath: row.localPath,
        dryRunStatus: BLOCKED_REPLAY_STATUS,
        reason: row.reason,
        blockedBeforeFilesystemAccess: true,
        replayProcessingPerformed: false,
        filesystemAccessPerformed: false,
        openAttempted: false,
        hashAttempted: false,
        copyAttempted: false,
        inspectAttempted: false,
        parseAttempted: false
    };
}

export function evaluateExpandedDeathValidationDryRun(manifestInput) {
    const manifest = validateExpandedManifest(manifestInput);
    const perReplayStatus = manifest.authorizedForFutureExpandedDryRun.map(buildEligibleStatus);
    const blockedReplayAudit = manifest.blockedReplays.map(buildBlockedStatus);
    const readyCount = perReplayStatus.filter(row => row.dryRunStatus === ELIGIBLE_DRY_RUN_STATUS).length;
    const blockedCount = blockedReplayAudit.length;
    const allReady = readyCount === EXPECTED_ELIGIBLE_REPLAYS.length
        && blockedCount === EXPECTED_BLOCKED_REPLAYS.length
        && perReplayStatus.every(row => row.filesystemAccessPerformed === false && row.parseAttempted === false);
    const gate = allReady ? SUCCESS_GATE : BLOCKED_GATE;
    const status = allReady ? 'ready' : 'blocked';
    const recommendedNextAction = allReady
        ? 'decide_exact_15_replay_selection_or_authorize_16_replay_real_emission'
        : 'fix_expanded_dry_run_policy_before_real_emission';

    const summary = {
        schemaVersion: 1,
        gate,
        status,
        mode: manifest.mode,
        allowedArtifactClass: manifest.allowedArtifactClass,
        eligibleDryRunReplayCount: readyCount,
        blockedReplayCount: blockedCount,
        eligibleReplayIds: perReplayStatus.map(row => row.replayId),
        blockedReplayIds: blockedReplayAudit.map(row => row.replayId),
        replayProcessingPerformed: false,
        filesystemAccessPerformed: false,
        parseAttempted: false,
        realEmissionAuthorizedForExpansion: false,
        newRealArtifactsEmitted: false,
        finalFactsProduced: false,
        gameplayInterpretationProduced: false,
        automaticFifteenReplaySelectionPerformed: false,
        recommendedNextAction
    };

    return {
        schemaVersion: 1,
        gate,
        status,
        recommendedNextAction,
        summary,
        perReplayStatus,
        blockedReplayAudit
    };
}

export function buildPolicyReadinessSummary(evaluation) {
    return {
        schemaVersion: 1,
        policyReadinessStatus: evaluation.status === 'ready' ? 'passed' : 'blocked',
        materializedAuthorizationRequired: true,
        expandedDryRunOnly: true,
        realEmissionAuthorizedForExpansion: false,
        replay005Blocked: true,
        bots006To008Blocked: true,
        candidates012To020EvaluatedAsAuthorizationEntriesOnly: true,
        samplesPathsEvaluatedAsAuthorizationStringsOnly: true,
        replayFilesystemAccessForbidden: true,
        replayFilesystemAccessPerformed: false,
        prohibitedEmissionSurfaces: [
            'death_validation_json_real_artifacts',
            'death_events',
            'respawn_events',
            'timelines',
            'objective_lifecycle',
            'player_identity_rows',
            'killer_victim_assist_attribution',
            'field_values',
            'raw_replay_bytes',
            'raw_payloads',
            'raw_entityData',
            'raw_serializedEntities',
            'snapshots',
            'full_entity_histories',
            'source_canonical_match_final_facts',
            'gameplay_interpretation'
        ]
    };
}

export function buildSchemaReadinessSummary(evaluation) {
    return {
        schemaVersion: 1,
        schemaReadinessStatus: evaluation.status === 'ready' ? 'passed' : 'blocked',
        manifestShapeValidated: true,
        eligibleReplayStatusShapeValidated: true,
        blockedReplayAuditShapeValidated: true,
        realDeathValidationSchemaEmissionExecuted: false,
        finalArtifactSchemaValidationExecuted: false,
        outputIsReadinessManifestOnly: true
    };
}

export function buildSizeReadinessSummary(evaluation) {
    return {
        schemaVersion: 1,
        sizeReadinessStatus: 'passed',
        outputIsCompactReadinessOnly: true,
        eligibleDryRunReplayCount: evaluation.summary.eligibleDryRunReplayCount,
        blockedReplayCount: evaluation.summary.blockedReplayCount,
        realArtifactsMeasured: false,
        finalArtifactRowsMeasured: false,
        plannedReadinessOutputLimitBytes: 1048576
    };
}

export function buildFifteenReplaySelectionNote(evaluation) {
    return {
        schemaVersion: 1,
        eligibleReplayCount: evaluation.summary.eligibleDryRunReplayCount,
        operationalFifteenReplayTargetStillRequiresSelection: true,
        selectionMadeInTask166: false,
        automaticExclusionPerformed: false,
        automaticExclusionForbidden: true,
        note: 'Task 166 evaluates all 16 materialized eligible replay authorization entries. If the operational target remains exactly 15 replays, a future task must explicitly choose which eligible replay is excluded.',
        nextDecisionNeeded: 'select_exclusion_if_exactly_15_replays_required'
    };
}

export function buildProtectionAudit() {
    return {
        schemaVersion: 1,
        replayProcessingPerformed: false,
        replayFilesystemAccessPerformed: false,
        replayFilesOpened: false,
        replayFilesHashed: false,
        replayFilesCopied: false,
        replayFilesInspected: false,
        replayFilesParsed: false,
        replay005Accessed: false,
        bots006To008Processed: false,
        candidates012To020Accessed: false,
        candidates012To020EvaluatedAsDryRunAuthorizationEntriesOnly: true,
        samplesUsed: false,
        samplesPathsEvaluatedAsAuthorizationStringsOnly: true,
        outputReplaysUsed: false,
        emitBatchDeathValidationCompactExecuted: false,
        emitDeathValidationCompactExecuted: false,
        deathValidationCompactEmissionExecuted: false,
        newDeathValidationArtifactsEmitted: false,
        deathEventsEmitted: false,
        respawnEventsEmitted: false,
        timelinesEmitted: false,
        objectiveLifecycleEmitted: false,
        playerIdentityRowsEmitted: false,
        attributionEmitted: false,
        fieldValuesEmitted: false,
        rawDataCaptured: false,
        snapshotsEmitted: false,
        fullEntityHistoriesEmitted: false,
        sourceCanonicalMatchFinalFactsProduced: false,
        gameplayInterpretationProduced: false,
        parserEngineBehaviorModified: false,
        packagesDeademModified: false,
        recoveryAdded: false,
        skipModeAdded: false,
        placeholderAdded: false,
        defaultBehaviorChanged: false,
        newParserOptInAdded: false,
        javaExecuted: false,
        clarityExecuted: false,
        externalParserExecuted: false,
        wslUsed: false,
        iaflowUsed: false,
        productReviewerAutomationUsed: false,
        pullMergeCherryPickRebaseUsed: false,
        task167Created: false
    };
}

export function buildGate(evaluation) {
    return {
        schemaVersion: 1,
        gate: evaluation.gate,
        status: evaluation.status,
        taskId: '166',
        eligibleDryRunReplayCount: evaluation.summary.eligibleDryRunReplayCount,
        blockedReplayCount: evaluation.summary.blockedReplayCount,
        replayProcessingPerformed: false,
        filesystemAccessPerformed: false,
        parseAttempted: false,
        realEmissionAuthorizedForExpansion: false,
        newRealArtifactsEmitted: false,
        finalFactsProduced: false,
        gameplayInterpretationProduced: false,
        recommendedNextAction: evaluation.recommendedNextAction
    };
}

function parseArgs(argv) {
    const args = new Map();
    for (let index = 0; index < argv.length; index += 1) {
        const key = argv[index];
        if (!key.startsWith('--')) throw new Error(`Invalid argument ${key}`);
        const value = argv[index + 1];
        if (value === undefined || value.startsWith('--')) throw new Error(`Missing value for ${key}`);
        args.set(key.slice(2), value);
        index += 1;
    }
    return {
        manifest: args.get('manifest') ?? DEFAULT_MANIFEST_PATH,
        summaryOutput: args.get('summary-output') ?? DEFAULT_SUMMARY_OUTPUT
    };
}

async function writeJson(filePath, value) {
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export async function writeExpandedDryRunOutputs({ manifestPath = DEFAULT_MANIFEST_PATH, summaryOutput = DEFAULT_SUMMARY_OUTPUT } = {}) {
    const manifestAbsolutePath = validateManifestPath(manifestPath);
    const outputRoot = validateSummaryOutputRoot(summaryOutput);
    const manifest = JSON.parse(await readFile(manifestAbsolutePath, 'utf8'));
    const evaluation = evaluateExpandedDeathValidationDryRun(manifest);
    const outputs = {
        [OUTPUT_FILES.gate]: buildGate(evaluation),
        [OUTPUT_FILES.summary]: evaluation.summary,
        [OUTPUT_FILES.perReplay]: {
            schemaVersion: 1,
            perReplayDryRunStatus: evaluation.perReplayStatus
        },
        [OUTPUT_FILES.blocked]: {
            schemaVersion: 1,
            blockedReplayAudit: evaluation.blockedReplayAudit
        },
        [OUTPUT_FILES.policy]: buildPolicyReadinessSummary(evaluation),
        [OUTPUT_FILES.schema]: buildSchemaReadinessSummary(evaluation),
        [OUTPUT_FILES.size]: buildSizeReadinessSummary(evaluation),
        [OUTPUT_FILES.fifteen]: buildFifteenReplaySelectionNote(evaluation),
        [OUTPUT_FILES.protection]: buildProtectionAudit()
    };

    for (const [fileName, value] of Object.entries(outputs)) {
        await writeJson(path.join(outputRoot.absolutePath, fileName), value);
    }

    return {
        outputRoot: outputRoot.normalized,
        evaluation,
        outputs
    };
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const result = await writeExpandedDryRunOutputs(args);
    console.log(JSON.stringify(buildGate(result.evaluation), null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    main().catch(error => {
        console.error(error);
        process.exitCode = 1;
    });
}
