import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const ROOT = new URL('../../', import.meta.url);

function readJson(relativePath) {
    return JSON.parse(readFileSync(new URL(relativePath, ROOT), 'utf8'));
}

function readJsonl(relativePath) {
    const text = readFileSync(new URL(relativePath, ROOT), 'utf8').trim();
    return text ? text.split(/\r?\n/u).map(line => JSON.parse(line)) : [];
}

test('canonical outputs expose expected registries, counts, and gate', () => {
    const summary = readJson('output/replay-009-canonical/validation-summary.json');
    const gate = readJson('output/replay-009-canonical/canonical-state-gate.json');
    const players = readJson('output/replay-009-canonical/player-registry.json');
    const entities = readJson('output/replay-009-canonical/entity-registry.json');

    assert.equal(summary.gate, 'replay_009_canonical_factual_state_ready_with_constraints');
    assert.equal(gate.gate, summary.gate);
    assert.equal(players.players.length, 12);
    assert.equal(players.summary.teamDistribution['2'], 6);
    assert.equal(players.summary.teamDistribution['3'], 6);
    assert.equal(players.summary.observedDeaths, 84);
    assert.equal(players.summary.observedReturns, 82);
    assert.equal(players.summary.unresolvedReturnsBeforeReplayEnd, 2);
    assert.equal(entities.entities.length, 80);
    assert.equal(summary.mechanicEffectsApplied, 0);
    assert.equal(summary.spatialStatus, 'unavailable');
});

test('canonical event ids are stable, ordered, and preserve semantic limits', () => {
    const events = readJsonl('output/replay-009-canonical/factual-events.jsonl');
    const ids = new Set(events.map(event => event.eventId));

    assert.equal(ids.size, events.length);
    for (let index = 1; index < events.length; index += 1) {
        const previous = events[index - 1];
        const current = events[index];
        assert.ok((previous.time.demoTick ?? Infinity) <= (current.time.demoTick ?? Infinity));
    }
    assert.ok(events.every(event => event.spatial.status === 'unavailable'));
    assert.ok(events.every(event => event.epistemicStatus.mechanicEffectApplied === false));
    assert.ok(!events.some(event => /destroyed|killed|secured|claimed|deposited/u.test(event.eventType)));
    assert.ok(events.some(event => /!= destroyed|not kill|not destruction/u.test(event.epistemicStatus.semanticLimit)));
});

test('Task 064 validation overlay is event-level and preserves timing uncertainty', () => {
    const overlay = readJson('output/replay-009-canonical/independent-validation-overlay.json');
    const summary = readJson('output/replay-009-canonical/validation-summary.json');
    const unmatched = readJson('output/replay-009-canonical/unmatched-validation-records.json');
    const events = [
        ...readJsonl('output/replay-009-canonical/factual-events.jsonl'),
        ...readJson('output/replay-009-canonical/non-timeline-metadata.json').eventsWithoutParserTimeline
    ];
    const byId = new Map(events.map(event => [event.eventId, event]));

    assert.equal(overlay.overlays.length, 37);
    assert.equal(summary.validationOverlayCount, 37);
    assert.equal(unmatched.unmatchedCount, 0);
    assert.ok(overlay.overlays.every(row => row.timingWindowSeconds.before === 22.782));
    assert.ok(overlay.overlays.every(row => row.timingWindowSeconds.after === 22.782));

    const visuallyValidated = overlay.overlays.filter(row => ['visually_confirmed', 'source_supported'].includes(row.comparisonStatus));
    assert.equal(visuallyValidated.length, 10);
    for (const row of visuallyValidated) {
        assert.ok(byId.get(row.canonicalEventId).independentValidation.available);
    }

    const midBossAll = events.filter(event => event.subject.mechanicId === 'mid_boss');
    const midBossValidated = midBossAll.filter(event => event.independentValidation.available);
    assert.equal(midBossValidated.length, 4);
    assert.ok(midBossAll.length > midBossValidated.length);
});

test('capability matrix keeps constrained and blocked capabilities explicit', () => {
    const matrix = readJson('output/replay-009-canonical/capability-matrix.json');
    const byCapability = Object.fromEntries(matrix.capabilities.map(row => [row.capability, row]));

    assert.equal(byCapability['Mid Boss raw state'].status, 'ready_with_constraints');
    assert.equal(byCapability['Guardian raw state'].status, 'ready_with_constraints');
    assert.equal(byCapability['Barrack/BossTier3/TrooperBoss raw state'].status, 'partial');
    assert.equal(byCapability['Spirit Urn candidate observability'].status, 'partial');
    assert.equal(byCapability['Rejuvenator observability'].status, 'unavailable');
    assert.equal(byCapability['spatial regions'].status, 'unavailable');
    assert.equal(byCapability['mechanic activation'].status, 'blocked');
    assert.equal(byCapability['macro interpretation'].status, 'blocked');
});

test('snapshots carry factual state without interpolation or mechanic effects', () => {
    const snapshots = readJsonl('output/replay-009-canonical/snapshots.jsonl');

    assert.ok(snapshots.length > 100);
    assert.ok(snapshots.every(snapshot => snapshot.spatialStatus === 'unavailable'));
    assert.ok(snapshots.every(snapshot => snapshot.mechanicEffectsApplied === false));
    assert.ok(snapshots.some(snapshot => Object.values(snapshot.players).some(player => player.carried === true)));
    assert.ok(snapshots.some(snapshot => snapshot.teamNetWorth.expiryPolicy === 'not_interpolated'));
});

test('query utility returns provenance, validation, spatial, and mechanic status', () => {
    const output = execFileSync(process.execPath, [
        'tools/query-replay-state.mjs',
        '--replay',
        'replay_009',
        '--mechanic',
        'mid_boss',
        '--independently-validated'
    ], { cwd: new URL('../../', import.meta.url), encoding: 'utf8' });
    const parsed = JSON.parse(output);

    assert.equal(parsed.gate, 'replay_009_canonical_factual_state_ready_with_constraints');
    assert.equal(parsed.mechanicEffectsApplied, 0);
    assert.equal(parsed.spatialStatus, 'unavailable');
    assert.ok(parsed.resultCount > 0);
    assert.ok(parsed.results.every(row => row.provenance.sourceTaskId === '063'));
    assert.ok(parsed.results.every(row => row.videoSynchronizationUncertainty.before === 22.782));
    assert.ok(parsed.results.every(row => row.mechanicEffectApplied === false));
});

test('replay 005 and bot fixtures are excluded', () => {
    const summary = readJson('output/replay-009-canonical/validation-summary.json');

    assert.equal(summary.replay005Protection, 'not_processed_or_inspected');
    assert.equal(summary.botFixtureExclusion, 'not_processed_or_inspected');
});
