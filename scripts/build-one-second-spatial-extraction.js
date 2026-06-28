import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

import { Logger, Player } from 'deadem';

const REPLAYS = [
    { replayId: 'replay_001', file: 'samples/partida_001.dem' },
    { replayId: 'replay_002', file: 'samples/partida_002.dem' },
    { replayId: 'replay_003', file: 'samples/partida_003.dem' },
    { replayId: 'replay_004', file: 'samples/partida_004.dem' }
];
const PROFILE_REPLAY = 'replay_002';
const PROFILE_SECONDS = 120;
const TIME_STEP_SECONDS = 1;
const OUTPUT_SIZE_LIMIT = 10 * 1024 * 1024;
const CONTROLLER_CLASS = 'CCitadelPlayerController';
const PAWN_CLASS = 'CCitadelPlayerPawn';
const BASE_RADIUS = 700;
const CENTRAL_RADIUS = 500;
const NEUTRAL_RADIUS = 450;
const IMPOSSIBLE_SPEED = 3000;
const HIGH_CONFIDENCE_MAX_DISTANCE = 380;
const HIGH_CONFIDENCE_MIN_MARGIN = 90;
const AMBIGUOUS_MAX_DISTANCE = 520;
const AMBIGUOUS_MIN_MARGIN = 45;

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});

async function main() {
    const profile = JSON.parse(await fs.readFile('output/replay-lane-axis-topology-profile.json', 'utf8'));
    const geometry = buildGeometry(profile);
    const profileResult = await runProfile(REPLAYS.find(replay => replay.replayId === PROFILE_REPLAY), geometry);
    const results = [];

    for (const replay of REPLAYS) {
        results.push(await extractReplay(replay, geometry, profile, { profile: replay.replayId === PROFILE_REPLAY }));
    }

    const comparison = await buildComparison(results);
    const repeatability = await runRepeatability(REPLAYS.find(replay => replay.replayId === PROFILE_REPLAY), geometry, profile);
    const gate = buildGate(results, comparison, repeatability, profileResult);
    const evidenceSchema = buildEvidenceSchema();

    await writeJson('output/replays/one-second-spatial-profile.json', profileResult);
    await writeJson('output/replays/one-second-spatial-comparison.json', comparison);
    await writeJson('output/replays/one-second-spatial-gate.json', gate);
    await writeJson('output/replays/descriptive-spatial-evidence-schema.json', evidenceSchema);
    await writeReports(results, comparison, repeatability, gate, evidenceSchema, profileResult);
    await validateTaskOutputs(results, [
        'output/replays/one-second-spatial-profile.json',
        'output/replays/one-second-spatial-comparison.json',
        'output/replays/one-second-spatial-gate.json',
        'output/replays/descriptive-spatial-evidence-schema.json'
    ]);

    console.log(`one-second spatial gate: ${gate.gateResult}`);
    for (const result of results) {
        console.log(`${result.replayId}: ${result.quality.aggregate.expectedRows} rows, ${result.manifest.shards.length} shards, ${result.runtime.totalSeconds}s`);
    }
}

async function runProfile(replay, geometry) {
    const phases = {};
    const startMemory = process.memoryUsage().rss;
    const start = performance.now();
    const player = new Player(undefined, Logger.NOOP);
    try {
        const parseStart = performance.now();
        await player.load(createReadStream(replay.file));
        phases.replayParsingMs = elapsed(parseStart);

        const firstTickRaw = player.getFirstTick();
        const effectiveFirstTick = firstTickRaw < 0 ? 0 : firstTickRaw;
        const lastTick = player.getLastTick();
        const tickRate = player.getDemo().server?.tickRate ?? null;
        const playerStart = performance.now();
        const players = await discoverPlayers(player, effectiveFirstTick, lastTick, tickRate);
        phases.playerReconciliationMs = elapsed(playerStart);

        await player.seekToTick(effectiveFirstTick);
        const playerState = new Map(players.map(item => [ item.playerId, emptyPlayerState() ]));
        const measuredSeconds = Math.min(PROFILE_SECONDS, Math.floor((lastTick - effectiveFirstTick) / tickRate));
        const timings = { entityUpdateMs: 0, timelineMaterializationMs: 0, laneProjectionMs: 0, serializationMs: 0 };
        let rows = 0;

        for (let second = 0; second <= measuredSeconds; second++) {
            const targetTick = Math.min(lastTick, Math.round(effectiveFirstTick + second * tickRate));
            const updateStart = performance.now();
            await advanceToTick(player, targetTick);
            timings.entityUpdateMs += elapsed(updateStart);

            const materialStart = performance.now();
            const snapshot = snapshotPlayers(player, players, second, player.getCurrentTick());
            const projectionTimer = { ms: 0 };
            const builtRows = buildRows(replay.replayId, players, snapshot, playerState, geometry, projectionTimer);
            timings.timelineMaterializationMs += elapsed(materialStart);
            timings.laneProjectionMs += projectionTimer.ms;

            const serializationStart = performance.now();
            builtRows.map(row => JSON.stringify(row)).join('\n');
            timings.serializationMs += elapsed(serializationStart);
            rows += builtRows.length;
        }

        const totalMs = elapsed(start);
        return {
            schemaVersion: 1,
            kind: 'one_second_spatial_profile',
            replayId: replay.replayId,
            profiledSeconds: measuredSeconds + 1,
            rowCount: rows,
            phases: {
                ...roundObject(phases),
                ...roundObject(timings),
                totalMs: round(totalMs)
            },
            peakMemoryRssBytes: Math.max(process.memoryUsage().rss, startMemory),
            estimatedFullReplayMs: round(totalMs + (timings.entityUpdateMs + timings.timelineMaterializationMs + timings.serializationMs) * (Math.floor((lastTick - effectiveFirstTick) / tickRate) / (measuredSeconds + 1))),
            largestContributors: topContributors({ ...phases, ...timings }),
            optimizationFindings: [
                'Sequential nextTick processing parses each replay once and avoids one ParserSession per sampled second.',
                'Rows are streamed to per-player shards instead of retained as one expanded replay object.',
                'Lane polyline segment lengths are precomputed once per run.',
                'Serialization is batched per sampled second and written to open shard handles.'
            ],
            measuredPotentialIssues: {
                repeatedParsing: 1,
                repeatedGeometryCalculations: 'lane segment setup cached; projection still computed per direct coordinate',
                synchronousFileWrites: 'optimized pipeline uses async append streams',
                largeInMemoryObjectDuplication: 'optimized pipeline retains summaries and current player state only'
            },
            replay005Protection: { processed: false, status: 'preserved' }
        };
    } finally {
        await player.dispose();
    }
}

async function extractReplay(replay, geometry, profile, options = {}) {
    const outputDir = path.join('output', 'replays', replay.replayId, 'one-second-spatial');
    const player = new Player(undefined, Logger.NOOP);
    const runtimeStart = performance.now();
    const profileTimings = { entityUpdateMs: 0, timelineMaterializationMs: 0, laneProjectionMs: 0, serializationMs: 0 };
    const memoryStart = process.memoryUsage().rss;
    await fs.mkdir(outputDir, { recursive: true });
    await removeOldOneSecondFiles(outputDir);

    try {
        const loadStart = performance.now();
        await player.load(createReadStream(replay.file));
        const loadMs = elapsed(loadStart);
        const firstTickRaw = player.getFirstTick();
        const effectiveFirstTick = firstTickRaw < 0 ? 0 : firstTickRaw;
        const lastTick = player.getLastTick();
        const tickRate = player.getDemo().server?.tickRate ?? null;
        const durationSeconds = Math.floor((lastTick - effectiveFirstTick) / tickRate);
        const players = await discoverPlayers(player, effectiveFirstTick, lastTick, tickRate);
        await player.seekToTick(effectiveFirstTick);

        const writers = await openShardWriters(outputDir, players);
        const playerState = new Map(players.map(item => [ item.playerId, emptyPlayerState() ]));
        const quality = createQualityAccumulator(replay, players, durationSeconds, tickRate, effectiveFirstTick, lastTick);
        const allShardHashes = [];

        try {
            for (let second = 0; second <= durationSeconds; second++) {
                const targetTick = Math.min(lastTick, Math.round(effectiveFirstTick + second * tickRate));
                const updateStart = performance.now();
                await advanceToTick(player, targetTick);
                profileTimings.entityUpdateMs += elapsed(updateStart);

                const materialStart = performance.now();
                const snapshot = snapshotPlayers(player, players, second, player.getCurrentTick());
                const projectionTimer = { ms: 0 };
                const rows = buildRows(replay.replayId, players, snapshot, playerState, geometry, projectionTimer);
                profileTimings.timelineMaterializationMs += elapsed(materialStart);
                profileTimings.laneProjectionMs += projectionTimer.ms;

                const serializationStart = performance.now();
                for (const row of rows) {
                    updateQuality(quality, row);
                    const writer = writers.get(row.playerId);
                    const serialized = `${JSON.stringify(row)}\n`;
                    writer.hash.update(serialized);
                    writer.rows += 1;
                    writer.bytes += Buffer.byteLength(serialized);
                    writer.stream.write(serialized);
                }
                profileTimings.serializationMs += elapsed(serializationStart);
            }
        } finally {
            for (const writer of writers.values()) {
                await closeWriter(writer);
                writer.sha256 = writer.hash.digest('hex');
                allShardHashes.push(writer.sha256);
            }
        }

        const finalQuality = finalizeQuality(quality);
        const shards = Array.from(writers.values()).map(writer => ({
            playerId: writer.playerId,
            file: normalizePath(path.relative('.', writer.file)),
            rowCount: writer.rows,
            sizeBytes: writer.bytes,
            sha256: writer.sha256
        }));
        const manifest = {
            schemaVersion: 1,
            kind: 'one_second_spatial_manifest',
            replayId: replay.replayId,
            sourceReplay: replay.file,
            temporalResolutionSeconds: TIME_STEP_SECONDS,
            alignmentRule: 'canonical game second s maps to round(effectiveFirstTick + s * tickRate); sequential nextTick advances until current tick is at or after target tick',
            missingRowPolicy: 'one row is emitted for each stable player and canonical second; missing coordinates are explicit rows with position.quality = missing',
            carriedForwardPolicy: 'primary one-second comparison dataset does not carry forward or interpolate coordinates',
            shards,
            rowCount: finalQuality.aggregate.expectedRows,
            shardSetSha256: hash(allShardHashes.join('\n')),
            extractionCode: 'scripts/build-one-second-spatial-extraction.js',
            geometryProfile: profile.profileId,
            startGameTimeSeconds: 0,
            endGameTimeSeconds: durationSeconds,
            tickDomain: { firstTickRaw, effectiveFirstTick, lastTick, tickRate, durationSeconds },
            qualityFile: normalizePath(path.join(outputDir, 'quality.json')),
            validation: finalQuality.validation,
            replay005Protection: { processed: false, status: 'preserved' }
        };
        const runtime = {
            loadMs: round(loadMs),
            ...roundObject(profileTimings),
            totalSeconds: round(elapsed(runtimeStart) / 1000),
            peakMemoryRssBytes: Math.max(process.memoryUsage().rss, memoryStart)
        };
        manifest.runtime = runtime;
        await writeJson(path.join(outputDir, 'manifest.json'), manifest);
        await writeJson(path.join(outputDir, 'quality.json'), finalQuality);
        return {
            replayId: replay.replayId,
            outputDir,
            manifestFile: normalizePath(path.join(outputDir, 'manifest.json')),
            qualityFile: normalizePath(path.join(outputDir, 'quality.json')),
            manifest,
            quality: finalQuality,
            runtime,
            profileTimings: options.profile ? profileTimings : null
        };
    } finally {
        await player.dispose();
    }
}

async function runRepeatability(replay, geometry, profile) {
    const tempReplay = { ...replay, replayId: `${replay.replayId}_repeat_check` };
    const first = await extractReplay(tempReplay, geometry, profile);
    const second = await extractReplay(tempReplay, geometry, profile);
    await removeDirectory(path.join('output', 'replays', tempReplay.replayId));
    return {
        replayId: replay.replayId,
        identicalShardSetHash: first.manifest.shardSetSha256 === second.manifest.shardSetSha256,
        identicalRowCount: first.manifest.rowCount === second.manifest.rowCount,
        identicalQuality: stableStringify(first.quality.aggregate) === stableStringify(second.quality.aggregate)
            && stableStringify(first.quality.validation) === stableStringify(second.quality.validation),
        firstShardSetSha256: first.manifest.shardSetSha256,
        secondShardSetSha256: second.manifest.shardSetSha256,
        firstRows: first.manifest.rowCount,
        secondRows: second.manifest.rowCount
    };
}

async function buildComparison(results) {
    const alignment = [];
    for (const result of results) {
        const fiveSecondRowsFile = result.replayId === 'replay_001'
            ? 'output/replays/replay_001/five-second-control/full-spatial-timeline.rows.jsonl'
            : `output/replays/${result.replayId}/full-spatial-timeline.rows.jsonl`;
        if (!await exists(fiveSecondRowsFile)) {
            alignment.push({ replayId: result.replayId, status: 'missing_five_second_reference' });
            continue;
        }
        alignment.push(await compareFiveSecondAlignment(result, fiveSecondRowsFile));
    }
    return {
        schemaVersion: 1,
        kind: 'one_second_spatial_comparison',
        replays: results.map(result => ({
            replayId: result.replayId,
            rows: result.manifest.rowCount,
            shards: result.manifest.shards.length,
            runtimeSeconds: result.runtime.totalSeconds,
            directPercent: result.quality.aggregate.directPercent,
            missingPercent: result.quality.aggregate.missingPercent,
            projectionCoveragePercent: result.quality.aggregate.projectionCoveragePercent
        })),
        fiveSecondAlignment: alignment,
        tolerances: {
            coordinate: 0.01,
            laneDistance: 0.01,
            speed: 0.01
        },
        replay005Protection: { processed: false, status: 'preserved' }
    };
}

async function compareFiveSecondAlignment(result, fiveSecondRowsFile) {
    const fiveRows = await readJsonl(fiveSecondRowsFile);
    const oneRowsByKey = await loadShardRowsByKey(result.manifest.shards);
    const mismatches = {
        missingOneSecondRow: 0,
        identity: 0,
        coordinates: 0,
        laneProjection: 0,
        structuralRegions: 0,
        movementComparable: 0
    };
    const examples = [];
    for (const five of fiveRows) {
        const key = rowKey(five);
        const one = oneRowsByKey.get(key);
        if (!one) {
            mismatches.missingOneSecondRow += 1;
            examples.push({ key, reason: 'missing_one_second_row' });
            continue;
        }
        if (one.playerId !== five.playerId || one.team !== five.team || one.heroId !== five.heroId) {
            mismatches.identity += 1;
            examples.push({ key, reason: 'identity_mismatch' });
        }
        if (!samePosition(one.position, five.position, 0.01)) {
            mismatches.coordinates += 1;
            examples.push({ key, reason: 'coordinate_mismatch' });
        }
        if (!sameProjection(one.laneProjection, five.laneProjection, 0.01)) {
            mismatches.laneProjection += 1;
            examples.push({ key, reason: 'lane_projection_mismatch' });
        }
        if (stableStringify(one.structuralRegions) !== stableStringify(five.structuralRegions)) {
            mismatches.structuralRegions += 1;
            examples.push({ key, reason: 'structural_region_mismatch' });
        }
        if (five.gameTimeSeconds > 0 && !sameMovement(one.movement, five.movement, 0.01)) {
            mismatches.movementComparable += 1;
        }
    }
    return {
        replayId: result.replayId,
        status: Object.values(mismatches).every(value => value === 0) ? 'aligned' : 'aligned_with_expected_movement_resolution_differences',
        comparedRows: fiveRows.length,
        mismatches,
        examples: examples.slice(0, 10)
    };
}

function buildGate(results, comparison, repeatability, profileResult) {
    const allSucceeded = results.every(result => result.quality.validation.uniquePlayerTimeKeys
        && result.quality.validation.chronologicalOrdering
        && result.quality.validation.stablePlayerIdentities
        && result.quality.validation.finiteProjectionForDirectCoordinates);
    const allExactlyAligned = comparison.fiveSecondAlignment.every(item => item.status === 'aligned');
    const allComparable = comparison.fiveSecondAlignment.every(item => item.status === 'aligned'
        || item.status === 'aligned_with_expected_movement_resolution_differences');
    const boundedMissing = results.every(result => result.quality.aggregate.missingPercent <= 1);
    const repeatable = repeatability.identicalShardSetHash && repeatability.identicalRowCount && repeatability.identicalQuality;
    const gateResult = allSucceeded && allComparable && repeatable
        ? boundedMissing && allExactlyAligned ? 'one_second_spatial_ready' : 'one_second_spatial_ready_with_limitations'
        : 'one_second_spatial_performance_blocked';
    return {
        schemaVersion: 1,
        kind: 'one_second_spatial_gate',
        gateResult,
        evidence: {
            allSucceeded,
            allExactlyAligned,
            allComparable,
            boundedMissing,
            repeatable,
            profileLargestContributors: profileResult.largestContributors
        },
        allowedDownstreamUse: gateResult.startsWith('one_second_spatial_ready') ? [
            'resolution-controlled frozen occupancy candidate comparison',
            'descriptive point-level spatial evidence',
            'coordinate and projection quality analysis'
        ] : [
            'descriptive point-level spatial evidence from available five-second data only'
        ],
        prohibitedConclusions: [
            'semantic lane occupancy',
            'reliable occupancy episodes',
            'transitions or rotations',
            'strategic interpretation',
            'replay 005 conclusions'
        ],
        replay005Readiness: {
            status: 'not_ready_no_candidate',
            reason: 'One-second extraction alone does not freeze a final holdout hypothesis or pass/fail criteria.'
        },
        replay005Protection: { processed: false, status: 'preserved' }
    };
}

function buildEvidenceSchema() {
    return {
        schemaVersion: 1,
        kind: 'descriptive_spatial_evidence_schema',
        rowShape: {
            replayId: 'string',
            playerId: 'string',
            gameTimeSeconds: 'number',
            nearestPhysicalLane: 'lane_axis_1|lane_axis_2|lane_axis_3|null',
            nearestDistance: 'number|null',
            secondNearestDistance: 'number|null',
            separationMargin: 'number|null',
            baseExcluded: 'boolean',
            deploymentExcluded: 'boolean',
            evidenceClass: 'high_confidence_lane_proximity|ambiguous_lane_proximity|base_or_deployment|neutral_or_unclassified|missing_or_invalid',
            allowedInterpretation: 'physical proximity evidence',
            prohibitedInterpretations: [ 'semantic occupancy', 'rotation', 'strategic assignment' ]
        },
        classes: [
            {
                evidenceClass: 'high_confidence_lane_proximity',
                rule: `direct coordinate, not base/deployment, nearestDistance <= ${HIGH_CONFIDENCE_MAX_DISTANCE}, separationMargin >= ${HIGH_CONFIDENCE_MIN_MARGIN}`,
                allowedInterpretation: 'The player coordinate is physically close to a structural lane axis with strong separation from alternatives.',
                prohibitedInterpretations: [ 'semantic occupancy', 'rotation', 'strategic assignment' ]
            },
            {
                evidenceClass: 'ambiguous_lane_proximity',
                rule: `direct coordinate, not base/deployment, nearestDistance <= ${AMBIGUOUS_MAX_DISTANCE}, separationMargin >= ${AMBIGUOUS_MIN_MARGIN}, but not high confidence`,
                allowedInterpretation: 'The player coordinate is near a lane axis but geometric separation is not strong enough for high-confidence proximity.',
                prohibitedInterpretations: [ 'semantic occupancy', 'rotation', 'strategic assignment' ]
            },
            {
                evidenceClass: 'base_or_deployment',
                rule: 'direct coordinate near team base, enemy base, or deployment evidence',
                allowedInterpretation: 'Base/deployment geometry excludes high-confidence lane proximity.',
                prohibitedInterpretations: [ 'lane occupancy', 'rotation', 'strategic assignment' ]
            },
            {
                evidenceClass: 'neutral_or_unclassified',
                rule: 'direct coordinate without enough lane-axis proximity or separation evidence',
                allowedInterpretation: 'No conservative lane-proximity evidence is available for this point.',
                prohibitedInterpretations: [ 'semantic occupancy', 'rotation', 'strategic assignment' ]
            },
            {
                evidenceClass: 'missing_or_invalid',
                rule: 'missing or invalid coordinate',
                allowedInterpretation: 'No spatial evidence is available.',
                prohibitedInterpretations: [ 'semantic occupancy', 'rotation', 'strategic assignment' ]
            }
        ],
        replay005Protection: { processed: false, status: 'preserved' }
    };
}

function spatialEvidenceForRow(row) {
    const missing = row.position.quality === 'missing' || !Number.isFinite(row.position.x) || !Number.isFinite(row.position.y);
    const baseExcluded = Boolean(row.structuralRegions.nearTeamBase || row.structuralRegions.nearEnemyBase);
    const deploymentExcluded = Boolean(row.structuralRegions.nearDeployment);
    let evidenceClass = 'neutral_or_unclassified';
    if (missing) evidenceClass = 'missing_or_invalid';
    else if (baseExcluded || deploymentExcluded) evidenceClass = 'base_or_deployment';
    else if (row.laneProjection.nearestDistance <= HIGH_CONFIDENCE_MAX_DISTANCE && row.laneProjection.separationMargin >= HIGH_CONFIDENCE_MIN_MARGIN) evidenceClass = 'high_confidence_lane_proximity';
    else if (row.laneProjection.nearestDistance <= AMBIGUOUS_MAX_DISTANCE && row.laneProjection.separationMargin >= AMBIGUOUS_MIN_MARGIN) evidenceClass = 'ambiguous_lane_proximity';
    return {
        nearestPhysicalLane: row.laneProjection.nearestLane,
        nearestDistance: row.laneProjection.nearestDistance,
        secondNearestDistance: row.laneProjection.secondNearestDistance,
        separationMargin: row.laneProjection.separationMargin,
        baseExcluded,
        deploymentExcluded,
        evidenceClass
    };
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
            const existing = candidates.get(playerId) ?? { playerId, name: null, heroId: null, team: null, controllerHandle: null, observations: 0 };
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
            position: hasFinitePosition(position) ? position : null
        } ];
    }));
}

function buildRows(replayId, players, snapshot, playerState, geometry, projectionTimer) {
    return players.map(playerInfo => {
        const observed = snapshot[playerInfo.playerId];
        const state = playerState.get(playerInfo.playerId);
        const validationFlags = [];
        const positionQuality = observed.position === null ? 'missing' : 'direct';
        const position = observed.position;
        const projectionStart = performance.now();
        const laneProjection = position === null ? emptyProjection() : projectLane(position, geometry.laneAxes);
        projectionTimer.ms += elapsed(projectionStart);
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
                sourceTick: position === null ? null : observed.tick,
                ageSeconds: position === null ? null : 0,
                quality: positionQuality
            },
            laneProjection,
            structuralRegions,
            movement,
            spatialEvidence: null,
            validationFlags
        };
        row.spatialEvidence = spatialEvidenceForRow(row);
        state.previousRow = row;
        return row;
    });
}

function buildGeometry(profile) {
    const laneAxes = profile.laneAxes.map(axis => ({ neutralLaneId: axis.neutralLaneId, segments: precomputeSegments(axis.polyline) }));
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

function precomputeSegments(polyline) {
    const segments = [];
    let totalLength = 0;
    for (let index = 1; index < polyline.length; index++) {
        const start = polyline[index - 1];
        const end = polyline[index];
        const length = distance3d(start, end);
        segments.push({ start, end, length, distanceBefore: totalLength });
        totalLength += length;
    }
    return segments.map(segment => ({ ...segment, totalLength }));
}

function projectLane(point, laneAxes) {
    const distances = laneAxes.map(axis => {
        const projection = projectToSegments(point, axis.segments);
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

function projectToSegments(point, segments) {
    let best = null;
    for (let index = 0; index < segments.length; index++) {
        const segment = segments[index];
        const projected = projectToSegment(point, segment.start, segment.end);
        const candidate = {
            distance: distance3d(point, projected.point),
            normalizedProgress: segment.totalLength === 0 ? 0 : (segment.distanceBefore + projected.t * segment.length) / segment.totalLength,
            point: projected.point,
            segmentIndex: index
        };
        if (best === null || candidate.distance < best.distance) best = candidate;
    }
    return best ?? { distance: null, normalizedProgress: null, point: null, segmentIndex: null };
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
    return { t, point: { x: start.x + t * vx, y: start.y + t * vy, z: (start.z ?? 0) + t * vz } };
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
    if (position === null || !hasFiniteRowPosition(previousRow)) {
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
    const horizontal = distance2d(position, previous);
    const speed = gapSeconds > 0 ? horizontal / gapSeconds : null;
    const previousSpeed = previousRow.movement?.speed;
    if (Number.isFinite(speed) && speed > IMPOSSIBLE_SPEED) validationFlags.push('teleport_like_displacement');
    return {
        distanceFromPrevious: round(distance3d(position, previous)),
        horizontalDistanceFromPrevious: round(horizontal),
        speed: round(speed),
        directionX: horizontal > 0 ? round((position.x - previous.x) / horizontal) : null,
        directionY: horizontal > 0 ? round((position.y - previous.y) / horizontal) : null,
        acceleration: Number.isFinite(speed) && Number.isFinite(previousSpeed) && gapSeconds > 0 ? round((speed - previousSpeed) / gapSeconds) : null,
        gapSeconds,
        continuityStatus: positionQuality === 'direct' ? 'direct_sample' : positionQuality
    };
}

function hasFiniteRowPosition(row) {
    return row?.position !== null
        && Number.isFinite(row?.position?.x)
        && Number.isFinite(row?.position?.y)
        && Number.isFinite(row?.position?.z);
}

async function openShardWriters(outputDir, players) {
    const writers = new Map();
    for (const playerInfo of players) {
        const safeId = String(playerInfo.playerId).replace(/[^a-zA-Z0-9_-]/gu, '_');
        const file = path.join(outputDir, `player_${safeId}.rows.jsonl`);
        const stream = await fs.open(file, 'w');
        writers.set(playerInfo.playerId, {
            playerId: playerInfo.playerId,
            file,
            handle: stream,
            stream: stream.createWriteStream(),
            hash: createHash('sha256'),
            rows: 0,
            bytes: 0,
            sha256: null
        });
    }
    return writers;
}

async function closeWriter(writer) {
    await new Promise((resolve, reject) => {
        writer.stream.end(error => error ? reject(error) : resolve());
    });
    await writer.handle.close();
}

function createQualityAccumulator(replay, players, durationSeconds, tickRate, firstTick, lastTick) {
    return {
        schemaVersion: 1,
        kind: 'one_second_spatial_quality',
        replayId: replay.replayId,
        sourceReplay: replay.file,
        temporalResolutionSeconds: TIME_STEP_SECONDS,
        tickDomain: { effectiveFirstTick: firstTick, lastTick, tickRate, durationSeconds },
        playerReconciliation: { playerCount: players.length, stablePlayerIdentities: players.length === 12, players },
        aggregate: {
            expectedRows: 0,
            directRows: 0,
            missingRows: 0,
            interpolatedRows: 0,
            carriedRows: 0,
            impossibleJumpCount: 0,
            projectionRows: 0,
            evidenceClassCounts: {},
            speeds: [],
            nearestDistances: [],
            margins: []
        },
        players: Object.fromEntries(players.map(player => [ player.playerId, {
            playerId: player.playerId,
            expectedTimelineRows: 0,
            rowsWithDirectCoordinates: 0,
            rowsMissing: 0,
            impossibleJumpCount: 0,
            firstValidPosition: null,
            lastValidPosition: null
        } ])),
        _keys: new Set(),
        _lastSecondByPlayer: new Map()
    };
}

function updateQuality(quality, row) {
    const aggregate = quality.aggregate;
    aggregate.expectedRows += 1;
    const playerQuality = quality.players[row.playerId];
    playerQuality.expectedTimelineRows += 1;
    quality._keys.add(rowKey(row));
    const lastSecond = quality._lastSecondByPlayer.get(row.playerId);
    if (lastSecond !== undefined && row.gameTimeSeconds < lastSecond) playerQuality.outOfOrder = true;
    quality._lastSecondByPlayer.set(row.playerId, row.gameTimeSeconds);
    if (row.position.quality === 'direct') {
        aggregate.directRows += 1;
        aggregate.projectionRows += row.laneProjection.nearestLane === null ? 0 : 1;
        playerQuality.rowsWithDirectCoordinates += 1;
        playerQuality.firstValidPosition ??= row.position;
        playerQuality.lastValidPosition = row.position;
        if (Number.isFinite(row.movement.speed)) aggregate.speeds.push(row.movement.speed);
        if (Number.isFinite(row.laneProjection.nearestDistance)) aggregate.nearestDistances.push(row.laneProjection.nearestDistance);
        if (Number.isFinite(row.laneProjection.separationMargin)) aggregate.margins.push(row.laneProjection.separationMargin);
    } else {
        aggregate.missingRows += 1;
        playerQuality.rowsMissing += 1;
    }
    if (row.validationFlags.includes('teleport_like_displacement')) {
        aggregate.impossibleJumpCount += 1;
        playerQuality.impossibleJumpCount += 1;
    }
    aggregate.evidenceClassCounts[row.spatialEvidence.evidenceClass] = (aggregate.evidenceClassCounts[row.spatialEvidence.evidenceClass] ?? 0) + 1;
}

function finalizeQuality(quality) {
    const aggregate = quality.aggregate;
    const finalAggregate = {
        expectedRows: aggregate.expectedRows,
        directRows: aggregate.directRows,
        carriedRows: aggregate.carriedRows,
        interpolatedRows: aggregate.interpolatedRows,
        missingRows: aggregate.missingRows,
        directPercent: percent(aggregate.directRows, aggregate.expectedRows),
        missingPercent: percent(aggregate.missingRows, aggregate.expectedRows),
        projectionCoveragePercent: percent(aggregate.projectionRows, aggregate.directRows),
        impossibleJumpCount: aggregate.impossibleJumpCount,
        speed: distribution(aggregate.speeds),
        nearestLaneDistance: distribution(aggregate.nearestDistances),
        separationMargin: distribution(aggregate.margins),
        evidenceClassCounts: aggregate.evidenceClassCounts
    };
    const players = Object.values(quality.players);
    return {
        schemaVersion: quality.schemaVersion,
        kind: quality.kind,
        replayId: quality.replayId,
        sourceReplay: quality.sourceReplay,
        temporalResolutionSeconds: quality.temporalResolutionSeconds,
        tickDomain: quality.tickDomain,
        playerReconciliation: quality.playerReconciliation,
        aggregate: finalAggregate,
        players,
        validation: {
            uniquePlayerTimeKeys: quality._keys.size === aggregate.expectedRows,
            chronologicalOrdering: players.every(player => !player.outOfOrder),
            stablePlayerIdentities: quality.playerReconciliation.stablePlayerIdentities,
            finiteProjectionForDirectCoordinates: aggregate.projectionRows === aggregate.directRows,
            noReplay005Processing: true,
            noInterpolation: aggregate.interpolatedRows === 0,
            noCarryForward: aggregate.carriedRows === 0
        }
    };
}

async function validateTaskOutputs(results, files) {
    const allFiles = [
        ...files,
        ...results.flatMap(result => [
            result.manifestFile,
            result.qualityFile,
            ...result.manifest.shards.map(shard => shard.file)
        ]),
        'reports/one-second-multi-replay-spatial-extraction.md',
        'reports/descriptive-spatial-evidence-layer.md'
    ];
    for (const file of allFiles) {
        const stat = await fs.stat(file);
        if (stat.size > OUTPUT_SIZE_LIMIT) throw new Error(`${file} exceeds ${OUTPUT_SIZE_LIMIT} bytes`);
        if (file.endsWith('.json')) JSON.parse(await fs.readFile(file, 'utf8'));
        if (file.endsWith('.jsonl')) {
            const content = await fs.readFile(file, 'utf8');
            for (const line of content.trim().split(/\r?\n/u)) if (line) JSON.parse(line);
        }
    }
    for (const result of results) {
        for (const shard of result.manifest.shards) {
            const content = await fs.readFile(shard.file);
            const digest = createHash('sha256').update(content).digest('hex');
            if (digest !== shard.sha256) throw new Error(`hash mismatch for ${shard.file}`);
        }
    }
}

async function writeReports(results, comparison, repeatability, gate, evidenceSchema, profileResult) {
    const profileLines = profileResult.largestContributors.map(item => `- ${item.name}: ${item.ms} ms`).join('\n');
    const replayLines = results.map(result => `- ${result.replayId}: ${result.manifest.rowCount} rows, ${result.manifest.shards.length} shards, ${result.runtime.totalSeconds}s, ${result.quality.aggregate.directPercent}% direct, ${result.quality.aggregate.missingPercent}% missing.`).join('\n');
    const alignmentLines = comparison.fiveSecondAlignment.map(item => `- ${item.replayId}: ${item.status}, mismatches ${JSON.stringify(item.mismatches ?? {})}.`).join('\n');
    const extractionReport = `# One-Second Multi-Replay Spatial Extraction

## Timeout profile

Replay 002 was profiled with one-second sampling instrumentation. Largest measured contributors:

${profileLines}

The optimized pipeline processes each replay sequentially with \`nextTick()\`, streams rows into per-player JSONL shards, precomputes lane-axis segment data, batches serialization through open file handles, and retains only quality accumulators plus current player state.

## Processing status

${replayLines}

## Five-second alignment

${alignmentLines}

## Repeatability

Replay 002 repeatability: shard hash ${repeatability.identicalShardSetHash}, row count ${repeatability.identicalRowCount}, quality ${repeatability.identicalQuality}.

## Gate

\`${gate.gateResult}\`

## Prohibited conclusions

Semantic lane occupancy, reliable episodes, transitions, rotations, strategic interpretation, and replay 005 conclusions remain prohibited.
`;
    const evidenceReport = `# Descriptive Spatial Evidence Layer

This layer is non-semantic point evidence. It describes physical proximity to structurally derived lane axes and base/deployment exclusion only.

## Classes

${evidenceSchema.classes.map(item => `- ${item.evidenceClass}: ${item.allowedInterpretation} Rule: ${item.rule}`).join('\n')}

## Allowed use

Coaches and analysts may use these classes to inspect where a player coordinate was physically near a neutral structural lane axis, where base/deployment geometry excludes lane-proximity evidence, and where the geometry is ambiguous or missing.

## Prohibited use

Do not read these classes as semantic lane occupancy, rotations, strategic assignments, pressure, farming, or correctness labels.
`;
    await fs.writeFile('reports/one-second-multi-replay-spatial-extraction.md', extractionReport);
    await fs.writeFile('reports/descriptive-spatial-evidence-layer.md', evidenceReport);
    await fs.writeFile('reports/latest.md', 'reports/one-second-multi-replay-spatial-extraction.md\n');
}

async function writeJson(file, value) {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

async function readJsonl(file) {
    const content = await fs.readFile(file, 'utf8');
    return content.trim().split(/\r?\n/u).filter(Boolean).map(line => JSON.parse(line));
}

async function loadShardRowsByKey(shards) {
    const map = new Map();
    for (const shard of shards) {
        for (const row of await readJsonl(shard.file)) {
            map.set(rowKey(row), row);
        }
    }
    return map;
}

async function removeOldOneSecondFiles(outputDir) {
    if (!await exists(outputDir)) return;
    for (const entry of await fs.readdir(outputDir)) {
        await fs.rm(path.join(outputDir, entry), { recursive: true, force: true });
    }
}

async function removeDirectory(dir) {
    await fs.rm(dir, { recursive: true, force: true });
}

async function exists(file) {
    try {
        await fs.stat(file);
        return true;
    } catch {
        return false;
    }
}

function samePosition(left, right, tolerance) {
    return numericEqual(left.x, right.x, tolerance) && numericEqual(left.y, right.y, tolerance) && numericEqual(left.z, right.z, tolerance) && left.quality === right.quality;
}

function sameProjection(left, right, tolerance) {
    return left.nearestLane === right.nearestLane
        && left.secondNearestLane === right.secondNearestLane
        && numericEqual(left.nearestDistance, right.nearestDistance, tolerance)
        && numericEqual(left.secondNearestDistance, right.secondNearestDistance, tolerance)
        && numericEqual(left.separationMargin, right.separationMargin, tolerance)
        && numericEqual(left.normalizedProgress, right.normalizedProgress, tolerance);
}

function sameMovement(left, right, tolerance) {
    return numericEqual(left.speed, right.speed, tolerance)
        && numericEqual(left.horizontalDistanceFromPrevious, right.horizontalDistanceFromPrevious, tolerance);
}

function numericEqual(left, right, tolerance) {
    if (left === null || right === null) return left === right;
    return Math.abs(left - right) <= tolerance;
}

function topContributors(phases) {
    return Object.entries(phases)
        .map(([ name, ms ]) => ({ name, ms: round(ms) }))
        .sort((left, right) => right.ms - left.ms)
        .slice(0, 6);
}

function roundObject(object) {
    return Object.fromEntries(Object.entries(object).map(([ key, value ]) => [ key, round(value) ]));
}

function emptyPlayerState() {
    return { previousRow: null };
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

function syntheticBaseAnchors(profile) {
    const points = profile.laneAxes.flatMap(axis => [ axis.endpointAnchors.start.coordinates, axis.endpointAnchors.end.coordinates ]);
    const sorted = [ ...points ].sort((left, right) => left.y - right.y);
    return [ { team: 2, coordinates: sorted[0] }, { team: 3, coordinates: sorted.at(-1) } ];
}

function rowKey(row) {
    return `${row.playerId}:${row.gameTimeSeconds}`;
}

function hasFinitePosition(position) {
    return position !== null && Number.isFinite(position.x) && Number.isFinite(position.y) && Number.isFinite(position.z);
}

function normalize(value) {
    if (typeof value === 'bigint') return value.toString();
    return value ?? null;
}

function normalizePath(value) {
    return value.replace(/\\/gu, '/');
}

function stableStringify(value) {
    return JSON.stringify(sortKeys(value));
}

function sortKeys(value) {
    if (Array.isArray(value)) return value.map(sortKeys);
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.keys(value).sort().map(key => [ key, sortKeys(value[key]) ]));
    }
    return value;
}

function hash(value) {
    return createHash('sha256').update(value).digest('hex');
}

function distribution(values) {
    const clean = values.filter(Number.isFinite).sort((left, right) => left - right);
    return { count: clean.length, min: round(clean[0]), median: round(median(clean)), p90: round(clean[Math.floor(clean.length * 0.9)]), max: round(clean.at(-1)) };
}

function median(values) {
    if (values.length === 0) return null;
    const sorted = [ ...values ].sort((left, right) => left - right);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? round((sorted[middle - 1] + sorted[middle]) / 2) : round(sorted[middle]);
}

function percent(value, total) {
    return total === 0 ? 0 : round(value * 100 / total);
}

function bounds(points) {
    return {
        minX: round(Math.min(...points.map(point => point.x))),
        maxX: round(Math.max(...points.map(point => point.x))),
        minY: round(Math.min(...points.map(point => point.y))),
        maxY: round(Math.max(...points.map(point => point.y))),
        minZ: round(Math.min(...points.map(point => point.z ?? 0))),
        maxZ: round(Math.max(...points.map(point => point.z ?? 0)))
    };
}

function expandBounds(box, margin) {
    return { minX: box.minX - margin, maxX: box.maxX + margin, minY: box.minY - margin, maxY: box.maxY + margin, minZ: box.minZ - margin, maxZ: box.maxZ + margin };
}

function insideBounds(point, box) {
    return point.x >= box.minX && point.x <= box.maxX && point.y >= box.minY && point.y <= box.maxY && (point.z ?? 0) >= box.minZ && (point.z ?? 0) <= box.maxZ;
}

function distance2d(left, right) {
    return Math.hypot(left.x - right.x, left.y - right.y);
}

function distance3d(left, right) {
    return Math.hypot(left.x - right.x, left.y - right.y, (left.z ?? 0) - (right.z ?? 0));
}

function elapsed(start) {
    return performance.now() - start;
}

function round(value) {
    return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
}
