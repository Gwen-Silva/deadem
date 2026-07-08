import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
    FORBIDDEN_OUTPUT_SURFACES,
    SUPPORTED_DRY_RUN_MODE,
    SUPPORTED_REPLAY_STATUSES,
    SUPPORTED_SUMMARY_OUTPUT_ROOTS,
    buildPolicySummary,
    buildSchemaReadinessSummary,
    buildSizeSummary,
    classifyReplayProtection,
    evaluateBatchDryRun,
    validateSummaryOutputRoot
} from '../tools/dry-run-batch-replay-readiness.mjs';

function manifest(overrides = {}) {
    return {
        schemaVersion: 1,
        batchId: 'test_batch',
        mode: SUPPORTED_DRY_RUN_MODE,
        allowlist: [
            {
                replayId: 'replay_010',
                localPath: '.local/deadem/replays/inbox/partida_010.dem',
                requestedMode: SUPPORTED_DRY_RUN_MODE
            },
            {
                replayId: 'replay_011',
                localPath: '.local/deadem/replays/inbox/partida_011.dem',
                requestedMode: SUPPORTED_DRY_RUN_MODE
            }
        ],
        ...overrides
    };
}

test('batch dry-run requires explicit allowlist and dry-run mode', () => {
    assert.throws(() => evaluateBatchDryRun({ mode: SUPPORTED_DRY_RUN_MODE }), /explicit allowlist/u);
    assert.throws(() => evaluateBatchDryRun({ mode: 'death_validation_compact_emission', allowlist: [] }), /manifest mode must be dry_run_readiness/u);
});

test('batch dry-run marks allowlisted replay as ready without filesystem access', () => {
    const result = evaluateBatchDryRun(manifest());
    assert.equal(result.gate, 'batch_dry_run_runner_implemented');
    assert.equal(result.summary.readyCount, 2);
    assert.equal(result.summary.realArtifactsEmitted, false);
    assert.equal(result.summary.deathValidationCompactEmissionExecuted, false);
    assert.equal(result.perReplayStatus.every(row => row.status === 'ready'), true);
    assert.equal(result.perReplayStatus.every(row => row.filesystemAccessAttempted === false), true);
    assert.equal(result.perReplayStatus.every(row => row.statAttempted === false), true);
    assert.equal(result.perReplayStatus.every(row => row.parseAttempted === false), true);
});

test('mini-pilot batch dry-run uses task-specific success gate without filesystem access', () => {
    const result = evaluateBatchDryRun(manifest({ batchId: 'batch_dry_run_mini_pilot' }));
    assert.equal(result.gate, 'batch_dry_run_mini_pilot_passed');
    assert.equal(result.summary.readyCount, 2);
    assert.equal(result.summary.deathValidationCompactEmissionExecuted, false);
    assert.equal(result.perReplayStatus.every(row => row.filesystemAccessAttempted === false), true);
    assert.equal(result.perReplayStatus.every(row => row.openReadStreamAttempted === false), true);
    assert.equal(result.perReplayStatus.every(row => row.copyAttempted === false), true);
    assert.equal(result.perReplayStatus.every(row => row.parseAttempted === false), true);
});

test('replay outside allowlist is blocked by policy', () => {
    const result = evaluateBatchDryRun(manifest({
        requestedReplays: [
            {
                replayId: 'replay_010',
                localPath: '.local/deadem/replays/inbox/partida_010.dem',
                requestedMode: SUPPORTED_DRY_RUN_MODE
            },
            {
                replayId: 'replay_099',
                localPath: '.local/deadem/replays/inbox/partida_099.dem',
                requestedMode: SUPPORTED_DRY_RUN_MODE
            }
        ]
    }));
    const blocked = result.perReplayStatus.find(row => row.replayId === 'replay_099');
    assert.equal(result.gate, 'batch_dry_run_runner_blocked');
    assert.equal(blocked.status, 'blocked_by_policy');
    assert.ok(blocked.reasons.includes('not_in_explicit_allowlist'));
    assert.equal(blocked.filesystemAccessAttempted, false);
});

test('protected replay 005 is blocked before filesystem access', () => {
    const result = classifyReplayProtection({
        replayId: 'replay_005',
        localPath: '.local/deadem/replays/inbox/partida_005.dem'
    });
    assert.equal(result.blocked, true);
    assert.ok(result.reasons.includes('protected_replay_005_final_holdout'));
});

test('bot fixtures 006-008 are blocked', () => {
    for (const replayId of ['replay_006', 'replay_007', 'replay_008']) {
        const result = classifyReplayProtection({
            replayId,
            localPath: `.local/deadem/replays/inbox/partida_${replayId.slice(-3)}.dem`
        });
        assert.equal(result.blocked, true);
        assert.ok(result.reasons.includes('unsupported_bot_fixture_006_008'));
    }
});

test('candidate replays 012-020 are blocked without separate authorization', () => {
    for (const replayId of ['replay_012', 'replay_015', 'replay_020']) {
        const result = classifyReplayProtection({
            replayId,
            localPath: `.local/deadem/replays/inbox/partida_${replayId.slice(-3)}.dem`
        });
        assert.equal(result.blocked, true);
        assert.ok(result.reasons.includes('candidate_replay_requires_separate_authorization'));
    }
});

test('unsupported emission mode is blocked in requested replay status', () => {
    const result = evaluateBatchDryRun(manifest({
        allowlist: [
            {
                replayId: 'replay_010',
                localPath: '.local/deadem/replays/inbox/partida_010.dem',
                requestedMode: 'death_validation_compact_emission'
            }
        ]
    }));
    assert.equal(result.perReplayStatus[0].status, 'blocked_by_policy');
    assert.ok(result.perReplayStatus[0].reasons.includes('requested_mode_not_supported_in_task_160'));
    assert.equal(result.summary.deathValidationCompactEmissionExecuted, false);
});

test('policy, schema, and size summaries are compact dry-run only', () => {
    const evaluation = evaluateBatchDryRun(manifest());
    const policy = buildPolicySummary(evaluation);
    const schema = buildSchemaReadinessSummary(evaluation);
    const size = buildSizeSummary(evaluation);

    assert.equal(policy.realArtifactsEmitted, false);
    assert.equal(policy.deathValidationCompactEmissionExecuted, false);
    assert.equal(schema.realSourceSchemasEvaluated, false);
    assert.equal(schema.deathValidationSchemaEmissionExecuted, false);
    assert.equal(size.realArtifactsMeasured, false);
    assert.equal(size.outputIsManifestOnly, true);
});

test('status and forbidden output surfaces include required policy values', () => {
    for (const status of ['ready', 'blocked_by_policy', 'parse_failed', 'schema_failed', 'output_policy_failed', 'size_failed', 'not_evaluated']) {
        assert.ok(SUPPORTED_REPLAY_STATUSES.includes(status));
    }
    for (const surface of ['death_validation_compact_emission', 'event_rows', 'field_values', 'raw_payloads', 'snapshots', 'identities', 'attribution', 'gameplay_interpretation']) {
        assert.ok(FORBIDDEN_OUTPUT_SURFACES.includes(surface));
    }
});

test('summary output root is fixed to authorized batch dry-run output paths', () => {
    const root = validateSummaryOutputRoot('output/local-replay-processing/batch-dry-run-readiness/');
    assert.equal(root.normalized, 'output/local-replay-processing/batch-dry-run-readiness/');
    const miniPilotRoot = validateSummaryOutputRoot('output/local-replay-processing/batch-dry-run-mini-pilot/');
    assert.equal(miniPilotRoot.normalized, 'output/local-replay-processing/batch-dry-run-mini-pilot/');
    assert.ok(SUPPORTED_SUMMARY_OUTPUT_ROOTS.includes('output/local-replay-processing/batch-dry-run-readiness/'));
    assert.ok(SUPPORTED_SUMMARY_OUTPUT_ROOTS.includes('output/local-replay-processing/batch-dry-run-mini-pilot/'));
    assert.throws(
        () => validateSummaryOutputRoot('output/replays/batch-dry-run-readiness/'),
        /summary output root must be one of/u
    );
    assert.throws(
        () => validateSummaryOutputRoot('output/local-replay-processing/other-batch/'),
        /summary output root must be one of/u
    );
});

test('batch dry-run runner does not implement replay processing or update commands', async () => {
    const source = await readFile('tools/dry-run-batch-replay-readiness.mjs', 'utf8');
    assert.equal(/\b(createReadStream|stat|createHash|copyFile|Player|nextTick|seekToTick)\b/u.test(source), false);
    assert.equal(/\bgit\s+(pull|merge|cherry-pick|rebase)\b/iu.test(source), false);
    assert.equal(/deathValidationCompactEmissionExecuted:\s*true|realArtifactsEmitted:\s*true|sourceCanonicalMatchFactsProduced:\s*true/u.test(source), false);
});
