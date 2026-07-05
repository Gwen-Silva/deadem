import test from 'node:test';
import assert from 'node:assert/strict';
import {
    auditReplaySpecificBranches,
    decideGate,
    replayIdForFilename,
    selectDefaultCanary,
    validateInputPath,
    validateOutputRoots
} from '../tools/process-local-replay-input.mjs';

test('authorized partida_010 inbox path is accepted', () => {
    const result = validateInputPath('.local/deadem/replays/inbox/partida_010.dem');
    assert.equal(result.valid, true);
    assert.equal(result.replayId, 'replay_010');
});

test('samples path is rejected', () => {
    const result = validateInputPath('samples/partida_010.dem');
    assert.equal(result.valid, false);
    assert.match(result.errors.join('\n'), /inbox|samples/iu);
});

test('protected replay 005 path is rejected', () => {
    const result = validateInputPath('.local/deadem/replays/inbox/partida_005.dem');
    assert.equal(result.valid, false);
    assert.match(result.errors.join('\n'), /protected/iu);
});

test('unsupported bot fixture paths are rejected', () => {
    for (const filename of ['partida_006.dem', 'partida_007.dem', 'partida_008.dem', 'bot_fixture.dem']) {
        const result = validateInputPath(`.local/deadem/replays/inbox/${filename}`);
        assert.equal(result.valid, false, filename);
    }
});

test('filename maps only the authorized canary to replay_010', () => {
    assert.equal(replayIdForFilename('partida_010.dem'), 'replay_010');
    assert.equal(replayIdForFilename('partida_011.dem'), null);
});

test('default canary selection ignores 011 through 020', () => {
    const selected = selectDefaultCanary(['partida_010.dem', 'partida_011.dem', 'partida_020.dem']);
    assert.deepEqual(selected, ['partida_010.dem']);
});

test('output roots are scoped to local cache and committed summary', () => {
    const result = validateOutputRoots(
        '.local/deadem/cache/local-replay-processing/replay_010/',
        'output/local-replay-processing/replay_010-canary/'
    );
    assert.equal(result.valid, true);
});

test('local artifacts must not be placed in committed output root', () => {
    const result = validateOutputRoots(
        'output/local-replay-processing/replay_010-canary/full/',
        'output/local-replay-processing/replay_010-canary/'
    );
    assert.equal(result.valid, false);
});

test('summary artifacts must not be placed under .local', () => {
    const result = validateOutputRoots(
        '.local/deadem/cache/local-replay-processing/replay_010/',
        '.local/deadem/cache/local-replay-processing/replay_010/summary/'
    );
    assert.equal(result.valid, false);
});

test('replay-specific branch audit rejects a replay_010 condition', () => {
    const result = auditReplaySpecificBranches("if (replayId === 'replay_010') {\n  doThing();\n}");
    assert.equal(result.passed, false);
});

test('replay-specific branch audit rejects replayId switch', () => {
    const result = auditReplaySpecificBranches('switch (replayId) {\n  case "replay_010": break;\n}');
    assert.equal(result.passed, false);
});

test('replay-specific branch audit allows declarative constants', () => {
    const result = auditReplaySpecificBranches("const replayId = 'replay_010';\nconst allowed = true;");
    assert.equal(result.passed, true);
});

test('success gate requires parser and canonical readiness', () => {
    assert.equal(decideGate({
        parserCompleted: true,
        canonicalReady: true,
        protectionsPassed: true,
        branchAuditPassed: true
    }), 'generic_local_replay_processing_canary_ready');
});

test('source artifact success without canonical readiness returns partial gate', () => {
    assert.equal(decideGate({
        parserCompleted: true,
        canonicalReady: false,
        protectionsPassed: true,
        branchAuditPassed: true
    }), 'generic_local_replay_source_artifacts_ready_canonicalization_pending');
});

test('parser failure returns blocked gate', () => {
    assert.equal(decideGate({
        parserCompleted: false,
        canonicalReady: false,
        protectionsPassed: true,
        branchAuditPassed: true
    }), 'generic_local_replay_processing_canary_blocked');
});

test('protection failure returns blocked gate', () => {
    assert.equal(decideGate({
        parserCompleted: true,
        canonicalReady: true,
        protectionsPassed: false,
        branchAuditPassed: true
    }), 'generic_local_replay_processing_canary_blocked');
});

test('branch audit failure returns blocked gate', () => {
    assert.equal(decideGate({
        parserCompleted: true,
        canonicalReady: true,
        protectionsPassed: true,
        branchAuditPassed: false
    }), 'generic_local_replay_processing_canary_blocked');
});

test('absolute input paths are rejected', () => {
    assert.throws(() => validateInputPath('C:/tmp/partida_010.dem'), /relative/iu);
});

test('traversal input paths are rejected', () => {
    assert.throws(() => validateInputPath('.local/deadem/replays/inbox/../partida_010.dem'), /traversal/iu);
});

test('task 103 is not part of canary gate decisions', () => {
    const result = decideGate({
        parserCompleted: true,
        canonicalReady: false,
        protectionsPassed: true,
        branchAuditPassed: true
    });
    assert.notEqual(result, 'task_103_created');
});
