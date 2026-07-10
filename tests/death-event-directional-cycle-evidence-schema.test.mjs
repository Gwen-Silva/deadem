import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { validateJsonSchema } from '../tools/lib/json-schema-validator.mjs';
import { createDirectionalCycleArtifact } from '../tools/emit-death-event-directional-cycle-evidence.mjs';

const schema = JSON.parse(await readFile('schemas/death-event-directional-cycle-evidence.schema.json', 'utf8'));

function inputs() {
    const anchor = {
        eventCandidateKey: 'death_event_candidate_000001',
        sourceTransitionKey: 'life_transition_000001',
        participantKey: 'participant_01',
        heroRefKey: 'hero_ref_01',
        teamRefKey: 'team_ref_01',
        normalizedElapsedSecond: 100
    };
    return {
        replayId: 'replay_010',
        participantIdentity: { replayId: 'replay_010', participants: [{ participantKey: 'participant_01' }] },
        lifeStateTransitions: { replayId: 'replay_010', transitionCandidates: [{ transitionKey: 'life_transition_000001', participantKey: 'participant_01', heroRefKey: 'hero_ref_01', teamRefKey: 'team_ref_01', normalizedElapsedSecond: 100 }] },
        deathEventCandidates: { replayId: 'replay_010', candidates: [anchor] },
        corroborationEvidence: { replayId: 'replay_010', evidenceRows: [anchor], summary: { confirmationEvidenceLevel: 'strong' } },
        observedTransitions: [
            { observedTransitionKey: 'directional_transition_000001', participantKey: 'participant_01', family: 'healthBoundary', scope: 'linked_pawn', second: 100, direction: 'positive_to_non_positive_boundary_candidate' },
            { observedTransitionKey: 'directional_transition_000002', participantKey: 'participant_01', family: 'booleanAlive', scope: 'linked_pawn', second: 100, direction: 'boolean_true_to_false_candidate' },
            { observedTransitionKey: 'directional_transition_000003', participantKey: 'participant_01', family: 'healthBoundary', scope: 'linked_pawn', second: 140, direction: 'non_positive_to_positive_boundary_candidate' },
            { observedTransitionKey: 'directional_transition_000004', participantKey: 'participant_01', family: 'booleanAlive', scope: 'linked_pawn', second: 140, direction: 'boolean_false_to_true_candidate' }
        ],
        replayEndSecond: 400
    };
}

function validArtifact() {
    return createDirectionalCycleArtifact(inputs()).artifact;
}

test('directional-cycle schema accepts abstract candidate-only evidence with real Draft 2020-12 validation', () => {
    const result = validateJsonSchema(schema, validArtifact());
    assert.equal(result.valid, true, result.errors.join('\n'));
    assert.equal(result.draft, '2020-12');
});

test('directional-cycle schema closes artifact, row, and family objects', () => {
    for (const mutate of [
        artifact => { artifact.unexpected = true; },
        artifact => { artifact.evidenceRows[0].killer = 'participant_02'; },
        artifact => { artifact.evidenceRows[0].anchorSideTransitions.rawFieldName = 'm_iHealth'; }
    ]) {
        const artifact = structuredClone(validArtifact());
        mutate(artifact);
        assert.equal(validateJsonSchema(schema, artifact).valid, false);
    }
});

test('directional-cycle schema rejects raw time, final facts, attribution, and invalid truth state', () => {
    for (const mutate of [
        artifact => { artifact.evidenceRows[0].tick = 100; },
        artifact => { artifact.evidenceRows[0].finalFact = true; },
        artifact => { artifact.attributionEmitted = true; },
        artifact => { artifact.evidenceRows[0].truthStatus = 'confirmed'; }
    ]) {
        const artifact = structuredClone(validArtifact());
        mutate(artifact);
        assert.equal(validateJsonSchema(schema, artifact).valid, false);
    }
});

test('Task 184 historical level is exposed only as coverage context under the clearer name', () => {
    const artifact = validArtifact();
    assert.equal(artifact.task184Context.corroborationCoverageLevel, 'strong');
    assert.equal(artifact.task184Context.contextOnly, true);
    assert.equal(artifact.task184Context.booleansOrCountsCopiedAsDirectionalEvidence, false);
    assert.equal('confirmationEvidenceLevel' in artifact, false);
});
