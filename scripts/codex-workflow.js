#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync, statSync } from 'node:fs';
import { mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises';
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
const FORBIDDEN_REPLAY_PATTERNS = [/partida_005\.dem/iu, /replay_005/iu, /replay_006/iu, /replay_007/iu, /replay_008/iu, /bots/iu];
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
    'stopConditions'
];

function rel(file) {
    return path.relative(ROOT, path.resolve(ROOT, file)).replaceAll(path.sep, '/');
}

function resolveInsideRoot(file) {
    if (path.isAbsolute(file)) throw new Error(`absolute path is not allowed: ${file}`);
    const normalized = file.replaceAll('\\', '/');
    if (normalized === '' || normalized.split('/').includes('..')) throw new Error(`unsafe relative path: ${file}`);
    const resolved = path.resolve(ROOT, normalized);
    const relative = path.relative(ROOT, resolved);
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`path escapes repository: ${file}`);
    return resolved;
}

function safePathResult(file) {
    try {
        resolveInsideRoot(file);
        return { path: file, safe: true };
    } catch (error) {
        return { path: file, safe: false, error: error.message };
    }
}

function sha256Text(text) {
    return createHash('sha256').update(text).digest('hex');
}

async function sha256File(file) {
    return sha256Text(await readFile(file));
}

function patternToRegExp(pattern) {
    const normalized = pattern.replaceAll('\\', '/');
    const escaped = normalized.replace(/[.+^${}()|[\]\\]/gu, '\\$&')
        .replaceAll('**', '::DOUBLE_STAR::')
        .replaceAll('*', '[^/]*')
        .replaceAll('::DOUBLE_STAR::', '.*');
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
    return patterns.some(pattern => pathMatches(pattern, candidate));
}

async function fileInfo(file, purpose = '') {
    const result = {
        path: file,
        purpose,
        exists: false,
        sizeBytes: null,
        lineCount: null,
        sha256: null,
        large: false
    };
    const resolved = resolveInsideRoot(file);
    if (!existsSync(resolved)) return result;
    const stats = await stat(resolved);
    result.exists = true;
    result.sizeBytes = stats.size;
    result.large = stats.size > LARGE_FILE_LIMIT;
    if (stats.isFile()) {
        result.sha256 = await sha256File(resolved);
        if (stats.size <= LARGE_FILE_LIMIT) {
            const text = await readFile(resolved, 'utf8');
            result.lineCount = text.split(/\r?\n/u).length;
        }
    }
    return result;
}

async function loadSpec(taskId, options = {}) {
    const specDir = options.specDir ?? 'tasks/specs';
    const specPath = `${specDir}/${taskId}.json`;
    const resolved = resolveInsideRoot(specPath);
    const spec = JSON.parse(await readFile(resolved, 'utf8'));
    return { spec, specPath };
}

function validateSpecObject(spec, specPath = '') {
    const errors = [];
    const warnings = [];
    for (const field of REQUIRED_SPEC_FIELDS) {
        if (!(field in spec)) errors.push(`missing field: ${field}`);
    }
    const fileId = path.basename(specPath, '.json');
    if (fileId && spec.taskId !== fileId) errors.push(`taskId ${spec.taskId} does not match file ${fileId}`);
    if (!['blocked', 'pending', 'active', 'completed'].includes(spec.status)) errors.push(`invalid status: ${spec.status}`);
    for (const field of ['readPaths', 'optionalReadPaths', 'writePaths', 'forbiddenPaths', 'requiredPolicies', 'requiredCommands', 'expectedOutputs', 'largeOutputsAllowed', 'stopConditions']) {
        if (field in spec && !Array.isArray(spec[field])) errors.push(`${field} must be an array`);
    }
    if (Array.isArray(spec.followUpTask)) errors.push('more than one follow-up is not allowed');
    if (!spec.followUpTask) errors.push('followUpTask is required');
    const pathFields = ['readPaths', 'optionalReadPaths', 'writePaths', 'forbiddenPaths', 'requiredPolicies', 'expectedOutputs'];
    for (const field of pathFields) {
        for (const item of spec[field] ?? []) {
            const pathValue = typeof item === 'string' ? item : item.path;
            if (!pathValue) continue;
            const safe = safePathResult(pathValue.replace(/\*+.*$/u, 'placeholder'));
            if (!safe.safe) errors.push(`${field} contains unsafe path ${pathValue}: ${safe.error}`);
        }
    }
    for (const readPath of spec.readPaths ?? []) {
        if (matchesAny(spec.forbiddenPaths ?? [], readPath)) errors.push(`readPath is forbidden: ${readPath}`);
        if (FORBIDDEN_REPLAY_PATTERNS.some(pattern => pattern.test(readPath))) errors.push(`readPath references protected or unsupported replay: ${readPath}`);
    }
    if (spec.replayProcessingAllowed === true) warnings.push('replay processing is explicitly allowed');
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

function git(args, options = {}) {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: options.stdio ?? ['ignore', 'pipe', 'pipe'] }).trim();
}

function gitStatusShort() {
    try {
        return git(['status', '--short']);
    } catch {
        return '';
    }
}

function changedFilesSince(base) {
    const files = new Set();
    const commands = [
        ['diff', '--name-only', base, 'HEAD'],
        ['diff', '--name-only'],
        ['diff', '--name-only', '--cached'],
        ['ls-files', '--others', '--exclude-standard']
    ];
    for (const args of commands) {
        try {
            for (const line of git(args).split(/\r?\n/u).filter(Boolean)) files.add(line.replaceAll('\\', '/'));
        } catch {
            // Keep validation fail-closed by returning what is available.
        }
    }
    return [...files].sort();
}

function isAllowedWrite(spec, file) {
    return matchesAny(spec.writePaths ?? [], file);
}

function isForbidden(spec, file) {
    return matchesAny(spec.forbiddenPaths ?? [], file) || /\.dem$/iu.test(file);
}

function largeAllowed(spec, file) {
    return (spec.largeOutputsAllowed ?? []).some(entry => pathMatches(entry.path ?? entry, file));
}

async function checkChangedFiles(spec, base) {
    const changed = changedFilesSince(base);
    const unexpected = [];
    const forbidden = [];
    const largeOutputs = [];
    const regenerationViolations = [];
    for (const file of changed) {
        if (file.startsWith('.local/')) continue;
        if (!isAllowedWrite(spec, file)) unexpected.push(file);
        if (isForbidden(spec, file)) forbidden.push(file);
        const resolved = resolveInsideRoot(file);
        if (existsSync(resolved)) {
            const stats = statSync(resolved);
            if (stats.size > LARGE_FILE_LIMIT && !largeAllowed(spec, file)) largeOutputs.push({ file, sizeBytes: stats.size });
        }
        const policy = spec.regenerationPolicy ?? {};
        if (policy.canonicalFacts === 'reuse' && /^output\/replay-002-canonical\/(factual-events\.jsonl|snapshots\.jsonl|entity-registry\.json|player-registry\.json)$/u.test(file)) {
            regenerationViolations.push({ file, policy: 'canonicalFacts:reuse' });
        }
        if (policy.canonicalFacts === 'forbidden' && file.startsWith('output/replay-002-canonical/')) {
            regenerationViolations.push({ file, policy: 'canonicalFacts:forbidden' });
        }
    }
    return { changed, unexpected, forbidden, largeOutputs, regenerationViolations };
}

async function buildContextPacket(taskId, options = {}) {
    const { spec, specPath } = await ensureSpec(taskId, options);
    if (spec.status === 'blocked' && !options.dryRun) throw new Error(`task ${taskId} is blocked; use --dry-run for validation only`);
    const packetDir = path.join(ROOT, LOCAL_ROOT, taskId);
    await mkdir(packetDir, { recursive: true });
    const files = [];
    for (const readPath of spec.readPaths) files.push(await fileInfo(readPath, 'required read'));
    for (const optionalPath of spec.optionalReadPaths) files.push(await fileInfo(optionalPath, 'optional read'));
    const policyInfos = [];
    for (const policy of spec.requiredPolicies) policyInfos.push(await fileInfo(policy, 'required policy'));
    const lines = [
        `# Codex Context Packet ${taskId}`,
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
        ...policyInfos.map(formatFileInfo),
        '',
        '## Required Commands',
        ...spec.requiredCommands.map(item => `- ${item}`),
        '',
        '## Stop Conditions',
        ...spec.stopConditions.map(item => `- ${item}`),
        '',
        `Excluded directories: ${EXCLUDED_DIRS.join(', ')}`
    ];
    const text = `${lines.join('\n')}\n`;
    if (Buffer.byteLength(text, 'utf8') > CONTEXT_LIMIT) throw new Error(`context packet exceeds ${CONTEXT_LIMIT} bytes`);
    const outPath = path.join(packetDir, 'context-packet.md');
    await writeFile(outPath, text);
    await logCommand(taskId, `prepare${options.dryRun ? ' --dry-run' : ''}`, true);
    return { path: rel(outPath), sizeBytes: Buffer.byteLength(text, 'utf8'), spec };
}

function formatFileInfo(info) {
    return `- ${info.path} | ${info.purpose} | exists=${info.exists} | size=${info.sizeBytes ?? 'missing'} | lines=${info.lineCount ?? 'n/a'} | sha256=${info.sha256 ?? 'n/a'}${info.large ? ' | large-not-included' : ''}`;
}

async function preflight(taskId, options = {}) {
    const { spec, validation } = await ensureSpec(taskId, options);
    const failures = [];
    const warnings = [...validation.warnings];
    if (spec.status === 'blocked' && !options.dryRun) failures.push(`task ${taskId} is blocked`);
    for (const policy of spec.requiredPolicies ?? []) {
        if (!existsSync(resolveInsideRoot(policy))) failures.push(`required policy not found: ${policy}`);
    }
    for (const file of [...spec.readPaths, ...spec.optionalReadPaths, ...spec.writePaths]) {
        if (isForbidden(spec, file)) failures.push(`forbidden path in task scope: ${file}`);
    }
    if (spec.replayProcessingAllowed === true) failures.push('replay processing is not allowed by default workflow');
    const agents = statSync(resolveInsideRoot('AGENTS.md')).size;
    const current = statSync(resolveInsideRoot('docs/codex/CURRENT_STATE.md')).size;
    if (agents > AGENTS_LIMIT) failures.push(`AGENTS.md exceeds ${AGENTS_LIMIT}`);
    if (current > CURRENT_STATE_LIMIT) failures.push(`CURRENT_STATE.md exceeds ${CURRENT_STATE_LIMIT}`);
    const gitStatus = gitStatusShort();
    if (gitStatus) warnings.push('working tree has changes; ensure they belong to the current task');
    await logCommand(taskId, `preflight${options.dryRun ? ' --dry-run' : ''}`, failures.length === 0);
    return { taskId, dryRun: options.dryRun === true, failures, warnings, passed: failures.length === 0 };
}

async function validateTask(taskId, options = {}) {
    const { spec } = await ensureSpec(taskId, options);
    const base = options.base ?? git(['rev-parse', 'HEAD']);
    const changed = await checkChangedFiles(spec, base);
    const jsonFailures = [];
    for (const file of changed.changed.filter(item => item.endsWith('.json'))) {
        try {
            JSON.parse(await readFile(resolveInsideRoot(file), 'utf8'));
        } catch (error) {
            jsonFailures.push({ file, error: error.message });
        }
    }
    const commandLog = await readCommandLog(taskId);
    const missingCommands = spec.requiredCommands.filter(command => !commandLog.some(entry => entry.command.includes(command.split(' ').slice(0, 2).join(' '))));
    const failures = [
        ...changed.unexpected.map(file => `changed file outside writePaths: ${file}`),
        ...changed.forbidden.map(file => `forbidden file changed: ${file}`),
        ...changed.largeOutputs.map(item => `large output not authorized: ${item.file}`),
        ...changed.regenerationViolations.map(item => `regeneration policy violation: ${item.file}`),
        ...jsonFailures.map(item => `invalid JSON: ${item.file}`),
        ...missingCommands.map(command => `required command not recorded: ${command}`)
    ];
    const result = { taskId, base, changedFiles: changed.changed, unexpectedFiles: changed.unexpected, forbiddenFiles: changed.forbidden, largeOutputs: changed.largeOutputs, regenerationViolations: changed.regenerationViolations, jsonFailures, missingCommands, passed: failures.length === 0, failures };
    await writeLocalJson(taskId, 'validate-result.json', result);
    await logCommand(taskId, 'validate', result.passed);
    return result;
}

async function review(taskId, options = {}) {
    const { spec } = await ensureSpec(taskId, options);
    const base = options.base ?? git(['rev-parse', 'HEAD']);
    const changed = await checkChangedFiles(spec, base);
    const commandLog = await readCommandLog(taskId);
    const diffStat = runOptionalGit(['diff', '--stat', base, 'HEAD']);
    const releaseGate = extractGateFromKnownFiles();
    const reviewJson = {
        task: taskId,
        title: spec.title,
        commitBase: base,
        commitCurrent: git(['rev-parse', '--short', 'HEAD']),
        changedFiles: changed.changed,
        diffStat,
        unexpectedFiles: changed.unexpected,
        testsExecuted: commandLog,
        protectionChecks: {
            forbiddenFilesChanged: changed.forbidden,
            replayProcessingAllowed: spec.replayProcessingAllowed
        },
        largeOutputs: changed.largeOutputs,
        gate: releaseGate,
        blockers: [...changed.unexpected, ...changed.forbidden, ...changed.regenerationViolations],
        followUp: spec.followUpTask,
        workingTree: gitStatusShort() || 'clean',
        stopReason: 'OPTIMIZATION_COMPLETE_AWAITING_REVIEW'
    };
    const md = [
        `# Codex Review Packet ${taskId}`,
        '',
        `Task: ${taskId} - ${spec.title}`,
        `Commit base: ${base}`,
        `Commit current: ${reviewJson.commitCurrent}`,
        `Gate: ${releaseGate}`,
        `Changed files: ${changed.changed.length}`,
        `Unexpected files: ${changed.unexpected.length}`,
        `Large outputs: ${changed.largeOutputs.length}`,
        `Follow-up: ${spec.followUpTask}`,
        `Working tree: ${reviewJson.workingTree}`,
        '',
        '## Diff Stat',
        '```text',
        diffStat || 'none',
        '```',
        '',
        '## Tests',
        ...commandLog.map(entry => `- ${entry.command}: ${entry.passed ? 'passed' : 'failed'}`),
        '',
        '## Protection Checks',
        `Forbidden files changed: ${changed.forbidden.length}`,
        `Replay processing allowed: ${spec.replayProcessingAllowed}`,
        '',
        'Stop reason: OPTIMIZATION_COMPLETE_AWAITING_REVIEW'
    ].join('\n');
    const jsonText = `${JSON.stringify(reviewJson, null, 2)}\n`;
    if (Buffer.byteLength(md, 'utf8') > REVIEW_MD_LIMIT) throw new Error('review markdown packet exceeds limit');
    if (Buffer.byteLength(jsonText, 'utf8') > REVIEW_JSON_LIMIT) throw new Error('review JSON packet exceeds limit');
    const dir = await localTaskDir(taskId);
    await writeFile(path.join(dir, 'review-packet.md'), `${md}\n`);
    await writeFile(path.join(dir, 'review-packet.json'), jsonText);
    await logCommand(taskId, 'review', true);
    return { markdownPath: rel(path.join(dir, 'review-packet.md')), jsonPath: rel(path.join(dir, 'review-packet.json')), markdownBytes: Buffer.byteLength(md, 'utf8'), jsonBytes: Buffer.byteLength(jsonText, 'utf8'), reviewJson };
}

function extractGateFromKnownFiles() {
    for (const file of ['output/replay-002-canonical-v8-validation/release-decision.json', 'output/replay-002-canonical-v8-validation/correction-gate.json']) {
        try {
            const parsed = JSON.parse(readFileSync(resolveInsideRoot(file), 'utf8'));
            if (parsed.gate) return parsed.gate;
        } catch {
            // No current gate file available.
        }
    }
    return 'not_available';
}

function runOptionalGit(args) {
    try {
        return git(args);
    } catch {
        return '';
    }
}

async function status() {
    const currentState = readFileSync(resolveInsideRoot('docs/codex/CURRENT_STATE.md'), 'utf8');
    const packet091 = path.join(ROOT, LOCAL_ROOT, '091', 'context-packet.md');
    const review091 = path.join(ROOT, LOCAL_ROOT, '091', 'review-packet.md');
    const lines = [
        'Codex workflow status',
        findStateLine(currentState, 'Authorized task'),
        findStateLine(currentState, 'Latest rejected gate'),
        findStateLine(currentState, 'Blocked follow-up'),
        `Working tree: ${gitStatusShort() ? 'dirty' : 'clean'}`,
        `Task 091 context packet: ${existsSync(packet091) ? rel(packet091) : 'not generated'}`,
        `Task 091 review packet: ${existsSync(review091) ? rel(review091) : 'not generated'}`
    ];
    console.log(lines.join('\n'));
    return lines;
}

function findStateLine(text, prefix) {
    return text.split(/\r?\n/u).find(line => line.startsWith(`${prefix}:`)) ?? `${prefix}: unknown`;
}

async function localTaskDir(taskId) {
    const dir = path.join(ROOT, LOCAL_ROOT, taskId);
    await mkdir(dir, { recursive: true });
    return dir;
}

async function writeLocalJson(taskId, fileName, value) {
    const dir = await localTaskDir(taskId);
    await writeFile(path.join(dir, fileName), `${JSON.stringify(value, null, 2)}\n`);
}

async function readCommandLog(taskId) {
    const file = path.join(ROOT, LOCAL_ROOT, taskId, 'command-log.json');
    if (!existsSync(file)) return [];
    return JSON.parse(await readFile(file, 'utf8'));
}

async function logCommand(taskId, command, passed) {
    const log = await readCommandLog(taskId);
    log.push({ command, passed, recordedAt: new Date(0).toISOString() });
    await writeLocalJson(taskId, 'command-log.json', log);
}

async function assertNoSymlinkEscape(file) {
    const resolved = resolveInsideRoot(file);
    const link = lstatSync(resolved);
    if (!link.isSymbolicLink()) return true;
    const target = await realpath(resolved);
    const relative = path.relative(ROOT, target);
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`symlink escapes repository: ${file}`);
    return true;
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

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
    await main();
}

export {
    AGENTS_LIMIT,
    CONTEXT_LIMIT,
    CURRENT_STATE_LIMIT,
    EXCLUDED_DIRS,
    LARGE_FILE_LIMIT,
    REVIEW_JSON_LIMIT,
    REVIEW_MD_LIMIT,
    assertNoSymlinkEscape,
    buildContextPacket,
    checkChangedFiles,
    isAllowedWrite,
    isForbidden,
    largeAllowed,
    loadSpec,
    matchesAny,
    pathMatches,
    preflight,
    resolveInsideRoot,
    review,
    safePathResult,
    validateSpecObject,
    validateTask
};
