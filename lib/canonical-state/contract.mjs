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
const opaqueRawEvidence = reason => ({ type: 'any', opaque: true, reason });
const stringOrNull = { anyOf: [string, nil] };
const numberOrNull = { anyOf: [number, nil] };
const booleanOrNull = { anyOf: [boolean, nil] };
const arrayOf = items => ({ type: 'array', items });
const objectOf = (properties, required = Object.keys(properties), extra = false) => ({ type: 'object', required, properties, additionalProperties: extra });

const stringArray = arrayOf(string);
const numberArray = arrayOf(number);
const nullableStringArray = arrayOf(stringOrNull);

const legacySourceIdentifierSchema = objectOf({
    value: string,
    legacySourceIdentifier: boolean
});

const parametersSchema = objectOf({
    keyBasis: stringArray,
    removedFields: stringArray,
    rawTeams: numberArray,
    sourceEventType: stringOrNull
}, ['keyBasis', 'removedFields', 'rawTeams', 'sourceEventType'], false);

export const provenanceSchema = objectOf({
    sourceTask: stringOrNull,
    sourceId: string,
    sourcePath: string,
    sourceEventId: stringOrNull,
    sourceField: string,
    epistemicType: { enum: EP_TYPES },
    method: stringOrNull,
    formula: stringOrNull,
    code: string,
    parameters: parametersSchema,
    limitations: stringArray,
    validationStatus: string,
    legacySourceIdentifier: { anyOf: [legacySourceIdentifierSchema, nil] }
});

const epistemicStatusSchema = objectOf({
    observationStatus: string,
    confidence: string,
    independentValidation: string,
    mechanicVersionStatus: string,
    mechanicEffectApplied: { enum: [false] },
    semanticLimit: string,
    warnings: stringArray
});

const subjectSchema = objectOf({
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
});

const timeSchema = objectOf({
    demoTick: numberOrNull,
    parserSeconds: numberOrNull,
    timeBasis: { enum: ['parser_seconds'] },
    pauseAdjusted: { enum: [false] }
});

const eventBase = objectOf({
    schemaVersion: string,
    eventId: string,
    replayId: string,
    eventCategory: string,
    eventType: string,
    subject: subjectSchema,
    time: timeSchema,
    value: opaqueRawEvidence('base event value is checked by discriminated event variants'),
    provenance: provenanceSchema,
    epistemicStatus: epistemicStatusSchema
});

const playerIdentityValue = objectOf({
    current: objectOf({ rawControllerHandle: stringOrNull, heroIdRaw: number }),
    previous: nil,
    unit: nil
});

const deathValue = objectOf({
    current: { enum: ['dead'] },
    previous: nil,
    unit: nil,
    evidenceNames: stringArray
});

const respawnValue = objectOf({
    current: { enum: ['active_after_death'] },
    previous: { enum: ['dead'] },
    unit: nil,
    deadDurationParserSeconds: number
});

const netWorthValue = objectOf({
    current: objectOf({ rawTeam2: number, rawTeam3: number, differenceTeam2MinusTeam3: number }),
    previous: nil,
    unit: { enum: ['m_iGoldNetWorth'] }
});

const healthPayload = objectOf({
    current: objectOf({ health: number, maxHealth: number, rawTeam: numberOrNull }),
    previous: { anyOf: [objectOf({ health: number, maxHealth: number }), nil] },
    unit: nil
});

const deletedPayload = objectOf({
    current: nil,
    previous: objectOf({ health: number, maxHealth: number }),
    unit: nil
});

const eventVariants = {
    'player_identity:player_identity_observed': {
        value: playerIdentityValue,
        requiredProvenance: { epistemicType: 'deterministic_derivation', method: true }
    },
    'player_death:player_death_observed': {
        value: deathValue,
        requiredProvenance: { epistemicType: 'deterministic_derivation', method: true }
    },
    'player_respawn:player_respawn_observed': {
        value: respawnValue,
        requiredProvenance: { epistemicType: 'deterministic_derivation', method: true }
    },
    'player_respawn:player_return_inferred': {
        value: respawnValue,
        requiredProvenance: { epistemicType: 'deterministic_derivation', method: true, formula: true }
    },
    'team_net_worth:team_net_worth_derived': {
        value: netWorthValue,
        requiredProvenance: { epistemicType: 'deterministic_derivation', method: true, formula: true }
    },
    'raw_objective_structure_lifecycle:entity_present': {
        value: healthPayload,
        requiredProvenance: { epistemicType: 'deterministic_derivation', method: true }
    },
    'raw_objective_structure_lifecycle:entity_deleted_or_absent_observed': {
        value: deletedPayload,
        requiredProvenance: { epistemicType: 'deterministic_derivation', method: true }
    },
    'raw_objective_structure_lifecycle:raw_health_changed': {
        value: healthPayload,
        requiredProvenance: { epistemicType: 'deterministic_derivation', method: true }
    },
    'raw_objective_structure_lifecycle:raw_health_zero_or_terminal_observed': {
        value: healthPayload,
        requiredProvenance: { epistemicType: 'deterministic_derivation', method: true }
    },
    'raw_objective_structure_lifecycle:raw_state_changed': {
        value: healthPayload,
        requiredProvenance: { epistemicType: 'deterministic_derivation', method: true }
    }
};

const playerSchema = objectOf({
    schemaVersion: string,
    replayId: string,
    playerKey: string,
    playerSlot: numberOrNull,
    rawTeam: number,
    controller: objectOf({
        rawHandle: stringOrNull,
        entityIndex: numberOrNull,
        entityIndexSource: { enum: ['not_decoded', 'decoded_entity_index'] },
        entitySerial: stringOrNull,
        generation: stringOrNull,
        generationStatus: { enum: ['unavailable', 'supported', 'not_applicable'] }
    }),
    pawn: objectOf({
        rawHandles: nullableStringArray,
        entityIndices: numberArray,
        generationCount: numberOrNull,
        continuityStatus: string
    }),
    heroIdRaw: number,
    firstSeenTick: number,
    lastSeenTick: numberOrNull,
    identityStatus: { enum: ['supported', 'confirmed', 'uncertain', 'unknown'] },
    provenance: arrayOf(provenanceSchema),
    limitations: stringArray
});

const healthSummarySchema = objectOf({
    count: number,
    min: number,
    max: number,
    examples: numberArray
});

const entitySchema = objectOf({
    schemaVersion: string,
    replayId: string,
    entityKey: string,
    rawHandle: stringOrNull,
    entityIndex: numberOrNull,
    entityIndexSource: { enum: ['not_decoded', 'decoded_entity_index'] },
    entitySerial: stringOrNull,
    entityGeneration: stringOrNull,
    generationStatus: { enum: ['unavailable', 'supported', 'not_applicable'] },
    generationEvidence: stringArray,
    className: stringOrNull,
    rawTeam: numberOrNull,
    mechanicCandidate: string,
    firstObservedParserSeconds: numberOrNull,
    lastObservedParserSeconds: numberOrNull,
    healthFields: stringArray,
    maxHealthFields: stringArray,
    observedHealthSummary: { anyOf: [healthSummarySchema, nil] },
    classification: string,
    confidence: string,
    provenance: arrayOf(provenanceSchema),
    semanticLimits: stringArray,
    limitations: stringArray
});

const metadataSchemas = {
    parser_matrix_result: objectOf({
        modeName: string,
        parserConfiguration: objectOf({ allowUnresolvedEntityReference: boolean, allowMissingClassBaseline: boolean, addedRecoveryBehavior: boolean }),
        completed: boolean,
        firstError: objectOf({ category: string, rawError: stringOrNull, tick: numberOrNull, gameTimeSeconds: numberOrNull, finalParsedTick: numberOrNull }),
        firstErrorCategory: string,
        firstErrorTick: numberOrNull,
        firstErrorGameTimeSeconds: numberOrNull,
        finalParsedTick: number,
        finalParsedGameTimeSeconds: number,
        lastTick: number,
        durationSeconds: number,
        percentParsed: number,
        packetsProcessed: number,
        messagePacketsProcessed: number,
        entityPacketsProcessed: number,
        telemetryRows: number,
        warnings: stringArray,
        warningCount: number,
        missingEntityReferences: arrayOf(opaqueRawEvidence('raw parser missing-entity reference payload preserved')),
        missingBaselineReferences: arrayOf(opaqueRawEvidence('raw parser missing-baseline reference payload preserved')),
        missingClassReferences: arrayOf(opaqueRawEvidence('raw parser missing-class reference payload preserved')),
        outputRemainsSynchronized: boolean,
        identitiesRemainStable: boolean,
        metadata: objectOf({
            demoProtocol: numberOrNull,
            networkProtocol: numberOrNull,
            gameBuild: numberOrNull,
            mapName: stringOrNull,
            matchId: stringOrNull,
            lastTick: number,
            durationSeconds: number,
            classCount: number,
            entityCount: number,
            stringTableCount: numberOrNull,
            metadataAvailability: string
        }),
        stats: objectOf({ classBaselines: number, classes: number, entities: number, serializers: number })
    }),
    death_validation: opaqueRawEvidence('imported prior death-validation summary with its own schema and warnings'),
    raw_replay_identity_hash: objectOf({ path: string, sha256: string, sizeBytes: number })
};

const metadataRecordSchema = objectOf({
    metadataId: string,
    category: string,
    value: opaqueRawEvidence('metadata value is checked by metadataId variants'),
    provenance: provenanceSchema
});

const epistemicCountSchema = objectOf({
    direct_parser_observation: number,
    deterministic_derivation: number,
    human_annotation: number,
    independent_visual_validation: number,
    heuristic: number,
    unresolved: number
});

const packageEpistemicCountSchema = objectOf({
    playerRegistry: epistemicCountSchema,
    entityRegistry: epistemicCountSchema,
    factualEvents: epistemicCountSchema,
    metadata: epistemicCountSchema,
    overlays: epistemicCountSchema,
    snapshots: epistemicCountSchema,
    capabilities: epistemicCountSchema,
    validationSummary: epistemicCountSchema,
    canonicalGate: epistemicCountSchema
});

const snapshotPlayerSchema = objectOf({
    playerKey: string,
    rawTeam: number,
    alive: boolean,
    rawReplayPosition: { anyOf: [objectOf({ x: number, y: number, z: number, coordinateBasis: { enum: ['raw_replay_player_position'] } }), nil] },
    netWorth: number
});

const snapshotSchema = objectOf({
    schemaVersion: string,
    replayId: string,
    snapshotId: string,
    time: objectOf({ demoTick: numberOrNull, parserSeconds: number, timeBasis: { enum: ['parser_seconds'] }, pauseAdjusted: { enum: [false] } }),
    players: arrayOf(snapshotPlayerSchema),
    teamNetWorth: objectOf({ rawTeam2: number, rawTeam3: number, differenceTeam2MinusTeam3: number, unit: { enum: ['m_iGoldNetWorth'] } }),
    provenance: provenanceSchema,
    limitations: stringArray
});

const capabilitySchema = objectOf({
    capability: string,
    status: { enum: ['ready_with_constraints', 'blocked', 'partial', 'not_available'] },
    evidence: stringArray,
    limitations: stringArray,
    provenance: provenanceSchema
});

const overlaySchema = objectOf({
    overlayId: string,
    eventId: string,
    comparisonStatus: string,
    validationStatus: string,
    provenance: provenanceSchema,
    limitations: stringArray
});

export const CANONICAL_CONTRACT = {
    schemaVersion: '7.0.0',
    contractId: 'canonical_factual_state_v7',
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
    forbiddenCanonicalFields: ['lane', 'laneAxis', 'laneProgress', 'nearestLane', 'region', 'mapRegion', 'structuralRegion', 'proximity', 'transform', 'residual'],
    forbiddenPromotedStringPatterns: ['lane_axis_', 'nearest_lane', 'structural_region'],
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
        playerRegistry: objectOf({
            schemaVersion: string,
            replayId: string,
            sourceReplay: string,
            summary: objectOf({
                playerCount: number,
                rawTeamDistribution: objectOf({ 2: number, 3: number }),
                controllerContinuity: string,
                pawnContinuity: string
            }),
            players: arrayOf(playerSchema)
        }),
        entityRegistry: objectOf({
            schemaVersion: string,
            replayId: string,
            identityRules: objectOf({
                entityKey: string,
                rawHandle: string,
                entityIndex: string,
                entitySerial: string,
                entityGeneration: string,
                generationStatus: stringArray
            }),
            entities: arrayOf(entitySchema)
        }),
        factualEvent: eventBase,
        factualEventVariants: eventVariants,
        metadataVariants: metadataSchemas,
        nonTimelineMetadata: objectOf({ schemaVersion: string, replayId: string, records: arrayOf(metadataRecordSchema) }),
        independentValidationOverlay: objectOf({
            schemaVersion: string,
            replayId: string,
            status: string,
            overlays: arrayOf(overlaySchema),
            provenance: arrayOf(provenanceSchema),
            reason: string
        }),
        snapshot: snapshotSchema,
        capabilityMatrix: objectOf({ schemaVersion: string, replayId: string, capabilities: arrayOf(capabilitySchema) }),
        validationSummary: objectOf({
            schemaVersion: string,
            taskId: string,
            replayId: string,
            gate: string,
            playerCount: number,
            rawTeamDistribution: objectOf({ 2: number, 3: number }),
            entityCount: number,
            canonicalEventCount: number,
            snapshotCount: number,
            validationOverlayCount: number,
            epistemicTypeCounts: epistemicCountSchema,
            factualEventEpistemicTypeCounts: epistemicCountSchema,
            packageEpistemicTypeCounts: packageEpistemicCountSchema,
            schemaValid: boolean,
            spatialLeakageFindings: number,
            mechanicEffectsApplied: { enum: [0] },
            rawReplayAccessClassification: string,
            finalGateVerifiedBy: string
        }),
        canonicalStateGate: objectOf({
            schemaVersion: string,
            taskId: string,
            replayId: string,
            gate: string,
            readyWithConstraints: boolean,
            finalGateSource: string,
            validationMatrixPath: string
        })
    }
};

function typeName(value) {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    return typeof value;
}

export function checkSchema(value, schema, path = '$') {
    const errors = [];
    const warnings = [];
    if (schema.opaque || schema.type === 'any') return { errors, warnings };
    if (schema.enum) {
        if (!schema.enum.includes(value)) errors.push({ path, issue: 'enum_invalid', expected: schema.enum, actual: value });
        return { errors, warnings };
    }
    if (schema.anyOf) {
        const results = schema.anyOf.map(option => checkSchema(value, option, path));
        if (results.some(result => result.errors.length === 0)) return { errors, warnings };
        errors.push({ path, issue: 'type_invalid', expected: schema.anyOf.map(option => option.type ?? option.enum ?? 'anyOf'), actual: typeName(value) });
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
            const childResult = checkSchema(value[index], schema.items, `${path}[${index}]`);
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
    errors.push(...checkSchema(provenance, provenanceSchema, path).errors);
    const required = variantRule?.requiredProvenance ?? {};
    if (required.epistemicType && provenance.epistemicType !== required.epistemicType) errors.push({ path: `${path}.epistemicType`, issue: 'epistemic_type_invalid', expected: required.epistemicType, actual: provenance.epistemicType });
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

export function auditContractCompleteness(contract = CANONICAL_CONTRACT) {
    const genericObjects = [];
    const genericArrays = [];
    function walk(schema, path) {
        if (!schema || schema.opaque) return;
        if (schema.type === 'object') {
            if (!schema.properties || Object.keys(schema.properties).length === 0) genericObjects.push(path);
            for (const [key, child] of Object.entries(schema.properties ?? {})) walk(child, `${path}.${key}`);
        }
        if (schema.type === 'array') {
            if (!schema.items || (!schema.items.opaque && (schema.items.type === 'any' || (schema.items.type === 'object' && Object.keys(schema.items.properties ?? {}).length === 0)))) genericArrays.push(path);
            walk(schema.items, `${path}[]`);
        }
        for (const option of schema.anyOf ?? []) walk(option, `${path}<option>`);
        if (schema.value) walk(schema.value, `${path}.value`);
    }
    for (const [name, artifact] of Object.entries(contract.artifacts)) {
        if (name === 'factualEventVariants') {
            for (const [variant, rule] of Object.entries(artifact)) walk(rule.value, `eventVariant.${variant}`);
        } else if (name === 'metadataVariants') {
            for (const [variant, rule] of Object.entries(artifact)) walk(rule, `metadataVariant.${variant}`);
        } else {
            walk(artifact, `artifact.${name}`);
        }
    }
    return {
        schemaVersion: 1,
        genericObjectSchemasRemaining: genericObjects.length,
        genericArrayItemSchemasRemaining: genericArrays.length,
        genericObjects,
        genericArrays,
        opaqueRawEvidenceSchemas: ['metadataVariant.death_validation', 'raw parser reference arrays', 'base event value'],
        passed: genericObjects.length === 0 && genericArrays.length === 0
    };
}

export function validateCanonicalPackage(packageData, contract = CANONICAL_CONTRACT) {
    const byArtifact = {};
    const eventVariants = new Map();
    let totalRecordsFound = 0;
    let totalRecordsValidated = 0;

    function addArtifact(name, found, validated, errors, warnings = [], variants = [], subrecords = {}) {
        byArtifact[name] = { recordsFound: found, recordsValidated: validated, errors, warnings, variants, subrecords };
        totalRecordsFound += found;
        totalRecordsValidated += validated;
    }

    const playerErrors = checkSchema(packageData.playerRegistry, contract.artifacts.playerRegistry, '$.playerRegistry').errors;
    for (const [index, player] of packageData.playerRegistry.players.entries()) {
        for (const [provIndex, prov] of player.provenance.entries()) playerErrors.push(...validateProvenance(prov, null, `players[${index}].provenance[${provIndex}]`));
    }
    addArtifact('playerRegistry', packageData.playerRegistry.players.length, packageData.playerRegistry.players.length, playerErrors, [], [], { playerFieldsChecked: packageData.playerRegistry.players.length });

    const entityErrors = checkSchema(packageData.entityRegistry, contract.artifacts.entityRegistry, '$.entityRegistry').errors;
    for (const [index, entity] of packageData.entityRegistry.entities.entries()) {
        for (const [provIndex, prov] of entity.provenance.entries()) entityErrors.push(...validateProvenance(prov, null, `entities[${index}].provenance[${provIndex}]`));
        if (entity.entityIndex !== null && entity.entityIndexSource !== 'decoded_entity_index') entityErrors.push({ path: `entities[${index}].entityIndex`, issue: 'index_without_decoding_evidence' });
        if (entity.entityGeneration !== null && entity.generationStatus === 'unavailable') entityErrors.push({ path: `entities[${index}].entityGeneration`, issue: 'fabricated_generation' });
    }
    addArtifact('entityRegistry', packageData.entityRegistry.entities.length, packageData.entityRegistry.entities.length, entityErrors, [], [], { entityFieldsChecked: packageData.entityRegistry.entities.length });

    const eventErrors = [];
    const unknownEventVariants = [];
    for (const [index, event] of packageData.factualEvents.entries()) {
        eventErrors.push(...checkSchema(event, contract.artifacts.factualEvent, `factualEvents[${index}]`).errors);
        eventErrors.push(...findForbiddenFields(event, contract.forbiddenCanonicalFields, `factualEvents[${index}]`));
        const variant = `${event.eventCategory}:${event.eventType}`;
        eventVariants.set(variant, (eventVariants.get(variant) ?? 0) + 1);
        const variantRule = contract.artifacts.factualEventVariants[variant];
        if (!variantRule) unknownEventVariants.push(variant);
        else {
            eventErrors.push(...checkSchema(event.value, variantRule.value, `factualEvents[${index}].value`).errors);
            eventErrors.push(...validateProvenance(event.provenance, variantRule, `factualEvents[${index}].provenance`));
        }
    }
    addArtifact('factualEvents', packageData.factualEvents.length, packageData.factualEvents.length, eventErrors, [], [...eventVariants.entries()].map(([variant, count]) => ({ variant, count })), { eventPayloadsChecked: packageData.factualEvents.length });

    const metadataErrors = checkSchema(packageData.nonTimelineMetadata, contract.artifacts.nonTimelineMetadata, '$.nonTimelineMetadata').errors;
    const metadataVariants = new Map();
    for (const [index, record] of packageData.nonTimelineMetadata.records.entries()) {
        metadataVariants.set(record.metadataId, (metadataVariants.get(record.metadataId) ?? 0) + 1);
        const valueSchema = contract.artifacts.metadataVariants[record.metadataId];
        if (!valueSchema) metadataErrors.push({ path: `metadata[${index}].metadataId`, issue: 'unknown_metadata_variant', actual: record.metadataId });
        else metadataErrors.push(...checkSchema(record.value, valueSchema, `metadata[${index}].value`).errors);
        metadataErrors.push(...validateProvenance(record.provenance, { requiredProvenance: { epistemicType: 'deterministic_derivation', method: true } }, `metadata[${index}].provenance`));
    }
    addArtifact('nonTimelineMetadata', packageData.nonTimelineMetadata.records.length, packageData.nonTimelineMetadata.records.length, metadataErrors, [], [...metadataVariants.entries()].map(([variant, count]) => ({ variant, count })), { metadataValuesChecked: packageData.nonTimelineMetadata.records.length });

    const overlayErrors = checkSchema(packageData.independentValidationOverlay, contract.artifacts.independentValidationOverlay, '$.overlay').errors;
    for (const [index, overlay] of packageData.independentValidationOverlay.overlays.entries()) overlayErrors.push(...validateProvenance(overlay.provenance, null, `overlay[${index}].provenance`));
    addArtifact('independentValidationOverlay', packageData.independentValidationOverlay.overlays.length, packageData.independentValidationOverlay.overlays.length, overlayErrors, [], [], { overlayItemsChecked: packageData.independentValidationOverlay.overlays.length });

    const snapshotErrors = [];
    let snapshotPlayerCount = 0;
    for (const [index, snapshot] of packageData.snapshots.entries()) {
        snapshotPlayerCount += snapshot.players.length;
        snapshotErrors.push(...checkSchema(snapshot, contract.artifacts.snapshot, `snapshots[${index}]`).errors);
        snapshotErrors.push(...validateProvenance(snapshot.provenance, { requiredProvenance: { epistemicType: 'deterministic_derivation', method: true } }, `snapshots[${index}].provenance`));
    }
    addArtifact('snapshots', packageData.snapshots.length, packageData.snapshots.length, snapshotErrors, [], [], { snapshotPlayersChecked: snapshotPlayerCount });

    const capabilityErrors = checkSchema(packageData.capabilityMatrix, contract.artifacts.capabilityMatrix, '$.capabilities').errors;
    for (const [index, capability] of packageData.capabilityMatrix.capabilities.entries()) capabilityErrors.push(...validateProvenance(capability.provenance, { requiredProvenance: { epistemicType: 'deterministic_derivation', method: true } }, `capabilities[${index}].provenance`));
    addArtifact('capabilityMatrix', packageData.capabilityMatrix.capabilities.length, packageData.capabilityMatrix.capabilities.length, capabilityErrors, [], [], { capabilityProvenanceChecked: packageData.capabilityMatrix.capabilities.length });

    const validationErrors = checkSchema(packageData.validationSummary, contract.artifacts.validationSummary, '$.validationSummary').errors;
    addArtifact('validationSummary', 1, 1, validationErrors);

    const gateErrors = checkSchema(packageData.canonicalGate, contract.artifacts.canonicalStateGate, '$.canonicalGate').errors;
    addArtifact('canonicalStateGate', 1, 1, gateErrors);

    const completeness = auditContractCompleteness(contract);
    const allErrors = Object.values(byArtifact).flatMap(artifact => artifact.errors);
    return {
        schemaVersion: contract.schemaVersion,
        valid: allErrors.length === 0 && unknownEventVariants.length === 0 && completeness.passed,
        totalRecordsFound,
        totalRecordsValidated,
        genericObjectSchemasRemaining: completeness.genericObjectSchemasRemaining,
        genericArrayItemSchemasRemaining: completeness.genericArrayItemSchemasRemaining,
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
