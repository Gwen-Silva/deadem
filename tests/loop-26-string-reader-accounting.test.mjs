import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { test } from 'node:test';
import BitBuffer from '../packages/engine/src/core/BitBuffer.js';
import {
    buildPayloadBoundaryRelation,
    buildStringReaderSegmentSummary,
    buildStringReaderWellformedness,
    buildTask115Comparison,
    decideGate,
    validateInputPath,
    validateOutputRoots
} from '../tools/diagnose-replay-010-loop-26-string-reader-accounting.mjs';

function loop26Entry() {
    return {
        loop: 26,
        accumulatedEntityIndex: 2598,
        className: 'CCitadel_Ability_Familiar_HelpingHands',
        payloadBits: 221,
        readCounts: {
            afterCommand: 4842,
            afterAction: 5343
        }
    };
}

function segment59() {
    return {
        ordinal: 6,
        beforeReadCount: 5055,
        afterReadCount: 5343,
        bitsConsumed: 288,
        fieldPathId: 59,
        fieldPathName: 'm_nAvailableHelperCount',
        decoderName: 'decodeString',
        decoderType: 'function',
        serializerName: 'CCitadel_Ability_Familiar_HelpingHands',
        serializerVersion: 0,
        storageType: 'MISC',
        storageDimension: 0,
        storageSigned: false,
        storageBool: false
    };
}

function stringRead() {
    return {
        ordinal: 12,
        beforeReadCount: 5055,
        afterReadCount: 5343,
        bitsConsumed: 288,
        bytesConsumed: 36,
        bytesRead: 36,
        stringReaderLimitProvided: null,
        nullTerminatorObserved: true,
        bytesBeforeTerminator: 35,
        stoppedBecause: 'null_terminator',
        valueRecorded: false,
        rawBytesRecorded: false
    };
}

function runtimeDefinition() {
    return {
        runtimeVarTypeKnown: true,
        runtimeVarTypeClassification: 'string_like',
        fieldPath: {
            fieldPathId: 59,
            flattenedFieldName: 'm_nAvailableHelperCount',
            varType: 'char',
            decoderFunctionName: 'decodeString',
            storageType: 'MISC'
        }
    };
}

function runtimeGate() {
    return {
        gate: 'local_replay_loop_26_fieldpath_59_runtime_definition_captured'
    };
}

function task113SegmentSummary() {
    return {
        largestSegmentBits: 288
    };
}

function loopEntries() {
    return [
        loop26Entry(),
        { loop: 27, payloadBits: 112, readCounts: { afterCommand: 5351, afterAction: 5351 } },
        { loop: 28, payloadBits: 22, readCounts: { afterCommand: 5359, afterAction: 5359 } },
        { loop: 29, payloadBits: 73, readCounts: { afterCommand: 5367, afterAction: 5367 } }
    ];
}

function successfulInputs() {
    const summary = buildStringReaderSegmentSummary({
        loop26: loop26Entry(),
        targetSegment: segment59(),
        stringReads: [stringRead()],
        runtimeDefinition: runtimeDefinition()
    });
    const boundary = buildPayloadBoundaryRelation({
        loop26: loop26Entry(),
        loopEntries: loopEntries(),
        targetSegment: segment59()
    });
    const wellformedness = buildStringReaderWellformedness(summary, boundary);
    const comparison = buildTask115Comparison(summary, runtimeDefinition(), runtimeGate(), task113SegmentSummary());
    return { summary, boundary, wellformedness, comparison };
}

test('canary input and output roots are fixed to Task 116 scope', () => {
    assert.equal(validateInputPath('.local/deadem/replays/inbox/partida_010.dem', 'replay_010').relativePath, '.local/deadem/replays/inbox/partida_010.dem');
    assert.throws(() => validateInputPath('.local/deadem/replays/inbox/partida_005.dem', 'replay_005'), /unsupported|protected|unauthorized/);
    assert.throws(() => validateInputPath('.local/deadem/replays/inbox/partida_006.dem', 'replay_006'), /unsupported|bot fixture|unauthorized/);
    assert.throws(() => validateInputPath('.local/deadem/replays/inbox/partida_011.dem', 'replay_011'), /unsupported|outside|unauthorized/);
    assert.throws(() => validateInputPath('samples/partida_010.dem', 'replay_010'), /samples/);
    assert.throws(() => validateInputPath('output/replays/replay_010/partida_010.dem', 'replay_010'), /output\/replays/);

    const roots = validateOutputRoots(
        '.local/deadem/cache/local-replay-processing/replay_010/loop-26-string-reader-accounting/',
        'output/local-replay-processing/replay_010-loop-26-string-reader-accounting/'
    );
    assert.equal(roots.local.relativePath, '.local/deadem/cache/local-replay-processing/replay_010/loop-26-string-reader-accounting/');
    assert.equal(roots.summary.relativePath, 'output/local-replay-processing/replay_010-loop-26-string-reader-accounting/');
});

test('BitBuffer string diagnostic collector records accounting without value or raw bytes', () => {
    const records = [];
    BitBuffer.setStringReadDiagnosticsCollectorForDiagnostics(record => records.push(record));
    try {
        const value = new BitBuffer(new Uint8Array([65, 66, 0])).readString();
        assert.equal(value, 'AB');
    } finally {
        BitBuffer.setStringReadDiagnosticsCollectorForDiagnostics(null);
    }
    assert.equal(records.length, 1);
    assert.equal(records[0].bitsConsumed, 24);
    assert.equal(records[0].bytesConsumed, 3);
    assert.equal(records[0].nullTerminatorObserved, true);
    assert.equal(records[0].bytesBeforeTerminator, 2);
    assert.equal(records[0].stoppedBecause, 'null_terminator');
    assert.equal(records[0].valueRecorded, false);
    assert.equal(records[0].rawBytesRecorded, false);
    assert.equal(Object.hasOwn(records[0], 'value'), false);
    assert.equal(Object.hasOwn(records[0], 'bytes'), false);
});

test('string reader segment summary matches field path 59 by read-count window', () => {
    const { summary } = successfulInputs();
    assert.equal(summary.found, true);
    assert.equal(summary.entityIndex, 2598);
    assert.equal(summary.fieldPathId, 59);
    assert.equal(summary.runtimeVarType, 'char');
    assert.equal(summary.decoderName, 'decodeString');
    assert.equal(summary.storageType, 'MISC');
    assert.equal(summary.bitsConsumed, 288);
    assert.equal(summary.bytesConsumed, 36);
    assert.equal(summary.nullTerminatorObserved, true);
    assert.equal(summary.bytesBeforeTerminator, 35);
    assert.equal(summary.stoppedBecause, 'null_terminator');
    assert.equal(summary.stringReadDiagnosticMatchedByReadCounts, true);
    assert.equal(summary.valueRecorded, false);
    assert.equal(summary.rawBytesRecorded, false);
});

test('payload boundary relation reports that field path 59 crosses loop 26 payloadBits end', () => {
    const { boundary } = successfulInputs();
    assert.equal(boundary.loop26AfterCommandReadCount, 4842);
    assert.equal(boundary.loop26PayloadBits, 221);
    assert.equal(boundary.loop26ExpectedEndFromPayloadBits, 5063);
    assert.equal(boundary.fieldPath59StartReadCount, 5055);
    assert.equal(boundary.fieldPath59EndReadCount, 5343);
    assert.equal(boundary.startOffsetAfterCommand, 213);
    assert.equal(boundary.endOffsetAfterCommand, 501);
    assert.equal(boundary.segmentStartsBeforeExpectedEnd, true);
    assert.equal(boundary.segmentEndsAfterExpectedEnd, true);
    assert.equal(boundary.bitsBeforeExpectedEndInsideSegment, 8);
    assert.equal(boundary.bitsAfterExpectedEndInsideSegment, 280);
    assert.equal(boundary.loops27To29PayloadBitsSum, 207);
    assert.equal(boundary.loop26ExtraBitsBeyondPayload, 280);
    assert.equal(boundary.whetherSegmentSpanCouldCoverFollowingPayloadWindow, 'metric_possible_not_causal');
});

test('wellformedness keeps local string-reader normality distinct from payload-boundary mismatch', () => {
    const { wellformedness } = successfulInputs();
    assert.equal(wellformedness.nullTerminatorObserved, true);
    assert.equal(wellformedness.bytesConsumedIsInteger, true);
    assert.equal(wellformedness.readStringTerminatedLocallyNormally, true);
    assert.equal(wellformedness.boundaryAbnormal, true);
    assert.equal(wellformedness.decoderBugDirectHypothesis, 'weakened_by_locally_normal_string_termination');
    assert.equal(wellformedness.payloadAccountingMismatchHypothesis, 'still_supported_by_boundary_crossing');
    assert.equal(wellformedness.causalConclusion, 'not_determined');
});

test('Task 115 comparison requires exact runtime and segment evidence', () => {
    const { comparison } = successfulInputs();
    assert.equal(comparison.exactTask115NumbersMatched, true);
    assert.equal(comparison.task115RuntimeVarTypeKnown, true);
    assert.equal(comparison.task115RuntimeVarType, 'char');
    assert.equal(comparison.task115RuntimeVarTypeClassification, 'string_like');
    assert.equal(comparison.differences.length, 0);
});

test('gate is diagnosed only when string metrics, boundary relation, Task 115, and protections pass', () => {
    const { summary, boundary, wellformedness, comparison } = successfulInputs();
    const gate = decideGate({
        defaultPass: { expectedFailureReproduced: true },
        diagnosticPass: { expectedFailureReproduced: true },
        segmentSummary: summary,
        boundaryRelation: boundary,
        wellformedness,
        task115Comparison: comparison,
        protectionAudit: { passed: true },
        branchAudit: { passed: true }
    });
    assert.equal(gate.gate, 'local_replay_loop_26_string_reader_accounting_diagnosed');
    assert.equal(gate.stringReaderBytesConsumed, 36);
    assert.equal(gate.stringReaderStoppedBecause, 'null_terminator');
    assert.equal(gate.segmentCrossesLoop26PayloadBoundary, true);
    assert.equal(gate.bitsAfterLoop26ExpectedBoundaryInsideSegment, 280);
    assert.equal(gate.recoveryAddedOrPromoted, false);
    assert.equal(gate.stringValuesEmitted, false);
    assert.equal(gate.causalConclusion, 'not_determined');

    const blocked = decideGate({
        defaultPass: { expectedFailureReproduced: false },
        diagnosticPass: { expectedFailureReproduced: true },
        segmentSummary: summary,
        boundaryRelation: boundary,
        wellformedness,
        task115Comparison: comparison,
        protectionAudit: { passed: true },
        branchAudit: { passed: true }
    });
    assert.equal(blocked.gate, 'local_replay_loop_26_string_reader_accounting_blocked');
});

test('Task 121 does not exist', () => {
    assert.equal(existsSync('tasks/specs/121.json'), false);
    assert.equal(existsSync('tasks/blocked/121-select-next-canonical-generalization-control.md'), false);
    assert.equal(existsSync('tasks/completed/121-diagnose-loop-26-string-reader-accounting.md'), false);
});
