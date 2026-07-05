import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { test } from 'node:test';
import { ParserConfiguration } from 'deadem';
import {
    buildExtractorConsumptionSummary,
    buildMismatchLoopAnalysis,
    buildRiskAssessment,
    buildTargetPacketSummary,
    buildTask111Comparison,
    decideGate,
    validateInputPath,
    validateOutputRoots
} from '../tools/diagnose-replay-010-pre-recovery-mismatch-field-consumption.mjs';

function diagnosticEntry(loop, overrides = {}) {
    const beforeIndex = 3000 + loop * 100;
    const afterIndex = beforeIndex + 8;
    const afterCommand = afterIndex + 2;
    const actualConsumedAfterCommand = overrides.actualConsumedAfterCommand ?? overrides.payloadBits ?? 20;
    return {
        loop,
        readCounts: {
            beforeIndex,
            afterIndex,
            afterCommand,
            afterAction: afterCommand + actualConsumedAfterCommand
        },
        indexDelta: 1,
        accumulatedEntityIndex: overrides.entityIndex ?? 2500 + loop,
        commandId: 0,
        operation: 'UPDATE',
        payloadBits: overrides.payloadBits ?? 20,
        payloadSizeIteratorAvailable: true,
        action: 'normal_update_apply',
        registryStateBefore: 'present',
        classId: null,
        className: overrides.className ?? 'C_TestEntity',
        entityTouched: true,
        baselineTouched: false,
        fieldsTouched: true,
        registerEntityTouched: false,
        failureStage: null,
        extractorMutationCount: overrides.extractorMutationCount ?? 1,
        fieldReadSegmentCount: overrides.fieldReadSegmentCount ?? 1,
        fieldReaderBitsConsumed: overrides.fieldReaderBitsConsumed ?? actualConsumedAfterCommand,
        fieldPathBitsConsumed: overrides.fieldPathBitsConsumed ?? 0,
        totalExtractorBitsConsumed: overrides.totalExtractorBitsConsumed ?? actualConsumedAfterCommand,
        extractorConsumedZeroBits: actualConsumedAfterCommand === 0,
        extractorThrew: false,
        extractorInternalCondition: null,
        extractorDiagnostics: [{
            source: 'packet_update',
            method: 'applyTo',
            mutationCount: overrides.extractorMutationCount ?? 1,
            fieldPathBitsConsumed: overrides.fieldPathBitsConsumed ?? 0,
            fieldReadSegmentCount: overrides.fieldReadSegmentCount ?? 1,
            fieldReaderBitsConsumed: overrides.fieldReaderBitsConsumed ?? actualConsumedAfterCommand,
            zeroBitFieldReadSegments: 0,
            minFieldReaderBitsConsumed: actualConsumedAfterCommand,
            maxFieldReaderBitsConsumed: actualConsumedAfterCommand,
            totalExtractorBitsConsumed: overrides.totalExtractorBitsConsumed ?? actualConsumedAfterCommand,
            extractorConsumedZeroBits: actualConsumedAfterCommand === 0,
            fieldReaderMatchesExtractor: true,
            threw: false,
            errorMessage: null,
            fieldReadSegments: overrides.includeSegments === true ? [{
                ordinal: 0,
                beforeReadCount: afterCommand,
                afterReadCount: afterCommand + actualConsumedAfterCommand,
                bitsConsumed: actualConsumedAfterCommand
            }] : []
        }]
    };
}

function syntheticDiagnostics() {
    const entries = [];
    for (let loop = 0; loop < 30; loop++) {
        if (loop === 26) {
            entries.push(diagnosticEntry(loop, {
                entityIndex: 2598,
                payloadBits: 221,
                actualConsumedAfterCommand: 501,
                extractorMutationCount: 5,
                fieldReadSegmentCount: 5,
                fieldReaderBitsConsumed: 473,
                fieldPathBitsConsumed: 28,
                totalExtractorBitsConsumed: 501,
                includeSegments: true
            }));
        } else if (loop === 27) {
            entries.push(diagnosticEntry(loop, {
                entityIndex: 2599,
                payloadBits: 112,
                actualConsumedAfterCommand: 0,
                extractorMutationCount: 0,
                fieldReadSegmentCount: 0,
                fieldReaderBitsConsumed: 0,
                fieldPathBitsConsumed: 0,
                totalExtractorBitsConsumed: 0
            }));
        } else if (loop === 28) {
            entries.push(diagnosticEntry(loop, {
                entityIndex: 2600,
                payloadBits: 22,
                actualConsumedAfterCommand: 0,
                extractorMutationCount: 0,
                fieldReadSegmentCount: 0,
                fieldReaderBitsConsumed: 0,
                fieldPathBitsConsumed: 0,
                totalExtractorBitsConsumed: 0
            }));
        } else if (loop === 29) {
            entries.push(diagnosticEntry(loop, {
                entityIndex: 2601,
                payloadBits: 73,
                actualConsumedAfterCommand: 0,
                extractorMutationCount: 0,
                fieldReadSegmentCount: 0,
                fieldReaderBitsConsumed: 0,
                fieldPathBitsConsumed: 0,
                totalExtractorBitsConsumed: 0
            }));
        } else {
            entries.push(diagnosticEntry(loop, { payloadBits: 20, actualConsumedAfterCommand: 20 }));
        }
    }

    return [{
        type: 'pre_recovery_payload_consumption',
        packetOrdinal: 953,
        packetMetrics: {
            updatedEntries: 30,
            entityDataBitLength: 5344,
            serializedEntitiesByteLength: 43,
            payloadSizeIteratorAvailable: true,
            payloadSizeCount: 30,
            payloadBitsSum: 5010,
            startLoop: 0,
            entriesExamined: 30
        },
        boundary: null,
        ledgerEntries: entries
    }];
}

test('field-consumption diagnostic option is opt-in and does not enable recovery', () => {
    const defaultConfiguration = new ParserConfiguration({});
    assert.equal(defaultConfiguration.recovery, null);

    const diagnosticConfiguration = new ParserConfiguration({
        recovery: {
            diagnosePreRecoveryPayloadConsumption: true,
            diagnosePreRecoveryFieldConsumption: true
        }
    });
    assert.equal(diagnosticConfiguration.recovery.diagnosePreRecoveryFieldConsumption, true);
    assert.equal(diagnosticConfiguration.recovery.allowUnresolvedEntityReference, false);
    assert.equal(diagnosticConfiguration.recovery.allowMissingClassBaseline, false);
});

test('target packet summary keeps compact field metrics and omits field segment values', () => {
    const summary = buildTargetPacketSummary(syntheticDiagnostics());
    assert.equal(summary.targetPacketFound, true);
    assert.equal(summary.updatedEntries, 30);
    assert.equal(summary.payloadSizeCount, 30);
    assert.equal(summary.payloadIteratorAlignedWithUpdatedEntries, true);
    assert.deepEqual(summary.targetMismatchEntries.map(entry => entry.loop), [26, 27, 28, 29]);
    assert.equal(summary.targetMismatchEntries[0].extractorMutationCount, 5);
    assert.equal(summary.targetMismatchEntries[0].extractorDiagnostics[0].retainedSegmentCount, 1);
    assert.equal('fieldReadSegments' in summary.targetMismatchEntries[0].extractorDiagnostics[0], false);
    assert.equal(summary.fieldValuesCommitted, false);
});

test('mismatch loop analysis distinguishes loop 26 extra consumption and loops 27-29 zero extraction', () => {
    const summary = buildTargetPacketSummary(syntheticDiagnostics());
    const analysis = buildMismatchLoopAnalysis(summary);
    assert.equal(analysis.allTargetLoopsCollected, true);
    assert.equal(analysis.loop26ExtraConsumptionBits, 280);
    assert.equal(analysis.loop26HasExtraConsumptionOf280Bits, true);
    assert.equal(analysis.loops27To29ZeroConsumptionObserved, true);
    assert.equal(analysis.payloadIteratorCountAlignedWithUpdatedEntries, true);
    assert.equal(analysis.readCountsMonotonicForTargetLoops, true);
    assert.equal(analysis.evidenceClassification, 'field_level_consumption_mismatch_with_following_zero_mutation_updates');
    assert.equal(analysis.semanticConclusion, 'not_claimed');
});

test('extractor consumption summary aggregates target-window counts', () => {
    const summary = buildExtractorConsumptionSummary(buildTargetPacketSummary(syntheticDiagnostics()));
    assert.equal(summary.entriesInContextWindow, 10);
    assert.equal(summary.entriesWithExtractorDiagnostics, 10);
    assert.deepEqual(summary.zeroExtractorConsumptionLoops, [27, 28, 29]);
    assert.deepEqual(summary.mismatchLoops, [26, 27, 28, 29]);
    assert.equal(summary.extractorThrew, false);
    assert.equal(summary.committedFieldValues, false);
});

test('Task 111 comparison uses real prior output and confirms the same four mismatches', async () => {
    const comparison = await buildTask111Comparison(buildTargetPacketSummary(syntheticDiagnostics()));
    assert.equal(comparison.sameFourMismatchesTargeted, true);
    assert.equal(comparison.task111PresentUpdatesCompared, 1940);
    assert.equal(comparison.task111MismatchesAfterCommand, 4);
    assert.equal(comparison.evidenceImpact, 'reinforces_field_level_consumption_mismatch_or_accounting_issue');
});

test('risk and gate remain diagnostic-only without parser fix recommendation', async () => {
    const targetPacketSummary = buildTargetPacketSummary(syntheticDiagnostics());
    const loopAnalysis = buildMismatchLoopAnalysis(targetPacketSummary);
    const extractorSummary = buildExtractorConsumptionSummary(targetPacketSummary);
    const task111Comparison = await buildTask111Comparison(targetPacketSummary);
    const risk = buildRiskAssessment(loopAnalysis, task111Comparison);
    assert.equal(risk.directMissingUpdateSkipStatus, 'unsafe');
    assert.equal(risk.parserFixRecommendedNow, false);
    assert.equal(risk.source2SemanticsClaimed, false);

    const gate = decideGate({
        defaultPass: { expectedFailureReproduced: true },
        diagnosticPass: { expectedFailureReproduced: true },
        targetPacketSummary,
        loopAnalysis,
        extractorSummary,
        task111Comparison,
        protectionAudit: { passed: true },
        branchAudit: { passed: true }
    });
    assert.equal(gate.gate, 'local_replay_pre_recovery_mismatch_field_consumption_diagnosed');
});

test('canary input validation rejects protected, bot, later candidate, samples, and output/replays paths', () => {
    assert.equal(validateInputPath('.local/deadem/replays/inbox/partida_010.dem', 'replay_010').relativePath, '.local/deadem/replays/inbox/partida_010.dem');
    assert.throws(() => validateInputPath('.local/deadem/replays/inbox/partida_005.dem', 'replay_005'), /unsupported|protected|unauthorized/);
    assert.throws(() => validateInputPath('.local/deadem/replays/inbox/partida_006.dem', 'replay_006'), /unsupported|bot fixture|unauthorized/);
    assert.throws(() => validateInputPath('.local/deadem/replays/inbox/partida_011.dem', 'replay_011'), /unsupported|outside|unauthorized/);
    assert.throws(() => validateInputPath('samples/partida_010.dem', 'replay_010'), /samples/);
    assert.throws(() => validateInputPath('output/replays/replay_010/partida_010.dem', 'replay_010'), /output\/replays/);
});

test('output roots are fixed to Task 112 local and summary paths', () => {
    const roots = validateOutputRoots(
        '.local/deadem/cache/local-replay-processing/replay_010/pre-recovery-mismatch-field-consumption/',
        'output/local-replay-processing/replay_010-pre-recovery-mismatch-field-consumption/'
    );
    assert.equal(roots.local.relativePath, '.local/deadem/cache/local-replay-processing/replay_010/pre-recovery-mismatch-field-consumption/');
    assert.equal(roots.summary.relativePath, 'output/local-replay-processing/replay_010-pre-recovery-mismatch-field-consumption/');
});

test('Task 118 does not exist', () => {
    assert.equal(existsSync('tasks/specs/118.json'), false);
    assert.equal(existsSync('tasks/blocked/118-select-next-canonical-generalization-control.md'), false);
});
