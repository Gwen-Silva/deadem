import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { validateJsonSchema } from '../tools/lib/json-schema-validator.mjs';
import { createCorroborationArtifact } from '../tools/emit-death-event-corroboration-evidence.mjs';

const schema = JSON.parse(await readFile('schemas/death-event-corroboration-evidence.schema.json', 'utf8'));

function sourceArtifacts() {
    return {
        replayId: 'replay_010',
        participantIdentity: {
            participants: [{ participantKey: 'participant_01', heroRefKey: 'hero_ref_01', teamRefKey: 'team_ref_01' }]
        },
        lifeStateTransitions: {
            transitionCandidates: [{ transitionKey: 'life_transition_000001', participantKey: 'participant_01', normalizedElapsedSecond: 20 }]
        },
        deathEventCandidates: {
            candidates: [{
                eventCandidateKey: 'death_event_candidate_000001',
                sourceTransitionKey: 'life_transition_000001',
                participantKey: 'participant_01',
                heroRefKey: 'hero_ref_01',
                teamRefKey: 'team_ref_01',
                normalizedElapsedSecond: 20
            }]
        },
        signalTransitions: [{
            signalKey: 'observed_signal_000001',
            participantKey: 'participant_01',
            category: 'life',
            normalizedElapsedSecond: 21
        }]
    };
}

function validArtifact() {
    return createCorroborationArtifact(sourceArtifacts()).artifact;
}

test('corroboration schema accepts candidate-only policy-safe evidence', () => {
    const result = validateJsonSchema(schema, validArtifact());
    assert.equal(result.valid, true, result.errors.join('\n'));
    assert.equal(result.draft, '2020-12');
});

test('corroboration schema enforces additionalProperties at artifact and row levels', () => {
    const artifactExtra = structuredClone(validArtifact());
    artifactExtra.unexpected = true;
    assert.equal(validateJsonSchema(schema, artifactExtra).valid, false);

    const rowExtra = structuredClone(validArtifact());
    rowExtra.evidenceRows[0].killer = 'participant_02';
    assert.equal(validateJsonSchema(schema, rowExtra).valid, false);
});

test('corroboration schema rejects final facts, attribution, raw time, patterns, and missing properties', () => {
    const mutations = [
        artifact => { artifact.evidenceRows[0].finalFact = true; },
        artifact => { artifact.evidenceRows[0].victim = 'participant_01'; },
        artifact => { artifact.evidenceRows[0].tick = 100; },
        artifact => { artifact.timestamp = 100; },
        artifact => { artifact.evidenceRows[0].participantKey = 'raw_participant'; },
        artifact => { delete artifact.evidenceRows[0].confirmationStatus; }
    ];
    for (const mutate of mutations) {
        const artifact = structuredClone(validArtifact());
        mutate(artifact);
        assert.equal(validateJsonSchema(schema, artifact).valid, false);
    }
});

test('corroboration row persists only normalized deltas and unconfirmed status', () => {
    const row = validArtifact().evidenceRows[0];
    assert.equal(row.lifeSignalChangeCandidateObserved, true);
    assert.equal(row.normalizedLifeSignalDeltaSecond, 1);
    assert.equal(row.confirmationStatus, 'unconfirmed');
    assert.equal(row.finalFact, false);
    assert.equal('rawTick' in row, false);
    assert.equal('fieldValues' in row, false);
});
