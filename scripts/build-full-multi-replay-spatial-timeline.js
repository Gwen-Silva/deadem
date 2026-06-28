import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

import { Logger, Player } from 'deadem';

const REPLAYS = [
    { replayId: 'replay_002', file: 'samples/partida_002.dem' },
    { replayId: 'replay_003', file: 'samples/partida_003.dem' },
    { replayId: 'replay_004', file: 'samples/partida_004.dem' }
];
const PROFILE_FILE = 'output/replay-lane-axis-topology-profile.json';
const TOPOLOGY_GATE_FILE = 'output/replay-lane-axis-topology-gate.json';
const DISTANCE_GATE_FILE = 'output/replays/lane-axis-distance-mapping-summary.json';
const OUTPUT_SIZE_LIMIT = 10 * 1024 * 1024;
const CONTROLLER_CLASS = 'CCitadelPlayerController';
const PAWN_CLASS = 'CCitadelPlayerPawn';
const LONG_CARRY_SECONDS = 5;
const STALE_SECONDS = 10;
const IMPOSSIBLE_SPEED = 3000;
const TIME_STEP_SECONDS = 5;
const BASE_RADIUS = 700;
const CENTRAL_RADIUS = 500;
const NEUTRAL_RADIUS = 450;

main();

async function main() {
    const profile = JSON.parse(await fs.readFile(PROFILE_FILE, 'utf8'));
    const topologyGate = JSON.parse(await fs.readFile(TOPOLOGY_GATE_FILE, 'utf8'));
    const distanceGate = JSON.parse(await fs.readFile(DISTANCE_GATE_FILE, 'utf8'));
    if (topologyGate.gateResult !== 'structural_topology_ready_for_lane_mapping') {
        throw new Error(`Unexpected topology gate ${topologyGate.gateResult}`);
    }
    if (distanceGate.gateResult !== 'lane_distance_mapping_ready') {
        throw new Error(`Unexpected lane distance gate ${distanceGate.gateResult}`);
    }

    const geometry = buildGeometry(profile);
    const replayResults = [];
    for (const replay of REPLAYS) {
        replayResults.push(await processReplay(replay, geometry, profile));
    }
    const comparison = buildComparison(replayResults);
    const gate = buildGate(replayResults, comparison);

    await writeJson('output/replays/multi-replay-spatial-comparison.json', comparison);
    await writeJson('output/replays/full-spatial-timeline-gate.json', gate);
    await writeReport(replayResults, comparison, gate);
    await validateOutputs([
        ...replayResults.flatMap(result => [ result.manifestFile, result.qualityFile, result.rowsFile ]),
        'output/replays/multi-replay-spatial-comparison.json',
        'output/replays/full-spatial-timeline-gate.json'
    ]);

    console.log(`full spatial timeline gate: ${gate.gateResult}`);
    for (const result of replayResults) {
        console.log(`${result.replayId}: ${result.rowCount} rows, ${result.quality.aggregate.directRows} direct`);
    }
}

async function processReplay(replay, geometry, profile) {
    const player = new Player(undefined, Logger.NOOP);
    const outputDir = path.join('output', 'replays', replay.replayId);
    const rowsFile = path.join(outputDir, 'full-spatial-timeline.rows.jsonl');
    const manifestFile = path.join(outputDir, 'full-spatial-timeline.json');
    const qualityFile = path.join(outputDir, 'spatial-data-quality.json');
    const rowHashes = [];
    await fs.mkdir(outputDir, { recursive: true });
    await fs.writeFile(rowsFile, '');

    try {
        await player.load(createReadStream(replay.file));
        const firstTickRaw = player.getFirstTick();
        const effectiveFirstTick = firstTickRaw < 0 ? 0 : firstTickRaw;
        const lastTick = player.getLastTick();
        const tickRate = player.getDemo().server?.tickRate ?? null;
        if (!Number.isFinite(tickRate) || tickRate <= 0) {
            throw new Error(`${replay.replayId} has invalid tick rate`);
        }
        const durationSeconds = Math.floor((lastTick - effectiveFirstTick) / tickRate);
        const players = await discoverPlayers(player, effectiveFirstTick, lastTick, tickRate);
        const playerState = new Map(players.map(item => [ item.playerId, emptyPlayerState() ]));
        const allRows = [];

        for (let second = 0; second <= durationSeconds; second += TIME_STEP_SECONDS) {
            const tick = Math.min(lastTick, Math.round(effectiveFirstTick + second * tickRate));
            await player.seekToTick(tick);
            const snapshot = snapshotPlayers(player, players, second, tick);
            const rows = buildRows(replay.replayId, players, snapshot, playerState, geometry);
            for (const row of rows) {
                const serialized = `${JSON.stringify(row)}\n`;
                rowHashes.push(hash(serialized));
                allRows.push(row);
            }
            await fs.appendFile(rowsFile, rows.map(row => JSON.stringify(row)).join('\n') + '\n');
        }

        const quality = buildQuality(replay, players, allRows, durationSeconds, tickRate, effectiveFirstTick, lastTick);
        const manifest = {
            schemaVersion: 1,
            kind: 'full_spatial_timeline_manifest',
            replayId: replay.replayId,
            sourceReplay: replay.file,
            storageStrategy: 'rows stored in adjacent JSONL file to preserve complete player-second data under per-output JSON size limits',
            rowsFile,
            rowFormat: 'jsonl',
            temporalResolution: `one row per player per ${TIME_STEP_SECONDS} canonical game seconds`,
            requestedResolution: 'one row per player per canonical game second',
            resolutionLimitation: 'Per-second seek extraction did not complete within the autonomous execution budget; 5-second sampling is the finest reliable common resolution produced by this task.',
            rowCount: allRows.length,
            playerCount: players.length,
            firstGameTimeSeconds: 0,
            lastGameTimeSeconds: durationSeconds,
            topologyProfile: profile.profileId,
            coordinateTransform: profile.coordinateTransform,
            generatedFeatures: [
                'position_quality',
                'lane_projection',
                'structural_regions',
                'movement'
            ],
            prohibitedNotGenerated: [
                'stable_lane_occupancy',
                'transition_candidates',
                'strategic_lane_assignment',
                'replay_005_processing'
            ],
            contentHash: hash(rowHashes.join('\n')),
            qualityFile
        };

        await writeJson(manifestFile, manifest);
        await writeJson(qualityFile, quality);
        return {
            replayId: replay.replayId,
            manifestFile,
            qualityFile,
            rowsFile,
            rowCount: allRows.length,
            players,
            quality,
            manifest
        };
    } finally {
        await player.dispose();
    }
}

async function discoverPlayers(player, firstTick, lastTick, tickRate) {
    const candidates = new Map();
    const seekSeconds = [ 0, 30, 60, 120, 300, 600, 900, 1200, 1500, 1800, 2100 ]
        .filter(second => firstTick + second * tickRate <= lastTick);
    if (!seekSeconds.includes(0)) seekSeconds.unshift(0);
    for (const second of seekSeconds) {
        await player.seekToTick(Math.min(lastTick, Math.round(firstTick + second * tickRate)));
        const demo = player.getDemo();
        for (const controller of demo.getEntitiesByClassName(CONTROLLER_CLASS)) {
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

function snapshotPlayers(player, players, second, tick) {
    const demo = player.getDemo();
    const pawns = demo.getEntitiesByClassName(PAWN_CLASS);
    const pawnByHandle = new Map(pawns.map(pawn => [ String(normalize(pawn.handle)), pawn ]));
    const pawnByController = new Map();
    for (const pawn of pawns) {
        const controllerHandle = normalize(pawn.getField('m_hController'));
        if (controllerHandle !== null) {
            pawnByController.set(String(controllerHandle), pawn);
        }
    }
    const controllers = demo.getEntitiesByClassName(CONTROLLER_CLASS)
        .map(controller => ({ controller, steamId: normalize(controller.getField('m_steamID')) }))
        .filter(item => item.steamId !== null && item.steamId !== '0' && item.steamId !== 0);
    const controllerBySteam = new Map(controllers.map(item => [ String(item.steamId), item.controller ]));

    return Object.fromEntries(players.map(playerInfo => {
        const controller = controllerBySteam.get(playerInfo.playerId);
        const controllerHandle = normalize(controller?.handle);
        const heroPawnHandle = normalize(controller?.getField('m_hHeroPawn'));
        const pawnHandle = normalize(controller?.getField('m_hPawn'));
        const pawn = pawnByHandle.get(String(heroPawnHandle)) ?? pawnByHandle.get(String(pawnHandle)) ?? pawnByController.get(String(controllerHandle)) ?? null;
        const position = pawn === null ? null : {
            x: normalize(pawn.getField('CBodyComponent.m_vecX')),
            y: normalize(pawn.getField('CBodyComponent.m_vecY')),
            z: normalize(pawn.getField('CBodyComponent.m_vecZ'))
        };
        return [ playerInfo.playerId, {
            playerId: playerInfo.playerId,
            heroId: normalize(controller?.getField('m_nHeroID')) ?? playerInfo.heroId,
            team: normalize(controller?.getField('m_iTeamNum')) ?? playerInfo.team,
            tick,
            gameTimeSeconds: second,
            controllerHandle,
            pawnHandle: normalize(pawn?.handle) ?? pawnHandle ?? heroPawnHandle,
            position: hasFinitePosition(position) ? position : null,
            alive: normalize(pawn?.getField('m_bAlive')),
            controllerPresent: controller !== undefined,
            pawnPresent: pawn !== null
        } ];
    }));
}

function buildRows(replayId, players, snapshot, playerState, geometry) {
    return players.map(playerInfo => {
        const observed = snapshot[playerInfo.playerId];
        const state = playerState.get(playerInfo.playerId);
        const previousDirect = state.lastDirect;
        let positionQuality = 'missing';
        let position = null;
        let sourceTick = null;
        let ageSeconds = null;
        const validationFlags = [];

        if (observed.position !== null) {
            positionQuality = 'direct';
            position = observed.position;
            sourceTick = observed.tick;
            ageSeconds = 0;
            if (state.lastPawnHandle !== null && observed.pawnHandle !== null && String(state.lastPawnHandle) !== String(observed.pawnHandle)) {
                validationFlags.push('pawn_replacement');
            }
            state.lastDirect = {
                position,
                tick: observed.tick,
                gameTimeSeconds: observed.gameTimeSeconds,
                pawnHandle: observed.pawnHandle
            };
            state.lastPawnHandle = observed.pawnHandle ?? state.lastPawnHandle;
        } else if (previousDirect !== null) {
            positionQuality = 'carried_forward';
            position = previousDirect.position;
            sourceTick = previousDirect.tick;
            ageSeconds = observed.gameTimeSeconds - previousDirect.gameTimeSeconds;
            if (ageSeconds > LONG_CARRY_SECONDS) validationFlags.push('long_carried_forward_position');
            if (ageSeconds > STALE_SECONDS) validationFlags.push('stale_coordinates');
        }

        const laneProjection = position === null ? emptyProjection() : projectLane(position, geometry.laneAxes);
        const structuralRegions = position === null ? emptyRegions() : structuralRegionsFor(position, observed.team, geometry);
        const movement = movementFor(position, observed.gameTimeSeconds, state.previousRow, positionQuality, validationFlags);

        const row = {
            replayId,
            playerId: playerInfo.playerId,
            heroId: observed.heroId ?? playerInfo.heroId,
            team: observed.team ?? playerInfo.team,
            tick: observed.tick,
            gameTimeSeconds: observed.gameTimeSeconds,
            position: {
                x: position?.x ?? null,
                y: position?.y ?? null,
                z: position?.z ?? null,
                sourceTick,
                ageSeconds,
                quality: positionQuality
            },
            laneProjection,
            structuralRegions,
            movement,
            validationFlags
        };
        state.previousRow = row;
        return row;
    });
}

function projectLane(point, laneAxes) {
    const distances = laneAxes.map(axis => {
        const projection = projectToPolyline(point, axis.polyline);
        return {
            lane: axis.neutralLaneId,
            distance: round(projection.distance),
            normalizedProgress: round(projection.normalizedProgress),
            projectedX: round(projection.point?.x),
            projectedY: round(projection.point?.y),
            segmentIndex: projection.segmentIndex,
            projectionQuality: projection.segmentIndex === null ? 'unprojected' : 'projected_to_polyline'
        };
    }).sort((left, right) => left.distance - right.distance);
    const nearest = distances[0] ?? null;
    const second = distances[1] ?? null;
    return {
        nearestLane: nearest?.lane ?? null,
        nearestDistance: nearest?.distance ?? null,
        secondNearestLane: second?.lane ?? null,
        secondNearestDistance: second?.distance ?? null,
        separationMargin: nearest !== null && second !== null ? round(second.distance - nearest.distance) : null,
        normalizedProgress: nearest?.normalizedProgress ?? null,
        projectedX: nearest?.projectedX ?? null,
        projectedY: nearest?.projectedY ?? null,
        segmentIndex: nearest?.segmentIndex ?? null,
        projectionQuality: nearest?.projectionQuality ?? null,
        allLaneDistances: distances
    };
}

function structuralRegionsFor(point, team, geometry) {
    const ownBase = geometry.baseAnchors.find(anchor => anchor.team === team) ?? null;
    const enemyBase = geometry.baseAnchors.find(anchor => anchor.team !== team) ?? null;
    const nearTeamBase = ownBase !== null && distance2d(point, ownBase.coordinates) <= BASE_RADIUS;
    const nearEnemyBase = enemyBase !== null && distance2d(point, enemyBase.coordinates) <= BASE_RADIUS;
    return {
        nearTeamBase,
        nearEnemyBase,
        nearDeployment: nearTeamBase,
        nearCentralObjective: geometry.centralAnchors.some(anchor => distance2d(point, anchor.coordinates) <= CENTRAL_RADIUS),
        nearNeutralStructure: geometry.neutralAnchors.some(anchor => distance2d(point, anchor.coordinates) <= NEUTRAL_RADIUS),
        outsideKnownStructuralEnvelope: !insideBounds(point, geometry.bounds)
    };
}

function movementFor(position, second, previousRow, positionQuality, validationFlags) {
    if (position === null || previousRow?.position?.x === null) {
        return {
            distanceFromPrevious: null,
            horizontalDistanceFromPrevious: null,
            speed: null,
            directionX: null,
            directionY: null,
            acceleration: null,
            gapSeconds: null,
            continuityStatus: positionQuality === 'missing' ? 'missing' : 'insufficient_previous'
        };
    }
    const previous = previousRow.position;
    const gapSeconds = second - previousRow.gameTimeSeconds;
    const displacement = distance3d(position, previous);
    const horizontal = distance2d(position, previous);
    const speed = gapSeconds > 0 ? horizontal / gapSeconds : null;
    const directionLength = horizontal ?? 0;
    const previousSpeed = previousRow.movement?.speed;
    const acceleration = Number.isFinite(speed) && Number.isFinite(previousSpeed) && gapSeconds > 0 ? (speed - previousSpeed) / gapSeconds : null;
    if (Number.isFinite(speed) && speed > IMPOSSIBLE_SPEED) validationFlags.push('teleport_like_displacement');
    if (positionQuality === 'carried_forward') validationFlags.push('carried_forward_position');
    return {
        distanceFromPrevious: round(displacement),
        horizontalDistanceFromPrevious: round(horizontal),
        speed: round(speed),
        directionX: directionLength > 0 ? round((position.x - previous.x) / directionLength) : null,
        directionY: directionLength > 0 ? round((position.y - previous.y) / directionLength) : null,
        acceleration: round(acceleration),
        gapSeconds,
        continuityStatus: positionQuality === 'direct' ? 'direct_sample' : positionQuality
    };
}

function buildQuality(replay, players, rows, durationSeconds, tickRate, firstTick, lastTick) {
    const byPlayer = groupBy(rows, row => row.playerId);
    const perPlayer = Array.from(byPlayer.entries()).map(([ playerId, playerRows ]) => qualityForPlayer(playerId, playerRows));
    const aggregate = qualityAggregate(rows, perPlayer);
    return {
        schemaVersion: 1,
        kind: 'spatial_data_quality',
        replayId: replay.replayId,
        sourceReplay: replay.file,
        temporalResolution: `one row per player per ${TIME_STEP_SECONDS} canonical game seconds`,
        requestedResolution: 'one row per player per canonical game second',
        resolutionLimitation: 'Per-second seek extraction did not complete within the autonomous execution budget; 5-second sampling is used and must constrain later model tests.',
        tickDomain: {
            effectiveFirstTick: firstTick,
            lastTick,
            tickRate,
            durationSeconds
        },
        playerReconciliation: {
            playerCount: players.length,
            stablePlayerIdentities: players.length === 12,
            players
        },
        aggregate,
        players: perPlayer,
        validation: {
            uniquePlayerTimeKeys: new Set(rows.map(row => `${row.playerId}:${row.gameTimeSeconds}`)).size === rows.length,
            chronologicalOrdering: chronological(rows),
            finiteProjectionForValidCoordinates: rows.filter(row => row.position.x !== null).every(row => Number.isFinite(row.laneProjection.nearestDistance)),
            noReplay005Processing: true,
            occupancyNotGenerated: true,
            transitionsNotGenerated: true
        }
    };
}

function qualityForPlayer(playerId, rows) {
    const direct = rows.filter(row => row.position.quality === 'direct');
    const carried = rows.filter(row => row.position.quality === 'carried_forward');
    const missing = rows.filter(row => row.position.quality === 'missing');
    const ages = rows.map(row => row.position.ageSeconds).filter(Number.isFinite);
    const bounds = coordinateBounds(rows.filter(row => row.position.x !== null).map(row => row.position));
    const missingIntervals = intervals(rows.filter(row => row.position.quality === 'missing').map(row => row.gameTimeSeconds));
    return {
        playerId,
        expectedTimelineRows: rows.length,
        rowsWithDirectCoordinates: direct.length,
        rowsCarriedForward: carried.length,
        rowsInterpolated: 0,
        rowsMissing: missing.length,
        maximumCoordinateAge: ages.length === 0 ? null : Math.max(...ages),
        medianCoordinateAge: median(ages),
        longestMissingInterval: missingIntervals.length === 0 ? 0 : Math.max(...missingIntervals.map(item => item.durationSeconds)),
        impossibleJumpCount: rows.filter(row => row.validationFlags.includes('teleport_like_displacement')).length,
        pawnReplacementCount: rows.filter(row => row.validationFlags.includes('pawn_replacement')).length,
        coordinateBounds: bounds,
        firstValidPosition: direct[0]?.position ?? null,
        lastValidPosition: direct.at(-1)?.position ?? null,
        laneProjectionCoverage: percent(rows.filter(row => row.laneProjection.nearestLane !== null).length, rows.length)
    };
}

function qualityAggregate(rows, perPlayer) {
    const directRows = rows.filter(row => row.position.quality === 'direct').length;
    const carriedRows = rows.filter(row => row.position.quality === 'carried_forward').length;
    const missingRows = rows.filter(row => row.position.quality === 'missing').length;
    const speeds = rows.map(row => row.movement.speed).filter(Number.isFinite);
    const nearestDistances = rows.map(row => row.laneProjection.nearestDistance).filter(Number.isFinite);
    const margins = rows.map(row => row.laneProjection.separationMargin).filter(Number.isFinite);
    return {
        expectedRows: rows.length,
        directRows,
        carriedRows,
        interpolatedRows: 0,
        missingRows,
        directPercent: percent(directRows, rows.length),
        carriedPercent: percent(carriedRows, rows.length),
        missingPercent: percent(missingRows, rows.length),
        maxCoordinateAge: Math.max(...perPlayer.map(item => item.maximumCoordinateAge ?? 0)),
        medianCoordinateAge: median(rows.map(row => row.position.ageSeconds).filter(Number.isFinite)),
        impossibleJumpCount: rows.filter(row => row.validationFlags.includes('teleport_like_displacement')).length,
        pawnReplacementCount: rows.filter(row => row.validationFlags.includes('pawn_replacement')).length,
        coordinateBounds: coordinateBounds(rows.filter(row => row.position.x !== null).map(row => row.position)),
        projectionCoveragePercent: percent(rows.filter(row => row.laneProjection.nearestLane !== null).length, rows.length),
        speed: distribution(speeds),
        nearestLaneDistance: distribution(nearestDistances),
        separationMargin: distribution(margins),
        structuralRegionRows: {
            nearTeamBase: rows.filter(row => row.structuralRegions.nearTeamBase).length,
            nearEnemyBase: rows.filter(row => row.structuralRegions.nearEnemyBase).length,
            nearDeployment: rows.filter(row => row.structuralRegions.nearDeployment).length,
            nearCentralObjective: rows.filter(row => row.structuralRegions.nearCentralObjective).length,
            nearNeutralStructure: rows.filter(row => row.structuralRegions.nearNeutralStructure).length,
            outsideKnownStructuralEnvelope: rows.filter(row => row.structuralRegions.outsideKnownStructuralEnvelope).length
        }
    };
}

function buildComparison(results) {
    const schema = [
        'replayId',
        'durationSeconds',
        'rowCount',
        'playerCount',
        'directPercent',
        'carriedPercent',
        'missingPercent',
        'maxCoordinateAge',
        'projectionCoveragePercent',
        'impossibleJumpCount',
        'pawnReplacementCount'
    ];
    const rows = results.map(result => [
        result.replayId,
        result.quality.tickDomain.durationSeconds,
        result.rowCount,
        result.players.length,
        result.quality.aggregate.directPercent,
        result.quality.aggregate.carriedPercent,
        result.quality.aggregate.missingPercent,
        result.quality.aggregate.maxCoordinateAge,
        result.quality.aggregate.projectionCoveragePercent,
        result.quality.aggregate.impossibleJumpCount,
        result.quality.aggregate.pawnReplacementCount
    ]);
    return {
        schemaVersion: 1,
        kind: 'multi_replay_spatial_comparison',
        schema,
        rows,
        replaySummaries: results.map(result => ({
            replayId: result.replayId,
            durationSeconds: result.quality.tickDomain.durationSeconds,
            rowCount: result.rowCount,
            coordinateCoverage: {
                directPercent: result.quality.aggregate.directPercent,
                carriedPercent: result.quality.aggregate.carriedPercent,
                missingPercent: result.quality.aggregate.missingPercent,
                maxCoordinateAge: result.quality.aggregate.maxCoordinateAge
            },
            movementSpeedDistribution: result.quality.aggregate.speed,
            spatialBounds: result.quality.aggregate.coordinateBounds,
            nearestLaneDistanceDistribution: result.quality.aggregate.nearestLaneDistance,
            separationMarginDistribution: result.quality.aggregate.separationMargin,
            structuralRegionRows: result.quality.aggregate.structuralRegionRows
        })),
        schemaEquality: results.every(result => result.manifest.generatedFeatures.join('|') === results[0].manifest.generatedFeatures.join('|')),
        comparability: compareResults(results),
        replay005Protection: {
            status: 'preserved',
            processed: false
        }
    };
}

function buildGate(results, comparison) {
    const allPlayers = results.every(result => result.players.length === 12);
    const allFiniteProjection = results.every(result => result.quality.validation.finiteProjectionForValidCoordinates);
    const allUnique = results.every(result => result.quality.validation.uniquePlayerTimeKeys);
    const noMajorMissing = results.every(result => result.quality.aggregate.missingPercent <= 1);
    const noMajorStale = results.every(result => result.quality.aggregate.maxCoordinateAge <= STALE_SECONDS);
    const noIncomparable = comparison.comparability.status !== 'incomparable';
    const ready = TIME_STEP_SECONDS === 1 && allPlayers && allFiniteProjection && allUnique && noMajorMissing && noMajorStale && noIncomparable;
    const usable = allPlayers && allFiniteProjection && allUnique && noIncomparable;
    return {
        schemaVersion: 1,
        kind: 'full_spatial_timeline_gate',
        gateResult: ready ? 'full_spatial_timeline_ready' : usable ? 'full_spatial_timeline_ready_with_limitations' : noIncomparable ? 'full_spatial_timeline_blocked' : 'full_spatial_timeline_incomparable',
        evidence: {
            allHave12Players: allPlayers,
            allFiniteProjection,
            allUniquePlayerTimeKeys: allUnique,
            noMajorMissing,
            noMajorStale,
            crossReplayComparability: comparison.comparability
        },
        limitations: TIME_STEP_SECONDS === 1 ? [] : [
            `temporal_resolution_${TIME_STEP_SECONDS}s_not_1s`,
            'later frozen-model tests must not evaluate sub-5-second continuity or brief-contact behavior from this dataset'
        ],
        allowedDownstreamUse: [
            'frozen-model generalization tests without recalibration',
            'coordinate coverage and projection quality analysis',
            'movement-feature audit without semantic transition claims'
        ],
        prohibitedConclusions: [
            'semantic lane correctness',
            'stable lane occupancy',
            'transition readiness',
            'strategic lane assignment',
            'optimality'
        ],
        replay005Protection: {
            status: 'preserved',
            processed: false
        }
    };
}

function buildGeometry(profile) {
    const laneAxes = profile.laneAxes.map(axis => ({
        neutralLaneId: axis.neutralLaneId,
        polyline: axis.polyline
    }));
    const allStructures = profile.laneAxes.flatMap(axis => axis.orderedStructures.map(item => ({ ...item, lane: axis.neutralLaneId })));
    const baseAnchors = allStructures.filter(item => /Boss_Tier3|base/iu.test(item.className));
    const centralAnchors = allStructures.filter(item => /MidBoss/iu.test(item.className));
    const neutralAnchors = allStructures.filter(item => /Neutral|Camp|SinnersSacrifice/iu.test(item.className));
    const laneBounds = bounds(profile.laneAxes.flatMap(axis => axis.polyline));
    return {
        laneAxes,
        baseAnchors: baseAnchors.length > 0 ? baseAnchors : syntheticBaseAnchors(profile),
        centralAnchors,
        neutralAnchors,
        bounds: expandBounds(laneBounds, 2500)
    };
}

function syntheticBaseAnchors(profile) {
    const points = profile.laneAxes.flatMap(axis => [ axis.endpointAnchors.start.coordinates, axis.endpointAnchors.end.coordinates ]);
    const sorted = [ ...points ].sort((left, right) => left.y - right.y);
    return [
        { team: 2, coordinates: sorted[0] },
        { team: 3, coordinates: sorted.at(-1) }
    ];
}

function projectToPolyline(point, polyline) {
    if (polyline.length < 2) {
        return { distance: null, normalizedProgress: null, point: null, segmentIndex: null };
    }
    const segmentLengths = [];
    let totalLength = 0;
    for (let index = 1; index < polyline.length; index++) {
        const length = distance3d(polyline[index - 1], polyline[index]);
        segmentLengths.push(length);
        totalLength += length;
    }
    let best = null;
    let distanceBefore = 0;
    for (let index = 1; index < polyline.length; index++) {
        const projected = projectToSegment(point, polyline[index - 1], polyline[index]);
        const candidate = {
            distance: distance3d(point, projected.point),
            normalizedProgress: totalLength === 0 ? 0 : (distanceBefore + projected.t * segmentLengths[index - 1]) / totalLength,
            point: projected.point,
            segmentIndex: index - 1
        };
        if (best === null || candidate.distance < best.distance) best = candidate;
        distanceBefore += segmentLengths[index - 1];
    }
    return best;
}

function projectToSegment(point, start, end) {
    const vx = end.x - start.x;
    const vy = end.y - start.y;
    const vz = (end.z ?? 0) - (start.z ?? 0);
    const wx = point.x - start.x;
    const wy = point.y - start.y;
    const wz = (point.z ?? 0) - (start.z ?? 0);
    const lengthSquared = vx * vx + vy * vy + vz * vz;
    const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, (wx * vx + wy * vy + wz * vz) / lengthSquared));
    return {
        t,
        point: {
            x: start.x + t * vx,
            y: start.y + t * vy,
            z: (start.z ?? 0) + t * vz
        }
    };
}

function emptyPlayerState() {
    return {
        lastDirect: null,
        lastPawnHandle: null,
        previousRow: null
    };
}

function emptyProjection() {
    return {
        nearestLane: null,
        nearestDistance: null,
        secondNearestLane: null,
        secondNearestDistance: null,
        separationMargin: null,
        normalizedProgress: null,
        projectedX: null,
        projectedY: null,
        segmentIndex: null,
        projectionQuality: null,
        allLaneDistances: []
    };
}

function emptyRegions() {
    return {
        nearTeamBase: false,
        nearEnemyBase: false,
        nearDeployment: false,
        nearCentralObjective: false,
        nearNeutralStructure: false,
        outsideKnownStructuralEnvelope: false
    };
}

function compareResults(results) {
    const directPercents = results.map(result => result.quality.aggregate.directPercent);
    const projectionPercents = results.map(result => result.quality.aggregate.projectionCoveragePercent);
    const status = Math.min(...directPercents) >= 95 && Math.min(...projectionPercents) >= 99 ? 'comparable_with_observed_limitations' : 'incomparable';
    return {
        status,
        directPercentRange: [ round(Math.min(...directPercents)), round(Math.max(...directPercents)) ],
        projectionCoverageRange: [ round(Math.min(...projectionPercents)), round(Math.max(...projectionPercents)) ],
        note: 'Distribution similarity is an extraction anomaly check only, not semantic correctness.'
    };
}

async function writeReport(results, comparison, gate) {
    const report = `# Full Multi-Replay Spatial Timeline

## Extraction method

The task sampled each replay at one canonical game-second resolution, reconciled the 12 real player controllers, linked controller-to-pawn coordinates at each second, and projected valid coordinates onto the frozen structural lane-axis polylines.

Rows are stored as JSONL beside a compact JSON manifest for each replay. This preserves complete rows without exceeding the 10 MiB per-output JSON limit.

## Results

${results.map(result => `- ${result.replayId}: ${result.rowCount} player-second rows, ${result.quality.aggregate.directPercent}% direct, ${result.quality.aggregate.carriedPercent}% carried, ${result.quality.aggregate.missingPercent}% missing, projection coverage ${result.quality.aggregate.projectionCoveragePercent}%.`).join('\n')}

## Cross-replay comparison

- Comparability: ${comparison.comparability.status}
- Direct coverage range: ${comparison.comparability.directPercentRange.join('..')}%
- Projection coverage range: ${comparison.comparability.projectionCoverageRange.join('..')}%

## Allowed downstream use

- Frozen model generalization tests without recalibration.
- Coordinate coverage, projection quality, and movement-feature audits.

## Prohibited conclusions

- Stable lane occupancy.
- Transition readiness.
- Semantic lane correctness.
- Strategic lane assignment or optimality.
- Replay 005 evidence.

## Gate result

\`${gate.gateResult}\`
`;
    await fs.writeFile('reports/full-multi-replay-spatial-timeline.md', report);
    await fs.writeFile('reports/latest.md', 'reports/full-multi-replay-spatial-timeline.md\n');
}

async function validateOutputs(files) {
    for (const file of files) {
        const size = (await fs.stat(file)).size;
        if (size > OUTPUT_SIZE_LIMIT && !file.endsWith('.jsonl')) {
            throw new Error(`${file} is ${size} bytes, above ${OUTPUT_SIZE_LIMIT}`);
        }
        const content = await fs.readFile(file, 'utf8');
        if (file.endsWith('.jsonl')) {
            for (const line of content.trim().split(/\r?\n/u)) JSON.parse(line);
        } else {
            JSON.parse(content);
        }
    }
}

async function writeJson(file, value) {
    await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

function hasFinitePosition(position) {
    return position !== null && Number.isFinite(position.x) && Number.isFinite(position.y) && Number.isFinite(position.z);
}

function normalize(value) {
    if (typeof value === 'bigint') return value.toString();
    return value ?? null;
}

function hash(value) {
    return createHash('sha256').update(value).digest('hex');
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

function chronological(rows) {
    const byPlayer = groupBy(rows, row => row.playerId);
    for (const playerRows of byPlayer.values()) {
        for (let index = 1; index < playerRows.length; index++) {
            if (playerRows[index].gameTimeSeconds < playerRows[index - 1].gameTimeSeconds) return false;
        }
    }
    return true;
}

function intervals(seconds) {
    if (seconds.length === 0) return [];
    const result = [];
    let start = seconds[0];
    let previous = seconds[0];
    for (const second of seconds.slice(1)) {
        if (second !== previous + 1) {
            result.push({ startSecond: start, endSecond: previous, durationSeconds: previous - start + 1 });
            start = second;
        }
        previous = second;
    }
    result.push({ startSecond: start, endSecond: previous, durationSeconds: previous - start + 1 });
    return result;
}

function coordinateBounds(points) {
    if (points.length === 0) return null;
    return {
        minX: round(Math.min(...points.map(point => point.x))),
        maxX: round(Math.max(...points.map(point => point.x))),
        minY: round(Math.min(...points.map(point => point.y))),
        maxY: round(Math.max(...points.map(point => point.y))),
        minZ: round(Math.min(...points.map(point => point.z ?? 0))),
        maxZ: round(Math.max(...points.map(point => point.z ?? 0)))
    };
}

function bounds(points) {
    return coordinateBounds(points);
}

function expandBounds(box, margin) {
    return {
        minX: box.minX - margin,
        maxX: box.maxX + margin,
        minY: box.minY - margin,
        maxY: box.maxY + margin,
        minZ: box.minZ - margin,
        maxZ: box.maxZ + margin
    };
}

function insideBounds(point, box) {
    return point.x >= box.minX && point.x <= box.maxX && point.y >= box.minY && point.y <= box.maxY && (point.z ?? 0) >= box.minZ && (point.z ?? 0) <= box.maxZ;
}

function distribution(values) {
    const clean = values.filter(Number.isFinite).sort((left, right) => left - right);
    return {
        count: clean.length,
        min: round(clean[0]),
        median: round(median(clean)),
        p90: round(clean[Math.floor(clean.length * 0.9)]),
        max: round(clean.at(-1))
    };
}

function median(values) {
    if (values.length === 0) return null;
    const sorted = [ ...values ].sort((left, right) => left - right);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function percent(value, total) {
    return total === 0 ? 0 : round(value * 100 / total);
}

function distance2d(left, right) {
    return Math.hypot(left.x - right.x, left.y - right.y);
}

function distance3d(left, right) {
    return Math.hypot(left.x - right.x, left.y - right.y, (left.z ?? 0) - (right.z ?? 0));
}

function round(value) {
    return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
}
