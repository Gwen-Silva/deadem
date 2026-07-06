import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { test } from 'node:test';
import {
    buildFieldPath59RuntimeDefinition,
    buildLoop26RuntimeFieldPathComparison,
    buildRiskAssessment,
    buildRuntimeSerializerSummary,
    buildTask114Comparison,
    classifyRuntimeVarType,
    decideGate,
    validateInputPath,
    validateOutputRoots
} from '../tools/capture-replay-010-loop-26-fieldpath-59-runtime-field-definition.mjs';

function runtimeField(fieldPathId, overrides = {}) {
    return {
        fieldPathId,
        fieldPath: overrides.fieldPath ?? [fieldPathId],
        resolvable: overrides.resolvable ?? true,
        serializerName: 'CCitadel_Ability_Familiar_HelpingHands',
        serializerVersion: 0,
        flattenedFieldName: overrides.flattenedFieldName ?? `m_field_${fieldPathId}`,
        originalSerializerFieldName: overrides.originalSerializerFieldName ?? overrides.flattenedFieldName ?? `m_field_${fieldPathId}`,
        fieldModel: overrides.fieldModel ?? 'SIMPLE',
        fieldPathKind: overrides.fieldPathKind ?? 'numeric_like_simple_field',
        definition: overrides.definition ?? {
            rawType: overrides.varType ?? 'int32',
            baseType: overrides.baseType ?? 'int32',
            generic: null,
            count: null,
            pointer: false
        },
        construction: {
            source: 'DEM_SEND_TABLES',
            ownerSerializerName: 'CCitadel_Ability_Familiar_HelpingHands',
            ownerSerializerVersion: 0,
            fieldIndex: fieldPathId,
            varName: overrides.flattenedFieldName ?? `m_field_${fieldPathId}`,
            varType: overrides.varType ?? 'int32',
            varEncoder: null,
            sendNode: ''
        },
        decoderResolution: {
            source: overrides.decoderResolutionSource ?? 'type_decoder',
            baseType: overrides.baseType ?? 'int32',
            descriptorType: overrides.decoderDescriptorType ?? 'UINT',
            descriptorOptions: null
        },
        decoderFunctionName: overrides.decoderFunctionName ?? 'decodeUVarInt32',
        storage: {
            type: overrides.storageType ?? 'INT',
            dimension: overrides.storageDimension ?? 1,
            signed: false,
            bool: false
        },
        parentChain: [],
        valuesIncluded: false,
        rawPayloadIncluded: false
    };
}

function runtimeCapture() {
    return {
        captureStatus: 'captured',
        serializerFound: true,
        serializerName: 'CCitadel_Ability_Familiar_HelpingHands',
        serializerVersion: 0,
        fieldCount: 128,
        fieldPaths: [
            runtimeField(0),
            runtimeField(1, { flattenedFieldName: 'm_flCooldownStart', baseType: 'float32', varType: 'float32', decoderFunctionName: 'decodeNoScale', storageType: 'FLOAT' }),
            runtimeField(24, { flattenedFieldName: 'm_flCooldownEnd', baseType: 'float32', varType: 'float32', decoderFunctionName: 'decodeNoScale', storageType: 'FLOAT' }),
            runtimeField(56, { flattenedFieldName: 'm_vecHelpers', fieldModel: 'ARRAY_VARIABLE', fieldPathKind: 'array_container_field_path' }),
            runtimeField(57, { flattenedFieldName: 'm_nearbySynthetic' }),
            runtimeField(58, { flattenedFieldName: 'm_tSoonestHelperCooldownEndTime', baseType: 'GameTime_t', varType: 'GameTime_t', decoderFunctionName: 'decodeNoScale', storageType: 'FLOAT' }),
            runtimeField(59, {
                flattenedFieldName: 'm_nAvailableHelperCount',
                originalSerializerFieldName: 'm_nAvailableHelperCount',
                varType: 'char[36]',
                baseType: 'char',
                fieldPathKind: 'string_like_simple_field',
                decoderFunctionName: 'decodeString',
                decoderDescriptorType: 'STRING',
                storageType: 'MISC',
                storageDimension: 0
            }),
            runtimeField(60, { flattenedFieldName: 'm_afterTarget' }),
            runtimeField(3373, { flattenedFieldName: 'm_vecHelpers.0000', fieldPath: [56, 0], fieldPathKind: 'array_indexed_field_path' })
        ]
    };
}

function task114Contract() {
    return {
        localContractAssessment: {
            exactRuntimeVarTypeKnownFromCommittedEvidence: false
        }
    };
}

function task114Comparison() {
    return {
        confirmedLargestSegment: {
            fieldPathId: 59,
            bitsConsumed: 288,
            decoderName: 'decodeString',
            storageType: 'MISC'
        }
    };
}

test('canary input and output roots are fixed to Task 115 scope', () => {
    assert.equal(validateInputPath('.local/deadem/replays/inbox/partida_010.dem', 'replay_010').relativePath, '.local/deadem/replays/inbox/partida_010.dem');
    assert.throws(() => validateInputPath('.local/deadem/replays/inbox/partida_005.dem', 'replay_005'), /unsupported|protected|unauthorized/);
    assert.throws(() => validateInputPath('.local/deadem/replays/inbox/partida_006.dem', 'replay_006'), /unsupported|bot fixture|unauthorized/);
    assert.throws(() => validateInputPath('.local/deadem/replays/inbox/partida_011.dem', 'replay_011'), /unsupported|outside|unauthorized/);
    assert.throws(() => validateInputPath('samples/partida_010.dem', 'replay_010'), /samples/);
    assert.throws(() => validateInputPath('output/replays/replay_010/partida_010.dem', 'replay_010'), /output\/replays/);

    const roots = validateOutputRoots(
        '.local/deadem/cache/local-replay-processing/replay_010/loop-26-fieldpath-59-runtime-field-definition/',
        'output/local-replay-processing/replay_010-loop-26-fieldpath-59-runtime-field-definition/'
    );
    assert.equal(roots.local.relativePath, '.local/deadem/cache/local-replay-processing/replay_010/loop-26-fieldpath-59-runtime-field-definition/');
    assert.equal(roots.summary.relativePath, 'output/local-replay-processing/replay_010-loop-26-fieldpath-59-runtime-field-definition/');
});

test('runtime varType classification separates string-like and numeric-like evidence', () => {
    assert.equal(classifyRuntimeVarType({ rawType: 'char[36]', baseType: 'char', generic: null, count: 36, pointer: false }), 'string_like');
    assert.equal(classifyRuntimeVarType({ rawType: 'int32', baseType: 'int32', generic: null, count: null, pointer: false }), 'numeric_like');
    assert.equal(classifyRuntimeVarType({ rawType: null, baseType: null }), 'unknown');
});

test('runtime serializer summary captures metadata without values or payloads', () => {
    const summary = buildRuntimeSerializerSummary(runtimeCapture());
    assert.equal(summary.serializerFound, true);
    assert.equal(summary.targetResolvable, true);
    assert.ok(summary.capturedFieldPathIds.includes(59));
    assert.equal(summary.valuesIncluded, false);
    assert.equal(summary.rawPayloadIncluded, false);
    assert.equal(summary.fullRawSendTablePayloadIncluded, false);
    assert.equal(summary.fieldPaths.find(item => item.fieldPathId === 59).varType, 'char[36]');
});

test('field path 59 definition answers the runtime varType question without causal overclaim', () => {
    const definition = buildFieldPath59RuntimeDefinition(buildRuntimeSerializerSummary(runtimeCapture()));
    assert.equal(definition.captured, true);
    assert.equal(definition.runtimeVarTypeKnown, true);
    assert.equal(definition.answer.originalRuntimeDefinition, 'char[36]');
    assert.equal(definition.runtimeVarTypeClassification, 'string_like');
    assert.equal(definition.answer.conclusion, 'string_like_runtime_type_makes_decodeString_MISC_more_locally_coherent');
    assert.equal(definition.answer.parserBugConcluded, false);
    assert.equal(definition.answer.source2SemanticsClaimed, false);
    assert.equal(definition.answer.causalConclusion, 'not_determined');
});

test('loop 26 runtime comparison includes target and nearby field paths', () => {
    const comparison = buildLoop26RuntimeFieldPathComparison(buildRuntimeSerializerSummary(runtimeCapture()));
    assert.deepEqual(comparison.comparedFieldPaths, [0, 1, 24, 56, 3373, 58, 59]);
    assert.equal(comparison.targetRuntimeVarTypeKnown, true);
    assert.equal(comparison.rows.find(row => row.fieldPathId === 59).decoderFunctionName, 'decodeString');
    assert.equal(comparison.rows.find(row => row.fieldPathId === 59).storageType, 'MISC');
    assert.deepEqual(comparison.nearbyFieldPaths.map(item => item.fieldPathId), [56, 57, 58, 59, 60]);
    assert.equal(comparison.valuesIncluded, false);
});

test('Task 114 comparison requires exact prior decoder and segment evidence', () => {
    const definition = buildFieldPath59RuntimeDefinition(buildRuntimeSerializerSummary(runtimeCapture()));
    const comparison = buildTask114Comparison(definition, task114Contract(), task114Comparison());
    assert.equal(comparison.exactTask114NumbersMatched, true);
    assert.equal(comparison.task114RuntimeVarTypeKnown, false);
    assert.equal(comparison.task115RuntimeVarTypeKnown, true);
    assert.equal(comparison.task115RuntimeVarType, 'char[36]');
    assert.equal(comparison.differences.length, 0);
});

test('gate captures only when failure reproduction, runtime definition, Task 114 match, and protections pass', () => {
    const definition = buildFieldPath59RuntimeDefinition(buildRuntimeSerializerSummary(runtimeCapture()));
    const comparison = buildTask114Comparison(definition, task114Contract(), task114Comparison());
    const gate = decideGate({
        defaultPass: { expectedFailureReproduced: true },
        diagnosticPass: { expectedFailureReproduced: true },
        runtimeDefinition: definition,
        task114Comparison: comparison,
        protectionAudit: { passed: true },
        branchAudit: { passed: true }
    });
    assert.equal(gate.gate, 'local_replay_loop_26_fieldpath_59_runtime_definition_captured');
    assert.equal(gate.recoveryAddedOrPromoted, false);
    assert.equal(gate.fieldValuesEmitted, false);

    const blocked = decideGate({
        defaultPass: { expectedFailureReproduced: true },
        diagnosticPass: { expectedFailureReproduced: true },
        runtimeDefinition: { ...definition, captured: false },
        task114Comparison: comparison,
        protectionAudit: { passed: true },
        branchAudit: { passed: true }
    });
    assert.equal(blocked.gate, 'local_replay_loop_26_fieldpath_59_runtime_definition_partial');
});

test('risk assessment keeps metadata suspiciousness diagnostic-only', () => {
    const definition = buildFieldPath59RuntimeDefinition(buildRuntimeSerializerSummary(runtimeCapture()));
    const comparison = buildTask114Comparison(definition, task114Contract(), task114Comparison());
    const risk = buildRiskAssessment(definition, comparison);
    assert.equal(risk.runtimeDefinitionCaptured, true);
    assert.equal(risk.runtimeVarTypeKnown, true);
    assert.equal(risk.parserFixRecommendedNow, false);
    assert.equal(risk.parserBugConcluded, false);
    assert.equal(risk.source2SemanticsClaimed, false);
    assert.equal(risk.causalConclusion, 'not_determined');
});

test('Task 121 does not exist', () => {
    assert.equal(existsSync('tasks/specs/121.json'), false);
    assert.equal(existsSync('tasks/blocked/121-select-next-canonical-generalization-control.md'), false);
    assert.equal(existsSync('tasks/completed/121-capture-loop-26-fieldpath-59-runtime-field-definition.md'), false);
});
