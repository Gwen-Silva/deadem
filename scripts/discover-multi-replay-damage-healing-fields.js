import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

import { Logger, Player } from 'deadem';

const REPLAYS = [
    { replayId: 'replay_001', file: 'samples/partida_001.dem' },
    { replayId: 'replay_002', file: 'samples/partida_002.dem' },
    { replayId: 'replay_003', file: 'samples/partida_003.dem' },
    { replayId: 'replay_004', file: 'samples/partida_004.dem' }
];
const CONTROLLER_CLASS = 'CCitadelPlayerController';
const PAWN_CLASS = 'CCitadelPlayerPawn';
const CONTROLLER_FIELDS = [
    'm_iHeroDamage',
    'm_iObjectiveDamage',
    'm_iHeroHealing',
    'm_iSelfHealing',
    'm_iGuidedBotMatchDamageTaken',
    'm_iGuidedBotMatchDamageToPlayers',
    'm_iGuidedBotMatchDamageToGuardians',
    'm_iGoldNetWorth',
    'm_iAPNetWorth'
];
const PAWN_FIELDS = [
    'm_flCurrentHealingAmount',
    'm_flLastDamageTime',
    'm_iHealth',
    'm_iHealthMax',
    'm_iMaxHealth'
];
const OUTPUT_SIZE_LIMIT = 10 * 1024 * 1024;

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});

async function main() {
    const results = [];
    for (const replay of REPLAYS) results.push(await processReplay(replay));
    const comparison = buildComparison(results);
    const gate = buildGate(results, comparison);
    await writeJson('output/replays/multi-replay-damage-healing-comparison.json', comparison);
    await writeJson('output/replays/damage-healing-feasibility-gate.json', gate);
    await writeReport(results, comparison, gate);
    await validateOutputs([
        ...results.flatMap(result => [ result.auditFile, result.timelineFile, ...result.timelineShardFiles, result.deltaFile, result.validationFile ]),
        'output/replays/multi-replay-damage-healing-comparison.json',
        'output/replays/damage-healing-feasibility-gate.json',
        'reports/multi-replay-damage-healing-field-discovery.md'
    ]);
    console.log(`damage/healing gate: ${gate.gateResult}`);
    for (const result of results) {
        console.log(`${result.replayId}: ${result.timeline.rows.length} rows, ${result.deltaSummary.fieldsWithPositiveDeltas.length} changing fields`);
    }
}

async function processReplay(replay) {
    const player = new Player(undefined, Logger.NOOP);
    const outputDir = path.join('output', 'replays', replay.replayId);
    try {
        await player.load(createReadStream(replay.file));
        const firstTickRaw = player.getFirstTick();
        const effectiveFirstTick = firstTickRaw < 0 ? 0 : firstTickRaw;
        const lastTick = player.getLastTick();
        const tickRate = player.getDemo().server?.tickRate ?? 64;
        const durationSeconds = Math.floor((lastTick - effectiveFirstTick) / tickRate);
        const players = await discoverPlayers(player, effectiveFirstTick, lastTick, tickRate);
        await player.seekToTick(effectiveFirstTick);
        const rows = [];
        const previousByPlayer = new Map();
        for (let second = 0; second <= durationSeconds; second++) {
            const targetTick = Math.min(lastTick, Math.round(effectiveFirstTick + second * tickRate));
            await advanceToTick(player, targetTick);
            const currentTick = player.getCurrentTick();
            const currentRows = snapshotRows(player, players, replay.replayId, second, currentTick, previousByPlayer);
            rows.push(...currentRows);
            for (const row of currentRows) previousByPlayer.set(row.playerId, row);
        }
        const timeline = {
            schemaVersion: 1,
            kind: 'damage_healing_counter_timeline',
            replayId: replay.replayId,
            temporalResolutionSeconds: 1,
            fields: { controller: CONTROLLER_FIELDS, pawn: PAWN_FIELDS },
            rows
        };
        const audit = buildAudit(replay.replayId, rows);
        const deltaSummary = buildDeltaSummary(replay.replayId, rows);
        const validation = validateReplay(replay.replayId, players, rows, audit, deltaSummary);
        const auditFile = path.join(outputDir, 'damage-healing-field-audit.json');
        const timelineFile = path.join(outputDir, 'damage-healing-counter-timeline.json');
        const deltaFile = path.join(outputDir, 'damage-healing-delta-summary.json');
        const validationFile = path.join(outputDir, 'damage-healing-validation.json');
        const timelineShardFiles = await writeTimelineShards(outputDir, replay.replayId, players, rows, timelineFile);
        await writeJson(auditFile, audit);
        await writeJson(deltaFile, deltaSummary);
        await writeJson(validationFile, validation);
        return { replayId: replay.replayId, players, audit, timeline, deltaSummary, validation, auditFile, timelineFile, timelineShardFiles, deltaFile, validationFile };
    } finally {
        await player.dispose();
    }
}

async function writeTimelineShards(outputDir, replayId, players, rows, timelineFile) {
    const shardFiles = [];
    const rowsByPlayer = groupBy(rows, row => row.playerId);
    for (const player of players) {
        const file = path.join(outputDir, `damage-healing-counter-timeline-player_${player.playerId}.jsonl`);
        const playerRows = rowsByPlayer.get(player.playerId) ?? [];
        await writeJsonl(file, playerRows);
        shardFiles.push(file);
    }
    await writeJson(timelineFile, {
        schemaVersion: 1,
        kind: 'damage_healing_counter_timeline_manifest',
        replayId,
        temporalResolutionSeconds: 1,
        fields: { controller: CONTROLLER_FIELDS, pawn: PAWN_FIELDS },
        rowCount: rows.length,
        shards: shardFiles.map(file => ({
            file,
            playerId: path.basename(file).replace('damage-healing-counter-timeline-player_', '').replace('.jsonl', ''),
            rows: rowsByPlayer.get(path.basename(file).replace('damage-healing-counter-timeline-player_', '').replace('.jsonl', ''))?.length ?? 0
        })),
        storage: 'per-player JSONL shards to keep each file below 10 MiB'
    });
    return shardFiles;
}

async function discoverPlayers(player, firstTick, lastTick, tickRate) {
    const candidates = new Map();
    const seekSeconds = [ 0, 30, 60, 120, 300, 600, 900, 1200, 1500, 1800, 2100 ].filter(second => firstTick + second * tickRate <= lastTick);
    for (const second of seekSeconds) {
        await player.seekToTick(Math.min(lastTick, Math.round(firstTick + second * tickRate)));
        for (const controller of player.getDemo().getEntitiesByClassName(CONTROLLER_CLASS)) {
            const steamId = normalize(controller.getField('m_steamID'));
            if (steamId === null || steamId === '0' || steamId === 0) continue;
            const playerId = String(steamId);
            const existing = candidates.get(playerId) ?? {
                playerId,
                name: null,
                heroId: null,
                team: null,
                controllerHandle: null,
                observations: 0
            };
            existing.name ??= normalize(controller.getField('m_iszPlayerName'));
            existing.heroId ??= normalize(controller.getField('m_nHeroID'));
            existing.team ??= normalize(controller.getField('m_iTeamNum'));
            existing.controllerHandle ??= normalize(controller.handle);
            existing.observations += 1;
            candidates.set(playerId, existing);
        }
    }
    return Array.from(candidates.values())
        .sort((left, right) => String(left.team).localeCompare(String(right.team)) || String(left.name).localeCompare(String(right.name)) || left.playerId.localeCompare(right.playerId))
        .slice(0, 12);
}

async function advanceToTick(player, targetTick) {
    while (player.getCurrentTick() < targetTick) {
        const advanced = await player.nextTick();
        if (!advanced) break;
    }
}

function snapshotRows(player, players, replayId, second, tick, previousByPlayer) {
    const demo = player.getDemo();
    const pawns = demo.getEntitiesByClassName(PAWN_CLASS);
    const pawnByHandle = new Map(pawns.map(pawn => [ String(normalize(pawn.handle)), pawn ]));
    const pawnByController = new Map();
    for (const pawn of pawns) {
        const controllerHandle = normalize(pawn.getField('m_hController'));
        if (controllerHandle !== null) pawnByController.set(String(controllerHandle), pawn);
    }
    const controllers = demo.getEntitiesByClassName(CONTROLLER_CLASS)
        .map(controller => ({ controller, steamId: normalize(controller.getField('m_steamID')) }))
        .filter(item => item.steamId !== null && item.steamId !== '0' && item.steamId !== 0);
    const controllerBySteam = new Map(controllers.map(item => [ String(item.steamId), item.controller ]));
    return players.map(playerInfo => {
        const controller = controllerBySteam.get(playerInfo.playerId);
        const controllerHandle = normalize(controller?.handle);
        const heroPawnHandle = normalize(controller?.getField('m_hHeroPawn'));
        const pawnHandle = normalize(controller?.getField('m_hPawn'));
        const pawn = pawnByHandle.get(String(heroPawnHandle)) ?? pawnByHandle.get(String(pawnHandle)) ?? pawnByController.get(String(controllerHandle)) ?? null;
        const counters = Object.fromEntries(CONTROLLER_FIELDS.map(field => [ field, normalize(controller?.getField(field)) ]));
        const pawnFields = Object.fromEntries(PAWN_FIELDS.map(field => [ field, normalize(pawn?.getField(field)) ]));
        const previous = previousByPlayer.get(playerInfo.playerId) ?? null;
        return {
            replayId,
            playerId: playerInfo.playerId,
            name: playerInfo.name,
            heroId: normalize(controller?.getField('m_nHeroID')) ?? playerInfo.heroId,
            team: normalize(controller?.getField('m_iTeamNum')) ?? playerInfo.team,
            controllerId: controllerHandle,
            pawnId: normalize(pawn?.handle) ?? pawnHandle ?? heroPawnHandle,
            tick,
            gameTimeSeconds: second,
            counters,
            pawnFields,
            deltas: buildDeltas(counters, previous?.counters ?? {}),
            evidenceSources: {
                controller: controller === undefined ? 'missing_controller' : 'CCitadelPlayerController',
                pawn: pawn === null ? 'missing_pawn' : 'CCitadelPlayerPawn'
            },
            validationFlags: validationFlagsForRow(counters, pawnFields)
        };
    });
}

function buildDeltas(current, previous) {
    return Object.fromEntries(CONTROLLER_FIELDS.map(field => {
        const left = Number(previous[field]);
        const right = Number(current[field]);
        return [ field, Number.isFinite(left) && Number.isFinite(right) ? round(right - left) : null ];
    }));
}

function validationFlagsForRow(counters, pawnFields) {
    const flags = [];
    for (const [ field, value ] of Object.entries(counters)) if (value === null) flags.push(`missing_${field}`);
    if (pawnFields.m_iHealth === null && pawnFields.m_iHealthMax === null && pawnFields.m_iMaxHealth === null) flags.push('missing_pawn_health_fields');
    return flags;
}

function buildAudit(replayId, rows) {
    const fields = {};
    for (const field of [ ...CONTROLLER_FIELDS, ...PAWN_FIELDS ]) {
        const values = rows.map(row => field in row.counters ? row.counters[field] : row.pawnFields[field]);
        const nonNull = values.filter(value => value !== null && value !== undefined);
        const unique = Array.from(new Set(nonNull.map(value => JSON.stringify(value)))).map(value => JSON.parse(value));
        fields[field] = {
            entityClass: CONTROLLER_FIELDS.includes(field) ? CONTROLLER_CLASS : PAWN_CLASS,
            valueTypes: Array.from(new Set(nonNull.map(value => Array.isArray(value) ? 'array' : typeof value))).sort(),
            observedRows: nonNull.length,
            missingRows: values.length - nonNull.length,
            examples: unique.slice(0, 5),
            updateFrequency: 'sampled_once_per_canonical_second',
            playerLinkage: 'controller m_steamID with controller/pawn handle linkage',
            directOrDerived: 'direct_field',
            reliability: reliabilityForField(field),
            limitations: limitationsForField(field)
        };
    }
    return {
        schemaVersion: 1,
        kind: 'damage_healing_field_audit',
        replayId,
        fields,
        absentOrNotUsed: [
            {
                source: 'source_target_damage_events',
                status: 'not_exposed_by_current_task_path',
                limitation: 'Only cumulative and state fields were sampled; no victim-linked damage log is claimed.'
            },
            {
                source: 'fight_segments',
                status: 'intentionally_not_constructed',
                limitation: 'This task discovers counters only and does not define fights.'
            }
        ],
        replay005Protection: { processed: false, status: 'preserved' }
    };
}

function buildDeltaSummary(replayId, rows) {
    const byPlayer = groupBy(rows, row => row.playerId);
    const fields = {};
    for (const field of CONTROLLER_FIELDS) {
        const allDeltas = rows.map(row => row.deltas[field]).filter(value => value !== null);
        const positive = allDeltas.filter(value => value > 0);
        const negative = allDeltas.filter(value => value < 0);
        fields[field] = {
            totalPositiveDelta: round(positive.reduce((total, value) => total + value, 0)),
            positiveDeltaRows: positive.length,
            negativeDeltaRows: negative.length,
            zeroDeltaRows: allDeltas.filter(value => value === 0).length,
            maximumPositiveDelta: positive.length ? Math.max(...positive) : 0,
            minimumNegativeDelta: negative.length ? Math.min(...negative) : 0,
            playersWithPositiveDelta: Array.from(byPlayer.entries()).filter(([ , playerRows ]) => playerRows.some(row => Number(row.deltas[field]) > 0)).map(([ playerId ]) => playerId).length,
            resetLikeDeltasPreserved: negative.slice(0, 10),
            monotonicNonDecreasing: negative.length === 0
        };
    }
    const fieldsWithPositiveDeltas = Object.entries(fields).filter(([ , summary ]) => summary.positiveDeltaRows > 0).map(([ field ]) => field);
    return {
        schemaVersion: 1,
        kind: 'damage_healing_delta_summary',
        replayId,
        fields,
        fieldsWithPositiveDeltas,
        segmentFeasibility: {
            status: fieldsWithPositiveDeltas.some(field => /Damage|Healing/.test(field)) ? 'counter_delta_segments_feasible_with_limitations' : 'insufficient_counter_changes',
            allowedUse: 'temporal counter deltas by player and replay',
            prohibitedUses: [ 'fight grouping', 'combat quality judgment', 'source-target attribution without direct evidence' ]
        },
        replay005Protection: { processed: false, status: 'preserved' }
    };
}

function validateReplay(replayId, players, rows, audit, deltaSummary) {
    const errors = [];
    const warnings = [];
    const playersInRows = new Set(rows.map(row => row.playerId));
    if (playersInRows.size !== 12) errors.push({ type: 'player_reconciliation_failed', observedPlayers: playersInRows.size });
    for (const field of CONTROLLER_FIELDS) {
        if (audit.fields[field].observedRows === 0) warnings.push({ type: 'field_never_observed', field });
        if (deltaSummary.fields[field].negativeDeltaRows > 0) warnings.push({ type: 'negative_or_reset_like_delta', field, count: deltaSummary.fields[field].negativeDeltaRows });
    }
    const missingControllerRows = rows.filter(row => row.evidenceSources.controller === 'missing_controller').length;
    const missingPawnRows = rows.filter(row => row.evidenceSources.pawn === 'missing_pawn').length;
    if (missingControllerRows > 0) warnings.push({ type: 'missing_controller_rows', count: missingControllerRows });
    if (missingPawnRows > 0) warnings.push({ type: 'missing_pawn_rows', count: missingPawnRows });
    return {
        schemaVersion: 1,
        kind: 'damage_healing_validation',
        replayId,
        checks: {
            twelvePlayersReconciled: playersInRows.size === 12,
            rowsChronologicalByPlayer: chronologicalByPlayer(rows),
            controllerFieldCoverage: Object.fromEntries(CONTROLLER_FIELDS.map(field => [ field, percent(audit.fields[field].observedRows, rows.length) ])),
            pawnFieldCoverage: Object.fromEntries(PAWN_FIELDS.map(field => [ field, percent(audit.fields[field].observedRows, rows.length) ])),
            monotonicity: Object.fromEntries(CONTROLLER_FIELDS.map(field => [ field, deltaSummary.fields[field].monotonicNonDecreasing ])),
            replay005Protection: { processed: false, status: 'preserved' }
        },
        errors,
        warnings
    };
}

function buildComparison(results) {
    return {
        schemaVersion: 1,
        kind: 'multi_replay_damage_healing_comparison',
        replays: results.map(result => summarizeReplay(result)),
        fieldAvailability: Object.fromEntries(CONTROLLER_FIELDS.map(field => [ field, results.map(result => ({
            replayId: result.replayId,
            observedRows: result.audit.fields[field].observedRows,
            positiveDeltaRows: result.deltaSummary.fields[field].positiveDeltaRows,
            negativeDeltaRows: result.deltaSummary.fields[field].negativeDeltaRows
        })) ])),
        note: 'Counters are descriptive replay fields. Similarity across replays is not semantic validation of combat quality.',
        replay005Protection: { processed: false, status: 'preserved' }
    };
}

function summarizeReplay(result) {
    return {
        replayId: result.replayId,
        players: result.players.length,
        rows: result.timeline.rows.length,
        changingFields: result.deltaSummary.fieldsWithPositiveDeltas,
        heroDamageDelta: result.deltaSummary.fields.m_iHeroDamage.totalPositiveDelta,
        objectiveDamageDelta: result.deltaSummary.fields.m_iObjectiveDamage.totalPositiveDelta,
        heroHealingDelta: result.deltaSummary.fields.m_iHeroHealing.totalPositiveDelta,
        selfHealingDelta: result.deltaSummary.fields.m_iSelfHealing.totalPositiveDelta,
        damageTakenDelta: result.deltaSummary.fields.m_iGuidedBotMatchDamageTaken.totalPositiveDelta,
        validationErrors: result.validation.errors.length,
        validationWarnings: result.validation.warnings.length
    };
}

function buildGate(results, comparison) {
    const errors = results.reduce((total, result) => total + result.validation.errors.length, 0);
    const changingDamageFields = new Set(results.flatMap(result => result.deltaSummary.fieldsWithPositiveDeltas.filter(field => /Damage|Healing/.test(field))));
    let gateResult = 'damage_healing_sources_insufficient';
    if (errors === 0 && changingDamageFields.size >= 4) gateResult = 'damage_healing_fields_ready_with_limitations';
    if (errors === 0 && changingDamageFields.size >= 6 && results.every(result => result.validation.warnings.length === 0)) gateResult = 'damage_healing_fields_ready_for_segments';
    return {
        schemaVersion: 1,
        kind: 'damage_healing_feasibility_gate',
        gateResult,
        evidence: {
            processedReplays: comparison.replays.map(replay => replay.replayId),
            changingDamageHealingFields: Array.from(changingDamageFields).sort(),
            validationErrors: errors,
            limitationSummary: 'Cumulative counters are available, but source-target linked damage events were not exposed by this task path.'
        },
        allowedUse: 'descriptive per-player counter deltas and temporal segment feasibility checks',
        prohibitedUses: [ 'fight grouping', 'combat quality judgment', 'intent inference', 'occupancy-episode use', 'replay 005 processing' ],
        replay005Protection: { processed: false, status: 'preserved' },
        humanReviewRequired: false
    };
}

async function writeReport(results, comparison, gate) {
    const lines = comparison.replays.map(replay => `- ${replay.replayId}: ${replay.rows} rows, changing fields ${replay.changingFields.join(', ') || 'none'}, hero damage delta ${replay.heroDamageDelta}, healing delta ${replay.heroHealingDelta + replay.selfHealingDelta}.`).join('\n');
    const report = `# Multi-Replay Damage Healing Field Discovery

## Scope

This task discovers descriptive damage and healing fields for replays 001-004. It does not process replay 005, define fights, infer intent, judge combat quality, use occupancy episodes, or detect transitions.

## Fields found

- Controller counters: ${CONTROLLER_FIELDS.map(field => `\`${field}\``).join(', ')}.
- Pawn state fields: ${PAWN_FIELDS.map(field => `\`${field}\``).join(', ')}.

## Results

${lines}

## Interpretation limits

- The useful fields are cumulative or state fields sampled once per canonical second.
- No source-target damage log is claimed.
- Deltas support descriptive temporal feasibility, not fight grouping or strategic interpretation.
- Negative or reset-like deltas are preserved in outputs instead of discarded.

## Gate

\`${gate.gateResult}\`
`;
    await fs.writeFile('reports/multi-replay-damage-healing-field-discovery.md', report);
    await fs.writeFile('reports/latest.md', 'reports/multi-replay-damage-healing-field-discovery.md\n');
}

function reliabilityForField(field) {
    if ([ 'm_iHeroDamage', 'm_iObjectiveDamage', 'm_iHeroHealing', 'm_iSelfHealing' ].includes(field)) return 'high_for_cumulative_counter_presence';
    if (field.includes('GuidedBotMatch')) return 'medium_field_name_indicates_match_counter_but_semantics_require_caution';
    if (field.includes('Health') || field.includes('Healing')) return 'medium_state_or_instantaneous_support';
    return 'medium_context_counter';
}

function limitationsForField(field) {
    if (field.includes('Damage') || field.includes('Healing')) return [ 'Counter does not identify source-target pairs in this task.', 'Counter deltas are descriptive and do not define fights.' ];
    if (field.includes('NetWorth')) return [ 'Economy context only; no soul-loss mechanics are inferred.' ];
    return [ 'Field semantics are replay-observed and should not be replaced with current-game assumptions.' ];
}

function chronologicalByPlayer(rows) {
    for (const group of groupBy(rows, row => row.playerId).values()) {
        for (let index = 1; index < group.length; index++) {
            if (group[index].gameTimeSeconds < group[index - 1].gameTimeSeconds) return false;
        }
    }
    return true;
}

async function validateOutputs(files) {
    for (const file of files) {
        const stats = await fs.stat(file);
        if (stats.size > OUTPUT_SIZE_LIMIT) throw new Error(`${file} exceeds 10 MiB`);
        if (file.endsWith('.json')) JSON.parse(await fs.readFile(file, 'utf8'));
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

function groupBy(values, keyFn) {
    const groups = new Map();
    for (const value of values) {
        const key = keyFn(value);
        const group = groups.get(key) ?? [];
        group.push(value);
        groups.set(key, group);
    }
    return groups;
}

function percent(value, total) {
    if (total === 0) return 0;
    return round((value / total) * 100);
}

function round(value) {
    if (!Number.isFinite(value)) return value;
    return Math.round(value * 1000) / 1000;
}

function normalize(value) {
    if (value === undefined) return null;
    if (typeof value === 'bigint') return value.toString();
    if (typeof value === 'number') return round(value);
    return value;
}
