import { readFile, stat, writeFile } from 'node:fs/promises';

const TIMELINE_FILE = './output/09-canonical-player-timeline.json';
const HERO_FILE = './output/13-canonical-hero-enrichment.json';
const REGION_MODEL_FILE = './output/17-spatial-region-model.json';
const REGION_TIMELINE_FILE = './output/17-player-region-timeline.json';
const REGION_INTERVALS_FILE = './output/17-player-region-intervals.json';
const MOVEMENT_PARAMETERS_FILE = './output/18-movement-parameters.json';
const MOVEMENT_METRICS_FILE = './output/18-player-movement-metrics.json';
const MOVEMENT_SEGMENTS_FILE = './output/18-movement-segments.json';
const REGION_JOURNEYS_FILE = './output/18-region-journeys.json';
const BETWEEN_ANALYSIS_FILE = './output/19-between-lanes-analysis.json';
const FUNNEL_19_FILE = './output/19-rotation-funnel.json';
const SENSITIVITY_19_FILE = './output/19-parameter-sensitivity.json';
const NEAR_MISS_19_FILE = './output/19-near-miss-journeys.json';
const MANUAL_REVIEW_19_FILE = './output/19-manual-review-cases.json';
const CALIBRATION_19_FILE = './output/19-rotation-calibration-review.json';
const OUTPUT_PARAMETERS = './output/20-destination-resolution-parameters.json';
const OUTPUT_RESOLUTION = './output/20-journey-destination-resolution.json';
const OUTPUT_CHAINS = './output/20-fragmented-journey-chains.json';
const OUTPUT_FUNNEL = './output/20-revised-rotation-funnel.json';
const OUTPUT_CANDIDATES = './output/20-resolved-rotation-candidates.json';
const OUTPUT_COLLECTIVE = './output/20-resolved-collective-movement.json';
const OUTPUT_VALIDATION = './output/20-destination-resolution-validation.json';
const OUTPUT_SIZE_LIMIT = 10 * 1024 * 1024;

const PARAMETERS = {
    postJourneyWindowSeconds: 20,
    postJourneyMaxTestedSeconds: 30,
    nearestLaneConsecutiveSeconds: 3,
    laneDistanceThreshold: 360,
    distanceMarginThreshold: 75,
    arrivalMinimumScore: 5,
    briefPresenceSeconds: 1,
    shortPresenceSeconds: 5,
    stablePresenceSeconds: 8,
    chainFragmentationSeconds: 10,
    collectiveArrivalWindowSeconds: 10,
    collectiveProximityDistance: 1200,
    scoreWeights: {
        enteredLaneRegion: 3,
        nearestLaneConsecutive: 2,
        distanceBelowThreshold: 2,
        marginAboveThreshold: 1,
        deducedLaneConcordant: 1,
        directionConsistent: 1,
        noBoundaryOscillation: 1
    },
    justifications: {
        postJourneyWindowSeconds: 'Experiment 19 showed post-extension as the most sensitive parameter; 20s gives confirmation without using the full tested maximum by default.',
        nearestLaneConsecutiveSeconds: 'Prevents one isolated second from confirming arrival.',
        laneDistanceThreshold: 'Keeps the lane proximity threshold aligned with experiment 17.',
        stablePresenceSeconds: 'Matches experiment 18 destination stay while preserving brief and short presence separately.',
        chainFragmentationSeconds: 'Detects likely split journeys without merging original records.'
    }
};
const CONFIDENCE_RANK = { insufficient: -1, low: 0, medium: 1, high: 2 };
const LANE_CODES = { lane_1: 1, lane_2: 4, lane_3: 6 };

const timeline = JSON.parse(await readFile(TIMELINE_FILE, 'utf8'));
const heroes = JSON.parse(await readFile(HERO_FILE, 'utf8'));
const regionModel = JSON.parse(await readFile(REGION_MODEL_FILE, 'utf8'));
const regionTimeline = JSON.parse(await readFile(REGION_TIMELINE_FILE, 'utf8'));
const regionIntervals = JSON.parse(await readFile(REGION_INTERVALS_FILE, 'utf8'));
const movementParameters = JSON.parse(await readFile(MOVEMENT_PARAMETERS_FILE, 'utf8')).parameters;
const movementMetrics = JSON.parse(await readFile(MOVEMENT_METRICS_FILE, 'utf8'));
const movementSegments = JSON.parse(await readFile(MOVEMENT_SEGMENTS_FILE, 'utf8'));
const regionJourneys = JSON.parse(await readFile(REGION_JOURNEYS_FILE, 'utf8'));
const betweenAnalysis = JSON.parse(await readFile(BETWEEN_ANALYSIS_FILE, 'utf8'));
const funnel19 = JSON.parse(await readFile(FUNNEL_19_FILE, 'utf8'));
const sensitivity19 = JSON.parse(await readFile(SENSITIVITY_19_FILE, 'utf8'));
const nearMiss19 = JSON.parse(await readFile(NEAR_MISS_19_FILE, 'utf8'));
const manualReview19 = JSON.parse(await readFile(MANUAL_REVIEW_19_FILE, 'utf8'));
const calibration19 = JSON.parse(await readFile(CALIBRATION_19_FILE, 'utf8'));

const metrics = decodeMetrics();
const deducedByKey = decodeDeducedLaneMap();
const journeys = regionJourneys.journeys.filter(journey => journey.status === 'complete');
const metricsByPlayer = groupBy(metrics, row => row.playerIndex);
const journeysByPlayer = groupBy(regionJourneys.journeys, journey => journey.playerIndex);
const intervalsByPlayer = groupBy(regionIntervals.intervals, interval => interval.playerIndex);
const heroesByPlayer = new Map(heroes.map(hero => [ hero.playerIndex, hero ]));
const resolutions = buildDestinationResolutions();
const chains = buildFragmentedChains();
const revisedFunnel = buildRevisedFunnel();
const resolvedCandidates = buildResolvedCandidates();
const resolvedCollective = buildResolvedCollectiveMovement();
const validation = buildValidation();

await writeJson(OUTPUT_PARAMETERS, buildParameterOutput());
await writeJson(OUTPUT_RESOLUTION, { parameters: PARAMETERS, resolutions });
await writeJson(OUTPUT_CHAINS, chains);
await writeJson(OUTPUT_FUNNEL, revisedFunnel);
await writeJson(OUTPUT_CANDIDATES, resolvedCandidates);
await writeJson(OUTPUT_COLLECTIVE, resolvedCollective);
await writeJson(OUTPUT_VALIDATION, validation);
await validateOutputs();

console.log(`Journeys processed: ${resolutions.length}`);
console.log(`Destinations confirmed: ${validation.summary.destinationsConfirmed}`);
console.log(`Arrivals without stable presence: ${validation.summary.arrivalsWithoutStablePresence}`);
console.log(`Funnel A/B/C/D: ${revisedFunnel.summary.levelA}/${revisedFunnel.summary.levelB}/${revisedFunnel.summary.levelC}/${revisedFunnel.summary.levelD}`);
console.log(`Fragmented chains: ${chains.summary.totalChains}`);
console.log(`Returned to origin: ${validation.summary.returnedToOrigin}`);
console.log(`Ambiguous destinations: ${validation.summary.ambiguousDestinations}`);
console.log(`Collective movements: ${resolvedCollective.summary.totalEvents}`);
console.log(`Wrote ${OUTPUT_PARAMETERS}`);
console.log(`Wrote ${OUTPUT_RESOLUTION}`);
console.log(`Wrote ${OUTPUT_CHAINS}`);
console.log(`Wrote ${OUTPUT_FUNNEL}`);
console.log(`Wrote ${OUTPUT_CANDIDATES}`);
console.log(`Wrote ${OUTPUT_COLLECTIVE}`);
console.log(`Wrote ${OUTPUT_VALIDATION}`);

function decodeMetrics() {
    return movementMetrics.rows.map(row => {
        const decoded = Object.fromEntries(movementMetrics.schema.map((field, index) => [ field, row[index] ]));
        decoded.markers = decoded.markers ?? [];
        return decoded;
    });
}

function decodeDeducedLaneMap() {
    const index = Object.fromEntries(regionTimeline.schema.map((field, column) => [ field, column ]));
    const map = new Map();

    for (const snapshot of regionTimeline.snapshots) {
        for (const row of snapshot.rows) {
            map.set(`${row[index.playerIndex]}:${snapshot.gameSecond}`, row[index.deducedLaneRaw] ?? null);
        }
    }

    return map;
}

function buildDestinationResolutions() {
    return journeys.map(journey => {
        const origin = normalizeOrigin(journey);
        const window = buildPostJourneyWindow(journey, origin);
        const candidates = buildDestinationCandidates(journey, origin, window.rows);
        const bestCandidate = candidates.lanes.sort((a, b) => b.arrivalEvidenceScore - a.arrivalEvidenceScore || b.presence.stablePresenceSeconds - a.presence.stablePresenceSeconds)[0] ?? null;
        const resolution = resolveState(journey, origin, window, bestCandidate, candidates);
        const confidences = buildConfidences(origin, window, bestCandidate, resolution);

        return {
            journeyId: journey.journeyId,
            playerIndex: journey.playerIndex,
            player: journey.name,
            hero: heroesByPlayer.get(journey.playerIndex)?.heroDisplayName ?? null,
            originalJourney: {
                originRegion: journey.originRegion,
                destinationRegion: journey.destinationRegion,
                journeyStartSecond: journey.startExitSecond,
                journeyEndSecond: journey.arrivalSecond,
                destinationConfirmationSecond: journey.destinationConfirmationSecond,
                transitSeconds: journey.transitSeconds,
                class: journey.class,
                markers: journey.markers,
                intermediateRegions: journey.intermediateRegions
            },
            normalizedOrigin: origin,
            postJourneyEvidence: {
                windowStartSecond: window.startSecond,
                windowEndSecond: window.endSecond,
                stoppedBecause: window.stoppedBecause,
                intervals: compactWindowRows(window.rows)
            },
            candidates,
            resolutionState: resolution.state,
            resolvedDestination: resolution.destination,
            arrivalSecond: resolution.arrivalSecond,
            presence: resolution.presence,
            scores: {
                arrivalEvidenceScore: bestCandidate?.arrivalEvidenceScore ?? 0,
                arrivalEvidenceComponents: bestCandidate?.arrivalEvidenceComponents ?? []
            },
            confidence: confidences,
            level: resolution.level,
            favorableEvidence: resolution.favorableEvidence,
            contraryEvidence: resolution.contraryEvidence,
            temporalConflict: window.temporalConflict
        };
    });
}

function normalizeOrigin(journey) {
    const originRows = playerRows(journey.playerIndex, journey.startExitSecond - movementParameters.minOriginStaySeconds, journey.startExitSecond);
    const first = originRows[0] ?? metricAt(journey.playerIndex, journey.startExitSecond);
    const previousInterval = previousIntervalBefore(journey);
    const regionLane = physicalLane(journey.originRegion);
    const nearestCounts = countBy(originRows, row => row.nearestLane ?? 'unknown');
    const nearestMode = topCount(nearestCounts)?.key ?? null;
    const stableSeconds = originRows.filter(row => row.region === journey.originRegion || row.nearestLane === regionLane).length;
    const originPhysicalLaneId = regionLane ?? (stableSeconds >= PARAMETERS.nearestLaneConsecutiveSeconds && nearestMode !== 'unknown' ? nearestMode : null);

    return {
        originRegion: journey.originRegion,
        originPhysicalLaneId,
        originLaneConfidence: confidenceFromEvidence(stableSeconds, movementParameters.minOriginStaySeconds, Boolean(regionLane)),
        originStableSeconds: stableSeconds,
        initialLaneDistances: first ? {
            lane_1: first.distanceLane1,
            lane_2: first.distanceLane2,
            lane_3: first.distanceLane3
        } : null,
        originSource: {
            smoothRegion: journey.originRegion,
            rawRegion: first?.rawRegion ?? null,
            nearestLane: nearestMode,
            previousInterval: previousInterval ? {
                region: previousInterval.region,
                startSecond: previousInterval.startSecond,
                endSecond: previousInterval.endSecond
            } : null
        }
    };
}

function buildPostJourneyWindow(journey, origin) {
    const startSecond = journey.arrivalSecond + 1;
    const hardEnd = Math.min(timeline.snapshots.at(-1).gameSecond, journey.arrivalSecond + PARAMETERS.postJourneyMaxTestedSeconds);
    const nextJourney = nextJourneyAfter(journey);
    const rows = [];
    let stoppedBecause = 'window_exhausted';
    let temporalConflict = null;

    for (let second = startSecond; second <= hardEnd; second += 1) {
        if (nextJourney && second >= nextJourney.startExitSecond) {
            stoppedBecause = 'new_journey';
            temporalConflict = {
                type: 'new_journey_started',
                journeyId: nextJourney.journeyId,
                second: nextJourney.startExitSecond,
                possibleFragmentedJourneyChain: possibleChain(journey, nextJourney)
            };
            break;
        }

        const row = metricAt(journey.playerIndex, second);

        if (!row) {
            stoppedBecause = 'position_absent';
            break;
        }

        rows.push(enrichWindowRow(row));

        if (row.markers.some(marker => [ 'death_boundary', 'respawn_boundary' ].includes(marker))) {
            stoppedBecause = row.markers.includes('death_boundary') ? 'death' : 'respawn';
            break;
        }

        if (origin.originPhysicalLaneId && stableReturnToOrigin(rows, origin.originPhysicalLaneId)) {
            stoppedBecause = 'returned_to_origin';
            break;
        }

        if (rows.length >= PARAMETERS.postJourneyWindowSeconds && confirmedDestinationInRows(rows, origin.originPhysicalLaneId)) {
            stoppedBecause = 'destination_confirmed';
            break;
        }
    }

    return { startSecond, endSecond: rows.at(-1)?.gameSecond ?? startSecond - 1, rows, stoppedBecause, temporalConflict };
}

function enrichWindowRow(row) {
    return {
        ...row,
        deducedLaneRaw: deducedByKey.get(`${row.playerIndex}:${row.gameSecond}`) ?? null
    };
}

function buildDestinationCandidates(journey, origin, rows) {
    const lanes = Object.keys(LANE_CODES)
        .filter(lane => lane !== origin.originPhysicalLaneId)
        .map(lane => buildLaneCandidate(journey, origin, rows, lane));
    const neutralRows = rows.filter(row => row.region === 'neutral_center');
    const originRows = rows.filter(row => row.nearestLane === origin.originPhysicalLaneId || physicalLane(row.region) === origin.originPhysicalLaneId);

    return {
        lanes,
        alliedBase: buildBaseCandidate(rows, `base_team_${journey.team}`),
        enemyBase: buildBaseCandidate(rows, journey.team === 2 ? 'base_team_3' : 'base_team_2'),
        neutralCenter: {
            seconds: neutralRows.length,
            firstSecond: neutralRows[0]?.gameSecond ?? null,
            persistent: neutralRows.length >= PARAMETERS.shortPresenceSeconds
        },
        persistentNeutralPresence: rows.filter(row => row.region === 'between_lanes').length >= PARAMETERS.shortPresenceSeconds,
        returnToOrigin: {
            seconds: originRows.length,
            stable: maxConsecutive(originRows.map(row => row.gameSecond)) >= PARAMETERS.stablePresenceSeconds
        }
    };
}

function buildLaneCandidate(journey, origin, rows, lane) {
    const nearestRows = rows.filter(row => row.nearestLane === lane);
    const regionRows = rows.filter(row => physicalLane(row.region) === lane);
    const withinRows = rows.filter(row => laneDistance(row, lane) !== null && laneDistance(row, lane) <= PARAMETERS.laneDistanceThreshold);
    const deducedRows = rows.filter(row => row.deducedLaneRaw === LANE_CODES[lane]);
    const marginRows = rows.filter(row => row.nearestLane === lane && row.distanceMargin >= PARAMETERS.distanceMarginThreshold);
    const firstArrivalSecond = minFinite([ nearestRows[0]?.gameSecond, regionRows[0]?.gameSecond, withinRows[0]?.gameSecond ]);
    const presence = buildPresence(rows, lane, firstArrivalSecond);
    const components = [];

    addComponent(components, 'entered_lane_region', regionRows.length > 0, PARAMETERS.scoreWeights.enteredLaneRegion, regionRows[0]?.gameSecond ?? null);
    addComponent(components, 'nearest_lane_consecutive', maxConsecutive(nearestRows.map(row => row.gameSecond)) >= PARAMETERS.nearestLaneConsecutiveSeconds, PARAMETERS.scoreWeights.nearestLaneConsecutive, maxConsecutive(nearestRows.map(row => row.gameSecond)));
    addComponent(components, 'distance_below_threshold', withinRows.length >= PARAMETERS.nearestLaneConsecutiveSeconds, PARAMETERS.scoreWeights.distanceBelowThreshold, withinRows.length);
    addComponent(components, 'distance_margin_above_threshold', marginRows.length >= PARAMETERS.nearestLaneConsecutiveSeconds, PARAMETERS.scoreWeights.marginAboveThreshold, marginRows.length);
    addComponent(components, 'deduced_lane_concordant', deducedRows.length > 0, PARAMETERS.scoreWeights.deducedLaneConcordant, deducedRows.length);
    addComponent(components, 'direction_consistent', directionConsistent(journey, rows, lane), PARAMETERS.scoreWeights.directionConsistent, lane);
    addComponent(components, 'no_boundary_oscillation', !boundaryOscillation(rows, origin.originPhysicalLaneId, lane), PARAMETERS.scoreWeights.noBoundaryOscillation, null);

    return {
        physicalLaneId: lane,
        firstNearestLaneSecond: nearestRows[0]?.gameSecond ?? null,
        firstLaneRegionSecond: regionRows[0]?.gameSecond ?? null,
        firstArrivalSecond,
        consecutiveNearestLaneSeconds: maxConsecutive(nearestRows.map(row => row.gameSecond)),
        accumulatedNearestLaneSeconds: nearestRows.length,
        consecutiveWithinThresholdSeconds: maxConsecutive(withinRows.map(row => row.gameSecond)),
        minDistanceToAxis: minFinite(rows.map(row => laneDistance(row, lane))),
        averageDistanceToAxis: round(average(rows.map(row => laneDistance(row, lane)))),
        maxDistanceMargin: maxFinite(rows.filter(row => row.nearestLane === lane).map(row => row.distanceMargin)),
        deducedLaneConcordanceSeconds: deducedRows.length,
        directionConsistent: directionConsistent(journey, rows, lane),
        presence,
        arrivalEvidenceScore: sum(components.map(component => component.satisfied ? component.weight : 0)),
        arrivalEvidenceComponents: components
    };
}

function buildBaseCandidate(rows, region) {
    const baseRows = rows.filter(row => row.region === region);

    return {
        region,
        seconds: baseRows.length,
        firstSecond: baseRows[0]?.gameSecond ?? null,
        persistent: baseRows.length >= PARAMETERS.shortPresenceSeconds
    };
}

function addComponent(components, name, satisfied, weight, observed) {
    components.push({ name, satisfied, weight, observed });
}

function buildPresence(rows, lane, arrivalSecond) {
    const afterArrival = arrivalSecond === null ? [] : rows.filter(row => row.gameSecond >= arrivalSecond);
    const presentRows = afterArrival.filter(row => row.nearestLane === lane || physicalLane(row.region) === lane || laneDistance(row, lane) <= PARAMETERS.laneDistanceThreshold);
    const regionRows = afterArrival.filter(row => physicalLane(row.region) === lane);
    const nearestRows = afterArrival.filter(row => row.nearestLane === lane);
    const withinRows = afterArrival.filter(row => laneDistance(row, lane) <= PARAMETERS.laneDistanceThreshold);
    const consecutivePresence = maxConsecutive(presentRows.map(row => row.gameSecond));
    const level = consecutivePresence >= PARAMETERS.stablePresenceSeconds ? 'stable_presence'
        : consecutivePresence >= PARAMETERS.shortPresenceSeconds ? 'short_presence'
            : consecutivePresence >= PARAMETERS.briefPresenceSeconds ? 'brief_arrival'
                : 'none';
    const arrivalTen = afterArrival.filter(row => row.gameSecond < arrivalSecond + 10);
    const arrivalTwenty = afterArrival.filter(row => row.gameSecond < arrivalSecond + 20);
    const arrivalThirty = afterArrival.filter(row => row.gameSecond < arrivalSecond + 30);

    return {
        level,
        consecutivePresenceSeconds: consecutivePresence,
        accumulatedPresence10s: arrivalTen.filter(row => presentRows.includes(row)).length,
        accumulatedPresence20s: arrivalTwenty.filter(row => presentRows.includes(row)).length,
        accumulatedPresence30s: arrivalThirty.filter(row => presentRows.includes(row)).length,
        timeWithinLaneThreshold: withinRows.length,
        timeAsNearestLane: nearestRows.length,
        timeInLaneRegion: regionRows.length,
        alliesAtArrival: afterArrival[0]?.alliesWithin500 ?? null,
        enemiesAtArrival: afterArrival[0]?.enemiesWithin500 ?? null,
        movedOutOfDestination: presentRows.length > 0 && afterArrival.slice(afterArrival.indexOf(presentRows.at(-1)) + 1).some(row => row.nearestLane !== lane && physicalLane(row.region) !== lane),
        stablePresenceSeconds: consecutivePresence
    };
}

function resolveState(journey, origin, window, bestCandidate, candidates) {
    const favorableEvidence = bestCandidate?.arrivalEvidenceComponents.filter(component => component.satisfied).map(component => component.name) ?? [];
    const contraryEvidence = bestCandidate?.arrivalEvidenceComponents.filter(component => !component.satisfied).map(component => component.name) ?? [];
    const bestScore = bestCandidate?.arrivalEvidenceScore ?? 0;
    const hasArrival = bestCandidate && bestScore >= PARAMETERS.arrivalMinimumScore && bestCandidate.firstArrivalSecond !== null;
    const stablePresence = bestCandidate?.presence.level === 'stable_presence';
    const shortOrStable = [ 'short_presence', 'stable_presence' ].includes(bestCandidate?.presence.level);

    if (window.stoppedBecause === 'death') {
        return state('interrupted_by_death', null, null, null, 'none', favorableEvidence, [ ...contraryEvidence, 'death_in_confirmation_window' ]);
    }

    if (window.stoppedBecause === 'new_journey' && !hasArrival) {
        return state('interrupted_by_new_journey', null, null, null, 'none', favorableEvidence, [ ...contraryEvidence, 'new_journey_before_arrival_confirmation' ]);
    }

    if (candidates.returnToOrigin.stable && !hasArrival) {
        return state('returned_to_origin', origin.originPhysicalLaneId, null, null, 'none', favorableEvidence, [ ...contraryEvidence, 'stable_return_to_origin' ]);
    }

    if (candidates.neutralCenter.persistent) {
        return state('neutral_destination', 'neutral_center', candidates.neutralCenter.firstSecond, null, 'none', [ ...favorableEvidence, 'neutral_center_persistent' ], contraryEvidence);
    }

    if (hasArrival && stablePresence) {
        return state('destination_confirmed', bestCandidate.physicalLaneId, bestCandidate.firstArrivalSecond, bestCandidate.presence, 'D', favorableEvidence, contraryEvidence);
    }

    if (hasArrival && shortOrStable) {
        return state('destination_confirmed', bestCandidate.physicalLaneId, bestCandidate.firstArrivalSecond, bestCandidate.presence, 'C', favorableEvidence, contraryEvidence);
    }

    if (hasArrival) {
        return state('arrival_confirmed_presence_insufficient', bestCandidate.physicalLaneId, bestCandidate.firstArrivalSecond, bestCandidate.presence, 'B', favorableEvidence, contraryEvidence);
    }

    if (bestCandidate && bestCandidate.accumulatedNearestLaneSeconds > 0) {
        return state('cross_lane_displacement_only', bestCandidate.physicalLaneId, bestCandidate.firstNearestLaneSecond, bestCandidate.presence, 'A', favorableEvidence, contraryEvidence);
    }

    if (ambiguousCandidates(candidates.lanes)) {
        return state('ambiguous_destination', null, null, null, 'none', favorableEvidence, [ ...contraryEvidence, 'multiple_similar_destination_candidates' ]);
    }

    return state('unresolved_destination', null, null, null, 'none', favorableEvidence, contraryEvidence);
}

function state(stateName, destination, arrivalSecond, presence, level, favorableEvidence, contraryEvidence) {
    return {
        state: stateName,
        destination,
        arrivalSecond,
        presence,
        level,
        favorableEvidence,
        contraryEvidence
    };
}

function buildConfidences(origin, window, candidate, resolution) {
    const originConfidence = origin.originPhysicalLaneId ? origin.originLaneConfidence : 'insufficient';
    const arrivalConfidence = candidate ? scoreConfidence(candidate.arrivalEvidenceScore, PARAMETERS.arrivalMinimumScore) : 'insufficient';
    const presenceConfidence = confidenceFromPresence(candidate?.presence.level);
    const journeyContinuityConfidence = window.temporalConflict || [ 'death', 'respawn', 'position_absent' ].includes(window.stoppedBecause) ? 'low' : 'high';
    const overallCandidateConfidence = combineConfidence([ originConfidence, arrivalConfidence, presenceConfidence, journeyContinuityConfidence ], resolution.level);

    return {
        originConfidence,
        arrivalConfidence,
        presenceConfidence,
        journeyContinuityConfidence,
        overallCandidateConfidence
    };
}

function scoreConfidence(score, threshold) {
    if (score >= threshold + 3) {
        return 'high';
    }

    if (score >= threshold) {
        return 'medium';
    }

    if (score > 0) {
        return 'low';
    }

    return 'insufficient';
}

function confidenceFromPresence(level) {
    if (level === 'stable_presence') {
        return 'high';
    }

    if (level === 'short_presence') {
        return 'medium';
    }

    if (level === 'brief_arrival') {
        return 'low';
    }

    return 'insufficient';
}

function combineConfidence(parts, level) {
    if (level === 'none') {
        return 'insufficient';
    }

    const minRank = Math.min(...parts.map(part => CONFIDENCE_RANK[part] ?? -1));

    if (minRank >= 2) {
        return 'high';
    }

    if (minRank >= 1) {
        return 'medium';
    }

    return 'low';
}

function buildFragmentedChains() {
    const chains = [];

    for (const playerJourneys of groupBy(journeys, journey => journey.playerIndex).values()) {
        playerJourneys.sort((a, b) => a.startExitSecond - b.startExitSecond);

        for (let index = 0; index < playerJourneys.length - 1; index += 1) {
            const current = playerJourneys[index];
            const next = playerJourneys[index + 1];
            const classification = chainClassification(current, next);

            if (classification.class !== 'independent_journeys') {
                chains.push({
                    chainId: `chain_${chains.length + 1}`,
                    class: classification.class,
                    journeyIds: [ current.journeyId, next.journeyId ],
                    playerIndex: current.playerIndex,
                    originRegion: current.originRegion,
                    probableFinalDestination: probableResolution(next)?.resolvedDestination ?? next.destinationRegion,
                    totalDurationSeconds: next.arrivalSecond - current.startExitSecond,
                    evidence: classification.evidence,
                    confidence: classification.confidence
                });
            }
        }
    }

    return {
        parameters: PARAMETERS,
        summary: {
            totalChains: chains.length,
            likely: chains.filter(chain => chain.class === 'likely_fragmented_chain').length,
            possible: chains.filter(chain => chain.class === 'possible_fragmented_chain').length
        },
        chains
    };
}

function chainClassification(current, next) {
    const gap = next.startExitSecond - current.arrivalSecond;
    const evidence = [];

    if (gap > PARAMETERS.chainFragmentationSeconds || gap < 0) {
        return { class: 'independent_journeys', evidence: [ 'gap_outside_threshold' ], confidence: 'high' };
    }

    if (current.markers.some(marker => [ 'death_boundary', 'respawn_boundary' ].includes(marker))) {
        return { class: 'independent_journeys', evidence: [ 'death_or_respawn_in_first_journey' ], confidence: 'high' };
    }

    if (current.intermediateRegions.includes('between_lanes') || next.intermediateRegions.includes('between_lanes')) {
        evidence.push('between_lanes_dominates_separation');
    }

    if (probableResolution(current)?.resolvedDestination && probableResolution(current)?.resolvedDestination === physicalLane(next.originRegion)) {
        evidence.push('first_probable_destination_matches_next_origin_lane');
    }

    if (evidence.length >= 2) {
        return { class: 'likely_fragmented_chain', evidence, confidence: 'medium' };
    }

    if (evidence.length === 1) {
        return { class: 'possible_fragmented_chain', evidence, confidence: 'low' };
    }

    return { class: 'independent_journeys', evidence: [ 'insufficient_chain_evidence' ], confidence: 'high' };
}

function buildRevisedFunnel() {
    const events = resolutions.map(resolution => ({
        journeyId: resolution.journeyId,
        playerIndex: resolution.playerIndex,
        player: resolution.player,
        originPhysicalLaneId: resolution.normalizedOrigin.originPhysicalLaneId,
        resolvedDestination: resolution.resolvedDestination,
        state: resolution.resolutionState,
        level: resolution.level,
        progression: levelProgression(resolution.level),
        rejections: resolution.contraryEvidence,
        arrivalSecond: resolution.arrivalSecond,
        confidence: resolution.confidence
    }));

    return {
        parameters: PARAMETERS,
        comparisonWithExperiment19: funnel19.summary,
        summary: funnelSummary(events),
        byPlayer: countBy(events.filter(event => event.level !== 'none'), event => String(event.playerIndex)),
        byOriginDestination: countBy(events.filter(event => event.level !== 'none'), event => `${event.originPhysicalLaneId}->${event.resolvedDestination}`),
        events
    };
}

function buildResolvedCandidates() {
    const candidates = resolutions
        .filter(resolution => [ 'B', 'C', 'D' ].includes(resolution.level))
        .map(resolution => ({
            journeyId: resolution.journeyId,
            playerIndex: resolution.playerIndex,
            player: resolution.player,
            hero: resolution.hero,
            level: resolution.level,
            originPhysicalLaneId: resolution.normalizedOrigin.originPhysicalLaneId,
            destinationPhysicalLaneId: resolution.resolvedDestination,
            journeyStartSecond: resolution.originalJourney.journeyStartSecond,
            originalJourneyEndSecond: resolution.originalJourney.journeyEndSecond,
            probableArrivalSecond: resolution.arrivalSecond,
            confirmationSecond: resolution.arrivalSecond === null ? null : resolution.arrivalSecond + (resolution.presence?.consecutivePresenceSeconds ?? 0) - 1,
            originalTransitSeconds: resolution.originalJourney.transitSeconds,
            delayAfterOriginalEndSeconds: resolution.arrivalSecond === null ? null : resolution.arrivalSecond - resolution.originalJourney.journeyEndSecond,
            presence: resolution.presence,
            alliesAtArrival: resolution.presence?.alliesAtArrival ?? null,
            enemiesAtArrival: resolution.presence?.enemiesAtArrival ?? null,
            netWorthAtArrival: metricAt(resolution.playerIndex, resolution.arrivalSecond)?.netWorth ?? null,
            aliveAtArrival: metricAt(resolution.playerIndex, resolution.arrivalSecond)?.alive ?? null,
            intermediateRegions: resolution.originalJourney.intermediateRegions,
            favorableEvidence: resolution.favorableEvidence,
            contraryEvidence: resolution.contraryEvidence,
            confidence: resolution.confidence
        }));

    return {
        parameters: PARAMETERS,
        summary: funnelSummary(candidates),
        candidates
    };
}

function buildResolvedCollectiveMovement() {
    const candidateResolutions = resolutions.filter(resolution => [ 'B', 'C', 'D' ].includes(resolution.level) && resolution.arrivalSecond !== null);
    const events = [];

    for (let left = 0; left < candidateResolutions.length; left += 1) {
        for (let right = left + 1; right < candidateResolutions.length; right += 1) {
            const a = candidateResolutions[left];
            const b = candidateResolutions[right];

            if (a.playerIndex === b.playerIndex || journeyTeam(a) !== journeyTeam(b)) {
                continue;
            }

            const sameDestination = a.resolvedDestination === b.resolvedDestination;
            const closeArrival = Math.abs(a.arrivalSecond - b.arrivalSecond) <= PARAMETERS.collectiveArrivalWindowSeconds;

            if (!sameDestination || !closeArrival) {
                continue;
            }

            const proximity = distance2d(metricAt(a.playerIndex, a.arrivalSecond), metricAt(b.playerIndex, b.arrivalSecond));
            const sameOrigin = a.normalizedOrigin.originPhysicalLaneId === b.normalizedOrigin.originPhysicalLaneId;
            const className = proximity !== null && proximity <= PARAMETERS.collectiveProximityDistance
                ? sameOrigin ? 'parallel_cross_lane_movement' : 'converging_arrival'
                : 'shared_destination';

            events.push({
                eventId: `resolved_collective_${events.length + 1}`,
                class: className,
                journeyIds: [ a.journeyId, b.journeyId ],
                playerIndexes: [ a.playerIndex, b.playerIndex ],
                team: journeyTeam(a),
                destination: a.resolvedDestination,
                arrivalSeconds: [ a.arrivalSecond, b.arrivalSecond ],
                proximityAtArrival: round(proximity),
                possibleCoordinatedMovement: className !== 'shared_destination' && proximity !== null && proximity <= PARAMETERS.collectiveProximityDistance,
                confidence: proximity !== null && proximity <= PARAMETERS.collectiveProximityDistance ? 'medium' : 'low'
            });
        }
    }

    return {
        parameters: PARAMETERS,
        summary: {
            totalEvents: events.length,
            countsByClass: countBy(events, event => event.class)
        },
        events
    };
}

function buildValidation() {
    const states = countBy(resolutions, resolution => resolution.resolutionState);
    const manualCases = selectManualCases();
    const levelD = resolutions.filter(resolution => resolution.level === 'D');

    return {
        generatedAt: new Date().toISOString(),
        summary: {
            journeysProcessed: resolutions.length,
            destinationsConfirmed: states.destination_confirmed ?? 0,
            arrivalsWithoutStablePresence: states.arrival_confirmed_presence_insufficient ?? 0,
            returnedToOrigin: states.returned_to_origin ?? 0,
            interruptions: (states.interrupted_by_death ?? 0) + (states.interrupted_by_new_journey ?? 0),
            ambiguousDestinations: states.ambiguous_destination ?? 0,
            unresolved: states.unresolved_destination ?? 0,
            fragmentedChains: chains.summary.totalChains,
            temporalConflicts: resolutions.filter(resolution => resolution.temporalConflict).length,
            levelA: revisedFunnel.summary.levelA,
            levelB: revisedFunnel.summary.levelB,
            levelC: revisedFunnel.summary.levelC,
            levelD: revisedFunnel.summary.levelD,
            collectiveMovements: resolvedCollective.summary.totalEvents,
            postJourneyExtensionImpact: sensitivity19.summary?.mostSensitiveParameters?.find(parameter => parameter.parameter === 'postExtension') ?? null
        },
        states,
        comparisonWithExperiment19: {
            funnel19: funnel19.summary,
            calibration19: calibration19.funnelCounts,
            nearMisses19: nearMiss19.summary,
            manualReviewCases19: manualReview19.cases?.length ?? null,
            betweenLanesIntervals19: betweenAnalysis.summary?.totalBetweenLanesIntervals ?? null
        },
        checks: {
            originalJourneysRemainUnchanged: originalJourneyCountUnchanged(),
            exactlyOneStatePerJourney: resolutions.length === journeys.length && resolutions.every(resolution => typeof resolution.resolutionState === 'string'),
            noConfirmationPastDeathRespawnOrNewJourney: resolutions.every(resolution => !confirmationPastStop(resolution)),
            noArrivalConfirmedBySingleSecond: resolutions.every(resolution => ![ 'B', 'C', 'D' ].includes(resolution.level) || hasNonIsolatedArrivalEvidence(resolution)),
            noCrossLaneDestinationEqualsOrigin: resolutions.every(resolution => resolution.level === 'none' || resolution.resolvedDestination !== resolution.normalizedOrigin.originPhysicalLaneId),
            returnsSeparatedFromCrossLane: resolutions.every(resolution => resolution.resolutionState !== 'returned_to_origin' || resolution.level === 'none'),
            noArrivalConfirmsTwoJourneysSamePlayer: noDuplicateConfirmationByPlayer(),
            chainsDoNotModifyOriginalJourneys: chains.chains.every(chain => chain.journeyIds.every(id => regionJourneys.journeys.some(journey => journey.journeyId === id))),
            noLevelDUnknownOrBetweenLanes: levelD.every(resolution => ![ 'unknown', 'between_lanes', null ].includes(resolution.resolvedDestination)),
            confidenceComponentsSeparated: resolutions.every(resolution => Object.keys(resolution.confidence).length === 5),
            noStrategicInference: noStrategicTerms()
        },
        manualReviewCases: manualCases,
        limitations: [
            'Destination resolution is post-journey evidence, not an extension of the original journey.',
            'Deduced lane is unavailable for some seconds and is treated as optional evidence.',
            'The model remains descriptive and does not evaluate movement quality or intent.'
        ]
    };
}

function selectManualCases() {
    return uniqueBy([
        ...resolutions.filter(resolution => resolution.resolutionState === 'destination_confirmed' && resolution.confidence.overallCandidateConfidence === 'high').slice(0, 10),
        ...resolutions.filter(resolution => resolution.resolutionState === 'destination_confirmed' && resolution.confidence.overallCandidateConfidence === 'medium').slice(0, 10),
        ...resolutions.filter(resolution => resolution.presence?.level === 'brief_arrival').slice(0, 5),
        ...resolutions.filter(resolution => resolution.resolutionState === 'returned_to_origin').slice(0, 5),
        ...chains.chains.slice(0, 5).map(chain => resolutions.find(resolution => resolution.journeyId === chain.journeyIds[0])).filter(Boolean),
        ...resolutions.filter(resolution => [ 'ambiguous_destination', 'unresolved_destination' ].includes(resolution.resolutionState)).slice(0, 5)
    ], resolution => resolution.journeyId).slice(0, 40).map(resolution => ({
        journeyId: resolution.journeyId,
        playerIndex: resolution.playerIndex,
        player: resolution.player,
        state: resolution.resolutionState,
        level: resolution.level,
        origin: resolution.normalizedOrigin.originPhysicalLaneId,
        destination: resolution.resolvedDestination,
        timeline: compactTimeline(resolution.playerIndex, resolution.originalJourney.journeyStartSecond - 10, resolution.postJourneyEvidence.windowEndSecond)
    }));
}

function compactWindowRows(rows) {
    const intervals = [];
    let current = null;

    for (const row of rows) {
        const key = [ row.region, row.rawRegion, row.nearestLane, row.secondNearestLane, row.alive, row.confidence ].join('|');

        if (!current || current.key !== key || row.gameSecond !== current.endSecond + 1) {
            if (current) {
                intervals.push(stripKey(current));
            }

            current = {
                key,
                startSecond: row.gameSecond,
                endSecond: row.gameSecond,
                region: row.region,
                rawRegion: row.rawRegion,
                nearestLane: row.nearestLane,
                secondNearestLane: row.secondNearestLane,
                distanceLane1: row.distanceLane1,
                distanceLane2: row.distanceLane2,
                distanceLane3: row.distanceLane3,
                distanceMargin: row.distanceMargin,
                deducedLaneRaw: row.deducedLaneRaw,
                direction: row.direction,
                speed: row.speed,
                alive: row.alive,
                deaths: row.deaths,
                confidence: row.confidence
            };
        } else {
            current.endSecond = row.gameSecond;
        }
    }

    if (current) {
        intervals.push(stripKey(current));
    }

    return intervals;
}

function stripKey(row) {
    const { key: _key, ...rest } = row;
    return rest;
}

function compactTimeline(playerIndex, startSecond, endSecond) {
    return playerRows(playerIndex, startSecond, endSecond)
        .filter((row, index) => index % 3 === 0 || row.markers.some(marker => marker !== 'continuous_movement'))
        .map(row => ({
            second: row.gameSecond,
            region: row.region,
            rawRegion: row.rawRegion,
            nearestLane: row.nearestLane,
            secondNearestLane: row.secondNearestLane,
            distanceMargin: row.distanceMargin,
            speed: row.speed,
            alive: row.alive,
            markers: row.markers
        }));
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
            MOVEMENT_PARAMETERS_FILE,
            MOVEMENT_METRICS_FILE,
            MOVEMENT_SEGMENTS_FILE,
            REGION_JOURNEYS_FILE,
            BETWEEN_ANALYSIS_FILE,
            FUNNEL_19_FILE,
            SENSITIVITY_19_FILE,
            NEAR_MISS_19_FILE,
            MANUAL_REVIEW_19_FILE,
            CALIBRATION_19_FILE
        ],
        inputSummary: {
            canonicalSnapshots: timeline.snapshots.length,
            spatialRegions: regionModel.regions.length,
            spatialLaneAxes: regionModel.laneAxes.length,
            completeJourneys: journeys.length,
            movementSegments: movementSegments.segments.length,
            experiment19LevelA: funnel19.summary.levelA,
            experiment19LevelB: funnel19.summary.levelB,
            experiment19LevelC: funnel19.summary.levelC,
            experiment19LevelD: funnel19.summary.levelD
        },
        scoreComponents: Object.entries(PARAMETERS.scoreWeights).map(([ component, weight ]) => ({
            component,
            weight
        })),
        limitations: [
            'Confirmation window is audit evidence after original journey end, not a rewrite of journey duration.',
            'A-C levels are partial evidence and not confirmed strategic rotations.',
            'No item, fight, intent, outcome or quality inference is included.'
        ]
    };
}

function confirmedDestinationInRows(rows, originLane) {
    return Object.keys(LANE_CODES).some(lane => lane !== originLane
        && maxConsecutive(rows.filter(row => row.nearestLane === lane).map(row => row.gameSecond)) >= PARAMETERS.nearestLaneConsecutiveSeconds
        && rows.filter(row => laneDistance(row, lane) <= PARAMETERS.laneDistanceThreshold).length >= PARAMETERS.shortPresenceSeconds);
}

function stableReturnToOrigin(rows, originLane) {
    if (!originLane) {
        return false;
    }

    return maxConsecutive(rows.filter(row => row.nearestLane === originLane || physicalLane(row.region) === originLane).map(row => row.gameSecond)) >= PARAMETERS.stablePresenceSeconds;
}

function directionConsistent(_journey, rows, lane) {
    const targetRows = rows.filter(row => row.nearestLane === lane || laneDistance(row, lane) <= PARAMETERS.laneDistanceThreshold);

    if (targetRows.length < 2) {
        return false;
    }

    return targetRows.at(-1).gameSecond > targetRows[0].gameSecond;
}

function boundaryOscillation(rows, originLane, destinationLane) {
    if (!originLane || !destinationLane) {
        return false;
    }

    const laneSequence = rows.map(row => row.nearestLane).filter(Boolean);
    const changes = laneSequence.filter((lane, index) => index > 0 && lane !== laneSequence[index - 1]).length;

    return changes > 3 && maxConsecutive(rows.filter(row => row.nearestLane === destinationLane).map(row => row.gameSecond)) < PARAMETERS.shortPresenceSeconds;
}

function ambiguousCandidates(candidates) {
    const sorted = candidates.slice().sort((a, b) => b.arrivalEvidenceScore - a.arrivalEvidenceScore);

    return sorted.length > 1 && sorted[0].arrivalEvidenceScore > 0 && sorted[0].arrivalEvidenceScore === sorted[1].arrivalEvidenceScore;
}

function confidenceFromEvidence(observed, target, hasRegionLane) {
    if (hasRegionLane && observed >= target) {
        return 'high';
    }

    if (observed >= PARAMETERS.nearestLaneConsecutiveSeconds) {
        return 'medium';
    }

    if (observed > 0) {
        return 'low';
    }

    return 'insufficient';
}

function probableResolution(journey) {
    return resolutions.find(resolution => resolution.journeyId === journey.journeyId) ?? null;
}

function levelProgression(level) {
    return {
        A: [ 'cross_lane_displacement' ],
        B: [ 'cross_lane_displacement', 'cross_lane_arrival' ],
        C: [ 'cross_lane_displacement', 'cross_lane_arrival', 'cross_lane_presence' ],
        D: [ 'cross_lane_displacement', 'cross_lane_arrival', 'cross_lane_presence', 'stable_rotation_candidate' ],
        none: []
    }[level] ?? [];
}

function funnelSummary(events) {
    return {
        levelA: events.filter(event => [ 'A', 'B', 'C', 'D' ].includes(event.level)).length,
        levelB: events.filter(event => [ 'B', 'C', 'D' ].includes(event.level)).length,
        levelC: events.filter(event => [ 'C', 'D' ].includes(event.level)).length,
        levelD: events.filter(event => event.level === 'D').length,
        none: events.filter(event => event.level === 'none').length
    };
}

function previousIntervalBefore(journey) {
    return (intervalsByPlayer.get(journey.playerIndex) ?? [])
        .filter(interval => interval.endSecond < journey.startExitSecond)
        .sort((a, b) => b.endSecond - a.endSecond)[0] ?? null;
}

function nextJourneyAfter(journey) {
    return (journeysByPlayer.get(journey.playerIndex) ?? [])
        .filter(candidate => candidate.startExitSecond > journey.arrivalSecond)
        .sort((a, b) => a.startExitSecond - b.startExitSecond)[0] ?? null;
}

function possibleChain(current, next) {
    return next.startExitSecond - current.arrivalSecond <= PARAMETERS.chainFragmentationSeconds && !current.markers.some(marker => [ 'death_boundary', 'respawn_boundary' ].includes(marker));
}

function journeyTeam(resolution) {
    return regionJourneys.journeys.find(journey => journey.journeyId === resolution.journeyId)?.team ?? null;
}

function originalJourneyCountUnchanged() {
    return regionJourneys.journeys.length === 362 && journeys.length === 317;
}

function hasNonIsolatedArrivalEvidence(resolution) {
    const nearestConsecutive = resolution.scores.arrivalEvidenceComponents.find(component => component.name === 'nearest_lane_consecutive');
    const distanceBelowThreshold = resolution.scores.arrivalEvidenceComponents.find(component => component.name === 'distance_below_threshold');
    const laneRegion = resolution.scores.arrivalEvidenceComponents.find(component => component.name === 'entered_lane_region');

    return Boolean(nearestConsecutive?.satisfied
        || distanceBelowThreshold?.satisfied
        || laneRegion?.satisfied && (resolution.presence?.timeInLaneRegion ?? 0) > 1
        || (resolution.presence?.consecutivePresenceSeconds ?? 0) > 1);
}

function confirmationPastStop(resolution) {
    if (resolution.arrivalSecond === null || !resolution.temporalConflict) {
        return false;
    }

    return resolution.arrivalSecond >= resolution.temporalConflict.second;
}

function noDuplicateConfirmationByPlayer() {
    const seen = new Set();

    for (const resolution of resolutions) {
        if (resolution.arrivalSecond === null || ![ 'B', 'C', 'D' ].includes(resolution.level)) {
            continue;
        }

        const key = `${resolution.playerIndex}:${resolution.arrivalSecond}:${resolution.resolvedDestination}`;

        if (seen.has(key)) {
            return false;
        }

        seen.add(key);
    }

    return true;
}

function noStrategicTerms() {
    const text = JSON.stringify({ resolutions, chains, revisedFunnel, resolvedCandidates, resolvedCollective });
    const forbidden = [ 'good_rotation', 'bad_rotation', 'gank', 'split_push', 'objective_rotation', 'late_rotation', 'strategy', 'strategic_success' ];

    return forbidden.every(term => !text.includes(term));
}

function playerRows(playerIndex, startSecond, endSecond) {
    return (metricsByPlayer.get(playerIndex) ?? []).filter(row => row.gameSecond >= startSecond && row.gameSecond <= endSecond);
}

function metricAt(playerIndex, second) {
    if (second === null) {
        return null;
    }

    return (metricsByPlayer.get(playerIndex) ?? []).find(row => row.gameSecond === second) ?? null;
}

function physicalLane(region) {
    return region?.match(/^(lane_\d+)_/)?.[1] ?? null;
}

function laneDistance(row, lane) {
    return row?.[`distanceLane${lane?.split('_')[1]}`] ?? null;
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

function countBy(rows, keyFn) {
    const counts = {};

    for (const row of rows) {
        const key = keyFn(row);
        counts[key] = (counts[key] ?? 0) + 1;
    }

    return counts;
}

function topCount(counts) {
    return Object.entries(counts)
        .map(([ key, count ]) => ({ key, count }))
        .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))[0] ?? null;
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

function maxConsecutive(seconds) {
    const sorted = Array.from(new Set(seconds)).sort((a, b) => a - b);
    let best = 0;
    let current = 0;
    let previous = null;

    for (const second of sorted) {
        current = previous === null || second === previous + 1 ? current + 1 : 1;
        best = Math.max(best, current);
        previous = second;
    }

    return best;
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

function distance2d(a, b) {
    if (!a || !b || !Number.isFinite(a.x) || !Number.isFinite(a.y) || !Number.isFinite(b.x) || !Number.isFinite(b.y)) {
        return null;
    }

    return Math.hypot(a.x - b.x, a.y - b.y);
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
        OUTPUT_RESOLUTION,
        OUTPUT_CHAINS,
        OUTPUT_FUNNEL,
        OUTPUT_CANDIDATES,
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
