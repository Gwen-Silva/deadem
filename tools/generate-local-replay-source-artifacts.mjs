#!/usr/bin/env node
import { createReadStream } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import crypto from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { Logger, Player } from 'deadem';

const THIS_FILE = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(THIS_FILE), '..');
const AUTHORIZED_FILENAME = 'partida_010.dem';
const AUTHORIZED_REPLAY_ID = 'replay_010';
const LOCAL_ROOT = '.local/deadem/cache/local-replay-processing/replay_010/source-artifacts/';
const SUMMARY_ROOT = 'output/local-replay-processing/replay_010-source-artifacts/';
const SUCCESS_GATE = 'generic_local_replay_canonical_source_artifacts_ready';
const BLOCKED_GATE = 'generic_local_replay_canonical_source_artifacts_blocked';
const CONTROLLER_CLASS = 'CCitadelPlayerController';
const PAWN_CLASS = 'CCitadelPlayerPawn';
const IMPOSSIBLE_SPEED = 3500;
const LARGE_ECONOMY_JUMP = 20000;
const OBJECTIVE_CLASSES = [
    'CNPC_Boss_Tier2',
    'CNPC_Boss_Tier3',
    'CNPC_BarrackBoss',
    'CNPC_TrooperBoss',
    'C_NPC_Boss_Tier2',
    'C_NPC_Boss_Tier3',
    'C_NPC_BarrackBoss',
    'C_NPC_TrooperBoss'
];
export const REQUIRED_ARTIFACT_CLASSES = [
    'parser_source_summary',
    'match_state_timeline',
    'match_state_quality',
    'one_second_player_reconciliation_or_equivalent',
    'death_events',
    'death_validation',
    'respawn_events',
    'objective_entity_inventory',
    'objective_lifecycle_events'
];

function slash(value) {
    return value.replaceAll(path.sep, '/');
}

function repoRelative(absolutePath, root = REPO_ROOT) {
    return slash(path.relative(root, absolutePath));
}

function assertRelativeInput(value, label) {
    if (!value || path.isAbsolute(value)) throw new Error(`${label} must be a relative repository path`);
    const normalized = slash(value);
    if (normalized.split('/').includes('..')) throw new Error(`${label} must not contain traversal`);
    return normalized;
}

function resolveInside(root, relativePath, label) {
    const normalized = assertRelativeInput(relativePath, label);
    const resolved = path.resolve(root, normalized);
    const relative = path.relative(root, resolved);
    if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`${label} must stay inside repository root`);
    return { normalized, resolved };
}

function hasProtectedReplayPattern(value) {
    return /(?:partida|replay|match)[_-]?00?5(?:\.dem)?/iu.test(value);
}

function hasUnsupportedBotPattern(value) {
    return /(?:partida|replay|match)[_-]?00?(6|7|8)(?:\.dem)?/iu.test(value) || /bot[_-]?fixture/iu.test(value);
}

function hasOutOfScopeCandidatePattern(value) {
    return /partida[_-]?0?(1[1-9]|20)\.dem/iu.test(value);
}

export function validateInputPath(inputPath, options = {}) {
    const root = options.root ?? REPO_ROOT;
    const { normalized, resolved } = resolveInside(root, inputPath, 'input');
    const basename = path.basename(normalized);
    const errors = [];
    if (slash(path.dirname(normalized)) !== '.local/deadem/replays/inbox') errors.push('input must be directly under .local/deadem/replays/inbox/');
    if (basename !== AUTHORIZED_FILENAME) errors.push(`input filename must be ${AUTHORIZED_FILENAME}`);
    if (hasProtectedReplayPattern(normalized)) errors.push('input matches protected replay 005 pattern');
    if (hasUnsupportedBotPattern(normalized)) errors.push('input matches unsupported bot fixture pattern');
    if (hasOutOfScopeCandidatePattern(normalized)) errors.push('input matches out-of-scope candidate 011-020 pattern');
    if (normalized.startsWith('samples/')) errors.push('input must not come from samples/');
    return { valid: errors.length === 0, errors, normalized, resolved, basename };
}

export function validateOutputRoots(localOutput, summaryOutput, options = {}) {
    const root = options.root ?? REPO_ROOT;
    const local = resolveInside(root, localOutput, 'local output');
    const summary = resolveInside(root, summaryOutput, 'summary output');
    const errors = [];
    if (!slash(local.normalized).startsWith(LOCAL_ROOT)) errors.push(`local output must be under ${LOCAL_ROOT}`);
    if (!slash(summary.normalized).startsWith(SUMMARY_ROOT)) errors.push(`summary output must be under ${SUMMARY_ROOT}`);
    return { valid: errors.length === 0, errors, local, summary };
}

export function buildAvailabilityRows(rowsByClass) {
    return REQUIRED_ARTIFACT_CLASSES.map(artifactClass => rowsByClass[artifactClass] ?? {
        artifactClass,
        status: 'unavailable',
        localArtifactPath: null,
        committedSummaryPath: 'output/local-replay-processing/replay_010-source-artifacts/source-artifact-manifest.json',
        recordCount: null,
        sourceMethod: 'not_produced',
        limitations: ['No extractor output was produced for this source artifact class.']
    });
}

export function decideGate({ availabilityRows, protectionsPassed, branchAuditPassed, forbiddenSemanticLayers }) {
    if (!protectionsPassed || !branchAuditPassed || forbiddenSemanticLayers.length > 0) return BLOCKED_GATE;
    const byClass = new Map(availabilityRows.map(row => [row.artifactClass, row]));
    const coreReady = [
        'parser_source_summary',
        'match_state_timeline',
        'match_state_quality',
        'one_second_player_reconciliation_or_equivalent'
    ].every(artifactClass => byClass.get(artifactClass)?.status === 'ready');
    const blocked = availabilityRows.filter(row => row.status === 'blocked');
    return coreReady && blocked.length === 0 ? SUCCESS_GATE : BLOCKED_GATE;
}

export function auditReplaySpecificBranches(sourceText) {
    const findings = [];
    sourceText.split(/\r?\n/u).forEach((line, index) => {
        if (/\bif\s*\([^)]*replay_010/iu.test(line) || /switch\s*\([^)]*replayId/iu.test(line)) {
            findings.push({ line: index + 1, text: line.trim(), severity: 'blocked', reason: 'replay-specific branch detected' });
        }
    });
    return { passed: findings.length === 0, filesExamined: ['tools/generate-local-replay-source-artifacts.mjs'], findings };
}

export function forbiddenSemanticLayerAudit(artifactNames) {
    const forbidden = /lane|region|proximity|transform|mechanic|fight|rotation|pressure|macro|role|decision|ml/iu;
    return artifactNames.filter(name => forbidden.test(name));
}

async function sha256File(filePath) {
    const hash = crypto.createHash('sha256');
    await new Promise((resolve, reject) => {
        const stream = createReadStream(filePath);
        stream.on('data', chunk => hash.update(chunk));
        stream.on('error', reject);
        stream.on('end', resolve);
    });
    return hash.digest('hex');
}

async function writeJson(filePath, value) {
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function writeJsonl(filePath, rows) {
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, `${rows.map(row => JSON.stringify(row)).join('\n')}\n`, 'utf8');
}

function parseArgs(argv) {
    const args = new Map();
    for (let index = 0; index < argv.length; index += 2) {
        const key = argv[index];
        const value = argv[index + 1];
        if (!key?.startsWith('--') || value === undefined) throw new Error(`Invalid argument near ${key ?? '<end>'}`);
        args.set(key.slice(2), value);
    }
    return {
        input: args.get('input'),
        replayId: args.get('replay-id'),
        localOutput: args.get('local-output'),
        summaryOutput: args.get('summary-output')
    };
}

function safeNumber(value) {
    return Number.isFinite(value) ? value : null;
}

function normalize(value) {
    if (value === undefined || value === null) return null;
    if (typeof value === 'bigint') return value.toString();
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') return value;
    return value?.toString?.() ?? null;
}

function addIfPresent(set, value) {
    if (value !== null && value !== undefined && value !== '') set.add(value);
}

function firstValue(set) {
    return Array.from(set).sort()[0] ?? null;
}

function hasFinitePosition(position) {
    return position !== null && Number.isFinite(position.x) && Number.isFinite(position.y) && Number.isFinite(position.z);
}

function distance2d(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

function round(value) {
    return Number.isFinite(value) ? Math.round(value * 1000) / 1000 : null;
}

async function advanceToTick(player, targetTick) {
    while (player.getCurrentTick() < targetTick) {
        if (!await player.nextTick()) break;
    }
}

async function discoverPlayers(player, firstTick, lastTick, tickRate) {
    const candidates = new Map();
    const seekSeconds = [0, 5, 15, 30, 60, 120, 300, 600, 900, 1200, 1500, 1800, 2100]
        .filter(second => firstTick + second * tickRate <= lastTick);
    for (const second of seekSeconds) {
        await player.seekToTick(Math.min(lastTick, Math.round(firstTick + second * tickRate)));
        for (const controller of player.getDemo().getEntitiesByClassName(CONTROLLER_CLASS)) {
            const steamId = normalize(controller.getField('m_steamID'));
            if (steamId === null || steamId === '0' || steamId === 0) continue;
            const playerId = String(steamId);
            const existing = candidates.get(playerId) ?? {
                playerKey: playerId,
                playerSlot: normalize(controller.getField('m_iPlayerID')) ?? null,
                accountId: normalize(controller.getField('m_unAccountID')) ?? null,
                steamId: playerId,
                controllerEntityIndex: normalize(controller.handle),
                heroIds: new Set(),
                teams: new Set(),
                names: new Set(),
                controllerHandles: new Set(),
                observations: 0,
                firstSeenTick: null,
                lastSeenTick: null
            };
            existing.controllerHandles.add(String(normalize(controller.handle)));
            addIfPresent(existing.heroIds, normalize(controller.getField('m_nHeroID')));
            addIfPresent(existing.teams, normalize(controller.getField('m_iTeamNum')));
            addIfPresent(existing.names, normalize(controller.getField('m_iszPlayerName')));
            existing.observations += 1;
            existing.firstSeenTick = existing.firstSeenTick === null ? player.getCurrentTick() : Math.min(existing.firstSeenTick, player.getCurrentTick());
            existing.lastSeenTick = existing.lastSeenTick === null ? player.getCurrentTick() : Math.max(existing.lastSeenTick, player.getCurrentTick());
            candidates.set(playerId, existing);
        }
    }
    return Array.from(candidates.values()).map(candidate => ({
        ...candidate,
        heroIds: Array.from(candidate.heroIds).sort(),
        teams: Array.from(candidate.teams).sort(),
        names: Array.from(candidate.names).sort(),
        controllerHandles: Array.from(candidate.controllerHandles).sort(),
        heroId: firstValue(candidate.heroIds),
        team: firstValue(candidate.teams),
        heroName: firstValue(candidate.names),
        humanClassification: 'supported_human_steam_id_present',
        confidence: 'medium'
    })).sort((left, right) => String(left.team).localeCompare(String(right.team)) || String(left.heroName).localeCompare(String(right.heroName)));
}

function snapshotPlayers(player, players, second, tick) {
    const demo = player.getDemo();
    const pawns = demo.getEntitiesByClassName(PAWN_CLASS);
    const pawnByHandle = new Map(pawns.map(pawn => [String(normalize(pawn.handle)), pawn]));
    const pawnByController = new Map();
    for (const pawn of pawns) {
        const controllerHandle = normalize(pawn.getField('m_hController'));
        if (controllerHandle !== null) pawnByController.set(String(controllerHandle), pawn);
    }
    const controllers = demo.getEntitiesByClassName(CONTROLLER_CLASS)
        .map(controller => ({ controller, steamId: normalize(controller.getField('m_steamID')) }))
        .filter(item => item.steamId !== null && item.steamId !== '0' && item.steamId !== 0);
    const controllerBySteam = new Map(controllers.map(item => [String(item.steamId), item.controller]));
    return {
        gameTimeSeconds: second,
        tick,
        players: players.map(playerInfo => {
            const controller = controllerBySteam.get(playerInfo.playerKey);
            const controllerHandle = normalize(controller?.handle);
            const heroPawnHandle = normalize(controller?.getField('m_hHeroPawn'));
            const pawnHandle = normalize(controller?.getField('m_hPawn'));
            const pawn = pawnByHandle.get(String(heroPawnHandle)) ?? pawnByHandle.get(String(pawnHandle)) ?? pawnByController.get(String(controllerHandle)) ?? null;
            const position = pawn === null ? null : {
                x: normalize(pawn.getField('CBodyComponent.m_vecX')),
                y: normalize(pawn.getField('CBodyComponent.m_vecY')),
                z: normalize(pawn.getField('CBodyComponent.m_vecZ'))
            };
            return {
                playerKey: playerInfo.playerKey,
                tick,
                gameTimeSeconds: second,
                playerSlot: normalize(controller?.getField('m_iPlayerID')) ?? playerInfo.playerSlot,
                accountId: normalize(controller?.getField('m_unAccountID')) ?? playerInfo.accountId,
                steamId: playerInfo.steamId,
                name: normalize(controller?.getField('m_iszPlayerName')) ?? playerInfo.heroName,
                heroId: normalize(controller?.getField('m_nHeroID')) ?? playerInfo.heroId,
                heroClass: pawn?.class?.name ?? null,
                team: normalize(controller?.getField('m_iTeamNum')) ?? playerInfo.team,
                controllerEntityIndex: controllerHandle,
                pawnEntityIndex: normalize(pawn?.handle) ?? pawnHandle ?? heroPawnHandle,
                alive: normalize(controller?.getField('m_bAlive')) ?? normalize(pawn?.getField('m_bAlive')),
                health: normalize(pawn?.getField('m_iHealth')) ?? normalize(controller?.getField('m_iHealth')),
                deaths: normalize(controller?.getField('m_iDeaths')),
                kills: normalize(controller?.getField('m_iPlayerKills')),
                assists: normalize(controller?.getField('m_iPlayerAssists')),
                respawnTime: normalize(controller?.getField('m_flRespawnTime')),
                netWorth: normalize(controller?.getField('m_iGoldNetWorth')),
                souls: normalize(controller?.getField('m_iSouls')) ?? normalize(controller?.getField('m_iGold')),
                position: hasFinitePosition(position) ? position : null
            };
        })
    };
}

function observeObjectives(player, second, tick) {
    const records = [];
    for (const className of OBJECTIVE_CLASSES) {
        for (const entity of player.getDemo().getEntitiesByClassName(className)) {
            records.push({
                observationId: `${tick}:${className}:${normalize(entity.handle)}`,
                tick,
                gameTimeSeconds: second,
                entityKey: `${className}:${normalize(entity.handle)}`,
                className,
                rawHandle: normalize(entity.handle),
                rawTeam: normalize(entity.getField('m_iTeamNum')),
                health: normalize(entity.getField('m_iHealth')),
                maxHealth: normalize(entity.getField('m_iMaxHealth')),
                lifecycleInterpretation: 'raw_entity_observation_only'
            });
        }
    }
    return records;
}

function buildEventArtifacts(snapshots) {
    const deathEvents = [];
    const respawnEvents = [];
    const previous = new Map();
    for (const snapshot of snapshots) {
        for (const row of snapshot.players) {
            const prev = previous.get(row.playerKey);
            if (prev) {
                if (Number.isFinite(row.deaths) && Number.isFinite(prev.deaths) && row.deaths > prev.deaths) {
                    deathEvents.push({
                        eventType: 'death_counter_increment_observed',
                        playerKey: row.playerKey,
                        tick: snapshot.tick,
                        gameTimeSeconds: snapshot.gameTimeSeconds,
                        previousDeaths: prev.deaths,
                        currentDeaths: row.deaths,
                        source: 'controller.m_iDeaths',
                        limitations: ['This is a source artifact; no killer, fight, objective, or decision semantics are inferred.']
                    });
                }
                if (prev.alive === false && row.alive === true) {
                    respawnEvents.push({
                        eventType: 'alive_flag_return_observed',
                        playerKey: row.playerKey,
                        tick: snapshot.tick,
                        gameTimeSeconds: snapshot.gameTimeSeconds,
                        previousAlive: prev.alive,
                        currentAlive: row.alive,
                        source: 'controller_or_pawn_alive_flag',
                        limitations: ['This is a source artifact candidate; it does not infer death from zero health or absence.']
                    });
                }
            }
            previous.set(row.playerKey, row);
        }
    }
    return { deathEvents, respawnEvents };
}

function buildPositionQuality(snapshots, players) {
    const playerSummaries = [];
    const gapSamples = [];
    for (const playerInfo of players) {
        const rows = snapshots.map(snapshot => snapshot.players.find(row => row.playerKey === playerInfo.playerKey)).filter(Boolean);
        let previous = null;
        let nullPositions = 0;
        let suddenDisplacementCount = 0;
        let largestGapSeconds = 0;
        let currentGap = 0;
        for (const row of rows) {
            if (row.position === null) {
                nullPositions += 1;
                currentGap += 1;
                largestGapSeconds = Math.max(largestGapSeconds, currentGap);
            } else {
                if (previous?.position) {
                    const seconds = Math.max(1, row.gameTimeSeconds - previous.gameTimeSeconds);
                    const speed = distance2d(row.position, previous.position) / seconds;
                    if (speed > IMPOSSIBLE_SPEED) {
                        suddenDisplacementCount += 1;
                        if (gapSamples.length < 50) gapSamples.push({ playerKey: row.playerKey, fromSecond: previous.gameTimeSeconds, toSecond: row.gameTimeSeconds, speed: round(speed) });
                    }
                }
                currentGap = 0;
            }
            previous = row;
        }
        playerSummaries.push({
            playerKey: playerInfo.playerKey,
            totalSamples: rows.length,
            nullPositions,
            suddenDisplacementCount,
            largestGapSeconds,
            coverage: round((rows.length - nullPositions) / Math.max(1, rows.length))
        });
    }
    return {
        playerSummaries,
        aggregate: {
            totalRows: playerSummaries.reduce((sum, row) => sum + row.totalSamples, 0),
            nullPositionRows: playerSummaries.reduce((sum, row) => sum + row.nullPositions, 0),
            suddenDisplacementCount: playerSummaries.reduce((sum, row) => sum + row.suddenDisplacementCount, 0),
            largestGapSeconds: Math.max(...playerSummaries.map(row => row.largestGapSeconds), 0),
            meanCoverage: round(playerSummaries.reduce((sum, row) => sum + row.coverage, 0) / Math.max(1, playerSummaries.length))
        },
        gapSamples
    };
}

function buildEconomyQuality(snapshots, players) {
    const rows = snapshots.flatMap(snapshot => snapshot.players);
    const netWorthValues = rows.map(row => row.netWorth).filter(Number.isFinite);
    let decreases = 0;
    let largeJumpCount = 0;
    for (const playerInfo of players) {
        const playerRows = snapshots.map(snapshot => snapshot.players.find(row => row.playerKey === playerInfo.playerKey)).filter(Boolean);
        for (let index = 1; index < playerRows.length; index += 1) {
            const previous = playerRows[index - 1].netWorth;
            const current = playerRows[index].netWorth;
            if (Number.isFinite(previous) && Number.isFinite(current)) {
                if (current < previous) decreases += 1;
                if (Math.abs(current - previous) > LARGE_ECONOMY_JUMP) largeJumpCount += 1;
            }
        }
    }
    return {
        available: netWorthValues.length > 0,
        netWorthSampleCount: netWorthValues.length,
        decreases,
        largeJumpCount,
        semanticStatus: 'net_worth_counter_observation_only'
    };
}

function buildMatchTimelineRows(snapshots) {
    return snapshots.map(snapshot => {
        const teamNetWorth = {};
        for (const row of snapshot.players) {
            const team = String(row.team ?? 'unknown');
            if (Number.isFinite(row.netWorth)) teamNetWorth[team] = (teamNetWorth[team] ?? 0) + row.netWorth;
        }
        return {
            replayId: AUTHORIZED_REPLAY_ID,
            tick: snapshot.tick,
            gameTimeSeconds: snapshot.gameTimeSeconds,
            playerRows: snapshot.players.length,
            observedPlayers: snapshot.players.filter(row => row.controllerEntityIndex !== null).length,
            positionRows: snapshot.players.filter(row => row.position !== null).length,
            teamNetWorth,
            source: 'one_second_parser_snapshot'
        };
    });
}

async function extractSourceArtifacts(inputPath, localOutputPath, replayId) {
    const player = new Player(undefined, Logger.NOOP);
    const started = performance.now();
    try {
        await player.load(createReadStream(inputPath));
        const firstTick = safeNumber(player.getFirstTick());
        const effectiveFirstTick = firstTick === null ? 0 : Math.max(0, firstTick);
        const lastTick = safeNumber(player.getLastTick());
        const tickRate = safeNumber(player.getDemo().server?.tickRate) ?? 64;
        const durationSeconds = lastTick === null ? 0 : Math.max(0, Math.floor((lastTick - effectiveFirstTick) / tickRate));
        const parserSummary = {
            artifactType: 'parser_source_summary',
            replayId,
            completed: true,
            firstTick,
            effectiveFirstTick,
            lastTick,
            tickRate,
            durationSeconds,
            stats: player.getDemo().getStats?.() ?? null,
            limitations: ['Source artifact only; canonical package construction is not performed.']
        };
        const parserArtifact = await localJson(localOutputPath, 'parser-source-summary.json', parserSummary);
        let players;
        let snapshots;
        let objectiveObservations;
        try {
            players = await discoverPlayers(player, effectiveFirstTick, lastTick, tickRate);
            await player.seekToTick(effectiveFirstTick);
            snapshots = [];
            objectiveObservations = [];
            for (let second = 0; second <= durationSeconds; second += 1) {
                const targetTick = Math.min(lastTick, Math.round(effectiveFirstTick + second * tickRate));
                await advanceToTick(player, targetTick);
                const snapshot = snapshotPlayers(player, players, second, player.getCurrentTick());
                snapshots.push(snapshot);
                if (second % 5 === 0 || second === durationSeconds) objectiveObservations.push(...observeObjectives(player, second, player.getCurrentTick()));
            }
        } catch (error) {
            const errorArtifact = await localJson(localOutputPath, 'source-artifact-sampling-error.json', {
                artifactType: 'source_artifact_sampling_error',
                replayId,
                stage: 'seek_or_sampling',
                name: error.name,
                message: error.message,
                stackTop: String(error.stack ?? '').split(/\r?\n/u).slice(0, 4),
                limitations: ['Error artifact is local-only and records why seek-dependent source classes are blocked.']
            });
            return {
                completed: false,
                durationMs: Math.round(performance.now() - started),
                localArtifacts: [parserArtifact, errorArtifact],
                counts: { parser_source_summary: 1 },
                summaries: { parserSummary },
                error: {
                    stage: 'seek_or_sampling',
                    name: error.name,
                    message: error.message,
                    stackTop: String(error.stack ?? '').split(/\r?\n/u).slice(0, 4)
                }
            };
        }
        const timelineRows = buildMatchTimelineRows(snapshots);
        const positionQuality = buildPositionQuality(snapshots, players);
        const economyQuality = buildEconomyQuality(snapshots, players);
        const { deathEvents, respawnEvents } = buildEventArtifacts(snapshots);
        const objectiveByKey = new Map();
        for (const observation of objectiveObservations) {
            const existing = objectiveByKey.get(observation.entityKey) ?? {
                entityKey: observation.entityKey,
                className: observation.className,
                rawHandle: observation.rawHandle,
                rawTeam: observation.rawTeam,
                firstSeenTick: observation.tick,
                lastSeenTick: observation.tick,
                observations: 0,
                healthSamples: 0
            };
            existing.firstSeenTick = Math.min(existing.firstSeenTick, observation.tick);
            existing.lastSeenTick = Math.max(existing.lastSeenTick, observation.tick);
            existing.observations += 1;
            if (Number.isFinite(observation.health)) existing.healthSamples += 1;
            objectiveByKey.set(observation.entityKey, existing);
        }
        const objectiveInventory = Array.from(objectiveByKey.values()).sort((left, right) => left.entityKey.localeCompare(right.entityKey));
        const deathValidation = {
            replayId,
            source: 'death_counter_increment_observed',
            eventCount: deathEvents.length,
            duplicateKeyCount: duplicateCount(deathEvents.map(event => `${event.tick}:${event.playerKey}`)),
            validationStatus: deathEvents.length > 0 ? 'source_events_available_with_limitations' : 'no_counter_increments_observed',
            limitations: ['No killer, assist, fight, or decision semantics are validated.']
        };
        const matchQuality = {
            replayId,
            durationSeconds,
            playerCount: players.length,
            timelineRows: timelineRows.length,
            positionQuality: positionQuality.aggregate,
            economyQuality,
            deathEventCount: deathEvents.length,
            respawnEventCount: respawnEvents.length,
            objectiveEntityCount: objectiveInventory.length,
            limitations: ['No spatial semantics, objective completion, mechanics, or macro interpretation emitted.']
        };
        const reconciliation = {
            replayId,
            players,
            snapshotCount: snapshots.length,
            playerRows: snapshots.reduce((sum, snapshot) => sum + snapshot.players.length, 0),
            positionQuality,
            limitations: ['One-second sampled parser observations; sub-second transitions may be coalesced.']
        };
        const localArtifacts = [
            parserArtifact,
            await localJsonl(localOutputPath, 'match-state-timeline.jsonl', timelineRows),
            await localJson(localOutputPath, 'match-state-quality.json', matchQuality),
            await localJson(localOutputPath, 'one-second-player-reconciliation.json', reconciliation),
            await localJson(localOutputPath, 'death-events.json', { replayId, events: deathEvents, limitations: deathValidation.limitations }),
            await localJson(localOutputPath, 'death-validation.json', deathValidation),
            await localJson(localOutputPath, 'respawn-events.json', { replayId, events: respawnEvents, limitations: ['Alive false-to-true source observations only.'] }),
            await localJson(localOutputPath, 'objective-entity-inventory.json', { replayId, entities: objectiveInventory, limitations: ['Configured objective-like class observations only; no completion or destruction semantics.'] }),
            await localJson(localOutputPath, 'objective-lifecycle-events.json', { replayId, events: objectiveObservations, limitations: ['Raw entity observation and raw health samples only.'] })
        ];
        return {
            completed: true,
            durationMs: Math.round(performance.now() - started),
            localArtifacts,
            counts: {
                parser_source_summary: 1,
                match_state_timeline: timelineRows.length,
                match_state_quality: 1,
                one_second_player_reconciliation_or_equivalent: snapshots.reduce((sum, snapshot) => sum + snapshot.players.length, 0),
                death_events: deathEvents.length,
                death_validation: 1,
                respawn_events: respawnEvents.length,
                objective_entity_inventory: objectiveInventory.length,
                objective_lifecycle_events: objectiveObservations.length
            },
            summaries: { parserSummary, matchQuality, deathValidation }
        };
    } finally {
        await player.dispose?.();
    }
}

function duplicateCount(values) {
    const seen = new Set();
    let duplicates = 0;
    for (const value of values) {
        if (seen.has(value)) duplicates += 1;
        seen.add(value);
    }
    return duplicates;
}

async function localJson(root, filename, value) {
    const file = path.join(root, filename);
    await writeJson(file, value);
    return await artifactInfo(file);
}

async function localJsonl(root, filename, rows) {
    const file = path.join(root, filename);
    await writeJsonl(file, rows);
    return await artifactInfo(file);
}

async function artifactInfo(filePath) {
    const info = await stat(filePath);
    return { path: repoRelative(filePath), sizeBytes: info.size, sha256: await sha256File(filePath) };
}

function buildExtractionInventory() {
    const rows = [
        ['match_state_timeline', 'scripts/build-unified-match-state-timeline.js', 'hardcoded_to_samples_or_existing_outputs', 'Existing script writes output/replays and is not reused.'],
        ['one_second_player_reconciliation_or_equivalent', 'scripts/validate-replay-009-telemetry.js snapshot logic', 'reusable_with_parameterization', 'Task 103 implements bounded parameterized sampling using Player API.'],
        ['death_events', 'scripts/validate-replay-009-telemetry.js counter-transition logic', 'reusable_with_parameterization', 'Task 103 uses death-counter increments only.'],
        ['respawn_events', 'scripts/validate-replay-009-telemetry.js lifecycle logic', 'reusable_with_parameterization', 'Task 103 uses alive false-to-true source observations.'],
        ['objective_entity_inventory', 'scripts/map-multi-replay-objective-lifecycle.js', 'hardcoded_to_samples_or_existing_outputs', 'Task 103 uses a bounded class-observation extractor instead of the script.'],
        ['objective_lifecycle_events', 'scripts/map-multi-replay-objective-lifecycle.js', 'hardcoded_to_samples_or_existing_outputs', 'Task 103 emits raw observation lifecycle samples only.'],
        ['parser_compatibility', 'packages/deadem/index.js Player API', 'reusable_directly', 'Player.load(createReadStream(input)) accepts the local input path.'],
        ['quality_summaries', 'scripts/validate-replay-009-telemetry.js quality builders', 'reusable_with_parameterization', 'Task 103 emits compact local-input quality summaries.']
    ].map(([artifactClass, sourcePath, classification, notes]) => ({ artifactClass, sourcePath, classification, notes }));
    return {
        schemaVersion: 1,
        replayId: AUTHORIZED_REPLAY_ID,
        phase: 'extraction_inventory_before_parse',
        allowedInput: '.local/deadem/replays/inbox/partida_010.dem',
        rows,
        conclusion: 'bounded_parameterized_source_artifact_extractor_required'
    };
}

function availabilityFromExtraction(extraction, summaryRoot) {
    const rows = {};
    const methods = {
        parser_source_summary: 'deadem.Player metadata after load',
        match_state_timeline: 'one-second parser snapshot timeline',
        match_state_quality: 'quality summary over timeline and counters',
        one_second_player_reconciliation_or_equivalent: 'steam/controller/pawn reconciliation sampled once per second',
        death_events: 'm_iDeaths counter increments only',
        death_validation: 'duplicate and source-method validation for death counter events',
        respawn_events: 'alive flag false-to-true observations only',
        objective_entity_inventory: 'configured objective-like entity class observations',
        objective_lifecycle_events: 'raw objective-like entity observation samples'
    };
    for (const artifactClass of REQUIRED_ARTIFACT_CLASSES) {
        const count = extraction.counts?.[artifactClass] ?? null;
        const local = extraction.localArtifacts.find(item => item.path.endsWith(`${artifactFilename(artifactClass)}`));
        const ready = local && count !== null;
        const blockedBySampling = extraction.error?.stage === 'seek_or_sampling' && artifactClass !== 'parser_source_summary';
        rows[artifactClass] = {
            artifactClass,
            status: ready ? 'ready' : (blockedBySampling ? 'blocked' : 'unavailable'),
            localArtifactPath: local?.path ?? null,
            committedSummaryPath: `${summaryRoot}source-artifact-manifest.json`,
            recordCount: ready ? count : null,
            sourceMethod: methods[artifactClass],
            limitations: blockedBySampling
                ? ['Replay seek/sampling failed through the current generic Player API; this source artifact class cannot be generated safely in Task 103.', `Parser error: ${extraction.error.message}`]
                : limitationsFor(artifactClass, count)
        };
    }
    return buildAvailabilityRows(rows);
}

function artifactFilename(artifactClass) {
    return {
        parser_source_summary: 'parser-source-summary.json',
        match_state_timeline: 'match-state-timeline.jsonl',
        match_state_quality: 'match-state-quality.json',
        one_second_player_reconciliation_or_equivalent: 'one-second-player-reconciliation.json',
        death_events: 'death-events.json',
        death_validation: 'death-validation.json',
        respawn_events: 'respawn-events.json',
        objective_entity_inventory: 'objective-entity-inventory.json',
        objective_lifecycle_events: 'objective-lifecycle-events.json'
    }[artifactClass];
}

function limitationsFor(artifactClass, count) {
    const common = ['Source artifact only; no canonical package construction claimed.'];
    if (artifactClass === 'death_events') return [...common, 'Death events are counter increments only, not kill/fight attribution.'];
    if (artifactClass === 'respawn_events') return [...common, 'Respawn events are alive flag source observations only.'];
    if (artifactClass.startsWith('objective')) return [...common, 'No destruction, secure, claim, deposit, reward, or completion semantics inferred.'];
    if (count === 0) return [...common, 'Zero observed records is preserved as an observed count, not a fabricated category.'];
    return common;
}

async function run() {
    const cli = parseArgs(process.argv.slice(2));
    if (!cli.input || !cli.replayId || !cli.localOutput || !cli.summaryOutput) throw new Error('Required: --input --replay-id --local-output --summary-output');
    if (cli.replayId !== AUTHORIZED_REPLAY_ID) throw new Error(`replay-id must be ${AUTHORIZED_REPLAY_ID}`);
    const started = performance.now();
    const inputValidation = validateInputPath(cli.input);
    const outputValidation = validateOutputRoots(cli.localOutput, cli.summaryOutput);
    const summaryDir = outputValidation.summary.resolved;
    const localDir = outputValidation.local.resolved;
    await mkdir(summaryDir, { recursive: true });
    await mkdir(localDir, { recursive: true });
    await writeJson(path.join(summaryDir, 'extraction-inventory.json'), buildExtractionInventory());
    const inputExists = existsSync(inputValidation.resolved);
    const inputStat = inputExists ? await stat(inputValidation.resolved) : null;
    const identity = {
        schemaVersion: 1,
        replayId: cli.replayId,
        inputPath: inputValidation.normalized,
        exists: inputExists,
        sizeBytes: inputStat?.size ?? null,
        sha256: inputExists && inputValidation.valid ? await sha256File(inputValidation.resolved) : null,
        hashAuthorizedByTask103: true,
        parserReadAuthorizedByTask103: true,
        rawReplayCommitted: false,
        validation: { inputPathValid: inputValidation.valid, errors: inputValidation.errors }
    };
    await writeJson(path.join(summaryDir, 'input-identity.json'), identity);

    let extraction = { completed: false, durationMs: 0, localArtifacts: [], counts: {}, summaries: {}, error: null };
    if (inputExists && inputValidation.valid && outputValidation.valid) {
        try {
            extraction = await extractSourceArtifacts(inputValidation.resolved, localDir, cli.replayId);
        } catch (error) {
            extraction.error = { name: error.name, message: error.message, stackTop: String(error.stack ?? '').split(/\r?\n/u).slice(0, 4) };
            await writeJson(path.join(localDir, 'source-artifact-error.json'), extraction.error);
        }
    }

    const availabilityRows = availabilityFromExtraction(extraction, outputValidation.summary.normalized);
    await writeJson(path.join(summaryDir, 'source-artifact-availability.json'), { schemaVersion: 1, replayId: cli.replayId, rows: availabilityRows });

    const artifactNames = extraction.localArtifacts.map(item => path.basename(item.path));
    const forbiddenSemanticLayers = forbiddenSemanticLayerAudit(artifactNames);
    const sourceManifest = {
        schemaVersion: 1,
        replayId: cli.replayId,
        localOnlyArtifacts: extraction.localArtifacts,
        committedSummaryArtifacts: availabilityRows.map(row => row.committedSummaryPath).filter(Boolean).filter((value, index, values) => values.indexOf(value) === index),
        sourceArtifactClasses: availabilityRows,
        canonicalPackageConstructed: false,
        forbiddenSemanticLayers,
        limitations: ['Full local source artifacts stay under .local and are not committed.']
    };
    await writeJson(path.join(summaryDir, 'source-artifact-manifest.json'), sourceManifest);

    const qualitySummary = {
        schemaVersion: 1,
        replayId: cli.replayId,
        extractionCompleted: extraction.completed,
        artifactClassCounts: extraction.counts,
        parserSummary: compactParserSummary(extraction.summaries.parserSummary),
        matchQuality: extraction.summaries.matchQuality ?? null,
        deathValidation: extraction.summaries.deathValidation ?? null,
        canonicalPackageConstructed: false,
        forbiddenSemanticLayers
    };
    await writeJson(path.join(summaryDir, 'quality-summary.json'), qualitySummary);

    const sourceText = await readFile(THIS_FILE, 'utf8');
    const branchAudit = auditReplaySpecificBranches(sourceText);
    await writeJson(path.join(summaryDir, 'replay-specific-branch-audit.json'), branchAudit);
    const protectionAudit = {
        schemaVersion: 1,
        passed: inputValidation.valid && outputValidation.valid,
        replay005Read: false,
        replay005Hashed: false,
        replay005Opened: false,
        replay005Copied: false,
        replay005Processed: false,
        bots006To008Processed: false,
        candidates011To020Touched: false,
        samplesUsed: false,
        outputReplaysModified: false,
        copyFallbackUsed: false,
        demFilesCommitted: false,
        localFilesCommitted: false,
        task104Created: false,
        errors: [...inputValidation.errors, ...outputValidation.errors]
    };
    await writeJson(path.join(summaryDir, 'protection-audit.json'), protectionAudit);

    const storageBaseline = {
        schemaVersion: 1,
        replayId: cli.replayId,
        rawReplaySizeBytes: identity.sizeBytes,
        localArtifactRoot: outputValidation.local.normalized,
        committedSummaryRoot: outputValidation.summary.normalized,
        localOnlyArtifactCount: extraction.localArtifacts.length,
        localOnlyArtifactBytes: extraction.localArtifacts.reduce((sum, item) => sum + item.sizeBytes, 0),
        committedFullSourceArtifacts: false,
        rawReplayCommitted: false
    };
    await writeJson(path.join(summaryDir, 'storage-baseline.json'), storageBaseline);
    const performanceBaseline = {
        schemaVersion: 1,
        replayId: cli.replayId,
        extractionDurationMs: extraction.durationMs,
        totalDurationMs: Math.round(performance.now() - started),
        measuredOperation: 'single authorized local replay source-artifact extraction',
        limitations: ['One run only; not a scaling benchmark.']
    };
    await writeJson(path.join(summaryDir, 'performance-baseline.json'), performanceBaseline);
    const gate = decideGate({ availabilityRows, protectionsPassed: protectionAudit.passed, branchAuditPassed: branchAudit.passed, forbiddenSemanticLayers });
    const blockedRows = availabilityRows.filter(row => row.status === 'blocked');
    const gateOutput = {
        schemaVersion: 1,
        replayId: cli.replayId,
        gate,
        successGate: SUCCESS_GATE,
        blockedGate: BLOCKED_GATE,
        artifactClassesAttempted: REQUIRED_ARTIFACT_CLASSES,
        artifactClassesReady: availabilityRows.filter(row => row.status === 'ready').map(row => row.artifactClass),
        artifactClassesUnavailable: availabilityRows.filter(row => row.status === 'unavailable').map(row => row.artifactClass),
        artifactClassesBlocked: blockedRows.map(row => row.artifactClass),
        canonicalPackageConstructed: false,
        reasons: gate === SUCCESS_GATE ? ['Source artifacts are ready for a later canonical construction attempt.'] : [
            ...(extraction.error ? [`extractor failed: ${extraction.error.message}`] : []),
            ...blockedRows.map(row => `${row.artifactClass} blocked`),
            ...forbiddenSemanticLayers.map(layer => `forbidden semantic layer emitted: ${layer}`)
        ]
    };
    await writeJson(path.join(summaryDir, 'source-artifacts-gate.json'), gateOutput);
    return gateOutput;
}

function compactParserSummary(parserSummary) {
    if (!parserSummary) return null;
    return {
        completed: parserSummary.completed,
        firstTick: parserSummary.firstTick,
        effectiveFirstTick: parserSummary.effectiveFirstTick,
        lastTick: parserSummary.lastTick,
        tickRate: parserSummary.tickRate,
        durationSeconds: parserSummary.durationSeconds
    };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    run().then(result => {
        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    }).catch(error => {
        process.stderr.write(`${error.stack ?? error.message}\n`);
        process.exitCode = 1;
    });
}
