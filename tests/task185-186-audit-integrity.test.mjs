import assert from 'node:assert/strict';
import test from 'node:test';
import { auditTaskCommitConsistency, auditTask185CycleCorrection } from '../tools/validate-task185-186-audit-integrity.mjs';

const sha185 = '8ca6d50fd99fdc6fc4b802ab3af2e74b06f4796e';
const sha186 = '7696c6375f9a607e365359224996b2bd67fa07b7';
const completed185 = `# Task 185\n\nCommit: ${sha185}\n`;
const completed186 = `# Task 186\n\nCommit: ${sha186}\n`;
const state = `## Task 185 - A\n\nTask 185 commit: \`${sha185}\`.\n\n## Task 186 - B\n\nTask 186 commit: \`${sha186}\`.\n`;

test('exact commit audit rejects Task 011 false positive even when SHA exists elsewhere', () => {
    const index = { tasks: [{ taskId: '011', commitSha: sha185 }, { taskId: '185', commitSha: null }, { taskId: '186', commitSha: sha186 }] };
    const audit = auditTaskCommitConsistency({ index, completed185, completed186, projectState: state });
    assert.equal(audit.status, 'failed');
    assert.equal(audit.checks.task011ContainsNeitherSha, false);
    assert.equal(audit.checks.task185ExactCommit, false);
});

test('exact commit audit accepts only exact task ownership and exact document sections', () => {
    const index = { tasks: [{ taskId: '011', commitSha: null }, { taskId: '185', commitSha: sha185 }, { taskId: '186', commitSha: sha186 }] };
    assert.equal(auditTaskCommitConsistency({ index, completed185, completed186, projectState: state }).status, 'passed');
});

test('cycle correction status is computed and fails incomplete artifact sets', () => {
    const audit = auditTask185CycleCorrection([], true);
    assert.equal(audit.status, 'failed');
    assert.equal(audit.checks.exactly32Artifacts, false);
    assert.equal(audit.checks.exactly2552Anchors, false);
});
