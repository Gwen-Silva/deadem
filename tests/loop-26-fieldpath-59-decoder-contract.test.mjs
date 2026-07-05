import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { test } from 'node:test';
import {
    buildFieldPath59Contract,
    buildLoop26FieldPathContractComparison,
    buildRiskAssessment,
    buildSerializerConstructionInventory,
    buildTask113Comparison,
    decideGate,
    validateInputPath,
    validateOutputRoots
} from '../tools/investigate-replay-010-loop-26-fieldpath-59-decoder-contract.mjs';

function segment(ordinal, fieldPathId, bitsConsumed, fieldPathName, decoderName, storageType) {
    return {
        ordinal,
        bitsConsumed,
        fieldPathId,
        fieldPathName,
        decoderName,
        serializerName: 'CCitadel_Ability_Familiar_HelpingHands',
        serializerVersion: 0,
        storageType,
        storageDimension: storageType === 'MISC' ? 0 : 1,
        storageSigned: false,
        storageBool: false
    };
}

function task113Summary() {
    const fieldReadSegments = [
        segment(0, 0, 24, 'm_nUpgradeInfo', 'decodeUVarInt32', 'INT'),
        segment(1, 1, 32, 'm_flCooldownStart', 'decodeNoScale', 'FLOAT'),
        segment(2, 24, 32, 'm_flCooldownEnd', 'decodeNoScale', 'FLOAT'),
        segment(3, 56, 8, 'm_vecHelpers', 'decodeUVarInt32', 'INT'),
        segment(4, 3373, 32, 'm_vecHelpers.0000', 'decodeUVarInt32', 'INT'),
        segment(5, 58, 32, 'm_tSoonestHelperCooldownEndTime', 'decodeNoScale', 'FLOAT'),
        segment(6, 59, 288, 'm_nAvailableHelperCount', 'decodeString', 'MISC')
    ];
    return {
        schemaVersion: 1,
        replayId: 'replay_010',
        packetOrdinal: 953,
        loop: 26,
        found: true,
        entityIndex: 2598,
        className: 'CCitadel_Ability_Familiar_HelpingHands',
        payloadBits: 221,
        actualConsumedAfterCommand: 501,
        payloadMinusActualAfterCommand: -280,
        extraBitsConsumedBeyondPayload: 280,
        extractorMutationCount: 7,
        fieldPathBitsConsumed: 53,
        fieldReaderBitsConsumed: 448,
        totalExtractorBitsConsumed: 501,
        fieldReadSegmentCount: 7,
        fieldReadSegments,
        largestSegment: fieldReadSegments[6],
        largestSegmentBits: 288,
        valuesRecorded: false,
        rawPayloadsRecorded: false
    };
}

function staticInventory() {
    return {
        sourceSearch: {
            targetFieldFound: false,
            targetSerializerFound: false,
            matches: []
        },
        constructionFacts: [
            { id: 'decode_string_misc_catalog_pair', status: 'supported' }
        ]
    };
}

test('canary input and output roots are fixed to Task 114 scope', () => {
    assert.equal(validateInputPath('.local/deadem/replays/inbox/partida_010.dem', 'replay_010').relativePath, '.local/deadem/replays/inbox/partida_010.dem');
    assert.throws(() => validateInputPath('.local/deadem/replays/inbox/partida_005.dem', 'replay_005'), /unsupported|protected|unauthorized/);
    assert.throws(() => validateInputPath('.local/deadem/replays/inbox/partida_006.dem', 'replay_006'), /unsupported|bot fixture|unauthorized/);
    assert.throws(() => validateInputPath('.local/deadem/replays/inbox/partida_011.dem', 'replay_011'), /unsupported|outside|unauthorized/);
    assert.throws(() => validateInputPath('samples/partida_010.dem', 'replay_010'), /samples/);
    assert.throws(() => validateInputPath('output/replays/replay_010/partida_010.dem', 'replay_010'), /output\/replays/);

    const roots = validateOutputRoots(
        '.local/deadem/cache/local-replay-processing/replay_010/loop-26-fieldpath-59-decoder-contract/',
        'output/local-replay-processing/replay_010-loop-26-fieldpath-59-decoder-contract/'
    );
    assert.equal(roots.summary.relativePath, 'output/local-replay-processing/replay_010-loop-26-fieldpath-59-decoder-contract/');
});

test('Task 113 comparison checks exact target numbers and value exclusion', () => {
    const comparison = buildTask113Comparison(task113Summary());
    assert.equal(comparison.exactTask113NumbersMatched, true);
    assert.equal(comparison.differences.length, 0);
    assert.equal(comparison.confirmedLargestSegment.fieldPathId, 59);
    assert.equal(comparison.confirmedLargestSegment.decoderName, 'decodeString');
    assert.equal(comparison.confirmedLargestSegment.bitsConsumed, 288);
    assert.equal(comparison.fieldValuesEmittedByTask113Summary, false);
    assert.ok(comparison.comparedFields.includes('largestSegment.storageType'));
});

test('loop comparison isolates field path 59 as decodeString/MISC outlier', () => {
    const comparison = buildLoop26FieldPathContractComparison(task113Summary());
    assert.deepEqual(comparison.comparedFieldPaths, [0, 1, 24, 56, 3373, 58, 59]);
    assert.equal(comparison.targetOutlier.fieldPathId, 59);
    assert.equal(comparison.targetOutlier.bitsConsumed, 288);
    assert.equal(comparison.targetOutlier.onlyStringMiscSegmentInLoop26, true);
    assert.equal(comparison.targetOutlier.largestObservedSegment, true);
    assert.equal(comparison.nearby.find(row => row.fieldPathId === 57).availableFromTask113Loop26, false);
    assert.equal(comparison.valuesRecorded, false);
});

test('field path 59 contract separates local support from semantic suspicion', () => {
    const contract = buildFieldPath59Contract(task113Summary(), staticInventory());
    assert.equal(contract.localContractAssessment.decodeStringMiscPairSupportedByLocalCatalog, true);
    assert.equal(contract.localContractAssessment.runtimeSerializerMetadataSelfConsistent, true);
    assert.equal(contract.localContractAssessment.fieldNameSuggestsNumericCount, true);
    assert.equal(contract.localContractAssessment.suspiciousNameDecoderPair, true);
    assert.equal(contract.localContractAssessment.localStaticSchemaOrProtoFieldFound, false);
    assert.equal(contract.localContractAssessment.parserBugConcluded, false);
    assert.equal(contract.localContractAssessment.source2SemanticsClaimed, false);
    assert.equal(contract.answer.decodeStringForAvailableHelperCountSupportedByLocalMetadata, 'supported_by_runtime_serializer_metadata_and_local_decoder_catalog');
});

test('risk assessment does not promote recovery or parser fixes', () => {
    const comparison = buildLoop26FieldPathContractComparison(task113Summary());
    const contract = buildFieldPath59Contract(task113Summary(), staticInventory());
    const risk = buildRiskAssessment(contract, comparison);
    assert.equal(risk.parserFixRecommendedNow, false);
    assert.equal(risk.recoveryRecommendation, 'do_not_add_recovery_from_this_evidence');
    assert.equal(risk.directMissingUpdateSkipStatus, 'unsafe');
    assert.equal(risk.parserBugConcluded, false);
    assert.equal(risk.source2SemanticsClaimed, false);
});

test('gate requires failure reproduction, static inventory, Task 113 match, and protections', () => {
    const summary = task113Summary();
    const inventory = staticInventory();
    const contract = buildFieldPath59Contract(summary, inventory);
    const gate = decideGate({
        defaultPass: { expectedFailureReproduced: true },
        diagnosticPass: { expectedFailureReproduced: true },
        task113Comparison: buildTask113Comparison(summary),
        inventory,
        contract,
        protectionAudit: { passed: true },
        branchAudit: { passed: true }
    });
    assert.equal(gate.gate, 'local_replay_loop_26_fieldpath_59_decoder_contract_investigated');
    assert.equal(gate.recoveryAddedOrPromoted, false);
    assert.equal(gate.factualArtifactsEmitted, false);

    const blocked = decideGate({
        defaultPass: { expectedFailureReproduced: true },
        diagnosticPass: { expectedFailureReproduced: true },
        task113Comparison: { exactTask113NumbersMatched: false },
        inventory,
        contract,
        protectionAudit: { passed: true },
        branchAudit: { passed: true }
    });
    assert.equal(blocked.gate, 'local_replay_loop_26_fieldpath_59_decoder_contract_blocked');
});

test('static serializer inventory finds local decodeString/MISC construction evidence', async () => {
    const inventory = await buildSerializerConstructionInventory();
    assert.ok(inventory.filesExamined.includes('packages/engine/src/data/fields/FieldFactory.js'));
    assert.ok(inventory.filesExamined.includes('packages/engine/src/data/fields/decoding/FieldDecoderCatalog.js'));
    assert.equal(inventory.constructionFacts.find(fact => fact.id === 'decode_string_misc_catalog_pair').status, 'supported');
    assert.equal(inventory.fieldValuesRecorded, false);
    assert.equal(inventory.rawPayloadsRecorded, false);
});

test('Task 116 does not exist', () => {
    assert.equal(existsSync('tasks/specs/116.json'), false);
    assert.equal(existsSync('tasks/blocked/116-select-next-canonical-generalization-control.md'), false);
    assert.equal(existsSync('tasks/completed/116-investigate-loop-26-fieldpath-59-decoder-contract.md'), false);
});
