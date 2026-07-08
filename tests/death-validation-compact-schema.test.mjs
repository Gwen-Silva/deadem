import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const schema = JSON.parse(await readFile(new URL('../schemas/death-validation-compact.schema.json', import.meta.url), 'utf8'));
const validExample = JSON.parse(await readFile(new URL('../output/local-replay-processing/death-validation-compact-schema/example-valid-artifact.json', import.meta.url), 'utf8'));
const invalidExamples = JSON.parse(await readFile(new URL('../output/local-replay-processing/death-validation-compact-schema/example-invalid-artifacts.json', import.meta.url), 'utf8'));

const forbiddenKeys = new Set([
    'events',
    'eventRows',
    'players',
    'snapshots',
    'killer',
    'victim',
    'assister',
    'damageSource',
    'fightId',
    'objectiveId',
    'fieldValues',
    'rawValues',
    'mapPositions',
    'ticks',
    'timestamps'
]);

function validateArtifact(artifact) {
    const errors = [];
    if (typeof artifact !== 'object' || artifact === null || Array.isArray(artifact)) return ['artifact must be object'];
    for (const required of schema.required) {
        if (!(required in artifact)) errors.push(`missing required ${required}`);
    }
    for (const key of Object.keys(artifact)) {
        if (!(key in schema.properties)) errors.push(`additional property ${key} is forbidden`);
        if (forbiddenKeys.has(key)) errors.push(`forbidden key ${key}`);
    }
    if (artifact.schemaVersion !== 1) errors.push('schemaVersion must be 1');
    if (artifact.artifactClass !== 'death_validation') errors.push('artifactClass must be death_validation');
    if (!schema.properties.sourceMethod.enum.includes(artifact.sourceMethod)) errors.push('sourceMethod enum violation');
    if (!schema.properties.validationStatus.enum.includes(artifact.validationStatus)) errors.push('validationStatus enum violation');
    if (!Number.isInteger(artifact.eventCount) || artifact.eventCount < 0) errors.push('eventCount must be non-negative integer');
    if (!Number.isInteger(artifact.duplicateKeyCount) || artifact.duplicateKeyCount < 0) errors.push('duplicateKeyCount must be non-negative integer');
    if (!Array.isArray(artifact.limitations) || artifact.limitations.length < 1) errors.push('limitations must be non-empty array');
    if (artifact.rawDataCaptured !== false) errors.push('rawDataCaptured must be false');
    if (artifact.finalFactsProduced !== false) errors.push('finalFactsProduced must be false');
    if ('counterTransitionType' in artifact && !schema.properties.counterTransitionType.enum.includes(artifact.counterTransitionType)) errors.push('counterTransitionType enum violation');
    if ('blockedFields' in artifact) {
        const allowed = new Set(schema.properties.blockedFields.items.enum);
        if (!Array.isArray(artifact.blockedFields)) errors.push('blockedFields must be array');
        else for (const field of artifact.blockedFields) {
            if (!allowed.has(field)) errors.push(`blockedFields enum violation: ${field}`);
        }
    }
    return errors;
}

test('death_validation compact schema defines required fields and forbids additional properties', () => {
    assert.equal(schema.additionalProperties, false);
    assert.deepEqual(schema.required, [
        'schemaVersion',
        'replayId',
        'artifactClass',
        'sourceMethod',
        'eventCount',
        'duplicateKeyCount',
        'validationStatus',
        'limitations',
        'rawDataCaptured',
        'finalFactsProduced'
    ]);
});

test('valid synthetic death_validation artifact passes compact schema checks', () => {
    assert.deepEqual(validateArtifact(validExample), []);
});

test('invalid synthetic artifacts fail schema checks', () => {
    for (const example of invalidExamples.invalidExamples) {
        const errors = validateArtifact(example.artifact);
        assert.notEqual(errors.length, 0, `${example.id} should fail`);
    }
});

test('schema explicitly forbids event rows and attribution surfaces by omission', () => {
    for (const forbidden of ['events', 'players', 'killer', 'victim', 'fightId', 'fieldValues']) {
        assert.equal(forbidden in schema.properties, false, `${forbidden} must not be a schema property`);
    }
});

test('eventCount is a counter-transition summary count, not final death facts', () => {
    assert.equal(validExample.finalFactsProduced, false);
    assert.match(validExample.limitations.join(' '), /not proof of death causality/u);
});
