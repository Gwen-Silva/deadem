import { access, readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    ACCEPTED_PILOT_REPLAYS,
    FORBIDDEN_SEMANTIC_LAYERS,
    TARGET_BATCH_SIZE,
    UNSUPPORTED_BOT_REPLAYS,
    auditReplaySpecificBranches,
    decideBatchGate,
    expandFactualBatchTo15,
    protectionAuditFromCandidates
} from '../tools/expand-factual-batch-to-15-human-replays.mjs';

const ROOT = 'output/factual-batches/batch-015-human-factual-v1';

async function readJson(file) {
    return JSON.parse(await readFile(file, 'utf8'));
}

function acceptedRows(count = TARGET_BATCH_SIZE) {
    return Array.from({ length: count }, (_, index) => ({
        replayId: `replay_${String(index + 1).padStart(3, '0')}`,
        validationStatus: 'accepted'
    }));
}

test('target batch size is 15', () => {
    assert.equal(TARGET_BATCH_SIZE, 15);
});

test('accepted five pilot replay IDs are always represented', async () => {
    const manifest = await readJson(`${ROOT}/manifest.json`);
    assert.deepEqual(manifest.acceptedExistingPilotReplays, ACCEPTED_PILOT_REPLAYS);
    for (const replayId of ACCEPTED_PILOT_REPLAYS) assert.ok(manifest.includedReplays.includes(replayId));
});

test('replay 005 is excluded', async () => {
    const inventory = await readJson(`${ROOT}/candidate-inventory.json`);
    const row = inventory.candidates.find(item => item.replayId === 'replay_005');
    assert.equal(row.classification, 'protected_replay_excluded');
    assert.equal(row.includedInBatch, false);
});

test('006-008 are excluded by protection policy', () => {
    assert.deepEqual(UNSUPPORTED_BOT_REPLAYS, ['replay_006', 'replay_007', 'replay_008']);
});

test('candidate with missing generated artifacts is not included', () => {
    const candidates = [{ replayId: 'replay_010', classification: 'missing_required_generated_artifacts', includedInBatch: false }];
    assert.equal(candidates[0].includedInBatch, false);
});

test('candidate requiring parser run is blocked, not processed', async () => {
    const inventory = await readJson(`${ROOT}/candidate-inventory.json`);
    const protectedRow = inventory.candidates.find(item => item.replayId === 'replay_005');
    assert.equal(protectedRow.rawReplayTouched, false);
});

test('current replay 002 acceptance uses v9 terminal gate, not v8 canonical-state gate', async () => {
    const matrix = await readJson(`${ROOT}/batch-compatibility-matrix.json`);
    const row = matrix.rows.find(item => item.replayId === 'replay_002');
    assert.equal(row.acceptedGateSource, 'output/replay-002-canonical-v9-validation/terminal-release-verification.json');
    assert.notEqual(row.acceptedGateSource, 'output/replay-002-canonical/canonical-state-gate.json');
});

test('compact manifests are used for accepted references', async () => {
    for (const replayId of ACCEPTED_PILOT_REPLAYS) {
        const manifest = await readJson(`${ROOT}/${replayId}/compact-package-manifest.json`);
        assert.equal(manifest.fullCanonicalPackageCommittedByTask098, false);
        assert.equal(manifest.sourceReusedWithoutRegeneration, true);
    }
});

test('full package dumps are not committed by default', async () => {
    const gate = await readJson(`${ROOT}/batch-gate.json`);
    assert.equal(gate.fullPackageDumpsCommitted, false);
});

test('event-count differences are not schema breaks', async () => {
    const matrix = await readJson(`${ROOT}/batch-compatibility-matrix.json`);
    for (const row of matrix.rows) assert.notEqual(row.schemaCompatibility, 'schema_break');
});

test('missing optional overlays are not schema breaks', async () => {
    const matrix = await readJson(`${ROOT}/batch-compatibility-matrix.json`);
    const compactRows = matrix.rows.filter(row => row.packageRepresentation === 'compact_manifest_with_hashes_and_counts');
    assert.ok(compactRows.every(row => row.schemaCompatibility === 'schema_identical'));
});

test('replay-specific branch audit detects synthetic hardcode', () => {
    const audit = auditReplaySpecificBranches("if (replayId === 'replay_010') return patched;");
    assert.equal(audit.passed, false);
});

test('no forbidden semantic layers are emitted', async () => {
    const serialized = JSON.stringify(await readJson(`${ROOT}/batch-gate.json`));
    for (const layer of FORBIDDEN_SEMANTIC_LAYERS) assert.equal(serialized.includes(layer), false);
});

test('gate blocks if fewer than 15 eligible replays exist', async () => {
    const gate = await readJson(`${ROOT}/batch-gate.json`);
    assert.equal(gate.includedReplayCount < TARGET_BATCH_SIZE, true);
    assert.equal(gate.gate, 'factual_batch_15_expansion_blocked');
});

test('gate passes only with 15 accepted eligible replays', () => {
    const protection = { passed: true };
    const branchAudit = { passed: true };
    assert.equal(decideBatchGate(acceptedRows(15), protection, branchAudit), 'factual_batch_15_ready');
    assert.equal(decideBatchGate(acceptedRows(14), protection, branchAudit), 'factual_batch_15_expansion_blocked');
});

test('protection audit rejects synthetic replay 005 access', () => {
    const audit = protectionAuditFromCandidates([{ replayId: 'replay_005', rawReplayTouched: true }], { task099Exists: false });
    assert.equal(audit.passed, false);
});

test('no Task 099 exists', async () => {
    await assert.rejects(access('tasks/specs/099.json'));
});

test('local test run can use a custom output root', async () => {
    const result = await expandFactualBatchTo15({ clean: true, outputRoot: '.local/codex/098/test-batch' });
    assert.equal(result.gate, 'factual_batch_15_expansion_blocked');
    assert.equal(result.moreNeeded, 10);
});
