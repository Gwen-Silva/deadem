import { createReadStream } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { Logger, Player, StringTableType } from 'deadem';

const DEMO_ARGUMENT_PREFIX = '--demo=';
const DEFAULT_DEMO = './samples/partida_001.dem';
const OUTPUT_FILE = './output/01-validation.json';
const PLAYER_CLASS_PATTERN = /(player|hero)/i;
const PLAYER_CONTROLLER_CLASS = 'CCitadelPlayerController';
const PLAYER_NAME_FIELD = 'm_iszPlayerName';
const SECONDS_IN_MINUTE = 60;

const demoPath = resolveDemoPath();
const player = new Player(undefined, Logger.NOOP);

try {
    await player.load(createReadStream(demoPath));
    await player.seekToTick(player.getLastTick());

    const demo = player.getDemo();
    const tickRate = demo.server?.tickRate ?? null;
    const rawFirstTick = player.getFirstTick();
    const effectiveFirstTick = rawFirstTick < 0 ? 0 : rawFirstTick;
    const durationSeconds = tickRate === null
        ? null
        : (player.getLastTick() - effectiveFirstTick) / tickRate;

    const result = {
        fileName: path.basename(demoPath),
        filePath: demoPath,
        firstTick: effectiveFirstTick,
        rawFirstTick,
        effectiveFirstTick,
        lastTick: player.getLastTick(),
        estimatedDuration: formatDuration(durationSeconds),
        estimatedDurationSeconds: durationSeconds,
        tickRate,
        playerRelatedClasses: getPlayerRelatedClasses(demo),
        playerNames: getPlayerNames(demo)
    };

    printResult(result);

    await mkdir(path.dirname(OUTPUT_FILE), { recursive: true });
    await writeFile(OUTPUT_FILE, `${JSON.stringify(result, null, 4)}\n`);
} finally {
    await player.dispose();
}

function resolveDemoPath() {
    const argument = process.argv.find(arg => arg.startsWith(DEMO_ARGUMENT_PREFIX));
    const file = argument ? argument.slice(DEMO_ARGUMENT_PREFIX.length) : DEFAULT_DEMO;

    return path.resolve(process.cwd(), file);
}

function getPlayerRelatedClasses(demo) {
    return demo.getClasses()
        .filter(clazz => PLAYER_CLASS_PATTERN.test(clazz.name))
        .map((clazz) => ({
            id: clazz.id,
            name: clazz.name,
            entityCount: demo.getEntitiesByClassName(clazz.name).length
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
}

function getPlayerNames(demo) {
    const names = new Set();

    for (const entity of demo.getEntitiesByClassName(PLAYER_CONTROLLER_CLASS)) {
        const name = entity.getField(PLAYER_NAME_FIELD);

        if (typeof name === 'string' && name.length > 0) {
            names.add(name);
        }
    }

    const userInfo = demo.stringTableContainer.getByName(StringTableType.USER_INFO.name);

    if (userInfo !== null) {
        for (const entry of userInfo.getEntries()) {
            const name = entry.value?.name;

            if (typeof name === 'string' && name.length > 0) {
                names.add(name);
            }
        }
    }

    return Array.from(names).sort((a, b) => a.localeCompare(b));
}

function formatDuration(seconds) {
    if (seconds === null) {
        return null;
    }

    const totalSeconds = Math.round(seconds);
    const minutes = Math.floor(totalSeconds / SECONDS_IN_MINUTE);
    const remainingSeconds = totalSeconds % SECONDS_IN_MINUTE;

    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

function printResult(result) {
    console.log(`File: ${result.fileName}`);
    console.log(`First tick: ${result.firstTick}`);
    console.log(`Last tick: ${result.lastTick}`);
    console.log(`Estimated duration: ${result.estimatedDuration} (${result.estimatedDurationSeconds?.toFixed(2) ?? 'N/A'}s)`);
    console.log(`Tick rate: ${result.tickRate}`);
    console.log('Player-related classes found:');

    for (const clazz of result.playerRelatedClasses) {
        console.log(`- ${clazz.name} (${clazz.entityCount} live entities)`);
    }

    console.log('Player names:');

    for (const name of result.playerNames) {
        console.log(`- ${name}`);
    }
}
