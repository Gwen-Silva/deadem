import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

const ROOT = new URL('../', import.meta.url);
const OUT = 'output/replay-009-walker-identity';

function readJson(relativePath) {
    return JSON.parse(readFileSync(new URL(relativePath, ROOT), 'utf8'));
}

function outputText() {
    return readdirSync(new URL(`${OUT}/`, ROOT))
        .filter(file => file.endsWith('.json') || file.endsWith('.md'))
        .map(file => readFileSync(new URL(`${OUT}/${file}`, ROOT), 'utf8'))
        .join('\n');
}

test('ledger preserves exactly six Walker generations and raw team values', () => {
    const ledger = readJson(`${OUT}/walker-generation-ledger.json`);
    const teams = readJson(`${OUT}/team-value-decoding.json`);

    assert.equal(ledger.walkerGenerationCount, 6);
    assert.equal(new Set(ledger.generations.map(row => row.entityKey)).size, 6);
    assert.ok(ledger.generations.every(row => row.className === 'CNPC_Boss_Tier2'));
    assert.equal(teams.walkerRawTeamValuesResolved, 6);
    assert.deepEqual(teams.rawTeamValuesFound, [ 2, 3 ]);
});

test('raw team values are not mapped to named teams without non-spatial controls', () => {
    const teams = readJson(`${OUT}/team-value-decoding.json`);
    const decisions = readJson(`${OUT}/walker-identity-decisions.json`);

    assert.equal(teams.sapphireResolved, 0);
    assert.equal(teams.amberResolved, 0);
    assert.ok(teams.namedTeamMappings.every(row => row.namedTeam === 'unknown'));
    assert.ok(decisions.decisions.every(row => row.team === 'unknown'));
    assert.ok(decisions.decisions.every(row => row.teamStatus === 'unresolved'));
});

test('direct identity field inventory keeps raw state and team fields bounded', () => {
    const inventory = readJson(`${OUT}/direct-identity-field-inventory.json`);

    assert.ok(inventory.length >= 6);
    assert.equal(inventory.filter(row => row.identityDimension === 'team').length, 6);
    assert.ok(inventory.every(row => row.usable === false));
    assert.ok(inventory.every(row => row.reason));
});

test('video correlations stay class or set level only', () => {
    const video = readJson(`${OUT}/video-walker-identity-correlations.json`);

    assert.equal(video.length, 3);
    assert.ok(video.every(row => row.correlationStatus === 'set_level_only'));
    assert.ok(video.every(row => row.linkedEntityKey === null));
    assert.ok(video.every(row => row.videoWindow.uncertaintySeconds === 22.782));
});

test('correspondence readiness excludes every map pairing before residual inspection', () => {
    const readiness = readJson(`${OUT}/correspondence-readiness.json`);
    const plan = readJson(`${OUT}/future-transform-anchor-plan.json`);

    assert.equal(readiness.summary.coordinateReadyWalkers, 2);
    assert.equal(readiness.summary.fitEligibleCorrespondences, 0);
    assert.equal(readiness.summary.validationEligibleCorrespondences, 0);
    assert.ok(readiness.rows.every(row => row.identityGroundedBeforeFit === false));
    assert.ok(readiness.rows.every(row => row.eligibleForFit === false));
    assert.ok(readiness.rows.every(row => row.eligibleForValidation === false));
    assert.equal(plan.frozenSplitCreated, false);
    assert.equal(plan.transformFitted, false);
    assert.equal(plan.residualsComputed, false);
    assert.equal(plan.permutationSearchPerformed, false);
});

test('identity gate is not ready and emits no forbidden spatial or mechanic outputs', () => {
    const summary = readJson(`${OUT}/identity-summary.json`);
    const gate = readJson(`${OUT}/identity-gate.json`);
    const text = outputText();

    assert.equal(summary.gate, 'replay_009_walker_identity_not_ready');
    assert.equal(gate.gate, summary.gate);
    assert.equal(summary.fitEligibleCorrespondences, 0);
    assert.equal(summary.validationEligibleCorrespondences, 0);
    assert.equal(summary.permutationOrResidualSearchPerformed, false);
    assert.equal(summary.transformFitted, false);
    assert.equal(summary.lanesRegionsProximityEmitted, false);
    assert.equal(summary.mechanicEffectsApplied, 0);
    assert.equal(/[A-Z]:[\\/]/.test(text), false);
    assert.equal(text.includes('"transformFitted": true'), false);
    assert.equal(text.includes('"eligibleForFit": true'), false);
    assert.equal(text.includes('"eligibleForValidation": true'), false);
});
