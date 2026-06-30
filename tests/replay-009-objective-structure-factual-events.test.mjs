import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const ROOT = new URL('../', import.meta.url);

function readJson(relativePath) {
    return JSON.parse(readFileSync(new URL(relativePath, ROOT), 'utf8'));
}

function readJsonl(relativePath) {
    const text = readFileSync(new URL(relativePath, ROOT), 'utf8').trim();
    return text ? text.split(/\r?\n/).map(line => JSON.parse(line)) : [];
}

test('task 063 emits bounded factual events from task 062 observability', () => {
    const summary = readJson('output/replay-009-states/objective-structure-event-summary.json');
    const gate = readJson('output/replay-009-states/objective-structure-event-gate.json');

    assert.equal(summary.entityGenerationsNormalized, 56);
    assert.equal(summary.factualEventsEmitted, 583);
    assert.equal(summary.duplicateEventsRemoved, 0);
    assert.equal(summary.lifecycleViolations, 0);
    assert.equal(gate.gate, 'replay_009_objective_structure_factual_events_ready_with_gaps');
    assert.equal(gate.mechanicEffectsApplied, 0);
});

test('supported mechanics produce factual events while Urn remains candidate-only', () => {
    const midBoss = readJsonl('output/replay-009-states/mid-boss-factual-events.jsonl');
    const guardian = readJsonl('output/replay-009-states/guardian-factual-events.jsonl');
    const urn = readJsonl('output/replay-009-states/urn-candidate-events.jsonl');
    const rejuvenator = readJsonl('output/replay-009-states/rejuvenator-candidate-events.jsonl');

    assert.ok(midBoss.some(event => event.eventType === 'entity_deleted'));
    assert.ok(midBoss.some(event => event.eventType === 'health_observed'));
    assert.ok(guardian.some(event => event.eventType === 'team_observed'));
    assert.ok(urn.length > 0);
    assert.ok(urn.every(event => event.eventType.startsWith('candidate_')));
    assert.equal(rejuvenator.length, 0);
});

test('events preserve semantic limits and do not assert effects or strategic outcomes', () => {
    const events = readJsonl('output/replay-009-states/objective-structure-factual-events.jsonl');
    assert.ok(events.length > 0);

    for (const event of events) {
        assert.ok(event.semanticLimit);
        assert.equal(event.warnings.includes('mechanic effects not applied'), true);
        assert.notEqual(event.eventType, 'killed');
        assert.notEqual(event.eventType, 'destroyed');
        assert.notEqual(event.eventType, 'secured');
        assert.notEqual(event.eventType, 'claimed');
        assert.notEqual(event.eventType, 'deposited');
    }
});

test('terminal sequences are descriptive, not kill or destruction conclusions', () => {
    const terminal = readJson('output/replay-009-states/objective-structure-terminal-sequences.json');
    const midBoss = terminal.summary.mid_boss;
    const walker = terminal.summary.walker;

    assert.deepEqual(midBoss.terminalSequences, { deleted_without_observed_zero: 2 });
    assert.equal(walker.terminalSequences.deleted_without_observed_zero, 4);
    assert.equal(walker.terminalSequences.present_until_replay_end, 2);
    assert.ok(terminal.entities.every(entity => entity.semanticLimit.includes('not a kill')));
});

test('Task 060 extensions keep mechanic activation blocked', () => {
    const mechanicResults = readJson('output/replay-009-states/mechanic-state-results.json');
    const activation = readJson('output/replay-009-states/activation-readiness-matrix.json');
    const stateSummary = readJson('output/replay-009-states/state-detection-summary.json');

    const midBoss = mechanicResults.mechanics.find(mechanic => mechanic.mechanicId === 'mid_boss');
    const coreStructures = mechanicResults.mechanics.find(mechanic => mechanic.mechanicId === 'core_structures');
    assert.equal(midBoss.factualStateDetection, 'ready_with_constraints');
    assert.equal(coreStructures.factualStateDetection, 'ready_with_constraints');

    for (const mechanic of activation.mechanics) {
        assert.equal(mechanic.mechanicVersionStatus, 'unresolved');
        assert.equal(mechanic.effectApplicationStatus, 'blocked');
    }
    assert.equal(stateSummary.task063Extension.mechanicEffectsApplied, 0);
});

test('replay 005 and bot fixtures remain excluded', () => {
    const validation = readJson('output/replay-009-states/objective-structure-event-validation.json');
    assert.equal(validation.replay005Protection, 'not_processed_or_inspected');
    assert.equal(validation.botFixtureExclusion, 'not_processed_or_inspected');
});
