import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { test } from 'node:test';
import {
    buildBoundaryPacketPayloadConsumptionSummary,
    buildPayloadSemanticsHypotheses,
    buildPayloadSizeConsistencySummary,
    decideGate,
    validateInputPath,
    validateOutputRoots
} from '../tools/diagnose-replay-010-serialized-entity-payload-semantics.mjs';

function entry(loop, overrides = {}) {
    const beforeIndex = 5000 + loop * 100;
    const afterIndex = beforeIndex + 8;
    const afterCommand = afterIndex + 2;
    const afterAction = afterCommand + (overrides.actualConsumedAfterCommand ?? 20);
    return {
        loop,
        readCounts: {
            beforeIndex,
            afterIndex,
            afterCommand,
            afterAction
        },
        indexDelta: 1,
        accumulatedEntityIndex: 1000 + loop,
        commandId: 0,
        operation: 'UPDATE',
        payloadBits: overrides.payloadBits ?? 20,
        payloadSizeIteratorAvailable: true,
        action: overrides.action ?? 'normal_update_apply',
        registryStateBefore: overrides.registryStateBefore ?? 'present',
        classId: overrides.classId ?? null,
        className: overrides.className ?? null,
        entityTouched: overrides.entityTouched ?? true,
        baselineTouched: false,
        fieldsTouched: overrides.fieldsTouched ?? true,
        registerEntityTouched: false,
        failureStage: null
    };
}

function syntheticDiagnostic() {
    const entries = [
        entry(18),
        entry(19, { payloadBits: 17, actualConsumedAfterCommand: 31 }),
        entry(20),
        entry(21, { payloadBits: 227, actualConsumedAfterCommand: 363 }),
        entry(22, {
            payloadBits: 266,
            actualConsumedAfterCommand: 266,
            action: 'skipped_missing_update_payload',
            registryStateBefore: 'missing',
            entityTouched: false,
            fieldsTouched: false
        }),
        {
            ...entry(23, { payloadBits: 12, actualConsumedAfterCommand: 35 }),
            commandId: 2,
            operation: 'CREATE',
            accumulatedEntityIndex: 570655505,
            classId: 139,
            className: 'CCitadel_Ability_Frank_ShockTarget2',
            action: 'create_attempt_out_of_range',
            entityTouched: false,
            fieldsTouched: false,
            registerEntityTouched: false,
            failureStage: 'entity_constructor'
        }
    ];

    return {
        packetMetrics: {
            updatedEntries: 42,
            entityDataBitLength: 10000,
            serializedEntitiesByteLength: 100,
            payloadSizeIteratorAvailable: true,
            payloadSizeCount: 42,
            payloadBitsSum: 1234,
            startLoop: 0,
            entriesIteratedToBoundary: 24
        },
        boundary: {
            loop: 23,
            boundaryStartReadCount: entries[5].readCounts.beforeIndex,
            previousEntityIndex: 6679,
            errorMessage: 'entity index out of range'
        },
        ledgerEntries: entries
    };
}

test('boundary summary includes loops 18-23 and highlights loop 21 and 22', () => {
    const summary = buildBoundaryPacketPayloadConsumptionSummary(syntheticDiagnostic());
    assert.equal(summary.requestedWindow.entriesCaptured, 6);
    assert.equal(summary.loop21.payloadBitsFromSerializedEntities, 227);
    assert.equal(summary.loop21.actualConsumedAfterCommand, 363);
    assert.equal(summary.loop21.mismatchConfirmedAgainstAfterCommand, true);
    assert.equal(summary.loop22.semanticJustification, 'not_independently_justified');
    assert.equal(summary.loop23.operation, 'CREATE');
});

test('payload consistency summary records present UPDATE mismatches before boundary', () => {
    const summary = buildPayloadSizeConsistencySummary(syntheticDiagnostic());
    assert.equal(summary.presentUpdateEntriesBeforeBoundary, 4);
    assert.equal(summary.presentUpdateMismatchesAfterCommand, 2);
    assert.equal(summary.mismatchAppearsBeforeLoop22, true);
    assert.equal(summary.loop21MismatchConfirmed, true);
    assert.ok(summary.mismatchExamples.some(example => example.loop === 21));
});

test('payload hypotheses classify direct skip input as unsafe when mismatches exist', () => {
    const boundary = buildBoundaryPacketPayloadConsumptionSummary(syntheticDiagnostic());
    const consistency = buildPayloadSizeConsistencySummary(syntheticDiagnostic());
    const hypotheses = buildPayloadSemanticsHypotheses(boundary, consistency);
    assert.equal(hypotheses.payloadBitsDirectMissingUpdateSkipAssessment, 'unsafe');
    assert.match(hypotheses.recommendedNextAction, /EntityPayloadSizeExtractor/);
    assert.ok(hypotheses.notDetermined.includes('whether loop 22 caused the loop 23 out-of-range CREATE'));
});

test('gate passes only with reproduced default, boundary, mismatch, and safety audits', () => {
    const boundarySummary = buildBoundaryPacketPayloadConsumptionSummary(syntheticDiagnostic());
    const consistencySummary = buildPayloadSizeConsistencySummary(syntheticDiagnostic());
    const hypotheses = buildPayloadSemanticsHypotheses(boundarySummary, consistencySummary);
    const gate = decideGate({
        defaultPass: { expectedFailureReproduced: true },
        recoveryPass: { advancedPastTask105Failure: true, boundaryReached: true },
        boundarySummary,
        consistencySummary,
        hypotheses,
        protectionAudit: { passed: true },
        branchAudit: { passed: true }
    });
    assert.equal(gate.gate, 'local_replay_serialized_entity_payload_semantics_diagnosed');
});

test('gate blocks without loop 21 evidence', () => {
    const boundarySummary = buildBoundaryPacketPayloadConsumptionSummary(null);
    const consistencySummary = buildPayloadSizeConsistencySummary(null);
    const hypotheses = buildPayloadSemanticsHypotheses(boundarySummary, consistencySummary);
    const gate = decideGate({
        defaultPass: { expectedFailureReproduced: true },
        recoveryPass: { advancedPastTask105Failure: true, boundaryReached: true },
        boundarySummary,
        consistencySummary,
        hypotheses,
        protectionAudit: { passed: true },
        branchAudit: { passed: true }
    });
    assert.equal(gate.gate, 'local_replay_serialized_entity_payload_semantics_blocked');
});

test('canary input validation only allows partida_010', () => {
    const result = validateInputPath('.local/deadem/replays/inbox/partida_010.dem', 'replay_010');
    assert.equal(result.relativePath, '.local/deadem/replays/inbox/partida_010.dem');
});

test('protected and unsupported replay paths are rejected', () => {
    assert.throws(() => validateInputPath('.local/deadem/replays/inbox/partida_005.dem', 'replay_005'), /unsupported|protected|unauthorized/);
    for (const id of ['006', '007', '008']) {
        assert.throws(() => validateInputPath(`.local/deadem/replays/inbox/partida_${id}.dem`, `replay_${id}`), /unsupported|bot fixture|unauthorized/);
    }
});

test('candidate replay paths and forbidden roots are rejected', () => {
    assert.throws(() => validateInputPath('.local/deadem/replays/inbox/partida_011.dem', 'replay_011'), /unauthorized|outside|unsupported/);
    assert.throws(() => validateInputPath('samples/partida_010.dem', 'replay_010'), /samples/);
    assert.throws(() => validateInputPath('output/replays/replay_010/partida_010.dem', 'replay_010'), /output\/replays/);
});

test('output roots are fixed to payload-semantics paths', () => {
    const roots = validateOutputRoots(
        '.local/deadem/cache/local-replay-processing/replay_010/serialized-entity-payload-semantics/',
        'output/local-replay-processing/replay_010-serialized-entity-payload-semantics/'
    );
    assert.equal(roots.local.relativePath, '.local/deadem/cache/local-replay-processing/replay_010/serialized-entity-payload-semantics/');
    assert.equal(roots.summary.relativePath, 'output/local-replay-processing/replay_010-serialized-entity-payload-semantics/');
});

test('Task 110 does not exist', () => {
    assert.equal(existsSync('tasks/specs/110.json'), false);
    assert.equal(existsSync('tasks/blocked/110-select-next-canonical-generalization-control.md'), false);
});
