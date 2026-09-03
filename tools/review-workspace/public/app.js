import { REVIEW_FIELD_DEFINITIONS, applyFormToRecord, copyExportPath, recordToForm } from '/ux-model.mjs';
import { initProductShell } from '/shell.mjs';
import { parseFriendlyReviewNavigation } from '/product-navigation.mjs';

initProductShell();
const friendlyNavigation = parseFriendlyReviewNavigation(location.search);

const ids = [
  'target', 'order', 'filter', 'search', 'queue', 'queue-count', 'candidate-heading', 'visual-gap', 'visual-status',
  'frames', 'storyboards', 'audio-gap', 'audio-player', 'calls', 'call-count', 'provenance', 'review-state',
  'structured-review', 'error-classes', 'review-record', 'review-unsaved', 'segments', 'status', 'previous', 'next',
  'save', 'export', 'add-segment', 'segment-start', 'segment-end', 'segment-label', 'segment-notes',
  'copy-export-path', 'open-export-folder', 'export-path'
];
const elements = Object.fromEntries(ids.map(id => [id, document.getElementById(id)]));

const ERROR_CLASSES = [
  ['mechanical_error', 'Erro mecânico'], ['information_error', 'Erro de informação'],
  ['positioning_error', 'Erro de posicionamento'], ['timing_error', 'Erro de timing'],
  ['priority_error', 'Erro de prioridade'], ['map_read_error', 'Erro de leitura do mapa'],
  ['risk_evaluation_error', 'Erro de avaliação de risco'], ['execution_error', 'Erro de execução'],
  ['planning_error', 'Erro de planejamento'], ['team_coordination_failure', 'Falha de coordenação'],
  ['composition_identity_failure', 'Falha de identidade da composição'],
  ['correct_decision_bad_result', 'Decisão correta, resultado ruim'],
  ['bad_decision_favorable_result', 'Decisão ruim, resultado favorável'],
  ['not_an_error', 'Não é erro'], ['uncertain', 'Incerto']
];
const STATE_LABELS = {
  unreviewed: 'Não revisado', in_review: 'Em revisão', reviewed: 'Revisado', skipped: 'Ignorado'
};
const CLASSIFICATION_LABELS = {
  not_validated: 'Ainda não validado', correct: 'Correto', usable_with_minor_error: 'Usável com erro pequeno',
  materially_wrong: 'Materialmente incorreto', unintelligible: 'Ininteligível'
};
const app = { targets: [], queue: [], selected: null, state: null, stopAudioAt: null, exportLocation: null, dirty: false };

async function api(route, options = {}) {
  const response = await fetch(route, { ...options, headers: { 'content-type': 'application/json', ...(options.headers ?? {}) } });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error ?? `HTTP ${response.status}`);
  return value;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function setStatus(message, error = false) {
  elements.status.textContent = message;
  elements.status.style.color = error ? 'var(--danger)' : 'var(--success)';
}

function setDirty(value = true) {
  app.dirty = value;
  elements['review-unsaved'].hidden = !value;
}

function candidateState(candidateId = app.selected?.candidateWindowId) {
  if (!app.state.candidates[candidateId]) {
    app.state.candidates[candidateId] = {
      reviewRecord: structuredClone(app.selected.initialReviewRecord), transcriptCorrections: {}, reviewSegments: []
    };
  }
  return app.state.candidates[candidateId];
}

function availabilityLabel(value) {
  return value === 'available' ? 'Disponível' : value === 'available_with_gaps' ? 'Disponível com lacunas' : 'Indisponível';
}

async function loadTargets() {
  const result = await api('/api/targets');
  app.targets = result.targets;
  elements.target.innerHTML = result.targets.map(target => `<option value="${target.reviewTargetId}">Scrim ${target.reviewTargetId.slice(-2)} · ${target.candidateCount} momentos</option>`).join('');
  if (friendlyNavigation && result.targets.some(target => target.reviewTargetId === friendlyNavigation.targetId)) {
    elements.target.value = friendlyNavigation.targetId;
  }
  await loadTarget(friendlyNavigation?.candidateId ?? null);
}

async function loadTarget(preferredId = null) {
  app.state = await api(`/api/review-state/${elements.target.value}`);
  app.exportLocation = await api(`/api/export-location/${elements.target.value}`);
  renderExportLocation(false);
  await loadQueue(preferredId);
}

async function loadQueue(preferredId = null) {
  const query = new URLSearchParams({ reviewTargetId: elements.target.value, order: elements.order.value });
  if (elements.filter.value) query.set('status', elements.filter.value);
  if (elements.search.value) query.set('q', elements.search.value);
  app.queue = (await api(`/api/candidates?${query}`)).candidates;
  elements['queue-count'].textContent = app.queue.length;
  elements.queue.innerHTML = '';
  for (const candidate of app.queue) {
    const button = document.createElement('button');
    button.className = 'candidate-button';
    button.dataset.id = candidate.candidateWindowId;
    button.innerHTML = `<strong class="candidate-title">${escapeHtml(candidate.candidateWindowId)}</strong>
      <span class="candidate-badges"><span class="badge priority">${escapeHtml(candidate.priority.tier)}</span>
      <span class="badge" data-state="${candidate.reviewState}">${STATE_LABELS[candidate.reviewState]}</span>
      <span class="badge">${candidate.scrimContextAvailability ? 'Contexto Craig' : `${candidate.callSegmentCount} calls`}</span></span>`;
    button.addEventListener('click', () => selectCandidate(candidate.candidateWindowId));
    elements.queue.append(button);
  }
  const candidateId = preferredId && app.queue.some(item => item.candidateWindowId === preferredId)
    ? preferredId : app.queue[0]?.candidateWindowId;
  if (candidateId === app.selected?.candidateWindowId) {
    document.querySelectorAll('.candidate-button').forEach(button => button.classList.toggle('active', button.dataset.id === candidateId));
  } else if (candidateId) await selectCandidate(candidateId);
  else elements['candidate-heading'].innerHTML = '<h2>Nenhum candidato neste filtro</h2>';
}

function mediaFigure(item, label) {
  if (item.status !== 'available') return `<figure><figcaption>${escapeHtml(label)}: indisponível</figcaption></figure>`;
  return `<figure><img src="${escapeHtml(item.url)}" alt="${escapeHtml(label)}" loading="lazy"><figcaption>${escapeHtml(label)}</figcaption></figure>`;
}

async function selectCandidate(candidateId) {
  if (app.dirty && !confirm('Há alterações locais ainda não salvas. Deseja trocar de candidato?')) return;
  app.selected = await api(`/api/candidates/${candidateId}`);
  document.querySelectorAll('.candidate-button').forEach(button => button.classList.toggle('active', button.dataset.id === candidateId));
  const candidate = app.selected;
  elements['candidate-heading'].innerHTML = `<p class="section-kicker">CANDIDATO ATUAL</p><h2>${escapeHtml(candidate.candidateWindowId)}</h2>
    <p><span class="semantics">Região de atenção para revisão</span> · prioridade ${escapeHtml(candidate.priority.tier)} · sync ±${candidate.syncEstimatedErrorSeconds}s</p>`;
  elements['visual-gap'].textContent = candidate.videoEvidence.status === 'available' ? '' : `Lacuna visual: ${candidate.videoEvidence.status}`;
  elements['visual-status'].textContent = availabilityLabel(candidate.videoEvidence.status);
  elements['visual-status'].className = `availability-badge ${candidate.videoEvidence.status}`;
  elements.frames.innerHTML = candidate.videoEvidence.frames.map(frame => mediaFigure(frame, {
    first: 'Início', representative: 'Representativo', last: 'Fim'
  }[frame.role] ?? frame.role)).join('');
  elements.storyboards.innerHTML = candidate.videoEvidence.storyboards.map(board => mediaFigure(board, board.storyboardId)).join('');
  const scrim = candidate.scrimContextEvidence;
  document.getElementById('legacy-audio').hidden = Boolean(scrim);
  document.getElementById('scrim-context').hidden = !scrim;
  document.querySelector('.visual-section h2').textContent = scrim ? 'Evidência visual' : 'Visão do momento';
  if (scrim) {
    elements['audio-player'].pause();
    document.getElementById('open-scrim').href = scrim.url;
    const precision = value => Number(value.toFixed(6));
    document.getElementById('scrim-context-sync').textContent = `Replay↔VOD ±${precision(scrim.replayVodMappingErrorSeconds)} s · Craig↔VOD ±${precision(scrim.craigVodMappingErrorSeconds)} s · Composto até Craig ±${precision(scrim.composedOperationalErrorSeconds)} s. Não inclui drift do transporte.`;
  }
  elements['audio-gap'].textContent = !candidate.audioCallEvidence || candidate.audioCallEvidence.status === 'available' ? '' : `Lacuna de áudio: ${candidate.audioCallEvidence.status}`;
  elements['call-count'].textContent = `${candidate.audioCallEvidence?.callSegmentCount ?? 0} calls`;
  const range = candidate.videoEvidence.visualVodRangeSeconds;
  elements['segment-start'].value = range.start;
  elements['segment-end'].value = Math.min(range.end, range.start + 10);
  renderCalls();
  renderProvenance();
  renderReview();
  setDirty(false);
}

function renderCalls() {
  const state = candidateState();
  elements.calls.innerHTML = '';
  for (const call of app.selected.audioCallEvidence?.calls ?? []) {
    const correction = state.transcriptCorrections[call.callSegmentId] ?? { humanTranscript: null, classification: 'not_validated' };
    const card = document.createElement('article');
    card.className = 'call-card';
    card.innerHTML = `<header><div><strong>${escapeHtml(call.callSegmentId)}</strong><p class="candidate-meta">VOD ${call.vodStartSeconds}–${call.vodEndSeconds}s · replay aprox. ${call.replayApproxStartSeconds}–${call.replayApproxEndSeconds}s · sync ±${call.syncEstimatedErrorSeconds}s</p></div><button ${call.playback ? '' : 'disabled'}>▶ Ouvir</button></header>
      <p class="asr"><span class="section-kicker">RASCUNHO ASR</span><br>${escapeHtml(call.asrDraft)}</p>
      <div class="call-fields"><label>Correção humana<textarea rows="2" placeholder="Transcreva após ouvir"></textarea></label>
      <label>Qualidade do ASR<select>${Object.entries(CLASSIFICATION_LABELS).map(([value, label]) => `<option value="${value}">${label}</option>`).join('')}</select></label></div>`;
    const button = card.querySelector('button');
    if (call.playback) button.addEventListener('click', () => playCall(call));
    const textarea = card.querySelector('textarea');
    const select = card.querySelector('select');
    textarea.value = correction.humanTranscript ?? '';
    select.value = correction.classification;
    const update = () => {
      state.transcriptCorrections[call.callSegmentId] = { humanTranscript: textarea.value || null, classification: select.value };
      setDirty();
    };
    textarea.addEventListener('input', update);
    select.addEventListener('change', update);
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
    ...(app.selected.scrimContextEvidence ? { scrimContextEvidence:app.selected.scrimContextEvidence } : { audioCallEvidence:{ status:app.selected.audioCallEvidence.status, calls:app.selected.audioCallEvidence.callSegmentCount } }),
    humanSuppliedContext: app.selected.humanSuppliedContext,
    analystInference: app.selected.analystInference
  };
  elements.provenance.innerHTML = Object.entries(layers).map(([name, value]) => `<div class="layer"><h3>${escapeHtml(name)}</h3><pre>${escapeHtml(JSON.stringify(value, null, 2))}</pre></div>`).join('');
}

function fieldValues() {
  return Object.fromEntries([...elements['structured-review'].querySelectorAll('[data-review-field]')]
    .map(input => [input.dataset.reviewField, input.value]));
}

function selectedErrorClasses() {
  return [...elements['error-classes'].querySelectorAll('input:checked')].map(input => input.value);
}

function syncRawRecord() {
  elements['review-record'].value = JSON.stringify(candidateState().reviewRecord, null, 2);
}

function updateRecordFromForm() {
  const state = candidateState();
  state.reviewRecord = applyFormToRecord(state.reviewRecord, fieldValues(), selectedErrorClasses());
  state.reviewRecord.reviewState = elements['review-state'].value;
  syncRawRecord();
  setDirty();
}

function renderStructuredReview() {
  const record = candidateState().reviewRecord;
  const values = recordToForm(record);
  elements['structured-review'].innerHTML = '';
  for (const field of REVIEW_FIELD_DEFINITIONS) {
    const label = document.createElement('label');
    label.textContent = field.label;
    const input = document.createElement('textarea');
    input.rows = field.kind === 'lines' ? 3 : 2;
    input.placeholder = field.placeholder;
    input.dataset.reviewField = field.key;
    input.value = values[field.key];
    input.addEventListener('input', updateRecordFromForm);
    label.append(input);
    elements['structured-review'].append(label);
  }
  elements['error-classes'].innerHTML = ERROR_CLASSES.map(([value, label]) => `<label><input type="checkbox" value="${value}" ${(record.errorClasses ?? []).includes(value) ? 'checked' : ''}>${escapeHtml(label)}</label>`).join('');
  elements['error-classes'].querySelectorAll('input').forEach(input => input.addEventListener('change', updateRecordFromForm));
}

function detectLocalOverlaps(segments) {
  const sorted = [...segments].sort((left, right) => left.vodStartSeconds - right.vodStartSeconds);
  return sorted.slice(1).filter((segment, index) => segment.vodStartSeconds < sorted[index].vodEndSeconds).length;
}

function renderSegments() {
  const segments = candidateState().reviewSegments;
  elements.segments.innerHTML = segments.map((segment, index) => `<div class="segment-card"><span class="segment-badge">Segmento ${index + 1}</span><strong>${escapeHtml(segment.humanLabel ?? segment.reviewSegmentId)}</strong><p class="candidate-meta">VOD ${segment.vodStartSeconds}–${segment.vodEndSeconds}s</p><p>${escapeHtml(segment.humanNotes ?? '')}</p></div>`).join('');
  const overlaps = detectLocalOverlaps(segments);
  if (overlaps) setStatus(`${overlaps} sobreposição(ões) detectada(s); os segmentos permanecem separados.`, true);
}

function renderReview() {
  const record = candidateState().reviewRecord;
  elements['review-state'].value = record.reviewState;
  renderStructuredReview();
  syncRawRecord();
  renderSegments();
}

elements['review-state'].addEventListener('change', updateRecordFromForm);
elements['review-record'].addEventListener('change', () => {
  try {
    const parsed = JSON.parse(elements['review-record'].value);
    candidateState().reviewRecord = parsed;
    elements['review-state'].value = parsed.reviewState;
    renderStructuredReview();
    syncRawRecord();
    setDirty();
    setStatus('JSON avançado aplicado ao formulário estruturado.');
  } catch { setStatus('O JSON avançado não é válido.', true); }
});

elements['add-segment'].addEventListener('click', () => {
  const start = Number.parseFloat(elements['segment-start'].value);
  const end = Number.parseFloat(elements['segment-end'].value);
  const range = app.selected.videoEvidence.visualVodRangeSeconds;
  if (!(Number.isFinite(start) && Number.isFinite(end) && start < end && start >= range.start && end <= range.end)) {
    return setStatus(`Use limites entre ${range.start}s e ${range.end}s, com início menor que fim.`, true);
  }
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
    humanLabel: elements['segment-label'].value.trim() || null,
    humanNotes: elements['segment-notes'].value.trim() || null,
    evidenceRefs: [],
    reviewRecord: { ...structuredClone(app.selected.initialReviewRecord), reviewState: 'in_review' }
  });
  elements['segment-label'].value = '';
  elements['segment-notes'].value = '';
  renderSegments();
  setDirty();
  setStatus('Segmento humano adicionado localmente. Salve para persistir.');
});

async function saveCurrent() {
  candidateState().reviewRecord.reviewState = elements['review-state'].value;
  app.state = await api(`/api/review-state/${app.state.reviewTargetId}`, { method: 'PUT', body: JSON.stringify(app.state) });
  setDirty(false);
  setStatus('Revisão salva localmente.');
  return app.state;
}

elements.save.addEventListener('click', async () => {
  try { await saveCurrent(); } catch (error) { setStatus(error.message, true); }
});

function renderExportLocation(exported) {
  elements['export-path'].textContent = exported
    ? `Packet atualizado em ${app.exportLocation.relativePath}`
    : `Pasta segura: ${app.exportLocation.relativePath}`;
  elements['copy-export-path'].disabled = false;
}

elements.export.addEventListener('click', async () => {
  try {
    if (app.dirty) await saveCurrent();
    const result = await api('/api/export', { method: 'POST', body: JSON.stringify({
      reviewTargetId: app.selected.reviewTargetId, candidateWindowId: app.selected.candidateWindowId
    }) });
    app.exportLocation = { folderPath: result.folderPath, relativePath: result.relativeFolderPath };
    renderExportLocation(true);
    setStatus('Packet JSON e Markdown exportado localmente.');
  } catch (error) { setStatus(error.message, true); }
});

elements['copy-export-path'].addEventListener('click', async () => {
  try {
    await copyExportPath(app.exportLocation.folderPath, navigator.clipboard);
    setStatus('Caminho da pasta copiado.');
  } catch (error) { setStatus(error.message === 'clipboard_unavailable' ? 'Clipboard indisponível neste navegador.' : error.message, true); }
});

elements['open-export-folder'].addEventListener('click', async () => {
  try {
    await api('/api/export-folder/open', { method: 'POST', body: JSON.stringify({ reviewTargetId: elements.target.value }) });
    setStatus('Pasta local aberta.');
  } catch (error) { setStatus(error.message, true); }
});

function move(direction) {
  const index = app.queue.findIndex(item => item.candidateWindowId === app.selected?.candidateWindowId);
  const next = app.queue[index + direction];
  if (next) selectCandidate(next.candidateWindowId);
}

elements.previous.addEventListener('click', () => move(-1));
elements.next.addEventListener('click', () => move(1));
elements.target.addEventListener('change', async () => {
  if (app.dirty && !confirm('Há alterações locais ainda não salvas. Deseja trocar de partida?')) {
    elements.target.value = app.selected.reviewTargetId;
    return;
  }
  setDirty(false);
  await loadTarget();
});
elements.order.addEventListener('change', () => loadQueue(app.selected?.candidateWindowId));
elements.filter.addEventListener('change', () => loadQueue());
elements.search.addEventListener('input', () => loadQueue());

loadTargets().catch(error => setStatus(error.message, true));
