import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
    DEFAULT_REPO_ROOT,
    MediaRegistry,
    assertCandidateId,
    assertSafeRequestPath,
    assertTargetId,
    listCandidates,
    loadWorkspaceData,
    sha256,
    validateReviewState
} from '../tools/review-workspace/data-model.mjs';
import { ReviewStateStore, emptyReviewState } from '../tools/review-workspace/persistence.mjs';
import { buildExportPacket, exportPacketMarkdown, writeExportPacket } from '../tools/review-workspace/export.mjs';

let data;
test.before(async () => { data = await loadWorkspaceData(); });

test('target and candidate allowlists reject protected aliases', () => {
    assert.equal(assertTargetId('review_match_001'), 'review_match_001');
    assert.throws(() => assertTargetId('replay_005'), /target_not_allowlisted/u);
    assert.throws(() => assertCandidateId('../review_match_001_window_0015'), /invalid_candidate_id/u);
    assert.throws(() => assertSafeRequestPath('/%2e%2e/secret'), /unsafe_request_path/u);
    assert.throws(() => assertSafeRequestPath('/replay_008/file'), /unsafe_request_path/u);
});

test('loads exactly 67 plus 35 immutable candidates without replay or VOD access', () => {
    assert.equal(data.targets.length, 2);
    assert.deepEqual(data.targets.map(target => target.candidateCount), [67, 35]);
    assert.equal(data.candidateById.size, 102);
    assert.equal(data.accessAudit.replayAccessCount, 0);
    assert.equal(data.accessAudit.vodAccessCount, 0);
    assert.equal(data.accessAudit.protectedAccessCount, 0);
    assert.ok([...data.candidateById.values()].every(candidate => Object.isFrozen(candidate)));
});

test('candidate loading preserves the upstream artifact fingerprint', async () => {
    const sourcePath = path.join(DEFAULT_REPO_ROOT, 'output/local-replay-processing/assisted-review-bundles/task204-bounded2/window-review-index.json');
    const before = sha256(await readFile(sourcePath));
    await loadWorkspaceData();
    assert.equal(sha256(await readFile(sourcePath)), before);
});

test('chronological and priority ordering use accepted queues', () => {
    const chronological = listCandidates(data, { reviewTargetId: 'review_match_001' });
    const priority = listCandidates(data, { reviewTargetId: 'review_match_001', order: 'priority' });
    assert.equal(chronological[0].candidateWindowId, 'review_match_001_window_0001');
    assert.equal(priority[0].candidateWindowId, 'review_match_001_window_0006');
    assert.ok(priority.every(candidate => candidate.priority.label === 'review scheduling heuristic'));
});

test('review-state filters and candidate search are deterministic', () => {
    const state = emptyReviewState('review_match_001');
    state.candidates.review_match_001_window_0015 = { reviewRecord: { reviewState: 'reviewed' } };
    const reviewed = listCandidates(data, { reviewTargetId: 'review_match_001', status: 'reviewed', reviewState: state });
    const searched = listCandidates(data, { reviewTargetId: 'review_match_001', search: '0015', reviewState: state });
    assert.deepEqual(reviewed.map(item => item.candidateWindowId), ['review_match_001_window_0015']);
    assert.deepEqual(searched.map(item => item.candidateWindowId), ['review_match_001_window_0015']);
});

test('media registry accepts trusted refs, rejects traversal and degrades missing media', () => {
    const registry = new MediaRegistry(DEFAULT_REPO_ROOT);
    const missing = registry.registerTrusted({
        kind: 'frame', reviewTargetId: 'review_match_001', targetId: 'review_match_001', refId: 'missing',
        relativePath: '.local/deadem/dense-review/review_match_001/frames/not-present.jpg'
    });
    assert.equal(missing.status, 'unavailable');
    assert.equal(registry.resolve(missing.mediaId).available, false);
    assert.throws(() => registry.registerTrusted({ kind: 'frame', targetId: 'review_match_001', refId: 'bad', relativePath: '../secret.jpg' }), /unsafe_trusted_media_path/u);
    assert.throws(() => registry.registerTrusted({ kind: 'frame', targetId: 'review_match_001', refId: 'bad', relativePath: 'samples/replay_005/file.jpg' }), /unsafe_trusted_media_path/u);
});

test('audio offset mapping retains ASR draft and 1.5-second context', () => {
    const candidate = data.candidateById.get('review_match_001_window_0015');
    const call = candidate.audioCallEvidence.calls[0];
    assert.equal(candidate.audioCallEvidence.label, 'ASR DRAFT — HUMAN VALIDATION REQUIRED');
    assert.equal(call.speakerStatus, 'unknown/mixed');
    assert.equal(call.playback.startSeconds, Number(Math.max(0, call.vodStartSeconds - 1938 - 1.5).toFixed(3)));
    assert.ok(call.playback.endSeconds > call.playback.startSeconds);
});

function syntheticState(candidate, { overlap = false, outside = false } = {}) {
    const start = candidate.videoEvidence.visualVodRangeSeconds.start;
    const end = candidate.videoEvidence.visualVodRangeSeconds.end;
    const segmentStart = outside ? start - 1 : start;
    const segments = [{
        reviewSegmentId: `${candidate.candidateWindowId}_segment_01`,
        candidateWindowId: candidate.candidateWindowId,
        reviewTargetId: candidate.reviewTargetId,
        vodStartSeconds: segmentStart,
        vodEndSeconds: start + 5,
        humanLabel: 'synthetic', humanNotes: null, evidenceRefs: [], reviewRecord: { reviewState: 'in_review', errorClasses: [] }
    }];
    if (overlap) segments.push({
        ...segments[0], reviewSegmentId: `${candidate.candidateWindowId}_segment_02`, vodStartSeconds: start + 4, vodEndSeconds: Math.min(end, start + 8)
    });
    return {
        schemaVersion: 1,
        reviewTargetId: candidate.reviewTargetId,
        candidates: {
            [candidate.candidateWindowId]: {
                reviewRecord: { reviewState: 'in_review', errorClasses: [] },
                transcriptCorrections: {},
                reviewSegments: segments
            }
        }
    };
}

test('atomic review-state persistence survives save and reload', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'review-state-test-'));
    try {
        const store = new ReviewStateStore({ root, workspaceData: data });
        const candidate = data.candidateById.get('review_match_001_window_0015');
        const saved = await store.save('review_match_001', syntheticState(candidate));
        const reloaded = await store.load('review_match_001');
        assert.deepEqual(reloaded, saved);
        assert.equal(reloaded.candidates[candidate.candidateWindowId].reviewSegments.length, 1);
    } finally { await rm(root, { recursive: true, force: true }); }
});

test('segment validation detects overlap without merging', () => {
    const candidate = data.candidateById.get('review_match_001_window_0015');
    const validated = validateReviewState('review_match_001', syntheticState(candidate, { overlap: true }), data);
    assert.equal(validated.candidates[candidate.candidateWindowId].reviewSegments.length, 2);
    assert.equal(validated.overlaps.length, 1);
});

test('segment validation rejects boundaries outside the candidate', () => {
    const candidate = data.candidateById.get('review_match_001_window_0015');
    assert.throws(() => validateReviewState('review_match_001', syntheticState(candidate, { outside: true }), data), /review_segment_outside_candidate/u);
});

test('human transcript stays separate from immutable ASR and no error class is automatic', () => {
    const candidate = data.candidateById.get('review_match_001_window_0015');
    const state = syntheticState(candidate);
    const call = candidate.audioCallEvidence.calls[0];
    state.candidates[candidate.candidateWindowId].transcriptCorrections[call.callSegmentId] = {
        humanTranscript: 'synthetic correction', classification: 'correct'
    };
    const validated = validateReviewState('review_match_001', state, data);
    assert.equal(call.asrDraft, candidate.audioCallEvidence.calls[0].asrDraft);
    assert.equal(validated.candidates[candidate.candidateWindowId].transcriptCorrections[call.callSegmentId].humanTranscript, 'synthetic correction');
    assert.deepEqual(validated.candidates[candidate.candidateWindowId].reviewRecord.errorClasses, []);
});

test('JSON and Markdown export contain refs and metadata but no embedded media', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'review-export-test-'));
    try {
        const candidate = data.candidateById.get('review_match_001_window_0015');
        const state = validateReviewState('review_match_001', syntheticState(candidate), data);
        const selection = { reviewTargetId: 'review_match_001', candidateWindowId: candidate.candidateWindowId };
        const packet = buildExportPacket(data, state, selection);
        const markdown = exportPacketMarkdown(packet);
        assert.equal(packet.mediaEmbedded, false);
        assert.equal(packet.automaticGameplayInterpretationCount, 0);
        assert.match(markdown, /review_match_001_window_0015/u);
        const result = await writeExportPacket({ workspaceData: data, reviewState: state, selection, exportRoot: root });
        assert.equal(JSON.parse(await readFile(result.jsonPath, 'utf8')).candidateCount, 1);
        assert.match(await readFile(result.markdownPath, 'utf8'), /ASR drafts require human validation/u);
    } finally { await rm(root, { recursive: true, force: true }); }
});
