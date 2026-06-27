import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const EXPERIMENTS_DIR = 'experiments';
const OUTPUT_DIR = 'output';
const REPORTS_DIR = 'reports';
const LARGE_PARSE_LIMIT = 1024 * 1024;

const experimentId = normalizeExperimentId(process.argv[ 2 ]);

if (!experimentId) {
    console.error('Usage: node scripts/summarize-experiment.js <experiment-id>');
    process.exit(1);
}

const scriptPath = await findExperimentScript(experimentId);
const outputs = await findExperimentOutputs(experimentId);
const reports = await findExperimentReports(experimentId);

console.log(`Experiment: ${experimentId}`);
console.log(`Script: ${scriptPath ?? 'not found'}`);
console.log(`Outputs: ${outputs.length}`);

for (const outputPath of outputs) {
    const info = await stat(outputPath);
    const summary = await summarizeJson(outputPath, info.size);

    console.log(`- ${outputPath} (${formatBytes(info.size)})${summary}`);
}

console.log(`Reports: ${reports.length}`);

for (const reportPath of reports) {
    console.log(`- ${reportPath}`);
}

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

async function findExperimentReports(id) {
    const files = await readdir(REPORTS_DIR);

    return files
        .filter((name) => name.includes(id) && name.endsWith('.md'))
        .sort()
        .map((name) => path.join(REPORTS_DIR, name));
}

async function summarizeJson(filePath, size) {
    if (size > LARGE_PARSE_LIMIT) {
        return ' - large JSON, top-level summary skipped';
    }

    const data = JSON.parse(await readFile(filePath, 'utf8'));

    if (Array.isArray(data)) {
        return ` - array length ${data.length}`;
    }

    if (data && typeof data === 'object') {
        return ` - keys: ${Object.keys(data).slice(0, 8).join(', ')}`;
    }

    return ` - ${typeof data}`;
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
