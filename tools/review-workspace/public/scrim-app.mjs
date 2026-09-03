import { ScrimPlaybackController } from '/scrim-controller.mjs';
import { DEFAULT_SYNC_POLICY, vodToCraig } from '/scrim-model.mjs';
import { parseScrimNavigation, resolveScrimNavigation } from '/scrim-navigation.mjs';
import { parseFriendlyScrimNavigation, publicReplayUrl, resolveFriendlyReplayEntry } from '/scrim-presentation.mjs';
import { initProductShell } from '/shell.mjs';

initProductShell();

const byId = id => document.getElementById(id);
const video = byId('scrim-video');
const rows = new Map();
const PUBLIC_TARGETS = new Set(['review_match_003', 'review_match_004']);
let controller = null;
let workspace;
let publicSessions = [];
let presentation = null;
let selectedMarker = null;
let context;
let sources = [];
const formatTime = value => `${String(Math.floor(Math.max(0, value) / 60)).padStart(2, '0')}:${String(Math.floor(Math.max(0, value) % 60)).padStart(2, '0')}`;
const statusLabels = { paused: 'pausado', playing: 'reproduzindo', synchronizing: 'sincronizando', error: 'erro', synchronized: 'sincronizado', correcting: 'ajustando', outside_track: 'fora da faixa', waiting_metadata: 'aguardando' };

function matchIdForSession(session) { return session.reviewTargetId.slice(-3); }
function sessionForMatch(matchId) { return publicSessions.find(session => matchIdForSession(session) === matchId); }

function render() {
    if (!controller) return;
    byId('transport-state').textContent = statusLabels[controller.status] ?? controller.status;
    byId('play-pause').textContent = controller.intentPlaying ? 'Pausar' : 'Reproduzir';
    byId('master-time').textContent = `${formatTime(video.currentTime)} / ${formatTime(controller.session.vodRange.end)}`;
    if (document.activeElement !== byId('master-seek')) byId('master-seek').value = video.currentTime;
    byId('player-error').textContent = controller.error ?? '';
    byId('ready-count').textContent = `${controller.metrics.readinessTrackCount} / ${controller.tracks.length}`;
    byId('max-drift').textContent = `${controller.metrics.maxObservedDriftMs.toFixed(0)} ms`;
    byId('corrections').textContent = `${controller.metrics.driftCorrectionCount} / ${controller.metrics.hardSeekCorrectionCount}`;
    byId('context-mode').textContent = controller.mixer.mode === 'context' ? 'Contexto · mix completo' : 'Faixa isolada · retorno automático';
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
        row.drift.textContent = `${row.displayName}: ${statusLabels[track.syncState] ?? track.syncState} · ${track.currentDriftMs.toFixed(0)} ms · máx. ${track.maxObservedDriftMs.toFixed(0)} ms`;
    }
}

function run(action) { Promise.resolve().then(action).catch(error => { byId('player-error').textContent = error.message; }); }
function changeMix(action) { if (controller) { action(controller.mixer); controller.applyMix(); } }

function renderMarkers() {
    byId('timeline-markers').replaceChildren();
    if (!presentation) return;
    const { start, end } = presentation.session.vodRange;
    for (const marker of presentation.markers) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `moment-marker moment-marker--${marker.reviewState}`;
        button.style.left = `${((marker.vodAnchorSeconds - start) / (end - start)) * 100}%`;
        button.dataset.moment = String(marker.momentNumber);
        button.setAttribute('aria-label', `${marker.label}, ${formatTime(marker.vodAnchorSeconds)}, ${marker.reviewLabel}`);
        button.title = `${marker.label} · ${formatTime(marker.vodAnchorSeconds)} · ${marker.reviewLabel}`;
        button.addEventListener('click', () => run(() => selectMarker(marker, { seek: true, historyMode: 'push' })));
        byId('timeline-markers').append(button);
    }
}

function renderSelectedMarker() {
    byId('moment-card').hidden = !selectedMarker;
    byId('timeline-markers').querySelectorAll('.moment-marker').forEach(button => {
        const selected = Number(button.dataset.moment) === selectedMarker?.momentNumber;
        button.classList.toggle('is-selected', selected);
        button.setAttribute('aria-pressed', String(selected));
    });
    if (!selectedMarker) return;
    byId('current-moment-title').textContent = selectedMarker.label;
    byId('current-moment-time').textContent = `${formatTime(selectedMarker.vodAnchorSeconds)} · ${selectedMarker.reviewLabel}`;
    byId('current-moment-state').textContent = selectedMarker.reviewLabel;
    byId('current-moment-state').dataset.state = selectedMarker.reviewState;
    byId('open-review-moment').href = selectedMarker.reviewUrl;
    const index = presentation.markers.indexOf(selectedMarker);
    byId('previous-moment').disabled = index <= 0;
    byId('next-moment').disabled = index < 0 || index >= presentation.markers.length - 1;
}

async function selectMarker(marker, { seek = false, historyMode = 'none', applyPreRoll = false } = {}) {
    selectedMarker = marker;
    renderSelectedMarker();
    if (historyMode !== 'none') {
        history[historyMode === 'replace' ? 'replaceState' : 'pushState']({ matchId: presentation.match.id, momentNumber: marker.momentNumber }, '', marker.replayUrl);
    }
    if (seek) {
        const target = applyPreRoll
            ? Math.max(presentation.session.vodRange.start, marker.vodAnchorSeconds - marker.preRollSeconds)
            : marker.vodAnchorSeconds;
        await controller.seek(target);
    }
}

async function loadPresentation(matchId) {
    const response = await fetch(`/api/scrim/presentation/${matchId}`);
    if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? 'replay_presentation_unavailable');
    }
    presentation = await response.json();
    if (presentation.markerCount !== presentation.expectedMarkerCount) throw new Error('replay_moment_coverage_incomplete');
    window.scrimPresentation = presentation;
    byId('match-title').textContent = presentation.match.displayName;
    byId('overview-link').textContent = presentation.match.displayName;
    byId('overview-link').href = presentation.match.overviewUrl;
    byId('return-review').href = presentation.match.reviewUrl;
    byId('sync-label').textContent = presentation.session.syncLabel;
    byId('session-select').value = matchId;
    renderMarkers();
}

async function loadSession(session) {
    window.scrimSessionReady = false;
    for (const id of ['play-pause', 'master-seek', 'back-10', 'forward-10', 'playback-rate']) byId(id).disabled = true;
    controller?.destroy();
    controller = null;
    sources.forEach(source => source.disconnect());
    sources = [];
    rows.clear();
    byId('track-mixer').replaceChildren();
    byId('track-technical').replaceChildren();
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
        const root = document.createElement('article');
        root.className = 'track-row';
        root.dataset.trackRef = track.trackRef;
        root.innerHTML = '<div class="track-title"><strong></strong><span class="track-state">No mix</span></div><div class="track-controls"><label class="toggle"><input class="track-mute" type="checkbox">Silenciar</label><label class="toggle"><input class="track-solo" type="checkbox">Destacar</label><input class="track-volume" type="range" min="0" max="1" step="0.01" value="1"></div><button class="isolate-button">Isolar voz por 5s</button>';
        root.querySelector('strong').textContent = track.displayName;
        const technical = document.createElement('p');
        technical.className = 'track-technical-row';
        technical.dataset.trackRef = track.trackRef;
        technical.textContent = `${track.displayName}: aguardando metadata`;
        byId('track-technical').append(technical);
        const row = { root, displayName: track.displayName, mute: root.querySelector('.track-mute'), solo: root.querySelector('.track-solo'), volume: root.querySelector('.track-volume'), drift: technical };
        row.volume.setAttribute('aria-label', `Volume de ${track.displayName}`);
        row.mute.setAttribute('aria-label', `Silenciar ${track.displayName}`);
        row.solo.setAttribute('aria-label', `Destacar ${track.displayName}`);
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
    window.scrimPlayer = controller;
    byId('track-count').textContent = String(tracks.length);
    byId('session-title').textContent = `Partida completa · ${presentation?.match.displayName ?? matchIdForSession(session)}`;
    byId('vod-audio-description').textContent = 'Pode incluir jogo e comunicação já misturados. Mantenha silenciado ao usar as vozes separadas.';
    byId('mapping-detail').textContent = `VOD = ${session.syncModel.slope.toFixed(9)} × Craig + ${session.syncModel.interceptSeconds.toFixed(6)}s · método ${session.syncModel.method} · erro operacional estimado ${session.syncEstimatedErrorSeconds.toFixed(3)}s. O drift do player é medido separadamente.`;
    byId('limitation').textContent = workspace.limitation;
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

async function openFriendlyNavigation(navigation, { historyMode = 'none' } = {}) {
    const session = sessionForMatch(navigation.matchId);
    if (!session) throw new Error('public_replay_session_unavailable');
    await loadPresentation(navigation.matchId);
    if (controller?.session.vodSessionId !== session.vodSessionId) await loadSession(session);
    const entry = resolveFriendlyReplayEntry(navigation, presentation);
    if (entry.marker) await selectMarker(entry.marker, { seek: false });
    else { selectedMarker = null; renderSelectedMarker(); }
    await controller.seek(entry.seekVodSeconds);
    if (historyMode !== 'none') history[historyMode === 'replace' ? 'replaceState' : 'pushState']({}, '', publicReplayUrl(navigation.matchId, navigation.momentNumber));
    window.scrimNavigationReady = {
        reviewTargetId: session.reviewTargetId,
        matchId: navigation.matchId,
        momentNumber: navigation.momentNumber,
        seekVodSeconds: entry.seekVodSeconds,
        entryUsesPreRoll: entry.entryUsesPreRoll
    };
}

window.openScrimPlayer = async ({ reviewTargetId, vodTimeSeconds, preRollSeconds = DEFAULT_SYNC_POLICY.defaultPreRollSeconds }) => {
    const { session, seekVodSeconds } = resolveScrimNavigation({ reviewTargetId, vodTimeSeconds, preRollSeconds }, publicSessions);
    await loadPresentation(matchIdForSession(session));
    if (controller?.session.vodSessionId !== session.vodSessionId) await loadSession(session);
    const marker = presentation.markers.find(item => Math.abs(item.vodAnchorSeconds - vodTimeSeconds) < 0.001);
    if (marker) await selectMarker(marker, { seek: false });
    await controller.seek(seekVodSeconds);
    window.scrimNavigationReady = { reviewTargetId, vodTimeSeconds, preRollSeconds, seekVodSeconds, legacyTechnicalUrl: true };
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
byId('previous-moment').onclick = () => run(() => selectMarker(presentation.markers[presentation.markers.indexOf(selectedMarker) - 1], { seek: true, historyMode: 'push' }));
byId('next-moment').onclick = () => run(() => selectMarker(presentation.markers[presentation.markers.indexOf(selectedMarker) + 1], { seek: true, historyMode: 'push' }));
byId('session-select').onchange = () => run(() => openFriendlyNavigation({ kind: 'friendly', matchId: byId('session-select').value, momentNumber: null }, { historyMode: 'push' }));
video.addEventListener('timeupdate', render);
window.addEventListener('popstate', () => run(async () => {
    const friendly = parseFriendlyScrimNavigation(location.search);
    if (friendly) await openFriendlyNavigation(friendly);
}));
window.addEventListener('pagehide', () => { controller?.destroy(); context?.close(); });

run(async () => {
    const response = await fetch('/api/scrim');
    if (!response.ok) throw new Error('scrim_workspace_unavailable');
    workspace = await response.json();
    publicSessions = workspace.vodSessions.filter(session => PUBLIC_TARGETS.has(session.reviewTargetId) && session.syncStatus === 'validated');
    if (publicSessions.length !== 2) throw new Error('public_real_replay_sessions_unavailable');
    for (const session of publicSessions) {
        const matchId = matchIdForSession(session);
        const option = document.createElement('option');
        option.value = matchId;
        option.textContent = `Scrim ${matchId.slice(-2)}`;
        byId('session-select').append(option);
    }
    const friendly = parseFriendlyScrimNavigation(location.search);
    if (friendly) await openFriendlyNavigation(friendly);
    else {
        const technical = parseScrimNavigation(location.search);
        if (technical) await window.openScrimPlayer(technical);
        else await openFriendlyNavigation({ kind: 'friendly', matchId: '003', momentNumber: null }, { historyMode: 'replace' });
    }
});
