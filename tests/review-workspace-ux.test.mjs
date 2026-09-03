import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { DEFAULT_REPO_ROOT } from '../tools/review-workspace/data-model.mjs';
import { resolveExportFolder } from '../tools/review-workspace/server.mjs';
import {
    REVIEW_FIELD_DEFINITIONS,
    applyFormToRecord,
    copyExportPath,
    recordToForm,
    responsiveMode
} from '../tools/review-workspace/ux-model.mjs';

const publicRoot = path.join(DEFAULT_REPO_ROOT, 'tools/review-workspace/public');

test('structured PT-BR review is primary and raw JSON remains advanced', async () => {
    const html = await readFile(path.join(publicRoot, 'index.html'), 'utf8');
    const appSource = await readFile(path.join(publicRoot, 'app.js'), 'utf8');
    const uxModelSource = await readFile(path.join(DEFAULT_REPO_ROOT, 'tools/review-workspace/ux-model.mjs'), 'utf8');
    const interfaceSource = `${html}\n${appSource}\n${uxModelSource}`;
    for (const label of [
        'Informações confirmadas', 'Pontos incertos', 'Call do time', 'Intenção', 'Ação observada',
        'Alternativas', 'Resultado imediato', 'Resultado de longo prazo', 'Qualidade da decisão',
        'Qualidade da execução', 'Avaliação do momento', 'Notas da revisão'
    ]) assert.match(interfaceSource, new RegExp(label, 'u'));
    assert.match(html, /<details class="advanced-mode">[\s\S]*Registro bruto da revisão/u);
    assert.match(html, /Os momentos servem para direcionar sua atenção/u);
    assert.match(html, /não são erros, eventos ou conclusões confirmadas automaticamente/u);
    assert.equal(REVIEW_FIELD_DEFINITIONS.length, 11);
});

test('structured form roundtrip preserves advanced fields and error vocabulary values', () => {
    const original = {
        facts: ['fato'], unknownInformation: [], alternatives: [], reviewNotes: [], errorClasses: [],
        reviewState: 'in_review', evidenceRefs: ['ref-1'], confidence: 0.5, visualRelevance: 'human_only'
    };
    const values = recordToForm(original);
    values.unknownInformation = 'incerteza 1\nincerteza 2';
    values.teamCall = 'call preenchida por humano';
    const result = applyFormToRecord(original, values, ['uncertain']);
    assert.deepEqual(result.unknownInformation, ['incerteza 1', 'incerteza 2']);
    assert.equal(result.teamCall, 'call preenchida por humano');
    assert.deepEqual(result.errorClasses, ['uncertain']);
    assert.deepEqual(result.evidenceRefs, ['ref-1']);
    assert.equal(result.confidence, 0.5);
});

test('responsive contract distinguishes wide, medium and narrow widths', async () => {
    const css = await readFile(path.join(publicRoot, 'styles.css'), 'utf8');
    const reviewCss = await readFile(path.join(publicRoot, 'styles/review.css'), 'utf8');
    assert.equal(responsiveMode(1440), 'wide');
    assert.equal(responsiveMode(960), 'medium');
    assert.equal(responsiveMode(600), 'narrow');
    assert.match(reviewCss, /@media \(max-width: 1279px\)/u);
    assert.match(reviewCss, /@media \(max-width: 759px\)/u);
    assert.match(css, /--primary: #8b5cf6/u);
    assert.match(css, /--focus: #c4b5fd/u);
});

test('copy path uses only the server-produced value', async () => {
    let copied = null;
    const clipboard = { async writeText(value) { copied = value; } };
    const location = resolveExportFolder(path.join(DEFAULT_REPO_ROOT, '.local/deadem/review-workspace/exports'), 'review_match_001');
    await copyExportPath(location.folderPath, clipboard);
    assert.equal(copied, location.folderPath);
    await assert.rejects(() => copyExportPath('', clipboard), /export_path_unavailable/u);
});

test('export folder resolver is target-allowlisted and cannot accept traversal', () => {
    const root = path.join(DEFAULT_REPO_ROOT, '.local/deadem/review-workspace/exports');
    const result = resolveExportFolder(root, 'review_match_002');
    assert.equal(path.dirname(result.folderPath), path.resolve(root));
    assert.throws(() => resolveExportFolder(root, '../replay_005'), /target_not_allowlisted/u);
});
