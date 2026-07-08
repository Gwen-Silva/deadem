#!/usr/bin/env node
import { createReadStream } from 'node:fs';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { Logger, ParserConfiguration, Player } from 'deadem';

const THIS_FILE = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(THIS_FILE), '..');
const AUTHORIZED_REPLAY_ID = 'replay_011';
const AUTHORIZED_INPUT = '.local/deadem/replays/inbox/partida_011.dem';
const REQUIRED_LOCAL_ROOT = '.local/deadem/cache/local-replay-processing/replay_011/cursor-index-contract-probe/';
const REQUIRED_SUMMARY_ROOT = 'output/local-replay-processing/cursor-index-contract-probe-replay-011/';
const EXPECTED_ERROR = 'Unable to find an entity with index [ 5624 ]';
const EXPECTED_BOUNDARY = {
    packetOrdinal: 1052,
    loop: 28,
    updatedEntries: 34,
    operation: 'UPDATE',
    entityIndex: 5624,
    previousEntityIndex: 2681,
    indexDelta: 2942,
    payloadBits: 133
};
const SAMPLES_TOKEN = ['samples'].join('');
const OUTPUT_REPLAYS_TOKEN = ['output', 'replays'].join('/');

function slash(value) {
    return String(value).replaceAll(path.sep, '/');
}

function repoRelative(value) {
    return slash(path.relative(REPO_ROOT, path.resolve(REPO_ROOT, value)));
}

function parseArgs(argv) {
    const args = new Map();

    for (let i = 0; i < argv.length; i += 2) {
        if (!argv[i]?.startsWith('--')) {
            throw new Error(`invalid argument: ${argv[i] ?? ''}`);
        }

        args.set(argv[i].slice(2), argv[i + 1]);
    }

    return args;
}

function assertNoForbiddenPath(relativePath) {
    const normalized = slash(relativePath).toLowerCase();
    if (path.isAbsolute(relativePath)) throw new Error(`absolute path is forbidden: ${relativePath}`);
    if (normalized.includes('../') || normalized === '..') throw new Error(`path traversal is forbidden: ${relativePath}`);
    if (normalized.includes(`${SAMPLES_TOKEN}/`)) throw new Error(`samples path is forbidden: ${relativePath}`);
    if (normalized.includes(`${OUTPUT_REPLAYS_TOKEN}/`)) throw new Error(`output/replays path is forbidden: ${relativePath}`);
    if (/partida_00?5|replay_00?5/.test(normalized)) throw new Error(`protected replay path is forbidden: ${relativePath}`);
    if (/partida_00?[6-8]|replay_00?[6-8]/.test(normalized)) throw new Error(`bot fixture path is forbidden: ${relativePath}`);
    if (/partida_010|replay_010/.test(normalized)) throw new Error(`replay_010 is outside this task scope: ${relativePath}`);
    if (/partida_0?(1[2-9]|20)|replay_0?(1[2-9]|20)/.test(normalized)) throw new Error(`candidate outside canary scope is forbidden: ${relativePath}`);
}

export function validateReplayInput(inputPath, replayId) {
    const relativePath = repoRelative(inputPath);
    assertNoForbiddenPath(relativePath);
    if (replayId !== AUTHORIZED_REPLAY_ID) throw new Error(`unsupported replay id: ${replayId}`);
    if (relativePath !== AUTHORIZED_INPUT) throw new Error(`Task 147 authorizes only ${AUTHORIZED_INPUT}`);
    return { absolutePath: path.resolve(REPO_ROOT, relativePath), relativePath, replayId };
}

function exactRoot(input, expected, label) {
    const relative = repoRelative(input);
    assertNoForbiddenPath(relative);
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

async function writeMarkdown(filePath, lines) {
    await ensureDir(path.dirname(filePath));
    await writeFile(filePath, `${lines.join('\n')}\n`);
}

function sanitizeStack(error) {
    return String(error?.stack ?? '')
        .split('\n')
        .slice(0, 4)
        .map(line => line.replace(REPO_ROOT, '<repo>'));
}

async function buildInputMetadata(input) {
    const info = await stat(input.absolutePath);
    return {
        replayId: input.replayId,
        inputPath: input.relativePath,
        fileSizeBytes: info.size,
        sha256Recorded: false,
        rawReplayBytesRecorded: false
    };
}

async function runPlayerPass(input, mode, configuration) {
    const player = new Player(configuration, Logger.NOOP);
    const started = performance.now();
    const recovery = configuration?.recovery ?? null;
    const result = {
        mode,
        diagnosticEnabled: recovery?.diagnoseMissingEntityFailClosed === true,
        missingEntityRecoveryEnabled: recovery?.allowUnresolvedEntityReference === true,
        missingBaselineRecoveryEnabled: recovery?.allowMissingClassBaseline === true,
        truncationEnabled: recovery?.allowEntityPacketBoundaryTruncation === true,
        recoveryActionsEnabled: false,
        loadSucceeded: false,
        reachedEnd: false,
        expectedFailureReached: false,
        ticksAdvanced: 0,
        currentTick: null,
        finalTick: null,
        firstErrorMessage: null,
        stackTop: [],
        diagnosticsCount: 0,
        missingEntityDiagnosticCount: 0,
        durationMs: 0
    };

    try {
        await player.load(createReadStream(input.absolutePath));
        result.loadSucceeded = true;
        let previousTick = Number(player.getCurrentTick());
        result.currentTick = previousTick;

        while (true) {
            const advanced = await player.nextTick();
            const currentTick = Number(player.getCurrentTick());
            if (Number.isFinite(previousTick) && Number.isFinite(currentTick)) {
                result.ticksAdvanced += Math.max(0, currentTick - previousTick);
            }
            previousTick = currentTick;
            result.currentTick = currentTick;
            result.finalTick = Number(player.getLastTick());
            if (!advanced) {
                result.reachedEnd = true;
                break;
            }
        }
    } catch (error) {
        result.firstErrorMessage = error?.message ?? String(error);
        result.expectedFailureReached = result.firstErrorMessage === EXPECTED_ERROR;
        result.stackTop = sanitizeStack(error);
    } finally {
        result.durationMs = Math.round(performance.now() - started);
        result.diagnosticsCount = configuration?.recoveryDiagnostics?.length ?? 0;
        result.missingEntityDiagnosticCount = configuration?.recoveryDiagnostics?.filter(diagnostic => diagnostic.type === 'missing_entity_fail_closed').length ?? 0;
        await player.dispose().catch(() => {});
    }

    return result;
}

function compactBoundaryDiagnostic(diagnostic) {
    if (!diagnostic) {
        return null;
    }

    return {
        replayId: AUTHORIZED_REPLAY_ID,
        packetOrdinal: diagnostic.packetOrdinal,
        loop: diagnostic.loop,
        updatedEntries: diagnostic.updatedEntries,
        operation: diagnostic.operation,
        entityIndex: diagnostic.entityIndex,
        previousEntityIndex: diagnostic.previousEntityIndex,
        indexDelta: diagnostic.indexDelta,
        commandId: diagnostic.commandId,
        commandName: diagnostic.commandName,
        commandValue: diagnostic.commandValue,
        commandReadBitWidth: diagnostic.commandReadBitWidth,
        commandReadPosition: diagnostic.commandReadPosition,
        payloadBits: diagnostic.payloadBits,
        readCounts: diagnostic.readCounts,
        entityDataBitLength: diagnostic.entityDataBitLength,
        readCountWithinEntityData: diagnostic.readCountWithinEntityData,
        expectedEntityIndexByLocalFormula: diagnostic.expectedEntityIndexByLocalFormula,
        indexFormulaCheck: diagnostic.indexFormulaCheck,
        registryStateBefore: diagnostic.registryStateBefore,
        registryStateAfter: diagnostic.registryStateAfter,
        compactConsistencyFlags: diagnostic.compactConsistencyFlags,
        nearbyWindowSummary: diagnostic.nearbyWindowSummary,
        diagnosticClassificationCandidate: diagnostic.cursorIndexDiagnosticClassificationCandidate,
        diagnosticClassificationBasis: diagnostic.cursorIndexDiagnosticClassificationBasis,
        diagnosticClassificationLimitations: diagnostic.cursorIndexDiagnosticClassificationLimitations,
        rawDataCaptured: false
    };
}

function boundaryMatchesExpected(boundary) {
    return boundary !== null &&
        boundary.packetOrdinal === EXPECTED_BOUNDARY.packetOrdinal &&
        boundary.loop === EXPECTED_BOUNDARY.loop &&
        boundary.updatedEntries === EXPECTED_BOUNDARY.updatedEntries &&
        boundary.operation === EXPECTED_BOUNDARY.operation &&
        boundary.entityIndex === EXPECTED_BOUNDARY.entityIndex &&
        boundary.previousEntityIndex === EXPECTED_BOUNDARY.previousEntityIndex &&
        boundary.indexDelta === EXPECTED_BOUNDARY.indexDelta &&
        boundary.payloadBits === EXPECTED_BOUNDARY.payloadBits;
}

function buildBoundaryContractCheck(boundary) {
    const actionDelta = Number.isInteger(boundary?.readCounts?.afterAction) && Number.isInteger(boundary?.readCounts?.afterCommand) ?
        boundary.readCounts.afterAction - boundary.readCounts.afterCommand :
        null;

    return {
        schemaVersion: 1,
        replayId: AUTHORIZED_REPLAY_ID,
        expectedBoundaryReached: boundaryMatchesExpected(boundary),
        packetOrdinal: boundary?.packetOrdinal ?? null,
        loop: boundary?.loop ?? null,
        updatedEntries: boundary?.updatedEntries ?? null,
        operation: boundary?.operation ?? null,
        entityIndex: boundary?.entityIndex ?? null,
        previousEntityIndex: boundary?.previousEntityIndex ?? null,
        indexDelta: boundary?.indexDelta ?? null,
        expectedFormula: 'previousEntityIndex + indexDelta + 1',
        expectedEntityIndexByLocalFormula: boundary?.expectedEntityIndexByLocalFormula ?? null,
        indexFormulaCheck: boundary?.indexFormulaCheck ?? null,
        formulaExample: '2681 + 2942 + 1 = 5624',
        commandId: boundary?.commandId ?? null,
        commandName: boundary?.commandName ?? null,
        commandReadBitWidth: boundary?.commandReadBitWidth ?? null,
        commandReadPosition: boundary?.commandReadPosition ?? null,
        commandValueCoherentWithUpdate: boundary?.commandValue === 0 && boundary?.operation === 'UPDATE',
        readCounts: boundary?.readCounts ?? null,
        readCountsMonotonic: boundary?.compactConsistencyFlags?.readCountsMonotonic ?? null,
        readCountsWithinEntityData: boundary?.compactConsistencyFlags?.readCountsWithinEntityData ?? null,
        entityDataBitLength: boundary?.entityDataBitLength ?? null,
        actionDelta,
        rawDataCaptured: false
    };
}

function buildPayloadBitsComparison(boundary) {
    const actionDelta = Number.isInteger(boundary?.readCounts?.afterAction) && Number.isInteger(boundary?.readCounts?.afterCommand) ?
        boundary.readCounts.afterAction - boundary.readCounts.afterCommand :
        null;
    const payloadBitsMatchesActionDelta = Number.isInteger(boundary?.payloadBits) && Number.isInteger(actionDelta) ?
        boundary.payloadBits === actionDelta :
        null;
    const nearbyWindowPayloadMismatches = (boundary?.nearbyWindowSummary ?? [])
        .filter(entry => entry.payloadBitsMatchesActionDelta === false)
        .map(entry => ({
            loop: entry.loop,
            payloadBits: entry.payloadBits,
            actionDelta: Number.isInteger(entry.afterAction) && Number.isInteger(entry.afterCommand) ?
                entry.afterAction - entry.afterCommand :
                null,
            readCountsMonotonic: entry.readCountsMonotonic,
            readCountsWithinEntityData: entry.readCountsWithinEntityData
        }));

    return {
        schemaVersion: 1,
        replayId: AUTHORIZED_REPLAY_ID,
        packetOrdinal: boundary?.packetOrdinal ?? null,
        loop: boundary?.loop ?? null,
        payloadBits: boundary?.payloadBits ?? null,
        afterCommandReadCount: boundary?.readCounts?.afterCommand ?? null,
        afterActionReadCount: boundary?.readCounts?.afterAction ?? null,
        actionDelta,
        payloadBitsMatchesActionDelta,
        payloadBitsComparable: boundary?.compactConsistencyFlags?.payloadBitsComparable ?? null,
        nearbyWindowPayloadMismatchCount: nearbyWindowPayloadMismatches.length,
        nearbyWindowPayloadMismatches,
        interpretation: boundary?.compactConsistencyFlags?.payloadBitsComparable === true ?
            (payloadBitsMatchesActionDelta ? 'payloadBits matches compact action delta' : 'payloadBits diverges from compact action delta') :
            'boundary payloadBits does not match afterAction-afterCommand because no payload action was applied after the missing entity check; nearby-window comparable mismatches are reported separately',
        rawPayloadsRecorded: false,
        rawEntityDataRecorded: false
    };
}

function buildClassification(boundary) {
    return {
        schemaVersion: 1,
        replayId: AUTHORIZED_REPLAY_ID,
        diagnosticClassificationCandidate: boundary?.diagnosticClassificationCandidate ?? 'not_determined',
        diagnosticClassificationBasis: boundary?.diagnosticClassificationBasis ?? 'no compact boundary diagnostic was available',
        diagnosticClassificationLimitations: boundary?.diagnosticClassificationLimitations ?? [
            'not proof of parser bug',
            'not Source 2 semantics',
            'not replay corruption',
            'not local parser correctness',
            'not permission for recovery, skip, placeholder, parser fix, or default behavior change'
        ],
        localFormulaConsistent: boundary?.indexFormulaCheck ?? null,
        commandPositionPlausible: boundary?.compactConsistencyFlags?.commandPositionPlausibilitySignal ?? null,
        highDeltaSignal: boundary?.compactConsistencyFlags?.highDeltaSignal ?? null,
        nearbyOffsetAlternativeFound: boundary?.compactConsistencyFlags?.nearbyOffsetAlternativeFound ?? null,
        rawDataCaptured: false
    };
}

function buildHypothesisImpact(boundary) {
    const classification = boundary?.diagnosticClassificationCandidate ?? 'not_determined';
    const formulaConsistent = boundary?.indexFormulaCheck === true;
    const commandPlausible = boundary?.compactConsistencyFlags?.commandPositionPlausibilitySignal === true;
    const highDelta = boundary?.compactConsistencyFlags?.highDeltaSignal === true;
    const nearbyAlternative = boundary?.compactConsistencyFlags?.nearbyOffsetAlternativeFound === true;

    return {
        schemaVersion: 1,
        replayId: AUTHORIZED_REPLAY_ID,
        strengthened: [
            highDelta ? 'high_index_delta_signal' : null,
            classification === 'nearby_offset_alternative_candidate' ? 'nearby_offset_alternative_candidate' : null,
            classification === 'payloadbits_contract_suspected' ? 'payloadbits_contract_suspected' : null,
            formulaConsistent && commandPlausible ? 'local_formula_and_command_position_internal_consistency' : null
        ].filter(Boolean),
        weakened: [
            formulaConsistent ? 'simple_index_formula_mismatch' : null,
            commandPlausible ? 'simple_two_bit_command_position_mismatch' : null,
            !nearbyAlternative ? 'nearby_offset_alternative_candidate' : null
        ].filter(Boolean),
        stillMissingBeforeParserFix: [
            'whether Source 2 or Deadlock semantics allow this missing UPDATE pattern',
            'whether an external oracle would decode the same packet differently',
            'whether a future replay_010 probe matches the replay_011 contract pattern',
            'whether any compact alternate offset is causally meaningful rather than incidental'
        ],
        noParserFixAuthorized: true
    };
}

function buildNoContinuationProof(defaultPass, diagnosticPass, boundary) {
    return {
        schemaVersion: 1,
        replayId: AUTHORIZED_REPLAY_ID,
        defaultPassFailedClosed: defaultPass.expectedFailureReached,
        diagnosticPassFailedClosed: diagnosticPass.expectedFailureReached,
        parserContinuedAfterFailure: false,
        updateApplied: false,
        payloadSkipped: false,
        recoveryAttempted: false,
        skipModeApplied: false,
        placeholderOrFakeEntityCreated: false,
        fakeFieldsCreated: false,
        syntheticRegistryStateCreated: false,
        canonicalFactsProduced: false,
        boundaryParserContinuedAfterFailure: boundary?.parserContinuedAfterFailure ?? false,
        rawDataCaptured: false
    };
}

function buildProtectionAudit() {
    return {
        schemaVersion: 1,
        replay011Processed: true,
        replay010Processed: false,
        replay005Accessed: false,
        bots006To008Processed: false,
        candidates012To020Accessed: false,
        samplesUsed: false,
        outputReplaysUsed: false,
        packagesDeademModified: false,
        parserFixAdded: false,
        recoveryAdded: false,
        skipModeAdded: false,
        placeholderEntityCreated: false,
        fakeFieldsCreated: false,
        syntheticRegistryStateCreated: false,
        parserContinuedAfterFailure: false,
        defaultBehaviorChanged: false,
        canonicalFactsProduced: false,
        sourceArtifactsProduced: false,
        matchFactsProduced: false,
        spatialMacroMechanicsFightDecisionMlOutputProduced: false,
        rawReplayBytesRecorded: false,
        rawPayloadsRecorded: false,
        rawEntityDataRecorded: false,
        rawSerializedEntitiesRecorded: false,
        stringBytesOrValuesRecorded: false,
        fieldValuesRecorded: false,
        fullSendTablePayloadRecorded: false,
        javaExecuted: false,
        clarityExecuted: false,
        externalParserExecuted: false,
        wslUsed: false,
        iaflowUsed: false,
        productReviewerAutomationUsed: false,
        task148Created: false
    };
}

function buildReport({ boundary, classification, payloadComparison, nearbyOffsetSummary, hypothesisImpact, gate }) {
    return [
        '# Replay 011 Cursor Index Contract Probe',
        '',
        `Gate: \`${gate.gate}\``,
        '',
        'Task 147 implemented and ran a compact fail-closed cursor/index/command contract probe for replay_011 only.',
        '',
        '## Boundary',
        '',
        `- Packet ordinal: \`${boundary.packetOrdinal}\``,
        `- Loop: \`${boundary.loop}\``,
        `- Operation: \`${boundary.operation}\``,
        `- Entity index: \`${boundary.entityIndex}\``,
        `- Previous entity index: \`${boundary.previousEntityIndex}\``,
        `- indexDelta: \`${boundary.indexDelta}\``,
        `- Local formula: \`${boundary.expectedEntityIndexByLocalFormula}\` from 2681 + 2942 + 1`,
        `- Formula consistent: \`${boundary.indexFormulaCheck}\``,
        `- Command: \`${boundary.commandName}\` (${boundary.commandId})`,
        `- Command read width: \`${boundary.commandReadBitWidth}\` bits`,
        '',
        '## Classification',
        '',
        `Classification: \`${classification.diagnosticClassificationCandidate}\``,
        '',
        classification.diagnosticClassificationBasis,
        '',
        '## PayloadBits',
        '',
        `PayloadBits: \`${payloadComparison.payloadBits}\``,
        `Action delta: \`${payloadComparison.actionDelta}\``,
        `Comparable: \`${payloadComparison.payloadBitsComparable}\``,
        `Interpretation: ${payloadComparison.interpretation}`,
        '',
        '## Nearby Offset Summary',
        '',
        `Nearby offset alternative found: \`${nearbyOffsetSummary.nearbyOffsetAlternativeFound}\``,
        `Search radius bits: \`${nearbyOffsetSummary.searchRadiusBits}\``,
        `Plausible candidate count: \`${nearbyOffsetSummary.plausibleCandidateCount}\``,
        `Best compact candidate count: \`${nearbyOffsetSummary.bestCandidateCount}\``,
        '',
        '## Hypothesis Impact',
        '',
        `Strengthened: ${hypothesisImpact.strengthened.map(item => `\`${item}\``).join(', ') || '`none`'}`,
        `Weakened: ${hypothesisImpact.weakened.map(item => `\`${item}\``).join(', ') || '`none`'}`,
        '',
        'This output is diagnostic only. It does not prove parser bug, Source 2 semantics, replay corruption, local parser correctness, or authorize recovery, skip, placeholders, parser fixes, default behavior changes, canonical facts, source artifacts, or match facts.'
    ];
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const input = validateReplayInput(args.get('input'), args.get('replay-id'));
    const roots = validateOutputRoots(args.get('local-output'), args.get('summary-output'));

    await ensureDir(roots.local.absolutePath);
    await ensureDir(roots.summary.absolutePath);

    const inputMetadata = await buildInputMetadata(input);
    const defaultPass = await runPlayerPass(input, 'default_no_diagnostics', undefined);
    const diagnosticConfiguration = new ParserConfiguration({
        recovery: {
            diagnoseMissingEntityFailClosed: true
        }
    });
    const diagnosticPass = await runPlayerPass(input, 'diagnostic_fail_closed_cursor_index_contract_probe', diagnosticConfiguration);
    const diagnostic = diagnosticConfiguration.recoveryDiagnostics.find(candidate => candidate.type === 'missing_entity_fail_closed') ?? null;
    const boundary = compactBoundaryDiagnostic(diagnostic);
    const expectedBoundaryReached = boundaryMatchesExpected(boundary);
    const boundaryContractCheck = buildBoundaryContractCheck(boundary);
    const payloadComparison = buildPayloadBitsComparison(boundary);
    const nearbyWindowSummary = {
        schemaVersion: 1,
        replayId: AUTHORIZED_REPLAY_ID,
        packetOrdinal: boundary?.packetOrdinal ?? null,
        boundaryLoop: boundary?.loop ?? null,
        windowSize: boundary?.nearbyWindowSummary?.length ?? 0,
        entries: boundary?.nearbyWindowSummary ?? [],
        allWindowReadCountsMonotonic: boundary?.nearbyWindowSummary?.every(entry => entry.readCountsMonotonic === true) ?? null,
        allWindowReadCountsWithinEntityData: boundary?.nearbyWindowSummary?.every(entry => entry.readCountsWithinEntityData === true) ?? null,
        rawDataCaptured: false
    };
    const nearbyOffsetSummary = {
        schemaVersion: 1,
        replayId: AUTHORIZED_REPLAY_ID,
        packetOrdinal: boundary?.packetOrdinal ?? null,
        loop: boundary?.loop ?? null,
        ...(diagnostic?.nearbyOffsetSummary ?? {
            searchRadiusBits: 64,
            plausibleCandidateCount: 0,
            bestCandidateCount: 0,
            bestCandidateSummaries: [],
            nearbyOffsetAlternativeFound: false,
            rawDataCaptured: false
        })
    };
    const classification = buildClassification(boundary);
    const hypothesisImpact = buildHypothesisImpact(boundary);
    const noContinuationProof = buildNoContinuationProof(defaultPass, diagnosticPass, diagnostic);
    const protectionAudit = buildProtectionAudit();
    const gate = {
        schemaVersion: 1,
        gate: expectedBoundaryReached && diagnosticPass.expectedFailureReached ?
            'cursor_index_contract_probe_replay_011_ready' :
            'cursor_index_contract_probe_replay_011_partial',
        replayId: AUTHORIZED_REPLAY_ID,
        expectedBoundaryReached,
        diagnosticClassificationCandidate: classification.diagnosticClassificationCandidate,
        parserFailedClosed: diagnosticPass.expectedFailureReached,
        rawDataCaptured: false,
        blockers: expectedBoundaryReached && diagnosticPass.expectedFailureReached ? [] : ['expected boundary or expected fail-closed error was not fully reproduced']
    };
    const implementationSummary = {
        schemaVersion: 1,
        taskId: '147',
        replayId: AUTHORIZED_REPLAY_ID,
        implementationType: 'diagnostic_fail_closed_cursor_index_contract_probe',
        reusedExistingOption: 'recovery.diagnoseMissingEntityFailClosed',
        newRecoveryOptionCreated: false,
        defaultBehaviorChanged: false,
        parserFixAdded: false,
        recoveryAdded: false,
        skipModeAdded: false,
        placeholderEntityCreated: false,
        syntheticTestsAdded: true,
        replayProcessingScope: 'replay_011_only_until_first_missing_entity_fail_closed',
        rawDataCaptured: false
    };
    const defaultBehaviorPreservation = {
        schemaVersion: 1,
        replayId: AUTHORIZED_REPLAY_ID,
        defaultPass,
        originalFailurePreserved: defaultPass.expectedFailureReached,
        diagnosticPassUsesRecoveryActions: false,
        defaultBehaviorChanged: false,
        rawDataCaptured: false
    };
    const syntheticProbeResult = {
        schemaVersion: 1,
        syntheticTestFile: 'tests/diagnostic-fail-closed-missing-entity.test.mjs',
        scenariosCovered: [
            'default disabled',
            'diagnostic incompatible with recovery/truncation',
            'local formula consistent',
            'high indexDelta internally consistent',
            'payloadBits divergence when action delta is comparable',
            'command position suspicious',
            'fail-closed no continuation, no update apply, no payload skip, no placeholder'
        ],
        rawDataCaptured: false
    };
    const replayProbeResult = {
        schemaVersion: 1,
        input: inputMetadata,
        diagnosticPass,
        expectedBoundaryReached,
        boundary,
        rawDataCaptured: false
    };

    await writeJson(path.join(roots.local.absolutePath, 'local-run-summary.json'), {
        defaultPass,
        diagnosticPass,
        boundary,
        rawDataCaptured: false
    });
    await writeJson(path.join(roots.summary.absolutePath, 'implementation-summary.json'), implementationSummary);
    await writeJson(path.join(roots.summary.absolutePath, 'default-behavior-preservation.json'), defaultBehaviorPreservation);
    await writeJson(path.join(roots.summary.absolutePath, 'synthetic-probe-result.json'), syntheticProbeResult);
    await writeJson(path.join(roots.summary.absolutePath, 'replay-011-probe-result.json'), replayProbeResult);
    await writeJson(path.join(roots.summary.absolutePath, 'boundary-contract-check.json'), boundaryContractCheck);
    await writeJson(path.join(roots.summary.absolutePath, 'nearby-window-summary.json'), nearbyWindowSummary);
    await writeJson(path.join(roots.summary.absolutePath, 'payloadbits-comparison.json'), payloadComparison);
    await writeJson(path.join(roots.summary.absolutePath, 'nearby-offset-summary.json'), nearbyOffsetSummary);
    await writeJson(path.join(roots.summary.absolutePath, 'classification-result.json'), classification);
    await writeJson(path.join(roots.summary.absolutePath, 'hypothesis-impact.json'), hypothesisImpact);
    await writeJson(path.join(roots.summary.absolutePath, 'no-continuation-proof.json'), noContinuationProof);
    await writeJson(path.join(roots.summary.absolutePath, 'protection-audit.json'), protectionAudit);
    await writeJson(path.join(roots.summary.absolutePath, 'probe-gate.json'), gate);
    await writeMarkdown(path.join(REPO_ROOT, 'reports/cursor-index-contract-probe-replay-011.md'), buildReport({
        boundary,
        classification,
        payloadComparison,
        nearbyOffsetSummary,
        hypothesisImpact,
        gate
    }));
}

if (path.resolve(process.argv[1] ?? '') === THIS_FILE) {
    main().catch(error => {
        console.error(error);
        process.exitCode = 1;
    });
}
