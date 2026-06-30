import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { eventMatches } from '../tools/replay-state-filter.mjs';

const ROOT = new URL('../', import.meta.url);

function readJson(relativePath) {
    return JSON.parse(readFileSync(new URL(relativePath, ROOT), 'utf8'));
}

test('inspection generator loads canonical records into static data files', () => {
    const summary = readJson('output/replay-009-inspection/data/generation-summary.json');
    const overview = readJson('output/replay-009-inspection/data/overview.json');
    const events = readJson('output/replay-009-inspection/data/events.json');
    const metadata = readJson('output/replay-009-inspection/data/metadata.json');
    const players = readJson('output/replay-009-inspection/data/players.json');
    const entities = readJson('output/replay-009-inspection/data/entities.json');
    const snapshots = readJson('output/replay-009-inspection/data/snapshots.json');
    const overlays = readJson('output/replay-009-inspection/data/validation-overlays.json');

    assert.equal(summary.gate, 'replay_009_factual_state_inspector_ready_with_constraints');
    assert.equal(summary.canonicalRecordsLoaded, 787);
    assert.equal(events.events.length, 423);
    assert.equal(metadata.eventsWithoutParserTimeline.length, 364);
    assert.equal(players.players.length, 12);
    assert.equal(entities.entities.length, 80);
    assert.equal(snapshots.snapshots.length, 187);
    assert.equal(overlays.overlays.length, 37);
    assert.equal(summary.unmatchedOverlays, 0);
    assert.equal(overview.mechanicEffectsApplied, 0);
    assert.equal(overview.spatialStatus, 'unavailable');
});

test('timeline and metadata remain separated', () => {
    const events = readJson('output/replay-009-inspection/data/events.json').events;
    const metadata = readJson('output/replay-009-inspection/data/metadata.json').eventsWithoutParserTimeline;

    assert.ok(events.every(event => event.time.demoTick !== null || event.time.parserSeconds !== null));
    assert.ok(metadata.every(event => event.time.demoTick === null && event.time.parserSeconds === null));
});

test('shared filters match query utility behavior', () => {
    const events = readJson('output/replay-009-inspection/data/events.json').events;
    const filtered = events.filter(event => eventMatches(event, {
        mechanic: 'mid_boss',
        'independently-validated': true
    }));
    const output = execFileSync(process.execPath, [
        'tools/query-replay-state.mjs',
        '--replay',
        'replay_009',
        '--mechanic',
        'mid_boss',
        '--independently-validated'
    ], { cwd: ROOT, encoding: 'utf8' });
    const query = JSON.parse(output);

    assert.equal(filtered.length, 4);
    assert.equal(query.totalMatchedBeforeLimit, filtered.length);
});

test('players, entities, candidates, and validation overlays preserve labels', () => {
    const players = readJson('output/replay-009-inspection/data/players.json').players;
    const entities = readJson('output/replay-009-inspection/data/entities.json').entities;
    const overlays = readJson('output/replay-009-inspection/data/validation-overlays.json').overlays;

    assert.ok(players.every(player => 'observedDeaths' in player));
    assert.ok(entities.some(entity => entity.classification === 'spirit_urn_candidate'));
    assert.ok(entities.some(entity => entity.classification === 'barrack_boss_candidate'));
    assert.ok(!entities.some(entity => entity.classification === 'patron'));
    assert.ok(!entities.some(entity => entity.classification === 'canonical_spirit_urn'));
    assert.ok(overlays.every(overlay => overlay.timingWindowSeconds.before === 22.782));
    assert.ok(overlays.some(overlay => overlay.comparisonStatus === 'not_visible'));
    assert.ok(overlays.some(overlay => overlay.comparisonStatus === 'identity_ambiguous'));
});

test('static interface exposes required views and epistemic wording', () => {
    const html = readFileSync(new URL('output/replay-009-inspection/index.html', ROOT), 'utf8');
    const app = readFileSync(new URL('output/replay-009-inspection/app.js', ROOT), 'utf8');
    const css = readFileSync(new URL('output/replay-009-inspection/styles.css', ROOT), 'utf8');

    for (const view of ['Overview', 'Capabilities', 'Timeline', 'Snapshots', 'Players', 'Entities', 'Validation', 'Metadata']) {
        assert.match(html, new RegExp(view));
    }
    assert.match(app, /Provenance/u);
    assert.match(app, /candidate-only/u);
    assert.match(app, /visually supported/u);
    assert.match(app, /not interpreted as destruction/u);
    assert.match(css, /:focus/u);
    assert.match(css, /table/u);
});

test('exported factual report includes filters, provenance, and limitations', () => {
    const report = readFileSync(new URL('reports/generated/replay-009-mid-boss-factual-report.md', ROOT), 'utf8');

    assert.match(report, /"mechanic": "mid_boss"/u);
    assert.match(report, /Records matched: 28/u);
    assert.match(report, /Mechanic effects applied: 0/u);
    assert.match(report, /Known unavailable layers/u);
    assert.match(report, /Source:/u);
    assert.doesNotMatch(report, /was strategically ahead|was destroyed|was killed|objective was secured/u);
});

test('inspection outputs keep replay 005 and bot fixtures excluded', () => {
    const summary = readJson('output/replay-009-inspection/data/generation-summary.json');

    assert.equal(summary.replay005Protection, 'not_processed_or_inspected');
    assert.equal(summary.botFixtureExclusion, 'not_processed_or_inspected');
});
