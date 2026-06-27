import fs from 'node:fs';
import path from 'node:path';

const OUTPUT_DIR = 'output';
const POINT_SAMPLES = path.join(OUTPUT_DIR, '24-point-review-samples.json');
const EPISODE_SAMPLES = path.join(OUTPUT_DIR, '24-episode-review-samples.json');
const TIMELINE_23 = path.join(OUTPUT_DIR, '23-calibrated-lane-occupancy.json');
const EPISODES_23 = path.join(OUTPUT_DIR, '23-calibrated-occupancy-episodes.json');
const MODEL_COMPARISON_23 = path.join(OUTPUT_DIR, '23-occupancy-model-comparison.json');
const TIMELINE_22 = path.join(OUTPUT_DIR, '22-player-lane-occupancy-timeline.json');
const MOVEMENT_18 = path.join(OUTPUT_DIR, '18-player-movement-metrics.json');
const SPATIAL_17 = path.join(OUTPUT_DIR, '17-spatial-region-model.json');
const REGION_17 = path.join(OUTPUT_DIR, '17-player-region-timeline.json');

const POINT_AUDIT_OUTPUT = path.join(OUTPUT_DIR, '24-autonomous-point-evidence-audit.json');
const EPISODE_AUDIT_OUTPUT = path.join(OUTPUT_DIR, '24-autonomous-episode-evidence-audit.json');
const SENSITIVITY_OUTPUT = path.join(OUTPUT_DIR, '24-occupancy-sensitivity-analysis.json');
const CROSS_MODEL_OUTPUT = path.join(OUTPUT_DIR, '24-cross-model-agreement.json');
const SUMMARY_OUTPUT = path.join(OUTPUT_DIR, '24-independent-evidence-summary.json');
const HUMAN_QUEUE_OUTPUT = path.join(OUTPUT_DIR, '24-minimal-human-review-queue.json');
const GATE_OUTPUT = path.join(OUTPUT_DIR, '24-autonomous-validation-gate.json');

const STATUS = {
    supported: 'automatically_supported',
    contradicted: 'automatically_contradicted',
    internal: 'internally_consistent_only',
    unstable: 'unstable_under_perturbation',
    unresolved: 'unresolved',
    notVerifiable: 'not_independently_verifiable'
};

const PHASES = [
    { name: 'early', minSecond: 0, maxSecond: 600 },
    { name: 'middle', minSecond: 601, maxSecond: 1200 },
    { name: 'late', minSecond: 1201, maxSecond: Number.POSITIVE_INFINITY }
];

const PARAMETERS = {
    maxCoreDistance: 380,
    maxOccupancyDistance: 520,
    minMargin: 45,
    deploymentRadius: 500,
    baseCoreRadius: 240,
    minStableSeconds: 5,
    interruptionTolerance: 3
};

const PERTURBATIONS = [
    { name: 'narrow_lane_envelope', changes: { maxCoreDistance: -30, maxOccupancyDistance: -50 } },
    { name: 'wide_lane_envelope', changes: { maxCoreDistance: 30, maxOccupancyDistance: 50 } },
    { name: 'stricter_separation_margin', changes: { minMargin: 15 } },
    { name: 'looser_separation_margin', changes: { minMargin: -15 } },
    { name: 'larger_deployment_exclusion', changes: { deploymentRadius: 50, baseCoreRadius: 20 } },
    { name: 'smaller_deployment_exclusion', changes: { deploymentRadius: -50, baseCoreRadius: -20 } },
    { name: 'higher_confidence_boundary', changes: { maxCoreDistance: -20, minMargin: 20 } },
    { name: 'lower_confidence_boundary', changes: { maxCoreDistance: 20, minMargin: -20 } }
];

main();

function main() {
    const pointSamples = readJson(POINT_SAMPLES).samples;
    const episodeSamples = readJson(EPISODE_SAMPLES).samples;
    const timeline23Raw = readJson(TIMELINE_23);
    const episodes23 = readJson(EPISODES_23);
    const modelComparison = readJson(MODEL_COMPARISON_23);
    const timeline22Raw = readJson(TIMELINE_22);
    const movementRaw = readJson(MOVEMENT_18);
    const spatialModel = readJson(SPATIAL_17);
    const regionRaw = readJson(REGION_17);

    const timeline23 = decodeRows(timeline23Raw.schema, timeline23Raw.rows);
    const timeline22 = decodeRows(timeline22Raw.schema, timeline22Raw.rows);
    const movement = decodeRows(movementRaw.schema, movementRaw.rows);
    const regionTimeline = decodeRegionRows(regionRaw);
    const indexes = buildIndexes(timeline23, timeline22, movement, regionTimeline, episodes23);
    const laneAxes = spatialModel.laneAxes;
    const derivedSignalNotes = buildDerivedSignalNotes();

    const pointAudit = pointSamples.map((sample) => auditPointSample(sample, indexes, laneAxes, derivedSignalNotes));
    const episodeAudit = episodeSamples.map((sample) => auditEpisodeSample(sample, indexes, derivedSignalNotes));
    const sensitivity = buildSensitivity(pointSamples, episodeSamples, indexes);
    const crossModel = buildCrossModelAgreement(pointSamples, episodeSamples, indexes, modelComparison);
    const summary = buildSummary(pointAudit, episodeAudit, sensitivity, crossModel, derivedSignalNotes);
    const humanQueue = buildMinimalHumanQueue(pointAudit, episodeAudit);
    const gate = buildGate(summary, humanQueue);

    writeJson(POINT_AUDIT_OUTPUT, {
        experiment: 24,
        kind: 'autonomous_point_evidence_audit',
        generatedAt: new Date().toISOString(),
        statusDefinitions: STATUS,
        audits: pointAudit
    });
    writeJson(EPISODE_AUDIT_OUTPUT, {
        experiment: 24,
        kind: 'autonomous_episode_evidence_audit',
        generatedAt: new Date().toISOString(),
        statusDefinitions: STATUS,
        audits: episodeAudit
    });
    writeJson(SENSITIVITY_OUTPUT, sensitivity);
    writeJson(CROSS_MODEL_OUTPUT, crossModel);
    writeJson(SUMMARY_OUTPUT, summary);
    writeJson(HUMAN_QUEUE_OUTPUT, humanQueue);
    writeJson(GATE_OUTPUT, gate);

    console.log(`point statuses: ${JSON.stringify(summary.pointEvidenceCountsByStatus)}`);
    console.log(`episode statuses: ${JSON.stringify(summary.episodeEvidenceCountsByStatus)}`);
    console.log(`gate result: ${gate.gateResult}`);
}

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
    fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function decodeRows(schema, rows) {
    return rows.map((row) => Object.fromEntries(schema.map((field, index) => [ field, row[ index ] ])));
}

function decodeRegionRows(regionRaw) {
    return regionRaw.snapshots.flatMap((snapshot) => snapshot.rows.map((row) => ({
        gameSecond: snapshot.gameSecond,
        ...Object.fromEntries(regionRaw.schema.map((field, index) => [ field, row[ index ] ]))
    })));
}

function buildIndexes(timeline23, timeline22, movement, regionTimeline, episodes23) {
    const point23ByKey = new Map(timeline23.map((row) => [ key(row.playerIndex, row.gameSecond), row ]));
    const point22ByKey = new Map(timeline22.map((row) => [ key(row.playerIndex, row.gameSecond), row ]));
    const movementByKey = new Map(movement.map((row) => [ key(row.playerIndex, row.gameSecond), row ]));
    const regionByKey = new Map(regionTimeline.map((row) => [ key(row.playerIndex, row.gameSecond), row ]));
    const stableEpisodesByPlayer = groupBy(episodes23.stableEpisodes, (episode) => String(episode.playerIndex));
    const briefContactsByPlayer = groupBy(episodes23.briefContacts, (episode) => String(episode.playerIndex));

    return {
        point23ByKey,
        point22ByKey,
        movementByKey,
        regionByKey,
        stableEpisodesByPlayer,
        briefContactsByPlayer
    };
}

function auditPointSample(sample, indexes, laneAxes, derivedSignalNotes) {
    const row = sample.sourceRow;
    const sampleKey = key(row.playerIndex, row.gameSecond);
    const movement = indexes.movementByKey.get(sampleKey);
    const baseline22 = indexes.point22ByKey.get(sampleKey);
    const region = indexes.regionByKey.get(sampleKey);
    const previousMovement = indexes.movementByKey.get(key(row.playerIndex, row.gameSecond - 1));
    const nextMovement = indexes.movementByKey.get(key(row.playerIndex, row.gameSecond + 1));
    const containing = findContainingEpisode(row.playerIndex, row.gameSecond, indexes);
    const sensitivity = classifyPerturbations(row);
    const laneGeometry = computeLaneGeometry(movement, laneAxes);
    const modelPrediction = {
        state: row.state,
        physicalLaneId: row.physicalLaneId,
        candidateLane: row.candidateLane,
        matchPhase: getMatchPhase(row.gameSecond)
    };
    const evidenceSourcesUsed = [
        'output/18-player-movement-metrics.json',
        'output/17-player-region-timeline.json',
        'output/17-spatial-region-model.json',
        'output/22-player-lane-occupancy-timeline.json',
        'output/23-calibrated-occupancy-episodes.json'
    ];
    const measurements = {
        gameSecond: row.gameSecond,
        playerIndex: row.playerIndex,
        modelDistanceToAxis: row.distanceToAxis,
        modelSeparationMargin: row.separationMargin,
        movementNearestLane: movement?.nearestLane ?? null,
        movementSecondNearestLane: movement?.secondNearestLane ?? null,
        movementDistanceMargin: movement?.distanceMargin ?? null,
        movementSpeed: movement?.speed ?? null,
        movementSpeedSmoothed5s: movement?.speedSmoothed5s ?? null,
        movementState: movement?.movementState ?? null,
        coordinates: movement ? { x: movement.x, y: movement.y, z: movement.z } : null,
        previousCoordinates: previousMovement ? { x: previousMovement.x, y: previousMovement.y, z: previousMovement.z } : null,
        nextCoordinates: nextMovement ? { x: nextMovement.x, y: nextMovement.y, z: nextMovement.z } : null,
        distanceToAlliedBase: movement?.distanceToAlliedBase ?? null,
        region: movement?.region ?? null,
        rawRegion: movement?.rawRegion ?? null,
        regionConfidence: movement?.confidence ?? null,
        independentRegionCode: region?.smoothRegionCode ?? null,
        baseline22State: baseline22?.topologicalState ?? null,
        baseline22PhysicalLaneId: baseline22?.physicalLaneId ?? null,
        containingEpisode: containing ? {
            type: containing.type,
            id: containing.id,
            physicalLaneId: containing.physicalLaneId,
            startSecond: containing.startSecond,
            endSecond: containing.endSecond,
            durationSeconds: containing.durationSeconds
        } : null,
        laneGeometry,
        sensitivity
    };
    const conditions = evaluatePointConditions(row, movement, baseline22, containing, sensitivity);
    const classification = classifyEvidence(conditions);

    return buildAuditRecord(sample.sampleId, 'point', modelPrediction, evidenceSourcesUsed, measurements, conditions, classification, derivedSignalNotes);
}

function auditEpisodeSample(sample, indexes, derivedSignalNotes) {
    const episode = sample.sourceEpisode;
    const rows = range(episode.startSecond, episode.endSecond)
        .map((second) => ({
            second,
            row23: indexes.point23ByKey.get(key(episode.playerIndex, second)),
            movement: indexes.movementByKey.get(key(episode.playerIndex, second)),
            baseline22: indexes.point22ByKey.get(key(episode.playerIndex, second))
        }))
        .filter((row) => row.row23 || row.movement || row.baseline22);
    const sensitivity = classifyEpisodePerturbations(episode, rows);
    const episodePrediction = {
        episodeType: episode.episodeType,
        physicalLaneId: episode.physicalLaneId,
        startSecond: episode.startSecond,
        endSecond: episode.endSecond,
        durationSeconds: episode.durationSeconds,
        state: sample.stratum.state,
        matchPhase: sample.stratum.matchPhase
    };
    const measurements = {
        playerIndex: episode.playerIndex,
        durationSeconds: episode.durationSeconds,
        averageDistanceToAxis: episode.averageDistanceToAxis,
        averageMargin: episode.averageMargin,
        confidence: episode.confidence ?? null,
        reason: episode.reason ?? null,
        rowCount: rows.length,
        movementNearestLaneCounts: countBy(rows, (row) => row.movement?.nearestLane ?? 'missing'),
        modelStateCounts: countBy(rows, (row) => row.row23?.state ?? 'missing'),
        baseline22StateCounts: countBy(rows, (row) => row.baseline22?.topologicalState ?? 'missing'),
        maxSpeed: max(rows.map((row) => row.movement?.speed).filter(Number.isFinite)),
        maxDistanceToPredictedLane: max(rows.map((row) => getMovementLaneDistance(row.movement, episode.physicalLaneId)).filter(Number.isFinite)),
        minSeparationMargin: min(rows.map((row) => row.movement?.distanceMargin).filter(Number.isFinite)),
        outsidePredictedLaneSeconds: rows.filter((row) => row.movement?.nearestLane !== episode.physicalLaneId).length,
        stableInsidePredictedLaneSeconds: rows.filter((row) => row.movement?.nearestLane === episode.physicalLaneId && row.movement?.distanceMargin >= 45).length,
        sensitivity
    };
    const evidenceSourcesUsed = [
        'output/18-player-movement-metrics.json',
        'output/22-player-lane-occupancy-timeline.json',
        'output/23-calibrated-lane-occupancy.json'
    ];
    const conditions = evaluateEpisodeConditions(episode, rows, measurements, sensitivity);
    const classification = classifyEvidence(conditions);

    return buildAuditRecord(sample.sampleId, 'episode', episodePrediction, evidenceSourcesUsed, measurements, conditions, classification, derivedSignalNotes);
}

function evaluatePointConditions(row, movement, baseline22, containing, sensitivity) {
    const supporting = [];
    const contradictory = [];

    if (!movement) {
        contradictory.push('missing_movement_row');
    }

    if (isLaneState(row.state)) {
        if (movement?.nearestLane === row.physicalLaneId && movement.distanceMargin >= 45 && getMovementLaneDistance(movement, row.physicalLaneId) <= 520) {
            supporting.push('independent_geometry_nearest_lane_supports_prediction');
        }

        if (baseline22?.physicalLaneId === row.physicalLaneId && isLaneState(baseline22.topologicalState)) {
            supporting.push('experiment22_broad_lane_agreement');
        }

        if (containing?.physicalLaneId === row.physicalLaneId) {
            supporting.push('episode_representation_contains_same_lane');
        }

        if (movement && movement.nearestLane !== row.physicalLaneId && movement.distanceMargin >= 75) {
            contradictory.push('predicted_lane_not_nearest_with_substantial_separation');
        }

        if (getMovementLaneDistance(movement, row.physicalLaneId) > 680) {
            contradictory.push('predicted_lane_outside_plausible_lane_envelope');
        }

        if (movement?.distanceToAlliedBase <= 240 || String(movement?.region ?? '').startsWith('base_')) {
            contradictory.push('base_geometry_strongly_contradicts_lane_occupancy');
        }
    } else if (row.state === 'base_core' || row.state === 'deployment_ambiguous') {
        if (movement?.distanceToAlliedBase <= (row.state === 'base_core' ? 260 : 560) || String(movement?.region ?? '').startsWith('base_')) {
            supporting.push('base_or_deployment_region_supports_non_lane_state');
        }

        if (movement?.nearestLane && movement.distanceMargin >= 120 && getMovementLaneDistance(movement, movement.nearestLane) <= 180 && movement.distanceToAlliedBase > 560) {
            contradictory.push('strong_lane_geometry_contradicts_base_or_deployment_state');
        }
    } else if (row.state === 'unknown') {
        if (movement?.alive === false) {
            supporting.push('movement_row_marks_player_dead_or_unavailable');
        } else {
            contradictory.push('unknown_state_has_available_live_movement_row');
        }
    }

    if (sensitivity.changedByPerturbations > 0) {
        contradictory.push('classification_changes_under_small_threshold_perturbations');
    } else {
        supporting.push('classification_stable_under_bounded_perturbations');
    }

    if (movement?.speed > 900) {
        contradictory.push('high_speed_or_possible_discontinuity_near_sample');
    }

    return { supporting, contradictory };
}

function evaluateEpisodeConditions(episode, rows, measurements, sensitivity) {
    const supporting = [];
    const contradictory = [];

    if (rows.length === 0) {
        contradictory.push('no_rows_available_for_episode_interval');
    }

    const insideRatio = rows.length > 0 ? measurements.stableInsidePredictedLaneSeconds / rows.length : 0;
    const outsideRatio = rows.length > 0 ? measurements.outsidePredictedLaneSeconds / rows.length : 1;

    if (episode.episodeType === 'stable_episode') {
        if (insideRatio >= 0.8 && measurements.minSeparationMargin >= 30) {
            supporting.push('episode_positions_mostly_inside_predicted_lane');
        }

        if (outsideRatio >= 0.35) {
            contradictory.push('extended_positions_outside_predicted_lane');
        }

        if (measurements.maxDistanceToPredictedLane > 680) {
            contradictory.push('episode_contains_positions_far_outside_lane_envelope');
        }
    } else if (episode.episodeType === 'brief_contact') {
        if (episode.durationSeconds < PARAMETERS.minStableSeconds) {
            supporting.push('brief_contact_duration_below_stable_threshold');
        }

        if (episode.durationSeconds >= PARAMETERS.minStableSeconds && insideRatio >= 0.8) {
            contradictory.push('fragmented_without_meaningful_spatial_departure');
        }
    }

    if (measurements.maxSpeed > 900) {
        contradictory.push('episode_contains_possible_spatial_discontinuity');
    }

    if (sensitivity.changedByPerturbations > 0) {
        contradictory.push('episode_membership_changes_under_small_threshold_perturbations');
    } else {
        supporting.push('episode_classification_stable_under_bounded_perturbations');
    }

    return { supporting, contradictory };
}

function classifyEvidence(conditions) {
    const hasMissing = conditions.contradictory.includes('missing_movement_row')
        || conditions.contradictory.includes('no_rows_available_for_episode_interval');
    const hasInstability = conditions.contradictory.some((condition) => condition.includes('perturbation'));
    const strongContradiction = conditions.contradictory.some((condition) => !condition.includes('perturbation'));
    const independentSupport = conditions.supporting.some((condition) => condition.startsWith('independent_')
        || condition.includes('movement')
        || condition.includes('geometry')
        || condition.includes('experiment22'));

    if (hasMissing) {
        return {
            status: STATUS.notVerifiable,
            confidence: 'low',
            reason: 'Required derived evidence rows were unavailable.'
        };
    }

    if (strongContradiction) {
        return {
            status: STATUS.contradicted,
            confidence: 'high',
            reason: 'At least one conservative contradiction rule fired from measured evidence.'
        };
    }

    if (hasInstability) {
        return {
            status: STATUS.unstable,
            confidence: 'medium',
            reason: 'Classification changes under bounded parameter perturbation.'
        };
    }

    if (independentSupport && conditions.supporting.length >= 2) {
        return {
            status: STATUS.supported,
            confidence: 'medium',
            reason: 'Multiple independent or semi-independent derived evidence sources support the prediction.'
        };
    }

    if (conditions.supporting.length > 0) {
        return {
            status: STATUS.internal,
            confidence: 'low',
            reason: 'Evidence is consistent but not independent enough to establish semantic truth.'
        };
    }

    return {
        status: STATUS.unresolved,
        confidence: 'low',
        reason: 'Available evidence neither supports nor contradicts the prediction sufficiently.'
    };
}

function buildAuditRecord(sampleId, kind, modelPrediction, evidenceSourcesUsed, evidenceMeasurements, conditions, classification, derivedSignalNotes) {
    const humanReviewRequired = classification.status === STATUS.unresolved
        || classification.status === STATUS.contradicted
        || classification.status === STATUS.unstable;

    return {
        sampleId,
        reviewKind: kind,
        evidenceStatus: classification.status,
        modelPrediction,
        evidenceSourcesUsed,
        evidenceMeasurements,
        supportingConditions: conditions.supporting,
        contradictoryConditions: conditions.contradictory,
        confidence: classification.confidence,
        reason: classification.reason,
        humanReviewRequired,
        humanQuestion: humanReviewRequired ? buildHumanQuestion(kind, modelPrediction, classification.status) : null,
        epistemicNote: 'This is an autonomous evidence classification, not semantic ground truth.',
        derivedSignalNotes
    };
}

function buildSensitivity(pointSamples, episodeSamples, indexes) {
    const pointChanges = pointSamples.map((sample) => {
        const row = sample.sourceRow;
        const sensitivity = classifyPerturbations(row);
        return {
            sampleId: sample.sampleId,
            playerIndex: row.playerIndex,
            physicalLaneId: row.physicalLaneId,
            matchPhase: sample.stratum.matchPhase,
            originalState: row.state,
            changedByPerturbations: sensitivity.changedByPerturbations,
            statesByPerturbation: sensitivity.statesByPerturbation
        };
    });
    const episodeChanges = episodeSamples.map((sample) => {
        const episode = sample.sourceEpisode;
        const rows = range(episode.startSecond, episode.endSecond)
            .map((second) => ({
                second,
                row23: indexes.point23ByKey.get(key(episode.playerIndex, second)),
                movement: indexes.movementByKey.get(key(episode.playerIndex, second))
            }))
            .filter((row) => row.row23 || row.movement);
        const sensitivity = classifyEpisodePerturbations(episode, rows);
        return {
            sampleId: sample.sampleId,
            playerIndex: episode.playerIndex,
            physicalLaneId: episode.physicalLaneId,
            matchPhase: sample.stratum.matchPhase,
            originalType: episode.episodeType,
            changedByPerturbations: sensitivity.changedByPerturbations,
            episodeTypeByPerturbation: sensitivity.episodeTypeByPerturbation
        };
    });

    return {
        experiment: 24,
        kind: 'occupancy_sensitivity_analysis',
        generatedAt: new Date().toISOString(),
        perturbations: PERTURBATIONS,
        pointSummary: summarizeSensitivity(pointChanges),
        episodeSummary: summarizeSensitivity(episodeChanges),
        pointChanges,
        episodeChanges
    };
}

function buildCrossModelAgreement(pointSamples, episodeSamples, indexes, modelComparison) {
    const pointAgreement = pointSamples.map((sample) => {
        const row = sample.sourceRow;
        const baseline22 = indexes.point22ByKey.get(key(row.playerIndex, row.gameSecond));
        return comparePointModels(sample, baseline22);
    });
    const episodeAgreement = episodeSamples.map((sample) => compareEpisodeModels(sample, indexes));

    return {
        experiment: 24,
        kind: 'cross_model_agreement',
        generatedAt: new Date().toISOString(),
        modelSources: [
            'experiment_22_lane_occupancy',
            'experiment_23_balanced_selected_model',
            'experiment_23_candidate_model_summaries'
        ],
        candidateModelSummaries: modelComparison.models,
        epistemicWarning: 'Cross-model agreement is not ground truth and may share geometry-derived assumptions.',
        pointSummary: countBy(pointAgreement, (entry) => entry.agreementStatus),
        episodeSummary: countBy(episodeAgreement, (entry) => entry.agreementStatus),
        pointAgreement,
        episodeAgreement
    };
}

function comparePointModels(sample, baseline22) {
    const row = sample.sourceRow;
    const model23Lane = row.physicalLaneId;
    const model22Lane = baseline22?.physicalLaneId ?? null;
    let agreementStatus = 'not_comparable';

    if (baseline22) {
        if (model23Lane && model22Lane === model23Lane) {
            agreementStatus = 'agreement';
        } else if (!model23Lane && !model22Lane && baseline22.topologicalState === row.state) {
            agreementStatus = 'agreement';
        } else if (model22Lane && model23Lane && model22Lane !== model23Lane) {
            agreementStatus = 'disagreement';
        } else if (model23Lane && !model22Lane) {
            agreementStatus = 'selected_model_only_classification';
        } else {
            agreementStatus = 'majority_unknown';
        }
    }

    return {
        sampleId: sample.sampleId,
        model23: { state: row.state, physicalLaneId: model23Lane },
        model22: baseline22 ? { state: baseline22.topologicalState, physicalLaneId: model22Lane } : null,
        agreementStatus
    };
}

function compareEpisodeModels(sample, indexes) {
    const episode = sample.sourceEpisode;
    const rows = range(episode.startSecond, episode.endSecond)
        .map((second) => indexes.point22ByKey.get(key(episode.playerIndex, second)))
        .filter(Boolean);
    const laneAgreementRows = rows.filter((row) => row.physicalLaneId === episode.physicalLaneId).length;
    const comparableRows = rows.length;
    const agreementRatio = comparableRows > 0 ? laneAgreementRows / comparableRows : null;
    let agreementStatus = 'not_comparable';

    if (agreementRatio !== null) {
        if (agreementRatio >= 0.8) {
            agreementStatus = 'agreement';
        } else if (agreementRatio <= 0.2) {
            agreementStatus = 'disagreement';
        } else {
            agreementStatus = 'majority_mixed';
        }
    }

    return {
        sampleId: sample.sampleId,
        model23: {
            episodeType: episode.episodeType,
            physicalLaneId: episode.physicalLaneId,
            startSecond: episode.startSecond,
            endSecond: episode.endSecond
        },
        model22ComparableRows: comparableRows,
        model22LaneAgreementRows: laneAgreementRows,
        agreementRatio,
        agreementStatus
    };
}

function buildSummary(pointAudit, episodeAudit, sensitivity, crossModel, derivedSignalNotes) {
    const strongest = findStrongestContradiction(pointAudit, episodeAudit);

    return {
        experiment: 24,
        kind: 'independent_evidence_summary',
        generatedAt: new Date().toISOString(),
        epistemicRule: {
            internalConsistency: 'Agreement with the model or its direct rule outputs is not semantic truth.',
            independentSupportingEvidence: 'Distinct derived geometry, movement, region, and prior-model evidence can increase confidence.',
            independentContradictoryEvidence: 'Measured geometry, movement, and continuity conflicts can reject a classification for current downstream use.',
            semanticGroundTruth: 'Only human or external semantic review can establish semantic correctness.',
            unresolvedInterpretation: 'Cases not resolved by deterministic evidence remain unresolved.'
        },
        derivedSignalNotes,
        pointEvidenceCountsByStatus: countBy(pointAudit, (audit) => audit.evidenceStatus),
        episodeEvidenceCountsByStatus: countBy(episodeAudit, (audit) => audit.evidenceStatus),
        sensitivitySummary: {
            point: sensitivity.pointSummary,
            episode: sensitivity.episodeSummary
        },
        crossModelSummary: {
            point: crossModel.pointSummary,
            episode: crossModel.episodeSummary
        },
        strongestIndependentContradiction: strongest,
        allowedDownstreamUse: determineAllowedUse(pointAudit, episodeAudit)
    };
}

function buildMinimalHumanQueue(pointAudit, episodeAudit) {
    const candidates = [ ...pointAudit, ...episodeAudit ]
        .filter((audit) => audit.humanReviewRequired)
        .filter((audit) => isDecisionRelevant(audit))
        .slice(0, 24)
        .map((audit) => ({
            sampleId: audit.sampleId,
            reviewKind: audit.reviewKind,
            evidenceStatus: audit.evidenceStatus,
            modelPrediction: audit.modelPrediction,
            reason: audit.reason,
            exactQuestion: audit.humanQuestion,
            materialDecision: 'Determine whether the current occupancy model needs mechanical revision or can support limited non-transition downstream use.',
            evidenceMeasurements: audit.evidenceMeasurements,
            supportingConditions: audit.supportingConditions,
            contradictoryConditions: audit.contradictoryConditions
        }));

    return {
        experiment: 24,
        kind: 'minimal_human_review_queue',
        generatedAt: new Date().toISOString(),
        selectionPolicy: 'Include only unresolved, contradicted, or unstable cases that can affect transition readiness or model-revision decisions.',
        broadManualLabelingRequested: false,
        reviewCount: candidates.length,
        samples: candidates
    };
}

function buildGate(summary, humanQueue) {
    const pointCounts = summary.pointEvidenceCountsByStatus;
    const episodeCounts = summary.episodeEvidenceCountsByStatus;
    const contradictions = (pointCounts[ STATUS.contradicted ] ?? 0) + (episodeCounts[ STATUS.contradicted ] ?? 0);
    const unstable = (pointCounts[ STATUS.unstable ] ?? 0) + (episodeCounts[ STATUS.unstable ] ?? 0);
    let gateResult = 'minimal_human_review_required';
    let reason = 'A minimized unresolved set remains after autonomous evidence audit.';

    if (contradictions >= 10 || unstable >= 40) {
        gateResult = 'autonomous_evidence_requires_model_revision';
        reason = 'Conservative contradiction or instability counts are high enough to demonstrate mechanical model risk without semantic labels.';
    } else if (humanQueue.reviewCount === 0) {
        gateResult = 'autonomous_evidence_supports_limited_use';
        reason = 'No minimized human-review cases remain, but this is still not semantic ground truth.';
    } else if ((pointCounts[ STATUS.notVerifiable ] ?? 0) + (episodeCounts[ STATUS.notVerifiable ] ?? 0) > 50) {
        gateResult = 'insufficient_independent_evidence';
        reason = 'Too many samples lack independent derived evidence for audit.';
    }

    return {
        experiment: 24,
        kind: 'autonomous_validation_gate',
        generatedAt: new Date().toISOString(),
        gateResult,
        reason,
        humanReviewsRequired: gateResult === 'minimal_human_review_required' ? humanQueue.reviewCount : 0,
        allowedDownstreamUse: summary.allowedDownstreamUse,
        warning: 'This gate is based on autonomous evidence, not human semantic ground truth.'
    };
}

function classifyPerturbations(row) {
    const statesByPerturbation = {};
    let changedByPerturbations = 0;

    for (const perturbation of PERTURBATIONS) {
        const params = applyPerturbation(PARAMETERS, perturbation.changes);
        const perturbedState = classifyPointWithParams(row, params);
        statesByPerturbation[ perturbation.name ] = perturbedState;
        if (perturbedState !== row.state) {
            changedByPerturbations += 1;
        }
    }

    return {
        originalState: row.state,
        changedByPerturbations,
        stableAcrossPerturbations: changedByPerturbations === 0,
        statesByPerturbation
    };
}

function classifyEpisodePerturbations(episode, rows) {
    const episodeTypeByPerturbation = {};
    let changedByPerturbations = 0;

    for (const perturbation of PERTURBATIONS) {
        const params = applyPerturbation(PARAMETERS, perturbation.changes);
        const classifiedRows = rows.map((row) => row.row23 ? classifyPointWithParams(row.row23, params) : 'missing');
        const laneSeconds = classifiedRows.filter(isLaneState).length;
        const perturbedType = laneSeconds >= params.minStableSeconds ? 'stable_episode' : 'brief_contact';
        episodeTypeByPerturbation[ perturbation.name ] = perturbedType;
        if (perturbedType !== episode.episodeType) {
            changedByPerturbations += 1;
        }
    }

    return {
        originalType: episode.episodeType,
        changedByPerturbations,
        stableAcrossPerturbations: changedByPerturbations === 0,
        episodeTypeByPerturbation
    };
}

function classifyPointWithParams(row, params) {
    if (row.baseState === 'base_core' || row.distanceToAxis === null || row.distanceToAxis === undefined) {
        return row.state;
    }

    if (row.baseState !== 'outside_base_deployment') {
        return 'deployment_ambiguous';
    }

    if (row.distanceToAxis <= params.maxCoreDistance && row.separationMargin >= params.minMargin) {
        return row.distanceToAxis <= params.maxCoreDistance * 0.68 && row.separationMargin >= params.minMargin * 1.4
            ? 'lane_core_high'
            : 'lane_core_medium';
    }

    if (row.distanceToAxis <= params.maxOccupancyDistance && row.separationMargin >= params.minMargin * 0.5) {
        return 'lane_occupiable';
    }

    return row.state === 'unknown' ? 'unknown' : 'lane_approach';
}

function applyPerturbation(base, changes) {
    return Object.fromEntries(Object.entries(base).map(([ field, value ]) => [ field, value + (changes[ field ] ?? 0) ]));
}

function summarizeSensitivity(changes) {
    return {
        sampleCount: changes.length,
        changedCount: changes.filter((change) => change.changedByPerturbations > 0).length,
        changedPercent: round(percent(changes.filter((change) => change.changedByPerturbations > 0).length, changes.length)),
        byLane: summarizeChangedBy(changes, (change) => change.physicalLaneId ?? 'none'),
        byPlayer: summarizeChangedBy(changes, (change) => String(change.playerIndex)),
        byMatchPhase: summarizeChangedBy(changes, (change) => change.matchPhase)
    };
}

function summarizeChangedBy(changes, keyFn) {
    const groups = groupBy(changes, keyFn);
    return Object.fromEntries(Array.from(groups.entries()).sort(([ left ], [ right ]) => left.localeCompare(right)).map(([ keyName, group ]) => [
        keyName,
        {
            samples: group.length,
            changed: group.filter((change) => change.changedByPerturbations > 0).length,
            changedPercent: round(percent(group.filter((change) => change.changedByPerturbations > 0).length, group.length))
        }
    ]));
}

function determineAllowedUse(pointAudit, episodeAudit) {
    const supportedCore = pointAudit.filter((audit) => audit.evidenceStatus === STATUS.supported
        && [ 'lane_core_high', 'lane_core_medium' ].includes(audit.modelPrediction.state)).length;
    const contradictedCore = pointAudit.filter((audit) => audit.evidenceStatus === STATUS.contradicted
        && [ 'lane_core_high', 'lane_core_medium' ].includes(audit.modelPrediction.state)).length;
    const stableSupportedEpisodes = episodeAudit.filter((audit) => audit.evidenceStatus === STATUS.supported
        && audit.modelPrediction.episodeType === 'stable_episode').length;

    if (supportedCore >= 20 && contradictedCore === 0 && stableSupportedEpisodes >= 8) {
        return {
            allowed: true,
            scope: 'Limited descriptive use for lane_core_high/lane_core_medium points and stable_episode candidates only.',
            prohibited: [
                'transition detection',
                'strategic intent inference',
                'rotation quality judgment',
                'semantic ground-truth claims'
            ]
        };
    }

    return {
        allowed: false,
        scope: null,
        prohibited: [
            'transition detection',
            'strategic intent inference',
            'rotation quality judgment',
            'semantic ground-truth claims'
        ]
    };
}

function findStrongestContradiction(pointAudit, episodeAudit) {
    const contradictions = [ ...pointAudit, ...episodeAudit ]
        .filter((audit) => audit.evidenceStatus === STATUS.contradicted)
        .sort((left, right) => right.contradictoryConditions.length - left.contradictoryConditions.length);

    if (contradictions.length === 0) {
        return null;
    }

    const strongest = contradictions[ 0 ];
    return {
        sampleId: strongest.sampleId,
        reviewKind: strongest.reviewKind,
        modelPrediction: strongest.modelPrediction,
        contradictoryConditions: strongest.contradictoryConditions,
        evidenceMeasurements: strongest.evidenceMeasurements
    };
}

function isDecisionRelevant(audit) {
    return audit.evidenceStatus === STATUS.contradicted
        || audit.evidenceStatus === STATUS.unstable
        || (audit.evidenceStatus === STATUS.unresolved && audit.reviewKind === 'episode');
}

function buildHumanQuestion(kind, prediction, status) {
    if (kind === 'point') {
        return `At this point, is the player semantically occupying ${prediction.physicalLaneId ?? prediction.state}, or is the model state better interpreted as base/deployment/unknown? Evidence status: ${status}.`;
    }

    return `Across this episode interval, does the player continuously occupy ${prediction.physicalLaneId}, or is the interval fragmented, transitional, base/deployment, or ambiguous? Evidence status: ${status}.`;
}

function buildDerivedSignalNotes() {
    return {
        internalConsistency: [
            'Experiment 23 sourceRow.state and sourceRow.physicalLaneId are the prediction under audit.',
            'Containment in experiment 23 stable or brief episodes is not independent semantic confirmation.'
        ],
        independentOrSemiIndependentEvidence: [
            'Experiment 18 movement metrics provide coordinates, speed, nearest-lane distances, and base distance from a separate movement pipeline.',
            'Experiment 17 region timeline provides independently encoded spatial region context.',
            'Experiment 22 provides an earlier parameterization for broad cross-model comparison.'
        ],
        notGroundTruth: [
            'Lane-axis distance is geometry evidence, not semantic ground truth.',
            'Cross-model agreement may share upstream geometry assumptions and cannot be treated as ground truth.',
            'Stability under perturbation supports robustness but does not prove correctness.'
        ]
    };
}

function findContainingEpisode(playerIndex, second, indexes) {
    const stable = indexes.stableEpisodesByPlayer.get(String(playerIndex)) ?? [];
    const brief = indexes.briefContactsByPlayer.get(String(playerIndex)) ?? [];
    const stableMatch = stable.find((episode) => second >= episode.startSecond && second <= episode.endSecond);
    if (stableMatch) {
        return {
            type: 'stable_episode',
            id: stableMatch.episodeId,
            ...stableMatch
        };
    }

    const briefMatch = brief.find((episode) => second >= episode.startSecond && second <= episode.endSecond);
    if (briefMatch) {
        return {
            type: 'brief_contact',
            id: briefMatch.contactId,
            ...briefMatch
        };
    }

    return null;
}

function computeLaneGeometry(movement, laneAxes) {
    if (!movement) {
        return null;
    }

    return Object.fromEntries(laneAxes.map((axis) => [
        axis.physicalLaneId,
        {
            axisDistanceFromMovementMetrics: getMovementLaneDistance(movement, axis.physicalLaneId),
            projectionRange: [ axis.projectionMin, axis.projectionMax ],
            axisConfidence: axis.confidence
        }
    ]));
}

function getMovementLaneDistance(movement, lane) {
    if (!movement || !lane) {
        return null;
    }

    const field = `distanceLane${lane.slice(-1)}`;
    return movement[ field ] ?? null;
}

function isLaneState(state) {
    return typeof state === 'string' && state.startsWith('lane_');
}

function getMatchPhase(second) {
    return PHASES.find((phase) => second >= phase.minSecond && second <= phase.maxSecond)?.name ?? 'late';
}

function key(playerIndex, second) {
    return `${playerIndex}:${second}`;
}

function range(start, end) {
    const values = [];
    for (let value = start; value <= end; value += 1) {
        values.push(value);
    }
    return values;
}

function groupBy(items, keyFn) {
    const groups = new Map();
    for (const item of items) {
        const keyName = keyFn(item);
        const group = groups.get(keyName) ?? [];
        group.push(item);
        groups.set(keyName, group);
    }
    return groups;
}

function countBy(items, keyFn) {
    const counts = {};
    for (const item of items) {
        const keyName = keyFn(item);
        counts[ keyName ] = (counts[ keyName ] ?? 0) + 1;
    }
    return Object.fromEntries(Object.entries(counts).sort(([ left ], [ right ]) => left.localeCompare(right)));
}

function max(values) {
    return values.length > 0 ? Math.max(...values) : null;
}

function min(values) {
    return values.length > 0 ? Math.min(...values) : null;
}

function percent(count, total) {
    return total > 0 ? (count / total) * 100 : 0;
}

function round(value) {
    return Math.round(value * 100) / 100;
}
