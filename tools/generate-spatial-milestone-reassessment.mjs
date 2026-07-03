import fs from "node:fs";
import path from "node:path";

const outDir = "output/spatial-milestone-reassessment";
fs.mkdirSync(outDir, { recursive: true });

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const writeJson = (file, value) => {
  fs.writeFileSync(path.join(outDir, file), `${JSON.stringify(value, null, 2)}\n`);
};

const parserMatrix = readJson("output/parser-compatibility/parser-compatibility-matrix.json");
const matchState = readJson("output/replays/multi-replay-match-state-comparison.json");
const spatial = readJson("output/replays/one-second-spatial-comparison.json");
const objective = readJson("output/replays/multi-replay-objective-lifecycle-comparison.json");
const task079 = readJson("output/replay-009-walker-lane-controlled-evidence/summary.json");
const priorDecision = readJson("output/project-milestone-analysis/milestone-decision.json");

const fixtureIds = ["replay_001", "replay_002", "replay_003", "replay_004"];
const fixtureNumber = (id) => id.replace("replay_", "");
const parserRows = new Map(parserMatrix.rows.map((row) => [row.replayId, row]));
const matchRows = new Map(matchState.replays.map((row) => [row.replayId, row]));
const spatialRows = new Map(spatial.replays.map((row) => [row.replayId, row]));
const objectiveRows = new Map(objective.replays.map((row) => [row.replayId, row]));

const currentState = {
  schemaVersion: 1,
  validatedCapabilities: [
    "normal human replay parser completion for fixtures 001-004 and 009",
    "structural replay completion checks",
    "replay-009 canonical factual state with provenance",
    "replay-009 inspector and factual export workflows",
    "multi-replay match-state timelines for fixtures 001-004",
    "multi-replay objective lifecycle evidence for fixtures 001-004",
    "one-second coordinate extraction for fixtures 001-004",
  ],
  partialCapabilities: [
    "replay-009 fixed entity coordinates for two late Walker generations",
    "replay-009 Walker named faction mapping",
    "replay-009 objective/structure factual events with gaps",
    "versioned mechanics knowledge with unresolved build mapping",
  ],
  blockedCapabilities: [
    "replay-009 world-to-map transform",
    "replay-009 lane/map-landmark Walker identity",
    "generic regions, lanes, objective proximity, rotations, pressure, macro interpretation",
    "mechanic activation and mechanic effects for build 23916427",
  ],
  exhaustedEvidencePaths: [
    "Tasks 077-079 Walker identity and lane-only evidence search",
    "local video contact sheets around participant Walker annotations",
    "existing independent-validation frames",
    "current compact parser fields for exact Walker lane identity",
    "available map-resource metadata without coordinate-bearing joins",
    "custom-match transferability without replay-specific handle identity",
  ],
  newEvidenceRequiredToResumeSpatialWork: [
    "compatible original replay client/build with handle-visible or lane-specific debug evidence",
    "decoded exact replay handle-to-map entity identifier",
    "new debug capture exposing unique Walker handle and lane relation",
    "identity-bearing entity-lump metadata joined exactly to replay entities",
    "independent fixed anchor set that avoids Walker lane ambiguity",
  ],
  protectedAssets: [
    "replay 005 final holdout",
    "unsupported bot fixtures 006-008",
    "local-only map images and video frames",
  ],
  currentPrimaryReplay: "009",
};

const replay009SpatialContinuation = {
  schemaVersion: 1,
  classification: "exhausted_under_current_sources",
  redundantWithTasks: ["077", "078", "079"],
  checks: [
    {
      input: "identity-bearing map data newly available after Task 079",
      status: "not_available",
      evidence: "Task 079 found zero exact replay/map identity joins and zero named map landmarks.",
    },
    {
      input: "compatible replay-client build",
      status: "not_available",
      evidence: "Task 079 found no compatible in-client review path suitable for handle/lane identity.",
    },
    {
      input: "exact handle-to-map identifier source",
      status: "not_available",
      evidence: "Task 079 exactReplayMapIdentityJoins = 0.",
    },
    {
      input: "new video/debug capture",
      status: "not_available",
      evidence: "Three bounded video windows were inspected; uniqueVideoToHandleLinks = 0.",
    },
    {
      input: "new parser field not already covered",
      status: "not_available",
      evidence: "Task 079 parser/resource audit found no lane-only identity field.",
    },
    {
      input: "independent fixed anchor not dependent on Walker identity",
      status: "not_available",
      evidence: "Task 070 extracted zero map landmarks; Task 073 had zero fit/validation correspondences.",
    },
  ],
  decision: "do_not_continue_immediate_replay_009_transform_work",
  rationale: [
    "Current replay-009 transform work would repeat the same identity boundary.",
    "Residual, permutation, coordinate-sign, and nearest-landmark shortcuts remain forbidden.",
    "No non-redundant executable input is present.",
  ],
};

const fixtureAssessments = fixtureIds.map((fixture) => {
  const parser = parserRows.get(fixture);
  const match = matchRows.get(fixture);
  const spatialRow = spatialRows.get(fixture);
  const objectiveRow = objectiveRows.get(fixture);
  const isPreferred = fixture === "replay_002";
  return {
    fixture: fixtureNumber(fixture),
    structurallyCompatible: Boolean(parser?.modes?.default_parser?.completed),
    telemetryValidationStatus: "compatible_controls_with_existing_match_state_outputs_not_fully_task056_validated",
    canonicalOutputExists: false,
    knownBuild: parser?.metadata?.gameBuild ?? null,
    candidateAsNextReplay: isPreferred,
    selectionReasons: isPreferred
      ? [
          "shortest non-holdout compatible normal control among 001-004",
          "parser completed under default mode",
          "12-player match-state range is stable",
          "one-second coordinate rows have 100 percent direct presence",
          "objective lifecycle evidence has zero validation errors",
          "role is generalization_or_diagnostic rather than development baseline",
        ]
      : [
          "compatible human control",
          "existing factual outputs available",
          fixture === "replay_001" ? "longest development fixture, less ideal as first external canonical case" : "usable later after the first bounded generalization case",
        ],
    risks: [
      "not yet normalized into replay-009 canonical factual schema",
      "build metadata remains unavailable",
      "must audit replay-009-specific assumptions before integration",
      "existing spatial/lane artifacts must not be treated as semantic lane occupancy",
    ],
    requiredPreparation: [
      "validate telemetry and identity in the target replay",
      "map existing match-state/objective/death/economy evidence into canonical schema",
      "compare schema against replay 009",
      "preserve replay 005 and exclude bot fixtures",
    ],
    evidence: {
      parserDurationSeconds: parser?.durationSeconds ?? null,
      parserTelemetryRows: parser?.modes?.default_parser?.telemetryRows ?? null,
      matchStateRows: match?.rows ?? null,
      playerCountRange: match?.playerCountRange ?? null,
      oneSecondCoordinateRows: spatialRow?.rows ?? null,
      directCoordinatePercent: spatialRow?.directPercent ?? null,
      objectiveStableCount: objectiveRow?.stableObjectiveCount ?? null,
      objectiveValidationErrors: objectiveRow?.validationErrors ?? null,
    },
  };
});

const crossReplay = {
  schemaVersion: 1,
  assessmentType: "existing-output-assessment_no_replay_processing",
  fixtures: fixtureAssessments,
  preferredNextReplay: "002",
  readiness: "ready_as_bounded_next_case_with_validation_required",
  rationale: [
    "Replays 001-004 already parse and have comparable factual outputs.",
    "Replay 002 is the smallest non-holdout generalization fixture with existing match-state, coordinate, death/respawn, and objective evidence.",
    "The work improves schema stability and holdout readiness without requiring the blocked replay-009 spatial identity layer.",
  ],
};

const mapTooling = {
  schemaVersion: 1,
  recommendedStatus: "parallel",
  concreteProofTargets: [
    "decode compiled entity lump or equivalent map entity metadata",
    "prove whether targetname/hammer ID/team/lane fields exist for Walker entities",
    "map exact resource identifiers to replay fields without coordinate residuals",
  ],
  availableInputs: [
    "local installed dl_midtown.vpk metadata",
    "Task 070 bounded map-resource inventory",
    "Task 079 map-resource tooling availability audit",
  ],
  missingInputs: [
    "working, validated Source 2 entity-lump decoder for this map package",
    "evidence that decoded metadata contains replay-joinable identifiers",
  ],
  expectedDownstreamImpact: [
    "may unblock replay-009 transform if exact Walker/map identity metadata exists",
    "may improve future map-version registry",
  ],
  stopConditions: [
    "tool only repeats broad asset listing",
    "decoded fields cannot join to replay handles or entity generations",
    "licensing or local-only constraints prevent compact derived metadata",
  ],
};

const comparison = {
  schemaVersion: 1,
  directions: [
    {
      direction: "continue_replay_009_spatial_work_immediately",
      executableNow: "blocked",
      evidenceAvailability: "low",
      downstreamUnlocks: "high_if_unblocked",
      generalizationValue: "low",
      holdoutPreparation: "low",
      circularityRisk: "high",
      replayOverfittingRisk: "high",
      implementationEffort: "research",
      expectedValidatedOutput: "low_under_current_sources",
      usefulnessForFutureMl: "medium_if_unblocked",
      decision: "parked",
    },
    {
      direction: "cross_replay_canonical_generalization",
      executableNow: "high",
      evidenceAvailability: "high",
      downstreamUnlocks: "medium",
      generalizationValue: "very_high",
      holdoutPreparation: "high",
      circularityRisk: "low",
      replayOverfittingRisk: "low",
      implementationEffort: "moderate",
      expectedValidatedOutput: "high",
      usefulnessForFutureMl: "high",
      decision: "selected_primary",
    },
    {
      direction: "map_resource_extraction_tooling",
      executableNow: "medium",
      evidenceAvailability: "medium",
      downstreamUnlocks: "high_if_exact_metadata_exists",
      generalizationValue: "medium",
      holdoutPreparation: "medium",
      circularityRisk: "low_if_exact_identifiers_only",
      replayOverfittingRisk: "medium",
      implementationEffort: "research",
      expectedValidatedOutput: "uncertain",
      usefulnessForFutureMl: "medium",
      decision: "parallel_optional_research",
    },
    {
      direction: "pause_until_new_source",
      executableNow: "blocked",
      evidenceAvailability: "blocked",
      downstreamUnlocks: "low",
      generalizationValue: "low",
      holdoutPreparation: "low",
      circularityRisk: "low",
      replayOverfittingRisk: "low",
      implementationEffort: "none",
      expectedValidatedOutput: "none",
      usefulnessForFutureMl: "low",
      decision: "not_selected",
    },
  ],
};

const milestoneDecision = {
  schemaVersion: 1,
  primaryMilestone: "cross_replay_canonical_generalization",
  decision: "pause_replay_009_transform_work_and_generalize_canonical_factual_state_to_one_control_replay",
  rationale: [
    "Task 079 exhausted currently permitted replay-009 lane-only identity evidence.",
    "Cross-replay canonical generalization is executable now from compatible human controls 001-004.",
    "The work directly improves schema stability, replay-009 overfitting resistance, future dataset readiness, and replay-005 holdout readiness.",
    "It preserves the spatial foundation as strategically important while refusing circular transform shortcuts.",
  ],
  pausedTracks: [
    {
      track: "replay_009_world_to_map_transform",
      status: "paused_waiting_for_genuinely_new_identity_evidence",
    },
  ],
  parallelTracks: [
    {
      track: "map_resource_extraction_tooling",
      status: "optional_parallel_research_only_with_exact_identifier_proof_target",
    },
  ],
  resumeConditions: {
    replay_009_spatial: [
      "compatible original replay client/build becomes available",
      "exact replay handle-to-map entity identifier is decoded",
      "new debug capture exposes a unique Walker handle/lane relation",
      "identity-bearing entity-lump metadata is extracted and joined exactly",
      "different independently identified fixed landmarks provide sufficient fit/validation anchors",
    ],
  },
  forbiddenNextActions: [
    "repeat Tasks 077-079 without new replay-compatible evidence",
    "fit transforms from coordinate ordering, symmetry, nearest landmark, or permutation search",
    "use residual quality to select Walker identity",
    "infer lane, region, proximity, mechanics, fights, rotations, pressure, or macro conclusions",
    "process replay 005 or bot fixtures 006-008",
  ],
  nextExecutableTask: {
    taskType: "blocked_follow_up",
    scope: "generalize canonical factual state to one compatible human replay",
    preferredFixture: "002",
  },
};

const spatialResume = {
  schemaVersion: 1,
  note: "New minimap screenshots alone are insufficient unless they provide replay-handle identity.",
  conditions: [
    {
      conditionId: "compatible_replay_client_build",
      requiredEvidence: "Original or compatible client opens replay 009 and exposes handle/lane/object debug data.",
      whyItIsNew: "Tasks 077-079 did not have a compatible handle-visible client path.",
      whyItIsNonCircular: "Lane identity would be read directly from the client/debug source, not selected by fit residuals.",
      minimumAcceptanceEvidence: ["client/build provenance", "captured handle or equivalent replay entity identifier", "lane/map landmark label"],
      taskThatWouldBecomeExecutable: "retry replay-009 transform validation with preregistered correspondences",
    },
    {
      conditionId: "exact_replay_to_map_identifier",
      requiredEvidence: "Decoded field joins replay Walker generation to map entity targetname/Hammer ID/resource ID.",
      whyItIsNew: "Current compact and parser-level audits found zero exact replay/map identity joins.",
      whyItIsNonCircular: "The join is identifier-based and independent of coordinates.",
      minimumAcceptanceEvidence: ["field path", "sample values", "map resource provenance", "six-Walker coverage or bounded subset with held-out anchor"],
      taskThatWouldBecomeExecutable: "validate candidate world-to-map transform with exact identity anchors",
    },
    {
      conditionId: "unique_debug_capture",
      requiredEvidence: "New recording/debug capture uniquely links a Walker handle/entity index to Yellow, Blue, or Green lane.",
      whyItIsNew: "Task 079 inspected bounded video windows and found only set-level visibility.",
      whyItIsNonCircular: "The capture supplies identity before any transform fitting.",
      minimumAcceptanceEvidence: ["visible unique handle or entity identifier", "visible lane/map landmark identity", "time or event correlation"],
      taskThatWouldBecomeExecutable: "convert handle-to-lane evidence into fit/validation correspondences",
    },
    {
      conditionId: "identity_bearing_entity_lump",
      requiredEvidence: "Map entity-lump metadata exposes Walker lane/team identity and a replay-joinable identifier.",
      whyItIsNew: "Task 070 found no coordinate-bearing landmarks; Task 079 found no identity-bearing metadata through current tooling.",
      whyItIsNonCircular: "The metadata carries semantic identity without using replay coordinates.",
      minimumAcceptanceEvidence: ["decoder provenance", "resource hash", "entity records", "exact replay join field"],
      taskThatWouldBecomeExecutable: "map-resource identity proof task, then transform validation",
    },
    {
      conditionId: "alternate_fixed_anchor_set",
      requiredEvidence: "Independent non-Walker fixed landmarks with replay-side coordinates and map-side coordinates are identified.",
      whyItIsNew: "The current blocker is Walker lane pairing; alternate anchors could bypass it.",
      whyItIsNonCircular: "Anchors must be identity-grounded before residual inspection.",
      minimumAcceptanceEvidence: ["at least three distributed fit anchors", "one held-out validation anchor", "identity evidence not based on coordinates"],
      taskThatWouldBecomeExecutable: "transform validation using alternate anchors",
    },
  ],
};

const summary = {
  schemaVersion: 1,
  taskId: "081",
  gate: "deadem_milestone_cross_replay_generalization_selected",
  replay009SpatialContinuation: replay009SpatialContinuation.classification,
  exhaustedEvidencePaths: currentState.exhaustedEvidencePaths.length,
  spatialResumeConditions: spatialResume.conditions.length,
  candidateReplaysAssessed: fixtureAssessments.length,
  preferredNextReplay: "002",
  crossReplayGeneralizationReadiness: crossReplay.readiness,
  mapToolingTrackStatus: mapTooling.recommendedStatus,
  selectedPrimaryMilestone: milestoneDecision.primaryMilestone,
  pausedTracks: milestoneDecision.pausedTracks.map((track) => track.track),
  parallelTracks: milestoneDecision.parallelTracks.map((track) => track.track),
  nextBlockedTask: "082-generalize-canonical-factual-state-to-replay-002.md",
  protections: {
    replay005Read: false,
    replay005Processed: false,
    botFixturesProcessed: false,
    transformFitted: false,
    residualsCalculated: false,
    spatialOutputsEmitted: false,
    macroOutputsEmitted: false,
  },
};

const gate = {
  schemaVersion: 1,
  taskId: "081",
  gate: summary.gate,
  primaryMilestone: milestoneDecision.primaryMilestone,
  preferredNextReplay: "002",
  replay009SpatialStatus: "paused_waiting_for_genuinely_new_identity_evidence",
  transformRetryEligible: false,
  replay005Protected: true,
  botFixturesProtected: true,
};

writeJson("current-state.json", currentState);
writeJson("replay-009-spatial-continuation.json", replay009SpatialContinuation);
writeJson("cross-replay-generalization-assessment.json", crossReplay);
writeJson("map-tooling-track-assessment.json", mapTooling);
writeJson("candidate-direction-comparison.json", comparison);
writeJson("milestone-decision.json", milestoneDecision);
writeJson("spatial-resume-contract.json", spatialResume);
writeJson("reassessment-summary.json", summary);
writeJson("reassessment-gate.json", gate);

fs.writeFileSync(
  path.join(outDir, "README.md"),
  `# Spatial Milestone Reassessment\n\nTask 081 reassesses the replay-009 spatial milestone after Task 079 found Walker lane identity evidence unavailable.\n\nGate: \`${summary.gate}\`.\n\nPrimary milestone: cross-replay canonical generalization, starting with replay 002 after explicit authorization.\n\nReplay-009 transform work is paused, not abandoned. It resumes only under the evidence contract in \`spatial-resume-contract.json\`.\n`,
);

fs.mkdirSync("reports", { recursive: true });
fs.writeFileSync(
  "reports/deadem-spatial-milestone-reassessment.md",
  `# Deadem Spatial Milestone Reassessment\n\n## Decision\n\nGate: \`${summary.gate}\`.\n\nThe primary milestone should shift to **cross-replay canonical generalization**, starting with replay 002 after explicit authorization. Replay-009 transform validation is paused until genuinely new non-circular identity evidence exists.\n\n## Why\n\nTask 079 audited the permitted replay-009 lane-only evidence paths and found no exact replay/map identity joins, no unique video-to-handle links, no named lanes, no named map landmarks, and no fit or validation correspondences. Continuing immediate replay-009 spatial work would repeat Tasks 077-079 or invite circular coordinate/residual shortcuts.\n\nCross-replay canonical generalization is executable now from compatible human controls 001-004. Replay 002 is the preferred first case because it is the shortest non-holdout compatible control with existing match-state, one-second coordinate, death/respawn, damage/economy-adjacent, and objective lifecycle evidence.\n\n## Spatial Resume Contract\n\nReplay-009 transform work may resume only if one of the explicit conditions in \`output/spatial-milestone-reassessment/spatial-resume-contract.json\` is satisfied. New minimap screenshots alone are insufficient unless they provide replay-handle identity.\n\n## Outputs\n\n- \`output/spatial-milestone-reassessment/current-state.json\`\n- \`output/spatial-milestone-reassessment/replay-009-spatial-continuation.json\`\n- \`output/spatial-milestone-reassessment/cross-replay-generalization-assessment.json\`\n- \`output/spatial-milestone-reassessment/map-tooling-track-assessment.json\`\n- \`output/spatial-milestone-reassessment/candidate-direction-comparison.json\`\n- \`output/spatial-milestone-reassessment/milestone-decision.json\`\n- \`output/spatial-milestone-reassessment/spatial-resume-contract.json\`\n- \`output/spatial-milestone-reassessment/reassessment-summary.json\`\n- \`output/spatial-milestone-reassessment/reassessment-gate.json\`\n\n## Protections\n\nReplay 005 was not read or processed. Bot fixtures 006-008 were not processed. No transform, residual, lane, region, proximity, mechanic, fight, rotation, pressure, or macro output was produced.\n`,
);

fs.mkdirSync("tasks/blocked", { recursive: true });
const task082 = "tasks/blocked/082-generalize-canonical-factual-state-to-replay-002.md";
if (!fs.existsSync(task082)) {
  fs.writeFileSync(
    task082,
    `# Task 082: Generalize Canonical Factual State To Replay 002\n\nStatus: blocked\n\nExecution mode: autonomous after explicit authorization\n\nBlocked by: explicit user authorization after Task 081\n\n## Objective\n\nRun the first bounded cross-replay canonical generalization cycle on replay 002, using existing compatible human control evidence while preserving replay 005 as the final holdout.\n\n## Scope\n\nUse replay 002 only as the first external generalization case. Replays 001, 003, and 004 may be referenced only for selection context unless the task explicitly expands scope. Do not inspect replay 005. Do not process bot fixtures 006-008.\n\n## Required Work\n\n1. Validate replay 002 structural and telemetry prerequisites.\n2. Audit player/team identity, lifecycle/death observability, coordinate coverage, net-worth/economy field availability, and objective/structure class observability.\n3. Inventory replay-009-specific canonical assumptions before integration.\n4. Produce replay-002 canonical factual outputs comparable to replay 009 where supported.\n5. Produce a cross-replay schema diff and compatibility report.\n\n## Prohibited Work\n\nDo not infer lanes, fit map transforms, apply mechanics, evaluate decisions, train models, infer fights, rotations, pressure, or macro conclusions.\n\n## Acceptance Criteria\n\nReplay 002 has a canonical factual-state package with provenance and explicit gaps, or the task documents the earliest blocking telemetry layer. Replay 005 remains untouched and bot fixtures remain excluded.\n`,
  );
}

console.log(`wrote ${outDir}`);
