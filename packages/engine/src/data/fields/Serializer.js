import Assert from '#core/Assert.js';

import Field from './Field.js';
import FieldPathBuilder from './path/FieldPathBuilder.js';
import SerializerKey from './SerializerKey.js';

class Serializer {
    /**
     * @public
     * @constructor
     * @param {String} name
     * @param {number} version
     * @param {Array<Field>} fields
     */
    constructor(name, version, fields) {
        Assert.isTrue(typeof name === 'string');
        Assert.isTrue(Number.isInteger(version));
        Assert.isTrue(Array.isArray(fields) && fields.every(f => f instanceof Field));

        this._key = new SerializerKey(name, version);
        this._fields = fields;

        this._decoderCache = [];
        this._nameCache = [];
        this._storageCache = [];
    }

    /**
     * @public
     * @returns {SerializerKey}
     */
    get key() {
        return this._key;
    }

    /**
     * @public
     * @returns {Array<Field>}
     */
    get fields() {
        return this._fields;
    }

    /**
     * Resolves the decoder function for a given field path.
     *
     * @public
     * @param {FieldPath} fieldPath
     * @param {number=} fieldPathIndex
     * @returns {FieldDecoder}
     */
    getDecoderForFieldPath(fieldPath, fieldPathIndex = 0) {
        if (fieldPathIndex === 0) {
            const cached = this._decoderCache[fieldPath.id] ?? null;

            if (cached !== null) {
                return cached;
            }
        }

        const field = this._fields[fieldPath.get(fieldPathIndex)];
        const decoder = field.getDecoderForFieldPath(fieldPath, fieldPathIndex + 1);

        if (fieldPathIndex === 0) {
            this._decoderCache[fieldPath.id] = decoder;
        }

        return decoder;
    }

    /**
     * Resolves the decoder function for a cached field path id.
     *
     * @public
     * @param {number} fieldPathId
     * @returns {FieldDecoder}
     */
    getDecoderForFieldPathId(fieldPathId) {
        const cached = this._decoderCache[fieldPathId] ?? null;

        if (cached !== null) {
            return cached;
        }

        return this.getDecoderForFieldPath(FieldPathBuilder.getById(fieldPathId));
    }

    /**
     * @public
     * @param {FieldPath} fieldPath
     * @param {number} [fieldPathIndex=0]
     * @returns {string}
     */
    getNameForFieldPath(fieldPath, fieldPathIndex = 0) {
        if (fieldPathIndex === 0) {
            const cached = this._nameCache[fieldPath.id] ?? null;

            if (cached !== null) {
                return cached;
            }

            const name = this._fields[fieldPath.get(0)].getNameForFieldPath(fieldPath, 1);

            this._nameCache[fieldPath.id] = name;

            return name;
        }

        return this._fields[fieldPath.get(fieldPathIndex)].getNameForFieldPath(fieldPath, fieldPathIndex + 1);
    }

    /**
     * Resolves the flattened field name for a cached field path id.
     *
     * @public
     * @param {number} fieldPathId
     * @returns {string}
     */
    getNameForFieldPathId(fieldPathId) {
        const cached = this._nameCache[fieldPathId] ?? null;

        if (cached !== null) {
            return cached;
        }

        return this.getNameForFieldPath(FieldPathBuilder.getById(fieldPathId));
    }

    /**
     * Resolves the storage descriptor for a given field path.
     *
     * @public
     * @param {FieldPath} fieldPath
     * @param {number=} fieldPathIndex
     * @returns {FieldStorageDescriptor}
     */
    getStorageForFieldPath(fieldPath, fieldPathIndex = 0) {
        if (fieldPathIndex === 0) {
            const cached = this._storageCache[fieldPath.id] ?? null;

            if (cached !== null) {
                return cached;
            }
        }

        const field = this._fields[fieldPath.get(fieldPathIndex)];
        const storage = field.getStorageForFieldPath(fieldPath, fieldPathIndex + 1);

        if (fieldPathIndex === 0) {
            this._storageCache[fieldPath.id] = storage;
        }

        return storage;
    }

    /**
     * Resolves the storage descriptor for a cached field path id.
     *
     * @public
     * @param {number} fieldPathId
     * @returns {FieldStorageDescriptor}
     */
    getStorageForFieldPathId(fieldPathId) {
        const cached = this._storageCache[fieldPathId] ?? null;

        if (cached !== null) {
            return cached;
        }

        return this.getStorageForFieldPath(FieldPathBuilder.getById(fieldPathId));
    }

    /**
     * Describes runtime field-definition metadata for a cached field path id
     * without decoding or exposing field values.
     *
     * @public
     * @param {number} fieldPathId
     * @returns {object}
     */
    describeFieldPathId(fieldPathId) {
        const fieldPath = FieldPathBuilder.getById(fieldPathId);

        if (fieldPath === undefined) {
            return {
                fieldPathId,
                resolvable: false,
                serializerName: this._key.name,
                serializerVersion: this._key.version,
                limitation: 'field path id was not present in the local FieldPathBuilder cache'
            };
        }

        return this.describeFieldPath(fieldPath);
    }

    /**
     * Describes runtime field-definition metadata for a field path without
     * decoding or exposing field values.
     *
     * @public
     * @param {FieldPath} fieldPath
     * @returns {object}
     */
    describeFieldPath(fieldPath) {
        const path = fieldPath.path.slice();
        const resolved = resolveFieldPathMetadata(this, path);
        const decoder = safeCall(() => this.getDecoderForFieldPath(fieldPath), null);
        const storage = safeCall(() => this.getStorageForFieldPath(fieldPath), null);
        const flattenedFieldName = safeCall(() => this.getNameForFieldPath(fieldPath), null);
        const transferCode = fieldPath.transferCode;
        const targetMetadata = resolved.target?.runtimeDefinitionMetadata ?? null;

        return {
            fieldPathId: fieldPath.id,
            fieldPath: path,
            fieldPathTransferCode: typeof transferCode === 'bigint' ? transferCode.toString() : transferCode,
            resolvable: resolved.target !== null,
            serializerName: this._key.name,
            serializerVersion: this._key.version,
            flattenedFieldName,
            originalSerializerFieldName: resolved.target?.name ?? null,
            fieldModel: resolved.target?.model?.code ?? null,
            fieldPathKind: classifyFieldPath(path, resolved.target, targetMetadata, decoder?.name ?? null),
            definition: targetMetadata?.definition ?? null,
            construction: targetMetadata?.construction ?? null,
            decoderResolution: selectDecoderResolution(targetMetadata, path, resolved.target?.model?.code ?? null),
            decoderFunctionName: decoder?.name ?? null,
            storage: describeStorage(storage),
            parentChain: resolved.chain,
            valuesIncluded: false,
            rawPayloadIncluded: false
        };
    }

    /**
     * Pushes a {@link Field}.
     *
     * @public
     * @param {Field} field
     */
    push(field) {
        this._fields.push(field);
    }
}

function resolveFieldPathMetadata(serializer, path, index = 0, chain = []) {
    const field = serializer._fields[path[index]] ?? null;

    if (field === null) {
        return { target: null, chain };
    }

    const metadata = field.runtimeDefinitionMetadata ?? null;
    const nextChain = [
        ...chain,
        {
            serializerName: serializer.key.name,
            serializerVersion: serializer.key.version,
            fieldIndex: path[index],
            fieldName: field.name,
            fieldModel: field.model?.code ?? null,
            varType: metadata?.definition?.rawType ?? null
        }
    ];

    if (path.length > index + 1 && field.serializer instanceof Serializer) {
        return resolveFieldPathMetadata(field.serializer, path, index + 1, nextChain);
    }

    return { target: field, chain: nextChain };
}

function classifyFieldPath(path, field, metadata, decoderFunctionName) {
    const model = field?.model?.code ?? null;
    const definition = metadata?.definition ?? null;
    const baseType = definition?.baseType ?? null;

    if (model === 'ARRAY_FIXED' || model === 'ARRAY_VARIABLE') {
        return path.length > 1 ? 'array_indexed_field_path' : 'array_container_field_path';
    }

    if (model === 'TABLE_FIXED' || model === 'TABLE_VARIABLE') {
        return path.length > 1 ? 'table_subfield_path' : 'table_container_field_path';
    }

    if (decoderFunctionName === 'decodeString' || [ 'char', 'CUtlString', 'CUtlSymbolLarge' ].includes(baseType)) {
        return 'string_like_simple_field';
    }

    if ([ 'Vector2D', 'Vector', 'VectorWS', 'Vector4D', 'QAngle' ].includes(baseType)) {
        return 'vector_like_simple_field';
    }

    if (/^(u?int|float|GameTime_t|CNetworkedQuantizedFloat)/.test(baseType ?? '')) {
        return 'numeric_like_simple_field';
    }

    return model === null ? 'unresolved' : 'simple_field';
}

function selectDecoderResolution(metadata, path, model) {
    const resolution = metadata?.decoderResolution ?? null;

    if (resolution === null) {
        return null;
    }

    if (model === 'ARRAY_FIXED' || model === 'ARRAY_VARIABLE') {
        return path.length > 1 ? resolution.child ?? resolution : resolution.base ?? resolution;
    }

    return resolution;
}

function describeStorage(storage) {
    if (storage === null) {
        return null;
    }

    return {
        type: storage.type.code,
        dimension: storage.dim,
        signed: storage.signed,
        bool: storage.bool
    };
}

function safeCall(fn, fallback) {
    try {
        return fn();
    } catch {
        return fallback;
    }
}

export default Serializer;
