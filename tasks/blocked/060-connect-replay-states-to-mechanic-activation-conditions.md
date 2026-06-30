# Task 060: Connect Replay States To Mechanic Activation Conditions

Status: blocked

Execution mode: autonomous after explicit promotion

Unlocked by: `mechanic_activation_condition_mapping_authorized`

## Blocker

Requires the versioned mechanics foundation from Task 058 and either confirmed
build mapping or a task-specific decision to produce only unavailable/ambiguous
activation results.

Task 059 status: remains blocked. Build `23916427` has only a date-supported
candidate patch state and no mechanic has `confirmed_for_build` or
`supported_for_build` applicability.

## Objective

Create a factual bridge between validated replay telemetry fields and mechanic
activation requirements. The output should answer which mechanic conditions are
observable, unavailable, ambiguous, or blocked by missing telemetry.

## Constraints

- Do not perform macro analysis.
- Do not classify decisions, rotations, fights, pressure quality, or intent.
- Do not process replay 005.
- Do not process unsupported solo-bot fixtures 006, 007, or 008.
- Do not treat documented mechanics as active without replay telemetry.

## Acceptance Criteria

- Produce a compact activation-condition mapping for validated replay telemetry.
- Preserve original parser time; do not invent active-game-time if unavailable.
- Report blocked activation conditions and required telemetry fields.
- Run knowledge validation, relevant replay-009 validation checks, and task queue validation.
