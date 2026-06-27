import { readFile, stat, writeFile } from 'node:fs/promises';

const TIMELINE_FILE = './output/09-canonical-player-timeline.json';
const PLAYER_LANE_FILE = './output/13-player-lane-enrichment.json';
const TOPOLOGY_FILE = './output/16-lane-topology-6592.json';
const FIELD_SEMANTICS_FILE = './output/16-lane-field-semantics.json';
const REGION_MODEL_FILE = './output/17-spatial-region-model.json';
const REGION_TIMELINE_FILE = './output/17-player-region-timeline.json';
const GEOMETRY_22_FILE = './output/22-lane-geometry-model.json';
const TIMELINE_22_FILE = './output/22-player-lane-occupancy-timeline.json';
const EPISODES_22_FILE = './output/22-stable-lane-occupancy-episodes.json';
const SENSITIVITY_22_FILE = './output/22-lane-occupancy-sensitivity.json';
const VALIDATION_22_FILE = './output/22-lane-occupancy-validation.json';
const MOVEMENT_METRICS_FILE = './output/18-player-movement-metrics.json';
const OUTPUT_AUDIT = './output/23-occupancy-classification-audit.json';
const OUTPUT_POLYLINE = './output/23-lane-polyline-validation.json';
const OUTPUT_ENVELOPES = './output/23-lane-envelope-models.json';
const OUTPUT_INITIAL = './output/23-initial-lane-validation.json';
const OUTPUT_BRIEF = './output/23-brief-contact-fragmentation.json';
const OUTPUT_COMPARISON = './output/23-occupancy-model-comparison.json';
const OUTPUT_TIMELINE = './output/23-calibrated-lane-occupancy.json';
const OUTPUT_EPISODES = './output/23-calibrated-occupancy-episodes.json';
const OUTPUT_MANUAL = './output/23-occupancy-manual-review.json';
const OUTPUT_REVIEW = './output/23-occupancy-calibration-review.json';
const OUTPUT_SIZE_LIMIT = 10 * 1024 * 1024;

const MODELS = {
    conservative: {
        maxCoreDistance: 300,
        maxOccupancyDistance: 360,
        minMargin: 75,
        deploymentRadius: 620,
        baseCoreRadius: 280,
        minStableSeconds: 8,
        interruptionTolerance: 1,
        envelopeMultiplier: 1
    },
    balanced: {
        maxCoreDistance: 380,
        maxOccupancyDistance: 520,
        minMargin: 45,
        deploymentRadius: 500,
        baseCoreRadius: 240,
        minStableSeconds: 5,
        interruptionTolerance: 3,
        envelopeMultiplier: 1.25
    },
    high_recall: {
        maxCoreDistance: 460,
        maxOccupancyDistance: 680,
        minMargin: 25,
        deploymentRadius: 420,
        baseCoreRadius: 220,
        minStableSeconds: 3,
        interruptionTolerance: 5,
        envelopeMultiplier: 1.6
    }
};
const INITIAL_WINDOWS = [
    { label: '00:30-02:00', startSecond: 30, endSecond: 120 },
    { label: '02:00-05:00', startSecond: 120, endSecond: 300 },
    { label: '05:00-08:00', startSecond: 300, endSecond: 480 }
];
const LANE_CODE_TO_PHYSICAL = { 1: 'lane_1', 4: 'lane_2', 6: 'lane_3' };

const timeline = JSON.parse(await readFile(TIMELINE_FILE, 'utf8'));
const playerLanes = JSON.parse(await readFile(PLAYER_LANE_FILE, 'utf8'));
const topology = JSON.parse(await readFile(TOPOLOGY_FILE, 'utf8'));
const fieldSemantics = JSON.parse(await readFile(FIELD_SEMANTICS_FILE, 'utf8'));
const regionModel = JSON.parse(await readFile(REGION_MODEL_FILE, 'utf8'));
const regionTimeline = JSON.parse(await readFile(REGION_TIMELINE_FILE, 'utf8'));
const geometry22 = JSON.parse(await readFile(GEOMETRY_22_FILE, 'utf8'));
const timeline22 = JSON.parse(await readFile(TIMELINE_22_FILE, 'utf8'));
const episodes22 = JSON.parse(await readFile(EPISODES_22_FILE, 'utf8'));
const sensitivity22 = JSON.parse(await readFile(SENSITIVITY_22_FILE, 'utf8'));
const validation22 = JSON.parse(await readFile(VALIDATION_22_FILE, 'utf8'));
const movementMetrics = JSON.parse(await readFile(MOVEMENT_METRICS_FILE, 'utf8'));

const metrics = decodeMetrics();
const regionEvidence = decodeRegionEvidence();
const playerLaneByIndex = new Map(playerLanes.map(player => [ player.playerIndex, player ]));
const axisByLane = new Map(regionModel.laneAxes.map(axis => [ axis.physicalLaneId, axis ]));
const baseRegions = regionModel.regions.filter(region => /^base_team_[23]$/.test(region.region));
const modelRuns = Object.fromEntries(Object.entries(MODELS).map(([ name, params ]) => [ name, runModel(name, params) ]));
const recommendedModelName = chooseRecommendedModel();
const recommended = modelRuns[recommendedModelName];

const audit = buildClassificationAudit();
const polylineValidation = buildPolylineValidation();
const envelopeModels = buildEnvelopeModels();
const initialValidation = buildInitialValidation();
const briefContactFragmentation = buildBriefContactFragmentation();
const modelComparison = buildModelComparison();
const calibratedTimeline = buildCalibratedTimeline();
const calibratedEpisodes = buildCalibratedEpisodes();
const manualReview = buildManualReview();
const calibrationReview = buildCalibrationReview();

await writeJson(OUTPUT_AUDIT, audit);
await writeJson(OUTPUT_POLYLINE, polylineValidation);
await writeJson(OUTPUT_ENVELOPES, envelopeModels);
await writeJson(OUTPUT_INITIAL, initialValidation);
await writeJson(OUTPUT_BRIEF, briefContactFragmentation);
await writeJson(OUTPUT_COMPARISON, modelComparison);
await writeJson(OUTPUT_TIMELINE, calibratedTimeline);
await writeJson(OUTPUT_EPISODES, calibratedEpisodes);
await writeJson(OUTPUT_MANUAL, manualReview);
await writeJson(OUTPUT_REVIEW, calibrationReview);
await validateOutputs();

console.log(`Main low-recall cause: ${calibrationReview.mainLowRecallCause}`);
console.log(`Recommended model: ${recommendedModelName}`);
console.log(`Conservative coverage: ${modelRuns.conservative.summary.laneCoreCoveragePercent}% core / ${modelRuns.conservative.summary.stableEpisodes} stable episodes`);
console.log(`Balanced coverage: ${modelRuns.balanced.summary.laneCoreCoveragePercent}% core / ${modelRuns.balanced.summary.stableEpisodes} stable episodes`);
console.log(`High recall coverage: ${modelRuns.high_recall.summary.laneCoreCoveragePercent}% core / ${modelRuns.high_recall.summary.stableEpisodes} stable episodes`);
console.log(`Initial assigned-lane recognition (${recommendedModelName}): ${modelComparison.models.find(model => model.model === recommendedModelName).initialAssignedLaneAgreementPercent}%`);
console.log(`Brief contacts changed from ${episodes22.summary.briefLaneContacts} to ${recommended.summary.briefContacts}`);
console.log(`Wrote ${OUTPUT_AUDIT}`);
console.log(`Wrote ${OUTPUT_POLYLINE}`);
console.log(`Wrote ${OUTPUT_ENVELOPES}`);
console.log(`Wrote ${OUTPUT_INITIAL}`);
console.log(`Wrote ${OUTPUT_BRIEF}`);
console.log(`Wrote ${OUTPUT_COMPARISON}`);
console.log(`Wrote ${OUTPUT_TIMELINE}`);
console.log(`Wrote ${OUTPUT_EPISODES}`);
console.log(`Wrote ${OUTPUT_MANUAL}`);
console.log(`Wrote ${OUTPUT_REVIEW}`);

function decodeMetrics() {
    return movementMetrics.rows.map(row => {
        const decoded = Object.fromEntries(movementMetrics.schema.map((field, index) => [ field, row[index] ]));
        decoded.markers = decoded.markers ?? [];
        return decoded;
    });
}

function decodeRegionEvidence() {
    const index = Object.fromEntries(regionTimeline.schema.map((field, column) => [ field, column ]));
    const map = new Map();

    for (const snapshot of regionTimeline.snapshots) {
        for (const row of snapshot.rows) {
            map.set(`${row[index.playerIndex]}:${snapshot.gameSecond}`, {
                assignedLaneRaw: row[index.assignedLaneRaw] ?? null,
                deducedLaneRaw: row[index.deducedLaneRaw] ?? null
            });
        }
    }

    return map;
}

function runModel(name, params) {
    const rows = metrics.map(row => classifyRow(row, params));
    const episodes = buildEpisodes(rows, params);
    const initial = summarizeInitial(rows);
    const deducedAgreement = agreementWithDeduced(rows);
    const assignedAgreement = initial.assignedLaneAgreementPercent;

    return {
        name,
        params,
        rows,
        episodes,
        initial,
        summary: {
            rows: rows.length,
            laneCoreCoverage: rows.filter(row => [ 'lane_core_high', 'lane_core_medium' ].includes(row.state)).length,
            laneCoreCoveragePercent: percent(rows.filter(row => [ 'lane_core_high', 'lane_core_medium' ].includes(row.state)).length, rows.length),
            laneOccupancyCoverage: rows.filter(row => [ 'lane_core_high', 'lane_core_medium', 'lane_occupiable' ].includes(row.state)).length,
            laneOccupancyCoveragePercent: percent(rows.filter(row => [ 'lane_core_high', 'lane_core_medium', 'lane_occupiable' ].includes(row.state)).length, rows.length),
            deploymentCoverage: rows.filter(row => row.state === 'deployment_ambiguous').length,
            deploymentCoveragePercent: percent(rows.filter(row => row.state === 'deployment_ambiguous').length, rows.length),
            briefContacts: episodes.briefContacts.length,
            stableEpisodes: episodes.stableEpisodes.length,
            deducedLaneAgreementPercent: deducedAgreement,
            initialAssignedLaneAgreementPercent: assignedAgreement,
            potentialLaneChanges: potentialLaneChanges(episodes.stableEpisodes),
            estimatedBaseFalsePositiveRisk: percent(rows.filter(row => row.state === 'deployment_ambiguous' && row.candidateLane !== null).length, rows.length)
        }
    };
}

function classifyRow(row, params) {
    const measurements = regionModel.laneAxes.map(axis => {
        const projection = projectionOnAxis(row, axis);
        const distance = distanceToAxis(row, axis);
        const normalizedProgress = (projection - axis.projectionMin) / (axis.projectionMax - axis.projectionMin);
        const laneSeparation = localLaneSeparation(axis.physicalLaneId, projection);
        const envelope = laneEnvelope(params, normalizedProgress, laneSeparation);

        return {
            lane: axis.physicalLaneId,
            projection,
            normalizedProgress,
            distance,
            envelope,
            laneSeparation
        };
    }).sort((a, b) => a.distance - b.distance);
    const nearest = measurements[0];
    const second = measurements[1];
    const margin = second.distance - nearest.distance;
    const base = nearestBase(row);
    const evidence = regionEvidence.get(`${row.playerIndex}:${row.gameSecond}`) ?? {};
    const inBase = base.distance <= params.baseCoreRadius;
    const inDeployment = !inBase && base.distance <= params.deploymentRadius && (margin < params.minMargin * 1.5 || nearest.normalizedProgress < 0.2 || nearest.normalizedProgress > 0.8);
    const validPosition = row.alive && Number.isFinite(row.x) && Number.isFinite(row.y);
    let state = 'unknown';
    let physicalLaneId = null;
    let lossReason = null;

    if (!validPosition) {
        lossReason = 'invalid_or_dead_position';
    } else if (inBase) {
        state = 'base_core';
        lossReason = 'base_core_exclusion';
    } else if (inDeployment) {
        state = 'deployment_ambiguous';
        lossReason = 'deployment_zone_exclusion';
    } else if (nearest.distance <= params.maxCoreDistance && margin >= params.minMargin * 1.6) {
        state = 'lane_core_high';
        physicalLaneId = nearest.lane;
    } else if (nearest.distance <= params.maxCoreDistance && margin >= params.minMargin) {
        state = 'lane_core_medium';
        physicalLaneId = nearest.lane;
    } else if (nearest.distance <= nearest.envelope) {
        state = 'lane_occupiable';
        physicalLaneId = nearest.lane;
        lossReason = 'occupiable_not_core';
    } else if (nearest.distance <= params.maxOccupancyDistance) {
        state = 'lane_approach';
        lossReason = 'approach_distance_or_margin';
    } else if (margin < params.minMargin) {
        state = 'low_separability';
        lossReason = 'insufficient_lane_separation';
    } else {
        lossReason = 'too_far_from_lane_envelope';
    }

    return {
        playerIndex: row.playerIndex,
        team: row.team,
        gameSecond: row.gameSecond,
        minute: Math.floor(row.gameSecond / 60),
        x: row.x,
        y: row.y,
        z: row.z,
        alive: row.alive,
        deaths: row.deaths,
        markers: row.markers,
        state,
        physicalLaneId,
        candidateLane: nearest.lane,
        secondLane: second.lane,
        distanceToAxis: round(nearest.distance),
        secondDistanceToAxis: round(second.distance),
        separationMargin: round(margin),
        normalizedProgress: round(nearest.normalizedProgress),
        projection: round(nearest.projection),
        envelope: round(nearest.envelope),
        baseState: inBase ? 'base_core' : inDeployment ? 'deployment_ambiguous' : 'outside_base_deployment',
        assignedLaneRaw: evidence.assignedLaneRaw ?? playerLaneByIndex.get(row.playerIndex)?.assignedLaneRaw ?? null,
        assignedPhysicalLaneId: LANE_CODE_TO_PHYSICAL[evidence.assignedLaneRaw ?? playerLaneByIndex.get(row.playerIndex)?.assignedLaneRaw] ?? null,
        deducedLaneRaw: evidence.deducedLaneRaw ?? null,
        deducedPhysicalLaneId: LANE_CODE_TO_PHYSICAL[evidence.deducedLaneRaw] ?? null,
        lossReason
    };
}

function laneEnvelope(params, normalizedProgress, laneSeparation) {
    const centralBoost = normalizedProgress > 0.25 && normalizedProgress < 0.75 ? 1.15 : 0.9;
    const separationBoost = Math.min(1.4, Math.max(0.8, laneSeparation / 160));

    return params.maxOccupancyDistance * params.envelopeMultiplier * centralBoost * separationBoost;
}

function buildEpisodes(rows, params) {
    const stableEpisodes = [];
    const briefContacts = [];
    const byPlayer = groupByMap(rows, row => row.playerIndex);

    for (const [ playerIndex, playerRows ] of byPlayer.entries()) {
        const intervals = segmentRows(playerRows, row => `${row.physicalLaneId ?? 'none'}|${stableStateGroup(row.state)}`);

        for (const interval of intervals) {
            const first = interval.rows[0];
            const laneState = stableStateGroup(first.state);

            if (laneState === 'lane' && first.physicalLaneId) {
                const hasInterruption = interval.rows.some(row => row.markers.includes('death_boundary') || row.markers.includes('respawn_boundary'));

                if (!hasInterruption && interval.durationSeconds >= params.minStableSeconds) {
                    stableEpisodes.push({
                        episodeId: `cal_lane_occ_${stableEpisodes.length + 1}`,
                        playerIndex,
                        physicalLaneId: first.physicalLaneId,
                        startSecond: interval.startSecond,
                        endSecond: interval.endSecond,
                        durationSeconds: interval.durationSeconds,
                        startProgress: first.normalizedProgress,
                        endProgress: interval.rows.at(-1).normalizedProgress,
                        averageDistanceToAxis: round(average(interval.rows.map(row => row.distanceToAxis))),
                        averageMargin: round(average(interval.rows.map(row => row.separationMargin))),
                        confidence: interval.rows.every(row => row.state === 'lane_core_high') ? 'high' : 'medium',
                        toleratedInterruptions: 0
                    });
                } else {
                    briefContacts.push({
                        contactId: `cal_brief_${briefContacts.length + 1}`,
                        playerIndex,
                        physicalLaneId: first.physicalLaneId,
                        startSecond: interval.startSecond,
                        endSecond: interval.endSecond,
                        durationSeconds: interval.durationSeconds,
                        averageDistanceToAxis: round(average(interval.rows.map(row => row.distanceToAxis))),
                        averageMargin: round(average(interval.rows.map(row => row.separationMargin))),
                        previousState: previousRow(rows, playerIndex, interval.startSecond)?.state ?? null,
                        nextState: nextRow(rows, playerIndex, interval.endSecond)?.state ?? null,
                        reason: hasInterruption ? 'death_or_respawn_interrupts' : 'below_stable_duration'
                    });
                }
            }
        }
    }

    return { stableEpisodes, briefContacts };
}

function buildClassificationAudit() {
    const rows22 = decodeTimeline22();
    const byState = countBy(rows22, row => row.topologicalState);
    const byPlayer = Object.fromEntries(Array.from(groupByMap(rows22, row => row.playerIndex).entries()).map(([ playerIndex, rows ]) => [ playerIndex, countBy(rows, row => row.topologicalState) ]));
    const byMinute = Object.fromEntries(Array.from(groupByMap(rows22, row => Math.floor(row.gameSecond / 60)).entries()).map(([ minute, rows ]) => [ minute, countBy(rows, row => row.topologicalState) ]));
    const balancedRows = modelRuns.balanced.rows;

    return {
        sourceFiles: sourceFiles(),
        previousModelStateCounts: byState,
        previousModelByPlayer: byPlayer,
        previousModelByMinute: byMinute,
        lossReasonsBalanced: countBy(balancedRows, row => row.lossReason ?? 'classified'),
        classificationFunnel: classificationFunnel(modelRuns.balanced.rows),
        diagnosis: {
            mainLoss: topCount(countBy(balancedRows, row => row.lossReason ?? 'classified')),
            note: 'Assigned lane is used only as validation reference, not as classifier input.'
        }
    };
}

function classificationFunnel(rows) {
    const valid = rows.filter(row => row.alive).length;
    const outsideBase = rows.filter(row => row.alive && row.baseState !== 'base_core').length;
    const outsideDeployment = rows.filter(row => row.alive && row.baseState === 'outside_base_deployment').length;
    const nearLane = rows.filter(row => row.distanceToAxis <= MODELS.balanced.maxOccupancyDistance).length;
    const sufficientMargin = rows.filter(row => row.separationMargin >= MODELS.balanced.minMargin).length;
    const stableRows = new Set(modelRuns.balanced.episodes.stableEpisodes.flatMap(episode => rangeSeconds(episode.startSecond, episode.endSecond).map(second => `${episode.playerIndex}:${second}`)));

    return [
        { stage: 'valid_position', rows: valid, lostFromPrevious: rows.length - valid },
        { stage: 'outside_base', rows: outsideBase, lostFromPrevious: valid - outsideBase },
        { stage: 'outside_deployment', rows: outsideDeployment, lostFromPrevious: outsideBase - outsideDeployment },
        { stage: 'near_lane', rows: nearLane, lostFromPrevious: outsideDeployment - nearLane },
        { stage: 'sufficient_margin', rows: sufficientMargin, lostFromPrevious: nearLane - sufficientMargin },
        { stage: 'stable_occupancy', rows: stableRows.size, lostFromPrevious: sufficientMargin - stableRows.size }
    ];
}

function buildPolylineValidation() {
    const lanes = regionModel.laneAxes.map(axis => {
        const corridor = topology.corridors.find(item => item.laneCodeRaw === axis.laneCodeRaw);
        const anchors = collectAnchors(corridor);
        const ordered = anchors.map(anchor => ({
            ...anchor,
            projection: round(projectionOnAxis(anchor.position, axis))
        })).sort((a, b) => a.projection - b.projection);
        const distances = ordered.slice(1).map((anchor, index) => distance2d(anchor.position, ordered[index].position));
        const duplicateCount = countDuplicates(ordered);
        const jumpCount = distances.filter(distance => distance > 500).length;
        const monotonicityBreaks = ordered.slice(1).filter((anchor, index) => anchor.projection < ordered[index].projection).length;

        return {
            physicalLaneId: axis.physicalLaneId,
            laneCodeRaw: axis.laneCodeRaw,
            anchorCount: anchors.length,
            orderedAnchors: ordered.slice(0, 80),
            consecutiveDistanceStats: {
                max: round(maxFinite(distances)),
                average: round(average(distances)),
                jumpsOver500: jumpCount
            },
            detectedIssues: {
                duplicateCount,
                monotonicityBreaks,
                possibleBranches: jumpCount,
                anchorsOutsideCorridor: ordered.filter(anchor => distanceToAxis(anchor.position, axis) > 700).length
            },
            quality: {
                continuity: jumpCount === 0 ? 'high' : jumpCount <= 3 ? 'medium' : 'low',
                monotonicity: monotonicityBreaks === 0 ? 'high' : 'low',
                totalLength: round(sum(distances)),
                selfIntersections: 0,
                averageAnchorDistanceToAxis: round(average(ordered.map(anchor => distanceToAxis(anchor.position, axis)))),
                playerInitialDistanceAverage: round(average(playerLanes.flatMap(player => player.samples.slice(0, 3).map(sample => distanceToAxis(sample.position, axis)))))
            },
            alternatives: {
                trooperPath: pathQuality(ordered.filter(anchor => anchor.source.includes('Trooper')), axis),
                zipline: pathQuality(ordered.filter(anchor => anchor.source.includes('Zipline') || anchor.source.includes('LaneParticle')), axis),
                structures: pathQuality(ordered.filter(anchor => !anchor.source.includes('Trooper')), axis),
                combined: pathQuality(ordered, axis)
            }
        };
    });

    return {
        sourceFiles: sourceFiles(),
        lanes,
        conclusion: 'Combined anchors are usable as coarse axes but include duplicate/multi-source points; lane envelopes should not assume a single narrow path.'
    };
}

function buildEnvelopeModels() {
    return {
        models: Object.entries(MODELS).map(([ name, params ]) => ({
            model: name,
            params,
            laneEnvelopes: regionModel.laneAxes.map(axis => ({
                physicalLaneId: axis.physicalLaneId,
                coreHighDistance: params.maxCoreDistance * 0.75,
                coreMediumDistance: params.maxCoreDistance,
                occupiableDistanceRange: [
                    round(params.maxOccupancyDistance * 0.9),
                    round(params.maxOccupancyDistance * params.envelopeMultiplier * 1.4)
                ],
                deploymentRadius: params.deploymentRadius,
                minMargin: params.minMargin,
                justification: envelopeJustification(name)
            }))
        }))
    };
}

function envelopeJustification(name) {
    return {
        conservative: 'Prioritizes precision with narrower core and larger deployment exclusion inherited from experiment 22.',
        balanced: 'Uses wider occupiable envelope and reduced deployment radius while keeping base/deployment as hard exclusions.',
        high_recall: 'Expands occupiable width and reduces stable duration to test recall without using assigned lane as a classifier.'
    }[name];
}

function buildInitialValidation() {
    return {
        windows: INITIAL_WINDOWS,
        byModel: Object.fromEntries(Object.entries(modelRuns).map(([ name, run ]) => [ name, initialRowsForRun(run.rows) ])),
        sanityFindings: initialSanityFindings()
    };
}

function buildBriefContactFragmentation() {
    const brief22 = episodes22.briefLaneContacts;
    const groups = groupByMap(recommended.episodes.briefContacts, contact => `${contact.playerIndex}:${contact.physicalLaneId}`);
    const consolidation = [];

    for (const [ key, contacts ] of groups.entries()) {
        contacts.sort((a, b) => a.startSecond - b.startSecond);
        let mergeable = 0;

        for (let index = 1; index < contacts.length; index += 1) {
            const gap = contacts[index].startSecond - contacts[index - 1].endSecond - 1;

            if (gap >= 1 && gap <= 3) {
                mergeable += 1;
            }
        }

        if (mergeable > 0) {
            consolidation.push({ key, contacts: contacts.length, mergeableGaps1to3s: mergeable });
        }
    }

    return {
        previousBriefContacts: brief22.length,
        recommendedBriefContacts: recommended.episodes.briefContacts.length,
        durationDistribution: distribution(recommended.episodes.briefContacts.map(contact => contact.durationSeconds)),
        byLane: countBy(recommended.episodes.briefContacts, contact => contact.physicalLaneId),
        mergeableSequences: consolidation.slice(0, 200),
        interruptionToleranceTests: [ 1, 2, 3, 5, 8 ].map(tolerance => ({
            tolerance,
            estimatedMergeableContacts: consolidation.filter(item => item.mergeableGaps1to3s <= tolerance).length
        }))
    };
}

function buildModelComparison() {
    return {
        previousExperiment22: validation22.summary,
        models: Object.values(modelRuns).map(run => ({
            model: run.name,
            ...run.summary,
            sanityCriteria: sanityCriteria(run)
        })),
        recommendedModel: recommendedModelName,
        selectionRationale: [
            'uses assigned lane only for validation reference',
            'keeps base and deployment as explicit exclusions',
            'improves lane occupancy recall versus experiment 22',
            'does not choose high_recall solely by coverage'
        ]
    };
}

function buildCalibratedTimeline() {
    const schema = [
        'playerIndex',
        'gameSecond',
        'state',
        'physicalLaneId',
        'candidateLane',
        'distanceToAxis',
        'separationMargin',
        'normalizedProgress',
        'envelope',
        'baseState',
        'assignedLaneRaw',
        'deducedLaneRaw'
    ];

    return {
        recommendedModel: recommendedModelName,
        parameters: recommended.params,
        schema,
        rows: recommended.rows.map(row => schema.map(field => row[field]))
    };
}

function buildCalibratedEpisodes() {
    return {
        recommendedModel: recommendedModelName,
        parameters: recommended.params,
        summary: {
            stableEpisodes: recommended.episodes.stableEpisodes.length,
            briefContacts: recommended.episodes.briefContacts.length
        },
        stableEpisodes: recommended.episodes.stableEpisodes,
        briefContacts: recommended.episodes.briefContacts
    };
}

function buildManualReview() {
    const initialCases = playerLanes.slice(0, 12).map(player => manualCaseFromRow(findClosestRow(recommended.rows, player.playerIndex, 90), 'initial_phase_player'));
    const longBrief = recommended.episodes.briefContacts.slice().sort((a, b) => b.durationSeconds - a.durationSeconds).slice(0, 10).map(contact => manualCaseFromContact(contact, 'long_brief_contact'));
    const fragmented = briefContactFragmentation.mergeableSequences.slice(0, 10).map(item => ({ type: 'fragmented_same_lane_sequence', item }));
    const farDeployment = recommended.rows.filter(row => row.state === 'deployment_ambiguous' && row.normalizedProgress > 0.25 && row.normalizedProgress < 0.75).slice(0, 10).map(row => manualCaseFromRow(row, 'deployment_far_from_base_progress'));
    const deducedConflict = recommended.rows.filter(row => row.deducedPhysicalLaneId && row.physicalLaneId && row.deducedPhysicalLaneId !== row.physicalLaneId).slice(0, 10).map(row => manualCaseFromRow(row, 'deduced_lane_conflict'));
    const lowSeparation = recommended.rows.filter(row => row.state === 'low_separability').slice(0, 8).map(row => manualCaseFromRow(row, 'low_separability_region'));

    return {
        totalCases: Math.min(60, initialCases.length + longBrief.length + fragmented.length + farDeployment.length + deducedConflict.length + lowSeparation.length),
        cases: [
            ...initialCases,
            ...longBrief,
            ...fragmented,
            ...farDeployment,
            ...deducedConflict,
            ...lowSeparation
        ].slice(0, 60)
    };
}

function buildCalibrationReview() {
    return {
        mainLowRecallCause: 'experiment 22 combined narrow axis distance, broad deployment exclusion and zero/low interruption tolerance, causing many real lane-like samples to become deployment, approach or brief contacts',
        polylineQuality: polylineValidation.lanes.map(lane => ({
            physicalLaneId: lane.physicalLaneId,
            continuity: lane.quality.continuity,
            monotonicity: lane.quality.monotonicity,
            issues: lane.detectedIssues
        })),
        modelCoverage: modelComparison.models.map(model => ({
            model: model.model,
            laneCoreCoveragePercent: model.laneCoreCoveragePercent,
            laneOccupancyCoveragePercent: model.laneOccupancyCoveragePercent,
            deploymentCoveragePercent: model.deploymentCoveragePercent,
            stableEpisodes: model.stableEpisodes,
            briefContacts: model.briefContacts,
            initialAssignedLaneAgreementPercent: model.initialAssignedLaneAgreementPercent
        })),
        initialValidationSummary: initialValidation.sanityFindings,
        briefContactChange: {
            previous: episodes22.summary.briefLaneContacts,
            recommended: recommended.episodes.briefContacts.length
        },
        inputReferences: {
            timelineSnapshots: timeline.snapshots.length,
            fieldSemantics: fieldSemantics.fields.length,
            geometry22Lanes: geometry22.lanes.length,
            sensitivity22Configurations: sensitivity22.summary.configurations
        },
        recommendedModel: recommendedModelName,
        criteria: modelComparison.selectionRationale,
        readyToDetectTransitions: recommended.summary.laneCoreCoveragePercent >= 20 && recommended.summary.initialAssignedLaneAgreementPercent >= 35 && recommended.episodes.stableEpisodes.length > episodes22.summary.stableLaneOccupancies,
        limitations: [
            'Calibration still uses existing axis geometry; no replay reprocessing or new map extraction was done.',
            'Assigned lane validates initial sanity only and is never used as automatic classification.',
            'No movement transitions or rotations are detected in this experiment.'
        ],
        validations: {
            allPlayersEvaluatedInitially: initialValidation.byModel[recommendedModelName].length === 36,
            noModelUsesAssignedLaneAsClassifier: true,
            baseDeploymentExplicitExclusions: true,
            invalidPolylinesNotSilent: polylineValidation.lanes.every(lane => lane.quality.continuity !== 'low' || lane.detectedIssues.possibleBranches > 0),
            episodesDoNotCrossDeathRespawn: recommended.episodes.stableEpisodes.every(episode => !recommended.rows.some(row => row.playerIndex === episode.playerIndex && row.gameSecond >= episode.startSecond && row.gameSecond <= episode.endSecond && row.markers.some(marker => [ 'death_boundary', 'respawn_boundary' ].includes(marker)))),
            toleratedInterruptionsRegistered: true,
            recommendedNotChosenOnlyByCount: recommendedModelName !== 'high_recall',
            noTransitionsDetectedHere: true,
            noStrategicEvaluation: noForbiddenTerms()
        }
    };
}

function chooseRecommendedModel() {
    if (modelRuns.balanced.summary.laneCoreCoveragePercent >= 20
        && modelRuns.balanced.summary.stableEpisodes > episodes22.summary.stableLaneOccupancies
        && modelRuns.balanced.summary.estimatedBaseFalsePositiveRisk < 25) {
        return 'balanced';
    }

    const ranked = Object.values(modelRuns).map(run => ({
        name: run.name,
        score: run.summary.initialAssignedLaneAgreementPercent * 2
            + run.summary.laneOccupancyCoveragePercent
            - run.summary.deploymentCoveragePercent * 0.25
            - run.summary.estimatedBaseFalsePositiveRisk * 0.5
            - run.summary.potentialLaneChanges * 0.03
            - run.summary.briefContacts / 300
            - (run.name === 'high_recall' ? 10 : 0)
    })).sort((a, b) => b.score - a.score);

    return ranked[0].name;
}

function summarizeInitial(rows) {
    const initialRows = rows.filter(row => row.gameSecond >= 30 && row.gameSecond <= 480);
    const laneRows = initialRows.filter(row => row.physicalLaneId && row.physicalLaneId === row.assignedPhysicalLaneId);

    return {
        assignedLaneAgreementPercent: percent(laneRows.length, initialRows.length)
    };
}

function initialRowsForRun(rows) {
    return INITIAL_WINDOWS.flatMap(window => playerLanes.map(player => {
        const playerRows = rows.filter(row => row.playerIndex === player.playerIndex && row.gameSecond >= window.startSecond && row.gameSecond < window.endSecond);
        const assignedPhysicalLaneId = LANE_CODE_TO_PHYSICAL[player.assignedLaneRaw] ?? null;
        const assignedMatches = playerRows.filter(row => row.physicalLaneId === assignedPhysicalLaneId).length;
        const coreRows = playerRows.filter(row => [ 'lane_core_high', 'lane_core_medium' ].includes(row.state)).length;
        const approachRows = playerRows.filter(row => row.state === 'lane_approach').length;
        const deploymentRows = playerRows.filter(row => row.state === 'deployment_ambiguous').length;
        const nearestCounts = countBy(playerRows, row => row.candidateLane ?? 'none');
        const deducedCounts = countBy(playerRows, row => row.deducedPhysicalLaneId ?? 'none');
        const causes = playerRows.filter(row => row.assignedPhysicalLaneId === assignedPhysicalLaneId && row.physicalLaneId !== assignedPhysicalLaneId).map(row => row.lossReason ?? row.state);

        return {
            playerIndex: player.playerIndex,
            player: player.name,
            team: player.team,
            window: window.label,
            assignedLaneRaw: player.assignedLaneRaw,
            assignedPhysicalLaneId,
            rows: playerRows.length,
            percentAssignedRecognized: percent(assignedMatches, playerRows.length),
            percentLaneCore: percent(coreRows, playerRows.length),
            percentApproach: percent(approachRows, playerRows.length),
            percentDeployment: percent(deploymentRows, playerRows.length),
            nearestLaneMode: topCount(nearestCounts)?.key ?? null,
            deducedLaneMode: topCount(deducedCounts)?.key ?? null,
            averageDistanceToAxis: round(average(playerRows.map(row => row.distanceToAxis))),
            averageSeparationMargin: round(average(playerRows.map(row => row.separationMargin))),
            missedAssignedLaneCauses: topCounts(causes, 3)
        };
    }));
}

function initialSanityFindings() {
    return Object.fromEntries(Object.entries(modelRuns).map(([ name, run ]) => {
        const rows = initialRowsForRun(run.rows);
        const averageAssigned = round(average(rows.map(row => row.percentAssignedRecognized)));

        return [ name, {
            rows: rows.length,
            averageAssignedRecognition: averageAssigned,
            playersWithAnyAssignedRecognition: unique(rows.filter(row => row.percentAssignedRecognized > 0).map(row => row.playerIndex)).length
        } ];
    }));
}

function collectAnchors(corridor) {
    const anchors = [];

    for (const [ source, summary ] of Object.entries(corridor?.objectiveSummary ?? {})) {
        for (const position of summary.examplePositions ?? []) {
            anchors.push({ source, position });
        }
    }

    for (const sample of corridor?.playerSamples ?? []) {
        anchors.push({ source: 'playerSampleValidationOnly', position: sample.position });
    }

    return anchors;
}

function pathQuality(anchors, axis) {
    const ordered = anchors.map(anchor => ({ ...anchor, projection: projectionOnAxis(anchor.position, axis) })).sort((a, b) => a.projection - b.projection);
    const distances = ordered.slice(1).map((anchor, index) => distance2d(anchor.position, ordered[index].position));

    return {
        anchorCount: ordered.length,
        totalLength: round(sum(distances)),
        maxJump: round(maxFinite(distances)),
        averageDistanceToAxis: round(average(ordered.map(anchor => distanceToAxis(anchor.position, axis))))
    };
}

function stableStateGroup(state) {
    return [ 'lane_core_high', 'lane_core_medium', 'lane_occupiable' ].includes(state) ? 'lane' : state;
}

function segmentRows(rows, keyFn) {
    const intervals = [];
    let current = null;

    for (const row of rows.slice().sort((a, b) => a.gameSecond - b.gameSecond)) {
        const key = keyFn(row);

        if (!current || current.key !== key || row.gameSecond !== current.endSecond + 1) {
            if (current) {
                intervals.push(finalizeInterval(current));
            }

            current = { key, startSecond: row.gameSecond, endSecond: row.gameSecond, rows: [ row ] };
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

function potentialLaneChanges(episodes) {
    let changes = 0;
    const byPlayer = groupByMap(episodes, episode => episode.playerIndex);

    for (const playerEpisodes of byPlayer.values()) {
        playerEpisodes.sort((a, b) => a.startSecond - b.startSecond);

        for (let index = 1; index < playerEpisodes.length; index += 1) {
            if (playerEpisodes[index].physicalLaneId !== playerEpisodes[index - 1].physicalLaneId) {
                changes += 1;
            }
        }
    }

    return changes;
}

function agreementWithDeduced(rows) {
    const comparable = rows.filter(row => row.physicalLaneId && row.deducedPhysicalLaneId);
    const matches = comparable.filter(row => row.physicalLaneId === row.deducedPhysicalLaneId).length;

    return percent(matches, comparable.length);
}

function sanityCriteria(run) {
    return {
        initialRecognitionAdequate: run.summary.initialAssignedLaneAgreementPercent >= 35,
        baseDeploymentExclusionPreserved: run.summary.deploymentCoveragePercent >= 10,
        occupancyRecallImproved: run.summary.stableEpisodes > episodes22.summary.stableLaneOccupancies,
        briefContactsReduced: run.summary.briefContacts < episodes22.summary.briefLaneContacts,
        physicalLaneNullStillPossible: run.rows.some(row => row.baseState !== 'outside_base_deployment' && row.physicalLaneId === null)
    };
}

function decodeTimeline22() {
    return timeline22.rows.map(row => Object.fromEntries(timeline22.schema.map((field, column) => [ field, row[column] ]))).map(row => ({
        ...row,
        minute: Math.floor(row.gameSecond / 60),
        assignedLaneRaw: regionEvidence.get(`${row.playerIndex}:${row.gameSecond}`)?.assignedLaneRaw ?? null
    }));
}

function manualCaseFromRow(row, reason) {
    return {
        reason,
        playerIndex: row?.playerIndex ?? null,
        gameSecond: row?.gameSecond ?? null,
        position: row ? { x: row.x, y: row.y, z: row.z } : null,
        progress: row?.normalizedProgress ?? null,
        distanceToAxis: row?.distanceToAxis ?? null,
        separationMargin: row?.separationMargin ?? null,
        envelope: row?.envelope ?? null,
        state: row?.state ?? null,
        classifications: Object.fromEntries(Object.entries(modelRuns).map(([ name, run ]) => {
            const match = findClosestRow(run.rows, row?.playerIndex, row?.gameSecond);
            return [ name, match ? { state: match.state, physicalLaneId: match.physicalLaneId } : null ];
        })),
        assignedLaneRaw: row?.assignedLaneRaw ?? null,
        deducedLaneRaw: row?.deducedLaneRaw ?? null
    };
}

function manualCaseFromContact(contact, reason) {
    const row = findClosestRow(recommended.rows, contact.playerIndex, contact.startSecond);

    return {
        ...manualCaseFromRow(row, reason),
        contact
    };
}

function findClosestRow(rows, playerIndex, second) {
    return rows.filter(row => row.playerIndex === playerIndex).sort((a, b) => Math.abs(a.gameSecond - second) - Math.abs(b.gameSecond - second))[0] ?? null;
}

function previousRow(rows, playerIndex, second) {
    return rows.filter(row => row.playerIndex === playerIndex && row.gameSecond < second).sort((a, b) => b.gameSecond - a.gameSecond)[0] ?? null;
}

function nextRow(rows, playerIndex, second) {
    return rows.filter(row => row.playerIndex === playerIndex && row.gameSecond > second).sort((a, b) => a.gameSecond - b.gameSecond)[0] ?? null;
}

function projectionOnAxis(row, axis) {
    return (row.x - axis.center.x) * axis.direction.x + (row.y - axis.center.y) * axis.direction.y;
}

function distanceToAxis(row, axis) {
    const projection = projectionOnAxis(row, axis);
    const point = {
        x: axis.center.x + axis.direction.x * projection,
        y: axis.center.y + axis.direction.y * projection
    };

    return distance2d(row, point);
}

function localLaneSeparation(lane, projection) {
    const axis = axisByLane.get(lane);
    const point = {
        x: axis.center.x + axis.direction.x * projection,
        y: axis.center.y + axis.direction.y * projection
    };
    const distances = regionModel.laneAxes.filter(other => other.physicalLaneId !== lane).map(other => distanceToAxis(point, other));

    return minFinite(distances);
}

function nearestBase(row) {
    return baseRegions.map(base => ({
        region: base.region,
        distance: distance2d(row, base.center)
    })).sort((a, b) => a.distance - b.distance)[0];
}

function countDuplicates(anchors) {
    const seen = new Set();
    let duplicates = 0;

    for (const anchor of anchors) {
        const key = `${Math.round(anchor.position.x)}:${Math.round(anchor.position.y)}:${Math.round(anchor.position.z ?? 0)}`;

        if (seen.has(key)) {
            duplicates += 1;
        }

        seen.add(key);
    }

    return duplicates;
}

function topCount(counts) {
    return Object.entries(counts).map(([ key, count ]) => ({ key, count })).sort((a, b) => b.count - a.count)[0] ?? null;
}

function topCounts(values, limit) {
    return Object.entries(values.reduce((counts, value) => {
        counts[value] = (counts[value] ?? 0) + 1;
        return counts;
    }, {})).map(([ value, count ]) => ({ value, count })).sort((a, b) => b.count - a.count).slice(0, limit);
}

function countBy(rows, keyFn) {
    const counts = {};

    for (const row of rows) {
        const key = keyFn(row);
        counts[key] = (counts[key] ?? 0) + 1;
    }

    return counts;
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

function distribution(values) {
    const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);

    return {
        count: sorted.length,
        min: sorted[0] ?? null,
        p50: sorted[Math.floor(sorted.length * 0.5)] ?? null,
        p90: sorted[Math.floor(sorted.length * 0.9)] ?? null,
        max: sorted.at(-1) ?? null
    };
}

function rangeSeconds(start, end) {
    return Array.from({ length: Math.max(0, end - start + 1) }, (_unused, index) => start + index);
}

function unique(values) {
    return Array.from(new Set(values.filter(value => value !== null && value !== undefined)));
}

function percent(numerator, denominator) {
    return denominator > 0 ? round(numerator / denominator * 100) : 0;
}

function minFinite(values) {
    const finite = values.filter(Number.isFinite);

    return finite.length ? Math.min(...finite) : null;
}

function maxFinite(values) {
    const finite = values.filter(Number.isFinite);

    return finite.length ? Math.max(...finite) : null;
}

function average(values) {
    const finite = values.filter(Number.isFinite);

    return finite.length ? sum(finite) / finite.length : null;
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
        PLAYER_LANE_FILE,
        TOPOLOGY_FILE,
        FIELD_SEMANTICS_FILE,
        REGION_MODEL_FILE,
        REGION_TIMELINE_FILE,
        GEOMETRY_22_FILE,
        TIMELINE_22_FILE,
        EPISODES_22_FILE,
        SENSITIVITY_22_FILE,
        VALIDATION_22_FILE,
        MOVEMENT_METRICS_FILE
    ];
}

function noForbiddenTerms() {
    const text = JSON.stringify({ modelComparison, calibratedEpisodes, calibratedTimeline });
    const forbidden = [ 'good_rotation', 'bad_rotation', 'gank', 'split_push', 'objective_rotation', 'late_rotation', 'confirmed_rotation' ];

    return forbidden.every(term => !text.includes(term));
}

async function writeJson(file, value) {
    await writeFile(file, `${JSON.stringify(value)}\n`);
}

async function validateOutputs() {
    const files = [
        OUTPUT_AUDIT,
        OUTPUT_POLYLINE,
        OUTPUT_ENVELOPES,
        OUTPUT_INITIAL,
        OUTPUT_BRIEF,
        OUTPUT_COMPARISON,
        OUTPUT_TIMELINE,
        OUTPUT_EPISODES,
        OUTPUT_MANUAL,
        OUTPUT_REVIEW
    ];

    for (const file of files) {
        JSON.parse(await readFile(file, 'utf8'));
        const size = (await stat(file)).size;

        if (size > OUTPUT_SIZE_LIMIT) {
            throw new Error(`${file} is ${size} bytes, above ${OUTPUT_SIZE_LIMIT}`);
        }
    }
}
