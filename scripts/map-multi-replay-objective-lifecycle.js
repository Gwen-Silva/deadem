import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

import { Logger, Player } from 'deadem';

const REPLAYS = [
    { replayId: 'replay_001', file: 'samples/partida_001.dem' },
    { replayId: 'replay_002', file: 'samples/partida_002.dem' },
    { replayId: 'replay_003', file: 'samples/partida_003.dem' },
    { replayId: 'replay_004', file: 'samples/partida_004.dem' }
];
const OBJECTIVE_CLASSES = [
    'CNPC_TrooperBoss',
    'CNPC_BarrackBoss',
    'CNPC_Boss_Tier2',
    'CNPC_Boss_Tier3',
    'CNPC_BaseDefenseSentry',
    'CNPC_MidBoss',
    'CNPC_Neutral_SinnersSacrifice',
    'CCitadel_HeroTestOrbSpawner',
    'CCitadel_PickupItemSpawner'
];
const HEALTH_FIELDS = [ 'm_iHealth', 'm_iMaxHealth', 'm_iHealthMax', 'm_flHealth', 'm_flMaxHealth' ];
const STATE_FIELDS = [ 'm_bAlive', 'm_lifeState', 'm_bDormant', 'm_bInvulnerable', 'm_bProtected', 'm_iPhase', 'm_iState', 'm_eState', 'm_iLane', 'm_iTeamNum' ];
const POSITION_FIELDS = [ 'CBodyComponent.m_vecX', 'CBodyComponent.m_vecY', 'CBodyComponent.m_vecZ' ];
const OUTPUT_SIZE_LIMIT = 10 * 1024 * 1024;

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});

async function main() {
    const topology = await loadTopology();
    const results = [];
    for (const replay of REPLAYS) results.push(await processReplay(replay, topology));
    const identityMap = buildIdentityMap(results);
    const comparison = buildComparison(results);
    const damageReconciliation = await buildDamageReconciliation(results);
    const review = buildReviewSamples(results, damageReconciliation);
    const gate = buildGate(results, comparison, damageReconciliation);
    await writeJson('output/replays/multi-replay-objective-identity-map.json', identityMap);
    await writeJson('output/replays/multi-replay-objective-lifecycle-comparison.json', comparison);
    await writeJson('output/replays/objective-damage-reconciliation.json', damageReconciliation);
    await writeJson('output/replays/objective-review-samples.json', review);
    await writeJson('output/replays/objective-lifecycle-gate.json', gate);
    await writeReport(results, comparison, damageReconciliation, gate);
    await validateOutputs([
        ...results.flatMap(result => [ result.inventoryFile, result.timelineFile, ...result.timelineShardFiles, result.eventsFile, result.validationFile ]),
        'output/replays/multi-replay-objective-identity-map.json',
        'output/replays/multi-replay-objective-lifecycle-comparison.json',
        'output/replays/objective-damage-reconciliation.json',
        'output/replays/objective-review-samples.json',
        'output/replays/objective-lifecycle-gate.json',
        'reports/multi-replay-objective-lifecycle.md'
    ]);
    console.log(`objective lifecycle gate: ${gate.gateResult}`);
    for (const result of results) console.log(`${result.replayId}: ${result.inventory.entities.length} objectives, ${result.events.events.length} lifecycle events`);
}

async function loadTopology() {
    const profile = JSON.parse(await fs.readFile('output/replay-lane-axis-topology-profile.json', 'utf8'));
    const lanes = profile.laneAxes.map(axis => ({
        laneAxis: axis.neutralLaneId,
        sourceRoleLane: axis.sourceRoleLane,
        polyline: axis.polyline.map(point => ({ x: Number(point.x), y: Number(point.y), z: Number(point.z ?? 0) }))
    }));
    return {
        lanes,
        roleLaneToAxis: new Map(lanes.map(lane => [ Number(lane.sourceRoleLane), lane.laneAxis ]))
    };
}

async function processReplay(replay, topology) {
    const player = new Player(undefined, Logger.NOOP);
    const outputDir = path.join('output', 'replays', replay.replayId);
    try {
        await player.load(createReadStream(replay.file));
        const firstTickRaw = player.getFirstTick();
        const effectiveFirstTick = firstTickRaw < 0 ? 0 : firstTickRaw;
        const lastTick = player.getLastTick();
        const tickRate = player.getDemo().server?.tickRate ?? 64;
        const durationSeconds = Math.floor((lastTick - effectiveFirstTick) / tickRate);
        const fieldAudit = new Map();
        const objectiveStates = new Map();
        const timelineRows = [];
        const inventoryEntities = new Map();
        await player.seekToTick(effectiveFirstTick);
        for (let second = 0; second <= durationSeconds; second++) {
            const targetTick = Math.min(lastTick, Math.round(effectiveFirstTick + second * tickRate));
            await advanceToTick(player, targetTick);
            const rows = snapshotObjectives(player, replay.replayId, second, player.getCurrentTick(), topology, fieldAudit);
            for (const row of rows) {
                timelineRows.push(row);
                mergeInventory(inventoryEntities, row);
                objectiveStates.set(row.objectiveId, row);
            }
        }
        const events = buildLifecycleEvents(replay.replayId, timelineRows);
        const inventory = buildInventory(replay.replayId, inventoryEntities, fieldAudit, events);
        const validation = validateReplay(replay.replayId, inventory, events, timelineRows);
        const inventoryFile = path.join(outputDir, 'objective-entity-inventory.json');
        const timelineFile = path.join(outputDir, 'objective-timeline.jsonl');
        const eventsFile = path.join(outputDir, 'objective-lifecycle-events.json');
        const validationFile = path.join(outputDir, 'objective-validation.json');
        await writeJson(inventoryFile, inventory);
        const timelineShardFiles = await writeTimelineShards(outputDir, replay.replayId, timelineRows, timelineFile);
        await writeJson(eventsFile, events);
        await writeJson(validationFile, validation);
        return { replayId: replay.replayId, inventory, timelineRows, events, validation, inventoryFile, timelineFile, timelineShardFiles, eventsFile, validationFile };
    } finally {
        await player.dispose();
    }
}

async function advanceToTick(player, targetTick) {
    while (player.getCurrentTick() < targetTick) {
        const advanced = await player.nextTick();
        if (!advanced) break;
    }
}

function snapshotObjectives(player, replayId, second, tick, topology, fieldAudit) {
    const rows = [];
    for (const className of OBJECTIVE_CLASSES) {
        const entities = player.getDemo().getEntitiesByClassName(className);
        for (const entity of entities) {
            const fields = readObjectiveFields(entity);
            const position = fields.position;
            const laneInfo = classifyLane(position, fields.lane, className, topology);
            const objectiveType = objectiveTypeFor(className);
            const objectiveId = stableObjectiveId(objectiveType, fields.team, laneInfo.laneAxis, laneInfo.laneProgress, position, className, fields.lane);
            const state = stateFor(fields);
            const quality = state.health === null && position.x === null ? 'missing' : 'direct';
            updateFieldAudit(fieldAudit, className, fields.raw);
            rows.push({
                replayId,
                objectiveId,
                gameTimeSeconds: second,
                tick,
                entityClass: className,
                handle: normalize(entity.handle),
                team: fields.team,
                objectiveType,
                laneAxis: laneInfo.laneAxis,
                laneProgress: laneInfo.laneProgress,
                position,
                state,
                evidence: evidenceFor(fields, laneInfo),
                quality,
                validationFlags: validationFlagsForRow(className, fields, state, laneInfo)
            });
        }
    }
    return rows.sort((left, right) => left.objectiveId.localeCompare(right.objectiveId));
}

function readObjectiveFields(entity) {
    const raw = {};
    for (const field of [ ...POSITION_FIELDS, ...HEALTH_FIELDS, ...STATE_FIELDS ]) raw[field] = normalize(entity.getField(field));
    let flattened = {};
    try {
        flattened = entity.unpackFlattened?.() ?? {};
    } catch {
        flattened = {};
    }
    const interestingFlattened = Object.fromEntries(Object.entries(flattened)
        .filter(([ key ]) => !/Pred/i.test(key))
        .filter(([ key ]) => /(^m_.*(health|alive|life|dormant|phase|state|shield|protect|invuln|team|lane|damage)|CBodyComponent\.m_vec[XYZ])/i.test(key))
        .slice(0, 80)
        .map(([ key, value ]) => [ key, normalize(value) ]));
    for (const [ key, value ] of Object.entries(interestingFlattened)) if (!(key in raw)) raw[key] = value;
    const position = {
        x: firstNumber(raw['CBodyComponent.m_vecX'], raw.m_vecX),
        y: firstNumber(raw['CBodyComponent.m_vecY'], raw.m_vecY),
        z: firstNumber(raw['CBodyComponent.m_vecZ'], raw.m_vecZ)
    };
    const health = firstNumber(raw.m_iHealth, raw.m_flHealth);
    const maxHealth = firstNumber(raw.m_iMaxHealth, raw.m_iHealthMax, raw.m_flMaxHealth);
    return {
        raw,
        position,
        team: firstNumber(raw.m_iTeamNum, raw.m_iTeam),
        lane: firstNumber(raw.m_iLane, raw.m_iPrimaryLane),
        health,
        maxHealth,
        alive: normalize(raw.m_bAlive),
        lifeState: normalize(raw.m_lifeState),
        dormant: normalize(raw.m_bDormant),
        protected: normalize(raw.m_bProtected ?? raw.m_bInvulnerable),
        phase: normalize(raw.m_iPhase ?? raw.m_iState ?? raw.m_eState)
    };
}

function classifyLane(position, roleLane, className, topology) {
    const roleLaneAxis = topology.roleLaneToAxis.get(Number(roleLane)) ?? null;
    if (className.includes('MidBoss') || className.includes('Sinners') || className.includes('Spawner')) {
        return { laneAxis: null, laneProgress: null, nearestLane: roleLaneAxis, nearestDistance: null, source: 'central_or_neutral_class' };
    }
    if (position.x === null || position.y === null) return { laneAxis: roleLaneAxis, laneProgress: null, nearestLane: roleLaneAxis, nearestDistance: null, source: 'role_lane_only' };
    const projections = topology.lanes.map(lane => projectToPolyline(position, lane));
    projections.sort((left, right) => left.distance - right.distance);
    const nearest = projections[0] ?? null;
    const laneAxis = roleLaneAxis ?? nearest?.laneAxis ?? null;
    return {
        laneAxis,
        laneProgress: laneAxis === nearest?.laneAxis ? nearest.progress : projections.find(item => item.laneAxis === laneAxis)?.progress ?? null,
        nearestLane: nearest?.laneAxis ?? null,
        nearestDistance: nearest?.distance ?? null,
        source: roleLaneAxis !== null ? 'role_lane_plus_geometry' : 'nearest_structural_axis'
    };
}

function projectToPolyline(point, lane) {
    let best = { laneAxis: lane.laneAxis, distance: Number.POSITIVE_INFINITY, progress: null };
    let total = 0;
    const lengths = [];
    for (let index = 0; index < lane.polyline.length - 1; index++) {
        const length = distance2d(lane.polyline[index], lane.polyline[index + 1]);
        lengths.push(length);
        total += length;
    }
    let prior = 0;
    for (let index = 0; index < lane.polyline.length - 1; index++) {
        const start = lane.polyline[index];
        const end = lane.polyline[index + 1];
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const lengthSquared = dx * dx + dy * dy;
        const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
        const projected = { x: start.x + t * dx, y: start.y + t * dy };
        const dist = distance2d(point, projected);
        if (dist < best.distance) best = { laneAxis: lane.laneAxis, distance: round(dist), progress: total === 0 ? null : round((prior + lengths[index] * t) / total) };
        prior += lengths[index];
    }
    return best;
}

function stateFor(fields) {
    const alive = typeof fields.alive === 'boolean'
        ? fields.alive
        : fields.health === null ? null : fields.health > 0;
    return {
        alive,
        health: fields.health,
        maxHealth: fields.maxHealth,
        healthRatio: fields.health !== null && fields.maxHealth > 0 ? round(fields.health / fields.maxHealth) : null,
        phase: fields.phase,
        protected: fields.protected,
        dormant: fields.dormant
    };
}

function stableObjectiveId(objectiveType, team, laneAxis, laneProgress, position, className, roleLane) {
    const teamPart = team === null || team === 0 ? 'neutral' : `team_${team}`;
    if (laneAxis !== null) {
        const side = laneProgress === null ? coordinateBucket(position) : progressBucket(laneProgress);
        return `${laneAxis}_${teamPart}_${objectiveType}_${side}`;
    }
    if (objectiveType === 'patron') return `${teamPart}_patron`;
    if (objectiveType === 'mid_boss') return 'central_midboss';
    return `${teamPart}_${objectiveType}_${className.toLowerCase()}_${roleLane ?? 'no_lane'}_${coordinateBucket(position)}`;
}

function progressBucket(progress) {
    if (progress < 0.2) return 'outer_a';
    if (progress < 0.4) return 'inner_a';
    if (progress < 0.6) return 'middle';
    if (progress < 0.8) return 'inner_b';
    return 'outer_b';
}

function coordinateBucket(position) {
    if (position.x === null || position.y === null) return 'unknown_position';
    return `${Math.round(position.x / 100) * 100}_${Math.round(position.y / 100) * 100}`;
}

function objectiveTypeFor(className) {
    if (className === 'CNPC_TrooperBoss') return 'guardian';
    if (className === 'CNPC_Boss_Tier2') return 'walker';
    if (className === 'CNPC_BarrackBoss') return 'barrack';
    if (className === 'CNPC_Boss_Tier3') return 'patron';
    if (className === 'CNPC_BaseDefenseSentry') return 'base_guardian';
    if (className === 'CNPC_MidBoss') return 'mid_boss';
    if (className.includes('Sinners')) return 'urn_related';
    if (className.includes('Spawner')) return 'spawner';
    return 'unresolved_objective';
}

function evidenceFor(fields, laneInfo) {
    const evidence = [];
    if (fields.team !== null) evidence.push({ source: 'm_iTeamNum', value: fields.team, role: 'team_ownership' });
    if (fields.lane !== null) evidence.push({ source: 'm_iLane', value: fields.lane, role: 'structural_lane_role' });
    if (fields.health !== null) evidence.push({ source: 'health_field', value: fields.health, role: 'current_health' });
    if (fields.maxHealth !== null) evidence.push({ source: 'max_health_field', value: fields.maxHealth, role: 'max_health' });
    if (laneInfo.laneAxis !== null) evidence.push({ source: laneInfo.source, value: laneInfo.laneAxis, role: 'lane_axis_assignment' });
    return evidence;
}

function validationFlagsForRow(className, fields, state, laneInfo) {
    const flags = [];
    if (fields.health === null) flags.push('missing_health_field');
    if (fields.maxHealth === null) flags.push('missing_max_health_field');
    if (fields.team === null) flags.push('missing_team_field');
    if (!className.includes('MidBoss') && !className.includes('Sinners') && !className.includes('Spawner') && laneInfo.laneAxis === null) flags.push('lane_axis_unresolved');
    if (state.health !== null && state.maxHealth !== null && state.health > state.maxHealth) flags.push('health_exceeds_max_health');
    if (state.health !== null && state.health < 0) flags.push('negative_health');
    return flags;
}

function mergeInventory(inventoryEntities, row) {
    const existing = inventoryEntities.get(row.objectiveId) ?? {
        objectiveId: row.objectiveId,
        replayId: row.replayId,
        entityClass: row.entityClass,
        handles: new Set(),
        team: row.team,
        objectiveType: row.objectiveType,
        laneAxis: row.laneAxis,
        laneProgressValues: [],
        positions: [],
        firstObservedTime: row.gameTimeSeconds,
        lastObservedTime: row.gameTimeSeconds,
        healthFields: new Set(),
        maxHealthFields: new Set(),
        stateFields: new Set(),
        observedHealthValues: [],
        classification: classifyObjective(row),
        confidence: 'medium',
        uncertainties: new Set()
    };
    existing.handles.add(String(row.handle));
    existing.firstObservedTime = Math.min(existing.firstObservedTime, row.gameTimeSeconds);
    existing.lastObservedTime = Math.max(existing.lastObservedTime, row.gameTimeSeconds);
    if (row.laneProgress !== null) existing.laneProgressValues.push(row.laneProgress);
    if (row.position.x !== null) existing.positions.push(row.position);
    if (row.state.health !== null) {
        existing.healthFields.add('health_field');
        existing.observedHealthValues.push(row.state.health);
    }
    if (row.state.maxHealth !== null) existing.maxHealthFields.add('max_health_field');
    for (const flag of row.validationFlags) existing.uncertainties.add(flag);
    for (const evidence of row.evidence) existing.stateFields.add(evidence.source);
    inventoryEntities.set(row.objectiveId, existing);
}

function classifyObjective(row) {
    if ([ 'guardian', 'walker', 'barrack', 'patron', 'base_guardian' ].includes(row.objectiveType)) return 'confirmed_objective';
    if ([ 'mid_boss', 'urn_related' ].includes(row.objectiveType)) return 'probable_objective';
    if (row.objectiveType === 'spawner') return 'neutral_entity';
    return 'unresolved';
}

function buildInventory(replayId, inventoryEntities, fieldAudit, events) {
    const entities = Array.from(inventoryEntities.values()).map(entity => ({
        objectiveId: entity.objectiveId,
        replayId: entity.replayId,
        entityClass: entity.entityClass,
        handles: Array.from(entity.handles).sort(),
        team: entity.team,
        objectiveType: entity.objectiveType,
        laneAxis: entity.laneAxis,
        laneProgress: median(entity.laneProgressValues),
        position: medianPosition(entity.positions),
        firstObservedTime: entity.firstObservedTime,
        lastObservedTime: entity.lastObservedTime,
        healthFields: Array.from(entity.healthFields).sort(),
        maxHealthFields: Array.from(entity.maxHealthFields).sort(),
        aliveDeadFields: Array.from(entity.stateFields).filter(field => /alive|life|health/i.test(field)).sort(),
        stateOrPhaseFields: Array.from(entity.stateFields).filter(field => /phase|state|protect|dormant/i.test(field)).sort(),
        damageRelatedFields: [],
        observedHealthSummary: numericSummary(entity.observedHealthValues),
        classification: entity.classification,
        spawnDespawnBehavior: lifecycleBehavior(events.events.filter(event => event.objectiveId === entity.objectiveId)),
        crossReplayCorrespondence: 'stable_id_components_available',
        confidence: entity.uncertainties.size === 0 ? 'high' : 'medium',
        uncertainties: Array.from(entity.uncertainties).sort()
    })).sort((left, right) => left.objectiveId.localeCompare(right.objectiveId));
    return {
        schemaVersion: 1,
        kind: 'objective_entity_inventory',
        replayId,
        entities,
        fieldAudit: Object.fromEntries(fieldAudit.entries()),
        classificationCounts: countBy(entities, entity => entity.classification),
        replay005Protection: { processed: false, status: 'preserved' }
    };
}

function buildLifecycleEvents(replayId, rows) {
    const events = [];
    for (const objectiveRows of groupBy(rows, row => row.objectiveId).values()) {
        const sorted = objectiveRows.slice().sort((left, right) => left.gameTimeSeconds - right.gameTimeSeconds);
        if (sorted.length === 0) continue;
        events.push(eventFrom('objective_spawned', replayId, sorted[0], null, sorted[0], 'high'));
        let lowHealthSeen = false;
        for (let index = 1; index < sorted.length; index++) {
            const previous = sorted[index - 1];
            const current = sorted[index];
            if (previous.state.health !== null && current.state.health !== null && current.state.health < previous.state.health) {
                events.push(eventFrom('objective_took_damage', replayId, current, previous, current, 'medium'));
            }
            if (!lowHealthSeen && current.state.healthRatio !== null && current.state.healthRatio <= 0.25 && current.state.health > 0) {
                lowHealthSeen = true;
                events.push(eventFrom('objective_entered_low_health', replayId, current, previous, current, 'medium'));
            }
            if (isAlive(previous) === true && isAlive(current) === false) {
                events.push(eventFrom('objective_destroyed', replayId, current, previous, current, 'high'));
            }
            if (previous.state.phase !== current.state.phase && current.state.phase !== null) {
                events.push(eventFrom('objective_phase_changed', replayId, current, previous, current, 'medium'));
            }
            if (previous.state.protected !== current.state.protected && current.state.protected !== null) {
                events.push(eventFrom(current.state.protected ? 'objective_became_protected' : 'objective_lost_protection', replayId, current, previous, current, 'medium'));
            }
            if (isAlive(previous) === false && isAlive(current) === true) {
                events.push(eventFrom('objective_respawned', replayId, current, previous, current, 'medium'));
            }
        }
        events.push(eventFrom('objective_disappeared', replayId, sorted.at(-1), sorted.at(-1), null, 'low'));
    }
    return {
        schemaVersion: 1,
        kind: 'objective_lifecycle_events',
        replayId,
        events: events.map((event, index) => ({ ...event, eventId: `${replayId}_objective_${String(index + 1).padStart(5, '0')}` })),
        replay005Protection: { processed: false, status: 'preserved' }
    };
}

function eventFrom(type, replayId, row, prior, current, confidence) {
    return {
        eventId: null,
        eventType: type,
        objectiveId: row.objectiveId,
        replayId,
        gameTimeSeconds: row.gameTimeSeconds,
        tick: row.tick,
        priorState: prior?.state ?? null,
        newState: current?.state ?? null,
        position: row.position,
        laneAxis: row.laneAxis,
        evidenceSources: row.evidence,
        confidence,
        flags: row.validationFlags
    };
}

function validateReplay(replayId, inventory, events, rows) {
    const errors = [];
    const warnings = [];
    const seen = new Set();
    for (const entity of inventory.entities) {
        if (seen.has(entity.objectiveId)) errors.push({ type: 'duplicate_objective_id', objectiveId: entity.objectiveId });
        seen.add(entity.objectiveId);
        if (entity.laneAxis !== null && entity.objectiveType === 'mid_boss') errors.push({ type: 'central_objective_assigned_to_lane', objectiveId: entity.objectiveId });
        if (entity.uncertainties.length > 0) warnings.push({ type: 'entity_uncertainties', objectiveId: entity.objectiveId, flags: entity.uncertainties });
    }
    for (const row of rows) {
        if (row.state.health !== null && row.state.health < 0) errors.push({ type: 'negative_health', objectiveId: row.objectiveId, time: row.gameTimeSeconds });
        if (row.state.health !== null && row.state.maxHealth !== null && row.state.health > row.state.maxHealth) warnings.push({ type: 'health_exceeds_max_health', objectiveId: row.objectiveId, time: row.gameTimeSeconds });
    }
    for (const [ objectiveId, objectiveEvents ] of groupBy(events.events, event => event.objectiveId)) {
        const sorted = objectiveEvents.slice().sort((left, right) => left.gameTimeSeconds - right.gameTimeSeconds);
        for (let index = 1; index < sorted.length; index++) {
            if (sorted[index].gameTimeSeconds < sorted[index - 1].gameTimeSeconds) errors.push({ type: 'lifecycle_out_of_order', objectiveId });
        }
    }
    return {
        schemaVersion: 1,
        kind: 'objective_validation',
        replayId,
        checks: {
            uniqueObjectiveIds: errors.every(error => error.type !== 'duplicate_objective_id'),
            chronologicalLifecycle: errors.every(error => error.type !== 'lifecycle_out_of_order'),
            nonNegativeHealth: errors.every(error => error.type !== 'negative_health'),
            laneAssociatedStructuresHaveOneLane: inventory.entities.filter(entity => [ 'guardian', 'walker', 'barrack' ].includes(entity.objectiveType)).every(entity => entity.laneAxis !== null),
            centralObjectivesNotAssignedToLane: errors.every(error => error.type !== 'central_objective_assigned_to_lane'),
            replay005Protection: { processed: false, status: 'preserved' }
        },
        errors,
        warnings
    };
}

function buildIdentityMap(results) {
    const identities = new Map();
    for (const result of results) {
        for (const entity of result.inventory.entities) {
            const crossReplayId = crossReplayObjectiveId(entity);
            const item = identities.get(crossReplayId) ?? {
                crossReplayObjectiveId: crossReplayId,
                objectiveType: entity.objectiveType,
                laneAxis: entity.laneAxis,
                team: entity.team,
                members: [],
                confidence: 'medium',
                unresolvedQuestions: []
            };
            item.members.push({ replayId: result.replayId, objectiveId: entity.objectiveId, entityClass: entity.entityClass, position: entity.position });
            identities.set(crossReplayId, item);
        }
    }
    return {
        schemaVersion: 1,
        kind: 'multi_replay_objective_identity_map',
        identities: Array.from(identities.values()).sort((left, right) => left.crossReplayObjectiveId.localeCompare(right.crossReplayObjectiveId)),
        replay005Protection: { processed: false, status: 'preserved' }
    };
}

function crossReplayObjectiveId(entity) {
    const teamPart = entity.team === null || entity.team === 0 ? 'neutral' : `team_${entity.team}`;
    if (entity.laneAxis !== null) return `${entity.laneAxis}_${teamPart}_${entity.objectiveType}_${progressBucket(entity.laneProgress ?? 0.5)}`;
    return `${teamPart}_${entity.objectiveType}`;
}

function buildComparison(results) {
    return {
        schemaVersion: 1,
        kind: 'multi_replay_objective_lifecycle_comparison',
        replays: results.map(result => ({
            replayId: result.replayId,
            stableObjectiveCount: result.inventory.entities.length,
            classificationCounts: result.inventory.classificationCounts,
            guardianCount: result.inventory.entities.filter(entity => entity.objectiveType === 'guardian').length,
            walkerCount: result.inventory.entities.filter(entity => entity.objectiveType === 'walker').length,
            baseStructureCount: result.inventory.entities.filter(entity => [ 'barrack', 'base_guardian', 'patron' ].includes(entity.objectiveType)).length,
            patronCount: result.inventory.entities.filter(entity => entity.objectiveType === 'patron').length,
            midBossCount: result.inventory.entities.filter(entity => entity.objectiveType === 'mid_boss').length,
            urnRelatedCount: result.inventory.entities.filter(entity => entity.objectiveType === 'urn_related').length,
            lifecycleEvents: result.events.events.length,
            destructions: result.events.events.filter(event => event.eventType === 'objective_destroyed').length,
            validationErrors: result.validation.errors.length,
            validationWarnings: result.validation.warnings.length
        })),
        replay005Protection: { processed: false, status: 'preserved' }
    };
}

async function buildDamageReconciliation(results) {
    const replays = [];
    for (const result of results) {
        const counterDeltas = await readObjectiveDamageDeltas(result.replayId);
        const healthLossBySecond = new Map();
        for (const [ , rows ] of groupBy(result.timelineRows, row => row.objectiveId)) {
            const sorted = rows.slice().sort((left, right) => left.gameTimeSeconds - right.gameTimeSeconds);
            for (let index = 1; index < sorted.length; index++) {
                const previous = sorted[index - 1];
                const current = sorted[index];
                if (previous.state.health !== null && current.state.health !== null && current.state.health < previous.state.health) {
                    healthLossBySecond.set(current.gameTimeSeconds, round((healthLossBySecond.get(current.gameTimeSeconds) ?? 0) + previous.state.health - current.state.health));
                }
            }
        }
        const totalHealthLoss = round(Array.from(healthLossBySecond.values()).reduce((total, value) => total + value, 0));
        const totalObjectiveDamage = round(Array.from(counterDeltas.values()).reduce((total, value) => total + value, 0));
        const matchedSeconds = Array.from(healthLossBySecond.keys()).filter(second => (counterDeltas.get(second) ?? 0) > 0).length;
        replays.push({
            replayId: result.replayId,
            healthLossTotal: totalHealthLoss,
            objectiveDamageCounterTotal: totalObjectiveDamage,
            healthLossSeconds: healthLossBySecond.size,
            objectiveDamageSeconds: Array.from(counterDeltas.values()).filter(value => value > 0).length,
            matchedDamageSeconds: matchedSeconds,
            timingCorrelation: percent(matchedSeconds, healthLossBySecond.size),
            unexplainedHealthLoss: totalHealthLoss > 0 && totalObjectiveDamage === 0,
            counterWithoutVisibleHealthLoss: totalObjectiveDamage > 0 && totalHealthLoss === 0,
            note: 'Exact equality is not required; shields, granularity, multiple entities, or hidden mechanics may affect reconciliation.'
        });
    }
    return {
        schemaVersion: 1,
        kind: 'objective_damage_reconciliation',
        replays,
        replay005Protection: { processed: false, status: 'preserved' }
    };
}

async function readObjectiveDamageDeltas(replayId) {
    const manifest = JSON.parse(await fs.readFile(`output/replays/${replayId}/damage-healing-counter-timeline.json`, 'utf8'));
    const deltas = new Map();
    for (const shard of manifest.shards) {
        const content = await fs.readFile(shard.file, 'utf8');
        for (const line of content.trim().split(/\r?\n/)) {
            if (!line) continue;
            const row = JSON.parse(line);
            const value = Number(row.deltas?.m_iObjectiveDamage);
            if (Number.isFinite(value) && value > 0) deltas.set(row.gameTimeSeconds, round((deltas.get(row.gameTimeSeconds) ?? 0) + value));
        }
    }
    return deltas;
}

function buildReviewSamples(results, reconciliation) {
    const samples = [];
    for (const result of results) {
        const firstDestruction = result.events.events.find(event => event.eventType === 'objective_destroyed');
        if (firstDestruction) samples.push(sample(result.replayId, 'first_destruction', firstDestruction));
        for (const event of result.events.events.filter(event => event.eventType === 'objective_phase_changed').slice(0, 3)) samples.push(sample(result.replayId, 'phase_change', event));
        for (const entity of result.inventory.entities.filter(entity => entity.uncertainties.length > 0).slice(0, 5)) {
            samples.push({ replayId: result.replayId, category: 'unresolved_entity_state', objectiveId: entity.objectiveId, question: 'Determine whether this uncertainty materially affects objective lifecycle construction.', entitySummary: entity });
        }
    }
    for (const item of reconciliation.replays.filter(item => item.timingCorrelation < 50)) {
        samples.push({ replayId: item.replayId, category: 'objective_damage_mismatch', question: 'Inspect only if damage reconciliation materially blocks objective lifecycle use.', reconciliation: item });
    }
    return {
        schemaVersion: 1,
        kind: 'objective_review_samples',
        reviewRequiredNow: false,
        samples,
        replay005Protection: { processed: false, status: 'preserved' }
    };
}

function sample(replayId, category, event) {
    return {
        replayId,
        category,
        eventId: event.eventId,
        objectiveId: event.objectiveId,
        gameTimeSeconds: event.gameTimeSeconds,
        question: 'Review only if this case materially blocks canonical objective lifecycle construction.',
        eventSummary: { eventType: event.eventType, confidence: event.confidence, flags: event.flags }
    };
}

function buildGate(results, comparison, reconciliation) {
    const errors = results.reduce((total, result) => total + result.validation.errors.length, 0);
    const stableCounts = comparison.replays.map(replay => replay.stableObjectiveCount);
    const hasLaneStructures = comparison.replays.every(replay => replay.guardianCount > 0 && replay.walkerCount > 0 && replay.baseStructureCount > 0);
    const hasAnyDestruction = comparison.replays.some(replay => replay.destructions > 0);
    let gateResult = 'objective_sources_insufficient';
    if (errors === 0 && hasLaneStructures && hasAnyDestruction) gateResult = 'objective_lifecycle_ready_with_limitations';
    if (errors === 0 && hasLaneStructures && hasAnyDestruction && reconciliation.replays.every(replay => replay.timingCorrelation >= 75)) gateResult = 'objective_lifecycle_ready';
    return {
        schemaVersion: 1,
        kind: 'objective_lifecycle_gate',
        gateResult,
        evidence: {
            validationErrors: errors,
            stableObjectiveCountRange: range(stableCounts),
            laneStructuresPresent: hasLaneStructures,
            destructionEventsObserved: hasAnyDestruction,
            damageReconciliation: reconciliation.replays.map(item => ({ replayId: item.replayId, timingCorrelation: item.timingCorrelation }))
        },
        limitations: [
            'Objective classes are replay-observed and mapped to neutral objective types by structural role, not current-game assumptions.',
            'Objective damage counters are aggregate player counters and are not source-target objective attribution.',
            'Optional states such as protection, phase, urn, and Mid Boss lifecycle may be incomplete.'
        ],
        nextAllowedTask: gateResult.startsWith('objective_lifecycle_ready') ? 'unified_descriptive_match_state_timeline' : null,
        replay005Protection: { processed: false, status: 'preserved' },
        humanReviewRequired: false
    };
}

async function writeReport(results, comparison, reconciliation, gate) {
    const replayLines = comparison.replays.map(replay => `- ${replay.replayId}: ${replay.stableObjectiveCount} stable objectives, ${replay.guardianCount} guardians, ${replay.walkerCount} walkers, ${replay.baseStructureCount} base structures, ${replay.patronCount} patrons, ${replay.midBossCount} Mid Boss entities, ${replay.urnRelatedCount} urn-related entities, ${replay.lifecycleEvents} lifecycle events.`).join('\n');
    const damageLines = reconciliation.replays.map(replay => `- ${replay.replayId}: health loss ${replay.healthLossTotal}, objective-damage counters ${replay.objectiveDamageCounterTotal}, timing correlation ${replay.timingCorrelation}%.`).join('\n');
    const report = `# Multi-Replay Objective Lifecycle

## Scope

This task maps objective entities and lifecycle evidence for replays 001-004. It does not process replay 005, group fights, judge objective decisions, infer strategic intent, use semantic occupancy, or detect transitions.

## Objective classes discovered

${OBJECTIVE_CLASSES.map(className => `- \`${className}\``).join('\n')}

## Replay results

${replayLines}

## Damage reconciliation

${damageLines}

## Limits

- Objective names are neutral structural labels derived from replay evidence.
- Objective damage counters are aggregate player counters, not direct source-target attribution.
- Patron, Mid Boss, urn, protection, and phase fields remain limited where direct lifecycle state was not exposed.

## Gate

\`${gate.gateResult}\`
`;
    await fs.writeFile('reports/multi-replay-objective-lifecycle.md', report);
    await fs.writeFile('reports/latest.md', 'reports/multi-replay-objective-lifecycle.md\n');
}

function updateFieldAudit(fieldAudit, className, fields) {
    const record = fieldAudit.get(className) ?? {};
    for (const [ field, value ] of Object.entries(fields)) {
        const entry = record[field] ?? { observedRows: 0, missingRows: 0, examples: [], valueTypes: [] };
        if (value === null || value === undefined) entry.missingRows += 1;
        else {
            entry.observedRows += 1;
            const type = typeof value;
            if (!entry.valueTypes.includes(type)) entry.valueTypes.push(type);
            if (!entry.examples.some(example => JSON.stringify(example) === JSON.stringify(value)) && entry.examples.length < 5) entry.examples.push(value);
        }
        record[field] = entry;
    }
    fieldAudit.set(className, record);
}

function isAlive(row) {
    if (row.state.alive !== null) return row.state.alive;
    if (row.state.health !== null) return row.state.health > 0;
    return null;
}

function firstNumber(...values) {
    for (const value of values) {
        const number = Number(value);
        if (Number.isFinite(number)) return round(number);
    }
    return null;
}

function distance2d(left, right) {
    return Math.hypot(Number(left.x) - Number(right.x), Number(left.y) - Number(right.y));
}

function median(values) {
    const finite = values.filter(value => Number.isFinite(value)).sort((left, right) => left - right);
    if (finite.length === 0) return null;
    return finite[Math.floor(finite.length / 2)];
}

function medianPosition(values) {
    if (values.length === 0) return { x: null, y: null, z: null };
    return { x: median(values.map(value => value.x)), y: median(values.map(value => value.y)), z: median(values.map(value => value.z)) };
}

function numericSummary(values) {
    const finite = values.filter(value => Number.isFinite(value));
    if (finite.length === 0) return { count: 0, min: null, max: null, examples: [] };
    const examples = Array.from(new Set(finite)).slice(0, 5);
    return { count: finite.length, min: Math.min(...finite), max: Math.max(...finite), examples };
}

function lifecycleBehavior(events) {
    const types = new Set(events.map(event => event.eventType));
    if (types.has('objective_respawned')) return 'respawning_objective';
    if (types.has('objective_destroyed')) return 'destroyed_without_observed_respawn';
    return 'persistent_or_no_destroy_event_observed';
}

function countBy(values, keyFn) {
    const counts = {};
    for (const value of values) {
        const key = keyFn(value);
        counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
}

function groupBy(values, keyFn) {
    const groups = new Map();
    for (const value of values) {
        const key = keyFn(value);
        const group = groups.get(key) ?? [];
        group.push(value);
        groups.set(key, group);
    }
    return groups;
}

function range(values) {
    if (values.length === 0) return { min: null, max: null };
    return { min: Math.min(...values), max: Math.max(...values) };
}

function percent(value, total) {
    if (total === 0) return 0;
    return round((value / total) * 100);
}

function round(value) {
    if (!Number.isFinite(value)) return value;
    return Math.round(value * 1000) / 1000;
}

function normalize(value) {
    if (value === undefined) return null;
    if (typeof value === 'bigint') return value.toString();
    if (typeof value === 'number') return round(value);
    return value;
}

async function validateOutputs(files) {
    for (const file of files) {
        const stats = await fs.stat(file);
        if (stats.size > OUTPUT_SIZE_LIMIT) throw new Error(`${file} exceeds 10 MiB`);
        const content = await fs.readFile(file, 'utf8');
        if (file.endsWith('.json')) JSON.parse(content);
        if (file.endsWith('.jsonl')) for (const line of content.trim().split(/\r?\n/)) if (line) JSON.parse(line);
    }
}

async function writeJson(file, value) {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeTimelineShards(outputDir, replayId, rows, indexFile) {
    const shardDir = path.join(outputDir, 'objective-timeline-shards');
    await fs.mkdir(shardDir, { recursive: true });
    const shardFiles = [];
    for (const [ objectiveId, objectiveRows ] of groupBy(rows, row => row.objectiveId)) {
        const safeId = objectiveId.replace(/[^a-zA-Z0-9_-]/g, '_');
        const file = path.join(shardDir, `${safeId}.jsonl`);
        await writeJsonl(file, objectiveRows);
        shardFiles.push({ replayId, objectiveId, file, rows: objectiveRows.length });
    }
    await writeJsonl(indexFile, shardFiles.sort((left, right) => left.objectiveId.localeCompare(right.objectiveId)));
    return shardFiles.map(shard => shard.file);
}

async function writeJsonl(file, rows) {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, rows.map(row => JSON.stringify(row)).join('\n') + '\n');
}
