import { access, readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    DEFAULT_REPLAYS,
    OUTPUT_ROOT,
    auditReplaySpecificBranches,
    canonicalizeRemainingHumanControls,
    classifyCompatibility,
    validateReplayList
} from '../tools/canonicalize-remaining-human-pilot-replays.mjs';

test('default replay list is exactly 001, 003, and 004', () => {
    assert.deepEqual(DEFAULT_REPLAYS, ['replay_001', 'replay_003', 'replay_004']);
});

test('replay 005 is rejected', () => {
    assert.throws(() => validateReplayList(['replay_005']), /rejected/u);
});

test('replays 006-008 are rejected', () => {
    for (const replayId of ['replay_006', 'replay_007', 'replay_008']) {
        assert.throws(() => validateReplayList([replayId]), /rejected/u);
    }
});

test('manifest builder is generic and parameterized by an explicit list', () => {
    assert.deepEqual(validateReplayList(['replay_003', 'replay_001']), ['replay_003', 'replay_001']);
});

test('replay IDs may appear declaratively but not in logic branches', () => {
    const declarative = "const DEFAULT_REPLAYS = ['replay_001', 'replay_003', 'replay_004'];";
    assert.equal(auditReplaySpecificBranches(declarative).passed, true);
    const hardcode = "if (replayId === 'replay_001') return patchedValue;";
    const audit = auditReplaySpecificBranches(hardcode);
    assert.equal(audit.passed, false);
    assert.ok(audit.findings.length >= 1);
});

test('missing optional category is unavailable, not zero', () => {
    assert.equal(classifyCompatibility({ sourceCount: null, targetCount: 0, optional: true }), 'optional_coverage_difference');
});

test('schema/content difference classification works', () => {
    assert.equal(classifyCompatibility({ sourceCount: 2, targetCount: 2 }), 'schema_identical');
    assert.equal(classifyCompatibility({ sourceCount: 2, targetCount: 3 }), 'expected_content_difference');
    assert.equal(classifyCompatibility({ sourceCount: 2, targetCount: 3, targetValid: false }), 'schema_break');
});

test('event count difference is not a schema break', () => {
    assert.equal(classifyCompatibility({ sourceCount: 12, targetCount: 15 }), 'expected_content_difference');
});

test('provenance is required for every emitted summary record', async () => {
    const result = await canonicalizeRemainingHumanControls({ replays: ['replay_001'], outputRoot: '.local/codex/095/test-output', reportPath: '.local/codex/095/test-report.md', clean: true });
    const replay = result.results[0];
    assert.equal(replay.validation.valid, true);
    for (const artifact of Object.values(replay.validation.byArtifact)) {
        assert.deepEqual(artifact.errors, []);
    }
});

test('forbidden semantic fields are not emitted in committed package manifests', async () => {
    const result = await canonicalizeRemainingHumanControls({ replays: ['replay_001'], outputRoot: '.local/codex/095/test-output', reportPath: '.local/codex/095/test-report.md', clean: true });
    const serialized = JSON.stringify(result.results[0].packageData);
    for (const forbidden of ['"lane"', '"region"', '"proximity"', '"transform"', '"residual"']) {
        assert.equal(serialized.includes(forbidden), false);
    }
});

test('replay-specific hardcode audit detects a synthetic hardcode', () => {
    const audit = auditReplaySpecificBranches("switch (replayId) { case 'replay_003': return 1; }");
    assert.equal(audit.passed, false);
});

test('output paths stay under the remaining-human-controls root', () => {
    assert.equal(OUTPUT_ROOT, 'output/five-replay-pilot/remaining-human-controls');
});

test('Task 096 remains blocked', async () => {
    const spec = JSON.parse(await readFile('tasks/specs/096.json', 'utf8'));
    assert.equal(spec.status, 'blocked');
});

test('no Task 097 is created', async () => {
    await assert.rejects(access('tasks/specs/097.json'));
});
