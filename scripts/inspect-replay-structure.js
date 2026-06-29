import fs from 'node:fs';

import { inspectReplayStructure } from 'deadem';

const args = parseArgs(process.argv.slice(2));

if (args.help || args.path === null) {
    printUsage();
    process.exit(args.path === null ? 1 : 0);
}

const result = await inspectReplayStructure(args.path, {
    commandsOnly: args.commandsOnly,
    includeMessageEnvelopes: !args.commandsOnly,
    startTick: args.startTick,
    endTick: args.endTick,
    startOffset: args.startOffset,
    endOffset: args.endOffset,
    maxRecords: args.maxRecords
});

const output = JSON.stringify(result, null, 2);

if (args.output !== null) {
    fs.writeFileSync(args.output, `${output}\n`);
} else {
    process.stdout.write(`${output}\n`);
}

function parseArgs(argv) {
    const parsed = {
        path: null,
        output: null,
        commandsOnly: false,
        startTick: null,
        endTick: null,
        startOffset: null,
        endOffset: null,
        maxRecords: null,
        help: false
    };

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];

        switch (arg) {
            case '--help':
            case '-h':
                parsed.help = true;
                break;
            case '--commands-only':
                parsed.commandsOnly = true;
                break;
            case '--output':
                parsed.output = argv[++index] ?? null;
                break;
            case '--start-tick':
                parsed.startTick = parseNumber(argv[++index]);
                break;
            case '--end-tick':
                parsed.endTick = parseNumber(argv[++index]);
                break;
            case '--start-offset':
                parsed.startOffset = parseNumber(argv[++index]);
                break;
            case '--end-offset':
                parsed.endOffset = parseNumber(argv[++index]);
                break;
            case '--max-records':
                parsed.maxRecords = parseNumber(argv[++index]);
                break;
            default:
                if (parsed.path === null) {
                    parsed.path = arg;
                } else {
                    throw new Error(`Unexpected argument [ ${arg} ]`);
                }
        }
    }

    return parsed;
}

function parseNumber(value) {
    const parsed = Number.parseInt(value, 10);

    if (!Number.isInteger(parsed)) {
        throw new Error(`Expected integer argument, got [ ${value} ]`);
    }

    return parsed;
}

function printUsage() {
    process.stdout.write(`Usage: node scripts/inspect-replay-structure.js <replay.dem> [options]

Options:
  --commands-only
  --start-tick <tick>
  --end-tick <tick>
  --start-offset <byte>
  --end-offset <byte>
  --max-records <count>
  --output <path>
`);
}
