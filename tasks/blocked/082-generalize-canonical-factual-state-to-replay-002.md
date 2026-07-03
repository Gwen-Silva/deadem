# Task 082: Generalize Canonical Factual State To Replay 002

Status: blocked

Execution mode: autonomous after explicit authorization

Blocked by: explicit user authorization after Task 081

Unlocked by: explicit user authorization to promote and execute Task 082 after Task 081 gate `deadem_milestone_cross_replay_generalization_selected`

## Objective

Run the first bounded cross-replay canonical generalization cycle on replay 002, using existing compatible human control evidence while preserving replay 005 as the final holdout.

## Scope

Use replay 002 only as the first external generalization case. Replays 001, 003, and 004 may be referenced only for selection context unless the task explicitly expands scope. Do not inspect replay 005. Do not process bot fixtures 006-008.

## Required Work

1. Validate replay 002 structural and telemetry prerequisites.
2. Audit player/team identity, lifecycle/death observability, coordinate coverage, net-worth/economy field availability, and objective/structure class observability.
3. Inventory replay-009-specific canonical assumptions before integration.
4. Produce replay-002 canonical factual outputs comparable to replay 009 where supported.
5. Produce a cross-replay schema diff and compatibility report.

## Prohibited Work

Do not infer lanes, fit map transforms, apply mechanics, evaluate decisions, train models, infer fights, rotations, pressure, or macro conclusions.

## Acceptance Criteria

Replay 002 has a canonical factual-state package with provenance and explicit gaps, or the task documents the earliest blocking telemetry layer. Replay 005 remains untouched and bot fixtures remain excluded.
