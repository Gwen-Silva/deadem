import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import Ajv2020 from 'ajv/dist/2020.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('real Task203 window evidence index satisfies the strict schema', async () => {
    const schema = JSON.parse(await readFile(path.join(ROOT, 'schemas/dense-visual-review-evidence.schema.json'), 'utf8'));
    const artifact = JSON.parse(await readFile(path.join(ROOT, 'output/local-replay-processing/dense-review-evidence/task203-bounded2/window-evidence-index.json'), 'utf8'));
    const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema);
    assert.equal(validate(artifact), true, JSON.stringify(validate.errors, null, 2));
    assert.equal(artifact.candidateWindowCount, artifact.windows.length);
    assert.equal(artifact.candidateWindowCount, 102);
});
