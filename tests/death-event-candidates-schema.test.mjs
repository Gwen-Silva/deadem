import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { validateJsonSchema } from '../tools/lib/json-schema-validator.mjs';
import { createDeathEventCandidateArtifact } from '../tools/emit-death-event-candidates.mjs';

const schema = JSON.parse(await readFile('schemas/death-event-candidates.schema.json', 'utf8'));

function validArtifact() {
    return createDeathEventCandidateArtifact({
        replayId: 'replay_010',
        participantIdentity: {
            participants: [{ participantKey: 'participant_01', heroRefKey: 'hero_ref_01', teamRefKey: 'team_ref_01' }]
        },
        lifeStateTransitions: {
            transitionCandidates: [{
                transitionKey: 'life_transition_000001',
                participantKey: 'participant_01',
                normalizedElapsedSecond: 10,
                candidateConfidence: 'high'
            }]
        }
    });
}

test('death-event candidate schema is strict and policy-safe', () => {
    assert.equal(schema.additionalProperties, false);
    assert.equal(schema.properties.artifactClass.const, 'death_event_candidates');
    assert.equal(schema.properties.generatedAt.const, 'task_183');
    assert.equal(schema.properties.rawDataCaptured.const, false);
    assert.equal(schema.properties.fieldValuesCaptured.const, false);
    assert.equal(schema.properties.rawTicksIncluded.const, false);
    assert.equal(schema.properties.rawTimestampsIncluded.const, false);
    assert.equal(schema.properties.finalFactsProduced.const, false);
    assert.equal(schema.properties.gameplayInterpretationProduced.const, false);
    assert.equal(schema.properties.attributionEmitted.const, false);
    assert.equal(schema.properties.candidates.minItems, 1);
});

test('candidate rows expose only synthetic refs and normalized time', () => {
    const row = schema.$defs.deathEventCandidate;
    assert.equal(row.additionalProperties, false);
    assert.equal(row.properties.eventCandidateKey.pattern, '^death_event_candidate_[0-9]{6}$');
    assert.equal(row.properties.participantKey.pattern, '^participant_[0-9]{2}$');
    assert.equal(row.properties.heroRefKey.pattern, '^hero_ref_(?:[0-9]{2}|unknown_[0-9]{2})$');
    assert.equal(row.properties.teamRefKey.pattern, '^team_ref_(?:[0-9]{2}|unknown_[0-9]{2})$');
    assert.equal(row.properties.sourceEvidenceType.const, 'controller_death_counter_increment_candidate');
    assert.equal(row.properties.deathTruthStatus.const, 'unconfirmed_candidate');
    assert.equal(row.properties.finalFact.const, false);
    assert.ok(!row.properties.killer);
    assert.ok(!row.properties.victim);
    assert.ok(!row.properties.tick);
    assert.ok(!row.properties.timestamp);
});

test('schema blocks final death, attribution, and teamfight readiness', () => {
    assert.equal(schema.properties.readiness.properties.readyForDeathEventCandidateConsumption.const, true);
    assert.equal(schema.properties.readiness.properties.readyForFinalDeathEventEmission.const, false);
    assert.equal(schema.properties.readiness.properties.readyForAttribution.const, false);
    assert.equal(schema.properties.readiness.properties.readyForTeamfightDetection.const, false);
});

test('Draft 2020-12 validation enforces additionalProperties at artifact and row levels', () => {
    const artifactExtra = structuredClone(validArtifact());
    artifactExtra.unexpected = true;
    assert.equal(validateJsonSchema(schema, artifactExtra).valid, false);

    const rowExtra = structuredClone(validArtifact());
    rowExtra.candidates[0].killer = 'participant_02';
    assert.equal(validateJsonSchema(schema, rowExtra).valid, false);
});

test('Draft 2020-12 validation rejects required, const, pattern, attribution, and time violations', () => {
    const mutations = [
        artifact => { delete artifact.candidates[0].participantKey; },
        artifact => { artifact.candidates[0].finalFact = true; },
        artifact => { artifact.candidates[0].eventCandidateKey = 'raw-id'; },
        artifact => { artifact.candidates[0].victim = 'participant_01'; },
        artifact => { artifact.candidates[0].tick = 123; },
        artifact => { artifact.timestamp = 456; }
    ];
    for (const mutate of mutations) {
        const artifact = structuredClone(validArtifact());
        mutate(artifact);
        assert.equal(validateJsonSchema(schema, artifact).valid, false);
    }
});
