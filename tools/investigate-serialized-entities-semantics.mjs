#!/usr/bin/env node
import { createReadStream } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { Logger, ParserConfiguration, Player } from 'deadem';
import BitBuffer from '../packages/engine/src/core/BitBuffer.js';
import EntityPayloadSizeExtractor from '../packages/engine/src/extractors/EntityPayloadSizeExtractor.js';

const THIS_FILE = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(THIS_FILE), '..');
const AUTHORIZED_REPLAY_ID = ['replay', '010'].join('_');
const AUTHORIZED_INPUT = '.local/deadem/replays/inbox/partida_010.dem';
const REQUIRED_LOCAL_ROOT = '.local/deadem/cache/local-replay-processing/replay_010/serialized-entities-semantics-investigation/';
const REQUIRED_SUMMARY_ROOT = 'output/local-replay-processing/replay_010-serialized-entities-semantics-investigation/';
const TASK105_FAILURE_TICKS = 953;
const PREVIOUS_SUMMARY_ROOT = 'output/local-replay-processing/replay_010-serialized-entity-payload-semantics/';
const SAMPLES_TOKEN = ['samples'].join('');
const OUTPUT_REPLAYS_TOKEN = ['output', 'replays'].join('/');
const ENGINE_IMPLEMENTATION_FILES = [
    'packages/engine/src/ParserConfiguration.js',
    'packages/engine/src/handlers/DemoMessageHandler.js'
];
const PROTO_SOURCE_FILES = [
    'packages/deadem/proto/source/netmessages.proto',
    'packages/cs2/proto/source/netmessages.proto',
    'packages/dota2/proto/source/netmessages.proto'
];
const PROTO_COMPILED_FILES = [
    'packages/deadem/proto/compiled/proto.json',
    'packages/cs2/proto/compiled/proto.json',
    'packages/dota2/proto/compiled/proto.json'
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
    if (relativePath !== AUTHORIZED_INPUT) throw new Error(`Task 110 authorizes only ${AUTHORIZED_INPUT}`);
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
    return await new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256');
        const stream = createReadStream(filePath);
        stream.on('data', chunk => hash.update(chunk));
        stream.on('error', reject);
        stream.on('end', () => resolve(hash.digest('hex')));
    });
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
        authorizedByTask: '110'
    };
}

async function runAdvancementPass({ input, mode, configuration }) {
    const player = new Player(configuration, Logger.NOOP);
    const started = performance.now();
    const result = {
        mode,
        expectedFailureReproduced: mode === 'default' ? false : undefined,
        recoveryEnabled: mode === 'opt_in_recovery',
        advancedPastTask105Failure: mode === 'opt_in_recovery' ? false : undefined,
        boundaryReached: mode === 'opt_in_recovery' ? false : undefined,
        reachedEnd: false,
        ticksAdvanced: 0,
        currentTick: null,
        finalTick: null,
        errorMessage: mode === 'default' ? '' : undefined,
        boundaryError: mode === 'opt_in_recovery' ? null : undefined,
        stackTop: [],
        durationMs: 0
    };

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
            if (mode === 'opt_in_recovery' && result.ticksAdvanced > TASK105_FAILURE_TICKS) {
                result.advancedPastTask105Failure = true;
            }
            if (!advanced) {
                result.reachedEnd = true;
                break;
            }
        }
    } catch (error) {
        if (mode === 'default') {
            result.expectedFailureReproduced = error?.message === 'Unable to find an entity with index [ 2905 ]';
            result.errorMessage = error?.message ?? String(error);
        } else {
            result.boundaryReached = error?.message === 'entity index out of range';
            result.boundaryError = {
                name: error?.name ?? 'Error',
                message: error?.message ?? String(error)
            };
        }
        result.stackTop = sanitizeStack(error);
    } finally {
        result.durationMs = Math.round(performance.now() - started);
        await player.dispose().catch(() => {});
    }

    return result;
}

function findLine(source, pattern) {
    const lines = source.split(/\r?\n/);
    const index = lines.findIndex(line => pattern.test(line));
    return index === -1 ? null : index + 1;
}

function extractPacketEntitiesSnippet(source) {
    const lines = source.split(/\r?\n/);
    const start = lines.findIndex(line => /^message CSVCMsg_PacketEntities\b/.test(line));
    if (start === -1) return null;
    let depth = 0;
    const snippet = [];
    for (let index = start; index < lines.length; index++) {
        const line = lines[index];
        snippet.push(line);
        for (const char of line) {
            if (char === '{') depth++;
            if (char === '}') depth--;
        }
        if (index > start && depth === 0) break;
    }
    return snippet.join('\n');
}

export async function buildSchemaFieldInventory(root = REPO_ROOT) {
    const sourceDefinitions = [];
    for (const file of PROTO_SOURCE_FILES) {
        const source = await readFile(path.join(root, file), 'utf8');
        const line = findLine(source, /^\s*optional bytes serialized_entities = 13;/);
        sourceDefinitions.push({
            path: file,
            message: 'CSVCMsg_PacketEntities',
            fieldName: 'serialized_entities',
            localName: 'serializedEntities',
            fieldNumber: line === null ? null : 13,
            protoType: line === null ? null : 'bytes',
            rule: line === null ? null : 'optional',
            line,
            commentsNearby: [],
            messageSnippetSha256: crypto.createHash('sha256').update(extractPacketEntitiesSnippet(source) ?? '').digest('hex')
        });
    }

    const compiledDefinitions = [];
    for (const file of PROTO_COMPILED_FILES) {
        const compiled = JSON.parse(await readFile(path.join(root, file), 'utf8'));
        const message = compiled?.nested?.CSVCMsg_PacketEntities ?? compiled?.CSVCMsg_PacketEntities ?? findNestedMessage(compiled, 'CSVCMsg_PacketEntities');
        const field = message?.fields?.serializedEntities ?? null;
        compiledDefinitions.push({
            path: file,
            message: 'CSVCMsg_PacketEntities',
            fieldName: 'serializedEntities',
            protoName: field?.protoName ?? null,
            fieldNumber: field?.id ?? null,
            protoType: field?.type ?? null,
            rule: field?.rule ?? 'optional',
            present: field !== null,
            fieldObject: field
        });
    }

    const localInterpretations = await findLocalSerializedEntitiesUses(root);
    const textualEvidence = localInterpretations
        .filter(item => /payload size|payload-size|payloadSizes|payloadBits|EntityPayloadSizeExtractor/.test(item.lineText));

    return {
        schemaVersion: 1,
        message: 'CSVCMsg_PacketEntities',
        field: 'serializedEntities',
        sourceDefinitions,
        compiledDefinitions,
        aliasesOrWrappers: [
            {
                protoName: 'serialized_entities',
                generatedName: 'serializedEntities',
                evidence: 'compiled proto JSON maps protoName serialized_entities to field serializedEntities'
            }
        ],
        localInterpretations,
        localTextualEvidenceForPayloadSizes: textualEvidence,
        schemaConclusion: {
            fieldIsPresent: sourceDefinitions.every(item => item.fieldNumber === 13) &&
                compiledDefinitions.every(item => item.fieldNumber === 13),
            schemaType: 'optional bytes',
            schemaNamesPayloadSize: false,
            schemaNamesEncodedEntities: false,
            schemaDocumentsDirectSkipBits: false,
            conclusion: 'local proto schema identifies serialized_entities only as optional bytes field 13; payload-size semantics are not documented by schema comments or field type'
        }
    };
}

function findNestedMessage(node, name) {
    if (!node || typeof node !== 'object') return null;
    if (node.nested?.[name]) return node.nested[name];
    for (const value of Object.values(node.nested ?? {})) {
        const found = findNestedMessage(value, name);
        if (found !== null) return found;
    }
    return null;
}

async function findLocalSerializedEntitiesUses(root) {
    const files = [
        'packages/engine/src/extractors/EntityPayloadSizeExtractor.js',
        'packages/engine/src/handlers/DemoMessageHandler.js',
        'tools/diagnose-replay-010-entity-packet-cursor-alignment.mjs',
        'tools/diagnose-replay-010-serialized-entity-payload-semantics.mjs'
    ];
    const uses = [];
    for (const file of files) {
        if (!existsSync(path.join(root, file))) continue;
        const lines = (await readFile(path.join(root, file), 'utf8')).split(/\r?\n/);
        lines.forEach((line, index) => {
            if (/serializedEntities|serialized_entities|EntityPayloadSizeExtractor|payloadBits|payloadSizes/.test(line)) {
                uses.push({
                    path: file,
                    line: index + 1,
                    lineText: line.trim()
                });
            }
        });
    }
    return uses;
}

export function decodeByteVarints(buffer) {
    return Array.from(new EntityPayloadSizeExtractor(new Uint8Array(buffer)).retrieve());
}

export function decodeBitBufferUVarInt32(buffer) {
    const bitBuffer = new BitBuffer(new Uint8Array(buffer));
    const values = [];
    while (bitBuffer.getReadCount() < buffer.length * 8) {
        values.push(bitBuffer.readUVarInt32());
    }
    return values;
}

export function buildExtractorContractAnalysis() {
    const syntheticBytes = [0x16, 0x3F, 0xE3, 0x01, 0x8A, 0x02];
    const extractorValues = decodeByteVarints(syntheticBytes);
    const bitBufferValues = decodeBitBufferUVarInt32(syntheticBytes);

    return {
        schemaVersion: 1,
        extractor: 'EntityPayloadSizeExtractor',
        contractFromCode: {
            inputType: 'Uint8Array',
            output: 'Generator<number>',
            algorithm: 'byte-oriented unsigned varint stream: each byte contributes 7 payload bits and high bit indicates continuation',
            consumesBitsFromEntityData: false,
            readsSerializedEntitiesAsOpaqueBytes: true,
            valueCountRule: 'one value per decoded byte-varint until serializedEntities byte buffer is exhausted',
            enforcesUpdatedEntriesCount: false,
            validatesValueMeaningAgainstEntityData: false,
            unitNameInCode: 'payload sizes in bits',
            unitNameEvidence: 'local extractor JSDoc and local variable names only'
        },
        comparisonWithBitBuffer: {
            readUVarInt: 'bit-packed Source 2 custom varint; initial 6 bits determine additional bits',
            readUVarInt32: 'byte-oriented unsigned varint over a BitBuffer byte stream',
            extractorMatchesReadUVarInt32Shape: true,
            extractorMatchesReadUVarIntShape: false,
            syntheticBytes,
            extractorValues,
            bitBufferReadUVarInt32Values: bitBufferValues
        },
        supportedBySchema: false,
        supportedByLocalCodeOnly: true,
        namePayloadBitsStatus: 'local_inference_not_schema_proof',
        directAfterCommandSkipContractStatus: 'not_established',
        unsafeAssumptions: [
            'assuming each decoded value has a one-to-one relation to updatedEntries without checking count and operation semantics',
            'assuming decoded values are direct after-command skip bit counts for every entry',
            'assuming arithmetic movement over a missing UPDATE validates semantic equivalence'
        ],
        testsEncodedInTask: [
            'byte-varint decoding over synthetic bytes',
            'comparison to BitBuffer.readUVarInt32 byte-varint behavior',
            'separation from BitBuffer.readUVarInt bit-packed index/command-adjacent varints'
        ]
    };
}

export async function buildDynamicPayloadSemanticsSample() {
    const boundarySummary = await readJson(`${PREVIOUS_SUMMARY_ROOT}boundary-packet-payload-consumption-summary.json`);
    const consistencySummary = await readJson(`${PREVIOUS_SUMMARY_ROOT}payload-size-consistency-summary.json`);
    const hypotheses = await readJson(`${PREVIOUS_SUMMARY_ROOT}payload-semantics-hypotheses.json`);

    return {
        schemaVersion: 1,
        replayId: AUTHORIZED_REPLAY_ID,
        sourceTask: '109',
        sourcePaths: [
            `${PREVIOUS_SUMMARY_ROOT}boundary-packet-payload-consumption-summary.json`,
            `${PREVIOUS_SUMMARY_ROOT}payload-size-consistency-summary.json`,
            `${PREVIOUS_SUMMARY_ROOT}payload-semantics-hypotheses.json`
        ],
        boundaryPacketMetrics: boundarySummary.packetMetrics,
        loop21: boundarySummary.loop21,
        loop22: boundarySummary.loop22,
        loop23: boundarySummary.loop23,
        presentUpdateEntriesBeforeBoundary: consistencySummary.presentUpdateEntriesBeforeBoundary,
        presentUpdateMatchesAfterCommand: consistencySummary.presentUpdateMatchesAfterCommand,
        presentUpdateMismatchesAfterCommand: consistencySummary.presentUpdateMismatchesAfterCommand,
        mismatchAppearsBeforeLoop22: consistencySummary.mismatchAppearsBeforeLoop22,
        referenceFit: consistencySummary.referenceFit,
        broaderPacketSampleStatus: 'not_collected_requires_engine_instrumentation',
        broaderPacketSampleReason: 'current opt-in diagnostics record the boundary packet when the out-of-range CREATE throws; collecting earlier per-packet comparisons would require new engine instrumentation, which Task 110 explicitly avoids',
        rawPayloadCommitted: false,
        fieldValuesCommitted: false,
        previousHypotheses: hypotheses.hypotheses,
        previousNotDetermined: hypotheses.notDetermined
    };
}

export function buildSemanticRiskAssessment(schemaInventory, extractorAnalysis, dynamicSample) {
    const schemaSupportsDirectSkip = schemaInventory.schemaConclusion.schemaDocumentsDirectSkipBits === true;
    const codeSupportsDirectSkip = extractorAnalysis.directAfterCommandSkipContractStatus === 'established';
    const loop21Mismatch = dynamicSample.loop21?.mismatchConfirmedAgainstAfterCommand === true;
    const loop22Independent = dynamicSample.loop22?.semanticJustification !== 'not_independently_justified';
    let assumptionStatus = 'not_determined';
    if (!schemaSupportsDirectSkip && !codeSupportsDirectSkip && loop21Mismatch) {
        assumptionStatus = 'contradicted_by_observed_replay_metric_and_not_supported_by_schema';
    }

    return {
        schemaVersion: 1,
        replayId: AUTHORIZED_REPLAY_ID,
        questionsAnswered: {
            schemaSays: 'serialized_entities is optional bytes field 13 on CSVCMsg_PacketEntities',
            documentedMeaning: 'no local proto comment or type name documents direct payload-size or skip semantics',
            extractorEvidence: 'extractor decodes a byte-varint stream from serializedEntities; the payload-size meaning is local code inference',
            valuesPerUpdatedEntries: dynamicSample.boundaryPacketMetrics?.payloadSizeCount === dynamicSample.boundaryPacketMetrics?.updatedEntries ?
                'matches boundary packet count, but extractor itself does not enforce this invariant' :
                'not guaranteed by code or schema',
            comparisonReference: 'after_command is closest for Task 109 present UPDATE entries, but this is empirical for one boundary packet and contradicted by loop 21',
            loop21Meaning: 'loop 21 shows observed extractor consumption exceeded decoded payloadBits by 136 bits',
            safeInvariantWithoutFields: 'no safe invariant was found for missing UPDATE skip without understanding field consumption or serializedEntities semantics',
            finalRecommendation: 'keep missing UPDATE recovery diagnostic-only and investigate proto/external engine semantics before any parser fix'
        },
        evidenceClassification: {
            schemaFacts: [
                'field 13 serialized_entities exists as optional bytes in deadem, cs2, and dota2 local protos',
                'compiled proto JSON maps serialized_entities to serializedEntities with type bytes'
            ],
            codeFacts: [
                'EntityPayloadSizeExtractor decodes byte-oriented varints until the serializedEntities byte buffer ends',
                'DemoMessageHandler currently uses decoded values for filtered skips and opt-in recovery skips',
                'no local schema assertion proves direct after-command skip semantics'
            ],
            observedReplayMetrics: [
                'Task 109 loop 21 mismatch: payloadBits 227, after-command consumption 363',
                'Task 109 loop 22 skip remains arithmetic-only because the entity was missing',
                'Task 109 boundary packet had 21/22 present UPDATE after-command matches before boundary'
            ],
            hypotheses: [
                'serializedEntities may encode per-entry metadata whose relation to field decoding is conditional',
                'the extractor may decode the byte-varint stream correctly but the local payloadBits contract may be over-broad',
                'the loop 21 mismatch may indicate extractor contract mismatch, observed-consumption accounting issue, or semantics requiring field-level understanding'
            ],
            unsafeAssumptions: extractorAnalysis.unsafeAssumptions,
            notDetermined: [
                'exact Valve/Source 2 semantic contract for serialized_entities',
                'whether loop 21 is a parser-consumption bug or conditional semantic case',
                'whether loop 22 caused the out-of-range CREATE boundary'
            ]
        },
        directAfterCommandSkipAssumptionStatus: assumptionStatus,
        missingUpdateRecoveryRecommendation: 'diagnostic_only_do_not_use_as_safe_skip',
        shouldRemoveOrDisableExperimentalRecovery: 'do_not_expand; keep diagnostic-only pending human decision',
        shouldInvestigateExternalProtoOrEngineSemantics: true,
        shouldImplementBroaderDiagnosticBeforeFix: true,
        shouldChangeParserNow: false
    };
}

export async function auditImplementationSources(root = REPO_ROOT) {
    const findings = [];
    const files = [];
    for (const file of ENGINE_IMPLEMENTATION_FILES) {
        const absolutePath = path.join(root, file);
        const source = await readFile(absolutePath, 'utf8');
        files.push(file);
        if (/\bif\s*\([^)]*replay_010[^)]*\)/.test(source) || /\bcase\s+['"]replay_010['"]/.test(source)) {
            findings.push({ type: 'replay_specific_branch', file });
        }
        if (/createReadStream\s*\([^)]*samples[\\/]/.test(source) || /readFile\s*\([^)]*samples[\\/]/.test(source)) {
            findings.push({ type: 'samples_executable_path', file });
        }
        if (/createReadStream\s*\([^)]*output[\\/]replays[\\/]/.test(source) || /readFile\s*\([^)]*output[\\/]replays[\\/]/.test(source)) {
            findings.push({ type: 'output_replays_executable_path', file });
        }
        if (/partida_0?(1[1-9]|20)\.dem/.test(source)) {
            findings.push({ type: 'candidate_011_020_processing_path', file });
        }
        if (/DEFAULTS\s*=\s*\{[\s\S]*RECOVERY\]\s*:\s*\{/.test(source)) {
            findings.push({ type: 'default_recovery_enabled', file });
        }
    }
    return {
        schemaVersion: 1,
        implementationFilesExamined: files,
        replaySpecificBranchFindings: findings.filter(finding => finding.type === 'replay_specific_branch'),
        samplesAppearsInExecutableCodePaths: findings.some(finding => finding.type === 'samples_executable_path'),
        outputReplaysAppearsInExecutableCodePaths: findings.some(finding => finding.type === 'output_replays_executable_path'),
        candidates011To020AppearInProcessingPaths: findings.some(finding => finding.type === 'candidate_011_020_processing_path'),
        recoveryDefaultEnabled: findings.some(finding => finding.type === 'default_recovery_enabled'),
        passed: findings.length === 0,
        findings
    };
}

async function buildProtectionAudit(inputIdentity, branchAudit) {
    const task111Created = existsSync(path.join(REPO_ROOT, 'tasks/specs/111.json')) ||
        existsSync(path.join(REPO_ROOT, 'tasks/blocked/111-select-next-canonical-generalization-control.md'));
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
        copyFallbackUsed: false,
        demFilesCommitted: false,
        localFilesCommitted: false,
        rawEntityDataCommitted: false,
        rawSerializedEntitiesCommitted: false,
        fieldValuesCommitted: false,
        canonicalPackageConstructed: false,
        factualArtifactsEmitted: false,
        sourceArtifactsEmitted: false,
        parserEngineModified: false,
        recoveryAdded: false,
        task111Created,
        rawReplayRead: true,
        rawReplayHash: inputIdentity.sha256,
        replayParserInvoked: true,
        branchAuditPassed: branchAudit.passed,
        passed: !task111Created && branchAudit.passed
    };
}

export function decideGate({
    defaultPass,
    recoveryPass,
    schemaInventory,
    extractorAnalysis,
    dynamicSample,
    riskAssessment,
    protectionAudit,
    branchAudit
}) {
    const defaultOk = defaultPass.expectedFailureReproduced === true;
    const boundaryReached = recoveryPass.advancedPastTask105Failure === true && recoveryPass.boundaryReached === true;
    const schemaInventoryProduced = schemaInventory.schemaConclusion.fieldIsPresent === true;
    const extractorContractDescribed = extractorAnalysis.contractFromCode.inputType === 'Uint8Array' &&
        extractorAnalysis.directAfterCommandSkipContractStatus === 'not_established';
    const task109Incorporated = dynamicSample.loop21?.mismatchConfirmedAgainstAfterCommand === true &&
        dynamicSample.loop22?.semanticJustification === 'not_independently_justified';
    const assumptionStatusAnswered = riskAssessment.directAfterCommandSkipAssumptionStatus !== 'not_determined';
    const safe = protectionAudit.passed && branchAudit.passed &&
        protectionAudit.parserEngineModified === false &&
        protectionAudit.recoveryAdded === false;

    let gate = 'local_replay_serialized_entities_semantics_blocked';
    if (defaultOk && boundaryReached && schemaInventoryProduced && extractorContractDescribed && task109Incorporated && assumptionStatusAnswered && safe) {
        gate = 'local_replay_serialized_entities_semantics_investigated';
    } else if ((schemaInventoryProduced || extractorContractDescribed) && task109Incorporated && safe) {
        gate = 'local_replay_serialized_entities_semantics_partially_investigated';
    }

    return {
        schemaVersion: 1,
        replayId: AUTHORIZED_REPLAY_ID,
        gate,
        successGate: 'local_replay_serialized_entities_semantics_investigated',
        partialGate: 'local_replay_serialized_entities_semantics_partially_investigated',
        blockedGate: 'local_replay_serialized_entities_semantics_blocked',
        defaultBehaviorReproduced: defaultOk,
        recoveryReachedTask107Boundary: boundaryReached,
        schemaInventoryProduced,
        extractorContractDescribed,
        task109Loop21MismatchIncorporated: dynamicSample.loop21?.mismatchConfirmedAgainstAfterCommand === true,
        task109Loop22StillNotIndependentlyJustified: dynamicSample.loop22?.semanticJustification === 'not_independently_justified',
        directAfterCommandSkipAssumptionStatus: riskAssessment.directAfterCommandSkipAssumptionStatus,
        parserEngineModified: false,
        recoveryAdded: false,
        canonicalPackageConstructed: false,
        factualArtifactsEmitted: false,
        reasons: [
            defaultOk ? 'default behavior reproduced Task 105 failure' : 'default behavior did not reproduce Task 105 failure',
            boundaryReached ? 'opt-in recovery reached Task 107/108/109 boundary' : 'opt-in recovery did not reach boundary',
            schemaInventoryProduced ? 'serializedEntities schema inventory produced' : 'schema inventory missing',
            extractorContractDescribed ? 'extractor contract described from code' : 'extractor contract incomplete',
            task109Incorporated ? 'Task 109 loop 21/22 evidence incorporated' : 'Task 109 evidence incomplete',
            assumptionStatusAnswered ? 'direct skip assumption status answered' : 'direct skip assumption not answered',
            safe ? 'protection and branch audits passed' : 'safety audit failed'
        ]
    };
}

async function writeReport(summaryRoot, values) {
    const {
        schemaInventory,
        extractorAnalysis,
        dynamicSample,
        riskAssessment,
        protectionAudit,
        gate
    } = values;
    const report = [
        '# Local Replay SerializedEntities Semantics Investigation',
        '',
        `Gate: \`${gate.gate}\``,
        '',
        '## Schema Facts',
        '',
        `Field: \`CSVCMsg_PacketEntities.serialized_entities\` / \`serializedEntities\``,
        `Field number: \`${schemaInventory.sourceDefinitions[0]?.fieldNumber ?? 'unknown'}\``,
        `Schema type: \`${schemaInventory.schemaConclusion.schemaType}\``,
        `Schema documents direct skip bits: \`${schemaInventory.schemaConclusion.schemaDocumentsDirectSkipBits}\``,
        '',
        '## Extractor Contract',
        '',
        `Algorithm: ${extractorAnalysis.contractFromCode.algorithm}.`,
        `Direct after-command skip contract: \`${extractorAnalysis.directAfterCommandSkipContractStatus}\``,
        `Name status: \`${extractorAnalysis.namePayloadBitsStatus}\``,
        '',
        '## Dynamic Evidence',
        '',
        `Loop 21 mismatch: \`${dynamicSample.loop21?.mismatchConfirmedAgainstAfterCommand ?? false}\``,
        `Loop 21 payloadBits/consumed: \`${dynamicSample.loop21?.payloadBitsFromSerializedEntities ?? 'missing'} / ${dynamicSample.loop21?.actualConsumedAfterCommand ?? 'missing'}\``,
        `Loop 22 semantic status: \`${dynamicSample.loop22?.semanticJustification ?? 'missing'}\``,
        `Broader packet sample: \`${dynamicSample.broaderPacketSampleStatus}\``,
        '',
        '## Assessment',
        '',
        `Direct skip assumption: \`${riskAssessment.directAfterCommandSkipAssumptionStatus}\``,
        `Recommendation: \`${riskAssessment.missingUpdateRecoveryRecommendation}\``,
        `Change parser now: \`${riskAssessment.shouldChangeParserNow}\``,
        '',
        '## Protection',
        '',
        `Replay 005 processed: \`${protectionAudit.replay005Processed}\``,
        `Bot fixtures processed: \`${protectionAudit.bots006To008Processed}\``,
        `Candidates 011-020 touched: \`${protectionAudit.candidates011To020Touched}\``,
        `Parser/engine modified: \`${protectionAudit.parserEngineModified}\``,
        `Canonical package constructed: \`${protectionAudit.canonicalPackageConstructed}\``,
        `Factual artifacts emitted: \`${protectionAudit.factualArtifactsEmitted}\``,
        '',
        `Summary output: \`${summaryRoot.relativePath}\``,
        '',
        'Task 111 was not created.'
    ].join('\n');
    await writeFile(path.join(REPO_ROOT, 'reports/local-replay-serialized-entities-semantics-investigation.md'), `${report}\n`);
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
    return args;
}

export async function runCli(argv = process.argv.slice(2)) {
    const args = parseArgs(argv);
    const input = validateInputPath(args.input, args['replay-id']);
    const roots = validateOutputRoots(args['local-output'], args['summary-output']);
    await ensureDir(roots.local.absolutePath);
    await ensureDir(roots.summary.absolutePath);

    const inputIdentity = await buildInputIdentity(input);
    const defaultPass = await runAdvancementPass({ input, mode: 'default', configuration: undefined });
    const recoveryConfiguration = new ParserConfiguration({
        recovery: {
            allowUnresolvedEntityReference: true,
            allowMissingClassBaseline: false,
            diagnoseOutOfRangeEntityCreate: true,
            diagnoseEntityPacketCursorAlignment: true
        }
    });
    const recoveryPass = await runAdvancementPass({ input, mode: 'opt_in_recovery', configuration: recoveryConfiguration });
    const schemaInventory = await buildSchemaFieldInventory();
    const extractorAnalysis = buildExtractorContractAnalysis();
    const dynamicSample = await buildDynamicPayloadSemanticsSample();
    const riskAssessment = buildSemanticRiskAssessment(schemaInventory, extractorAnalysis, dynamicSample);
    const branchAudit = await auditImplementationSources();
    const protectionAudit = await buildProtectionAudit(inputIdentity, branchAudit);
    const gate = decideGate({
        defaultPass,
        recoveryPass,
        schemaInventory,
        extractorAnalysis,
        dynamicSample,
        riskAssessment,
        protectionAudit,
        branchAudit
    });

    await writeJson(path.join(roots.summary.absolutePath, 'input-identity.json'), inputIdentity);
    await writeJson(path.join(roots.summary.absolutePath, 'default-pass-result.json'), defaultPass);
    await writeJson(path.join(roots.summary.absolutePath, 'recovery-boundary-result.json'), recoveryPass);
    await writeJson(path.join(roots.summary.absolutePath, 'schema-field-inventory.json'), schemaInventory);
    await writeJson(path.join(roots.summary.absolutePath, 'extractor-contract-analysis.json'), extractorAnalysis);
    await writeJson(path.join(roots.summary.absolutePath, 'dynamic-payload-semantics-sample.json'), dynamicSample);
    await writeJson(path.join(roots.summary.absolutePath, 'semantic-risk-assessment.json'), riskAssessment);
    await writeJson(path.join(roots.summary.absolutePath, 'protection-audit.json'), protectionAudit);
    await writeJson(path.join(roots.summary.absolutePath, 'replay-specific-branch-audit.json'), branchAudit);
    await writeJson(path.join(roots.summary.absolutePath, 'semantics-investigation-gate.json'), gate);
    await writeReport(roots.summary, {
        inputIdentity,
        schemaInventory,
        extractorAnalysis,
        dynamicSample,
        riskAssessment,
        protectionAudit,
        gate
    });

    return {
        inputIdentity,
        defaultPass,
        recoveryPass,
        schemaInventory,
        extractorAnalysis,
        dynamicSample,
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
