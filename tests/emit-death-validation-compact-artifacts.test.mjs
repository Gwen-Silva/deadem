import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
    AUTHORIZED_REPLAYS,
    BLOCKED_FIELDS,
    FORBIDDEN_OUTPUT_KEYS,
    auditDeathValidationPolicy,
    countDuplicateKeys,
    createDeathValidationArtifact,
    validateDeathValidationArtifact,
    validateReplayInput,
    validateSummaryOutputRoot
} from '../tools/emit-death-validation-compact-artifacts.mjs';

const schema = JSON.parse(await readFile(new URL('../schemas/death-validation-compact.schema.json', import.meta.url), 'utf8'));

test('death validation emitter accepts only replay 010 and replay 011 inputs', () => {
    assert.equal(validateReplayInput('replay_010', AUTHORIZED_REPLAYS.replay_010).normalized, AUTHORIZED_REPLAYS.replay_010);
    assert.equal(validateReplayInput('replay_011', AUTHORIZED_REPLAYS.replay_011).normalized, AUTHORIZED_REPLAYS.replay_011);

    assert.throws(
        () => validateReplayInput('replay_010', '.local/deadem/replays/inbox/partida_005.dem'),
        /protected replay 005 path/u
    );
    assert.throws(
        () => validateReplayInput('replay_010', '.local/deadem/replays/inbox/partida_006.dem'),
        /unsupported bot fixture replay path/u
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

test('death validation emitter rejects samples and output replay roots', () => {
    assert.throws(
        () => validateReplayInput('replay_010', 'samples/partida_010.dem'),
        /samples path/u
    );
    assert.throws(
        () => validateReplayInput('replay_011', 'output/replays/replay_011.dem'),
        /output\/replays path/u
    );
});

test('death validation summary output root is fixed', () => {
    const root = validateSummaryOutputRoot('output/local-replay-processing/death-validation-compact-emission/');
    assert.equal(root.normalized, 'output/local-replay-processing/death-validation-compact-emission/');
    assert.throws(
        () => validateSummaryOutputRoot('output/local-replay-processing/other/'),
        /summary output root must be exactly/u
    );
});

test('compact death validation artifact validates against Task 157 schema surface', () => {
    const artifact = createDeathValidationArtifact({
        replayId: 'replay_010',
        eventCount: 7,
        duplicateKeyCount: 0,
        validationStatus: 'source_events_available_with_limitations'
    });

    assert.equal(artifact.rawDataCaptured, false);
    assert.equal(artifact.finalFactsProduced, false);
    assert.equal(artifact.artifactClass, 'death_validation');
    assert.equal(artifact.sourceMethod, 'counter_transition_summary');
    assert.deepEqual(validateDeathValidationArtifact(artifact, schema), []);
});

test('blocked source validation artifact remains schema-valid without materialized counters', () => {
    const artifact = createDeathValidationArtifact({
        replayId: 'replay_011',
        eventCount: 0,
        duplicateKeyCount: 0,
        validationStatus: 'source_validation_blocked',
        warnings: ['synthetic source unavailable']
    });

    assert.equal(artifact.sourceMethod, 'not_evaluated');
    assert.equal(artifact.counterSource, 'not_materialized');
    assert.equal(artifact.counterTransitionType, 'not_materialized');
    assert.deepEqual(validateDeathValidationArtifact(artifact, schema), []);
});

test('artifact validator rejects event rows, field values, and fact flags', () => {
    const artifact = createDeathValidationArtifact({
        replayId: 'replay_010',
        eventCount: 1,
        duplicateKeyCount: 0,
        validationStatus: 'source_events_available_with_limitations'
    });

    assert.notDeepEqual(validateDeathValidationArtifact({ ...artifact, events: [] }, schema), []);
    assert.notDeepEqual(validateDeathValidationArtifact({ ...artifact, fieldValues: [] }, schema), []);
    assert.notDeepEqual(validateDeathValidationArtifact({ ...artifact, rawDataCaptured: true }, schema), []);
    assert.notDeepEqual(validateDeathValidationArtifact({ ...artifact, finalFactsProduced: true }, schema), []);
});

test('output policy audit rejects forbidden output keys and accepts compact artifacts', () => {
    const artifact = createDeathValidationArtifact({
        replayId: 'replay_010',
        eventCount: 1,
        duplicateKeyCount: 0,
        validationStatus: 'source_events_available_with_limitations'
    });

    assert.equal(auditDeathValidationPolicy([artifact]).policyStatus, 'passed');
    assert.equal(auditDeathValidationPolicy([{ ...artifact, killer: 'not allowed' }]).policyStatus, 'blocked');
});

test('duplicate key helper counts compact internal duplicate candidates only', () => {
    assert.equal(countDuplicateKeys(['a', 'b', 'a', 'c', 'b']), 2);
    assert.equal(countDuplicateKeys(['a', 'b', 'c']), 0);
});

test('blocked field list and forbidden keys cover value-bearing surfaces', () => {
    for (const field of ['event_rows', 'entity_ids', 'field_values', 'killer', 'victim', 'player_arrays']) {
        assert.ok(BLOCKED_FIELDS.includes(field));
    }
    for (const key of ['events', 'players', 'killer', 'victim', 'fieldValues', 'previousDeaths', 'currentDeaths']) {
        assert.ok(FORBIDDEN_OUTPUT_KEYS.has(key));
    }
});

test('death validation emitter does not implement update commands or final fact flags', async () => {
    const source = await readFile('tools/emit-death-validation-compact-artifacts.mjs', 'utf8');
    assert.equal(/\bgit\s+(pull|merge|cherry-pick|rebase)\b/iu.test(source), false);
    assert.equal(/sourceFactsProduced:\s*true|canonicalFactsProduced:\s*true|matchFactsProduced:\s*true/u.test(source), false);
    assert.equal(/finalFactsProduced:\s*true|rawDataCaptured:\s*true|fieldValues:\s*true/u.test(source), false);
});
