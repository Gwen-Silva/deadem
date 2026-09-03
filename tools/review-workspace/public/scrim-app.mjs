import { ScrimPlaybackController } from '/scrim-controller.mjs';
import { DEFAULT_SYNC_POLICY, vodToCraig, clamp } from '/scrim-model.mjs';

const byId = id => document.getElementById(id);
const video = byId('scrim-video');
const rows = new Map();
let controller = null;
let workspace;
let context;
let sources = [];
const formatTime = value => `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(Math.floor(value % 60)).padStart(2, '0')}`;
const statusLabels = { paused: 'pausado', playing: 'reproduzindo', synchronizing: 'sincronizando', error: 'erro', synchronized: 'em sync', correcting: 'corrigindo', outside_track: 'fora da track', waiting_metadata: 'aguardando' };

function render() {
    if (!controller) return;
    byId('transport-state').textContent = statusLabels[controller.status];
    byId('play-pause').textContent = controller.intentPlaying ? 'Pausar' : 'Reproduzir';
    byId('master-time').textContent = `${formatTime(video.currentTime)} / ${formatTime(controller.session.vodRange.end)}`;
    if (document.activeElement !== byId('master-seek')) byId('master-seek').value = video.currentTime;
    byId('player-error').textContent = controller.error ?? '';
    byId('ready-count').textContent = `${controller.metrics.readinessTrackCount} / ${controller.tracks.length}`;
    byId('max-drift').textContent = `${controller.metrics.maxObservedDriftMs.toFixed(0)} ms`;
    byId('corrections').textContent = `${controller.metrics.driftCorrectionCount} / ${controller.metrics.hardSeekCorrectionCount}`;
    byId('context-mode').textContent = controller.mixer.mode === 'context' ? 'Contexto · mix completo' : 'Call isolada · solo temporário';
    byId('restore-context').disabled = controller.mixer.mode === 'context';
    byId('vod-mute').checked = controller.mixer.vod.mute;
    byId('vod-volume').value = controller.mixer.vod.volume;
    for (const track of controller.tracks) {
        const row = rows.get(track.trackRef);
        const mix = controller.mixer.tracks.find(item => item.trackRef === track.trackRef);
        row.root.dataset.solo = mix.solo;
        row.root.dataset.mute = mix.mute;
        row.mute.checked = mix.mute;
        row.solo.checked = mix.solo;
        row.volume.value = mix.volume;
        row.drift.textContent = `${statusLabels[track.syncState] ?? track.syncState} · ${track.currentDriftMs.toFixed(0)} ms · máx ${track.maxObservedDriftMs.toFixed(0)} ms`;
    }
}

function run(action) { Promise.resolve().then(action).catch(error => { byId('player-error').textContent = error.message; }); }
function changeMix(action) { if (controller) { action(controller.mixer); controller.applyMix(); } }

async function loadSession(session) {
    window.scrimSessionReady = false;
    for (const id of ['play-pause', 'master-seek', 'back-10', 'forward-10', 'playback-rate']) byId(id).disabled = true;
    controller?.destroy();
    controller = null;
    sources.forEach(source => source.disconnect());
    sources = [];
    rows.clear();
    byId('track-mixer').replaceChildren();
    if (context) await context.close();
    context = new AudioContext();
    video.src = session.media.url;
    video.playbackRate = 1;
    byId('playback-rate').value = '1';
    video.load();
    const gains = new Map();
    const tracks = workspace.tracks.map(track => {
        const audio = new Audio();
        audio.preload = 'metadata';
        audio.src = track.media.url;
        const source = context.createMediaElementSource(audio);
        const gain = context.createGain();
        source.connect(gain).connect(context.destination);
        sources.push(source);
        gains.set(track.trackRef, gain);
        const root = document.createElement('div');
        root.className = 'track-row';
        root.dataset.trackRef = track.trackRef;
        root.innerHTML = '<div class="track-title"><strong></strong><span class="track-ref"></span></div><div class="track-controls"><label class="toggle"><input class="track-mute" type="checkbox">Mute</label><label class="toggle"><input class="track-solo" type="checkbox">Solo</label><input class="track-volume" type="range" min="0" max="1" step="0.01" value="1"></div><output class="track-drift"></output><button class="isolate-button">Isolar 5s neste ponto</button>';
        // Real metadata is text content, never HTML.
        root.querySelector('strong').textContent = track.displayName;
        root.querySelector('.track-ref').textContent = track.trackRef;
        const row = { root, mute: root.querySelector('.track-mute'), solo: root.querySelector('.track-solo'), volume: root.querySelector('.track-volume'), drift: root.querySelector('.track-drift') };
        row.volume.setAttribute('aria-label', `Volume ${track.trackRef}`);
        row.mute.setAttribute('aria-label', `Mute ${track.trackRef}`);
        row.solo.setAttribute('aria-label', `Solo ${track.trackRef}`);
        for (const field of ['mute', 'solo', 'volume']) row[field].addEventListener('input', () => changeMix(mixer => mixer.set(track.trackRef, field, field === 'volume' ? Number(row[field].value) : row[field].checked)));
        root.querySelector('button').addEventListener('click', () => run(() => {
            const start = Math.max(session.craigRange.start, vodToCraig(video.currentTime, session.syncModel));
            return controller.isolate(track.trackRef, { start, end: Math.min(start + 5, session.craigRange.end) });
        }));
        rows.set(track.trackRef, row);
        byId('track-mixer').append(root);
        return { ...track, element: audio };
    });
    controller = new ScrimPlaybackController({ video, tracks, session, audioContext: context, gains, onUpdate: render });
    // Explicit local API for future candidate windows; unknown targets are never guessed.
    window.scrimPlayer = controller;
    byId('track-count').textContent = tracks.length;
    byId('session-title').textContent = session.title ?? session.vodSessionId;
    byId('sync-label').textContent = session.syncStatus === 'synthetic_only' ? 'CANÁRIO SINTÉTICO · não é mapping real' : session.precisionStatus === 'usable_with_limited_sync_precision' ? 'Sync real · precisão limitada para revisão humana' : 'Sync real medido · validação técnica';
    byId('vod-audio-description').textContent = session.vodAudioDescription;
    byId('mapping-detail').textContent = `VOD = ${session.syncModel.slope.toFixed(9)} × Craig + ${session.syncModel.interceptSeconds.toFixed(6)}s · ${session.syncModel.method} · erro estimado ${session.syncEstimatedErrorSeconds.toFixed(3)}s ${session.syncStatus === 'synthetic_only' ? '(fixture, não medição real)' : '(mapping medido; não é drift do transporte)'}.`;
    byId('master-seek').min = session.vodRange.start;
    byId('master-seek').max = session.vodRange.end;
    if (video.readyState < 1) await new Promise((resolve, reject) => {
        video.addEventListener('loadedmetadata', resolve, { once: true });
        video.addEventListener('error', () => reject(new Error('vod_metadata_unavailable')), { once: true });
    });
    await controller.seek(session.vodRange.start);
    window.scrimSessionReady = true;
    for (const id of ['play-pause', 'master-seek', 'back-10', 'forward-10', 'playback-rate']) byId(id).disabled = false;
    render();
}

window.openScrimPlayer = async ({ reviewTargetId, vodTimeSeconds, preRollSeconds = DEFAULT_SYNC_POLICY.defaultPreRollSeconds }) => {
    const session = workspace.vodSessions.find(item => item.reviewTargetId && item.reviewTargetId === reviewTargetId);
    if (!session) throw new Error('review_target_has_no_authorized_craig_vod_session');
    if (!Number.isFinite(vodTimeSeconds) || !Number.isFinite(preRollSeconds) || preRollSeconds < 0) throw new Error('invalid_candidate_window_request');
    if (controller?.session.vodSessionId !== session.vodSessionId) await loadSession(session);
    byId('session-select').value = session.vodSessionId;
    await controller.seek(clamp(vodTimeSeconds - preRollSeconds, session.vodRange.start, session.vodRange.end));
};

byId('play-pause').onclick = () => run(() => controller.intentPlaying ? controller.pause() : controller.play());
byId('master-seek').onchange = () => run(() => controller.seek(Number(byId('master-seek').value)));
byId('back-10').onclick = () => run(() => controller.seek(video.currentTime - 10));
byId('forward-10').onclick = () => run(() => controller.seek(video.currentTime + 10));
byId('playback-rate').onchange = () => run(() => controller.setRate(Number(byId('playback-rate').value)));
byId('mute-all').onclick = () => changeMix(mixer => mixer.muteAll(true));
byId('unmute-all').onclick = () => changeMix(mixer => mixer.muteAll(false));
byId('clear-solo').onclick = () => changeMix(mixer => mixer.clearSolo());
byId('reset-mix').onclick = () => { if (controller) { controller.isolatedRange = null; changeMix(mixer => mixer.reset()); } };
byId('restore-context').onclick = () => controller?.restoreContext();
byId('vod-mute').onchange = () => changeMix(mixer => { mixer.vod.mute = byId('vod-mute').checked; });
byId('vod-volume').oninput = () => changeMix(mixer => { mixer.vod.volume = Number(byId('vod-volume').value); });
byId('session-select').onchange = () => run(() => loadSession(workspace.vodSessions.find(session => session.vodSessionId === byId('session-select').value)));
video.addEventListener('timeupdate', render);
window.addEventListener('pagehide', () => { controller?.destroy(); context?.close(); });

run(async () => {
    const response = await fetch('/api/scrim');
    if (!response.ok) throw new Error('scrim_workspace_unavailable');
    workspace = await response.json();
    byId('limitation').textContent = workspace.limitation;
    for (const session of workspace.vodSessions) {
        const option = document.createElement('option');
        option.value = session.vodSessionId;
        option.textContent = session.title ?? session.vodSessionId;
        byId('session-select').append(option);
    }
    if (workspace.vodSessions.length) await loadSession(workspace.vodSessions[0]);
    else byId('sync-label').textContent = 'READY_FOR_REAL_VOD_SYNC_CANARY · nenhuma mídia VOD registrada';
});
