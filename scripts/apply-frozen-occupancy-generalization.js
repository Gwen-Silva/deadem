import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

import { Logger, Player } from 'deadem';

const OUTPUT_SIZE_LIMIT = 10 * 1024 * 1024;
const TIME_STEP_SECONDS = 5;
const CONTROL_REPLAY = { replayId: 'replay_001', file: 'samples/partida_001.dem' };
const GENERALIZATION_REPLAYS = [ 'replay_002', 'replay_003', 'replay_004' ];
const LANES = [ 'lane_axis_1', 'lane_axis_2', 'lane_axis_3' ];
const CONTROLLER_CLASS = 'CCitadelPlayerController';
const PAWN_CLASS = 'CCitadelPlayerPawn';
const LONG_CARRY_SECONDS = 5;
const STALE_SECONDS = 10;
const IMPOSSIBLE_SPEED = 3000;
const BASE_RADIUS = 700;
const CENTRAL_RADIUS = 500;
const NEUTRAL_RADIUS = 450;

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
        id: 'original_experiment_23_balanced',
        kind: 'point_model',
        originatingExperimentOrTask: 'experiment 23',
        sourceScript: 'experiments/23-calibrate-lane-occupancy.js',
        sourceOutput: 'output/23-calibrated-lane-occupancy.json',
        parameters: BASELINE_PARAMETERS,
        changes: [],
        reproducibilityStatus: 'reproducible_with_schema_adapter',
        expectedTemporalResolution: 'fine replay 001 movement rows; adapted to five-second rows without threshold changes',
        episodeBuildingAssumptions: 'contiguous lane_core_high/lane_core_medium/lane_occupiable rows with minStableSeconds and interruptionTolerance from experiment 23'
    },
    {
        id: 'conservative_point_revision_combined',
        kind: 'point_model',
        originatingExperimentOrTask: 'task 005 / experiment 24',
        sourceScript: 'experiments/24-revise-lane-occupancy-model.js',
        sourceOutput: 'output/24-revised-lane-occupancy.json',
        parameters: BASELINE_PARAMETERS,
        changes: [ 'base_deployment_precedence', 'separation_ambiguity', 'transit_filter', 'spatial_continuity_episodes' ],
        reproducibilityStatus: 'reproducible_with_schema_adapter',
        expectedTemporalResolution: 'fine replay 001 movement rows; adapted to five-second rows without threshold changes',
        episodeBuildingAssumptions: 'task 005 point revision converted to episodes with spatial continuity filter'
    },
    {
        id: 'hysteresis_state_machine',
        kind: 'sequential_episode_model',
        originatingExperimentOrTask: 'task 015 / experiment 24 architecture prototype',
        sourceScript: 'experiments/24-prototype-uncertainty-aware-lane-episode-segmentation.js',
        sourceOutput: 'output/24-hysteresis-occupancy-episodes.json',
        parameters: {
            id: 'hysteresis_state_machine',
            enterSeconds: 4,
            uncertainTolerance: 5,
            rejoinGap: 4,
            minDuration: 5,
            minSupportRatio: 0.45,
            maxContradictionRatio: 0.28
        },
        changes: [ 'temporal_confidence_decay' ],
        reproducibilityStatus: 'reproducible_with_schema_adapter',
        expectedTemporalResolution: 'diagnostic replay 001 observation rows; adapted to five-second rows without threshold changes',
        episodeBuildingAssumptions: 'lane state entered after sustained support and retained through bounded uncertainty'
    },
    {
        id: 'windowed_evidence_accumulation',
        kind: 'sequential_episode_model',
        originatingExperimentOrTask: 'task 015 / experiment 24 architecture prototype',
        sourceScript: 'experiments/24-prototype-uncertainty-aware-lane-episode-segmentation.js',
        sourceOutput: 'output/24-windowed-evidence-occupancy-episodes.json',
        parameters: {
            id: 'windowed_evidence_accumulation',
            windowSeconds: 5,
            supportMargin: 2,
            minDuration: 5,
            minSupportRatio: 0.42,
            maxContradictionRatio: 0.3
        },
        changes: [ 'fixed_window_evidence_accumulation' ],
        reproducibilityStatus: 'reproducible_with_schema_adapter',
        expectedTemporalResolution: 'five-second windows are explicitly parameterized',
        episodeBuildingAssumptions: 'adjacent windows with the same inferred lane are merged unless base/deployment terminates them'
    },
    {
        id: 'constrained_dynamic_programming',
        kind: 'sequential_episode_model',
        originatingExperimentOrTask: 'task 015 / experiment 24 architecture prototype',
        sourceScript: 'experiments/24-prototype-uncertainty-aware-lane-episode-segmentation.js',
        sourceOutput: 'output/24-dynamic-programming-occupancy-episodes.json',
        parameters: {
            id: 'constrained_dynamic_programming',
            switchPenalty: 2.2,
            impossibleLaneSwitchPenalty: 4,
            unknownPenalty: 0.35,
            minDuration: 5,
            minSupportRatio: 0.4,
            maxContradictionRatio: 0.32
        },
        changes: [ 'deterministic_sequence_optimization' ],
        reproducibilityStatus: 'reproducible_with_schema_adapter',
        expectedTemporalResolution: 'diagnostic replay 001 observation rows; adapted to five-second rows without threshold changes',
        episodeBuildingAssumptions: 'interpretable dynamic programming over observation support, contradiction, unknown, and state-change costs'
    }
];

const EXCLUDED_CANDIDATES = [
    {
        id: 'annotated_original_episodes',
        originatingExperimentOrTask: 'task 015 / experiment 24 architecture prototype',
        sourceOutput: 'output/24-annotated-original-occupancy-episodes.json',
        classification: 'resolution_incompatible',
        reason: 'The candidate preserves replay 001 experiment 23 episode boundaries. Those boundaries are replay-specific outputs, not a frozen cross-replay construction rule for five-second timelines.'
    }
];

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});

async function main() {
    const profile = JSON.parse(await fs.readFile('output/replay-lane-axis-topology-profile.json', 'utf8'));
    const gate25 = JSON.parse(await fs.readFile('output/replays/full-spatial-timeline-gate.json', 'utf8'));
    if (!gate25.gateResult.startsWith('full_spatial_timeline_ready')) {
        throw new Error(`Task 025 gate does not permit frozen model application: ${gate25.gateResult}`);
    }

    const geometry = buildGeometry(profile);
    const laneMapping = buildNeutralLaneMapping(profile);
    const control = await buildReplay001Control(geometry, profile);
    const datasets = await loadDatasets(control);
    const provenance = buildProvenance(laneMapping);
    const datasetResults = [];

    for (const dataset of datasets) {
        const result = evaluateDataset(dataset);
        datasetResults.push(result);
        if (dataset.outputFile) {
            await writeJson(dataset.outputFile, result);
        }
    }

    const resolutionEffect = buildResolutionEffect(datasetResults);
    const comparison = buildGeneralizationComparison(datasetResults, provenance, resolutionEffect);
    const gate = buildGeneralizationGate(comparison, resolutionEffect);

    await writeJson('output/replays/frozen-candidate-provenance.json', provenance);
    await writeJson('output/replays/frozen-occupancy-resolution-effect.json', resolutionEffect);
    await writeJson('output/replays/frozen-occupancy-generalization-comparison.json', comparison);
    await writeJson('output/replays/frozen-occupancy-generalization-gate.json', gate);
    await writeReport(provenance, datasetResults, resolutionEffect, comparison, gate);
    await validateOutputs([
        'output/replays/replay_001/five-second-control/full-spatial-timeline.json',
        'output/replays/replay_001/five-second-control/full-spatial-timeline.rows.jsonl',
        'output/replays/replay_001/five-second-control/frozen-occupancy-candidate-results.json',
        'output/replays/replay_002/frozen-occupancy-candidate-results.json',
        'output/replays/replay_003/frozen-occupancy-candidate-results.json',
        'output/replays/replay_004/frozen-occupancy-candidate-results.json',
        'output/replays/frozen-candidate-provenance.json',
        'output/replays/frozen-occupancy-resolution-effect.json',
        'output/replays/frozen-occupancy-generalization-comparison.json',
        'output/replays/frozen-occupancy-generalization-gate.json',
        'reports/frozen-occupancy-generalization.md'
    ]);

    console.log(`frozen occupancy gate: ${gate.gateResult}`);
    console.log(`replay 005 readiness: ${gate.replay005Readiness.status}`);
}

async function buildReplay001Control(geometry, profile) {
    const replay = CONTROL_REPLAY;
    const outputDir = path.join('output', 'replays', replay.replayId, 'five-second-control');
    const rowsFile = path.join(outputDir, 'full-spatial-timeline.rows.jsonl');
    const manifestFile = path.join(outputDir, 'full-spatial-timeline.json');
    await fs.mkdir(outputDir, { recursive: true });
    await fs.writeFile(rowsFile, '');

    const player = new Player(undefined, Logger.NOOP);
    const rowHashes = [];
    const allRows = [];
    try {
        await player.load(createReadStream(replay.file));
        const firstTickRaw = player.getFirstTick();
        const effectiveFirstTick = firstTickRaw < 0 ? 0 : firstTickRaw;
        const lastTick = player.getLastTick();
        const tickRate = player.getDemo().server?.tickRate ?? null;
        if (!Number.isFinite(tickRate) || tickRate <= 0) {
            throw new Error('replay_001 has invalid tick rate');
        }
        const durationSeconds = Math.floor((lastTick - effectiveFirstTick) / tickRate);
        const players = await discoverPlayers(player, effectiveFirstTick, lastTick, tickRate);
        const playerState = new Map(players.map(item => [ item.playerId, emptyPlayerState() ]));

        for (let second = 0; second <= durationSeconds; second += TIME_STEP_SECONDS) {
            const tick = Math.min(lastTick, Math.round(effectiveFirstTick + second * tickRate));
            await player.seekToTick(tick);
            const snapshot = snapshotPlayers(player, players, second, tick);
            const rows = buildRows(replay.replayId, players, snapshot, playerState, geometry);
            for (const row of rows) {
                const serialized = JSON.stringify(row);
                rowHashes.push(hash(serialized));
                allRows.push(row);
            }
            await fs.appendFile(rowsFile, `${rows.map(row => JSON.stringify(row)).join('\n')}\n`);
        }

        const manifest = {
            schemaVersion: 1,
            kind: 'five_second_control_spatial_timeline_manifest',
            replayId: replay.replayId,
            sourceReplay: replay.file,
            controlPurpose: 'Resolution control for frozen occupancy generalization; same five-second alignment, row schema, and lane projection logic as task 025.',
            rowsFile,
            rowFormat: 'jsonl',
            temporalResolutionSeconds: TIME_STEP_SECONDS,
            rowCount: allRows.length,
            playerCount: players.length,
            firstGameTimeSeconds: 0,
            lastGameTimeSeconds: durationSeconds,
            tickDomain: { firstTickRaw, effectiveFirstTick, lastTick, tickRate, durationSeconds },
            topologyProfile: profile.profileId,
            coordinateTransform: profile.coordinateTransform,
            contentHash: hash(rowHashes.join('\n')),
            replay005Protection: { processed: false, status: 'preserved' }
        };
        await writeJson(manifestFile, manifest);
        return { manifest, rowsFile, rows: allRows };
    } finally {
        await player.dispose();
    }
}

async function loadDatasets(control) {
    const datasets = [
        {
            datasetId: 'replay_001_fine_original',
            replayId: 'replay_001',
            temporalResolution: 'fine_original_existing_artifacts',
            rows: await loadReplay001FineRows(),
            outputFile: null,
            limitations: [ 'fine rows come from existing replay 001 experiment 23/24 artifacts; exact full-spatial row schema is unavailable' ]
        },
        {
            datasetId: 'replay_001_five_second_control',
            replayId: 'replay_001',
            temporalResolution: 'five_second_control',
            rows: control.rows,
            outputFile: 'output/replays/replay_001/five-second-control/frozen-occupancy-candidate-results.json',
            limitations: [ 'contacts shorter than five seconds are unobservable' ]
        }
    ];
    for (const replayId of GENERALIZATION_REPLAYS) {
        datasets.push({
            datasetId: `${replayId}_five_second`,
            replayId,
            temporalResolution: 'five_second',
            rows: await readJsonl(`output/replays/${replayId}/full-spatial-timeline.rows.jsonl`),
            outputFile: `output/replays/${replayId}/frozen-occupancy-candidate-results.json`,
            limitations: [ 'contacts shorter than five seconds are unobservable' ]
        });
    }
    return datasets;
}

async function loadReplay001FineRows() {
    try {
        const timeline = JSON.parse(await fs.readFile('output/24-revised-lane-occupancy.json', 'utf8'));
        const rows = timeline.rows ?? timeline.timeline ?? timeline.data ?? [];
        return rows.map(row => ({
            replayId: 'replay_001',
            playerId: String(row.playerIndex ?? row.playerId),
            heroId: null,
            team: row.team ?? null,
            tick: null,
            gameTimeSeconds: row.gameSecond,
            position: { x: row.x ?? null, y: row.y ?? null, z: row.z ?? null, sourceTick: null, ageSeconds: 0, quality: Number.isFinite(row.x) && Number.isFinite(row.y) ? 'direct' : 'missing' },
            laneProjection: {
                nearestLane: mapHistoricalLane(row.candidateLane),
                nearestDistance: row.distanceToAxis ?? null,
                secondNearestLane: mapHistoricalLane(row.secondLane),
                secondNearestDistance: row.secondDistanceToAxis ?? null,
                separationMargin: row.separationMargin ?? null,
                normalizedProgress: null,
                projectedX: null,
                projectedY: null,
                segmentIndex: null,
                projectionQuality: Number.isFinite(row.distanceToAxis) ? 'existing_fine_artifact' : null,
                allLaneDistances: []
            },
            structuralRegions: {
                nearTeamBase: row.baseState === 'base_core',
                nearEnemyBase: false,
                nearDeployment: row.baseState === 'deployment_ambiguous',
                nearCentralObjective: false,
                nearNeutralStructure: false,
                outsideKnownStructuralEnvelope: false
            },
            movement: {
                distanceFromPrevious: null,
                horizontalDistanceFromPrevious: null,
                speed: row.speed ?? null,
                directionX: null,
                directionY: null,
                acceleration: null,
                gapSeconds: null,
                continuityStatus: 'existing_fine_artifact'
            },
            validationFlags: [],
            existingFineState: row.state ?? null,
            existingFineLane: mapHistoricalLane(row.physicalLaneId)
        })).filter(row => Number.isFinite(row.gameTimeSeconds));
    } catch {
        return [];
    }
}

function evaluateDataset(dataset) {
    const rows = dataset.rows;
    const candidateResults = CANDIDATES.map(candidate => evaluateCandidateOnRows(candidate, rows, dataset));
    return {
        schemaVersion: 1,
        kind: 'frozen_occupancy_candidate_results',
        datasetId: dataset.datasetId,
        replayId: dataset.replayId,
        temporalResolution: dataset.temporalResolution,
        rowCount: rows.length,
        limitations: dataset.limitations,
        candidates: candidateResults,
        excludedCandidates: EXCLUDED_CANDIDATES,
        replay005Protection: { processed: false, status: 'preserved' }
    };
}

function evaluateCandidateOnRows(candidate, rows, dataset) {
    const classified = candidate.kind === 'point_model'
        ? rows.map(row => classifyPointCandidate(row, candidate))
        : rows.map(row => classifyPointCandidate(row, CANDIDATES[1]));
    const observations = rows.map((row, index) => buildObservation(row, classified[index]));
    const episodes = candidate.kind === 'sequential_episode_model'
        ? runSequentialCandidate(candidate, observations)
        : buildPointModelEpisodes(classified, candidate);
    const pointMetrics = pointBehavior(classified, rows, candidate);
    const episodeMetrics = episodeBehavior(episodes, rows);
    return {
        candidateId: candidate.id,
        reproducibilityStatus: candidate.reproducibilityStatus,
        datasetId: dataset.datasetId,
        appliedAs: candidate.kind,
        schemaAdaptation: 'full-spatial row fields mapped to frozen distance, margin, speed, and structural-region inputs; no threshold changes',
        fineResolutionApplication: dataset.datasetId === 'replay_001_fine_original'
            ? 'partial_existing_artifact_adapter; exact full-spatial fine rows are unavailable'
            : 'not_fine_resolution',
        pointMetrics,
        episodeMetrics,
        distribution: distributionBehavior(classified, episodes),
        resolutionParameterInterpretation: parameterInterpretation(candidate),
        sampleRows: classified.slice(0, 3)
    };
}

function classifyPointCandidate(row, candidate, overrides = {}, includePerturbations = true) {
    const params = applyPerturbation(candidate.parameters ?? BASELINE_PARAMETERS, overrides);
    const nearest = row.laneProjection?.nearestLane ?? null;
    const second = row.laneProjection?.secondNearestLane ?? null;
    const nearestDistance = row.laneProjection?.nearestDistance ?? null;
    const secondDistance = row.laneProjection?.secondNearestDistance ?? null;
    const margin = row.laneProjection?.separationMargin ?? (Number.isFinite(secondDistance) && Number.isFinite(nearestDistance) ? secondDistance - nearestDistance : null);
    const speed = row.movement?.speed ?? null;
    const changes = new Set(candidate.changes ?? []);
    const strongBase = row.structuralRegions?.nearTeamBase || row.structuralRegions?.nearEnemyBase;
    const strongDeployment = row.structuralRegions?.nearDeployment;
    const highSpeed = Number.isFinite(speed) && speed > 900;
    const boundaryAmbiguous = Number.isFinite(margin) && margin < 75;
    const weakEnvelope = Number.isFinite(nearestDistance) && nearestDistance > params.maxCoreDistance && nearestDistance <= params.maxOccupancyDistance;
    let state = 'unknown';
    let physicalLaneId = null;
    let lossReason = null;

    if (row.position?.quality === 'missing' || !Number.isFinite(row.position?.x) || !Number.isFinite(row.position?.y)) {
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
        state: classifyPointCandidate(row, candidate, perturbation.changes, false).state
    })) : [];
    return {
        replayId: row.replayId,
        playerId: row.playerId,
        team: row.team,
        gameTimeSeconds: row.gameTimeSeconds,
        state,
        physicalLaneId,
        candidateLane: nearest,
        secondLane: second,
        nearestDistance,
        secondDistance,
        separationMargin: margin,
        speed,
        positionQuality: row.position?.quality ?? null,
        structuralRegions: row.structuralRegions,
        lossReason,
        contradictionFlags,
        perturbationChanged: perturbationStates.some(item => item.state !== state),
        perturbationStates
    };
}

function contradictionFlagsFor(row, state, lane, params) {
    const flags = [];
    const laneState = isLaneState(state);
    const margin = row.laneProjection?.separationMargin;
    if (laneState && (row.structuralRegions?.nearTeamBase || row.structuralRegions?.nearEnemyBase || row.structuralRegions?.nearDeployment)) {
        flags.push('base_or_deployment_conflict');
    }
    if (laneState && lane !== row.laneProjection?.nearestLane && Number.isFinite(margin) && margin >= 75) {
        flags.push('nearest_lane_conflict');
    }
    if (laneState && Number.isFinite(row.movement?.speed) && row.movement.speed > 900) {
        flags.push('high_speed_classified_as_lane');
    }
    if (laneState && Number.isFinite(margin) && margin < params.minMargin) {
        flags.push('ambiguous_separation_classified_as_lane');
    }
    return flags;
}

function buildObservation(row, classified) {
    const laneEvidence = Object.fromEntries(LANES.map(lane => [ lane, laneSupport(row, lane) ]));
    return {
        replayId: row.replayId,
        playerId: row.playerId,
        team: row.team,
        playerIndex: row.playerId,
        gameSecond: row.gameTimeSeconds,
        movementSpeed: row.movement?.speed ?? null,
        baseDeploymentEvidence: row.structuralRegions?.nearTeamBase || row.structuralRegions?.nearEnemyBase ? 'base' : row.structuralRegions?.nearDeployment ? 'deployment' : 'none',
        pointLevelModelState: classified.state,
        pointLevelLane: classified.physicalLaneId,
        laneEvidence,
        classified
    };
}

function laneSupport(row, lane) {
    const item = row.laneProjection?.allLaneDistances?.find(distance => distance.lane === lane);
    const distance = item?.distance ?? (row.laneProjection?.nearestLane === lane ? row.laneProjection.nearestDistance : null);
    const nearest = row.laneProjection?.nearestLane === lane;
    const secondNearest = row.laneProjection?.secondNearestLane === lane;
    const margin = row.laneProjection?.separationMargin ?? 0;
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
    if (!nearest && margin >= 90) contradiction += 2;
    if (row.structuralRegions?.nearTeamBase || row.structuralRegions?.nearEnemyBase) contradiction += 4;
    if (Number.isFinite(row.movement?.speed) && row.movement.speed > 900) {
        contradiction += 2;
        uncertainty += 2;
    }
    return { distance: round(distance), support, contradiction, uncertainty };
}

function buildPointModelEpisodes(classifiedRows, candidate) {
    const episodes = [];
    const byPlayer = groupBy(classifiedRows, row => row.playerId);
    for (const [ playerId, rows ] of byPlayer.entries()) {
        let current = null;
        for (const row of rows.sort((left, right) => left.gameTimeSeconds - right.gameTimeSeconds)) {
            if (isLaneState(row.state) && row.physicalLaneId) {
                if (!current || current.physicalLaneId !== row.physicalLaneId || row.gameTimeSeconds > current.endSecond + TIME_STEP_SECONDS) {
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
    const durationSeconds = current.endSecond - current.startSecond + TIME_STEP_SECONDS;
    const continuity = pointEpisodeContinuity(current.rows);
    const passesContinuity = !candidate.changes?.includes('spatial_continuity_episodes')
        || continuity.outsideRatio <= 0.2 && continuity.minMargin >= 45 && continuity.maxSpeed <= 900;
    if (durationSeconds >= (candidate.parameters?.minStableSeconds ?? BASELINE_PARAMETERS.minStableSeconds) && passesContinuity) {
        episodes.push({
            episodeId: `${candidate.id}_${current.playerId}_${current.physicalLaneId}_${current.startSecond}`,
            playerId: current.playerId,
            physicalLaneId: current.physicalLaneId,
            startSecond: current.startSecond,
            endSecond: current.endSecond,
            durationSeconds,
            supportDuration: current.rows.length * TIME_STEP_SECONDS,
            contradictoryDuration: current.rows.filter(row => row.contradictionFlags.length > 0).length * TIME_STEP_SECONDS,
            uncertainDuration: current.rows.filter(row => row.state === 'lane_ambiguous').length * TIME_STEP_SECONDS,
            supportRatio: 1,
            contradictionRatio: ratio(current.rows.filter(row => row.contradictionFlags.length > 0).length, current.rows.length),
            uncertainRatio: ratio(current.rows.filter(row => row.state === 'lane_ambiguous').length, current.rows.length),
            interruptionCount: 0,
            maximumInterruption: 0,
            reasonForTermination: reason,
            continuity
        });
    }
}

function runSequentialCandidate(candidate, observations) {
    if (candidate.id === 'hysteresis_state_machine') return runHysteresis(observations, candidate.parameters);
    if (candidate.id === 'windowed_evidence_accumulation') return runWindowed(observations, candidate.parameters);
    if (candidate.id === 'constrained_dynamic_programming') return runDynamicProgramming(observations, candidate.parameters);
    return [];
}

function runHysteresis(observations, params) {
    const episodes = [];
    for (const [ playerId, rows ] of groupBy(observations, observation => observation.playerId).entries()) {
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
                if (hardNonLaneState(observation) || strongCompetingLane(observation, state)) {
                    finishCurrent('strong_exit_evidence');
                } else if (dominant.lane !== state || dominant.support < 2) {
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
    return episodes;
}

function runWindowed(observations, params) {
    const episodes = [];
    for (const [ playerId, rows ] of groupBy(observations, observation => observation.playerId).entries()) {
        const windows = segmentWindows(rows, params.windowSeconds).map(window => inferWindowState(window, params));
        episodes.push(...episodesFromWindowStates(playerId, windows, params));
    }
    return episodes;
}

function runDynamicProgramming(observations, params) {
    const episodes = [];
    for (const [ playerId, rows ] of groupBy(observations, observation => observation.playerId).entries()) {
        const states = inferDpStates(rows.sort((left, right) => left.gameSecond - right.gameSecond), params);
        episodes.push(...episodesFromStateSequence(playerId, states, params));
    }
    return episodes;
}

function pointBehavior(classified, rows, candidate) {
    const validRows = classified.filter(row => row.positionQuality !== 'missing');
    const laneRows = classified.filter(row => isLaneState(row.state));
    const abstainedRows = classified.filter(row => !isLaneState(row.state));
    const contradictionRows = classified.filter(row => row.contradictionFlags.length > 0);
    return {
        totalRows: rows.length,
        totalValidRows: validRows.length,
        laneClassifiedRows: laneRows.length,
        abstainedRows: abstainedRows.length,
        coveragePercent: percent(laneRows.length, validRows.length),
        abstentionPercent: percent(abstainedRows.length, classified.length),
        stateDistribution: countBy(classified, row => row.state),
        contradictionEvidenceRows: contradictionRows.length,
        contradictionFlags: countBy(contradictionRows.flatMap(row => row.contradictionFlags), flag => flag),
        instabilityRows: classified.filter(row => row.perturbationChanged).length,
        instabilityPercent: percent(classified.filter(row => row.perturbationChanged).length, validRows.length),
        baseDeploymentConflicts: contradictionRows.filter(row => row.contradictionFlags.includes('base_or_deployment_conflict')).length,
        nearestLaneConflicts: contradictionRows.filter(row => row.contradictionFlags.includes('nearest_lane_conflict')).length,
        highSpeedClassifications: contradictionRows.filter(row => row.contradictionFlags.includes('high_speed_classified_as_lane')).length,
        ambiguousSeparationClassifications: contradictionRows.filter(row => row.contradictionFlags.includes('ambiguous_separation_classified_as_lane')).length,
        sensitivityPerturbations: PERTURBATIONS.map(perturbation => ({
            name: perturbation.name,
            changedRows: classified.filter(row => row.perturbationStates?.find(item => item.name === perturbation.name)?.state !== row.state).length
        })),
        preservesFrozenParameters: candidate.parameters
    };
}

function episodeBehavior(episodes, rows) {
    const byPlayer = countBy(episodes, episode => String(episode.playerId));
    const durations = episodes.map(episode => episode.durationSeconds);
    return {
        episodeCount: episodes.length,
        totalEpisodeDuration: sum(durations),
        coverageDurationPercentOfPlayerTimeline: percent(sum(durations), rows.length * TIME_STEP_SECONDS),
        medianDuration: median(durations),
        durationDistribution: distribution(durations),
        fragmentationEpisodesPerPlayerHour: fragmentation(episodes, rows),
        episodesPerPlayer: byPlayer,
        episodesPerLane: countBy(episodes, episode => episode.physicalLaneId),
        shortEpisodes: episodes.filter(episode => episode.durationSeconds < 15).length,
        uncertainGapDuration: sum(episodes.map(episode => episode.uncertainDuration ?? 0)),
        terminationReasons: countBy(episodes, episode => episode.reasonForTermination ?? 'unknown'),
        contradictionEvidenceDuration: sum(episodes.map(episode => episode.contradictoryDuration ?? 0)),
        baseDeploymentContinuation: episodes.filter(episode => episode.reasonForTermination === 'base_or_deployment_window').length,
        competingLaneContinuation: episodes.filter(episode => episode.reasonForTermination === 'strong_exit_evidence').length
    };
}

function distributionBehavior(classified, episodes) {
    const byPhase = countBy(classified, row => phase(row.gameTimeSeconds));
    const laneRows = classified.filter(row => isLaneState(row.state));
    return {
        classifiedRowsByPlayer: countBy(classified, row => String(row.playerId)),
        laneRowsByLane: countBy(laneRows, row => row.physicalLaneId),
        rowsByTeam: countBy(classified, row => String(row.team)),
        rowsByPhase: byPhase,
        laneRowsByPhase: countBy(laneRows, row => phase(row.gameTimeSeconds)),
        laneRowsByDistanceBand: countBy(laneRows, row => distanceBand(row.nearestDistance)),
        laneRowsBySeparationBand: countBy(laneRows, row => marginBand(row.separationMargin)),
        laneRowsBySpeedBand: countBy(laneRows, row => speedBand(row.speed)),
        laneRowsByStructuralContext: countBy(laneRows, row => structuralContext(row.structuralRegions)),
        episodesByPhase: countBy(episodes, episode => phase(episode.startSecond))
    };
}

function buildResolutionEffect(datasetResults) {
    const fine = datasetResults.find(result => result.datasetId === 'replay_001_fine_original');
    const control = datasetResults.find(result => result.datasetId === 'replay_001_five_second_control');
    const candidates = CANDIDATES.map(candidate => {
        const fineCandidate = fine?.candidates.find(item => item.candidateId === candidate.id);
        const controlCandidate = control?.candidates.find(item => item.candidateId === candidate.id);
        if (!fineCandidate || !controlCandidate || fine.rowCount === 0) {
            return {
                candidateId: candidate.id,
                classification: 'not_comparable',
                reason: 'Fine-resolution full-spatial rows are unavailable for exact replay 001 candidate application.',
                fineApplicationAvailability: 'partial_or_unavailable'
            };
        }
        const coverageDelta = round(controlCandidate.pointMetrics.coveragePercent - fineCandidate.pointMetrics.coveragePercent);
        const contradictionDelta = controlCandidate.pointMetrics.contradictionEvidenceRows - fineCandidate.pointMetrics.contradictionEvidenceRows;
        const instabilityDelta = round(controlCandidate.pointMetrics.instabilityPercent - fineCandidate.pointMetrics.instabilityPercent);
        const episodeCountDelta = controlCandidate.episodeMetrics.episodeCount - fineCandidate.episodeMetrics.episodeCount;
        const fragmentationDelta = round(controlCandidate.episodeMetrics.fragmentationEpisodesPerPlayerHour - fineCandidate.episodeMetrics.fragmentationEpisodesPerPlayerHour);
        return {
            candidateId: candidate.id,
            coverageDelta,
            contradictionDelta,
            instabilityDelta,
            episodeCountDelta,
            episodeDurationDelta: round(controlCandidate.episodeMetrics.totalEpisodeDuration - fineCandidate.episodeMetrics.totalEpisodeDuration),
            fragmentationDelta,
            briefContactLoss: 'contacts shorter than five seconds are not observable in control or generalization timelines',
            gapMerging: 'five-second rows can merge or erase sub-grid gaps',
            terminationReasonChanges: diffCounts(fineCandidate.episodeMetrics.terminationReasons, controlCandidate.episodeMetrics.terminationReasons),
            classification: Math.abs(coverageDelta) <= 5 && Math.abs(instabilityDelta) <= 5
                ? 'resolution_robust'
                : Math.abs(coverageDelta) <= 15 && Math.abs(instabilityDelta) <= 15
                    ? 'moderately_resolution_sensitive'
                    : 'strongly_resolution_sensitive'
        };
    });
    return {
        schemaVersion: 1,
        kind: 'frozen_occupancy_resolution_effect',
        control: 'replay_001_five_second_control compared to replay_001_fine_original where exact fine rows are available',
        warning: 'Fine original application uses existing artifact adapters, not a complete fine full-spatial timeline.',
        candidates,
        replay005Protection: { processed: false, status: 'preserved' }
    };
}

function buildGeneralizationComparison(datasetResults, provenance, resolutionEffect) {
    const generalization = datasetResults.filter(result => GENERALIZATION_REPLAYS.includes(result.replayId));
    const byCandidate = CANDIDATES.map(candidate => {
        const perReplay = generalization.map(result => result.candidates.find(item => item.candidateId === candidate.id));
        const coverage = perReplay.map(item => item.pointMetrics.coveragePercent);
        const contradictions = perReplay.map(item => item.pointMetrics.contradictionEvidenceRows);
        const instability = perReplay.map(item => item.pointMetrics.instabilityPercent);
        const episodes = perReplay.map(item => item.episodeMetrics.episodeCount);
        const fragmentationValues = perReplay.map(item => item.episodeMetrics.fragmentationEpisodesPerPlayerHour);
        return {
            candidateId: candidate.id,
            replayMetrics: Object.fromEntries(generalization.map((result, index) => [
                result.replayId,
                {
                    coveragePercent: coverage[index],
                    contradictionEvidenceRows: contradictions[index],
                    instabilityPercent: instability[index],
                    episodeCount: episodes[index],
                    totalEpisodeDuration: perReplay[index].episodeMetrics.totalEpisodeDuration,
                    fragmentationEpisodesPerPlayerHour: fragmentationValues[index],
                    strongestContradictionFlags: topCounts(perReplay[index].pointMetrics.contradictionFlags, 3)
                }
            ])),
            metricRanges: {
                coveragePercent: range(coverage),
                contradictionEvidenceRows: range(contradictions),
                instabilityPercent: range(instability),
                episodeCount: range(episodes),
                fragmentationEpisodesPerPlayerHour: range(fragmentationValues)
            },
            coefficientOfVariation: {
                coverage: coefficientOfVariation(coverage),
                contradictions: coefficientOfVariation(contradictions),
                instability: coefficientOfVariation(instability)
            },
            worstReplay: generalization[contradictions.indexOf(Math.max(...contradictions))]?.replayId ?? null,
            commonContradictionCategories: commonContradictions(perReplay),
            classification: classifyCrossReplay(candidate, coverage, contradictions, instability, episodes, resolutionEffect)
        };
    });
    const bestLimited = byCandidate
        .filter(item => [ 'consistent_limited_behavior', 'consistent_failure' ].includes(item.classification))
        .sort((left, right) => {
            const leftCoverage = average(Object.values(left.replayMetrics).map(item => item.coveragePercent));
            const rightCoverage = average(Object.values(right.replayMetrics).map(item => item.coveragePercent));
            return rightCoverage - leftCoverage;
        })[0] ?? null;
    return {
        schemaVersion: 1,
        kind: 'frozen_occupancy_generalization_comparison',
        provenanceFile: 'output/replays/frozen-candidate-provenance.json',
        candidatesEvaluated: CANDIDATES.map(candidate => candidate.id),
        candidatesExcluded: EXCLUDED_CANDIDATES,
        neutralLaneMapping: provenance.neutralLaneMapping,
        replay001ResolutionControl: resolutionEffect,
        byCandidate,
        strongestConsistentSuccess: bestLimited ? {
            candidateId: bestLimited.candidateId,
            description: 'Reproducible point-level lane-core/proximity evidence can be computed across replays without recalibration, but semantic correctness is not established.',
            allowedLimitedUse: 'high-confidence point proximity evidence and base/deployment exclusion only'
        } : null,
        strongestConsistentFailure: strongestFailure(byCandidate),
        replay001Representativeness: 'replay 001 is useful for schema and resolution control, but exact fine-versus-five-second comparison remains partially artifact-adapted.',
        allowedLimitedUses: [
            'high-confidence point proximity evidence under strong lane-axis separation',
            'base/deployment exclusion evidence',
            'per-replay frozen-candidate behavior comparison'
        ],
        prohibitedUses: [
            'semantic lane occupancy correctness',
            'transition detection',
            'strategic lane assignment',
            'model recalibration',
            'replay 005 quality-based candidate selection'
        ],
        remainingSemanticUncertainty: 'No candidate output is human-ground-truth validation.',
        replay005Readiness: {
            status: 'not_ready_resolution_confounded',
            reason: 'A complete fine-resolution control is unavailable and episode behavior remains sensitive to five-second sampling; no final holdout hypothesis is frozen.',
            exactHypothesisForReplay005: null
        },
        replay005Protection: { processed: false, status: 'preserved' }
    };
}

function buildGeneralizationGate(comparison, resolutionEffect) {
    const blockedByParams = comparison.candidatesEvaluated.length === 0;
    const mostlyNotComparable = resolutionEffect.candidates.filter(item => item.classification === 'not_comparable').length >= CANDIDATES.length;
    const consistentCandidate = comparison.byCandidate.find(item => item.classification === 'consistent_limited_behavior');
    let gateResult = 'frozen_occupancy_generalization_inconsistent';
    if (blockedByParams) {
        gateResult = 'frozen_occupancy_generalization_blocked';
    } else if (mostlyNotComparable && !consistentCandidate) {
        gateResult = 'frozen_occupancy_generalization_limited_by_timeline_resolution';
    } else if (consistentCandidate) {
        gateResult = 'frozen_occupancy_generalization_ready_for_review';
    }
    return {
        schemaVersion: 1,
        kind: 'frozen_occupancy_generalization_gate',
        gateResult,
        selectedLimitedUseCandidate: consistentCandidate?.candidateId ?? null,
        decisionPacket: {
            candidatesEvaluated: comparison.candidatesEvaluated,
            candidatesExcluded: comparison.candidatesExcluded,
            replay001ResolutionControlResult: resolutionEffect.candidates.map(item => ({ candidateId: item.candidateId, classification: item.classification })),
            strongestConsistentSuccess: comparison.strongestConsistentSuccess,
            strongestConsistentFailure: comparison.strongestConsistentFailure,
            allowedLimitedUses: comparison.allowedLimitedUses,
            prohibitedUses: comparison.prohibitedUses,
            remainingSemanticUncertainty: comparison.remainingSemanticUncertainty,
            replay005Readiness: comparison.replay005Readiness
        },
        replay005Readiness: comparison.replay005Readiness,
        humanReviewRequired: false,
        transitionDetectionPromoted: false,
        stopReason: 'NO_EXECUTABLE_PENDING_TASK',
        replay005Protection: { processed: false, status: 'preserved' }
    };
}

async function writeReport(provenance, datasetResults, resolutionEffect, comparison, gate) {
    const generalization = datasetResults.filter(result => GENERALIZATION_REPLAYS.includes(result.replayId));
    const perReplayResults = generalization.map(result => {
        const lines = result.candidates.map(candidate => `  - ${candidate.candidateId}: coverage ${candidate.pointMetrics.coveragePercent}%, contradictions ${candidate.pointMetrics.contradictionEvidenceRows}, instability ${candidate.pointMetrics.instabilityPercent}%, episodes ${candidate.episodeMetrics.episodeCount}.`).join('\n');
        return `- ${result.replayId}: ${result.rowCount} rows\n${lines}`;
    }).join('\n');
    const report = `# Frozen Occupancy Generalization

## Five-second resolution control

Replay 001 was processed into \`output/replays/replay_001/five-second-control/\` using the same five-second grid, row schema, and lane-axis projection logic as task 025. Exact fine-resolution full-spatial rows do not exist, so replay 001 fine comparison uses existing experiment 24 artifact adapters and is marked as partially comparable.

## Frozen provenance

Evaluated candidates:

${CANDIDATES.map(candidate => `- ${candidate.id}: ${candidate.reproducibilityStatus}, source ${candidate.sourceScript}, parameters ${JSON.stringify(candidate.parameters)}.`).join('\n')}

Excluded candidates:

${EXCLUDED_CANDIDATES.map(candidate => `- ${candidate.id}: ${candidate.classification}; ${candidate.reason}`).join('\n')}

Neutral lane mapping was derived from structural topology only: ${JSON.stringify(provenance.neutralLaneMapping.historicalToNeutral)}.

## Per-replay results

${perReplayResults}

## Cross-replay consistency

${comparison.byCandidate.map(candidate => `- ${candidate.candidateId}: ${candidate.classification}; coverage range ${candidate.metricRanges.coveragePercent.join('..')}%, contradiction range ${candidate.metricRanges.contradictionEvidenceRows.join('..')}.`).join('\n')}

## Resolution effects

${resolutionEffect.candidates.map(candidate => `- ${candidate.candidateId}: ${candidate.classification}; ${candidate.reason ?? `coverage delta ${candidate.coverageDelta}, instability delta ${candidate.instabilityDelta}`}`).join('\n')}

## Allowed conclusions

- Frozen point-level lane-proximity evidence can be computed across replays 002-004 without per-replay threshold changes.
- Base/deployment exclusion evidence may be used as a descriptive non-semantic filter.

## Prohibited conclusions

- Semantic lane occupancy correctness.
- Transition readiness or rotation detection.
- Strategic lane assignment or optimality.
- Any conclusion based on replay 005.

## Gate result

\`${gate.gateResult}\`

Replay 005 readiness: \`${gate.replay005Readiness.status}\`.
`;
    await fs.writeFile('reports/frozen-occupancy-generalization.md', report);
    await fs.writeFile('reports/latest.md', 'reports/frozen-occupancy-generalization.md\n');
}

function buildProvenance(laneMapping) {
    return {
        schemaVersion: 1,
        kind: 'frozen_candidate_provenance',
        candidates: CANDIDATES.map(candidate => ({
            candidateId: candidate.id,
            originatingExperimentOrTask: candidate.originatingExperimentOrTask,
            sourceScript: candidate.sourceScript,
            sourceOutput: candidate.sourceOutput,
            exactParameters: candidate.parameters,
            expectedTemporalResolution: candidate.expectedTemporalResolution,
            expectedInputSchema: 'player-time rows with coordinates, nearest/second-nearest lane distances, separation margin, speed, and structural-region flags',
            episodeBuildingAssumptions: candidate.episodeBuildingAssumptions,
            speedAssumptions: 'speed uses actual elapsed seconds; high-speed threshold remains 900 coordinate units per second',
            interruptionAssumptions: 'sample-count parameters remain frozen and are flagged as resolution-sensitive',
            reproducibilityStatus: candidate.reproducibilityStatus,
            compatibilityWithFiveSecondData: candidate.id === 'windowed_evidence_accumulation' ? 'native_5s_window' : 'schema_adapter_resolution_sensitive',
            adaptationRequiredSolelyForInputSchema: 'historical lane IDs mapped to neutral lane axes; field names mapped from full-spatial timeline schema',
            noThresholdChanges: true
        })),
        excludedCandidates: EXCLUDED_CANDIDATES,
        neutralLaneMapping: laneMapping,
        parameterInterpretation: Object.fromEntries(CANDIDATES.map(candidate => [ candidate.id, parameterInterpretation(candidate) ])),
        replay005Protection: { processed: false, status: 'preserved' }
    };
}

function buildNeutralLaneMapping(profile) {
    const bySource = Object.fromEntries(profile.laneAxes.map(axis => [ axis.sourceRoleLane, axis.neutralLaneId ]));
    return {
        source: 'output/replay-lane-axis-topology-profile.json sourceRoleLane fields',
        method: 'structural topology and coordinate correspondence only; occupancy output and model performance not used',
        historicalToNeutral: {
            lane_1: bySource[1] ?? null,
            lane_2: bySource[4] ?? null,
            lane_3: bySource[6] ?? null
        },
        aliases: profile.laneAxes.flatMap(axis => (axis.historicalAliases ?? []).map(alias => ({
            neutralLaneId: axis.neutralLaneId,
            alias: alias.alias,
            source: alias.source,
            status: alias.status
        })))
    };
}

function parameterInterpretation(candidate) {
    return Object.fromEntries(Object.entries(candidate.parameters ?? {}).map(([ key, value ]) => {
        let type = 'categorical_rule';
        if (/Distance|Radius|Margin/u.test(key)) type = 'distance_parameter';
        else if (/Seconds|Duration/u.test(key)) type = 'physical_time_parameter';
        else if (/Tolerance|Gap/u.test(key)) type = 'sample_count_parameter';
        else if (/Ratio/u.test(key)) type = 'ratio_parameter';
        else if (/Speed/u.test(key)) type = 'speed_parameter';
        else if (/Penalty/u.test(key)) type = 'categorical_rule';
        return [ key, { value, type, resolutionNote: type === 'sample_count_parameter' ? 'frozen sample count; resolution-sensitive at 5s' : null } ];
    }));
}

async function discoverPlayers(player, firstTick, lastTick, tickRate) {
    const candidates = new Map();
    const seekSeconds = [ 0, 30, 60, 120, 300, 600, 900, 1200, 1500, 1800, 2100 ]
        .filter(second => firstTick + second * tickRate <= lastTick);
    for (const second of seekSeconds) {
        await player.seekToTick(Math.min(lastTick, Math.round(firstTick + second * tickRate)));
        const demo = player.getDemo();
        for (const controller of demo.getEntitiesByClassName(CONTROLLER_CLASS)) {
            const steamId = normalize(controller.getField('m_steamID'));
            if (steamId === null || steamId === '0' || steamId === 0) continue;
            const playerId = String(steamId);
            const existing = candidates.get(playerId) ?? { playerId, name: null, heroId: null, team: null, controllerHandle: null, observations: 0 };
            existing.name ??= normalize(controller.getField('m_iszPlayerName'));
            existing.heroId ??= normalize(controller.getField('m_nHeroID'));
            existing.team ??= normalize(controller.getField('m_iTeamNum'));
            existing.controllerHandle ??= normalize(controller.handle);
            existing.observations += 1;
            candidates.set(playerId, existing);
        }
    }
    return Array.from(candidates.values())
        .sort((left, right) => String(left.team).localeCompare(String(right.team)) || String(left.name).localeCompare(String(right.name)) || left.playerId.localeCompare(right.playerId))
        .slice(0, 12);
}

function snapshotPlayers(player, players, second, tick) {
    const demo = player.getDemo();
    const pawns = demo.getEntitiesByClassName(PAWN_CLASS);
    const pawnByHandle = new Map(pawns.map(pawn => [ String(normalize(pawn.handle)), pawn ]));
    const pawnByController = new Map();
    for (const pawn of pawns) {
        const controllerHandle = normalize(pawn.getField('m_hController'));
        if (controllerHandle !== null) pawnByController.set(String(controllerHandle), pawn);
    }
    const controllers = demo.getEntitiesByClassName(CONTROLLER_CLASS)
        .map(controller => ({ controller, steamId: normalize(controller.getField('m_steamID')) }))
        .filter(item => item.steamId !== null && item.steamId !== '0' && item.steamId !== 0);
    const controllerBySteam = new Map(controllers.map(item => [ String(item.steamId), item.controller ]));
    return Object.fromEntries(players.map(playerInfo => {
        const controller = controllerBySteam.get(playerInfo.playerId);
        const controllerHandle = normalize(controller?.handle);
        const heroPawnHandle = normalize(controller?.getField('m_hHeroPawn'));
        const pawnHandle = normalize(controller?.getField('m_hPawn'));
        const pawn = pawnByHandle.get(String(heroPawnHandle)) ?? pawnByHandle.get(String(pawnHandle)) ?? pawnByController.get(String(controllerHandle)) ?? null;
        const position = pawn === null ? null : {
            x: normalize(pawn.getField('CBodyComponent.m_vecX')),
            y: normalize(pawn.getField('CBodyComponent.m_vecY')),
            z: normalize(pawn.getField('CBodyComponent.m_vecZ'))
        };
        return [ playerInfo.playerId, {
            playerId: playerInfo.playerId,
            heroId: normalize(controller?.getField('m_nHeroID')) ?? playerInfo.heroId,
            team: normalize(controller?.getField('m_iTeamNum')) ?? playerInfo.team,
            tick,
            gameTimeSeconds: second,
            controllerHandle,
            pawnHandle: normalize(pawn?.handle) ?? pawnHandle ?? heroPawnHandle,
            position: hasFinitePosition(position) ? position : null
        } ];
    }));
}

function buildRows(replayId, players, snapshot, playerState, geometry) {
    return players.map(playerInfo => {
        const observed = snapshot[playerInfo.playerId];
        const state = playerState.get(playerInfo.playerId);
        const previousDirect = state.lastDirect;
        let positionQuality = 'missing';
        let position = null;
        let sourceTick = null;
        let ageSeconds = null;
        const validationFlags = [];
        if (observed.position !== null) {
            positionQuality = 'direct';
            position = observed.position;
            sourceTick = observed.tick;
            ageSeconds = 0;
            state.lastDirect = { position, tick: observed.tick, gameTimeSeconds: observed.gameTimeSeconds, pawnHandle: observed.pawnHandle };
            state.lastPawnHandle = observed.pawnHandle ?? state.lastPawnHandle;
        } else if (previousDirect !== null) {
            positionQuality = 'carried_forward';
            position = previousDirect.position;
            sourceTick = previousDirect.tick;
            ageSeconds = observed.gameTimeSeconds - previousDirect.gameTimeSeconds;
            if (ageSeconds > LONG_CARRY_SECONDS) validationFlags.push('long_carried_forward_position');
            if (ageSeconds > STALE_SECONDS) validationFlags.push('stale_coordinates');
        }
        const laneProjection = position === null ? emptyProjection() : projectLane(position, geometry.laneAxes);
        const structuralRegions = position === null ? emptyRegions() : structuralRegionsFor(position, observed.team, geometry);
        const movement = movementFor(position, observed.gameTimeSeconds, state.previousRow, positionQuality, validationFlags);
        const row = {
            replayId,
            playerId: playerInfo.playerId,
            heroId: observed.heroId ?? playerInfo.heroId,
            team: observed.team ?? playerInfo.team,
            tick: observed.tick,
            gameTimeSeconds: observed.gameTimeSeconds,
            position: { x: position?.x ?? null, y: position?.y ?? null, z: position?.z ?? null, sourceTick, ageSeconds, quality: positionQuality },
            laneProjection,
            structuralRegions,
            movement,
            validationFlags
        };
        state.previousRow = row;
        return row;
    });
}

function buildGeometry(profile) {
    const laneAxes = profile.laneAxes.map(axis => ({ neutralLaneId: axis.neutralLaneId, polyline: axis.polyline }));
    const allStructures = profile.laneAxes.flatMap(axis => axis.orderedStructures.map(item => ({ ...item, lane: axis.neutralLaneId })));
    const baseAnchors = allStructures.filter(item => /Boss_Tier3|base/iu.test(item.className));
    const centralAnchors = allStructures.filter(item => /MidBoss/iu.test(item.className));
    const neutralAnchors = allStructures.filter(item => /Neutral|Camp|SinnersSacrifice/iu.test(item.className));
    const laneBounds = bounds(profile.laneAxes.flatMap(axis => axis.polyline));
    return {
        laneAxes,
        baseAnchors: baseAnchors.length > 0 ? baseAnchors : syntheticBaseAnchors(profile),
        centralAnchors,
        neutralAnchors,
        bounds: expandBounds(laneBounds, 2500)
    };
}

function projectLane(point, laneAxes) {
    const distances = laneAxes.map(axis => {
        const projection = projectToPolyline(point, axis.polyline);
        return {
            lane: axis.neutralLaneId,
            distance: round(projection.distance),
            normalizedProgress: round(projection.normalizedProgress),
            projectedX: round(projection.point?.x),
            projectedY: round(projection.point?.y),
            segmentIndex: projection.segmentIndex,
            projectionQuality: projection.segmentIndex === null ? 'unprojected' : 'projected_to_polyline'
        };
    }).sort((left, right) => left.distance - right.distance);
    const nearest = distances[0] ?? null;
    const second = distances[1] ?? null;
    return {
        nearestLane: nearest?.lane ?? null,
        nearestDistance: nearest?.distance ?? null,
        secondNearestLane: second?.lane ?? null,
        secondNearestDistance: second?.distance ?? null,
        separationMargin: nearest !== null && second !== null ? round(second.distance - nearest.distance) : null,
        normalizedProgress: nearest?.normalizedProgress ?? null,
        projectedX: nearest?.projectedX ?? null,
        projectedY: nearest?.projectedY ?? null,
        segmentIndex: nearest?.segmentIndex ?? null,
        projectionQuality: nearest?.projectionQuality ?? null,
        allLaneDistances: distances
    };
}

function structuralRegionsFor(point, team, geometry) {
    const ownBase = geometry.baseAnchors.find(anchor => anchor.team === team) ?? null;
    const enemyBase = geometry.baseAnchors.find(anchor => anchor.team !== team) ?? null;
    const nearTeamBase = ownBase !== null && distance2d(point, ownBase.coordinates) <= BASE_RADIUS;
    const nearEnemyBase = enemyBase !== null && distance2d(point, enemyBase.coordinates) <= BASE_RADIUS;
    return {
        nearTeamBase,
        nearEnemyBase,
        nearDeployment: nearTeamBase,
        nearCentralObjective: geometry.centralAnchors.some(anchor => distance2d(point, anchor.coordinates) <= CENTRAL_RADIUS),
        nearNeutralStructure: geometry.neutralAnchors.some(anchor => distance2d(point, anchor.coordinates) <= NEUTRAL_RADIUS),
        outsideKnownStructuralEnvelope: !insideBounds(point, geometry.bounds)
    };
}

function movementFor(position, second, previousRow, positionQuality, validationFlags) {
    if (position === null || previousRow?.position?.x === null) return {
        distanceFromPrevious: null,
        horizontalDistanceFromPrevious: null,
        speed: null,
        directionX: null,
        directionY: null,
        acceleration: null,
        gapSeconds: null,
        continuityStatus: positionQuality === 'missing' ? 'missing' : 'insufficient_previous'
    };
    const previous = previousRow.position;
    const gapSeconds = second - previousRow.gameTimeSeconds;
    const horizontal = distance2d(position, previous);
    const speed = gapSeconds > 0 ? horizontal / gapSeconds : null;
    const previousSpeed = previousRow.movement?.speed;
    if (Number.isFinite(speed) && speed > IMPOSSIBLE_SPEED) validationFlags.push('teleport_like_displacement');
    if (positionQuality === 'carried_forward') validationFlags.push('carried_forward_position');
    return {
        distanceFromPrevious: round(distance3d(position, previous)),
        horizontalDistanceFromPrevious: round(horizontal),
        speed: round(speed),
        directionX: horizontal > 0 ? round((position.x - previous.x) / horizontal) : null,
        directionY: horizontal > 0 ? round((position.y - previous.y) / horizontal) : null,
        acceleration: Number.isFinite(speed) && Number.isFinite(previousSpeed) && gapSeconds > 0 ? round((speed - previousSpeed) / gapSeconds) : null,
        gapSeconds,
        continuityStatus: positionQuality === 'direct' ? 'direct_sample' : positionQuality
    };
}

function syntheticBaseAnchors(profile) {
    const points = profile.laneAxes.flatMap(axis => [ axis.endpointAnchors.start.coordinates, axis.endpointAnchors.end.coordinates ]);
    const sorted = [ ...points ].sort((left, right) => left.y - right.y);
    return [ { team: 2, coordinates: sorted[0] }, { team: 3, coordinates: sorted.at(-1) } ];
}

function projectToPolyline(point, polyline) {
    if (polyline.length < 2) return { distance: null, normalizedProgress: null, point: null, segmentIndex: null };
    const segmentLengths = [];
    let totalLength = 0;
    for (let index = 1; index < polyline.length; index++) {
        const length = distance3d(polyline[index - 1], polyline[index]);
        segmentLengths.push(length);
        totalLength += length;
    }
    let best = null;
    let distanceBefore = 0;
    for (let index = 1; index < polyline.length; index++) {
        const projected = projectToSegment(point, polyline[index - 1], polyline[index]);
        const candidate = {
            distance: distance3d(point, projected.point),
            normalizedProgress: totalLength === 0 ? 0 : (distanceBefore + projected.t * segmentLengths[index - 1]) / totalLength,
            point: projected.point,
            segmentIndex: index - 1
        };
        if (best === null || candidate.distance < best.distance) best = candidate;
        distanceBefore += segmentLengths[index - 1];
    }
    return best;
}

function projectToSegment(point, start, end) {
    const vx = end.x - start.x;
    const vy = end.y - start.y;
    const vz = (end.z ?? 0) - (start.z ?? 0);
    const wx = point.x - start.x;
    const wy = point.y - start.y;
    const wz = (point.z ?? 0) - (start.z ?? 0);
    const lengthSquared = vx * vx + vy * vy + vz * vz;
    const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, (wx * vx + wy * vy + wz * wz) / lengthSquared));
    return { t, point: { x: start.x + t * vx, y: start.y + t * vy, z: (start.z ?? 0) + t * vz } };
}

function pointEpisodeContinuity(rows) {
    const outside = rows.filter(row => !isLaneState(row.state));
    const margins = rows.map(row => row.separationMargin).filter(Number.isFinite);
    const speeds = rows.map(row => row.speed).filter(Number.isFinite);
    return {
        outsideRatio: ratio(outside.length, rows.length),
        minMargin: margins.length > 0 ? Math.min(...margins) : null,
        maxSpeed: speeds.length > 0 ? Math.max(...speeds) : null
    };
}

function hardNonLaneState(observation) {
    if ([ 'base', 'deployment' ].includes(observation.baseDeploymentEvidence)) return observation.baseDeploymentEvidence;
    if (observation.movementSpeed > 1100) return 'neutral_or_transit';
    return null;
}

function dominantLane(observation) {
    const ranked = LANES.map(lane => ({ lane, ...observation.laneEvidence[lane] }))
        .sort((left, right) => (right.support - right.contradiction) - (left.support - left.contradiction));
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

function startEpisode(playerId, state, startSecond, observation) {
    return { playerId, inferredState: state, physicalLaneId: state, startSecond, endSecond: observation.gameSecond, observations: [ observation ] };
}

function appendEpisodeObservation(episode, observation) {
    episode.endSecond = observation.gameSecond;
    episode.observations.push(observation);
}

function finalizeEpisode(episode, params) {
    const evidence = evidenceFromObservations(episode.observations, episode.physicalLaneId);
    return {
        episodeId: `${params.id}_${episode.playerId}_${episode.physicalLaneId}_${episode.startSecond}`,
        playerId: episode.playerId,
        inferredState: episode.inferredState,
        physicalLaneId: episode.physicalLaneId,
        startSecond: episode.startSecond,
        endSecond: episode.endSecond,
        durationSeconds: episode.endSecond - episode.startSecond + TIME_STEP_SECONDS,
        ...evidence,
        reasonForTermination: episode.reasonForTermination ?? 'end_of_interval',
        usableForFutureTransitionCandidateGeneration: evidence.supportRatio >= params.minSupportRatio && evidence.contradictionRatio <= params.maxContradictionRatio
    };
}

function evidenceFromObservations(observations, lane) {
    const support = observations.filter(observation => observation.laneEvidence[lane]?.support > observation.laneEvidence[lane]?.contradiction).length;
    const contradictory = observations.filter(observation => observation.laneEvidence[lane]?.contradiction > observation.laneEvidence[lane]?.support || [ 'base', 'deployment' ].includes(observation.baseDeploymentEvidence)).length;
    const uncertain = observations.length - support - contradictory;
    return {
        supportDuration: support * TIME_STEP_SECONDS,
        contradictoryDuration: contradictory * TIME_STEP_SECONDS,
        uncertainDuration: uncertain * TIME_STEP_SECONDS,
        supportRatio: ratio(support, observations.length),
        contradictionRatio: ratio(contradictory, observations.length),
        uncertainRatio: ratio(uncertain, observations.length),
        interruptionCount: countInterruptions(observations, lane),
        maximumInterruption: maxInterruption(observations, lane) * TIME_STEP_SECONDS,
        entryEvidence: observations[0]?.baseDeploymentEvidence ?? 'none',
        exitEvidence: observations.at(-1)?.baseDeploymentEvidence ?? 'none'
    };
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
        episodeId: `${params.id}_${current.playerId}_${current.physicalLaneId}_${current.startSecond}`,
        playerId: current.playerId,
        inferredState: current.inferredState,
        physicalLaneId: current.physicalLaneId,
        startSecond: current.startSecond,
        endSecond: current.endSecond,
        durationSeconds: current.endSecond - current.startSecond + TIME_STEP_SECONDS,
        ...evidence,
        reasonForTermination: reason,
        usableForFutureTransitionCandidateGeneration: evidence.supportRatio >= params.minSupportRatio && evidence.contradictionRatio <= params.maxContradictionRatio
    };
    if (episode.durationSeconds >= params.minDuration && episode.usableForFutureTransitionCandidateGeneration) episodes.push(episode);
}

function inferDpStates(rows, params) {
    const states = [ 'unknown', 'neutral_or_transit', 'base', 'deployment', ...LANES ];
    const dp = [];
    for (let index = 0; index < rows.length; index++) {
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

async function validateOutputs(files) {
    for (const file of files) {
        const size = (await fs.stat(file)).size;
        if (size > OUTPUT_SIZE_LIMIT && !file.endsWith('.jsonl')) throw new Error(`${file} exceeds 10 MiB`);
        const content = await fs.readFile(file, 'utf8');
        if (file.endsWith('.jsonl')) {
            for (const line of content.trim().split(/\r?\n/u)) if (line.trim()) JSON.parse(line);
        } else if (file.endsWith('.json') || file.endsWith('.md')) {
            if (file.endsWith('.json')) JSON.parse(content);
        }
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

function mapHistoricalLane(lane) {
    return { lane_1: 'lane_axis_3', lane_2: 'lane_axis_1', lane_3: 'lane_axis_2' }[lane] ?? lane ?? null;
}

function classifyCrossReplay(candidate, coverage, contradictions, instability, episodes, resolutionEffect) {
    const res = resolutionEffect.candidates.find(item => item.candidateId === candidate.id);
    if (res?.classification === 'strongly_resolution_sensitive') return 'resolution_confounded';
    if (Math.max(...coverage) < 5) return 'insufficient_coverage';
    if (Math.max(...contradictions) > Math.max(100, Math.min(...contradictions) * 2 + 50)) return 'replay_specific_failure';
    if (Math.max(...episodes) > 0 && coefficientOfVariation(coverage) <= 0.35 && coefficientOfVariation(instability) <= 0.5) return 'consistent_limited_behavior';
    return 'consistent_failure';
}

function strongestFailure(byCandidate) {
    return byCandidate
        .map(candidate => ({
            candidateId: candidate.candidateId,
            classification: candidate.classification,
            maxContradictions: Math.max(...Object.values(candidate.replayMetrics).map(item => item.contradictionEvidenceRows)),
            minCoverage: Math.min(...Object.values(candidate.replayMetrics).map(item => item.coveragePercent))
        }))
        .sort((left, right) => right.maxContradictions - left.maxContradictions || left.minCoverage - right.minCoverage)[0] ?? null;
}

function commonContradictions(perReplay) {
    const keySets = perReplay.map(item => new Set(Object.keys(item.pointMetrics.contradictionFlags)));
    return [ ...keySets[0] ?? [] ].filter(key => keySets.every(set => set.has(key)));
}

function topCounts(counts, limit) {
    return Object.entries(counts).sort((left, right) => right[1] - left[1]).slice(0, limit);
}

function diffCounts(left, right) {
    const keys = new Set([ ...Object.keys(left), ...Object.keys(right) ]);
    return Object.fromEntries([ ...keys ].map(key => [ key, (right[key] ?? 0) - (left[key] ?? 0) ]));
}

function countInterruptions(observations, lane) {
    return interruptionRuns(observations, lane).length;
}

function maxInterruption(observations, lane) {
    return Math.max(0, ...interruptionRuns(observations, lane).map(run => run.length));
}

function interruptionRuns(observations, lane) {
    const runs = [];
    let current = [];
    for (const observation of observations) {
        const evidence = observation.laneEvidence[lane];
        if (evidence.support <= evidence.contradiction) {
            current.push(observation);
        } else if (current.length > 0) {
            runs.push(current);
            current = [];
        }
    }
    if (current.length > 0) runs.push(current);
    return runs;
}

function fragmentation(episodes, rows) {
    const durationHours = rows.length === 0 ? 0 : Math.max(...rows.map(row => row.gameTimeSeconds)) / 3600;
    const players = new Set(rows.map(row => row.playerId)).size;
    return round(durationHours > 0 && players > 0 ? episodes.length / players / durationHours : 0);
}

function phase(second) {
    if (second <= 600) return 'early';
    if (second <= 1200) return 'middle';
    return 'late';
}

function distanceBand(value) {
    if (!Number.isFinite(value)) return 'missing';
    if (value <= 300) return '0_300';
    if (value <= 520) return '301_520';
    if (value <= 800) return '521_800';
    return 'over_800';
}

function marginBand(value) {
    if (!Number.isFinite(value)) return 'missing';
    if (value < 45) return 'lt_45';
    if (value < 90) return '45_89';
    if (value < 180) return '90_179';
    return 'gte_180';
}

function speedBand(value) {
    if (!Number.isFinite(value)) return 'missing';
    if (value <= 300) return '0_300';
    if (value <= 900) return '301_900';
    return 'over_900';
}

function structuralContext(regions) {
    if (regions?.nearTeamBase || regions?.nearEnemyBase) return 'base';
    if (regions?.nearDeployment) return 'deployment';
    if (regions?.nearCentralObjective) return 'central_objective';
    if (regions?.nearNeutralStructure) return 'neutral_structure';
    return 'open_structural_space';
}

function isLaneState(state) {
    return [ 'lane_core_high', 'lane_core_medium', 'lane_occupiable' ].includes(state);
}

function range(values) {
    return [ round(Math.min(...values)), round(Math.max(...values)) ];
}

function coefficientOfVariation(values) {
    const mean = average(values);
    if (!Number.isFinite(mean) || mean === 0) return null;
    const variance = average(values.map(value => (value - mean) ** 2));
    return round(Math.sqrt(variance) / mean);
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
    return {
        count: clean.length,
        min: round(clean[0]),
        median: round(median(clean)),
        p90: round(clean[Math.floor(clean.length * 0.9)]),
        max: round(clean.at(-1))
    };
}

function median(values) {
    const clean = values.filter(Number.isFinite).sort((left, right) => left - right);
    if (clean.length === 0) return null;
    const middle = Math.floor(clean.length / 2);
    return clean.length % 2 === 0 ? round((clean[middle - 1] + clean[middle]) / 2) : round(clean[middle]);
}

function average(values) {
    const clean = values.filter(Number.isFinite);
    return clean.length === 0 ? null : sum(clean) / clean.length;
}

function sum(values) {
    return values.filter(Number.isFinite).reduce((total, value) => total + value, 0);
}

function percent(count, total) {
    return total > 0 ? round((count / total) * 100) : 0;
}

function ratio(count, total) {
    return total > 0 ? round(count / total) : 0;
}

function round(value) {
    return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
}

function coordinateBounds(points) {
    if (points.length === 0) return null;
    return {
        minX: round(Math.min(...points.map(point => point.x))),
        maxX: round(Math.max(...points.map(point => point.x))),
        minY: round(Math.min(...points.map(point => point.y))),
        maxY: round(Math.max(...points.map(point => point.y))),
        minZ: round(Math.min(...points.map(point => point.z ?? 0))),
        maxZ: round(Math.max(...points.map(point => point.z ?? 0)))
    };
}

function bounds(points) {
    return coordinateBounds(points);
}

function expandBounds(box, margin) {
    return { minX: box.minX - margin, maxX: box.maxX + margin, minY: box.minY - margin, maxY: box.maxY + margin, minZ: box.minZ - margin, maxZ: box.maxZ + margin };
}

function insideBounds(point, box) {
    return point.x >= box.minX && point.x <= box.maxX && point.y >= box.minY && point.y <= box.maxY && (point.z ?? 0) >= box.minZ && (point.z ?? 0) <= box.maxZ;
}

function emptyPlayerState() {
    return { lastDirect: null, lastPawnHandle: null, previousRow: null };
}

function emptyProjection() {
    return {
        nearestLane: null,
        nearestDistance: null,
        secondNearestLane: null,
        secondNearestDistance: null,
        separationMargin: null,
        normalizedProgress: null,
        projectedX: null,
        projectedY: null,
        segmentIndex: null,
        projectionQuality: null,
        allLaneDistances: []
    };
}

function emptyRegions() {
    return {
        nearTeamBase: false,
        nearEnemyBase: false,
        nearDeployment: false,
        nearCentralObjective: false,
        nearNeutralStructure: false,
        outsideKnownStructuralEnvelope: false
    };
}

function hasFinitePosition(position) {
    return position !== null && Number.isFinite(position.x) && Number.isFinite(position.y) && Number.isFinite(position.z);
}

function normalize(value) {
    if (typeof value === 'bigint') return value.toString();
    return value ?? null;
}

function hash(value) {
    return createHash('sha256').update(value).digest('hex');
}

function distance2d(left, right) {
    return Math.hypot(left.x - right.x, left.y - right.y);
}

function distance3d(left, right) {
    return Math.hypot(left.x - right.x, left.y - right.y, (left.z ?? 0) - (right.z ?? 0));
}
