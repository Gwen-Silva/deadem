import { readFile, stat, writeFile } from 'node:fs/promises';

const TIMELINE_FILE = './output/09-canonical-player-timeline.json';
const HERO_FILE = './output/13-canonical-hero-enrichment.json';
const PLAYER_LANE_FILE = './output/13-player-lane-enrichment.json';
const TOPOLOGY_FILE = './output/16-lane-topology-6592.json';
const FIELD_SEMANTICS_FILE = './output/16-lane-field-semantics.json';
const RECONCILIATION_FILE = './output/16-lane-reconciliation-review.json';
const MAP_REFERENCE_FILE = './output/13-map-lane-reference.json';
const OUTPUT_MODEL = './output/17-spatial-region-model.json';
const OUTPUT_TIMELINE = './output/17-player-region-timeline.json';
const OUTPUT_INTERVALS = './output/17-player-region-intervals.json';
const OUTPUT_EVENTS = './output/17-region-transition-events.json';
const OUTPUT_DISTRIBUTION = './output/17-team-spatial-distribution.json';
const OUTPUT_VALIDATION = './output/17-spatial-validation.json';
const OUTPUT_SIZE_LIMIT = 10 * 1024 * 1024;
const SAMPLE_SECONDS = [ 30, 60, 120, 300, 600, 1200, 1800, 2400 ];
const PROXIMITY_RADII = [ 500, 1000, 2000 ];
const PARAMETERS = {
    laneDistanceThreshold: 360,
    baseRadius: 520,
    neutralCenterRadius: 260,
    betweenLanesDistanceMargin: 75,
    smoothingMinimumSeconds: 3,
    shortTransitionSeconds: 3,
    outlierAbsCoordinateLimit: 100000
};

const timeline = JSON.parse(await readFile(TIMELINE_FILE, 'utf8'));
const heroes = JSON.parse(await readFile(HERO_FILE, 'utf8'));
const playerLanes = JSON.parse(await readFile(PLAYER_LANE_FILE, 'utf8'));
const topology = JSON.parse(await readFile(TOPOLOGY_FILE, 'utf8'));
const fieldSemantics = JSON.parse(await readFile(FIELD_SEMANTICS_FILE, 'utf8'));
const reconciliation = JSON.parse(await readFile(RECONCILIATION_FILE, 'utf8'));
const mapReference = JSON.parse(await readFile(MAP_REFERENCE_FILE, 'utf8'));
const schemaIndex = Object.fromEntries(timeline.playerRowSchema.map((field, index) => [ field, index ]));
const players = buildPlayers();
const regionModel = buildRegionModel();
const classified = classifyTimeline();
const smoothed = smoothClassifications(classified);
const intervals = buildIntervals(smoothed);
const transitionEvents = buildTransitionEvents(smoothed, intervals);
const distribution = buildTeamDistribution(smoothed);
const validation = buildValidation(smoothed, intervals, transitionEvents);

await writeJson(OUTPUT_MODEL, regionModel);
await writeJson(OUTPUT_TIMELINE, buildCompactTimeline(smoothed));
await writeJson(OUTPUT_INTERVALS, intervals);
await writeJson(OUTPUT_EVENTS, transitionEvents);
await writeJson(OUTPUT_DISTRIBUTION, distribution);
await writeJson(OUTPUT_VALIDATION, validation);
await validateOutputs();

console.log(`Known-region classification: ${validation.quality.knownRegionPercent}%`);
console.log(`Unknown classification: ${validation.quality.unknownPercent}%`);
console.log(`Transition events: ${transitionEvents.events.length}`);
console.log(`Wrote ${OUTPUT_MODEL}`);
console.log(`Wrote ${OUTPUT_TIMELINE}`);
console.log(`Wrote ${OUTPUT_INTERVALS}`);
console.log(`Wrote ${OUTPUT_EVENTS}`);
console.log(`Wrote ${OUTPUT_DISTRIBUTION}`);
console.log(`Wrote ${OUTPUT_VALIDATION}`);

function buildPlayers() {
    return heroes.map(hero => {
        const lane = playerLanes.find(item => item.playerIndex === hero.playerIndex);

        return {
            playerIndex: hero.playerIndex,
            steamId: hero.steamId,
            name: hero.name,
            team: hero.team,
            heroInternalName: hero.heroInternalName,
            heroDisplayName: hero.heroDisplayName,
            assignedLaneRaw: lane?.assignedLaneRaw ?? null,
            originalLaneRaw: lane?.originalLaneRaw ?? null,
            initialDeducedLaneRaw: lane?.initialDeducedLaneRaw ?? null,
            assignedPhysicalLaneId: physicalLaneId(lane?.assignedLaneRaw)
        };
    }).sort((a, b) => a.playerIndex - b.playerIndex);
}

function buildRegionModel() {
    const laneAxes = topology.corridors.map((corridor, index) => buildLaneAxis(corridor, index));
    const baseRegions = buildBaseRegions();
    const neutralCenter = {
        region: 'neutral_center',
        method: 'centroid of physical lane axes and objective anchors',
        center: averagePoint(laneAxes.map(axis => axis.center)),
        radius: PARAMETERS.neutralCenterRadius,
        priority: 30,
        confidence: 'medium'
    };
    const laneRegions = laneAxes.flatMap(axis => [
        buildLaneRegion(axis, 'team_2_side'),
        buildLaneRegion(axis, 'center'),
        buildLaneRegion(axis, 'team_3_side')
    ]);

    return {
        sourceFiles: [
            TIMELINE_FILE,
            HERO_FILE,
            PLAYER_LANE_FILE,
            TOPOLOGY_FILE,
            FIELD_SEMANTICS_FILE,
            RECONCILIATION_FILE,
            MAP_REFERENCE_FILE
        ],
        identityModel: {
            analyticIdentity: 'physicalLaneId',
            separatedFields: [ 'laneCodeRaw', 'physicalLaneId', 'displayLabel' ],
            laneReconciliationRule: reconciliation.finalReplayEnrichmentRule,
            fieldSemantics: fieldSemantics.fields.map(field => ({
                field: field.field,
                observedValues: field.observedValues,
                semantic: field.semantic,
                confidence: field.confidence
            }))
        },
        parameters: PARAMETERS,
        proximityRadii: PROXIMITY_RADII,
        laneAxes,
        regions: [
            ...baseRegions,
            ...laneRegions,
            neutralCenter,
            {
                region: 'between_lanes',
                method: 'assigned when two closest lane axes are within the configured margin and no higher priority region applies',
                priority: 10,
                confidence: 'medium'
            },
            {
                region: 'unknown',
                method: 'fallback when no region has enough evidence',
                priority: 0,
                confidence: 'high'
            }
        ],
        classificationMethod: [
            'Base regions are checked first using base objective anchors from experiment 13 map reference.',
            'Lane regions are selected by planar distance to lane axes derived from objective, trooper and zipline anchors in experiment 16.',
            'Lane side is determined from projection along each lane axis split into thirds.',
            'm_nDeducedLane is recorded as secondary evidence and never used as the only classifier.'
        ],
        confidence: 'medium',
        limitations: [
            'Lane axes are approximated from extracted anchors, not full map polylines.',
            'Base regions use objective anchors from output/13-map-lane-reference.json because experiment 16 references it as topology source.',
            'The model is descriptive only and does not infer strategic quality.'
        ]
    };
}

function buildLaneAxis(corridor, index) {
    const anchorPoints = [
        ...Object.values(corridor.objectiveSummary).flatMap(summary => summary.examplePositions),
        ...corridor.minionPathEvidence.map(item => item.position),
        ...corridor.ziplineEvidence.map(item => item.position),
        corridor.axisSpatialEvidence.laneCenterFromExperiment13
    ].filter(Boolean);
    const pca = principalAxis(anchorPoints);
    const projections = anchorPoints.map(point => projectScalar(point, pca.center, pca.direction)).sort((a, b) => a - b);

    return {
        physicalLaneId: `lane_${index + 1}`,
        laneCodeRaw: corridor.laneCodeRaw,
        schemaColorName: corridor.schemaColorName,
        displayLabel: corridor.laneCodeRaw === 6 ? 'Green' : corridor.schemaColorName,
        labelReconciliationStatus: corridor.laneCodeRaw === 6 ? 'layer_conflict' : 'consistent',
        center: pca.center,
        direction: pca.direction,
        projectionMin: projections[0],
        projectionMax: projections[projections.length - 1],
        projectionBreaks: thirds(projections[0], projections[projections.length - 1]),
        anchorCount: anchorPoints.length,
        anchorMethod: 'objectiveSummary + minionPathEvidence + ziplineEvidence + lane center from experiment 16',
        confidence: corridor.confidence
    };
}

function buildBaseRegions() {
    const tier3 = mapReference.anchorsUsed.filter(anchor => anchor.className === 'CNPC_Boss_Tier3' && anchor.team !== null);

    return tier3.map(anchor => ({
        region: `base_team_${anchor.team}`,
        team: anchor.team,
        method: 'CNPC_Boss_Tier3 base objective anchor from output/13-map-lane-reference.json',
        center: anchor.position,
        radius: PARAMETERS.baseRadius,
        anchor: {
            className: anchor.className,
            handle: anchor.handle,
            team: anchor.team,
            position: anchor.position,
            laneFields: anchor.laneFields
        },
        priority: 100,
        confidence: 'high'
    }));
}

function buildLaneRegion(axis, segment) {
    return {
        region: `${axis.physicalLaneId}_${segment}`,
        physicalLaneId: axis.physicalLaneId,
        laneCodeRaw: axis.laneCodeRaw,
        displayLabel: axis.displayLabel,
        method: 'distance to physical lane axis and projection-third segment',
        axisCenter: axis.center,
        axisDirection: axis.direction,
        projectionRange: projectionRangeForSegment(axis, segment),
        maxDistance: PARAMETERS.laneDistanceThreshold,
        priority: 50,
        confidence: axis.confidence
    };
}

function classifyTimeline() {
    return timeline.snapshots.map(snapshot => {
        const rowInfos = snapshot.playerRows.map(row => classifyRow(snapshot, row));
        const proximity = computeProximity(rowInfos);

        return {
            gameSecond: snapshot.gameSecond,
            gameTime: snapshot.gameTime,
            demoTick: snapshot.demoTick,
            serverTick: snapshot.serverTick,
            players: rowInfos.map(row => ({
                ...row,
                proximity: proximity.get(row.playerIndex)
            }))
        };
    });
}

function classifyRow(snapshot, row) {
    const playerIndex = row[schemaIndex.playerIndex];
    const player = players.find(item => item.playerIndex === playerIndex);
    const position = {
        x: row[schemaIndex.x],
        y: row[schemaIndex.y],
        z: row[schemaIndex.z]
    };
    const alive = Boolean(row[schemaIndex.alive]);
    const netWorth = row[schemaIndex.netWorth];
    const laneEvidence = playerLanes.find(item => item.playerIndex === playerIndex)?.samples.find(sample => sample.gameSecond === snapshot.gameSecond);
    const classification = classifyPosition(position);

    return {
        playerIndex,
        team: player.team,
        heroDisplayName: player.heroDisplayName,
        position,
        alive,
        netWorth,
        assignedLaneRaw: player.assignedLaneRaw,
        assignedPhysicalLaneId: player.assignedPhysicalLaneId,
        deducedLaneRaw: laneEvidence?.deducedLaneRaw ?? null,
        rawRegion: classification.region,
        smoothRegion: classification.region,
        physicalLaneId: classification.physicalLaneId,
        secondBestRegion: classification.secondBestRegion,
        selectedDistance: classification.selectedDistance,
        laneDistances: classification.laneDistances,
        confidence: classification.confidence,
        reason: classification.reason,
        outlier: isOutlier(position)
    };
}

function classifyPosition(position) {
    for (const base of regionModel.regions.filter(region => region.region.startsWith('base_team_'))) {
        const distance = planarDistance(position, base.center);

        if (distance <= base.radius) {
            return {
                region: base.region,
                physicalLaneId: null,
                secondBestRegion: null,
                selectedDistance: round(distance),
                laneDistances: laneDistances(position),
                confidence: 'high',
                reason: `within ${base.radius} units of ${base.region} anchor`
            };
        }
    }

    const distances = laneDistances(position);
    const sorted = [ ...distances ].sort((a, b) => a.distance - b.distance);
    const best = sorted[0];
    const second = sorted[1] ?? null;

    if (best.distance <= PARAMETERS.laneDistanceThreshold) {
        if (second !== null && second.distance - best.distance <= PARAMETERS.betweenLanesDistanceMargin) {
            return {
                region: 'between_lanes',
                physicalLaneId: null,
                secondBestRegion: regionForLaneDistance(second, position),
                selectedDistance: round(best.distance),
                laneDistances: distances,
                confidence: 'medium',
                reason: 'two closest lane axes are within margin'
            };
        }

        return {
            region: regionForLaneDistance(best, position),
            physicalLaneId: best.physicalLaneId,
            secondBestRegion: second === null ? null : regionForLaneDistance(second, position),
            selectedDistance: round(best.distance),
            laneDistances: distances,
            confidence: best.distance <= PARAMETERS.laneDistanceThreshold * 0.65 ? 'high' : 'medium',
            reason: 'closest lane axis within threshold'
        };
    }

    const neutralDistance = planarDistance(position, regionModel.regions.find(region => region.region === 'neutral_center').center);

    if (neutralDistance <= PARAMETERS.neutralCenterRadius) {
        return {
            region: 'neutral_center',
            physicalLaneId: null,
            secondBestRegion: regionForLaneDistance(best, position),
            selectedDistance: round(neutralDistance),
            laneDistances: distances,
            confidence: 'medium',
            reason: 'within neutral center radius'
        };
    }

    return {
        region: 'unknown',
        physicalLaneId: null,
        secondBestRegion: regionForLaneDistance(best, position),
        selectedDistance: round(best.distance),
        laneDistances: distances,
        confidence: 'low',
        reason: 'outside base, lane and neutral thresholds'
    };
}

function smoothClassifications(snapshots) {
    const byPlayer = new Map();

    for (const snapshot of snapshots) {
        for (const player of snapshot.players) {
            if (!byPlayer.has(player.playerIndex)) {
                byPlayer.set(player.playerIndex, []);
            }

            byPlayer.get(player.playerIndex).push({ snapshot, player });
        }
    }

    for (const rows of byPlayer.values()) {
        for (let index = 0; index < rows.length; index++) {
            const current = rows[index];
            const previous = rows[index - 1]?.player.smoothRegion ?? current.player.rawRegion;

            if (current.player.rawRegion === previous) {
                current.player.smoothRegion = current.player.rawRegion;
                continue;
            }

            const duration = countForwardSameRegion(rows, index, current.player.rawRegion);

            current.player.smoothRegion = duration >= PARAMETERS.smoothingMinimumSeconds
                ? current.player.rawRegion
                : previous;
        }
    }

    return snapshots;
}

function buildIntervals(snapshots) {
    const intervals = [];

    for (const player of players) {
        const rows = snapshots.map(snapshot => ({
            gameSecond: snapshot.gameSecond,
            demoTick: snapshot.demoTick,
            row: snapshot.players.find(item => item.playerIndex === player.playerIndex)
        })).filter(item => item.row !== undefined);
        let current = null;

        for (const item of rows) {
            const region = item.row.smoothRegion;

            if (current === null || current.region !== region) {
                if (current !== null) {
                    closeInterval(current, item.gameSecond - 1);
                    intervals.push(current);
                }

                current = {
                    playerIndex: player.playerIndex,
                    steamId: player.steamId,
                    name: player.name,
                    heroDisplayName: player.heroDisplayName,
                    team: player.team,
                    region,
                    startSecond: item.gameSecond,
                    startDemoTick: item.demoTick,
                    endSecond: item.gameSecond,
                    endDemoTick: item.demoTick,
                    durationSeconds: 1,
                    rawRegionAtStart: item.row.rawRegion,
                    confidence: item.row.confidence
                };
            } else {
                current.endSecond = item.gameSecond;
                current.endDemoTick = item.demoTick;
                current.durationSeconds = current.endSecond - current.startSecond + 1;
            }
        }

        if (current !== null) {
            intervals.push(current);
        }
    }

    return { parameters: PARAMETERS, intervals };
}

function buildTransitionEvents(snapshots, intervalSet) {
    const events = [];

    for (const player of players) {
        const playerIntervals = intervalSet.intervals.filter(interval => interval.playerIndex === player.playerIndex);

        for (let index = 1; index < playerIntervals.length; index++) {
            const previous = playerIntervals[index - 1];
            const current = playerIntervals[index];
            const snapshot = snapshots.find(item => item.gameSecond === current.startSecond);
            const row = snapshot?.players.find(item => item.playerIndex === player.playerIndex);

            if (row === undefined) {
                continue;
            }

            events.push({
                type: transitionType(previous.region, current.region),
                playerIndex: player.playerIndex,
                gameSecond: current.startSecond,
                demoTick: current.startDemoTick,
                previousRegion: previous.region,
                newRegion: current.region,
                durationInPreviousRegion: previous.durationSeconds,
                position: row.position,
                alive: row.alive,
                netWorth: row.netWorth,
                nearbyAllies: row.proximity.nearbyAllies,
                nearbyEnemies: row.proximity.nearbyEnemies,
                confidence: row.confidence
            });
        }
    }

    return {
        parameters: PARAMETERS,
        events
    };
}

function buildTeamDistribution(snapshots) {
    const regionDictionary = buildRegionDictionary(snapshots);

    return {
        parameters: PARAMETERS,
        regionDictionary,
        regionSchema: [
            'regionCode',
            'team2Players',
            'team3Players',
            'diff',
            'team2NetWorth',
            'team3NetWorth',
            'team2Alive',
            'team3Alive',
            'team2Dead',
            'team3Dead'
        ],
        globalDistributionSchema: [ 'lane_1', 'lane_2', 'lane_3', 'base', 'center', 'other' ],
        snapshots: snapshots.map(snapshot => {
            const regions = {};
            const teamSummary = {
                2: emptyGlobalDistribution(),
                3: emptyGlobalDistribution()
            };

            for (const row of snapshot.players) {
                const region = row.smoothRegion;

                if (!regions[region]) {
                    regions[region] = emptyRegionPresence();
                }

                const bucket = regions[region][row.team];
                const player = players.find(item => item.playerIndex === row.playerIndex);

                bucket.players.push(row.playerIndex);
                bucket.heroes.push(player.heroDisplayName);
                bucket.netWorth += row.netWorth;
                if (row.alive) bucket.alive++; else bucket.dead++;

                incrementGlobalDistribution(teamSummary[row.team], region);
            }

            for (const region of Object.values(regions)) {
                region.diff = region[2].players.length - region[3].players.length;
            }

            return {
                gameSecond: snapshot.gameSecond,
                demoTick: snapshot.demoTick,
                regions: Object.entries(regions).map(([ region, value ]) => [
                    regionDictionary[region],
                    value[2].players,
                    value[3].players,
                    value.diff,
                    value[2].netWorth,
                    value[3].netWorth,
                    value[2].alive,
                    value[3].alive,
                    value[2].dead,
                    value[3].dead
                ]),
                globalDistributionByTeam: {
                    2: globalDistributionArray(teamSummary[2]),
                    3: globalDistributionArray(teamSummary[3])
                }
            };
        })
    };
}

function buildValidation(snapshots, intervalSet, events) {
    const allRows = snapshots.flatMap(snapshot => snapshot.players.map(player => ({ snapshot, player })));
    const knownRows = allRows.filter(item => item.player.smoothRegion !== 'unknown');
    const unknownRows = allRows.filter(item => item.player.smoothRegion === 'unknown');
    const betweenRows = allRows.filter(item => item.player.smoothRegion === 'between_lanes');
    const assignedConflicts = allRows.filter(item => conflictWithAssignedLane(item.player));
    const deducedConflicts = allRows.filter(item => conflictWithDeducedLane(item.player));
    const rawTransitions = countRawTransitions(snapshots);
    const smoothTransitions = events.events.length;
    const durations = intervalSet.intervals.map(interval => interval.durationSeconds).sort((a, b) => a - b);
    const manualSeconds = [ ...SAMPLE_SECONDS, snapshots[snapshots.length - 1].gameSecond ];

    return {
        manualSamples: manualSeconds.map(second => validationSampleAt(second, snapshots)),
        quality: {
            totalRows: allRows.length,
            knownRegionPercent: percent(knownRows.length, allRows.length),
            unknownPercent: percent(unknownRows.length, allRows.length),
            betweenLanesPercent: percent(betweenRows.length, allRows.length),
            assignedLaneConflictCount: assignedConflicts.length,
            assignedLaneConflictPercent: percent(assignedConflicts.length, allRows.length),
            deducedLaneConflictCount: deducedConflicts.length,
            deducedLaneConflictPercent: percent(deducedConflicts.length, allRows.length),
            rawTransitionCount: rawTransitions,
            smoothedTransitionCount: smoothTransitions,
            medianIntervalDurationSeconds: median(durations),
            excessiveShortIntervals: intervalSet.intervals.filter(interval => interval.durationSeconds <= PARAMETERS.shortTransitionSeconds).length,
            outlierPositionCount: allRows.filter(item => item.player.outlier).length,
            mostRegionChangesByPlayer: topRegionChangers(intervalSet.intervals)
        },
        unknownExamples: unknownRows.slice(0, 30).map(item => ({
            gameSecond: item.snapshot.gameSecond,
            playerIndex: item.player.playerIndex,
            position: item.player.position,
            secondBestRegion: item.player.secondBestRegion,
            distance: item.player.selectedDistance
        })),
        conflictsWithAssignedLane: assignedConflicts.slice(0, 50).map(conflictRecord),
        conflictsWithDeducedLane: deducedConflicts.slice(0, 50).map(conflictRecord),
        parameters: PARAMETERS,
        limitations: [
            'Region model uses straight-line lane axes approximated from anchors, not full map polylines.',
            'Classification is descriptive and is not a fight/rotation quality detector.',
            'Unknown and between_lanes are expected near boundaries or off-lane movement.'
        ]
    };
}

function buildCompactTimeline(snapshots) {
    const regionDictionary = buildRegionDictionary(snapshots);
    const confidenceDictionary = { high: 2, medium: 1, low: 0 };

    return {
        regionDictionary,
        confidenceDictionary,
        schema: [
            'playerIndex',
            'rawRegionCode',
            'smoothRegionCode',
            'confidenceCode',
            'assignedLaneRaw',
            'deducedLaneRaw',
            'distanceLane1',
            'distanceLane2',
            'distanceLane3',
            'nearestAlly',
            'nearestEnemy',
            'alliesWithin500',
            'enemiesWithin500'
        ],
        parameters: PARAMETERS,
        snapshots: snapshots.map(snapshot => ({
            gameSecond: snapshot.gameSecond,
            demoTick: snapshot.demoTick,
            rows: snapshot.players.map(player => [
                player.playerIndex,
                regionDictionary[player.rawRegion],
                regionDictionary[player.smoothRegion],
                confidenceDictionary[player.confidence],
                player.assignedLaneRaw,
                player.deducedLaneRaw,
                Math.round(player.laneDistances[0]?.distance ?? 0),
                Math.round(player.laneDistances[1]?.distance ?? 0),
                Math.round(player.laneDistances[2]?.distance ?? 0),
                player.proximity.nearestAlly?.playerIndex ?? null,
                player.proximity.nearestEnemy?.playerIndex ?? null,
                player.proximity.allyCountsWithinRadii['500'] ?? 0,
                player.proximity.enemyCountsWithinRadii['500'] ?? 0
            ])
        }))
    };
}

function buildRegionDictionary(snapshots) {
    const regions = [ ...new Set(snapshots.flatMap(snapshot => snapshot.players.flatMap(player => [ player.rawRegion, player.smoothRegion ]))) ].sort();

    return Object.fromEntries(regions.map((region, index) => [ region, index ]));
}

function computeProximity(rows) {
    const result = new Map();
    const byTeam = groupBy(rows, row => row.team);
    const centroids = Object.fromEntries(Object.entries(byTeam).map(([ team, teamRows ]) => [ team, averagePoint(teamRows.map(row => row.position)) ]));

    for (const row of rows) {
        const allies = rows.filter(other => other.playerIndex !== row.playerIndex && other.team === row.team);
        const enemies = rows.filter(other => other.team !== row.team);
        const allyDistances = allies.map(other => ({ playerIndex: other.playerIndex, distance: planarDistance(row.position, other.position) })).sort((a, b) => a.distance - b.distance);
        const enemyDistances = enemies.map(other => ({ playerIndex: other.playerIndex, distance: planarDistance(row.position, other.position) })).sort((a, b) => a.distance - b.distance);

        result.set(row.playerIndex, {
            nearestAlly: allyDistances[0] ? roundDistanceObject(allyDistances[0]) : null,
            nearestEnemy: enemyDistances[0] ? roundDistanceObject(enemyDistances[0]) : null,
            allyCountsWithinRadii: countsWithinRadii(allyDistances),
            enemyCountsWithinRadii: countsWithinRadii(enemyDistances),
            nearbyAllies: allyDistances.filter(item => item.distance <= PROXIMITY_RADII[1]).map(roundDistanceObject),
            nearbyEnemies: enemyDistances.filter(item => item.distance <= PROXIMITY_RADII[1]).map(roundDistanceObject),
            teamMeanDistance: round(meanPairwiseDistance(byTeam[row.team] ?? [])),
            distanceToOwnTeamCentroid: round(planarDistance(row.position, centroids[row.team]))
        });
    }

    return result;
}

function laneDistances(position) {
    return regionModel.laneAxes.map(axis => ({
        physicalLaneId: axis.physicalLaneId,
        laneCodeRaw: axis.laneCodeRaw,
        displayLabel: axis.displayLabel,
        distance: round(distanceToAxis(position, axis)),
        projection: round(projectScalar(position, axis.center, axis.direction))
    }));
}

function regionForLaneDistance(distanceRecord, position) {
    const axis = regionModel.laneAxes.find(item => item.physicalLaneId === distanceRecord.physicalLaneId);
    const projection = projectScalar(position, axis.center, axis.direction);
    const segment = projection <= axis.projectionBreaks[0]
        ? 'team_2_side'
        : projection >= axis.projectionBreaks[1] ? 'team_3_side' : 'center';

    return `${axis.physicalLaneId}_${segment}`;
}

function physicalLaneId(laneCodeRaw) {
    const index = topology.activePhysicalLaneCodes.indexOf(laneCodeRaw);

    return index === -1 ? null : `lane_${index + 1}`;
}

function principalAxis(points) {
    const center = averagePoint(points);
    const covariance = points.reduce((acc, point) => {
        const dx = point.x - center.x;
        const dy = point.y - center.y;

        return {
            xx: acc.xx + dx * dx,
            xy: acc.xy + dx * dy,
            yy: acc.yy + dy * dy
        };
    }, { xx: 0, xy: 0, yy: 0 });
    const angle = 0.5 * Math.atan2(2 * covariance.xy, covariance.xx - covariance.yy);

    return {
        center,
        direction: {
            x: Math.cos(angle),
            y: Math.sin(angle)
        }
    };
}

function projectionRangeForSegment(axis, segment) {
    if (segment === 'team_2_side') return [ axis.projectionMin, axis.projectionBreaks[0] ];
    if (segment === 'team_3_side') return [ axis.projectionBreaks[1], axis.projectionMax ];

    return [ axis.projectionBreaks[0], axis.projectionBreaks[1] ];
}

function closeInterval(interval, endSecond) {
    interval.endSecond = endSecond;
    interval.durationSeconds = interval.endSecond - interval.startSecond + 1;
}

function countForwardSameRegion(rows, startIndex, region) {
    let count = 0;

    for (let index = startIndex; index < rows.length && rows[index].player.rawRegion === region; index++) {
        count++;
    }

    return count;
}

function transitionType(previous, next) {
    if (next.startsWith('base_')) return 'base_return';
    if (previous.startsWith('base_') && next.startsWith('lane_')) return 'lane_entry';
    if (previous.startsWith('lane_') && !next.startsWith('lane_')) return 'lane_exit';
    if (previous.startsWith('lane_') && next.startsWith('lane_') && previous.split('_').slice(0, 2).join('_') !== next.split('_').slice(0, 2).join('_')) return 'cross_lane_transition';
    if (next === 'unknown') return 'unknown_transition';

    return 'region_transition';
}

function emptyRegionPresence() {
    return {
        2: { players: [], heroes: [], count: 0, netWorth: 0, alive: 0, dead: 0 },
        3: { players: [], heroes: [], count: 0, netWorth: 0, alive: 0, dead: 0 },
        diff: 0
    };
}

function emptyGlobalDistribution() {
    return {
        lane_1: 0,
        lane_2: 0,
        lane_3: 0,
        base: 0,
        center: 0,
        other: 0
    };
}

function globalDistributionArray(summary) {
    return [ summary.lane_1, summary.lane_2, summary.lane_3, summary.base, summary.center, summary.other ];
}

function incrementGlobalDistribution(summary, region) {
    if (region.startsWith('lane_1')) summary.lane_1++;
    else if (region.startsWith('lane_2')) summary.lane_2++;
    else if (region.startsWith('lane_3')) summary.lane_3++;
    else if (region.startsWith('base_')) summary.base++;
    else if (region === 'neutral_center') summary.center++;
    else summary.other++;
}

function validationSampleAt(second, snapshots) {
    const snapshot = snapshots.reduce((best, item) => Math.abs(item.gameSecond - second) < Math.abs(best.gameSecond - second) ? item : best, snapshots[0]);

    return {
        requestedSecond: second,
        gameSecond: snapshot.gameSecond,
        gameTime: snapshot.gameTime,
        demoTick: snapshot.demoTick,
        players: snapshot.players.map(row => {
            const player = players.find(item => item.playerIndex === row.playerIndex);

            return {
                playerIndex: row.playerIndex,
                name: player.name,
                heroDisplayName: player.heroDisplayName,
                position: row.position,
                rawRegion: row.rawRegion,
                smoothRegion: row.smoothRegion,
                assignedLaneRaw: row.assignedLaneRaw,
                deducedLaneRaw: row.deducedLaneRaw,
                laneDistances: row.laneDistances
            };
        })
    };
}

function conflictWithAssignedLane(row) {
    if (row.assignedPhysicalLaneId === null || !row.smoothRegion.startsWith('lane_')) {
        return false;
    }

    return !row.smoothRegion.startsWith(row.assignedPhysicalLaneId);
}

function conflictWithDeducedLane(row) {
    const deducedPhysical = physicalLaneId(row.deducedLaneRaw);

    if (deducedPhysical === null || !row.smoothRegion.startsWith('lane_')) {
        return false;
    }

    return !row.smoothRegion.startsWith(deducedPhysical);
}

function countRawTransitions(snapshots) {
    let count = 0;

    for (const player of players) {
        let previous = null;

        for (const snapshot of snapshots) {
            const row = snapshot.players.find(item => item.playerIndex === player.playerIndex);

            if (previous !== null && row.rawRegion !== previous) {
                count++;
            }

            previous = row.rawRegion;
        }
    }

    return count;
}

function topRegionChangers(intervals) {
    return Object.entries(groupBy(intervals, interval => interval.playerIndex))
        .map(([ playerIndex, playerIntervals ]) => ({
            playerIndex: Number(playerIndex),
            changes: playerIntervals.length - 1
        }))
        .sort((a, b) => b.changes - a.changes)
        .slice(0, 6);
}

function conflictRecord(item) {
    return {
        gameSecond: item.snapshot.gameSecond,
        playerIndex: item.player.playerIndex,
        smoothRegion: item.player.smoothRegion,
        assignedLaneRaw: item.player.assignedLaneRaw,
        deducedLaneRaw: item.player.deducedLaneRaw,
        position: item.player.position
    };
}

function countsWithinRadii(distances) {
    return Object.fromEntries(PROXIMITY_RADII.map(radius => [ String(radius), distances.filter(item => item.distance <= radius).length ]));
}

function meanPairwiseDistance(rows) {
    const distances = [];

    for (let left = 0; left < rows.length; left++) {
        for (let right = left + 1; right < rows.length; right++) {
            distances.push(planarDistance(rows[left].position, rows[right].position));
        }
    }

    return distances.length === 0 ? null : distances.reduce((sum, value) => sum + value, 0) / distances.length;
}

function averagePoint(points) {
    const valid = points.filter(Boolean);

    if (valid.length === 0) {
        return null;
    }

    return {
        x: valid.reduce((sum, point) => sum + point.x, 0) / valid.length,
        y: valid.reduce((sum, point) => sum + point.y, 0) / valid.length,
        z: valid.reduce((sum, point) => sum + (point.z ?? 0), 0) / valid.length
    };
}

function projectScalar(point, center, direction) {
    return ((point.x - center.x) * direction.x) + ((point.y - center.y) * direction.y);
}

function distanceToAxis(point, axis) {
    const projection = projectScalar(point, axis.center, axis.direction);
    const nearest = {
        x: axis.center.x + projection * axis.direction.x,
        y: axis.center.y + projection * axis.direction.y
    };

    return planarDistance(point, nearest);
}

function planarDistance(left, right) {
    if (left === null || right === null) {
        return null;
    }

    return Math.hypot(left.x - right.x, left.y - right.y);
}

function thirds(min, max) {
    const span = max - min;

    return [ min + span / 3, min + (2 * span) / 3 ];
}

function isOutlier(position) {
    return Math.abs(position.x) > PARAMETERS.outlierAbsCoordinateLimit || Math.abs(position.y) > PARAMETERS.outlierAbsCoordinateLimit || Math.abs(position.z) > PARAMETERS.outlierAbsCoordinateLimit;
}

function groupBy(values, getKey) {
    const result = {};

    for (const value of values) {
        const key = getKey(value);

        if (!result[key]) {
            result[key] = [];
        }

        result[key].push(value);
    }

    return result;
}

function median(values) {
    if (values.length === 0) {
        return null;
    }

    const middle = Math.floor(values.length / 2);

    return values.length % 2 === 0 ? (values[middle - 1] + values[middle]) / 2 : values[middle];
}

function percent(value, total) {
    return total === 0 ? 0 : Number(((value / total) * 100).toFixed(2));
}

function round(value) {
    return value === null ? null : Number(value.toFixed(2));
}

function roundDistanceObject(item) {
    return {
        playerIndex: item.playerIndex,
        distance: round(item.distance)
    };
}

async function validateOutputs() {
    for (const file of [ OUTPUT_MODEL, OUTPUT_TIMELINE, OUTPUT_INTERVALS, OUTPUT_EVENTS, OUTPUT_DISTRIBUTION, OUTPUT_VALIDATION ]) {
        JSON.parse(await readFile(file, 'utf8'));
        const size = (await stat(file)).size;

        if (size > OUTPUT_SIZE_LIMIT) {
            throw new Error(`${file} exceeds 10 MiB (${size} bytes)`);
        }
    }
}

async function writeJson(file, data) {
    const compactFiles = new Set([
        OUTPUT_TIMELINE,
        OUTPUT_INTERVALS,
        OUTPUT_EVENTS,
        OUTPUT_DISTRIBUTION
    ]);
    const content = compactFiles.has(file) ? JSON.stringify(data) : JSON.stringify(data, null, 4);

    await writeFile(file, `${content}\n`);
}
