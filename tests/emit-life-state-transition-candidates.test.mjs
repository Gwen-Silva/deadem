import assert from 'node:assert/strict';
import test from 'node:test';
import {
    FORBIDDEN_OUTPUT_KEYS,
    buildLifeStatePlan,
    createLifeStateTransitionArtifact,
    validateLifeStateManifestShape,
    validateLifeStateTransitionArtifact,
    auditLifeStatePolicy
} from '../tools/emit-life-state-transition-candidates.mjs';
import { readFile } from 'node:fs/promises';

const schema = JSON.parse(await readFile('schemas/life-state-transition-candidates.schema.json', 'utf8'));

function manifest(overrides = {}) {
    return {
        schemaVersion: 1,
        manifestId: 'test_life_state_transition_candidates',
        runKind: 'task182-pilot',
        mode: 'life_state_transition_candidates_emission',
        artifactClass: 'life_state_transition_candidates',
        replayProcessingAllowed: true,
        realArtifactEmissionAllowed: true,
        generationLabel: 'task_182',
        rawDataCaptured: false,
        fieldValuesCaptured: false,
        rawTicksIncluded: false,
        rawTimestampsIncluded: false,
        finalFactsProduced: false,
        gameplayInterpretationProduced: false,
        allowedReplays: [
            {
                replayId: 'replay_010',
                localPath: '.local/deadem/replays/inbox/partida_010.dem',
                requestedMode: 'life_state_transition_candidates_emission',
                participantIdentityArtifactPath: 'output/local-replay-processing/participant-identity-compact/task180-bounded32/artifacts/replay_010/participant_identity.json',
                deathValidationArtifactPath: 'output/local-replay-processing/allowlisted-death-validation-batches/bounded_inbox_batch_pilot_32_task177/artifacts/replay_010/death_validation.json'
            }
        ],
        blockedReplays: ['replay_005', 'replay_006', 'replay_007', 'replay_008'],
        forbiddenOutputSurfaces: [
            'player_names',
            'hero_names',
            'team_names',
            'raw_entity_ids',
            'raw_handles',
            'account_ids',
            'steam_ids',
            'raw_player_slots',
            'raw_hero_ids',
            'raw_team_numbers',
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

function validArtifact(overrides = {}) {
    return createLifeStateTransitionArtifact({
        replayId: 'replay_010',
        transitionCandidates: [
            {
                transitionKey: 'life_transition_000001',
                participantKey: 'participant_01',
                transitionType: 'death_counter_increment_candidate',
                timeRefKey: 'time_ref_000001',
                normalizedElapsedSecond: 742,
                sourceSignal: 'controller_death_counter_increment',
                sourceSignalStatus: 'available',
                candidateConfidence: 'high',
                finalFact: false
            }
        ],
        unmappedParticipantCandidates: 0,
        deathValidation: { found: true, eventCount: 1 },
        ...overrides
    });
}

test('manifest validation requires explicit Task 182 policy flags', () => {
    assert.equal(validateLifeStateManifestShape(manifest()).artifactClass, 'life_state_transition_candidates');
    assert.throws(() => validateLifeStateManifestShape(manifest({ rawTicksIncluded: true })), /rawTicksIncluded/);
    assert.throws(() => validateLifeStateManifestShape(manifest({ generationLabel: 'task_181' })), /generationLabel/);
});

test('plan blocks protected and non-manifest replays before filesystem access', () => {
    const blocked = buildLifeStatePlan(manifest({
        requestedReplays: [
            { replayId: 'replay_005', localPath: '.local/deadem/replays/inbox/partida_005.dem', requestedMode: 'life_state_transition_candidates_emission' },
            { replayId: 'replay_999', localPath: '.local/deadem/replays/inbox/partida_999.dem', requestedMode: 'life_state_transition_candidates_emission' }
        ]
    }));
    assert.equal(blocked.readyInputs.length, 0);
    assert.equal(blocked.blockedReplayAudit.length, 2);
    assert.equal(blocked.blockedReplayAudit.every(row => row.filesystemAccessAttempted === false), true);
});

test('artifact validation accepts replay-sourced transition rows and rejects fabricated empty rows', () => {
    const artifact = validArtifact();
    assert.deepEqual(validateLifeStateTransitionArtifact(artifact, schema), []);
    assert.equal(artifact.transitionCandidateSummary.totalTransitionCandidates, 1);
    assert.equal(artifact.deathValidationBridge.bridgeMatchStatus, 'matched');

    const empty = validArtifact({ transitionCandidates: [], deathValidation: { found: true, eventCount: 1 } });
    assert.ok(validateLifeStateTransitionArtifact(empty, schema).some(error => error.includes('transitionCandidates')));
});

test('policy audit rejects raw identifiers and final facts', () => {
    const artifact = validArtifact();
    artifact.transitionCandidates[0].finalFact = true;
    artifact.playerSlot = 1;
    const audit = auditLifeStatePolicy(artifact);
    assert.equal(audit.outputPolicyStatus, 'failed');
    assert.ok(audit.forbiddenKeyPaths.includes('playerSlot'));
    assert.ok(audit.rowViolations.some(row => row.includes('finalFact')));
});

test('forbidden output key set includes raw identity and timing fields but permits normalized elapsed seconds', () => {
    for (const key of ['accountId', 'steamId', 'playerSlot', 'entityId', 'rawTick', 'rawTimestamp', 'killer', 'victim']) {
        assert.equal(FORBIDDEN_OUTPUT_KEYS.has(key), true);
    }
    assert.equal(FORBIDDEN_OUTPUT_KEYS.has('normalizedElapsedSecond'), false);
    assert.equal(FORBIDDEN_OUTPUT_KEYS.has('participantKey'), false);
});
