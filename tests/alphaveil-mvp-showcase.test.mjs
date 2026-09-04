import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { DEFAULT_REPO_ROOT, ERROR_VOCABULARY, loadWorkspaceData } from '../tools/review-workspace/data-model.mjs';
import { ERROR_CLASS_GROUPS } from '../tools/review-workspace/review-presentation.mjs';
import { loadLocalScrimData } from '../tools/review-workspace/scrim-media.mjs';
import { createReviewWorkspaceServer } from '../tools/review-workspace/server.mjs';
import { REVIEW_FIELD_DEFINITIONS } from '../tools/review-workspace/ux-model.mjs';

const publicRoot = path.join(DEFAULT_REPO_ROOT, 'tools/review-workspace/public');
const source = relative => readFile(path.join(publicRoot, relative), 'utf8');

test('Replay global return follows the selected moment and keeps the match-only fallback', async () => {
  const app = await source('scrim-app.mjs');
  assert.match(app, /byId\('return-review'\)\.href = selectedMarker\.reviewUrl/u);
  assert.match(app, /byId\('return-review'\)\.href = presentation\.match\.reviewUrl/u);
  assert.match(app, /selectMarker\(marker, \{ seek: true, historyMode: 'push' \}\)/u);
  assert.match(app, /renderSelectedMarker\(\)/u);
});

test('shared polish provides restrained entrance, intentional states, image fallback and reduced motion', async () => {
  const [styles, product, review, replay] = await Promise.all([
    source('styles/showcase.css'), source('product-app.mjs'), source('app.js'), source('scrim-app.mjs')
  ]);
  assert.match(styles, /av-page-enter var\(--av-motion-slow\)/u);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/u);
  assert.match(styles, /\.av-skeleton/u);
  assert.match(styles, /\.av-state/u);
  assert.match(styles, /\.av-media-image/u);
  assert.match(product, /renderLoading/u);
  assert.match(product, /Nenhuma partida concluída ainda\./u);
  assert.match(product, /imageFallback/u);
  assert.match(review, /Nenhum momento corresponde a este filtro\./u);
  assert.match(review, /Não foi possível carregar a revisão\./u);
  assert.match(replay, /Replay sincronizado indisponível/u);
});

test('local server exposes the shared showcase stylesheet', async () => {
  const server = await createReviewWorkspaceServer({ port: 0 });
  try {
    const url = await server.start();
    const response = await fetch(url + '/styles/showcase.css');
    assert.equal(response.status, 200);
    assert.match(await response.text(), /av-page-enter/u);
  } finally {
    await server.stop();
  }
});

test('Patterns and Training are honest product-vision previews without fabricated progress', async () => {
  const product = await source('product-app.mjs');
  for (const phrase of [
    'Reviews concluídas', 'Momentos relacionados', 'Padrões recorrentes',
    'Foco atual', 'Exercício', 'Próxima partida', 'Nova revisão',
    'Nenhum padrão é inferido', 'Nenhuma recomendação automática está ativa'
  ]) assert.match(product, new RegExp(phrase, 'u'));
  assert.doesNotMatch(product, /(?:implementado|progresso de desenvolvimento)\s*\d+%|detectado \d+ vezes|melhoria de \d+%/iu);
});

test('showcase terminology and shell remain AlphaVeil-first and keyboard-addressable', async () => {
  const [shell, productHtml, reviewHtml, replayHtml] = await Promise.all([
    source('shell.mjs'), source('product.html'), source('index.html'), source('scrim.html')
  ]);
  assert.match(shell, /Competitive Review for Deadlock/u);
  assert.match(shell, /aria-current/u);
  assert.match(shell, /aria-expanded/u);
  assert.match(shell, /Escape/u);
  for (const html of [productHtml, reviewHtml, replayHtml]) {
    assert.match(html, /AlphaVeil/u);
    assert.doesNotMatch(html, />\s*(?:Deadem|DEADEM|Workspace Local)\b/u);
  }
});

test('accepted factual, review and Replay cardinalities remain unchanged', async () => {
  const workspace = await loadWorkspaceData();
  const counts = Object.fromEntries([...workspace.candidatesByTarget].map(([target, candidates]) => [target, candidates.length]));
  assert.deepEqual(counts, {
    review_match_001: 67,
    review_match_002: 35,
    review_match_003: 48,
    review_match_004: 57
  });
  assert.equal(Object.values(counts).reduce((sum, value) => sum + value, 0), 207);
  assert.equal(counts.review_match_001 + counts.review_match_002, 102);
  assert.equal(counts.review_match_003 + counts.review_match_004, 105);
  assert.equal(REVIEW_FIELD_DEFINITIONS.length, 11);
  assert.equal(ERROR_VOCABULARY.length, 15);
  assert.equal(ERROR_CLASS_GROUPS.flatMap(group => group.values).length, 15);
  const scrim = loadLocalScrimData(DEFAULT_REPO_ROOT);
  assert.equal(scrim.view.tracks.length, 9);
});
