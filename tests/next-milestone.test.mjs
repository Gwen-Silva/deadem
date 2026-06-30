import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const ROOT = new URL('../', import.meta.url);

function readJson(relativePath) {
    return JSON.parse(readFileSync(new URL(relativePath, ROOT), 'utf8'));
}

test('dependency graph is internally consistent and includes required nodes', () => {
    const graph = readJson('output/project-milestone-analysis/dependency-graph.json');
    const nodes = new Map(graph.nodes.map(node => [node.nodeId, node]));

    for (const nodeId of [
        'parser_correctness',
        'telemetry',
        'identity',
        'time',
        'coordinates',
        'map_geometry',
        'entity_observability',
        'factual_states',
        'mechanic_version',
        'mechanic_activation',
        'combat',
        'lane_occupancy',
        'rotations',
        'objectives',
        'fights',
        'map_pressure',
        'macro_interpretation',
        'decision_analysis'
    ]) {
        assert.ok(nodes.has(nodeId), `missing node ${nodeId}`);
    }

    for (const node of graph.nodes) {
        for (const dependency of node.dependsOn) {
            assert.ok(nodes.has(dependency), `${node.nodeId} depends on unknown ${dependency}`);
        }
    }
    assert.equal(nodes.get('map_geometry').currentStatus, 'unavailable');
    assert.ok(nodes.get('map_geometry').unlocks.includes('lane_occupancy'));
});

test('capability blocker matrix covers required target capabilities and unsafe shortcuts', () => {
    const matrix = readJson('output/project-milestone-analysis/capability-blocker-matrix.json');
    const capabilities = new Map(matrix.capabilities.map(row => [row.capability, row]));

    for (const capability of [
        'lane presence',
        'lane occupancy',
        'movement path',
        'rotation candidate',
        'objective proximity',
        'objective completion',
        'fight candidate',
        'teamfight candidate',
        'map pressure',
        'resource allocation',
        'macro interpretation',
        'decision-quality analysis'
    ]) {
        assert.ok(capabilities.has(capability), `missing ${capability}`);
    }

    assert.ok(capabilities.get('objective completion').unsafeShortcuts.includes('using deletion as objective completion'));
    assert.ok(capabilities.get('resource allocation').unsafeShortcuts.includes('using net worth as available souls'));
    assert.ok(capabilities.get('decision-quality analysis').unsafeShortcuts.includes('using outcome as decision quality'));
});

test('milestone comparison selects spatial foundation with open dependencies', () => {
    const comparison = readJson('output/project-milestone-analysis/milestone-comparison.json');
    const decision = readJson('output/project-milestone-analysis/milestone-decision.json');
    const gate = readJson('output/project-milestone-analysis/milestone-gate.json');

    assert.equal(comparison.tracks.length, 6);
    assert.equal(decision.selectedPrimaryMilestone, 'spatial foundation first');
    assert.equal(decision.gate, 'deadem_next_milestone_defined_with_open_dependencies');
    assert.equal(gate.gate, decision.gate);
    assert.ok(decision.newInputsRequired.includes('authoritative or calibratable map geometry for the replay-009 map/build'));
    assert.equal(decision.protections.replay005Read, false);
    assert.equal(decision.protections.botFixturesProcessed, false);
    assert.equal(decision.protections.sourceVideoProcessed, false);
});

test('replay 005 release checklist remains not ready', () => {
    const checklist = readJson('output/project-milestone-analysis/replay-005-release-criteria.json');

    assert.equal(checklist.releaseDecision, 'replay_005_release_not_ready');
    assert.ok(checklist.criteria.some(row => row.criterionId === 'canonical_more_than_one_human_replay' && row.currentStatus === 'not_met'));
    assert.ok(checklist.criteria.some(row => row.criterionId === 'task_queue_clean' && row.currentStatus === 'met'));
    assert.ok(checklist.criteria.every(row => row.required === true));
});

test('recommended task sequence is bounded and keeps replay 005 protected', () => {
    const sequence = readJson('output/project-milestone-analysis/recommended-task-sequence.json');

    assert.equal(sequence.tasks.length, 5);
    assert.equal(sequence.tasks[0].title, 'Acquire Replay 009 Map Geometry And Calibration Inputs');
    assert.ok(sequence.tasks.length >= 3 && sequence.tasks.length <= 8);
    assert.ok(sequence.tasks.every(task => task.replay005Allowed === false));
    assert.ok(sequence.tasks.every(task => Array.isArray(task.stopConditions) && task.stopConditions.length > 0));
});
