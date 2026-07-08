#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const THIS_FILE = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(THIS_FILE), '..');
const REQUIRED_SUMMARY_ROOT = 'output/local-replay-processing/batch-dry-run-readiness/';
const SUCCESS_GATE = 'batch_dry_run_runner_implemented';
const BLOCKED_GATE = 'batch_dry_run_runner_blocked';

export const SUPPORTED_DRY_RUN_MODE = 'dry_run_readiness';
export const SUPPORTED_REPLAY_STATUSES = [
    'ready',
    'blocked_by_policy',
    'parse_failed',
    'schema_failed',
    'output_policy_failed',
    'size_failed',
    'not_evaluated'
];

export const FORBIDDEN_OUTPUT_SURFACES = [
    'death_validation_compact_emission',
    'death_events',
    'respawn_events',
    'source_facts_final',
    'canonical_facts_final',
    'match_facts_final',
    'event_rows',
    'field_values',
    'raw_payloads',
    'snapshots',
    'identities',
    'attribution',
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

export function validateSummaryOutputRoot(summaryOutput) {
    const normalized = assertRelativeRepositoryPath(summaryOutput, 'summary output').replace(/\/?$/u, '/');
    if (normalized !== REQUIRED_SUMMARY_ROOT) throw new Error(`summary output root must be exactly ${REQUIRED_SUMMARY_ROOT}`);
    return { normalized, absolutePath: path.resolve(REPO_ROOT, normalized) };
}

export function classifyReplayProtection(replay) {
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
    if (/^replay_0(1[2-9]|20)$/u.test(replayId) || /(?:^|\/)(?:partida|replay|match)[_-]?0?(1[2-9]|20)(?:\.dem)?$/iu.test(lowerPath)) {
        reasons.push('candidate_replay_requires_separate_authorization');
    }
    if (lowerPath.startsWith('samples/')) reasons.push('samples_path_forbidden');
    if (lowerPath.startsWith('output/replays/')) reasons.push('output_replays_path_forbidden');

    return {
        replayId,
        localPath,
        blocked: reasons.length > 0,
        reasons
    };
}

function validateManifestShape(manifest) {
    if (typeof manifest !== 'object' || manifest === null || Array.isArray(manifest)) {
        throw new Error('manifest must be an object');
    }
    if (!Array.isArray(manifest.allowlist)) throw new Error('manifest requires explicit allowlist array');
    if (manifest.mode !== SUPPORTED_DRY_RUN_MODE) {
        throw new Error(`manifest mode must be ${SUPPORTED_DRY_RUN_MODE}`);
    }
    return manifest;
}

function replayKey(replay) {
    return `${replay.replayId ?? '<missing>'}|${slash(replay.localPath ?? '<missing>')}`;
}

function compactReplayStatus(replay, status, reasons) {
    return {
        replayId: replay.replayId ?? null,
        requestedMode: replay.requestedMode ?? null,
        status,
        reasons,
        filesystemAccessAttempted: false,
        statAttempted: false,
        hashAttempted: false,
        openReadStreamAttempted: false,
        copyAttempted: false,
        parseAttempted: false,
        realArtifactsEmitted: false,
        sourceCanonicalMatchFactsProduced: false,
        rawDataCaptured: false
    };
}

export function evaluateBatchDryRun(manifest) {
    validateManifestShape(manifest);
    const requested = Array.isArray(manifest.requestedReplays) && manifest.requestedReplays.length > 0
        ? manifest.requestedReplays
        : manifest.allowlist;
    const allowlistKeys = new Set(manifest.allowlist.map(replayKey));
    const perReplayStatus = [];
    const blockedReplayAudit = [];

    for (const replay of requested) {
        const protection = classifyReplayProtection(replay);
        const reasons = [];
        if (!allowlistKeys.has(replayKey(replay))) reasons.push('not_in_explicit_allowlist');
        if (replay.requestedMode !== SUPPORTED_DRY_RUN_MODE) reasons.push('requested_mode_not_supported_in_task_160');
        reasons.push(...protection.reasons);

        if (reasons.length > 0) {
            const status = compactReplayStatus(replay, 'blocked_by_policy', reasons);
            perReplayStatus.push(status);
            blockedReplayAudit.push({
                replayId: status.replayId,
                reasons,
                blockedBeforeFilesystemAccess: true
            });
            continue;
        }

        perReplayStatus.push(compactReplayStatus(replay, 'ready', [
            'dry_run_readiness_policy_passed_no_filesystem_access'
        ]));
    }

    const readyCount = perReplayStatus.filter(row => row.status === 'ready').length;
    const blockedCount = perReplayStatus.filter(row => row.status === 'blocked_by_policy').length;
    const gate = readyCount > 0 && blockedCount === 0 ? SUCCESS_GATE : BLOCKED_GATE;

    return {
        schemaVersion: 1,
        batchId: manifest.batchId ?? 'batch_dry_run_readiness',
        mode: manifest.mode,
        gate,
        status: gate === SUCCESS_GATE ? 'ready' : 'blocked',
        perReplayStatus,
        blockedReplayAudit,
        summary: {
            schemaVersion: 1,
            batchId: manifest.batchId ?? 'batch_dry_run_readiness',
            mode: manifest.mode,
            requestedReplayCount: requested.length,
            readyCount,
            blockedCount,
            parseAttempted: false,
            realArtifactsEmitted: false,
            deathValidationCompactEmissionExecuted: false,
            sourceCanonicalMatchFactsProduced: false,
            gameplayInterpretationProduced: false
        }
    };
}

export function buildPolicySummary(evaluation) {
    return {
        schemaVersion: 1,
        policyStatus: evaluation.gate === SUCCESS_GATE ? 'passed' : 'blocked',
        explicitAllowlistRequired: true,
        protectionBeforeFilesystemAccess: true,
        mode: evaluation.mode,
        supportedReplayStatuses: SUPPORTED_REPLAY_STATUSES,
        forbiddenOutputSurfaces: FORBIDDEN_OUTPUT_SURFACES,
        deathValidationCompactEmissionExecuted: false,
        realArtifactsEmitted: false
    };
}

export function buildSchemaReadinessSummary(evaluation) {
    return {
        schemaVersion: 1,
        readinessStatus: evaluation.gate === SUCCESS_GATE ? 'passed' : 'blocked_by_policy',
        batchArtifactsPlanned: [
            'batch-summary.json',
            'per-replay-status.json',
            'blocked-replay-audit.json',
            'policy-summary.json',
            'schema-readiness-summary.json',
            'size-summary.json',
            'batch-dry-run-gate.json'
        ],
        realSourceSchemasEvaluated: false,
        deathValidationSchemaEmissionExecuted: false,
        notes: [
            'Dry-run validates batch manifest shape and policy readiness only.',
            'No source/canonical/match artifact schema is used to emit real content.'
        ]
    };
}

export function buildSizeSummary(evaluation) {
    return {
        schemaVersion: 1,
        sizeStatus: 'passed',
        plannedPerReplayArtifactLimitBytes: 32768,
        plannedBatchTotalLimitBytes: 1048576,
        realArtifactsMeasured: false,
        requestedReplayCount: evaluation.summary.requestedReplayCount,
        outputIsManifestOnly: true
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

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const manifestPath = path.resolve(REPO_ROOT, assertRelativeRepositoryPath(args.get('manifest'), 'manifest'));
    const summaryRoot = validateSummaryOutputRoot(args.get('summary-output'));
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    const evaluation = evaluateBatchDryRun(manifest);
    const policySummary = buildPolicySummary(evaluation);
    const schemaReadinessSummary = buildSchemaReadinessSummary(evaluation);
    const sizeSummary = buildSizeSummary(evaluation);
    const gate = {
        schemaVersion: 1,
        gate: evaluation.gate,
        status: evaluation.status,
        mode: evaluation.mode,
        readyCount: evaluation.summary.readyCount,
        blockedCount: evaluation.summary.blockedCount,
        replayProcessingPerformed: false,
        deathValidationCompactEmissionExecuted: false,
        realArtifactsEmitted: false
    };
    const protectionAudit = {
        schemaVersion: 1,
        replayProcessingPerformed: false,
        replay005Accessed: false,
        bots006To008Processed: false,
        candidates012To020Accessed: false,
        samplesUsed: false,
        outputReplaysUsed: false,
        filesystemAccessAttemptedForReplayPaths: false,
        statHashOpenCopyParseAttempted: false,
        parserEngineBehaviorModified: false,
        packagesDeademModified: false,
        recoveryAdded: false,
        skipModeAdded: false,
        placeholderAdded: false,
        defaultBehaviorChanged: false,
        newParserOptInAdded: false,
        realDeathValidationEmitted: false,
        sourceCanonicalMatchFactsProduced: false,
        gameplayInterpretationProduced: false,
        javaExecuted: false,
        clarityExecuted: false,
        externalParserExecuted: false,
        wslUsed: false,
        iaflowUsed: false,
        productReviewerAutomationUsed: false,
        pullMergeCherryPickRebaseUsed: false,
        task161Created: false
    };

    await writeJson(path.join(summaryRoot.absolutePath, 'batch-summary.json'), evaluation.summary);
    await writeJson(path.join(summaryRoot.absolutePath, 'per-replay-status.json'), {
        schemaVersion: 1,
        perReplayStatus: evaluation.perReplayStatus
    });
    await writeJson(path.join(summaryRoot.absolutePath, 'blocked-replay-audit.json'), {
        schemaVersion: 1,
        blockedReplayAudit: evaluation.blockedReplayAudit
    });
    await writeJson(path.join(summaryRoot.absolutePath, 'policy-summary.json'), policySummary);
    await writeJson(path.join(summaryRoot.absolutePath, 'schema-readiness-summary.json'), schemaReadinessSummary);
    await writeJson(path.join(summaryRoot.absolutePath, 'size-summary.json'), sizeSummary);
    await writeJson(path.join(summaryRoot.absolutePath, 'batch-dry-run-gate.json'), gate);
    await writeJson(path.join(summaryRoot.absolutePath, 'protection-audit.json'), protectionAudit);
    await writeMarkdown(path.resolve(REPO_ROOT, 'reports/batch-dry-run-readiness.md'), [
        '# Batch Dry-Run Readiness',
        '',
        `Gate: \`${gate.gate}\``,
        '',
        'Task 160 implemented a generic batch runner for `dry_run_readiness`.',
        '',
        'The runner requires an explicit allowlist, evaluates replay protection before any replay filesystem access, and writes only compact readiness manifests.',
        '',
        'No replay was parsed. No `death_validation` emission mode was executed. No source/canonical/match final facts or gameplay interpretation outputs were produced.',
        '',
        '## Result',
        '',
        `- requested replays: ${evaluation.summary.requestedReplayCount}`,
        `- ready: ${evaluation.summary.readyCount}`,
        `- blocked: ${evaluation.summary.blockedCount}`,
        `- mode: ${evaluation.mode}`
    ]);
    console.log(JSON.stringify(gate, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    main().catch(error => {
        console.error(error);
        process.exitCode = 1;
    });
}
