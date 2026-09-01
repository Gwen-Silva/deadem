const elements = Object.fromEntries([
  'target', 'order', 'filter', 'search', 'queue', 'candidate-heading', 'visual-gap', 'frames', 'storyboards',
  'audio-gap', 'audio-player', 'calls', 'provenance', 'review-state', 'review-record', 'segments', 'status',
  'previous', 'next', 'save', 'export', 'add-segment'
].map(id => [id, document.getElementById(id)]));

const app = { targets: [], queue: [], selected: null, state: null, stopAudioAt: null };

async function api(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { 'content-type': 'application/json', ...(options.headers ?? {}) } });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error ?? `HTTP ${response.status}`);
  return value;
}

function setStatus(message, error = false) {
  elements.status.textContent = message;
  elements.status.style.color = error ? '#f85149' : '#3fb950';
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function candidateState(candidateId = app.selected?.candidateWindowId) {
  if (!app.state.candidates[candidateId]) {
    app.state.candidates[candidateId] = {
      reviewRecord: structuredClone(app.selected.initialReviewRecord),
      transcriptCorrections: {},
      reviewSegments: []
    };
  }
  return app.state.candidates[candidateId];
}

async function loadTargets() {
  const result = await api('/api/targets');
  app.targets = result.targets;
  elements.target.innerHTML = result.targets.map(target => `<option value="${target.reviewTargetId}">${target.reviewTargetId} (${target.candidateCount})</option>`).join('');
  await loadTarget();
}

async function loadTarget() {
  const targetId = elements.target.value;
  app.state = await api(`/api/review-state/${targetId}`);
  await loadQueue();
}

async function loadQueue(preferredId = null) {
  const query = new URLSearchParams({ reviewTargetId: elements.target.value, order: elements.order.value });
  if (elements.filter.value) query.set('status', elements.filter.value);
  if (elements.search.value) query.set('q', elements.search.value);
  app.queue = (await api(`/api/candidates?${query}`)).candidates;
  elements.queue.innerHTML = '';
  for (const candidate of app.queue) {
    const button = document.createElement('button');
    button.className = 'candidate-button';
    button.dataset.id = candidate.candidateWindowId;
    button.innerHTML = `<strong>${candidate.candidateWindowId}</strong><span class="candidate-meta">${candidate.priority.tier} · ${candidate.reviewState} · ${candidate.callSegmentCount} calls</span>`;
    button.addEventListener('click', () => selectCandidate(candidate.candidateWindowId));
    elements.queue.append(button);
  }
  const candidateId = preferredId && app.queue.some(item => item.candidateWindowId === preferredId) ? preferredId : app.queue[0]?.candidateWindowId;
  if (candidateId) await selectCandidate(candidateId);
}

function mediaFigure(item, label) {
  if (item.status !== 'available') return `<figure><figcaption>${label}: unavailable</figcaption></figure>`;
  return `<figure><img src="${escapeHtml(item.url)}" alt="${escapeHtml(label)}" loading="lazy"><figcaption>${escapeHtml(label)}</figcaption></figure>`;
}

async function selectCandidate(candidateId) {
  app.selected = await api(`/api/candidates/${candidateId}`);
  document.querySelectorAll('.candidate-button').forEach(button => button.classList.toggle('active', button.dataset.id === candidateId));
  const candidate = app.selected;
  elements['candidate-heading'].innerHTML = `<h2>${candidate.candidateWindowId}</h2><p><strong>${candidate.priority.tier}</strong> · review scheduling heuristic · sync ±${candidate.syncEstimatedErrorSeconds}s</p>`;
  elements['visual-gap'].textContent = candidate.videoEvidence.status === 'available' ? '' : `Visual evidence: ${candidate.videoEvidence.status}`;
  elements.frames.innerHTML = candidate.videoEvidence.frames.map(frame => mediaFigure(frame, `${frame.role}: ${frame.frameId}`)).join('');
  elements.storyboards.innerHTML = candidate.videoEvidence.storyboards.map(board => mediaFigure(board, board.storyboardId)).join('');
  elements['audio-gap'].textContent = candidate.audioCallEvidence.status === 'available' ? '' : `Audio evidence: ${candidate.audioCallEvidence.status}`;
  renderCalls();
  renderProvenance();
  renderReview();
}

function renderCalls() {
  const state = candidateState();
  elements.calls.innerHTML = '';
  for (const call of app.selected.audioCallEvidence.calls) {
    const correction = state.transcriptCorrections[call.callSegmentId] ?? { humanTranscript: null, classification: 'not_validated' };
    const card = document.createElement('article');
    card.className = 'call-card';
    card.innerHTML = `<header><strong>${call.callSegmentId}</strong><button ${call.playback ? '' : 'disabled'}>Play</button></header>
      <p class="candidate-meta">VOD ${call.vodStartSeconds}–${call.vodEndSeconds}s · replay approx ${call.replayApproxStartSeconds}–${call.replayApproxEndSeconds}s · sync ±${call.syncEstimatedErrorSeconds}s</p>
      <p class="asr">${escapeHtml(call.asrDraft)}</p>
      <label>Human transcript<textarea rows="2"></textarea></label>
      <label>Classification<select>${['not_validated','correct','usable_with_minor_error','materially_wrong','unintelligible'].map(value => `<option>${value}</option>`).join('')}</select></label>`;
    const [button] = card.getElementsByTagName('button');
    if (call.playback) button.addEventListener('click', () => playCall(call));
    const textarea = card.querySelector('textarea');
    const select = card.querySelector('select');
    textarea.value = correction.humanTranscript ?? '';
    select.value = correction.classification;
    textarea.addEventListener('input', () => {
      state.transcriptCorrections[call.callSegmentId] = { humanTranscript: textarea.value || null, classification: select.value };
    });
    select.addEventListener('change', () => {
      state.transcriptCorrections[call.callSegmentId] = { humanTranscript: textarea.value || null, classification: select.value };
    });
    elements.calls.append(card);
  }
}

function playCall(call) {
  const player = elements['audio-player'];
  if (player.src !== new URL(call.playback.url, location.href).href) player.src = call.playback.url;
  const start = () => { player.currentTime = call.playback.startSeconds; app.stopAudioAt = call.playback.endSeconds; player.play(); };
  if (player.readyState >= 1) start(); else player.addEventListener('loadedmetadata', start, { once: true });
}

elements['audio-player'].addEventListener('timeupdate', () => {
  if (app.stopAudioAt !== null && elements['audio-player'].currentTime >= app.stopAudioAt) {
    elements['audio-player'].pause(); app.stopAudioAt = null;
  }
});

function renderProvenance() {
  const layers = {
    replayObservedFacts: app.selected.replayObservedFacts,
    derivedMetrics: app.selected.derivedMetrics,
    videoEvidence: { status: app.selected.videoEvidence.status, range: app.selected.videoEvidence.visualVodRangeSeconds },
    audioCallEvidence: { status: app.selected.audioCallEvidence.status, calls: app.selected.audioCallEvidence.callSegmentCount },
    humanSuppliedContext: app.selected.humanSuppliedContext,
    analystInference: app.selected.analystInference
  };
  elements.provenance.innerHTML = Object.entries(layers).map(([name, value]) => `<div class="layer"><h3>${escapeHtml(name)}</h3><pre>${escapeHtml(JSON.stringify(value, null, 2))}</pre></div>`).join('');
}

function renderReview() {
  const state = candidateState();
  elements['review-state'].value = state.reviewRecord.reviewState;
  elements['review-record'].value = JSON.stringify(state.reviewRecord, null, 2);
  elements.segments.innerHTML = state.reviewSegments.map(segment => `<div class="segment-card"><strong>${escapeHtml(segment.reviewSegmentId)}</strong><p>${segment.vodStartSeconds}–${segment.vodEndSeconds}s</p><p>${escapeHtml(segment.humanLabel ?? '')}</p><p>${escapeHtml(segment.humanNotes ?? '')}</p></div>`).join('');
  if (app.selected.detectedOverlaps.length) setStatus(`${app.selected.detectedOverlaps.length} segment overlap(s) detected`, true);
}

elements['review-state'].addEventListener('change', () => { candidateState().reviewRecord.reviewState = elements['review-state'].value; });
elements['review-record'].addEventListener('change', () => {
  try { candidateState().reviewRecord = JSON.parse(elements['review-record'].value); setStatus('Review record parsed'); }
  catch { setStatus('Review record is not valid JSON', true); }
});

elements['add-segment'].addEventListener('click', () => {
  const range = app.selected.videoEvidence.visualVodRangeSeconds;
  const start = Number.parseFloat(prompt(`VOD start (${range.start}–${range.end})`, range.start));
  const end = Number.parseFloat(prompt(`VOD end (${range.start}–${range.end})`, Math.min(range.end, start + 10)));
  if (!Number.isFinite(start) || !Number.isFinite(end)) return;
  const state = candidateState();
  const ordinal = state.reviewSegments.length + 1;
  state.reviewSegments.push({
    reviewSegmentId: `${app.selected.candidateWindowId}_segment_${String(ordinal).padStart(2, '0')}`,
    candidateWindowId: app.selected.candidateWindowId,
    reviewTargetId: app.selected.reviewTargetId,
    vodStartSeconds: start,
    vodEndSeconds: end,
    replayApproxStartSeconds: null,
    replayApproxEndSeconds: null,
    humanLabel: prompt('Human label', '') || null,
    humanNotes: prompt('Human notes', '') || null,
    evidenceRefs: [],
    reviewRecord: { ...structuredClone(app.selected.initialReviewRecord), reviewState: 'in_review' }
  });
  renderReview();
});

elements.save.addEventListener('click', async () => {
  try {
    candidateState().reviewRecord.reviewState = elements['review-state'].value;
    app.state = await api(`/api/review-state/${app.state.reviewTargetId}`, { method: 'PUT', body: JSON.stringify(app.state) });
    setStatus(`Saved locally at ${app.state.updatedAt}`);
    await selectCandidate(app.selected.candidateWindowId);
  } catch (error) { setStatus(error.message, true); }
});

elements.export.addEventListener('click', async () => {
  try {
    const result = await api('/api/export', { method: 'POST', body: JSON.stringify({ reviewTargetId: app.selected.reviewTargetId, candidateWindowId: app.selected.candidateWindowId }) });
    setStatus(`Exported: ${result.jsonPath}`);
  } catch (error) { setStatus(error.message, true); }
});

function move(direction) {
  const index = app.queue.findIndex(item => item.candidateWindowId === app.selected?.candidateWindowId);
  const next = app.queue[index + direction];
  if (next) selectCandidate(next.candidateWindowId);
}
elements.previous.addEventListener('click', () => move(-1));
elements.next.addEventListener('click', () => move(1));
elements.target.addEventListener('change', loadTarget);
elements.order.addEventListener('change', () => loadQueue(app.selected?.candidateWindowId));
elements.filter.addEventListener('change', () => loadQueue());
elements.search.addEventListener('input', () => loadQueue());

loadTargets().catch(error => setStatus(error.message, true));
