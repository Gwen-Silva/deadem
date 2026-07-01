import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const OUT = path.join(ROOT, 'output', 'replay-009-walker-identity');

function readJson(relativePath) {
    return JSON.parse(readFileSync(path.join(ROOT, relativePath), 'utf8'));
}

function readJsonl(relativePath) {
    const fullPath = path.join(ROOT, relativePath);
    const text = readFileSync(fullPath, 'utf8').trim();
    return text ? text.split(/\r?\n/u).map(line => JSON.parse(line)) : [];
}

function writeJson(name, value) {
    writeFileSync(path.join(OUT, name), `${JSON.stringify(value, null, 2)}\n`);
}

function writeText(name, value) {
    writeFileSync(path.join(OUT, name), value);
}

function sha256(value) {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function secondsFromGameTime(value) {
    if (!value) {
        return null;
    }
    const [ minutes, seconds ] = value.split(':').map(Number);
    return (minutes * 60) + seconds;
}

function unique(values) {
    return [ ...new Set(values.filter(value => value !== null && value !== undefined)) ];
}

function summarizeHealth(events) {
    const healthEvents = events.filter(event => event.sourceProperty === 'health_candidate' || /^health_/u.test(event.eventType));
    const values = healthEvents.map(event => event.rawValue).filter(value => Number.isFinite(value));
    return {
        observationCount: healthEvents.length,
        minimum: values.length ? Math.min(...values) : null,
        maximum: values.length ? Math.max(...values) : null,
        uniqueValues: unique(values).slice(0, 12),
        changes: events.filter(event => event.eventType === 'health_changed').length,
        zeroObserved: events.some(event => event.eventType === 'health_zero_observed')
    };
}

function main() {
    mkdirSync(OUT, { recursive: true });

    const targetInventory = readJson('output/replay-009-fixed-coordinate-resolution/target-generation-inventory.json');
    const teamResolution = readJson('output/replay-009-fixed-coordinate-resolution/walker-team-resolution.json');
    const stability = readJson('output/replay-009-fixed-coordinate-resolution/coordinate-stability.json');
    const resolvedCoordinates = readJsonl('output/replay-009-fixed-coordinate-resolution/resolved-coordinate-observations.jsonl');
    const objectiveEvents = readJsonl('output/replay-009-states/objective-structure-factual-events.jsonl');
    const validationComparisons = readJsonl('output/replay-009-validation/event-source-comparison.jsonl');
    const humanEvents = readJson('output/replay-009-human-annotations/event-annotations.json');
    const measurementSummary = readJson('output/replay-009-landmark-measurement/measurement-summary.json');
    const fitPlan = readJson('output/replay-009-landmark-measurement/fit-validation-anchor-plan.json');
    const correspondenceCandidates = readJson('output/replay-009-landmark-measurement/replay-landmark-correspondence-candidates.json');
    const transformLedger = readJson('output/replay-009-transform-retry/landmark-identity-ledger.json');

    const walkers = targetInventory.generations
        .filter(entity => entity.className === 'CNPC_Boss_Tier2')
        .sort((a, b) => a.entityIndex - b.entityIndex);
    const teamByEntity = new Map(teamResolution.walkers.map(walker => [ walker.entityKey, walker ]));
    const stabilityByEntity = new Map(stability.entities.map(entity => [ entity.entityKey, entity ]));
    const eventsByEntity = new Map();
    for (const event of objectiveEvents.filter(event => event.mechanicId === 'walker')) {
        const rows = eventsByEntity.get(event.entityKey) ?? [];
        rows.push(event);
        eventsByEntity.set(event.entityKey, rows);
    }

    const coordinatesByEntity = new Map();
    for (const observation of resolvedCoordinates) {
        const rows = coordinatesByEntity.get(observation.entityKey) ?? [];
        rows.push(observation);
        coordinatesByEntity.set(observation.entityKey, rows);
    }

    const walkerGenerationLedger = {
        schemaVersion: '1.0.0',
        taskId: '077',
        sourceTask: '076',
        replayId: 'replay_009',
        walkerGenerationCount: walkers.length,
        generations: walkers.map(walker => {
            const entityEvents = eventsByEntity.get(walker.entityKey) ?? [];
            const coordinateRows = coordinatesByEntity.get(walker.entityKey) ?? [];
            const team = teamByEntity.get(walker.entityKey);
            const stable = stabilityByEntity.get(walker.entityKey);
            return {
                entityKey: walker.entityKey,
                entityIndex: walker.entityIndex,
                serial: walker.serial,
                classId: 713,
                className: walker.className,
                createTick: walker.createTick,
                firstObservedTick: walker.firstObservedTick,
                lastObservedTick: walker.lastObservedTick,
                deletionTick: entityEvents.find(event => event.eventType === 'entity_deleted')?.demoTick ?? null,
                rawTeamValue: team?.rawTeamValue ?? null,
                namedTeam: null,
                lane: null,
                coordinateObservationCount: coordinateRows.length,
                coordinateStatus: stable?.classification ?? 'unresolved',
                eventCount: entityEvents.length,
                directIdentityFields: [
                    team?.sourceProperty ? team.sourceProperty : null,
                    ...entityEvents.filter(event => event.sourceProperty === 'raw_state_candidate').map(event => event.sourceProperty)
                ].filter(Boolean),
                identityStatus: 'unresolved',
                limitations: [
                    'Raw team value is preserved but not mapped to Sapphire/Amber.',
                    'Lane identity is not established by direct parser, map-resource, or uniquely linked video evidence.',
                    'No coordinate-derived team or lane identity is used.'
                ]
            };
        })
    };

    const rawTeamValues = unique(teamResolution.walkers.map(walker => walker.rawTeamValue)).sort((a, b) => a - b);
    const teamValueDecoding = {
        schemaVersion: '1.0.0',
        taskId: '077',
        rawTeamValuesFound: rawTeamValues,
        rawTeamValueCount: rawTeamValues.length,
        walkerRawTeamValuesResolved: teamResolution.rawTeamValuesResolved,
        namedTeamMappings: rawTeamValues.map(rawValue => ({
            rawValue,
            namedTeam: 'unknown',
            status: 'unresolved',
            evidence: [
                `Task 076 observed m_iTeamNum/raw team value ${rawValue} on Walker entities.`
            ],
            limitations: [
                'No non-spatial control in the permitted evidence maps this raw value to Sapphire/Archmother or Amber/Hidden King.',
                'Coordinate orientation and map-side position were not used.'
            ]
        })),
        sapphireResolved: 0,
        amberResolved: 0,
        controlsUsed: [
            'Task 076 walker-team-resolution raw m_iTeamNum values',
            'Task 071 participant orientation annotation, advisory only and not direct parser mapping'
        ],
        result: 'raw_team_values_supported_named_team_mapping_unresolved'
    };

    const directIdentityFieldInventory = [];
    for (const walker of walkers) {
        const team = teamByEntity.get(walker.entityKey);
        if (team) {
            directIdentityFieldInventory.push({
                entityKey: walker.entityKey,
                propertyPath: team.sourceProperty,
                rawValue: team.rawTeamValue,
                normalizedValue: null,
                identityDimension: 'team',
                directness: 'direct',
                usable: false,
                reason: 'Raw team value is direct, but named team mapping is unresolved.',
                limitations: [ 'No Sapphire/Amber mapping was established without coordinates.' ]
            });
        }
        const entityEvents = eventsByEntity.get(walker.entityKey) ?? [];
        for (const [ index, event ] of entityEvents.filter(row => row.sourceProperty === 'raw_state_candidate').entries()) {
            directIdentityFieldInventory.push({
                entityKey: walker.entityKey,
                propertyPath: `${event.sourceProperty}[${index}]`,
                rawValue: event.rawValue,
                normalizedValue: null,
                identityDimension: 'unknown',
                directness: 'unknown',
                usable: false,
                reason: 'Raw state values are preserved without semantic mapping.',
                limitations: [ 'Do not infer lane, spawn, route, or team identity from raw state ordering.' ]
            });
        }
    }

    const mapResourceIdentityLinks = transformLedger.rows
        .filter(row => row.landmarkType === 'walker')
        .map(row => ({
            replayEntityKey: null,
            replayIdentityValue: 'six_unordered_CNPC_Boss_Tier2_entities',
            mapResourceReference: row.mapLandmarkId,
            mapIdentityValue: row.mapLandmarkId,
            linkType: 'candidate',
            team: row.mapLandmarkId.includes('sapphire') ? 'sapphire' : row.mapLandmarkId.includes('amber') ? 'amber' : 'unknown',
            lane: row.mapLandmarkId.includes('yellow') ? 'yellow' : row.mapLandmarkId.includes('blue') ? 'blue' : row.mapLandmarkId.includes('green') ? 'green' : 'unknown',
            status: 'candidate',
            limitations: [
                'Map-side Walker symbol is measured, but no individual replay Walker handle is linked before residual inspection.',
                'No VPK/map-resource identity key or targetname joins this map landmark to a replay entity.'
            ]
        }));

    const walkerHumanAnnotations = humanEvents.events.filter(event => /walker/i.test(event.eventType));
    const videoWalkerIdentityCorrelations = walkerHumanAnnotations.map(annotation => {
        const reportedSeconds = secondsFromGameTime(annotation.humanReportedGameTime);
        const matchingValidation = validationComparisons.filter(row => row.mechanicId === 'walker');
        return {
            annotationId: annotation.annotationEventId,
            gameTime: annotation.humanReportedGameTime,
            videoWindow: {
                source: 'human_reported_game_time_not_direct_video_seconds',
                centerSeconds: null,
                uncertaintySeconds: 22.782,
                status: 'not_resolved_to_new_video_window'
            },
            parserWindow: {
                centerParserSeconds: reportedSeconds,
                status: 'not_directly_converted',
                limitation: 'Human-reported game time is not parserSeconds; parser/video offset remains bounded but not exact for these annotations.'
            },
            visibleTeam: annotation.eventType.includes('allied') ? 'sapphire' : annotation.eventType.includes('enemy') ? 'amber' : 'unknown',
            visibleLane: annotation.eventType.includes('green') ? 'green' : annotation.eventType.includes('blue') ? 'blue' : annotation.eventType.includes('yellow') ? 'yellow' : 'unknown',
            activeWalkerEntityKeys: walkers.map(walker => walker.entityKey),
            distinguishingSignals: [],
            linkedEntityKey: null,
            correlationStatus: 'set_level_only',
            independence: 'independent_rendering_same_match',
            evidence: matchingValidation.slice(0, 2).map(row => ({
                comparisonId: row.comparisonId,
                status: row.comparisonStatus,
                note: 'Existing committed validation supports Walker class/set visibility but not a unique handle.'
            })),
            limitations: [
                'No new video inspection was performed in this task.',
                'Existing validation metadata gives class/set-level Walker support only.',
                'The visible lane/team from participant annotation is not enough to select one replay entity handle.'
            ]
        };
    });

    const walkerIdentityFingerprints = {
        schemaVersion: '1.0.0',
        taskId: '077',
        fingerprints: walkers.map(walker => {
            const entityEvents = eventsByEntity.get(walker.entityKey) ?? [];
            const team = teamByEntity.get(walker.entityKey);
            const stable = stabilityByEntity.get(walker.entityKey);
            const coordinates = coordinatesByEntity.get(walker.entityKey) ?? [];
            return {
                entityKey: walker.entityKey,
                className: walker.className,
                createTick: walker.createTick,
                deleteTick: entityEvents.find(event => event.eventType === 'entity_deleted')?.demoTick ?? null,
                terminalSequence: entityEvents.some(event => event.eventType === 'entity_deleted') ? 'deleted_without_observed_zero' : 'present_until_replay_end',
                health: summarizeHealth(entityEvents),
                rawTeamValue: team?.rawTeamValue ?? null,
                namedTeam: null,
                coordinateAvailability: {
                    observationCount: coordinates.length,
                    coordinateStatus: stable?.classification ?? 'unresolved',
                    representativeCoordinate: stable?.representativeCoordinate ?? null,
                    coordinateUsedForIdentity: false
                },
                directIdentityMetadata: directIdentityFieldInventory
                    .filter(row => row.entityKey === walker.entityKey && row.usable)
                    .map(row => row.propertyPath),
                distinguishingPower: 'insufficient_for_named_team_lane_or_map_symbol',
                limitations: [
                    'Lifecycle/health/raw-state fingerprints distinguish some handles temporally but do not map them to named Walker symbols.',
                    'Deletion is not interpreted as destruction.'
                ]
            };
        })
    };

    const walkerIdentityDecisions = {
        schemaVersion: '1.0.0',
        taskId: '077',
        decisions: walkers.map(walker => {
            const coordinateReady = (coordinatesByEntity.get(walker.entityKey) ?? []).length > 0;
            const rawTeam = teamByEntity.get(walker.entityKey)?.rawTeamValue ?? null;
            return {
                entityKey: walker.entityKey,
                team: 'unknown',
                rawTeamValue: rawTeam,
                lane: 'unknown',
                mapLandmarkId: null,
                teamStatus: 'unresolved',
                laneStatus: 'unresolved',
                mapCorrespondenceStatus: 'unresolved',
                teamEvidence: rawTeam === null ? [] : [ `raw m_iTeamNum/team value ${rawTeam} observed` ],
                laneEvidence: [],
                mapCorrespondenceEvidence: [],
                coordinateReady,
                identityEstablishedWithoutCoordinates: false,
                identityEstablishedBeforeResiduals: false,
                limitations: [
                    'Raw team value remains unmapped to Sapphire/Amber.',
                    'No direct parser lane/route/spawn/name metadata was found.',
                    'No unique video-to-handle correlation exists.',
                    'No map correspondence is eligible before residual inspection.'
                ]
            };
        })
    };

    const mapWalkerIds = transformLedger.rows.filter(row => row.landmarkType === 'walker').map(row => row.mapLandmarkId);
    const correspondenceReadiness = {
        schemaVersion: '1.0.0',
        taskId: '077',
        rows: walkers.flatMap(walker => mapWalkerIds.map(mapLandmarkId => {
            const coordinateReady = (coordinatesByEntity.get(walker.entityKey) ?? []).length > 0;
            return {
                replayEntityKey: walker.entityKey,
                mapLandmarkId,
                teamReady: false,
                laneReady: false,
                coordinateReady,
                identityGroundedBeforeFit: false,
                eligibleForFit: false,
                eligibleForValidation: false,
                exclusionReasons: [
                    'named_team_unresolved',
                    'lane_identity_unresolved',
                    coordinateReady ? null : 'replay_coordinate_unavailable',
                    'map_symbol_pairing_unresolved_before_residuals'
                ].filter(Boolean),
                limitations: [ 'No residuals computed; no permutation search performed.' ]
            };
        })),
        summary: {
            potentialRows: walkers.length * mapWalkerIds.length,
            coordinateReadyWalkers: walkers.filter(walker => (coordinatesByEntity.get(walker.entityKey) ?? []).length > 0).length,
            fitEligibleCorrespondences: 0,
            validationEligibleCorrespondences: 0
        }
    };

    const futureTransformAnchorPlan = {
        schemaVersion: '1.0.0',
        taskId: '077',
        planningStatus: 'not_ready_identity_insufficient',
        sourceTask072Plan: {
            candidateFitAnchors: fitPlan.candidateFitAnchors,
            reservedValidationAnchors: fitPlan.reservedValidationAnchors,
            mapSideDistribution: fitPlan.distribution
        },
        fitCorrespondenceIds: [],
        validationCorrespondenceIds: [],
        frozenSplitCreated: false,
        reasons: [
            'No Walker has a named team and lane identity before residual inspection.',
            'Only two Walker generations currently have replay-side coordinates.',
            'No correspondence can be reserved as held-out validation because map-symbol pairing remains unresolved.'
        ],
        transformFitted: false,
        residualsComputed: false,
        permutationSearchPerformed: false
    };

    const identitySummary = {
        schemaVersion: '1.0.0',
        taskId: '077',
        gate: 'replay_009_walker_identity_not_ready',
        walkerGenerationsInspected: walkers.length,
        rawTeamValuesFound: teamResolution.rawTeamValuesResolved,
        rawTeamValuesMappedToNamedTeams: 0,
        sapphireWalkersResolved: 0,
        amberWalkersResolved: 0,
        directLaneFieldsFound: 0,
        videoAnnotationsEvaluated: walkerHumanAnnotations.length,
        uniqueVideoToHandleCorrelations: 0,
        classOrSetLevelCorrelations: videoWalkerIdentityCorrelations.filter(row => row.correlationStatus === 'set_level_only').length,
        finalLaneIdentitiesResolved: 0,
        mapSideCorrespondencesResolved: 0,
        coordinateReadyWalkers: correspondenceReadiness.summary.coordinateReadyWalkers,
        fitEligibleCorrespondences: 0,
        validationEligibleCorrespondences: 0,
        unresolvedIdentities: walkers.length,
        permutationOrResidualSearchPerformed: false,
        transformFitted: false,
        lanesRegionsProximityEmitted: false,
        mechanicEffectsApplied: 0,
        predecessorGates: {
            task076: 'replay_009_fixed_entity_coordinates_ready_with_gaps',
            task072: measurementSummary.gate
        },
        sourceHashes: {
            walkerGenerationLedger: sha256(walkerGenerationLedger),
            teamValueDecoding: sha256(teamValueDecoding),
            directIdentityFieldInventory: sha256(directIdentityFieldInventory),
            mapResourceIdentityLinks: sha256(mapResourceIdentityLinks),
            videoWalkerIdentityCorrelations: sha256(videoWalkerIdentityCorrelations),
            walkerIdentityFingerprints: sha256(walkerIdentityFingerprints),
            walkerIdentityDecisions: sha256(walkerIdentityDecisions),
            correspondenceReadiness: sha256(correspondenceReadiness),
            futureTransformAnchorPlan: sha256(futureTransformAnchorPlan)
        },
        highestImpactGap: 'no direct non-coordinate evidence maps individual CNPC_Boss_Tier2 handles to named Walker landmarks',
        blockedFollowUp: 'tasks/blocked/078-acquire-replay-009-walker-lane-identity-evidence.md'
    };

    const identityGate = {
        schemaVersion: '1.0.0',
        taskId: '077',
        gate: identitySummary.gate,
        decision: 'identity_not_ready_for_transform_retry',
        reason: identitySummary.highestImpactGap,
        transformRetryAllowed: false,
        canonicalSpatialUpdateAllowed: false,
        mechanicEffectsApplied: 0
    };

    writeJson('walker-generation-ledger.json', walkerGenerationLedger);
    writeJson('team-value-decoding.json', teamValueDecoding);
    writeJson('direct-identity-field-inventory.json', directIdentityFieldInventory);
    writeJson('map-resource-identity-links.json', mapResourceIdentityLinks);
    writeJson('video-walker-identity-correlations.json', videoWalkerIdentityCorrelations);
    writeJson('walker-identity-fingerprints.json', walkerIdentityFingerprints);
    writeJson('walker-identity-decisions.json', walkerIdentityDecisions);
    writeJson('correspondence-readiness.json', correspondenceReadiness);
    writeJson('future-transform-anchor-plan.json', futureTransformAnchorPlan);
    writeJson('identity-summary.json', identitySummary);
    writeJson('identity-gate.json', identityGate);
    writeText('README.md', `# Replay 009 Walker Identity Resolution\n\nTask 077 attempts to resolve individual \`CNPC_Boss_Tier2\` Walker identities before any transform retry.\n\nGate: \`${identitySummary.gate}\`\n\nThe task preserves six Walker generations, six raw team values, and two coordinate-ready late Walker generations. It does not map raw team values to Sapphire/Amber, does not assign Yellow/Blue/Green lane identities, and does not create fit or validation correspondences.\n\nNo transform, lane, region, proximity, canonical spatial field, mechanic effect, or macro interpretation is emitted.\n`);

    const report = `# Replay 009 Walker Identity Resolution\n\nTask: \`077-resolve-replay-009-walker-identity-before-transform-retry\`\n\nGate: \`${identitySummary.gate}\`\n\n## Summary\n\nTask 077 inspected the six replay-009 \`CNPC_Boss_Tier2\` Walker generations using Task 076 coordinates/team evidence, Task 072 map-side Walker labels, Task 073 frozen ledger rows, Task 063 factual events, Task 064 committed visual-comparison metadata, and Task 071 participant annotations.\n\nThe result is intentionally conservative: raw team values are present for all six Walkers, but no permitted source maps raw values \`2\` and \`3\` to named Sapphire/Amber teams without coordinate orientation. No direct parser field exposes lane/route/spawn/name identity. Existing video evidence supports Walker class/set visibility, but it does not uniquely link a visible lane Walker to an entity handle.\n\n## Results\n\n- Walker generations inspected: ${identitySummary.walkerGenerationsInspected}\n- Raw team values found: ${identitySummary.rawTeamValuesFound}\n- Raw team values mapped to named teams: ${identitySummary.rawTeamValuesMappedToNamedTeams}\n- Direct lane fields found: ${identitySummary.directLaneFieldsFound}\n- Video annotations evaluated: ${identitySummary.videoAnnotationsEvaluated}\n- Unique video-to-handle correlations: ${identitySummary.uniqueVideoToHandleCorrelations}\n- Class/set-level correlations: ${identitySummary.classOrSetLevelCorrelations}\n- Coordinate-ready Walkers: ${identitySummary.coordinateReadyWalkers}\n- Fit-eligible correspondences: ${identitySummary.fitEligibleCorrespondences}\n- Validation-eligible correspondences: ${identitySummary.validationEligibleCorrespondences}\n\n## Limits\n\nNo permutation search, residual minimization, transform fitting, lane/region/proximity output, production canonical spatial field, mechanic effect, or macro interpretation was produced. Replay 005 and bot fixtures 006-008 were not read or processed.\n\n## Next Blocker\n\nThe highest-impact gap is direct non-coordinate identity evidence for individual Walker handles. A blocked follow-up should request the smallest missing evidence: direct parser/map metadata or uniquely correlated video evidence that maps at least some Walker handles to named team/lane landmarks before residual inspection.\n`;
    writeFileSync(path.join(ROOT, 'reports', 'replay-009-walker-identity-resolution.md'), report);
    writeFileSync(path.join(ROOT, 'reports', 'latest.md'), `# Latest Report\n\n- [Replay 009 Walker Identity Resolution](replay-009-walker-identity-resolution.md)\n`);
}

main();
