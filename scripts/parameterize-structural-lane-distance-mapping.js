import fs from 'node:fs/promises';

const PROFILE_FILE = 'output/replay-lane-axis-topology-profile.json';
const GATE_FILE = 'output/replay-lane-axis-topology-gate.json';
const OUTPUT_SIZE_LIMIT = 10 * 1024 * 1024;

main();

async function main() {
    const profile = JSON.parse(await fs.readFile(PROFILE_FILE, 'utf8'));
    const gate = JSON.parse(await fs.readFile(GATE_FILE, 'utf8'));
    if (gate.gateResult !== 'structural_topology_ready_for_lane_mapping') {
        throw new Error(`Topology gate is ${gate.gateResult}`);
    }

    const results = [];
    const replay002 = await processReplay('replay_002', profile);
    results.push(replay002.summary);

    if (replay002.summary.gate === 'pass') {
        for (const replayId of [ 'replay_003', 'replay_004' ]) {
            const result = await processReplay(replayId, profile);
            results.push(result.summary);
        }
    }

    const summary = {
        schemaVersion: 1,
        kind: 'lane_axis_distance_mapping_summary',
        topologyProfile: profile.profileId,
        replay002SmokeResult: replay002.summary.gate,
        results,
        gateResult: results.every(result => result.gate === 'pass') ? 'lane_distance_mapping_ready' : 'lane_distance_mapping_blocked',
        prohibitedNotRun: [
            'stable_occupancy_classification',
            'transition_detection',
            'replay_005_processing',
            'semantic_lane_color_claims'
        ],
        replay005Protection: {
            status: 'preserved',
            processed: false
        }
    };

    await writeJson('output/replays/lane-axis-distance-mapping-summary.json', summary);
    await writeReport(summary);
    await validateOutputs([
        ...results.map(result => result.outputFile),
        'output/replays/lane-axis-distance-mapping-summary.json'
    ]);
    console.log(`lane distance mapping gate: ${summary.gateResult}`);
}

async function processReplay(replayId, profile) {
    const inputFile = `output/replays/${replayId}/pre-geometry-pipeline.json`;
    const outputFile = `output/replays/${replayId}/lane-axis-distance-mapping.json`;
    const input = JSON.parse(await fs.readFile(inputFile, 'utf8'));
    const laneAxes = profile.laneAxes.map(axis => ({
        neutralLaneId: axis.neutralLaneId,
        polyline: axis.polyline,
        start: axis.endpointAnchors.start.coordinates,
        end: axis.endpointAnchors.end.coordinates
    }));
    const snapshots = input.snapshots.map(snapshot => {
        const rows = snapshot.rawMovementCoordinates.map(row => mapRow(row, laneAxes));
        return {
            requestedTick: snapshot.requestedTick,
            actualTick: snapshot.actualTick,
            rows
        };
    });
    const rowCount = snapshots.reduce((sum, snapshot) => sum + snapshot.rows.length, 0);
    const output = {
        schemaVersion: 1,
        replayId,
        source: inputFile,
        topologyProfile: profile.profileId,
        stagesRun: [ 'lane_axis_distance_projection' ],
        stagesNotRun: [
            'stable_occupancy_classification',
            'transition_detection',
            'combat_analysis',
            'objective_lifecycle',
            'economy',
            'macro_analysis'
        ],
        featureSchema: [
            'distanceToLaneAxes',
            'nearestPhysicalLane',
            'secondNearestPhysicalLane',
            'separationMargin',
            'normalizedProgressAlongLane',
            'distanceToLaneEndpoints',
            'laneAxisProjectionQuality'
        ],
        snapshots,
        quality: {
            snapshotCount: snapshots.length,
            rowCount,
            rowsWithFiniteNearestLane: snapshots.flatMap(snapshot => snapshot.rows).filter(row => row.nearestPhysicalLane !== null).length,
            gate: rowCount > 0 ? 'pass' : 'fail'
        },
        replay005Touched: false
    };

    await writeJson(outputFile, output);
    return {
        output,
        summary: {
            replayId,
            outputFile,
            gate: output.quality.gate,
            snapshotCount: output.quality.snapshotCount,
            rowCount: output.quality.rowCount,
            rowsWithFiniteNearestLane: output.quality.rowsWithFiniteNearestLane
        }
    };
}

function mapRow(row, laneAxes) {
    const point = { x: row.x, y: row.y, z: row.z ?? 0 };
    const laneDistances = laneAxes.map(axis => {
        const projection = projectToPolyline(point, axis.polyline);
        return {
            neutralLaneId: axis.neutralLaneId,
            distance: round(projection.distance),
            normalizedProgressAlongLane: round(projection.normalizedProgress),
            distanceToStartEndpoint: round(distance(point, axis.start)),
            distanceToEndEndpoint: round(distance(point, axis.end)),
            projectionQuality: projection.segmentIndex === null ? 'unprojected' : 'projected_to_polyline'
        };
    }).sort((left, right) => left.distance - right.distance);
    const nearest = laneDistances[0] ?? null;
    const second = laneDistances[1] ?? null;

    return {
        pawnHandle: row.pawnHandle,
        controllerHandle: row.controllerHandle,
        position: point,
        alive: row.alive,
        distanceToLaneAxes: laneDistances,
        nearestPhysicalLane: nearest?.neutralLaneId ?? null,
        secondNearestPhysicalLane: second?.neutralLaneId ?? null,
        separationMargin: nearest !== null && second !== null ? round(second.distance - nearest.distance) : null,
        normalizedProgressAlongLane: nearest?.normalizedProgressAlongLane ?? null,
        distanceToLaneEndpoints: nearest === null ? null : {
            start: nearest.distanceToStartEndpoint,
            end: nearest.distanceToEndEndpoint
        },
        laneAxisProjectionQuality: nearest?.projectionQuality ?? 'unprojected'
    };
}

function projectToPolyline(point, polyline) {
    if (polyline.length < 2) {
        return { distance: null, normalizedProgress: null, segmentIndex: null };
    }
    const segmentLengths = [];
    let totalLength = 0;
    for (let index = 1; index < polyline.length; index++) {
        const length = distance(polyline[index - 1], polyline[index]);
        segmentLengths.push(length);
        totalLength += length;
    }
    let best = null;
    let distanceBefore = 0;
    for (let index = 1; index < polyline.length; index++) {
        const projected = projectToSegment(point, polyline[index - 1], polyline[index]);
        const candidate = {
            distance: distance(point, projected.point),
            normalizedProgress: totalLength === 0 ? 0 : (distanceBefore + projected.t * segmentLengths[index - 1]) / totalLength,
            segmentIndex: index - 1
        };
        if (best === null || candidate.distance < best.distance) {
            best = candidate;
        }
        distanceBefore += segmentLengths[index - 1];
    }
    return best;
}

function projectToSegment(point, start, end) {
    const vx = end.x - start.x;
    const vy = end.y - start.y;
    const vz = (end.z ?? 0) - (start.z ?? 0);
    const wx = point.x - start.x;
    const wy = point.y - start.y;
    const wz = (point.z ?? 0) - (start.z ?? 0);
    const lengthSquared = vx * vx + vy * vy + vz * vz;
    const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, (wx * vx + wy * vy + wz * vz) / lengthSquared));
    return {
        t,
        point: {
            x: start.x + t * vx,
            y: start.y + t * vy,
            z: (start.z ?? 0) + t * vz
        }
    };
}

function distance(left, right) {
    return Math.hypot(left.x - right.x, left.y - right.y, (left.z ?? 0) - (right.z ?? 0));
}

function round(value) {
    return Number.isFinite(value) ? Math.round(value * 100) / 100 : value;
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

async function writeReport(summary) {
    const report = `# Lane Axis Distance Mapping

## Summary

Task 023 projected sampled raw movement coordinates onto the approved structural lane-axis polylines for replays 002-004. Replay 002 was processed first as the smoke test.

${summary.results.map(result => `- ${result.replayId}: ${result.gate}, ${result.rowCount} coordinate rows, output \`${result.outputFile}\`.`).join('\n')}

## Gate result

\`${summary.gateResult}\`

## Limits

- No stable occupancy classification was produced.
- No transition detection was run.
- Replay 005 was not processed.
- Lane colors and strategic labels remain prohibited.
`;
    await fs.writeFile('reports/lane-axis-distance-mapping.md', report);
    await fs.writeFile('reports/latest.md', 'reports/lane-axis-distance-mapping.md\n');
}
