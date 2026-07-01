import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

const ROOT = new URL('../', import.meta.url);
const OUT = 'output/replay-009-transform-retry';

function readJson(relativePath) {
    return JSON.parse(readFileSync(new URL(relativePath, ROOT), 'utf8'));
}

function outputText() {
    return readdirSync(new URL(`${OUT}/`, ROOT))
        .filter(file => file.endsWith('.json'))
        .map(file => readFileSync(new URL(`${OUT}/${file}`, ROOT), 'utf8'))
        .join('\n');
}

test('input integrity accepts Task 072 measured landmarks without committing source images', () => {
    const integrity = readJson(`${OUT}/input-integrity.json`);

    assert.equal(integrity.predecessorGate, 'replay_009_independent_landmark_coordinates_ready_with_limitations');
    assert.equal(integrity.inputIntegrityStatus, 'valid');
    assert.equal(integrity.landmarkCount, 34);
    assert.equal(integrity.plannedFitAnchorCount, 5);
    assert.equal(integrity.plannedValidationAnchorCount, 2);
    assert.equal(integrity.plannedFitValidationDisjoint, true);
    assert.deepEqual(integrity.prohibitedPlannedAnchors, []);
    assert.equal(integrity.sourceImagesCommitted, false);
});

test('coordinate basis audit preserves missing fixed entity world coordinates', () => {
    const audit = readJson(`${OUT}/coordinate-basis-audit.json`);

    assert.equal(audit.coordinateBasisStatus, 'map_pixels_available_replay_fixed_world_coordinates_unavailable');
    assert.equal(audit.targetCoordinateBasis.metricScaleKnown, false);
    assert.equal(audit.replayCoordinateBasis.fixedEntityWorldCoordinatesAvailable, false);
    assert.ok(audit.replayCoordinateBasis.entitySpatialStatus.length >= 8);
    assert.ok(audit.replayCoordinateBasis.entitySpatialStatus.every(entry => entry.worldPositionRecords === 0));
});

test('landmark ledger freezes unresolved identities before residual inspection', () => {
    const ledger = readJson(`${OUT}/landmark-identity-ledger.json`);

    assert.equal(ledger.frozenBeforeResidualInspection, true);
    assert.equal(ledger.permutationSearchPerformed, false);
    assert.equal(ledger.residualsInspectedBeforePairing, false);
    assert.match(ledger.frozenLedgerHash, /^[a-f0-9]{64}$/);
    assert.equal(ledger.summary.groundedCorrespondences, 0);
    assert.equal(ledger.summary.walkerIdentitiesResolved, false);
    assert.ok(ledger.rows.some(row => row.landmarkType === 'mid_boss_center' && row.exclusionReasons.includes('replay_world_coordinate_unavailable_for_candidate_entities')));
    assert.ok(ledger.rows.filter(row => row.landmarkType === 'walker').every(row => row.identityStatus === 'unresolved'));
    assert.ok(ledger.rows.filter(row => row.landmarkType === 'walker').every(row => row.exclusionReasons.includes('permutation_search_prohibited')));
});

test('models are preregistered but ineligible and no transform is fitted', () => {
    const preregistration = readJson(`${OUT}/model-preregistration.json`);
    const results = readJson(`${OUT}/candidate-transform-results.json`);
    const heldOut = readJson(`${OUT}/held-out-validation-results.json`);

    assert.equal(preregistration.preregistrationFrozenBeforeFitting, true);
    assert.equal(preregistration.models.length, 5);
    assert.equal(preregistration.eligibleFitAnchorCount, 0);
    assert.equal(preregistration.eligibleValidationAnchorCount, 0);
    assert.ok(preregistration.models.every(model => model.eligible === false));
    assert.equal(results.fittedModels.length, 0);
    assert.equal(results.selectedModelId, null);
    assert.equal(results.permutationSearchPerformed, false);
    assert.equal(heldOut.heldOutValidationPerformed, false);
});

test('decision rejects production spatial output while preserving limitations', () => {
    const decision = readJson(`${OUT}/transform-decision.json`);
    const summary = readJson(`${OUT}/validation-summary.json`);
    const gate = readJson(`${OUT}/transform-gate.json`);
    const projection = readJson(`${OUT}/fixed-landmark-projection-audit.json`);

    assert.equal(decision.decision, 'insufficient_grounded_correspondences');
    assert.equal(decision.gate, 'replay_009_candidate_transform_not_ready');
    assert.equal(summary.productionTransformEmitted, false);
    assert.equal(summary.lanesRegionsProximityEmitted, false);
    assert.equal(summary.mechanicEffectsApplied, 0);
    assert.equal(summary.fitResidual, null);
    assert.equal(summary.validationResidual, null);
    assert.equal(gate.gate, decision.gate);
    assert.equal(projection.lanesEmitted, false);
    assert.equal(projection.regionsEmitted, false);
    assert.equal(projection.proximityEmitted, false);
});

test('outputs contain no absolute paths, fitted parameters, lanes, regions, or mechanic effects', () => {
    const text = outputText();

    assert.equal(/[A-Z]:[\\/]/.test(text), false);
    assert.equal(text.includes('"parameters"'), false);
    assert.equal(text.includes('"lane_unique"'), false);
    assert.equal(text.includes('"region"'), false);
    assert.equal(text.includes('"mechanicEffectsApplied": 1'), false);
});
