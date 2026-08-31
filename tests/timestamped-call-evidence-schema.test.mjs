import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import Ajv2020 from 'ajv/dist/2020.js';

test('real Task205 summary satisfies timestamped call evidence schema', async () => {
    const schema = JSON.parse(await readFile('schemas/timestamped-call-evidence.schema.json', 'utf8'));
    const artifact = JSON.parse(await readFile('output/local-replay-processing/audio-call-evidence/task205-bounded2/summary.json', 'utf8'));
    const validate = new Ajv2020({ allErrors: true, strict: false }).compile(schema);
    assert.equal(validate(artifact), true, JSON.stringify(validate.errors));
});
