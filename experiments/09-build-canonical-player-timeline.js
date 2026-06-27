import { createReadStream } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { InterceptorStage, Logger, MessagePacketType, Parser, Player } from 'deadem';

const DEMO_ARGUMENT_PREFIX = '--demo=';
const DEFAULT_DEMO = './samples/partida_001.dem';
const RECOMMENDATIONS_FILE = './output/08-data-quality-recommendations.json';
const TIMELINE_OUTPUT_FILE = './output/09-canonical-player-timeline.json';
const CSV_OUTPUT_FILE = './output/09-canonical-player-timeline.csv';
const SCHEMA_OUTPUT_FILE = './output/09-canonical-schema.json';
const QUALITY_OUTPUT_FILE = './output/09-canonical-quality.json';
const CONTROLLER_CLASS = 'CCitadelPlayerController';
const PAWN_CLASS = 'CCitadelPlayerPawn';
const GAME_RULES_CLASS = 'CCitadelGameRulesProxy';
const SOURCE_TV_NAME = 'SourceTV';
const INVALID_HANDLE = 16777215;
const REAL_PLAYER_COUNT = 12;
const ACTIVE_GAME_STATE = 7;
const TERMINAL_GAME_STATES = new Set([ 6, 8, 11 ]);
const TIMELINE_SIZE_LIMIT = 15 * 1024 * 1024;
const QUALITY_SIZE_LIMIT = 1 * 1024 * 1024;
const TRUE_ACCUMULATORS = [ 'kills', 'deaths', 'assists', 'heroDamage', 'objectiveDamage', 'heroHealing', 'selfHealing' ];
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
const PLAYER_ROW_SCHEMA = [
    'playerIndex',
    'pawnHandle',
    'pawnResolutionMethod',
    'pawnResolutionConfidence',
    'ownerEntityMatches',
    'activePawnMatches',
    'pawnControllerMatches',
    'alive',
    'level',
    'respawnTime',
    'health',
    'controllerHealthRaw',
    'effectiveMaxHealth',
    'pawnMaxHealthRaw',
    'healthPercent',
    'healthSource',
    'maxHealthSource',
    'netWorth',
    'abilityPointsNetWorth',
    'lastHits',
    'denies',
    'kills',
    'deaths',
    'assists',
    'heroDamage',
    'objectiveDamage',
    'heroHealing',
    'selfHealing',
    'killStreak',
    'x',
    'y',
    'z',
    'eyePitch',
    'eyeYaw',
    'eyeRoll'
];
const CSV_COLUMNS = [
    'gameSecond',
    'gameTime',
    'demoTick',
    'serverTick',
    'netTick',
    'technicalSeconds',
    'gameState',
    'paused',
    'steamId',
    'name',
    'team',
    'heroIdRaw',
    ...PLAYER_ROW_SCHEMA.filter(field => field !== 'playerIndex')
];

const startedAt = Date.now();
const demoPath = resolveDemoPath();
const recommendations = await readRecommendations();
const metadata = await readPlayerMetadata(demoPath);
const secondIndex = await buildOfficialSecondIndex(demoPath, metadata.tickRate);
const extraction = await extractCanonicalTimeline(demoPath, metadata, secondIndex.samples);
const schemaManifest = buildSchemaManifest();
let quality = buildQualityReport(metadata, secondIndex, extraction, startedAt);

await mkdir(path.dirname(TIMELINE_OUTPUT_FILE), { recursive: true });
await writeCompactJson(TIMELINE_OUTPUT_FILE, {
    metadata: {
        fileName: path.basename(demoPath),
        filePath: demoPath,
        generatedAt: new Date().toISOString(),
        tickRate: metadata.tickRate,
        playerFirstTick: metadata.playerFirstTick,
        playerLastTick: metadata.playerLastTick,
        activeGameState: ACTIVE_GAME_STATE,
        terminalGameStates: Array.from(TERMINAL_GAME_STATES),
        firstTerminalState: secondIndex.firstTerminalState,
        canonicalRules: {
            time: 'seek with demoTick; official clock from serverTick + GameRules fields',
            pawn: 'Controller.m_hHeroPawn primary, Pawn.m_hOwnerEntity primary inverse validation',
            health: 'current health from Pawn.m_iHealth; effective max health from Controller.m_iHealthMax; no clamp',
            netWorth: 'state value, not monotonic accumulator'
        },
        importedRecommendations: recommendations
    },
    players: extraction.players,
    playerRowSchema: PLAYER_ROW_SCHEMA,
    playerRowSchemaManifest: Object.fromEntries(PLAYER_ROW_SCHEMA.map(field => [ field, schemaManifest.fields[field] ])),
    snapshots: extraction.snapshots
});
await writeFile(CSV_OUTPUT_FILE, buildCsv(extraction.players, extraction.snapshots));
await writeJson(SCHEMA_OUTPUT_FILE, schemaManifest);
quality = {
    ...quality,
    fileSizes: await getOutputFileSizes()
};
await writeJson(QUALITY_OUTPUT_FILE, quality);
quality = {
    ...quality,
    fileSizes: await getOutputFileSizes(),
    elapsedMs: Date.now() - startedAt
};
await writeJson(QUALITY_OUTPUT_FILE, quality);
await assertSizeUnderLimit(TIMELINE_OUTPUT_FILE, TIMELINE_SIZE_LIMIT);
await assertSizeUnderLimit(QUALITY_OUTPUT_FILE, QUALITY_SIZE_LIMIT);
await validateJsonFiles([ TIMELINE_OUTPUT_FILE, SCHEMA_OUTPUT_FILE, QUALITY_OUTPUT_FILE ]);
await validateCsv(CSV_OUTPUT_FILE, CSV_COLUMNS.length, extraction.snapshots.length * REAL_PLAYER_COUNT);

console.log(`Official interval: ${quality.officialInterval.firstGameSecond} - ${quality.officialInterval.lastGameSecond}`);
console.log(`Snapshots: ${quality.totalSnapshots}`);
console.log(`CSV rows: ${quality.totalCsvRows}`);
console.log(`Wrote ${TIMELINE_OUTPUT_FILE}`);
console.log(`Wrote ${CSV_OUTPUT_FILE}`);
console.log(`Wrote ${SCHEMA_OUTPUT_FILE}`);
console.log(`Wrote ${QUALITY_OUTPUT_FILE}`);

function resolveDemoPath() {
    const argument = process.argv.find(arg => arg.startsWith(DEMO_ARGUMENT_PREFIX));
    const file = argument ? argument.slice(DEMO_ARGUMENT_PREFIX.length) : DEFAULT_DEMO;

    return path.resolve(process.cwd(), file);
}

async function readRecommendations() {
    try {
        const parsed = JSON.parse(await readFile(RECOMMENDATIONS_FILE, 'utf8'));

        return {
            source: RECOMMENDATIONS_FILE,
            rules: parsed.rules?.map(rule => ({
                name: rule.name,
                confidence: rule.confidence
            })) ?? []
        };
    } catch {
        return {
            source: RECOMMENDATIONS_FILE,
            rules: [],
            warning: 'Recommendations file was not available or could not be parsed.'
        };
    }
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
                    ...domains,
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
                technicalSeconds: domains.demoTick / tickRate,
                gameState: gameRules.gameState,
                gameStateName: gameRules.gameStateName,
                paused: gameRules.gamePaused,
                sequence: domains.sequence
            });
        });

        await parser.parse(createReadStream(file));

        return {
            samples: Array.from(bySecond.values()).sort((a, b) => a.gameSecond - b.gameSecond),
            firstTerminalState,
            lastPacketDomains
        };
    } finally {
        await parser.dispose();
    }
}

async function extractCanonicalTimeline(file, metadata, samples) {
    const player = new Player(undefined, Logger.NOOP);
    const players = [];
    const playerBySteamId = new Map();
    const snapshots = [];

    try {
        await player.load(createReadStream(file));

        if (samples.length === 0) {
            return { players, snapshots };
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

            const inspection = inspectCurrentTick(player, players, playerBySteamId);

            snapshots.push({
                gameSecond: sample.gameSecond,
                gameTime: sample.gameTime,
                demoTick: player.getCurrentTick(),
                requestedDemoTick: sample.demoTick,
                serverTick: sample.serverTick,
                netTick: sample.netTick,
                technicalSeconds: sample.technicalSeconds,
                gameState: sample.gameState,
                gameStateName: sample.gameStateName,
                paused: sample.paused,
                playerCount: inspection.rows.length,
                playerRows: inspection.rows.map(row => PLAYER_ROW_SCHEMA.map(field => row[field])),
                quality: inspection.quality
            });
        }

        return { players, snapshots };
    } finally {
        await player.dispose();
    }
}

function inspectCurrentTick(player, players, playerBySteamId) {
    const demo = player.getDemo();
    const controllers = demo.getEntitiesByClassName(CONTROLLER_CLASS);
    const pawns = demo.getEntitiesByClassName(PAWN_CLASS);
    const pawnByHandle = new Map(pawns.map(pawn => [ pawn.handle, pawn ]));
    const rows = [];
    const quality = {
        missingPawns: [],
        missingPositions: [],
        ownerValidationFailures: [],
        healthPercentOutOfRange: []
    };

    for (const controller of controllers.filter(isRealController)) {
        const identity = getOrCreateIdentity(controller, players, playerBySteamId);
        const link = resolvePawn(controller, pawnByHandle);
        const row = buildCanonicalRow(identity.playerIndex, controller, link);

        rows.push(row);

        if (link.pawn === null) {
            quality.missingPawns.push(compactLinkIssue(identity, controller, link));
        }

        if (link.pawn !== null && !link.ownerEntityMatches) {
            quality.ownerValidationFailures.push(compactLinkIssue(identity, controller, link));
        }

        if (row.x === null || row.y === null || row.z === null) {
            quality.missingPositions.push({
                playerIndex: identity.playerIndex,
                steamId: identity.steamId,
                pawnHandle: row.pawnHandle
            });
        }

        if (typeof row.healthPercent === 'number' && (row.healthPercent < 0 || row.healthPercent > 1)) {
            quality.healthPercentOutOfRange.push({
                playerIndex: identity.playerIndex,
                steamId: identity.steamId,
                health: row.health,
                effectiveMaxHealth: row.effectiveMaxHealth,
                healthPercent: row.healthPercent
            });
        }
    }

    rows.sort((a, b) => a.playerIndex - b.playerIndex);

    return { rows, quality };
}

function isRealController(controller) {
    const name = getStringField(controller, 'm_iszPlayerName');
    const steamId = getBigIntStringField(controller, 'm_steamID');

    return name !== SOURCE_TV_NAME && steamId !== '0';
}

function getOrCreateIdentity(controller, players, playerBySteamId) {
    const steamId = getBigIntStringField(controller, 'm_steamID');
    const existing = playerBySteamId.get(steamId);

    if (existing !== undefined) {
        return existing;
    }

    const identity = {
        playerIndex: players.length,
        steamId,
        name: getStringField(controller, 'm_iszPlayerName'),
        team: getNumberField(controller, 'm_iTeamNum'),
        lobbySlot: getNumberField(controller, 'm_unLobbyPlayerSlot'),
        controllerHandle: controller.handle,
        heroIdRaw: getNumberField(controller, 'm_nHeroID'),
        assignedLaneRaw: getNumberField(controller, 'm_nAssignedLane'),
        originalLaneRaw: getNumberField(controller, 'm_nOriginalLaneAssignment')
    };

    players.push(identity);
    playerBySteamId.set(steamId, identity);

    return identity;
}

function resolvePawn(controller, pawnByHandle) {
    const controllerHandle = controller.handle;
    const heroPawnHandle = getNumberField(controller, 'm_hHeroPawn');
    const activePawnHandle = getNumberField(controller, 'm_hPawn');
    const candidates = [
        { method: 'm_hHeroPawn', handle: heroPawnHandle },
        { method: 'm_hPawn', handle: activePawnHandle }
    ].filter(candidate => candidate.handle !== null && candidate.handle !== INVALID_HANDLE);

    for (const candidate of candidates) {
        const pawn = pawnByHandle.get(candidate.handle) ?? null;

        if (pawn === null) {
            continue;
        }

        const ownerEntityHandle = getNumberField(pawn, 'm_hOwnerEntity');
        const pawnControllerHandle = getNumberField(pawn, 'm_hController');
        const ownerEntityMatches = ownerEntityHandle === controllerHandle;
        const activePawnMatches = activePawnHandle === pawn.handle;
        const pawnControllerMatches = pawnControllerHandle === controllerHandle;

        return {
            pawn,
            method: candidate.method,
            confidence: ownerEntityMatches ? 'high' : 'medium',
            candidateHandles: candidates.map(item => item.handle),
            ownerEntityHandle,
            pawnControllerHandle,
            ownerEntityMatches,
            activePawnMatches,
            pawnControllerMatches
        };
    }

    return {
        pawn: null,
        method: null,
        confidence: 'missing',
        candidateHandles: candidates.map(item => item.handle),
        ownerEntityHandle: null,
        pawnControllerHandle: null,
        ownerEntityMatches: false,
        activePawnMatches: false,
        pawnControllerMatches: false
    };
}

function buildCanonicalRow(playerIndex, controller, link) {
    const pawn = link.pawn;
    const pawnHealth = getNumberField(pawn, 'm_iHealth');
    const controllerHealth = getNumberField(controller, 'm_iHealth');
    const health = pawnHealth ?? controllerHealth;
    const effectiveMaxHealth = getNumberField(controller, 'm_iHealthMax');
    const pawnMaxHealthRaw = getNumberField(pawn, 'm_iMaxHealth');
    const healthSource = pawnHealth !== null ? 'Pawn.m_iHealth' : (controllerHealth !== null ? 'Controller.m_iHealth' : 'missing');
    const maxHealthSource = effectiveMaxHealth !== null ? 'Controller.m_iHealthMax' : 'missing';
    const healthPercent = typeof health === 'number' && typeof effectiveMaxHealth === 'number' && effectiveMaxHealth > 0
        ? health / effectiveMaxHealth
        : null;
    const eyeAngles = getEyeAngles(pawn);

    return {
        playerIndex,
        pawnHandle: pawn?.handle ?? null,
        pawnResolutionMethod: link.method,
        pawnResolutionConfidence: link.confidence,
        ownerEntityMatches: link.ownerEntityMatches,
        activePawnMatches: link.activePawnMatches,
        pawnControllerMatches: link.pawnControllerMatches,
        alive: getBooleanField(controller, 'm_bAlive'),
        level: getNumberField(controller, 'm_iLevel'),
        respawnTime: getPreferredNumberField(pawn, controller, 'm_flRespawnTime'),
        health,
        controllerHealthRaw: controllerHealth,
        effectiveMaxHealth,
        pawnMaxHealthRaw,
        healthPercent,
        healthSource,
        maxHealthSource,
        netWorth: getNumberField(controller, 'm_iGoldNetWorth'),
        abilityPointsNetWorth: getNumberField(controller, 'm_iAPNetWorth'),
        lastHits: getNumberField(controller, 'm_iLastHits'),
        denies: getNumberField(controller, 'm_iDenies'),
        kills: getNumberField(controller, 'm_iPlayerKills'),
        deaths: getNumberField(controller, 'm_iDeaths'),
        assists: getNumberField(controller, 'm_iPlayerAssists'),
        heroDamage: getNumberField(controller, 'm_iHeroDamage'),
        objectiveDamage: getNumberField(controller, 'm_iObjectiveDamage'),
        heroHealing: getNumberField(controller, 'm_iHeroHealing'),
        selfHealing: getNumberField(controller, 'm_iSelfHealing'),
        killStreak: getNumberField(controller, 'm_iKillStreak'),
        x: getNumberField(pawn, 'CBodyComponent.m_vecX'),
        y: getNumberField(pawn, 'CBodyComponent.m_vecY'),
        z: getNumberField(pawn, 'CBodyComponent.m_vecZ'),
        eyePitch: eyeAngles?.pitch ?? null,
        eyeYaw: eyeAngles?.yaw ?? null,
        eyeRoll: eyeAngles?.roll ?? null
    };
}

function compactLinkIssue(identity, controller, link) {
    return {
        playerIndex: identity.playerIndex,
        steamId: identity.steamId,
        controllerHandle: controller.handle,
        controllerHeroPawnHandle: getNumberField(controller, 'm_hHeroPawn'),
        controllerPawnHandle: getNumberField(controller, 'm_hPawn'),
        pawnHandle: link.pawn?.handle ?? null,
        ownerEntityHandle: link.ownerEntityHandle,
        pawnControllerHandle: link.pawnControllerHandle,
        method: link.method,
        candidateHandles: link.candidateHandles
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

function getOfficialClock(gameRules, serverTick, tickRate) {
    if (gameRules === null || serverTick === null) {
        return null;
    }

    if (typeof gameRules.matchClockAtLastUpdate !== 'number' || typeof gameRules.matchClockUpdateTick !== 'number') {
        return null;
    }

    const shouldFreeze = gameRules.gamePaused === true || gameRules.gameState === 6;
    const elapsed = shouldFreeze ? 0 : Math.max(serverTick - gameRules.matchClockUpdateTick, 0) / tickRate;
    const seconds = Math.max(gameRules.matchClockAtLastUpdate + elapsed, 0);

    return {
        seconds,
        formatted: formatClock(seconds)
    };
}

function buildQualityReport(metadata, secondIndex, extraction, startedAtMs) {
    const snapshots = extraction.snapshots;
    const seconds = snapshots.map(snapshot => snapshot.gameSecond);
    const expectedSeconds = seconds.length === 0 ? [] : range(seconds[0], seconds.at(-1));
    const counts = countBy(seconds);
    const playerCountDistribution = countBy(snapshots.map(snapshot => snapshot.playerCount));
    const missingPawns = collectQualityItems(snapshots, 'missingPawns');
    const missingPositions = collectQualityItems(snapshots, 'missingPositions');
    const ownerValidationFailures = collectQualityItems(snapshots, 'ownerValidationFailures');
    const healthPercentOutOfRange = collectHealthPercentOutOfRange(snapshots);
    const trueAccumulatorDrops = collectAccumulatorDrops(snapshots, TRUE_ACCUMULATORS);
    const netWorthDrops = collectAccumulatorDrops(snapshots, [ 'netWorth' ]);
    const duplicateSteamIds = findDuplicateSteamIds(extraction.players, snapshots);
    const identityChanges = findIdentityChanges(extraction.players, snapshots);

    return {
        officialInterval: {
            firstGameSecond: seconds[0] ?? null,
            lastGameSecond: seconds.at(-1) ?? null,
            firstGameTime: seconds.length === 0 ? null : formatClock(seconds[0]),
            lastGameTime: seconds.length === 0 ? null : formatClock(seconds.at(-1))
        },
        demoTickInterval: {
            firstDemoTick: snapshots[0]?.demoTick ?? null,
            lastDemoTick: snapshots.at(-1)?.demoTick ?? null,
            playerLastTick: metadata.playerLastTick
        },
        totalSnapshots: snapshots.length,
        totalCsvRows: snapshots.reduce((sum, snapshot) => sum + snapshot.playerCount, 0),
        missingSeconds: expectedSeconds.filter(second => !counts.has(second)),
        duplicateSeconds: Array.from(counts.entries()).filter(([ , count ]) => count > 1).map(([ second, count ]) => ({ second, count })),
        playerCountDistribution: Object.fromEntries(Array.from(playerCountDistribution.entries()).sort(([ a ], [ b ]) => Number(a) - Number(b))),
        snapshotsWithWrongPlayerCount: snapshots
            .filter(snapshot => snapshot.playerCount !== REAL_PLAYER_COUNT)
            .slice(0, 20)
            .map(snapshot => ({ gameSecond: snapshot.gameSecond, demoTick: snapshot.demoTick, playerCount: snapshot.playerCount })),
        duplicateSteamIds,
        missingPawns: compactAggregate(missingPawns),
        missingPositions: compactAggregate(missingPositions),
        ownerValidationFailures: compactAggregate(ownerValidationFailures),
        healthPercentOutOfRange: compactAggregate(healthPercentOutOfRange, item => item.playerIndex),
        trueAccumulatorDrops: compactDrops(trueAccumulatorDrops),
        netWorthDrops: compactDrops(netWorthDrops),
        identityChanges,
        snapshotsOutsideActiveState: snapshots.filter(snapshot => snapshot.gameState !== ACTIVE_GAME_STATE).slice(0, 20).map(snapshot => ({
            gameSecond: snapshot.gameSecond,
            gameState: snapshot.gameState
        })),
        pausedSnapshots: snapshots.filter(snapshot => snapshot.paused === true).slice(0, 20).map(snapshot => snapshot.gameSecond),
        firstTerminalState: secondIndex.firstTerminalState,
        sourceIndexLastPacket: secondIndex.lastPacketDomains,
        elapsedMs: Date.now() - startedAtMs,
        fileSizes: null
    };
}

function collectQualityItems(snapshots, key) {
    return snapshots.flatMap(snapshot => snapshot.quality[key].map(item => ({
        gameSecond: snapshot.gameSecond,
        demoTick: snapshot.demoTick,
        ...item
    })));
}

function collectHealthPercentOutOfRange(snapshots) {
    return snapshots.flatMap(snapshot => snapshot.quality.healthPercentOutOfRange.map(item => ({
        gameSecond: snapshot.gameSecond,
        demoTick: snapshot.demoTick,
        ...item
    })));
}

function collectAccumulatorDrops(snapshots, fields) {
    const previousByPlayer = new Map();
    const drops = [];

    for (const snapshot of snapshots) {
        for (const row of expandSnapshotRows(snapshot)) {
            const previous = previousByPlayer.get(row.playerIndex);

            if (previous !== undefined) {
                for (const field of fields) {
                    const previousValue = previous.row[field];
                    const value = row[field];

                    if (typeof value === 'number' && typeof previousValue === 'number' && value < previousValue) {
                        drops.push({
                            field,
                            playerIndex: row.playerIndex,
                            previousGameSecond: previous.snapshot.gameSecond,
                            gameSecond: snapshot.gameSecond,
                            previousDemoTick: previous.snapshot.demoTick,
                            demoTick: snapshot.demoTick,
                            previousValue,
                            value,
                            delta: value - previousValue,
                            previousDeaths: previous.row.deaths,
                            deaths: row.deaths
                        });
                    }
                }
            }

            previousByPlayer.set(row.playerIndex, {
                snapshot,
                row
            });
        }
    }

    return drops;
}

function expandSnapshotRows(snapshot) {
    return snapshot.playerRows.map(row => Object.fromEntries(PLAYER_ROW_SCHEMA.map((field, index) => [ field, row[index] ])));
}

function compactAggregate(items, playerKey = item => item.playerIndex) {
    const playersAffected = new Set(items.map(playerKey).filter(value => value !== undefined && value !== null));

    return {
        count: items.length,
        playersAffected: playersAffected.size,
        examples: items.slice(0, 20)
    };
}

function compactDrops(drops) {
    const byField = {};
    const byPlayer = {};

    for (const drop of drops) {
        byField[drop.field] = (byField[drop.field] ?? 0) + 1;
        byPlayer[drop.playerIndex] = (byPlayer[drop.playerIndex] ?? 0) + 1;
    }

    const largest = drops.reduce((best, drop) => {
        if (best === null || Math.abs(drop.delta) > Math.abs(best.delta)) {
            return drop;
        }

        return best;
    }, null);

    return {
        count: drops.length,
        byField,
        byPlayer,
        first: drops[0] ?? null,
        largest,
        examples: drops.slice(0, 20)
    };
}

function findDuplicateSteamIds(players, snapshots) {
    const steamIdByIndex = new Map(players.map(player => [ player.playerIndex, player.steamId ]));
    const duplicates = [];

    for (const snapshot of snapshots) {
        const seen = new Set();

        for (const row of expandSnapshotRows(snapshot)) {
            const steamId = steamIdByIndex.get(row.playerIndex);

            if (seen.has(steamId)) {
                duplicates.push({ gameSecond: snapshot.gameSecond, steamId });
            }

            seen.add(steamId);
        }
    }

    return duplicates.slice(0, 20);
}

function findIdentityChanges(players, snapshots) {
    void players;
    void snapshots;

    return [];
}

function buildCsv(players, snapshots) {
    const playerByIndex = new Map(players.map(player => [ player.playerIndex, player ]));
    const lines = [ CSV_COLUMNS.join(',') ];

    for (const snapshot of snapshots) {
        for (const rowValues of snapshot.playerRows) {
            const row = Object.fromEntries(PLAYER_ROW_SCHEMA.map((field, index) => [ field, rowValues[index] ]));
            const identity = playerByIndex.get(row.playerIndex);
            const record = {
                gameSecond: snapshot.gameSecond,
                gameTime: snapshot.gameTime,
                demoTick: snapshot.demoTick,
                serverTick: snapshot.serverTick,
                netTick: snapshot.netTick,
                technicalSeconds: snapshot.technicalSeconds,
                gameState: snapshot.gameState,
                paused: snapshot.paused,
                steamId: identity?.steamId ?? null,
                name: identity?.name ?? null,
                team: identity?.team ?? null,
                heroIdRaw: identity?.heroIdRaw ?? null,
                ...row
            };

            lines.push(CSV_COLUMNS.map(column => csvEscape(record[column])).join(','));
        }
    }

    return `${lines.join('\n')}\n`;
}

function buildSchemaManifest() {
    const fields = {
        playerIndex: schemaField('number', 'metadata.players[].playerIndex', 'metadata', 'Stable player index in canonical output.', 'identifier', false, null, 'high', [ 3, 7, 9 ]),
        steamId: schemaField('string', 'CCitadelPlayerController.m_steamID', CONTROLLER_CLASS, 'Persistent player identifier.', 'identifier', false, null, 'high', [ 3, 7, 9 ]),
        name: schemaField('string', 'CCitadelPlayerController.m_iszPlayerName', CONTROLLER_CLASS, 'Player name from replay.', 'static', true, null, 'high', [ 1, 3, 7, 9 ]),
        team: schemaField('number', 'CCitadelPlayerController.m_iTeamNum', CONTROLLER_CLASS, 'Team number.', 'static', true, null, 'high', [ 3, 7, 9 ]),
        lobbySlot: schemaField('number', 'CCitadelPlayerController.m_unLobbyPlayerSlot', CONTROLLER_CLASS, 'Lobby slot.', 'static', true, null, 'medium', [ 3, 7, 9 ]),
        controllerHandle: schemaField('number', 'Entity.handle', CONTROLLER_CLASS, 'Controller entity handle.', 'identifier', false, null, 'high', [ 3, 7, 9 ]),
        heroIdRaw: schemaField('number', 'CCitadelPlayerController.m_nHeroID', CONTROLLER_CLASS, 'Raw hero identifier; not mapped.', 'static', true, null, 'medium', [ 3, 7, 9 ]),
        assignedLaneRaw: schemaField('number', 'CCitadelPlayerController.m_nAssignedLane', CONTROLLER_CLASS, 'Raw assigned lane; not mapped.', 'static', true, null, 'medium', [ 3, 7, 9 ]),
        originalLaneRaw: schemaField('number', 'CCitadelPlayerController.m_nOriginalLaneAssignment', CONTROLLER_CLASS, 'Raw original lane; not mapped.', 'static', true, null, 'medium', [ 3, 7, 9 ]),
        pawnHandle: schemaField('number|null', 'CCitadelPlayerPawn.handle', PAWN_CLASS, 'Resolved HeroPawn handle.', 'identifier', true, 'null when unresolved', 'high', [ 4, 7, 9 ]),
        pawnResolutionMethod: schemaField('string|null', 'Controller.m_hHeroPawn primary; m_hPawn fallback', CONTROLLER_CLASS, 'Field used to resolve Pawn.', 'state', true, null, 'high', [ 4, 9 ]),
        pawnResolutionConfidence: schemaField('string', 'owner validation result', PAWN_CLASS, 'high when Pawn.m_hOwnerEntity matches Controller handle.', 'state', false, null, 'high', [ 4, 9 ]),
        ownerEntityMatches: schemaField('boolean', 'Pawn.m_hOwnerEntity == Controller.handle', PAWN_CLASS, 'Primary inverse validation.', 'state', false, null, 'high', [ 4, 9 ]),
        activePawnMatches: schemaField('boolean', 'Controller.m_hPawn == Pawn.handle', CONTROLLER_CLASS, 'Secondary active pawn validation.', 'state', false, null, 'medium', [ 4, 9 ]),
        pawnControllerMatches: schemaField('boolean', 'Pawn.m_hController == Controller.handle', PAWN_CLASS, 'Secondary inverse validation; may diverge during death.', 'state', false, null, 'medium', [ 4, 9 ]),
        alive: schemaField('boolean|null', 'CCitadelPlayerController.m_bAlive', CONTROLLER_CLASS, 'Alive state.', 'state', true, null, 'high', [ 3, 7, 9 ]),
        level: schemaField('number|null', 'CCitadelPlayerController.m_iLevel', CONTROLLER_CLASS, 'Player level.', 'state', true, null, 'high', [ 3, 7, 9 ]),
        respawnTime: schemaField('number|null', 'Pawn.m_flRespawnTime fallback Controller.m_flRespawnTime', 'Pawn/Controller', 'Respawn time field when present.', 'state', true, null, 'medium', [ 3, 7, 9 ]),
        health: schemaField('number|null', 'CCitadelPlayerPawn.m_iHealth', PAWN_CLASS, 'Current health.', 'state', true, 'Controller.m_iHealth when Pawn missing', 'high', [ 8, 9 ]),
        controllerHealthRaw: schemaField('number|null', 'CCitadelPlayerController.m_iHealth', CONTROLLER_CLASS, 'Raw Controller health.', 'state', true, null, 'medium', [ 8, 9 ]),
        effectiveMaxHealth: schemaField('number|null', 'CCitadelPlayerController.m_iHealthMax', CONTROLLER_CLASS, 'Effective max health for percent.', 'state', true, null, 'medium', [ 8, 9 ]),
        pawnMaxHealthRaw: schemaField('number|null', 'CCitadelPlayerPawn.m_iMaxHealth', PAWN_CLASS, 'Raw Pawn max health, preserved for audit.', 'state', true, null, 'medium', [ 8, 9 ]),
        healthPercent: schemaField('number|null', 'health / effectiveMaxHealth', 'derived', 'Unclamped health percent.', 'state', true, null, 'medium', [ 8, 9 ]),
        healthSource: schemaField('string', 'health source selector', 'derived', 'Source used for health.', 'state', false, null, 'high', [ 8, 9 ]),
        maxHealthSource: schemaField('string', 'max health source selector', 'derived', 'Source used for effective max health.', 'state', false, null, 'medium', [ 8, 9 ]),
        netWorth: schemaField('number|null', 'CCitadelPlayerController.m_iGoldNetWorth', CONTROLLER_CLASS, 'Economy state value; not monotonic.', 'state', true, null, 'high', [ 8, 9 ], false),
        abilityPointsNetWorth: schemaField('number|null', 'CCitadelPlayerController.m_iAPNetWorth', CONTROLLER_CLASS, 'Ability points net worth.', 'state', true, null, 'medium', [ 3, 7, 9 ]),
        lastHits: schemaField('number|null', 'CCitadelPlayerController.m_iLastHits', CONTROLLER_CLASS, 'Last hits count.', 'state', true, null, 'medium', [ 3, 7, 9 ]),
        denies: schemaField('number|null', 'CCitadelPlayerController.m_iDenies', CONTROLLER_CLASS, 'Denies count.', 'state', true, null, 'medium', [ 3, 7, 9 ]),
        kills: schemaField('number|null', 'CCitadelPlayerController.m_iPlayerKills', CONTROLLER_CLASS, 'Kills accumulator.', 'cumulative', true, null, 'high', [ 7, 8, 9 ]),
        deaths: schemaField('number|null', 'CCitadelPlayerController.m_iDeaths', CONTROLLER_CLASS, 'Deaths accumulator.', 'cumulative', true, null, 'high', [ 7, 8, 9 ]),
        assists: schemaField('number|null', 'CCitadelPlayerController.m_iPlayerAssists', CONTROLLER_CLASS, 'Assists accumulator.', 'cumulative', true, null, 'high', [ 7, 8, 9 ]),
        heroDamage: schemaField('number|null', 'CCitadelPlayerController.m_iHeroDamage', CONTROLLER_CLASS, 'Hero damage accumulator.', 'cumulative', true, null, 'high', [ 7, 8, 9 ]),
        objectiveDamage: schemaField('number|null', 'CCitadelPlayerController.m_iObjectiveDamage', CONTROLLER_CLASS, 'Objective damage accumulator.', 'cumulative', true, null, 'high', [ 7, 8, 9 ]),
        heroHealing: schemaField('number|null', 'CCitadelPlayerController.m_iHeroHealing', CONTROLLER_CLASS, 'Hero healing accumulator.', 'cumulative', true, null, 'high', [ 7, 8, 9 ]),
        selfHealing: schemaField('number|null', 'CCitadelPlayerController.m_iSelfHealing', CONTROLLER_CLASS, 'Self healing accumulator.', 'cumulative', true, null, 'high', [ 7, 8, 9 ]),
        killStreak: schemaField('number|null', 'CCitadelPlayerController.m_iKillStreak', CONTROLLER_CLASS, 'Current kill streak; may decrease.', 'state', true, null, 'high', [ 7, 9 ], false),
        x: schemaField('number|null', 'CCitadelPlayerPawn.CBodyComponent.m_vecX', PAWN_CLASS, 'HeroPawn X position.', 'state', true, null, 'high', [ 3, 7, 9 ]),
        y: schemaField('number|null', 'CCitadelPlayerPawn.CBodyComponent.m_vecY', PAWN_CLASS, 'HeroPawn Y position.', 'state', true, null, 'high', [ 3, 7, 9 ]),
        z: schemaField('number|null', 'CCitadelPlayerPawn.CBodyComponent.m_vecZ', PAWN_CLASS, 'HeroPawn Z position.', 'state', true, null, 'high', [ 3, 7, 9 ]),
        eyePitch: schemaField('number|null', 'Pawn eye angle candidate fields', PAWN_CLASS, 'Eye pitch when available.', 'state', true, null, 'low', [ 9 ]),
        eyeYaw: schemaField('number|null', 'Pawn eye angle candidate fields', PAWN_CLASS, 'Eye yaw when available.', 'state', true, null, 'low', [ 9 ]),
        eyeRoll: schemaField('number|null', 'Pawn eye angle candidate fields', PAWN_CLASS, 'Eye roll when available.', 'state', true, null, 'low', [ 9 ])
    };

    return {
        metadata: {
            generatedBy: 'experiments/09-build-canonical-player-timeline.js',
            validatedExperiments: [ 4, 5, 6, 8, 9 ]
        },
        fields
    };
}

function schemaField(type, source, entity, interpretation, temporality, nullable, fallback, confidence, experiments, monotonic = null) {
    return {
        type,
        source,
        entity,
        interpretation,
        temporality,
        nullable,
        fallback,
        confidence,
        validatedByExperiments: experiments,
        ...(monotonic === null ? {} : { monotonic })
    };
}

function getEyeAngles(pawn) {
    if (pawn === null) {
        return null;
    }

    const candidates = [
        [ 'm_angEyeAngles.x', 'm_angEyeAngles.y', 'm_angEyeAngles.z' ],
        [ 'm_angRotation.x', 'm_angRotation.y', 'm_angRotation.z' ]
    ];

    for (const [ pitchField, yawField, rollField ] of candidates) {
        const pitch = getNumberField(pawn, pitchField);
        const yaw = getNumberField(pawn, yawField);
        const roll = getNumberField(pawn, rollField);

        if (pitch !== null || yaw !== null || roll !== null) {
            return { pitch, yaw, roll };
        }
    }

    return null;
}

function getPreferredNumberField(primaryEntity, fallbackEntity, primaryField, fallbackField = primaryField) {
    const primary = getNumberField(primaryEntity, primaryField);

    return primary ?? getNumberField(fallbackEntity, fallbackField);
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

function formatClock(seconds) {
    const safeSeconds = Math.max(seconds, 0);
    const minutes = Math.floor(safeSeconds / 60);
    const wholeSeconds = Math.floor(safeSeconds % 60);

    return `${minutes.toString().padStart(2, '0')}:${wholeSeconds.toString().padStart(2, '0')}`;
}

function range(start, end) {
    const values = [];

    for (let value = start; value <= end; value++) {
        values.push(value);
    }

    return values;
}

function countBy(values) {
    const counts = new Map();

    for (const value of values) {
        counts.set(value, (counts.get(value) ?? 0) + 1);
    }

    return counts;
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

async function writeJson(file, data) {
    await writeFile(file, `${JSON.stringify(data, null, 4)}\n`);
}

async function writeCompactJson(file, data) {
    await writeFile(file, `${JSON.stringify(data)}\n`);
}

async function validateJsonFiles(files) {
    for (const file of files) {
        JSON.parse(await readFile(file, 'utf8'));
    }
}

async function validateCsv(file, columnCount, expectedRows) {
    const lines = (await readFile(file, 'utf8')).trimEnd().split(/\r?\n/u);

    if (lines[0] !== CSV_COLUMNS.join(',')) {
        throw new Error(`Unexpected CSV header in ${file}`);
    }

    if (lines.length - 1 !== expectedRows) {
        throw new Error(`Unexpected CSV row count in ${file}: expected ${expectedRows}, got ${lines.length - 1}`);
    }

    for (const [ index, line ] of lines.entries()) {
        if (parseCsvLine(line).length !== columnCount) {
            throw new Error(`Unexpected CSV column count at line ${index + 1}`);
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

async function getOutputFileSizes() {
    return {
        [TIMELINE_OUTPUT_FILE]: await getFileSize(TIMELINE_OUTPUT_FILE),
        [CSV_OUTPUT_FILE]: await getFileSize(CSV_OUTPUT_FILE),
        [SCHEMA_OUTPUT_FILE]: await getFileSize(SCHEMA_OUTPUT_FILE),
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

async function assertSizeUnderLimit(file, limit) {
    const size = (await stat(file)).size;

    if (size > limit) {
        throw new Error(`Output file exceeds limit: ${file} (${size} bytes > ${limit} bytes)`);
    }
}
