import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

const ROOT = new URL('../', import.meta.url);
const OUT = 'output/replay-009-walker-lane-evidence';

function readJson(relativePath) {
    return JSON.parse(readFileSync(new URL(relativePath, ROOT), 'utf8'));
}

function outputText() {
    return readdirSync(new URL(`${OUT}/`, ROOT))
        .filter(file => file.endsWith('.json') || file.endsWith('.md'))
        .map(file => readFileSync(new URL(`${OUT}/${file}`, ROOT), 'utf8'))
        .join('\n');
}

test('raw team controls map Walker factions without resolving lanes', () => {
    const controls = readJson(`${OUT}/raw-team-control-mapping.json`);

    assert.equal(controls.rawTeamValuesMapped, 2);
    assert.deepEqual(
        controls.namedTeamControls.map(row => [ row.rawTeamValue, row.namedTeam ]).sort(),
        [ [ 2, 'amber' ], [ 3, 'sapphire' ] ]
    );
    assert.equal(controls.walkerTeamAssignments.length, 6);
    assert.equal(controls.walkerTeamAssignments.filter(row => row.namedTeam === 'sapphire').length, 3);
    assert.equal(controls.walkerTeamAssignments.filter(row => row.namedTeam === 'amber').length, 3);
    assert.ok(controls.walkerTeamAssignments.every(row => row.lane === null));
    assert.ok(controls.walkerTeamAssignments.every(row => row.mapLandmarkId === null));
    assert.ok(controls.walkerTeamAssignments.every(row => row.coordinateUsedForIdentity === false));
});

test('map and replay joins remain team-only and not transform eligible', () => {
    const joins = readJson(`${OUT}/replay-map-identity-joins.json`);
    const readiness = readJson(`${OUT}/correspondence-readiness.json`);

    assert.equal(joins.directHandleToNamedLandmarkJoins, 0);
    assert.equal(joins.laneResolvedJoins, 0);
    assert.ok(joins.joins.every(row => row.joinStatus === 'team_only_not_lane_or_landmark'));
    assert.ok(joins.joins.every(row => row.eligibleAsCorrespondence === false));
    assert.equal(readiness.summary.namedTeamResolvedWalkers, 6);
    assert.equal(readiness.summary.laneResolvedWalkers, 0);
    assert.equal(readiness.summary.fitEligibleCorrespondences, 0);
    assert.equal(readiness.summary.validationEligibleCorrespondences, 0);
    assert.equal(readiness.summary.transformRetryAllowed, false);
    assert.ok(readiness.rows.every(row => row.fitEligible === false));
    assert.ok(readiness.rows.every(row => row.validationEligible === false));
});

test('video and map metadata do not create handle-specific lane evidence', () => {
    const metadata = readJson(`${OUT}/map-walker-identity-metadata.json`);
    const videoSignals = readJson(`${OUT}/video-visible-walker-signals.json`);
    const videoCorrelations = readJson(`${OUT}/video-handle-correlations.json`);

    assert.equal(metadata.directJoinFound, false);
    assert.ok(metadata.walkerResourceMatches.every(row => row.usableForHandleToLandmarkJoin === false));
    assert.equal(videoSignals.length, 3);
    assert.ok(videoSignals.every(row => row.uniqueHandleResolved === false));
    assert.ok(videoSignals.every(row => row.classification === 'visible_named_team_lane_but_no_handle_join'));
    assert.ok(videoCorrelations.every(row => row.uniqueHandleCorrelation === false));
    assert.ok(videoCorrelations.every(row => row.correlationStatus === 'class_or_set_level_only'));
});

test('gate preserves constraints and emits no spatial or mechanic outputs', () => {
    const summary = readJson(`${OUT}/acquisition-summary.json`);
    const gate = readJson(`${OUT}/acquisition-gate.json`);
    const text = outputText();

    assert.equal(summary.gate, 'replay_009_walker_lane_identity_evidence_ready_with_gaps');
    assert.equal(gate.gate, summary.gate);
    assert.equal(summary.coordinateReadyNamedTeamWalkers, 2);
    assert.equal(summary.transformFitted, false);
    assert.equal(summary.residualsComputed, false);
    assert.equal(summary.permutationSearchPerformed, false);
    assert.equal(summary.lanesRegionsProximityEmitted, false);
    assert.equal(summary.mechanicEffectsApplied, 0);
    assert.equal(/[A-Z]:[\\/]/u.test(text), false);
    assert.equal(text.includes('"fitEligible": true'), false);
    assert.equal(text.includes('"validationEligible": true'), false);
    assert.equal(text.includes('"transformFitted": true'), false);
});
