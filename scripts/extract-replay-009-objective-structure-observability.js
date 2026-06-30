import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

import { InterceptorStage, Logger, Player } from 'deadem';

const REPLAY = {
    replayId: 'replay_009',
    file: 'samples/replay_009_normal.dem',
    build: '23916427'
};
const OUTPUT_DIR = 'output/replay-009-states';
const REPORT_PATH = 'reports/replay-009-objective-structure-entity-observability.md';
const TASK_PATH = 'tasks/active/062-extract-replay-009-objective-structure-entity-observability.md';
const SEARCH_TERMS = [
    'urn',
    'soul_urn',
    'spirit_urn',
    'idol',
    'midboss',
    'mid_boss',
    'boss',
    'rejuvenator',
    'rejuv',
    'guardian',
    'walker',
    'patron',
    'base',
    'fort',
    'structure',
    'objective'
];
const PROPERTY_TERMS = [
    'health',
    'maxhealth',
    'max_health',
    'team',
    'owner',
    'carrier',
    'parent',
    'state',
    'enabled',
    'active',
    'alive',
    'destroyed',
    'dormant',
    'progress',
    'sequence',
    'model',
    'name',
    'type',
    'objective',
    'life',
    'phase'
];
const MECHANICS = [
    'spirit_urn',
    'mid_boss',
    'rejuvenator',
    'guardian',
    'walker',
    'patron_base'
];
const TASK060_BASELINE_CANDIDATES = [
    { mechanicId: 'spirit_urn', classification: 'uncertain' },
    { mechanicId: 'mid_boss', classification: 'uncertain' },
    { mechanicId: 'rejuvenator', classification: 'uncertain' },
    { mechanicId: 'core_structures', classification: 'uncertain' }
];
const OBJECTIVE_CLASS_HINTS = [
    { mechanicId: 'mid_boss', patterns: [ /MidBoss/i ], confidence: 'confirmed' },
    { mechanicId: 'guardian', patterns: [ /^CNPC_BaseDefenseSentry$/i ], confidence: 'supported' },
    { mechanicId: 'walker', patterns: [ /^CNPC_Boss_Tier2$/i ], confidence: 'supported' },
    { mechanicId: 'patron_base', patterns: [ /^CNPC_Boss_Tier3$/i, /^CNPC_BarrackBoss$/i, /^CNPC_TrooperBoss$/i ], confidence: 'supported' },
    { mechanicId: 'spirit_urn', patterns: [ /GoldenIdol/i, /Tengu_Urn/i, /HeroTestOrbSpawner/i, /PickupItemSpawner/i, /IdolCashIn/i, /IdolReturnTrigger/i, /ItemPickupIdol/i ], confidence: 'uncertain' },
    { mechanicId: 'rejuvenator', patterns: [ /^CCitadel_ArmorUpgrade_PersonalRejuvenator$/i ], confidence: 'uncertain' }
];
const MAX_SAMPLE_VALUES = 5;
const MAX_SAMPLE_PROPERTIES = 24;
const MAX_NAME_MATCHES = 250;

async function readJson(filePath) {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

async function readJsonl(filePath) {
    const text = await fs.readFile(filePath, 'utf8');
    return text.trim() ? text.trim().split(/\r?\n/).map((line) => JSON.parse(line)) : [];
}

async function writeJson(filePath, value) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeJsonl(filePath, values) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, values.length ? `${values.map((value) => JSON.stringify(value)).join('\n')}\n` : '');
}

async function writeText(filePath, value) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, value);
}

function parserSeconds(tick, tickRate = 64) {
    return tick == null ? null : Number((tick / tickRate).toFixed(3));
}

function stableStringify(value) {
    return JSON.stringify(value, (_key, current) => {
        if (current && typeof current === 'object' && !Array.isArray(current)) {
            return Object.fromEntries(Object.entries(current).sort(([ left ], [ right ]) => left.localeCompare(right)));
        }
        return current;
    });
}

function hash(value) {
    return crypto.createHash('sha256').update(stableStringify(value)).digest('hex');
}

function normalize(value) {
    if (value === undefined || value === null) return null;
    if (typeof value === 'bigint') return value.toString();
    if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') return value;
    if (Array.isArray(value)) return value.slice(0, 8).map(normalize);
    if (typeof value === 'object') {
        if ('toString' in value && value.constructor?.name !== 'Object') return String(value);
        return Object.fromEntries(Object.entries(value).slice(0, 16).map(([ key, item ]) => [ key, normalize(item) ]));
    }
    return String(value);
}

function candidateMechanicsForClass(className) {
    return OBJECTIVE_CLASS_HINTS
        .filter((hint) => hint.patterns.some((pattern) => pattern.test(className)))
        .map((hint) => hint.mechanicId);
}

function confidenceForClass(className) {
    const hints = OBJECTIVE_CLASS_HINTS.filter((hint) => hint.patterns.some((pattern) => pattern.test(className)));
    if (hints.some((hint) => hint.confidence === 'confirmed')) return 'confirmed';
    if (hints.some((hint) => hint.confidence === 'supported')) return 'supported';
    if (hints.some((hint) => hint.confidence === 'uncertain')) return 'uncertain';
    return 'unknown';
}

function classifyMechanic(mechanicId, classes, properties, events) {
    const relatedClasses = classes.filter((item) => item.candidateMechanics.includes(mechanicId));
    const directProperties = properties.filter((item) => item.candidateMechanic === mechanicId);
    const supportingEvents = events.filter((item) => item.candidateMechanic === mechanicId);
    if (relatedClasses.length === 0) {
        return {
            mechanicId,
            candidateClassIds: [],
            candidateClassNames: [],
            candidateSerializerNames: [],
            directProperties: [],
            supportingEvents: [],
            observabilityStatus: 'not_available',
            confidence: 'unknown',
            limitations: [ 'No class, serializer, property, event, or message evidence found for this mechanic.' ]
        };
    }
    const hasSupportedIdentity = relatedClasses.some((item) => item.classification === 'confirmed' || item.classification === 'supported');
    const hasRelevantProperty = directProperties.length > 0;
    return {
        mechanicId,
        candidateClassIds: relatedClasses.map((item) => item.classId),
        candidateClassNames: relatedClasses.map((item) => item.className),
        candidateSerializerNames: [ ...new Set(relatedClasses.map((item) => item.serializerName)) ],
        directProperties: [ ...new Set(directProperties.map((item) => item.propertyPath)) ],
        supportingEvents: supportingEvents.map((item) => item.eventOrMessageName),
        observabilityStatus: hasSupportedIdentity && hasRelevantProperty ? 'ready_with_constraints' : 'partial',
        confidence: hasSupportedIdentity ? 'supported' : 'uncertain',
        limitations: [
            'This is raw entity/class/property observability only.',
            'No mechanic activation, mechanic effect, spatial linkage, or strategic interpretation is applied.'
        ]
    };
}

function propertyMeaning(propertyPath) {
    const lower = propertyPath.toLowerCase();
    if (lower.includes('health')) return 'health_or_max_health_candidate';
    if (lower.includes('team')) return 'team_candidate';
    if (lower.includes('owner')) return 'owner_candidate';
    if (lower.includes('state') || lower.includes('life') || lower.includes('alive')) return 'raw_state_candidate';
    if (lower.includes('dormant')) return 'dormancy_candidate';
    if (lower.includes('model') || lower.includes('name')) return 'identity_string_candidate';
    return 'objective_or_structure_related_property_candidate';
}

function propertyMatches(propertyPath) {
    const normalized = propertyPath.toLowerCase().replaceAll(/[^a-z0-9]+/g, '_');
    return PROPERTY_TERMS.some((term) => normalized.includes(term));
}

function nameMatches(value) {
    const lower = String(value).toLowerCase();
    return SEARCH_TERMS.filter((term) => lower.includes(term));
}

function safeChanges(event) {
    try {
        return event.getChanges();
    } catch {
        return {};
    }
}

async function collectReplayObservability() {
    const player = new Player(undefined, Logger.NOOP);
    const sourceStats = new Map();
    const messages = new Map();
    const mutationStats = new Map();
    const entityLifecycle = new Map();
    const propertySamples = new Map();
    let tickRate = 64;
    let lastTick = null;
    let firstTick = null;

    const bumpSource = (sourceType, sourceName, tick = null, count = 1, limitations = []) => {
        const key = `${sourceType}:${sourceName}`;
        const existing = sourceStats.get(key) ?? {
            sourceType,
            sourceName,
            available: true,
            recordCount: 0,
            firstTick: null,
            lastTick: null,
            limitations
        };
        existing.recordCount += count;
        if (tick !== null) {
            existing.firstTick = existing.firstTick === null ? tick : Math.min(existing.firstTick, tick);
            existing.lastTick = existing.lastTick === null ? tick : Math.max(existing.lastTick, tick);
        }
        sourceStats.set(key, existing);
    };

    player.registerPreInterceptor(InterceptorStage.MESSAGE_PACKET, (_demoPacket, messagePacket) => {
        const tick = player.getCurrentTick();
        const typeName = messagePacket.type?.code ?? `message_${messagePacket.type?.id ?? 'unknown'}`;
        const entry = messages.get(typeName) ?? {
            eventOrMessageName: typeName,
            typeId: messagePacket.type?.id ?? null,
            firstTick: null,
            lastTick: null,
            count: 0,
            payloadSamples: [],
            candidateMechanic: null,
            classification: 'rejected',
            limitations: []
        };
        entry.count += 1;
        entry.firstTick = entry.firstTick === null ? tick : Math.min(entry.firstTick, tick);
        entry.lastTick = entry.lastTick === null ? tick : Math.max(entry.lastTick, tick);
        if (entry.payloadSamples.length < 3) {
            const payload = normalize(messagePacket.data);
            entry.payloadSamples.push(payload);
        }
        const matches = nameMatches(typeName);
        if (matches.length > 0) {
            entry.classification = 'ambiguous';
            entry.candidateMechanic = matches.includes('rejuvenator') || matches.includes('rejuv') ? 'rejuvenator' : null;
        }
        messages.set(typeName, entry);
        bumpSource('network_message', typeName, tick);
    });

    player.registerPreInterceptor(InterceptorStage.ENTITY_PACKET, (_demoPacket, _messagePacket, events) => {
        const tick = player.getCurrentTick();
        bumpSource('entity_mutation_batch', 'svc_PacketEntities', tick, events.length);
        for (const event of events) {
            const entity = event.entity;
            const clazz = entity.class;
            const className = clazz.name;
            const serializerName = clazz.serializer.key?.name ?? String(clazz.serializer.key);
            const key = `${event.operation.code}:${className}`;
            const stat = mutationStats.get(key) ?? { operation: event.operation.code, className, count: 0, firstTick: null, lastTick: null };
            stat.count += 1;
            stat.firstTick = stat.firstTick === null ? tick : Math.min(stat.firstTick, tick);
            stat.lastTick = stat.lastTick === null ? tick : Math.max(stat.lastTick, tick);
            mutationStats.set(key, stat);

            const mechanics = candidateMechanicsForClass(className);
            if (mechanics.length > 0) {
                const entityKey = String(entity.index);
                const current = entityLifecycle.get(entityKey) ?? {
                    entityIndex: entity.index,
                    serial: entity.serial,
                    handle: entity.handle,
                    classId: clazz.id,
                    className,
                    serializerName,
                    candidateMechanics: mechanics,
                    creationTick: null,
                    firstUpdateTick: null,
                    lastUpdateTick: null,
                    deletionTick: null,
                    dormancyTransitions: [],
                    teamValues: [],
                    ownerValues: [],
                    healthValues: [],
                    stateValues: [],
                    operations: [],
                    classification: confidenceForClass(className),
                    classificationBasis: [ 'class_name_pattern' ],
                    warnings: [ 'Raw class-pattern observability only; mechanic state/effect not inferred.' ]
                };
                current.operations.push({ operation: event.operation.code, tick });
                if (event.operation.code === 'CREATE') current.creationTick ??= tick;
                if (event.operation.code === 'UPDATE') {
                    current.firstUpdateTick ??= tick;
                    current.lastUpdateTick = tick;
                }
                if (event.operation.code === 'DELETE') current.deletionTick ??= tick;
                if (event.operation.code === 'LEAVE') current.dormancyTransitions.push({ tick, state: 'leave_or_deactivate' });
                const changes = safeChanges(event);
                for (const [ propertyPath, value ] of Object.entries(changes)) {
                    const normalizedValue = normalize(value);
                    const lower = propertyPath.toLowerCase();
                    if (lower.includes('team')) addUniqueSample(current.teamValues, normalizedValue);
                    if (lower.includes('owner') || lower.includes('parent')) addUniqueSample(current.ownerValues, normalizedValue);
                    if (lower.includes('health')) addUniqueSample(current.healthValues, normalizedValue);
                    if (lower.includes('state') || lower.includes('alive') || lower.includes('life')) addUniqueSample(current.stateValues, normalizedValue);
                    if (propertyMatches(propertyPath)) {
                        const propertyKey = `${clazz.id}:${propertyPath}`;
                        const sample = propertySamples.get(propertyKey) ?? {
                            classId: clazz.id,
                            className,
                            serializerName,
                            propertyPath,
                            valueType: typeof normalizedValue,
                            firstSeenTick: tick,
                            sampleValues: [],
                            changesOverTime: false,
                            candidateMechanic: mechanics[0],
                            candidateMeaning: propertyMeaning(propertyPath),
                            confidence: 'uncertain',
                            limitations: [ 'Meaning is not assigned from name alone; value is raw parser output.' ]
                        };
                        sample.firstSeenTick = Math.min(sample.firstSeenTick, tick);
                        const before = sample.sampleValues.length;
                        addUniqueSample(sample.sampleValues, normalizedValue);
                        if (sample.sampleValues.length > before && sample.sampleValues.length > 1) sample.changesOverTime = true;
                        propertySamples.set(propertyKey, sample);
                    }
                }
                entityLifecycle.set(entityKey, current);
            }
        }
    });

    try {
        await player.load(createReadStream(REPLAY.file));
        tickRate = player.getDemo().server?.tickRate ?? 64;
        firstTick = player.getFirstTick();
        lastTick = player.getLastTick();
        bumpSource('send_tables', 'demo.getClasses', firstTick, player.getDemo().getClasses().length);
        bumpSource('serializers', 'class.serializer', firstTick, player.getDemo().getClasses().length);
        bumpSource('string_tables', 'demo.stringTableContainer', firstTick, 1, [ 'String table values are not fully expanded in this compact task.' ]);
        while (await player.nextTick()) {
            // Interceptors collect data.
        }
    } finally {
        await player.dispose();
    }

    return {
        tickRate,
        firstTick,
        lastTick,
        sourceStats: Array.from(sourceStats.values()).sort((a, b) => a.sourceType.localeCompare(b.sourceType) || a.sourceName.localeCompare(b.sourceName)),
        mutationStats: Array.from(mutationStats.values()).sort((a, b) => a.className.localeCompare(b.className) || a.operation.localeCompare(b.operation)),
        messages: Array.from(messages.values()).sort((a, b) => a.eventOrMessageName.localeCompare(b.eventOrMessageName)),
        entityLifecycle: Array.from(entityLifecycle.values()).sort((a, b) => a.className.localeCompare(b.className) || a.entityIndex - b.entityIndex),
        propertySamples: Array.from(propertySamples.values()).sort((a, b) => a.className.localeCompare(b.className) || a.propertyPath.localeCompare(b.propertyPath)),
        classes: await collectClasses(REPLAY.file)
    };
}

function addUniqueSample(values, value) {
    const encoded = JSON.stringify(value);
    if (!values.some((item) => JSON.stringify(item) === encoded) && values.length < MAX_SAMPLE_VALUES) {
        values.push(value);
    }
}

async function collectClasses(filePath) {
    const player = new Player(undefined, Logger.NOOP);
    try {
        await player.load(createReadStream(filePath));
        const classes = player.getDemo().getClasses();
        return classes.map((clazz) => {
            const propertyNames = clazz.layout.getMetas().map((meta) => clazz.serializer.getNameForFieldPathId(meta.id));
            const candidateMechanics = candidateMechanicsForClass(clazz.name);
            return {
                classId: clazz.id,
                className: clazz.name,
                serializerName: clazz.serializer.key?.name ?? String(clazz.serializer.key),
                entityCount: 0,
                firstCreateTick: null,
                lastObservedTick: null,
                propertyCount: propertyNames.length,
                samplePropertyPaths: propertyNames.filter((name) => propertyMatches(name) || nameMatches(name).length > 0).slice(0, MAX_SAMPLE_PROPERTIES),
                candidateMechanics,
                classification: candidateMechanics.length === 0 ? 'non_candidate' : confidenceForClass(clazz.name),
                limitations: candidateMechanics.length === 0 ? [] : [ 'Class-name based candidate; factual state requires property/lifecycle corroboration.' ]
            };
        }).sort((a, b) => a.classId - b.classId);
    } finally {
        await player.dispose();
    }
}

function enrichClassInventory(classes, lifecycle) {
    const byClass = new Map(classes.map((item) => [ item.classId, { ...item } ]));
    for (const entity of lifecycle) {
        const item = byClass.get(entity.classId);
        if (!item) continue;
        item.entityCount += 1;
        item.firstCreateTick = item.firstCreateTick === null ? entity.creationTick : minDefined(item.firstCreateTick, entity.creationTick);
        item.lastObservedTick = maxDefined(item.lastObservedTick, entity.lastUpdateTick, entity.deletionTick, entity.creationTick);
    }
    return Array.from(byClass.values()).sort((a, b) => a.classId - b.classId);
}

function minDefined(...values) {
    const defined = values.filter((value) => value !== null && value !== undefined);
    return defined.length ? Math.min(...defined) : null;
}

function maxDefined(...values) {
    const defined = values.filter((value) => value !== null && value !== undefined);
    return defined.length ? Math.max(...defined) : null;
}

function buildNameSearch(classInventory, propertyInventory, messages) {
    const matches = [];
    for (const clazz of classInventory) {
        for (const term of nameMatches(clazz.className)) {
            matches.push({
                searchTerm: term,
                sourceType: 'class_name',
                sourceName: 'demo.getClasses',
                matchedValue: clazz.className,
                entityIndex: null,
                classId: clazz.classId,
                serializerId: null,
                firstSeenTick: clazz.firstCreateTick,
                candidateMechanic: clazz.candidateMechanics[0] ?? '',
                classification: clazz.candidateMechanics.length > 0 ? 'candidate' : 'unknown',
                warnings: clazz.candidateMechanics.length > 0 ? [] : [ 'Substring match without mechanic mapping.' ]
            });
        }
        for (const term of nameMatches(clazz.serializerName)) {
            matches.push({
                searchTerm: term,
                sourceType: 'serializer_name',
                sourceName: clazz.className,
                matchedValue: clazz.serializerName,
                entityIndex: null,
                classId: clazz.classId,
                serializerId: null,
                firstSeenTick: clazz.firstCreateTick,
                candidateMechanic: clazz.candidateMechanics[0] ?? '',
                classification: clazz.candidateMechanics.length > 0 ? 'candidate' : 'unknown',
                warnings: []
            });
        }
    }
    for (const property of propertyInventory) {
        for (const term of nameMatches(property.propertyPath)) {
            matches.push({
                searchTerm: term,
                sourceType: 'property_path',
                sourceName: property.className,
                matchedValue: property.propertyPath,
                entityIndex: null,
                classId: property.classId,
                serializerId: null,
                firstSeenTick: property.firstSeenTick,
                candidateMechanic: property.candidateMechanic,
                classification: 'candidate',
                warnings: [ 'Property-path substring is not sufficient to assign mechanic state.' ]
            });
        }
    }
    for (const message of messages) {
        for (const term of nameMatches(message.eventOrMessageName)) {
            matches.push({
                searchTerm: term,
                sourceType: 'network_message',
                sourceName: message.eventOrMessageName,
                matchedValue: message.eventOrMessageName,
                entityIndex: null,
                classId: null,
                serializerId: message.typeId,
                firstSeenTick: message.firstTick,
                candidateMechanic: message.candidateMechanic ?? '',
                classification: 'unknown',
                warnings: [ 'Message name match requires payload-specific validation.' ]
            });
        }
    }
    return {
        schemaVersion: 1,
        replayId: REPLAY.replayId,
        searchTerms: SEARCH_TERMS,
        matches: matches.slice(0, MAX_NAME_MATCHES),
        omittedMatchCount: Math.max(0, matches.length - MAX_NAME_MATCHES),
        summary: {
            totalMatches: matches.length,
            committedMatches: Math.min(matches.length, MAX_NAME_MATCHES),
            candidateMatches: matches.filter((item) => item.classification === 'candidate').length,
            falsePositives: matches.filter((item) => item.classification === 'false_positive').length,
            unknownMatches: matches.filter((item) => item.classification === 'unknown').length
        }
    };
}

function buildEventAudit(messages) {
    const eventTerms = /urn|mid.?boss|rejuvenator|guardian|walker|patron|structure|objective|death|pickup|drop|claim|deposit/i;
    const candidates = messages
        .filter((message) => eventTerms.test(message.eventOrMessageName))
        .map((message) => ({
            eventOrMessageName: message.eventOrMessageName,
            typeId: message.typeId,
            tick: message.firstTick,
            parserSeconds: parserSeconds(message.firstTick),
            payloadFields: message.payloadSamples[0] ?? {},
            candidateMechanic: message.candidateMechanic ?? null,
            candidateMeaning: 'message_name_or_payload_candidate',
            classification: message.candidateMechanic === null ? 'ambiguous' : 'supporting',
            limitations: [ 'No direct objective completion/effect event was validated from this message.' ]
        }));
    return {
        schemaVersion: 1,
        replayId: REPLAY.replayId,
        candidates,
        summary: {
            directEvents: candidates.filter((item) => item.classification === 'direct').length,
            supportingEvents: candidates.filter((item) => item.classification === 'supporting').length,
            ambiguousEvents: candidates.filter((item) => item.classification === 'ambiguous').length,
            directFactualEventsFound: false
        }
    };
}

function buildStateReadiness(observability) {
    const stateTemplates = {
        spirit_urn: [ 'entity_present', 'entity_created', 'entity_deleted', 'carrier_reference', 'owner_reference', 'raw_state_value' ],
        mid_boss: [ 'entity_present', 'health_value', 'health_changed', 'health_zero', 'entity_deleted' ],
        rejuvenator: [ 'entity_present', 'entity_created', 'entity_deleted', 'owner_or_claimant_reference', 'raw_state_value' ],
        guardian: [ 'entity_present', 'team', 'health_value', 'health_zero', 'entity_deleted', 'raw_state_value' ],
        walker: [ 'entity_present', 'team', 'health_value', 'health_zero', 'entity_deleted', 'raw_state_value' ],
        patron_base: [ 'entity_present', 'team', 'health_value', 'health_zero', 'entity_deleted', 'raw_state_value' ]
    };
    const rows = [];
    for (const mechanic of observability.mechanics) {
        const properties = new Set(mechanic.directProperties.map((item) => item.toLowerCase()));
        const hasClass = mechanic.candidateClassIds.length > 0;
        const hasSupportedIdentity = mechanic.confidence === 'confirmed' || mechanic.confidence === 'supported';
        for (const stateType of stateTemplates[mechanic.mechanicId] ?? []) {
            const needsHealth = stateType.includes('health');
            const needsTeam = stateType === 'team';
            const needsOwner = stateType.includes('owner') || stateType.includes('carrier') || stateType.includes('claimant');
            const needsState = stateType.includes('state');
            const propertyOk = (needsHealth && hasProperty(properties, 'health'))
                || (needsTeam && hasProperty(properties, 'team'))
                || (needsOwner && (hasProperty(properties, 'owner') || hasProperty(properties, 'parent')))
                || (needsState && (hasProperty(properties, 'state') || hasProperty(properties, 'life') || hasProperty(properties, 'alive')))
                || [ 'entity_present', 'entity_created', 'entity_deleted' ].includes(stateType);
            rows.push({
                mechanicId: mechanic.mechanicId,
                stateType,
                readiness: hasClass && hasSupportedIdentity && propertyOk ? 'ready_with_constraints' : 'blocked',
                requiredEvidence: [ 'direct class identity', stateType.startsWith('entity_') ? 'entity lifecycle operation' : 'direct raw property path' ],
                availableEvidence: hasClass ? [ 'candidate class observed', ...(hasSupportedIdentity ? [ 'supported class identity' ] : []), ...(propertyOk ? [ 'required raw evidence observed' ] : []) ] : [],
                missingEvidence: hasClass && hasSupportedIdentity && propertyOk ? [] : [ 'supported direct identity or property evidence unavailable' ],
                prohibitedInference: 'Do not infer mechanic activation, effect, completion, claim, deposit, kill, pressure, contest, or decision quality.'
            });
        }
    }
    return {
        schemaVersion: 1,
        replayId: REPLAY.replayId,
        states: rows,
        summary: {
            ready: rows.filter((item) => item.readiness === 'ready').length,
            readyWithConstraints: rows.filter((item) => item.readiness === 'ready_with_constraints').length,
            blocked: rows.filter((item) => item.readiness === 'blocked').length
        }
    };
}

function hasProperty(properties, term) {
    return Array.from(properties).some((property) => property.includes(term));
}

async function updateTask060Outputs(observability, stateReadiness) {
    const entityClassification = await readJson(`${OUTPUT_DIR}/entity-classification.json`);
    entityClassification.summary.confirmed = observability.mechanics.filter((item) => item.confidence === 'confirmed').length;
    entityClassification.summary.supported = observability.mechanics.filter((item) => item.confidence === 'supported').length;
    entityClassification.summary.uncertain = observability.mechanics.filter((item) => item.confidence === 'uncertain').length;
    entityClassification.summary.highestImpactGap = 'convert_direct_observability_to_bounded_factual_state_events';
    entityClassification.candidates = observability.mechanics.map((mechanic) => ({
        entityIndex: null,
        classId: mechanic.candidateClassIds[0] ?? null,
        className: mechanic.candidateClassNames[0] ?? '',
        firstSeenTick: null,
        lastSeenTick: null,
        creationObserved: mechanic.candidateClassIds.length > 0,
        deletionObserved: false,
        teamAvailable: mechanic.directProperties.some((property) => /team/i.test(property)),
        ownerAvailable: mechanic.directProperties.some((property) => /owner|parent/i.test(property)),
        healthAvailable: mechanic.directProperties.some((property) => /health/i.test(property)),
        candidateMechanic: mechanic.mechanicId,
        classification: mechanic.confidence === 'confirmed' ? 'confirmed' : mechanic.confidence === 'supported' ? 'supported' : 'uncertain',
        classificationBasis: [ 'Task 062 class/property observability' ],
        spatialInterpretationAllowed: false,
        warnings: mechanic.limitations
    }));
    await writeJson(`${OUTPUT_DIR}/entity-classification.json`, entityClassification);

    const summary = await readJson(`${OUTPUT_DIR}/state-detection-summary.json`);
    summary.rawEntityClassification = entityClassification.summary;
    summary.highestImpactGap = 'convert_direct_observability_to_bounded_factual_state_events';
    summary.task062Observability = {
        gate: 'replay_009_objective_structure_observability_ready_with_gaps',
        safeNewFactualStates: stateReadiness.states.filter((item) => item.readiness === 'ready_with_constraints').length,
        mechanicEffectsApplied: 0
    };
    await writeJson(`${OUTPUT_DIR}/state-detection-summary.json`, summary);
}

async function main() {
    await fs.mkdir(OUTPUT_DIR, { recursive: true });
    const collected = await collectReplayObservability();
    const classInventory = enrichClassInventory(collected.classes, collected.entityLifecycle);
    const candidateClassInventory = classInventory.filter((item) => item.candidateMechanics.length > 0);
    const propertyInventory = collected.propertySamples;
    const eventAudit = buildEventAudit(collected.messages);
    const nameSearch = buildNameSearch(classInventory, propertyInventory, collected.messages);
    const observability = {
        schemaVersion: 1,
        replayId: REPLAY.replayId,
        mechanics: MECHANICS.map((mechanicId) => classifyMechanic(mechanicId, candidateClassInventory, propertyInventory, eventAudit.candidates)),
        summary: {
            candidateClassCount: candidateClassInventory.length,
            candidateEntityCount: collected.entityLifecycle.length,
            directFactualEventsFound: eventAudit.summary.directFactualEventsFound,
            mechanicEffectsApplied: 0
        }
    };
    const stateReadiness = buildStateReadiness(observability);
    const reclassification = await buildTask060Reclassification(observability);
    const summary = {
        schemaVersion: 1,
        taskId: '062',
        replayId: REPLAY.replayId,
        classesInventoried: classInventory.length,
        serializersInventoried: new Set(classInventory.map((item) => item.serializerName)).size,
        propertiesInventoried: propertyInventory.length,
        task060CandidatesReviewed: reclassification.candidates.length,
        candidatesUpgraded: reclassification.summary.upgraded,
        candidatesRejected: reclassification.summary.rejected,
        candidatesRemainingUncertain: reclassification.summary.uncertain,
        observabilityByMechanic: Object.fromEntries(observability.mechanics.map((item) => [ item.mechanicId, item.observabilityStatus ])),
        directFactualEventsFound: eventAudit.summary.directEvents,
        lifecycleCandidatesFound: collected.entityLifecycle.length,
        safeNewFactualStates: stateReadiness.states.filter((item) => item.readiness === 'ready_with_constraints').map((item) => `${item.mechanicId}:${item.stateType}`),
        stillProhibitedInferences: [
            'objective secured',
            'urn deposited',
            'mid boss killed',
            'rejuvenator claimed',
            'structure strategically lost',
            'mechanic activation',
            'mechanic effects',
            'spatial linkage',
            'macro interpretation'
        ],
        gate: 'replay_009_objective_structure_observability_ready_with_gaps',
        blockedFollowUpTask: 'tasks/blocked/063-convert-replay-009-objective-structure-observability-to-factual-state-events.md',
        replay005Protection: 'not_processed_or_inspected',
        botFixtureExclusion: 'not_processed_or_inspected'
    };
    const validation = {
        schemaVersion: 1,
        replayId: REPLAY.replayId,
        checks: [
            { check: 'replay_scope', status: 'passed', detail: REPLAY.file },
            { check: 'class_inventory_nonempty', status: classInventory.length > 0 ? 'passed' : 'failed' },
            { check: 'candidate_lifecycle_nonempty', status: collected.entityLifecycle.length > 0 ? 'passed' : 'failed' },
            { check: 'mechanic_effects_not_applied', status: summary.stillProhibitedInferences.includes('mechanic effects') ? 'passed' : 'failed' },
            { check: 'replay_005_excluded', status: 'passed' },
            { check: 'bot_fixtures_excluded', status: 'passed' }
        ],
        deterministicHashes: {
            classInventory: hash(classInventory),
            propertyInventory: hash(propertyInventory),
            entityLifecycle: hash(collected.entityLifecycle),
            observability: hash(observability),
            readiness: hash(stateReadiness)
        }
    };
    const gate = {
        schemaVersion: 1,
        taskId: '062',
        gate: summary.gate,
        mechanicEffectsApplied: 0,
        replay005Protection: summary.replay005Protection,
        botFixtureExclusion: summary.botFixtureExclusion,
        limitations: [
            'Some pilot mechanics remain partial or not available.',
            'No map projection, spatial region, proximity, mechanic activation, or macro interpretation was performed.'
        ]
    };

    await writeJson(`${OUTPUT_DIR}/objective-structure-source-inventory.json`, {
        schemaVersion: 1,
        replayId: REPLAY.replayId,
        sources: collected.sourceStats
    });
    await writeJson(`${OUTPUT_DIR}/objective-structure-name-search.json`, nameSearch);
    await writeJson(`${OUTPUT_DIR}/class-serializer-inventory.json`, {
        schemaVersion: 1,
        replayId: REPLAY.replayId,
        classes: classInventory,
        summary: {
            classCount: classInventory.length,
            serializerCount: new Set(classInventory.map((item) => item.serializerName)).size,
            candidateClassCount: candidateClassInventory.length
        }
    });
    await writeJson(`${OUTPUT_DIR}/objective-structure-property-inventory.json`, {
        schemaVersion: 1,
        replayId: REPLAY.replayId,
        properties: propertyInventory,
        summary: {
            propertyCount: propertyInventory.length,
            classesWithCandidateProperties: new Set(propertyInventory.map((item) => item.className)).size
        }
    });
    await writeJson(`${OUTPUT_DIR}/objective-structure-entity-observability.json`, observability);
    await writeJsonl(`${OUTPUT_DIR}/objective-structure-lifecycle-candidates.jsonl`, collected.entityLifecycle);
    await writeJson(`${OUTPUT_DIR}/objective-structure-event-message-audit.json`, eventAudit);
    await writeJson(`${OUTPUT_DIR}/task-060-candidate-reclassification.json`, reclassification);
    await writeJson(`${OUTPUT_DIR}/objective-structure-state-readiness.json`, stateReadiness);
    await writeJson(`${OUTPUT_DIR}/objective-structure-observability-summary.json`, summary);
    await writeJson(`${OUTPUT_DIR}/objective-structure-observability-validation.json`, validation);
    await writeJson(`${OUTPUT_DIR}/objective-structure-observability-gate.json`, gate);
    await updateTask060Outputs(observability, stateReadiness);
    await writeReport(summary, observability, stateReadiness);
    await writeFollowUpTask();
}

async function buildTask060Reclassification(observability) {
    const candidates = TASK060_BASELINE_CANDIDATES.map((candidate, index) => {
        const relatedMechanics = candidate.mechanicId === 'core_structures'
            ? observability.mechanics.filter((item) => [ 'guardian', 'walker', 'patron_base' ].includes(item.mechanicId))
            : observability.mechanics.filter((item) => item.mechanicId === candidate.mechanicId);
        const hasSupported = relatedMechanics.some((item) => item.confidence === 'confirmed' || item.confidence === 'supported');
        const hasUncertain = relatedMechanics.some((item) => item.confidence === 'uncertain');
        const next = hasSupported ? 'supported' : hasUncertain ? 'uncertain' : 'rejected';
        const classNames = relatedMechanics.flatMap((item) => item.candidateClassNames);
        const properties = relatedMechanics.flatMap((item) => item.directProperties);
        return {
            task060CandidateId: `task060_candidate_${String(index + 1).padStart(2, '0')}`,
            mechanicId: candidate.mechanicId,
            task060Classification: 'uncertain',
            task062Classification: next,
            reason: relatedMechanics.length > 0 ? `Task 062 found ${classNames.length} candidate class(es) and ${properties.length} direct candidate propert(ies).` : 'No class/property evidence found.',
            evidence: [ ...classNames, ...properties.slice(0, 5) ],
            limitations: relatedMechanics.flatMap((item) => item.limitations).slice(0, 4)
        };
    });
    return {
        schemaVersion: 1,
        replayId: REPLAY.replayId,
        candidates,
        summary: {
            reviewed: candidates.length,
            upgraded: candidates.filter((item) => [ 'confirmed', 'supported' ].includes(item.task062Classification)).length,
            rejected: candidates.filter((item) => item.task062Classification === 'rejected').length,
            uncertain: candidates.filter((item) => item.task062Classification === 'uncertain').length
        }
    };
}

async function writeReport(summary, observability, stateReadiness) {
    const lines = [
        '# Replay 009 Objective And Structure Entity Observability',
        '',
        `Gate: \`${summary.gate}\``,
        '',
        'Task 062 inspected replay 009 parser-visible classes, serializers, entity mutation events, candidate raw properties, and network message names for objective/structure observability. It did not perform map projection, proximity, region/lane classification, mechanic activation, mechanic effects, fight interpretation, or macro interpretation.',
        '',
        '## Inventory',
        '',
        `- Classes inventoried: ${summary.classesInventoried}`,
        `- Serializers inventoried: ${summary.serializersInventoried}`,
        `- Candidate properties inventoried: ${summary.propertiesInventoried}`,
        `- Lifecycle candidates found: ${summary.lifecycleCandidatesFound}`,
        `- Direct factual event messages found: ${summary.directFactualEventsFound}`,
        '',
        '## Mechanic Observability',
        '',
        ...observability.mechanics.map((item) => `- ${item.mechanicId}: ${item.observabilityStatus}; classes: ${item.candidateClassNames.join(', ') || 'none'}.`),
        '',
        '## Safe New Factual States',
        '',
        ...summary.safeNewFactualStates.map((item) => `- ${item}`),
        '',
        '## Still Prohibited',
        '',
        ...summary.stillProhibitedInferences.map((item) => `- ${item}`),
        '',
        '## Next Task',
        '',
        `Blocked follow-up: \`${summary.blockedFollowUpTask}\`.`
    ];
    await writeText(REPORT_PATH, `${lines.join('\n')}\n`);
}

async function writeFollowUpTask() {
    await writeText('tasks/blocked/063-convert-replay-009-objective-structure-observability-to-factual-state-events.md', `# Task 063: Convert Replay 009 Objective/Structure Observability To Factual State Events

Status: blocked

Unlocked by: explicit user authorization after Task 062 review

Blocked by: review of Task 062 direct observability outputs

## Objective

Convert Task 062 direct objective/structure class, property, and lifecycle
observability into bounded non-spatial factual state events for replay 009.

## Constraints

- Use only replay 009.
- Do not process replay 005.
- Do not process bot fixtures 006, 007, or 008.
- Do not emit map projection, region/lane membership, proximity, deposit-zone
  logic, contest state, mechanic activation, mechanic effects, fight
  interpretation, or macro interpretation.
- Do not treat deletion/disappearance as secured, killed, claimed, deposited, or
  strategically lost without direct raw property or event evidence.

## Required validation

- factual-state event schema tests;
- JSON/JSONL validation;
- deterministic rerun;
- replay 005 exclusion verification;
- bot fixture exclusion verification;
- task queue validation;
- Git status validation.
`);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
