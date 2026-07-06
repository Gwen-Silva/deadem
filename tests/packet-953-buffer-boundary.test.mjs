import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { test } from 'node:test';
import {
    buildLoopBoundaryClassification,
    buildPacket953BoundaryInventory,
    buildRiskAssessment,
    buildTask117Comparison,
    decideGate,
    runSyntheticBitBufferBoundaryProbes,
    validateInputPath,
    validateOutputRoots
} from '../tools/diagnose-replay-010-packet-953-buffer-boundary.mjs';

function targetPacketSummary() {
    return {
        targetPacketFound: true,
        targetPacketOrdinal: 953,
        updatedEntries: 30,
        serializedEntitiesByteLength: 43,
        payloadSizeCount: 30,
        payloadBitsSum: 5010,
        entityDataBitLength: 5344,
        entriesExamined: 30,
        targetMismatchEntries: [
            {
                loop: 26,
                operation: 'UPDATE',
                entityIndex: 2598,
                className: 'CCitadel_Ability_Familiar_HelpingHands',
                payloadBits: 221,
                actualConsumedAfterCommand: 501,
                payloadMinusActualAfterCommand: -280,
                readCounts: {
                    beforeIndex: 4834,
                    afterIndex: 4840,
                    afterCommand: 4842,
                    afterAction: 5343
                }
            },
            {
                loop: 27,
                operation: 'UPDATE',
                entityIndex: 2599,
                className: 'CCitadel_Ability_Familiar_Ability01',
                payloadBits: 112,
                actualConsumedAfterCommand: 0,
                payloadMinusActualAfterCommand: 112,
                readCounts: {
                    beforeIndex: 5343,
                    afterIndex: 5349,
                    afterCommand: 5351,
                    afterAction: 5351
                }
            },
            {
                loop: 28,
                operation: 'UPDATE',
                entityIndex: 2600,
                className: 'CCitadel_Ability_PrimaryWeapon_Empty',
                payloadBits: 22,
                actualConsumedAfterCommand: 0,
                payloadMinusActualAfterCommand: 22,
                readCounts: {
                    beforeIndex: 5351,
                    afterIndex: 5357,
                    afterCommand: 5359,
                    afterAction: 5359
                }
            },
            {
                loop: 29,
                operation: 'UPDATE',
                entityIndex: 2601,
                className: 'CCitadel_Ability_HoldMelee',
                payloadBits: 73,
                actualConsumedAfterCommand: 0,
                payloadMinusActualAfterCommand: 73,
                readCounts: {
                    beforeIndex: 5359,
                    afterIndex: 5365,
                    afterCommand: 5367,
                    afterAction: 5367
                }
            }
        ]
    };
}

function task116Boundary() {
    return {
        loop26ExpectedEndFromPayloadBits: 5063,
        bitsAfterExpectedEndInsideSegment: 280,
        rawPayloadsRecorded: false
    };
}

function task116Segment() {
    return {
        beforeReadCount: 5055,
        afterReadCount: 5343,
        bitsConsumed: 288,
        valueRecorded: false,
        rawBytesRecorded: false
    };
}

function bitbufferBehavior() {
    return {
        syntheticReplayBytesUsed: false,
        syntheticProbes: runSyntheticBitBufferBoundaryProbes(),
        readsBeyondEndCanAdvanceWithoutThrowing: true,
        directOutOfBoundsReadCanReturnZero: true
    };
}

function payloadInventory() {
    return {
        payloadSizeCount: 30,
        updatedEntries: 30,
        payloadSizeCountEqualsUpdatedEntries: true,
        anyNullOrUndefinedPayloadSize: false
    };
}

function payloadGate() {
    return {
        gate: 'local_replay_packet_953_payload_iterator_alignment_diagnosed',
        payloadIteratorAlignmentConclusion: {
            currentAlignmentExplainsLoop26: 'no',
            smallShiftExplainsMismatch: 'no',
            groupedPayloadExplainsMismatch: 'not_strengthened',
            cumulativeBoundaryExplainsMismatch: 'no'
        }
    };
}

function alignment() {
    return {
        answers: {
            currentAlignmentExplainsLoop26: 'no',
            anySmallShiftReducesMismatchForLoops26To29: 'no',
            evidenceSupportsGroupedPayloadSemantics: 'not_strengthened'
        }
    };
}

function successfulInputs() {
    const boundaryInventory = buildPacket953BoundaryInventory(targetPacketSummary(), task116Boundary(), task116Segment());
    const behavior = bitbufferBehavior();
    const classification = buildLoopBoundaryClassification(boundaryInventory, behavior);
    const comparison = buildTask117Comparison(boundaryInventory, behavior, classification, payloadInventory(), payloadGate(), alignment(), task116Boundary(), task116Segment());
    const risk = buildRiskAssessment({ boundaryInventory, bitbufferBehavior: behavior, classification, task117Comparison: comparison });
    return { boundaryInventory, behavior, classification, comparison, risk };
}

test('canary input and output roots are fixed to Task 118 scope', () => {
    assert.equal(validateInputPath('.local/deadem/replays/inbox/partida_010.dem', 'replay_010').relativePath, '.local/deadem/replays/inbox/partida_010.dem');
    assert.throws(() => validateInputPath('.local/deadem/replays/inbox/partida_005.dem', 'replay_005'), /unsupported|protected|unauthorized/);
    assert.throws(() => validateInputPath('.local/deadem/replays/inbox/partida_006.dem', 'replay_006'), /unsupported|bot fixture|unauthorized/);
    assert.throws(() => validateInputPath('.local/deadem/replays/inbox/partida_011.dem', 'replay_011'), /unsupported|outside|unauthorized/);
    assert.throws(() => validateInputPath('samples/partida_010.dem', 'replay_010'), /samples|unauthorized/);
    assert.throws(() => validateInputPath('output/replays/replay_010/partida_010.dem', 'replay_010'), /output\/replays|unauthorized/);

    const roots = validateOutputRoots(
        '.local/deadem/cache/local-replay-processing/replay_010/packet-953-buffer-boundary/',
        'output/local-replay-processing/replay_010-packet-953-buffer-boundary/'
    );
    assert.equal(roots.summary.relativePath, 'output/local-replay-processing/replay_010-packet-953-buffer-boundary/');
    assert.throws(
        () => validateOutputRoots('.local/deadem/cache/local-replay-processing/replay_010/wrong/', 'output/local-replay-processing/replay_010-packet-953-buffer-boundary/'),
        /local output root/
    );
});

test('packet boundary inventory captures loop 26 end and post-loop read counts', () => {
    const { boundaryInventory } = successfulInputs();
    assert.equal(boundaryInventory.entityDataBitLength, 5344);
    assert.equal(boundaryInventory.loop26AfterCommandReadCount, 4842);
    assert.equal(boundaryInventory.loop26AfterActionReadCount, 5343);
    assert.equal(boundaryInventory.remainingBitsAfterLoop26, 1);
    assert.equal(boundaryInventory.fieldPath59ReadStart, 5055);
    assert.equal(boundaryInventory.fieldPath59ReadEnd, 5343);
    assert.equal(boundaryInventory.packetFinalReadCount, 5367);
    assert.equal(boundaryInventory.packetFinalReadCountRelation, 'exceeds_entityDataBitLength');
    assert.equal(boundaryInventory.packetFinalReadCountDeltaBits, 23);
});

test('loops 27-29 are classified by read-count bounds only', () => {
    const { classification } = successfulInputs();
    assert.deepEqual(classification.summary.paddingOrTrailingBitReads, [27]);
    assert.deepEqual(classification.summary.outOfBufferReads, [28, 29]);
    assert.deepEqual(classification.summary.validEntryReads, []);
    assert.equal(classification.bufferBoundaryArtifactHypothesis, 'strengthened_not_fix');
    assert.equal(classification.causalConclusion, 'not_determined');
});

test('synthetic BitBuffer probes show mixed guarded and unguarded boundary behavior', () => {
    const probes = runSyntheticBitBufferBoundaryProbes();
    const byDescription = Object.fromEntries(probes.map(probe => [probe.description, probe]));
    assert.equal(byDescription['move beyond end throws'].threw, true);
    assert.equal(byDescription['read() beyond end throws through _read bounds check'].threw, true);
    assert.equal(byDescription['readBitsAsUInt crosses beyond end without throwing'].threw, false);
    assert.equal(byDescription['readBitsAsUInt crosses beyond end without throwing'].readCount, 13);
    assert.equal(byDescription['readUInt8 at byte-aligned end returns zero and advances'].threw, false);
    assert.equal(byDescription['readUInt8 at byte-aligned end returns zero and advances'].value, 0);
    assert.equal(byDescription['readUVarInt32 at byte-aligned end uses readUInt8 and returns zero'].value, 0);
});

test('Task 117 comparison requires exact iterator and string-boundary numbers', () => {
    const { comparison } = successfulInputs();
    assert.equal(comparison.exactTask117NumbersMatched, true);
    assert.equal(comparison.noSmallShiftGroupedOrCumulativeModelExplained, true);
    assert.equal(comparison.loop26StringEndAndRemainingBitsConfirmed, true);
    assert.equal(comparison.bitbufferBoundaryBehaviorSummary.readsBeyondEndCanAdvanceWithoutThrowing, true);
    assert.equal(comparison.valuesRecorded, false);
    assert.equal(comparison.rawPayloadsRecorded, false);
});

test('gate passes only with boundary inventory, synthetic BitBuffer probes, comparison, and protections', () => {
    const { boundaryInventory, behavior, classification, comparison, risk } = successfulInputs();
    const gate = decideGate({
        defaultPassResult: { expectedFailureReproduced: true },
        diagnosticPassResult: { expectedFailureReproduced: true, recoveryActionsEnabled: false },
        boundaryInventory,
        bitbufferBehavior: behavior,
        classification,
        task117Comparison: comparison,
        riskAssessment: risk,
        protectionAudit: { passed: true }
    });
    assert.equal(gate.gate, 'local_replay_packet_953_buffer_boundary_diagnosed');
    assert.equal(gate.bufferBoundaryConclusion.loop27Classification, 'padding_or_trailing_bit_reads');
    assert.equal(gate.bufferBoundaryConclusion.loop28Classification, 'out_of_buffer_reads');

    const partial = decideGate({
        defaultPassResult: { expectedFailureReproduced: true },
        diagnosticPassResult: { expectedFailureReproduced: true, recoveryActionsEnabled: false },
        boundaryInventory: { ...boundaryInventory, entityDataBitLength: 1 },
        bitbufferBehavior: behavior,
        classification,
        task117Comparison: comparison,
        riskAssessment: risk,
        protectionAudit: { passed: true }
    });
    assert.equal(partial.gate, 'local_replay_packet_953_buffer_boundary_partial');
});

test('Task 122 was not created by Task 119', () => {
    assert.equal(existsSync('tasks/specs/122.json'), false);
    assert.equal(existsSync('tasks/completed/122-diagnose-packet-953-buffer-boundary.md'), false);
    assert.equal(existsSync('tasks/blocked/122-select-next-canonical-generalization-control.md'), false);
});
