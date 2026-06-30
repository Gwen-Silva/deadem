import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const ROOT = new URL('../', import.meta.url);

function readJson(relativePath) {
    return JSON.parse(readFileSync(new URL(relativePath, ROOT), 'utf8'));
}

test('independent source preflight keeps Task 064 blocked when replay 009 source is missing', () => {
    const inventory = readJson('output/replay-009-validation/independent-source-inventory.json');
    const summary = readJson('output/replay-009-validation/independent-validation-summary.json');
    const gate = readJson('output/replay-009-validation/independent-validation-gate.json');

    assert.equal(inventory.decision, 'independent_source_missing');
    assert.equal(summary.preflightDecision, 'independent_source_missing');
    assert.equal(summary.comparisonPerformed, false);
    assert.equal(gate.gate, 'replay_009_objective_structure_events_validation_blocked');
    assert.equal(gate.taskPromoted, false);
    assert.equal(gate.taskExecuted, false);
});

test('inventory rejects parser-derived outputs and wrong-match video as independent sources', () => {
    const inventory = readJson('output/replay-009-validation/independent-source-inventory.json');
    const byId = Object.fromEntries(inventory.candidates.map(source => [ source.sourceId, source ]));

    assert.equal(byId.task_062_observability_outputs.independentFromProductionParser, false);
    assert.equal(byId.task_063_factual_event_outputs.independentFromProductionParser, false);
    assert.equal(byId.samples_partida_006_video.sourceType, 'recorded_video_wrong_match');
    assert.equal(byId.samples_partida_006_video.quality, 'not_applicable');
    assert.equal(byId.external_parser_oracle_replay_009.available, false);
    assert.equal(byId.manual_replay_009_timeline.available, false);
});

test('Spirit Urn health-zero audit preserves candidate-only limitation', () => {
    const audit = readJson('output/replay-009-validation/spirit-urn-health-zero-audit.json');

    assert.equal(audit.supportedHealthZeroObservationCount, 0);
    assert.equal(audit.candidateHealthZeroSequenceCount, 5);
    assert.equal(audit.conclusion, 'candidate_zero_values_are_not_supported_objective_health_zero_observations');
    assert.ok(audit.records.every(record => record.candidateMechanic === 'spirit_urn'));
    assert.ok(audit.records.every(record => record.zeroValueObserved));
    assert.ok(audit.records.every(record => !record.zeroValueMeaningValidated));
    assert.ok(audit.records.every(record => record.warnings.includes('Do not count this as supported objective health-zero.')));
});

test('replay 005 and bot fixtures remain excluded by preflight outputs', () => {
    const inventory = readJson('output/replay-009-validation/independent-source-inventory.json');
    const summary = readJson('output/replay-009-validation/independent-validation-summary.json');
    const gate = readJson('output/replay-009-validation/independent-validation-gate.json');

    assert.equal(inventory.replay005Protection, 'not_processed_or_inspected');
    assert.equal(summary.replay005Protection, 'not_processed_or_inspected');
    assert.equal(gate.replay005Protection, 'not_processed_or_inspected');
    assert.equal(inventory.botFixtureExclusion, 'not_processed_or_inspected');
    assert.equal(summary.botFixtureExclusion, 'not_processed_or_inspected');
    assert.equal(gate.botFixtureExclusion, 'not_processed_or_inspected');
});
