import fs from 'node:fs';
import path from 'node:path';

const OUTPUT_DIR = 'output';
const FILES = {
    pointSamples: path.join(OUTPUT_DIR, '24-point-review-samples.json'),
    episodeSamples: path.join(OUTPUT_DIR, '24-episode-review-samples.json'),
    originalTimeline: path.join(OUTPUT_DIR, '23-calibrated-lane-occupancy.json'),
    originalEpisodes: path.join(OUTPUT_DIR, '23-calibrated-occupancy-episodes.json'),
    revisedTimeline: path.join(OUTPUT_DIR, '24-revised-lane-occupancy.json'),
    revisedEpisodes: path.join(OUTPUT_DIR, '24-revised-occupancy-episodes.json'),
    movement: path.join(OUTPUT_DIR, '18-player-movement-metrics.json'),
    revisionComparison: path.join(OUTPUT_DIR, '24-occupancy-revision-comparison.json'),
    revisionGate: path.join(OUTPUT_DIR, '24-occupancy-revision-gate.json')
};

const OUTPUTS = {
    sampleSet: path.join(OUTPUT_DIR, '24-holdout-sample-set.json'),
    originalAudit: path.join(OUTPUT_DIR, '24-holdout-original-evidence-audit.json'),
    revisedAudit: path.join(OUTPUT_DIR, '24-holdout-revised-evidence-audit.json'),
    comparison: path.join(OUTPUT_DIR, '24-holdout-comparison.json'),
    gate: path.join(OUTPUT_DIR, '24-holdout-validation-gate.json')
};

const STATUS = {
    supported: 'automatically_supported',
    contradicted: 'automatically_contradicted',
    internal: 'internally_consistent_only',
    unstable: 'unstable_under_perturbation'
};

const PERTURBATIONS = [
    { name: 'narrow_lane_envelope', distanceDelta: -30, marginDelta: 0 },
    { name: 'wide_lane_envelope', distanceDelta: 30, marginDelta: 0 },
    { name: 'stricter_separation_margin', distanceDelta: 0, marginDelta: 15 },
    { name: 'looser_separation_margin', distanceDelta: 0, marginDelta: -15 }
];

main();

function main() {
    const data = loadData();
    const holdout = buildHoldoutSampleSet(data);
    const originalAudit = auditHoldout(holdout, data, 'original');
    const revisedAudit = auditHoldout(holdout, data, 'revised');
    const comparison = buildComparison(holdout, originalAudit, revisedAudit, data);
    const gate = buildGate(comparison);

    writeJson(OUTPUTS.sampleSet, holdout);
    writeJson(OUTPUTS.originalAudit, originalAudit);
    writeJson(OUTPUTS.revisedAudit, revisedAudit);
    writeJson(OUTPUTS.comparison, comparison);
    writeJson(OUTPUTS.gate, gate);

    console.log(`holdout gate: ${gate.gateResult}`);
    console.log(`holdout samples: ${holdout.points.length} points / ${holdout.episodes.length} episodes`);
}

function loadData() {
    const originalRaw = readJson(FILES.originalTimeline);
    const revisedRaw = readJson(FILES.revisedTimeline);
    const movementRaw = readJson(FILES.movement);
    const pointSamples = readJson(FILES.pointSamples).samples;
    const episodeSamples = readJson(FILES.episodeSamples).samples;

    const originalRows = decodeRows(originalRaw.schema, originalRaw.rows);
    const revisedRows = decodeRows(revisedRaw.schema, revisedRaw.rows);
    const movementRows = decodeRows(movementRaw.schema, movementRaw.rows);

    return {
        originalRows,
        revisedRows,
        movementRows,
        originalEpisodes: readJson(FILES.originalEpisodes),
        revisedEpisodes: readJson(FILES.revisedEpisodes),
        revisionComparison: readJson(FILES.revisionComparison),
        revisionGate: readJson(FILES.revisionGate),
        usedPointKeys: new Set(pointSamples.map((sample) => key(sample.sourceRow.playerIndex, sample.sourceRow.gameSecond))),
        usedEpisodeWindows: episodeSamples.map((sample) => ({
            playerIndex: sample.sourceEpisode.playerIndex,
            startSecond: sample.sourceEpisode.startSecond,
            endSecond: sample.sourceEpisode.endSecond
        })),
        originalByKey: new Map(originalRows.map((row) => [ key(row.playerIndex, row.gameSecond), row ])),
        revisedByKey: new Map(revisedRows.map((row) => [ key(row.playerIndex, row.gameSecond), row ])),
        movementByKey: new Map(movementRows.map((row) => [ key(row.playerIndex, row.gameSecond), row ]))
    };
}

function buildHoldoutSampleSet(data) {
    const candidates = data.originalRows
        .filter((row) => !data.usedPointKeys.has(key(row.playerIndex, row.gameSecond)))
        .filter((row) => data.movementByKey.has(key(row.playerIndex, row.gameSecond)))
        .map((row) => ({
            playerIndex: row.playerIndex,
            gameSecond: row.gameSecond,
            originalState: row.state,
            originalPhysicalLaneId: row.physicalLaneId,
            revisedState: data.revisedByKey.get(key(row.playerIndex, row.gameSecond))?.state ?? null,
            revisedPhysicalLaneId: data.revisedByKey.get(key(row.playerIndex, row.gameSecond))?.physicalLaneId ?? null,
            physicalLaneId: row.physicalLaneId ?? data.revisedByKey.get(key(row.playerIndex, row.gameSecond))?.physicalLaneId ?? null,
            matchPhase: getMatchPhase(row.gameSecond)
        }));
    const points = stratifiedTake(candidates, 180, (row) => [
        row.matchPhase,
        row.playerIndex,
        row.originalState,
        row.physicalLaneId ?? 'none'
    ].join('|')).map((row, index) => ({
        sampleId: `p24_holdout_point_${String(index + 1).padStart(3, '0')}`,
        ...row
    }));
    const originalEpisodes = data.originalEpisodes.stableEpisodes
        .filter((episode) => !overlapsUsedEpisode(episode, data.usedEpisodeWindows))
        .map((episode) => ({ ...episode, source: 'original_stable_episode', matchPhase: getMatchPhase(episode.startSecond) }));
    const revisedEpisodes = data.revisedEpisodes.stableEpisodes
        .filter((episode) => !overlapsUsedEpisode(episode, data.usedEpisodeWindows))
        .map((episode) => ({ ...episode, source: 'revised_stable_episode', matchPhase: getMatchPhase(episode.startSecond) }));
    const episodes = stratifiedTake([ ...originalEpisodes, ...revisedEpisodes ], 90, (episode) => [
        episode.source,
        episode.matchPhase,
        episode.playerIndex,
        episode.physicalLaneId,
        durationBucket(episode.durationSeconds)
    ].join('|')).map((episode, index) => ({
        sampleId: `p24_holdout_episode_${String(index + 1).padStart(3, '0')}`,
        ...episode
    }));

    return {
        experiment: 24,
        kind: 'holdout_sample_set',
        generatedAt: new Date().toISOString(),
        exclusionPolicy: 'Excluded all task 008/005 point sample seconds and episode windows used by candidate evaluation.',
        points,
        episodes,
        distribution: {
            pointsByPhase: countBy(points, (sample) => sample.matchPhase),
            pointsByPlayer: countBy(points, (sample) => String(sample.playerIndex)),
            pointsByState: countBy(points, (sample) => sample.originalState),
            episodesByPhase: countBy(episodes, (sample) => sample.matchPhase),
            episodesByLane: countBy(episodes, (sample) => sample.physicalLaneId)
        }
    };
}

function auditHoldout(holdout, data, model) {
    const pointAudits = holdout.points.map((sample) => auditPoint(sample, data, model));
    const episodeAudits = holdout.episodes.map((sample) => auditEpisode(sample, data, model));

    return {
        experiment: 24,
        kind: `holdout_${model}_evidence_audit`,
        generatedAt: new Date().toISOString(),
        model,
        pointEvidenceCountsByStatus: countBy(pointAudits, (audit) => audit.evidenceStatus),
        episodeEvidenceCountsByStatus: countBy(episodeAudits, (audit) => audit.evidenceStatus),
        pointAudits,
        episodeAudits
    };
}

function auditPoint(sample, data, model) {
    const row = model === 'original'
        ? data.originalByKey.get(key(sample.playerIndex, sample.gameSecond))
        : data.revisedByKey.get(key(sample.playerIndex, sample.gameSecond));
    const movement = data.movementByKey.get(key(sample.playerIndex, sample.gameSecond));
    const prediction = {
        state: row?.state ?? row?.topologicalState ?? null,
        physicalLaneId: row?.physicalLaneId ?? null,
        candidateLane: row?.candidateLane ?? row?.candidatePhysicalLaneId ?? null,
        matchPhase: sample.matchPhase
    };
    const conditions = evaluatePoint(prediction, movement);
    const sensitivity = pointSensitivity(prediction, movement, model);
    if (sensitivity.changedByPerturbations > 0) {
        conditions.contradictory.push('classification_changes_under_holdout_perturbation');
    } else {
        conditions.supporting.push('classification_stable_under_holdout_perturbation');
    }
    const evidenceStatus = classify(conditions);

    return {
        sampleId: sample.sampleId,
        evidenceStatus,
        modelPrediction: prediction,
        evidenceMeasurements: {
            playerIndex: sample.playerIndex,
            gameSecond: sample.gameSecond,
            movementNearestLane: movement?.nearestLane ?? null,
            movementDistanceMargin: movement?.distanceMargin ?? null,
            movementSpeed: movement?.speed ?? null,
            distanceToAlliedBase: movement?.distanceToAlliedBase ?? null,
            region: movement?.region ?? null,
            sensitivity
        },
        supportingConditions: conditions.supporting,
        contradictoryConditions: conditions.contradictory
    };
}

function auditEpisode(sample, data, model) {
    const rows = range(sample.startSecond, sample.endSecond).map((second) => ({
        modelRow: model === 'original'
            ? data.originalByKey.get(key(sample.playerIndex, second))
            : data.revisedByKey.get(key(sample.playerIndex, second)),
        movement: data.movementByKey.get(key(sample.playerIndex, second))
    })).filter((row) => row.modelRow || row.movement);
    const outsideSeconds = rows.filter((row) => (row.modelRow?.physicalLaneId ?? null) !== sample.physicalLaneId).length;
    const maxSpeed = max(rows.map((row) => row.movement?.speed).filter(Number.isFinite));
    const minMargin = min(rows.map((row) => row.movement?.distanceMargin).filter(Number.isFinite));
    const supporting = [];
    const contradictory = [];

    if (rows.length === 0) {
        contradictory.push('no_rows_available_for_holdout_episode');
    }
    if (rows.length > 0 && outsideSeconds / rows.length <= 0.2 && minMargin >= 45) {
        supporting.push('episode_positions_mostly_inside_predicted_lane');
    }
    if (rows.length > 0 && outsideSeconds / rows.length >= 0.35) {
        contradictory.push('extended_positions_outside_predicted_lane');
    }
    if (maxSpeed > 900) {
        contradictory.push('episode_contains_possible_spatial_discontinuity');
    }

    return {
        sampleId: sample.sampleId,
        evidenceStatus: classify({ supporting, contradictory }),
        modelPrediction: {
            episodeSource: sample.source,
            physicalLaneId: sample.physicalLaneId,
            startSecond: sample.startSecond,
            endSecond: sample.endSecond,
            durationSeconds: sample.durationSeconds
        },
        evidenceMeasurements: {
            rowCount: rows.length,
            outsideSeconds,
            outsideRatio: rows.length > 0 ? round(outsideSeconds / rows.length) : null,
            maxSpeed,
            minMargin
        },
        supportingConditions: supporting,
        contradictoryConditions: contradictory
    };
}

function buildComparison(holdout, originalAudit, revisedAudit, data) {
    const originalPointContradictions = originalAudit.pointEvidenceCountsByStatus[ STATUS.contradicted ] ?? 0;
    const revisedPointContradictions = revisedAudit.pointEvidenceCountsByStatus[ STATUS.contradicted ] ?? 0;
    const originalPointInstability = originalAudit.pointEvidenceCountsByStatus[ STATUS.unstable ] ?? 0;
    const revisedPointInstability = revisedAudit.pointEvidenceCountsByStatus[ STATUS.unstable ] ?? 0;
    const originalEpisodeContradictions = originalAudit.episodeEvidenceCountsByStatus[ STATUS.contradicted ] ?? 0;
    const revisedEpisodeContradictions = revisedAudit.episodeEvidenceCountsByStatus[ STATUS.contradicted ] ?? 0;

    return {
        experiment: 24,
        kind: 'holdout_comparison',
        generatedAt: new Date().toISOString(),
        revisionCandidate: data.revisionComparison.selectedCandidateId,
        sampleCounts: {
            points: holdout.points.length,
            episodes: holdout.episodes.length
        },
        original: {
            pointEvidenceCountsByStatus: originalAudit.pointEvidenceCountsByStatus,
            episodeEvidenceCountsByStatus: originalAudit.episodeEvidenceCountsByStatus,
            pointContradictions: originalPointContradictions,
            pointInstability: originalPointInstability,
            episodeContradictions: originalEpisodeContradictions
        },
        revised: {
            pointEvidenceCountsByStatus: revisedAudit.pointEvidenceCountsByStatus,
            episodeEvidenceCountsByStatus: revisedAudit.episodeEvidenceCountsByStatus,
            pointContradictions: revisedPointContradictions,
            pointInstability: revisedPointInstability,
            episodeContradictions: revisedEpisodeContradictions
        },
        deltas: {
            pointContradictions: revisedPointContradictions - originalPointContradictions,
            pointInstability: revisedPointInstability - originalPointInstability,
            episodeContradictions: revisedEpisodeContradictions - originalEpisodeContradictions
        },
        warning: 'Holdout evidence is autonomous and non-semantic; it is not human ground truth.'
    };
}

function buildGate(comparison) {
    let gateResult = 'methodological_gate_missing_thresholds';
    let reason = 'No prior numeric holdout acceptance thresholds are documented; reporting comparison conservatively without approving transitions.';

    if (comparison.deltas.pointContradictions > 0 || comparison.deltas.episodeContradictions > 0) {
        gateResult = 'failed_on_holdout';
        reason = 'Revised model increased autonomous contradictions on holdout.';
    }

    return {
        experiment: 24,
        kind: 'holdout_validation_gate',
        generatedAt: new Date().toISOString(),
        gateResult,
        reason,
        transitionDetectionPromoted: false,
        humanReviewRequired: false
    };
}

function evaluatePoint(prediction, movement) {
    const supporting = [];
    const contradictory = [];

    if (!movement || !prediction.state) {
        contradictory.push('missing_holdout_evidence');
        return { supporting, contradictory };
    }
    if (isLaneState(prediction.state)) {
        const distance = getMovementLaneDistance(movement, prediction.physicalLaneId);
        if (movement.nearestLane === prediction.physicalLaneId && movement.distanceMargin >= 75 && distance <= 380) {
            supporting.push('independent_geometry_nearest_lane_supports_prediction');
        }
        if (movement.nearestLane !== prediction.physicalLaneId && movement.distanceMargin >= 75) {
            contradictory.push('predicted_lane_not_nearest_with_substantial_separation');
        }
        if (String(movement.region ?? '').startsWith('base_') || movement.distanceToAlliedBase <= 240) {
            contradictory.push('base_geometry_strongly_contradicts_lane_occupancy');
        }
        if (movement.speed > 900) {
            contradictory.push('high_speed_or_possible_discontinuity_near_sample');
        }
    } else {
        supporting.push('abstention_or_non_lane_state');
    }

    return { supporting, contradictory };
}

function pointSensitivity(prediction, movement, model) {
    let changedByPerturbations = 0;
    const statesByPerturbation = {};
    for (const perturbation of PERTURBATIONS) {
        const state = perturbPointState(prediction, movement, model, perturbation);
        statesByPerturbation[ perturbation.name ] = state;
        if (state !== prediction.state) {
            changedByPerturbations += 1;
        }
    }
    return { changedByPerturbations, statesByPerturbation };
}

function perturbPointState(prediction, movement, model, perturbation) {
    if (!movement || !prediction.state || !prediction.physicalLaneId || !isLaneState(prediction.state)) {
        return prediction.state;
    }
    const distance = getMovementLaneDistance(movement, prediction.physicalLaneId);
    const maxDistance = model === 'original' ? 380 + perturbation.distanceDelta : 380 + perturbation.distanceDelta;
    const minMargin = model === 'original' ? 45 + perturbation.marginDelta : 75 + perturbation.marginDelta;

    if (distance <= maxDistance && movement.distanceMargin >= minMargin * 1.6) {
        return 'lane_core_high';
    }
    if (distance <= maxDistance && movement.distanceMargin >= minMargin) {
        return model === 'revised' && movement.distanceMargin < 90 ? 'lane_ambiguous' : 'lane_core_medium';
    }
    return model === 'revised' ? 'lane_ambiguous' : 'lane_approach';
}

function classify(conditions) {
    if (conditions.contradictory.some((condition) => !condition.includes('perturbation'))) {
        return STATUS.contradicted;
    }
    if (conditions.contradictory.some((condition) => condition.includes('perturbation'))) {
        return STATUS.unstable;
    }
    if (conditions.supporting.some((condition) => condition.includes('independent_geometry'))) {
        return STATUS.supported;
    }
    return STATUS.internal;
}

function stratifiedTake(items, limit, keyFn) {
    const groups = Array.from(groupByMap(items, keyFn).values()).map((group) => group.sort(compareStable));
    const selected = [];
    let cursor = 0;
    while (selected.length < limit && groups.length > 0) {
        const group = groups[cursor % groups.length];
        selected.push(group.shift());
        if (group.length === 0) {
            groups.splice(cursor % groups.length, 1);
        } else {
            cursor += 1;
        }
    }
    return selected.filter(Boolean);
}

function compareStable(left, right) {
    return left.gameSecond - right.gameSecond
        || left.startSecond - right.startSecond
        || left.playerIndex - right.playerIndex;
}

function overlapsUsedEpisode(episode, usedWindows) {
    return usedWindows.some((window) => episode.playerIndex === window.playerIndex
        && Math.max(episode.startSecond, window.startSecond) <= Math.min(episode.endSecond, window.endSecond));
}

function decodeRows(schema, rows) {
    return rows.map((row) => Object.fromEntries(schema.map((field, index) => [ field, row[ index ] ])));
}

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
    fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function isLaneState(state) {
    return typeof state === 'string' && state.startsWith('lane_') && state !== 'lane_ambiguous';
}

function getMovementLaneDistance(row, lane) {
    if (!row || !lane) {
        return null;
    }
    return row[ `distanceLane${lane.slice(-1)}` ] ?? null;
}

function getMatchPhase(second) {
    if (second <= 600) {
        return 'early';
    }
    if (second <= 1200) {
        return 'middle';
    }
    return 'late';
}

function durationBucket(durationSeconds) {
    if (durationSeconds <= 5) {
        return 'short';
    }
    if (durationSeconds <= 15) {
        return 'medium';
    }
    return 'long';
}

function key(playerIndex, second) {
    return `${playerIndex}:${second}`;
}

function range(start, end) {
    return Array.from({ length: Math.max(0, end - start + 1) }, (_unused, index) => start + index);
}

function groupByMap(items, keyFn) {
    const groups = new Map();
    for (const item of items) {
        const itemKey = keyFn(item);
        const group = groups.get(itemKey) ?? [];
        group.push(item);
        groups.set(itemKey, group);
    }
    return groups;
}

function countBy(items, keyFn) {
    const counts = {};
    for (const item of items) {
        const itemKey = keyFn(item);
        counts[ itemKey ] = (counts[ itemKey ] ?? 0) + 1;
    }
    return Object.fromEntries(Object.entries(counts).sort(([ left ], [ right ]) => String(left).localeCompare(String(right))));
}

function min(values) {
    return values.length > 0 ? Math.min(...values) : null;
}

function max(values) {
    return values.length > 0 ? Math.max(...values) : null;
}

function round(value) {
    return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
}
