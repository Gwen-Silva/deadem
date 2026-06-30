import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readJsonl(filePath) {
    const text = fs.readFileSync(filePath, 'utf8').trim();
    return text ? text.split(/\r?\n/).map((line) => JSON.parse(line)) : [];
}

test('task 060 runs only partial non-spatial factual state detection', () => {
    const summary = readJson('output/replay-009-states/state-detection-summary.json');
    assert.equal(summary.executionMode, 'partial_non_spatial');
    assert.equal(summary.gate, 'replay_009_factual_state_detection_ready_with_gaps');
    assert.equal(summary.mechanicEffectsApplied, 0);
    assert.equal(summary.spatialOutputsStatus, 'unavailable_by_task_061_limitations');
    assert.ok(summary.authorizationBasis.blockedCategories.includes('objective-player proximity'));
    assert.ok(summary.authorizationBasis.blockedCategories.includes('lane/region membership'));
});

test('player identity, life states, and deaths remain internally consistent', () => {
    const summary = readJson('output/replay-009-states/state-detection-summary.json');
    const death = readJson('output/replay-009-states/death-consistency.json');
    const lifeEvents = readJsonl('output/replay-009-states/player-life-state-events.jsonl');
    assert.equal(summary.playerIdentities.detectedPlayers, 12);
    assert.deepEqual(summary.playerIdentities.teamDistribution, { 2: 6, 3: 6 });
    assert.equal(death.summary.result, 'consistent');
    assert.equal(death.summary.matchedEvents, 84);
    assert.equal(lifeEvents.filter((event) => event.toState === 'dead').length, 84);
    assert.equal(lifeEvents.filter((event) => event.toState === 'alive').length, 82);
});

test('net worth output stays limited to m_iGoldNetWorth endpoints', () => {
    const playerRows = readJsonl('output/replay-009-states/player-net-worth-series.jsonl');
    const teamRows = readJsonl('output/replay-009-states/team-net-worth-series.jsonl');
    assert.equal(playerRows.length, 24);
    assert.equal(teamRows.length, 2);
    assert.ok(playerRows.every((row) => row.sourceField === 'm_iGoldNetWorth'));
    assert.ok(teamRows.every((row) => row.sourceField === 'm_iGoldNetWorth'));
    assert.ok(playerRows.every((row) => row.warnings.some((warning) => warning.includes('endpoints'))));
});

test('knowledge queries preserve unresolved build mapping and apply no rules', () => {
    const queries = readJson('output/replay-009-states/knowledge-query-results.json');
    assert.equal(queries.summary.applicableRuleCount, 0);
    assert.equal(queries.summary.ambiguousRuleCount, 7);
    assert.equal(queries.summary.mechanicEffectsApplied, 0);
    assert.ok(queries.mechanics.every((mechanic) => mechanic.missingBuildMapping));
    assert.ok(queries.mechanics.every((mechanic) => mechanic.effectApplication === 'not_applied'));
});

test('spatially dependent outputs contain unavailable metadata only', () => {
    const proximity = readJsonl('output/replay-009-states/objective-player-proximity.jsonl');
    const urn = readJsonl('output/replay-009-states/urn-state-events.jsonl');
    assert.equal(proximity.length, 1);
    assert.equal(proximity[0].recordType, 'metadata');
    assert.equal(proximity[0].status, 'unavailable');
    assert.equal(urn[0].effectApplication, 'not_applied');
});

test('replay 005 and bot fixtures remain excluded', () => {
    const gate = readJson('output/replay-009-states/state-detection-gate.json');
    assert.equal(gate.replay005Protection, 'not_processed_or_inspected');
    assert.equal(gate.botFixtureExclusion, 'not_processed_or_inspected');
});
