import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import Ajv2020 from 'ajv/dist/2020.js';

test('all five Task 206 readiness artifacts conform to the shared schema', async () => {
    const schema = JSON.parse(await readFile('schemas/local-assisted-review-workspace.schema.json', 'utf8'));
    const validate = new Ajv2020({ allErrors: true, strict: false }).compile(schema);
    for (const name of ['manifest.json', 'availability.json', 'summary.json', 'gate.json', 'privacy-audit.json']) {
        const value = JSON.parse(await readFile(`output/local-replay-processing/assisted-review-workspace/task206-bounded2/${name}`, 'utf8'));
        assert.equal(validate(value), true, `${name}: ${JSON.stringify(validate.errors)}`);
    }
});
