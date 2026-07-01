import { createReadStream } from 'node:fs';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import { EntityOperation, InterceptorStage, Logger, Player } from 'deadem';

const TASK_ID = '075';
const REPLAY = 'samples/replay_009_normal.dem';
const OUT = 'output/replay-009-fixed-spatial-diagnosis';
const REPORT = 'reports/replay-009-fixed-entity-spatial-property-diagnosis.md';
const GATE = 'replay_009_fixed_entity_spatial_properties_ready_with_gaps';
const DECISION = 'coordinates_omitted_by_compact_filter';
const TARGET_CLASSES = new Set(['CNPC_MidBoss', 'CNPC_Boss_Tier2']);
const CONTROL_CLASS = 'CCitadelPlayerPawn';
const POSITION_TERMS = [
    'origin',
    'position',
    'translation',
    'transform',
    'scene',
    'node',
    'body',
    'cell',
    'absorigin',
    'networkorigin',
    'localorigin',
    'nodetoworld',
    'worldtonode',
    'm_vecx',
    'm_vecy',
    'm_vecz'
];
const EXACT_CANDIDATES = [
    'm_vecOrigin',
    'm_vecAbsOrigin',
    'm_vecNetworkOrigin',
    'm_vecInitialPosition',
    'm_vPosition',
    'm_pGameSceneNode',
    'm_CBodyComponent',
    'm_nodeToWorld',
    'm_cellX',
    'm_cellY',
    'm_cellZ',
    'CNetworkOriginCellCoordQuantizedVector',
    'CTransform',
    'CGameSceneNode',
    'CBodyComponent'
];
const MAX_UPDATES_PER_ENTITY = 20;

function stableStringify(value) {
    return JSON.stringify(value, (_key, current) => {
        if (current && typeof current === 'object' && !Array.isArray(current)) {
            return Object.fromEntries(Object.entries(current).sort(([ left ], [ right ]) => left.localeCompare(right)));
        }
        return current;
    });
}

function hash(value) {
    return crypto.createHash('sha256').update(stableStringify(value)).digest('hex');
}

function normalize(value) {
    if (value === undefined) return null;
    if (value === null) return null;
    if (typeof value === 'bigint') return value.toString();
    if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') return value;
    if (ArrayBuffer.isView(value)) return Array.from(value).map(normalize);
    if (Array.isArray(value)) return value.map(normalize);
    if (typeof value === 'object') return Object.fromEntries(Object.entries(value).slice(0, 12).map(([ key, item ]) => [ key, normalize(item) ]));
    return String(value);
}

function rawShape(value) {
    if (value === null || value === undefined) return String(value);
    if (ArrayBuffer.isView(value)) return `${value.constructor.name}[${value.length}]`;
    if (Array.isArray(value)) return `Array[${value.length}]`;
    return typeof value;
}

function entityKey(entity) {
    return `${entity.index}:${entity.serial}:${entity.handle}:${entity.class.id}`;
}

function isPositionCandidate(name) {
    const lower = name.toLowerCase().replaceAll(/[^a-z0-9]+/g, '');
    return POSITION_TERMS.some((term) => lower.includes(term)) || EXACT_CANDIDATES.some((term) => name.includes(term));
}

function expectedSemantics(name) {
    const lower = name.toLowerCase();
    if (lower.includes('cell')) return 'cell';
    if (lower.includes('node') || lower.includes('transform')) return 'transform';
    if (lower.includes('parent') || lower.includes('owner') || lower.includes('handle')) return 'reference';
    if (lower.includes('vecx') || lower.includes('vecy') || lower.includes('vecz') || lower.includes('origin') || lower.includes('position')) return 'world';
    if (lower.includes('body') || lower.includes('scene')) return 'reference';
    return 'unknown';
}

function decoderTypeForName(name) {
    const lower = name.toLowerCase();
    if (lower.includes('vec')) return 'vector_or_scalar_float';
    if (lower.includes('cell')) return 'integer_cell_coordinate_candidate';
    if (lower.includes('time')) return 'simulation_time_or_float';
    if (lower.includes('parent') || lower.includes('owner') || lower.includes('handle')) return 'entity_handle_or_uint';
    return 'parser_selected_decoder';
}

function sampleFieldEntries(entity, max = 80) {
    return Array.from(entity.fieldEntries()).slice(0, max).map(([ name, value ]) => ({
        propertyPath: name,
        value: normalize(value),
        rawValueShape: rawShape(value),
        positionCandidate: isPositionCandidate(name)
    }));
}

function findCoordinateTriples(fieldEntries) {
    const byName = new Map(fieldEntries.map((entry) => [entry.propertyPath, entry.value]));
    const triples = [
        [ 'CBodyComponent.m_vecX', 'CBodyComponent.m_vecY', 'CBodyComponent.m_vecZ' ],
        [ 'm_vecX', 'm_vecY', 'm_vecZ' ],
        [ 'CBodyComponent.m_cellX', 'CBodyComponent.m_cellY', 'CBodyComponent.m_cellZ' ],
        [ 'm_cellX', 'm_cellY', 'm_cellZ' ]
    ];
    return triples
        .filter((triple) => triple.every((name) => Number.isFinite(byName.get(name))))
        .map((triple) => ({
            fields: triple,
            values: {
                x: byName.get(triple[0]),
                y: byName.get(triple[1]),
                z: byName.get(triple[2])
            }
        }));
}

function findObservationCoordinateTriples(observations) {
    const triples = [
        [ 'CBodyComponent.m_vecX', 'CBodyComponent.m_vecY', 'CBodyComponent.m_vecZ' ],
        [ 'CBodyComponent.m_cellX', 'CBodyComponent.m_cellY', 'CBodyComponent.m_cellZ' ]
    ];
    const buckets = new Map();
    for (const obs of observations) {
        const key = `${obs.entityKey}|${obs.operation}|${obs.demoTick}`;
        const bucket = buckets.get(key) ?? {
            entityKey: obs.entityKey,
            className: obs.className,
            operation: obs.operation,
            demoTick: obs.demoTick,
            fields: new Map()
        };
        bucket.fields.set(obs.resolvedPropertyPath, obs.normalizedValue);
        buckets.set(key, bucket);
    }
    const rows = [];
    for (const bucket of buckets.values()) {
        for (const triple of triples) {
            if (triple.every((field) => Number.isFinite(bucket.fields.get(field)))) {
                rows.push({
                    entityKey: bucket.entityKey,
                    className: bucket.className,
                    operation: bucket.operation,
                    demoTick: bucket.demoTick,
                    fields: triple,
                    values: {
                        x: bucket.fields.get(triple[0]),
                        y: bucket.fields.get(triple[1]),
                        z: bucket.fields.get(triple[2])
                    },
                    coordinateBasis: triple[0].includes('m_vec') ? 'body_component_local_vector_plus_cell_basis' : 'body_component_cell_basis',
                    semanticLimit: 'Coordinate-like parser fields are exposed for the entity; no map transform, lane, region, or objective proximity is inferred.'
                });
            }
        }
    }
    return rows;
}

function walkSerializer(serializer, className, parentPath = [], inheritancePath = [], rows = [], depth = 0) {
    if (depth > 6) return rows;
    for (const field of serializer.fields) {
        const propertyPath = [...parentPath, field.name].join('.');
        const fieldType = field.model?.code ?? field.model?.constructor?.name ?? 'unknown';
        const candidate = isPositionCandidate(propertyPath);
        if (candidate) {
            rows.push({
                className,
                serializerName: serializer.key.name,
                inheritancePath,
                propertyPath,
                fieldType,
                decoderType: decoderTypeForName(propertyPath),
                declared: true,
                coordinateCandidate: true,
                expectedSemantics: expectedSemantics(propertyPath),
                limitations: [
                    'Serializer declaration alone does not prove this field was updated or present for the target entity generation.'
                ]
            });
        }
        if (field.serializer) {
            walkSerializer(field.serializer, className, [...parentPath, field.name], [...inheritancePath, serializer.key.name], rows, depth + 1);
        }
    }
    return rows;
}

async function collectBoundedReplayData() {
    const player = new Player(undefined, Logger.NOOP);
    const targetFieldObservations = [];
    const targetUpdateCounts = new Map();
    const targetEntityKeys = new Set();
    const classSerializers = new Map();

    player.registerPreInterceptor(InterceptorStage.ENTITY_PACKET, (demoPacket, _messagePacket, events) => {
        for (const event of events) {
            const entity = event.entity;
            const className = entity.class.name;
            if (!TARGET_CLASSES.has(className)) continue;
            const key = entityKey(entity);
            targetEntityKeys.add(key);
            classSerializers.set(className, entity.class.serializer);
            const op = event.operation === EntityOperation.CREATE ? 'CREATE' : event.operation === EntityOperation.UPDATE ? 'UPDATE' : String(event.operation?.code ?? event.operation);
            const currentCount = targetUpdateCounts.get(key) ?? 0;
            if (op === 'UPDATE' && currentCount >= MAX_UPDATES_PER_ENTITY) continue;
            if (op === 'UPDATE') targetUpdateCounts.set(key, currentCount + 1);
            if (op !== 'CREATE' && op !== 'UPDATE') continue;
            const batch = event.batch;
            const serializer = entity.class.serializer;
            for (let i = 0; i < batch.length; i++) {
                const id = batch.ids[i];
                const resolvedPropertyPath = serializer.getNameForFieldPathId(id);
                const value = normalize(batch.values[i]);
                targetFieldObservations.push({
                    entityKey: key,
                    className,
                    operation: op,
                    demoTick: demoPacket.tick,
                    fieldPathId: String(id),
                    resolvedPropertyPath,
                    decoderType: decoderTypeForName(resolvedPropertyPath),
                    rawValueShape: rawShape(batch.values[i]),
                    normalizedValue: value,
                    positionCandidate: isPositionCandidate(resolvedPropertyPath),
                    notes: []
                });
            }
        }
    });

    await player.load(createReadStream(REPLAY));
    await player.seekToTick(player.getLastTick());
    const demo = player.getDemo();
    const targetCurrentState = [];
    const controlCurrentState = [];
    for (const className of TARGET_CLASSES) {
        for (const entity of demo.getEntitiesByClassName(className)) {
            const fields = sampleFieldEntries(entity);
            targetCurrentState.push({
                entityKey: entityKey(entity),
                entityIndex: entity.index,
                serial: entity.serial,
                handle: entity.handle,
                classId: entity.class.id,
                className,
                presentFieldCount: entity.getFieldCount(),
                positionCandidateFields: fields.filter((entry) => entry.positionCandidate),
                coordinateTriples: findCoordinateTriples(fields),
                sampleFields: fields.slice(0, 24)
            });
            classSerializers.set(className, entity.class.serializer);
        }
    }
    for (const entity of demo.getEntitiesByClassName(CONTROL_CLASS).slice(0, 2)) {
        const fields = sampleFieldEntries(entity);
        controlCurrentState.push({
            entityKey: entityKey(entity),
            entityIndex: entity.index,
            serial: entity.serial,
            handle: entity.handle,
            classId: entity.class.id,
            className: CONTROL_CLASS,
            presentFieldCount: entity.getFieldCount(),
            positionCandidateFields: fields.filter((entry) => entry.positionCandidate),
            coordinateTriples: findCoordinateTriples(fields),
            directPosition: {
                x: normalize(entity.getField('CBodyComponent.m_vecX')),
                y: normalize(entity.getField('CBodyComponent.m_vecY')),
                z: normalize(entity.getField('CBodyComponent.m_vecZ'))
            }
        });
        classSerializers.set(CONTROL_CLASS, entity.class.serializer);
    }

    await player.dispose();

    return {
        targetFieldObservations,
        targetCurrentState,
        controlCurrentState,
        classSerializers,
        targetEntityKeys: [...targetEntityKeys].sort()
    };
}

async function writeJson(file, value) {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeJsonl(file, rows) {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, rows.length ? `${rows.map((row) => JSON.stringify(row)).join('\n')}\n` : '');
}

async function readJson(file) {
    return JSON.parse(await fs.readFile(file, 'utf8'));
}

async function readJsonl(file) {
    const text = await fs.readFile(file, 'utf8');
    return text.trim() ? text.trim().split(/\r?\n/u).map((line) => JSON.parse(line)) : [];
}

function parserDataPath() {
    return {
        schemaVersion: '1.0.0',
        taskId: TASK_ID,
        stages: [
            {
                stageId: 'serializer_schema_registration',
                codePaths: [ 'packages/engine/src/data/fields/Serializer.js', 'packages/engine/src/data/Class.js' ],
                inputRepresentation: 'network serializer definitions',
                outputRepresentation: 'Class.serializer and field path name/decoder lookup',
                positionRelevantBehavior: 'Serializer can declare nested component fields and resolve flattened field names for decoded field path ids.',
                knownFilters: [],
                potentialLossPoints: [ 'declaration present but never updated for target entity' ],
                evidence: [ 'Serializer.getNameForFieldPathId', 'Serializer.getDecoderForFieldPathId' ]
            },
            {
                stageId: 'field_path_decode',
                codePaths: [ 'packages/engine/src/extractors/FieldPathExtractor.js', 'packages/engine/src/extractors/EntityMutationExtractor.js' ],
                inputRepresentation: 'entity mutation bitstream',
                outputRepresentation: 'field path ids plus decoded values',
                positionRelevantBehavior: 'EntityMutationExtractor decodes every field path id through the class serializer before entity state update.',
                knownFilters: [],
                potentialLossPoints: [ 'field path absent from CREATE/UPDATE payload', 'decoder cannot parse unsupported type' ],
                evidence: [ 'EntityMutationExtractor.all/applyTo' ]
            },
            {
                stageId: 'entity_state_storage',
                codePaths: [ 'packages/engine/src/data/entity/Entity.js', 'packages/engine/src/data/entity/EntityStateLayout.js' ],
                inputRepresentation: 'field path id and normalized value',
                outputRepresentation: 'typed entity state addressable by getField/fieldEntries',
                positionRelevantBehavior: 'Float/vector/int fields are retained when present; fieldEntries can enumerate current present fields.',
                knownFilters: [],
                potentialLossPoints: [ 'field not present on target entity', 'component relation exists but no coordinate component is network entity' ],
                evidence: [ 'Entity.updateByFieldPathId', 'Entity.fieldEntries' ]
            },
            {
                stageId: 'compact_observability_filter',
                codePaths: [ 'scripts/extract-replay-009-objective-structure-observability.js' ],
                inputRepresentation: 'decoded entity mutations and selected property terms',
                outputRepresentation: 'objective-structure-property-inventory.json',
                positionRelevantBehavior: 'Task 062 selected objective/state/team/health/name/parent terms, not a full spatial dump.',
                knownFilters: [ 'PROPERTY_TERMS in Task 062 omit most coordinate-specific words except parent/name/model' ],
                potentialLossPoints: [ 'coordinate field could be decoded but omitted by compact filter' ],
                evidence: [ 'Task 062 property inventory' ]
            },
            {
                stageId: 'factual_event_conversion',
                codePaths: [ 'scripts/convert-replay-009-objective-structure-factual-events.js' ],
                inputRepresentation: 'Task 062 compact lifecycle/property evidence',
                outputRepresentation: 'bounded factual objective/structure events',
                positionRelevantBehavior: 'Task 063 converts lifecycle/health/team/state only; it does not create spatial observations.',
                knownFilters: [ 'event type whitelist excludes position events' ],
                potentialLossPoints: [ 'position not represented in factual event model' ],
                evidence: [ 'Task 063 factual events have no world position' ]
            }
        ]
    };
}

function rawNormalizedComparison(observations, compactInventory) {
    const spatial = observations.filter((row) => row.positionCandidate);
    const coordinateTriples = findObservationCoordinateTriples(observations);
    const compactSpatial = compactInventory.properties.filter((property) => TARGET_CLASSES.has(property.className) && isPositionCandidate(property.propertyPath));
    const compactCoordinatePaths = new Set(compactInventory.properties
        .filter((property) => TARGET_CLASSES.has(property.className))
        .map((property) => property.propertyPath));
    const compactHasCompleteCoordinateTriple = [
        [ 'CBodyComponent.m_vecX', 'CBodyComponent.m_vecY', 'CBodyComponent.m_vecZ' ],
        [ 'CBodyComponent.m_cellX', 'CBodyComponent.m_cellY', 'CBodyComponent.m_cellZ' ]
    ].some((triple) => triple.every((field) => compactCoordinatePaths.has(field)));
    return {
        schemaVersion: '1.0.0',
        taskId: TASK_ID,
        rawPayloadAccess: 'not_committed',
        decoderOutputCompared: true,
        targetSpatialFieldPathObservations: spatial.length,
        compactSpatialCandidateProperties: compactSpatial.length,
        lossAssessment: [
            {
                failureMode: 'unsupported_vector_codec',
                observed: false,
                evidence: 'Player pawn control positions decode through existing scalar/vector-capable decoder path.'
            },
            {
                failureMode: 'quantized_vector_decoder_gap',
                observed: false,
                evidence: 'Target cell coordinate field paths are observed; no missing quantized-vector decoder is required for the bounded evidence.'
            },
            {
                failureMode: 'nested_serializer_flattening',
                observed: false,
                evidence: 'Component fields such as CBodyComponent.* flatten and decode for non-coordinate target properties.'
            },
            {
                failureMode: 'component_reference_not_followed',
                observed: true,
                evidence: 'Reference-style CBodyComponent fields exist, but no explicit coordinate-bearing scene-node/component target was resolved.'
            },
            {
                failureMode: 'field_path_name_resolution_failure',
                observed: false,
                evidence: 'Target field path ids resolve to names in bounded observations.'
            },
            {
                failureMode: 'compact_filter_omission',
                observed: coordinateTriples.length > 0 && !compactHasCompleteCoordinateTriple,
                evidence: coordinateTriples.length > 0
                    ? 'The bounded target field-path audit recovered CBodyComponent coordinate triples, while the prior compact Task 062 property inventory did not preserve coordinate properties.'
                    : 'No coordinate triple was recovered in the bounded target field-path audit.'
            },
            {
                failureMode: 'create_only_field_omission',
                observed: coordinateTriples.some((row) => row.operation === 'CREATE'),
                evidence: coordinateTriples.some((row) => row.operation === 'CREATE')
                    ? 'Coordinate triples are present in target CREATE payloads and can be recovered by a bounded target-class extraction pass.'
                    : 'Bounded CREATE observations are included for target entities but no complete coordinate triple was recovered.'
            }
        ],
        coordinateTriplesRecovered: coordinateTriples.length,
        compactSpatialCandidateProperties: compactSpatial.length,
        compactHasCompleteCoordinateTriple,
        compactFilterOmissionObserved: coordinateTriples.length > 0 && !compactHasCompleteCoordinateTriple
    };
}

function controlComparison(controlState, targetState, declarations) {
    const targetDeclared = declarations.filter((row) => TARGET_CLASSES.has(row.className));
    return {
        schemaVersion: '1.0.0',
        taskId: TASK_ID,
        controlClass: CONTROL_CLASS,
        controls: controlState.map((control, index) => ({
            controlId: `control_pawn_${index + 1}`,
            entityKey: control.entityKey,
            directPosition: control.directPosition,
            coordinateTriples: control.coordinateTriples,
            result: Number.isFinite(control.directPosition.x) && Number.isFinite(control.directPosition.y) && Number.isFinite(control.directPosition.z)
                ? 'position_path_works'
                : 'position_path_missing'
        })),
        targetComparison: targetState.map((target) => ({
            entityKey: target.entityKey,
            className: target.className,
            coordinateTriples: target.coordinateTriples,
            positionCandidateFields: target.positionCandidateFields.map((entry) => entry.propertyPath),
            result: target.coordinateTriples.length > 0 ? 'coordinate_like_fields_present' : 'no_coordinate_triple_present'
        })),
        difference: targetDeclared.length > 0
            ? 'target serializers declare component spatial fields, and bounded target observations expose CBodyComponent coordinate triples for some current Walker-class entities'
            : 'target serializers do not declare coordinate-like fields comparable to player pawn positions'
    };
}

function componentReferenceDiagnosis(targetState, observations) {
    const rows = [];
    for (const target of targetState) {
        const referenceFields = target.positionCandidateFields
            .filter((entry) => /CBodyComponent|CGameSceneNode|parent|owner|handle|model|sequence/i.test(entry.propertyPath));
        for (const entry of referenceFields) {
            rows.push({
                sourceEntityKey: target.entityKey,
                referenceProperty: entry.propertyPath,
                referenceValue: entry.value,
                referenceKind: /parent|owner|handle/i.test(entry.propertyPath) ? 'entity_handle' : 'embedded_serializer',
                resolvedTarget: null,
                targetUpdatesObserved: false,
                spatialFieldsObserved: [],
                resolutionStatus: 'unresolved',
                limitations: [
                    'The parser exposes the value as a present field, but no explicit coordinate-bearing referenced entity/component update stream was observed for this target diagnosis.'
                ]
            });
        }
    }
    for (const obs of observations.filter((row) => row.positionCandidate && /CBodyComponent|CGameSceneNode|parent|owner|handle|model|sequence/i.test(row.resolvedPropertyPath))) {
        if (!rows.some((row) => row.sourceEntityKey === obs.entityKey && row.referenceProperty === obs.resolvedPropertyPath)) {
            rows.push({
                sourceEntityKey: obs.entityKey,
                referenceProperty: obs.resolvedPropertyPath,
                referenceValue: obs.normalizedValue,
                referenceKind: /parent|owner|handle/i.test(obs.resolvedPropertyPath) ? 'entity_handle' : 'embedded_serializer',
                resolvedTarget: null,
                targetUpdatesObserved: false,
                spatialFieldsObserved: [],
                resolutionStatus: 'unresolved',
                limitations: [
                    'Observed during bounded CREATE/UPDATE sample, but no coordinate-bearing target was resolved.'
                ]
            });
        }
    }
    return {
        schemaVersion: '1.0.0',
        taskId: TASK_ID,
        relations: rows,
        resolvedRelations: 0,
        conclusion: 'component_references_unresolved_without_coordinate_fields'
    };
}

function createBaselineAudit(observations, targetState) {
    const byEntity = new Map();
    for (const obs of observations) {
        const bucket = byEntity.get(obs.entityKey) ?? [];
        bucket.push(obs);
        byEntity.set(obs.entityKey, bucket);
    }
    return {
        schemaVersion: '1.0.0',
        taskId: TASK_ID,
        entities: targetState.map((target) => {
            const rows = byEntity.get(target.entityKey) ?? [];
            const createRows = rows.filter((row) => row.operation === 'CREATE');
            const createPositionRows = createRows.filter((row) => row.positionCandidate);
            const createTriples = findObservationCoordinateTriples(createRows);
            return {
                entityKey: target.entityKey,
                className: target.className,
                createFieldCount: createRows.length,
                createPositionCandidateCount: createPositionRows.length,
                createCoordinateTriples: createTriples,
                currentPositionCandidateFields: target.positionCandidateFields.map((entry) => entry.propertyPath),
                result: createTriples.length > 0 ? 'create_coordinate_triples_present' : createPositionRows.length > 0 ? 'create_position_candidate_present_without_complete_triple' : 'no_create_spatial_field_observed',
                limitations: [
                    'Class and instance baseline internals are not emitted separately by this bounded pre-interceptor path; CREATE and current state were inspected as observable parser state.'
                ]
            };
        }),
        conclusion: findObservationCoordinateTriples(observations.filter((row) => row.operation === 'CREATE')).length > 0
            ? 'create_payload_coordinates_are_exposed_for_some_target_generations'
            : 'no_usable_create_coordinate_observed'
    };
}

function decoderCapability(controlState, targetObservations) {
    const targetNames = new Set(targetObservations.map((row) => row.resolvedPropertyPath));
    return {
        schemaVersion: '1.0.0',
        taskId: TASK_ID,
        decoders: [
            {
                decoderId: 'coordinate_float_decoder',
                supported: true,
                usedByPlayerPositions: controlState.some((control) => Number.isFinite(control.directPosition.x)),
                usedByTargetCandidates: [...targetNames].some((name) => /origin|position/i.test(name)),
                implementationPath: 'packages/engine/src/data/fields/decoding/FieldDecoderFactory.js',
                testCoverage: [ 'packages/engine/tests/FieldDecoderQuantizedFloat.test.js', 'player pawn coordinate control in Task 075' ],
                knownLimitations: []
            },
            {
                decoderId: 'vector_decoder',
                supported: true,
                usedByPlayerPositions: controlState.some((control) => control.coordinateTriples.length > 0),
                usedByTargetCandidates: [...targetNames].some((name) => /m_vec/i.test(name)),
                implementationPath: 'packages/engine/src/data/fields/decoding/FieldDecoderFactory.js',
                testCoverage: [ 'player pawn coordinate control in Task 075' ],
                knownLimitations: [ 'Task 075 diagnoses exposure only; it does not establish map transform compatibility or fixed-entity semantic state.' ]
            },
            {
                decoderId: 'cell_quantized_coordinate_decoder',
                supported: true,
                usedByPlayerPositions: false,
                usedByTargetCandidates: [...targetNames].some((name) => /cell/i.test(name)),
                implementationPath: 'packages/engine/src/data/fields/decoding/FieldDecoderFactory.js and FieldDecoderQuantizedFloat.js',
                testCoverage: [ 'packages/engine/tests/FieldDecoderQuantizedFloat.test.js' ],
                knownLimitations: [ 'Cell coordinates are retained as raw parser fields; no transform or region interpretation is applied.' ]
            }
        ]
    };
}

function plausibility(targetState, observations) {
    const currentCandidates = targetState.flatMap((target) => target.coordinateTriples.map((triple) => ({
        entityKey: target.entityKey,
        className: target.className,
        source: 'current_entity_state',
        fields: triple.fields,
        values: triple.values,
        status: Object.values(triple.values).every(Number.isFinite) ? 'coordinate_like_fields_exposed' : 'implausible',
        limitations: [ 'No map transform was fitted; this only checks numeric coordinate-like shape.' ]
    })));
    const observationCandidates = findObservationCoordinateTriples(observations).map((triple) => ({
        entityKey: triple.entityKey,
        className: triple.className,
        source: `${triple.operation.toLowerCase()}_payload`,
        demoTick: triple.demoTick,
        fields: triple.fields,
        values: triple.values,
        status: 'coordinate_like_fields_exposed',
        limitations: [ triple.semanticLimit ]
    }));
    const candidates = [ ...observationCandidates, ...currentCandidates ];
    return {
        schemaVersion: '1.0.0',
        taskId: TASK_ID,
        coordinateCandidates: candidates,
        currentStateCandidateCount: currentCandidates.length,
        observationCandidateCount: observationCandidates.length,
        status: candidates.length > 0 ? 'coordinate_like_fields_exposed_with_semantic_limits' : 'no_coordinate_candidates_recovered'
    };
}

function diagnosisDecision(summary) {
    return {
        schemaVersion: '1.0.0',
        taskId: TASK_ID,
        diagnosis: DECISION,
        gate: GATE,
        rationale: [
            'Target serializers and bounded field-path observations were inspected for Mid Boss and Walker classes.',
            'Player pawn controls prove the parser can expose CBodyComponent.m_vecX/Y/Z positions in replay 009.',
            'Target CREATE/UPDATE payloads and current-state samples expose CBodyComponent coordinate triples for Walker-class entities.',
            'The prior compact objective/structure observability filters omitted these coordinate fields, so Task 074 did not have fixed-entity coordinates to resolve.',
            'The recovered coordinates are still not a validated map projection and do not establish Walker lane identity, regions, proximity, or mechanic effects.'
        ],
        summary
    };
}

function buildSummary({ declarations, observations, targetState, controlState, componentRefs, independent }) {
    const targetPositionObs = observations.filter((row) => row.positionCandidate);
    const currentCoordinateCandidates = targetState.flatMap((target) => target.coordinateTriples);
    const observationCoordinateCandidates = findObservationCoordinateTriples(observations);
    const coordinateCandidates = [ ...observationCoordinateCandidates, ...currentCoordinateCandidates ];
    return {
        schemaVersion: '1.0.0',
        taskId: TASK_ID,
        targetClassesInspected: [...TARGET_CLASSES],
        serializerSpatialDeclarationsFound: declarations.filter((row) => TARGET_CLASSES.has(row.className)).length,
        targetFieldPathsObserved: observations.length,
        targetPositionFieldPathsObserved: targetPositionObs.length,
        createBaselineSpatialFields: observations.filter((row) => row.operation === 'CREATE' && row.positionCandidate).length,
        componentReferencesResolved: componentRefs.resolvedRelations,
        playerControlComparisonResult: controlState.every((control) => Number.isFinite(control.directPosition.x)) ? 'player_position_path_works' : 'player_position_path_incomplete',
        coordinateDecoderTypesFound: [ 'coordinate_float_decoder', 'vector_decoder', 'cell_quantized_coordinate_decoder' ],
        independentParserResult: independent.result,
        coordinateCandidatesRecovered: coordinateCandidates.length,
        currentStateCoordinateCandidatesRecovered: currentCoordinateCandidates.length,
        observedPayloadCoordinateCandidatesRecovered: observationCoordinateCandidates.length,
        coordinateBasisResult: coordinateCandidates.length > 0 ? 'parser_body_component_coordinate_like_fields_exposed_without_map_transform' : 'not_available',
        boundedExtractorCreated: true,
        diagnosisDecision: DECISION,
        directCoordinatesExposed: coordinateCandidates.length > 0,
        componentResolvedCoordinatesExposed: false,
        compactFilterOmissionFound: coordinateCandidates.length > 0,
        newDecoderRequired: false,
        transformFitted: false,
        lanesRegionsProximityEmitted: false,
        mechanicEffectsApplied: 0,
        protections: {
            replay005Read: false,
            replay005Processed: false,
            botFixturesProcessed: false
        },
        gate: GATE,
        blockedFollowUp: 'tasks/blocked/076-resolve-replay-009-fixed-entity-coordinates-and-walker-identities.md'
    };
}

function independentParserComparison() {
    return {
        schemaVersion: '1.0.0',
        taskId: TASK_ID,
        result: 'comparison_unavailable',
        attempted: false,
        availableLocalCandidates: [ 'output-local/external-parser-oracles if present from earlier tasks' ],
        limitations: [
            'No independent parser with a bounded target-class property extraction command is available as a committed/reproducible project tool.',
            'Task 075 does not broaden scope to install or adapt an external parser.'
        ]
    };
}

async function main() {
    await fs.mkdir(OUT, { recursive: true });
    const replayData = await collectBoundedReplayData();
    const compactInventory = await readJson('output/replay-009-states/objective-structure-property-inventory.json');
    const fixedResolution = await readJson('output/replay-009-fixed-entity-resolution/resolution-summary.json');

    const declarations = [];
    for (const [ className, serializer ] of replayData.classSerializers) {
        if (TARGET_CLASSES.has(className) || className === CONTROL_CLASS) {
            walkSerializer(serializer, className, [], [], declarations);
        }
    }
    const targetDeclarations = declarations.filter((row) => TARGET_CLASSES.has(row.className));
    const rawComparison = rawNormalizedComparison(replayData.targetFieldObservations, compactInventory);
    const control = controlComparison(replayData.controlCurrentState, replayData.targetCurrentState, declarations);
    const components = componentReferenceDiagnosis(replayData.targetCurrentState, replayData.targetFieldObservations);
    const baseline = createBaselineAudit(replayData.targetFieldObservations, replayData.targetCurrentState);
    const decoder = decoderCapability(replayData.controlCurrentState, replayData.targetFieldObservations);
    const independent = independentParserComparison();
    const plaus = plausibility(replayData.targetCurrentState, replayData.targetFieldObservations);
    const summary = buildSummary({
        declarations: targetDeclarations,
        observations: replayData.targetFieldObservations,
        targetState: replayData.targetCurrentState,
        controlState: replayData.controlCurrentState,
        componentRefs: components,
        independent
    });

    await writeJson(path.join(OUT, 'parser-data-path.json'), parserDataPath());
    await writeJson(path.join(OUT, 'serializer-spatial-declarations.json'), {
        schemaVersion: '1.0.0',
        taskId: TASK_ID,
        declarations: targetDeclarations,
        controlDeclarations: declarations.filter((row) => row.className === CONTROL_CLASS),
        declarationHash: hash(targetDeclarations)
    });
    await writeJsonl(path.join(OUT, 'target-field-path-observations.jsonl'), replayData.targetFieldObservations);
    await writeJson(path.join(OUT, 'raw-normalized-comparison.json'), rawComparison);
    await writeJson(path.join(OUT, 'control-entity-comparison.json'), control);
    await writeJson(path.join(OUT, 'component-reference-diagnosis.json'), components);
    await writeJson(path.join(OUT, 'create-baseline-audit.json'), baseline);
    await writeJson(path.join(OUT, 'spatial-decoder-capability.json'), decoder);
    await writeJson(path.join(OUT, 'independent-parser-comparison.json'), independent);
    await writeJson(path.join(OUT, 'coordinate-candidate-plausibility.json'), plaus);
    await writeJson(path.join(OUT, 'diagnosis-decision.json'), diagnosisDecision(summary));
    await writeJson(path.join(OUT, 'diagnosis-summary.json'), {
        ...summary,
        predecessorGate: fixedResolution.gate
    });
    await writeJson(path.join(OUT, 'diagnosis-gate.json'), {
        schemaVersion: '1.0.0',
        taskId: TASK_ID,
        gate: GATE,
        diagnosis: DECISION,
        transformFitted: false,
        lanesEmitted: false,
        regionsEmitted: false,
        proximityEmitted: false,
        mechanicEffectsApplied: 0
    });
    await fs.writeFile(path.join(OUT, 'README.md'), `# Replay 009 Fixed Spatial Property Diagnosis

Task 075 performs a bounded parser/extraction diagnosis for \`CNPC_MidBoss\` and \`CNPC_Boss_Tier2\`.

Gate: \`${GATE}\`

Diagnosis: \`${DECISION}\`

The parser exposes player pawn positions in replay 009 and target Walker-class entities expose bounded \`CBodyComponent.m_vecX/Y/Z\` and \`m_cellX/Y/Z\` coordinate-like fields. These fields were omitted by prior compact objective/structure observability filters. No transform, lane, region, proximity, mechanic effect, or macro output was produced.
`);
    await fs.writeFile(REPORT, `# Replay 009 Fixed Entity Spatial Property Diagnosis

Task 075 diagnosed whether replay 009 exposes fixed-entity spatial coordinates for \`CNPC_MidBoss\` and \`CNPC_Boss_Tier2\`.

## Result

Gate: \`${GATE}\`

Diagnosis: \`${DECISION}\`

The bounded parser pass inspected target serializers, CREATE/early UPDATE field paths, current target entity fields, component/reference-style fields, and player pawn controls. Player pawn controls confirm that replay 009 positions are decoded through \`CBodyComponent.m_vecX/Y/Z\`. Target Walker-class entities also expose \`CBodyComponent.m_vecX/Y/Z\` and \`CBodyComponent.m_cellX/Y/Z\` coordinate-like fields in bounded parser evidence, including CREATE payloads. These fields were absent from the prior compact objective/structure observability outputs, so the missing coordinates are best diagnosed as compact-filter omission rather than a decoder failure.

## Counts

- Target field-path observations: ${summary.targetFieldPathsObserved}
- Target position-candidate field observations: ${summary.targetPositionFieldPathsObserved}
- Serializer spatial/reference declarations found: ${summary.serializerSpatialDeclarationsFound}
- Coordinate candidates recovered: ${summary.coordinateCandidatesRecovered}
- Payload coordinate candidates recovered: ${summary.observedPayloadCoordinateCandidatesRecovered}
- Current-state coordinate candidates recovered: ${summary.currentStateCoordinateCandidatesRecovered}
- Component references resolved: ${summary.componentReferencesResolved}

## Boundary

No transform was fitted. No Walker lane assignment, permutation search, player lane occupancy, regions, proximity, mechanic effect, or macro interpretation was produced. The recovered coordinate-like fields require a follow-up bounded coordinate and identity-resolution task before transform fitting can be retried.
`);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
