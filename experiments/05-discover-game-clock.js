import { createReadStream } from 'node:fs';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { InterceptorStage, Logger, MessagePacketType, Parser, Player } from 'deadem';

const DEMO_ARGUMENT_PREFIX = '--demo=';
const DEFAULT_DEMO = './samples/partida_001.dem';
const CANDIDATES_OUTPUT_FILE = './output/05-game-clock-candidates.json';
const VALIDATION_OUTPUT_FILE = './output/05-game-clock-validation.json';
const FIRST_COMPLETE_STATE_TICK = 1;
const GAME_RULES_CLASS_NAME = 'CCitadelGameRulesProxy';
const OUTPUT_SIZE_LIMIT = 5 * 1024 * 1024;
const SECONDS_IN_MINUTE = 60;
const SAMPLE_TICKS = [
    1,
    64,
    640,
    1920,
    3840,
    7680,
    19200,
    38400,
    76800
];
const LAST_TICK_SAMPLE_STEP = 64;
const LAST_TICK_SAMPLE_WINDOW = 640;
const CLASS_PATTERN = /(GameRules|GameRulesProxy|Match|Timer|Clock|PlayerResource|Objective|Team|GameState)/i;
const FIELD_PATTERN = /(time|clock|start|pause|paused|state|match|game|round)/i;
const EXCLUDED_FIELD_PATTERN = /(animation|anim|audio|sound|physics|effect|particle|pose|ragdoll|water|camera|glow|render)/i;
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

const demoPath = resolveDemoPath();
const metadata = await readReplayMetadata(demoPath);
const sampleTicks = buildSampleTicks(metadata.lastTick);
const parser = new Parser(undefined, Logger.NOOP);
const discoveredClassNames = new Set();
const fieldsByClass = new Map();
const samples = [];
const stateTransitions = [];
let sampleIndex = 0;
let lastState = null;
let lastGameTick = null;

try {
    parser.registerPreInterceptor(InterceptorStage.DEMO_PACKET, (demoPacket) => {
        const gameTick = getGameTick(demoPacket);

        if (gameTick !== null) {
            lastGameTick = gameTick;
        }
    });

    parser.registerPostInterceptor(InterceptorStage.DEMO_PACKET, (demoPacket) => {
        const tick = lastGameTick ?? demoPacket.tick?.value ?? demoPacket.tick;

        if (!Number.isInteger(tick)) {
            return;
        }

        discoverCandidateClassesAndFields(parser.getDemo());
        collectStateTransition(tick, parser.getDemo(), metadata.tickRate);

        while (sampleIndex < sampleTicks.length && tick >= sampleTicks[sampleIndex]) {
            samples.push(captureSample(sampleTicks[sampleIndex], tick, parser.getDemo(), metadata.tickRate));
            sampleIndex++;
        }
    });

    await parser.parse(createReadStream(demoPath));

    const inspectedClasses = Array.from(discoveredClassNames).sort((a, b) => a.localeCompare(b));
    const normalizedFieldsByClass = Object.fromEntries(
        Array.from(fieldsByClass.entries())
            .map(([ className, fields ]) => [ className, Array.from(fields).sort((a, b) => a.localeCompare(b)) ])
            .filter(([ , fields ]) => fields.length > 0)
    );
    const behavior = analyzeBehavior(samples, metadata.tickRate);
    const candidates = {
        metadata: {
            fileName: path.basename(demoPath),
            filePath: demoPath,
            firstCompleteStateTick: FIRST_COMPLETE_STATE_TICK,
            tickRate: metadata.tickRate,
            lastTick: metadata.lastTick,
            repositoryFindings: [
                {
                    file: 'packages/examples-common/data/DeadlockGameObserver.js',
                    finding: 'Existing helper computes game clock from CCitadelGameRulesProxy fields m_bGamePaused, m_eGameState, m_flMatchClockAtLastUpdate, and m_nMatchClockUpdateTick.'
                },
                {
                    file: 'packages/examples-common/data/DeadlockGameState.js',
                    finding: 'Game state enum names are documented for CCitadelGameRulesProxy.m_pGameRules.m_eGameState.'
                },
                {
                    file: 'packages/ui/src/components/Parser/components/BottomBar/TimeDisplay.jsx',
                    finding: 'UI bottom bar labels demo timeline as not the in-game clock.'
                }
            ]
        },
        inspectedClasses,
        candidateFields: flattenCandidateFields(normalizedFieldsByClass, samples, behavior),
        samples,
        stateTransitions,
        behavior
    };
    const validation = buildValidationTable(samples, metadata.tickRate);

    await mkdir(path.dirname(CANDIDATES_OUTPUT_FILE), { recursive: true });
    await writeJson(CANDIDATES_OUTPUT_FILE, candidates);
    await writeJson(VALIDATION_OUTPUT_FILE, validation);

    await assertSizeUnderLimit(CANDIDATES_OUTPUT_FILE);
    await assertSizeUnderLimit(VALIDATION_OUTPUT_FILE);

    console.log(`Wrote ${CANDIDATES_OUTPUT_FILE}`);
    console.log(`Wrote ${VALIDATION_OUTPUT_FILE}`);
} finally {
    await parser.dispose();
}

function resolveDemoPath() {
    const argument = process.argv.find(arg => arg.startsWith(DEMO_ARGUMENT_PREFIX));
    const file = argument ? argument.slice(DEMO_ARGUMENT_PREFIX.length) : DEFAULT_DEMO;

    return path.resolve(process.cwd(), file);
}

async function readReplayMetadata(file) {
    const player = new Player(undefined, Logger.NOOP);

    try {
        await player.load(createReadStream(file));
        await player.seekToTick(FIRST_COMPLETE_STATE_TICK);

        const tickRate = player.getDemo().server?.tickRate ?? null;

        if (tickRate === null) {
            throw new Error('Unable to determine replay tick rate from demo.server.tickRate');
        }

        return {
            tickRate,
            lastTick: player.getLastTick()
        };
    } finally {
        await player.dispose();
    }
}

function buildSampleTicks(lastTick) {
    const ticks = new Set(SAMPLE_TICKS.filter(tick => tick <= lastTick));
    const start = Math.max(FIRST_COMPLETE_STATE_TICK, lastTick - LAST_TICK_SAMPLE_WINDOW);

    for (let tick = start; tick <= lastTick; tick += LAST_TICK_SAMPLE_STEP) {
        ticks.add(tick);
    }

    ticks.add(lastTick);

    return Array.from(ticks).sort((a, b) => a - b);
}

function discoverCandidateClassesAndFields(demo) {
    for (const clazz of demo.getClasses()) {
        if (!CLASS_PATTERN.test(clazz.name)) {
            continue;
        }

        discoveredClassNames.add(clazz.name);

        if (!fieldsByClass.has(clazz.name)) {
            fieldsByClass.set(clazz.name, new Set());
        }

        for (const entity of demo.getEntitiesByClassName(clazz.name).slice(0, 2)) {
            const fields = entity.unpackFlattened();

            for (const [ field, value ] of Object.entries(fields)) {
                if (isCandidateField(field, value)) {
                    fieldsByClass.get(clazz.name).add(field);
                }
            }
        }
    }
}

function isCandidateField(field, value) {
    if (!FIELD_PATTERN.test(field) || EXCLUDED_FIELD_PATTERN.test(field)) {
        return false;
    }

    return [ 'number', 'boolean', 'string', 'bigint' ].includes(typeof value);
}

function collectStateTransition(tick, demo, tickRate) {
    const current = getGameRulesState(demo);

    if (current !== null && lastState !== null) {
        for (const field of [ 'm_pGameRules.m_eGameState', 'm_pGameRules.m_bGamePaused' ]) {
            if (lastState[field] !== current[field]) {
                stateTransitions.push({
                    tick,
                    field,
                    className: GAME_RULES_CLASS_NAME,
                    previousValue: lastState[field],
                    newValue: current[field],
                    technicalSeconds: getTechnicalSeconds(tick, tickRate),
                    simultaneousClock: getOfficialClockCandidate(demo, tick, tickRate)
                });
            }
        }
    }

    lastState = current;
}

function captureSample(requestedTick, actualTick, demo, tickRate) {
    const sample = {
        requestedTick,
        actualTick,
        technicalSeconds: getTechnicalSeconds(actualTick, tickRate),
        candidateOfficialClock: getOfficialClockCandidate(demo, actualTick, tickRate),
        classes: {}
    };

    for (const [ className, fields ] of fieldsByClass.entries()) {
        const entities = demo.getEntitiesByClassName(className);

        sample.classes[className] = entities.slice(0, 3).map(entity => ({
            index: entity.index,
            handle: entity.handle,
            fields: Object.fromEntries(Array.from(fields).map(field => [ field, normalizeValue(entity.getField(field)) ]))
        }));
    }

    return sample;
}

function getGameRulesState(demo) {
    const entity = demo.getEntitiesByClassName(GAME_RULES_CLASS_NAME)[0] || null;

    if (entity === null) {
        return null;
    }

    return {
        'm_pGameRules.m_bGamePaused': entity.getField('m_pGameRules.m_bGamePaused') ?? null,
        'm_pGameRules.m_eGameState': entity.getField('m_pGameRules.m_eGameState') ?? null,
        'm_pGameRules.m_flMatchClockAtLastUpdate': entity.getField('m_pGameRules.m_flMatchClockAtLastUpdate') ?? null,
        'm_pGameRules.m_nMatchClockUpdateTick': entity.getField('m_pGameRules.m_nMatchClockUpdateTick') ?? null
    };
}

function getOfficialClockCandidate(demo, tick, tickRate) {
    const state = getGameRulesState(demo);

    if (state === null) {
        return null;
    }

    const gameStateCode = state['m_pGameRules.m_eGameState'];
    const gamePaused = state['m_pGameRules.m_bGamePaused'] === true;
    const clockLastUpdatedAt = state['m_pGameRules.m_flMatchClockAtLastUpdate'];
    const clockLastUpdatedTick = state['m_pGameRules.m_nMatchClockUpdateTick'];

    if (typeof clockLastUpdatedAt !== 'number' || typeof clockLastUpdatedTick !== 'number') {
        return null;
    }

    const shouldFreeze = gameStateCode === 6 || gamePaused;
    const elapsed = shouldFreeze ? 0 : Math.max(tick - clockLastUpdatedTick, 0) / tickRate;
    const seconds = Math.max(clockLastUpdatedAt + elapsed, 0);

    return {
        className: GAME_RULES_CLASS_NAME,
        timeFields: [
            'm_pGameRules.m_flMatchClockAtLastUpdate',
            'm_pGameRules.m_nMatchClockUpdateTick'
        ],
        stateField: 'm_pGameRules.m_eGameState',
        pausedField: 'm_pGameRules.m_bGamePaused',
        rawClockLastUpdatedAt: clockLastUpdatedAt,
        rawClockLastUpdatedTick: clockLastUpdatedTick,
        gameStateCode,
        gameStateName: STATE_NAMES.get(gameStateCode) || null,
        paused: gamePaused,
        seconds,
        formatted: formatClock(seconds),
        confidence: 'high'
    };
}

function getGameTick(demoPacket) {
    const messagePackets = demoPacket.data?.messagePackets;

    if (!Array.isArray(messagePackets)) {
        return null;
    }

    const packetEntities = messagePackets.findLast(messagePacket => messagePacket.type === MessagePacketType.SVC_PACKET_ENTITIES);

    return packetEntities?.data.serverTick ?? null;
}

function analyzeBehavior(samples, tickRate) {
    const behavior = {};
    const fieldValues = new Map();

    for (const sample of samples) {
        for (const [ className, entities ] of Object.entries(sample.classes)) {
            const entity = entities[0];

            if (!entity) {
                continue;
            }

            for (const [ field, value ] of Object.entries(entity.fields)) {
                const key = `${className}.${field}`;

                if (!fieldValues.has(key)) {
                    fieldValues.set(key, []);
                }

                fieldValues.get(key).push({ tick: sample.actualTick, value });
            }
        }
    }

    for (const [ key, values ] of fieldValues.entries()) {
        behavior[key] = summarizeFieldBehavior(values, tickRate);
    }

    behavior.officialClockCandidate = summarizeOfficialClockBehavior(samples, tickRate);

    return behavior;
}

function summarizeFieldBehavior(values, tickRate) {
    const numericValues = values.filter(entry => typeof entry.value === 'number');
    const deltas = [];

    for (let i = 1; i < numericValues.length; i++) {
        const previous = numericValues[i - 1];
        const current = numericValues[i];
        const valueDelta = current.value - previous.value;
        const technicalDelta = (current.tick - previous.tick) / tickRate;

        deltas.push({
            tick: current.tick,
            valueDelta,
            technicalDelta,
            deltaMatchesTechnicalSeconds: Math.abs(valueDelta - technicalDelta) < 0.1
        });
    }

    return {
        observedTypes: Array.from(new Set(values.map(entry => getType(entry.value)))).sort(),
        firstValue: values[0]?.value ?? null,
        lastValue: values.at(-1)?.value ?? null,
        changes: countChanges(values.map(entry => JSON.stringify(entry.value))),
        growsContinuously: deltas.length > 0 && deltas.every(delta => delta.valueDelta >= 0),
        startsNegative: typeof values[0]?.value === 'number' && values[0].value < 0,
        startsAtZero: values[0]?.value === 0,
        hasJumps: deltas.some(delta => Math.abs(delta.valueDelta) > Math.max(delta.technicalDelta * 2, 5)),
        remainsStill: deltas.length > 0 && deltas.every(delta => delta.valueDelta === 0),
        followsDeltaTickOverTickRate: deltas.length > 0 && deltas.filter(delta => delta.deltaMatchesTechnicalSeconds).length / deltas.length > 0.8,
        likelyUnit: inferUnit(deltas)
    };
}

function summarizeOfficialClockBehavior(samples, tickRate) {
    const values = samples
        .map(sample => ({
            tick: sample.actualTick,
            value: sample.candidateOfficialClock?.seconds ?? null
        }))
        .filter(entry => typeof entry.value === 'number');

    return {
        ...summarizeFieldBehavior(values, tickRate),
        rationale: 'Matches the repository DeadlockGameObserver formula and uses game rules clock update fields plus pause/post-game state.'
    };
}

function buildValidationTable(samples, tickRate) {
    const selected = pickValidationSamples(samples);

    return {
        metadata: {
            firstCompleteStateTick: FIRST_COMPLETE_STATE_TICK,
            tickRate,
            candidateClass: GAME_RULES_CLASS_NAME,
            candidateTimeFields: [
                'm_pGameRules.m_flMatchClockAtLastUpdate',
                'm_pGameRules.m_nMatchClockUpdateTick'
            ],
            candidateStateField: 'm_pGameRules.m_eGameState'
        },
        rows: selected.map(sample => ({
            tick: sample.actualTick,
            technicalSeconds: sample.technicalSeconds,
            candidateGameSeconds: sample.candidateOfficialClock?.seconds ?? null,
            candidateFormattedTime: sample.candidateOfficialClock?.formatted ?? null,
            candidateState: sample.candidateOfficialClock?.gameStateName ?? null,
            className: sample.candidateOfficialClock?.className ?? null,
            timeFields: sample.candidateOfficialClock?.timeFields ?? [],
            stateField: sample.candidateOfficialClock?.stateField ?? null,
            confidence: sample.candidateOfficialClock?.confidence ?? 'low'
        }))
    };
}

function pickValidationSamples(samples) {
    const desiredTicks = [
        1,
        64,
        640,
        1920,
        3840,
        7680,
        19200,
        38400,
        76800,
        samples.at(-1)?.requestedTick
    ];

    return desiredTicks
        .filter(tick => tick !== undefined)
        .map(tick => samples.find(sample => sample.requestedTick === tick))
        .filter(sample => sample !== undefined);
}

function flattenCandidateFields(fieldsByClass, samples, behavior) {
    const output = [];

    for (const [ className, fields ] of Object.entries(fieldsByClass)) {
        for (const field of fields) {
            const key = `${className}.${field}`;
            const values = samples
                .map(sample => sample.classes[className]?.[0]?.fields[field])
                .filter(value => value !== undefined);

            output.push({
                className,
                field,
                type: Array.from(new Set(values.map(getType))).sort().join('|'),
                observedVariation: behavior[key] || null,
                reason: getCandidateReason(field)
            });
        }
    }

    return output;
}

function getCandidateReason(field) {
    if (/m_flMatchClockAtLastUpdate|m_nMatchClockUpdateTick/i.test(field)) {
        return 'Used by the existing DeadlockGameObserver clock formula.';
    }

    if (/m_eGameState/i.test(field)) {
        return 'DeadlockGameState maps this field to match lifecycle states.';
    }

    if (/m_bGamePaused/i.test(field)) {
        return 'Existing observer freezes official clock when this field is true.';
    }

    return 'Name suggests relation to time, clock, match, game state, start, pause, or round state.';
}

function getTechnicalSeconds(tick, tickRate) {
    return (tick - FIRST_COMPLETE_STATE_TICK) / tickRate;
}

function formatClock(seconds) {
    const safeSeconds = Math.max(seconds, 0);
    const minutes = Math.floor(safeSeconds / SECONDS_IN_MINUTE);
    const wholeSeconds = Math.floor(safeSeconds % SECONDS_IN_MINUTE);

    return `${minutes.toString().padStart(2, '0')}:${wholeSeconds.toString().padStart(2, '0')}`;
}

function normalizeValue(value) {
    if (typeof value === 'bigint') {
        return value.toString();
    }

    return value ?? null;
}

function getType(value) {
    if (value === null) {
        return 'null';
    }

    return typeof value;
}

function countChanges(values) {
    let changes = 0;

    for (let i = 1; i < values.length; i++) {
        if (values[i] !== values[i - 1]) {
            changes++;
        }
    }

    return changes;
}

function inferUnit(deltas) {
    if (deltas.length === 0) {
        return null;
    }

    const secondMatches = deltas.filter(delta => delta.deltaMatchesTechnicalSeconds).length / deltas.length;

    return secondMatches > 0.8 ? 'seconds' : 'unknown';
}

async function writeJson(file, data) {
    await writeFile(file, `${JSON.stringify(data, null, 4)}\n`);
}

async function assertSizeUnderLimit(file) {
    const stats = await stat(file);

    if (stats.size > OUTPUT_SIZE_LIMIT) {
        throw new Error(`Output file exceeds 5 MiB: ${file} (${stats.size} bytes)`);
    }
}
