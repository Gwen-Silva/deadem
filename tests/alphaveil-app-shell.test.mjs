import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { DEFAULT_REPO_ROOT } from '../tools/review-workspace/data-model.mjs';
import { createReviewWorkspaceServer } from '../tools/review-workspace/server.mjs';

const publicRoot = path.join(DEFAULT_REPO_ROOT, 'tools/review-workspace/public');
const source = name => readFile(path.join(publicRoot, name), 'utf8');

test('AlphaVeil public shell exposes the canonical brand and bounded route vocabulary', async () => {
    const [home, review, scrim, shell] = await Promise.all([
        source('product.html'), source('index.html'), source('scrim.html'), source('shell.mjs')
    ]);
    for (const html of [home, review, scrim]) {
        assert.match(html, /AlphaVeil/u);
        assert.match(html, /product-sidebar/u);
        assert.match(html, /mobile-bar/u);
        assert.doesNotMatch(html, />\s*Deadem\b/iu);
    }
    for (const term of ['Início', 'Partidas', 'Revisão', 'Replay sincronizado', 'Padrões', 'Plano de treino']) {
        assert.match(shell, new RegExp(term, 'u'));
    }
    for (const route of ['/', '/matches', '/review', '/scrim', '/patterns', '/training']) {
        assert.match(shell, new RegExp(`path: '${route.replace('/', '\\/')}'`, 'u'));
    }
    assert.match(shell, /aria-current/u);
    assert.match(shell, /aria-expanded/u);
    assert.match(shell, /Escape/u);
});

test('Home, match experience and explicit future previews make no fabricated claims', async () => {
    const app = await source('product-app.mjs');
    assert.match(app, /Entenda suas decisões/u);
    assert.match(app, /PARTIDAS DISPONÍVEIS/u);
    assert.match(app, /MOMENTOS PREPARADOS/u);
    assert.match(app, /Conecte decisões semelhantes entre diferentes partidas para identificar problemas recorrentes\./u);
    assert.match(app, /Transforme padrões encontrados nas suas reviews em focos e exercícios para as próximas partidas\./u);
    assert.match(app, /Preview/u);
    assert.match(app, /Nenhum padrão é inferido/u);
    assert.match(app, /Nenhuma recomendação automática está ativa/u);
    assert.doesNotMatch(app, /42%|width: 42%/u);
});

test('shared design tokens define restrained motion, focus and reduced-motion behavior', async () => {
    const [tokens, base, shell, components, review] = await Promise.all([
        source('styles/tokens.css'), source('styles/base.css'), source('styles/shell.css'),
        source('styles/components.css'), source('styles.css')
    ]);
    assert.match(tokens, /--av-motion-fast: 120ms/u);
    assert.match(tokens, /--av-motion-normal: 180ms/u);
    assert.match(tokens, /--av-motion-slow: 260ms/u);
    assert.match(base, /prefers-reduced-motion: reduce/u);
    assert.match(base, /:focus-visible/u);
    assert.match(shell, /@media \(max-width: 980px\)/u);
    assert.match(components, /\.av-card/u);
    assert.match(components, /\.av-button/u);
    assert.match(components, /\.av-badge/u);
    assert.match(components, /\.av-progress/u);
    assert.match(components, /\.av-thumbnail/u);
    assert.match(components, /data-tooltip/u);
    assert.match(review, /styles\/tokens\.css/u);
});

test('HTTP surface serves exactly the product routes while Review and Scrim APIs remain live', async () => {
    const workspace = await createReviewWorkspaceServer({ port: 0 });
    try {
        const url = await workspace.start();
        for (const route of ['/', '/matches', '/patterns', '/training']) {
            const response = await fetch(url + route);
            assert.equal(response.status, 200);
            assert.match(await response.text(), /AlphaVeil/u);
        }
        const review = await fetch(url + '/review');
        assert.equal(review.status, 200);
        assert.match(await review.text(), /Revisão assistida/u);
        const scrim = await fetch(url + '/scrim');
        assert.equal(scrim.status, 200);
        assert.match(await scrim.text(), /Replay sincronizado/u);
        const candidates = await (await fetch(url + '/api/candidates')).json();
        assert.equal(candidates.count, 207);
        assert.equal((await fetch(url + '/matches/not-a-real-id')).status, 404);
        assert.equal((await fetch(url + '/matches/003')).status, 200);
        assert.equal((await fetch(url + '/matches/005')).status, 404);
        assert.equal((await fetch(url + '/styles/tokens.css')).status, 200);
        assert.equal((await fetch(url + '/shell.mjs')).status, 200);
    } finally {
        await workspace.stop();
    }
});
