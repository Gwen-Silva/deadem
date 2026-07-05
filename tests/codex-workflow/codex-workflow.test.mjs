import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {
    CONTEXT_LIMIT,
    EXCLUDED_DIRS,
    REVIEW_JSON_LIMIT,
    REVIEW_MD_LIMIT,
    assertNoSymlinkEscape,
    buildContextPacket,
    isAllowedWrite,
    isForbidden,
    largeAllowed,
    matchesAny,
    preflight,
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
        status: 'pending',
        objective: 'Validate workflow behavior with synthetic files only.',
        readPaths: ['AGENTS.md'],
        optionalReadPaths: [],
        writePaths: [`${fixtureRoot}/allowed/**`],
        forbiddenPaths: ['samples/**', 'output/replays/**'],
        requiredPolicies: ['docs/codex/WORKFLOW.md'],
        requiredCommands: ['npm run codex:preflight -- --task 900'],
        expectedOutputs: [`${fixtureRoot}/allowed/result.json`],
        largeOutputsAllowed: [],
        replayProcessingAllowed: false,
        followUpTask: '901',
        stopConditions: ['stop after synthetic validation'],
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

test('task spec validation covers identity, policies, follow-up, and protected paths', async () => {
    const base = validSpec();
    assert.equal(validateSpecObject(base, 'tasks/specs/900.json').valid, true);
    assert.equal(validateSpecObject({ ...base, taskId: '901' }, 'tasks/specs/900.json').valid, false);
    assert.equal(validateSpecObject({ ...base, followUpTask: null }, 'tasks/specs/900.json').valid, false);
    assert.equal(validateSpecObject({ ...base, followUpTask: ['901', '902'] }, 'tasks/specs/900.json').valid, false);
    assert.equal(validateSpecObject({ ...base, readPaths: ['samples/partida_005.dem'] }, 'tasks/specs/900.json').valid, false);
    assert.equal(validateSpecObject({ ...base, readPaths: ['C:/absolute/path.txt'] }, 'tasks/specs/900.json').valid, false);
    assert.equal(validateSpecObject({ ...base, readPaths: ['../escape.txt'] }, 'tasks/specs/900.json').valid, false);
    assert.equal(validateSpecObject({ ...base, replayProcessingAllowed: true }, 'tasks/specs/900.json').warnings.length, 1);
});

test('blocked task preflight is fail-closed except dry-run', async () => {
    await rm(fixtureRoot, { recursive: true, force: true });
    await writeSpec('900', validSpec({ status: 'blocked' }));
    const blocked = await preflight('900', { specDir });
    assert.equal(blocked.passed, false);
    assert(blocked.failures.some(item => item.includes('blocked')));
    const dryRun = await preflight('900', { specDir, dryRun: true });
    assert.equal(dryRun.passed, true);
});

test('unknown policy fails preflight', async () => {
    await writeSpec('900', validSpec({ requiredPolicies: ['docs/codex/DOES_NOT_EXIST.md'] }));
    const result = await preflight('900', { specDir, dryRun: true });
    assert.equal(result.passed, false);
    assert(result.failures.some(item => item.includes('required policy not found')));
});

test('path scopes reject forbidden, replay, absolute, traversal, and extension cases', () => {
    const spec = validSpec();
    assert.equal(isAllowedWrite(spec, `${fixtureRoot}/allowed/file.json`), true);
    assert.equal(isAllowedWrite(spec, `${fixtureRoot}/other/file.json`), false);
    assert.equal(isForbidden(spec, 'samples/partida_005.dem'), true);
    assert.equal(isForbidden(spec, 'output/replays/replay_002/file.json'), true);
    assert.equal(isForbidden(spec, 'samples/synthetic.dem'), true);
    assert.equal(safePathResult('/absolute/path').safe, false);
    assert.equal(safePathResult('../escape').safe, false);
    assert.equal(matchesAny(['tasks/blocked/09*.md'], 'tasks/blocked/092-select-next-canonical-generalization-control.md'), true);
});

test('large outputs require explicit authorization', () => {
    const spec = validSpec();
    assert.equal(largeAllowed(spec, `${fixtureRoot}/allowed/large.json`), false);
    const allowed = validSpec({ largeOutputsAllowed: [{ path: `${fixtureRoot}/allowed/large.json`, justification: 'synthetic large output' }] });
    assert.equal(largeAllowed(allowed, `${fixtureRoot}/allowed/large.json`), true);
});

test('context packet is reference-only and under limit', async () => {
    await writeSpec('900', validSpec({ status: 'blocked' }));
    const result = await buildContextPacket('900', { specDir, dryRun: true });
    assert(result.sizeBytes < CONTEXT_LIMIT);
    const text = await readFile(result.path, 'utf8');
    assert(text.includes('size='));
    assert(!text.includes('Codex turns replay bytes into'));
    assert(text.includes('large-not-included') === false);
});

test('context packet limit is enforced', async () => {
    const manyPaths = Array.from({ length: 1500 }, (_, index) => `${fixtureRoot}/missing-${index}.json`);
    await writeSpec('900', validSpec({ readPaths: manyPaths, status: 'blocked' }));
    await assert.rejects(() => buildContextPacket('900', { specDir, dryRun: true }), /context packet exceeds/u);
});

test('review packet limits are enforced without embedding logs', async () => {
    await writeSpec('900', validSpec({ status: 'pending' }));
    const result = await review('900', { specDir, base: 'HEAD' });
    assert(result.markdownBytes < REVIEW_MD_LIMIT);
    assert(result.jsonBytes < REVIEW_JSON_LIMIT);
    const text = await readFile(result.markdownPath, 'utf8');
    assert(!text.includes('stack trace'));

    await writeSpec('900', validSpec({ title: 'x'.repeat(REVIEW_MD_LIMIT + 100), status: 'pending' }));
    await assert.rejects(() => review('900', { specDir, base: 'HEAD' }), /review markdown packet exceeds/u);
});

test('regeneration and output policy helpers catch forbidden factual outputs', () => {
    const spec = validSpec({
        forbiddenPaths: [
            'output/replay-002-canonical/factual-events.jsonl',
            'output/replay-002-canonical/snapshots.jsonl'
        ]
    });
    assert.equal(isForbidden(spec, 'output/replay-002-canonical/factual-events.jsonl'), true);
    assert.equal(isForbidden(spec, 'output/replay-002-canonical/snapshots.jsonl'), true);
});

test('excluded directories include local, historical outputs, replays, caches, and binaries', () => {
    for (const dir of ['.git/', 'node_modules/', '.local/', 'output/', 'samples/']) {
        assert(EXCLUDED_DIRS.includes(dir));
    }
});

test('symlink escape is detected when the platform permits symlink creation', async t => {
    const linkPath = `${fixtureRoot}/escape-link`;
    await mkdir(fixtureRoot, { recursive: true });
    await rm(linkPath, { force: true });
    try {
        await symlink(path.resolve('..'), linkPath, 'dir');
    } catch {
        t.skip('symlink creation unavailable on this platform');
        return;
    }
    await assert.rejects(() => assertNoSymlinkEscape(linkPath), /symlink escapes/u);
});

test('future Task 091 dry-run validates without executing follow-up code', async () => {
    const result = await preflight('091', { dryRun: true });
    assert.equal(result.passed, true);
    assert.equal(existsSync('tasks/blocked/092-select-next-canonical-generalization-control.md'), true);
});
