import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
    auditCorroborationPolicy,
    buildCorroborationPlan,
    createCorroborationArtifact,
    validateCorroborationArtifact,
    validateCorroborationManifestShape
} from '../tools/emit-death-event-corroboration-evidence.mjs';

const schema = JSON.parse(await readFile('schemas/death-event-corroboration-evidence.schema.json', 'utf8'));

function manifest(overrides = {}) {
    return {
        schemaVersion: 1,
        manifestId: 'task184_test',
        runKind: 'task184-pilot',
        mode: 'death_event_corroboration_evidence_emission',
        artifactClass: 'death_event_corroboration_evidence',
        replayProcessingAllowed: true,
        realArtifactEmissionAllowed: true,
        generationLabel: 'task_184',
        rawDataCaptured: false,
        fieldValuesCaptured: false,
        rawIdsIncluded: false,
        rawTicksIncluded: false,
        rawTimestampsIncluded: false,
        finalFactsProduced: false,
        gameplayInterpretationProduced: false,
        attributionEmitted: false,
        temporalWindows: {
            nearEventBeforeSeconds: 2,
            nearEventAfterSeconds: 2,
            laterCycleAfterSecondsExclusive: 0,
            laterCycleMaxSecondsInclusive: 180
        },
        allowedReplays: [{
            replayId: 'replay_010',
            localPath: '.local/deadem/replays/inbox/partida_010.dem',
            requestedMode: 'death_event_corroboration_evidence_emission',
            participantIdentityArtifactPath: 'output/local-replay-processing/participant-identity-compact/task180-bounded32/artifacts/replay_010/participant_identity.json',
            lifeStateTransitionArtifactPath: 'output/local-replay-processing/life-state-transition-candidates/task182-bounded32/artifacts/replay_010/life_state_transition_candidates.json',
            deathEventCandidateArtifactPath: 'output/local-replay-processing/death-event-candidates/task183-bounded32/artifacts/replay_010/death_event_candidates.json'
        }],
        blockedReplays: ['replay_005', 'replay_006', 'replay_007', 'replay_008'],
        forbiddenOutputSurfaces: [
            'player_names', 'hero_names', 'team_names', 'raw_entity_ids', 'raw_handles', 'account_ids',
            'steam_ids', 'raw_player_slots', 'raw_hero_ids', 'raw_team_numbers', 'raw_values', 'raw_ticks',
            'raw_timestamps', 'field_values', 'map_positions', 'damage', 'objectives', 'attribution',
            'final_facts', 'final_death_events', 'final_respawn_events', 'teamfights', 'gameplay_interpretation'
        ],
        ...overrides
    };
}

function sources(signalTransitions = []) {
    return {
        replayId: 'replay_010',
        participantIdentity: {
            participants: [{ participantKey: 'participant_01', heroRefKey: 'hero_ref_01', teamRefKey: 'team_ref_01' }]
        },
        lifeStateTransitions: {
            transitionCandidates: [
                { transitionKey: 'life_transition_000001', participantKey: 'participant_01', normalizedElapsedSecond: 100 },
                { transitionKey: 'life_transition_000002', participantKey: 'participant_01', normalizedElapsedSecond: 300 }
            ]
        },
        deathEventCandidates: {
            candidates: [
                { eventCandidateKey: 'death_event_candidate_000001', sourceTransitionKey: 'life_transition_000001', participantKey: 'participant_01', heroRefKey: 'hero_ref_01', teamRefKey: 'team_ref_01', normalizedElapsedSecond: 100 },
                { eventCandidateKey: 'death_event_candidate_000002', sourceTransitionKey: 'life_transition_000002', participantKey: 'participant_01', heroRefKey: 'hero_ref_01', teamRefKey: 'team_ref_01', normalizedElapsedSecond: 300 }
            ]
        },
        signalTransitions
    };
}

test('manifest requires fixed temporal windows and explicit policy flags', () => {
    assert.equal(validateCorroborationManifestShape(manifest()).artifactClass, 'death_event_corroboration_evidence');
    assert.throws(() => validateCorroborationManifestShape(manifest({ rawIdsIncluded: true })), /rawIdsIncluded/u);
    assert.throws(() => validateCorroborationManifestShape(manifest({ temporalWindows: { nearEventBeforeSeconds: 3 } })), /temporal windows/u);
});

test('plan blocks protected replay before any filesystem access', () => {
    const plan = buildCorroborationPlan(manifest({
        requestedReplays: [{
            replayId: 'replay_005',
            localPath: '.local/deadem/replays/inbox/partida_005.dem',
            requestedMode: 'death_event_corroboration_evidence_emission'
        }]
    }));
    assert.equal(plan.readyInputs.length, 0);
    assert.equal(plan.blockedReplayAudit.length, 1);
    assert.equal(plan.blockedReplayAudit[0].replayFileAccessAttempted, false);
});

test('independent signals associate within declared windows without confirming death', () => {
    const created = createCorroborationArtifact(sources([
        { signalKey: 'observed_signal_000001', participantKey: 'participant_01', category: 'life', normalizedElapsedSecond: 99 },
        { signalKey: 'observed_signal_000002', participantKey: 'participant_01', category: 'pawn_link', normalizedElapsedSecond: 101 },
        { signalKey: 'observed_signal_000003', participantKey: 'participant_01', category: 'respawn', normalizedElapsedSecond: 140 }
    ]));
    assert.deepEqual(validateCorroborationArtifact(created.artifact, schema), []);
    assert.equal(created.bridge.anchorBridgeStatus, 'passed');
    assert.deepEqual(created.bridge.mismatchRows, []);
    assert.equal('rows' in created.bridge, false);
    assert.equal(created.artifact.evidenceRows[0].evidenceClass, 'counter_plus_multiple_independent_signals');
    assert.equal(created.artifact.evidenceRows[0].normalizedRespawnSignalDeltaSecond, 40);
    assert.equal(created.artifact.evidenceRows[0].confirmationStatus, 'unconfirmed');
    assert.equal(created.artifact.evidenceRows[0].finalFact, false);
});

test('absence remains counter-only and is not converted into positive evidence', () => {
    const artifact = createCorroborationArtifact(sources()).artifact;
    assert.equal(artifact.evidenceRows.every(row => row.evidenceClass === 'counter_only'), true);
    assert.equal(artifact.evidenceRows.every(row => row.normalizedLifeSignalDeltaSecond === null), true);
    assert.equal(artifact.summary.confirmationEvidenceLevel, 'insufficient');
    assert.equal(artifact.independence.absenceConvertedToPositiveCandidate, false);
});

test('equidistant signal transitions are recorded as ambiguous rather than positive', () => {
    const artifact = createCorroborationArtifact(sources([
        { signalKey: 'observed_signal_000001', participantKey: 'participant_01', category: 'life', normalizedElapsedSecond: 99 },
        { signalKey: 'observed_signal_000002', participantKey: 'participant_01', category: 'life', normalizedElapsedSecond: 101 }
    ])).artifact;
    assert.equal(artifact.evidenceRows[0].evidenceClass, 'ambiguous');
    assert.equal(artifact.evidenceRows[0].lifeSignalChangeCandidateObserved, false);
    assert.equal(artifact.evidenceRows[0].normalizedLifeSignalDeltaSecond, null);
});

test('policy audit rejects attribution and final-fact mutations', () => {
    const artifact = createCorroborationArtifact(sources()).artifact;
    artifact.evidenceRows[0].finalFact = true;
    artifact.evidenceRows[0].killer = 'participant_02';
    const audit = auditCorroborationPolicy(artifact);
    assert.equal(audit.outputPolicyStatus, 'failed');
    assert.ok(audit.forbiddenKeyPaths.some(key => key.endsWith('.killer')));
});

test('Task 183 gate source enforces both artifact and total-run limits', async () => {
    const source = await readFile('tools/emit-death-event-candidates.mjs', 'utf8');
    assert.match(source, /sizeRows\.every\(row => row\.sizeStatus === 'passed'\)/u);
    assert.match(source, /totalRunSizeStatus === 'passed'/u);
});
