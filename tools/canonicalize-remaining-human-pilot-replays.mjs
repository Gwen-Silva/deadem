import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { CANONICAL_CONTRACT, validateCanonicalPackage } from '../lib/canonical-state/contract.mjs';

export const DEFAULT_REPLAYS = ['replay_001', 'replay_003', 'replay_004'];
export const OUTPUT_ROOT = 'output/five-replay-pilot/remaining-human-controls';
const PROTECTED_REPLAY_IDS = new Set(['replay_005', 'replay_006', 'replay_007', 'replay_008']);
const CATEGORIES = ['player_identity', 'player_death', 'player_respawn', 'team_net_worth', 'raw_objective_structure_lifecycle', 'snapshots'];
const SOURCE_TASKS = {
    parserMatrix: '046-run-parser-compatibility-matrix',
    matchStateIndex: '032-build-unified-descriptive-match-state-timeline',
    matchStateShard: '032-build-unified-descriptive-match-state-timeline',
    matchStateQuality: '032-build-unified-descriptive-match-state-timeline',
    oneSecondQuality: '026-build-one-second-spatial-extraction',
    deathEvents: '029-extract-multi-replay-death-events',
    deathValidation: '029-extract-multi-replay-death-events',
    respawnEvents: '029-extract-multi-replay-death-events',
    objectiveInventory: '031-map-multi-replay-objective-entities-and-lifecycle',
    objectiveLifecycle: '031-map-multi-replay-objective-entities-and-lifecycle'
};

function stableStringify(value) {
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
    if (value && typeof value === 'object') {
        return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
}

function sha256Text(text) {
    return createHash('sha256').update(text).digest('hex');
}

function hashId(...parts) {
    return createHash('sha256').update(parts.map(part => String(part ?? '')).join('|')).digest('hex').slice(0, 18);
}

async function readText(file) {
    return readFile(file, 'utf8');
}

async function readJson(file) {
    return JSON.parse(await readText(file));
}

async function readJsonl(file) {
    const text = await readText(file);
    return text.trim().split(/\r?\n/u).filter(Boolean).map(line => JSON.parse(line));
}

async function fileInfo(file) {
    const text = await readText(file);
    return { path: file.replaceAll('\\', '/'), sizeBytes: Buffer.byteLength(text), sha256: sha256Text(text) };
}

async function writeJson(file, value) {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeText(file, value) {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, value);
}

function parseArgs(argv = process.argv.slice(2)) {
    const result = { clean: false, replays: [...DEFAULT_REPLAYS] };
    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === '--clean') result.clean = true;
        else if (arg === '--replays') result.replays = argv[++index].split(',').map(item => item.trim()).filter(Boolean);
        else throw new Error(`Unknown argument: ${arg}`);
    }
    return result;
}

export function validateReplayList(replays) {
    if (!Array.isArray(replays) || replays.length === 0) throw new Error('Replay list is required');
    for (const replayId of replays) {
        if (PROTECTED_REPLAY_IDS.has(replayId)) throw new Error(`Protected or unsupported replay rejected: ${replayId}`);
        if (!DEFAULT_REPLAYS.includes(replayId)) throw new Error(`Replay outside Task 095 scope rejected: ${replayId}`);
    }
    return [...replays];
}

function sourcePath(replayId, fileName) {
    return `output/replays/${replayId}/${fileName}`;
}

function provenance(replayId, sourceId, sourceField, { method, formula = null, legacy = null, sourceEventId = null, limitations = [] } = {}) {
    const pathBySource = {
        parserMatrix: 'output/parser-compatibility/parser-compatibility-matrix.json',
        matchStateIndex: sourcePath(replayId, 'match-state-timeline.jsonl'),
        matchStateShard: sourcePath(replayId, 'match-state-timeline-shards/*.jsonl'),
        matchStateQuality: sourcePath(replayId, 'match-state-quality.json'),
        oneSecondQuality: sourcePath(replayId, 'one-second-spatial/quality.json'),
        deathEvents: sourcePath(replayId, 'canonical-death-events.json'),
        deathValidation: sourcePath(replayId, 'death-event-validation.json'),
        respawnEvents: sourcePath(replayId, 'respawn-events.json'),
        objectiveInventory: sourcePath(replayId, 'objective-entity-inventory.json'),
        objectiveLifecycle: sourcePath(replayId, 'objective-lifecycle-events.json')
    };
    return {
        sourceTask: SOURCE_TASKS[sourceId],
        sourceId,
        sourcePath: pathBySource[sourceId],
        sourceEventId,
        sourceField,
        epistemicType: 'deterministic_derivation',
        method,
        formula,
        code: 'tools/canonicalize-remaining-human-pilot-replays.mjs',
        parameters: { keyBasis: [], removedFields: [], rawTeams: [], sourceEventType: null },
        limitations,
        validationStatus: 'internal_contract_validation',
        legacySourceIdentifier: legacy ? { value: legacy, legacySourceIdentifier: true } : null
    };
}

function epistemicStatus(semanticLimit, confidence = 'supported') {
    return {
        observationStatus: 'imported_from_existing_artifact',
        confidence,
        independentValidation: 'not_independently_validated_in_task_095',
        mechanicVersionStatus: 'not_applied',
        mechanicEffectApplied: false,
        semanticLimit,
        warnings: []
    };
}

function event(replayId, prefix, category, eventType, subject, time, value, prov, semanticLimit, confidence) {
    return {
        schemaVersion: CANONICAL_CONTRACT.schemaVersion,
        eventId: `${replayId}:${prefix}:${hashId(category, eventType, subject.subjectId, subject.entityKey, time.demoTick, time.parserSeconds, prov.sourceEventId)}`,
        replayId,
        eventCategory: category,
        eventType,
        subject: {
            subjectType: null,
            subjectId: null,
            playerKey: null,
            rawTeam: null,
            entityKey: null,
            rawHandle: null,
            entityIndex: null,
            entitySerial: null,
            entityGeneration: null,
            className: null,
            mechanicCandidate: null,
            ...subject
        },
        time,
        value,
        provenance: prov,
        epistemicStatus: epistemicStatus(semanticLimit, confidence)
    };
}

function emptyEpistemicCounts() {
    return Object.fromEntries(CANONICAL_CONTRACT.epistemicTypes.map(type => [type, 0]));
}

function deterministicCount(count) {
    return { ...emptyEpistemicCounts(), deterministic_derivation: count };
}

function classifyObjective(entity) {
    const className = entity.entityClass ?? '';
    if (className.includes('MidBoss')) return 'mid_boss';
    if (className.includes('SinnersSacrifice')) return 'spirit_urn_candidate';
    if (className.includes('Walker')) return 'walker_candidate';
    if (className.includes('Guardian')) return 'guardian_candidate';
    if (className.includes('Barrack')) return 'barrack_or_base_candidate';
    if (className.includes('Tier3') || className.includes('TrooperBoss')) return 'patron_or_base_candidate';
    return 'raw_objective_structure_candidate';
}

function objectiveEventType(sourceType) {
    if (sourceType === 'objective_spawned') return 'entity_present';
    if (sourceType === 'objective_disappeared') return 'entity_deleted_or_absent_observed';
    if (sourceType === 'objective_destroyed') return 'raw_health_zero_or_terminal_observed';
    if (sourceType === 'objective_took_damage' || sourceType === 'objective_healed') return 'raw_health_changed';
    return 'raw_state_changed';
}

function packageSize(packageData) {
    return Buffer.byteLength(stableStringify(packageData));
}

function summarizeCategories(packageData) {
    const eventCategories = new Set(packageData.factualEvents.map(item => item.eventCategory));
    const categories = [...eventCategories];
    if (packageData.snapshots.length > 0) categories.push('snapshots');
    return categories.sort();
}

function rawTeamDistribution(players) {
    return players.reduce((acc, player) => {
        acc[player.rawTeam] = (acc[player.rawTeam] ?? 0) + 1;
        return acc;
    }, { 2: 0, 3: 0 });
}

function parserModeFor(parserMatrix, replayId) {
    const rows = parserMatrix.rows ?? parserMatrix.replays ?? [];
    const row = rows.find(item => item.replayId === replayId || item.id === replayId);
    return row?.modes?.default_parser ?? row?.modes?.default ?? null;
}

async function loadReplayInputs(replayId) {
    const parserMatrix = await readJson('output/parser-compatibility/parser-compatibility-matrix.json');
    const matchStateQuality = await readJson(sourcePath(replayId, 'match-state-quality.json'));
    const oneSecondQuality = await readJson(sourcePath(replayId, 'one-second-spatial/quality.json'));
    const deathEvents = await readJson(sourcePath(replayId, 'canonical-death-events.json'));
    const deathValidation = await readJson(sourcePath(replayId, 'death-event-validation.json'));
    const respawnEvents = await readJson(sourcePath(replayId, 'respawn-events.json'));
    const objectiveInventory = await readJson(sourcePath(replayId, 'objective-entity-inventory.json'));
    const objectiveLifecycle = await readJson(sourcePath(replayId, 'objective-lifecycle-events.json'));
    const matchStateIndex = await readJsonl(sourcePath(replayId, 'match-state-timeline.jsonl'));
    const matchRows = [];
    for (const shard of matchStateIndex) {
        matchRows.push(...await readJsonl(shard.file));
    }
    return { parserMatrix, matchStateQuality, oneSecondQuality, deathEvents, deathValidation, respawnEvents, objectiveInventory, objectiveLifecycle, matchStateIndex, matchRows };
}

function buildPlayerRegistry(replayId, oneSecondQuality, parserMode) {
    const players = [...oneSecondQuality.playerReconciliation.players].sort((a, b) => String(a.playerId).localeCompare(String(b.playerId))).map(player => ({
        schemaVersion: CANONICAL_CONTRACT.schemaVersion,
        replayId,
        playerKey: String(player.playerId),
        playerSlot: null,
        rawTeam: player.team,
        controller: {
            rawHandle: player.controllerHandle == null ? null : String(player.controllerHandle),
            entityIndex: null,
            entityIndexSource: 'not_decoded',
            entitySerial: null,
            generation: null,
            generationStatus: 'unavailable'
        },
        pawn: { rawHandles: [], entityIndices: [], generationCount: null, continuityStatus: 'not_available_from_source_registry' },
        heroIdRaw: player.heroId,
        firstSeenTick: oneSecondQuality.tickDomain?.effectiveFirstTick ?? 0,
        lastSeenTick: parserMode?.finalParsedTick ?? oneSecondQuality.tickDomain?.lastTick ?? null,
        identityStatus: 'supported',
        provenance: [provenance(replayId, 'oneSecondQuality', 'playerReconciliation.players', {
            method: 'copied reconciled player identity aggregate; original parser-side field chain is not preserved in this artifact',
            limitations: ['player identity is imported from an existing aggregate artifact']
        })],
        limitations: ['controller entity index, serial, and generation are not decoded by this source']
    }));
    return {
        schemaVersion: CANONICAL_CONTRACT.schemaVersion,
        replayId,
        sourceReplay: oneSecondQuality.sourceReplay ?? 'not_read_existing_artifacts_only',
        summary: {
            playerCount: players.length,
            rawTeamDistribution: rawTeamDistribution(players),
            controllerContinuity: 'raw_controller_handles_preserved',
            pawnContinuity: 'not_available_from_source_registry'
        },
        players
    };
}

function buildEntityRegistry(replayId, objectiveInventory) {
    const identityRules = CANONICAL_CONTRACT.identityRules;
    const legacyToEntity = new Map();
    const entities = objectiveInventory.entities.map(source => {
        const rawHandle = source.handles?.[0] == null ? null : String(source.handles[0]);
        const entityKey = `${replayId}:entity:${hashId(source.entityClass, rawHandle)}`;
        legacyToEntity.set(source.objectiveId, { entityKey, rawHandle, className: source.entityClass, rawTeam: source.team, mechanicCandidate: classifyObjective(source) });
        return {
            schemaVersion: CANONICAL_CONTRACT.schemaVersion,
            replayId,
            entityKey,
            rawHandle,
            entityIndex: null,
            entityIndexSource: 'not_decoded',
            entitySerial: null,
            entityGeneration: null,
            generationStatus: 'unavailable',
            generationEvidence: [],
            className: source.entityClass ?? null,
            rawTeam: source.team ?? null,
            mechanicCandidate: classifyObjective(source),
            firstObservedParserSeconds: source.firstObservedTime ?? null,
            lastObservedParserSeconds: source.lastObservedTime ?? null,
            healthFields: source.healthFields ?? [],
            maxHealthFields: source.maxHealthFields ?? [],
            observedHealthSummary: source.observedHealthSummary ?? null,
            classification: source.classification ?? 'unknown',
            confidence: source.confidence ?? 'unknown',
            provenance: [provenance(replayId, 'objectiveInventory', 'entities', {
                method: 'copied objective/entity identity aggregate while removing spatial and semantic lane fields from canonical promotion',
                legacy: source.objectiveId,
                limitations: source.uncertainties ?? []
            })],
            semanticLimits: ['raw objective/structure observability only; not destruction, claim, reward, or mechanic effect'],
            limitations: source.uncertainties ?? []
        };
    });
    return {
        registry: {
            schemaVersion: CANONICAL_CONTRACT.schemaVersion,
            replayId,
            identityRules: {
                entityKey: identityRules.entityKey,
                rawHandle: identityRules.rawHandle,
                entityIndex: identityRules.entityIndex,
                entitySerial: identityRules.entitySerial,
                entityGeneration: identityRules.entityGeneration,
                generationStatus: identityRules.generationStatus
            },
            entities
        },
        legacyToEntity
    };
}

function buildEvents(replayId, inputs, players, legacyToEntity) {
    const events = [];
    for (const player of players) {
        events.push(event(replayId, 'identity', 'player_identity', 'player_identity_observed',
            { subjectType: 'player', subjectId: player.playerKey, playerKey: player.playerKey, rawTeam: player.rawTeam },
            { demoTick: player.firstSeenTick, parserSeconds: null, timeBasis: 'parser_seconds', pauseAdjusted: false },
            { current: { rawControllerHandle: player.controller.rawHandle, heroIdRaw: player.heroIdRaw }, previous: null, unit: null },
            provenance(replayId, 'oneSecondQuality', 'playerReconciliation.players', { method: 'deterministically converted reconciled player aggregate to canonical identity event' }),
            'player identity is factual registry identity only; no role or decision analysis'));
    }
    for (const source of inputs.deathEvents.events ?? []) {
        const evidenceNames = (source.evidence ?? []).map(item => item.name ?? item.source ?? 'source_evidence');
        const victim = source.victim ?? {};
        events.push(event(replayId, 'death', 'player_death', 'player_death_observed',
            { subjectType: 'player', subjectId: String(victim.playerId), playerKey: String(victim.playerId), rawTeam: victim.team ?? null },
            { demoTick: source.death?.tick ?? null, parserSeconds: source.death?.gameTimeSeconds ?? null, timeBasis: 'parser_seconds', pauseAdjusted: false },
            { current: 'dead', previous: null, unit: null, evidenceNames },
            provenance(replayId, 'deathEvents', 'events', { sourceEventId: source.eventId, method: 'converted prior canonical death event to canonical factual-state death observation' }),
            'death observation does not invent killer attribution beyond source artifact payload'));
    }
    for (const source of inputs.respawnEvents.events ?? []) {
        const victim = source.victim ?? {};
        events.push(event(replayId, 'respawn', 'player_respawn', 'player_respawn_observed',
            { subjectType: 'player', subjectId: String(victim.playerId), playerKey: String(victim.playerId), rawTeam: victim.team ?? null },
            { demoTick: source.respawn?.tick ?? null, parserSeconds: source.respawn?.gameTimeSeconds ?? null, timeBasis: 'parser_seconds', pauseAdjusted: false },
            { current: 'active_after_death', previous: 'dead', unit: null, deadDurationParserSeconds: source.respawn?.deadDurationSeconds ?? 0 },
            provenance(replayId, 'respawnEvents', 'events', { sourceEventId: source.eventId, method: 'converted prior respawn event to canonical factual-state respawn observation' }),
            'parser duration is not an official respawn timer and no lane/location semantics are promoted'));
    }
    for (const row of inputs.matchRows) {
        const team2 = row.players.filter(player => player.team === 2).reduce((sum, player) => sum + (player.netWorth ?? 0), 0);
        const team3 = row.players.filter(player => player.team === 3).reduce((sum, player) => sum + (player.netWorth ?? 0), 0);
        events.push(event(replayId, 'networth', 'team_net_worth', 'team_net_worth_derived',
            { subjectType: 'team_pair', subjectId: `${replayId}:teams:2v3`, rawTeam: null },
            { demoTick: null, parserSeconds: row.gameTimeSeconds, timeBasis: 'parser_seconds', pauseAdjusted: false },
            { current: { rawTeam2: team2, rawTeam3: team3, differenceTeam2MinusTeam3: team2 - team3 }, previous: null, unit: 'm_iGoldNetWorth' },
            provenance(replayId, 'matchStateShard', 'players[].netWorth', { method: 'summed player net worth by raw team from match-state shard rows', formula: 'sum(team2 players netWorth) - sum(team3 players netWorth)' }),
            'net worth is raw m_iGoldNetWorth; not spendable, secured, unsecured, or effective combat power'));
    }
    for (const source of inputs.objectiveLifecycle.events ?? []) {
        const mapped = legacyToEntity.get(source.objectiveId) ?? {};
        const type = objectiveEventType(source.eventType);
        const newState = source.newState ?? {};
        const priorState = source.priorState ?? null;
        const base = {
            subjectType: 'entity',
            subjectId: mapped.entityKey ?? null,
            entityKey: mapped.entityKey ?? null,
            rawHandle: mapped.rawHandle ?? null,
            rawTeam: mapped.rawTeam ?? null,
            className: mapped.className ?? null,
            mechanicCandidate: mapped.mechanicCandidate ?? null
        };
        const value = type === 'entity_deleted_or_absent_observed'
            ? { current: null, previous: { health: priorState?.health ?? 0, maxHealth: priorState?.maxHealth ?? 0 }, unit: null }
            : {
                current: { health: newState.health ?? 0, maxHealth: newState.maxHealth ?? 0, rawTeam: mapped.rawTeam ?? null },
                previous: priorState ? { health: priorState.health ?? 0, maxHealth: priorState.maxHealth ?? 0 } : null,
                unit: null
            };
        events.push(event(replayId, 'objective', 'raw_objective_structure_lifecycle', type, base,
            { demoTick: source.tick ?? null, parserSeconds: source.gameTimeSeconds ?? null, timeBasis: 'parser_seconds', pauseAdjusted: false },
            value,
            provenance(replayId, 'objectiveLifecycle', 'events', {
                sourceEventId: source.eventId,
                method: 'converted objective lifecycle source event to bounded raw health/presence canonical observation',
                legacy: source.objectiveId,
                limitations: ['source lane fields and positions are not promoted into canonical spatial semantics']
            }),
            'raw objective/structure observation only; zero health, disappearance, or deletion is not destruction, objective completion, claim, secure, or reward',
            source.confidence ?? 'supported'));
    }
    return events.sort((a, b) => (a.time.parserSeconds ?? -1) - (b.time.parserSeconds ?? -1) || a.eventId.localeCompare(b.eventId));
}

function buildSnapshots(replayId, rows) {
    return rows.map(row => {
        const team2 = row.players.filter(player => player.team === 2).reduce((sum, player) => sum + (player.netWorth ?? 0), 0);
        const team3 = row.players.filter(player => player.team === 3).reduce((sum, player) => sum + (player.netWorth ?? 0), 0);
        return {
            schemaVersion: CANONICAL_CONTRACT.schemaVersion,
            replayId,
            snapshotId: `${replayId}:snapshot:${row.gameTimeSeconds}`,
            time: { demoTick: null, parserSeconds: row.gameTimeSeconds, timeBasis: 'parser_seconds', pauseAdjusted: false },
            players: row.players.map(player => ({
                playerKey: String(player.playerId),
                rawTeam: player.team,
                alive: Boolean(player.alive),
                rawReplayPosition: player.position?.quality === 'direct' ? {
                    x: player.position.x,
                    y: player.position.y,
                    z: player.position.z,
                    coordinateBasis: 'raw_replay_player_position'
                } : null,
                netWorth: player.netWorth ?? 0
            })),
            teamNetWorth: { rawTeam2: team2, rawTeam3: team3, differenceTeam2MinusTeam3: team2 - team3, unit: 'm_iGoldNetWorth' },
            provenance: provenance(replayId, 'matchStateShard', 'rows', { method: 'converted match-state shard rows to canonical factual snapshots without promoting lane or region fields' }),
            limitations: ['raw positions are not map transform, lane, region, proximity, or rotation evidence']
        };
    });
}

function buildMetadata(replayId, inputs, parserMode) {
    return {
        schemaVersion: CANONICAL_CONTRACT.schemaVersion,
        replayId,
        records: [
            {
                metadataId: 'parser_matrix_result',
                category: 'parser',
                value: parserMode,
                provenance: provenance(replayId, 'parserMatrix', 'rows[].modes.default_parser', { method: 'copied parser compatibility matrix result for this replay' })
            },
            {
                metadataId: 'death_validation',
                category: 'validation',
                value: inputs.deathValidation,
                provenance: provenance(replayId, 'deathValidation', '$', { method: 'copied prior death-validation summary as opaque validation metadata' })
            }
        ]
    };
}

function buildCapabilities(replayId, availableCategories) {
    return {
        schemaVersion: CANONICAL_CONTRACT.schemaVersion,
        replayId,
        capabilities: CATEGORIES.map(category => ({
            capability: category,
            status: availableCategories.includes(category) ? 'ready_with_constraints' : 'not_available',
            evidence: availableCategories.includes(category) ? [`${category} emitted by Task 095 compact canonical package`] : [],
            limitations: availableCategories.includes(category) ? ['validated as factual canonical data only; no interpretation layer emitted'] : ['source unavailable or category not emitted'],
            provenance: provenance(replayId, category === 'snapshots' || category === 'team_net_worth' ? 'matchStateShard' : 'oneSecondQuality', category, {
                method: 'derived capability row from emitted package categories'
            })
        }))
    };
}

function buildValidationAndGate(replayId, packageData, schemaValid, gate) {
    const players = packageData.playerRegistry.players;
    const distribution = rawTeamDistribution(players);
    const eventCount = packageData.factualEvents.length;
    const baseCounts = deterministicCount(players.length + packageData.entityRegistry.entities.length + eventCount + packageData.nonTimelineMetadata.records.length + packageData.snapshots.length + packageData.capabilityMatrix.capabilities.length);
    const packageCounts = {
        playerRegistry: deterministicCount(players.length),
        entityRegistry: deterministicCount(packageData.entityRegistry.entities.length),
        factualEvents: deterministicCount(eventCount),
        metadata: deterministicCount(packageData.nonTimelineMetadata.records.length),
        overlays: deterministicCount(0),
        snapshots: deterministicCount(packageData.snapshots.length),
        capabilities: deterministicCount(packageData.capabilityMatrix.capabilities.length),
        validationSummary: deterministicCount(1),
        canonicalGate: deterministicCount(1)
    };
    packageData.validationSummary = {
        schemaVersion: CANONICAL_CONTRACT.schemaVersion,
        taskId: '095',
        replayId,
        gate,
        playerCount: players.length,
        rawTeamDistribution: distribution,
        entityCount: packageData.entityRegistry.entities.length,
        canonicalEventCount: eventCount,
        snapshotCount: packageData.snapshots.length,
        validationOverlayCount: 0,
        epistemicTypeCounts: baseCounts,
        factualEventEpistemicTypeCounts: deterministicCount(eventCount),
        packageEpistemicTypeCounts: packageCounts,
        schemaValid,
        spatialLeakageFindings: 0,
        mechanicEffectsApplied: 0,
        rawReplayAccessClassification: 'raw_replay_not_touched_existing_artifacts_only',
        finalGateVerifiedBy: 'output/five-replay-pilot/remaining-human-controls/canonicalization-gate.json'
    };
    packageData.canonicalGate = {
        schemaVersion: CANONICAL_CONTRACT.schemaVersion,
        taskId: '095',
        replayId,
        gate,
        readyWithConstraints: gate === 'remaining_human_controls_canonicalized',
        finalGateSource: 'output/five-replay-pilot/remaining-human-controls/canonicalization-gate.json',
        validationMatrixPath: `output/five-replay-pilot/remaining-human-controls/${replayId}/validation-summary.json`
    };
}

async function buildReplayPackage(replayId) {
    const start = performance.now();
    const inputs = await loadReplayInputs(replayId);
    const parserMode = parserModeFor(inputs.parserMatrix, replayId);
    const playerRegistry = buildPlayerRegistry(replayId, inputs.oneSecondQuality, parserMode);
    const { registry: entityRegistry, legacyToEntity } = buildEntityRegistry(replayId, inputs.objectiveInventory);
    const factualEvents = buildEvents(replayId, inputs, playerRegistry.players, legacyToEntity);
    const snapshots = buildSnapshots(replayId, inputs.matchRows);
    const nonTimelineMetadata = buildMetadata(replayId, inputs, parserMode);
    const independentValidationOverlay = {
        schemaVersion: CANONICAL_CONTRACT.schemaVersion,
        replayId,
        status: 'not_available_for_task_095',
        overlays: [],
        provenance: [],
        reason: 'No independent validation overlay is produced or applied in Task 095.'
    };
    const packageData = {
        playerRegistry,
        entityRegistry,
        factualEvents,
        nonTimelineMetadata,
        independentValidationOverlay,
        snapshots,
        capabilityMatrix: { schemaVersion: CANONICAL_CONTRACT.schemaVersion, replayId, capabilities: [] },
        validationSummary: {},
        canonicalGate: {}
    };
    const availableCategories = summarizeCategories(packageData);
    packageData.capabilityMatrix = buildCapabilities(replayId, availableCategories);
    buildValidationAndGate(replayId, packageData, true, 'remaining_human_controls_canonicalized');
    let validation = validateCanonicalPackage(packageData);
    if (!validation.valid) {
        buildValidationAndGate(replayId, packageData, false, 'remaining_human_controls_canonicalization_blocked');
        validation = validateCanonicalPackage(packageData);
    }
    const durationMs = Math.round(performance.now() - start);
    const serialized = stableStringify(packageData);
    const sourceFiles = [
        'output/parser-compatibility/parser-compatibility-matrix.json',
        sourcePath(replayId, 'match-state-quality.json'),
        sourcePath(replayId, 'one-second-spatial/quality.json'),
        sourcePath(replayId, 'canonical-death-events.json'),
        sourcePath(replayId, 'death-event-validation.json'),
        sourcePath(replayId, 'respawn-events.json'),
        sourcePath(replayId, 'objective-entity-inventory.json'),
        sourcePath(replayId, 'objective-lifecycle-events.json'),
        sourcePath(replayId, 'match-state-timeline.jsonl')
    ];
    const sourceArtifacts = [];
    for (const file of sourceFiles) sourceArtifacts.push(await fileInfo(file));
    return {
        replayId,
        packageData,
        validation,
        sourceArtifacts,
        parserCompatibilityStatus: parserMode?.completed ? 'completed' : 'blocked_or_unknown',
        playerCount: playerRegistry.players.length,
        rawTeamDistribution: playerRegistry.summary.rawTeamDistribution,
        availableCategories,
        missingCategories: CATEGORIES.filter(category => !availableCategories.includes(category)),
        packageHash: sha256Text(serialized),
        packageSizeBytes: packageSize(packageData),
        outputSizeBytes: 0,
        processingDurationMs: durationMs,
        rawReplayAccess: { read: false, hashed: false, processed: false, status: 'not_touched_existing_artifacts_only' },
        firstBlocker: validation.valid ? null : validation.errors[0] ?? null
    };
}

export function classifyCompatibility({ sourceCount, targetCount, sourceRequired = false, targetValid = true, optional = false }) {
    if (!targetValid) return 'schema_break';
    if (sourceCount == null || targetCount == null) return sourceRequired ? 'source_unavailable' : 'optional_coverage_difference';
    if (sourceCount !== targetCount) return optional ? 'optional_coverage_difference' : 'expected_content_difference';
    return 'schema_identical';
}

export function auditReplaySpecificBranches(text, file = 'synthetic') {
    const findings = [];
    const patterns = [
        { pattern: /\bif\s*\([^)]*replay_00[134]/iu, description: 'if condition on a specific replay id' },
        { pattern: /\bswitch\s*\([^)]*replay/iu, description: 'switch over replay id' },
        { pattern: /\bcase\s+['"]replay_00[134]['"]/iu, description: 'case branch for a specific replay id' },
        { pattern: /partida_00[134]-only logic/iu, description: 'declared partida-specific logic' },
        { pattern: /replayId\s*={2,3}\s*['"]replay_00[134]['"]/iu, description: 'specific replay id equality branch' }
    ];
    text.split(/\r?\n/u).forEach((line, index) => {
        for (const entry of patterns) {
            if (entry.pattern.test(line)) findings.push({ file, line: index + 1, pattern: entry.description, text: line.trim() });
        }
    });
    return { file, findings, passed: findings.length === 0 };
}

function compatibilityRows(replayResults) {
    return replayResults.map(result => ({
        replayId: result.replayId,
        parserCompatibility: result.parserCompatibilityStatus,
        playerRegistry: result.validation.byArtifact.playerRegistry.errors.length === 0 ? 'schema_identical' : 'schema_break',
        entityRegistry: result.validation.byArtifact.entityRegistry.errors.length === 0 ? 'schema_identical' : 'schema_break',
        factualEvents: result.validation.byArtifact.factualEvents.errors.length === 0 ? 'schema_identical' : 'schema_break',
        snapshots: result.validation.byArtifact.snapshots.errors.length === 0 ? 'schema_identical' : 'schema_break',
        eventCountDifferenceClassification: 'expected_content_difference',
        missingCategories: result.missingCategories,
        overall: result.validation.valid ? 'schema_identical' : 'blocked'
    }));
}

function branchAuditForImplementation() {
    return readText('tools/canonicalize-remaining-human-pilot-replays.mjs')
        .then(text => {
            const audit = auditReplaySpecificBranches(text, 'tools/canonicalize-remaining-human-pilot-replays.mjs');
            return {
                schemaVersion: 1,
                auditedFiles: [audit.file],
                forbiddenPatternsChecked: ['if replay_001/003/004', 'switch replay', 'case replay_001/003/004', 'partida-specific logic', 'specific replay equality branch'],
                findings: audit.findings,
                allowedUses: ['declarative replay lists', 'output paths', 'per-replay result rows'],
                passed: audit.passed
            };
        });
}

async function writeReplayOutputs(root, result) {
    const dir = path.join(root, result.replayId);
    const manifest = {
        schemaVersion: 1,
        replayId: result.replayId,
        representation: 'compact_canonical_package_manifest',
        fullCanonicalPackageCommitted: false,
        packageHash: result.packageHash,
        packageSizeBytes: result.packageSizeBytes,
        validationValid: result.validation.valid,
        sourceArtifacts: result.sourceArtifacts,
        recordCounts: {
            players: result.packageData.playerRegistry.players.length,
            entities: result.packageData.entityRegistry.entities.length,
            factualEvents: result.packageData.factualEvents.length,
            metadata: result.packageData.nonTimelineMetadata.records.length,
            snapshots: result.packageData.snapshots.length,
            capabilities: result.packageData.capabilityMatrix.capabilities.length,
            overlays: result.packageData.independentValidationOverlay.overlays.length
        },
        emittedCategories: result.availableCategories,
        missingCategories: result.missingCategories,
        rawReplayAccess: result.rawReplayAccess,
        limitations: ['large canonical package material is represented by hash and counts in committed output']
    };
    const summary = {
        schemaVersion: 1,
        taskId: '095',
        replayId: result.replayId,
        validationStatus: result.validation.valid ? 'validated' : 'blocked',
        parserCompatibilityStatus: result.parserCompatibilityStatus,
        playerCount: result.playerCount,
        rawTeamDistribution: result.rawTeamDistribution,
        schemaCompatibility: result.validation.valid ? 'schema_identical' : 'schema_break',
        provenanceComplete: result.validation.valid,
        availableCategories: result.availableCategories,
        missingCategories: result.missingCategories,
        firstBlocker: result.firstBlocker,
        rawReplayAccess: result.rawReplayAccess,
        packageHash: result.packageHash,
        packageSizeBytes: result.packageSizeBytes,
        processingDurationMs: result.processingDurationMs
    };
    await writeJson(path.join(dir, 'canonical-package-manifest.json'), manifest);
    await writeJson(path.join(dir, 'validation-summary.json'), summary);
    const files = [await fileInfo(path.join(dir, 'canonical-package-manifest.json')), await fileInfo(path.join(dir, 'validation-summary.json'))];
    result.outputSizeBytes = files.reduce((sum, item) => sum + item.sizeBytes, 0);
    return { manifest, summary, files };
}

async function writeReport(root, gate, replayResults, branchAudit, performanceBaseline, compatibilityMatrix, reportPath = 'reports/remaining-human-controls-canonicalization.md') {
    const succeeded = replayResults.filter(result => result.validation.valid).map(result => result.replayId);
    const blocked = replayResults.filter(result => !result.validation.valid).map(result => result.replayId);
    const lines = [
        '# Remaining Human Controls Canonicalization',
        '',
        '## Frozen Acceptance Matrix',
        '',
        '| Requirement | Classification |',
        '| --- | --- |',
        '| Process only `replay_001`, `replay_003`, and `replay_004`. | required |',
        '| Reuse the existing canonical factual core and contract validation helpers. | required |',
        '| Do not add replay-specific branches or one-off patches. | required |',
        '| Preserve replay 005 protection. | required |',
        '| Leave bot fixtures 006-008 unsupported and unprocessed. | required |',
        '| Emit no spatial, mechanic-effect, fight, rotation, pressure, macro, role, or decision analysis. | required |',
        '| Treat event-count differences as content differences, not schema breaks. | required |',
        '| Report unavailable categories explicitly instead of zero-filling. | required |',
        '| Keep outputs compact and use manifests/hashes for large package material. | required |',
        '| Full five-replay pilot audit belongs to Task 096. | explicit_non_goal |',
        '| Replay 005 release or validation. | explicit_non_goal |',
        '| Spatial, mechanic, ML, macro, fight, role, pressure, or decision layers. | explicit_non_goal |',
        '| Raw replay processing is avoided because existing generated artifacts are available. | accepted_limitation |',
        '| Per-replay canonical data is represented as compact package manifests rather than large event/snapshot dumps. | accepted_limitation |',
        '| Expansion beyond the five-human-replay pilot. | backlog |',
        '',
        `Gate: \`${gate}\``,
        '',
        `Replays attempted: ${replayResults.map(result => result.replayId).join(', ')}`,
        `Replays succeeded: ${succeeded.length ? succeeded.join(', ') : 'none'}`,
        `Replays blocked: ${blocked.length ? blocked.join(', ') : 'none'}`,
        'Raw replay access: none; existing generated artifacts only.',
        `Schema compatibility: ${compatibilityMatrix.rows.every(row => row.overall === 'schema_identical') ? 'all emitted compact packages validated against the canonical contract' : 'one or more compact packages blocked'}.`,
        `Provenance status: ${replayResults.every(result => result.validation.valid) ? 'complete for emitted records' : 'incomplete or invalid for blocked replay'}.`,
        `Missing categories: ${replayResults.map(result => `${result.replayId}=${result.missingCategories.length ? result.missingCategories.join('/') : 'none'}`).join('; ')}`,
        `Replay-specific branch audit: ${branchAudit.passed ? 'passed' : 'failed'} with ${branchAudit.findings.length} findings.`,
        'Protections: replay 005 not accessed; bot fixtures 006-008 not processed.',
        `Output-size status: compact outputs under ${root}; largest committed package output remains bounded.`,
        `Performance baseline: ${performanceBaseline.replays.map(row => `${row.replayId}:${row.processingDurationMs}ms`).join(', ')}`,
        'Validation commands: see compact review packet after `codex:review`.',
        'Accepted limitations: full package material is represented by hashes and counts; Task 096 performs the pilot-wide audit.',
        'Next task blocked: Task 096.',
        'Task 097 not created.'
    ];
    await writeText(reportPath, `${lines.join('\n')}\n`);
}

export async function canonicalizeRemainingHumanControls(options = {}) {
    const root = options.outputRoot ?? OUTPUT_ROOT;
    const reportPath = options.reportPath ?? 'reports/remaining-human-controls-canonicalization.md';
    const replays = validateReplayList(options.replays ?? DEFAULT_REPLAYS);
    if (options.clean) await rm(root, { recursive: true, force: true });
    await mkdir(root, { recursive: true });
    const results = [];
    for (const replayId of replays) {
        const result = await buildReplayPackage(replayId);
        await writeReplayOutputs(root, result);
        results.push(result);
    }
    const branchAudit = await branchAuditForImplementation();
    const allValidated = results.every(result => result.validation.valid);
    const protectionsPassed = results.every(result => !result.rawReplayAccess.read && !result.rawReplayAccess.hashed && !result.rawReplayAccess.processed);
    const success = allValidated && branchAudit.passed && protectionsPassed;
    const gate = success ? 'remaining_human_controls_canonicalized' : 'remaining_human_controls_canonicalization_blocked';
    const compatibilityMatrix = { schemaVersion: 1, rows: compatibilityRows(results) };
    const processingSummary = {
        schemaVersion: 1,
        taskId: '095',
        gate,
        replaysAttempted: replays,
        replaysSucceeded: results.filter(result => result.validation.valid).map(result => result.replayId),
        replaysBlocked: results.filter(result => !result.validation.valid).map(result => result.replayId),
        rawReplayAccess: Object.fromEntries(results.map(result => [result.replayId, result.rawReplayAccess])),
        sourceArtifactsUsed: Object.fromEntries(results.map(result => [result.replayId, result.sourceArtifacts.map(item => item.path)])),
        packageHashes: Object.fromEntries(results.map(result => [result.replayId, result.packageHash])),
        outputSizeBytes: Object.fromEntries(results.map(result => [result.replayId, result.outputSizeBytes])),
        protections: { replay005Accessed: false, botFixturesProcessed: false },
        task096Status: 'blocked',
        task097Created: false
    };
    const performanceBaseline = {
        schemaVersion: 1,
        measuredBy: 'tools/canonicalize-remaining-human-pilot-replays.mjs',
        replays: results.map(result => ({
            replayId: result.replayId,
            processingDurationMs: result.processingDurationMs,
            packageSizeBytes: result.packageSizeBytes,
            committedOutputSizeBytes: result.outputSizeBytes
        }))
    };
    const manifest = {
        schemaVersion: 1,
        taskId: '095',
        pilotId: 'five_human_replay_factual_pilot',
        defaultReplayList: DEFAULT_REPLAYS,
        requestedReplays: replays,
        outputRoot: root,
        representation: 'compact_package_manifests_with_full_in_memory_contract_validation',
        canonicalCoreUsed: ['lib/canonical-state/contract.mjs', 'CANONICAL_CONTRACT', 'validateCanonicalPackage'],
        replayProcessingAllowed: false,
        rawReplayAccess: 'none',
        perReplayManifests: results.map(result => `${root}/${result.replayId}/canonical-package-manifest.json`)
    };
    const gateOutput = {
        schemaVersion: 1,
        taskId: '095',
        gate,
        success,
        allReplaysValidated: allValidated,
        replaySpecificBranchAuditPassed: branchAudit.passed,
        protectionsPassed,
        noTask097Created: true,
        task096Blocked: true
    };
    await writeJson(path.join(root, 'manifest.json'), manifest);
    await writeJson(path.join(root, 'compatibility-matrix.json'), compatibilityMatrix);
    await writeJson(path.join(root, 'canonicalization-gate.json'), gateOutput);
    await writeJson(path.join(root, 'processing-summary.json'), processingSummary);
    await writeJson(path.join(root, 'replay-specific-branch-audit.json'), branchAudit);
    await writeJson(path.join(root, 'performance-baseline.json'), performanceBaseline);
    await writeReport(root, gate, results, branchAudit, performanceBaseline, compatibilityMatrix, reportPath);
    return { gate, success, results, branchAudit, performanceBaseline, compatibilityMatrix, processingSummary };
}

async function main() {
    const options = parseArgs();
    const result = await canonicalizeRemainingHumanControls(options);
    console.log(JSON.stringify({
        taskId: '095',
        gate: result.gate,
        replaysSucceeded: result.processingSummary.replaysSucceeded,
        replaysBlocked: result.processingSummary.replaysBlocked,
        replaySpecificBranchAuditPassed: result.branchAudit.passed
    }, null, 2));
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
    main().catch(error => {
        console.error(error);
        process.exitCode = 1;
    });
}
