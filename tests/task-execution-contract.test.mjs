import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
    CONTRACT_KEYS,
    REPORT_CHECKS,
    REPORT_HEADINGS,
    validateReportText,
    validateReportTemplate,
    validateTaskContractData
} from '../scripts/validate-project-coordination.js';
import { validationExitCode } from '../scripts/codex-workflow.js';
import { taskIsAccepted, validateActiveTaskCount, validateFutureSpec, validateHistoricalSpecRange } from '../scripts/validate-task-queue.js';

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
    const template = fs.readFileSync(path.join(ROOT, 'docs/codex/CODEX_REPORT_TEMPLATE.md'), 'utf8');
    const complete = fs.readFileSync(path.join(ROOT, 'reports/autonomous-work-codex-coordination-policy-task191.md'), 'utf8');
    assert.equal(validateReportTemplate(template).valid, true);
    assert.equal(validateReportText(complete).valid, true);
    for (const heading of REPORT_HEADINGS) {
        const mutation = complete.replace(`## ${heading}`, '## Removed field');
        assert.equal(validateReportText(mutation).valid, false, heading);
    }
    assert.equal(validateReportText(`${complete}\nfinal acceptance: accepted\n`).valid, false);
    assert.equal(validateReportText(complete.replace('post-commit-attestation: .local/codex/191/post-commit-attestation.json', 'TBD')).valid, false);
    assert.equal(validateReportText(complete.replace('- Commit-base: 13a3da64bcf0ba839a752038f07f40e3eeeed890', '- Commit-base: null')).valid, false);
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
    assert.ok(validateFutureSpec(spec, '191.json', { rejectedCommits: [spec.baseCommitExpected] }).some(error => error.includes('rejected commit')));

    const pureReview = structuredClone(spec);
    pureReview.taskId = '192';
    pureReview.workType = 'review';
    assert.ok(validateFutureSpec(pureReview, '192.json').some(error => error.includes('ChatGPT Work')));
});

test('completed execution is not accepted without a Work gate', () => {
    const spec = { status: 'completed', gateDecision: undefined, acceptanceAuthority: undefined };
    assert.equal(taskIsAccepted(spec), false);
    assert.equal(taskIsAccepted({ ...spec, gateDecision: 'ACCEPTED', acceptanceAuthority: 'Codex' }), false);
    assert.equal(taskIsAccepted({ ...spec, gateDecision: 'ACCEPTED', acceptanceAuthority: 'ChatGPT Work' }), true);
});

test('all 100 historical specs 091-190 are parsed and structurally validated', () => {
    const actual = validateHistoricalSpecRange(path.join(ROOT, 'tasks/specs'));
    assert.deepEqual(actual.errors, []);
    assert.equal(actual.validated, 100);
    const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'deadem-specs-'));
    fs.cpSync(path.join(ROOT, 'tasks/specs'), fixture, { recursive: true });
    fs.rmSync(path.join(fixture, '190.json'));
    const missing = validateHistoricalSpecRange(fixture);
    assert.equal(missing.validated, 99);
    assert.ok(missing.errors.some(error => error.includes('190.json')));
    fs.rmSync(fixture, { recursive: true, force: true });
});

test('workflow validation result maps false to a failing process exit code', () => {
    assert.equal(validationExitCode({ passed: true }), 0);
    assert.equal(validationExitCode({ passed: false }), 1);
    assert.equal(validationExitCode(null), 1);
});

test('queue rejects more than one active task', () => {
    const errors = validateActiveTaskCount([{ dirName: 'active' }, { dirName: 'active' }]);
    assert.deepEqual(errors, ['only one task may be active, found 2']);
});
