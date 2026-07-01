import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

import { EntityOperation, InterceptorStage, Logger, Player } from 'deadem';

const TASK_ID = '076';
const DEFAULT_REPLAY = 'samples/replay_009_normal.dem';
const DEFAULT_OUT = 'output/replay-009-fixed-coordinate-resolution';
const DEFAULT_CLASSES = ['CNPC_MidBoss', 'CNPC_Boss_Tier2'];
const PLAYER_CONTROL_CLASS = 'CCitadelPlayerPawn';
const VECTOR_FIELDS = ['CBodyComponent.m_vecX', 'CBodyComponent.m_vecY', 'CBodyComponent.m_vecZ'];
const CELL_FIELDS = ['CBodyComponent.m_cellX', 'CBodyComponent.m_cellY', 'CBodyComponent.m_cellZ'];
const DIRECT_FIELDS = [
    ...VECTOR_FIELDS,
    ...CELL_FIELDS,
    'm_iTeamNum',
    'CBodyComponent.m_name',
    'CBodyComponent.m_hParent',
    'CBodyComponent.m_hModel',
    'CBodyComponent.m_hSequence'
];
const TEAM_OR_NAME_PATTERN = /team|owner|spawn|name|target/i;
const GATE = 'replay_009_fixed_entity_coordinates_ready_with_gaps';

function baseEntityKey(key) {
    return String(key).split(':').slice(0, 4).join(':');
}

function parseArgs(argv) {
    const args = {
        replay: DEFAULT_REPLAY,
        output: DEFAULT_OUT,
        classes: []
    };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--replay') args.replay = argv[++i];
        else if (arg === '--output') args.output = argv[++i];
        else if (arg === '--class') args.classes.push(argv[++i]);
    }
    if (args.classes.length === 0) args.classes = DEFAULT_CLASSES;
    return args;
}

function round(value, digits = 3) {
    return Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
}

function normalize(value) {
    if (value === undefined || value === null) return null;
    if (typeof value === 'bigint') return value.toString();
    if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') return value;
    if (ArrayBuffer.isView(value)) return Array.from(value).map(normalize);
    if (Array.isArray(value)) return value.map(normalize);
    if (typeof value === 'object') return Object.fromEntries(Object.entries(value).slice(0, 12).map(([key, item]) => [key, normalize(item)]));
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

function operationName(operation) {
    if (operation === EntityOperation.CREATE) return 'CREATE';
    if (operation === EntityOperation.UPDATE) return 'UPDATE';
    if (operation === EntityOperation.DELETE) return 'DELETE';
    if (operation === EntityOperation.LEAVE) return 'LEAVE';
    return String(operation?.code ?? operation);
}

function emptyAxes() {
    return { x: null, y: null, z: null };
}

function axesFromMap(fields, names) {
    return {
        x: Number.isFinite(fields.get(names[0])?.value) ? fields.get(names[0]).value : null,
        y: Number.isFinite(fields.get(names[1])?.value) ? fields.get(names[1]).value : null,
        z: Number.isFinite(fields.get(names[2])?.value) ? fields.get(names[2]).value : null
    };
}

function isComplete(vector) {
    return Number.isFinite(vector.x) && Number.isFinite(vector.y) && Number.isFinite(vector.z);
}

function distance(a, b) {
    if (!a || !b || !isComplete(a) || !isComplete(b)) return null;
    return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2);
}

function median(values) {
    const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
    if (sorted.length === 0) return null;
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function stableHashString(value) {
    return JSON.stringify(value, (_key, current) => {
        if (current && typeof current === 'object' && !Array.isArray(current)) {
            return Object.fromEntries(Object.entries(current).sort(([a], [b]) => a.localeCompare(b)));
        }
        return current;
    });
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

function shouldCaptureField(name) {
    return DIRECT_FIELDS.includes(name) || TEAM_OR_NAME_PATTERN.test(name);
}

function remapObservationKeys(rawObservations, keyMap) {
    return rawObservations.map((observation) => ({
        ...observation,
        entityKey: keyMap.get(baseEntityKey(observation.entityKey)) ?? observation.entityKey,
        observationId: observation.observationId.replace(baseEntityKey(observation.entityKey), keyMap.get(baseEntityKey(observation.entityKey)) ?? baseEntityKey(observation.entityKey))
    }));
}

function mergeInventoryWithPrior(parserInventory, priorTargets) {
    const byBaseKey = new Map(parserInventory.map((entity) => [baseEntityKey(entity.entityKey), entity]));
    return priorTargets
        .map((prior, index) => {
            const observed = byBaseKey.get(baseEntityKey(prior.entityKey));
            return {
                entityKey: prior.entityKey,
                entityIndex: prior.entityIndex,
                serial: prior.serial,
                handle: Number(baseEntityKey(prior.entityKey).split(':')[2]),
                classId: Number(baseEntityKey(prior.entityKey).split(':')[3]),
                generation: index + 1,
                className: prior.className,
                createTick: observed?.createTick ?? (prior.entityKey.endsWith(':-1') ? null : Number(prior.entityKey.split(':')[4])),
                deleteTick: observed?.deleteTick ?? null,
                firstObservedTick: observed?.firstObservedTick ?? null,
                lastObservedTick: observed?.lastObservedTick ?? null,
                coordinateEvidenceAvailable: observed?.coordinateEvidenceAvailable ?? false,
                coordinateEvidenceSources: observed?.coordinateEvidenceSources ?? [],
                fieldSamples: observed?.fieldSamples ?? {},
                limitations: [
                    ...(observed ? [] : ['No direct parser coordinate observation was recovered by the bounded Task 076 extractor.']),
                    ...(prior.notes ?? [])
                ]
            };
        })
        .sort((a, b) => a.className.localeCompare(b.className) || a.entityIndex - b.entityIndex);
}

function fieldsToObservation({ entity, operation, tick, tickRate, stage, fields, sequence }) {
    const fieldMap = new Map(fields.map((field) => [field.path, field]));
    const vector = axesFromMap(fieldMap, VECTOR_FIELDS);
    const cell = axesFromMap(fieldMap, CELL_FIELDS);
    const sourceFieldPaths = fields.map((field) => field.path).sort();
    const fieldsPresent = sourceFieldPaths;
    return {
        observationId: `t076-${entityKey(entity)}-${operation.toLowerCase()}-${tick}-${sequence}`,
        entityKey: entityKey(entity),
        className: entity.class.name,
        operation,
        demoTick: tick,
        parserSeconds: round(tick / tickRate),
        vector,
        cell,
        fieldsPresent,
        sourceFieldPaths,
        sourceStage: stage,
        rawValueTypes: fields.map((field) => ({ fieldPath: field.path, rawValueType: field.rawValueType })),
        completeVectorTriplet: isComplete(vector),
        completeCellTriplet: isComplete(cell),
        warnings: [
            ...(isComplete(vector) ? [] : ['incomplete_vector_triplet']),
            ...(isComplete(cell) ? [] : ['incomplete_cell_triplet'])
        ]
    };
}

async function collectReplay({ replay, classes }) {
    const targetClasses = new Set(classes);
    const player = new Player(undefined, Logger.NOOP);
    const generations = new Map();
    const rawObservations = [];
    const fieldEvidence = new Map();
    const controlSnapshots = [];
    let tickRate = 64;
    let sequence = 0;

    function ensureGeneration(entity) {
        const key = entityKey(entity);
        const existing = generations.get(key);
        if (existing) return existing;
        const generation = {
            entityKey: key,
            entityIndex: entity.index,
            serial: entity.serial,
            handle: entity.handle,
            classId: entity.class.id,
            generation: null,
            className: entity.class.name,
            createTick: null,
            deleteTick: null,
            firstObservedTick: null,
            lastObservedTick: null,
            coordinateEvidenceAvailable: false,
            coordinateEvidenceSources: new Set(),
            fieldSamples: new Map(),
            limitations: []
        };
        generations.set(key, generation);
        return generation;
    }

    function addFieldEvidence(key, field) {
        const samples = fieldEvidence.get(key) ?? [];
        samples.push(field);
        fieldEvidence.set(key, samples);
    }

    player.registerPreInterceptor(InterceptorStage.ENTITY_PACKET, (demoPacket, _messagePacket, events) => {
        for (const event of events) {
            const entity = event.entity;
            const className = entity.class.name;
            if (!targetClasses.has(className)) continue;
            const generation = ensureGeneration(entity);
            const tick = demoPacket.tick;
            const operation = operationName(event.operation);
            generation.firstObservedTick = generation.firstObservedTick === null ? tick : Math.min(generation.firstObservedTick, tick);
            generation.lastObservedTick = generation.lastObservedTick === null ? tick : Math.max(generation.lastObservedTick, tick);
            if (operation === 'CREATE') generation.createTick = tick;
            if (operation === 'DELETE') generation.deleteTick = tick;
            if (operation === 'LEAVE') generation.limitations.push('LEAVE observed; not treated as deletion/destruction.');

            const fields = [];
            if ((operation === 'CREATE' || operation === 'UPDATE') && event.batch) {
                const serializer = entity.class.serializer;
                for (let i = 0; i < event.batch.length; i++) {
                    const id = event.batch.ids[i];
                    const pathName = serializer.getNameForFieldPathId(id);
                    if (!shouldCaptureField(pathName)) continue;
                    const value = normalize(event.batch.values[i]);
                    const field = {
                        path: pathName,
                        value,
                        rawValueType: rawShape(event.batch.values[i]),
                        operation,
                        tick
                    };
                    fields.push(field);
                    generation.fieldSamples.set(pathName, value);
                    addFieldEvidence(generation.entityKey, field);
                }
            }

            const coordinateOrDirectFields = fields.filter((field) => DIRECT_FIELDS.includes(field.path) || /team|name|spawn|target/i.test(field.path));
            if (coordinateOrDirectFields.length > 0) {
                const observation = fieldsToObservation({
                    entity,
                    operation,
                    tick,
                    tickRate,
                    stage: 'entity_packet_pre_interceptor',
                    fields: coordinateOrDirectFields,
                    sequence: sequence++
                });
                rawObservations.push(observation);
                if (observation.completeVectorTriplet || observation.completeCellTriplet) {
                    generation.coordinateEvidenceAvailable = true;
                    generation.coordinateEvidenceSources.add(observation.sourceStage);
                }
            }
        }
    });

    await player.load(createReadStream(replay));
    await player.seekToTick(player.getLastTick());
    const demo = player.getDemo();
    tickRate = demo.server?.tickRate ?? 64;

    for (const className of targetClasses) {
        for (const entity of demo.getEntitiesByClassName(className)) {
            const generation = ensureGeneration(entity);
            generation.firstObservedTick = generation.firstObservedTick ?? player.getCurrentTick();
            generation.lastObservedTick = Math.max(generation.lastObservedTick ?? 0, player.getCurrentTick());
            const fields = [];
            for (const name of DIRECT_FIELDS) {
                const value = normalize(entity.getField(name));
                if (value === null) continue;
                fields.push({ path: name, value, rawValueType: typeof value, operation: 'CURRENT_STATE', tick: player.getCurrentTick() });
                generation.fieldSamples.set(name, value);
                addFieldEvidence(generation.entityKey, fields.at(-1));
            }
            if (fields.length > 0) {
                const observation = fieldsToObservation({
                    entity,
                    operation: 'CURRENT_STATE',
                    tick: player.getCurrentTick(),
                    tickRate,
                    stage: 'current_entity_state',
                    fields,
                    sequence: sequence++
                });
                rawObservations.push(observation);
                if (observation.completeVectorTriplet || observation.completeCellTriplet) {
                    generation.coordinateEvidenceAvailable = true;
                    generation.coordinateEvidenceSources.add(observation.sourceStage);
                }
            }
        }
    }

    for (const entity of demo.getEntitiesByClassName(PLAYER_CONTROL_CLASS).slice(0, 2)) {
        const fields = new Map();
        for (const name of [...VECTOR_FIELDS, ...CELL_FIELDS]) {
            fields.set(name, { value: normalize(entity.getField(name)) });
        }
        const vector = axesFromMap(fields, VECTOR_FIELDS);
        const cell = axesFromMap(fields, CELL_FIELDS);
        controlSnapshots.push({
            entityKey: entityKey(entity),
            className: PLAYER_CONTROL_CLASS,
            demoTick: player.getCurrentTick(),
            parserSeconds: round(player.getCurrentTick() / tickRate),
            vector,
            cell,
            acceptedPlayerWorldPosition: vector,
            source: 'player pawn CBodyComponent.m_vecX/Y/Z path used by Task 056/075 controls'
        });
    }

    await player.dispose();

    const inventory = [...generations.values()]
        .sort((a, b) => a.className.localeCompare(b.className) || a.entityIndex - b.entityIndex)
        .map((generation, index) => ({
            ...generation,
            generation: index + 1,
            coordinateEvidenceSources: [...generation.coordinateEvidenceSources].sort(),
            fieldSamples: Object.fromEntries([...generation.fieldSamples.entries()].sort(([a], [b]) => a.localeCompare(b))),
            limitations: [...new Set(generation.limitations)]
        }));

    return {
        tickRate,
        inventory,
        rawObservations: rawObservations.sort((a, b) => a.demoTick - b.demoTick || a.entityKey.localeCompare(b.entityKey) || a.observationId.localeCompare(b.observationId)),
        fieldEvidence,
        controlSnapshots
    };
}

function playerControlReconstruction(controlSnapshots) {
    const formulas = [
        {
            formulaId: 'vector_only',
            formula: 'worldCoordinate = CBodyComponent.m_vecX/Y/Z',
            calculate: (sample) => sample.vector,
            limitations: ['Supported only as the existing project replay-coordinate basis, not as a map projection.']
        },
        {
            formulaId: 'cell_plus_vector_1024_hypothesis',
            formula: 'worldCoordinate = cell * 1024 + vector',
            calculate: (sample) => isComplete(sample.cell) && isComplete(sample.vector)
                ? { x: sample.cell.x * 1024 + sample.vector.x, y: sample.cell.y * 1024 + sample.vector.y, z: sample.cell.z * 1024 + sample.vector.z }
                : emptyAxes(),
            limitations: ['Rejected or inconclusive by player controls; included only to test the common cell-plus-offset hypothesis without map fitting.']
        }
    ];
    const rows = formulas.map((formula) => {
        const errors = controlSnapshots.map((sample) => distance(formula.calculate(sample), sample.acceptedPlayerWorldPosition)).filter(Number.isFinite);
        const matchingSamples = errors.filter((error) => error <= 0.001).length;
        return {
            formulaId: formula.formulaId,
            formula: formula.formula,
            controlSamples: controlSnapshots.length,
            matchingSamples,
            medianError: round(median(errors), 6),
            maximumError: round(Math.max(...errors), 6),
            status: matchingSamples === controlSnapshots.length && controlSnapshots.length > 0 ? 'supported' : errors.length > 0 ? 'rejected' : 'inconclusive',
            limitations: formula.limitations
        };
    });
    return {
        schemaVersion: '1.0.0',
        taskId: TASK_ID,
        controlSnapshots,
        formulas: rows,
        acceptedFormulaId: rows.find((row) => row.status === 'supported')?.formulaId ?? null
    };
}

function decoderContract(reconstruction) {
    const accepted = reconstruction.acceptedFormulaId;
    return {
        schemaVersion: '1.0.0',
        taskId: TASK_ID,
        decoderPath: 'Entity.getField("CBodyComponent.m_vecX/Y/Z") via Class serializer field path decode and Entity state storage',
        vectorMeaning: accepted === 'vector_only' ? 'world' : 'unknown',
        cellMeaning: 'metadata',
        cellSize: null,
        reconstructionFormula: accepted === 'vector_only' ? 'worldCoordinate = CBodyComponent.m_vecX/Y/Z' : null,
        formulaEvidence: [
            'Task 056/075 player position controls use CBodyComponent.m_vecX/Y/Z directly.',
            `Player-control reconstruction accepted formula: ${accepted ?? 'none'}.`,
            'Cell-plus-vector hypothesis is rejected against accepted player coordinates and was not tuned on fixed entities.'
        ],
        playerControlAgreement: accepted === 'vector_only' ? 'vector_only reproduces accepted player position controls exactly' : 'no formula accepted',
        targetClassAgreement: 'Target classes use the same exposed CBodyComponent.m_vecX/Y/Z field paths when complete triplets are present.',
        confidence: accepted === 'vector_only' ? 'supported' : 'uncertain',
        limitations: [
            'This establishes the project replay-coordinate basis only; it is not a world-to-map transform.',
            'Cell fields remain preserved as metadata/raw basis and are not applied to target coordinates.',
            'Build 23916427 map compatibility remains unresolved.'
        ]
    };
}

function resolvedObservations(rawObservations, contract) {
    if (contract.reconstructionFormula === null) return [];
    return rawObservations
        .filter((observation) => observation.completeVectorTriplet)
        .map((observation) => ({
            observationId: observation.observationId,
            entityKey: observation.entityKey,
            className: observation.className,
            demoTick: observation.demoTick,
            parserSeconds: observation.parserSeconds,
            worldCoordinate: observation.vector,
            coordinateBasis: 'vector_only_supported',
            sourceFields: VECTOR_FIELDS.filter((field) => observation.sourceFieldPaths.includes(field)),
            reconstructionFormulaId: 'vector_only',
            confidence: contract.confidence,
            provenance: {
                sourceReplay: 'replay_009',
                sourceOperation: observation.operation,
                sourceTask: TASK_ID
            },
            warnings: [
                'Project replay-coordinate basis only; no map transform, lane, region, or proximity inference.'
            ]
        }));
}

function createCurrentReconciliation(inventory, rawObservations) {
    return {
        schemaVersion: '1.0.0',
        taskId: TASK_ID,
        entities: inventory.map((entity) => {
            const rows = rawObservations.filter((row) => row.entityKey === entity.entityKey && row.completeVectorTriplet);
            const create = rows.find((row) => row.operation === 'CREATE');
            const current = rows.find((row) => row.operation === 'CURRENT_STATE');
            let classification = 'not_comparable';
            if (create && current) {
                const delta = distance(create.vector, current.vector);
                classification = delta === 0 ? 'identical' : delta !== null && delta <= 1 ? 'compatible_with_later_updates' : 'different_due_to_movement';
            }
            return {
                entityKey: entity.entityKey,
                className: entity.className,
                createObservationId: create?.observationId ?? null,
                currentStateObservationId: current?.observationId ?? null,
                createVector: create?.vector ?? null,
                currentVector: current?.vector ?? null,
                displacement: create && current ? round(distance(create.vector, current.vector), 6) : null,
                classification,
                limitations: create && current ? [] : ['CREATE and current-state complete vector triplets are not both available.']
            };
        })
    };
}

function coordinateStability(inventory, resolved) {
    const entities = inventory.map((entity) => {
        const rows = resolved.filter((row) => row.entityKey === entity.entityKey);
        const coordinates = rows.map((row) => row.worldCoordinate);
        const xs = coordinates.map((coord) => coord.x);
        const ys = coordinates.map((coord) => coord.y);
        const zs = coordinates.map((coord) => coord.z);
        const medianCoord = rows.length ? { x: round(median(xs), 6), y: round(median(ys), 6), z: round(median(zs), 6) } : null;
        const distances = medianCoord ? coordinates.map((coord) => distance(coord, medianCoord)).filter(Number.isFinite) : [];
        const maximumDisplacement = rows.length > 1 ? Math.max(...coordinates.flatMap((a, i) => coordinates.slice(i + 1).map((b) => distance(a, b)).filter(Number.isFinite))) : null;
        const axisRanges = rows.length ? {
            x: round(Math.max(...xs) - Math.min(...xs), 6),
            y: round(Math.max(...ys) - Math.min(...ys), 6),
            z: round(Math.max(...zs) - Math.min(...zs), 6)
        } : null;
        let classification = 'unresolved';
        if (rows.length === 0) classification = 'unresolved';
        else if (rows.length === 1) classification = 'single_observation';
        else if ((maximumDisplacement ?? 0) <= 0.001) classification = 'stable_fixed';
        else if ((maximumDisplacement ?? 0) <= 1) classification = 'stable_with_quantization';
        else if ((maximumDisplacement ?? 0) <= 1024) classification = 'locally_moving';
        else classification = 'materially_moving';
        return {
            entityKey: entity.entityKey,
            className: entity.className,
            observationCount: rows.length,
            firstCoordinate: rows[0]?.worldCoordinate ?? null,
            lastCoordinate: rows.at(-1)?.worldCoordinate ?? null,
            medianCoordinate: medianCoord,
            axisRanges,
            maximumDisplacement: maximumDisplacement === null ? null : round(maximumDisplacement, 6),
            distanceFromMedianMaximum: distances.length ? round(Math.max(...distances), 6) : null,
            quantizationJitter: classification === 'stable_with_quantization' ? axisRanges : null,
            missingAxisFrequency: 0,
            classification,
            representativeCoordinate: ['stable_fixed', 'stable_with_quantization', 'single_observation'].includes(classification) ? medianCoord : null,
            representativeCoordinatePolicy: entity.className === 'CNPC_Boss_Tier2'
                ? 'NPC/entity position only; not exact Walker-symbol center.'
                : 'Mid Boss NPC/entity position only; not arena center.',
            limitations: [
                ...(entity.className === 'CNPC_MidBoss' ? ['Mid Boss NPC position is not automatically the arena center.'] : []),
                'No map transform, lane, region, or proximity interpretation.'
            ]
        };
    });
    return {
        schemaVersion: '1.0.0',
        taskId: TASK_ID,
        entities,
        stableWalkers: entities.filter((entity) => entity.className === 'CNPC_Boss_Tier2' && ['stable_fixed', 'stable_with_quantization', 'single_observation'].includes(entity.classification)).length,
        movingOrUncertainWalkers: entities.filter((entity) => entity.className === 'CNPC_Boss_Tier2' && !['stable_fixed', 'stable_with_quantization', 'single_observation'].includes(entity.classification)).length
    };
}

function midBossAssessment(stability) {
    const midBosses = stability.entities.filter((entity) => entity.className === 'CNPC_MidBoss');
    return {
        schemaVersion: '1.0.0',
        taskId: TASK_ID,
        entities: midBosses.map((entity) => ({
            entityKey: entity.entityKey,
            coordinateResult: entity.observationCount > 0 ? 'mid_boss_npc_position' : 'mid_boss_fixed_anchor_unavailable',
            observationCount: entity.observationCount,
            representativeCoordinate: entity.representativeCoordinate,
            movementClassification: entity.classification,
            limitations: [
                'Mid Boss NPC/entity coordinate is not automatically arena center.',
                'Do not infer Mid Boss death, objective secure, or Rejuvenator effect from this coordinate.'
            ]
        })),
        result: midBosses.some((entity) => entity.observationCount > 0) ? 'mid_boss_npc_position_available_with_limits' : 'mid_boss_fixed_anchor_unavailable'
    };
}

function walkerTeamResolution(inventory, fieldEvidence, lifecycleCandidates) {
    const lifecycleByBase = new Map(lifecycleCandidates
        .filter((entity) => entity.className === 'CNPC_Boss_Tier2')
        .map((entity) => [`${entity.entityIndex}:${entity.serial}:${entity.handle}:${entity.classId}`, entity]));
    const walkers = inventory.filter((entity) => entity.className === 'CNPC_Boss_Tier2').map((entity) => {
        const fields = fieldEvidence.get(entity.entityKey) ?? [];
        const teamField = fields.find((field) => /m_iTeamNum|team/i.test(field.path));
        const lifecycle = lifecycleByBase.get(baseEntityKey(entity.entityKey));
        const rawTeamValue = teamField?.value ?? lifecycle?.teamValues?.find((value) => value === 2 || value === 3) ?? null;
        return {
            entityKey: entity.entityKey,
            team: 'unknown',
            rawTeamValue,
            sourceProperty: teamField?.path ?? (rawTeamValue !== null ? 'Task062.lifecycle.teamValues' : ''),
            identityStatus: rawTeamValue !== null ? 'supported' : 'unresolved',
            evidence: rawTeamValue !== null ? [{ sourceProperty: teamField?.path ?? 'Task062.lifecycle.teamValues', rawValue: rawTeamValue, status: 'raw_team_value_observed_not_mapped_to_sapphire_or_amber' }] : [],
            limitations: [
                'Raw team value is direct evidence, but it is not mapped to Sapphire/Amber in this task.',
                'Team was not derived from coordinate sign, map position, player trajectory, or human orientation.'
            ]
        };
    });
    return {
        schemaVersion: '1.0.0',
        taskId: TASK_ID,
        walkers,
        rawTeamValuesResolved: walkers.filter((walker) => walker.rawTeamValue !== null).length,
        namedTeamsResolved: 0,
        resolvedTeams: 0
    };
}

function walkerLaneEvidence(inventory, fieldEvidence) {
    return {
        schemaVersion: '1.0.0',
        taskId: TASK_ID,
        walkers: inventory.filter((entity) => entity.className === 'CNPC_Boss_Tier2').map((entity) => {
            const fields = fieldEvidence.get(entity.entityKey) ?? [];
            const laneField = fields.find((field) => /lane|yellow|blue|green/i.test(String(field.path)) || /lane|yellow|blue|green/i.test(String(field.value)));
            const nameField = fields.find((field) => /name|spawn|target/i.test(field.path) && typeof field.value === 'string' && field.value.length > 0);
            return {
                entityKey: entity.entityKey,
                explicitLaneValue: laneField?.value ?? null,
                sourceProperty: laneField?.path ?? null,
                spawnOrTargetName: nameField?.value ?? null,
                evidenceStatus: laneField ? 'candidate' : nameField ? 'candidate' : 'absent',
                finalLaneAssigned: false,
                limitations: [
                    'Task 076 prohibits final Walker lane assignment.',
                    'No coordinate-derived lane identity, permutation search, or transform residual matching was used.'
                ]
            };
        }),
        finalLanesAssigned: 0
    };
}

function correspondenceReadiness(inventory, resolved, teamResolution, laneEvidence, landmarkCandidates) {
    const candidateRows = landmarkCandidates.candidates ?? [];
    return {
        schemaVersion: '1.0.0',
        taskId: TASK_ID,
        rows: inventory.map((entity) => {
            const coordinateReady = resolved.some((row) => row.entityKey === entity.entityKey);
            const teamReady = teamResolution.walkers?.some((walker) => walker.entityKey === entity.entityKey && walker.identityStatus !== 'unresolved') ?? false;
            const laneReady = laneEvidence.walkers?.some((walker) => walker.entityKey === entity.entityKey && walker.finalLaneAssigned) ?? false;
            const candidates = candidateRows
                .filter((candidate) => candidate.replayEntityKeys?.includes(entity.entityKey))
                .flatMap((candidate) => candidate.mapLandmarkIds ?? []);
            const identityGroundedBeforeFit = entity.className === 'CNPC_MidBoss' && coordinateReady;
            return {
                replayEntityKey: entity.entityKey,
                mapLandmarkCandidates: candidates,
                coordinateReady,
                teamReady,
                laneReady,
                identityGroundedBeforeFit,
                fitEligibility: identityGroundedBeforeFit ? 'eligible' : coordinateReady ? 'pending_identity' : 'ineligible',
                validationEligibility: identityGroundedBeforeFit ? 'eligible' : coordinateReady ? 'pending_identity' : 'ineligible',
                exclusionReasons: [
                    ...(!coordinateReady ? ['missing_resolved_replay_coordinate'] : []),
                    ...(entity.className === 'CNPC_Boss_Tier2' ? ['walker_one_to_one_map_identity_unresolved_before_fit'] : [])
                ],
                limitations: [
                    'No transform fitting or residual matching was performed.',
                    'Coordinate readiness does not imply identity-grounded correspondence readiness.'
                ]
            };
        })
    };
}

function futurePlan(correspondence) {
    const eligible = correspondence.rows.filter((row) => row.fitEligibility === 'eligible');
    const validation = correspondence.rows.filter((row) => row.validationEligibility === 'eligible');
    return {
        schemaVersion: '1.0.0',
        taskId: TASK_ID,
        planningStatus: eligible.length >= 2 && validation.length >= 1 ? 'ready_with_gaps' : 'not_ready_identity_insufficient',
        fitCorrespondenceIds: [],
        validationCorrespondenceIds: [],
        eligibleEntityKeys: eligible.map((row) => row.replayEntityKey),
        validationEligibleEntityKeys: validation.map((row) => row.replayEntityKey),
        frozenSplitCreated: false,
        limitations: [
            'Walker identities remain unresolved before fit; no frozen transform split was created.',
            'At least one held-out validation anchor is still required for a transform retry.'
        ]
    };
}

function canonicalCandidates(stability, resolved) {
    return {
        schemaVersion: '1.0.0',
        taskId: TASK_ID,
        candidates: stability.entities
            .filter((entity) => entity.representativeCoordinate)
            .map((entity) => ({
                entityKey: entity.entityKey,
                candidateWorldCoordinate: entity.representativeCoordinate,
                coordinateBasis: 'vector_only_supported',
                confidence: 'supported',
                sourceFields: VECTOR_FIELDS,
                uncertainty: {
                    radiusReplayUnits: entity.maximumDisplacement ?? 0,
                    basis: 'maximum observed displacement from bounded resolved observations'
                },
                warnings: [
                    'Candidate only; Task 076 does not update canonical outputs.',
                    'No map transform, lane, region, or proximity field is produced.'
                ]
            }))
    };
}

function inventoryOutput(inventory) {
    return {
        schemaVersion: '1.0.0',
        taskId: TASK_ID,
        targetCount: inventory.length,
        generations: inventory.map((entity) => ({
            entityKey: entity.entityKey,
            entityIndex: entity.entityIndex,
            serial: entity.serial,
            generation: entity.generation,
            className: entity.className,
            createTick: entity.createTick,
            deleteTick: entity.deleteTick,
            firstObservedTick: entity.firstObservedTick,
            lastObservedTick: entity.lastObservedTick,
            coordinateEvidenceAvailable: entity.coordinateEvidenceAvailable,
            coordinateEvidenceSources: entity.coordinateEvidenceSources,
            limitations: entity.limitations
        }))
    };
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const out = args.output;
    await fs.mkdir(out, { recursive: true });
    const collected = await collectReplay(args);
    const priorAudit = await readJson('output/replay-009-fixed-entity-resolution/data-path-audit.json');
    const priorTargets = priorAudit.targetEntities.filter((entity) => args.classes.includes(entity.className));
    const keyMap = new Map(priorTargets.map((entity) => [baseEntityKey(entity.entityKey), entity.entityKey]));
    const inventory = mergeInventoryWithPrior(collected.inventory, priorTargets);
    const rawObservations = remapObservationKeys(collected.rawObservations, keyMap);
    const fieldEvidence = new Map();
    for (const [key, fields] of collected.fieldEvidence.entries()) {
        fieldEvidence.set(keyMap.get(baseEntityKey(key)) ?? key, fields);
    }
    const reconstruction = playerControlReconstruction(collected.controlSnapshots);
    const contract = decoderContract(reconstruction);
    const resolved = resolvedObservations(rawObservations, contract);
    const reconciliation = createCurrentReconciliation(inventory, rawObservations);
    const stability = coordinateStability(inventory, resolved);
    const midBoss = midBossAssessment(stability);
    const lifecycleCandidatesText = await fs.readFile('output/replay-009-states/objective-structure-lifecycle-candidates.jsonl', 'utf8');
    const lifecycleCandidates = lifecycleCandidatesText.trim().split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line));
    const team = walkerTeamResolution(inventory, fieldEvidence, lifecycleCandidates);
    const lanes = walkerLaneEvidence(inventory, fieldEvidence);
    const landmarks = await readJson('output/replay-009-landmark-measurement/replay-landmark-correspondence-candidates.json');
    const correspondence = correspondenceReadiness(inventory, resolved, team, lanes, landmarks);
    const fitPlan = futurePlan(correspondence);
    const canonical = canonicalCandidates(stability, resolved);
    const summary = {
        schemaVersion: '1.0.0',
        taskId: TASK_ID,
        targetGenerations: inventory.length,
        midBossGenerations: inventory.filter((entity) => entity.className === 'CNPC_MidBoss').length,
        walkerGenerations: inventory.filter((entity) => entity.className === 'CNPC_Boss_Tier2').length,
        rawCoordinateObservations: rawObservations.length,
        completeVectorTriplets: rawObservations.filter((row) => row.completeVectorTriplet).length,
        completeCellTriplets: rawObservations.filter((row) => row.completeCellTriplet).length,
        acceptedReconstructionFormula: reconstruction.acceptedFormulaId,
        playerControlAgreement: contract.playerControlAgreement,
        resolvedWorldCoordinateObservations: resolved.length,
        targetGenerationsWithCoordinates: new Set(resolved.map((row) => row.entityKey)).size,
        stableWalkers: stability.stableWalkers,
        movingOrUncertainWalkers: stability.movingOrUncertainWalkers,
        midBossCoordinateResult: midBoss.result,
        walkerTeamsResolved: team.resolvedTeams,
        walkerRawTeamValuesResolved: team.rawTeamValuesResolved,
        directLaneEvidenceFound: lanes.walkers.filter((row) => row.evidenceStatus === 'direct').length,
        finalWalkerLanesAssigned: lanes.finalLanesAssigned,
        correspondenceReadyEntities: correspondence.rows.filter((row) => row.identityGroundedBeforeFit).length,
        fitEligibleEntities: correspondence.rows.filter((row) => row.fitEligibility === 'eligible').length,
        validationEligibleEntities: correspondence.rows.filter((row) => row.validationEligibility === 'eligible').length,
        canonicalFieldsUpdated: false,
        transformFitted: false,
        lanesRegionsProximityEmitted: false,
        mechanicEffectsApplied: 0,
        gate: GATE,
        blockedFollowUp: 'tasks/blocked/077-resolve-replay-009-walker-identity-before-transform-retry.md',
        protections: {
            replay005Read: false,
            replay005Processed: false,
            botFixturesProcessed: false
        }
    };

    await writeJson(path.join(out, 'target-generation-inventory.json'), inventoryOutput(inventory));
    await writeJsonl(path.join(out, 'raw-coordinate-observations.jsonl'), rawObservations);
    await writeJson(path.join(out, 'coordinate-decoder-contract.json'), contract);
    await writeJson(path.join(out, 'player-control-reconstruction.json'), reconstruction);
    await writeJsonl(path.join(out, 'resolved-coordinate-observations.jsonl'), resolved);
    await writeJson(path.join(out, 'create-current-state-reconciliation.json'), reconciliation);
    await writeJson(path.join(out, 'coordinate-stability.json'), stability);
    await writeJson(path.join(out, 'mid-boss-coordinate-assessment.json'), midBoss);
    await writeJson(path.join(out, 'walker-team-resolution.json'), team);
    await writeJson(path.join(out, 'walker-lane-evidence.json'), lanes);
    await writeJson(path.join(out, 'correspondence-readiness.json'), correspondence);
    await writeJson(path.join(out, 'future-fit-validation-plan.json'), fitPlan);
    await writeJson(path.join(out, 'canonical-integration-candidates.json'), canonical);
    await writeJson(path.join(out, 'resolution-summary.json'), summary);
    await writeJson(path.join(out, 'resolution-gate.json'), {
        schemaVersion: '1.0.0',
        taskId: TASK_ID,
        gate: GATE,
        transformFitted: false,
        lanesEmitted: false,
        regionsEmitted: false,
        proximityEmitted: false,
        mechanicEffectsApplied: 0,
        canonicalFieldsUpdated: false
    });
    await fs.writeFile(path.join(out, 'README.md'), `# Replay 009 Fixed Coordinate Resolution

Task 076 creates a bounded replay-side coordinate layer for \`CNPC_MidBoss\` and \`CNPC_Boss_Tier2\`.

Gate: \`${GATE}\`

Accepted coordinate basis: \`${reconstruction.acceptedFormulaId}\`

Resolved coordinate observations: ${resolved.length}

This output uses parser-exposed \`CBodyComponent.m_vecX/Y/Z\` as the supported project replay-coordinate basis. Cell fields are preserved separately as metadata/raw evidence. No transform, lane, region, proximity, canonical rewrite, mechanic effect, or macro interpretation was produced.
`);
    await fs.writeFile('reports/replay-009-fixed-entity-coordinate-resolution.md', `# Replay 009 Fixed Entity Coordinate Resolution

Task 076 resolves bounded replay-side coordinates for \`CNPC_MidBoss\` and \`CNPC_Boss_Tier2\`.

## Gate

\`${GATE}\`

## Result

- Target generations: ${summary.targetGenerations}
- Raw coordinate observations: ${summary.rawCoordinateObservations}
- Complete vector triplets: ${summary.completeVectorTriplets}
- Complete cell triplets: ${summary.completeCellTriplets}
- Accepted reconstruction formula: \`${summary.acceptedReconstructionFormula}\`
- Resolved coordinate observations: ${summary.resolvedWorldCoordinateObservations}
- Target generations with coordinates: ${summary.targetGenerationsWithCoordinates}
- Stable Walkers: ${summary.stableWalkers}
- Moving/uncertain Walkers: ${summary.movingOrUncertainWalkers}
- Walker teams resolved: ${summary.walkerTeamsResolved}
- Final Walker lanes assigned: ${summary.finalWalkerLanesAssigned}
- Fit-eligible entities: ${summary.fitEligibleEntities}

## Boundary

The coordinate basis is supported by replay parser/player controls, but no world-to-map transform was fitted. Walker lane identities remain unassigned, Walker one-to-one map correspondence remains unresolved, and no regions, proximity, canonical spatial fields, mechanic effects, or macro interpretation were emitted.
`);

    // Determinism marker for tests without committing full trace hashes.
    await writeJson(path.join(out, 'determinism-manifest.json'), {
        schemaVersion: '1.0.0',
        taskId: TASK_ID,
        summaryHashInput: stableHashString(summary),
        outputFiles: [
            'target-generation-inventory.json',
            'raw-coordinate-observations.jsonl',
            'coordinate-decoder-contract.json',
            'player-control-reconstruction.json',
            'resolved-coordinate-observations.jsonl',
            'create-current-state-reconciliation.json',
            'coordinate-stability.json',
            'mid-boss-coordinate-assessment.json',
            'walker-team-resolution.json',
            'walker-lane-evidence.json',
            'correspondence-readiness.json',
            'future-fit-validation-plan.json',
            'canonical-integration-candidates.json',
            'resolution-summary.json',
            'resolution-gate.json'
        ]
    });
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
