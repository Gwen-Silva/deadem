# Task 066: Build Replay 009 Factual State Inspection Interface

Status: blocked

Unlocked by: explicit authorization after Task 065 review

Blocked by: review of canonical replay-009 factual-state schema outputs

## Objective

Build a small inspection/report interface for the canonical replay-009 factual
state layer produced by Task 065.

The interface may query and summarize factual states, provenance, semantic
limits, event-level validation status, category-level validation status, spatial
unavailability, and mechanic-effect non-application.

## Constraints

- Do not process replay 005.
- Do not process bot fixtures 006-008.
- Do not apply mechanics or resolve build 23916427.
- Do not infer objective completion, destruction, kills, claims, deposits,
  secured objectives, fights, pressure, macro interpretation, or decision
  quality.
- Do not treat category-level validation as event-level validation.
- Preserve visual synchronization uncertainty and camera-coverage limitations.

## Required validation

- canonical query fixture tests;
- provenance display tests;
- semantic-limit display tests;
- validation-overlay display tests;
- mechanic-effect-zero tests;
- replay 005 and bot fixture exclusion checks;
- task queue validation.
