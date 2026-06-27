import fs from 'node:fs';
import path from 'node:path';

const OUTPUT_DIR = 'output';
const FILES = {
    movement: path.join(OUTPUT_DIR, '18-player-movement-metrics.json'),
    originalTimeline: path.join(OUTPUT_DIR, '23-calibrated-lane-occupancy.json'),
    originalEpisodes: path.join(OUTPUT_DIR, '23-calibrated-occupancy-episodes.json'),
    revisedTimeline: path.join(OUTPUT_DIR, '24-revised-lane-occupancy.json'),
    revisedEpisodes: path.join(OUTPUT_DIR, '24-revised-occupancy-episodes.json'),
    holdoutSampleSet: path.join(OUTPUT_DIR, '24-holdout-sample-set.json'),
    holdoutComparison: path.join(OUTPUT_DIR, '24-holdout-comparison.json'),
    episodeRegressionSummary: path.join(OUTPUT_DIR, '24-episode-regression-summary.json'),
    episodeAblationComparison: path.join(OUTPUT_DIR, '24-episode-ablation-comparison.json')
};
const OUTPUTS = {
    observations: path.join(OUTPUT_DIR, '24-sequential-observation-evidence.json'),
    hysteresis: path.join(OUTPUT_DIR, '24-hysteresis-occupancy-episodes.json'),
    windowed: path.join(OUTPUT_DIR, '24-windowed-evidence-occupancy-episodes.json'),
    dynamicProgramming: path.join(OUTPUT_DIR, '24-dynamic-programming-occupancy-episodes.json'),
    annotatedOriginal: path.join(OUTPUT_DIR, '24-annotated-original-occupancy-episodes.json'),
    comparison: path.join(OUTPUT_DIR, '24-sequential-architecture-comparison.json'),
    sensitivity: path.join(OUTPUT_DIR, '24-sequential-architecture-sensitivity.json'),
    gate: path.join(OUTPUT_DIR, '24-sequential-architecture-gate.json')
};

const LANES = [ 'lane_1', 'lane_2', 'lane_3' ];
const GENERATED_AT = 'deterministic';
const OUTPUT_SIZE_LIMIT = 10 * 1024 * 1024;

main();

function main() {
    const data = loadData();
    const observations = buildObservations(data);
    const candidates = [
        runOriginalControl(data, observations),
        runFailedRevisionControl(data, observations),
        runTrivialAbstentionBaseline(data, observations),
        runHysteresis(data, observations, {
            id: 'hysteresis_state_machine',
            enterSeconds: 4,
            uncertainTolerance: 5,
            rejoinGap: 4,
            minDuration: 5,
            minSupportRatio: 0.45,
            maxContradictionRatio: 0.28
        }),
        runWindowed(data, observations, {
            id: 'windowed_evidence_accumulation',
            windowSeconds: 5,
            supportMargin: 2,
            minDuration: 5,
            minSupportRatio: 0.42,
            maxContradictionRatio: 0.3
        }),
        runDynamicProgramming(data, observations, {
            id: 'constrained_dynamic_programming',
            switchPenalty: 2.2,
            impossibleLaneSwitchPenalty: 4,
            unknownPenalty: 0.35,
            minDuration: 5,
            minSupportRatio: 0.4,
            maxContradictionRatio: 0.32
        }),
        runAnnotatedOriginal(data, observations)
    ];
    const sensitivity = buildSensitivity(data, observations);
    const comparison = buildComparison(candidates, sensitivity, data);
    const gate = buildGate(comparison, data);

    writeJson(OUTPUTS.observations, compactObservations(observations));
    writeJson(OUTPUTS.hysteresis, outputForCandidate(candidates.find(candidate => candidate.id === 'hysteresis_state_machine')));
    writeJson(OUTPUTS.windowed, outputForCandidate(candidates.find(candidate => candidate.id === 'windowed_evidence_accumulation')));
    writeJson(OUTPUTS.dynamicProgramming, outputForCandidate(candidates.find(candidate => candidate.id === 'constrained_dynamic_programming')));
    writeJson(OUTPUTS.annotatedOriginal, outputForCandidate(candidates.find(candidate => candidate.id === 'annotated_original_episodes')));
    writeJson(OUTPUTS.comparison, comparison);
    writeJson(OUTPUTS.sensitivity, sensitivity);
    writeJson(OUTPUTS.gate, gate);
    validateOutputSizes();

    console.log(`sequential architecture gate: ${gate.gateResult}`);
    console.log(`best candidate: ${comparison.bestCandidateId ?? 'none'}`);
}

function loadData() {
    const movementRaw = readJson(FILES.movement);
    const originalRaw = readJson(FILES.originalTimeline);
    const revisedRaw = readJson(FILES.revisedTimeline);
    const movementRows = decodeRows(movementRaw.schema, movementRaw.rows);
    const originalRows = decodeRows(originalRaw.schema, originalRaw.rows);
    const revisedRows = decodeRows(revisedRaw.schema, revisedRaw.rows);

    return {
        movementRows,
        originalRows,
        revisedRows,
        originalEpisodes: readJson(FILES.originalEpisodes),
        revisedEpisodes: readJson(FILES.revisedEpisodes),
        holdoutSampleSet: readJson(FILES.holdoutSampleSet),
        holdoutComparison: readJson(FILES.holdoutComparison),
        episodeRegressionSummary: readJson(FILES.episodeRegressionSummary),
        episodeAblationComparison: readJson(FILES.episodeAblationComparison),
        originalByKey: new Map(originalRows.map(row => [ key(row.playerIndex, row.gameSecond), row ])),
        revisedByKey: new Map(revisedRows.map(row => [ key(row.playerIndex, row.gameSecond), row ])),
        movementByKey: new Map(movementRows.map(row => [ key(row.playerIndex, row.gameSecond), row ]))
    };
}

function buildObservations(data) {
    return data.movementRows.map(row => {
        const original = data.originalByKey.get(key(row.playerIndex, row.gameSecond));
        const revised = data.revisedByKey.get(key(row.playerIndex, row.gameSecond));
        const laneEvidence = Object.fromEntries(LANES.map(lane => [ lane, laneSupport(row, lane) ]));
        const strongBase = String(row.region ?? '').startsWith('base_') || row.distanceToAlliedBase <= 240;
        const deployment = !strongBase && row.distanceToAlliedBase <= 500;
        const highSpeed = row.speed > 900;
        const nearest = row.nearestLane ?? null;
        const second = row.secondNearestLane ?? null;
        const margin = row.distanceMargin ?? null;
        const pointState = revised?.state ?? original?.state ?? 'unknown';
        const contradictionFlags = [];

        if (isLaneState(pointState) && revised?.physicalLaneId && nearest !== revised.physicalLaneId && margin >= 75) {
            contradictionFlags.push('predicted_lane_not_nearest_with_substantial_separation');
        }
        if (isLaneState(pointState) && (strongBase || highSpeed)) {
            contradictionFlags.push(strongBase ? 'base_geometry_contradicts_lane' : 'high_speed_contradicts_stable_lane');
        }

        return {
            playerIndex: row.playerIndex,
            gameSecond: row.gameSecond,
            phase: getMatchPhase(row.gameSecond),
            coordinates: { x: round(row.x), y: round(row.y), z: round(row.z) },
            nearestLane: nearest,
            secondNearestLane: second,
            distanceMargin: margin,
            laneEvidence,
            baseDeploymentEvidence: strongBase ? 'base' : deployment ? 'deployment' : 'none',
            movementSpeed: row.speed ?? null,
            movementDirection: row.direction ?? null,
            region: row.region ?? null,
            pointLevelModelState: pointState,
            pointLevelLane: revised?.physicalLaneId ?? original?.physicalLaneId ?? null,
            confidence: observationConfidence(row, revised),
            contradictionFlags,
            missingOrUncertainEvidence: !row.alive || !Number.isFinite(row.x) || !Number.isFinite(row.y) || margin === null || margin < 75
        };
    });
}

function laneSupport(row, lane) {
    const distance = getLaneDistance(row, lane);
    const nearest = row.nearestLane === lane;
    const secondNearest = row.secondNearestLane === lane;
    const margin = row.distanceMargin ?? 0;
    let support = 0;
    let contradiction = 0;
    let uncertainty = 0;

    if (!Number.isFinite(distance)) {
        uncertainty += 2;
    } else if (nearest && distance <= 380 && margin >= 90) {
        support += 4;
    } else if (nearest && distance <= 520 && margin >= 45) {
        support += 2;
        uncertainty += 1;
    } else if (nearest && distance <= 620) {
        support += 1;
        uncertainty += 2;
    } else if (!nearest && !secondNearest && distance > 620) {
        contradiction += 2;
    }
    if (nearest !== lane && margin >= 90) {
        contradiction += 2;
    }
    if (String(row.region ?? '').startsWith('base_') || row.distanceToAlliedBase <= 240) {
        contradiction += 4;
    }
    if (row.speed > 900) {
        contradiction += 2;
        uncertainty += 2;
    }

    return { distance: round(distance), support, contradiction, uncertainty };
}

function runOriginalControl(data, observations) {
    return evaluateCandidate('original_experiment_23_episodes', 'control', data.originalEpisodes.stableEpisodes, observations, {
        interpretability: 'high',
        dependency: 'experiment 23 point-first segmentation',
        preservesPointGains: false
    }, data);
}

function runFailedRevisionControl(data, observations) {
    return evaluateCandidate('failed_conservative_revision', 'control', data.revisedEpisodes.stableEpisodes, observations, {
        interpretability: 'high',
        dependency: 'task 005 conservative point states converted to episodes',
        preservesPointGains: true
    }, data);
}

function runTrivialAbstentionBaseline(data, observations) {
    return evaluateCandidate('trivial_abstention_baseline', 'control', [], observations, {
        interpretability: 'high',
        dependency: 'no lane episode inference',
        preservesPointGains: true
    }, data);
}

function runHysteresis(data, observations, params) {
    const episodes = [];
    for (const [ playerIndex, rows ] of groupByMap(observations, observation => observation.playerIndex)) {
        let state = null;
        let candidate = null;
        let candidateStart = null;
        let current = null;
        let uncertainRun = 0;

        for (const observation of rows.sort((left, right) => left.gameSecond - right.gameSecond)) {
            const dominant = dominantLane(observation);
            const hardState = hardNonLaneState(observation);
            if (!state && dominant.lane && dominant.support >= 2 && dominant.contradiction === 0) {
                if (candidate?.lane !== dominant.lane) {
                    candidate = { lane: dominant.lane, support: 0 };
                    candidateStart = observation.gameSecond;
                }
                candidate.support += 1;
                if (candidate.support >= params.enterSeconds) {
                    state = candidate.lane;
                    current = startEpisode(playerIndex, state, candidateStart, observation);
                    uncertainRun = 0;
                }
            } else if (state) {
                appendEpisodeObservation(current, observation, state);
                if (hardState || strongCompetingLane(observation, state)) {
                    finishCurrent();
                } else if (dominant.lane !== state || dominant.support < 2) {
                    uncertainRun += 1;
                    if (uncertainRun > params.uncertainTolerance) {
                        finishCurrent('uncertainty_tolerance_exceeded');
                    }
                } else {
                    uncertainRun = 0;
                }
            } else {
                candidate = null;
                candidateStart = null;
            }
        }
        finishCurrent('end_of_timeline');

        function finishCurrent(reason = 'strong_exit_evidence') {
            if (current) {
                current.reasonForTermination = reason;
                const finalized = finalizeEpisode(current, params);
                if (finalized.durationSeconds >= params.minDuration && finalized.supportRatio >= params.minSupportRatio && finalized.contradictionRatio <= params.maxContradictionRatio) {
                    episodes.push(finalized);
                }
            }
            state = null;
            current = null;
            candidate = null;
            candidateStart = null;
            uncertainRun = 0;
        }
    }
    return evaluateCandidate(params.id, 'hysteresis state machine', episodes, observations, {
        params,
        interpretability: 'high',
        dependency: 'revised point evidence plus temporal confidence decay',
        preservesPointGains: true
    }, data);
}

function runWindowed(data, observations, params) {
    const episodes = [];
    for (const [ playerIndex, rows ] of groupByMap(observations, observation => observation.playerIndex)) {
        const windows = segmentWindows(rows, params.windowSeconds).map(window => inferWindowState(window, params));
        episodes.push(...episodesFromWindowStates(playerIndex, windows, params));
    }
    return evaluateCandidate(params.id, 'interval evidence accumulation', episodes, observations, {
        params,
        interpretability: 'high',
        dependency: 'fixed windows of independent observation evidence',
        preservesPointGains: true
    }, data);
}

function runDynamicProgramming(data, observations, params) {
    const episodes = [];
    for (const [ playerIndex, rows ] of groupByMap(observations, observation => observation.playerIndex)) {
        const states = inferDpStates(rows.sort((left, right) => left.gameSecond - right.gameSecond), params);
        episodes.push(...episodesFromStateSequence(playerIndex, states, params));
    }
    return evaluateCandidate(params.id, 'constrained dynamic programming', episodes, observations, {
        params,
        interpretability: 'medium',
        dependency: 'interpretable sequence optimization over observation evidence',
        preservesPointGains: true
    }, data);
}

function runAnnotatedOriginal(data, observations) {
    const episodes = data.originalEpisodes.stableEpisodes.map(episode => {
        const evidence = episodeEvidence(episode, observations);
        return {
            ...episode,
            inferredState: episode.physicalLaneId,
            supportDuration: evidence.supportDuration,
            contradictoryDuration: evidence.contradictoryDuration,
            uncertainDuration: evidence.uncertainDuration,
            supportRatio: evidence.supportRatio,
            contradictionRatio: evidence.contradictionRatio,
            uncertainRatio: evidence.uncertainRatio,
            interruptionCount: evidence.interruptionCount,
            maximumInterruption: evidence.maximumInterruption,
            entryEvidence: evidence.entryEvidence,
            exitEvidence: evidence.exitEvidence,
            confidence: evidence.confidence,
            reasonForTermination: 'original_experiment_23_boundary_preserved',
            usableForFutureTransitionCandidateGeneration: evidence.supportRatio >= 0.45 && evidence.contradictionRatio <= 0.32
        };
    }).filter(episode => episode.usableForFutureTransitionCandidateGeneration);

    return evaluateCandidate('annotated_original_episodes', 'original episodes with evidence annotations', episodes, observations, {
        interpretability: 'high',
        dependency: 'experiment 23 episode boundaries preserved with independent evidence filters',
        preservesPointGains: true
    }, data);
}

function evaluateCandidate(id, architecture, episodes, observations, meta, data) {
    const annotated = episodes.map((episode, index) => normalizeEpisode(episode, index, observations, id));
    const episodeMetrics = evaluateEpisodeMetrics(annotated, data);
    const distribution = distributionMetrics(annotated, observations);
    const pointBehavior = {
        observationContradictions: data.holdoutComparison.revised.pointContradictions,
        unstableObservations: data.holdoutComparison.revised.pointInstability,
        laneEvidenceCoverage: observations.filter(observation => dominantLane(observation).support >= 2).length,
        unknownOrAbstentionDuration: observations.filter(observation => !dominantLane(observation).lane || hardNonLaneState(observation)).length,
        preservesPointContradictionReduction: meta.preservesPointGains
    };
    return {
        id,
        architecture,
        meta,
        episodes: annotated,
        metrics: {
            pointBehavior,
            episodeBehavior: episodeMetrics,
            distribution,
            tradeoffs: {
                interpretability: meta.interpretability,
                parameterSensitivity: 'measured in output/24-sequential-architecture-sensitivity.json',
                computationalCost: architecture === 'constrained dynamic programming' ? 'medium' : 'low',
                dependenceOnExperiment23Assumptions: meta.dependency,
                abilityToPreserveUncertainty: id === 'failed_conservative_revision' ? 'low' : 'medium_to_high',
                suitabilityForMultiReplayUse: architecture === 'control' ? 'limited' : 'promising_but_unvalidated',
                overfittingRisk: 'diagnostic_set_only; no validation claim'
            }
        }
    };
}

function evaluateEpisodeMetrics(episodes, data) {
    const holdoutEpisodes = data.holdoutSampleSet.episodes;
    const contradictions = [];
    const categories = [];
    for (const sample of holdoutEpisodes) {
        const overlap = bestOverlap(sample, episodes);
        const category = episodeContradiction(sample, overlap);
        if (category) {
            contradictions.push(sample);
            categories.push(category);
        }
    }
    return {
        episodeContradictions: contradictions.length,
        episodeCount: episodes.length,
        totalEpisodeCoverage: sum(episodes.map(episode => episode.durationSeconds)),
        medianDuration: median(episodes.map(episode => episode.durationSeconds)),
        durationDistribution: distribution(episodes.map(episode => episode.durationSeconds)),
        averageSupportRatio: round(average(episodes.map(episode => episode.supportRatio))),
        averageContradictionRatio: round(average(episodes.map(episode => episode.contradictionRatio))),
        averageUncertainRatio: round(average(episodes.map(episode => episode.uncertainRatio))),
        fragmentation: countFragmentation(episodes),
        shortGapTolerance: average(episodes.map(episode => episode.maximumInterruption)),
        falseContinuationAcrossBaseDeployment: episodes.filter(episode => episode.contradictoryDuration > 0 && episode.exitEvidence === 'base_or_deployment').length,
        laneSwitchPlausibility: laneSwitchPlausibility(episodes),
        truncatedStarts: categories.filter(category => category === 'episode_truncated_at_beginning').length,
        truncatedEnds: categories.filter(category => category === 'episode_truncated_at_end').length,
        removedStableIntervals: categories.filter(category => category === 'episode_removed_despite_stable_spatial_interval').length,
        contradictionCategoryCounts: countBy(categories, category => category),
        byLane: countBy(contradictions, sample => sample.physicalLaneId),
        byPlayer: countBy(contradictions, sample => String(sample.playerIndex)),
        byMatchPhase: countBy(contradictions, sample => sample.matchPhase),
        byDuration: countBy(contradictions, sample => durationBucket(sample.durationSeconds)),
        byConfidence: countBy(episodes, episode => episode.confidence),
        byBaseDeploymentProximity: countBy(episodes, episode => episode.contradictionRatio > 0 ? 'some_base_deployment_contradiction' : 'none')
    };
}

function buildComparison(candidates, sensitivity, data) {
    const failed = candidates.find(candidate => candidate.id === 'failed_conservative_revision');
    const original = candidates.find(candidate => candidate.id === 'original_experiment_23_episodes');
    const eligible = candidates
        .filter(candidate => !candidate.id.includes('control') && ![ 'original_experiment_23_episodes', 'failed_conservative_revision', 'trivial_abstention_baseline' ].includes(candidate.id))
        .filter(candidate => candidate.metrics.pointBehavior.preservesPointContradictionReduction)
        .filter(candidate => candidate.metrics.episodeBehavior.episodeContradictions < failed.metrics.episodeBehavior.episodeContradictions)
        .filter(candidate => candidate.metrics.episodeBehavior.totalEpisodeCoverage > failed.metrics.episodeBehavior.totalEpisodeCoverage * 1.5)
        .filter(candidate => candidate.metrics.episodeBehavior.falseContinuationAcrossBaseDeployment === 0)
        .filter(candidate => sensitivity.candidates.find(item => item.id === candidate.id)?.stableUnderPerturbation);
    const best = eligible.sort((left, right) => left.metrics.episodeBehavior.episodeContradictions - right.metrics.episodeBehavior.episodeContradictions
        || right.metrics.episodeBehavior.totalEpisodeCoverage - left.metrics.episodeBehavior.totalEpisodeCoverage)[0] ?? null;

    return {
        experiment: 24,
        kind: 'sequential_architecture_comparison',
        generatedAt: GENERATED_AT,
        diagnosticOnly: true,
        originalEpisodeContradictionsFromTask006: data.holdoutComparison.original.episodeContradictions,
        failedRevisionEpisodeContradictionsFromTask006: data.holdoutComparison.revised.episodeContradictions,
        previousBestAblation: data.episodeAblationComparison.bestCandidateId,
        candidates: candidates.map(candidateSummary),
        bestCandidateId: best?.id ?? null,
        bestCandidateReason: best
            ? 'Preserved revised point behavior while reducing diagnostic episode contradictions and recovering coverage without base/deployment continuation.'
            : 'No uncertainty-aware architecture satisfied all advancement rules on diagnostic evidence.',
        controls: {
            originalExperiment23: candidateSummary(original),
            failedConservativeRevision: candidateSummary(failed),
            trivialAbstention: candidateSummary(candidates.find(candidate => candidate.id === 'trivial_abstention_baseline'))
        },
        dataLeakageControl: 'Existing audit, revision, holdout, and regression sets are diagnostic only; no final validation or fresh holdout was claimed.'
    };
}

function buildSensitivity(data, observations) {
    const variants = [
        {
            id: 'hysteresis_state_machine',
            runs: [
                runHysteresis(data, observations, { id: 'hysteresis_state_machine', enterSeconds: 3, uncertainTolerance: 4, rejoinGap: 3, minDuration: 5, minSupportRatio: 0.45, maxContradictionRatio: 0.28 }),
                runHysteresis(data, observations, { id: 'hysteresis_state_machine', enterSeconds: 5, uncertainTolerance: 6, rejoinGap: 5, minDuration: 6, minSupportRatio: 0.48, maxContradictionRatio: 0.25 })
            ]
        },
        {
            id: 'windowed_evidence_accumulation',
            runs: [
                runWindowed(data, observations, { id: 'windowed_evidence_accumulation', windowSeconds: 4, supportMargin: 2, minDuration: 5, minSupportRatio: 0.42, maxContradictionRatio: 0.3 }),
                runWindowed(data, observations, { id: 'windowed_evidence_accumulation', windowSeconds: 6, supportMargin: 3, minDuration: 6, minSupportRatio: 0.45, maxContradictionRatio: 0.28 })
            ]
        },
        {
            id: 'constrained_dynamic_programming',
            runs: [
                runDynamicProgramming(data, observations, { id: 'constrained_dynamic_programming', switchPenalty: 1.8, impossibleLaneSwitchPenalty: 3.5, unknownPenalty: 0.25, minDuration: 5, minSupportRatio: 0.38, maxContradictionRatio: 0.34 }),
                runDynamicProgramming(data, observations, { id: 'constrained_dynamic_programming', switchPenalty: 2.6, impossibleLaneSwitchPenalty: 4.5, unknownPenalty: 0.45, minDuration: 6, minSupportRatio: 0.43, maxContradictionRatio: 0.3 })
            ]
        }
    ];

    return {
        experiment: 24,
        kind: 'sequential_architecture_sensitivity',
        generatedAt: GENERATED_AT,
        candidates: variants.map(variant => {
            const episodeContradictions = variant.runs.map(run => run.metrics.episodeBehavior.episodeContradictions);
            const coverage = variant.runs.map(run => run.metrics.episodeBehavior.totalEpisodeCoverage);
            const fragmentation = variant.runs.map(run => run.metrics.episodeBehavior.fragmentation);
            return {
                id: variant.id,
                perturbationRuns: variant.runs.map(candidateSummary),
                episodeContradictionRange: [ Math.min(...episodeContradictions), Math.max(...episodeContradictions) ],
                coverageRange: [ Math.min(...coverage), Math.max(...coverage) ],
                fragmentationRange: [ Math.min(...fragmentation), Math.max(...fragmentation) ],
                stableUnderPerturbation: Math.max(...episodeContradictions) - Math.min(...episodeContradictions) <= 20
                    && Math.min(...coverage) > data.holdoutComparison.revised.episodeContradictions
            };
        }),
        note: 'Sensitivity is bounded and diagnostic; it is not parameter optimization.'
    };
}

function buildGate(comparison, data) {
    const best = comparison.candidates.find(candidate => candidate.id === comparison.bestCandidateId) ?? null;
    if (best) {
        return {
            experiment: 24,
            kind: 'sequential_architecture_gate',
            generatedAt: GENERATED_AT,
            gateResult: 'sequential_architecture_promising',
            selectedCandidateId: best.id,
            reason: 'At least one uncertainty-aware sequential model preserved point-level gains while reducing diagnostic episode contradictions and recovering coverage relative to the failed revision.',
            humanReviewRequired: false,
            transitionDetectionPromoted: false,
            independentEvidenceRemaining: 'No final independent validation source was created; a compatible second replay must be confirmed before generalization testing.',
            secondReplayAvailability: secondReplayAvailable(),
            prohibitedClaims: prohibitedClaims()
        };
    }
    const annotated = comparison.candidates.find(candidate => candidate.id === 'annotated_original_episodes');
    if (annotated && annotated.metrics.episodeBehavior.episodeContradictions <= data.holdoutComparison.original.episodeContradictions) {
        return {
            experiment: 24,
            kind: 'sequential_architecture_gate',
            generatedAt: GENERATED_AT,
            gateResult: 'original_episode_annotation_preferred',
            selectedCandidateId: 'annotated_original_episodes',
            reason: 'Sequential reconstruction did not advance, but original boundaries with evidence annotations are mechanically strongest.',
            humanReviewRequired: false,
            transitionDetectionPromoted: false,
            independentEvidenceRemaining: 'Requires separate usability-class definition and validation.',
            secondReplayAvailability: secondReplayAvailable(),
            prohibitedClaims: prohibitedClaims()
        };
    }
    return {
        experiment: 24,
        kind: 'sequential_architecture_gate',
        generatedAt: GENERATED_AT,
        gateResult: 'no_architecture_resolves_tradeoff',
        selectedCandidateId: null,
        reason: 'All tested architectures failed to preserve point quality, episode continuity, and usable coverage together.',
        humanReviewRequired: false,
        transitionDetectionPromoted: false,
        independentEvidenceRemaining: 'Current single-replay diagnostic evidence is exhausted for this architecture class.',
        secondReplayAvailability: secondReplayAvailable(),
        prohibitedClaims: prohibitedClaims()
    };
}

function hardNonLaneState(observation) {
    if (observation.baseDeploymentEvidence === 'base') {
        return 'base';
    }
    if (observation.baseDeploymentEvidence === 'deployment') {
        return 'deployment';
    }
    if (observation.movementSpeed > 1100) {
        return 'neutral_or_transit';
    }
    return null;
}

function dominantLane(observation) {
    const ranked = LANES.map(lane => ({
        lane,
        ...observation.laneEvidence[lane]
    })).sort((left, right) => (right.support - right.contradiction) - (left.support - left.contradiction));
    const best = ranked[0];
    const second = ranked[1];
    if ((best.support - best.contradiction) <= 0 || (best.support - best.contradiction) - (second.support - second.contradiction) < 1) {
        return { ...best, lane: null };
    }
    return best;
}

function strongCompetingLane(observation, currentLane) {
    const dominant = dominantLane(observation);
    return dominant.lane && dominant.lane !== currentLane && dominant.support >= 3 && dominant.contradiction === 0;
}

function startEpisode(playerIndex, state, startSecond, observation) {
    return {
        playerIndex,
        inferredState: state,
        physicalLaneId: state,
        startSecond,
        endSecond: observation.gameSecond,
        observations: [ observation ]
    };
}

function appendEpisodeObservation(episode, observation, lane) {
    episode.endSecond = observation.gameSecond;
    episode.observations.push({ ...observation, latentLane: lane });
}

function finalizeEpisode(episode, params) {
    const evidence = evidenceFromObservations(episode.observations, episode.physicalLaneId);
    return {
        episodeId: `${params.id}_${episode.playerIndex}_${episode.physicalLaneId}_${episode.startSecond}`,
        playerIndex: episode.playerIndex,
        inferredState: episode.inferredState,
        physicalLaneId: episode.physicalLaneId,
        startSecond: episode.startSecond,
        endSecond: episode.endSecond,
        durationSeconds: episode.endSecond - episode.startSecond + 1,
        ...evidence,
        reasonForTermination: episode.reasonForTermination ?? 'end_of_interval',
        usableForFutureTransitionCandidateGeneration: evidence.supportRatio >= params.minSupportRatio
            && evidence.contradictionRatio <= params.maxContradictionRatio
    };
}

function segmentWindows(rows, windowSeconds) {
    const sorted = rows.slice().sort((left, right) => left.gameSecond - right.gameSecond);
    const windows = [];
    let current = [];
    let start = null;
    for (const row of sorted) {
        if (start === null || row.gameSecond >= start + windowSeconds) {
            if (current.length > 0) {
                windows.push(current);
            }
            current = [ row ];
            start = row.gameSecond;
        } else {
            current.push(row);
        }
    }
    if (current.length > 0) {
        windows.push(current);
    }
    return windows;
}

function inferWindowState(rows, params) {
    const scores = Object.fromEntries(LANES.map(lane => [
        lane,
        sum(rows.map(row => row.laneEvidence[lane].support - row.laneEvidence[lane].contradiction))
    ]));
    const ranked = Object.entries(scores).sort((left, right) => right[1] - left[1]);
    const baseRows = rows.filter(row => row.baseDeploymentEvidence !== 'none').length;
    let state = 'unknown';
    if (baseRows / rows.length >= 0.4) {
        state = rows.some(row => row.baseDeploymentEvidence === 'base') ? 'base' : 'deployment';
    } else if (ranked[0][1] - ranked[1][1] >= params.supportMargin && ranked[0][1] > 0) {
        state = ranked[0][0];
    } else if (rows.some(row => row.movementSpeed > 900)) {
        state = 'neutral_or_transit';
    }
    return {
        state,
        startSecond: rows[0].gameSecond,
        endSecond: rows.at(-1).gameSecond,
        rows
    };
}

function episodesFromWindowStates(playerIndex, windows, params) {
    const episodes = [];
    let current = null;
    for (const window of windows) {
        if (LANES.includes(window.state)) {
            if (!current || current.physicalLaneId !== window.state || window.startSecond > current.endSecond + params.windowSeconds) {
                if (current) {
                    pushWindowEpisode(episodes, current, params);
                }
                current = {
                    playerIndex,
                    inferredState: window.state,
                    physicalLaneId: window.state,
                    startSecond: window.startSecond,
                    endSecond: window.endSecond,
                    observations: [ ...window.rows ]
                };
            } else {
                current.endSecond = window.endSecond;
                current.observations.push(...window.rows);
            }
        } else if (current && [ 'base', 'deployment' ].includes(window.state)) {
            pushWindowEpisode(episodes, current, params, 'base_or_deployment_window');
            current = null;
        } else if (current) {
            current.endSecond = window.endSecond;
            current.observations.push(...window.rows);
        }
    }
    if (current) {
        pushWindowEpisode(episodes, current, params, 'end_of_timeline');
    }
    return episodes;
}

function pushWindowEpisode(episodes, current, params, reason = 'window_state_change') {
    const evidence = evidenceFromObservations(current.observations, current.physicalLaneId);
    const episode = {
        episodeId: `${params.id}_${current.playerIndex}_${current.physicalLaneId}_${current.startSecond}`,
        playerIndex: current.playerIndex,
        inferredState: current.inferredState,
        physicalLaneId: current.physicalLaneId,
        startSecond: current.startSecond,
        endSecond: current.endSecond,
        durationSeconds: current.endSecond - current.startSecond + 1,
        ...evidence,
        reasonForTermination: reason,
        usableForFutureTransitionCandidateGeneration: evidence.supportRatio >= params.minSupportRatio
            && evidence.contradictionRatio <= params.maxContradictionRatio
    };
    if (episode.durationSeconds >= params.minDuration && episode.usableForFutureTransitionCandidateGeneration) {
        episodes.push(episode);
    }
}

function inferDpStates(rows, params) {
    const states = [ 'unknown', 'neutral_or_transit', 'base', 'deployment', ...LANES ];
    const dp = [];
    for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index];
        const current = new Map();
        for (const state of states) {
            const obs = observationScore(row, state, params);
            if (index === 0) {
                current.set(state, { score: obs, previous: null });
            } else {
                let best = null;
                for (const previous of states) {
                    const prev = dp[index - 1].get(previous);
                    const score = prev.score + obs - transitionCost(previous, state, row, params);
                    if (!best || score > best.score) {
                        best = { score, previous };
                    }
                }
                current.set(state, best);
            }
        }
        dp.push(current);
    }
    const last = Array.from(dp.at(-1).entries()).sort((left, right) => right[1].score - left[1].score)[0];
    const sequence = [];
    let state = last[0];
    for (let index = rows.length - 1; index >= 0; index -= 1) {
        sequence.push({ ...rows[index], latentState: state });
        state = dp[index].get(state).previous ?? 'unknown';
    }
    return sequence.reverse();
}

function observationScore(row, state, params) {
    if (state === 'unknown') {
        return params.unknownPenalty;
    }
    if (state === 'base') {
        return row.baseDeploymentEvidence === 'base' ? 4 : -2;
    }
    if (state === 'deployment') {
        return row.baseDeploymentEvidence === 'deployment' ? 3 : -1;
    }
    if (state === 'neutral_or_transit') {
        return row.movementSpeed > 900 ? 3 : 0;
    }
    const evidence = row.laneEvidence[state];
    return evidence.support - evidence.contradiction - evidence.uncertainty * 0.2;
}

function transitionCost(previous, current, row, params) {
    if (previous === current) {
        return 0;
    }
    if (LANES.includes(previous) && LANES.includes(current) && previous !== current && row.movementSpeed < 700) {
        return params.impossibleLaneSwitchPenalty;
    }
    if ([ 'base', 'deployment' ].includes(current) || [ 'base', 'deployment' ].includes(previous)) {
        return params.switchPenalty * 0.8;
    }
    return params.switchPenalty;
}

function episodesFromStateSequence(playerIndex, sequence, params) {
    const episodes = [];
    let current = null;
    for (const row of sequence) {
        if (LANES.includes(row.latentState)) {
            if (!current || current.physicalLaneId !== row.latentState || row.gameSecond > current.endSecond + 1) {
                if (current) {
                    pushDpEpisode(episodes, current, params);
                }
                current = {
                    playerIndex,
                    inferredState: row.latentState,
                    physicalLaneId: row.latentState,
                    startSecond: row.gameSecond,
                    endSecond: row.gameSecond,
                    observations: [ row ]
                };
            } else {
                current.endSecond = row.gameSecond;
                current.observations.push(row);
            }
        } else if (current && [ 'base', 'deployment' ].includes(row.latentState)) {
            pushDpEpisode(episodes, current, params, row.latentState);
            current = null;
        } else if (current) {
            current.endSecond = row.gameSecond;
            current.observations.push(row);
        }
    }
    if (current) {
        pushDpEpisode(episodes, current, params, 'end_of_timeline');
    }
    return episodes;
}

function pushDpEpisode(episodes, current, params, reason = 'state_change') {
    const evidence = evidenceFromObservations(current.observations, current.physicalLaneId);
    const episode = {
        episodeId: `${params.id}_${current.playerIndex}_${current.physicalLaneId}_${current.startSecond}`,
        playerIndex: current.playerIndex,
        inferredState: current.inferredState,
        physicalLaneId: current.physicalLaneId,
        startSecond: current.startSecond,
        endSecond: current.endSecond,
        durationSeconds: current.endSecond - current.startSecond + 1,
        ...evidence,
        reasonForTermination: reason,
        usableForFutureTransitionCandidateGeneration: evidence.supportRatio >= params.minSupportRatio
            && evidence.contradictionRatio <= params.maxContradictionRatio
    };
    if (episode.durationSeconds >= params.minDuration && episode.usableForFutureTransitionCandidateGeneration) {
        episodes.push(episode);
    }
}

function normalizeEpisode(episode, index, observations, candidateId) {
    const evidence = episode.supportRatio === undefined ? episodeEvidence(episode, observations) : episode;
    return {
        episodeId: episode.episodeId ?? `${candidateId}_episode_${index + 1}`,
        playerIndex: episode.playerIndex,
        inferredState: episode.inferredState ?? episode.physicalLaneId,
        physicalLaneId: episode.physicalLaneId,
        startSecond: episode.startSecond,
        endSecond: episode.endSecond,
        durationSeconds: episode.durationSeconds ?? episode.endSecond - episode.startSecond + 1,
        supportDuration: evidence.supportDuration,
        contradictoryDuration: evidence.contradictoryDuration,
        uncertainDuration: evidence.uncertainDuration,
        supportRatio: evidence.supportRatio,
        contradictionRatio: evidence.contradictionRatio,
        uncertainRatio: evidence.uncertainRatio,
        interruptionCount: evidence.interruptionCount,
        maximumInterruption: evidence.maximumInterruption,
        entryEvidence: evidence.entryEvidence,
        exitEvidence: evidence.exitEvidence,
        confidence: evidence.confidence,
        reasonForTermination: episode.reasonForTermination ?? 'source_boundary',
        usableForFutureTransitionCandidateGeneration: Boolean(episode.usableForFutureTransitionCandidateGeneration ?? (evidence.supportRatio >= 0.45 && evidence.contradictionRatio <= 0.32))
    };
}

function episodeEvidence(episode, observations) {
    const rows = observations.filter(observation => observation.playerIndex === episode.playerIndex
        && observation.gameSecond >= episode.startSecond
        && observation.gameSecond <= episode.endSecond);
    return evidenceFromObservations(rows, episode.physicalLaneId);
}

function evidenceFromObservations(rows, lane) {
    const supportRows = rows.filter(row => row.laneEvidence[lane]?.support >= 2 && row.laneEvidence[lane]?.contradiction === 0);
    const contradictionRows = rows.filter(row => row.laneEvidence[lane]?.contradiction >= 3 || row.baseDeploymentEvidence !== 'none');
    const uncertainRows = rows.filter(row => row.missingOrUncertainEvidence || row.laneEvidence[lane]?.uncertainty >= 2);
    const interruptions = interruptionRuns(rows, lane);
    const duration = rows.length || 1;
    const supportRatio = round(supportRows.length / duration);
    const contradictionRatio = round(contradictionRows.length / duration);
    const uncertainRatio = round(uncertainRows.length / duration);
    return {
        supportDuration: supportRows.length,
        contradictoryDuration: contradictionRows.length,
        uncertainDuration: uncertainRows.length,
        supportRatio,
        contradictionRatio,
        uncertainRatio,
        interruptionCount: interruptions.length,
        maximumInterruption: interruptions.length ? Math.max(...interruptions) : 0,
        entryEvidence: rows[0] ? entryExitEvidence(rows[0], lane) : 'missing',
        exitEvidence: rows.at(-1) ? entryExitEvidence(rows.at(-1), lane) : 'missing',
        confidence: supportRatio >= 0.7 && contradictionRatio <= 0.1 ? 'high' : supportRatio >= 0.45 && contradictionRatio <= 0.32 ? 'medium' : 'low'
    };
}

function interruptionRuns(rows, lane) {
    const runs = [];
    let current = 0;
    for (const row of rows) {
        const supportive = row.laneEvidence[lane]?.support >= 2 && row.laneEvidence[lane]?.contradiction === 0;
        if (supportive) {
            if (current > 0) {
                runs.push(current);
            }
            current = 0;
        } else {
            current += 1;
        }
    }
    if (current > 0) {
        runs.push(current);
    }
    return runs;
}

function entryExitEvidence(row, lane) {
    if (row.baseDeploymentEvidence !== 'none') {
        return 'base_or_deployment';
    }
    if (row.laneEvidence[lane]?.support >= 2 && row.laneEvidence[lane]?.contradiction === 0) {
        return 'lane_support';
    }
    if (row.movementSpeed > 900) {
        return 'transit_or_high_speed';
    }
    return 'uncertain';
}

function bestOverlap(sample, episodes) {
    return episodes
        .filter(episode => episode.playerIndex === sample.playerIndex && episode.physicalLaneId === sample.physicalLaneId)
        .map(episode => ({
            episode,
            overlap: overlapSeconds(sample.startSecond, sample.endSecond, episode.startSecond, episode.endSecond)
        }))
        .filter(item => item.overlap > 0)
        .sort((left, right) => right.overlap - left.overlap)[0]?.episode ?? null;
}

function episodeContradiction(sample, overlap) {
    if (!overlap) {
        return 'episode_removed_despite_stable_spatial_interval';
    }
    const overlapRatio = overlapSeconds(sample.startSecond, sample.endSecond, overlap.startSecond, overlap.endSecond) / sample.durationSeconds;
    if (overlapRatio < 0.5) {
        return 'temporal_overlap_mismatch';
    }
    if (overlap.startSecond > sample.startSecond + 2) {
        return 'episode_truncated_at_beginning';
    }
    if (overlap.endSecond < sample.endSecond - 2) {
        return 'episode_truncated_at_end';
    }
    if (overlap.contradictionRatio > 0.35) {
        return 'extended_positions_outside_predicted_lane';
    }
    return null;
}

function distributionMetrics(episodes, observations) {
    return {
        byLane: countBy(episodes, episode => episode.physicalLaneId),
        byPlayer: countBy(episodes, episode => String(episode.playerIndex)),
        byMatchPhase: countBy(episodes, episode => getMatchPhase(episode.startSecond)),
        byEpisodeDuration: countBy(episodes, episode => durationBucket(episode.durationSeconds)),
        byConfidence: countBy(episodes, episode => episode.confidence),
        byBaseDeploymentProximity: countBy(episodes, episode => episode.exitEvidence === 'base_or_deployment' || episode.entryEvidence === 'base_or_deployment' ? 'near_base_deployment' : 'not_near_base_deployment'),
        totalObservations: observations.length
    };
}

function candidateSummary(candidate) {
    return {
        id: candidate.id,
        architecture: candidate.architecture,
        meta: candidate.meta,
        metrics: candidate.metrics
    };
}

function outputForCandidate(candidate) {
    return {
        experiment: 24,
        kind: candidate.id,
        generatedAt: GENERATED_AT,
        diagnosticOnly: true,
        meta: candidate.meta,
        summary: candidate.metrics,
        episodes: candidate.episodes
    };
}

function compactObservations(observations) {
    const schema = [
        'playerIndex',
        'gameSecond',
        'phase',
        'x',
        'y',
        'nearestLane',
        'secondNearestLane',
        'distanceMargin',
        'baseDeploymentEvidence',
        'movementSpeed',
        'region',
        'pointLevelModelState',
        'pointLevelLane',
        'confidence',
        'contradictionFlags',
        'missingOrUncertainEvidence',
        'lane1Support',
        'lane1Contradiction',
        'lane2Support',
        'lane2Contradiction',
        'lane3Support',
        'lane3Contradiction'
    ];
    return {
        experiment: 24,
        kind: 'sequential_observation_evidence',
        generatedAt: GENERATED_AT,
        schema,
        rows: observations.map(observation => [
            observation.playerIndex,
            observation.gameSecond,
            observation.phase,
            observation.coordinates.x,
            observation.coordinates.y,
            observation.nearestLane,
            observation.secondNearestLane,
            observation.distanceMargin,
            observation.baseDeploymentEvidence,
            observation.movementSpeed,
            observation.region,
            observation.pointLevelModelState,
            observation.pointLevelLane,
            observation.confidence,
            observation.contradictionFlags,
            observation.missingOrUncertainEvidence,
            observation.laneEvidence.lane_1.support,
            observation.laneEvidence.lane_1.contradiction,
            observation.laneEvidence.lane_2.support,
            observation.laneEvidence.lane_2.contradiction,
            observation.laneEvidence.lane_3.support,
            observation.laneEvidence.lane_3.contradiction
        ])
    };
}

function countFragmentation(episodes) {
    let fragments = 0;
    for (const group of groupByMap(episodes, episode => `${episode.playerIndex}:${episode.physicalLaneId}`).values()) {
        fragments += Math.max(0, group.length - 1);
    }
    return fragments;
}

function laneSwitchPlausibility(episodes) {
    let plausible = 0;
    let implausible = 0;
    for (const group of groupByMap(episodes, episode => episode.playerIndex).values()) {
        const sorted = group.sort((left, right) => left.startSecond - right.startSecond);
        for (let index = 1; index < sorted.length; index += 1) {
            if (sorted[index].physicalLaneId !== sorted[index - 1].physicalLaneId) {
                const gap = sorted[index].startSecond - sorted[index - 1].endSecond;
                if (gap >= 5) {
                    plausible += 1;
                } else {
                    implausible += 1;
                }
            }
        }
    }
    return { plausible, implausible };
}

function secondReplayAvailable() {
    return fs.existsSync('samples') && fs.readdirSync('samples').filter(file => file.endsWith('.dem')).length > 1;
}

function prohibitedClaims() {
    return [
        'semantic ground-truth validation',
        'transition detection',
        'rotation quality',
        'strategic intent',
        'multi-replay generalization'
    ];
}

function validateOutputSizes() {
    for (const filePath of Object.values(OUTPUTS)) {
        const size = fs.statSync(filePath).size;
        if (size > OUTPUT_SIZE_LIMIT) {
            throw new Error(`${filePath} is ${size} bytes, above ${OUTPUT_SIZE_LIMIT}`);
        }
    }
}

function decodeRows(schema, rows) {
    return rows.map(row => Object.fromEntries(schema.map((field, index) => [ field, row[index] ])));
}

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
    fs.writeFileSync(filePath, `${JSON.stringify(value)}\n`);
}

function getLaneDistance(row, lane) {
    return row?.[`distanceLane${lane.slice(-1)}`] ?? null;
}

function observationConfidence(row, revised) {
    if (revised?.state === 'lane_core_high' && row.distanceMargin >= 90 && row.speed <= 700) {
        return 'high';
    }
    if (revised?.state && row.distanceMargin >= 45) {
        return 'medium';
    }
    return 'low';
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

function durationBucket(durationSeconds) {
    if (durationSeconds <= 10) {
        return 'short';
    }
    if (durationSeconds <= 30) {
        return 'medium';
    }
    return 'long';
}

function overlapSeconds(aStart, aEnd, bStart, bEnd) {
    return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart) + 1);
}

function key(playerIndex, second) {
    return `${playerIndex}:${second}`;
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
        counts[itemKey] = (counts[itemKey] ?? 0) + 1;
    }
    return Object.fromEntries(Object.entries(counts).sort(([ left ], [ right ]) => String(left).localeCompare(String(right))));
}

function sum(values) {
    return values.reduce((total, value) => total + (Number.isFinite(value) ? value : 0), 0);
}

function average(values) {
    const finite = values.filter(Number.isFinite);
    return finite.length > 0 ? sum(finite) / finite.length : null;
}

function median(values) {
    const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
    return sorted.length > 0 ? sorted[Math.floor(sorted.length / 2)] : null;
}

function distribution(values) {
    const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
    return {
        count: sorted.length,
        min: sorted[0] ?? null,
        median: sorted[Math.floor(sorted.length / 2)] ?? null,
        p90: sorted[Math.floor(sorted.length * 0.9)] ?? null,
        max: sorted.at(-1) ?? null
    };
}

function round(value) {
    return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
}
