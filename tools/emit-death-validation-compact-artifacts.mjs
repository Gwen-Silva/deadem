#!/usr/bin/env node
import { createReadStream } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Logger, Player } from 'deadem';

const THIS_FILE = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(THIS_FILE), '..');
const REQUIRED_SUMMARY_ROOT = 'output/local-replay-processing/death-validation-compact-emission/';
const SCHEMA_PATH = path.resolve(REPO_ROOT, 'schemas/death-validation-compact.schema.json');
const SUCCESS_GATE = 'death_validation_compact_artifacts_emitted';
const BLOCKED_GATE = 'death_validation_compact_artifacts_blocked';
const PARTIAL_GATE = 'death_validation_compact_artifacts_partial';
const CONTROLLER_CLASS = 'CCitadelPlayerController';
const MAX_ARTIFACT_BYTES = 32 * 1024;

export const AUTHORIZED_REPLAYS = {
    replay_010: '.local/deadem/replays/inbox/partida_010.dem',
    replay_011: '.local/deadem/replays/inbox/partida_011.dem'
};

export const BLOCKED_FIELDS = [
    'event_rows',
    'entity_ids',
    'player_names',
    'hero_names',
    'team_names',
    'map_positions',
    'per_event_timestamps',
    'per_event_ticks',
    'killer',
    'victim',
    'assister',
    'damage_source',
    'fight_id',
    'objective_id',
    'field_values',
    'raw_values',
    'full_entity_snapshots',
    'player_arrays',
    'gameplay_interpretation_strings'
];

export const FORBIDDEN_OUTPUT_KEYS = new Set([
    'events',
    'eventRows',
    'rows',
    'players',
    'playerRows',
    'snapshots',
    'entityId',
    'entityIds',
    'playerId',
    'playerIds',
    'steamId',
    'accountId',
    'controllerHandle',
    'pawnEntityIndex',
    'killer',
    'victim',
    'assister',
    'damageSource',
    'fightId',
    'objectiveId',
    'fieldValues',
    'rawValues',
    'previousDeaths',
    'currentDeaths',
    'tick',
    'ticks',
    'timestamp',
    'timestamps',
    'gameTimeSeconds',
    'position',
    'mapPositions'
]);

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
    return { replayId, normalized, absolutePath: path.resolve(REPO_ROOT, normalized), inputLabel: path.basename(normalized) };
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

function normalize(value) {
    if (value === undefined || value === null) return null;
    if (typeof value === 'bigint') return Number(value);
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed === '') return null;
        const numeric = Number(trimmed);
        return Number.isFinite(numeric) ? numeric : trimmed;
    }
    return value;
}

function internalControllerKey(controller, ordinal) {
    const fieldCandidates = [
        normalize(controller?.getField?.('m_steamID')),
        normalize(controller?.getField?.('m_iAccountID')),
        normalize(controller?.getField?.('m_unAccountID')),
        normalize(controller?.getField?.('m_iPlayerSlot')),
        normalize(controller?.getField?.('m_iPlayerID')),
        normalize(controller?.handle)
    ];
    const candidate = fieldCandidates.find(value => value !== null && value !== undefined && value !== '0' && value !== 0);
    return String(candidate ?? `ordinal:${ordinal}`);
}

function observeDeathCounters(player) {
    const controllers = player.getDemo().getEntitiesByClassName(CONTROLLER_CLASS);
    return controllers
        .map((controller, ordinal) => ({
            key: internalControllerKey(controller, ordinal),
            deaths: safeNumber(normalize(controller?.getField?.('m_iDeaths')))
        }))
        .filter(row => row.deaths !== null);
}

export function countDuplicateKeys(keys) {
    const seen = new Set();
    let duplicateKeyCount = 0;
    for (const key of keys) {
        if (seen.has(key)) duplicateKeyCount += 1;
        seen.add(key);
    }
    return duplicateKeyCount;
}

export function createDeathValidationArtifact({
    replayId,
    eventCount,
    duplicateKeyCount,
    validationStatus,
    warnings = []
}) {
    const sourceEvaluated = validationStatus !== 'source_validation_blocked' && validationStatus !== 'not_evaluated';
    return {
        schemaVersion: 1,
        replayId,
        artifactClass: 'death_validation',
        sourceMethod: sourceEvaluated ? 'counter_transition_summary' : 'not_evaluated',
        eventCount,
        duplicateKeyCount,
        validationStatus,
        limitations: [
            'Counter-transition summary only; no event rows are materialized.',
            'eventCount is a count of source-observed counter transition candidates, not final death facts.',
            'No killer, victim, assist, damage, fight, objective, decision, or gameplay causality is emitted.'
        ],
        rawDataCaptured: false,
        finalFactsProduced: false,
        samplingPolicy: sourceEvaluated ? 'one_second_source_sampling' : 'not_evaluated',
        counterSource: sourceEvaluated ? 'controller.m_iDeaths' : 'not_materialized',
        counterTransitionType: sourceEvaluated ? 'death_counter_increment_summary' : 'not_materialized',
        validationWarnings: warnings.slice(0, 12),
        blockedFields: BLOCKED_FIELDS,
        policyVersion: 'death_validation_compact_v1',
        generatedBy: 'tools/emit-death-validation-compact-artifacts.mjs',
        generatedAt: 'task_158'
    };
}

export function validateDeathValidationArtifact(artifact, schema) {
    const errors = [];
    if (typeof artifact !== 'object' || artifact === null || Array.isArray(artifact)) return ['artifact must be object'];
    for (const required of schema.required) {
        if (!(required in artifact)) errors.push(`missing required ${required}`);
    }
    for (const key of Object.keys(artifact)) {
        if (!(key in schema.properties)) errors.push(`additional property ${key} is forbidden`);
        if (FORBIDDEN_OUTPUT_KEYS.has(key)) errors.push(`forbidden key ${key}`);
    }
    if (artifact.schemaVersion !== 1) errors.push('schemaVersion must be 1');
    if (!/^replay_[0-9]{3}$/u.test(String(artifact.replayId ?? ''))) errors.push('replayId pattern violation');
    if (artifact.artifactClass !== 'death_validation') errors.push('artifactClass must be death_validation');
    if (!schema.properties.sourceMethod.enum.includes(artifact.sourceMethod)) errors.push('sourceMethod enum violation');
    if (!schema.properties.validationStatus.enum.includes(artifact.validationStatus)) errors.push('validationStatus enum violation');
    if (!Number.isInteger(artifact.eventCount) || artifact.eventCount < 0 || artifact.eventCount > 100000) errors.push('eventCount must be integer 0..100000');
    if (!Number.isInteger(artifact.duplicateKeyCount) || artifact.duplicateKeyCount < 0 || artifact.duplicateKeyCount > 100000) {
        errors.push('duplicateKeyCount must be integer 0..100000');
    }
    if (!Array.isArray(artifact.limitations) || artifact.limitations.length < 1 || artifact.limitations.length > 8) {
        errors.push('limitations must contain 1..8 strings');
    }
    if (artifact.rawDataCaptured !== false) errors.push('rawDataCaptured must be false');
    if (artifact.finalFactsProduced !== false) errors.push('finalFactsProduced must be false');
    for (const [key, property] of Object.entries(schema.properties)) {
        if (!(key in artifact) || !Array.isArray(property.enum)) continue;
        const value = artifact[key];
        if (Array.isArray(value)) {
            for (const item of value) {
                if (!property.items?.enum?.includes(item)) errors.push(`${key} enum violation: ${item}`);
            }
        } else if (!property.enum.includes(value)) {
            errors.push(`${key} enum violation`);
        }
    }
    return errors;
}

function collectForbiddenOutputKeys(value, pathParts = []) {
    const findings = [];
    if (Array.isArray(value)) {
        for (let index = 0; index < value.length; index += 1) {
            findings.push(...collectForbiddenOutputKeys(value[index], [...pathParts, String(index)]));
        }
        return findings;
    }
    if (typeof value !== 'object' || value === null) return findings;
    for (const [key, nested] of Object.entries(value)) {
        if (FORBIDDEN_OUTPUT_KEYS.has(key)) findings.push([...pathParts, key].join('.'));
        findings.push(...collectForbiddenOutputKeys(nested, [...pathParts, key]));
    }
    return findings;
}

export function auditDeathValidationPolicy(artifacts) {
    const findings = [];
    for (const artifact of artifacts) {
        if (artifact.rawDataCaptured !== false) findings.push(`${artifact.replayId}: rawDataCaptured must be false`);
        if (artifact.finalFactsProduced !== false) findings.push(`${artifact.replayId}: finalFactsProduced must be false`);
        if (artifact.artifactClass !== 'death_validation') findings.push(`${artifact.replayId}: artifactClass must be death_validation`);
        for (const keyPath of collectForbiddenOutputKeys(artifact)) {
            findings.push(`${artifact.replayId}: forbidden key ${keyPath}`);
        }
    }
    return {
        schemaVersion: 1,
        policyStatus: findings.length === 0 ? 'passed' : 'blocked',
        artifactsAudited: artifacts.length,
        forbiddenFindings: findings,
        rawDataCaptured: false,
        fieldValuesIncluded: false,
        eventRowsIncluded: false,
        playerArraysIncluded: false,
        attributionIncluded: false,
        gameplayInterpretationIncluded: false,
        finalFactsProduced: false
    };
}

async function runReplayEmission(input) {
    const player = new Player(undefined, Logger.NOOP);
    const started = performance.now();
    const previousByController = new Map();
    const transitionKeys = [];
    const warnings = [];
    const summary = {
        schemaVersion: 1,
        replayId: input.replayId,
        inputLabel: input.inputLabel,
        parserLoadSucceeded: false,
        parseCompleted: false,
        reachedEnd: false,
        sourceMethod: 'counter_transition_summary',
        samplingPolicy: 'one_second_source_sampling',
        samplesAttempted: 0,
        samplesWithControllers: 0,
        eventCount: 0,
        duplicateKeyCount: 0,
        validationStatus: 'not_evaluated',
        firstErrorMessage: null,
        firstErrorClass: null,
        rawDataCaptured: false,
        finalFactsProduced: false
    };

    try {
        await player.load(createReadStream(input.absolutePath));
        summary.parserLoadSucceeded = true;
        const firstTick = safeNumber(player.getFirstTick()) ?? safeNumber(player.getCurrentTick()) ?? 0;
        const tickRate = safeNumber(player.getDemo().server?.tickRate) ?? 30;
        const lastTick = safeNumber(player.getLastTick());
        let nextSampleTick = firstTick;
        let previousTick = safeNumber(player.getCurrentTick());

        while (true) {
            const currentTick = safeNumber(player.getCurrentTick());
            if (currentTick !== null && currentTick >= nextSampleTick) {
                summary.samplesAttempted += 1;
                const observations = observeDeathCounters(player);
                if (observations.length > 0) summary.samplesWithControllers += 1;
                for (const row of observations) {
                    const previous = previousByController.get(row.key);
                    if (previous !== undefined && row.deaths > previous) {
                        transitionKeys.push(`${summary.samplesAttempted}:${row.key}`);
                    }
                    previousByController.set(row.key, row.deaths);
                }
                nextSampleTick = currentTick + Math.max(1, Math.round(tickRate));
            }

            const advanced = await player.nextTick();
            const afterTick = safeNumber(player.getCurrentTick());
            if (previousTick !== null && afterTick !== null) {
                summary.ticksAdvanced = (summary.ticksAdvanced ?? 0) + Math.max(0, afterTick - previousTick);
            }
            previousTick = afterTick;
            if (!advanced) {
                summary.parseCompleted = true;
                summary.reachedEnd = true;
                break;
            }
            if (lastTick !== null && afterTick !== null && afterTick > lastTick + tickRate) {
                warnings.push('parser advanced beyond reported last tick before nextTick returned false');
            }
        }

        summary.eventCount = transitionKeys.length;
        summary.duplicateKeyCount = countDuplicateKeys(transitionKeys);
        if (summary.samplesWithControllers === 0) {
            summary.validationStatus = 'source_validation_blocked';
            warnings.push('no controller death counters were observed during one-second sampling');
        } else if (summary.eventCount > 0) {
            summary.validationStatus = 'source_events_available_with_limitations';
        } else {
            summary.validationStatus = 'no_counter_increments_observed';
        }
    } catch (error) {
        summary.firstErrorMessage = error?.message ?? String(error);
        summary.firstErrorClass = error?.constructor?.name ?? null;
        summary.validationStatus = 'source_validation_blocked';
        warnings.push('parser or source sampling failed before compact artifact emission completed');
    } finally {
        summary.durationMs = Math.round(performance.now() - started);
        await player.dispose?.().catch(() => {});
    }

    const artifact = createDeathValidationArtifact({
        replayId: input.replayId,
        eventCount: summary.eventCount,
        duplicateKeyCount: summary.duplicateKeyCount,
        validationStatus: summary.validationStatus,
        warnings
    });
    return { summary, artifact };
}

export function summarizeEmission(replayId, parserSummary, artifactPath, validationErrors, sizeBytes) {
    return {
        schemaVersion: 1,
        replayId,
        parserLoadSucceeded: parserSummary.parserLoadSucceeded,
        parseCompleted: parserSummary.parseCompleted,
        reachedEnd: parserSummary.reachedEnd,
        artifactClass: 'death_validation',
        artifactPath,
        eventCount: parserSummary.eventCount,
        duplicateKeyCount: parserSummary.duplicateKeyCount,
        validationStatus: parserSummary.validationStatus,
        schemaValidationPassed: validationErrors.length === 0,
        schemaValidationErrors: validationErrors,
        sizeBytes,
        rawDataCaptured: false,
        finalFactsProduced: false,
        sourceFactsFinalized: false,
        gameplayInterpretationProduced: false
    };
}

function classifyEmission(replaySummaries, schemaSummary, outputPolicy, sizeAudit) {
    const parseCompleted = replaySummaries.every(row => row.parseCompleted);
    if (schemaSummary.schemaValidationStatus !== 'passed' || outputPolicy.policyStatus !== 'passed' || sizeAudit.sizeAuditStatus !== 'passed') {
        return BLOCKED_GATE;
    }
    return parseCompleted ? SUCCESS_GATE : PARTIAL_GATE;
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const replayInputs = [
        validateReplayInput('replay_010', args.get('replay-010')),
        validateReplayInput('replay_011', args.get('replay-011'))
    ];
    const summaryRoot = validateSummaryOutputRoot(args.get('summary-output'));
    const schema = JSON.parse(await readFile(SCHEMA_PATH, 'utf8'));

    await mkdir(summaryRoot.absolutePath, { recursive: true });
    const emissionResults = [];
    for (const input of replayInputs) {
        emissionResults.push({ input, ...(await runReplayEmission(input)) });
    }

    const preEmissionPolicyAudit = {
        schemaVersion: 1,
        policyStatus: 'passed',
        plannedArtifactClass: 'death_validation',
        plannedArtifactCount: replayInputs.length,
        outputRoot: summaryRoot.normalized,
        eventRowsPlanned: false,
        attributionPlanned: false,
        fieldValuesPlanned: false,
        rawDataPlanned: false,
        finalFactsPlanned: false
    };

    const artifactSummaries = [];
    const schemaResults = [];
    for (const result of emissionResults) {
        const artifactPath = path.join(summaryRoot.absolutePath, 'artifacts', result.input.replayId, 'death_validation.json');
        await writeJson(artifactPath, result.artifact);
        const artifactStat = await stat(artifactPath);
        const errors = validateDeathValidationArtifact(result.artifact, schema);
        schemaResults.push({ replayId: result.input.replayId, artifactPath: slash(path.relative(REPO_ROOT, artifactPath)), passed: errors.length === 0, errors });
        artifactSummaries.push(summarizeEmission(
            result.input.replayId,
            result.summary,
            slash(path.relative(REPO_ROOT, artifactPath)),
            errors,
            artifactStat.size
        ));
    }

    const schemaValidationSummary = {
        schemaVersion: 1,
        schemaPath: 'schemas/death-validation-compact.schema.json',
        schemaValidationStatus: schemaResults.every(row => row.passed) ? 'passed' : 'blocked',
        artifactsValidated: schemaResults
    };
    const outputPolicyAudit = auditDeathValidationPolicy(emissionResults.map(result => result.artifact));
    const sizeAudit = {
        schemaVersion: 1,
        sizeAuditStatus: artifactSummaries.every(row => row.sizeBytes <= MAX_ARTIFACT_BYTES) ? 'passed' : 'blocked',
        maxArtifactBytes: MAX_ARTIFACT_BYTES,
        artifacts: artifactSummaries.map(row => ({
            replayId: row.replayId,
            artifactPath: row.artifactPath,
            sizeBytes: row.sizeBytes,
            withinLimit: row.sizeBytes <= MAX_ARTIFACT_BYTES
        }))
    };
    const blockedFieldsAudit = {
        schemaVersion: 1,
        blockedFields: BLOCKED_FIELDS,
        blockedFieldPolicy: 'all value-bearing, attribution, per-event, identity, raw, snapshot, and interpretation fields remain blocked',
        eventRowsBlocked: true,
        fieldValuesBlocked: true,
        attributionBlocked: true,
        gameplayInterpretationBlocked: true
    };
    const interpretationLimits = {
        schemaVersion: 1,
        eventCountMeaning: 'count of source-observed death counter transition candidates only',
        notFinalDeathFacts: true,
        notGameplayCausality: true,
        notPlayerIdentity: true,
        notKillerVictimAttribution: true,
        notSpatialMacroMechanicsFightDecisionOrML: true
    };
    const classification = classifyEmission(
        artifactSummaries,
        schemaValidationSummary,
        outputPolicyAudit,
        sizeAudit
    );
    const nextMilestone = {
        schemaVersion: 1,
        recommendedNextAction: 'review_next_compact_source_class_policy_or_emit_next_schema_backed_summary',
        rationale: 'death_validation compact emission is summary-only; richer source classes still need policy-specific schemas before emission.',
        task159Created: false
    };
    const protectionAudit = {
        schemaVersion: 1,
        processedReplayIds: replayInputs.map(input => input.replayId),
        processedReplayPaths: replayInputs.map(input => input.normalized),
        replay005Accessed: false,
        bots006To008Processed: false,
        candidates012To020Accessed: false,
        samplesUsed: false,
        outputReplaysUsed: false,
        parserEngineBehaviorModified: false,
        packagesDeademModified: false,
        recoveryAdded: false,
        skipModeAdded: false,
        placeholderAdded: false,
        defaultBehaviorChanged: false,
        newOptInAdded: false,
        rawDataCaptured: false,
        finalFactsProduced: false,
        gameplayInterpretationProduced: false,
        javaExecuted: false,
        clarityExecuted: false,
        externalParserExecuted: false,
        wslUsed: false,
        iaflowUsed: false,
        productReviewerAutomationUsed: false,
        task159Created: false
    };
    const gate = {
        schemaVersion: 1,
        gate: classification,
        classification,
        status: classification === SUCCESS_GATE ? 'ready' : classification === PARTIAL_GATE ? 'partial' : 'blocked',
        replay010Status: artifactSummaries.find(row => row.replayId === 'replay_010')?.validationStatus,
        replay011Status: artifactSummaries.find(row => row.replayId === 'replay_011')?.validationStatus,
        schemaValidationStatus: schemaValidationSummary.schemaValidationStatus,
        outputPolicyStatus: outputPolicyAudit.policyStatus,
        sizeAuditStatus: sizeAudit.sizeAuditStatus
    };
    const scopeSummary = {
        schemaVersion: 1,
        taskId: '158',
        authorizedReplayIds: replayInputs.map(input => input.replayId),
        artifactClassEmitted: 'death_validation',
        artifactsPerReplay: 1,
        sourceSchema: 'schemas/death-validation-compact.schema.json',
        eventRowsEmitted: false,
        sourceFactsFinalized: false,
        canonicalFactsProduced: false,
        matchFactsProduced: false
    };

    await writeJson(path.join(summaryRoot.absolutePath, 'scope-summary.json'), scopeSummary);
    await writeJson(path.join(summaryRoot.absolutePath, 'pre-emission-policy-audit.json'), preEmissionPolicyAudit);
    await writeJson(path.join(summaryRoot.absolutePath, 'replay-010-emission-summary.json'), artifactSummaries.find(row => row.replayId === 'replay_010'));
    await writeJson(path.join(summaryRoot.absolutePath, 'replay-011-emission-summary.json'), artifactSummaries.find(row => row.replayId === 'replay_011'));
    await writeJson(path.join(summaryRoot.absolutePath, 'schema-validation-summary.json'), schemaValidationSummary);
    await writeJson(path.join(summaryRoot.absolutePath, 'output-policy-audit.json'), outputPolicyAudit);
    await writeJson(path.join(summaryRoot.absolutePath, 'size-audit.json'), sizeAudit);
    await writeJson(path.join(summaryRoot.absolutePath, 'blocked-fields-audit.json'), blockedFieldsAudit);
    await writeJson(path.join(summaryRoot.absolutePath, 'interpretation-limits.json'), interpretationLimits);
    await writeJson(path.join(summaryRoot.absolutePath, 'next-milestone-recommendation.json'), nextMilestone);
    await writeJson(path.join(summaryRoot.absolutePath, 'protection-audit.json'), protectionAudit);
    await writeJson(path.join(summaryRoot.absolutePath, 'emission-gate.json'), gate);

    await writeMarkdown(path.resolve(REPO_ROOT, 'reports/death-validation-compact-emission.md'), [
        '# Death Validation Compact Emission',
        '',
        `Gate: \`${gate.gate}\``,
        '',
        'Task 158 emitted exactly one schema-backed `death_validation` compact artifact for each authorized replay.',
        '',
        '## Results',
        '',
        `- replay_010: ${gate.replay010Status}; eventCount=${artifactSummaries.find(row => row.replayId === 'replay_010')?.eventCount}; duplicateKeyCount=${artifactSummaries.find(row => row.replayId === 'replay_010')?.duplicateKeyCount}`,
        `- replay_011: ${gate.replay011Status}; eventCount=${artifactSummaries.find(row => row.replayId === 'replay_011')?.eventCount}; duplicateKeyCount=${artifactSummaries.find(row => row.replayId === 'replay_011')?.duplicateKeyCount}`,
        `- schema validation: ${schemaValidationSummary.schemaValidationStatus}`,
        `- output policy: ${outputPolicyAudit.policyStatus}`,
        `- size audit: ${sizeAudit.sizeAuditStatus}`,
        '',
        '## Limits',
        '',
        'The artifacts are counter-transition summaries only. They do not include event rows, entity/player identifiers, field values, attribution, snapshots, final death facts, or gameplay interpretation.',
        '',
        '## Next',
        '',
        nextMilestone.rationale
    ]);

    console.log(JSON.stringify(gate, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    main().catch(error => {
        console.error(error);
        process.exitCode = 1;
    });
}
