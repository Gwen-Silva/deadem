import fs from 'node:fs/promises';
import path from 'node:path';

const REPLAYS = [ 'replay_001', 'replay_002', 'replay_003', 'replay_004' ];
const OUTPUT_SIZE_LIMIT = 10 * 1024 * 1024;
const CHUNK_SECONDS = 300;

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});

async function main() {
    const results = [];
    for (const replayId of REPLAYS) results.push(await processReplay(replayId));
    const comparison = buildComparison(results);
    const gate = buildGate(results);
    await writeJson('output/replays/multi-replay-match-state-comparison.json', comparison);
    await writeJson('output/replays/match-state-timeline-gate.json', gate);
    await writeReport(results, gate);
    await validateOutputs([
        ...results.flatMap(result => [ result.indexFile, ...result.shardFiles, result.qualityFile ]),
        'output/replays/multi-replay-match-state-comparison.json',
        'output/replays/match-state-timeline-gate.json',
        'reports/unified-descriptive-match-state-timeline.md'
    ]);
    console.log(`match-state gate: ${gate.gateResult}`);
    for (const result of results) console.log(`${result.replayId}: ${result.rowCount} seconds, ${result.shardFiles.length} shards`);
}

async function processReplay(replayId) {
    const outDir = path.join('output', 'replays', replayId);
    const spatial = await loadSpatialRows(replayId);
    const damage = await loadDamageRows(replayId);
    const deaths = JSON.parse(await fs.readFile(path.join(outDir, 'canonical-death-events.json'), 'utf8')).events;
    const objectives = await loadObjectiveRows(replayId);
    const seconds = Array.from(new Set([
        ...spatial.keys(),
        ...damage.keys(),
        ...objectives.keys()
    ])).sort((left, right) => left - right);
    const deathEventsBySecond = groupArray(deaths, event => event.death.gameTimeSeconds);
    const respawnEventsBySecond = groupArray(deaths.filter(event => event.respawn.gameTimeSeconds !== null), event => event.respawn.gameTimeSeconds);
    const rows = seconds.map(second => buildStateRow(replayId, second, spatial, damage, objectives, deaths, deathEventsBySecond, respawnEventsBySecond));
    const { indexFile, shardFiles, indexRows } = await writeTimelineChunks(outDir, replayId, rows);
    const quality = buildQuality(replayId, rows, indexRows);
    const qualityFile = path.join(outDir, 'match-state-quality.json');
    await writeJson(qualityFile, quality);
    return { replayId, rowCount: rows.length, indexFile, shardFiles, qualityFile, quality };
}

function buildStateRow(replayId, second, spatial, damage, objectives, deaths, deathEventsBySecond, respawnEventsBySecond) {
    const players = (spatial.get(second) ?? []).map(player => {
        const damageRow = damage.get(second)?.get(player.playerId) ?? null;
        return {
            playerId: player.playerId,
            heroId: player.heroId,
            team: player.team,
            alive: aliveAt(player.playerId, second, deaths),
            position: {
                x: player.position?.x ?? null,
                y: player.position?.y ?? null,
                z: player.position?.z ?? null,
                quality: player.position?.quality ?? null
            },
            physicalLaneEvidence: {
                nearestLane: player.laneProjection?.nearestLane ?? null,
                nearestDistance: player.laneProjection?.nearestDistance ?? null,
                separationMargin: player.laneProjection?.separationMargin ?? null
            },
            netWorth: damageRow?.counters?.m_iGoldNetWorth ?? null,
            recentDeltas: {
                heroDamage: positiveOrZero(damageRow?.deltas?.m_iHeroDamage),
                objectiveDamage: positiveOrZero(damageRow?.deltas?.m_iObjectiveDamage),
                heroHealing: positiveOrZero(damageRow?.deltas?.m_iHeroHealing),
                selfHealing: positiveOrZero(damageRow?.deltas?.m_iSelfHealing)
            }
        };
    }).sort((left, right) => String(left.team).localeCompare(String(right.team)) || left.playerId.localeCompare(right.playerId));
    const objectiveStates = (objectives.get(second) ?? []).map(objective => ({
        objectiveId: objective.objectiveId,
        objectiveType: objective.objectiveType,
        team: objective.team,
        laneAxis: objective.laneAxis,
        alive: objective.state?.alive ?? null,
        health: objective.state?.health ?? null,
        healthRatio: objective.state?.healthRatio ?? null
    })).sort((left, right) => left.objectiveId.localeCompare(right.objectiveId));
    return {
        schemaVersion: 1,
        replayId,
        gameTimeSeconds: second,
        players,
        objectiveStates,
        events: {
            deaths: (deathEventsBySecond.get(second) ?? []).map(event => ({ eventId: event.eventId, victim: event.victim.playerId, killer: event.killer.playerId, killerStatus: event.killer.status })),
            respawns: (respawnEventsBySecond.get(second) ?? []).map(event => ({ eventId: event.eventId, playerId: event.victim.playerId, deadDurationSeconds: event.respawn.deadDurationSeconds }))
        },
        teamSummary: summarizeTeams(players, objectiveStates),
        allowedInterpretation: 'factual descriptive match state',
        prohibitedInterpretations: [ 'fight grouping', 'strategic decision quality', 'semantic lane occupancy', 'rotation or transition inference' ]
    };
}

function summarizeTeams(players, objectiveStates) {
    const teams = {};
    for (const player of players) {
        const key = String(player.team ?? 'unknown');
        const item = teams[key] ?? { playersAlive: 0, playersDead: 0, netWorth: 0, heroDamageDelta: 0, objectiveDamageDelta: 0, healingDelta: 0, objectivesAlive: 0 };
        if (player.alive) item.playersAlive += 1;
        else item.playersDead += 1;
        item.netWorth += Number(player.netWorth) || 0;
        item.heroDamageDelta += player.recentDeltas.heroDamage;
        item.objectiveDamageDelta += player.recentDeltas.objectiveDamage;
        item.healingDelta += player.recentDeltas.heroHealing + player.recentDeltas.selfHealing;
        teams[key] = item;
    }
    for (const objective of objectiveStates) {
        const key = String(objective.team ?? 'neutral');
        const item = teams[key] ?? { playersAlive: 0, playersDead: 0, netWorth: 0, heroDamageDelta: 0, objectiveDamageDelta: 0, healingDelta: 0, objectivesAlive: 0 };
        if (objective.alive) item.objectivesAlive += 1;
        teams[key] = item;
    }
    return Object.fromEntries(Object.entries(teams).map(([ team, value ]) => [ team, {
        ...value,
        netWorth: round(value.netWorth),
        heroDamageDelta: round(value.heroDamageDelta),
        objectiveDamageDelta: round(value.objectiveDamageDelta),
        healingDelta: round(value.healingDelta)
    } ]));
}

function aliveAt(playerId, second, deaths) {
    const relevant = deaths.filter(event => event.victim.playerId === playerId && event.death.gameTimeSeconds <= second);
    if (relevant.length === 0) return true;
    const last = relevant.at(-1);
    return last.respawn.gameTimeSeconds !== null && second >= last.respawn.gameTimeSeconds;
}

async function loadSpatialRows(replayId) {
    const manifest = JSON.parse(await fs.readFile(`output/replays/${replayId}/one-second-spatial/manifest.json`, 'utf8'));
    const bySecond = new Map();
    for (const shard of manifest.shards) {
        const rows = await readJsonl(shard.file);
        for (const row of rows) addToMapArray(bySecond, row.gameTimeSeconds, row);
    }
    return bySecond;
}

async function loadDamageRows(replayId) {
    const manifest = JSON.parse(await fs.readFile(`output/replays/${replayId}/damage-healing-counter-timeline.json`, 'utf8'));
    const bySecond = new Map();
    for (const shard of manifest.shards) {
        const rows = await readJsonl(shard.file);
        for (const row of rows) {
            const secondMap = bySecond.get(row.gameTimeSeconds) ?? new Map();
            secondMap.set(row.playerId, row);
            bySecond.set(row.gameTimeSeconds, secondMap);
        }
    }
    return bySecond;
}

async function loadObjectiveRows(replayId) {
    const indexRows = await readJsonl(`output/replays/${replayId}/objective-timeline.jsonl`);
    const bySecond = new Map();
    for (const shard of indexRows) {
        const rows = await readJsonl(shard.file);
        for (const row of rows) addToMapArray(bySecond, row.gameTimeSeconds, row);
    }
    return bySecond;
}

async function writeTimelineChunks(outDir, replayId, rows) {
    const shardDir = path.join(outDir, 'match-state-timeline-shards');
    await fs.mkdir(shardDir, { recursive: true });
    const indexRows = [];
    const shardFiles = [];
    for (let start = 0; start < rows.length; start += CHUNK_SECONDS) {
        const chunk = rows.slice(start, start + CHUNK_SECONDS);
        const file = path.join(shardDir, `chunk_${String(indexRows.length + 1).padStart(3, '0')}.jsonl`);
        await writeJsonl(file, chunk);
        shardFiles.push(file);
        indexRows.push({
            replayId,
            file,
            startSecond: chunk[0]?.gameTimeSeconds ?? null,
            endSecond: chunk.at(-1)?.gameTimeSeconds ?? null,
            rows: chunk.length
        });
    }
    const indexFile = path.join(outDir, 'match-state-timeline.jsonl');
    await writeJsonl(indexFile, indexRows);
    return { indexFile, shardFiles, indexRows };
}

function buildQuality(replayId, rows, indexRows) {
    const playerCounts = rows.map(row => row.players.length);
    const objectiveCounts = rows.map(row => row.objectiveStates.length);
    const chronological = rows.every((row, index) => index === 0 || row.gameTimeSeconds > rows[index - 1].gameTimeSeconds);
    return {
        schemaVersion: 1,
        kind: 'match_state_quality',
        replayId,
        rows: rows.length,
        shardCount: indexRows.length,
        chronological,
        playerCountRange: range(playerCounts),
        objectiveStateCountRange: range(objectiveCounts),
        secondsWithDeaths: rows.filter(row => row.events.deaths.length > 0).length,
        secondsWithRespawns: rows.filter(row => row.events.respawns.length > 0).length,
        secondsWithObjectiveDamage: rows.filter(row => Object.values(row.teamSummary).some(team => team.objectiveDamageDelta > 0)).length,
        replay005Protection: { processed: false, status: 'preserved' },
        limitations: [
            'This timeline is factual/descriptive and does not define fights.',
            'Lane fields are physical proximity evidence, not semantic occupancy.',
            'Damage deltas are cumulative counter deltas, not source-target attribution.'
        ]
    };
}

function buildComparison(results) {
    return {
        schemaVersion: 1,
        kind: 'multi_replay_match_state_comparison',
        replays: results.map(result => ({
            replayId: result.replayId,
            rows: result.rowCount,
            shards: result.shardFiles.length,
            playerCountRange: result.quality.playerCountRange,
            objectiveStateCountRange: result.quality.objectiveStateCountRange,
            secondsWithDeaths: result.quality.secondsWithDeaths,
            secondsWithRespawns: result.quality.secondsWithRespawns,
            secondsWithObjectiveDamage: result.quality.secondsWithObjectiveDamage
        })),
        replay005Protection: { processed: false, status: 'preserved' }
    };
}

function buildGate(results) {
    const allChronological = results.every(result => result.quality.chronological);
    const allHavePlayers = results.every(result => result.quality.playerCountRange.min === 12 && result.quality.playerCountRange.max === 12);
    const allHaveObjectives = results.every(result => result.quality.objectiveStateCountRange.max > 0);
    let gateResult = 'match_state_sources_insufficient';
    if (allChronological && allHavePlayers && allHaveObjectives) gateResult = 'match_state_timeline_ready_with_limitations';
    if (allChronological && allHavePlayers && allHaveObjectives && results.every(result => result.quality.objectiveStateCountRange.min > 0)) gateResult = 'match_state_timeline_ready';
    return {
        schemaVersion: 1,
        kind: 'match_state_timeline_gate',
        gateResult,
        evidence: {
            allChronological,
            allHaveTwelvePlayers: allHavePlayers,
            allHaveObjectiveStates: allHaveObjectives,
            replayRows: results.map(result => ({ replayId: result.replayId, rows: result.rowCount }))
        },
        limitations: [
            'Factual match-state rows only; no fight grouping, intent, strategic judgment, semantic lane occupancy, transitions, or rotations.',
            'Replay 005 remains unprocessed.'
        ],
        replay005Protection: { processed: false, status: 'preserved' },
        humanReviewRequired: false
    };
}

async function writeReport(results, gate) {
    const lines = results.map(result => `- ${result.replayId}: ${result.rowCount} seconds, ${result.shardFiles.length} shards, player count ${result.quality.playerCountRange.min}-${result.quality.playerCountRange.max}, objective states ${result.quality.objectiveStateCountRange.min}-${result.quality.objectiveStateCountRange.max}.`).join('\n');
    const report = `# Unified Descriptive Match-State Timeline

## Scope

This task combines validated descriptive layers for replays 001-004. It does not process replay 005, define fights, evaluate decisions, infer intent, use semantic occupancy, or detect transitions.

## Results

${lines}

## Included layers

- One-second player positions and physical lane-axis proximity evidence.
- Alive/dead intervals from canonical death and respawn events.
- Net worth and cumulative damage/healing counter deltas.
- Objective state rows and lifecycle-derived map state.

## Gate

\`${gate.gateResult}\`
`;
    await fs.writeFile('reports/unified-descriptive-match-state-timeline.md', report);
    await fs.writeFile('reports/latest.md', 'reports/unified-descriptive-match-state-timeline.md\n');
}

function positiveOrZero(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? round(number) : 0;
}

function addToMapArray(map, key, value) {
    const rows = map.get(key) ?? [];
    rows.push(value);
    map.set(key, rows);
}

function groupArray(values, keyFn) {
    const map = new Map();
    for (const value of values) addToMapArray(map, keyFn(value), value);
    return map;
}

function range(values) {
    if (values.length === 0) return { min: null, max: null };
    return { min: Math.min(...values), max: Math.max(...values) };
}

function round(value) {
    if (!Number.isFinite(value)) return value;
    return Math.round(value * 1000) / 1000;
}

async function readJsonl(file) {
    const text = await fs.readFile(file, 'utf8');
    return text.trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
}

async function validateOutputs(files) {
    for (const file of files) {
        const stats = await fs.stat(file);
        if (stats.size > OUTPUT_SIZE_LIMIT) throw new Error(`${file} exceeds 10 MiB`);
        const text = await fs.readFile(file, 'utf8');
        if (file.endsWith('.json')) JSON.parse(text);
        if (file.endsWith('.jsonl')) for (const line of text.trim().split(/\r?\n/).filter(Boolean)) JSON.parse(line);
    }
}

async function writeJson(file, value) {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeJsonl(file, rows) {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, rows.map(row => JSON.stringify(row)).join('\n') + '\n');
}
