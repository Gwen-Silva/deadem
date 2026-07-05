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
    'output/replay-002-canonical-v9-validation',
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

export function assertRelativePathInScope(relativePath) {
    if (typeof relativePath !== 'string' || relativePath.length === 0) throw new Error('Empty relative path');
    if (path.isAbsolute(relativePath)) throw new Error(`Absolute paths are not allowed in scoped artifacts: ${relativePath}`);
    const normalized = relativePath.replaceAll('\\', '/');
    if (normalized.split('/').some(segment => segment === '..')) throw new Error(`Path traversal is not allowed in scoped artifacts: ${relativePath}`);
    return normalized;
}

export function resolveScopedArtifact(root, relativePath) {
    const safeRelative = assertRelativePathInScope(relativePath);
    const safeRoot = assertPathWithinRoots(root, [root]);
    return assertPathWithinRoots(path.join(safeRoot, safeRelative), [safeRoot]);
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

export async function writeJsonWithinRoots(file, value, allowedRoots, fsModule = fs) {
    const safeFile = assertPathWithinRoots(file, allowedRoots);
    const safeDir = assertPathWithinRoots(path.dirname(safeFile), allowedRoots);
    await fsModule.mkdir(safeDir, { recursive: true });
    await fsModule.writeFile(safeFile, `${JSON.stringify(value, null, 2)}\n`);
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
    await writeJsonWithinRoots(file, value, DEFAULT_ALLOWED_ROOTS, fsModule);
}
