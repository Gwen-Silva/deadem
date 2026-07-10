import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
    FORBIDDEN_OUTPUT_KEYS,
    auditDeathEventPolicy,
    buildDeathEventPlan,
    createDeathEventCandidateArtifact,
    validateDeathEventCandidateArtifact,
    validateDeathEventManifestShape
} from '../tools/emit-death-event-candidates.mjs';

const schema = JSON.parse(await readFile('schemas/death-event-candidates.schema.json', 'utf8'));

function manifest(overrides = {}) {
    return {
        schemaVersion: 1,
        manifestId: 'test_death_event_candidates',
        runKind: 'task183-pilot',
        mode: 'death_event_candidates_emission',
        artifactClass: 'death_event_candidates',
        replayProcessingAllowed: false,
        replayFileAccessAllowed: false,
        realArtifactEmissionAllowed: true,
        generationLabel: 'task_183',
        rawDataCaptured: false,
        fieldValuesCaptured: false,
        rawTicksIncluded: false,
        rawTimestampsIncluded: false,
        finalFactsProduced: false,
        gameplayInterpretationProduced: false,
        attributionEmitted: false,
        allowedReplays: [
            {
                replayId: 'replay_010',
                requestedMode: 'death_event_candidates_emission',
                participantIdentityArtifactPath: 'output/local-replay-processing/participant-identity-compact/task180-bounded32/artifacts/replay_010/participant_identity.json',
                lifeStateTransitionArtifactPath: 'output/local-replay-processing/life-state-transition-candidates/task182-bounded32/artifacts/replay_010/life_state_transition_candidates.json'
            }
        ],
        blockedReplays: ['replay_005', 'replay_006', 'replay_007', 'replay_008'],
        forbiddenOutputSurfaces: [
            'player_names',
            'hero_names',
            'team_names',
            'raw_entity_ids',
            'raw_values',
            'raw_ticks',
            'raw_timestamps',
            'field_values',
            'map_positions',
            'attribution',
            'final_facts',
            'final_death_events',
            'final_respawn_events',
            'gameplay_interpretation'
        ],
        ...overrides
    };
}

function participantIdentity() {
    return {
        replayId: 'replay_010',
        participants: [
            {
                participantKey: 'participant_01',
                heroRefKey: 'hero_ref_03',
                teamRefKey: 'team_ref_07'
            }
        ]
    };
}

function lifeStateTransitions() {
    return {
        replayId: 'replay_010',
        transitionCandidates: [
            {
                transitionKey: 'life_transition_000001',
                participantKey: 'participant_01',
                normalizedElapsedSecond: 86,
                candidateConfidence: 'high'
            }
        ]
    };
}

test('manifest validation requires artifact-only mode and safety flags', () => {
    assert.equal(validateDeathEventManifestShape(manifest()).artifactClass, 'death_event_candidates');
    assert.throws(() => validateDeathEventManifestShape(manifest({ replayProcessingAllowed: true })), /replay processing/);
    assert.throws(() => validateDeathEventManifestShape(manifest({ replayFileAccessAllowed: true })), /replay file access/);
    assert.throws(() => validateDeathEventManifestShape(manifest({ generationLabel: 'task_182' })), /generationLabel/);
});

test('plan blocks protected replay and .dem paths before filesystem access', () => {
    const blocked = buildDeathEventPlan(manifest({
        requestedReplays: [
            {
                replayId: 'replay_005',
                requestedMode: 'death_event_candidates_emission',
                participantIdentityArtifactPath: 'output/local/replay_005.json',
                lifeStateTransitionArtifactPath: 'output/local/life.json'
            },
            {
                replayId: 'replay_010',
                requestedMode: 'death_event_candidates_emission',
                participantIdentityArtifactPath: '.local/deadem/replays/inbox/partida_010.dem',
                lifeStateTransitionArtifactPath: 'output/local/life.json'
            }
        ]
    }));
    assert.equal(blocked.readyInputs.length, 0);
    assert.equal(blocked.blockedReplayAudit.length, 2);
    assert.equal(blocked.blockedReplayAudit.every(row => row.replayFileAccessAttempted === false), true);
});

test('artifact transforms one life-state transition into one death-event candidate', () => {
    const artifact = createDeathEventCandidateArtifact({
        replayId: 'replay_010',
        participantIdentity: participantIdentity(),
        lifeStateTransitions: lifeStateTransitions()
    });
    assert.deepEqual(validateDeathEventCandidateArtifact(artifact, schema), []);
    assert.equal(artifact.candidateCount, 1);
    assert.equal(artifact.candidates[0].eventCandidateKey, 'death_event_candidate_000001');
    assert.equal(artifact.candidates[0].heroRefKey, 'hero_ref_03');
    assert.equal(artifact.candidates[0].teamRefKey, 'team_ref_07');
    assert.equal(artifact.candidates[0].deathTruthStatus, 'unconfirmed_candidate');
    assert.equal(artifact.candidates[0].finalFact, false);
    assert.equal(artifact.sourceBridge.matchStatus, 'matched');
});

test('policy audit rejects attribution, raw ids, and final facts', () => {
    const artifact = createDeathEventCandidateArtifact({
        replayId: 'replay_010',
        participantIdentity: participantIdentity(),
        lifeStateTransitions: lifeStateTransitions()
    });
    artifact.candidates[0].finalFact = true;
    artifact.killer = 'participant_02';
    artifact.rawEntityId = 123;
    const audit = auditDeathEventPolicy(artifact);
    assert.equal(audit.outputPolicyStatus, 'failed');
    assert.ok(audit.forbiddenKeyPaths.includes('killer'));
    assert.ok(audit.forbiddenKeyPaths.includes('rawEntityId'));
    assert.ok(audit.rowViolations.some(row => row.includes('finalFact')));
});

test('forbidden output keys include final facts and attribution but permit synthetic refs', () => {
    for (const key of ['killer', 'victim', 'assist', 'rawEntityId', 'tick', 'timestamp', 'deathEvents', 'confirmedDeath']) {
        assert.equal(FORBIDDEN_OUTPUT_KEYS.has(key), true);
    }
    assert.equal(FORBIDDEN_OUTPUT_KEYS.has('participantKey'), false);
    assert.equal(FORBIDDEN_OUTPUT_KEYS.has('heroRefKey'), false);
    assert.equal(FORBIDDEN_OUTPUT_KEYS.has('teamRefKey'), false);
    assert.equal(FORBIDDEN_OUTPUT_KEYS.has('normalizedElapsedSecond'), false);
});
