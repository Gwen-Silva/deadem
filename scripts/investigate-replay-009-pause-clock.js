import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

import { InterceptorStage, Logger, Player } from 'deadem';
import StructuralReplayInspector from '../packages/engine/src/StructuralReplayInspector.js';

const REPLAY = {
    replayId: 'replay_009',
    file: 'samples/replay_009_normal.dem',
    reportedDurationSeconds: 2131,
    parserDurationSeconds: 2170.703,
    durationDeltaSeconds: 39.703,
    userReportedPause: 'yes'
};
const OUTPUT_DIR = 'output/replay-009-validation';
const REPORT_PATH = 'reports/replay-009-pause-clock-observability.md';
const TOKENS = [
    'pause', 'paused', 'game_paused', 'is_paused', 'match_time', 'game_time',
    'game_clock', 'match_clock', 'elapsed_time', 'start_time', 'round_start_time',
    'game_start_time', 'pre_game_time', 'post_game_time', 'server_tick',
    'simulation_tick', 'tick_interval', 'timescale', 'host_timescale',
    'game_state', 'match_state', 'curtime', 'time'
];

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});

async function main() {
    await fs.mkdir(OUTPUT_DIR, { recursive: true });
    const first = await auditReplay();
    const second = await auditReplay();
    const deterministic = compareDeterministic(compact(first), compact(second));
    first.validation.deterministicRepeat = deterministic;

    await writeOutputs(first);
    await fs.writeFile(REPORT_PATH, buildReport(first));
    await fs.writeFile('reports/latest.md', `${REPORT_PATH}\n`);

    console.log(JSON.stringify({
        gate: first.gate.gate,
        directPauseSignal: first.pauseEventAudit.summary.directPauseSignalFound,
        gameClockSource: first.clockInventory.summary.bestGameClockSource,
        mappingStatus: first.gate.activeGameTimeMappingStatus,
        replay005Excluded: true,
        botFixturesExcluded: [ 'replay_006', 'replay_007', 'replay_008' ]
    }, null, 2));
}

async function auditReplay() {
    const structural = await StructuralReplayInspector.inspectReplayStructure(REPLAY.file, { commandsOnly: true, maxRecords: Number.MAX_SAFE_INTEGER });
    const scan = await scanParserVisibleClockSources();
    const inventory = buildClockInventory(scan);
    const pauseEventAudit = buildPauseEventAudit(scan);
    const gameRulesSeries = buildGameRulesSeries(scan);
    const tickComparison = buildTickSimulationComparison(scan, structural);
    const candidates = buildPauseCandidates(scan, inventory);
    const reconciliation = buildDurationReconciliation(candidates);
    const activeMapping = buildActiveGameTimeMapping(inventory, candidates);
    const impact = buildImpactAssessment(activeMapping, pauseEventAudit);
    const validation = {
        schemaVersion: 1,
        replayId: REPLAY.replayId,
        deterministicRepeat: null,
        replay005Excluded: true,
        unsupportedBotFixturesExcluded: [ 'replay_006', 'replay_007', 'replay_008' ],
        checks: {
            parserCompleted: scan.completed,
            structuralCompleted: structural.summary.completed,
            directClockCandidates: inventory.sources.filter(source => source.confidence === 'medium' || source.confidence === 'high').length,
            explicitPauseEvents: pauseEventAudit.events.filter(event => event.evidenceCategory === 'explicit_pause_start' || event.evidenceCategory === 'explicit_pause_end').length,
            activeMappingRows: activeMapping.rows.length
        }
    };
    const gate = buildGate(inventory, pauseEventAudit, activeMapping, reconciliation);

    return {
        structural,
        scan,
        clockInventory: inventory,
        pauseEventAudit,
        gameRulesSeries,
        tickComparison,
        candidates,
        reconciliation,
        activeMapping,
        impact,
        validation,
        gate
    };
}

async function scanParserVisibleClockSources() {
    const player = new Player(undefined, Logger.NOOP);
    const scan = {
        completed: false,
        firstTick: null,
        lastTick: null,
        tickRate: null,
        messageCandidates: new Map(),
        serializerCandidates: new Map(),
        entityCandidates: new Map(),
        candidateFieldsByClass: new Map(),
        series: [],
        netTickSamples: [],
        messageCount: 0
    };

    try {
        player.registerPreInterceptor(InterceptorStage.MESSAGE_PACKET, (demoPacket, messagePacket) => {
            scan.messageCount += 1;
            collectMessageCandidates(scan, demoPacket, messagePacket);
        });
        await player.load(createReadStream(REPLAY.file));
        scan.firstTick = player.getFirstTick();
        scan.lastTick = player.getLastTick();
        scan.tickRate = player.getDemo().server?.tickRate ?? 64;
        collectSerializerCandidates(scan, player.getDemo());
        await player.seekToTick(scan.firstTick < 0 ? 0 : scan.firstTick);
        const durationSeconds = Math.floor((scan.lastTick - Math.max(0, scan.firstTick)) / scan.tickRate);
        for (let second = 0; second <= durationSeconds; second += 5) {
            const targetTick = Math.min(scan.lastTick, Math.round(second * scan.tickRate));
            await advanceToTick(player, targetTick);
            collectEntityCandidates(scan, player.getDemo(), player.getCurrentTick(), second);
        }
        await advanceToTick(player, scan.lastTick);
        scan.completed = player.getCurrentTick() >= player.getLastTick();
    } finally {
        await player.dispose();
    }

    return {
        ...scan,
        messageCandidates: Array.from(scan.messageCandidates.values()),
        serializerCandidates: Array.from(scan.serializerCandidates.values()),
        entityCandidates: Array.from(scan.entityCandidates.values())
    };
}

function collectMessageCandidates(scan, demoPacket, messagePacket) {
    const messageTypeId = messagePacket.type?.id ?? null;
    const sourceName = messagePacket.type?.code ?? String(messageTypeId);
    const tick = readTick(demoPacket);
    for (const [ fieldName, value ] of Object.entries(messagePacket.data ?? {})) {
        if (!isCandidateName(fieldName) && !isCandidateName(sourceName)) continue;
        const key = `message:${sourceName}:${fieldName}`;
        const record = scan.messageCandidates.get(key) ?? candidateBase('message', sourceName, fieldName, { messageTypeId });
        addSample(record, tick, normalize(value));
        scan.messageCandidates.set(key, record);
    }
}

function collectSerializerCandidates(scan, demo) {
    for (const clazz of demo.getClasses()) {
        const names = candidateFieldNames(clazz);
        if (names.length > 0 || isCandidateName(clazz.name)) {
            scan.candidateFieldsByClass.set(clazz.name, names);
        }
        for (const fieldName of names) {
            const key = `serializer:${clazz.name}:${fieldName}`;
            scan.serializerCandidates.set(key, {
                ...candidateBase('serializer', clazz.name, fieldName, { entityClass: clazz.name }),
                confidence: classifyFieldConfidence(fieldName),
                candidateMeaning: meaningFor(fieldName),
                limitations: [ 'serializer presence does not prove the field is populated or authoritative' ]
            });
        }
    }
}

function collectEntityCandidates(scan, demo, tick, parserSeconds) {
    scan.netTickSamples.push({ demoTick: tick, parserSeconds });
    for (const [className, knownNames] of scan.candidateFieldsByClass.entries()) {
        const entities = demo.getEntitiesByClassName(className);
        for (const entity of entities) {
            const names = knownNames.filter(name => entity.hasField(name));
            if (names.length === 0 && !isCandidateName(entity.class.name)) continue;
        for (const fieldName of names) {
            const value = normalize(entity.getField(fieldName));
            const key = `entity:${entity.class.name}:${fieldName}:${entity.index}`;
            const record = scan.entityCandidates.get(key) ?? candidateBase('entity', `${entity.class.name}#${entity.index}`, fieldName, { entityClass: entity.class.name });
            addSample(record, tick, value);
            scan.entityCandidates.set(key, record);
            if (Number.isFinite(Number(value))) {
                scan.series.push({
                    demoTick: tick,
                    serverTick: null,
                    parserSeconds,
                    fieldName,
                    sourceName: `${entity.class.name}#${entity.index}`,
                    rawValue: value,
                    normalizedSeconds: normalizeSeconds(fieldName, value),
                    state: 'observed',
                    warnings: []
                });
            }
        }
        }
    }
}

function buildClockInventory(scan) {
    const sources = [ ...scan.messageCandidates, ...scan.serializerCandidates, ...scan.entityCandidates ].map(finalizeCandidate)
        .sort((a, b) => confidenceRank(b.confidence) - confidenceRank(a.confidence) || a.sourceType.localeCompare(b.sourceType) || a.sourceName.localeCompare(b.sourceName));
    const best = sources.find(source =>
        source.sourceType === 'entity' &&
        confidenceRank(source.confidence) >= 2 &&
        source.changesOverTime &&
        /time|clock|curtime/iu.test(source.fieldName)
    ) ?? null;
    return {
        schemaVersion: 1,
        replayId: REPLAY.replayId,
        sources,
        summary: {
            candidateCount: sources.length,
            changingCandidates: sources.filter(source => source.changesOverTime).length,
            bestGameClockSource: best ? `${best.sourceType}:${best.sourceName}:${best.fieldName}` : null,
            directPauseCandidateCount: sources.filter(source => /pause/iu.test(source.fieldName) || /pause/iu.test(source.sourceName)).length
        }
    };
}

function buildPauseEventAudit(scan) {
    const events = [];
    for (const source of [ ...scan.messageCandidates, ...scan.entityCandidates ].map(finalizeCandidate)) {
        if (!/pause/iu.test(source.fieldName) && !/pause/iu.test(source.sourceName)) continue;
        events.push({
            messageType: source.messageTypeId,
            eventName: source.sourceName,
            tick: source.firstSeenTick,
            sourceOffset: null,
            payloadFields: { [source.fieldName]: source.sampleValues },
            previousValue: null,
            nextValue: null,
            evidenceCategory: source.changesOverTime ? 'boolean_pause_state_change' : 'no_pause_signal_found',
            confidence: source.confidence
        });
    }
    return {
        schemaVersion: 1,
        replayId: REPLAY.replayId,
        events,
        summary: {
            directPauseSignalFound: events.some(event => event.evidenceCategory === 'explicit_pause_start' || event.evidenceCategory === 'explicit_pause_end' || event.evidenceCategory === 'boolean_pause_state_change'),
            evidenceCategory: events.length === 0 ? 'no_pause_signal_found' : 'boolean_pause_candidate_unconfirmed'
        }
    };
}

function buildGameRulesSeries(scan) {
    const selected = scan.series
        .filter(row => /GameRules|game.?rules|time|clock|pause|state/iu.test(`${row.sourceName}:${row.fieldName}`))
        .slice(0, 5000);
    const withDeltas = [];
    const previousByKey = new Map();
    for (const row of selected) {
        const key = `${row.sourceName}:${row.fieldName}`;
        const previous = previousByKey.get(key) ?? null;
        withDeltas.push({
            demoTick: row.demoTick,
            serverTick: row.serverTick,
            parserSeconds: row.parserSeconds,
            fieldName: row.fieldName,
            sourceName: row.sourceName,
            rawValue: row.rawValue,
            normalizedSeconds: row.normalizedSeconds,
            deltaFromPrevious: previous === null || row.normalizedSeconds === null || previous.normalizedSeconds === null ? null : round(row.normalizedSeconds - previous.normalizedSeconds),
            state: row.state,
            warnings: row.warnings
        });
        previousByKey.set(key, row);
    }
    return { schemaVersion: 1, replayId: REPLAY.replayId, rows: withDeltas };
}

function buildTickSimulationComparison(scan, structural) {
    return {
        schemaVersion: 1,
        replayId: REPLAY.replayId,
        nominalTickRate: scan.tickRate,
        demoTicksContinue: scan.completed ? 'confirmed_to_final_tick' : 'unknown',
        serverTicksContinue: 'not_available',
        simulationTimeFreezes: 'not_available',
        packetFrequencyChanges: 'not_evaluated_without_direct_pause_interval',
        parserDerivedSeconds: round((scan.lastTick - Math.max(0, scan.firstTick)) / scan.tickRate),
        structuralFinalTick: structural.summary.finalStructuralTick,
        messageCount: scan.messageCount,
        netTickSamples: scan.netTickSamples.filter((_, index) => index % 300 === 0).slice(0, 20)
    };
}

function buildPauseCandidates(scan, inventory) {
    const clock = inventory.sources.find(source => source.sourceType === 'entity' && source.changesOverTime && /time|clock|curtime/iu.test(source.fieldName)) ?? null;
    const intervals = [];
    if (clock !== null) {
        const series = scan.series.filter(row => `${row.sourceName}:${row.fieldName}` === `${clock.sourceName}:${clock.fieldName}`);
        let start = null;
        for (let i = 1; i < series.length; i++) {
            const parserDelta = series[i].parserSeconds - series[i - 1].parserSeconds;
            const clockDelta = Number(series[i].rawValue) - Number(series[i - 1].rawValue);
            if (parserDelta > 0 && Math.abs(clockDelta) < 0.001) {
                start ??= series[i - 1];
            } else if (start !== null) {
                intervals.push(candidateInterval(start, series[i - 1], clock, false));
                start = null;
            }
        }
        if (start !== null) intervals.push(candidateInterval(start, series.at(-1), clock, false));
    }
    return {
        schemaVersion: 1,
        replayId: REPLAY.replayId,
        intervals: intervals.filter(interval => interval.parserDurationSeconds >= 2),
        summary: {
            candidateCount: intervals.length,
            classification: intervals.length === 0 ? 'no_direct_clock_freeze_candidates' : 'clock_freeze_without_explicit_pause_event'
        }
    };
}

function candidateInterval(start, end, source, explicitPauseSignal) {
    return {
        startTick: start.demoTick,
        endTick: end.demoTick,
        parserStartSeconds: start.parserSeconds,
        parserEndSeconds: end.parserSeconds,
        parserDurationSeconds: round(end.parserSeconds - start.parserSeconds),
        gameClockStart: start.rawValue,
        gameClockEnd: end.rawValue,
        gameClockDelta: round(Number(end.rawValue) - Number(start.rawValue)),
        explicitPauseSignal,
        evidence: [ `${source.sourceType}:${source.sourceName}:${source.fieldName}` ],
        classification: explicitPauseSignal ? 'explicit_pause_interval' : 'clock_freeze_without_explicit_pause_event'
    };
}

function buildDurationReconciliation(candidates) {
    const pauseSeconds = candidates.intervals.length > 0 ? round(candidates.intervals.reduce((sum, interval) => sum + interval.parserDurationSeconds, 0)) : null;
    return {
        schemaVersion: 1,
        parserDuration: REPLAY.parserDurationSeconds,
        reportedDuration: REPLAY.reportedDurationSeconds,
        difference: REPLAY.durationDeltaSeconds,
        pregameSeconds: null,
        pauseSeconds,
        postgameSeconds: null,
        roundingSeconds: null,
        unclassifiedSeconds: pauseSeconds === null ? REPLAY.durationDeltaSeconds : round(REPLAY.durationDeltaSeconds - pauseSeconds),
        fullyReconciled: pauseSeconds !== null && Math.abs(REPLAY.durationDeltaSeconds - pauseSeconds) <= 1,
        evidence: pauseSeconds === null ? [ 'no reliable direct pause/game-clock source found' ] : [ 'clock-freeze candidates require independent confirmation' ]
    };
}

function buildActiveGameTimeMapping(inventory, candidates) {
    const usable = candidates.intervals.length > 0 && inventory.summary.bestGameClockSource !== null;
    return {
        schemaVersion: 1,
        replayId: REPLAY.replayId,
        status: usable ? 'candidate_mapping_not_promoted' : 'unavailable_no_reliable_clock_source',
        rows: [],
        rules: usable ? [ 'mapping withheld because pause evidence is not explicit or independently supported' ] : [ 'parser seconds remain canonical available time basis' ]
    };
}

function buildImpactAssessment(mapping, pauseAudit) {
    const timingRemoved = mapping.status !== 'unavailable_no_reliable_clock_source';
    const capabilities = [
        impact('player trajectory analysis', 'ready_with_constraints', 'parser-time trajectory remains usable; pause-aware active time unavailable'),
        impact('death review', 'ready_with_constraints', 'death ordering remains usable; active-game-time normalization unavailable'),
        impact('economy progression', 'ready_with_constraints', 'parser-time economy series remains usable; pause-normalized rates unavailable'),
        impact('lane occupancy', 'not_ready', 'semantic occupancy remains frozen and clock observability does not change that'),
        impact('rotation detection', 'not_ready', 'rotation detection remains blocked'),
        impact('fight participation', 'not_ready', 'combat attribution/source-target damage remains incomplete'),
        impact('objective timing', timingRemoved ? 'ready_with_constraints' : 'not_tested', 'objective layer for replay 009 was not built in this task'),
        impact('teamfight reconstruction', 'not_ready', 'fight grouping remains unsupported'),
        impact('macro decision analysis', 'not_ready', 'strategic interpretation remains out of scope')
    ];
    return {
        schemaVersion: 1,
        replayId: REPLAY.replayId,
        directPauseSignalFound: pauseAudit.summary.directPauseSignalFound,
        activeGameTimeMappingStatus: mapping.status,
        capabilities
    };
}

function impact(capability, status, rationale) {
    return { capability, status, rationale };
}

function buildGate(inventory, pauseAudit, mapping, reconciliation) {
    const resolved = pauseAudit.summary.directPauseSignalFound && mapping.rows.length > 0 && reconciliation.fullyReconciled;
    return {
        schemaVersion: 1,
        gate: resolved ? 'replay_009_pause_clock_observability_resolved' : 'replay_009_pause_clock_not_exposed',
        directPauseSignalFound: pauseAudit.summary.directPauseSignalFound,
        gameClockSource: inventory.summary.bestGameClockSource,
        activeGameTimeMappingStatus: mapping.status,
        blockedFollowUpTask: null,
        replay005Excluded: true,
        unsupportedBotFixturesExcluded: [ 'replay_006', 'replay_007', 'replay_008' ],
        conclusion: resolved
            ? 'direct pause/clock evidence supports deterministic active-game-time mapping'
            : 'parser-visible replay data did not expose a reliable direct pause/game-clock source; parser seconds remain canonical'
    };
}

function buildReport(result) {
    return `# Replay 009 Pause Clock Observability

## Result

- Gate: \`${result.gate.gate}\`
- Direct pause signal found: ${result.gate.directPauseSignalFound}
- Game-clock source: ${result.gate.gameClockSource ?? 'none'}
- Active-game-time mapping: ${result.gate.activeGameTimeMappingStatus}
- Replay 005: excluded
- Bot fixtures 006-008: excluded

## Duration Reconciliation

- Parser duration: ${result.reconciliation.parserDuration}s
- Reported duration: ${result.reconciliation.reportedDuration}s
- Difference: ${result.reconciliation.difference}s
- Pregame: ${result.reconciliation.pregameSeconds}
- Pause: ${result.reconciliation.pauseSeconds}
- Postgame: ${result.reconciliation.postgameSeconds}
- Unclassified: ${result.reconciliation.unclassifiedSeconds}s

The 39.703s difference is not assigned to pause because no direct pause event or reliable game-clock freeze source was found.

## Clock Inventory

- Candidates: ${result.clockInventory.summary.candidateCount}
- Changing candidates: ${result.clockInventory.summary.changingCandidates}
- Direct pause candidates: ${result.clockInventory.summary.directPauseCandidateCount}

## Impact

${result.impact.capabilities.map(item => `- ${item.capability}: ${item.status} - ${item.rationale}`).join('\n')}
`;
}

async function writeOutputs(result) {
    await writeJson(path.join(OUTPUT_DIR, 'clock-source-inventory.json'), result.clockInventory);
    await writeJson(path.join(OUTPUT_DIR, 'pause-event-audit.json'), result.pauseEventAudit);
    await writeJsonl(path.join(OUTPUT_DIR, 'game-rules-clock-series.jsonl'), result.gameRulesSeries.rows);
    await writeJson(path.join(OUTPUT_DIR, 'tick-simulation-comparison.json'), result.tickComparison);
    await writeJson(path.join(OUTPUT_DIR, 'pause-candidate-intervals.json'), result.candidates);
    await writeJson(path.join(OUTPUT_DIR, 'duration-reconciliation.json'), result.reconciliation);
    await writeJsonl(path.join(OUTPUT_DIR, 'active-game-time-mapping.jsonl'), result.activeMapping.rows.length > 0 ? result.activeMapping.rows : [ { schemaVersion: 1, replayId: REPLAY.replayId, status: result.activeMapping.status, rows: [] } ]);
    await writeJson(path.join(OUTPUT_DIR, 'pause-clock-impact-assessment.json'), result.impact);
    await writeJson(path.join(OUTPUT_DIR, 'pause-clock-validation.json'), result.validation);
    await writeJson(path.join(OUTPUT_DIR, 'pause-clock-gate.json'), result.gate);
}

function candidateBase(sourceType, sourceName, fieldName, extra = {}) {
    return {
        sourceType,
        sourceName,
        fieldName,
        messageTypeId: extra.messageTypeId ?? null,
        entityClass: extra.entityClass ?? null,
        firstSeenTick: null,
        lastSeenTick: null,
        sampleValues: [],
        _allValues: new Set(),
        changesOverTime: false,
        candidateMeaning: meaningFor(fieldName),
        confidence: classifyFieldConfidence(fieldName),
        limitations: []
    };
}

function addSample(record, tick, value) {
    record.firstSeenTick = record.firstSeenTick === null ? tick : Math.min(record.firstSeenTick, tick ?? record.firstSeenTick);
    record.lastSeenTick = record.lastSeenTick === null ? tick : Math.max(record.lastSeenTick, tick ?? record.lastSeenTick);
    const stable = stableStringify(value);
    record._allValues.add(stable);
    if (record.sampleValues.length < 8 && !record.sampleValues.some(sample => stableStringify(sample) === stable)) record.sampleValues.push(value);
    record.changesOverTime = record._allValues.size > 1;
}

function finalizeCandidate(record) {
    const { _allValues, ...rest } = record;
    return {
        ...rest,
        changesOverTime: record.changesOverTime,
        limitations: record.limitations.length > 0 ? record.limitations : defaultLimitations(record)
    };
}

function defaultLimitations(record) {
    if (record.sourceType === 'serializer') return [ 'schema field only; not proof of runtime value' ];
    if (record.sourceType === 'message') return [ 'message field observed but semantic authority not independently validated' ];
    return [ 'entity field observed through sampled parser state' ];
}

function candidateFieldNames(clazz) {
    const names = [];
    const metas = clazz.layout.getMetas();
    for (const meta of metas) {
        const name = clazz.serializer.getNameForFieldPathId(meta.id);
        if (isCandidateName(name)) names.push(name);
    }
    return names;
}

function isCandidateName(name) {
    return typeof name === 'string' && TOKENS.some(token => name.toLowerCase().includes(token));
}

function meaningFor(name) {
    const lower = String(name).toLowerCase();
    if (lower.includes('pause')) return 'pause_state_candidate';
    if (lower.includes('tick')) return 'tick_counter_candidate';
    if (lower.includes('state')) return 'match_or_game_state_candidate';
    if (lower.includes('time') || lower.includes('clock')) return 'clock_or_elapsed_time_candidate';
    return 'related_candidate';
}

function classifyFieldConfidence(name) {
    const lower = String(name).toLowerCase();
    if (lower.includes('pause')) return 'medium';
    if (lower.includes('game_time') || lower.includes('match_time') || lower.includes('clock')) return 'medium';
    if (lower.includes('time') || lower.includes('tick') || lower.includes('state')) return 'low';
    return 'low';
}

function confidenceRank(confidence) {
    return { high: 3, medium: 2, low: 1 }[confidence] ?? 0;
}

async function advanceToTick(player, targetTick) {
    while (player.getCurrentTick() < targetTick) {
        if (!await player.nextTick()) break;
    }
}

function normalize(value) {
    if (value === undefined || value === null) return null;
    if (typeof value === 'bigint') return value.toString();
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'boolean' || typeof value === 'string') return value;
    if (Array.isArray(value)) return value.slice(0, 8).map(normalize);
    if (typeof value === 'object' && 'value' in value) return normalize(value.value);
    return String(value);
}

function normalizeSeconds(fieldName, value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return null;
    if (/tick/iu.test(fieldName)) return null;
    return numeric;
}

function readTick(demoPacket) {
    if (Number.isFinite(demoPacket?.tick)) return demoPacket.tick;
    if (Number.isFinite(demoPacket?.data?.tick)) return demoPacket.data.tick;
    return null;
}

function round(value) {
    return Number.isFinite(value) ? Math.round(value * 1000) / 1000 : null;
}

function compact(result) {
    return {
        gate: result.gate,
        inventorySummary: result.clockInventory.summary,
        pauseSummary: result.pauseEventAudit.summary,
        candidates: result.candidates.summary,
        reconciliation: result.reconciliation
    };
}

function compareDeterministic(a, b) {
    const left = stableStringify(a);
    const right = stableStringify(b);
    return { equal: left === right, hashA: sha256(left), hashB: sha256(right) };
}

function stableStringify(value) {
    return JSON.stringify(sortKeys(value));
}

function sortKeys(value) {
    if (Array.isArray(value)) return value.map(sortKeys);
    if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [ key, sortKeys(value[key]) ]));
    return value;
}

function sha256(value) {
    return crypto.createHash('sha256').update(value).digest('hex');
}

async function writeJson(file, value) {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeJsonl(file, rows) {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, `${rows.map(row => JSON.stringify(row)).join('\n')}${rows.length > 0 ? '\n' : ''}`);
}
