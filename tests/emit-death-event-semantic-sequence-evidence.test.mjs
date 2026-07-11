import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { executePreparedSemanticRun, prepareSemanticRun, validateIntegrityPrecondition, validateSemanticArtifact } from '../tools/emit-death-event-semantic-sequence-evidence.mjs';
import { fixtureArtifact } from './death-event-semantic-sequence-evidence-schema.test.mjs';

const pilot = { version: 1, runKind: 'task187-pilot', manifestIdentity: 'task187_semantic_sequence_pilot_v1', replayIds: ['replay_010', 'replay_011', 'replay_021', 'replay_036'] };
const integrity = { gate: 'task185_186_audit_integrity_repaired', status: 'passed', replayPathResolved: false, playerConstructed: false, parserRun: false };
test('integrity failure blocks before replay path resolution', async () => { let resolved = false; await assert.rejects(() => prepareSemanticRun({ manifest: pilot, loadIntegrityGate: async () => ({ status: 'blocked' }), loadPilotGate: async () => null, onReplayPathResolution: () => { resolved = true; } }), /integrity repair/u); assert.equal(resolved, false); assert.equal(validateIntegrityPrecondition(integrity), true); });
test('semantic artifact uses exact Task 186 control and coherent bounded class', () => { const artifact = fixtureArtifact(); assert.equal(artifact.evidenceRows[0].matchedControlNormalizedElapsedSecond, 100); assert.equal(artifact.evidenceRows[0].anchorSequence.coherentSequenceObserved, true); assert.equal(artifact.evidenceRows[0].sequenceEvidenceClass, 'coherent_forward_and_recovery_sequence'); });
test('semantic validator rejects duplicate sequence keys', () => { const artifact = fixtureArtifact(); artifact.evidenceRows.push(structuredClone(artifact.evidenceRows[0])); artifact.anchorCount = 2; artifact.evidenceRowCount = 2; assert.ok(validateSemanticArtifact(artifact, JSON.parse('{}')).length > 0); });
test('end-to-end multi-replay failure publishes only blocked metadata and preserves active bytes', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'task187-')); const active = path.join(root, 'active'); const blocked = path.join(root, 'blocked'); await mkdir(active); const marker = Buffer.from([1, 3, 3, 7]); await writeFile(path.join(active, 'marker.bin'), marker);
    let index = 0; const result = await executePreparedSemanticRun({ manifest: pilot, plan: pilot.replayIds.map(replayId => ({ replayId })), replayExecutor: async input => { index += 1; if (index === 2) return { summary: { replayId: input.replayId, status: 'blocked', errorMessage: 'intentional' }, artifact: null }; return { summary: { replayId: input.replayId, status: 'emitted' }, artifact: { replayId: input.replayId } }; }, activeRoot: active, blockedRoot: blocked });
    assert.equal(result.status, 'blocked'); assert.equal(result.artifactCountPublished, 0); assert.deepEqual(await readFile(path.join(active, 'marker.bin')), marker); assert.deepEqual((await readdir(blocked)).sort(), ['blocked-gate.json', 'blocked-summary.json', 'failure-audits.json']); assert.equal((await readdir(blocked)).some(name => name.includes('task187-gate')), false); await rm(root, { recursive: true, force: true });
});
