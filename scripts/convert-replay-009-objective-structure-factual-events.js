import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const OUTPUT_DIR = 'output/replay-009-states';
const REPORT_PATH = 'reports/replay-009-objective-structure-factual-state-events.md';
const FOLLOW_UP_PATH = 'tasks/blocked/064-validate-replay-009-objective-structure-factual-events-against-independent-source.md';
const TICK_RATE = 64;
const BUILD_ID = '23916427';
const GATE = 'replay_009_objective_structure_factual_events_ready_with_gaps';
const SEMANTIC_LIMITS = {
    health_observed: 'health value is a raw observed property; it does not prove damage source, kill, destruction, or mechanic effect',
    health_changed: 'health change is a raw sampled property difference; it does not prove damage source, kill, destruction, or mechanic effect',
    health_zero_observed: 'health_zero_observed != killed and health_zero_observed != destroyed',
    team_observed: 'team value is a raw observed property; it does not prove ownership, objective control, or side-specific mechanic effect',
    raw_state_changed: 'raw_state_changed != known gameplay state',
    entity_created: 'entity_created != spawned objective and does not prove mechanic activation',
    entity_present: 'entity_present is first reliable observed presence only',
    entity_deleted: 'entity_deleted != destroyed, entity_deleted != secured, entity_deleted != claimed, and entity_deleted != deposited',
    candidate_entity_created: 'candidate_entity_created is class-pattern evidence only and does not prove canonical mechanic identity',
    candidate_entity_present: 'candidate_entity_present is class-pattern evidence only and does not prove canonical mechanic identity',
    candidate_raw_property_changed: 'candidate_raw_property_changed != known gameplay state',
    candidate_entity_deleted: 'candidate_entity_deleted != destroyed, secured, claimed, or deposited'
};

const SUPPORTED_MECHANICS = new Set([ 'mid_boss', 'guardian', 'walker', 'patron_base' ]);
const CANDIDATE_MECHANICS = new Set([ 'spirit_urn', 'rejuvenator' ]);

async function readJson(file) {
    return JSON.parse(await fs.readFile(path.join(OUTPUT_DIR, file), 'utf8'));
}

async function readJsonl(file) {
    const raw = await fs.readFile(path.join(OUTPUT_DIR, file), 'utf8');
    return raw.trim() ? raw.trim().split(/\r?\n/).map(line => JSON.parse(line)) : [];
}

async function writeJson(file, value) {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeJsonl(file, rows) {
    await fs.mkdir(path.dirname(file), { recursive: true });
    const text = rows.length ? `${rows.map(row => JSON.stringify(row)).join('\n')}\n` : '';
    await fs.writeFile(file, text);
}

function stableHash(value) {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function seconds(tick) {
    return Number.isFinite(tick) && tick >= 0 ? Number((tick / TICK_RATE).toFixed(3)) : null;
}

function mechanicFor(candidate) {
    const mechanics = candidate.candidateMechanics ?? [];
    if (mechanics.includes('patron_base')) return 'patron_base';
    if (mechanics.length) return mechanics[0];
    return 'unknown';
}

function entityKey(candidate) {
    const creation = candidate.creationTick ?? 'unknown';
    return [
        candidate.entityIndex ?? 'unknown',
        candidate.serial ?? 'no-serial',
        candidate.handle ?? 'no-handle',
        candidate.classId ?? 'no-class',
        creation
    ].join(':');
}

function baseEvent(candidate, type, suffix, extras = {}) {
    const tick = extras.demoTick ?? null;
    return {
        eventId: [
            'replay_009',
            entityKey(candidate),
            type,
            suffix
        ].join(':'),
        mechanicId: mechanicFor(candidate),
        entityIndex: candidate.entityIndex ?? null,
        classId: candidate.classId ?? null,
        className: candidate.className ?? '',
        eventType: type,
        demoTick: tick,
        parserSeconds: seconds(tick),
        team: extras.team ?? null,
        rawValue: extras.rawValue ?? null,
        previousRawValue: extras.previousRawValue ?? null,
        sourceProperty: extras.sourceProperty ?? null,
        sourceOperation: extras.sourceOperation ?? '',
        confidence: extras.confidence ?? (candidate.classification === 'confirmed' ? 'confirmed' : 'supported'),
        semanticLimit: SEMANTIC_LIMITS[type] ?? 'raw factual event only',
        warnings: [
            ...(extras.warnings ?? []),
            'mechanic version unresolved for build 23916427',
            'mechanic effects not applied'
        ]
    };
}

function firstOperationTick(candidate, operationName) {
    return (candidate.operations ?? []).find(operation => operation.operation === operationName)?.tick ?? null;
}

function uniqueOperationTicks(candidate, operationName) {
    return [ ...new Set((candidate.operations ?? [])
        .filter(operation => operation.operation === operationName)
        .map(operation => operation.tick)) ];
}

function propertyEventTicks(candidate) {
    const ticks = uniqueOperationTicks(candidate, 'UPDATE').filter(tick => Number.isFinite(tick) && tick >= 0);
    return ticks.length ? ticks : [ candidate.firstUpdateTick ].filter(tick => Number.isFinite(tick) && tick >= 0);
}

function compactValues(values) {
    return [ ...new Set(values ?? []) ];
}

function buildSupportedEvents(candidate) {
    const events = [];
    const createTick = firstOperationTick(candidate, 'CREATE');
    if (createTick !== null) {
        events.push(baseEvent(candidate, 'entity_created', `create:${createTick}`, {
            demoTick: createTick,
            sourceOperation: 'CREATE'
        }));
    }

    const presentTick = Number.isFinite(candidate.firstUpdateTick) && candidate.firstUpdateTick >= 0
        ? candidate.firstUpdateTick
        : createTick;
    if (presentTick !== null) {
        events.push(baseEvent(candidate, 'entity_present', `present:${presentTick}`, {
            demoTick: presentTick,
            sourceOperation: presentTick === createTick ? 'CREATE' : 'UPDATE'
        }));
    }

    for (const team of compactValues(candidate.teamValues)) {
        events.push(baseEvent(candidate, 'team_observed', `team:${String(team)}`, {
            demoTick: null,
            team,
            rawValue: team,
            sourceProperty: 'm_iTeamNum',
            sourceOperation: 'PROPERTY_SAMPLE',
            warnings: [ 'Task 062 compact evidence preserves sampled team values without exact mutation ticks.' ]
        }));
    }

    const healthValues = compactValues(candidate.healthValues).filter(value => Number.isFinite(value));
    const healthTicks = propertyEventTicks(candidate);
    healthValues.forEach((value, index) => {
        const tick = healthTicks[index] ?? null;
        events.push(baseEvent(candidate, index === 0 ? 'health_observed' : 'health_changed', `health:${index}:${String(value)}`, {
            demoTick: tick,
            rawValue: value,
            previousRawValue: index > 0 ? healthValues[index - 1] : null,
            sourceProperty: 'm_iHealth',
            sourceOperation: 'PROPERTY_SAMPLE',
            warnings: [ 'Task 062 compact evidence preserves bounded sampled health values, not every health mutation.' ]
        }));
        if (value === 0) {
            events.push(baseEvent(candidate, 'health_zero_observed', `health-zero:${index}`, {
                demoTick: tick,
                rawValue: value,
                previousRawValue: index > 0 ? healthValues[index - 1] : null,
                sourceProperty: 'm_iHealth',
                sourceOperation: 'PROPERTY_SAMPLE',
                warnings: [ 'Zero health is observed as a raw value only.' ]
            }));
        }
    });

    const stateValues = compactValues(candidate.stateValues);
    stateValues.forEach((value, index) => {
        if (index === 0) return;
        events.push(baseEvent(candidate, 'raw_state_changed', `state:${index}:${String(value)}`, {
            demoTick: null,
            rawValue: value,
            previousRawValue: stateValues[index - 1],
            sourceProperty: 'raw_state_candidate',
            sourceOperation: 'PROPERTY_SAMPLE',
            warnings: [ 'Task 062 compact evidence preserves sampled state values without semantic mapping.' ]
        }));
    });

    if (candidate.deletionTick !== null && candidate.deletionTick !== undefined) {
        events.push(baseEvent(candidate, 'entity_deleted', `delete:${candidate.deletionTick}`, {
            demoTick: candidate.deletionTick,
            sourceOperation: 'DELETE'
        }));
    }

    return events;
}

function buildCandidateEvents(candidate) {
    const events = [];
    const createTick = firstOperationTick(candidate, 'CREATE');
    if (createTick !== null) {
        events.push(baseEvent(candidate, 'candidate_entity_created', `candidate-create:${createTick}`, {
            demoTick: createTick,
            sourceOperation: 'CREATE',
            confidence: 'uncertain',
            warnings: [ 'Candidate class identity remained uncertain in Task 062.' ]
        }));
    }
    const presentTick = Number.isFinite(candidate.firstUpdateTick) && candidate.firstUpdateTick >= 0
        ? candidate.firstUpdateTick
        : createTick;
    if (presentTick !== null) {
        events.push(baseEvent(candidate, 'candidate_entity_present', `candidate-present:${presentTick}`, {
            demoTick: presentTick,
            sourceOperation: presentTick === createTick ? 'CREATE' : 'UPDATE',
            confidence: 'uncertain',
            warnings: [ 'Candidate class identity remained uncertain in Task 062.' ]
        }));
    }
    [ 'teamValues', 'ownerValues', 'healthValues', 'stateValues' ].forEach(field => {
        compactValues(candidate[field]).forEach((value, index) => {
            events.push(baseEvent(candidate, 'candidate_raw_property_changed', `${field}:${index}:${String(value)}`, {
                demoTick: null,
                rawValue: value,
                sourceProperty: field,
                sourceOperation: 'PROPERTY_SAMPLE',
                confidence: 'uncertain',
                warnings: [ 'Raw candidate property sample only; canonical mechanic identity unresolved.' ]
            }));
        });
    });
    if (candidate.deletionTick !== null && candidate.deletionTick !== undefined) {
        events.push(baseEvent(candidate, 'candidate_entity_deleted', `candidate-delete:${candidate.deletionTick}`, {
            demoTick: candidate.deletionTick,
            sourceOperation: 'DELETE',
            confidence: 'uncertain',
            warnings: [ 'Candidate class identity remained uncertain in Task 062.' ]
        }));
    }
    return events;
}

function dedupeEvents(events) {
    const seen = new Set();
    const duplicates = [];
    const kept = [];
    for (const event of events) {
        const key = [
            event.entityIndex,
            event.classId,
            event.eventType,
            event.demoTick,
            event.sourceProperty,
            JSON.stringify(event.rawValue)
        ].join('|');
        if (seen.has(key)) {
            duplicates.push(event);
            continue;
        }
        seen.add(key);
        kept.push(event);
    }
    return { kept, duplicates };
}

function terminalSequence(candidate) {
    const hasZero = compactValues(candidate.healthValues).includes(0);
    const hasDeletion = candidate.deletionTick !== null && candidate.deletionTick !== undefined;
    if (hasZero && hasDeletion) return 'health_zero_then_deleted';
    if (hasDeletion) return 'deleted_without_observed_zero';
    if (hasZero) return 'zero_without_deletion';
    if (!hasDeletion) return 'present_until_replay_end';
    return 'unknown';
}

function validateEvents(entityKeys, events) {
    const violations = [];
    const byEntity = new Map();
    for (const event of events) {
        const key = [ event.entityIndex, event.classId ].join(':');
        if (!byEntity.has(key)) byEntity.set(key, []);
        byEntity.get(key).push(event);
        if (!entityKeys.some(entity => entity.entityIndex === event.entityIndex && entity.classId === event.classId)) {
            violations.push({ eventId: event.eventId, type: 'missing_entity_key' });
        }
    }

    for (const [ key, rows ] of byEntity) {
        const timed = rows.filter(row => row.demoTick !== null).sort((a, b) => a.demoTick - b.demoTick);
        for (let i = 1; i < timed.length; i += 1) {
            if (timed[i].demoTick < timed[i - 1].demoTick) {
                violations.push({ entityKey: key, type: 'non_monotonic_tick', eventId: timed[i].eventId });
            }
        }
        const creates = rows.filter(row => row.eventType === 'entity_created' || row.eventType === 'candidate_entity_created');
        const deletes = rows.filter(row => row.eventType === 'entity_deleted' || row.eventType === 'candidate_entity_deleted');
        if (creates.length > 1) violations.push({ entityKey: key, type: 'duplicated_creation', count: creates.length });
        if (deletes.length > 1) violations.push({ entityKey: key, type: 'duplicated_deletion', count: deletes.length });
        const deleteTick = Math.min(...deletes.map(row => row.demoTick).filter(tick => tick !== null));
        if (Number.isFinite(deleteTick)) {
            for (const row of rows) {
                if (row.demoTick !== null && row.demoTick > deleteTick && !row.eventType.endsWith('deleted')) {
                    violations.push({ entityKey: key, type: 'event_after_deletion', eventId: row.eventId });
                }
            }
        }
    }
    return violations;
}

function summarizeByMechanic(events, candidates) {
    const mechanics = [ 'mid_boss', 'guardian', 'walker', 'patron_base', 'spirit_urn', 'rejuvenator' ];
    const summary = {};
    for (const mechanicId of mechanics) {
        const mechanicEvents = events.filter(event => event.mechanicId === mechanicId);
        const mechanicCandidates = candidates.filter(candidate => mechanicFor(candidate) === mechanicId);
        summary[mechanicId] = {
            entityCount: mechanicCandidates.length,
            eventCount: mechanicEvents.length,
            eventTypes: Object.fromEntries([ ...new Set(mechanicEvents.map(event => event.eventType)) ]
                .sort()
                .map(type => [ type, mechanicEvents.filter(event => event.eventType === type).length ])),
            terminalSequences: Object.fromEntries([ ...new Set(mechanicCandidates.map(terminalSequence)) ]
                .sort()
                .map(type => [ type, mechanicCandidates.filter(candidate => terminalSequence(candidate) === type).length ]))
        };
    }
    return summary;
}

function updateMechanicResults(existing, eventSummary) {
    const mechanics = existing.mechanics.map(mechanic => {
        if (mechanic.mechanicId === 'mid_boss') {
            return {
                ...mechanic,
                factualStateDetection: 'ready_with_constraints',
                detectedEntityCount: eventSummary.mid_boss.entityCount,
                detectedStateTypes: [ 'entity_present', 'health_observed', 'health_changed', 'entity_deleted' ],
                unavailableStateTypes: [ 'killed', 'secured', 'mechanic_effect' ],
                evidence: [ 'Task 063 converted Task 062 CNPC_MidBoss lifecycle and sampled health evidence.' ],
                limitations: [ 'Health zero was not observed in compact Task 062 evidence.', 'Deletion is not interpreted as killed.' ],
                knowledgeMissingBuildMapping: true
            };
        }
        if (mechanic.mechanicId === 'core_structures') {
            const entityCount = eventSummary.guardian.entityCount + eventSummary.walker.entityCount + eventSummary.patron_base.entityCount;
            return {
                ...mechanic,
                factualStateDetection: 'ready_with_constraints',
                detectedEntityCount: entityCount,
                detectedStateTypes: [ 'entity_present', 'team_observed', 'health_observed', 'health_changed', 'raw_state_changed', 'entity_deleted' ],
                unavailableStateTypes: [ 'destroyed', 'strategic_pressure', 'region_association' ],
                evidence: [ 'Task 063 converted Task 062 Guardian, Walker, and Patron/base lifecycle and sampled property evidence.' ],
                limitations: [ 'Deletion is not interpreted as destroyed.', 'No spatial or structure-region association is available.' ],
                knowledgeMissingBuildMapping: true
            };
        }
        return mechanic;
    });
    return { ...existing, mechanics };
}

function updateActivationMatrix(existing) {
    return {
        ...existing,
        mechanics: existing.mechanics.map(mechanic => {
            if (mechanic.mechanicId === 'mid_boss') {
                return {
                    ...mechanic,
                    stateDetectionStatus: 'ready_with_constraints',
                    safeOutputs: [ 'mid boss entity present', 'mid boss sampled raw health', 'mid boss entity deleted' ],
                    prohibitedOutputs: [ ...new Set([ ...(mechanic.prohibitedOutputs ?? []), 'mid boss killed', 'Rejuvenator effect active' ]) ],
                    missingTelemetry: [ 'independent kill confirmation', 'mechanic effect applicability', 'spatial contest/proximity' ]
                };
            }
            if (mechanic.mechanicId === 'core_structures') {
                return {
                    ...mechanic,
                    stateDetectionStatus: 'ready_with_constraints',
                    safeOutputs: [ 'structure entity present', 'structure sampled raw health', 'structure team raw value', 'structure entity deleted' ],
                    prohibitedOutputs: [ ...new Set([ ...(mechanic.prohibitedOutputs ?? []), 'structure destroyed', 'structure pressure' ]) ],
                    missingTelemetry: [ 'independent destruction confirmation', 'region association', 'mechanic effect applicability' ]
                };
            }
            return mechanic;
        })
    };
}

function buildStateSummary(summary, eventSummary, validation) {
    return {
        ...summary,
        task063Extension: {
            gate: GATE,
            objectiveStructureFactualEvents: {
                entityGenerationsNormalized: eventSummary.entityGenerationsNormalized,
                factualEventsEmitted: eventSummary.factualEventsEmitted,
                midBossEntities: eventSummary.byMechanic.mid_boss.entityCount,
                coreStructureEntities: eventSummary.byMechanic.guardian.entityCount + eventSummary.byMechanic.walker.entityCount + eventSummary.byMechanic.patron_base.entityCount,
                spiritUrnCandidateEntities: eventSummary.byMechanic.spirit_urn.entityCount,
                rejuvenatorCandidateEntities: eventSummary.byMechanic.rejuvenator.entityCount,
                lifecycleViolations: validation.lifecycleViolations.length
            },
            mechanicEffectsApplied: 0,
            limitations: [
                'Health zero is observable only if raw sampled health reaches zero; Task 063 did not infer kills or destruction.',
                'Entity deletion is observable but not interpreted as objective completion, claim, deposit, kill, or destruction.'
            ]
        }
    };
}

async function main() {
    const requiredFiles = [
        'objective-structure-entity-observability.json',
        'objective-structure-property-inventory.json',
        'objective-structure-lifecycle-candidates.jsonl',
        'objective-structure-state-readiness.json',
        'task-060-candidate-reclassification.json'
    ];
    const inputHashes = {};
    for (const file of requiredFiles) {
        const raw = await fs.readFile(path.join(OUTPUT_DIR, file), 'utf8');
        inputHashes[file] = stableHash(raw);
    }

    const observability = await readJson('objective-structure-entity-observability.json');
    const propertyInventory = await readJson('objective-structure-property-inventory.json');
    const lifecycle = await readJsonl('objective-structure-lifecycle-candidates.jsonl');
    const readiness = await readJson('objective-structure-state-readiness.json');
    const reclassification = await readJson('task-060-candidate-reclassification.json');

    const inputValidationErrors = [];
    if (observability.replayId !== 'replay_009') inputValidationErrors.push('observability replayId mismatch');
    if (!Array.isArray(propertyInventory.properties)) inputValidationErrors.push('property inventory missing properties');
    if (!Array.isArray(readiness.states)) inputValidationErrors.push('state readiness missing states');
    if (reclassification.summary?.reviewed !== 4) inputValidationErrors.push('Task 060 candidate reclassification summary mismatch');
    if (!lifecycle.length) inputValidationErrors.push('lifecycle candidate file is empty');

    const entityKeys = lifecycle.map(candidate => ({
        entityKey: entityKey(candidate),
        entityIndex: candidate.entityIndex ?? null,
        serial: candidate.serial ?? null,
        handle: candidate.handle ?? null,
        classId: candidate.classId ?? null,
        className: candidate.className ?? '',
        mechanicId: mechanicFor(candidate),
        creationTick: candidate.creationTick ?? null,
        deletionTick: candidate.deletionTick ?? null,
        identityConfidence: SUPPORTED_MECHANICS.has(mechanicFor(candidate)) ? candidate.classification : 'uncertain',
        warnings: candidate.warnings ?? []
    }));

    const candidateEvents = lifecycle.flatMap(candidate => {
        const mechanic = mechanicFor(candidate);
        if (SUPPORTED_MECHANICS.has(mechanic)) return buildSupportedEvents(candidate);
        if (CANDIDATE_MECHANICS.has(mechanic)) return buildCandidateEvents(candidate);
        return [];
    });
    const { kept: events, duplicates } = dedupeEvents(candidateEvents);
    const validation = {
        schemaVersion: 1,
        replayId: 'replay_009',
        inputHashes,
        inputValidationErrors,
        lifecycleViolations: validateEvents(entityKeys, events),
        duplicateEventsRemoved: duplicates.length,
        replay005Protection: 'not_processed_or_inspected',
        botFixtureExclusion: 'not_processed_or_inspected',
        mechanicEffectsApplied: 0,
        warnings: []
    };
    validation.status = inputValidationErrors.length || validation.lifecycleViolations.length ? 'warnings_present' : 'passed';

    const byMechanic = summarizeByMechanic(events, lifecycle);
    const supportedEvents = events.filter(event => SUPPORTED_MECHANICS.has(event.mechanicId));
    const eventSummary = {
        schemaVersion: 1,
        taskId: '063',
        replayId: 'replay_009',
        entityGenerationsNormalized: entityKeys.length,
        factualEventsEmitted: events.length,
        supportedFactualEventsEmitted: supportedEvents.length,
        duplicateEventsRemoved: duplicates.length,
        lifecycleViolations: validation.lifecycleViolations.length,
        byMechanic,
        directTeamObservations: events.filter(event => event.eventType === 'team_observed').length,
        healthZeroObservations: events.filter(event => event.eventType === 'health_zero_observed').length,
        deletionObservations: events.filter(event => event.eventType === 'entity_deleted' || event.eventType === 'candidate_entity_deleted').length,
        knowledge: {
            buildId: BUILD_ID,
            applicableRules: [],
            effectApplication: 'not_applied',
            missingBuildMapping: true
        },
        safeNewFactualOutputs: [
            'mid_boss raw entity lifecycle and sampled health events',
            'guardian raw entity lifecycle, team, state, and sampled health events',
            'walker raw entity lifecycle, team, state, and sampled health events',
            'patron/base raw entity lifecycle, team, state, and sampled health events',
            'Spirit Urn candidate lifecycle/property events only'
        ],
        stillProhibitedConclusions: [
            'health zero proves killed or destroyed',
            'entity deletion proves destroyed, secured, claimed, or deposited',
            'objective completion',
            'mechanic activation',
            'mechanic effects',
            'spatial contest/proximity',
            'macro interpretation'
        ],
        gate: GATE,
        blockedValidationFollowUp: FOLLOW_UP_PATH,
        replay005Protection: 'not_processed_or_inspected',
        botFixtureExclusion: 'not_processed_or_inspected'
    };
    eventSummary.entityGenerationsNormalized = entityKeys.length;
    eventSummary.factualEventsEmitted = events.length;
    eventSummary.byMechanic = byMechanic;

    const terminalSequences = {
        schemaVersion: 1,
        replayId: 'replay_009',
        entities: lifecycle.map(candidate => ({
            entityKey: entityKey(candidate),
            mechanicId: mechanicFor(candidate),
            entityIndex: candidate.entityIndex,
            classId: candidate.classId,
            className: candidate.className,
            terminalSequence: terminalSequence(candidate),
            healthValuesObserved: compactValues(candidate.healthValues),
            deletionTick: candidate.deletionTick ?? null,
            semanticLimit: 'Terminal sequence describes raw observed order only; it is not a kill, destruction, claim, deposit, or secure conclusion.'
        })),
        summary: byMechanic
    };

    const gate = {
        schemaVersion: 1,
        taskId: '063',
        gate: GATE,
        mechanicEffectsApplied: 0,
        lifecycleViolations: validation.lifecycleViolations.length,
        duplicateEventsRemoved: duplicates.length,
        limitations: [
            'Task 062 compact evidence does not preserve exact ticks for every sampled property value.',
            'Urn and Rejuvenator remain candidate-only or unavailable.',
            'No mechanic effect or spatial interpretation was applied.'
        ]
    };

    const allEvents = events.sort((a, b) => (a.demoTick ?? Number.MAX_SAFE_INTEGER) - (b.demoTick ?? Number.MAX_SAFE_INTEGER)
        || String(a.eventId).localeCompare(String(b.eventId)));

    await writeJson(path.join(OUTPUT_DIR, 'objective-structure-entity-keys.json'), {
        schemaVersion: 1,
        replayId: 'replay_009',
        entities: entityKeys,
        summary: {
            entityGenerationsNormalized: entityKeys.length,
            byMechanic: Object.fromEntries([ ...new Set(entityKeys.map(entity => entity.mechanicId)) ]
                .sort()
                .map(mechanicId => [ mechanicId, entityKeys.filter(entity => entity.mechanicId === mechanicId).length ]))
        }
    });
    await writeJsonl(path.join(OUTPUT_DIR, 'objective-structure-factual-events.jsonl'), allEvents);
    await writeJsonl(path.join(OUTPUT_DIR, 'mid-boss-factual-events.jsonl'), allEvents.filter(event => event.mechanicId === 'mid_boss'));
    await writeJsonl(path.join(OUTPUT_DIR, 'guardian-factual-events.jsonl'), allEvents.filter(event => event.mechanicId === 'guardian'));
    await writeJsonl(path.join(OUTPUT_DIR, 'walker-factual-events.jsonl'), allEvents.filter(event => event.mechanicId === 'walker'));
    await writeJsonl(path.join(OUTPUT_DIR, 'patron-base-factual-events.jsonl'), allEvents.filter(event => event.mechanicId === 'patron_base'));
    await writeJsonl(path.join(OUTPUT_DIR, 'urn-candidate-events.jsonl'), allEvents.filter(event => event.mechanicId === 'spirit_urn'));
    await writeJsonl(path.join(OUTPUT_DIR, 'rejuvenator-candidate-events.jsonl'), allEvents.filter(event => event.mechanicId === 'rejuvenator'));
    await writeJson(path.join(OUTPUT_DIR, 'objective-structure-terminal-sequences.json'), terminalSequences);
    await writeJson(path.join(OUTPUT_DIR, 'objective-structure-event-summary.json'), eventSummary);
    await writeJson(path.join(OUTPUT_DIR, 'objective-structure-event-validation.json'), validation);
    await writeJson(path.join(OUTPUT_DIR, 'objective-structure-event-gate.json'), gate);

    const midBossEvents = allEvents.filter(event => event.mechanicId === 'mid_boss');
    const structureEvents = allEvents.filter(event => [ 'guardian', 'walker', 'patron_base' ].includes(event.mechanicId));
    await writeJsonl(path.join(OUTPUT_DIR, 'objective-state-events.jsonl'), [
        ...midBossEvents,
        ...allEvents.filter(event => event.mechanicId === 'spirit_urn' && event.eventType.startsWith('candidate_'))
    ]);
    await writeJsonl(path.join(OUTPUT_DIR, 'mid-boss-state-events.jsonl'), midBossEvents);
    await writeJsonl(path.join(OUTPUT_DIR, 'structure-state-events.jsonl'), structureEvents);

    const existingMechanicResults = await readJson('mechanic-state-results.json');
    await writeJson(path.join(OUTPUT_DIR, 'mechanic-state-results.json'), updateMechanicResults(existingMechanicResults, eventSummary.byMechanic));
    const existingActivation = await readJson('activation-readiness-matrix.json');
    await writeJson(path.join(OUTPUT_DIR, 'activation-readiness-matrix.json'), updateActivationMatrix(existingActivation));
    const existingSummary = await readJson('state-detection-summary.json');
    await writeJson(path.join(OUTPUT_DIR, 'state-detection-summary.json'), buildStateSummary(existingSummary, eventSummary, validation));

    await fs.writeFile(FOLLOW_UP_PATH, `# Task 064: Validate Replay 009 Objective/Structure Factual Events Against Independent Source

Status: blocked

Blocked by: requires independent replay video, controlled game observation, or equivalent source selected by the user

## Objective

Validate Task 063 raw factual objective/structure event observations against an
independent source without applying mechanic effects or macro interpretation.

## Constraints

- Do not process replay 005.
- Do not process bot fixtures 006-008.
- Do not infer mechanic effects, objective completion, destruction, or strategic
  quality from raw events alone.
- Preserve Task 063 semantic limits: health zero is not a kill/destruction
  conclusion, and entity deletion is not an objective completion conclusion.

## Required validation

- Independent-source availability check;
- bounded sample selection;
- event-to-source comparison;
- replay 005 exclusion verification;
- bot fixture exclusion verification;
- task queue validation.
`);

    await fs.writeFile(REPORT_PATH, `# Replay 009 Objective/Structure Factual State Events

Task 063 converts Task 062 compact class, property, and lifecycle observability into bounded factual events. It does not parse new replay fixtures, apply mechanics, project map positions, infer objective completion, or interpret strategy.

## Result

- Gate: \`${GATE}\`
- Entity generations normalized: ${eventSummary.entityGenerationsNormalized}
- Factual events emitted: ${eventSummary.factualEventsEmitted}
- Duplicate events removed: ${eventSummary.duplicateEventsRemoved}
- Lifecycle violations: ${eventSummary.lifecycleViolations}
- Mechanic effects applied: 0

## Mechanic Summary

| Mechanic | Entities | Events | Terminal sequences |
| --- | ---: | ---: | --- |
${Object.entries(eventSummary.byMechanic).map(([ mechanicId, row ]) => `| ${mechanicId} | ${row.entityCount} | ${row.eventCount} | ${Object.entries(row.terminalSequences).map(([ key, value ]) => `${key}: ${value}`).join(', ') || 'none'} |`).join('\n')}

## Safe Outputs

- Mid Boss raw entity lifecycle and sampled health events.
- Guardian, Walker, and Patron/base raw entity lifecycle, team, state, and sampled health events.
- Spirit Urn candidate lifecycle/property events only.

## Still Prohibited

- Health zero is not a kill/destruction conclusion.
- Entity deletion is not a destroyed, secured, claimed, or deposited conclusion.
- Rejuvenator effects, Urn effects, mechanic activation, spatial contest/proximity, and macro interpretation remain blocked.

## Validation

- Focused factual-event tests were added.
- JSON/JSONL validation and deterministic rerun are required before commit.
- Replay 005 and bot fixtures 006-008 were not processed or inspected.
`);
}

await main();
