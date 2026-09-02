import assert from 'node:assert/strict';
import test from 'node:test';
import { ScrimMixer, validateSyncModel, validateSession, vodToCraig, craigToVod, craigRate, driftDecision, DEFAULT_SYNC_POLICY } from '../tools/review-workspace/scrim-model.mjs';
import { ScrimPlaybackController } from '../tools/review-workspace/public/scrim-controller.mjs';

const model = { slope: 1.002, interceptSeconds: 2, method: 'synthetic_fixture', validationStatus: 'synthetic_validated' };
const session = { syncModel: model, craigRange: { start: 0, end: 190 }, vodRange: { start: 2, end: 192.38 }, syncStatus: 'synthetic_only', syncEstimatedErrorSeconds: 0 };
const refs = Array.from({ length: 9 }, (_, i) => `track_${String(i + 1).padStart(2, '0')}`);
class FakeMedia extends EventTarget {
    currentTime = 2;
    playbackRate = 1;
    readyState = 4;
    seeking = false;
    paused = true;
    error = null;
    volume = 1;
    muted = false;
    pause() { this.paused = true; }
    async play() { this.paused = false; }
}
function setup(policy = {}) {
    const video = new FakeMedia();
    const tracks = refs.map(trackRef => ({ trackRef, duration: 200, element: new FakeMedia() }));
    return new ScrimPlaybackController({ video, tracks, session, policy });
}

test('forward/inverse mapping and rate preserve slope not equal to one', () => {
    assert.equal(validateSyncModel(model), model);
    assert.ok(Math.abs(vodToCraig(craigToVod(150, model), model) - 150) < 1e-9);
    assert.equal(craigRate(1.5, model), 1.5 / 1.002);
    assert.equal(validateSession(session), session);
    assert.throws(() => validateSyncModel({ ...model, slope: 0 }), /invalid_sync_model/u);
    assert.throws(() => validateSyncModel({ ...model, method: 'manual_anchors' }), /not_validated/u);
    assert.throws(() => validateSession({ ...session, vodRange: { start: 0, end: 100 } }), /mapping_mismatch/u);
});

test('mute, solo, multi-solo and mute precedence are explicit', () => {
    const mixer = new ScrimMixer(refs);
    assert.equal(mixer.gain(refs[0]), 1);
    mixer.set(refs[0], 'solo', true);
    assert.equal(mixer.gain(refs[1]), 0);
    mixer.set(refs[1], 'solo', true);
    assert.equal(mixer.gain(refs[1]), 1);
    mixer.set(refs[0], 'mute', true);
    assert.equal(mixer.gain(refs[0]), 0);
    mixer.set(refs[1], 'volume', 0.3);
    assert.equal(mixer.gain(refs[1]), 0.3);
    mixer.muteAll(true);
    assert.ok(refs.every(ref => mixer.gain(ref) === 0));
    mixer.muteAll(false);
    mixer.clearSolo();
    assert.equal(mixer.gain(refs[2]), 1);
    mixer.reset();
    assert.ok(refs.every(ref => mixer.gain(ref) === 1));
    assert.deepEqual(mixer.vod, { mute: true, volume: 1 });
});

test('isolated mode restores exact prior track and VOD mix including multi-solo', () => {
    const mixer = new ScrimMixer(refs);
    mixer.set(refs[1], 'solo', true);
    mixer.set(refs[2], 'solo', true);
    mixer.set(refs[0], 'mute', true);
    mixer.vod = { mute: false, volume: 0.2 };
    const original = structuredClone({ tracks: mixer.tracks, vod: mixer.vod });
    mixer.isolate(refs[0]);
    mixer.isolate(refs[4]);
    assert.equal(mixer.gain(refs[4]), 1);
    assert.equal(mixer.gain(refs[1]), 0);
    assert.equal(mixer.vod.mute, true);
    mixer.restore();
    assert.deepEqual({ tracks: mixer.tracks, vod: mixer.vod }, original);
});

test('drift correction is bounded, signed and configurable', () => {
    assert.equal(driftDecision(20, 1).action, 'none');
    assert.ok(driftDecision(150, 1).rate < 1);
    assert.ok(driftDecision(-150, 1).rate > 1);
    assert.equal(driftDecision(600, 1).action, 'seek');
    assert.equal(driftDecision(600, 1, { ...DEFAULT_SYNC_POLICY, hardDriftMs: 1000 }).rate, 0.96);
});

test('nine-track play, seek, pause and rates propagate from video master', async () => {
    const player = setup();
    try {
        await player.play();
        assert.equal(player.metrics.readinessTrackCount, 9);
        assert.equal(player.video.paused, false);
        assert.ok(player.tracks.every(track => !track.element.paused));
        await player.seek(102.2);
        assert.ok(player.tracks.every(track => Math.abs(track.element.currentTime - 100) < 1e-9));
        for (const rate of [0.5, 1, 1.5]) {
            player.setRate(rate);
            assert.ok(player.tracks.every(track => track.element.playbackRate === rate / model.slope));
        }
        player.pause();
        assert.ok(player.video.paused && player.tracks.every(track => track.element.paused));
        await player.seek(32.06);
        assert.ok(player.video.paused && player.tracks.every(track => track.element.paused));
    } finally { player.destroy(); }
});

test('moderate drift corrects rate and hard drift triggers coordinated resync', async () => {
    const player = setup();
    try {
        await player.play();
        player.tracks[0].element.currentTime = 0.15;
        player.tick();
        assert.ok(player.tracks[0].element.playbackRate < 1 / model.slope);
        player.tracks[1].element.currentTime = 1;
        player.tick();
        await new Promise(resolve => setTimeout(resolve, 10));
        assert.equal(player.tracks[1].element.currentTime, 0);
        assert.ok(player.metrics.hardSeekCorrectionCount > 0);
        assert.ok(player.metrics.maxObservedDriftMs >= 1000);
        assert.ok(!player.syncing);
    } finally { player.destroy(); }
});

test('readiness barrier fails closed and does not leave tracks independently playing', async () => {
    const player = setup({ readinessTimeoutMs: 25 });
    try {
        player.tracks[8].element.readyState = 0;
        await assert.rejects(() => player.play(), /readiness_timeout/u);
        assert.ok(player.video.paused && player.tracks.every(track => track.element.paused));
        assert.equal(player.status, 'error');
    } finally { player.destroy(); }
});

test('native video play/pause/seek/rate/ended events drive slave tracks', async () => {
    const player = setup();
    try {
        player.video.paused = false;
        player.video.dispatchEvent(new Event('play'));
        await new Promise(resolve => setTimeout(resolve, 5));
        player.video.currentTime = 52.1;
        player.video.dispatchEvent(new Event('seeking'));
        assert.ok(player.tracks.every(track => track.element.paused));
        player.video.dispatchEvent(new Event('seeked'));
        await new Promise(resolve => setTimeout(resolve, 5));
        assert.ok(player.tracks.every(track => Math.abs(track.element.currentTime - 50) < 1e-9));
        player.video.playbackRate = 1.5;
        player.video.dispatchEvent(new Event('ratechange'));
        assert.ok(player.tracks.every(track => track.element.playbackRate === 1.5 / model.slope));
        player.video.dispatchEvent(new Event('ended'));
        assert.ok(player.tracks.every(track => track.element.paused));
    } finally { player.destroy(); }
});
