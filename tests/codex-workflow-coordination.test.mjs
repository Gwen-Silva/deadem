import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
    buildContextText,
    buildContextPacket,
    evaluatePushEvidence,
    preflight,
    resolveCandidateFromGit,
    validatePreflightInputs,
    validateSurfaceHandoff,
    validateSpecObject
} from '../scripts/codex-workflow.js';
import { validateProjectCoordination } from '../scripts/validate-project-coordination.js';

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
    assert.match(text, /Active task: 191/u);
    assert.match(text, /Coordination status: VALIDATING/u);
    assert.match(text, /Coordination branch: task191-correction/u);
    assert.match(text, /Codex execution claim:/u);
    assert.match(text, /Work validation: independently pending/u);
});

test('Task 191 preflight enforces coordination state and branch', async () => {
    const result = await preflight('191', { base: '13a3da64bcf0ba839a752038f07f40e3eeeed890' });
    assert.deepEqual(result.failures, []);
    assert.equal(result.passed, true);
});

test('preflight mutations fail for missing state/policy, divergent task/base/branch, missing contract, self-approval and limits', () => {
    const state = json('data/project-coordination-state.json');
    const spec = json('tasks/specs/191.json');
    const baseInputs = {
        state,
        spec,
        expectedBaseCommit: state.lastAcceptedCommit,
        actualBranch: state.branch,
        policyExists: true,
        agentsBytes: 100,
        currentStateBytes: 100
    };
    const mutations = [
        value => { value.state = null; },
        value => { value.state = 'invalid'; },
        value => { value.policyExists = false; },
        value => { value.state.activeTaskId = '192'; },
        value => { value.expectedBaseCommit = 'a'.repeat(40); },
        value => { value.actualBranch = 'main'; },
        value => { delete value.spec.coordinationPolicyVersion; delete value.spec.executionContract; },
        value => { value.state.lastAcceptedTaskId = '191'; },
        value => { value.agentsBytes = 9000; },
        value => { value.currentStateBytes = 5000; }
    ];
    for (const mutate of mutations) {
        const changed = structuredClone(baseInputs);
        mutate(changed);
        assert.equal(validatePreflightInputs(changed).passed, false);
    }
});

test('surface handoff cannot invent integration and preserves BLOCKED_BY_SURFACE', () => {
    assert.equal(validateSurfaceHandoff({ integrationAvailable: false, invocationClaimed: false, status: 'BLOCKED_BY_SURFACE', instructionPreserved: true }).passed, true);
    assert.equal(validateSurfaceHandoff({ integrationAvailable: false, invocationClaimed: true, status: 'CODEX_RUNNING', instructionPreserved: false }).passed, false);
});

test('push evidence rejects stale refs, local origins, absent remotes and unverified pushed overrides', () => {
    const candidateCommit = 'a'.repeat(40);
    const branch = 'task191-correction';
    for (const remoteEvidence of [
        { external: true, exitCode: 0, sha: 'b'.repeat(40), reason: 'remote_sha_differs' },
        { external: false, exitCode: 0, sha: candidateCommit, reason: 'origin_not_external' },
        { external: true, exitCode: 0, sha: null, reason: 'remote_branch_absent' },
        { external: true, exitCode: 128, sha: null, reason: 'remote_verification_failed' }
    ]) {
        const result = evaluatePushEvidence({ candidateCommit, branch, remoteEvidence, requestedStatus: `pushed:origin/${branch}` });
        assert.equal(result.verified, false);
        assert.match(result.pushStatus, /^blocked:unverified_push_claim_/u);
    }
    const verified = evaluatePushEvidence({ candidateCommit, branch, remoteEvidence: { external: true, exitCode: 0, sha: candidateCommit } });
    assert.deepEqual(verified, { pushStatus: `pushed:origin/${branch}`, originRef: `origin/${branch}`, verified: true });
});

test('Git candidate resolver distinguishes accepted base from HEAD without accepting HEAD', () => {
    const state = json('data/project-coordination-state.json');
    const result = resolveCandidateFromGit(state, state.lastAcceptedCommit, { requireCandidate: false });
    assert.equal(result.valid, true);
    assert.equal(result.baseCommit, state.lastAcceptedCommit);
    assert.notEqual(result.candidateCommit, state.rejectedCommits[0]);
    assert.equal(state.lastAcceptedCommit, '13a3da64bcf0ba839a752038f07f40e3eeeed890');
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

test('Work-accepted Task 191 can continue through READY_FOR_CODEX Task 192', async () => {
    const acceptedCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    const state = json('data/project-coordination-state.json');
    Object.assign(state, {
        lastAcceptedTaskId: '191', lastAcceptedCommit: acceptedCommit, activeBaseCommit: acceptedCommit,
        activeTaskId: '192', status: 'READY_FOR_CODEX', candidateCommit: null, candidateResolution: null,
        completedTasks: ['190', '191'], pendingTasks: ['192'], updatedBy: 'ChatGPT Work'
    });
    const spec = json('tasks/specs/191.json');
    spec.taskId = '192';
    spec.title = 'Temporary continuation integration fixture';
    spec.baseCommitExpected = acceptedCommit;
    spec.executionContract.expectedBaseCommit = acceptedCommit;

    assert.equal(validateProjectCoordination(ROOT, { stateOverride: state, specOverride: spec }).passed, true);
    assert.equal((await buildContextPacket('192', { dryRun: true, stateOverride: state, specOverride: spec })).spec.taskId, '192');
    const baseOptions = { dryRun: true, stateOverride: state, specOverride: spec, actualBranchOverride: state.branch, headCommitOverride: acceptedCommit, base: acceptedCommit };
    assert.equal((await preflight('192', baseOptions)).passed, true);

    for (const mutate of [
        value => { value.options.headCommitOverride = 'a'.repeat(40); },
        value => { value.state.candidateResolution = { strategy: 'git_head_exactly_one_commit_from_active_base', requiredCommitCount: 1, branch: state.branch, reviewArtifact: '.local/codex/192/post-commit-attestation.json' }; },
        value => { value.spec.baseCommitExpected = state.rejectedCommits[0]; value.spec.executionContract.expectedBaseCommit = state.rejectedCommits[0]; },
        value => { value.state.activeTaskId = '193'; },
        value => { value.options.actualBranchOverride = 'main'; }
    ]) {
        const fixture = { state: structuredClone(state), spec: structuredClone(spec), options: structuredClone(baseOptions) };
        fixture.options.stateOverride = fixture.state;
        fixture.options.specOverride = fixture.spec;
        mutate(fixture);
        assert.equal((await preflight('192', fixture.options)).passed, false);
    }
});
