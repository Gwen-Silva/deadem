import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync } from 'node:fs';
import {
    auditForwardExtractorSource,
    buildAvailabilityRows,
    decideGate,
    forbiddenSemanticLayerAudit,
    REQUIRED_ARTIFACT_CLASSES,
    validateInputPath,
    validateOutputRoots
} from '../tools/generate-local-replay-forward-source-artifacts.mjs';

const seekToken = ['seek', 'To', 'Tick'].join('');

test('validates only partida_010 as authorized input', () => {
    const result = validateInputPath('.local/deadem/replays/inbox/partida_010.dem', 'replay_010');
    assert.equal(result.relativePath, '.local/deadem/replays/inbox/partida_010.dem');
});

test('rejects candidates 011 through 020', () => {
    for (const replayNumber of ['011', '012', '013', '014', '015', '016', '017', '018', '019', '020']) {
        assert.throws(() => validateInputPath(`.local/deadem/replays/inbox/partida_${replayNumber}.dem`, `replay_${replayNumber}`), /unauthorized|outside|unsupported/);
    }
});

test('rejects protected replay 005 paths', () => {
    assert.throws(() => validateInputPath('.local/deadem/replays/inbox/partida_005.dem', 'replay_005'), /unsupported|protected|unauthorized/);
});

test('rejects bot fixture replay paths', () => {
    for (const replayNumber of ['006', '007', '008']) {
        assert.throws(() => validateInputPath(`.local/deadem/replays/inbox/partida_${replayNumber}.dem`, `replay_${replayNumber}`), /unsupported|bot fixture|unauthorized/);
    }
});

test('rejects samples paths', () => {
    assert.throws(() => validateInputPath('samples/partida_010.dem', 'replay_010'), /samples/);
});

test('requires exact forward local output root', () => {
    assert.equal(
        validateOutputRoots(
            '.local/deadem/cache/local-replay-processing/replay_010/forward-source-artifacts/',
            'output/local-replay-processing/replay_010-forward-source-artifacts/'
        ).local.relativePath,
        '.local/deadem/cache/local-replay-processing/replay_010/forward-source-artifacts/'
    );
    assert.throws(() => validateOutputRoots('.local/deadem/cache/local-replay-processing/replay_010/source-artifacts/', 'output/local-replay-processing/replay_010-forward-source-artifacts/'), /local output root/);
});

test('requires exact committed summary output root', () => {
    assert.equal(
        validateOutputRoots(
            '.local/deadem/cache/local-replay-processing/replay_010/forward-source-artifacts/',
            'output/local-replay-processing/replay_010-forward-source-artifacts/'
        ).summary.relativePath,
        'output/local-replay-processing/replay_010-forward-source-artifacts/'
    );
    assert.throws(() => validateOutputRoots('.local/deadem/cache/local-replay-processing/replay_010/forward-source-artifacts/', 'output/local-replay-processing/replay_010-source-artifacts/'), /summary output root/);
});

test('availability rows include all required artifact classes', () => {
    const rows = buildAvailabilityRows({
        parser_source_summary: {
            artifactClass: 'parser_source_summary',
            status: 'ready',
            localArtifactPath: 'local',
            committedSummaryPath: 'summary',
            recordCount: 1,
            sourceMethod: 'test',
            limitations: []
        }
    });
    assert.deepEqual(rows.map(row => row.artifactClass), REQUIRED_ARTIFACT_CLASSES);
});

test('blocked artifacts do not report zero records', () => {
    const rows = buildAvailabilityRows({});
    for (const row of rows) {
        assert.notEqual(row.status, 'ready');
        assert.equal(row.recordCount, null);
    }
});

test('success gate requires forward sampling and all artifacts ready', () => {
    const availability = { rows: REQUIRED_ARTIFACT_CLASSES.map(artifactClass => ({ artifactClass, status: 'ready' })) };
    const result = decideGate({
        availability,
        sampling: { forwardOnlyAdvancementWorked: true },
        protectionAudit: { passed: true },
        branchAudit: { passed: true },
        task105Exists: false
    });
    assert.equal(result.gate, 'generic_local_replay_forward_source_artifacts_ready');
});

test('gate blocks when forward-only sampling fails', () => {
    const availability = { rows: REQUIRED_ARTIFACT_CLASSES.map(artifactClass => ({ artifactClass, status: 'ready' })) };
    const result = decideGate({
        availability,
        sampling: { forwardOnlyAdvancementWorked: false },
        protectionAudit: { passed: true },
        branchAudit: { passed: true },
        task105Exists: false
    });
    assert.equal(result.gate, 'generic_local_replay_forward_source_artifacts_blocked');
});

test('branch audit detects synthetic replay-specific branches', () => {
    const source = ['function x(replayId) { if (replayId === "replay_010") return true; }'].join('');
    const result = auditForwardExtractorSource(source, 'synthetic.js');
    assert.equal(result.passed, false);
    assert.equal(result.replaySpecificBranchFound, true);
});

test('branch audit detects synthetic random-access API token', () => {
    const source = `player.${seekToken}(100);`;
    const result = auditForwardExtractorSource(source, 'synthetic.js');
    assert.equal(result.passed, false);
    assert.equal(result.forbiddenSeekApiReferenceFound, true);
});

test('forbidden semantic layer audit rejects prohibited artifact names', () => {
    const result = forbiddenSemanticLayerAudit(['candidate-lane-output.json']);
    assert.equal(result.passed, false);
});

test('Task 105 was not created', () => {
    assert.equal(existsSync('tasks/specs/105.json'), false);
    assert.equal(existsSync('tasks/blocked/105-select-next-canonical-generalization-control.md'), false);
});
