import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
    buildContextText,
    preflight,
    validateSpecObject
} from '../scripts/codex-workflow.js';

const ROOT = process.cwd();
const json = file => JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));
const headings = [
    '1. Reasoning complexity',
    '2. Objective',
    '3. Technical context',
    '4. Confirmed state',
    '5. Expected base commit',
    '6. Branch/environment',
    '7. Allowed scope',
    '8. Protected areas',
    '9. Expected changes',
    '10. Acceptance criteria',
    '11. Mandatory tests',
    '12. Required evidence',
    '13. Commit policy',
    '14. Stop conditions',
    '15. Return-report format'
];

test('Task 191 context packet begins with all fifteen contract blocks in order', async () => {
    const spec = json('tasks/specs/191.json');
    const text = await buildContextText(spec, 'tasks/specs/191.json');
    let prior = -1;
    for (const heading of headings) {
        const index = text.indexOf(`## ${heading}`);
        assert.ok(index > prior, heading);
        prior = index;
    }
    assert.ok(text.indexOf('## Execution metadata') > prior);
    assert.match(text, /Last accepted commit \(Work-accepted\): 13a3da64bcf0ba839a752038f07f40e3eeeed890/u);
    assert.match(text, /Task expected base: 13a3da64bcf0ba839a752038f07f40e3eeeed890/u);
    assert.match(text, /Acceptance authority: ChatGPT Work/u);
    assert.match(text, /Codex execution claim:/u);
    assert.match(text, /Work validation: independently pending/u);
});

test('Task 191 preflight enforces coordination state and branch', async () => {
    const result = await preflight('191');
    assert.deepEqual(result.failures, []);
    assert.equal(result.passed, true);
});

test('executable Task 191+ without contract v1 is rejected', () => {
    const spec = json('tasks/specs/191.json');
    delete spec.coordinationPolicyVersion;
    delete spec.executionContract;
    spec.taskId = '192';
    const result = validateSpecObject(spec, 'tasks/specs/192.json');
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(error => error.includes('coordinationPolicyVersion')));
});

test('historical Task 190 spec remains valid', () => {
    const spec = json('tasks/specs/190.json');
    const result = validateSpecObject(spec, 'tasks/specs/190.json');
    assert.deepEqual(result.errors, []);
    assert.equal(result.valid, true);
});
