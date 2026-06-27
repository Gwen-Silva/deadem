import { createReadStream } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { Logger, Player } from 'deadem';

const DEMO_ARGUMENT_PREFIX = '--demo=';
const DEFAULT_DEMO = './samples/partida_001.dem';
const SNAPSHOTS_OUTPUT_FILE = './output/03-normalized-player-snapshots.json';
const LINK_VALIDATION_OUTPUT_FILE = './output/03-link-validation.json';
const CONTROLLER_CLASS = 'CCitadelPlayerController';
const PAWN_CLASS = 'CCitadelPlayerPawn';
const SOURCE_TV_NAME = 'SourceTV';
const INVALID_HANDLE = 16777215;
const REAL_PLAYER_COUNT = 12;
const EXPECTED_CONTROLLER_COUNT = 13;
const EXPECTED_PAWN_COUNT = 12;
const SECONDS_IN_MINUTE = 60;
const DISCOVERY_BLOCK_SECONDS = 30;

const demoPath = resolveDemoPath();
const player = new Player(undefined, Logger.NOOP);

try {
    await player.load(createReadStream(demoPath));
    await player.seekToTick(0);

    const tickRate = player.getDemo().server?.tickRate ?? null;

    if (tickRate === null) {
        throw new Error('Unable to determine replay tick rate from demo.server.tickRate');
    }

    const lastTick = player.getLastTick();
    const firstCompleteStateTick = await findFirstCompleteStateTick(tickRate, lastTick);
    const snapshotPoints = getSnapshotPoints(firstCompleteStateTick, tickRate, lastTick);
    const snapshots = [];
    const linkValidation = {
        fileName: path.basename(demoPath),
        filePath: demoPath,
        firstCompleteStateTick,
        tickRate,
        snapshots: []
    };

    for (const point of snapshotPoints) {
        await player.seekToTick(point.tick);

        const inspection = inspectCurrentTick();

        snapshots.push({
            label: point.label,
            requestedTick: point.tick,
            actualTick: player.getCurrentTick(),
            relativeSeconds: (player.getCurrentTick() - firstCompleteStateTick) / tickRate,
            controllerCount: inspection.controllerCount,
            pawnCount: inspection.pawnCount,
            validControllerPawnLinks: inspection.validLinks.length,
            players: inspection.players
        });

        linkValidation.snapshots.push({
            label: point.label,
            requestedTick: point.tick,
            actualTick: player.getCurrentTick(),
            validLinks: inspection.validLinks,
            controllersWithoutPawn: inspection.controllersWithoutPawn,
            pawnsWithoutController: inspection.pawnsWithoutController,
            divergences: inspection.divergences
        });
    }

    const snapshotResult = {
        fileName: path.basename(demoPath),
        filePath: demoPath,
        firstCompleteStateTick,
        tickRate,
        lastTick,
        snapshotPoints,
        snapshots
    };

    await mkdir(path.dirname(SNAPSHOTS_OUTPUT_FILE), { recursive: true });
    await writeJson(SNAPSHOTS_OUTPUT_FILE, snapshotResult);
    await writeJson(LINK_VALIDATION_OUTPUT_FILE, linkValidation);

    console.log(`First complete state tick: ${firstCompleteStateTick}`);
    console.log(`Tick rate: ${tickRate}`);
    console.log(`Wrote ${SNAPSHOTS_OUTPUT_FILE}`);
    console.log(`Wrote ${LINK_VALIDATION_OUTPUT_FILE}`);
} finally {
    await player.dispose();
}

function resolveDemoPath() {
    const argument = process.argv.find(arg => arg.startsWith(DEMO_ARGUMENT_PREFIX));
    const file = argument ? argument.slice(DEMO_ARGUMENT_PREFIX.length) : DEFAULT_DEMO;

    return path.resolve(process.cwd(), file);
}

async function findFirstCompleteStateTick(tickRate, lastTick) {
    const primary = await findFirstTickByPredicate(
        tickRate,
        lastTick,
        state => state.controllerCount === EXPECTED_CONTROLLER_COUNT && state.pawnCount === EXPECTED_PAWN_COUNT
    );

    if (primary !== null) {
        return primary;
    }

    const fallback = await findFirstTickByPredicate(
        tickRate,
        lastTick,
        state => state.linkableRealPlayerCount >= REAL_PLAYER_COUNT
    );

    if (fallback === null) {
        throw new Error('Unable to find a complete player state in this replay');
    }

    return fallback;
}

async function findFirstTickByPredicate(tickRate, lastTick, predicate) {
    const blockSize = Math.max(1, Math.round(DISCOVERY_BLOCK_SECONDS * tickRate));
    let previousTick = 0;
    let previousState = await inspectTick(previousTick);

    if (predicate(previousState)) {
        return previousTick;
    }

    for (let tick = blockSize; tick <= lastTick; tick += blockSize) {
        const currentTick = Math.min(tick, lastTick);
        const currentState = await inspectTick(currentTick);

        if (predicate(currentState)) {
            return refineFirstMatchingTick(previousTick, currentTick, predicate);
        }

        previousTick = currentTick;
        previousState = currentState;

        if (previousTick === lastTick) {
            break;
        }
    }

    if (predicate(previousState)) {
        return previousTick;
    }

    return null;
}

async function refineFirstMatchingTick(lowTick, highTick, predicate) {
    let low = lowTick;
    let high = highTick;

    while (low + 1 < high) {
        const mid = Math.floor((low + high) / 2);
        const state = await inspectTick(mid);

        if (predicate(state)) {
            high = mid;
        } else {
            low = mid;
        }
    }

    return high;
}

async function inspectTick(tick) {
    await player.seekToTick(tick);

    const inspection = inspectCurrentTick();

    return {
        controllerCount: inspection.controllerCount,
        pawnCount: inspection.pawnCount,
        linkableRealPlayerCount: inspection.players.filter(entry => entry.pawnHandle !== null).length,
        validLinkCount: inspection.validLinks.length
    };
}

function getSnapshotPoints(firstCompleteStateTick, tickRate, lastTick) {
    const points = [
        { label: 'first complete state', tick: firstCompleteStateTick },
        { label: '5 minutes after first complete state', tick: firstCompleteStateTick + minutesToTicks(5, tickRate) },
        { label: '10 minutes after first complete state', tick: firstCompleteStateTick + minutesToTicks(10, tickRate) },
        { label: '20 minutes after first complete state', tick: firstCompleteStateTick + minutesToTicks(20, tickRate) },
        { label: 'last tick', tick: lastTick }
    ];

    return points.map(point => ({
        ...point,
        tick: Math.min(point.tick, lastTick),
        relativeSeconds: (Math.min(point.tick, lastTick) - firstCompleteStateTick) / tickRate
    }));
}

function minutesToTicks(minutes, tickRate) {
    return Math.round(minutes * SECONDS_IN_MINUTE * tickRate);
}

function inspectCurrentTick() {
    const demo = player.getDemo();
    const controllers = demo.getEntitiesByClassName(CONTROLLER_CLASS);
    const pawns = demo.getEntitiesByClassName(PAWN_CLASS);
    const pawnByHandle = new Map(pawns.map(pawn => [ pawn.handle, pawn ]));
    const realControllers = controllers.filter(isRealController);
    const usedPawnHandles = new Set();
    const players = [];
    const validLinks = [];
    const controllersWithoutPawn = [];
    const divergences = [];

    for (const controller of realControllers) {
        const link = findPawnForController(controller, pawnByHandle);
        const playerSnapshot = buildPlayerSnapshot(controller, link.pawn);

        players.push(playerSnapshot);

        if (link.pawn === null) {
            controllersWithoutPawn.push(buildControllerLinkRecord(controller, link));

            continue;
        }

        usedPawnHandles.add(link.pawn.handle);

        if (link.inverseMatches) {
            validLinks.push(buildLinkRecord(controller, link));
        } else {
            divergences.push(buildLinkRecord(controller, link));
        }
    }

    const pawnsWithoutController = pawns
        .filter(pawn => !usedPawnHandles.has(pawn.handle))
        .map(pawn => ({
            pawnIndex: pawn.index,
            pawnHandle: pawn.handle,
            pawnControllerHandle: getNumberField(pawn, 'm_hController'),
            pawnDefaultControllerHandle: getNumberField(pawn, 'm_hDefaultController')
        }));

    players.sort((a, b) => a.lobbySlot - b.lobbySlot || a.name.localeCompare(b.name));

    return {
        controllerCount: controllers.length,
        pawnCount: pawns.length,
        players,
        validLinks,
        controllersWithoutPawn,
        pawnsWithoutController,
        divergences
    };
}

function isRealController(controller) {
    const name = getStringField(controller, 'm_iszPlayerName');
    const steamId = getBigIntStringField(controller, 'm_steamID');

    return name !== SOURCE_TV_NAME && steamId !== '0';
}

function findPawnForController(controller, pawnByHandle) {
    const controllerHandle = controller.handle;
    const candidateHandles = [
        getNumberField(controller, 'm_hHeroPawn'),
        getNumberField(controller, 'm_hPawn')
    ].filter(handle => handle !== null && handle !== INVALID_HANDLE);
    const uniqueCandidateHandles = Array.from(new Set(candidateHandles));

    for (const candidateHandle of uniqueCandidateHandles) {
        const pawn = pawnByHandle.get(candidateHandle) || null;

        if (pawn === null) {
            continue;
        }

        const inverseControllerHandle = getNumberField(pawn, 'm_hController');

        return {
            pawn,
            selectedControllerField: candidateHandle === getNumberField(controller, 'm_hHeroPawn') ? 'm_hHeroPawn' : 'm_hPawn',
            candidateHandles: uniqueCandidateHandles,
            controllerHandle,
            inverseControllerHandle,
            inverseMatches: inverseControllerHandle === controllerHandle
        };
    }

    return {
        pawn: null,
        selectedControllerField: null,
        candidateHandles: uniqueCandidateHandles,
        controllerHandle,
        inverseControllerHandle: null,
        inverseMatches: false
    };
}

function buildPlayerSnapshot(controller, pawn) {
    return {
        name: getStringField(controller, 'm_iszPlayerName'),
        steamId: getBigIntStringField(controller, 'm_steamID'),
        team: getNumberField(controller, 'm_iTeamNum'),
        lobbySlot: getNumberField(controller, 'm_unLobbyPlayerSlot'),
        controllerHandle: controller.handle,
        pawnHandle: pawn?.handle ?? null,
        heroIdRaw: getNumberField(controller, 'm_nHeroID'),
        assignedLane: getNumberField(controller, 'm_nAssignedLane'),
        originalLane: getNumberField(controller, 'm_nOriginalLaneAssignment'),
        alive: getBooleanField(controller, 'm_bAlive'),
        health: getPreferredNumberField(pawn, controller, 'm_iHealth'),
        maxHealth: getPreferredNumberField(pawn, controller, 'm_iMaxHealth', 'm_iHealthMax'),
        level: getNumberField(controller, 'm_iLevel'),
        netWorth: getNumberField(controller, 'm_iGoldNetWorth'),
        abilityPointsNetWorth: getNumberField(controller, 'm_iAPNetWorth'),
        kills: getNumberField(controller, 'm_iPlayerKills'),
        deaths: getNumberField(controller, 'm_iDeaths'),
        assists: getNumberField(controller, 'm_iPlayerAssists'),
        lastHits: getNumberField(controller, 'm_iLastHits'),
        denies: getNumberField(controller, 'm_iDenies'),
        killStreak: getNumberField(controller, 'm_iKillStreak'),
        heroDamage: getNumberField(controller, 'm_iHeroDamage'),
        objectiveDamage: getNumberField(controller, 'm_iObjectiveDamage'),
        heroHealing: getNumberField(controller, 'm_iHeroHealing'),
        selfHealing: getNumberField(controller, 'm_iSelfHealing'),
        respawnTime: getPreferredNumberField(pawn, controller, 'm_flRespawnTime'),
        position: {
            x: pawn === null ? null : getNumberField(pawn, 'CBodyComponent.m_vecX'),
            y: pawn === null ? null : getNumberField(pawn, 'CBodyComponent.m_vecY'),
            z: pawn === null ? null : getNumberField(pawn, 'CBodyComponent.m_vecZ')
        }
    };
}

function buildControllerLinkRecord(controller, link) {
    return {
        controllerIndex: controller.index,
        controllerHandle: controller.handle,
        name: getStringField(controller, 'm_iszPlayerName'),
        steamId: getBigIntStringField(controller, 'm_steamID'),
        controllerHeroPawnHandle: getNumberField(controller, 'm_hHeroPawn'),
        controllerPawnHandle: getNumberField(controller, 'm_hPawn'),
        candidateHandles: link.candidateHandles
    };
}

function buildLinkRecord(controller, link) {
    return {
        ...buildControllerLinkRecord(controller, link),
        pawnIndex: link.pawn.index,
        pawnHandle: link.pawn.handle,
        selectedControllerField: link.selectedControllerField,
        pawnControllerHandle: link.inverseControllerHandle,
        inverseMatches: link.inverseMatches
    };
}

function getPreferredNumberField(primaryEntity, fallbackEntity, primaryField, fallbackField = primaryField) {
    const primary = primaryEntity === null ? null : getNumberField(primaryEntity, primaryField);

    if (primary !== null) {
        return primary;
    }

    return getNumberField(fallbackEntity, fallbackField);
}

function getNumberField(entity, field) {
    const value = entity.getField(field);

    return typeof value === 'number' ? value : null;
}

function getBooleanField(entity, field) {
    const value = entity.getField(field);

    return typeof value === 'boolean' ? value : null;
}

function getStringField(entity, field) {
    const value = entity.getField(field);

    return typeof value === 'string' ? value : null;
}

function getBigIntStringField(entity, field) {
    const value = entity.getField(field);

    if (typeof value === 'bigint') {
        return value.toString();
    }

    return value === undefined || value === null ? null : String(value);
}

async function writeJson(file, data) {
    await writeFile(file, `${JSON.stringify(data, null, 4)}\n`);
}
