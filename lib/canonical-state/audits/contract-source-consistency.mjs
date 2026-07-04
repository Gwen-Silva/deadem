import { canonicalContractForJson } from '../contract.mjs';
import { readJson, sha256Text, stableStringify } from './common.mjs';

function diffPaths(a, b, prefix = '$', out = []) {
    if (stableStringify(a) === stableStringify(b)) return out;
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) || Array.isArray(b)) {
        out.push({ path: prefix, expected: a, actual: b });
        return out;
    }
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const key of [...keys].sort()) {
        if (!(key in a)) out.push({ path: `${prefix}.${key}`, expected: undefined, actual: b[key] });
        else if (!(key in b)) out.push({ path: `${prefix}.${key}`, expected: a[key], actual: undefined });
        else diffPaths(a[key], b[key], `${prefix}.${key}`, out);
    }
    return out;
}

export async function auditContractSourceConsistency({ schemaPath, emittedPath }) {
    const inMemory = canonicalContractForJson();
    const schemaJson = await readJson(schemaPath);
    const emittedJson = await readJson(emittedPath);
    const hashes = {
        inMemory: sha256Text(stableStringify(inMemory)),
        schemaJson: sha256Text(stableStringify(schemaJson)),
        emittedJson: sha256Text(stableStringify(emittedJson))
    };
    const schemaDiffs = diffPaths(inMemory, schemaJson);
    const emittedDiffs = diffPaths(inMemory, emittedJson);
    return {
        schemaVersion: 1,
        sourceOfTruth: 'lib/canonical-state/contract.mjs',
        schemaPath,
        emittedPath,
        hashes,
        schemaDiffs,
        emittedDiffs,
        passed: schemaDiffs.length === 0 && emittedDiffs.length === 0 && hashes.inMemory === hashes.schemaJson && hashes.inMemory === hashes.emittedJson
    };
}
