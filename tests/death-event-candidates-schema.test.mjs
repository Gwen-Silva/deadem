import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const schema = JSON.parse(await readFile('schemas/death-event-candidates.schema.json', 'utf8'));

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
