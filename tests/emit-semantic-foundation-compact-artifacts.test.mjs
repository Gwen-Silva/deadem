import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';

import {
    FORBIDDEN_SURFACES,
    buildSemanticFoundationPlan,
    createSemanticFoundationArtifact,
    validateSemanticFoundationArtifact,
    validateSemanticFoundationManifestShape,
    validateSemanticFoundationOutputRoot
} from '../tools/emit-semantic-foundation-compact-artifacts.mjs';

function manifest(overrides = {}) {
    return {
        schemaVersion: 1,
        manifestId: 'test_semantic_foundation',
        runKind: 'task179-pilot',
        mode: 'semantic_foundation_compact_emission',
        artifactClass: 'semantic_foundation',
        replayProcessingAllowed: true,
        realArtifactEmissionAllowed: true,
        generationLabel: 'task_179',
        rawDataCaptured: false,
        fieldValuesCaptured: false,
        finalFactsProduced: false,
        gameplayInterpretationProduced: false,
        allowedReplays: [
            {
                replayId: 'replay_010',
                localPath: '.local/deadem/replays/inbox/partida_010.dem',
                selectionGroup: 'test',
                requestedMode: 'semantic_foundation_compact_emission',
                deathValidationArtifactPath: 'output/local-replay-processing/allowlisted-death-validation-batches/bounded_inbox_batch_pilot_32_task177/artifacts/replay_010/death_validation.json'
            }
        ],
        blockedReplays: ['replay_005', 'replay_006', 'replay_007', 'replay_008'],
        forbiddenOutputSurfaces: FORBIDDEN_SURFACES,
        ...overrides
    };
}

test('semantic foundation manifest requires explicit safe mode and surfaces', () => {
    const ok = manifest();
    assert.equal(validateSemanticFoundationManifestShape(ok), ok);
    assert.throws(() => validateSemanticFoundationManifestShape(manifest({ mode: 'death_validation_compact_emission' })), /manifest mode/u);
    assert.throws(() => validateSemanticFoundationManifestShape(manifest({ artifactClass: 'death_validation' })), /artifactClass/u);
    assert.throws(() => validateSemanticFoundationManifestShape(manifest({ finalFactsProduced: true })), /finalFactsProduced/u);
    assert.throws(() => validateSemanticFoundationManifestShape(manifest({ blockedReplays: ['replay_005'] })), /replay_006/u);
});

test('semantic foundation output root is fixed to the task run kind', () => {
    const ok = manifest();
    assert.equal(
        validateSemanticFoundationOutputRoot('output/local-replay-processing/semantic-foundation-compact/task179-pilot/', ok).normalized,
        'output/local-replay-processing/semantic-foundation-compact/task179-pilot/'
    );
    assert.throws(
        () => validateSemanticFoundationOutputRoot('output/replays/semantic-foundation-compact/task179-pilot/', ok),
        /summary output root must be exactly/u
    );
});

test('semantic foundation plan blocks protected, traversal, absolute, output replay, and unlisted inputs', () => {
    const requestedReplays = [
        {
            replayId: 'replay_005',
            localPath: '.local/deadem/replays/inbox/partida_005.dem',
            requestedMode: 'semantic_foundation_compact_emission'
        },
        {
            replayId: 'replay_006',
            localPath: '.local/deadem/replays/inbox/partida_006.dem',
            requestedMode: 'semantic_foundation_compact_emission'
        },
        {
            replayId: 'replay_010',
            localPath: '../partida_010.dem',
            requestedMode: 'semantic_foundation_compact_emission'
        },
        {
            replayId: 'replay_011',
            localPath: 'output/replays/replay_011.dem',
            requestedMode: 'semantic_foundation_compact_emission'
        },
        {
            replayId: 'replay_012',
            localPath: '.local/deadem/replays/inbox/partida_012.dem',
            requestedMode: 'semantic_foundation_compact_emission'
        }
    ];
    const plan = buildSemanticFoundationPlan(manifest({ requestedReplays }));
    assert.equal(plan.readyInputs.length, 0);
    assert.equal(plan.blockedReplayAudit.length, requestedReplays.length);
    assert.ok(plan.blockedReplayAudit.some(row => row.reasons.includes('protected_replay_005_final_holdout')));
    assert.ok(plan.blockedReplayAudit.some(row => row.reasons.includes('unsupported_bot_fixture_006_008')));
    assert.ok(plan.blockedReplayAudit.some(row => row.reasons.includes('path_traversal_forbidden')));
    assert.ok(plan.blockedReplayAudit.some(row => row.reasons.includes('output_replays_path_forbidden')));
    assert.ok(plan.blockedReplayAudit.some(row => row.reasons.includes('not_in_manifest_allowlist')));
});

test('semantic foundation artifact builder bridges death validation eventCount without final facts', async () => {
    const schema = JSON.parse(await readFile('schemas/semantic-foundation-compact.schema.json', 'utf8'));
    const artifact = createSemanticFoundationArtifact({
        replayId: 'replay_011',
        signals: {
            controllerCandidatesObserved: 12,
            participantSlotCandidatesObserved: 12,
            controllerToPawnLinkSignalAvailable: true,
            stableParticipantKeyPossible: true,
            heroSignalAvailable: true,
            teamSignalAvailable: true,
            deathCounterSignalAvailable: true,
            aliveDeadSignalAvailable: true,
            respawnSignalAvailable: true
        },
        timeSignals: {
            tickProgressionObserved: true,
            tickRateSignalAvailable: true,
            durationSignalAvailable: true
        },
        deathValidation: {
            found: true,
            eventCount: 37
        }
    });
    assert.deepEqual(validateSemanticFoundationArtifact(artifact, schema), []);
    assert.equal(artifact.deathValidationBridge.eventCount, 37);
    assert.equal(artifact.deathValidationBridge.canUseAsDeathEventSourceAlone, false);
    assert.equal(artifact.readiness.readyForCanonicalDeathEventDesign, false);
    assert.equal(artifact.rawDataCaptured, false);
    assert.equal(artifact.fieldValuesCaptured, false);
});

test('semantic foundation runner does not contain upstream/history mutation commands or final fact flags', async () => {
    const source = await readFile('tools/emit-semantic-foundation-compact-artifacts.mjs', 'utf8');
    assert.equal(/\bgit\s+(pull|merge|cherry-pick|rebase)\b/iu.test(source), false);
    assert.equal(/\bwsl(?:\.exe)?\b/iu.test(source), false);
    assert.equal(/finalFactsProduced:\s*true|gameplayInterpretationProduced:\s*true/u.test(source), false);
    assert.equal(/fieldValuesCaptured:\s*true|rawDataCaptured:\s*true/u.test(source), false);
});
