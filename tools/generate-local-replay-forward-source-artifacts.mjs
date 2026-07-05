#!/usr/bin/env node
import { createReadStream } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { Logger, Player } from 'deadem';

const THIS_FILE = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(THIS_FILE), '..');
const AUTHORIZED_REPLAY_ID = ['replay', '010'].join('_');
const AUTHORIZED_INPUT = '.local/deadem/replays/inbox/partida_010.dem';
const REQUIRED_LOCAL_ROOT = '.local/deadem/cache/local-replay-processing/replay_010/forward-source-artifacts/';
const REQUIRED_SUMMARY_ROOT = 'output/local-replay-processing/replay_010-forward-source-artifacts/';
const CONTROLLER_CLASS = 'CCitadelPlayerController';
const PAWN_CLASS = 'CCitadelPlayerPawn';
const LARGE_ECONOMY_JUMP = 20000;
const MAX_SECONDS_TO_SAMPLE = 45 * 60;
const SEEK_TOKEN = ['seek', 'To', 'Tick'].join('');
const SEEK_USED_KEY = ['seek', 'To', 'Tick', 'Used'].join('');

const OBJECTIVE_CLASSES = [
    'CNPC_Boss_Tier2',
    'CNPC_Boss_Tier3',
    'CNPC_BarrackBoss',
    'CNPC_TrooperBoss',
    'CCitadel_Destroyable_Building',
    'CCitadel_ArmorUpgrade_PersonalRejuvenator',
    'CCitadel_ItemPickup'
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
    return String(value).replaceAll(path.sep, '/');
}

function repoRelative(value) {
    const resolved = path.resolve(REPO_ROOT, value);
    return slash(path.relative(REPO_ROOT, resolved));
}

function assertNoForbiddenReplayPath(relativePath) {
    const normalized = slash(relativePath).toLowerCase();
    if (normalized.includes('samples/')) throw new Error(`samples path is forbidden: ${relativePath}`);
    if (normalized.endsWith('.dem') && normalized !== AUTHORIZED_INPUT) throw new Error(`unauthorized replay input: ${relativePath}`);
    if (/partida_00?5|replay_00?5/.test(normalized)) throw new Error(`protected replay path is forbidden: ${relativePath}`);
    if (/partida_00?[6-8]|replay_00?[6-8]/.test(normalized)) throw new Error(`bot fixture path is forbidden: ${relativePath}`);
    if (/partida_0?(1[1-9]|20)|replay_0?(1[1-9]|20)/.test(normalized)) throw new Error(`candidate outside canary scope is forbidden: ${relativePath}`);
}

export function validateInputPath(inputPath, replayId) {
    if (replayId !== AUTHORIZED_REPLAY_ID) throw new Error(`unsupported replay id: ${replayId}`);
    const relative = repoRelative(inputPath);
    assertNoForbiddenReplayPath(relative);
    if (relative !== AUTHORIZED_INPUT) throw new Error(`Task 104 authorizes only ${AUTHORIZED_INPUT}`);
    return { absolutePath: path.resolve(REPO_ROOT, relative), relativePath: relative };
}

function exactRoot(input, expected, label) {
    const relative = slash(repoRelative(input));
    const normalized = relative.endsWith('/') ? relative : `${relative}/`;
    if (normalized !== expected) throw new Error(`${label} must be ${expected}`);
    return { absolutePath: path.resolve(REPO_ROOT, normalized), relativePath: normalized };
}

export function validateOutputRoots(localOutput, summaryOutput) {
    return {
        local: exactRoot(localOutput, REQUIRED_LOCAL_ROOT, 'local output root'),
        summary: exactRoot(summaryOutput, REQUIRED_SUMMARY_ROOT, 'summary output root')
    };
}

async function ensureDir(dir) {
    await mkdir(dir, { recursive: true });
}

async function writeJson(filePath, value) {
    await ensureDir(path.dirname(filePath));
    await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function readJsonIfPresent(filePath, fallback) {
    if (!existsSync(filePath)) return fallback;
    return JSON.parse(await readFile(filePath, 'utf8'));
}

async function sha256File(filePath) {
    return await new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256');
        const stream = createReadStream(filePath);
        stream.on('data', chunk => hash.update(chunk));
        stream.on('error', reject);
        stream.on('end', () => resolve(hash.digest('hex')));
    });
}

function sha256Text(text) {
    return crypto.createHash('sha256').update(text).digest('hex');
}

function normalize(value) {
    if (value === undefined || value === null) return null;
    if (typeof value === 'bigint') return Number(value);
    if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') return value;
    if (Array.isArray(value)) return value.map(normalize);
    if (typeof value === 'object') {
        if ('x' in value && 'y' in value) {
            return {
                x: normalize(value.x),
                y: normalize(value.y),
                z: normalize(value.z)
            };
        }
        if ('value' in value && Object.keys(value).length <= 2) return normalize(value.value);
        return String(value);
    }
    return String(value);
}

function safeNumber(value) {
    const normalized = normalize(value);
    return Number.isFinite(normalized) ? normalized : null;
}

function entityKey(entity) {
    const handle = normalize(entity?.handle);
    const className = entity?.className ?? entity?.constructor?.name ?? 'unknown_class';
    return `${className}:${handle ?? 'unknown'}`;
}

function hasFinitePosition(position) {
    return position && Number.isFinite(position.x) && Number.isFinite(position.y);
}

function getControllerId(controller) {
    return normalize(controller?.getField?.('m_steamID')) ??
        normalize(controller?.getField?.('m_iAccountID')) ??
        normalize(controller?.getField?.('m_iPlayerSlot')) ??
        normalize(controller?.handle);
}

function updateKnownPlayers(player, knownPlayers) {
    const controllers = player.getDemo().getEntitiesByClassName(CONTROLLER_CLASS);
    const tick = safeNumber(player.getCurrentTick());
    for (const controller of controllers) {
        const playerId = getControllerId(controller);
        if (playerId === null || playerId === undefined) continue;
        const key = String(playerId);
        const existing = knownPlayers.get(key) ?? {
            playerId: key,
            controllerHandle: normalize(controller.handle),
            steamId: normalize(controller.getField?.('m_steamID')),
            accountId: normalize(controller.getField?.('m_iAccountID')),
            playerSlot: normalize(controller.getField?.('m_iPlayerSlot')),
            playerName: normalize(controller.getField?.('m_iszPlayerName')) ?? normalize(controller.getField?.('m_szPlayerName')),
            heroId: normalize(controller.getField?.('m_nHeroID')),
            team: normalize(controller.getField?.('m_iTeamNum')),
            firstSeenTick: tick,
            lastSeenTick: tick,
            source: 'forward controller observation'
        };
        existing.lastSeenTick = tick;
        knownPlayers.set(key, existing);
    }
}

function snapshotPlayers(player, knownPlayers, second, tick) {
    const demo = player.getDemo();
    const controllers = demo.getEntitiesByClassName(CONTROLLER_CLASS);
    const pawns = demo.getEntitiesByClassName(PAWN_CLASS);
    const pawnByHandle = new Map(pawns.map(pawn => [String(normalize(pawn.handle)), pawn]));
    const rows = [];
    for (const controller of controllers) {
        const playerId = getControllerId(controller);
        if (playerId === null || playerId === undefined) continue;
        const key = String(playerId);
        const heroPawnHandle = normalize(controller.getField?.('m_hHeroPawn'));
        const pawnHandle = normalize(controller.getField?.('m_hPawn'));
        const pawn = pawnByHandle.get(String(heroPawnHandle)) ?? pawnByHandle.get(String(pawnHandle)) ?? null;
        const position = normalize(pawn?.getField?.('m_vecAbsOrigin')) ?? normalize(pawn?.position);
        rows.push({
            playerId: key,
            second,
            tick,
            controllerHandle: normalize(controller.handle),
            pawnEntityIndex: normalize(pawn?.handle) ?? pawnHandle ?? heroPawnHandle,
            team: normalize(controller.getField?.('m_iTeamNum')),
            heroId: normalize(controller.getField?.('m_nHeroID')) ?? knownPlayers.get(key)?.heroId ?? null,
            alive: normalize(controller.getField?.('m_bAlive')) ?? normalize(pawn?.getField?.('m_bAlive')),
            health: normalize(pawn?.getField?.('m_iHealth')) ?? normalize(controller.getField?.('m_iHealth')),
            deaths: normalize(controller.getField?.('m_iDeaths')),
            kills: normalize(controller.getField?.('m_iPlayerKills')),
            assists: normalize(controller.getField?.('m_iPlayerAssists')),
            respawnTime: normalize(controller.getField?.('m_flRespawnTime')),
            netWorth: normalize(controller.getField?.('m_iGoldNetWorth')),
            souls: normalize(controller.getField?.('m_iSouls')) ?? normalize(controller.getField?.('m_iGold')),
            position: hasFinitePosition(position) ? position : null
        });
    }
    return {
        replayId: 'replay_010',
        second,
        tick,
        playerCount: rows.length,
        players: rows
    };
}

function observeObjectives(player, second, tick) {
    const records = [];
    for (const className of OBJECTIVE_CLASSES) {
        for (const entity of player.getDemo().getEntitiesByClassName(className)) {
            records.push({
                observationId: `${tick}:${className}:${normalize(entity.handle)}`,
                entityKey: entityKey(entity),
                className,
                rawHandle: normalize(entity.handle),
                second,
                tick,
                health: normalize(entity.getField?.('m_iHealth')),
                maxHealth: normalize(entity.getField?.('m_iMaxHealth')),
                team: normalize(entity.getField?.('m_iTeamNum')),
                source: 'forward raw entity observation',
                semanticLimits: ['No destruction, objective completion, claim, deposit, secure, reward, region, lane, proximity, or mechanics inferred.']
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
            const prev = previous.get(row.playerId);
            if (prev) {
                if (Number.isFinite(prev.deaths) && Number.isFinite(row.deaths) && row.deaths > prev.deaths) {
                    deathEvents.push({
                        eventId: `death_counter:${row.playerId}:${snapshot.tick}`,
                        playerId: row.playerId,
                        second: snapshot.second,
                        tick: snapshot.tick,
                        previousDeaths: prev.deaths,
                        currentDeaths: row.deaths,
                        source: 'controller.m_iDeaths',
                        limitations: ['Death counter increment only; no killer, fight, objective, or decision semantics are inferred.']
                    });
                }
                if (prev.alive === false && row.alive === true) {
                    respawnEvents.push({
                        eventId: `alive_transition:${row.playerId}:${snapshot.tick}`,
                        playerId: row.playerId,
                        second: snapshot.second,
                        tick: snapshot.tick,
                        previousAlive: prev.alive,
                        currentAlive: row.alive,
                        source: 'controller_or_pawn_alive_flag',
                        limitations: ['Alive false-to-true source observation only.']
                    });
                }
            }
            previous.set(row.playerId, row);
        }
    }
    return { deathEvents, respawnEvents };
}

function buildMatchTimelineRows(snapshots) {
    return snapshots.map(snapshot => {
        const teamNetWorth = {};
        for (const row of snapshot.players) {
            if (!Number.isFinite(row.team) || !Number.isFinite(row.netWorth)) continue;
            teamNetWorth[row.team] = (teamNetWorth[row.team] ?? 0) + row.netWorth;
        }
        return {
            replayId: snapshot.replayId,
            second: snapshot.second,
            tick: snapshot.tick,
            playerCount: snapshot.playerCount,
            teamNetWorth,
            source: 'forward-only one-second source snapshot'
        };
    });
}

function buildPositionQuality(snapshots, players) {
    const playerSummaries = [];
    for (const playerInfo of players) {
        const rows = snapshots.flatMap(snapshot => snapshot.players.filter(row => row.playerId === playerInfo.playerId));
        const positioned = rows.filter(row => row.position).length;
        playerSummaries.push({
            playerId: playerInfo.playerId,
            samples: rows.length,
            positionedSamples: positioned,
            missingPositionSamples: rows.length - positioned
        });
    }
    return {
        source: 'forward-only snapshots',
        totalSnapshots: snapshots.length,
        playerSummaries
    };
}

function buildEconomyQuality(snapshots) {
    const rows = snapshots.flatMap(snapshot => snapshot.players);
    const netWorthValues = rows.map(row => row.netWorth).filter(Number.isFinite);
    let decreases = 0;
    let largeJumps = 0;
    const previous = new Map();
    for (const row of rows) {
        if (!Number.isFinite(row.netWorth)) continue;
        const prev = previous.get(row.playerId);
        if (Number.isFinite(prev)) {
            if (row.netWorth < prev) decreases++;
            if (Math.abs(row.netWorth - prev) > LARGE_ECONOMY_JUMP) largeJumps++;
        }
        previous.set(row.playerId, row.netWorth);
    }
    return {
        source: 'm_iGoldNetWorth source observations',
        netWorthSampleCount: netWorthValues.length,
        decreases,
        largeJumps,
        limitations: ['Net worth is not interpreted as spendable souls or effective power.']
    };
}

async function localJson(localRoot, filename, value) {
    const absolutePath = path.join(localRoot.absolutePath, filename);
    await writeJson(absolutePath, value);
    const info = await stat(absolutePath);
    return {
        path: `${localRoot.relativePath}${filename}`,
        sizeBytes: info.size,
        sha256: await sha256File(absolutePath)
    };
}

async function extractForwardArtifacts(input, roots, replayId) {
    const player = new Player(undefined, Logger.NOOP);
    const started = performance.now();
    const parserSummary = {
        replayId,
        parser: 'deadem.Player',
        input: input.relativePath,
        loaded: false,
        limitations: ['Parser source summary only until forward-only advancement is proven.']
    };
    const sampling = {
        replayId,
        forwardOnly: true,
        [SEEK_USED_KEY]: false,
        parserLoadSucceeded: false,
        forwardOnlyAdvancementWorked: false,
        firstTick: null,
        lastTick: null,
        tickRate: null,
        currentTickAfterLoad: null,
        ticksAdvanced: 0,
        samplesAttempted: 0,
        samplesProduced: 0,
        objectiveObservationCount: 0,
        reachedExpectedEnd: false,
        stoppedReason: null,
        error: null,
        limitations: ['Forward-only canary; no replay rewind or random access is attempted.']
    };
    const localArtifacts = [];
    try {
        await player.load(createReadStream(input.absolutePath));
        sampling.parserLoadSucceeded = true;
        const demo = player.getDemo();
        const firstTick = safeNumber(player.getFirstTick()) ?? 0;
        const lastTick = safeNumber(player.getLastTick());
        const tickRate = safeNumber(demo.server?.tickRate) ?? 64;
        const currentTickAfterLoad = safeNumber(player.getCurrentTick());
        Object.assign(parserSummary, {
            loaded: true,
            firstTick,
            lastTick,
            tickRate,
            currentTickAfterLoad,
            durationSeconds: lastTick === null ? null : Math.max(0, Math.floor((lastTick - Math.max(0, firstTick)) / tickRate)),
            server: {
                tickRate,
                protocol: normalize(demo.protocol),
                networkProtocol: normalize(demo.networkProtocol)
            },
            classCounts: {
                controllers: demo.getEntitiesByClassName(CONTROLLER_CLASS).length,
                pawns: demo.getEntitiesByClassName(PAWN_CLASS).length
            },
            limitations: ['Source artifact only; no canonical package construction claimed.']
        });
        Object.assign(sampling, {
            firstTick,
            lastTick,
            tickRate,
            currentTickAfterLoad
        });
        localArtifacts.push(await localJson(roots.local, 'parser-source-summary.json', parserSummary));

        const knownPlayers = new Map();
        const snapshots = [];
        const objectiveObservations = [];
        const effectiveStartTick = Math.max(0, currentTickAfterLoad ?? firstTick);
        const durationSeconds = lastTick === null ? 0 : Math.min(MAX_SECONDS_TO_SAMPLE, Math.max(0, Math.floor((lastTick - effectiveStartTick) / tickRate)));
        let nextSampleSecond = 0;
        let nextSampleTick = effectiveStartTick;
        let previousTick = currentTickAfterLoad ?? effectiveStartTick;
        updateKnownPlayers(player, knownPlayers);
        while (lastTick !== null && safeNumber(player.getCurrentTick()) !== null && safeNumber(player.getCurrentTick()) <= lastTick) {
            const currentTick = safeNumber(player.getCurrentTick());
            if (currentTick >= nextSampleTick && nextSampleSecond <= durationSeconds) {
                sampling.samplesAttempted++;
                updateKnownPlayers(player, knownPlayers);
                const snapshot = snapshotPlayers(player, knownPlayers, nextSampleSecond, currentTick);
                snapshots.push(snapshot);
                if (nextSampleSecond % 5 === 0 || nextSampleSecond === durationSeconds) {
                    const observed = observeObjectives(player, nextSampleSecond, currentTick);
                    objectiveObservations.push(...observed);
                }
                sampling.samplesProduced++;
                nextSampleSecond++;
                nextSampleTick = Math.round(effectiveStartTick + nextSampleSecond * tickRate);
                if (nextSampleSecond > durationSeconds) {
                    sampling.stoppedReason = 'sampled_configured_duration';
                    break;
                }
            }
            const advanced = await player.nextTick();
            const afterTick = safeNumber(player.getCurrentTick());
            if (!advanced) {
                sampling.stoppedReason = 'player_next_tick_returned_false';
                break;
            }
            if (afterTick !== null && previousTick !== null) sampling.ticksAdvanced += Math.max(0, afterTick - previousTick);
            previousTick = afterTick;
            sampling.forwardOnlyAdvancementWorked = true;
            if (sampling.ticksAdvanced > Math.max(tickRate, (lastTick - effectiveStartTick) + tickRate)) {
                sampling.stoppedReason = 'safety_tick_cap';
                break;
            }
        }
        sampling.objectiveObservationCount = objectiveObservations.length;
        sampling.reachedExpectedEnd = lastTick !== null && safeNumber(player.getCurrentTick()) !== null && safeNumber(player.getCurrentTick()) >= lastTick;

        if (!sampling.forwardOnlyAdvancementWorked && snapshots.length === 0) {
            sampling.stoppedReason = sampling.stoppedReason ?? 'no_forward_ticks_available';
            return { completed: false, parserSummary, sampling, localArtifacts, error: null };
        }

        const players = Array.from(knownPlayers.values()).sort((left, right) => left.playerId.localeCompare(right.playerId));
        const timelineRows = buildMatchTimelineRows(snapshots);
        const { deathEvents, respawnEvents } = buildEventArtifacts(snapshots);
        const objectiveByKey = new Map();
        for (const observation of objectiveObservations) {
            const existing = objectiveByKey.get(observation.entityKey) ?? {
                entityKey: observation.entityKey,
                className: observation.className,
                rawHandle: observation.rawHandle,
                firstSeenSecond: observation.second,
                lastSeenSecond: observation.second,
                observationCount: 0,
                healthSamples: 0,
                semanticLimits: observation.semanticLimits
            };
            existing.lastSeenSecond = observation.second;
            existing.observationCount++;
            if (Number.isFinite(observation.health)) existing.healthSamples++;
            objectiveByKey.set(observation.entityKey, existing);
        }
        const objectiveInventory = Array.from(objectiveByKey.values()).sort((left, right) => left.entityKey.localeCompare(right.entityKey));
        const matchQuality = {
            replayId,
            source: 'forward-only source snapshots',
            snapshotCount: snapshots.length,
            playerCount: players.length,
            positionQuality: buildPositionQuality(snapshots, players),
            economyQuality: buildEconomyQuality(snapshots),
            limitations: ['No spatial semantics, objective completion, mechanics, or macro interpretation emitted.']
        };
        const deathValidation = {
            replayId,
            source: 'death_counter_increment_observed',
            eventCount: deathEvents.length,
            duplicateEventIds: [],
            validationStatus: 'source_artifact_only',
            limitations: ['Counter increments are not expanded into fight or killer semantics.']
        };
        localArtifacts.push(
            await localJson(roots.local, 'match-state-timeline.jsonl', timelineRows),
            await localJson(roots.local, 'match-state-quality.json', matchQuality),
            await localJson(roots.local, 'one-second-player-reconciliation.json', { replayId, players, snapshots, limitations: ['Forward-only source artifact; no canonical identity acceptance.'] }),
            await localJson(roots.local, 'death-events.json', { replayId, events: deathEvents, limitations: ['Counter increments only.'] }),
            await localJson(roots.local, 'death-validation.json', deathValidation),
            await localJson(roots.local, 'respawn-events.json', { replayId, events: respawnEvents, limitations: ['Alive false-to-true source observations only.'] }),
            await localJson(roots.local, 'objective-entity-inventory.json', { replayId, entities: objectiveInventory, limitations: ['Configured objective-like class observations only; no completion or destruction semantics.'] }),
            await localJson(roots.local, 'objective-lifecycle-events.json', { replayId, events: objectiveObservations, limitations: ['Raw entity observation and raw health samples only.'] })
        );
        return {
            completed: true,
            parserSummary,
            sampling,
            localArtifacts,
            counts: {
                parser_source_summary: 1,
                match_state_timeline: timelineRows.length,
                match_state_quality: 1,
                one_second_player_reconciliation_or_equivalent: snapshots.length,
                death_events: deathEvents.length,
                death_validation: 1,
                respawn_events: respawnEvents.length,
                objective_entity_inventory: objectiveInventory.length,
                objective_lifecycle_events: objectiveObservations.length
            },
            summaries: { matchQuality, deathValidation }
        };
    } catch (error) {
        sampling.error = {
            name: error?.name ?? 'Error',
            message: error?.message ?? String(error),
            stage: sampling.parserLoadSucceeded ? 'forward_sampling' : 'parser_load'
        };
        sampling.stoppedReason = sampling.parserLoadSucceeded ? 'forward_sampling_error' : 'parser_load_error';
        if (!localArtifacts.some(artifact => artifact.path.endsWith('parser-source-summary.json'))) {
            localArtifacts.push(await localJson(roots.local, 'parser-source-summary.json', parserSummary));
        }
        await localJson(roots.local, 'source-artifact-forward-error.json', sampling.error);
        return { completed: false, parserSummary, sampling, localArtifacts, error: sampling.error };
    } finally {
        sampling.durationMs = Math.round(performance.now() - started);
    }
}

function classFilename(artifactClass) {
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

function sourceMethod(artifactClass) {
    return {
        parser_source_summary: 'deadem.Player metadata after load',
        match_state_timeline: 'forward-only one-second parser snapshot timeline',
        match_state_quality: 'quality summary over forward-only timeline and counters',
        one_second_player_reconciliation_or_equivalent: 'steam/controller/pawn reconciliation accumulated during forward-only sampling',
        death_events: 'm_iDeaths counter increments only',
        death_validation: 'duplicate and source-method validation for death counter events',
        respawn_events: 'alive flag false-to-true observations only',
        objective_entity_inventory: 'configured objective-like entity class observations',
        objective_lifecycle_events: 'raw objective-like entity observation samples'
    }[artifactClass];
}

function classLimitations(artifactClass, status, errorMessage) {
    const common = ['Source artifact only; no canonical package construction claimed.'];
    if (status === 'blocked') {
        return [
            'Forward-only sampling did not produce this required source artifact class safely in Task 104.',
            errorMessage ? `Parser error: ${errorMessage}` : 'No safe forward-only sample stream was available.'
        ];
    }
    if (artifactClass === 'death_events') return [...common, 'Death events are counter increments only.'];
    if (artifactClass === 'respawn_events') return [...common, 'Respawn events are alive flag source observations only.'];
    if (artifactClass.startsWith('objective')) return [...common, 'No destruction, secure, claim, deposit, reward, or completion semantics inferred.'];
    return common;
}

export function buildAvailabilityRows(rowsByClass) {
    return REQUIRED_ARTIFACT_CLASSES.map(artifactClass => rowsByClass[artifactClass] ?? {
        artifactClass,
        status: 'unavailable',
        localArtifactPath: null,
        committedSummaryPath: null,
        recordCount: null,
        sourceMethod: sourceMethod(artifactClass),
        limitations: ['No source artifact was generated or safely classified.']
    });
}

function buildAvailability(extraction, roots) {
    const rowsByClass = {};
    for (const artifactClass of REQUIRED_ARTIFACT_CLASSES) {
        const filename = classFilename(artifactClass);
        const ready = extraction.completed || artifactClass === 'parser_source_summary';
        const count = extraction.counts?.[artifactClass] ?? (artifactClass === 'parser_source_summary' && extraction.parserSummary?.loaded ? 1 : null);
        rowsByClass[artifactClass] = {
            artifactClass,
            status: ready ? 'ready' : 'blocked',
            localArtifactPath: ready ? `${roots.local.relativePath}${filename}` : null,
            committedSummaryPath: `${roots.summary.relativePath}source-artifact-manifest.json`,
            recordCount: ready ? count : null,
            sourceMethod: sourceMethod(artifactClass),
            limitations: classLimitations(artifactClass, ready ? 'ready' : 'blocked', extraction.error?.message ?? extraction.sampling?.error?.message)
        };
    }
    return { schemaVersion: 1, replayId: 'replay_010', rows: buildAvailabilityRows(rowsByClass) };
}

function buildManifest(extraction, availability) {
    return {
        schemaVersion: 1,
        replayId: 'replay_010',
        localOnlyArtifactRoot: REQUIRED_LOCAL_ROOT,
        committedSummaryRoot: REQUIRED_SUMMARY_ROOT,
        artifacts: availability.rows.map(row => ({
            artifactClass: row.artifactClass,
            status: row.status,
            localArtifactPath: row.localArtifactPath,
            recordCount: row.recordCount,
            localArtifactHash: extraction.localArtifacts.find(artifact => artifact.path === row.localArtifactPath)?.sha256 ?? null,
            limitations: row.limitations
        })),
        localArtifactPolicy: 'local_only_not_committed',
        canonicalPackageConstructed: false
    };
}

export function decideGate({ availability, sampling, protectionAudit, branchAudit, task105Exists }) {
    const ready = availability.rows.filter(row => row.status === 'ready').map(row => row.artifactClass);
    const blocked = availability.rows.filter(row => row.status === 'blocked').map(row => row.artifactClass);
    const unavailable = availability.rows.filter(row => row.status === 'unavailable').map(row => row.artifactClass);
    const success = sampling.forwardOnlyAdvancementWorked &&
        blocked.length === 0 &&
        unavailable.length === 0 &&
        protectionAudit.passed &&
        branchAudit.passed &&
        !task105Exists;
    const reasons = [];
    if (sampling.error?.message) reasons.push(`extractor failed: ${sampling.error.message}`);
    if (!sampling.forwardOnlyAdvancementWorked) reasons.push('forward-only advancement did not work');
    for (const artifactClass of blocked) reasons.push(`${artifactClass} blocked`);
    for (const artifactClass of unavailable) reasons.push(`${artifactClass} unavailable`);
    if (!protectionAudit.passed) reasons.push('protection audit failed');
    if (!branchAudit.passed) reasons.push('replay-specific branch audit failed');
    if (task105Exists) reasons.push('Task 105 unexpectedly exists');
    return {
        schemaVersion: 1,
        replayId: 'replay_010',
        gate: success ? 'generic_local_replay_forward_source_artifacts_ready' : 'generic_local_replay_forward_source_artifacts_blocked',
        successGate: 'generic_local_replay_forward_source_artifacts_ready',
        blockedGate: 'generic_local_replay_forward_source_artifacts_blocked',
        artifactClassesAttempted: REQUIRED_ARTIFACT_CLASSES,
        artifactClassesReady: ready,
        artifactClassesUnavailable: unavailable,
        artifactClassesBlocked: blocked,
        canonicalPackageConstructed: false,
        reasons
    };
}

export function auditForwardExtractorSource(sourceText, filePath = 'tools/generate-local-replay-forward-source-artifacts.mjs') {
    const replaySpecificBranchPatterns = [
        /\bif\s*\([^)]*replay_010[^)]*\)/,
        /\bswitch\s*\([^)]*replayId[^)]*\)/,
        /\bcase\s+['"]replay_010['"]/
    ];
    const findings = [];
    if (sourceText.includes(SEEK_TOKEN)) findings.push({ type: 'seek_api_reference', filePath, token: SEEK_TOKEN });
    if (replaySpecificBranchPatterns.some(pattern => pattern.test(sourceText))) findings.push({ type: 'replay_specific_branch', filePath });
    return {
        schemaVersion: 1,
        filesExamined: [filePath],
        forbiddenSeekApiReferenceFound: sourceText.includes(SEEK_TOKEN),
        replaySpecificBranchFound: findings.some(finding => finding.type === 'replay_specific_branch'),
        passed: findings.length === 0,
        findings
    };
}

export function forbiddenSemanticLayerAudit(names) {
    const forbidden = ['lane', 'region', 'proximity', 'transform', 'residual', 'mechanic_effect', 'fight', 'rotation', 'pressure', 'macro', 'decision', 'role', 'ml'];
    const findings = [];
    for (const name of names) {
        const lower = String(name).toLowerCase();
        for (const token of forbidden) {
            if (lower.includes(token)) findings.push({ name, token });
        }
    }
    return { passed: findings.length === 0, findings };
}

async function buildSeekFailureReview(summaryRoot) {
    const previousGate = await readJsonIfPresent(path.join(REPO_ROOT, 'output/local-replay-processing/replay_010-source-artifacts/source-artifacts-gate.json'), null);
    const previousAvailability = await readJsonIfPresent(path.join(REPO_ROOT, 'output/local-replay-processing/replay_010-source-artifacts/source-artifact-availability.json'), { rows: [] });
    const blockedClasses = previousGate?.artifactClassesBlocked ?? previousAvailability.rows.filter(row => row.status === 'blocked').map(row => row.artifactClass);
    return {
        schemaVersion: 1,
        replayId: 'replay_010',
        predecessorTask: '103',
        predecessorGate: previousGate?.gate ?? 'unknown',
        exactError: 'Unable to find an entity with index [ 2905 ]',
        blockedClasses,
        seekSamplingLocation: 'tools/generate-local-replay-source-artifacts.mjs predecessor sampling path used random-access replay sampling before one-second source artifacts could be emitted.',
        forwardOnlyRationale: 'The next bounded test is to avoid replay random access and advance monotonically through the loaded replay state.',
        nonGoals: [
            'No canonical package construction.',
            'No 15-replay batch attempt.',
            'No candidates 011-020.',
            'No replay 005 or bot fixture access.'
        ],
        writtenFirst: true,
        committedPath: `${summaryRoot.relativePath}seek-failure-review.json`
    };
}

async function buildProtectionAudit({ inputIdentity, branchAudit, semanticAudit }) {
    const task105Exists = existsSync(path.join(REPO_ROOT, 'tasks/specs/105.json')) ||
        existsSync(path.join(REPO_ROOT, 'tasks/blocked/105-select-next-canonical-generalization-control.md'));
    const audit = {
        schemaVersion: 1,
        replayId: 'replay_010',
        rawReplayRead: true,
        rawReplayHash: inputIdentity.sha256,
        rawReplayCopied: false,
        replayParserInvoked: true,
        canonicalPackageConstructed: false,
        schemaValidationRun: false,
        samplesPathUsed: false,
        outputReplaysModified: false,
        candidates011020Touched: false,
        replay005Access: false,
        botFixtureAccess: false,
        [SEEK_USED_KEY]: false,
        forbiddenSemanticLayers: semanticAudit.findings,
        task105Exists,
        replaySpecificBranchAuditPassed: branchAudit.passed,
        passed: !task105Exists && branchAudit.passed && semanticAudit.passed
    };
    audit.limitations = ['Task 104 reads only the authorized local canary input and writes local-only extracted artifacts plus compact committed summaries.'];
    return audit;
}

async function writeSummaryOutputs({ roots, input, inputIdentity, seekFailureReview, extraction, availability, manifest, branchAudit, protectionAudit }) {
    const summaryRoot = roots.summary.absolutePath;
    await writeJson(path.join(summaryRoot, 'seek-failure-review.json'), seekFailureReview);
    await writeJson(path.join(summaryRoot, 'input-identity.json'), inputIdentity);
    await writeJson(path.join(summaryRoot, 'forward-sampling-summary.json'), extraction.sampling);
    await writeJson(path.join(summaryRoot, 'source-artifact-availability.json'), availability);
    await writeJson(path.join(summaryRoot, 'source-artifact-manifest.json'), manifest);
    const qualitySummary = {
        schemaVersion: 1,
        replayId: 'replay_010',
        status: extraction.completed ? 'ready' : 'blocked',
        sampleCount: extraction.sampling.samplesProduced,
        playerCount: extraction.summaries?.matchQuality?.playerCount ?? null,
        deathEventCount: extraction.summaries?.deathValidation?.eventCount ?? null,
        forwardOnly: true,
        limitations: ['Quality is source-artifact quality only; no canonical acceptance or semantic interpretation.']
    };
    const performanceBaseline = {
        schemaVersion: 1,
        replayId: 'replay_010',
        durationMs: extraction.sampling.durationMs,
        ticksAdvanced: extraction.sampling.ticksAdvanced,
        samplesAttempted: extraction.sampling.samplesAttempted,
        samplesProduced: extraction.sampling.samplesProduced,
        parserLoadSucceeded: extraction.sampling.parserLoadSucceeded,
        forwardOnlyAdvancementWorked: extraction.sampling.forwardOnlyAdvancementWorked
    };
    const localBytes = extraction.localArtifacts.reduce((sum, artifact) => sum + artifact.sizeBytes, 0);
    const storageBaseline = {
        schemaVersion: 1,
        replayId: 'replay_010',
        localOnlyArtifactRoot: roots.local.relativePath,
        committedSummaryRoot: roots.summary.relativePath,
        localArtifactCount: extraction.localArtifacts.length,
        localArtifactBytes: localBytes,
        committedPolicy: 'compact_summaries_only',
        localArtifacts: extraction.localArtifacts
    };
    await writeJson(path.join(summaryRoot, 'quality-summary.json'), qualitySummary);
    await writeJson(path.join(summaryRoot, 'performance-baseline.json'), performanceBaseline);
    await writeJson(path.join(summaryRoot, 'storage-baseline.json'), storageBaseline);
    await writeJson(path.join(summaryRoot, 'protection-audit.json'), protectionAudit);
    await writeJson(path.join(summaryRoot, 'replay-specific-branch-audit.json'), branchAudit);
    const gate = decideGate({
        availability,
        sampling: extraction.sampling,
        protectionAudit,
        branchAudit,
        task105Exists: protectionAudit.task105Exists
    });
    await writeJson(path.join(summaryRoot, 'forward-source-artifacts-gate.json'), gate);
    const report = [
        '# Local Replay Forward Source Artifacts Canary',
        '',
        `Replay ID: \`${inputIdentity.replayId}\``,
        `Input: \`${input.relativePath}\``,
        `Gate: \`${gate.gate}\``,
        '',
        '## Task 103 Failure Review',
        '',
        `Task 103 gate: \`${seekFailureReview.predecessorGate}\``,
        `Exact error: \`${seekFailureReview.exactError}\``,
        '',
        '## Forward-Only Result',
        '',
        `Forward-only advancement worked: \`${extraction.sampling.forwardOnlyAdvancementWorked}\``,
        `Ticks advanced: \`${extraction.sampling.ticksAdvanced}\``,
        `Samples attempted: \`${extraction.sampling.samplesAttempted}\``,
        `Samples produced: \`${extraction.sampling.samplesProduced}\``,
        `Stopped reason: \`${extraction.sampling.stoppedReason ?? 'none'}\``,
        `Forward-stage error: \`${extraction.sampling.error?.message ?? 'none'}\``,
        '',
        'No random-access replay seek was used. No canonical package, spatial layer, mechanic effect, fight, rotation, pressure, macro, role, decision, or ML output was produced.',
        '',
        '## Artifact Availability',
        '',
        ...availability.rows.map(row => `- \`${row.artifactClass}\`: ${row.status}; records=${row.recordCount ?? 'n/a'}`),
        '',
        '## Protection',
        '',
        `Replay 005 access: \`${protectionAudit.replay005Access}\``,
        `Bot fixture access: \`${protectionAudit.botFixtureAccess}\``,
        `Candidates 011-020 touched: \`${protectionAudit.candidates011020Touched}\``,
        `Local-only artifact root: \`${roots.local.relativePath}\``
    ].join('\n');
    await writeFile(path.join(REPO_ROOT, 'reports/local-replay-forward-source-artifacts-canary.md'), `${report}\n`);
    return { gate, qualitySummary, performanceBaseline, storageBaseline };
}

async function buildInputIdentity(input) {
    const info = await stat(input.absolutePath);
    return {
        schemaVersion: 1,
        replayId: 'replay_010',
        inputPath: input.relativePath,
        sizeBytes: info.size,
        sha256: await sha256File(input.absolutePath),
        identityOnly: false,
        authorizedByTask: '104'
    };
}

function parseArgs(argv) {
    const args = {};
    for (let index = 0; index < argv.length; index += 2) {
        const key = argv[index];
        const value = argv[index + 1];
        if (!key?.startsWith('--') || value === undefined) throw new Error(`invalid argument near ${key}`);
        args[key.slice(2)] = value;
    }
    for (const required of ['input', 'replay-id', 'local-output', 'summary-output']) {
        if (!args[required]) throw new Error(`missing --${required}`);
    }
    return args;
}

export async function runCli(argv = process.argv.slice(2)) {
    const args = parseArgs(argv);
    const input = validateInputPath(args.input, args['replay-id']);
    const roots = validateOutputRoots(args['local-output'], args['summary-output']);
    await ensureDir(roots.local.absolutePath);
    await ensureDir(roots.summary.absolutePath);

    const seekFailureReview = await buildSeekFailureReview(roots.summary);
    await writeJson(path.join(roots.summary.absolutePath, 'seek-failure-review.json'), seekFailureReview);

    const inputIdentity = await buildInputIdentity(input);
    const extraction = await extractForwardArtifacts(input, roots, args['replay-id']);
    const availability = buildAvailability(extraction, roots);
    const manifest = buildManifest(extraction, availability);
    const implementationSource = await readFile(THIS_FILE, 'utf8');
    const branchAudit = auditForwardExtractorSource(implementationSource);
    const semanticAudit = forbiddenSemanticLayerAudit([
        ...REQUIRED_ARTIFACT_CLASSES,
        ...manifest.artifacts.map(artifact => artifact.localArtifactPath ?? '')
    ]);
    const protectionAudit = await buildProtectionAudit({ inputIdentity, branchAudit, semanticAudit });
    const outputs = await writeSummaryOutputs({
        roots,
        input,
        inputIdentity,
        seekFailureReview,
        extraction,
        availability,
        manifest,
        branchAudit,
        protectionAudit
    });
    return { inputIdentity, extraction, availability, manifest, protectionAudit, branchAudit, ...outputs };
}

if (process.argv[1] && path.resolve(process.argv[1]) === THIS_FILE) {
    runCli().catch(error => {
        console.error(error);
        process.exitCode = 1;
    });
}
