import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { test } from 'node:test';
import { ParserConfiguration } from 'deadem';
import {
    buildBaselineRiskAssessment,
    buildFirstMissingEntityBoundary,
    buildPreRecoveryPacketSummary,
    buildPresentUpdateConsistencySummary,
    buildTask109Comparison,
    decideGate,
    validateInputPath,
    validateOutputRoots
} from '../tools/collect-replay-010-pre-recovery-payload-consumption-baseline.mjs';

function entry(loop, overrides = {}) {
    const beforeIndex = 1000 + loop * 100;
    const afterIndex = beforeIndex + 8;
    const afterCommand = afterIndex + 2;
    const afterAction = afterCommand + (overrides.actualConsumedAfterCommand ?? overrides.payloadBits ?? 20);
    return {
        loop,
        readCounts: {
            beforeIndex,
            afterIndex,
            afterCommand,
            afterAction
        },
        indexDelta: 1,
        accumulatedEntityIndex: overrides.entityIndex ?? 100 + loop,
        commandId: overrides.commandId ?? 0,
        operation: overrides.operation ?? 'UPDATE',
        payloadBits: overrides.payloadBits ?? 20,
        payloadSizeIteratorAvailable: true,
        action: overrides.action ?? 'normal_update_apply',
        registryStateBefore: overrides.registryStateBefore ?? 'present',
        classId: null,
        className: overrides.className ?? null,
        entityTouched: overrides.entityTouched ?? true,
        baselineTouched: false,
        fieldsTouched: overrides.fieldsTouched ?? true,
        registerEntityTouched: false,
        failureStage: null
    };
}

function syntheticDiagnostics() {
    return [
        {
            type: 'pre_recovery_payload_consumption',
            packetOrdinal: 1,
            packetMetrics: {
                updatedEntries: 3,
                entityDataBitLength: 512,
                serializedEntitiesByteLength: 4,
                payloadSizeIteratorAvailable: true,
                payloadSizeCount: 3,
                payloadBitsSum: 62,
                startLoop: 0,
                entriesExamined: 3
            },
            boundary: null,
            ledgerEntries: [
                entry(0, { payloadBits: 20 }),
                entry(1, { payloadBits: 21, actualConsumedAfterCommand: 28 }),
                entry(2, { operation: 'LEAVE', commandId: 1, payloadBits: 0, actualConsumedAfterCommand: 0, registryStateBefore: 'present_active', action: 'leave_or_deactivate', fieldsTouched: false })
            ]
        },
        {
            type: 'pre_recovery_payload_consumption',
            packetOrdinal: 2,
            packetMetrics: {
                updatedEntries: 1,
                entityDataBitLength: 128,
                serializedEntitiesByteLength: 1,
                payloadSizeIteratorAvailable: true,
                payloadSizeCount: 1,
                payloadBitsSum: 18,
                startLoop: 0,
                entriesExamined: 1
            },
            boundary: {
                failureType: 'missing_entity_reference',
                operation: 'UPDATE',
                loop: 0,
                entityIndex: 2905,
                errorMessage: 'Unable to find an entity with index [ 2905 ]'
            },
            ledgerEntries: [
                entry(0, {
                    entityIndex: 2905,
                    payloadBits: 18,
                    actualConsumedAfterCommand: 0,
                    registryStateBefore: 'missing',
                    action: 'missing_update_failed',
                    entityTouched: false,
                    fieldsTouched: false
                })
            ]
        }
    ];
}

test('pre-recovery diagnostic option is opt-in and does not enable recovery actions', () => {
    const defaultConfiguration = new ParserConfiguration({});
    assert.equal(defaultConfiguration.recovery, null);
    assert.deepEqual(defaultConfiguration.recoveryDiagnostics, []);

    const diagnosticConfiguration = new ParserConfiguration({
        recovery: {
            diagnosePreRecoveryPayloadConsumption: true
        }
    });
    assert.equal(diagnosticConfiguration.recovery.allowUnresolvedEntityReference, false);
    assert.equal(diagnosticConfiguration.recovery.allowMissingClassBaseline, false);
    assert.equal(diagnosticConfiguration.recovery.diagnosePreRecoveryPayloadConsumption, true);
    diagnosticConfiguration.recovery.recordPreRecoveryPayloadConsumption({
        packetMetrics: { updatedEntries: 1 },
        boundary: null,
        ledgerEntries: []
    });
    assert.equal(diagnosticConfiguration.recoveryWarnings.length, 0);
    assert.equal(diagnosticConfiguration.recoveryDiagnostics[0].packetOrdinal, 1);
});

test('packet summary records compact packet metrics and mismatch examples', () => {
    const summary = buildPreRecoveryPacketSummary(syntheticDiagnostics());
    assert.equal(summary.packetCount, 2);
    assert.equal(summary.totalPresentUpdates, 2);
    assert.equal(summary.totalPresentUpdateMismatchesAfterCommand, 1);
    assert.equal(summary.packetCoverage.mismatchPacketOrdinals[0], 1);
    assert.equal(summary.packetSamples.firstPackets[0].entriesByOperation.UPDATE, 2);
    assert.equal(summary.packetSamples.packetsWithMismatches[0].mismatchExamples[0].payloadMinusActualAfterCommand, -7);
    assert.equal(summary.fullPacketSummaryLocalOnly.commitPolicy, 'local_only');
    assert.equal(summary.committedRawPayloads, false);
});

test('present UPDATE consistency answers whether mismatch occurs before recovery', () => {
    const summary = buildPresentUpdateConsistencySummary(syntheticDiagnostics());
    assert.equal(summary.presentUpdateEntriesCompared, 2);
    assert.equal(summary.exactMatchesAfterCommand, 1);
    assert.equal(summary.mismatchesAfterCommand, 1);
    assert.equal(summary.mismatchesOccurBeforeAnyRecovery, true);
    assert.equal(summary.directSkipStillUnsafe, true);
});

test('first missing entity boundary is fail-closed and not recovered', () => {
    const boundary = buildFirstMissingEntityBoundary(syntheticDiagnostics(), {
        expectedFailureReproduced: true,
        errorMessage: 'Unable to find an entity with index [ 2905 ]'
    });
    assert.equal(boundary.boundaryFound, true);
    assert.equal(boundary.boundary.entityIndex, 2905);
    assert.equal(boundary.recoveryAttempted, false);
    assert.equal(boundary.failedClosed, true);
});

test('risk assessment keeps direct skip unsafe when pre-recovery mismatches exist', () => {
    const consistency = buildPresentUpdateConsistencySummary(syntheticDiagnostics());
    const risk = buildBaselineRiskAssessment(consistency, {
        task109Loop21Mismatch: true,
        hypothesisImpact: 'sustains_task109_not_recovery_contaminated'
    });
    assert.equal(risk.mismatchesOccurBeforeAnyRecovery, true);
    assert.equal(risk.directSkipStatus, 'unsafe');
    assert.equal(risk.parserFixRecommendedNow, false);
    assert.equal(risk.source2SemanticsClaimed, false);
});

test('task 109 comparison uses real prior output and preserves the prior loop 21 mismatch', async () => {
    const consistency = buildPresentUpdateConsistencySummary(syntheticDiagnostics());
    const comparison = await buildTask109Comparison(consistency);
    assert.equal(comparison.task109Loop21Mismatch, true);
    assert.equal(comparison.task109Loop22StillNotIndependentlyJustified, true);
    assert.equal(comparison.hypothesisImpact, 'sustains_task109_not_recovery_contaminated');
});

test('gate passes when default, diagnostic, summaries, comparison, and protections pass', () => {
    const diagnostics = syntheticDiagnostics();
    const packetSummary = buildPreRecoveryPacketSummary(diagnostics);
    const consistencySummary = buildPresentUpdateConsistencySummary(diagnostics);
    const boundary = buildFirstMissingEntityBoundary(diagnostics, { expectedFailureReproduced: true });
    const task109Comparison = {
        task109Loop21Mismatch: true,
        hypothesisImpact: 'sustains_task109_not_recovery_contaminated'
    };
    const riskAssessment = buildBaselineRiskAssessment(consistencySummary, task109Comparison);
    const gate = decideGate({
        defaultPass: { expectedFailureReproduced: true },
        diagnosticPass: { expectedFailureReproduced: true },
        packetSummary,
        consistencySummary,
        boundary,
        task109Comparison,
        riskAssessment,
        protectionAudit: { passed: true },
        branchAudit: { passed: true }
    });
    assert.equal(gate.gate, 'local_replay_pre_recovery_payload_consumption_baseline_ready');
});

test('gate blocks without present UPDATE metrics', () => {
    const diagnostics = [{
        type: 'pre_recovery_payload_consumption',
        packetOrdinal: 1,
        packetMetrics: {
            updatedEntries: 1,
            entityDataBitLength: 8,
            serializedEntitiesByteLength: 0,
            payloadSizeCount: 0,
            payloadBitsSum: 0,
            entriesExamined: 1
        },
        boundary: null,
        ledgerEntries: [entry(0, { operation: 'LEAVE', commandId: 1, registryStateBefore: 'present_active' })]
    }];
    const packetSummary = buildPreRecoveryPacketSummary(diagnostics);
    const consistencySummary = buildPresentUpdateConsistencySummary(diagnostics);
    const boundary = buildFirstMissingEntityBoundary(diagnostics, { expectedFailureReproduced: true });
    const task109Comparison = { task109Loop21Mismatch: true };
    const riskAssessment = buildBaselineRiskAssessment(consistencySummary, task109Comparison);
    const gate = decideGate({
        defaultPass: { expectedFailureReproduced: true },
        diagnosticPass: { expectedFailureReproduced: true },
        packetSummary,
        consistencySummary,
        boundary,
        task109Comparison,
        riskAssessment,
        protectionAudit: { passed: true },
        branchAudit: { passed: true }
    });
    assert.equal(gate.gate, 'local_replay_pre_recovery_payload_consumption_baseline_partial');
});

test('canary input validation only allows partida_010', () => {
    const result = validateInputPath('.local/deadem/replays/inbox/partida_010.dem', 'replay_010');
    assert.equal(result.relativePath, '.local/deadem/replays/inbox/partida_010.dem');
});

test('protected, bot, and later candidate replay paths are rejected', () => {
    assert.throws(() => validateInputPath('.local/deadem/replays/inbox/partida_005.dem', 'replay_005'), /unsupported|protected|unauthorized/);
    for (const id of ['006', '007', '008']) {
        assert.throws(() => validateInputPath(`.local/deadem/replays/inbox/partida_${id}.dem`, `replay_${id}`), /unsupported|bot fixture|unauthorized/);
    }
    for (const id of ['011', '012', '013', '014', '015', '016', '017', '018', '019', '020']) {
        assert.throws(() => validateInputPath(`.local/deadem/replays/inbox/partida_${id}.dem`, `replay_${id}`), /unauthorized|outside|unsupported/);
    }
});

test('samples and output/replays paths are rejected', () => {
    assert.throws(() => validateInputPath('samples/partida_010.dem', 'replay_010'), /samples/);
    assert.throws(() => validateInputPath('output/replays/replay_010/partida_010.dem', 'replay_010'), /output\/replays/);
});

test('output roots are fixed to pre-recovery baseline paths', () => {
    const roots = validateOutputRoots(
        '.local/deadem/cache/local-replay-processing/replay_010/pre-recovery-payload-consumption-baseline/',
        'output/local-replay-processing/replay_010-pre-recovery-payload-consumption-baseline/'
    );
    assert.equal(roots.local.relativePath, '.local/deadem/cache/local-replay-processing/replay_010/pre-recovery-payload-consumption-baseline/');
    assert.equal(roots.summary.relativePath, 'output/local-replay-processing/replay_010-pre-recovery-payload-consumption-baseline/');
});

test('Task 114 does not exist', () => {
    assert.equal(existsSync('tasks/specs/114.json'), false);
    assert.equal(existsSync('tasks/blocked/114-select-next-canonical-generalization-control.md'), false);
});
