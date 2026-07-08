import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
    BLOCKED_REPLAY_STATUS,
    DEFAULT_MANIFEST_PATH,
    DEFAULT_SUMMARY_OUTPUT,
    ELIGIBLE_DRY_RUN_STATUS,
    EXPECTED_BLOCKED_REPLAYS,
    EXPECTED_ELIGIBLE_REPLAYS,
    SUCCESS_GATE,
    buildFifteenReplaySelectionNote,
    buildGate,
    buildPolicyReadinessSummary,
    buildProtectionAudit,
    buildSchemaReadinessSummary,
    buildSizeReadinessSummary,
    evaluateExpandedDeathValidationDryRun,
    validateManifestPath,
    validateSummaryOutputRoot
} from '../tools/dry-run-expanded-death-validation-batch.mjs';

function manifest(overrides = {}) {
    return {
        schemaVersion: 1,
        manifestType: 'materialized_expanded_death_validation_dry_run_authorization',
        mode: 'death_validation_compact_emission',
        allowedArtifactClass: 'death_validation',
        expandedDryRunAuthorized: true,
        realEmissionAuthorizedForExpansion: false,
        rawDataCaptured: false,
        finalFactsProduced: false,
        authorizedForFutureExpandedDryRun: EXPECTED_ELIGIBLE_REPLAYS.map(replayId => ({
            replayId,
            localPath: replayId === 'replay_001'
                ? 'samples/partida_001.dem'
                : `.local/deadem/replays/inbox/partida_${replayId.slice(-3)}.dem`,
            authorizationStatus: 'authorized_for_future_expanded_dry_run_only'
        })),
        blockedReplays: [
            { replayId: 'replay_005', localPath: 'samples/partida_005.dem', reason: 'protected final holdout' },
            { replayId: 'replay_006', localPath: 'samples/partida_006.dem', reason: 'unsupported bot fixture' },
            { replayId: 'replay_007', localPath: 'samples/replay_007_bots01.dem', reason: 'unsupported bot fixture' },
            { replayId: 'replay_008', localPath: 'samples/replay_008_bots02_short.dem', reason: 'unsupported bot fixture' }
        ],
        ...overrides
    };
}

test('expanded dry-run validates materialized manifest and marks all eligible entries ready', () => {
    const evaluation = evaluateExpandedDeathValidationDryRun(manifest());
    assert.equal(evaluation.gate, SUCCESS_GATE);
    assert.equal(evaluation.summary.eligibleDryRunReplayCount, 16);
    assert.equal(evaluation.summary.blockedReplayCount, 4);
    assert.equal(evaluation.summary.replayProcessingPerformed, false);
    assert.equal(evaluation.summary.filesystemAccessPerformed, false);
    assert.equal(evaluation.summary.parseAttempted, false);
    assert.equal(evaluation.summary.realEmissionAuthorizedForExpansion, false);
    assert.equal(evaluation.summary.newRealArtifactsEmitted, false);
    assert.equal(evaluation.summary.finalFactsProduced, false);
    assert.equal(evaluation.summary.gameplayInterpretationProduced, false);
    assert.equal(evaluation.perReplayStatus.every(row => row.dryRunStatus === ELIGIBLE_DRY_RUN_STATUS), true);
    assert.equal(evaluation.perReplayStatus.every(row => row.filesystemAccessPerformed === false), true);
    assert.equal(evaluation.perReplayStatus.every(row => row.parseAttempted === false), true);
});

test('expanded dry-run preserves blocked replay policy before filesystem access', () => {
    const evaluation = evaluateExpandedDeathValidationDryRun(manifest());
    assert.deepEqual(evaluation.blockedReplayAudit.map(row => row.replayId), EXPECTED_BLOCKED_REPLAYS);
    assert.equal(evaluation.blockedReplayAudit.every(row => row.dryRunStatus === BLOCKED_REPLAY_STATUS), true);
    assert.equal(evaluation.blockedReplayAudit.every(row => row.blockedBeforeFilesystemAccess === true), true);
    assert.equal(evaluation.blockedReplayAudit.every(row => row.filesystemAccessPerformed === false), true);
    assert.equal(evaluation.blockedReplayAudit.every(row => row.parseAttempted === false), true);
});

test('expanded dry-run rejects real emission authorization or missing replay policy', () => {
    assert.throws(
        () => evaluateExpandedDeathValidationDryRun(manifest({ realEmissionAuthorizedForExpansion: true })),
        /real emission must remain unauthorized/u
    );
    assert.throws(
        () => evaluateExpandedDeathValidationDryRun(manifest({ expandedDryRunAuthorized: false })),
        /expanded dry-run authorization is required/u
    );
    assert.throws(
        () => evaluateExpandedDeathValidationDryRun(manifest({
            authorizedForFutureExpandedDryRun: manifest().authorizedForFutureExpandedDryRun.filter(row => row.replayId !== 'replay_020')
        })),
        /eligible replay set/u
    );
    assert.throws(
        () => evaluateExpandedDeathValidationDryRun(manifest({
            blockedReplays: manifest().blockedReplays.filter(row => row.replayId !== 'replay_005')
        })),
        /blocked replay set/u
    );
});

test('expanded dry-run summaries keep output readiness compact and non-factual', () => {
    const evaluation = evaluateExpandedDeathValidationDryRun(manifest());
    const gate = buildGate(evaluation);
    const policy = buildPolicyReadinessSummary(evaluation);
    const schema = buildSchemaReadinessSummary(evaluation);
    const size = buildSizeReadinessSummary(evaluation);
    const fifteen = buildFifteenReplaySelectionNote(evaluation);
    const protection = buildProtectionAudit();

    assert.equal(gate.gate, SUCCESS_GATE);
    assert.equal(policy.realEmissionAuthorizedForExpansion, false);
    assert.equal(policy.replayFilesystemAccessPerformed, false);
    assert.equal(schema.realDeathValidationSchemaEmissionExecuted, false);
    assert.equal(schema.finalArtifactSchemaValidationExecuted, false);
    assert.equal(size.outputIsCompactReadinessOnly, true);
    assert.equal(fifteen.selectionMadeInTask166, false);
    assert.equal(fifteen.automaticExclusionPerformed, false);
    assert.equal(protection.replay005Accessed, false);
    assert.equal(protection.bots006To008Processed, false);
    assert.equal(protection.candidates012To020Accessed, false);
    assert.equal(protection.candidates012To020EvaluatedAsDryRunAuthorizationEntriesOnly, true);
    assert.equal(protection.newDeathValidationArtifactsEmitted, false);
    assert.equal(protection.sourceCanonicalMatchFinalFactsProduced, false);
    assert.equal(protection.gameplayInterpretationProduced, false);
});

test('expanded dry-run path validators are fixed to Task 165 and Task 166 paths', () => {
    assert.ok(validateManifestPath(DEFAULT_MANIFEST_PATH).endsWith(DEFAULT_MANIFEST_PATH.replaceAll('/', '\\')));
    assert.equal(validateSummaryOutputRoot(DEFAULT_SUMMARY_OUTPUT).normalized, DEFAULT_SUMMARY_OUTPUT);
    assert.throws(
        () => validateManifestPath('output/replays/materialized-expanded-dry-run-manifest.json'),
        /manifest path must be exactly/u
    );
    assert.throws(
        () => validateSummaryOutputRoot('output/replays/expanded-death-validation-dry-run/'),
        /summary output root must be exactly/u
    );
});

test('expanded dry-run runner source does not implement replay processing or real emission', async () => {
    const source = await readFile('tools/dry-run-expanded-death-validation-batch.mjs', 'utf8');
    assert.equal(/\b(createReadStream|stat|createHash|copyFile|Player|nextTick|seekToTick)\b/u.test(source), false);
    assert.equal(/\bgit\s+(pull|merge|cherry-pick|rebase)\b/iu.test(source), false);
    assert.equal(/\b(emitBatchDeathValidationCompact|emitDeathValidationCompact)\s*\(/u.test(source), false);
    assert.equal(/newRealArtifactsEmitted:\s*true|finalFactsProduced:\s*true|gameplayInterpretationProduced:\s*true/u.test(source), false);
});
