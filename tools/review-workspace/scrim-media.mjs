import { randomBytes } from 'node:crypto';
import { existsSync, realpathSync, statSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { validateSession } from './scrim-model.mjs';

export function assertScrimMediaPath(value) {
    const text = String(value).replaceAll('\\', '/');
    if (/(?:replay|partida)[_-]?00[5-8](?:[/_.-]|$)|[.]dem(?:$|[/?#])/iu.test(text) || text.split('/').includes('..')) {
        throw new Error('protected_or_unsafe_scrim_media');
    }
    if (!['.wav', '.mp4', '.webm'].includes(path.extname(text).toLowerCase())) throw new Error('scrim_media_type_rejected');
    return path.resolve(value);
}

export class ScrimMediaRegistry {
    constructor(authorizedPaths) {
        this.authorized = new Set(authorizedPaths.map(assertScrimMediaPath));
        this.entries = new Map();
    }
    register(filePath) {
        const absolutePath = assertScrimMediaPath(filePath);
        if (!this.authorized.has(absolutePath)) throw new Error('scrim_media_not_authorized');
        if (!existsSync(absolutePath)) throw new Error('scrim_media_unavailable');
        if (path.resolve(realpathSync(absolutePath)) !== absolutePath) throw new Error('scrim_media_symlink_rejected');
        const info = statSync(absolutePath);
        if (!info.isFile()) throw new Error('scrim_media_not_file');
        const mediaId = randomBytes(16).toString('hex');
        const contentType = path.extname(absolutePath) === '.wav' ? 'audio/wav' : path.extname(absolutePath) === '.webm' ? 'video/webm' : 'video/mp4';
        this.entries.set(mediaId, { available: true, absolutePath, contentType, sizeBytes: info.size,
            transferMetrics: { requestCount: 0, rangeRequestCount: 0, bytesSent: 0, maxChunkBytes: 0 } });
        return { mediaId, url: `/scrim/media/${mediaId}` };
    }
    resolve(id) { return /^[0-9a-f]{32}$/u.test(id ?? '') ? this.entries.get(id) ?? null : null; }
}

export function loadLocalScrimData(repoRoot) {
    const recordingRoot = path.join(repoRoot, '.local/deadem/craig/recordings/craig_recording_task208_real_01');
    const metadataPath = path.join(recordingRoot, 'validation/recording-private-metadata.json');
    const sessionRoot = path.join(repoRoot, '.local/deadem/review-workspace/scrim');
    const fixturePath = path.join(sessionRoot, 'synthetic-clock.mp4');
    const authorizedPaths = Array.from({ length: 9 }, (_, i) => path.join(recordingRoot, `normalized/track_${String(i + 1).padStart(2, '0')}.wav`));
    const registry = new ScrimMediaRegistry([...authorizedPaths, fixturePath]);
    const view = { craigRecordingId: 'craig_recording_task208_real_01', tracks: [], vodSessions: [],
        readiness: 'READY_FOR_REAL_VOD_SYNC_CANARY', asrStatus: 'HUMAN_VALIDATION_REQUIRED',
        limitation: 'Nenhum VOD real foi autorizado e alinhado a esta gravação. Não há relação presumida de uma gravação para uma partida.' };
    if (!existsSync(metadataPath)) return { view, registry };
    const metadata = JSON.parse(readFileSync(metadataPath, 'utf8'));
    if (metadata.tracks.length !== 9) throw new Error('scrim_requires_nine_authorized_tracks');
    view.tracks = authorizedPaths.map((filePath, index) => {
        const track = metadata.tracks.find(row => row.trackOrdinal === index + 1);
        if (!track || !Number.isFinite(track.normalizedDurationSeconds)) throw new Error('invalid_scrim_track_metadata');
        return { trackRef: `track_${String(index + 1).padStart(2, '0')}`, displayName: track.sourceDisplayName ?? `Track ${index + 1}`,
            duration: track.normalizedDurationSeconds, media: registry.register(filePath) };
    });
    const sessionsPath = path.join(sessionRoot, 'sessions.json');
    if (existsSync(sessionsPath)) {
        const sessions = JSON.parse(readFileSync(sessionsPath, 'utf8'));
        if (sessions.craigRecordingId !== view.craigRecordingId) throw new Error('scrim_recording_mismatch');
        view.vodSessions = sessions.vodSessions.map(session => {
            // No generic browser/file import: this task authorizes only the explicit synthetic video.
            if (session.sourceVodRef !== 'task209_synthetic_video' || session.syncModel?.method !== 'synthetic_fixture') throw new Error('real_vod_not_authorized');
            validateSession(session);
            return { ...session, title: 'Canário sintético · sem VOD real', vodAudioDescription: 'Áudio original pode conter Discord misturado; neste fixture há somente tom sintético.', media: registry.register(fixturePath) };
        });
    }
    return { view, registry };
}
