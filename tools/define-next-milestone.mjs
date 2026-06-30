#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const OUT = 'output/project-milestone-analysis';

async function writeJson(relativePath, value) {
    await mkdir(path.dirname(relativePath), { recursive: true });
    await writeFile(relativePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeText(relativePath, text) {
    await mkdir(path.dirname(relativePath), { recursive: true });
    await writeFile(relativePath, text);
}

async function readJson(relativePath) {
    return JSON.parse(await readFile(relativePath, 'utf8'));
}

function node(nodeId, currentStatus, evidence, dependsOn, unlocks, knownGaps, epistemicRisks) {
    return { nodeId, currentStatus, evidence, dependsOn, unlocks, knownGaps, epistemicRisks };
}

function capability(capabilityName, currentStatus, blockingLayers, minimumUnlockConditions, optionalEnhancements, unsafeShortcuts) {
    return { capability: capabilityName, currentStatus, blockingLayers, minimumUnlockConditions, optionalEnhancements, unsafeShortcuts };
}

function gap(gapId, description, classification, estimatedTechnicalRisk, estimatedEpistemicRisk, expectedDownstreamImpact, relativeComplexity, requiredInputs, availableInputs, missingInputs) {
    return { gapId, description, classification, estimatedTechnicalRisk, estimatedEpistemicRisk, expectedDownstreamImpact, relativeComplexity, requiredInputs, availableInputs, missingInputs };
}

function criterion(criterionId, description, required, currentStatus, evidence, missingEvidence) {
    return { criterionId, description, required, currentStatus, evidence, missingEvidence };
}

function track(trackId, title, conclusion, ratings, rationale, prerequisites, deferredReasons) {
    return { trackId, title, conclusion, ratings, rationale, prerequisites, deferredReasons };
}

function proposedTask(title, purpose, dependencies, inputs, outputs, acceptanceGate, stopConditions, replayScope, epistemicBoundary) {
    return {
        proposedTaskId: null,
        title,
        purpose,
        dependencies,
        inputs,
        outputs,
        acceptanceGate,
        stopConditions,
        replayScope,
        replay005Allowed: false,
        epistemicBoundary
    };
}

async function main() {
    const evaluation = await readJson('output/replay-009-inspection-evaluation/evaluation-summary.json');
    const capabilityMatrix = await readJson('output/replay-009-canonical/capability-matrix.json');

    const dependencyGraph = {
        schemaVersion: 1,
        generatedBy: 'tools/define-next-milestone.mjs',
        nodes: [
            node('parser_correctness', 'ready_with_constraints', ['001-004 and 009 normal replay parsing complete; bot fixtures unsupported'], [], ['telemetry'], ['bot fixtures 006-008 unsupported'], ['normal-corpus evidence is stronger than bot evidence']),
            node('telemetry', 'ready_with_constraints', ['replay_009_telemetry_usable_with_known_gaps'], ['parser_correctness'], ['identity', 'time', 'coordinates', 'factual_states'], ['pause/game clock unavailable'], ['parser completion does not prove every telemetry field correct']),
            node('identity', 'ready_with_constraints', ['12 replay-009 players, 6v6, controller/pawn continuity'], ['telemetry'], ['factual_states', 'combat'], ['one-second sampling limitations'], ['respawn transitions can be observed without official timer semantics']),
            node('time', 'partial', ['parserSeconds available; active-game-time unavailable'], ['telemetry'], ['factual_states', 'combat', 'objectives'], ['pause intervals and game clock not exposed'], ['parser time includes unlocalized pause']),
            node('coordinates', 'ready_with_constraints', ['26,052 replay-009 player-second rows, 100% coordinate presence'], ['telemetry', 'identity'], ['map_geometry'], ['no accepted transform or bounds'], ['raw coordinates are not map projection']),
            node('map_geometry', 'unavailable', ['Task 061: no accepted map transform, regions, lanes, objective geometry, or proximity'], ['coordinates'], ['lane_occupancy', 'rotations', 'objectives', 'map_pressure'], ['requires map assets/calibration/version compatibility'], ['current-map geometry cannot be silently applied to build 23916427']),
            node('entity_observability', 'ready_with_constraints', ['Task 062/063: Mid Boss, Guardian, Walker, Patron/base raw events; Urn partial; Rejuvenator unavailable'], ['telemetry'], ['factual_states', 'objectives'], ['Spirit Urn and Rejuvenator unresolved'], ['class names and raw lifecycle do not imply mechanic completion']),
            node('factual_states', 'ready_with_constraints', ['Task 065 canonical factual layer; Task 066/067 review tooling'], ['identity', 'time', 'entity_observability'], ['objectives', 'combat'], ['spatial fields unavailable; mechanic effects zero'], ['canonical means normalized, not universally independently validated']),
            node('mechanic_version', 'blocked', ['Task 059: build 23916427 mapping unresolved'], [], ['mechanic_activation'], ['requires official/versioned source'], ['date-only candidate cannot select rules']),
            node('mechanic_activation', 'blocked', ['0 applicable rules, 7 ambiguous rules'], ['mechanic_version', 'factual_states'], ['objectives', 'macro_interpretation'], ['requires versioned rule applicability plus detected activation conditions'], ['observed state does not prove effect active']),
            node('combat', 'partial', ['death/life factual layer available; killer/assist and source-target damage incomplete'], ['identity', 'time', 'factual_states'], ['fights', 'decision_analysis'], ['combat attribution incomplete'], ['fight grouping can overreach without damage/source/position context']),
            node('lane_occupancy', 'blocked', ['replay-009 lane geometry unavailable; previous lane occupancy frozen'], ['map_geometry', 'coordinates'], ['rotations', 'map_pressure', 'macro_interpretation'], ['no lane projection for replay 009'], ['nearest lane is not lane occupancy']),
            node('rotations', 'blocked', ['spatial and lane layers unavailable'], ['map_geometry', 'lane_occupancy', 'time'], ['macro_interpretation'], ['requires map/time context'], ['movement path does not imply intent']),
            node('objectives', 'partial', ['raw objective/structure events ready with gaps'], ['entity_observability', 'map_geometry', 'mechanic_activation'], ['map_pressure', 'macro_interpretation'], ['objective completion/proximity/effects unavailable'], ['deletion is not completion']),
            node('fights', 'blocked', ['combat factual layer incomplete; spatial unavailable'], ['combat', 'time', 'map_geometry'], ['decision_analysis'], ['no fight candidate layer'], ['outcome is not decision quality']),
            node('map_pressure', 'blocked', ['structure raw state exists; spatial and objective semantics unavailable'], ['map_geometry', 'objectives'], ['macro_interpretation'], ['no validated regions or structure projection'], ['structure state does not by itself prove pressure']),
            node('macro_interpretation', 'blocked', ['not implemented and not authorized'], ['mechanic_activation', 'map_pressure', 'rotations', 'fights'], ['decision_analysis'], ['multiple prerequisite layers blocked'], ['bounded facts do not imply strategy']),
            node('decision_analysis', 'blocked', ['not implemented and not authorized'], ['macro_interpretation', 'fights'], [], ['semantic ground truth absent'], ['favorable result does not prove decision quality'])
        ]
    };

    const capabilityBlockerMatrix = {
        schemaVersion: 1,
        capabilities: [
            capability('lane presence', 'blocked', ['map_geometry', 'coordinates'], ['validated world-to-map transform or direct structural lane geometry for replay 009'], ['map-version evidence'], ['using nearest lane as lane presence']),
            capability('lane occupancy', 'blocked', ['map_geometry', 'lane_occupancy'], ['validated lane geometry plus occupancy methodology decision'], ['human review of ambiguous intervals'], ['using nearest lane as lane occupancy']),
            capability('movement path', 'partial', ['map_geometry'], ['coordinates can be reviewed raw; projected paths require transform'], ['active-game-time mapping'], ['using current map geometry without version validation']),
            capability('rotation candidate', 'blocked', ['map_geometry', 'lane_occupancy', 'time'], ['validated paths, lane/region context, and timing basis'], ['combat/objective context'], ['inferring intent from movement']),
            capability('objective proximity', 'blocked', ['map_geometry', 'objective_geometry'], ['validated objective/structure positions and player transform'], ['objective entity positions'], ['using current map geometry without version validation']),
            capability('objective completion', 'blocked', ['entity_observability', 'mechanic_activation', 'independent_validation'], ['direct event/property semantics or independent validation of completion'], ['video/control observation'], ['using deletion as objective completion']),
            capability('fight candidate', 'blocked', ['combat', 'map_geometry', 'time'], ['combat attribution or bounded proximity/context layer'], ['source-target damage'], ['using deaths alone as fights']),
            capability('teamfight candidate', 'blocked', ['fight candidate', 'map_geometry'], ['validated fight candidates and participant grouping rules'], ['video validation'], ['grouping by time only']),
            capability('map pressure', 'blocked', ['map_geometry', 'objectives'], ['validated structure locations/regions and raw structure state'], ['objective completion validation'], ['visual absence as entity absence']),
            capability('resource allocation', 'partial', ['economy_semantics'], ['m_iGoldNetWorth can support net-worth snapshots only'], ['spendable/secured/unsecured semantics'], ['using net worth as available souls']),
            capability('macro interpretation', 'blocked', ['map_pressure', 'rotations', 'mechanic_activation'], ['validated state context plus bounded interpretation model'], ['human/problem framing'], ['using outcome as decision quality']),
            capability('decision-quality analysis', 'blocked', ['macro_interpretation', 'semantic_ground_truth'], ['explicit methodology and validation source'], ['human review or controlled labels'], ['using outcome as decision quality'])
        ]
    };

    const gapRecoverability = {
        schemaVersion: 1,
        gaps: [
            gap('map_asset_and_transform', 'Replay 009 lacks accepted map transform, bounds, regions, lane geometry, objective geometry, and proximity.', ['requires_external_game_assets', 'requires_manual_annotation'], 'medium', 'high', 'high', 'large', ['versioned map image/coordinates or geometry asset', 'calibration anchors'], ['raw replay coordinates', 'player identity', 'visual pipeline runtime'], ['authoritative or calibratable map geometry for build 23916427']),
            gap('build_23916427_mapping', 'Build identifier cannot be mapped to exact patch/mechanic versions.', ['requires_official_or_versioned_source'], 'medium', 'high', 'high', 'research', ['official build/patch metadata or game files tied to build'], ['date-only candidate after 2026-06-11'], ['direct build-to-patch evidence']),
            gap('active_game_time', 'Pause intervals and official game clock are not exposed by parser outputs.', ['recoverable_from_existing_video', 'requires_manual_annotation'], 'medium', 'medium', 'medium', 'moderate', ['synchronized video/time anchors or external clock source'], ['parserSeconds', 'reported duration delta'], ['direct clock/pause source']),
            gap('spirit_urn_identity', 'Spirit Urn remains candidate-only.', ['recoverable_from_existing_replays', 'requires_independent_validation'], 'medium', 'medium', 'medium', 'moderate', ['additional property/class evidence or visual/control observation'], ['candidate class/lifecycle events'], ['canonical identity evidence']),
            gap('rejuvenator_observability', 'No canonical Rejuvenator events exist in replay-009 canonical layer.', ['recoverable_from_existing_replays', 'requires_new_controlled_replay'], 'unknown', 'medium', 'medium', 'research', ['stronger class/property search or controlled replay containing Rejuvenator'], ['no canonical events'], ['observed Rejuvenator event/source']),
            gap('patron_base_identity', 'Patron/base grouped classes remain ambiguous.', ['recoverable_from_existing_video', 'requires_manual_annotation'], 'medium', 'medium', 'medium', 'moderate', ['visual or controlled class mapping'], ['CNPC_BarrackBoss/CNPC_Boss_Tier3/CNPC_TrooperBoss records'], ['class-to-gameplay identity confirmation']),
            gap('combat_attribution', 'Deaths are factual but killer/assist/source-target combat attribution remains incomplete.', ['recoverable_from_existing_replays'], 'medium', 'medium', 'medium', 'moderate', ['event/counter reconciliation across canonical events'], ['death/life state events'], ['bounded attribution model']),
            gap('cross_replay_canonical_generalization', 'Replay-009 canonical schema has not been run across normal controls 001-004.', ['recoverable_from_existing_replays'], 'medium', 'medium', 'high', 'large', ['existing 001-004 parser outputs/replays'], ['compatible normal controls'], ['canonical integration for controls'])
        ]
    };

    const replay005Checklist = {
        schemaVersion: 1,
        releaseDecision: 'replay_005_release_not_ready',
        criteria: [
            criterion('parser_non_holdout_normals', 'Parser succeeds on all eligible non-holdout normal replays.', true, 'met', ['001-004 and 009 compatible normal fixtures'], []),
            criterion('canonical_more_than_one_human_replay', 'Canonical pipeline runs on more than one human replay.', true, 'not_met', ['canonical replay-009 exists'], ['canonical outputs for 001-004 or another normal replay']),
            criterion('schema_stability', 'Canonical schema stability is demonstrated beyond replay 009.', true, 'not_met', ['Task 065 schema exists'], ['cross-replay schema comparison']),
            criterion('no_replay_specific_class_assumptions', 'No replay-specific class-ID assumptions drive downstream logic.', true, 'partially_met', ['Task 063 preserves class names and semantic limits'], ['cross-replay class compatibility']),
            criterion('no_entity_specific_recovery', 'No entity-specific recovery exceptions are required for selected pipeline.', true, 'partially_met', ['replay 009 normal path no bot recovery'], ['formal confirmation across canonical controls']),
            criterion('deterministic_outputs', 'Deterministic outputs exist for selected pipeline.', true, 'partially_met', ['Task 066/067 deterministic generation'], ['deterministic cross-replay canonical generation']),
            criterion('task_queue_clean', 'Task queue validates with no active/pending accidental work.', true, 'met', ['Task queue validation in Task 067'], []),
            criterion('independent_validation_methodology', 'Independent validation methodology is established for key claims.', true, 'partially_met', ['Task 064/067 bounded visual validation'], ['broader sample or source strategy for chosen milestone']),
            criterion('major_blockers_documented', 'Major blockers are documented before holdout release.', true, 'met', ['docs/PROJECT_STATE.md and Task 068 outputs'], []),
            criterion('spatial_or_scope_decision', 'Spatial dependency is either resolved or explicitly excluded from holdout objective.', true, 'not_met', ['Task 061 unresolved spatial projection'], ['milestone-level spatial decision'])
        ]
    };

    const milestoneComparison = {
        schemaVersion: 1,
        tracks: [
            track('A', 'Spatial and map geometry foundation', 'recommended_primary_with_open_inputs', {
                downstreamCapabilityImpact: 'very_high',
                dependencyCentrality: 'very_high',
                useOfExistingData: 'medium',
                needForNewData: 'high',
                generalizationValue: 'high',
                riskOfOverfitting: 'medium',
                epistemicReliability: 'high_if_assets_validated',
                implementationComplexity: 'large',
                validationFeasibility: 'medium',
                relevanceToFinalProjectGoal: 'very_high'
            }, 'Spatial grounding blocks lane presence, objective proximity, movement paths, rotations, map pressure, and macro prerequisites. It cannot be faked from current replay-009 coordinates.', ['versioned or calibratable map geometry'], ['Cannot begin implementation without geometry input.']),
            track('B', 'Cross-replay generalization', 'recommended_after_or_parallel_if_no_new_assets', {
                downstreamCapabilityImpact: 'high',
                dependencyCentrality: 'high',
                useOfExistingData: 'very_high',
                needForNewData: 'low',
                generalizationValue: 'very_high',
                riskOfOverfitting: 'low',
                epistemicReliability: 'high',
                implementationComplexity: 'large',
                validationFeasibility: 'high',
                relevanceToFinalProjectGoal: 'high'
            }, 'This reduces replay-009 overfitting and improves holdout readiness, but it does not unlock spatial/objective proximity by itself.', ['existing compatible controls 001-004'], ['Defers the largest spatial blocker.']),
            track('C', 'Objective semantic observability', 'deferred_until_spatial_or_control_evidence', {
                downstreamCapabilityImpact: 'high',
                dependencyCentrality: 'medium',
                useOfExistingData: 'medium',
                needForNewData: 'medium',
                generalizationValue: 'medium',
                riskOfOverfitting: 'high',
                epistemicReliability: 'medium',
                implementationComplexity: 'moderate',
                validationFeasibility: 'medium',
                relevanceToFinalProjectGoal: 'high'
            }, 'Objective raw events exist, but canonical Urn/Rejuvenator/completion semantics remain unresolved.', ['direct property semantics or independent validation'], ['Could overfit class semantics before spatial/build context.']),
            track('D', 'Build and mechanics resolution', 'deferred_as_research_dependency', {
                downstreamCapabilityImpact: 'high',
                dependencyCentrality: 'high',
                useOfExistingData: 'low',
                needForNewData: 'high',
                generalizationValue: 'medium',
                riskOfOverfitting: 'low',
                epistemicReliability: 'high_if_official_source_found',
                implementationComplexity: 'research',
                validationFeasibility: 'low',
                relevanceToFinalProjectGoal: 'high'
            }, 'Required for mechanic effects, but current evidence found only date-only candidates.', ['official/versioned build source'], ['No known direct source in repo.']),
            track('E', 'Time-basis recovery', 'deferred_bounded_need', {
                downstreamCapabilityImpact: 'medium',
                dependencyCentrality: 'medium',
                useOfExistingData: 'medium',
                needForNewData: 'medium',
                generalizationValue: 'medium',
                riskOfOverfitting: 'medium',
                epistemicReliability: 'medium',
                implementationComplexity: 'moderate',
                validationFeasibility: 'medium',
                relevanceToFinalProjectGoal: 'medium'
            }, 'Useful for durations and timing comparisons, but parserSeconds is sufficient for factual review workflows.', ['video/clock anchors'], ['Does not unlock map/objective proximity.']),
            track('F', 'Combat factual layer', 'deferred_until_spatial_or_generalization', {
                downstreamCapabilityImpact: 'medium',
                dependencyCentrality: 'medium',
                useOfExistingData: 'medium',
                needForNewData: 'medium',
                generalizationValue: 'medium',
                riskOfOverfitting: 'high',
                epistemicReliability: 'medium',
                implementationComplexity: 'moderate',
                validationFeasibility: 'medium',
                relevanceToFinalProjectGoal: 'high'
            }, 'Deaths are validated, but fight candidates need attribution, spatial context, or both.', ['damage/source-target fields and spatial context'], ['Strategically interesting but not foundational yet.'])
        ]
    };

    const recommendedTaskSequence = {
        schemaVersion: 1,
        selectedPrimaryMilestone: 'spatial foundation first',
        optionalPreparatoryMilestone: 'cross-replay canonical generalization if map assets are not available',
        tasks: [
            proposedTask('Acquire Replay 009 Map Geometry And Calibration Inputs', 'Collect authoritative or calibratable map geometry for build 23916427 without applying it.', [], ['versioned map image/geometry asset', 'known coordinate anchors or calibration screenshots/video frames', 'source/license/provenance'], ['map input inventory', 'asset provenance', 'calibration feasibility report'], 'replay_009_map_geometry_inputs_ready', ['no suitable geometry source', 'license/provenance unclear', 'build/map-version conflict unresolved'], ['none; no replay parsing'], ['acquisition only; no projection or gameplay interpretation']),
            proposedTask('Validate Coordinate Transform Against Independent Anchors', 'Test candidate world-to-map transforms using independent anchors.', ['map geometry inputs ready'], ['raw replay-009 coordinates', 'map geometry inputs', 'anchors'], ['transform candidates', 'accepted/rejected transform audit'], 'replay_009_map_transform_validated', ['no independently supported transform', 'ambiguous mirror/scale/rotation unresolved'], ['replay_009 only; no replay 005'], ['coordinate validation only; no lane occupancy']),
            proposedTask('Build Generic Map Bounds And Region Projection', 'Project positions into validated generic regions without semantic lane claims.', ['map transform validated'], ['accepted transform', 'map bounds/regions'], ['generic region projection', 'coverage and ambiguity scorecard'], 'replay_009_generic_regions_ready', ['coverage insufficient', 'ambiguity too high'], ['replay_009 only; optional 001-004 controls if authorized'], ['regions are geometry facts, not macro interpretation']),
            proposedTask('Validate Objective And Structure Static Geometry', 'Attach validated static objective/structure reference locations to factual events.', ['map transform validated'], ['static objective/structure geometry', 'Task 063/065 entity events'], ['objective/structure geometry audit', 'distance capability summary'], 'replay_009_objective_structure_geometry_ready', ['source geometry unsupported', 'object identity mismatch'], ['replay_009 only'], ['distance/proximity only; no objective completion/effects']),
            proposedTask('Integrate Spatial Facts Into Canonical Inspector', 'Expose validated geometry facts in canonical outputs and inspector with semantic limits.', ['generic regions ready', 'objective/structure geometry ready'], ['spatial projections', 'canonical factual schema'], ['updated canonical spatial fields', 'inspector spatial view'], 'replay_009_spatial_facts_integrated_with_limits', ['semantic limits not visible', 'mechanic effects accidentally applied'], ['replay_009 only'], ['spatial facts only; no rotations/pressure/macro'])
        ]
    };

    const milestoneDecision = {
        schemaVersion: 1,
        selectedPrimaryMilestone: 'spatial foundation first',
        optionalPreparatoryMilestone: 'cross-replay canonical generalization if map assets are unavailable or delayed',
        decisionModel: 'spatial foundation first',
        gate: 'deadem_next_milestone_defined_with_open_dependencies',
        keyReason: 'Map geometry is the highest-impact missing layer: it blocks lane presence, movement paths, objective proximity, map pressure prerequisites, rotations, and most future macro context.',
        highestImpactBlocker: 'validated map geometry and coordinate transform for replay 009/build 23916427',
        inputsAlreadyAvailable: ['replay-009 canonical factual state', 'player coordinates with complete presence', 'player identity/lifecycle', 'raw objective/structure events', 'static inspector and query/export tooling', 'video pipeline runtime'],
        newInputsRequired: ['authoritative or calibratable map geometry for the replay-009 map/build', 'independent coordinate anchors with provenance'],
        milestoneTechnicalComplexity: 'large',
        milestoneEpistemicRisk: 'high until map/version provenance is established; medium after validated anchors',
        deferredTracks: [
            'build/mechanics resolution: still needs direct official/versioned evidence',
            'combat factual layer: useful but depends on attribution and spatial context',
            'objective semantic observability: avoid overfitting raw class semantics before spatial/build context',
            'time-basis recovery: useful but not the largest blocker for factual state review',
            'macro/decision analysis: remains blocked by prerequisite layers'
        ],
        replay005ReleaseDecision: replay005Checklist.releaseDecision,
        releaseCriteriaSummary: {
            met: replay005Checklist.criteria.filter(row => row.currentStatus === 'met').length,
            partiallyMet: replay005Checklist.criteria.filter(row => row.currentStatus === 'partially_met').length,
            notMet: replay005Checklist.criteria.filter(row => row.currentStatus === 'not_met').length,
            unknown: replay005Checklist.criteria.filter(row => row.currentStatus === 'unknown').length
        },
        protections: {
            replay005Read: false,
            replay005Processed: false,
            botFixturesProcessed: false,
            sourceVideoProcessed: false,
            macroAnalysisCreated: false,
            mechanicEffectsApplied: false
        }
    };

    const milestoneGate = {
        gate: milestoneDecision.gate,
        reason: 'The next milestone is clear, but it requires named map geometry/calibration inputs before execution can begin.',
        selectedPrimaryMilestone: milestoneDecision.selectedPrimaryMilestone,
        blockedFirstStep: 'Task 069: Acquire Replay 009 Map Geometry And Calibration Inputs',
        replay005Protection: 'not_read_or_processed',
        botFixtureProtection: 'not_processed',
        noReplayParsed: true,
        noSourceVideoProcessed: true
    };

    await writeJson(`${OUT}/dependency-graph.json`, dependencyGraph);
    await writeJson(`${OUT}/capability-blocker-matrix.json`, capabilityBlockerMatrix);
    await writeJson(`${OUT}/gap-recoverability.json`, gapRecoverability);
    await writeJson(`${OUT}/replay-005-release-criteria.json`, replay005Checklist);
    await writeJson(`${OUT}/milestone-comparison.json`, milestoneComparison);
    await writeJson(`${OUT}/recommended-task-sequence.json`, recommendedTaskSequence);
    await writeJson(`${OUT}/milestone-decision.json`, milestoneDecision);
    await writeJson(`${OUT}/milestone-gate.json`, milestoneGate);
    await writeText(`${OUT}/README.md`, `# Project Milestone Analysis

Task 068 defines the next Deadem milestone from completed evidence without parsing replays or applying mechanics.

Gate: \`${milestoneDecision.gate}\`

Selected primary milestone: ${milestoneDecision.selectedPrimaryMilestone}

First blocked step: ${milestoneGate.blockedFirstStep}

Replay 005 was not read or processed. Bot fixtures 006-008 were not processed. No source video was processed.
`);

    await writeText('docs/NEXT_MILESTONE.md', `# Next Milestone: Spatial Foundation First

## Current Project State

Deadem now has normal replay parsing for fixtures 001-004 and 009, replay-009 factual telemetry, canonical factual-state outputs, query/export tooling, a static inspector, and validated inspector review workflows.

The validated factual layer supports player identity, life/death/respawn events, \`m_iGoldNetWorth\` endpoint summaries, raw Mid Boss/structure events, candidate Spirit Urn records, and bounded visual validation overlays. It applies zero mechanic effects.

## Remaining Blockers

- Replay 005 remains protected.
- Bot fixtures 006-008 remain unsupported.
- Build \`23916427\` has no confirmed patch mapping.
- Active-game time and pause intervals are unavailable.
- Map transform, regions, lanes, objective geometry, structure geometry, and proximity are unavailable.
- Spirit Urn identity, Rejuvenator observability, Patron/base identity, objective completion, mechanic activation, combat/fight grouping, map pressure, macro interpretation, and decision analysis remain blocked or partial.

## Dependency Graph Summary

The most central blocked node is \`map_geometry\`. It depends on validated coordinates plus external or independently supported geometry, and it unlocks lane presence, movement paths, objective proximity, structure association, rotations, map pressure prerequisites, and later bounded macro context.

## Candidate Milestone Comparison

Track A, spatial and map geometry foundation, has the highest downstream impact and dependency centrality. It also has open input requirements. Cross-replay canonical generalization is the strongest fallback if map inputs are unavailable, because it improves holdout readiness using existing data but does not unlock spatial capabilities.

## Selected Milestone

Primary milestone: **spatial foundation first**.

Optional preparatory milestone: **cross-replay canonical generalization if map assets are unavailable or delayed**.

The milestone is selected because spatial grounding is the largest shared blocker across lane presence, movement paths, objective proximity, map pressure prerequisites, rotations, and later macro context.

## Required New Inputs

- Authoritative or calibratable map geometry for the replay-009 map/build.
- Independent coordinate anchors with provenance.

Current map geometry must not be silently assumed valid for build \`23916427\`.

## Validation Strategy

1. Acquire geometry and provenance.
2. Validate coordinate transform against independent anchors.
3. Quantify projection coverage, out-of-bounds samples, and ambiguity.
4. Validate generic regions separately from lanes.
5. Validate objective and structure static geometry separately from entity semantics.
6. Integrate only factual spatial fields with visible semantic limits.

## Proposed Task Sequence

See \`output/project-milestone-analysis/recommended-task-sequence.json\`.

The first task is blocked on user-supplied or otherwise authorized geometry/calibration inputs.

## Replay 005 Release Criteria

Replay 005 release decision: \`${replay005Checklist.releaseDecision}\`.

Release is not ready. Missing evidence includes canonical outputs for more than one human replay, cross-replay schema stability, formal no-replay-specific assumptions, and a resolved or explicitly scoped spatial decision.

## Explicit Non-Goals

- Do not inspect or process replay 005.
- Do not process bot fixtures 006-008.
- Do not apply mechanic effects.
- Do not infer objective completion from deletion.
- Do not infer lane occupancy from nearest lane.
- Do not implement fight, macro, or decision-quality analysis.
`);

    await writeText('reports/deadem-next-milestone-decision.md', `# Deadem Next Milestone Decision

Task 068 defines the next project milestone from completed Tasks 044-067.

## Decision

- Gate: \`${milestoneDecision.gate}\`
- Selected primary milestone: **${milestoneDecision.selectedPrimaryMilestone}**
- Optional preparatory milestone: ${milestoneDecision.optionalPreparatoryMilestone}
- Highest-impact blocker: ${milestoneDecision.highestImpactBlocker}
- Technical complexity: ${milestoneDecision.milestoneTechnicalComplexity}
- Epistemic risk: ${milestoneDecision.milestoneEpistemicRisk}

## Why Spatial First

Spatial grounding blocks the largest number of downstream capabilities: lane presence, movement paths, objective proximity, map pressure prerequisites, rotations, and later macro context. Existing replay-009 coordinates are usable with constraints, but Task 061 found no accepted transform, regions, lanes, objective geometry, structure geometry, or proximity capability.

## Why Alternatives Are Deferred

- Cross-replay generalization is valuable and should be the fallback if map inputs are unavailable, but it does not unlock spatial questions by itself.
- Objective semantic observability risks overfitting class/property meaning before map and build context.
- Build/mechanics resolution remains a research dependency without direct build mapping.
- Time-basis recovery is useful but not the largest shared blocker.
- Combat factual work remains premature without attribution and spatial context.

## Replay 005

Replay 005 release decision: \`${replay005Checklist.releaseDecision}\`.

Replay 005 was not read or processed. Release requires more than the current replay-009 canonical path.

## Outputs

- \`output/project-milestone-analysis/dependency-graph.json\`
- \`output/project-milestone-analysis/capability-blocker-matrix.json\`
- \`output/project-milestone-analysis/gap-recoverability.json\`
- \`output/project-milestone-analysis/replay-005-release-criteria.json\`
- \`output/project-milestone-analysis/milestone-comparison.json\`
- \`output/project-milestone-analysis/recommended-task-sequence.json\`
- \`docs/NEXT_MILESTONE.md\`
`);

    console.log(JSON.stringify({
        gate: milestoneDecision.gate,
        selectedPrimaryMilestone: milestoneDecision.selectedPrimaryMilestone,
        optionalPreparatoryMilestone: milestoneDecision.optionalPreparatoryMilestone,
        dependencyNodes: dependencyGraph.nodes.length,
        blockedCapabilities: capabilityBlockerMatrix.capabilities.length,
        candidateMilestones: milestoneComparison.tracks.length,
        proposedTasks: recommendedTaskSequence.tasks.length,
        replay005ReleaseDecision: replay005Checklist.releaseDecision,
        firstProposedTask: recommendedTaskSequence.tasks[0].title,
        protections: milestoneDecision.protections
    }, null, 2));
}

await main();
