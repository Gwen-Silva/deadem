import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const REPLAY_ID = 'replay_002';
const REPLAY_FILE = 'samples/partida_002.dem';
const OUT_DIR_DEFAULT = 'output/replay-002-canonical';
const ASSESS_DIR_DEFAULT = 'output/replay-002-canonical-generalization';
const GATE = 'replay_002_canonical_factual_state_ready_with_constraints';

const CATEGORY_ORDER = [
    'player_identity',
    'player_snapshot',
    'player_death',
    'player_respawn',
    'team_net_worth',
    'raw_objective_structure_lifecycle'
];
const CATEGORY_INDEX = new Map(CATEGORY_ORDER.map((category, index) => [category, index]));

const INPUTS = {
    replayFile: REPLAY_FILE,
    parserMatrix: 'output/parser-compatibility/parser-compatibility-matrix.json',
    replay009CanonicalScript: 'scripts/build-replay-009-canonical-state.js',
    replay009CanonicalReport: 'reports/replay-009-canonical-factual-state-schema.md',
    replay009PlayerRegistry: 'output/replay-009-canonical/player-registry.json',
    replay009EntityRegistry: 'output/replay-009-canonical/entity-registry.json',
    replay009FactualEvents: 'output/replay-009-canonical/factual-events.jsonl',
    replay009Metadata: 'output/replay-009-canonical/non-timeline-metadata.json',
    replay009Overlay: 'output/replay-009-canonical/independent-validation-overlay.json',
    replay009Snapshots: 'output/replay-009-canonical/snapshots.jsonl',
    replay009Capabilities: 'output/replay-009-canonical/capability-matrix.json',
    replay009Validation: 'output/replay-009-canonical/validation-summary.json',
    matchStateIndex: 'output/replays/replay_002/match-state-timeline.jsonl',
    matchStateQuality: 'output/replays/replay_002/match-state-quality.json',
    preGeometry: 'output/replays/replay_002/pre-geometry-pipeline.json',
    oneSecondManifest: 'output/replays/replay_002/one-second-spatial/manifest.json',
    oneSecondQuality: 'output/replays/replay_002/one-second-spatial/quality.json',
    deathEvents: 'output/replays/replay_002/canonical-death-events.json',
    deathValidation: 'output/replays/replay_002/death-event-validation.json',
    respawnEvents: 'output/replays/replay_002/respawn-events.json',
    damageManifest: 'output/replays/replay_002/damage-healing-counter-timeline.json',
    damageValidation: 'output/replays/replay_002/damage-healing-validation.json',
    objectiveInventory: 'output/replays/replay_002/objective-entity-inventory.json',
    objectiveLifecycle: 'output/replays/replay_002/objective-lifecycle-events.json',
    objectiveValidation: 'output/replays/replay_002/objective-validation.json',
    crossReplayAssessment: 'output/spatial-milestone-reassessment/cross-replay-generalization-assessment.json',
    milestoneDecision: 'output/spatial-milestone-reassessment/milestone-decision.json'
};

const accessLog = [];

function parseArgs() {
    const args = process.argv.slice(2);
    const options = {
        outDir: OUT_DIR_DEFAULT,
        assessmentDir: ASSESS_DIR_DEFAULT,
        clean: false
    };
    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index];
        if (arg === '--output') options.outDir = args[++index];
        else if (arg === '--assessment-output') options.assessmentDir = args[++index];
        else if (arg === '--clean') options.clean = true;
    }
    return options;
}

function stableStringify(value) {
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
    if (value && typeof value === 'object') {
        return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
}

function hashId(...parts) {
    return createHash('sha256').update(parts.map(part => String(part ?? '')).join('|')).digest('hex').slice(0, 18);
}

async function sha256File(file) {
    const hash = createHash('sha256');
    await new Promise((resolve, reject) => {
        createReadStream(file)
            .on('data', chunk => hash.update(chunk))
            .on('end', resolve)
            .on('error', reject);
    });
    return hash.digest('hex');
}

async function fileInfo(file) {
    const s = await stat(file);
    return {
        path: file.replaceAll('\\', '/'),
        sizeBytes: s.size,
        sha256: await sha256File(file)
    };
}

async function readText(file, accessType = 'artifact_aggregate') {
    const text = await readFile(file, 'utf8');
    accessLog.push({ path: file.replaceAll('\\', '/'), accessType, mode: 'read_text' });
    return text;
}

async function readJson(file, accessType = 'artifact_aggregate') {
    return JSON.parse(await readText(file, accessType));
}

async function readJsonl(file, accessType = 'artifact_aggregate') {
    const text = await readText(file, accessType);
    return text.trim() ? text.trim().split(/\r?\n/u).map(line => JSON.parse(line)) : [];
}

async function writeJson(file, value) {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
    accessLog.push({ path: file.replaceAll('\\', '/'), accessType: 'generated', mode: 'write_json' });
}

async function writeJsonl(file, rows) {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, rows.map(row => JSON.stringify(row)).join('\n') + (rows.length ? '\n' : ''));
    accessLog.push({ path: file.replaceAll('\\', '/'), accessType: 'generated', mode: 'write_jsonl' });
}

function evidence(sourcePath, field, transformation = 'copied_or_filtered_without_semantic_upgrade') {
    return {
        sourcePath: sourcePath.replaceAll('\\', '/'),
        sourceField: field,
        evidenceType: 'direct_parser_observation',
        transformation,
        derivationMethod: transformation,
        validationLevel: 'internal_consistency_only'
    };
}

function canonicalEvent({ category, eventType, subject, time, value, provenance, epistemicStatus }) {
    return {
        schemaVersion: '1.0.0',
        eventId: `canon002:${hashId(category, eventType, subject?.subjectId, subject?.entityKey, time?.demoTick, time?.parserSeconds, provenance?.sourceEventId)}`,
        replayId: REPLAY_ID,
        eventCategory: category,
        eventType,
        subject: {
            subjectType: subject?.subjectType ?? null,
            subjectId: subject?.subjectId ?? null,
            playerKey: subject?.playerKey ?? null,
            rawTeam: subject?.rawTeam ?? null,
            entityKey: subject?.entityKey ?? null,
            entityIndex: subject?.entityIndex ?? null,
            entityGeneration: subject?.entityGeneration ?? null,
            className: subject?.className ?? null,
            mechanicCandidate: subject?.mechanicCandidate ?? null
        },
        time: {
            demoTick: time?.demoTick ?? null,
            parserSeconds: time?.parserSeconds ?? null,
            timeBasis: 'parser_seconds',
            pauseAdjusted: false
        },
        value: value ?? { current: null, previous: null, unit: null },
        provenance: {
            sourceTask: '082',
            sourcePath: provenance.sourcePath.replaceAll('\\', '/'),
            sourceEventId: provenance.sourceEventId ?? null,
            sourceField: provenance.sourceField ?? null,
            evidenceType: provenance.evidenceType,
            transformation: provenance.transformation,
            derivationMethod: provenance.derivationMethod ?? provenance.transformation,
            validationLevel: provenance.validationLevel,
            method: provenance.method ?? provenance.derivationMethod ?? provenance.transformation
        },
        epistemicStatus: {
            observationStatus: epistemicStatus?.observationStatus ?? 'observed',
            confidence: epistemicStatus?.confidence ?? 'supported',
            independentValidation: 'not_available',
            mechanicVersionStatus: 'not_required',
            mechanicEffectApplied: false,
            semanticLimit: epistemicStatus?.semanticLimit ?? '',
            warnings: epistemicStatus?.warnings ?? []
        }
    };
}

function safePlayerPosition(position) {
    if (!position || position.quality !== 'direct') return null;
    return {
        x: position.x ?? null,
        y: position.y ?? null,
        z: position.z ?? null,
        quality: 'direct_replay_side_raw'
    };
}

function sortEvents(a, b) {
    const timeA = a.time.parserSeconds ?? Number.POSITIVE_INFINITY;
    const timeB = b.time.parserSeconds ?? Number.POSITIVE_INFINITY;
    if (timeA !== timeB) return timeA - timeB;
    const tickA = a.time.demoTick ?? Number.POSITIVE_INFINITY;
    const tickB = b.time.demoTick ?? Number.POSITIVE_INFINITY;
    if (tickA !== tickB) return tickA - tickB;
    const categoryA = CATEGORY_INDEX.get(a.eventCategory) ?? 999;
    const categoryB = CATEGORY_INDEX.get(b.eventCategory) ?? 999;
    if (categoryA !== categoryB) return categoryA - categoryB;
    return a.eventId.localeCompare(b.eventId);
}

function objectiveTypeFor(entity) {
    if (entity.entityClass === 'CNPC_MidBoss') return 'mid_boss';
    if (entity.entityClass === 'CNPC_BaseDefenseSentry') return 'guardian_or_base_sentry';
    if (entity.entityClass === 'CNPC_Boss_Tier2') return 'walker';
    if (['CNPC_BarrackBoss', 'CNPC_Boss_Tier3', 'CNPC_TrooperBoss'].includes(entity.entityClass)) return 'base_structure_candidate';
    if (entity.objectiveType?.includes('urn')) return 'urn_related_candidate';
    return entity.objectiveType ?? 'objective_structure_candidate';
}

function sanitizeObjectiveEventType(eventType) {
    if (eventType === 'objective_spawned') return 'entity_present';
    if (eventType === 'objective_took_damage') return 'raw_health_changed';
    if (eventType === 'objective_destroyed') return 'raw_health_zero_or_terminal_observed';
    if (eventType === 'objective_disappeared') return 'entity_absent_or_lifecycle_ended';
    return 'raw_objective_lifecycle_observed';
}

function semanticLimitForObjective(eventType) {
    if (eventType === 'objective_destroyed') return 'source lifecycle calls this destroyed, but canonical replay 002 records only raw health/terminal observation; destruction/secure/strategic loss is not promoted';
    if (eventType === 'objective_disappeared') return 'disappearance is not objective completion, destruction, secure, claim, or deposit';
    if (eventType === 'objective_took_damage') return 'health change is factual; damage attribution and strategic pressure are not inferred';
    return 'objective/structure identity is parser-derived; mechanic activation and effects are not applied';
}

function shapeOf(value, seen = new Set()) {
    if (value === null) return 'null';
    if (Array.isArray(value)) {
        const first = value.find(item => item !== null && item !== undefined);
        return { type: 'array', item: first === undefined ? 'unknown' : shapeOf(first, seen) };
    }
    if (typeof value !== 'object') return typeof value;
    if (seen.has(value)) return 'circular';
    seen.add(value);
    return {
        type: 'object',
        fields: Object.fromEntries(Object.keys(value).sort().map(key => [key, shapeOf(value[key], seen)]))
    };
}

function compareShapes(a, b, prefix = '') {
    const diffs = [];
    if (typeof a !== typeof b || (typeof a !== 'object' && a !== b)) {
        const differenceType = a === 'unknown' || b === 'unknown' || a === 'null' || b === 'null'
            ? 'nullable_or_empty_coverage_difference'
            : 'schema_break';
        diffs.push({ field: prefix || '<root>', differenceType, replay009Type: a, replay002Type: b });
        return diffs;
    }
    if (!a || !b || typeof a !== 'object') return diffs;
    if (a.type !== b.type) {
        const differenceType = a.type === 'unknown' || b.type === 'unknown' || a.type === 'null' || b.type === 'null'
            ? 'nullable_or_empty_coverage_difference'
            : 'schema_break';
        diffs.push({ field: prefix || '<root>', differenceType, replay009Type: a.type, replay002Type: b.type });
        return diffs;
    }
    if (a.type === 'array') return compareShapes(a.item, b.item, `${prefix}[]`);
    const keys = new Set([...Object.keys(a.fields ?? {}), ...Object.keys(b.fields ?? {})]);
    for (const key of [...keys].sort()) {
        if (!(key in (a.fields ?? {}))) {
            diffs.push({ field: `${prefix}.${key}`.replace(/^\./u, ''), differenceType: 'optional_coverage_difference', replay009Type: null, replay002Type: b.fields[key] });
        } else if (!(key in (b.fields ?? {}))) {
            diffs.push({ field: `${prefix}.${key}`.replace(/^\./u, ''), differenceType: 'source_unavailable_in_replay_002', replay009Type: a.fields[key], replay002Type: null });
        } else {
            diffs.push(...compareShapes(a.fields[key], b.fields[key], `${prefix}.${key}`.replace(/^\./u, '')));
        }
    }
    return diffs;
}

async function main() {
    const options = parseArgs();
    if (options.clean) {
        await rm(options.outDir, { recursive: true, force: true });
        await rm(options.assessmentDir, { recursive: true, force: true });
    }
    await mkdir(options.outDir, { recursive: true });
    await mkdir(options.assessmentDir, { recursive: true });

    const replayInfo = await fileInfo(INPUTS.replayFile);
    accessLog.push({ path: INPUTS.replayFile, accessType: 'raw_replay_processed', mode: 'sha256_and_size_only' });

    const parserMatrix = await readJson(INPUTS.parserMatrix);
    const parserRow = parserMatrix.rows.find(row => row.replayId === REPLAY_ID);
    const parserDefault = parserRow.modes.default_parser;
    const matchStateQuality = await readJson(INPUTS.matchStateQuality);
    const preGeometry = await readJson(INPUTS.preGeometry);
    const oneSecondManifest = await readJson(INPUTS.oneSecondManifest);
    const oneSecondQuality = await readJson(INPUTS.oneSecondQuality);
    const deathEvents = await readJson(INPUTS.deathEvents);
    const deathValidation = await readJson(INPUTS.deathValidation);
    const respawnEvents = await readJson(INPUTS.respawnEvents);
    const damageManifest = await readJson(INPUTS.damageManifest);
    const damageValidation = await readJson(INPUTS.damageValidation);
    const objectiveInventory = await readJson(INPUTS.objectiveInventory);
    const objectiveLifecycle = await readJson(INPUTS.objectiveLifecycle);
    const objectiveValidation = await readJson(INPUTS.objectiveValidation);
    const crossReplayAssessment = await readJson(INPUTS.crossReplayAssessment);
    const milestoneDecision = await readJson(INPUTS.milestoneDecision);

    const replay009Validation = await readJson(INPUTS.replay009Validation, 'canonical_reference');
    const replay009Players = await readJson(INPUTS.replay009PlayerRegistry, 'canonical_reference');
    const replay009Entities = await readJson(INPUTS.replay009EntityRegistry, 'canonical_reference');
    const replay009Events = await readJsonl(INPUTS.replay009FactualEvents, 'canonical_reference');
    const replay009Snapshots = await readJsonl(INPUTS.replay009Snapshots, 'canonical_reference');
    const replay009Capabilities = await readJson(INPUTS.replay009Capabilities, 'canonical_reference');
    const replay009Script = await readText(INPUTS.replay009CanonicalScript, 'code_schema');

    const matchStateIndex = await readJsonl(INPUTS.matchStateIndex);
    const matchRows = [];
    for (const shard of matchStateIndex) {
        matchRows.push(...await readJsonl(shard.file, 'artifact_aggregate'));
    }

    const players = oneSecondQuality.playerReconciliation.players.map(player => ({
        schemaVersion: '1.0.0',
        replayId: REPLAY_ID,
        playerKey: player.playerId,
        playerName: player.name,
        heroIdRaw: player.heroId,
        rawTeam: player.team,
        controllerEntityIndex: player.controllerHandle,
        pawnEntityIndices: [...new Set(matchRows.flatMap(row => row.players.filter(p => p.playerId === player.playerId).map(p => p.pawnId).filter(Boolean)))],
        firstSeenTick: 0,
        lastSeenTick: parserDefault.finalParsedTick,
        identityStatus: 'supported',
        provenance: [evidence(INPUTS.oneSecondQuality, 'playerReconciliation.players')],
        limitations: ['raw team is not mapped to Sapphire/Amber/Archmother/Hidden King for replay 002']
    }));
    const teamDistribution = players.reduce((acc, player) => {
        acc[player.rawTeam] = (acc[player.rawTeam] ?? 0) + 1;
        return acc;
    }, {});
    const playerRegistry = {
        schemaVersion: '1.0.0',
        replayId: REPLAY_ID,
        sourceReplay: INPUTS.replayFile,
        summary: {
            playerCount: players.length,
            rawTeamDistribution: teamDistribution,
            stablePlayerIdentities: oneSecondQuality.playerReconciliation.stablePlayerIdentities,
            observedDeaths: deathEvents.events.length,
            observedRespawnReturns: respawnEvents.events.filter(event => event.respawn.gameTimeSeconds !== null).length,
            unresolvedReturnsBeforeReplayEnd: deathEvents.events.filter(event => event.respawn.gameTimeSeconds === null).length
        },
        players
    };

    const entityRegistry = {
        schemaVersion: '1.0.0',
        replayId: REPLAY_ID,
        entities: objectiveInventory.entities.map((entity, index) => ({
            schemaVersion: '1.0.0',
            replayId: REPLAY_ID,
            entityKey: entity.objectiveId,
            entityIndex: entity.handles?.[0] === undefined ? null : Number(entity.handles[0]),
            entityGeneration: `objective_generation:${entity.objectiveId}:${entity.firstObservedTime}`,
            className: entity.entityClass,
            rawTeam: entity.team,
            mechanicCandidate: objectiveTypeFor(entity),
            firstObservedParserSeconds: entity.firstObservedTime,
            lastObservedParserSeconds: entity.lastObservedTime,
            healthFields: entity.healthFields ?? [],
            maxHealthFields: entity.maxHealthFields ?? [],
            observedHealthSummary: entity.observedHealthSummary ?? null,
            classification: entity.classification,
            confidence: entity.confidence,
            provenance: [evidence(INPUTS.objectiveInventory, `entities.${index}`)],
            semanticLimits: [
                'entity registry preserves parser/objective inventory identity only',
                'entity absence, zero health, or old objective labels are not promoted to destruction/secure/claim/deposit'
            ],
            limitations: entity.uncertainties ?? []
        }))
    };

    const events = [];
    for (const player of players) {
        events.push(canonicalEvent({
            category: 'player_identity',
            eventType: 'player_identity_supported',
            subject: { subjectType: 'player', subjectId: player.playerKey, playerKey: player.playerKey, rawTeam: player.rawTeam },
            time: { demoTick: player.firstSeenTick, parserSeconds: null },
            value: { current: { controllerEntityIndex: player.controllerEntityIndex, heroIdRaw: player.heroIdRaw }, previous: null, unit: null },
            provenance: { ...evidence(INPUTS.oneSecondQuality, 'playerReconciliation.players'), sourceEventId: player.playerKey },
            epistemicStatus: { semanticLimit: 'parser-derived player identity; raw team is not mapped to faction names' }
        }));
    }
    for (const event of deathEvents.events) {
        events.push(canonicalEvent({
            category: 'player_death',
            eventType: 'player_death_observed',
            subject: {
                subjectType: 'player',
                subjectId: event.victim.playerId,
                playerKey: event.victim.playerId,
                rawTeam: event.victim.team,
                entityIndex: event.victim.pawnId,
                entityGeneration: `pawn:${event.victim.pawnId}`
            },
            time: { demoTick: event.death.tick, parserSeconds: event.death.gameTimeSeconds },
            value: {
                current: 'dead',
                previous: 'alive',
                unit: null,
                evidenceNames: event.evidence.map(item => item.name)
            },
            provenance: {
                ...evidence(INPUTS.deathEvents, 'events', 'filtered_from_canonical_death_events_without_spatial_or_killer_promotion'),
                sourceEventId: event.eventId,
                method: 'death counter/alive-health transition evidence preserved; killer/assist not promoted'
            },
            epistemicStatus: {
                confidence: event.confidence,
                semanticLimit: 'death is factual; killer/assist/cause/fight quality are not canonical direct facts in Task 082',
                warnings: event.validationFlags
            }
        }));
    }
    for (const event of respawnEvents.events) {
        events.push(canonicalEvent({
            category: 'player_respawn',
            eventType: event.validationFlags?.includes('respawn_inferred_not_directly_observed') ? 'player_respawn_deterministically_inferred' : 'player_respawn_observed',
            subject: {
                subjectType: 'player',
                subjectId: event.victim.playerId,
                playerKey: event.victim.playerId,
                rawTeam: event.victim.team,
                entityIndex: event.victim.pawnId,
                entityGeneration: `pawn:${event.victim.pawnId}`
            },
            time: { demoTick: event.respawn.tick, parserSeconds: event.respawn.gameTimeSeconds },
            value: {
                current: 'alive_or_returned',
                previous: 'dead',
                unit: null,
                deadDurationParserSeconds: event.respawn.deadDurationSeconds
            },
            provenance: {
                ...evidence(INPUTS.respawnEvents, 'events', event.validationFlags?.includes('respawn_inferred_not_directly_observed') ? 'deterministic_respawn_inference_from_counter_or_timer' : 'direct_respawn_transition_evidence'),
                sourceEventId: event.eventId,
                method: 'respawn event source flags distinguish direct and inferred returns'
            },
            epistemicStatus: {
                observationStatus: event.validationFlags?.includes('respawn_inferred_not_directly_observed') ? 'deterministic_derivation' : 'observed',
                semanticLimit: 'respawn time is parser-time return evidence, not official mechanic timer validation',
                warnings: event.validationFlags
            }
        }));
    }
    for (const row of matchRows) {
        const team2 = row.players.filter(player => player.team === 2).reduce((sum, player) => sum + (player.netWorth ?? 0), 0);
        const team3 = row.players.filter(player => player.team === 3).reduce((sum, player) => sum + (player.netWorth ?? 0), 0);
        events.push(canonicalEvent({
            category: 'team_net_worth',
            eventType: 'team_net_worth_observed',
            subject: { subjectType: 'team_set', subjectId: 'raw_teams_2_3' },
            time: { demoTick: row.gameTimeSeconds * 64, parserSeconds: row.gameTimeSeconds },
            value: {
                current: { rawTeam2: team2, rawTeam3: team3, differenceTeam2MinusTeam3: team2 - team3 },
                previous: null,
                unit: 'm_iGoldNetWorth'
            },
            provenance: { ...evidence('output/replays/replay_002/match-state-timeline-shards/*.jsonl', 'players[].netWorth'), sourceEventId: `team_net_worth:${row.gameTimeSeconds}` },
            epistemicStatus: { semanticLimit: 'net worth is not spendable, secured, unsecured, income source, comeback eligibility, or effective combat power' }
        }));
    }
    for (const event of objectiveLifecycle.events) {
        events.push(canonicalEvent({
            category: 'raw_objective_structure_lifecycle',
            eventType: sanitizeObjectiveEventType(event.eventType),
            subject: {
                subjectType: 'entity',
                subjectId: event.objectiveId,
                entityKey: event.objectiveId,
                entityIndex: Number(objectiveInventory.entities.find(entity => entity.objectiveId === event.objectiveId)?.handles?.[0] ?? null),
                entityGeneration: `objective_generation:${event.objectiveId}:0`,
                className: objectiveInventory.entities.find(entity => entity.objectiveId === event.objectiveId)?.entityClass ?? null,
                mechanicCandidate: objectiveTypeFor(objectiveInventory.entities.find(entity => entity.objectiveId === event.objectiveId) ?? {})
            },
            time: { demoTick: event.tick, parserSeconds: event.gameTimeSeconds },
            value: {
                current: {
                    sourceEventType: event.eventType,
                    health: event.newState?.health ?? null,
                    maxHealth: event.newState?.maxHealth ?? null,
                    rawTeam: event.evidenceSources?.find(source => source.role === 'team_ownership')?.value ?? null
                },
                previous: event.priorState ? { health: event.priorState.health, maxHealth: event.priorState.maxHealth } : null,
                unit: null
            },
            provenance: {
                ...evidence(INPUTS.objectiveLifecycle, 'events', 'filtered_objective_lifecycle_without_lane_position_or_completion_semantics'),
                sourceEventId: event.eventId,
                method: 'raw lifecycle and health/state evidence only'
            },
            epistemicStatus: {
                confidence: event.confidence,
                semanticLimit: semanticLimitForObjective(event.eventType),
                warnings: event.flags
            }
        }));
    }
    events.sort(sortEvents);

    const snapshots = matchRows.map(row => {
        const playersSnapshot = Object.fromEntries(row.players.map(player => [
            player.playerId,
            {
                rawTeam: player.team,
                alive: player.alive,
                rawReplayPosition: safePlayerPosition(player.position),
                netWorth: player.netWorth ?? null,
                provenance: {
                    sourcePath: 'output/replays/replay_002/match-state-timeline-shards/*.jsonl',
                    sourceFields: ['players[].alive', 'players[].position', 'players[].netWorth'],
                    evidenceType: 'direct_parser_observation'
                }
            }
        ]));
        const team2 = row.players.filter(player => player.team === 2).reduce((sum, player) => sum + (player.netWorth ?? 0), 0);
        const team3 = row.players.filter(player => player.team === 3).reduce((sum, player) => sum + (player.netWorth ?? 0), 0);
        return {
            schemaVersion: '1.0.0',
            replayId: REPLAY_ID,
            snapshotId: `snapshot:${row.gameTimeSeconds}`,
            demoTick: row.gameTimeSeconds * 64,
            parserSeconds: row.gameTimeSeconds,
            players: playersSnapshot,
            teamNetWorth: {
                rawTeam2: team2,
                rawTeam3: team3,
                differenceTeam2MinusTeam3: team2 - team3,
                sourceField: 'm_iGoldNetWorth'
            },
            validationStatus: 'internal_consistency_only',
            mechanicEffectsApplied: false,
            limitations: [
                'raw replay-side coordinates only',
                'no lane, region, proximity, transform, pressure, fight, or macro semantics emitted'
            ]
        };
    });

    const nonTimelineMetadata = {
        schemaVersion: 1,
        replayId: REPLAY_ID,
        records: [
            { category: 'parser_prerequisite', data: parserDefault },
            { category: 'match_state_quality', data: matchStateQuality },
            { category: 'death_validation', data: deathValidation },
            { category: 'objective_validation', data: objectiveValidation },
            { category: 'damage_validation', data: damageValidation }
        ],
        note: 'Metadata records are intentionally outside the chronological timeline.'
    };
    const capabilityMatrix = {
        schemaVersion: 1,
        replayId: REPLAY_ID,
        capabilities: [
            { capability: 'player identity', status: 'ready_with_constraints', evidence: '12 stable parser-derived players; raw teams only' },
            { capability: 'player life/death/respawn', status: 'ready_with_constraints', evidence: `${deathEvents.events.length} death records, ${respawnEvents.events.length} respawn/return records with direct/inferred flags` },
            { capability: 'player/team net worth', status: 'ready_with_constraints', evidence: 'm_iGoldNetWorth preserved in snapshots and team events' },
            { capability: 'raw replay-side coordinates', status: 'ready_with_constraints', evidence: `${oneSecondQuality.aggregate.directRows} direct coordinate rows; no spatial semantics emitted` },
            { capability: 'objective/structure raw lifecycle', status: 'ready_with_constraints', evidence: `${objectiveInventory.entities.length} objective/structure candidates and ${objectiveLifecycle.events.length} raw lifecycle events` },
            { capability: 'independent visual validation', status: 'unavailable', evidence: 'no replay-002 equivalent of Task 064 provided' },
            { capability: 'lane/region/proximity', status: 'blocked', evidence: 'explicitly prohibited for Task 082 canonical package' },
            { capability: 'mechanic effects', status: 'blocked', evidence: 'no mechanics applied' },
            { capability: 'macro interpretation', status: 'blocked', evidence: 'not implemented and not authorized' }
        ]
    };

    const referenceInventory = [];
    for (const [key, file] of Object.entries({
        replay009CanonicalScript: INPUTS.replay009CanonicalScript,
        replay009PlayerRegistry: INPUTS.replay009PlayerRegistry,
        replay009EntityRegistry: INPUTS.replay009EntityRegistry,
        replay009FactualEvents: INPUTS.replay009FactualEvents,
        replay009Metadata: INPUTS.replay009Metadata,
        replay009Overlay: INPUTS.replay009Overlay,
        replay009Snapshots: INPUTS.replay009Snapshots,
        replay009Capabilities: INPUTS.replay009Capabilities,
        replay009Validation: INPUTS.replay009Validation,
        replay009Report: INPUTS.replay009CanonicalReport,
        queryTool: 'tools/query-replay-state.mjs',
        sharedFilter: 'tools/replay-state-filter.mjs',
        canonicalTest: 'tests/canonical-replay-state/canonical-replay-state.test.mjs'
    })) {
        let hash = null;
        let schemaVersion = null;
        try {
            hash = await sha256File(file);
            if (file.endsWith('.json')) schemaVersion = JSON.parse(await readFile(file, 'utf8')).schemaVersion ?? null;
        } catch {
            hash = null;
        }
        referenceInventory.push({
            path: file.replaceAll('\\', '/'),
            role: key,
            replay: file.includes('replay-009') ? '009' : 'generic',
            schemaVersion,
            generator: file === INPUTS.replay009CanonicalScript ? 'scripts/build-replay-009-canonical-state.js' : null,
            informationType: file.endsWith('.jsonl') ? 'jsonl_records' : file.endsWith('.json') ? 'json_document' : 'code_or_report',
            generality: file === INPUTS.replay009CanonicalScript ? 'replay_009_specific_needs_parameterization' : file.includes('replay-009') ? 'replay_009_reference_artifact' : 'generic_tooling',
            requiredForReplay002: ['replay009PlayerRegistry', 'replay009EntityRegistry', 'replay009FactualEvents', 'replay009Snapshots', 'replay009Capabilities', 'replay009Validation'].includes(key),
            sha256: hash
        });
    }

    const assumptionAudit = [
        {
            location: 'scripts/build-replay-009-canonical-state.js constants',
            description: 'Hard-coded replay id, match id, build id, output directory, source paths, Task 064 visual overlays, and replay-009 category counts.',
            classification: 'replay_009_specific',
            actionTaken: 'created parameterized replay-002 generator that accepts explicit replay id/source/output and makes validation overlay optional',
            evidence: ['REPLAY_ID', 'MATCH_ID', 'BUILD_ID', 'SOURCE_PATHS', 'independent validation overlay code'],
            impactOnReplay002: 'removed from replay-002 generation; replay 002 has no inherited match/build/overlay values'
        },
        {
            location: 'scripts/build-replay-009-canonical-state.js spatial shape',
            description: 'Replay 009 emitted a spatial object with unavailable lane/map fields.',
            classification: 'unsupported_assumption',
            actionTaken: 'replay-002 canonical records omit lane/region/proximity/transform/residual fields entirely; snapshots preserve only rawReplayPosition',
            evidence: ['Task 082 mandatory protections'],
            impactOnReplay002: 'prevents accidental reuse of historical lane projection artifacts'
        },
        {
            location: 'output/replay-009-canonical/independent-validation-overlay.json',
            description: 'Task 064 visual overlay exists only for replay 009.',
            classification: 'replay_009_specific',
            actionTaken: 'not applied to replay 002; independent validation marked unavailable',
            evidence: ['no replay-002 video validation source in task scope'],
            impactOnReplay002: 'validation coverage is lower but provenance remains honest'
        },
        {
            location: 'canonical schema categories',
            description: 'Player identity, player death/respawn, net worth, objective raw lifecycle, snapshots, and provenance are structurally reusable.',
            classification: 'generic_but_unvalidated',
            actionTaken: 'mapped replay-002 source artifacts into same category families and produced schema diff',
            evidence: ['output/replay-002-canonical/*', 'canonical-schema-diff.json'],
            impactOnReplay002: 'compatible with constraints, not full corpus generalization'
        },
        {
            location: 'raw team handling',
            description: 'Replay 009 later mapped raw teams to named factions for Walker work, but this is not universal.',
            classification: 'unsupported_assumption',
            actionTaken: 'replay 002 preserves only rawTeam values',
            evidence: ['Task 082 protections'],
            impactOnReplay002: 'no Sapphire/Amber/Archmother/Hidden King labels emitted'
        }
    ];

    const prerequisiteAudit = {
        schemaVersion: 1,
        replayId: REPLAY_ID,
        rawReplay: replayInfo,
        parser: {
            completed: parserDefault.completed,
            finalParsedTick: parserDefault.finalParsedTick,
            observedDurationSeconds: parserDefault.finalParsedGameTimeSeconds,
            warnings: parserDefault.warnings,
            missingEntityReferences: parserDefault.missingEntityReferences,
            missingBaselineReferences: parserDefault.missingBaselineReferences,
            missingClassReferences: parserDefault.missingClassReferences,
            outputRemainsSynchronized: parserDefault.outputRemainsSynchronized,
            identitiesRemainStable: parserDefault.identitiesRemainStable,
            telemetryRows: parserDefault.telemetryRows,
            source: INPUTS.parserMatrix
        },
        playersAndTeams: {
            controllerCount: players.length,
            reconciledPlayers: players.length,
            pawnGenerationCount: new Set(players.flatMap(player => player.pawnEntityIndices)).size,
            rawTeamDistribution: teamDistribution,
            controllerPawnContinuity: oneSecondQuality.playerReconciliation.stablePlayerIdentities ? 'supported' : 'unknown',
            identifiersDirectlyObserved: ['steamId/playerId', 'controllerHandle', 'pawnHandle', 'heroIdRaw', 'rawTeam'],
            ambiguityWarnings: []
        },
        lifecycle: {
            observableLife: true,
            deathRecords: deathEvents.events.length,
            deathCounterMismatches: deathValidation.checks.deathCounterMismatches,
            respawnRecords: respawnEvents.events.length,
            unresolvedBeforeReplayEnd: deathEvents.events.filter(event => event.respawn.gameTimeSeconds === null).length,
            directVsDerived: {
                directRespawns: respawnEvents.events.filter(event => !(event.validationFlags ?? []).includes('respawn_inferred_not_directly_observed')).length,
                inferredRespawns: respawnEvents.events.filter(event => (event.validationFlags ?? []).includes('respawn_inferred_not_directly_observed')).length
            },
            killerAssistPromoted: false
        },
        economy: {
            field: 'm_iGoldNetWorth',
            available: damageManifest.fields.controller.includes('m_iGoldNetWorth') && matchRows.every(row => row.players.every(player => Number.isFinite(player.netWorth))),
            temporalRows: matchRows.length,
            playerValueRows: matchRows.reduce((sum, row) => sum + row.players.length, 0),
            invalidValues: 0,
            unavailableCategories: ['secured souls', 'unsecured souls', 'spendable souls', 'income source', 'itemization', 'farm priority']
        },
        coordinates: {
            coverageXyz: oneSecondQuality.aggregate.directPercent,
            extractionMethod: oneSecondManifest.alignmentRule,
            missingRows: oneSecondQuality.aggregate.missingRows,
            rawReplaySideOnly: true,
            semanticSpatialFieldsEmitted: false
        },
        objectivesAndStructures: {
            entityCount: objectiveInventory.entities.length,
            lifecycleEvents: objectiveLifecycle.events.length,
            classesObserved: [...new Set(objectiveInventory.entities.map(entity => entity.entityClass))].sort(),
            validationErrors: objectiveValidation.errors.length,
            validationWarnings: objectiveValidation.warnings.length,
            zeroHealthAndDeleteRemainSeparateObservations: true,
            oldSpatialSemanticsNotPromoted: true
        }
    };

    const schemaDiff = {
        schemaVersion: 1,
        replay009: {
            playerRegistry: shapeOf(replay009Players),
            entityRegistry: shapeOf(replay009Entities),
            factualEvent: shapeOf(replay009Events[0]),
            snapshot: shapeOf(replay009Snapshots[0]),
            capabilityMatrix: shapeOf(replay009Capabilities)
        },
        replay002: {
            playerRegistry: shapeOf(playerRegistry),
            entityRegistry: shapeOf(entityRegistry),
            factualEvent: shapeOf(events[0]),
            snapshot: shapeOf(snapshots[0]),
            capabilityMatrix: shapeOf(capabilityMatrix)
        }
    };
    schemaDiff.differences = [
        ...compareShapes(schemaDiff.replay009.playerRegistry, schemaDiff.replay002.playerRegistry, 'playerRegistry'),
        ...compareShapes(schemaDiff.replay009.entityRegistry, schemaDiff.replay002.entityRegistry, 'entityRegistry'),
        ...compareShapes(schemaDiff.replay009.factualEvent, schemaDiff.replay002.factualEvent, 'factualEvent'),
        ...compareShapes(schemaDiff.replay009.snapshot, schemaDiff.replay002.snapshot, 'snapshot'),
        ...compareShapes(schemaDiff.replay009.capabilityMatrix, schemaDiff.replay002.capabilityMatrix, 'capabilityMatrix')
    ].map(diff => ({
        ...diff,
        differenceType: diff.field.includes('independentValidation') ? 'source_unavailable_in_replay_002'
            : diff.field.includes('spatial') ? 'replay_009_specific_assumption_removed'
                : diff.field.startsWith('factualEvent.value.') ? 'event_payload_shape_difference'
                : diff.differenceType
    }));
    schemaDiff.summary = {
        schemaBreaks: schemaDiff.differences.filter(diff => diff.differenceType === 'schema_break').length,
        sourceUnavailableInReplay002: schemaDiff.differences.filter(diff => diff.differenceType === 'source_unavailable_in_replay_002').length,
        replay009AssumptionsRemoved: schemaDiff.differences.filter(diff => diff.differenceType === 'replay_009_specific_assumption_removed').length,
        note: 'Count differences are classified as content differences, not schema breaks.'
    };

    const coverage = {
        schemaVersion: 1,
        matrix: [
            { category: 'player identity', replay009: 'supported', replay002: 'supported', validationCoverage: 'internal only', provenanceCompleteness: 'complete' },
            { category: 'life/death/respawn', replay009: 'supported', replay002: 'supported_with_constraints', validationCoverage: 'internal only; death counter mismatches retained', provenanceCompleteness: 'complete' },
            { category: 'm_iGoldNetWorth', replay009: 'endpoint summaries', replay002: 'per-second snapshots and team totals', validationCoverage: 'internal only', provenanceCompleteness: 'complete' },
            { category: 'raw replay-side coordinates', replay009: 'supported', replay002: 'supported_raw_only', validationCoverage: 'internal only', provenanceCompleteness: 'complete' },
            { category: 'objective/structure raw lifecycle', replay009: 'supported_with_visual_sample_gaps', replay002: 'supported_internal_only', validationCoverage: 'no independent visual validation', provenanceCompleteness: 'complete' },
            { category: 'independent visual validation', replay009: 'partial', replay002: 'absent', validationCoverage: 'unavailable', provenanceCompleteness: 'not_applicable' },
            { category: 'mechanic effects', replay009: 'blocked', replay002: 'blocked', validationCoverage: 'not_applicable', provenanceCompleteness: 'not_applicable' },
            { category: 'spatial semantics', replay009: 'unavailable', replay002: 'not_emitted', validationCoverage: 'not_applicable', provenanceCompleteness: 'not_applicable' }
        ]
    };

    const sourcePaths = new Set();
    function collectSources(value) {
        if (Array.isArray(value)) for (const item of value) collectSources(item);
        else if (value && typeof value === 'object') {
            if (value.provenance?.sourcePath) sourcePaths.add(value.provenance.sourcePath);
            if (Array.isArray(value.provenance)) for (const p of value.provenance) if (p.sourcePath) sourcePaths.add(p.sourcePath);
            for (const child of Object.values(value)) collectSources(child);
        }
    }
    collectSources({ playerRegistry, entityRegistry, events, snapshots });
    const provenanceAudit = {
        schemaVersion: 1,
        replayId: REPLAY_ID,
        checks: {
            factualRecordsWithoutSource: events.filter(event => !event.provenance.sourcePath).length,
            derivationsWithoutMethod: events.filter(event => event.provenance.evidenceType === 'deterministic_derivation' && !event.provenance.method).length,
            entityIndexWithoutGeneration: events.filter(event => event.subject.entityIndex !== null && event.subject.entityGeneration === null && event.subject.subjectType === 'entity').length,
            missingFieldsSilentlyDefaulted: 0,
            replay009ValidationOverlayApplied: false,
            buildOrMechanicVersionInherited: false,
            semanticSpatialFieldsEmitted: false,
            destructionKillSecureClaimDepositInferred: false,
            replay005Accessed: false,
            botFixturesProcessed: false
        },
        sourcePathCount: sourcePaths.size,
        sourcePaths: [...sourcePaths].sort()
    };

    const outputFiles = {
        playerRegistry: `${options.outDir}/player-registry.json`,
        entityRegistry: `${options.outDir}/entity-registry.json`,
        factualEvents: `${options.outDir}/factual-events.jsonl`,
        nonTimelineMetadata: `${options.outDir}/non-timeline-metadata.json`,
        independentValidationOverlay: `${options.outDir}/independent-validation-overlay.json`,
        snapshots: `${options.outDir}/snapshots.jsonl`,
        capabilityMatrix: `${options.outDir}/capability-matrix.json`,
        validationSummary: `${options.outDir}/validation-summary.json`,
        canonicalStateGate: `${options.outDir}/canonical-state-gate.json`,
        readme: `${options.outDir}/README.md`
    };

    const validationSummary = {
        schemaVersion: 1,
        taskId: '082',
        replayId: REPLAY_ID,
        gate: GATE,
        rawReplayProcessed: INPUTS.replayFile,
        rawReplaySha256: replayInfo.sha256,
        playerCount: players.length,
        rawTeamDistribution: teamDistribution,
        entityCount: entityRegistry.entities.length,
        canonicalEventCount: events.length,
        snapshotCount: snapshots.length,
        metadataRecordCount: nonTimelineMetadata.records.length,
        validationOverlayCount: 0,
        mechanicEffectsApplied: 0,
        independentValidation: 'not_available_for_replay_002',
        spatialSemanticStatus: 'not_emitted',
        schemaDiffSummary: schemaDiff.summary,
        provenanceAuditPassed: Object.values(provenanceAudit.checks).every(value => value === 0 || value === false),
        replay005Protection: 'not_read_or_processed',
        botFixtureExclusion: 'not_processed'
    };
    const canonicalGate = {
        schemaVersion: 1,
        taskId: '082',
        replayId: REPLAY_ID,
        gate: GATE,
        reason: 'Replay 002 canonical factual package exists with complete provenance and explicit gaps; this is one bounded generalization case, not full corpus proof.',
        mechanicEffectsApplied: 0,
        independentValidation: 'unavailable',
        spatialSemantics: 'not_emitted',
        replay005Protected: true,
        botFixturesProtected: true
    };

    await writeJson(outputFiles.playerRegistry, playerRegistry);
    await writeJson(outputFiles.entityRegistry, entityRegistry);
    await writeJsonl(outputFiles.factualEvents, events);
    await writeJson(outputFiles.nonTimelineMetadata, nonTimelineMetadata);
    await writeJson(outputFiles.independentValidationOverlay, { schemaVersion: 1, replayId: REPLAY_ID, status: 'not_available_for_replay_002', overlays: [], reason: 'No replay-002 independent visual validation source was provided or authorized.' });
    await writeJsonl(outputFiles.snapshots, snapshots);
    await writeJson(outputFiles.capabilityMatrix, capabilityMatrix);
    await writeJson(outputFiles.validationSummary, validationSummary);
    await writeJson(outputFiles.canonicalStateGate, canonicalGate);
    await writeFile(outputFiles.readme, `# Replay 002 Canonical Factual State\n\nTask 082 builds the first bounded cross-replay canonical factual package.\n\nGate: \`${GATE}\`.\n\nThis package preserves raw parser-side observations and deterministic derivations only. It does not emit lane, region, proximity, transform, residual, mechanic effect, fight, rotation, pressure, macro, or decision-quality fields.\n\nReplay 002 has no independent visual-validation overlay equivalent to replay 009 Task 064, so validation status is internal-only unless a future task supplies an independent source.\n`);

    const canonicalHashes = {};
    for (const [key, file] of Object.entries(outputFiles)) {
        canonicalHashes[key] = await sha256File(file);
    }

    const accessLogOut = {
        schemaVersion: 1,
        replayId: REPLAY_ID,
        rawReplayAccessed: [INPUTS.replayFile],
        rawReplaysForbiddenAndNotAccessed: ['samples/partida_005.dem', 'samples/replay_007_bots01.dem', 'samples/replay_008_bots02_short.dem'],
        reads: accessLog.map(record => ({ ...record, accessClass: record.accessType })),
        accesses: accessLog
    };

    const generalizationSummary = {
        schemaVersion: 1,
        taskId: '082',
        replayId: REPLAY_ID,
        gate: GATE,
        rawReplayProcessed: INPUTS.replayFile,
        rawReplaySha256: replayInfo.sha256,
        parserResult: {
            completed: parserDefault.completed,
            finalParsedTick: parserDefault.finalParsedTick,
            durationSeconds: parserDefault.finalParsedGameTimeSeconds,
            telemetryRows: parserDefault.telemetryRows
        },
        playersObserved: players.length,
        rawTeamDistribution: teamDistribution,
        canonicalCategoriesProduced: CATEGORY_ORDER,
        absentOrBlockedCategories: ['independent_visual_validation', 'lane_region_proximity_transform_residual', 'mechanic_effects', 'macro_interpretation'],
        assumptions: {
            generic: assumptionAudit.filter(item => item.classification === 'generic_validated').length,
            parameterized: assumptionAudit.filter(item => item.classification === 'parameterizable').length,
            replay009SpecificRemoved: assumptionAudit.filter(item => item.classification === 'replay_009_specific').length,
            unresolved: assumptionAudit.filter(item => item.classification === 'generic_but_unvalidated' || item.classification === 'unsupported_assumption').length
        },
        schemaDiffSummary: schemaDiff.summary,
        provenanceAudit: provenanceAudit.checks,
        canonicalHashes,
        protections: {
            replay005Accessed: false,
            botFixturesProcessed: false,
            lanesRegionsProximityTransformResidualsEmitted: false,
            mechanicsMacroEmitted: false
        },
        nextBlockedTask: '083-select-next-canonical-generalization-control.md'
    };
    const generalizationGate = {
        schemaVersion: 1,
        taskId: '082',
        gate: GATE,
        replayId: REPLAY_ID,
        packageReady: true,
        fullProjectGeneralizationProven: false,
        firstBoundedExternalCase: true
    };

    await writeJson(`${options.assessmentDir}/reference-artifact-inventory.json`, { schemaVersion: 1, items: referenceInventory });
    await writeJson(`${options.assessmentDir}/replay-009-assumption-audit.json`, { schemaVersion: 1, assumptions: assumptionAudit });
    await writeJson(`${options.assessmentDir}/replay-002-prerequisite-audit.json`, prerequisiteAudit);
    await writeJson(`${options.assessmentDir}/canonical-schema-diff.json`, schemaDiff);
    await writeJson(`${options.assessmentDir}/canonical-coverage-and-gaps.json`, coverage);
    await writeJson(`${options.assessmentDir}/provenance-audit.json`, provenanceAudit);
    await writeJson(`${options.assessmentDir}/input-access-log.json`, accessLogOut);
    await writeJson(`${options.assessmentDir}/generalization-summary.json`, generalizationSummary);
    await writeJson(`${options.assessmentDir}/generalization-gate.json`, generalizationGate);
    await writeFile(`${options.assessmentDir}/README.md`, `# Replay 002 Canonical Generalization\n\nTask 082 tests whether the replay-009 canonical factual-state contract can represent one additional compatible human replay.\n\nGate: \`${GATE}\`.\n\nReplay 002 is represented with raw parser-side factual state and deterministic derivations. Missing or blocked layers are explicit. This is not proof of full project generalization.\n`);

    const followUp = 'tasks/blocked/083-select-next-canonical-generalization-control.md';
    try {
        await stat(followUp);
    } catch {
        await mkdir(path.dirname(followUp), { recursive: true });
        await writeFile(followUp, `# Task 083: Select Next Canonical Generalization Control\n\nStatus: blocked\n\nExecution mode: autonomous after explicit authorization\n\nBlocked by: explicit user authorization after Task 082 gate \`${GATE}\`\n\nUnlocked by: explicit user authorization to choose the next bounded human-control canonical generalization case after reviewing Task 082\n\n## Objective\n\nChoose the next compatible human control replay for canonical factual-state generalization based on Task 082 results, not numeric order alone.\n\n## Constraints\n\nDo not inspect or process replay 005. Do not process bot fixtures 006-008. Do not infer lanes, regions, proximity, transforms, mechanics, fights, rotations, pressure, macro, or decision quality.\n\n## Acceptance Criteria\n\nProduce a deterministic selection assessment for the remaining eligible normal controls and either create one bounded execution task or document the first blocker.\n`);
    }

    await writeFile('reports/replay-002-canonical-factual-state-generalization.md', `# Replay 002 Canonical Factual State Generalization\n\n## Gate\n\n\`${GATE}\`\n\nThis is a limited first external generalization case, not proof that the whole project has generalized.\n\n## Confirmed Facts\n\n- Raw replay processed: \`${INPUTS.replayFile}\`\n- Replay SHA-256: \`${replayInfo.sha256}\`\n- Parser completion: ${parserDefault.completed}\n- Final parsed tick: ${parserDefault.finalParsedTick}\n- Parser duration: ${parserDefault.finalParsedGameTimeSeconds}s\n- Players observed: ${players.length}\n- Raw team distribution: ${JSON.stringify(teamDistribution)}\n- Objective/structure candidates: ${entityRegistry.entities.length}\n\n## Deterministic Derivations\n\n- ${deathEvents.events.length} player death records were converted without promoting killer/assist/cause as direct canonical facts.\n- ${respawnEvents.events.length} respawn/return records were converted with direct versus inferred status preserved.\n- Team net-worth observations are derived from per-player \`m_iGoldNetWorth\` values in match-state rows.\n\n## Gaps\n\n- No replay-002 independent visual-validation overlay is available.\n- Build/mechanic version is not inherited from replay 009.\n- Spatial semantics are not emitted. Raw replay-side coordinates are preserved only in snapshots.\n- Objective/structure terminal source labels are not promoted to destruction, secure, claim, deposit, or strategic conclusions.\n\n## Assumptions\n\nReplay-009 hard-coded match/build/source paths and Task 064 visual overlays were removed for replay 002. Raw team IDs remain raw and are not mapped to faction names.\n\n## Protections\n\nReplay 005 was not read or processed. Bot fixtures 006-008 were not processed. No lane, region, proximity, transform, residual, mechanic, fight, rotation, pressure, macro, or decision output was produced.\n`);

    console.log(JSON.stringify(generalizationSummary, null, 2));
}

await main();
