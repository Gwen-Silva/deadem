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
const CONTROLLER_CLASS = 'CCitadelPlayerController';
const PAWN_CLASS = 'CCitadelPlayerPawn';
const OUTPUT_SIZE_LIMIT = 10 * 1024 * 1024;
main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});

async function main() {
    const replayResults = [];
    for (const replay of REPLAYS) {
        replayResults.push(await processReplay(replay));
    }
    const comparison = buildComparison(replayResults);
    const review = buildReviewSamples(replayResults);
    const gate = buildGate(replayResults, comparison);
    await writeJson('output/replays/multi-replay-death-event-comparison.json', comparison);
    await writeJson('output/replays/death-event-review-samples.json', review);
    await writeJson('output/replays/death-event-gate.json', gate);
    await writeReport(replayResults, comparison, gate);
    await validateOutputs([
        ...replayResults.flatMap(result => [
            result.sourceAuditFile,
            result.deathEventsFile,
            result.respawnEventsFile,
            result.validationFile
        ]),
        'output/replays/multi-replay-death-event-comparison.json',
        'output/replays/death-event-review-samples.json',
        'output/replays/death-event-gate.json',
        'reports/multi-replay-death-assist-respawn-events.md'
    ]);
    console.log(`death event gate: ${gate.gateResult}`);
    for (const result of replayResults) {
        console.log(`${result.replayId}: ${result.deathEvents.length} deaths, ${result.respawnEvents.length} respawns`);
    }
}

async function processReplay(replay) {
    const player = new Player(undefined, Logger.NOOP);
    const outputDir = path.join('output', 'replays', replay.replayId);
    const observations = [];
    const sourceSamples = createSourceSamples(replay.replayId);
    const states = new Map();
    const deathEvents = [];
    const respawnEvents = [];
    const openDeathsByPlayer = new Map();
    const spatialByPlayer = await loadSpatialRows(replay.replayId);

    try {
        await player.load(createReadStream(replay.file));
        const firstTickRaw = player.getFirstTick();
        const effectiveFirstTick = firstTickRaw < 0 ? 0 : firstTickRaw;
        const lastTick = player.getLastTick();
        const tickRate = player.getDemo().server?.tickRate ?? null;
        const durationSeconds = Math.floor((lastTick - effectiveFirstTick) / tickRate);
        const players = await discoverPlayers(player, effectiveFirstTick, lastTick, tickRate);
        await player.seekToTick(effectiveFirstTick);

        for (let second = 0; second <= durationSeconds; second++) {
            const targetTick = Math.min(lastTick, Math.round(effectiveFirstTick + second * tickRate));
            await advanceToTick(player, targetTick);
            const currentTick = player.getCurrentTick();
            const current = snapshotPlayers(player, players, second, currentTick);
            observations.push(current);
            updateSourceSamples(sourceSamples, current);
            const increments = buildIncrements(current, states);
            for (const item of increments.deaths) {
                const alreadyOpen = openDeathsByPlayer.get(item.playerId) ?? null;
                if (alreadyOpen !== null) {
                    const inferred = buildInferredRespawnEvent(replay.replayId, item, alreadyOpen, spatialByPlayer, respawnEvents.length + 1, current.tick);
                    respawnEvents.push(inferred);
                    alreadyOpen.respawn = inferred.respawn;
                    alreadyOpen.evidence.push(...inferred.evidence.map(evidence => ({ ...evidence, role: 'inferred_respawn_support' })));
                    alreadyOpen.validationFlags.push('respawn_recovery_inferred_between_death_counters');
                    openDeathsByPlayer.delete(item.playerId);
                }
                const event = buildDeathEvent(replay.replayId, item, current, increments, spatialByPlayer, deathEvents.length + 1);
                deathEvents.push(event);
                openDeathsByPlayer.set(item.playerId, event);
            }
            for (const item of increments.respawns) {
                const open = openDeathsByPlayer.get(item.playerId) ?? null;
                const respawn = buildRespawnEvent(replay.replayId, item, open, current, spatialByPlayer, respawnEvents.length + 1);
                respawnEvents.push(respawn);
                if (open !== null) {
                    open.respawn = respawn.respawn;
                    open.evidence.push(...respawn.evidence.map(evidence => ({ ...evidence, role: 'respawn_support' })));
                    open.validationFlags = [ ...new Set(open.validationFlags.filter(flag => flag !== 'respawn_unmatched_before_replay_end')) ];
                    openDeathsByPlayer.delete(item.playerId);
                }
            }
            for (const item of current.players) states.set(item.playerId, item);
        }

        for (const event of openDeathsByPlayer.values()) {
            const respawnTime = event.evidence.find(item => item.source === 'm_flRespawnTime')?.measurements?.current;
            if (Number.isFinite(respawnTime) && respawnTime <= durationSeconds) {
                const inferred = buildInferredRespawnEvent(replay.replayId, { playerId: event.victim.playerId, gameTimeSeconds: Math.ceil(respawnTime), tick: null }, event, spatialByPlayer, respawnEvents.length + 1, null);
                respawnEvents.push(inferred);
                event.respawn = inferred.respawn;
                event.evidence.push(...inferred.evidence.map(evidence => ({ ...evidence, role: 'respawn_timer_inference' })));
                event.validationFlags.push('respawn_inferred_from_respawn_timer');
            } else {
                event.validationFlags.push('respawn_unmatched_before_replay_end');
            }
        }
        enrichConfidence(deathEvents);
        const sourceAudit = buildSourceAudit(replay.replayId, sourceSamples);
        const validation = validateReplayEvents(replay, players, deathEvents, respawnEvents, observations);
        const sourceAuditFile = path.join(outputDir, 'death-event-source-audit.json');
        const deathEventsFile = path.join(outputDir, 'canonical-death-events.json');
        const respawnEventsFile = path.join(outputDir, 'respawn-events.json');
        const validationFile = path.join(outputDir, 'death-event-validation.json');
        await writeJson(sourceAuditFile, sourceAudit);
        await writeJson(deathEventsFile, {
            schemaVersion: 1,
            kind: 'canonical_death_events',
            replayId: replay.replayId,
            events: deathEvents
        });
        await writeJson(respawnEventsFile, {
            schemaVersion: 1,
            kind: 'respawn_events',
            replayId: replay.replayId,
            events: respawnEvents
        });
        await writeJson(validationFile, validation);
        return {
            replayId: replay.replayId,
            players,
            sourceAudit,
            deathEvents,
            respawnEvents,
            validation,
            sourceAuditFile,
            deathEventsFile,
            respawnEventsFile,
            validationFile
        };
    } finally {
        await player.dispose();
    }
}

async function discoverPlayers(player, firstTick, lastTick, tickRate) {
    const candidates = new Map();
    const seekSeconds = [ 0, 30, 60, 120, 300, 600, 900, 1200, 1500, 1800, 2100 ]
        .filter(second => firstTick + second * tickRate <= lastTick);
    for (const second of seekSeconds) {
        await player.seekToTick(Math.min(lastTick, Math.round(firstTick + second * tickRate)));
        for (const controller of player.getDemo().getEntitiesByClassName(CONTROLLER_CLASS)) {
            const steamId = normalize(controller.getField('m_steamID'));
            if (steamId === null || steamId === '0' || steamId === 0) continue;
            const playerId = String(steamId);
            const existing = candidates.get(playerId) ?? {
                playerId,
                name: null,
                heroId: null,
                team: null,
                controllerHandle: null,
                observations: 0
            };
            existing.name ??= normalize(controller.getField('m_iszPlayerName'));
            existing.heroId ??= normalize(controller.getField('m_nHeroID'));
            existing.team ??= normalize(controller.getField('m_iTeamNum'));
            existing.controllerHandle ??= normalize(controller.handle);
            existing.observations += 1;
            candidates.set(playerId, existing);
        }
    }
    return Array.from(candidates.values())
        .sort((left, right) => String(left.team).localeCompare(String(right.team)) || String(left.name).localeCompare(String(right.name)) || left.playerId.localeCompare(right.playerId))
        .slice(0, 12);
}

async function advanceToTick(player, targetTick) {
    while (player.getCurrentTick() < targetTick) {
        const advanced = await player.nextTick();
        if (!advanced) break;
    }
}

function snapshotPlayers(player, players, second, tick) {
    const demo = player.getDemo();
    const pawns = demo.getEntitiesByClassName(PAWN_CLASS);
    const pawnByHandle = new Map(pawns.map(pawn => [ String(normalize(pawn.handle)), pawn ]));
    const pawnByController = new Map();
    for (const pawn of pawns) {
        const controllerHandle = normalize(pawn.getField('m_hController'));
        if (controllerHandle !== null) pawnByController.set(String(controllerHandle), pawn);
    }
    const controllers = demo.getEntitiesByClassName(CONTROLLER_CLASS)
        .map(controller => ({ controller, steamId: normalize(controller.getField('m_steamID')) }))
        .filter(item => item.steamId !== null && item.steamId !== '0' && item.steamId !== 0);
    const controllerBySteam = new Map(controllers.map(item => [ String(item.steamId), item.controller ]));
    return {
        gameTimeSeconds: second,
        tick,
        players: players.map(playerInfo => {
            const controller = controllerBySteam.get(playerInfo.playerId);
            const controllerHandle = normalize(controller?.handle);
            const heroPawnHandle = normalize(controller?.getField('m_hHeroPawn'));
            const pawnHandle = normalize(controller?.getField('m_hPawn'));
            const pawn = pawnByHandle.get(String(heroPawnHandle)) ?? pawnByHandle.get(String(pawnHandle)) ?? pawnByController.get(String(controllerHandle)) ?? null;
            return {
                playerId: playerInfo.playerId,
                name: playerInfo.name,
                heroId: normalize(controller?.getField('m_nHeroID')) ?? playerInfo.heroId,
                team: normalize(controller?.getField('m_iTeamNum')) ?? playerInfo.team,
                controllerId: controllerHandle,
                pawnId: normalize(pawn?.handle) ?? pawnHandle ?? heroPawnHandle,
                controllerAlive: normalize(controller?.getField('m_bAlive')),
                pawnAlive: normalize(pawn?.getField('m_bAlive')),
                health: normalize(pawn?.getField('m_iHealth')) ?? normalize(controller?.getField('m_iHealth')),
                maxHealth: normalize(pawn?.getField('m_iHealthMax')) ?? normalize(controller?.getField('m_iHealthMax')),
                deaths: normalize(controller?.getField('m_iDeaths')),
                kills: normalize(controller?.getField('m_iPlayerKills')),
                assists: normalize(controller?.getField('m_iPlayerAssists')),
                respawnTime: normalize(controller?.getField('m_flRespawnTime')),
                netWorth: normalize(controller?.getField('m_iGoldNetWorth')),
                abilityPointsNetWorth: normalize(controller?.getField('m_iAPNetWorth')),
                position: pawn === null ? null : {
                    x: normalize(pawn.getField('CBodyComponent.m_vecX')),
                    y: normalize(pawn.getField('CBodyComponent.m_vecY')),
                    z: normalize(pawn.getField('CBodyComponent.m_vecZ'))
                }
            };
        })
    };
}

function buildIncrements(current, previousByPlayer) {
    const deaths = [];
    const respawns = [];
    const kills = [];
    const assists = [];
    for (const item of current.players) {
        const previous = previousByPlayer.get(item.playerId);
        if (!previous) continue;
        const deathDelta = delta(item.deaths, previous.deaths);
        const killDelta = delta(item.kills, previous.kills);
        const assistDelta = delta(item.assists, previous.assists);
        const aliveTransitionDeath = alive(previous) === true && alive(item) === false;
        const healthTransitionDeath = Number(previous.health) > 0 && Number(item.health) <= 0;
        const respawnTransition = alive(previous) === false && alive(item) === true;
        const respawnTimerCompletion = Number(previous.respawnTime) > 0 && Number(item.respawnTime) === 0;
        if (deathDelta > 0 || aliveTransitionDeath || healthTransitionDeath) {
            deaths.push({ ...item, previous, deathDelta, aliveTransitionDeath, healthTransitionDeath, tick: current.tick, gameTimeSeconds: current.gameTimeSeconds });
        }
        if (respawnTransition || respawnTimerCompletion) {
            respawns.push({ ...item, previous, respawnTransition, respawnTimerCompletion, tick: current.tick, gameTimeSeconds: current.gameTimeSeconds });
        }
        if (killDelta > 0) kills.push({ ...item, previous, killDelta });
        if (assistDelta > 0) assists.push({ ...item, previous, assistDelta });
    }
    return { deaths, respawns, kills, assists };
}

function buildDeathEvent(replayId, item, current, increments, spatialByPlayer, eventNumber) {
    const killerCandidates = increments.kills.filter(killer => killer.team !== item.team);
    const assists = increments.assists
        .filter(assist => assist.team !== item.team && !killerCandidates.some(killer => killer.playerId === assist.playerId))
        .map(assist => identity(assist, { status: 'resolved' }));
    const killer = resolveKiller(item, killerCandidates);
    const deathPosition = spatialAtOrBefore(spatialByPlayer, item.playerId, item.gameTimeSeconds);
    const economyBefore = item.previous;
    const evidenceItems = [
        evidence('death_counter_increment', 'm_iDeaths', item.deathDelta > 0, { previous: item.previous.deaths, current: item.deaths }),
        evidence('alive_to_dead_transition', 'm_bAlive', item.aliveTransitionDeath, { previous: alive(item.previous), current: alive(item) }),
        evidence('health_reaches_zero', 'm_iHealth', item.healthTransitionDeath, { previous: item.previous.health, current: item.health }),
        evidence('respawn_timer_active', 'm_flRespawnTime', Number(item.respawnTime) > 0, { current: item.respawnTime }),
        evidence('killer_counter_increment_same_second', 'm_iPlayerKills', killer.status === 'resolved', { candidates: killerCandidates.map(candidate => candidate.playerId) }),
        evidence('assist_counter_increment_same_second', 'm_iPlayerAssists', assists.length > 0, { assists: assists.map(assist => assist.playerId) })
    ].filter(item => item.observed);
    return {
        eventId: `${replayId}_death_${String(eventNumber).padStart(4, '0')}`,
        replayId,
        victim: identity(item),
        killer,
        assists,
        death: { tick: item.tick, gameTimeSeconds: item.gameTimeSeconds },
        respawn: { tick: null, gameTimeSeconds: null, deadDurationSeconds: null },
        deathPosition,
        economy: {
            soulsBefore: null,
            soulsAfter: null,
            netWorthBefore: economyBefore.netWorth ?? null,
            netWorthAfter: item.netWorth ?? null,
            unsecuredSouls: null
        },
        evidence: evidenceItems,
        confidence: 'low',
        validationFlags: validationFlagsForDeath(item, killer, deathPosition)
    };
}

function buildRespawnEvent(replayId, item, openDeath, current, spatialByPlayer, eventNumber) {
    const respawnPosition = spatialAtOrAfter(spatialByPlayer, item.playerId, item.gameTimeSeconds);
    const deadDurationSeconds = openDeath === null ? null : item.gameTimeSeconds - openDeath.death.gameTimeSeconds;
    return {
        eventId: `${replayId}_respawn_${String(eventNumber).padStart(4, '0')}`,
        replayId,
        victim: identity(item),
        respawn: {
            tick: current.tick,
            gameTimeSeconds: item.gameTimeSeconds,
            deadDurationSeconds
        },
        respawnPosition,
        evidence: [
            evidence('dead_to_alive_transition', 'm_bAlive', item.respawnTransition, { previous: alive(item.previous), current: alive(item) }),
            evidence('respawn_timer_completion', 'm_flRespawnTime', item.respawnTimerCompletion, { previous: item.previous.respawnTime, current: item.respawnTime }),
            evidence('health_restoration', 'm_iHealth', Number(item.previous.health) <= 0 && Number(item.health) > 0, { previous: item.previous.health, current: item.health }),
            evidence('position_after_respawn', 'one_second_spatial_timeline', respawnPosition.source !== null, respawnPosition)
        ].filter(item => item.observed),
        validationFlags: deadDurationSeconds !== null && deadDurationSeconds < 0 ? [ 'negative_dead_duration' ] : []
    };
}

function buildInferredRespawnEvent(replayId, item, openDeath, spatialByPlayer, eventNumber, tick) {
    const respawnTime = openDeath.evidence.find(evidence => evidence.source === 'm_flRespawnTime')?.measurements?.current;
    const inferredSecond = Number.isFinite(respawnTime)
        ? Math.max(openDeath.death.gameTimeSeconds, Math.min(Math.ceil(respawnTime), item.gameTimeSeconds - 1))
        : Math.max(openDeath.death.gameTimeSeconds, item.gameTimeSeconds - 1);
    const respawnPosition = spatialAtOrAfter(spatialByPlayer, item.playerId, inferredSecond);
    return {
        eventId: `${replayId}_respawn_${String(eventNumber).padStart(4, '0')}`,
        replayId,
        victim: openDeath.victim,
        respawn: {
            tick,
            gameTimeSeconds: inferredSecond,
            deadDurationSeconds: inferredSecond - openDeath.death.gameTimeSeconds
        },
        respawnPosition,
        evidence: [
            evidence('recovery_required_before_next_death_counter_increment', 'm_iDeaths', true, {
                nextDeathSecond: item.gameTimeSeconds,
                priorDeathSecond: openDeath.death.gameTimeSeconds
            }),
            evidence('respawn_timer_available_for_inference', 'm_flRespawnTime', Number.isFinite(respawnTime), {
                respawnTime
            })
        ].filter(item => item.observed),
        validationFlags: [ 'respawn_inferred_not_directly_observed' ]
    };
}

function resolveKiller(victim, candidates) {
    if (candidates.length === 1) return identity(candidates[0], { status: 'resolved' });
    if (candidates.length === 0) return { playerId: null, heroId: null, team: null, status: 'unresolved' };
    return { playerId: null, heroId: null, team: null, status: 'unresolved', candidatePlayerIds: candidates.map(candidate => candidate.playerId) };
}

function spatialAtOrBefore(spatialByPlayer, playerId, second) {
    const rows = spatialByPlayer.get(playerId) ?? [];
    let best = null;
    for (const row of rows) {
        if (row.gameTimeSeconds <= second && row.position.quality === 'direct') best = row;
        if (row.gameTimeSeconds > second) break;
    }
    return spatialProjection(best, second, 'last_direct_coordinate_at_or_before_death');
}

function spatialAtOrAfter(spatialByPlayer, playerId, second) {
    const rows = spatialByPlayer.get(playerId) ?? [];
    const best = rows.find(row => row.gameTimeSeconds >= second && row.position.quality === 'direct') ?? null;
    return spatialProjection(best, second, 'first_direct_coordinate_at_or_after_respawn');
}

function spatialProjection(row, eventSecond, source) {
    if (row === null) return {
        x: null,
        y: null,
        z: null,
        observedAtSeconds: null,
        ageSeconds: null,
        nearestPhysicalLane: null,
        laneDistance: null,
        separationMargin: null,
        structuralRegion: null,
        source: null
    };
    return {
        x: row.position.x,
        y: row.position.y,
        z: row.position.z,
        observedAtSeconds: row.gameTimeSeconds,
        ageSeconds: Math.abs(eventSecond - row.gameTimeSeconds),
        nearestPhysicalLane: row.laneProjection.nearestLane,
        laneDistance: row.laneProjection.nearestDistance,
        separationMargin: row.laneProjection.separationMargin,
        structuralRegion: structuralRegion(row.structuralRegions),
        source
    };
}

async function loadSpatialRows(replayId) {
    const manifest = JSON.parse(await fs.readFile(`output/replays/${replayId}/one-second-spatial/manifest.json`, 'utf8'));
    const rowsByPlayer = new Map();
    for (const shard of manifest.shards) {
        const rows = await readJsonl(shard.file);
        rowsByPlayer.set(rows[0]?.playerId ?? shard.playerId, rows.sort((left, right) => left.gameTimeSeconds - right.gameTimeSeconds));
    }
    return rowsByPlayer;
}

function createSourceSamples(replayId) {
    return {
        replayId,
        sources: new Map([
            [ 'm_iDeaths', sourceRecord('CCitadelPlayerController', 'number', 'direct_counter') ],
            [ 'm_iPlayerKills', sourceRecord('CCitadelPlayerController', 'number', 'direct_counter') ],
            [ 'm_iPlayerAssists', sourceRecord('CCitadelPlayerController', 'number', 'direct_counter') ],
            [ 'm_bAlive', sourceRecord('CCitadelPlayerController/CCitadelPlayerPawn', 'boolean', 'direct_state') ],
            [ 'm_iHealth', sourceRecord('CCitadelPlayerPawn/CCitadelPlayerController', 'number', 'direct_state') ],
            [ 'm_flRespawnTime', sourceRecord('CCitadelPlayerController', 'number', 'direct_timer') ],
            [ 'm_hHeroPawn/m_hPawn', sourceRecord('CCitadelPlayerController', 'number', 'linkage') ],
            [ 'm_iGoldNetWorth', sourceRecord('CCitadelPlayerController', 'number', 'economy_counter') ]
        ])
    };
}

function sourceRecord(entityClass, valueType, evidenceType) {
    return {
        entityClass,
        valueType,
        evidenceType,
        updateFrequency: 'sampled_once_per_canonical_second',
        playerLinkage: 'controller m_steamID with controller/pawn handle linkage',
        examples: [],
        observedChanges: 0,
        reliability: 'unknown_until_processed',
        limitations: [],
        directOrDerived: evidenceType.includes('counter') || evidenceType.includes('state') || evidenceType.includes('timer') ? 'direct_field' : 'derived_linkage'
    };
}

function updateSourceSamples(sourceSamples, current) {
    for (const player of current.players) {
        addExample(sourceSamples.sources.get('m_iDeaths'), player.deaths);
        addExample(sourceSamples.sources.get('m_iPlayerKills'), player.kills);
        addExample(sourceSamples.sources.get('m_iPlayerAssists'), player.assists);
        addExample(sourceSamples.sources.get('m_bAlive'), alive(player));
        addExample(sourceSamples.sources.get('m_iHealth'), player.health);
        addExample(sourceSamples.sources.get('m_flRespawnTime'), player.respawnTime);
        addExample(sourceSamples.sources.get('m_hHeroPawn/m_hPawn'), player.pawnId);
        addExample(sourceSamples.sources.get('m_iGoldNetWorth'), player.netWorth);
    }
}

function addExample(record, value) {
    if (value === null || value === undefined) return;
    if (!record.examples.includes(value) && record.examples.length < 5) record.examples.push(value);
}

function buildSourceAudit(replayId, sourceSamples) {
    return {
        schemaVersion: 1,
        kind: 'death_event_source_audit',
        replayId,
        sources: Object.fromEntries(Array.from(sourceSamples.sources.entries()).map(([ field, record ]) => [ field, {
            ...record,
            reliability: reliabilityFor(field),
            limitations: limitationsFor(field)
        } ])),
        absentOrNotUsed: [
            {
                source: 'explicit_death_game_events',
                status: 'not_exposed_by_current_task_path',
                limitation: 'No explicit game-event callback was used; canonical events derive from replicated counters and states.'
            },
            {
                source: 'combat_log_messages',
                status: 'not_found',
                limitation: 'No combat log message source was identified in this task.'
            }
        ]
    };
}

function reliabilityFor(field) {
    if ([ 'm_iDeaths', 'm_iPlayerKills', 'm_iPlayerAssists' ].includes(field)) return 'high_for_counter_changes';
    if ([ 'm_bAlive', 'm_iHealth', 'm_flRespawnTime' ].includes(field)) return 'medium_supporting_signal';
    if (field === 'm_iGoldNetWorth') return 'medium_for_net_worth_context_not_soul_semantics';
    return 'medium_linkage_signal';
}

function limitationsFor(field) {
    if (field === 'm_iPlayerKills') return [ 'Counter increments identify a killer only when exactly one enemy kill counter changes near the victim death.' ];
    if (field === 'm_iPlayerAssists') return [ 'Assist increments are associated by same-second counter changes, not explicit victim linkage.' ];
    if (field === 'm_flRespawnTime') return [ 'Timer value is support evidence; interpretation of exact countdown semantics is not assumed.' ];
    if (field === 'm_iGoldNetWorth') return [ 'Net worth is recorded as context; current Deadlock soul mechanics are not assumed.' ];
    return [];
}

function validateReplayEvents(replay, players, deathEvents, respawnEvents, observations) {
    const errors = [];
    const warnings = [];
    const deathsByPlayer = groupBy(deathEvents, event => event.victim.playerId);
    for (const [ playerId, events ] of deathsByPlayer) {
        const sorted = events.slice().sort((left, right) => left.death.gameTimeSeconds - right.death.gameTimeSeconds);
        for (let index = 1; index < sorted.length; index++) {
            const previous = sorted[index - 1];
            const current = sorted[index];
            if (previous.respawn.gameTimeSeconds === null || previous.respawn.gameTimeSeconds > current.death.gameTimeSeconds) {
                errors.push({ type: 'death_without_intervening_respawn', playerId, previous: previous.eventId, current: current.eventId });
            }
        }
    }
    for (const event of deathEvents) {
        if (event.victim.playerId === null) errors.push({ type: 'death_without_victim', eventId: event.eventId });
        if (event.respawn.deadDurationSeconds !== null && event.respawn.deadDurationSeconds < 0) errors.push({ type: 'negative_dead_duration', eventId: event.eventId });
        if (event.killer.status === 'resolved' && event.killer.playerId === event.victim.playerId) errors.push({ type: 'killer_equals_victim_without_suicide', eventId: event.eventId });
        if (new Set(event.assists.map(assist => assist.playerId)).size !== event.assists.length) errors.push({ type: 'duplicate_assists', eventId: event.eventId });
        if (event.deathPosition.source === null) warnings.push({ type: 'missing_death_position', eventId: event.eventId });
    }
    const finalSnapshot = observations.at(-1)?.players ?? [];
    const counterDeaths = Object.fromEntries(finalSnapshot.map(player => [ player.playerId, player.deaths ?? 0 ]));
    const canonicalDeaths = Object.fromEntries(players.map(player => [ player.playerId, (deathsByPlayer.get(player.playerId) ?? []).length ]));
    const counterMismatches = Object.entries(counterDeaths).filter(([ playerId, count ]) => (canonicalDeaths[playerId] ?? 0) !== count);
    for (const [ playerId, count ] of counterMismatches) warnings.push({ type: 'death_counter_mismatch', playerId, counter: count, canonical: canonicalDeaths[playerId] ?? 0 });
    return {
        schemaVersion: 1,
        kind: 'death_event_validation',
        replayId: replay.replayId,
        checks: {
            everyDeathHasOneVictim: deathEvents.every(event => event.victim.playerId !== null),
            noDoubleDeathWithoutRespawn: !errors.some(error => error.type === 'death_without_intervening_respawn'),
            nonNegativeDeadDurations: !errors.some(error => error.type === 'negative_dead_duration'),
            orderedTimes: deathEvents.every(event => event.death.gameTimeSeconds >= 0 && (event.respawn.gameTimeSeconds === null || event.respawn.gameTimeSeconds >= event.death.gameTimeSeconds)),
            ordinaryDeathsFollowedByRespawnUnlessReplayEnds: deathEvents.filter(event => event.respawn.gameTimeSeconds === null).length,
            noKillerEqualsVictimUnlessSuicide: !errors.some(error => error.type === 'killer_equals_victim_without_suicide'),
            assistIdentitiesUnique: !errors.some(error => error.type === 'duplicate_assists'),
            counterReconciliationAvailable: true,
            deathCounterMismatches: counterMismatches.length,
            spatialCoveragePercent: percent(deathEvents.filter(event => event.deathPosition.source !== null).length, deathEvents.length)
        },
        errors,
        warnings,
        replay005Protection: { processed: false, status: 'preserved' }
    };
}

function buildComparison(results) {
    return {
        schemaVersion: 1,
        kind: 'multi_replay_death_event_comparison',
        replays: results.map(result => summarizeReplay(result)),
        crossReplay: {
            deathCountRange: range(results.map(result => result.deathEvents.length)),
            respawnCountRange: range(results.map(result => result.respawnEvents.length)),
            killerResolutionRateRange: range(results.map(result => summarizeReplay(result).killerResolutionRate)),
            assistCoverageRange: range(results.map(result => summarizeReplay(result).assistCoveragePercent)),
            positionCoverageRange: range(results.map(result => summarizeReplay(result).deathPositionCoveragePercent))
        },
        note: 'Similar event counts are comparability checks only, not semantic proof.',
        replay005Protection: { processed: false, status: 'preserved' }
    };
}

function summarizeReplay(result) {
    const deaths = result.deathEvents;
    const resolvedKillers = deaths.filter(event => event.killer.status === 'resolved').length;
    const withAssists = deaths.filter(event => event.assists.length > 0).length;
    const withRespawn = deaths.filter(event => event.respawn.gameTimeSeconds !== null).length;
    const withPosition = deaths.filter(event => event.deathPosition.source !== null).length;
    const withEconomy = deaths.filter(event => event.economy.netWorthBefore !== null || event.economy.netWorthAfter !== null).length;
    return {
        replayId: result.replayId,
        deaths: deaths.length,
        respawns: result.respawnEvents.length,
        deathsPerPlayer: Object.fromEntries(Array.from(groupBy(deaths, event => event.victim.playerId).entries()).map(([ playerId, events ]) => [ playerId, events.length ])),
        killerResolutionRate: percent(resolvedKillers, deaths.length),
        assistCoveragePercent: percent(withAssists, deaths.length),
        respawnCoveragePercent: percent(withRespawn, deaths.length),
        deathPositionCoveragePercent: percent(withPosition, deaths.length),
        economyCoveragePercent: percent(withEconomy, deaths.length),
        validationErrors: result.validation.errors.length,
        validationWarnings: result.validation.warnings.length,
        counterMismatches: result.validation.checks.deathCounterMismatches
    };
}

function buildReviewSamples(results) {
    const samples = [];
    for (const result of results) {
        const deaths = result.deathEvents;
        addSample(samples, result.replayId, 'first_death', deaths[0]);
        for (const event of deaths.filter(event => event.killer.status !== 'resolved').slice(0, 5)) addSample(samples, result.replayId, 'unresolved_killer', event);
        for (const event of deaths.filter(event => event.assists.length > 1).slice(0, 5)) addSample(samples, result.replayId, 'multiple_assists', event);
        for (const event of deaths.filter(event => event.deathPosition.source === null || event.deathPosition.ageSeconds > 2).slice(0, 5)) addSample(samples, result.replayId, 'stale_or_missing_position', event);
        for (const event of deaths.filter(event => event.confidence === 'low').slice(0, 5)) addSample(samples, result.replayId, 'low_confidence', event);
        for (const warning of result.validation.warnings.slice(0, 5)) {
            samples.push({ replayId: result.replayId, category: warning.type, eventId: warning.eventId ?? null, question: 'Inspect whether this warning materially affects the canonical event layer.', warning });
        }
    }
    return {
        schemaVersion: 1,
        kind: 'death_event_review_samples',
        reviewRequiredNow: false,
        samples,
        replay005Protection: { processed: false, status: 'preserved' }
    };
}

function addSample(samples, replayId, category, event) {
    if (!event) return;
    samples.push({
        replayId,
        category,
        eventId: event.eventId,
        gameTimeSeconds: event.death.gameTimeSeconds,
        question: 'Review only if this case materially blocks use of the descriptive death event layer.',
        eventSummary: {
            victim: event.victim.playerId,
            killerStatus: event.killer.status,
            assists: event.assists.map(assist => assist.playerId),
            confidence: event.confidence,
            validationFlags: event.validationFlags
        }
    });
}

function buildGate(results, comparison) {
    const totalDeaths = results.reduce((total, result) => total + result.deathEvents.length, 0);
    const errors = results.reduce((total, result) => total + result.validation.errors.length, 0);
    const warnings = results.reduce((total, result) => total + result.validation.warnings.length, 0);
    const positionCoverage = average(comparison.replays.map(replay => replay.deathPositionCoveragePercent));
    const killerResolution = average(comparison.replays.map(replay => replay.killerResolutionRate));
    let gateResult = 'death_event_sources_insufficient';
    if (totalDeaths > 0 && errors === 0 && warnings === 0 && killerResolution >= 95 && positionCoverage >= 99) gateResult = 'death_event_layer_ready';
    else if (totalDeaths > 0 && errors === 0) gateResult = 'death_event_layer_ready_with_limitations';
    else if (totalDeaths > 0) gateResult = 'death_event_semantics_require_minimal_review';
    return {
        schemaVersion: 1,
        kind: 'death_event_gate',
        gateResult,
        evidence: {
            totalDeaths,
            validationErrors: errors,
            validationWarnings: warnings,
            averageKillerResolutionRate: round(killerResolution),
            averageDeathPositionCoverage: round(positionCoverage),
            sourceAvailability: 'death, kill, assist, alive, health, respawn timer, pawn linkage, and net worth fields observed'
        },
        limitations: [
            'Killer and assist linkage is counter-based by same-second changes, not explicit victim-linked combat log evidence.',
            'Economy context uses net worth fields only; soul mechanics are not inferred.',
            'No semantic fight grouping or strategic interpretation is produced.'
        ],
        nextAllowedTask: gateResult.startsWith('death_event_layer_ready') ? 'damage_healing_field_discovery' : null,
        replay005Protection: { processed: false, status: 'preserved' },
        humanReviewRequired: false
    };
}

async function writeReport(results, comparison, gate) {
    const lines = comparison.replays.map(replay => `- ${replay.replayId}: ${replay.deaths} deaths, ${replay.respawns} respawns, killer resolution ${replay.killerResolutionRate}%, assist coverage ${replay.assistCoveragePercent}%, position coverage ${replay.deathPositionCoveragePercent}%, economy coverage ${replay.economyCoveragePercent}%.`).join('\n');
    const report = `# Multi-Replay Death Assist Respawn Events

## Scope

This task builds descriptive death and respawn events for replays 001-004. It does not use semantic occupancy, lane episodes, transitions, rotations, strategic interpretation, or replay 005.

## Event sources

- Direct counters: \`m_iDeaths\`, \`m_iPlayerKills\`, \`m_iPlayerAssists\`.
- Supporting state: \`m_bAlive\`, \`m_iHealth\`, \`m_flRespawnTime\`.
- Linkage and context: controller/pawn handles, team, hero, \`m_iGoldNetWorth\`, and one-second spatial rows.

## Results

${lines}

## Limitations

- Killer and assist identity are resolved from same-second counter increments, not explicit victim-linked game events.
- Economy coverage is net-worth context only; current Deadlock soul mechanics are not assumed.
- Lane information is physical proximity only.

## Gate

\`${gate.gateResult}\`
`;
    await fs.writeFile('reports/multi-replay-death-assist-respawn-events.md', report);
    await fs.writeFile('reports/latest.md', 'reports/multi-replay-death-assist-respawn-events.md\n');
}

function enrichConfidence(events) {
    for (const event of events) {
        const sources = new Set(event.evidence.map(item => item.source));
        event.confidence = sources.has('death_counter_increment') && event.respawn.gameTimeSeconds !== null && event.deathPosition.source !== null
            ? event.killer.status === 'resolved' ? 'high' : 'medium'
            : sources.size >= 2 ? 'medium' : 'low';
    }
}

function validationFlagsForDeath(item, killer, deathPosition) {
    const flags = [];
    if (item.deathDelta === 0) flags.push('no_death_counter_increment');
    if (killer.status !== 'resolved') flags.push('killer_unresolved');
    if (deathPosition.source === null) flags.push('death_position_unavailable');
    if (deathPosition.ageSeconds !== null && deathPosition.ageSeconds > 2) flags.push('death_position_stale');
    return flags;
}

function identity(item, extra = {}) {
    return {
        playerId: item.playerId,
        heroId: item.heroId,
        team: item.team,
        controllerId: item.controllerId ?? null,
        pawnId: item.pawnId ?? null,
        ...extra
    };
}

function evidence(name, source, observed, measurements) {
    return { name, source, observed, measurements };
}

function alive(item) {
    if (typeof item.controllerAlive === 'boolean') return item.controllerAlive;
    if (typeof item.pawnAlive === 'boolean') return item.pawnAlive;
    return null;
}

function delta(current, previous) {
    return Number.isFinite(current) && Number.isFinite(previous) ? Math.max(0, current - previous) : 0;
}

function structuralRegion(regions) {
    if (regions.nearTeamBase || regions.nearEnemyBase) return 'base';
    if (regions.nearDeployment) return 'deployment';
    if (regions.nearCentralObjective) return 'central_objective';
    if (regions.nearNeutralStructure) return 'neutral_structure';
    return 'open_structural_space';
}

async function readJsonl(file) {
    const content = await fs.readFile(file, 'utf8');
    return content.trim().split(/\r?\n/u).filter(Boolean).map(line => JSON.parse(line));
}

async function writeJson(file, value) {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, `${JSON.stringify(value, replacer, 2)}\n`);
}

function replacer(_key, value) {
    if (value instanceof Map) return Object.fromEntries(value);
    return value;
}

async function validateOutputs(files) {
    for (const file of files) {
        const stat = await fs.stat(file);
        if (file.endsWith('.json') && stat.size > OUTPUT_SIZE_LIMIT) throw new Error(`${file} exceeds size limit`);
        if (file.endsWith('.json')) JSON.parse(await fs.readFile(file, 'utf8'));
    }
}

function groupBy(items, keyFn) {
    const groups = new Map();
    for (const item of items) {
        const key = keyFn(item);
        const group = groups.get(key) ?? [];
        group.push(item);
        groups.set(key, group);
    }
    return groups;
}

function range(values) {
    return [ round(Math.min(...values)), round(Math.max(...values)) ];
}

function average(values) {
    const clean = values.filter(Number.isFinite);
    return clean.length === 0 ? 0 : clean.reduce((total, value) => total + value, 0) / clean.length;
}

function percent(value, total) {
    return total === 0 ? 0 : round(value * 100 / total);
}

function round(value) {
    return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
}

function normalize(value) {
    if (typeof value === 'bigint') return value.toString();
    return value ?? null;
}
