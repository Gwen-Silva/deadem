# Missing Entity Parser Intervention Design Review

Status: completed

Gate: `missing_entity_parser_intervention_design_ready`

## Objective

Review possible future parser-intervention design boundaries for the
`missing_entity_fail_closed` class confirmed in replay_010 and replay_011. This
task does not implement parser behavior and does not authorize recovery, skip
mode, placeholders, parser fixes, canonicalization, or source artifacts.

## Problem

The minimum technical problem is that the local parser reaches PacketEntities
UPDATE commands for entity indexes that are absent from the local registry.
This class is observed in two authorized human canaries:

- replay_010: packet 954 loop 33, UPDATE entity 2905.
- replay_011: packet 1052 loop 28, UPDATE entity 5624.

Earlier replay_010 diagnosis classified entity 2905 as a first missing update
to a never-registered entity with a create gap. The replay_011 canary confirms
the same diagnostic class, but not the same entity or index delta pattern.

## Design Alternatives

Evaluated alternatives:

- `keep_fail_closed_no_parser_intervention`
- `design_additional_diagnostic_contract_only`
- `design_packetentities_index_lifecycle_contract_probe`
- `require_external_oracle_before_parser_intervention`
- `prepare_bounded_parser_intervention_spec_for_human_approval`

Selected:
`prepare_bounded_parser_intervention_spec_for_human_approval`.

The selected route moves from broad diagnosis to a bounded human approval
checkpoint. It does not implement anything. A future task would need to define
the exact intervention contract, gates, evidence requirements, and rejection
criteria before any behavior change is considered.

## Rejections

Rejected for this task and not authorized by this review:

- direct parser implementation;
- recovery;
- skip mode;
- placeholder entities;
- fake fields;
- synthetic registry state;
- continuation after missing entity;
- default behavior changes;
- new opt-in behavior;
- canonical facts, source artifacts, match facts, or interpretation outputs.

## Required Evidence Before Implementation

Any future implementation would require a new human-authored task with explicit
authorization. It must define whether replay processing is allowed, preserve
protected replay rules, specify gates, prove no raw data or canonical/factual
outputs are versioned, and keep observed facts separate from hypotheses and
engineering decisions.

## Limits

This review does not conclude Source 2 semantics, replay corruption, local
parser correctness, recovery safety, or skip safety. No replay was processed.
Parser and engine files were not modified. Java, Clarity, external parsers,
WSL, iaflow, and Product Reviewer automation were not used. Task 135 was not
created.
