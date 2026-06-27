import { spawnSync } from 'node:child_process';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const OUTPUT_SIZE_LIMIT = 10 * 1024 * 1024;
const EXPERIMENTS_DIR = 'experiments';
const OUTPUT_DIR = 'output';

const experimentId = normalizeExperimentId(process.argv[ 2 ]);

if (!experimentId) {
    console.error('Usage: node scripts/validate-experiment.js <experiment-id>');
    process.exit(1);
}

const scriptPath = await findExperimentScript(experimentId);

if (!scriptPath) {
    console.error(`No experiment script found for ${experimentId}.`);
    process.exit(1);
}

console.log(`Experiment: ${experimentId}`);
console.log(`Script: ${scriptPath}`);

const eslintResult = runEslint(scriptPath);

if (eslintResult.status !== 0) {
    process.exit(eslintResult.status ?? 1);
}

const outputs = await findExperimentOutputs(experimentId);

if (outputs.length === 0) {
    console.warn(`No JSON outputs found for ${experimentId}.`);
}

let hasFailure = false;

for (const outputPath of outputs) {
    const info = await stat(outputPath);
    const sizeStatus = info.size <= OUTPUT_SIZE_LIMIT ? 'ok' : 'too-large';

    try {
        JSON.parse(await readFile(outputPath, 'utf8'));
    }
    catch (error) {
        hasFailure = true;
        console.error(`JSON parse failed: ${outputPath}`);
        console.error(error.message);
        continue;
    }

    if (info.size > OUTPUT_SIZE_LIMIT) {
        hasFailure = true;
    }

    console.log(`${sizeStatus}: ${outputPath} (${formatBytes(info.size)})`);
}

if (hasFailure) {
    process.exit(1);
}

console.log(`Validated ${outputs.length} output file(s).`);

function normalizeExperimentId(value) {
    if (!value || !/^\d+$/.test(value)) {
        return null;
    }

    return String(Number(value)).padStart(2, '0');
}

async function findExperimentScript(id) {
    const files = await readdir(EXPERIMENTS_DIR);
    const file = files.find((name) => name.startsWith(`${id}-`) && name.endsWith('.js'));

    return file ? path.join(EXPERIMENTS_DIR, file) : null;
}

async function findExperimentOutputs(id) {
    const files = await readdir(OUTPUT_DIR);

    return files
        .filter((name) => name.startsWith(`${id}-`) && name.endsWith('.json'))
        .sort()
        .map((name) => path.join(OUTPUT_DIR, name));
}

function runEslint(filePath) {
    const command = path.join('node_modules', '.bin', process.platform === 'win32' ? 'eslint.cmd' : 'eslint');

    return spawnSync(command, [ '--config', 'eslint.common.config.js', filePath ], {
        shell: process.platform === 'win32',
        stdio: 'inherit'
    });
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
