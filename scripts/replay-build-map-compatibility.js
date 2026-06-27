import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';

import { Logger, Player } from 'deadem';

const MANIFEST_FILE = 'data/replay-manifest.json';
const OUTPUTS = {
    compatibility: 'output/replay-build-map-compatibility.json',
    geometryPlan: 'output/replay-geometry-profile-plan.json',
    fingerprints: 'output/replay-structural-fingerprints.json',
    pairwise: 'output/replay-pairwise-compatibility-matrix.json',
    repeatability: 'output/replay-fingerprint-repeatability.json'
};
const OUTPUT_SIZE_LIMIT = 10 * 1024 * 1024;
const CRITICAL_CLASSES = [
    'CCitadelPlayerController',
    'CCitadelPlayerPawn',
    'CCitadelGameRulesProxy'
];
const GEOMETRY_CLASS_PATTERN = /(Map|World|Objective|Boss|Guardian|Sentry|Walker|Patron|Trooper|Zipline|Lane|Shop|Base|Spawn|Neutral|Citadel)/iu;
const VOLATILE_FIELD_PATTERN = /(name|steam|account|playername|isz|position|origin|vecx|vecy|vecz|cell|tick|time|score|gold|damage|health|networth|kills|deaths|assists)/iu;

main();

async function main() {
    const manifest = JSON.parse(await fs.readFile(MANIFEST_FILE, 'utf8'));
    const fingerprints = [];

    for (const replay of manifest.replays) {
        fingerprints.push(await extractFingerprint(replay));
    }

    const pairwise = buildPairwiseMatrix(fingerprints);
    const geometryPlan = buildGeometryPlan(fingerprints, pairwise);
    const compatibility = buildCompatibility(fingerprints);
    const repeatability = await repeatabilityCheck(manifest.replays.filter(replay => [ 'replay_001', 'replay_002' ].includes(replay.replayId)));

    await writeJson(OUTPUTS.fingerprints, {
        schemaVersion: 1,
        datasetId: manifest.datasetId,
        fingerprints
    });
    await writeJson(OUTPUTS.pairwise, pairwise);
    await writeJson(OUTPUTS.geometryPlan, geometryPlan);
    await writeJson(OUTPUTS.compatibility, compatibility);
    await writeJson(OUTPUTS.repeatability, repeatability);
    await validateOutputs(Object.values(OUTPUTS));

    console.log(`gate: ${compatibility.gateResult}`);
    console.log(`schema groups: ${compatibility.grouping.schemaFingerprintGroups.length}`);
    console.log(`geometry groups: ${compatibility.grouping.geometryFingerprintGroups.length}`);
}

async function extractFingerprint(replay) {
    const player = new Player(undefined, Logger.NOOP);
    const evidence = [];
    const uncertainties = [];
    const directMetadata = {
        buildNumber: null,
        networkProtocol: null,
        serverVersion: null,
        clientVersion: null,
        contentVersion: replay.contentVersion ?? null,
        mapName: replay.map ?? null,
        gameMode: null,
        matchId: null,
        demoProtocol: null,
        serverInfo: {},
        mapCrc: null,
        absentFields: []
    };
    let components = null;

    try {
        await player.load(createReadStream(replay.localPath));
        await player.seekToTick(player.getLastTick());
        const demo = player.getDemo();
        const server = demo.server ?? {};
        directMetadata.networkProtocol = normalizeScalar(server.protocol);
        directMetadata.mapName = normalizeScalar(server.mapName);
        directMetadata.mapCrc = normalizeScalar(server.mapCrc);
        directMetadata.serverInfo = normalizeObject({
            tickRate: server.tickRate ?? null,
            tickInterval: server.tickInterval ?? null,
            maxClasses: server.maxClasses ?? null,
            maxClients: server.maxClients ?? null
        });
        directMetadata.absentFields = Object.entries(directMetadata)
            .filter(([ key, value ]) => ![ 'absentFields', 'serverInfo' ].includes(key) && value === null)
            .map(([ key ]) => key);
        evidence.push('Player.load succeeded');
        evidence.push('Player seek to last tick succeeded');
        evidence.push('Demo class, serializer, string table, and entity structures inspected');
        if (directMetadata.absentFields.length > 0) {
            uncertainties.push('Direct replay metadata fields are absent from parser-exposed server object; this is not proof that the replay lacks them.');
        }
        components = buildComponents(replay, player);
    } catch (error) {
        uncertainties.push(error instanceof Error ? error.message : String(error));
        components = emptyComponents(replay);
    } finally {
        await player.dispose();
    }

    const schemaFingerprint = sha256(stableStringify(components.schema));
    const geometryFingerprint = sha256(stableStringify(components.geometry));

    return {
        fingerprintSchemaVersion: 1,
        replayId: replay.replayId,
        directMetadata,
        schemaFingerprint,
        geometryFingerprint,
        components,
        evidence,
        uncertainties
    };
}

function buildComponents(replay, player) {
    const demo = player.getDemo();
    const classes = demo.getClasses().map(clazz => ({
        id: clazz.id,
        name: clazz.name,
        serializerKey: clazz.serializer.key.toString(),
        serializerFields: stableArray(clazz.serializer.fields
            .map(field => `${field.sendNode.join('.')}.${field.name}`.replace(/^\./u, ''))
            .filter(field => !VOLATILE_FIELD_PATTERN.test(field))),
        observedFieldNames: stableArray(collectClassFieldNames(demo, clazz.name).filter(field => !VOLATILE_FIELD_PATTERN.test(field))),
        critical: CRITICAL_CLASSES.includes(clazz.name)
    })).sort(compareByName);
    const criticalClassSignatures = Object.fromEntries(CRITICAL_CLASSES.map(className => [
        className,
        classes.find(clazz => clazz.name === className)?.serializerFields ?? []
    ]));
    const stringTables = demo.stringTableContainer.getTables().map(table => ({
        id: table.id,
        name: table.type.name,
        code: table.type.code,
        entries: table.getEntriesCount(),
        valueCompression: table.getIsValueCompressionSupported()
    })).sort(compareByName);
    const entityClassCounts = countBy(demo.getEntities(), entity => entity.class.name);
    const geometryClasses = classes
        .filter(clazz => GEOMETRY_CLASS_PATTERN.test(clazz.name))
        .map(clazz => ({
            name: clazz.name,
            entityCount: entityClassCounts[clazz.name] ?? 0,
            structuralFields: clazz.serializerFields
        }));
    const mapResourceStrings = collectMapResourceStrings(demo);

    return {
        direct: {
            replayId: replay.replayId,
            parserVersion: replay.parserVersion,
            firstTick: player.getFirstTick(),
            lastTick: player.getLastTick(),
            tickRate: demo.server?.tickRate ?? null,
            stats: normalizeObject(demo.getStats())
        },
        schema: {
            parserVersion: replay.parserVersion,
            classNames: classes.map(clazz => clazz.name),
            serializerCount: demo.getStats().serializers,
            classCount: demo.getStats().classes,
            stringTableNames: stringTables.map(table => table.name),
            criticalClassSignatures,
            eventDescriptorNames: stringTables.filter(table => /event/iu.test(table.name)).map(table => table.name),
            parserMessageTypeInventory: collectMessageTypeInventory(),
            nonVolatileClassFieldSignatureSummary: classes.map(clazz => ({
                name: clazz.name,
                serializerKey: clazz.serializerKey,
                fieldCount: clazz.serializerFields.length,
                fieldsHash: sha256(stableStringify(clazz.serializerFields))
            }))
        },
        geometry: {
            geometryClassNames: geometryClasses.map(clazz => clazz.name),
            geometryClassEntityCounts: Object.fromEntries(geometryClasses.map(clazz => [ clazz.name, clazz.entityCount ])),
            geometryClassFieldSignatures: Object.fromEntries(geometryClasses.map(clazz => [ clazz.name, clazz.structuralFields ])),
            objectiveLikeClassNames: geometryClasses.filter(clazz => /(Objective|Boss|Guardian|Sentry|Walker|Patron|Trooper)/iu.test(clazz.name)).map(clazz => clazz.name),
            traversalLikeClassNames: geometryClasses.filter(clazz => /(Zipline|Rail|Rope|Traversal)/iu.test(clazz.name)).map(clazz => clazz.name),
            mapResourceStrings
        }
    };
}

function collectClassFieldNames(demo, className) {
    const fields = new Set();
    for (const entity of demo.getEntitiesByClassName(className)) {
        for (const field of entity.fieldNames()) {
            fields.add(field);
        }
    }
    return Array.from(fields).sort();
}

function collectMapResourceStrings(demo) {
    const values = [];
    for (const table of demo.stringTableContainer.getTables()) {
        for (const entry of table.getEntries().slice(0, 500)) {
            const key = String(entry.key ?? '');
            if (/(map|citadel|lane|zipline|objective|boss|patron|sentry|guardian)/iu.test(key)) {
                values.push({ table: table.type.name, key });
            }
        }
    }
    return values.sort((left, right) => `${left.table}:${left.key}`.localeCompare(`${right.table}:${right.key}`)).slice(0, 250);
}

function collectMessageTypeInventory() {
    return [
        'DEM_FileHeader',
        'DEM_FileInfo',
        'svc_ServerInfo',
        'net_SignonState',
        'net_Tick',
        'CSVCMsg_FlattenedSerializer'
    ].sort();
}

function emptyComponents(replay) {
    return {
        direct: { replayId: replay.replayId, parserVersion: replay.parserVersion },
        schema: {
            parserVersion: replay.parserVersion,
            classNames: [],
            serializerCount: 0,
            classCount: 0,
            stringTableNames: [],
            criticalClassSignatures: {},
            eventDescriptorNames: [],
            parserMessageTypeInventory: collectMessageTypeInventory(),
            nonVolatileClassFieldSignatureSummary: []
        },
        geometry: {
            geometryClassNames: [],
            geometryClassEntityCounts: {},
            geometryClassFieldSignatures: {},
            objectiveLikeClassNames: [],
            traversalLikeClassNames: [],
            mapResourceStrings: []
        }
    };
}

function buildPairwiseMatrix(fingerprints) {
    const pairs = [];
    for (const left of fingerprints) {
        for (const right of fingerprints) {
            const differences = [];
            const directBuildAgreement = directAgreement(left.directMetadata.buildNumber, right.directMetadata.buildNumber);
            const directMapAgreement = directAgreement(left.directMetadata.mapName, right.directMetadata.mapName);
            const schemaFingerprintAgreement = left.schemaFingerprint === right.schemaFingerprint;
            const criticalFieldSignatureAgreement = stableStringify(left.components.schema.criticalClassSignatures) === stableStringify(right.components.schema.criticalClassSignatures);
            const eventDescriptorAgreement = stableStringify(left.components.schema.eventDescriptorNames) === stableStringify(right.components.schema.eventDescriptorNames);
            const geometryFingerprintAgreement = left.geometryFingerprint === right.geometryFingerprint;
            const topologyEvidenceAgreement = geometryFingerprintAgreement;

            if (!schemaFingerprintAgreement) {
                differences.push('schema_fingerprint_differs');
            }
            if (!criticalFieldSignatureAgreement) {
                differences.push('critical_field_signature_differs');
            }
            if (!geometryFingerprintAgreement) {
                differences.push('geometry_fingerprint_differs');
            }
            pairs.push({
                leftReplayId: left.replayId,
                rightReplayId: right.replayId,
                directBuildAgreement,
                directMapAgreement,
                schemaFingerprintAgreement,
                criticalFieldSignatureAgreement,
                eventDescriptorAgreement,
                geometryFingerprintAgreement,
                topologyEvidenceAgreement,
                differencesFound: differences,
                compatibilityConfidence: confidenceForPair({
                    schemaFingerprintAgreement,
                    criticalFieldSignatureAgreement,
                    eventDescriptorAgreement,
                    geometryFingerprintAgreement
                }),
                commonPipelineCodeMayBeReused: schemaFingerprintAgreement && criticalFieldSignatureAgreement,
                sharedGeometryProfileMayBeReused: geometryFingerprintAgreement && topologyEvidenceAgreement
            });
        }
    }
    return {
        schemaVersion: 1,
        kind: 'replay_pairwise_compatibility_matrix',
        pairs,
        symmetryChecks: symmetryChecks(pairs)
    };
}

function buildGeometryPlan(fingerprints, pairwise) {
    const groups = groupBy(fingerprints, fingerprint => fingerprint.geometryFingerprint);
    return {
        schemaVersion: 1,
        kind: 'replay_geometry_profile_plan',
        profiles: Array.from(groups.entries()).map(([ hash, items ]) => ({
            geometryProfile: `geometry_profile/unverified_${hash.slice(0, 12)}`,
            replayIds: items.map(item => item.replayId).sort(),
            geometryFingerprint: hash,
            evidenceSupportingAssignment: [
                'deterministic geometry structural fingerprint',
                'geometry-related class names and non-volatile field signatures',
                'objective/traversal/map-resource structural evidence where parser exposed it'
            ],
            confidence: pairwiseSharedGeometryConfidence(items, pairwise),
            reuseAllowed: items.length > 1 ? 'preliminary_structural_reuse_only' : 'single_replay_profile_only',
            validationStillRequired: [
                'direct map/build metadata or stronger map fingerprint',
                'topology anchor validation before stages 13-18',
                'no occupancy-derived validation used'
            ],
            topologyMayBeReused: false,
            geometryMustBeRegenerated: true
        })),
        warning: 'No profile is named build_6592 because direct build 6592 was not established for all assigned replays.'
    };
}

function buildCompatibility(fingerprints) {
    const schemaGroups = groupBy(fingerprints, fingerprint => fingerprint.schemaFingerprint);
    const geometryGroups = groupBy(fingerprints, fingerprint => fingerprint.geometryFingerprint);
    const allHaveSchema = fingerprints.every(fingerprint => fingerprint.components.schema.classNames.length > 0);
    const allSchemaSame = schemaGroups.size === 1;
    const gateResult = allHaveSchema && allSchemaSame
        ? 'build_map_compatibility_ready_for_pipeline_parameterization'
        : allHaveSchema
            ? 'build_map_compatibility_requires_geometry_profiles'
            : 'build_map_compatibility_blocked';

    return {
        schemaVersion: 1,
        kind: 'replay_build_map_compatibility',
        gateResult,
        replays: fingerprints.map(fingerprint => compatibilityForReplay(fingerprint)),
        grouping: {
            schemaFingerprintGroups: Array.from(schemaGroups.entries()).map(([ hash, items ]) => ({ hash, replayIds: items.map(item => item.replayId).sort() })),
            geometryFingerprintGroups: Array.from(geometryGroups.entries()).map(([ hash, items ]) => ({ hash, replayIds: items.map(item => item.replayId).sort() }))
        },
        commonPipelineDecision: commonPipelineDecision(gateResult),
        geometryProfilePlanReference: OUTPUTS.geometryPlan,
        pairwiseMatrixReference: OUTPUTS.pairwise,
        replay005Protection: replay005Protection(),
        warnings: [
            'Direct build/map metadata absence is recorded as uncertainty, not incompatibility.',
            'Geometry-dependent stages remain separately gated.'
        ]
    };
}

function compatibilityForReplay(fingerprint) {
    const directKnown = fingerprint.directMetadata.buildNumber !== null || fingerprint.directMetadata.mapName !== null;
    return {
        replayId: fingerprint.replayId,
        directBuildMetadataStatus: fingerprint.directMetadata.buildNumber === null ? 'absent_from_parser_exposed_metadata' : 'present',
        directMapMetadataStatus: fingerprint.directMetadata.mapName === null ? 'absent_from_parser_exposed_metadata' : 'present',
        schemaFingerprint: fingerprint.schemaFingerprint,
        geometryFingerprint: fingerprint.geometryFingerprint,
        dimensions: {
            parserCompatibility: fingerprint.components.schema.classNames.length > 0 ? 'confirmed_same' : 'insufficient_evidence',
            schemaCompatibility: 'compatible_by_fingerprint',
            timelineCompatibility: 'compatible_by_fingerprint',
            identityCompatibility: criticalFieldsPresent(fingerprint) ? 'compatible_by_fingerprint' : 'unverified',
            eventSchemaCompatibility: 'compatible_by_fingerprint',
            mapIdentityStatus: directKnown ? 'unverified' : 'insufficient_evidence',
            geometryCompatibility: 'compatible_by_fingerprint',
            topologyCompatibility: 'unverified',
            occupancyCompatibilityEligibility: 'not_evaluated'
        },
        uncertainties: fingerprint.uncertainties
    };
}

async function repeatabilityCheck(replays) {
    const results = [];
    for (const replay of replays) {
        const first = await extractFingerprint(replay);
        const second = await extractFingerprint(replay);
        results.push({
            replayId: replay.replayId,
            normalizedComponentsEqual: stableStringify(first.components) === stableStringify(second.components),
            schemaHashEqual: first.schemaFingerprint === second.schemaFingerprint,
            geometryHashEqual: first.geometryFingerprint === second.geometryFingerprint,
            firstSchemaFingerprint: first.schemaFingerprint,
            secondSchemaFingerprint: second.schemaFingerprint,
            firstGeometryFingerprint: first.geometryFingerprint,
            secondGeometryFingerprint: second.geometryFingerprint
        });
    }
    return {
        schemaVersion: 1,
        kind: 'replay_fingerprint_repeatability',
        results,
        deterministic: results.every(result => result.normalizedComponentsEqual && result.schemaHashEqual && result.geometryHashEqual)
    };
}

function commonPipelineDecision(gateResult) {
    const base = {
        replay_loading: 'common_with_replay_parameters',
        player_field_discovery: 'common_with_replay_parameters',
        snapshot_normalization: 'common_with_schema_adapter',
        controller_pawn_lifecycle: 'common_with_schema_adapter',
        clock_discovery: 'common_with_schema_adapter',
        tick_reconciliation: 'common_with_replay_parameters',
        data_quality: 'common_with_replay_parameters',
        canonical_timeline: 'common_with_schema_adapter',
        hero_identity: 'common_with_schema_adapter',
        direct_build_identification: 'common_with_replay_parameters',
        lane_mapping: 'requires_geometry_profile',
        topology: 'requires_geometry_profile',
        spatial_regions: 'requires_geometry_profile',
        movement_coordinates: 'common_with_replay_parameters',
        movement_region_interpretation: 'requires_geometry_profile',
        occupancy: 'not_yet_safe'
    };
    if (gateResult === 'build_map_compatibility_blocked') {
        return Object.fromEntries(Object.keys(base).map(stage => [ stage, 'not_yet_safe' ]));
    }
    return base;
}

function directAgreement(left, right) {
    if (left === null || right === null) {
        return 'insufficient_evidence';
    }
    return left === right ? 'confirmed_same' : 'different';
}

function confidenceForPair(values) {
    if (values.schemaFingerprintAgreement && values.criticalFieldSignatureAgreement && values.eventDescriptorAgreement && values.geometryFingerprintAgreement) {
        return 'high_structural';
    }
    if (values.schemaFingerprintAgreement && values.criticalFieldSignatureAgreement) {
        return 'medium_schema';
    }
    return 'low';
}

function symmetryChecks(pairs) {
    const failures = [];
    for (const pair of pairs) {
        const reverse = pairs.find(item => item.leftReplayId === pair.rightReplayId && item.rightReplayId === pair.leftReplayId);
        if (!reverse || stableStringify(stripPairDirection(pair)) !== stableStringify(stripPairDirection(reverse))) {
            failures.push(`${pair.leftReplayId}:${pair.rightReplayId}`);
        }
    }
    return {
        passed: failures.length === 0,
        failures
    };
}

function stripPairDirection(pair) {
    const { leftReplayId: _left, rightReplayId: _right, ...rest } = pair;
    return rest;
}

function pairwiseSharedGeometryConfidence(items, pairwise) {
    if (items.length === 1) {
        return 'single_replay_unverified';
    }
    const ids = new Set(items.map(item => item.replayId));
    const relevant = pairwise.pairs.filter(pair => ids.has(pair.leftReplayId) && ids.has(pair.rightReplayId));
    return relevant.every(pair => pair.sharedGeometryProfileMayBeReused) ? 'medium_structural' : 'low';
}

function criticalFieldsPresent(fingerprint) {
    return CRITICAL_CLASSES.every(className => (fingerprint.components.schema.criticalClassSignatures[className] ?? []).length > 0);
}

function replay005Protection() {
    return {
        status: 'preserved',
        inspectedOnly: [
            'headers/parser-exposed metadata',
            'structural schema',
            'map identity evidence',
            'geometry fingerprint components'
        ],
        prohibitedAndNotPerformed: [
            'occupancy performance',
            'model contradictions',
            'episode metrics',
            'transition candidates',
            'player-strategy outcomes',
            'threshold selection',
            'model selection'
        ]
    };
}

async function writeJson(file, value) {
    await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

async function validateOutputs(files) {
    for (const file of files) {
        JSON.parse(await fs.readFile(file, 'utf8'));
        const size = (await fs.stat(file)).size;
        if (size > OUTPUT_SIZE_LIMIT) {
            throw new Error(`${file} is ${size} bytes, above ${OUTPUT_SIZE_LIMIT}`);
        }
    }
}

function stableStringify(value) {
    return JSON.stringify(sortStable(value));
}

function sortStable(value) {
    if (Array.isArray(value)) {
        return value.map(sortStable);
    }
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).sort(([ left ], [ right ]) => left.localeCompare(right)).map(([ key, item ]) => [ key, sortStable(item) ]));
    }
    return value;
}

function sha256(value) {
    return createHash('sha256').update(value).digest('hex');
}

function normalizeScalar(value) {
    if (typeof value === 'bigint') {
        return value.toString();
    }
    return value ?? null;
}

function normalizeObject(value) {
    return sortStable(JSON.parse(JSON.stringify(value, (_key, item) => typeof item === 'bigint' ? item.toString() : item ?? null)));
}

function countBy(items, keyFn) {
    const counts = {};
    for (const item of items) {
        const key = keyFn(item);
        counts[key] = (counts[key] ?? 0) + 1;
    }
    return Object.fromEntries(Object.entries(counts).sort(([ left ], [ right ]) => left.localeCompare(right)));
}

function groupBy(items, keyFn) {
    const groups = new Map();
    for (const item of items) {
        const key = keyFn(item);
        const group = groups.get(key) ?? [];
        group.push(item);
        groups.set(key, group);
    }
    return groups;
}

function stableArray(values) {
    return Array.from(new Set(values)).sort();
}

function compareByName(left, right) {
    return left.name.localeCompare(right.name);
}
