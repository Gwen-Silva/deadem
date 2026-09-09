import { lstatSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertUnprotectedName, repositoryPath, assertNoLinkedAncestor } from './hygiene-paths.mjs';

export const OUTPUT_SIZE_LIMIT = 100 * 1024;

export function parseNameStatus(text) {
    const parts = text.split('\0');
    const result = [];
    for (let i = 0; i < parts.length && parts[i];) {
        const status = parts[i++];
        const first = parts[i++];
        if (!first) throw new Error('malformed_git_name_status');
        if (/^[RC]/u.test(status)) {
            const destination = parts[i++];
            if (!destination) throw new Error('malformed_git_rename');
            result.push({ status, path: destination, oldPath: first });
        } else result.push({ status, path: first });
    }
    return result;
}

export function validateLargeExceptions(entries = []) {
    return entries.map(entry => {
        if (!entry || typeof entry !== 'object' || typeof entry.path !== 'string' || typeof entry.reason !== 'string' || !entry.reason.trim()) throw new Error('large_output_requires_exact_path_and_reason');
        if (/[*?\[\]{}!]/u.test(entry.path)) throw new Error('wildcard_large_output_bypass_rejected');
        repositoryPath(entry.path);
        return entry.path;
    });
}

export function checkChangedArtifacts(changes, spec, { root = process.cwd(), io = { lstatSync }, ancestorCheck = assertNoLinkedAncestor } = {}) {
    const allowed = new Set(validateLargeExceptions(spec.largeOutputsAllowed));
    const results = [];
    for (const change of changes) {
        try {
            const resolved = repositoryPath(change.path, root);
            if (change.oldPath) assertUnprotectedName(change.oldPath);
            // Even a prohibited deletion is rejected by name; no stat on deletions.
            if (change.status === 'D') { results.push({ ...change, passed: true, action: 'deleted_no_stat' }); continue; }
            ancestorCheck(change.path, root, io);
            const info = io.lstatSync(resolved.absolute);
            if (!info.isFile() || info.isSymbolicLink()) throw new Error('changed_destination_not_regular_file');
            const passed = info.size <= OUTPUT_SIZE_LIMIT || allowed.has(change.path);
            results.push({ ...change, bytes: info.size, passed, action: passed ? 'allowed' : 'explicit_large_output_authorization_required' });
        } catch (error) { results.push({ ...change, passed: false, error: error.message }); }
    }
    return { passed: results.every(r => r.passed), checked: results.length, results };
}

export function collectChanges(base, root = process.cwd(), git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })) {
    if (!/^[0-9a-f]{40}$/u.test(base)) throw new Error('accepted_base_must_be_full_sha');
    const changes = parseNameStatus(git(['diff', '--name-status', '-z', '-M', base, '--']));
    for (const file of git(['ls-files', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean)) changes.push({ status: 'A', path: file });
    return [...new Map(changes.map(c => [c.path, c])).values()];
}

function main() {
    const state = JSON.parse(readFileSync('data/project-coordination-state.json', 'utf8'));
    const args = process.argv.slice(2);
    const task = args.includes('--task') ? args[args.indexOf('--task') + 1] : state.activeTaskId;
    if (!/^\d{3}$/u.test(task)) throw new Error('invalid_task_id');
    if (args.length && (args.length !== 2 || args[0] !== '--task')) throw new Error('Use check:outputs [--task NNN]; historical experiment scanning is retired.');
    const spec = JSON.parse(readFileSync(`tasks/specs/${task}.json`, 'utf8'));
    if (spec.baseCommitExpected !== state.lastAcceptedCommit || task !== state.activeTaskId) throw new Error('task_base_or_active_task_mismatch');
    const result = checkChangedArtifacts(collectChanges(spec.baseCommitExpected), spec);
    console.log(JSON.stringify(result, null, 2));
    if (!result.passed) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
