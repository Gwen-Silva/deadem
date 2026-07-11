import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
    CONTRACT_KEYS,
    REPORT_CHECKS,
    REPORT_HEADINGS,
    validateReportText,
    validateTaskContractData
} from '../scripts/validate-project-coordination.js';
import { validateActiveTaskCount, validateFutureSpec } from '../scripts/validate-task-queue.js';

const ROOT = process.cwd();
const json = file => JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));

test('Task 191 contract contains every required block in normative order', () => {
    const contract = json('tasks/specs/191.json').executionContract;
    assert.deepEqual(Object.keys(contract), CONTRACT_KEYS);
    assert.equal(validateTaskContractData(contract).valid, true);
});

test('removing any contract block fails schema validation', () => {
    const contract = json('tasks/specs/191.json').executionContract;
    for (const key of CONTRACT_KEYS) {
        const mutation = structuredClone(contract);
        delete mutation[key];
        assert.equal(validateTaskContractData(mutation).valid, false, key);
    }
});

test('report contract requires every field, push status and pending Work gate', () => {
    const complete = fs.readFileSync(path.join(ROOT, 'docs/codex/CODEX_REPORT_TEMPLATE.md'), 'utf8');
    assert.equal(validateReportText(complete).valid, true);
    for (const heading of REPORT_HEADINGS) {
        const mutation = complete.replace(`## ${heading}`, '## Removed field');
        assert.equal(validateReportText(mutation).valid, false, heading);
    }
    assert.equal(validateReportText(`${complete}\nfinal acceptance: accepted\n`).valid, false);
    assert.ok(REPORT_HEADINGS.includes('Push e estado final'));
    assert.equal(REPORT_CHECKS.length, 20);
});

test('future queue rules accept technical Codex work and reject invalid routing', () => {
    const spec = json('tasks/specs/191.json');
    assert.deepEqual(validateFutureSpec(spec, '191.json'), []);

    const human = { taskId: '192', status: 'blocked', executionMode: 'human' };
    assert.ok(validateFutureSpec(human, '192.json').some(error => error.includes('human task missing')));

    const rejected = structuredClone(spec);
    rejected.taskId = '192';
    rejected.gateDecision = 'REJECTED';
    assert.ok(validateFutureSpec(rejected, '192.json').some(error => error.includes('rejected')));

    const pureReview = structuredClone(spec);
    pureReview.taskId = '192';
    pureReview.workType = 'review';
    assert.ok(validateFutureSpec(pureReview, '192.json').some(error => error.includes('ChatGPT Work')));
});

test('queue rejects more than one active task', () => {
    const errors = validateActiveTaskCount([{ dirName: 'active' }, { dirName: 'active' }]);
    assert.deepEqual(errors, ['only one task may be active, found 2']);
});
