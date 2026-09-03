import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { DEFAULT_REPO_ROOT, loadWorkspaceData } from '../tools/review-workspace/data-model.mjs';
import { loadLocalScrimData } from '../tools/review-workspace/scrim-media.mjs';
import { createReviewWorkspaceServer } from '../tools/review-workspace/server.mjs';
import {
    assertPublicMatchId,
    buildProductCatalog,
    buildProductMatch,
    candidateIdForMoment,
    deriveReviewProgress,
    displayNameForTarget,
    replayLink,
    reviewLink,
    selectCandidateCover,
    targetIdFromPublicMatchId
} from '../tools/review-workspace/product-view-model.mjs';
import { parseFriendlyReviewNavigation } from '../tools/review-workspace/public/product-navigation.mjs';

let workspaceData;
let scrimSessions;
test.before(async () => {
    workspaceData = await loadWorkspaceData();
    scrimSessions = loadLocalScrimData(DEFAULT_REPO_ROOT).view.vodSessions;
});

test('display identities map only the four allowlisted targets', () => {
    for (const id of ['001', '002', '003', '004']) {
        assert.equal(assertPublicMatchId(id), id);
        assert.equal(targetIdFromPublicMatchId(id), `review_match_${id}`);
        assert.equal(displayNameForTarget(`review_match_${id}`), `Scrim ${id.slice(-2)}`);
    }
    for (const id of ['005', '006', '007', '008', '../003', '3']) {
        assert.throws(() => assertPublicMatchId(id), /not_allowlisted/u);
    }
});

test('review progress derives not started, in progress and completed only from real states', () => {
    const candidates = [{ candidateWindowId: 'a' }, { candidateWindowId: 'b' }, { candidateWindowId: 'c' }];
    assert.deepEqual(deriveReviewProgress(candidates, {}).state, 'not_started');
    const inProgress = deriveReviewProgress(candidates, { candidates: {
        a: { reviewRecord: { reviewState: 'in_review' } },
        b: { reviewRecord: { reviewState: 'reviewed' } }
    } });
    assert.equal(inProgress.state, 'in_progress');
    assert.equal(inProgress.processed, 1);
    assert.equal(inProgress.inReview, 1);
    assert.equal(inProgress.pending, 1);
    const completed = deriveReviewProgress(candidates, { candidates: {
        a: { reviewRecord: { reviewState: 'reviewed' } },
        b: { reviewRecord: { reviewState: 'skipped' } },
        c: { reviewRecord: { reviewState: 'reviewed' } }
    } });
    assert.equal(completed.state, 'completed');
    assert.equal(completed.processed, 3);
    assert.equal(completed.skipped, 1);
    assert.equal(completed.percent, 100);
});

test('cover selection is chronological, representative-first and has a safe fallback', () => {
    const candidates = [
        { chronologicalRank: 2, videoEvidence: { frames: [{ role: 'representative', status: 'available', url: '/media/' + 'b'.repeat(32) }] } },
        { chronologicalRank: 1, videoEvidence: { frames: [{ role: 'first', status: 'available', url: '/media/' + 'a'.repeat(32) }, { role: 'representative', status: 'available', url: '/media/' + 'c'.repeat(32) }] } }
    ];
    assert.equal(selectCandidateCover(candidates, 'Scrim 01').url, '/media/' + 'c'.repeat(32));
    const firstFallback = selectCandidateCover([{ chronologicalRank: 1, videoEvidence: { frames: [{ role: 'first', status: 'available', url: '/media/' + 'd'.repeat(32) }] } }], 'Scrim 01');
    assert.equal(firstFallback.url, '/media/' + 'd'.repeat(32));
    assert.deepEqual(selectCandidateCover([], 'Scrim 01'), { status: 'unavailable', url: null, alt: 'Preview visual indisponível da Scrim 01' });
});

test('real catalog exposes four matches, honest materials and no fabricated metadata', () => {
    const reviewStates = Object.fromEntries(['001', '002', '003', '004'].map(id => [`review_match_${id}`, {}]));
    const catalog = buildProductCatalog({ workspaceData, reviewStates, scrimSessions });
    assert.deepEqual(catalog.matches.map(match => match.displayName), ['Scrim 01', 'Scrim 02', 'Scrim 03', 'Scrim 04']);
    assert.deepEqual(catalog.matches.map(match => match.review.total), [67, 35, 48, 57]);
    assert.ok(catalog.matches.every(match => match.cover.status === 'available'));
    assert.ok(catalog.matches.every(match => match.materials.gameplay === 'available' && match.materials.matchData === 'available' && match.materials.communication === 'available'));
    assert.deepEqual(catalog.matches.map(match => match.materials.synchronizedReplay), ['unavailable', 'unavailable', 'available', 'available']);
    assert.deepEqual(catalog.matches.map(match => Boolean(match.replayUrl)), [false, false, true, true]);
    for (const forbidden of ['date', 'opponent', 'winner', 'result', 'lineup', 'map']) {
        assert.equal(JSON.stringify(catalog).toLowerCase().includes(`"${forbidden}"`), false);
    }
});

test('moments map real candidates to friendly safe links and reject invalid values', () => {
    const match = buildProductMatch({ workspaceData, reviewState: {}, scrimSessions, matchId: '003' });
    assert.equal(match.moments.length, 48);
    assert.equal(match.moments[24].momentNumber, 25);
    assert.equal(match.moments[24].reviewUrl, '/review?match=003&moment=25');
    assert.equal(match.moments[24].replayUrl, '/scrim?match=003&moment=25');
    assert.equal(match.replayUrl, '/scrim?match=003');
    assert.equal(candidateIdForMoment('003', 25), 'review_match_003_window_0025');
    assert.equal(reviewLink('003'), '/review?match=003');
    assert.equal(replayLink('003'), '/scrim?match=003');
    assert.throws(() => candidateIdForMoment('003', 0), /invalid_public_moment/u);
    assert.throws(() => candidateIdForMoment('005', 1), /not_allowlisted/u);
});

test('friendly Review navigation resolves valid targets and safely rejects unknown or protected values', () => {
    assert.deepEqual(parseFriendlyReviewNavigation('?match=003&moment=25'), {
        matchId: '003', targetId: 'review_match_003', candidateId: 'review_match_003_window_0025'
    });
    assert.deepEqual(parseFriendlyReviewNavigation('?match=001'), {
        matchId: '001', targetId: 'review_match_001', candidateId: null
    });
    for (const query of ['?match=005', '?match=008&moment=1', '?match=003&moment=0', '?match=003&moment=../../secret', '?path=C:/private']) {
        assert.equal(parseFriendlyReviewNavigation(query), null);
    }
});

test('product HTTP APIs are allowlisted and contain no private path or media extension', async () => {
    const stateRoot = await mkdtemp(path.join(DEFAULT_REPO_ROOT, '.local/codex/214/product-http-'));
    const server = await createReviewWorkspaceServer({ port: 0, stateRoot, openFolder: async () => {} });
    try {
        const url = await server.start();
        const catalogResponse = await fetch(url + '/api/product/matches');
        assert.equal(catalogResponse.status, 200);
        const text = await catalogResponse.text();
        const catalog = JSON.parse(text);
        assert.equal(catalog.matches.length, 4);
        assert.doesNotMatch(text, /\.local|[A-Z]:[\\/]|\.dem|\.wav|\.aac|\.mp4|craig|discord|guild|requester/iu);
        for (const id of ['001', '002', '003', '004']) {
            const response = await fetch(`${url}/api/product/matches/${id}`);
            assert.equal(response.status, 200);
            assert.equal((await response.json()).id, id);
            assert.equal((await fetch(`${url}/matches/${id}`)).status, 200);
        }
        for (const id of ['005', '006', '007', '008', '999']) {
            assert.equal((await fetch(`${url}/api/product/matches/${id}`)).status, 400);
            assert.equal((await fetch(`${url}/matches/${id}`)).status, 404);
        }
    } finally {
        await server.stop();
    }
});
