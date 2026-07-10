import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
    auditDirectionalCyclePolicy,
    buildDirectionalCyclePlan,
    createDirectionalCycleArtifact,
    validateDirectionalCycleArtifact,
    validateDirectionalCycleManifestShape
} from '../tools/emit-death-event-directional-cycle-evidence.mjs';

const schema = JSON.parse(await readFile('schemas/death-event-directional-cycle-evidence.schema.json', 'utf8'));

function replay(replayId) {
    return {
        replayId,
        localPath: `.local/deadem/replays/inbox/partida_${replayId.slice(-3)}.dem`,
        participantIdentityArtifactPath: `output/local-replay-processing/participant-identity-compact/task180-bounded32/artifacts/${replayId}/participant_identity.json`,
        lifeStateTransitionArtifactPath: `output/local-replay-processing/life-state-transition-candidates/task182-bounded32/artifacts/${replayId}/life_state_transition_candidates.json`,
        deathEventCandidateArtifactPath: `output/local-replay-processing/death-event-candidates/task183-bounded32/artifacts/${replayId}/death_event_candidates.json`,
        corroborationEvidenceArtifactPath: `output/local-replay-processing/death-event-corroboration-evidence/task184-bounded32/artifacts/${replayId}/death_event_corroboration_evidence.json`
    };
}

function manifest(overrides = {}) {
    return {
        version: 1,
        runKind: 'task185-pilot',
        mode: 'death_event_directional_cycle_evidence_emission',
        artifactClass: 'death_event_directional_cycle_evidence',
        samplingPolicy: { normalizedIntervalSeconds: 1 },
        temporalPolicy: { anchorWindowBeforeSeconds: 2, anchorWindowAfterSeconds: 2, laterCycleAfterSecondsExclusive: 0, laterCycleMaxSecondsInclusive: 180 },
        replays: ['replay_010', 'replay_011', 'replay_021', 'replay_036'].map(replay),
        ...overrides
    };
}

function sources(observedTransitions = [], replayEndSecond = 500) {
    const anchors = [100, 300].map((second, index) => ({
        eventCandidateKey: `death_event_candidate_${String(index + 1).padStart(6, '0')}`,
        sourceTransitionKey: `life_transition_${String(index + 1).padStart(6, '0')}`,
        participantKey: 'participant_01',
        heroRefKey: 'hero_ref_01',
        teamRefKey: 'team_ref_01',
        normalizedElapsedSecond: second
    }));
    return {
        replayId: 'replay_010',
        participantIdentity: { replayId: 'replay_010', participants: [{ participantKey: 'participant_01' }] },
        lifeStateTransitions: { replayId: 'replay_010', transitionCandidates: anchors.map(anchor => ({ transitionKey: anchor.sourceTransitionKey, participantKey: anchor.participantKey, heroRefKey: anchor.heroRefKey, teamRefKey: anchor.teamRefKey, normalizedElapsedSecond: anchor.normalizedElapsedSecond })) },
        deathEventCandidates: { replayId: 'replay_010', candidates: anchors },
        corroborationEvidence: { replayId: 'replay_010', evidenceRows: anchors, summary: { confirmationEvidenceLevel: 'strong' } },
        observedTransitions,
        replayEndSecond
    };
}

function transition(index, family, second, direction) {
    return { observedTransitionKey: `directional_transition_${String(index).padStart(6, '0')}`, participantKey: 'participant_01', family, scope: 'linked_pawn', second, direction };
}

test('manifest predeclares fixed windows and blocks protected replay before parsing', () => {
    assert.equal(validateDirectionalCycleManifestShape(manifest()), true);
    assert.equal(buildDirectionalCyclePlan(manifest()).length, 4);
    assert.throws(() => validateDirectionalCycleManifestShape(manifest({ replays: [replay('replay_005'), replay('replay_011'), replay('replay_021'), replay('replay_036')] })), /forbidden replay/u);
    assert.throws(() => validateDirectionalCycleManifestShape(manifest({ temporalPolicy: { anchorWindowBeforeSeconds: 3 } })), /temporal policy/u);
});

test('anchor directions and later inverse transitions form abstract cycles without final facts', () => {
    const created = createDirectionalCycleArtifact(sources([
        transition(1, 'healthBoundary', 99, 'positive_to_non_positive_boundary_candidate'),
        transition(2, 'booleanAlive', 101, 'boolean_true_to_false_candidate'),
        transition(3, 'healthBoundary', 140, 'non_positive_to_positive_boundary_candidate'),
        transition(4, 'booleanAlive', 145, 'boolean_false_to_true_candidate')
    ]));
    assert.deepEqual(validateDirectionalCycleArtifact(created.artifact, schema), []);
    const row = created.artifact.evidenceRows[0];
    assert.equal(row.distinctAnchorSideSourceFamilyCount, 2);
    assert.equal(row.distinctCompleteCycleFamilyCount, 2);
    assert.equal(row.evidenceClass, 'anchor_with_multiple_complete_cycle_families');
    assert.equal(row.truthStatus, 'unconfirmed_candidate');
    assert.equal(row.finalFact, false);
    assert.equal(created.artifact.readiness.readyForFinalDeathFacts, false);
});

test('equidistant candidates are ambiguous and do not become positive directional evidence', () => {
    const artifact = createDirectionalCycleArtifact(sources([
        transition(1, 'healthBoundary', 99, 'positive_to_non_positive_boundary_candidate'),
        transition(2, 'healthBoundary', 101, 'positive_to_non_positive_boundary_candidate')
    ])).artifact;
    assert.equal(artifact.evidenceRows[0].anchorAssociationAmbiguous, true);
    assert.equal(artifact.evidenceRows[0].distinctAnchorSideSourceFamilyCount, 0);
    assert.equal(artifact.evidenceRows[0].evidenceClass, 'ambiguous');
});

test('one observed transition cannot be reused across anchors or later cycles', () => {
    const created = createDirectionalCycleArtifact(sources([
        transition(1, 'healthBoundary', 101, 'positive_to_non_positive_boundary_candidate'),
        transition(2, 'healthBoundary', 300, 'non_positive_to_positive_boundary_candidate')
    ]));
    assert.equal(created.artifact.summary.sourceTransitionReuseCount, 0);
    assert.equal(created.artifact.evidenceRows[0].distinctCompleteCycleFamilyCount, 0);
    assert.equal(created.artifact.evidenceRows[1].distinctAnchorSideSourceFamilyCount, 1);
});

test('negative controls and replay-end censoring remain neutral evidence measurements', () => {
    const artifact = createDirectionalCycleArtifact(sources([
        transition(1, 'healthBoundary', 100, 'positive_to_non_positive_boundary_candidate'),
        transition(2, 'healthBoundary', 150, 'non_positive_to_positive_boundary_candidate'),
        transition(3, 'healthBoundary', 210, 'positive_to_non_positive_boundary_candidate'),
        transition(4, 'healthBoundary', 230, 'non_positive_to_positive_boundary_candidate')
    ], 350)).artifact;
    assert.equal(artifact.summary.unanchoredDirectionalPatterns, 1);
    assert.equal(artifact.summary.unanchoredCompleteCycles, 1);
    assert.equal(artifact.evidenceRows[1].laterCycleWindowCensoredByReplayEnd, true);
    assert.equal(artifact.readiness.readyForFinalDeathSemanticContractDesign, false);
});

test('policy audit rejects final fact and attribution mutations', () => {
    const artifact = createDirectionalCycleArtifact(sources()).artifact;
    artifact.evidenceRows[0].finalFact = true;
    artifact.evidenceRows[0].victim = 'participant_01';
    const audit = auditDirectionalCyclePolicy(artifact);
    assert.equal(audit.outputPolicyStatus, 'failed');
    assert.ok(audit.forbiddenKeyPaths.some(key => key.endsWith('.victim')));
});
