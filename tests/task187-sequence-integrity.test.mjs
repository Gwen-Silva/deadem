import test from 'node:test';
import assert from 'node:assert/strict';
import { BOUNDED_IDS, PILOT_IDS, exactTaskCommitChecks, validateExactManifest, validateExactPilotGate, validateSourceProvenance } from '../tools/validate-task187-sequence-integrity.mjs';

test('Task 187 commit audit rejects assignment to another task', () => {
    const index = { tasks: [{ taskId: '011', commitSha: 'f5825e4ffc537e5986de699fd34d1a3df1a91b0f' }, { taskId: '187', commitSha: 'f5825e4ffc537e5986de699fd34d1a3df1a91b0f' }] };
    const checks = exactTaskCommitChecks(index, 'Commit: f5825e4ffc537e5986de699fd34d1a3df1a91b0f', '## Task 187\nTask 187 commit: `f5825e4ffc537e5986de699fd34d1a3df1a91b0f`.');
    assert.equal(checks.task187OnlyOwner, false);
});

test('exact manifests reject missing, duplicate, extra, reordered, and protected replay ids', () => {
    const valid = { version: 1, runKind: 'task188-pilot', manifestIdentity: 'task188_segmented_lifecycle_pilot_v1', replayIds: PILOT_IDS };
    assert.equal(validateExactManifest(valid), true);
    for (const replayIds of [PILOT_IDS.slice(1), [PILOT_IDS[0], PILOT_IDS[0], ...PILOT_IDS.slice(2)], [...PILOT_IDS, 'replay_037'], [...PILOT_IDS].reverse(), ['replay_005', ...PILOT_IDS.slice(1)]]) assert.throws(() => validateExactManifest({ ...valid, replayIds }));
    assert.throws(() => validateExactManifest({ ...valid, version: 2 }));
    assert.equal(validateExactManifest({ version: 1, runKind: 'task188-bounded32', manifestIdentity: 'task188_segmented_lifecycle_bounded32_v1', replayIds: BOUNDED_IDS }), true);
});

test('pilot precondition requires every exact technical field', () => {
    const gate = { gate: 'death_segmented_lifecycle_pilot_ready', status: 'passed', manifestIdentity: 'task188_segmented_lifecycle_pilot_v1', replayIds: PILOT_IDS, parserCompleted: 4, parserExpected: 4, anchorCount: 341, controlBridgeCount: 341, controlBridgeExpected: 341, evidenceRowCount: 341, participantMappingFailures: 0, task183BridgeFailures: 0, task186ControlBridgeFailures: 0, sourceReuseCount: 0, protectedReplayAccessCount: 0, schemaFailures: 0, outputPolicyFailures: 0, finalFacts: 0, attribution: 0, sizeGatePassed: true, allOrNothingGatePassed: true };
    assert.doesNotThrow(() => validateExactPilotGate(gate));
    for (const field of Object.keys(gate)) { const broken = { ...gate, [field]: null }; assert.throws(() => validateExactPilotGate(broken), field); }
});

test('source provenance requires exact candidate-control row bridge', () => {
    const candidate = { eventCandidateKey: 'death_event_candidate_000001', sourceTransitionKey: 'life_transition_000001', participantKey: 'participant_01', heroRefKey: 'hero_ref_01', teamRefKey: 'team_ref_01', normalizedElapsedSecond: 10 };
    const row = { ...candidate, anchorNormalizedElapsedSecond: 10, controlSelectionStatus: 'selected', controlNormalizedElapsedSecond: 20, truthStatus: 'unconfirmed_candidate', finalFact: false }; delete row.normalizedElapsedSecond;
    const sources = { identity: { replayId: 'replay_010', artifactClass: 'participant_identity', generatedAt: 'task_180' }, transitions: { replayId: 'replay_010', artifactClass: 'life_state_transition_candidates', generatedAt: 'task_182' }, candidates: { replayId: 'replay_010', artifactClass: 'death_event_candidates', generatedAt: 'task_183', candidates: [candidate] }, controls: { replayId: 'replay_010', artifactClass: 'death_event_directional_discrimination_evidence', generatedAt: 'task_186', evidenceRows: [row] } };
    assert.equal(validateSourceProvenance('replay_010', sources).status, 'passed');
    sources.controls.evidenceRows[0].participantKey = 'participant_02';
    assert.equal(validateSourceProvenance('replay_010', sources).status, 'failed');
});
