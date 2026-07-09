import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';

import {
    FORBIDDEN_SURFACES,
    buildParticipantIdentityPlan,
    createParticipantIdentityArtifact,
    validateParticipantIdentityArtifact,
    validateParticipantIdentityManifestShape,
    validateParticipantIdentityOutputRoot
} from '../tools/emit-participant-identity-compact-artifacts.mjs';

function manifest(overrides = {}) {
    return {
        schemaVersion: 1,
        manifestId: 'test_participant_identity',
        runKind: 'task180-pilot',
        mode: 'participant_identity_compact_emission',
        artifactClass: 'participant_identity',
        replayProcessingAllowed: true,
        realArtifactEmissionAllowed: true,
        generationLabel: 'task_180',
        rawDataCaptured: false,
        fieldValuesCaptured: false,
        finalFactsProduced: false,
        gameplayInterpretationProduced: false,
        allowedReplays: [
            {
                replayId: 'replay_010',
                localPath: '.local/deadem/replays/inbox/partida_010.dem',
                selectionGroup: 'test',
                requestedMode: 'participant_identity_compact_emission',
                semanticFoundationArtifactPath: 'output/local-replay-processing/semantic-foundation-compact/task179-bounded32/artifacts/replay_010/semantic_foundation.json',
                deathValidationArtifactPath: 'output/local-replay-processing/allowlisted-death-validation-batches/bounded_inbox_batch_pilot_32_task177/artifacts/replay_010/death_validation.json'
            }
        ],
        blockedReplays: ['replay_005', 'replay_006', 'replay_007', 'replay_008'],
        forbiddenOutputSurfaces: FORBIDDEN_SURFACES,
        ...overrides
    };
}

test('participant identity manifest requires explicit compact identity contract', () => {
    const ok = manifest();
    assert.equal(validateParticipantIdentityManifestShape(ok), ok);
    assert.throws(() => validateParticipantIdentityManifestShape(manifest({ mode: 'semantic_foundation_compact_emission' })), /manifest mode/u);
    assert.throws(() => validateParticipantIdentityManifestShape(manifest({ artifactClass: 'semantic_foundation' })), /artifactClass/u);
    assert.throws(() => validateParticipantIdentityManifestShape(manifest({ fieldValuesCaptured: true })), /fieldValuesCaptured/u);
    assert.throws(() => validateParticipantIdentityManifestShape(manifest({ blockedReplays: ['replay_005'] })), /replay_006/u);
});

test('participant identity output root is fixed to task run kind', () => {
    assert.equal(
        validateParticipantIdentityOutputRoot('output/local-replay-processing/participant-identity-compact/task180-pilot/', manifest()).normalized,
        'output/local-replay-processing/participant-identity-compact/task180-pilot/'
    );
    assert.throws(
        () => validateParticipantIdentityOutputRoot('output/replays/participant-identity-compact/task180-pilot/', manifest()),
        /summary output root must be exactly/u
    );
});

test('participant identity plan blocks protected, traversal, output replay, and unlisted inputs', () => {
    const requestedReplays = [
        {
            replayId: 'replay_005',
            localPath: '.local/deadem/replays/inbox/partida_005.dem',
            requestedMode: 'participant_identity_compact_emission'
        },
        {
            replayId: 'replay_006',
            localPath: '.local/deadem/replays/inbox/partida_006.dem',
            requestedMode: 'participant_identity_compact_emission'
        },
        {
            replayId: 'replay_010',
            localPath: '../partida_010.dem',
            requestedMode: 'participant_identity_compact_emission'
        },
        {
            replayId: 'replay_011',
            localPath: 'output/replays/replay_011.dem',
            requestedMode: 'participant_identity_compact_emission'
        },
        {
            replayId: 'replay_012',
            localPath: '.local/deadem/replays/inbox/partida_012.dem',
            requestedMode: 'participant_identity_compact_emission'
        }
    ];
    const plan = buildParticipantIdentityPlan(manifest({ requestedReplays }));
    assert.equal(plan.readyInputs.length, 0);
    assert.equal(plan.blockedReplayAudit.length, requestedReplays.length);
    assert.ok(plan.blockedReplayAudit.some(row => row.reasons.includes('protected_replay_005_final_holdout')));
    assert.ok(plan.blockedReplayAudit.some(row => row.reasons.includes('unsupported_bot_fixture_006_008')));
    assert.ok(plan.blockedReplayAudit.some(row => row.reasons.includes('path_traversal_forbidden')));
    assert.ok(plan.blockedReplayAudit.some(row => row.reasons.includes('output_replays_path_forbidden')));
    assert.ok(plan.blockedReplayAudit.some(row => row.reasons.includes('not_in_manifest_allowlist')));
});

test('participant identity artifact validates synthetic participant refs without raw ids', async () => {
    const schema = JSON.parse(await readFile('schemas/participant-identity-compact.schema.json', 'utf8'));
    const artifact = createParticipantIdentityArtifact({
        replayId: 'replay_021',
        participantRecords: [
            {
                participantSeed: '10',
                samples: 4,
                controllerObserved: true,
                pawnSeed: 'pawn-x',
                teamSeed: 'team-a',
                heroSeed: 'hero-a',
                deathCounter: true,
                aliveDead: true,
                respawn: false
            }
        ],
        timeSignals: { tickProgressionObserved: true },
        semanticFoundation: { timeSignals: { timeNormalizationStatus: 'available' } },
        deathValidation: { found: true, eventCount: 7 }
    });
    assert.deepEqual(validateParticipantIdentityArtifact(artifact, schema), []);
    assert.equal(artifact.participantCount, 1);
    assert.equal(artifact.participants[0].participantKey, 'participant_01');
    assert.equal(artifact.deathValidationBridge.canUseAsDeathEventSourceAlone, false);
    assert.equal(artifact.readiness.readyForCanonicalDeathEventDesign, false);
});

test('participant identity runner source avoids unsafe commands and final fact flags', async () => {
    const source = await readFile('tools/emit-participant-identity-compact-artifacts.mjs', 'utf8');
    assert.equal(/\bgit\s+(pull|merge|cherry-pick|rebase)\b/iu.test(source), false);
    assert.equal(/\bwsl(?:\.exe)?\b/iu.test(source), false);
    assert.equal(/finalFactsProduced:\s*true|gameplayInterpretationProduced:\s*true/u.test(source), false);
    assert.equal(/fieldValuesCaptured:\s*true|rawDataCaptured:\s*true/u.test(source), false);
    assert.equal(/deathEventsEmitted:\s*true|attributionEmitted:\s*true/u.test(source), false);
});
