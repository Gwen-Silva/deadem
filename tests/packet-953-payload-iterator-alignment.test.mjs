import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { test } from 'node:test';
import {
    buildAlignmentModelComparison,
    buildCumulativeBoundaryAnalysis,
    buildPacket953PayloadInventory,
    buildRiskAssessment,
    buildTask116Comparison,
    decideGate,
    validateInputPath,
    validateOutputRoots
} from '../tools/diagnose-replay-010-packet-953-payload-iterator-alignment.mjs';

function targetPacketSummary() {
    const entries = [
        [20, 'CNPC_Neutral_Bug', 79, 79],
        [21, 'CNPC_TrooperBoss', 22, 22],
        [22, 'CNPC_TrooperBoss', 22, 22],
        [23, 'CCitadel_Ability_ZipLine', 112, 112],
        [24, 'CCitadel_Ability_ZipLine', 112, 112],
        [25, 'CCitadel_Ability_ZipLine', 112, 112],
        [26, 'CCitadel_Ability_Familiar_HelpingHands', 221, 501],
        [27, 'CCitadel_Ability_Familiar_Ability01', 112, 0],
        [28, 'CCitadel_Ability_PrimaryWeapon_Empty', 22, 0],
        [29, 'CCitadel_Ability_HoldMelee', 73, 0]
    ].map(([loop, className, payloadBits, actualConsumedAfterCommand]) => ({
        loop,
        operation: 'UPDATE',
        entityIndex: 2400 + loop,
        className,
        payloadBits,
        actualConsumedAfterCommand,
        payloadMinusActualAfterCommand: payloadBits - actualConsumedAfterCommand,
        extractorMutationCount: actualConsumedAfterCommand > 0 ? 1 : 0
    }));
    return {
        targetPacketFound: true,
        targetPacketOrdinal: 953,
        updatedEntries: 30,
        serializedEntitiesByteLength: 43,
        payloadSizeCount: 30,
        payloadBitsSum: 5010,
        entityDataBitLength: 5344,
        entriesExamined: 30,
        operationCounts: { UPDATE: 30 },
        payloadIteratorAlignedWithUpdatedEntries: true,
        contextWindow: { entries },
        targetMismatchEntries: entries.filter(entry => entry.loop >= 26)
    };
}

function task116Boundary() {
    return {
        bitsAfterExpectedEndInsideSegment: 280,
        segmentSpanCoversLoops27To29PayloadWindow: true
    };
}

function task116SegmentSummary() {
    return {
        fieldPathId: 59,
        fieldPathName: 'm_nAvailableHelperCount',
        bitsConsumed: 288,
        bytesConsumed: 36,
        nullTerminatorObserved: true,
        bytesBeforeTerminator: 35,
        stoppedBecause: 'null_terminator',
        rawBytesRecorded: false,
        valueRecorded: false
    };
}

function task116Gate() {
    return {
        gate: 'local_replay_loop_26_string_reader_accounting_diagnosed'
    };
}

function successfulInputs() {
    const inventory = buildPacket953PayloadInventory(targetPacketSummary());
    const alignment = buildAlignmentModelComparison(inventory, task116Boundary());
    const cumulative = buildCumulativeBoundaryAnalysis(inventory);
    const task116Comparison = buildTask116Comparison(task116SegmentSummary(), task116Boundary(), task116Gate());
    const riskAssessment = buildRiskAssessment({ inventory, alignment, cumulative, task116Comparison });
    return { inventory, alignment, cumulative, task116Comparison, riskAssessment };
}

test('canary input and output roots are fixed to Task 117 scope', () => {
    assert.equal(validateInputPath('.local/deadem/replays/inbox/partida_010.dem', 'replay_010').relativePath, '.local/deadem/replays/inbox/partida_010.dem');
    assert.throws(() => validateInputPath('.local/deadem/replays/inbox/partida_005.dem', 'replay_005'), /unsupported|protected|unauthorized/);
    assert.throws(() => validateInputPath('.local/deadem/replays/inbox/partida_006.dem', 'replay_006'), /unsupported|bot fixture|unauthorized/);
    assert.throws(() => validateInputPath('.local/deadem/replays/inbox/partida_011.dem', 'replay_011'), /unsupported|outside|unauthorized/);
    assert.throws(() => validateInputPath('samples/partida_010.dem', 'replay_010'), /samples|unauthorized/);
    assert.throws(() => validateInputPath('output/replays/replay_010/partida_010.dem', 'replay_010'), /output\/replays|unauthorized/);

    const roots = validateOutputRoots(
        '.local/deadem/cache/local-replay-processing/replay_010/packet-953-payload-iterator-alignment/',
        'output/local-replay-processing/replay_010-packet-953-payload-iterator-alignment/'
    );
    assert.equal(roots.summary.relativePath, 'output/local-replay-processing/replay_010-packet-953-payload-iterator-alignment/');
    assert.throws(
        () => validateOutputRoots('.local/deadem/cache/local-replay-processing/replay_010/wrong/', 'output/local-replay-processing/replay_010-packet-953-payload-iterator-alignment/'),
        /local output root/
    );
});

test('packet inventory preserves Task 112 loop 26-29 numbers and iterator cardinality', () => {
    const inventory = buildPacket953PayloadInventory(targetPacketSummary());
    assert.equal(inventory.updatedEntries, 30);
    assert.equal(inventory.payloadSizeCount, 30);
    assert.equal(inventory.payloadSizeCountEqualsUpdatedEntries, true);
    assert.equal(inventory.iteratorExhaustedExactlyAtUpdatedEntries, true);
    assert.equal(inventory.anyNullOrUndefinedPayloadSize, false);
    assert.equal(inventory.payloadBitsByLoop[26], 221);
    assert.equal(inventory.actualConsumedAfterCommandByLoop[26], 501);
    assert.equal(inventory.payloadMinusActualAfterCommandByLoop[26], -280);
    assert.equal(inventory.payloadBitsByLoop[27], 112);
    assert.equal(inventory.actualConsumedAfterCommandByLoop[27], 0);
    assert.equal(inventory.loop26MatchesTask112, true);
});

test('small shifts and grouped following payloads do not explain the loop 26 mismatch', () => {
    const { alignment } = successfulInputs();
    assert.equal(alignment.currentModel.currentAlignmentExplainsLoop26, false);
    assert.equal(alignment.currentModel.loop26Delta, -280);
    assert.equal(alignment.answers.anySmallShiftReducesMismatchForLoops26To29, 'no');
    assert.equal(alignment.groupedModels.loop26ActualComparedWithPayloadBitsLoops26To29.payloadBitsSum, 428);
    assert.equal(alignment.groupedModels.loop26ActualComparedWithPayloadBitsLoops26To29.exactMatch, false);
    assert.equal(alignment.groupedModels.followingPayloadSubsetsComparedWithLoop26AfterBoundaryBits.targetBits, 280);
    assert.equal(alignment.groupedModels.followingPayloadSubsetsComparedWithLoop26AfterBoundaryBits.anyExactMatch, false);
    assert.equal(alignment.answers.evidenceSupportsPayloadBitsAsNonBoundaryOrSemanticMismatch, 'strengthened');
    assert.equal(alignment.answers.causalConclusion, 'not_determined');
});

test('cumulative nearby boundaries reduce but do not close the residual', () => {
    const { cumulative } = successfulInputs();
    assert.equal(cumulative.loop26CumulativeResidualBits, -280);
    assert.equal(cumulative.loop29CumulativeResidualBits, -73);
    assert.equal(cumulative.cumulativePayloadSumMatchesCumulativeActualAtNearbyBoundary, false);
    assert.equal(cumulative.exactNearbyBoundaryMatches.length, 0);
});

test('Task 116 comparison requires the exact string-reader accounting numbers', () => {
    const { task116Comparison } = successfulInputs();
    assert.equal(task116Comparison.exactTask116NumbersMatched, true);
    assert.equal(task116Comparison.summary.stringSegmentBits, 288);
    assert.equal(task116Comparison.summary.stoppedBecause, 'null_terminator');
    assert.equal(task116Comparison.summary.bitsAfterExpectedBoundary, 280);
    assert.equal(task116Comparison.valuesRecorded, false);
    assert.equal(task116Comparison.rawPayloadsRecorded, false);
});

test('gate passes only when inventory, model comparison, Task 116 comparison, and protections pass', () => {
    const { inventory, alignment, cumulative, task116Comparison, riskAssessment } = successfulInputs();
    const gate = decideGate({
        defaultPassResult: { expectedFailureReproduced: true },
        diagnosticPassResult: { expectedFailureReproduced: true, recoveryActionsEnabled: false },
        inventory,
        alignment,
        cumulative,
        task116Comparison,
        riskAssessment,
        protectionAudit: { passed: true }
    });
    assert.equal(gate.gate, 'local_replay_packet_953_payload_iterator_alignment_diagnosed');
    assert.equal(gate.payloadIteratorAlignmentConclusion.smallShiftExplainsMismatch, 'no');
    assert.equal(gate.payloadIteratorAlignmentConclusion.groupedPayloadExplainsMismatch, 'not_strengthened');

    const blocked = decideGate({
        defaultPassResult: { expectedFailureReproduced: true },
        diagnosticPassResult: { expectedFailureReproduced: true, recoveryActionsEnabled: false },
        inventory: { ...inventory, loop26MatchesTask112: false },
        alignment,
        cumulative,
        task116Comparison,
        riskAssessment,
        protectionAudit: { passed: true }
    });
    assert.equal(blocked.gate, 'local_replay_packet_953_payload_iterator_alignment_partial');
});

test('Task 118 was not created by Task 117', () => {
    assert.equal(existsSync('tasks/specs/118.json'), false);
    assert.equal(existsSync('tasks/completed/118-diagnose-packet-953-payload-iterator-alignment.md'), false);
    assert.equal(existsSync('tasks/blocked/118-select-next-canonical-generalization-control.md'), false);
});

