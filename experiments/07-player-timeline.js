import { createReadStream } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { InterceptorStage, Logger, MessagePacketType, Parser, Player } from 'deadem';

const DEMO_ARGUMENT_PREFIX = '--demo=';
const DEFAULT_DEMO = './samples/partida_001.dem';
const JSON_OUTPUT_FILE = './output/07-player-timeline.json';
const CSV_OUTPUT_FILE = './output/07-player-timeline.csv';
const QUALITY_OUTPUT_FILE = './output/07-player-timeline-quality.json';
const CONTROLLER_CLASS = 'CCitadelPlayerController';
const PAWN_CLASS = 'CCitadelPlayerPawn';
const GAME_RULES_CLASS = 'CCitadelGameRulesProxy';
const SOURCE_TV_NAME = 'SourceTV';
const INVALID_HANDLE = 16777215;
const REAL_PLAYER_COUNT = 12;
const ACTIVE_GAME_STATE = 7;
const TERMINAL_GAME_STATES = new Set([ 6, 8, 11 ]);
const OUTPUT_SIZE_LIMIT = 15 * 1024 * 1024;
const STATE_NAMES = new Map([
    [ 1, 'INIT' ],
    [ 2, 'PLAYERS_LOADING' ],
    [ 3, 'UNKNOWN_3' ],
    [ 4, 'PRE_GAME' ],
    [ 5, 'GAME_IN_PROGRESS' ],
    [ 6, 'POST_GAME' ],
    [ 7, 'UNKNOWN_7' ],
    [ 8, 'UNKNOWN_8' ],
    [ 11, 'UNKNOWN_11' ]
]);
const CSV_COLUMNS = [
    'gameSecond',
    'gameTime',
    'demoTick',
    'serverTick',
    'steamId',
    'name',
    'team',
    'heroIdRaw',
    'alive',
    'health',
    'maxHealth',
    'level',
    'netWorth',
    'kills',
    'deaths',
    'assists',
    'lastHits',
    'denies',
    'heroDamage',
    'objectiveDamage',
    'x',
    'y',
    'z',
    'pawnResolutionConfidence'
];
const PLAYER_ROW_SCHEMA = [
    'playerIndex',
    'controllerHandle',
    'pawnHandle',
    'pawnResolutionConfidence',
    'healthSource',
    'alive',
    'health',
    'maxHealth',
    'healthPercent',
    'level',
    'respawnTime',
    'netWorth',
    'abilityPointsNetWorth',
    'lastHits',
    'denies',
    'kills',
    'deaths',
    'assists',
    'killStreak',
    'heroDamage',
    'objectiveDamage',
    'heroHealing',
    'selfHealing',
    'position.x',
    'position.y',
    'position.z',
    'eyeAngles.x',
    'eyeAngles.y',
    'eyeAngles.z'
];

const startedAt = Date.now();
const demoPath = resolveDemoPath();
const metadata = await readPlayerMetadata(demoPath);
const timelineIndex = await buildOfficialSecondIndex(demoPath, metadata.tickRate);
const extraction = await extractPlayerTimeline(demoPath, metadata, timelineIndex.samples);
let quality = buildQualityReport(metadata, timelineIndex, extraction, startedAt);

await mkdir(path.dirname(JSON_OUTPUT_FILE), { recursive: true });
await writeCompactJson(JSON_OUTPUT_FILE, {
    metadata: {
        fileName: path.basename(demoPath),
        filePath: demoPath,
        tickRate: metadata.tickRate,
        playerFirstTick: metadata.playerFirstTick,
        playerLastTick: metadata.playerLastTick,
        activeGameState: ACTIVE_GAME_STATE,
        terminalGameStates: Array.from(TERMINAL_GAME_STATES),
        officialClockSource: {
            gameTick: 'SVC_PACKET_ENTITIES.data.serverTick',
            className: GAME_RULES_CLASS,
            pausedField: 'm_pGameRules.m_bGamePaused',
            gameStateField: 'm_pGameRules.m_eGameState',
            clockLastUpdateField: 'm_pGameRules.m_flMatchClockAtLastUpdate',
            clockUpdateTickField: 'm_pGameRules.m_nMatchClockUpdateTick'
        },
        firstTerminalState: timelineIndex.firstTerminalState,
        generatedAt: new Date().toISOString()
    },
    players: extraction.players,
    playerRowSchema: PLAYER_ROW_SCHEMA,
    snapshots: compactSnapshots(extraction.snapshots)
});
await writeFile(CSV_OUTPUT_FILE, buildCsv(extraction.players, extraction.snapshots));
quality = {
    ...quality,
    fileSizes: await getKnownFileSizes()
};
await writeJson(QUALITY_OUTPUT_FILE, quality);
quality = {
    ...quality,
    fileSizes: await getKnownFileSizes()
};
await writeJson(QUALITY_OUTPUT_FILE, quality);
await assertSizeUnderLimit(JSON_OUTPUT_FILE);
await assertSizeUnderLimit(QUALITY_OUTPUT_FILE);
await validateCsv(CSV_OUTPUT_FILE, CSV_COLUMNS.length);

console.log(`Official interval: ${quality.officialInterval.firstGameSecond} - ${quality.officialInterval.lastGameSecond}`);
console.log(`Snapshots: ${quality.totalSecondsExtracted}`);
console.log(`CSV rows: ${quality.totalRealRows}`);
console.log(`Wrote ${JSON_OUTPUT_FILE}`);
console.log(`Wrote ${CSV_OUTPUT_FILE}`);
console.log(`Wrote ${QUALITY_OUTPUT_FILE}`);

function resolveDemoPath() {
    const argument = process.argv.find(arg => arg.startsWith(DEMO_ARGUMENT_PREFIX));
    const file = argument ? argument.slice(DEMO_ARGUMENT_PREFIX.length) : DEFAULT_DEMO;

    return path.resolve(process.cwd(), file);
}

async function readPlayerMetadata(file) {
    const player = new Player(undefined, Logger.NOOP);

    try {
        await player.load(createReadStream(file));

        const tickRate = player.getDemo().server?.tickRate ?? null;

        if (tickRate === null) {
            throw new Error('Unable to determine replay tick rate from demo.server.tickRate');
        }

        return {
            tickRate,
            playerFirstTick: player.getFirstTick(),
            playerLastTick: player.getLastTick()
        };
    } finally {
        await player.dispose();
    }
}

async function buildOfficialSecondIndex(file, tickRate) {
    const parser = new Parser(undefined, Logger.NOOP);
    const bySecond = new Map();
    let firstTerminalState = null;
    let lastPacketDomains = null;

    try {
        parser.registerPostInterceptor(InterceptorStage.DEMO_PACKET, (demoPacket) => {
            const domains = getPacketDomains(demoPacket);
            const gameRules = getGameRulesState(parser.getDemo());
            const clock = getOfficialClock(gameRules, domains.serverTick, tickRate);

            lastPacketDomains = domains;

            if (firstTerminalState === null && TERMINAL_GAME_STATES.has(gameRules?.gameState)) {
                firstTerminalState = {
                    ...compactDomains(domains),
                    gameState: gameRules.gameState,
                    gameStateName: gameRules.gameStateName,
                    gameClockSeconds: clock?.seconds ?? null,
                    gameClockFormatted: clock?.formatted ?? null
                };
            }

            if (gameRules?.gameState !== ACTIVE_GAME_STATE || gameRules.gamePaused === true || clock === null) {
                return;
            }

            const gameSecond = Math.floor(clock.seconds);

            if (bySecond.has(gameSecond)) {
                return;
            }

            bySecond.set(gameSecond, {
                gameSecond,
                gameTime: formatClock(gameSecond),
                demoTick: domains.demoTick,
                serverTick: domains.serverTick,
                netTick: domains.netTick,
                technicalSeconds: getTechnicalSeconds(domains.demoTick, tickRate),
                gameState: gameRules.gameState,
                gameStateName: gameRules.gameStateName,
                paused: gameRules.gamePaused,
                clockSecondsRaw: clock.seconds,
                sequence: domains.sequence
            });
        });

        await parser.parse(createReadStream(file));

        const samples = Array.from(bySecond.values()).sort((a, b) => a.gameSecond - b.gameSecond);

        return {
            samples,
            firstTerminalState,
            lastPacketDomains: compactDomains(lastPacketDomains)
        };
    } finally {
        await parser.dispose();
    }
}

async function extractPlayerTimeline(file, metadata, samples) {
    const player = new Player(undefined, Logger.NOOP);
    const snapshots = [];
    const playerRegistry = new Map();
    const playerIdentities = [];

    try {
        await player.load(createReadStream(file));

        if (samples.length === 0) {
            return {
                players: [],
                snapshots: []
            };
        }

        await player.seekToTick(samples[0].demoTick);

        for (const sample of samples) {
            while (player.getCurrentTick() < sample.demoTick) {
                const advanced = await player.nextTick();

                if (!advanced) {
                    break;
                }
            }

            if (player.getCurrentTick() !== sample.demoTick) {
                await player.seekToTick(sample.demoTick);
            }

            const inspection = inspectCurrentTick(player, playerRegistry, playerIdentities);

            snapshots.push({
                gameSecond: sample.gameSecond,
                gameTime: sample.gameTime,
                demoTick: player.getCurrentTick(),
                requestedDemoTick: sample.demoTick,
                serverTick: sample.serverTick,
                technicalSeconds: sample.technicalSeconds,
                gameState: sample.gameState,
                gameStateName: sample.gameStateName,
                paused: sample.paused,
                playerCount: inspection.players.length,
                unresolvedPawns: inspection.unresolvedPawns,
                missingPositions: inspection.missingPositions,
                linkIssues: inspection.linkIssues,
                players: inspection.players
            });
        }

        return {
            players: playerIdentities,
            snapshots
        };
    } finally {
        await player.dispose();
    }
}

function inspectCurrentTick(player, playerRegistry, playerIdentities) {
    const demo = player.getDemo();
    const controllers = demo.getEntitiesByClassName(CONTROLLER_CLASS);
    const pawns = demo.getEntitiesByClassName(PAWN_CLASS);
    const pawnByHandle = new Map(pawns.map(pawn => [ pawn.handle, pawn ]));
    const realControllers = controllers.filter(isRealController);
    const players = [];
    const unresolvedPawns = [];
    const missingPositions = [];
    const linkIssues = [];

    for (const controller of realControllers) {
        const link = findPawnForController(controller, pawnByHandle);
        const identity = getOrCreatePlayerIdentity(controller, playerRegistry, playerIdentities);
        const state = buildPlayerState(controller, link, identity.playerIndex);

        players.push(state);

        if (link.pawn === null) {
            unresolvedPawns.push(buildLinkIssue(controller, link));
        }

        if (link.pawn !== null && !link.inverseMatches) {
            linkIssues.push(buildLinkIssue(controller, link));
        }

        if (state.position.x === null || state.position.y === null || state.position.z === null) {
            missingPositions.push({
                playerIndex: identity.playerIndex,
                steamId: identity.steamId,
                pawnHandle: state.pawnHandle
            });
        }
    }

    players.sort((a, b) => a.playerIndex - b.playerIndex);

    return {
        players,
        unresolvedPawns,
        missingPositions,
        linkIssues
    };
}

function getOrCreatePlayerIdentity(controller, playerRegistry, playerIdentities) {
    const steamId = getBigIntStringField(controller, 'm_steamID');
    const existing = playerRegistry.get(steamId);

    if (existing !== undefined) {
        return existing;
    }

    const identity = {
        playerIndex: playerIdentities.length,
        steamId,
        name: getStringField(controller, 'm_iszPlayerName'),
        team: getNumberField(controller, 'm_iTeamNum'),
        lobbySlot: getNumberField(controller, 'm_unLobbyPlayerSlot'),
        controllerHandle: controller.handle,
        heroIdRaw: getNumberField(controller, 'm_nHeroID'),
        assignedLane: getNumberField(controller, 'm_nAssignedLane'),
        originalLane: getNumberField(controller, 'm_nOriginalLaneAssignment')
    };

    playerRegistry.set(steamId, identity);
    playerIdentities.push(identity);

    return identity;
}

function buildPlayerState(controller, link, playerIndex) {
    const pawn = link.pawn;
    const healthFromPawn = pawn === null ? null : getNumberField(pawn, 'm_iHealth');
    const maxHealthFromPawn = pawn === null ? null : getNumberField(pawn, 'm_iMaxHealth');
    const healthFromController = getNumberField(controller, 'm_iHealth');
    const maxHealthFromController = getNumberField(controller, 'm_iHealthMax');
    const health = healthFromPawn ?? healthFromController;
    const maxHealth = maxHealthFromPawn ?? maxHealthFromController;
    const healthSource = healthFromPawn !== null
        ? 'pawn'
        : (healthFromController !== null ? 'controller' : 'missing');

    return {
        playerIndex,
        steamId: getBigIntStringField(controller, 'm_steamID'),
        controllerHandle: controller.handle,
        pawnHandle: pawn?.handle ?? null,
        pawnResolutionConfidence: getPawnResolutionConfidence(link),
        healthSource,
        alive: getBooleanField(controller, 'm_bAlive'),
        health,
        maxHealth,
        healthPercent: health !== null && maxHealth !== null && maxHealth > 0 ? health / maxHealth : null,
        level: getNumberField(controller, 'm_iLevel'),
        respawnTime: getPreferredNumberField(pawn, controller, 'm_flRespawnTime'),
        netWorth: getNumberField(controller, 'm_iGoldNetWorth'),
        abilityPointsNetWorth: getNumberField(controller, 'm_iAPNetWorth'),
        lastHits: getNumberField(controller, 'm_iLastHits'),
        denies: getNumberField(controller, 'm_iDenies'),
        kills: getNumberField(controller, 'm_iPlayerKills'),
        deaths: getNumberField(controller, 'm_iDeaths'),
        assists: getNumberField(controller, 'm_iPlayerAssists'),
        killStreak: getNumberField(controller, 'm_iKillStreak'),
        heroDamage: getNumberField(controller, 'm_iHeroDamage'),
        objectiveDamage: getNumberField(controller, 'm_iObjectiveDamage'),
        heroHealing: getNumberField(controller, 'm_iHeroHealing'),
        selfHealing: getNumberField(controller, 'm_iSelfHealing'),
        position: {
            x: pawn === null ? null : getNumberField(pawn, 'CBodyComponent.m_vecX'),
            y: pawn === null ? null : getNumberField(pawn, 'CBodyComponent.m_vecY'),
            z: pawn === null ? null : getNumberField(pawn, 'CBodyComponent.m_vecZ')
        },
        eyeAngles: getEyeAngles(pawn)
    };
}

function isRealController(controller) {
    const name = getStringField(controller, 'm_iszPlayerName');
    const steamId = getBigIntStringField(controller, 'm_steamID');

    return name !== SOURCE_TV_NAME && steamId !== '0';
}

function findPawnForController(controller, pawnByHandle) {
    const controllerHandle = controller.handle;
    const heroPawnHandle = getNumberField(controller, 'm_hHeroPawn');
    const pawnHandle = getNumberField(controller, 'm_hPawn');
    const candidateHandles = [
        heroPawnHandle,
        pawnHandle
    ].filter(handle => handle !== null && handle !== INVALID_HANDLE);
    const uniqueCandidateHandles = Array.from(new Set(candidateHandles));

    for (const candidateHandle of uniqueCandidateHandles) {
        const pawn = pawnByHandle.get(candidateHandle) || null;

        if (pawn === null) {
            continue;
        }

        const ownerEntityHandle = getNumberField(pawn, 'm_hOwnerEntity');
        const controllerFieldHandle = getNumberField(pawn, 'm_hController');
        const inverseMatches = ownerEntityHandle === controllerHandle || controllerFieldHandle === controllerHandle;

        return {
            pawn,
            selectedControllerField: candidateHandle === heroPawnHandle ? 'm_hHeroPawn' : 'm_hPawn',
            candidateHandles: uniqueCandidateHandles,
            controllerHandle,
            ownerEntityHandle,
            controllerFieldHandle,
            inverseMatches
        };
    }

    return {
        pawn: null,
        selectedControllerField: null,
        candidateHandles: uniqueCandidateHandles,
        controllerHandle,
        ownerEntityHandle: null,
        controllerFieldHandle: null,
        inverseMatches: false
    };
}

function getPawnResolutionConfidence(link) {
    if (link.pawn === null) {
        return 'missing';
    }

    return link.inverseMatches ? 'high' : 'linked_without_inverse_match';
}

function buildLinkIssue(controller, link) {
    return {
        controllerIndex: controller.index,
        controllerHandle: controller.handle,
        name: getStringField(controller, 'm_iszPlayerName'),
        steamId: getBigIntStringField(controller, 'm_steamID'),
        controllerHeroPawnHandle: getNumberField(controller, 'm_hHeroPawn'),
        controllerPawnHandle: getNumberField(controller, 'm_hPawn'),
        selectedControllerField: link.selectedControllerField,
        candidateHandles: link.candidateHandles,
        pawnIndex: link.pawn?.index ?? null,
        pawnHandle: link.pawn?.handle ?? null,
        pawnOwnerEntityHandle: link.ownerEntityHandle,
        pawnControllerHandle: link.controllerFieldHandle,
        inverseMatches: link.inverseMatches
    };
}

function getPacketDomains(demoPacket) {
    const messagePackets = Array.isArray(demoPacket.data?.messagePackets) ? demoPacket.data.messagePackets : [];
    const netTickPacket = messagePackets.findLast(messagePacket => messagePacket.type === MessagePacketType.NET_TICK);
    const packetEntities = messagePackets.findLast(messagePacket => messagePacket.type === MessagePacketType.SVC_PACKET_ENTITIES);

    return {
        sequence: normalizeValue(demoPacket.sequence),
        packetType: demoPacket.type?.code ?? null,
        demoTick: normalizeValue(demoPacket.tick?.value ?? demoPacket.tick),
        netTick: normalizeValue(netTickPacket?.data?.tick ?? null),
        serverTick: normalizeValue(packetEntities?.data?.serverTick ?? null)
    };
}

function getGameRulesState(demo) {
    const entity = demo.getEntitiesByClassName(GAME_RULES_CLASS)[0] || null;

    if (entity === null) {
        return null;
    }

    const gameState = normalizeValue(entity.getField('m_pGameRules.m_eGameState') ?? null);

    return {
        gamePaused: normalizeValue(entity.getField('m_pGameRules.m_bGamePaused') ?? null),
        gameState,
        gameStateName: STATE_NAMES.get(gameState) || null,
        matchClockAtLastUpdate: normalizeValue(entity.getField('m_pGameRules.m_flMatchClockAtLastUpdate') ?? null),
        matchClockUpdateTick: normalizeValue(entity.getField('m_pGameRules.m_nMatchClockUpdateTick') ?? null)
    };
}

function getOfficialClock(gameRules, gameTick, tickRate) {
    if (gameRules === null || gameTick === null) {
        return null;
    }

    if (typeof gameRules.matchClockAtLastUpdate !== 'number' || typeof gameRules.matchClockUpdateTick !== 'number') {
        return null;
    }

    const shouldFreeze = gameRules.gamePaused === true || gameRules.gameState === 6;
    const elapsed = shouldFreeze ? 0 : Math.max(gameTick - gameRules.matchClockUpdateTick, 0) / tickRate;
    const seconds = Math.max(gameRules.matchClockAtLastUpdate + elapsed, 0);

    return {
        seconds,
        formatted: formatClock(seconds),
        frozen: shouldFreeze
    };
}

function buildQualityReport(metadata, timelineIndex, extraction, startedAtMs) {
    const snapshots = extraction.snapshots;
    const csvRowCount = snapshots.reduce((total, snapshot) => total + snapshot.players.length, 0);
    const seconds = snapshots.map(snapshot => snapshot.gameSecond);
    const firstGameSecond = seconds[0] ?? null;
    const lastGameSecond = seconds.at(-1) ?? null;
    const expectedSeconds = firstGameSecond === null || lastGameSecond === null
        ? []
        : range(firstGameSecond, lastGameSecond);
    const secondCounts = countBy(seconds);
    const playerSnapshotCounts = new Map();
    const steamIdsBySnapshot = [];
    const snapshotsWithWrongPlayerCount = [];
    const pawnsUnresolved = [];
    const positionsMissing = [];
    const validationIssues = [];
    const monotonicIssues = validateCumulativeFields(snapshots);

    for (const snapshot of snapshots) {
        if (snapshot.players.length !== REAL_PLAYER_COUNT) {
            snapshotsWithWrongPlayerCount.push({
                gameSecond: snapshot.gameSecond,
                demoTick: snapshot.demoTick,
                playerCount: snapshot.players.length
            });
        }

        const snapshotSteamIds = new Set();

        for (const player of snapshot.players) {
            playerSnapshotCounts.set(player.playerIndex, (playerSnapshotCounts.get(player.playerIndex) ?? 0) + 1);

            if (snapshotSteamIds.has(player.steamId)) {
                steamIdsBySnapshot.push({
                    gameSecond: snapshot.gameSecond,
                    steamId: player.steamId
                });
            }

            snapshotSteamIds.add(player.steamId);

            if (player.healthPercent !== null && (player.healthPercent < 0 || player.healthPercent > 1)) {
                validationIssues.push({
                    type: 'health_percent_out_of_range',
                    gameSecond: snapshot.gameSecond,
                    playerIndex: player.playerIndex,
                    healthPercent: player.healthPercent
                });
            }

            for (const field of [ 'netWorth', 'kills', 'deaths', 'assists', 'heroDamage', 'objectiveDamage', 'heroHealing', 'selfHealing', 'lastHits', 'denies' ]) {
                if (player[field] !== null && player[field] < 0) {
                    validationIssues.push({
                        type: 'negative_stat',
                        field,
                        gameSecond: snapshot.gameSecond,
                        playerIndex: player.playerIndex,
                        value: player[field]
                    });
                }
            }
        }

        pawnsUnresolved.push(...snapshot.unresolvedPawns.map(issue => ({ gameSecond: snapshot.gameSecond, ...issue })));
        positionsMissing.push(...snapshot.missingPositions.map(issue => ({ gameSecond: snapshot.gameSecond, ...issue })));
    }

    validationIssues.push(...monotonicIssues);

    return {
        officialInterval: {
            firstGameSecond,
            lastGameSecond,
            firstGameTime: firstGameSecond === null ? null : formatClock(firstGameSecond),
            lastGameTime: lastGameSecond === null ? null : formatClock(lastGameSecond)
        },
        demoTickInterval: {
            firstDemoTick: snapshots[0]?.demoTick ?? null,
            lastDemoTick: snapshots.at(-1)?.demoTick ?? null,
            playerLastTick: metadata.playerLastTick
        },
        serverTickInterval: {
            firstServerTick: snapshots[0]?.serverTick ?? null,
            lastServerTick: snapshots.at(-1)?.serverTick ?? null
        },
        totalSecondsExtracted: snapshots.length,
        totalExpectedLines: snapshots.length * REAL_PLAYER_COUNT,
        totalRealRows: csvRowCount,
        snapshotsPerPlayer: Object.fromEntries(Array.from(playerSnapshotCounts.entries()).sort(([ a ], [ b ]) => a - b)),
        missingSeconds: expectedSeconds.filter(second => !secondCounts.has(second)),
        duplicateSeconds: Array.from(secondCounts.entries())
            .filter(([ , count ]) => count > 1)
            .map(([ second, count ]) => ({ second, count })),
        snapshotsWithWrongPlayerCount,
        pawnsUnresolved,
        positionsMissing,
        duplicateSteamIdsBySnapshot: steamIdsBySnapshot,
        unexpectedTeamVariations: findIdentityVariations(extraction.players, snapshots, 'team'),
        unexpectedControllerVariations: findIdentityVariations(extraction.players, snapshots, 'controllerHandle'),
        greatestGapBetweenConsecutiveSeconds: findGreatestSecondGap(seconds),
        snapshotsDuringPause: snapshots.filter(snapshot => snapshot.paused === true).map(snapshot => snapshot.gameSecond),
        snapshotsOutsideActiveState: snapshots
            .filter(snapshot => snapshot.gameState !== ACTIVE_GAME_STATE)
            .map(snapshot => ({ gameSecond: snapshot.gameSecond, gameState: snapshot.gameState })),
        firstTerminalState: timelineIndex.firstTerminalState,
        sourceIndexLastPacket: timelineIndex.lastPacketDomains,
        validationIssues,
        fileSizes: getKnownFileSizes(),
        elapsedMs: Date.now() - startedAtMs
    };
}

function compactSnapshots(snapshots) {
    return snapshots.map(snapshot => ({
        gameSecond: snapshot.gameSecond,
        gameTime: snapshot.gameTime,
        demoTick: snapshot.demoTick,
        requestedDemoTick: snapshot.requestedDemoTick,
        serverTick: snapshot.serverTick,
        technicalSeconds: snapshot.technicalSeconds,
        gameState: snapshot.gameState,
        gameStateName: snapshot.gameStateName,
        paused: snapshot.paused,
        playerCount: snapshot.playerCount,
        unresolvedPawnCount: snapshot.unresolvedPawns.length,
        missingPositionCount: snapshot.missingPositions.length,
        linkIssueCount: snapshot.linkIssues.length,
        playerRows: snapshot.players.map(player => PLAYER_ROW_SCHEMA.map(field => getCompactPlayerValue(player, field)))
    }));
}

function getCompactPlayerValue(player, field) {
    switch (field) {
        case 'position.x':
            return player.position.x;
        case 'position.y':
            return player.position.y;
        case 'position.z':
            return player.position.z;
        case 'eyeAngles.x':
            return player.eyeAngles?.x ?? null;
        case 'eyeAngles.y':
            return player.eyeAngles?.y ?? null;
        case 'eyeAngles.z':
            return player.eyeAngles?.z ?? null;
        default:
            return player[field];
    }
}

function findIdentityVariations(players, snapshots, field) {
    const expectedByPlayer = new Map(players.map(player => [ player.playerIndex, player[field] ]));
    const variations = [];

    for (const snapshot of snapshots) {
        for (const player of snapshot.players) {
            if (field in player && expectedByPlayer.get(player.playerIndex) !== player[field]) {
                variations.push({
                    gameSecond: snapshot.gameSecond,
                    playerIndex: player.playerIndex,
                    expected: expectedByPlayer.get(player.playerIndex),
                    actual: player[field]
                });
            }
        }
    }

    return variations;
}

function validateCumulativeFields(snapshots) {
    const fields = [ 'netWorth', 'kills', 'deaths', 'assists', 'heroDamage', 'objectiveDamage', 'heroHealing', 'selfHealing', 'lastHits', 'denies' ];
    const previous = new Map();
    const issues = [];

    for (const snapshot of snapshots) {
        for (const player of snapshot.players) {
            if (!previous.has(player.playerIndex)) {
                previous.set(player.playerIndex, {});
            }

            const previousPlayer = previous.get(player.playerIndex);

            for (const field of fields) {
                const value = player[field];

                if (value !== null && previousPlayer[field] !== undefined && value < previousPlayer[field]) {
                    issues.push({
                        type: 'cumulative_stat_decreased',
                        field,
                        gameSecond: snapshot.gameSecond,
                        playerIndex: player.playerIndex,
                        previousValue: previousPlayer[field],
                        value
                    });
                }

                if (value !== null) {
                    previousPlayer[field] = value;
                }
            }
        }
    }

    return issues;
}

function buildCsv(players, snapshots) {
    const playerByIndex = new Map(players.map(player => [ player.playerIndex, player ]));
    const lines = [ CSV_COLUMNS.join(',') ];

    for (const snapshot of snapshots) {
        for (const state of snapshot.players) {
            const identity = playerByIndex.get(state.playerIndex);
            const row = {
                gameSecond: snapshot.gameSecond,
                gameTime: snapshot.gameTime,
                demoTick: snapshot.demoTick,
                serverTick: snapshot.serverTick,
                steamId: state.steamId,
                name: identity?.name ?? null,
                team: identity?.team ?? null,
                heroIdRaw: identity?.heroIdRaw ?? null,
                alive: state.alive,
                health: state.health,
                maxHealth: state.maxHealth,
                level: state.level,
                netWorth: state.netWorth,
                kills: state.kills,
                deaths: state.deaths,
                assists: state.assists,
                lastHits: state.lastHits,
                denies: state.denies,
                heroDamage: state.heroDamage,
                objectiveDamage: state.objectiveDamage,
                x: state.position.x,
                y: state.position.y,
                z: state.position.z,
                pawnResolutionConfidence: state.pawnResolutionConfidence
            };

            lines.push(CSV_COLUMNS.map(column => csvEscape(row[column])).join(','));
        }
    }

    return `${lines.join('\n')}\n`;
}

async function validateCsv(file, columnCount) {
    const content = await readFile(file, 'utf8');
    const lines = content.trimEnd().split('\n');

    if (lines[0] !== CSV_COLUMNS.join(',')) {
        throw new Error(`Unexpected CSV header in ${file}`);
    }

    for (const [ index, line ] of lines.entries()) {
        const columns = parseCsvLine(line);

        if (columns.length !== columnCount) {
            throw new Error(`Unexpected CSV column count at line ${index + 1}: expected ${columnCount}, got ${columns.length}`);
        }
    }
}

function parseCsvLine(line) {
    const columns = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];

        if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            columns.push(current);
            current = '';
        } else {
            current += char;
        }
    }

    columns.push(current);

    return columns;
}

async function getKnownFileSizes() {
    return {
        [JSON_OUTPUT_FILE]: await getFileSize(JSON_OUTPUT_FILE),
        [CSV_OUTPUT_FILE]: await getFileSize(CSV_OUTPUT_FILE),
        [QUALITY_OUTPUT_FILE]: await getFileSize(QUALITY_OUTPUT_FILE)
    };
}

async function getFileSize(file) {
    try {
        return (await stat(file)).size;
    } catch {
        return null;
    }
}

function compactDomains(domains) {
    if (domains === null) {
        return null;
    }

    return {
        sequence: domains.sequence,
        packetType: domains.packetType,
        demoTick: domains.demoTick,
        netTick: domains.netTick,
        serverTick: domains.serverTick
    };
}

function getTechnicalSeconds(demoTick, tickRate) {
    return demoTick / tickRate;
}

function findGreatestSecondGap(seconds) {
    let maxGap = 0;

    for (let i = 1; i < seconds.length; i++) {
        maxGap = Math.max(maxGap, seconds[i] - seconds[i - 1]);
    }

    return maxGap;
}

function countBy(values) {
    const counts = new Map();

    for (const value of values) {
        counts.set(value, (counts.get(value) ?? 0) + 1);
    }

    return counts;
}

function range(start, end) {
    const values = [];

    for (let value = start; value <= end; value++) {
        values.push(value);
    }

    return values;
}

function getEyeAngles(pawn) {
    if (pawn === null) {
        return null;
    }

    const x = getNumberField(pawn, 'm_angEyeAngles.x');
    const y = getNumberField(pawn, 'm_angEyeAngles.y');
    const z = getNumberField(pawn, 'm_angEyeAngles.z');

    if (x === null && y === null && z === null) {
        return null;
    }

    return { x, y, z };
}

function getPreferredNumberField(primaryEntity, fallbackEntity, primaryField, fallbackField = primaryField) {
    const primary = primaryEntity === null ? null : getNumberField(primaryEntity, primaryField);

    if (primary !== null) {
        return primary;
    }

    return getNumberField(fallbackEntity, fallbackField);
}

function getNumberField(entity, field) {
    const value = entity?.getField(field);

    return typeof value === 'number' ? value : null;
}

function getBooleanField(entity, field) {
    const value = entity?.getField(field);

    return typeof value === 'boolean' ? value : null;
}

function getStringField(entity, field) {
    const value = entity?.getField(field);

    return typeof value === 'string' ? value : null;
}

function getBigIntStringField(entity, field) {
    const value = entity?.getField(field);

    if (typeof value === 'bigint') {
        return value.toString();
    }

    return value === undefined || value === null ? null : String(value);
}

function normalizeValue(value) {
    if (typeof value === 'bigint') {
        return value.toString();
    }

    return value ?? null;
}

function csvEscape(value) {
    if (value === null || value === undefined) {
        return '';
    }

    const text = String(value);

    if (/[",\n\r]/u.test(text)) {
        return `"${text.replaceAll('"', '""')}"`;
    }

    return text;
}

function formatClock(seconds) {
    const safeSeconds = Math.max(seconds, 0);
    const minutes = Math.floor(safeSeconds / 60);
    const wholeSeconds = Math.floor(safeSeconds % 60);

    return `${minutes.toString().padStart(2, '0')}:${wholeSeconds.toString().padStart(2, '0')}`;
}

async function writeJson(file, data) {
    await writeFile(file, `${JSON.stringify(data, null, 4)}\n`);
}

async function writeCompactJson(file, data) {
    await writeFile(file, `${JSON.stringify(data)}\n`);
}

async function assertSizeUnderLimit(file) {
    const stats = await stat(file);

    if (stats.size > OUTPUT_SIZE_LIMIT) {
        throw new Error(`Output file exceeds 15 MiB: ${file} (${stats.size} bytes)`);
    }
}
