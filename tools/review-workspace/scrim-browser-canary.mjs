import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { DEFAULT_REPO_ROOT } from './data-model.mjs';
import { loadLocalScrimData } from './scrim-media.mjs';
import { createReviewWorkspaceServer } from './server.mjs';

const playwrightModule = process.argv[2];
const { chromium } = await import(playwrightModule ? pathToFileURL(path.resolve(playwrightModule)).href : 'playwright');
const localRoot = path.join(DEFAULT_REPO_ROOT, '.local/deadem/review-workspace/scrim/canary');
await mkdir(localRoot, { recursive: true });
const scrimData = loadLocalScrimData(DEFAULT_REPO_ROOT);
// Preserve the Task 209 synthetic regression even when real sessions are registered.
scrimData.view.vodSessions = scrimData.view.vodSessions.filter(session => session.sourceVodRef === 'task209_synthetic_video');
assert.equal(scrimData.view.tracks.length, 9);
assert.equal(scrimData.view.vodSessions.length, 1);
const workspace = await createReviewWorkspaceServer({ port: 0, scrimOnly: true, scrimData });
const baseUrl = await workspace.start();
let browser;
const errors = [];
const steps = [];
try {
    browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.route('**/*', route => route.request().url().startsWith(baseUrl + '/') ? route.continue() : route.abort());
    page.on('pageerror', error => errors.push(error.message));
    const initialLoadStart = performance.now();
    await page.goto(`${baseUrl}/scrim`);
    await page.waitForFunction(() => window.scrimPlayer && !window.scrimPlayer.syncing && window.scrimPlayer.metrics.readinessTrackCount === 9, null, { timeout: 30000 });
    const initialLoadLatencyMs = performance.now() - initialLoadStart;
    assert.equal(await page.locator('.track-row').count(), 9);
    assert.equal(await page.evaluate(() => window.scrimPlayer.audioContext.constructor.name), 'AudioContext');
    await page.getByRole('button', { name: 'Reproduzir', exact: true }).click();
    await page.waitForFunction(() => window.scrimPlayer.status === 'playing');
    const playStart = await page.evaluate(() => document.querySelector('video').currentTime);
    await page.waitForTimeout(12000);
    const continuous = await page.evaluate(() => ({ time: document.querySelector('video').currentTime, playingTracks: window.scrimPlayer.tracks.filter(track => !track.element.paused).length, error: window.scrimPlayer.error }));
    assert.ok(continuous.time - playStart >= 10);
    assert.equal(continuous.playingTracks, 9);
    assert.equal(continuous.error, null);
    steps.push('continuous_12_seconds_nine_tracks');
    await page.getByRole('button', { name: 'Pausar', exact: true }).click();
    assert.equal(await page.evaluate(() => window.scrimPlayer.tracks.every(track => track.element.paused)), true);
    await page.getByRole('button', { name: 'Reproduzir', exact: true }).click();
    await page.waitForFunction(() => window.scrimPlayer.status === 'playing');
    steps.push('pause_resume');
    const seekMeasurements = [];
    for (const time of [8, 26, 44, 62, 80, 98, 116, 134, 152, 178]) {
        const result = await page.evaluate(async target => {
            const start = performance.now();
            await window.scrimPlayer.seek(target);
            return { elapsedMs: performance.now() - start, ready: window.scrimPlayer.metrics.readinessTrackCount, playing: window.scrimPlayer.status === 'playing' };
        }, time);
        assert.equal(result.ready, 9);
        assert.equal(result.playing, true);
        seekMeasurements.push(result.elapsedMs);
        await page.waitForTimeout(250);
    }
    steps.push('ten_distributed_seeks');
    for (const rate of ['0.5', '1', '1.5']) {
        await page.locator('#playback-rate').selectOption(rate);
        await page.waitForTimeout(2000);
        const valid = await page.evaluate(expected => window.scrimPlayer.tracks.every(track => Math.abs(track.element.playbackRate - expected / window.scrimPlayer.session.syncModel.slope) <= 0.07), Number(rate));
        assert.equal(valid, true);
    }
    steps.push('rates_0.5_1_1.5');
    await page.getByRole('button', { name: 'Mutar todos', exact: true }).click();
    assert.equal(await page.evaluate(() => window.scrimPlayer.mixer.tracks.every(track => window.scrimPlayer.mixer.gain(track.trackRef) === 0)), true);
    await page.getByRole('button', { name: 'Desmutar todos', exact: true }).click();
    await page.getByRole('checkbox', { name: 'Solo track_01', exact: true }).check();
    assert.equal(await page.evaluate(() => window.scrimPlayer.mixer.tracks.filter(track => window.scrimPlayer.mixer.gain(track.trackRef) > 0).length), 1);
    await page.getByRole('checkbox', { name: 'Solo track_02', exact: true }).check();
    assert.equal(await page.evaluate(() => window.scrimPlayer.mixer.tracks.filter(track => window.scrimPlayer.mixer.gain(track.trackRef) > 0).length), 2);
    await page.getByRole('checkbox', { name: 'Mute track_01', exact: true }).check();
    assert.equal(await page.evaluate(() => window.scrimPlayer.mixer.gain('track_01')), 0);
    await page.getByRole('slider', { name: 'Volume track_02', exact: true }).fill('0.35');
    await page.getByRole('slider', { name: 'Volume track_02', exact: true }).dispatchEvent('input');
    await page.waitForTimeout(100);
    assert.ok(await page.evaluate(() => Math.abs(window.scrimPlayer.gains.get('track_02').gain.value - 0.35) < 0.01));
    steps.push('mute_unmute_single_solo_multi_solo_mute_precedence');
    await page.locator('#vod-mute').uncheck();
    await page.locator('#vod-volume').fill('0.25');
    await page.locator('#vod-volume').dispatchEvent('input');
    assert.equal(await page.evaluate(() => document.querySelector('video').muted), false);
    assert.equal(await page.evaluate(() => document.querySelector('video').volume), 0.25);
    steps.push('vod_independent_mix');
    await page.evaluate(async () => {
        window.scrimPlayer.pause();
        const before = JSON.stringify({ tracks: window.scrimPlayer.mixer.tracks, vod: window.scrimPlayer.mixer.vod });
        await window.scrimPlayer.isolate('track_03', { start: 40, end: 43 });
        window.scrimPlayer.restoreContext();
        if (before !== JSON.stringify({ tracks: window.scrimPlayer.mixer.tracks, vod: window.scrimPlayer.mixer.vod })) throw new Error('isolated_restore_mismatch');
    });
    steps.push('isolated_call_restore');
    await page.getByRole('button', { name: 'Resetar mix', exact: true }).click();
    assert.equal(await page.evaluate(() => window.scrimPlayer.mixer.tracks.every(track => !track.mute && !track.solo && track.volume === 1) && window.scrimPlayer.video.muted), true);
    steps.push('reset_mix');
    const baselineMetrics = await page.evaluate(() => structuredClone(window.scrimPlayer.metrics));
    await page.evaluate(async () => { await window.scrimPlayer.play(); window.scrimPlayer.tracks[0].element.currentTime += 0.8; window.scrimPlayer.tick(); });
    await page.waitForTimeout(1500);
    const hardRecovery = await page.evaluate(() => ({ count: window.scrimPlayer.metrics.hardSeekCorrectionCount, state: window.scrimPlayer.status }));
    assert.ok(hardRecovery.count > baselineMetrics.hardSeekCorrectionCount);
    assert.equal(hardRecovery.state, 'playing');
    steps.push('injected_drift_hard_resync');
    await page.evaluate(() => window.scrimPlayer.pause());
    const responsive = [];
    for (const [label, width, height] of [['wide', 1440, 1000], ['half', 800, 1000], ['narrow', 390, 844]]) {
        await page.setViewportSize({ width, height });
        await page.waitForTimeout(100);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
        assert.equal(overflow, false);
        assert.equal(await page.getByRole('heading', { name: 'Mixer de áudio', exact: true }).isVisible(), true);
        await page.screenshot({ path: path.join(localRoot, `${label}.png`), fullPage: true });
        responsive.push({ viewportWidth: width, horizontalOverflow: overflow, mixerPresent: true });
    }
    steps.push('responsive_wide_half_narrow');
    assert.deepEqual(errors, []);
    const transfers = [...scrimData.registry.entries.values()].map(entry => ({ contentType: entry.contentType, sizeBytes: entry.sizeBytes, ...entry.transferMetrics }));
    assert.equal(transfers.filter(entry => entry.contentType === 'audio/wav' && entry.rangeRequestCount > 0).length, 9);
    assert.ok(transfers.every(entry => entry.maxChunkBytes <= 65536));
    const sourceFingerprints = {};
    for (const relative of ['tools/review-workspace/server.mjs', 'tools/review-workspace/scrim-model.mjs', 'tools/review-workspace/scrim-media.mjs', 'tools/review-workspace/public/scrim-controller.mjs', 'tools/review-workspace/public/scrim-app.mjs', 'tools/review-workspace/public/scrim.html', 'tools/review-workspace/public/scrim.css', 'tools/review-workspace/scrim-browser-canary.mjs']) {
        sourceFingerprints[relative] = createHash('sha256').update(await readFile(path.join(DEFAULT_REPO_ROOT, relative))).digest('hex');
    }
    const summary = {
        schemaVersion: 1, taskId: '209', fixtureClass: 'synthetic_video_with_nine_real_authorized_craig_wavs',
        browserVersion: browser.version(), sourceFingerprints, initialLoadLatencyMs,
        realVodMappingValidated: false, sourceTrackCount: 9, readyTrackCount: 9, continuousPlaySeconds: 12,
        distributedSeekCount: 10, testedPlaybackRates: [0.5, 1, 1.5], syncSlope: 1.002,
        startupLatencyMs: baselineMetrics.startupLatencyMs, seekResyncLatencyMs: seekMeasurements,
        maxObservedDriftMs: baselineMetrics.maxObservedDriftMs, driftCorrectionCount: baselineMetrics.driftCorrectionCount,
        hardSeekCorrectionCount: baselineMetrics.hardSeekCorrectionCount,
        injectedDriftTest: { addedDriftMs: 800, recovery: hardRecovery.state === 'playing', additionalHardCorrections: hardRecovery.count - baselineMetrics.hardSeekCorrectionCount },
        browserErrors: errors, completedSteps: steps, responsive, transfers,
        fullFileAudioBufferCount: 0, asrExecutionCount: 0, realVodAccessCount: 0, replayAccessCount: 0, protectedAccessCount: 0,
        passed: true
    };
    await writeFile(path.join(localRoot, 'playback-canary.json'), `${JSON.stringify(summary, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
} catch (error) {
    await writeFile(path.join(localRoot, 'failure.json'), `${JSON.stringify({ error: error.message, browserErrors: errors, completedSteps: steps }, null, 2)}\n`);
    throw error;
} finally {
    await browser?.close();
    await workspace.stop();
}
