import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

const ROOT = new URL('../', import.meta.url);
const OUT = 'output/replay-009-fixed-entity-resolution';

function readJson(relativePath) {
    return JSON.parse(readFileSync(new URL(relativePath, ROOT), 'utf8'));
}

function readJsonl(relativePath) {
    const text = readFileSync(new URL(relativePath, ROOT), 'utf8').trim();
    return text ? text.split(/\r?\n/u).map(line => JSON.parse(line)) : [];
}

function outputText() {
    return readdirSync(new URL(`${OUT}/`, ROOT))
        .filter(file => file.endsWith('.json') || file.endsWith('.jsonl'))
        .map(file => readFileSync(new URL(`${OUT}/${file}`, ROOT), 'utf8'))
        .join('\n');
}

test('data path audit keeps Mid Boss and Walker coordinates missing', () => {
    const audit = readJson(`${OUT}/data-path-audit.json`);

    assert.equal(audit.targetEntities.length, 8);
    assert.ok(audit.targetEntities.some(entity => entity.className === 'CNPC_MidBoss'));
    assert.ok(audit.targetEntities.some(entity => entity.className === 'CNPC_Boss_Tier2'));
    assert.ok(audit.targetEntities.every(entity => entity.coordinateStatus === 'missing'));
    assert.ok(audit.targetEntities.every(entity => entity.firstStageWhereLost));
});

test('position inventory finds reference candidates but no usable world coordinate', () => {
    const inventory = readJson(`${OUT}/position-property-inventory.json`);

    assert.equal(inventory.targetPropertyCount > 0, true);
    assert.equal(inventory.candidateProperties.length, 16);
    assert.equal(inventory.usableCoordinateProperties.length, 0);
    assert.ok(inventory.candidateProperties.every(prop => prop.usable === false));
    assert.ok(inventory.candidateProperties.some(prop => prop.propertyPath.includes('CBodyComponent')));
});

test('no coordinate observations or stability claims are fabricated', () => {
    const observations = readJsonl(`${OUT}/fixed-entity-coordinate-observations.jsonl`);
    const stability = readJson(`${OUT}/coordinate-stability-audit.json`);

    assert.equal(observations.length, 0);
    assert.equal(stability.stableFixedEntities, 0);
    assert.equal(stability.movingOrUncertainEntities, 8);
    assert.ok(stability.entities.every(entity => entity.classification === 'insufficient_observations'));
});

test('Walker team and lane identity are unresolved without coordinate-derived shortcuts', () => {
    const teams = readJson(`${OUT}/walker-team-identity.json`);
    const lanes = readJson(`${OUT}/walker-lane-identity.json`);

    assert.equal(teams.resolvedTeams, 0);
    assert.equal(lanes.resolvedLanes, 0);
    assert.ok(teams.walkers.every(walker => walker.teamObservation === 'unknown'));
    assert.ok(lanes.walkers.every(walker => walker.lane === 'unknown'));
    assert.ok(lanes.walkers.every(walker => walker.identityEstablishedWithoutTransform === true));
});

test('future correspondences remain ineligible and do not assign fit roles', () => {
    const correspondences = readJson(`${OUT}/future-transform-correspondences.json`);
    const plan = readJson(`${OUT}/future-fit-validation-plan.json`);

    assert.equal(correspondences.groundedCorrespondences, 0);
    assert.equal(correspondences.fitEligibleCorrespondences, 0);
    assert.equal(correspondences.validationEligibleCorrespondences, 0);
    assert.equal(plan.planningStatus, 'not_ready');
    assert.deepEqual(plan.fitCorrespondenceIds, []);
    assert.deepEqual(plan.validationCorrespondenceIds, []);
    assert.ok(correspondences.correspondences.every(row => row.eligibleForFit === false));
    assert.ok(correspondences.correspondences.every(row => row.eligibleForValidation === false));
});

test('gate preserves no transform, no spatial semantic output, and zero mechanic effects', () => {
    const summary = readJson(`${OUT}/resolution-summary.json`);
    const gate = readJson(`${OUT}/resolution-gate.json`);
    const text = outputText();

    assert.equal(summary.gate, 'replay_009_walker_identity_coordinates_not_ready');
    assert.equal(summary.transformFitted, false);
    assert.equal(summary.lanesRegionsProximityEmitted, false);
    assert.equal(summary.mechanicEffectsApplied, 0);
    assert.equal(gate.gate, summary.gate);
    assert.equal(gate.transformFitted, false);
    assert.equal(text.includes('"transformFitted": true'), false);
    assert.equal(text.includes('"lanesEmitted": true'), false);
    assert.equal(text.includes('"regionsEmitted": true'), false);
    assert.equal(text.includes('"proximityEmitted": true'), false);
    assert.equal(/[A-Z]:[\\/]/.test(text), false);
});
