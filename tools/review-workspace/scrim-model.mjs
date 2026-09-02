// Operational playback policy, not a claim about alignment accuracy or gameplay.
export const DEFAULT_SYNC_POLICY = Object.freeze({
    monitorIntervalMs: 100, smallDriftMs: 80, hardDriftMs: 300,
    maxRateAdjustment: 0.04, rateCorrectionGain: 0.25, readinessTimeoutMs: 8000,
    defaultPreRollSeconds: 10
});

export function validateSyncModel(model) {
    if (!model || !Number.isFinite(model.slope) || model.slope <= 0 || !Number.isFinite(model.interceptSeconds)) {
        throw new Error('invalid_sync_model');
    }
    if (!['manual_anchors', 'audio_cross_correlation', 'hybrid_fit', 'synthetic_fixture'].includes(model.method)) {
        throw new Error('invalid_sync_method');
    }
    if (model.validationStatus !== (model.method === 'synthetic_fixture' ? 'synthetic_validated' : 'validated')) {
        throw new Error('sync_model_not_validated');
    }
    return model;
}

export const vodToCraig = (time, model) => (time - model.interceptSeconds) / model.slope;
export const craigToVod = (time, model) => model.slope * time + model.interceptSeconds;
export const craigRate = (rate, model) => rate / model.slope;
export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function validateSession(session) {
    validateSyncModel(session.syncModel);
    for (const range of [session.craigRange, session.vodRange]) {
        if (!range || !Number.isFinite(range.start) || !Number.isFinite(range.end) || range.start < 0 || range.end <= range.start) {
            throw new Error('invalid_session_range');
        }
    }
    if (!Number.isFinite(session.syncEstimatedErrorSeconds) || session.syncEstimatedErrorSeconds < 0) throw new Error('invalid_sync_error');
    for (const key of ['start', 'end']) {
        if (Math.abs(craigToVod(session.craigRange[key], session.syncModel) - session.vodRange[key]) > session.syncEstimatedErrorSeconds + 0.01) {
            throw new Error('session_range_mapping_mismatch');
        }
    }
    if (session.syncStatus !== (session.syncModel.method === 'synthetic_fixture' ? 'synthetic_only' : 'validated')) {
        throw new Error('session_sync_status_mismatch');
    }
    return session;
}

export function driftDecision(driftMs, baseRate, policy = DEFAULT_SYNC_POLICY) {
    if (Math.abs(driftMs) >= policy.hardDriftMs) return { action: 'seek', rate: baseRate };
    if (Math.abs(driftMs) <= policy.smallDriftMs) return { action: 'none', rate: baseRate };
    const adjustment = clamp(-driftMs / 1000 * policy.rateCorrectionGain, -policy.maxRateAdjustment, policy.maxRateAdjustment);
    return { action: 'rate', rate: baseRate * (1 + adjustment) };
}

export class ScrimMixer {
    constructor(trackRefs) {
        if (new Set(trackRefs).size !== trackRefs.length) throw new Error('duplicate_track_ref');
        this.tracks = trackRefs.map(trackRef => ({ trackRef, mute: false, solo: false, volume: 1 }));
        this.vod = { mute: true, volume: 1 };
        this.mode = 'context';
        this.snapshot = null;
    }
    set(trackRef, field, value) {
        const row = this.tracks.find(track => track.trackRef === trackRef);
        if (!row || !['mute', 'solo', 'volume'].includes(field)) throw new Error('invalid_mixer_control');
        if (field === 'volume' && !Number.isFinite(value)) throw new Error('invalid_volume');
        row[field] = field === 'volume' ? clamp(value, 0, 1) : Boolean(value);
    }
    gain(trackRef) {
        const row = this.tracks.find(track => track.trackRef === trackRef);
        if (!row) throw new Error('unknown_track');
        return row.mute || (this.tracks.some(track => track.solo) && !row.solo) ? 0 : row.volume;
    }
    muteAll(value) { this.tracks.forEach(track => { track.mute = value; }); }
    clearSolo() { this.tracks.forEach(track => { track.solo = false; }); }
    reset() {
        this.tracks.forEach(track => Object.assign(track, { mute: false, solo: false, volume: 1 }));
        this.vod = { mute: true, volume: 1 };
        this.snapshot = null;
        this.mode = 'context';
    }
    isolate(trackRef) {
        if (!this.tracks.some(track => track.trackRef === trackRef)) throw new Error('unknown_track');
        if (!this.snapshot) this.snapshot = structuredClone({ tracks: this.tracks, vod: this.vod });
        this.tracks.forEach(track => { track.solo = track.trackRef === trackRef; });
        this.set(trackRef, 'mute', false);
        this.vod.mute = true;
        this.mode = 'isolated_call';
    }
    restore() {
        if (this.snapshot) { this.tracks = this.snapshot.tracks; this.vod = this.snapshot.vod; }
        this.snapshot = null;
        this.mode = 'context';
    }
}
