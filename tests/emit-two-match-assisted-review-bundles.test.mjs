import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    REVIEW_PROTOCOL_TEMPLATE,
    assertReviewTargetId,
    buildReviewOrders,
    freshReviewRecord,
    groupAtlasPages,
    groupUploadPackets,
    noGameplayLabels
} from '../tools/emit-two-match-assisted-review-bundles.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = path.join(ROOT, 'output/local-replay-processing/assisted-review-bundles/task204-bounded2');

function window(id, start, priority = 'medium', target = 'review_match_001') {
    return { candidateWindowId: `${target}_window_${String(id).padStart(4, '0')}`, reviewTargetId: target, replayStartSeconds: start, replayEndSeconds: start + 10, priorityTier: priority };
}

test('chronological order and priority scheduling are separate and deterministic', () => {
    const windows = [window(1, 20, 'low'), window(2, 0, 'medium'), window(3, 10, 'high')];
    const orders = buildReviewOrders(windows);
    assert.deepEqual(orders.chronologicalOrder, [windows[1].candidateWindowId, windows[2].candidateWindowId, windows[0].candidateWindowId]);
    assert.deepEqual(orders.priorityOrder, [windows[2].candidateWindowId, windows[1].candidateWindowId, windows[0].candidateWindowId]);
});

test('screening atlas groups exactly six cards per full page in chronological input order', () => {
    const windows = Array.from({ length: 13 }, (_, index) => window(index + 1, index * 10));
    const pages = groupAtlasPages('review_match_001', windows);
    assert.deepEqual(pages.map(page => page.candidateWindowIds.length), [6, 6, 1]);
    assert.deepEqual(pages[0].replayRange, { startSeconds: 0, endSeconds: 60 });
    assert.deepEqual(pages.flatMap(page => page.candidateWindowIds), windows.map(item => item.candidateWindowId));
});

test('upload packets group three atlas pages and retain candidate membership', () => {
    const windows = Array.from({ length: 31 }, (_, index) => window(index + 1, index * 10));
    const pages = groupAtlasPages('review_match_001', windows).map(page => ({ ...page, localPath: `${page.atlasPageId}.jpg`, sha256: 'a'.repeat(64), sizeBytes: 100 }));
    const packets = groupUploadPackets('review_match_001', pages);
    assert.deepEqual(packets.map(packet => packet.atlasPageIds.length), [3, 3]);
    assert.equal(packets.flatMap(packet => packet.candidateWindowIds).length, 31);
});

test('review template is empty and one fresh record cannot mutate another', () => {
    const first = freshReviewRecord('candidate_a');
    const second = freshReviewRecord('candidate_b');
    first.facts.push('later human review');
    assert.deepEqual(second.facts, []);
    assert.equal(second.reviewState, 'unreviewed');
    assert.equal(second.decisionQuality, null);
    assert.deepEqual(REVIEW_PROTOCOL_TEMPLATE.errorClasses, []);
});

test('protected aliases are rejected before filesystem use', () => {
    for (const alias of ['replay_005', 'replay-006', 'match_007', 'partida_008']) assert.throws(() => assertReviewTargetId(alias), /protected replay alias/u);
});

test('screening metadata helper rejects future gameplay labels', () => {
    assert.equal(noGameplayLabels({ candidate: 'review_match_001_window_0001', priority: 'high' }), true);
    assert.equal(noGameplayLabels({ label: 'death' }), false);
    assert.equal(noGameplayLabels({ label: 'good play' }), false);
});

test('real bundle preserves 102 candidates one-to-one with empty analyst inference and review records', async () => {
    const artifact = JSON.parse(await readFile(path.join(OUTPUT, 'window-review-index.json'), 'utf8'));
    assert.equal(artifact.candidateCount, 102);
    assert.equal(new Set(artifact.windows.map(item => item.candidateWindowId)).size, 102);
    assert.ok(artifact.windows.every(item => item.analystInference.length === 0));
    assert.ok(artifact.windows.every(item => item.reviewRecord.reviewState === 'unreviewed' && item.reviewRecord.errorClasses.length === 0 && item.reviewRecord.facts.length === 0));
});

test('real first/representative/last bridge has exactly three screening source frames', async () => {
    const artifact = JSON.parse(await readFile(path.join(OUTPUT, 'window-review-index.json'), 'utf8'));
    assert.ok(artifact.windows.every(item => item.videoEvidence.firstFrameId && item.videoEvidence.representativeFrameId && item.videoEvidence.lastFrameId));
    assert.ok(artifact.windows.every(item => item.videoEvidence.screeningCard.sourceFrameIds.length === 3 && item.videoEvidence.screeningCard.sourceFrameHashes.length === 3));
});

test('real human context remains match-level player-reported data without timestamps', async () => {
    const contexts = JSON.parse(await readFile(path.join(OUTPUT, 'match-context.json'), 'utf8'));
    assert.equal(contexts.provenanceClass, 'human_supplied/player_reported');
    assert.equal(contexts.contexts.length, 2);
    assert.ok(contexts.contexts.every(context => context.analystInference.length === 0));
    assert.ok(contexts.contexts.flatMap(context => context.statements).every(statement => statement.status === 'context_to_validate' && statement.timestamps.length === 0));
});

test('real atlas, packet and storyboard bridges cover every candidate', async () => {
    const atlas = JSON.parse(await readFile(path.join(OUTPUT, 'screening-atlas-index.json'), 'utf8'));
    const packets = JSON.parse(await readFile(path.join(OUTPUT, 'upload-packet-index.json'), 'utf8'));
    const windows = JSON.parse(await readFile(path.join(OUTPUT, 'window-review-index.json'), 'utf8'));
    assert.equal(atlas.pageCount, 18);
    assert.ok(atlas.pages.every(page => page.candidateWindowIds.length >= 1 && page.candidateWindowIds.length <= 6));
    assert.equal(atlas.pages.flatMap(page => page.candidateWindowIds).length, 102);
    assert.equal(packets.packetCount, 6);
    assert.ok(packets.packets.every(packet => packet.atlasPageIds.length === 3));
    assert.ok(windows.windows.every(item => item.videoEvidence.storyboards.length === item.videoEvidence.storyboardPageCount && item.videoEvidence.storyboards.length > 0));
});

test('real Task203 hash bridge, determinism and local-only image policy are explicit', async () => {
    const manifest = JSON.parse(await readFile(path.join(OUTPUT, 'manifest.json'), 'utf8'));
    const summary = JSON.parse(await readFile(path.join(OUTPUT, 'summary.json'), 'utf8'));
    const provenance = JSON.parse(await readFile(path.join(OUTPUT, 'provenance-audit.json'), 'utf8'));
    assert.equal(manifest.task203LocalArtifactValidation.flatMap(target => target.artifacts).length, 8);
    assert.ok(manifest.task203LocalArtifactValidation.flatMap(target => target.artifacts).every(artifact => artifact.status === 'validated' && artifact.expectedSha256 === artifact.actualSha256));
    assert.ok(summary.targets.every(target => target.metrics.atlasByteDeterministic));
    assert.equal(summary.aggregate.imagesVersioned, 0);
    assert.equal(provenance.replayAccessCount, 0);
    assert.equal(provenance.vodAccessCount, 0);
    assert.equal(provenance.protectedAccessCount, 0);
    assert.equal(provenance.gameplayInterpretationCount, 0);
});
