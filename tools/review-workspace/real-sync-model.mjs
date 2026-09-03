// Audio clock mapping only. Human recollections and visual clocks are not fit data.
const finite = Number.isFinite;
export function quantile(values, fraction) {
    const sorted = [...values].sort((a, b) => a - b);
    if (!sorted.length) throw new Error('empty_metric_population');
    const position = (sorted.length - 1) * fraction;
    const lower = Math.floor(position);
    return sorted[lower] + (sorted[Math.ceil(position)] - sorted[lower]) * (position - lower);
}

export function residualMetrics(anchors, model) {
    const rows = anchors.map(anchor => ({ anchorId: anchor.anchorId, craigTimeSeconds: anchor.craigTimeSeconds,
        residualSeconds: model.slope * anchor.craigTimeSeconds + model.interceptSeconds - anchor.vodTimeSeconds }));
    const absolute = rows.map(row => Math.abs(row.residualSeconds));
    return { mae: absolute.reduce((a, b) => a + b, 0) / absolute.length,
        median: quantile(absolute, 0.5), p90: quantile(absolute, 0.9), max: Math.max(...absolute), rows };
}

function fitOffset(rows) {
    return { slope: 1, interceptSeconds: quantile(rows.map(row => row.vodTimeSeconds - row.craigTimeSeconds), 0.5) };
}

function fitAffine(rows) {
    const x = rows.reduce((sum, row) => sum + row.craigTimeSeconds, 0) / rows.length;
    const y = rows.reduce((sum, row) => sum + row.vodTimeSeconds, 0) / rows.length;
    let numerator = 0;
    let denominator = 0;
    for (const row of rows) {
        numerator += (row.craigTimeSeconds - x) * (row.vodTimeSeconds - y);
        denominator += (row.craigTimeSeconds - x) ** 2;
    }
    if (denominator <= 0) throw new Error('fit_time_span_required');
    const slope = numerator / denominator;
    return { slope, interceptSeconds: y - slope * x };
}

function fitOutlierFilter(rows) {
    // Robust initializer uses fit anchors exclusively, never validation residuals.
    const slopes = [];
    for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) {
        const delta = rows[j].craigTimeSeconds - rows[i].craigTimeSeconds;
        if (Math.abs(delta) > 1) slopes.push((rows[j].vodTimeSeconds - rows[i].vodTimeSeconds) / delta);
    }
    const slope = quantile(slopes, 0.5);
    const interceptSeconds = quantile(rows.map(row => row.vodTimeSeconds - slope * row.craigTimeSeconds), 0.5);
    const errors = rows.map(row => row.vodTimeSeconds - slope * row.craigTimeSeconds - interceptSeconds);
    const median = quantile(errors, 0.5);
    const mad = quantile(errors.map(error => Math.abs(error - median)), 0.5);
    const threshold = Math.max(0.5, 4.5 * 1.4826 * mad);
    return { kept: rows.filter((row, i) => Math.abs(errors[i] - median) <= threshold),
        rejected: rows.filter((row, i) => Math.abs(errors[i] - median) > threshold), thresholdSeconds: threshold };
}

export function analyzeSyncAnchors(anchors) {
    if (new Set(anchors.map(row => row.anchorId)).size !== anchors.length) throw new Error('duplicate_anchor');
    for (const row of anchors) {
        if (row.provenance !== 'audio_measured_anchor' || row.clockDomain !== 'craig_to_vod'
            || !['fit', 'validation'].includes(row.role) || !finite(row.craigTimeSeconds) || !finite(row.vodTimeSeconds)
            || row.craigTimeSeconds < 0 || row.vodTimeSeconds < 0 || !finite(row.correlationConfidence)
            || row.correlationConfidence < 0.25 || !/^track_0[1-9]$/u.test(row.trackRef)) throw new Error('invalid_audio_anchor');
    }
    const fit = anchors.filter(row => row.role === 'fit');
    const validation = anchors.filter(row => row.role === 'validation');
    if (fit.length < 6 || validation.length < 6) throw new Error('six_independent_anchors_required_per_split');
    for (const split of [fit, validation]) {
        if (Math.max(...split.map(row => row.craigTimeSeconds)) - Math.min(...split.map(row => row.craigTimeSeconds)) < 300) throw new Error('anchors_not_distributed');
    }
    const filtered = fitOutlierFilter(fit);
    if (filtered.kept.length < 6) throw new Error('insufficient_fit_after_outlier_rejection');
    const models = { offset_only: fitOffset(filtered.kept), affine: fitAffine(filtered.kept) };
    const comparison = Object.fromEntries(Object.entries(models).map(([key, model]) => [key, {
        ...model, fitResidual: residualMetrics(filtered.kept, model), validationResidual: residualMetrics(validation, model)
    }]));
    const offset = comparison.offset_only.validationResidual;
    const affine = comparison.affine.validationResidual;
    // Policy fixed before measuring held-out residuals: substantive absolute AND relative gain.
    const useAffine = offset.mae - affine.mae >= 0.02 && affine.mae <= offset.mae * 0.8 && affine.max <= offset.max;
    const selectedModel = useAffine ? 'affine' : 'offset_only';
    const selected = comparison[selectedModel];
    const ordered = [...selected.validationResidual.rows].sort((a, b) => a.craigTimeSeconds - b.craigTimeSeconds);
    const regionSize = Math.max(1, Math.ceil(ordered.length / 4));
    const mean = rows => rows.reduce((sum, row) => sum + row.residualSeconds, 0) / rows.length;
    const startRegionResidual = mean(ordered.slice(0, regionSize));
    const endRegionResidual = mean(ordered.slice(-regionSize));
    const regionChange = Math.abs(endRegionResidual - startRegionResidual);
    const metrics = selected.validationResidual;
    const preferred = metrics.mae <= 0.150 && metrics.p90 <= 0.250 && metrics.max <= 0.500 && regionChange <= 0.250;
    const limited = metrics.mae <= 0.250 && metrics.p90 <= 0.400 && metrics.max <= 0.750 && regionChange <= 0.400;
    return { selectedModel, selectionReason: useAffine ? 'held_out_mae_gain_at_least_20ms_and_20_percent_without_worse_max' : 'prefer_offset_no_material_held_out_affine_gain',
        slope: selected.slope, interceptSeconds: selected.interceptSeconds, fitAnchorCount: filtered.kept.length,
        validationAnchorCount: validation.length, fitResidual: selected.fitResidual, validationResidual: metrics,
        startRegionResidual, endRegionResidual, regionResidualChangeSeconds: regionChange,
        estimatedOperationalSyncErrorSeconds: Math.max(metrics.max, selected.fitResidual.max) + 0.02,
        outlierCount: filtered.rejected.length, rejectedFitAnchorIds: filtered.rejected.map(row => row.anchorId),
        fitOutlierThresholdSeconds: filtered.thresholdSeconds, comparison,
        precisionStatus: preferred ? 'preferred_precision' : limited ? 'usable_with_limited_sync_precision' : 'alignment_precision_insufficient',
        validationUsedInFit: false };
}

export function validateClockObservation(observation) {
    if (!['human_supplied_anchor', 'visual_clock_observation'].includes(observation.provenance)
        || !['countdown', 'in_game_clock', 'leaderboard_duration', 'visual_result_state'].includes(observation.clockDomain)
        || !finite(observation.vodTimeSeconds) || observation.vodTimeSeconds < 0) throw new Error('invalid_clock_observation');
    return observation; // Deliberately no conversion of game/result clocks into fit anchors.
}
