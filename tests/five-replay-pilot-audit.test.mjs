import { access, readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    AUDITED_REPLAYS,
    FORBIDDEN_SEMANTIC_LAYERS,
    REQUIRED_FACTUAL_CATEGORIES,
    auditFiveHumanReplayPilot,
    decidePilotGate,
    protectionAuditFromRows
} from '../tools/audit-five-human-replay-pilot.mjs';

const AUDIT_ROOT = 'output/five-replay-pilot/audit';

async function readJson(file) {
    return JSON.parse(await readFile(file, 'utf8'));
}

test('pilot replay list is exactly 001, 002, 003, 004, and 009', () => {
    assert.deepEqual(AUDITED_REPLAYS, ['replay_001', 'replay_002', 'replay_003', 'replay_004', 'replay_009']);
});

test('pilot manifest excludes replay 005 as protected', async () => {
    const manifest = await readJson('data/five-human-replay-pilot.json');
    assert.ok(manifest.excludedReplays.some(row => row.replayId === 'replay_005' && row.reason === 'protected_final_holdout'));
});

test('pilot manifest excludes 006-008 as unsupported bots', async () => {
    const manifest = await readJson('data/five-human-replay-pilot.json');
    for (const replayId of ['replay_006', 'replay_007', 'replay_008']) {
        assert.ok(manifest.excludedReplays.some(row => row.replayId === replayId && row.reason === 'unsupported_bot_fixture'));
    }
});

test('Task 095 outputs for 001, 003, and 004 are present', async () => {
    for (const replayId of ['replay_001', 'replay_003', 'replay_004']) {
        await access(`output/five-replay-pilot/remaining-human-controls/${replayId}/canonical-package-manifest.json`);
        await access(`output/five-replay-pilot/remaining-human-controls/${replayId}/validation-summary.json`);
    }
});

test('Task 094 v9 gate for replay 002 is used instead of historical v8 canonical gate', async () => {
    const manifest = await readJson(`${AUDIT_ROOT}/manifest.json`);
    assert.equal(manifest.acceptedGateSources.replay_002, 'output/replay-002-canonical-v9-validation/terminal-release-verification.json');
    assert.notEqual(manifest.acceptedGateSources.replay_002, 'output/replay-002-canonical/canonical-state-gate.json');
});

test('replay 009 accepted status is present', async () => {
    const matrix = await readJson(`${AUDIT_ROOT}/compatibility-matrix.json`);
    const row = matrix.rows.find(item => item.replayId === 'replay_009');
    assert.equal(row.acceptedGate, 'replay_009_canonical_factual_state_ready_with_constraints');
    assert.equal(row.validationStatus, 'accepted');
});

test('no Task 097 exists', async () => {
    await assert.rejects(access('tasks/specs/097.json'));
});

test('category coverage excludes forbidden semantic layers', async () => {
    const coverage = await readJson(`${AUDIT_ROOT}/category-coverage.json`);
    assert.deepEqual(coverage.categories, REQUIRED_FACTUAL_CATEGORIES);
    for (const layer of FORBIDDEN_SEMANTIC_LAYERS) {
        assert.equal(coverage.categories.includes(layer), false);
    }
});

test('protection audit rejects a synthetic replay 005 access row', () => {
    const audit = protectionAuditFromRows([{ replayId: 'replay_005', rawReplayAccessStatus: 'read' }], { task097Exists: false });
    assert.equal(audit.passed, false);
    assert.equal(audit.replay005Accessed, true);
});

test('storage baseline includes compact versus full representation', async () => {
    const storage = await readJson(`${AUDIT_ROOT}/storage-baseline.json`);
    assert.ok(storage.rows.some(row => row.packageRepresentation === 'compact_manifest_with_hashes_and_counts' && row.compactOutputSizeBytes > 0));
    assert.ok(storage.rows.some(row => row.packageRepresentation === 'full_canonical_package_committed' && row.fullPackageSizeBytes > 0));
});

test('missing timing is represented as unavailable, not zero', async () => {
    const performance = await readJson(`${AUDIT_ROOT}/performance-baseline.json`);
    for (const replayId of ['replay_002', 'replay_009']) {
        const row = performance.rows.find(item => item.replayId === replayId);
        assert.equal(row.processingDurationMs, null);
        assert.equal(row.processingDurationStatus, 'not_available_from_current_artifacts');
    }
});

test('pilot gate blocks if any replay row is missing', () => {
    const rows = AUDITED_REPLAYS.slice(1).map(replayId => ({
        replayId,
        validationStatus: 'accepted',
        categoryAvailability: Object.fromEntries(REQUIRED_FACTUAL_CATEGORIES.map(category => [category, { available: true }])),
        provenanceStatus: 'complete'
    }));
    const gate = decidePilotGate(rows, protectionAuditFromRows(rows, { task097Exists: false }));
    assert.equal(gate, 'five_human_replay_factual_pilot_blocked');
});

test('audit can write to a local custom root without finalizing a new task', async () => {
    const result = await auditFiveHumanReplayPilot({
        clean: true,
        outputRoot: '.local/codex/096/test-audit',
        reportPath: '.local/codex/096/test-audit-report.md'
    });
    assert.equal(result.gate, 'five_human_replay_factual_pilot_ready');
    await access('.local/codex/096/test-audit/pilot-audit-gate.json');
});
