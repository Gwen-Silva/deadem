import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';

import {
    FORBIDDEN_SURFACES,
    buildAliveDeadRespawnPlan,
    createAliveDeadRespawnArtifact,
    runAliveDeadRespawnEmission,
    validateAliveDeadRespawnArtifact,
    validateAliveDeadRespawnManifestShape,
    validateAliveDeadRespawnOutputRoot
} from '../tools/emit-alive-dead-respawn-compact-artifacts.mjs';

function manifest(overrides = {}) {
    return {
        schemaVersion: 1,
        manifestId: 'test_alive_dead_respawn',
        runKind: 'task181-pilot',
        mode: 'alive_dead_respawn_compact_emission',
        artifactClass: 'alive_dead_respawn',
        replayProcessingAllowed: true,
        realArtifactEmissionAllowed: true,
        generationLabel: 'task_181',
        rawDataCaptured: false,
        fieldValuesCaptured: false,
        finalFactsProduced: false,
        gameplayInterpretationProduced: false,
        allowedReplays: [
            {
                replayId: 'replay_010',
                localPath: '.local/deadem/replays/inbox/partida_010.dem',
                selectionGroup: 'test',
                requestedMode: 'alive_dead_respawn_compact_emission',
                participantIdentityArtifactPath: 'output/local-replay-processing/participant-identity-compact/task180-bounded32/artifacts/replay_010/participant_identity.json',
                semanticFoundationArtifactPath: 'output/local-replay-processing/semantic-foundation-compact/task179-bounded32/artifacts/replay_010/semantic_foundation.json',
                deathValidationArtifactPath: 'output/local-replay-processing/allowlisted-death-validation-batches/bounded_inbox_batch_pilot_32_task177/artifacts/replay_010/death_validation.json'
            }
        ],
        blockedReplays: ['replay_005', 'replay_006', 'replay_007', 'replay_008'],
        forbiddenOutputSurfaces: FORBIDDEN_SURFACES,
        ...overrides
    };
}

test('alive dead respawn manifest requires explicit compact contract', () => {
    const ok = manifest();
    assert.equal(validateAliveDeadRespawnManifestShape(ok), ok);
    assert.throws(() => validateAliveDeadRespawnManifestShape(manifest({ mode: 'participant_identity_compact_emission' })), /manifest mode/u);
    assert.throws(() => validateAliveDeadRespawnManifestShape(manifest({ artifactClass: 'participant_identity' })), /artifactClass/u);
    assert.throws(() => validateAliveDeadRespawnManifestShape(manifest({ rawDataCaptured: true })), /rawDataCaptured/u);
    assert.throws(() => validateAliveDeadRespawnManifestShape(manifest({ blockedReplays: ['replay_005'] })), /replay_006/u);
});

test('alive dead respawn output root is fixed to task run kind', () => {
    assert.equal(
        validateAliveDeadRespawnOutputRoot('output/local-replay-processing/alive-dead-respawn-compact/task181-pilot/', manifest()).normalized,
        'output/local-replay-processing/alive-dead-respawn-compact/task181-pilot/'
    );
    assert.throws(
        () => validateAliveDeadRespawnOutputRoot('output/replays/alive-dead-respawn-compact/task181-pilot/', manifest()),
        /summary output root must be exactly/u
    );
});

test('alive dead respawn plan blocks protected, traversal, output replay, and unlisted inputs', () => {
    const requestedReplays = [
        {
            replayId: 'replay_005',
            localPath: '.local/deadem/replays/inbox/partida_005.dem',
            requestedMode: 'alive_dead_respawn_compact_emission'
        },
        {
            replayId: 'replay_006',
            localPath: '.local/deadem/replays/inbox/partida_006.dem',
            requestedMode: 'alive_dead_respawn_compact_emission'
        },
        {
            replayId: 'replay_010',
            localPath: '../partida_010.dem',
            requestedMode: 'alive_dead_respawn_compact_emission'
        },
        {
            replayId: 'replay_011',
            localPath: 'output/replays/replay_011.dem',
            requestedMode: 'alive_dead_respawn_compact_emission'
        },
        {
            replayId: 'replay_012',
            localPath: '.local/deadem/replays/inbox/partida_012.dem',
            requestedMode: 'alive_dead_respawn_compact_emission'
        }
    ];
    const plan = buildAliveDeadRespawnPlan(manifest({ requestedReplays }));
    assert.equal(plan.readyInputs.length, 0);
    assert.equal(plan.blockedReplayAudit.length, requestedReplays.length);
    assert.ok(plan.blockedReplayAudit.some(row => row.reasons.includes('protected_replay_005_final_holdout')));
    assert.ok(plan.blockedReplayAudit.some(row => row.reasons.includes('unsupported_bot_fixture_006_008')));
    assert.ok(plan.blockedReplayAudit.some(row => row.reasons.includes('path_traversal_forbidden')));
    assert.ok(plan.blockedReplayAudit.some(row => row.reasons.includes('output_replays_path_forbidden')));
    assert.ok(plan.blockedReplayAudit.some(row => row.reasons.includes('not_in_manifest_allowlist')));
});

test('alive dead respawn artifact validates bridge counts without transition rows', async () => {
    const schema = JSON.parse(await readFile('schemas/alive-dead-respawn-compact.schema.json', 'utf8'));
    const artifact = createAliveDeadRespawnArtifact({
        replayId: 'replay_021',
        participantIdentity: {
            participantCount: 1,
            participantIdentityStatus: 'available',
            participants: [{ participantKey: 'participant_01', lifeStateSignalStatus: 'available' }],
            lifeStateFoundation: {
                deathCounterCoverageStatus: 'available',
                aliveDeadSignalCoverageStatus: 'available',
                respawnSignalCoverageStatus: 'available'
            },
            readiness: { readyForAliveDeadRespawnArtifact: true }
        },
        semanticFoundation: { readiness: { readyForAliveDeadRespawnArtifact: true } },
        deathValidation: { eventCount: 3, duplicateKeyCount: 0 }
    });
    assert.deepEqual(validateAliveDeadRespawnArtifact(artifact, schema), []);
    assert.equal(artifact.transitionCandidateSummary.deathCounterIncrementCandidates, 3);
    assert.equal(artifact.transitionCandidates.length, 0);
    assert.equal(artifact.readiness.readyForCanonicalDeathEventDesign, false);
});

test('alive dead respawn runner can emit from compact prior artifacts without replay parsing', async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), 'alive-dead-respawn-'));
    try {
        const result = await runAliveDeadRespawnEmission({
            manifest: manifest(),
            summaryOutput: 'output/local-replay-processing/alive-dead-respawn-compact/task181-pilot/'
        });
        assert.equal(result.gate.gate, 'alive_dead_respawn_compact_pilot_ready');
        assert.equal(result.artifacts.length, 1);
        assert.equal(result.perReplayStatus[0].parseAttempted, false);
        assert.equal(result.perReplayStatus[0].openReadStreamAttempted, false);
    } finally {
        await rm(temp, { recursive: true, force: true });
    }
});

test('alive dead respawn runner source avoids unsafe commands and final fact flags', async () => {
    const source = await readFile('tools/emit-alive-dead-respawn-compact-artifacts.mjs', 'utf8');
    assert.equal(/\bgit\s+(pull|merge|cherry-pick|rebase)\b/iu.test(source), false);
    assert.equal(/\bwsl(?:\.exe)?\b/iu.test(source), false);
    assert.equal(/finalFactsProduced:\s*true|gameplayInterpretationProduced:\s*true/u.test(source), false);
    assert.equal(/fieldValuesCaptured:\s*true|rawDataCaptured:\s*true/u.test(source), false);
    assert.equal(/rawTicksIncluded:\s*true|rawTimestampsIncluded:\s*true/u.test(source), false);
    assert.equal(/deathEventsEmitted:\s*true|respawnEventsEmitted:\s*true|attributionEmitted:\s*true/u.test(source), false);
});
