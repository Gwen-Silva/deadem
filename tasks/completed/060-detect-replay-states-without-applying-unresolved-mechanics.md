# Task 060: Detect Replay States Without Applying Unresolved Mechanics

Status: completed

Execution mode: autonomous after explicit promotion

Unlocked by: `replay_009_spatial_geometric_projection_ready`

## Blocker

This task must remain blocked until all of the following are true:

- the current replay-009 spatial/geometric validation task is completed;
- its gate confirms that player positions can be projected into map regions with sufficient reliability;
- no other active task is modifying replay-009 spatial outputs.

Do not execute this task concurrently with any task modifying replay-009 spatial,
region, geometry, or objective-position outputs.

Task 061 dependency update:

- Spatial gate: `replay_009_spatial_geometric_projection_ready_with_limitations`
- Report: `reports/replay-009-spatial-geometric-projection-validation.md`
- Coordinate source: usable with constraints
- Generic region, lane, objective proximity, and structure proximity: blocked
- If separately promoted, this task may execute only non-spatial factual
  categories: player life state, team net worth, and raw entity
  presence/classification without spatial interpretation.

## Current Knowledge State

Task 058 created the versioned mechanics knowledge foundation.

Task 059 concluded:

- build: `23916427`
- build identifier type: `unknown_build_identifier`
- exact patch mapping: unavailable
- date-only candidate: `official_2026_06_11_minor`
- applicable mechanic rules: 0
- ambiguous mechanic rules: 7
- gate: `build_23916427_mechanics_mapping_unresolved`

Therefore no mechanic effect may be automatically applied to replay 009.

Current mechanics knowledge includes:

- Spirit/Soul Urn
- Mid Boss
- Rejuvenator
- Souls/economy
- Death/respawn
- Core structures

## Objective

Build a factual replay-state detection layer for replay 009 that identifies
observable game states without applying patch-sensitive mechanic effects.

The task may answer factual questions such as:

- Was an Urn entity present?
- Was an Urn being carried?
- Was a player near an Urn deposit location?
- Was Mid Boss alive, damaged, or absent?
- Was a Rejuvenator entity present?
- Was a structure alive or destroyed?
- What was the observable net-worth difference?
- Was a player alive, dead, or respawning?

The task must not answer:

- Was a comeback Urn buff active?
- How much resistance did a team receive?
- Was taking the fight correct?
- Was a team favored by objective rules?
- Did a Rejuvenator effect apply?
- Was the macro decision good?

Those conclusions require resolved mechanic versions and a later interpretation
layer.

## Core Separation

Preserve three distinct layers:

- `observed_state`
- `mechanic_rule_applicability`
- `analytical_interpretation`

This task implements only `observed_state`. It may report
`mechanic_rule_applicability: unresolved`; it must not synthesize analytical
interpretation.

## Replay Scope

Use only replay 009.

Do not process:

- replay 005
- replays 006, 007, or 008

Replays 001-004 may be used only as regression controls if required by existing
tooling.

## Time Basis

Use only:

- `parserSeconds`
- `demoTick`

Do not invent:

- `activeGameSeconds`
- official match clock
- pause-adjusted time

Task 057 established that no reliable pause or active-game-time mapping exists.
Every state record must preserve its source time basis.

## Required Observed-State Model

Create a generic state record schema equivalent to:

```json
{
  "stateId": "",
  "stateType": "",
  "entityId": null,
  "entityClass": null,
  "playerKey": null,
  "team": null,
  "demoTick": null,
  "parserSeconds": null,
  "position": {
    "x": null,
    "y": null,
    "z": null
  },
  "mapRegion": null,
  "rawProperties": {},
  "source": "",
  "confidence": "confirmed|supported|uncertain|unknown",
  "mechanicApplicability": "not_required|resolved|unresolved",
  "warnings": []
}
```

## State Categories

Support at minimum when telemetry permits:

- `objective_presence`
- `objective_carrier`
- `objective_ground_state`
- `objective_deposit_candidate`
- `boss_presence`
- `boss_health_state`
- `rejuvenator_presence`
- `structure_presence`
- `structure_destroyed`
- `player_alive_state`
- `player_death_state`
- `player_respawn_state`
- `team_net_worth_state`
- `player_proximity_to_objective`

Only emit categories supported by actual telemetry. Do not create empty semantic
events merely to satisfy the schema.

## Required Phases

1. Source and schema audit for replay-009 telemetry and serializers related to
   objective, boss, structure, player-life, respawn, death, and net-worth fields.
2. Entity classification for Soul/Spirit Urn, Mid Boss, Rejuvenator, Guardian,
   Walker, Patron, and other core structures.
3. Objective presence detection for confirmed or supported objective entities.
4. Urn-state detection for factual states only: `not_present`,
   `present_on_ground`, `carried`, `dropped`, `near_deposit_location`,
   `deposit_in_progress_candidate`, `disappeared`, `unknown`.
5. Separate Mid Boss and Rejuvenator factual state detection.
6. Structure lifecycle detection for Guardians, Walkers, Patron, and base
   structures without strategic pressure inference.
7. Player life-state detection from validated replay-009 player/controller/pawn
   lifecycle.
8. Net-worth state from `m_iGoldNetWorth` only: player values, team totals, team
   difference, and relative ordering.
9. Spatial linkage using the completed replay-009 spatial/geometric task
   outputs. Distances and proximity thresholds must remain geometric facts, not
   mechanic aura evidence.
10. Knowledge-layer compatibility query for each detected state. Preserve
    ambiguous rules and do not select `official_2026_06_11_minor` automatically.
11. Activation-readiness matrix separating state detection readiness from
    blocked mechanic rule application.

When executing under the Task 061 limitation gate, skip or mark unavailable:

- generic region membership;
- lane/region membership;
- objective-player proximity;
- near-deposit-location;
- structure-region association;
- objective/structure spatial activation candidates.

## Required Outputs

- `output/replay-009-states/source-property-inventory.json`
- `output/replay-009-states/entity-classification.json`
- `output/replay-009-states/objective-state-events.jsonl`
- `output/replay-009-states/urn-state-events.jsonl`
- `output/replay-009-states/mid-boss-state-events.jsonl`
- `output/replay-009-states/rejuvenator-state-events.jsonl`
- `output/replay-009-states/structure-state-events.jsonl`
- `output/replay-009-states/player-life-state-events.jsonl`
- `output/replay-009-states/team-net-worth-series.jsonl`
- `output/replay-009-states/objective-player-proximity.jsonl`
- `output/replay-009-states/knowledge-query-results.json`
- `output/replay-009-states/activation-readiness-matrix.json`
- `output/replay-009-states/state-detection-summary.json`
- `output/replay-009-states/state-detection-validation.json`
- `output/replay-009-states/state-detection-gate.json`
- `output/replay-009-states/README.md`
- `reports/replay-009-factual-state-detection.md`

Keep verbose entity/property traces local and untracked.

## Gate

Produce exactly one:

- `replay_009_factual_state_detection_ready`
- `replay_009_factual_state_detection_ready_with_gaps`
- `replay_009_factual_state_detection_not_ready`
- `replay_009_factual_state_detection_blocked`

Use `ready` only if objective, structure, player-state, and economy detections
all have direct and reliable evidence.

## Knowledge Mapping Policy

This task must not be blocked merely because build mapping is unresolved. It may
detect factual states, but it must remain blocked from applying mechanic
effects.

Document this distinction explicitly:

- state detection: independently evaluable
- mechanic activation: blocked
- mechanic effect application: blocked
- analytical interpretation: blocked

## Follow-Up Behavior

If factual state detection is ready:

- create a blocked task to integrate state events into the canonical replay
  schema;
- create a separate blocked task for mechanic activation once build
  applicability is resolved;
- do not execute either automatically.

If ready with gaps:

- create one blocked task for the highest-impact missing state source;
- identify which state categories are safe for downstream use.

If not ready:

- create one blocked task for the earliest missing telemetry layer.

## Required Validation

- replay-009 focused tests;
- entity classification tests;
- state transition tests;
- knowledge query ambiguity tests;
- spatial linkage tests using completed spatial task output;
- JSON/JSONL validation;
- deterministic rerun;
- engine tests;
- video-pipeline tests;
- ESLint;
- replay 005 exclusion verification;
- bot fixture exclusion verification;
- task queue validation;
- documentation-link validation;
- Git status validation.

## Documentation Updates

- `knowledge/README.md`
- `docs/PROJECT_STATE.md`
- `docs/REPOSITORY_GUIDE.md`
- `reports/INDEX.md`
- `output/README.md`

Document the pipeline as:

```text
replay telemetry
-> factual state detection
-> mechanic version query
-> activation eligibility
-> bounded interpretation
```

Only the first two stages are implemented by this task.

## Git

Use explicit staging only. Commit only factual state detection code, compact
state outputs, focused tests, report, documentation, and task files.

Do not commit replay files, videos, frames, full property dumps, caches, external
repositories, or ambiguous mechanic effects applied as facts.
