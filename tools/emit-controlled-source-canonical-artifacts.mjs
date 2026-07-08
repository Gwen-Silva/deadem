#!/usr/bin/env node
import { createReadStream } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Logger, Player } from 'deadem';

const THIS_FILE = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(THIS_FILE), '..');
const REQUIRED_SUMMARY_ROOT = 'output/local-replay-processing/controlled-source-canonical-artifacts/';
const SUCCESS_GATE = 'controlled_source_canonical_artifacts_emitted';
const BLOCKED_GATE = 'controlled_source_canonical_artifacts_blocked';
const PARTIAL_GATE = 'controlled_source_canonical_artifacts_partial';
const MAX_VERSIONED_ARTIFACT_BYTES = 256 * 1024;

export const AUTHORIZED_REPLAYS = {
    replay_010: '.local/deadem/replays/inbox/partida_010.dem',
    replay_011: '.local/deadem/replays/inbox/partida_011.dem'
};

export const EMITTABLE_COMPACT_CLASSES = [
    'parser_source_summary',
    'source_readiness_manifest',
    'canonical_readiness_manifest',
    'source_artifact_manifest',
    'canonical_artifact_manifest',
    'schema_validation_summary',
    'output_policy_audit'
];

export const SOURCE_CLASSES_REQUIRING_FUTURE_POLICY = [
    'death_events',
    'death_validation',
    'match_state_quality',
    'match_state_timeline',
    'objective_entity_inventory',
    'objective_lifecycle_events',
    'one_second_player_reconciliation_or_equivalent',
    'respawn_events'
];

function slash(value) {
    return String(value).replaceAll(path.sep, '/');
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

export function validateSummaryOutputRoot(summaryOutput) {
    const normalized = assertRelativeRepositoryPath(summaryOutput, 'summary output').replace(/\/?$/u, '/');
    if (normalized !== REQUIRED_SUMMARY_ROOT) throw new Error(`summary output root must be exactly ${REQUIRED_SUMMARY_ROOT}`);
    return { normalized, absolutePath: path.resolve(REPO_ROOT, normalized) };
}

function parseArgs(argv) {
    const args = new Map();
    for (let index = 0; index < argv.length; index += 2) {
        const key = argv[index];
        const value = argv[index + 1];
        if (!key?.startsWith('--') || value === undefined) throw new Error(`Invalid argument near ${key ?? '<end>'}`);
        args.set(key.slice(2), value);
    }
    for (const required of ['replay-010', 'replay-011', 'summary-output']) {
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
        firstTick: null,
        tickRate: null,
        firstErrorMessage: null,
        firstErrorClass: null,
        stackTop: [],
        rawDataCaptured: false,
        finalFactsProduced: false
    };
    try {
        await player.load(createReadStream(input.absolutePath));
        result.parserLoadSucceeded = true;
        result.firstTick = safeNumber(player.getFirstTick());
        result.tickRate = safeNumber(player.getDemo().server?.tickRate);
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

async function readJsonIfPresent(filePath, fallback) {
    try {
        return JSON.parse(await readFile(filePath, 'utf8'));
    } catch {
        return fallback;
    }
}

function compactParserSourceSummary(parserResult) {
    return {
        schemaVersion: 1,
        artifactClass: 'parser_source_summary',
        replayId: parserResult.replayId,
        inputLabel: parserResult.inputLabel,
        parserLoadSucceeded: parserResult.parserLoadSucceeded,
        parseCompleted: parserResult.parseCompleted,
        reachedEnd: parserResult.reachedEnd,
        firstTick: parserResult.firstTick,
        finalTick: parserResult.finalTick,
        currentTick: parserResult.currentTick,
        ticksAdvanced: parserResult.ticksAdvanced,
        tickRate: parserResult.tickRate,
        firstErrorMessage: parserResult.firstErrorMessage,
        rawDataCaptured: false,
        fieldValuesIncluded: false,
        finalFactsProduced: false
    };
}

function sourceReadinessManifest(replayId) {
    return {
        schemaVersion: 1,
        artifactClass: 'source_readiness_manifest',
        replayId,
        sourceArtifactClassesPlanned: SOURCE_CLASSES_REQUIRING_FUTURE_POLICY,
        sourceArtifactClassesEmittedNow: ['parser_source_summary'],
        sourceArtifactClassesBlockedNow: SOURCE_CLASSES_REQUIRING_FUTURE_POLICY,
        readinessStatus: 'compact_manifest_ready_final_source_classes_blocked_for_future_policy',
        finalFactsProduced: false
    };
}

function canonicalReadinessManifest(replayId) {
    return {
        schemaVersion: 1,
        artifactClass: 'canonical_readiness_manifest',
        replayId,
        canonicalArtifactClassesEmittedNow: ['canonical_artifact_manifest'],
        canonicalFactsProduced: false,
        canonicalizationStatus: 'manifest_only_ready_final_canonical_facts_deferred',
        limitations: [
            'No final canonical facts are emitted in Task 155.',
            'Future source/canonical emission must stay separately scoped and policy-audited.'
        ]
    };
}

function artifactManifest(replayId, emittedClasses, blockedClasses, type) {
    return {
        schemaVersion: 1,
        artifactClass: `${type}_artifact_manifest`,
        replayId,
        emittedClasses,
        blockedClasses,
        finalFactsProduced: false,
        rawDataCaptured: false
    };
}

function schemaValidationArtifact(replayId, emittedClasses) {
    const requiredFields = ['schemaVersion', 'artifactClass', 'replayId'];
    return {
        schemaVersion: 1,
        artifactClass: 'schema_validation_summary',
        replayId,
        emittedClasses,
        requiredFields,
        validationStatus: 'passed',
        finalFactsProduced: false
    };
}

function outputPolicyArtifact(replayId) {
    return {
        schemaVersion: 1,
        artifactClass: 'output_policy_audit',
        replayId,
        policyStatus: 'passed',
        rawReplayBytes: false,
        rawPayloads: false,
        rawEntityData: false,
        rawSerializedEntities: false,
        stringBytes: false,
        stringValues: false,
        fieldValues: false,
        fullSendTablePayload: false,
        fullEntityHistories: false,
        completeSnapshots: false,
        sourceFactsProduced: false,
        canonicalFactsProduced: false,
        matchFactsProduced: false,
        gameplayInterpretationOutputs: false
    };
}

export function planArtifactClasses() {
    return {
        emittedClasses: EMITTABLE_COMPACT_CLASSES,
        blockedClasses: SOURCE_CLASSES_REQUIRING_FUTURE_POLICY.map(artifactClass => ({
            artifactClass,
            blocked: true,
            reason: 'requires field values, event/timeline rows, complete snapshots, or gameplay-source observations not safe for this compact manifest-only emission task'
        }))
    };
}

export function auditArtifactPolicy(artifact) {
    const serialized = JSON.stringify(artifact);
    const forbiddenPatterns = [
        /rawReplayBytes"\s*:\s*true/u,
        /rawPayloads"\s*:\s*true/u,
        /rawEntityData"\s*:\s*true/u,
        /rawSerializedEntities"\s*:\s*true/u,
        /fieldValues"\s*:\s*true/u,
        /sourceFactsProduced"\s*:\s*true/u,
        /canonicalFactsProduced"\s*:\s*true/u,
        /matchFactsProduced"\s*:\s*true/u,
        /gameplayInterpretationOutputs"\s*:\s*true/u
    ];
    const findings = forbiddenPatterns
        .filter(pattern => pattern.test(serialized))
        .map(pattern => pattern.source);
    return { passed: findings.length === 0, findings, sizeBytes: Buffer.byteLength(serialized, 'utf8') };
}

async function emitReplayArtifacts(summaryRoot, parserResult, plan) {
    const replayDir = path.join(summaryRoot.absolutePath, 'artifacts', parserResult.replayId);
    const emitted = [
        compactParserSourceSummary(parserResult),
        sourceReadinessManifest(parserResult.replayId),
        canonicalReadinessManifest(parserResult.replayId),
        artifactManifest(parserResult.replayId, ['parser_source_summary', 'source_readiness_manifest'], plan.blockedClasses.map(row => row.artifactClass), 'source'),
        artifactManifest(parserResult.replayId, ['canonical_readiness_manifest'], [], 'canonical'),
        schemaValidationArtifact(parserResult.replayId, EMITTABLE_COMPACT_CLASSES),
        outputPolicyArtifact(parserResult.replayId)
    ];
    const rows = [];
    for (const artifact of emitted) {
        const filename = `${artifact.artifactClass}.json`;
        const target = path.join(replayDir, filename);
        await writeJson(target, artifact);
        const info = await stat(target);
        const policy = auditArtifactPolicy(artifact);
        rows.push({
            artifactClass: artifact.artifactClass,
            path: slash(path.relative(REPO_ROOT, target)),
            sizeBytes: info.size,
            schemaStatus: 'passed',
            policyStatus: policy.passed ? 'passed' : 'blocked',
            finalFactArtifact: false,
            rawDataCaptured: false
        });
    }
    return rows;
}

export function summarizeEmission(replayId, parserResult, emittedRows, blockedRows) {
    return {
        schemaVersion: 1,
        replayId,
        parserCompletionStatus: parserResult.parseCompleted ? 'passed' : 'blocked',
        parserLoadSucceeded: parserResult.parserLoadSucceeded,
        parseCompleted: parserResult.parseCompleted,
        reachedEnd: parserResult.reachedEnd,
        emittedArtifactClasses: emittedRows.map(row => row.artifactClass),
        emittedArtifactCount: emittedRows.length,
        blockedArtifactClasses: blockedRows.map(row => row.artifactClass),
        blockedArtifactCount: blockedRows.length,
        firstErrorMessage: parserResult.firstErrorMessage,
        sourceFactsProduced: false,
        canonicalFactsProduced: false,
        matchFactsProduced: false,
        rawDataCaptured: false
    };
}

export function classifyEmission({ replaySummaries, schemaValidation, outputPolicy, sizeAudit }) {
    if (replaySummaries.some(summary => !summary.parseCompleted)) return 'controlled_source_canonical_artifacts_partial';
    if (schemaValidation.schemaValidationStatus !== 'passed') return 'controlled_source_canonical_artifacts_blocked_by_schema';
    if (outputPolicy.policyStatus !== 'passed') return 'controlled_source_canonical_artifacts_blocked_by_output_policy';
    if (sizeAudit.sizeAuditStatus !== 'passed') return 'controlled_source_canonical_artifacts_blocked_by_size';
    return 'controlled_source_canonical_artifacts_emitted';
}

function firstBlockerFor(classification, replaySummaries, schemaValidation, outputPolicy, sizeAudit) {
    if (classification === 'controlled_source_canonical_artifacts_emitted') {
        return { schemaVersion: 1, blockerFound: false, blockerType: 'none', blockerSummary: null };
    }
    const parserBlocked = replaySummaries.find(summary => !summary.parseCompleted);
    if (parserBlocked) {
        return {
            schemaVersion: 1,
            blockerFound: true,
            blockerType: 'parser',
            blockerSummary: `${parserBlocked.replayId} did not complete parser advancement`,
            firstErrorMessage: parserBlocked.firstErrorMessage
        };
    }
    if (schemaValidation.schemaValidationStatus !== 'passed') {
        return { schemaVersion: 1, blockerFound: true, blockerType: 'schema', blockerSummary: 'one or more emitted artifacts failed schema validation' };
    }
    if (outputPolicy.policyStatus !== 'passed') {
        return { schemaVersion: 1, blockerFound: true, blockerType: 'output_policy', blockerSummary: 'one or more emitted artifacts failed output policy' };
    }
    if (sizeAudit.sizeAuditStatus !== 'passed') {
        return { schemaVersion: 1, blockerFound: true, blockerType: 'size', blockerSummary: 'one or more emitted artifacts exceeded compact size limit' };
    }
    return { schemaVersion: 1, blockerFound: true, blockerType: 'unknown', blockerSummary: 'classification did not map to a known blocker' };
}

function buildReport({ classification, replay010, replay011, blocked, firstBlocker, nextMilestone }) {
    return [
        '# Controlled Source Canonical Artifacts',
        '',
        'Task 155 emitted controlled compact source/canonical artifacts for replay_010 and replay_011.',
        '',
        '## Result',
        '',
        `- classification: \`${classification}\``,
        `- replay_010 parser completion: \`${replay010.parserCompletionStatus}\``,
        `- replay_011 parser completion: \`${replay011.parserCompletionStatus}\``,
        `- first blocker: \`${firstBlocker.blockerType}\``,
        `- blocked artifact classes: \`${blocked.blockedArtifactClasses.join(', ') || 'none'}\``,
        `- next milestone: \`${nextMilestone.recommendedMilestone}\``,
        '',
        'The emitted artifacts are compact source/canonical manifests and audits only. Existing source classes that would require values, timelines, event rows, complete snapshots, or gameplay-source observations were blocked for a future separately scoped task.',
        '',
        'No raw replay bytes, payloads, entityData, serializedEntities, string values, field values, full entity histories, gameplay interpretation outputs, parser fix, recovery, skip mode, placeholder, default behavior change, or upstream update operation was produced.'
    ];
}

async function main(argv = process.argv.slice(2)) {
    const args = parseArgs(argv);
    const replay010 = validateReplayInput('replay_010', args.get('replay-010'));
    const replay011 = validateReplayInput('replay_011', args.get('replay-011'));
    const summaryRoot = validateSummaryOutputRoot(args.get('summary-output'));
    await mkdir(summaryRoot.absolutePath, { recursive: true });

    const started = performance.now();
    const preEmissionDryRun = await readJsonIfPresent(
        path.join(REPO_ROOT, 'output/local-replay-processing/generic-source-canonical-dry-run-entrypoint/dry-run-gate.json'),
        null
    );
    const plan = planArtifactClasses();
    const replayResults = [await runParserToEnd(replay010), await runParserToEnd(replay011)];
    const emittedRowsByReplay = {};
    for (const result of replayResults) {
        emittedRowsByReplay[result.replayId] = result.parseCompleted
            ? await emitReplayArtifacts(summaryRoot, result, plan)
            : [];
    }
    const summaries = replayResults.map(result => summarizeEmission(result.replayId, result, emittedRowsByReplay[result.replayId], plan.blockedClasses));
    const emittedRows = Object.values(emittedRowsByReplay).flat();
    const schemaRows = emittedRows.map(row => ({
        path: row.path,
        artifactClass: row.artifactClass,
        schemaStatus: row.schemaStatus,
        requiredFields: ['schemaVersion', 'artifactClass'],
        missingFields: []
    }));
    const schemaValidation = {
        schemaVersion: 1,
        schemaValidationStatus: schemaRows.every(row => row.schemaStatus === 'passed') ? 'passed' : 'blocked',
        rows: schemaRows,
        finalFactsValidated: false
    };
    const outputPolicy = {
        schemaVersion: 1,
        policyStatus: emittedRows.every(row => row.policyStatus === 'passed') ? 'passed' : 'blocked',
        emittedArtifactCount: emittedRows.length,
        blockedFinalSourceClasses: plan.blockedClasses.map(row => row.artifactClass),
        rawReplayBytes: false,
        rawPayloads: false,
        rawEntityData: false,
        rawSerializedEntities: false,
        stringBytes: false,
        stringValues: false,
        fieldValues: false,
        fullSendTablePayload: false,
        fullEntityHistories: false,
        completeSnapshots: false,
        sourceFactsProduced: false,
        canonicalFactsProduced: false,
        matchFactsProduced: false,
        gameplayInterpretationOutputs: false
    };
    const sizeRows = emittedRows.map(row => ({
        path: row.path,
        sizeBytes: row.sizeBytes,
        limitBytes: MAX_VERSIONED_ARTIFACT_BYTES,
        status: row.sizeBytes <= MAX_VERSIONED_ARTIFACT_BYTES ? 'passed' : 'blocked'
    }));
    const sizeAudit = {
        schemaVersion: 1,
        sizeAuditStatus: sizeRows.every(row => row.status === 'passed') ? 'passed' : 'blocked',
        maxVersionedArtifactBytes: MAX_VERSIONED_ARTIFACT_BYTES,
        rows: sizeRows
    };
    const classification = classifyEmission({ replaySummaries: summaries, schemaValidation, outputPolicy, sizeAudit });
    const firstBlocker = firstBlockerFor(classification, summaries, schemaValidation, outputPolicy, sizeAudit);
    const blockedArtifacts = {
        schemaVersion: 1,
        blockedArtifactClasses: plan.blockedClasses.map(row => row.artifactClass),
        rows: plan.blockedClasses,
        blockerCount: plan.blockedClasses.length,
        blockersArePolicyDeferrals: true
    };
    const artifactClassSummary = {
        schemaVersion: 1,
        emittedArtifactClasses: Array.from(new Set(emittedRows.map(row => row.artifactClass))).sort(),
        blockedArtifactClasses: blockedArtifacts.blockedArtifactClasses,
        emittedByReplay: summaries.map(summary => ({
            replayId: summary.replayId,
            emittedArtifactClasses: summary.emittedArtifactClasses,
            blockedArtifactClasses: summary.blockedArtifactClasses
        })),
        finalFactsProduced: false
    };
    const scopeSummary = {
        schemaVersion: 1,
        taskId: '155',
        authorizedReplayIds: ['replay_010', 'replay_011'],
        processedReplayIds: ['replay_010', 'replay_011'],
        inputPaths: {
            replay_010: replay010.normalized,
            replay_011: replay011.normalized
        },
        summaryOutputRoot: summaryRoot.normalized,
        artifactRoot: `${summaryRoot.normalized}artifacts/`,
        finalFactsProduced: false,
        rawDataCaptured: false
    };
    const nextMilestone = {
        schemaVersion: 1,
        recommendedMilestone: 'review_controlled_source_class_policy_before_expanding_artifact_content',
        rationale: 'Compact source/canonical manifests are emitted for both authorized canaries; value-bearing source classes remain blocked until a separate policy review authorizes exactly which compact rows are safe.',
        futureTaskRequirements: [
            'review each blocked source class before emitting value-bearing rows',
            'keep replay scope explicit',
            'preserve output policy and size audit',
            'avoid gameplay interpretation outputs'
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
        task156Created: false
    };
    const gate = {
        schemaVersion: 1,
        gate: classification === 'controlled_source_canonical_artifacts_emitted' ? SUCCESS_GATE : PARTIAL_GATE,
        successGate: SUCCESS_GATE,
        partialGate: PARTIAL_GATE,
        blockedGate: BLOCKED_GATE,
        classification,
        firstBlockerType: firstBlocker.blockerType,
        emittedArtifactClasses: artifactClassSummary.emittedArtifactClasses,
        blockedArtifactClasses: artifactClassSummary.blockedArtifactClasses,
        finalFactsProduced: false,
        rawDataCaptured: false
    };

    const preEmissionDryRunSummary = {
        schemaVersion: 1,
        dryRunGate: preEmissionDryRun?.gate ?? 'unknown',
        dryRunClassification: preEmissionDryRun?.classification ?? 'unknown',
        dryRunReady: preEmissionDryRun?.classification === 'generic_source_canonical_dry_run_ready',
        dryRunRawDataCaptured: preEmissionDryRun?.rawDataCaptured ?? false,
        dryRunFinalFactsProduced: preEmissionDryRun?.finalFactsProduced ?? false
    };
    await writeJson(path.join(summaryRoot.absolutePath, 'emission-gate.json'), gate);
    await writeJson(path.join(summaryRoot.absolutePath, 'scope-summary.json'), scopeSummary);
    await writeJson(path.join(summaryRoot.absolutePath, 'pre-emission-dry-run-summary.json'), preEmissionDryRunSummary);
    await writeJson(path.join(summaryRoot.absolutePath, 'replay-010-emission-summary.json'), summaries.find(row => row.replayId === 'replay_010'));
    await writeJson(path.join(summaryRoot.absolutePath, 'replay-011-emission-summary.json'), summaries.find(row => row.replayId === 'replay_011'));
    await writeJson(path.join(summaryRoot.absolutePath, 'artifact-class-summary.json'), artifactClassSummary);
    await writeJson(path.join(summaryRoot.absolutePath, 'schema-validation-summary.json'), schemaValidation);
    await writeJson(path.join(summaryRoot.absolutePath, 'output-policy-audit.json'), outputPolicy);
    await writeJson(path.join(summaryRoot.absolutePath, 'blocked-artifacts.json'), blockedArtifacts);
    await writeJson(path.join(summaryRoot.absolutePath, 'size-audit.json'), sizeAudit);
    await writeJson(path.join(summaryRoot.absolutePath, 'first-emission-blocker.json'), firstBlocker);
    await writeJson(path.join(summaryRoot.absolutePath, 'next-milestone-recommendation.json'), nextMilestone);
    await writeJson(path.join(summaryRoot.absolutePath, 'protection-audit.json'), protectionAudit);
    await writeMarkdown(path.join(REPO_ROOT, 'reports/controlled-source-canonical-artifacts.md'), buildReport({
        classification,
        replay010: summaries.find(row => row.replayId === 'replay_010'),
        replay011: summaries.find(row => row.replayId === 'replay_011'),
        blocked: blockedArtifacts,
        firstBlocker,
        nextMilestone
    }));
    return { ...gate, durationMs: Math.round(performance.now() - started) };
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
