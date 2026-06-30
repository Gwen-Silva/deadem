import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readJsonl(filePath) {
    const text = fs.readFileSync(filePath, 'utf8').trim();
    return text ? text.split(/\r?\n/).map((line) => JSON.parse(line)) : [];
}

test('task 062 inventories replay 009 classes and candidate lifecycle records', () => {
    const summary = readJson('output/replay-009-states/objective-structure-observability-summary.json');
    assert.equal(summary.gate, 'replay_009_objective_structure_observability_ready_with_gaps');
    assert.ok(summary.classesInventoried > 0);
    assert.ok(summary.serializersInventoried > 0);
    assert.ok(summary.propertiesInventoried > 0);
    assert.ok(summary.lifecycleCandidatesFound > 0);
    assert.equal(summary.replay005Protection, 'not_processed_or_inspected');
    assert.equal(summary.botFixtureExclusion, 'not_processed_or_inspected');
});

test('task 062 preserves Task 060 candidate audit boundary', () => {
    const reclassification = readJson('output/replay-009-states/task-060-candidate-reclassification.json');
    assert.equal(reclassification.summary.reviewed, 4);
    assert.equal(reclassification.summary.upgraded, 2);
    assert.equal(reclassification.summary.rejected, 0);
    assert.equal(reclassification.summary.uncertain, 2);
    const byMechanic = new Map(reclassification.candidates.map((item) => [ item.mechanicId, item ]));
    assert.equal(byMechanic.get('mid_boss').task062Classification, 'supported');
    assert.equal(byMechanic.get('core_structures').task062Classification, 'supported');
    assert.equal(byMechanic.get('spirit_urn').task062Classification, 'uncertain');
    assert.equal(byMechanic.get('rejuvenator').task062Classification, 'uncertain');
});

test('objective and structure observability remains non-spatial and effect-free', () => {
    const gate = readJson('output/replay-009-states/objective-structure-observability-gate.json');
    const summary = readJson('output/replay-009-states/objective-structure-observability-summary.json');
    assert.equal(gate.mechanicEffectsApplied, 0);
    assert.ok(summary.stillProhibitedInferences.includes('spatial linkage'));
    assert.ok(summary.stillProhibitedInferences.includes('mechanic effects'));
    assert.ok(summary.stillProhibitedInferences.includes('macro interpretation'));
});

test('mechanic observability distinguishes supported structures from uncertain Urn/Rejuvenator', () => {
    const observability = readJson('output/replay-009-states/objective-structure-entity-observability.json');
    const byMechanic = new Map(observability.mechanics.map((item) => [ item.mechanicId, item ]));
    assert.equal(byMechanic.get('mid_boss').observabilityStatus, 'ready_with_constraints');
    assert.equal(byMechanic.get('guardian').observabilityStatus, 'ready_with_constraints');
    assert.equal(byMechanic.get('walker').observabilityStatus, 'ready_with_constraints');
    assert.equal(byMechanic.get('patron_base').observabilityStatus, 'ready_with_constraints');
    assert.equal(byMechanic.get('spirit_urn').observabilityStatus, 'partial');
    assert.equal(byMechanic.get('rejuvenator').observabilityStatus, 'partial');
});

test('state readiness blocks uncertain mechanics and allows only constrained factual states', () => {
    const readiness = readJson('output/replay-009-states/objective-structure-state-readiness.json');
    const blockedSpirit = readiness.states.filter((item) => item.mechanicId === 'spirit_urn');
    const blockedRejuvenator = readiness.states.filter((item) => item.mechanicId === 'rejuvenator');
    assert.ok(blockedSpirit.every((item) => item.readiness === 'blocked'));
    assert.ok(blockedRejuvenator.every((item) => item.readiness === 'blocked'));
    assert.ok(readiness.states.some((item) => item.mechanicId === 'mid_boss' && item.stateType === 'health_value' && item.readiness === 'ready_with_constraints'));
});

test('lifecycle candidates are compact JSONL records', () => {
    const rows = readJsonl('output/replay-009-states/objective-structure-lifecycle-candidates.jsonl');
    assert.ok(rows.length > 0);
    assert.ok(rows.every((row) => row.entityIndex !== null));
    assert.ok(rows.every((row) => Array.isArray(row.operations)));
});
