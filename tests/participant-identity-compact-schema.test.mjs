import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';

import {
    auditParticipantIdentityPolicy,
    createParticipantIdentityArtifact,
    validateParticipantIdentityArtifact
} from '../tools/emit-participant-identity-compact-artifacts.mjs';

async function loadSchema() {
    return JSON.parse(await readFile('schemas/participant-identity-compact.schema.json', 'utf8'));
}

function validArtifact(overrides = {}) {
    const artifact = createParticipantIdentityArtifact({
        replayId: 'replay_010',
        participantRecords: [
            {
                participantSeed: '0',
                samples: 3,
                controllerObserved: true,
                pawnSeed: 'pawn-a',
                teamSeed: 'team-a',
                heroSeed: 'hero-a',
                deathCounter: true,
                aliveDead: true,
                respawn: true
            },
            {
                participantSeed: '1',
                samples: 3,
                controllerObserved: true,
                pawnSeed: 'pawn-b',
                teamSeed: 'team-b',
                heroSeed: 'hero-b',
                deathCounter: true,
                aliveDead: true,
                respawn: true
            }
        ],
        timeSignals: { tickProgressionObserved: true },
        semanticFoundation: {
            timeSignals: { timeNormalizationStatus: 'available' }
        },
        deathValidation: {
            found: true,
            eventCount: 45
        }
    });
    return { ...artifact, ...overrides };
}

test('participant identity schema accepts compact synthetic refs only', async () => {
    const schema = await loadSchema();
    const artifact = validArtifact();
    assert.deepEqual(validateParticipantIdentityArtifact(artifact, schema), []);
    assert.equal(auditParticipantIdentityPolicy(artifact).policyStatus, 'passed');
    assert.equal(artifact.generatedAt, 'task_180');
    assert.equal(artifact.participants[0].participantKey, 'participant_01');
    assert.equal(artifact.participants[0].controllerRefKey, 'controller_ref_01');
    assert.equal(artifact.participants[0].pawnRefKey, 'pawn_ref_01');
    assert.equal(artifact.participants[0].teamRefKey, 'team_ref_01');
    assert.equal(artifact.participants[0].heroRefKey, 'hero_ref_01');
    assert.equal(artifact.finalFactsProduced, false);
    assert.equal(artifact.attributionEmitted, false);
});

test('participant identity schema rejects final facts, names, entity ids, and event rows', async () => {
    const schema = await loadSchema();
    assert.match(validateParticipantIdentityArtifact(validArtifact({ finalFactsProduced: true }), schema).join('\n'), /finalFactsProduced must be false/u);
    assert.match(validateParticipantIdentityArtifact(validArtifact({ playerNamesIncluded: true }), schema).join('\n'), /playerNamesIncluded must be false/u);
    assert.match(validateParticipantIdentityArtifact(validArtifact({ entityIdsIncluded: true }), schema).join('\n'), /entityIdsIncluded must be false/u);
    assert.match(validateParticipantIdentityArtifact(validArtifact({ eventRowsIncluded: true }), schema).join('\n'), /eventRowsIncluded must be false/u);
    assert.match(validateParticipantIdentityArtifact(validArtifact({ attributionEmitted: true }), schema).join('\n'), /attributionEmitted must be false/u);
});

test('participant identity keeps death validation and canonical readiness non-final', async () => {
    const schema = await loadSchema();
    const artifact = validArtifact({
        readiness: {
            readyForParticipantIdentityConsumption: true,
            readyForAliveDeadRespawnArtifact: true,
            readyForCanonicalDeathEventDesign: true,
            readyForAttribution: true,
            readyForTeamfightDetection: true
        }
    });
    const errors = validateParticipantIdentityArtifact(artifact, schema).join('\n');
    assert.match(errors, /readyForCanonicalDeathEventDesign must be false/u);
    assert.match(errors, /readyForAttribution must be false/u);
    assert.match(errors, /readyForTeamfightDetection must be false/u);
});

test('participant identity policy rejects raw/value-bearing output keys', () => {
    const artifact = {
        ...validArtifact(),
        steamId: 'forbidden'
    };
    assert.equal(auditParticipantIdentityPolicy(artifact).policyStatus, 'failed');
});

test('participant identity partial artifact can use synthetic unknown refs without raw values', async () => {
    const schema = await loadSchema();
    const artifact = createParticipantIdentityArtifact({
        replayId: 'replay_011',
        participantRecords: [
            {
                participantSeed: 'fallback',
                samples: 1,
                controllerObserved: true,
                pawnSeed: null,
                teamSeed: null,
                heroSeed: null,
                deathCounter: false,
                aliveDead: false,
                respawn: false
            }
        ],
        timeSignals: { tickProgressionObserved: false },
        semanticFoundation: {
            timeSignals: { timeNormalizationStatus: 'partial' }
        },
        deathValidation: {
            found: true,
            eventCount: 12
        }
    });
    assert.deepEqual(validateParticipantIdentityArtifact(artifact, schema), []);
    assert.equal(artifact.participants[0].pawnRefKey, 'pawn_ref_unknown_01');
    assert.equal(artifact.participants[0].teamRefKey, 'team_ref_unknown_01');
    assert.equal(artifact.participants[0].heroRefKey, 'hero_ref_unknown_01');
    assert.equal(artifact.participantIdentityStatus, 'available');
});
