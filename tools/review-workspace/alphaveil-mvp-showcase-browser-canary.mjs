import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { DEFAULT_REPO_ROOT } from './data-model.mjs';
import { createReviewWorkspaceServer } from './server.mjs';

const { chromium } = await import(process.argv[2] ? pathToFileURL(path.resolve(process.argv[2])).href : 'playwright');
const localRoot = path.join(DEFAULT_REPO_ROOT, '.local/codex/217/browser-canary');
const screenshotRoot = path.join(localRoot, 'screenshots');
await mkdir(screenshotRoot, { recursive: true });

const workspace = await createReviewWorkspaceServer({
  port: 0,
  stateRoot: path.join(localRoot, 'state'),
  exportRoot: path.join(localRoot, 'exports'),
  openFolder: async () => {}
});
const target003 = workspace.data.candidatesByTarget.get('review_match_003');
const seededCandidates = Object.fromEntries(target003.slice(0, 24).map(candidate => [candidate.candidateWindowId, {
  reviewRecord: { reviewState: 'skipped', reviewNotes: ['Canário técnico local Task 217; não é julgamento humano.'] },
  transcriptCorrections: {},
  reviewSegments: []
}]));
await workspace.store.save('review_match_003', { reviewTargetId: 'review_match_003', candidates: seededCandidates });

const url = await workspace.start();
const checks = [];
const screenshots = [];
const browserErrors = [];
let browser;

async function capture(page, fileName) {
  const lazyImages = page.locator('img[loading="lazy"]');
  for (let index = 0; index < await lazyImages.count(); index += 1) {
    const image = lazyImages.nth(index);
    if (await image.isVisible()) await image.scrollIntoViewIfNeeded();
  }
  await page.waitForFunction(() => [...document.querySelectorAll('img[loading="lazy"]')]
    .filter(image => image.getClientRects().length > 0)
    .every(image => image.complete), null, { timeout: 10000 }).catch(() => {});
  await page.evaluate(() => scrollTo(0, 0));
  await page.waitForTimeout(80);
  const target = path.join(screenshotRoot, fileName);
  await page.screenshot({ path: target, fullPage: true });
  screenshots.push(path.relative(DEFAULT_REPO_ROOT, target).replaceAll('\\', '/'));
}

async function assertNoOverflow(page) {
  const result = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
    overflow: [...document.querySelectorAll('body *')].filter(element => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && getComputedStyle(element).display !== 'none' && rect.right > window.innerWidth + 1;
    }).slice(0, 6).map(element => ({ tag: element.tagName, id: element.id, className: String(element.className), right: element.getBoundingClientRect().right }))
  }));
  assert.ok(result.documentWidth <= result.viewportWidth, JSON.stringify(result));
}

async function waitForReview(page, matchId, momentNumber) {
  const targetId = `review_match_${matchId}`;
  await page.waitForFunction(([target, moment]) => document.querySelector('#target')?.value === target
    && document.querySelector('.moment-list-item.active')?.dataset.id === `${target}_window_${String(moment).padStart(4, '0')}`, [targetId, momentNumber]);
}

async function waitForReplay(page, matchId) {
  await page.waitForFunction(id => window.scrimSessionReady
    && window.scrimNavigationReady?.matchId === id
    && window.scrimPlayer
    && window.scrimPresentation?.match.id === id, matchId, { timeout: 30000 });
}

try {
  browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, reducedMotion: 'no-preference' });
  await context.route('http://**/*', route => route.request().url().startsWith(url + '/') ? route.continue() : route.abort());
  const page = await context.newPage();
  page.on('pageerror', error => browserErrors.push(error.message));

  // Loading state is observable before the real catalog replaces it.
  await page.route('**/api/product/matches', async route => {
    await new Promise(resolve => setTimeout(resolve, 1200));
    await route.continue();
  });
  const homeNavigation = page.goto(url + '/');
  await page.locator('.av-skeleton--hero').waitFor();
  assert.equal(await page.locator('#product-main').getAttribute('aria-busy'), 'true');
  await homeNavigation;
  await page.getByRole('heading', { name: /Entenda suas decisões/u }).waitFor();
  await page.unroute('**/api/product/matches');
  assert.equal(await page.locator('#product-main').getAttribute('aria-busy'), 'false');
  await assertNoOverflow(page);
  await capture(page, '01-home-hero-1920x1080.png');
  checks.push('home_loading_real_catalog_and_hero');

  // Central five-minute showcase flow.
  await page.getByRole('link', { name: 'Ver partidas', exact: true }).first().click();
  await page.waitForURL(url + '/matches');
  await page.setViewportSize({ width: 1440, height: 900 });
  assert.equal(await page.locator('.match-card').count(), 4);
  await assertNoOverflow(page);
  await capture(page, '02-matches-1440x900.png');

  await page.getByRole('link', { name: 'Abrir Scrim 03', exact: true }).click();
  await page.waitForURL(url + '/matches/003');
  assert.match(await page.locator('.progress-section').innerText(), /24 de 48 momentos processados/u);
  await assertNoOverflow(page);
  await capture(page, '03-match-overview-003-1440x900.png');

  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.getByRole('link', { name: 'Revisar Momento 25 da Scrim 03', exact: true }).click();
  await page.waitForURL(url + '/review?match=003&moment=25');
  await waitForReview(page, '003', 25);
  assert.equal(await page.locator('.review-section-fields label').count(), 11);
  assert.equal(await page.locator('.review-chip input').count(), 15);
  await assertNoOverflow(page);
  await capture(page, '04-review-moment-25-1920x1080.png');

  await page.getByRole('link', { name: '▶ Ouvir este momento com a equipe', exact: true }).click();
  await page.waitForURL(url + '/scrim?match=003&moment=25');
  await waitForReplay(page, '003');
  assert.equal(await page.locator('.moment-marker').count(), 48);
  assert.equal(await page.locator('.track-row').count(), 9);
  assert.equal(await page.getByRole('link', { name: 'Voltar para revisão', exact: true }).getAttribute('href'), '/review?match=003&moment=25');
  await assertNoOverflow(page);
  await capture(page, '05-replay-moment-25-1920x1080.png');

  await page.locator('.moment-marker[data-moment="26"]').click();
  await page.waitForURL(url + '/scrim?match=003&moment=26');
  assert.equal(await page.getByRole('link', { name: 'Voltar para revisão', exact: true }).getAttribute('href'), '/review?match=003&moment=26');
  await page.getByRole('link', { name: 'Voltar para revisão', exact: true }).click();
  await page.waitForURL(url + '/review?match=003&moment=26');
  await waitForReview(page, '003', 26);
  await page.locator('#overview-link').click();
  await page.waitForURL(url + '/matches/003');
  checks.push('overview_review_replay_marker26_contextual_roundtrip');

  await page.getByRole('link', { name: /Padrões/u }).click();
  await page.waitForURL(url + '/patterns');
  assert.match(await page.locator('.preview-page').innerText(), /Preview|PRÉVIA/iu);
  assert.match(await page.locator('.preview-page').innerText(), /Nenhum padrão é inferido/u);
  await capture(page, '06-patterns-preview-1440x900.png');
  await page.getByRole('link', { name: /Plano de treino/u }).click();
  await page.waitForURL(url + '/training');
  assert.match(await page.locator('.preview-page').innerText(), /Nenhuma recomendação automática está ativa/u);
  await capture(page, '07-training-preview-1440x900.png');
  checks.push('honest_patterns_and_training_previews');

  // Empty filter recovery uses only isolated state.
  await page.goto(url + '/matches');
  await page.getByRole('button', { name: 'Concluídas', exact: true }).click();
  await page.getByText('Nenhuma partida concluída ainda.', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Ver todas', exact: true }).click();
  assert.equal(await page.locator('.match-card').count(), 4);
  await page.goto(url + '/review?match=003&moment=25');
  await waitForReview(page, '003', 25);
  await page.getByLabel('Ir para momento').fill('9999');
  await page.getByText('Nenhum momento corresponde a este filtro.', { exact: true }).first().waitFor();
  await page.getByRole('button', { name: 'Limpar filtros', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('.moment-list-item').length === 48);
  checks.push('matches_and_review_empty_filter_recovery');

  // Controlled image failure remains usable and never reveals a URL/path.
  const failurePage = await context.newPage();
  failurePage.on('pageerror', error => browserErrors.push(error.message));
  await failurePage.route('**/media/**', route => route.abort('failed'));
  await failurePage.goto(url + '/matches');
  await failurePage.locator('.match-cover--fallback').first().waitFor();
  assert.equal(await failurePage.locator('.match-card').count(), 4);
  assert.doesNotMatch(await failurePage.locator('body').innerText(), /\/media\/|[A-Z]:[\\/]|ENOENT/iu);
  await failurePage.close();
  checks.push('controlled_image_failure_fallback');

  // Required medium and mobile layouts.
  await page.setViewportSize({ width: 1024, height: 768 });
  for (const route of ['/', '/matches/003', '/review?match=003&moment=25', '/scrim?match=003&moment=25']) {
    await page.goto(url + route);
    if (route.startsWith('/review')) await waitForReview(page, '003', 25);
    if (route.startsWith('/scrim')) await waitForReplay(page, '003');
    await assertNoOverflow(page);
  }
  checks.push('medium_1024_product_review_replay');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(url + '/');
  await page.getByRole('heading', { name: /Entenda suas decisões/u }).waitFor();
  await assertNoOverflow(page);
  await capture(page, '08-home-mobile-390x844.png');
  await page.goto(url + '/review?match=003&moment=25');
  await waitForReview(page, '003', 25);
  await page.locator('#mobile-queue-toggle').click();
  assert.equal(await page.locator('body').evaluate(body => body.classList.contains('moment-drawer-open')), true);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('body').evaluate(body => body.classList.contains('moment-drawer-open')), false);
  await assertNoOverflow(page);
  await capture(page, '09-review-mobile-390x844.png');
  await page.goto(url + '/scrim?match=004&moment=12');
  await waitForReplay(page, '004');
  assert.equal(await page.locator('.moment-marker').count(), 57);
  await assertNoOverflow(page);
  await capture(page, '10-replay-mobile-390x844.png');
  checks.push('mobile_home_review_replay_and_drawer');

  // Keyboard-only representative controls.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(url + '/');
  const matchesLink = page.locator('.product-nav a[href="/matches"]');
  await matchesLink.focus();
  await page.keyboard.press('Enter');
  await page.waitForURL(url + '/matches');
  const matchLink = page.getByRole('link', { name: 'Abrir Scrim 03', exact: true });
  await matchLink.focus();
  await page.keyboard.press('Enter');
  await page.waitForURL(url + '/matches/003');
  const reviewLink = page.locator('.overview-copy').getByRole('link', { name: 'Continuar revisão', exact: true });
  await reviewLink.focus();
  await page.keyboard.press('Enter');
  await page.waitForURL(url + '/review?match=003');
  await waitForReview(page, '003', 1);
  const queueMoment = page.locator('.moment-list-item').nth(1);
  await queueMoment.focus();
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Salvar revisão', exact: true }).focus();
  assert.equal(await page.getByRole('button', { name: 'Salvar revisão', exact: true }).evaluate(element => element === document.activeElement), true);
  await page.locator('#open-scrim').focus();
  await page.keyboard.press('Enter');
  await waitForReplay(page, '003');
  const marker = page.locator('.moment-marker').nth(1);
  await marker.focus();
  await page.keyboard.press('Enter');
  const solo = page.locator('.track-solo').first();
  await solo.focus();
  await page.keyboard.press('Space');
  assert.equal(await solo.isChecked(), true);
  const details = page.locator('.technical-sync-details summary');
  await details.focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('.technical-sync-details').getAttribute('open'), '');
  checks.push('keyboard_product_review_replay_marker_mixer_details');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(url + '/');
  const homeAnimation = await page.locator('.product-content').evaluate(element => getComputedStyle(element).animationName);
  assert.equal(homeAnimation, 'none');
  await page.goto(url + '/review?match=003&moment=25');
  await waitForReview(page, '003', 25);
  const reviewAnimation = await page.locator('.review-main').evaluate(element => getComputedStyle(element).animationName);
  assert.equal(reviewAnimation, 'none');
  await page.goto(url + '/scrim?match=003&moment=25');
  await waitForReplay(page, '003');
  const markerTransition = await page.locator('.moment-marker').first().evaluate(element => getComputedStyle(element).transitionDuration);
  assert.match(markerTransition, /1e-05s|0\.00001s|0s/u);
  checks.push('reduced_motion_product_review_replay');

  assert.deepEqual(browserErrors, []);
  const targetCounts = Object.fromEntries([...workspace.data.candidatesByTarget].map(([target, candidates]) => [target, candidates.length]));
  const result = {
    taskId: '217',
    passed: true,
    gate: 'alphaveil_mvp_showcase_polish_ready',
    browserVersion: browser.version(),
    checks,
    screenshots,
    viewports: ['1920x1080', '1440x900', '1024x768', '390x844'],
    surfacesValidated: ['home', 'matches', 'overview', 'review', 'replay', 'patterns_preview', 'training_preview'],
    presentationFlowPassed: true,
    desktopViewportsPassed: 3,
    mobileViewportsPassed: 1,
    keyboardFlowPassed: true,
    reducedMotionPassed: true,
    imageFallbackPassed: true,
    emptyStatesPassed: true,
    browserErrors,
    targetCount: Object.keys(targetCounts).length,
    momentCount: Object.values(targetCounts).reduce((sum, value) => sum + value, 0),
    legacyMomentCount: targetCounts.review_match_001 + targetCounts.review_match_002,
    replayMarkerCount003: 48,
    replayMarkerCount004: 57,
    reviewFieldCount: 11,
    errorClassCount: 15,
    trackCount: 9,
    replayAccessCount: 0,
    protectedAccessCount: 0,
    asrExecutionCount: 0,
    factualRegenerationCount: 0,
    versionedMediaCount: 0,
    task218Created: false
  };
  await writeFile(path.join(localRoot, 'browser-canary.json'), `${JSON.stringify(result, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  await writeFile(path.join(localRoot, 'browser-failure.json'), `${JSON.stringify({ error: error.stack ?? error.message, checks, screenshots, browserErrors }, null, 2)}\n`);
  throw error;
} finally {
  await browser?.close();
  await workspace.stop();
}
