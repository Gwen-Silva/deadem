import Assert from '#core/Assert.js';

import FieldModel from '#data/enums/FieldModel.js';

import FieldDefinition from './FieldDefinition.js';

import FieldDecoder from './decoding/FieldDecoder.js';
import FieldDecoderCatalog from './decoding/FieldDecoderCatalog.js';
import FieldDecoderFactory from './decoding/FieldDecoderFactory.js';
import FieldDecoderInstructionsFactory from './decoding/FieldDecoderInstructionsFactory.js';
import FieldStorageDescriptor from './decoding/FieldStorageDescriptor.js';

import FieldRuleRegistry from './FieldRuleRegistry.js';

import FieldArrayFixed from './models/FieldArrayFixed.js';
import FieldArrayVariable from './models/FieldArrayVariable.js';
import FieldSimple from './models/FieldSimple.js';
import FieldTableFixed from './models/FieldTableFixed.js';
import FieldTableVariable from './models/FieldTableVariable.js';

class FieldFactory {
    /**
     * @constructor
     * @param {FieldRuleRegistry} fieldRuleRegistry
     * @param {boolean} captureRuntimeFieldDefinitions
     */
    constructor(fieldRuleRegistry, captureRuntimeFieldDefinitions = false) {
        Assert.isTrue(fieldRuleRegistry instanceof FieldRuleRegistry);
        Assert.isTrue(typeof captureRuntimeFieldDefinitions === 'boolean');

        this._fieldRuleRegistry = fieldRuleRegistry;
        this._captureRuntimeFieldDefinitions = captureRuntimeFieldDefinitions;

        this._decoderCatalog = new FieldDecoderCatalog();
        this._instructionsFactory = new FieldDecoderInstructionsFactory();
    }

    /**
     * @public
     * @param {String} name
     * @param {FieldDefinition} definition
     * @param {Array<String>} sendNode
     * @param {{encoder: String|null, encoderFlags: number|null, bitCount: number|null, valueLow: number|null, valueHigh: number|null}} instructionsRaw
     * @param {Serializer|null} serializer
     * @returns {Field}
     */
    create(name, definition, sendNode, instructionsRaw, serializer) {
        Assert.isTrue(definition instanceof FieldDefinition);
        Assert.isTrue(instructionsRaw !== null && typeof instructionsRaw === 'object' && !Array.isArray(instructionsRaw));

        const encoderOverride = this._fieldRuleRegistry.getFieldEncoderOverride(name);
        const encoder = encoderOverride !== null ? encoderOverride : instructionsRaw.encoder;

        const decoderInstructions = this._instructionsFactory.build(
            encoder,
            instructionsRaw.encoderFlags,
            instructionsRaw.bitCount,
            instructionsRaw.valueLow,
            instructionsRaw.valueHigh
        );

        const model = this._classify(definition, serializer);
        let field;
        let decoderResolution;

        switch (model) {
            case FieldModel.SIMPLE: {
                decoderResolution = this._resolveDecoderWithMetadata(name, definition, decoderInstructions);
                field = new FieldSimple(name, sendNode, decoderResolution.decoder);
                break;
            }
            case FieldModel.ARRAY_FIXED: {
                decoderResolution = this._resolveDecoderWithMetadata(name, definition, decoderInstructions);
                field = new FieldArrayFixed(name, sendNode, decoderResolution.decoder);
                break;
            }
            case FieldModel.ARRAY_VARIABLE: {
                Assert.isTrue(definition.generic !== null, 'ARRAY_VARIABLE field requires a generic definition');

                decoderResolution = {
                    base: describeStaticDecoder(VAR_UINT_32_DECODER, 'array_variable_base_default', definition.baseType),
                    child: this._resolveDecoderWithMetadata(name, definition.generic, decoderInstructions)
                };
                field = new FieldArrayVariable(name, sendNode, VAR_UINT_32_DECODER, decoderResolution.child.decoder);
                break;
            }
            case FieldModel.TABLE_FIXED: {
                const override = this._resolveDecoderOverrideWithMetadata(name, decoderInstructions);
                decoderResolution = override ?? describeStaticDecoder(BOOLEAN_DECODER, 'table_fixed_base_default', definition.baseType);
                field = new FieldTableFixed(name, sendNode, serializer, decoderResolution.decoder);
                break;
            }
            case FieldModel.TABLE_VARIABLE: {
                const override = this._resolveDecoderOverrideWithMetadata(name, decoderInstructions);
                decoderResolution = override ?? describeStaticDecoder(VAR_UINT_32_DECODER, 'table_variable_base_default', definition.baseType);
                field = new FieldTableVariable(name, sendNode, serializer, decoderResolution.decoder);
                break;
            }
            default:
                throw new Error(`Unhandled field model [ ${model.code} ]`);
        }

        if (this._captureRuntimeFieldDefinitions) {
            field.runtimeDefinitionMetadata = buildRuntimeDefinitionMetadata(
                name,
                definition,
                sendNode,
                instructionsRaw,
                model,
                encoderOverride !== null,
                decoderResolution,
                serializer
            );
        }

        return field;
    }

    /**
     * @protected
     * @param {FieldDefinition} definition
     * @param {Serializer|null} serializer
     * @returns {FieldModel}
     */
    _classify(definition, serializer) {
        if (serializer !== null) {
            if (definition.pointer || this._fieldRuleRegistry.getIsFixedTableType(definition.baseType)) {
                return FieldModel.TABLE_FIXED;
            }

            return FieldModel.TABLE_VARIABLE;
        }

        if (definition.count > 0 && definition.baseType !== 'char') {
            return FieldModel.ARRAY_FIXED;
        }

        if (this._fieldRuleRegistry.getIsVariableArrayType(definition.baseType)) {
            return FieldModel.ARRAY_VARIABLE;
        }

        return FieldModel.SIMPLE;
    }

    /**
     * @protected
     * @param {String} name
     * @param {FieldDefinition} definition
     * @param {FieldDecoderInstructions} decoderInstructions
     * @returns {FieldDecoder}
     */
    _resolveDecoder(name, definition, decoderInstructions) {
        return this._resolveDecoderWithMetadata(name, definition, decoderInstructions).decoder;
    }

    /**
     * @protected
     * @param {String} name
     * @param {FieldDefinition} definition
     * @param {FieldDecoderInstructions} decoderInstructions
     * @returns {{decoder: FieldDecoder, source: string, baseType: string, descriptorType: string|null, descriptorOptions: object|null}}
     */
    _resolveDecoderWithMetadata(name, definition, decoderInstructions) {
        Assert.isTrue(definition instanceof FieldDefinition);

        const baseType = definition.baseType;

        if (baseType === 'char' && definition.count === null) {
            return describeStaticDecoder(VAR_UINT_32_DECODER, 'char_without_count_var_uint_32', baseType);
        }

        const override = this._resolveDecoderOverrideWithMetadata(name, decoderInstructions);

        if (override !== null) {
            return override;
        }

        const descriptor = this._fieldRuleRegistry.getFieldTypeDecoder(baseType);

        if (descriptor === null) {
            return describeStaticDecoder(VAR_UINT_32_DECODER, 'fallback_var_uint_32', baseType);
        }

        return {
            decoder: this._decoderCatalog.resolve(descriptor, decoderInstructions),
            source: 'type_decoder',
            baseType,
            descriptorType: descriptor.type.code,
            descriptorOptions: descriptor.options
        };
    }

    /**
     * @protected
     * @param {String} name
     * @param {FieldDecoderInstructions} decoderInstructions
     * @returns {FieldDecoder|null}
     */
    _resolveDecoderOverride(name, decoderInstructions) {
        return this._resolveDecoderOverrideWithMetadata(name, decoderInstructions)?.decoder ?? null;
    }

    /**
     * @protected
     * @param {String} name
     * @param {FieldDecoderInstructions} decoderInstructions
     * @returns {{decoder: FieldDecoder, source: string, baseType: string|null, descriptorType: string, descriptorOptions: object}|null}
     */
    _resolveDecoderOverrideWithMetadata(name, decoderInstructions) {
        const override = this._fieldRuleRegistry.getFieldDecoderOverride(name);

        if (override === null) {
            return null;
        }

        return {
            decoder: this._decoderCatalog.resolve(override, decoderInstructions),
            source: 'name_override',
            baseType: null,
            descriptorType: override.type.code,
            descriptorOptions: override.options
        };
    }
}

function buildRuntimeDefinitionMetadata(name, definition, sendNode, instructionsRaw, model, encoderOverrideApplied, decoderResolution, serializer) {
    return {
        name,
        sendNode: sendNode.slice(),
        definition: definition.describe(),
        model: model.code,
        instructions: {
            encoder: instructionsRaw.encoder,
            encoderFlags: instructionsRaw.encoderFlags,
            bitCount: instructionsRaw.bitCount,
            valueLow: instructionsRaw.valueLow,
            valueHigh: instructionsRaw.valueHigh
        },
        encoderOverrideApplied,
        decoderResolution: serializeDecoderResolution(decoderResolution),
        nestedSerializer: serializer === null ? null : {
            name: serializer.key.name,
            version: serializer.key.version
        }
    };
}

function describeStaticDecoder(decoder, source, baseType) {
    return {
        decoder,
        source,
        baseType,
        descriptorType: null,
        descriptorOptions: null
    };
}

function serializeDecoderResolution(value) {
    if (value?.decoder instanceof FieldDecoder) {
        return serializeSingleDecoderResolution(value);
    }

    return Object.fromEntries(
        Object.entries(value).map(([ key, resolution ]) => [ key, serializeSingleDecoderResolution(resolution) ])
    );
}

function serializeSingleDecoderResolution(resolution) {
    const storage = resolution.decoder.storage;
    return {
        source: resolution.source,
        baseType: resolution.baseType,
        descriptorType: resolution.descriptorType,
        descriptorOptions: resolution.descriptorOptions,
        decoderFunctionName: resolution.decoder.fn.name || null,
        storage: {
            type: storage.type.code,
            dimension: storage.dim,
            signed: storage.signed,
            bool: storage.bool
        }
    };
}

const VAR_UINT_32_DECODER = new FieldDecoder(FieldDecoderFactory.VAR_UINT_32, FieldStorageDescriptor.INT_UNSIGNED);
const BOOLEAN_DECODER = new FieldDecoder(FieldDecoderFactory.BOOLEAN, FieldStorageDescriptor.INT_BOOL);

export default FieldFactory;
