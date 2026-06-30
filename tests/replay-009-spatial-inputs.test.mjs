import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

const ROOT = new URL('../', import.meta.url);
const OUT = 'output/replay-009-spatial-inputs';

function readJson(relativePath) {
    return JSON.parse(readFileSync(new URL(relativePath, ROOT), 'utf8'));
}

function allJsonText() {
    return readdirSync(new URL(`${OUT}/`, ROOT))
        .filter(file => file.endsWith('.json'))
        .map(file => readFileSync(new URL(`${OUT}/${file}`, ROOT), 'utf8'))
        .join('\n');
}

test('source inventories are normalized and provenance-complete', () => {
    const local = readJson(`${OUT}/local-source-inventory.json`);
    const external = readJson(`${OUT}/external-source-inventory.json`);

    assert.ok(local.sources.length >= 8);
    assert.ok(external.sources.length >= 3);
    assert.ok(local.sources.every(source => source.sourceId && source.sourceType && source.path));
    assert.ok(local.sources.every(source => !/^[A-Z]:[\\/]/i.test(source.path)), 'local paths must not be absolute Windows paths');
    assert.ok(local.sources.every(source => Array.isArray(source.licenseOrUsageNotes)));
    assert.ok(local.sources.some(source => source.sourceType === 'installed_game_map_package' && source.commitAllowed === false));
    assert.ok(external.sources.every(source => source.sourceId && source.sourceReference && source.trustLevel));
    assert.ok(external.sources.every(source => Array.isArray(source.licenseOrUsageNotes)));
});

test('chronology preserves uncertainty around build 23916427', () => {
    const chronology = readJson(`${OUT}/map-version-chronology.json`);
    const replayEntry = chronology.entries.find(entry => entry.buildOrPatchId === '23916427');
    const installedEntry = chronology.entries.find(entry => entry.changeType === 'installed game metadata');

    assert.ok(replayEntry);
    assert.equal(replayEntry.spatialImpact, 'unknown');
    assert.ok(installedEntry);
    assert.ok(installedEntry.limitations.some(text => text.includes('not used as build compatibility proof')));
});

test('geometry candidates are inputs only, not accepted transforms or regions', () => {
    const geometry = readJson(`${OUT}/geometry-candidate-inventory.json`);
    const feasibility = readJson(`${OUT}/calibration-feasibility.json`);
    const summary = readJson(`${OUT}/acquisition-summary.json`);

    assert.ok(geometry.candidates.some(candidate => candidate.geometryId === 'geom_installed_dl_midtown_vpk'));
    assert.ok(geometry.candidates.every(candidate => candidate.usableForRegionAuthoring === false));
    assert.equal(feasibility.transformFittingPerformed, false);
    assert.equal(feasibility.simplestFeasibleTransformClass, 'none_yet');
    assert.ok(feasibility.models.every(model => model.feasibility === 'not_ready'));
    assert.equal(summary.transformFittingPerformed, false);
});

test('anchor inventory rejects prohibited shortcut anchors', () => {
    const anchors = readJson(`${OUT}/calibration-anchor-inventory.json`).anchors;
    const supported = anchors.filter(anchor => anchor.identityStatus === 'supported');
    const rejected = anchors.filter(anchor => anchor.identityStatus === 'rejected');

    assert.ok(supported.length >= 2);
    assert.ok(rejected.some(anchor => anchor.anchorType === 'spawn_cluster_inference'));
    assert.ok(rejected.some(anchor => anchor.anchorType === 'symmetry_assumption'));
    assert.ok(anchors.every(anchor => anchor.usableForCalibration === false));
});

test('gate and protections preserve acquisition-only boundaries', () => {
    const gate = readJson(`${OUT}/acquisition-gate.json`);
    const summary = readJson(`${OUT}/acquisition-summary.json`);

    assert.equal(gate.gate, 'replay_009_map_geometry_inputs_ready_with_limitations');
    assert.equal(summary.installedBuildRelationship, 'newer_build_only');
    assert.equal(summary.protections.replay005Read, false);
    assert.equal(summary.protections.replay005Processed, false);
    assert.equal(summary.protections.botFixturesProcessed, false);
    assert.equal(summary.protections.laneLabelsEmitted, false);
    assert.equal(summary.protections.spatialSemanticEventsEmitted, false);
});

test('committed outputs contain no absolute local paths or spatial products', () => {
    const text = allJsonText();

    assert.equal(/[A-Z]:[\\/]/.test(text), false);
    assert.equal(text.includes('lane_occupancy'), false);
    assert.equal(text.includes('objective_proximity_event'), false);
    assert.equal(text.includes('macro_interpretation'), false);
});
