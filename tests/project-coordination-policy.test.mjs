import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
    COORDINATION_STATUSES,
    validateCoordinationInvariants,
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
        value => { value.candidateCommit = '1'.repeat(40); }
    ]) {
        const changed = structuredClone(state);
        mutate(changed);
        assert.equal(validateCoordinationInvariants(changed, spec).valid, false);
    }
});

test('repository-level coordination validation passes', () => {
    const result = validateProjectCoordination();
    assert.deepEqual(result.errors, []);
    assert.equal(result.passed, true);
});
