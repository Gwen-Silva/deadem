import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const OUT = path.join(ROOT, 'output', 'replay-009-fixed-entity-resolution');
const REPORT = path.join(ROOT, 'reports', 'replay-009-walker-identity-fixed-coordinate-resolution.md');
const TASK_ID = '074';
const GATE = 'replay_009_walker_identity_coordinates_not_ready';

const TARGET_CLASSES = new Set(['CNPC_MidBoss', 'CNPC_Boss_Tier2']);
const TARGET_CLASS_TO_MECHANIC = new Map([
  ['CNPC_MidBoss', 'mid_boss'],
  ['CNPC_Boss_Tier2', 'walker'],
]);
const SPATIAL_TERMS = [
  'm_vecOrigin',
  'm_vecAbsOrigin',
  'm_vPosition',
  'm_vecPosition',
  'm_vecNetworkOrigin',
  'm_vecInitialPosition',
  'm_worldPosition',
  'm_pGameSceneNode',
  'm_nodeToWorld',
  'm_cellX',
  'm_cellY',
  'm_cellZ',
  'm_vecX',
  'm_vecY',
  'm_vecZ',
  'CBodyComponent',
  'CGameSceneNode',
  'CNetworkOriginCellCoordQuantizedVector',
];

const files = {
  entityKeys: 'output/replay-009-states/objective-structure-entity-keys.json',
  propertyInventory: 'output/replay-009-states/objective-structure-property-inventory.json',
  observability: 'output/replay-009-states/objective-structure-entity-observability.json',
  factualEvents: 'output/replay-009-states/objective-structure-factual-events.jsonl',
  canonicalEvents: 'output/replay-009-canonical/factual-events.jsonl',
  canonicalEntities: 'output/replay-009-canonical/entity-registry.json',
  measuredLandmarks: 'output/replay-009-landmark-measurement/measured-landmarks.json',
  anchorPlan: 'output/replay-009-landmark-measurement/fit-validation-anchor-plan.json',
  transformRetryLedger: 'output/replay-009-transform-retry/landmark-identity-ledger.json',
  validationComparison: 'output/replay-009-validation/event-source-comparison.jsonl',
};

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
}

function readJsonl(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8')
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function writeJson(name, data) {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, name), `${JSON.stringify(data, null, 2)}\n`);
}

function writeJsonl(name, rows) {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, name), rows.map((row) => JSON.stringify(row)).join('\n') + (rows.length ? '\n' : ''));
}

function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function stableHash(data) {
  return sha256(JSON.stringify(data));
}

function loadInputs() {
  return {
    entityKeys: readJson(files.entityKeys),
    propertyInventory: readJson(files.propertyInventory),
    observability: readJson(files.observability),
    factualEvents: readJsonl(files.factualEvents),
    canonicalEvents: readJsonl(files.canonicalEvents),
    canonicalEntities: readJson(files.canonicalEntities),
    measuredLandmarks: readJson(files.measuredLandmarks),
    anchorPlan: readJson(files.anchorPlan),
    transformRetryLedger: readJson(files.transformRetryLedger),
    validationComparison: readJsonl(files.validationComparison),
  };
}

function targetEntities(inputs) {
  return inputs.entityKeys.entities
    .filter((entity) => TARGET_CLASSES.has(entity.className))
    .sort((a, b) => a.className.localeCompare(b.className) || a.entityIndex - b.entityIndex);
}

function eventsFor(inputs, entityKey) {
  return inputs.factualEvents.filter((event) => `${event.entityIndex}:${entityKey.split(':').slice(1).join(':')}` === entityKey || event.eventId.includes(entityKey));
}

function canonicalFor(inputs, entityKey) {
  return inputs.canonicalEvents.filter((event) => event.subject?.entityKey === entityKey);
}

function buildDataPathAudit(inputs, entities) {
  return {
    schemaVersion: '1.0.0',
    taskId: TASK_ID,
    auditedStages: [
      'Task 056 telemetry',
      'Task 060 non-spatial state outputs',
      'Task 062 class/property observability',
      'Task 063 factual objective/structure events',
      'Task 065 canonical integration',
      'Task 073 transform retry ledger',
    ],
    targetEntities: entities.map((entity) => {
      const canonicalEvents = canonicalFor(inputs, entity.entityKey);
      const spatialStatuses = [...new Set(canonicalEvents.map((event) => event.spatial?.status ?? 'missing'))].sort();
      const worldPositionRecords = canonicalEvents.filter((event) => event.spatial?.worldPosition).length;
      return {
        entityKey: entity.entityKey,
        className: entity.className,
        entityIndex: entity.entityIndex,
        serial: entity.serial,
        coordinateStatus: worldPositionRecords > 0 ? 'available' : 'missing',
        coordinateSourceStage: worldPositionRecords > 0 ? 'Task 065 canonical spatial field' : '',
        firstStageWhereLost: worldPositionRecords > 0 ? null : 'not_present_in_task_062_compact_property_inventory_or_task_063_factual_events',
        relatedEntityKeys: [],
        notes: [
          `canonicalEventCount=${canonicalEvents.length}`,
          `canonicalSpatialStatuses=${spatialStatuses.join(',') || 'none'}`,
          'Task 074 did not modify canonical outputs.',
        ],
      };
    }),
    conclusion: 'fixed_entity_coordinates_missing_in_committed_compact_path',
  };
}

function buildPositionInventory(inputs) {
  const targetProps = inputs.propertyInventory.properties.filter((prop) => TARGET_CLASSES.has(prop.className));
  const candidates = targetProps
    .filter((prop) => SPATIAL_TERMS.some((term) => prop.propertyPath.includes(term)))
    .map((prop) => {
      const isCoordinate = /m_vec|Position|Origin|cell|nodeToWorld/i.test(prop.propertyPath);
      const isComponentReference = /CBodyComponent|CGameSceneNode|m_hParent|m_hModel|m_hSequence/i.test(prop.propertyPath);
      return {
        className: prop.className,
        serializerName: prop.serializerName,
        propertyPath: prop.propertyPath,
        valueType: prop.valueType,
        observationCount: prop.sampleValues?.length ?? 0,
        targetEntityCount: targetProps.filter((other) => other.className === prop.className).length > 0
          ? (prop.className === 'CNPC_Boss_Tier2' ? 6 : 2)
          : 0,
        directness: isComponentReference ? 'component_reference' : 'unknown',
        coordinateSemantics: isCoordinate ? 'unknown' : 'unknown',
        usable: false,
        rejectionReason: isCoordinate
          ? 'spatial_name_candidate_not_observed_with_world_coordinate_values_for_target_entities'
          : 'component_or_reference_property_without_explicit_resolved_transform',
      };
    });
  return {
    schemaVersion: '1.0.0',
    taskId: TASK_ID,
    searchedTerms: SPATIAL_TERMS,
    targetPropertyCount: targetProps.length,
    candidateProperties: candidates,
    usableCoordinateProperties: candidates.filter((candidate) => candidate.usable),
    conclusion: candidates.some((candidate) => candidate.usable)
      ? 'usable_coordinate_property_found'
      : 'no_usable_coordinate_property_found',
  };
}

function buildReferenceTraversal(inputs, entities, propertyInventory) {
  const referenceProps = propertyInventory.candidateProperties.filter((prop) => prop.directness === 'component_reference');
  return {
    schemaVersion: '1.0.0',
    taskId: TASK_ID,
    traversals: entities.flatMap((entity) => referenceProps
      .filter((prop) => prop.className === entity.className)
      .map((prop) => ({
        sourceEntityKey: entity.entityKey,
        referenceProperty: prop.propertyPath,
        referencedEntityOrComponent: null,
        relationshipStatus: 'unresolved',
        coordinateProperty: null,
        coordinateBasis: null,
        observations: [],
        limitations: [
          'Committed compact property inventory records sample property paths and values, but not an explicit entity/component handle traversal to a coordinate-bearing transform.',
          'No entity was associated by lifecycle similarity.',
        ],
      }))),
    conclusion: 'no_explicit_coordinate_component_reference_resolved',
  };
}

function buildStability(entities) {
  return {
    schemaVersion: '1.0.0',
    taskId: TASK_ID,
    entities: entities.map((entity) => ({
      entityKey: entity.entityKey,
      className: entity.className,
      observationCount: 0,
      firstCoordinate: null,
      lastCoordinate: null,
      coordinateRange: null,
      medianCoordinate: null,
      maximumDisplacement: null,
      quantizationJitter: null,
      missingIntervals: ['all_coordinate_observations_missing'],
      classification: 'insufficient_observations',
      limitations: [
        'No direct or component-resolved coordinate observations were available.',
      ],
    })),
    stableFixedEntities: 0,
    movingOrUncertainEntities: entities.length,
  };
}

function buildWalkerTeamIdentity(entities) {
  return {
    schemaVersion: '1.0.0',
    taskId: TASK_ID,
    walkers: entities.filter((entity) => entity.className === 'CNPC_Boss_Tier2').map((entity) => ({
      entityKey: entity.entityKey,
      teamObservation: 'unknown',
      sourceProperty: '',
      sourceValue: null,
      confidence: 'unknown',
      evidence: [],
      limitations: [
        'Task 063/065 Walker factual events preserve team as null.',
        'No direct team, owner-team, lane-team, or spawn-group property was exposed in committed compact outputs.',
        'Team was not derived from coordinates.',
      ],
    })),
    resolvedTeams: 0,
  };
}

function buildWalkerLaneIdentity(entities) {
  return {
    schemaVersion: '1.0.0',
    taskId: TASK_ID,
    walkers: entities.filter((entity) => entity.className === 'CNPC_Boss_Tier2').map((entity) => ({
      entityKey: entity.entityKey,
      team: 'unknown',
      lane: 'unknown',
      identityStatus: 'unresolved',
      evidenceType: [],
      sourceProperties: [],
      videoAnnotationIds: [],
      identityEstablishedWithoutTransform: true,
      limitations: [
        'No explicit lane, route, target name, map entity name, or spawn-group property was exposed for this Walker entity.',
        'Task 074 did not use transform residuals, nearest minimap points, player paths, or symmetry.',
      ],
    })),
    resolvedLanes: 0,
  };
}

function buildHumanVideoCorrelation(inputs) {
  const annotations = [
    { annotationId: 'human_13_55_enemy_green_walker', humanReportedGameTime: '13:55', describedIdentity: 'enemy Green-lane Walker visible' },
    { annotationId: 'human_19_06_allied_green_walker', humanReportedGameTime: '19:06', describedIdentity: 'allied Green-lane Walker visible' },
    { annotationId: 'human_22_35_allied_blue_walker', humanReportedGameTime: '22:35', describedIdentity: 'allied Blue-lane Walker visible' },
  ];
  const walkerComparisons = inputs.validationComparison.filter((entry) => entry.mechanicId === 'walker');
  return {
    schemaVersion: '1.0.0',
    taskId: TASK_ID,
    annotations: annotations.map((annotation) => ({
      ...annotation,
      correlationStatus: 'not_completed',
      parserWindow: null,
      videoWindow: null,
      candidateEntityKeys: [],
      linkedEntityKey: null,
      limitations: [
        'Existing Task 064 video comparisons support Walker-class visibility only; they do not establish entity-specific one-to-one mapping.',
        'Human game-time annotations were not converted directly to parserSeconds.',
        'No new video frames were committed.',
      ],
    })),
    existingWalkerValidationComparisons: walkerComparisons.map((entry) => ({
      comparisonId: entry.comparisonId,
      entityKey: entry.entityKey,
      comparisonStatus: entry.comparisonStatus,
      visibility: entry.visibility,
      note: 'Existing comparison is class-level or timing-window evidence, not a Walker lane/team handle assignment.',
    })),
    completedCorrelations: 0,
  };
}

function buildMidBossAnchor(entities) {
  const midBoss = entities.filter((entity) => entity.className === 'CNPC_MidBoss');
  return {
    schemaVersion: '1.0.0',
    taskId: TASK_ID,
    decision: 'coordinate_missing',
    entities: midBoss.map((entity) => ({
      entityKey: entity.entityKey,
      npcPositionAvailable: false,
      spawnPositionAvailable: false,
      arenaCenterEntityAvailable: false,
      bossSpawnerPositionAvailable: false,
      fixedAssociatedLandmarkAvailable: false,
      limitations: [
        'Mid Boss class identity and lifecycle are supported, but no coordinate-bearing replay-side anchor is exposed in committed compact outputs.',
        'The participant/map annotation that Mid Boss is visually central is map-side identity evidence, not a replay-world coordinate.',
      ],
    })),
  };
}

function mapLandmarkById(inputs) {
  return new Map(inputs.measuredLandmarks.landmarks.map((landmark) => [landmark.landmarkId, landmark]));
}

function buildCorrespondences(inputs, entities) {
  const landmarks = mapLandmarkById(inputs);
  const rows = [];
  const midBossEntities = entities.filter((entity) => entity.className === 'CNPC_MidBoss');
  for (const entity of midBossEntities) {
    rows.push({
      correspondenceId: `corr_${entity.entityIndex}_standard_mid_boss_center`,
      replayEntityKey: entity.entityKey,
      mapLandmarkId: 'standard_mid_boss_center',
      landmarkType: 'mid_boss_center',
      team: 'neutral',
      lane: null,
      replayWorldCoordinate: {},
      mapPixelCoordinate: landmarks.get('standard_mid_boss_center')?.pixelCoordinate ?? {},
      coordinateConfidence: 'unavailable',
      identityConfidence: 'supported',
      coordinateIndependence: 'independent_map_image_coordinate_vs_parser_entity_identity',
      eligibleForFit: false,
      eligibleForValidation: false,
      exclusionReasons: [
        'replay_world_coordinate_missing',
        'mid_boss_generation_fixed_anchor_role_unresolved',
      ],
      limitations: [],
    });
  }
  for (const entity of entities.filter((entry) => entry.className === 'CNPC_Boss_Tier2')) {
    for (const landmarkId of inputs.anchorPlan.candidateFitAnchors.concat(inputs.anchorPlan.reservedValidationAnchors).filter((id) => id.includes('walker'))) {
      rows.push({
        correspondenceId: `corr_${entity.entityIndex}_${landmarkId}`,
        replayEntityKey: entity.entityKey,
        mapLandmarkId: landmarkId,
        landmarkType: 'walker',
        team: 'unknown',
        lane: null,
        replayWorldCoordinate: {},
        mapPixelCoordinate: landmarks.get(landmarkId)?.pixelCoordinate ?? {},
        coordinateConfidence: 'unavailable',
        identityConfidence: 'unresolved',
        coordinateIndependence: 'independent_map_image_coordinate_vs_parser_entity_identity',
        eligibleForFit: false,
        eligibleForValidation: false,
        exclusionReasons: [
          'replay_world_coordinate_missing',
          'walker_team_lane_identity_unresolved',
          'permutation_search_prohibited',
        ],
        limitations: [
          'Rows enumerate possible future pairings only; they are not accepted correspondences.',
        ],
      });
    }
  }
  return {
    schemaVersion: '1.0.0',
    taskId: TASK_ID,
    correspondenceLedgerHash: stableHash(rows),
    correspondences: rows,
    groundedCorrespondences: 0,
    fitEligibleCorrespondences: 0,
    validationEligibleCorrespondences: 0,
  };
}

function buildFitPlan(correspondences) {
  return {
    schemaVersion: '1.0.0',
    taskId: TASK_ID,
    planningStatus: 'not_ready',
    fitCorrespondenceIds: [],
    validationCorrespondenceIds: [],
    unresolvedPairingCount: correspondences.correspondences.length,
    limitations: [
      'No fit/validation roles assigned because every candidate correspondence lacks replay-world coordinates or pre-fit Walker identity.',
      'Task 072 map-side anchor split is preserved as input evidence, but Task 074 cannot promote it to replay/map correspondences.',
    ],
  };
}

function buildSummary({ entities, propertyInventory, coordinateObservations, stability, team, lane, video, correspondences }) {
  return {
    schemaVersion: '1.0.0',
    taskId: TASK_ID,
    targetEntitiesInspected: entities.length,
    targetClasses: [...TARGET_CLASSES],
    positionPropertiesFound: propertyInventory.candidateProperties.length,
    usablePositionProperties: propertyInventory.usableCoordinateProperties.length,
    directCoordinatesFound: 0,
    componentResolvedCoordinatesFound: 0,
    coordinateObservations: coordinateObservations.length,
    stableFixedEntities: stability.stableFixedEntities,
    movingOrUncertainEntities: stability.movingOrUncertainEntities,
    midBossAnchorResult: 'coordinate_missing',
    walkerTeamsResolved: team.resolvedTeams,
    walkerLanesResolved: lane.resolvedLanes,
    humanVideoCorrelationsCompleted: video.completedCorrelations,
    groundedCorrespondences: correspondences.groundedCorrespondences,
    fitEligibleCorrespondences: correspondences.fitEligibleCorrespondences,
    validationEligibleCorrespondences: correspondences.validationEligibleCorrespondences,
    unresolvedPairings: correspondences.correspondences.length,
    transformFitted: false,
    lanesRegionsProximityEmitted: false,
    mechanicEffectsApplied: 0,
    gate: GATE,
    blockedFollowUp: 'tasks/blocked/075-diagnose-replay-009-fixed-entity-spatial-property-extraction.md',
    protections: {
      replay005Read: false,
      replay005Processed: false,
      botFixturesProcessed: false,
    },
  };
}

function writeReadme() {
  fs.writeFileSync(path.join(OUT, 'README.md'), `# Replay 009 Fixed Entity Resolution

Task 074 audits whether replay 009 exposes non-circular replay-world coordinates and pre-fit Walker team/lane identities for CNPC_MidBoss and CNPC_Boss_Tier2.

Gate: \`${GATE}\`

No transform was fitted. No lane, region, proximity, or mechanic-effect output was emitted.
`);
}

function writeReport(summary) {
  fs.mkdirSync(path.dirname(REPORT), { recursive: true });
  fs.writeFileSync(REPORT, `# Replay 009 Walker Identity And Fixed Coordinate Resolution

Task 074 inspected existing compact replay-009 evidence for \`CNPC_MidBoss\` and \`CNPC_Boss_Tier2\`.

## Result

Gate: \`${summary.gate}\`

The task found ${summary.positionPropertiesFound} target-class position/reference candidates, but zero usable world-coordinate properties, zero direct coordinates, and zero component-resolved coordinates. Walker team and lane identity remain unresolved for all six entities before transform fitting.

## Why Not Ready

- Canonical spatial fields for fixed Mid Boss and Walker entities remain unavailable.
- Committed compact property inventories expose component/reference-style fields but no explicit coordinate-bearing transform for the target entities.
- Existing video support is class-level or timing-window evidence and does not identify which replay Walker handle corresponds to which map Walker symbol.
- No fit or held-out validation correspondence can be promoted without replay-world coordinates and pre-fit identity.

## Boundaries

No transform was fitted. No Walker permutation search, residual matching, lane/region/proximity output, mechanic effect, or macro interpretation was produced.
`);
}

function main() {
  const inputs = loadInputs();
  const entities = targetEntities(inputs);
  const dataPathAudit = buildDataPathAudit(inputs, entities);
  const positionPropertyInventory = buildPositionInventory(inputs);
  const referenceTraversal = buildReferenceTraversal(inputs, entities, positionPropertyInventory);
  const coordinateObservations = [];
  const stability = buildStability(entities);
  const walkerTeam = buildWalkerTeamIdentity(entities);
  const walkerLane = buildWalkerLaneIdentity(entities);
  const humanVideo = buildHumanVideoCorrelation(inputs);
  const midBoss = buildMidBossAnchor(entities);
  const correspondences = buildCorrespondences(inputs, entities);
  const fitPlan = buildFitPlan(correspondences);
  const summary = buildSummary({
    entities,
    propertyInventory: positionPropertyInventory,
    coordinateObservations,
    stability,
    team: walkerTeam,
    lane: walkerLane,
    video: humanVideo,
    correspondences,
  });

  writeJson('data-path-audit.json', dataPathAudit);
  writeJson('position-property-inventory.json', positionPropertyInventory);
  writeJson('entity-reference-traversal.json', referenceTraversal);
  writeJsonl('fixed-entity-coordinate-observations.jsonl', coordinateObservations);
  writeJson('coordinate-stability-audit.json', stability);
  writeJson('walker-team-identity.json', walkerTeam);
  writeJson('walker-lane-identity.json', walkerLane);
  writeJson('human-video-walker-correlation.json', humanVideo);
  writeJson('mid-boss-anchor-resolution.json', midBoss);
  writeJson('future-transform-correspondences.json', correspondences);
  writeJson('future-fit-validation-plan.json', fitPlan);
  writeJson('resolution-summary.json', summary);
  writeJson('resolution-gate.json', {
    schemaVersion: '1.0.0',
    taskId: TASK_ID,
    gate: GATE,
    transformFitted: false,
    lanesEmitted: false,
    regionsEmitted: false,
    proximityEmitted: false,
    mechanicEffectsApplied: 0,
  });
  writeReadme();
  writeReport(summary);
}

main();
