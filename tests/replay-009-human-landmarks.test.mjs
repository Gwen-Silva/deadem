import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

const ROOT = new URL('../', import.meta.url);

function readJson(relativePath) {
    return JSON.parse(readFileSync(new URL(relativePath, ROOT), 'utf8'));
}

function allOutputText() {
    const dirs = ['output/replay-009-human-annotations', 'output/replay-009-independent-landmarks'];
    return dirs.flatMap(dir => readdirSync(new URL(`${dir}/`, ROOT))
        .filter(file => file.endsWith('.json'))
        .map(file => readFileSync(new URL(`${dir}/${file}`, ROOT), 'utf8'))).join('\n');
}

test('human annotation packet preserves advisory source provenance', () => {
    const packet = readJson('output/replay-009-human-annotations/annotation-packet.json');
    const summary = readJson('output/replay-009-human-annotations/annotation-summary.json');

    assert.equal(packet.source.annotationSourceId, 'user_replay_009_participant_2026_07_01');
    assert.equal(packet.source.sourceType, 'human_player_annotation');
    assert.equal(packet.source.authority, 'advisory');
    assert.equal(packet.source.independenceFromParser, true);
    assert.equal(packet.source.independenceFromMatchDataOrigin, false);
    assert.equal(packet.source.mayValidateExactCoordinates, false);
    assert.equal(summary.participant, 'Aresius');
    assert.equal(summary.hero, 'Warden');
});

test('human events remain human times and do not overwrite canonical facts', () => {
    const events = readJson('output/replay-009-human-annotations/event-annotations.json').events;
    const pause = events.find(event => event.eventType === 'human_reported_pause_for_lane_swapping');
    const midBoss = events.find(event => event.eventType === 'human_reported_mid_boss_defeated');

    assert.equal(events.length, 17);
    assert.ok(events.every(event => event.canonicalFactStatus === 'not_integrated'));
    assert.ok(events.every(event => event.parserSeconds === null));
    assert.ok(events.every(event => event.requiresTechnicalCorrelation === true));
    assert.equal(pause.humanReportedGameTime, '00:06');
    assert.equal(midBoss.humanReportedGameTime, '25:15');
    assert.notEqual(midBoss.eventType, 'mid_boss_killed');
});

test('mechanics annotations are not applied to build 23916427', () => {
    const mechanics = readJson('output/replay-009-human-annotations/mechanics-annotations.json');
    const personalRejuv = mechanics.mechanics.find(row => row.annotationId === 'hypothesis_personal_rejuvenator_class');

    assert.equal(mechanics.mechanics.length, 13);
    assert.ok(mechanics.mechanics.every(row => row.mechanicEffectApplied === false));
    assert.ok(mechanics.mechanics.every(row => row.applicabilityToReplayBuild === 'likely_but_not_version_validated'));
    assert.equal(personalRejuv.versionStatus, 'hypothesis');
    assert.ok(mechanics.internalClassUncertainty.includes('CNPC_BarrackBoss identity unresolved'));
});

test('image discovery records missing user-supplied images precisely', () => {
    const inventory = readJson('output/replay-009-human-annotations/image-source-inventory.json');
    const geometry = readJson('output/replay-009-independent-landmarks/image-geometry-inventory.json');

    assert.equal(inventory.matchingUserMapImagesFound, 0);
    assert.equal(inventory.expectedImages.length, 5);
    assert.ok(inventory.expectedImages.every(image => image.locallyAccessible === false));
    assert.ok(geometry.images.every(image => image.width === null && image.height === null));
});

test('landmark coordinate acquisition remains missing without images', () => {
    const coordinates = readJson('output/replay-009-independent-landmarks/map-image-landmark-coordinates.json');
    const accepted = readJson('output/replay-009-independent-landmarks/accepted-map-landmarks.json');
    const distribution = readJson('output/replay-009-independent-landmarks/landmark-distribution-audit.json');
    const gate = readJson('output/replay-009-independent-landmarks/acquisition-gate.json');

    assert.equal(coordinates.landmarks.length, 0);
    assert.equal(accepted.landmarks.length, 0);
    assert.equal(accepted.reservedValidationAnchor, null);
    assert.equal(distribution.readyThresholdMet, false);
    assert.equal(gate.gate, 'replay_009_independent_landmark_coordinates_missing');
});

test('outputs preserve no-transform and no-spatial-semantics boundaries', () => {
    const summary = readJson('output/replay-009-independent-landmarks/acquisition-summary.json');
    const text = allOutputText();

    assert.equal(summary.transformFitted, false);
    assert.equal(summary.lanesRegionsProximityEmitted, false);
    assert.equal(summary.mechanicEffectsApplied, 0);
    assert.equal(summary.protections.replay005Read, false);
    assert.equal(summary.protections.botFixturesProcessed, false);
    assert.equal(/[A-Z]:[\\/]/.test(text), false);
});
