import { createReadStream } from 'node:fs';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { InterceptorStage, Logger, MessagePacketType, Parser, Player } from 'deadem';

const DEMO_ARGUMENT_PREFIX = '--demo=';
const DEFAULT_DEMO = './samples/partida_001.dem';
const COMPARISON_OUTPUT_FILE = './output/06-tick-domain-comparison.json';
const SUMMARY_OUTPUT_FILE = './output/06-tick-domain-summary.json';
const GAME_RULES_CLASS_NAME = 'CCitadelGameRulesProxy';
const OUTPUT_SIZE_LIMIT = 2 * 1024 * 1024;
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
const PLAYER_SEEK_TICKS = [
    191431,
    191432,
    195526,
    196167
];
const SAMPLE_TARGETS = [
    { label: 'near beginning', domain: 'demoTick', tick: 1 },
    { label: 'around demo tick 191000', domain: 'demoTick', tick: 191000 },
    { label: 'at Player.getLastTick()', domain: 'demoTick', tick: 191431 },
    { label: 'around server tick 195526', domain: 'serverTick', tick: 195526 },
    { label: 'around server tick 196167', domain: 'serverTick', tick: 196167 }
];

class RollingBuffer {
    constructor(limit) {
        this._limit = limit;
        this._items = [];
    }

    push(item) {
        this._items.push(item);

        if (this._items.length > this._limit) {
            this._items.shift();
        }
    }

    toArray() {
        return [ ...this._items ];
    }
}

const demoPath = resolveDemoPath();
const playerFindings = await collectPlayerFindings(demoPath);
const parserFindings = await collectParserFindings(demoPath, playerFindings.tickRate);
const relation = inferRelation(playerFindings, parserFindings);
const comparison = {
    metadata: {
        fileName: path.basename(demoPath),
        filePath: demoPath,
        tickRate: playerFindings.tickRate
    },
    codeReview: buildCodeReview(),
    domainDefinitions: buildDomainDefinitions(),
    player: playerFindings,
    parser: parserFindings,
    relation
};
const summary = buildSummary(playerFindings, parserFindings, relation);

await mkdir(path.dirname(COMPARISON_OUTPUT_FILE), { recursive: true });
await writeJson(COMPARISON_OUTPUT_FILE, comparison);
await writeJson(SUMMARY_OUTPUT_FILE, summary);
await assertSizeUnderLimit(COMPARISON_OUTPUT_FILE);
await assertSizeUnderLimit(SUMMARY_OUTPUT_FILE);

console.log(`Wrote ${COMPARISON_OUTPUT_FILE}`);
console.log(`Wrote ${SUMMARY_OUTPUT_FILE}`);

function resolveDemoPath() {
    const argument = process.argv.find(arg => arg.startsWith(DEMO_ARGUMENT_PREFIX));
    const file = argument ? argument.slice(DEMO_ARGUMENT_PREFIX.length) : DEFAULT_DEMO;

    return path.resolve(process.cwd(), file);
}

async function collectPlayerFindings(file) {
    const player = new Player(undefined, Logger.NOOP);
    let lastSeenPacket = null;

    player.registerPreInterceptor(InterceptorStage.DEMO_PACKET, (demoPacket) => {
        lastSeenPacket = getPacketDomains(demoPacket);
    });

    try {
        await player.load(createReadStream(file));

        const tickRate = player.getDemo().server?.tickRate ?? null;

        if (tickRate === null) {
            throw new Error('Unable to determine replay tick rate from demo.server.tickRate');
        }

        const metadata = {
            firstTick: player.getFirstTick(),
            lastTick: player.getLastTick(),
            currentTickAfterLoad: player.getCurrentTick(),
            tickRate
        };
        const seekResults = [];

        for (const requestedTick of PLAYER_SEEK_TICKS) {
            lastSeenPacket = null;

            seekResults.push(await seekAndCapture(player, requestedTick, () => lastSeenPacket));
        }

        return {
            ...metadata,
            seekResults
        };
    } finally {
        await player.dispose();
    }
}

async function seekAndCapture(player, requestedTick, getLastSeenPacket) {
    const result = {
        requestedTick,
        threw: false,
        error: null,
        currentTickAfterSeek: null,
        lastSeenPacket: null,
        gameRules: null,
        calculatedClock: null
    };

    try {
        await player.seekToTick(requestedTick);
    } catch (error) {
        result.threw = true;
        result.error = {
            name: error.name,
            message: error.message
        };
    }

    result.currentTickAfterSeek = player.getCurrentTick();
    result.lastSeenPacket = getLastSeenPacket();
    result.gameRules = getGameRulesState(player.getDemo());
    result.calculatedClock = getOfficialClock(result.gameRules, result.lastSeenPacket?.serverTick, player.getDemo().server.tickRate);

    return result;
}

async function collectParserFindings(file, tickRate) {
    const parser = new Parser(undefined, Logger.NOOP);
    const samples = [];
    const changesAfter190000 = [];
    const finalEvents = new RollingBuffer(20);
    const lastByTarget = new Map();
    let previousRelevantState = null;
    let lastPacket = null;
    let lastParserDemoTick = null;
    let lastServerTick = null;
    let lastNetTick = null;
    let lastMatchClockUpdateTick = null;
    let lastValidOfficialClock = null;
    let lastValidOfficialClockRecord = null;
    let lastActiveGameTick = null;
    let postGameStart = null;
    let endingStateStart = null;

    try {
        parser.registerPostInterceptor(InterceptorStage.DEMO_PACKET, (demoPacket) => {
            const domains = getPacketDomains(demoPacket);
            const gameRules = getGameRulesState(parser.getDemo());
            const clock = getOfficialClock(gameRules, domains.serverTick, tickRate);
            const record = {
                ...domains,
                gameRules,
                calculatedClock: clock
            };

            lastPacket = record;
            lastParserDemoTick = domains.demoTick;
            lastServerTick = domains.serverTick ?? lastServerTick;
            lastNetTick = domains.netTick ?? lastNetTick;
            lastMatchClockUpdateTick = gameRules?.matchClockUpdateTick ?? lastMatchClockUpdateTick;

            if (clock !== null) {
                lastValidOfficialClock = clock;
                lastValidOfficialClockRecord = compactRecord(record);
            }

            if (gameRules?.gameState === 7 && domains.serverTick !== null) {
                lastActiveGameTick = domains.serverTick;
            }

            captureSamples(record, samples, lastByTarget);
            collectRelevantChanges(record, changesAfter190000, previousRelevantState);
            previousRelevantState = getRelevantState(record);

            if (postGameStart === null && [ 6, 8, 11 ].includes(gameRules?.gameState)) {
                postGameStart = compactRecord(record);
            }

            if (endingStateStart === null && [ 8, 11 ].includes(gameRules?.gameState)) {
                endingStateStart = compactRecord(record);
            }

            finalEvents.push(compactRecord(record));
        });

        await parser.parse(createReadStream(file));

        return {
            simultaneousSamples: samples,
            changesAfter190000,
            finalEvents: finalEvents.toArray(),
            lastPacket: compactRecord(lastPacket),
            lastParserDemoTick,
            lastServerTick,
            lastNetTick,
            lastMatchClockUpdateTick,
            lastValidOfficialClock,
            lastValidOfficialClockRecord,
            lastActiveGameTick,
            postGameStart,
            endingStateStart
        };
    } finally {
        await parser.dispose();
    }
}

function captureSamples(record, samples, lastByTarget) {
    for (const target of SAMPLE_TARGETS) {
        if (lastByTarget.has(target.label)) {
            continue;
        }

        const observedTick = target.domain === 'serverTick' ? record.serverTick : record.demoTick;

        if (observedTick !== null && observedTick >= target.tick) {
            const sample = compactRecord(record);

            sample.label = target.label;
            sample.requestedDomain = target.domain;
            sample.requestedTick = target.tick;
            samples.push(sample);
            lastByTarget.set(target.label, sample);
        }
    }
}

function collectRelevantChanges(record, changes, previousRelevantState) {
    if (record.serverTick === null || record.serverTick < 190000 || previousRelevantState === null) {
        return;
    }

    const current = getRelevantState(record);
    const changedFields = [];

    for (const [ field, value ] of Object.entries(current)) {
        if (previousRelevantState[field] !== value) {
            changedFields.push({
                field,
                previousValue: previousRelevantState[field],
                newValue: value
            });
        }
    }

    if (changedFields.length === 0) {
        return;
    }

    changes.push({
        ...compactRecord(record),
        changedFields
    });
}

function getRelevantState(record) {
    return {
        gameState: record.gameRules?.gameState ?? null,
        gamePaused: record.gameRules?.gamePaused ?? null,
        matchClockUpdateTick: record.gameRules?.matchClockUpdateTick ?? null,
        matchClockAtLastUpdate: record.gameRules?.matchClockAtLastUpdate ?? null
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
        serverTick: normalizeValue(packetEntities?.data?.serverTick ?? null),
        messageTypes: summarizeMessageTypes(messagePackets)
    };
}

function summarizeMessageTypes(messagePackets) {
    const counts = new Map();

    for (const messagePacket of messagePackets) {
        const code = messagePacket.type?.code ?? `id:${messagePacket.type?.id ?? 'unknown'}`;

        counts.set(code, (counts.get(code) ?? 0) + 1);
    }

    return Object.fromEntries(Array.from(counts.entries()).sort(([ a ], [ b ]) => a.localeCompare(b)));
}

function getGameRulesState(demo) {
    const entity = demo.getEntitiesByClassName(GAME_RULES_CLASS_NAME)[0] || null;

    if (entity === null) {
        return null;
    }

    const gameState = normalizeValue(entity.getField('m_pGameRules.m_eGameState') ?? null);

    return {
        className: GAME_RULES_CLASS_NAME,
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

    const shouldFreeze = gameRules.gamePaused === true || gameRules.gameState === 6;

    if (typeof gameRules.matchClockAtLastUpdate !== 'number' || typeof gameRules.matchClockUpdateTick !== 'number') {
        return null;
    }

    const elapsed = shouldFreeze ? 0 : Math.max(gameTick - gameRules.matchClockUpdateTick, 0) / tickRate;
    const seconds = Math.max(gameRules.matchClockAtLastUpdate + elapsed, 0);

    return {
        domainUsed: 'serverTick',
        seconds,
        formatted: formatClock(seconds),
        frozen: shouldFreeze
    };
}

function compactRecord(record) {
    if (record === null) {
        return null;
    }

    return {
        sequence: record.sequence,
        packetType: record.packetType,
        demoTick: record.demoTick,
        netTick: record.netTick,
        serverTick: record.serverTick,
        matchClockUpdateTick: record.gameRules?.matchClockUpdateTick ?? null,
        gameState: record.gameRules?.gameState ?? null,
        gameStateName: record.gameRules?.gameStateName ?? null,
        gamePaused: record.gameRules?.gamePaused ?? null,
        gameClockSeconds: record.calculatedClock?.seconds ?? null,
        gameClockFormatted: record.calculatedClock?.formatted ?? null
    };
}

function inferRelation(playerFindings, parserFindings) {
    return {
        sameDomain: false,
        playerLastTickMinusLastParserDemoTick: playerFindings.lastTick - parserFindings.lastParserDemoTick,
        lastServerTickMinusPlayerLastTick: parserFindings.lastServerTick - playerFindings.lastTick,
        lastNetTickMinusPlayerLastTick: parserFindings.lastNetTick - playerFindings.lastTick,
        explanation: [
            'Player.getLastTick() comes from PlayerPacketIndex over DemoPacketRaw.tick.value, the outer demo packet tick.',
            'Parser demoPacket.tick is the decoded form of the same outer demo packet tick.',
            'SVC_PACKET_ENTITIES.data.serverTick and net_Tick.data.tick are inner message/server tick domains and can continue past the final indexed outer demo tick.',
            'CCitadelGameRulesProxy.m_pGameRules.m_nMatchClockUpdateTick is in the server/game tick domain used by the official clock formula.'
        ],
        operationalConclusion: `Use Player demo ticks for seekToTick(). Use serverTick/net_Tick plus GameRules clock fields for official match clock. The observed ${playerFindings.lastTick} is a Player/demo tick, while ${parserFindings.lastServerTick} is an inner server tick.`
    };
}

function buildSummary(playerFindings, parserFindings, relation) {
    return {
        ticksSameDomain: relation.sameDomain,
        playerFirstTick: playerFindings.firstTick,
        playerLastTick: playerFindings.lastTick,
        lastParserDemoTick: parserFindings.lastParserDemoTick,
        lastServerTick: parserFindings.lastServerTick,
        lastNetTick: parserFindings.lastNetTick,
        lastMatchClockUpdateTick: parserFindings.lastMatchClockUpdateTick,
        lastReproducibleSeekTick: getLastReproducibleSeekTick(playerFindings.seekResults),
        lastTickWithValidOfficialClock: parserFindings.lastValidOfficialClock === null
            ? null
            : {
                observedAt: parserFindings.lastValidOfficialClockRecord,
                clock: parserFindings.lastValidOfficialClock
            },
        lastActiveGameTick: parserFindings.lastActiveGameTick,
        postGameStartTick: parserFindings.postGameStart,
        endingTick: parserFindings.endingStateStart,
        correctDomainForSeekToTick: 'demoTick / outer DemoPacket.tick / DemoPacketRaw.tick.value',
        correctDomainForClock: 'serverTick from SVC_PACKET_ENTITIES.data.serverTick, with GameRules m_nMatchClockUpdateTick',
        recommendedDomainForSnapshots: 'Player demo ticks for seek and entity snapshots; store simultaneous serverTick/official clock as metadata when available.',
        explanationOf191431Vs195526And196167: relation.operationalConclusion
    };
}

function getLastReproducibleSeekTick(seekResults) {
    const successful = seekResults
        .filter(result => result.threw === false && result.currentTickAfterSeek === result.requestedTick)
        .map(result => result.requestedTick);

    return successful.length === 0 ? null : Math.max(...successful);
}

function buildCodeReview() {
    return [
        {
            file: 'packages/engine/src/Player.js',
            classOrFunction: 'Player.load()',
            finding: 'Uses ParserEngine.extract() to buffer raw demo packets, builds PlayerPacketIndex, and sets first/last from first.tick.value and last.tick.value.'
        },
        {
            file: 'packages/engine/src/Player.js',
            classOrFunction: 'Player.seekToTick()',
            finding: 'Creates ParserSession and assigns getCurrentTick() from ParserSession.seekToTick(tick), so the requested tick is the PlayerPacketIndex demo tick domain.'
        },
        {
            file: 'packages/engine/src/PlayerPacketIndex.js',
            classOrFunction: 'PlayerPacketIndex._build()',
            finding: 'Builds unique tick offsets from packet.tick.value, i.e. DemoPacketRaw.tick.value.'
        },
        {
            file: 'packages/engine/src/PlayerPacketIndex.js',
            classOrFunction: 'PlayerPacketIndex.getPacketsForTick()',
            finding: 'Selects packets up to the first indexed demo tick strictly greater than the requested tick.'
        },
        {
            file: 'packages/engine/src/ParserSession.js',
            classOrFunction: 'ParserSession.process()',
            finding: 'Resolves with demoPacket.tick from the decoded demo packet, matching the outer demo tick domain.'
        },
        {
            file: 'packages/engine/src/PacketCodec.js',
            classOrFunction: 'PacketCodec.decodeRaw()',
            finding: 'Creates DemoPacket with raw.tick.value, preserving the outer demo packet tick as demoPacket.tick.'
        },
        {
            file: 'packages/examples-common/data/DeadlockGameObserver.js',
            classOrFunction: 'getGameTick()',
            finding: 'Reads SVC_PACKET_ENTITIES.data.serverTick from inner message packets and uses that value for game clock updates.'
        },
        {
            file: 'packages/examples-common/data/DeadlockGameObserver.js',
            classOrFunction: 'DeadlockGameObserver._forceUpdate()',
            finding: 'Computes official game clock from GameRules m_flMatchClockAtLastUpdate, m_nMatchClockUpdateTick, pause state, game state, and the server/game tick.'
        },
        {
            file: 'packages/ui/src/components/Parser/hooks/usePlayer.js',
            classOrFunction: 'seekTo() / tick state',
            finding: 'UI uses Player.getFirstTick(), Player.getLastTick(), Player.getCurrentTick(), and Player.seekToTick() for timeline seeking.'
        },
        {
            file: 'packages/ui/src/components/Parser/components/BottomBar/TimeDisplay.jsx',
            classOrFunction: 'TimeDisplay',
            finding: 'Labels the UI time as demo timeline rather than in-game clock.'
        }
    ];
}

function buildDomainDefinitions() {
    return {
        playerTick: {
            source: 'PlayerPacketIndex over DemoPacketRaw.tick.value',
            usedBy: [ 'Player.getFirstTick()', 'Player.getLastTick()', 'Player.getCurrentTick()', 'Player.seekToTick()' ],
            role: 'Operational seek and timeline domain.'
        },
        parserDemoTick: {
            source: 'DemoPacket.tick, decoded from raw.tick.value',
            usedBy: [ 'Parser DEMO_PACKET interceptors', 'ParserSession.process() return value' ],
            role: 'Decoded outer demo packet tick; should match Player tick domain.'
        },
        netTick: {
            source: 'net_Tick.data.tick inside DEM_Packet/DEM_FullPacket messagePackets',
            usedBy: [ 'network/server timing metadata' ],
            role: 'Inner message tick domain.'
        },
        serverTick: {
            source: 'SVC_PACKET_ENTITIES.data.serverTick inside messagePackets',
            usedBy: [ 'DeadlockGameObserver.getGameTick()' ],
            role: 'Game/server tick used to advance official match clock.'
        },
        matchClockUpdateTick: {
            source: 'CCitadelGameRulesProxy.m_pGameRules.m_nMatchClockUpdateTick',
            usedBy: [ 'DeadlockGameObserver._forceUpdate()' ],
            role: 'GameRules server/game tick at which m_flMatchClockAtLastUpdate was refreshed.'
        }
    };
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

async function writeJson(file, data) {
    await writeFile(file, `${JSON.stringify(data, null, 4)}\n`);
}

async function assertSizeUnderLimit(file) {
    const stats = await stat(file);

    if (stats.size > OUTPUT_SIZE_LIMIT) {
        throw new Error(`Output file exceeds 2 MiB: ${file} (${stats.size} bytes)`);
    }
}
