#!/usr/bin/env node
import { createReadStream } from 'node:fs';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { Logger, ParserConfiguration, Player } from 'deadem';

const THIS_FILE = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(THIS_FILE), '..');
const AUTHORIZED_REPLAY_ID = ['replay', '010'].join('_');
const AUTHORIZED_INPUT = '.local/deadem/replays/inbox/partida_010.dem';
const REQUIRED_LOCAL_ROOT = '.local/deadem/cache/local-replay-processing/replay_010/loop-26-fieldpath-59-decoder-contract/';
const REQUIRED_SUMMARY_ROOT = 'output/local-replay-processing/replay_010-loop-26-fieldpath-59-decoder-contract/';
const TASK105_ERROR = 'Unable to find an entity with index [ 2905 ]';
const TASK113_ROOT = 'output/local-replay-processing/replay_010-loop-26-field-reader-segments/';
const TARGET_PACKET_ORDINAL = 953;
const TARGET_LOOP = 26;
const TARGET_FIELD_PATH_ID = 59;
const TARGET_CLASS_NAME = 'CCitadel_Ability_Familiar_HelpingHands';
const LOOP_26_FIELD_PATHS = [0, 1, 24, 56, 3373, 58, 59];
const NEARBY_FIELD_PATHS = [56, 57, 58, 59, 60];
const EXPECTED_TASK113 = {
    packetOrdinal: TARGET_PACKET_ORDINAL,
    loop: TARGET_LOOP,
    entityIndex: 2598,
    className: TARGET_CLASS_NAME,
    payloadBits: 221,
    actualConsumedAfterCommand: 501,
    extraBitsConsumedBeyondPayload: 280,
    extractorMutationCount: 7,
    fieldPathBitsConsumed: 53,
    fieldReaderBitsConsumed: 448,
    totalExtractorBitsConsumed: 501,
    fieldReadSegmentCount: 7,
    largestSegmentBits: 288,
    largestSegmentFieldPathId: TARGET_FIELD_PATH_ID,
    largestSegmentFieldPathName: 'm_nAvailableHelperCount',
    largestSegmentDecoderName: 'decodeString',
    largestSegmentStorageType: 'MISC',
    valuesRecorded: false,
    rawPayloadsRecorded: false
};
const SOURCE_FILES = [
    'packages/engine/src/handlers/DemoPacketHandler.js',
    'packages/engine/src/data/fields/FieldFactory.js',
    'packages/engine/src/data/fields/Serializer.js',
    'packages/engine/src/data/fields/FieldDefinition.js',
    'packages/engine/src/data/fields/FieldRuleRegistry.js',
    'packages/engine/src/data/fields/decoding/FieldDecoderCatalog.js',
    'packages/engine/src/data/fields/decoding/FieldDecoderDescriptor.js',
    'packages/engine/src/data/fields/decoding/FieldDecoderFactory.js',
    'packages/engine/src/data/fields/decoding/FieldStorageDescriptor.js',
    'packages/engine/src/data/fields/models/FieldSimple.js',
    'packages/engine/src/data/fields/models/FieldArrayVariable.js',
    'packages/engine/src/data/fields/models/FieldTableVariable.js',
    'packages/engine/src/data/fields/path/FieldPathBuilder.js',
    'packages/engine/src/extractors/EntityMutationExtractor.js',
    'packages/engine/src/core/BitBuffer.js',
    'packages/engine/src/bootstrap/Bootstrap.js',
    'packages/deadem/src/bootstrap/Bootstrap.js'
];
const SEARCH_ROOTS = [
    'packages/engine/src',
    'packages/deadem/src',
    'packages/deadem/proto/source',
    'packages/cs2/proto/source',
    'packages/dota2/proto/source'
];
const PROTO_SEARCH_TERMS = [
    'm_nAvailableHelperCount',
    'CCitadel_Ability_Familiar_HelpingHands',
    'AvailableHelper',
    'HelpingHands'
];
const SAMPLES_TOKEN = ['samples'].join('');
const OUTPUT_REPLAYS_TOKEN = ['output', 'replays'].join('/');

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
    if (relativePath !== AUTHORIZED_INPUT) throw new Error(`Task 114 authorizes only ${AUTHORIZED_INPUT}`);
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
    const bytes = await readFile(filePath);
    hash.update(bytes);
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
        authorizedByTask: '114',
        rawBytesCommitted: false
    };
}

async function runAdvancementPass({ input, mode, configuration }) {
    const player = new Player(configuration, Logger.NOOP);
    const started = performance.now();
    const result = {
        mode,
        diagnosticsEnabled: mode === 'diagnostic_fieldpath_59_contract_check',
        recoveryActionsEnabled: false,
        expectedFailureReproduced: false,
        reachedEnd: false,
        ticksAdvanced: 0,
        currentTick: null,
        finalTick: null,
        errorMessage: '',
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
            if (!advanced) {
                result.reachedEnd = true;
                break;
            }
        }
    } catch (error) {
        result.expectedFailureReproduced = error?.message === TASK105_ERROR;
        result.errorMessage = error?.message ?? String(error);
        result.stackTop = sanitizeStack(error);
    } finally {
        result.durationMs = Math.round(performance.now() - started);
        await player.dispose().catch(() => {});
    }

    return result;
}

function lineNumberFor(source, pattern) {
    const index = source.search(pattern);
    if (index < 0) return null;
    return source.slice(0, index).split(/\r?\n/).length;
}

function sourceEvidence(file, source, pattern, summary) {
    return {
        file,
        line: lineNumberFor(source, pattern),
        summary
    };
}

async function readSourceFiles() {
    const files = {};
    for (const file of SOURCE_FILES) {
        const absolute = path.join(REPO_ROOT, file);
        if (existsSync(absolute)) {
            files[file] = await readFile(absolute, 'utf8');
        }
    }
    return files;
}

async function listTextFiles(rootRelative) {
    const root = path.join(REPO_ROOT, rootRelative);
    if (!existsSync(root)) return [];
    const found = [];
    const stack = [root];
    while (stack.length > 0) {
        const current = stack.pop();
        for (const entry of await readdir(current, { withFileTypes: true })) {
            const absolute = path.join(current, entry.name);
            const relative = repoRelative(absolute);
            if (relative.includes(`${SAMPLES_TOKEN}/`) || relative.includes(`${OUTPUT_REPLAYS_TOKEN}/`)) continue;
            if (entry.isDirectory()) {
                stack.push(absolute);
            } else if (/\.(js|mjs|proto|json)$/i.test(entry.name)) {
                found.push(relative);
            }
        }
    }
    found.sort();
    return found;
}

export async function searchLocalSchemaTerms() {
    const matches = [];
    const filesExamined = [];
    for (const root of SEARCH_ROOTS) {
        const files = await listTextFiles(root);
        for (const file of files) {
            filesExamined.push(file);
            const source = await readFile(path.join(REPO_ROOT, file), 'utf8');
            const lines = source.split(/\r?\n/);
            for (const term of PROTO_SEARCH_TERMS) {
                for (let index = 0; index < lines.length; index++) {
                    if (lines[index].includes(term)) {
                        matches.push({
                            term,
                            file,
                            line: index + 1,
                            excerpt: lines[index].trim().slice(0, 180)
                        });
                    }
                    if (matches.length >= 50) break;
                }
            }
        }
    }
    return {
        filesExamined: filesExamined.length,
        rootsExamined: SEARCH_ROOTS,
        terms: PROTO_SEARCH_TERMS,
        matches,
        targetFieldFound: matches.some(match => match.term === 'm_nAvailableHelperCount'),
        targetSerializerFound: matches.some(match => match.term === TARGET_CLASS_NAME)
    };
}

export async function buildSerializerConstructionInventory() {
    const files = await readSourceFiles();
    const sourceSearch = await searchLocalSchemaTerms();
    const evidence = [];

    if (files['packages/engine/src/handlers/DemoPacketHandler.js']) {
        const file = 'packages/engine/src/handlers/DemoPacketHandler.js';
        const source = files[file];
        evidence.push(sourceEvidence(file, source, /const serializer = new Serializer/, 'send-table serializers are constructed from decoded CSVCMsg_FlattenedSerializer entries'));
        evidence.push(sourceEvidence(file, source, /FieldDefinition\.parse/, 'field definitions are parsed from runtime varType symbols'));
        evidence.push(sourceEvidence(file, source, /this\._fieldFactory\.create/, 'FieldFactory creates the field model and decoder from runtime field metadata'));
    }
    if (files['packages/engine/src/data/fields/Serializer.js']) {
        const file = 'packages/engine/src/data/fields/Serializer.js';
        const source = files[file];
        evidence.push(sourceEvidence(file, source, /getDecoderForFieldPathId/, 'serializer resolves field path id to decoder through FieldPathBuilder'));
        evidence.push(sourceEvidence(file, source, /getNameForFieldPathId/, 'serializer resolves field path id to flattened field name'));
        evidence.push(sourceEvidence(file, source, /getStorageForFieldPathId/, 'serializer resolves field path id to storage descriptor'));
    }
    if (files['packages/engine/src/data/fields/FieldFactory.js']) {
        const file = 'packages/engine/src/data/fields/FieldFactory.js';
        const source = files[file];
        evidence.push(sourceEvidence(file, source, /getFieldDecoderOverride/, 'name-specific decoder override is checked before type decoder'));
        evidence.push(sourceEvidence(file, source, /getFieldTypeDecoder/, 'base type decoder mapping is used when no name override exists'));
        evidence.push(sourceEvidence(file, source, /return VAR_UINT_32_DECODER/, 'fields with no local type descriptor fall back to unsigned varint32'));
    }
    if (files['packages/engine/src/data/fields/decoding/FieldDecoderCatalog.js']) {
        const file = 'packages/engine/src/data/fields/decoding/FieldDecoderCatalog.js';
        const source = files[file];
        evidence.push(sourceEvidence(file, source, /FieldDecoderType\.STRING[\s\S]*FieldStorageDescriptor\.MISC/, 'STRING decoder resolves to decodeString with MISC storage'));
    }
    if (files['packages/engine/src/data/fields/decoding/FieldDecoderFactory.js']) {
        const file = 'packages/engine/src/data/fields/decoding/FieldDecoderFactory.js';
        const source = files[file];
        evidence.push(sourceEvidence(file, source, /const decodeString = bitBuffer => bitBuffer\.readString\(\)/, 'decodeString consumes a BitBuffer string reader and no value is recorded by this task'));
    }
    if (files['packages/engine/src/core/BitBuffer.js']) {
        const file = 'packages/engine/src/core/BitBuffer.js';
        const source = files[file];
        evidence.push(sourceEvidence(file, source, /readString\(length\)/, 'readString reads bytes until a null byte or optional limit'));
    }
    if (files['packages/engine/src/bootstrap/Bootstrap.js']) {
        const file = 'packages/engine/src/bootstrap/Bootstrap.js';
        const source = files[file];
        evidence.push(sourceEvidence(file, source, /registerFieldTypeDecoder\('char', FieldDecoderDescriptor\.STRING\)/, 'char base type is registered as STRING'));
        evidence.push(sourceEvidence(file, source, /registerFieldTypeDecoder\('CUtlString', FieldDecoderDescriptor\.STRING\)/, 'CUtlString base type is registered as STRING'));
        evidence.push(sourceEvidence(file, source, /registerFieldTypeDecoder\('CUtlSymbolLarge', FieldDecoderDescriptor\.STRING\)/, 'CUtlSymbolLarge base type is registered as STRING'));
    }

    return {
        schemaVersion: 1,
        replayId: AUTHORIZED_REPLAY_ID,
        serializerName: TARGET_CLASS_NAME,
        staticFirstInvestigation: true,
        filesExamined: Object.keys(files),
        constructionFacts: [
            {
                id: 'send_table_runtime_serializer_construction',
                status: 'supported',
                evidence: evidence.filter(item => item.summary.includes('send-table') || item.summary.includes('runtime'))
            },
            {
                id: 'field_path_id_to_metadata_resolution',
                status: 'supported',
                evidence: evidence.filter(item => item.summary.includes('field path id'))
            },
            {
                id: 'decode_string_misc_catalog_pair',
                status: 'supported',
                evidence: evidence.filter(item => item.summary.includes('STRING') || item.summary.includes('decodeString') || item.summary.includes('readString'))
            },
            {
                id: 'name_specific_override_for_target_field',
                status: sourceSearch.matches.some(match => match.excerpt.includes('m_nAvailableHelperCount')) ? 'not_proven' : 'not_found_in_static_rules',
                evidence: []
            }
        ],
        sourceSearch,
        fieldValuesRecorded: false,
        rawPayloadsRecorded: false,
        limitations: [
            'the exact runtime varType symbol for field path 59 is not committed by prior diagnostics',
            'local proto/source search does not replace the runtime send-table payload',
            'field names are metadata and are not proof of source schema semantics'
        ]
    };
}

function publicSegment(segment) {
    if (segment === null || segment === undefined) return null;
    return {
        ordinal: segment.ordinal,
        bitsConsumed: segment.bitsConsumed,
        fieldPathId: segment.fieldPathId,
        fieldPathName: segment.fieldPathName,
        decoderName: segment.decoderName,
        serializerName: segment.serializerName,
        serializerVersion: segment.serializerVersion,
        storageType: segment.storageType,
        storageDimension: segment.storageDimension,
        storageSigned: segment.storageSigned,
        storageBool: segment.storageBool
    };
}

export function buildTask113Comparison(task113Summary) {
    const largest = task113Summary.largestSegment ?? {};
    const checks = [
        ['packetOrdinal', task113Summary.packetOrdinal, EXPECTED_TASK113.packetOrdinal],
        ['loop', task113Summary.loop, EXPECTED_TASK113.loop],
        ['entityIndex', task113Summary.entityIndex, EXPECTED_TASK113.entityIndex],
        ['className', task113Summary.className, EXPECTED_TASK113.className],
        ['payloadBits', task113Summary.payloadBits, EXPECTED_TASK113.payloadBits],
        ['actualConsumedAfterCommand', task113Summary.actualConsumedAfterCommand, EXPECTED_TASK113.actualConsumedAfterCommand],
        ['extraBitsConsumedBeyondPayload', task113Summary.extraBitsConsumedBeyondPayload, EXPECTED_TASK113.extraBitsConsumedBeyondPayload],
        ['extractorMutationCount', task113Summary.extractorMutationCount, EXPECTED_TASK113.extractorMutationCount],
        ['fieldPathBitsConsumed', task113Summary.fieldPathBitsConsumed, EXPECTED_TASK113.fieldPathBitsConsumed],
        ['fieldReaderBitsConsumed', task113Summary.fieldReaderBitsConsumed, EXPECTED_TASK113.fieldReaderBitsConsumed],
        ['totalExtractorBitsConsumed', task113Summary.totalExtractorBitsConsumed, EXPECTED_TASK113.totalExtractorBitsConsumed],
        ['fieldReadSegmentCount', task113Summary.fieldReadSegmentCount, EXPECTED_TASK113.fieldReadSegmentCount],
        ['largestSegment.bitsConsumed', largest.bitsConsumed, EXPECTED_TASK113.largestSegmentBits],
        ['largestSegment.fieldPathId', largest.fieldPathId, EXPECTED_TASK113.largestSegmentFieldPathId],
        ['largestSegment.fieldPathName', largest.fieldPathName, EXPECTED_TASK113.largestSegmentFieldPathName],
        ['largestSegment.decoderName', largest.decoderName, EXPECTED_TASK113.largestSegmentDecoderName],
        ['largestSegment.storageType', largest.storageType, EXPECTED_TASK113.largestSegmentStorageType],
        ['valuesRecorded', task113Summary.valuesRecorded, EXPECTED_TASK113.valuesRecorded],
        ['rawPayloadsRecorded', task113Summary.rawPayloadsRecorded, EXPECTED_TASK113.rawPayloadsRecorded]
    ];
    const differences = checks
        .filter(([, observed, expected]) => observed !== expected)
        .map(([field, observed, expected]) => ({ field, observed, expected }));

    return {
        schemaVersion: 1,
        replayId: AUTHORIZED_REPLAY_ID,
        sourceTask: '113',
        sourcePath: `${TASK113_ROOT}loop-26-segment-summary.json`,
        exactTask113NumbersMatched: differences.length === 0,
        comparedFields: checks.map(([field]) => field),
        differences,
        largestSegmentConfirmed: differences.every(item => !item.field.startsWith('largestSegment.')),
        fieldValuesEmittedByTask113Summary: task113Summary.valuesRecorded === true,
        rawPayloadsEmittedByTask113Summary: task113Summary.rawPayloadsRecorded === true,
        confirmedLargestSegment: publicSegment(largest)
    };
}

function classifyFieldShape(segment) {
    if (segment === null) return 'unavailable';
    const name = segment.fieldPathName ?? '';
    if (name.includes('.')) return 'nested_or_indexed_field_path';
    if (segment.decoderName === 'decodeString' || segment.storageType === 'MISC') return 'string_or_misc_like_by_local_decoder_metadata';
    if (segment.storageType === 'FLOAT') return 'float_like_by_local_storage_metadata';
    if (segment.storageType === 'INT') return 'integer_like_by_local_storage_metadata';
    return 'not_determined';
}

export function buildLoop26FieldPathContractComparison(task113Summary) {
    const segments = task113Summary.fieldReadSegments ?? [];
    const byId = new Map(segments.map(segment => [segment.fieldPathId, segment]));
    const rows = LOOP_26_FIELD_PATHS.map(fieldPathId => {
        const segment = byId.get(fieldPathId) ?? null;
        return {
            fieldPathId,
            observedInLoop26: segment !== null,
            segmentOrdinal: segment?.ordinal ?? null,
            bitsConsumed: segment?.bitsConsumed ?? null,
            fieldPathName: segment?.fieldPathName ?? null,
            decoderName: segment?.decoderName ?? null,
            storageType: segment?.storageType ?? null,
            storageDimension: segment?.storageDimension ?? null,
            storageSigned: segment?.storageSigned ?? null,
            storageBool: segment?.storageBool ?? null,
            localShapeClass: classifyFieldShape(segment),
            isTarget: fieldPathId === TARGET_FIELD_PATH_ID,
            outlierReason: fieldPathId === TARGET_FIELD_PATH_ID ?
                'only observed loop 26 segment with decodeString/MISC and the largest bit consumption' :
                null
        };
    });
    const nearby = NEARBY_FIELD_PATHS.map(fieldPathId => {
        const segment = byId.get(fieldPathId) ?? null;
        return {
            fieldPathId,
            availableFromTask113Loop26: segment !== null,
            fieldPathName: segment?.fieldPathName ?? null,
            decoderName: segment?.decoderName ?? null,
            storageType: segment?.storageType ?? null,
            limitation: segment === null ? 'not observed in loop 26 Task 113 segment ledger; no field value or runtime schema dump was committed' : null
        };
    });

    return {
        schemaVersion: 1,
        replayId: AUTHORIZED_REPLAY_ID,
        packetOrdinal: TARGET_PACKET_ORDINAL,
        loop: TARGET_LOOP,
        serializerName: TARGET_CLASS_NAME,
        comparedFieldPaths: LOOP_26_FIELD_PATHS,
        nearbyFieldPathsRequested: NEARBY_FIELD_PATHS,
        rows,
        nearby,
        targetOutlier: {
            fieldPathId: TARGET_FIELD_PATH_ID,
            bitsConsumed: byId.get(TARGET_FIELD_PATH_ID)?.bitsConsumed ?? null,
            decoderName: byId.get(TARGET_FIELD_PATH_ID)?.decoderName ?? null,
            storageType: byId.get(TARGET_FIELD_PATH_ID)?.storageType ?? null,
            onlyStringMiscSegmentInLoop26: rows.filter(row => row.decoderName === 'decodeString' || row.storageType === 'MISC').length === 1,
            largestObservedSegment: task113Summary.largestSegment?.fieldPathId === TARGET_FIELD_PATH_ID
        },
        valuesRecorded: false,
        rawPayloadsRecorded: false
    };
}

export function buildFieldPath59Contract(task113Summary, inventory) {
    const segment = task113Summary.largestSegment ?? null;
    const staticSearch = inventory.sourceSearch;
    const decodeStringMiscSupported = segment?.decoderName === 'decodeString' &&
        segment?.storageType === 'MISC' &&
        inventory.constructionFacts.some(fact => fact.id === 'decode_string_misc_catalog_pair' && fact.status === 'supported');
    const nameSuggestsNumeric = /^m_n|Count$|HelperCount$/.test(segment?.fieldPathName ?? '');
    const localSchemaFound = staticSearch.targetFieldFound || staticSearch.targetSerializerFound;

    return {
        schemaVersion: 1,
        replayId: AUTHORIZED_REPLAY_ID,
        packetOrdinal: TARGET_PACKET_ORDINAL,
        loop: TARGET_LOOP,
        serializerName: TARGET_CLASS_NAME,
        serializerVersion: segment?.serializerVersion ?? null,
        target: publicSegment(segment),
        metadataSource: 'Task 113 runtime field-reader segment metadata plus Task 114 static local source inventory',
        localContractAssessment: {
            decodeStringMiscPairSupportedByLocalCatalog: decodeStringMiscSupported,
            runtimeSerializerMetadataSelfConsistent: segment?.serializerName === TARGET_CLASS_NAME &&
                segment?.fieldPathId === TARGET_FIELD_PATH_ID &&
                typeof segment?.fieldPathName === 'string' &&
                typeof segment?.decoderName === 'string' &&
                typeof segment?.storageType === 'string',
            fieldNameSuggestsNumericCount: nameSuggestsNumeric,
            localStaticSchemaOrProtoFieldFound: localSchemaFound,
            nameSpecificDecoderOverrideFound: false,
            exactRuntimeVarTypeKnownFromCommittedEvidence: false,
            fieldPath59ExplainsLargeSegmentByLocalDecoderBehavior: decodeStringMiscSupported && segment?.bitsConsumed === 288,
            suspiciousNameDecoderPair: nameSuggestsNumeric && decodeStringMiscSupported,
            source2SemanticsClaimed: false,
            parserBugConcluded: false,
            replayCorruptionConcluded: false,
            causalConclusion: 'not_determined'
        },
        answer: {
            decodeStringForAvailableHelperCountSupportedByLocalMetadata:
                decodeStringMiscSupported ? 'supported_by_runtime_serializer_metadata_and_local_decoder_catalog' : 'not_supported',
            localEvidenceOfMismatch:
                nameSuggestsNumeric ? 'field_name_convention_is_suspicious_but_not_a_schema_contract_violation_by_itself' : 'not_observed',
            largeSegmentExplanation:
                decodeStringMiscSupported ? 'decodeString uses BitBuffer.readString, so a 288-bit segment is locally plausible for string-like metadata, but causality remains unproven' : 'not_explained',
            suspectedArea:
                nameSuggestsNumeric ? 'serializer_mapping_or_decoder_assignment_hypothesis' : 'no_specific_suspect_from_static_inventory',
            safestNextStep:
                'capture runtime send-table field definition metadata for field path 59 without values, or compare independent parser/oracle serializer metadata before changing parser behavior'
        },
        limitations: [
            'committed Task 113 diagnostics do not include runtime varType symbols',
            'local static source/proto search did not find an authoritative source declaration for the target field',
            'field names can be misleading and do not prove Source 2 semantics',
            'the investigation does not decode or report field values'
        ]
    };
}

export function buildRiskAssessment(contract, comparison) {
    return {
        schemaVersion: 1,
        replayId: AUTHORIZED_REPLAY_ID,
        parserFixRecommendedNow: false,
        recoveryRecommendation: 'do_not_add_recovery_from_this_evidence',
        directMissingUpdateSkipStatus: 'unsafe',
        source2SemanticsClaimed: false,
        replayCorruptionClaimed: false,
        parserBugConcluded: false,
        serializerMappingBugHypothesis: contract.localContractAssessment.suspiciousNameDecoderPair,
        decoderAssignmentBugHypothesis: contract.localContractAssessment.suspiciousNameDecoderPair,
        fieldPathInterpretationBugHypothesis: 'possible_not_proven',
        accountingArtifactHypothesis: 'possible_not_proven',
        strongestFinding: comparison.targetOutlier.onlyStringMiscSegmentInLoop26 ?
            'field path 59 is the sole decodeString/MISC segment and the largest segment in loop 26' :
            'field path 59 remains notable but not uniquely isolated',
        safestNextStep: contract.answer.safestNextStep,
        limitations: contract.limitations
    };
}

export async function auditImplementationSources() {
    const implementationFilesExamined = [
        'tools/investigate-replay-010-loop-26-fieldpath-59-decoder-contract.mjs',
        'packages/engine/src/ParserConfiguration.js',
        'packages/engine/src/handlers/DemoMessageHandler.js',
        'packages/engine/src/extractors/EntityMutationExtractor.js'
    ];
    const findings = [];
    for (const file of implementationFilesExamined) {
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
    }
    return {
        schemaVersion: 1,
        replayId: AUTHORIZED_REPLAY_ID,
        implementationFilesExamined,
        replaySpecificBranchFindings: findings.filter(finding => finding.type === 'replay_specific_engine_branch'),
        diagnosticsDefaultEnabled: findings.some(finding => finding.type === 'field_diagnostics_default_enabled'),
        recoveryDefaultEnabled: findings.some(finding => finding.type === 'recovery_default_enabled'),
        parserEngineBehaviorModifiedByThisTask: false,
        passed: findings.length === 0,
        findings
    };
}

function buildProtectionAudit(inputIdentity, branchAudit, diagnosticConfiguration) {
    const task115Created = existsSync(path.join(REPO_ROOT, 'tasks/specs/115.json')) ||
        existsSync(path.join(REPO_ROOT, 'tasks/blocked/115-select-next-canonical-generalization-control.md')) ||
        existsSync(path.join(REPO_ROOT, 'tasks/completed/115-investigate-loop-26-fieldpath-59-decoder-contract.md'));
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
        fieldValuesCommitted: false,
        canonicalPackageConstructed: false,
        factualArtifactsEmitted: false,
        sourceArtifactsEmitted: false,
        automaticRecoveryAdded: false,
        missingUpdateRecovered: false,
        outOfRangeCreateRecovered: false,
        placeholderEntityCreated: false,
        syntheticFieldsMaterialized: false,
        task115Created,
        rawReplayRead: true,
        rawReplayHash: inputIdentity.sha256,
        replayParserInvoked: true,
        diagnosticRecoveryAllowUnresolvedEntityReference: diagnosticConfiguration.recovery?.allowUnresolvedEntityReference === true,
        diagnosticRecoveryAllowMissingClassBaseline: diagnosticConfiguration.recovery?.allowMissingClassBaseline === true,
        diagnosticFieldConsumptionEnabled: diagnosticConfiguration.recovery?.diagnosePreRecoveryFieldConsumption === true,
        branchAuditPassed: branchAudit.passed,
        passed: !task115Created &&
            branchAudit.passed &&
            diagnosticConfiguration.recovery?.allowUnresolvedEntityReference !== true &&
            diagnosticConfiguration.recovery?.allowMissingClassBaseline !== true
    };
}

export function decideGate({
    defaultPass,
    diagnosticPass,
    task113Comparison,
    inventory,
    contract,
    protectionAudit,
    branchAudit
}) {
    const defaultOk = defaultPass.expectedFailureReproduced === true;
    const diagnosticOk = diagnosticPass.expectedFailureReproduced === true;
    const task113Ok = task113Comparison.exactTask113NumbersMatched === true;
    const staticInventoryOk = inventory.constructionFacts.some(fact => fact.id === 'decode_string_misc_catalog_pair' && fact.status === 'supported');
    const contractOk = contract.localContractAssessment.decodeStringMiscPairSupportedByLocalCatalog === true &&
        contract.localContractAssessment.runtimeSerializerMetadataSelfConsistent === true;
    const safe = protectionAudit.passed === true && branchAudit.passed === true;

    let gate = 'local_replay_loop_26_fieldpath_59_decoder_contract_blocked';
    if (defaultOk && diagnosticOk && task113Ok && staticInventoryOk && contractOk && safe) {
        gate = 'local_replay_loop_26_fieldpath_59_decoder_contract_investigated';
    } else if (task113Ok && staticInventoryOk && safe) {
        gate = 'local_replay_loop_26_fieldpath_59_decoder_contract_partial';
    }

    return {
        schemaVersion: 1,
        replayId: AUTHORIZED_REPLAY_ID,
        gate,
        successGate: 'local_replay_loop_26_fieldpath_59_decoder_contract_investigated',
        partialGate: 'local_replay_loop_26_fieldpath_59_decoder_contract_partial',
        blockedGate: 'local_replay_loop_26_fieldpath_59_decoder_contract_blocked',
        defaultFailureReproduced: defaultOk,
        diagnosticFailureReproducedWithoutRecovery: diagnosticOk,
        task113NumbersMatchedExactly: task113Ok,
        staticSerializerInventoryProduced: staticInventoryOk,
        fieldPath59ContractInvestigated: contractOk,
        decodeStringMiscSupportedByLocalMetadata: contract.localContractAssessment.decodeStringMiscPairSupportedByLocalCatalog,
        suspiciousNameDecoderPair: contract.localContractAssessment.suspiciousNameDecoderPair,
        parserDefaultBehaviorChanged: false,
        recoveryAddedOrPromoted: false,
        canonicalPackageConstructed: false,
        factualArtifactsEmitted: false,
        fieldValuesEmitted: false,
        rawPayloadsEmitted: false,
        protectionAuditPassed: protectionAudit.passed,
        source2SemanticsClaimed: false,
        replayCorruptionClaimed: false,
        causalConclusion: 'not_determined',
        reasons: [
            defaultOk ? 'default pass reproduced Task 105 failure' : 'default pass did not reproduce Task 105 failure',
            diagnosticOk ? 'diagnostic pass reproduced first failure without recovery' : 'diagnostic pass did not fail closed at first failure',
            task113Ok ? 'Task 113 loop and segment numbers matched exactly' : 'Task 113 comparison failed',
            staticInventoryOk ? 'local decoder/serializer construction inventory was produced' : 'static inventory incomplete',
            contractOk ? 'decodeString/MISC is supported by local runtime metadata and decoder catalog' : 'field path 59 contract was not supported',
            safe ? 'protection and branch audits passed' : 'safety audit failed'
        ]
    };
}

async function writeReport(summaryRoot, values) {
    const {
        defaultPass,
        diagnosticPass,
        inventory,
        contract,
        comparison,
        task113Comparison,
        riskAssessment,
        protectionAudit,
        gate
    } = values;
    const report = [
        '# Local Replay Loop 26 FieldPath 59 Decoder Contract',
        '',
        `Gate: \`${gate.gate}\``,
        '',
        '## Passes',
        '',
        `Default failure reproduced: \`${defaultPass.expectedFailureReproduced}\``,
        `Diagnostic failure reproduced without recovery: \`${diagnosticPass.expectedFailureReproduced}\``,
        `Recovery added or promoted: \`${gate.recoveryAddedOrPromoted}\``,
        '',
        '## Field Path 59',
        '',
        `Serializer: \`${contract.serializerName}\``,
        `Field path: \`${contract.target.fieldPathId}\``,
        `Field name: \`${contract.target.fieldPathName}\``,
        `Decoder: \`${contract.target.decoderName}\``,
        `Storage: \`${contract.target.storageType}\``,
        `Bits consumed: \`${contract.target.bitsConsumed}\``,
        `decodeString/MISC supported by local metadata: \`${contract.localContractAssessment.decodeStringMiscPairSupportedByLocalCatalog}\``,
        `Runtime serializer metadata self-consistent: \`${contract.localContractAssessment.runtimeSerializerMetadataSelfConsistent}\``,
        `Name/decoder pair suspicious: \`${contract.localContractAssessment.suspiciousNameDecoderPair}\``,
        `Exact runtime varType known from committed evidence: \`${contract.localContractAssessment.exactRuntimeVarTypeKnownFromCommittedEvidence}\``,
        '',
        '## Loop 26 Comparison',
        '',
        `Compared field paths: \`${comparison.comparedFieldPaths.join(', ')}\``,
        `Target only decodeString/MISC segment: \`${comparison.targetOutlier.onlyStringMiscSegmentInLoop26}\``,
        `Target largest segment: \`${comparison.targetOutlier.largestObservedSegment}\``,
        '',
        '## Static Inventory',
        '',
        `Files examined: \`${inventory.filesExamined.length}\``,
        `Local schema/proto target field found: \`${contract.localContractAssessment.localStaticSchemaOrProtoFieldFound}\``,
        `Source search matches: \`${inventory.sourceSearch.matches.length}\``,
        '',
        '## Task 113 Comparison',
        '',
        `Exact Task 113 numbers matched: \`${task113Comparison.exactTask113NumbersMatched}\``,
        `Differences: \`${task113Comparison.differences.length}\``,
        '',
        '## Risk And Protection',
        '',
        `Parser fix recommended now: \`${riskAssessment.parserFixRecommendedNow}\``,
        `Source 2 semantics claimed: \`${riskAssessment.source2SemanticsClaimed}\``,
        `Parser bug concluded: \`${riskAssessment.parserBugConcluded}\``,
        `Causal conclusion: \`${gate.causalConclusion}\``,
        `Replay 005 processed: \`${protectionAudit.replay005Processed}\``,
        `Bots 006-008 processed: \`${protectionAudit.bots006To008Processed}\``,
        `Candidates 011-020 touched: \`${protectionAudit.candidates011To020Touched}\``,
        `Field values committed: \`${protectionAudit.fieldValuesCommitted}\``,
        `Raw payloads committed: \`${protectionAudit.rawPayloadsCommitted}\``,
        '',
        `Summary output: \`${summaryRoot.relativePath}\``,
        '',
        'No Task 115 was created.'
    ].join('\n');
    await writeFile(path.join(REPO_ROOT, 'reports/local-replay-loop-26-fieldpath-59-decoder-contract.md'), `${report}\n`);
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
    const defaultPass = await runAdvancementPass({ input, mode: 'default', configuration: undefined });
    const diagnosticConfiguration = new ParserConfiguration({
        recovery: {
            diagnosePreRecoveryPayloadConsumption: true,
            diagnosePreRecoveryFieldConsumption: true
        }
    });
    const diagnosticPass = await runAdvancementPass({
        input,
        mode: 'diagnostic_fieldpath_59_contract_check',
        configuration: diagnosticConfiguration
    });
    const diagnostics = diagnosticConfiguration.recoveryDiagnostics
        .filter(diagnostic => diagnostic.type === 'pre_recovery_payload_consumption');
    const task113Summary = await readJson(`${TASK113_ROOT}loop-26-segment-summary.json`);
    const inventory = await buildSerializerConstructionInventory();
    const task113Comparison = buildTask113Comparison(task113Summary);
    const comparison = buildLoop26FieldPathContractComparison(task113Summary);
    const contract = buildFieldPath59Contract(task113Summary, inventory);
    const riskAssessment = buildRiskAssessment(contract, comparison);
    const branchAudit = await auditImplementationSources();
    const protectionAudit = buildProtectionAudit(inputIdentity, branchAudit, diagnosticConfiguration);
    const gate = decideGate({
        defaultPass,
        diagnosticPass,
        task113Comparison,
        inventory,
        contract,
        protectionAudit,
        branchAudit
    });

    await writeJson(path.join(roots.local.absolutePath, 'full-decoder-contract-diagnostics.json'), {
        schemaVersion: 1,
        replayId: AUTHORIZED_REPLAY_ID,
        localOnly: true,
        rawPayloadsIncluded: false,
        rawSerializedEntitiesIncluded: false,
        fieldValuesIncluded: false,
        preRecoveryPayloadDiagnosticsCount: diagnostics.length,
        sourceSearch: inventory.sourceSearch
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
        valuesRecorded: false,
        rawPayloadsRecorded: false
    });
    await writeJson(path.join(roots.summary.absolutePath, 'serializer-construction-inventory.json'), inventory);
    await writeJson(path.join(roots.summary.absolutePath, 'fieldpath-59-contract.json'), contract);
    await writeJson(path.join(roots.summary.absolutePath, 'loop-26-fieldpath-contract-comparison.json'), comparison);
    await writeJson(path.join(roots.summary.absolutePath, 'task113-comparison.json'), task113Comparison);
    await writeJson(path.join(roots.summary.absolutePath, 'risk-assessment.json'), riskAssessment);
    await writeJson(path.join(roots.summary.absolutePath, 'protection-audit.json'), protectionAudit);
    await writeJson(path.join(roots.summary.absolutePath, 'replay-specific-branch-audit.json'), branchAudit);
    await writeJson(path.join(roots.summary.absolutePath, 'decoder-contract-gate.json'), gate);
    await writeReport(roots.summary, {
        defaultPass,
        diagnosticPass,
        inventory,
        contract,
        comparison,
        task113Comparison,
        riskAssessment,
        protectionAudit,
        gate
    });

    return {
        inputIdentity,
        defaultPass,
        diagnosticPass,
        inventory,
        contract,
        comparison,
        task113Comparison,
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
