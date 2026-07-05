import EntityMutationBatch from '#data/entity/EntityMutationBatch.js';

import FieldPathExtractor from './FieldPathExtractor.js';

class EntityMutationExtractor {
    /**
     * @public
     * @constructor
     * @param {BitBuffer} bitBuffer
     * @param {Serializer|null} [serializer=null]
     * @param {{ record?: function(object): void }|null} [diagnostics=null]
     */
    constructor(bitBuffer, serializer = null, diagnostics = null) {
        this._bitBuffer = bitBuffer;
        this._serializer = serializer;
        this._diagnostics = diagnostics;

        this._fieldPathExtractor = new FieldPathExtractor(bitBuffer);
    }

    /**
     * @public
     * @param {Serializer} serializer 
     */
    set serializer(serializer) {
        this._serializer = serializer;
    }

    /**
     * @public
     * @param {{ record?: function(object): void }|null} diagnostics
     */
    set diagnostics(diagnostics) {
        this._diagnostics = diagnostics;
    }

    /**
     * Extracts all entity mutations from the buffer as a {@link EntityMutationBatch}.
     *
     * @public
     * @returns {EntityMutationBatch}
     */
    all() {
        const diagnostic = this._startDiagnostic('all');
        let fieldPathIds;

        try {
            fieldPathIds = this._fieldPathExtractor.allIds();
            this._recordFieldPathDiagnostic(diagnostic, fieldPathIds);

            const ids = new Uint32Array(fieldPathIds.length);
            const values = new Array(fieldPathIds.length);

            for (let i = 0; i < fieldPathIds.length; i++) {
                const id = fieldPathIds[i];
                const decoder = this._serializer.getDecoderForFieldPathId(id);

                ids[i] = id;
                values[i] = this._decodeWithDiagnostic(
                    diagnostic,
                    i,
                    this._buildFieldSegmentMetadata(id, null, decoder),
                    () => decoder(this._bitBuffer)
                );
            }

            return new EntityMutationBatch(ids, values);
        } catch (error) {
            this._recordDiagnosticError(diagnostic, error);
            throw error;
        } finally {
            this._finishDiagnostic(diagnostic);
        }
    }

    /**
     * Extracts mutations in a packed (transferable) format suitable for
     * transmission between threads.
     *
     * @public
     * @returns {Array<bigint|*>}
     */
    allPacked() {
        const diagnostic = this._startDiagnostic('allPacked');
        let fieldPaths;

        try {
            fieldPaths = this._fieldPathExtractor.all();
            this._recordFieldPathDiagnostic(diagnostic, fieldPaths);

            const mutations = [ ];

            for (let i = 0; i < fieldPaths.length; i++) {
                const fieldPath = fieldPaths[i];

                const decoder = this._serializer.getDecoderForFieldPath(fieldPath);
                const value = this._decodeWithDiagnostic(
                    diagnostic,
                    i,
                    this._buildFieldSegmentMetadata(fieldPath.id, fieldPath, decoder),
                    () => decoder(this._bitBuffer)
                );

                mutations.push(fieldPath.transferCode, value);
            }

            return mutations;
        } catch (error) {
            this._recordDiagnosticError(diagnostic, error);
            throw error;
        } finally {
            this._finishDiagnostic(diagnostic);
        }
    }

    /**
     * Decodes all entity mutations and applies them directly to the entity.
     *
     * @public
     * @param {Entity} entity
     */
    applyTo(entity) {
        const diagnostic = this._startDiagnostic('applyTo');
        let ids;

        try {
            ids = this._fieldPathExtractor.allIds();
            this._recordFieldPathDiagnostic(diagnostic, ids);

            for (let i = 0; i < ids.length; i++) {
                const id = ids[i];
                const decoder = this._serializer.getDecoderForFieldPathId(id);
                const value = this._decodeWithDiagnostic(
                    diagnostic,
                    i,
                    this._buildFieldSegmentMetadata(id, null, decoder),
                    () => decoder(this._bitBuffer)
                );

                entity.updateByFieldPathId(id, value);
            }
        } catch (error) {
            this._recordDiagnosticError(diagnostic, error);
            throw error;
        } finally {
            this._finishDiagnostic(diagnostic);
        }
    }
 
    /**
     * Advances the buffer past one entity's worth of mutations without
     * producing any output. Decoders still run so the bit-stream stays
     * correctly aligned for subsequent entities.
     *
     * @public
     */
    skip() {
        const diagnostic = this._startDiagnostic('skip');
        let ids;

        try {
            ids = this._fieldPathExtractor.allIds();
            this._recordFieldPathDiagnostic(diagnostic, ids);

            for (let i = 0; i < ids.length; i++) {
                const id = ids[i];
                const decoder = this._serializer.getDecoderForFieldPathId(id);

                this._decodeWithDiagnostic(
                    diagnostic,
                    i,
                    this._buildFieldSegmentMetadata(id, null, decoder),
                    () => decoder(this._bitBuffer)
                );
            }
        } catch (error) {
            this._recordDiagnosticError(diagnostic, error);
            throw error;
        } finally {
            this._finishDiagnostic(diagnostic);
        }
    }

    /**
     * @private
     * @param {string} method
     * @returns {object|null}
     */
    _startDiagnostic(method) {
        if (typeof this._diagnostics?.record !== 'function') {
            return null;
        }

        return {
            method,
            beforeExtractorReadCount: this._bitBuffer.getReadCount(),
            afterFieldPathReadCount: null,
            afterExtractorReadCount: null,
            mutationCount: null,
            fieldPathBitsConsumed: null,
            fieldReadSegmentCount: 0,
            fieldReaderBitsConsumed: 0,
            zeroBitFieldReadSegments: 0,
            minFieldReaderBitsConsumed: null,
            maxFieldReaderBitsConsumed: null,
            fieldReadSegments: [],
            threw: false,
            errorMessage: null
        };
    }

    /**
     * @private
     * @param {object|null} diagnostic
     * @param {Array|Uint32Array} paths
     */
    _recordFieldPathDiagnostic(diagnostic, paths) {
        if (diagnostic === null) {
            return;
        }

        diagnostic.afterFieldPathReadCount = this._bitBuffer.getReadCount();
        diagnostic.mutationCount = paths.length;
        diagnostic.fieldPathBitsConsumed = diagnostic.afterFieldPathReadCount - diagnostic.beforeExtractorReadCount;
    }

    /**
     * @private
     * @param {object|null} diagnostic
     * @param {number} ordinal
     * @param {object|null} metadata
     * @param {function(): *} decode
     * @returns {*}
     */
    _decodeWithDiagnostic(diagnostic, ordinal, metadata, decode) {
        if (diagnostic === null) {
            return decode();
        }

        const beforeReadCount = this._bitBuffer.getReadCount();
        const value = decode();
        const afterReadCount = this._bitBuffer.getReadCount();
        const bitsConsumed = afterReadCount - beforeReadCount;

        diagnostic.fieldReadSegmentCount++;
        diagnostic.fieldReaderBitsConsumed += bitsConsumed;
        diagnostic.minFieldReaderBitsConsumed = diagnostic.minFieldReaderBitsConsumed === null ?
            bitsConsumed :
            Math.min(diagnostic.minFieldReaderBitsConsumed, bitsConsumed);
        diagnostic.maxFieldReaderBitsConsumed = diagnostic.maxFieldReaderBitsConsumed === null ?
            bitsConsumed :
            Math.max(diagnostic.maxFieldReaderBitsConsumed, bitsConsumed);
        if (bitsConsumed === 0) {
            diagnostic.zeroBitFieldReadSegments++;
        }
        if (this._diagnostics.recordSegments === true) {
            diagnostic.fieldReadSegments.push({
                ordinal,
                beforeReadCount,
                afterReadCount,
                bitsConsumed,
                ...(metadata ?? {})
            });
        }

        return value;
    }

    /**
     * @private
     * @param {number|null} fieldPathId
     * @param {FieldPath|null} fieldPath
     * @param {function(BitBuffer): *} decoder
     * @returns {object|null}
     */
    _buildFieldSegmentMetadata(fieldPathId, fieldPath, decoder) {
        if (this._diagnostics?.recordSegments !== true) {
            return null;
        }

        const safeFieldPathId = Number.isInteger(fieldPathId) ? fieldPathId : null;
        let fieldPathName = null;
        let storage = null;

        if (safeFieldPathId !== null) {
            try {
                fieldPathName = this._serializer.getNameForFieldPathId(safeFieldPathId);
            } catch {
                fieldPathName = null;
            }

            try {
                storage = this._serializer.getStorageForFieldPathId(safeFieldPathId);
            } catch {
                storage = null;
            }
        } else if (fieldPath !== null) {
            try {
                fieldPathName = this._serializer.getNameForFieldPath(fieldPath);
            } catch {
                fieldPathName = null;
            }

            try {
                storage = this._serializer.getStorageForFieldPath(fieldPath);
            } catch {
                storage = null;
            }
        }

        const transferCode = fieldPath?.transferCode;

        return {
            fieldPathId: safeFieldPathId,
            fieldPathTransferCode: typeof transferCode === 'bigint' ? transferCode.toString() : transferCode ?? null,
            fieldPathName,
            decoderName: typeof decoder?.name === 'string' && decoder.name.length > 0 ? decoder.name : null,
            decoderType: typeof decoder,
            serializerName: this._serializer?.key?.name ?? null,
            serializerVersion: this._serializer?.key?.version ?? null,
            storageType: storage?.type?.code ?? null,
            storageDimension: Number.isInteger(storage?.dim) ? storage.dim : null,
            storageSigned: typeof storage?.signed === 'boolean' ? storage.signed : null,
            storageBool: typeof storage?.bool === 'boolean' ? storage.bool : null
        };
    }

    /**
     * @private
     * @param {object|null} diagnostic
     * @param {Error} error
     */
    _recordDiagnosticError(diagnostic, error) {
        if (diagnostic !== null) {
            diagnostic.threw = true;
            diagnostic.errorMessage = error?.message ?? String(error);
        }
    }

    /**
     * @private
     * @param {object|null} diagnostic
     */
    _finishDiagnostic(diagnostic) {
        if (diagnostic === null) {
            return;
        }

        diagnostic.afterExtractorReadCount = this._bitBuffer.getReadCount();
        diagnostic.totalExtractorBitsConsumed = diagnostic.afterExtractorReadCount - diagnostic.beforeExtractorReadCount;
        diagnostic.extractorConsumedZeroBits = diagnostic.totalExtractorBitsConsumed === 0;
        diagnostic.fieldReaderMatchesExtractor = diagnostic.fieldPathBitsConsumed !== null &&
            diagnostic.fieldPathBitsConsumed + diagnostic.fieldReaderBitsConsumed === diagnostic.totalExtractorBitsConsumed;

        this._diagnostics.record(diagnostic);
    }
}

export default EntityMutationExtractor;
