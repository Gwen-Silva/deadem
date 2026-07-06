import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { test } from 'node:test';
import { ParserConfiguration } from 'deadem';
import {
    buildLoop26SegmentSummary,
    buildRiskAssessment,
    buildSegmentHypotheses,
    buildTargetContext,
    buildTask112Comparison,
    buildZeroSegmentSummary,
    decideGate,
    validateInputPath,
    validateOutputRoots
} from '../tools/inspect-replay-010-loop-26-field-reader-segments.mjs';

const TARGET_PACKET_ORDINAL = 953;

function segment(ordinal, beforeReadCount, bitsConsumed, overrides = {}) {
    return {
        ordinal,
        beforeReadCount,
        afterReadCount: beforeReadCount + bitsConsumed,
        bitsConsumed,
        fieldPathId: overrides.fieldPathId ?? 1000 + ordinal,
        fieldPathTransferCode: null,
        fieldPathName: overrides.fieldPathName ?? `m_syntheticField.${ordinal}`,
        decoderName: overrides.decoderName ?? 'decodeSynthetic',
        decoderType: 'function',
        serializerName: 'SyntheticSerializer',
        serializerVersion: 1,
        storageType: overrides.storageType ?? 'INT',
        storageDimension: 1,
        storageSigned: false,
        storageBool: false
    };
}

function diagnosticEntry(loop, overrides = {}) {
    const beforeIndex = overrides.beforeIndex ?? 3000 + loop * 100;
    const afterIndex = beforeIndex + 6;
    const afterCommand = afterIndex + 2;
    const payloadBits = overrides.payloadBits ?? 20;
    const actualConsumedAfterCommand = overrides.actualConsumedAfterCommand ?? payloadBits;
    const segments = overrides.segments ?? [
        segment(0, afterCommand + (overrides.fieldPathBitsConsumed ?? 0), actualConsumedAfterCommand)
    ];
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
        payloadBits,
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
        extractorMutationCount: overrides.extractorMutationCount ?? segments.length,
        fieldReadSegmentCount: overrides.fieldReadSegmentCount ?? segments.length,
        fieldReaderBitsConsumed: overrides.fieldReaderBitsConsumed ?? segments.reduce((sum, item) => sum + item.bitsConsumed, 0),
        fieldPathBitsConsumed: overrides.fieldPathBitsConsumed ?? 0,
        totalExtractorBitsConsumed: overrides.totalExtractorBitsConsumed ?? actualConsumedAfterCommand,
        extractorConsumedZeroBits: actualConsumedAfterCommand === 0,
        extractorThrew: false,
        extractorInternalCondition: null,
        extractorDiagnostics: [{
            source: 'packet_update',
            method: 'applyTo',
            mutationCount: overrides.extractorMutationCount ?? segments.length,
            fieldPathBitsConsumed: overrides.fieldPathBitsConsumed ?? 0,
            fieldReadSegmentCount: overrides.fieldReadSegmentCount ?? segments.length,
            fieldReaderBitsConsumed: overrides.fieldReaderBitsConsumed ?? segments.reduce((sum, item) => sum + item.bitsConsumed, 0),
            zeroBitFieldReadSegments: 0,
            minFieldReaderBitsConsumed: segments.length === 0 ? null : Math.min(...segments.map(item => item.bitsConsumed)),
            maxFieldReaderBitsConsumed: segments.length === 0 ? null : Math.max(...segments.map(item => item.bitsConsumed)),
            totalExtractorBitsConsumed: overrides.totalExtractorBitsConsumed ?? actualConsumedAfterCommand,
            extractorConsumedZeroBits: actualConsumedAfterCommand === 0,
            fieldReaderMatchesExtractor: true,
            threw: false,
            errorMessage: null,
            fieldReadSegments: segments
        }]
    };
}

function zeroEntry(loop, payloadBits, entityIndex, className) {
    return diagnosticEntry(loop, {
        payloadBits,
        actualConsumedAfterCommand: 0,
        entityIndex,
        className,
        extractorMutationCount: 0,
        fieldReadSegmentCount: 0,
        fieldReaderBitsConsumed: 0,
        fieldPathBitsConsumed: 0,
        totalExtractorBitsConsumed: 0,
        segments: []
    });
}

function syntheticDiagnostics() {
    const loop26AfterCommand = 4842;
    const loop26Segments = [
        segment(0, loop26AfterCommand + 53, 8, { fieldPathId: 12 }),
        segment(1, loop26AfterCommand + 61, 8, { fieldPathId: 13 }),
        segment(2, loop26AfterCommand + 69, 16, { fieldPathId: 14 }),
        segment(3, loop26AfterCommand + 85, 32, { fieldPathId: 15 }),
        segment(4, loop26AfterCommand + 117, 64, { fieldPathId: 16 }),
        segment(5, loop26AfterCommand + 181, 32, { fieldPathId: 17 }),
        segment(6, loop26AfterCommand + 213, 288, { fieldPathId: 18, decoderName: 'decodeString', storageType: 'MISC' })
    ];
    const entries = [];
    for (let loop = 20; loop <= 29; loop++) {
        if (loop === 26) {
            entries.push(diagnosticEntry(loop, {
                beforeIndex: 4834,
                entityIndex: 2598,
                className: 'CCitadel_Ability_Familiar_HelpingHands',
                payloadBits: 221,
                actualConsumedAfterCommand: 501,
                extractorMutationCount: 7,
                fieldReadSegmentCount: 7,
                fieldReaderBitsConsumed: 448,
                fieldPathBitsConsumed: 53,
                totalExtractorBitsConsumed: 501,
                segments: loop26Segments
            }));
        } else if (loop === 27) {
            entries.push(zeroEntry(loop, 112, 2599, 'CCitadel_Ability_Familiar_Ability01'));
        } else if (loop === 28) {
            entries.push(zeroEntry(loop, 22, 2600, 'CCitadel_Ability_PrimaryWeapon_Empty'));
        } else if (loop === 29) {
            entries.push(zeroEntry(loop, 73, 2601, 'CCitadel_Ability_HoldMelee'));
        } else {
            entries.push(diagnosticEntry(loop));
        }
    }

    return [{
        type: 'pre_recovery_payload_consumption',
        packetOrdinal: TARGET_PACKET_ORDINAL,
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

test('field-reader segment diagnostics are opt-in and do not enable recovery', () => {
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

test('loop 26 summary keeps segment metadata without field values', () => {
    const context = buildTargetContext(syntheticDiagnostics());
    const summary = buildLoop26SegmentSummary(context);
    assert.equal(summary.gateEligible, true);
    assert.equal(summary.payloadBits, 221);
    assert.equal(summary.actualConsumedAfterCommand, 501);
    assert.equal(summary.extraBitsConsumedBeyondPayload, 280);
    assert.equal(summary.fieldPathBitsConsumed, 53);
    assert.equal(summary.fieldReaderBitsConsumed, 448);
    assert.equal(summary.sumOfSegments, 448);
    assert.equal(summary.fieldPathPlusSegmentSumMatchesTotal, true);
    assert.equal(summary.fieldReadSegments.length, 7);
    assert.equal(summary.largestSegmentBits, 288);
    assert.equal(summary.singleSegmentAccountsForMostOfExtra280, true);
    assert.equal(summary.singleSegmentEqualsExtra280Bits, false);
    assert.equal(summary.singleSegmentExceedsExtra280Bits, true);
    assert.equal(summary.valuesRecorded, false);
    assert.equal(summary.rawPayloadsRecorded, false);
    assert.equal('value' in summary.fieldReadSegments[0], false);
});

test('loops 27-29 are classified as zero paths before any field reader by metrics only', () => {
    const zeroSummary = buildZeroSegmentSummary(buildTargetContext(syntheticDiagnostics()));
    assert.equal(zeroSummary.allLoopsFound, true);
    assert.equal(zeroSummary.allZeroBeforeFieldReader, true);
    assert.deepEqual(zeroSummary.loops.map(loop => loop.loop), [27, 28, 29]);
    assert.deepEqual(zeroSummary.loops.map(loop => loop.fieldPathExtractorProducedZeroPaths), [true, true, true]);
    assert.deepEqual(zeroSummary.loops.map(loop => loop.zeroConsumptionOccurredBeforeAnyFieldReader), [true, true, true]);
    assert.ok(zeroSummary.loops.every(loop => loop.emptyUpdateAtCurrentCursorStatus === 'supported_by_extractor_metrics_only'));
    assert.equal(zeroSummary.source2SemanticsClaimed, false);
});

test('hypotheses remain comparative and causal conclusion stays undetermined', () => {
    const context = buildTargetContext(syntheticDiagnostics());
    const loop26Summary = buildLoop26SegmentSummary(context);
    const zeroSummary = buildZeroSegmentSummary(context);
    const hypotheses = buildSegmentHypotheses(loop26Summary, zeroSummary);
    assert.equal(hypotheses.loop26_large_field_segment_possible.status, 'supported');
    assert.equal(hypotheses.loop26_overconsumption_absorbed_following_payloads_possible.status, 'possible_not_proven');
    assert.equal(hypotheses.loop26_overconsumption_absorbed_following_payloads_possible.exactBitEqualityWithLoops27To29Payloads, false);
    assert.equal(hypotheses.serializedEntities_not_direct_skip_supported.status, 'supported_for_this_canary');
    assert.equal(hypotheses.accounting_artifact_possible.status, 'possible');
    assert.equal(hypotheses.causalConclusion, 'not_determined');
    assert.equal(hypotheses.source2SemanticsClaimed, false);
});

test('Task 112 comparison confirms exact prior loop accounting', async () => {
    const context = buildTargetContext(syntheticDiagnostics());
    const comparison = await buildTask112Comparison(
        buildLoop26SegmentSummary(context),
        buildZeroSegmentSummary(context)
    );
    assert.equal(comparison.exactTask112NumbersMatched, true);
    assert.equal(comparison.differences.length, 0);
    assert.ok(comparison.comparedFields.includes('loop26.actualConsumedAfterCommand'));
});

test('risk assessment and gate remain diagnostic-only', async () => {
    const context = buildTargetContext(syntheticDiagnostics());
    const loop26Summary = buildLoop26SegmentSummary(context);
    const zeroSummary = buildZeroSegmentSummary(context);
    const hypotheses = buildSegmentHypotheses(loop26Summary, zeroSummary);
    const task112Comparison = await buildTask112Comparison(loop26Summary, zeroSummary);
    const risk = buildRiskAssessment(loop26Summary, zeroSummary, hypotheses, task112Comparison);
    assert.equal(risk.directMissingUpdateSkipStatus, 'unsafe');
    assert.equal(risk.parserFixRecommendedNow, false);
    assert.equal(risk.source2SemanticsClaimed, false);

    const gate = decideGate({
        defaultPass: { expectedFailureReproduced: true },
        diagnosticPass: { expectedFailureReproduced: true },
        loop26Summary,
        zeroSummary,
        task112Comparison,
        protectionAudit: { passed: true },
        branchAudit: { passed: true }
    });
    assert.equal(gate.gate, 'local_replay_loop_26_field_reader_segments_diagnosed');
    assert.equal(gate.recoveryAddedOrPromoted, false);
    assert.equal(gate.factualArtifactsEmitted, false);
});

test('canary input validation rejects protected, bot, later candidate, samples, and output/replays paths', () => {
    assert.equal(validateInputPath('.local/deadem/replays/inbox/partida_010.dem', 'replay_010').relativePath, '.local/deadem/replays/inbox/partida_010.dem');
    assert.throws(() => validateInputPath('.local/deadem/replays/inbox/partida_005.dem', 'replay_005'), /unsupported|protected|unauthorized/);
    assert.throws(() => validateInputPath('.local/deadem/replays/inbox/partida_006.dem', 'replay_006'), /unsupported|bot fixture|unauthorized/);
    assert.throws(() => validateInputPath('.local/deadem/replays/inbox/partida_011.dem', 'replay_011'), /unsupported|outside|unauthorized/);
    assert.throws(() => validateInputPath('samples/partida_010.dem', 'replay_010'), /samples/);
    assert.throws(() => validateInputPath('output/replays/replay_010/partida_010.dem', 'replay_010'), /output\/replays/);
});

test('output roots are fixed to Task 113 local and summary paths', () => {
    const roots = validateOutputRoots(
        '.local/deadem/cache/local-replay-processing/replay_010/loop-26-field-reader-segments/',
        'output/local-replay-processing/replay_010-loop-26-field-reader-segments/'
    );
    assert.equal(roots.local.relativePath, '.local/deadem/cache/local-replay-processing/replay_010/loop-26-field-reader-segments/');
    assert.equal(roots.summary.relativePath, 'output/local-replay-processing/replay_010-loop-26-field-reader-segments/');
});

test('Task 123 does not exist', () => {
    assert.equal(existsSync('tasks/specs/123.json'), false);
    assert.equal(existsSync('tasks/blocked/123-select-next-canonical-generalization-control.md'), false);
    assert.equal(existsSync('tasks/completed/123-inspect-loop-26-field-reader-segments.md'), false);
});
