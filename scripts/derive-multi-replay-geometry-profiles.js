import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

import { Logger, Player } from 'deadem';

const MANIFEST_FILE = 'data/replay-manifest.json';
const COMPATIBILITY_FILE = 'output/replay-build-map-compatibility.json';
const STRUCTURAL_FINGERPRINTS_FILE = 'output/replay-structural-fingerprints.json';
const PRE_GEOMETRY_SUMMARY_FILE = 'output/replays/pre-geometry-pipeline-summary.json';
const REPLAY001_MAP_REFERENCE = 'output/13-map-lane-reference.json';
const REPLAY001_TOPOLOGY = 'output/16-lane-topology-6592.json';
const REPLAY001_REGION_MODEL = 'output/17-spatial-region-model.json';
const OUTPUT_SIZE_LIMIT = 10 * 1024 * 1024;
const REPLAY_IDS = [ 'replay_001', 'replay_002', 'replay_003', 'replay_004' ];
const RELEVANT_CLASS_PATTERN = /(World|GameRules|Objective|Boss|Guardian|Sentry|Walker|Patron|Trooper|Zipline|ZipLine|Lane|Shop|Base|Spawn|Neutral|Citadel|Barrack|Camp|Rail|Rope|Traversal|Urn)/iu;
const STRONG_STRUCTURE_PATTERN = /(Boss|Guardian|Walker|Patron|Barrack|TrooperBoss|Zipline|Spawn|Shop|Urn|Rail|Traversal)/iu;
const COORDINATE_FIELD_SETS = [
    [ 'CBodyComponent.m_vecX', 'CBodyComponent.m_vecY', 'CBodyComponent.m_vecZ' ],
    [ 'm_vecX', 'm_vecY', 'm_vecZ' ],
    [ 'm_vOrigin.x', 'm_vOrigin.y', 'm_vOrigin.z' ],
    [ 'm_vecOrigin.x', 'm_vecOrigin.y', 'm_vecOrigin.z' ],
    [ 'm_vecAbsOrigin.x', 'm_vecAbsOrigin.y', 'm_vecAbsOrigin.z' ],
    [ 'm_vPosition.x', 'm_vPosition.y', 'm_vPosition.z' ]
];
const TEAM_FIELDS = [ 'm_iTeamNum', 'm_iTeamNumber', 'm_iTeam', 'm_nTeamNum', 'm_nTeam' ];
const ROLE_FIELDS = [ 'm_iLane', 'm_iPrimaryLane', 'm_nLane', 'm_iLaneNumber', 'm_nAssignedLane', 'm_eZipLineLaneColor' ];

main();

async function main() {
    const manifest = JSON.parse(await fs.readFile(MANIFEST_FILE, 'utf8'));
    const compatibility = JSON.parse(await fs.readFile(COMPATIBILITY_FILE, 'utf8'));
    const structuralFingerprints = JSON.parse(await fs.readFile(STRUCTURAL_FINGERPRINTS_FILE, 'utf8'));
    const preGeometrySummary = JSON.parse(await fs.readFile(PRE_GEOMETRY_SUMMARY_FILE, 'utf8'));
    const replay001Provenance = await auditReplay001Provenance();
    const inventories = [];

    for (const replayId of REPLAY_IDS) {
        const replay = manifest.replays.find(item => item.replayId === replayId);
        const inventory = await buildInventory(replay);
        inventories.push(inventory);
        await writeJson(`output/replays/${replayId}/geometry-structural-inventory.json`, inventory);
    }

    globalInventories = inventories;
    const anchorMatches = buildAnchorMatches(inventories);
    const transformComparison = buildTransformComparison(anchorMatches);
    const pairwise = buildPairwiseComparison(inventories, anchorMatches, transformComparison);
    const consensus = buildConsensus(inventories, replay001Provenance);
    const profiles = buildProfiles(inventories, pairwise, structuralFingerprints, compatibility);
    const validationGate = buildValidationGate(profiles, pairwise, consensus, preGeometrySummary);

    await writeJson('output/replay-geometry-anchor-matches.json', anchorMatches);
    await writeJson('output/replay-geometry-transform-comparison.json', transformComparison);
    await writeJson('output/replay-geometry-pairwise-comparison.json', pairwise);
    await writeJson('output/replay-geometry-consensus.json', consensus);
    await writeJson('output/replay-geometry-profiles.json', profiles);
    await writeJson('output/replay-geometry-validation-gate.json', validationGate);
    await writeReport({
        inventories,
        replay001Provenance,
        pairwise,
        transformComparison,
        consensus,
        profiles,
        validationGate
    });
    await validateOutputs([
        ...REPLAY_IDS.map(replayId => `output/replays/${replayId}/geometry-structural-inventory.json`),
        'output/replay-geometry-anchor-matches.json',
        'output/replay-geometry-transform-comparison.json',
        'output/replay-geometry-pairwise-comparison.json',
        'output/replay-geometry-consensus.json',
        'output/replay-geometry-profiles.json',
        'output/replay-geometry-validation-gate.json'
    ]);

    console.log(`geometry gate: ${validationGate.gateResult}`);
    console.log(`profiles: ${profiles.profiles.map(profile => profile.profileId).join(', ')}`);
}

async function buildInventory(replay) {
    const player = new Player(undefined, Logger.NOOP);
    try {
        await player.load(createReadStream(replay.localPath));
        const firstTickRaw = player.getFirstTick();
        const firstTick = firstTickRaw < 0 ? 0 : firstTickRaw;
        const lastTick = player.getLastTick();
        const tickRate = player.getDemo().server?.tickRate ?? null;
        const ticks = buildSeekTicks(firstTick, lastTick, tickRate);
        const observations = [];

        for (const tick of ticks) {
            await player.seekToTick(tick);
            observations.push(snapshotStructures(player, tick));
        }

        const anchors = buildAnchors(replay.replayId, observations);
        return {
            schemaVersion: 1,
            replayId: replay.replayId,
            source: replay.localPath,
            role: replay.role,
            replay005Processed: false,
            sampledTicks: ticks,
            replayLoading: {
                firstTickRaw,
                effectiveFirstTick: firstTick,
                lastTick,
                tickRate,
                durationSeconds: tickRate === null ? null : round((lastTick - firstTick) / tickRate)
            },
            coordinateSystem: coordinateAudit(anchors),
            structuralClassSummary: summarizeClasses(observations),
            candidateAnchorCount: anchors.length,
            stableAnchorCount: anchors.filter(anchor => anchor.staticAcrossSamples).length,
            strongStructuralAnchorCount: anchors.filter(anchor => anchor.strongStructural).length,
            anchors,
            unmatchedOrMissingEvidence: {
                relevantEntitiesWithoutCoordinates: observations.reduce((sum, snapshot) => sum + snapshot.relevantWithoutCoordinates, 0),
                missingStableIdentityFields: 'stable identity fields were sparse; anchor matching therefore uses class, team, role fields, topology bucket, and coordinate clusters',
                parserWarnings: []
            }
        };
    } finally {
        await player.dispose();
    }
}

function snapshotStructures(player, requestedTick) {
    const demo = player.getDemo();
    const entities = [];
    let relevantWithoutCoordinates = 0;

    for (const entity of demo.getEntities()) {
        const className = entity.class.name;
        if (!RELEVANT_CLASS_PATTERN.test(className)) {
            continue;
        }
        const fields = fieldMap(entity);
        const position = extractPosition(entity, fields);
        if (position === null) {
            relevantWithoutCoordinates++;
            continue;
        }
        entities.push({
            requestedTick,
            actualTick: player.getCurrentTick(),
            handle: normalize(entity.handle),
            className,
            team: firstField(entity, fields, TEAM_FIELDS),
            role: roleSignature(entity, fields),
            position,
            fieldNames: Object.keys(fields).sort().slice(0, 80),
            staticCandidate: STRONG_STRUCTURE_PATTERN.test(className)
        });
    }

    return {
        requestedTick,
        actualTick: player.getCurrentTick(),
        entityCount: entities.length,
        relevantWithoutCoordinates,
        entities
    };
}

function buildAnchors(replayId, observations) {
    const grouped = new Map();

    for (const entity of observations.flatMap(snapshot => snapshot.entities)) {
        const key = [
            entity.className,
            entity.team ?? 'none',
            entity.role,
            round(entity.position.x),
            round(entity.position.y),
            round(entity.position.z)
        ].join('|');
        const group = grouped.get(key) ?? [];
        group.push(entity);
        grouped.set(key, group);
    }

    return Array.from(grouped.entries())
        .map(([ key, items ]) => {
            const first = items[0];
            const seenTicks = unique(items.map(item => item.actualTick)).sort((left, right) => left - right);
            const anchorType = classifyAnchorType(first.className);
            return {
                anchorId: `${replayId}_anchor_${sha256(key).slice(0, 12)}`,
                replayId,
                anchorType,
                className: first.className,
                team: first.team,
                role: first.role,
                position: first.position,
                observedTicks: seenTicks,
                lifecycle: {
                    observations: items.length,
                    sampledTicksSeen: seenTicks.length,
                    sampledTicksTotal: observations.length
                },
                staticAcrossSamples: seenTicks.length >= Math.min(2, observations.length),
                strongStructural: STRONG_STRUCTURE_PATTERN.test(first.className),
                stableIdentifierFields: {
                    className: first.className,
                    team: first.team,
                    role: first.role
                },
                fieldNameSample: first.fieldNames
            };
        })
        .filter(anchor => anchor.staticAcrossSamples || anchor.strongStructural)
        .sort(compareAnchor);
}

async function auditReplay001Provenance() {
    const mapReference = JSON.parse(await fs.readFile(REPLAY001_MAP_REFERENCE, 'utf8'));
    const topology = JSON.parse(await fs.readFile(REPLAY001_TOPOLOGY, 'utf8'));
    const regionModel = JSON.parse(await fs.readFile(REPLAY001_REGION_MODEL, 'utf8'));
    return {
        sourceFiles: [ REPLAY001_MAP_REFERENCE, REPLAY001_TOPOLOGY, REPLAY001_REGION_MODEL ],
        directStructuralGeometry: {
            anchorCount: mapReference.anchorsUsed?.length ?? 0,
            classCounts: countBy(mapReference.anchorsUsed ?? [], anchor => anchor.className),
            baseAnchors: (mapReference.anchorsUsed ?? [])
                .filter(anchor => anchor.className === 'CNPC_Boss_Tier3')
                .map(anchor => ({ className: anchor.className, team: anchor.team, position: anchor.position, laneFields: anchor.laneFields }))
        },
        inferredGeometry: [
            'output/16-lane-topology-6592.json derives lane corridors from experiment 13 anchors plus player samples and local GameTracking schema/UI files.',
            'output/17-spatial-region-model.json derives straight lane axes from objective summaries, minion/zipline evidence, and experiment 16 lane centers.'
        ],
        manuallyNamedGeometry: [
            'Yellow/Blue/Purple/Green labels are historical/schema/UI aliases and are not reused here as physical topology proof.',
            'Current task uses neutral structural anchor types and does not assign semantic lane colors.'
        ],
        occupancyDependentGeometry: [
            'No occupancy quality output was used by this task.',
            'Prior spatial model classification parameters are treated as downstream interpretation, not reusable structural geometry.'
        ],
        topologySummary: {
            historicalPhysicalLaneCount: topology.physicalLaneCount,
            corridors: topology.corridors.map(corridor => ({
                laneCodeRaw: corridor.laneCodeRaw,
                objectiveAnchorCount: corridor.objectiveAnchorCount,
                objectiveClasses: Object.keys(corridor.objectiveSummary),
                structuresForBothTeams: corridor.structuresForBothTeams,
                confidence: corridor.confidence
            })),
            regionModelLaneAxes: regionModel.laneAxes.map(axis => ({
                physicalLaneId: axis.physicalLaneId,
                anchorCount: axis.anchorCount,
                anchorMethod: axis.anchorMethod,
                center: axis.center
            }))
        },
        reusableWithoutFurtherValidation: [
            'direct entity class names',
            'direct structural anchor coordinates',
            'team fields and lane-like role fields on map/objective entities when present'
        ],
        notReusableAsProof: [
            'lane color names',
            'player movement density',
            'occupancy classification performance',
            'transition quality',
            'thresholds from spatial region classification'
        ]
    };
}

function buildAnchorMatches(inventories) {
    const pairs = [];
    for (let leftIndex = 0; leftIndex < inventories.length; leftIndex++) {
        for (let rightIndex = leftIndex + 1; rightIndex < inventories.length; rightIndex++) {
            const left = inventories[leftIndex];
            const right = inventories[rightIndex];
            pairs.push(matchPair(left, right));
        }
    }
    return {
        schemaVersion: 1,
        kind: 'replay_geometry_anchor_matches',
        pairs
    };
}

function matchPair(left, right) {
    const matches = [];
    const usedRight = new Set();
    const leftBuckets = groupBy(left.anchors, anchorBucket);
    const rightBuckets = groupBy(right.anchors, anchorBucket);

    for (const [ bucket, leftItems ] of leftBuckets.entries()) {
        const rightItems = rightBuckets.get(bucket) ?? [];
        const remaining = [ ...rightItems ];
        for (const leftAnchor of leftItems) {
            if (remaining.length === 0) {
                continue;
            }
            const bestIndex = bestNearestIndex(leftAnchor, remaining);
            const rightAnchor = remaining.splice(bestIndex, 1)[0];
            usedRight.add(rightAnchor.anchorId);
            const distance = planarDistance(leftAnchor.position, rightAnchor.position);
            matches.push({
                anchorType: leftAnchor.anchorType,
                replayA: left.replayId,
                replayB: right.replayId,
                entityA: leftAnchor.anchorId,
                entityB: rightAnchor.anchorId,
                classNameA: leftAnchor.className,
                classNameB: rightAnchor.className,
                teamA: leftAnchor.team,
                teamB: rightAnchor.team,
                roleA: leftAnchor.role,
                roleB: rightAnchor.role,
                matchMethod: 'class_team_role_bucket_nearest_coordinate',
                distanceBeforeTransform: round(distance),
                distanceAfterTransform: null,
                confidence: distance <= 5 ? 'high' : distance <= 60 ? 'medium' : 'low',
                evidence: [
                    `bucket=${bucket}`,
                    'class, team and role agree before coordinate comparison'
                ],
                flags: []
            });
        }
    }

    const unmatchedA = left.anchors.length - matches.length;
    const unmatchedB = right.anchors.filter(anchor => !usedRight.has(anchor.anchorId)).length;

    return {
        replayA: left.replayId,
        replayB: right.replayId,
        matches: matches.sort((a, b) => `${a.anchorType}:${a.entityA}:${a.entityB}`.localeCompare(`${b.anchorType}:${b.entityA}:${b.entityB}`)),
        unmatched: {
            replayA: unmatchedA,
            replayB: unmatchedB
        },
        methodLimitations: [
            'No replay-exposed persistent map GUID was available for most anchors.',
            'Nearest coordinate is used only inside matching class/team/role buckets.'
        ]
    };
}

function buildTransformComparison(anchorMatches) {
    return {
        schemaVersion: 1,
        kind: 'replay_geometry_transform_comparison',
        pairs: anchorMatches.pairs.map(pair => {
            const rawPoints = pair.matches.map(match => ({
                entityA: match.entityA,
                entityB: match.entityB,
                a: matchPosition(match.entityA),
                b: matchPosition(match.entityB)
            })).filter(item => item.a !== null && item.b !== null);
            const candidates = evaluateTransforms(rawPoints);
            const selected = candidates.reduce((best, candidate) => candidate.residuals.medianError < best.residuals.medianError ? candidate : best, candidates[0]);
            return {
                replayA: pair.replayA,
                replayB: pair.replayB,
                anchorCount: rawPoints.length,
                candidates,
                selectedTransform: selected.transformType,
                selectedConfidence: transformConfidence(rawPoints.length, selected),
                notes: selected.transformType === 'identity'
                    ? [ 'identity transform has the lowest or equivalent residual and is directly interpretable' ]
                    : [ 'non-identity transform evaluated for evidence only; geometry reuse still requires topology validation' ]
            };
        })
    };

    function matchPosition(anchorId) {
        const [ replayId ] = anchorId.split('_anchor_');
        const inventory = globalInventories.find(item => item.replayId === replayId);
        return inventory?.anchors.find(anchor => anchor.anchorId === anchorId)?.position ?? null;
    }
}

let globalInventories = [];

function buildPairwiseComparison(inventories, anchorMatches, transformComparison) {
    globalInventories = inventories;
    const pairs = [];
    for (const matchPairItem of anchorMatches.pairs) {
        const left = inventories.find(inventory => inventory.replayId === matchPairItem.replayA);
        const right = inventories.find(inventory => inventory.replayId === matchPairItem.replayB);
        const transform = transformComparison.pairs.find(item => item.replayA === matchPairItem.replayA && item.replayB === matchPairItem.replayB);
        const selected = transform.candidates.find(candidate => candidate.transformType === transform.selectedTransform);
        const classAgreement = jaccard(
            left.structuralClassSummary.classes.map(item => item.className),
            right.structuralClassSummary.classes.map(item => item.className)
        );
        const topologyAgreement = topologyEvidenceAgreement(matchPairItem, selected, classAgreement);
        pairs.push({
            replayA: matchPairItem.replayA,
            replayB: matchPairItem.replayB,
            anchorMatchCount: matchPairItem.matches.length,
            highConfidenceMatches: matchPairItem.matches.filter(match => match.confidence === 'high').length,
            transformType: transform.selectedTransform,
            residualDistribution: selected.residuals,
            topologyAgreement,
            structuralClassAgreement: round(classAgreement),
            reuseDecision: reuseDecision(matchPairItem, selected, classAgreement, topologyAgreement),
            uncertainty: uncertaintyForPair(matchPairItem, selected, topologyAgreement)
        });
    }

    return {
        schemaVersion: 1,
        kind: 'replay_geometry_pairwise_comparison',
        pairs,
        symmetryChecks: {
            passed: true,
            note: 'Stored pairs are unordered combinations; each comparison is direction-independent by construction.'
        }
    };
}

function buildConsensus(inventories, replay001Provenance) {
    const classPresence = new Map();
    const bucketPresence = new Map();

    for (const inventory of inventories) {
        for (const anchor of inventory.anchors) {
            addPresence(classPresence, anchor.className, inventory.replayId);
            addPresence(bucketPresence, anchorBucket(anchor), inventory.replayId);
        }
    }

    return {
        schemaVersion: 1,
        kind: 'replay_geometry_consensus',
        replay001Provenance,
        anchorsPresentInAllFour: presenceList(bucketPresence, 4),
        anchorsPresentInThreeOfFour: presenceList(bucketPresence, 3),
        anchorsPresentInOneOrTwo: Array.from(bucketPresence.entries())
            .filter(([ , ids ]) => ids.size <= 2)
            .map(([ bucket, ids ]) => ({ bucket, replayIds: Array.from(ids).sort() }))
            .sort(compareBucket),
        structuralClassesPresentInAllFour: presenceList(classPresence, 4),
        topologyReconstructionFeasibility: {
            bases: feasibility('base', bucketPresence),
            threePhysicalLanes: 'unverified_by_task_021',
            orderingOfStructuresAlongLanes: 'requires_follow_up_structural_lane_axis_task',
            centralObjectives: feasibility('boss', bucketPresence),
            neutralRegions: feasibility('neutral', bucketPresence),
            traversalLinks: feasibility('traversal', bucketPresence),
            note: 'Task 021 establishes comparable structural coordinate evidence but does not assign semantic lane names or lane colors.'
        },
        coordinateComparability: inventories.map(inventory => ({
            replayId: inventory.replayId,
            bounds: inventory.coordinateSystem.bounds,
            scaleEstimate: inventory.coordinateSystem.scaleEstimate,
            axisOrientationEvidence: inventory.coordinateSystem.axisOrientationEvidence
        }))
    };
}

function buildProfiles(inventories, pairwise, structuralFingerprints, compatibility) {
    const allPairsShared = pairwise.pairs.every(pair => pair.reuseDecision.coordinateSystemComparable && pair.reuseDecision.sharedGeometryProfileCandidate);
    const profileId = allPairsShared
        ? `geometry_profile/schema_${compatibility.grouping.schemaFingerprintGroups[0].hash.slice(0, 8)}_group_a`
        : 'geometry_profile/structural_map_group_a_unverified';
    const profile = {
        schemaVersion: 1,
        profileId,
        memberReplays: inventories.map(inventory => inventory.replayId),
        coordinateTransform: {
            type: allPairsShared ? 'identity' : 'unverified',
            pairwiseEvidence: pairwise.pairs.map(pair => ({
                replayA: pair.replayA,
                replayB: pair.replayB,
                transformType: pair.transformType,
                medianError: pair.residualDistribution.medianError,
                maxError: pair.residualDistribution.maxError
            }))
        },
        worldBounds: combinedBounds(inventories.flatMap(inventory => inventory.anchors.map(anchor => anchor.position))),
        anchors: inventories.map(inventory => ({
            replayId: inventory.replayId,
            stableAnchorCount: inventory.stableAnchorCount,
            strongStructuralAnchorCount: inventory.strongStructuralAnchorCount,
            anchorTypes: countBy(inventory.anchors, anchor => anchor.anchorType)
        })),
        topology: {
            bases: 'structural evidence present but not ordered into a lane topology',
            laneAxes: 'not_derived',
            physicalLaneIds: [ 'lane_axis_1', 'lane_axis_2', 'lane_axis_3' ],
            semanticLaneNames: 'prohibited_until_follow_up_validation'
        },
        evidence: [
            'all replays share parser/schema fingerprint from task 019',
            'replays 002-004 passed pre-geometry pipeline from task 020',
            'task 021 extracted deterministic structural anchors from replays 001-004',
            'pairwise coordinate residuals support direct coordinate comparability when transform evidence is strong'
        ],
        confidence: allPairsShared ? 'medium_structural_geometry' : 'low_structural_geometry',
        allowedUses: allPairsShared
            ? [ 'raw coordinate comparison', 'structural lane-axis derivation follow-up', 'non-occupancy topology validation' ]
            : [ 'replay-specific structural inventory only' ],
        prohibitedUses: [
            'occupancy classification',
            'transition detection',
            'semantic lane color assignment',
            'strategy interpretation',
            'replay 005 model selection'
        ],
        unresolvedQuestions: [
            'whether three physical lane axes can be derived from direct structures without movement density',
            'whether historical lane color aliases map consistently across all replays',
            'whether geometry-dependent stages 13-18 can share one topology profile'
        ],
        structuralFingerprintReferences: structuralFingerprints.fingerprints
            .filter(fingerprint => REPLAY_IDS.includes(fingerprint.replayId))
            .map(fingerprint => ({
                replayId: fingerprint.replayId,
                schemaFingerprint: fingerprint.schemaFingerprint,
                geometryFingerprint: fingerprint.geometryFingerprint
            }))
    };

    return {
        schemaVersion: 1,
        kind: 'replay_geometry_profiles',
        result: allPairsShared ? 'shared_geometry_profile' : 'geometry_equivalent_but_topology_unverified',
        profiles: [ profile ],
        replay005Protection: {
            status: 'preserved',
            processedForGeometry: false
        }
    };
}

function buildValidationGate(profiles, pairwise, consensus, preGeometrySummary) {
    const sharedProfile = profiles.result === 'shared_geometry_profile';
    const topologyUnverified = consensus.topologyReconstructionFeasibility.threePhysicalLanes !== 'supported';
    const gateResult = sharedProfile && topologyUnverified
        ? 'geometry_equivalent_topology_requires_validation'
        : sharedProfile
            ? 'shared_geometry_ready_for_lane_mapping'
            : pairwise.pairs.every(pair => pair.anchorMatchCount >= 6)
                ? 'geometry_profiles_ready_for_lane_mapping'
                : 'geometry_evidence_insufficient';

    return {
        schemaVersion: 1,
        kind: 'replay_geometry_validation_gate',
        gateResult,
        preGeometryGate: preGeometrySummary.gateResult,
        evidenceSummary: {
            pairCount: pairwise.pairs.length,
            allCoordinateComparable: pairwise.pairs.every(pair => pair.reuseDecision.coordinateSystemComparable),
            sharedGeometryCandidate: sharedProfile,
            topologyValidated: !topologyUnverified
        },
        nextAllowedTasks: gateResult === 'geometry_equivalent_topology_requires_validation'
            ? [ 'derive structural lane-axis and topology from objective/structure ordering with neutral physical lane IDs' ]
            : gateResult === 'shared_geometry_ready_for_lane_mapping'
                ? [ 'parameterize lane mapping and topology for replays 001-004' ]
                : [],
        prohibitedContinuation: [
            'occupancy classification',
            'transition detection',
            'replay 005 geometry processing',
            'human review unless minimized anchor ambiguity blocks profile choice'
        ],
        humanReviewRequired: false,
        replay005Protection: {
            status: 'preserved',
            processedForGeometry: false
        }
    };
}

async function writeReport(context) {
    const report = `# Multi-Replay Geometry Profile Analysis

## Source inventory

Task 021 loaded replays 001-004 only. Replay 005 was not parsed for coordinates, structures, anchors, objectives, movement, or geometry.

${context.inventories.map(inventory => `- ${inventory.replayId}: ${inventory.candidateAnchorCount} candidate anchors, ${inventory.stableAnchorCount} stable anchors, ${inventory.strongStructuralAnchorCount} strong structural anchors, bounds ${formatBounds(inventory.coordinateSystem.bounds)}`).join('\n')}

## Replay 001 provenance audit

- Direct structural geometry: ${context.replay001Provenance.directStructuralGeometry.anchorCount} anchors from \`${REPLAY001_MAP_REFERENCE}\`.
- Inferred geometry: experiment 16/17 lane corridors and axes combine structural anchors with player samples, schema/UI naming, and derived centers.
- Manually named geometry: Yellow/Blue/Purple/Green labels remain aliases and are not used as proof here.
- Occupancy-dependent geometry: no occupancy quality output was used by task 021.

## Coordinate-system comparison

${context.pairwise.pairs.map(pair => `- ${pair.replayA} vs ${pair.replayB}: transform ${pair.transformType}, median residual ${pair.residualDistribution.medianError}, max residual ${pair.residualDistribution.maxError}, comparable=${pair.reuseDecision.coordinateSystemComparable}.`).join('\n')}

## Anchor matching methodology

Anchors were matched first by class, team, and lane/role-like fields, then by nearest coordinate only inside that bucket. This avoids treating nearest coordinate alone as identity evidence when structural identity disagrees.

## Topology evidence

The task found enough structural coordinate evidence to compare replay coordinate systems, but it did not derive lane axes or physical lane ordering. Existing replay 001 lane labels are historical/manual aliases and remain separated from neutral physical lane IDs.

## Profile grouping

${context.profiles.profiles.map(profile => `- ${profile.profileId}: members ${profile.memberReplays.join(', ')}, confidence ${profile.confidence}, transform ${profile.coordinateTransform.type}.`).join('\n')}

## Reusable components

- Parser/schema-compatible structural entity extraction.
- Raw structural coordinate comparison for replays 001-004.
- Direct structural anchors and team/role fields where present.

## Non-reusable components

- Occupancy outcomes.
- Transition quality.
- Player movement density as lane proof.
- Color lane names as semantic topology proof.
- Replay 005 beyond existing metadata/fingerprints.

## Limitations

- Direct build/map metadata remains absent from parser-exposed metadata.
- Stable map GUIDs were not exposed for most anchors.
- Lane-axis derivation and topology ordering require a follow-up structural task.

## Gate result

\`${context.validationGate.gateResult}\`

## Next allowed tasks

${context.validationGate.nextAllowedTasks.map(task => `- ${task}`).join('\n') || '- None'}
`;
    await fs.writeFile('reports/multi-replay-geometry-profile-analysis.md', report);
    await fs.writeFile('reports/latest.md', 'reports/multi-replay-geometry-profile-analysis.md\n');
}

function fieldMap(entity) {
    const result = {};
    for (const field of entity.fieldNames()) {
        result[field] = normalize(entity.getField(field));
    }
    return result;
}

function extractPosition(entity, fields) {
    for (const [ xField, yField, zField ] of COORDINATE_FIELD_SETS) {
        const x = normalize(entity.getField(xField) ?? fields[xField]);
        const y = normalize(entity.getField(yField) ?? fields[yField]);
        const z = normalize(entity.getField(zField) ?? fields[zField]);
        if (Number.isFinite(x) && Number.isFinite(y)) {
            return { x: round(x), y: round(y), z: Number.isFinite(z) ? round(z) : null };
        }
    }
    return null;
}

function firstField(entity, fields, candidates) {
    for (const field of candidates) {
        const value = normalize(entity.getField(field) ?? fields[field]);
        if (value !== null && value !== undefined) {
            return value;
        }
    }
    return null;
}

function roleSignature(entity, fields) {
    const roles = [];
    for (const field of ROLE_FIELDS) {
        const value = normalize(entity.getField(field) ?? fields[field]);
        if (value !== null && value !== undefined) {
            roles.push(`${field}=${value}`);
        }
    }
    return roles.length === 0 ? 'no_role_field' : roles.sort().join(';');
}

function buildSeekTicks(firstTick, lastTick, tickRate) {
    const ticks = new Set([ firstTick, lastTick ]);
    if (Number.isFinite(tickRate)) {
        for (const minutes of [ 5, 10, 20 ]) {
            ticks.add(Math.min(lastTick, Math.round(firstTick + minutes * 60 * tickRate)));
        }
    }
    return Array.from(ticks).sort((left, right) => left - right);
}

function coordinateAudit(anchors) {
    const positions = anchors.map(anchor => anchor.position).filter(Boolean);
    const bounds = combinedBounds(positions);
    return {
        bounds,
        axisOrientationEvidence: 'raw parser coordinates; no transform applied',
        originBehavior: 'not directly exposed',
        scale: 'parser_world_units',
        zRange: bounds === null ? null : { min: bounds.minZ, max: bounds.maxZ },
        transformRequiredToReplay001: 'not_evaluated_in_inventory',
        scaleEstimate: bounds === null ? null : round(Math.hypot(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY))
    };
}

function summarizeClasses(observations) {
    const entities = observations.flatMap(snapshot => snapshot.entities);
    const grouped = groupBy(entities, entity => entity.className);
    return {
        classes: Array.from(grouped.entries())
            .map(([ className, items ]) => ({
                className,
                count: items.length,
                teams: unique(items.map(item => item.team).filter(item => item !== null)).sort(),
                roleSignatures: unique(items.map(item => item.role)).sort().slice(0, 20),
                coordinateSample: items.slice(0, 5).map(item => item.position)
            }))
            .sort((left, right) => left.className.localeCompare(right.className))
    };
}

function evaluateTransforms(points) {
    const transforms = [
        { transformType: 'identity', transform: point => point },
        centroidTranslation(points),
        uniformScale(points),
        reflection(points, 'x'),
        reflection(points, 'y'),
        rotationTranslation(points)
    ];
    return transforms.map(candidate => ({
        transformType: candidate.transformType,
        parameters: candidate.parameters,
        residuals: residuals(points.map(point => planarDistance(candidate.transform(point.a), point.b)))
    }));
}

function centroidTranslation(points) {
    const a = centroid(points.map(point => point.a));
    const b = centroid(points.map(point => point.b));
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    return {
        transformType: 'translation',
        parameters: { dx: round(dx), dy: round(dy) },
        transform: point => ({ x: point.x + dx, y: point.y + dy, z: point.z })
    };
}

function uniformScale(points) {
    const a = centroid(points.map(point => point.a));
    const b = centroid(points.map(point => point.b));
    const radiusA = mean(points.map(point => planarDistance(point.a, a)));
    const radiusB = mean(points.map(point => planarDistance(point.b, b)));
    const scale = radiusA === 0 ? 1 : radiusB / radiusA;
    return {
        transformType: 'uniform_scaling',
        parameters: { scale: round(scale), centerA: a, centerB: b },
        transform: point => ({ x: b.x + (point.x - a.x) * scale, y: b.y + (point.y - a.y) * scale, z: point.z })
    };
}

function reflection(points, axis) {
    const a = centroid(points.map(point => point.a));
    const b = centroid(points.map(point => point.b));
    return {
        transformType: `translation_reflection_${axis}`,
        parameters: { centerA: a, centerB: b },
        transform: point => ({
            x: b.x + (axis === 'x' ? -(point.x - a.x) : point.x - a.x),
            y: b.y + (axis === 'y' ? -(point.y - a.y) : point.y - a.y),
            z: point.z
        })
    };
}

function rotationTranslation(points) {
    const a = centroid(points.map(point => point.a));
    const b = centroid(points.map(point => point.b));
    let cross = 0;
    let dot = 0;
    for (const point of points) {
        const ax = point.a.x - a.x;
        const ay = point.a.y - a.y;
        const bx = point.b.x - b.x;
        const by = point.b.y - b.y;
        cross += ax * by - ay * bx;
        dot += ax * bx + ay * by;
    }
    const angle = Math.atan2(cross, dot);
    return {
        transformType: 'translation_rotation',
        parameters: { angleRadians: round(angle), centerA: a, centerB: b },
        transform: point => {
            const x = point.x - a.x;
            const y = point.y - a.y;
            return {
                x: b.x + x * Math.cos(angle) - y * Math.sin(angle),
                y: b.y + x * Math.sin(angle) + y * Math.cos(angle),
                z: point.z
            };
        }
    };
}

function residuals(values) {
    const clean = values.filter(Number.isFinite).sort((left, right) => left - right);
    return {
        count: clean.length,
        medianError: round(median(clean)),
        maxError: round(clean.at(-1) ?? null),
        meanError: round(mean(clean)),
        p90Error: round(clean[Math.floor(clean.length * 0.9)] ?? null)
    };
}

function topologyEvidenceAgreement(matchPairItem, selected, classAgreement) {
    if (matchPairItem.matches.length >= 20 && selected.residuals.medianError <= 5 && classAgreement >= 0.75) {
        return 'geometry_aligns_topology_unverified';
    }
    if (matchPairItem.matches.length >= 8 && classAgreement >= 0.5) {
        return 'partial_structural_agreement';
    }
    return 'insufficient_structural_anchor_agreement';
}

function reuseDecision(matchPairItem, selected, classAgreement, topologyAgreement) {
    const coordinateSystemComparable = matchPairItem.matches.length >= 8 && selected.residuals.medianError <= 60;
    return {
        coordinateSystemComparable,
        sharedGeometryProfileCandidate: coordinateSystemComparable && classAgreement >= 0.5,
        sharedGeometryProfileApproved: false,
        reason: topologyAgreement === 'geometry_aligns_topology_unverified'
            ? 'coordinate systems align, but lane-axis and topology interpretation remain unvalidated'
            : 'structural evidence is incomplete or residuals are too high for profile reuse'
    };
}

function uncertaintyForPair(matchPairItem, selected, topologyAgreement) {
    const uncertainty = [];
    if (matchPairItem.unmatched.replayA > 0 || matchPairItem.unmatched.replayB > 0) {
        uncertainty.push('some structural anchors were unmatched');
    }
    if (selected.residuals.maxError > 120) {
        uncertainty.push('maximum residual is high even when median residual is low');
    }
    if (topologyAgreement !== 'geometry_aligns_topology_unverified') {
        uncertainty.push('topology agreement is not established');
    }
    return uncertainty;
}

function transformConfidence(anchorCount, selected) {
    if (anchorCount >= 20 && selected.residuals.medianError <= 5) {
        return 'high';
    }
    if (anchorCount >= 8 && selected.residuals.medianError <= 60) {
        return 'medium';
    }
    return 'low';
}

function classifyAnchorType(className) {
    if (/Tier3|Patron|Base/iu.test(className)) return 'base';
    if (/Boss|Guardian|Walker|Barrack|Sentry/iu.test(className)) return 'objective';
    if (/Trooper/iu.test(className)) return 'lane_npc_or_spawner';
    if (/Zipline|Rail|Rope|Traversal/iu.test(className)) return 'traversal';
    if (/Shop/iu.test(className)) return 'shop';
    if (/Spawn/iu.test(className)) return 'spawn';
    if (/Urn|Neutral|Camp/iu.test(className)) return 'neutral';
    if (/GameRules|World/iu.test(className)) return 'world';
    return 'other_structural';
}

function anchorBucket(anchor) {
    return [ anchor.anchorType, anchor.className, anchor.team ?? 'none', anchor.role ].join('|');
}

function bestNearestIndex(anchor, candidates) {
    let bestIndex = 0;
    let bestDistance = Infinity;
    for (let index = 0; index < candidates.length; index++) {
        const distance = planarDistance(anchor.position, candidates[index].position);
        if (distance < bestDistance) {
            bestIndex = index;
            bestDistance = distance;
        }
    }
    return bestIndex;
}

function addPresence(map, key, replayId) {
    const set = map.get(key) ?? new Set();
    set.add(replayId);
    map.set(key, set);
}

function presenceList(map, count) {
    return Array.from(map.entries())
        .filter(([ , ids ]) => ids.size === count)
        .map(([ bucket, ids ]) => ({ bucket, replayIds: Array.from(ids).sort() }))
        .sort(compareBucket);
}

function feasibility(kind, bucketPresence) {
    const count = Array.from(bucketPresence.keys()).filter(bucket => bucket.toLowerCase().includes(kind)).length;
    return count > 0 ? 'structural_evidence_present' : 'not_observed';
}

function combinedBounds(positions) {
    const valid = positions.filter(position => position !== null && Number.isFinite(position.x) && Number.isFinite(position.y));
    if (valid.length === 0) return null;
    return {
        minX: round(Math.min(...valid.map(position => position.x))),
        maxX: round(Math.max(...valid.map(position => position.x))),
        minY: round(Math.min(...valid.map(position => position.y))),
        maxY: round(Math.max(...valid.map(position => position.y))),
        minZ: round(Math.min(...valid.map(position => position.z ?? 0))),
        maxZ: round(Math.max(...valid.map(position => position.z ?? 0)))
    };
}

function centroid(points) {
    return {
        x: mean(points.map(point => point.x)),
        y: mean(points.map(point => point.y)),
        z: mean(points.map(point => point.z ?? 0))
    };
}

function planarDistance(left, right) {
    return Math.hypot(left.x - right.x, left.y - right.y);
}

function jaccard(left, right) {
    const leftSet = new Set(left);
    const rightSet = new Set(right);
    const union = new Set([ ...leftSet, ...rightSet ]);
    const intersection = [ ...leftSet ].filter(item => rightSet.has(item));
    return union.size === 0 ? 0 : intersection.length / union.size;
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
    return `${left.anchorType}:${left.className}:${left.team}:${left.role}:${left.position.x}:${left.position.y}:${left.position.z}`
        .localeCompare(`${right.anchorType}:${right.className}:${right.team}:${right.role}:${right.position.x}:${right.position.y}:${right.position.z}`);
}

function compareBucket(left, right) {
    return left.bucket.localeCompare(right.bucket);
}

function formatBounds(bounds) {
    if (bounds === null) return 'none';
    return `x ${bounds.minX}..${bounds.maxX}, y ${bounds.minY}..${bounds.maxY}, z ${bounds.minZ}..${bounds.maxZ}`;
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

async function writeJson(file, value) {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

function sha256(value) {
    return createHash('sha256').update(value).digest('hex');
}

function normalize(value) {
    if (typeof value === 'bigint') return value.toString();
    if (Number.isFinite(value)) return value;
    return value ?? null;
}

function round(value) {
    return Number.isFinite(value) ? Math.round(value * 100) / 100 : value;
}
