import fs from 'node:fs/promises';
import path from 'node:path';

const LANES = [ 'lane_axis_1', 'lane_axis_2', 'lane_axis_3' ];
const OUTPUT_SIZE_LIMIT = 10 * 1024 * 1024;
const REPLAYS = [ 'replay_001', 'replay_002', 'replay_003', 'replay_004' ];
const GENERALIZATION_REPLAYS = [ 'replay_002', 'replay_003', 'replay_004' ];
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
    { id: 'original_experiment_23_balanced', kind: 'point_model', parameters: BASELINE_PARAMETERS, changes: [] },
    { id: 'conservative_point_revision_combined', kind: 'point_model', parameters: BASELINE_PARAMETERS, changes: [ 'base_deployment_precedence', 'separation_ambiguity', 'transit_filter', 'spatial_continuity_episodes' ] },
    { id: 'hysteresis_state_machine', kind: 'sequential_episode_model', parameters: { id: 'hysteresis_state_machine', enterSeconds: 4, uncertainTolerance: 5, rejoinGap: 4, minDuration: 5, minSupportRatio: 0.45, maxContradictionRatio: 0.28 } },
    { id: 'windowed_evidence_accumulation', kind: 'sequential_episode_model', parameters: { id: 'windowed_evidence_accumulation', windowSeconds: 5, supportMargin: 2, minDuration: 5, minSupportRatio: 0.42, maxContradictionRatio: 0.3 } },
    { id: 'constrained_dynamic_programming', kind: 'sequential_episode_model', parameters: { id: 'constrained_dynamic_programming', switchPenalty: 2.2, impossibleLaneSwitchPenalty: 4, unknownPenalty: 0.35, minDuration: 5, minSupportRatio: 0.4, maxContradictionRatio: 0.32 } }
];

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});

async function main() {
    const provenance = JSON.parse(await fs.readFile('output/replays/frozen-candidate-provenance.json', 'utf8'));
    validateFrozenParameters(provenance);
    const results = [];
    for (const replayId of REPLAYS) {
        const rows = await readOneSecondRows(replayId);
        results.push(evaluateReplay(replayId, rows));
    }
    const comparison = await buildComparison(results);
    const gate = buildGate(comparison);
    await writeJson('output/replays/frozen-occupancy-one-second-results.json', {
        schemaVersion: 1,
        kind: 'frozen_occupancy_one_second_results',
        temporalResolutionSeconds: 1,
        candidates: CANDIDATES.map(candidate => candidate.id),
        replays: results,
        replay005Protection: { processed: false, status: 'preserved' }
    });
    await writeJson('output/replays/frozen-occupancy-one-second-resolution-comparison.json', comparison);
    await writeJson('output/replays/frozen-occupancy-one-second-gate.json', gate);
    await writeReport(results, comparison, gate);
    await validateOutputs([
        'output/replays/frozen-occupancy-one-second-results.json',
        'output/replays/frozen-occupancy-one-second-resolution-comparison.json',
        'output/replays/frozen-occupancy-one-second-gate.json',
        'reports/frozen-occupancy-one-second-resolution-comparison.md'
    ]);
    console.log(`one-second frozen comparison gate: ${gate.gateResult}`);
}

function validateFrozenParameters(provenance) {
    const byId = new Map(provenance.candidates.map(candidate => [ candidate.candidateId, candidate ]));
    for (const candidate of CANDIDATES) {
        const frozen = byId.get(candidate.id);
        if (!frozen) throw new Error(`Missing frozen provenance for ${candidate.id}`);
        const expected = stableStringify(candidate.parameters);
        const actual = stableStringify(frozen.exactParameters);
        if (expected !== actual) throw new Error(`Parameter mismatch for ${candidate.id}`);
    }
}

async function readOneSecondRows(replayId) {
    const manifest = JSON.parse(await fs.readFile(`output/replays/${replayId}/one-second-spatial/manifest.json`, 'utf8'));
    const rows = [];
    for (const shard of manifest.shards) {
        rows.push(...await readJsonl(shard.file));
    }
    return rows.sort((left, right) => left.gameTimeSeconds - right.gameTimeSeconds || String(left.playerId).localeCompare(String(right.playerId)));
}

function evaluateReplay(replayId, rows) {
    return {
        replayId,
        temporalResolutionSeconds: 1,
        rowCount: rows.length,
        candidates: CANDIDATES.map(candidate => evaluateCandidate(candidate, rows))
    };
}

function evaluateCandidate(candidate, rows) {
    const pointCandidate = candidate.kind === 'point_model' ? candidate : CANDIDATES[1];
    const classified = rows.map(row => classifyPoint(row, pointCandidate));
    const observations = rows.map((row, index) => buildObservation(row, classified[index]));
    const episodes = candidate.kind === 'sequential_episode_model'
        ? runSequential(candidate, observations)
        : buildPointEpisodes(classified, candidate);
    return {
        candidateId: candidate.id,
        pointMetrics: pointMetrics(classified, rows, candidate),
        episodeMetrics: episodeMetrics(episodes, rows),
        resolutionNotes: candidateResolutionNotes(candidate)
    };
}

function classifyPoint(row, candidate, overrides = {}, includePerturbations = true) {
    const params = applyPerturbation(candidate.parameters, overrides);
    const nearest = row.laneProjection.nearestLane;
    const nearestDistance = row.laneProjection.nearestDistance;
    const margin = row.laneProjection.separationMargin;
    const speed = row.movement.speed;
    const changes = new Set(candidate.changes ?? []);
    const strongBase = row.structuralRegions.nearTeamBase || row.structuralRegions.nearEnemyBase;
    const strongDeployment = row.structuralRegions.nearDeployment;
    const highSpeed = Number.isFinite(speed) && speed > 900;
    const boundaryAmbiguous = Number.isFinite(margin) && margin < 75;
    const weakEnvelope = Number.isFinite(nearestDistance) && nearestDistance > params.maxCoreDistance && nearestDistance <= params.maxOccupancyDistance;
    let state = 'unknown';
    let physicalLaneId = null;
    let lossReason = null;
    if (row.position.quality === 'missing' || !Number.isFinite(row.position.x) || !Number.isFinite(row.position.y)) {
        lossReason = 'invalid_or_missing_position';
    } else if (changes.has('base_deployment_precedence') && strongBase) {
        state = 'base_core';
        lossReason = 'independent_base_precedence';
    } else if (changes.has('base_deployment_precedence') && strongDeployment) {
        state = 'deployment_ambiguous';
        lossReason = 'independent_deployment_precedence';
    } else if (changes.has('transit_filter') && highSpeed) {
        state = 'inter_lane_transit';
        lossReason = 'high_speed_transit_abstention';
    } else if (changes.has('separation_ambiguity') && boundaryAmbiguous && nearestDistance <= params.maxOccupancyDistance) {
        state = 'lane_ambiguous';
        lossReason = 'weak_lane_separation_abstention';
    } else if (nearestDistance <= params.maxCoreDistance && margin >= params.minMargin * 1.6) {
        state = 'lane_core_high';
        physicalLaneId = nearest;
    } else if (nearestDistance <= params.maxCoreDistance && margin >= params.minMargin) {
        state = changes.has('separation_ambiguity') && margin < 90 ? 'lane_ambiguous' : 'lane_core_medium';
        physicalLaneId = state === 'lane_core_medium' ? nearest : null;
        lossReason = state === 'lane_ambiguous' ? 'medium_confidence_boundary_abstention' : null;
    } else if (nearestDistance <= params.maxOccupancyDistance && margin >= params.minMargin * 0.5) {
        state = changes.has('separation_ambiguity') || weakEnvelope ? 'lane_ambiguous' : 'lane_occupiable';
        physicalLaneId = state === 'lane_occupiable' ? nearest : null;
        lossReason = state === 'lane_ambiguous' ? 'occupiable_boundary_abstention' : 'occupiable_not_core';
    } else if (nearestDistance <= params.maxOccupancyDistance) {
        state = 'lane_approach';
        lossReason = 'approach_distance_or_margin';
    } else {
        lossReason = 'too_far_from_lane_envelope';
    }
    const contradictionFlags = contradictionFlagsFor(row, state, physicalLaneId, params);
    const perturbationStates = includePerturbations ? PERTURBATIONS.map(perturbation => ({
        name: perturbation.name,
        state: classifyPoint(row, candidate, perturbation.changes, false).state
    })) : [];
    return {
        replayId: row.replayId,
        playerId: row.playerId,
        team: row.team,
        gameTimeSeconds: row.gameTimeSeconds,
        state,
        physicalLaneId,
        candidateLane: nearest,
        nearestDistance,
        separationMargin: margin,
        speed,
        positionQuality: row.position.quality,
        structuralRegions: row.structuralRegions,
        lossReason,
        contradictionFlags,
        perturbationChanged: perturbationStates.some(item => item.state !== state),
        perturbationStates
    };
}

function contradictionFlagsFor(row, state, lane, params) {
    const flags = [];
    if (!isLaneState(state)) return flags;
    if (row.structuralRegions.nearTeamBase || row.structuralRegions.nearEnemyBase || row.structuralRegions.nearDeployment) flags.push('base_or_deployment_conflict');
    if (lane !== row.laneProjection.nearestLane && Number.isFinite(row.laneProjection.separationMargin) && row.laneProjection.separationMargin >= 75) flags.push('nearest_lane_conflict');
    if (Number.isFinite(row.movement.speed) && row.movement.speed > 900) flags.push('high_speed_classified_as_lane');
    if (Number.isFinite(row.laneProjection.separationMargin) && row.laneProjection.separationMargin < params.minMargin) flags.push('ambiguous_separation_classified_as_lane');
    return flags;
}

function buildObservation(row, classified) {
    const laneEvidence = Object.fromEntries(LANES.map(lane => [ lane, laneSupport(row, lane) ]));
    return {
        replayId: row.replayId,
        playerId: row.playerId,
        gameSecond: row.gameTimeSeconds,
        movementSpeed: row.movement.speed,
        baseDeploymentEvidence: row.structuralRegions.nearTeamBase || row.structuralRegions.nearEnemyBase ? 'base' : row.structuralRegions.nearDeployment ? 'deployment' : 'none',
        pointLevelModelState: classified.state,
        pointLevelLane: classified.physicalLaneId,
        laneEvidence
    };
}

function laneSupport(row, lane) {
    const item = row.laneProjection.allLaneDistances.find(distance => distance.lane === lane);
    const distance = item?.distance ?? null;
    const nearest = row.laneProjection.nearestLane === lane;
    const secondNearest = row.laneProjection.secondNearestLane === lane;
    const margin = row.laneProjection.separationMargin ?? 0;
    let support = 0;
    let contradiction = 0;
    let uncertainty = 0;
    if (!Number.isFinite(distance)) uncertainty += 2;
    else if (nearest && distance <= 380 && margin >= 90) support += 4;
    else if (nearest && distance <= 520 && margin >= 45) {
        support += 2;
        uncertainty += 1;
    } else if (nearest && distance <= 620) {
        support += 1;
        uncertainty += 2;
    } else if (!nearest && !secondNearest && distance > 620) contradiction += 2;
    if (!nearest && margin >= 90) contradiction += 2;
    if (row.structuralRegions.nearTeamBase || row.structuralRegions.nearEnemyBase) contradiction += 4;
    if (Number.isFinite(row.movement.speed) && row.movement.speed > 900) {
        contradiction += 2;
        uncertainty += 2;
    }
    return { distance: round(distance), support, contradiction, uncertainty };
}

function buildPointEpisodes(classifiedRows, candidate) {
    const episodes = [];
    for (const [ playerId, rows ] of groupBy(classifiedRows, row => row.playerId)) {
        let current = null;
        for (const row of rows.sort((left, right) => left.gameTimeSeconds - right.gameTimeSeconds)) {
            if (isLaneState(row.state) && row.physicalLaneId) {
                if (!current || current.physicalLaneId !== row.physicalLaneId || row.gameTimeSeconds > current.endSecond + 1) {
                    pushPointEpisode(episodes, current, candidate);
                    current = { playerId, physicalLaneId: row.physicalLaneId, startSecond: row.gameTimeSeconds, endSecond: row.gameTimeSeconds, rows: [ row ] };
                } else {
                    current.endSecond = row.gameTimeSeconds;
                    current.rows.push(row);
                }
            } else {
                pushPointEpisode(episodes, current, candidate, row.lossReason ?? 'state_change');
                current = null;
            }
        }
        pushPointEpisode(episodes, current, candidate, 'end_of_timeline');
    }
    return episodes;
}

function pushPointEpisode(episodes, current, candidate, reason = 'state_change') {
    if (!current) return;
    const durationSeconds = current.endSecond - current.startSecond + 1;
    const continuity = pointEpisodeContinuity(current.rows);
    const passesContinuity = !candidate.changes?.includes('spatial_continuity_episodes')
        || continuity.outsideRatio <= 0.2 && continuity.minMargin >= 45 && continuity.maxSpeed <= 900;
    if (durationSeconds >= (candidate.parameters?.minStableSeconds ?? BASELINE_PARAMETERS.minStableSeconds) && passesContinuity) {
        episodes.push({
            playerId: current.playerId,
            physicalLaneId: current.physicalLaneId,
            startSecond: current.startSecond,
            endSecond: current.endSecond,
            durationSeconds,
            contradictoryDuration: current.rows.filter(row => row.contradictionFlags.length > 0).length,
            uncertainDuration: current.rows.filter(row => row.state === 'lane_ambiguous').length,
            contradictionRatio: ratio(current.rows.filter(row => row.contradictionFlags.length > 0).length, current.rows.length),
            uncertainRatio: ratio(current.rows.filter(row => row.state === 'lane_ambiguous').length, current.rows.length),
            reasonForTermination: reason
        });
    }
}

function runSequential(candidate, observations) {
    if (candidate.id === 'hysteresis_state_machine') return runHysteresis(observations, candidate.parameters);
    if (candidate.id === 'windowed_evidence_accumulation') return runWindowed(observations, candidate.parameters);
    if (candidate.id === 'constrained_dynamic_programming') return runDynamicProgramming(observations, candidate.parameters);
    return [];
}

function runHysteresis(observations, params) {
    const episodes = [];
    for (const [ playerId, rows ] of groupBy(observations, row => row.playerId)) {
        let state = null;
        let candidate = null;
        let candidateStart = null;
        let current = null;
        let uncertainRun = 0;
        for (const observation of rows.sort((left, right) => left.gameSecond - right.gameSecond)) {
            const dominant = dominantLane(observation);
            if (!state && dominant.lane && dominant.support >= 2 && dominant.contradiction === 0) {
                if (candidate?.lane !== dominant.lane) {
                    candidate = { lane: dominant.lane, support: 0 };
                    candidateStart = observation.gameSecond;
                }
                candidate.support += 1;
                if (candidate.support >= params.enterSeconds) {
                    state = candidate.lane;
                    current = startEpisode(playerId, state, candidateStart, observation);
                    uncertainRun = 0;
                }
            } else if (state) {
                appendEpisodeObservation(current, observation);
                if (hardNonLaneState(observation) || strongCompetingLane(observation, state)) finishCurrent('strong_exit_evidence');
                else if (dominant.lane !== state || dominant.support < 2) {
                    uncertainRun += 1;
                    if (uncertainRun > params.uncertainTolerance) finishCurrent('uncertainty_tolerance_exceeded');
                } else {
                    uncertainRun = 0;
                }
            } else {
                candidate = null;
                candidateStart = null;
            }
        }
        finishCurrent('end_of_timeline');
        function finishCurrent(reason) {
            if (current) {
                current.reasonForTermination = reason;
                const finalized = finalizeEpisode(current, params);
                if (finalized.durationSeconds >= params.minDuration && finalized.supportRatio >= params.minSupportRatio && finalized.contradictionRatio <= params.maxContradictionRatio) episodes.push(finalized);
            }
            state = null;
            current = null;
            candidate = null;
            candidateStart = null;
            uncertainRun = 0;
        }
    }
    return episodes;
}

function runDynamicProgramming(observations, params) {
    const episodes = [];
    for (const [ playerId, rows ] of groupBy(observations, row => row.playerId)) {
        episodes.push(...episodesFromStateSequence(playerId, inferDpStates(rows.sort((left, right) => left.gameSecond - right.gameSecond), params), params));
    }
    return episodes;
}

function pointMetrics(classified, rows, candidate) {
    const validRows = classified.filter(row => row.positionQuality !== 'missing');
    const laneRows = classified.filter(row => isLaneState(row.state));
    const contradictionRows = classified.filter(row => row.contradictionFlags.length > 0);
    const instabilityRows = classified.filter(row => row.perturbationChanged);
    return {
        totalRows: rows.length,
        totalValidRows: validRows.length,
        laneClassifiedRows: laneRows.length,
        abstainedRows: classified.length - laneRows.length,
        coveragePercent: percent(laneRows.length, validRows.length),
        contradictionEvidenceRows: contradictionRows.length,
        contradictionFlags: countBy(contradictionRows.flatMap(row => row.contradictionFlags), flag => flag),
        instabilityRows: instabilityRows.length,
        instabilityPercent: percent(instabilityRows.length, validRows.length),
        stateDistribution: countBy(classified, row => row.state),
        frozenParameters: candidate.parameters
    };
}

function episodeMetrics(episodes, rows) {
    const durations = episodes.map(episode => episode.durationSeconds);
    return {
        episodeCount: episodes.length,
        totalEpisodeDuration: sum(durations),
        coverageDurationPercentOfPlayerTimeline: percent(sum(durations), rows.length),
        medianDuration: median(durations),
        durationDistribution: distribution(durations),
        fragmentationEpisodesPerPlayerHour: fragmentation(episodes, rows),
        shortEpisodesUnderFiveSeconds: episodes.filter(episode => episode.durationSeconds < 5).length,
        shortEpisodesUnderFifteenSeconds: episodes.filter(episode => episode.durationSeconds < 15).length,
        uncertainGapDuration: sum(episodes.map(episode => episode.uncertainDuration ?? 0)),
        terminationReasons: countBy(episodes, episode => episode.reasonForTermination ?? 'unknown')
    };
}

async function buildComparison(oneSecondResults) {
    const previous = await readFiveSecondResults();
    const byReplay = {};
    for (const replay of oneSecondResults) {
        byReplay[replay.replayId] = {};
        for (const candidate of replay.candidates) {
            const prior = previous[replay.replayId]?.[candidate.candidateId] ?? null;
            byReplay[replay.replayId][candidate.candidateId] = {
                oneSecond: summarizeCandidate(candidate),
                fiveSecond: prior,
                delta: prior ? deltaCandidate(candidate, prior) : null
            };
        }
    }
    const byCandidate = CANDIDATES.map(candidate => summarizeResolutionSensitivity(candidate.id, byReplay));
    return {
        schemaVersion: 1,
        kind: 'frozen_occupancy_one_second_resolution_comparison',
        byReplay,
        byCandidate,
        replay005Protection: { processed: false, status: 'preserved' }
    };
}

async function readFiveSecondResults() {
    const result = {};
    const files = {
        replay_001: 'output/replays/replay_001/five-second-control/frozen-occupancy-candidate-results.json',
        replay_002: 'output/replays/replay_002/frozen-occupancy-candidate-results.json',
        replay_003: 'output/replays/replay_003/frozen-occupancy-candidate-results.json',
        replay_004: 'output/replays/replay_004/frozen-occupancy-candidate-results.json'
    };
    for (const [ replayId, file ] of Object.entries(files)) {
        const json = JSON.parse(await fs.readFile(file, 'utf8'));
        result[replayId] = Object.fromEntries(json.candidates.map(candidate => [ candidate.candidateId, summarizeCandidate(candidate) ]));
    }
    return result;
}

function summarizeCandidate(candidate) {
    return {
        coveragePercent: candidate.pointMetrics.coveragePercent,
        contradictionEvidenceRows: candidate.pointMetrics.contradictionEvidenceRows,
        instabilityPercent: candidate.pointMetrics.instabilityPercent,
        episodeCount: candidate.episodeMetrics.episodeCount,
        fragmentationEpisodesPerPlayerHour: candidate.episodeMetrics.fragmentationEpisodesPerPlayerHour,
        totalEpisodeDuration: candidate.episodeMetrics.totalEpisodeDuration,
        medianDuration: candidate.episodeMetrics.medianDuration,
        shortEpisodesUnderFifteenSeconds: candidate.episodeMetrics.shortEpisodesUnderFifteenSeconds ?? candidate.episodeMetrics.shortEpisodes ?? 0
    };
}

function deltaCandidate(candidate, prior) {
    const one = summarizeCandidate(candidate);
    return {
        pointCoverageDelta: round(one.coveragePercent - prior.coveragePercent),
        contradictionDelta: one.contradictionEvidenceRows - prior.contradictionEvidenceRows,
        instabilityDelta: round(one.instabilityPercent - prior.instabilityPercent),
        episodeCountDelta: one.episodeCount - prior.episodeCount,
        fragmentationDelta: round(one.fragmentationEpisodesPerPlayerHour - prior.fragmentationEpisodesPerPlayerHour),
        durationDelta: round(one.totalEpisodeDuration - prior.totalEpisodeDuration),
        briefContactRecovery: Math.max(0, one.shortEpisodesUnderFifteenSeconds - prior.shortEpisodesUnderFifteenSeconds),
        gapSplittingOrMerging: one.episodeCount > prior.episodeCount ? 'more_splitting_at_one_second' : one.episodeCount < prior.episodeCount ? 'more_merging_or_filtering_at_one_second' : 'unchanged_episode_count'
    };
}

function summarizeResolutionSensitivity(candidateId, byReplay) {
    const deltas = Object.fromEntries(REPLAYS.map(replayId => [ replayId, byReplay[replayId][candidateId].delta ]));
    const generalizationDeltas = GENERALIZATION_REPLAYS.map(replayId => deltas[replayId]).filter(Boolean);
    const coverageDeltas = generalizationDeltas.map(delta => Math.abs(delta.pointCoverageDelta));
    const episodeDeltas = generalizationDeltas.map(delta => Math.abs(delta.episodeCountDelta));
    const fragmentationDeltas = generalizationDeltas.map(delta => Math.abs(delta.fragmentationDelta));
    const classification = Math.max(...coverageDeltas) <= 5 && Math.max(...episodeDeltas) <= 100
        ? 'resolution_robust'
        : Math.max(...coverageDeltas) <= 10 && Math.max(...fragmentationDeltas) <= 75
            ? 'moderately_resolution_sensitive'
            : 'strongly_resolution_sensitive';
    return {
        candidateId,
        classification,
        deltas,
        maxAbsCoverageDelta: round(Math.max(...coverageDeltas)),
        maxAbsEpisodeCountDelta: round(Math.max(...episodeDeltas)),
        maxAbsFragmentationDelta: round(Math.max(...fragmentationDeltas))
    };
}

function buildGate(comparison) {
    const strong = comparison.byCandidate.filter(candidate => candidate.classification === 'strongly_resolution_sensitive');
    const robust = comparison.byCandidate.filter(candidate => candidate.classification === 'resolution_robust');
    const gateResult = strong.length > robust.length
        ? 'one_second_frozen_comparison_resolution_sensitive'
        : 'one_second_frozen_comparison_ready_for_method_review';
    return {
        schemaVersion: 1,
        kind: 'frozen_occupancy_one_second_gate',
        gateResult,
        evidence: {
            resolutionSensitivityByCandidate: Object.fromEntries(comparison.byCandidate.map(candidate => [ candidate.candidateId, candidate.classification ])),
            robustCandidates: robust.map(candidate => candidate.candidateId),
            stronglySensitiveCandidates: strong.map(candidate => candidate.candidateId)
        },
        allowedLimitedUse: [
            'point-level physical lane proximity evidence',
            'base/deployment exclusion evidence',
            'resolution sensitivity assessment'
        ],
        prohibitedUses: [
            'semantic occupancy correctness',
            'reliable occupancy episodes',
            'transition detection',
            'strategic interpretation',
            'replay 005 conclusions'
        ],
        replay005Readiness: {
            status: 'not_ready_resolution_confounded',
            reason: 'One-second comparison shows candidate-specific resolution sensitivity; no final holdout hypothesis and pass/fail criteria are frozen.'
        },
        replay005Protection: { processed: false, status: 'preserved' }
    };
}

async function writeReport(results, comparison, gate) {
    const lines = comparison.byCandidate.map(candidate => `- ${candidate.candidateId}: ${candidate.classification}, max coverage delta ${candidate.maxAbsCoverageDelta}, max episode-count delta ${candidate.maxAbsEpisodeCountDelta}, max fragmentation delta ${candidate.maxAbsFragmentationDelta}.`).join('\n');
    const replayLines = results.map(replay => `- ${replay.replayId}: ${replay.rowCount} one-second rows.`).join('\n');
    const report = `# Frozen Occupancy One-Second Resolution Comparison

## Scope

The same frozen candidates were applied to one-second spatial timelines for replays 001-004. No thresholds were changed, replay 005 was not processed, and outputs remain non-semantic evidence.

## Replays

${replayLines}

## Candidate sensitivity

${lines}

## Gate

\`${gate.gateResult}\`

## Allowed limited use

- Point-level physical lane proximity evidence.
- Base/deployment exclusion evidence.
- Resolution sensitivity assessment.

## Prohibited conclusions

- Semantic occupancy correctness.
- Reliable occupancy episodes.
- Transition detection or rotations.
- Strategic interpretation.
- Replay 005 conclusions.
`;
    await fs.writeFile('reports/frozen-occupancy-one-second-resolution-comparison.md', report);
    await fs.writeFile('reports/latest.md', 'reports/frozen-occupancy-one-second-resolution-comparison.md\n');
}

function candidateResolutionNotes(candidate) {
    return Object.fromEntries(Object.entries(candidate.parameters).map(([ key, value ]) => [ key, {
        value,
        parameterType: /Seconds|Duration/u.test(key) ? 'physical_time_parameter' : /Tolerance|Gap/u.test(key) ? 'sample_count_parameter' : /Distance|Radius|Margin/u.test(key) ? 'distance_parameter' : 'categorical_or_weight',
        changed: false
    } ]));
}

function runWindowed(observations, params) {
    const episodes = [];
    for (const [ playerId, rows ] of groupBy(observations, row => row.playerId)) {
        const windows = segmentWindows(rows, params.windowSeconds).map(window => inferWindowState(window, params));
        episodes.push(...episodesFromWindowStates(playerId, windows, params));
    }
    return episodes;
}

function segmentWindows(rows, windowSeconds) {
    const sorted = rows.slice().sort((left, right) => left.gameSecond - right.gameSecond);
    const windows = [];
    let current = [];
    let start = null;
    for (const row of sorted) {
        if (start === null || row.gameSecond >= start + windowSeconds) {
            if (current.length > 0) windows.push(current);
            current = [ row ];
            start = row.gameSecond;
        } else {
            current.push(row);
        }
    }
    if (current.length > 0) windows.push(current);
    return windows;
}

function inferWindowState(rows, params) {
    const scores = Object.fromEntries(LANES.map(lane => [ lane, sum(rows.map(row => row.laneEvidence[lane].support - row.laneEvidence[lane].contradiction)) ]));
    const ranked = Object.entries(scores).sort((left, right) => right[1] - left[1]);
    const baseRows = rows.filter(row => row.baseDeploymentEvidence !== 'none').length;
    let state = 'unknown';
    if (baseRows / rows.length >= 0.4) state = rows.some(row => row.baseDeploymentEvidence === 'base') ? 'base' : 'deployment';
    else if (ranked[0][1] - ranked[1][1] >= params.supportMargin && ranked[0][1] > 0) state = ranked[0][0];
    else if (rows.some(row => row.movementSpeed > 900)) state = 'neutral_or_transit';
    return { state, startSecond: rows[0].gameSecond, endSecond: rows.at(-1).gameSecond, rows };
}

function episodesFromWindowStates(playerId, windows, params) {
    const episodes = [];
    let current = null;
    for (const window of windows) {
        if (LANES.includes(window.state)) {
            if (!current || current.physicalLaneId !== window.state || window.startSecond > current.endSecond + params.windowSeconds) {
                pushWindowEpisode(episodes, current, params);
                current = { playerId, inferredState: window.state, physicalLaneId: window.state, startSecond: window.startSecond, endSecond: window.endSecond, observations: [ ...window.rows ] };
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
    pushWindowEpisode(episodes, current, params, 'end_of_timeline');
    return episodes;
}

function pushWindowEpisode(episodes, current, params, reason = 'window_state_change') {
    if (!current) return;
    const evidence = evidenceFromObservations(current.observations, current.physicalLaneId);
    const episode = {
        playerId: current.playerId,
        physicalLaneId: current.physicalLaneId,
        startSecond: current.startSecond,
        endSecond: current.endSecond,
        durationSeconds: current.endSecond - current.startSecond + 1,
        ...evidence,
        reasonForTermination: reason
    };
    if (episode.durationSeconds >= params.minDuration && episode.supportRatio >= params.minSupportRatio && episode.contradictionRatio <= params.maxContradictionRatio) episodes.push(episode);
}

function inferDpStates(rows, params) {
    const states = [ 'unknown', 'neutral_or_transit', 'base', 'deployment', ...LANES ];
    const dp = [];
    for (let index = 0; index < rows.length; index++) {
        const current = new Map();
        for (const state of states) {
            const obs = observationScore(rows[index], state, params);
            if (index === 0) current.set(state, { score: obs, previous: null });
            else {
                let best = null;
                for (const previous of states) {
                    const prev = dp[index - 1].get(previous);
                    const score = prev.score + obs - transitionCost(previous, state, rows[index], params);
                    if (!best || score > best.score) best = { score, previous };
                }
                current.set(state, best);
            }
        }
        dp.push(current);
    }
    let state = [ ...dp.at(-1).entries() ].sort((left, right) => right[1].score - left[1].score)[0][0];
    const sequence = [];
    for (let index = rows.length - 1; index >= 0; index--) {
        sequence.unshift({ ...rows[index], inferredState: state });
        state = dp[index].get(state).previous;
    }
    return sequence;
}

function episodesFromStateSequence(playerId, states, params) {
    const episodes = [];
    let current = null;
    for (const row of states) {
        if (LANES.includes(row.inferredState)) {
            if (!current || current.physicalLaneId !== row.inferredState) {
                pushWindowEpisode(episodes, current, params, 'dp_state_change');
                current = { playerId, inferredState: row.inferredState, physicalLaneId: row.inferredState, startSecond: row.gameSecond, endSecond: row.gameSecond, observations: [ row ] };
            } else {
                current.endSecond = row.gameSecond;
                current.observations.push(row);
            }
        } else {
            pushWindowEpisode(episodes, current, params, row.inferredState);
            current = null;
        }
    }
    pushWindowEpisode(episodes, current, params, 'end_of_timeline');
    return episodes;
}

function observationScore(row, state, params) {
    if (state === 'unknown') return -params.unknownPenalty;
    if (state === 'base') return row.baseDeploymentEvidence === 'base' ? 3 : -2;
    if (state === 'deployment') return row.baseDeploymentEvidence === 'deployment' ? 2 : -1;
    if (state === 'neutral_or_transit') return row.movementSpeed > 900 ? 2 : -0.2;
    const evidence = row.laneEvidence[state];
    return evidence.support - evidence.contradiction - evidence.uncertainty * 0.2;
}

function transitionCost(previous, state, row, params) {
    if (previous === state) return 0;
    let cost = params.switchPenalty;
    if (LANES.includes(previous) && LANES.includes(state) && row.movementSpeed < 600) cost += params.impossibleLaneSwitchPenalty;
    if (state === 'unknown') cost -= params.unknownPenalty;
    return cost;
}

function hardNonLaneState(observation) {
    if ([ 'base', 'deployment' ].includes(observation.baseDeploymentEvidence)) return observation.baseDeploymentEvidence;
    if (observation.movementSpeed > 1100) return 'neutral_or_transit';
    return null;
}

function dominantLane(observation) {
    const ranked = LANES.map(lane => ({ lane, ...observation.laneEvidence[lane] })).sort((left, right) => (right.support - right.contradiction) - (left.support - left.contradiction));
    const best = ranked[0];
    const second = ranked[1];
    if ((best.support - best.contradiction) <= 0 || (best.support - best.contradiction) - (second.support - second.contradiction) < 1) return { ...best, lane: null };
    return best;
}

function strongCompetingLane(observation, currentLane) {
    const dominant = dominantLane(observation);
    return dominant.lane && dominant.lane !== currentLane && dominant.support >= 3 && dominant.contradiction === 0;
}

function startEpisode(playerId, state, startSecond, observation) {
    return { playerId, inferredState: state, physicalLaneId: state, startSecond, endSecond: observation.gameSecond, observations: [ observation ] };
}

function appendEpisodeObservation(episode, observation) {
    episode.endSecond = observation.gameSecond;
    episode.observations.push(observation);
}

function finalizeEpisode(episode) {
    const evidence = evidenceFromObservations(episode.observations, episode.physicalLaneId);
    return {
        playerId: episode.playerId,
        physicalLaneId: episode.physicalLaneId,
        startSecond: episode.startSecond,
        endSecond: episode.endSecond,
        durationSeconds: episode.endSecond - episode.startSecond + 1,
        ...evidence,
        reasonForTermination: episode.reasonForTermination ?? 'end_of_interval'
    };
}

function evidenceFromObservations(observations, lane) {
    const support = observations.filter(observation => observation.laneEvidence[lane]?.support > observation.laneEvidence[lane]?.contradiction).length;
    const contradictory = observations.filter(observation => observation.laneEvidence[lane]?.contradiction > observation.laneEvidence[lane]?.support || [ 'base', 'deployment' ].includes(observation.baseDeploymentEvidence)).length;
    const uncertain = observations.length - support - contradictory;
    return {
        supportDuration: support,
        contradictoryDuration: contradictory,
        uncertainDuration: uncertain,
        supportRatio: ratio(support, observations.length),
        contradictionRatio: ratio(contradictory, observations.length),
        uncertainRatio: ratio(uncertain, observations.length)
    };
}

function pointEpisodeContinuity(rows) {
    const margins = rows.map(row => row.separationMargin).filter(Number.isFinite);
    const speeds = rows.map(row => row.speed).filter(Number.isFinite);
    return {
        outsideRatio: 0,
        minMargin: margins.length > 0 ? Math.min(...margins) : null,
        maxSpeed: speeds.length > 0 ? Math.max(...speeds) : null
    };
}

async function validateOutputs(files) {
    for (const file of files) {
        const stat = await fs.stat(file);
        if (file.endsWith('.json') && stat.size > OUTPUT_SIZE_LIMIT) throw new Error(`${file} exceeds size limit`);
        if (file.endsWith('.json')) JSON.parse(await fs.readFile(file, 'utf8'));
    }
}

async function readJsonl(file) {
    const content = await fs.readFile(file, 'utf8');
    return content.trim().split(/\r?\n/u).filter(Boolean).map(line => JSON.parse(line));
}

async function writeJson(file, value) {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

function applyPerturbation(params, changes) {
    return Object.fromEntries(Object.entries(params).map(([ key, value ]) => [ key, Number.isFinite(changes[key]) ? value + changes[key] : value ]));
}

function isLaneState(state) {
    return [ 'lane_core_high', 'lane_core_medium', 'lane_occupiable' ].includes(state);
}

function fragmentation(episodes, rows) {
    const durationHours = rows.length === 0 ? 0 : Math.max(...rows.map(row => row.gameTimeSeconds)) / 3600;
    const players = new Set(rows.map(row => row.playerId)).size;
    return round(durationHours > 0 && players > 0 ? episodes.length / players / durationHours : 0);
}

function groupBy(items, keyFn) {
    const groups = new Map();
    for (const item of items) {
        const key = keyFn(item);
        const group = groups.get(key) ?? [];
        group.push(item);
        groups.set(key, group);
    }
    return groups;
}

function countBy(items, keyFn) {
    const counts = {};
    for (const item of items) {
        const key = keyFn(item) ?? 'null';
        counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
}

function distribution(values) {
    const clean = values.filter(Number.isFinite).sort((left, right) => left - right);
    return { count: clean.length, min: round(clean[0]), median: round(median(clean)), p90: round(clean[Math.floor(clean.length * 0.9)]), max: round(clean.at(-1)) };
}

function median(values) {
    const clean = values.filter(Number.isFinite).sort((left, right) => left - right);
    if (clean.length === 0) return null;
    const middle = Math.floor(clean.length / 2);
    return clean.length % 2 === 0 ? round((clean[middle - 1] + clean[middle]) / 2) : round(clean[middle]);
}

function sum(values) {
    return values.filter(Number.isFinite).reduce((total, value) => total + value, 0);
}

function percent(value, total) {
    return total === 0 ? 0 : round(value * 100 / total);
}

function ratio(value, total) {
    return total === 0 ? 0 : round(value / total);
}

function stableStringify(value) {
    return JSON.stringify(sortKeys(value));
}

function sortKeys(value) {
    if (Array.isArray(value)) return value.map(sortKeys);
    if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [ key, sortKeys(value[key]) ]));
    return value;
}

function round(value) {
    return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
}
