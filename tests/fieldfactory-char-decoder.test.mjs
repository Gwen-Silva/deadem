import assert from 'node:assert/strict';
import { test } from 'node:test';
import FieldDecoderDescriptor from '../packages/engine/src/data/fields/decoding/FieldDecoderDescriptor.js';
import FieldDefinition from '../packages/engine/src/data/fields/FieldDefinition.js';
import FieldFactory from '../packages/engine/src/data/fields/FieldFactory.js';
import FieldRuleRegistry from '../packages/engine/src/data/fields/FieldRuleRegistry.js';

const INSTRUCTIONS_RAW = {
    encoder: null,
    encoderFlags: null,
    bitCount: null,
    valueLow: null,
    valueHigh: null
};

function createFactory() {
    const registry = new FieldRuleRegistry();
    registry.registerFieldTypeDecoder('char', FieldDecoderDescriptor.STRING);
    registry.registerVariableArrayType('CNetworkUtlVectorBase');

    return new FieldFactory(registry, true);
}

function createField(varType, name = 'm_charField') {
    return createFactory().create(name, FieldDefinition.parse(varType), [ name ], INSTRUCTIONS_RAW, null);
}

test('FieldFactory resolves scalar char without count as VAR_UINT_32 instead of string', () => {
    const field = createField('char');
    const resolution = field.runtimeDefinitionMetadata.decoderResolution;
    const calls = [];
    const result = field.getDecoderForFieldPath()({
        readString() {
            calls.push('readString');
            return 'unexpected';
        },
        readUVarInt32() {
            calls.push('readUVarInt32');
            return 65;
        }
    });

    assert.equal(result, 65);
    assert.deepEqual(calls, [ 'readUVarInt32' ]);
    assert.equal(resolution.source, 'char_without_count_var_uint_32');
    assert.equal(resolution.baseType, 'char');
    assert.equal(resolution.descriptorType, null);
    assert.equal(resolution.decoderFunctionName, 'decodeUVarInt32');
    assert.equal(resolution.storage.type, 'INT');
    assert.equal(resolution.storage.signed, false);
});

test('FieldFactory keeps counted char on the registered char string decoder', () => {
    const field = createField('char[36]');
    const resolution = field.runtimeDefinitionMetadata.decoderResolution;
    const calls = [];
    const result = field.getDecoderForFieldPath()({
        readString() {
            calls.push('readString');
            return 'counted-char';
        },
        readUVarInt32() {
            calls.push('readUVarInt32');
            return 65;
        }
    });

    assert.equal(result, 'counted-char');
    assert.deepEqual(calls, [ 'readString' ]);
    assert.equal(resolution.source, 'type_decoder');
    assert.equal(resolution.baseType, 'char');
    assert.equal(resolution.descriptorType, 'STRING');
    assert.equal(resolution.decoderFunctionName, 'decodeString');
});

test('FieldFactory applies scalar char fix to variable array generic child decoder', () => {
    const field = createField('CNetworkUtlVectorBase< char >', 'm_charVector');
    const resolution = field.runtimeDefinitionMetadata.decoderResolution;

    assert.equal(resolution.base.source, 'array_variable_base_default');
    assert.equal(resolution.base.decoderFunctionName, 'decodeUVarInt32');
    assert.equal(resolution.child.source, 'char_without_count_var_uint_32');
    assert.equal(resolution.child.baseType, 'char');
    assert.equal(resolution.child.decoderFunctionName, 'decodeUVarInt32');
    assert.equal(resolution.child.storage.type, 'INT');
    assert.equal(resolution.child.storage.signed, false);
});

test('FieldFactory gives scalar char special-case upstream precedence over name override', () => {
    const registry = new FieldRuleRegistry();
    registry.registerFieldTypeDecoder('char', FieldDecoderDescriptor.STRING);
    registry.registerFieldDecoderOverride('m_overriddenChar', FieldDecoderDescriptor.STRING);
    const factory = new FieldFactory(registry, true);

    const field = factory.create('m_overriddenChar', FieldDefinition.parse('char'), [ 'm_overriddenChar' ], INSTRUCTIONS_RAW, null);
    const resolution = field.runtimeDefinitionMetadata.decoderResolution;

    assert.equal(resolution.source, 'char_without_count_var_uint_32');
    assert.equal(resolution.decoderFunctionName, 'decodeUVarInt32');
    assert.notEqual(resolution.source, 'name_override');
});
