import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import Ajv2020 from 'ajv/dist/2020.js';

test('real Task208 canary summary satisfies the privacy-safe schema', async () => {
    const schema = JSON.parse(await readFile('schemas/craig-multitrack-canary.schema.json', 'utf8'));
    const artifact = JSON.parse(await readFile('output/local-replay-processing/craig-multitrack/task208-real-canary/canary-summary.json', 'utf8'));
    const validate = new Ajv2020({ allErrors: true, strict: false }).compile(schema);
    assert.equal(validate(artifact), true, JSON.stringify(validate.errors));
});
