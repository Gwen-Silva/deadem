import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';

import {
    auditSemanticFoundationPolicy,
    createSemanticFoundationArtifact,
    validateSemanticFoundationArtifact
} from '../tools/emit-semantic-foundation-compact-artifacts.mjs';

async function loadSchema() {
    return JSON.parse(await readFile('schemas/semantic-foundation-compact.schema.json', 'utf8'));
}

function validArtifact(overrides = {}) {
    const artifact = createSemanticFoundationArtifact({
        replayId: 'replay_010',
        signals: {
            controllerCandidatesObserved: 12,
            participantSlotCandidatesObserved: 12,
            controllerToPawnLinkSignalAvailable: true,
            stableParticipantKeyPossible: true,
            heroSignalAvailable: false,
            teamSignalAvailable: false,
            deathCounterSignalAvailable: true,
            aliveDeadSignalAvailable: false,
            respawnSignalAvailable: false
        },
        timeSignals: {
            tickProgressionObserved: true,
            tickRateSignalAvailable: true,
            durationSignalAvailable: true
        },
        deathValidation: {
            found: true,
            eventCount: 45
        }
    });
    return { ...artifact, ...overrides };
}

test('semantic foundation schema accepts compact safe artifact shape', async () => {
    const schema = await loadSchema();
    const artifact = validArtifact();
    assert.deepEqual(validateSemanticFoundationArtifact(artifact, schema), []);
    assert.equal(auditSemanticFoundationPolicy(artifact).policyStatus, 'passed');
    assert.equal(artifact.generatedAt, 'task_179');
    assert.equal(artifact.finalFactsProduced, false);
    assert.equal(artifact.gameplayInterpretationProduced, false);
    assert.equal(artifact.entityIdsIncluded, false);
    assert.equal(artifact.eventRowsIncluded, false);
    assert.equal(artifact.readiness.readyForCanonicalDeathEventDesign, false);
});

test('semantic foundation schema rejects final facts, raw/value-bearing flags, and event rows', async () => {
    const schema = await loadSchema();

    assert.match(
        validateSemanticFoundationArtifact(validArtifact({ finalFactsProduced: true }), schema).join('\n'),
        /finalFactsProduced must be false/u
    );
    assert.match(
        validateSemanticFoundationArtifact(validArtifact({ fieldValuesCaptured: true }), schema).join('\n'),
        /fieldValuesCaptured must be false/u
    );
    assert.match(
        validateSemanticFoundationArtifact(validArtifact({ playerNamesIncluded: true }), schema).join('\n'),
        /playerNamesIncluded must be false/u
    );
    assert.match(
        validateSemanticFoundationArtifact(validArtifact({ eventRowsIncluded: true }), schema).join('\n'),
        /eventRowsIncluded must be false/u
    );
});

test('semantic foundation schema keeps death validation bridge non-final', async () => {
    const schema = await loadSchema();
    const artifact = validArtifact({
        deathValidationBridge: {
            deathValidationArtifactFound: true,
            eventCount: 45,
            eventCountMeaning: 'source_observed_counter_transition_candidate_count_not_final_death_fact',
            canUseAsDeathEventSourceAlone: true
        }
    });
    assert.match(validateSemanticFoundationArtifact(artifact, schema).join('\n'), /canUseAsDeathEventSourceAlone must be false/u);
});

test('semantic foundation schema blocks canonical death readiness in this layer', async () => {
    const schema = await loadSchema();
    const artifact = validArtifact({
        readiness: {
            readyForIdentityMappingArtifact: true,
            readyForHeroTeamMappingArtifact: false,
            readyForTimeNormalizationArtifact: true,
            readyForAliveDeadRespawnArtifact: true,
            readyForCanonicalDeathEventDesign: true
        }
    });
    assert.match(validateSemanticFoundationArtifact(artifact, schema).join('\n'), /readyForCanonicalDeathEventDesign must be false/u);
});

test('semantic foundation policy rejects forbidden value-bearing keys', () => {
    const artifact = {
        ...validArtifact(),
        fieldValues: ['forbidden']
    };
    assert.equal(auditSemanticFoundationPolicy(artifact).policyStatus, 'failed');
});
