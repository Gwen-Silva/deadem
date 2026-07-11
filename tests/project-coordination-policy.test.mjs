import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
    COORDINATION_STATUSES,
    validateCoordinationInvariants,
    validatePostCommitAttestation,
    validateProjectCoordination,
    validateStateData
} from '../scripts/validate-project-coordination.js';

const ROOT = process.cwd();
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
const json = file => JSON.parse(read(file));

test('normative policy separates Work, Codex and Chat without self-approval', () => {
    const policy = read('docs/codex/AUTONOMOUS_COORDINATION_POLICY.md');
    assert.match(policy, /ChatGPT Work é o coordenador principal/u);
    assert.match(policy, /Codex executa/u);
    assert.match(policy, /Chat somente apresenta resultados/u);
    assert.match(policy, /Codex não pode\s+aprovar o próprio trabalho/u);
    assert.match(policy, /HEAD[^\n]*não implica aceitação/u);
    assert.match(policy, /BLOCKED_BY_SURFACE/u);
    assert.doesNotMatch(policy, /Gwen\s+(?:deve|deverá)[^\n]{0,80}(escolh|selecion).{0,40}(Work|Codex)/iu);
    for (const status of COORDINATION_STATUSES) assert.ok(policy.includes(`\`${status}\``), status);
});

test('coordination state is schema-valid and remains a Task 191 candidate', () => {
    const state = json('data/project-coordination-state.json');
    const spec = json('tasks/specs/191.json');
    assert.equal(validateStateData(state).valid, true);
    assert.equal(validateCoordinationInvariants(state, spec).valid, true);
    assert.match(state.lastAcceptedCommit, /^[0-9a-f]{40}$/u);
    assert.equal(state.activeBaseCommit, state.lastAcceptedCommit);
    assert.equal(state.lastAcceptedTaskId, '190');
    assert.equal(state.activeTaskId, '191');
    assert.equal(state.status, 'VALIDATING');
    assert.equal(state.candidateCommit, null);
    assert.equal(state.candidateResolution.strategy, 'git_head_exactly_one_commit_from_active_base');
    assert.equal(state.candidateResolution.requiredCommitCount, 1);
    assert.deepEqual(state.rejectedCommits, ['bf5cdaaa20c41b73523b53ea2855ca41c6223653']);
    assert.equal(state.acceptanceAuthority, 'ChatGPT Work');
});

test('invalid coordination state mutations fail closed', () => {
    const state = json('data/project-coordination-state.json');
    const spec = json('tasks/specs/191.json');
    for (const mutate of [
        value => { value.lastAcceptedCommit = 'bad'; },
        value => { value.status = 'SELF_ACCEPTED'; },
        value => { value.activeBaseCommit = '0'.repeat(40); },
        value => { value.acceptanceAuthority = 'Codex'; }
    ]) {
        const changed = structuredClone(state);
        mutate(changed);
        assert.equal(validateStateData(changed).valid, false);
    }
    for (const mutate of [
        value => { value.lastAcceptedTaskId = '191'; },
        value => { value.status = 'ACCEPTED'; },
        value => { value.candidateResolution = null; },
        value => { value.activeBaseCommit = 'bf5cdaaa20c41b73523b53ea2855ca41c6223653'; value.lastAcceptedCommit = value.activeBaseCommit; value.executionContract = {}; }
    ]) {
        const changed = structuredClone(state);
        mutate(changed);
        assert.equal(validateCoordinationInvariants(changed, spec).valid, false);
    }
});

test('accepted state is immutable to Codex and rejected SHAs fail as bases or candidates', () => {
    const state = json('data/project-coordination-state.json');
    const spec = json('tasks/specs/191.json');
    const acceptedState = { lastAcceptedTaskId: '190', lastAcceptedCommit: '13a3da64bcf0ba839a752038f07f40e3eeeed890' };
    const changed = structuredClone(state);
    changed.lastAcceptedTaskId = '191';
    changed.lastAcceptedCommit = 'a'.repeat(40);
    changed.activeBaseCommit = changed.lastAcceptedCommit;
    assert.equal(validateCoordinationInvariants(changed, spec, { acceptedState }).valid, false);

    const rejectedBase = structuredClone(spec);
    rejectedBase.baseCommitExpected = state.rejectedCommits[0];
    assert.equal(validateCoordinationInvariants(state, rejectedBase).valid, false);
    assert.equal(validateCoordinationInvariants(state, spec, { resolvedCandidateCommit: state.rejectedCommits[0] }).valid, false);
});

test('post-commit attestation rejects missing, null and self-accepting evidence', () => {
    const valid = {
        taskId: '191', candidateCommit: 'a'.repeat(40), baseCommit: 'b'.repeat(40), branch: 'task191-correction',
        commitCount: 1, commitList: ['a'.repeat(40)], files: [], commands: [], tests: {},
        build: 'not_applicable:governance', lint: 'passed', typecheck: 'not_applicable:none', artifacts: [],
        limitations: [], risks: [], deviations: [], unvalidated: [], technicalGateClaim: 'ready', pushStatus: 'not_attempted:local',
        head: 'a'.repeat(40), originRef: 'not_available:absent', finalStatus: 'VALIDATING', coordinationStatus: 'VALIDATING',
        finalAcceptanceStatus: 'pending_work_validation', generatedAt: new Date().toISOString()
    };
    assert.equal(validatePostCommitAttestation(valid).valid, true);
    for (const mutate of [
        value => { delete value.candidateCommit; },
        value => { value.candidateCommit = null; },
        value => { value.commitCount = 2; },
        value => { value.pushStatus = 'pushed'; },
        value => { value.finalStatus = 'ACCEPTED'; },
        value => { value.head = 'c'.repeat(40); }
    ]) {
        const changed = structuredClone(valid);
        mutate(changed);
        assert.equal(validatePostCommitAttestation(changed).valid, false);
    }
});

test('repository-level coordination validation passes', () => {
    const result = validateProjectCoordination();
    assert.deepEqual(result.errors, []);
    assert.equal(result.passed, true);
});
