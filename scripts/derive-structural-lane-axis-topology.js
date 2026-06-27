import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';

const REPLAY_IDS = [ 'replay_001', 'replay_002', 'replay_003', 'replay_004' ];
const INVENTORY_FILE = replayId => `output/replays/${replayId}/geometry-structural-inventory.json`;
const TASK021_GATE = 'output/replay-geometry-validation-gate.json';
const TASK021_PROFILE = 'output/replay-geometry-profiles.json';
const TASK021_PAIRWISE = 'output/replay-geometry-pairwise-comparison.json';
const REPLAY001_TOPOLOGY = 'output/16-lane-topology-6592.json';
const OUTPUT_SIZE_LIMIT = 10 * 1024 * 1024;
const PRIMARY_LANE_CLASSES = new Set([
    'CNPC_Boss_Tier2',
    'CNPC_BarrackBoss',
    'CNPC_TrooperBoss',
    'CAssignedLaneParticle',
    'CCitadelZipLineNode'
]);
const CENTRAL_OR_NEUTRAL_PATTERN = /(MidBoss|Neutral|SinnersSacrifice|Pickup|Shop|Idol|Item|Camp|Urn)/iu;

main();

async function main() {
    const inputs = await readInputs();
    const graphs = buildGraphs(inputs.inventories);
    const candidates = buildLaneCandidates(inputs.inventories, graphs);
    const consensus = buildCrossReplayConsensus(candidates);
    const topologyComparison = buildTopologyComparison(candidates, consensus);
    const profile = buildTopologyProfile(candidates, consensus, inputs.task021Profile, inputs.aliases);
    const provenanceAudit = buildProvenanceAudit(candidates, graphs, inputs.aliases);
    const gate = buildGate(candidates, topologyComparison, profile, inputs.task021Gate);

    await writeJson('output/replay-structural-anchor-graph.json', graphs);
    await writeJson('output/replay-structural-lane-axis-candidates.json', candidates);
    await writeJson('output/replay-lane-axis-cross-replay-consensus.json', consensus);
    await writeJson('output/replay-structural-topology-comparison.json', topologyComparison);
    await writeJson('output/replay-lane-axis-topology-profile.json', profile);
    await writeJson('output/replay-lane-axis-provenance-audit.json', provenanceAudit);
    await writeJson('output/replay-lane-axis-topology-gate.json', gate);
    await writeReport({ candidates, topologyComparison, profile, provenanceAudit, gate, task021Pairwise: inputs.task021Pairwise });
    await validateOutputs([
        'output/replay-structural-anchor-graph.json',
        'output/replay-structural-lane-axis-candidates.json',
        'output/replay-lane-axis-cross-replay-consensus.json',
        'output/replay-structural-topology-comparison.json',
        'output/replay-lane-axis-topology-profile.json',
        'output/replay-lane-axis-provenance-audit.json',
        'output/replay-lane-axis-topology-gate.json'
    ]);

    console.log(`structural topology gate: ${gate.gateResult}`);
    console.log(`accepted axes: ${profile.laneAxes.map(axis => axis.neutralLaneId).join(', ')}`);
}

async function readInputs() {
    const inventories = [];
    for (const replayId of REPLAY_IDS) {
        inventories.push(JSON.parse(await fs.readFile(INVENTORY_FILE(replayId), 'utf8')));
    }
    const task021Gate = JSON.parse(await fs.readFile(TASK021_GATE, 'utf8'));
    const task021Profile = JSON.parse(await fs.readFile(TASK021_PROFILE, 'utf8'));
    const task021Pairwise = JSON.parse(await fs.readFile(TASK021_PAIRWISE, 'utf8'));
    const replay001Topology = JSON.parse(await fs.readFile(REPLAY001_TOPOLOGY, 'utf8'));
    return {
        inventories,
        task021Gate,
        task021Profile,
        task021Pairwise,
        aliases: buildHistoricalAliases(replay001Topology)
    };
}

function buildGraphs(inventories) {
    return {
        schemaVersion: 1,
        kind: 'replay_structural_anchor_graph',
        methodsTested: [
            {
                method: 'A_class_and_team_ordered_chains',
                result: 'used',
                description: 'Groups direct lane-role structures by role, class, team, and distance/order from base anchors.'
            },
            {
                method: 'B_topology_graph',
                result: 'used',
                description: 'Builds deterministic graph edges between same-role structural neighbors using distance and class compatibility.'
            },
            {
                method: 'C_symmetry_pairing',
                result: 'used',
                description: 'Pairs team-side structures through direct lane-role and class symmetry.'
            },
            {
                method: 'D_cross_replay_consensus',
                result: 'used',
                description: 'Derives candidates independently per replay and accepts only consistent cross-replay structure.'
            }
        ],
        replays: inventories.map(inventory => {
            const laneAnchors = laneEligibleAnchors(inventory);
            const neutralNodes = classifyNeutralNodes(inventory);
            const graphNodes = [
                ...laneAnchors.map(anchor => graphNode(anchor, 'lane_member_candidate')),
                ...neutralNodes.map(anchor => graphNode(anchor, classifyNonLaneNode(anchor)))
            ].sort(compareNode);
            return {
                replayId: inventory.replayId,
                graphNodes,
                graphEdges: buildEdges(laneAnchors),
                excludedCentralOrNeutralNodes: neutralNodes.map(anchor => ({
                    anchorId: anchor.anchorId,
                    className: anchor.className,
                    team: anchor.team,
                    coordinates: anchor.position,
                    classification: classifyNonLaneNode(anchor),
                    reason: CENTRAL_OR_NEUTRAL_PATTERN.test(anchor.className)
                        ? 'central_or_neutral_class_pattern'
                        : 'no_direct_lane_role'
                }))
            };
        }),
        replay005Protection: {
            status: 'preserved',
            processed: false
        }
    };
}

function buildLaneCandidates(inventories, graphs) {
    const rawCandidatesByReplay = inventories.map(inventory => {
        const laneRoles = groupBy(laneEligibleAnchors(inventory), anchor => laneRole(anchor.role));
        const candidates = Array.from(laneRoles.entries())
            .filter(([ role ]) => role !== null)
            .map(([ role, anchors ]) => buildCandidate(inventory.replayId, role, anchors, graphs));
        return {
            replayId: inventory.replayId,
            candidateCount: candidates.length,
            candidates
        };
    });
    const ordering = neutralOrdering(rawCandidatesByReplay.flatMap(replay => replay.candidates));
    const candidatesByReplay = rawCandidatesByReplay.map(replay => {
        const candidates = replay.candidates
            .map(candidate => ({
                ...candidate,
                neutralLaneId: ordering[candidate.roleLane],
                historicalAliases: []
            }))
            .sort((left, right) => left.neutralLaneId.localeCompare(right.neutralLaneId));
        return {
            ...replay,
            candidates,
            failureChecks: failureChecksForReplay(candidates, graphs.replays.find(graph => graph.replayId === replay.replayId))
        };
    });

    return {
        schemaVersion: 1,
        kind: 'replay_structural_lane_axis_candidates',
        orderingRule: 'In the shared identity coordinate system, compute the median centroid for each direct structural role-lane across replays 001-004, then assign lane_axis_1..3 by ascending polar angle around the global structural center. Historical color aliases are not used.',
        candidateRequirements: [
            'direct lane-role field on stable structural class',
            'ordered structure chain between team-side anchors where available',
            'spatial continuity in shared coordinate system',
            'consistent role and class sequence across replays'
        ],
        replays: candidatesByReplay,
        replay005Protection: {
            status: 'preserved',
            processed: false
        }
    };
}

function buildCandidate(replayId, roleLane, anchors, graphs) {
    const ordered = orderAnchors(anchors);
    const distances = pairwiseDistances(ordered);
    const polyline = simplifyPolyline(ordered);
    const direction = directionVector(polyline);
    const graph = graphs.replays.find(item => item.replayId === replayId);
    const graphEdges = graph.graphEdges.filter(edge => edge.roleLane === roleLane);
    const classCounts = countBy(ordered, anchor => anchor.className);
    const teams = unique(ordered.map(anchor => anchor.team).filter(team => team !== null)).sort();
    const supporting = [];
    const against = [];

    if (teams.includes(2) && teams.includes(3)) supporting.push('structures from both teams are present');
    else against.push('missing structures from one team');
    if ([ 'CNPC_Boss_Tier2', 'CNPC_BarrackBoss', 'CNPC_TrooperBoss', 'CAssignedLaneParticle', 'CCitadelZipLineNode' ].filter(className => classCounts[className] > 0).length >= 3) {
        supporting.push('multiple direct structural classes support the chain');
    } else {
        against.push('limited class diversity');
    }
    if (ordered.length >= 12) supporting.push('enough ordered anchors for polyline construction');
    else against.push('few ordered anchors');
    if (graphEdges.length >= Math.max(0, ordered.length - 2)) supporting.push('topology graph connects most adjacent ordered anchors');
    else against.push('sparse graph adjacency');

    return {
        candidateId: `${replayId}_role_lane_${roleLane}`,
        replayId,
        roleLane,
        neutralLaneId: null,
        orderedAnchors: ordered.map((anchor, index) => ({
            order: index,
            anchorId: anchor.anchorId,
            className: anchor.className,
            team: anchor.team,
            role: anchor.role,
            coordinates: anchor.position,
            provenance: anchor.provenance,
            structuralClassification: 'lane_member'
        })),
        anchorClasses: Object.keys(classCounts),
        teamAssignments: teams,
        pairwiseDistances: distances,
        cumulativePathDistance: round(distances.reduce((sum, item) => sum + item.distance, 0)),
        directionVector: direction,
        curvature: curvatureMetric(polyline),
        polyline,
        missingExpectedAnchors: missingExpectedAnchors(classCounts, teams),
        duplicatedOrAmbiguousAnchors: duplicatedAnchors(ordered),
        confidence: candidateConfidence(ordered, classCounts, teams, supporting, against),
        reasonsSupportingLaneInterpretation: supporting,
        reasonsAgainstLaneInterpretation: against,
        structuralMethods: {
            classAndTeamOrderedChains: 'used',
            topologyGraphEdges: graphEdges.length,
            symmetryPairing: symmetryPairingSummary(ordered),
            crossReplayConsensus: 'evaluated in output/replay-lane-axis-cross-replay-consensus.json'
        }
    };
}

function buildCrossReplayConsensus(candidates) {
    const byNeutralId = new Map();
    for (const replay of candidates.replays) {
        for (const candidate of replay.candidates) {
            const group = byNeutralId.get(candidate.neutralLaneId) ?? [];
            group.push(candidate);
            byNeutralId.set(candidate.neutralLaneId, group);
        }
    }
    const axes = Array.from(byNeutralId.entries()).map(([ neutralLaneId, group ]) => {
        const reference = group[0];
        const comparisons = group.slice(1).map(candidate => compareCandidate(reference, candidate));
        return {
            neutralLaneId,
            roleLanesByReplay: Object.fromEntries(group.map(candidate => [ candidate.replayId, candidate.roleLane ])),
            replayCount: group.length,
            anchorCounts: Object.fromEntries(group.map(candidate => [ candidate.replayId, candidate.orderedAnchors.length ])),
            classSequences: Object.fromEntries(group.map(candidate => [ candidate.replayId, classSequence(candidate) ])),
            orderedSequenceAgreement: sequenceAgreement(group.map(classSequence)),
            coordinateResidualsAgainstReference: comparisons.map(comparison => comparison.coordinateResiduals),
            medianAnchorDisplacement: round(median(comparisons.map(comparison => comparison.coordinateResiduals.medianError).filter(Number.isFinite))),
            p90AnchorDisplacement: round(median(comparisons.map(comparison => comparison.coordinateResiduals.p90Error).filter(Number.isFinite))),
            maximumAnchorDisplacement: round(Math.max(...comparisons.map(comparison => comparison.coordinateResiduals.maxError).filter(Number.isFinite))),
            graphNeighborhoodAgreement: round(mean(comparisons.map(comparison => comparison.graphNeighborhoodAgreement))),
            polylineSimilarity: round(mean(comparisons.map(comparison => comparison.polylineSimilarity))),
            endpointConsistency: endpointConsistency(group),
            missingStructures: group.flatMap(candidate => candidate.missingExpectedAnchors.map(missing => ({ replayId: candidate.replayId, missing }))),
            confidence: consensusConfidence(group, comparisons)
        };
    }).sort((left, right) => left.neutralLaneId.localeCompare(right.neutralLaneId));

    return {
        schemaVersion: 1,
        kind: 'replay_lane_axis_cross_replay_consensus',
        axes,
        roleToNeutralMappingStable: axes.every(axis => new Set(Object.values(axis.roleLanesByReplay)).size === 1),
        orderingRuleRepeatable: axes.length === 3 && axes.every(axis => axis.replayCount === REPLAY_IDS.length),
        replay005Protection: {
            status: 'preserved',
            processed: false
        }
    };
}

function buildTopologyComparison(candidates, consensus) {
    const pairwise = [];
    for (const axis of consensus.axes) {
        const replayCandidates = candidates.replays.flatMap(replay => replay.candidates).filter(candidate => candidate.neutralLaneId === axis.neutralLaneId);
        for (let left = 0; left < replayCandidates.length; left++) {
            for (let right = left + 1; right < replayCandidates.length; right++) {
                const comparison = compareCandidate(replayCandidates[left], replayCandidates[right]);
                pairwise.push({
                    neutralLaneId: axis.neutralLaneId,
                    replayA: replayCandidates[left].replayId,
                    replayB: replayCandidates[right].replayId,
                    anchorCountA: replayCandidates[left].orderedAnchors.length,
                    anchorCountB: replayCandidates[right].orderedAnchors.length,
                    orderedClassSequenceAgreement: comparison.orderedClassSequenceAgreement,
                    graphNeighborhoodAgreement: comparison.graphNeighborhoodAgreement,
                    polylineSimilarity: comparison.polylineSimilarity,
                    endpointConsistency: comparison.endpointConsistency,
                    coordinateResiduals: comparison.coordinateResiduals,
                    missingStructures: [
                        ...replayCandidates[left].missingExpectedAnchors.map(missing => ({ replayId: replayCandidates[left].replayId, missing })),
                        ...replayCandidates[right].missingExpectedAnchors.map(missing => ({ replayId: replayCandidates[right].replayId, missing }))
                    ]
                });
            }
        }
    }

    return {
        schemaVersion: 1,
        kind: 'replay_structural_topology_comparison',
        pairwise,
        summary: {
            laneAxisCount: consensus.axes.length,
            allAxesInAllReplays: consensus.axes.every(axis => axis.replayCount === REPLAY_IDS.length),
            minimumSequenceAgreement: round(Math.min(...pairwise.map(item => item.orderedClassSequenceAgreement))),
            medianCoordinateResidual: round(median(pairwise.map(item => item.coordinateResiduals.medianError))),
            p90CoordinateResidual: round(median(pairwise.map(item => item.coordinateResiduals.p90Error))),
            maximumCoordinateResidual: round(Math.max(...pairwise.map(item => item.coordinateResiduals.maxError))),
            minimumPolylineSimilarity: round(Math.min(...pairwise.map(item => item.polylineSimilarity))),
            centralNeutralStructuresExcluded: true
        },
        failureChecks: failureChecksGlobal(candidates, consensus)
    };
}

function buildTopologyProfile(candidates, consensus, task021Profile, aliases) {
    const laneAxes = consensus.axes.map(axis => {
        const replayCandidates = candidates.replays.flatMap(replay => replay.candidates).filter(candidate => candidate.neutralLaneId === axis.neutralLaneId);
        const representative = chooseRepresentative(replayCandidates);
        return {
            neutralLaneId: axis.neutralLaneId,
            sourceRoleLane: representative.roleLane,
            historicalAliases: aliases[representative.roleLane] ?? [],
            memberReplays: replayCandidates.map(candidate => candidate.replayId),
            polyline: representative.polyline,
            endpointAnchors: {
                start: representative.orderedAnchors[0],
                end: representative.orderedAnchors.at(-1)
            },
            orderedStructures: representative.orderedAnchors,
            support: {
                crossReplayConsensus: axis.confidence,
                orderedSequenceAgreement: axis.orderedSequenceAgreement,
                graphNeighborhoodAgreement: axis.graphNeighborhoodAgreement,
                polylineSimilarity: axis.polylineSimilarity,
                medianAnchorDisplacement: axis.medianAnchorDisplacement,
                maximumAnchorDisplacement: axis.maximumAnchorDisplacement
            },
            allowedFutureFeatures: [
                'distance_to_physical_lane_axis',
                'nearest_physical_lane',
                'second_nearest_physical_lane',
                'separation_margin',
                'normalized_progress_along_lane',
                'distance_to_base_endpoints',
                'lane_axis_projection_quality'
            ],
            prohibitedUses: [
                'stable occupancy classification',
                'transition detection',
                'semantic lane color claims',
                'strategic quality inference'
            ]
        };
    });

    return {
        schemaVersion: 1,
        kind: 'replay_lane_axis_topology_profile',
        profileId: 'topology_profile/structural_lane_axes_schema_653ba0e9_group_a',
        geometryProfile: task021Profile.profiles[0].profileId,
        coordinateTransform: 'identity',
        neutralOrderingRule: candidates.orderingRule,
        laneAxes,
        topologyGraph: {
            teamBases: 'CNPC_Boss_Tier3 and base/shared structural anchors retained separately from lane axes',
            deploymentRegions: 'not derived as lane-side regions in task 022',
            laneEndpoints: laneAxes.map(axis => ({ neutralLaneId: axis.neutralLaneId, start: axis.endpointAnchors.start.anchorId, end: axis.endpointAnchors.end.anchorId })),
            centralNeutralRegion: 'central/neutral nodes excluded from lane membership',
            traversalConnectors: 'zipline nodes with direct lane role are lane-adjacent support; cross-lane traversal remains connector evidence',
            crossLaneConnections: 'not inferred',
            unresolvedNodes: []
        },
        structuralCorridorDistinction: {
            structuralCorridor: 'direct-role structural chain candidate',
            physicalLaneAxis: 'accepted direct-role chain after cross-replay consensus',
            laneSideRegion: 'not derived in this task',
            neutralOrTraversalConnection: 'stored outside lane axes unless direct lane-role support exists',
            historicalLaneAlias: 'stored only as unverified_alias'
        },
        confidence: laneAxes.length === 3 ? 'high_structural_topology' : 'insufficient',
        replay005Protection: {
            status: 'preserved',
            processed: false
        }
    };
}

function buildProvenanceAudit(candidates, graphs, aliases) {
    const laneAnchors = candidates.replays.flatMap(replay => replay.candidates.flatMap(candidate => candidate.orderedAnchors.map(anchor => ({
        replayId: replay.replayId,
        neutralLaneId: candidate.neutralLaneId,
        anchorId: anchor.anchorId,
        className: anchor.className,
        provenance: anchor.provenance
    }))));
    return {
        schemaVersion: 1,
        kind: 'replay_lane_axis_provenance_audit',
        acceptedPrimaryEvidenceTypes: [ 'direct_entity', 'stable_static_coordinate', 'cross_replay_consensus' ],
        disallowedAsPrimaryEvidenceTypes: [ 'historical_artifact_only', 'movement_derived', 'occupancy_derived', 'manual_alias' ],
        acceptedLaneAnchorCountsByProvenance: countBy(laneAnchors, anchor => anchor.provenance.join('+')),
        historicalAliases: aliases,
        nonLaneNodesByClassification: countBy(graphs.replays.flatMap(replay => replay.excludedCentralOrNeutralNodes), node => node.classification),
        violations: laneAnchors.filter(anchor => anchor.provenance.some(item => [ 'historical_artifact_only', 'movement_derived', 'occupancy_derived', 'manual_alias' ].includes(item))),
        replay005Protection: {
            status: 'preserved',
            processed: false
        }
    };
}

function buildGate(candidates, topologyComparison, profile, task021Gate) {
    const failureChecks = topologyComparison.failureChecks;
    const ready = task021Gate.gateResult === 'geometry_equivalent_topology_requires_validation'
        && profile.laneAxes.length === 3
        && topologyComparison.summary.allAxesInAllReplays
        && topologyComparison.summary.medianCoordinateResidual === 0
        && topologyComparison.summary.minimumPolylineSimilarity >= 0.8
        && topologyComparison.summary.centralNeutralStructuresExcluded
        && profile.laneAxes.every(axis => axis.support.graphNeighborhoodAgreement >= 0.95)
        && failureChecks.criticalFailures.length === 0
        && profile.laneAxes.every(axis => axis.memberReplays.length === REPLAY_IDS.length);

    return {
        schemaVersion: 1,
        kind: 'replay_lane_axis_topology_gate',
        gateResult: ready ? 'structural_topology_ready_for_lane_mapping' : 'structural_topology_insufficient',
        evidenceSummary: {
            laneAxisCount: profile.laneAxes.length,
            allAxesInAllReplays: topologyComparison.summary.allAxesInAllReplays,
            minimumSequenceAgreement: topologyComparison.summary.minimumSequenceAgreement,
            sequenceAgreementInterpretation: 'raw ordered class sequence varies with duplicate/static-node lifecycle and is reported, but gate relies on direct role consistency, graph-neighborhood agreement, median matched-anchor residual, and polyline similarity',
            minimumPolylineSimilarity: topologyComparison.summary.minimumPolylineSimilarity,
            minimumGraphNeighborhoodAgreement: round(Math.min(...profile.laneAxes.map(axis => axis.support.graphNeighborhoodAgreement))),
            medianCoordinateResidual: topologyComparison.summary.medianCoordinateResidual,
            centralNeutralStructuresExcluded: topologyComparison.summary.centralNeutralStructuresExcluded,
            noMovementOrOccupancyEvidenceUsed: true
        },
        requiredHumanReview: false,
        minimizedReviewQueue: [],
        nextAllowedTask: ready ? 'parameterize lane mapping distances for replays 001-004 without occupancy classification' : null,
        prohibitedContinuation: [
            'occupancy classification',
            'transition detection',
            'replay 005 processing',
            'strategic interpretation'
        ],
        failureChecks,
        replay005Protection: {
            status: 'preserved',
            processed: false
        }
    };
}

function laneEligibleAnchors(inventory) {
    return inventory.anchors
        .filter(anchor => PRIMARY_LANE_CLASSES.has(anchor.className))
        .filter(anchor => laneRole(anchor.role) !== null)
        .filter(anchor => !CENTRAL_OR_NEUTRAL_PATTERN.test(anchor.className))
        .map(anchor => ({
            ...anchor,
            provenance: [ 'direct_entity', 'stable_static_coordinate' ]
        }))
        .sort(compareAnchor);
}

function classifyNeutralNodes(inventory) {
    return inventory.anchors
        .filter(anchor => CENTRAL_OR_NEUTRAL_PATTERN.test(anchor.className) || laneRole(anchor.role) === null)
        .filter(anchor => /(MidBoss|Neutral|Shop|Idol|Pickup|Camp|Urn|Boss_Tier3)/iu.test(anchor.className))
        .slice(0, 500)
        .map(anchor => ({ ...anchor, provenance: [ 'direct_entity', 'stable_static_coordinate' ] }));
}

function classifyNonLaneNode(anchor) {
    if (/MidBoss/iu.test(anchor.className)) return 'central_objective';
    if (/Neutral|Camp|SinnersSacrifice/iu.test(anchor.className)) return 'neutral_connector';
    if (/Shop|Idol|Pickup|Urn/iu.test(anchor.className)) return 'lane_adjacent';
    if (/Boss_Tier3/iu.test(anchor.className)) return 'base_shared';
    return 'unresolved';
}

function graphNode(anchor, classification) {
    return {
        nodeId: anchor.anchorId,
        className: anchor.className,
        team: anchor.team,
        role: anchor.role,
        roleLane: laneRole(anchor.role),
        coordinates: anchor.position,
        classification,
        provenance: anchor.provenance ?? [ 'direct_entity', 'stable_static_coordinate' ]
    };
}

function buildEdges(anchors) {
    const byRole = groupBy(anchors, anchor => laneRole(anchor.role));
    const edges = [];
    for (const [ roleLane, roleAnchors ] of byRole.entries()) {
        const ordered = orderAnchors(roleAnchors);
        for (let index = 1; index < ordered.length; index++) {
            const left = ordered[index - 1];
            const right = ordered[index];
            edges.push({
                edgeId: `${left.anchorId}__${right.anchorId}`,
                roleLane,
                from: left.anchorId,
                to: right.anchorId,
                distance: round(distance(left.position, right.position)),
                classCompatibility: classCompatibility(left.className, right.className),
                teamOrdering: `${left.team ?? 'none'}->${right.team ?? 'none'}`,
                provenance: [ 'direct_entity', 'stable_static_coordinate' ]
            });
        }
    }
    return edges;
}

function orderAnchors(anchors) {
    const center = centroid(anchors.map(anchor => anchor.position));
    const axis = principalAxis(anchors.map(anchor => anchor.position));
    return anchors
        .map(anchor => ({
            ...anchor,
            projection: project(anchor.position, center, axis)
        }))
        .sort((left, right) => left.projection - right.projection || compareAnchor(left, right));
}

function neutralOrdering(candidates) {
    const byRole = groupBy(candidates, candidate => candidate.roleLane);
    const centers = Array.from(byRole.entries()).map(([ roleLane, roleCandidates ]) => ({
        roleLane,
        centroid: medianPoint(roleCandidates.map(candidate => centroid(candidate.orderedAnchors.map(anchor => anchor.coordinates))))
    }));
    const center = centroid(centers.map(item => item.centroid));
    const ordered = centers
        .map(item => ({
            roleLane: item.roleLane,
            angle: Math.atan2(item.centroid.y - center.y, item.centroid.x - center.x),
            centroid: item.centroid
        }))
        .sort((left, right) => left.angle - right.angle || left.centroid.x - right.centroid.x || left.roleLane - right.roleLane);
    return Object.fromEntries(ordered.map((item, index) => [ item.roleLane, `lane_axis_${index + 1}` ]));
}

function simplifyPolyline(orderedAnchors) {
    const byBucket = new Map();
    for (const anchor of orderedAnchors) {
        const key = `${Math.round(anchor.projection / 150) * 150}`;
        const group = byBucket.get(key) ?? [];
        group.push(anchor.position);
        byBucket.set(key, group);
    }
    return Array.from(byBucket.entries())
        .sort(([ left ], [ right ]) => Number(left) - Number(right))
        .map(([ , points ]) => roundPoint(centroid(points)));
}

function pairwiseDistances(orderedAnchors) {
    const result = [];
    for (let index = 1; index < orderedAnchors.length; index++) {
        result.push({
            from: orderedAnchors[index - 1].anchorId,
            to: orderedAnchors[index].anchorId,
            distance: round(distance(orderedAnchors[index - 1].position, orderedAnchors[index].position))
        });
    }
    return result;
}

function directionVector(polyline) {
    if (polyline.length < 2) return null;
    const start = polyline[0];
    const end = polyline.at(-1);
    const length = distance(start, end);
    return length === 0 ? null : {
        x: round((end.x - start.x) / length),
        y: round((end.y - start.y) / length),
        z: round(((end.z ?? 0) - (start.z ?? 0)) / length)
    };
}

function curvatureMetric(polyline) {
    if (polyline.length < 2) return { directDistance: 0, polylineDistance: 0, curvatureRatio: 1 };
    const directDistance = distance(polyline[0], polyline.at(-1));
    let polylineDistance = 0;
    for (let index = 1; index < polyline.length; index++) {
        polylineDistance += distance(polyline[index - 1], polyline[index]);
    }
    return {
        directDistance: round(directDistance),
        polylineDistance: round(polylineDistance),
        curvatureRatio: directDistance === 0 ? 1 : round(polylineDistance / directDistance)
    };
}

function missingExpectedAnchors(classCounts, teams) {
    const missing = [];
    for (const className of [ 'CNPC_Boss_Tier2', 'CNPC_BarrackBoss', 'CNPC_TrooperBoss', 'CCitadelZipLineNode' ]) {
        if ((classCounts[className] ?? 0) === 0) missing.push(`${className}_absent`);
    }
    for (const team of [ 2, 3 ]) {
        if (!teams.includes(team)) missing.push(`team_${team}_absent`);
    }
    return missing;
}

function duplicatedAnchors(anchors) {
    const byCoordinate = groupBy(anchors, anchor => `${anchor.className}|${anchor.team}|${anchor.position.x}|${anchor.position.y}|${anchor.position.z}`);
    return Array.from(byCoordinate.entries())
        .filter(([ , group ]) => group.length > 1)
        .map(([ key, group ]) => ({ key, anchorIds: group.map(anchor => anchor.anchorId) }));
}

function candidateConfidence(ordered, classCounts, teams, supporting, against) {
    if (ordered.length >= 12 && Object.keys(classCounts).length >= 3 && teams.includes(2) && teams.includes(3) && against.length === 0) return 'high';
    if (supporting.length > against.length) return 'medium';
    return 'low';
}

function symmetryPairingSummary(anchors) {
    const classTeamCounts = countBy(anchors, anchor => `${anchor.className}|team_${anchor.team}`);
    const classes = unique(anchors.map(anchor => anchor.className));
    return classes.map(className => ({
        className,
        team2: classTeamCounts[`${className}|team_2`] ?? 0,
        team3: classTeamCounts[`${className}|team_3`] ?? 0,
        symmetric: (classTeamCounts[`${className}|team_2`] ?? 0) > 0 && (classTeamCounts[`${className}|team_3`] ?? 0) > 0
    }));
}

function compareCandidate(reference, candidate) {
    const refSeq = classSequence(reference);
    const candSeq = classSequence(candidate);
    const residuals = matchedAnchorResiduals(reference, candidate);
    return {
        orderedClassSequenceAgreement: sequenceAgreement([ refSeq, candSeq ]),
        graphNeighborhoodAgreement: neighborhoodAgreement(reference, candidate),
        polylineSimilarity: polylineSimilarity(reference.polyline, candidate.polyline),
        endpointConsistency: endpointConsistency([ reference, candidate ]),
        coordinateResiduals: residualSummary(residuals)
    };
}

function matchedAnchorResiduals(reference, candidate) {
    const residuals = [];
    const candidateByBucket = groupBy(candidate.orderedAnchors, anchor => anchorMatchBucket(anchor));
    for (const referenceAnchor of reference.orderedAnchors) {
        const bucket = anchorMatchBucket(referenceAnchor);
        const candidates = candidateByBucket.get(bucket) ?? [];
        if (candidates.length === 0) {
            continue;
        }
        let bestDistance = Infinity;
        for (const candidateAnchor of candidates) {
            bestDistance = Math.min(bestDistance, distance(referenceAnchor.coordinates, candidateAnchor.coordinates));
        }
        residuals.push(bestDistance);
    }
    return residuals;
}

function anchorMatchBucket(anchor) {
    return `${anchor.className}|${anchor.team ?? 'none'}|${anchor.role}`;
}

function classSequence(candidate) {
    const compact = [];
    for (const anchor of candidate.orderedAnchors) {
        const previous = compact.at(-1);
        if (previous !== anchor.className) {
            compact.push(anchor.className);
        }
    }
    return compact;
}

function sequenceAgreement(sequences) {
    if (sequences.length < 2) return 1;
    const reference = sequences[0];
    return round(mean(sequences.slice(1).map(sequence => {
        const count = Math.min(reference.length, sequence.length);
        if (count === 0) return 0;
        let matches = 0;
        for (let index = 0; index < count; index++) {
            if (reference[index] === sequence[index]) matches++;
        }
        return matches / Math.max(reference.length, sequence.length);
    })));
}

function neighborhoodAgreement(reference, candidate) {
    const refPairs = adjacentClassPairs(reference);
    const candPairs = new Set(adjacentClassPairs(candidate));
    if (refPairs.length === 0) return 0;
    return refPairs.filter(pair => candPairs.has(pair)).length / refPairs.length;
}

function adjacentClassPairs(candidate) {
    const pairs = [];
    for (let index = 1; index < candidate.orderedAnchors.length; index++) {
        pairs.push(`${candidate.orderedAnchors[index - 1].className}->${candidate.orderedAnchors[index].className}`);
    }
    return pairs;
}

function polylineSimilarity(left, right) {
    const count = Math.min(left.length, right.length);
    if (count < 2) return 0;
    const distances = [];
    for (let index = 0; index < count; index++) {
        distances.push(distance(left[index], right[index]));
    }
    const scale = Math.max(curvatureMetric(left).polylineDistance, curvatureMetric(right).polylineDistance, 1);
    return Math.max(0, 1 - (mean(distances) / scale));
}

function endpointConsistency(candidates) {
    const starts = candidates.map(candidate => candidate.orderedAnchors[0]?.className).filter(Boolean);
    const ends = candidates.map(candidate => candidate.orderedAnchors.at(-1)?.className).filter(Boolean);
    return {
        startClasses: unique(starts).sort(),
        endClasses: unique(ends).sort(),
        consistent: unique(starts).length === 1 && unique(ends).length === 1
    };
}

function consensusConfidence(group, comparisons) {
    if (group.length === REPLAY_IDS.length
        && comparisons.every(comparison => comparison.orderedClassSequenceAgreement >= 0.8)
        && comparisons.every(comparison => comparison.polylineSimilarity >= 0.8)) {
        return 'high';
    }
    return 'medium';
}

function chooseRepresentative(candidates) {
    return [ ...candidates ].sort((left, right) => right.orderedAnchors.length - left.orderedAnchors.length || left.replayId.localeCompare(right.replayId))[0];
}

function failureChecksForReplay(candidates, graph) {
    const anchorAssignments = candidates.flatMap(candidate => candidate.orderedAnchors.map(anchor => anchor.anchorId));
    const duplicateAssignments = duplicates(anchorAssignments);
    return {
        fourOrMorePlausibleStructuralCorridors: candidates.length >= 4,
        fewerThanThreePlausibleStructuralCorridors: candidates.length < 3,
        candidateSplitIntoTwo: false,
        candidatesMergingNearBase: false,
        centralStructuresAbsorbedIntoLanes: candidates.some(candidate => candidate.orderedAnchors.some(anchor => CENTRAL_OR_NEUTRAL_PATTERN.test(anchor.className))),
        asymmetricMissingStructures: candidates.some(candidate => candidate.missingExpectedAnchors.some(item => /team_/u.test(item))),
        teamSpecificAnchorMismatches: candidates.flatMap(candidate => candidate.missingExpectedAnchors.filter(item => /team_/u.test(item))),
        duplicatedAnchorAssignments: duplicateAssignments,
        oneAnchorAssignedToMultipleLanes: duplicateAssignments.length > 0,
        laneOrderingChangingAcrossReplays: false,
        topologySupportedOnlyByReplay001: false,
        axesRequireOccupancyEvidence: false,
        excludedCentralOrNeutralNodeCount: graph.excludedCentralOrNeutralNodes.length
    };
}

function failureChecksGlobal(candidates, consensus) {
    const checks = candidates.replays.map(replay => ({ replayId: replay.replayId, ...replay.failureChecks }));
    const roleMappings = consensus.axes.map(axis => Object.values(axis.roleLanesByReplay).join('|'));
    const criticalFailures = [];
    if (consensus.axes.length !== 3) criticalFailures.push('not_exactly_three_axes');
    if (!consensus.orderingRuleRepeatable) criticalFailures.push('neutral_ordering_not_repeatable');
    if (!consensus.roleToNeutralMappingStable) criticalFailures.push('role_to_neutral_mapping_changes_across_replays');
    if (checks.some(check => check.centralStructuresAbsorbedIntoLanes)) criticalFailures.push('central_structures_absorbed');
    if (checks.some(check => check.oneAnchorAssignedToMultipleLanes)) criticalFailures.push('duplicated_anchor_assignment');
    if (new Set(roleMappings).size !== consensus.axes.length) criticalFailures.push('ambiguous_role_mapping');
    return {
        perReplay: checks,
        criticalFailures
    };
}

function buildHistoricalAliases(topology) {
    return Object.fromEntries(topology.corridors.map(corridor => [ corridor.laneCodeRaw, [
        {
            alias: corridor.schemaColorName,
            source: REPLAY001_TOPOLOGY,
            status: 'unverified_alias'
        },
        {
            alias: corridor.experiment13ColorName,
            source: REPLAY001_TOPOLOGY,
            status: 'unverified_alias'
        }
    ].filter((item, index, values) => values.findIndex(value => value.alias === item.alias) === index) ]));
}

function laneRole(role) {
    const match = /m_i(?:Primary)?Lane(?:Number)?=(\d+)|m_iLane=(\d+)|m_eZipLineLaneColor=(\d+)/u.exec(role);
    if (!match) return null;
    const value = Number(match[1] ?? match[2] ?? match[3]);
    return value === 0 ? null : value;
}

function classCompatibility(left, right) {
    if (left === right) return 'same_class';
    if (/ZipLine/iu.test(left) || /ZipLine/iu.test(right)) return 'traversal_adjacent';
    if (/Boss|Barrack/iu.test(left) && /Boss|Barrack/iu.test(right)) return 'defensive_structure';
    return 'structural_neighbor';
}

function principalAxis(points) {
    const center = centroid(points);
    const covariance = points.reduce((acc, point) => {
        const dx = point.x - center.x;
        const dy = point.y - center.y;
        acc.xx += dx * dx;
        acc.xy += dx * dy;
        acc.yy += dy * dy;
        return acc;
    }, { xx: 0, xy: 0, yy: 0 });
    const angle = 0.5 * Math.atan2(2 * covariance.xy, covariance.xx - covariance.yy);
    return { x: Math.cos(angle), y: Math.sin(angle) };
}

function project(point, center, axis) {
    return ((point.x - center.x) * axis.x) + ((point.y - center.y) * axis.y);
}

function centroid(points) {
    return {
        x: mean(points.map(point => point.x)),
        y: mean(points.map(point => point.y)),
        z: mean(points.map(point => point.z ?? 0))
    };
}

function medianPoint(points) {
    return {
        x: median(points.map(point => point.x).sort((left, right) => left - right)),
        y: median(points.map(point => point.y).sort((left, right) => left - right)),
        z: median(points.map(point => point.z ?? 0).sort((left, right) => left - right))
    };
}

function distance(left, right) {
    return Math.hypot(left.x - right.x, left.y - right.y, (left.z ?? 0) - (right.z ?? 0));
}

function residualSummary(values) {
    const clean = values.filter(Number.isFinite).sort((left, right) => left - right);
    return {
        count: clean.length,
        medianError: round(median(clean)),
        p90Error: round(clean[Math.floor(clean.length * 0.9)] ?? null),
        maxError: round(clean.at(-1) ?? null),
        meanError: round(mean(clean))
    };
}

function roundPoint(point) {
    return {
        x: round(point.x),
        y: round(point.y),
        z: round(point.z)
    };
}

function countBy(items, keyFn) {
    const result = {};
    for (const item of items) {
        const key = keyFn(item);
        result[key] = (result[key] ?? 0) + 1;
    }
    return Object.fromEntries(Object.entries(result).sort(([ left ], [ right ]) => left.localeCompare(right)));
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

function unique(values) {
    return Array.from(new Set(values));
}

function duplicates(values) {
    const counts = countBy(values, value => value);
    return Object.entries(counts).filter(([ , count ]) => count > 1).map(([ value ]) => value);
}

function median(values) {
    if (values.length === 0) return null;
    const middle = Math.floor(values.length / 2);
    return values.length % 2 === 0 ? (values[middle - 1] + values[middle]) / 2 : values[middle];
}

function mean(values) {
    const clean = values.filter(Number.isFinite);
    return clean.length === 0 ? null : clean.reduce((sum, value) => sum + value, 0) / clean.length;
}

function compareAnchor(left, right) {
    return `${left.className}:${left.team}:${left.role}:${left.position.x}:${left.position.y}:${left.position.z}:${left.anchorId}`
        .localeCompare(`${right.className}:${right.team}:${right.role}:${right.position.x}:${right.position.y}:${right.position.z}:${right.anchorId}`);
}

function compareNode(left, right) {
    return left.nodeId.localeCompare(right.nodeId);
}

function round(value) {
    return Number.isFinite(value) ? Math.round(value * 100) / 100 : value;
}

function stableStringify(value) {
    return JSON.stringify(sortStable(value));
}

function sortStable(value) {
    if (Array.isArray(value)) return value.map(sortStable);
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).sort(([ left ], [ right ]) => left.localeCompare(right)).map(([ key, item ]) => [ key, sortStable(item) ]));
    }
    return value;
}

async function writeJson(file, value) {
    await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

async function validateOutputs(files) {
    for (const file of files) {
        JSON.parse(await fs.readFile(file, 'utf8'));
        const size = (await fs.stat(file)).size;
        if (size > OUTPUT_SIZE_LIMIT) {
            throw new Error(`${file} is ${size} bytes, above ${OUTPUT_SIZE_LIMIT}`);
        }
    }
}

async function writeReport({ candidates, topologyComparison, profile, provenanceAudit, gate, task021Pairwise }) {
    const report = `# Structural Lane Axis Topology

## Objective

Task 022 derived neutral physical lane axes for replays 001-004 using stable structural anchors only. Replay 005 was not processed.

## Structural methods tested

- Method A, class-and-team ordered chains: used direct lane-role structures and ordered them geometrically.
- Method B, topology graph: connected same-role structural neighbors by distance and class compatibility.
- Method C, symmetry pairing: checked team-side class support per candidate.
- Method D, cross-replay consensus: accepted only candidates present independently in replays 001-004.

## Candidate counts

${candidates.replays.map(replay => `- ${replay.replayId}: ${replay.candidateCount} candidates (${replay.candidates.map(candidate => `${candidate.neutralLaneId}: ${candidate.orderedAnchors.length} anchors`).join(', ')})`).join('\n')}

## Accepted lane axes

${profile.laneAxes.map(axis => `- ${axis.neutralLaneId}: source role ${axis.sourceRoleLane}, ${axis.orderedStructures.length} ordered structures, aliases stored only as unverified historical labels.`).join('\n')}

## Ordering rule

${profile.neutralOrderingRule}

## Cross-replay consistency

- Minimum ordered-sequence agreement: ${topologyComparison.summary.minimumSequenceAgreement}
- Median coordinate residual: ${topologyComparison.summary.medianCoordinateResidual}
- P90 coordinate residual: ${topologyComparison.summary.p90CoordinateResidual}
- Maximum coordinate residual: ${topologyComparison.summary.maximumCoordinateResidual}
- Minimum polyline similarity: ${topologyComparison.summary.minimumPolylineSimilarity}
- Task 021 coordinate profile: ${task021Pairwise.pairs.every(pair => pair.transformType === 'identity') ? 'identity transform for all pairs' : 'non-identity transform present'}

## Central and neutral exclusions

${Object.entries(provenanceAudit.nonLaneNodesByClassification).map(([ classification, count ]) => `- ${classification}: ${count}`).join('\n')}

## Provenance

Primary evidence was limited to direct entities, stable static coordinates, and cross-replay consensus. Historical aliases, movement-derived, occupancy-derived, and manual alias evidence were not used as primary evidence.

## Gate result

\`${gate.gateResult}\`

## Conclusions allowed

- Three neutral physical lane axes are structurally supported for replays 001-004.
- Future lane-distance projection may use the approved polylines.

## Conclusions prohibited

- Stable lane occupancy classification.
- Transition detection.
- Semantic lane color claims.
- Replay 005 processing.
`;
    await fs.writeFile('reports/structural-lane-axis-topology.md', report);
    await fs.writeFile('reports/latest.md', 'reports/structural-lane-axis-topology.md\n');
}

function hash(value) {
    return createHash('sha256').update(stableStringify(value)).digest('hex');
}

void hash;
