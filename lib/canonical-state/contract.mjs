export const EP_TYPES = [
    'direct_parser_observation',
    'deterministic_derivation',
    'human_annotation',
    'independent_visual_validation',
    'heuristic',
    'unresolved'
];

const string = { type: 'string' };
const number = { type: 'number' };
const boolean = { type: 'boolean' };
const nil = { type: 'null' };
const anyValue = { type: 'any' };
const stringOrNull = { anyOf: [string, nil] };
const numberOrNull = { anyOf: [number, nil] };
const booleanOrNull = { anyOf: [boolean, nil] };
const objectOrNull = { anyOf: [{ type: 'object' }, nil] };

const provenanceSchema = {
    type: 'object',
    required: ['sourceTask', 'sourceId', 'sourcePath', 'sourceField', 'epistemicType', 'validationStatus'],
    properties: {
        sourceTask: stringOrNull,
        sourceId: string,
        sourcePath: string,
        sourceEventId: stringOrNull,
        sourceField: string,
        epistemicType: { enum: EP_TYPES },
        method: stringOrNull,
        formula: stringOrNull,
        code: string,
        parameters: { type: 'object' },
        limitations: { type: 'array', items: string },
        validationStatus: string,
        legacySourceIdentifier: objectOrNull
    },
    additionalProperties: false
};

const eventBase = {
    type: 'object',
    required: ['schemaVersion', 'eventId', 'replayId', 'eventCategory', 'eventType', 'subject', 'time', 'value', 'provenance', 'epistemicStatus'],
    properties: {
        schemaVersion: string,
        eventId: string,
        replayId: string,
        eventCategory: string,
        eventType: string,
        subject: {
            type: 'object',
            required: ['subjectType', 'subjectId', 'playerKey', 'rawTeam', 'entityKey', 'rawHandle', 'entityIndex', 'entitySerial', 'entityGeneration', 'className', 'mechanicCandidate'],
            properties: {
                subjectType: stringOrNull,
                subjectId: stringOrNull,
                playerKey: stringOrNull,
                rawTeam: numberOrNull,
                entityKey: stringOrNull,
                rawHandle: stringOrNull,
                entityIndex: numberOrNull,
                entitySerial: stringOrNull,
                entityGeneration: stringOrNull,
                className: stringOrNull,
                mechanicCandidate: stringOrNull
            },
            additionalProperties: false
        },
        time: {
            type: 'object',
            required: ['demoTick', 'parserSeconds', 'timeBasis', 'pauseAdjusted'],
            properties: {
                demoTick: numberOrNull,
                parserSeconds: numberOrNull,
                timeBasis: { enum: ['parser_seconds'] },
                pauseAdjusted: { enum: [false] }
            },
            additionalProperties: false
        },
        value: anyValue,
        provenance: provenanceSchema,
        epistemicStatus: {
            type: 'object',
            required: ['observationStatus', 'confidence', 'independentValidation', 'mechanicVersionStatus', 'mechanicEffectApplied', 'semanticLimit', 'warnings'],
            properties: {
                observationStatus: string,
                confidence: string,
                independentValidation: string,
                mechanicVersionStatus: string,
                mechanicEffectApplied: { enum: [false] },
                semanticLimit: string,
                warnings: { type: 'array', items: anyValue }
            },
            additionalProperties: false
        }
    },
    additionalProperties: false
};

const eventVariants = {
    'player_identity:player_identity_observed': {
        requiredProvenance: { epistemicType: 'direct_parser_observation', method: true }
    },
    'player_death:player_death_observed': {
        requiredProvenance: { epistemicType: 'deterministic_derivation', method: true }
    },
    'player_respawn:player_respawn_observed': {
        requiredProvenance: { epistemicType: 'direct_parser_observation', method: true }
    },
    'player_respawn:player_return_inferred': {
        requiredProvenance: { epistemicType: 'deterministic_derivation', method: true, formula: true }
    },
    'team_net_worth:team_net_worth_derived': {
        requiredProvenance: { epistemicType: 'deterministic_derivation', method: true, formula: true }
    },
    'raw_objective_structure_lifecycle:entity_present': {
        requiredProvenance: { epistemicType: 'deterministic_derivation', method: true }
    },
    'raw_objective_structure_lifecycle:entity_deleted_or_absent_observed': {
        requiredProvenance: { epistemicType: 'deterministic_derivation', method: true }
    },
    'raw_objective_structure_lifecycle:raw_health_changed': {
        requiredProvenance: { epistemicType: 'deterministic_derivation', method: true }
    },
    'raw_objective_structure_lifecycle:raw_health_zero_or_terminal_observed': {
        requiredProvenance: { epistemicType: 'deterministic_derivation', method: true }
    },
    'raw_objective_structure_lifecycle:raw_state_changed': {
        requiredProvenance: { epistemicType: 'deterministic_derivation', method: true }
    }
};

export const CANONICAL_CONTRACT = {
    schemaVersion: '3.0.0',
    contractId: 'canonical_factual_state_v3',
    requiredPackageFiles: [
        'player-registry.json',
        'entity-registry.json',
        'factual-events.jsonl',
        'non-timeline-metadata.json',
        'independent-validation-overlay.json',
        'snapshots.jsonl',
        'capability-matrix.json',
        'validation-summary.json',
        'canonical-state-gate.json',
        'README.md'
    ],
    forbiddenCanonicalFields: [
        'lane',
        'laneAxis',
        'laneProgress',
        'nearestLane',
        'region',
        'mapRegion',
        'structuralRegion',
        'proximity',
        'transform',
        'residual'
    ],
    forbiddenPromotedStringPatterns: [
        'lane_axis_',
        'nearest_lane',
        'structural_region'
    ],
    epistemicTypes: EP_TYPES,
    identityRules: {
        entityKey: 'neutral canonical key derived from replay id, class name, and raw handle; legacy spatial identifiers are provenance only',
        rawHandle: 'preserved verbatim when available',
        entityIndex: 'null unless source explicitly provides a decoded index',
        entitySerial: 'null unless source explicitly provides serial',
        entityGeneration: 'null unless lifecycle evidence supports a generation',
        generationStatus: ['supported', 'unavailable', 'not_applicable']
    },
    artifacts: {
        playerRegistry: {
            type: 'object',
            required: ['schemaVersion', 'replayId', 'sourceReplay', 'summary', 'players'],
            properties: {
                schemaVersion: string,
                replayId: string,
                sourceReplay: string,
                summary: { type: 'object' },
                players: { type: 'array', items: { type: 'object' }, provenanceRequired: true }
            },
            additionalProperties: false
        },
        entityRegistry: {
            type: 'object',
            required: ['schemaVersion', 'replayId', 'identityRules', 'entities'],
            properties: {
                schemaVersion: string,
                replayId: string,
                identityRules: { type: 'object' },
                entities: { type: 'array', items: { type: 'object' }, provenanceRequired: true }
            },
            additionalProperties: false
        },
        factualEvent: eventBase,
        factualEventVariants: eventVariants,
        nonTimelineMetadata: {
            type: 'object',
            required: ['schemaVersion', 'replayId', 'records'],
            properties: {
                schemaVersion: string,
                replayId: string,
                records: { type: 'array', items: { type: 'object' }, provenanceRequired: true }
            },
            additionalProperties: false
        },
        independentValidationOverlay: {
            type: 'object',
            required: ['schemaVersion', 'replayId', 'status', 'overlays', 'provenance', 'reason'],
            properties: {
                schemaVersion: string,
                replayId: string,
                status: string,
                overlays: { type: 'array', items: { type: 'object' } },
                provenance: { type: 'array', items: provenanceSchema },
                reason: string
            },
            additionalProperties: false
        },
        snapshot: {
            type: 'object',
            required: ['schemaVersion', 'replayId', 'snapshotId', 'time', 'players', 'teamNetWorth', 'provenance', 'limitations'],
            properties: {
                schemaVersion: string,
                replayId: string,
                snapshotId: string,
                time: { type: 'object' },
                players: { type: 'array', items: { type: 'object' } },
                teamNetWorth: { type: 'object' },
                provenance: provenanceSchema,
                limitations: { type: 'array', items: string }
            },
            additionalProperties: false
        },
        capabilityMatrix: {
            type: 'object',
            required: ['schemaVersion', 'replayId', 'capabilities'],
            properties: {
                schemaVersion: string,
                replayId: string,
                capabilities: { type: 'array', items: { type: 'object' } }
            },
            additionalProperties: false
        },
        validationSummary: {
            type: 'object',
            required: ['schemaVersion', 'taskId', 'replayId', 'gate', 'playerCount', 'rawTeamDistribution', 'entityCount', 'canonicalEventCount', 'snapshotCount', 'validationOverlayCount', 'epistemicTypeCounts', 'schemaValid', 'spatialLeakageFindings', 'mechanicEffectsApplied', 'rawReplayAccessClassification'],
            properties: {
                schemaVersion: string,
                taskId: string,
                replayId: string,
                gate: string,
                playerCount: number,
                rawTeamDistribution: { type: 'object' },
                entityCount: number,
                canonicalEventCount: number,
                snapshotCount: number,
                validationOverlayCount: number,
                epistemicTypeCounts: { type: 'object' },
                schemaValid: boolean,
                spatialLeakageFindings: number,
                mechanicEffectsApplied: { enum: [0] },
                rawReplayAccessClassification: string
            },
            additionalProperties: false
        },
        canonicalStateGate: {
            type: 'object',
            required: ['schemaVersion', 'taskId', 'replayId', 'gate', 'readyWithConstraints'],
            properties: {
                schemaVersion: string,
                taskId: string,
                replayId: string,
                gate: string,
                readyWithConstraints: boolean
            },
            additionalProperties: false
        }
    }
};

function typeName(value) {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    return typeof value;
}

function checkSchema(value, schema, path = '$') {
    const errors = [];
    const warnings = [];
    if (schema.type === 'any') return { errors, warnings };
    if (schema.enum) {
        if (!schema.enum.includes(value)) errors.push({ path, issue: 'enum_invalid', expected: schema.enum, actual: value });
        return { errors, warnings };
    }
    if (schema.anyOf) {
        const results = schema.anyOf.map(option => checkSchema(value, option, path));
        if (results.some(result => result.errors.length === 0)) return { errors, warnings };
        errors.push({ path, issue: 'type_invalid', expected: schema.anyOf.map(option => option.type), actual: typeName(value) });
        return { errors, warnings };
    }
    if (schema.type && typeName(value) !== schema.type) {
        errors.push({ path, issue: 'type_invalid', expected: schema.type, actual: typeName(value) });
        return { errors, warnings };
    }
    if (schema.type === 'object') {
        const required = schema.required ?? [];
        for (const key of required) {
            if (!Object.hasOwn(value, key)) errors.push({ path: `${path}.${key}`, issue: 'missing_required_field' });
        }
        const properties = schema.properties ?? {};
        for (const [key, child] of Object.entries(value)) {
            if (!Object.hasOwn(properties, key)) {
                if (schema.additionalProperties === false) errors.push({ path: `${path}.${key}`, issue: 'additional_field' });
                continue;
            }
            const childResult = checkSchema(child, properties[key], `${path}.${key}`);
            errors.push(...childResult.errors);
            warnings.push(...childResult.warnings);
        }
    }
    if (schema.type === 'array') {
        for (let index = 0; index < value.length; index += 1) {
            const childResult = checkSchema(value[index], schema.items ?? { type: 'any' }, `${path}[${index}]`);
            errors.push(...childResult.errors);
            warnings.push(...childResult.warnings);
        }
    }
    return { errors, warnings };
}

function validateProvenance(provenance, variantRule, path) {
    const errors = [];
    if (!provenance || typeof provenance !== 'object') {
        errors.push({ path, issue: 'provenance_required' });
        return errors;
    }
    const required = variantRule?.requiredProvenance ?? {};
    if (required.epistemicType && provenance.epistemicType !== required.epistemicType) {
        errors.push({ path: `${path}.epistemicType`, issue: 'epistemic_type_invalid', expected: required.epistemicType, actual: provenance.epistemicType });
    }
    if (required.method && !provenance.method) errors.push({ path: `${path}.method`, issue: 'method_required' });
    if (required.formula && !provenance.formula) errors.push({ path: `${path}.formula`, issue: 'formula_required' });
    if (!provenance.validationStatus) errors.push({ path: `${path}.validationStatus`, issue: 'validation_status_required' });
    if (!provenance.sourceTask) errors.push({ path: `${path}.sourceTask`, issue: 'source_task_required' });
    if (!provenance.sourcePath) errors.push({ path: `${path}.sourcePath`, issue: 'source_path_required' });
    if (!provenance.sourceField) errors.push({ path: `${path}.sourceField`, issue: 'source_field_required' });
    return errors;
}

function findForbiddenFields(value, forbiddenFields, path = '$', errors = []) {
    if (Array.isArray(value)) {
        value.forEach((item, index) => findForbiddenFields(item, forbiddenFields, `${path}[${index}]`, errors));
        return errors;
    }
    if (!value || typeof value !== 'object') return errors;
    for (const [key, child] of Object.entries(value)) {
        const childPath = `${path}.${key}`;
        if (forbiddenFields.includes(key)) errors.push({ path: childPath, issue: 'forbidden_field' });
        findForbiddenFields(child, forbiddenFields, childPath, errors);
    }
    return errors;
}

export function validateCanonicalPackage(packageData, contract = CANONICAL_CONTRACT) {
    const byArtifact = {};
    const eventVariants = new Map();
    let totalRecordsFound = 0;
    let totalRecordsValidated = 0;

    function addArtifact(name, found, validated, errors, warnings = [], variants = []) {
        byArtifact[name] = { recordsFound: found, recordsValidated: validated, errors, warnings, variants };
        totalRecordsFound += found;
        totalRecordsValidated += validated;
    }

    const playerErrors = [];
    playerErrors.push(...checkSchema(packageData.playerRegistry, contract.artifacts.playerRegistry, '$.playerRegistry').errors);
    for (const [index, player] of packageData.playerRegistry.players.entries()) {
        if (!Array.isArray(player.provenance) || player.provenance.length === 0) playerErrors.push({ path: `players[${index}].provenance`, issue: 'provenance_required' });
    }
    addArtifact('playerRegistry', packageData.playerRegistry.players.length, packageData.playerRegistry.players.length, playerErrors);

    const entityErrors = [];
    entityErrors.push(...checkSchema(packageData.entityRegistry, contract.artifacts.entityRegistry, '$.entityRegistry').errors);
    for (const [index, entity] of packageData.entityRegistry.entities.entries()) {
        if (!Array.isArray(entity.provenance) || entity.provenance.length === 0) entityErrors.push({ path: `entities[${index}].provenance`, issue: 'provenance_required' });
        if (entity.entityIndex !== null && entity.entityIndexSource !== 'decoded_entity_index') entityErrors.push({ path: `entities[${index}].entityIndex`, issue: 'index_without_decoding_evidence' });
        if (entity.entityGeneration !== null && entity.generationStatus === 'unavailable') entityErrors.push({ path: `entities[${index}].entityGeneration`, issue: 'fabricated_generation' });
    }
    addArtifact('entityRegistry', packageData.entityRegistry.entities.length, packageData.entityRegistry.entities.length, entityErrors);

    const eventErrors = [];
    const unknownEventVariants = [];
    for (const [index, event] of packageData.factualEvents.entries()) {
        eventErrors.push(...checkSchema(event, contract.artifacts.factualEvent, `factualEvents[${index}]`).errors);
        eventErrors.push(...findForbiddenFields(event, contract.forbiddenCanonicalFields, `factualEvents[${index}]`));
        const variant = `${event.eventCategory}:${event.eventType}`;
        eventVariants.set(variant, (eventVariants.get(variant) ?? 0) + 1);
        const variantRule = contract.artifacts.factualEventVariants[variant];
        if (!variantRule) unknownEventVariants.push(variant);
        else eventErrors.push(...validateProvenance(event.provenance, variantRule, `factualEvents[${index}].provenance`));
    }
    addArtifact('factualEvents', packageData.factualEvents.length, packageData.factualEvents.length, eventErrors, [], [...eventVariants.entries()].map(([variant, count]) => ({ variant, count })));

    const metadataErrors = [];
    metadataErrors.push(...checkSchema(packageData.nonTimelineMetadata, contract.artifacts.nonTimelineMetadata, '$.nonTimelineMetadata').errors);
    for (const [index, record] of packageData.nonTimelineMetadata.records.entries()) {
        if (!record.provenance) metadataErrors.push({ path: `metadata[${index}].provenance`, issue: 'provenance_required' });
        else metadataErrors.push(...validateProvenance(record.provenance, null, `metadata[${index}].provenance`));
    }
    addArtifact('nonTimelineMetadata', packageData.nonTimelineMetadata.records.length, packageData.nonTimelineMetadata.records.length, metadataErrors);

    const overlayErrors = checkSchema(packageData.independentValidationOverlay, contract.artifacts.independentValidationOverlay, '$.overlay').errors;
    addArtifact('independentValidationOverlay', packageData.independentValidationOverlay.overlays.length, packageData.independentValidationOverlay.overlays.length, overlayErrors);

    const snapshotErrors = [];
    for (const [index, snapshot] of packageData.snapshots.entries()) {
        snapshotErrors.push(...checkSchema(snapshot, contract.artifacts.snapshot, `snapshots[${index}]`).errors);
        snapshotErrors.push(...validateProvenance(snapshot.provenance, { requiredProvenance: { epistemicType: 'deterministic_derivation', method: true } }, `snapshots[${index}].provenance`));
    }
    addArtifact('snapshots', packageData.snapshots.length, packageData.snapshots.length, snapshotErrors);

    const capabilityErrors = checkSchema(packageData.capabilityMatrix, contract.artifacts.capabilityMatrix, '$.capabilities').errors;
    addArtifact('capabilityMatrix', packageData.capabilityMatrix.capabilities.length, packageData.capabilityMatrix.capabilities.length, capabilityErrors);

    const validationErrors = checkSchema(packageData.validationSummary, contract.artifacts.validationSummary, '$.validationSummary').errors;
    addArtifact('validationSummary', 1, 1, validationErrors);

    const gateErrors = checkSchema(packageData.canonicalGate, contract.artifacts.canonicalStateGate, '$.canonicalGate').errors;
    addArtifact('canonicalStateGate', 1, 1, gateErrors);

    const allErrors = Object.values(byArtifact).flatMap(artifact => artifact.errors);
    return {
        schemaVersion: contract.schemaVersion,
        valid: allErrors.length === 0 && unknownEventVariants.length === 0,
        totalRecordsFound,
        totalRecordsValidated,
        byArtifact,
        errors: allErrors,
        warnings: [],
        eventVariants: [...eventVariants.entries()].map(([variant, count]) => ({ variant, count })).sort((a, b) => a.variant.localeCompare(b.variant)),
        unknownEventVariants: [...new Set(unknownEventVariants)].sort()
    };
}

export function canonicalContractForJson() {
    return CANONICAL_CONTRACT;
}
