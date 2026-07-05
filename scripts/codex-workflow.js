#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync, statSync } from 'node:fs';
import { mkdir, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOCAL_ROOT = '.local/codex';
const CONTEXT_LIMIT = 16 * 1024;
const REVIEW_MD_LIMIT = 24 * 1024;
const REVIEW_JSON_LIMIT = 32 * 1024;
const AGENTS_LIMIT = 8 * 1024;
const CURRENT_STATE_LIMIT = 4 * 1024;
const LARGE_FILE_LIMIT = 100 * 1024;
const EXCLUDED_DIRS = ['.git/', 'node_modules/', '.local/', 'output/', 'output-local/', 'samples/', 'videos/', 'dist/', 'tmp/', 'temp/'];
const REQUIRED_SPEC_FIELDS = [
    'taskId',
    'title',
    'status',
    'objective',
    'readPaths',
    'optionalReadPaths',
    'writePaths',
    'forbiddenPaths',
    'requiredPolicies',
    'requiredCommands',
    'expectedOutputs',
    'largeOutputsAllowed',
    'replayProcessingAllowed',
    'followUpTask',
    'stopConditions',
    'successGate',
    'blockedGate',
    'gateSource'
];
const PROTECTED_PATTERNS = [/partida_005\.dem/iu, /replay_005/iu, /replay_006/iu, /replay_007/iu, /replay_008/iu];

function rel(file) {
    return path.relative(ROOT, path.resolve(file)).replaceAll(path.sep, '/');
}

function isInside(parent, child) {
    const relative = path.relative(parent, child);
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

async function resolveRepoPath(file, options = {}) {
    const { forWrite = false, root = ROOT } = options;
    if (typeof file !== 'string' || file.length === 0) throw new Error('empty path is not allowed');
    if (path.isAbsolute(file)) throw new Error(`absolute path is not allowed: ${file}`);
    const normalized = file.replaceAll('\\', '/');
    if (normalized.split('/').includes('..')) throw new Error(`path traversal is not allowed: ${file}`);
    if (/\.dem$/iu.test(normalized)) throw new Error(`replay binary path is forbidden: ${file}`);
    const rootReal = await realpath(root);
    const resolved = path.resolve(ROOT, normalized);
    if (!isInside(rootReal, resolved)) throw new Error(`path escapes repository: ${file}`);
    if (existsSync(resolved)) {
        const actual = await realpath(resolved);
        if (!isInside(rootReal, actual)) throw new Error(`realpath escapes repository: ${file}`);
        return actual;
    }
    if (!forWrite) return resolved;
    let ancestor = path.dirname(resolved);
    const missing = [];
    while (!existsSync(ancestor)) {
        missing.unshift(path.basename(ancestor));
        const next = path.dirname(ancestor);
        if (next === ancestor) throw new Error(`no existing ancestor for ${file}`);
        ancestor = next;
    }
    const ancestorReal = await realpath(ancestor);
    if (!isInside(rootReal, ancestorReal)) throw new Error(`write ancestor escapes repository: ${file}`);
    const finalPath = path.join(ancestorReal, ...missing, path.basename(resolved));
    if (!isInside(rootReal, finalPath)) throw new Error(`write path escapes repository: ${file}`);
    return finalPath;
}

function safePathResult(file) {
    if (typeof file !== 'string' || file.length === 0) return { path: file, safe: false, error: 'empty path' };
    if (path.isAbsolute(file)) return { path: file, safe: false, error: 'absolute path' };
    const normalized = file.replaceAll('\\', '/');
    if (normalized.split('/').includes('..')) return { path: file, safe: false, error: 'path traversal' };
    if (/\.dem$/iu.test(normalized)) return { path: file, safe: false, error: 'replay binary' };
    return { path: file, safe: true };
}

function sha256(value) {
    return createHash('sha256').update(value).digest('hex');
}

async function sha256File(file) {
    return sha256(await readFile(file));
}

function patternToRegExp(pattern) {
    const normalized = pattern.replaceAll('\\', '/');
    const escaped = normalized.replace(/[.+^${}()|[\]\\]/gu, '\\$&')
        .replaceAll('**', '::DS::')
        .replaceAll('*', '[^/]*')
        .replaceAll('::DS::', '.*');
    return new RegExp(`^${escaped}$`, 'u');
}

function pathMatches(pattern, candidate) {
    const normalized = candidate.replaceAll('\\', '/');
    if (pattern.endsWith('/**')) {
        const prefix = pattern.slice(0, -3);
        return normalized === prefix || normalized.startsWith(`${prefix}/`);
    }
    return patternToRegExp(pattern).test(normalized);
}

function matchesAny(patterns, candidate) {
    return (patterns ?? []).some(pattern => pathMatches(typeof pattern === 'string' ? pattern : pattern.path, candidate));
}

function hasProtectedReplayReference(value) {
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    return /\.dem\b/iu.test(text) || PROTECTED_PATTERNS.some(pattern => pattern.test(text));
}

function normalizeCheck(check) {
    if (typeof check === 'string') return { id: check.replaceAll(/\W+/gu, '-').replace(/^-|-$/gu, ''), command: check };
    return check;
}

async function loadSpec(taskId, options = {}) {
    const specDir = options.specDir ?? 'tasks/specs';
    const specPath = `${specDir}/${taskId}.json`;
    const resolved = await resolveRepoPath(specPath);
    const spec = JSON.parse(await readFile(resolved, 'utf8'));
    return { spec, specPath };
}

function validateSpecObject(spec, specPath = '') {
    const errors = [];
    const warnings = [];
    for (const field of REQUIRED_SPEC_FIELDS) if (!(field in spec)) errors.push(`missing field: ${field}`);
    const fileId = path.basename(specPath, '.json');
    if (fileId && spec.taskId !== fileId) errors.push(`taskId ${spec.taskId} does not match file ${fileId}`);
    if (!['authorized', 'blocked', 'pending', 'active', 'completed'].includes(spec.status)) errors.push(`invalid status: ${spec.status}`);
    for (const field of ['readPaths', 'optionalReadPaths', 'writePaths', 'forbiddenPaths', 'requiredPolicies', 'requiredCommands', 'expectedOutputs', 'largeOutputsAllowed', 'stopConditions']) {
        if (field in spec && !Array.isArray(spec[field])) errors.push(`${field} must be an array`);
    }
    if (!spec.followUpTask) errors.push('followUpTask is required');
    if (Array.isArray(spec.followUpTask)) errors.push('more than one follow-up is not allowed');
    if (!spec.successGate) errors.push('successGate is required');
    if (!spec.blockedGate) errors.push('blockedGate is required');
    if (!['spec', 'json-file'].includes(spec.gateSource?.type)) errors.push('gateSource.type must be spec or json-file');
    if (spec.gateSource?.type === 'json-file' && (!spec.gateSource.path || !spec.gateSource.jsonField)) errors.push('json-file gateSource requires path and jsonField');
    for (const check of spec.requiredCommands ?? []) {
        const normalizedCheck = normalizeCheck(check);
        if (!normalizedCheck.id || !normalizedCheck.command) errors.push('requiredCommands entries need id and command');
        else if (!commandAllowed(normalizedCheck.command)) errors.push(`required command is not allowed: ${normalizedCheck.command}`);
    }
    for (const field of ['readPaths', 'optionalReadPaths', 'writePaths', 'requiredPolicies', 'expectedOutputs']) {
        for (const item of spec[field] ?? []) {
            const value = typeof item === 'string' ? item : item.path;
            if (!value) continue;
            const safe = safePathResult(value.replace(/\*.*$/u, 'placeholder'));
            if (!safe.safe) errors.push(`${field} contains unsafe path ${value}: ${safe.error}`);
            if (hasProtectedReplayReference(value)) errors.push(`${field} references protected or unsupported replay path: ${value}`);
        }
    }
    for (const item of spec.largeOutputsAllowed ?? []) {
        const value = typeof item === 'string' ? item : item.path;
        if (hasProtectedReplayReference(value)) errors.push(`largeOutputsAllowed references protected replay path: ${value}`);
    }
    const gatePath = spec.gateSource?.path;
    if (gatePath) {
        const safe = safePathResult(gatePath);
        if (!safe.safe) errors.push(`gateSource path is unsafe: ${gatePath}`);
        if (hasProtectedReplayReference(gatePath)) errors.push(`gateSource references protected replay path: ${gatePath}`);
    }
    if (spec.replayProcessingAllowed === true) warnings.push('replay processing explicitly allowed');
    return { valid: errors.length === 0, errors, warnings };
}

async function ensureSpec(taskId, options = {}) {
    const loaded = await loadSpec(taskId, options);
    const validation = validateSpecObject(loaded.spec, loaded.specPath);
    if (!validation.valid) {
        const error = new Error(`invalid task spec ${taskId}: ${validation.errors.join('; ')}`);
        error.validation = validation;
        throw error;
    }
    return { ...loaded, validation };
}

function git(args) {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function gitStatusShort() {
    return git(['status', '--short']);
}

function changedFilesSince(base) {
    const files = new Set();
    for (const args of [
        ['diff', '--name-only', base, 'HEAD'],
        ['diff', '--name-only'],
        ['diff', '--name-only', '--cached'],
        ['ls-files', '--others', '--exclude-standard']
    ]) {
        const output = git(args);
        for (const line of output.split(/\r?\n/u).filter(Boolean)) files.add(line.replaceAll('\\', '/'));
    }
    return [...files].sort();
}

async function fileInfo(file, purpose = '') {
    const info = { path: file, purpose, exists: false, sizeBytes: null, lineCount: null, sha256: null, large: false };
    const resolved = await resolveRepoPath(file);
    if (!existsSync(resolved)) return info;
    const stats = await stat(resolved);
    info.exists = true;
    info.sizeBytes = stats.size;
    info.large = stats.size > LARGE_FILE_LIMIT;
    if (stats.isFile()) {
        info.sha256 = await sha256File(resolved);
        if (!info.large) info.lineCount = (await readFile(resolved, 'utf8')).split(/\r?\n/u).length;
    }
    return info;
}

function formatFileInfo(info) {
    return `- ${info.path} | ${info.purpose} | exists=${info.exists} | size=${info.sizeBytes ?? 'missing'} | lines=${info.lineCount ?? 'n/a'} | sha256=${info.sha256 ?? 'n/a'}${info.large ? ' | large-not-included' : ''}`;
}

async function buildContextText(spec, specPath) {
    const files = [];
    for (const readPath of spec.readPaths) files.push(await fileInfo(readPath, 'required read'));
    for (const optionalPath of spec.optionalReadPaths) files.push(await fileInfo(optionalPath, 'optional read'));
    const policies = [];
    for (const policy of spec.requiredPolicies) policies.push(await fileInfo(policy, 'required policy'));
    const lines = [
        `# Codex Context Packet ${spec.taskId}`,
        '',
        `Task: ${spec.taskId} - ${spec.title}`,
        `Status: ${spec.status}`,
        `Objective: ${spec.objective}`,
        `Spec: ${specPath}`,
        `Commit: ${git(['rev-parse', '--short', 'HEAD'])}`,
        'Git status:',
        '```text',
        gitStatusShort() || 'clean',
        '```',
        '',
        '## Required Read Paths',
        ...files.filter(item => item.purpose === 'required read').map(formatFileInfo),
        '',
        '## Optional Read Paths',
        ...files.filter(item => item.purpose === 'optional read').map(formatFileInfo),
        '',
        '## Write Paths',
        ...spec.writePaths.map(item => `- ${item}`),
        '',
        '## Forbidden Paths',
        ...spec.forbiddenPaths.map(item => `- ${item}`),
        '',
        '## Policies',
        ...policies.map(formatFileInfo),
        '',
        '## Required Checks',
        ...spec.requiredCommands.map(item => `- ${normalizeCheck(item).id}: ${normalizeCheck(item).command}`),
        '',
        '## Stop Conditions',
        ...spec.stopConditions.map(item => `- ${item}`),
        '',
        `Excluded directories: ${EXCLUDED_DIRS.join(', ')}`
    ];
    return `${lines.join('\n')}\n`;
}

async function localTaskDir(taskId, options = {}) {
    const dir = await resolveRepoPath(`${LOCAL_ROOT}/${taskId}`, { forWrite: true });
    if (!options.dryRun) await mkdir(dir, { recursive: true });
    return dir;
}

async function buildContextPacket(taskId, options = {}) {
    const { spec, specPath } = await ensureSpec(taskId, options);
    if (spec.status === 'blocked' && !options.dryRun) throw new Error(`task ${taskId} is blocked; use --dry-run for validation only`);
    const text = await buildContextText(spec, specPath);
    const sizeBytes = Buffer.byteLength(text, 'utf8');
    if (sizeBytes > CONTEXT_LIMIT) throw new Error(`context packet exceeds ${CONTEXT_LIMIT} bytes`);
    const target = `${LOCAL_ROOT}/${taskId}/context-packet.md`;
    const result = {
        path: target,
        sizeBytes,
        sha256: sha256(text),
        validations: { underLimit: true, dryRun: options.dryRun === true },
        preview: text.slice(0, 1200),
        spec
    };
    if (!options.dryRun) {
        const dir = await localTaskDir(taskId);
        await writeFile(path.join(dir, 'context-packet.md'), text);
    }
    return result;
}

async function preflight(taskId, options = {}) {
    const { spec, validation } = await ensureSpec(taskId, options);
    const failures = [];
    const warnings = [...validation.warnings];
    if (spec.status === 'blocked' && !options.dryRun) failures.push(`task ${taskId} is blocked`);
    for (const field of ['readPaths', 'optionalReadPaths', 'writePaths', 'requiredPolicies', 'expectedOutputs']) {
        for (const item of spec[field] ?? []) {
            const value = typeof item === 'string' ? item : item.path;
            if (hasProtectedReplayReference(value)) failures.push(`${field} contains protected replay reference: ${value}`);
        }
    }
    for (const policy of spec.requiredPolicies) if (!existsSync(await resolveRepoPath(policy))) failures.push(`required policy not found: ${policy}`);
    if (statSync(await resolveRepoPath('AGENTS.md')).size > AGENTS_LIMIT) failures.push(`AGENTS.md exceeds ${AGENTS_LIMIT}`);
    if (statSync(await resolveRepoPath('docs/codex/CURRENT_STATE.md')).size > CURRENT_STATE_LIMIT) failures.push(`CURRENT_STATE.md exceeds ${CURRENT_STATE_LIMIT}`);
    if (gitStatusShort()) warnings.push('working tree has changes; ensure they belong to the current task');
    return { taskId, dryRun: options.dryRun === true, failures, warnings, passed: failures.length === 0 };
}

function isAllowedWrite(spec, file) {
    return matchesAny(spec.writePaths, file);
}

function isForbidden(spec, file) {
    return matchesAny(spec.forbiddenPaths, file) || hasProtectedReplayReference(file);
}

function largeAllowed(spec, file) {
    return (spec.largeOutputsAllowed ?? []).some(item => pathMatches(typeof item === 'string' ? item : item.path, file));
}

async function classifyChangedFile(spec, file) {
    const resolved = await resolveRepoPath(file, { forWrite: true });
    const exists = existsSync(resolved);
    const tracked = git(['ls-files', '--', file]) !== '';
    const status = gitStatusShort().split(/\r?\n/u).find(line => line.slice(3) === file || line.includes(file))?.slice(0, 2).trim() || (tracked ? 'modified' : 'untracked');
    const large = exists && statSync(resolved).size > LARGE_FILE_LIMIT;
    return {
        file,
        status,
        kind: !tracked && exists ? 'untracked' : status.includes('D') ? 'removed' : status.includes('R') ? 'renamed' : 'modified',
        allowed: isAllowedWrite(spec, file),
        forbidden: isForbidden(spec, file),
        largeUnauthorized: large && !largeAllowed(spec, file),
        regenerationViolation: regenerationViolation(spec, file),
        exists
    };
}

function regenerationViolation(spec, file) {
    const policy = spec.regenerationPolicy ?? {};
    if (policy.canonicalFacts === 'reuse' && /^output\/replay-002-canonical\/(factual-events\.jsonl|snapshots\.jsonl|entity-registry\.json|player-registry\.json)$/u.test(file)) return 'canonicalFacts:reuse';
    if (policy.canonicalFacts === 'forbidden' && file.startsWith('output/replay-002-canonical/')) return 'canonicalFacts:forbidden';
    if (policy.replayParsing === 'forbidden' && file.startsWith('samples/')) return 'replayParsing:forbidden';
    return null;
}

function parseCommand(command) {
    return command.split(/\s+/u);
}

function commandAllowed(command) {
    const parts = parseCommand(command);
    if (parts[0] === 'npm' && parts[1] === 'run') {
        const packageJson = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
        return Boolean(packageJson.scripts?.[parts[2]]);
    }
    if (parts[0] === 'node' && parts[1] === '--test' && parts.slice(2).every(item => item.startsWith('tests/'))) return true;
    if (parts[0] === 'npx' && parts[1] === 'eslint' && parts.slice(2).every(item => !path.isAbsolute(item) && !item.includes('..'))) return true;
    if (parts[0] === 'node' && parts[1] === 'scripts/codex-workflow.js') return true;
    return false;
}

async function runRequiredChecks(taskId, spec) {
    const results = [];
    const logDir = await resolveRepoPath(`${LOCAL_ROOT}/${taskId}/logs`, { forWrite: true });
    await mkdir(logDir, { recursive: true });
    for (const rawCheck of spec.requiredCommands.map(normalizeCheck)) {
        if (!commandAllowed(rawCheck.command)) throw new Error(`command is not allowed: ${rawCheck.command}`);
        const start = Date.now();
        const parts = parseCommand(rawCheck.command);
        const executable = process.platform === 'win32' && parts[0] === 'npm' ? 'cmd.exe' : parts[0];
        const runArgs = process.platform === 'win32' && parts[0] === 'npm' ? ['/d', '/s', '/c', 'npm.cmd', ...parts.slice(1)] : parts.slice(1);
        const run = spawnSync(executable, runArgs, { cwd: ROOT, encoding: 'utf8' });
        const output = `${run.stdout ?? ''}${run.stderr ?? ''}${run.error ? run.error.message : ''}`;
        const durationMs = Date.now() - start;
        const logPath = path.join(logDir, `${rawCheck.id}.log`);
        await writeFile(logPath, output);
        const logHash = sha256(output);
        const patternOk = rawCheck.allowFailure && rawCheck.allowedFailurePattern && new RegExp(rawCheck.allowedFailurePattern, 'u').test(output);
        results.push({
            id: rawCheck.id,
            command: rawCheck.command,
            startedAt: new Date(0).toISOString(),
            endedAt: new Date(durationMs).toISOString(),
            exitCode: run.status ?? 1,
            passed: run.status === 0 || patternOk === true,
            allowedFailure: patternOk === true,
            durationMs,
            logPath: rel(logPath),
            logSha256: logHash,
            summary: output.split(/\r?\n/u).filter(Boolean).slice(-5).join(' | ')
        });
    }
    return results;
}

async function validateTask(taskId, options = {}) {
    const { spec } = await ensureSpec(taskId, options);
    const base = options.base;
    const failures = [];
    if (!base) failures.push('base commit is required');
    else {
        try {
            git(['rev-parse', '--verify', base]);
        } catch {
            failures.push(`invalid base commit: ${base}`);
        }
    }
    const current = git(['rev-parse', '--short', 'HEAD']);
    let changed = [];
    if (base && failures.length === 0) {
        changed = changedFilesSince(base);
    } else if (!base) {
        changed = changedFilesSince('HEAD');
    }
    const classifications = [];
    for (const file of changed) {
        if (file.startsWith('.local/')) continue;
        const item = await classifyChangedFile(spec, file);
        classifications.push(item);
        if (!item.allowed) failures.push(`changed file outside writePaths: ${file}`);
        if (item.forbidden) failures.push(`forbidden file changed: ${file}`);
        if (item.largeUnauthorized) failures.push(`large output not authorized: ${file}`);
        if (item.regenerationViolation) failures.push(`regeneration policy violation ${item.regenerationViolation}: ${file}`);
        if (item.exists && file.endsWith('.json')) {
            try {
                JSON.parse(await readFile(await resolveRepoPath(file), 'utf8'));
            } catch (error) {
                failures.push(`invalid JSON: ${file}: ${error.message}`);
            }
        }
        if (item.exists && file.endsWith('.md')) {
            const text = await readFile(await resolveRepoPath(file), 'utf8');
            if (!text.trim()) failures.push(`empty Markdown: ${file}`);
        }
        if (item.exists) {
            try {
                await resolveRepoPath(file);
            } catch (error) {
                failures.push(`symlink/path containment failure: ${file}: ${error.message}`);
            }
        }
    }
    for (const expected of spec.expectedOutputs) {
        if (!existsSync(await resolveRepoPath(expected, { forWrite: true }))) failures.push(`expected output missing: ${expected}`);
    }
    const contextText = await buildContextText(spec, `tasks/specs/${taskId}.json`);
    if (Buffer.byteLength(contextText, 'utf8') > CONTEXT_LIMIT) failures.push('context packet would exceed limit');
    const checks = await runRequiredChecks(taskId, spec);
    for (const check of checks) if (!check.passed) failures.push(`required check failed: ${check.id}`);
    const result = {
        taskId,
        base,
        current,
        validatedAt: new Date(0).toISOString(),
        changedFiles: classifications,
        checks,
        failures,
        passed: failures.length === 0
    };
    await writeLocalJson(taskId, 'validate-result.json', result);
    return result;
}

async function writeLocalJson(taskId, fileName, value) {
    const dir = await localTaskDir(taskId);
    await writeFile(path.join(dir, fileName), `${JSON.stringify(value, null, 2)}\n`);
}

async function readValidateResult(taskId) {
    const file = await resolveRepoPath(`${LOCAL_ROOT}/${taskId}/validate-result.json`);
    if (!existsSync(file)) return null;
    return JSON.parse(await readFile(file, 'utf8'));
}

async function gateForSpec(spec, validationPassed) {
    if (!validationPassed) return spec.blockedGate ?? 'blocked';
    if (spec.gateSource?.type === 'spec') return spec.successGate;
    if (spec.gateSource?.type === 'json-file') {
        if (!spec.gateSource.path || !spec.gateSource.jsonField) return null;
        const resolved = await resolveRepoPath(spec.gateSource.path);
        if (!existsSync(resolved)) return null;
        const value = JSON.parse(await readFile(resolved, 'utf8'));
        const gate = spec.gateSource.jsonField.split('.').reduce((cursor, key) => cursor?.[key], value);
        if (![spec.successGate, spec.blockedGate].includes(gate)) return null;
        return gate;
    }
    return spec.successGate ?? 'ready';
}

async function review(taskId, options = {}) {
    const { spec } = await ensureSpec(taskId, options);
    const base = options.base;
    const current = git(['rev-parse', '--short', 'HEAD']);
    const validation = await readValidateResult(taskId);
    let validationStatus = 'missing';
    const failures = [];
    if (!validation) failures.push('validate-result.json missing');
    else {
        if (validation.base !== base) failures.push('validate result base commit is stale or different');
        if (validation.current !== current) failures.push('validate result current commit is stale');
        if (!validation.passed) failures.push('validate result failed');
        validationStatus = validation.passed ? 'passed' : 'failed';
        if (validation.base !== base || validation.current !== current) validationStatus = 'stale';
    }
    const reviewReady = failures.length === 0;
    const gate = await gateForSpec(spec, reviewReady);
    if (gate === spec.successGate && !reviewReady) failures.push('success gate cannot be used with failed validation');
    if (!gate) failures.push('gate source unavailable');
    const changed = base ? changedFilesSince(base) : [];
    const stopReason = reviewReady ? (spec.successStopReason ?? 'REVIEW_READY') : (spec.blockedStopReason ?? 'REVIEW_BLOCKED');
    const reviewJson = {
        task: taskId,
        title: spec.title,
        commitBase: base,
        commitCurrent: current,
        validationStatus,
        reviewReady,
        changedFiles: changed,
        testsExecuted: validation?.checks?.map(({ id, command, passed, exitCode, logPath, logSha256, summary }) => ({ id, command, passed, exitCode, logPath, logSha256, summary })) ?? [],
        unexpectedFiles: validation?.changedFiles?.filter(item => !item.allowed).map(item => item.file) ?? [],
        largeOutputs: validation?.changedFiles?.filter(item => item.largeUnauthorized).map(item => item.file) ?? [],
        gate: reviewReady ? gate : spec.blockedGate,
        blockers: failures,
        followUp: spec.followUpTask,
        workingTree: gitStatusShort() || 'clean',
        stopReason
    };
    const md = [
        `# Codex Review Packet ${taskId}`,
        '',
        `Task: ${taskId} - ${spec.title}`,
        `Commit base: ${base}`,
        `Commit current: ${current}`,
        `Validation status: ${validationStatus}`,
        `Review ready: ${reviewReady}`,
        `Gate: ${reviewJson.gate}`,
        `Changed files: ${changed.length}`,
        `Unexpected files: ${reviewJson.unexpectedFiles.length}`,
        `Large outputs: ${reviewJson.largeOutputs.length}`,
        `Follow-up: ${spec.followUpTask}`,
        '',
        '## Checks',
        ...reviewJson.testsExecuted.map(item => `- ${item.id}: ${item.passed ? 'passed' : 'failed'} (${item.exitCode}) ${item.logPath}`),
        '',
        'Stop reason: ' + stopReason
    ].join('\n');
    const jsonText = `${JSON.stringify(reviewJson, null, 2)}\n`;
    if (Buffer.byteLength(md, 'utf8') > REVIEW_MD_LIMIT) throw new Error('review markdown packet exceeds limit');
    if (Buffer.byteLength(jsonText, 'utf8') > REVIEW_JSON_LIMIT) throw new Error('review JSON packet exceeds limit');
    if (!reviewReady) throw new Error(`review is not ready: ${failures.join('; ')}`);
    const dir = await localTaskDir(taskId);
    await writeFile(path.join(dir, 'review-packet.md'), `${md}\n`);
    await writeFile(path.join(dir, 'review-packet.json'), jsonText);
    return { markdownPath: rel(path.join(dir, 'review-packet.md')), jsonPath: rel(path.join(dir, 'review-packet.json')), markdownBytes: Buffer.byteLength(md, 'utf8'), jsonBytes: Buffer.byteLength(jsonText, 'utf8'), reviewJson };
}

async function status() {
    const state = readFileSync(await resolveRepoPath('docs/codex/CURRENT_STATE.md'), 'utf8');
    const lines = [
        'Codex workflow status',
        state.split(/\r?\n/u).find(line => line.startsWith('Authorized task:')) ?? 'Authorized task: unknown',
        state.split(/\r?\n/u).find(line => line.startsWith('Latest rejected gate:')) ?? 'Latest rejected gate: unknown',
        state.split(/\r?\n/u).find(line => line.startsWith('Blocked follow-up:')) ?? 'Blocked follow-up: unknown',
        `Working tree: ${gitStatusShort() ? 'dirty' : 'clean'}`
    ];
    console.log(lines.join('\n'));
    return lines;
}

function parseArgs(argv) {
    const options = {};
    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === '--task') options.task = argv[++index];
        else if (arg === '--base') options.base = argv[++index];
        else if (arg === '--dry-run') options.dryRun = true;
        else if (arg === '--spec-dir') options.specDir = argv[++index];
    }
    return options;
}

async function main() {
    const [command, ...rest] = process.argv.slice(2);
    const options = parseArgs(rest);
    try {
        if (command === 'prepare') console.log(JSON.stringify(await buildContextPacket(options.task, options), null, 2));
        else if (command === 'preflight') console.log(JSON.stringify(await preflight(options.task, options), null, 2));
        else if (command === 'validate') console.log(JSON.stringify(await validateTask(options.task, options), null, 2));
        else if (command === 'review') console.log(JSON.stringify(await review(options.task, options), null, 2));
        else if (command === 'status') await status();
        else throw new Error(`unknown command: ${command}`);
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) await main();

export {
    AGENTS_LIMIT,
    CONTEXT_LIMIT,
    CURRENT_STATE_LIMIT,
    EXCLUDED_DIRS,
    LARGE_FILE_LIMIT,
    REVIEW_JSON_LIMIT,
    REVIEW_MD_LIMIT,
    buildContextPacket,
    changedFilesSince,
    commandAllowed,
    gateForSpec,
    hasProtectedReplayReference,
    isAllowedWrite,
    isForbidden,
    largeAllowed,
    loadSpec,
    matchesAny,
    pathMatches,
    preflight,
    resolveRepoPath,
    review,
    safePathResult,
    validateSpecObject,
    validateTask
};
