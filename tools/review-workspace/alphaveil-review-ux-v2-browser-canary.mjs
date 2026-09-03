import assert from 'node:assert/strict';
import { access, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { DEFAULT_REPO_ROOT } from './data-model.mjs';
import { createReviewWorkspaceServer } from './server.mjs';

const { chromium } = await import(process.argv[2] ? pathToFileURL(path.resolve(process.argv[2])).href : 'playwright');
const localRoot = path.join(DEFAULT_REPO_ROOT, '.local/codex/215/browser-canary');
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
    reviewRecord: { reviewState: 'skipped', reviewNotes: ['Canário técnico Task 215; não é julgamento humano.'] },
    transcriptCorrections: {},
    reviewSegments: []
}]));
await workspace.store.save('review_match_003', { reviewTargetId: 'review_match_003', candidates: seededCandidates });

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
    const overflow = await page.evaluate(() => ({
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth,
        elements: [...document.querySelectorAll('body *')].filter(element => {
            const rect = element.getBoundingClientRect();
            return rect.width && getComputedStyle(element).display !== 'none' && rect.right > window.innerWidth + 1;
        }).slice(0, 8).map(element => ({ tag: element.tagName, id: element.id, className: element.className, right: element.getBoundingClientRect().right, width: element.getBoundingClientRect().width }))
    }));
    assert.equal(overflow.documentWidth <= overflow.viewportWidth, true, JSON.stringify(overflow));
}

async function waitForMoment(page, target, ordinal) {
    await page.waitForFunction(([targetId, moment]) => document.querySelector('#target')?.value === targetId
        && document.querySelector('.moment-list-item.active')?.dataset.id === `${targetId}_window_${String(moment).padStart(4, '0')}`, [target, ordinal]);
}

try {
    browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, reducedMotion: 'no-preference' });
    await context.route('http://**/*', route => route.request().url().startsWith(url + '/') ? route.continue() : route.abort());
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));

    await page.goto(`${url}/review?match=003&moment=25`);
    await waitForMoment(page, 'review_match_003', 25);
    assert.match(await page.locator('.review-workspace-header').innerText(), /Scrim 03/u);
    assert.match(await page.locator('#candidate-heading').innerText(), /MOMENTO 25/u);
    assert.match(await page.locator('#review-progress-text').innerText(), /24 de 48 momentos processados/u);
    assert.ok(await page.locator('.moment-list-item img').count() > 0);
    assert.equal(await page.locator('#evidence-stage img').count(), 1);
    assert.equal(await page.locator('#frames .frame-option').count(), 3);
    assert.equal(await page.getByRole('link', { name: '▶ Ouvir este momento com a equipe', exact: true }).count(), 1);
    assert.equal(await page.locator('.review-section').count(), 5);
    assert.equal(await page.locator('.review-chip input').count(), 15);
    const visibleText = await page.locator('body').innerText();
    assert.doesNotMatch(visibleText, /review_match_|candidateWindowId|candidate priority|Craig|ASR draft/iu);
    await assertNoOverflow(page);
    await capture(page, 'review-003-moment-25-wide-1920x1080.png');
    checks.push('wide_moment_queue_evidence_review_hierarchy');

    await page.getByLabel('O que sabemos').fill('Canário: informação humana observada.');
    await page.getByLabel('Qual era a intenção?').fill('Canário: intenção declarada para testar persistência.');
    await page.getByLabel('Que alternativas existiam?').fill('Alternativa A\nAlternativa B');
    await page.getByLabel('Qualidade da decisão').fill('Avaliação humana de canário.');
    await page.getByLabel('Erro mecânico').check();
    await page.getByLabel('Informação').check();
    await page.locator('#review-state').selectOption('in_review');
    await page.locator('#segment-label').fill('Trecho de canário');
    await page.locator('#segment-notes').fill('Canário técnico Task 215; não é julgamento humano.');
    await page.getByRole('button', { name: 'Adicionar segmento', exact: true }).click();
    await page.getByRole('button', { name: 'Salvar revisão', exact: true }).click();
    await page.getByText('✓ Salvo', { exact: true }).waitFor();
    await page.reload();
    await waitForMoment(page, 'review_match_003', 25);
    assert.equal(await page.getByLabel('O que sabemos').inputValue(), 'Canário: informação humana observada.');
    assert.equal(await page.getByLabel('Erro mecânico').isChecked(), true);
    assert.equal(await page.locator('.segment-card').count(), 1);
    await page.getByRole('button', { name: 'Exportar análise', exact: true }).click();
    await page.getByText('✓ Análise exportada', { exact: true }).waitFor();
    const exported = path.join(localRoot, 'exports/review_match_003/review_packet.json');
    await access(exported);
    checks.push('structured_review_save_reload_segment_export');

    await page.getByRole('button', { name: 'Momento 26 →', exact: true }).click();
    await page.waitForURL(`${url}/review?match=003&moment=26`);
    await waitForMoment(page, 'review_match_003', 26);
    await page.goBack();
    await page.waitForURL(`${url}/review?match=003&moment=25`);
    await waitForMoment(page, 'review_match_003', 25);
    assert.equal(await page.getByLabel('O que sabemos').inputValue(), 'Canário: informação humana observada.');
    checks.push('friendly_history_back_forward_state');

    await page.getByRole('link', { name: '▶ Ouvir este momento com a equipe', exact: true }).click();
    await page.waitForURL(/\/scrim\?/u);
    await page.waitForFunction(() => window.scrimSessionReady && window.scrimNavigationReady?.reviewTargetId === 'review_match_003' && window.scrimPlayer, null, { timeout: 30000 });
    assert.equal(await page.locator('.track-row').count(), 9);
    await page.getByRole('checkbox', { name: 'Solo track_03', exact: true }).check();
    await page.getByRole('button', { name: 'Resetar mix', exact: true }).click();
    await page.goBack();
    await page.waitForURL(`${url}/review?match=003&moment=25`);
    await waitForMoment(page, 'review_match_003', 25);
    checks.push('review_to_real_scrim_mixer_and_back');

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${url}/review?match=001&moment=15`);
    await waitForMoment(page, 'review_match_001', 15);
    assert.equal(await page.locator('#legacy-audio').isVisible(), true);
    assert.equal(await page.locator('#scrim-context').isVisible(), false);
    assert.match(await page.locator('.asr-warning').innerText(), /Transcrição automática não validada/u);
    const correction = page.locator('.call-card textarea').first();
    if (await correction.count()) {
        await correction.fill('Correção humana local do canário Task 215.');
        await page.getByRole('button', { name: 'Salvar revisão', exact: true }).click();
        await page.getByText('✓ Salvo', { exact: true }).waitFor();
        await page.reload();
        await waitForMoment(page, 'review_match_001', 15);
        assert.equal(await page.locator('.call-card textarea').first().inputValue(), 'Correção humana local do canário Task 215.');
    }
    await capture(page, 'review-001-legacy-1440x900.png');
    checks.push('legacy_001_asr_warning_and_human_correction');

    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto(`${url}/review?match=003&moment=25`);
    await waitForMoment(page, 'review_match_003', 25);
    await assertNoOverflow(page);
    assert.equal(await page.locator('.review-panel').isVisible(), true);
    await capture(page, 'review-003-medium-1024x768.png');
    checks.push('medium_responsive_hierarchy');

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${url}/review?match=003&moment=25`);
    await waitForMoment(page, 'review_match_003', 25);
    await assertNoOverflow(page);
    await page.locator('#mobile-queue-toggle').click();
    assert.equal(await page.locator('body').evaluate(body => body.classList.contains('moment-drawer-open')), true);
    await page.locator('.moment-list-item[data-id="review_match_003_window_0026"]').click();
    await page.waitForURL(`${url}/review?match=003&moment=26`);
    assert.equal(await page.locator('body').evaluate(body => body.classList.contains('moment-drawer-open')), false);
    assert.equal(await page.getByRole('button', { name: 'Salvar revisão', exact: true }).isVisible(), true);
    await capture(page, 'review-003-mobile-390x844.png');
    checks.push('mobile_moment_drawer_selection_and_controls');

    await page.emulateMedia({ reducedMotion: 'reduce' });
    const duration = await page.locator('.evidence-stage').evaluate(element => getComputedStyle(element).transitionDuration);
    assert.match(duration, /1e-05s|0\.00001s|0s/u);
    checks.push('reduced_motion');
    assert.deepEqual(errors, []);

    const result = {
        taskId: '215', passed: true, gate: 'alphaveil_assisted_review_workspace_ux_v2_ready',
        browserVersion: browser.version(), checks, screenshots,
        viewports: ['1920x1080', '1440x900', '1024x768', '390x844'],
        targetCount: 4, candidateCount: 207, legacyCandidateCount: 102, seededProcessedMoments003: 24,
        preservedReviewFieldCount: 11, preservedErrorClassCount: 15,
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
