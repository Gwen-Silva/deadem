import { REVIEW_FIELD_DEFINITIONS, applyFormToRecord, copyExportPath, recordToForm } from '/ux-model.mjs';
import { initProductShell } from '/shell.mjs';
import { parseFriendlyReviewNavigation } from '/product-navigation.mjs';
import {
  ERROR_CLASS_GROUPS,
  REVIEW_SECTIONS,
  communicationPresentation,
  formatReviewTimestamp,
  friendlyReviewUrl,
  momentIdentity,
  parseReviewTimestamp,
  queuePresentation,
  selectEvidenceFrames
} from '/review-presentation.mjs';

initProductShell();

const ids = [
  'target', 'order', 'filter', 'search', 'queue', 'queue-count', 'candidate-heading', 'visual-gap', 'visual-status',
  'evidence-stage', 'frames', 'storyboards', 'audio-gap', 'audio-player', 'calls', 'call-count', 'provenance',
  'review-state', 'structured-review', 'error-classes', 'review-record', 'review-unsaved', 'segments', 'status',
  'previous', 'next', 'save', 'export', 'save-feedback', 'add-segment', 'segment-start', 'segment-end',
  'segment-label', 'segment-notes', 'copy-export-path', 'open-export-folder', 'export-path', 'overview-link',
  'match-title', 'review-progress-text', 'review-progress-bar', 'mobile-queue-toggle', 'mobile-current-moment',
  'queue-panel', 'queue-overlay', 'scrim-context', 'open-scrim', 'scrim-context-sync', 'legacy-audio'
];
const elements = Object.fromEntries(ids.map(id => [id, document.getElementById(id)]));
const reviewMain = document.querySelector('.review-main');
const FIELD_KIND = new Map(REVIEW_FIELD_DEFINITIONS.map(field => [field.key, field.kind]));
const CLASSIFICATION_LABELS = {
  not_validated: 'Ainda não validado', correct: 'Correto', usable_with_minor_error: 'Usável com erro pequeno',
  materially_wrong: 'Materialmente incorreto', unintelligible: 'Ininteligível'
};
const app = {
  targets: [], queue: [], selected: null, state: null, productMatch: null, momentMap: new Map(),
  stopAudioAt: null, exportLocation: null, dirty: false, saveFeedbackTimer: null
};

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
  elements.status.classList.toggle('is-error', error);
  elements.status.classList.toggle('is-success', !error && Boolean(message));
}

function enhanceImage(image, { fallbackClass = 'media-inline-fallback', fallbackLabel = 'Evidência visual indisponível' } = {}) {
  image.classList.add('av-media-image');
  const host = image.parentElement;
  host?.classList.add('is-loading');
  const ready = () => { host?.classList.remove('is-loading'); host?.classList.add('is-loaded'); };
  image.addEventListener('load', ready, { once: true });
  image.addEventListener('error', () => {
    const fallback = document.createElement('span');
    fallback.className = fallbackClass;
    fallback.textContent = 'AV';
    fallback.setAttribute('aria-label', fallbackLabel);
    image.replaceWith(fallback);
    ready();
  }, { once: true });
  if (image.complete && image.naturalWidth > 0) ready();
}

function setSaveFeedback(message) {
  clearTimeout(app.saveFeedbackTimer);
  elements['save-feedback'].textContent = message;
  if (message) app.saveFeedbackTimer = setTimeout(() => { elements['save-feedback'].textContent = ''; }, 2400);
}

function setDirty(value = true) {
  app.dirty = value;
  elements['review-unsaved'].hidden = !value;
  if (value) setSaveFeedback('● Alterações não salvas');
}

function candidateState(candidateId = app.selected?.candidateWindowId) {
  if (!app.state.candidates[candidateId]) {
    app.state.candidates[candidateId] = {
      reviewRecord: structuredClone(app.selected.initialReviewRecord), transcriptCorrections: {}, reviewSegments: []
    };
  }
  return app.state.candidates[candidateId];
}

function matchId() {
  return elements.target.value.slice(-3);
}

function closeMomentDrawer() {
  document.body.classList.remove('moment-drawer-open');
  elements['mobile-queue-toggle'].setAttribute('aria-expanded', 'false');
}

function toggleMomentDrawer() {
  const open = !document.body.classList.contains('moment-drawer-open');
  document.body.classList.toggle('moment-drawer-open', open);
  elements['mobile-queue-toggle'].setAttribute('aria-expanded', String(open));
  if (open) elements['queue-panel'].querySelector('button')?.focus();
}

function refreshProgress() {
  if (!app.productMatch || !app.state) return;
  const counts = { reviewed: 0, skipped: 0 };
  for (const moment of app.productMatch.moments) {
    const candidateId = `${app.productMatch.internalReviewTargetId}_window_${String(moment.momentNumber).padStart(4, '0')}`;
    const state = app.state.candidates[candidateId]?.reviewRecord?.reviewState ?? 'unreviewed';
    if (state === 'reviewed') counts.reviewed += 1;
    if (state === 'skipped') counts.skipped += 1;
  }
  const processed = counts.reviewed + counts.skipped;
  const total = app.productMatch.moments.length;
  const percent = total ? (processed / total) * 100 : 0;
  elements['review-progress-text'].textContent = `${processed} de ${total} momentos processados`;
  elements['review-progress-bar'].style.setProperty('--progress-value', `${percent}%`);
  elements['review-progress-bar'].parentElement.setAttribute('aria-valuenow', String(Math.round(percent)));
  elements['review-progress-bar'].parentElement.setAttribute('role', 'progressbar');
}

async function loadTargets(navigation = parseFriendlyReviewNavigation(location.search)) {
  const result = await api('/api/targets');
  app.targets = result.targets;
  elements.target.innerHTML = result.targets.map(target => `<option value="${target.reviewTargetId}">Scrim ${target.reviewTargetId.slice(-2)} · ${target.candidateCount} momentos</option>`).join('');
  if (navigation && result.targets.some(target => target.reviewTargetId === navigation.targetId)) elements.target.value = navigation.targetId;
  await loadTarget(navigation?.candidateId ?? null, 'replace');
}

async function loadTarget(preferredId = null, historyMode = 'replace') {
  const id = matchId();
  [app.state, app.exportLocation, app.productMatch] = await Promise.all([
    api(`/api/review-state/${elements.target.value}`),
    api(`/api/export-location/${elements.target.value}`),
    api(`/api/product/matches/${id}`)
  ]);
  app.momentMap = new Map(app.productMatch.moments.map(moment => [moment.momentNumber, moment]));
  elements['match-title'].textContent = app.productMatch.displayName;
  elements['overview-link'].textContent = app.productMatch.displayName;
  elements['overview-link'].href = `/matches/${id}`;
  renderExportLocation(false);
  refreshProgress();
  await loadQueue(preferredId, historyMode);
}

function friendlySearch(value) {
  const text = value.trim();
  return /^\d{1,4}$/u.test(text) ? String(Number(text)).padStart(4, '0') : text;
}

async function loadQueue(preferredId = null, historyMode = 'replace') {
  const query = new URLSearchParams({ reviewTargetId: elements.target.value, order: elements.order.value });
  if (elements.filter.value) query.set('status', elements.filter.value);
  if (elements.search.value) query.set('q', friendlySearch(elements.search.value));
  app.queue = (await api(`/api/candidates?${query}`)).candidates;
  elements['queue-count'].textContent = app.queue.length;
  elements.queue.innerHTML = '';
  for (const candidate of app.queue) {
    const identity = momentIdentity(candidate.candidateWindowId);
    const item = queuePresentation(candidate, app.momentMap.get(identity.momentNumber));
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'moment-list-item';
    button.dataset.id = item.candidateId;
    button.setAttribute('role', 'option');
    button.setAttribute('aria-selected', 'false');
    button.setAttribute('aria-label', `${item.label}, ${item.time ?? 'horário indisponível'}, ${item.reviewLabel}`);
    button.innerHTML = item.thumbnail.status === 'available'
      ? `<img src="${escapeHtml(item.thumbnail.url)}" alt="${escapeHtml(item.thumbnail.alt)}" loading="lazy"><span class="moment-list-copy"><span><time>${escapeHtml(item.time)}</time><span class="badge" data-state="${item.reviewState}">${escapeHtml(item.reviewLabel)}</span></span><strong>${escapeHtml(item.label)}</strong></span>`
      : `<span class="moment-thumb-fallback" aria-hidden="true">AV</span><span class="moment-list-copy"><span><time>${escapeHtml(item.time ?? '—')}</time><span class="badge" data-state="${item.reviewState}">${escapeHtml(item.reviewLabel)}</span></span><strong>${escapeHtml(item.label)}</strong></span>`;
    const thumbnail = button.querySelector('img');
    if (thumbnail) enhanceImage(thumbnail, { fallbackClass: 'moment-thumb-fallback', fallbackLabel: `Preview indisponível do ${item.label}` });
    button.addEventListener('click', () => selectCandidate(item.candidateId, { historyMode: 'push' }));
    elements.queue.append(button);
  }
  const candidateId = preferredId && app.queue.some(item => item.candidateWindowId === preferredId)
    ? preferredId : app.queue[0]?.candidateWindowId;
  if (candidateId === app.selected?.candidateWindowId) markSelected(candidateId);
  else if (candidateId) await selectCandidate(candidateId, { historyMode });
  else {
    const empty = document.createElement('section');
    empty.className = 'queue-empty av-state';
    empty.innerHTML = '<span class="av-state-mark">◇</span><strong>Nenhum momento corresponde a este filtro.</strong><p>Limpe os filtros para voltar à fila completa.</p><button type="button">Limpar filtros</button>';
    empty.querySelector('button').addEventListener('click', () => {
      elements.filter.value = '';
      elements.search.value = '';
      loadQueue(null, 'replace').catch(error => {
        console.error(error);
        setStatus('Não foi possível restaurar a fila de momentos.', true);
      });
    });
    elements.queue.append(empty);
    elements['candidate-heading'].innerHTML = '<p class="section-kicker">FILTRO SEM RESULTADOS</p><h2>Nenhum momento corresponde a este filtro.</h2><p>Use “Limpar filtros” para continuar a revisão.</p>';
  }
}

function markSelected(candidateId) {
  elements.queue.querySelectorAll('.moment-list-item').forEach(button => {
    const selected = button.dataset.id === candidateId;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-selected', String(selected));
    if (selected) button.setAttribute('aria-current', 'true'); else button.removeAttribute('aria-current');
  });
}

function updateMomentNavigation() {
  const index = app.queue.findIndex(item => item.candidateWindowId === app.selected?.candidateWindowId);
  const previous = app.queue[index - 1];
  const next = app.queue[index + 1];
  elements.previous.disabled = !previous;
  elements.next.disabled = !next;
  elements.previous.textContent = previous ? `← Momento ${momentIdentity(previous.candidateWindowId).momentNumber}` : '← Momento anterior';
  elements.next.textContent = next ? `Momento ${momentIdentity(next.candidateWindowId).momentNumber} →` : 'Próximo momento →';
}

function renderMainFrame(frame, label) {
  if (!frame || frame.status !== 'available') {
    elements['evidence-stage'].innerHTML = '<div class="evidence-fallback"><strong>Preview indisponível</strong><span>A revisão continua disponível sem mídia local.</span></div>';
    return;
  }
  elements['evidence-stage'].classList.add('switching');
  const image = document.createElement('img');
  image.alt = `Preview visual neutro do ${label}`;
  elements['evidence-stage'].replaceChildren(image);
  enhanceImage(image, { fallbackClass: 'evidence-fallback', fallbackLabel: `Preview visual indisponível do ${label}` });
  image.src = frame.url;
  requestAnimationFrame(() => elements['evidence-stage'].classList.remove('switching'));
}

function renderEvidence(candidate, identity) {
  const selected = selectEvidenceFrames(candidate.videoEvidence.frames);
  renderMainFrame(selected.main, identity.label);
  const roleLabels = { first: 'Início', representative: 'Referência', last: 'Fim' };
  elements.frames.innerHTML = '';
  for (const frame of selected.thumbnails) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'frame-option';
    button.disabled = frame.status !== 'available';
    button.setAttribute('aria-pressed', String(frame === selected.main));
    button.innerHTML = frame.status === 'available'
      ? `<img src="${escapeHtml(frame.url)}" alt="Preview ${escapeHtml(roleLabels[frame.role] ?? frame.role)}"><span>${escapeHtml(roleLabels[frame.role] ?? frame.role)}</span>`
      : `<span class="frame-option-fallback">Indisponível</span><span>${escapeHtml(roleLabels[frame.role] ?? frame.role)}</span>`;
    const thumbnail = button.querySelector('img');
    if (thumbnail) enhanceImage(thumbnail, { fallbackClass: 'frame-option-fallback', fallbackLabel: `Preview ${roleLabels[frame.role] ?? frame.role} indisponível` });
    button.addEventListener('click', () => {
      renderMainFrame(frame, identity.label);
      elements.frames.querySelectorAll('button').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    });
    elements.frames.append(button);
  }
  elements.storyboards.innerHTML = candidate.videoEvidence.storyboards.map((board, index) => board.status === 'available'
    ? `<figure><img src="${escapeHtml(board.url)}" alt="Sequência visual ${index + 1} do ${escapeHtml(identity.label)}" loading="lazy"><figcaption>Sequência visual ${index + 1}</figcaption></figure>`
    : `<figure><figcaption>Sequência visual ${index + 1}: indisponível</figcaption></figure>`).join('');
  elements.storyboards.querySelectorAll('img').forEach((image, index) => enhanceImage(image, { fallbackClass: 'storyboard-fallback', fallbackLabel: `Sequência visual ${index + 1} indisponível` }));
}

async function selectCandidate(candidateId, { historyMode = 'push' } = {}) {
  if (app.dirty && !confirm('Há alterações locais ainda não salvas. Deseja trocar de momento?')) return;
  app.selected = await api(`/api/candidates/${candidateId}`);
  const candidate = app.selected;
  const identity = momentIdentity(candidateId);
  const productMoment = app.momentMap.get(identity.momentNumber);
  markSelected(candidateId);
  closeMomentDrawer();
  if (historyMode !== 'none') history[historyMode === 'replace' ? 'replaceState' : 'pushState']({ candidateId }, '', friendlyReviewUrl(candidateId));
  elements['mobile-current-moment'].textContent = `${identity.label} de ${app.productMatch.moments.length}`;
  const range = candidate.videoEvidence.visualVodRangeSeconds;
  elements['candidate-heading'].innerHTML = `<p class="section-kicker">MOMENTO ${identity.momentNumber}</p><h2>${escapeHtml(productMoment?.vodTime ?? formatReviewTimestamp(range.start))}</h2><p>${formatReviewTimestamp(range.start)} – ${formatReviewTimestamp(range.end)} · Região preparada para revisão</p>`;
  elements['visual-gap'].textContent = candidate.videoEvidence.status === 'available' ? '' : 'O preview visual local não está disponível.';
  elements['visual-status'].textContent = candidate.videoEvidence.status === 'available' ? 'Disponível' : 'Indisponível';
  elements['visual-status'].className = `availability-badge ${candidate.videoEvidence.status}`;
  renderEvidence(candidate, identity);
  renderCommunication(candidate);
  elements['segment-start'].value = formatReviewTimestamp(range.start);
  elements['segment-end'].value = formatReviewTimestamp(Math.min(range.end, range.start + 10));
  renderCalls();
  renderProvenance();
  renderReview();
  updateMomentNavigation();
  setDirty(false);
}

function renderCommunication(candidate) {
  const presentation = communicationPresentation(candidate);
  elements['legacy-audio'].hidden = presentation.mode !== 'legacy';
  elements['scrim-context'].hidden = presentation.mode !== 'multitrack';
  if (presentation.mode === 'multitrack') {
    elements['audio-player'].pause();
    const identity = momentIdentity(candidate.candidateWindowId);
    elements['open-scrim'].href = `/scrim?match=${identity.matchId}&moment=${identity.momentNumber}`;
    const precision = value => Number(value.toFixed(6));
    elements['scrim-context-sync'].hidden = true;
    elements['scrim-context-sync'].textContent = `Replay↔VOD ±${precision(candidate.scrimContextEvidence.replayVodMappingErrorSeconds)} s · Craig↔VOD ±${precision(candidate.scrimContextEvidence.craigVodMappingErrorSeconds)} s · composto ±${precision(candidate.scrimContextEvidence.composedOperationalErrorSeconds)} s.`;
  }
  elements['audio-gap'].textContent = !candidate.audioCallEvidence || candidate.audioCallEvidence.status === 'available' ? '' : 'A comunicação local não está disponível.';
  elements['call-count'].textContent = `${candidate.audioCallEvidence?.callSegmentCount ?? 0} trechos`;
}

function renderCalls() {
  const state = candidateState();
  elements.calls.innerHTML = '';
  (app.selected.audioCallEvidence?.calls ?? []).forEach((call, index) => {
    const correction = state.transcriptCorrections[call.callSegmentId] ?? { humanTranscript: null, classification: 'not_validated' };
    const card = document.createElement('article');
    card.className = 'call-card';
    card.innerHTML = `<header><div><strong>Trecho ${index + 1}</strong><p class="candidate-meta">${formatReviewTimestamp(call.vodStartSeconds)} – ${formatReviewTimestamp(call.vodEndSeconds)}</p></div><button type="button" ${call.playback ? '' : 'disabled'}>▶ Ouvir</button></header>
      <p class="asr"><span class="section-kicker">TRANSCRIÇÃO AUTOMÁTICA</span><br>${escapeHtml(call.asrDraft)}</p>
      <div class="call-fields"><label>Corrigir transcrição<textarea rows="2" placeholder="Transcreva após ouvir"></textarea></label>
      <label>Qualidade da transcrição<select>${Object.entries(CLASSIFICATION_LABELS).map(([value, label]) => `<option value="${value}">${label}</option>`).join('')}</select></label></div>`;
    if (call.playback) card.querySelector('button').addEventListener('click', () => playCall(call));
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
  });
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
    'Dados observados': app.selected.replayObservedFacts,
    'Métricas derivadas': app.selected.derivedMetrics,
    'Evidência visual': { status: app.selected.videoEvidence.status, range: app.selected.videoEvidence.visualVodRangeSeconds },
    'Contexto de comunicação': app.selected.scrimContextEvidence ?? { status: app.selected.audioCallEvidence?.status, calls: app.selected.audioCallEvidence?.callSegmentCount },
    'Contexto fornecido': app.selected.humanSuppliedContext,
    'Inferências humanas': app.selected.analystInference
  };
  elements.provenance.innerHTML = `<div class="evidence-identity"><strong>Identidade interna</strong><code>${escapeHtml(app.selected.candidateWindowId)}</code></div>${Object.entries(layers).map(([name, value]) => `<div class="layer"><h3>${escapeHtml(name)}</h3><pre>${escapeHtml(JSON.stringify(value, null, 2))}</pre></div>`).join('')}`;
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
  for (const section of REVIEW_SECTIONS) {
    const article = document.createElement('section');
    article.className = `review-section review-section--${section.id}`;
    article.innerHTML = `<header><p class="section-kicker">${escapeHtml(section.kicker)}</p><h3>${escapeHtml(section.title)}</h3></header>${section.note ? `<p class="decision-principle">${escapeHtml(section.note)}</p>` : ''}`;
    const fields = document.createElement('div');
    fields.className = 'review-section-fields';
    for (const field of section.fields) {
      const label = document.createElement('label');
      label.textContent = field.label;
      const input = document.createElement('textarea');
      input.rows = FIELD_KIND.get(field.key) === 'lines' ? 3 : 2;
      input.placeholder = field.placeholder;
      input.dataset.reviewField = field.key;
      input.value = values[field.key];
      input.addEventListener('input', updateRecordFromForm);
      label.append(input);
      fields.append(label);
    }
    article.append(fields);
    elements['structured-review'].append(article);
  }
  elements['error-classes'].innerHTML = '';
  for (const group of ERROR_CLASS_GROUPS) {
    const section = document.createElement('section');
    section.className = 'error-group';
    section.innerHTML = `<h3>${escapeHtml(group.title)}</h3>`;
    const chips = document.createElement('div');
    chips.className = 'review-chips';
    for (const [value, label] of group.values) {
      const chip = document.createElement('label');
      chip.className = 'review-chip';
      chip.innerHTML = `<input type="checkbox" value="${value}" ${(record.errorClasses ?? []).includes(value) ? 'checked' : ''}><span>${escapeHtml(label)}</span>`;
      chips.append(chip);
    }
    section.append(chips);
    elements['error-classes'].append(section);
  }
  elements['error-classes'].querySelectorAll('input').forEach(input => input.addEventListener('change', updateRecordFromForm));
}

function detectLocalOverlaps(segments) {
  const sorted = [...segments].sort((left, right) => left.vodStartSeconds - right.vodStartSeconds);
  return sorted.slice(1).filter((segment, index) => segment.vodStartSeconds < sorted[index].vodEndSeconds).length;
}

function renderSegments() {
  const segments = candidateState().reviewSegments;
  elements.segments.innerHTML = segments.map((segment, index) => `<article class="segment-card"><span class="segment-badge">Segmento ${index + 1}</span><strong>${escapeHtml(segment.humanLabel ?? `Trecho ${index + 1}`)}</strong><p class="candidate-meta">${formatReviewTimestamp(segment.vodStartSeconds)} → ${formatReviewTimestamp(segment.vodEndSeconds)}</p><p>${escapeHtml(segment.humanNotes ?? '')}</p></article>`).join('');
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
    renderStructuredReview(); syncRawRecord(); setDirty();
    setStatus('Registro avançado aplicado ao formulário estruturado.');
  } catch { setStatus('O registro avançado não é válido.', true); }
});

elements['add-segment'].addEventListener('click', () => {
  let start; let end;
  try {
    start = parseReviewTimestamp(elements['segment-start'].value);
    end = parseReviewTimestamp(elements['segment-end'].value);
  } catch { return setStatus('Use timestamps como MM:SS ou MM:SS.s.', true); }
  const range = app.selected.videoEvidence.visualVodRangeSeconds;
  const displayRoundingTolerance = 0.051;
  if (!(start < end && start >= range.start - displayRoundingTolerance && end <= range.end + displayRoundingTolerance)) {
    return setStatus(`Use limites entre ${formatReviewTimestamp(range.start)} e ${formatReviewTimestamp(range.end)}, com início menor que fim.`, true);
  }
  start = Math.max(start, range.start);
  end = Math.min(end, range.end);
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
  renderSegments(); setDirty();
  setStatus('Segmento humano adicionado localmente. Salve para persistir.');
});

async function saveCurrent() {
  candidateState().reviewRecord.reviewState = elements['review-state'].value;
  app.state = await api(`/api/review-state/${app.state.reviewTargetId}`, { method: 'PUT', body: JSON.stringify(app.state) });
  setDirty(false); setSaveFeedback('✓ Salvo'); setStatus('Revisão salva localmente.'); refreshProgress();
  await loadQueue(app.selected.candidateWindowId, 'none');
  return app.state;
}

elements.save.addEventListener('click', async () => {
  try { await saveCurrent(); } catch (error) { setStatus(error.message, true); }
});

function renderExportLocation(exported) {
  elements['export-path'].textContent = exported
    ? `Análise atualizada em ${app.exportLocation.relativePath}`
    : `Destino local: ${app.exportLocation.relativePath}`;
  elements['copy-export-path'].disabled = false;
}

elements.export.addEventListener('click', async () => {
  try {
    if (app.dirty) await saveCurrent();
    const result = await api('/api/export', { method: 'POST', body: JSON.stringify({
      reviewTargetId: app.selected.reviewTargetId, candidateWindowId: app.selected.candidateWindowId
    }) });
    app.exportLocation = { folderPath: result.folderPath, relativePath: result.relativeFolderPath };
    renderExportLocation(true); setStatus('✓ Análise exportada');
  } catch (error) { setStatus(error.message, true); }
});

elements['copy-export-path'].addEventListener('click', async () => {
  try { await copyExportPath(app.exportLocation.folderPath, navigator.clipboard); setStatus('Caminho da pasta copiado.'); }
  catch (error) { setStatus(error.message === 'clipboard_unavailable' ? 'Clipboard indisponível neste navegador.' : error.message, true); }
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
  if (next) selectCandidate(next.candidateWindowId, { historyMode: 'push' });
}

elements.previous.addEventListener('click', () => move(-1));
elements.next.addEventListener('click', () => move(1));
elements.target.addEventListener('change', async () => {
  if (app.dirty && !confirm('Há alterações locais ainda não salvas. Deseja trocar de partida?')) {
    elements.target.value = app.selected.reviewTargetId; return;
  }
  setDirty(false); await loadTarget(null, 'push');
});
elements.order.addEventListener('change', () => loadQueue(app.selected?.candidateWindowId, 'none'));
elements.filter.addEventListener('change', () => loadQueue(null, 'replace'));
elements.search.addEventListener('input', () => loadQueue(null, 'replace'));
elements['mobile-queue-toggle'].addEventListener('click', toggleMomentDrawer);
elements['queue-overlay'].addEventListener('click', closeMomentDrawer);
document.addEventListener('keydown', event => { if (event.key === 'Escape') closeMomentDrawer(); });
window.addEventListener('beforeunload', event => { if (app.dirty) { event.preventDefault(); event.returnValue = ''; } });
window.addEventListener('popstate', async () => {
  const navigation = parseFriendlyReviewNavigation(location.search);
  if (!navigation) return;
  if (elements.target.value !== navigation.targetId) {
    elements.target.value = navigation.targetId;
    await loadTarget(navigation.candidateId, 'none');
  } else if (navigation.candidateId !== app.selected?.candidateWindowId) {
    await selectCandidate(navigation.candidateId, { historyMode: 'none' });
  }
});

reviewMain?.setAttribute('aria-busy', 'true');
loadTargets().catch(error => {
  console.error(error);
  elements['candidate-heading'].innerHTML = '<p class="section-kicker">REVISÃO INDISPONÍVEL</p><h2>Não foi possível carregar este momento.</h2><p>Volte à visão geral da Scrim e tente novamente.</p>';
  setStatus('Não foi possível carregar a revisão.', true);
}).finally(() => reviewMain?.setAttribute('aria-busy', 'false'));
