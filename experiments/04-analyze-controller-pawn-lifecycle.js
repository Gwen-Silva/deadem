import { createReadStream } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { Logger, Player } from 'deadem';

const DEMO_ARGUMENT_PREFIX = '--demo=';
const DEFAULT_DEMO = './samples/partida_001.dem';
const LIFECYCLE_OUTPUT_FILE = './output/04-controller-pawn-lifecycle.json';
const SUMMARY_OUTPUT_FILE = './output/04-controller-pawn-summary.json';
const CONTROLLER_CLASS = 'CCitadelPlayerController';
const PAWN_CLASS = 'CCitadelPlayerPawn';
const SOURCE_TV_NAME = 'SourceTV';
const INVALID_HANDLE = 16777215;
const FIRST_COMPLETE_STATE_TICK = 1;
const WINDOW_PADDING_TICKS = 200;
const LAST_WINDOW_TICKS = 800;
const FOCUSED_DIVERGENCE_WINDOW_START = 38000;
const FOCUSED_DIVERGENCE_WINDOW_END = 38800;

const demoPath = resolveDemoPath();
const player = new Player(undefined, Logger.NOOP);

try {
    await player.load(createReadStream(demoPath));
    await player.seekToTick(FIRST_COMPLETE_STATE_TICK);

    const tickRate = player.getDemo().server?.tickRate ?? null;

    if (tickRate === null) {
        throw new Error('Unable to determine replay tick rate from demo.server.tickRate');
    }

    const lastTick = player.getLastTick();
    const changeTicks = await collectChangeTicks(lastTick);
    const windows = buildAnalysisWindows(changeTicks, lastTick);
    const analysis = await analyzeWindows(windows, tickRate, lastTick);
    const lifecycle = {
        metadata: {
            fileName: path.basename(demoPath),
            filePath: demoPath,
            firstCompleteStateTick: FIRST_COMPLETE_STATE_TICK,
            tickRate,
            lastTick,
            invalidHandle: INVALID_HANDLE
        },
        analyzedWindows: windows,
        timelineBySteamId: analysis.timelineBySteamId,
        divergenceDurations: analysis.divergenceDurations
    };
    const summary = buildSummary(lifecycle, analysis);

    await mkdir(path.dirname(LIFECYCLE_OUTPUT_FILE), { recursive: true });
    await writeJson(LIFECYCLE_OUTPUT_FILE, lifecycle);
    await writeJson(SUMMARY_OUTPUT_FILE, summary);

    console.log(`Change ticks discovered: ${changeTicks.length}`);
    console.log(`Analyzed windows: ${windows.length}`);
    console.log(`Divergence intervals: ${analysis.divergenceDurations.length}`);
    console.log(`Wrote ${LIFECYCLE_OUTPUT_FILE}`);
    console.log(`Wrote ${SUMMARY_OUTPUT_FILE}`);
} finally {
    await player.dispose();
}

function resolveDemoPath() {
    const argument = process.argv.find(arg => arg.startsWith(DEMO_ARGUMENT_PREFIX));
    const file = argument ? argument.slice(DEMO_ARGUMENT_PREFIX.length) : DEFAULT_DEMO;

    return path.resolve(process.cwd(), file);
}

async function collectChangeTicks(lastTick) {
    const changeTicks = new Set();
    let previousStates = null;

    await player.seekToTick(FIRST_COMPLETE_STATE_TICK);

    while (true) {
        const tick = player.getCurrentTick();
        const states = getCurrentPlayerStates();

        if (previousStates !== null) {
            for (const [ steamId, state ] of states.entries()) {
                const previous = previousStates.get(steamId) || null;
                const divergenceStarted = state.linkStatus !== 'fully_bidirectional'
                    && (previous === null || previous.linkStatus === 'fully_bidirectional');

                if (previous === null || getDiscoveryChangedFields(previous, state).length > 0 || divergenceStarted) {
                    changeTicks.add(tick);
                }
            }
        }

        previousStates = states;

        if (tick >= lastTick) {
            break;
        }

        const advanced = await player.nextTick();

        if (!advanced) {
            break;
        }
    }

    return Array.from(changeTicks).sort((a, b) => a - b);
}

function getDiscoveryChangedFields(previous, current) {
    return [
        'controllerPawnHandle',
        'controllerHeroPawnHandle',
        'alive',
        'deaths',
        'pawnControllerHandle',
        'linkStatus'
    ].filter(field => previous[field] !== current[field]);
}

function buildAnalysisWindows(changeTicks, lastTick) {
    const windows = [
        {
            label: 'focused divergence around tick 38401',
            startTick: FOCUSED_DIVERGENCE_WINDOW_START,
            endTick: FOCUSED_DIVERGENCE_WINDOW_END
        },
        {
            label: 'last 800 ticks',
            startTick: Math.max(FIRST_COMPLETE_STATE_TICK, lastTick - LAST_WINDOW_TICKS),
            endTick: lastTick
        }
    ];

    for (const tick of changeTicks) {
        windows.push({
            label: `change window around tick ${tick}`,
            startTick: Math.max(FIRST_COMPLETE_STATE_TICK, tick - WINDOW_PADDING_TICKS),
            endTick: Math.min(lastTick, tick + WINDOW_PADDING_TICKS)
        });
    }

    return mergeWindows(windows);
}

function mergeWindows(windows) {
    const sorted = windows
        .map(window => ({
            ...window,
            labels: [ window.label ]
        }))
        .sort((a, b) => a.startTick - b.startTick || a.endTick - b.endTick);
    const merged = [];

    for (const window of sorted) {
        const previous = merged.at(-1);

        if (previous !== undefined && window.startTick <= previous.endTick + 1) {
            previous.endTick = Math.max(previous.endTick, window.endTick);
            previous.labels.push(...window.labels);
        } else {
            merged.push(window);
        }
    }

    return merged.map((window, index) => ({
        id: index + 1,
        startTick: window.startTick,
        endTick: window.endTick,
        labels: window.labels
    }));
}

async function analyzeWindows(windows, tickRate, lastTick) {
    const timelineBySteamId = {};
    const lastEventStateBySteamId = new Map();
    const previousTickStateBySteamId = new Map();
    const activeDivergencesBySteamId = new Map();
    const divergenceDurations = [];
    const reliability = createReliabilityTracker();

    for (const window of windows) {
        await player.seekToTick(window.startTick);

        while (true) {
            const tick = player.getCurrentTick();
            const states = getCurrentPlayerStates();

            for (const state of states.values()) {
                recordReliability(reliability, state);

                const previous = lastEventStateBySteamId.get(state.steamId) || null;
                const previousTickState = previousTickStateBySteamId.get(state.steamId) || null;
                const changedFields = previous === null ? [ 'initial_state' ] : getEventChangedFields(previous, state);
                const divergenceStarted = state.linkStatus !== 'fully_bidirectional'
                    && (previousTickState === null || previousTickState.linkStatus === 'fully_bidirectional');
                const shouldRecord = tick === window.startTick || changedFields.length > 0 || divergenceStarted;

                updateDivergenceTracking({
                    activeDivergencesBySteamId,
                    divergenceDurations,
                    previous: previousTickState,
                    state,
                    tick,
                    tickRate,
                    lastTick
                });

                if (!shouldRecord) {
                    previousTickStateBySteamId.set(state.steamId, state);

                    continue;
                }

                if (!timelineBySteamId[state.steamId]) {
                    timelineBySteamId[state.steamId] = [];
                }

                timelineBySteamId[state.steamId].push({
                    tick,
                    relativeSeconds: (tick - FIRST_COMPLETE_STATE_TICK) / tickRate,
                    name: state.name,
                    steamId: state.steamId,
                    controllerHandle: state.controllerHandle,
                    controllerPawnHandle: state.controllerPawnHandle,
                    controllerHeroPawnHandle: state.controllerHeroPawnHandle,
                    matchedPawnHandle: state.matchedPawnHandle,
                    pawnControllerHandle: state.pawnControllerHandle,
                    pawnDefaultControllerHandle: state.pawnDefaultControllerHandle,
                    pawnOwnerEntityHandle: state.pawnOwnerEntityHandle,
                    alive: state.alive,
                    deaths: state.deaths,
                    controllerRespawnTime: state.controllerRespawnTime,
                    pawnLifeState: state.pawnLifeState,
                    pawnHealth: state.pawnHealth,
                    pawnDeathTime: state.pawnDeathTime,
                    pawnRespawnTime: state.pawnRespawnTime,
                    pawnLastSpawnTime: state.pawnLastSpawnTime,
                    pawnCreateTime: state.pawnCreateTime,
                    linkStatus: state.linkStatus,
                    changedFields,
                    candidatePawns: state.candidatePawns
                });

                lastEventStateBySteamId.set(state.steamId, state);
                previousTickStateBySteamId.set(state.steamId, state);
            }

            if (tick >= window.endTick) {
                break;
            }

            const advanced = await player.nextTick();

            if (!advanced) {
                break;
            }
        }
    }

    closeActiveDivergences(activeDivergencesBySteamId, divergenceDurations, tickRate, lastTick);

    return {
        timelineBySteamId,
        divergenceDurations,
        reliability
    };
}

function getCurrentPlayerStates() {
    const demo = player.getDemo();
    const controllers = demo.getEntitiesByClassName(CONTROLLER_CLASS).filter(isRealController);
    const pawns = demo.getEntitiesByClassName(PAWN_CLASS);
    const pawnByHandle = new Map(pawns.map(pawn => [ pawn.handle, pawn ]));
    const states = new Map();

    for (const controller of controllers) {
        const state = buildPlayerState(controller, pawns, pawnByHandle);

        states.set(state.steamId, state);
    }

    return states;
}

function isRealController(controller) {
    const name = getStringField(controller, 'm_iszPlayerName');
    const steamId = getBigIntStringField(controller, 'm_steamID');

    return name !== SOURCE_TV_NAME && steamId !== '0';
}

function buildPlayerState(controller, pawns, pawnByHandle) {
    const controllerHandle = controller.handle;
    const controllerPawnHandle = getNumberField(controller, 'm_hPawn');
    const controllerHeroPawnHandle = getNumberField(controller, 'm_hHeroPawn');
    const controllerCandidateHandles = unique([
        controllerHeroPawnHandle,
        controllerPawnHandle
    ].filter(isValidHandle));
    const directCandidatePawns = controllerCandidateHandles
        .map(handle => pawnByHandle.get(handle) || null)
        .filter(pawn => pawn !== null);
    const reverseCandidatePawns = pawns.filter(pawn => [
        getNumberField(pawn, 'm_hController'),
        getNumberField(pawn, 'm_hDefaultController'),
        getNumberField(pawn, 'm_hOwnerEntity')
    ].includes(controllerHandle));
    const candidatePawns = uniqueByHandle([ ...directCandidatePawns, ...reverseCandidatePawns ]);
    const matchedPawn = chooseMatchedPawn(controllerHeroPawnHandle, controllerPawnHandle, directCandidatePawns, reverseCandidatePawns);
    const linkStatus = classifyLink({
        controllerHandle,
        controllerPawnHandle,
        controllerHeroPawnHandle,
        controllerCandidateHandles,
        directCandidatePawns,
        reverseCandidatePawns,
        candidatePawns,
        matchedPawn
    });

    return {
        controllerIndex: controller.index,
        controllerHandle,
        name: getStringField(controller, 'm_iszPlayerName'),
        steamId: getBigIntStringField(controller, 'm_steamID'),
        controllerPawnHandle,
        controllerHeroPawnHandle,
        alive: getBooleanField(controller, 'm_bAlive'),
        deaths: getNumberField(controller, 'm_iDeaths'),
        controllerRespawnTime: getNumberField(controller, 'm_flRespawnTime'),
        matchedPawnHandle: matchedPawn?.handle ?? null,
        pawnControllerHandle: matchedPawn === null ? null : getNumberField(matchedPawn, 'm_hController'),
        pawnDefaultControllerHandle: matchedPawn === null ? null : getNumberField(matchedPawn, 'm_hDefaultController'),
        pawnOwnerEntityHandle: matchedPawn === null ? null : getNumberField(matchedPawn, 'm_hOwnerEntity'),
        pawnLifeState: matchedPawn === null ? null : getNumberField(matchedPawn, 'm_lifeState'),
        pawnHealth: matchedPawn === null ? null : getNumberField(matchedPawn, 'm_iHealth'),
        pawnDeathTime: matchedPawn === null ? null : getNumberField(matchedPawn, 'm_flDeathTime'),
        pawnRespawnTime: matchedPawn === null ? null : getNumberField(matchedPawn, 'm_flRespawnTime'),
        pawnLastSpawnTime: matchedPawn === null ? null : getNumberField(matchedPawn, 'm_flLastSpawnTime'),
        pawnCreateTime: matchedPawn === null ? null : getNumberField(matchedPawn, 'm_flCreateTime'),
        linkStatus,
        candidatePawns: candidatePawns.map(pawn => ({
            pawnIndex: pawn.index,
            pawnHandle: pawn.handle,
            pawnControllerHandle: getNumberField(pawn, 'm_hController'),
            pawnDefaultControllerHandle: getNumberField(pawn, 'm_hDefaultController'),
            pawnOwnerEntityHandle: getNumberField(pawn, 'm_hOwnerEntity'),
            fromControllerHandle: controllerCandidateHandles.includes(pawn.handle),
            pointsBackViaController: getNumberField(pawn, 'm_hController') === controllerHandle,
            pointsBackViaDefaultController: getNumberField(pawn, 'm_hDefaultController') === controllerHandle,
            pointsBackViaOwnerEntity: getNumberField(pawn, 'm_hOwnerEntity') === controllerHandle
        }))
    };
}

function chooseMatchedPawn(controllerHeroPawnHandle, controllerPawnHandle, directCandidatePawns, reverseCandidatePawns) {
    return directCandidatePawns.find(pawn => pawn.handle === controllerHeroPawnHandle)
        || directCandidatePawns.find(pawn => pawn.handle === controllerPawnHandle)
        || reverseCandidatePawns[0]
        || null;
}

function classifyLink({ controllerHandle, controllerPawnHandle, controllerHeroPawnHandle, controllerCandidateHandles, directCandidatePawns, reverseCandidatePawns, candidatePawns, matchedPawn }) {
    if (candidatePawns.length > 1 && directCandidatePawns.length > 1 && reverseCandidatePawns.length > 1) {
        return 'ambiguous';
    }

    if (isValidHandle(controllerPawnHandle) && isValidHandle(controllerHeroPawnHandle) && controllerPawnHandle !== controllerHeroPawnHandle) {
        return 'controller_handles_disagree';
    }

    if (controllerCandidateHandles.length === 0 && reverseCandidatePawns.length === 0) {
        return 'invalid_handle';
    }

    if (controllerCandidateHandles.length > 0 && directCandidatePawns.length === 0) {
        return 'pawn_missing';
    }

    if (matchedPawn !== null) {
        const pawnControllerHandle = getNumberField(matchedPawn, 'm_hController');

        if (pawnControllerHandle === controllerHandle) {
            return 'fully_bidirectional';
        }

        if (reverseCandidatePawns.length > 0 && !controllerCandidateHandles.includes(reverseCandidatePawns[0].handle)) {
            return 'pawn_to_controller_only';
        }

        return 'controller_to_pawn_only';
    }

    if (reverseCandidatePawns.length > 0) {
        return 'pawn_to_controller_only';
    }

    return 'controller_missing';
}

function getEventChangedFields(previous, current) {
    return [
        'controllerHandle',
        'controllerPawnHandle',
        'controllerHeroPawnHandle',
        'matchedPawnHandle',
        'pawnControllerHandle',
        'pawnDefaultControllerHandle',
        'pawnOwnerEntityHandle',
        'alive',
        'deaths',
        'controllerRespawnTime',
        'pawnLifeState',
        'pawnHealth',
        'pawnDeathTime',
        'pawnRespawnTime',
        'pawnLastSpawnTime',
        'pawnCreateTime',
        'linkStatus'
    ].filter(field => previous[field] !== current[field]);
}

function updateDivergenceTracking({ activeDivergencesBySteamId, divergenceDurations, previous, state, tick, tickRate, lastTick }) {
    const active = activeDivergencesBySteamId.get(state.steamId) || null;
    const diverged = state.linkStatus !== 'fully_bidirectional';

    if (diverged && active === null) {
        activeDivergencesBySteamId.set(state.steamId, {
            steamId: state.steamId,
            name: state.name,
            linkStatus: state.linkStatus,
            startTick: tick,
            startState: state,
            events: []
        });
    }

    if (active !== null && diverged && active.linkStatus !== state.linkStatus) {
        closeDivergence(active, tick - 1, tickRate, lastTick, divergenceDurations);

        activeDivergencesBySteamId.set(state.steamId, {
            steamId: state.steamId,
            name: state.name,
            linkStatus: state.linkStatus,
            startTick: tick,
            startState: state,
            events: []
        });
    }

    const currentActive = activeDivergencesBySteamId.get(state.steamId) || null;

    if (currentActive !== null) {
        const changedFields = previous === null ? [ 'initial_state' ] : getEventChangedFields(previous, state);

        if (changedFields.length > 0 || tick === currentActive.startTick) {
            currentActive.events.push({
                tick,
                changedFields,
                alive: state.alive,
                deaths: state.deaths,
                matchedPawnHandle: state.matchedPawnHandle,
                pawnLastSpawnTime: state.pawnLastSpawnTime,
                pawnCreateTime: state.pawnCreateTime
            });
        }
    }

    if (!diverged && active !== null) {
        closeDivergence(active, tick - 1, tickRate, lastTick, divergenceDurations);
        activeDivergencesBySteamId.delete(state.steamId);
    }
}

function closeActiveDivergences(activeDivergencesBySteamId, divergenceDurations, tickRate, lastTick) {
    for (const active of activeDivergencesBySteamId.values()) {
        closeDivergence(active, lastTick, tickRate, lastTick, divergenceDurations);
    }
}

function closeDivergence(active, endTick, tickRate, lastTick, divergenceDurations) {
    const startState = active.startState;
    const durationTicks = Math.max(0, endTick - active.startTick + 1);
    const deathEvents = active.events.filter(event => event.alive === false);
    const deathIncreaseEvents = active.events.filter(event => event.changedFields.includes('deaths'));
    const respawnEvents = active.events.filter(event => event.changedFields.includes('alive') && event.alive === true);
    const newPawnEvents = active.events.filter(event => event.changedFields.includes('matchedPawnHandle') || event.changedFields.includes('pawnCreateTime'));

    divergenceDurations.push({
        steamId: active.steamId,
        name: active.name,
        linkStatus: active.linkStatus,
        startTick: active.startTick,
        endTick,
        durationTicks,
        durationSeconds: durationTicks / tickRate,
        startControllerPawnHandle: startState.controllerPawnHandle,
        startControllerHeroPawnHandle: startState.controllerHeroPawnHandle,
        startMatchedPawnHandle: startState.matchedPawnHandle,
        coincidesWith: {
            death: deathEvents.length > 0,
            deathIncrease: deathIncreaseEvents.length > 0,
            respawn: respawnEvents.length > 0,
            newPawn: newPawnEvents.length > 0,
            matchEnd: endTick >= lastTick
        },
        eventTicks: active.events.map(event => event.tick)
    });
}

function buildSummary(lifecycle, analysis) {
    const playerSummaries = {};
    const divergenceCounts = {};
    const allDivergences = lifecycle.divergenceDurations;

    for (const [ steamId, events ] of Object.entries(lifecycle.timelineBySteamId)) {
        const pawnHandles = unique(events.map(event => event.matchedPawnHandle).filter(handle => handle !== null));
        const playerDivergences = allDivergences.filter(divergence => divergence.steamId === steamId);
        const pawnChanges = countChanges(events.map(event => event.matchedPawnHandle));

        playerSummaries[steamId] = {
            name: events[0]?.name ?? null,
            pawnChangeCount: pawnChanges,
            pawnHandles,
            divergenceCountsByClassification: countBy(playerDivergences, 'linkStatus'),
            longestDivergence: playerDivergences
                .toSorted((a, b) => b.durationTicks - a.durationTicks)[0] || null,
            divergencesCoincidingWith: {
                death: playerDivergences.filter(divergence => divergence.coincidesWith.death).length,
                deathIncrease: playerDivergences.filter(divergence => divergence.coincidesWith.deathIncrease).length,
                respawn: playerDivergences.filter(divergence => divergence.coincidesWith.respawn).length,
                newPawn: playerDivergences.filter(divergence => divergence.coincidesWith.newPawn).length,
                matchEnd: playerDivergences.filter(divergence => divergence.coincidesWith.matchEnd).length
            }
        };
    }

    for (const divergence of allDivergences) {
        divergenceCounts[divergence.linkStatus] = (divergenceCounts[divergence.linkStatus] || 0) + 1;
    }

    return {
        metadata: lifecycle.metadata,
        analyzedWindows: lifecycle.analyzedWindows,
        totalDivergencesByClassification: divergenceCounts,
        longestDivergence: allDivergences.toSorted((a, b) => b.durationTicks - a.durationTicks)[0] || null,
        reliableAssociationFieldHint: summarizeReliability(analysis.reliability),
        players: playerSummaries
    };
}

function createReliabilityTracker() {
    return {
        m_hPawn: { matches: 0, total: 0 },
        m_hHeroPawn: { matches: 0, total: 0 },
        'Pawn.m_hController': { matches: 0, total: 0 },
        'Pawn.m_hOwnerEntity': { matches: 0, total: 0 }
    };
}

function recordReliability(reliability, state) {
    if (isValidHandle(state.controllerPawnHandle)) {
        reliability.m_hPawn.total++;
        reliability.m_hPawn.matches += state.controllerPawnHandle === state.matchedPawnHandle ? 1 : 0;
    }

    if (isValidHandle(state.controllerHeroPawnHandle)) {
        reliability.m_hHeroPawn.total++;
        reliability.m_hHeroPawn.matches += state.controllerHeroPawnHandle === state.matchedPawnHandle ? 1 : 0;
    }

    if (state.matchedPawnHandle !== null) {
        reliability['Pawn.m_hController'].total++;
        reliability['Pawn.m_hController'].matches += state.pawnControllerHandle === state.controllerHandle ? 1 : 0;
        reliability['Pawn.m_hOwnerEntity'].total++;
        reliability['Pawn.m_hOwnerEntity'].matches += state.pawnOwnerEntityHandle === state.controllerHandle ? 1 : 0;
    }
}

function summarizeReliability(reliability) {
    return Object.fromEntries(
        Object.entries(reliability).map(([ field, stats ]) => [
            field,
            {
                ...stats,
                ratio: stats.total === 0 ? null : stats.matches / stats.total
            }
        ]).sort((a, b) => (b[1].ratio ?? -1) - (a[1].ratio ?? -1))
    );
}

function countChanges(values) {
    let count = 0;

    for (let i = 1; i < values.length; i++) {
        if (values[i] !== values[i - 1]) {
            count++;
        }
    }

    return count;
}

function countBy(items, field) {
    return items.reduce((counts, item) => {
        counts[item[field]] = (counts[item[field]] || 0) + 1;

        return counts;
    }, {});
}

function unique(values) {
    return Array.from(new Set(values));
}

function uniqueByHandle(pawns) {
    return Array.from(new Map(pawns.map(pawn => [ pawn.handle, pawn ])).values());
}

function isValidHandle(handle) {
    return typeof handle === 'number' && handle !== INVALID_HANDLE;
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
