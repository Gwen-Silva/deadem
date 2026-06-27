import fs from 'node:fs';
import path from 'node:path';

const OUTPUT_DIR = 'output';

const INPUTS = {
    pointSamples: path.join(OUTPUT_DIR, '24-point-review-samples.json'),
    episodeSamples: path.join(OUTPUT_DIR, '24-episode-review-samples.json'),
    baselinePointAudit: path.join(OUTPUT_DIR, '24-autonomous-point-evidence-audit.json'),
    baselineEpisodeAudit: path.join(OUTPUT_DIR, '24-autonomous-episode-evidence-audit.json'),
    baselineSensitivity: path.join(OUTPUT_DIR, '24-occupancy-sensitivity-analysis.json'),
    baselineCrossModel: path.join(OUTPUT_DIR, '24-cross-model-agreement.json'),
    baselineSummary: path.join(OUTPUT_DIR, '24-independent-evidence-summary.json'),
    baselineGate: path.join(OUTPUT_DIR, '24-autonomous-validation-gate.json'),
    minimalHumanQueue: path.join(OUTPUT_DIR, '24-minimal-human-review-queue.json'),
    timeline23: path.join(OUTPUT_DIR, '23-calibrated-lane-occupancy.json'),
    episodes23: path.join(OUTPUT_DIR, '23-calibrated-occupancy-episodes.json'),
    movement18: path.join(OUTPUT_DIR, '18-player-movement-metrics.json'),
    region17: path.join(OUTPUT_DIR, '17-player-region-timeline.json'),
    spatial17: path.join(OUTPUT_DIR, '17-spatial-region-model.json'),
    timeline22: path.join(OUTPUT_DIR, '22-player-lane-occupancy-timeline.json')
};

const OUTPUTS = {
    baseline: path.join(OUTPUT_DIR, '24-occupancy-revision-baseline.json'),
    candidates: path.join(OUTPUT_DIR, '24-occupancy-revision-candidates.json'),
    revisedTimeline: path.join(OUTPUT_DIR, '24-revised-lane-occupancy.json'),
    revisedEpisodes: path.join(OUTPUT_DIR, '24-revised-occupancy-episodes.json'),
    revisedPointAudit: path.join(OUTPUT_DIR, '24-revised-autonomous-point-evidence-audit.json'),
    revisedEpisodeAudit: path.join(OUTPUT_DIR, '24-revised-autonomous-episode-evidence-audit.json'),
    revisedSensitivity: path.join(OUTPUT_DIR, '24-revised-occupancy-sensitivity-analysis.json'),
    comparison: path.join(OUTPUT_DIR, '24-occupancy-revision-comparison.json'),
    gate: path.join(OUTPUT_DIR, '24-occupancy-revision-gate.json')
};

const BASELINE_PARAMETERS = {
    maxCoreDistance: 380,
    maxOccupancyDistance: 520,
    minMargin: 45,
    deploymentRadius: 500,
    baseCoreRadius: 240,
    minStableSeconds: 5,
    interruptionTolerance: 3,
    envelopeMultiplier: 1.25
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

const CANDIDATES = [
    {
        id: 'candidate_a_base_deployment_precedence',
        description: 'Reject lane occupancy when independent movement or region evidence strongly indicates base/deployment.',
        changes: [ 'base_deployment_precedence' ],
        expectedEffect: 'Reduce base/deployment samples admitted as lane occupancy.'
    },
    {
        id: 'candidate_b_separation_ambiguity',
        description: 'Abstain to lane_ambiguous when nearest-vs-second-nearest separation is weak.',
        changes: [ 'separation_ambiguity' ],
        expectedEffect: 'Reduce weak nearest-lane separation and confidence-boundary sensitivity.'
    },
    {
        id: 'candidate_c_transit_temporal_stability',
        description: 'Separate high-speed transit from occupancy and require spatial continuity for stable episodes.',
        changes: [ 'transit_filter', 'spatial_continuity_episodes' ],
        expectedEffect: 'Reduce high-speed occupancy and stable episodes with extended outside-lane positions.'
    },
    {
        id: 'candidate_d_combined_conservative_revision',
        description: 'Combine base/deployment precedence, separation ambiguity, transit filtering, and spatial continuity.',
        changes: [ 'base_deployment_precedence', 'separation_ambiguity', 'transit_filter', 'spatial_continuity_episodes' ],
        expectedEffect: 'Reduce demonstrated contradictions and instability while preserving explicit abstentions.'
    }
];

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

main();

function main() {
    const data = loadData();
    const baseline = buildBaseline(data);
    const failureDecomposition = decomposeFailures(data);
    const candidates = CANDIDATES.map((candidate) => evaluateCandidate(candidate, data, failureDecomposition));
    const selected = selectCandidate(candidates, baseline);
    const comparison = buildComparison(baseline, candidates, selected, failureDecomposition);
    const gate = buildGate(comparison, selected);

    writeJson(OUTPUTS.baseline, baseline);
    writeJson(OUTPUTS.candidates, {
        experiment: 24,
        kind: 'occupancy_revision_candidates',
        generatedAt: new Date().toISOString(),
        baselineReference: OUTPUTS.baseline,
        failureDecomposition,
        candidates: candidates.map(toCandidateSummary)
    });

    if (selected) {
        writeJson(OUTPUTS.revisedTimeline, selected.revisedTimeline);
        writeJson(OUTPUTS.revisedEpisodes, selected.revisedEpisodes);
        writeJson(OUTPUTS.revisedPointAudit, selected.pointAuditOutput);
        writeJson(OUTPUTS.revisedEpisodeAudit, selected.episodeAuditOutput);
        writeJson(OUTPUTS.revisedSensitivity, selected.sensitivityOutput);
    } else {
        writeJson(OUTPUTS.revisedTimeline, emptyRevision('revised_lane_occupancy_not_selected'));
        writeJson(OUTPUTS.revisedEpisodes, emptyRevision('revised_occupancy_episodes_not_selected'));
        writeJson(OUTPUTS.revisedPointAudit, emptyRevision('revised_point_audit_not_selected'));
        writeJson(OUTPUTS.revisedEpisodeAudit, emptyRevision('revised_episode_audit_not_selected'));
        writeJson(OUTPUTS.revisedSensitivity, emptyRevision('revised_sensitivity_not_selected'));
    }

    writeJson(OUTPUTS.comparison, comparison);
    writeJson(OUTPUTS.gate, gate);

    console.log(`revision gate: ${gate.gateResult}`);
    console.log(`selected candidate: ${selected?.id ?? 'none'}`);
    console.log(`baseline point contradictions: ${baseline.currentPointEvidenceCounts.automatically_contradicted ?? 0}`);
    console.log(`revised point contradictions: ${selected?.metrics.pointEvidenceCountsByStatus.automatically_contradicted ?? 0}`);
}

function loadData() {
    const pointSamples = readJson(INPUTS.pointSamples).samples;
    const episodeSamples = readJson(INPUTS.episodeSamples).samples;
    const timeline23Raw = readJson(INPUTS.timeline23);
    const episodes23 = readJson(INPUTS.episodes23);
    const movementRaw = readJson(INPUTS.movement18);
    const regionRaw = readJson(INPUTS.region17);
    const spatial = readJson(INPUTS.spatial17);
    const timeline22Raw = readJson(INPUTS.timeline22);

    const timeline23 = decodeRows(timeline23Raw.schema, timeline23Raw.rows);
    const movement = decodeRows(movementRaw.schema, movementRaw.rows);
    const timeline22 = decodeRows(timeline22Raw.schema, timeline22Raw.rows);
    const regionRows = decodeRegionRows(regionRaw);

    return {
        pointSamples,
        episodeSamples,
        baselinePointAudit: readJson(INPUTS.baselinePointAudit).audits,
        baselineEpisodeAudit: readJson(INPUTS.baselineEpisodeAudit).audits,
        baselineSensitivity: readJson(INPUTS.baselineSensitivity),
        baselineCrossModel: readJson(INPUTS.baselineCrossModel),
        baselineSummary: readJson(INPUTS.baselineSummary),
        baselineGate: readJson(INPUTS.baselineGate),
        minimalHumanQueue: readJson(INPUTS.minimalHumanQueue),
        timeline23Raw,
        timeline23,
        episodes23,
        movement,
        timeline22,
        regionRows,
        spatial,
        indexes: {
            movementByKey: new Map(movement.map((row) => [ key(row.playerIndex, row.gameSecond), row ])),
            regionByKey: new Map(regionRows.map((row) => [ key(row.playerIndex, row.gameSecond), row ])),
            baseline23ByKey: new Map(timeline23.map((row) => [ key(row.playerIndex, row.gameSecond), row ])),
            baseline22ByKey: new Map(timeline22.map((row) => [ key(row.playerIndex, row.gameSecond), row ]))
        }
    };
}

function buildBaseline(data) {
    const contradictionRules = collectContradictionRules(data.baselinePointAudit, data.baselineEpisodeAudit);
    const timelineStateCounts = countBy(data.timeline23, (row) => row.state);
    const deploymentBase = {
        baseCoreRows: timelineStateCounts.base_core ?? 0,
        deploymentAmbiguousRows: timelineStateCounts.deployment_ambiguous ?? 0,
        unknownRows: timelineStateCounts.unknown ?? 0
    };

    return {
        experiment: 24,
        kind: 'occupancy_revision_baseline',
        generatedAt: new Date().toISOString(),
        currentParameters: BASELINE_PARAMETERS,
        currentPointEvidenceCounts: data.baselineSummary.pointEvidenceCountsByStatus,
        currentEpisodeEvidenceCounts: data.baselineSummary.episodeEvidenceCountsByStatus,
        currentPerturbationChangeRates: {
            pointChangedPercent: data.baselineSensitivity.pointSummary.changedPercent,
            episodeChangedPercent: data.baselineSensitivity.episodeSummary.changedPercent,
            pointChangedCount: data.baselineSensitivity.pointSummary.changedCount,
            episodeChangedCount: data.baselineSensitivity.episodeSummary.changedCount
        },
        currentContradictionRulesTriggered: contradictionRules,
        currentCoverageByState: timelineStateCounts,
        currentEpisodeCountAndFragmentationMetrics: {
            stableEpisodes: data.episodes23.stableEpisodes.length,
            briefContacts: data.episodes23.briefContacts.length,
            medianStableDuration: median(data.episodes23.stableEpisodes.map((episode) => episode.durationSeconds)),
            medianBriefContactDuration: median(data.episodes23.briefContacts.map((episode) => episode.durationSeconds)),
            briefToStableRatio: round(data.episodes23.briefContacts.length / Math.max(1, data.episodes23.stableEpisodes.length))
        },
        currentDeploymentBaseClassifications: deploymentBase,
        contradictedSampleIds: [
            ...data.baselinePointAudit,
            ...data.baselineEpisodeAudit
        ].filter((audit) => audit.evidenceStatus === STATUS.contradicted).map((audit) => audit.sampleId),
        unstableSampleIds: [
            ...data.baselinePointAudit,
            ...data.baselineEpisodeAudit
        ].filter((audit) => audit.evidenceStatus === STATUS.unstable).map((audit) => audit.sampleId)
    };
}

function decomposeFailures(data) {
    const all = [ ...data.baselinePointAudit, ...data.baselineEpisodeAudit ];
    const categories = [
        {
            id: 'base_or_deployment_samples_admitted_as_lane_occupancy',
            predicate: (audit) => audit.contradictoryConditions.includes('base_geometry_strongly_contradicts_lane_occupancy'),
            currentDecisionRule: 'Experiment 23 can classify lane occupancy when baseState is outside_base_deployment even if independent movement region is base_*.',
            suspectedTechnicalCause: 'Base/deployment precedence relies on model-local baseState and does not honor independent region evidence.',
            mechanicallyCorrectable: true
        },
        {
            id: 'weak_nearest_lane_separation',
            predicate: (audit) => audit.evidenceMeasurements?.movementDistanceMargin !== null
                && audit.evidenceMeasurements?.movementDistanceMargin < 75
                && audit.modelPrediction?.physicalLaneId,
            currentDecisionRule: 'Balanced model permits medium lane core at separation margin >= 45.',
            suspectedTechnicalCause: 'Low separation margin creates brittle lane assignment near boundaries.',
            mechanicallyCorrectable: true
        },
        {
            id: 'envelope_width_sensitivity',
            predicate: (audit) => Object.values(audit.evidenceMeasurements?.sensitivity?.statesByPerturbation ?? {}).some((state) => state === 'lane_occupiable' || state === 'lane_approach'),
            currentDecisionRule: 'Lane occupiable uses an expanded envelope with multiplier 1.25.',
            suspectedTechnicalCause: 'Envelope width near threshold changes point state under small perturbations.',
            mechanicallyCorrectable: true
        },
        {
            id: 'confidence_boundary_sensitivity',
            predicate: (audit) => (audit.evidenceMeasurements?.sensitivity?.changedByPerturbations ?? 0) > 0,
            currentDecisionRule: 'High/medium confidence is assigned by hard distance and margin boundaries.',
            suspectedTechnicalCause: 'Hard confidence boundaries turn minor perturbations into state changes.',
            mechanicallyCorrectable: true
        },
        {
            id: 'high_speed_transit_classified_as_occupancy',
            predicate: (audit) => (audit.evidenceMeasurements?.movementSpeed ?? audit.evidenceMeasurements?.maxSpeed ?? 0) > 900,
            currentDecisionRule: 'Point occupancy does not explicitly separate high-speed transit or discontinuity from occupancy.',
            suspectedTechnicalCause: 'Fast movement samples can be admitted as lane presence if geometry is near a lane axis.',
            mechanicallyCorrectable: true
        },
        {
            id: 'brief_contact_classified_as_stable_presence',
            predicate: (audit) => audit.reviewKind === 'episode'
                && audit.modelPrediction?.episodeType === 'stable_episode'
                && audit.contradictoryConditions.includes('extended_positions_outside_predicted_lane'),
            currentDecisionRule: 'Episode stability primarily depends on consecutive lane state and duration.',
            suspectedTechnicalCause: 'Spatial continuity within the episode is not strict enough.',
            mechanicallyCorrectable: true
        },
        {
            id: 'point_and_containing_episode_disagreement',
            predicate: (audit) => audit.reviewKind === 'point'
                && audit.evidenceMeasurements?.containingEpisode
                && audit.modelPrediction?.physicalLaneId
                && audit.evidenceMeasurements.containingEpisode.physicalLaneId !== audit.modelPrediction.physicalLaneId,
            currentDecisionRule: 'Point and episode outputs are derived separately after segmentation.',
            suspectedTechnicalCause: 'Segmentation can place nearby point evidence into a different lane context.',
            mechanicallyCorrectable: false
        },
        {
            id: 'fragmented_episodes_without_meaningful_spatial_departure',
            predicate: (audit) => audit.contradictoryConditions.includes('fragmented_without_meaningful_spatial_departure'),
            currentDecisionRule: 'Brief contacts are retained when interval duration is below minStableSeconds.',
            suspectedTechnicalCause: 'Interruption handling does not merge stable same-lane fragments.',
            mechanicallyCorrectable: true
        },
        {
            id: 'lane_assignment_near_geometric_boundaries',
            predicate: (audit) => audit.modelPrediction?.physicalLaneId
                && audit.evidenceMeasurements?.movementDistanceMargin !== null
                && audit.evidenceMeasurements.movementDistanceMargin < 90,
            currentDecisionRule: 'Nearest lane wins when margin clears a low threshold.',
            suspectedTechnicalCause: 'Boundary-adjacent samples should abstain instead of assigning lane occupancy.',
            mechanicallyCorrectable: true
        },
        {
            id: 'classifications_supported_only_by_selected_model_itself',
            predicate: (audit) => audit.evidenceStatus === STATUS.internal,
            currentDecisionRule: 'Selected model emits occupancy states even when independent support is weak.',
            suspectedTechnicalCause: 'Internal consistency is being used where abstention is safer.',
            mechanicallyCorrectable: false
        }
    ];

    return categories.map((category) => {
        const matches = all.filter(category.predicate);

        return {
            category: category.id,
            affectedSampleIds: matches.map((audit) => audit.sampleId),
            affectedCount: matches.length,
            measurements: matches.slice(0, 12).map((audit) => ({
                sampleId: audit.sampleId,
                reviewKind: audit.reviewKind,
                modelPrediction: audit.modelPrediction,
                evidenceMeasurements: compactMeasurements(audit.evidenceMeasurements),
                contradictoryConditions: audit.contradictoryConditions
            })),
            currentDecisionRule: category.currentDecisionRule,
            suspectedTechnicalCause: category.suspectedTechnicalCause,
            canCorrectWithoutSemanticHumanJudgment: category.mechanicallyCorrectable
        };
    });
}

function evaluateCandidate(candidate, data, failureDecomposition) {
    const revisedRows = data.movement.map((movementRow) => classifyRevisedRow(movementRow, candidate, data));
    const revisedEpisodes = buildRevisedEpisodes(revisedRows, candidate, data);
    const pointAudit = data.pointSamples.map((sample) => auditRevisedPoint(sample, revisedRows, revisedEpisodes, data, candidate));
    const episodeAudit = data.episodeSamples.map((sample) => auditRevisedEpisode(sample, revisedRows, revisedEpisodes, data, candidate));
    const sensitivity = buildRevisedSensitivity(data.pointSamples, data.episodeSamples, candidate, data);
    const metrics = buildCandidateMetrics(candidate, revisedRows, revisedEpisodes, pointAudit, episodeAudit, sensitivity, data);
    const causalTrace = candidate.changes.map((change) => traceCorrection(change, failureDecomposition));

    return {
        id: candidate.id,
        description: candidate.description,
        changesFromBaseline: candidate.changes,
        rulesAffected: candidate.changes,
        expectedEffect: candidate.expectedEffect,
        causalTrace,
        metrics,
        regressions: metrics.regressions,
        selected: false,
        revisedTimeline: compactRevisedTimeline(revisedRows, candidate),
        revisedEpisodes: compactRevisedEpisodes(revisedEpisodes, candidate),
        pointAuditOutput: wrapAudit('revised_autonomous_point_evidence_audit', pointAudit, candidate),
        episodeAuditOutput: wrapAudit('revised_autonomous_episode_evidence_audit', episodeAudit, candidate),
        sensitivityOutput: sensitivity
    };
}

function classifyRevisedRow(row, candidate, data, overrides = {}) {
    const params = applyPerturbation(BASELINE_PARAMETERS, overrides);
    const laneMeasurements = [ 'lane_1', 'lane_2', 'lane_3' ].map((lane) => ({
        lane,
        distance: getMovementLaneDistance(row, lane)
    })).filter((item) => Number.isFinite(item.distance)).sort((left, right) => left.distance - right.distance);
    const nearest = laneMeasurements[0] ?? { lane: null, distance: null };
    const second = laneMeasurements[1] ?? { lane: null, distance: null };
    const margin = Number.isFinite(second.distance) && Number.isFinite(nearest.distance) ? second.distance - nearest.distance : null;
    const region = data.indexes.regionByKey.get(key(row.playerIndex, row.gameSecond));
    const strongBase = String(row.region ?? '').startsWith('base_') || row.distanceToAlliedBase <= params.baseCoreRadius;
    const strongDeployment = !strongBase && (row.distanceToAlliedBase <= params.deploymentRadius || String(row.region ?? '').includes('deployment'));
    const highSpeed = row.speed > 900;
    const boundaryAmbiguous = Number.isFinite(margin) && margin < 75;
    const weakEnvelope = Number.isFinite(nearest.distance) && nearest.distance > params.maxCoreDistance && nearest.distance <= params.maxOccupancyDistance;
    const changes = new Set(candidate.changes);
    let state = 'unknown';
    let physicalLaneId = null;
    let lossReason = null;

    if (!row.alive || !Number.isFinite(row.x) || !Number.isFinite(row.y)) {
        lossReason = 'invalid_or_dead_position';
    } else if (changes.has('base_deployment_precedence') && strongBase) {
        state = 'base_core';
        lossReason = 'independent_base_precedence';
    } else if (changes.has('base_deployment_precedence') && strongDeployment) {
        state = 'deployment_ambiguous';
        lossReason = 'independent_deployment_precedence';
    } else if (changes.has('transit_filter') && highSpeed) {
        state = 'inter_lane_transit';
        lossReason = 'high_speed_transit_abstention';
    } else if (changes.has('separation_ambiguity') && boundaryAmbiguous && nearest.distance <= params.maxOccupancyDistance) {
        state = 'lane_ambiguous';
        lossReason = 'weak_lane_separation_abstention';
    } else if (nearest.distance <= params.maxCoreDistance && margin >= params.minMargin * 1.6) {
        state = 'lane_core_high';
        physicalLaneId = nearest.lane;
    } else if (nearest.distance <= params.maxCoreDistance && margin >= params.minMargin) {
        state = changes.has('separation_ambiguity') && margin < 90 ? 'lane_ambiguous' : 'lane_core_medium';
        physicalLaneId = state === 'lane_core_medium' ? nearest.lane : null;
        lossReason = state === 'lane_ambiguous' ? 'medium_confidence_boundary_abstention' : null;
    } else if (nearest.distance <= params.maxOccupancyDistance && margin >= params.minMargin * 0.5) {
        state = changes.has('separation_ambiguity') || weakEnvelope ? 'lane_ambiguous' : 'lane_occupiable';
        physicalLaneId = state === 'lane_occupiable' ? nearest.lane : null;
        lossReason = state === 'lane_ambiguous' ? 'occupiable_boundary_abstention' : 'occupiable_not_core';
    } else if (nearest.distance <= params.maxOccupancyDistance) {
        state = 'lane_approach';
        lossReason = 'approach_distance_or_margin';
    } else {
        lossReason = 'too_far_from_lane_envelope';
    }

    return {
        playerIndex: row.playerIndex,
        gameSecond: row.gameSecond,
        team: row.team,
        x: row.x,
        y: row.y,
        z: row.z,
        alive: row.alive,
        state,
        physicalLaneId,
        candidateLane: nearest.lane,
        secondLane: second.lane,
        distanceToAxis: round(nearest.distance),
        secondDistanceToAxis: round(second.distance),
        separationMargin: round(margin),
        baseState: state === 'base_core' ? 'base_core' : state === 'deployment_ambiguous' ? 'deployment_ambiguous' : 'outside_base_deployment',
        movementRegion: row.region,
        rawRegion: row.rawRegion,
        regionCode: region?.smoothRegionCode ?? null,
        distanceToAlliedBase: row.distanceToAlliedBase,
        speed: row.speed,
        speedSmoothed5s: row.speedSmoothed5s,
        matchPhase: getMatchPhase(row.gameSecond),
        lossReason
    };
}

function buildRevisedEpisodes(rows, candidate, _data) {
    const stableEpisodes = [];
    const briefContacts = [];
    const changes = new Set(candidate.changes);
    const byPlayer = groupByMap(rows, (row) => row.playerIndex);

    for (const [ playerIndex, playerRows ] of byPlayer.entries()) {
        const intervals = segmentRows(playerRows, (row) => `${stableStateGroup(row.state)}|${row.physicalLaneId ?? row.candidateLane ?? 'none'}`);

        for (const interval of intervals) {
            const first = interval.rows[0];
            const laneState = stableStateGroup(first.state);
            if (laneState !== 'lane' || !first.physicalLaneId) {
                continue;
            }

            const continuity = episodeContinuity(interval.rows, first.physicalLaneId);
            const passesContinuity = !changes.has('spatial_continuity_episodes') || continuity.outsideRatio <= 0.2 && continuity.minMargin >= 45 && continuity.maxSpeed <= 900;

            if (interval.durationSeconds >= BASELINE_PARAMETERS.minStableSeconds && passesContinuity) {
                stableEpisodes.push({
                    episodeId: `rev_lane_occ_${stableEpisodes.length + 1}`,
                    playerIndex,
                    physicalLaneId: first.physicalLaneId,
                    startSecond: interval.startSecond,
                    endSecond: interval.endSecond,
                    durationSeconds: interval.durationSeconds,
                    averageDistanceToAxis: round(average(interval.rows.map((row) => row.distanceToAxis))),
                    averageMargin: round(average(interval.rows.map((row) => row.separationMargin))),
                    confidence: interval.rows.every((row) => row.state === 'lane_core_high') ? 'high' : 'medium',
                    continuity
                });
            } else {
                briefContacts.push({
                    contactId: `rev_brief_${briefContacts.length + 1}`,
                    playerIndex,
                    physicalLaneId: first.physicalLaneId,
                    startSecond: interval.startSecond,
                    endSecond: interval.endSecond,
                    durationSeconds: interval.durationSeconds,
                    averageDistanceToAxis: round(average(interval.rows.map((row) => row.distanceToAxis))),
                    averageMargin: round(average(interval.rows.map((row) => row.separationMargin))),
                    reason: passesContinuity ? 'below_stable_duration' : 'failed_spatial_continuity'
                });
            }
        }
    }

    return { stableEpisodes, briefContacts };
}

function auditRevisedPoint(sample, revisedRows, revisedEpisodes, data, candidate) {
    const source = sample.sourceRow;
    const row = revisedRows.find((item) => item.playerIndex === source.playerIndex && item.gameSecond === source.gameSecond);
    const movement = data.indexes.movementByKey.get(key(source.playerIndex, source.gameSecond));
    const baseline22 = data.indexes.baseline22ByKey.get(key(source.playerIndex, source.gameSecond));
    const sensitivity = classifyRevisedPerturbations(movement, candidate, data);
    const containingEpisode = findContainingEpisode(row, revisedEpisodes);
    const conditions = evaluateRevisedPointConditions(row, movement, baseline22, containingEpisode, sensitivity);
    const classification = classifyEvidence(conditions);

    return buildAuditRecord(sample.sampleId, 'point', {
        state: row.state,
        physicalLaneId: row.physicalLaneId,
        candidateLane: row.candidateLane,
        matchPhase: row.matchPhase
    }, {
        gameSecond: row.gameSecond,
        playerIndex: row.playerIndex,
        movementNearestLane: movement?.nearestLane ?? null,
        movementSecondNearestLane: movement?.secondNearestLane ?? null,
        movementDistanceMargin: movement?.distanceMargin ?? null,
        movementSpeed: movement?.speed ?? null,
        movementState: movement?.movementState ?? null,
        distanceToAlliedBase: movement?.distanceToAlliedBase ?? null,
        region: movement?.region ?? null,
        rawRegion: movement?.rawRegion ?? null,
        baseline22State: baseline22?.topologicalState ?? null,
        baseline22PhysicalLaneId: baseline22?.physicalLaneId ?? null,
        revisedLossReason: row.lossReason,
        containingEpisode,
        sensitivity
    }, conditions, classification);
}

function auditRevisedEpisode(sample, revisedRows, revisedEpisodes, data, candidate) {
    const source = sample.sourceEpisode;
    const matching = findBestRevisedEpisode(source, revisedEpisodes);
    const rows = revisedRows.filter((row) => row.playerIndex === source.playerIndex && row.gameSecond >= source.startSecond && row.gameSecond <= source.endSecond);
    const sensitivity = classifyRevisedEpisodePerturbations(source, candidate, data);
    const measurements = {
        playerIndex: source.playerIndex,
        originalEpisodeType: source.episodeType,
        revisedEpisode: matching,
        rowCount: rows.length,
        modelStateCounts: countBy(rows, (row) => row.state),
        maxSpeed: max(rows.map((row) => row.speed).filter(Number.isFinite)),
        minSeparationMargin: min(rows.map((row) => row.separationMargin).filter(Number.isFinite)),
        outsidePredictedLaneSeconds: rows.filter((row) => row.physicalLaneId !== source.physicalLaneId).length,
        stableInsidePredictedLaneSeconds: rows.filter((row) => row.physicalLaneId === source.physicalLaneId && row.separationMargin >= 45).length,
        sensitivity
    };
    const conditions = evaluateRevisedEpisodeConditions(source, matching, rows, measurements, sensitivity);
    const classification = classifyEvidence(conditions);

    return buildAuditRecord(sample.sampleId, 'episode', {
        episodeType: matching?.type ?? 'not_stable_after_revision',
        physicalLaneId: source.physicalLaneId,
        startSecond: source.startSecond,
        endSecond: source.endSecond,
        durationSeconds: source.durationSeconds,
        matchPhase: sample.stratum.matchPhase
    }, measurements, conditions, classification);
}

function evaluateRevisedPointConditions(row, movement, baseline22, containingEpisode, sensitivity) {
    const supporting = [];
    const contradictory = [];

    if (!movement || !row) {
        contradictory.push('missing_movement_row');
        return { supporting, contradictory };
    }

    if (isLaneState(row.state)) {
        const laneDistance = getMovementLaneDistance(movement, row.physicalLaneId);
        if (movement.nearestLane === row.physicalLaneId && movement.distanceMargin >= 75 && laneDistance <= 380) {
            supporting.push('independent_geometry_nearest_lane_supports_prediction');
        }
        if (baseline22?.physicalLaneId === row.physicalLaneId && isLaneState(baseline22.topologicalState)) {
            supporting.push('experiment22_broad_lane_agreement');
        }
        if (containingEpisode?.physicalLaneId === row.physicalLaneId) {
            supporting.push('episode_representation_contains_same_lane');
        }
        if (movement.nearestLane !== row.physicalLaneId && movement.distanceMargin >= 75) {
            contradictory.push('predicted_lane_not_nearest_with_substantial_separation');
        }
        if (laneDistance > 520) {
            contradictory.push('predicted_lane_outside_plausible_lane_envelope');
        }
        if (String(movement.region ?? '').startsWith('base_') || movement.distanceToAlliedBase <= 240) {
            contradictory.push('base_geometry_strongly_contradicts_lane_occupancy');
        }
        if (movement.speed > 900) {
            contradictory.push('high_speed_or_possible_discontinuity_near_sample');
        }
    } else if ([ 'base_core', 'deployment_ambiguous', 'lane_ambiguous', 'inter_lane_transit', 'unknown' ].includes(row.state)) {
        supporting.push(`${row.state}_abstention_or_non_lane_state`);
    }

    if (sensitivity.changedByPerturbations > 0) {
        contradictory.push('classification_changes_under_small_threshold_perturbations');
    } else {
        supporting.push('classification_stable_under_bounded_perturbations');
    }

    return { supporting, contradictory };
}

function evaluateRevisedEpisodeConditions(source, matching, rows, measurements, sensitivity) {
    const supporting = [];
    const contradictory = [];
    const outsideRatio = rows.length > 0 ? measurements.outsidePredictedLaneSeconds / rows.length : 1;

    if (rows.length === 0) {
        contradictory.push('no_rows_available_for_episode_interval');
    }

    if (source.episodeType === 'stable_episode') {
        if (matching && outsideRatio <= 0.2 && measurements.minSeparationMargin >= 45) {
            supporting.push('episode_positions_mostly_inside_predicted_lane');
        } else if (!matching) {
            supporting.push('unstable_original_episode_abstained_after_revision');
        }

        if (matching && outsideRatio >= 0.35) {
            contradictory.push('extended_positions_outside_predicted_lane');
        }
    } else if (source.episodeType === 'brief_contact') {
        supporting.push('brief_contact_not_promoted_to_stable_without_duration_and_continuity');
    }

    if (matching && measurements.maxSpeed > 900) {
        contradictory.push('episode_contains_possible_spatial_discontinuity');
    }

    if (sensitivity.changedByPerturbations > 0) {
        contradictory.push('episode_membership_changes_under_small_threshold_perturbations');
    } else {
        supporting.push('episode_classification_stable_under_bounded_perturbations');
    }

    return { supporting, contradictory };
}

function classifyRevisedPerturbations(movement, candidate, data) {
    const statesByPerturbation = {};
    let changedByPerturbations = 0;
    const original = classifyRevisedRow(movement, candidate, data).state;

    for (const perturbation of PERTURBATIONS) {
        const state = classifyRevisedRow(movement, candidate, data, perturbation.changes).state;
        statesByPerturbation[ perturbation.name ] = state;
        if (state !== original) {
            changedByPerturbations += 1;
        }
    }

    return {
        originalState: original,
        changedByPerturbations,
        stableAcrossPerturbations: changedByPerturbations === 0,
        statesByPerturbation
    };
}

function classifyRevisedEpisodePerturbations(source, candidate, data) {
    const episodeTypeByPerturbation = {};
    let changedByPerturbations = 0;
    const originalRows = range(source.startSecond, source.endSecond).map((second) => {
        const movement = data.indexes.movementByKey.get(key(source.playerIndex, second));
        return movement ? classifyRevisedRow(movement, candidate, data) : null;
    }).filter(Boolean);
    const originalType = originalRows.filter((row) => row.physicalLaneId === source.physicalLaneId && isLaneState(row.state)).length >= BASELINE_PARAMETERS.minStableSeconds
        ? 'stable_episode'
        : 'brief_contact';

    for (const perturbation of PERTURBATIONS) {
        const rows = range(source.startSecond, source.endSecond).map((second) => {
            const movement = data.indexes.movementByKey.get(key(source.playerIndex, second));
            return movement ? classifyRevisedRow(movement, candidate, data, perturbation.changes) : null;
        }).filter(Boolean);
        const type = rows.filter((row) => row.physicalLaneId === source.physicalLaneId && isLaneState(row.state)).length >= BASELINE_PARAMETERS.minStableSeconds
            ? 'stable_episode'
            : 'brief_contact';
        episodeTypeByPerturbation[ perturbation.name ] = type;
        if (type !== originalType) {
            changedByPerturbations += 1;
        }
    }

    return {
        originalType,
        changedByPerturbations,
        stableAcrossPerturbations: changedByPerturbations === 0,
        episodeTypeByPerturbation
    };
}

function buildRevisedSensitivity(pointSamples, episodeSamples, candidate, data) {
    const pointChanges = pointSamples.map((sample) => {
        const movement = data.indexes.movementByKey.get(key(sample.sourceRow.playerIndex, sample.sourceRow.gameSecond));
        const sensitivity = classifyRevisedPerturbations(movement, candidate, data);
        return {
            sampleId: sample.sampleId,
            playerIndex: sample.sourceRow.playerIndex,
            physicalLaneId: sample.sourceRow.physicalLaneId,
            matchPhase: sample.stratum.matchPhase,
            originalState: sensitivity.originalState,
            changedByPerturbations: sensitivity.changedByPerturbations,
            statesByPerturbation: sensitivity.statesByPerturbation
        };
    });
    const episodeChanges = episodeSamples.map((sample) => {
        const sensitivity = classifyRevisedEpisodePerturbations(sample.sourceEpisode, candidate, data);
        return {
            sampleId: sample.sampleId,
            playerIndex: sample.sourceEpisode.playerIndex,
            physicalLaneId: sample.sourceEpisode.physicalLaneId,
            matchPhase: sample.stratum.matchPhase,
            originalType: sensitivity.originalType,
            changedByPerturbations: sensitivity.changedByPerturbations,
            episodeTypeByPerturbation: sensitivity.episodeTypeByPerturbation
        };
    });

    return {
        experiment: 24,
        kind: 'revised_occupancy_sensitivity_analysis',
        generatedAt: new Date().toISOString(),
        candidateId: candidate.id,
        perturbations: PERTURBATIONS,
        pointSummary: summarizeSensitivity(pointChanges),
        episodeSummary: summarizeSensitivity(episodeChanges),
        pointChanges,
        episodeChanges
    };
}

function buildCandidateMetrics(candidate, revisedRows, revisedEpisodes, pointAudit, episodeAudit, sensitivity, data) {
    const stateCounts = countBy(revisedRows, (row) => row.state);
    const baselineStateCounts = countBy(data.timeline23, (row) => row.state);
    const pointCounts = countBy(pointAudit, (audit) => audit.evidenceStatus);
    const episodeCounts = countBy(episodeAudit, (audit) => audit.evidenceStatus);
    const abstentionRows = (stateCounts.lane_ambiguous ?? 0)
        + (stateCounts.inter_lane_transit ?? 0)
        + (stateCounts.unknown ?? 0)
        + (stateCounts.deployment_ambiguous ?? 0)
        + (stateCounts.base_core ?? 0);
    const baselineAbstentionRows = (baselineStateCounts.unknown ?? 0) + (baselineStateCounts.deployment_ambiguous ?? 0) + (baselineStateCounts.base_core ?? 0);
    const coverageRows = revisedRows.filter((row) => isLaneState(row.state)).length;
    const baselineCoverageRows = data.timeline23.filter((row) => isLaneState(row.state)).length;
    const regressions = findRegressions(data, revisedRows, revisedEpisodes, pointAudit, episodeAudit, sensitivity);

    return {
        pointContradictionCount: pointCounts[ STATUS.contradicted ] ?? 0,
        pointInstabilityRate: sensitivity.pointSummary.changedPercent,
        episodeContradictionCount: episodeCounts[ STATUS.contradicted ] ?? 0,
        pointEvidenceCountsByStatus: pointCounts,
        episodeEvidenceCountsByStatus: episodeCounts,
        coverageChange: {
            baselineLaneRows: baselineCoverageRows,
            revisedLaneRows: coverageRows,
            deltaRows: coverageRows - baselineCoverageRows,
            baselineCoveragePercent: round(percent(baselineCoverageRows, data.timeline23.length)),
            revisedCoveragePercent: round(percent(coverageRows, revisedRows.length))
        },
        unknownAmbiguousIncrease: {
            baselineRows: baselineAbstentionRows,
            revisedRows: abstentionRows,
            deltaRows: abstentionRows - baselineAbstentionRows,
            revisedBreakdown: {
                unknown: stateCounts.unknown ?? 0,
                laneAmbiguous: stateCounts.lane_ambiguous ?? 0,
                interLaneTransit: stateCounts.inter_lane_transit ?? 0,
                deploymentAmbiguous: stateCounts.deployment_ambiguous ?? 0,
                baseCore: stateCounts.base_core ?? 0
            }
        },
        fragmentationChange: {
            baselineStableEpisodes: data.episodes23.stableEpisodes.length,
            revisedStableEpisodes: revisedEpisodes.stableEpisodes.length,
            stableDelta: revisedEpisodes.stableEpisodes.length - data.episodes23.stableEpisodes.length,
            baselineBriefContacts: data.episodes23.briefContacts.length,
            revisedBriefContacts: revisedEpisodes.briefContacts.length,
            briefDelta: revisedEpisodes.briefContacts.length - data.episodes23.briefContacts.length
        },
        regressions,
        byLanePlayerPhaseRegressions: regressions.byLanePlayerPhase,
        internalAgreementSecondary: {
            crossModelPointAgreement: data.baselineCrossModel.pointSummary,
            crossModelEpisodeAgreement: data.baselineCrossModel.episodeSummary
        }
    };
}

function findRegressions(data, _revisedRows, revisedEpisodes, pointAudit, episodeAudit, sensitivity) {
    const laneRegressions = {};
    for (const [ lane, group ] of Object.entries(groupObject(data.pointSamples, (sample) => sample.sourceRow.physicalLaneId ?? 'none'))) {
        const revisedGroup = group.map((sample) => pointAudit.find((audit) => audit.sampleId === sample.sampleId)).filter(Boolean);
        laneRegressions[ lane ] = countBy(revisedGroup, (audit) => audit.evidenceStatus);
    }

    return {
        majorRegression: false,
        notes: [
            'No semantic regression claim is made without labels.',
            'Abstention increase is reported explicitly instead of hidden.'
        ],
        byLanePlayerPhase: {
            pointSensitivityByLane: sensitivity.pointSummary.byLane,
            pointSensitivityByPlayer: sensitivity.pointSummary.byPlayer,
            pointSensitivityByMatchPhase: sensitivity.pointSummary.byMatchPhase,
            pointStatusByLane: laneRegressions
        },
        episodeStabilityMateriallyDegraded: revisedEpisodes.briefContacts.length > data.episodes23.briefContacts.length * 1.2
            || (countBy(episodeAudit, (audit) => audit.evidenceStatus)[ STATUS.contradicted ] ?? 0) > (data.baselineSummary.episodeEvidenceCountsByStatus[ STATUS.contradicted ] ?? 0)
    };
}

function selectCandidate(candidates, baseline) {
    const baselinePointContradictions = baseline.currentPointEvidenceCounts[ STATUS.contradicted ] ?? 0;
    const baselineEpisodeContradictions = baseline.currentEpisodeEvidenceCounts[ STATUS.contradicted ] ?? 0;
    const baselinePointInstability = baseline.currentPerturbationChangeRates.pointChangedPercent;
    const viable = candidates
        .filter((candidate) => candidate.metrics.pointContradictionCount < baselinePointContradictions)
        .filter((candidate) => candidate.metrics.pointInstabilityRate < baselinePointInstability)
        .filter((candidate) => candidate.metrics.episodeContradictionCount <= baselineEpisodeContradictions)
        .filter((candidate) => !candidate.metrics.regressions.episodeStabilityMateriallyDegraded)
        .sort((left, right) => {
            const leftGain = baselinePointContradictions - left.metrics.pointContradictionCount
                + (baselinePointInstability - left.metrics.pointInstabilityRate);
            const rightGain = baselinePointContradictions - right.metrics.pointContradictionCount
                + (baselinePointInstability - right.metrics.pointInstabilityRate);
            return rightGain - leftGain;
        });

    const selected = viable[0] ?? null;
    if (selected) {
        selected.selected = true;
    }
    return selected;
}

function buildComparison(baseline, candidates, selected, failureDecomposition) {
    return {
        experiment: 24,
        kind: 'occupancy_revision_comparison',
        generatedAt: new Date().toISOString(),
        baseline: {
            pointContradictions: baseline.currentPointEvidenceCounts[ STATUS.contradicted ] ?? 0,
            pointInstabilityRate: baseline.currentPerturbationChangeRates.pointChangedPercent,
            episodeContradictions: baseline.currentEpisodeEvidenceCounts[ STATUS.contradicted ] ?? 0,
            stableEpisodes: baseline.currentEpisodeCountAndFragmentationMetrics.stableEpisodes,
            briefContacts: baseline.currentEpisodeCountAndFragmentationMetrics.briefContacts,
            coverageByState: baseline.currentCoverageByState
        },
        candidates: candidates.map((candidate) => ({
            id: candidate.id,
            selected: candidate.selected,
            changesFromBaseline: candidate.changesFromBaseline,
            expectedEffect: candidate.expectedEffect,
            metrics: candidate.metrics,
            causalTrace: candidate.causalTrace
        })),
        selectedCandidateId: selected?.id ?? null,
        rejectedRevisions: candidates.filter((candidate) => !candidate.selected).map((candidate) => ({
            id: candidate.id,
            reason: rejectionReason(candidate, selected, baseline)
        })),
        failureDecomposition
    };
}

function toCandidateSummary(candidate) {
    return {
        id: candidate.id,
        description: candidate.description,
        changesFromBaseline: candidate.changesFromBaseline,
        rulesAffected: candidate.rulesAffected,
        expectedEffect: candidate.expectedEffect,
        causalTrace: candidate.causalTrace,
        metrics: candidate.metrics,
        regressions: candidate.regressions,
        selected: candidate.selected
    };
}

function buildGate(comparison, selected) {
    let gateResult = 'revision_blocked';
    let reason = 'No candidate satisfied conservative revision criteria.';

    if (selected) {
        const baseline = comparison.baseline;
        const metrics = selected.metrics;
        const gains = {
            pointContradictionsReduced: metrics.pointContradictionCount < baseline.pointContradictions,
            pointInstabilityReduced: metrics.pointInstabilityRate < baseline.pointInstabilityRate,
            episodeContradictionsNotWorse: metrics.episodeContradictionCount <= baseline.episodeContradictions,
            noMajorRegression: !metrics.regressions.majorRegression && !metrics.regressions.episodeStabilityMateriallyDegraded
        };

        if (Object.values(gains).every(Boolean)) {
            gateResult = 'revision_ready_for_holdout';
            reason = 'Selected candidate reduces measured contradictions and point sensitivity without material episode degradation; semantic and transition claims remain prohibited.';
        } else {
            reason = `Selected candidate failed conservative gate checks: ${JSON.stringify(gains)}`;
        }
    }

    return {
        experiment: 24,
        kind: 'occupancy_revision_gate',
        generatedAt: new Date().toISOString(),
        gateResult,
        reason,
        selectedCandidateId: selected?.id ?? null,
        revisedModelArtifact: selected ? OUTPUTS.revisedTimeline : null,
        revisedEpisodeArtifact: selected ? OUTPUTS.revisedEpisodes : null,
        prohibitedClaims: [
            'semantic ground-truth validation',
            'transition readiness',
            'strategic intent',
            'rotation quality'
        ]
    };
}

function traceCorrection(change, failureDecomposition) {
    const map = {
        base_deployment_precedence: 'base_or_deployment_samples_admitted_as_lane_occupancy',
        separation_ambiguity: 'weak_nearest_lane_separation',
        transit_filter: 'high_speed_transit_classified_as_occupancy',
        spatial_continuity_episodes: 'brief_contact_classified_as_stable_presence'
    };
    const failure = failureDecomposition.find((item) => item.category === map[ change ]);

    return {
        change,
        observedEvidenceReviewedError: failure?.category ?? null,
        affectedSampleIds: failure?.affectedSampleIds ?? [],
        technicalCause: failure?.suspectedTechnicalCause ?? null,
        proposedCorrection: change,
        expectedEffect: failure?.mechanicallyCorrectable
            ? 'Reduce measured autonomous contradictions or instability without semantic labels.'
            : 'Not corrected because semantic judgment would be required.'
    };
}

function collectContradictionRules(pointAudit, episodeAudit) {
    const counts = {};
    for (const audit of [ ...pointAudit, ...episodeAudit ]) {
        for (const condition of audit.contradictoryConditions ?? []) {
            counts[ condition ] = (counts[ condition ] ?? 0) + 1;
        }
    }
    return Object.fromEntries(Object.entries(counts).sort(([ left ], [ right ]) => left.localeCompare(right)));
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
        return { status: STATUS.notVerifiable, confidence: 'low', reason: 'Required derived evidence rows were unavailable.' };
    }
    if (strongContradiction) {
        return { status: STATUS.contradicted, confidence: 'high', reason: 'At least one conservative contradiction rule fired from measured evidence.' };
    }
    if (hasInstability) {
        return { status: STATUS.unstable, confidence: 'medium', reason: 'Classification changes under bounded parameter perturbation.' };
    }
    if (independentSupport && conditions.supporting.length >= 2) {
        return { status: STATUS.supported, confidence: 'medium', reason: 'Multiple independent or semi-independent evidence sources support the prediction.' };
    }
    if (conditions.supporting.length > 0) {
        return { status: STATUS.internal, confidence: 'low', reason: 'Evidence is consistent but not independent enough to establish semantic truth.' };
    }
    return { status: STATUS.unresolved, confidence: 'low', reason: 'Available evidence neither supports nor contradicts sufficiently.' };
}

function buildAuditRecord(sampleId, reviewKind, modelPrediction, evidenceMeasurements, conditions, classification) {
    return {
        sampleId,
        reviewKind,
        evidenceStatus: classification.status,
        modelPrediction,
        evidenceSourcesUsed: [
            'output/18-player-movement-metrics.json',
            'output/17-player-region-timeline.json',
            'output/22-player-lane-occupancy-timeline.json'
        ],
        evidenceMeasurements,
        supportingConditions: conditions.supporting,
        contradictoryConditions: conditions.contradictory,
        confidence: classification.confidence,
        reason: classification.reason,
        humanReviewRequired: false,
        humanQuestion: null,
        epistemicNote: 'Autonomous evidence classification only; not semantic ground truth.'
    };
}

function compactRevisedTimeline(rows, candidate) {
    const schema = [
        'playerIndex',
        'gameSecond',
        'state',
        'physicalLaneId',
        'candidateLane',
        'distanceToAxis',
        'separationMargin',
        'baseState',
        'movementRegion',
        'distanceToAlliedBase',
        'speed',
        'lossReason'
    ];

    return {
        experiment: 24,
        kind: 'revised_lane_occupancy',
        candidateId: candidate.id,
        changesFromBaseline: candidate.changes,
        parameters: BASELINE_PARAMETERS,
        schema,
        rows: rows.map((row) => schema.map((field) => row[ field ]))
    };
}

function compactRevisedEpisodes(episodes, candidate) {
    return {
        experiment: 24,
        kind: 'revised_occupancy_episodes',
        candidateId: candidate.id,
        changesFromBaseline: candidate.changes,
        summary: {
            stableEpisodes: episodes.stableEpisodes.length,
            briefContacts: episodes.briefContacts.length
        },
        stableEpisodes: episodes.stableEpisodes,
        briefContacts: episodes.briefContacts
    };
}

function wrapAudit(kind, audits, candidate) {
    return {
        experiment: 24,
        kind,
        candidateId: candidate.id,
        generatedAt: new Date().toISOString(),
        statusDefinitions: STATUS,
        audits
    };
}

function emptyRevision(kind) {
    return {
        experiment: 24,
        kind,
        generatedAt: new Date().toISOString(),
        gate: 'revision_blocked',
        reason: 'No candidate selected.'
    };
}

function rejectionReason(candidate, selected, baseline) {
    if (selected?.id === candidate.id) {
        return 'selected';
    }
    if (candidate.metrics.pointContradictionCount >= (baseline.currentPointEvidenceCounts[ STATUS.contradicted ] ?? 0)) {
        return 'did not reduce point contradictions';
    }
    if (candidate.metrics.pointInstabilityRate >= baseline.currentPerturbationChangeRates.pointChangedPercent) {
        return 'did not reduce point sensitivity materially enough for conservative gate';
    }
    if (candidate.metrics.regressions.episodeStabilityMateriallyDegraded) {
        return 'episode stability materially degraded';
    }
    return 'less favorable than selected candidate';
}

function findContainingEpisode(row, episodes) {
    return episodes.stableEpisodes.find((episode) => episode.playerIndex === row.playerIndex
        && row.gameSecond >= episode.startSecond
        && row.gameSecond <= episode.endSecond) ?? null;
}

function findBestRevisedEpisode(source, episodes) {
    return episodes.stableEpisodes.find((episode) => episode.playerIndex === source.playerIndex
        && episode.physicalLaneId === source.physicalLaneId
        && rangesOverlap(source.startSecond, source.endSecond, episode.startSecond, episode.endSecond)) ?? null;
}

function episodeContinuity(rows, lane) {
    const outside = rows.filter((row) => row.physicalLaneId !== lane).length;
    const margins = rows.map((row) => row.separationMargin).filter(Number.isFinite);
    const speeds = rows.map((row) => row.speed).filter(Number.isFinite);
    return {
        outsideSeconds: outside,
        outsideRatio: rows.length > 0 ? outside / rows.length : 1,
        minMargin: min(margins),
        maxSpeed: max(speeds)
    };
}

function segmentRows(rows, keyFn) {
    const intervals = [];
    let current = null;
    for (const row of rows.slice().sort((left, right) => left.gameSecond - right.gameSecond)) {
        const segmentKey = keyFn(row);
        if (!current || current.key !== segmentKey || row.gameSecond !== current.endSecond + 1) {
            if (current) {
                intervals.push(finalizeInterval(current));
            }
            current = { key: segmentKey, startSecond: row.gameSecond, endSecond: row.gameSecond, rows: [ row ] };
        } else {
            current.endSecond = row.gameSecond;
            current.rows.push(row);
        }
    }
    if (current) {
        intervals.push(finalizeInterval(current));
    }
    return intervals;
}

function finalizeInterval(interval) {
    return {
        startSecond: interval.startSecond,
        endSecond: interval.endSecond,
        durationSeconds: interval.endSecond - interval.startSecond + 1,
        rows: interval.rows
    };
}

function stableStateGroup(state) {
    return [ 'lane_core_high', 'lane_core_medium', 'lane_occupiable' ].includes(state) ? 'lane' : state;
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
    const groups = groupByMap(changes, keyFn);
    return Object.fromEntries(Array.from(groups.entries()).sort(([ left ], [ right ]) => String(left).localeCompare(String(right))).map(([ groupKey, group ]) => [
        groupKey,
        {
            samples: group.length,
            changed: group.filter((change) => change.changedByPerturbations > 0).length,
            changedPercent: round(percent(group.filter((change) => change.changedByPerturbations > 0).length, group.length))
        }
    ]));
}

function compactMeasurements(measurements) {
    return {
        gameSecond: measurements?.gameSecond ?? null,
        playerIndex: measurements?.playerIndex ?? null,
        movementNearestLane: measurements?.movementNearestLane ?? null,
        movementDistanceMargin: measurements?.movementDistanceMargin ?? null,
        movementSpeed: measurements?.movementSpeed ?? measurements?.maxSpeed ?? null,
        distanceToAlliedBase: measurements?.distanceToAlliedBase ?? null,
        region: measurements?.region ?? null,
        outsidePredictedLaneSeconds: measurements?.outsidePredictedLaneSeconds ?? null,
        sensitivityChanges: measurements?.sensitivity?.changedByPerturbations ?? null
    };
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

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
    fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function applyPerturbation(base, changes) {
    return Object.fromEntries(Object.entries(base).map(([ field, value ]) => [ field, value + (changes[ field ] ?? 0) ]));
}

function getMovementLaneDistance(row, lane) {
    if (!row || !lane) {
        return null;
    }
    return row[ `distanceLane${lane.slice(-1)}` ] ?? null;
}

function getMatchPhase(second) {
    return PHASES.find((phase) => second >= phase.minSecond && second <= phase.maxSecond)?.name ?? 'late';
}

function isLaneState(state) {
    return typeof state === 'string' && state.startsWith('lane_') && state !== 'lane_ambiguous';
}

function key(playerIndex, second) {
    return `${playerIndex}:${second}`;
}

function range(start, end) {
    return Array.from({ length: Math.max(0, end - start + 1) }, (_unused, index) => start + index);
}

function rangesOverlap(aStart, aEnd, bStart, bEnd) {
    return Math.max(aStart, bStart) <= Math.min(aEnd, bEnd);
}

function countBy(items, keyFn) {
    const counts = {};
    for (const item of items) {
        const itemKey = keyFn(item);
        counts[ itemKey ] = (counts[ itemKey ] ?? 0) + 1;
    }
    return Object.fromEntries(Object.entries(counts).sort(([ left ], [ right ]) => String(left).localeCompare(String(right))));
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

function groupObject(items, keyFn) {
    return Object.fromEntries(Array.from(groupByMap(items, keyFn).entries()));
}

function average(values) {
    const finite = values.filter(Number.isFinite);
    return finite.length > 0 ? finite.reduce((total, value) => total + value, 0) / finite.length : null;
}

function median(values) {
    const finite = values.filter(Number.isFinite).sort((left, right) => left - right);
    return finite.length > 0 ? finite[Math.floor(finite.length / 2)] : null;
}

function min(values) {
    return values.length > 0 ? Math.min(...values) : null;
}

function max(values) {
    return values.length > 0 ? Math.max(...values) : null;
}

function percent(count, total) {
    return total > 0 ? count / total * 100 : 0;
}

function round(value) {
    return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
}
