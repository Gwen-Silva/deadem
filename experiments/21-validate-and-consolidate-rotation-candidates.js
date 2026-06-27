import { readFile, stat, writeFile } from 'node:fs/promises';

const TIMELINE_FILE = './output/09-canonical-player-timeline.json';
const HERO_FILE = './output/13-canonical-hero-enrichment.json';
const REGION_MODEL_FILE = './output/17-spatial-region-model.json';
const REGION_TIMELINE_FILE = './output/17-player-region-timeline.json';
const REGION_INTERVALS_FILE = './output/17-player-region-intervals.json';
const MOVEMENT_METRICS_FILE = './output/18-player-movement-metrics.json';
const MOVEMENT_SEGMENTS_FILE = './output/18-movement-segments.json';
const REGION_JOURNEYS_FILE = './output/18-region-journeys.json';
const BETWEEN_ANALYSIS_FILE = './output/19-between-lanes-analysis.json';
const DESTINATION_PARAMETERS_FILE = './output/20-destination-resolution-parameters.json';
const DESTINATION_RESOLUTION_FILE = './output/20-journey-destination-resolution.json';
const REVISED_FUNNEL_FILE = './output/20-revised-rotation-funnel.json';
const RESOLVED_CANDIDATES_FILE = './output/20-resolved-rotation-candidates.json';
const RESOLVED_COLLECTIVE_FILE = './output/20-resolved-collective-movement.json';
const DESTINATION_VALIDATION_FILE = './output/20-destination-resolution-validation.json';
const OUTPUT_GEOMETRY = './output/21-candidate-geometry-validation.json';
const OUTPUT_RELATIONSHIPS = './output/21-candidate-relationships.json';
const OUTPUT_EPISODES = './output/21-macro-movement-episodes.json';
const OUTPUT_FINAL_LAYER = './output/21-final-spatial-candidate-layer.json';
const OUTPUT_SCORING = './output/21-spatial-relevance-scoring.json';
const OUTPUT_MANUAL = './output/21-manual-validation-cases.json';
const OUTPUT_VALIDATION = './output/21-spatial-candidate-validation.json';
const OUTPUT_SIZE_LIMIT = 10 * 1024 * 1024;

const PARAMETERS = {
    timelineBeforeSeconds: 10,
    timelineAfterConfirmationSeconds: 20,
    duplicateWindowSeconds: 12,
    continuationWindowSeconds: 20,
    trajectoryShareWindowSeconds: 8,
    roundTripWindowSeconds: 120,
    baseProximityDistance: 520,
    boundaryMarginThreshold: 75,
    shortDirectDistance: 350,
    macroDistanceThreshold: 900,
    macroDurationThreshold: 12,
    macroPresenceThreshold: 8,
    ziplinePossibleSpeed: 1200,
    ziplineConsistentSpeed: 1800,
    scoringWeights: {
        crossLaneDistance: 2,
        traveledDistance: 2,
        timeAwayFromOrigin: 1,
        destinationPresence: 2,
        sideChange: 1,
        centralPath: 1,
        clearNearestLaneDifference: 2,
        noBoundaryAmbiguity: 2,
        notBaseExclusive: 2
    }
};

const timeline = JSON.parse(await readFile(TIMELINE_FILE, 'utf8'));
const heroes = JSON.parse(await readFile(HERO_FILE, 'utf8'));
const regionModel = JSON.parse(await readFile(REGION_MODEL_FILE, 'utf8'));
const regionTimeline = JSON.parse(await readFile(REGION_TIMELINE_FILE, 'utf8'));
const regionIntervals = JSON.parse(await readFile(REGION_INTERVALS_FILE, 'utf8'));
const movementMetrics = JSON.parse(await readFile(MOVEMENT_METRICS_FILE, 'utf8'));
const movementSegments = JSON.parse(await readFile(MOVEMENT_SEGMENTS_FILE, 'utf8'));
const regionJourneys = JSON.parse(await readFile(REGION_JOURNEYS_FILE, 'utf8'));
const betweenAnalysis = JSON.parse(await readFile(BETWEEN_ANALYSIS_FILE, 'utf8'));
const destinationParameters = JSON.parse(await readFile(DESTINATION_PARAMETERS_FILE, 'utf8'));
const destinationResolution = JSON.parse(await readFile(DESTINATION_RESOLUTION_FILE, 'utf8'));
const revisedFunnel = JSON.parse(await readFile(REVISED_FUNNEL_FILE, 'utf8'));
const resolvedCandidates = JSON.parse(await readFile(RESOLVED_CANDIDATES_FILE, 'utf8'));
const resolvedCollective = JSON.parse(await readFile(RESOLVED_COLLECTIVE_FILE, 'utf8'));
const destinationValidation = JSON.parse(await readFile(DESTINATION_VALIDATION_FILE, 'utf8'));

const metrics = decodeMetrics();
const metricsByPlayer = groupByMap(metrics, row => row.playerIndex);
const heroesByPlayer = new Map(heroes.map(hero => [ hero.playerIndex, hero ]));
const journeysById = new Map(regionJourneys.journeys.map(journey => [ journey.journeyId, journey ]));
const resolutionsById = new Map(destinationResolution.resolutions.map(resolution => [ resolution.journeyId, resolution ]));
const laneAxesById = new Map(regionModel.laneAxes.map(axis => [ axis.physicalLaneId, axis ]));
const baseRegions = regionModel.regions.filter(region => /^base_team_[23]$/.test(region.region));
const levelDCandidates = resolvedCandidates.candidates.filter(candidate => candidate.level === 'D');
const geometryValidation = buildGeometryValidation();
const relationships = buildRelationships();
const episodes = buildEpisodes();
const finalLayer = buildFinalLayer();
const scoring = buildScoring();
const manualCases = buildManualCases();
const validation = buildValidation();

await writeJson(OUTPUT_GEOMETRY, geometryValidation);
await writeJson(OUTPUT_RELATIONSHIPS, relationships);
await writeJson(OUTPUT_EPISODES, episodes);
await writeJson(OUTPUT_FINAL_LAYER, finalLayer);
await writeJson(OUTPUT_SCORING, scoring);
await writeJson(OUTPUT_MANUAL, manualCases);
await writeJson(OUTPUT_VALIDATION, validation);
await validateOutputs();

console.log(`Level D candidates: ${levelDCandidates.length}`);
console.log(`Geometrically clear: ${validation.summary.geometricallyClear}`);
console.log(`Ambiguous: ${validation.summary.ambiguous}`);
console.log(`Likely false positives: ${validation.summary.likelyDetectorFalsePositive}`);
console.log(`Duplicate/fragment relationships: ${validation.summary.duplicateAndFragmentRelationships}`);
console.log(`Episodes: ${validation.summary.macroMovementEpisodes}`);
console.log(`Round trips: ${validation.summary.roundTrips}`);
console.log(`Base-related movements: ${validation.summary.baseRelatedMovements}`);
console.log(`Probable precision range: ${validation.summary.probablePrecisionRange.lower} - ${validation.summary.probablePrecisionRange.upper}`);
console.log(`Wrote ${OUTPUT_GEOMETRY}`);
console.log(`Wrote ${OUTPUT_RELATIONSHIPS}`);
console.log(`Wrote ${OUTPUT_EPISODES}`);
console.log(`Wrote ${OUTPUT_FINAL_LAYER}`);
console.log(`Wrote ${OUTPUT_SCORING}`);
console.log(`Wrote ${OUTPUT_MANUAL}`);
console.log(`Wrote ${OUTPUT_VALIDATION}`);

function decodeMetrics() {
    return movementMetrics.rows.map(row => {
        const decoded = Object.fromEntries(movementMetrics.schema.map((field, index) => [ field, row[index] ]));
        decoded.markers = decoded.markers ?? [];
        return decoded;
    });
}

function buildGeometryValidation() {
    const candidates = levelDCandidates.map(candidate => {
        const resolution = resolutionsById.get(candidate.journeyId);
        const timelineCompact = compactCandidateTimeline(candidate);
        const physicalMetrics = buildPhysicalMetrics(candidate);
        const markers = buildCandidateMarkers(candidate, physicalMetrics, timelineCompact);
        const geometry = classifyGeometry(candidate, physicalMetrics, markers);
        const mode = classifyMovementMode(candidate, physicalMetrics);
        const relevance = scoreSpatialRelevance(candidate, physicalMetrics, markers, geometry);
        const finalCategory = finalCategoryFor(geometry, markers, relevance);

        return {
            candidateId: candidateId(candidate),
            journeyId: candidate.journeyId,
            playerIndex: candidate.playerIndex,
            player: candidate.player,
            hero: heroesByPlayer.get(candidate.playerIndex)?.heroDisplayName ?? candidate.hero,
            originalLevel: candidate.level,
            originalJourney: {
                originRegion: resolution?.originalJourney.originRegion ?? null,
                destinationRegion: resolution?.originalJourney.destinationRegion ?? null,
                startSecond: candidate.journeyStartSecond,
                originalEndSecond: candidate.originalJourneyEndSecond,
                arrivalSecond: candidate.probableArrivalSecond,
                confirmationSecond: candidate.confirmationSecond,
                intermediateRegions: candidate.intermediateRegions
            },
            originPhysicalLaneId: candidate.originPhysicalLaneId,
            destinationPhysicalLaneId: candidate.destinationPhysicalLaneId,
            timeline: timelineCompact,
            physicalMetrics,
            geometryClass: geometry.class,
            geometryReasons: geometry.reasons,
            baseRespawnMarker: markers.baseRespawnMarker,
            movementMode: mode.class,
            movementModeReasons: mode.reasons,
            detectionConfidence: candidate.confidence,
            spatialRelevanceScore: relevance.score,
            spatialRelevanceComponents: relevance.components,
            finalCategory,
            confidence: confidenceFor(candidate, geometry, relevance),
            markers
        };
    });

    return {
        sourceFiles: sourceFiles(),
        parameters: PARAMETERS,
        inputSummary: inputSummary(),
        candidates
    };
}

function buildPhysicalMetrics(candidate) {
    const start = metricAt(candidate.playerIndex, candidate.journeyStartSecond);
    const arrival = metricAt(candidate.playerIndex, candidate.probableArrivalSecond);
    const confirmation = metricAt(candidate.playerIndex, candidate.confirmationSecond);
    const rows = playerRows(candidate.playerIndex, candidate.journeyStartSecond, candidate.confirmationSecond);
    const originAxis = laneAxesById.get(candidate.originPhysicalLaneId);
    const destinationAxis = laneAxesById.get(candidate.destinationPhysicalLaneId);
    const originProjectionStart = projectionOnAxis(start, originAxis);
    const originProjectionEnd = projectionOnAxis(arrival, originAxis);
    const destinationProjectionStart = projectionOnAxis(start, destinationAxis);
    const destinationProjectionEnd = projectionOnAxis(arrival, destinationAxis);
    const basesStart = baseDistances(start);
    const basesEnd = baseDistances(confirmation ?? arrival);

    return {
        startPosition: position(start),
        arrivalPosition: position(arrival),
        confirmationPosition: position(confirmation),
        directDistanceStartToArrival: round(distance2d(start, arrival)),
        traveledDistance: round(sum(rows.map(row => row.planarDistance))),
        laneDistanceDelta: {
            originLane: round(laneDistance(arrival, candidate.originPhysicalLaneId) - laneDistance(start, candidate.originPhysicalLaneId)),
            destinationLane: round(laneDistance(arrival, candidate.destinationPhysicalLaneId) - laneDistance(start, candidate.destinationPhysicalLaneId))
        },
        minimumAxisSeparation: round(distance2d(originAxis?.center, destinationAxis?.center)),
        originLaneLongitudinalProgress: round(originProjectionEnd - originProjectionStart),
        destinationLaneLongitudinalProgress: round(destinationProjectionEnd - destinationProjectionStart),
        baseDistancesStart: basesStart,
        baseDistancesEnd: basesEnd,
        maxSpeed: round(maxFinite(rows.map(row => row.speed))),
        averageSpeed: round(average(rows.map(row => row.speed))),
        minDistanceMargin: minFinite(rows.map(row => row.distanceMargin)),
        averageDistanceMargin: round(average(rows.map(row => row.distanceMargin))),
        centerPresenceSeconds: rows.filter(row => row.region === 'neutral_center' || row.region === 'between_lanes').length,
        originLaneSeconds: rows.filter(row => row.nearestLane === candidate.originPhysicalLaneId || physicalLane(row.region) === candidate.originPhysicalLaneId).length,
        destinationLaneSeconds: rows.filter(row => row.nearestLane === candidate.destinationPhysicalLaneId || physicalLane(row.region) === candidate.destinationPhysicalLaneId).length,
        aliveThroughout: rows.every(row => row.alive),
        rowCount: rows.length
    };
}

function compactCandidateTimeline(candidate) {
    const start = candidate.journeyStartSecond - PARAMETERS.timelineBeforeSeconds;
    const end = candidate.confirmationSecond + PARAMETERS.timelineAfterConfirmationSeconds;
    const rows = playerRows(candidate.playerIndex, start, end).map(row => ({
        second: row.gameSecond,
        x: row.x,
        y: row.y,
        z: row.z,
        rawRegion: row.rawRegion,
        smoothRegion: row.region,
        nearestLane: row.nearestLane,
        secondNearestLane: row.secondNearestLane,
        distanceLane1: row.distanceLane1,
        distanceLane2: row.distanceLane2,
        distanceLane3: row.distanceLane3,
        physicalLaneId: physicalLane(row.region) ?? row.nearestLane,
        speed: row.speed,
        alive: row.alive,
        nearestBase: nearestBase(row),
        alliesNearby: row.alliesWithin500,
        enemiesNearby: row.enemiesWithin500,
        marker: timelineMarker(row.gameSecond, candidate)
    }));

    return consolidateRows(rows, row => [
        row.rawRegion,
        row.smoothRegion,
        row.nearestLane,
        row.secondNearestLane,
        row.physicalLaneId,
        row.alive,
        row.nearestBase?.region,
        row.marker
    ].join('|'));
}

function consolidateRows(rows, keyFn) {
    const intervals = [];
    let current = null;

    for (const row of rows) {
        const key = keyFn(row);

        if (!current || current.key !== key || row.second !== current.endSecond + 1) {
            if (current) {
                intervals.push(stripInternalKey(current));
            }

            current = {
                key,
                startSecond: row.second,
                endSecond: row.second,
                startPosition: position(row),
                endPosition: position(row),
                rawRegion: row.rawRegion,
                smoothRegion: row.smoothRegion,
                nearestLane: row.nearestLane,
                secondNearestLane: row.secondNearestLane,
                distanceLane1: row.distanceLane1,
                distanceLane2: row.distanceLane2,
                distanceLane3: row.distanceLane3,
                physicalLaneId: row.physicalLaneId,
                maxSpeed: row.speed,
                alive: row.alive,
                nearestBase: row.nearestBase,
                alliesNearby: row.alliesNearby,
                enemiesNearby: row.enemiesNearby,
                marker: row.marker
            };
        } else {
            current.endSecond = row.second;
            current.endPosition = position(row);
            current.maxSpeed = Math.max(current.maxSpeed, row.speed);
        }
    }

    if (current) {
        intervals.push(stripInternalKey(current));
    }

    return intervals;
}

function stripInternalKey(row) {
    const { key: _key, ...rest } = row;
    return rest;
}

function timelineMarker(second, candidate) {
    if (second === candidate.journeyStartSecond) {
        return 'journey_start';
    }

    if (second === candidate.originalJourneyEndSecond) {
        return 'original_journey_end';
    }

    if (second === candidate.probableArrivalSecond) {
        return 'probable_arrival';
    }

    if (second === candidate.confirmationSecond) {
        return 'presence_confirmation';
    }

    if (second < candidate.journeyStartSecond) {
        return 'pre_departure';
    }

    if (second < candidate.originalJourneyEndSecond) {
        return 'original_path';
    }

    if (second < candidate.probableArrivalSecond) {
        return 'post_journey_before_arrival';
    }

    if (second < candidate.confirmationSecond) {
        return 'arrival_to_confirmation';
    }

    return 'post_confirmation';
}

function buildCandidateMarkers(candidate, metricsForCandidate, timelineCompact) {
    const startBase = nearestBase(metricAt(candidate.playerIndex, candidate.journeyStartSecond));
    const endBase = nearestBase(metricAt(candidate.playerIndex, candidate.confirmationSecond));
    const journeyRows = playerRows(candidate.playerIndex, candidate.journeyStartSecond - 20, candidate.confirmationSecond);
    const hasRecentRespawn = journeyRows.some(row => row.markers.includes('respawn_boundary') || row.respawnTime > 0);
    const startsNearBase = (startBase?.distance ?? Infinity) <= PARAMETERS.baseProximityDistance;
    const endsNearBase = (endBase?.distance ?? Infinity) <= PARAMETERS.baseProximityDistance;
    const originalJourney = journeysById.get(candidate.journeyId);
    const baseRespawnMarker = hasRecentRespawn ? 'post_respawn_lane_selection'
        : startsNearBase && !endsNearBase ? 'base_exit_cross_lane'
            : endsNearBase ? 'base_return_then_redeploy'
                : 'not_base_related';
    const boundaryAmbiguous = metricsForCandidate.minDistanceMargin !== null && metricsForCandidate.minDistanceMargin < PARAMETERS.boundaryMarginThreshold;
    const briefContact = candidate.presence.consecutivePresenceSeconds <= PARAMETERS.macroPresenceThreshold;

    return {
        baseRespawnMarker,
        boundaryAmbiguous,
        briefContact,
        startsNearBase,
        endsNearBase,
        possibleZiplineMarker: originalJourney?.markers?.includes('possible_zipline') ?? false,
        repeatedRegions: timelineCompact.map(interval => interval.smoothRegion).filter((region, index, regions) => regions.indexOf(region) !== index),
        journeyMarkers: originalJourney?.markers ?? []
    };
}

function classifyGeometry(candidate, metricsForCandidate, markers) {
    const reasons = [];

    if (markers.baseRespawnMarker !== 'not_base_related') {
        reasons.push(markers.baseRespawnMarker);
        return { class: 'base_side_lane_reassignment', reasons };
    }

    if (markers.briefContact) {
        reasons.push('destination_presence_at_or_below_macro_presence_threshold');
        return { class: 'brief_destination_contact', reasons };
    }

    if (markers.boundaryAmbiguous && metricsForCandidate.directDistanceStartToArrival <= PARAMETERS.shortDirectDistance) {
        reasons.push('low_distance_margin_and_short_direct_distance');
        return { class: 'adjacent_lane_boundary_crossing', reasons };
    }

    if (metricsForCandidate.centerPresenceSeconds >= PARAMETERS.macroDurationThreshold) {
        reasons.push('path_contains_extended_center_or_between_lanes_presence');
        return { class: 'central_crossing', reasons };
    }

    if (metricsForCandidate.destinationLaneSeconds >= PARAMETERS.macroPresenceThreshold && metricsForCandidate.directDistanceStartToArrival >= PARAMETERS.macroDistanceThreshold) {
        reasons.push('destination_lane_presence_and_direct_distance_above_threshold');
        return { class: 'clear_cross_lane_travel', reasons };
    }

    if (markers.repeatedRegions.includes(candidate.originPhysicalLaneId) || metricsForCandidate.originLaneSeconds > metricsForCandidate.destinationLaneSeconds) {
        reasons.push('origin_lane_reappears_or_dominates_candidate_window');
        return { class: 'return_path_with_new_lane_proximity', reasons };
    }

    if (relationshipPotential(candidate)) {
        reasons.push('nearby_candidate_relationship_requires_pair_audit');
        return { class: 'possible_fragment', reasons };
    }

    reasons.push('insufficient_geometry_to_choose_clearer_class');
    return { class: 'geometrically_ambiguous', reasons };
}

function classifyMovementMode(candidate, metricsForCandidate) {
    const reasons = [];

    if (candidate.favorableEvidence.includes('entered_lane_region') && metricsForCandidate.maxSpeed >= PARAMETERS.ziplineConsistentSpeed && metricsForCandidate.directDistanceStartToArrival >= PARAMETERS.macroDistanceThreshold) {
        reasons.push('high_speed_with_lane_region_entry_and_large_distance');
        return { class: 'zipline_consistent', reasons };
    }

    if (metricsForCandidate.maxSpeed >= PARAMETERS.ziplinePossibleSpeed || candidate.favorableEvidence.includes('possible_zipline')) {
        reasons.push('high_speed_or_prior_possible_zipline_marker');
        return { class: 'zipline_possible', reasons };
    }

    if (metricsForCandidate.aliveThroughout && metricsForCandidate.maxSpeed < PARAMETERS.ziplinePossibleSpeed) {
        reasons.push('alive_throughout_without_large_speed_spike');
        return { class: 'continuous_ground_movement', reasons };
    }

    reasons.push('movement_mode_evidence_incomplete');
    return { class: 'movement_mode_unresolved', reasons };
}

function scoreSpatialRelevance(candidate, metricsForCandidate, markers, geometry) {
    const components = [];

    addScore(components, 'cross_lane_distance', metricsForCandidate.minimumAxisSeparation >= 50, PARAMETERS.scoringWeights.crossLaneDistance, metricsForCandidate.minimumAxisSeparation);
    addScore(components, 'traveled_distance', metricsForCandidate.traveledDistance >= PARAMETERS.macroDistanceThreshold, PARAMETERS.scoringWeights.traveledDistance, metricsForCandidate.traveledDistance);
    addScore(components, 'time_away_from_origin', metricsForCandidate.originLaneSeconds < metricsForCandidate.rowCount / 2, PARAMETERS.scoringWeights.timeAwayFromOrigin, metricsForCandidate.originLaneSeconds);
    addScore(components, 'destination_presence', candidate.presence.consecutivePresenceSeconds >= PARAMETERS.macroPresenceThreshold, PARAMETERS.scoringWeights.destinationPresence, candidate.presence.consecutivePresenceSeconds);
    addScore(components, 'side_change', Math.abs(metricsForCandidate.destinationLaneLongitudinalProgress) >= 120, PARAMETERS.scoringWeights.sideChange, metricsForCandidate.destinationLaneLongitudinalProgress);
    addScore(components, 'central_path', metricsForCandidate.centerPresenceSeconds > 0, PARAMETERS.scoringWeights.centralPath, metricsForCandidate.centerPresenceSeconds);
    addScore(components, 'clear_nearest_lane_difference', metricsForCandidate.destinationLaneSeconds > metricsForCandidate.originLaneSeconds, PARAMETERS.scoringWeights.clearNearestLaneDifference, metricsForCandidate.destinationLaneSeconds - metricsForCandidate.originLaneSeconds);
    addScore(components, 'no_boundary_ambiguity', !markers.boundaryAmbiguous, PARAMETERS.scoringWeights.noBoundaryAmbiguity, metricsForCandidate.minDistanceMargin);
    addScore(components, 'not_base_exclusive', markers.baseRespawnMarker === 'not_base_related', PARAMETERS.scoringWeights.notBaseExclusive, markers.baseRespawnMarker);

    const score = sum(components.map(component => component.satisfied ? component.weight : 0));

    return {
        score,
        components,
        geometryClass: geometry.class
    };
}

function addScore(components, name, satisfied, weight, observed) {
    components.push({ name, satisfied, weight, observed });
}

function finalCategoryFor(geometry, markers, relevance) {
    if ([ 'adjacent_lane_boundary_crossing', 'base_side_lane_reassignment', 'brief_destination_contact' ].includes(geometry.class)) {
        return 'likely_detector_false_positive';
    }

    if ([ 'geometrically_ambiguous', 'possible_fragment' ].includes(geometry.class)) {
        return 'manual_review_required';
    }

    if (relevance.score >= 9 && geometry.class === 'clear_cross_lane_travel') {
        return 'macro_movement_candidate';
    }

    if (markers.boundaryAmbiguous) {
        return 'manual_review_required';
    }

    return 'physical_cross_lane_candidate';
}

function confidenceFor(candidate, geometry, relevance) {
    const base = candidate.confidence.overallCandidateConfidence;

    if (geometry.class === 'clear_cross_lane_travel' && relevance.score >= 9 && base !== 'low') {
        return 'high';
    }

    if ([ 'geometrically_ambiguous', 'possible_fragment' ].includes(geometry.class)) {
        return 'medium';
    }

    if (geometry.class === 'adjacent_lane_boundary_crossing' || geometry.class === 'base_side_lane_reassignment') {
        return 'low';
    }

    return base;
}

function buildRelationships() {
    const duplicatePairs = [];
    const fragments = [];
    const continuities = [];
    const uncertain = [];
    const roundTrips = [];

    for (let left = 0; left < geometryValidation.candidates.length; left += 1) {
        for (let right = left + 1; right < geometryValidation.candidates.length; right += 1) {
            const a = geometryValidation.candidates[left];
            const b = geometryValidation.candidates[right];

            if (a.playerIndex !== b.playerIndex) {
                continue;
            }

            const relation = classifyPairRelationship(a, b);

            if (relation.relationship === 'duplicate_candidate') {
                duplicatePairs.push(relation);
            } else if (relation.relationship === 'continuation_fragment') {
                fragments.push(relation);
            } else if (relation.relationship === 'uncertain_relationship') {
                uncertain.push(relation);
            }

            const roundTrip = classifyRoundTrip(a, b);

            if (roundTrip) {
                roundTrips.push(roundTrip);
            }
        }
    }

    continuities.push(...fragments.filter(fragment => fragment.evidence.includes('same_origin_destination_short_interval')));

    return {
        parameters: PARAMETERS,
        duplicateCandidates: duplicatePairs,
        continuationFragments: fragments,
        continuities,
        roundTrips,
        uncertainRelationships: uncertain,
        summary: {
            duplicateCandidates: duplicatePairs.length,
            continuationFragments: fragments.length,
            continuities: continuities.length,
            roundTrips: roundTrips.length,
            uncertainRelationships: uncertain.length
        }
    };
}

function classifyPairRelationship(a, b) {
    const temporalOverlap = a.originalJourney.startSecond <= b.originalJourney.confirmationSecond && b.originalJourney.startSecond <= a.originalJourney.confirmationSecond;
    const startsBeforePriorConfirmation = b.originalJourney.startSecond <= a.originalJourney.confirmationSecond;
    const sameRoute = a.originPhysicalLaneId === b.originPhysicalLaneId && a.destinationPhysicalLaneId === b.destinationPhysicalLaneId;
    const shortGap = Math.abs(b.originalJourney.startSecond - a.originalJourney.confirmationSecond) <= PARAMETERS.duplicateWindowSeconds;
    const sharedTrajectory = trajectoryShare(a, b);
    const evidence = [];

    if (temporalOverlap) {
        evidence.push('temporal_overlap');
    }

    if (startsBeforePriorConfirmation) {
        evidence.push('starts_before_previous_confirmation_end');
    }

    if (sameRoute && shortGap) {
        evidence.push('same_origin_destination_short_interval');
    }

    if (sharedTrajectory >= 0.5) {
        evidence.push('large_trajectory_share');
    }

    const base = {
        candidateIds: [ a.candidateId, b.candidateId ],
        journeyIds: [ a.journeyId, b.journeyId ],
        playerIndex: a.playerIndex,
        evidence,
        trajectoryShare: round(sharedTrajectory)
    };

    if (temporalOverlap && sameRoute) {
        return { ...base, relationship: 'duplicate_candidate' };
    }

    if ((shortGap || startsBeforePriorConfirmation) && (sameRoute || sharedTrajectory >= 0.35)) {
        return { ...base, relationship: 'continuation_fragment' };
    }

    if (evidence.length > 0) {
        return { ...base, relationship: 'uncertain_relationship' };
    }

    return { ...base, relationship: 'separate_movements' };
}

function classifyRoundTrip(a, b) {
    const elapsed = b.originalJourney.startSecond - a.originalJourney.confirmationSecond;
    const isReturn = a.originPhysicalLaneId === b.destinationPhysicalLaneId && a.destinationPhysicalLaneId === b.originPhysicalLaneId;

    if (!isReturn || elapsed < 0 || elapsed > PARAMETERS.roundTripWindowSeconds) {
        return null;
    }

    return {
        candidateIds: [ a.candidateId, b.candidateId ],
        journeyIds: [ a.journeyId, b.journeyId ],
        playerIndex: a.playerIndex,
        class: elapsed <= 45 ? 'short_round_trip' : elapsed <= PARAMETERS.roundTripWindowSeconds ? 'extended_round_trip' : 'independent_return',
        staySecondsAtDestination: elapsed,
        timeToReturn: elapsed,
        distance: round((a.physicalMetrics.traveledDistance ?? 0) + (b.physicalMetrics.traveledDistance ?? 0)),
        origin: a.originPhysicalLaneId,
        intermediate: a.destinationPhysicalLaneId,
        returnDestination: b.destinationPhysicalLaneId
    };
}

function buildEpisodes() {
    const used = new Set();
    const episodes = [];
    const relationshipPairs = [
        ...relationships.duplicateCandidates,
        ...relationships.continuationFragments
    ];

    for (const candidate of geometryValidation.candidates) {
        if (used.has(candidate.candidateId)) {
            continue;
        }

        const relatedIds = new Set([ candidate.candidateId ]);
        let changed = true;

        while (changed) {
            changed = false;

            for (const pair of relationshipPairs) {
                if (pair.candidateIds.some(id => relatedIds.has(id))) {
                    for (const id of pair.candidateIds) {
                        if (!relatedIds.has(id)) {
                            relatedIds.add(id);
                            changed = true;
                        }
                    }
                }
            }
        }

        const members = geometryValidation.candidates.filter(item => relatedIds.has(item.candidateId));
        members.forEach(member => used.add(member.candidateId));
        episodes.push(buildEpisode(episodes.length + 1, members));
    }

    return {
        parameters: PARAMETERS,
        summary: {
            totalEpisodes: episodes.length,
            singleCandidateEpisodes: episodes.filter(episode => episode.candidateIds.length === 1).length,
            consolidatedEpisodes: episodes.filter(episode => episode.candidateIds.length > 1).length
        },
        episodes
    };
}

function buildEpisode(number, members) {
    const sorted = members.slice().sort((a, b) => a.originalJourney.startSecond - b.originalJourney.startSecond);
    const first = sorted[0];
    const last = sorted.at(-1);
    const interruptions = sorted.flatMap(candidate => candidate.markers.journeyMarkers).filter(marker => marker !== 'continuous_movement');

    return {
        episodeId: `macro_episode_${number}`,
        playerIndex: first.playerIndex,
        player: first.player,
        hero: first.hero,
        candidateIds: sorted.map(candidate => candidate.candidateId),
        journeyIds: sorted.map(candidate => candidate.journeyId),
        physicalStartSecond: first.originalJourney.startSecond,
        physicalEndSecond: last.originalJourney.confirmationSecond,
        origin: first.originPhysicalLaneId,
        finalDestination: last.destinationPhysicalLaneId,
        intermediateLanes: unique(sorted.slice(0, -1).map(candidate => candidate.destinationPhysicalLaneId)),
        traveledDistance: round(sum(sorted.map(candidate => candidate.physicalMetrics.traveledDistance))),
        durationSeconds: last.originalJourney.confirmationSecond - first.originalJourney.startSecond + 1,
        arrivalSecond: first.originalJourney.arrivalSecond,
        presenceSeconds: sum(sorted.map(candidate => candidate.physicalMetrics.destinationLaneSeconds)),
        interruptions: unique(interruptions),
        confidence: episodeConfidence(sorted),
        consolidationRule: sorted.length === 1 ? 'single_candidate_episode' : 'duplicate_or_continuation_relationship'
    };
}

function buildFinalLayer() {
    const entries = geometryValidation.candidates.map(candidate => ({
        candidateId: candidate.candidateId,
        journeyId: candidate.journeyId,
        playerIndex: candidate.playerIndex,
        player: candidate.player,
        hero: candidate.hero,
        originPhysicalLaneId: candidate.originPhysicalLaneId,
        destinationPhysicalLaneId: candidate.destinationPhysicalLaneId,
        startSecond: candidate.originalJourney.startSecond,
        arrivalSecond: candidate.originalJourney.arrivalSecond,
        confirmationSecond: candidate.originalJourney.confirmationSecond,
        finalCategory: candidate.finalCategory,
        geometryClass: candidate.geometryClass,
        detectionConfidence: candidate.detectionConfidence,
        spatialRelevanceScore: candidate.spatialRelevanceScore,
        evidence: candidate.geometryReasons,
        relatedEpisodeId: episodes.episodes.find(episode => episode.candidateIds.includes(candidate.candidateId))?.episodeId ?? null
    }));

    return {
        parameters: PARAMETERS,
        summary: countBy(entries, entry => entry.finalCategory),
        categories: {
            physical_cross_lane_candidate: entries.filter(entry => entry.finalCategory === 'physical_cross_lane_candidate'),
            macro_movement_candidate: entries.filter(entry => entry.finalCategory === 'macro_movement_candidate'),
            manual_review_required: entries.filter(entry => entry.finalCategory === 'manual_review_required'),
            likely_detector_false_positive: entries.filter(entry => entry.finalCategory === 'likely_detector_false_positive')
        }
    };
}

function buildScoring() {
    const scores = geometryValidation.candidates.map(candidate => ({
        candidateId: candidate.candidateId,
        journeyId: candidate.journeyId,
        geometryClass: candidate.geometryClass,
        finalCategory: candidate.finalCategory,
        score: candidate.spatialRelevanceScore,
        components: candidate.spatialRelevanceComponents
    }));
    const scoreValues = scores.map(item => item.score);

    return {
        parameters: PARAMETERS,
        components: Object.entries(PARAMETERS.scoringWeights).map(([ component, weight ]) => ({ component, weight })),
        distribution: {
            min: minFinite(scoreValues),
            max: maxFinite(scoreValues),
            average: round(average(scoreValues)),
            byFinalCategory: Object.fromEntries(Object.entries(groupBy(scores, score => score.finalCategory)).map(([ category, rows ]) => [
                category,
                {
                    count: rows.length,
                    averageScore: round(average(rows.map(row => row.score)))
                }
            ]))
        },
        sensitivity: [
            sensitivityScenario('strict_macro_threshold', 11),
            sensitivityScenario('default_macro_threshold', 9),
            sensitivityScenario('permissive_macro_threshold', 7)
        ],
        scores
    };
}

function sensitivityScenario(name, threshold) {
    return {
        name,
        threshold,
        macroMovementCandidates: geometryValidation.candidates.filter(candidate => candidate.spatialRelevanceScore >= threshold && candidate.geometryClass === 'clear_cross_lane_travel').length,
        manualReviewOrHigher: geometryValidation.candidates.filter(candidate => candidate.spatialRelevanceScore >= threshold || candidate.finalCategory === 'manual_review_required').length
    };
}

function buildManualCases() {
    const selected = uniqueBy([
        ...geometryValidation.candidates.filter(candidate => candidate.finalCategory === 'macro_movement_candidate' && candidate.confidence === 'high').slice(0, 15),
        ...geometryValidation.candidates.filter(candidate => candidate.finalCategory === 'macro_movement_candidate' && candidate.confidence === 'medium').slice(0, 10),
        ...geometryValidation.candidates.filter(candidate => candidate.markers.baseRespawnMarker !== 'not_base_related').slice(0, 10),
        ...geometryValidation.candidates.filter(candidate => candidate.geometryClass === 'adjacent_lane_boundary_crossing').slice(0, 10),
        ...geometryValidation.candidates.filter(candidate => relationships.duplicateCandidates.some(pair => pair.candidateIds.includes(candidate.candidateId))).slice(0, 5),
        ...geometryValidation.candidates.filter(candidate => relationships.roundTrips.some(roundTrip => roundTrip.candidateIds.includes(candidate.candidateId))).slice(0, 5),
        ...geometryValidation.candidates.filter(candidate => candidate.finalCategory === 'likely_detector_false_positive').slice(0, 5)
    ], candidate => candidate.candidateId).slice(0, 60);

    return {
        parameters: PARAMETERS,
        totalCases: selected.length,
        cases: selected.map(candidate => ({
            candidateId: candidate.candidateId,
            journeyId: candidate.journeyId,
            playerIndex: candidate.playerIndex,
            player: candidate.player,
            hero: candidate.hero,
            origin: candidate.originPhysicalLaneId,
            destination: candidate.destinationPhysicalLaneId,
            times: {
                startSecond: candidate.originalJourney.startSecond,
                arrivalSecond: candidate.originalJourney.arrivalSecond,
                confirmationSecond: candidate.originalJourney.confirmationSecond
            },
            trajectory: candidate.timeline,
            distance: candidate.physicalMetrics,
            regions: unique(candidate.timeline.map(interval => interval.smoothRegion)),
            evidence: {
                geometryReasons: candidate.geometryReasons,
                markers: candidate.markers,
                scoring: candidate.spatialRelevanceComponents
            },
            classification: {
                geometryClass: candidate.geometryClass,
                finalCategory: candidate.finalCategory,
                movementMode: candidate.movementMode
            },
            reviewReason: reviewReason(candidate)
        }))
    };
}

function buildValidation() {
    const finalCounts = countBy(geometryValidation.candidates, candidate => candidate.finalCategory);
    const geometryCounts = countBy(geometryValidation.candidates, candidate => candidate.geometryClass);
    const clear = geometryValidation.candidates.filter(candidate => candidate.geometryClass === 'clear_cross_lane_travel').length;
    const ambiguous = geometryValidation.candidates.filter(candidate => [ 'geometrically_ambiguous', 'possible_fragment' ].includes(candidate.geometryClass)).length;
    const likelyFalse = finalCounts.likely_detector_false_positive ?? 0;
    const duplicateAndFragment = relationships.duplicateCandidates.length + relationships.continuationFragments.length;
    const lowerPrecision = round(clear / levelDCandidates.length);
    const plausible = clear + ambiguous + (finalCounts.physical_cross_lane_candidate ?? 0) + (finalCounts.macro_movement_candidate ?? 0);
    const upperPrecision = round(Math.min(1, plausible / levelDCandidates.length));

    return {
        generatedAt: new Date().toISOString(),
        summary: {
            candidatesReceived: levelDCandidates.length,
            geometricallyClear: clear,
            ambiguous,
            likelyDetectorFalsePositive: likelyFalse,
            duplicateAndFragmentRelationships: duplicateAndFragment,
            macroMovementEpisodes: episodes.summary.totalEpisodes,
            roundTrips: relationships.roundTrips.length,
            baseRelatedMovements: geometryValidation.candidates.filter(candidate => candidate.markers.baseRespawnMarker !== 'not_base_related').length,
            ziplineCompatibleMovements: geometryValidation.candidates.filter(candidate => [ 'zipline_consistent', 'zipline_possible' ].includes(candidate.movementMode)).length,
            finalCounts,
            geometryCounts,
            probablePrecisionRange: {
                lower: lowerPrecision,
                upper: upperPrecision,
                note: 'technical estimate only; not a replacement for human review'
            },
            readyForCombatAndObjectiveContext: likelyFalse / levelDCandidates.length < 0.5 && clear > 0
        },
        checks: {
            originalCandidatesPreserved: geometryValidation.candidates.length === levelDCandidates.length,
            everyCandidateHasGeometryClass: geometryValidation.candidates.every(candidate => Boolean(candidate.geometryClass)),
            everyCandidateHasExactlyOneFinalCategory: geometryValidation.candidates.every(candidate => [ 'physical_cross_lane_candidate', 'macro_movement_candidate', 'manual_review_required', 'likely_detector_false_positive' ].includes(candidate.finalCategory)),
            episodesReferenceOriginalCandidates: episodes.episodes.every(episode => episode.candidateIds.every(id => geometryValidation.candidates.some(candidate => candidate.candidateId === id))),
            noCandidateSilentlyRemoved: new Set(geometryValidation.candidates.map(candidate => candidate.candidateId)).size === levelDCandidates.length,
            duplicationIsTechnicalOnly: relationships.duplicateCandidates.every(pair => pair.relationship === 'duplicate_candidate'),
            baseMovementSeparated: geometryValidation.candidates.every(candidate => candidate.markers.baseRespawnMarker === 'not_base_related' || candidate.geometryClass === 'base_side_lane_reassignment'),
            spatialScoreDoesNotUseOutcomeFields: true,
            noStrategicInference: noStrategicTerms(),
            precisionRangeMarkedAsEstimate: true
        },
        limitations: [
            'Precision range is an automatic technical estimate and requires human review.',
            'Base-side reassignment can still contain real physical cross-lane travel but is separated to avoid overclaiming.',
            'Zipline labels are consistency markers, not confirmed usage.',
            'No combat, objectives, items, intent or decision quality are used.'
        ],
        references: {
            experiment20Validation: destinationValidation.summary,
            resolvedCollectiveSummary: resolvedCollective.summary,
            revisedFunnelSummary: revisedFunnel.summary,
            regionTimelineSnapshots: regionTimeline.snapshots.length,
            regionIntervals: regionIntervals.intervals.length,
            betweenLanesIntervals: betweenAnalysis.summary?.totalBetweenLanesIntervals ?? null,
            destinationParameterSource: destinationParameters.inputSummary ?? null
        }
    };
}

function reviewReason(candidate) {
    if (candidate.finalCategory === 'likely_detector_false_positive') {
        return 'possible_false_positive_pattern';
    }

    if (candidate.markers.baseRespawnMarker !== 'not_base_related') {
        return 'base_or_respawn_related';
    }

    if (candidate.geometryClass === 'adjacent_lane_boundary_crossing') {
        return 'lane_boundary_case';
    }

    if (relationships.roundTrips.some(roundTrip => roundTrip.candidateIds.includes(candidate.candidateId))) {
        return 'round_trip_case';
    }

    if (relationships.duplicateCandidates.some(pair => pair.candidateIds.includes(candidate.candidateId))) {
        return 'possible_duplicate';
    }

    return 'stratified_macro_candidate_sample';
}

function inputSummary() {
    return {
        levelDCandidates: levelDCandidates.length,
        canonicalSnapshots: timeline.snapshots.length,
        movementMetricRows: movementMetrics.rows.length,
        movementSegments: movementSegments.segments.length,
        regionJourneys: regionJourneys.journeys.length,
        resolvedCollectiveEvents: resolvedCollective.events.length
    };
}

function candidateId(candidate) {
    return `candidate_${candidate.journeyId}`;
}

function relationshipPotential(candidate) {
    return levelDCandidates.some(other => other.journeyId !== candidate.journeyId
        && other.playerIndex === candidate.playerIndex
        && Math.abs(other.journeyStartSecond - candidate.confirmationSecond) <= PARAMETERS.continuationWindowSeconds);
}

function trajectoryShare(a, b) {
    const aSeconds = new Set(playerRows(a.playerIndex, a.originalJourney.startSecond, a.originalJourney.confirmationSecond).map(row => row.gameSecond));
    const bRows = playerRows(b.playerIndex, b.originalJourney.startSecond, b.originalJourney.confirmationSecond);
    const overlap = bRows.filter(row => aSeconds.has(row.gameSecond)).length;
    const denominator = Math.max(1, Math.min(aSeconds.size, bRows.length));

    return overlap / denominator;
}

function episodeConfidence(candidates) {
    const ranks = { low: 0, medium: 1, high: 2 };
    const min = Math.min(...candidates.map(candidate => ranks[candidate.confidence] ?? 0));

    return min >= 2 ? 'high' : min === 1 ? 'medium' : 'low';
}

function sourceFiles() {
    return [
        TIMELINE_FILE,
        HERO_FILE,
        REGION_MODEL_FILE,
        REGION_TIMELINE_FILE,
        REGION_INTERVALS_FILE,
        MOVEMENT_METRICS_FILE,
        MOVEMENT_SEGMENTS_FILE,
        REGION_JOURNEYS_FILE,
        BETWEEN_ANALYSIS_FILE,
        DESTINATION_PARAMETERS_FILE,
        DESTINATION_RESOLUTION_FILE,
        REVISED_FUNNEL_FILE,
        RESOLVED_CANDIDATES_FILE,
        RESOLVED_COLLECTIVE_FILE,
        DESTINATION_VALIDATION_FILE
    ];
}

function nearestBase(row) {
    if (!row) {
        return null;
    }

    return baseRegions.map(base => ({
        region: base.region,
        distance: round(distance2d(row, base.center))
    })).sort((a, b) => a.distance - b.distance)[0] ?? null;
}

function baseDistances(row) {
    if (!row) {
        return {};
    }

    return Object.fromEntries(baseRegions.map(base => [ base.region, round(distance2d(row, base.center)) ]));
}

function projectionOnAxis(row, axis) {
    if (!row || !axis) {
        return 0;
    }

    return (row.x - axis.center.x) * axis.direction.x + (row.y - axis.center.y) * axis.direction.y;
}

function metricAt(playerIndex, second) {
    return (metricsByPlayer.get(playerIndex) ?? []).find(row => row.gameSecond === second) ?? null;
}

function playerRows(playerIndex, startSecond, endSecond) {
    return (metricsByPlayer.get(playerIndex) ?? []).filter(row => row.gameSecond >= startSecond && row.gameSecond <= endSecond);
}

function position(row) {
    if (!row) {
        return null;
    }

    return { x: row.x, y: row.y, z: row.z };
}

function physicalLane(region) {
    return region?.match(/^(lane_\d+)_/)?.[1] ?? null;
}

function laneDistance(row, lane) {
    return row?.[`distanceLane${lane?.split('_')[1]}`] ?? null;
}

function distance2d(a, b) {
    if (!a || !b || !Number.isFinite(a.x) || !Number.isFinite(a.y) || !Number.isFinite(b.x) || !Number.isFinite(b.y)) {
        return null;
    }

    return Math.hypot(a.x - b.x, a.y - b.y);
}

function groupBy(rows, keyFn) {
    const groups = {};

    for (const row of rows) {
        const key = keyFn(row);
        groups[key] ??= [];
        groups[key].push(row);
    }

    return groups;
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

function countBy(rows, keyFn) {
    const counts = {};

    for (const row of rows) {
        const key = keyFn(row);
        counts[key] = (counts[key] ?? 0) + 1;
    }

    return counts;
}

function unique(values) {
    return Array.from(new Set(values.filter(value => value !== null && value !== undefined)));
}

function uniqueBy(values, keyFn) {
    const seen = new Set();
    const output = [];

    for (const value of values) {
        const key = keyFn(value);

        if (!seen.has(key)) {
            seen.add(key);
            output.push(value);
        }
    }

    return output;
}

function minFinite(values) {
    const finite = values.filter(Number.isFinite);

    return finite.length > 0 ? Math.min(...finite) : null;
}

function maxFinite(values) {
    const finite = values.filter(Number.isFinite);

    return finite.length > 0 ? Math.max(...finite) : null;
}

function average(values) {
    const finite = values.filter(Number.isFinite);

    return finite.length === 0 ? null : sum(finite) / finite.length;
}

function sum(values) {
    return values.reduce((total, value) => total + (Number.isFinite(value) ? value : 0), 0);
}

function round(value) {
    return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
}

function noStrategicTerms() {
    const text = JSON.stringify({
        geometryValidation,
        relationships,
        episodes,
        finalLayer,
        scoring
    });
    const forbidden = [ 'good_rotation', 'bad_rotation', 'gank', 'split_push', 'objective_rotation', 'late_rotation', 'confirmed_rotation' ];

    return forbidden.every(term => !text.includes(term));
}

async function writeJson(file, value) {
    await writeFile(file, `${JSON.stringify(value)}\n`);
}

async function validateOutputs() {
    const files = [
        OUTPUT_GEOMETRY,
        OUTPUT_RELATIONSHIPS,
        OUTPUT_EPISODES,
        OUTPUT_FINAL_LAYER,
        OUTPUT_SCORING,
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
