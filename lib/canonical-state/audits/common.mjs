import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';

export function stableStringify(value) {
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
    if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
    return JSON.stringify(value);
}

export function sha256Text(text) {
    return createHash('sha256').update(text).digest('hex');
}

export async function sha256File(file) {
    return sha256Text(await fs.readFile(file, 'utf8'));
}

export async function readJson(file) {
    return JSON.parse(await fs.readFile(file, 'utf8'));
}

export async function readJsonl(file) {
    const text = await fs.readFile(file, 'utf8');
    return text.trim().split(/\r?\n/u).filter(Boolean).map(line => JSON.parse(line));
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
    await fsModule.mkdir(file.split(/[\\/]/u).slice(0, -1).join('/'), { recursive: true });
    await fsModule.writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}
