export const REVIEW_FIELD_DEFINITIONS = Object.freeze([
    { key: 'facts', label: 'Informações confirmadas', kind: 'lines', placeholder: 'Um fato observado por linha' },
    { key: 'unknownInformation', label: 'Pontos incertos', kind: 'lines', placeholder: 'Uma incerteza por linha' },
    { key: 'teamCall', label: 'Call do time', kind: 'text', placeholder: 'Preenchimento humano; não inferir speaker' },
    { key: 'playerIntent', label: 'Intenção', kind: 'text', placeholder: 'Somente quando sustentada pela review humana' },
    { key: 'observedAction', label: 'Ação observada', kind: 'text', placeholder: 'Descreva apenas o que é observável' },
    { key: 'alternatives', label: 'Alternativas', kind: 'lines', placeholder: 'Uma alternativa por linha' },
    { key: 'immediateResult', label: 'Resultado imediato', kind: 'text', placeholder: 'Não confundir resultado com qualidade da decisão' },
    { key: 'longTermResult', label: 'Resultado de longo prazo', kind: 'text', placeholder: 'Deixe vazio quando não houver evidência' },
    { key: 'decisionQuality', label: 'Qualidade da decisão', kind: 'text', placeholder: 'Avaliação humana e justificada' },
    { key: 'executionQuality', label: 'Qualidade da execução', kind: 'text', placeholder: 'Avaliação humana e justificada' },
    { key: 'reviewNotes', label: 'Notas da revisão', kind: 'lines', placeholder: 'Uma nota por linha' }
]);

export function linesToText(value) {
    return Array.isArray(value) ? value.join('\n') : '';
}

export function textToLines(value) {
    return String(value ?? '').split(/\r?\n/u).map(line => line.trim()).filter(Boolean);
}

export function recordToForm(record) {
    return Object.fromEntries(REVIEW_FIELD_DEFINITIONS.map(field => [
        field.key,
        field.kind === 'lines' ? linesToText(record[field.key]) : record[field.key] ?? ''
    ]));
}

export function applyFormToRecord(record, values, errorClasses = []) {
    const next = structuredClone(record);
    for (const field of REVIEW_FIELD_DEFINITIONS) {
        next[field.key] = field.kind === 'lines' ? textToLines(values[field.key]) : String(values[field.key] ?? '').trim() || null;
    }
    next.errorClasses = [...errorClasses];
    return next;
}

export function responsiveMode(width) {
    if (!Number.isFinite(width) || width <= 0) throw new Error('invalid_viewport_width');
    if (width >= 1280) return 'wide';
    if (width >= 760) return 'medium';
    return 'narrow';
}

export async function copyExportPath(folderPath, clipboard) {
    if (typeof folderPath !== 'string' || folderPath.length === 0) throw new Error('export_path_unavailable');
    if (!clipboard?.writeText) throw new Error('clipboard_unavailable');
    await clipboard.writeText(folderPath);
    return folderPath;
}
