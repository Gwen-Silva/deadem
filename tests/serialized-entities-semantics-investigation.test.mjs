import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { test } from 'node:test';
import {
    buildExtractorContractAnalysis,
    buildSchemaFieldInventory,
    buildSemanticRiskAssessment,
    decideGate,
    decodeBitBufferUVarInt32,
    decodeByteVarints,
    validateInputPath,
    validateOutputRoots
} from '../tools/investigate-serialized-entities-semantics.mjs';

function syntheticDynamicEvidence(overrides = {}) {
    return {
        schemaVersion: 1,
        replayId: 'replay_010',
        boundaryPacketMetrics: {
            updatedEntries: 42,
            payloadSizeCount: 42
        },
        loop21: {
            payloadBitsFromSerializedEntities: 227,
            actualConsumedAfterCommand: 363,
            mismatchConfirmedAgainstAfterCommand: true
        },
        loop22: {
            payloadBitsFromSerializedEntities: 266,
            semanticJustification: 'not_independently_justified'
        },
        loop23: {
            operation: 'CREATE',
            errorMessage: 'entity index out of range'
        },
        broaderPacketSampleStatus: 'not_collected_requires_engine_instrumentation',
        ...overrides
    };
}

test('schema inventory records serializedEntities as optional bytes field 13 without direct-skip proof', async () => {
    const inventory = await buildSchemaFieldInventory();
    assert.equal(inventory.schemaConclusion.fieldIsPresent, true);
    assert.equal(inventory.schemaConclusion.schemaType, 'optional bytes');
    assert.equal(inventory.schemaConclusion.schemaDocumentsDirectSkipBits, false);
    assert.ok(inventory.sourceDefinitions.every(definition => definition.fieldNumber === 13));
    assert.ok(inventory.sourceDefinitions.every(definition => definition.protoType === 'bytes'));
    assert.ok(inventory.compiledDefinitions.every(definition => definition.protoName === 'serialized_entities'));
});

test('extractor contract decodes a byte-varint stream and does not establish direct skips', () => {
    const expected = [22, 63, 227, 266];
    assert.deepEqual(decodeByteVarints([0x16, 0x3F, 0xE3, 0x01, 0x8A, 0x02]), expected);
    assert.deepEqual(decodeBitBufferUVarInt32([0x16, 0x3F, 0xE3, 0x01, 0x8A, 0x02]), expected);

    const analysis = buildExtractorContractAnalysis();
    assert.equal(analysis.comparisonWithBitBuffer.extractorMatchesReadUVarInt32Shape, true);
    assert.equal(analysis.supportedBySchema, false);
    assert.equal(analysis.namePayloadBitsStatus, 'local_inference_not_schema_proof');
    assert.equal(analysis.directAfterCommandSkipContractStatus, 'not_established');
});

test('risk assessment rejects direct after-command skip as a safe recovery contract', async () => {
    const risk = buildSemanticRiskAssessment(
        await buildSchemaFieldInventory(),
        buildExtractorContractAnalysis(),
        syntheticDynamicEvidence()
    );
    assert.equal(
        risk.directAfterCommandSkipAssumptionStatus,
        'contradicted_by_observed_replay_metric_and_not_supported_by_schema'
    );
    assert.equal(risk.missingUpdateRecoveryRecommendation, 'diagnostic_only_do_not_use_as_safe_skip');
    assert.equal(risk.shouldChangeParserNow, false);
});

test('gate passes only when schema, extractor, Task 109 evidence, and protections are present', async () => {
    const schemaInventory = await buildSchemaFieldInventory();
    const extractorAnalysis = buildExtractorContractAnalysis();
    const dynamicSample = syntheticDynamicEvidence();
    const riskAssessment = buildSemanticRiskAssessment(schemaInventory, extractorAnalysis, dynamicSample);
    const gate = decideGate({
        defaultPass: { expectedFailureReproduced: true },
        recoveryPass: { advancedPastTask105Failure: true, boundaryReached: true },
        schemaInventory,
        extractorAnalysis,
        dynamicSample,
        riskAssessment,
        protectionAudit: { passed: true, parserEngineModified: false, recoveryAdded: false },
        branchAudit: { passed: true }
    });
    assert.equal(gate.gate, 'local_replay_serialized_entities_semantics_investigated');
});

test('gate blocks without the Task 109 loop-21 mismatch evidence', async () => {
    const schemaInventory = await buildSchemaFieldInventory();
    const extractorAnalysis = buildExtractorContractAnalysis();
    const dynamicSample = syntheticDynamicEvidence({
        loop21: { mismatchConfirmedAgainstAfterCommand: false },
        loop22: { semanticJustification: 'not_independently_justified' }
    });
    const riskAssessment = buildSemanticRiskAssessment(schemaInventory, extractorAnalysis, dynamicSample);
    const gate = decideGate({
        defaultPass: { expectedFailureReproduced: true },
        recoveryPass: { advancedPastTask105Failure: true, boundaryReached: true },
        schemaInventory,
        extractorAnalysis,
        dynamicSample,
        riskAssessment,
        protectionAudit: { passed: true, parserEngineModified: false, recoveryAdded: false },
        branchAudit: { passed: true }
    });
    assert.equal(gate.gate, 'local_replay_serialized_entities_semantics_blocked');
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

test('output roots are fixed to serialized-entities investigation paths', () => {
    const roots = validateOutputRoots(
        '.local/deadem/cache/local-replay-processing/replay_010/serialized-entities-semantics-investigation/',
        'output/local-replay-processing/replay_010-serialized-entities-semantics-investigation/'
    );
    assert.equal(roots.local.relativePath, '.local/deadem/cache/local-replay-processing/replay_010/serialized-entities-semantics-investigation/');
    assert.equal(roots.summary.relativePath, 'output/local-replay-processing/replay_010-serialized-entities-semantics-investigation/');
});

test('Task 112 does not exist', () => {
    assert.equal(existsSync('tasks/specs/112.json'), false);
    assert.equal(existsSync('tasks/blocked/112-select-next-canonical-generalization-control.md'), false);
});
