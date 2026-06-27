import { readFile, stat, writeFile } from 'node:fs/promises';

const REGION_MODEL_FILE = './output/17-spatial-region-model.json';
const REGION_TIMELINE_FILE = './output/17-player-region-timeline.json';
const REGION_INTERVALS_FILE = './output/17-player-region-intervals.json';
const MOVEMENT_PARAMETERS_FILE = './output/18-movement-parameters.json';
const MOVEMENT_METRICS_FILE = './output/18-player-movement-metrics.json';
const MOVEMENT_SEGMENTS_FILE = './output/18-movement-segments.json';
const REGION_JOURNEYS_FILE = './output/18-region-journeys.json';
const ROTATION_CANDIDATES_FILE = './output/18-rotation-candidates.json';
const MOVEMENT_VALIDATION_FILE = './output/18-movement-validation.json';
const TIMELINE_FILE = './output/09-canonical-player-timeline.json';
const HERO_FILE = './output/13-canonical-hero-enrichment.json';
const OUTPUT_AUDIT = './output/19-rotation-rejection-audit.json';
const OUTPUT_BETWEEN = './output/19-between-lanes-analysis.json';
const OUTPUT_FUNNEL = './output/19-rotation-funnel.json';
const OUTPUT_SENSITIVITY = './output/19-parameter-sensitivity.json';
const OUTPUT_NEAR_MISS = './output/19-near-miss-journeys.json';
const OUTPUT_COLLECTIVE = './output/19-collective-movement-audit.json';
const OUTPUT_MANUAL = './output/19-manual-review-cases.json';
const OUTPUT_REVIEW = './output/19-rotation-calibration-review.json';
const OUTPUT_SIZE_LIMIT = 10 * 1024 * 1024;

const EXTRA = {
    minimumDisplacementDistance: 500,
    nearLaneDistance: 360,
    postJourneyAnalysisSeconds: 30,
    nearMissContextBeforeSeconds: 10,
    nearMissContextAfterSeconds: 20,
    quickReturnSeconds: 20,
    sensitivityDestinationStays: [ 3, 5, 8, 12 ],
    sensitivityConfidences: [ 'low', 'medium', 'high' ],
    sensitivityPostExtensions: [ 0, 5, 10, 20 ],
    sensitivityBetweenTolerances: [ 'strict', 'moderate', 'permissive' ],
    collectiveOverlapWindowSeconds: 15
};
const CONFIDENCE_RANK = { low: 0, medium: 1, high: 2 };

const regionModel = JSON.parse(await readFile(REGION_MODEL_FILE, 'utf8'));
const regionTimeline = JSON.parse(await readFile(REGION_TIMELINE_FILE, 'utf8'));
const regionIntervals = JSON.parse(await readFile(REGION_INTERVALS_FILE, 'utf8'));
const movementParameters = JSON.parse(await readFile(MOVEMENT_PARAMETERS_FILE, 'utf8')).parameters;
const movementMetrics = JSON.parse(await readFile(MOVEMENT_METRICS_FILE, 'utf8'));
const movementSegments = JSON.parse(await readFile(MOVEMENT_SEGMENTS_FILE, 'utf8'));
const regionJourneys = JSON.parse(await readFile(REGION_JOURNEYS_FILE, 'utf8'));
const rotationCandidates = JSON.parse(await readFile(ROTATION_CANDIDATES_FILE, 'utf8'));
const movementValidation = JSON.parse(await readFile(MOVEMENT_VALIDATION_FILE, 'utf8'));
const timeline = JSON.parse(await readFile(TIMELINE_FILE, 'utf8'));
const heroes = JSON.parse(await readFile(HERO_FILE, 'utf8'));

const metrics = decodeMetrics();
const journeysToAudit = regionJourneys.journeys.filter(journey => journey.status === 'complete');
const inputSummary = {
    regionTimelineSnapshots: regionTimeline.snapshots.length,
    canonicalTimelineSnapshots: timeline.snapshots.length,
    movementMetricFields: movementMetrics.schema,
    movementSegments: movementSegments.segments.length
};
const metricsByPlayer = groupBy(metrics, row => row.playerIndex);
const intervalsByPlayer = groupBy(regionIntervals.intervals, interval => interval.playerIndex);
const heroesByPlayer = new Map(heroes.map(hero => [ hero.playerIndex, hero ]));
const audit = buildAudit();
const betweenAnalysis = buildBetweenLanesAnalysis();
const funnel = buildFunnel();
const sensitivity = buildSensitivity();
const nearMisses = buildNearMisses();
const collectiveAudit = buildCollectiveAudit();
const manualReview = buildManualReviewCases();
const calibrationReview = buildCalibrationReview();

await writeJson(OUTPUT_AUDIT, audit);
await writeJson(OUTPUT_BETWEEN, betweenAnalysis);
await writeJson(OUTPUT_FUNNEL, funnel);
await writeJson(OUTPUT_SENSITIVITY, sensitivity);
await writeJson(OUTPUT_NEAR_MISS, nearMisses);
await writeJson(OUTPUT_COLLECTIVE, collectiveAudit);
await writeJson(OUTPUT_MANUAL, manualReview);
await writeJson(OUTPUT_REVIEW, calibrationReview);
await validateOutputs();

console.log(`Audited journeys: ${audit.summary.totalJourneys}`);
console.log(`Top rejection criterion: ${audit.summary.topRejectionCriterion?.criterion ?? 'none'} (${audit.summary.topRejectionCriterion?.count ?? 0})`);
console.log(`Cross-physical-lane journeys: ${audit.summary.crossPhysicalLaneJourneys}`);
console.log(`Funnel A/B/C/D: ${funnel.summary.levelA}/${funnel.summary.levelB}/${funnel.summary.levelC}/${funnel.summary.levelD}`);
console.log(`Near misses: ${nearMisses.summary.totalNearMisses}`);
console.log(`Collective candidates audited: ${collectiveAudit.summary.events.length}`);
console.log(`Wrote ${OUTPUT_AUDIT}`);
console.log(`Wrote ${OUTPUT_BETWEEN}`);
console.log(`Wrote ${OUTPUT_FUNNEL}`);
console.log(`Wrote ${OUTPUT_SENSITIVITY}`);
console.log(`Wrote ${OUTPUT_NEAR_MISS}`);
console.log(`Wrote ${OUTPUT_COLLECTIVE}`);
console.log(`Wrote ${OUTPUT_MANUAL}`);
console.log(`Wrote ${OUTPUT_REVIEW}`);

function decodeMetrics() {
    return movementMetrics.rows.map(row => {
        const decoded = Object.fromEntries(movementMetrics.schema.map((field, index) => [ field, row[index] ]));
        decoded.markers = decoded.markers ?? [];
        return decoded;
    });
}

function buildAudit() {
    const records = journeysToAudit.map(journey => {
        const originInterval = findOriginInterval(journey);
        const destinationInterval = findDestinationInterval(journey);
        const criteria = auditCriteria(journey, originInterval, destinationInterval, {
            destinationStay: movementParameters.minDestinationStaySeconds,
            minConfidence: movementParameters.minSpatialConfidence,
            postExtension: 0,
            betweenTolerance: 'strict'
        });
        const failed = criteria.filter(criterion => !criterion.passed).map(criterion => criterion.criterion);

        return {
            journeyId: journey.journeyId,
            playerIndex: journey.playerIndex,
            name: journey.name,
            originRegion: journey.originRegion,
            originPhysicalLaneId: physicalLane(journey.originRegion),
            destinationRegion: journey.destinationRegion,
            destinationPhysicalLaneId: physicalLane(journey.destinationRegion),
            startExitSecond: journey.startExitSecond,
            arrivalSecond: journey.arrivalSecond,
            class: journey.class,
            criteria,
            failedCriteria: failed,
            failedCriteriaCount: failed.length,
            level: classifyJourneyLevel(journey, { destinationStay: movementParameters.minDestinationStaySeconds, minConfidence: movementParameters.minSpatialConfidence, postExtension: 0, betweenTolerance: 'strict' }).level
        };
    });
    const rejectionCounts = countFailures(records);
    const rejectionCombinations = countCombinations(records);

    return {
        sourceFiles: auditSourceFiles(),
        parameters: {
            experiment18: movementParameters,
            audit: EXTRA
        },
        summary: {
            inputs: inputSummary,
            totalJourneys: records.length,
            originalRotationCandidates: rotationCandidates.rotationCandidates.length,
            crossPhysicalLaneJourneys: records.filter(record => record.originPhysicalLaneId && record.destinationPhysicalLaneId && record.originPhysicalLaneId !== record.destinationPhysicalLaneId).length,
            topRejectionCriterion: rejectionCounts[0] ?? null,
            zeroCandidateCause: summarizeZeroCandidateCause(rejectionCounts)
        },
        rejectionCounts,
        rejectionCombinations,
        journeys: records
    };
}

function auditCriteria(journey, originInterval, destinationInterval, options) {
    const originLane = physicalLane(journey.originRegion);
    const destinationLane = physicalLane(journey.destinationRegion);
    const sameOrNeutralAllowed = Boolean(originLane && destinationLane && originLane !== destinationLane
        || originLane && isNeutral(journey.destinationRegion)
        || destinationLane && isNeutral(journey.originRegion));
    const destinationStay = destinationInterval?.durationSeconds ?? Math.max(0, journey.destinationConfirmationSecond - journey.arrivalSecond + 1);
    const confidenceThreshold = CONFIDENCE_RANK[options.minConfidence];
    const observedDestination = inferPostJourneyEvidence(journey, options.postExtension);
    const displacement = journey.traveledDistance ?? 0;
    const hasDeath = journey.markers.includes('death_boundary');
    const hasRespawn = journey.markers.includes('respawn_boundary');
    const hasDiscontinuity = journey.markers.includes('position_discontinuity') || journey.markers.includes('possible_teleport');
    const boundaryOscillation = isBoundaryOscillation(journey, options.betweenTolerance);

    return [
        makeCriterion('origin_spatial_valid', isRelevantRegion(journey.originRegion), journey.originRegion, 'not unknown/between_lanes'),
        makeCriterion('destination_spatial_valid', isRelevantRegion(journey.destinationRegion), journey.destinationRegion, 'not unknown/between_lanes'),
        makeCriterion('origin_physical_lane_present', Boolean(originLane), originLane, 'physicalLaneId exists'),
        makeCriterion('destination_physical_lane_present', Boolean(destinationLane), destinationLane, 'physicalLaneId exists'),
        makeCriterion('origin_destination_different_or_lane_neutral', sameOrNeutralAllowed, { originLane, destinationLane }, 'different physical lanes or lane-neutral'),
        makeCriterion('origin_minimum_stay', (originInterval?.durationSeconds ?? 0) >= movementParameters.minOriginStaySeconds, originInterval?.durationSeconds ?? null, movementParameters.minOriginStaySeconds),
        makeCriterion('destination_minimum_stay', destinationStay >= options.destinationStay, destinationStay, options.destinationStay),
        makeCriterion('origin_confidence_minimum', confidencePass(journey.originConfidence, options.minConfidence), journey.originConfidence, options.minConfidence, confidenceRankMargin(journey.originConfidence, confidenceThreshold)),
        makeCriterion('destination_confidence_minimum', confidencePass(journey.destinationConfidence, options.minConfidence), journey.destinationConfidence, options.minConfidence, confidenceRankMargin(journey.destinationConfidence, confidenceThreshold)),
        makeCriterion('transit_duration_maximum', journey.transitSeconds <= movementParameters.maxTransitSeconds, journey.transitSeconds, movementParameters.maxTransitSeconds, movementParameters.maxTransitSeconds - journey.transitSeconds),
        makeCriterion('absence_of_death', !hasDeath, hasDeath, false),
        makeCriterion('absence_of_respawn', !hasRespawn, hasRespawn, false),
        makeCriterion('absence_of_discontinuity', !hasDiscontinuity, hasDiscontinuity, false),
        makeCriterion('not_boundary_oscillation', !boundaryOscillation, boundaryOscillation, false),
        makeCriterion('destination_not_unknown', journey.destinationRegion !== 'unknown', journey.destinationRegion, 'not unknown'),
        makeCriterion('destination_not_between_lanes', journey.destinationRegion !== 'between_lanes', journey.destinationRegion, 'not between_lanes'),
        makeCriterion('minimum_displacement_distance', displacement >= EXTRA.minimumDisplacementDistance, round(displacement), EXTRA.minimumDisplacementDistance, displacement - EXTRA.minimumDisplacementDistance),
        makeCriterion('post_journey_lane_evidence', observedDestination.bestLane !== originLane || destinationLane !== originLane, observedDestination.bestLane, 'different from origin lane')
    ];
}

function makeCriterion(criterion, passed, observed, threshold, margin = null) {
    return { criterion, observed, threshold, passed, margin };
}

function confidencePass(value, threshold) {
    return (CONFIDENCE_RANK[value] ?? 0) >= (CONFIDENCE_RANK[threshold] ?? 0);
}

function confidenceRankMargin(value, thresholdRank) {
    return (CONFIDENCE_RANK[value] ?? 0) - thresholdRank;
}

function buildBetweenLanesAnalysis() {
    const intervals = regionIntervals.intervals
        .filter(interval => interval.region === 'between_lanes')
        .map(interval => {
            const rows = playerMetrics(interval.playerIndex, interval.startSecond, interval.endSecond);
            const previous = previousInterval(interval);
            const next = nextInterval(interval);
            const traveledDistance = sum(rows.map(row => row.planarDistance));
            const laneCounts = countBy(rows, row => row.nearestLane ?? 'unknown');
            const direction = directionSummary(rows);
            const classification = classifyBetweenInterval(interval, rows, previous, next, traveledDistance);

            return {
                playerIndex: interval.playerIndex,
                name: interval.name,
                heroDisplayName: interval.heroDisplayName,
                team: interval.team,
                startSecond: interval.startSecond,
                endSecond: interval.endSecond,
                durationSeconds: interval.durationSeconds,
                previousRegion: previous?.region ?? null,
                previousPhysicalLaneId: physicalLane(previous?.region),
                nextRegion: next?.region ?? null,
                nextPhysicalLaneId: physicalLane(next?.region),
                nearestLaneMode: topCount(laneCounts)?.key ?? null,
                laneCounts,
                averageDistanceMargin: round(average(rows.map(row => row.distanceMargin))),
                minNearestLaneDistance: minFinite(rows.map(nearestLaneDistance)),
                direction,
                traveledDistance: round(traveledDistance),
                classification: classification.classification,
                confidence: classification.confidence,
                reasons: classification.reasons
            };
        });

    return {
        sourceFiles: auditSourceFiles(),
        parameters: EXTRA,
        summary: {
            totalBetweenLanesIntervals: intervals.length,
            countsByClassification: countBy(intervals, interval => interval.classification)
        },
        intervals
    };
}

function classifyBetweenInterval(interval, rows, previous, next, traveledDistance) {
    const previousLane = physicalLane(previous?.region);
    const nextLane = physicalLane(next?.region);
    const laneMode = topCount(countBy(rows, row => row.nearestLane ?? 'unknown'))?.key;
    const avgMargin = average(rows.map(row => row.distanceMargin));
    const minDistance = minFinite(rows.map(nearestLaneDistance));
    const reasons = [];

    if (isBase(previous?.region) || isBase(next?.region)) {
        reasons.push('adjacent_to_base_region');
        return { classification: 'base_transition', confidence: 'medium', reasons };
    }

    if (previousLane && nextLane && previousLane !== nextLane && traveledDistance >= EXTRA.minimumDisplacementDistance && avgMargin >= regionModel.parameters.betweenLanesDistanceMargin) {
        reasons.push('previous_and_next_physical_lanes_differ_with_distance');
        return { classification: 'transit_between_distinct_lanes', confidence: 'medium', reasons };
    }

    if (laneMode && minDistance !== null && minDistance <= EXTRA.nearLaneDistance && avgMargin >= regionModel.parameters.betweenLanesDistanceMargin) {
        reasons.push('nearest_lane_dominates_interval');
        return { classification: `near_${laneMode}`, confidence: 'medium', reasons };
    }

    if (interval.durationSeconds >= 12 && traveledDistance <= EXTRA.minimumDisplacementDistance) {
        reasons.push('long_low_displacement_between_lanes_presence');
        return { classification: 'central_neutral_presence', confidence: 'low', reasons };
    }

    if (avgMargin !== null && avgMargin < regionModel.parameters.betweenLanesDistanceMargin) {
        reasons.push('small_distance_margin_between_nearest_lanes');
        return { classification: 'boundary_ambiguity', confidence: 'low', reasons };
    }

    reasons.push('insufficient_evidence_for_specific_between_lanes_class');
    return { classification: 'unresolved_between_lanes', confidence: 'low', reasons };
}

function buildFunnel() {
    const events = journeysToAudit.map(journey => {
        const result = classifyJourneyLevel(journey, {
            destinationStay: movementParameters.minDestinationStaySeconds,
            minConfidence: movementParameters.minSpatialConfidence,
            postExtension: 0,
            betweenTolerance: 'strict'
        });

        return {
            journeyId: journey.journeyId,
            playerIndex: journey.playerIndex,
            name: journey.name,
            team: journey.team,
            originRegion: journey.originRegion,
            destinationRegion: journey.destinationRegion,
            originPhysicalLaneId: physicalLane(journey.originRegion),
            destinationPhysicalLaneId: physicalLane(journey.destinationRegion),
            level: result.level,
            passedLevels: result.passedLevels,
            reasons: result.reasons,
            rejectionReasons: result.rejectionReasons
        };
    });

    return {
        sourceFiles: auditSourceFiles(),
        definitions: {
            A: 'cross_lane_displacement',
            B: 'cross_lane_arrival',
            C: 'cross_lane_presence',
            D: 'stable_rotation_candidate'
        },
        summary: funnelSummary(events),
        events
    };
}

function classifyJourneyLevel(journey, options) {
    const rows = playerMetrics(journey.playerIndex, journey.startExitSecond, journey.arrivalSecond + options.postExtension);
    const originLane = physicalLane(journey.originRegion) ?? inferOriginLane(rows);
    const destinationLane = physicalLane(journey.destinationRegion);
    const evidence = inferPostJourneyEvidence(journey, options.postExtension);
    const targetLane = destinationLane ?? evidence.bestLane;
    const criteria = auditCriteria(journey, findOriginInterval(journey), findDestinationInterval(journey), options);
    const failed = criteria.filter(criterion => !criterion.passed).map(criterion => criterion.criterion);
    const levelA = Boolean(originLane && targetLane && originLane !== targetLane);
    const levelB = levelA && Boolean(destinationLane && destinationLane !== originLane || evidence.enteredLaneRegion);
    const destinationPresence = destinationLane ? destinationLanePresenceSeconds(journey, destinationLane, options.postExtension) : evidence.bestLaneSeconds;
    const levelC = levelB && destinationPresence >= options.destinationStay;
    const levelD = levelC
        && !journey.markers.some(marker => [ 'death_boundary', 'respawn_boundary', 'position_discontinuity', 'possible_teleport' ].includes(marker))
        && confidencePass(journey.originConfidence, options.minConfidence)
        && confidencePass(journey.destinationConfidence, options.minConfidence)
        && !isBoundaryOscillation(journey, options.betweenTolerance);

    return {
        level: levelD ? 'D' : levelC ? 'C' : levelB ? 'B' : levelA ? 'A' : 'none',
        passedLevels: [ levelA ? 'A' : null, levelB ? 'B' : null, levelC ? 'C' : null, levelD ? 'D' : null ].filter(Boolean),
        reasons: {
            originLane,
            targetLane,
            destinationLane,
            bestPostJourneyLane: evidence.bestLane,
            destinationPresenceSeconds: destinationPresence,
            destinationStayThreshold: options.destinationStay
        },
        rejectionReasons: failed
    };
}

function buildSensitivity() {
    const configurations = [];

    for (const destinationStay of EXTRA.sensitivityDestinationStays) {
        for (const minConfidence of EXTRA.sensitivityConfidences) {
            for (const postExtension of EXTRA.sensitivityPostExtensions) {
                for (const betweenTolerance of EXTRA.sensitivityBetweenTolerances) {
                    const events = journeysToAudit.map(journey => ({
                        journeyId: journey.journeyId,
                        playerIndex: journey.playerIndex,
                        team: journey.team,
                        originDestination: `${journey.originRegion}->${journey.destinationRegion}`,
                        level: classifyJourneyLevel(journey, { destinationStay, minConfidence, postExtension, betweenTolerance }).level
                    }));

                    configurations.push({
                        configId: `cfg_${configurations.length + 1}`,
                        destinationStay,
                        minConfidence,
                        postExtension,
                        betweenTolerance,
                        counts: funnelSummary(events),
                        byPlayer: countBy(events.filter(event => event.level !== 'none'), event => String(event.playerIndex)),
                        byOriginDestination: countBy(events.filter(event => event.level !== 'none'), event => event.originDestination),
                        falsePositiveRisks: falsePositiveRisks(destinationStay, minConfidence, postExtension, betweenTolerance)
                    });
                }
            }
        }
    }

    return {
        sourceFiles: auditSourceFiles(),
        grid: {
            destinationStay: EXTRA.sensitivityDestinationStays,
            minConfidence: EXTRA.sensitivityConfidences,
            postExtension: EXTRA.sensitivityPostExtensions,
            betweenTolerance: EXTRA.sensitivityBetweenTolerances
        },
        summary: {
            configurations: configurations.length,
            minLevelD: Math.min(...configurations.map(config => config.counts.levelD)),
            maxLevelD: Math.max(...configurations.map(config => config.counts.levelD)),
            mostSensitiveParameters: parameterSensitivity(configurations)
        },
        configurations
    };
}

function falsePositiveRisks(destinationStay, minConfidence, postExtension, betweenTolerance) {
    const risks = [];

    if (destinationStay <= 3) {
        risks.push('short_destination_presence_can_include_drive_by_or_boundary_crossing');
    }

    if (minConfidence === 'low') {
        risks.push('low_spatial_confidence_accepts_ambiguous_regions');
    }

    if (postExtension >= 20) {
        risks.push('long_post_extension_can_attach_later_unrelated_presence');
    }

    if (betweenTolerance === 'permissive') {
        risks.push('permissive_between_lanes_can_turn_ambiguous_middle_presence_into_cross_lane_event');
    }

    return risks;
}

function parameterSensitivity(configurations) {
    const groups = [
        [ 'destinationStay', config => String(config.destinationStay) ],
        [ 'minConfidence', config => config.minConfidence ],
        [ 'postExtension', config => String(config.postExtension) ],
        [ 'betweenTolerance', config => config.betweenTolerance ]
    ];

    return groups.map(([ parameter, keyFn ]) => {
        const values = groupBy(configurations, keyFn);
        const means = Array.from(values.entries()).map(([ value, configs ]) => ({
            value,
            averageLevelD: round(average(configs.map(config => config.counts.levelD)))
        }));
        const averageValues = means.map(item => item.averageLevelD);

        return {
            parameter,
            values: means,
            spread: round(Math.max(...averageValues) - Math.min(...averageValues))
        };
    }).sort((a, b) => b.spread - a.spread);
}

function buildNearMisses() {
    const ranked = audit.journeys
        .filter(record => record.level !== 'D')
        .map(record => ({
            ...record,
            proximityScore: proximityScore(record)
        }))
        .sort((a, b) => b.proximityScore - a.proximityScore || a.failedCriteriaCount - b.failedCriteriaCount);
    const oneCriterion = ranked.filter(record => record.failedCriteriaCount === 1).slice(0, 20);
    const twoCriteria = ranked.filter(record => record.failedCriteriaCount === 2).slice(0, 20);
    const crossLane = ranked.filter(record => record.originPhysicalLaneId && record.destinationPhysicalLaneId && record.originPhysicalLaneId !== record.destinationPhysicalLaneId).slice(0, 30);
    const endedBetween = ranked.filter(record => record.destinationRegion === 'between_lanes').slice(0, 20);
    const briefArrival = ranked.filter(record => record.failedCriteria.includes('destination_minimum_stay')).slice(0, 20);
    const quickReturn = ranked.filter(record => quickReturnToOrigin(findJourney(record.journeyId))).slice(0, 20);
    const selected = uniqueBy([ ...oneCriterion, ...twoCriteria, ...crossLane, ...endedBetween, ...briefArrival, ...quickReturn ], record => record.journeyId)
        .slice(0, 120)
        .map(record => ({
            ...trimAuditRecord(record),
            contextTimeline: compactContext(findJourney(record.journeyId), EXTRA.nearMissContextBeforeSeconds, EXTRA.nearMissContextAfterSeconds)
        }));

    return {
        sourceFiles: auditSourceFiles(),
        summary: {
            totalNearMisses: ranked.length,
            oneCriterion: oneCriterion.length,
            twoCriteria: twoCriteria.length,
            crossPhysicalLane: crossLane.length,
            endedBetweenLanes: endedBetween.length,
            briefArrival: briefArrival.length,
            quickReturn: quickReturn.length
        },
        buckets: {
            oneCriterion: oneCriterion.map(trimAuditRecord),
            twoCriteria: twoCriteria.map(trimAuditRecord),
            crossPhysicalLane: crossLane.map(trimAuditRecord),
            endedBetweenLanes: endedBetween.map(trimAuditRecord),
            briefArrival: briefArrival.map(trimAuditRecord),
            quickReturn: quickReturn.map(trimAuditRecord)
        },
        selected
    };
}

function buildCollectiveAudit() {
    const complete = journeysToAudit;
    let temporalOverlap = 0;
    let sharedDestination = 0;
    let convergingDestination = 0;
    let proximityDuringTransit = 0;
    const eliminations = new Map();
    const events = [];

    for (let left = 0; left < complete.length; left += 1) {
        for (let right = left + 1; right < complete.length; right += 1) {
            const a = complete[left];
            const b = complete[right];

            if (a.team !== b.team) {
                continue;
            }

            const overlap = rangesOverlap(a.startExitSecond, a.arrivalSecond, b.startExitSecond, b.arrivalSecond);
            const closeDepartures = Math.abs(a.startExitSecond - b.startExitSecond) <= movementParameters.collectiveWindowSeconds;
            const sameDestination = a.destinationRegion === b.destinationRegion;
            const converging = sameDestination && a.originRegion !== b.originRegion;
            const close = transitProximity(a, b) <= movementParameters.collectiveMaxDistance;

            temporalOverlap += overlap ? 1 : 0;
            sharedDestination += sameDestination ? 1 : 0;
            convergingDestination += converging ? 1 : 0;
            proximityDuringTransit += close ? 1 : 0;
            increment(eliminations, !overlap ? 'no_temporal_overlap' : !closeDepartures ? 'departure_window_mismatch' : !sameDestination ? 'different_destination' : !close ? 'not_close_during_transit' : 'candidate');

            if (overlap && closeDepartures && sameDestination) {
                events.push({
                    eventId: `collective_audit_${events.length + 1}`,
                    journeyIds: [ a.journeyId, b.journeyId ],
                    playerIndexes: [ a.playerIndex, b.playerIndex ],
                    team: a.team,
                    originRegions: unique([ a.originRegion, b.originRegion ]),
                    destinationRegion: a.destinationRegion,
                    departureSeconds: [ a.startExitSecond, b.startExitSecond ],
                    proximityDuringTransit: round(transitProximity(a, b)),
                    class: close ? collectiveClass(a, b) : 'insufficient_evidence'
                });
            }
        }
    }

    return {
        sourceFiles: auditSourceFiles(),
        parameters: {
            collectiveWindowSeconds: movementParameters.collectiveWindowSeconds,
            collectiveMaxDistance: movementParameters.collectiveMaxDistance,
            overlapWindowSeconds: EXTRA.collectiveOverlapWindowSeconds
        },
        summary: {
            allyJourneyPairs: Array.from(eliminations.values()).reduce((total, value) => total + value, 0),
            temporalOverlap,
            sharedDestination,
            convergingDestination,
            proximityDuringTransit,
            topEliminatingCriterion: topCount(Object.fromEntries(eliminations)) ?? null,
            events: events.slice(0, 50)
        },
        eliminationCounts: Object.fromEntries(eliminations),
        events
    };
}

function buildManualReviewCases() {
    const cases = audit.journeys
        .map(record => {
            const journey = findJourney(record.journeyId);
            const level = classifyJourneyLevel(journey, { destinationStay: movementParameters.minDestinationStaySeconds, minConfidence: 'low', postExtension: 20, betweenTolerance: 'moderate' });
            const hero = heroesByPlayer.get(record.playerIndex);

            return {
                journeyId: record.journeyId,
                playerIndex: record.playerIndex,
                player: record.name,
                hero: hero?.heroDisplayName ?? null,
                origin: record.originRegion,
                probableDestination: probableDestination(journey),
                startSecond: journey.startExitSecond,
                probableArrivalSecond: journey.arrivalSecond,
                durationSeconds: journey.transitSeconds,
                startPosition: metricAt(record.playerIndex, journey.startExitSecond),
                endPosition: metricAt(record.playerIndex, journey.arrivalSecond),
                intermediateRegions: journey.intermediateRegions,
                passedCriteria: record.criteria.filter(criterion => criterion.passed).map(criterion => criterion.criterion),
                rejectedCriteria: record.failedCriteria,
                level: level.level,
                reviewReason: manualReviewReason(record, journey, level),
                score: manualReviewScore(record, journey, level)
            };
        })
        .filter(item => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 30);

    return {
        sourceFiles: auditSourceFiles(),
        selectionRules: [
            'physical lane changes',
            'high traveled distance',
            'probable lane destination',
            'no death marker',
            'reasonable spatial confidence',
            'diverse players and moments'
        ],
        cases
    };
}

function buildCalibrationReview() {
    const funnelCounts = funnel.summary;
    const topRejection = audit.summary.topRejectionCriterion;
    const sensitive = sensitivity.summary.mostSensitiveParameters;

    return {
        sourceFiles: auditSourceFiles(),
        causePrincipalDeZeroCandidatos: audit.summary.zeroCandidateCause,
        topRejectionCriterion: topRejection,
        crossPhysicalLaneJourneys: audit.summary.crossPhysicalLaneJourneys,
        funnelCounts: {
            levelA: funnelCounts.levelA,
            levelB: funnelCounts.levelB,
            levelC: funnelCounts.levelC,
            levelD: funnelCounts.levelD
        },
        mostSensitiveParameters: sensitive,
        recommendedDefinitions: {
            levelA: 'deslocamento entre proximidades de lanes diferentes, sem chamar de rotação',
            levelB: 'nível A com entrada reconhecível na lane provável de destino',
            levelC: 'nível B com presença mínima configurável no destino',
            levelD: 'nível C sem morte/respawn/descontinuidade, confiança suficiente e sem oscilação simples'
        },
        criteriaToKeepRigid: [
            'absence_of_death',
            'absence_of_respawn',
            'absence_of_discontinuity',
            'destination_not_unknown'
        ],
        criteriaThatCanBecomeConfidenceIndicators: [
            'destination_minimum_stay',
            'destination_confidence_minimum',
            'between_lanes_tolerance',
            'post_journey_lane_evidence'
        ],
        limitations: [
            'Auditoria deriva das jornadas do experimento 18 e não corrige fragmentação upstream.',
            'between_lanes permanece uma categoria ampla.',
            'Níveis A-C preservam evidência parcial e não são rotações confirmadas.',
            'Nenhuma avaliação estratégica foi produzida.'
        ],
        movementValidationReference: movementValidation.counts ?? null
    };
}

function findOriginInterval(journey) {
    return (intervalsByPlayer.get(journey.playerIndex) ?? []).find(interval => interval.region === journey.originRegion && interval.endSecond === journey.startExitSecond) ?? null;
}

function findDestinationInterval(journey) {
    return (intervalsByPlayer.get(journey.playerIndex) ?? []).find(interval => interval.region === journey.destinationRegion && interval.startSecond === journey.arrivalSecond) ?? null;
}

function previousInterval(interval) {
    const intervals = intervalsByPlayer.get(interval.playerIndex) ?? [];
    const index = intervals.findIndex(item => item.startSecond === interval.startSecond && item.endSecond === interval.endSecond && item.region === interval.region);

    return index > 0 ? intervals[index - 1] : null;
}

function nextInterval(interval) {
    const intervals = intervalsByPlayer.get(interval.playerIndex) ?? [];
    const index = intervals.findIndex(item => item.startSecond === interval.startSecond && item.endSecond === interval.endSecond && item.region === interval.region);

    return index >= 0 && index < intervals.length - 1 ? intervals[index + 1] : null;
}

function inferPostJourneyEvidence(journey, postExtension) {
    const rows = playerMetrics(journey.playerIndex, journey.arrivalSecond, journey.arrivalSecond + postExtension);
    const laneCounts = countBy(rows, row => row.nearestLane ?? 'unknown');
    const best = topCount(laneCounts);
    const enteredLaneRegion = rows.some(row => physicalLane(row.region) && physicalLane(row.region) !== physicalLane(journey.originRegion));

    return {
        bestLane: best?.key ?? null,
        bestLaneSeconds: best?.count ?? 0,
        enteredLaneRegion,
        laneCounts
    };
}

function destinationLanePresenceSeconds(journey, destinationLane, postExtension) {
    return playerMetrics(journey.playerIndex, journey.arrivalSecond, journey.arrivalSecond + postExtension)
        .filter(row => physicalLane(row.region) === destinationLane || row.nearestLane === destinationLane && row.distanceMargin >= regionModel.parameters.betweenLanesDistanceMargin)
        .length;
}

function isBoundaryOscillation(journey, betweenTolerance) {
    if (journey.intermediateRegions.includes(journey.originRegion)) {
        return true;
    }

    if (betweenTolerance === 'permissive') {
        return false;
    }

    const onlyBetween = journey.intermediateRegions.length > 0 && journey.intermediateRegions.every(region => region === 'between_lanes');

    if (betweenTolerance === 'strict') {
        return onlyBetween && journey.transitSeconds <= movementParameters.minDestinationStaySeconds * 2;
    }

    return onlyBetween && journey.transitSeconds <= movementParameters.minDestinationStaySeconds;
}

function quickReturnToOrigin(journey) {
    if (!journey) {
        return false;
    }

    return playerMetrics(journey.playerIndex, journey.arrivalSecond, journey.arrivalSecond + EXTRA.quickReturnSeconds)
        .some(row => row.region === journey.originRegion);
}

function compactContext(journey, beforeSeconds, afterSeconds) {
    return playerMetrics(journey.playerIndex, journey.startExitSecond - beforeSeconds, journey.arrivalSecond + afterSeconds)
        .filter((row, index) => index % 3 === 0 || [ journey.startExitSecond, journey.arrivalSecond ].includes(row.gameSecond))
        .map(row => ({
            second: row.gameSecond,
            region: row.region,
            rawRegion: row.rawRegion,
            nearestLane: row.nearestLane,
            secondNearestLane: row.secondNearestLane,
            distanceMargin: row.distanceMargin,
            alive: row.alive,
            markers: row.markers
        }));
}

function probableDestination(journey) {
    const destinationLane = physicalLane(journey.destinationRegion);

    if (destinationLane) {
        return destinationLane;
    }

    return inferPostJourneyEvidence(journey, 20).bestLane;
}

function manualReviewReason(record, journey, level) {
    const reasons = [];

    if (record.originPhysicalLaneId && record.destinationPhysicalLaneId && record.originPhysicalLaneId !== record.destinationPhysicalLaneId) {
        reasons.push('physical_lane_change');
    }

    if (journey.traveledDistance >= 1500) {
        reasons.push('high_traveled_distance');
    }

    if (!journey.markers.includes('death_boundary') && !journey.markers.includes('respawn_boundary')) {
        reasons.push('no_death_or_respawn');
    }

    if ([ 'B', 'C', 'D' ].includes(level.level)) {
        reasons.push('probable_destination_evidence');
    }

    return reasons;
}

function manualReviewScore(record, journey, level) {
    return Number(Boolean(record.originPhysicalLaneId && record.destinationPhysicalLaneId && record.originPhysicalLaneId !== record.destinationPhysicalLaneId)) * 5
        + Number(journey.traveledDistance >= 1500) * 2
        + Number(!journey.markers.includes('death_boundary') && !journey.markers.includes('respawn_boundary')) * 2
        + [ 'none', 'A', 'B', 'C', 'D' ].indexOf(level.level);
}

function countFailures(records) {
    const counts = new Map();

    for (const record of records) {
        for (const failed of record.failedCriteria) {
            increment(counts, failed);
        }
    }

    return Array.from(counts.entries())
        .map(([ criterion, count ]) => ({ criterion, count }))
        .sort((a, b) => b.count - a.count || a.criterion.localeCompare(b.criterion));
}

function countCombinations(records) {
    const counts = new Map();

    for (const record of records) {
        const key = record.failedCriteria.slice().sort().join('|') || 'none';
        increment(counts, key);
    }

    return Array.from(counts.entries())
        .map(([ combination, count ]) => ({ combination, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 50);
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

function proximityScore(record) {
    return record.criteria.filter(criterion => criterion.passed).length - record.failedCriteriaCount * 0.5
        + Number(record.originPhysicalLaneId && record.destinationPhysicalLaneId && record.originPhysicalLaneId !== record.destinationPhysicalLaneId) * 3;
}

function trimAuditRecord(record) {
    return {
        journeyId: record.journeyId,
        playerIndex: record.playerIndex,
        name: record.name,
        originRegion: record.originRegion,
        originPhysicalLaneId: record.originPhysicalLaneId,
        destinationRegion: record.destinationRegion,
        destinationPhysicalLaneId: record.destinationPhysicalLaneId,
        startExitSecond: record.startExitSecond,
        arrivalSecond: record.arrivalSecond,
        class: record.class,
        level: record.level,
        failedCriteriaCount: record.failedCriteriaCount,
        failedCriteria: record.failedCriteria,
        proximityScore: record.proximityScore
    };
}

function summarizeZeroCandidateCause(rejectionCounts) {
    const top = rejectionCounts[0];

    if (!top) {
        return 'no rejection criterion found';
    }

    return `${top.criterion} eliminated ${top.count} journeys; strict level D also requires every audited criterion to pass simultaneously.`;
}

function collectiveClass(a, b) {
    if (a.originRegion === b.originRegion && a.destinationRegion === b.destinationRegion) {
        return 'parallel_movement';
    }

    if (a.originRegion !== b.originRegion && a.destinationRegion === b.destinationRegion) {
        return 'converging_movement';
    }

    if (a.originRegion === b.originRegion && a.destinationRegion !== b.destinationRegion) {
        return 'diverging_movement';
    }

    return 'coordinated_movement_candidate';
}

function rangesOverlap(aStart, aEnd, bStart, bEnd) {
    return Math.max(aStart, bStart) <= Math.min(aEnd, bEnd);
}

function transitProximity(a, b) {
    const start = Math.max(a.startExitSecond, b.startExitSecond);
    const end = Math.min(a.arrivalSecond, b.arrivalSecond);
    const distances = [];

    for (let second = start; second <= end; second += 5) {
        const left = metricAt(a.playerIndex, second);
        const right = metricAt(b.playerIndex, second);

        if (left && right) {
            distances.push(distance2d(left, right));
        }
    }

    return average(distances) ?? Infinity;
}

function playerMetrics(playerIndex, startSecond, endSecond) {
    return (metricsByPlayer.get(playerIndex) ?? []).filter(row => row.gameSecond >= startSecond && row.gameSecond <= endSecond);
}

function metricAt(playerIndex, second) {
    const rows = metricsByPlayer.get(playerIndex) ?? [];
    let best = null;

    for (const row of rows) {
        if (!best || Math.abs(row.gameSecond - second) < Math.abs(best.gameSecond - second)) {
            best = row;
        }
    }

    return best ? {
        second: best.gameSecond,
        x: best.x,
        y: best.y,
        z: best.z,
        region: best.region,
        nearestLane: best.nearestLane,
        alive: best.alive
    } : null;
}

function findJourney(journeyId) {
    return regionJourneys.journeys.find(journey => journey.journeyId === journeyId) ?? null;
}

function directionSummary(rows) {
    const first = rows[0];
    const last = rows.at(-1);

    if (!first || !last) {
        return null;
    }

    return {
        headingDegrees: round(Math.atan2(last.y - first.y, last.x - first.x) * 180 / Math.PI),
        dx: round(last.x - first.x),
        dy: round(last.y - first.y)
    };
}

function inferOriginLane(rows) {
    return topCount(countBy(rows.slice(0, 5), row => row.nearestLane ?? 'unknown'))?.key ?? null;
}

function physicalLane(region) {
    return region?.match(/^(lane_\d+)_/)?.[1] ?? null;
}

function isRelevantRegion(region) {
    return region !== 'unknown' && region !== 'between_lanes';
}

function isNeutral(region) {
    return region === 'neutral_center';
}

function isBase(region) {
    return /^base_team_[23]$/.test(region ?? '');
}

function nearestLaneDistance(row) {
    const distances = [ row.distanceLane1, row.distanceLane2, row.distanceLane3 ].filter(Number.isFinite);

    return distances.length > 0 ? Math.min(...distances) : null;
}

function minFinite(values) {
    const finite = values.filter(Number.isFinite);

    return finite.length > 0 ? Math.min(...finite) : null;
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

function increment(map, key) {
    map.set(key, (map.get(key) ?? 0) + 1);
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

function auditSourceFiles() {
    return [
        REGION_MODEL_FILE,
        REGION_TIMELINE_FILE,
        REGION_INTERVALS_FILE,
        MOVEMENT_PARAMETERS_FILE,
        MOVEMENT_METRICS_FILE,
        MOVEMENT_SEGMENTS_FILE,
        REGION_JOURNEYS_FILE,
        ROTATION_CANDIDATES_FILE,
        MOVEMENT_VALIDATION_FILE,
        TIMELINE_FILE,
        HERO_FILE
    ];
}

async function writeJson(file, value) {
    await writeFile(file, `${JSON.stringify(value)}\n`);
}

async function validateOutputs() {
    const files = [
        OUTPUT_AUDIT,
        OUTPUT_BETWEEN,
        OUTPUT_FUNNEL,
        OUTPUT_SENSITIVITY,
        OUTPUT_NEAR_MISS,
        OUTPUT_COLLECTIVE,
        OUTPUT_MANUAL,
        OUTPUT_REVIEW
    ];

    for (const file of files) {
        JSON.parse(await readFile(file, 'utf8'));
        const size = (await stat(file)).size;

        if (size > OUTPUT_SIZE_LIMIT) {
            throw new Error(`${file} is ${size} bytes, above the ${OUTPUT_SIZE_LIMIT} byte limit`);
        }
    }
}
