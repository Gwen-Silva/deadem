import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

const ROOT = new URL('../', import.meta.url);
const OUT = 'output/replay-009-transform-validation';

function readJson(relativePath) {
    return JSON.parse(readFileSync(new URL(relativePath, ROOT), 'utf8'));
}

function outputText() {
    return readdirSync(new URL(`${OUT}/`, ROOT))
        .filter(file => file.endsWith('.json'))
        .map(file => readFileSync(new URL(`${OUT}/${file}`, ROOT), 'utf8'))
        .join('\n');
}

test('local asset access is normalized and does not commit the map asset', () => {
    const access = readJson(`${OUT}/local-asset-access.json`);

    assert.equal(access.accessResult, 'available_local_only');
    assert.equal(access.exists, true);
    assert.equal(access.sizeVerification, 'matches_task069');
    assert.match(access.assetPath, /^steam:/);
    assert.equal(/[A-Z]:[\\/]/.test(JSON.stringify(access)), false);
    assert.equal(access.legalTechnicalStatus, 'local_inspection_only_no_asset_commit');
});

test('resource inventory is bounded metadata and not coordinate extraction', () => {
    const inventory = readJson(`${OUT}/map-resource-inventory.json`);
    const tools = readJson(`${OUT}/extraction-tool-inventory.json`);

    assert.equal(inventory.package.signature, '0x55aa1234');
    assert.ok(inventory.resources.length > 0);
    assert.ok(inventory.resources.length <= 250);
    assert.ok(inventory.resources.every(resource => resource.commitAllowed === false));
    assert.ok(inventory.resources.every(resource => resource.relativePackagePath));
    assert.ok(tools.tools.some(tool => tool.toolId === 'task070_gametracking_index_filter' && tool.used === true));
    assert.ok(tools.tools.some(tool => tool.toolId === 'valveresourceformat' && tool.used === false));
});

test('landmark candidates do not become fit anchors without coordinates', () => {
    const landmarks = readJson(`${OUT}/map-landmark-candidates.json`);
    const correspondences = readJson(`${OUT}/anchor-correspondences.json`);

    assert.equal(landmarks.summary.extractedCoordinateLandmarks, 0);
    assert.ok(landmarks.landmarks.every(landmark => landmark.usableAsFitAnchor === false));
    assert.ok(landmarks.landmarks.every(landmark => landmark.mapWorldCoordinate.x === null));
    assert.equal(correspondences.minimumAcceptanceSatisfied, false);
    assert.ok(correspondences.correspondences.every(pair => pair.role === 'unused'));
    assert.ok(correspondences.correspondences.every(pair => pair.mapCoordinate.x === null));
});

test('models are preregistered but ineligible and no fitting occurs', () => {
    const preregistration = readJson(`${OUT}/model-preregistration.json`);
    const results = readJson(`${OUT}/candidate-transform-results.json`);
    const residualPolicy = readJson(`${OUT}/residual-acceptance-policy.json`);

    assert.equal(preregistration.registeredBeforeFitting, true);
    assert.equal(preregistration.models.length, 5);
    assert.ok(preregistration.models.every(model => model.eligible === false));
    assert.equal(results.fittedModels.length, 0);
    assert.equal(results.selectedModelId, null);
    assert.equal(residualPolicy.classification, 'not_evaluable');
});

test('decision preserves build limitations and zero spatial effects', () => {
    const decision = readJson(`${OUT}/transform-decision.json`);
    const summary = readJson(`${OUT}/validation-summary.json`);
    const gate = readJson(`${OUT}/transform-gate.json`);

    assert.equal(decision.decision, 'insufficient_independent_anchors');
    assert.equal(decision.gate, 'replay_009_candidate_transform_not_ready');
    assert.equal(decision.productionTransformEmitted, false);
    assert.equal(decision.lanesRegionsProximityEmitted, false);
    assert.equal(decision.mechanicEffectsApplied, 0);
    assert.equal(summary.heldOutValidationAnchors, 0);
    assert.equal(summary.protections.replay005Read, false);
    assert.equal(summary.protections.botFixturesProcessed, false);
    assert.equal(gate.gate, decision.gate);
});

test('outputs contain no absolute paths or fitted transform payload', () => {
    const text = outputText();

    assert.equal(/[A-Z]:[\\/]/.test(text), false);
    assert.equal(text.includes('"parameters"'), false);
    assert.equal(text.includes('objective proximity'), false);
    assert.equal(text.includes('macro interpretation added'), false);
});
