import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { DEFAULT_REPO_ROOT } from './data-model.mjs';
import { loadLocalScrimData } from './scrim-media.mjs';
import { createReviewWorkspaceServer } from './server.mjs';

const { chromium } = await import(process.argv[2] ? pathToFileURL(path.resolve(process.argv[2])).href : 'playwright');
const local = path.join(DEFAULT_REPO_ROOT, '.local/deadem/review-workspace/scrim/real-sync-task210');
await mkdir(local, { recursive: true });
const data = loadLocalScrimData(DEFAULT_REPO_ROOT);
const sessions = data.view.vodSessions.filter(row => row.syncStatus === 'validated');
assert.equal(sessions.length, 2);
assert.equal(data.view.tracks.length, 9);
const workspace = await createReviewWorkspaceServer({ port: 0, scrimOnly: true, scrimData: data });
const url = await workspace.start();
const errors = [];
const results = [];
let browser;
try {
    browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    await page.route('**/*', route => route.request().url().startsWith(url + '/') ? route.continue() : route.abort());
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${url}/scrim`);
    await page.waitForFunction(() => window.scrimSessionReady && window.scrimPlayer && !window.scrimPlayer.syncing, null, { timeout: 30000 });
    assert.equal(await page.locator('#session-select option').count(), 3);
    for (const session of sessions) {
        await page.locator('#session-select').selectOption(session.vodSessionId);
        await page.waitForFunction(id => window.scrimSessionReady && window.scrimPlayer?.session.vodSessionId === id && !window.scrimPlayer.syncing, session.vodSessionId);
        assert.equal(await page.locator('.track-row').count(), 9);
        assert.doesNotMatch(await page.locator('#mapping-detail').textContent(), /fixture/u);
        const regions = [];
        for (const [region, vodTime] of [['start', session.vodRange.start + 15], ['middle', (session.vodRange.start + session.vodRange.end) / 2], ['end', session.vodRange.end - 18]]) {
            const before = await page.evaluate(async time => {
                const controller = window.scrimPlayer;
                controller.pause();
                const started = performance.now();
                await controller.seek(time);
                const seekLatencyMs = performance.now() - started;
                await controller.play();
                if (controller.error) throw new Error(controller.error);
                return { seekLatencyMs, vodStart: controller.video.currentTime };
            }, vodTime);
            assert.ok(Math.abs(before.vodStart - vodTime) < 0.1, 'seek_must_reach_requested_region');
            await page.waitForFunction(() => window.scrimPlayer.status === 'playing');
            await page.waitForTimeout(6000);
            const after = await page.evaluate(() => {
                const controller = window.scrimPlayer;
                const desired = (controller.video.currentTime - controller.session.syncModel.interceptSeconds) / controller.session.syncModel.slope;
                const active = controller.tracks.filter(track => controller.active(track, desired));
                return { vodEnd: controller.video.currentTime, status: controller.status, error: controller.error,
                    activeTrackCount: active.length, playingTrackCount: active.filter(track => !track.element.paused).length,
                    outsideTrackCount: controller.tracks.length - active.length, readyTrackCount: controller.metrics.readinessTrackCount,
                    currentTransportDriftMs: Math.max(...active.map(track => Math.abs((track.element.currentTime - desired) * 1000))),
                    videoDecodedFrames: controller.video.getVideoPlaybackQuality().totalVideoFrames,
                    vodAudioDecodedBytes: controller.video.webkitAudioDecodedByteCount ?? null };
            });
            assert.equal(after.error, null);
            assert.equal(after.status, 'playing');
            assert.ok(after.vodEnd - before.vodStart >= 5);
            assert.equal(after.activeTrackCount, after.playingTrackCount);
            assert.ok(after.currentTransportDriftMs < 300);
            assert.ok(after.videoDecodedFrames > 0);
            await page.screenshot({ path: path.join(local, `${session.reviewTargetId}-${region}-browser.png`), fullPage: true });
            regions.push({ region, requestedVodTimeSeconds: vodTime, ...before, ...after });
        }
        await page.getByRole('button', { name: 'Pausar', exact: true }).click();
        assert.equal(await page.evaluate(() => window.scrimPlayer.tracks.every(track => track.element.paused)), true);
        await page.getByRole('button', { name: 'Reproduzir', exact: true }).click();
        await page.waitForFunction(() => window.scrimPlayer.status === 'playing');
        await page.evaluate(async () => { await window.scrimPlayer.seek((window.scrimPlayer.session.vodRange.start + window.scrimPlayer.session.vodRange.end) / 2); });
        await page.locator('#playback-rate').selectOption('1.5');
        await page.waitForTimeout(3000);
        assert.equal(await page.evaluate(() => window.scrimPlayer.tracks.every(track => Math.abs(track.element.playbackRate - 1.5 / window.scrimPlayer.session.syncModel.slope) < 0.07)), true);
        await page.locator('#playback-rate').selectOption('1');
        await page.getByRole('checkbox', { name: 'Solo track_03', exact: true }).check();
        assert.equal(await page.evaluate(() => window.scrimPlayer.mixer.tracks.filter(track => window.scrimPlayer.mixer.gain(track.trackRef) > 0).length), 1);
        await page.getByRole('checkbox', { name: 'Solo track_06', exact: true }).check();
        assert.equal(await page.evaluate(() => window.scrimPlayer.mixer.tracks.filter(track => window.scrimPlayer.mixer.gain(track.trackRef) > 0).length), 2);
        await page.getByRole('checkbox', { name: 'Mute track_03', exact: true }).check();
        assert.equal(await page.evaluate(() => window.scrimPlayer.mixer.gain('track_03')), 0);
        await page.locator('#vod-mute').uncheck();
        await page.locator('#vod-volume').fill('0.25');
        await page.locator('#vod-volume').dispatchEvent('input');
        await page.waitForTimeout(1500);
        assert.equal(await page.evaluate(() => !window.scrimPlayer.video.muted && window.scrimPlayer.video.volume === 0.25), true);
        await page.getByRole('button', { name: 'Resetar mix', exact: true }).click();
        await page.evaluate(() => window.scrimPlayer.pause());
        const metrics = await page.evaluate(() => structuredClone(window.scrimPlayer.metrics));
        const summary = JSON.parse(await readFile(path.join(DEFAULT_REPO_ROOT, `output/local-replay-processing/craig-multitrack/task210-real-sync/match-${session.reviewTargetId.slice(-3)}-sync-summary.json`), 'utf8'));
        results.push({ reviewTargetId: session.reviewTargetId, passed: true, regions, sourceTrackCount: 9,
            mappingResidualMs: { mae: summary.validationResidual.mae * 1000, median: summary.validationResidual.median * 1000,
                p90: summary.validationResidual.p90 * 1000, max: summary.validationResidual.max * 1000 },
            transportDriftMs: { maxObserved: metrics.maxObservedDriftMs, driftCorrectionCount: metrics.driftCorrectionCount, hardSeekCorrectionCount: metrics.hardSeekCorrectionCount },
            startupLatencyMs: metrics.startupLatencyMs, seekResyncLatencyMs: metrics.seekResyncLatencyMs,
            testedRates: [1, 1.5], controlsPassed: ['real_session_selection', 'play_pause', 'seek', 'mute', 'solo', 'multi_solo', 'vod_audio', 'reset_mix'],
            perceptualEvidence: 'decoded_real_video_frames_inspected_and_audio_transport_measured', humanListeningJudgment: 'not_performed_no_perceptual_perfection_claim' });
        console.log(JSON.stringify(results.at(-1), null, 2));
    }
    await page.evaluate(() => window.openScrimPlayer({ reviewTargetId: 'review_match_003', vodTimeSeconds: 100, preRollSeconds: 10 }));
    assert.equal(await page.locator('#session-select').inputValue(), 'task210_review_match_003_session');
    assert.deepEqual(errors, []);
    const sourceFingerprints = {};
    for (const relative of ['tools/review-workspace/server.mjs', 'tools/review-workspace/scrim-model.mjs', 'tools/review-workspace/scrim-media.mjs', 'tools/review-workspace/public/scrim-controller.mjs', 'tools/review-workspace/public/scrim-app.mjs', 'tools/review-workspace/real-sync-browser-canary.mjs']) {
        sourceFingerprints[relative] = createHash('sha256').update(await readFile(path.join(DEFAULT_REPO_ROOT, relative))).digest('hex');
    }
    const sessionFingerprint = createHash('sha256').update(await readFile(path.join(local, 'sessions.json'))).digest('hex');
    const transfers = [...data.registry.entries.values()].map(entry => ({ contentType: entry.contentType, ...entry.transferMetrics }));
    assert.ok(transfers.every(entry => entry.maxChunkBytes <= 65536));
    assert.equal(transfers.filter(entry => entry.contentType === 'video/mp4' && entry.rangeRequestCount > 0).length, 2);
    await writeFile(path.join(local, 'browser-canary.json'), JSON.stringify({ taskId: '210', passed: true,
        browserVersion: browser.version(), sourceFingerprints, sessionFingerprint, results, browserErrors: errors, transfers,
        replayAccessCount: 0, asrExecutionCount: 0 }, null, 2) + '\n');
} catch (error) {
    await writeFile(path.join(local, 'browser-failure.json'), JSON.stringify({ error: error.message, results, browserErrors: errors }, null, 2) + '\n');
    throw error;
} finally {
    await browser?.close();
    await workspace.stop();
}
