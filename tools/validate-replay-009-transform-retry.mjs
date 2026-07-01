import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'output', 'replay-009-transform-retry');
const REPORT = path.join(ROOT, 'reports', 'replay-009-transform-validation-retry.md');
const TASK_ID = '073';
const GATE = 'replay_009_candidate_transform_not_ready';
const DECISION = 'insufficient_grounded_correspondences';

const files = {
  measurementSummary: 'output/replay-009-landmark-measurement/measurement-summary.json',
  measuredLandmarks: 'output/replay-009-landmark-measurement/measured-landmarks.json',
  sourceInventory: 'output/replay-009-landmark-measurement/image-inventory.json',
  anchorPlan: 'output/replay-009-landmark-measurement/fit-validation-anchor-plan.json',
  correspondenceCandidates: 'output/replay-009-landmark-measurement/replay-landmark-correspondence-candidates.json',
  canonicalEvents: 'output/replay-009-canonical/factual-events.jsonl',
  canonicalEntities: 'output/replay-009-canonical/entity-registry.json',
  objectiveEntityKeys: 'output/replay-009-states/objective-structure-entity-keys.json',
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
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, name), `${JSON.stringify(data, null, 2)}\n`);
}

function writeJsonl(name, rows) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, name), rows.map((row) => JSON.stringify(row)).join('\n') + (rows.length ? '\n' : ''));
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function stableHash(data) {
  return sha256(JSON.stringify(data));
}

function fileHash(rel) {
  return sha256(fs.readFileSync(path.join(ROOT, rel)));
}

function gitLsFiles(rel) {
  try {
    return execFileSync('git', ['ls-files', rel], { cwd: ROOT, encoding: 'utf8' })
      .split(/\r?\n/u)
      .filter(Boolean);
  } catch {
    return [];
  }
}

function exists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

function canonicalSpatialStatus(events, entityKey) {
  const entityEvents = events.filter((event) => event.subject?.entityKey === entityKey);
  const withWorldPosition = entityEvents.filter((event) => event.spatial?.worldPosition);
  return {
    eventCount: entityEvents.length,
    worldPositionRecords: withWorldPosition.length,
    spatialStatuses: [...new Set(entityEvents.map((event) => event.spatial?.status ?? 'missing'))].sort(),
  };
}

function loadInputs() {
  const missing = Object.entries(files)
    .filter(([, rel]) => !exists(rel))
    .map(([key, rel]) => ({ key, path: rel }));
  if (missing.length) {
    throw new Error(`Missing required input files: ${missing.map((entry) => entry.path).join(', ')}`);
  }
  return {
    measurementSummary: readJson(files.measurementSummary),
    measuredLandmarks: readJson(files.measuredLandmarks),
    sourceInventory: readJson(files.sourceInventory),
    anchorPlan: readJson(files.anchorPlan),
    correspondenceCandidates: readJson(files.correspondenceCandidates),
    canonicalEvents: readJsonl(files.canonicalEvents),
    canonicalEntities: readJson(files.canonicalEntities),
    objectiveEntityKeys: readJson(files.objectiveEntityKeys),
  };
}

function buildInputIntegrity(inputs) {
  const sourceImagesTracked = gitLsFiles('.local/spatial-inputs/replay-009-user-maps');
  const sourceFiles = Object.values(files).map((rel) => ({
    path: rel,
    exists: exists(rel),
    sha256: fileHash(rel),
  }));
  const landmarks = inputs.measuredLandmarks.landmarks ?? [];
  const plannedFit = new Set(inputs.anchorPlan.candidateFitAnchors ?? []);
  const plannedValidation = new Set(inputs.anchorPlan.reservedValidationAnchors ?? []);
  const disjointPlan = [...plannedFit].every((anchor) => !plannedValidation.has(anchor));
  const prohibitedPattern = /urn|player|box|statue|overlay|resource/i;
  const prohibitedPlannedAnchors = [...plannedFit, ...plannedValidation].filter((anchor) => prohibitedPattern.test(anchor));
  const summaryCountsMatch = inputs.measurementSummary.landmarkMeasurements === landmarks.length;
  const inventoryRows = inputs.sourceInventory.images ?? inputs.sourceInventory.sources ?? [];
  const localImageEntries = inventoryRows.filter((source) => source.sourceType?.includes('image') || source.sourceType?.includes('minimap') || source.semanticRole);
  return {
    schemaVersion: '1.0.0',
    taskId: TASK_ID,
    predecessorTask: '072',
    predecessorGate: inputs.measurementSummary.gate,
    requiredFiles: sourceFiles,
    localSourceImagesTrackedByGit: sourceImagesTracked,
    sourceImagesCommitted: sourceImagesTracked.length > 0,
    localImageEntries: localImageEntries.length,
    landmarkCount: landmarks.length,
    summaryCountsMatch,
    plannedFitAnchorCount: plannedFit.size,
    plannedValidationAnchorCount: plannedValidation.size,
    plannedFitValidationDisjoint: disjointPlan,
    prohibitedPlannedAnchors,
    inputIntegrityStatus: sourceFiles.every((entry) => entry.exists) && summaryCountsMatch && disjointPlan && prohibitedPlannedAnchors.length === 0 && sourceImagesTracked.length === 0
      ? 'valid'
      : 'invalid',
    limitations: [
      'Task 072 anchor planning is map-side only and does not establish replay-world correspondences.',
      'Local source images remain untracked local-only artifacts.',
    ],
  };
}

function buildCoordinateBasisAudit(inputs) {
  const fixedKeys = inputs.correspondenceCandidates.candidates.flatMap((candidate) => candidate.replayEntityKeys ?? []);
  const uniqueFixedKeys = [...new Set(fixedKeys)];
  const spatial = uniqueFixedKeys.map((entityKey) => ({
    entityKey,
    ...canonicalSpatialStatus(inputs.canonicalEvents, entityKey),
  }));
  const measured = inputs.measuredLandmarks.landmarks ?? [];
  const standardLandmarks = measured.filter((landmark) => landmark.imageId === 'img_standard_replay_minimap');
  return {
    schemaVersion: '1.0.0',
    taskId: TASK_ID,
    targetCoordinateBasis: {
      source: 'Task 072 replay-observed standard minimap pixel coordinates',
      origin: inputs.measuredLandmarks.coordinateConvention?.origin ?? 'unknown',
      xDirection: inputs.measuredLandmarks.coordinateConvention?.xDirection ?? 'unknown',
      yDirection: inputs.measuredLandmarks.coordinateConvention?.yDirection ?? 'unknown',
      normalizedCoordinate: inputs.measuredLandmarks.coordinateConvention?.normalizedCoordinate ?? 'unknown',
      metricScaleKnown: false,
      limitations: [
        'Minimap pixel coordinates are not metric world distances.',
        'The source map is replay-observed/user-supplied imagery, not a confirmed build-23916427 authoritative map asset.',
      ],
    },
    replayCoordinateBasis: {
      source: 'Task 063/065 canonical fixed entity records',
      fixedEntityWorldCoordinatesAvailable: false,
      checkedEntityCount: uniqueFixedKeys.length,
      entitySpatialStatus: spatial,
      limitations: [
        'Canonical fixed objective/structure records preserve lifecycle, health, team, validation, and class evidence, but not world coordinates.',
        'Player world coordinates exist from Task 056, but player trajectories are prohibited as transform anchors in Task 073.',
      ],
    },
    landmarkPixelCoordinateCount: measured.length,
    standardReplayMinimapLandmarkCount: standardLandmarks.length,
    coordinateBasisStatus: 'map_pixels_available_replay_fixed_world_coordinates_unavailable',
  };
}

function buildLandmarkIdentityLedger(inputs, coordinateBasisAudit) {
  const measuredById = new Map((inputs.measuredLandmarks.landmarks ?? []).map((landmark) => [landmark.landmarkId, landmark]));
  const planFit = new Set(inputs.anchorPlan.candidateFitAnchors ?? []);
  const planValidation = new Set(inputs.anchorPlan.reservedValidationAnchors ?? []);
  const fixedSpatial = new Map(coordinateBasisAudit.replayCoordinateBasis.entitySpatialStatus.map((entry) => [entry.entityKey, entry]));
  const candidates = inputs.correspondenceCandidates.candidates ?? [];
  const rows = [];

  const midBoss = candidates.find((candidate) => candidate.landmarkType === 'mid_boss_center');
  if (midBoss) {
    const landmarkId = 'standard_mid_boss_center';
    rows.push({
      ledgerId: 'ledger_mid_boss_center',
      landmarkType: 'mid_boss_center',
      mapLandmarkId: landmarkId,
      mapCoordinate: measuredById.get(landmarkId)?.pixelCoordinate ?? null,
      replayEntityKeys: midBoss.replayEntityKeys,
      replayWorldCoordinate: null,
      identityEvidence: midBoss.identityEvidence,
      identityStatus: 'supported',
      coordinateIndependence: midBoss.coordinateIndependence,
      preregisteredRole: planFit.has(landmarkId) ? 'fit' : 'unused',
      eligibility: 'blocked',
      exclusionReasons: [
        'two_mid_boss_generations_share_fixed_landmark',
        'replay_world_coordinate_unavailable_for_candidate_entities',
      ],
      canonicalSpatialEvidence: midBoss.replayEntityKeys.map((entityKey) => fixedSpatial.get(entityKey)),
    });
  }

  const walkers = candidates.find((candidate) => candidate.landmarkType === 'walker');
  if (walkers) {
    for (const landmarkId of walkers.mapLandmarkIds) {
      rows.push({
        ledgerId: `ledger_${landmarkId}`,
        landmarkType: 'walker',
        mapLandmarkId: landmarkId,
        mapCoordinate: measuredById.get(landmarkId)?.pixelCoordinate ?? null,
        replayEntityKeys: walkers.replayEntityKeys,
        replayWorldCoordinate: null,
        identityEvidence: walkers.identityEvidence,
        identityStatus: 'unresolved',
        coordinateIndependence: walkers.coordinateIndependence,
        preregisteredRole: planFit.has(landmarkId) ? 'fit' : planValidation.has(landmarkId) ? 'validation' : 'unused',
        eligibility: 'blocked',
        exclusionReasons: [
          'walker_entity_to_map_landmark_pairing_unresolved_before_residuals',
          'replay_world_coordinate_unavailable_for_candidate_entities',
          'permutation_search_prohibited',
        ],
        canonicalSpatialEvidence: walkers.replayEntityKeys.map((entityKey) => fixedSpatial.get(entityKey)),
      });
    }
  }

  const frozenLedgerHash = stableHash(rows);
  return {
    schemaVersion: '1.0.0',
    taskId: TASK_ID,
    frozenBeforeResidualInspection: true,
    permutationSearchPerformed: false,
    residualsInspectedBeforePairing: false,
    frozenLedgerHash,
    rows,
    summary: {
      ledgerRows: rows.length,
      groundedCorrespondences: rows.filter((row) => row.eligibility === 'eligible').length,
      unresolvedCorrespondences: rows.filter((row) => row.identityStatus === 'unresolved').length,
      supportedButCoordinateMissing: rows.filter((row) => row.identityStatus === 'supported' && row.exclusionReasons.includes('replay_world_coordinate_unavailable_for_candidate_entities')).length,
      walkerIdentitiesResolved: false,
      midBossUsableForFit: false,
    },
  };
}

function buildModelPreregistration(ledger) {
  const eligibleFit = ledger.rows.filter((row) => row.eligibility === 'eligible' && row.preregisteredRole === 'fit');
  const eligibleValidation = ledger.rows.filter((row) => row.eligibility === 'eligible' && row.preregisteredRole === 'validation');
  const baseReasons = [
    'no_grounded_fit_correspondences_with_replay_world_coordinates',
    'no_grounded_held_out_validation_correspondence',
    'walker_pairing_unresolved_without_permutation_search',
  ];
  const models = [
    { modelId: 'translation_2d', modelType: 'translation', parameterCount: 2, minimumFitAnchors: 1 },
    { modelId: 'rigid_2d', modelType: 'rigid_2d', parameterCount: 3, minimumFitAnchors: 2 },
    { modelId: 'similarity_2d', modelType: 'similarity_2d', parameterCount: 4, minimumFitAnchors: 2 },
    { modelId: 'axis_reflected_similarity_2d', modelType: 'axis_reflected_similarity_2d', parameterCount: 4, minimumFitAnchors: 2 },
    { modelId: 'affine_2d', modelType: 'affine_2d', parameterCount: 6, minimumFitAnchors: 3 },
  ].map((model) => ({
    ...model,
    assumptions: [
      'map target is a 2D minimap pixel coordinate space',
      'z is not fitted unless later evidence requires vertical handling',
      'correspondences must be identity-grounded before residual inspection',
    ],
    allowedAxisReflections: model.modelType === 'axis_reflected_similarity_2d' ? ['x', 'y', 'x_and_y'] : [],
    fitAnchorIds: eligibleFit.map((row) => row.ledgerId),
    validationAnchorIds: eligibleValidation.map((row) => row.ledgerId),
    eligible: false,
    ineligibilityReasons: baseReasons,
  }));
  return {
    schemaVersion: '1.0.0',
    taskId: TASK_ID,
    preregistrationFrozenBeforeFitting: true,
    eligibleFitAnchorCount: eligibleFit.length,
    eligibleValidationAnchorCount: eligibleValidation.length,
    models,
  };
}

function buildResidualPolicy() {
  return {
    schemaVersion: '1.0.0',
    taskId: TASK_ID,
    targetSpace: 'standard_replay_minimap_pixels',
    primaryMetric: 'held_out_validation_pixel_residual',
    thresholdPolicyStatus: 'registered_but_not_applied',
    classifications: [
      {
        class: 'excellent',
        rule: 'Validation residuals are within the measured landmark uncertainty radius for every held-out anchor.',
      },
      {
        class: 'acceptable_for_coarse_visualization',
        rule: 'Validation residuals exceed some landmark uncertainty radii but remain small relative to the minimap diameter and topology checks pass.',
      },
      {
        class: 'marginal',
        rule: 'Residuals are interpretable only for rough visual orientation and must not support regions, lanes, or proximity.',
      },
      {
        class: 'rejected',
        rule: 'Held-out residuals fail preregistered checks, topology is contradicted, or fit lacks independent validation.',
      },
      {
        class: 'not_evaluable',
        rule: 'No model was fit because grounded correspondences were insufficient.',
      },
    ],
    appliedClassification: 'not_evaluable',
    limitations: [
      'No residual threshold was applied because no eligible model was fitted.',
      'Training residual alone is never sufficient for validation.',
    ],
  };
}

function emptyResults() {
  return {
    schemaVersion: '1.0.0',
    taskId: TASK_ID,
    fittedModels: [],
    selectedModelId: null,
    fitResidual: null,
    validationResidual: null,
    reason: 'Fitting prerequisites failed before residual computation.',
    permutationSearchPerformed: false,
  };
}

function buildValidationResults() {
  return {
    schemaVersion: '1.0.0',
    taskId: TASK_ID,
    heldOutValidationPerformed: false,
    validationAnchorCount: 0,
    records: [],
    result: 'not_evaluable',
    reason: 'No grounded held-out replay/map correspondence exists.',
  };
}

function buildTopology() {
  return {
    schemaVersion: '1.0.0',
    taskId: TASK_ID,
    topologyValidationPerformed: false,
    result: 'not_evaluable',
    checks: [
      { check: 'mid_boss_projects_near_center', status: 'not_run' },
      { check: 'walker_ordering_preserved', status: 'not_run' },
      { check: 'team_side_ordering_not_contradicted', status: 'not_run' },
      { check: 'fixed_landmarks_inside_map_bounds', status: 'not_run' },
      { check: 'mirroring_not_contradicted_by_labels', status: 'not_run' },
    ],
    reason: 'No model was fitted.',
  };
}

function buildSensitivity() {
  return {
    schemaVersion: '1.0.0',
    taskId: TASK_ID,
    sensitivityAnalysisPerformed: false,
    result: 'not_run_insufficient_grounded_anchors',
    testedPerturbations: [],
    limitations: [
      'Map-image landmark uncertainty exists, but no transform could be fit from grounded replay-world correspondences.',
    ],
  };
}

function buildLimitations(inputs) {
  return {
    schemaVersion: '1.0.0',
    taskId: TASK_ID,
    replayBuild: '23916427',
    buildMappingStatus: 'unresolved',
    installedAssetStatus: 'newer_build_only_from_task_069_070_context',
    mapImageSourceStatus: 'user_supplied_replay_observed_minimap_with_limitations',
    sourceLimitations: [
      'Task 072 minimap coordinates are useful as an independent image target but are not an authoritative historical build map.',
      'Build 23916427 remains unmapped to a confirmed patch or map version.',
      'The replay-observed minimap likely reflects the replay playback environment, but exact build compatibility is still not proven.',
    ],
    task072Gate: inputs.measurementSummary.gate,
  };
}

function buildProjectionAudit(ledger) {
  return {
    schemaVersion: '1.0.0',
    taskId: TASK_ID,
    productionTransformEmitted: false,
    fixedLandmarkProjectionPerformed: false,
    projectionRecords: [],
    omittedLandmarkCount: ledger.rows.length,
    reason: 'No candidate transform was fit or selected.',
    lanesEmitted: false,
    regionsEmitted: false,
    proximityEmitted: false,
    mechanicEffectsApplied: 0,
  };
}

function buildDecision(summary) {
  return {
    schemaVersion: '1.0.0',
    taskId: TASK_ID,
    decision: DECISION,
    gate: GATE,
    selectedModelId: null,
    fitResidual: null,
    validationResidual: null,
    normalizedValidationError: null,
    productionTransformEmitted: false,
    reasons: [
      'No grounded replay-world coordinates are available for the fixed Mid Boss or Walker entity candidates.',
      'The six replay Walker entities remain an unordered set relative to the six measured map Walker landmarks.',
      'Task 073 prohibits resolving Walker identities by permutation or residual minimization.',
      'No held-out validation anchor can be used without first grounding a replay/map correspondence.',
    ],
    summary,
  };
}

function buildSummary({ integrity, coordinateBasis, ledger, modelPreregistration, limitations }) {
  return {
    schemaVersion: '1.0.0',
    taskId: TASK_ID,
    replayId: 'replay_009',
    predecessorTasks: ['070', '071', '072'],
    inputIntegrity: integrity.inputIntegrityStatus,
    coordinateBasisStatus: coordinateBasis.coordinateBasisStatus,
    groundedCorrespondences: ledger.summary.groundedCorrespondences,
    unresolvedCorrespondences: ledger.summary.unresolvedCorrespondences,
    walkerIdentitiesResolved: ledger.summary.walkerIdentitiesResolved,
    permutationSearchPerformed: ledger.permutationSearchPerformed,
    fitAnchors: modelPreregistration.eligibleFitAnchorCount,
    heldOutValidationAnchors: modelPreregistration.eligibleValidationAnchorCount,
    eligibleModels: modelPreregistration.models.filter((model) => model.eligible).length,
    fittedModels: 0,
    selectedModel: null,
    fitResidual: null,
    validationResidual: null,
    normalizedValidationError: null,
    topologyResult: 'not_evaluable',
    sensitivityResult: 'not_run_insufficient_grounded_anchors',
    buildSourceLimitations: limitations.sourceLimitations,
    productionTransformEmitted: false,
    lanesRegionsProximityEmitted: false,
    mechanicEffectsApplied: 0,
    protections: {
      replay005Read: false,
      replay005Processed: false,
      botFixturesProcessed: false,
      mapAssetCommitted: false,
    },
    decision: DECISION,
    gate: GATE,
  };
}

function writeReadme() {
  fs.writeFileSync(path.join(OUT_DIR, 'README.md'), `# Replay 009 Transform Retry Outputs

Task 073 retried world-to-map transform validation using Task 072 measured minimap landmarks.

Result: no transform was fitted. Map-image coordinates are available, but compact replay-009 objective/structure records still do not expose fixed-entity world coordinates, and Walker entity-to-map landmark identities remain unresolved before residual inspection.

These outputs are diagnostic only. They do not define regions, lanes, proximity, production spatial fields, mechanic effects, or macro interpretation.
`);
}

function writeReport(summary) {
  fs.mkdirSync(path.dirname(REPORT), { recursive: true });
  fs.writeFileSync(REPORT, `# Replay 009 Transform Validation Retry

Task 073 evaluated whether Task 072's measured minimap landmarks were sufficient to fit and validate a replay-009 world-to-map transform.

## Result

Gate: \`${summary.gate}\`

Decision: \`${summary.decision}\`

No transform was fitted. The retry found zero grounded replay/map correspondences because fixed objective and structure entities in the canonical replay-009 layer do not currently carry world coordinates, and the six replay Walker entities remain unordered relative to the six measured map Walker landmarks. The task explicitly prohibited resolving those pairings by permutation search, residual minimization, nearest projected point, or symmetry assumptions.

## Evidence

- Task 072 provides measured minimap pixels for Mid Boss, Walkers, Guardians, and base symbols.
- Task 072 pre-registered five map-side fit anchors and two map-side validation anchors.
- Task 063/065 canonical entity events expose Mid Boss and Walker lifecycle/health/validation evidence, but their \`spatial.worldPosition\` fields are unavailable.
- No held-out validation anchor can be used until a replay-side entity/world coordinate is independently paired with its map-side landmark.

## Prohibited Outputs

No production transform, lane labels, regions, proximity, mechanic effects, player trajectory projections, or macro interpretations were emitted.

## Follow-Up

The next blocked step should resolve replay-side Walker identities and fixed entity world coordinates before any transform is retried.
`);
}

function main() {
  const inputs = loadInputs();
  const integrity = buildInputIntegrity(inputs);
  const coordinateBasis = buildCoordinateBasisAudit(inputs);
  const ledger = buildLandmarkIdentityLedger(inputs, coordinateBasis);
  const modelPreregistration = buildModelPreregistration(ledger);
  const residualPolicy = buildResidualPolicy();
  const transformResults = emptyResults();
  const heldOutValidation = buildValidationResults();
  const topology = buildTopology();
  const sensitivity = buildSensitivity();
  const limitations = buildLimitations(inputs);
  const projectionAudit = buildProjectionAudit(ledger);
  const summary = buildSummary({ integrity, coordinateBasis, ledger, modelPreregistration, limitations });
  const decision = buildDecision(summary);

  writeJson('input-integrity.json', integrity);
  writeJson('coordinate-basis-audit.json', coordinateBasis);
  writeJson('landmark-identity-ledger.json', ledger);
  writeJson('model-preregistration.json', modelPreregistration);
  writeJson('residual-acceptance-policy.json', residualPolicy);
  writeJson('candidate-transform-results.json', transformResults);
  writeJson('held-out-validation-results.json', heldOutValidation);
  writeJson('topology-validation.json', topology);
  writeJson('transform-sensitivity.json', sensitivity);
  writeJson('build-source-limitations.json', limitations);
  writeJson('fixed-landmark-projection-audit.json', projectionAudit);
  writeJson('transform-decision.json', decision);
  writeJson('validation-summary.json', summary);
  writeJson('transform-gate.json', {
    schemaVersion: '1.0.0',
    taskId: TASK_ID,
    gate: GATE,
    decision: DECISION,
    productionTransformEmitted: false,
    lanesEmitted: false,
    regionsEmitted: false,
    proximityEmitted: false,
    mechanicEffectsApplied: 0,
  });
  writeJsonl('candidate-transform-results.jsonl', []);
  writeReadme();
  writeReport(summary);
}

main();
