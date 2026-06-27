import { readFile, stat, writeFile } from 'node:fs/promises';

const TIMELINE_FILE = './output/09-canonical-player-timeline.json';
const HERO_FILE = './output/13-canonical-hero-enrichment.json';
const REGION_MODEL_FILE = './output/17-spatial-region-model.json';
const REGION_TIMELINE_FILE = './output/17-player-region-timeline.json';
const REGION_INTERVALS_FILE = './output/17-player-region-intervals.json';
const REGION_TRANSITIONS_FILE = './output/17-region-transition-events.json';
const TEAM_DISTRIBUTION_FILE = './output/17-team-spatial-distribution.json';
const SPATIAL_VALIDATION_FILE = './output/17-spatial-validation.json';
const OUTPUT_PARAMETERS = './output/18-movement-parameters.json';
const OUTPUT_METRICS = './output/18-player-movement-metrics.json';
const OUTPUT_SEGMENTS = './output/18-movement-segments.json';
const OUTPUT_JOURNEYS = './output/18-region-journeys.json';
const OUTPUT_ROTATIONS = './output/18-rotation-candidates.json';
const OUTPUT_COLLECTIVE = './output/18-collective-movement.json';
const OUTPUT_VALIDATION = './output/18-movement-validation.json';
const OUTPUT_SIZE_LIMIT = 10 * 1024 * 1024;

const PARAMETERS = {
    minOriginStaySeconds: 8,
    minDestinationStaySeconds: 8,
    maxTransitSeconds: 120,
    stationarySpeed: 25,
    slowMovementSpeed: 150,
    minMovementSpeed: 50,
    discontinuityDistance: 2500,
    possibleTeleportDistance: 5000,
    possibleZiplineSpeed: 1200,
    smoothingWindowSeconds: 5,
    collectiveWindowSeconds: 8,
    collectiveMaxDistance: 1200,
    minSpatialConfidence: 'medium',
    directDistanceTolerance: 5,
    justifications: {
        minOriginStaySeconds: 'Requires stable presence before treating an exit as a journey.',
        minDestinationStaySeconds: 'Avoids counting boundary oscillation as arrival.',
        maxTransitSeconds: 'Caps descriptive journeys to local movement windows without judging quality.',
        discontinuityDistance: 'Separates implausible one-second displacement from continuous movement.',
        collectiveWindowSeconds: 'Small window for ally departures while preserving individual journeys.'
    }
};

const timeline = JSON.parse(await readFile(TIMELINE_FILE, 'utf8'));
const heroes = JSON.parse(await readFile(HERO_FILE, 'utf8'));
const regionModel = JSON.parse(await readFile(REGION_MODEL_FILE, 'utf8'));
const regionTimeline = JSON.parse(await readFile(REGION_TIMELINE_FILE, 'utf8'));
const regionIntervals = JSON.parse(await readFile(REGION_INTERVALS_FILE, 'utf8'));
const regionTransitions = JSON.parse(await readFile(REGION_TRANSITIONS_FILE, 'utf8'));
const teamDistribution = JSON.parse(await readFile(TEAM_DISTRIBUTION_FILE, 'utf8'));
const spatialValidation = JSON.parse(await readFile(SPATIAL_VALIDATION_FILE, 'utf8'));

const playerSchemaIndex = indexSchema(timeline.playerRowSchema);
const regionSchemaIndex = indexSchema(regionTimeline.schema);
const regionByCode = invertDictionary(regionTimeline.regionDictionary);
const confidenceByCode = invertDictionary(regionTimeline.confidenceDictionary);
const confidenceRank = { low: 0, medium: 1, high: 2 };
const players = buildPlayers();
const snapshots = buildSnapshotRows();
const metrics = buildMetrics();
const segments = buildSegments(metrics);
const journeys = buildJourneys(metrics, segments);
const rotationCandidates = buildRotationCandidates(journeys);
const collectiveMovement = buildCollectiveMovement(journeys);
const validation = buildValidation(metrics, segments, journeys, rotationCandidates, collectiveMovement);

await writeJson(OUTPUT_PARAMETERS, buildParameterOutput());
await writeJson(OUTPUT_METRICS, buildCompactMetrics(metrics));
await writeJson(OUTPUT_SEGMENTS, { parameters: PARAMETERS, segments });
await writeJson(OUTPUT_JOURNEYS, { parameters: PARAMETERS, journeys });
await writeJson(OUTPUT_ROTATIONS, { parameters: PARAMETERS, rotationCandidates });
await writeJson(OUTPUT_COLLECTIVE, { parameters: PARAMETERS, events: collectiveMovement });
await writeJson(OUTPUT_VALIDATION, validation);
await validateOutputs();

console.log(`Movement metrics rows: ${metrics.length}`);
console.log(`Segments generated: ${segments.length}`);
console.log(`Complete journeys: ${journeys.filter(journey => journey.status === 'complete').length}`);
console.log(`Rotation candidates: ${rotationCandidates.length}`);
console.log(`Discontinuous displacements: ${validation.counts.discontinuousDisplacements}`);
console.log(`Journeys interrupted by death: ${validation.counts.journeysInterruptedByDeath}`);
console.log(`Collective movement candidates: ${collectiveMovement.length}`);
console.log(`Wrote ${OUTPUT_PARAMETERS}`);
console.log(`Wrote ${OUTPUT_METRICS}`);
console.log(`Wrote ${OUTPUT_SEGMENTS}`);
console.log(`Wrote ${OUTPUT_JOURNEYS}`);
console.log(`Wrote ${OUTPUT_ROTATIONS}`);
console.log(`Wrote ${OUTPUT_COLLECTIVE}`);
console.log(`Wrote ${OUTPUT_VALIDATION}`);

function indexSchema(schema) {
    return Object.fromEntries(schema.map((field, index) => [ field, index ]));
}

function invertDictionary(dictionary) {
    return Object.fromEntries(Object.entries(dictionary).map(([ key, value ]) => [ value, key ]));
}

function buildPlayers() {
    return heroes.map(hero => ({
        playerIndex: hero.playerIndex,
        steamId: hero.steamId,
        name: hero.name,
        team: hero.team,
        heroDisplayName: hero.heroDisplayName,
        assignedLaneRaw: hero.assignedLaneRaw ?? null
    })).sort((a, b) => a.playerIndex - b.playerIndex);
}

function buildSnapshotRows() {
    const regionBySecond = new Map(regionTimeline.snapshots.map(snapshot => [ snapshot.gameSecond, snapshot ]));

    return timeline.snapshots.map(snapshot => {
        const regionSnapshot = regionBySecond.get(snapshot.gameSecond);
        const regionRows = new Map((regionSnapshot?.rows ?? []).map(row => [ row[regionSchemaIndex.playerIndex], row ]));
        const playerRows = snapshot.playerRows.map(row => decodePlayerRow(row, regionRows.get(row[playerSchemaIndex.playerIndex])));
        const centroids = teamCentroids(playerRows);

        return {
            gameSecond: snapshot.gameSecond,
            demoTick: snapshot.demoTick,
            playerRows: playerRows.map(row => ({
                ...row,
                distanceToTeamCentroid: distance2d(row, centroids.get(row.team)),
                distanceToAlliedBase: distanceToAlliedBase(row)
            }))
        };
    });
}

function decodePlayerRow(row, regionRow) {
    const player = players.find(item => item.playerIndex === row[playerSchemaIndex.playerIndex]);
    const regionCode = regionRow?.[regionSchemaIndex.smoothRegionCode] ?? null;
    const rawRegionCode = regionRow?.[regionSchemaIndex.rawRegionCode] ?? null;
    const confidenceCode = regionRow?.[regionSchemaIndex.confidenceCode] ?? null;

    return {
        playerIndex: row[playerSchemaIndex.playerIndex],
        name: player?.name ?? null,
        team: player?.team ?? null,
        x: row[playerSchemaIndex.x],
        y: row[playerSchemaIndex.y],
        z: row[playerSchemaIndex.z],
        alive: row[playerSchemaIndex.alive],
        deaths: row[playerSchemaIndex.deaths],
        respawnTime: row[playerSchemaIndex.respawnTime],
        netWorth: row[playerSchemaIndex.netWorth],
        region: regionByCode[regionCode] ?? 'unknown',
        rawRegion: regionByCode[rawRegionCode] ?? 'unknown',
        confidence: confidenceByCode[confidenceCode] ?? 'low',
        assignedLaneRaw: regionRow?.[regionSchemaIndex.assignedLaneRaw] ?? null,
        deducedLaneRaw: regionRow?.[regionSchemaIndex.deducedLaneRaw] ?? null,
        laneDistances: {
            lane_1: regionRow?.[regionSchemaIndex.distanceLane1] ?? null,
            lane_2: regionRow?.[regionSchemaIndex.distanceLane2] ?? null,
            lane_3: regionRow?.[regionSchemaIndex.distanceLane3] ?? null
        },
        nearestAlly: regionRow?.[regionSchemaIndex.nearestAlly] ?? null,
        nearestEnemy: regionRow?.[regionSchemaIndex.nearestEnemy] ?? null,
        alliesWithin500: regionRow?.[regionSchemaIndex.alliesWithin500] ?? null,
        enemiesWithin500: regionRow?.[regionSchemaIndex.enemiesWithin500] ?? null
    };
}

function teamCentroids(rows) {
    const grouped = new Map();

    for (const row of rows) {
        if (!Number.isFinite(row.x) || !Number.isFinite(row.y) || !row.alive) {
            continue;
        }

        const group = grouped.get(row.team) ?? { x: 0, y: 0, count: 0 };
        group.x += row.x;
        group.y += row.y;
        group.count += 1;
        grouped.set(row.team, group);
    }

    return new Map(Array.from(grouped.entries()).map(([ team, group ]) => [
        team,
        { x: group.x / group.count, y: group.y / group.count }
    ]));
}

function distanceToAlliedBase(row) {
    const baseRegion = regionModel.regions.find(region => region.region === `base_team_${row.team}`);

    return distance2d(row, baseRegion?.center);
}

function buildMetrics() {
    const rows = [];
    const previousByPlayer = new Map();
    const accumulatedByPlayer = new Map();

    for (const snapshot of snapshots) {
        for (const row of snapshot.playerRows) {
            const previous = previousByPlayer.get(row.playerIndex);
            const secondDelta = previous ? Math.max(1, snapshot.gameSecond - previous.gameSecond) : null;
            const planarDistance = previous ? distance2d(row, previous) : 0;
            const distance3dValue = previous ? distance3d(row, previous) : 0;
            const speed = secondDelta ? planarDistance / secondDelta : 0;
            const direction = previous && planarDistance > 0 ? radiansToDegrees(Math.atan2(row.y - previous.y, row.x - previous.x)) : null;
            const previousDirection = previous?.direction ?? null;
            const angularChange = direction === null || previousDirection === null ? null : Math.abs(angleDifference(direction, previousDirection));
            const markers = buildMarkers(row, previous, planarDistance, speed);
            const accumulated = (accumulatedByPlayer.get(row.playerIndex) ?? 0) + (markers.includes('continuous_movement') ? planarDistance : 0);
            const nearest = nearestLane(row.laneDistances);
            const metric = {
                playerIndex: row.playerIndex,
                gameSecond: snapshot.gameSecond,
                demoTick: snapshot.demoTick,
                region: row.region,
                rawRegion: row.rawRegion,
                confidence: row.confidence,
                team: row.team,
                x: round(row.x),
                y: round(row.y),
                z: round(row.z),
                alive: row.alive,
                deaths: row.deaths,
                respawnTime: row.respawnTime,
                planarDistance: round(planarDistance),
                distance3d: round(distance3dValue),
                speed: round(speed),
                direction: round(direction),
                angularChange: round(angularChange),
                accumulatedDistance: round(accumulated),
                distanceToTeamCentroid: round(row.distanceToTeamCentroid),
                distanceToAlliedBase: round(row.distanceToAlliedBase),
                distanceLane1: row.laneDistances.lane_1,
                distanceLane2: row.laneDistances.lane_2,
                distanceLane3: row.laneDistances.lane_3,
                nearestLane: nearest.nearestLane,
                secondNearestLane: nearest.secondNearestLane,
                distanceMargin: round(nearest.distanceMargin),
                movementState: classifyMovementState(speed, markers),
                markers,
                nearestAlly: row.nearestAlly,
                nearestEnemy: row.nearestEnemy,
                alliesWithin500: row.alliesWithin500,
                enemiesWithin500: row.enemiesWithin500,
                netWorth: row.netWorth
            };

            rows.push(metric);
            previousByPlayer.set(row.playerIndex, { ...row, gameSecond: snapshot.gameSecond, direction });
            accumulatedByPlayer.set(row.playerIndex, accumulated);
        }
    }

    addSmoothedValues(rows);

    return rows;
}

function buildMarkers(row, previous, planarDistance, speed) {
    const markers = [];

    if (!previous) {
        return [ 'continuous_movement' ];
    }

    if (row.deaths > previous.deaths || previous.alive && !row.alive) {
        markers.push('death_boundary');
    }

    if (!previous.alive && row.alive) {
        markers.push('respawn_boundary');
    }

    if (planarDistance >= PARAMETERS.discontinuityDistance) {
        markers.push('position_discontinuity');
    }

    if (planarDistance >= PARAMETERS.possibleTeleportDistance) {
        markers.push('possible_teleport');
    } else if (speed >= PARAMETERS.possibleZiplineSpeed && !markers.includes('death_boundary') && !markers.includes('respawn_boundary')) {
        markers.push('possible_zipline');
    }

    if (!markers.some(marker => marker !== 'possible_zipline')) {
        markers.push('continuous_movement');
    }

    return markers;
}

function classifyMovementState(speed, markers) {
    if (markers.includes('death_boundary') || markers.includes('respawn_boundary')) {
        return 'trajectory_interruption';
    }

    if (markers.includes('position_discontinuity')) {
        return 'abnormally_large_displacement';
    }

    if (speed <= PARAMETERS.stationarySpeed) {
        return 'stationary';
    }

    if (speed <= PARAMETERS.slowMovementSpeed) {
        return 'slow_movement';
    }

    return 'continuous_movement';
}

function addSmoothedValues(rows) {
    const byPlayer = groupBy(rows, row => row.playerIndex);

    for (const playerRows of byPlayer.values()) {
        playerRows.sort((a, b) => a.gameSecond - b.gameSecond);

        for (let index = 0; index < playerRows.length; index += 1) {
            const start = Math.max(0, index - PARAMETERS.smoothingWindowSeconds + 1);
            const window = playerRows.slice(start, index + 1);
            playerRows[index].speedSmoothed5s = round(average(window.map(row => row.speed)));
            playerRows[index].distanceSmoothed5s = round(average(window.map(row => row.planarDistance)));
            playerRows[index].accelerationApprox = index === 0 ? null : round(playerRows[index].speed - playerRows[index - 1].speed);
            playerRows[index].accelerationState = Math.abs(playerRows[index].accelerationApprox ?? 0) > PARAMETERS.slowMovementSpeed ? 'apparent_acceleration' : 'no_large_acceleration';
        }
    }
}

function buildSegments(metricRows) {
    const output = [];
    const byPlayer = groupBy(metricRows, row => row.playerIndex);

    for (const [ playerIndex, playerRows ] of byPlayer.entries()) {
        playerRows.sort((a, b) => a.gameSecond - b.gameSecond);
        let current = null;

        for (const row of playerRows) {
            const type = segmentType(row, current?.lastRow);

            if (!current || !sameSegment(current, row, type)) {
                if (current) {
                    output.push(finalizeSegment(current));
                }

                current = {
                    segmentId: `seg_${output.length + 1}`,
                    playerIndex,
                    type,
                    startSecond: row.gameSecond,
                    startDemoTick: row.demoTick,
                    startRegion: row.region,
                    startPosition: position(row),
                    aliveStart: row.alive,
                    rows: [],
                    markers: new Set(),
                    lastRow: null
                };
            }

            current.rows.push(row);
            row.markers.forEach(marker => current.markers.add(marker));
            current.lastRow = row;
        }

        if (current) {
            output.push(finalizeSegment(current));
        }
    }

    return output;
}

function segmentType(row, previousRow) {
    if (!row.alive) {
        return 'death_interval';
    }

    if (row.markers.includes('respawn_boundary')) {
        return 'respawn_reentry';
    }

    if (row.markers.includes('death_boundary')) {
        return 'death_interval';
    }

    if (row.markers.includes('position_discontinuity')) {
        return 'unknown_movement';
    }

    if (!previousRow) {
        return row.speed <= PARAMETERS.stationarySpeed ? 'stationary_region_presence' : 'within_region_movement';
    }

    if (isBase(previousRow.region) && !isBase(row.region)) {
        return 'base_departure';
    }

    if (!isBase(previousRow.region) && isBase(row.region)) {
        return 'base_return';
    }

    if (previousRow.region !== row.region) {
        if (isLaneRegion(previousRow.region) && isLaneRegion(row.region) && physicalLane(previousRow.region) === physicalLane(row.region)) {
            return 'lane_longitudinal_movement';
        }

        return isRelevantRegion(row.region) ? 'region_entry' : 'inter_region_transit';
    }

    if (row.region === 'unknown') {
        return 'unknown_movement';
    }

    if (isLaneRegion(row.region) && row.speed > PARAMETERS.minMovementSpeed) {
        return 'lane_longitudinal_movement';
    }

    if (row.speed <= PARAMETERS.stationarySpeed) {
        return 'stationary_region_presence';
    }

    return 'within_region_movement';
}

function sameSegment(segment, row, type) {
    if (segment.type !== type) {
        return false;
    }

    if (row.gameSecond - segment.lastRow.gameSecond > 1) {
        return false;
    }

    if (row.markers.includes('death_boundary') || row.markers.includes('respawn_boundary')) {
        return false;
    }

    if ([ 'stationary_region_presence', 'within_region_movement', 'lane_longitudinal_movement', 'death_interval' ].includes(type)) {
        return row.region === segment.lastRow.region;
    }

    return true;
}

function finalizeSegment(segment) {
    const lastRow = segment.rows.at(-1);
    const traveled = sum(segment.rows.map(row => row.markers.includes('continuous_movement') || row.markers.includes('possible_zipline') ? row.planarDistance : 0));

    return {
        segmentId: segment.segmentId,
        playerIndex: segment.playerIndex,
        type: segment.type,
        startSecond: segment.startSecond,
        endSecond: lastRow.gameSecond,
        durationSeconds: lastRow.gameSecond - segment.startSecond + 1,
        initialRegion: segment.startRegion,
        finalRegion: lastRow.region,
        startPosition: segment.startPosition,
        endPosition: position(lastRow),
        directDistance: round(distance2d(segment.startPosition, lastRow)),
        traveledDistance: round(traveled),
        avgSpeed: round(average(segment.rows.map(row => row.speed))),
        maxSpeed: round(Math.max(...segment.rows.map(row => row.speed))),
        aliveStart: segment.aliveStart,
        aliveEnd: lastRow.alive,
        discontinuityMarkers: Array.from(segment.markers).filter(marker => marker !== 'continuous_movement'),
        confidence: segmentConfidence(segment.rows)
    };
}

function segmentConfidence(rows) {
    const minimum = Math.min(...rows.map(row => confidenceRank[row.confidence] ?? 0));

    if (minimum >= 2) {
        return 'high';
    }

    if (minimum === 1) {
        return 'medium';
    }

    return 'low';
}

function buildJourneys(metricRows, movementSegments) {
    const journeys = [];
    const intervalsByPlayer = groupBy(regionIntervals.intervals, interval => interval.playerIndex);
    const metricsByPlayer = groupBy(metricRows, row => row.playerIndex);
    const segmentsByPlayer = groupBy(movementSegments, segment => segment.playerIndex);

    for (const [ playerIndex, intervals ] of intervalsByPlayer.entries()) {
        intervals.sort((a, b) => a.startSecond - b.startSecond);
        let cursorEnd = -Infinity;

        for (let index = 0; index < intervals.length - 1; index += 1) {
            const origin = intervals[index];

            if (origin.endSecond <= cursorEnd || origin.durationSeconds < PARAMETERS.minOriginStaySeconds || !isRelevantRegion(origin.region)) {
                continue;
            }

            for (let next = index + 1; next < intervals.length; next += 1) {
                const destination = intervals[next];

                if (destination.startSecond - origin.endSecond > PARAMETERS.maxTransitSeconds) {
                    break;
                }

                if (!isRelevantRegion(destination.region) || destination.durationSeconds < PARAMETERS.minDestinationStaySeconds || destination.region === origin.region) {
                    continue;
                }

                const journeyMetrics = (metricsByPlayer.get(playerIndex) ?? []).filter(row => row.gameSecond >= origin.endSecond && row.gameSecond <= destination.startSecond);
                const journeySegments = (segmentsByPlayer.get(playerIndex) ?? []).filter(segment => segment.startSecond <= destination.startSecond && segment.endSecond >= origin.endSecond);
                const markers = unique(journeyMetrics.flatMap(row => row.markers).filter(marker => marker !== 'continuous_movement'));
                const journey = buildJourney(journeys.length + 1, playerIndex, origin, destination, intervals.slice(index + 1, next), journeyMetrics, journeySegments, markers);

                journeys.push(journey);
                cursorEnd = destination.endSecond;
                index = next - 1;
                break;
            }
        }
    }

    return journeys;
}

function buildJourney(number, playerIndex, origin, destination, intermediateIntervals, journeyMetrics, journeySegments, markers) {
    const player = players.find(item => item.playerIndex === playerIndex);
    const traveledDistance = sum(journeyMetrics.map(row => row.markers.includes('continuous_movement') || row.markers.includes('possible_zipline') ? row.planarDistance : 0));
    const startRow = journeyMetrics[0];
    const endRow = journeyMetrics.at(-1);
    const interruptedByDeath = markers.includes('death_boundary') || markers.includes('respawn_boundary');

    return {
        journeyId: `journey_${number}`,
        playerIndex,
        name: player?.name ?? null,
        team: player?.team ?? null,
        originRegion: origin.region,
        destinationRegion: destination.region,
        intermediateRegions: unique(intermediateIntervals.map(interval => interval.region)),
        startExitSecond: origin.endSecond,
        transitStartSecond: origin.endSecond + 1,
        arrivalSecond: destination.startSecond,
        destinationConfirmationSecond: Math.min(destination.endSecond, destination.startSecond + PARAMETERS.minDestinationStaySeconds - 1),
        totalSeconds: destination.endSecond - origin.startSecond + 1,
        transitSeconds: Math.max(0, destination.startSecond - origin.endSecond),
        traveledDistance: round(traveledDistance),
        directDistance: round(startRow && endRow ? distance2d(startRow, endRow) : 0),
        alliesAtDestinationOnArrival: endRow?.alliesWithin500 ?? null,
        enemiesAtDestinationOnArrival: endRow?.enemiesWithin500 ?? null,
        originConfidence: origin.confidence,
        destinationConfidence: destination.confidence,
        markers,
        segmentIds: journeySegments.map(segment => segment.segmentId),
        status: interruptedByDeath ? 'interrupted' : 'complete',
        class: journeyClass(origin.region, destination.region, intermediateIntervals, interruptedByDeath),
        rotationCandidate: false,
        betweenLanesContext: intermediateIntervals.filter(interval => interval.region === 'between_lanes').map(interval => betweenLanesContext(interval, journeyMetrics))
    };
}

function journeyClass(originRegion, destinationRegion, intermediateIntervals, interruptedByDeath) {
    if (interruptedByDeath) {
        return 'interrupted_by_death';
    }

    if (originRegion === destinationRegion) {
        return 'round_trip';
    }

    const originLane = physicalLane(originRegion);
    const destinationLane = physicalLane(destinationRegion);

    if (originLane && destinationLane) {
        return originLane === destinationLane ? 'same_lane_reposition' : 'lane_to_lane_journey';
    }

    if (originLane && isBase(destinationRegion)) {
        return 'lane_to_base';
    }

    if (isBase(originRegion) && destinationLane) {
        return 'base_to_lane';
    }

    if (originLane && isNeutral(destinationRegion)) {
        return 'lane_to_neutral';
    }

    if (isNeutral(originRegion) && destinationLane) {
        return 'neutral_to_lane';
    }

    if (isBase(originRegion) && isNeutral(destinationRegion)) {
        return 'base_to_neutral';
    }

    if (isNeutral(originRegion) && isBase(destinationRegion)) {
        return 'neutral_to_base';
    }

    if (intermediateIntervals.length > 0) {
        return 'unresolved_journey';
    }

    return 'unresolved_journey';
}

function buildRotationCandidates(journeys) {
    const candidates = [];

    for (const journey of journeys) {
        const support = [];
        const weaken = [];
        const originLane = physicalLane(journey.originRegion);
        const destinationLane = physicalLane(journey.destinationRegion);
        const laneToNeutral = originLane && isNeutral(journey.destinationRegion) || destinationLane && isNeutral(journey.originRegion);
        const differentCorridors = originLane && destinationLane && originLane !== destinationLane;

        if (!differentCorridors && !laneToNeutral) {
            weaken.push('origin_destination_not_different_corridor_or_lane_neutral');
        } else {
            support.push('origin_destination_match_allowed_rotation_condition');
        }

        if (journey.markers.some(marker => [ 'death_boundary', 'respawn_boundary', 'position_discontinuity', 'possible_teleport' ].includes(marker))) {
            weaken.push('interruption_or_discontinuity_present');
        } else {
            support.push('no_death_respawn_or_discontinuity_mid_journey');
        }

        if (confidenceRank[journey.originConfidence] >= confidenceRank[PARAMETERS.minSpatialConfidence] && confidenceRank[journey.destinationConfidence] >= confidenceRank[PARAMETERS.minSpatialConfidence]) {
            support.push('origin_destination_spatial_confidence_sufficient');
        } else {
            weaken.push('origin_or_destination_spatial_confidence_below_threshold');
        }

        if (journey.transitSeconds <= PARAMETERS.maxTransitSeconds) {
            support.push('transit_within_max_duration');
        } else {
            weaken.push('transit_exceeds_max_duration');
        }

        if (journey.destinationConfirmationSecond - journey.arrivalSecond + 1 >= PARAMETERS.minDestinationStaySeconds) {
            support.push('destination_minimum_stay_confirmed');
        } else {
            weaken.push('destination_minimum_stay_not_confirmed');
        }

        if (journey.intermediateRegions.every(region => region !== journey.originRegion)) {
            support.push('not_boundary_oscillation_by_interval_sequence');
        } else {
            weaken.push('possible_boundary_oscillation');
        }

        if (weaken.length > 0 || !support.includes('origin_destination_match_allowed_rotation_condition')) {
            continue;
        }

        candidates.push({
            candidateId: `rotation_${candidates.length + 1}`,
            journeyId: journey.journeyId,
            playerIndex: journey.playerIndex,
            name: journey.name,
            team: journey.team,
            rotationCandidate: true,
            candidateType: journey.class,
            originRegion: journey.originRegion,
            destinationRegion: journey.destinationRegion,
            originPhysicalLaneId: originLane,
            destinationPhysicalLaneId: destinationLane,
            departureSecond: journey.startExitSecond,
            arrivalSecond: journey.arrivalSecond,
            settledSecond: journey.destinationConfirmationSecond,
            travelSeconds: journey.transitSeconds,
            destinationPresenceSeconds: journey.destinationConfirmationSecond - journey.arrivalSecond + 1,
            originConfidence: journey.originConfidence,
            destinationConfidence: journey.destinationConfidence,
            rotationConfidence: support.length >= 5 ? 'high' : 'medium',
            supportingReasons: support,
            weakeningReasons: weaken,
            presenceContext: buildPresenceContext(journey)
        });
    }

    const candidateIds = new Set(candidates.map(candidate => candidate.journeyId));

    for (const journey of journeys) {
        journey.rotationCandidate = candidateIds.has(journey.journeyId);
    }

    return candidates;
}

function buildCollectiveMovement(journeys) {
    const candidates = journeys.filter(journey => journey.status === 'complete' && journey.class !== 'unresolved_journey');
    const events = [];
    const consumed = new Set();

    for (const journey of candidates) {
        if (consumed.has(journey.journeyId)) {
            continue;
        }

        const related = candidates.filter(other => other.journeyId !== journey.journeyId
            && other.team === journey.team
            && other.originRegion === journey.originRegion
            && other.destinationRegion === journey.destinationRegion
            && Math.abs(other.startExitSecond - journey.startExitSecond) <= PARAMETERS.collectiveWindowSeconds);

        if (related.length === 0) {
            continue;
        }

        const group = [ journey, ...related ];
        group.forEach(item => consumed.add(item.journeyId));

        events.push({
            eventId: `collective_${events.length + 1}`,
            class: classifyCollective(group),
            team: journey.team,
            originRegion: journey.originRegion,
            destinationRegion: journey.destinationRegion,
            departureWindow: [ Math.min(...group.map(item => item.startExitSecond)), Math.max(...group.map(item => item.startExitSecond)) ],
            arrivalWindow: [ Math.min(...group.map(item => item.arrivalSecond)), Math.max(...group.map(item => item.arrivalSecond)) ],
            playerIndexes: group.map(item => item.playerIndex).sort((a, b) => a - b),
            journeyIds: group.map(item => item.journeyId),
            evidence: [
                'two_or_more_allies_left_same_region_within_window',
                'same_destination_region',
                'individual_journeys_preserved'
            ]
        });
    }

    return events;
}

function classifyCollective(group) {
    const originLanes = unique(group.map(item => physicalLane(item.originRegion)).filter(Boolean));
    const destinationLanes = unique(group.map(item => physicalLane(item.destinationRegion)).filter(Boolean));

    if (group.length < 2) {
        return 'insufficient_evidence';
    }

    if (originLanes.length === 1 && destinationLanes.length === 1 && originLanes[0] === destinationLanes[0]) {
        return 'parallel_movement';
    }

    if (originLanes.length > 1 && destinationLanes.length === 1) {
        return 'converging_movement';
    }

    if (originLanes.length === 1 && destinationLanes.length > 1) {
        return 'diverging_movement';
    }

    return 'coordinated_movement_candidate';
}

function buildPresenceContext(journey) {
    const seconds = [
        journey.startExitSecond - 10,
        journey.startExitSecond,
        Math.floor((journey.startExitSecond + journey.arrivalSecond) / 2),
        journey.arrivalSecond,
        journey.arrivalSecond + 10
    ];

    return seconds.map((second, index) => {
        const snapshot = closestDistribution(second);
        const playerRow = closestMetric(journey.playerIndex, second);

        return {
            label: [ '10s_before_departure', 'departure', 'mid_transit', 'arrival', '10s_after_arrival' ][index],
            requestedSecond: second,
            observedSecond: snapshot?.gameSecond ?? null,
            playerRegion: playerRow?.region ?? null,
            playerAlive: playerRow?.alive ?? null,
            origin: regionDistribution(snapshot, journey.originRegion),
            destination: regionDistribution(snapshot, journey.destinationRegion),
            globalDistributionByTeam: snapshot?.globalDistributionByTeam ?? null
        };
    });
}

function closestDistribution(second) {
    return closestBySecond(teamDistribution.snapshots, second);
}

function closestMetric(playerIndex, second) {
    return closestBySecond(metrics.filter(row => row.playerIndex === playerIndex), second);
}

function closestBySecond(rows, second) {
    let best = null;

    for (const row of rows) {
        if (!best || Math.abs(row.gameSecond - second) < Math.abs(best.gameSecond - second)) {
            best = row;
        }
    }

    return best;
}

function regionDistribution(snapshot, regionName) {
    if (!snapshot) {
        return null;
    }

    const code = teamDistribution.regionDictionary[regionName];
    const row = snapshot.regions.find(item => item[0] === code);

    if (!row) {
        return {
            region: regionName,
            team2Players: [],
            team3Players: [],
            team2NetWorth: 0,
            team3NetWorth: 0
        };
    }

    return {
        region: regionName,
        team2Players: row[1],
        team3Players: row[2],
        team2NetWorth: row[4],
        team3NetWorth: row[5],
        team2Alive: row[6],
        team3Alive: row[7]
    };
}

function betweenLanesContext(interval, journeyMetrics) {
    const rows = journeyMetrics.filter(row => row.gameSecond >= interval.startSecond && row.gameSecond <= interval.endSecond);
    const representative = rows[Math.floor(rows.length / 2)] ?? null;

    return {
        startSecond: interval.startSecond,
        endSecond: interval.endSecond,
        durationSeconds: interval.durationSeconds,
        previousLaneDistance: rows[0] ? nearestLaneDistance(rows[0]) : null,
        nextLaneDistance: rows.at(-1) ? nearestLaneDistance(rows.at(-1)) : null,
        nearestLane: representative?.nearestLane ?? null,
        secondNearestLane: representative?.secondNearestLane ?? null,
        distanceMargin: representative?.distanceMargin ?? null
    };
}

function buildParameterOutput() {
    return {
        parameters: PARAMETERS,
        sourceFiles: [
            TIMELINE_FILE,
            HERO_FILE,
            REGION_MODEL_FILE,
            REGION_TIMELINE_FILE,
            REGION_INTERVALS_FILE,
            REGION_TRANSITIONS_FILE,
            TEAM_DISTRIBUTION_FILE,
            SPATIAL_VALIDATION_FILE
        ],
        sourceSummary: {
            canonicalSnapshots: timeline.snapshots.length,
            regionIntervals: regionIntervals.intervals.length,
            regionTransitionEvents: regionTransitions.events.length,
            spatialValidationKnownRegionPercent: spatialValidation.quality?.knownRegionPercent ?? null
        },
        forbiddenInferences: [
            'good_bad_rotation',
            'gank',
            'split_push',
            'objective_rotation',
            'late_rotation',
            'strategic_intent'
        ]
    };
}

function buildCompactMetrics(metricRows) {
    const schema = [
        'playerIndex',
        'gameSecond',
        'demoTick',
        'region',
        'rawRegion',
        'confidence',
        'team',
        'x',
        'y',
        'z',
        'alive',
        'deaths',
        'respawnTime',
        'planarDistance',
        'distance3d',
        'speed',
        'speedSmoothed5s',
        'direction',
        'angularChange',
        'accelerationApprox',
        'accelerationState',
        'accumulatedDistance',
        'distanceToTeamCentroid',
        'distanceToAlliedBase',
        'distanceLane1',
        'distanceLane2',
        'distanceLane3',
        'nearestLane',
        'secondNearestLane',
        'distanceMargin',
        'movementState',
        'markers',
        'nearestAlly',
        'nearestEnemy',
        'alliesWithin500',
        'enemiesWithin500',
        'netWorth'
    ];

    return {
        parameters: PARAMETERS,
        schema,
        rows: metricRows.map(row => schema.map(field => row[field]))
    };
}

function buildValidation(metricRows, movementSegments, journeyRows, rotations, collective) {
    const segmentDeathCrossings = movementSegments.filter(segment => ![ 'death_interval', 'respawn_reentry' ].includes(segment.type)
        && segment.discontinuityMarkers.some(marker => [ 'death_boundary', 'respawn_boundary' ].includes(marker)));
    const rotationUnknowns = rotations.filter(candidate => [ candidate.originRegion, candidate.destinationRegion ].includes('unknown'));
    const rotationBetweenLanesDestination = rotations.filter(candidate => candidate.destinationRegion === 'between_lanes');
    const shortDestinationRotations = rotations.filter(candidate => candidate.destinationPresenceSeconds < PARAMETERS.minDestinationStaySeconds);
    const distanceViolations = movementSegments.filter(segment => segment.traveledDistance + PARAMETERS.directDistanceTolerance < segment.directDistance);
    const overlappingJourneys = findOverlappingJourneys(journeyRows);
    const collectiveMissingJourneys = collective.filter(event => event.journeyIds.some(id => !journeyRows.some(journey => journey.journeyId === id)));
    const strategicTerms = forbiddenStrategicTerms([ movementSegments, journeyRows, rotations, collective ]);
    const discontinuousAsContinuous = movementSegments.filter(segment => segment.discontinuityMarkers.includes('position_discontinuity')
        && segment.type !== 'unknown_movement');

    return {
        generatedAt: new Date().toISOString(),
        counts: {
            metricsRows: metricRows.length,
            segments: movementSegments.length,
            completeJourneys: journeyRows.filter(journey => journey.status === 'complete').length,
            rotationCandidates: rotations.length,
            discontinuousDisplacements: metricRows.filter(row => row.markers.includes('position_discontinuity')).length,
            journeysInterruptedByDeath: journeyRows.filter(journey => journey.status === 'interrupted').length,
            collectiveMovementCandidates: collective.length
        },
        checks: {
            noSegmentCrossesDeathRespawnAsContinuous: segmentDeathCrossings.length === 0,
            noRotationCandidateWithUnknownEndpoint: rotationUnknowns.length === 0,
            boundaryOscillationsDoNotGenerateRotations: rotations.every(candidate => !candidate.weakeningReasons.includes('possible_boundary_oscillation')),
            destinationRequiresMinimumStay: shortDestinationRotations.length === 0,
            traveledDistanceAtLeastDirectDistance: distanceViolations.length === 0,
            noOverlappingJourneysForPlayer: overlappingJourneys.length === 0,
            collectiveEventsPreserveIndividualJourneys: collectiveMissingJourneys.length === 0,
            betweenLanesNotAutomaticDestination: rotationBetweenLanesDestination.length === 0,
            discontinuousDisplacementsMarkedAndNotWalking: discontinuousAsContinuous.length === 0,
            noStrategicInferenceTerms: strategicTerms.length === 0
        },
        issues: {
            segmentDeathCrossings,
            rotationUnknowns,
            rotationBetweenLanesDestination,
            shortDestinationRotations,
            distanceViolations: distanceViolations.slice(0, 25),
            overlappingJourneys,
            collectiveMissingJourneys,
            discontinuousAsContinuous,
            strategicTerms
        },
        likelyFalsePositives: [
            'same compact map geometry makes lane axes close together, so between_lanes journeys may over-collapse distinct corridors',
            'possible_zipline is only a displacement marker and not a mode confirmation',
            'journey grouping is interval-based and may miss intentless short path corrections inside dense regions'
        ],
        readiness: {
            candidatesReadyForLaterStrategicValidation: rotations.length > 0 && strategicTerms.length === 0,
            note: 'Rotation candidates are descriptive spatial journeys only; they are not strategic evaluations.'
        }
    };
}

function findOverlappingJourneys(journeyRows) {
    const overlaps = [];
    const byPlayer = groupBy(journeyRows, journey => journey.playerIndex);

    for (const playerJourneys of byPlayer.values()) {
        playerJourneys.sort((a, b) => a.startExitSecond - b.startExitSecond);

        for (let index = 1; index < playerJourneys.length; index += 1) {
            if (playerJourneys[index].startExitSecond <= playerJourneys[index - 1].arrivalSecond) {
                overlaps.push({
                    playerIndex: playerJourneys[index].playerIndex,
                    previousJourneyId: playerJourneys[index - 1].journeyId,
                    journeyId: playerJourneys[index].journeyId
                });
            }
        }
    }

    return overlaps;
}

function forbiddenStrategicTerms(objects) {
    const forbidden = [ 'good_rotation', 'bad_rotation', 'gank', 'split_push', 'objective_rotation', 'late_rotation' ];
    const text = JSON.stringify(objects);

    return forbidden.filter(term => text.includes(term));
}

function isRelevantRegion(region) {
    return region !== 'unknown' && region !== 'between_lanes';
}

function isBase(region) {
    return /^base_team_[23]$/.test(region);
}

function isNeutral(region) {
    return region === 'neutral_center';
}

function isLaneRegion(region) {
    return /^lane_\d+_/.test(region);
}

function physicalLane(region) {
    return region?.match(/^(lane_\d+)_/)?.[1] ?? null;
}

function nearestLane(laneDistances) {
    const sorted = Object.entries(laneDistances)
        .filter(([ , value ]) => Number.isFinite(value))
        .sort((a, b) => a[1] - b[1]);

    return {
        nearestLane: sorted[0]?.[0] ?? null,
        secondNearestLane: sorted[1]?.[0] ?? null,
        distanceMargin: sorted.length > 1 ? sorted[1][1] - sorted[0][1] : null
    };
}

function nearestLaneDistance(row) {
    const distances = [ row.distanceLane1, row.distanceLane2, row.distanceLane3 ].filter(Number.isFinite);

    return distances.length > 0 ? Math.min(...distances) : null;
}

function groupBy(rows, keyFn) {
    const groups = new Map();

    for (const row of rows) {
        const key = keyFn(row);
        const group = groups.get(key) ?? [];
        group.push(row);
        groups.set(key, group);
    }

    return groups;
}

function unique(values) {
    return Array.from(new Set(values));
}

function position(row) {
    return { x: row.x, y: row.y, z: row.z };
}

function distance2d(a, b) {
    if (!a || !b || !Number.isFinite(a.x) || !Number.isFinite(a.y) || !Number.isFinite(b.x) || !Number.isFinite(b.y)) {
        return null;
    }

    return Math.hypot(a.x - b.x, a.y - b.y);
}

function distance3d(a, b) {
    if (!a || !b || !Number.isFinite(a.x) || !Number.isFinite(a.y) || !Number.isFinite(a.z) || !Number.isFinite(b.x) || !Number.isFinite(b.y) || !Number.isFinite(b.z)) {
        return null;
    }

    return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function radiansToDegrees(radians) {
    return radians * 180 / Math.PI;
}

function angleDifference(a, b) {
    return ((a - b + 540) % 360) - 180;
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

async function writeJson(file, value) {
    await writeFile(file, `${JSON.stringify(value)}\n`);
}

async function validateOutputs() {
    const files = [
        OUTPUT_PARAMETERS,
        OUTPUT_METRICS,
        OUTPUT_SEGMENTS,
        OUTPUT_JOURNEYS,
        OUTPUT_ROTATIONS,
        OUTPUT_COLLECTIVE,
        OUTPUT_VALIDATION
    ];

    for (const file of files) {
        JSON.parse(await readFile(file, 'utf8'));
        const size = (await stat(file)).size;

        if (size > OUTPUT_SIZE_LIMIT) {
            throw new Error(`${file} is ${size} bytes, above the ${OUTPUT_SIZE_LIMIT} byte limit`);
        }
    }
}
