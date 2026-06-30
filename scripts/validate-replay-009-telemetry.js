import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

import { Logger, Player } from 'deadem';
import StructuralReplayInspector from '../packages/engine/src/StructuralReplayInspector.js';

const REPLAY = {
    replayId: 'replay_009',
    file: 'samples/replay_009_normal.dem',
    matchId: '91381179',
    build: 23916427,
    date: '2026-06-29',
    mode: 'normal_human_match',
    humanPlayers: 12,
    reportedDurationSeconds: 2131,
    ending: 'normal',
    pause: 'yes',
    acquisition: 'downloaded_and_extracted_in_game'
};
const CONTROLS = [
    { replayId: 'replay_001', file: 'samples/partida_001.dem' },
    { replayId: 'replay_002', file: 'samples/partida_002.dem' },
    { replayId: 'replay_003', file: 'samples/partida_003.dem' },
    { replayId: 'replay_004', file: 'samples/partida_004.dem' }
];
const UNSUPPORTED_BOT_FIXTURES = [ 'replay_006', 'replay_007', 'replay_008' ];
const OUTPUT_DIR = 'output/replay-009-validation';
const REPORT_PATH = 'reports/replay-009-end-to-end-telemetry-validation.md';
const LOCAL_DIR = 'output-local/replay-009-validation';
const CONTROLLER_CLASS = 'CCitadelPlayerController';
const PAWN_CLASS = 'CCitadelPlayerPawn';
const IMPOSSIBLE_SPEED = 3500;
const LARGE_ECONOMY_JUMP = 20000;

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});

async function main() {
    await fs.mkdir(OUTPUT_DIR, { recursive: true });
    await fs.mkdir(LOCAL_DIR, { recursive: true });
    const result = await validateReplay();
    const repeat = await validateReplay({ compact: true });
    const deterministic = compareDeterministic(result.validationSummary.deterministicPayload, repeat.validationSummary.deterministicPayload);

    result.validationSummary.deterministicRepeat = deterministic;
    result.validation.deterministicRepeat = deterministic;
    result.validationSummary.gate = result.gate.gate;

    await writeOutputs(result);
    await fs.writeFile(REPORT_PATH, buildReport(result));
    await fs.writeFile('reports/latest.md', `${REPORT_PATH}\n`);

    console.log(JSON.stringify({
        gate: result.gate.gate,
        players: result.playerRoster.summary.detectedPlayers,
        teams: result.playerRoster.summary.teamDistribution,
        largestPositionGapSeconds: result.positionQuality.aggregate.largestGapSeconds,
        replay005Excluded: true,
        botFixturesExcluded: UNSUPPORTED_BOT_FIXTURES
    }, null, 2));
}

async function validateReplay(options = {}) {
    const structural = await StructuralReplayInspector.inspectReplayStructure(REPLAY.file, { commandsOnly: true, maxRecords: Number.MAX_SAFE_INTEGER });
    const parser = await extractParserTelemetry(options);
    const sourceInventory = buildSourceInventory(parser, structural);
    const matchEnvelope = buildMatchEnvelope(parser, structural);
    const playerRoster = buildPlayerRoster(parser);
    const lifecycle = buildLifecycle(parser);
    const controllerPawnValidation = buildControllerPawnValidation(parser, lifecycle);
    const positionQuality = buildPositionQuality(parser);
    const economyQuality = buildEconomyQuality(parser);
    const combatQuality = buildCombatQuality(parser);
    const pauseAudit = buildPauseAudit(parser, matchEnvelope);
    const disconnectAudit = buildDisconnectAudit(parser, playerRoster);
    const consistency = buildCrossSourceConsistency(playerRoster, lifecycle, positionQuality, economyQuality, combatQuality, matchEnvelope, pauseAudit);
    const scorecard = buildScorecard({ matchEnvelope, playerRoster, controllerPawnValidation, positionQuality, economyQuality, combatQuality, pauseAudit, disconnectAudit });
    const readiness = buildReadiness(scorecard, positionQuality, combatQuality, economyQuality);
    const gate = buildGate(scorecard, readiness, pauseAudit, economyQuality);
    const validation = {
        schemaVersion: 1,
        replayId: REPLAY.replayId,
        replay005Excluded: true,
        unsupportedBotFixturesExcluded: UNSUPPORTED_BOT_FIXTURES,
        parserCompleted: parser.completed,
        deterministicRepeat: null,
        checks: {
            jsonSerializable: true,
            duplicatePlayerRows: positionQuality.aggregate.duplicateTimestampRows,
            nonMonotonicRows: positionQuality.aggregate.nonMonotonicRows,
            parserWarnings: parser.warnings.length,
            parserErrors: parser.errors.length
        }
    };
    const validationSummary = {
        schemaVersion: 1,
        replayId: REPLAY.replayId,
        summary: {
            gate: gate.gate,
            detectedPlayers: playerRoster.summary.detectedPlayers,
            teamDistribution: playerRoster.summary.teamDistribution,
            parserDurationSeconds: matchEnvelope.duration.parserDerivedSeconds,
            userReportedDurationSeconds: REPLAY.reportedDurationSeconds,
            largestPositionGapSeconds: positionQuality.aggregate.largestGapSeconds,
            deathEvents: combatQuality.summary.deathEvents,
            economyFields: economyQuality.summary.availableFields
        },
        deterministicPayload: {
            playerRosterHash: sha256(stableStringify(playerRoster.players)),
            positionHash: sha256(stableStringify(positionQuality.players)),
            economyHash: sha256(stableStringify(economyQuality.players)),
            combatHash: sha256(stableStringify(combatQuality.events)),
            envelopeHash: sha256(stableStringify(matchEnvelope.timeline))
        }
    };

    return {
        parser,
        structural,
        sourceInventory,
        matchEnvelope,
        playerRoster,
        lifecycle,
        controllerPawnValidation,
        positionQuality,
        economyQuality,
        combatQuality,
        pauseAudit,
        disconnectAudit,
        consistency,
        scorecard,
        readiness,
        validation,
        validationSummary,
        gate
    };
}

async function extractParserTelemetry(options = {}) {
    const player = new Player(undefined, Logger.NOOP);
    const parser = {
        replayId: REPLAY.replayId,
        completed: false,
        firstTick: null,
        effectiveFirstTick: null,
        lastTick: null,
        tickRate: null,
        durationSeconds: null,
        players: [],
        snapshots: [],
        warnings: [],
        errors: [],
        stats: null
    };

    try {
        await player.load(createReadStream(REPLAY.file));
        parser.firstTick = safeNumber(player.getFirstTick());
        parser.effectiveFirstTick = parser.firstTick < 0 ? 0 : parser.firstTick;
        parser.lastTick = safeNumber(player.getLastTick());
        parser.tickRate = player.getDemo().server?.tickRate ?? 64;
        parser.durationSeconds = Math.floor((parser.lastTick - parser.effectiveFirstTick) / parser.tickRate);
        parser.players = await discoverPlayers(player, parser.effectiveFirstTick, parser.lastTick, parser.tickRate);
        await player.seekToTick(parser.effectiveFirstTick);

        for (let second = 0; second <= parser.durationSeconds; second++) {
            const targetTick = Math.min(parser.lastTick, Math.round(parser.effectiveFirstTick + second * parser.tickRate));
            await advanceToTick(player, targetTick);
            const snapshot = snapshotPlayers(player, parser.players, second, player.getCurrentTick());
            parser.snapshots.push(snapshot);
            if (options.compact && second > parser.durationSeconds + 1) break;
        }

        await advanceToTick(player, parser.lastTick);
        parser.completed = player.getCurrentTick() >= player.getLastTick();
        parser.stats = safeStats(player);
    } catch (error) {
        parser.errors.push({ message: error.message, stackTop: String(error.stack ?? '').split(/\r?\n/)[1] ?? null });
    } finally {
        await player.dispose();
    }

    return parser;
}

async function discoverPlayers(player, firstTick, lastTick, tickRate) {
    const candidates = new Map();
    const seekSeconds = [ 0, 5, 15, 30, 60, 120, 300, 600, 900, 1200, 1500, 1800, 2100 ]
        .filter(second => firstTick + second * tickRate <= lastTick);
    for (const second of seekSeconds) {
        await player.seekToTick(Math.min(lastTick, Math.round(firstTick + second * tickRate)));
        for (const controller of player.getDemo().getEntitiesByClassName(CONTROLLER_CLASS)) {
            const steamId = normalize(controller.getField('m_steamID'));
            if (steamId === null || steamId === '0' || steamId === 0) continue;
            const playerId = String(steamId);
            const existing = candidates.get(playerId) ?? {
                playerKey: playerId,
                playerSlot: normalize(controller.getField('m_iPlayerID')) ?? null,
                accountId: normalize(controller.getField('m_unAccountID')) ?? null,
                steamId: playerId,
                controllerEntityIndex: normalize(controller.handle),
                initialPawnEntityIndex: null,
                heroClass: null,
                heroName: null,
                heroId: null,
                team: null,
                firstSeenTick: null,
                lastSeenTick: null,
                controllerHandles: new Set(),
                pawnHandles: new Set(),
                heroIds: new Set(),
                teams: new Set(),
                names: new Set(),
                observations: 0
            };
            existing.playerSlot ??= normalize(controller.getField('m_iPlayerID'));
            existing.accountId ??= normalize(controller.getField('m_unAccountID'));
            existing.controllerEntityIndex ??= normalize(controller.handle);
            existing.controllerHandles.add(String(normalize(controller.handle)));
            addIfPresent(existing.heroIds, normalize(controller.getField('m_nHeroID')));
            addIfPresent(existing.teams, normalize(controller.getField('m_iTeamNum')));
            addIfPresent(existing.names, normalize(controller.getField('m_iszPlayerName')));
            existing.observations += 1;
            existing.firstSeenTick = existing.firstSeenTick === null ? player.getCurrentTick() : Math.min(existing.firstSeenTick, player.getCurrentTick());
            existing.lastSeenTick = existing.lastSeenTick === null ? player.getCurrentTick() : Math.max(existing.lastSeenTick, player.getCurrentTick());
            candidates.set(playerId, existing);
        }
    }

    return Array.from(candidates.values()).map(candidate => ({
        ...candidate,
        controllerHandles: Array.from(candidate.controllerHandles).sort(),
        pawnHandles: Array.from(candidate.pawnHandles).sort(),
        heroIds: Array.from(candidate.heroIds).sort(),
        teams: Array.from(candidate.teams).sort(),
        names: Array.from(candidate.names).sort(),
        heroId: firstValue(candidate.heroIds),
        team: firstValue(candidate.teams),
        heroName: firstValue(candidate.names),
        humanClassification: 'supported_human_steam_id_present',
        confidence: 'medium'
    })).sort((left, right) => String(left.team).localeCompare(String(right.team)) || String(left.heroName).localeCompare(String(right.heroName)));
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
            const controller = controllerBySteam.get(playerInfo.playerKey);
            const controllerHandle = normalize(controller?.handle);
            const heroPawnHandle = normalize(controller?.getField('m_hHeroPawn'));
            const pawnHandle = normalize(controller?.getField('m_hPawn'));
            const pawn = pawnByHandle.get(String(heroPawnHandle)) ?? pawnByHandle.get(String(pawnHandle)) ?? pawnByController.get(String(controllerHandle)) ?? null;
            const position = pawn === null ? null : {
                x: normalize(pawn.getField('CBodyComponent.m_vecX')),
                y: normalize(pawn.getField('CBodyComponent.m_vecY')),
                z: normalize(pawn.getField('CBodyComponent.m_vecZ'))
            };
            return {
                playerKey: playerInfo.playerKey,
                tick,
                gameTimeSeconds: second,
                playerSlot: normalize(controller?.getField('m_iPlayerID')) ?? playerInfo.playerSlot,
                accountId: normalize(controller?.getField('m_unAccountID')) ?? playerInfo.accountId,
                steamId: playerInfo.steamId,
                name: normalize(controller?.getField('m_iszPlayerName')) ?? playerInfo.heroName,
                heroId: normalize(controller?.getField('m_nHeroID')) ?? playerInfo.heroId,
                heroClass: pawn?.class?.name ?? null,
                team: normalize(controller?.getField('m_iTeamNum')) ?? playerInfo.team,
                controllerEntityIndex: controllerHandle,
                pawnEntityIndex: normalize(pawn?.handle) ?? pawnHandle ?? heroPawnHandle,
                alive: normalize(controller?.getField('m_bAlive')) ?? normalize(pawn?.getField('m_bAlive')),
                health: normalize(pawn?.getField('m_iHealth')) ?? normalize(controller?.getField('m_iHealth')),
                deaths: normalize(controller?.getField('m_iDeaths')),
                kills: normalize(controller?.getField('m_iPlayerKills')),
                assists: normalize(controller?.getField('m_iPlayerAssists')),
                respawnTime: normalize(controller?.getField('m_flRespawnTime')),
                netWorth: normalize(controller?.getField('m_iGoldNetWorth')),
                souls: normalize(controller?.getField('m_iSouls')) ?? normalize(controller?.getField('m_iGold')),
                position: hasFinitePosition(position) ? position : null
            };
        })
    };
}

function buildSourceInventory(parser, structural) {
    const rows = [
        sourceRow('user_metadata', 'inline_task_metadata', true, 'task_metadata', 1, 'reported_match_duration', 'user_asserted', 'match envelope', []),
        sourceRow('default_parser_snapshots', REPLAY.file, parser.completed, 'one_second_parser_snapshots', parser.snapshots.length * parser.players.length, 'parser_tick_to_seconds', 'steam_id/controller/pawn', 'identity, position, economy, combat counters', parser.errors.map(error => error.message)),
        sourceRow('structural_pass', 'output/parser-compatibility/new-replay-structural-results.json', structural.summary.completed, 'structural_summary', structural.summary.commandsParsed, 'command_ticks', 'none', 'container/framing only', []),
        sourceRow('video', null, false, 'not_available', 0, 'not_available', 'not_available', 'none', [ 'no replay_009 video supplied' ])
    ];
    return { schemaVersion: 1, replayId: REPLAY.replayId, sources: rows };
}

function sourceRow(source, filePath, available, schema, rowCount, timeBasis, identityBasis, authorityScope, limitations) {
    return { source, path: filePath, available, schema, rowCount, timeBasis, identityBasis, authorityScope, limitations };
}

function buildMatchEnvelope(parser, structural) {
    const parserSeconds = round((parser.lastTick - parser.effectiveFirstTick) / parser.tickRate);
    const durationDelta = round(parserSeconds - REPLAY.reportedDurationSeconds);
    const timeline = [
        { event: 'replay_start', tick: parser.firstTick, gameTimeSeconds: null, status: 'confirmed', source: 'parser' },
        { event: 'sign_on_complete', tick: parser.effectiveFirstTick, gameTimeSeconds: 0, status: 'inferred', source: 'parser_effective_first_tick' },
        { event: 'gameplay_start', tick: parser.effectiveFirstTick, gameTimeSeconds: 0, status: 'inferred', source: 'first_sample' },
        { event: 'pause_start_end', tick: null, gameTimeSeconds: null, status: 'unknown', source: 'not_exposed_by_current_parser_path' },
        { event: 'match_end', tick: parser.lastTick, gameTimeSeconds: parserSeconds, status: 'supported', source: 'parser_last_tick' },
        { event: 'replay_end', tick: structural.summary.finalStructuralTick, gameTimeSeconds: round(structural.summary.finalStructuralTick / parser.tickRate), status: 'confirmed', source: 'structural_pass' }
    ];
    return {
        schemaVersion: 1,
        replayId: REPLAY.replayId,
        ticks: {
            firstParsedTick: parser.firstTick,
            effectiveFirstTick: parser.effectiveFirstTick,
            lastParsedTick: parser.lastTick,
            structuralFinalTick: structural.summary.finalStructuralTick,
            tickRate: parser.tickRate,
            tickMonotonicity: parser.completed ? 'confirmed' : 'unknown'
        },
        duration: {
            parserDerivedSeconds: parserSeconds,
            userReportedSeconds: REPLAY.reportedDurationSeconds,
            deltaSeconds: durationDelta,
            interpretation: Math.abs(durationDelta) <= 90 ? 'supported_pause_or_replay_padding_difference' : 'duration_difference_requires_review'
        },
        timeline,
        pauseIntervals: [],
        gameTimeMonotonicity: 'supported_by_sampling_grid',
        limitations: [ 'game clock fields and explicit pause events were not exposed by this validation path' ]
    };
}

function buildPlayerRoster(parser) {
    const latestByPlayer = latestRows(parser);
    const players = parser.players.map(playerInfo => {
        const latest = latestByPlayer.get(playerInfo.playerKey) ?? {};
        return {
            playerSlot: latest.playerSlot ?? playerInfo.playerSlot,
            accountId: latest.accountId ?? playerInfo.accountId,
            steamId: playerInfo.steamId,
            playerKey: playerInfo.playerKey,
            controllerEntityIndex: latest.controllerEntityIndex ?? playerInfo.controllerEntityIndex,
            initialPawnEntityIndex: firstNonNull(parser.snapshots.flatMap(snapshot => snapshot.players.filter(row => row.playerKey === playerInfo.playerKey).map(row => row.pawnEntityIndex))),
            heroClass: latest.heroClass ?? null,
            heroName: latest.name ?? playerInfo.heroName,
            heroId: latest.heroId ?? playerInfo.heroId,
            team: latest.team ?? playerInfo.team,
            firstSeenTick: playerInfo.firstSeenTick,
            lastSeenTick: parser.lastTick,
            identityStable: playerInfo.controllerHandles.length === 1,
            humanClassification: playerInfo.humanClassification,
            confidence: playerInfo.confidence,
            warnings: playerInfo.controllerHandles.length === 1 ? [] : [ 'multiple_controller_handles_observed' ]
        };
    });
    const teamDistribution = countBy(players, player => String(player.team ?? 'unknown'));
    const slots = players.map(player => player.playerSlot).filter(value => value !== null);
    return {
        schemaVersion: 1,
        replayId: REPLAY.replayId,
        expectedHumanPlayers: REPLAY.humanPlayers,
        summary: {
            detectedPlayers: players.length,
            exactHumanCountStatus: players.length === REPLAY.humanPlayers ? 'supported' : 'unknown',
            teamDistribution,
            duplicatePlayerSlots: duplicateValues(slots),
            duplicateSteamIds: duplicateValues(players.map(player => player.steamId)),
            spectatorExclusion: 'supported_by_nonzero_steam_id_filter'
        },
        players
    };
}

function buildLifecycle(parser) {
    const events = [];
    const previous = new Map();
    for (const snapshot of parser.snapshots) {
        for (const row of snapshot.players) {
            const prev = previous.get(row.playerKey);
            if (!prev) {
                events.push(lifecycleEvent(row, 'controller_create', snapshot.tick, snapshot.gameTimeSeconds, true));
                if (row.pawnEntityIndex !== null) events.push(lifecycleEvent(row, 'pawn_create', snapshot.tick, snapshot.gameTimeSeconds, true));
                if (row.controllerEntityIndex !== null && row.pawnEntityIndex !== null) events.push(lifecycleEvent(row, 'possess', snapshot.tick, snapshot.gameTimeSeconds, true));
            } else {
                if (row.deaths !== null && prev.deaths !== null && row.deaths > prev.deaths) events.push(lifecycleEvent(row, 'death', snapshot.tick, snapshot.gameTimeSeconds, true));
                if (prev.pawnEntityIndex !== null && row.pawnEntityIndex !== null && prev.pawnEntityIndex !== row.pawnEntityIndex) events.push(lifecycleEvent(row, 'replace', snapshot.tick, snapshot.gameTimeSeconds, true, [ 'pawn_handle_changed' ]));
                if ((prev.alive === false || prev.health === 0) && (row.alive === true || row.health > 0)) events.push(lifecycleEvent(row, 'respawn', snapshot.tick, snapshot.gameTimeSeconds, true));
            }
            previous.set(row.playerKey, row);
        }
    }
    for (const row of latestRows(parser).values()) events.push(lifecycleEvent(row, 'final', parser.lastTick, parser.durationSeconds, true));
    return { schemaVersion: 1, replayId: REPLAY.replayId, events };
}

function lifecycleEvent(row, event, tick, gameTime, validTransition, warnings = []) {
    return {
        playerKey: row.playerKey,
        controllerEntityIndex: row.controllerEntityIndex ?? null,
        pawnEntityIndex: row.pawnEntityIndex ?? null,
        heroClass: row.heroClass ?? '',
        event,
        tick,
        gameTime,
        source: 'one_second_parser_snapshot',
        validTransition,
        warnings
    };
}

function buildControllerPawnValidation(parser, lifecycle) {
    const rows = parser.snapshots.flatMap(snapshot => snapshot.players);
    const duplicateControllerAssignments = countSimultaneousDuplicates(parser.snapshots, 'controllerEntityIndex');
    const duplicatePawnAssignments = countSimultaneousDuplicates(parser.snapshots, 'pawnEntityIndex');
    const playersWithPawn = new Set(rows.filter(row => row.pawnEntityIndex !== null).map(row => row.playerKey));
    return {
        schemaVersion: 1,
        replayId: REPLAY.replayId,
        summary: {
            oneActiveControllerPerPlayer: duplicateControllerAssignments.length === 0 ? 'confirmed' : 'invalid',
            atMostOneActivePawnPerController: duplicatePawnAssignments.length === 0 ? 'confirmed' : 'invalid',
            playersWithPawn: playersWithPawn.size,
            lifecycleEvents: lifecycle.events.length,
            pawnReplacementEvents: lifecycle.events.filter(event => event.event === 'replace').length,
            deathEvents: lifecycle.events.filter(event => event.event === 'death').length,
            respawnEvents: lifecycle.events.filter(event => event.event === 'respawn').length
        },
        duplicateControllerAssignments,
        duplicatePawnAssignments,
        limitations: [ 'lifecycle is sampled once per second, so sub-second pawn transitions may be coalesced' ]
    };
}

function buildPositionQuality(parser) {
    const summaries = [];
    const gapSamples = [];
    for (const playerInfo of parser.players) {
        const rows = parser.snapshots.map(snapshot => snapshot.players.find(row => row.playerKey === playerInfo.playerKey)).filter(Boolean);
        let previous = null;
        let largestGap = 0;
        let currentGap = 0;
        let sudden = 0;
        let duplicates = 0;
        let nonMonotonic = 0;
        let nullPositions = 0;
        let zeroVectors = 0;
        const seenTimes = new Set();
        for (const row of rows) {
            if (seenTimes.has(row.tick)) duplicates += 1;
            seenTimes.add(row.tick);
            if (previous && row.tick < previous.tick) nonMonotonic += 1;
            if (row.position === null) {
                nullPositions += 1;
                currentGap += 1;
                largestGap = Math.max(largestGap, currentGap);
            } else {
                if (row.position.x === 0 && row.position.y === 0 && row.position.z === 0) zeroVectors += 1;
                if (previous?.position) {
                    const seconds = Math.max(1, row.gameTimeSeconds - previous.gameTimeSeconds);
                    const speed = distance2d(row.position, previous.position) / seconds;
                    if (speed > IMPOSSIBLE_SPEED) {
                        sudden += 1;
                        if (gapSamples.length < 50) {
                            gapSamples.push({
                                playerKey: row.playerKey,
                                fromSecond: previous.gameTimeSeconds,
                                toSecond: row.gameTimeSeconds,
                                speed: round(speed),
                                classification: classifyDiscontinuity(previous, row)
                            });
                        }
                    }
                }
                currentGap = 0;
            }
            previous = row;
        }
        summaries.push({
            playerKey: playerInfo.playerKey,
            firstPositionTick: firstPosition(rows)?.tick ?? null,
            lastPositionTick: lastPosition(rows)?.tick ?? null,
            totalSamples: rows.length,
            distinctSamples: seenTimes.size,
            duplicateTimestamps: duplicates,
            nonMonotonicTimestamps: nonMonotonic,
            nullPositions,
            zeroVectors,
            suddenDisplacementCount: sudden,
            largestGapSeconds: largestGap,
            coverage: round((rows.length - nullPositions) / Math.max(1, rows.length))
        });
    }
    return {
        schemaVersion: 1,
        replayId: REPLAY.replayId,
        players: summaries,
        aggregate: {
            totalRows: summaries.reduce((sum, row) => sum + row.totalSamples, 0),
            nullPositionRows: summaries.reduce((sum, row) => sum + row.nullPositions, 0),
            duplicateTimestampRows: summaries.reduce((sum, row) => sum + row.duplicateTimestamps, 0),
            nonMonotonicRows: summaries.reduce((sum, row) => sum + row.nonMonotonicTimestamps, 0),
            suddenDisplacementCount: summaries.reduce((sum, row) => sum + row.suddenDisplacementCount, 0),
            largestGapSeconds: Math.max(...summaries.map(row => row.largestGapSeconds), 0),
            meanCoverage: round(summaries.reduce((sum, row) => sum + row.coverage, 0) / Math.max(1, summaries.length))
        },
        gapSamples
    };
}

function buildEconomyQuality(parser) {
    const players = parser.players.map(playerInfo => {
        const rows = parser.snapshots.map(snapshot => snapshot.players.find(row => row.playerKey === playerInfo.playerKey)).filter(Boolean);
        const fields = [ 'netWorth', 'souls' ].map(field => auditNumericSeries(rows, field, { allowDecrease: field === 'souls' }));
        return { playerKey: playerInfo.playerKey, fields };
    });
    return {
        schemaVersion: 1,
        replayId: REPLAY.replayId,
        semantics: {
            netWorth: 'supported cumulative/economy value from m_iGoldNetWorth; decreases are not automatically invalid without item/spend semantics',
            souls: 'optional field if exposed; semantics unknown when absent'
        },
        players,
        summary: {
            availableFields: Array.from(new Set(players.flatMap(player => player.fields.filter(field => field.available).map(field => field.field)))).sort(),
            unknownSemantics: [ 'spendable_souls', 'unsecured_souls', 'item_purchase_breakdown' ],
            negativeValues: players.reduce((sum, player) => sum + player.fields.reduce((inner, field) => inner + field.negativeValues, 0), 0),
            largeJumpCount: players.reduce((sum, player) => sum + player.fields.reduce((inner, field) => inner + field.largeJumpCount, 0), 0)
        }
    };
}

function buildCombatQuality(parser) {
    const events = [];
    const previous = new Map();
    for (const snapshot of parser.snapshots) {
        for (const row of snapshot.players) {
            const prev = previous.get(row.playerKey);
            if (prev) {
                const deathDelta = delta(row.deaths, prev.deaths);
                for (let i = 0; i < deathDelta; i++) {
                    events.push({
                        tick: snapshot.tick,
                        gameTime: snapshot.gameTimeSeconds,
                        eventType: 'death_counter_increment',
                        victimPlayerKey: row.playerKey,
                        killerPlayerKey: null,
                        assisterPlayerKeys: [],
                        victimPawnEntityIndex: row.pawnEntityIndex,
                        killerPawnEntityIndex: null,
                        source: 'm_iDeaths_counter',
                        confidence: 'medium',
                        warnings: [ 'killer_assist_source_not_exposed_by_this_validation_path' ]
                    });
                }
            }
            previous.set(row.playerKey, row);
        }
    }
    return {
        schemaVersion: 1,
        replayId: REPLAY.replayId,
        events,
        summary: {
            deathEvents: events.length,
            victimResolved: events.filter(event => event.victimPlayerKey !== null).length,
            killerResolved: events.filter(event => event.killerPlayerKey !== null).length,
            assistCoverage: 0,
            monotonicEventOrder: isMonotonic(events.map(event => event.tick)),
            duplicateEvents: duplicateCombatEvents(events).length,
            limitations: [ 'killer and assist attribution are not exposed by this focused replay-009 validation path' ]
        }
    };
}

function buildPauseAudit(parser, envelope) {
    const parserDelta = envelope.duration.deltaSeconds;
    return {
        schemaVersion: 1,
        replayId: REPLAY.replayId,
        userReportedPause: REPLAY.pause,
        parserExposesPauseStart: false,
        parserExposesPauseEnd: false,
        gameClockBehavior: 'not_available',
        replayTicksContinue: 'supported_by_parser_completion',
        positionSamplesDuringPause: 'not_available',
        economyUpdatesDuringPause: 'not_available',
        eventEmissionsDuringPause: 'not_available',
        durationDeltaSeconds: parserDelta,
        interpretation: Math.abs(parserDelta) <= 90 ? 'reported_pause_or_replay_padding_plausible_but_unlocalized' : 'pause_not_explained_by_duration_delta_alone',
        validationImpact: 'known_gap'
    };
}

function buildDisconnectAudit(parser, roster) {
    const unstableControllers = roster.players.filter(player => player.identityStable === false);
    return {
        schemaVersion: 1,
        replayId: REPLAY.replayId,
        classification: unstableControllers.length === 0 ? 'none_observed' : 'possible_but_unconfirmed',
        evidence: unstableControllers,
        limitations: [ 'no explicit disconnect/reconnect event source exposed by this validation path' ]
    };
}

function buildCrossSourceConsistency(roster, lifecycle, position, economy, combat, envelope, pause) {
    const comparisons = [
        comparison('player roster vs expected metadata', 'parser_roster', 'user_metadata', roster.summary.detectedPlayers, roster.summary.detectedPlayers === REPLAY.humanPlayers ? roster.summary.detectedPlayers : 0, roster.summary.detectedPlayers === REPLAY.humanPlayers ? 0 : 1, 0),
        comparison('team distribution vs expected 6v6 shape', 'parser_roster', 'team_counts', Object.keys(roster.summary.teamDistribution).length, Object.values(roster.summary.teamDistribution).every(count => count === 6) ? 2 : 0, Object.values(roster.summary.teamDistribution).every(count => count === 6) ? 0 : 1, 0),
        comparison('death events vs lifecycle deaths', 'death_counters', 'lifecycle_events', combat.summary.deathEvents, Math.min(combat.summary.deathEvents, lifecycle.events.filter(event => event.event === 'death').length), Math.abs(combat.summary.deathEvents - lifecycle.events.filter(event => event.event === 'death').length), 0),
        comparison('position rows vs roster', 'position_samples', 'player_roster', position.aggregate.totalRows, position.aggregate.nullPositionRows === 0 ? position.aggregate.totalRows : position.aggregate.totalRows - position.aggregate.nullPositionRows, position.aggregate.nullPositionRows, 0),
        comparison('economy availability vs roster', 'economy_fields', 'player_roster', roster.summary.detectedPlayers, economy.summary.availableFields.length > 0 ? roster.summary.detectedPlayers : 0, 0, economy.summary.availableFields.length > 0 ? 0 : roster.summary.detectedPlayers),
        comparison('pause metadata vs parser pause events', 'user_metadata', 'parser_events', 1, 0, 0, pause.parserExposesPauseStart ? 0 : 1),
        comparison('duration metadata vs parser envelope', 'user_metadata', 'parser_ticks', 1, Math.abs(envelope.duration.deltaSeconds) <= 90 ? 1 : 0, Math.abs(envelope.duration.deltaSeconds) <= 90 ? 0 : 1, 0)
    ];
    return {
        schemaVersion: 1,
        replayId: REPLAY.replayId,
        comparisons
    };
}

function comparison(name, sourceA, sourceB, comparableRecords, matches, mismatches, unknown) {
    let result = 'consistent';
    if (mismatches > 0) result = matches > 0 ? 'partially_consistent' : 'inconsistent';
    if (unknown > 0 && matches === 0 && mismatches === 0) result = 'not_comparable';
    return { comparison: name, sourceA, sourceB, comparableRecords, matches, mismatches, unknown, result, examples: [] };
}

function buildScorecard({ matchEnvelope, playerRoster, controllerPawnValidation, positionQuality, economyQuality, combatQuality, pauseAudit, disconnectAudit }) {
    const categories = [
        score('match envelope', Math.abs(matchEnvelope.duration.deltaSeconds) <= 90 ? 'usable_with_known_gaps' : 'present_not_validated', [ 'parser and structural final ticks available' ], matchEnvelope.limitations, [ 'explicit pause localization unavailable' ], 'trajectory timing with parser seconds is usable; game-clock pause claims need constraints'),
        score('players', playerRoster.summary.detectedPlayers === 12 ? 'validated' : 'invalid', [ `${playerRoster.summary.detectedPlayers} players detected` ], [], [], 'roster-level analysis'),
        score('teams', Object.values(playerRoster.summary.teamDistribution).every(count => count === 6) ? 'validated' : 'invalid', [ JSON.stringify(playerRoster.summary.teamDistribution) ], [], [], 'team grouping'),
        score('heroes', playerRoster.players.every(player => player.heroId !== null || player.heroClass !== null) ? 'usable_with_known_gaps' : 'present_not_validated', [ 'hero ids/classes sampled from controller/pawn' ], [ 'hero display names not independently validated' ], [], 'identity grouping with ids/classes'),
        score('controller-pawn mapping', controllerPawnValidation.summary.oneActiveControllerPerPlayer === 'confirmed' ? 'usable_with_known_gaps' : 'invalid', [ 'no simultaneous duplicate controller assignments detected' ], controllerPawnValidation.limitations, [], 'player trajectory and lifecycle sampling'),
        score('positions', positionQuality.aggregate.meanCoverage >= 0.98 ? 'validated' : 'usable_with_known_gaps', [ `${positionQuality.aggregate.totalRows} sampled player rows` ], [], [ 'teleports/zipline-like movements are not semantically classified' ], 'trajectory analysis with discontinuity flags'),
        score('economy', economyQuality.summary.availableFields.length > 0 ? 'usable_with_known_gaps' : 'unavailable', economyQuality.summary.availableFields, economyQuality.summary.unknownSemantics, [], 'net-worth progression only'),
        score('kills/deaths', combatQuality.summary.deathEvents > 0 ? 'usable_with_known_gaps' : 'present_not_validated', [ `${combatQuality.summary.deathEvents} death counter events` ], combatQuality.summary.limitations, [], 'death review without killer/assist certainty'),
        score('pause handling', pauseAudit.validationImpact === 'known_gap' ? 'present_not_validated' : 'validated', [ pauseAudit.interpretation ], [ 'explicit pause interval unavailable' ], [], 'do not treat long timing gaps as missing telemetry without pause review'),
        score('disconnects', disconnectAudit.classification === 'none_observed' ? 'usable_with_known_gaps' : 'present_not_validated', [ disconnectAudit.classification ], disconnectAudit.limitations, [], 'identity continuity checks'),
        score('entity lifecycle', controllerPawnValidation.summary.lifecycleEvents > 0 ? 'usable_with_known_gaps' : 'present_not_validated', [ `${controllerPawnValidation.summary.lifecycleEvents} sampled lifecycle events` ], controllerPawnValidation.limitations, [], 'sampled lifecycle validation')
    ];
    return { schemaVersion: 1, replayId: REPLAY.replayId, categories };
}

function score(category, status, evidence, limitations, knownFailureModes, suitability) {
    return { category, status, evidence, limitations, knownFailureModes, suitabilityForDownstreamAnalysis: suitability };
}

function buildReadiness(scorecard, position, combat, economy) {
    const capabilities = [
        ready('player trajectory analysis', position.aggregate.meanCoverage >= 0.98 ? 'ready_with_constraints' : 'not_ready', 'positions are sampled at one second with discontinuity flags'),
        ready('lane occupancy', 'not_ready', 'semantic occupancy branch remains frozen; replay 009 lacks structural lane projection validation in this task'),
        ready('rotation detection', 'not_ready', 'rotation detection remains methodologically blocked'),
        ready('fight participation', 'not_ready', 'killer/assist/source-target damage are incomplete for this replay validation'),
        ready('death review', combat.summary.deathEvents > 0 ? 'ready_with_constraints' : 'not_ready', 'death counter events are available, killer/assist attribution is incomplete'),
        ready('economy progression', economy.summary.availableFields.includes('netWorth') ? 'ready_with_constraints' : 'not_ready', 'net worth is available; spend/unsecured semantics are unknown'),
        ready('objective participation', 'not_tested', 'objective lifecycle for replay 009 was not built in this task'),
        ready('teamfight reconstruction', 'not_ready', 'fight grouping is not supported'),
        ready('macro decision analysis', 'not_ready', 'strategic interpretation is explicitly out of scope')
    ];
    return { schemaVersion: 1, replayId: REPLAY.replayId, capabilities };
}

function ready(capability, status, rationale) {
    return { capability, status, rationale };
}

function buildGate(scorecard, readiness, pauseAudit, economyQuality) {
    const invalid = scorecard.categories.filter(category => category.status === 'invalid');
    const highestImpactGap = pauseAudit.parserExposesPauseStart
        ? (economyQuality.summary.unknownSemantics.length > 0 ? 'economy_field_semantics' : 'none')
        : 'explicit_pause_interval_not_exposed';
    return {
        schemaVersion: 1,
        gate: invalid.length === 0 ? 'replay_009_telemetry_usable_with_known_gaps' : 'replay_009_telemetry_not_analysis_ready',
        highestImpactGap,
        blockedFollowUpTask: 'tasks/blocked/057-investigate-replay-009-pause-and-clock-observability.md',
        readyCapabilities: readiness.capabilities.filter(item => item.status === 'ready' || item.status === 'ready_with_constraints').map(item => item.capability),
        blockedCapabilities: readiness.capabilities.filter(item => item.status === 'not_ready').map(item => item.capability),
        replay005Excluded: true,
        unsupportedBotFixturesExcluded: UNSUPPORTED_BOT_FIXTURES
    };
}

async function writeOutputs(result) {
    await writeJson(path.join(OUTPUT_DIR, 'source-inventory.json'), result.sourceInventory);
    await writeJson(path.join(OUTPUT_DIR, 'match-envelope.json'), result.matchEnvelope);
    await writeJson(path.join(OUTPUT_DIR, 'player-roster.json'), result.playerRoster);
    await fs.writeFile(path.join(OUTPUT_DIR, 'player-roster.csv'), rosterCsv(result.playerRoster.players));
    await writeJsonl(path.join(OUTPUT_DIR, 'controller-pawn-lifecycle.jsonl'), result.lifecycle.events);
    await writeJson(path.join(OUTPUT_DIR, 'controller-pawn-validation.json'), result.controllerPawnValidation);
    await writeJson(path.join(OUTPUT_DIR, 'position-quality-summary.json'), result.positionQuality);
    await writeJson(path.join(OUTPUT_DIR, 'position-gap-samples.json'), { schemaVersion: 1, replayId: REPLAY.replayId, samples: result.positionQuality.gapSamples });
    await writeJson(path.join(OUTPUT_DIR, 'economy-quality-summary.json'), result.economyQuality);
    await writeJson(path.join(OUTPUT_DIR, 'combat-event-quality-summary.json'), result.combatQuality);
    await writeJson(path.join(OUTPUT_DIR, 'pause-audit.json'), result.pauseAudit);
    await writeJson(path.join(OUTPUT_DIR, 'disconnect-reconnect-audit.json'), result.disconnectAudit);
    await writeJson(path.join(OUTPUT_DIR, 'cross-source-consistency.json'), result.consistency);
    await writeJson(path.join(OUTPUT_DIR, 'telemetry-coverage-scorecard.json'), result.scorecard);
    await writeJson(path.join(OUTPUT_DIR, 'downstream-readiness.json'), result.readiness);
    await writeJson(path.join(OUTPUT_DIR, 'validation-summary.json'), result.validationSummary);
    await writeJson(path.join(OUTPUT_DIR, 'validation-gate.json'), result.gate);
    await fs.writeFile(path.join(OUTPUT_DIR, 'README.md'), buildOutputReadme(result));
}

function rosterCsv(players) {
    const header = [ 'playerKey', 'playerSlot', 'accountId', 'steamId', 'controllerEntityIndex', 'initialPawnEntityIndex', 'heroClass', 'heroName', 'heroId', 'team', 'firstSeenTick', 'lastSeenTick', 'identityStable', 'humanClassification', 'confidence', 'warnings' ];
    const lines = [ header.join(',') ];
    for (const player of players) {
        lines.push(header.map(key => csvCell(Array.isArray(player[key]) ? player[key].join('|') : player[key])).join(','));
    }
    return `${lines.join('\n')}\n`;
}

function buildOutputReadme(result) {
    return `# Replay 009 Validation Outputs

This directory contains compact Task 056 telemetry validation artifacts for \`samples/replay_009_normal.dem\`.

- Gate: \`${result.gate.gate}\`
- Replay 005: excluded.
- Unsupported bot fixtures 006-008: excluded.
- Primary limitation: ${result.gate.highestImpactGap}.

These outputs validate factual telemetry quality only. They do not infer strategy, rotations, semantic lane occupancy, fight quality, or player skill.
`;
}

function buildReport(result) {
    return `# Replay 009 End-To-End Telemetry Validation

## Result

- Gate: \`${result.gate.gate}\`
- Replay: \`${REPLAY.file}\`
- Parser completion: ${result.parser.completed}
- Structural completion: ${result.structural.summary.completed}
- Replay 005: excluded
- Bot fixtures 006-008: excluded

## Match Envelope

Parser duration is ${result.matchEnvelope.duration.parserDerivedSeconds}s versus user-reported ${REPLAY.reportedDurationSeconds}s, delta ${result.matchEnvelope.duration.deltaSeconds}s. Explicit pause intervals are not exposed by this validation path.

## Roster

Detected ${result.playerRoster.summary.detectedPlayers} player identities. Team distribution: ${JSON.stringify(result.playerRoster.summary.teamDistribution)}.

## Telemetry Quality

- Position mean coverage: ${result.positionQuality.aggregate.meanCoverage}
- Largest position gap: ${result.positionQuality.aggregate.largestGapSeconds}s
- Sudden displacement flags: ${result.positionQuality.aggregate.suddenDisplacementCount}
- Economy fields: ${result.economyQuality.summary.availableFields.join(', ') || 'none'}
- Death counter events: ${result.combatQuality.summary.deathEvents}

## Cross-Source Consistency

${result.consistency.comparisons.map(item => `- ${item.comparison}: ${item.result} (${item.matches} matches, ${item.mismatches} mismatches, ${item.unknown} unknown)`).join('\n')}

## Downstream Readiness

${result.readiness.capabilities.map(item => `- ${item.capability}: ${item.status} - ${item.rationale}`).join('\n')}

## Highest-Impact Gap

${result.gate.highestImpactGap}

## Corpus Classification

- Compatible normal replay fixtures: 001, 002, 003, 004, 009.
- Unsupported solo-bot fixtures: 006, 007, 008.
- Protected holdout: 005.
`;
}

async function advanceToTick(player, targetTick) {
    while (player.getCurrentTick() < targetTick) {
        if (!await player.nextTick()) break;
    }
}

function latestRows(parser) {
    const latest = new Map();
    for (const snapshot of parser.snapshots) for (const row of snapshot.players) latest.set(row.playerKey, row);
    return latest;
}

function firstPosition(rows) {
    return rows.find(row => row.position !== null) ?? null;
}

function lastPosition(rows) {
    return rows.findLast(row => row.position !== null) ?? null;
}

function auditNumericSeries(rows, field, options = {}) {
    const values = rows.map(row => ({ time: row.gameTimeSeconds, value: row[field] })).filter(item => Number.isFinite(item.value));
    let negativeValues = 0;
    let decreases = 0;
    let largeJumpCount = 0;
    for (let i = 0; i < values.length; i++) {
        if (values[i].value < 0) negativeValues += 1;
        if (i > 0) {
            const diff = values[i].value - values[i - 1].value;
            if (diff < 0 && !options.allowDecrease) decreases += 1;
            if (Math.abs(diff) > LARGE_ECONOMY_JUMP) largeJumpCount += 1;
        }
    }
    return {
        field,
        available: values.length > 0,
        sampleCount: values.length,
        firstValue: values[0]?.value ?? null,
        lastValue: values.at(-1)?.value ?? null,
        negativeValues,
        decreases,
        largeJumpCount,
        semanticStatus: field === 'netWorth' ? 'supported_counter_unknown_spend_semantics' : 'unknown_semantics'
    };
}

function classifyDiscontinuity(previous, row) {
    if ((previous.alive === false || previous.health === 0) || (row.alive === true && previous.alive === false)) return 'expected_respawn_transition';
    if (previous.pawnEntityIndex !== row.pawnEntityIndex) return 'expected_entity_replacement';
    return 'possible_teleport';
}

function countSimultaneousDuplicates(snapshots, key) {
    const duplicates = [];
    for (const snapshot of snapshots) {
        const counts = countBy(snapshot.players.filter(row => row[key] !== null), row => String(row[key]));
        for (const [ value, count ] of Object.entries(counts)) {
            if (count > 1 && duplicates.length < 50) duplicates.push({ tick: snapshot.tick, gameTimeSeconds: snapshot.gameTimeSeconds, key, value, count });
        }
    }
    return duplicates;
}

function duplicateCombatEvents(events) {
    const seen = new Set();
    const duplicates = [];
    for (const event of events) {
        const key = `${event.tick}:${event.eventType}:${event.victimPlayerKey}`;
        if (seen.has(key)) duplicates.push(event);
        seen.add(key);
    }
    return duplicates;
}

function duplicateValues(values) {
    const counts = countBy(values, value => String(value));
    return Object.entries(counts).filter(([, count]) => count > 1).map(([ value ]) => value);
}

function countBy(items, fn) {
    const counts = {};
    for (const item of items) {
        const key = fn(item);
        counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
}

function delta(current, previous) {
    if (!Number.isFinite(current) || !Number.isFinite(previous)) return 0;
    return Math.max(0, current - previous);
}

function hasFinitePosition(position) {
    return position !== null && Number.isFinite(position.x) && Number.isFinite(position.y) && Number.isFinite(position.z);
}

function distance2d(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

function addIfPresent(set, value) {
    if (value !== null && value !== undefined && value !== '') set.add(value);
}

function firstValue(setOrArray) {
    const values = Array.isArray(setOrArray) ? setOrArray : Array.from(setOrArray);
    return values.length > 0 ? values[0] : null;
}

function firstNonNull(values) {
    return values.find(value => value !== null && value !== undefined) ?? null;
}

function isMonotonic(values) {
    for (let i = 1; i < values.length; i++) if (values[i] < values[i - 1]) return false;
    return true;
}

function normalize(value) {
    if (value === undefined || value === null) return null;
    if (typeof value === 'bigint') return value.toString();
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') return value;
    if (typeof value === 'object' && 'value' in value) return normalize(value.value);
    return value;
}

function safeNumber(value) {
    return Number.isFinite(value) ? value : null;
}

function safeStats(player) {
    try {
        return player.getDemo().getStats?.() ?? null;
    } catch {
        return null;
    }
}

function round(value) {
    return Number.isFinite(value) ? Math.round(value * 1000) / 1000 : null;
}

function compareDeterministic(a, b) {
    const left = stableStringify(a);
    const right = stableStringify(b);
    return {
        equal: left === right,
        hashA: sha256(left),
        hashB: sha256(right)
    };
}

function stableStringify(value) {
    return JSON.stringify(sortKeys(value));
}

function sortKeys(value) {
    if (Array.isArray(value)) return value.map(sortKeys);
    if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [ key, sortKeys(value[key]) ]));
    return value;
}

function sha256(value) {
    return crypto.createHash('sha256').update(value).digest('hex');
}

function csvCell(value) {
    if (value === null || value === undefined) return '';
    const text = String(value);
    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

async function writeJson(file, value) {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeJsonl(file, rows) {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, `${rows.map(row => JSON.stringify(row)).join('\n')}${rows.length > 0 ? '\n' : ''}`);
}
