export const EP_TYPES = [
    'direct_parser_observation',
    'deterministic_derivation',
    'human_annotation',
    'independent_visual_validation',
    'heuristic',
    'unresolved'
];

export const CANONICAL_CONTRACT = {
    schemaVersion: '2.0.0',
    contractId: 'canonical_factual_state_v2',
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
    categories: {
        player_identity: {
            timeline: true,
            provenanceMinimum: ['sourceTask', 'sourcePath', 'sourceField', 'epistemicType', 'validationStatus'],
            semantics: 'parser-side player identity and raw team, without faction or strategic interpretation'
        },
        player_death: {
            timeline: true,
            provenanceMinimum: ['sourceTask', 'sourcePath', 'sourceField', 'epistemicType', 'validationStatus'],
            semantics: 'factual death observation only; killer, assists, fights, and cause are not promoted'
        },
        player_respawn: {
            timeline: true,
            provenanceMinimum: ['sourceTask', 'sourcePath', 'sourceField', 'epistemicType', 'validationStatus'],
            semantics: 'parser-time return observation or deterministic inference, not official respawn timer'
        },
        team_net_worth: {
            timeline: true,
            provenanceMinimum: ['sourceTask', 'sourcePath', 'sourceField', 'epistemicType', 'formula', 'validationStatus'],
            semantics: 'team aggregate of m_iGoldNetWorth only'
        },
        raw_objective_structure_lifecycle: {
            timeline: true,
            provenanceMinimum: ['sourceTask', 'sourcePath', 'sourceField', 'epistemicType', 'method', 'validationStatus'],
            semantics: 'raw lifecycle/health/state observation transformed to neutral canonical category without objective completion semantics'
        }
    },
    identityRules: {
        entityKey: 'neutral canonical key derived from replay id, class name, and raw handle; legacy spatial identifiers are provenance only',
        rawHandle: 'preserved verbatim when available',
        entityIndex: 'null unless source explicitly provides a decoded index',
        entitySerial: 'null unless source explicitly provides serial',
        entityGeneration: 'null unless lifecycle evidence supports a generation',
        generationStatus: ['supported', 'unavailable', 'not_applicable']
    }
};

export function validateCanonicalPackage(packageData) {
    const errors = [];
    const eventVariants = new Map();
    for (const event of packageData.factualEvents) {
        if (!event.eventId) errors.push({ path: 'factualEvents[].eventId', issue: 'missing' });
        if (!event.provenance?.sourceTask) errors.push({ path: `${event.eventId}.provenance.sourceTask`, issue: 'missing' });
        if (!event.provenance?.sourcePath) errors.push({ path: `${event.eventId}.provenance.sourcePath`, issue: 'missing' });
        if (!EP_TYPES.includes(event.provenance?.epistemicType)) errors.push({ path: `${event.eventId}.provenance.epistemicType`, issue: 'invalid' });
        if (event.epistemicStatus?.mechanicEffectApplied !== false) errors.push({ path: `${event.eventId}.epistemicStatus.mechanicEffectApplied`, issue: 'must_be_false' });
        eventVariants.set(`${event.eventCategory}:${event.eventType}`, (eventVariants.get(`${event.eventCategory}:${event.eventType}`) ?? 0) + 1);
    }
    for (const entity of packageData.entityRegistry.entities) {
        if (!Object.hasOwn(entity, 'rawHandle')) errors.push({ path: `${entity.entityKey}.rawHandle`, issue: 'missing' });
        if (entity.entityGeneration !== null && entity.generationStatus === 'unavailable') errors.push({ path: `${entity.entityKey}.entityGeneration`, issue: 'fabricated_generation' });
        if (entity.entityIndex !== null && entity.entityIndexSource !== 'decoded_entity_index') errors.push({ path: `${entity.entityKey}.entityIndex`, issue: 'index_without_decoding_evidence' });
    }
    return {
        schemaVersion: '2.0.0',
        valid: errors.length === 0,
        errors,
        eventVariants: [...eventVariants.entries()].map(([variant, count]) => ({ variant, count })).sort((a, b) => a.variant.localeCompare(b.variant))
    };
}
