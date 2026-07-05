#!/usr/bin/env node
import { createReadStream } from 'node:fs';
import { existsSync } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { Logger, ParserConfiguration, Player } from 'deadem';
import DemoPacketHandler from '../packages/engine/src/handlers/DemoPacketHandler.js';

const THIS_FILE = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(THIS_FILE), '..');
const AUTHORIZED_REPLAY_ID = ['replay', '010'].join('_');
const AUTHORIZED_INPUT = '.local/deadem/replays/inbox/partida_010.dem';
const REQUIRED_LOCAL_ROOT = '.local/deadem/cache/local-replay-processing/replay_010/loop-26-fieldpath-59-runtime-field-definition/';
const REQUIRED_SUMMARY_ROOT = 'output/local-replay-processing/replay_010-loop-26-fieldpath-59-runtime-field-definition/';
const TASK105_ERROR = 'Unable to find an entity with index [ 2905 ]';
const TASK114_ROOT = 'output/local-replay-processing/replay_010-loop-26-fieldpath-59-decoder-contract/';
const TARGET_PACKET_ORDINAL = 953;
const TARGET_LOOP = 26;
const TARGET_FIELD_PATH_ID = 59;
const TARGET_SERIALIZER = 'CCitadel_Ability_Familiar_HelpingHands';
const LOOP_26_FIELD_PATHS = [0, 1, 24, 56, 3373, 58, 59];
const NEARBY_FIELD_PATHS = [56, 57, 58, 59, 60];
const CAPTURE_FIELD_PATHS = Array.from(new Set([...LOOP_26_FIELD_PATHS, ...NEARBY_FIELD_PATHS])).sort((a, b) => a - b);
const SAMPLES_TOKEN = ['samples'].join('');
const OUTPUT_REPLAYS_TOKEN = ['output', 'replays'].join('/');
const ENGINE_IMPLEMENTATION_FILES = [
    'packages/engine/src/ParserConfiguration.js',
    'packages/engine/src/handlers/DemoPacketHandler.js',
    'packages/engine/src/handlers/DemoMessageHandler.js',
    'packages/engine/src/data/fields/Serializer.js',
    'packages/engine/src/data/fields/FieldDefinition.js',
    'packages/engine/src/data/fields/FieldFactory.js'
];

function slash(value) {
    return String(value).replaceAll(path.sep, '/');
}

function repoRelative(value) {
    return slash(path.relative(REPO_ROOT, path.resolve(REPO_ROOT, value)));
}

function assertNoForbiddenReplayPath(relativePath, replayId) {
    const normalized = slash(relativePath).toLowerCase();
    if (replayId !== AUTHORIZED_REPLAY_ID) throw new Error(`unsupported replay id: ${replayId}`);
    if (normalized.includes(`${SAMPLES_TOKEN}/`)) throw new Error(`samples path is forbidden: ${relativePath}`);
    if (normalized.includes(`${OUTPUT_REPLAYS_TOKEN}/`)) throw new Error(`output/replays path is forbidden: ${relativePath}`);
    if (normalized.endsWith('.dem') && normalized !== AUTHORIZED_INPUT) throw new Error(`unauthorized replay input: ${relativePath}`);
    if (/partida_00?5|replay_00?5/.test(normalized)) throw new Error(`protected replay path is forbidden: ${relativePath}`);
    if (/partida_00?[6-8]|replay_00?[6-8]/.test(normalized)) throw new Error(`bot fixture path is forbidden: ${relativePath}`);
    if (/partida_0?(1[1-9]|20)|replay_0?(1[1-9]|20)/.test(normalized)) throw new Error(`candidate outside canary scope is forbidden: ${relativePath}`);
}

export function validateInputPath(inputPath, replayId) {
    const relativePath = repoRelative(inputPath);
    assertNoForbiddenReplayPath(relativePath, replayId);
    if (relativePath !== AUTHORIZED_INPUT) throw new Error(`Task 115 authorizes only ${AUTHORIZED_INPUT}`);
    return { absolutePath: path.resolve(REPO_ROOT, relativePath), relativePath };
}

function exactRoot(input, expected, label) {
    const relative = repoRelative(input);
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

async function readJson(relativePath) {
    return JSON.parse(await readFile(path.join(REPO_ROOT, relativePath), 'utf8'));
}

async function sha256File(filePath) {
    const hash = crypto.createHash('sha256');
    hash.update(await readFile(filePath));
    return hash.digest('hex');
}

function sanitizeStack(error) {
    const repoFileUrl = `file:///${slash(REPO_ROOT)}/`;
    return String(error?.stack ?? '')
        .replaceAll(repoFileUrl, 'file://<repo>/')
        .split(/\r?\n/)
        .slice(0, 6);
}

async function buildInputIdentity(input) {
    const info = await stat(input.absolutePath);
    return {
        schemaVersion: 1,
        replayId: AUTHORIZED_REPLAY_ID,
        inputPath: input.relativePath,
        sizeBytes: info.size,
        sha256: await sha256File(input.absolutePath),
        authorizedByTask: '115',
        rawBytesCommitted: false
    };
}

async function runAdvancementPass({ input, mode, configuration, captureRuntime = false }) {
    const player = new Player(configuration, Logger.NOOP);
    const started = performance.now();
    const result = {
        mode,
        diagnosticsEnabled: mode === 'diagnostic_runtime_definition_capture',
        recoveryActionsEnabled: false,
        expectedFailureReproduced: false,
        reachedEnd: false,
        ticksAdvanced: 0,
        currentTick: null,
        finalTick: null,
        errorMessage: '',
        stackTop: [],
        runtimeCaptureStatus: captureRuntime ? 'not_reached' : 'not_requested',
        durationMs: 0
    };
    let runtimeCapture = null;

    try {
        await player.load(createReadStream(input.absolutePath));
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
        result.expectedFailureReproduced = error?.message === TASK105_ERROR;
        result.errorMessage = error?.message ?? String(error);
        result.stackTop = sanitizeStack(error);
        if (captureRuntime) {
            runtimeCapture = captureRuntimeDefinitions(player);
            result.runtimeCaptureStatus = runtimeCapture.captureStatus;
        }
    } finally {
        result.durationMs = Math.round(performance.now() - started);
        await player.dispose().catch(() => {});
    }

    return { result, runtimeCapture };
}

function captureRuntimeDefinitions(player) {
    const demo = findDemo(player);
    if (demo === null) {
        return { captureStatus: 'demo_not_found', serializerFound: false, fieldPaths: [] };
    }

    const serializer = findSerializer(demo, TARGET_SERIALIZER);
    if (serializer === null) {
        return { captureStatus: 'serializer_not_found', serializerFound: false, fieldPaths: [] };
    }

    const fieldPaths = CAPTURE_FIELD_PATHS.map(fieldPathId => serializer.describeFieldPathId(fieldPathId));
    const target = fieldPaths.find(item => item.fieldPathId === TARGET_FIELD_PATH_ID) ?? null;
    return {
        captureStatus: target?.resolvable === true ? 'captured' : 'target_not_resolvable',
        serializerFound: true,
        serializerName: serializer.key.name,
        serializerVersion: serializer.key.version,
        fieldCount: serializer.fields.length,
        fieldPaths,
        valuesIncluded: false,
        rawPayloadIncluded: false
    };
}

function findDemo(player) {
    const candidates = [
        player.demo,
        player._demo,
        player.engine?.demo,
        player._engine?.demo,
        player.parser?.demo,
        player._parser?.demo
    ];
    for (const candidate of candidates) {
        if (looksDemo(candidate)) return candidate;
    }

    for (const name of Object.getOwnPropertyNames(player)) {
        const value = player[name];
        if (looksDemo(value)) return value;
        if (looksDemo(value?.demo)) return value.demo;
        if (looksDemo(value?._demo)) return value._demo;
    }

    return null;
}

function looksDemo(value) {
    return value !== null &&
        typeof value === 'object' &&
        typeof value.getEntity === 'function' &&
        typeof value.registerSerializer === 'function';
}

function findSerializer(root, serializerName) {
    const seen = new Set();
    const queue = [root];

    while (queue.length > 0) {
        const current = queue.shift();
        if (current === null || typeof current !== 'object' || seen.has(current)) continue;
        seen.add(current);
        if (looksSerializer(current, serializerName)) return current;

        if (current instanceof Map) {
            for (const value of current.values()) {
                if (looksSerializer(value, serializerName)) return value;
                if (value !== null && typeof value === 'object') queue.push(value);
            }
            continue;
        }

        for (const name of Object.getOwnPropertyNames(current)) {
            const value = current[name];
            if (looksSerializer(value, serializerName)) return value;
            if (value instanceof Map) {
                queue.push(value);
            }
        }
    }

    return null;
}

function looksSerializer(value, serializerName) {
    return value !== null &&
        typeof value === 'object' &&
        value.key?.name === serializerName &&
        Array.isArray(value.fields) &&
        typeof value.describeFieldPathId === 'function';
}

export function classifyRuntimeVarType(definition) {
    const rawType = definition?.rawType ?? null;
    const baseType = definition?.baseType ?? null;
    if (rawType === null || baseType === null) return 'unknown';
    if (['char', 'CUtlString', 'CUtlSymbolLarge'].includes(baseType)) return 'string_like';
    if (/^(u?int|float|GameTime_t|CNetworkedQuantizedFloat)/.test(baseType)) return 'numeric_like';
    if (definition.pointer === true) return 'pointer_or_table_like';
    if (definition.generic !== null) return 'generic_container_like';
    if (definition.count !== null) return 'fixed_array_like';
    return 'other';
}

function compactRuntimeFieldPath(item) {
    return {
        fieldPathId: item.fieldPathId,
        fieldPath: item.fieldPath ?? null,
        resolvable: item.resolvable,
        flattenedFieldName: item.flattenedFieldName ?? null,
        originalSerializerFieldName: item.originalSerializerFieldName ?? null,
        varType: item.definition?.rawType ?? null,
        baseType: item.definition?.baseType ?? null,
        generic: item.definition?.generic ?? null,
        count: item.definition?.count ?? null,
        pointer: item.definition?.pointer ?? null,
        runtimeVarTypeClassification: classifyRuntimeVarType(item.definition),
        decoderResolutionSource: item.decoderResolution?.source ?? null,
        decoderDescriptorType: item.decoderResolution?.descriptorType ?? null,
        decoderFunctionName: item.decoderFunctionName ?? null,
        storageType: item.storage?.type ?? null,
        storageDimension: item.storage?.dimension ?? null,
        storageSigned: item.storage?.signed ?? null,
        storageBool: item.storage?.bool ?? null,
        fieldModel: item.fieldModel ?? null,
        fieldPathKind: item.fieldPathKind ?? null,
        parentChain: item.parentChain ?? [],
        construction: item.construction ?? null,
        valuesIncluded: false,
        rawPayloadIncluded: false
    };
}

export function buildRuntimeSerializerSummary(runtimeCapture) {
    const fieldPaths = runtimeCapture.fieldPaths ?? [];
    const compactFieldPaths = fieldPaths.map(compactRuntimeFieldPath);
    return {
        schemaVersion: 1,
        replayId: AUTHORIZED_REPLAY_ID,
        serializerName: runtimeCapture.serializerName ?? TARGET_SERIALIZER,
        serializerVersion: runtimeCapture.serializerVersion ?? null,
        serializerFound: runtimeCapture.serializerFound === true,
        captureStatus: runtimeCapture.captureStatus,
        fieldCount: runtimeCapture.fieldCount ?? null,
        capturedFieldPathIds: compactFieldPaths.map(item => item.fieldPathId),
        resolvableFieldPathIds: compactFieldPaths.filter(item => item.resolvable).map(item => item.fieldPathId),
        targetFieldPathId: TARGET_FIELD_PATH_ID,
        targetResolvable: compactFieldPaths.some(item => item.fieldPathId === TARGET_FIELD_PATH_ID && item.resolvable),
        loop26FieldPathIds: LOOP_26_FIELD_PATHS,
        nearbyFieldPathIds: NEARBY_FIELD_PATHS,
        fieldPaths: compactFieldPaths,
        valuesIncluded: false,
        rawPayloadIncluded: false,
        fullRawSendTablePayloadIncluded: false,
        limitations: runtimeCapture.captureStatus === 'captured' ? [] : ['target serializer or field path metadata was not fully captured']
    };
}

export function buildFieldPath59RuntimeDefinition(runtimeSummary) {
    const target = runtimeSummary.fieldPaths.find(item => item.fieldPathId === TARGET_FIELD_PATH_ID) ?? null;
    const runtimeVarTypeKnown = typeof target?.varType === 'string' && target.varType.length > 0;
    const runtimeVarTypeClassification = target?.runtimeVarTypeClassification ?? 'unknown';
    let conclusion = 'runtime_metadata_not_captured';
    if (runtimeVarTypeClassification === 'string_like') {
        conclusion = 'string_like_runtime_type_makes_decodeString_MISC_more_locally_coherent';
    } else if (runtimeVarTypeClassification === 'numeric_like') {
        conclusion = 'numeric_like_runtime_type_would_strongly_suspect_mapping_or_decoder_issue';
    } else if (runtimeVarTypeKnown) {
        conclusion = 'runtime_type_known_but_not_decisive_for_decoder_causality';
    }

    return {
        schemaVersion: 1,
        replayId: AUTHORIZED_REPLAY_ID,
        packetOrdinal: TARGET_PACKET_ORDINAL,
        loop: TARGET_LOOP,
        serializerName: TARGET_SERIALIZER,
        fieldPathId: TARGET_FIELD_PATH_ID,
        captured: target?.resolvable === true,
        runtimeVarTypeKnown,
        runtimeVarTypeClassification,
        fieldPath: target,
        answer: {
            originalRuntimeDefinition: runtimeVarTypeKnown ? target.varType : null,
            conclusion,
            parserBugConcluded: false,
            source2SemanticsClaimed: false,
            replayCorruptionClaimed: false,
            causalConclusion: 'not_determined'
        },
        limitations: [
            'runtime metadata is local parser/send-table metadata, not independent Source 2 semantics',
            'field values are not decoded or emitted',
            'metadata suspicion alone does not establish parser bug causality'
        ]
    };
}

export function buildLoop26RuntimeFieldPathComparison(runtimeSummary) {
    const byId = new Map(runtimeSummary.fieldPaths.map(item => [item.fieldPathId, item]));
    const rows = LOOP_26_FIELD_PATHS.map(fieldPathId => {
        const item = byId.get(fieldPathId) ?? null;
        return {
            fieldPathId,
            resolvable: item?.resolvable === true,
            flattenedFieldName: item?.flattenedFieldName ?? null,
            originalSerializerFieldName: item?.originalSerializerFieldName ?? null,
            varType: item?.varType ?? null,
            runtimeVarTypeClassification: item?.runtimeVarTypeClassification ?? 'unknown',
            decoderResolutionSource: item?.decoderResolutionSource ?? null,
            decoderDescriptorType: item?.decoderDescriptorType ?? null,
            decoderFunctionName: item?.decoderFunctionName ?? null,
            storageType: item?.storageType ?? null,
            fieldModel: item?.fieldModel ?? null,
            fieldPathKind: item?.fieldPathKind ?? null,
            isTarget: fieldPathId === TARGET_FIELD_PATH_ID
        };
    });
    const nearby = NEARBY_FIELD_PATHS.map(fieldPathId => byId.get(fieldPathId) ?? {
        fieldPathId,
        resolvable: false,
        limitation: 'field path id was not present in the local FieldPathBuilder cache'
    });

    return {
        schemaVersion: 1,
        replayId: AUTHORIZED_REPLAY_ID,
        packetOrdinal: TARGET_PACKET_ORDINAL,
        loop: TARGET_LOOP,
        serializerName: TARGET_SERIALIZER,
        comparedFieldPaths: LOOP_26_FIELD_PATHS,
        nearbyFieldPaths: nearby,
        rows,
        targetRuntimeVarTypeKnown: rows.find(row => row.isTarget)?.varType !== null,
        valuesIncluded: false,
        rawPayloadIncluded: false,
        fullRawSendTablePayloadIncluded: false
    };
}

export function buildTask114Comparison(runtimeDefinition, task114Contract, task114Comparison) {
    const target = runtimeDefinition.fieldPath ?? {};
    const checks = [
        ['fieldPathId', target.fieldPathId, TARGET_FIELD_PATH_ID],
        ['flattenedFieldName', target.flattenedFieldName, 'm_nAvailableHelperCount'],
        ['decoderFunctionName', target.decoderFunctionName, 'decodeString'],
        ['storageType', target.storageType, 'MISC'],
        ['task114LargestSegmentBits', task114Comparison.confirmedLargestSegment?.bitsConsumed, 288],
        ['task114ExactRuntimeVarTypeKnown', task114Contract.localContractAssessment?.exactRuntimeVarTypeKnownFromCommittedEvidence, false]
    ];
    const differences = checks
        .filter(([, observed, expected]) => observed !== expected)
        .map(([field, observed, expected]) => ({ field, observed, expected }));

    return {
        schemaVersion: 1,
        replayId: AUTHORIZED_REPLAY_ID,
        sourceTask: '114',
        sourceRoot: TASK114_ROOT,
        exactTask114NumbersMatched: differences.length === 0,
        differences,
        comparedFields: checks.map(([field]) => field),
        task114RuntimeVarTypeKnown: false,
        task115RuntimeVarTypeKnown: runtimeDefinition.runtimeVarTypeKnown,
        task115RuntimeVarType: runtimeDefinition.answer.originalRuntimeDefinition,
        task115RuntimeVarTypeClassification: runtimeDefinition.runtimeVarTypeClassification,
        task114Gate: null
    };
}

export function buildRiskAssessment(runtimeDefinition, task114Comparison) {
    return {
        schemaVersion: 1,
        replayId: AUTHORIZED_REPLAY_ID,
        runtimeDefinitionCaptured: runtimeDefinition.captured,
        runtimeVarTypeKnown: runtimeDefinition.runtimeVarTypeKnown,
        runtimeVarTypeClassification: runtimeDefinition.runtimeVarTypeClassification,
        task114NumbersMatched: task114Comparison.exactTask114NumbersMatched,
        parserFixRecommendedNow: false,
        recoveryRecommendation: 'do_not_add_recovery_from_metadata_only_evidence',
        source2SemanticsClaimed: false,
        replayCorruptionClaimed: false,
        parserBugConcluded: false,
        causalConclusion: 'not_determined',
        safestNextStep: runtimeDefinition.runtimeVarTypeClassification === 'string_like' ?
            'compare independent parser/oracle serializer metadata before changing parser behavior' :
            'capture or compare independent runtime schema metadata before changing parser behavior',
        limitations: runtimeDefinition.limitations
    };
}

export async function auditImplementationSources() {
    const findings = [];
    for (const file of ENGINE_IMPLEMENTATION_FILES) {
        const source = await readFile(path.join(REPO_ROOT, file), 'utf8');
        if (file.startsWith('packages/engine/') && /\bif\s*\([^)]*replay_010[^)]*\)|\bcase\s+['"]replay_010['"]/.test(source)) {
            findings.push({ type: 'replay_specific_engine_branch', file });
        }
        if (/DEFAULTS\s*=\s*\{[\s\S]*diagnosePreRecoveryFieldConsumption\s*:\s*true/.test(source)) {
            findings.push({ type: 'field_diagnostics_default_enabled', file });
        }
        if (/DEFAULTS\s*=\s*\{[\s\S]*allowUnresolvedEntityReference\s*:\s*true/.test(source)) {
            findings.push({ type: 'recovery_default_enabled', file });
        }
        if (/runtimeFieldDefinitionCaptureEnabledForDiagnostics\s*=\s*true/.test(source)) {
            findings.push({ type: 'runtime_definition_capture_default_enabled', file });
        }
    }
    return {
        schemaVersion: 1,
        replayId: AUTHORIZED_REPLAY_ID,
        implementationFilesExamined: ENGINE_IMPLEMENTATION_FILES,
        replaySpecificBranchFindings: findings.filter(finding => finding.type === 'replay_specific_engine_branch'),
        diagnosticsDefaultEnabled: findings.some(finding => finding.type === 'field_diagnostics_default_enabled'),
        runtimeDefinitionCaptureDefaultEnabled: findings.some(finding => finding.type === 'runtime_definition_capture_default_enabled'),
        recoveryDefaultEnabled: findings.some(finding => finding.type === 'recovery_default_enabled'),
        parserEngineBehaviorModifiedByThisTask: 'diagnostic metadata getters only; default decode behavior unchanged',
        passed: findings.length === 0,
        findings
    };
}

function buildProtectionAudit(inputIdentity, branchAudit, diagnosticConfiguration) {
    const task116Created = existsSync(path.join(REPO_ROOT, 'tasks/specs/116.json')) ||
        existsSync(path.join(REPO_ROOT, 'tasks/blocked/116-select-next-canonical-generalization-control.md')) ||
        existsSync(path.join(REPO_ROOT, 'tasks/completed/116-capture-loop-26-fieldpath-59-runtime-field-definition.md'));
    return {
        schemaVersion: 1,
        replayId: AUTHORIZED_REPLAY_ID,
        replay005Read: false,
        replay005Hashed: false,
        replay005Opened: false,
        replay005Copied: false,
        replay005Processed: false,
        bots006To008Processed: false,
        candidates011To020Touched: false,
        samplesUsed: false,
        outputReplaysModified: false,
        demFilesCommitted: false,
        localFilesCommitted: false,
        rawEntityDataCommitted: false,
        rawSerializedEntitiesCommitted: false,
        rawPayloadsCommitted: false,
        fullRawSendTablePayloadCommitted: false,
        fieldValuesCommitted: false,
        canonicalPackageConstructed: false,
        factualArtifactsEmitted: false,
        sourceArtifactsEmitted: false,
        automaticRecoveryAdded: false,
        missingUpdateRecovered: false,
        outOfRangeCreateRecovered: false,
        placeholderEntityCreated: false,
        syntheticFieldsMaterialized: false,
        task116Created,
        rawReplayRead: true,
        rawReplayHash: inputIdentity.sha256,
        replayParserInvoked: true,
        diagnosticRecoveryAllowUnresolvedEntityReference: diagnosticConfiguration.recovery?.allowUnresolvedEntityReference === true,
        diagnosticRecoveryAllowMissingClassBaseline: diagnosticConfiguration.recovery?.allowMissingClassBaseline === true,
        diagnosticFieldConsumptionEnabled: diagnosticConfiguration.recovery?.diagnosePreRecoveryFieldConsumption === true,
        branchAuditPassed: branchAudit.passed,
        passed: !task116Created &&
            branchAudit.passed &&
            diagnosticConfiguration.recovery?.allowUnresolvedEntityReference !== true &&
            diagnosticConfiguration.recovery?.allowMissingClassBaseline !== true
    };
}

export function decideGate({
    defaultPass,
    diagnosticPass,
    runtimeDefinition,
    task114Comparison,
    protectionAudit,
    branchAudit
}) {
    const defaultOk = defaultPass.expectedFailureReproduced === true;
    const diagnosticOk = diagnosticPass.expectedFailureReproduced === true;
    const definitionCaptured = runtimeDefinition.captured === true;
    const task114Ok = task114Comparison.exactTask114NumbersMatched === true;
    const safe = protectionAudit.passed === true && branchAudit.passed === true;

    let gate = 'local_replay_loop_26_fieldpath_59_runtime_definition_blocked';
    if (defaultOk && diagnosticOk && definitionCaptured && task114Ok && safe) {
        gate = 'local_replay_loop_26_fieldpath_59_runtime_definition_captured';
    } else if (defaultOk && diagnosticOk && task114Ok && safe) {
        gate = 'local_replay_loop_26_fieldpath_59_runtime_definition_partial';
    }

    return {
        schemaVersion: 1,
        replayId: AUTHORIZED_REPLAY_ID,
        gate,
        successGate: 'local_replay_loop_26_fieldpath_59_runtime_definition_captured',
        partialGate: 'local_replay_loop_26_fieldpath_59_runtime_definition_partial',
        blockedGate: 'local_replay_loop_26_fieldpath_59_runtime_definition_blocked',
        defaultFailureReproduced: defaultOk,
        diagnosticFailureReproducedWithoutRecovery: diagnosticOk,
        runtimeDefinitionCaptured: definitionCaptured,
        runtimeVarTypeKnown: runtimeDefinition.runtimeVarTypeKnown,
        runtimeVarType: runtimeDefinition.answer.originalRuntimeDefinition,
        runtimeVarTypeClassification: runtimeDefinition.runtimeVarTypeClassification,
        task114NumbersMatchedExactly: task114Ok,
        parserDefaultBehaviorChanged: false,
        recoveryAddedOrPromoted: false,
        canonicalPackageConstructed: false,
        factualArtifactsEmitted: false,
        sourceArtifactsEmitted: false,
        fieldValuesEmitted: false,
        rawPayloadsEmitted: false,
        fullRawSendTablePayloadEmitted: false,
        protectionAuditPassed: protectionAudit.passed,
        source2SemanticsClaimed: false,
        replayCorruptionClaimed: false,
        parserBugConcluded: false,
        causalConclusion: 'not_determined',
        reasons: [
            defaultOk ? 'default pass reproduced Task 105 failure' : 'default pass did not reproduce Task 105 failure',
            diagnosticOk ? 'diagnostic pass reproduced first failure without recovery' : 'diagnostic pass did not fail closed at first failure',
            definitionCaptured ? 'runtime field definition metadata was captured' : 'runtime field definition metadata was not captured',
            task114Ok ? 'Task 114 decoder/storage and segment numbers matched exactly' : 'Task 114 comparison failed',
            safe ? 'protection and branch audits passed' : 'safety audit failed'
        ]
    };
}

async function writeReport(summaryRoot, values) {
    const {
        defaultPass,
        diagnosticPass,
        runtimeSummary,
        runtimeDefinition,
        task114Comparison,
        riskAssessment,
        protectionAudit,
        gate
    } = values;
    const report = [
        '# Local Replay Loop 26 FieldPath 59 Runtime Field Definition',
        '',
        `Gate: \`${gate.gate}\``,
        '',
        '## Passes',
        '',
        `Default failure reproduced: \`${defaultPass.expectedFailureReproduced}\``,
        `Diagnostic failure reproduced without recovery: \`${diagnosticPass.expectedFailureReproduced}\``,
        `Recovery added or promoted: \`${gate.recoveryAddedOrPromoted}\``,
        '',
        '## Runtime Definition',
        '',
        `Serializer: \`${runtimeSummary.serializerName}\``,
        `Serializer version: \`${runtimeSummary.serializerVersion}\``,
        `Field count: \`${runtimeSummary.fieldCount}\``,
        `Field path 59 captured: \`${runtimeDefinition.captured}\``,
        `Runtime varType known: \`${runtimeDefinition.runtimeVarTypeKnown}\``,
        `Runtime varType: \`${runtimeDefinition.answer.originalRuntimeDefinition}\``,
        `Runtime varType classification: \`${runtimeDefinition.runtimeVarTypeClassification}\``,
        `Flattened field name: \`${runtimeDefinition.fieldPath?.flattenedFieldName ?? null}\``,
        `Decoder: \`${runtimeDefinition.fieldPath?.decoderFunctionName ?? null}\``,
        `Storage: \`${runtimeDefinition.fieldPath?.storageType ?? null}\``,
        `Decoder source: \`${runtimeDefinition.fieldPath?.decoderResolutionSource ?? null}\``,
        '',
        '## Task 114 Comparison',
        '',
        `Exact Task 114 numbers matched: \`${task114Comparison.exactTask114NumbersMatched}\``,
        `Task 114 runtime varType known: \`${task114Comparison.task114RuntimeVarTypeKnown}\``,
        `Task 115 runtime varType known: \`${task114Comparison.task115RuntimeVarTypeKnown}\``,
        '',
        '## Risk And Protection',
        '',
        `Parser fix recommended now: \`${riskAssessment.parserFixRecommendedNow}\``,
        `Source 2 semantics claimed: \`${riskAssessment.source2SemanticsClaimed}\``,
        `Parser bug concluded: \`${riskAssessment.parserBugConcluded}\``,
        `Causal conclusion: \`${riskAssessment.causalConclusion}\``,
        `Replay 005 processed: \`${protectionAudit.replay005Processed}\``,
        `Bots 006-008 processed: \`${protectionAudit.bots006To008Processed}\``,
        `Candidates 011-020 touched: \`${protectionAudit.candidates011To020Touched}\``,
        `Field values committed: \`${protectionAudit.fieldValuesCommitted}\``,
        `Raw payloads committed: \`${protectionAudit.rawPayloadsCommitted}\``,
        `Full raw send-table payload committed: \`${protectionAudit.fullRawSendTablePayloadCommitted}\``,
        '',
        `Summary output: \`${summaryRoot.relativePath}\``,
        '',
        'No Task 116 was created.'
    ].join('\n');
    await writeFile(path.join(REPO_ROOT, 'reports/local-replay-loop-26-fieldpath-59-runtime-field-definition.md'), `${report}\n`);
}

function parseArgs(argv) {
    const args = {};
    for (let index = 0; index < argv.length; index += 2) {
        const key = argv[index];
        const value = argv[index + 1];
        if (!key?.startsWith('--') || value === undefined) throw new Error(`invalid argument near ${key}`);
        args[key.slice(2)] = value;
    }
    for (const required of ['input', 'replay-id', 'local-output', 'summary-output']) {
        if (!args[required]) throw new Error(`missing --${required}`);
    }
    const unexpected = Object.keys(args).filter(key => !['input', 'replay-id', 'local-output', 'summary-output'].includes(key));
    if (unexpected.length > 0) throw new Error(`unsupported arguments: ${unexpected.join(', ')}`);
    return args;
}

export async function runCli(argv = process.argv.slice(2)) {
    const args = parseArgs(argv);
    const input = validateInputPath(args.input, args['replay-id']);
    const roots = validateOutputRoots(args['local-output'], args['summary-output']);
    await ensureDir(roots.local.absolutePath);
    await ensureDir(roots.summary.absolutePath);

    const inputIdentity = await buildInputIdentity(input);
    const { result: defaultPass } = await runAdvancementPass({ input, mode: 'default', configuration: undefined });
    const diagnosticConfiguration = new ParserConfiguration({
        recovery: {
            diagnosePreRecoveryPayloadConsumption: true,
            diagnosePreRecoveryFieldConsumption: true
        }
    });
    DemoPacketHandler.setRuntimeFieldDefinitionCaptureEnabledForDiagnostics(true);
    let diagnosticPass;
    let runtimeCapture;
    try {
        const diagnosticResult = await runAdvancementPass({
            input,
            mode: 'diagnostic_runtime_definition_capture',
            configuration: diagnosticConfiguration,
            captureRuntime: true
        });
        diagnosticPass = diagnosticResult.result;
        runtimeCapture = diagnosticResult.runtimeCapture;
    } finally {
        DemoPacketHandler.setRuntimeFieldDefinitionCaptureEnabledForDiagnostics(false);
    }
    const diagnostics = diagnosticConfiguration.recoveryDiagnostics
        .filter(diagnostic => diagnostic.type === 'pre_recovery_payload_consumption');
    const runtimeSummary = buildRuntimeSerializerSummary(runtimeCapture ?? { captureStatus: 'not_captured', serializerFound: false, fieldPaths: [] });
    const runtimeDefinition = buildFieldPath59RuntimeDefinition(runtimeSummary);
    const comparison = buildLoop26RuntimeFieldPathComparison(runtimeSummary);
    const task114Contract = await readJson(`${TASK114_ROOT}fieldpath-59-contract.json`);
    const task114SegmentComparison = await readJson(`${TASK114_ROOT}task113-comparison.json`);
    const task114Comparison = {
        ...buildTask114Comparison(runtimeDefinition, task114Contract, task114SegmentComparison),
        task114Gate: await readJson(`${TASK114_ROOT}decoder-contract-gate.json`)
    };
    const riskAssessment = buildRiskAssessment(runtimeDefinition, task114Comparison);
    const branchAudit = await auditImplementationSources();
    const protectionAudit = buildProtectionAudit(inputIdentity, branchAudit, diagnosticConfiguration);
    const gate = decideGate({
        defaultPass,
        diagnosticPass,
        runtimeDefinition,
        task114Comparison,
        protectionAudit,
        branchAudit
    });

    await writeJson(path.join(roots.local.absolutePath, 'full-runtime-serializer-definition-diagnostics.json'), {
        schemaVersion: 1,
        replayId: AUTHORIZED_REPLAY_ID,
        localOnly: true,
        rawPayloadsIncluded: false,
        rawSerializedEntitiesIncluded: false,
        fullRawSendTablePayloadIncluded: false,
        fieldValuesIncluded: false,
        runtimeCapture
    });

    await writeJson(path.join(roots.summary.absolutePath, 'input-identity.json'), inputIdentity);
    await writeJson(path.join(roots.summary.absolutePath, 'default-pass-result.json'), defaultPass);
    await writeJson(path.join(roots.summary.absolutePath, 'diagnostic-pass-result.json'), {
        ...diagnosticPass,
        recoveryWarnings: diagnosticConfiguration.recoveryWarnings,
        preRecoveryPayloadDiagnosticsCount: diagnostics.length,
        recoveryAllowUnresolvedEntityReference: diagnosticConfiguration.recovery?.allowUnresolvedEntityReference === true,
        recoveryAllowMissingClassBaseline: diagnosticConfiguration.recovery?.allowMissingClassBaseline === true,
        diagnosePreRecoveryFieldConsumption: diagnosticConfiguration.recovery?.diagnosePreRecoveryFieldConsumption === true,
        runtimeFieldDefinitionCaptureOptIn: true,
        valuesRecorded: false,
        rawPayloadsRecorded: false,
        fullRawSendTablePayloadRecorded: false
    });
    await writeJson(path.join(roots.summary.absolutePath, 'runtime-serializer-summary.json'), runtimeSummary);
    await writeJson(path.join(roots.summary.absolutePath, 'fieldpath-59-runtime-definition.json'), runtimeDefinition);
    await writeJson(path.join(roots.summary.absolutePath, 'loop-26-runtime-fieldpath-comparison.json'), comparison);
    await writeJson(path.join(roots.summary.absolutePath, 'task114-comparison.json'), task114Comparison);
    await writeJson(path.join(roots.summary.absolutePath, 'risk-assessment.json'), riskAssessment);
    await writeJson(path.join(roots.summary.absolutePath, 'protection-audit.json'), protectionAudit);
    await writeJson(path.join(roots.summary.absolutePath, 'replay-specific-branch-audit.json'), branchAudit);
    await writeJson(path.join(roots.summary.absolutePath, 'runtime-definition-gate.json'), gate);
    await writeReport(roots.summary, {
        defaultPass,
        diagnosticPass,
        runtimeSummary,
        runtimeDefinition,
        task114Comparison,
        riskAssessment,
        protectionAudit,
        gate
    });

    return {
        inputIdentity,
        defaultPass,
        diagnosticPass,
        runtimeSummary,
        runtimeDefinition,
        comparison,
        task114Comparison,
        riskAssessment,
        protectionAudit,
        branchAudit,
        gate
    };
}

if (process.argv[1] && path.resolve(process.argv[1]) === THIS_FILE) {
    runCli().then(() => {
        process.exit(0);
    }).catch(error => {
        console.error(error);
        process.exitCode = 1;
    });
}
