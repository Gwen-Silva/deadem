# Task 058: Establish Versioned Deadlock Mechanics Knowledge Base

Status: completed

Execution mode: autonomous

## Context

The current compatible normal replay fixtures are 001, 002, 003, 004, and 009. Unsupported solo-bot fixtures are 006, 007, and 008. Replay 005 remains the protected final holdout.

Replay 009 telemetry is usable with known gaps: 12 players, 6v6 teams, complete position coverage, death lifecycle consistency, net worth available, parser time available, and no direct active-game-time or pause interval source.

Future objective, fight, economy, pressure, rotation, risk/reward, decision, and macro context work needs versioned mechanics knowledge. Deadlock mechanics change frequently, so rules must be bound to evidence and temporal validity instead of assuming current mechanics apply to historical replays.

## Objective

Create a versioned, evidence-based mechanics knowledge foundation and small pilot dataset for:

- Spirit Urn / Soul Urn
- Mid Boss
- Rejuvenator
- Souls and economy
- Death and respawn
- Guardians, Walkers, base structures, and Patron states

The task must establish schemas, evidence records, telemetry requirement mapping, a patch/build registry, a deterministic query utility, tests, documentation, and follow-up blocked tasks.

## Constraints

- Do not perform macro analysis or classify replay decisions.
- Do not scrape or copy entire wiki pages.
- Do not assume current mechanics apply to historical replays.
- Do not infer a documented mechanic was active in a replay without telemetry evidence.
- Do not modify parser recovery.
- Do not process replay 005.
- Do not process bot fixtures 006, 007, or 008.
- Do not modify lane, region, or spatial classification logic.
- Keep rule claims separated into documented_rule, observed_behavior, analytical_implication, hypothesis, and unknown.
- Every factual mechanic claim must link to evidence.
- Build 23916427 must remain unresolved unless independently mapped by strong evidence.

## Required Outputs

- `knowledge/README.md`
- `knowledge/schema/mechanic.schema.json`
- `knowledge/schema/mechanic-version.schema.json`
- `knowledge/schema/evidence.schema.json`
- `knowledge/schema/analytical-implication.schema.json`
- `knowledge/schema/telemetry-requirement.schema.json`
- `knowledge/patches/patch-registry.json`
- `knowledge/patches/build-patch-mapping.json`
- `knowledge/sources/source-index.json`
- `knowledge/validation/knowledge-validation-summary.json`
- Pilot mechanic packages under `knowledge/mechanics/`
- `tools/query-mechanics.mjs`
- `tests/knowledge/`
- `reports/versioned-mechanics-knowledge-foundation.md`

## Documentation Updates

- `docs/PROJECT_STATE.md`
- `docs/REPOSITORY_GUIDE.md`
- `reports/INDEX.md`
- `tasks/completed/INDEX.md`

## Validation

- Knowledge schema tests
- Query utility tests
- ESLint
- JSON/YAML validation
- Existing engine tests
- Existing video-pipeline tests
- Task queue validation
- Documentation-link validation where available
- Git status validation

## Gate

Produce exactly one:

- `versioned_mechanics_knowledge_foundation_ready`
- `versioned_mechanics_knowledge_foundation_ready_with_unresolved_build_mapping`
- `versioned_mechanics_knowledge_foundation_blocked`

Expected honest gate: `versioned_mechanics_knowledge_foundation_ready_with_unresolved_build_mapping` unless build 23916427 can be mapped through strong evidence.

## Follow-up

If the foundation is ready, create blocked tasks to:

- map build 23916427 to applicable patch/mechanic versions;
- connect detected replay states to mechanic activation conditions.

Do not execute follow-up tasks automatically.
