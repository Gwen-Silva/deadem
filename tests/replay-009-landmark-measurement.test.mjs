import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';

const ROOT = new URL('../', import.meta.url);

function readJson(relativePath) {
    return JSON.parse(readFileSync(new URL(relativePath, ROOT), 'utf8'));
}

function outputText() {
    const dir = new URL('output/replay-009-landmark-measurement/', ROOT);
    return readdirSync(dir)
        .filter(file => file.endsWith('.json'))
        .map(file => readFileSync(new URL(`output/replay-009-landmark-measurement/${file}`, ROOT), 'utf8'))
        .join('\n');
}

test('image inventory classifies supplied local-only images', () => {
    const inventory = readJson('output/replay-009-landmark-measurement/image-inventory.json');
    const summary = readJson('output/replay-009-landmark-measurement/measurement-summary.json');

    assert.equal(inventory.images.length, 8);
    assert.equal(summary.imagesFound, 8);
    assert.equal(summary.rolesClassified.user_modded_minimap, 5);
    assert.equal(summary.rolesClassified.replay_observed_standard_minimap, 1);
    assert.equal(summary.rolesClassified.derived_landmark_map, 1);
    assert.equal(summary.rolesClassified.mechanic_spawn_diagram, 1);
    assert.ok(inventory.images.every(image => image.commitAllowed === false));
    assert.ok(inventory.images.every(image => !/^[A-Z]:[\\/]/.test(image.relativePath)));
});

test('image hashes and dimensions are populated', () => {
    const inventory = readJson('output/replay-009-landmark-measurement/image-inventory.json');
    const standard = inventory.images.find(image => image.imageId === 'img_standard_replay_minimap');
    const derived = inventory.images.find(image => image.imageId === 'img_derived_landmark_map');
    const diagram = inventory.images.find(image => image.imageId === 'img_urn_spawn_diagram');

    assert.ok(inventory.images.every(image => /^[a-f0-9]{64}$/.test(image.sha256)));
    assert.equal(standard.dimensions.width, 380);
    assert.equal(standard.dimensions.height, 382);
    assert.equal(derived.dimensions.width, 1189);
    assert.equal(derived.dimensions.height, 883);
    assert.equal(diagram.dimensions.width, 1536);
    assert.equal(diagram.dimensions.height, 354);
});

test('landmark measurements stay within pixel and normalized bounds', () => {
    const inventory = readJson('output/replay-009-landmark-measurement/image-inventory.json');
    const measured = readJson('output/replay-009-landmark-measurement/measured-landmarks.json');
    const imageById = new Map(inventory.images.map(image => [image.imageId, image]));

    assert.equal(measured.landmarks.length, 34);
    for (const landmark of measured.landmarks) {
        const image = imageById.get(landmark.imageId);
        assert.ok(image, `missing image for ${landmark.landmarkId}`);
        assert.ok(landmark.pixelCoordinate.x >= 0 && landmark.pixelCoordinate.x <= image.dimensions.width);
        assert.ok(landmark.pixelCoordinate.y >= 0 && landmark.pixelCoordinate.y <= image.dimensions.height);
        assert.ok(landmark.normalizedCoordinate.x >= 0 && landmark.normalizedCoordinate.x <= 1);
        assert.ok(landmark.normalizedCoordinate.y >= 0 && landmark.normalizedCoordinate.y <= 1);
        assert.ok(landmark.uncertaintyRadiusPixels > 0);
    }
});

test('mid boss and walker landmarks are measured and anchor split is preregistered', () => {
    const measured = readJson('output/replay-009-landmark-measurement/measured-landmarks.json');
    const plan = readJson('output/replay-009-landmark-measurement/fit-validation-anchor-plan.json');

    const midBoss = measured.landmarks.filter(row => row.landmarkType === 'mid_boss_center');
    const walkers = measured.landmarks.filter(row => row.landmarkType === 'walker');
    assert.equal(midBoss.length, 2);
    assert.equal(walkers.length, 12);
    assert.equal(plan.transformFitted, false);
    assert.equal(plan.residualsComputed, false);
    assert.equal(plan.candidateFitAnchors.length, 5);
    assert.equal(plan.reservedValidationAnchors.length, 2);
    assert.equal(plan.candidateFitAnchors.some(anchor => plan.reservedValidationAnchors.includes(anchor)), false);
    assert.equal(plan.distribution.status, 'distributed_with_visual_measurement_limitations');
});

test('cross-image registration is limited and not a world transform', () => {
    const registration = readJson('output/replay-009-landmark-measurement/cross-image-registration.json');

    assert.equal(registration.result, 'same_underlying_geometry_with_crop_scale_limitations');
    assert.equal(registration.projectedAnnotationsBetweenImages, false);
    assert.equal(registration.sharedProperties.projection, 'not_metric_or_world_transform');
    assert.ok(registration.limitations.some(text => text.includes('No replay world coordinate')));
});

test('correspondence candidates preserve unresolved walker pairing', () => {
    const candidates = readJson('output/replay-009-landmark-measurement/replay-landmark-correspondence-candidates.json');
    const midBoss = candidates.candidates.find(row => row.candidateId === 'corr_mid_boss_center');
    const walkers = candidates.candidates.find(row => row.candidateId === 'corr_six_walkers_unordered');

    assert.equal(midBoss.replayEntityKeys.length, 2);
    assert.equal(walkers.replayEntityKeys.length, 6);
    assert.equal(walkers.identityConfidence, 'candidate');
    assert.ok(walkers.limitations.some(text => text.includes('does not solve which replay Walker entity')));
    assert.ok(candidates.rejected.some(row => row.candidateId === 'rejected_spirit_urn_spawn_points'));
});

test('gate and protections preserve no-transform boundaries', () => {
    const gate = readJson('output/replay-009-landmark-measurement/measurement-gate.json');
    const summary = readJson('output/replay-009-landmark-measurement/measurement-summary.json');
    const text = outputText();

    assert.equal(gate.gate, 'replay_009_independent_landmark_coordinates_ready_with_limitations');
    assert.equal(summary.transformFitted, false);
    assert.equal(summary.lanesRegionsProximityEmitted, false);
    assert.equal(summary.mechanicEffectsApplied, 0);
    assert.equal(summary.protections.replay005Read, false);
    assert.equal(summary.protections.botFixturesProcessed, false);
    assert.equal(/[A-Z]:[\\/]/.test(text), false);
});
