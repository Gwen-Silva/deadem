import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const OUTPUT_SIZE_LIMIT = 10 * 1024 * 1024;
const OUTPUT_DIR = 'output';

const experimentId = normalizeExperimentId(process.argv[ 2 ]);
const outputs = await findOutputs(experimentId);
let hasFailure = false;

if (outputs.length === 0) {
    console.warn(experimentId ? `No JSON outputs found for ${experimentId}.` : 'No JSON outputs found.');
}

for (const outputPath of outputs) {
    const info = await stat(outputPath);

    if (info.size > OUTPUT_SIZE_LIMIT) {
        hasFailure = true;
        console.error(`too-large: ${outputPath} (${formatBytes(info.size)})`);
        continue;
    }

    console.log(`ok: ${outputPath} (${formatBytes(info.size)})`);
}

if (hasFailure) {
    process.exit(1);
}

console.log(`Checked ${outputs.length} output file(s).`);

function normalizeExperimentId(value) {
    if (!value) {
        return null;
    }

    if (!/^\d+$/.test(value)) {
        console.error('Experiment id must be numeric.');
        process.exit(1);
    }

    return String(Number(value)).padStart(2, '0');
}

async function findOutputs(id) {
    const files = await readdir(OUTPUT_DIR);

    return files
        .filter((name) => name.endsWith('.json'))
        .filter((name) => !id || name.startsWith(`${id}-`))
        .sort()
        .map((name) => path.join(OUTPUT_DIR, name));
}

function formatBytes(bytes) {
    if (bytes < 1024) {
        return `${bytes} B`;
    }

    if (bytes < 1024 * 1024) {
        return `${(bytes / 1024).toFixed(1)} KiB`;
    }

    return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}
