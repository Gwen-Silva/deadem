import fs from 'node:fs';
import path from 'node:path';

const OUTPUT_DIR = 'output';
const FILES = {
    holdoutSampleSet: path.join(OUTPUT_DIR, '24-holdout-sample-set.json'),
    originalHoldoutAudit: path.join(OUTPUT_DIR, '24-holdout-original-evidence-audit.json'),
    revisedHoldoutAudit: path.join(OUTPUT_DIR, '24-holdout-revised-evidence-audit.json'),
    holdoutComparison: path.join(OUTPUT_DIR, '24-holdout-comparison.json'),
    holdoutGate: path.join(OUTPUT_DIR, '24-holdout-validation-gate.json'),
    revisionComparison: path.join(OUTPUT_DIR, '24-occupancy-revision-comparison.json'),
    revisionGate: path.join(OUTPUT_DIR, '24-occupancy-revision-gate.json'),
    originalTimeline: path.join(OUTPUT_DIR, '23-calibrated-lane-occupancy.json'),
    originalEpisodes: path.join(OUTPUT_DIR, '23-calibrated-occupancy-episodes.json'),
    revisedTimeline: path.join(OUTPUT_DIR, '24-revised-lane-occupancy.json'),
    revisedEpisodes: path.join(OUTPUT_DIR, '24-revised-occupancy-episodes.json'),
    movement: path.join(OUTPUT_DIR, '18-player-movement-metrics.json')
};
const OUTPUTS = {
    diagnosis: path.join(OUTPUT_DIR, '24-episode-regression-diagnosis.json'),
    summary: path.join(OUTPUT_DIR, '24-episode-regression-summary.json'),
    ablationCandidates: path.join(OUTPUT_DIR, '24-episode-ablation-candidates.json'),
    ablationComparison: path.join(OUTPUT_DIR, '24-episode-ablation-comparison.json'),
    reconstructionCandidate: path.join(OUTPUT_DIR, '24-episode-reconstruction-candidate.json'),
    gate: path.join(OUTPUT_DIR, '24-episode-revision-gate.json')
};

const POINT_CORRECTION_SETS = {
    original_model: [],
    point_corrections_only_original_episode_builder: [ 'base_deployment_precedence', 'separation_ambiguity', 'high_speed_abstention' ],
    base_deployment_precedence_only: [ 'base_deployment_precedence' ],
    separation_ambiguity_only: [ 'separation_ambiguity' ],
    high_speed_abstention_only: [ 'high_speed_abstention' ],
    continuity_filtering_only: [ 'continuity_filtering' ],
    point_corrections_without_continuity_filtering: [ 'base_deployment_precedence', 'separation_ambiguity', 'high_speed_abstention' ],
    point_corrections_with_short_gap_bridging: [ 'base_deployment_precedence', 'separation_ambiguity', 'high_speed_abstention', 'short_gap_bridging' ],
    point_corrections_with_state_aware_interruption_tolerance: [ 'base_deployment_precedence', 'separation_ambiguity', 'high_speed_abstention', 'state_aware_gaps' ],
    current_combined_revision: [ 'base_deployment_precedence', 'separation_ambiguity', 'high_speed_abstention', 'continuity_filtering' ]
};

const STATUS = {
    supported: 'automatically_supported',
    contradicted: 'automatically_contradicted',
    internal: 'internally_consistent_only',
    unstable: 'unstable_under_perturbation'
};

main();

function main() {
    const data = loadData();
    const diagnosis = diagnoseEpisodeContradictions(data);
    const ablations = Object.entries(POINT_CORRECTION_SETS).map(([ id, corrections ]) => evaluateAblation(id, corrections, data));
    const comparison = buildAblationComparison(ablations, data);
    const reconstruction = selectReconstructionCandidate(comparison, data);
    const summary = buildSummary(diagnosis, comparison, reconstruction, data);
    const gate = buildGate(reconstruction, data);

    writeJson(OUTPUTS.diagnosis, diagnosis);
    writeJson(OUTPUTS.summary, summary);
    writeJson(OUTPUTS.ablationCandidates, {
        experiment: 24,
        kind: 'episode_ablation_candidates',
        generatedAt: now(),
        candidates: ablations.map(summarizeAblation)
    });
    writeJson(OUTPUTS.ablationComparison, comparison);
    writeJson(OUTPUTS.reconstructionCandidate, reconstruction);
    writeJson(OUTPUTS.gate, gate);

    console.log(`episode revision gate: ${gate.gateResult}`);
    console.log(`best ablation: ${reconstruction.selectedCandidateId ?? 'none'}`);
}

function loadData() {
    const originalTimelineRaw = readJson(FILES.originalTimeline);
    const revisedTimelineRaw = readJson(FILES.revisedTimeline);
    const movementRaw = readJson(FILES.movement);

    const originalRows = decodeRows(originalTimelineRaw.schema, originalTimelineRaw.rows);
    const revisedRows = decodeRows(revisedTimelineRaw.schema, revisedTimelineRaw.rows);
    const movementRows = decodeRows(movementRaw.schema, movementRaw.rows);

    return {
        holdoutSampleSet: readJson(FILES.holdoutSampleSet),
        originalHoldoutAudit: readJson(FILES.originalHoldoutAudit),
        revisedHoldoutAudit: readJson(FILES.revisedHoldoutAudit),
        holdoutComparison: readJson(FILES.holdoutComparison),
        holdoutGate: readJson(FILES.holdoutGate),
        revisionComparison: readJson(FILES.revisionComparison),
        revisionGate: readJson(FILES.revisionGate),
        originalRows,
        revisedRows,
        originalEpisodes: readJson(FILES.originalEpisodes),
        revisedEpisodes: readJson(FILES.revisedEpisodes),
        movementRows,
        originalByKey: new Map(originalRows.map((row) => [ key(row.playerIndex, row.gameSecond), row ])),
        revisedByKey: new Map(revisedRows.map((row) => [ key(row.playerIndex, row.gameSecond), row ])),
        movementByKey: new Map(movementRows.map((row) => [ key(row.playerIndex, row.gameSecond), row ]))
    };
}

function diagnoseEpisodeContradictions(data) {
    const revisedContradictions = data.revisedHoldoutAudit.episodeAudits
        .filter((audit) => audit.evidenceStatus === STATUS.contradicted);
    const diagnoses = revisedContradictions.map((audit) => diagnoseEpisode(audit, data));

    return {
        experiment: 24,
        kind: 'episode_regression_diagnosis',
        generatedAt: now(),
        contradictedEpisodeCount: diagnoses.length,
        categoryCounts: countBy(diagnoses, (item) => item.contradictionCategory),
        diagnoses
    };
}

function diagnoseEpisode(audit, data) {
    const episode = audit.modelPrediction;
    const sample = data.holdoutSampleSet.episodes.find((item) => item.sampleId === audit.sampleId);
    const revisedOverlap = findOverlappingEpisode(episode, data.revisedEpisodes.stableEpisodes);
    const originalOverlap = findOverlappingEpisode(episode, data.originalEpisodes.stableEpisodes);
    const pointRows = rowsForInterval(data, episode.playerIndex ?? sample?.playerIndex, episode.startSecond, episode.endSecond);
    const relevantStates = pointRows.map((row) => ({
        second: row.second,
        originalState: row.original?.state ?? null,
        originalLane: row.original?.physicalLaneId ?? null,
        revisedState: row.revised?.state ?? null,
        revisedLane: row.revised?.physicalLaneId ?? null,
        speed: row.movement?.speed ?? null,
        margin: row.movement?.distanceMargin ?? null,
        nearestLane: row.movement?.nearestLane ?? null,
        region: row.movement?.region ?? null
    }));
    const category = classifyEpisodeRegression(episode, revisedOverlap, relevantStates);
    const triggered = countBy(relevantStates, (row) => row.revisedState ?? 'missing');

    return {
        episodeId: audit.sampleId,
        player: episode.playerIndex ?? sample?.playerIndex ?? null,
        lane: episode.physicalLaneId,
        phase: getMatchPhase(episode.startSecond),
        originalEpisodeInterval: {
            startSecond: episode.startSecond,
            endSecond: episode.endSecond,
            durationSeconds: episode.durationSeconds,
            overlap: originalOverlap ? compactEpisode(originalOverlap) : null
        },
        revisedEpisodeIntervalOrAbsence: revisedOverlap ? compactEpisode(revisedOverlap) : null,
        relevantPointStates: relevantStates,
        triggeredCorrectionRules: triggered,
        contradictionCategory: category.category,
        measurements: {
            outsideRatio: audit.evidenceMeasurements.outsideRatio,
            outsideSeconds: audit.evidenceMeasurements.outsideSeconds,
            maxSpeed: audit.evidenceMeasurements.maxSpeed,
            minMargin: audit.evidenceMeasurements.minMargin,
            revisedLaneSeconds: relevantStates.filter((row) => row.revisedLane === episode.physicalLaneId).length,
            bridgeableGapSeconds: bridgeableGapSeconds(relevantStates, episode.physicalLaneId),
            baseOrDeploymentSeconds: relevantStates.filter((row) => [ 'base_core', 'deployment_ambiguous' ].includes(row.revisedState)).length,
            ambiguitySeconds: relevantStates.filter((row) => row.revisedState === 'lane_ambiguous').length,
            transitSeconds: relevantStates.filter((row) => row.revisedState === 'inter_lane_transit').length
        },
        suspectedCause: category.suspectedCause,
        pointLevelRevisionImplicated: category.pointLevelRevisionImplicated,
        aggregationRuleAloneImplicated: category.aggregationRuleAloneImplicated
    };
}

function classifyEpisodeRegression(episode, revisedOverlap, states) {
    const firstLane = states.find((row) => row.revisedLane === episode.physicalLaneId);
    const lastLane = states.findLast((row) => row.revisedLane === episode.physicalLaneId);
    const baseDeployment = states.filter((row) => [ 'base_core', 'deployment_ambiguous' ].includes(row.revisedState)).length;
    const ambiguous = states.filter((row) => row.revisedState === 'lane_ambiguous').length;
    const transit = states.filter((row) => row.revisedState === 'inter_lane_transit').length;
    const laneMismatch = states.filter((row) => row.revisedLane && row.revisedLane !== episode.physicalLaneId).length;
    const bridgeable = bridgeableGapSeconds(states, episode.physicalLaneId);

    if (!revisedOverlap && firstLane && lastLane && lastLane.second - firstLane.second + 1 >= 5) {
        return {
            category: 'episode_removed_despite_stable_spatial_interval',
            suspectedCause: 'Episode construction failed to reconstruct a stable interval after point abstentions.',
            pointLevelRevisionImplicated: false,
            aggregationRuleAloneImplicated: true
        };
    }
    if (firstLane && firstLane.second > episode.startSecond) {
        return {
            category: 'episode_truncated_at_beginning',
            suspectedCause: 'Early abstention or filter removed the beginning of an otherwise matching interval.',
            pointLevelRevisionImplicated: true,
            aggregationRuleAloneImplicated: true
        };
    }
    if (lastLane && lastLane.second < episode.endSecond) {
        return {
            category: 'episode_truncated_at_end',
            suspectedCause: 'Late abstention or filter removed the end of an otherwise matching interval.',
            pointLevelRevisionImplicated: true,
            aggregationRuleAloneImplicated: true
        };
    }
    if (bridgeable > 0 && ambiguous > 0) {
        return {
            category: 'short_abstention_incorrectly_terminating_episode',
            suspectedCause: 'Low-separation ambiguity created bridgeable gaps inside same-lane evidence.',
            pointLevelRevisionImplicated: true,
            aggregationRuleAloneImplicated: true
        };
    }
    if (transit > 0 && bridgeable > 0) {
        return {
            category: 'high_speed_abstention_incorrectly_breaking_stable_episode',
            suspectedCause: 'High-speed transit abstention split an otherwise compatible same-lane interval.',
            pointLevelRevisionImplicated: true,
            aggregationRuleAloneImplicated: true
        };
    }
    if (baseDeployment > 0) {
        return {
            category: 'base_deployment_precedence_absorbing_lane_interval',
            suspectedCause: 'Base/deployment precedence absorbed seconds inside a holdout episode.',
            pointLevelRevisionImplicated: true,
            aggregationRuleAloneImplicated: false
        };
    }
    if (laneMismatch > 0) {
        return {
            category: 'lane_mismatch',
            suspectedCause: 'Revised points support a different lane than the episode under audit.',
            pointLevelRevisionImplicated: true,
            aggregationRuleAloneImplicated: false
        };
    }
    if (states.filter((row) => row.revisedLane === episode.physicalLaneId).length < 5) {
        return {
            category: 'insufficient_point_support',
            suspectedCause: 'Revised point states no longer provide enough lane seconds for stable aggregation.',
            pointLevelRevisionImplicated: true,
            aggregationRuleAloneImplicated: false
        };
    }
    return {
        category: 'temporal_overlap_mismatch',
        suspectedCause: 'Revised episode overlaps temporally but not enough to satisfy holdout evidence rule.',
        pointLevelRevisionImplicated: false,
        aggregationRuleAloneImplicated: true
    };
}

function evaluateAblation(id, corrections, data) {
    const rows = data.movementRows.map((row) => classifyPoint(row, corrections));
    const episodes = buildEpisodes(rows, corrections, id);
    const pointMetrics = evaluatePointMetrics(rows, data);
    const episodeMetrics = evaluateEpisodeMetrics(episodes, data);
    const coverage = rows.filter((row) => isLaneState(row.state)).length;
    const abstention = rows.length - coverage;

    return {
        id,
        causalQuestion: causalQuestion(id),
        corrections,
        pointContradictions: pointMetrics.contradictions,
        pointInstability: pointMetrics.instability,
        pointCoverage: coverage,
        pointAbstention: abstention,
        episodeContradictions: episodeMetrics.contradictions,
        episodeCount: episodes.stableEpisodes.length,
        episodeCoverage: episodeMetrics.coverageSeconds,
        fragmentation: episodes.briefContacts.length,
        episodeDurationDistribution: durationDistribution(episodes.stableEpisodes.map((episode) => episode.durationSeconds)),
        truncatedStartCount: episodeMetrics.categoryCounts.episode_truncated_at_beginning ?? 0,
        truncatedEndCount: episodeMetrics.categoryCounts.episode_truncated_at_end ?? 0,
        splitCount: episodeMetrics.categoryCounts.episode_split_into_multiple_fragments ?? 0,
        removedStableIntervalCount: episodeMetrics.categoryCounts.episode_removed_despite_stable_spatial_interval ?? 0,
        bridgeableGapCount: episodeMetrics.bridgeableGapCount,
        byLane: episodeMetrics.byLane,
        byPlayer: episodeMetrics.byPlayer,
        byMatchPhase: episodeMetrics.byMatchPhase,
        preservesPointGain: pointMetrics.contradictions < data.holdoutComparison.original.pointContradictions
            && pointMetrics.instability < data.holdoutComparison.original.pointInstability,
        doesNotCollapseCoverage: coverage > data.revisionComparison.baseline.stableEpisodes,
        episodes
    };
}

function classifyPoint(row, corrections) {
    const changes = new Set(corrections);
    const laneDistances = [ 'lane_1', 'lane_2', 'lane_3' ].map((lane) => ({
        lane,
        distance: getMovementLaneDistance(row, lane)
    })).sort((left, right) => left.distance - right.distance);
    const nearest = laneDistances[0];
    const second = laneDistances[1];
    const margin = second.distance - nearest.distance;
    const strongBase = String(row.region ?? '').startsWith('base_') || row.distanceToAlliedBase <= 240;
    const strongDeployment = !strongBase && row.distanceToAlliedBase <= 500;
    let state = 'unknown';
    let physicalLaneId = null;

    if (!row.alive || !Number.isFinite(row.x) || !Number.isFinite(row.y)) {
        state = 'unknown';
    } else if (changes.has('base_deployment_precedence') && strongBase) {
        state = 'base_core';
    } else if (changes.has('base_deployment_precedence') && strongDeployment) {
        state = 'deployment_ambiguous';
    } else if (changes.has('high_speed_abstention') && row.speed > 900) {
        state = 'inter_lane_transit';
    } else if (changes.has('separation_ambiguity') && margin < 75 && nearest.distance <= 520) {
        state = 'lane_ambiguous';
    } else if (nearest.distance <= 380 && margin >= 72) {
        state = 'lane_core_high';
        physicalLaneId = nearest.lane;
    } else if (nearest.distance <= 380 && margin >= 45) {
        state = changes.has('separation_ambiguity') && margin < 90 ? 'lane_ambiguous' : 'lane_core_medium';
        physicalLaneId = state === 'lane_core_medium' ? nearest.lane : null;
    } else if (nearest.distance <= 520 && margin >= 22.5) {
        state = changes.has('separation_ambiguity') ? 'lane_ambiguous' : 'lane_occupiable';
        physicalLaneId = state === 'lane_occupiable' ? nearest.lane : null;
    } else if (nearest.distance <= 520) {
        state = 'lane_approach';
    }

    return {
        playerIndex: row.playerIndex,
        gameSecond: row.gameSecond,
        state,
        physicalLaneId,
        candidateLane: nearest.lane,
        distanceToAxis: nearest.distance,
        separationMargin: margin,
        speed: row.speed,
        region: row.region,
        matchPhase: getMatchPhase(row.gameSecond)
    };
}

function buildEpisodes(rows, corrections, id) {
    if (id === 'original_model') {
        return readOriginalEpisodesAsCandidate();
    }
    const stableEpisodes = [];
    const briefContacts = [];
    const byPlayer = groupByMap(rows, (row) => row.playerIndex);

    for (const [ playerIndex, playerRows ] of byPlayer.entries()) {
        const intervals = buildLaneIntervals(playerRows, corrections);
        for (const interval of intervals) {
            const continuity = continuityForRows(interval.rows, interval.lane);
            const passesContinuity = !corrections.includes('continuity_filtering')
                || (continuity.outsideRatio <= 0.2 && continuity.maxSpeed <= 900);
            if (interval.durationSeconds >= 5 && passesContinuity) {
                stableEpisodes.push({
                    episodeId: `${id}_episode_${stableEpisodes.length + 1}`,
                    playerIndex,
                    physicalLaneId: interval.lane,
                    startSecond: interval.startSecond,
                    endSecond: interval.endSecond,
                    durationSeconds: interval.durationSeconds,
                    continuity
                });
            } else {
                briefContacts.push({
                    contactId: `${id}_brief_${briefContacts.length + 1}`,
                    playerIndex,
                    physicalLaneId: interval.lane,
                    startSecond: interval.startSecond,
                    endSecond: interval.endSecond,
                    durationSeconds: interval.durationSeconds,
                    reason: passesContinuity ? 'below_stable_duration' : 'failed_continuity'
                });
            }
        }
    }
    return { stableEpisodes, briefContacts };
}

function buildLaneIntervals(playerRows, corrections) {
    const sorted = playerRows.slice().sort((left, right) => left.gameSecond - right.gameSecond);
    const intervals = [];
    let current = null;

    for (const row of sorted) {
        if (row.physicalLaneId) {
            if (!current || current.lane !== row.physicalLaneId || row.gameSecond > current.endSecond + 1) {
                if (current) {
                    intervals.push(finalize(current));
                }
                current = { lane: row.physicalLaneId, startSecond: row.gameSecond, endSecond: row.gameSecond, rows: [ row ] };
            } else {
                current.endSecond = row.gameSecond;
                current.rows.push(row);
            }
        } else if (current && canBridgeGap(row, current, corrections)) {
            current.endSecond = row.gameSecond;
            current.rows.push({ ...row, physicalLaneId: current.lane, bridged: true });
        } else {
            if (current) {
                intervals.push(finalize(current));
                current = null;
            }
        }
    }
    if (current) {
        intervals.push(finalize(current));
    }
    return intervals;
}

function canBridgeGap(row, current, corrections) {
    if (!corrections.includes('short_gap_bridging') && !corrections.includes('state_aware_gaps')) {
        return false;
    }
    const gapLength = row.gameSecond - current.endSecond;
    if (gapLength > 3) {
        return false;
    }
    if (corrections.includes('state_aware_gaps') && [ 'base_core', 'deployment_ambiguous' ].includes(row.state)) {
        return false;
    }
    if (row.candidateLane && row.candidateLane !== current.lane && row.separationMargin >= 75) {
        return false;
    }
    return [ 'lane_ambiguous', 'inter_lane_transit', 'unknown' ].includes(row.state);
}

function evaluatePointMetrics(rows, data) {
    const holdoutPoints = data.holdoutSampleSet.points;
    let contradictions = 0;
    let instability = 0;
    for (const sample of holdoutPoints) {
        const row = rows.find((item) => item.playerIndex === sample.playerIndex && item.gameSecond === sample.gameSecond);
        const movement = data.movementByKey?.get?.(key(sample.playerIndex, sample.gameSecond));
        if (row && isPointContradicted(row, movement)) {
            contradictions += 1;
        }
        if (row && isPointUnstable(row, movement)) {
            instability += 1;
        }
    }
    return { contradictions, instability };
}

function evaluateEpisodeMetrics(episodes, data) {
    const holdoutEpisodes = data.holdoutSampleSet.episodes;
    const contradictions = [];
    const categories = [];
    for (const sample of holdoutEpisodes) {
        const overlap = findOverlappingEpisode(sample, episodes.stableEpisodes);
        const category = episodeContradictionCategory(sample, overlap, data);
        if (category) {
            contradictions.push(sample);
            categories.push(category);
        }
    }
    return {
        contradictions: contradictions.length,
        categoryCounts: countBy(categories, (category) => category),
        bridgeableGapCount: categories.filter((category) => category.includes('gap')).length,
        coverageSeconds: episodes.stableEpisodes.reduce((total, episode) => total + episode.durationSeconds, 0),
        byLane: countBy(contradictions, (sample) => sample.physicalLaneId),
        byPlayer: countBy(contradictions, (sample) => String(sample.playerIndex)),
        byMatchPhase: countBy(contradictions, (sample) => sample.matchPhase)
    };
}

function episodeContradictionCategory(sample, overlap, data) {
    if (!overlap) {
        return 'episode_removed_despite_stable_spatial_interval';
    }
    if (overlap.startSecond > sample.startSecond) {
        return 'episode_truncated_at_beginning';
    }
    if (overlap.endSecond < sample.endSecond) {
        return 'episode_truncated_at_end';
    }
    const states = rowsForInterval(data, sample.playerIndex, sample.startSecond, sample.endSecond);
    if (states.filter((row) => row.revised?.physicalLaneId === sample.physicalLaneId).length < 5) {
        return 'insufficient_point_support';
    }
    return null;
}

function buildAblationComparison(ablations, data) {
    const original = ablations.find((item) => item.id === 'original_model');
    const failedRevision = {
        id: 'failed_task_005_revision',
        pointContradictions: data.holdoutComparison.revised.pointContradictions,
        pointInstability: data.holdoutComparison.revised.pointInstability,
        episodeContradictions: data.holdoutComparison.revised.episodeContradictions,
        pointCoverage: data.revisionComparison.candidates.find((candidate) => candidate.selected)?.metrics.coverageChange.revisedLaneRows ?? null,
        fragmentation: data.revisionComparison.candidates.find((candidate) => candidate.selected)?.metrics.fragmentationChange.revisedBriefContacts ?? null
    };
    const acceptable = ablations.filter((item) => item.id !== 'original_model')
        .filter((item) => item.preservesPointGain)
        .filter((item) => item.episodeContradictions < failedRevision.episodeContradictions)
        .filter((item) => item.pointCoverage > failedRevision.pointCoverage)
        .sort((left, right) => left.episodeContradictions - right.episodeContradictions
            || right.pointCoverage - left.pointCoverage);
    return {
        experiment: 24,
        kind: 'episode_ablation_comparison',
        generatedAt: now(),
        originalModel: summarizeAblation(original),
        failedRevision,
        candidates: ablations.map(summarizeAblation),
        bestCandidateId: acceptable[0]?.id ?? null,
        dataSeparation: {
            diagnosticSet: 'task 006 holdout and related holdout audits; used for regression diagnosis only',
            tuningSet: 'not created; candidate selection remains diagnostic because task 006 result has been observed',
            freshSecondHoldout: 'not created in this diagnostic task'
        }
    };
}

function selectReconstructionCandidate(comparison, data) {
    const best = comparison.candidates.find((candidate) => candidate.id === comparison.bestCandidateId) ?? null;
    const usedSeconds = new Set([
        ...data.holdoutSampleSet.points.map((sample) => key(sample.playerIndex, sample.gameSecond)),
        ...data.holdoutSampleSet.episodes.flatMap((episode) => range(episode.startSecond, episode.endSecond).map((second) => key(episode.playerIndex, second)))
    ]);
    const totalSeconds = data.originalRows.length;
    const unusedSeconds = data.originalRows.filter((row) => !usedSeconds.has(key(row.playerIndex, row.gameSecond))).length;
    return {
        experiment: 24,
        kind: 'episode_reconstruction_candidate',
        generatedAt: now(),
        selectedCandidateId: best?.id ?? null,
        selectedCandidate: best,
        freshHoldoutAvailability: {
            totalPointSeconds: totalSeconds,
            unusedPointSecondsAfterDiagnostic: unusedSeconds,
            available: Boolean(best) && unusedSeconds >= 1000,
            note: 'Availability counts unused point seconds only; a separate task must construct non-overlapping episode windows.'
        },
        warning: 'Candidate is diagnostic only and has not been validated on a fresh holdout.'
    };
}

function buildSummary(diagnosis, comparison, reconstruction, data) {
    return {
        experiment: 24,
        kind: 'episode_regression_summary',
        generatedAt: now(),
        whyEarlierRevisionAppearedSuccessful: 'Task 005 evaluated sampled point and episode cases where conservative abstention removed point contradictions and sampled episode contradictions.',
        whyItFailedOnHoldout: 'Task 006 holdout showed episode construction over-reacted to abstentions and continuity gaps, increasing revised episode contradictions.',
        contradictionCategoryDistribution: diagnosis.categoryCounts,
        strongestCausalSource: topCount(diagnosis.categoryCounts),
        ablationBestCandidate: comparison.bestCandidateId,
        pointVersusEpisodeTradeoff: {
            originalPointContradictions: data.holdoutComparison.original.pointContradictions,
            failedRevisionPointContradictions: data.holdoutComparison.revised.pointContradictions,
            originalEpisodeContradictions: data.holdoutComparison.original.episodeContradictions,
            failedRevisionEpisodeContradictions: data.holdoutComparison.revised.episodeContradictions
        },
        coverageVersusAbstentionTradeoff: {
            failedRevisionCoverage: data.revisionComparison.candidates.find((candidate) => candidate.selected)?.metrics.coverageChange ?? null,
            selectedDiagnosticCandidate: reconstruction.selectedCandidate
        },
        remainingUncertainty: [
            'Diagnostic data includes the observed task 006 holdout and cannot validate a final candidate.',
            'No semantic correctness is established.',
            'Fresh holdout construction must be separate if the candidate advances.'
        ]
    };
}

function buildGate(reconstruction, _data) {
    let gateResult = 'episode_revision_failed';
    let reason = 'No ablation candidate resolved the episode regression while preserving point gains.';

    if (reconstruction.selectedCandidateId && reconstruction.freshHoldoutAvailability.available) {
        gateResult = 'episode_revision_ready_for_fresh_holdout';
        reason = 'A diagnostic candidate improved episode regression while preserving point gains, and unused point seconds appear sufficient for a separate fresh holdout task.';
    } else if (reconstruction.selectedCandidateId && !reconstruction.freshHoldoutAvailability.available) {
        gateResult = 'episode_revision_blocked_insufficient_data';
        reason = 'A candidate exists but fresh non-overlapping holdout data is insufficient.';
    }

    return {
        experiment: 24,
        kind: 'episode_revision_gate',
        generatedAt: now(),
        gateResult,
        reason,
        selectedCandidateId: reconstruction.selectedCandidateId,
        humanReviewRequired: false,
        transitionDetectionPromoted: false
    };
}

function readOriginalEpisodesAsCandidate() {
    const original = readJson(FILES.originalEpisodes);
    return {
        stableEpisodes: original.stableEpisodes,
        briefContacts: original.briefContacts
    };
}

function summarizeAblation(item) {
    if (!item) {
        return null;
    }
    const { episodes: _episodes, ...summary } = item;
    return summary;
}

function causalQuestion(id) {
    return {
        original_model: 'Baseline behavior before point corrections.',
        point_corrections_only_original_episode_builder: 'Do point corrections fail only when paired with revised episode filtering?',
        base_deployment_precedence_only: 'Does base/deployment precedence cause episode loss?',
        separation_ambiguity_only: 'Does low-separation abstention create bridgeable gaps?',
        high_speed_abstention_only: 'Does high-speed abstention break otherwise stable intervals?',
        continuity_filtering_only: 'Does continuity filtering alone cause episode rejection?',
        point_corrections_without_continuity_filtering: 'Can point gains survive without continuity filtering?',
        point_corrections_with_short_gap_bridging: 'Do bounded bridgeable gaps repair episode fragmentation?',
        point_corrections_with_state_aware_interruption_tolerance: 'Do state-aware gaps preserve hard base/deployment termination while bridging ambiguity?',
        current_combined_revision: 'Observed failed combined revision.'
    }[id] ?? id;
}

function isPointContradicted(row, movement) {
    if (!movement || !isLaneState(row.state)) {
        return false;
    }
    if (movement.nearestLane !== row.physicalLaneId && movement.distanceMargin >= 75) {
        return true;
    }
    if (String(movement.region ?? '').startsWith('base_') || movement.distanceToAlliedBase <= 240) {
        return true;
    }
    if (movement.speed > 900) {
        return true;
    }
    return false;
}

function isPointUnstable(row, movement) {
    if (!movement || !isLaneState(row.state)) {
        return false;
    }
    return movement.distanceMargin < 90 || getMovementLaneDistance(movement, row.physicalLaneId) > 350;
}

function rowsForInterval(data, playerIndex, startSecond, endSecond) {
    return range(startSecond, endSecond).map((second) => ({
        second,
        original: data.originalByKey.get(key(playerIndex, second)),
        revised: data.revisedByKey.get(key(playerIndex, second)),
        movement: data.movementByKey.get(key(playerIndex, second))
    }));
}

function findOverlappingEpisode(episode, episodes) {
    return episodes.find((candidate) => candidate.playerIndex === episode.playerIndex
        && candidate.physicalLaneId === episode.physicalLaneId
        && Math.max(candidate.startSecond, episode.startSecond) <= Math.min(candidate.endSecond, episode.endSecond)) ?? null;
}

function bridgeableGapSeconds(states, lane) {
    return states.filter((row) => !row.revisedLane
        && [ 'lane_ambiguous', 'inter_lane_transit', 'unknown' ].includes(row.revisedState)
        && (!row.nearestLane || row.nearestLane === lane || row.margin < 75)).length;
}

function continuityForRows(rows, lane) {
    const outside = rows.filter((row) => row.physicalLaneId !== lane).length;
    return {
        outsideSeconds: outside,
        outsideRatio: rows.length > 0 ? outside / rows.length : 1,
        maxSpeed: max(rows.map((row) => row.speed).filter(Number.isFinite))
    };
}

function finalize(current) {
    return {
        lane: current.lane,
        startSecond: current.startSecond,
        endSecond: current.endSecond,
        durationSeconds: current.endSecond - current.startSecond + 1,
        rows: current.rows
    };
}

function compactEpisode(episode) {
    return {
        episodeId: episode.episodeId ?? episode.contactId ?? null,
        startSecond: episode.startSecond,
        endSecond: episode.endSecond,
        durationSeconds: episode.durationSeconds,
        physicalLaneId: episode.physicalLaneId
    };
}

function durationDistribution(values) {
    const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
    return {
        count: sorted.length,
        min: sorted[0] ?? null,
        median: sorted[Math.floor(sorted.length / 2)] ?? null,
        p90: sorted[Math.floor(sorted.length * 0.9)] ?? null,
        max: sorted.at(-1) ?? null
    };
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

function getMovementLaneDistance(row, lane) {
    if (!row || !lane) {
        return null;
    }
    return row[ `distanceLane${lane.slice(-1)}` ] ?? null;
}

function isLaneState(state) {
    return typeof state === 'string' && state.startsWith('lane_') && state !== 'lane_ambiguous';
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

function topCount(counts) {
    return Object.entries(counts).map(([ category, count ]) => ({ category, count })).sort((left, right) => right.count - left.count)[0] ?? null;
}

function max(values) {
    return values.length > 0 ? Math.max(...values) : null;
}

function now() {
    return new Date().toISOString();
}
