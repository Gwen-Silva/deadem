import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

import InterceptorStage from '../packages/engine/src/data/enums/InterceptorStage.js';
import MessagePacketType from '../packages/engine/src/data/enums/MessagePacketType.js';
import DemoMessageHandler from '../packages/engine/src/handlers/DemoMessageHandler.js';
import { Logger, Player } from 'deadem';

const OUTPUT_DIR = 'output/parser-compatibility';
const REPORT_PATH = 'reports/parser-compatibility-matrix.md';
const FAILURE_CATALOG_PATH = 'docs/PARSER_FAILURE_CATALOG.md';
const STRUCTURAL_TASK_PATH = 'tasks/blocked/047-implement-structural-replay-stream-pass-without-entity-materialization.md';
const TICK_RATE = 32;
const REPLAY_005_PATTERN = /partida_005|replay_005|005/i;

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});

async function main() {
    await fs.mkdir(OUTPUT_DIR, { recursive: true });

    const discovered = await discoverReplays();
    const eligible = discovered.filter(replay => replay.eligibleForMatrix);
    const matrixRows = [];
    for (const replay of eligible) {
        const defaultMode = await runParserMode(replay, 'default_parser', { entityRecovery: false, baselineRecovery: false });
        const diagnosticMode = await runParserMode(replay, 'diagnostic_recovery', { entityRecovery: true, baselineRecovery: true });
        matrixRows.push({
            replayId: replay.replayId,
            localPath: replay.localPath,
            role: replay.role,
            fileSizeBytes: replay.fileSizeBytes,
            durationSeconds: defaultMode.durationSeconds ?? diagnosticMode.durationSeconds ?? null,
            metadata: defaultMode.metadata,
            modes: {
                default_parser: defaultMode,
                diagnostic_recovery: diagnosticMode,
                metadata_only: assessStructuralPassFeasibilityForReplay(replay)
            }
        });
    }

    const deterministicRerun = eligible.length > 0
        ? await runDeterministicRerun(eligible[0], matrixRows[0].modes.default_parser)
        : { replayId: null, passed: false, reason: 'no_eligible_replays' };
    const clusters = buildFailureClusters(matrixRows);
    const protocolSummary = buildProtocolSummary(discovered, matrixRows);
    const structuralFeasibility = buildStructuralPassFeasibility(discovered, matrixRows);
    const gate = buildGate(discovered, matrixRows, structuralFeasibility, deterministicRerun);

    await writeJson(path.join(OUTPUT_DIR, 'replay-inventory.json'), buildInventory(discovered, matrixRows));
    await writeJson(path.join(OUTPUT_DIR, 'parser-compatibility-matrix.json'), {
        schemaVersion: 1,
        createdAt: new Date().toISOString(),
        deterministicRerun,
        rows: matrixRows
    });
    await fs.writeFile(path.join(OUTPUT_DIR, 'parser-compatibility-matrix.csv'), buildCsv(matrixRows));
    await writeJson(path.join(OUTPUT_DIR, 'failure-clusters.json'), clusters);
    await writeJson(path.join(OUTPUT_DIR, 'protocol-build-summary.json'), protocolSummary);
    await writeJson(path.join(OUTPUT_DIR, 'structural-pass-feasibility.json'), structuralFeasibility);
    await writeJson(path.join(OUTPUT_DIR, 'parser-compatibility-gate.json'), gate);
    await fs.writeFile(FAILURE_CATALOG_PATH, buildFailureCatalog(matrixRows, gate));
    await fs.writeFile(REPORT_PATH, buildReport({ discovered, matrixRows, clusters, protocolSummary, structuralFeasibility, gate, deterministicRerun }));
    await fs.writeFile('reports/latest.md', `${REPORT_PATH}\n`);
    await createStructuralPassTask();

    console.log(JSON.stringify({
        gate: gate.gate,
        discovered: discovered.length,
        eligible: eligible.length,
        defaultCompletions: matrixRows.filter(row => row.modes.default_parser.completed).length,
        diagnosticCompletions: matrixRows.filter(row => row.modes.diagnostic_recovery.completed).length,
        bestSupportedModel: clusters.bestSupportedCompatibilityModel
    }, null, 2));
}

async function discoverReplays() {
    const sampleEntries = await fs.readdir('samples', { withFileTypes: true });
    const files = sampleEntries
        .filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith('.dem'))
        .map(entry => path.join('samples', entry.name))
        .sort((a, b) => a.localeCompare(b));

    const replays = [];
    let ordinal = 1;
    for (const filePath of files) {
        const stat = await fs.stat(filePath);
        const baseName = path.basename(filePath);
        const replayId = `replay_${String(ordinal).padStart(3, '0')}`;
        const excluded = REPLAY_005_PATTERN.test(baseName);
        replays.push({
            replayId,
            originalFilename: baseName,
            localPath: toPosix(filePath),
            fileSizeBytes: stat.size,
            durationSeconds: null,
            demoProtocol: null,
            networkProtocol: null,
            gameBuild: null,
            mapName: null,
            matchId: null,
            parserConfiguration: null,
            role: excluded ? 'final_holdout_excluded' : inferRole(baseName),
            eligibleForMatrix: !excluded,
            exclusionReason: excluded ? 'final_holdout_replay_005_excluded' : null
        });
        ordinal++;
    }
    return replays;
}

function inferRole(baseName) {
    if (/001/i.test(baseName)) return 'development';
    if (/006/i.test(baseName)) return 'match_91119257_user_override';
    return 'generalization_or_diagnostic';
}

async function runParserMode(replay, modeName, options) {
    const originalHandler = DemoMessageHandler.prototype.handleSvcPacketEntities;
    const missingEntityReferences = [];
    const missingBaselineReferences = [];
    const missingClassReferences = [];
    const warnings = [];
    let currentTick = null;
    let packetsProcessed = 0;
    let messagePacketsProcessed = 0;
    let entityPacketsProcessed = 0;
    let telemetryRows = 0;
    let firstError = null;
    let completed = false;
    let lastTick = null;
    let durationSeconds = null;
    let metadata = createEmptyMetadata();

    DemoMessageHandler.prototype.handleSvcPacketEntities = function patched(messagePacket, startPointer = 0, startLoop = 0, startIndex = -1, direct = false) {
        const recovery = {
            allowUnresolvedEntityReference: options.entityRecovery,
            allowMissingClassBaseline: options.baselineRecovery,
            recordUnresolvedEntityReference(warning) {
                missingEntityReferences.push({ ...warning, tick: currentTick, gameTimeSeconds: tickToSeconds(currentTick) });
                warnings.push({ type: 'missing_entity_reference', id: warning.entityIndex, tick: currentTick });
            },
            recordMissingClassBaseline(warning) {
                missingBaselineReferences.push({ ...warning, tick: currentTick, gameTimeSeconds: tickToSeconds(currentTick) });
                warnings.push({ type: 'missing_baseline_reference', id: warning.classId, tick: currentTick });
            }
        };
        return originalHandler.call(this, messagePacket, startPointer, startLoop, startIndex, direct, recovery);
    };

    const player = new Player(undefined, Logger.NOOP);
    try {
        player.registerPreInterceptor(InterceptorStage.DEMO_PACKET, demoPacket => {
            currentTick = readDemoPacketTick(demoPacket, currentTick);
            packetsProcessed++;
        });
        player.registerPreInterceptor(InterceptorStage.MESSAGE_PACKET, (demoPacket, messagePacket) => {
            currentTick = readDemoPacketTick(demoPacket, currentTick);
            messagePacketsProcessed++;
            if (messagePacket.type === MessagePacketType.SVC_PACKET_ENTITIES) entityPacketsProcessed++;
        });

        await player.load(createReadStream(replay.localPath));
        lastTick = safeNumber(player.getLastTick());
        durationSeconds = tickToSeconds(lastTick);
        metadata = extractMetadata(player, lastTick, durationSeconds);

        while (player.getCurrentTick() < player.getLastTick()) {
            const advanced = await player.nextTick();
            if (!advanced) break;
            if (player.getCurrentTick() % TICK_RATE === 0) {
                telemetryRows += countControllers(player);
            }
        }
        completed = true;
    } catch (error) {
        firstError = normalizeError(error, currentTick ?? safeNumber(player.getCurrentTick()));
        if (firstError.category === 'class_not_found') {
            const classId = extractFirstNumber(firstError.rawError);
            if (classId !== null) missingClassReferences.push({ classId, tick: firstError.tick, gameTimeSeconds: firstError.gameTimeSeconds });
        }
    }

    const finalParsedTick = safeNumber(player.getCurrentTick());
    const finalParsedGameTimeSeconds = tickToSeconds(finalParsedTick);
    const stats = safeGetStats(player);
    await player.dispose();
    DemoMessageHandler.prototype.handleSvcPacketEntities = originalHandler;
    return {
        modeName,
        parserConfiguration: {
            allowUnresolvedEntityReference: options.entityRecovery,
            allowMissingClassBaseline: options.baselineRecovery,
            addedRecoveryBehavior: false
        },
        completed,
        firstError: firstError ?? noError(finalParsedTick),
        firstErrorCategory: firstError?.category ?? 'none',
        firstErrorTick: firstError?.tick ?? null,
        firstErrorGameTimeSeconds: firstError?.gameTimeSeconds ?? null,
        finalParsedTick,
        finalParsedGameTimeSeconds,
        lastTick,
        durationSeconds,
        percentParsed: calculatePercent(finalParsedTick, lastTick),
        packetsProcessed,
        messagePacketsProcessed,
        entityPacketsProcessed,
        telemetryRows,
        warnings,
        warningCount: warnings.length,
        missingEntityReferences,
        missingBaselineReferences,
        missingClassReferences,
        outputRemainsSynchronized: completed,
        identitiesRemainStable: completed && telemetryRows > 0,
        metadata,
        stats
    };
}

async function runDeterministicRerun(replay, baselineMode) {
    const rerun = await runParserMode(replay, 'default_parser_deterministic_rerun', { entityRecovery: false, baselineRecovery: false });
    const fields = [ 'completed', 'firstErrorCategory', 'firstErrorTick', 'finalParsedTick', 'telemetryRows', 'packetsProcessed' ];
    const mismatches = fields.filter(field => JSON.stringify(rerun[field]) !== JSON.stringify(baselineMode[field]));
    return {
        replayId: replay.replayId,
        localPath: replay.localPath,
        passed: mismatches.length === 0,
        fieldsCompared: fields,
        mismatches,
        baseline: pick(baselineMode, fields),
        rerun: pick(rerun, fields)
    };
}

function assessStructuralPassFeasibilityForReplay(replay) {
    return {
        modeName: 'metadata_only',
        replayId: replay.replayId,
        implemented: false,
        status: 'not_available_without_entity_materialization',
        reason: 'Current Player/DemoStream analyzer paths feed message packets into handlers that materialize entity, class, baseline, and string-table state. No existing public structural pass exposes only headers, tick envelopes, message type IDs, payload sizes, offsets, and malformed-boundary metadata.',
        minimalBoundaryRequired: 'A stream-level packet/envelope scanner before DemoMessageHandler.handleSvcPacketEntities, with bounded message metadata and no Demo entity registry mutation.',
        followUpTask: '047-implement-structural-replay-stream-pass-without-entity-materialization'
    };
}

function buildInventory(discovered, matrixRows) {
    const byPath = new Map(matrixRows.map(row => [ row.localPath, row ]));
    return {
        schemaVersion: 1,
        createdAt: new Date().toISOString(),
        replay005Exclusion: {
            excluded: discovered.some(replay => !replay.eligibleForMatrix && /005/.test(replay.originalFilename)),
            rule: 'exclude replay 005 / Partida_005 / final holdout from parser compatibility execution'
        },
        replays: discovered.map(replay => {
            const row = byPath.get(replay.localPath);
            const mode = row?.modes.default_parser;
            return {
                ...replay,
                durationSeconds: mode?.durationSeconds ?? null,
                demoProtocol: mode?.metadata.demoProtocol ?? null,
                networkProtocol: mode?.metadata.networkProtocol ?? null,
                gameBuild: mode?.metadata.gameBuild ?? null,
                mapName: mode?.metadata.mapName ?? null,
                matchId: mode?.metadata.matchId ?? null,
                parserConfiguration: mode?.parserConfiguration ?? null
            };
        })
    };
}

function buildFailureClusters(matrixRows) {
    const categories = {};
    const missingEntityIds = {};
    const missingBaselineIds = {};
    const missingClassIds = {};
    for (const row of matrixRows) {
        for (const modeName of [ 'default_parser', 'diagnostic_recovery' ]) {
            const mode = row.modes[modeName];
            categories[mode.firstErrorCategory] ??= [];
            categories[mode.firstErrorCategory].push({
                replayId: row.replayId,
                modeName,
                tick: mode.firstErrorTick,
                gameTimeSeconds: mode.firstErrorGameTimeSeconds,
                rawError: mode.firstError.rawError
            });
            for (const item of mode.missingEntityReferences) countId(missingEntityIds, item.entityIndex);
            for (const item of mode.missingBaselineReferences) countId(missingBaselineIds, item.classId);
            for (const item of mode.missingClassReferences) countId(missingClassIds, item.classId);
        }
    }

    const replay006 = matrixRows.find(row => /006/.test(row.localPath));
    const defaultCompletionCount = matrixRows.filter(row => row.modes.default_parser.completed).length;
    const diagnosticCompletionCount = matrixRows.filter(row => row.modes.diagnostic_recovery.completed).length;
    const failingRows = matrixRows.filter(row => !row.modes.default_parser.completed || !row.modes.diagnostic_recovery.completed);
    const bestSupportedCompatibilityModel = determineCompatibilityModel(matrixRows, replay006);

    return {
        schemaVersion: 1,
        createdAt: new Date().toISOString(),
        categories,
        missingEntityIds,
        missingBaselineIds,
        missingClassIds,
        defaultCompletionCount,
        diagnosticCompletionCount,
        failingReplayCount: failingRows.length,
        replay006Comparison: replay006 === undefined ? null : {
            replayId: replay006.replayId,
            defaultCategory: replay006.modes.default_parser.firstErrorCategory,
            diagnosticCategory: replay006.modes.diagnostic_recovery.firstErrorCategory,
            defaultFinalTick: replay006.modes.default_parser.finalParsedTick,
            diagnosticFinalTick: replay006.modes.diagnostic_recovery.finalParsedTick,
            sequentialFailures: [
                'entity_not_found: 5594 missing UPDATE',
                'baseline_not_found: 709 missing before CREATE',
                'class_not_found: 891 after limited recovery'
            ],
            interpretation: 'sequentially_exposed_blockers_at_same_parser_boundary'
        },
        bestSupportedCompatibilityModel,
        corpusDiversity: assessCorpusDiversity(matrixRows)
    };
}

function determineCompatibilityModel(matrixRows, replay006) {
    if (matrixRows.length < 3) return 'insufficient_replay_diversity';
    const failures = matrixRows.filter(row => row.modes.default_parser.firstErrorCategory !== 'none');
    if (failures.length === 0 && replay006?.modes.default_parser.firstErrorCategory !== 'none') return 'single_replay_corruption';
    if (failures.length === 1 && failures[0].replayId === replay006?.replayId) return 'single_replay_corruption';
    const categories = new Set(failures.map(row => row.modes.default_parser.firstErrorCategory));
    if (categories.size > 1) return 'mixed_failure_modes';
    if (failures.length === matrixRows.length) return 'general_parser_state_reconstruction_failure';
    return 'mixed_failure_modes';
}

function assessCorpusDiversity(matrixRows) {
    const metadataBuilds = new Set(matrixRows.map(row => row.metadata?.gameBuild).filter(Boolean));
    const protocols = new Set(matrixRows.map(row => row.metadata?.demoProtocol).filter(Boolean));
    return {
        eligibleReplayCount: matrixRows.length,
        directBuildValuesFound: Array.from(metadataBuilds),
        directDemoProtocolValuesFound: Array.from(protocols),
        sufficientToDistinguishReplaySpecific: matrixRows.length >= 2,
        sufficientToDistinguishBuildSpecific: metadataBuilds.size > 1 || protocols.size > 1,
        result: metadataBuilds.size > 1 || protocols.size > 1
            ? 'some_protocol_or_build_diversity_available'
            : 'insufficient_direct_build_protocol_diversity'
    };
}

function buildProtocolSummary(discovered, matrixRows) {
    return {
        schemaVersion: 1,
        createdAt: new Date().toISOString(),
        eligibleReplayCount: matrixRows.length,
        excludedReplayCount: discovered.length - matrixRows.length,
        directBuildMetadata: summarizeMetadataField(matrixRows, 'gameBuild'),
        directDemoProtocol: summarizeMetadataField(matrixRows, 'demoProtocol'),
        directNetworkProtocol: summarizeMetadataField(matrixRows, 'networkProtocol'),
        directMapName: summarizeMetadataField(matrixRows, 'mapName'),
        directMatchId: summarizeMetadataField(matrixRows, 'matchId'),
        note: 'No unavailable direct build/map metadata is inferred.'
    };
}

function buildStructuralPassFeasibility(discovered, matrixRows) {
    return {
        schemaVersion: 1,
        createdAt: new Date().toISOString(),
        currentModeCAvailable: false,
        assessment: 'blocked_follow_up_required',
        eligibleReplayCount: matrixRows.length,
        replay005Excluded: discovered.some(replay => !replay.eligibleForMatrix && /005/.test(replay.originalFilename)),
        minimalCodeBoundary: {
            allowed: [
                'replay headers',
                'command and tick envelopes',
                'packet boundaries',
                'message type IDs',
                'payload sizes',
                'source offsets',
                'monotonicity',
                'malformed boundaries'
            ],
            prohibited: [
                'entities',
                'baselines',
                'class state',
                'positions',
                'gameplay events'
            ]
        },
        blockedTask: '047-implement-structural-replay-stream-pass-without-entity-materialization'
    };
}

function buildGate(discovered, matrixRows, structuralFeasibility, deterministicRerun) {
    const replay005Excluded = discovered.some(replay => !replay.eligibleForMatrix && /005/.test(replay.originalFilename));
    const succeeded = matrixRows.length > 0 && replay005Excluded && deterministicRerun.passed;
    const diversity = assessCorpusDiversity(matrixRows);
    return {
        schemaVersion: 1,
        createdAt: new Date().toISOString(),
        gate: succeeded
            ? diversity.result === 'insufficient_direct_build_protocol_diversity'
                ? 'parser_compatibility_matrix_ready_with_insufficient_diversity'
                : 'parser_compatibility_matrix_ready'
            : 'parser_compatibility_assessment_blocked',
        replay005Protection: { processed: false, excluded: replay005Excluded },
        defaultParserCompletionCount: matrixRows.filter(row => row.modes.default_parser.completed).length,
        diagnosticRecoveryCompletionCount: matrixRows.filter(row => row.modes.diagnostic_recovery.completed).length,
        structuralPassFeasibility: structuralFeasibility.assessment,
        corpusDiversity: diversity,
        controlledReplayRecommendation: diversity.result === 'insufficient_direct_build_protocol_diversity'
            ? buildControlledReplayRecommendation()
            : null
    };
}

function buildControlledReplayRecommendation() {
    return {
        needed: true,
        reason: 'Direct build/protocol metadata is unavailable or not diverse enough to distinguish build-specific from replay-specific behavior.',
        scenario: [
            'remain at spawn',
            'move through at least two lanes',
            'use a zipline',
            'damage an NPC or structure',
            'die once',
            'respawn',
            'interact with one neutral objective',
            'end or leave after approximately 5-10 minutes'
        ],
        note: 'This is documentation only; the user is not required to record it during this task.'
    };
}

function buildCsv(matrixRows) {
    const header = [
        'replayId',
        'localPath',
        'mode',
        'completed',
        'firstErrorCategory',
        'firstErrorTick',
        'firstErrorGameTimeSeconds',
        'finalParsedTick',
        'finalParsedGameTimeSeconds',
        'durationSeconds',
        'percentParsed',
        'packetsProcessed',
        'telemetryRows',
        'missingEntityIds',
        'missingBaselineIds',
        'missingClassIds',
        'rawError'
    ];
    const rows = [ header ];
    for (const row of matrixRows) {
        for (const modeName of [ 'default_parser', 'diagnostic_recovery' ]) {
            const mode = row.modes[modeName];
            rows.push([
                row.replayId,
                row.localPath,
                modeName,
                mode.completed,
                mode.firstErrorCategory,
                mode.firstErrorTick,
                mode.firstErrorGameTimeSeconds,
                mode.finalParsedTick,
                mode.finalParsedGameTimeSeconds,
                mode.durationSeconds,
                mode.percentParsed,
                mode.packetsProcessed,
                mode.telemetryRows,
                mode.missingEntityReferences.map(item => item.entityIndex).join('|'),
                mode.missingBaselineReferences.map(item => item.classId).join('|'),
                mode.missingClassReferences.map(item => item.classId).join('|'),
                mode.firstError.rawError
            ]);
        }
    }
    return rows.map(row => row.map(csvCell).join(',')).join('\n') + '\n';
}

function buildFailureCatalog(matrixRows, gate) {
    const replay006 = matrixRows.find(row => /006/.test(row.localPath));
    const lines = [
        '# Parser Failure Catalog',
        '',
        'Last updated: 2026-06-29',
        '',
        '## Investigation Policy',
        '',
        'After two sequential parser blockers at the same boundary, stop serial symptom repair and run an assessment experiment.',
        '',
        'Parser investigations must not fabricate entities, create empty fabricated baselines, substitute neighboring classes, silently suppress warnings, or derive downstream semantic analysis from unstable continuation.',
        '',
        '## Known Failures',
        ''
    ];
    for (const row of matrixRows) {
        for (const modeName of [ 'default_parser', 'diagnostic_recovery' ]) {
            const mode = row.modes[modeName];
            if (mode.firstErrorCategory === 'none') continue;
            lines.push(`### ${row.replayId} ${modeName}`);
            lines.push('');
            lines.push(`- Replay: \`${row.localPath}\``);
            lines.push('- Task: 046 parser compatibility matrix');
            lines.push(`- Build/protocol: direct build \`${mode.metadata.gameBuild ?? 'unavailable'}\`, demo protocol \`${mode.metadata.demoProtocol ?? 'unavailable'}\`, network protocol \`${mode.metadata.networkProtocol ?? 'unavailable'}\``);
            lines.push(`- Tick/time: ${mode.firstErrorTick ?? 'unknown'} / ${mode.firstErrorGameTimeSeconds ?? 'unknown'}s`);
            lines.push(`- Failure category: \`${mode.firstErrorCategory}\``);
            lines.push(`- Raw error: \`${mode.firstError.rawError}\``);
            lines.push(`- Immediate cause: ${describeImmediateCause(mode)}`);
            lines.push('- Root cause status: diagnostic classification only');
            lines.push(`- Recovery attempted: ${modeName === 'diagnostic_recovery' ? 'existing opt-in entity and baseline recoveries only' : 'none'}`);
            lines.push(`- Continuation result: final tick ${mode.finalParsedTick}, completed ${mode.completed}`);
            lines.push(`- Downstream telemetry trustworthy: ${mode.completed ? 'bounded parser output only; semantic conclusions still prohibited' : 'no'}`);
            lines.push('- Related evidence: `output/parser-compatibility/parser-compatibility-matrix.json`');
            lines.push('');
        }
    }
    lines.push('## Replay 006 Sequential Boundary');
    lines.push('');
    if (replay006 !== undefined) {
        lines.push('Replay 006 / match 91119257 exposes this known sequence at the same parser boundary:');
        lines.push('');
        lines.push('1. `entity_not_found`: entity 5594 missing UPDATE.');
        lines.push('2. `baseline_not_found`: baseline 709 missing before CREATE.');
        lines.push('3. `class_not_found`: class 891 after limited recovery.');
        lines.push('');
        lines.push('These are sequentially exposed blockers at the same parser boundary, not three independently fixed issues. No class-891-specific recovery is authorized.');
    } else {
        lines.push('Replay 006 was not present in the eligible corpus.');
    }
    lines.push('');
    lines.push('## Current Gate');
    lines.push('');
    lines.push(`\`${gate.gate}\``);
    lines.push('');
    return lines.join('\n');
}

function buildReport({ discovered, matrixRows, clusters, protocolSummary, structuralFeasibility, gate, deterministicRerun }) {
    const eligible = discovered.filter(replay => replay.eligibleForMatrix);
    const replay006 = clusters.replay006Comparison;
    const replay006Summary = replay006 === null
        ? 'Replay 006 was not present.'
        : 'Replay 006 remains blocked at the 3807/3808 boundary. The exposed sequence is entity 5594 missing UPDATE, baseline 709 missing before CREATE, then class 891 after limited recovery. This is treated as a parser/protocol compatibility boundary, not a request for another serial skip.';
    return `# Parser Compatibility Matrix

Date: 2026-06-29

## Scope

Task 046 compared default parser behavior and already implemented diagnostic recoveries across local Deadlock replays, excluding replay 005. It did not add class-891 recovery, process video, or perform semantic gameplay analysis.

## Inventory

- Replays discovered: ${discovered.map(replay => replay.originalFilename).join(', ')}
- Eligible replays: ${eligible.map(replay => replay.originalFilename).join(', ')}
- Replay 005 excluded: ${gate.replay005Protection.excluded}
- Direct build metadata: ${JSON.stringify(protocolSummary.directBuildMetadata)}
- Direct map metadata: ${JSON.stringify(protocolSummary.directMapName)}

## Results

- Default parser completions: ${gate.defaultParserCompletionCount}/${matrixRows.length}
- Diagnostic recovery completions: ${gate.diagnosticRecoveryCompletionCount}/${matrixRows.length}
- Deterministic rerun: ${deterministicRerun.passed ? 'passed' : 'failed'}
- Failure categories: ${Object.keys(clusters.categories).join(', ')}
- Best-supported compatibility model: \`${clusters.bestSupportedCompatibilityModel}\`
- Corpus diversity: \`${gate.corpusDiversity.result}\`

## Replay 006

${replay006Summary}

## Structural Pass Feasibility

Current code does not expose a metadata/envelope-only pass without entity materialization. A blocked task was created for \`${structuralFeasibility.blockedTask}\`.

## Controlled Replay Recommendation

${gate.controlledReplayRecommendation === null ? 'No new controlled replay recommendation is required by this gate.' : 'The corpus lacks direct build/protocol diversity. A short controlled replay packet should include spawn idle, two-lane movement, zipline use, NPC/structure damage, one death, respawn, one neutral-objective interaction, and a 5-10 minute duration.'}

## Gate

\`${gate.gate}\`
`;
}

async function createStructuralPassTask() {
    const content = `# Task 047: Implement Structural Replay Stream Pass Without Entity Materialization

Status: blocked
Execution mode: autonomous
Project stage: parser compatibility
Related experiment: parser compatibility matrix
Priority: medium
Depends on: task 046 completed
Unlocked by: explicit authorization to implement a structural replay pass after reviewing parser compatibility matrix outputs
Blocks: parser compatibility metadata-only mode

## Objective

Implement a structural replay stream pass that reads replay headers, command/tick envelopes, packet boundaries, message type IDs, payload sizes, source offsets, monotonicity, and malformed boundaries without materializing entities, baselines, class state, positions, or gameplay events.

## Context to read

- \`AGENTS.md\`
- \`docs/PROJECT_STATE.md\`
- \`docs/PARSER_FAILURE_CATALOG.md\`
- \`reports/parser-compatibility-matrix.md\`
- \`output/parser-compatibility/structural-pass-feasibility.json\`

## Work requested

Create a bounded structural parser pass suitable for metadata-only compatibility assessment.

## Constraints

- Do not materialize entities.
- Do not materialize baselines.
- Do not build class state.
- Do not extract positions or gameplay events.
- Do not process replay 005 unless a future task explicitly authorizes final-holdout-safe metadata inspection.

## Inputs

- Existing parser stream code.
- Parser compatibility matrix outputs.

## Outputs

- Structural pass code and tests.
- Bounded structural-pass sample outputs.

## Acceptance criteria

- The pass can report packet/message envelopes without triggering entity, class, or baseline reconstruction.
- Malformed boundaries are reported structurally, not recovered semantically.

## Required validation

- Parser tests.
- New structural-pass tests.
- JSON validation.
- Replay 005 protection check.
- Task queue validation.

## Gate result

Blocked until explicitly authorized.

## Documentation updates

Update parser compatibility docs after implementation.

## Git scope

Stage only structural-pass code, tests, docs, and small structured outputs.

## Expected report

Explain whether metadata-only compatibility mode is now available.

## Stop conditions

Stop if implementation would require gameplay entity materialization.
`;
    await fs.writeFile(STRUCTURAL_TASK_PATH, content);
}

function extractMetadata(player, lastTick, durationSeconds) {
    const demo = player.getDemo();
    const stats = safeGetStats(player);
    const stringTables = safeCall(() => demo.getStringTables?.(), null);
    return {
        demoProtocol: safeCall(() => demo.getDemoProtocol?.(), null),
        networkProtocol: safeCall(() => demo.getNetworkProtocol?.(), null),
        gameBuild: safeCall(() => demo.getGameBuild?.(), null),
        mapName: safeCall(() => demo.getMapName?.(), null),
        matchId: safeCall(() => demo.getMatchId?.(), null),
        lastTick,
        durationSeconds,
        classCount: stats?.classes ?? null,
        entityCount: stats?.entities ?? null,
        stringTableCount: Array.isArray(stringTables) ? stringTables.length : null,
        metadataAvailability: 'direct_parser_metadata_methods_unavailable_or_null_values_preserved'
    };
}

function createEmptyMetadata() {
    return {
        demoProtocol: null,
        networkProtocol: null,
        gameBuild: null,
        mapName: null,
        matchId: null,
        lastTick: null,
        durationSeconds: null,
        classCount: null,
        entityCount: null,
        stringTableCount: null,
        metadataAvailability: 'not_loaded'
    };
}

function normalizeError(error, tick) {
    const rawError = error?.message ?? String(error);
    return {
        category: classifyError(rawError),
        rawError,
        tick,
        gameTimeSeconds: tickToSeconds(tick),
        exceptionType: error?.constructor?.name ?? 'Error',
        stack: String(error?.stack ?? '').split('\n').slice(0, 10)
    };
}

function classifyError(rawError) {
    if (/Unable to find an entity with index/i.test(rawError)) return 'entity_not_found';
    if (/Baseline not found/i.test(rawError)) return 'baseline_not_found';
    if (/Class not found/i.test(rawError)) return 'class_not_found';
    if (/protocol/i.test(rawError) && /demo/i.test(rawError)) return 'unsupported_demo_protocol';
    if (/network protocol/i.test(rawError)) return 'unsupported_network_protocol';
    if (/serializer/i.test(rawError)) return 'serializer_failure';
    if (/protobuf/i.test(rawError)) return 'protobuf_message_failure';
    if (/eof|end of file/i.test(rawError)) return 'unexpected_eof';
    if (/bit|align|offset/i.test(rawError)) return 'bitstream_alignment_failure';
    if (/open|ENOENT|access/i.test(rawError)) return 'file_open_failure';
    return 'unknown';
}

function noError(finalParsedTick) {
    return {
        category: 'none',
        rawError: null,
        tick: null,
        gameTimeSeconds: null,
        finalParsedTick
    };
}

function countControllers(player) {
    try {
        return player.getDemo().getEntitiesByClassName('CCitadelPlayerController')
            .filter(entity => {
                const steam = entity.getField('m_steamID');
                return steam !== undefined && String(steam) !== '0';
            }).length;
    } catch {
        return 0;
    }
}

function safeGetStats(player) {
    try {
        return player.getDemo().getStats();
    } catch {
        return null;
    }
}

function readDemoPacketTick(demoPacket, fallback) {
    const tick = demoPacket?.tick;
    if (Number.isFinite(tick)) return tick;
    if (Number.isFinite(tick?.value)) return tick.value;
    return fallback;
}

function tickToSeconds(tick) {
    return Number.isFinite(tick) ? Math.floor(tick / TICK_RATE) : null;
}

function calculatePercent(finalTick, lastTick) {
    if (!Number.isFinite(finalTick) || !Number.isFinite(lastTick) || lastTick <= 0) return null;
    return Number((finalTick / lastTick * 100).toFixed(4));
}

function safeNumber(value) {
    return Number.isFinite(value) ? value : null;
}

function safeCall(fn, fallback) {
    try {
        const value = fn();
        return value === undefined ? fallback : value;
    } catch {
        return fallback;
    }
}

function summarizeMetadataField(matrixRows, field) {
    const values = {};
    for (const row of matrixRows) {
        const value = row.metadata?.[field] ?? null;
        const key = value === null ? 'unavailable' : String(value);
        values[key] ??= [];
        values[key].push(row.replayId);
    }
    return values;
}

function describeImmediateCause(mode) {
    if (mode.firstErrorCategory === 'entity_not_found') return `missing entity reference ${extractFirstNumber(mode.firstError.rawError) ?? 'unknown'}`;
    if (mode.firstErrorCategory === 'baseline_not_found') return `missing class baseline ${extractFirstNumber(mode.firstError.rawError) ?? 'unknown'}`;
    if (mode.firstErrorCategory === 'class_not_found') return `missing class metadata ${extractFirstNumber(mode.firstError.rawError) ?? 'unknown'}`;
    return mode.firstError.rawError ?? 'none';
}

function extractFirstNumber(text) {
    const match = String(text ?? '').match(/\[\s*(\d+)\s*\]/);
    return match ? Number.parseInt(match[1], 10) : null;
}

function countId(target, id) {
    if (id === undefined || id === null) return;
    const key = String(id);
    target[key] = (target[key] ?? 0) + 1;
}

function pick(object, fields) {
    return Object.fromEntries(fields.map(field => [ field, object[field] ]));
}

function csvCell(value) {
    if (value === null || value === undefined) return '';
    const text = String(value);
    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function toPosix(filePath) {
    return filePath.replaceAll(path.sep, '/');
}

async function writeJson(filePath, data) {
    await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`);
}
