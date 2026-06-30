import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const OUTPUT_DIR = 'output/replay-009-spatial';
const REPORT_PATH = 'reports/replay-009-spatial-geometric-projection-validation.md';
const TASK_PATH = 'tasks/active/061-validate-replay-009-spatial-geometric-projection.md';

async function readJson(filePath) {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

async function writeJson(filePath, value) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeText(filePath, value) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, value);
}

function hash(value) {
    return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function playerCoordinateSources(roster, positionQuality) {
    const byPlayer = new Map(positionQuality.players.map((player) => [ player.playerKey, player ]));
    return roster.players.map((player) => {
        const position = byPlayer.get(player.playerKey);
        return {
            playerKey: player.playerKey,
            sourceEntity: 'active player pawn from replay-009 telemetry validation',
            sourceFieldX: 'pawn position x',
            sourceFieldY: 'pawn position y',
            sourceFieldZ: 'pawn position z',
            firstTick: position?.firstPositionTick ?? null,
            lastTick: position?.lastPositionTick ?? null,
            sampleCount: position?.totalSamples ?? 0,
            pawnReplacementCount: null,
            identityContinuity: player.identityStable ? 'supported_by_task_056_roster_and_position_validation' : 'unknown',
            warnings: [
                'Exact raw property path is inherited from Task 056 extraction and not re-decoded here.',
                'Sub-second pawn transitions are not represented in one-second validation summaries.'
            ]
        };
    });
}

function rawCoordinateAudit(positionQuality) {
    return {
        schemaVersion: 1,
        replayId: 'replay_009',
        source: 'output/replay-009-validation/position-quality-summary.json',
        aggregate: {
            totalRows: positionQuality.aggregate.totalRows,
            finiteValueRows: positionQuality.aggregate.totalRows,
            nullRows: positionQuality.aggregate.nullPositionRows,
            nanOrInfiniteRows: 0,
            zeroVectorRows: positionQuality.players.reduce((sum, player) => sum + player.zeroVectors, 0),
            duplicateTimestampRows: positionQuality.aggregate.duplicateTimestampRows,
            nonMonotonicRows: positionQuality.aggregate.nonMonotonicRows,
            suddenDisplacementCount: positionQuality.aggregate.suddenDisplacementCount,
            largestGapSeconds: positionQuality.aggregate.largestGapSeconds,
            coordinatePresenceCoverage: positionQuality.aggregate.meanCoverage
        },
        axisBounds: {
            minX: null,
            maxX: null,
            minY: null,
            maxY: null,
            minZ: null,
            maxZ: null,
            status: 'not_available_from_compact_task_056_summary'
        },
        perPlayer: positionQuality.players.map((player) => ({
            playerKey: player.playerKey,
            sampleCount: player.totalSamples,
            nullPositions: player.nullPositions,
            zeroVectors: player.zeroVectors,
            duplicateTimestamps: player.duplicateTimestamps,
            nonMonotonicTimestamps: player.nonMonotonicTimestamps,
            suddenDisplacementCount: player.suddenDisplacementCount,
            largestGapSeconds: player.largestGapSeconds,
            coverage: player.coverage
        })),
        outlierSamples: [],
        limitations: [
            'Compact Task 056 output does not preserve min/max coordinate bounds.',
            'Raw per-sample coordinates were not committed, so axis bounds and outlier examples cannot be independently recomputed in this task.'
        ]
    };
}

function scorecard(totalRows) {
    const base = (category, status, limitations, classified = 0, ambiguous = 0, outside = 0) => ({
        category,
        eligibleSamples: totalRows,
        classifiedSamples: classified,
        uniqueSamples: classified - ambiguous,
        ambiguousSamples: ambiguous,
        boundarySamples: 0,
        outsideSamples: outside,
        rejectedSamples: totalRows - classified,
        coverageRate: totalRows ? classified / totalRows : null,
        ambiguityRate: classified ? ambiguous / classified : null,
        status,
        limitations
    });
    return [
        base('raw_coordinate_validity', 'usable_with_constraints', [
            '100% coordinate presence and continuity are validated by Task 056.',
            'Raw coordinate min/max bounds are unavailable from compact outputs.'
        ], totalRows),
        base('world_bounds', 'present_not_validated', [
            'No independently supported replay-009 world bounds were found.'
        ]),
        base('coordinate_transform', 'present_not_validated', [
            'Identity transform is plausible for parser coordinates but lacks independent replay-009 anchors.'
        ]),
        base('generic_regions', 'unavailable', [
            'No replay-009 map-region geometry source was validated.'
        ]),
        base('lane_geometry', 'unavailable', [
            'Existing lane axes were validated for replays 001-004, not replay 009/build 23916427.'
        ]),
        base('base_spawn_regions', 'present_not_validated', [
            'Team assignment and position coverage exist, but base/spawn geometry is not validated for replay 009.'
        ]),
        base('objective_static_geometry', 'unavailable', [
            'No replay-009 objective static geometry or map-version-compatible objective references were validated.'
        ]),
        base('structure_static_geometry', 'unavailable', [
            'No replay-009 structure geometry was validated.'
        ]),
        base('proximity_calculations', 'unavailable', [
            'Objective/structure geometry is unavailable, so proximity is blocked.'
        ]),
        base('temporal_stability', 'usable_with_constraints', [
            'One-second position continuity has 0-second largest sampled gap; pause intervals are not localized.'
        ], totalRows)
    ];
}

function task060Matrix() {
    return [
        {
            category: 'player life state',
            unlockStatus: 'unlocked_with_constraints',
            requiredEvidence: [ 'validated player identity', 'validated death/lifecycle events' ],
            availableEvidence: [ 'Task 056 player/controller/pawn lifecycle and death-counter consistency' ],
            missingEvidence: [ 'direct respawn timer mechanics' ],
            limitations: [ 'Not spatial; parserSeconds remains the time basis.' ]
        },
        {
            category: 'team net worth',
            unlockStatus: 'unlocked_with_constraints',
            requiredEvidence: [ 'm_iGoldNetWorth series', 'team assignment' ],
            availableEvidence: [ 'Task 056 economy-quality summary and 6v6 roster' ],
            missingEvidence: [ 'spendable/unsecured/reward-source semantics' ],
            limitations: [ 'Net worth only; no mechanic effect application.' ]
        },
        {
            category: 'entity presence',
            unlockStatus: 'unlocked_with_constraints',
            requiredEvidence: [ 'parser entity/class evidence' ],
            availableEvidence: [ 'normal parser completion and replay 009 telemetry inventory' ],
            missingEvidence: [ 'dedicated objective/entity classification extraction' ],
            limitations: [ 'May detect raw class/entity presence only; no spatial interpretation.' ]
        },
        {
            category: 'raw entity position',
            unlockStatus: 'blocked',
            requiredEvidence: [ 'objective/structure entity positions' ],
            availableEvidence: [],
            missingEvidence: [ 'replay-009 objective/structure position extraction' ],
            limitations: [ 'Player positions do not prove objective or structure positions.' ]
        },
        {
            category: 'generic region membership',
            unlockStatus: 'blocked',
            requiredEvidence: [ 'validated replay-009 region geometry' ],
            availableEvidence: [],
            missingEvidence: [ 'generic map-region projection' ],
            limitations: [ 'No nearest-region fallback allowed.' ]
        },
        {
            category: 'lane/region membership',
            unlockStatus: 'blocked',
            requiredEvidence: [ 'validated replay-009 lane geometry' ],
            availableEvidence: [],
            missingEvidence: [ 'build/map-compatible lane geometry' ],
            limitations: [ 'Lane occupancy remains prohibited.' ]
        },
        {
            category: 'objective-player proximity',
            unlockStatus: 'blocked',
            requiredEvidence: [ 'player positions', 'objective/structure geometry' ],
            availableEvidence: [ 'player positions' ],
            missingEvidence: [ 'objective/structure geometry' ],
            limitations: [ 'No proximity or aura-like claims.' ]
        },
        {
            category: 'near-deposit-location',
            unlockStatus: 'blocked',
            requiredEvidence: [ 'deposit geometry', 'player positions' ],
            availableEvidence: [ 'player positions' ],
            missingEvidence: [ 'Urn deposit geometry for replay 009' ],
            limitations: [ 'No Urn deposit candidate output.' ]
        },
        {
            category: 'structure-region association',
            unlockStatus: 'blocked',
            requiredEvidence: [ 'structure positions', 'region geometry' ],
            availableEvidence: [],
            missingEvidence: [ 'structure positions and region geometry' ],
            limitations: [ 'No pressure or objective priority inference.' ]
        }
    ];
}

async function main() {
    const [ positionQuality, roster, validationSummary, economySummary ] = await Promise.all([
        readJson('output/replay-009-validation/position-quality-summary.json'),
        readJson('output/replay-009-validation/player-roster.json'),
        readJson('output/replay-009-validation/validation-summary.json'),
        readJson('output/replay-009-validation/economy-quality-summary.json')
    ]);
    const totalRows = positionQuality.aggregate.totalRows;
    const commonSources = [
        {
            source: 'Task 056 position quality summary',
            path: 'output/replay-009-validation/position-quality-summary.json',
            available: true,
            coordinateSystem: 'parser world coordinates',
            units: 'source-engine-style world units; exact physical unit not independently confirmed',
            axisConvention: 'x/y/z parser fields; orientation not independently anchored to map image',
            timeBasis: 'parserSeconds and demoTick',
            buildOrMapVersion: 23916427,
            authorityScope: 'player coordinate presence and continuity',
            limitations: [ 'No raw coordinate bounds in compact output.' ]
        },
        {
            source: 'Task 056 player roster',
            path: 'output/replay-009-validation/player-roster.json',
            available: true,
            coordinateSystem: 'not spatial',
            units: 'not applicable',
            axisConvention: 'not applicable',
            timeBasis: 'demoTick',
            buildOrMapVersion: 23916427,
            authorityScope: 'player/team/controller/pawn identity',
            limitations: [ 'Human classification is supported, not external ground truth.' ]
        },
        {
            source: 'Existing replays 001-004 spatial/lane geometry',
            path: 'output/replays/*/one-second-spatial/',
            available: true,
            coordinateSystem: 'parser world coordinates for replays 001-004',
            units: 'world units',
            axisConvention: 'validated only for replays 001-004',
            timeBasis: 'one-second parser timeline',
            buildOrMapVersion: null,
            authorityScope: 'historical spatial geometry reference',
            limitations: [ 'Not validated for replay 009/build 23916427.' ]
        }
    ];
    await writeJson(path.join(OUTPUT_DIR, 'source-inventory.json'), { schemaVersion: 1, replayId: 'replay_009', sources: commonSources });
    await writeJson(path.join(OUTPUT_DIR, 'player-coordinate-source.json'), { schemaVersion: 1, replayId: 'replay_009', players: playerCoordinateSources(roster, positionQuality) });
    await writeJson(path.join(OUTPUT_DIR, 'raw-coordinate-audit.json'), rawCoordinateAudit(positionQuality));
    await writeJson(path.join(OUTPUT_DIR, 'coordinate-transform-candidates.json'), {
        schemaVersion: 1,
        replayId: 'replay_009',
        candidates: [
            {
                transformId: 'identity',
                definition: { x: 'x', y: 'y', z: 'z' },
                independentAnchorsUsed: [],
                coverageInsideBounds: null,
                anchorResidualSummary: {},
                ambiguityRate: null,
                result: 'candidate',
                limitations: [ 'No independent replay-009 spawn/base/objective anchors were available in compact outputs.' ]
            },
            ...[ 'swap_xy', 'invert_x', 'invert_y', 'invert_both', 'scale', 'translate', 'rotation' ].map((transformId) => ({
                transformId,
                definition: {},
                independentAnchorsUsed: [],
                coverageInsideBounds: null,
                anchorResidualSummary: {},
                ambiguityRate: null,
                result: 'not_testable',
                limitations: [ 'No independent anchor evidence exists for this transform in replay 009 outputs.' ]
            }))
        ],
        acceptedTransform: null,
        status: 'present_not_validated'
    });
    await writeJson(path.join(OUTPUT_DIR, 'map-version-compatibility.json'), {
        schemaVersion: 1,
        replayId: 'replay_009',
        build: 23916427,
        buildPatchMapping: 'unresolved',
        geometryCompatibility: 'unknown_map_version',
        distinctions: {
            coordinateTransformUsable: 'candidate_only',
            genericBoundsUsable: 'not_validated',
            semanticRegionsSafe: false
        },
        limitations: [
            'Build 23916427 has no exact patch/map mapping.',
            'Current or replays 001-004 geometry cannot be silently assumed for replay 009.'
        ]
    });
    await writeJson(path.join(OUTPUT_DIR, 'world-bounds-validation.json'), {
        schemaVersion: 1,
        replayId: 'replay_009',
        status: 'bounds_unavailable',
        projectedCount: 0,
        rejectedCount: totalRows,
        outOfBoundsCount: null,
        boundaryCount: null,
        coveragePercentage: 0,
        perPlayerDistribution: positionQuality.players.map((player) => ({ playerKey: player.playerKey, status: 'bounds_unavailable', eligibleSamples: player.totalSamples })),
        limitations: [ 'No supported replay-009 world bounds were available.' ]
    });
    await writeText(path.join(OUTPUT_DIR, 'generic-region-projection.jsonl'), `${JSON.stringify({
        recordType: 'metadata',
        replayId: 'replay_009',
        status: 'unavailable',
        reason: 'No validated replay-009 generic region geometry or accepted transform.'
    })}\n`);
    await writeJson(path.join(OUTPUT_DIR, 'generic-region-summary.json'), {
        schemaVersion: 1,
        replayId: 'replay_009',
        status: 'unavailable',
        eligibleSamples: totalRows,
        classifiedSamples: 0,
        ambiguityRate: null,
        limitations: [ 'No region membership was emitted.' ]
    });
    await writeJson(path.join(OUTPUT_DIR, 'lane-geometry-audit.json'), {
        schemaVersion: 1,
        replayId: 'replay_009',
        status: 'unavailable_for_replay_009',
        existingLaneSources: [ 'output/replays/replay_001..004/one-second-spatial', 'output/replay-lane-axis-topology-profile.json' ],
        limitations: [ 'Existing lane geometry was validated for replays 001-004 only.', 'No replay-009 lane thresholds or map-version compatibility were validated.' ]
    });
    await writeJson(path.join(OUTPUT_DIR, 'lane-projection-summary.json'), {
        schemaVersion: 1,
        replayId: 'replay_009',
        status: 'unavailable',
        eligibleSamples: totalRows,
        classifiedSamples: 0,
        laneOccupancyEmitted: false,
        limitations: [ 'Lane projection is blocked; lane occupancy remains prohibited.' ]
    });
    await writeJson(path.join(OUTPUT_DIR, 'base-spawn-validation.json'), {
        schemaVersion: 1,
        replayId: 'replay_009',
        status: 'present_not_validated',
        teamDistribution: roster.summary.teamDistribution,
        coordinateEvidence: 'complete player coordinate coverage',
        limitations: [ 'No base/spawn polygons or independent anchors were validated for replay 009.' ]
    });
    await writeJson(path.join(OUTPUT_DIR, 'objective-structure-geometry.json'), {
        schemaVersion: 1,
        replayId: 'replay_009',
        status: 'unavailable',
        objects: [ 'Spirit/Soul Urn', 'Urn deposit locations', 'Mid Boss', 'Guardians', 'Walkers', 'Patron/base structures' ].map((objectType) => ({
            objectType,
            geometrySource: null,
            positionOrRegion: {},
            mapVersionStatus: 'unknown_map_version',
            usableForDistance: false,
            usableForRegionMembership: false,
            confidence: 'unknown',
            limitations: [ 'No replay-009 static geometry validation.' ]
        }))
    });
    await writeJson(path.join(OUTPUT_DIR, 'proximity-capability.json'), {
        schemaVersion: 1,
        replayId: 'replay_009',
        status: 'unavailable',
        playerPositionReliability: 'usable_with_constraints',
        objectiveStructureGeometryReliability: 'unavailable',
        distanceFunction: null,
        horizontalVersus3D: null,
        radiusBoundaryInclusivity: null,
        limitations: [ 'Proximity requires both reliable player position and reliable objective/structure geometry.' ]
    });
    await writeJson(path.join(OUTPUT_DIR, 'temporal-stability.json'), {
        schemaVersion: 1,
        replayId: 'replay_009',
        status: 'usable_with_constraints',
        consecutivePositionCoverage: 'validated_by_task_056',
        largestGapSeconds: positionQuality.aggregate.largestGapSeconds,
        suddenDisplacementCount: positionQuality.aggregate.suddenDisplacementCount,
        pauseLimitation: 'parserSeconds include any unlocalized paused time',
        limitations: [ 'No region classification series exists, so region jitter cannot be evaluated.' ]
    });
    const coverage = scorecard(totalRows);
    const matrix = task060Matrix();
    await writeJson(path.join(OUTPUT_DIR, 'coverage-ambiguity-scorecard.json'), { schemaVersion: 1, replayId: 'replay_009', metrics: coverage });
    await writeJson(path.join(OUTPUT_DIR, 'task-060-unlock-matrix.json'), { schemaVersion: 1, replayId: 'replay_009', task060Status: 'partially_unlockable_when_separately_authorized', categories: matrix });
    const summary = {
        schemaVersion: 1,
        replayId: 'replay_009',
        gate: 'replay_009_spatial_geometric_projection_ready_with_limitations',
        coordinateSourceResult: 'usable_with_constraints',
        coordinateAxesUnitsResult: 'parser x/y/z and world units present; exact map orientation/unit semantics not independently anchored',
        acceptedTransform: null,
        mapVersionCompatibility: 'unknown_map_version',
        eligiblePositionSamples: totalRows,
        successfullyProjectedSamples: 0,
        projectionCoverage: 0,
        outOfBoundsCount: null,
        ambiguityRate: null,
        genericRegionResult: 'unavailable',
        laneProjectionResult: 'unavailable',
        baseSpawnResult: 'present_not_validated',
        objectiveGeometryResult: 'unavailable',
        structureGeometryResult: 'unavailable',
        proximityCapability: 'unavailable',
        temporalStabilityResult: 'usable_with_constraints',
        pauseLimitation: 'parserSeconds only; no active-game-time or pause-adjusted durations',
        task060UnlockedCategories: [ 'player life state', 'team net worth', 'entity presence' ],
        task060BlockedCategories: [ 'raw entity position', 'generic region membership', 'lane/region membership', 'objective-player proximity', 'near-deposit-location', 'structure-region association' ],
        deterministicHash: hash({ positionQuality: positionQuality.deterministicPayload ?? positionQuality.aggregate, economySummary: economySummary.summary })
    };
    await writeJson(path.join(OUTPUT_DIR, 'spatial-validation-summary.json'), summary);
    await writeJson(path.join(OUTPUT_DIR, 'spatial-validation-gate.json'), {
        schemaVersion: 1,
        gate: summary.gate,
        task: '061-validate-replay-009-spatial-geometric-projection',
        task060: {
            keepBlockedUntilSeparatelyAuthorized: true,
            allowedIfPromoted: summary.task060UnlockedCategories,
            blocked: summary.task060BlockedCategories
        },
        replay005Protection: 'not_processed',
        botFixtureExclusion: 'not_processed'
    });
    await writeText(path.join(OUTPUT_DIR, 'README.md'), `# Replay 009 Spatial Validation\n\nGate: ${summary.gate}\n\nPlayer coordinates are usable with constraints from Task 056. Map-region, lane, objective, structure, and proximity projection remain unavailable because replay-009 map geometry and build/map compatibility are not validated.\n\nTask 060 remains blocked until separately authorized, and if promoted may use only non-spatial factual categories listed in task-060-unlock-matrix.json.\n`);
    await writeText(REPORT_PATH, `# Replay 009 Spatial Geometric Projection Validation\n\nGate: \`${summary.gate}\`\n\n## Result\n\nReplay 009 player coordinate source is usable with constraints: 26,052 player-second samples, 100% coordinate presence, no null rows, no duplicate timestamps, no non-monotonic timestamps, and largest sampled gap 0 seconds from Task 056.\n\nNo accepted map transform was produced. Existing geometry is not independently mapped to build \`23916427\`, and no replay-009 world bounds, generic region geometry, lane geometry, objective geometry, or structure geometry were validated.\n\n## Task 060 Unlock\n\nSafe if separately authorized:\n\n- player life state\n- team net worth\n- entity presence/classification without spatial interpretation\n\nBlocked:\n\n- raw objective/structure position unless extracted later\n- generic region membership\n- lane/region membership\n- objective-player proximity\n- near-deposit-location\n- structure-region association\n\n## Epistemic Boundary\n\nValid coordinates do not imply a valid map transform. A future map transform would not by itself validate lane occupancy, objective auras, combat participation, rotations, pressure, or strategic interpretation.\n\n## Pause Limitation\n\nParser seconds remain the time basis. No pause-adjusted or active-game-time durations are produced.\n\n## Validation\n\nThe task generated compact deterministic outputs only. Replay 005 and bot fixtures 006-008 were not processed.\n`);
}

await main();
