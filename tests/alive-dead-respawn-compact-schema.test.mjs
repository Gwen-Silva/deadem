import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';

import {
    auditAliveDeadRespawnPolicy,
    createAliveDeadRespawnArtifact,
    validateAliveDeadRespawnArtifact
} from '../tools/emit-alive-dead-respawn-compact-artifacts.mjs';

async function loadSchema() {
    return JSON.parse(await readFile('schemas/alive-dead-respawn-compact.schema.json', 'utf8'));
}

function validInputs(overrides = {}) {
    return {
        replayId: 'replay_010',
        participantIdentity: {
            artifactClass: 'participant_identity',
            generatedAt: 'task_180',
            rawDataCaptured: false,
            fieldValuesCaptured: false,
            finalFactsProduced: false,
            participantCount: 2,
            participantIdentityStatus: 'available',
            participants: [
                { participantKey: 'participant_01', lifeStateSignalStatus: 'available' },
                { participantKey: 'participant_02', lifeStateSignalStatus: 'available' }
            ],
            lifeStateFoundation: {
                deathCounterCoverageStatus: 'available',
                aliveDeadSignalCoverageStatus: 'available',
                respawnSignalCoverageStatus: 'available',
                readyForAliveDeadRespawnArtifact: true
            },
            readiness: { readyForAliveDeadRespawnArtifact: true }
        },
        semanticFoundation: {
            artifactClass: 'semantic_foundation',
            generatedAt: 'task_179',
            rawDataCaptured: false,
            fieldValuesCaptured: false,
            finalFactsProduced: false,
            readiness: { readyForAliveDeadRespawnArtifact: true }
        },
        deathValidation: {
            artifactClass: 'death_validation',
            generatedAt: 'task_177',
            rawDataCaptured: false,
            finalFactsProduced: false,
            eventCount: 7,
            duplicateKeyCount: 1
        },
        ...overrides
    };
}

function validArtifact(overrides = {}) {
    return {
        ...createAliveDeadRespawnArtifact(validInputs()),
        ...overrides
    };
}

test('alive dead respawn schema accepts compact non-final candidate summary', async () => {
    const schema = await loadSchema();
    const artifact = validArtifact();
    assert.deepEqual(validateAliveDeadRespawnArtifact(artifact, schema), []);
    assert.equal(auditAliveDeadRespawnPolicy(artifact).policyStatus, 'passed');
    assert.equal(artifact.generatedAt, 'task_181');
    assert.equal(artifact.transitionCandidateSummary.deathCounterIncrementCandidates, 7);
    assert.equal(artifact.transitionCandidates.length, 0);
    assert.equal(artifact.deathValidationBridge.deathCounterIncrementCandidatesMatchDeathValidation, true);
    assert.equal(artifact.readiness.readyForCanonicalDeathEventDesign, false);
});

test('alive dead respawn schema accepts policy-safe transition candidate rows', async () => {
    const schema = await loadSchema();
    const artifact = validArtifact({
        transitionCandidates: [
            {
                transitionKey: 'life_transition_000001',
                participantKey: 'participant_01',
                transitionType: 'death_counter_increment_candidate',
                timeRefKey: 'time_ref_000001',
                normalizedElapsedSecond: 742,
                sourceSignalStatus: 'available',
                candidateConfidence: 'medium',
                finalFact: false
            }
        ]
    });
    assert.deepEqual(validateAliveDeadRespawnArtifact(artifact, schema), []);
    assert.equal(auditAliveDeadRespawnPolicy(artifact).policyStatus, 'passed');
});

test('alive dead respawn rejects final facts, names, raw ids, raw ticks, and attribution', async () => {
    const schema = await loadSchema();
    assert.match(validateAliveDeadRespawnArtifact(validArtifact({ finalFactsProduced: true }), schema).join('\n'), /finalFactsProduced must be false/u);
    assert.match(validateAliveDeadRespawnArtifact(validArtifact({ playerNamesIncluded: true }), schema).join('\n'), /playerNamesIncluded must be false/u);
    assert.match(validateAliveDeadRespawnArtifact(validArtifact({ entityIdsIncluded: true }), schema).join('\n'), /entityIdsIncluded must be false/u);
    assert.match(validateAliveDeadRespawnArtifact(validArtifact({ rawTicksIncluded: true }), schema).join('\n'), /rawTicksIncluded must be false/u);
    assert.match(validateAliveDeadRespawnArtifact(validArtifact({ attributionEmitted: true }), schema).join('\n'), /attributionEmitted must be false/u);
});

test('alive dead respawn transition rows remain candidates, not facts', async () => {
    const schema = await loadSchema();
    const artifact = validArtifact({
        transitionCandidates: [
            {
                transitionKey: 'life_transition_000001',
                participantKey: 'participant_01',
                transitionType: 'respawn_signal_candidate',
                timeRefKey: 'time_ref_000001',
                normalizedElapsedSecond: 20,
                sourceSignalStatus: 'available',
                candidateConfidence: 'low',
                finalFact: true
            }
        ]
    });
    assert.match(validateAliveDeadRespawnArtifact(artifact, schema).join('\n'), /finalFact must be false/u);
});

test('alive dead respawn policy rejects forbidden raw/value-bearing keys', () => {
    const artifact = {
        ...validArtifact(),
        steamId: 'forbidden'
    };
    assert.equal(auditAliveDeadRespawnPolicy(artifact).policyStatus, 'failed');
});
