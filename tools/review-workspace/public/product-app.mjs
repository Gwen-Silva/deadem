import { initProductShell } from '/shell.mjs';

const previewRoutes = {
  '/patterns': {
    title: 'Padrões',
    description: 'Conecte decisões semelhantes entre diferentes partidas para identificar problemas recorrentes.',
    detail: 'Esta área é uma prévia. Nenhum padrão é inferido ou apresentado sem evidência revisada.'
  },
  '/training': {
    title: 'Plano de treino',
    description: 'Transforme padrões encontrados nas suas reviews em focos e exercícios para as próximas partidas.',
    detail: 'Esta área é uma prévia. Nenhuma recomendação automática está ativa.'
  }
};

function el(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function action(href, label, primary = false) {
  const link = el('a', `av-button${primary ? ' av-button--primary' : ''}`, label);
  link.href = href;
  return link;
}

async function api(route) {
  const response = await fetch(route);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
  return body;
}

function statusClass(state) {
  return `match-state match-state--${state}`;
}

function cover(match, className = 'match-cover') {
  const root = el('div', `${className} ${match.cover.status !== 'available' ? 'match-cover--fallback' : ''}`);
  if (match.cover.status === 'available') {
    const image = document.createElement('img');
    image.src = match.cover.url;
    image.alt = match.cover.alt;
    image.loading = 'lazy';
    root.append(image);
  } else {
    const fallback = el('span', 'cover-fallback-mark', 'AV');
    fallback.setAttribute('aria-label', match.cover.alt);
    root.append(fallback);
  }
  return root;
}

function progress(progressData, compact = false) {
  const root = el('div', `review-progress${compact ? ' review-progress--compact' : ''}`);
  const bar = el('div', 'av-progress');
  bar.setAttribute('role', 'progressbar');
  bar.setAttribute('aria-label', 'Progresso da revisão');
  bar.setAttribute('aria-valuemin', '0');
  bar.setAttribute('aria-valuemax', String(progressData.total));
  bar.setAttribute('aria-valuenow', String(progressData.processed));
  const fill = el('span');
  fill.style.setProperty('--progress-value', `${progressData.percent}%`);
  bar.append(fill);
  const text = el('p', '', `${progressData.processed} de ${progressData.total} momentos processados`);
  root.append(bar, text);
  return root;
}

const materialLabels = {
  gameplay: 'Gameplay',
  matchData: 'Dados da partida',
  communication: 'Comunicação',
  synchronizedReplay: 'Replay sincronizado'
};

function materialList(match, overview = false) {
  const root = el('div', overview ? 'materials-grid' : 'match-materials');
  for (const [key, label] of Object.entries(materialLabels)) {
    if (!overview && key === 'synchronizedReplay') continue;
    const available = match.materials[key] === 'available';
    if (overview && !available) continue;
    const item = el(overview ? 'article' : 'span', overview ? 'material-card av-card' : 'material-item');
    item.append(el('span', 'material-icon', available ? '✓' : '—'), el('span', '', label));
    if (overview) item.append(el('strong', '', available ? 'Disponível' : 'Indisponível'));
    root.append(item);
  }
  return root;
}

function matchCard(match) {
  const card = el('article', 'match-card av-card');
  const link = el('a', 'match-cover-link');
  link.href = `/matches/${match.id}`;
  link.setAttribute('aria-label', `Abrir ${match.displayName}`);
  link.append(cover(match));
  const content = el('div', 'match-card-content');
  const heading = el('div', 'match-card-heading');
  heading.append(el('h3', '', match.displayName), el('span', statusClass(match.review.state), match.review.label));
  content.append(heading, materialList(match), progress(match.review, true), action(`/matches/${match.id}`, 'Abrir partida →'));
  card.append(link, content);
  return card;
}

function renderHome(main, catalog) {
  document.title = 'AlphaVeil · Competitive Review for Deadlock';
  const content = el('div', 'product-content product-content--home');
  const hero = el('section', 'home-hero av-card');
  const heroMatch = catalog.matches.find(match => match.cover.status === 'available');
  if (heroMatch) {
    hero.style.setProperty('--hero-cover', `url("${heroMatch.cover.url}")`);
    hero.classList.add('home-hero--with-cover');
  }
  const heroCopy = el('div', 'home-hero-copy');
  heroCopy.append(el('span', 'av-badge', 'AlphaVeil'));
  const title = el('h1', '', 'Entenda suas decisões. ');
  title.append(el('span', '', 'Não apenas o resultado.'));
  heroCopy.append(title, el('p', 'hero-lead', 'Transforme gameplay, dados da partida e comunicação em momentos estruturados para revisão.'));
  const actions = el('div', 'hero-actions');
  actions.append(action(catalog.continueMatchId ? `/matches/${catalog.continueMatchId}` : '/review', catalog.continueMatchId ? 'Continuar revisão' : 'Começar revisão', true), action('/matches', 'Ver partidas'));
  heroCopy.append(actions);
  hero.append(heroCopy);

  const continueSection = el('section', 'home-section');
  continueSection.append(el('p', 'section-kicker', 'CONTINUE DE ONDE PAROU'));
  const inProgress = catalog.matches.find(match => match.id === catalog.continueMatchId);
  if (inProgress) {
    const card = el('article', 'continue-card av-card');
    card.append(cover(inProgress, 'continue-cover'));
    const body = el('div', 'continue-copy');
    body.append(el('span', statusClass(inProgress.review.state), inProgress.review.label), el('h2', '', inProgress.displayName), progress(inProgress.review), action(inProgress.reviewUrl, 'Continuar revisão', true));
    card.append(body);
    continueSection.append(card);
  } else {
    const card = el('article', 'start-card av-card');
    card.append(el('span', 'av-badge', 'Pronto para revisar'), el('h2', '', 'Comece sua primeira revisão'), el('p', '', 'O AlphaVeil já preparou momentos de partida para você analisar.'), action('/matches', 'Escolher partida', true));
    continueSection.append(card);
  }

  const available = el('section', 'home-section');
  const sectionHead = el('div', 'product-section-head');
  sectionHead.append(el('div', '', ''), action('/matches', 'Ver todas as partidas'));
  sectionHead.firstChild.append(el('p', 'section-kicker', 'PARTIDAS DISPONÍVEIS'), el('h2', '', 'Escolha uma scrim para revisar'));
  available.append(sectionHead);
  const grid = el('div', 'match-grid match-grid--home');
  catalog.matches.slice(0, 3).forEach(match => grid.append(matchCard(match)));
  available.append(grid);

  const workflow = el('section', 'home-section workflow-section');
  workflow.append(el('p', 'section-kicker', 'COMO O ALPHAVEIL FUNCIONA'), el('h2', '', 'Da partida ao próximo foco'));
  const flow = el('div', 'workflow-flow');
  for (const [index, item] of ['Gameplay + dados + comunicação', 'Momentos preparados', 'Revisão da decisão', 'Padrões e treino'].entries()) {
    const step = el('article', 'workflow-step av-card');
    step.append(el('span', 'workflow-index', String(index + 1).padStart(2, '0')), el('h3', '', item));
    if (index === 3) step.append(el('span', 'av-badge', 'Preview'));
    flow.append(step);
  }
  workflow.append(flow);
  content.append(hero, continueSection, available, workflow);
  main.append(content);
}

function renderMatches(main, catalog) {
  document.title = 'AlphaVeil · Partidas';
  const content = el('div', 'product-content match-library');
  const head = el('header', 'product-page-header');
  head.append(el('span', 'av-badge', 'Biblioteca'), el('h1', '', 'Partidas'), el('p', '', 'Revise suas scrims e acompanhe o progresso de cada análise.'));
  const filters = el('div', 'match-filters');
  const grid = el('div', 'match-grid');
  const options = [['all', 'Todos'], ['not_started', 'Não iniciadas'], ['in_progress', 'Em revisão'], ['completed', 'Concluídas']];
  for (const [value, label] of options) {
    const button = el('button', `filter-button${value === 'all' ? ' active' : ''}`, label);
    button.type = 'button';
    button.dataset.filter = value;
    button.addEventListener('click', () => {
      filters.querySelectorAll('button').forEach(item => item.classList.toggle('active', item === button));
      grid.replaceChildren(...catalog.matches.filter(match => value === 'all' || match.review.state === value).map(matchCard));
    });
    filters.append(button);
  }
  grid.append(...catalog.matches.map(matchCard));
  content.append(head, filters, grid);
  main.append(content);
}

function momentCard(moment, match) {
  const card = el('article', 'moment-card av-card');
  const visual = el('a', 'moment-visual');
  visual.href = moment.reviewUrl;
  visual.setAttribute('aria-label', `Revisar ${moment.displayName} da ${match.displayName}`);
  const pseudo = { cover: moment.thumbnail };
  visual.append(cover(pseudo, 'moment-thumbnail'));
  const body = el('div', 'moment-card-body');
  const meta = el('div', 'moment-meta');
  meta.append(el('span', 'moment-time', moment.vodTime), el('span', `review-state review-state--${moment.reviewState}`, moment.reviewLabel));
  body.append(meta, el('h3', '', moment.displayName), action(moment.reviewUrl, 'Revisar →'));
  card.append(visual, body);
  return card;
}

function renderOverview(main, match) {
  document.title = `AlphaVeil · ${match.displayName}`;
  const content = el('div', 'product-content match-overview');
  const breadcrumb = el('nav', 'breadcrumb');
  breadcrumb.setAttribute('aria-label', 'Breadcrumb');
  breadcrumb.append(action('/matches', 'Partidas'), el('span', '', '/'), el('span', '', match.displayName));
  const hero = el('section', 'overview-hero av-card');
  hero.append(cover(match, 'overview-cover'));
  const copy = el('div', 'overview-copy');
  copy.append(el('span', statusClass(match.review.state), match.review.label), el('h1', '', match.displayName), el('p', '', `${match.review.total} momentos preparados para revisão.`));
  const actions = el('div', 'hero-actions');
  actions.append(action(match.reviewUrl, match.review.state === 'not_started' ? 'Começar revisão' : 'Continuar revisão', true));
  if (match.replayUrl) actions.append(action(match.replayUrl, 'Abrir replay sincronizado'));
  copy.append(actions);
  hero.append(copy);

  const materials = el('section', 'overview-section');
  materials.append(el('p', 'section-kicker', 'MATERIAL DISPONÍVEL'), el('h2', '', 'Tudo pronto para revisar'));
  materials.append(materialList(match, true));

  const reviewProgress = el('section', 'overview-section progress-section av-card');
  reviewProgress.append(el('p', 'section-kicker', 'PROGRESSO DA REVISÃO'), el('h2', '', match.review.label), progress(match.review));
  const counts = el('div', 'progress-counts');
  for (const [label, value] of [['Revisados', match.review.reviewed], ['Em revisão', match.review.inReview], ['Ignorados', match.review.skipped], ['Pendentes', match.review.pending]]) {
    const item = el('div'); item.append(el('strong', '', String(value)), el('span', '', label)); counts.append(item);
  }
  reviewProgress.append(counts);

  const moments = el('section', 'overview-section');
  const heading = el('div', 'product-section-head');
  heading.append(el('div'), action(match.reviewUrl, 'Ver todos na revisão'));
  heading.firstChild.append(el('p', 'section-kicker', 'MOMENTOS PREPARADOS'), el('h2', '', 'Regiões da partida para orientar sua revisão'), el('p', 'section-copy', 'Ordem cronológica, sem classificação de importância.'));
  const priority = state => state === 'in_review' ? 0 : state === 'unreviewed' ? 1 : 2;
  const pendingFirst = match.moments.toSorted((left, right) => priority(left.reviewState) - priority(right.reviewState) || left.momentNumber - right.momentNumber).slice(0, 6);
  const grid = el('div', 'moment-grid');
  pendingFirst.forEach(moment => grid.append(momentCard(moment, match)));
  moments.append(heading, grid);
  content.append(breadcrumb, hero, materials, reviewProgress, moments);
  main.append(content);
}

function renderPreview(main, route) {
  document.title = `AlphaVeil · ${route.title}`;
  const content = el('section', 'product-content preview-page');
  content.append(el('span', 'av-badge', 'Preview'), el('h1', '', route.title), el('p', '', route.description));
  const card = el('article', 'preview-card av-card');
  card.append(el('span', 'preview-symbol', '◇'), el('h2', '', 'Uma próxima etapa do produto'), el('p', '', route.detail), action('/review', 'Ir para Revisão'));
  content.append(card);
  main.append(content);
}

function renderError(main) {
  document.title = 'AlphaVeil · Indisponível';
  const content = el('section', 'product-content preview-page');
  content.append(el('span', 'av-badge', 'Indisponível'), el('h1', '', 'Não foi possível abrir esta partida'), el('p', '', 'Volte à biblioteca e escolha uma das scrims disponíveis.'), action('/matches', 'Ver partidas', true));
  main.append(content);
}

initProductShell();
const main = document.getElementById('product-main');

try {
  if (location.pathname === '/' || location.pathname === '/matches') {
    const catalog = await api('/api/product/matches');
    if (location.pathname === '/') renderHome(main, catalog);
    else renderMatches(main, catalog);
  } else if (/^\/matches\/00[1-4]$/u.test(location.pathname)) {
    renderOverview(main, await api(`/api/product/matches/${location.pathname.slice(-3)}`));
  } else if (previewRoutes[location.pathname]) {
    renderPreview(main, previewRoutes[location.pathname]);
  } else {
    renderError(main);
  }
} catch {
  renderError(main);
}
