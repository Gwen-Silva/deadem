import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const schema = JSON.parse(await readFile('schemas/life-state-transition-candidates.schema.json', 'utf8'));

test('life-state transition schema is strict and policy-safe', () => {
    assert.equal(schema.additionalProperties, false);
    assert.equal(schema.properties.artifactClass.const, 'life_state_transition_candidates');
    assert.equal(schema.properties.generatedAt.const, 'task_182');
    assert.equal(schema.properties.rawDataCaptured.const, false);
    assert.equal(schema.properties.fieldValuesCaptured.const, false);
    assert.equal(schema.properties.rawTicksIncluded.const, false);
    assert.equal(schema.properties.rawTimestampsIncluded.const, false);
    assert.equal(schema.properties.finalFactsProduced.const, false);
    assert.equal(schema.properties.gameplayInterpretationProduced.const, false);
    assert.equal(schema.properties.transitionCandidates.minItems, 1);
});

test('transition rows allow only synthetic participant and normalized time references', () => {
    const row = schema.$defs.transitionCandidate;
    assert.equal(row.additionalProperties, false);
    assert.equal(row.properties.participantKey.pattern, '^participant_[0-9]{2}$');
    assert.equal(row.properties.transitionKey.pattern, '^life_transition_[0-9]{6}$');
    assert.equal(row.properties.timeRefKey.pattern, '^time_ref_[0-9]{6}$');
    assert.equal(row.properties.transitionType.const, 'death_counter_increment_candidate');
    assert.equal(row.properties.sourceSignal.const, 'controller_death_counter_increment');
    assert.equal(row.properties.finalFact.const, false);
    assert.equal(row.properties.normalizedElapsedSecond.type, 'integer');
    assert.ok(!row.properties.tick);
    assert.ok(!row.properties.timestamp);
    assert.ok(!row.properties.entityId);
    assert.ok(!row.properties.playerSlot);
});

test('schema blocks final-event and attribution readiness', () => {
    assert.equal(schema.properties.deathValidationBridge.properties.canUseAsFinalDeathEventSource.const, false);
    assert.equal(schema.properties.readiness.properties.readyForCanonicalDeathEventEmission.const, false);
    assert.equal(schema.properties.readiness.properties.readyForAttribution.const, false);
    assert.equal(schema.properties.readiness.properties.readyForTeamfightDetection.const, false);
});
