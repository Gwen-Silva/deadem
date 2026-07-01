import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

const ROOT = new URL('../', import.meta.url);
const OUT = 'output/replay-009-fixed-spatial-diagnosis';

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

test('diagnosis recovers bounded target coordinate-like fields', () => {
    const summary = readJson(`${OUT}/diagnosis-summary.json`);
    const plausibility = readJson(`${OUT}/coordinate-candidate-plausibility.json`);

    assert.equal(summary.diagnosisDecision, 'coordinates_omitted_by_compact_filter');
    assert.equal(summary.directCoordinatesExposed, true);
    assert.equal(summary.compactFilterOmissionFound, true);
    assert.equal(summary.coordinateCandidatesRecovered, 8);
    assert.equal(summary.observedPayloadCoordinateCandidatesRecovered, 4);
    assert.equal(summary.currentStateCoordinateCandidatesRecovered, 4);
    assert.equal(plausibility.status, 'coordinate_like_fields_exposed_with_semantic_limits');
    assert.ok(plausibility.coordinateCandidates.some(candidate => candidate.fields.includes('CBodyComponent.m_vecX')));
    assert.ok(plausibility.coordinateCandidates.some(candidate => candidate.fields.includes('CBodyComponent.m_cellX')));
});

test('target field-path observations include create-time Walker coordinate triples', () => {
    const rows = readJsonl(`${OUT}/target-field-path-observations.jsonl`);
    const createRows = rows.filter(row => row.operation === 'CREATE' && row.className === 'CNPC_Boss_Tier2');
    const paths = new Set(createRows.map(row => row.resolvedPropertyPath));

    assert.ok(paths.has('CBodyComponent.m_vecX'));
    assert.ok(paths.has('CBodyComponent.m_vecY'));
    assert.ok(paths.has('CBodyComponent.m_vecZ'));
    assert.ok(paths.has('CBodyComponent.m_cellX'));
    assert.ok(paths.has('CBodyComponent.m_cellY'));
    assert.ok(paths.has('CBodyComponent.m_cellZ'));
    assert.ok(createRows.some(row => row.demoTick === 138241));
});

test('raw comparison identifies compact filter omission rather than decoder failure', () => {
    const comparison = readJson(`${OUT}/raw-normalized-comparison.json`);
    const omission = comparison.lossAssessment.find(row => row.failureMode === 'compact_filter_omission');
    const vectorGap = comparison.lossAssessment.find(row => row.failureMode === 'unsupported_vector_codec');

    assert.equal(comparison.coordinateTriplesRecovered, 4);
    assert.equal(comparison.compactFilterOmissionObserved, true);
    assert.equal(omission.observed, true);
    assert.equal(vectorGap.observed, false);
});

test('gate remains diagnostic and emits no transform, region, lane, proximity, or mechanic effect', () => {
    const summary = readJson(`${OUT}/diagnosis-summary.json`);
    const gate = readJson(`${OUT}/diagnosis-gate.json`);
    const text = outputText();

    assert.equal(summary.gate, 'replay_009_fixed_entity_spatial_properties_ready_with_gaps');
    assert.equal(gate.gate, summary.gate);
    assert.equal(summary.transformFitted, false);
    assert.equal(summary.lanesRegionsProximityEmitted, false);
    assert.equal(summary.mechanicEffectsApplied, 0);
    assert.equal(text.includes('"transformFitted": true'), false);
    assert.equal(text.includes('"lanesEmitted": true'), false);
    assert.equal(text.includes('"regionsEmitted": true'), false);
    assert.equal(text.includes('"proximityEmitted": true'), false);
    assert.equal(/[A-Z]:[\\/]/.test(text), false);
});
