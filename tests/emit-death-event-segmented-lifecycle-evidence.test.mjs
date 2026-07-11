import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { analyzeLifecycleCohort, executePreparedSegmentedRun, prepareSegmentedRun } from '../tools/emit-death-event-segmented-lifecycle-evidence.mjs';
import { PILOT_IDS } from '../tools/validate-task187-sequence-integrity.mjs';

function mappedLifecycle() {
    const participantKey = 'participant_01'; const base = { healthBoundary: 'positive', booleanAlive: true, respawnBoundary: 'non_positive', pawnLinkPresence: true };
    const samples = [7, 8, 9].map(second => ({ second, state: { ...base } }));
    samples.push({ second: 10, state: { ...base, healthBoundary: 'non_positive', booleanAlive: false } }, { second: 11, state: { ...base, healthBoundary: 'non_positive', booleanAlive: false } }, { second: 20, state: { ...base } }, { second: 21, state: { ...base } });
    const events = [
        { key: 'h-f', family: 'healthBoundary', second: 10, direction: 'forward', toState: 'non_positive' }, { key: 'b-f', family: 'booleanAlive', second: 10, direction: 'forward', toState: false },
        { key: 'h-i', family: 'healthBoundary', second: 20, direction: 'inverse', toState: 'positive' }, { key: 'b-i', family: 'booleanAlive', second: 20, direction: 'inverse', toState: true }
    ];
    return { samples: new Map([[participantKey, samples]]), sampleIndexes: new Map([[participantKey, new Map(samples.map(row => [row.second, row.state]))]]), events: new Map([[participantKey, events]]) };
}

test('same-family chain requires persistence and completes at confirmation sample', () => {
    const reference = { participantKey: 'participant_01', second: 10, nextAnchorSecond: 40, key: 'anchor' }; const anchors = new Map([['participant_01', [10, 40]]]);
    const result = analyzeLifecycleCohort([reference], mappedLifecycle(), 200, anchors).results.get('anchor');
    assert.equal(result.completeCount, 2); assert.equal(result.coherent, true); assert.equal(result.recoveryDelta, 11);
});

test('inverse at next anchor is a boundary violation and remains incomplete', () => {
    const reference = { participantKey: 'participant_01', second: 10, nextAnchorSecond: 20, key: 'anchor' }; const anchors = new Map([['participant_01', [10, 20]]]);
    const result = analyzeLifecycleCohort([reference], mappedLifecycle(), 200, anchors).results.get('anchor');
    assert.equal(result.completeCount, 0); assert.equal(result.boundaryViolation, true); assert.equal(result.coherent, false);
});

test('bounded preparation validates every pilot field before path resolution', async () => {
    let resolved = 0; const manifest = { version: 1, runKind: 'task188-bounded32', manifestIdentity: 'task188_segmented_lifecycle_bounded32_v1', replayIds: ['replay_001', 'replay_002', 'replay_003', 'replay_004', 'replay_009', ...Array.from({ length: 27 }, (_, index) => `replay_${String(index + 10).padStart(3, '0')}`)] };
    await assert.rejects(() => prepareSegmentedRun({ manifest, loadIntegrityGate: async () => ({ gate: 'task187_sequence_integrity_repaired', status: 'passed', replayPathResolved: false, playerConstructed: false, parserRun: false }), loadPilotGate: async () => ({ gate: 'death_segmented_lifecycle_pilot_ready', status: 'passed' }), onReplayPathResolution: () => { resolved += 1; } }));
    assert.equal(resolved, 0);
});

test('multi-replay failure publishes only blocked metadata and preserves prior bytes', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'task188-')); const activeRoot = path.join(root, 'active'); const blockedRoot = path.join(root, 'blocked'); await mkdir(activeRoot); await writeFile(path.join(activeRoot, 'marker.bin'), Buffer.from([1, 4, 9])); const before = await readFile(path.join(activeRoot, 'marker.bin'));
    const manifest = { runKind: 'task188-pilot', manifestIdentity: 'task188_segmented_lifecycle_pilot_v1', replayIds: PILOT_IDS }; const plan = PILOT_IDS.map(replayId => ({ replayId })); let call = 0;
    const result = await executePreparedSegmentedRun({ manifest, plan, activeRoot, blockedRoot, replayExecutor: async input => { call += 1; return call === 2 ? { summary: { replayId: input.replayId, status: 'blocked', errorMessage: 'intentional' }, artifact: null } : { summary: { replayId: input.replayId, status: 'emitted' }, artifact: { replayId: input.replayId } }; } });
    assert.equal(result.status, 'blocked'); assert.deepEqual(await readFile(path.join(activeRoot, 'marker.bin')), before); assert.deepEqual((await readdir(blockedRoot)).sort(), ['blocked-gate.json', 'blocked-summary.json', 'failure-audits.json']);
});
