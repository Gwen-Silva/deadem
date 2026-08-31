import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import Ajv2020 from 'ajv/dist/2020.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('real Task204 window review index satisfies the strict schema', async () => {
    const schema = JSON.parse(await readFile(path.join(ROOT, 'schemas/two-match-assisted-review-bundles.schema.json'), 'utf8'));
    const artifact = JSON.parse(await readFile(path.join(ROOT, 'output/local-replay-processing/assisted-review-bundles/task204-bounded2/window-review-index.json'), 'utf8'));
    const validate = new Ajv2020({ allErrors: true, strict: false }).compile(schema);
    assert.equal(validate(artifact), true, JSON.stringify(validate.errors, null, 2));
});
