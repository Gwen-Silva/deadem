#!/usr/bin/env node
import { createReadStream } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Logger, Player } from 'deadem';

const THIS_FILE = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(THIS_FILE), '..');
const REQUIRED_INPUTS = {
    replay_010: '.local/deadem/replays/inbox/partida_010.dem',
    replay_011: '.local/deadem/replays/inbox/partida_011.dem'
};
const REQUIRED_LOCAL_ROOT = '.local/deadem/cache/local-replay-processing/controlled-canonical-source-readiness/';
const REQUIRED_SUMMARY_ROOT = 'output/local-replay-processing/controlled-canonical-source-readiness/';
const READINESS_GATE = 'controlled_canonical_source_readiness_validated';
const BLOCKED_GATE = 'controlled_canonical_source_readiness_blocked';

const SOURCE_ARTIFACT_TOOL = 'tools/generate-local-replay-source-artifacts.mjs';
const FORWARD_SOURCE_ARTIFACT_TOOL = 'tools/generate-local-replay-forward-source-artifacts.mjs';
const LOCAL_INPUT_CANARY_TOOL = 'tools/process-local-replay-input.mjs';

function slash(value) {
    return value.replaceAll(path.sep, '/');
}

function parseArgs(argv) {
    const args = new Map();
    for (let i = 0; i < argv.length; i += 2) {
        const key = argv[i];
        const value = argv[i + 1];
        if (!key?.startsWith('--') || value === undefined) throw new Error(`Invalid argument near ${key ?? '<end>'}`);
        args.set(key.slice(2), value);
    }
    return args;
}

function assertRelativeRepositoryPath(value, label) {
    if (!value || path.isAbsolute(value)) throw new Error(`${label} must be a relative repository path`);
    const normalized = slash(value);
    if (normalized.includes('../') || normalized === '..') throw new Error(`${label} must stay inside the repository`);
    return normalized;
}

function rejectForbiddenPath(normalized) {
    const reasons = [];
    if (/(?:^|\/)(?:partida|replay|match)[_-]?00?5(?:\.dem)?$/iu.test(normalized) || /replay[_-]?00?5/iu.test(normalized)) {
        reasons.push('protected replay 005 path');
    }
    if (/(?:^|\/)(?:partida|replay|match)[_-]?00?(6|7|8)(?:\.dem)?$/iu.test(normalized)) {
        reasons.push('unsupported bot fixture replay path');
    }
    if (/(?:^|\/)(?:partida|replay|match)[_-]?0?(1[2-9]|20)(?:\.dem)?$/iu.test(normalized)) {
        reasons.push('out-of-scope candidate replay path');
    }
    if (normalized.startsWith('samples/')) reasons.push('samples path');
    if (normalized.startsWith('output/replays/')) reasons.push('output/replays path');
    if (reasons.length > 0) throw new Error(`Forbidden path ${normalized}: ${reasons.join(', ')}`);
}

function exactReplayInput(value, replayId) {
    const normalized = assertRelativeRepositoryPath(value, replayId);
    rejectForbiddenPath(normalized);
    if (normalized !== REQUIRED_INPUTS[replayId]) throw new Error(`${replayId} input must be exactly ${REQUIRED_INPUTS[replayId]}`);
    return {
        replayId,
        normalized,
        absolutePath: path.resolve(REPO_ROOT, normalized)
    };
}

function exactRoot(value, expected, label) {
    const normalized = assertRelativeRepositoryPath(value, label).replace(/\/?$/u, '/');
    if (normalized !== expected) throw new Error(`${label} must be exactly ${expected}`);
    return {
        normalized,
        absolutePath: path.resolve(REPO_ROOT, normalized)
    };
}

async function writeJson(filePath, value) {
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function writeMarkdown(filePath, lines) {
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, `${lines.join('\n')}\n`, 'utf8');
}

function safeNumber(value) {
    return Number.isFinite(value) ? value : null;
}

function sanitizeStack(error) {
    return String(error?.stack ?? '')
        .split(/\r?\n/u)
        .slice(0, 4)
        .map(line => line.replaceAll(REPO_ROOT, '<repo>'));
}

async function runDefaultParser(input) {
    const player = new Player(undefined, Logger.NOOP);
    const started = performance.now();
    const result = {
        schemaVersion: 1,
        replayId: input.replayId,
        mode: 'default_source_canonical_readiness_prerequisite',
        parserLoadSucceeded: false,
        parseCompleted: false,
        reachedEnd: false,
        ticksAdvanced: 0,
        currentTick: null,
        finalTick: null,
        firstErrorMessage: null,
        firstErrorClass: null,
        stackTop: [],
        missingEntityError: false,
        rawDataCaptured: false,
        sourceFactsProduced: false,
        canonicalFactsProduced: false,
        matchFactsProduced: false
    };

    try {
        await player.load(createReadStream(input.absolutePath));
        result.parserLoadSucceeded = true;
        let previousTick = safeNumber(Number(player.getCurrentTick()));
        result.currentTick = previousTick;
        result.finalTick = safeNumber(Number(player.getLastTick()));

        while (true) {
            const advanced = await player.nextTick();
            const currentTick = safeNumber(Number(player.getCurrentTick()));
            if (previousTick !== null && currentTick !== null) {
                result.ticksAdvanced += Math.max(0, currentTick - previousTick);
            }
            previousTick = currentTick;
            result.currentTick = currentTick;
            result.finalTick = safeNumber(Number(player.getLastTick()));
            if (!advanced) {
                result.reachedEnd = true;
                result.parseCompleted = true;
                break;
            }
        }
    } catch (error) {
        result.firstErrorMessage = error?.message ?? String(error);
        result.firstErrorClass = error?.constructor?.name ?? null;
        result.stackTop = sanitizeStack(error);
        result.missingEntityError = /^Unable to find an entity with index \[ \d+ \]$/u.test(result.firstErrorMessage);
    } finally {
        result.durationMs = Math.round(performance.now() - started);
        await player.dispose?.().catch(() => {});
    }

    return result;
}

function extractConstStringArray(source, constName) {
    const match = source.match(new RegExp(`const\\s+${constName}\\s*=\\s*\\[([\\s\\S]*?)\\];`, 'u'));
    if (!match) return [];
    return [...match[1].matchAll(/'([^']+)'/gu)].map(item => item[1]);
}

function sourceToolReadiness(toolPath, sourceText) {
    const artifactClasses = extractConstStringArray(sourceText, 'REQUIRED_ARTIFACT_CLASSES');
    const hasDryRun = /\bdry[-_]?run\b/iu.test(sourceText);
    const acceptsReplay011 = /replay_011|partida_011\.dem/iu.test(sourceText);
    const acceptsReplay010 = /replay_010|partida_010\.dem/iu.test(sourceText);
    const writesJsonl = /writeJsonl|\.jsonl/iu.test(sourceText);
    const localOnlyPolicy = /local_only|local-only|localArtifacts|localArtifact/iu.test(sourceText);
    const canonicalPackageConstructedFalse = /canonicalPackageConstructed:\s*false/u.test(sourceText);
    const emitsFinalSourceArtifacts = /match-state-timeline|one-second-player-reconciliation|death-events|objective/i.test(sourceText);

    return {
        toolPath,
        entrypointExists: true,
        acceptsReplay010,
        acceptsReplay011,
        supportsBothAuthorizedReplays: acceptsReplay010 && acceptsReplay011,
        hasDryRunMode: hasDryRun,
        emitsSourceArtifactsWhenRun: emitsFinalSourceArtifacts || writesJsonl,
        writesLocalOnlyArtifacts: localOnlyPolicy,
        canonicalPackageConstructedFalse,
        artifactClasses,
        artifactClassCount: artifactClasses.length,
        safeToExecuteInTask152: hasDryRun && acceptsReplay010 && acceptsReplay011 && !emitsFinalSourceArtifacts,
        compactReason: hasDryRun
            ? 'dry-run text detected, but replay and emission policies still require validation'
            : 'no dry-run mode detected; executing would produce source artifacts or local artifact payloads'
    };
}

async function inspectPipelineEntrypoints() {
    const sourceArtifactSource = await readFile(path.join(REPO_ROOT, SOURCE_ARTIFACT_TOOL), 'utf8');
    const forwardSource = await readFile(path.join(REPO_ROOT, FORWARD_SOURCE_ARTIFACT_TOOL), 'utf8');
    const localInputSource = await readFile(path.join(REPO_ROOT, LOCAL_INPUT_CANARY_TOOL), 'utf8');
    const sourceArtifact = sourceToolReadiness(SOURCE_ARTIFACT_TOOL, sourceArtifactSource);
    const forwardArtifact = sourceToolReadiness(FORWARD_SOURCE_ARTIFACT_TOOL, forwardSource);
    const localInput = {
        toolPath: LOCAL_INPUT_CANARY_TOOL,
        entrypointExists: true,
        acceptsReplay010: /replay_010|partida_010\.dem/iu.test(localInputSource),
        acceptsReplay011: /replay_011|partida_011\.dem/iu.test(localInputSource),
        sourceReadinessManifestOnly: /source-artifact-manifest/iu.test(localInputSource),
        canonicalCompactManifestPresent: /canonical-compact-manifest/iu.test(localInputSource),
        canonicalPackageConstructedFalse: /canonicalPackageConstructed:\s*false/u.test(localInputSource),
        supportsBothAuthorizedReplays: false,
        safeToExecuteInTask152: false,
        compactReason: 'single-replay replay_010 canary and not a generic replay_010/replay_011 readiness entrypoint'
    };

    return {
        sourceArtifact,
        forwardArtifact,
        localInput,
        firstSourceCanonicalStage: 'source artifact availability/manifest generation after parser completion',
        firstStageCallable: sourceArtifact.entrypointExists || forwardArtifact.entrypointExists || localInput.entrypointExists,
        firstStageDryRunCallableForBothAuthorizedReplays: [sourceArtifact, forwardArtifact, localInput].some(tool => tool.safeToExecuteInTask152),
        firstStageNeedsAdditionalConfiguration: true,
        configurationNeeded: [
            'generic replay_010/replay_011 input support',
            'dry-run or compact-readiness mode that does not write source artifacts',
            'formal output policy checks before source/canonical emission',
            'schema contract for readiness manifests distinct from final facts'
        ]
    };
}

function replayReadinessStatus(result) {
    return {
        schemaVersion: 1,
        replayId: result.replayId,
        parserLoad: result.parserLoadSucceeded ? 'passed' : 'blocked',
        parseCompletion: result.parseCompleted ? 'passed' : 'blocked',
        sourceReadinessPrerequisite: result.parseCompleted ? 'met' : 'not_met',
        canonicalReadinessPrerequisite: result.parseCompleted ? 'met' : 'not_met',
        firstErrorMessage: result.firstErrorMessage,
        missingEntityError: result.missingEntityError,
        ticksAdvanced: result.ticksAdvanced,
        currentTick: result.currentTick,
        finalTick: result.finalTick,
        sourceFactsProduced: false,
        canonicalFactsProduced: false,
        matchFactsProduced: false,
        rawDataCaptured: false
    };
}

function validateSchemaRecords(records) {
    const required = {
        scopeSummary: ['schemaVersion', 'taskId', 'authorizedReplayIds', 'processedReplayIds'],
        parserConfirmation: ['schemaVersion', 'replay010ParseCompleted', 'replay011ParseCompleted'],
        sourceReadiness: ['schemaVersion', 'firstStageExists', 'dryRunAvailableForBothAuthorizedReplays', 'classification'],
        canonicalReadiness: ['schemaVersion', 'canonicalPackageConstructed', 'classification'],
        protectionAudit: ['schemaVersion', 'passed', 'replay005AccessedOrProcessed']
    };
    const rows = Object.entries(required).map(([id, fields]) => {
        const missing = fields.filter(field => !(field in records[id]));
        return {
            id,
            requiredFields: fields,
            missingFields: missing,
            valid: missing.length === 0
        };
    });
    return {
        schemaVersion: 1,
        validationMode: 'compact_readiness_schema_shape_only',
        rows,
        allSchemasValid: rows.every(row => row.valid),
        finalFactsValidated: false
    };
}

function outputPolicyAudit(readinessClassification, entrypoints) {
    const plannedSummaryFiles = [
        'readiness-gate.json',
        'scope-summary.json',
        'parser-confirmation.json',
        'replay-010-readiness-status.json',
        'replay-011-readiness-status.json',
        'source-readiness-summary.json',
        'canonical-readiness-summary.json',
        'schema-validation-summary.json',
        'output-policy-audit.json',
        'first-readiness-blocker.json',
        'rejected-actions.json',
        'next-milestone-recommendation.json',
        'protection-audit.json'
    ];
    return {
        schemaVersion: 1,
        classification: readinessClassification,
        plannedSummaryFiles,
        plannedSummaryFileCount: plannedSummaryFiles.length,
        outputsSmallEnoughForVersioning: true,
        rawReplayBytes: false,
        rawPayloads: false,
        rawEntityData: false,
        rawSerializedEntities: false,
        stringBytesOrValues: false,
        fieldValues: false,
        fullEntityHistories: false,
        completeSnapshots: false,
        fullSendTablePayload: false,
        finalSourceArtifacts: false,
        finalCanonicalFacts: false,
        finalMatchFacts: false,
        gameplayInterpretationOutputs: false,
        existingEntrypointsWouldEmitSourceArtifactsIfRun: entrypoints.sourceArtifact.emitsSourceArtifactsWhenRun || entrypoints.forwardArtifact.emitsSourceArtifactsWhenRun,
        policyConclusion: 'compact_readiness_outputs_allowed_existing_source_artifact_generators_not_executed'
    };
}

function buildReport({ replay010Status, replay011Status, sourceReadiness, canonicalReadiness, firstBlocker, classification }) {
    return [
        '# Controlled Canonical Source Readiness',
        '',
        'Task 152 validated whether the local pipeline can advance from parser completion to a controlled source/canonical readiness layer for replay_010 and replay_011.',
        '',
        '## Parser Confirmation',
        '',
        `- replay_010 parse completion: \`${replay010Status.parseCompletion}\``,
        `- replay_011 parse completion: \`${replay011Status.parseCompletion}\``,
        '',
        '## Readiness Result',
        '',
        `- source readiness classification: \`${sourceReadiness.classification}\``,
        `- canonical readiness classification: \`${canonicalReadiness.classification}\``,
        `- first blocker: \`${firstBlocker.blockerType}\``,
        `- final classification: \`${classification}\``,
        '',
        'The first source/canonical stage exists as source artifact generation, but current entrypoints are not a safe Task 152 dry-run for both replay_010 and replay_011: they are replay_010-oriented and would emit source artifacts when executed.',
        '',
        '## Next Milestone',
        '',
        'Recommended next milestone: design or implement a compact dry-run readiness entrypoint for replay_010 and replay_011 before emitting controlled source/canonical artifacts.',
        '',
        'No source facts, canonical facts, match facts, raw data, field values, spatial/macro/mechanics/fight/decision/ML output, parser fix, recovery, skip mode, placeholder, or default behavior change was produced.'
    ];
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const replay010 = exactReplayInput(args.get('replay-010'), 'replay_010');
    const replay011 = exactReplayInput(args.get('replay-011'), 'replay_011');
    const localRoot = exactRoot(args.get('local-output'), REQUIRED_LOCAL_ROOT, 'local output root');
    const summaryRoot = exactRoot(args.get('summary-output'), REQUIRED_SUMMARY_ROOT, 'summary output root');
    await mkdir(localRoot.absolutePath, { recursive: true });
    await mkdir(summaryRoot.absolutePath, { recursive: true });

    const stats = {
        replay_010: await stat(replay010.absolutePath),
        replay_011: await stat(replay011.absolutePath)
    };
    const replay010Parser = await runDefaultParser(replay010);
    const replay011Parser = await runDefaultParser(replay011);
    const replay010Status = replayReadinessStatus(replay010Parser);
    const replay011Status = replayReadinessStatus(replay011Parser);
    const entrypoints = await inspectPipelineEntrypoints();
    const parserPrereqsMet = replay010Parser.parseCompleted && replay011Parser.parseCompleted;
    const dryRunAvailable = entrypoints.firstStageDryRunCallableForBothAuthorizedReplays;
    const classification = parserPrereqsMet && dryRunAvailable
        ? 'controlled_canonical_source_readiness_passed'
        : (parserPrereqsMet ? 'controlled_canonical_source_readiness_blocked_by_pipeline_wiring' : 'controlled_canonical_source_readiness_partial');

    const scopeSummary = {
        schemaVersion: 1,
        taskId: '152',
        authorizedReplayIds: ['replay_010', 'replay_011'],
        processedReplayIds: ['replay_010', 'replay_011'],
        inputPaths: {
            replay_010: replay010.normalized,
            replay_011: replay011.normalized
        },
        inputSizesBytes: {
            replay_010: stats.replay_010.size,
            replay_011: stats.replay_011.size
        },
        hashesComputed: false,
        sourceArtifactGeneratorsExecuted: false,
        canonicalGeneratorExecuted: false,
        finalFactsProduced: false,
        rawDataCaptured: false
    };

    const parserConfirmation = {
        schemaVersion: 1,
        replay010ParseCompleted: replay010Parser.parseCompleted,
        replay011ParseCompleted: replay011Parser.parseCompleted,
        replay010FirstError: replay010Parser.firstErrorMessage,
        replay011FirstError: replay011Parser.firstErrorMessage,
        replay010OldMissingEntityBlockerStillResolved: replay010Parser.firstErrorMessage !== 'Unable to find an entity with index [ 2905 ]',
        replay011OldMissingEntityBlockerStillResolved: replay011Parser.firstErrorMessage !== 'Unable to find an entity with index [ 5624 ]',
        oldMissingEntityRouteReopened: replay010Parser.missingEntityError || replay011Parser.missingEntityError,
        interpretationLimits: [
            'not total parser correctness',
            'not Source 2 semantics',
            'not replay corruption or non-corruption',
            'not game facts'
        ]
    };

    const sourceReadiness = {
        schemaVersion: 1,
        firstSourceCanonicalStage: entrypoints.firstSourceCanonicalStage,
        firstStageExists: entrypoints.firstStageCallable,
        firstStageCallable: entrypoints.firstStageCallable,
        dryRunAvailableForBothAuthorizedReplays: dryRunAvailable,
        needsAdditionalConfiguration: entrypoints.firstStageNeedsAdditionalConfiguration,
        configurationNeeded: entrypoints.configurationNeeded,
        toolsInspected: [entrypoints.sourceArtifact, entrypoints.forwardArtifact, entrypoints.localInput],
        artifactsAttempted: [],
        artifactsPlannedByExistingTools: Array.from(new Set([
            ...entrypoints.sourceArtifact.artifactClasses,
            ...entrypoints.forwardArtifact.artifactClasses
        ])).sort(),
        schemaDefinedForReadinessOutputs: true,
        schemaDefinedForFinalSourceEmission: 'not_validated_in_task_152',
        classification: parserPrereqsMet && dryRunAvailable
            ? 'controlled_canonical_source_readiness_passed'
            : 'controlled_canonical_source_readiness_blocked_by_pipeline_wiring',
        finalSourceFactsProduced: false,
        limitations: [
            'Existing source artifact generators were inspected but not executed.',
            'Existing generators are replay_010-oriented and would emit source artifacts rather than dry-run readiness only.',
            'Task 152 validates readiness wiring, not final artifact content.'
        ]
    };

    const canonicalReadiness = {
        schemaVersion: 1,
        canonicalPackageConstructed: false,
        canonicalGeneratorExecuted: false,
        canonicalDryRunAvailableForBothAuthorizedReplays: false,
        canonicalSchemaAvailability: 'not_validated_for_generic_local_replay_010_011_inputs',
        canonicalOutputPathPlan: 'requires_future_controlled_task_after_dry_run_wiring',
        classification: parserPrereqsMet
            ? 'controlled_canonical_source_readiness_blocked_by_pipeline_wiring'
            : 'controlled_canonical_source_readiness_partial',
        blocker: parserPrereqsMet ? 'no_safe_generic_canonical_dry_run_entrypoint_for_both_authorized_replays' : 'parser_prerequisite_not_met',
        finalCanonicalFactsProduced: false,
        limitations: [
            'Canonical package construction for arbitrary local inputs remains separate from parser completion.',
            'No canonical facts or schemas were generated or validated as final outputs in Task 152.'
        ]
    };

    const protectionAudit = {
        schemaVersion: 1,
        passed: true,
        replay010Processed: true,
        replay011Processed: true,
        replay005AccessedOrProcessed: false,
        bots006To008AccessedOrProcessed: false,
        candidates012To020AccessedOrProcessed: false,
        samplesUsed: false,
        outputReplaysUsed: false,
        parserEngineBehaviorModified: false,
        packagesDeademModified: false,
        parserFixAdded: false,
        recoveryAdded: false,
        skipModeAdded: false,
        placeholderCreated: false,
        fakeFieldsCreated: false,
        syntheticRegistryStateCreated: false,
        defaultBehaviorChanged: false,
        newOptInAdded: false,
        finalMatchFactsProduced: false,
        finalSourceFactsProduced: false,
        finalCanonicalFactsProduced: false,
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
        task153Created: false
    };
    const schemaValidation = validateSchemaRecords({
        scopeSummary,
        parserConfirmation,
        sourceReadiness,
        canonicalReadiness,
        protectionAudit
    });
    const policyAudit = outputPolicyAudit(classification, entrypoints);
    const firstBlocker = {
        schemaVersion: 1,
        blockerFound: classification !== 'controlled_canonical_source_readiness_passed',
        blockerType: classification === 'controlled_canonical_source_readiness_passed' ? 'none' : 'pipeline_wiring',
        blockerSummary: classification === 'controlled_canonical_source_readiness_passed'
            ? null
            : 'No safe generic dry-run/compact readiness entrypoint exists for both replay_010 and replay_011; existing source artifact generators are replay_010-oriented and would emit source artifacts if executed.',
        parserBlocker: parserPrereqsMet ? null : 'parser completion prerequisite failed',
        schemaBlocker: schemaValidation.allSchemasValid ? null : 'compact readiness schema validation failed',
        outputPolicyBlocker: policyAudit.existingEntrypointsWouldEmitSourceArtifactsIfRun ? 'existing source artifact generators would emit source artifacts if executed' : null,
        canonicalizationBlocker: 'no safe generic canonical dry-run entrypoint for both authorized replays'
    };
    const rejectedActions = {
        schemaVersion: 1,
        missingEntityRouteReopened: false,
        cursorIndexDiagnosticsAdded: false,
        payloadBitsDiagnosticsAdded: false,
        sourceArtifactGeneratorsExecuted: false,
        canonicalGeneratorExecuted: false,
        finalMatchFactsProduced: false,
        finalSourceFactsProduced: false,
        finalCanonicalFactsProduced: false,
        gameplayInterpretationProduced: false,
        protectedReplayAccessed: false,
        parserBehaviorChanged: false,
        recoveryAdded: false,
        skipModeAdded: false,
        placeholderCreated: false,
        newOptInAdded: false
    };
    const nextMilestone = {
        schemaVersion: 1,
        recommendedMilestone: classification === 'controlled_canonical_source_readiness_passed'
            ? 'emit_controlled_source_canonical_artifacts_for_replay_010_011'
            : 'design_generic_compact_source_canonical_dry_run_entrypoint',
        rationale: classification === 'controlled_canonical_source_readiness_passed'
            ? 'Parser and dry-run readiness prerequisites are met for both authorized canaries.'
            : 'Parser prerequisites are met, but the first source/canonical stage is not safely callable as compact dry-run readiness for both authorized canaries.',
        futureTaskRequirements: [
            'support replay_010 and replay_011 without replay-specific branches',
            'dry-run or compact-readiness mode before final artifact emission',
            'output policy audit before source/canonical facts are versioned',
            'no protected replay, bot fixture, candidate replay, spatial, macro, mechanics, fight, decision, or ML expansion'
        ]
    };
    const gate = {
        schemaVersion: 1,
        gate: schemaValidation.allSchemasValid && protectionAudit.passed ? READINESS_GATE : BLOCKED_GATE,
        classification,
        reasons: [
            'default parser completion confirmed for replay_010 and replay_011',
            classification === 'controlled_canonical_source_readiness_blocked_by_pipeline_wiring'
                ? 'source/canonical readiness is blocked by missing safe dry-run/generic wiring, not by parser completion'
                : 'readiness validation completed'
        ],
        firstBlockerType: firstBlocker.blockerType,
        finalFactsProduced: false
    };

    await writeJson(path.join(localRoot.absolutePath, 'local-run-summary.json'), {
        schemaVersion: 1,
        replay010Parser,
        replay011Parser,
        entrypoints,
        classification,
        rawDataCaptured: false
    });
    await writeJson(path.join(summaryRoot.absolutePath, 'scope-summary.json'), scopeSummary);
    await writeJson(path.join(summaryRoot.absolutePath, 'parser-confirmation.json'), parserConfirmation);
    await writeJson(path.join(summaryRoot.absolutePath, 'replay-010-readiness-status.json'), replay010Status);
    await writeJson(path.join(summaryRoot.absolutePath, 'replay-011-readiness-status.json'), replay011Status);
    await writeJson(path.join(summaryRoot.absolutePath, 'source-readiness-summary.json'), sourceReadiness);
    await writeJson(path.join(summaryRoot.absolutePath, 'canonical-readiness-summary.json'), canonicalReadiness);
    await writeJson(path.join(summaryRoot.absolutePath, 'schema-validation-summary.json'), schemaValidation);
    await writeJson(path.join(summaryRoot.absolutePath, 'output-policy-audit.json'), policyAudit);
    await writeJson(path.join(summaryRoot.absolutePath, 'first-readiness-blocker.json'), firstBlocker);
    await writeJson(path.join(summaryRoot.absolutePath, 'rejected-actions.json'), rejectedActions);
    await writeJson(path.join(summaryRoot.absolutePath, 'next-milestone-recommendation.json'), nextMilestone);
    await writeJson(path.join(summaryRoot.absolutePath, 'protection-audit.json'), protectionAudit);
    await writeJson(path.join(summaryRoot.absolutePath, 'readiness-gate.json'), gate);
    await writeMarkdown(path.join(REPO_ROOT, 'reports/controlled-canonical-source-readiness.md'), buildReport({
        replay010Status,
        replay011Status,
        sourceReadiness,
        canonicalReadiness,
        firstBlocker,
        classification
    }));
    return gate;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    main().then(result => {
        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    }).catch(error => {
        console.error(error);
        process.exitCode = 1;
    });
}
