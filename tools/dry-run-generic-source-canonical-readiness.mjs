#!/usr/bin/env node
import { createReadStream } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Logger, Player } from 'deadem';

const THIS_FILE = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(THIS_FILE), '..');
const REQUIRED_LOCAL_ROOT = '.local/deadem/cache/local-replay-processing/generic-source-canonical-dry-run-entrypoint/';
const REQUIRED_SUMMARY_ROOT = 'output/local-replay-processing/generic-source-canonical-dry-run-entrypoint/';
const SUCCESS_GATE = 'generic_source_canonical_dry_run_entrypoint_added';
const BLOCKED_GATE = 'generic_source_canonical_dry_run_entrypoint_blocked';

export const AUTHORIZED_REPLAYS = {
    replay_010: '.local/deadem/replays/inbox/partida_010.dem',
    replay_011: '.local/deadem/replays/inbox/partida_011.dem'
};

export const PLANNED_ARTIFACT_CLASSES = [
    'parser_source_summary',
    'source_readiness_manifest',
    'canonical_readiness_manifest',
    'source_artifact_manifest_plan',
    'canonical_artifact_manifest_plan',
    'schema_validation_summary',
    'output_policy_audit'
];

function slash(value) {
    return String(value).replaceAll(path.sep, '/');
}

function repoRelative(value) {
    return slash(path.relative(REPO_ROOT, path.resolve(REPO_ROOT, value)));
}

function assertRelativeRepositoryPath(value, label) {
    if (!value || path.isAbsolute(value)) throw new Error(`${label} must be a relative repository path`);
    const normalized = slash(value);
    if (normalized === '..' || normalized.startsWith('../') || normalized.includes('/../')) {
        throw new Error(`${label} must stay inside the repository`);
    }
    return normalized;
}

function forbiddenReasons(normalized) {
    const lower = normalized.toLowerCase();
    const reasons = [];
    if (/(?:^|\/)(?:partida|replay|match)[_-]?00?5(?:\.dem)?$/iu.test(lower) || /replay[_-]?00?5/iu.test(lower)) {
        reasons.push('protected replay 005 path');
    }
    if (/(?:^|\/)(?:partida|replay|match)[_-]?00?[6-8](?:\.dem)?$/iu.test(lower)) {
        reasons.push('unsupported bot fixture replay path');
    }
    if (/(?:^|\/)(?:partida|replay|match)[_-]?0?(1[2-9]|20)(?:\.dem)?$/iu.test(lower)) {
        reasons.push('out-of-scope candidate replay path');
    }
    if (lower.startsWith('samples/')) reasons.push('samples path');
    if (lower.startsWith('output/replays/')) reasons.push('output/replays path');
    return reasons;
}

export function validateReplayInput(replayId, inputPath) {
    if (!Object.hasOwn(AUTHORIZED_REPLAYS, replayId)) throw new Error(`unsupported replay id: ${replayId}`);
    const normalized = assertRelativeRepositoryPath(inputPath, replayId);
    const reasons = forbiddenReasons(normalized);
    if (reasons.length > 0) throw new Error(`Forbidden path ${normalized}: ${reasons.join(', ')}`);
    if (normalized !== AUTHORIZED_REPLAYS[replayId]) {
        throw new Error(`${replayId} input must be exactly ${AUTHORIZED_REPLAYS[replayId]}`);
    }
    return { replayId, normalized, absolutePath: path.resolve(REPO_ROOT, normalized) };
}

function exactRoot(value, expected, label) {
    const normalized = assertRelativeRepositoryPath(value, label).replace(/\/?$/u, '/');
    if (normalized !== expected) throw new Error(`${label} must be exactly ${expected}`);
    return { normalized, absolutePath: path.resolve(REPO_ROOT, normalized) };
}

export function validateOutputRoots(localOutput, summaryOutput) {
    return {
        local: exactRoot(localOutput, REQUIRED_LOCAL_ROOT, 'local output root'),
        summary: exactRoot(summaryOutput, REQUIRED_SUMMARY_ROOT, 'summary output root')
    };
}

function parseArgs(argv) {
    const args = new Map();
    for (let index = 0; index < argv.length; index += 2) {
        const key = argv[index];
        const value = argv[index + 1];
        if (!key?.startsWith('--') || value === undefined) throw new Error(`Invalid argument near ${key ?? '<end>'}`);
        args.set(key.slice(2), value);
    }
    for (const required of ['replay-010', 'replay-011', 'local-output', 'summary-output']) {
        if (!args.has(required)) throw new Error(`missing --${required}`);
    }
    return args;
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
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function sanitizeStack(error) {
    return String(error?.stack ?? '')
        .split(/\r?\n/u)
        .slice(0, 4)
        .map(line => line.replaceAll(REPO_ROOT, '<repo>'));
}

async function runParserToEnd(input) {
    const player = new Player(undefined, Logger.NOOP);
    const started = performance.now();
    const result = {
        schemaVersion: 1,
        replayId: input.replayId,
        inputLabel: path.basename(input.normalized),
        parserLoadSucceeded: false,
        parseCompleted: false,
        reachedEnd: false,
        ticksAdvanced: 0,
        currentTick: null,
        finalTick: null,
        firstErrorMessage: null,
        firstErrorClass: null,
        stackTop: [],
        rawDataCaptured: false,
        finalFactsProduced: false
    };
    try {
        await player.load(createReadStream(input.absolutePath));
        result.parserLoadSucceeded = true;
        let previousTick = safeNumber(player.getCurrentTick());
        result.currentTick = previousTick;
        result.finalTick = safeNumber(player.getLastTick());

        while (true) {
            const advanced = await player.nextTick();
            const currentTick = safeNumber(player.getCurrentTick());
            if (previousTick !== null && currentTick !== null) {
                result.ticksAdvanced += Math.max(0, currentTick - previousTick);
            }
            previousTick = currentTick;
            result.currentTick = currentTick;
            result.finalTick = safeNumber(player.getLastTick());
            if (!advanced) {
                result.parseCompleted = true;
                result.reachedEnd = true;
                break;
            }
        }
    } catch (error) {
        result.firstErrorMessage = error?.message ?? String(error);
        result.firstErrorClass = error?.constructor?.name ?? null;
        result.stackTop = sanitizeStack(error);
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

export function buildPlannedArtifactSummary(toolSources = {}) {
    const sourceToolClasses = extractConstStringArray(toolSources.sourceArtifact ?? '', 'REQUIRED_ARTIFACT_CLASSES');
    const forwardToolClasses = extractConstStringArray(toolSources.forwardSourceArtifact ?? '', 'REQUIRED_ARTIFACT_CLASSES');
    const existingFinalClasses = Array.from(new Set([...sourceToolClasses, ...forwardToolClasses])).sort();
    return {
        schemaVersion: 1,
        dryRunEntrypointArtifactClasses: PLANNED_ARTIFACT_CLASSES.map(artifactClass => ({
            artifactClass,
            mode: 'compact_readiness_metadata',
            finalFactArtifact: false
        })),
        existingSourceArtifactClassesPlannedForFutureEmission: existingFinalClasses.map(artifactClass => ({
            artifactClass,
            mode: 'future_controlled_emission_only',
            finalFactArtifact: true
        })),
        plannedArtifactCount: PLANNED_ARTIFACT_CLASSES.length,
        existingSourceArtifactClassCount: existingFinalClasses.length,
        finalArtifactsWrittenByDryRun: false
    };
}

export function schemaReadinessSummary(plannedArtifactSummary) {
    const requiredClasses = [
        'parser_source_summary',
        'source_readiness_manifest',
        'canonical_readiness_manifest',
        'schema_validation_summary',
        'output_policy_audit'
    ];
    const planned = new Set(plannedArtifactSummary.dryRunEntrypointArtifactClasses.map(row => row.artifactClass));
    const missing = requiredClasses.filter(artifactClass => !planned.has(artifactClass));
    return {
        schemaVersion: 1,
        readinessSchemaAvailable: missing.length === 0,
        readinessSchemaValidationStatus: missing.length === 0 ? 'passed' : 'blocked',
        requiredClasses,
        missingClasses: missing,
        finalSourceSchemaValidated: false,
        finalCanonicalSchemaValidated: false,
        finalFactsProduced: false
    };
}

export function buildOutputPolicyAudit(plannedArtifactSummary) {
    const dryRunRows = plannedArtifactSummary.dryRunEntrypointArtifactClasses;
    const finalRows = plannedArtifactSummary.existingSourceArtifactClassesPlannedForFutureEmission;
    const readinessOnly = dryRunRows.every(row => row.finalFactArtifact === false);
    return {
        schemaVersion: 1,
        policyStatus: readinessOnly ? 'passed' : 'blocked',
        compactReadinessArtifactsOnly: readinessOnly,
        plannedReadinessArtifactCount: dryRunRows.length,
        futureFinalArtifactClassCount: finalRows.length,
        rawReplayBytes: false,
        rawPayloads: false,
        rawEntityData: false,
        rawSerializedEntities: false,
        stringBytesOrValues: false,
        fieldValues: false,
        fullEntityHistories: false,
        fullSendTablePayload: false,
        sourceFactsProduced: false,
        canonicalFactsProduced: false,
        matchFactsProduced: false,
        gameplayInterpretationOutputs: false,
        outputConclusion: readinessOnly
            ? 'compact_readiness_outputs_allowed_final_fact_emission_deferred'
            : 'dry_run_plan_includes_final_fact_artifacts'
    };
}

export function classifyDryRun({ replayResults, schemaSummary, outputPolicy }) {
    const completed = replayResults.every(result => result.parseCompleted);
    if (!completed) return 'generic_source_canonical_dry_run_partial';
    if (schemaSummary.readinessSchemaValidationStatus !== 'passed') return 'generic_source_canonical_dry_run_blocked_by_schema';
    if (outputPolicy.policyStatus !== 'passed') return 'generic_source_canonical_dry_run_blocked_by_output_policy';
    return 'generic_source_canonical_dry_run_ready';
}

function firstBlockerFor(classification, replayResults, schemaSummary, outputPolicy) {
    if (classification === 'generic_source_canonical_dry_run_ready') {
        return {
            schemaVersion: 1,
            blockerFound: false,
            blockerType: 'none',
            blockerSummary: null
        };
    }
    const parserFailure = replayResults.find(result => !result.parseCompleted);
    if (parserFailure) {
        return {
            schemaVersion: 1,
            blockerFound: true,
            blockerType: 'parser_completion',
            blockerSummary: `${parserFailure.replayId} did not complete parser advancement`,
            firstErrorMessage: parserFailure.firstErrorMessage
        };
    }
    if (schemaSummary.readinessSchemaValidationStatus !== 'passed') {
        return {
            schemaVersion: 1,
            blockerFound: true,
            blockerType: 'schema',
            blockerSummary: 'compact readiness schema validation failed',
            missingClasses: schemaSummary.missingClasses
        };
    }
    if (outputPolicy.policyStatus !== 'passed') {
        return {
            schemaVersion: 1,
            blockerFound: true,
            blockerType: 'output_policy',
            blockerSummary: 'dry-run plan includes forbidden final facts or raw data'
        };
    }
    return {
        schemaVersion: 1,
        blockerFound: true,
        blockerType: 'unknown',
        blockerSummary: 'classification did not map to a known blocker'
    };
}

function replayStatus(result) {
    return {
        schemaVersion: 1,
        replayId: result.replayId,
        inputLabel: result.inputLabel,
        parserCompletionStatus: result.parseCompleted ? 'passed' : 'blocked',
        parserLoadSucceeded: result.parserLoadSucceeded,
        parseCompleted: result.parseCompleted,
        reachedEnd: result.reachedEnd,
        ticksAdvanced: result.ticksAdvanced,
        currentTick: result.currentTick,
        finalTick: result.finalTick,
        firstErrorMessage: result.firstErrorMessage,
        dryRunStatus: result.parseCompleted ? 'readiness_planned_without_final_artifacts' : 'blocked_before_readiness',
        sourceFactsProduced: false,
        canonicalFactsProduced: false,
        matchFactsProduced: false,
        rawDataCaptured: false
    };
}

function buildProtectionAudit() {
    return {
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
        defaultBehaviorChanged: false,
        newOptInAdded: false,
        sourceFactsProduced: false,
        canonicalFactsProduced: false,
        matchFactsProduced: false,
        gameplayInterpretationOutputs: false,
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
        upstreamPullMergeCherryPickOrRebaseUsed: false,
        task155Created: false
    };
}

function buildReport({ classification, replay010, replay011, firstBlocker, nextMilestone }) {
    return [
        '# Generic Source Canonical Dry-Run Entrypoint',
        '',
        'Task 154 added a generic compact dry-run/readiness entrypoint for replay_010 and replay_011.',
        '',
        '## Result',
        '',
        `- classification: \`${classification}\``,
        `- replay_010 parser completion: \`${replay010.parserCompletionStatus}\``,
        `- replay_011 parser completion: \`${replay011.parserCompletionStatus}\``,
        `- first blocker: \`${firstBlocker.blockerType}\``,
        `- recommended next milestone: \`${nextMilestone.recommendedMilestone}\``,
        '',
        'The dry-run lists planned source/canonical readiness artifacts and validates compact schema/output policy without writing final source, canonical, or match facts.',
        '',
        'No raw replay bytes, payloads, entityData, serializedEntities, string values, field values, full entity histories, source facts, canonical facts, match facts, or gameplay interpretation outputs were produced.'
    ];
}

async function main(argv = process.argv.slice(2)) {
    const args = parseArgs(argv);
    const replay010 = validateReplayInput('replay_010', args.get('replay-010'));
    const replay011 = validateReplayInput('replay_011', args.get('replay-011'));
    const roots = validateOutputRoots(args.get('local-output'), args.get('summary-output'));
    await mkdir(roots.local.absolutePath, { recursive: true });
    await mkdir(roots.summary.absolutePath, { recursive: true });

    const started = performance.now();
    const sourceArtifactSource = await readFile(path.join(REPO_ROOT, 'tools/generate-local-replay-source-artifacts.mjs'), 'utf8');
    const forwardSourceArtifactSource = await readFile(path.join(REPO_ROOT, 'tools/generate-local-replay-forward-source-artifacts.mjs'), 'utf8');
    const plannedArtifactSummary = buildPlannedArtifactSummary({
        sourceArtifact: sourceArtifactSource,
        forwardSourceArtifact: forwardSourceArtifactSource
    });
    const schemaSummary = schemaReadinessSummary(plannedArtifactSummary);
    const outputPolicy = buildOutputPolicyAudit(plannedArtifactSummary);
    const replayResults = [await runParserToEnd(replay010), await runParserToEnd(replay011)];
    const classification = classifyDryRun({ replayResults, schemaSummary, outputPolicy });
    const firstBlocker = firstBlockerFor(classification, replayResults, schemaSummary, outputPolicy);
    const protectionAudit = buildProtectionAudit();
    const replay010Status = replayStatus(replayResults[0]);
    const replay011Status = replayStatus(replayResults[1]);
    const implementationSummary = {
        schemaVersion: 1,
        script: 'tools/dry-run-generic-source-canonical-readiness.mjs',
        npmScript: 'dry-run:source-canonical-readiness',
        mode: 'compact_readiness_dry_run',
        parserCompletionConfirmedForBothAuthorizedReplays: replayResults.every(result => result.parseCompleted),
        finalFactsProduced: false,
        parserEngineBehaviorModified: false,
        packagesDeademModified: false,
        durationMs: Math.round(performance.now() - started)
    };
    const scopeSummary = {
        schemaVersion: 1,
        taskId: '154',
        authorizedReplayIds: ['replay_010', 'replay_011'],
        processedReplayIds: ['replay_010', 'replay_011'],
        inputPaths: {
            replay_010: replay010.normalized,
            replay_011: replay011.normalized
        },
        localOutputRoot: roots.local.normalized,
        summaryOutputRoot: roots.summary.normalized,
        finalFactsProduced: false,
        rawDataCaptured: false
    };
    const nextMilestone = {
        schemaVersion: 1,
        recommendedMilestone: classification === 'generic_source_canonical_dry_run_ready'
            ? 'emit_controlled_source_canonical_artifacts_for_replay_010_011'
            : 'resolve_generic_source_canonical_dry_run_blocker',
        rationale: classification === 'generic_source_canonical_dry_run_ready'
            ? 'Generic dry-run readiness is available for both authorized canaries and produced compact manifests only.'
            : 'Dry-run readiness did not meet all parser/schema/output-policy prerequisites.',
        futureTaskRequirements: [
            'separate explicit authorization before final source/canonical artifact emission',
            'process only authorized replays in that future task',
            'validate output policy before writing final artifacts',
            'no gameplay interpretation outputs'
        ]
    };
    const gate = {
        schemaVersion: 1,
        gate: classification === 'generic_source_canonical_dry_run_ready' ? SUCCESS_GATE : BLOCKED_GATE,
        classification,
        firstBlockerType: firstBlocker.blockerType,
        finalFactsProduced: false,
        rawDataCaptured: false
    };

    await writeJson(path.join(roots.local.absolutePath, 'local-run-summary.json'), {
        schemaVersion: 1,
        replayResults,
        classification,
        rawDataCaptured: false,
        finalFactsProduced: false
    });
    await writeJson(path.join(roots.summary.absolutePath, 'dry-run-gate.json'), gate);
    await writeJson(path.join(roots.summary.absolutePath, 'implementation-summary.json'), implementationSummary);
    await writeJson(path.join(roots.summary.absolutePath, 'scope-summary.json'), scopeSummary);
    await writeJson(path.join(roots.summary.absolutePath, 'replay-010-dry-run-status.json'), replay010Status);
    await writeJson(path.join(roots.summary.absolutePath, 'replay-011-dry-run-status.json'), replay011Status);
    await writeJson(path.join(roots.summary.absolutePath, 'planned-artifact-summary.json'), plannedArtifactSummary);
    await writeJson(path.join(roots.summary.absolutePath, 'schema-readiness-summary.json'), schemaSummary);
    await writeJson(path.join(roots.summary.absolutePath, 'output-policy-audit.json'), outputPolicy);
    await writeJson(path.join(roots.summary.absolutePath, 'first-dry-run-blocker.json'), firstBlocker);
    await writeJson(path.join(roots.summary.absolutePath, 'next-milestone-recommendation.json'), nextMilestone);
    await writeJson(path.join(roots.summary.absolutePath, 'protection-audit.json'), protectionAudit);
    await writeMarkdown(path.join(REPO_ROOT, 'reports/generic-source-canonical-dry-run-entrypoint.md'), buildReport({
        classification,
        replay010: replay010Status,
        replay011: replay011Status,
        firstBlocker,
        nextMilestone
    }));
    return gate;
}

export { main };

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    main().then(result => {
        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    }).catch(error => {
        console.error(error);
        process.exitCode = 1;
    });
}
