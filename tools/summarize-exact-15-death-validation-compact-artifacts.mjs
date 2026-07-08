#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const THIS_FILE = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(THIS_FILE), '..');
const TASK_168_ROOT = 'output/local-replay-processing/exact-15-death-validation-compact-emission/';
const SUMMARY_ROOT = 'output/local-replay-processing/exact-15-death-validation-compact-summary/';
const SUCCESS_GATE = 'exact_15_death_validation_compact_summary_ready';
const BLOCKED_GATE = 'exact_15_death_validation_compact_summary_blocked';
const EVENT_COUNT_MEANING = 'source_observed_counter_transition_candidate_count_not_final_death_fact';

export const EXPECTED_REPLAY_IDS = [
    'replay_001',
    'replay_002',
    'replay_003',
    'replay_004',
    'replay_009',
    'replay_010',
    'replay_011',
    'replay_012',
    'replay_013',
    'replay_014',
    'replay_015',
    'replay_016',
    'replay_017',
    'replay_018',
    'replay_019'
];

export const TASK_168_SUMMARY_FILES = [
    'exact-15-emission-gate.json',
    'exact-15-emission-summary.json',
    'per-replay-emission-status.json',
    'schema-validation-summary.json',
    'output-policy-audit.json',
    'size-audit.json',
    'protection-audit.json',
    'blocked-replay-audit.json'
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

function validateFixedPath(value, expected, label) {
    const normalized = assertRelativeRepositoryPath(value, label).replace(/\/?$/u, expected.endsWith('/') ? '/' : '');
    if (normalized !== expected) throw new Error(`${label} must be exactly ${expected}`);
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
    for (const required of ['input-root', 'summary-output']) {
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

async function readJson(relativePath) {
    return JSON.parse(await readFile(path.resolve(REPO_ROOT, relativePath), 'utf8'));
}

function artifactPathForReplay(replayId) {
    return `${TASK_168_ROOT}artifacts/${replayId}/death_validation.json`;
}

export function buildReplayEventCountIndex(artifacts) {
    return {
        schemaVersion: 1,
        eventCountMeaning: EVENT_COUNT_MEANING,
        replayCount: artifacts.length,
        items: artifacts.map(artifact => ({
            replayId: artifact.replayId,
            artifactPath: artifactPathForReplay(artifact.replayId),
            eventCount: artifact.eventCount,
            duplicateKeyCount: artifact.duplicateKeyCount,
            validationStatus: artifact.validationStatus,
            eventCountMeaning: EVENT_COUNT_MEANING,
            finalFactsProduced: false,
            gameplayInterpretationProduced: false
        })),
        finalFactsProduced: false,
        gameplayInterpretationProduced: false
    };
}

export function buildAggregateCounterTransitionSummary(index) {
    const eventCounts = index.items.map(item => item.eventCount);
    const validationStatuses = [...new Set(index.items.map(item => item.validationStatus))].sort();
    return {
        schemaVersion: 1,
        artifactCount: index.items.length,
        sourceObservedCounterTransitionCandidateTotal: eventCounts.reduce((sum, value) => sum + value, 0),
        minEventCount: Math.min(...eventCounts),
        maxEventCount: Math.max(...eventCounts),
        duplicateKeyTotal: index.items.reduce((sum, item) => sum + item.duplicateKeyCount, 0),
        allValidationStatuses: validationStatuses,
        eventCountMeaning: EVENT_COUNT_MEANING,
        notFinalDeathFacts: true,
        notGameplayTruth: true,
        finalFactsProduced: false,
        gameplayInterpretationProduced: false
    };
}

export function buildSchemaPolicySizeRollup({ gate, emissionSummary, schemaValidation, outputPolicy, sizeAudit, protectionAudit, blockedReplayAudit }) {
    return {
        schemaVersion: 1,
        task168Gate: gate.gate,
        task168Status: gate.status,
        task168ProcessedReplayCount: gate.processedReplayCount,
        task168EmittedArtifactCount: gate.emittedArtifactCount,
        task168ArtifactClass: gate.artifactClass,
        schemaValidationStatus: schemaValidation.schemaValidationStatus,
        schemaArtifactsValidated: schemaValidation.artifactsValidated.length,
        outputPolicyStatus: outputPolicy.policyStatus,
        outputPolicyArtifactsAudited: outputPolicy.artifactsAudited,
        sizeAuditStatus: sizeAudit.sizeAuditStatus,
        sizeAuditArtifactsAudited: sizeAudit.artifacts.length,
        maxArtifactBytes: sizeAudit.maxArtifactBytes,
        blockedReplayCount: blockedReplayAudit.blockedReplayAudit.length,
        task168RawDataCaptured: emissionSummary.rawDataCaptured,
        task168FinalFactsProduced: emissionSummary.finalFactsProduced,
        task168GameplayInterpretationProduced: emissionSummary.gameplayInterpretationProduced,
        task168ProcessedOnlyExact15: protectionAudit.processedOnlyExact15,
        finalFactsProduced: false,
        gameplayInterpretationProduced: false
    };
}

export function buildInterpretationBoundaries() {
    return {
        schemaVersion: 1,
        eventCountMeaning: EVENT_COUNT_MEANING,
        notTotalDeathCount: true,
        notFinalFact: true,
        notCanonicalTruth: true,
        containsEventRows: false,
        containsFieldValues: false,
        containsKillerVictimAssistAttribution: false,
        containsPlayerIdentity: false,
        containsObjectiveAttribution: false,
        containsTimeline: false,
        containsGameplayInterpretation: false,
        validatesSource2Semantics: false,
        provesTotalParserCorrectness: false,
        sourceObservedCounterTransitionCandidateTotalIsNotFinalDeathFact: true,
        finalFactsProduced: false,
        gameplayInterpretationProduced: false
    };
}

export function buildProtectionAudit(index) {
    return {
        schemaVersion: 1,
        consumedTask168CompactArtifactsOnly: true,
        replayFilesAccessed: false,
        replayFilesOpened: false,
        replayFilesHashed: false,
        replayFilesCopied: false,
        replayFilesInspected: false,
        replayFilesParsed: false,
        replayFilesProcessed: false,
        parserExecuted: false,
        emissionRunnerExecuted: false,
        newDeathValidationArtifactsEmitted: false,
        replay005Accessed: false,
        bots006To008Processed: false,
        replay020Accessed: false,
        deathEventsEmitted: false,
        respawnEventsEmitted: false,
        timelinesEmitted: false,
        objectiveLifecycleEmitted: false,
        playerIdentityRowsEmitted: false,
        attributionEmitted: false,
        fieldValuesEmitted: false,
        rawReplayBytesEmitted: false,
        rawPayloadsEmitted: false,
        rawEntityDataEmitted: false,
        rawSerializedEntitiesEmitted: false,
        stringValuesEmitted: false,
        snapshotsEmitted: false,
        fullEntityHistoriesEmitted: false,
        sourceCanonicalMatchFinalFactsProduced: false,
        gameplayInterpretationProduced: false,
        parserEngineBehaviorModified: false,
        packagesDeademModified: false,
        recoveryAdded: false,
        skipModeAdded: false,
        placeholderAdded: false,
        defaultBehaviorChanged: false,
        newParserOptInAdded: false,
        javaExecuted: false,
        clarityExecuted: false,
        externalParserExecuted: false,
        wslUsed: false,
        iaflowUsed: false,
        productReviewerAutomationUsed: false,
        pullMergeCherryPickRebaseUsed: false,
        task170Created: false,
        summarizedReplayIds: index.items.map(item => item.replayId)
    };
}

export function validateArtifacts(artifacts) {
    const errors = [];
    const replayIds = artifacts.map(artifact => artifact.replayId);
    if (artifacts.length !== EXPECTED_REPLAY_IDS.length) errors.push('expected exactly 15 compact artifacts');
    for (const replayId of EXPECTED_REPLAY_IDS) {
        if (!replayIds.includes(replayId)) errors.push(`missing artifact for ${replayId}`);
    }
    for (const artifact of artifacts) {
        if (!EXPECTED_REPLAY_IDS.includes(artifact.replayId)) errors.push(`unexpected artifact replayId ${artifact.replayId}`);
        if (artifact.artifactClass !== 'death_validation') errors.push(`${artifact.replayId}: artifactClass must be death_validation`);
        if (!Number.isInteger(artifact.eventCount) || artifact.eventCount < 0) errors.push(`${artifact.replayId}: eventCount must be non-negative integer`);
        if (!Number.isInteger(artifact.duplicateKeyCount) || artifact.duplicateKeyCount < 0) errors.push(`${artifact.replayId}: duplicateKeyCount must be non-negative integer`);
        if (artifact.rawDataCaptured !== false) errors.push(`${artifact.replayId}: rawDataCaptured must be false`);
        if (artifact.finalFactsProduced !== false) errors.push(`${artifact.replayId}: finalFactsProduced must be false`);
    }
    return errors;
}

async function loadTask168Inputs() {
    const summaries = {};
    for (const fileName of TASK_168_SUMMARY_FILES) {
        summaries[fileName] = await readJson(`${TASK_168_ROOT}${fileName}`);
    }
    const artifacts = [];
    for (const replayId of EXPECTED_REPLAY_IDS) {
        artifacts.push(await readJson(artifactPathForReplay(replayId)));
    }
    return { summaries, artifacts };
}

export async function runExact15DeathValidationCompactSummary({ inputRoot, summaryOutput }) {
    validateFixedPath(inputRoot, TASK_168_ROOT, 'input root');
    const summaryRoot = validateFixedPath(summaryOutput, SUMMARY_ROOT, 'summary output');
    const { summaries, artifacts } = await loadTask168Inputs();
    const artifactErrors = validateArtifacts(artifacts);

    const replayEventCountIndex = buildReplayEventCountIndex(artifacts);
    const aggregateCounterTransitionSummary = buildAggregateCounterTransitionSummary(replayEventCountIndex);
    const schemaPolicySizeRollup = buildSchemaPolicySizeRollup({
        gate: summaries['exact-15-emission-gate.json'],
        emissionSummary: summaries['exact-15-emission-summary.json'],
        schemaValidation: summaries['schema-validation-summary.json'],
        outputPolicy: summaries['output-policy-audit.json'],
        sizeAudit: summaries['size-audit.json'],
        protectionAudit: summaries['protection-audit.json'],
        blockedReplayAudit: summaries['blocked-replay-audit.json']
    });
    const interpretationBoundaries = buildInterpretationBoundaries();
    const protectionAudit = buildProtectionAudit(replayEventCountIndex);
    const allPassed = artifactErrors.length === 0
        && replayEventCountIndex.replayCount === 15
        && schemaPolicySizeRollup.schemaValidationStatus === 'passed'
        && schemaPolicySizeRollup.outputPolicyStatus === 'passed'
        && schemaPolicySizeRollup.sizeAuditStatus === 'passed';

    const summaryGate = {
        schemaVersion: 1,
        gate: allPassed ? SUCCESS_GATE : BLOCKED_GATE,
        status: allPassed ? 'ready' : 'blocked',
        artifactCount: replayEventCountIndex.replayCount,
        sourceObservedCounterTransitionCandidateTotal: aggregateCounterTransitionSummary.sourceObservedCounterTransitionCandidateTotal,
        minEventCount: aggregateCounterTransitionSummary.minEventCount,
        maxEventCount: aggregateCounterTransitionSummary.maxEventCount,
        duplicateKeyTotal: aggregateCounterTransitionSummary.duplicateKeyTotal,
        artifactValidationErrors: artifactErrors,
        finalFactsProduced: false,
        gameplayInterpretationProduced: false
    };

    await writeJson(path.join(summaryRoot.absolutePath, 'summary-gate.json'), summaryGate);
    await writeJson(path.join(summaryRoot.absolutePath, 'replay-event-count-index.json'), replayEventCountIndex);
    await writeJson(path.join(summaryRoot.absolutePath, 'aggregate-counter-transition-summary.json'), aggregateCounterTransitionSummary);
    await writeJson(path.join(summaryRoot.absolutePath, 'schema-policy-size-rollup.json'), schemaPolicySizeRollup);
    await writeJson(path.join(summaryRoot.absolutePath, 'interpretation-boundaries.json'), interpretationBoundaries);
    await writeJson(path.join(summaryRoot.absolutePath, 'protection-audit.json'), protectionAudit);
    await writeMarkdown(path.resolve(REPO_ROOT, 'reports/exact-15-death-validation-compact-summary.md'), [
        '# Exact 15 Death Validation Compact Summary',
        '',
        `Gate: \`${summaryGate.gate}\``,
        '',
        'Task 169 summarized the 15 compact Task 168 `death_validation` artifacts without accessing replay files or running any parser or emission runner.',
        '',
        '## Aggregate',
        '',
        `- artifactCount: ${aggregateCounterTransitionSummary.artifactCount}`,
        `- sourceObservedCounterTransitionCandidateTotal: ${aggregateCounterTransitionSummary.sourceObservedCounterTransitionCandidateTotal}`,
        `- minEventCount: ${aggregateCounterTransitionSummary.minEventCount}`,
        `- maxEventCount: ${aggregateCounterTransitionSummary.maxEventCount}`,
        `- duplicateKeyTotal: ${aggregateCounterTransitionSummary.duplicateKeyTotal}`,
        `- validation statuses: ${aggregateCounterTransitionSummary.allValidationStatuses.join(', ')}`,
        '',
        '## Boundaries',
        '',
        '`eventCount` is preserved only as a source-observed counter transition candidate count. It is not a final fact, canonical truth, attribution, timeline, player identity, objective attribution, or gameplay interpretation.',
        'No new `death_validation.json` artifacts, event rows, field values, raw data, source/canonical/match final facts, or replay-derived gameplay interpretation were emitted.'
    ]);

    return {
        summaryGate,
        replayEventCountIndex,
        aggregateCounterTransitionSummary,
        schemaPolicySizeRollup,
        interpretationBoundaries,
        protectionAudit
    };
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const result = await runExact15DeathValidationCompactSummary({
        inputRoot: args.get('input-root'),
        summaryOutput: args.get('summary-output')
    });
    console.log(JSON.stringify(result.summaryGate, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    main().catch(error => {
        console.error(error);
        process.exitCode = 1;
    });
}
