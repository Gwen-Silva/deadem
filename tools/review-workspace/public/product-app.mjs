import { initProductShell } from '/shell.mjs';

const routes = {
  '/matches': {
    title: 'Partidas',
    description: 'Suas scrims processadas aparecerão aqui para revisão.',
    detail: 'A experiência completa de histórico e overview de partida será construída sobre evidência já processada.'
  },
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

function el(tag, className, text) {
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

function renderHome(main) {
  document.title = 'AlphaVeil · Competitive Review for Deadlock';
  const content = el('div', 'product-content');
  const hero = el('section', 'hero');
  hero.setAttribute('aria-labelledby', 'home-title');
  hero.append(el('span', 'av-badge', 'Competitive Review for Deadlock'));
  const title = el('h1', '', 'Entenda suas decisões. ');
  title.id = 'home-title';
  title.append(el('span', '', 'Não apenas o resultado.'));
  hero.append(title, el('p', 'hero-lead', 'AlphaVeil organiza evidência de partida para uma revisão humana mais clara, conectando contexto visual, replay sincronizado e registro de decisões.'));
  const actions = el('div', 'hero-actions');
  actions.append(action('/review', 'Abrir Revisão', true), action('/matches', 'Ver Partidas'));
  hero.append(actions);
  const cards = el('div', 'hero-meta');
  const items = [
    ['Revisão com contexto', 'Navegue por regiões candidatas sem tratá-las como fatos confirmados.'],
    ['Replay sincronizado', 'Ouça e veja o contexto da scrim com as limitações de sincronização explícitas.'],
    ['Aprendizado progressivo', 'Padrões e treino permanecem como próximas superfícies, sem promessas ou dados fabricados.']
  ];
  for (const [heading, copy] of items) {
    const card = el('article', 'av-card');
    card.append(el('span', 'av-badge', 'Fluxo'), el('h2', '', heading), el('p', '', copy));
    cards.append(card);
  }
  content.append(hero, cards);
  main.append(content);
}

function renderPreview(main, route) {
  document.title = `AlphaVeil · ${route.title}`;
  const content = el('section', 'product-content preview-page');
  content.setAttribute('aria-labelledby', 'preview-title');
  content.append(el('span', 'av-badge', 'Preview'));
  const title = el('h1', '', route.title);
  title.id = 'preview-title';
  content.append(title, el('p', '', route.description));
  const card = el('article', 'preview-card av-card');
  card.append(el('span', 'av-badge', 'Em preparação'), el('h2', '', 'Uma próxima etapa do produto'), el('p', '', route.detail));
  const progress = el('div', 'av-progress');
  progress.setAttribute('role', 'progressbar');
  progress.setAttribute('aria-label', `${route.title}: prévia da experiência`);
  progress.setAttribute('aria-valuemin', '0');
  progress.setAttribute('aria-valuemax', '100');
  progress.setAttribute('aria-valuenow', '42');
  progress.append(el('span'));
  card.append(progress, action('/review', 'Ir para Revisão'));
  content.append(card);
  main.append(content);
}

initProductShell();
const main = document.getElementById('product-main');
if (location.pathname === '/') renderHome(main);
else renderPreview(main, routes[location.pathname]);
