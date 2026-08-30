import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';

const schema = JSON.parse(await readFile(new URL('../schemas/minimum-factual-review-telemetry.schema.json', import.meta.url), 'utf8'));
const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema);
const names = ['time', 'participants', 'teams', 'heroes', 'lifeState', 'netWorth', 'damage', 'healing', 'objectives', 'positions'];
const row = { status: 'unavailable', rows: 0, coverage: null, source: null, firstTime: null, lastTime: null, gaps: [], semanticLimitations: ['declared unavailable'] };
const fixture = { schemaVersion: 1, families: names, targets: ['review_match_001', 'review_match_002'].map(reviewTargetId => ({ reviewTargetId, availability: Object.fromEntries(names.map(name => [name, structuredClone(row)])) })) };

test('strict availability schema accepts bounded two-target matrix', () => assert.equal(validate(fixture), true, JSON.stringify(validate.errors)));
test('strict availability schema rejects missing families and invented fields', () => {
    const missing = structuredClone(fixture); delete missing.targets[0].availability.time;
    assert.equal(validate(missing), false);
    const invented = structuredClone(fixture); invented.targets[0].availability.positions.mapRegion = 'Rift';
    assert.equal(validate(invented), false);
});

test('real compact availability artifact is schema-valid when present', async () => {
    const file = new URL('../output/local-replay-processing/minimum-review-telemetry/task199-bounded2/availability.json', import.meta.url);
    if (!existsSync(file)) return;
    const actual = JSON.parse(await readFile(file, 'utf8'));
    assert.equal(validate(actual), true, JSON.stringify(validate.errors));
});
