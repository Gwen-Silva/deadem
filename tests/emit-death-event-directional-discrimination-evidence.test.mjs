import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
    createDiscriminationArtifact,
    prepareDiscriminationRun,
    publishRunOutcome,
    recalculateTask185Artifact,
    validateDiscriminationManifest,
    validatePilotGateForBounded
} from '../tools/emit-death-event-directional-discrimination-evidence.mjs';

function manifest(runKind = 'task186-pilot') {
    const pilot = ['replay_010', 'replay_011', 'replay_021', 'replay_036'];
    const bounded = ['replay_001', 'replay_002', 'replay_003', 'replay_004', 'replay_009', ...Array.from({ length: 27 }, (_, index) => `replay_${String(index + 10).padStart(3, '0')}`)];
    return { version: 1, runKind, manifestIdentity: runKind === 'task186-pilot' ? 'task186_directional_discrimination_pilot_v1' : 'task186_directional_discrimination_bounded32_v1', mode: 'death_event_directional_discrimination_evidence_emission', artifactClass: 'death_event_directional_discrimination_evidence', temporalPolicy: { before: 2, after: 2, inverseMax: 180 }, replayIds: runKind === 'task186-pilot' ? pilot : bounded };
}
function validPilotGate() {
    return { runKind: 'task186-pilot', manifestIdentity: 'task186_directional_discrimination_pilot_v1', technicalEvidenceBaselinePassed: true, requirements: { parserCompletedFourOfFour: true, mappingFailuresZero: true, schemaFailuresZero: true, outputPolicyFailuresZero: true, sourceReuseFailuresZero: true, protectedReplayAccessZero: true, controlSelectionSucceeded: true } };
}
function sources(observedTransitions) {
    const anchor = { eventCandidateKey: 'death_event_candidate_000001', sourceTransitionKey: 'life_transition_000001', participantKey: 'participant_01', heroRefKey: 'hero_ref_01', teamRefKey: 'team_ref_01', normalizedElapsedSecond: 100 };
    return { replayId: 'replay_010', participantIdentity: { replayId: 'replay_010', participants: [{ participantKey: 'participant_01' }] }, lifeStateTransitions: { replayId: 'replay_010', transitionCandidates: [{ transitionKey: anchor.sourceTransitionKey, participantKey: anchor.participantKey, normalizedElapsedSecond: 100 }] }, deathEventCandidates: { replayId: 'replay_010', candidates: [anchor] }, observedTransitions, observedSecondsByParticipant: new Map([['participant_01', Array.from({ length: 801 }, (_, index) => index)]]), replayEndSecond: 800 };
}
function transition(index, sourceFamily, family, kind, second, direction) { return { transitionKey: `task186_observation_${String(index).padStart(6, '0')}`, participantKey: 'participant_01', sourceFamily, family, kind, second, direction }; }

test('bounded precondition fails before replay path resolution', async () => {
    let resolved = false;
    await assert.rejects(() => prepareDiscriminationRun({ manifest: manifest('task186-bounded32'), loadPilotGate: async () => ({ technicalEvidenceBaselinePassed: false }), onReplayPathResolution: () => { resolved = true; } }), /pilot gate/u);
    assert.equal(resolved, false);
    assert.equal(validatePilotGateForBounded(validPilotGate()), true);
});

test('manifest blocks protected replay', () => {
    const value = manifest(); value.replayIds[0] = 'replay_005';
    assert.throws(() => validateDiscriminationManifest(value), /forbidden replay/u);
});

test('non-directional recurrence never counts as direction or inverse cycle', () => {
    const created = createDiscriminationArtifact(sources([
        transition(1, 'lifeStateSignature', 'lifeStateSignature', 'recurrence', 100, 'nondirectional_change_candidate'),
        transition(2, 'lifeStateSignature', 'lifeStateSignature', 'recurrence', 140, 'nondirectional_change_candidate')
    ]));
    const row = created.artifact.evidenceRows[0].anchorCohort;
    assert.equal(row.distinctDirectionalFamilyCount, 0);
    assert.equal(row.distinctInverseCycleFamilyCount, 0);
    assert.equal(row.recurrenceFamilyCount, 1);
});

test('only exact explicit directional pair forms an inverse cycle', () => {
    const created = createDiscriminationArtifact(sources([
        transition(1, 'healthBoundary', 'healthBoundary', 'directional', 100, 'positive_to_non_positive_boundary_candidate'),
        transition(2, 'healthBoundary', 'healthBoundary', 'directional', 140, 'non_positive_to_positive_boundary_candidate')
    ]));
    assert.equal(created.artifact.evidenceRows[0].anchorCohort.distinctInverseCycleFamilyCount, 1);
});

test('failed run publishes no artifacts and preserves previous successful baseline', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'task186-'));
    const active = path.join(root, 'active'); const blocked = path.join(root, 'blocked');
    await mkdir(active); await writeFile(path.join(active, 'success-marker.json'), '{}');
    await publishRunOutcome({ activeRoot: active, blockedRoot: blocked, success: false, files: [{ relativePath: 'blocked-gate.json', value: { status: 'blocked' } }] });
    assert.equal(await readFile(path.join(active, 'success-marker.json'), 'utf8'), '{}');
    assert.deepEqual(await readdir(blocked), ['blocked-gate.json']);
    await rm(root, { recursive: true, force: true });
});

test('Task 185 recalculation excludes signature recurrence from inverse counts', () => {
    const no = { healthBoundary: 'no_boundary_transition_observed', booleanAlive: 'no_boolean_transition_observed', lifeStateSignature: 'life_state_signature_change_candidate', respawnBoundary: 'no_respawn_transition_observed', pawnLink: 'no_pawn_link_transition_observed' };
    const historical = { replayId: 'replay_010', anchorCount: 1, evidenceRows: [{ distinctCompleteCycleFamilyCount: 1, anchorAssociationAmbiguous: false, laterCycleWindowCensoredByReplayEnd: false, evidenceClass: 'anchor_with_single_complete_cycle_family', anchorSideTransitions: no, laterCycleTransitions: no }] };
    const corrected = recalculateTask185Artifact(historical);
    assert.equal(corrected.previousCompleteCycleCount, 1);
    assert.equal(corrected.correctedExplicitInverseCycleCount, 0);
    assert.equal(corrected.changedEvidenceClassCount, 1);
});
