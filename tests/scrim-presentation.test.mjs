import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { DEFAULT_REPO_ROOT, loadWorkspaceData } from '../tools/review-workspace/data-model.mjs';
import { loadLocalScrimData } from '../tools/review-workspace/scrim-media.mjs';
import {
    assertPublicReplayMatchId,
    buildScrimPresentation,
    parseFriendlyScrimNavigation,
    publicReplayUrl,
    resolveFriendlyReplayEntry
} from '../tools/review-workspace/scrim-presentation.mjs';
import { createReviewWorkspaceServer } from '../tools/review-workspace/server.mjs';

let workspaceData;
let scrimData;
test.before(async () => {
    workspaceData = await loadWorkspaceData();
    scrimData = loadLocalScrimData(DEFAULT_REPO_ROOT);
});

test('friendly Replay vocabulary allows only the two real public matches', () => {
    assert.equal(publicReplayUrl('003'), '/scrim?match=003');
    assert.equal(publicReplayUrl('004', 25), '/scrim?match=004&moment=25');
    assert.deepEqual(parseFriendlyScrimNavigation('?match=003&moment=25'), { kind: 'friendly', matchId: '003', momentNumber: 25 });
    assert.deepEqual(parseFriendlyScrimNavigation('?match=004'), { kind: 'friendly', matchId: '004', momentNumber: null });
    assert.equal(parseFriendlyScrimNavigation('?reviewTargetId=review_match_003&vodTimeSeconds=78.359&preRollSeconds=10'), null);
    for (const value of ['001', '002', '005', '006', '007', '008', '../003']) {
        assert.throws(() => assertPublicReplayMatchId(value), /not_allowlisted/u);
    }
    for (const query of ['?match=003&moment=0', '?match=003&moment=../../x', '?match=003&path=private', '?match=003&match=004', '?match=003&moment=1&moment=2']) {
        assert.throws(() => parseFriendlyScrimNavigation(query), /invalid_public_replay/u);
    }
});

test('real candidate context produces complete chronological factual marker coverage', () => {
    const expected = { '003': 48, '004': 57 };
    for (const matchId of Object.keys(expected)) {
        const presentation = buildScrimPresentation({
            workspaceData,
            reviewState: {},
            sessions: scrimData.view.vodSessions,
            matchId
        });
        assert.equal(presentation.expectedMarkerCount, expected[matchId]);
        assert.equal(presentation.markerCount, expected[matchId]);
        assert.equal(presentation.markerCoverage, 1);
        assert.deepEqual(presentation.markerGaps, []);
        assert.equal(presentation.semantics, 'chronological_factual_review_context_not_gameplay_event_or_ranking');
        assert.ok(presentation.markers.every((marker, index, markers) => index === 0 || marker.vodAnchorSeconds >= markers[index - 1].vodAnchorSeconds));
        assert.ok(presentation.markers.every(marker => marker.vodAnchorSeconds >= presentation.session.vodRange.start && marker.vodAnchorSeconds <= presentation.session.vodRange.end));
        assert.doesNotMatch(JSON.stringify(presentation), /candidateWindowId|review_match_|vodSessionId|sourceVodRef|trackRef|\.local|[A-Z]:[\\/]|\.dem|\.wav|\.aac|\.mp4/iu);
    }
});

test('deep-link entry keeps pre-roll while direct timeline selection can use the exact marker anchor', () => {
    const presentation = buildScrimPresentation({ workspaceData, reviewState: {}, sessions: scrimData.view.vodSessions, matchId: '003' });
    const navigation = parseFriendlyScrimNavigation('?match=003&moment=25');
    const entry = resolveFriendlyReplayEntry(navigation, presentation);
    assert.equal(entry.marker.momentNumber, 25);
    assert.equal(entry.entryUsesPreRoll, true);
    assert.equal(entry.seekVodSeconds, entry.marker.vodAnchorSeconds - entry.marker.preRollSeconds);
    const root = resolveFriendlyReplayEntry(parseFriendlyScrimNavigation('?match=003'), presentation);
    assert.equal(root.marker, null);
    assert.equal(root.seekVodSeconds, presentation.session.vodRange.start);
});

test('safe HTTP presentation and friendly pages preserve legacy technical links', async () => {
    const stateRoot = await mkdtemp(path.join(os.tmpdir(), 'deadem-task216-state-'));
    const workspace = await createReviewWorkspaceServer({ port: 0, stateRoot });
    try {
        const url = await workspace.start();
        for (const [matchId, count] of [['003', 48], ['004', 57]]) {
            const response = await fetch(`${url}/api/scrim/presentation/${matchId}`);
            assert.equal(response.status, 200);
            const text = await response.text();
            assert.equal(JSON.parse(text).markerCount, count);
            assert.doesNotMatch(text, /candidateWindowId|review_match_|vodSessionId|sourceVodRef|trackRef|\.local|[A-Z]:[\\/]|\.dem|\.wav|\.aac|\.mp4/iu);
            assert.equal((await fetch(`${url}/scrim?match=${matchId}`)).status, 200);
            assert.equal((await fetch(`${url}/scrim?match=${matchId}&moment=1`)).status, 200);
        }
        assert.equal((await fetch(url + '/scrim?reviewTargetId=review_match_003&vodTimeSeconds=78.359&preRollSeconds=10')).status, 200);
        assert.equal((await fetch(url + '/scrim?match=003&moment=49')).status, 400);
        for (const id of ['001', '002', '005', '006', '007', '008']) {
            assert.equal((await fetch(`${url}/scrim?match=${id}`)).status, 400);
        }
    } finally {
        await workspace.stop();
        await rm(stateRoot, { recursive: true, force: true });
    }
});
