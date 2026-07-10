import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { validateJsonSchema } from '../tools/lib/json-schema-validator.mjs';
import { createDiscriminationArtifact } from '../tools/emit-death-event-directional-discrimination-evidence.mjs';

const schema = JSON.parse(await readFile('schemas/death-event-directional-discrimination-evidence.schema.json', 'utf8'));

function artifact() {
    const anchor = { eventCandidateKey: 'death_event_candidate_000001', sourceTransitionKey: 'life_transition_000001', participantKey: 'participant_01', heroRefKey: 'hero_ref_01', teamRefKey: 'team_ref_01', normalizedElapsedSecond: 100 };
    return createDiscriminationArtifact({
        replayId: 'replay_010',
        participantIdentity: { replayId: 'replay_010', participants: [{ participantKey: 'participant_01' }] },
        lifeStateTransitions: { replayId: 'replay_010', transitionCandidates: [{ transitionKey: anchor.sourceTransitionKey, participantKey: anchor.participantKey, normalizedElapsedSecond: 100 }] },
        deathEventCandidates: { replayId: 'replay_010', candidates: [anchor] },
        observedTransitions: [
            { transitionKey: 'task186_observation_000001', participantKey: 'participant_01', sourceFamily: 'healthBoundary', family: 'healthBoundary', kind: 'directional', second: 100, direction: 'positive_to_non_positive_boundary_candidate' },
            { transitionKey: 'task186_observation_000002', participantKey: 'participant_01', sourceFamily: 'healthBoundary', family: 'healthBoundary', kind: 'directional', second: 140, direction: 'non_positive_to_positive_boundary_candidate' }
        ],
        observedSecondsByParticipant: new Map([['participant_01', Array.from({ length: 801 }, (_, index) => index)]]),
        replayEndSecond: 800
    }).artifact;
}

test('Task 186 schema accepts policy-safe matched discrimination evidence with Draft 2020-12', () => {
    const result = validateJsonSchema(schema, artifact());
    assert.equal(result.valid, true, result.errors.join('\n'));
    assert.equal(result.draft, '2020-12');
});

test('Task 186 schema closes artifacts, rows, and cohort objects', () => {
    for (const mutate of [
        value => { value.killer = 'participant_01'; },
        value => { value.evidenceRows[0].tick = 100; },
        value => { value.evidenceRows[0].anchorCohort.rawFieldName = 'm_iHealth'; }
    ]) {
        const value = structuredClone(artifact()); mutate(value);
        assert.equal(validateJsonSchema(schema, value).valid, false);
    }
});

test('Task 186 schema keeps final truth and attribution false', () => {
    const value = artifact();
    value.evidenceRows[0].finalFact = true;
    assert.equal(validateJsonSchema(schema, value).valid, false);
});
