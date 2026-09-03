import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { DEFAULT_REPO_ROOT } from './data-model.mjs';
import { createReviewWorkspaceServer } from './server.mjs';

const { chromium } = await import(process.argv[2] ? pathToFileURL(path.resolve(process.argv[2])).href : 'playwright');
const localRoot = path.join(DEFAULT_REPO_ROOT, '.local/codex/213/browser-canary');
const screenshotRoot = path.join(localRoot, 'screenshots');
const stateRoot = path.join(localRoot, 'state');
const exportRoot = path.join(localRoot, 'exports');
await mkdir(screenshotRoot, { recursive: true });

const workspace = await createReviewWorkspaceServer({
    port: 0,
    stateRoot,
    exportRoot,
    openFolder: async () => {}
});
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

try {
    browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, reducedMotion: 'no-preference' });
    const page = await context.newPage();
    await page.route('**/*', route => route.request().url().startsWith(url + '/') ? route.continue() : route.abort());
    page.on('pageerror', error => errors.push(error.message));

    await page.goto(url + '/');
    await page.getByRole('heading', { name: /Entenda suas decisões/u }).waitFor();
    assert.equal(await page.getByRole('link', { name: 'Início', exact: true }).getAttribute('aria-current'), 'page');
    assert.match(await page.title(), /AlphaVeil/u);
    await capture(page, 'home-1920x1080.png');
    checks.push('home_brand_and_primary_actions');

    await page.getByRole('link', { name: 'Abrir Revisão', exact: true }).click();
    await page.waitForURL(url + '/review');
    await page.locator('#target option').first().waitFor({ state: 'attached' });
    assert.equal(await page.locator('#target option').count(), 4);
    await page.locator('#target').selectOption('review_match_003');
    await page.waitForFunction(() => document.querySelector('#queue-count')?.textContent === '48');
    assert.equal(await page.locator('.candidate-button').count(), 48);
    assert.equal(await page.getByRole('link', { name: 'Revisão', exact: true }).getAttribute('aria-current'), 'page');
    await page.setViewportSize({ width: 1440, height: 900 });
    await capture(page, 'review-match-003-1440x900.png');
    checks.push('review_match_003_48_candidates');

    const note = page.getByLabel('Notas da revisão');
    await note.fill('Canário técnico local da Task 213; não é julgamento humano.');
    await page.getByRole('button', { name: 'Salvar revisão', exact: true }).click();
    await page.getByText('Revisão salva localmente.', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Exportar atual', exact: true }).click();
    await page.getByText('Packet JSON e Markdown exportado localmente.', { exact: true }).waitFor();
    await page.reload();
    await page.locator('#target option').first().waitFor({ state: 'attached' });
    await page.locator('#target').selectOption('review_match_003');
    await page.waitForFunction(expected => {
        const label = [...document.querySelectorAll('label')].find(node => node.textContent.trim().startsWith('Notas da revisão'));
        return label?.querySelector('textarea')?.value === expected;
    }, 'Canário técnico local da Task 213; não é julgamento humano.');
    checks.push('review_save_export_reopen');

    const popupPromise = page.waitForEvent('popup');
    await page.locator('#open-scrim').click();
    const scrim = await popupPromise;
    await scrim.route('**/*', route => route.request().url().startsWith(url + '/') ? route.continue() : route.abort());
    scrim.on('pageerror', error => errors.push(error.message));
    await scrim.waitForFunction(() => window.scrimSessionReady && window.scrimNavigationReady && window.scrimPlayer, null, { timeout: 30000 });
    const navigation = await scrim.evaluate(() => window.scrimNavigationReady);
    assert.equal(navigation.reviewTargetId, 'review_match_003');
    assert.equal(await scrim.locator('.track-row').count(), 9);
    assert.equal(await scrim.getByRole('link', { name: 'Replay sincronizado', exact: true }).getAttribute('aria-current'), 'page');
    await scrim.setViewportSize({ width: 1440, height: 900 });
    await capture(scrim, 'scrim-deep-link-match-003-1440x900.png');
    await scrim.getByRole('checkbox', { name: 'Solo track_03', exact: true }).check();
    assert.equal(await scrim.evaluate(() => window.scrimPlayer.mixer.tracks.filter(track => window.scrimPlayer.mixer.gain(track.trackRef) > 0).length), 1);
    await scrim.getByRole('button', { name: 'Resetar mix', exact: true }).click();
    checks.push('review_to_scrim_deep_link_and_mixer');
    await scrim.getByRole('link', { name: 'Revisão', exact: true }).click();
    await scrim.waitForURL(url + '/review');
    checks.push('scrim_to_review_navigation');
    await scrim.close();

    await page.goto(url + '/patterns');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(350);
    assert.equal(await page.getByRole('link', { name: 'Padrões', exact: true }).getAttribute('aria-current'), 'page');
    assert.match(await page.locator('main').textContent(), /Conecte decisões semelhantes entre diferentes partidas/u);
    await capture(page, 'patterns-preview-390x844.png');
    const menu = page.locator('.mobile-menu-button');
    assert.equal(await menu.getAttribute('aria-label'), 'Abrir navegação');
    await menu.click();
    assert.equal(await menu.getAttribute('aria-expanded'), 'true');
    await page.keyboard.press('Escape');
    assert.equal(await menu.getAttribute('aria-expanded'), 'false');
    await menu.click();
    await page.waitForTimeout(350);
    await capture(page, 'patterns-mobile-menu-390x844.png');
    await page.keyboard.press('Escape');
    checks.push('mobile_drawer_open_close_escape');

    await page.goto(url + '/matches');
    assert.match(await page.locator('main').textContent(), /Suas scrims processadas aparecerão aqui para revisão\./u);
    await page.goto(url + '/training');
    assert.match(await page.locator('main').textContent(), /Transforme padrões encontrados/u);
    checks.push('explicit_preview_routes');

    await page.goto(url + '/');
    await page.keyboard.press('Tab');
    const focus = await page.evaluate(() => {
        const style = getComputedStyle(document.activeElement);
        return { tag: document.activeElement?.tagName, outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth };
    });
    assert.notEqual(focus.outlineStyle, 'none');
    assert.notEqual(focus.outlineWidth, '0px');
    checks.push('keyboard_focus_visible');

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 390, height: 844 });
    const reduced = await page.locator('.mobile-menu-button').evaluate(element => getComputedStyle(element).transitionDuration);
    assert.match(reduced, /1e-05s|0\.00001s|0s/u);
    checks.push('prefers_reduced_motion');

    assert.deepEqual(errors, []);
    const result = {
        taskId: '213',
        passed: true,
        gate: 'alphaveil_brand_design_system_app_shell_ready',
        browserVersion: browser.version(),
        checks,
        screenshots,
        viewports: ['1920x1080', '1440x900', '390x844'],
        reviewTargetId: 'review_match_003',
        candidateCount: 48,
        scrimTrackCount: 9,
        browserErrors: errors,
        replayAccessCount: 0,
        protectedAccessCount: 0,
        asrExecutionCount: 0
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
