# Dual Missing Entity Diagnostic Canaries

Status: completed

Gate: `dual_missing_entity_diagnostic_canaries_consolidated`

## Objective

Consolidate the compact diagnostic canary evidence from replay_010 and
replay_011 and select one bounded next route without processing replays,
modifying parser behavior, or recommending recovery/skip/placeholder behavior.

## Observed Facts

Both canaries preserve the same diagnostic class:
`missing_entity_fail_closed`.

replay_010:

- default/diagnostic error: `Unable to find an entity with index [ 2905 ]`
- packet ordinal: 954
- loop: 33
- operation: UPDATE
- entity index: 2905
- previous entity index: 2717
- index delta: 187
- payload bits: 193
- entityData bit length: 5936

replay_011:

- default/diagnostic error: `Unable to find an entity with index [ 5624 ]`
- packet ordinal: 1052
- loop: 28
- operation: UPDATE
- entity index: 5624
- previous entity index: 2681
- index delta: 2942
- payload bits: 133
- entityData bit length: 5848

In both cases the diagnostic pass recorded compact metadata and still threw.
No continuation, recovery, skip, payload skip, placeholder/fake entity, field
materialization, synthetic registry state, canonical facts, source artifacts,
or match facts were produced.

## Classification

Fact: two authorized human canaries now reproduce the same missing-entity
diagnostic class.

Hypothesis: the repeated class strengthens the case that this is no longer a
replay_010-only blocker.

Weak inference: future review should focus on whether to authorize a bounded
parser-intervention design discussion, not another replay_010-only diagnostic.

Still undetermined: Source 2 semantics, replay corruption, local parser
correctness, and whether any recovery or skip behavior would be safe.

## Decision

Selected recommendation:
`request_human_decision_for_parser_intervention_design`.

This is preferred over open-ended diagnostics because the two compact canaries
already establish the repeated class and the fail-closed diagnostic behavior.
Continuing to collect local-only evidence without a design authorization would
increase diagnostic volume without resolving the remaining decision boundary.

This recommendation does not authorize implementation, recovery, skip mode,
placeholder entities, canonicalization, automatic replay expansion, or claims
about Source 2 semantics, replay corruption, or local parser correctness.

## Scope Held

No replay was processed. replay_010, replay_011, replay 005, replays 006-008,
candidates 012-020, samples, and output/replays were not accessed or
processed. Parser/engine files were not modified. Java, Clarity, external
parsers, WSL, iaflow, and Product Reviewer automation were not used. Task 134
was not created.
