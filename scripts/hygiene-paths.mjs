import path from 'node:path';
import { lstatSync, readdirSync } from 'node:fs';
import { assertNoProtectedAlias } from '../tools/continuous-review/intake-model.mjs';
import { fileURLToPath } from 'node:url';
const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Repository role distinguishes a document mentioning an input from the input
// itself. This classifier is lexical: never stat or realpath to classify.
export function classifyFilesystemTarget(value, { root = REPOSITORY_ROOT } = {}) {
    let text = value instanceof URL ? fileURLToPath(value) : String(value ?? '');
    if (!text || text.includes('\0')) return 'UNRESOLVED';
    for (let i=0;i<4;i++) {
        let decoded;
        try { decoded=decodeURIComponent(text); } catch { return 'UNRESOLVED'; }
        if(decoded===text)break;
        text=decoded;
        if(i===3&&/%[0-9a-f]{2}/iu.test(text))return 'UNRESOLVED';
    }
    const normalized=text.replaceAll('\\','/');
    if(normalized.split('/').includes('..'))return 'UNRESOLVED';
    const relative=path.isAbsolute(text)?path.relative(root,text).replaceAll('\\','/'):normalized;
    const repositoryMetadata =
        /^[^/]+\.md$/iu.test(relative) ||
        /^tasks\/(?:completed|active|pending|blocked|backlog)\/[^/]+\.md$/iu.test(relative) ||
        /^tasks\/specs\/\d{3}\.json$/u.test(relative) ||
        /^(?:docs|reports)\/.+\.(?:md|json)$/iu.test(relative) ||
        /^schemas\/.+\.json$/iu.test(relative) ||
        /^data\/[^/]+\.json$/iu.test(relative) ||
        /^(?:scripts|tools|tests|lib|experiments|packages|src)\/.+\.(?:[cm]?js|jsx|tsx?|py|css|html|svg)$/iu.test(relative);
    if(repositoryMetadata)return 'SAFE_REPOSITORY_METADATA';
    try { assertNoProtectedAlias(text); }
    catch(error) { return error.code==='protected_target_id'?'PROTECTED_INPUT':'UNRESOLVED'; }
    return 'OTHER_ALLOWED_REPOSITORY_PATH';
}

export function assertUnprotectedName(value) {
    const classification=classifyFilesystemTarget(value);
    if(classification==='PROTECTED_INPUT')throw new Error('protected_alias_rejected_before_io');
    if(classification==='UNRESOLVED')throw new Error('unresolved_filesystem_target');
    return value;
}

export function repositoryPath(value, root = process.cwd()) {
    assertUnprotectedName(value);
    const name = String(value).replaceAll('\\', '/');
    if (!name || name.includes('\0') || name.includes(':') || name.startsWith('/') || name.split('/').some(p => !p || p === '.' || p === '..')) throw new Error('unsafe_repository_path');
    const absolute = path.resolve(root, name);
    if (!absolute.startsWith(path.resolve(root) + path.sep)) throw new Error('outside_repository');
    return { relative: name, absolute };
}

// Never follow a junction/symlink through a permitted-looking name.
export function assertNoLinkedAncestor(value, root = process.cwd(), io = { lstatSync }) {
    const result = repositoryPath(value, root);
    const parts = result.relative.split('/');
    for (let i = 1; i < parts.length; i++) {
        const prefix = parts.slice(0, i).join('/');
        assertUnprotectedName(prefix);
        const info = io.lstatSync(path.join(root, prefix));
        if (info.isSymbolicLink() || !info.isDirectory()) throw new Error('linked_or_non_directory_ancestor');
    }
    return result;
}

// Bounded, opt-in test/diagnostic snapshots; never a broad .local walker.
// Enumeration returns names only. Each child is classified before metadata.
export function snapshotAllowedMetadata(roots, {
    root = process.cwd(), io = { lstatSync, readdirSync },
    assertAllowed = assertUnprotectedName, maxEntries = 1000, maxDepth = 8
} = {}) {
    const files = [], excluded = [];
    let visited = 0;
    function allowed(candidate) {
        try { assertUnprotectedName(candidate); assertAllowed(candidate); }
        catch (error) { excluded.push({ path: candidate, reason: error.message }); return false; }
        return true;
    }
    function walk(candidate, depth) {
        if (!allowed(candidate)) return;
        const resolved = repositoryPath(candidate, root);
        if (++visited > maxEntries || depth > maxDepth) throw new Error('bounded_snapshot_limit_exceeded');
        let info;
        try { info = io.lstatSync(resolved.absolute); }
        catch (error) { if (error.code === 'ENOENT') return; throw error; }
        if (info.isSymbolicLink()) { excluded.push({ path: candidate, reason: 'link_not_followed' }); return; }
        if (info.isDirectory()) {
            for (const name of io.readdirSync(resolved.absolute)) {
                if (typeof name !== 'string' || /[\\/]/u.test(name) || name === '.' || name === '..') throw new Error('invalid_enumerated_name');
                walk(`${candidate}/${name}`, depth + 1);
            }
        } else if (info.isFile()) files.push(`${candidate}:${info.size}`);
    }
    for (const candidate of roots) {
        if (!allowed(candidate)) continue;
        const normalized = repositoryPath(candidate, root).relative;
        if (normalized.split('/').length < 3 || ['.local/deadem', '.local/codex'].includes(normalized)) throw new Error('broad_snapshot_root_rejected');
        // Lexically allowed root first, then reject any linked ancestor.
        try { assertNoLinkedAncestor(normalized, root, io); }
        catch (error) { if (error.code === 'ENOENT') continue; throw error; }
        walk(normalized, 0);
    }
    return { files: files.sort(), excluded, visited };
}
