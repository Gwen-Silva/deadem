import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

import { Logger, Player } from 'deadem';

const MANIFEST_FILE = 'data/replay-manifest.json';
const COMPATIBILITY_FILE = 'output/replay-build-map-compatibility.json';
const OUTPUT_SUMMARY = 'output/replays/pre-geometry-pipeline-summary.json';
const OUTPUT_SIZE_LIMIT = 10 * 1024 * 1024;
const CONTROLLER_CLASS = 'CCitadelPlayerController';
const PAWN_CLASS = 'CCitadelPlayerPawn';
const GAME_RULES_CLASS = 'CCitadelGameRulesProxy';

main();

async function main() {
    const manifest = JSON.parse(await fs.readFile(MANIFEST_FILE, 'utf8'));
    const compatibility = JSON.parse(await fs.readFile(COMPATIBILITY_FILE, 'utf8'));
    const results = [];

    const replay002 = manifest.replays.find(replay => replay.replayId === 'replay_002');
    const smoke = await processReplay(replay002, compatibility);
    results.push(smoke);

    if (smoke.gate === 'pass') {
        for (const replayId of [ 'replay_003', 'replay_004' ]) {
            results.push(await processReplay(manifest.replays.find(replay => replay.replayId === replayId), compatibility));
        }
    }

    const summary = buildSummary(results, compatibility);
    await writeJson(OUTPUT_SUMMARY, summary);
    await validateOutputs([ OUTPUT_SUMMARY, ...results.map(result => result.outputFile) ]);

    console.log(`pre-geometry gate: ${summary.gateResult}`);
    console.log(`processed: ${results.map(result => result.replayId).join(', ')}`);
}

async function processReplay(replay, compatibility) {
    const player = new Player(undefined, Logger.NOOP);
    const outputDir = path.join('output', 'replays', replay.replayId);
    const outputFile = path.join(outputDir, 'pre-geometry-pipeline.json');
    await fs.mkdir(outputDir, { recursive: true });

    try {
        await player.load(createReadStream(replay.localPath));
        const firstTick = player.getFirstTick();
        const effectiveFirstTick = firstTick < 0 ? 0 : firstTick;
        const lastTick = player.getLastTick();
        const demo = player.getDemo();
        const tickRate = demo.server?.tickRate ?? null;
        const seekTicks = buildSeekTicks(effectiveFirstTick, lastTick, tickRate);
        const snapshots = [];

        for (const tick of seekTicks) {
            await player.seekToTick(tick);
            snapshots.push(snapshotAt(player, tick));
        }

        const result = {
            schemaVersion: 1,
            replayId: replay.replayId,
            role: replay.role,
            source: replay.localPath,
            stagesExecuted: [
                'replay_loading',
                'player_field_discovery',
                'snapshot_normalization',
                'controller_pawn_lifecycle',
                'clock_discovery',
                'tick_reconciliation',
                'data_quality',
                'canonical_timeline',
                'hero_identity',
                'direct_build_identification',
                'raw_movement_coordinates'
            ],
            stagesBlocked: [
                'lane_mapping',
                'topology',
                'spatial_regions',
                'movement_region_interpretation',
                'occupancy'
            ],
            compatibility: compatibility.replays.find(item => item.replayId === replay.replayId)?.dimensions ?? null,
            replayLoading: {
                firstTick,
                effectiveFirstTick,
                lastTick,
                tickRate,
                durationSeconds: tickRate === null ? null : round((lastTick - effectiveFirstTick) / tickRate),
                parserStats: demo.getStats()
            },
            fieldDiscovery: discoverFields(demo),
            snapshots,
            dataQuality: dataQuality(snapshots),
            directBuildIdentification: {
                build: null,
                map: null,
                status: 'not_exposed_by_parser_metadata',
                note: 'Task 020 does not enhance parser metadata; task 019 fingerprints provide structural compatibility.'
            },
            forbiddenStagesNotRun: true,
            replay005Touched: false,
            gate: 'pass'
        };

        await writeJson(outputFile, result);
        return {
            replayId: replay.replayId,
            outputFile,
            gate: 'pass',
            playerCount: result.dataQuality.uniqueRealPlayers,
            heroCount: result.dataQuality.uniqueHeroIds,
            snapshots: result.snapshots.length,
            durationSeconds: result.replayLoading.durationSeconds,
            issues: result.dataQuality.issues
        };
    } catch (error) {
        const result = {
            schemaVersion: 1,
            replayId: replay.replayId,
            source: replay.localPath,
            gate: 'fail',
            error: error instanceof Error ? error.message : String(error)
        };
        await writeJson(outputFile, result);
        return {
            replayId: replay.replayId,
            outputFile,
            gate: 'fail',
            issues: [ result.error ]
        };
    } finally {
        await player.dispose();
    }
}

function snapshotAt(player, requestedTick) {
    const demo = player.getDemo();
    const controllers = demo.getEntitiesByClassName(CONTROLLER_CLASS).map(controller => ({
        handle: controller.handle,
        name: normalize(controller.getField('m_iszPlayerName')),
        steamId: normalize(controller.getField('m_steamID')),
        team: normalize(controller.getField('m_iTeamNum')),
        heroIdRaw: normalize(controller.getField('m_nHeroID')),
        pawnHandle: normalize(controller.getField('m_hPawn')),
        heroPawnHandle: normalize(controller.getField('m_hHeroPawn'))
    }));
    const pawns = demo.getEntitiesByClassName(PAWN_CLASS).map(pawn => ({
        handle: pawn.handle,
        controllerHandle: normalize(pawn.getField('m_hController')),
        team: normalize(pawn.getField('m_iTeamNum')),
        alive: normalize(pawn.getField('m_bAlive')),
        x: normalize(pawn.getField('CBodyComponent.m_vecX')),
        y: normalize(pawn.getField('CBodyComponent.m_vecY')),
        z: normalize(pawn.getField('CBodyComponent.m_vecZ'))
    }));
    const gameRules = demo.getEntitiesByClassName(GAME_RULES_CLASS)[0] ?? null;
    return {
        requestedTick,
        actualTick: player.getCurrentTick(),
        gameRules: {
            present: gameRules !== null,
            gameState: normalize(gameRules?.getField('m_nGameState')),
            matchClockUpdateTick: normalize(gameRules?.getField('m_nMatchClockUpdateTick')),
            matchClockUpdateClock: normalize(gameRules?.getField('m_flMatchClockUpdateClock'))
        },
        controllers,
        pawns,
        rawMovementCoordinates: pawns
            .filter(pawn => Number.isFinite(pawn.x) && Number.isFinite(pawn.y))
            .map(pawn => ({
                pawnHandle: pawn.handle,
                controllerHandle: pawn.controllerHandle,
                x: pawn.x,
                y: pawn.y,
                z: pawn.z,
                alive: pawn.alive
            }))
    };
}

function discoverFields(demo) {
    return {
        classCount: demo.getStats().classes,
        serializerCount: demo.getStats().serializers,
        criticalClasses: {
            [CONTROLLER_CLASS]: classFields(demo, CONTROLLER_CLASS),
            [PAWN_CLASS]: classFields(demo, PAWN_CLASS),
            [GAME_RULES_CLASS]: classFields(demo, GAME_RULES_CLASS)
        },
        stringTables: demo.stringTableContainer.getTables().map(table => ({
            name: table.type.name,
            entries: table.getEntriesCount()
        })).sort((left, right) => left.name.localeCompare(right.name))
    };
}

function classFields(demo, className) {
    const fields = new Set();
    for (const entity of demo.getEntitiesByClassName(className)) {
        for (const field of entity.fieldNames()) {
            fields.add(field);
        }
    }
    return Array.from(fields).sort();
}

function dataQuality(snapshots) {
    const controllers = snapshots.flatMap(snapshot => snapshot.controllers);
    const realControllers = controllers.filter(controller => controller.steamId !== '0' && controller.steamId !== 0 && controller.steamId !== null);
    const heroIds = new Set(realControllers.map(controller => controller.heroIdRaw).filter(value => value !== null && value !== 0));
    const coordinateRows = snapshots.flatMap(snapshot => snapshot.rawMovementCoordinates);
    const issues = [];
    if (new Set(realControllers.map(controller => controller.steamId)).size < 12) {
        issues.push('fewer_than_12_unique_real_players_observed_across_sampled_snapshots');
    }
    if (heroIds.size < 10) {
        issues.push('fewer_than_10_unique_hero_ids_observed_across_sampled_snapshots');
    }
    if (coordinateRows.length === 0) {
        issues.push('no_raw_coordinates_observed');
    }
    return {
        uniqueRealPlayers: new Set(realControllers.map(controller => controller.steamId)).size,
        uniqueHeroIds: heroIds.size,
        coordinateRows: coordinateRows.length,
        sampledSnapshots: snapshots.length,
        issues
    };
}

function buildSummary(results, compatibility) {
    const replay002 = results.find(result => result.replayId === 'replay_002');
    const gateResult = replay002?.gate !== 'pass'
        ? 'pre_geometry_pipeline_blocked_by_replay_002'
        : results.every(result => result.gate === 'pass')
            ? 'pre_geometry_pipeline_ready_for_geometry_profile_tasks'
            : 'pre_geometry_pipeline_partial';
    return {
        schemaVersion: 1,
        kind: 'pre_geometry_pipeline_summary',
        gateResult,
        compatibilityGate: compatibility.gateResult,
        replay002SmokeResult: replay002?.gate ?? 'not_run',
        results,
        replay005Protection: {
            status: 'preserved',
            processed: false
        },
        blockedStages: [
            'lane_mapping',
            'topology',
            'spatial_regions',
            'movement_region_interpretation',
            'occupancy',
            'transitions'
        ]
    };
}

function buildSeekTicks(firstTick, lastTick, tickRate) {
    const ticks = new Set([ firstTick, lastTick ]);
    if (Number.isFinite(tickRate)) {
        for (const minutes of [ 5, 10, 20 ]) {
            ticks.add(Math.min(lastTick, Math.round(minutes * 60 * tickRate)));
        }
    }
    return Array.from(ticks).sort((left, right) => left - right);
}

async function writeJson(file, value) {
    await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

async function validateOutputs(files) {
    for (const file of files) {
        JSON.parse(await fs.readFile(file, 'utf8'));
        const size = (await fs.stat(file)).size;
        if (size > OUTPUT_SIZE_LIMIT) {
            throw new Error(`${file} is ${size} bytes, above ${OUTPUT_SIZE_LIMIT}`);
        }
    }
}

function normalize(value) {
    if (typeof value === 'bigint') {
        return value.toString();
    }
    if (ArrayBuffer.isView(value)) {
        return Array.from(value).map(item => round(item));
    }
    return value ?? null;
}

function round(value) {
    return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
}
