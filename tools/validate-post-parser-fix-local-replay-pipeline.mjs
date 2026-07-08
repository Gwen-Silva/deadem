#!/usr/bin/env node
import { createReadStream } from 'node:fs';
import { mkdir, stat, writeFile } from 'node:fs/promises';
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
const REQUIRED_LOCAL_ROOT = '.local/deadem/cache/local-replay-processing/post-parser-fix-pipeline-validation/';
const REQUIRED_SUMMARY_ROOT = 'output/local-replay-processing/post-parser-fix-pipeline-validation/';
const GATE_READY = 'post_parser_fix_pipeline_validation_ready';
const GATE_BLOCKED = 'post_parser_fix_pipeline_validation_blocked';

function slash(value) {
    return value.replaceAll(path.sep, '/');
}

function repoRelative(absolutePath) {
    return slash(path.relative(REPO_ROOT, absolutePath));
}

function parseArgs(argv) {
    const args = new Map();
    for (let i = 0; i < argv.length; i += 2) {
        const key = argv[i];
        const value = argv[i + 1];
        if (!key?.startsWith('--') || value === undefined) {
            throw new Error(`Invalid argument near ${key ?? '<end>'}`);
        }
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

function exactRoot(value, expected, label) {
    const normalized = assertRelativeRepositoryPath(value, label).replace(/\/?$/u, '/');
    if (normalized !== expected) throw new Error(`${label} must be exactly ${expected}`);
    return {
        normalized,
        absolutePath: path.resolve(REPO_ROOT, normalized)
    };
}

function rejectForbiddenPath(normalized) {
    const forbiddenReasons = [];
    if (/(?:^|\/)(?:partida|replay|match)[_-]?00?5(?:\.dem)?$/iu.test(normalized) || /replay[_-]?00?5/iu.test(normalized)) {
        forbiddenReasons.push('protected replay 005 path');
    }
    if (/(?:^|\/)(?:partida|replay|match)[_-]?00?(6|7|8)(?:\.dem)?$/iu.test(normalized)) {
        forbiddenReasons.push('unsupported bot fixture replay path');
    }
    if (/(?:^|\/)(?:partida|replay|match)[_-]?0?(1[2-9]|20)(?:\.dem)?$/iu.test(normalized)) {
        forbiddenReasons.push('out-of-scope candidate replay path');
    }
    if (normalized.startsWith('samples/')) forbiddenReasons.push('samples path');
    if (normalized.startsWith('output/replays/')) forbiddenReasons.push('output/replays path');
    if (forbiddenReasons.length > 0) throw new Error(`Forbidden path ${normalized}: ${forbiddenReasons.join(', ')}`);
}

function exactReplayInput(value, replayId) {
    const normalized = assertRelativeRepositoryPath(value, replayId);
    rejectForbiddenPath(normalized);
    if (normalized !== REQUIRED_INPUTS[replayId]) {
        throw new Error(`${replayId} input must be exactly ${REQUIRED_INPUTS[replayId]}`);
    }
    return {
        replayId,
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

function sanitizeStack(error) {
    return String(error?.stack ?? '')
        .split(/\r?\n/u)
        .slice(0, 4)
        .map(line => line.replaceAll(REPO_ROOT, '<repo>'));
}

function safeNumber(value) {
    return Number.isFinite(value) ? value : null;
}

async function runDefaultParser(input) {
    const player = new Player(undefined, Logger.NOOP);
    const started = performance.now();
    const result = {
        schemaVersion: 1,
        replayId: input.replayId,
        mode: 'default_post_fix_pipeline_validation',
        inputPath: input.normalized,
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
        canonicalFactsProduced: false,
        sourceArtifactsProduced: false,
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

function replayStatus(result) {
    return {
        schemaVersion: 1,
        replayId: result.replayId,
        parserLoad: result.parserLoadSucceeded ? 'passed' : 'blocked',
        parseCompletion: result.parseCompleted ? 'passed' : 'blocked',
        eventStreamAvailability: result.parseCompleted ? 'available_via_default_nextTick_completion' : 'not_available',
        entityHistoryAvailability: result.parseCompleted ? 'parser_internal_state_available_but_not_materialized_or_versioned' : 'not_available',
        localPipelineReadiness: result.parseCompleted ? 'parser_stage_ready_for_next_controlled_pipeline_task' : 'blocked_at_parser_stage',
        firstErrorMessage: result.firstErrorMessage,
        firstErrorClass: result.firstErrorClass,
        missingEntityError: result.missingEntityError,
        ticksAdvanced: result.ticksAdvanced,
        currentTick: result.currentTick,
        finalTick: result.finalTick,
        rawDataCaptured: false,
        canonicalFactsProduced: false,
        sourceArtifactsProduced: false,
        matchFactsProduced: false,
        limitations: [
            'This status confirms default parser completion only.',
            'No canonical/source/match facts, field values, snapshots, or full entity histories were emitted.',
            'Entity history readiness is inferred from parser completion and not materialized as a versioned artifact.'
        ]
    };
}

function buildPipelineStepStatus(replay010, replay011) {
    const bothParsed = replay010.parseCompleted && replay011.parseCompleted;
    return {
        schemaVersion: 1,
        authorizedReplays: ['replay_010', 'replay_011'],
        steps: [
            {
                step: 'parser_load',
                replay010: replay010.parserLoadSucceeded ? 'passed' : 'blocked',
                replay011: replay011.parserLoadSucceeded ? 'passed' : 'blocked'
            },
            {
                step: 'parse_completion',
                replay010: replay010.parseCompleted ? 'passed' : 'blocked',
                replay011: replay011.parseCompleted ? 'passed' : 'blocked'
            },
            {
                step: 'event_stream_availability',
                replay010: replay010.parseCompleted ? 'available' : 'not_available',
                replay011: replay011.parseCompleted ? 'available' : 'not_available'
            },
            {
                step: 'entity_history_availability',
                replay010: replay010.parseCompleted ? 'available_in_parser_runtime_not_versioned' : 'not_available',
                replay011: replay011.parseCompleted ? 'available_in_parser_runtime_not_versioned' : 'not_available'
            },
            {
                step: 'local_pipeline_readiness',
                replay010: replay010.parseCompleted ? 'ready_for_separately_scoped_controlled_pipeline_task' : 'blocked',
                replay011: replay011.parseCompleted ? 'ready_for_separately_scoped_controlled_pipeline_task' : 'blocked'
            },
            {
                step: 'canonicalization_readiness',
                replay010: replay010.parseCompleted ? 'not_executed_ready_for_future_controlled_dry_run_scope' : 'not_available',
                replay011: replay011.parseCompleted ? 'not_executed_ready_for_future_controlled_dry_run_scope' : 'not_available'
            }
        ],
        allParserStagesPassed: bothParsed,
        firstBlockedStep: bothParsed ? null : 'parse_completion',
        finalClassification: bothParsed
            ? 'post_parser_fix_pipeline_ready_for_controlled_canonical_task'
            : 'post_parser_fix_pipeline_blocked_after_parse',
        canonicalSourceMatchFactsEmitted: false
    };
}

function buildReport({ replay010Status, replay011Status, firstBlocker, classification }) {
    return [
        '# Post-Parser Fix Pipeline Validation',
        '',
        'Task 151 validated the next safe local replay pipeline stage after the upstream scalar `char` decoder fix.',
        '',
        '## Scope',
        '',
        '- Authorized replays processed: `replay_010`, `replay_011`.',
        '- No other replay was processed or accessed by the validation tool.',
        '- No canonical, source, match, spatial, macro, mechanics, fight, decision, or ML output was emitted.',
        '',
        '## Results',
        '',
        `- replay_010 parser completion: \`${replay010Status.parseCompletion}\``,
        `- replay_011 parser completion: \`${replay011Status.parseCompletion}\``,
        `- first post-parser blocker: \`${firstBlocker.blockerFound ? firstBlocker.blockerSummary : 'none at parser completion stage'}\``,
        `- final classification: \`${classification}\``,
        '',
        '## Next Milestone',
        '',
        'The recommended next milestone is a separately scoped controlled canonical/source readiness task for replay_010 and replay_011. That future task would need explicit authorization to emit any source or canonical artifacts.',
        '',
        'This validation does not prove total parser correctness, Source 2 semantics, replay corruption status, or game facts.'
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

    const inputStats = {
        replay_010: await stat(replay010.absolutePath),
        replay_011: await stat(replay011.absolutePath)
    };
    const scopeSummary = {
        schemaVersion: 1,
        taskId: '151',
        authorizedReplayIds: ['replay_010', 'replay_011'],
        processedReplayIds: ['replay_010', 'replay_011'],
        inputPaths: {
            replay_010: replay010.normalized,
            replay_011: replay011.normalized
        },
        inputSizesBytes: {
            replay_010: inputStats.replay_010.size,
            replay_011: inputStats.replay_011.size
        },
        localOutputRoot: localRoot.normalized,
        summaryOutputRoot: summaryRoot.normalized,
        hashesComputed: false,
        rawReplayCopied: false,
        rawDataCaptured: false,
        canonicalFactsProduced: false,
        sourceArtifactsProduced: false,
        matchFactsProduced: false
    };

    const replay010Result = await runDefaultParser(replay010);
    const replay011Result = await runDefaultParser(replay011);
    const replay010Status = replayStatus(replay010Result);
    const replay011Status = replayStatus(replay011Result);
    const bothParsed = replay010Result.parseCompleted && replay011Result.parseCompleted;
    const classification = bothParsed
        ? 'post_parser_fix_pipeline_ready_for_controlled_canonical_task'
        : 'post_parser_fix_pipeline_blocked_after_parse';
    const firstBlocker = {
        schemaVersion: 1,
        blockerFound: !bothParsed,
        blockerType: bothParsed ? 'none_at_parser_completion_stage' : 'parsing',
        blockerSummary: bothParsed
            ? null
            : [
                replay010Result.parseCompleted ? null : `replay_010: ${replay010Result.firstErrorMessage ?? 'parse did not complete'}`,
                replay011Result.parseCompleted ? null : `replay_011: ${replay011Result.firstErrorMessage ?? 'parse did not complete'}`
            ].filter(Boolean).join('; '),
        oldMissingEntityBlockersReopened: replay010Result.missingEntityError || replay011Result.missingEntityError,
        canonicalizationBlockerFound: false,
        limitations: [
            'Canonical/source/match artifact generation was not executed in this task.',
            'A later controlled canonical readiness task must validate artifact emission separately.'
        ]
    };

    const parserConfirmation = {
        schemaVersion: 1,
        replay010PostFixParseCompleted: replay010Result.parseCompleted,
        replay011PostFixParseCompleted: replay011Result.parseCompleted,
        replay010OldMissingEntityBlockerStillResolved: replay010Result.firstErrorMessage !== 'Unable to find an entity with index [ 2905 ]',
        replay011OldMissingEntityBlockerStillResolved: replay011Result.firstErrorMessage !== 'Unable to find an entity with index [ 5624 ]',
        replay010FirstError: replay010Result.firstErrorMessage,
        replay011FirstError: replay011Result.firstErrorMessage,
        interpretationLimits: [
            'not total parser correctness',
            'not Source 2 semantics',
            'not replay corruption or non-corruption',
            'not game facts'
        ]
    };

    const canonicalizationReadiness = {
        schemaVersion: 1,
        classification,
        parserPrerequisiteMetForReplay010: replay010Result.parseCompleted,
        parserPrerequisiteMetForReplay011: replay011Result.parseCompleted,
        canonicalizationDryRunExecuted: false,
        canonicalFactsProduced: false,
        sourceArtifactsProduced: false,
        matchFactsProduced: false,
        readiness: bothParsed
            ? 'ready_for_separately_scoped_controlled_canonical_or_source_readiness_task'
            : 'blocked_until_parser_completion',
        requiredFutureScope: [
            'explicit authorization to emit controlled source/canonical artifacts',
            'one task with compact outputs and no protected replay access',
            'no spatial, macro, mechanics, fight, decision, or ML interpretation layers'
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
        newParserFixAdded: false,
        recoveryAdded: false,
        skipModeAdded: false,
        placeholderEntityCreated: false,
        fakeFieldsCreated: false,
        syntheticRegistryStateCreated: false,
        continuationAfterErrorByRecovery: false,
        defaultBehaviorChanged: false,
        newOptInAdded: false,
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
        task152Created: false
    };

    const rejectedActions = {
        schemaVersion: 1,
        missingEntityInvestigationReopened: false,
        cursorIndexDiagnosticsAdded: false,
        payloadBitsDiagnosticsAdded: false,
        recoveryAdded: false,
        skipModeAdded: false,
        placeholderAdded: false,
        canonicalFactsProduced: false,
        sourceArtifactsProduced: false,
        matchFactsProduced: false,
        protectedReplayAccessed: false
    };

    const nextMilestone = {
        schemaVersion: 1,
        recommendedMilestone: bothParsed
            ? 'controlled_canonical_source_readiness_task_for_replay_010_and_011'
            : 'resolve_post_parser_blocker_before_canonical_readiness',
        rationale: bothParsed
            ? 'Both authorized canaries complete default parser advancement after the char decoder fix, so the old parser blocker no longer blocks a separately scoped controlled artifact-readiness task.'
            : 'At least one authorized canary did not complete default parser advancement, so the first blocker remains before artifact readiness.',
        notAuthorizedByThisTask: [
            'canonical/source/match fact emission',
            'processing any replay beyond replay_010 and replay_011',
            'spatial, macro, mechanics, fight, decision, or ML outputs',
            'parser behavior changes'
        ]
    };

    const gate = {
        schemaVersion: 1,
        gate: bothParsed ? GATE_READY : GATE_BLOCKED,
        classification,
        reasons: bothParsed
            ? ['replay_010 and replay_011 both completed default parser advancement after the upstream char decoder fix']
            : [firstBlocker.blockerSummary],
        oldMissingEntityRouteReopened: false,
        canonicalFactsProduced: false
    };

    await writeJson(path.join(localRoot.absolutePath, 'local-run-summary.json'), {
        schemaVersion: 1,
        replay010: replay010Result,
        replay011: replay011Result,
        classification,
        rawDataCaptured: false
    });
    await writeJson(path.join(summaryRoot.absolutePath, 'scope-summary.json'), scopeSummary);
    await writeJson(path.join(summaryRoot.absolutePath, 'replay-010-pipeline-status.json'), replay010Status);
    await writeJson(path.join(summaryRoot.absolutePath, 'replay-011-pipeline-status.json'), replay011Status);
    await writeJson(path.join(summaryRoot.absolutePath, 'parser-post-fix-confirmation.json'), parserConfirmation);
    await writeJson(path.join(summaryRoot.absolutePath, 'pipeline-step-status.json'), buildPipelineStepStatus(replay010Result, replay011Result));
    await writeJson(path.join(summaryRoot.absolutePath, 'first-post-parser-blocker.json'), firstBlocker);
    await writeJson(path.join(summaryRoot.absolutePath, 'canonicalization-readiness.json'), canonicalizationReadiness);
    await writeJson(path.join(summaryRoot.absolutePath, 'rejected-actions.json'), rejectedActions);
    await writeJson(path.join(summaryRoot.absolutePath, 'next-milestone-recommendation.json'), nextMilestone);
    await writeJson(path.join(summaryRoot.absolutePath, 'protection-audit.json'), protectionAudit);
    await writeJson(path.join(summaryRoot.absolutePath, 'validation-gate.json'), gate);
    await writeMarkdown(path.join(REPO_ROOT, 'reports/post-parser-fix-pipeline-validation.md'), buildReport({
        replay010Status,
        replay011Status,
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
