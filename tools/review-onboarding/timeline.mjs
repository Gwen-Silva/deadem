import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import path from 'node:path';
import { ROOT, TARGETS, assertTarget } from './inputs.mjs';

export const ACCEPTED_TASK210 = 'aeb68e3ea6b9c5cc74b0f78171796728541b0b8b';
export const BRIDGE_DIR = 'output/local-replay-processing/craig-multitrack/task210-real-sync';
export const BRIDGE_FILES = ['match-003-sync-summary.json', 'match-004-sync-summary.json', 'validation-summary.json', 'gate.json', 'manifest.json'];
export const sha256 = data => crypto.createHash('sha256').update(data).digest('hex');
const finite = Number.isFinite;
const quantile = (values, p) => { const index = (values.length - 1) * p; const lo = Math.floor(index); return values[lo] + (values[Math.ceil(index)] - values[lo]) * (index - lo); };
export function metrics(rows) {
    if (!rows.length) throw new Error('empty_residuals');
    const abs = rows.map(row => Math.abs(row.residualSeconds)).sort((a, b) => a - b);
    return { count: rows.length, mae: abs.reduce((a, b) => a + b, 0) / abs.length, median: quantile(abs, 0.5), p90: quantile(abs, 0.9), max: abs.at(-1), rows };
}
export function validateAnchors(anchors) {
    const ids = new Set(), times = new Set();
    for (const a of anchors) {
        if (!a.anchorId || ids.has(a.anchorId) || times.has(a.replayElapsedSeconds)) throw new Error('duplicate_anchor_or_replay_time');
        if (!finite(a.replayElapsedSeconds) || a.replayElapsedSeconds < 0 || !finite(a.vodTimeSeconds) || a.vodTimeSeconds < 0 || !finite(a.uncertaintySeconds) || a.uncertaintySeconds < 0) throw new Error('invalid_anchor_time_or_uncertainty');
        if (!['fit', 'validation'].includes(a.role) || !a.evidence?.replay || !a.evidence?.vod || !a.region) throw new Error('incomplete_independent_anchor_evidence');
        ids.add(a.anchorId); times.add(a.replayElapsedSeconds);
    }
    for (const role of ['fit', 'validation']) {
        const selected = anchors.filter(a => a.role === role);
        if (selected.length < 6) throw new Error('six_fit_and_six_validation_required');
        for (const region of ['start', 'early', 'mid', 'late', 'end']) if (!selected.some(a => a.region === region)) throw new Error('anchors_not_distributed');
    }
}
export function fitModel(anchors, type) {
    const rows = anchors.filter(a => a.role === 'fit');
    if (rows.length < 2) throw new Error('insufficient_fit');
    const x = rows.reduce((s, a) => s + a.replayElapsedSeconds, 0) / rows.length;
    const y = rows.reduce((s, a) => s + a.vodTimeSeconds, 0) / rows.length;
    const denom = rows.reduce((s, a) => s + (a.replayElapsedSeconds - x) ** 2, 0);
    if (denom <= 0) throw new Error('degenerate_fit');
    if (!['offset_only', 'affine'].includes(type)) throw new Error('unsupported_model');
    const slope = type === 'offset_only' ? 1 : rows.reduce((s, a) => s + (a.replayElapsedSeconds - x) * (a.vodTimeSeconds - y), 0) / denom;
    if (!finite(slope) || slope <= 0) throw new Error('invalid_model_slope');
    return { selectedModel: type, slope, interceptSeconds: y - slope * x };
}
const predict = (m, x) => m.slope * x + m.interceptSeconds;
function residual(m, anchors, role) {
    return metrics(anchors.filter(a => a.role === role).map(a => ({ anchorId: a.anchorId, residualSeconds: a.vodTimeSeconds - predict(m, a.replayElapsedSeconds) })));
}
export function selectModel(anchors) {
    validateAnchors(anchors);
    const comparison = ['offset_only', 'affine'].map(type => { const m = fitModel(anchors, type); return { ...m, fit: residual(m, anchors, 'fit'), validation: residual(m, anchors, 'validation') }; });
    const [offset, affine] = comparison;
    const material = offset.validation.mae - affine.validation.mae >= 0.1 && affine.validation.mae <= offset.validation.mae * 0.8 && affine.validation.max <= offset.validation.max;
    const selected = material ? affine : offset;
    const precisionStatus = selected.validation.mae <= 0.5 && selected.validation.p90 <= 1 && selected.validation.max <= 2 ? 'preferred_precision' : selected.validation.mae <= 1 && selected.validation.p90 <= 2 && selected.validation.max <= 3 ? 'usable_limited_precision' : 'unusable_precision';
    return { ...selected, comparison, precisionStatus, selectionReason: material ? 'material_held_out_affine_gain_at_least_100ms_and_20percent_without_worse_max' : 'prefer_offset_no_material_held_out_affine_gain', fitAnchorCount: selected.fit.count, validationAnchorCount: selected.validation.count,
        estimatedOperationalReplayVodErrorSeconds: Math.max(selected.fit.max, selected.validation.max) + Math.max(...anchors.map(a => a.uncertaintySeconds)),
        operationalErrorPolicy: 'maximum_observed_residual_plus_largest_anchor_uncertainty_not_statistical_bound',
        coveredReplayRange: { start: Math.min(...anchors.map(a => a.replayElapsedSeconds)), end: Math.max(...anchors.map(a => a.replayElapsedSeconds)) },
        noExtrapolation: true };
}
export function selectSegmentedModel(groups, evidence, globalModel) {
    if (!evidence?.independentObservation || !evidence?.replayEvidence || !evidence?.vodEvidence || !Array.isArray(evidence.gaps) || !evidence.gaps.length) throw new Error('segmentation_requires_independent_discontinuity_evidence');
    const segments = groups.map(group => ({ ...selectModel(group.anchors), segmentId: group.segmentId })).sort((a, b) => a.coveredReplayRange.start - b.coveredReplayRange.start);
    for (let i = 1; i < segments.length; i++) if (segments[i - 1].coveredReplayRange.end >= segments[i].coveredReplayRange.start) throw new Error('overlapping_segments');
    const validation = metrics(segments.flatMap(s => s.validation.rows));
    if (globalModel.validation.mae - validation.mae < 0.1 || validation.mae > globalModel.validation.mae * 0.8 || validation.max > globalModel.validation.max) return globalModel;
    return { selectedModel: 'segmented', segments, validation, fit: metrics(segments.flatMap(s => s.fit.rows)), discontinuityEvidence: evidence, selectionReason: 'independently_observed_discontinuity_and_material_validation_gain', noExtrapolation: true };
}
export function mapReplayToVod(model, seconds) {
    if (!finite(seconds)) return { mapped: false, reason: 'invalid_replay_elapsed_seconds' };
    if (model.precisionStatus === 'unusable_precision') return { mapped: false, reason: 'mapping_precision_unusable' };
    if (model.selectedModel === 'segmented') {
        const s = model.segments.find(s => seconds >= s.coveredReplayRange.start && seconds <= s.coveredReplayRange.end);
        return s ? mapReplayToVod(s, seconds) : { mapped: false, reason: 'outside_covered_region' };
    }
    if (seconds < model.coveredReplayRange.start || seconds > model.coveredReplayRange.end) return { mapped: false, reason: 'outside_covered_region' };
    return { mapped: true, seconds: predict(model, seconds), operationalErrorSeconds: model.estimatedOperationalReplayVodErrorSeconds };
}
export function validateBridge(summary, target) {
    assertTarget(target);
    if (summary.taskId !== '210' || summary.reviewTargetId !== target || summary.associationSupported !== true || summary.validationUsedInFit !== false || !['preferred_precision', 'usable_limited_precision'].includes(summary.precisionStatus)) throw new Error('unaccepted_or_invalid_Task210_bridge');
    if (!finite(summary.slope) || summary.slope <= 0 || !finite(summary.interceptSeconds) || !finite(summary.estimatedOperationalSyncErrorSeconds) || summary.estimatedOperationalSyncErrorSeconds < 0) throw new Error('invalid_Task210_model');
    for (const range of [summary.craigRangeSeconds, summary.vodRangeSeconds]) if (!range || !finite(range.start) || !finite(range.end) || range.end <= range.start) throw new Error('invalid_Task210_coverage');
    for (const key of ['start', 'end']) if (Math.abs(summary.craigRangeSeconds[key] * summary.slope + summary.interceptSeconds - summary.vodRangeSeconds[key]) > 0.001) throw new Error('inconsistent_Task210_coverage');
    return { reviewTargetId: target, slope: summary.slope, interceptSeconds: summary.interceptSeconds, craigRangeSeconds: summary.craigRangeSeconds, vodRangeSeconds: summary.vodRangeSeconds, craigVodMappingErrorSeconds: summary.estimatedOperationalSyncErrorSeconds };
}
export async function loadTask210Bridges() {
    const artifacts = {}, identities = [];
    for (const name of BRIDGE_FILES) {
        const ref = `${BRIDGE_DIR}/${name}`;
        const bytes = await readFile(path.join(ROOT, ref));
        const accepted = execFileSync('git', ['show', `${ACCEPTED_TASK210}:${ref}`], { cwd: ROOT, windowsHide: true });
        if (!bytes.equals(accepted)) throw new Error('Task210_artifact_identity_mismatch');
        artifacts[name] = JSON.parse(bytes);
        identities.push({ path: ref, sha256: sha256(bytes), acceptedCommit: ACCEPTED_TASK210, identityStatus: 'byte_identical_to_accepted_commit' });
    }
    if (artifacts['gate.json'].technicalGateStatus !== 'two_real_craig_vod_sessions_synchronized_and_player_ready' || artifacts['validation-summary.json'].validatedSessionCount !== 2 || artifacts['manifest.json'].taskId !== '210' || artifacts['manifest.json'].inputVideoCount !== 2) throw new Error('Task210_bridge_gate_mismatch');
    return { identities, targets: TARGETS.map(id => ({ ...validateBridge(artifacts[`match-${id.slice(-3)}-sync-summary.json`], id), artifactRef: `${BRIDGE_DIR}/match-${id.slice(-3)}-sync-summary.json` })) };
}
export function mapReplayToReviewContext(timeline, { reviewTargetId, replayElapsedSeconds }) {
    assertTarget(reviewTargetId);
    const target = timeline.targets.find(t => t.reviewTargetId === reviewTargetId);
    if (!target) throw new Error('target_timeline_unavailable');
    const vod = mapReplayToVod(target.replayVodModel, replayElapsedSeconds);
    const semantics = { replay: 'replay_elapsed_time', vod: 'vod_media_time', craig: 'craig_recording_time' };
    if (!vod.mapped) return { replayElapsedSeconds, vod, craig: { mapped: false, reason: vod.reason }, semantics };
    const b = target.task210Bridge;
    const recordingSeconds = (vod.seconds - b.interceptSeconds) / b.slope;
    const craig = vod.seconds < b.vodRangeSeconds.start || vod.seconds > b.vodRangeSeconds.end || recordingSeconds < b.craigRangeSeconds.start || recordingSeconds > b.craigRangeSeconds.end
        ? { mapped: false, reason: 'outside_covered_region' }
        : { mapped: true, recordingSeconds, operationalErrorSeconds: (vod.operationalErrorSeconds + b.craigVodMappingErrorSeconds) / Math.abs(b.slope) };
    return { replayElapsedSeconds, vod, craig, semantics };
}
