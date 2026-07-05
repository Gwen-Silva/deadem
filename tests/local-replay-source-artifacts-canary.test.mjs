import test from 'node:test';
import assert from 'node:assert/strict';
import {
    REQUIRED_ARTIFACT_CLASSES,
    auditReplaySpecificBranches,
    buildAvailabilityRows,
    decideGate,
    forbiddenSemanticLayerAudit,
    validateInputPath,
    validateOutputRoots
} from '../tools/generate-local-replay-source-artifacts.mjs';

function readyRows() {
    return REQUIRED_ARTIFACT_CLASSES.map(artifactClass => ({
        artifactClass,
        status: 'ready',
        localArtifactPath: `.local/deadem/cache/local-replay-processing/replay_010/source-artifacts/${artifactClass}.json`,
        committedSummaryPath: 'output/local-replay-processing/replay_010-source-artifacts/source-artifact-manifest.json',
        recordCount: artifactClass === 'death_events' ? 0 : 1,
        sourceMethod: 'synthetic',
        limitations: []
    }));
}

test('only partida_010.dem is authorized', () => {
    assert.equal(validateInputPath('.local/deadem/replays/inbox/partida_010.dem').valid, true);
    assert.equal(validateInputPath('.local/deadem/replays/inbox/partida_011.dem').valid, false);
});

test('candidates 011 through 020 are rejected', () => {
    for (let id = 11; id <= 20; id += 1) {
        const result = validateInputPath(`.local/deadem/replays/inbox/partida_0${id}.dem`);
        assert.equal(result.valid, false, `partida_0${id}.dem`);
        assert.match(result.errors.join('\n'), /out-of-scope|filename/iu);
    }
});

test('replay 005-like filename is rejected', () => {
    const result = validateInputPath('.local/deadem/replays/inbox/partida_005.dem');
    assert.equal(result.valid, false);
    assert.match(result.errors.join('\n'), /protected/iu);
});

test('006 through 008-like filenames are rejected', () => {
    for (const file of ['partida_006.dem', 'partida_007.dem', 'partida_008.dem']) {
        const result = validateInputPath(`.local/deadem/replays/inbox/${file}`);
        assert.equal(result.valid, false, file);
        assert.match(result.errors.join('\n'), /unsupported/iu);
    }
});

test('samples path is rejected', () => {
    const result = validateInputPath('samples/partida_010.dem');
    assert.equal(result.valid, false);
    assert.match(result.errors.join('\n'), /samples|inbox/iu);
});

test('local output root must be local source-artifacts cache', () => {
    assert.equal(validateOutputRoots(
        '.local/deadem/cache/local-replay-processing/replay_010/source-artifacts/',
        'output/local-replay-processing/replay_010-source-artifacts/'
    ).valid, true);
    assert.equal(validateOutputRoots(
        '.local/deadem/cache/local-replay-processing/replay_010/',
        'output/local-replay-processing/replay_010-source-artifacts/'
    ).valid, false);
});

test('committed summary root must be bounded source-artifacts output', () => {
    assert.equal(validateOutputRoots(
        '.local/deadem/cache/local-replay-processing/replay_010/source-artifacts/',
        'output/local-replay-processing/replay_010-canary/'
    ).valid, false);
});

test('availability rows include all required classes', () => {
    const rows = buildAvailabilityRows({});
    assert.deepEqual(rows.map(row => row.artifactClass), REQUIRED_ARTIFACT_CLASSES);
});

test('unavailable artifact is not represented as zero records', () => {
    const [row] = buildAvailabilityRows({}).filter(item => item.status === 'unavailable');
    assert.equal(row.recordCount, null);
});

test('blocked gate occurs if required parser source summary is unavailable', () => {
    const rows = readyRows().map(row => row.artifactClass === 'parser_source_summary' ? { ...row, status: 'blocked' } : row);
    assert.equal(decideGate({
        availabilityRows: rows,
        protectionsPassed: true,
        branchAuditPassed: true,
        forbiddenSemanticLayers: []
    }), 'generic_local_replay_canonical_source_artifacts_blocked');
});

test('success gate requires parser source summary plus core canonical source rows', () => {
    assert.equal(decideGate({
        availabilityRows: readyRows(),
        protectionsPassed: true,
        branchAuditPassed: true,
        forbiddenSemanticLayers: []
    }), 'generic_local_replay_canonical_source_artifacts_ready');
});

test('forbidden semantic layer audit catches forbidden output names', () => {
    assert.deepEqual(forbiddenSemanticLayerAudit(['match-state-timeline.jsonl', 'lane-region.json']), ['lane-region.json']);
});

test('normal source artifact names do not emit forbidden semantic layers', () => {
    assert.deepEqual(forbiddenSemanticLayerAudit(['match-state-timeline.jsonl', 'death-events.json', 'objective-entity-inventory.json']), []);
});

test('branch audit detects synthetic if replay_010', () => {
    const result = auditReplaySpecificBranches("if (replayId === 'replay_010') throw new Error();");
    assert.equal(result.passed, false);
});

test('Task 104 does not exist in gate output vocabulary', () => {
    const gate = decideGate({
        availabilityRows: readyRows(),
        protectionsPassed: true,
        branchAuditPassed: true,
        forbiddenSemanticLayers: []
    });
    assert.notEqual(gate, 'task_104_created');
});
