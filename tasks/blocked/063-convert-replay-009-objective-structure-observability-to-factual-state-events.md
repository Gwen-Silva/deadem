# Task 063: Convert Replay 009 Objective/Structure Observability To Factual State Events

Status: blocked

Unlocked by: explicit user authorization after Task 062 review

Blocked by: review of Task 062 direct observability outputs

## Objective

Convert Task 062 direct objective/structure class, property, and lifecycle
observability into bounded non-spatial factual state events for replay 009.

## Constraints

- Use only replay 009.
- Do not process replay 005.
- Do not process bot fixtures 006, 007, or 008.
- Do not emit map projection, region/lane membership, proximity, deposit-zone
  logic, contest state, mechanic activation, mechanic effects, fight
  interpretation, or macro interpretation.
- Do not treat deletion/disappearance as secured, killed, claimed, deposited, or
  strategically lost without direct raw property or event evidence.

## Required validation

- factual-state event schema tests;
- JSON/JSONL validation;
- deterministic rerun;
- replay 005 exclusion verification;
- bot fixture exclusion verification;
- task queue validation;
- Git status validation.
