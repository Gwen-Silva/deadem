import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

const ROOT = new URL('../', import.meta.url);
const OUT = 'output/replay-009-walker-lane-controlled-evidence';

function readJson(relativePath) {
    return JSON.parse(readFileSync(new URL(relativePath, ROOT), 'utf8'));
}

function outputText() {
    return readdirSync(new URL(`${OUT}/`, ROOT))
        .filter(file => file.endsWith('.json') || file.endsWith('.md'))
        .map(file => readFileSync(new URL(`${OUT}/${file}`, ROOT), 'utf8'))
        .join('\n');
}

test('covers all six Walkers without assigning lanes or landmarks', () => {
    const decisions = readJson(`${OUT}/walker-lane-decisions.json`);

    assert.equal(decisions.decisions.length, 6);
    assert.equal(new Set(decisions.decisions.map(row => row.entityKey)).size, 6);
    assert.equal(decisions.decisions.filter(row => row.namedTeam === 'sapphire').length, 3);
    assert.equal(decisions.decisions.filter(row => row.namedTeam === 'amber').length, 3);
    assert.ok(decisions.decisions.every(row => row.lane === 'unknown'));
    assert.ok(decisions.decisions.every(row => row.mapLandmarkId === null));
    assert.ok(decisions.decisions.every(row => row.coordinatesUsedForIdentity === false));
});

test('audits new sources and preserves transferability boundaries', () => {
    const availability = readJson(`${OUT}/source-availability.json`);
    const transfer = readJson(`${OUT}/transferability-assessment.json`);
    const video = readJson(`${OUT}/controlled-video-observations.json`);

    assert.ok(availability.sources.some(row => row.sourceId === 'existing_replay_009_video_opencv' && row.newRelativeToTasks077And078));
    assert.ok(availability.sources.some(row => row.sourceId === 'valveresourceformat_or_equivalent'));
    assert.equal(transfer.customMatchUsed, false);
    assert.equal(transfer.transferableFieldSemanticsFound.length, 0);
    assert.equal(video.observations.length, 3);
    assert.ok(video.observations.every(row => row.status === 'set_level_only'));
    assert.ok(video.observations.every(row => row.uniquelyLinkedEntityKey === null));
});

test('finds no exact map joins and no transform prerequisites', () => {
    const map = readJson(`${OUT}/map-identity-extraction.json`);
    const prereq = readJson(`${OUT}/transform-prerequisite-decision.json`);

    assert.equal(map.exactReplayMapIdentityJoins.length, 0);
    assert.equal(map.status, 'no_identity_bearing_metadata_decoded');
    assert.equal(prereq.coordinateReadyWalkers, 2);
    assert.equal(prereq.laneIdentityReadyWalkers, 0);
    assert.equal(prereq.coordinateReadyIdentifiedWalkers, 0);
    assert.equal(prereq.fitEligibleCorrespondences, 0);
    assert.equal(prereq.validationEligibleCorrespondences, 0);
    assert.equal(prereq.transformRetryEligible, false);
});

test('gate records evidence unavailable and forbids shortcuts', () => {
    const summary = readJson(`${OUT}/summary.json`);
    const gate = readJson(`${OUT}/gate.json`);
    const text = outputText();

    assert.equal(summary.gate, 'replay_009_walker_lane_identity_evidence_unavailable');
    assert.equal(gate.gate, summary.gate);
    assert.equal(summary.coordinatesUsedForIdentity, false);
    assert.equal(summary.permutationSearchPerformed, false);
    assert.equal(summary.residualsCalculated, false);
    assert.equal(summary.transformFitted, false);
    assert.equal(summary.spatialOutputsEmitted, false);
    assert.equal(summary.mechanicEffectsApplied, 0);
    assert.equal(/[A-Z]:[\\/]/u.test(text), false);
    assert.equal(text.includes('"transformRetryEligible": true'), false);
});
