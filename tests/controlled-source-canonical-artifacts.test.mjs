import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';

import {
    AUTHORIZED_REPLAYS,
    EMITTABLE_COMPACT_CLASSES,
    auditArtifactPolicy,
    classifyEmission,
    planArtifactClasses,
    summarizeEmission,
    validateReplayInput,
    validateSummaryOutputRoot
} from '../tools/emit-controlled-source-canonical-artifacts.mjs';

test('controlled emission path guards allow only replay 010 and replay 011 inputs', () => {
    assert.equal(validateReplayInput('replay_010', AUTHORIZED_REPLAYS.replay_010).normalized, AUTHORIZED_REPLAYS.replay_010);
    assert.equal(validateReplayInput('replay_011', AUTHORIZED_REPLAYS.replay_011).normalized, AUTHORIZED_REPLAYS.replay_011);

    assert.throws(
        () => validateReplayInput('replay_010', '.local/deadem/replays/inbox/partida_005.dem'),
        /protected replay 005 path/u
    );
    assert.throws(
        () => validateReplayInput('replay_011', '.local/deadem/replays/inbox/partida_012.dem'),
        /out-of-scope candidate replay path/u
    );
    assert.throws(
        () => validateReplayInput('replay_012', '.local/deadem/replays/inbox/partida_012.dem'),
        /unsupported replay id/u
    );
});

test('controlled emission summary output root is fixed', () => {
    const root = validateSummaryOutputRoot('output/local-replay-processing/controlled-source-canonical-artifacts/');
    assert.equal(root.normalized, 'output/local-replay-processing/controlled-source-canonical-artifacts/');
    assert.throws(
        () => validateSummaryOutputRoot('output/replays/controlled-source-canonical-artifacts/'),
        /summary output root must be exactly/u
    );
});

test('artifact plan emits compact manifest classes and blocks value-bearing source classes', () => {
    const plan = planArtifactClasses();
    assert.deepEqual(plan.emittedClasses, EMITTABLE_COMPACT_CLASSES);
    assert.ok(plan.blockedClasses.some(row => row.artifactClass === 'match_state_timeline'));
    assert.ok(plan.blockedClasses.every(row => row.blocked === true));
});

test('artifact policy rejects forbidden final facts and accepts compact metadata', () => {
    assert.equal(auditArtifactPolicy({
        schemaVersion: 1,
        artifactClass: 'parser_source_summary',
        replayId: 'replay_010',
        rawDataCaptured: false,
        sourceFactsProduced: false,
        fieldValues: false
    }).passed, true);

    assert.equal(auditArtifactPolicy({
        schemaVersion: 1,
        artifactClass: 'bad',
        replayId: 'replay_010',
        sourceFactsProduced: true
    }).passed, false);
});

test('emission classification distinguishes emitted, schema, policy, size, and parser outcomes', () => {
    const replaySummaries = [
        { replayId: 'replay_010', parseCompleted: true },
        { replayId: 'replay_011', parseCompleted: true }
    ];
    assert.equal(classifyEmission({
        replaySummaries,
        schemaValidation: { schemaValidationStatus: 'passed' },
        outputPolicy: { policyStatus: 'passed' },
        sizeAudit: { sizeAuditStatus: 'passed' }
    }), 'controlled_source_canonical_artifacts_emitted');
    assert.equal(classifyEmission({
        replaySummaries,
        schemaValidation: { schemaValidationStatus: 'blocked' },
        outputPolicy: { policyStatus: 'passed' },
        sizeAudit: { sizeAuditStatus: 'passed' }
    }), 'controlled_source_canonical_artifacts_blocked_by_schema');
    assert.equal(classifyEmission({
        replaySummaries,
        schemaValidation: { schemaValidationStatus: 'passed' },
        outputPolicy: { policyStatus: 'blocked' },
        sizeAudit: { sizeAuditStatus: 'passed' }
    }), 'controlled_source_canonical_artifacts_blocked_by_output_policy');
    assert.equal(classifyEmission({
        replaySummaries,
        schemaValidation: { schemaValidationStatus: 'passed' },
        outputPolicy: { policyStatus: 'passed' },
        sizeAudit: { sizeAuditStatus: 'blocked' }
    }), 'controlled_source_canonical_artifacts_blocked_by_size');
    assert.equal(classifyEmission({
        replaySummaries: [{ replayId: 'replay_010', parseCompleted: true }, { replayId: 'replay_011', parseCompleted: false }],
        schemaValidation: { schemaValidationStatus: 'passed' },
        outputPolicy: { policyStatus: 'passed' },
        sizeAudit: { sizeAuditStatus: 'passed' }
    }), 'controlled_source_canonical_artifacts_partial');
});

test('emission summary carries no final facts or raw data flags', () => {
    const summary = summarizeEmission(
        'replay_010',
        { parserLoadSucceeded: true, parseCompleted: true, reachedEnd: true, firstErrorMessage: null },
        [{ artifactClass: 'parser_source_summary' }],
        [{ artifactClass: 'match_state_timeline' }]
    );
    assert.equal(summary.sourceFactsProduced, false);
    assert.equal(summary.canonicalFactsProduced, false);
    assert.equal(summary.matchFactsProduced, false);
    assert.equal(summary.rawDataCaptured, false);
    assert.deepEqual(summary.emittedArtifactClasses, ['parser_source_summary']);
    assert.deepEqual(summary.blockedArtifactClasses, ['match_state_timeline']);
});

test('controlled emission script does not implement update commands or forbidden fact flags', async () => {
    const source = await readFile('tools/emit-controlled-source-canonical-artifacts.mjs', 'utf8');
    assert.equal(/\bgit\s+(pull|merge|cherry-pick|rebase)\b/iu.test(source), false);
    assert.equal(/sourceFactsProduced:\s*true|canonicalFactsProduced:\s*true|matchFactsProduced:\s*true/u.test(source), false);
    assert.equal(/fieldValues:\s*true|rawReplayBytes:\s*true|rawPayloads:\s*true/u.test(source), false);
});
