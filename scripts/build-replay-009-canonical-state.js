import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const REPLAY_ID = 'replay_009';
const MATCH_ID = '91381179';
const BUILD_ID = '23916427';
const GATE = 'replay_009_canonical_factual_state_ready_with_constraints';
const OUT_DIR = 'output/replay-009-canonical';

const CATEGORY_PRIORITY = [
    'player_identity',
    'player_alive',
    'player_dead',
    'player_respawned',
    'player_respawn_unresolved',
    'player_net_worth',
    'team_net_worth',
    'entity_created',
    'candidate_entity_created',
    'entity_present',
    'candidate_entity_present',
    'entity_team_observed',
    'entity_health_observed',
    'entity_health_changed',
    'entity_health_zero_observed',
    'entity_raw_state_changed',
    'candidate_raw_property_changed',
    'entity_deleted',
    'candidate_entity_deleted'
];

const CATEGORY_INDEX = new Map(CATEGORY_PRIORITY.map((category, index) => [category, index]));

const SOURCE_PATHS = {
    players: 'output/replay-009-states/player-identity-foundation.json',
    life: 'output/replay-009-states/player-life-state-events.jsonl',
    playerNetWorth: 'output/replay-009-states/player-net-worth-series.jsonl',
    teamNetWorth: 'output/replay-009-states/team-net-worth-series.jsonl',
    entityKeys: 'output/replay-009-states/objective-structure-entity-keys.json',
    objectiveEvents: 'output/replay-009-states/objective-structure-factual-events.jsonl',
    eventSummary: 'output/replay-009-states/objective-structure-event-summary.json',
    comparisons: 'output/replay-009-validation/event-source-comparison.jsonl',
    categoryValidation: 'output/replay-009-validation/category-validation-summary.json',
    sync: 'output/replay-009-validation/source-synchronization.json',
    independentSummary: 'output/replay-009-validation/independent-validation-summary.json'
};

function stableStringify(value) {
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
    if (value && typeof value === 'object') {
        return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
}

function hashId(...parts) {
    return createHash('sha256').update(parts.map(part => String(part ?? '')).join('|')).digest('hex').slice(0, 16);
}

async function readJson(file) {
    return JSON.parse(await readFile(file, 'utf8'));
}

async function readJsonl(file) {
    const text = await readFile(file, 'utf8');
    return text.trim() ? text.trim().split(/\r?\n/u).map(line => JSON.parse(line)) : [];
}

async function writeJson(file, value) {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeJsonl(file, rows) {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, rows.map(row => JSON.stringify(row)).join('\n') + (rows.length ? '\n' : ''));
}

function schema(title, required) {
    return {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        title,
        type: 'object',
        required,
        additionalProperties: true
    };
}

async function writeSchemas() {
    await writeJson('schemas/canonical-replay-event.schema.json', schema('Canonical Replay Event', [
        'schemaVersion',
        'eventId',
        'replayId',
        'matchId',
        'buildId',
        'eventCategory',
        'eventType',
        'subject',
        'time',
        'value',
        'spatial',
        'provenance',
        'epistemicStatus',
        'independentValidation'
    ]));
    await writeJson('schemas/canonical-replay-entity.schema.json', schema('Canonical Replay Entity', [
        'schemaVersion',
        'replayId',
        'entityKey',
        'classification',
        'independentValidation'
    ]));
    await writeJson('schemas/canonical-replay-player.schema.json', schema('Canonical Replay Player', [
        'schemaVersion',
        'replayId',
        'players',
        'summary'
    ]));
    await writeJson('schemas/canonical-replay-snapshot.schema.json', schema('Canonical Replay Snapshot', [
        'schemaVersion',
        'replayId',
        'snapshotId',
        'demoTick',
        'parserSeconds',
        'players',
        'teamNetWorth',
        'entityPresence',
        'spatialStatus',
        'mechanicEffectsApplied'
    ]));
}

function emptySpatial() {
    return {
        worldPosition: null,
        mapPosition: null,
        mapRegion: null,
        lane: null,
        status: 'unavailable'
    };
}

function baseEvent({
    sourceTaskId,
    sourcePath,
    sourceEventId,
    category,
    eventType,
    subject,
    time,
    value,
    observationStatus = 'derived',
    confidence = 'supported',
    validationStatus = 'not_independently_validated',
    mechanicVersionStatus = 'not_required',
    semanticLimit = '',
    warnings = [],
    sourceOperation = ''
}) {
    const eventId = `canon:${hashId(REPLAY_ID, sourceTaskId, sourceEventId, subject.entityKey, category, time.demoTick, value?.sourceProperty, value?.current)}`;
    return {
        schemaVersion: '1.0.0',
        eventId,
        replayId: REPLAY_ID,
        matchId: MATCH_ID,
        buildId: BUILD_ID,
        eventCategory: category,
        eventType,
        subject: {
            subjectType: subject.subjectType ?? null,
            subjectId: subject.subjectId ?? null,
            playerKey: subject.playerKey ?? null,
            team: subject.team ?? null,
            entityKey: subject.entityKey ?? null,
            entityIndex: subject.entityIndex ?? null,
            entitySerial: subject.entitySerial ?? null,
            classId: subject.classId ?? null,
            className: subject.className ?? null,
            mechanicId: subject.mechanicId ?? null
        },
        time: {
            demoTick: time.demoTick ?? null,
            parserSeconds: time.parserSeconds ?? null,
            activeGameSeconds: null,
            timeBasis: 'parser_seconds',
            pauseAdjusted: false
        },
        value: value ?? {
            current: null,
            previous: null,
            unit: null,
            sourceProperty: null
        },
        spatial: emptySpatial(),
        provenance: {
            sourceTaskId,
            sourcePath,
            sourceEventId: sourceEventId ?? null,
            sourceOperation,
            parserDerived: true,
            visualValidationSourceId: null
        },
        epistemicStatus: {
            observationStatus,
            confidence,
            validationStatus,
            mechanicVersionStatus,
            mechanicEffectApplied: false,
            semanticLimit,
            warnings
        },
        independentValidation: {
            available: false,
            comparisonId: null,
            comparisonStatus: null,
            videoSeconds: null,
            predictedVideoSeconds: null,
            timingDeltaSeconds: null,
            timingWindowSeconds: null,
            synchronizationStatus: null,
            sourceIndependenceScope: null,
            limitations: []
        }
    };
}

function canonicalCategoryFromObjectiveEvent(event) {
    if (event.eventType === 'entity_created') return 'entity_created';
    if (event.eventType === 'entity_present') return 'entity_present';
    if (event.eventType === 'entity_deleted') return 'entity_deleted';
    if (event.eventType === 'team_observed') return 'entity_team_observed';
    if (event.eventType === 'health_observed') return 'entity_health_observed';
    if (event.eventType === 'health_changed') return 'entity_health_changed';
    if (event.eventType === 'health_zero_observed') return 'entity_health_zero_observed';
    if (event.eventType === 'raw_state_changed') return 'entity_raw_state_changed';
    if (event.eventType === 'candidate_entity_created') return 'candidate_entity_created';
    if (event.eventType === 'candidate_entity_present') return 'candidate_entity_present';
    if (event.eventType === 'candidate_entity_deleted') return 'candidate_entity_deleted';
    if (event.eventType === 'candidate_raw_property_changed') return 'candidate_raw_property_changed';
    return event.eventType;
}

function classificationForEntity(entity) {
    if (entity.mechanicId === 'mid_boss') return 'mid_boss';
    if (entity.className === 'CNPC_BaseDefenseSentry') return 'guardian';
    if (entity.className === 'CNPC_Boss_Tier2') return 'walker';
    if (entity.className === 'CNPC_BarrackBoss') return 'barrack_boss_candidate';
    if (entity.className === 'CNPC_Boss_Tier3') return 'boss_tier3_candidate';
    if (entity.className === 'CNPC_TrooperBoss') return 'trooper_boss_candidate';
    if (entity.mechanicId === 'spirit_urn') return 'spirit_urn_candidate';
    return 'unknown_objective_candidate';
}

function categoryForComparison(row) {
    if (row.mechanicId === 'mid_boss') return 'mid_boss';
    if (row.mechanicId === 'walker') return 'walker';
    if (row.mechanicId === 'guardian') return 'guardian';
    if (row.mechanicId === 'spirit_urn') return 'spirit_urn_candidates';
    if (row.className === 'CNPC_BarrackBoss') return 'barrack_boss';
    if (row.className === 'CNPC_Boss_Tier3') return 'boss_tier3';
    if (row.className === 'CNPC_TrooperBoss') return 'trooper_boss';
    return row.mechanicId ?? 'unknown';
}

function validationStatusFromComparison(row) {
    if (row.comparisonStatus === 'visually_confirmed') return 'visually_confirmed';
    if (row.comparisonStatus === 'source_supported') return 'visually_supported';
    if (row.comparisonStatus === 'not_visible') return 'not_observable';
    if (row.comparisonStatus === 'identity_ambiguous' || row.comparisonStatus === 'timing_ambiguous') return 'partially_supported';
    if (row.comparisonStatus === 'not_comparable') return 'not_tested';
    return 'not_independently_validated';
}

function buildTimingWindow(sync) {
    const seconds = sync.selectedMapping?.maximumResidualSeconds ?? 22.782;
    return { before: seconds, after: seconds };
}

function applyValidationOverlay(events, comparisons, categorySummary, sync) {
    const bySourceEvent = new Map(events.map(event => [event.provenance.sourceEventId, event]));
    const overlay = [];
    const unmatched = [];
    const categoryByName = new Map(categorySummary.categories.map(row => [row.category, row]));
    const timingWindow = buildTimingWindow(sync);
    const synchronizationStatus = sync.synchronizationStatus;
    const sourceIndependenceScope = 'independent visual rendering path; not independent match-data origin';

    for (const row of comparisons) {
        const canonicalEvent = bySourceEvent.get(row.parserEventId);
        const category = categoryForComparison(row);
        const categoryMeta = categoryByName.get(category) ?? null;
        const validationStatus = validationStatusFromComparison(row);
        const overlayRecord = {
            comparisonId: row.comparisonId,
            canonicalEventId: canonicalEvent?.eventId ?? null,
            parserEventId: row.parserEventId,
            category,
            comparisonStatus: row.comparisonStatus,
            videoSeconds: null,
            predictedVideoSeconds: row.predictedVideoSeconds ?? null,
            timingDeltaSeconds: row.timingDeltaSeconds ?? null,
            timingWindowSeconds: timingWindow,
            visibility: row.visibility ?? null,
            identityStatus: categoryMeta?.identityStatus ?? null,
            timingStatus: categoryMeta?.timingStatus ?? null,
            confidence: row.confidence,
            semanticLimits: [row.semanticLimit].filter(Boolean),
            limitations: [
                ...(row.notes ?? []),
                ...(categoryMeta?.limitations ?? []),
                'Video synchronization is usable with constraints and is not exact correspondence.'
            ]
        };
        overlay.push(overlayRecord);
        if (!canonicalEvent) {
            unmatched.push(overlayRecord);
            continue;
        }
        canonicalEvent.provenance.visualValidationSourceId = 'replay_009_video';
        canonicalEvent.epistemicStatus.validationStatus = validationStatus;
        canonicalEvent.independentValidation = {
            available: true,
            comparisonId: row.comparisonId,
            comparisonStatus: row.comparisonStatus,
            videoSeconds: null,
            predictedVideoSeconds: row.predictedVideoSeconds ?? null,
            timingDeltaSeconds: row.timingDeltaSeconds ?? null,
            timingWindowSeconds: timingWindow,
            synchronizationStatus,
            sourceIndependenceScope,
            limitations: overlayRecord.limitations
        };
    }
    return { overlay, unmatched };
}

function sortEvents(a, b) {
    const tickA = a.time.demoTick ?? Number.POSITIVE_INFINITY;
    const tickB = b.time.demoTick ?? Number.POSITIVE_INFINITY;
    if (tickA !== tickB) return tickA - tickB;
    const secondsA = a.time.parserSeconds ?? Number.POSITIVE_INFINITY;
    const secondsB = b.time.parserSeconds ?? Number.POSITIVE_INFINITY;
    if (secondsA !== secondsB) return secondsA - secondsB;
    const catA = CATEGORY_INDEX.get(a.eventCategory) ?? 999;
    const catB = CATEGORY_INDEX.get(b.eventCategory) ?? 999;
    if (catA !== catB) return catA - catB;
    return a.eventId.localeCompare(b.eventId);
}

function buildSnapshots(players, lifeEvents, teamNetWorth, entityEvents) {
    const lifeByTime = new Map();
    for (const event of lifeEvents) {
        const key = `${event.demoTick}:${event.parserSeconds}`;
        if (!lifeByTime.has(key)) lifeByTime.set(key, []);
        lifeByTime.get(key).push(event);
    }
    const ticks = new Set([0, 138925]);
    for (const event of lifeEvents) ticks.add(event.demoTick);
    for (const event of entityEvents.filter(row => row.eventType === 'entity_present' || row.eventType === 'candidate_entity_present')) {
        if ((event.demoTick ?? -1) >= 0) ticks.add(event.demoTick);
    }
    const secondsByTick = new Map();
    for (const row of [...lifeEvents, ...teamNetWorth, ...entityEvents]) {
        if ((row.demoTick ?? -1) >= 0 && row.parserSeconds !== null && row.parserSeconds !== undefined) {
            secondsByTick.set(row.demoTick, row.parserSeconds);
        }
    }
    secondsByTick.set(0, 0);
    secondsByTick.set(138925, 2170.703);

    const state = Object.fromEntries(players.map(player => [player.playerKey, {
        state: 'alive',
        carried: true,
        sourceObservationTick: player.firstSeenTick,
        expiryPolicy: 'carried_until_observed_life_state_change'
    }]));
    const entityPresence = new Map();
    const teamByTick = new Map(teamNetWorth.map(row => [row.demoTick, row]));
    const entityRowsByTick = new Map();
    for (const row of entityEvents) {
        if ((row.demoTick ?? -1) < 0) continue;
        if (!entityRowsByTick.has(row.demoTick)) entityRowsByTick.set(row.demoTick, []);
        entityRowsByTick.get(row.demoTick).push(row);
    }

    const snapshots = [];
    for (const tick of [...ticks].sort((a, b) => a - b)) {
        for (const row of lifeByTime.get(`${tick}:${secondsByTick.get(tick)}`) ?? lifeEvents.filter(event => event.demoTick === tick)) {
            state[row.playerKey] = {
                state: row.toState === 'dead' ? 'dead' : 'alive',
                carried: false,
                sourceObservationTick: row.demoTick,
                expiryPolicy: 'carried_until_next_life_state_event'
            };
        }
        for (const row of entityRowsByTick.get(tick) ?? []) {
            if (row.eventType.includes('deleted')) entityPresence.delete(row.entityKey);
            if (row.eventType.includes('present')) {
                entityPresence.set(row.entityKey, {
                    mechanicId: row.mechanicId,
                    className: row.className,
                    carried: false,
                    sourceObservationTick: row.demoTick,
                    expiryPolicy: 'carried_until_deletion'
                });
            }
        }
        const team = teamByTick.get(tick);
        snapshots.push({
            schemaVersion: '1.0.0',
            replayId: REPLAY_ID,
            snapshotId: `snapshot:${tick}`,
            demoTick: tick,
            parserSeconds: secondsByTick.get(tick) ?? null,
            players: JSON.parse(JSON.stringify(state)),
            teamNetWorth: team ? {
                team2NetWorth: team.team2NetWorth,
                team3NetWorth: team.team3NetWorth,
                differenceTeam2MinusTeam3: team.differenceTeam2MinusTeam3,
                carried: false,
                sourceObservationTick: team.demoTick
            } : {
                carried: true,
                sourceObservationTick: null,
                expiryPolicy: 'not_interpolated'
            },
            entityPresence: Object.fromEntries(entityPresence),
            spatialStatus: 'unavailable',
            mechanicEffectsApplied: false
        });
    }
    return snapshots;
}

function sourceIntegrationMatrix() {
    return [
        {
            sourceTaskId: '060',
            sourcePath: SOURCE_PATHS.players,
            sourceRecordType: 'player registry',
            canonicalCategory: 'player_identity',
            included: true,
            inclusionReason: 'Task 060 validated replay-009 player identities and teams with constraints.',
            confidenceMapping: { supported: 'supported' },
            validationMapping: { default: 'internally_consistent' },
            semanticLimits: ['player identity is parser-derived and not visual identity proof'],
            deduplicationKey: ['playerKey', 'controllerEntityIndex']
        },
        {
            sourceTaskId: '060',
            sourcePath: SOURCE_PATHS.life,
            sourceRecordType: 'player life event',
            canonicalCategory: 'player_alive/player_dead/player_respawned',
            included: true,
            inclusionReason: 'Task 060 reconciled death counters and lifecycle events.',
            confidenceMapping: { confirmed: 'confirmed', supported: 'supported' },
            validationMapping: { default: 'internally_consistent' },
            semanticLimits: ['respawn duration is parser-time observation, not mechanic timer validation'],
            deduplicationKey: ['stateId']
        },
        {
            sourceTaskId: '060',
            sourcePath: SOURCE_PATHS.playerNetWorth,
            sourceRecordType: 'player net-worth endpoint',
            canonicalCategory: 'player_net_worth',
            included: true,
            inclusionReason: 'Task 060 exposes m_iGoldNetWorth endpoints.',
            confidenceMapping: { supported: 'supported' },
            validationMapping: { default: 'internally_consistent' },
            semanticLimits: ['net worth is not spendable, secured, unsecured, or effective combat power'],
            deduplicationKey: ['stateId']
        },
        {
            sourceTaskId: '063',
            sourcePath: SOURCE_PATHS.objectiveEvents,
            sourceRecordType: 'objective/structure factual event',
            canonicalCategory: 'entity/candidate event',
            included: true,
            inclusionReason: 'Task 063 normalized direct class/property/lifecycle evidence.',
            confidenceMapping: { confirmed: 'confirmed', supported: 'supported', uncertain: 'uncertain' },
            validationMapping: { default: 'not_independently_validated', overlay: 'Task 064 comparison-specific only' },
            semanticLimits: ['entity deletion is not destruction or completion', 'health zero is not kill/destruction'],
            deduplicationKey: ['eventId']
        },
        {
            sourceTaskId: '064',
            sourcePath: SOURCE_PATHS.comparisons,
            sourceRecordType: 'independent visual comparison',
            canonicalCategory: 'validation overlay',
            included: true,
            inclusionReason: 'Task 064 overlays comparison-specific visual validation without duplicating gameplay events.',
            confidenceMapping: { supported: 'supported', confirmed: 'confirmed', uncertain: 'uncertain' },
            validationMapping: {
                visually_confirmed: 'visually_confirmed',
                source_supported: 'visually_supported',
                not_visible: 'not_observable',
                identity_ambiguous: 'partially_supported'
            },
            semanticLimits: ['visual synchronization is bounded, not exact', 'camera absence is not entity absence'],
            deduplicationKey: ['parserEventId', 'comparisonId']
        }
    ];
}

function capabilityMatrix() {
    return {
        schemaVersion: 1,
        replayId: REPLAY_ID,
        capabilities: [
            ['player identity', 'ready_with_constraints', '12 players, 6v6, parser-derived continuity'],
            ['player life/death', 'ready_with_constraints', '84 matched deaths'],
            ['respawn observation', 'ready_with_constraints', '82 observed returns and 2 unresolved before replay end'],
            ['player net worth', 'ready_with_constraints', 'm_iGoldNetWorth endpoints only'],
            ['team net worth', 'ready_with_constraints', 'team endpoint totals from m_iGoldNetWorth'],
            ['Mid Boss raw state', 'ready_with_constraints', 'partially visually validated at event level'],
            ['Guardian raw state', 'ready_with_constraints', 'not visually observable in Task 064 sample'],
            ['Walker raw state', 'ready_with_constraints', 'partially visually validated at event level'],
            ['Barrack/BossTier3/TrooperBoss raw state', 'partial', 'identity ambiguous at class level'],
            ['Spirit Urn candidate observability', 'partial', 'candidate identity unresolved'],
            ['Rejuvenator observability', 'unavailable', 'no canonical Rejuvenator events'],
            ['spatial regions', 'unavailable', 'Task 061 did not validate map transform or regions'],
            ['mechanic activation', 'blocked', 'build 23916427 mapping unresolved'],
            ['macro interpretation', 'blocked', 'not implemented and not authorized']
        ].map(([capability, status, evidence]) => ({ capability, status, evidence }))
    };
}

async function main() {
    await mkdir(OUT_DIR, { recursive: true });
    await writeSchemas();

    const players = await readJson(SOURCE_PATHS.players);
    const lifeEvents = await readJsonl(SOURCE_PATHS.life);
    const playerNetWorth = await readJsonl(SOURCE_PATHS.playerNetWorth);
    const teamNetWorth = await readJsonl(SOURCE_PATHS.teamNetWorth);
    const entityKeys = await readJson(SOURCE_PATHS.entityKeys);
    const objectiveEvents = await readJsonl(SOURCE_PATHS.objectiveEvents);
    const eventSummary = await readJson(SOURCE_PATHS.eventSummary);
    const comparisons = await readJsonl(SOURCE_PATHS.comparisons);
    const categoryValidation = await readJson(SOURCE_PATHS.categoryValidation);
    const sync = await readJson(SOURCE_PATHS.sync);
    const independentSummary = await readJson(SOURCE_PATHS.independentSummary);

    const canonicalEvents = [];
    for (const player of players.players) {
        canonicalEvents.push(baseEvent({
            sourceTaskId: '060',
            sourcePath: SOURCE_PATHS.players,
            sourceEventId: `player:${player.playerKey}`,
            category: 'player_identity',
            eventType: 'player_identity',
            subject: {
                subjectType: 'player',
                subjectId: player.playerKey,
                playerKey: player.playerKey,
                team: player.team
            },
            time: { demoTick: player.firstSeenTick, parserSeconds: null },
            value: { current: player.identityStatus, previous: null, unit: null, sourceProperty: 'player_identity_foundation' },
            confidence: player.identityStatus === 'supported' ? 'supported' : 'unknown',
            validationStatus: 'internally_consistent',
            semanticLimit: 'player identity is parser-derived and does not prove visual identity',
            warnings: player.warnings
        }));
    }

    for (const row of lifeEvents) {
        const category = row.toState === 'dead' ? 'player_dead' : row.fromState === 'dead' ? 'player_respawned' : 'player_alive';
        canonicalEvents.push(baseEvent({
            sourceTaskId: '060',
            sourcePath: SOURCE_PATHS.life,
            sourceEventId: row.stateId,
            category,
            eventType: row.toState,
            subject: {
                subjectType: 'player',
                subjectId: row.playerKey,
                playerKey: row.playerKey,
                team: row.team,
                entityIndex: row.pawnEntityIndex
            },
            time: { demoTick: row.demoTick, parserSeconds: row.parserSeconds },
            value: { current: row.toState, previous: row.fromState, unit: null, sourceProperty: 'life_state' },
            confidence: row.confidence,
            validationStatus: 'internally_consistent',
            semanticLimit: row.toState === 'dead' ? 'death event is factual; killer/assist and strategic meaning are not inferred' : 'respawn is parser-time active-state return, not official respawn timer validation',
            warnings: row.warnings
        }));
    }

    for (const row of playerNetWorth) {
        canonicalEvents.push(baseEvent({
            sourceTaskId: '060',
            sourcePath: SOURCE_PATHS.playerNetWorth,
            sourceEventId: row.stateId,
            category: 'player_net_worth',
            eventType: 'player_net_worth_observed',
            subject: {
                subjectType: 'player',
                subjectId: row.playerKey,
                playerKey: row.playerKey,
                team: row.team
            },
            time: { demoTick: row.demoTick, parserSeconds: row.parserSeconds },
            value: { current: row.netWorth, previous: null, unit: 'm_iGoldNetWorth', sourceProperty: row.sourceField },
            confidence: row.confidence,
            validationStatus: 'internally_consistent',
            semanticLimit: 'm_iGoldNetWorth is not spendable, secured, unsecured, income source, or effective combat power',
            warnings: row.warnings
        }));
    }

    for (const row of teamNetWorth) {
        canonicalEvents.push(baseEvent({
            sourceTaskId: '060',
            sourcePath: SOURCE_PATHS.teamNetWorth,
            sourceEventId: `team_net_worth:${row.demoTick}`,
            category: 'team_net_worth',
            eventType: 'team_net_worth_observed',
            subject: {
                subjectType: 'team',
                subjectId: 'teams',
                team: null
            },
            time: { demoTick: row.demoTick, parserSeconds: row.parserSeconds },
            value: {
                current: {
                    team2NetWorth: row.team2NetWorth,
                    team3NetWorth: row.team3NetWorth,
                    differenceTeam2MinusTeam3: row.differenceTeam2MinusTeam3,
                    leadingTeam: row.leadingTeam
                },
                previous: null,
                unit: 'm_iGoldNetWorth',
                sourceProperty: row.sourceField
            },
            confidence: row.confidence,
            validationStatus: 'internally_consistent',
            semanticLimit: 'team net-worth difference is not comeback eligibility or effective combat power',
            warnings: row.warnings
        }));
    }

    for (const row of objectiveEvents) {
        const category = canonicalCategoryFromObjectiveEvent(row);
        const candidate = category.startsWith('candidate_');
        canonicalEvents.push(baseEvent({
            sourceTaskId: '063',
            sourcePath: SOURCE_PATHS.objectiveEvents,
            sourceEventId: row.eventId,
            category,
            eventType: row.eventType,
            subject: {
                subjectType: candidate ? 'candidate_entity' : 'entity',
                subjectId: row.entityIndex === null ? row.eventId : String(row.entityIndex),
                entityKey: row.eventId.split(':').slice(1, 6).join(':'),
                entityIndex: row.entityIndex,
                entitySerial: null,
                classId: row.classId,
                className: row.className,
                mechanicId: row.mechanicId,
                team: row.team
            },
            time: { demoTick: row.demoTick, parserSeconds: row.parserSeconds },
            value: {
                current: row.rawValue,
                previous: row.previousRawValue,
                unit: null,
                sourceProperty: row.sourceProperty
            },
            observationStatus: candidate ? 'candidate' : 'direct',
            confidence: row.confidence,
            validationStatus: 'not_independently_validated',
            mechanicVersionStatus: row.mechanicId ? 'unresolved' : 'not_required',
            semanticLimit: row.semanticLimit,
            warnings: row.warnings,
            sourceOperation: row.sourceOperation
        }));
    }

    const { overlay, unmatched } = applyValidationOverlay(canonicalEvents, comparisons, categoryValidation, sync);

    const seen = new Set();
    const deduped = [];
    const duplicates = [];
    for (const event of canonicalEvents) {
        const key = stableStringify({
            source: event.provenance.sourceTaskId,
            sourceEvent: event.provenance.sourceEventId,
            category: event.eventCategory,
            tick: event.time.demoTick,
            value: event.value.current
        });
        if (seen.has(key)) {
            duplicates.push(event);
        } else {
            seen.add(key);
            deduped.push(event);
        }
    }
    deduped.sort(sortEvents);

    const timelineEvents = deduped.filter(event => (event.time.demoTick ?? -1) >= 0 || event.time.parserSeconds !== null);
    const nonTimelineEvents = deduped.filter(event => !timelineEvents.includes(event));

    const categoryMap = new Map(categoryValidation.categories.map(row => [row.category, row]));
    const entityRegistry = [
        ...players.players.flatMap(player => [
            {
                schemaVersion: '1.0.0',
                replayId: REPLAY_ID,
                entityKey: `controller:${player.controllerEntityIndex}`,
                entityIndex: player.controllerEntityIndex,
                serial: null,
                handle: null,
                classId: null,
                className: null,
                classification: 'player_controller',
                playerKey: player.playerKey,
                team: player.team,
                firstSeenTick: player.firstSeenTick,
                lastSeenTick: player.lastSeenTick,
                independentValidation: { categoryStatus: 'not_required', sampled: false, visible: false, identityStatus: 'not_required', timingStatus: 'not_required', comparisonIds: [], limitations: [] }
            },
            ...player.pawnEntityIndices.map(pawn => ({
                schemaVersion: '1.0.0',
                replayId: REPLAY_ID,
                entityKey: `pawn:${pawn}`,
                entityIndex: pawn,
                serial: null,
                handle: null,
                classId: null,
                className: null,
                classification: 'player_pawn',
                playerKey: player.playerKey,
                team: player.team,
                firstSeenTick: player.firstSeenTick,
                lastSeenTick: player.lastSeenTick,
                independentValidation: { categoryStatus: 'not_required', sampled: false, visible: false, identityStatus: 'not_required', timingStatus: 'not_required', comparisonIds: [], limitations: [] }
            }))
        ]),
        ...entityKeys.entities.map(entity => {
            const classification = classificationForEntity(entity);
            const comparisonRows = overlay.filter(row => row.parserEventId.includes(entity.entityKey));
            const categoryName = classification === 'mid_boss' ? 'mid_boss'
                : classification === 'walker' ? 'walker'
                    : classification === 'guardian' ? 'guardian'
                        : classification === 'spirit_urn_candidate' ? 'spirit_urn_candidates'
                            : classification === 'barrack_boss_candidate' ? 'barrack_boss'
                                : classification === 'boss_tier3_candidate' ? 'boss_tier3'
                                    : classification === 'trooper_boss_candidate' ? 'trooper_boss'
                                        : classification;
            const category = categoryMap.get(categoryName);
            return {
                schemaVersion: '1.0.0',
                replayId: REPLAY_ID,
                entityKey: entity.entityKey,
                entityIndex: entity.entityIndex,
                serial: entity.serial,
                handle: entity.handle,
                classId: entity.classId,
                className: entity.className,
                classification,
                playerKey: null,
                team: null,
                firstSeenTick: entity.creationTick,
                lastSeenTick: entity.deletionTick,
                independentValidation: {
                    categoryStatus: category?.overallStatus ?? 'not_independently_validated',
                    sampled: comparisonRows.length > 0,
                    visible: comparisonRows.some(row => !['not_visible', 'not_comparable'].includes(row.comparisonStatus)),
                    identityStatus: category?.identityStatus ?? 'not_independently_validated',
                    timingStatus: category?.timingStatus ?? 'not_independently_validated',
                    comparisonIds: comparisonRows.map(row => row.comparisonId),
                    limitations: category?.limitations ?? []
                }
            };
        })
    ];

    const playerRegistry = {
        schemaVersion: '1.0.0',
        replayId: REPLAY_ID,
        matchId: MATCH_ID,
        buildId: BUILD_ID,
        summary: {
            ...players.summary,
            observedDeaths: 84,
            observedReturns: 82,
            unresolvedReturnsBeforeReplayEnd: 2
        },
        players: players.players.map(player => ({
            ...player,
            independentValidation: {
                status: 'not_required',
                reason: 'Task 064 validates objective/structure events, not player visual identity.'
            }
        }))
    };

    const snapshots = buildSnapshots(players.players, lifeEvents, teamNetWorth, objectiveEvents);
    const sourceMatrix = sourceIntegrationMatrix();
    const capabilities = capabilityMatrix();
    const validationSummary = {
        schemaVersion: 1,
        taskId: '065',
        replayId: REPLAY_ID,
        gate: GATE,
        sourceTasksIntegrated: ['056', '057', '059', '060', '061', '062', '063', '064'],
        playerRegistryCount: playerRegistry.players.length,
        entityRegistryCount: entityRegistry.length,
        canonicalEventCount: deduped.length,
        timelineEventCount: timelineEvents.length,
        nonTimelineEventCount: nonTimelineEvents.length,
        validationOverlayCount: overlay.length,
        unmatchedValidationCount: unmatched.length,
        snapshotCount: snapshots.length,
        duplicatesRemoved: duplicates.length,
        mechanicEffectsApplied: 0,
        spatialStatus: 'unavailable',
        synchronizationUncertainty: {
            status: sync.synchronizationStatus,
            timingWindowSeconds: buildTimingWindow(sync),
            medianResidualSeconds: sync.selectedMapping?.medianResidualSeconds,
            maximumResidualSeconds: sync.selectedMapping?.maximumResidualSeconds
        },
        categoryValidation: independentSummary.categorySummary,
        replay005Protection: 'not_processed_or_inspected',
        botFixtureExclusion: 'not_processed_or_inspected'
    };

    const gate = {
        schemaVersion: 1,
        taskId: '065',
        gate: GATE,
        reason: 'Canonical factual replay-009 state is queryable and provenance-preserving, but remains constrained by spatial, mechanic-version, class-identity, and visual-validation gaps.',
        mechanicEffectsApplied: 0,
        spatialStatus: 'unavailable',
        buildMappingStatus: 'unresolved',
        validationOverlayStatus: 'event_level_only'
    };

    const nonTimelineMetadata = {
        schemaVersion: 1,
        replayId: REPLAY_ID,
        categoryPriority: CATEGORY_PRIORITY,
        eventsWithoutParserTimeline: nonTimelineEvents,
        note: 'Events without parser time are metadata and are not forced onto the parser timeline.'
    };

    await writeJson(`${OUT_DIR}/source-integration-matrix.json`, { schemaVersion: 1, replayId: REPLAY_ID, sources: sourceMatrix });
    await writeJson(`${OUT_DIR}/player-registry.json`, playerRegistry);
    await writeJson(`${OUT_DIR}/entity-registry.json`, { schemaVersion: '1.0.0', replayId: REPLAY_ID, entities: entityRegistry });
    await writeJsonl(`${OUT_DIR}/factual-events.jsonl`, timelineEvents);
    await writeJson(`${OUT_DIR}/non-timeline-metadata.json`, nonTimelineMetadata);
    await writeJson(`${OUT_DIR}/independent-validation-overlay.json`, { schemaVersion: 1, replayId: REPLAY_ID, overlays: overlay });
    await writeJsonl(`${OUT_DIR}/snapshots.jsonl`, snapshots);
    await writeJson(`${OUT_DIR}/deduplication-audit.json`, { schemaVersion: 1, replayId: REPLAY_ID, duplicatesRemoved: duplicates.length, duplicateEvents: duplicates.map(event => event.eventId), totalBefore: canonicalEvents.length, totalAfter: deduped.length });
    await writeJson(`${OUT_DIR}/unmatched-validation-records.json`, { schemaVersion: 1, replayId: REPLAY_ID, unmatchedCount: unmatched.length, records: unmatched });
    await writeJson(`${OUT_DIR}/capability-matrix.json`, capabilities);
    await writeJson(`${OUT_DIR}/validation-summary.json`, validationSummary);
    await writeJson(`${OUT_DIR}/canonical-state-gate.json`, gate);
    await writeFile(`${OUT_DIR}/README.md`, `# Replay 009 Canonical Factual State\n\nTask 065 builds a canonical, provenance-preserving factual state layer for replay 009.\n\nCanonical does not mean independently validated. Task 064 visual validation is attached only to matched event-level overlays. Category-level validation does not validate every event.\n\nTime basis is parser seconds and demo ticks only. Active-game time and pause-adjusted time are unavailable. Spatial region, lane, objective proximity, and map projection fields are unavailable.\n\nMechanic effects applied: 0. Entity deletion is not destruction or objective completion. Health zero is not a kill/destruction conclusion. Camera absence is not entity absence.\n`);
    await writeFile('reports/replay-009-canonical-factual-state-schema.md', `# Replay 009 Canonical Factual State Schema\n\nTask 065 integrates replay-009 factual outputs from Tasks 056, 057, 059, 060, 061, 062, 063, and 064 into one canonical event, registry, snapshot, and validation-overlay layer.\n\n## Gate\n\n\`${GATE}\`\n\n## Counts\n\n- Player registry: ${playerRegistry.players.length}\n- Entity registry: ${entityRegistry.length}\n- Canonical events: ${deduped.length}\n- Timeline events: ${timelineEvents.length}\n- Non-timeline metadata events: ${nonTimelineEvents.length}\n- Validation overlays: ${overlay.length}\n- Unmatched validation records: ${unmatched.length}\n- Snapshots: ${snapshots.length}\n- Duplicates removed: ${duplicates.length}\n\n## Boundaries\n\nCanonical does not mean independently validated. Mid Boss and Walker have event-level visual support for sampled records only. Guardian sampled records are not observable, Patron/base remains class-ambiguous, Spirit Urn remains candidate-only, and Rejuvenator is unavailable.\n\nMechanic effects applied: 0. Spatial status: unavailable. Build 23916427 mechanic mapping: unresolved.\n`);

    console.log(JSON.stringify(validationSummary, null, 2));
}

await main();
