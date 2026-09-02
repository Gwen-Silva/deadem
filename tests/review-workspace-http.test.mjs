import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_REPO_ROOT } from '../tools/review-workspace/data-model.mjs';
import { runFunctionalSmoke } from '../tools/review-workspace/smoke.mjs';

test('real localhost server validates API, persistence, export, Range and request security', async () => {
    const result = await runFunctionalSmoke({ repoRoot: DEFAULT_REPO_ROOT });
    assert.equal(result.targetsResult, 2);
    assert.equal(result.candidateListResult, 102);
    assert.equal(result.candidate0015VisualStatus, 'available');
    assert.ok(result.candidate0015AudioCallRefs > 0);
    assert.equal(result.persistenceRoundtrip, true);
    assert.equal(result.humanTranscriptSeparated, true);
    assert.equal(result.segmentRoundtrip, true);
    assert.equal(result.exportRoundtrip, true);
    assert.equal(result.exportLocationReady, true);
    assert.equal(result.copyPathReady, true);
    assert.equal(result.openFolderReady, true);
    assert.equal(result.reviewedCanaryCount, 1);
    assert.ok(result.unreviewedCanaryCount > 0);
    assert.equal(result.rangeAudioStatus, 206);
    assert.equal(result.rangeAudioBytes, 32);
    assert.equal(result.pathTraversalStatus, 400);
    assert.equal(result.protectedAliasStatus, 400);
    assert.equal(result.upstreamArtifactMutationCount, 0);
    assert.equal(result.automaticGameplayInterpretationCount, 0);
    assert.equal(result.endpointsValidated.length, 9);
});

test('server refuses non-loopback binding', async () => {
    const { createReviewWorkspaceServer } = await import('../tools/review-workspace/server.mjs');
    await assert.rejects(() => createReviewWorkspaceServer({ host: '0.0.0.0' }), /review_workspace_must_bind_loopback/u);
});
