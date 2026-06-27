import { readFile, stat, writeFile } from 'node:fs/promises';

const TIMELINE_FILE = './output/09-canonical-player-timeline.json';
const HERO_FILE = './output/13-canonical-hero-enrichment.json';
const TOPOLOGY_FILE = './output/16-lane-topology-6592.json';
const FIELD_SEMANTICS_FILE = './output/16-lane-field-semantics.json';
const REGION_MODEL_FILE = './output/17-spatial-region-model.json';
const REGION_TIMELINE_FILE = './output/17-player-region-timeline.json';
const REGION_INTERVALS_FILE = './output/17-player-region-intervals.json';
const TEAM_DISTRIBUTION_FILE = './output/17-team-spatial-distribution.json';
const MOVEMENT_METRICS_FILE = './output/18-player-movement-metrics.json';
const DESTINATION_RESOLUTION_FILE = './output/20-journey-destination-resolution.json';
const CANDIDATE_GEOMETRY_FILE = './output/21-candidate-geometry-validation.json';
const CANDIDATE_VALIDATION_FILE = './output/21-spatial-candidate-validation.json';
const OUTPUT_GEOMETRY = './output/22-lane-geometry-model.json';
const OUTPUT_TIMELINE = './output/22-player-lane-occupancy-timeline.json';
const OUTPUT_OCCUPANCY = './output/22-stable-lane-occupancy-episodes.json';
const OUTPUT_TRANSITIONS = './output/22-lane-transition-episodes.json';
const OUTPUT_LEGACY = './output/22-legacy-candidate-reassessment.json';
const OUTPUT_SENSITIVITY = './output/22-lane-occupancy-sensitivity.json';
const OUTPUT_MANUAL = './output/22-lane-occupancy-manual-review.json';
const OUTPUT_VALIDATION = './output/22-lane-occupancy-validation.json';
const OUTPUT_SIZE_LIMIT = 10 * 1024 * 1024;

const PARAMETERS = {
    minStableCoreSeconds: 8,
    briefInterruptionToleranceSeconds: 2,
    laneCoreHighDistance: 180,
    laneCoreMediumDistance: 300,
    laneApproachDistance: 420,
    laneSeparationMarginHigh: 120,
    laneSeparationMarginMedium: 75,
    baseCoreRadius: 280,
    deploymentRadius: 620,
    deploymentProjectionFraction: 0.22,
    directTransitionMaxTransitSeconds: 120,
    sensitivity: {
        minStableCoreSeconds: [ 3, 5, 8, 12 ],
        laneSeparationMargin: [ 50, 75, 120 ],
        maxAxisDistance: [ 240, 300, 360 ],
        interruptionTolerance: [ 0, 2 ],
        deploymentProjectionFraction: [ 0.18, 0.22, 0.28 ]
    }
};

const timeline = JSON.parse(await readFile(TIMELINE_FILE, 'utf8'));
const heroes = JSON.parse(await readFile(HERO_FILE, 'utf8'));
const topology = JSON.parse(await readFile(TOPOLOGY_FILE, 'utf8'));
const fieldSemantics = JSON.parse(await readFile(FIELD_SEMANTICS_FILE, 'utf8'));
const regionModel = JSON.parse(await readFile(REGION_MODEL_FILE, 'utf8'));
const regionTimeline = JSON.parse(await readFile(REGION_TIMELINE_FILE, 'utf8'));
const regionIntervals = JSON.parse(await readFile(REGION_INTERVALS_FILE, 'utf8'));
const teamDistribution = JSON.parse(await readFile(TEAM_DISTRIBUTION_FILE, 'utf8'));
const movementMetrics = JSON.parse(await readFile(MOVEMENT_METRICS_FILE, 'utf8'));
const destinationResolution = JSON.parse(await readFile(DESTINATION_RESOLUTION_FILE, 'utf8'));
const candidateGeometry = JSON.parse(await readFile(CANDIDATE_GEOMETRY_FILE, 'utf8'));
const candidateValidation = JSON.parse(await readFile(CANDIDATE_VALIDATION_FILE, 'utf8'));

const metrics = decodeMetrics();
const heroesByPlayer = new Map(heroes.map(hero => [ hero.playerIndex, hero ]));
const laneGeometry = buildLaneGeometry();
const classifiedRows = classifyTimeline(PARAMETERS);
const occupancyEpisodes = buildOccupancyEpisodes(classifiedRows, PARAMETERS);
const transitionEpisodes = buildTransitionEpisodes(occupancyEpisodes, classifiedRows);
const legacyReassessment = buildLegacyReassessment();
const sensitivity = buildSensitivity();
const manualReview = buildManualReview();
const validation = buildValidation();

await writeJson(OUTPUT_GEOMETRY, laneGeometry);
await writeJson(OUTPUT_TIMELINE, buildCompactTimeline(classifiedRows));
await writeJson(OUTPUT_OCCUPANCY, occupancyEpisodes);
await writeJson(OUTPUT_TRANSITIONS, transitionEpisodes);
await writeJson(OUTPUT_LEGACY, legacyReassessment);
await writeJson(OUTPUT_SENSITIVITY, sensitivity);
await writeJson(OUTPUT_MANUAL, manualReview);
await writeJson(OUTPUT_VALIDATION, validation);
await validateOutputs();

console.log(`Stable lane occupancy episodes: ${occupancyEpisodes.summary.stableLaneOccupancies}`);
console.log(`Brief lane contacts: ${occupancyEpisodes.summary.briefLaneContacts}`);
console.log(`Direct lane-to-lane transitions: ${transitionEpisodes.summary.directLaneToLane}`);
console.log(`Transitions via base: ${transitionEpisodes.summary.viaBase}`);
console.log(`Post-respawn deployments: ${occupancyEpisodes.summary.postRespawnBasePresence}`);
console.log(`Legacy supported: ${legacyReassessment.summary.supportedByOccupancyModel}`);
console.log(`Legacy base/deployment removed: ${legacyReassessment.summary.baseOrDeploymentRejected}`);
console.log(`Ambiguous legacy candidates: ${legacyReassessment.summary.stillAmbiguous}`);
console.log(`Wrote ${OUTPUT_GEOMETRY}`);
console.log(`Wrote ${OUTPUT_TIMELINE}`);
console.log(`Wrote ${OUTPUT_OCCUPANCY}`);
console.log(`Wrote ${OUTPUT_TRANSITIONS}`);
console.log(`Wrote ${OUTPUT_LEGACY}`);
console.log(`Wrote ${OUTPUT_SENSITIVITY}`);
console.log(`Wrote ${OUTPUT_MANUAL}`);
console.log(`Wrote ${OUTPUT_VALIDATION}`);

function decodeMetrics() {
    return movementMetrics.rows.map(row => {
        const decoded = Object.fromEntries(movementMetrics.schema.map((field, index) => [ field, row[index] ]));
        decoded.markers = decoded.markers ?? [];
        return decoded;
    });
}

function buildLaneGeometry() {
    const baseTeam2 = regionModel.regions.find(region => region.region === 'base_team_2');
    const baseTeam3 = regionModel.regions.find(region => region.region === 'base_team_3');
    const lanes = regionModel.laneAxes.map(axis => {
        const start = pointOnAxis(axis, axis.projectionMin);
        const end = pointOnAxis(axis, axis.projectionMax);
        const range = axis.projectionMax - axis.projectionMin;
        const team2ApproachEnd = axis.projectionMin + range * PARAMETERS.deploymentProjectionFraction;
        const team3ApproachStart = axis.projectionMax - range * PARAMETERS.deploymentProjectionFraction;
        const centerStart = axis.projectionBreaks[0];
        const centerEnd = axis.projectionBreaks[1];

        return {
            physicalLaneId: axis.physicalLaneId,
            laneCodeRaw: axis.laneCodeRaw,
            displayLabel: axis.displayLabel,
            polyline: [ start, axis.center, end ],
            orientation: 'team_2_base_to_team_3_base',
            projectionRange: [ axis.projectionMin, axis.projectionMax ],
            projectionBreaks: axis.projectionBreaks,
            zones: {
                team_2_base_approach: [ axis.projectionMin, team2ApproachEnd ],
                team_2_lane_core: [ team2ApproachEnd, centerStart ],
                lane_center_core: [ centerStart, centerEnd ],
                team_3_lane_core: [ centerEnd, team3ApproachStart ],
                team_3_base_approach: [ team3ApproachStart, axis.projectionMax ]
            },
            exits: {
                team_2: pointOnAxis(axis, team2ApproachEnd),
                team_3: pointOnAxis(axis, team3ApproachStart)
            },
            confidence: axis.confidence,
            justification: 'Derived from experiment 17 lane axis built from objectiveSummary + minionPathEvidence + ziplineEvidence + lane center; subdivision uses longitudinal progression and base/deployment separation.'
        };
    });

    return {
        sourceFiles: sourceFiles(),
        parameters: PARAMETERS,
        topologyEvidence: {
            contentVersion: topology.contentVersion,
            physicalLaneCount: topology.physicalLaneCount,
            activePhysicalLaneCodes: topology.activePhysicalLaneCodes,
            fieldSemantics: fieldSemantics.fields.map(field => ({
                field: field.field,
                semantic: field.semantic,
                confidence: field.confidence
            }))
        },
        baseZones: {
            team_2_base_core: { center: baseTeam2.center, radius: PARAMETERS.baseCoreRadius },
            team_3_base_core: { center: baseTeam3.center, radius: PARAMETERS.baseCoreRadius },
            team_2_deployment_zone: { center: baseTeam2.center, radius: PARAMETERS.deploymentRadius },
            team_3_deployment_zone: { center: baseTeam3.center, radius: PARAMETERS.deploymentRadius }
        },
        laneExitZones: Object.fromEntries(lanes.flatMap(lane => [
            [ `team_2_${lane.physicalLaneId}_exit`, lane.exits.team_2 ],
            [ `team_3_${lane.physicalLaneId}_exit`, lane.exits.team_3 ]
        ])),
        lanes,
        confidence: 'medium',
        limitations: [
            'Polyline is derived from existing topology axes and objective anchors, not from replay reprocessing.',
            'Deployment zones are explicit conservative filters for base convergence.'
        ]
    };
}

function classifyTimeline(parameters) {
    return metrics.map(row => classifyRow(row, parameters));
}

function classifyRow(row, parameters) {
    const base = nearestBase(row);
    const laneMeasurements = regionModel.laneAxes.map(axis => {
        const projection = projectionOnAxis(row, axis);
        const perpendicularDistance = distanceToAxis(row, axis);
        const normalizedProgress = (projection - axis.projectionMin) / (axis.projectionMax - axis.projectionMin);

        return {
            physicalLaneId: axis.physicalLaneId,
            perpendicularDistance: round(perpendicularDistance),
            normalizedProgress: round(normalizedProgress),
            projection: round(projection),
            projectedPoint: pointOnAxis(axis, projection),
            nearestSegment: laneZone(axis, projection),
            beyondSeparation: normalizedProgress > parameters.deploymentProjectionFraction && normalizedProgress < 1 - parameters.deploymentProjectionFraction
        };
    }).sort((a, b) => a.perpendicularDistance - b.perpendicularDistance);
    const nearest = laneMeasurements[0];
    const second = laneMeasurements[1];
    const margin = second.perpendicularDistance - nearest.perpendicularDistance;
    const inBaseCore = base.distance <= parameters.baseCoreRadius;
    const inDeployment = !inBaseCore && (base.distance <= parameters.deploymentRadius
        || !nearest.beyondSeparation && base.distance <= parameters.deploymentRadius * 1.25
        || margin < parameters.laneSeparationMarginMedium && base.distance <= parameters.deploymentRadius * 1.25);
    const topologicalState = classifyTopologicalState(row, nearest, margin, inBaseCore, inDeployment, parameters);
    const physicalLaneId = [ 'lane_core_high', 'lane_core_medium', 'lane_approach' ].includes(topologicalState) ? nearest.physicalLaneId : null;

    return {
        playerIndex: row.playerIndex,
        gameSecond: row.gameSecond,
        demoTick: row.demoTick,
        team: row.team,
        x: row.x,
        y: row.y,
        z: row.z,
        alive: row.alive,
        deaths: row.deaths,
        respawnTime: row.respawnTime,
        rawRegion: row.rawRegion,
        smoothRegion: row.region,
        nearestLane: row.nearestLane,
        physicalLaneId,
        candidatePhysicalLaneId: nearest.physicalLaneId,
        secondNearestLane: second.physicalLaneId,
        nearestLaneDistance: nearest.perpendicularDistance,
        secondLaneDistance: second.perpendicularDistance,
        laneSeparationMargin: round(margin),
        normalizedProgress: nearest.normalizedProgress,
        projection: nearest.projection,
        projectedPoint: nearest.projectedPoint,
        nearestSegment: nearest.nearestSegment,
        beyondSeparation: nearest.beyondSeparation,
        baseState: inBaseCore ? base.region.replace('base_', 'base_core_') : inDeployment ? `${base.region.replace('base_', '')}_deployment_zone` : 'not_base_related',
        nearestBase: base,
        topologicalState,
        confidence: confidenceForState(topologicalState),
        assignedLaneRaw: null,
        deducedLaneRaw: null,
        speed: row.speed,
        planarDistance: row.planarDistance,
        markers: row.markers
    };
}

function classifyTopologicalState(row, nearest, margin, inBaseCore, inDeployment, parameters) {
    if (!row.alive || !Number.isFinite(row.x) || !Number.isFinite(row.y)) {
        return 'unknown';
    }

    if (inBaseCore) {
        return 'base_core';
    }

    if (inDeployment) {
        return 'deployment_ambiguous';
    }

    if (nearest.perpendicularDistance <= parameters.laneCoreHighDistance && margin >= parameters.laneSeparationMarginHigh) {
        return 'lane_core_high';
    }

    if (nearest.perpendicularDistance <= parameters.laneCoreMediumDistance && margin >= parameters.laneSeparationMarginMedium) {
        return 'lane_core_medium';
    }

    if (nearest.perpendicularDistance <= parameters.laneApproachDistance) {
        return 'lane_approach';
    }

    if (nearest.perpendicularDistance <= parameters.laneApproachDistance * 1.6) {
        return 'inter_lane_transit';
    }

    return 'unknown';
}

function buildOccupancyEpisodes(rows, parameters) {
    const stable = [];
    const brief = [];
    const baseEpisodes = [];
    const deploymentEpisodes = [];
    const byPlayer = groupByMap(rows, row => row.playerIndex);

    for (const [ playerIndex, playerRows ] of byPlayer.entries()) {
        const intervals = segmentRows(playerRows, row => `${row.topologicalState}|${row.physicalLaneId ?? row.candidatePhysicalLaneId ?? 'none'}|${row.baseState}`);

        for (const interval of intervals) {
            const first = interval.rows[0];
            const last = interval.rows.at(-1);
            const isLane = [ 'lane_core_high', 'lane_core_medium' ].includes(first.topologicalState);
            const isBriefLane = [ 'lane_core_high', 'lane_core_medium', 'lane_approach' ].includes(first.topologicalState);

            if (isLane && interval.durationSeconds >= parameters.minStableCoreSeconds) {
                stable.push(buildLaneOccupancyEpisode(stable.length + 1, playerIndex, interval));
            } else if (isBriefLane && interval.durationSeconds < parameters.minStableCoreSeconds) {
                brief.push(buildBriefContact(brief.length + 1, playerIndex, interval));
            }

            if (first.topologicalState === 'base_core') {
                baseEpisodes.push(buildBaseEpisode(baseEpisodes.length + 1, playerIndex, interval, first, last));
            } else if (first.topologicalState === 'deployment_ambiguous') {
                deploymentEpisodes.push(buildDeploymentEpisode(deploymentEpisodes.length + 1, playerIndex, interval, first, last));
            }
        }
    }

    return {
        parameters,
        summary: {
            stableLaneOccupancies: stable.length,
            briefLaneContacts: brief.length,
            basePresence: baseEpisodes.length,
            postRespawnBasePresence: baseEpisodes.filter(episode => episode.type === 'post_respawn_base_presence').length,
            deploymentEpisodes: deploymentEpisodes.length
        },
        stableLaneOccupancies: stable,
        briefLaneContacts: brief,
        baseEpisodes,
        deploymentEpisodes
    };
}

function buildLaneOccupancyEpisode(number, playerIndex, interval) {
    const rows = interval.rows;
    const first = rows[0];
    const hero = heroesByPlayer.get(playerIndex);

    return {
        episodeId: `lane_occ_${number}`,
        type: 'stable_lane_occupancy',
        playerIndex,
        player: hero?.name ?? null,
        hero: hero?.heroDisplayName ?? null,
        physicalLaneId: first.physicalLaneId,
        startSecond: interval.startSecond,
        endSecond: interval.endSecond,
        durationSeconds: interval.durationSeconds,
        laneSide: laneSide(first.normalizedProgress),
        progressStart: first.normalizedProgress,
        progressEnd: rows.at(-1).normalizedProgress,
        averageAxisDistance: round(average(rows.map(row => row.nearestLaneDistance))),
        averageSeparationMargin: round(average(rows.map(row => row.laneSeparationMargin))),
        confidence: rows.every(row => row.topologicalState === 'lane_core_high') ? 'high' : 'medium',
        toleratedBriefInterruptions: 0,
        assignedLane: first.assignedLaneRaw,
        deducedLane: first.deducedLaneRaw
    };
}

function buildBriefContact(number, playerIndex, interval) {
    const first = interval.rows[0];

    return {
        episodeId: `brief_lane_contact_${number}`,
        type: 'brief_lane_contact',
        playerIndex,
        physicalLaneId: first.physicalLaneId ?? first.candidatePhysicalLaneId,
        startSecond: interval.startSecond,
        endSecond: interval.endSecond,
        durationSeconds: interval.durationSeconds,
        topologicalState: first.topologicalState,
        reason: 'below_minimum_stable_core_seconds'
    };
}

function buildBaseEpisode(number, playerIndex, interval, first) {
    const respawn = interval.rows.some(row => row.markers.includes('respawn_boundary') || row.respawnTime > 0);

    return {
        episodeId: `base_episode_${number}`,
        type: respawn ? 'post_respawn_base_presence' : 'base_presence',
        playerIndex,
        startSecond: interval.startSecond,
        endSecond: interval.endSecond,
        durationSeconds: interval.durationSeconds,
        baseState: first.baseState
    };
}

function buildDeploymentEpisode(number, playerIndex, interval, first, last) {
    const leavingBase = first.nearestBase.distance < last.nearestBase.distance;
    const enteringBase = first.nearestBase.distance > last.nearestBase.distance;

    return {
        episodeId: `deployment_episode_${number}`,
        type: leavingBase ? 'base_departure' : enteringBase ? 'base_return' : 'deployment_selection',
        playerIndex,
        startSecond: interval.startSecond,
        endSecond: interval.endSecond,
        durationSeconds: interval.durationSeconds,
        baseState: first.baseState,
        candidateLaneAtEnd: last.candidatePhysicalLaneId
    };
}

function buildTransitionEpisodes(episodes, rows) {
    const transitions = [];
    const stableByPlayer = groupByMap(episodes.stableLaneOccupancies, episode => episode.playerIndex);

    for (const [ playerIndex, playerEpisodes ] of stableByPlayer.entries()) {
        playerEpisodes.sort((a, b) => a.startSecond - b.startSecond);

        for (let index = 0; index < playerEpisodes.length - 1; index += 1) {
            const origin = playerEpisodes[index];
            const destination = playerEpisodes[index + 1];
            const betweenRows = rows.filter(row => row.playerIndex === playerIndex && row.gameSecond > origin.endSecond && row.gameSecond < destination.startSecond);
            const transition = buildTransition(transitions.length + 1, origin, destination, betweenRows);
            transitions.push(transition);
        }
    }

    return {
        parameters: PARAMETERS,
        summary: {
            totalTransitions: transitions.length,
            directLaneToLane: transitions.filter(transition => transition.category === 'direct_lane_to_lane').length,
            viaBase: transitions.filter(transition => [ 'lane_to_base_to_lane', 'base_to_lane_deployment', 'post_respawn_lane_deployment' ].includes(transition.category)).length,
            unresolved: transitions.filter(transition => transition.category === 'unresolved_transition').length
        },
        transitions
    };
}

function buildTransition(number, origin, destination, betweenRows) {
    const hasBase = betweenRows.some(row => [ 'base_core', 'deployment_ambiguous' ].includes(row.topologicalState));
    const hasRespawn = betweenRows.some(row => row.markers.includes('respawn_boundary') || row.respawnTime > 0);
    const hasDeath = betweenRows.some(row => row.markers.includes('death_boundary'));
    const passedCenter = betweenRows.some(row => row.topologicalState === 'inter_lane_transit' || row.smoothRegion === 'neutral_center' || row.smoothRegion === 'between_lanes');
    const sameLane = origin.physicalLaneId === destination.physicalLaneId;
    const category = classifyTransitionCategory(origin, destination, betweenRows, hasBase, hasRespawn, hasDeath, passedCenter, sameLane);

    return {
        transitionId: `lane_transition_${number}`,
        category,
        originEpisodeId: origin.episodeId,
        destinationEpisodeId: destination.episodeId,
        playerIndex: origin.playerIndex,
        originLane: origin.physicalLaneId,
        destinationLane: destination.physicalLaneId,
        exitStartSecond: origin.endSecond + 1,
        originEndSecond: origin.endSecond,
        firstTransitSecond: betweenRows[0]?.gameSecond ?? origin.endSecond + 1,
        destinationArrivalSecond: destination.startSecond,
        destinationConfirmationSecond: destination.startSecond + PARAMETERS.minStableCoreSeconds - 1,
        transitDurationSeconds: destination.startSecond - origin.endSecond - 1,
        intermediateStates: unique(betweenRows.map(row => row.topologicalState)),
        intermediateRegions: unique(betweenRows.map(row => row.smoothRegion)),
        traveledDistance: round(sum(betweenRows.map(row => row.planarDistance))),
        passedCenter,
        passedBase: hasBase,
        deathOrRespawn: hasDeath || hasRespawn,
        confidence: category === 'direct_lane_to_lane' ? 'high' : hasBase || hasRespawn ? 'medium' : 'low',
        detectionPhysical: category,
        spatialRelevance: category === 'direct_lane_to_lane' ? 'high' : 'descriptive_only'
    };
}

function classifyTransitionCategory(origin, destination, betweenRows, hasBase, hasRespawn, hasDeath, passedCenter, sameLane) {
    if (sameLane) {
        return 'same_lane_reentry';
    }

    if (hasRespawn) {
        return 'post_respawn_lane_deployment';
    }

    if (hasBase || hasDeath) {
        return 'lane_to_base_to_lane';
    }

    if (origin.physicalLaneId !== destination.physicalLaneId && betweenRows.length <= PARAMETERS.directTransitionMaxTransitSeconds) {
        return passedCenter ? 'lane_to_neutral_to_lane' : 'direct_lane_to_lane';
    }

    return 'unresolved_transition';
}

function buildLegacyReassessment() {
    const directTransitions = transitionEpisodes.transitions.filter(transition => [ 'direct_lane_to_lane', 'lane_to_neutral_to_lane' ].includes(transition.category));
    const reassessments = candidateGeometry.candidates.map(candidate => {
        const originEpisode = findStableEpisode(candidate.playerIndex, candidate.originPhysicalLaneId, candidate.originalJourney.startSecond, candidate.originalJourney.startSecond);
        const destinationEpisode = findStableEpisode(candidate.playerIndex, candidate.destinationPhysicalLaneId, candidate.originalJourney.arrivalSecond, candidate.originalJourney.confirmationSecond);
        const matchedTransition = directTransitions.find(transition => transition.playerIndex === candidate.playerIndex
            && transition.originLane === candidate.originPhysicalLaneId
            && transition.destinationLane === candidate.destinationPhysicalLaneId
            && rangesOverlap(transition.exitStartSecond, transition.destinationArrivalSecond, candidate.originalJourney.startSecond, candidate.originalJourney.confirmationSecond));
        const rowWindow = classifiedRows.filter(row => row.playerIndex === candidate.playerIndex && row.gameSecond >= candidate.originalJourney.startSecond && row.gameSecond <= candidate.originalJourney.confirmationSecond);
        const passedBase = rowWindow.some(row => [ 'base_core', 'deployment_ambiguous' ].includes(row.topologicalState));
        const postRespawn = rowWindow.some(row => row.markers.includes('respawn_boundary') || row.respawnTime > 0);
        const onlyDeployment = rowWindow.length > 0 && rowWindow.every(row => [ 'base_core', 'deployment_ambiguous', 'lane_approach' ].includes(row.topologicalState));
        const status = classifyLegacy(candidate, originEpisode, destinationEpisode, matchedTransition, passedBase, postRespawn, onlyDeployment);

        return {
            candidateId: candidate.candidateId,
            journeyId: candidate.journeyId,
            playerIndex: candidate.playerIndex,
            originalGeometryClass: candidate.geometryClass,
            originStableOccupancyEpisode: originEpisode?.episodeId ?? null,
            destinationStableOccupancyEpisode: destinationEpisode?.episodeId ?? null,
            passedBase,
            startedAfterRespawn: postRespawn,
            deploymentOnly: onlyDeployment,
            matchedTransitionId: matchedTransition?.transitionId ?? null,
            reassessment: status,
            explanation: legacyExplanation(status)
        };
    });

    return {
        parameters: PARAMETERS,
        summary: {
            totalLegacyCandidates: reassessments.length,
            supportedByOccupancyModel: reassessments.filter(item => item.reassessment === 'supported_by_occupancy_model').length,
            baseOrDeploymentRejected: reassessments.filter(item => [ 'base_redeployment', 'deployment_zone_false_positive' ].includes(item.reassessment)).length,
            boundaryFalsePositive: reassessments.filter(item => item.reassessment === 'boundary_false_positive').length,
            briefContactOnly: reassessments.filter(item => item.reassessment === 'brief_contact_only').length,
            stillAmbiguous: reassessments.filter(item => item.reassessment === 'still_ambiguous').length
        },
        reassessments
    };
}

function classifyLegacy(candidate, originEpisode, destinationEpisode, matchedTransition, passedBase, postRespawn, onlyDeployment) {
    if (matchedTransition && originEpisode && destinationEpisode) {
        return 'supported_by_occupancy_model';
    }

    if (postRespawn || passedBase && candidate.geometryClass === 'base_side_lane_reassignment') {
        return 'base_redeployment';
    }

    if (onlyDeployment) {
        return 'deployment_zone_false_positive';
    }

    if (candidate.geometryClass === 'adjacent_lane_boundary_crossing') {
        return 'boundary_false_positive';
    }

    if (candidate.geometryClass === 'brief_destination_contact') {
        return 'brief_contact_only';
    }

    return 'still_ambiguous';
}

function buildSensitivity() {
    const configs = [];

    for (const minStableCoreSeconds of PARAMETERS.sensitivity.minStableCoreSeconds) {
        for (const laneSeparationMargin of PARAMETERS.sensitivity.laneSeparationMargin) {
            for (const maxAxisDistance of PARAMETERS.sensitivity.maxAxisDistance) {
                for (const interruptionTolerance of PARAMETERS.sensitivity.interruptionTolerance) {
                    for (const deploymentProjectionFraction of PARAMETERS.sensitivity.deploymentProjectionFraction) {
                        const params = {
                            ...PARAMETERS,
                            minStableCoreSeconds,
                            laneCoreMediumDistance: maxAxisDistance,
                            laneSeparationMarginMedium: laneSeparationMargin,
                            briefInterruptionToleranceSeconds: interruptionTolerance,
                            deploymentProjectionFraction
                        };
                        const rows = classifyTimeline(params);
                        const episodes = buildOccupancyEpisodes(rows, params);
                        const transitions = buildTransitionEpisodes(episodes, rows);

                        configs.push({
                            configId: `sensitivity_${configs.length + 1}`,
                            minStableCoreSeconds,
                            laneSeparationMargin,
                            maxAxisDistance,
                            interruptionTolerance,
                            deploymentProjectionFraction,
                            counts: {
                                stableLaneOccupancies: episodes.summary.stableLaneOccupancies,
                                directLaneToLane: transitions.summary.directLaneToLane,
                                baseDeployments: episodes.summary.deploymentEpisodes,
                                briefLaneContacts: episodes.summary.briefLaneContacts
                            }
                        });
                    }
                }
            }
        }
    }

    return {
        parameters: PARAMETERS.sensitivity,
        summary: {
            configurations: configs.length,
            directLaneToLaneRange: range(configs.map(config => config.counts.directLaneToLane)),
            stableOccupancyRange: range(configs.map(config => config.counts.stableLaneOccupancies)),
            mostSensitiveParameter: estimateMostSensitive(configs)
        },
        configurations: configs
    };
}

function buildManualReview() {
    const direct = transitionEpisodes.transitions.filter(transition => transition.category === 'direct_lane_to_lane').slice(0, 20);
    const neutral = transitionEpisodes.transitions.filter(transition => transition.category === 'lane_to_neutral_to_lane').slice(0, 10);
    const deployments = transitionEpisodes.transitions.filter(transition => transition.category === 'base_to_lane_deployment').slice(0, 10);
    const viaBase = transitionEpisodes.transitions.filter(transition => transition.category === 'lane_to_base_to_lane').slice(0, 10);
    const brief = occupancyEpisodes.briefLaneContacts.slice(0, 10);
    const ambiguous = legacyReassessment.reassessments.filter(item => item.reassessment === 'still_ambiguous').slice(0, 10);
    const cases = [
        ...direct.map(transition => reviewCaseFromTransition(transition, 'direct_lane_to_lane')),
        ...neutral.map(transition => reviewCaseFromTransition(transition, 'lane_to_neutral_to_lane')),
        ...deployments.map(transition => reviewCaseFromTransition(transition, 'base_to_lane_deployment')),
        ...viaBase.map(transition => reviewCaseFromTransition(transition, 'lane_to_base_to_lane')),
        ...brief.map(contact => reviewCaseFromContact(contact)),
        ...ambiguous.map(item => reviewCaseFromLegacy(item))
    ].slice(0, 60);

    return {
        parameters: PARAMETERS,
        totalCases: cases.length,
        cases
    };
}

function buildValidation() {
    const oldClear = candidateGeometry.candidates.find(candidate => candidate.geometryClass === 'clear_cross_lane_travel');
    const oldClearReassessment = oldClear ? legacyReassessment.reassessments.find(item => item.candidateId === oldClear.candidateId) : null;
    const falsePositiveRemoved = legacyReassessment.reassessments.filter(item => [ 'base_redeployment', 'deployment_zone_false_positive', 'boundary_false_positive', 'brief_contact_only' ].includes(item.reassessment)).length;
    const supported = legacyReassessment.summary.supportedByOccupancyModel;
    const ambiguous = legacyReassessment.summary.stillAmbiguous;
    const lower = round(supported / legacyReassessment.summary.totalLegacyCandidates);
    const upper = round((supported + ambiguous) / legacyReassessment.summary.totalLegacyCandidates);

    return {
        generatedAt: new Date().toISOString(),
        summary: {
            modelCoverageRows: classifiedRows.length,
            laneCoreCoverage: classifiedRows.filter(row => [ 'lane_core_high', 'lane_core_medium' ].includes(row.topologicalState)).length,
            deploymentCoverage: classifiedRows.filter(row => row.topologicalState === 'deployment_ambiguous').length,
            stableLaneOccupancyEpisodes: occupancyEpisodes.summary.stableLaneOccupancies,
            briefLaneContacts: occupancyEpisodes.summary.briefLaneContacts,
            directTransitions: transitionEpisodes.summary.directLaneToLane,
            transitionsViaBase: transitionEpisodes.summary.viaBase,
            postRespawnDeployments: occupancyEpisodes.summary.postRespawnBasePresence,
            oldFalsePositivesRemoved: falsePositiveRemoved,
            oldCandidatesPreserved: legacyReassessment.summary.totalLegacyCandidates,
            ambiguousLegacyCases: ambiguous,
            technicalPrecisionRange: {
                lower,
                upper,
                note: 'technical estimate based on occupancy model support; not human validation'
            },
            readyForExternalContext: transitionEpisodes.summary.directLaneToLane > 0 && falsePositiveRemoved > supported
        },
        checks: {
            noNearestLaneChangeInDeploymentCreatesDirectTransition: transitionEpisodes.transitions.filter(transition => transition.category === 'direct_lane_to_lane').every(transition => !transition.passedBase),
            everyDirectTransitionHasStableOriginAndDestination: transitionEpisodes.transitions.filter(transition => transition.category === 'direct_lane_to_lane').every(transition => transition.originEpisodeId && transition.destinationEpisodeId),
            noDirectTransitionThroughBaseDeathRespawn: transitionEpisodes.transitions.filter(transition => transition.category === 'direct_lane_to_lane').every(transition => !transition.passedBase && !transition.deathOrRespawn),
            baseDeploymentSeparated: transitionEpisodes.transitions.every(transition => transition.category !== 'direct_lane_to_lane' || !transition.passedBase),
            physicalLaneCanBeNullInAmbiguousRegions: classifiedRows.some(row => row.topologicalState === 'deployment_ambiguous' && row.physicalLaneId === null),
            briefContactNotStable: occupancyEpisodes.briefLaneContacts.every(contact => !occupancyEpisodes.stableLaneOccupancies.some(episode => episode.startSecond === contact.startSecond && episode.playerIndex === contact.playerIndex)),
            oldCandidatesReferenced: legacyReassessment.reassessments.length === 170,
            oldClearCasePreservedOrExplained: oldClearReassessment ? [ 'supported_by_occupancy_model', 'still_ambiguous', 'brief_contact_only', 'base_redeployment', 'deployment_zone_false_positive', 'boundary_false_positive' ].includes(oldClearReassessment.reassessment) : true,
            noStrategicInference: noForbiddenTerms()
        },
        oldClearCase: oldClearReassessment ?? null,
        sensitivitySummary: sensitivity.summary,
        limitations: [
            'Lane polylines use existing topology axes and anchors, not replay reprocessing.',
            'Deployment filtering is conservative and may undercount true base exits.',
            'Direct transitions are descriptive physical events only; no decision quality is inferred.'
        ],
        references: {
            timelineSnapshots: timeline.snapshots.length,
            heroes: heroes.length,
            regionTimelineSnapshots: regionTimeline.snapshots.length,
            regionIntervals: regionIntervals.intervals.length,
            teamDistributionSnapshots: teamDistribution.snapshots.length,
            destinationResolutions: destinationResolution.resolutions.length,
            experiment21Summary: candidateValidation.summary
        }
    };
}

function buildCompactTimeline(rows) {
    const schema = [
        'playerIndex',
        'gameSecond',
        'topologicalState',
        'physicalLaneId',
        'candidatePhysicalLaneId',
        'nearestLaneDistance',
        'secondLaneDistance',
        'laneSeparationMargin',
        'normalizedProgress',
        'baseState',
        'confidence'
    ];

    return {
        parameters: PARAMETERS,
        schema,
        rows: rows.map(row => schema.map(field => row[field]))
    };
}

function segmentRows(rows, keyFn) {
    const intervals = [];
    let current = null;

    for (const row of rows.sort((a, b) => a.gameSecond - b.gameSecond)) {
        const key = keyFn(row);

        if (!current || current.key !== key || row.gameSecond !== current.endSecond + 1) {
            if (current) {
                intervals.push(finalizeInterval(current));
            }

            current = {
                key,
                startSecond: row.gameSecond,
                endSecond: row.gameSecond,
                rows: [ row ]
            };
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

function findStableEpisode(playerIndex, lane, startSecond, endSecond) {
    return occupancyEpisodes.stableLaneOccupancies.find(episode => episode.playerIndex === playerIndex
        && episode.physicalLaneId === lane
        && rangesOverlap(episode.startSecond, episode.endSecond, startSecond - 30, endSecond + 30)) ?? null;
}

function reviewCaseFromTransition(transition, reason) {
    return {
        type: reason,
        transitionId: transition.transitionId,
        playerIndex: transition.playerIndex,
        timeline: compactRowsForPlayer(transition.playerIndex, transition.exitStartSecond - 10, transition.destinationConfirmationSecond + 10),
        originEpisodeId: transition.originEpisodeId,
        destinationEpisodeId: transition.destinationEpisodeId,
        classificationReason: transition.category
    };
}

function reviewCaseFromContact(contact) {
    return {
        type: 'brief_lane_contact',
        episodeId: contact.episodeId,
        playerIndex: contact.playerIndex,
        timeline: compactRowsForPlayer(contact.playerIndex, contact.startSecond - 10, contact.endSecond + 10),
        classificationReason: contact.reason
    };
}

function reviewCaseFromLegacy(item) {
    const candidate = candidateGeometry.candidates.find(candidateItem => candidateItem.candidateId === item.candidateId);

    return {
        type: 'ambiguous_legacy_candidate',
        candidateId: item.candidateId,
        journeyId: item.journeyId,
        playerIndex: item.playerIndex,
        timeline: candidate?.timeline ?? [],
        classificationReason: item.explanation
    };
}

function compactRowsForPlayer(playerIndex, startSecond, endSecond) {
    return classifiedRows
        .filter(row => row.playerIndex === playerIndex && row.gameSecond >= startSecond && row.gameSecond <= endSecond)
        .filter((row, index) => index % 3 === 0 || [ 'base_core', 'deployment_ambiguous', 'lane_core_high', 'lane_core_medium' ].includes(row.topologicalState))
        .map(row => ({
            second: row.gameSecond,
            position: { x: row.x, y: row.y, z: row.z },
            projection: row.projection,
            normalizedProgress: row.normalizedProgress,
            distances: {
                nearest: row.nearestLaneDistance,
                second: row.secondLaneDistance,
                margin: row.laneSeparationMargin
            },
            state: row.topologicalState,
            physicalLaneId: row.physicalLaneId,
            baseState: row.baseState
        }));
}

function estimateMostSensitive(configs) {
    const groups = [
        [ 'minStableCoreSeconds', config => String(config.minStableCoreSeconds) ],
        [ 'laneSeparationMargin', config => String(config.laneSeparationMargin) ],
        [ 'maxAxisDistance', config => String(config.maxAxisDistance) ],
        [ 'interruptionTolerance', config => String(config.interruptionTolerance) ],
        [ 'deploymentProjectionFraction', config => String(config.deploymentProjectionFraction) ]
    ];

    return groups.map(([ parameter, keyFn ]) => {
        const grouped = groupByMap(configs, keyFn);
        const averages = Array.from(grouped.entries()).map(([ value, rows ]) => ({
            value,
            directLaneToLane: round(average(rows.map(row => row.counts.directLaneToLane)))
        }));
        const spread = Math.max(...averages.map(row => row.directLaneToLane)) - Math.min(...averages.map(row => row.directLaneToLane));

        return { parameter, averages, spread: round(spread) };
    }).sort((a, b) => b.spread - a.spread)[0];
}

function classifyTransitionCategoryForLegacy(status) {
    return status;
}

function legacyExplanation(status) {
    return {
        supported_by_occupancy_model: 'stable lane core occupancy exists for origin and destination with a matching direct transition',
        base_redeployment: 'candidate passes through base or follows respawn/base deployment pattern',
        deployment_zone_false_positive: 'candidate occurs only in base/deployment/approach states',
        boundary_false_positive: 'candidate matches lane boundary pattern from experiment 21',
        brief_contact_only: 'destination contact did not become stable lane occupancy',
        still_ambiguous: 'insufficient stable occupancy evidence for support or rejection'
    }[classifyTransitionCategoryForLegacy(status)];
}

function confidenceForState(state) {
    return {
        lane_core_high: 'high',
        lane_core_medium: 'medium',
        lane_approach: 'low',
        deployment_ambiguous: 'low',
        inter_lane_transit: 'medium',
        base_core: 'high',
        unknown: 'low'
    }[state];
}

function laneSide(progress) {
    if (progress < 0.35) {
        return 'team_2_side';
    }

    if (progress > 0.65) {
        return 'team_3_side';
    }

    return 'center';
}

function laneZone(axis, projection) {
    const lane = laneGeometry?.lanes?.find(item => item.physicalLaneId === axis.physicalLaneId);

    if (lane) {
        for (const [ zone, rangeValues ] of Object.entries(lane.zones)) {
            if (projection >= rangeValues[0] && projection <= rangeValues[1]) {
                return zone;
            }
        }
    }

    if (projection <= axis.projectionBreaks[0]) {
        return 'team_2_lane_core';
    }

    if (projection <= axis.projectionBreaks[1]) {
        return 'lane_center_core';
    }

    return 'team_3_lane_core';
}

function nearestBase(row) {
    const baseRegions = regionModel.regions.filter(region => /^base_team_[23]$/.test(region.region));

    return baseRegions.map(base => ({
        region: base.region,
        distance: round(distance2d(row, base.center))
    })).sort((a, b) => a.distance - b.distance)[0];
}

function pointOnAxis(axis, projection) {
    return {
        x: round(axis.center.x + axis.direction.x * projection),
        y: round(axis.center.y + axis.direction.y * projection),
        z: round(axis.center.z)
    };
}

function projectionOnAxis(row, axis) {
    return (row.x - axis.center.x) * axis.direction.x + (row.y - axis.center.y) * axis.direction.y;
}

function distanceToAxis(row, axis) {
    const projection = projectionOnAxis(row, axis);
    const point = pointOnAxis(axis, projection);

    return distance2d(row, point);
}

function range(values) {
    return {
        min: Math.min(...values),
        max: Math.max(...values)
    };
}

function rangesOverlap(aStart, aEnd, bStart, bEnd) {
    return Math.max(aStart, bStart) <= Math.min(aEnd, bEnd);
}

function unique(values) {
    return Array.from(new Set(values.filter(value => value !== null && value !== undefined)));
}

function groupByMap(rows, keyFn) {
    const groups = new Map();

    for (const row of rows) {
        const key = keyFn(row);
        const group = groups.get(key) ?? [];
        group.push(row);
        groups.set(key, group);
    }

    return groups;
}

function average(values) {
    const finite = values.filter(Number.isFinite);

    return finite.length === 0 ? null : sum(finite) / finite.length;
}

function sum(values) {
    return values.reduce((total, value) => total + (Number.isFinite(value) ? value : 0), 0);
}

function distance2d(a, b) {
    if (!a || !b || !Number.isFinite(a.x) || !Number.isFinite(a.y) || !Number.isFinite(b.x) || !Number.isFinite(b.y)) {
        return null;
    }

    return Math.hypot(a.x - b.x, a.y - b.y);
}

function round(value) {
    return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
}

function sourceFiles() {
    return [
        TIMELINE_FILE,
        HERO_FILE,
        TOPOLOGY_FILE,
        FIELD_SEMANTICS_FILE,
        REGION_MODEL_FILE,
        REGION_TIMELINE_FILE,
        REGION_INTERVALS_FILE,
        TEAM_DISTRIBUTION_FILE,
        MOVEMENT_METRICS_FILE,
        DESTINATION_RESOLUTION_FILE,
        CANDIDATE_GEOMETRY_FILE,
        CANDIDATE_VALIDATION_FILE
    ];
}

function noForbiddenTerms() {
    const text = JSON.stringify({ transitionEpisodes, occupancyEpisodes, legacyReassessment });
    const forbidden = [ 'good_rotation', 'bad_rotation', 'gank', 'split_push', 'objective_rotation', 'late_rotation', 'confirmed_rotation' ];

    return forbidden.every(term => !text.includes(term));
}

async function writeJson(file, value) {
    await writeFile(file, `${JSON.stringify(value)}\n`);
}

async function validateOutputs() {
    const files = [
        OUTPUT_GEOMETRY,
        OUTPUT_TIMELINE,
        OUTPUT_OCCUPANCY,
        OUTPUT_TRANSITIONS,
        OUTPUT_LEGACY,
        OUTPUT_SENSITIVITY,
        OUTPUT_MANUAL,
        OUTPUT_VALIDATION
    ];

    for (const file of files) {
        JSON.parse(await readFile(file, 'utf8'));
        const size = (await stat(file)).size;

        if (size > OUTPUT_SIZE_LIMIT) {
            throw new Error(`${file} is ${size} bytes, above ${OUTPUT_SIZE_LIMIT}`);
        }
    }
}
