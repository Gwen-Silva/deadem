import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

const ROOT = new URL('../../', import.meta.url);
const OUT = 'output/replay-009-fixed-coordinate-resolution';

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

test('target inventory preserves all eight fixed entity generations', () => {
    const inventory = readJson(`${OUT}/target-generation-inventory.json`);

    assert.equal(inventory.targetCount, 8);
    assert.equal(inventory.generations.filter(entity => entity.className === 'CNPC_MidBoss').length, 2);
    assert.equal(inventory.generations.filter(entity => entity.className === 'CNPC_Boss_Tier2').length, 6);
    assert.equal(new Set(inventory.generations.map(entity => entity.entityKey)).size, 8);
    assert.equal(inventory.generations.filter(entity => entity.coordinateEvidenceAvailable).length, 2);
});

test('raw and resolved coordinate observations preserve vector and cell triplets', () => {
    const raw = readJsonl(`${OUT}/raw-coordinate-observations.jsonl`);
    const resolved = readJsonl(`${OUT}/resolved-coordinate-observations.jsonl`);

    assert.equal(raw.length, 4);
    assert.equal(raw.filter(row => row.completeVectorTriplet).length, 4);
    assert.equal(raw.filter(row => row.completeCellTriplet).length, 4);
    assert.equal(resolved.length, 4);
    assert.ok(resolved.every(row => row.coordinateBasis === 'vector_only_supported'));
    assert.ok(resolved.every(row => row.className === 'CNPC_Boss_Tier2'));
    assert.equal(new Set(resolved.map(row => row.entityKey)).size, 2);
});

test('decoder contract accepts vector-only basis from player controls and rejects cell-plus formula', () => {
    const contract = readJson(`${OUT}/coordinate-decoder-contract.json`);
    const controls = readJson(`${OUT}/player-control-reconstruction.json`);
    const vector = controls.formulas.find(row => row.formulaId === 'vector_only');
    const cellPlus = controls.formulas.find(row => row.formulaId === 'cell_plus_vector_1024_hypothesis');

    assert.equal(contract.reconstructionFormula, 'worldCoordinate = CBodyComponent.m_vecX/Y/Z');
    assert.equal(contract.confidence, 'supported');
    assert.equal(vector.status, 'supported');
    assert.equal(cellPlus.status, 'rejected');
});

test('stability and Mid Boss assessment do not collapse missing or moving evidence into anchors', () => {
    const stability = readJson(`${OUT}/coordinate-stability.json`);
    const midBoss = readJson(`${OUT}/mid-boss-coordinate-assessment.json`);

    assert.equal(stability.stableWalkers, 2);
    assert.equal(stability.movingOrUncertainWalkers, 4);
    assert.equal(stability.entities.filter(entity => entity.className === 'CNPC_MidBoss' && entity.observationCount === 0).length, 2);
    assert.equal(midBoss.result, 'mid_boss_fixed_anchor_unavailable');
    assert.ok(midBoss.entities.every(entity => entity.coordinateResult === 'mid_boss_fixed_anchor_unavailable'));
});

test('team and lane evidence remain bounded and non-spatial', () => {
    const teams = readJson(`${OUT}/walker-team-resolution.json`);
    const lanes = readJson(`${OUT}/walker-lane-evidence.json`);

    assert.equal(teams.rawTeamValuesResolved, 6);
    assert.equal(teams.namedTeamsResolved, 0);
    assert.equal(teams.resolvedTeams, 0);
    assert.ok(teams.walkers.every(walker => walker.team === 'unknown'));
    assert.equal(lanes.finalLanesAssigned, 0);
    assert.ok(lanes.walkers.every(walker => walker.finalLaneAssigned === false));
});

test('correspondence and future fit plan remain blocked by identity before transform retry', () => {
    const readiness = readJson(`${OUT}/correspondence-readiness.json`);
    const plan = readJson(`${OUT}/future-fit-validation-plan.json`);

    assert.equal(readiness.rows.filter(row => row.coordinateReady).length, 2);
    assert.equal(readiness.rows.filter(row => row.identityGroundedBeforeFit).length, 0);
    assert.equal(readiness.rows.filter(row => row.fitEligibility === 'eligible').length, 0);
    assert.equal(plan.planningStatus, 'not_ready_identity_insufficient');
    assert.equal(plan.frozenSplitCreated, false);
    assert.deepEqual(plan.fitCorrespondenceIds, []);
    assert.deepEqual(plan.validationCorrespondenceIds, []);
});

test('gate preserves no canonical rewrite, transform, lane, region, proximity, or mechanic effect', () => {
    const summary = readJson(`${OUT}/resolution-summary.json`);
    const gate = readJson(`${OUT}/resolution-gate.json`);
    const text = outputText();

    assert.equal(summary.gate, 'replay_009_fixed_entity_coordinates_ready_with_gaps');
    assert.equal(gate.gate, summary.gate);
    assert.equal(summary.canonicalFieldsUpdated, false);
    assert.equal(summary.transformFitted, false);
    assert.equal(summary.lanesRegionsProximityEmitted, false);
    assert.equal(summary.mechanicEffectsApplied, 0);
    assert.equal(text.includes('"transformFitted": true'), false);
    assert.equal(text.includes('"lanesEmitted": true'), false);
    assert.equal(text.includes('"regionsEmitted": true'), false);
    assert.equal(text.includes('"proximityEmitted": true'), false);
    assert.equal(text.includes('"finalLaneAssigned": true'), false);
    assert.equal(/[A-Z]:[\\/]/.test(text), false);
});
