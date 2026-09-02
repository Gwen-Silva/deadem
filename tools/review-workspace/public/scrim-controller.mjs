import { DEFAULT_SYNC_POLICY, ScrimMixer, validateSession, vodToCraig, craigToVod, craigRate, driftDecision, clamp } from '../scrim-model.mjs';

export class ScrimPlaybackController {
    constructor({ video, tracks, session, audioContext = null, gains = new Map(), policy = {}, onUpdate = () => {} }) {
        this.video = video;
        this.tracks = tracks;
        this.session = validateSession(session);
        this.policy = { ...DEFAULT_SYNC_POLICY, ...policy };
        this.audioContext = audioContext;
        this.gains = gains;
        this.onUpdate = onUpdate;
        this.mixer = new ScrimMixer(tracks.map(track => track.trackRef));
        this.intentPlaying = false;
        this.syncing = false;
        this.epoch = 0;
        this.commandedSeek = false;
        this.seekCommand = 0;
        this.destroyed = false;
        this.status = 'paused';
        this.error = null;
        this.isolatedRange = null;
        this.metrics = { startupLatencyMs: null, seekResyncLatencyMs: [], maxObservedDriftMs: 0,
            driftCorrectionCount: 0, hardSeekCorrectionCount: 0, readinessTrackCount: 0 };
        this.listeners = [];
        tracks.forEach(track => Object.assign(track, { currentDriftMs: 0, maxObservedDriftMs: 0, correctionCount: 0, hardSeekCorrectionCount: 0, syncState: 'waiting_metadata' }));
        this.listen(video, 'play', () => { if (!this.syncing) this.play().catch(error => this.fail(error)); });
        this.listen(video, 'pause', () => { if (!this.syncing && !this.commandedSeek) this.pause(); });
        this.listen(video, 'seeking', () => {
            if (this.commandedSeek) return;
            this.epoch += 1;
            this.syncing = true;
            this.pauseElements();
        });
        this.listen(video, 'seeked', () => {
            if (!this.commandedSeek) this.synchronize('seek').catch(error => this.fail(error));
        });
        this.listen(video, 'ratechange', () => this.applyRate());
        this.listen(video, 'ended', () => this.pause());
        this.listen(video, 'waiting', () => {
            if (this.intentPlaying && !this.syncing) this.synchronize('buffering').catch(error => this.fail(error));
        });
        for (const track of tracks) this.listen(track.element, 'waiting', () => {
            if (this.intentPlaying && !this.syncing && track.syncState !== 'outside_track') this.synchronize('buffering').catch(error => this.fail(error));
        });
        this.timer = setInterval(() => this.tick(), this.policy.monitorIntervalMs);
        this.applyMix();
    }
    listen(element, event, fn) { element.addEventListener(event, fn); this.listeners.push([element, event, fn]); }
    fail(error) { if (!this.destroyed) { this.pause(); this.error = error.message; this.status = 'error'; this.onUpdate(); } }
    pauseElements() { this.video.pause(); this.tracks.forEach(track => track.element.pause()); }
    pause() {
        this.intentPlaying = false;
        this.epoch += 1;
        this.syncing = false;
        this.pauseElements();
        this.status = 'paused';
        this.onUpdate();
    }
    async ready(element, epoch) {
        const started = performance.now();
        while (!this.destroyed && epoch === this.epoch) {
            if (element.error) throw new Error('media_decode_or_stream_error');
            if (element.readyState >= 2 && !element.seeking) return;
            if (performance.now() - started > this.policy.readinessTimeoutMs) throw new Error('media_readiness_timeout');
            await new Promise(resolve => setTimeout(resolve, 20));
        }
        throw new Error('transport_superseded');
    }
    active(track, time) { return time >= 0 && time < track.duration && time >= this.session.craigRange.start && time < this.session.craigRange.end; }
    async synchronize(reason) {
        const epoch = ++this.epoch;
        const started = performance.now();
        this.syncing = true;
        this.status = 'synchronizing';
        this.pauseElements();
        try {
            await this.ready(this.video, epoch);
            const time = vodToCraig(this.video.currentTime, this.session.syncModel);
            const active = this.tracks.filter(track => this.active(track, time));
            this.tracks.forEach(track => {
                track.syncState = this.active(track, time) ? 'synchronizing' : 'outside_track';
                if (this.active(track, time)) track.element.currentTime = time;
            });
            await Promise.all(active.map(track => this.ready(track.element, epoch)));
            if (epoch !== this.epoch) return;
            this.applyRate();
            this.metrics.readinessTrackCount = active.length;
            if (this.intentPlaying) {
                await this.audioContext?.resume();
                await Promise.all(active.map(track => track.element.play()));
                if (epoch !== this.epoch) { this.tracks.forEach(track => track.element.pause()); return; }
                await this.video.play();
            }
            if (epoch !== this.epoch) return;
            active.forEach(track => { track.syncState = 'synchronized'; });
            this.syncing = false;
            this.status = this.intentPlaying ? 'playing' : 'paused';
            const elapsed = performance.now() - started;
            if (reason === 'seek') this.metrics.seekResyncLatencyMs.push(elapsed);
            this.onUpdate();
        } catch (error) {
            if (epoch !== this.epoch || this.destroyed) return;
            this.syncing = false;
            this.fail(error);
            throw error;
        }
    }
    async play() {
        if (this.destroyed) return;
        const started = performance.now();
        const firstPlay = this.metrics.startupLatencyMs === null;
        this.intentPlaying = true;
        this.error = null;
        await this.audioContext?.resume();
        await this.synchronize('play');
        if (firstPlay && this.status === 'playing') this.metrics.startupLatencyMs = performance.now() - started;
    }
    async seek(time) {
        if (!Number.isFinite(time)) throw new Error('invalid_seek_time');
        const command = ++this.seekCommand;
        this.commandedSeek = true;
        this.syncing = true;
        this.epoch += 1;
        this.pauseElements();
        this.video.currentTime = clamp(time, this.session.vodRange.start, this.session.vodRange.end - 0.001);
        try { await this.synchronize('seek'); } finally { if (command === this.seekCommand) this.commandedSeek = false; }
    }
    setRate(rate) {
        if (!Number.isFinite(rate) || rate < 0.25 || rate > 2) throw new Error('invalid_playback_rate');
        this.video.playbackRate = rate;
        this.applyRate();
    }
    applyRate() { this.tracks.forEach(track => { track.element.playbackRate = craigRate(this.video.playbackRate, this.session.syncModel); }); }
    applyMix() {
        this.video.muted = this.mixer.vod.mute;
        this.video.volume = this.mixer.vod.volume;
        this.tracks.forEach(track => {
            const value = this.mixer.gain(track.trackRef);
            const node = this.gains.get(track.trackRef);
            if (node) node.gain.setTargetAtTime(value, this.audioContext.currentTime, 0.01);
            else track.element.volume = value;
        });
        this.onUpdate();
    }
    async isolate(trackRef, range) {
        if (!range || range.end <= range.start || range.start < this.session.craigRange.start || range.end > this.session.craigRange.end) throw new Error('invalid_isolated_range');
        this.mixer.isolate(trackRef);
        this.isolatedRange = range;
        this.applyMix();
        await this.seek(craigToVod(range.start, this.session.syncModel));
    }
    restoreContext() { this.mixer.restore(); this.isolatedRange = null; this.applyMix(); }
    tick() {
        if (this.destroyed || this.syncing || this.video.paused) return;
        if (this.video.currentTime >= this.session.vodRange.end) { this.pause(); return; }
        const desired = vodToCraig(this.video.currentTime, this.session.syncModel);
        if (this.isolatedRange && desired >= this.isolatedRange.end) this.restoreContext();
        const baseRate = craigRate(this.video.playbackRate, this.session.syncModel);
        let hardResync = false;
        for (const track of this.tracks) {
            if (!this.active(track, desired)) { track.element.pause(); track.syncState = 'outside_track'; continue; }
            const drift = (track.element.currentTime - desired) * 1000;
            track.currentDriftMs = drift;
            track.maxObservedDriftMs = Math.max(track.maxObservedDriftMs, Math.abs(drift));
            this.metrics.maxObservedDriftMs = Math.max(this.metrics.maxObservedDriftMs, Math.abs(drift));
            const decision = driftDecision(drift, baseRate, this.policy);
            if (decision.action === 'seek' || track.element.paused) {
                track.hardSeekCorrectionCount += 1;
                this.metrics.hardSeekCorrectionCount += 1;
                hardResync = true;
            }
            if (decision.action !== 'none') {
                track.correctionCount += 1;
                this.metrics.driftCorrectionCount += 1;
            }
            track.element.playbackRate = decision.rate;
            track.syncState = decision.action === 'none' ? 'synchronized' : 'correcting';
        }
        this.onUpdate();
        if (hardResync) this.synchronize('hard_drift').catch(error => this.fail(error));
    }
    destroy() {
        this.destroyed = true;
        this.pause();
        clearInterval(this.timer);
        this.listeners.forEach(([element, event, fn]) => element.removeEventListener(event, fn));
        this.tracks.forEach(track => { track.element.removeAttribute?.('src'); track.element.load?.(); });
    }
}
