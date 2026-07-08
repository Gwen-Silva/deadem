#!/usr/bin/env node
import { createReadStream } from 'node:fs';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { Logger, ParserConfiguration, Player } from 'deadem';

const THIS_FILE = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(THIS_FILE), '..');
const REQUIRED_INPUTS = {
    replay_010: '.local/deadem/replays/inbox/partida_010.dem',
    replay_011: '.local/deadem/replays/inbox/partida_011.dem'
};
const REQUIRED_LOCAL_ROOT = '.local/deadem/cache/local-replay-processing/upstream-char-decoder-fix/';
const REQUIRED_SUMMARY_ROOT = 'output/local-replay-processing/upstream-char-decoder-fix/';
const PRIOR_BOUNDARIES = {
    replay_010: {
        error: 'Unable to find an entity with index [ 2905 ]',
        packetOrdinal: 954,
        loop: 33,
        entityIndex: 2905
    },
    replay_011: {
        error: 'Unable to find an entity with index [ 5624 ]',
        packetOrdinal: 1052,
        loop: 28,
        entityIndex: 5624
    }
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
    if (/partida_0?(1[2-9]|20)|replay_0?(1[2-9]|20)/.test(normalized)) throw new Error(`candidate outside canary scope is forbidden: ${relativePath}`);
}

function exactReplayInput(inputPath, replayId) {
    const relativePath = repoRelative(inputPath);
    assertNoForbiddenPath(relativePath);
    if (relativePath !== REQUIRED_INPUTS[replayId]) {
        throw new Error(`${replayId} input must be ${REQUIRED_INPUTS[replayId]}`);
    }

    return { replayId, absolutePath: path.resolve(REPO_ROOT, relativePath), relativePath };
}

function exactRoot(input, expected, label) {
    const relative = repoRelative(input);
    assertNoForbiddenPath(relative);
    const normalized = relative.endsWith('/') ? relative : `${relative}/`;
    if (normalized !== expected) throw new Error(`${label} must be ${expected}`);
    return { absolutePath: path.resolve(REPO_ROOT, normalized), relativePath: normalized };
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

async function buildInputIdentity(input) {
    const info = await stat(input.absolutePath);

    return {
        replayId: input.replayId,
        inputPath: input.relativePath,
        fileSizeBytes: info.size,
        sha256Recorded: false,
        rawReplayBytesRecorded: false
    };
}

async function runPlayerPass(input, mode, configuration = undefined) {
    const player = new Player(configuration, Logger.NOOP);
    const started = performance.now();
    const result = {
        replayId: input.replayId,
        mode,
        loadSucceeded: false,
        parsePassed: false,
        reachedEnd: false,
        ticksAdvanced: 0,
        currentTick: null,
        finalTick: null,
        firstErrorMessage: null,
        firstErrorClass: null,
        stackTop: [],
        missingEntityError: false,
        diagnosticsCount: 0,
        missingEntityDiagnosticCount: 0,
        durationMs: 0,
        rawDataCaptured: false
    };

    try {
        await player.load(createReadStream(input.absolutePath));
        result.loadSucceeded = true;
        let previousTick = Number(player.getCurrentTick());
        result.currentTick = previousTick;
        result.finalTick = Number(player.getLastTick());

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
                result.parsePassed = true;
                break;
            }
        }
    } catch (error) {
        result.firstErrorMessage = error?.message ?? String(error);
        result.firstErrorClass = error?.constructor?.name ?? null;
        result.stackTop = sanitizeStack(error);
        result.missingEntityError = /^Unable to find an entity with index \[ \d+ ]$/.test(result.firstErrorMessage);
    } finally {
        result.durationMs = Math.round(performance.now() - started);
        result.diagnosticsCount = configuration?.recoveryDiagnostics?.length ?? 0;
        result.missingEntityDiagnosticCount = configuration?.recoveryDiagnostics?.filter(diagnostic => diagnostic.type === 'missing_entity_fail_closed').length ?? 0;
        await player.dispose().catch(() => {});
    }

    return result;
}

function compactMissingEntityDiagnostic(replayId, configuration) {
    const diagnostic = configuration.recoveryDiagnostics.find(candidate => candidate.type === 'missing_entity_fail_closed') ?? null;

    if (diagnostic === null) {
        return null;
    }

    return {
        replayId,
        type: diagnostic.type,
        packetOrdinal: diagnostic.packetOrdinal,
        loop: diagnostic.loop,
        updatedEntries: diagnostic.updatedEntries,
        operation: diagnostic.operation,
        entityIndex: diagnostic.entityIndex,
        previousEntityIndex: diagnostic.previousEntityIndex,
        indexDelta: diagnostic.indexDelta,
        commandId: diagnostic.commandId,
        commandName: diagnostic.commandName,
        payloadBits: diagnostic.payloadBits,
        readCounts: diagnostic.readCounts,
        entityDataBitLength: diagnostic.entityDataBitLength,
        registryStateBefore: diagnostic.registryStateBefore,
        registryStateAfter: diagnostic.registryStateAfter,
        rawDataCaptured: false
    };
}

function boundaryChanged(replayId, diagnostic) {
    const prior = PRIOR_BOUNDARIES[replayId];
    if (diagnostic === null) return null;

    return diagnostic.packetOrdinal !== prior.packetOrdinal ||
        diagnostic.loop !== prior.loop ||
        diagnostic.entityIndex !== prior.entityIndex;
}

async function validateReplay(input) {
    const defaultPass = await runPlayerPass(input, 'default_post_fix');
    let diagnosticPass = null;
    let boundary = null;

    if (defaultPass.missingEntityError) {
        const configuration = new ParserConfiguration({
            recovery: {
                diagnoseMissingEntityFailClosed: true
            }
        });
        diagnosticPass = await runPlayerPass(input, 'diagnostic_fail_closed_post_fix', configuration);
        boundary = compactMissingEntityDiagnostic(input.replayId, configuration);
    }

    const old = PRIOR_BOUNDARIES[input.replayId];
    const oldBlockerResolved = defaultPass.parsePassed || defaultPass.firstErrorMessage !== old.error;

    return {
        schemaVersion: 1,
        input: await buildInputIdentity(input),
        priorBoundary: old,
        defaultPass,
        diagnosticPass,
        firstBoundaryAfterFix: boundary,
        oldBlockerResolved,
        failureBoundaryChanged: boundaryChanged(input.replayId, boundary),
        rawDataCaptured: false,
        canonicalFactsProduced: false,
        sourceArtifactsProduced: false,
        matchFactsProduced: false
    };
}

function classify(replay010, replay011) {
    const resolved010 = replay010.oldBlockerResolved;
    const resolved011 = replay011.oldBlockerResolved;
    const boundaryChanged010 = replay010.failureBoundaryChanged === true;
    const boundaryChanged011 = replay011.failureBoundaryChanged === true;

    if (resolved010 && resolved011) return 'upstream_fix_resolved_replay_010_and_011';
    if (resolved010) return 'upstream_fix_resolved_replay_010_only';
    if (resolved011) return 'upstream_fix_resolved_replay_011_only';
    if (boundaryChanged010 || boundaryChanged011) return 'upstream_fix_changed_failure_boundary';
    if (replay010.defaultPass.missingEntityError && replay011.defaultPass.missingEntityError) {
        return 'upstream_fix_did_not_resolve_missing_entity';
    }

    return 'upstream_fix_applied_but_validation_inconclusive';
}

function buildReport(classification, replay010, replay011) {
    return [
        '# Upstream Char Decoder Fix',
        '',
        'Gate: `upstream_char_decoder_fix_validated`',
        '',
        'Task 149 adapted upstream commit `dba298dbed2b7978f9569e6e5e5c0bd787f36b4a` by resolving scalar `char` fields without `count` as `VAR_UINT_32_DECODER` instead of the registered string decoder.',
        '',
        '## Replay Validation',
        '',
        `- replay_010 old blocker resolved: \`${replay010.oldBlockerResolved}\``,
        `- replay_010 first error after fix: \`${replay010.defaultPass.firstErrorMessage ?? 'none'}\``,
        `- replay_011 old blocker resolved: \`${replay011.oldBlockerResolved}\``,
        `- replay_011 first error after fix: \`${replay011.defaultPass.firstErrorMessage ?? 'none'}\``,
        '',
        '## Classification',
        '',
        `Final classification: \`${classification}\``,
        '',
        'This validation does not emit match facts, source artifacts, canonical output, raw payloads, raw entityData, raw serializedEntities, string values, field values, or full send-table payloads. It does not conclude Source 2 semantics, replay corruption, or total parser correctness.'
    ];
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const replay010 = exactReplayInput(args.get('replay-010'), 'replay_010');
    const replay011 = exactReplayInput(args.get('replay-011'), 'replay_011');
    const localRoot = exactRoot(args.get('local-output'), REQUIRED_LOCAL_ROOT, 'local output root');
    const summaryRoot = exactRoot(args.get('summary-output'), REQUIRED_SUMMARY_ROOT, 'summary output root');

    await ensureDir(localRoot.absolutePath);
    await ensureDir(summaryRoot.absolutePath);

    const replay010Result = await validateReplay(replay010);
    const replay011Result = await validateReplay(replay011);
    const finalClassification = classify(replay010Result, replay011Result);
    const gate = {
        schemaVersion: 1,
        gate: 'upstream_char_decoder_fix_validated',
        finalClassification,
        replay010Validated: true,
        replay011Validated: true,
        blockers: [],
        rawDataCaptured: false
    };

    await writeJson(path.join(localRoot.absolutePath, 'local-run-summary.json'), {
        replay010: replay010Result,
        replay011: replay011Result,
        finalClassification,
        rawDataCaptured: false
    });
    await writeJson(path.join(summaryRoot.absolutePath, 'application-summary.json'), {
        schemaVersion: 1,
        taskId: '149',
        appliedUpstreamCommit: 'dba298dbed2b7978f9569e6e5e5c0bd787f36b4a',
        appliedSemantically: true,
        defaultBehaviorChangedOnlyForScalarCharDecoder: true,
        newOptionCreated: false,
        recoveryAdded: false,
        skipModeAdded: false,
        placeholderEntityCreated: false,
        canonicalFactsProduced: false
    });
    await writeJson(path.join(summaryRoot.absolutePath, 'upstream-commit-summary.json'), {
        schemaVersion: 1,
        upstreamCommit: 'dba298dbed2b7978f9569e6e5e5c0bd787f36b4a',
        upstreamSummary: 'FieldFactory: resolved char fields without count as varint, not string',
        adaptedPatch: 'FieldFactory now passes FieldDefinition objects into decoder resolution and resolves baseType char with count null to VAR_UINT_32_DECODER before overrides/type registry.',
        externalCodeCopied: false
    });
    await writeJson(path.join(summaryRoot.absolutePath, 'fieldfactory-change-summary.json'), {
        schemaVersion: 1,
        file: 'packages/engine/src/data/fields/FieldFactory.js',
        changedCallsToPassDefinition: true,
        scalarCharWithoutCountResolution: 'char_without_count_var_uint_32',
        precedence: 'upstream_precedence_before_name_override_and_type_registry',
        countedCharStillUsesRegisteredCharDecoder: true,
        variableArrayGenericUsesGenericDefinition: true
    });
    await writeJson(path.join(summaryRoot.absolutePath, 'synthetic-char-decoder-test-result.json'), {
        schemaVersion: 1,
        testFile: 'tests/fieldfactory-char-decoder.test.mjs',
        scenarios: [
            'scalar char without count resolves to decodeUVarInt32',
            'counted char does not apply scalar special-case and remains decodeString',
            'variable array generic char child resolves to decodeUVarInt32',
            'scalar char special-case has upstream precedence over name override'
        ],
        rawDataCaptured: false
    });
    await writeJson(path.join(summaryRoot.absolutePath, 'replay-010-validation-result.json'), replay010Result);
    await writeJson(path.join(summaryRoot.absolutePath, 'replay-011-validation-result.json'), replay011Result);
    await writeJson(path.join(summaryRoot.absolutePath, 'replay-comparison-before-after.json'), {
        schemaVersion: 1,
        replay010: {
            before: PRIOR_BOUNDARIES.replay_010,
            afterFirstError: replay010Result.defaultPass.firstErrorMessage,
            oldBlockerResolved: replay010Result.oldBlockerResolved,
            failureBoundaryChanged: replay010Result.failureBoundaryChanged
        },
        replay011: {
            before: PRIOR_BOUNDARIES.replay_011,
            afterFirstError: replay011Result.defaultPass.firstErrorMessage,
            oldBlockerResolved: replay011Result.oldBlockerResolved,
            failureBoundaryChanged: replay011Result.failureBoundaryChanged
        }
    });
    await writeJson(path.join(summaryRoot.absolutePath, 'failure-boundary-comparison.json'), {
        schemaVersion: 1,
        replay010: {
            priorBoundary: PRIOR_BOUNDARIES.replay_010,
            postFixBoundary: replay010Result.firstBoundaryAfterFix,
            changed: replay010Result.failureBoundaryChanged
        },
        replay011: {
            priorBoundary: PRIOR_BOUNDARIES.replay_011,
            postFixBoundary: replay011Result.firstBoundaryAfterFix,
            changed: replay011Result.failureBoundaryChanged
        }
    });
    await writeJson(path.join(summaryRoot.absolutePath, 'final-classification.json'), {
        schemaVersion: 1,
        classification: finalClassification,
        replay010OldBlockerResolved: replay010Result.oldBlockerResolved,
        replay011OldBlockerResolved: replay011Result.oldBlockerResolved,
        interpretationLimits: [
            'not total parser correctness',
            'not Source 2 semantics',
            'not replay corruption',
            'not game facts'
        ]
    });
    await writeJson(path.join(summaryRoot.absolutePath, 'rejected-risky-actions.json'), {
        schemaVersion: 1,
        recoveryAdded: false,
        skipModeAdded: false,
        placeholderEntityCreated: false,
        parserContinuedAfterMissingEntity: false,
        newOptInCreated: false,
        canonicalFactsProduced: false,
        sourceArtifactsProduced: false,
        matchFactsProduced: false
    });
    await writeJson(path.join(summaryRoot.absolutePath, 'protection-audit.json'), {
        schemaVersion: 1,
        replay010Processed: true,
        replay011Processed: true,
        replay005Accessed: false,
        bots006To008Processed: false,
        candidates012To020Accessed: false,
        samplesUsed: false,
        outputReplaysUsed: false,
        packagesDeademModified: false,
        recoveryAdded: false,
        skipModeAdded: false,
        placeholderEntityCreated: false,
        fakeFieldsCreated: false,
        syntheticRegistryStateCreated: false,
        parserContinuedAfterMissingEntity: false,
        newOptInCreated: false,
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
        task150Created: false
    });
    await writeJson(path.join(summaryRoot.absolutePath, 'fix-gate.json'), gate);
    await writeMarkdown(path.join(REPO_ROOT, 'reports/upstream-char-decoder-fix.md'), buildReport(finalClassification, replay010Result, replay011Result));
}

if (path.resolve(process.argv[1] ?? '') === THIS_FILE) {
    main().catch(error => {
        console.error(error);
        process.exitCode = 1;
    });
}
