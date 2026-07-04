import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const DEFAULT_ALLOWED_ROOTS = [
    'README.md',
    'schemas',
    'docs',
    'reports',
    'tasks',
    'lib',
    'tools',
    'output/README.md',
    'output/replay-002-canonical',
    'output/replay-002-canonical-v7-validation',
    'output/replay-002-canonical-v8-validation',
    'output/replay-009-canonical',
    'output-local'
];

export function stableStringify(value) {
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
    if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
    return JSON.stringify(value);
}

export function sha256Text(text) {
    return createHash('sha256').update(text).digest('hex');
}

export function assertPathWithinRoots(file, allowedRoots = DEFAULT_ALLOWED_ROOTS) {
    const resolved = path.resolve(file);
    const normalized = resolved.replaceAll('\\', '/');
    if (normalized.includes('/samples/partida_005.dem') || normalized.includes('/output/replays/')) {
        throw new Error(`Forbidden guarded path: ${file}`);
    }
    for (const root of allowedRoots) {
        const rootResolved = path.resolve(root);
        const relative = path.relative(rootResolved, resolved);
        if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) return resolved;
    }
    throw new Error(`Path outside allowed roots: ${file}`);
}

export async function sha256FileWithinRoots(file, allowedRoots) {
    const safeFile = assertPathWithinRoots(file, allowedRoots);
    return sha256Text(await fs.readFile(safeFile, 'utf8'));
}

export async function sha256File(file) {
    return sha256FileWithinRoots(file, DEFAULT_ALLOWED_ROOTS);
}

export async function readJsonWithinRoots(file, allowedRoots) {
    const safeFile = assertPathWithinRoots(file, allowedRoots);
    return JSON.parse(await fs.readFile(safeFile, 'utf8'));
}

export async function readJson(file) {
    return readJsonWithinRoots(file, DEFAULT_ALLOWED_ROOTS);
}

export async function readJsonlWithinRoots(file, allowedRoots) {
    const safeFile = assertPathWithinRoots(file, allowedRoots);
    const text = await fs.readFile(safeFile, 'utf8');
    return text.trim().split(/\r?\n/u).filter(Boolean).map(line => JSON.parse(line));
}

export async function readJsonl(file) {
    return readJsonlWithinRoots(file, DEFAULT_ALLOWED_ROOTS);
}

export function walk(value, visitor, path = []) {
    visitor(value, path);
    if (Array.isArray(value)) value.forEach((item, index) => walk(item, visitor, [...path, String(index)]));
    else if (value && typeof value === 'object') {
        for (const [key, child] of Object.entries(value)) walk(child, visitor, [...path, key]);
    }
}

export async function loadCanonicalPackage(outputDir) {
    return {
        playerRegistry: await readJson(`${outputDir}/player-registry.json`),
        entityRegistry: await readJson(`${outputDir}/entity-registry.json`),
        factualEvents: await readJsonl(`${outputDir}/factual-events.jsonl`),
        nonTimelineMetadata: await readJson(`${outputDir}/non-timeline-metadata.json`),
        independentValidationOverlay: await readJson(`${outputDir}/independent-validation-overlay.json`),
        snapshots: await readJsonl(`${outputDir}/snapshots.jsonl`),
        capabilityMatrix: await readJson(`${outputDir}/capability-matrix.json`),
        validationSummary: await readJson(`${outputDir}/validation-summary.json`),
        canonicalGate: await readJson(`${outputDir}/canonical-state-gate.json`)
    };
}

export async function writeJson(file, value, fsModule = fs) {
    const safeFile = assertPathWithinRoots(file, DEFAULT_ALLOWED_ROOTS);
    const safeDir = assertPathWithinRoots(path.dirname(safeFile), DEFAULT_ALLOWED_ROOTS);
    await fsModule.mkdir(safeDir, { recursive: true });
    await fsModule.writeFile(safeFile, `${JSON.stringify(value, null, 2)}\n`);
}
