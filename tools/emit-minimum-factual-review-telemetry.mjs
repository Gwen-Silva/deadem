#!/usr/bin/env node
import { createReadStream } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Logger, Player } from 'deadem';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INTAKE_MANIFEST = 'output/local-replay-processing/two-match-assisted-review-intake/task198-bounded2/manifest.json';
const LOCAL_ROOT = '.local/deadem/review-telemetry';
const OUTPUT_ROOT = 'output/local-replay-processing/minimum-review-telemetry/task199-bounded2';
const TARGET_IDS = ['review_match_001', 'review_match_002'];
const FAMILIES = ['time', 'participants', 'teams', 'heroes', 'lifeState', 'netWorth', 'damage', 'healing', 'objectives', 'positions'];
const CONTROLLER_CLASS = 'CCitadelPlayerController';
const PAWN_CLASS = 'CCitadelPlayerPawn';
const OBJECTIVE_CLASSES = [
    'CNPC_Boss_Tier2', 'CNPC_Boss_Tier3', 'CNPC_BarrackBoss', 'CNPC_TrooperBoss',
    'CCitadel_Destroyable_Building', 'CCitadel_ArmorUpgrade_PersonalRejuvenator', 'CCitadel_ItemPickup'
];
const DAMAGE_FIELDS = ['m_iHeroDamage', 'm_iObjectiveDamage'];
const HEALING_FIELDS = ['m_iHeroHealing', 'm_iSelfHealing'];
const POSITIVE_GATE = 'two_match_review_telemetry_ready_with_declared_gaps';
const PARTIAL_GATE = 'two_match_review_telemetry_partial';
const TIMELINE_BLOCKER = 'BLOCKED_BY_REVIEW_REPLAY_SAFE_TIMELINE_UNAVAILABLE';
const INPUT_BLOCKER = 'BLOCKED_BY_REVIEW_REPLAY_INPUTS_NOT_ACCESSIBLE';

const slash = value => String(value).replaceAll('\\', '/');
const relative = value => slash(path.relative(ROOT, value));
const round = value => Number.isFinite(value) ? Math.round(value * 1000) / 1000 : null;

function normalized(value) {
    if (value === undefined || value === null) return null;
    if (typeof value === 'bigint') return value.toString();
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'object' && Number.isFinite(value.x) && Number.isFinite(value.y)) {
        return { x: round(value.x), y: round(value.y), z: round(value.z ?? 0) };
    }
    return null;
}

function field(entity, names) {
    for (const name of names) {
        const value = normalized(entity?.getField?.(name));
        if (value !== null) return { value, sourceField: name };
    }
    return { value: null, sourceField: null };
}

export function assertReviewTargetId(value) {
    if (/(?:replay|partida|match)[_-]?00?[5-8]/iu.test(value) || /replay[_-]?00?[5-8]/iu.test(value)) {
        throw new Error(`protected replay alias rejected before filesystem access: ${value}`);
    }
    if (!TARGET_IDS.includes(value)) throw new Error(`unsupported review target: ${value}`);
    return value;
}

export function validateMonotonicTimeline(rows) {
    const gaps = [];
    let monotonic = true;
    for (let index = 1; index < rows.length; index++) {
        if (rows[index].elapsedSeconds <= rows[index - 1].elapsedSeconds || rows[index].sourceTick < rows[index - 1].sourceTick) monotonic = false;
        const gap = rows[index].elapsedSeconds - rows[index - 1].elapsedSeconds;
        if (gap > 1) gaps.push({ from: rows[index - 1].elapsedSeconds, to: rows[index].elapsedSeconds, seconds: gap - 1 });
    }
    return { monotonic, gaps, firstTime: rows[0]?.elapsedSeconds ?? null, lastTime: rows.at(-1)?.elapsedSeconds ?? null };
}

export function positiveCounterDeltas(previous, current, context) {
    const rows = [];
    for (const sourceField of context.fields) {
        const before = previous?.[sourceField];
        const after = current?.[sourceField];
        if (!Number.isFinite(before) || !Number.isFinite(after) || after <= before) continue;
        rows.push({
            reviewTargetId: context.reviewTargetId,
            participantKey: context.participantKey,
            elapsedSeconds: context.elapsedSeconds,
            sourceTick: context.sourceTick,
            sourceField,
            previousValue: before,
            currentValue: after,
            delta: after - before,
            provenanceClass: 'derived_metric/replay_counter_delta',
            semanticClass: 'aggregate_counter_delta'
        });
    }
    return rows;
}

export function deterministicJson(value) {
    const sort = item => Array.isArray(item)
        ? item.map(sort)
        : item && typeof item === 'object'
            ? Object.fromEntries(Object.keys(item).sort().map(key => [key, sort(item[key])]))
            : item;
    return `${JSON.stringify(sort(value), null, 2)}\n`;
}

function availability(status, rows, source, time, semanticLimitations, coverage = null) {
    return { status, rows, coverage, source, firstTime: rows > 0 ? time.firstTime : null, lastTime: rows > 0 ? time.lastTime : null, gaps: time.gaps, semanticLimitations };
}

export function chooseGate(targets, protectedAccessCount = 0) {
    if (protectedAccessCount !== 0 || targets.some(target => target.processingStatus === 'input_unavailable')) return INPUT_BLOCKER;
    if (targets.some(target => target.availability.time.status !== 'available')) return TIMELINE_BLOCKER;
    const useful = targets.every(target => FAMILIES.filter(name => name !== 'time' && ['available', 'partial'].includes(target.availability[name].status) && target.availability[name].rows > 0).length >= 2);
    return useful ? POSITIVE_GATE : PARTIAL_GATE;
}

async function sha256File(filePath) {
    const hash = crypto.createHash('sha256');
    await new Promise((resolve, reject) => {
        const stream = createReadStream(filePath, { highWaterMark: 4 * 1024 * 1024 });
        stream.on('data', chunk => hash.update(chunk));
        stream.on('end', resolve);
        stream.on('error', reject);
    });
    return hash.digest('hex');
}

async function writeJson(filePath, value) {
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, deterministicJson(value), 'utf8');
}

async function writeJsonl(filePath, rows) {
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, rows.map(row => JSON.stringify(row)).join('\n') + (rows.length ? '\n' : ''), 'utf8');
}

async function artifactInfo(filePath) {
    const info = await stat(filePath);
    return { path: relative(filePath), sizeBytes: info.size, sha256: await sha256File(filePath) };
}

function controllerKey(controller) {
    return `controller:${normalized(controller?.handle) ?? 'unknown'}`;
}

export function snapshot(player, reviewTargetId, elapsedSeconds, sourceTick) {
    const demo = player.getDemo();
    const pawns = demo.getEntitiesByClassName(PAWN_CLASS);
    const byHandle = new Map(pawns.map(pawn => [String(normalized(pawn.handle)), pawn]));
    const rows = [];
    for (const controller of demo.getEntitiesByClassName(CONTROLLER_CLASS)) {
        const heroPawn = field(controller, ['m_hHeroPawn', 'm_hPawn']);
        const pawn = byHandle.get(String(heroPawn.value)) ?? pawns.find(item => String(field(item, ['m_hController']).value) === String(normalized(controller.handle))) ?? null;
        const lifeState = field(controller, ['m_lifeState', 'm_nLifeState']);
        const alive = field(controller, ['m_bAlive', 'm_bIsAlive']);
        const health = field(pawn, ['m_iHealth', 'm_nHealth', 'm_flHealth']);
        const deaths = field(controller, ['m_iDeaths']);
        const respawn = field(controller, ['m_flRespawnTime', 'm_iRespawnTime']);
        const netWorth = field(controller, ['m_iGoldNetWorth']);
        const position = field(pawn, ['m_vecAbsOrigin', 'CBodyComponent.m_vecX']);
        const counters = {};
        for (const name of [...DAMAGE_FIELDS, ...HEALING_FIELDS]) counters[name] = normalized(controller.getField?.(name));
        rows.push({
            reviewTargetId, participantKey: controllerKey(controller), elapsedSeconds, sourceTick,
            controllerRef: normalized(controller.handle), pawnRef: normalized(pawn?.handle) ?? heroPawn.value,
            teamRef: field(controller, ['m_iTeamNum']).value, heroRef: field(controller, ['m_nHeroID']).value,
            lifeState: lifeState.value, lifeStateSource: lifeState.sourceField,
            alive: alive.value, aliveSource: alive.sourceField, health: health.value, healthSource: health.sourceField,
            deaths: deaths.value, deathsSource: deaths.sourceField, respawnState: respawn.value, respawnSource: respawn.sourceField,
            netWorth: netWorth.value, netWorthSource: netWorth.sourceField,
            counters, position: position.value && typeof position.value === 'object' ? position.value : null,
            positionSource: position.value && typeof position.value === 'object' ? position.sourceField : null,
            provenanceClass: 'factual/replay_observed_state'
        });
    }
    return rows.sort((a, b) => a.participantKey.localeCompare(b.participantKey));
}

export function objectiveRows(player, reviewTargetId, elapsedSeconds, sourceTick) {
    return OBJECTIVE_CLASSES.flatMap(className => player.getDemo().getEntitiesByClassName(className).map(entity => ({
        reviewTargetId, elapsedSeconds, sourceTick, entityRef: `${className}:${normalized(entity.handle)}`,
        className, teamRef: field(entity, ['m_iTeamNum']).value,
        health: field(entity, ['m_iHealth', 'm_nHealth', 'm_flHealth']).value,
        maxHealth: field(entity, ['m_iMaxHealth', 'm_iHealthMax', 'm_flMaxHealth']).value,
        provenanceClass: 'factual/replay_observed_state', semanticClass: 'raw_structure_or_objective_like_entity_observation'
    }))).sort((a, b) => a.entityRef.localeCompare(b.entityRef));
}

export function derive(records, previousByParticipant) {
    const life = [], netWorth = [], damage = [], healing = [], positions = [];
    for (const row of records) {
        const previous = previousByParticipant.get(row.participantKey);
        if (row.lifeState !== null || row.alive !== null || row.health !== null || row.deaths !== null || row.respawnState !== null) {
            life.push({ reviewTargetId: row.reviewTargetId, participantKey: row.participantKey, elapsedSeconds: row.elapsedSeconds, sourceTick: row.sourceTick,
                lifeState: row.lifeState, alive: row.alive, health: row.health, deaths: row.deaths, respawnState: row.respawnState,
                provenanceClass: 'factual/replay_observed_state', semanticClass: 'replay_observed_state' });
        }
        if (Number.isFinite(row.netWorth)) netWorth.push({ reviewTargetId: row.reviewTargetId, participantKey: row.participantKey, elapsedSeconds: row.elapsedSeconds, sourceTick: row.sourceTick, value: row.netWorth, sourceField: row.netWorthSource, provenanceClass: 'factual/replay_observed_counter' });
        damage.push(...positiveCounterDeltas(previous?.counters, row.counters, { reviewTargetId: row.reviewTargetId, participantKey: row.participantKey, elapsedSeconds: row.elapsedSeconds, sourceTick: row.sourceTick, fields: DAMAGE_FIELDS }));
        healing.push(...positiveCounterDeltas(previous?.counters, row.counters, { reviewTargetId: row.reviewTargetId, participantKey: row.participantKey, elapsedSeconds: row.elapsedSeconds, sourceTick: row.sourceTick, fields: HEALING_FIELDS }));
        if (row.position) {
            const prior = previous?.position;
            const dt = previous ? row.elapsedSeconds - previous.elapsedSeconds : null;
            const distance = prior && dt > 0 ? Math.hypot(row.position.x - prior.x, row.position.y - prior.y) : null;
            positions.push({ reviewTargetId: row.reviewTargetId, participantKey: row.participantKey, elapsedSeconds: row.elapsedSeconds, sourceTick: row.sourceTick,
                coordinates: row.position, sourceField: row.positionSource, displacement2d: round(distance), approximateSpeed2d: dt > 0 ? round(distance / dt) : null,
                provenanceClass: 'factual/replay_observed_position_with_derived_metrics', semanticLimitations: ['No lane, region, map transform, Rift, Mid, base, or jungle semantics.'] });
        }
        previousByParticipant.set(row.participantKey, row);
    }
    return { life, netWorth, damage, healing, positions };
}

export async function processFactualTarget(target, { targetValidator = assertReviewTargetId, onSample = null } = {}) {
    // The default Task 199 allowlist and outputs remain unchanged. New wrappers
    // supply their own closed target validator; protected aliases always fail.
    if (/(?:replay|partida|match)[_-]?00?[5-8]/iu.test(String(target.reviewTargetId))) throw new Error('protected replay alias rejected before filesystem access');
    const reviewTargetId = targetValidator(target.reviewTargetId);
    const replay = target.inputs?.replay;
    const expectedSuffix = `/.local/deadem/review-targets/${reviewTargetId}/replay/${replay?.filenameOriginal}`;
    const normalizedPath = slash(replay?.localPath ?? '');
    if (!normalizedPath.toLowerCase().endsWith(expectedSuffix.toLowerCase())) throw new Error(`manifest replay path is outside the exclusive target slot: ${reviewTargetId}`);
    const inputPath = path.resolve(replay.localPath);
    const observedSha256 = await sha256File(inputPath);
    if (observedSha256 !== replay.sha256) throw new Error(`Task 198 replay hash mismatch: ${reviewTargetId}`);
    const localDir = path.join(ROOT, LOCAL_ROOT, reviewTargetId);
    await mkdir(localDir, { recursive: true });
    const player = new Player(undefined, Logger.NOOP);
    const timeline = [], observations = [], life = [], netWorth = [], damage = [], healing = [], objectives = [], positions = [];
    const participants = new Map();
    const previous = new Map();
    const warnings = [];
    let parser = null;
    try {
        await player.load(createReadStream(inputPath));
        const firstTick = Number.isFinite(player.getFirstTick()) ? player.getFirstTick() : 0;
        const effectiveFirstTick = Math.max(0, firstTick);
        const lastTick = Number.isFinite(player.getLastTick()) ? player.getLastTick() : null;
        const tickRate = Number.isFinite(player.getDemo().server?.tickRate) ? player.getDemo().server.tickRate : 64;
        const startTick = Math.max(effectiveFirstTick, Number.isFinite(player.getCurrentTick()) ? player.getCurrentTick() : effectiveFirstTick);
        parser = { parser: 'deadem.Player.forward_only', sourceFirstTick: firstTick, parserStartTick: startTick, parserEndTick: lastTick, tickRate };
        let nextSecond = 0;
        let nextTick = startTick;
        while (lastTick !== null && player.getCurrentTick() <= lastTick) {
            const currentTick = player.getCurrentTick();
            if (currentTick >= nextTick) {
                const rows = snapshot(player, reviewTargetId, nextSecond, currentTick);
                observations.push(...rows);
                for (const row of rows) {
                    const item = participants.get(row.participantKey) ?? { participantKey: row.participantKey, controllerRefs: new Set(), pawnRefs: new Set(), teamRefs: new Set(), heroRefs: new Set(), firstTime: nextSecond, lastTime: nextSecond };
                    if (row.controllerRef !== null) item.controllerRefs.add(row.controllerRef);
                    if (row.pawnRef !== null) item.pawnRefs.add(row.pawnRef);
                    if (row.teamRef !== null) item.teamRefs.add(row.teamRef);
                    if (row.heroRef !== null) item.heroRefs.add(row.heroRef);
                    item.lastTime = nextSecond;
                    participants.set(row.participantKey, item);
                }
                const derived = derive(rows, previous);
                life.push(...derived.life); netWorth.push(...derived.netWorth); damage.push(...derived.damage); healing.push(...derived.healing); positions.push(...derived.positions);
                if (nextSecond % 5 === 0) objectives.push(...objectiveRows(player, reviewTargetId, nextSecond, currentTick));
                timeline.push({ reviewTargetId, elapsedSeconds: nextSecond, sourceTick: currentTick, observedParticipants: rows.length, provenanceClass: 'factual/replay_elapsed_time' });
                if (onSample) await onSample({ player, reviewTargetId, elapsedSeconds: nextSecond, sourceTick: currentTick, rows });
                nextSecond++;
                nextTick = Math.round(startTick + nextSecond * tickRate);
            }
            if (!await player.nextTick()) break;
        }
    } finally {
        await player.dispose?.();
    }
    const time = validateMonotonicTimeline(timeline);
    const participantRows = Array.from(participants.values()).map(item => ({ ...item, controllerRefs: [...item.controllerRefs].sort(), pawnRefs: [...item.pawnRefs].sort(), teamRefs: [...item.teamRefs].sort(), heroRefs: [...item.heroRefs].sort(), provenanceClass: 'factual/replay_local_identity_reference' })).sort((a, b) => a.participantKey.localeCompare(b.participantKey));
    const teams = new Set(participantRows.flatMap(row => row.teamRefs));
    const heroes = new Set(participantRows.flatMap(row => row.heroRefs));
    const matrix = {
        time: availability(timeline.length && time.monotonic ? 'available' : 'unavailable', timeline.length, 'replay tick + parser tickRate normalized as replay elapsed seconds', time, ['Not asserted as displayed in-game clock.'], timeline.length ? round((time.lastTime - time.firstTime + 1 - time.gaps.reduce((sum, gap) => sum + gap.seconds, 0)) / Math.max(1, time.lastTime - time.firstTime + 1)) : null),
        participants: availability(participantRows.length ? 'available' : 'unavailable', participantRows.length, 'controller/pawn replay-local references', time, ['No synthetic reference is promoted to a real player name.']),
        teams: availability(teams.size ? 'available' : 'unavailable', teams.size, 'controller m_iTeamNum observations', time, ['Raw replay team references only.']),
        heroes: availability(heroes.size ? 'available' : 'unavailable', heroes.size, 'controller m_nHeroID observations', time, ['Hero IDs are not renamed without a validated mapping.']),
        lifeState: availability(life.length ? 'partial' : 'unavailable', life.length, 'explicit lifecycle-related controller/pawn fields', time, ['Observed state only; no killer, victim, assist, or confirmed death fact.']),
        netWorth: availability(netWorth.length ? 'available' : 'unavailable', netWorth.length, 'controller m_iGoldNetWorth observations', time, ['No strategic advantage interpretation.']),
        damage: availability(damage.length ? 'partial' : 'unavailable', damage.length, 'positive deltas of aggregate replay counters', time, ['No source-target attribution or fight semantics.']),
        healing: availability(healing.length ? 'partial' : 'unavailable', healing.length, 'positive deltas of aggregate replay counters', time, ['No source-target attribution or fight semantics.']),
        objectives: availability(objectives.length ? 'partial' : 'unavailable', objectives.length, 'raw configured structure/objective-like entity observations', time, ['No destruction, completion, contest, Rift fight, push, or setup semantics.']),
        positions: availability(positions.length ? 'partial' : 'unavailable', positions.length, 'raw pawn coordinates with mathematical displacement/speed', time, ['No lane, region, world-to-map transform, or named area semantics.'])
    };
    const files = {
        timeline: path.join(localDir, 'timeline.jsonl'), observations: path.join(localDir, 'participant-observations.jsonl'), participants: path.join(localDir, 'participants.json'),
        lifeState: path.join(localDir, 'life-state-observations.jsonl'), netWorth: path.join(localDir, 'net-worth-samples.jsonl'), damage: path.join(localDir, 'damage-deltas.jsonl'),
        healing: path.join(localDir, 'healing-deltas.jsonl'), objectives: path.join(localDir, 'objective-observations.jsonl'), positions: path.join(localDir, 'position-samples.jsonl')
    };
    await writeJsonl(files.timeline, timeline); await writeJsonl(files.observations, observations); await writeJson(files.participants, participantRows);
    await writeJsonl(files.lifeState, life); await writeJsonl(files.netWorth, netWorth); await writeJsonl(files.damage, damage); await writeJsonl(files.healing, healing); await writeJsonl(files.objectives, objectives); await writeJsonl(files.positions, positions);
    const artifacts = {};
    for (const [name, filePath] of Object.entries(files)) artifacts[name] = await artifactInfo(filePath);
    const counts = { time: timeline.length, participants: participantRows.length, teams: teams.size, heroes: heroes.size, lifeState: life.length, netWorth: netWorth.length, damage: damage.length, healing: healing.length, objectives: objectives.length, positions: positions.length };
    return { reviewTargetId, processingStatus: timeline.length && time.monotonic ? 'usable' : 'timeline_unavailable', input: { filename: replay.filenameOriginal, sizeBytes: replay.sizeBytes, expectedSha256: replay.sha256, observedSha256, identityValidated: true }, parser, normalizedTimeCoverage: time, counts, availability: matrix, warnings, unavailableFamilies: FAMILIES.filter(name => matrix[name].status === 'unavailable'), localArtifacts: artifacts };
}

export async function run() {
    const intake = JSON.parse(await readFile(path.join(ROOT, INTAKE_MANIFEST), 'utf8'));
    if (intake.targetCount !== 2 || intake.inputCount !== 4 || intake.protectedReplayAccessCount !== 0) throw new Error('Task 198 intake manifest is not the accepted bounded-two bridge');
    const targets = [];
    for (const id of TARGET_IDS) {
        const target = intake.targets.find(item => item.reviewTargetId === id);
        if (!target) throw new Error(`missing accepted review target: ${id}`);
        try { targets.push(await processFactualTarget(target)); }
        catch (error) { targets.push({ reviewTargetId: id, processingStatus: error.code === 'ENOENT' ? 'input_unavailable' : 'fatal_failure', error: { name: error.name, message: error.message }, availability: Object.fromEntries(FAMILIES.map(name => [name, availability('unavailable', 0, null, { firstTime: null, lastTime: null, gaps: [] }, [error.message])])), counts: Object.fromEntries(FAMILIES.map(name => [name, 0])), warnings: [error.message], unavailableFamilies: [...FAMILIES], localArtifacts: {} }); }
    }
    const gate = chooseGate(targets, 0);
    const outputDir = path.join(ROOT, OUTPUT_ROOT);
    const manifest = { schemaVersion: 1, artifactClass: 'minimum_factual_review_telemetry', generatedBy: 'tools/emit-minimum-factual-review-telemetry.mjs', generatedAtLogical: 'task_199', intakeManifest: INTAKE_MANIFEST, targets: targets.map(target => ({ reviewTargetId: target.reviewTargetId, processingStatus: target.processingStatus, input: target.input ?? null, parser: target.parser ?? null, localArtifacts: target.localArtifacts })) };
    const availabilityOutput = { schemaVersion: 1, families: FAMILIES, targets: targets.map(target => ({ reviewTargetId: target.reviewTargetId, availability: target.availability })) };
    const aggregateCounts = Object.fromEntries(FAMILIES.map(name => [name, targets.reduce((sum, target) => sum + (target.counts?.[name] ?? 0), 0)]));
    const summary = { schemaVersion: 1, targetsAttempted: 2, targetsUsable: targets.filter(target => target.processingStatus === 'usable').length, fatalFailures: targets.filter(target => !['usable'].includes(target.processingStatus)).length, counts: aggregateCounts, targets: targets.map(target => ({ reviewTargetId: target.reviewTargetId, processingStatus: target.processingStatus, normalizedTimeCoverage: target.normalizedTimeCoverage ?? null, counts: target.counts, parseWarnings: target.warnings, unavailableFamilies: target.unavailableFamilies })) };
    const provenance = { schemaVersion: 1, inputIdentityBridge: 'Task 198 manifest SHA-256 revalidated by streaming', factualClasses: ['replay_elapsed_time', 'replay_observed_state', 'replay_observed_counter', 'replay_local_identity_reference', 'replay_observed_position'], derivedClasses: ['replay_counter_delta', 'displacement2d', 'approximateSpeed2d'], humanContextUsedAsParserInput: false, protectedReplayAccessCount: 0, finalFactCount: 0, attributionCount: 0, gameplayInterpretationCount: 0, heavyBinariesVersioned: 0 };
    const gateOutput = { schemaVersion: 1, technicalGateStatus: gate, targetsAttempted: 2, targetsUsable: summary.targetsUsable, protectedReplayAccessCount: 0, finalFactCount: 0, attributionCount: 0, gameplayInterpretationCount: 0, acceptanceAuthority: 'ChatGPT Work', status: 'VALIDATING' };
    await writeJson(path.join(outputDir, 'manifest.json'), manifest); await writeJson(path.join(outputDir, 'availability.json'), availabilityOutput); await writeJson(path.join(outputDir, 'summary.json'), summary); await writeJson(path.join(outputDir, 'gate.json'), gateOutput); await writeJson(path.join(outputDir, 'provenance-audit.json'), provenance);
    return { gate, targets: summary.targetsUsable, counts: aggregateCounts };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    run().then(result => process.stdout.write(deterministicJson(result))).catch(error => { process.stderr.write(`${error.stack ?? error.message}\n`); process.exitCode = 1; });
}
