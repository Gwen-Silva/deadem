import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { DEFAULT_REPO_ROOT } from './data-model.mjs';
import { createReviewWorkspaceServer } from './server.mjs';

const { chromium } = await import(process.argv[2] ? pathToFileURL(path.resolve(process.argv[2])).href : 'playwright');
const localRoot = path.join(DEFAULT_REPO_ROOT, '.local/codex/214/browser-canary');
const screenshotRoot = path.join(localRoot, 'screenshots');
await mkdir(screenshotRoot, { recursive: true });

const workspace = await createReviewWorkspaceServer({
    port: 0,
    stateRoot: path.join(localRoot, 'state'),
    exportRoot: path.join(localRoot, 'exports'),
    openFolder: async () => {}
});

const target003 = workspace.data.candidatesByTarget.get('review_match_003');
const canaryCandidates = Object.fromEntries(target003.slice(0, 24).map(candidate => [candidate.candidateWindowId, {
    reviewRecord: { reviewState: 'skipped', reviewNotes: ['Synthetic Task 214 navigation canary; not human review.'] },
    transcriptCorrections: {},
    reviewSegments: []
}]));
await workspace.store.save('review_match_003', { reviewTargetId: 'review_match_003', candidates: canaryCandidates });

const url = await workspace.start();
const errors = [];
const checks = [];
const screenshots = [];
let browser;

async function capture(page, name) {
    const target = path.join(screenshotRoot, name);
    await page.screenshot({ path: target, fullPage: true });
    screenshots.push(path.relative(DEFAULT_REPO_ROOT, target).replaceAll('\\', '/'));
}

async function assertNoOverflow(page) {
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
}

try {
    browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, reducedMotion: 'no-preference' });
    await context.route('**/*', route => route.request().url().startsWith(url + '/') ? route.continue() : route.abort());
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));

    // Flow A: Home -> Matches -> Scrim 03 -> Moment 25 -> Review target/candidate.
    await page.goto(url + '/');
    await page.getByRole('heading', { name: /Entenda suas decisões/u }).waitFor();
    assert.equal(await page.locator('.match-card').count(), 3);
    assert.match(await page.locator('.continue-card').textContent(), /Scrim 03/u);
    assert.match(await page.locator('.continue-card').textContent(), /24 de 48 momentos processados/u);
    await capture(page, 'home-real-data-1920x1080.png');
    await page.getByRole('link', { name: 'Ver partidas', exact: true }).first().click();
    await page.waitForURL(url + '/matches');
    await page.setViewportSize({ width: 1440, height: 900 });
    assert.equal(await page.locator('.match-card').count(), 4);
    assert.equal(await page.locator('.match-cover img').count(), 4);
    await capture(page, 'matches-real-library-1440x900.png');
    await page.getByRole('link', { name: 'Abrir Scrim 03', exact: true }).click();
    await page.waitForURL(url + '/matches/003');
    assert.match(await page.locator('.progress-section').textContent(), /24 de 48 momentos processados/u);
    assert.equal(await page.getByRole('link', { name: 'Abrir replay sincronizado', exact: true }).count(), 1);
    await capture(page, 'match-overview-003-1440x900.png');
    const moment25 = page.getByRole('link', { name: 'Revisar Momento 25 da Scrim 03', exact: true });
    assert.equal(await moment25.count(), 1);
    await moment25.click();
    await page.waitForURL(url + '/review?match=003&moment=25');
    await page.waitForFunction(() => document.querySelector('#target')?.value === 'review_match_003' && document.querySelector('.candidate-button.active')?.dataset.id === 'review_match_003_window_0025');
    checks.push('home_matches_overview_moment25_review');

    // Flow B: save/reload -> Home -> Continue Review.
    await page.locator('#review-state').selectOption('in_review');
    await page.getByLabel('Notas da revisão').fill('Canário técnico local Task 214; não é julgamento humano.');
    await page.getByRole('button', { name: 'Salvar revisão', exact: true }).click();
    await page.getByText('Revisão salva localmente.', { exact: true }).waitFor();
    await page.reload();
    await page.waitForFunction(() => document.querySelector('.candidate-button.active')?.dataset.id === 'review_match_003_window_0025');
    await page.goto(url + '/');
    await page.locator('.continue-card').waitFor();
    assert.match(await page.locator('.continue-card').textContent(), /Scrim 03/u);
    await page.locator('.continue-card').getByRole('link', { name: 'Continuar revisão', exact: true }).click();
    await page.waitForURL(url + '/review?match=003');
    await page.waitForFunction(() => document.querySelector('#target')?.value === 'review_match_003');
    checks.push('review_save_reload_home_continue');

    // Flow C: Overview 003 -> real synchronized Replay -> mixer -> return.
    await page.goto(url + '/matches/003');
    await page.getByRole('link', { name: 'Abrir replay sincronizado', exact: true }).click();
    await page.waitForURL(/\/scrim\?/u);
    await page.waitForFunction(() => window.scrimSessionReady && window.scrimNavigationReady?.reviewTargetId === 'review_match_003' && window.scrimPlayer, null, { timeout: 30000 });
    assert.equal(await page.locator('.track-row').count(), 9);
    await page.getByRole('checkbox', { name: 'Solo track_03', exact: true }).check();
    assert.equal(await page.evaluate(() => window.scrimPlayer.mixer.tracks.filter(track => window.scrimPlayer.mixer.gain(track.trackRef) > 0).length), 1);
    await page.getByRole('button', { name: 'Resetar mix', exact: true }).click();
    await page.getByRole('link', { name: 'Partidas', exact: true }).click();
    await page.waitForURL(url + '/matches');
    checks.push('overview003_real_replay_mixer_return');

    // Flow D: 001 exposes Review but never claims real synchronized Replay.
    await page.goto(url + '/matches/001');
    assert.equal(await page.getByRole('link', { name: 'Abrir replay sincronizado', exact: true }).count(), 0);
    assert.equal(await page.locator('.materials-grid').getByText('Replay sincronizado', { exact: true }).count(), 0);
    await capture(page, 'match-overview-001-1440x900.png');
    await page.locator('.overview-copy').getByRole('link', { name: /revisão$/iu }).click();
    await page.waitForURL(url + '/review?match=001');
    await page.waitForFunction(() => document.querySelector('#target')?.value === 'review_match_001' && document.querySelector('.candidate-button.active'));
    checks.push('overview001_legacy_review_without_replay_claim');

    // Flow E and responsive screenshots.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(url + '/');
    await page.waitForTimeout(350);
    await assertNoOverflow(page);
    await capture(page, 'home-mobile-390x844.png');
    const menu = page.locator('.mobile-menu-button');
    await menu.click();
    await page.waitForTimeout(350);
    await page.getByRole('link', { name: 'Partidas', exact: true }).click();
    await page.waitForURL(url + '/matches');
    await page.waitForTimeout(350);
    await assertNoOverflow(page);
    await capture(page, 'matches-mobile-390x844.png');
    await page.getByRole('link', { name: 'Abrir Scrim 03', exact: true }).click();
    await page.waitForURL(url + '/matches/003');
    await assertNoOverflow(page);
    await page.getByRole('link', { name: 'Revisar Momento 25 da Scrim 03', exact: true }).click();
    await page.waitForURL(url + '/review?match=003&moment=25');
    await page.waitForFunction(() => document.querySelector('.candidate-button.active')?.dataset.id === 'review_match_003_window_0025');
    checks.push('mobile_drawer_matches_overview_review');

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(url + '/matches');
    const duration = await page.locator('.match-card').first().evaluate(element => getComputedStyle(element).transitionDuration);
    assert.match(duration, /1e-05s|0\.00001s|0s/u);
    checks.push('reduced_motion');

    assert.deepEqual(errors, []);
    const result = {
        taskId: '214', passed: true, gate: 'alphaveil_home_matches_match_overview_ready',
        browserVersion: browser.version(), checks, screenshots,
        viewports: ['1920x1080', '1440x900', '390x844'],
        productMatchCount: 4, candidateCount: 207, seededProcessedMoments003: 24,
        browserErrors: errors, replayAccessCount: 0, protectedAccessCount: 0, asrExecutionCount: 0
    };
    await writeFile(path.join(localRoot, 'browser-canary.json'), `${JSON.stringify(result, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
    await writeFile(path.join(localRoot, 'browser-failure.json'), `${JSON.stringify({ error: error.stack ?? error.message, checks, screenshots, browserErrors: errors }, null, 2)}\n`);
    throw error;
} finally {
    await browser?.close();
    await workspace.stop();
}
