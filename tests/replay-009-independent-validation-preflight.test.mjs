import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const ROOT = new URL('../', import.meta.url);

function readJson(relativePath) {
    return JSON.parse(readFileSync(new URL(relativePath, ROOT), 'utf8'));
}

test('independent source inventory selects the replay 009 video with limitations', () => {
    const inventory = readJson('output/replay-009-validation/independent-source-inventory.json');
    const video = readJson('output/replay-009-validation/video-metadata.json');
    const summary = readJson('output/replay-009-validation/independent-validation-summary.json');
    const gate = readJson('output/replay-009-validation/independent-validation-gate.json');

    assert.equal(inventory.decision, 'independent_source_available_with_limitations');
    assert.equal(inventory.selectedSource.filename, 'replay_009_independent_validation.mp4.mp4');
    assert.equal(inventory.selectedSource.identityStatus, 'supported');
    assert.equal(inventory.selectedSource.independentFromProductionParser, true);
    assert.equal(
        inventory.selectedSource.independenceScope,
        'independent visual rendering path; not independent match data origin'
    );
    assert.equal(video.opened, true);
    assert.equal(video.integrity.canDecode, true);
    assert.equal(video.width, 2580);
    assert.equal(video.height, 1080);
    assert.ok(video.durationSeconds > 2100);
    assert.equal(summary.videoIdentityResult, 'supported');
    assert.equal(gate.gate, 'replay_009_objective_structure_events_independently_validated_with_gaps');
    assert.equal(gate.comparisonPerformed, true);
    assert.equal(gate.mechanicEffectsApplied, 0);
});

test('inventory rejects the wrong-match replay 006 video', () => {
    const inventory = readJson('output/replay-009-validation/independent-source-inventory.json');
    const byId = Object.fromEntries(inventory.rejectedSources.map(source => [ source.sourceId, source ]));

    assert.match(byId.samples_partida_006_video.reason, /replay 006/);
});

test('video synchronization and event comparison preserve bounded confidence', () => {
    const sync = readJson('output/replay-009-validation/source-synchronization.json');
    const sample = readJson('output/replay-009-validation/validation-sample.json');
    const summary = readJson('output/replay-009-validation/independent-validation-summary.json');
    const allowedStatuses = new Set([
        'visually_confirmed',
        'source_supported',
        'source_contradicted',
        'not_visible',
        'outside_source_coverage',
        'timing_ambiguous',
        'identity_ambiguous',
        'not_comparable'
    ]);
    const comparisons = readFileSync(new URL('output/replay-009-validation/event-source-comparison.jsonl', ROOT), 'utf8')
        .trim()
        .split('\n')
        .filter(Boolean)
        .map(line => JSON.parse(line));

    assert.equal(sync.synchronizationStatus, 'usable_with_constraints');
    assert.equal(sync.anchors.length, 4);
    assert.equal(sync.selectedMapping.type, 'linear');
    assert.ok(sync.selectedMapping.medianResidualSeconds >= 0);
    assert.ok(sync.selectedMapping.maximumResidualSeconds >= sync.selectedMapping.medianResidualSeconds);
    assert.equal(sample.sampledEventCount, 37);
    assert.equal(comparisons.length, sample.sampledEventCount);
    assert.ok(comparisons.every(record => allowedStatuses.has(record.comparisonStatus)));
    assert.equal(summary.contradictedEvents, 0);
    assert.equal(summary.confirmedEvents, 2);
    assert.equal(summary.supportedEvents, 8);
    assert.equal(summary.categorySummary.find(row => row.category === 'mid_boss').overallStatus, 'validated_with_constraints');
    assert.equal(summary.categorySummary.find(row => row.category === 'guardian').overallStatus, 'not_observable');
    assert.equal(summary.categorySummary.find(row => row.category === 'boss_tier3').sampledEvents, 1);
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
    assert.equal(inventory.botFixtureExclusion, 'not_processed_or_inspected');
    assert.equal(summary.botFixtureExclusion, 'not_processed_or_inspected');
    assert.equal(gate.comparisonPerformed, true);
    assert.equal(gate.mechanicEffectsApplied, 0);
});
