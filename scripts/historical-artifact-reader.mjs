import fs from 'node:fs/promises';
import { readFileSync, lstatSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertUnprotectedName, repositoryPath, assertNoLinkedAncestor } from './hygiene-paths.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const exec = promisify(execFile);
const manifestPath = path.join(ROOT, 'artifacts/repository-hygiene/task222/retirement-manifest.json');
let cachedManifest;
function manifest() { cachedManifest ??= JSON.parse(readFileSync(manifestPath, 'utf8')); return cachedManifest; }

function checkArtifactPath(file) {
    const relative = path.isAbsolute(file) ? path.relative(ROOT, file).replaceAll('\\', '/') : String(file).replaceAll('\\', '/');
    if (!relative.startsWith('output/')) return;
    const resolved = repositoryPath(relative, ROOT);
    try {
        assertNoLinkedAncestor(relative, ROOT);
        if (lstatSync(resolved.absolute).isSymbolicLink()) throw new Error('linked_historical_artifact_rejected');
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
}

export function retiredGroup(file, data, root = ROOT) {
    assertUnprotectedName(file);
    const normalized = path.isAbsolute(file) ? path.relative(root, file).replaceAll('\\', '/') : String(file).replaceAll('\\', '/');
    // Non-artifact inputs keep their existing IO behavior, never become Git queries.
    if (!normalized.startsWith('output/') || !normalized.endsWith('.jsonl')) return null;
    repositoryPath(normalized, root);
    const group = data.groups.find(g => g.status === 'RETIRED' && (normalized === g.originalPath || (g.selector === 'direct_jsonl_children' && path.posix.dirname(normalized) === g.originalPath)) && !(g.retainedNames ?? []).includes(path.posix.basename(normalized)));
    if (!group) return null;
    repositoryPath(group.originalPath, root);
    if (!/^[0-9a-f]{40}$/u.test(group.baseCommit)) throw new Error('invalid_historical_base');
    return { ...group, relativePath: normalized };
}

// No extraction or restoration. Explicit historical tools can read exactly the
// historical Git blob on demand, while active UI paths keep normal filesystem IO.
export function createHistoricalReader({ readFile = fs.readFile, stat = fs.stat, getManifest = manifest, git = exec, root = ROOT, checkPath = checkArtifactPath } = {}) {
    async function fallback(file, error, metadataOnly, options) {
        if (error.code !== 'ENOENT') throw error;
        const group = retiredGroup(file, getManifest(), root);
        if (!group) throw error;
        const ref = `${group.baseCommit}:${group.relativePath}`;
        if (metadataOnly) {
            const result = await git('git', ['cat-file', '-s', ref], { cwd: root, encoding: 'utf8' });
            const size = Number(result.stdout.trim());
            if (!Number.isSafeInteger(size) || size < 0) throw new Error('invalid_historical_size');
            return { size, isFile: () => true, isDirectory: () => false, isSymbolicLink: () => false };
        }
        const result = await git('git', ['show', ref], { cwd: root, encoding: 'buffer', maxBuffer: 128 * 1024 * 1024 });
        const bytes = Buffer.from(result.stdout);
        const encoding = typeof options === 'string' ? options : options?.encoding;
        return encoding ? bytes.toString(encoding) : bytes;
    }
    return {
        async readFile(file, options) {
            assertUnprotectedName(file);
            checkPath(file);
            try { return await readFile(file, options); } catch (error) { return fallback(file, error, false, options); }
        },
        async stat(file, options) {
            assertUnprotectedName(file);
            checkPath(file);
            try { return await stat(file, options); } catch (error) { return fallback(file, error, true); }
        }
    };
}

export const historicalReader = createHistoricalReader();
export const historicalFs = { ...fs, ...historicalReader };
