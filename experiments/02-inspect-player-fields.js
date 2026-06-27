import { createReadStream } from 'node:fs';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { Logger, Player } from 'deadem';

const DEMO_ARGUMENT_PREFIX = '--demo=';
const DEFAULT_DEMO = './samples/partida_001.dem';
const OUTPUT_FILE = './output/02-player-fields.json';
const SUMMARY_OUTPUT_FILE = './output/02-player-field-summary.json';
const CLASSES_TO_INSPECT = [
    'CCitadelPlayerController',
    'CCitadelPlayerPawn'
];
const PLAYER_NAME_FIELD = 'm_iszPlayerName';
const RELATION_FIELD_PATTERN = /(controller|pawn|player|hero|owner|handle|steam|user|account|slot|entity)/i;
const SECONDS_IN_MINUTE = 60;
const BYTES_IN_KIB = 1024;
const BYTES_IN_MIB = BYTES_IN_KIB * BYTES_IN_KIB;

const demoPath = resolveDemoPath();
const player = new Player(undefined, Logger.NOOP);

try {
    await player.load(createReadStream(demoPath));

    let tickRate = player.getDemo().server?.tickRate ?? null;

    if (tickRate === null) {
        await player.seekToTick(0);

        tickRate = player.getDemo().server?.tickRate ?? null;
    }

    if (tickRate === null) {
        throw new Error('Unable to determine replay tick rate from demo.server.tickRate');
    }

    const lastTick = player.getLastTick();
    const seekPoints = getSeekPoints(tickRate, lastTick);
    const snapshots = [];
    const summary = createSummary();

    for (const point of seekPoints) {
        await player.seekToTick(point.tick);

        const demo = player.getDemo();
        const snapshot = {
            label: point.label,
            requestedTick: point.tick,
            actualTick: player.getCurrentTick(),
            classes: {}
        };

        for (const className of CLASSES_TO_INSPECT) {
            const entities = demo.getEntitiesByClassName(className);

            snapshot.classes[className] = entities.map((entity) => inspectEntity(entity, summary));
        }

        snapshots.push(snapshot);
    }

    const result = {
        fileName: path.basename(demoPath),
        filePath: demoPath,
        tickRate,
        lastTick,
        playableInitialTickAssumption: 0,
        seekPoints,
        snapshots
    };

    const summaryResult = finalizeSummary(summary, {
        fileName: result.fileName,
        tickRate,
        lastTick,
        seekPoints
    });

    await mkdir(path.dirname(OUTPUT_FILE), { recursive: true });
    await writeJson(OUTPUT_FILE, result);
    await writeJson(SUMMARY_OUTPUT_FILE, summaryResult);

    const fieldsSize = await getFileSize(OUTPUT_FILE);
    const summarySize = await getFileSize(SUMMARY_OUTPUT_FILE);

    console.log(`Wrote ${OUTPUT_FILE} (${formatBytes(fieldsSize)})`);
    console.log(`Wrote ${SUMMARY_OUTPUT_FILE} (${formatBytes(summarySize)})`);
} finally {
    await player.dispose();
}

function resolveDemoPath() {
    const argument = process.argv.find(arg => arg.startsWith(DEMO_ARGUMENT_PREFIX));
    const file = argument ? argument.slice(DEMO_ARGUMENT_PREFIX.length) : DEFAULT_DEMO;

    return path.resolve(process.cwd(), file);
}

function getSeekPoints(tickRate, lastTick) {
    const points = [
        { label: 'tick 0', tick: 0 },
        { label: '5 minutes', tick: minutesToTick(5, tickRate) },
        { label: '10 minutes', tick: minutesToTick(10, tickRate) },
        { label: '20 minutes', tick: minutesToTick(20, tickRate) },
        { label: 'last tick', tick: lastTick }
    ];

    return points.map(point => ({
        ...point,
        tick: Math.min(point.tick, lastTick)
    }));
}

function minutesToTick(minutes, tickRate) {
    return Math.round(minutes * SECONDS_IN_MINUTE * tickRate);
}

function inspectEntity(entity, summary) {
    const fields = entity.unpackFlattened();
    const normalizedFields = {};
    const relationFields = {};

    for (const [ name, value ] of Object.entries(fields)) {
        const normalizedValue = normalizeValue(value);

        normalizedFields[name] = normalizedValue;
        recordSummary(summary, entity.class.name, name, value, normalizedValue);

        if (RELATION_FIELD_PATTERN.test(name)) {
            relationFields[name] = normalizedValue;
        }
    }

    return {
        index: entity.index,
        handle: entity.handle,
        className: entity.class.name,
        playerName: typeof fields[PLAYER_NAME_FIELD] === 'string' ? fields[PLAYER_NAME_FIELD] : null,
        relationFields,
        fields: normalizedFields
    };
}

function createSummary() {
    return new Map();
}

function recordSummary(summary, className, fieldName, originalValue, normalizedValue) {
    if (!summary.has(className)) {
        summary.set(className, new Map());
    }

    const classSummary = summary.get(className);

    if (!classSummary.has(fieldName)) {
        classSummary.set(fieldName, {
            observedTypes: new Set(),
            count: 0,
            examples: []
        });
    }

    const fieldSummary = classSummary.get(fieldName);

    fieldSummary.observedTypes.add(getObservedType(originalValue));
    fieldSummary.count++;

    const exampleKey = JSON.stringify(normalizedValue);
    const hasExample = fieldSummary.examples.some(example => JSON.stringify(example) === exampleKey);

    if (!hasExample && fieldSummary.examples.length < 3) {
        fieldSummary.examples.push(normalizedValue);
    }
}

function finalizeSummary(summary, metadata) {
    const classes = {};

    for (const [ className, fields ] of summary.entries()) {
        classes[className] = {};

        const sortedFields = Array.from(fields.entries())
            .sort(([ a ], [ b ]) => a.localeCompare(b));

        for (const [ fieldName, fieldSummary ] of sortedFields) {
            classes[className][fieldName] = {
                observedTypes: Array.from(fieldSummary.observedTypes).sort(),
                count: fieldSummary.count,
                examples: fieldSummary.examples
            };
        }
    }

    return {
        ...metadata,
        classes
    };
}

function normalizeValue(value) {
    if (value === null || value === undefined) {
        return value;
    }

    if (typeof value === 'bigint') {
        return {
            __type: 'BigInt',
            value: value.toString()
        };
    }

    if (ArrayBuffer.isView(value)) {
        return {
            __type: value.constructor.name,
            values: Array.from(value)
        };
    }

    if (Array.isArray(value)) {
        return value.map(item => normalizeValue(item));
    }

    if (typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value).map(([ key, entryValue ]) => [ key, normalizeValue(entryValue) ])
        );
    }

    return value;
}

function getObservedType(value) {
    if (value === null) {
        return 'null';
    }

    if (ArrayBuffer.isView(value)) {
        return value.constructor.name;
    }

    if (Array.isArray(value)) {
        return 'Array';
    }

    return typeof value;
}

async function writeJson(file, data) {
    await writeFile(file, `${JSON.stringify(data, null, 4)}\n`);
}

async function getFileSize(file) {
    const stats = await stat(file);

    return stats.size;
}

function formatBytes(bytes) {
    if (bytes >= BYTES_IN_MIB) {
        return `${(bytes / BYTES_IN_MIB).toFixed(2)} MiB`;
    }

    if (bytes >= BYTES_IN_KIB) {
        return `${(bytes / BYTES_IN_KIB).toFixed(2)} KiB`;
    }

    return `${bytes} bytes`;
}
