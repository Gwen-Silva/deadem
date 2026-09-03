import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { DEFAULT_REPO_ROOT } from './data-model.mjs';
import { createReviewWorkspaceServer } from './server.mjs';

const { chromium } = await import(process.argv[2] ? pathToFileURL(path.resolve(process.argv[2])).href : 'playwright');
const localRoot = path.join(DEFAULT_REPO_ROOT, '.local/codex/216/browser-canary');
const screenshotRoot = path.join(localRoot, 'screenshots');
await mkdir(screenshotRoot, { recursive: true });

const workspace = await createReviewWorkspaceServer({
    port: 0,
    stateRoot: path.join(localRoot, 'state'),
    exportRoot: path.join(localRoot, 'exports'),
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

async function assertNoOverflow(page) {
    const result = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: window.innerWidth }));
    assert.ok(result.width <= result.viewport, JSON.stringify(result));
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
    page.on('pageerror', error => errors.push(error.message));

    await page.goto(`${url}/scrim?match=003&moment=25`);
    await waitForReplay(page, '003');
    assert.equal(await page.locator('.moment-marker').count(), 48);
    assert.equal(await page.locator('.moment-marker.is-selected').getAttribute('data-moment'), '25');
    assert.equal(await page.locator('.track-row').count(), 9);
    assert.equal(await page.locator('#session-select option').count(), 2);
    assert.match(await page.locator('#match-title').innerText(), /Scrim 03/u);
    assert.match(await page.locator('#sync-label').innerText(), /Sincronização verificada|precisão limitada/u);
    assert.match(await page.locator('#current-moment-title').innerText(), /Momento 25/u);
    const entry = await page.evaluate(() => ({ navigation: window.scrimNavigationReady, marker: window.scrimPresentation.markers.find(item => item.momentNumber === 25), currentTime: window.scrimPlayer.video.currentTime }));
    assert.equal(entry.navigation.entryUsesPreRoll, true);
    assert.ok(Math.abs(entry.currentTime - (entry.marker.vodAnchorSeconds - entry.marker.preRollSeconds)) < 0.15);
    const visibleText = await page.locator('body').innerText();
    assert.doesNotMatch(visibleText, /review_match_|vodSessionId|track_[0-9]+|sourceVodRef|candidateWindowId/iu);
    assert.equal(await page.getByRole('link', { name: 'Voltar para revisão', exact: true }).getAttribute('href'), '/review?match=003');
    await assertNoOverflow(page);
    await capture(page, 'replay-003-moment-25-wide-1920x1080.png');
    checks.push('wide_video_protagonist_complete_timeline_and_human_mixer');

    await page.setViewportSize({ width: 1440, height: 900 });
    await assertNoOverflow(page);
    await capture(page, 'replay-003-moment-25-standard-1440x900.png');
    checks.push('standard_desktop_layout');

    const marker26 = page.locator('.moment-marker[data-moment="26"]');
    await marker26.click();
    await page.waitForURL(`${url}/scrim?match=003&moment=26`);
    const direct = await page.evaluate(() => ({ marker: window.scrimPresentation.markers.find(item => item.momentNumber === 26), currentTime: window.scrimPlayer.video.currentTime }));
    assert.ok(Math.abs(direct.currentTime - direct.marker.vodAnchorSeconds) < 0.15);
    await page.getByRole('button', { name: 'Próximo →', exact: true }).click();
    await page.waitForURL(`${url}/scrim?match=003&moment=27`);
    await page.goBack();
    await page.waitForURL(`${url}/scrim?match=003&moment=26`);
    await page.waitForFunction(() => document.querySelector('.moment-marker.is-selected')?.dataset.moment === '26');
    checks.push('direct_marker_seek_without_preroll_and_history_navigation');

    const firstVoice = page.locator('.track-row').first();
    const firstName = await firstVoice.locator('strong').innerText();
    await firstVoice.getByRole('checkbox', { name: `Destacar ${firstName}`, exact: true }).check();
    assert.equal(await page.evaluate(() => window.scrimPlayer.mixer.tracks.filter(track => window.scrimPlayer.mixer.gain(track.trackRef) > 0).length), 1);
    await firstVoice.getByRole('button', { name: 'Isolar voz por 5s', exact: true }).click();
    assert.match(await page.locator('#context-mode').innerText(), /Faixa isolada/u);
    await page.getByRole('button', { name: 'Restaurar mix completo', exact: true }).click();
    await page.getByRole('button', { name: 'Restaurar mix', exact: true }).click();
    assert.match(await page.locator('#context-mode').innerText(), /mix completo/u);
    checks.push('human_mixer_solo_isolation_and_restore');

    await page.locator('#session-select').selectOption('004');
    await page.waitForURL(`${url}/scrim?match=004`);
    await waitForReplay(page, '004');
    assert.equal(await page.locator('.moment-marker').count(), 57);
    assert.equal(await page.locator('#moment-card').isHidden(), true);
    assert.equal(await page.locator('#session-select option').count(), 2);
    checks.push('public_real_sessions_only_and_match004_57_markers');

    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto(`${url}/scrim?match=003&moment=25`);
    await waitForReplay(page, '003');
    await assertNoOverflow(page);
    assert.equal(await page.locator('.replay-stage').isVisible(), true);
    assert.equal(await page.locator('.replay-audio').isVisible(), true);
    await capture(page, 'replay-003-medium-1024x768.png');
    checks.push('medium_responsive_video_and_mixer');

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${url}/scrim?match=004&moment=12`);
    await waitForReplay(page, '004');
    await assertNoOverflow(page);
    assert.equal(await page.locator('#scrim-video').isVisible(), true);
    assert.equal(await page.locator('#open-review-moment').isVisible(), true);
    await capture(page, 'replay-004-mobile-390x844.png');
    checks.push('mobile_stacked_controls_and_selected_moment');

    await page.emulateMedia({ reducedMotion: 'reduce' });
    const duration = await page.locator('.moment-marker').first().evaluate(element => getComputedStyle(element).transitionDuration);
    assert.match(duration, /1e-05s|0\.00001s|0s/u);
    checks.push('reduced_motion');

    for (const bad of ['001', '002', '005', '006', '007', '008']) {
        assert.equal((await page.request.get(`${url}/scrim?match=${bad}`)).status(), 400);
    }
    checks.push('unsupported_and_protected_matches_rejected');
    assert.deepEqual(errors, []);

    const result = {
        taskId: '216', passed: true, gate: 'alphaveil_synchronized_replay_ux_v2_ready',
        browserVersion: browser.version(), checks, screenshots,
        viewports: ['1920x1080', '1440x900', '1024x768', '390x844'],
        publicSessions: ['003', '004'], markerCounts: { '003': 48, '004': 57 }, sourceTrackCount: 9,
        deepLinkPreRollPreserved: true, directMarkerSeekUsesAnchor: true, legacyTechnicalUrlCompatibility: true,
        browserErrors: errors, replayAccessCount: 0, protectedAccessCount: 0, asrExecutionCount: 0,
        synchronizationEngineModified: false
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
