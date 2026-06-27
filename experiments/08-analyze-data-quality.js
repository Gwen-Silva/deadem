import { createReadStream } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { Logger, Player } from 'deadem';

const DEMO_ARGUMENT_PREFIX = '--demo=';
const DEFAULT_DEMO = './samples/partida_001.dem';
const TIMELINE_FILE = './output/07-player-timeline.json';
const QUALITY_FILE = './output/07-player-timeline-quality.json';
const HEALTH_OUTPUT_FILE = './output/08-health-anomaly-analysis.json';
const CUMULATIVE_OUTPUT_FILE = './output/08-cumulative-stat-analysis.json';
const RECOMMENDATIONS_OUTPUT_FILE = './output/08-data-quality-recommendations.json';
const CONTROLLER_CLASS = 'CCitadelPlayerController';
const PAWN_CLASS = 'CCitadelPlayerPawn';
const OUTPUT_SIZE_LIMIT = 5 * 1024 * 1024;
const MAX_INTERVALS_PER_PLAYER_WITH_SAMPLES = 8;
const MAX_SCHEMA_SAMPLE_SECONDS = 120;
const HEALTH_CANDIDATE_PATTERN = /(health|maxhealth|bonushealth|temporaryhealth|shield|barrier|armor|effectivehealth|modifier)/iu;
const CONTROLLER_HEALTH_FIELDS = [
    'm_iHealth',
    'm_iHealthMax',
    'm_flHealthRegen',
    'm_bAlive',
    'm_iLevel',
    'm_iGoldNetWorth'
];
const PAWN_HEALTH_FIELDS = [
    'm_iHealth',
    'm_iMaxHealth',
    'm_lifeState',
    'm_flRespawnTime',
    'm_flLastSpawnTime'
];
const CUMULATIVE_FIELDS = [
    'netWorth',
    'abilityPointsNetWorth',
    'kills',
    'deaths',
    'assists',
    'lastHits',
    'denies',
    'heroDamage',
    'objectiveDamage',
    'heroHealing',
    'selfHealing'
];

const startedAt = Date.now();
const demoPath = resolveDemoPath();
const timeline = JSON.parse(await readFile(TIMELINE_FILE, 'utf8'));
const quality = JSON.parse(await readFile(QUALITY_FILE, 'utf8'));
const index = buildTimelineIndex(timeline);
const healthAnalysisBase = analyzeHealthAnomalies(timeline, index);
const cumulativeAnalysisBase = analyzeCumulativeDrops(timeline, quality, index);
const samplePlan = buildSamplePlan(healthAnalysisBase, cumulativeAnalysisBase, index);
const replaySamples = await inspectReplaySamples(demoPath, samplePlan, index);
const healthAnalysis = enrichHealthAnalysis(healthAnalysisBase, replaySamples);
const cumulativeAnalysis = enrichCumulativeAnalysis(cumulativeAnalysisBase, replaySamples);
const recommendations = buildRecommendations(healthAnalysis, cumulativeAnalysis, startedAt);

await mkdir(path.dirname(HEALTH_OUTPUT_FILE), { recursive: true });
await writeJson(HEALTH_OUTPUT_FILE, healthAnalysis);
await writeJson(CUMULATIVE_OUTPUT_FILE, cumulativeAnalysis);
await writeJson(RECOMMENDATIONS_OUTPUT_FILE, recommendations);
await assertSizeUnderLimit(HEALTH_OUTPUT_FILE);
await assertSizeUnderLimit(CUMULATIVE_OUTPUT_FILE);
await assertSizeUnderLimit(RECOMMENDATIONS_OUTPUT_FILE);

console.log(`Health anomalies: ${healthAnalysis.global.totalAnomalousSeconds}`);
console.log(`Cumulative drops: ${cumulativeAnalysis.global.totalDrops}`);
console.log(`Wrote ${HEALTH_OUTPUT_FILE}`);
console.log(`Wrote ${CUMULATIVE_OUTPUT_FILE}`);
console.log(`Wrote ${RECOMMENDATIONS_OUTPUT_FILE}`);

function resolveDemoPath() {
    const argument = process.argv.find(arg => arg.startsWith(DEMO_ARGUMENT_PREFIX));
    const file = argument ? argument.slice(DEMO_ARGUMENT_PREFIX.length) : DEFAULT_DEMO;

    return path.resolve(process.cwd(), file);
}

function buildTimelineIndex(data) {
    const schema = data.playerRowSchema;
    const players = new Map(data.players.map(player => [ player.playerIndex, player ]));
    const snapshots = [];
    const snapshotBySecond = new Map();
    const rowBySecondAndPlayer = new Map();

    for (const snapshot of data.snapshots) {
        const expandedPlayers = snapshot.playerRows.map(row => expandPlayerRow(schema, row));
        const expandedSnapshot = {
            ...snapshot,
            players: expandedPlayers
        };

        delete expandedSnapshot.playerRows;

        snapshots.push(expandedSnapshot);
        snapshotBySecond.set(snapshot.gameSecond, expandedSnapshot);

        for (const player of expandedPlayers) {
            rowBySecondAndPlayer.set(getRowKey(snapshot.gameSecond, player.playerIndex), player);
        }
    }

    return {
        players,
        snapshots,
        snapshotBySecond,
        rowBySecondAndPlayer
    };
}

function expandPlayerRow(schema, row) {
    const output = {
        position: {},
        eyeAngles: {}
    };

    for (let i = 0; i < schema.length; i++) {
        const field = schema[i];
        const value = row[i];

        if (field.startsWith('position.')) {
            output.position[field.slice('position.'.length)] = value;
        } else if (field.startsWith('eyeAngles.')) {
            output.eyeAngles[field.slice('eyeAngles.'.length)] = value;
        } else {
            output[field] = value;
        }
    }

    if (Object.values(output.eyeAngles).every(value => value === null || value === undefined)) {
        output.eyeAngles = null;
    }

    return output;
}

function analyzeHealthAnomalies(data, index) {
    const intervals = [];
    const byPlayer = new Map();
    const formulaStats = createFormulaStats();

    for (const player of data.players) {
        byPlayer.set(player.playerIndex, {
            playerIndex: player.playerIndex,
            steamId: player.steamId,
            name: player.name,
            heroIdRaw: player.heroIdRaw,
            totalAnomalousSeconds: 0,
            firstGameSecond: null,
            lastGameSecond: null,
            maxHealthObserved: null,
            minMaxHealthObserved: null,
            maxRatio: null,
            intervalCount: 0,
            longestIntervalSeconds: 0
        });
    }

    for (const snapshot of index.snapshots) {
        for (const playerRow of snapshot.players) {
            observeFormulaStats(formulaStats, playerRow);

            if (!hasHealthAnomaly(playerRow)) {
                continue;
            }

            const playerSummary = byPlayer.get(playerRow.playerIndex);

            updatePlayerHealthSummary(playerSummary, snapshot, playerRow);
        }
    }

    for (const player of data.players) {
        const playerIntervals = buildHealthIntervalsForPlayer(player, index);

        intervals.push(...playerIntervals);

        const playerSummary = byPlayer.get(player.playerIndex);

        playerSummary.intervalCount = playerIntervals.length;
        playerSummary.longestIntervalSeconds = playerIntervals.reduce((max, interval) => Math.max(max, interval.durationSeconds), 0);
    }

    return {
        global: {
            totalAnomalousSeconds: Array.from(byPlayer.values()).reduce((sum, player) => sum + player.totalAnomalousSeconds, 0),
            playersAffected: Array.from(byPlayer.values()).filter(player => player.totalAnomalousSeconds > 0).length,
            intervalCount: intervals.length,
            maxRatio: maxBy(intervals, interval => interval.maxRatio)?.maxRatio ?? null,
            sourceTimeline: TIMELINE_FILE
        },
        byPlayer: Array.from(byPlayer.values()).filter(player => player.totalAnomalousSeconds > 0),
        intervals,
        formulaComparison: finalizeFormulaStats(formulaStats),
        candidateFields: [],
        selectedSamples: [],
        recommendedSources: null
    };
}

function buildHealthIntervalsForPlayer(player, index) {
    const intervals = [];
    let current = null;

    for (const snapshot of index.snapshots) {
        const row = index.rowBySecondAndPlayer.get(getRowKey(snapshot.gameSecond, player.playerIndex));
        const anomalous = row !== undefined && hasHealthAnomaly(row);

        if (!anomalous) {
            if (current !== null) {
                intervals.push(finishInterval(current));
                current = null;
            }

            continue;
        }

        const ratio = row.health / row.maxHealth;
        const difference = row.health - row.maxHealth;

        if (current === null) {
            current = {
                playerIndex: player.playerIndex,
                steamId: player.steamId,
                name: player.name,
                heroIdRaw: player.heroIdRaw,
                startGameSecond: snapshot.gameSecond,
                endGameSecond: snapshot.gameSecond,
                startGameTime: snapshot.gameTime,
                endGameTime: snapshot.gameTime,
                startDemoTick: snapshot.demoTick,
                endDemoTick: snapshot.demoTick,
                maxDifference: difference,
                maxRatio: ratio,
                maxRatioGameSecond: snapshot.gameSecond,
                aliveValues: new Set(),
                sampleSeconds: new Set()
            };
        }

        current.endGameSecond = snapshot.gameSecond;
        current.endGameTime = snapshot.gameTime;
        current.endDemoTick = snapshot.demoTick;
        current.maxDifference = Math.max(current.maxDifference, difference);

        if (ratio > current.maxRatio) {
            current.maxRatio = ratio;
            current.maxRatioGameSecond = snapshot.gameSecond;
        }

        current.aliveValues.add(row.alive);
    }

    if (current !== null) {
        intervals.push(finishInterval(current));
    }

    return intervals;
}

function finishInterval(interval) {
    const sampleSeconds = [
        interval.startGameSecond - 1,
        interval.startGameSecond,
        interval.maxRatioGameSecond,
        interval.endGameSecond,
        interval.endGameSecond + 1
    ].filter(second => Number.isInteger(second));

    return {
        playerIndex: interval.playerIndex,
        steamId: interval.steamId,
        name: interval.name,
        heroIdRaw: interval.heroIdRaw,
        startGameSecond: interval.startGameSecond,
        endGameSecond: interval.endGameSecond,
        startGameTime: interval.startGameTime,
        endGameTime: interval.endGameTime,
        startDemoTick: interval.startDemoTick,
        endDemoTick: interval.endDemoTick,
        durationSeconds: interval.endGameSecond - interval.startGameSecond + 1,
        maxDifference: interval.maxDifference,
        maxRatio: interval.maxRatio,
        maxRatioGameSecond: interval.maxRatioGameSecond,
        aliveValues: Array.from(interval.aliveValues),
        selectedSampleSeconds: Array.from(new Set(sampleSeconds))
    };
}

function analyzeCumulativeDrops(data, qualityReport, index) {
    const timelineDrops = detectCumulativeDrops(index);
    const qualityDrops = qualityReport.validationIssues.filter(issue => issue.type === 'cumulative_stat_decreased');
    const drops = timelineDrops.map(drop => classifyDropBase(drop, index));

    return {
        global: {
            totalDrops: drops.length,
            sourceQualityIssueCount: qualityDrops.length,
            sourceTimeline: TIMELINE_FILE,
            sourceQuality: QUALITY_FILE
        },
        byField: summarizeDrops(drops, 'field'),
        byPlayer: summarizeDrops(drops, 'playerIndex'),
        drops,
        classifications: {},
        treatmentRecommendation: null
    };
}

function detectCumulativeDrops(index) {
    const drops = [];
    const previousByPlayer = new Map();

    for (const snapshot of index.snapshots) {
        for (const row of snapshot.players) {
            const previous = previousByPlayer.get(row.playerIndex);

            if (previous !== undefined) {
                for (const field of CUMULATIVE_FIELDS) {
                    const previousValue = previous.row[field];
                    const value = row[field];

                    if (typeof value === 'number' && typeof previousValue === 'number' && value < previousValue) {
                        drops.push({
                            playerIndex: row.playerIndex,
                            field,
                            previousGameSecond: previous.snapshot.gameSecond,
                            gameSecond: snapshot.gameSecond,
                            previousDemoTick: previous.snapshot.demoTick,
                            demoTick: snapshot.demoTick,
                            previousValue,
                            value,
                            delta: value - previousValue,
                            previousAlive: previous.row.alive,
                            alive: row.alive,
                            previousDeaths: previous.row.deaths,
                            deaths: row.deaths,
                            previousPawnHandle: previous.row.pawnHandle,
                            pawnHandle: row.pawnHandle,
                            previousControllerHandle: previous.row.controllerHandle,
                            controllerHandle: row.controllerHandle,
                            gameState: snapshot.gameState,
                            paused: snapshot.paused
                        });
                    }
                }
            }

            previousByPlayer.set(row.playerIndex, {
                snapshot,
                row
            });
        }
    }

    return drops;
}

function classifyDropBase(drop, index) {
    const player = index.players.get(drop.playerIndex);
    const previousPrevious = index.rowBySecondAndPlayer.get(getRowKey(drop.previousGameSecond - 1, drop.playerIndex));
    const next = index.rowBySecondAndPlayer.get(getRowKey(drop.gameSecond + 1, drop.playerIndex));
    const persists = next !== undefined && typeof next[drop.field] === 'number' && next[drop.field] <= drop.value;
    const returnsToPrevious = next !== undefined && next[drop.field] >= drop.previousValue;
    const existedOnlyAtSnapshot = previousPrevious !== undefined && next !== undefined && previousPrevious[drop.field] === drop.previousValue && next[drop.field] === drop.previousValue;
    const coincidesWithDeath = drop.deaths > drop.previousDeaths || (drop.previousAlive === true && drop.alive === false);
    const coincidesWithRespawn = drop.previousAlive === false && drop.alive === true;
    const coincidesWithPawnChange = drop.previousPawnHandle !== drop.pawnHandle;
    const classification = classifyDrop({
        persists,
        returnsToPrevious,
        existedOnlyAtSnapshot,
        coincidesWithDeath,
        coincidesWithRespawn,
        coincidesWithPawnChange
    });

    return {
        ...drop,
        steamId: player?.steamId ?? null,
        name: player?.name ?? null,
        heroIdRaw: player?.heroIdRaw ?? null,
        nextGameSecond: next === undefined ? null : drop.gameSecond + 1,
        nextValue: next?.[drop.field] ?? null,
        persists,
        returnsToPrevious,
        existedOnlyAtSnapshot,
        coincidesWithDeath,
        coincidesWithRespawn,
        coincidesWithPawnChange,
        coincidesWithPause: drop.paused === true,
        classification,
        evidence: buildDropEvidence({
            persists,
            returnsToPrevious,
            existedOnlyAtSnapshot,
            coincidesWithDeath,
            coincidesWithRespawn,
            coincidesWithPawnChange
        })
    };
}

function classifyDrop(flags) {
    if (flags.coincidesWithPawnChange) {
        return 'likely_resolution_error';
    }

    if (flags.existedOnlyAtSnapshot || flags.returnsToPrevious) {
        return 'likely_transient_replication';
    }

    if (flags.coincidesWithDeath || flags.coincidesWithRespawn) {
        return 'likely_field_reset';
    }

    if (flags.persists) {
        return 'likely_wrong_cumulative_assumption';
    }

    return 'unexplained';
}

function buildDropEvidence(flags) {
    return Object.entries(flags)
        .filter(([ , value ]) => value === true)
        .map(([ key ]) => key);
}

function buildSamplePlan(healthAnalysis, cumulativeAnalysis, index) {
    const seconds = new Set();

    for (const playerSummary of healthAnalysis.byPlayer) {
        const intervals = healthAnalysis.intervals
            .filter(interval => interval.playerIndex === playerSummary.playerIndex)
            .slice(0, MAX_INTERVALS_PER_PLAYER_WITH_SAMPLES);

        for (const interval of intervals) {
            for (const second of interval.selectedSampleSeconds) {
                if (index.snapshotBySecond.has(second)) {
                    seconds.add(second);
                }
            }
        }
    }

    for (const drop of cumulativeAnalysis.drops) {
        for (const second of [ drop.previousGameSecond, drop.gameSecond, drop.gameSecond + 1 ]) {
            if (index.snapshotBySecond.has(second)) {
                seconds.add(second);
            }
        }
    }

    const schemaProbeSeconds = index.snapshots
        .filter((_, i) => i % Math.max(1, Math.floor(index.snapshots.length / MAX_SCHEMA_SAMPLE_SECONDS)) === 0)
        .map(snapshot => snapshot.gameSecond);

    for (const second of schemaProbeSeconds) {
        seconds.add(second);
    }

    return Array.from(seconds)
        .sort((a, b) => a - b)
        .map(second => index.snapshotBySecond.get(second));
}

async function inspectReplaySamples(file, sampleSnapshots, index) {
    const player = new Player(undefined, Logger.NOOP);
    const samples = [];
    const controllerCandidateFields = new Set(CONTROLLER_HEALTH_FIELDS);
    const pawnCandidateFields = new Set(PAWN_HEALTH_FIELDS);

    try {
        await player.load(createReadStream(file));

        for (const snapshot of sampleSnapshots) {
            await player.seekToTick(snapshot.demoTick);

            const replaySnapshot = inspectCurrentReplaySnapshot(player, snapshot, index, controllerCandidateFields, pawnCandidateFields);

            samples.push(replaySnapshot);
        }

        return {
            samples,
            candidateFields: {
                controller: Array.from(controllerCandidateFields).sort((a, b) => a.localeCompare(b)),
                pawn: Array.from(pawnCandidateFields).sort((a, b) => a.localeCompare(b))
            }
        };
    } finally {
        await player.dispose();
    }
}

function inspectCurrentReplaySnapshot(player, snapshot, index, controllerCandidateFields, pawnCandidateFields) {
    const demo = player.getDemo();
    const controllers = demo.getEntitiesByClassName(CONTROLLER_CLASS);
    const pawns = demo.getEntitiesByClassName(PAWN_CLASS);
    const controllerByHandle = new Map(controllers.map(controller => [ controller.handle, controller ]));
    const pawnByHandle = new Map(pawns.map(pawn => [ pawn.handle, pawn ]));
    const inspectedPlayers = [];

    for (const timelineRow of snapshot.players) {
        const controller = controllerByHandle.get(timelineRow.controllerHandle) ?? null;
        const pawn = pawnByHandle.get(timelineRow.pawnHandle) ?? null;

        collectCandidateFields(controller, controllerCandidateFields);
        collectCandidateFields(pawn, pawnCandidateFields);

        inspectedPlayers.push({
            playerIndex: timelineRow.playerIndex,
            steamId: index.players.get(timelineRow.playerIndex)?.steamId ?? null,
            controllerHandle: timelineRow.controllerHandle,
            pawnHandle: timelineRow.pawnHandle,
            controller: readFields(controller, controllerCandidateFields),
            pawn: readFields(pawn, pawnCandidateFields),
            formulas: {
                pawnHealthOverPawnMax: safeRatio(getNumberField(pawn, 'm_iHealth'), getNumberField(pawn, 'm_iMaxHealth')),
                pawnHealthOverControllerMax: safeRatio(getNumberField(pawn, 'm_iHealth'), getNumberField(controller, 'm_iHealthMax')),
                controllerHealthOverControllerMax: safeRatio(getNumberField(controller, 'm_iHealth'), getNumberField(controller, 'm_iHealthMax'))
            }
        });
    }

    return {
        gameSecond: snapshot.gameSecond,
        gameTime: snapshot.gameTime,
        demoTick: player.getCurrentTick(),
        requestedDemoTick: snapshot.demoTick,
        serverTick: snapshot.serverTick,
        players: inspectedPlayers
    };
}

function collectCandidateFields(entity, candidateFields) {
    if (entity === null) {
        return;
    }

    for (const field of entity.fieldNames()) {
        if (HEALTH_CANDIDATE_PATTERN.test(field)) {
            candidateFields.add(field);
        }
    }
}

function readFields(entity, fields) {
    if (entity === null) {
        return null;
    }

    const output = {};

    for (const field of fields) {
        const value = normalizeValue(entity.getField(field));

        if (value !== null) {
            output[field] = value;
        }
    }

    return output;
}

function enrichHealthAnalysis(base, replaySamples) {
    const candidateEvaluation = evaluateHealthCandidates(replaySamples);
    const formulaComparison = evaluateReplayFormulaComparison(replaySamples);

    return {
        ...base,
        formulaComparison: {
            ...base.formulaComparison,
            replaySamples: formulaComparison
        },
        candidateFields: {
            ...replaySamples.candidateFields,
            evaluation: candidateEvaluation
        },
        selectedSamples: compactHealthSamples(replaySamples.samples),
        recommendedSources: {
            currentHealth: {
                field: 'Pawn.m_iHealth',
                confidence: 'high',
                rationale: 'Matches the value used in timeline and is spatially tied to the resolved Hero Pawn.'
            },
            maxHealth: {
                field: candidateEvaluation.bestMaxHealthField ?? 'Pawn.m_iMaxHealth',
                confidence: candidateEvaluation.bestMaxHealthField === 'Controller.m_iHealthMax' ? 'medium' : 'low',
                rationale: candidateEvaluation.bestMaxHealthField === 'Controller.m_iHealthMax'
                    ? 'Controller m_iHealthMax explains more sampled health > maxHealth records than Pawn m_iMaxHealth.'
                    : 'No sampled candidate fully explained the effective maximum health; preserve raw max fields until a better field is validated.'
            },
            healthPercent: {
                formula: candidateEvaluation.bestMaxHealthField === null
                    ? 'Pawn.m_iHealth / raw selected max health, flagged when > 1'
                    : `Pawn.m_iHealth / ${candidateEvaluation.bestMaxHealthField}`,
                clamp: false,
                confidence: candidateEvaluation.bestMaxHealthField === null ? 'low' : 'medium'
            }
        }
    };
}

function evaluateHealthCandidates(replaySamples) {
    const candidates = new Map();

    for (const sample of replaySamples.samples) {
        for (const player of sample.players) {
            const pawnHealth = player.pawn?.m_iHealth ?? null;

            if (typeof pawnHealth !== 'number') {
                continue;
            }

            observeCandidate(candidates, 'Pawn.m_iMaxHealth', pawnHealth, player.pawn?.m_iMaxHealth);
            observeCandidate(candidates, 'Controller.m_iHealthMax', pawnHealth, player.controller?.m_iHealthMax);

            for (const [ field, value ] of Object.entries(player.pawn ?? {})) {
                if (typeof value === 'number' && field !== 'm_iHealth') {
                    observeCandidate(candidates, `Pawn.${field}`, pawnHealth, value);
                }
            }

            for (const [ field, value ] of Object.entries(player.controller ?? {})) {
                if (typeof value === 'number' && field !== 'm_iHealth') {
                    observeCandidate(candidates, `Controller.${field}`, pawnHealth, value);
                }
            }
        }
    }

    const evaluated = Array.from(candidates.values())
        .map(candidate => ({
            ...candidate,
            plausibleMaxHealthDenominator: getIsPlausibleMaxHealthField(candidate),
            explainRate: candidate.total === 0 ? 0 : candidate.explainsHealthOverMax / candidate.total
        }))
        .sort((a, b) => b.explainRate - a.explainRate || b.explainsHealthOverMax - a.explainsHealthOverMax);
    const best = evaluated.find(candidate => candidate.plausibleMaxHealthDenominator && candidate.explainsHealthOverMax > 0) ?? null;

    return {
        candidates: evaluated.slice(0, 50),
        bestMaxHealthField: best?.field ?? null
    };
}

function getIsPlausibleMaxHealthField(candidate) {
    if (/modifier|source.*id/iu.test(candidate.field)) {
        return false;
    }

    if (!/(health|maxhealth|shield|barrier|armor)/iu.test(candidate.field)) {
        return false;
    }

    return candidate.maxObservedValue !== null && candidate.maxObservedValue > 0 && candidate.maxObservedValue < 100000;
}

function evaluateReplayFormulaComparison(replaySamples) {
    const formulas = {
        pawnHealthOverPawnMax: { total: 0, overOne: 0, max: null },
        pawnHealthOverControllerMax: { total: 0, overOne: 0, max: null },
        controllerHealthOverControllerMax: { total: 0, overOne: 0, max: null }
    };

    for (const sample of replaySamples.samples) {
        for (const player of sample.players) {
            observeRatio(formulas.pawnHealthOverPawnMax, player.formulas.pawnHealthOverPawnMax);
            observeRatio(formulas.pawnHealthOverControllerMax, player.formulas.pawnHealthOverControllerMax);
            observeRatio(formulas.controllerHealthOverControllerMax, player.formulas.controllerHealthOverControllerMax);
        }
    }

    return formulas;
}

function observeCandidate(candidates, field, health, value) {
    if (typeof value !== 'number') {
        return;
    }

    if (!candidates.has(field)) {
        candidates.set(field, {
            field,
            total: 0,
            explainsHealthOverMax: 0,
            exactMatchesHealth: 0,
            maxObservedValue: null,
            minObservedValue: null
        });
    }

    const candidate = candidates.get(field);

    candidate.total++;

    if (value >= health) {
        candidate.explainsHealthOverMax++;
    }

    if (value === health) {
        candidate.exactMatchesHealth++;
    }

    candidate.maxObservedValue = candidate.maxObservedValue === null ? value : Math.max(candidate.maxObservedValue, value);
    candidate.minObservedValue = candidate.minObservedValue === null ? value : Math.min(candidate.minObservedValue, value);
}

function compactHealthSamples(samples) {
    return samples.slice(0, 250).map(sample => ({
        gameSecond: sample.gameSecond,
        gameTime: sample.gameTime,
        demoTick: sample.demoTick,
        serverTick: sample.serverTick,
        players: sample.players
            .filter(player => {
                const ratio = player.formulas.pawnHealthOverPawnMax;

                return ratio === null || ratio > 1;
            })
            .slice(0, 12)
    }));
}

function enrichCumulativeAnalysis(base, replaySamples) {
    const sampleBySecond = new Map(replaySamples.samples.map(sample => [ sample.gameSecond, sample ]));
    const drops = base.drops.map(drop => {
        const previous = findReplayPlayer(sampleBySecond.get(drop.previousGameSecond), drop.playerIndex);
        const current = findReplayPlayer(sampleBySecond.get(drop.gameSecond), drop.playerIndex);
        const next = findReplayPlayer(sampleBySecond.get(drop.gameSecond + 1), drop.playerIndex);

        return {
            ...drop,
            directReplayInspection: {
                previous: compactReplayPlayer(previous, drop.field),
                current: compactReplayPlayer(current, drop.field),
                next: compactReplayPlayer(next, drop.field)
            }
        };
    });

    return {
        ...base,
        drops,
        byField: summarizeDrops(drops, 'field'),
        byPlayer: summarizeDrops(drops, 'playerIndex'),
        classifications: summarizeDrops(drops, 'classification'),
        treatmentRecommendation: {
            preserveRawValues: true,
            defaultHandling: 'Keep raw cumulative-like fields, but compute derived deltas with non-negative guards and flag decreases.',
            transientDrops: 'If a one-second drop returns to the previous value, classify as likely_transient_replication and exclude from derivative rates.',
            persistentDrops: 'If the reduced value persists, treat the field as not strictly cumulative or as a field reset until validated.'
        }
    };
}

function findReplayPlayer(sample, playerIndex) {
    return sample?.players.find(player => player.playerIndex === playerIndex) ?? null;
}

function compactReplayPlayer(player, field) {
    if (player === null) {
        return null;
    }

    return {
        controller: {
            m_iHealth: player.controller?.m_iHealth ?? null,
            m_iHealthMax: player.controller?.m_iHealthMax ?? null,
            m_bAlive: player.controller?.m_bAlive ?? null,
            m_iLevel: player.controller?.m_iLevel ?? null,
            m_iGoldNetWorth: player.controller?.m_iGoldNetWorth ?? null,
            inspectedField: player.controller?.[field] ?? null
        },
        pawn: {
            m_iHealth: player.pawn?.m_iHealth ?? null,
            m_iMaxHealth: player.pawn?.m_iMaxHealth ?? null,
            m_lifeState: player.pawn?.m_lifeState ?? null,
            m_flRespawnTime: player.pawn?.m_flRespawnTime ?? null
        }
    };
}

function buildRecommendations(healthAnalysis, cumulativeAnalysis, startedAtMs) {
    return {
        generatedAt: new Date().toISOString(),
        elapsedMs: Date.now() - startedAtMs,
        rules: [
            {
                name: 'current_health_source',
                recommendation: 'Use Pawn.m_iHealth when Pawn is resolved; fall back to Controller.m_iHealth only when Pawn is missing and flag healthSource.',
                confidence: 'high'
            },
            {
                name: 'max_health_source',
                recommendation: healthAnalysis.recommendedSources.maxHealth.field === 'Controller.m_iHealthMax'
                    ? 'Prefer Controller.m_iHealthMax for healthPercent candidate, but preserve Pawn.m_iMaxHealth as raw field.'
                    : 'Do not replace maxHealth yet; no sampled field fully explains effective max health.',
                confidence: healthAnalysis.recommendedSources.maxHealth.confidence
            },
            {
                name: 'health_percent_formula',
                recommendation: healthAnalysis.recommendedSources.healthPercent.formula,
                clamp: false,
                confidence: healthAnalysis.recommendedSources.healthPercent.confidence
            },
            {
                name: 'cumulative_stats',
                recommendation: 'Preserve raw cumulative-like stats. For derived per-second rates, treat decreases according to classification and avoid negative deltas by default.',
                fieldsObservedDecreasing: Object.keys(cumulativeAnalysis.byField),
                confidence: 'medium'
            },
            {
                name: 'transient_drop_handling',
                recommendation: 'Exclude likely_transient_replication drops from derivative rates, keep them in quality reports as compact counts plus samples.',
                confidence: 'medium'
            },
            {
                name: 'invalid_data_marking',
                recommendation: 'Mark records invalid for a derived metric when required source fields are missing, player count is not 12, Pawn link is missing, or health denominator is zero/null.',
                confidence: 'high'
            },
            {
                name: 'raw_value_preservation',
                recommendation: 'Always preserve raw health, maxHealth, stats, handles, and source fields. Do not clamp raw values.',
                confidence: 'high'
            }
        ],
        compactQualityReportRule: {
            health_percent_out_of_range: {
                count: healthAnalysis.global.totalAnomalousSeconds,
                playersAffected: healthAnalysis.global.playersAffected,
                intervals: healthAnalysis.global.intervalCount,
                maxObserved: healthAnalysis.global.maxRatio,
                sampleRecords: 'Keep bounded samples from output/08-health-anomaly-analysis.json instead of listing every occurrence.'
            }
        }
    };
}

function hasHealthAnomaly(row) {
    return typeof row.health === 'number' && typeof row.maxHealth === 'number' && row.maxHealth > 0 && row.health > row.maxHealth;
}

function updatePlayerHealthSummary(summary, snapshot, row) {
    const ratio = row.health / row.maxHealth;

    summary.totalAnomalousSeconds++;
    summary.firstGameSecond = summary.firstGameSecond ?? snapshot.gameSecond;
    summary.lastGameSecond = snapshot.gameSecond;
    summary.maxHealthObserved = summary.maxHealthObserved === null ? row.health : Math.max(summary.maxHealthObserved, row.health);
    summary.minMaxHealthObserved = summary.minMaxHealthObserved === null ? row.maxHealth : Math.min(summary.minMaxHealthObserved, row.maxHealth);
    summary.maxRatio = summary.maxRatio === null ? ratio : Math.max(summary.maxRatio, ratio);
}

function createFormulaStats() {
    return {
        pawnHealthOverPawnMax: { total: 0, overOne: 0, max: null },
        pawnHealthOverControllerMax: { total: 0, overOne: 0, max: null },
        controllerHealthOverControllerMax: { total: 0, overOne: 0, max: null }
    };
}

function observeFormulaStats(stats, row) {
    observeRatio(stats.pawnHealthOverPawnMax, safeRatio(row.health, row.maxHealth));
}

function finalizeFormulaStats(stats) {
    return stats;
}

function observeRatio(stats, ratio) {
    if (ratio === null) {
        return;
    }

    stats.total++;

    if (ratio > 1) {
        stats.overOne++;
    }

    stats.max = stats.max === null ? ratio : Math.max(stats.max, ratio);
}

function safeRatio(numerator, denominator) {
    if (typeof numerator !== 'number' || typeof denominator !== 'number' || denominator === 0) {
        return null;
    }

    return numerator / denominator;
}

function summarizeDrops(drops, field) {
    const summaries = new Map();

    for (const drop of drops) {
        const key = String(drop[field]);

        if (!summaries.has(key)) {
            summaries.set(key, {
                key: drop[field],
                count: 0,
                totalDelta: 0,
                minDelta: null,
                maxAbsoluteDelta: 0,
                coincidesWithDeath: 0,
                coincidesWithRespawn: 0,
                coincidesWithPawnChange: 0,
                classifications: {}
            });
        }

        const summary = summaries.get(key);

        summary.count++;
        summary.totalDelta += drop.delta;
        summary.minDelta = summary.minDelta === null ? drop.delta : Math.min(summary.minDelta, drop.delta);
        summary.maxAbsoluteDelta = Math.max(summary.maxAbsoluteDelta, Math.abs(drop.delta));
        summary.coincidesWithDeath += drop.coincidesWithDeath ? 1 : 0;
        summary.coincidesWithRespawn += drop.coincidesWithRespawn ? 1 : 0;
        summary.coincidesWithPawnChange += drop.coincidesWithPawnChange ? 1 : 0;
        summary.classifications[drop.classification] = (summary.classifications[drop.classification] ?? 0) + 1;
    }

    return Object.fromEntries(Array.from(summaries.entries()).sort(([ a ], [ b ]) => a.localeCompare(b)));
}

function getRowKey(gameSecond, playerIndex) {
    return `${gameSecond}:${playerIndex}`;
}

function maxBy(values, score) {
    let best = null;
    let bestScore = -Infinity;

    for (const value of values) {
        const currentScore = score(value);

        if (currentScore > bestScore) {
            best = value;
            bestScore = currentScore;
        }
    }

    return best;
}

function getNumberField(entity, field) {
    const value = entity?.getField(field);

    return typeof value === 'number' ? value : null;
}

function normalizeValue(value) {
    if (typeof value === 'bigint') {
        return value.toString();
    }

    if (ArrayBuffer.isView(value)) {
        return Array.from(value);
    }

    return value ?? null;
}

async function writeJson(file, data) {
    await writeFile(file, `${JSON.stringify(data, null, 4)}\n`);
}

async function assertSizeUnderLimit(file) {
    const size = (await stat(file)).size;

    if (size > OUTPUT_SIZE_LIMIT) {
        throw new Error(`Output file exceeds 5 MiB: ${file} (${size} bytes)`);
    }
}
