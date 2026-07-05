import { access, readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    ARTIFACT_CLASSES,
    FORBIDDEN_SEMANTIC_LAYERS,
    LOCAL_CACHE_ROOTS,
    REQUIRED_CACHE_KEY_FIELDS,
    SCALE_TARGETS
} from '../tools/audit-storage-cache-strategy.mjs';

async function readJson(file) {
    return JSON.parse(await readFile(file, 'utf8'));
}

function classByName(name) {
    return ARTIFACT_CLASSES.find(row => row.artifactClass === name);
}

test('artifact policy includes required artifact classes', () => {
    for (const name of [
        'raw_replay',
        'protected_replay',
        'unsupported_bot_replay',
        'parser_output',
        'source_extraction_artifact',
        'canonical_factual_package',
        'compact_package_manifest',
        'validation_audit_artifact',
        'report',
        'benchmark_profiling_artifact',
        'local_cache',
        'temporary_rerun',
        'logs',
        'screenshots_videos_frames',
        'vpk_map_extracted_assets',
        'model_runtime_artifacts',
        'human_annotations'
    ]) {
        assert.ok(classByName(name), `${name} missing`);
    }
});

test('raw replays are forbidden or local-only', () => {
    const policy = classByName('raw_replay');
    assert.equal(policy.gitPolicy, 'forbidden');
    assert.equal(policy.largeOutputAllowedByDefault, false);
});

test('replay 005 policy is protected and never requires hashing', async () => {
    const policy = classByName('protected_replay');
    const cache = await readJson('output/five-replay-pilot/storage-cache-strategy/cache-key-policy.json');
    assert.equal(policy.cachePolicy, 'protected');
    assert.match(cache.replay005Rule, /Do not read or hash replay 005/u);
});

test('bot fixtures remain unsupported', () => {
    const policy = classByName('unsupported_bot_replay');
    assert.equal(policy.gitPolicy, 'forbidden');
    assert.match(policy.notes, /006-008/u);
});

test('compact manifests are commit-allowed', () => {
    assert.equal(classByName('compact_package_manifest').gitPolicy, 'commit');
});

test('full packages are not committed by default at scale', () => {
    const policy = classByName('canonical_factual_package');
    assert.equal(policy.gitPolicy, 'summary_only');
    assert.match(policy.notes, /compact manifests/u);
});

test('cache key policy includes required fields', async () => {
    const cache = await readJson('output/five-replay-pilot/storage-cache-strategy/cache-key-policy.json');
    assert.deepEqual(cache.requiredFields, REQUIRED_CACHE_KEY_FIELDS);
});

test('regeneration policy forbids factual regeneration for report-only tasks', async () => {
    const policy = await readJson('output/five-replay-pilot/storage-cache-strategy/regeneration-policy.json');
    assert.match(policy.reportOnlyTaskRule, /must not regenerate canonical factual packages/u);
});

test('scaling estimates include 15, 50, 100, and 500', async () => {
    const estimates = await readJson('output/five-replay-pilot/storage-cache-strategy/scaling-estimates.json');
    assert.deepEqual(estimates.targets.map(row => row.replayCount), SCALE_TARGETS);
});

test('scenario estimates are marked approximate', async () => {
    const estimates = await readJson('output/five-replay-pilot/storage-cache-strategy/scaling-estimates.json');
    assert.equal(estimates.approximate, true);
    for (const target of estimates.targets) {
        for (const scenario of Object.values(target.scenarios)) assert.equal(scenario.approximate, true);
    }
});

test('known oversized historical file is recorded', async () => {
    const inventory = await readJson('output/five-replay-pilot/storage-cache-strategy/artifact-inventory-summary.json');
    assert.equal(inventory.knownOversizedHistoricalFile, 'output/04-controller-pawn-lifecycle.json');
});

test('future batch layout is defined', async () => {
    const cache = await readJson('output/five-replay-pilot/storage-cache-strategy/cache-key-policy.json');
    assert.equal(cache.batchLayout.committed, 'output/factual-batches/<batch-id>/');
    assert.equal(cache.batchLayout.localCache, '.local/deadem/cache/factual-batches/<batch-id>/');
});

test('no Task 098 exists', async () => {
    await assert.rejects(access('tasks/specs/098.json'));
});

test('forbidden semantic layers remain out of scope', () => {
    for (const layer of ['spatial semantics', 'mechanic effects', 'fights', 'rotations', 'pressure', 'macro', 'roles', 'decision-quality analysis']) {
        assert.ok(FORBIDDEN_SEMANTIC_LAYERS.includes(layer));
    }
});

test('local cache roots are under .local', () => {
    for (const root of LOCAL_CACHE_ROOTS) assert.match(root, /^\.local\//u);
});
