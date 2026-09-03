import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { ScrimMediaRegistry, assertScrimMediaPath, loadLocalScrimData } from '../tools/review-workspace/scrim-media.mjs';
import { createReviewWorkspaceServer } from '../tools/review-workspace/server.mjs';
import { DEFAULT_REPO_ROOT } from '../tools/review-workspace/data-model.mjs';

test('media allowlist and protected aliases reject before file access', () => {
    const registry = new ScrimMediaRegistry([]);
    assert.throws(() => registry.register('not-authorized.wav'), /not_authorized/u);
    for (const id of ['005', '006', '007', '008']) assert.throws(() => assertScrimMediaPath(`replay_${id}/audio.wav`), /protected/u);
    assert.throws(() => assertScrimMediaPath('input.dem'), /protected/u);
    assert.throws(() => assertScrimMediaPath('../private.wav'), /unsafe/u);
    assert.throws(() => assertScrimMediaPath('review_match_003/replay/private.mp4'), /protected/u);
    assert.equal(registry.resolve('../../secret'), null);
});

test('two authorized real VODs from one Craig recording use opaque IDs and HTTP Range', async () => {
    const data = loadLocalScrimData(DEFAULT_REPO_ROOT);
    const real = data.view.vodSessions.filter(session => session.reviewTargetId);
    assert.deepEqual(real.map(row => row.reviewTargetId), ['review_match_003', 'review_match_004']);
    assert.equal(data.view.tracks.length, 9);
    const workspace = await createReviewWorkspaceServer({ port: 0, scrimOnly: true, scrimData: data });
    try {
        const url = await workspace.start();
        for (const session of real) {
            assert.match(session.media.url, /^\/scrim\/media\/[0-9a-f]{32}$/u);
            const response = await fetch(url + session.media.url, { headers: { range: 'bytes=0-63' } });
            assert.equal(response.status, 206);
            assert.equal(response.headers.get('content-type'), 'video/mp4');
            assert.equal((await response.arrayBuffer()).byteLength, 64);
        }
    } finally { await workspace.stop(); }
});

test('opaque media serves bounded Range and HEAD, rejects query paths and traversal', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'deadem-scrim-'));
    let workspace;
    try {
        const file = path.join(root, 'synthetic.wav');
        await writeFile(file, Buffer.alloc(10000, 1));
        const registry = new ScrimMediaRegistry([file]);
        const media = registry.register(file);
        workspace = await createReviewWorkspaceServer({ port: 0, scrimOnly: true, scrimData: { view: { tracks: [{ media }], vodSessions: [] }, registry } });
        const url = await workspace.start();
        const response = await fetch(url + media.url, { headers: { range: 'bytes=10-41' } });
        assert.equal(response.status, 206);
        assert.equal(response.headers.get('content-range'), 'bytes 10-41/10000');
        assert.equal((await response.arrayBuffer()).byteLength, 32);
        const head = await fetch(url + media.url, { method: 'HEAD' });
        assert.equal(head.headers.get('content-length'), '10000');
        assert.equal((await head.arrayBuffer()).byteLength, 0);
        const invalid = await fetch(url + media.url, { headers: { range: 'bytes=20000-' } });
        assert.equal(invalid.status, 416);
        assert.equal((await fetch(url + media.url + '?path=secret')).status, 400);
        assert.equal((await fetch(url + '/scrim/media/' + '0'.repeat(32))).status, 404);
        const rawStatus = requestPath => new Promise(resolve => {
            http.get({ host: '127.0.0.1', port: new URL(url).port, path: requestPath }, res => { res.resume(); resolve(res.statusCode); });
        });
        assert.equal(await rawStatus('/scrim/media/%2e%2e/private'), 400);
        assert.equal(await rawStatus('/replay_005/audio'), 400);
        assert.equal((await fetch(url + '/scrim')).status, 200);
        const code = await readFile(new URL('../tools/review-workspace/server.mjs', import.meta.url), 'utf8');
        assert.match(code, /createReadStream\(entry.absolutePath/u);
        assert.doesNotMatch(code, /readFile\(entry.absolutePath/u);
    } finally {
        await workspace?.stop();
        await rm(root, { recursive: true, force: true });
    }
});

test('real nine-track registry publishes opaque refs only and labels synthetic sync', () => {
    const data = loadLocalScrimData(DEFAULT_REPO_ROOT);
    assert.equal(data.view.tracks.length, 9);
    assert.ok(data.view.tracks.every(track => track.duration > 3000 && /^[0-9a-f]{32}$/u.test(track.media.mediaId)));
    assert.doesNotMatch(JSON.stringify(data.view), /[A-Z]:[\\/]|sourceSpeakerId|sourceAudioPath/u);
    const synthetic = data.view.vodSessions.filter(session => session.sourceVodRef === 'task209_synthetic_video');
    assert.equal(synthetic.length, 1);
    for (const session of synthetic) assert.equal(session.syncStatus, 'synthetic_only');
    for (const session of data.view.vodSessions.filter(session => session.reviewTargetId)) assert.equal(session.syncStatus, 'validated');
});
