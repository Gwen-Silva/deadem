import assert from 'node:assert/strict';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {
    CONTEXT_LIMIT,
    EXCLUDED_DIRS,
    REVIEW_JSON_LIMIT,
    REVIEW_MD_LIMIT,
    buildContextPacket,
    commandAllowed,
    gateForSpec,
    hasProtectedReplayReference,
    isAllowedWrite,
    isForbidden,
    largeAllowed,
    preflight,
    resolveRepoPath,
    review,
    safePathResult,
    validateSpecObject
} from '../../scripts/codex-workflow.js';

const fixtureRoot = 'output-local/codex-workflow-test';
const specDir = `${fixtureRoot}/specs`;

function validSpec(overrides = {}) {
    return {
        taskId: '900',
        title: 'Synthetic Workflow Fixture',
        status: 'authorized',
        objective: 'Validate workflow behavior with synthetic files only.',
        readPaths: ['AGENTS.md'],
        optionalReadPaths: [],
        writePaths: [`${fixtureRoot}/allowed/**`],
        forbiddenPaths: ['samples/**', 'output/replays/**'],
        requiredPolicies: ['docs/codex/WORKFLOW.md'],
        requiredCommands: [
            { id: 'synthetic-pass', command: 'node --test tests/codex-workflow/codex-workflow.test.mjs' }
        ],
        expectedOutputs: [],
        largeOutputsAllowed: [],
        replayProcessingAllowed: false,
        followUpTask: '901',
        stopConditions: ['stop after synthetic validation'],
        successGate: 'synthetic_ready',
        blockedGate: 'synthetic_blocked',
        gateSource: { type: 'spec', path: null, jsonField: null },
        successStopReason: 'SYNTHETIC_READY',
        blockedStopReason: 'SYNTHETIC_BLOCKED',
        regenerationPolicy: {
            canonicalFacts: 'reuse',
            validationArtifacts: 'regenerate',
            reports: 'regenerate',
            replayParsing: 'forbidden'
        },
        ...overrides
    };
}

async function writeSpec(id, spec) {
    await mkdir(specDir, { recursive: true });
    await writeFile(`${specDir}/${id}.json`, `${JSON.stringify(spec, null, 2)}\n`);
}

function snapshotLocal() {
    if (!existsSync('.local')) return [];
    const files = [];
    const walk = dir => {
        for (const item of readdirSync(dir, { withFileTypes: true })) {
            const file = path.join(dir, item.name);
            if (item.isDirectory()) walk(file);
            else files.push(`${file}:${statSync(file).size}`);
        }
    };
    walk('.local');
    return files.sort();
}

test('spec validation covers identity, follow-up, gates, and protected paths', () => {
    const base = validSpec();
    assert.equal(validateSpecObject(base, 'tasks/specs/900.json').valid, true);
    assert.equal(validateSpecObject({ ...base, taskId: '901' }, 'tasks/specs/900.json').valid, false);
    assert.equal(validateSpecObject({ ...base, followUpTask: null }, 'tasks/specs/900.json').valid, false);
    assert.equal(validateSpecObject({ ...base, followUpTask: ['901', '902'] }, 'tasks/specs/900.json').valid, false);
    assert.equal(validateSpecObject({ ...base, readPaths: ['samples/partida_005.dem'] }, 'tasks/specs/900.json').valid, false);
    assert.equal(validateSpecObject({ ...base, optionalReadPaths: ['samples/replay_006.dem'] }, 'tasks/specs/900.json').valid, false);
    assert.equal(validateSpecObject({ ...base, writePaths: ['samples/replay_007_bots01.dem'] }, 'tasks/specs/900.json').valid, false);
    assert.equal(validateSpecObject({ ...base, expectedOutputs: ['samples/replay_008_bots02_short.dem'] }, 'tasks/specs/900.json').valid, false);
    assert.equal(validateSpecObject({ ...base, largeOutputsAllowed: [{ path: 'samples/x.dem' }] }, 'tasks/specs/900.json').valid, false);
    assert.equal(validateSpecObject({ ...base, gateSource: { type: 'json-file', path: '../gate.json' } }, 'tasks/specs/900.json').valid, false);
});

test('dry-run prepare and preflight do not alter filesystem or command logs', async () => {
    await rm(fixtureRoot, { recursive: true, force: true });
    await rm('.local/codex/900', { recursive: true, force: true });
    await writeSpec('900', validSpec({ status: 'blocked' }));
    const before = snapshotLocal();
    const pre = await preflight('900', { specDir, dryRun: true });
    const prepared = await buildContextPacket('900', { specDir, dryRun: true });
    const after = snapshotLocal();
    assert.equal(pre.passed, true);
    assert.equal(prepared.sizeBytes > 0, true);
    assert.equal(prepared.sha256.length, 64);
    assert.equal(prepared.preview.length <= 1200, true);
    assert.deepEqual(after, before);
    assert.equal(existsSync('.local/codex/900/context-packet.md'), false);
});

test('blocked task without dry-run is fail-closed', async () => {
    await writeSpec('900', validSpec({ status: 'blocked' }));
    const result = await preflight('900', { specDir });
    assert.equal(result.passed, false);
    await assert.rejects(() => buildContextPacket('900', { specDir }), /blocked/u);
});

test('path resolver rejects absolute, traversal, dem, and alternate separators', async () => {
    await assert.rejects(() => resolveRepoPath('C:/absolute/file.txt'), /absolute/u);
    await assert.rejects(() => resolveRepoPath('../escape.txt'), /traversal/u);
    await assert.rejects(() => resolveRepoPath('samples\\partida_005.dem'), /replay binary/u);
    assert.equal(safePathResult('a\\..\\b').safe, false);
});

test('symlink escape cases are rejected when supported', async t => {
    await mkdir(fixtureRoot, { recursive: true });
    const outside = path.resolve('..');
    const fileLink = `${fixtureRoot}/file-link`;
    const dirLink = `${fixtureRoot}/dir-link`;
    await rm(fileLink, { force: true });
    await rm(dirLink, { recursive: true, force: true });
    try {
        await symlink(outside, fileLink);
        await symlink(outside, dirLink, 'dir');
    } catch {
        t.skip('symlink creation unavailable on this platform');
        return;
    }
    await assert.rejects(() => resolveRepoPath(fileLink), /escapes/u);
    await assert.rejects(() => resolveRepoPath(`${dirLink}/future.txt`, { forWrite: true }), /escapes/u);
});

test('write path through safe missing ancestor is allowed', async () => {
    const resolved = await resolveRepoPath(`${fixtureRoot}/new-dir/file.json`, { forWrite: true });
    assert(resolved.endsWith(path.join('new-dir', 'file.json')));
});

test('path scope helpers detect allowed, unexpected, forbidden, and large output authorization', () => {
    const spec = validSpec({ largeOutputsAllowed: [{ path: `${fixtureRoot}/allowed/large.json`, justification: 'fixture' }] });
    assert.equal(isAllowedWrite(spec, `${fixtureRoot}/allowed/file.json`), true);
    assert.equal(isAllowedWrite(spec, `${fixtureRoot}/other/file.json`), false);
    assert.equal(isForbidden(spec, 'samples/partida_005.dem'), true);
    assert.equal(isForbidden(spec, 'output/replays/replay_002/file.json'), true);
    assert.equal(largeAllowed(spec, `${fixtureRoot}/allowed/large.json`), true);
    assert.equal(largeAllowed(spec, `${fixtureRoot}/allowed/other.json`), false);
});

test('context packet is reference-only and limit is enforced', async () => {
    await writeSpec('900', validSpec({ status: 'blocked' }));
    const result = await buildContextPacket('900', { specDir, dryRun: true });
    assert(result.sizeBytes < CONTEXT_LIMIT);
    assert(!result.preview.includes('full dump'));
    await writeSpec('900', validSpec({ readPaths: Array.from({ length: 2000 }, (_, index) => `${fixtureRoot}/missing-${index}.json`) }));
    await assert.rejects(() => buildContextPacket('900', { specDir, dryRun: true }), /context packet exceeds/u);
});

test('command allowlist rejects arbitrary shell and allows controlled checks', () => {
    assert.equal(commandAllowed('npm run validate:tasks'), true);
    assert.equal(commandAllowed('node --test tests/codex-workflow/codex-workflow.test.mjs'), true);
    assert.equal(commandAllowed('npx eslint scripts/codex-workflow.js'), true);
    assert.equal(commandAllowed('powershell rm samples/partida_005.dem'), false);
    assert.equal(commandAllowed('node --test ../outside.test.mjs'), false);
});

test('review fails without validation and with stale validation', async () => {
    await rm(`${fixtureRoot}/review-local`, { recursive: true, force: true });
    await rm('.local/codex/900', { recursive: true, force: true });
    await writeSpec('900', validSpec({ status: 'authorized' }));
    await assert.rejects(() => review('900', { specDir, base: 'HEAD' }), /validate-result.json missing/u);
});

test('gate and stop reason come from spec, never replay v8 constants', async () => {
    const spec = validSpec();
    assert.equal(await gateForSpec(spec, true), 'synthetic_ready');
    assert.equal(await gateForSpec(spec, false), 'synthetic_blocked');
});

test('protected replay references are global across fields', () => {
    for (const value of ['samples/partida_005.dem', 'output/replay_006.json', 'replay_007_bots01', 'replay_008_bots02_short']) {
        assert.equal(hasProtectedReplayReference(value), true);
    }
});

test('future Task 092 and Task 093 remain blocked and dry-run safe', async () => {
    const before = snapshotLocal();
    const dryRun = await preflight('092', { dryRun: true });
    const after = snapshotLocal();
    assert.equal(dryRun.passed, true);
    assert.deepEqual(after, before);
    assert.equal(JSON.parse(await readFile('tasks/specs/092.json', 'utf8')).status, 'blocked');
    assert.equal(JSON.parse(await readFile('tasks/specs/093.json', 'utf8')).status, 'blocked');
    assert.equal(existsSync('tasks/blocked/092-close-replay-002-terminal-validation-gaps.md'), true);
    assert.equal(existsSync('tasks/blocked/093-select-next-canonical-generalization-control.md'), true);
});

test('current compact context limits are preserved', () => {
    assert(statSync('AGENTS.md').size < 8 * 1024);
    assert(statSync('docs/codex/CURRENT_STATE.md').size < 4 * 1024);
    assert(EXCLUDED_DIRS.includes('.local/'));
    assert(EXCLUDED_DIRS.includes('output/'));
    assert(EXCLUDED_DIRS.includes('samples/'));
});

test('review packet limits constants remain compact', () => {
    assert.equal(REVIEW_MD_LIMIT, 24 * 1024);
    assert.equal(REVIEW_JSON_LIMIT, 32 * 1024);
});

for (const [name, specPatch, expected] of [
    ['task ID mismatch', { taskId: '901' }, false],
    ['missing follow-up', { followUpTask: null }, false],
    ['multiple follow-ups', { followUpTask: ['901', '902'] }, false],
    ['protected read path', { readPaths: ['samples/partida_005.dem'] }, false],
    ['protected optional path', { optionalReadPaths: ['samples/replay_006.dem'] }, false],
    ['protected write path', { writePaths: ['samples/replay_007_bots01.dem'] }, false],
    ['protected expected output', { expectedOutputs: ['samples/replay_008_bots02_short.dem'] }, false],
    ['dem large output', { largeOutputsAllowed: [{ path: 'samples/example.dem' }] }, false],
    ['safe synthetic spec', {}, true]
]) {
    test(`spec case: ${name}`, () => {
        assert.equal(validateSpecObject(validSpec(specPatch), 'tasks/specs/900.json').valid, expected);
    });
}

for (const [name, file, safe] of [
    ['absolute path', 'C:/tmp/file.txt', false],
    ['parent traversal', '../tmp/file.txt', false],
    ['windows traversal', 'a\\..\\b.txt', false],
    ['dem extension', 'samples/example.dem', false],
    ['normal relative path', 'docs/codex/WORKFLOW.md', true]
]) {
    test(`safePathResult case: ${name}`, () => {
        assert.equal(safePathResult(file).safe, safe);
    });
}

for (const [name, command, allowed] of [
    ['npm script', 'npm run lint', true],
    ['node test', 'node --test tests/codex-workflow/codex-workflow.test.mjs', true],
    ['eslint repo path', 'npx eslint scripts/codex-workflow.js', true],
    ['arbitrary shell', 'cmd /c dir', false],
    ['node outside tests', 'node --test ../outside.test.mjs', false]
]) {
    test(`command allowlist case: ${name}`, () => {
        assert.equal(commandAllowed(command), allowed);
    });
}

for (const [name, file, expected] of [
    ['allowed write path', `${fixtureRoot}/allowed/result.json`, true],
    ['unexpected write path', `${fixtureRoot}/outside/result.json`, false],
    ['forbidden sample path', 'samples/not-real.dem', false]
]) {
    test(`write scope case: ${name}`, () => {
        const spec = validSpec();
        assert.equal(isAllowedWrite(spec, file), expected);
    });
}

for (const [name, file, expected] of [
    ['replay 005 path', 'samples/partida_005.dem', true],
    ['bot replay 006 path', 'samples/replay_006_fake.dem', true],
    ['output replay path', 'output/replays/replay_002/file.json', true],
    ['ordinary doc path', 'docs/codex/WORKFLOW.md', false]
]) {
    test(`forbidden path case: ${name}`, () => {
        assert.equal(isForbidden(validSpec(), file), expected);
    });
}
