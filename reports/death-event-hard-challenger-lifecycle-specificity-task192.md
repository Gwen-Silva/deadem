# Task 192 Hard-Challenger Lifecycle Specificity Report

## Resumo objetivo

Built pilot and bounded-32 hard-challenger evidence from accepted replay-sourced
Task 190 observation artifacts. Structural challengers remain unconfirmed.

## Commit

- Candidate SHA resolution: post-commit-attestation: .local/codex/192/post-commit-attestation.json
- Commit-base: aa8e18fa3c912c6d59f3125084e30a520e6b8f77
- Branch: task191-correction
- Commits adicionados: 1

## Arquivos alterados

Task 192 contract, schema, emitter, focused tests, Work-authored state/spec,
navigation indexes, pilot/bounded artifacts, completed task and this report.

## Mudanças implementadas

Added exclusion-window challenger eligibility, independent horizon matching,
fresh assignment ledgers, surface/truncation/ambiguity audits, exclusion
sensitivity, strict validation and atomic publication. Every horizon consumes
its own Task 190 `horizonSpecificEvidence`; the 30-second boolean is never
reused for another horizon.

Family observations sharing replay, participant and actual forward-transition
second are deduplicated into one structural cluster, even when their control
references and deltas differ. All source event keys and control references are
retained as provenance;
cluster follow-up and horizon evidence are consolidated conservatively. Reuse
is calculated from `sourceTransitionKey` cluster identity and the ledgers.
Exclusion, stratum and matching use the actual transition second.

Challenger surface opportunity is mapped explicitly to the anchor-compatible
0/1/2 observable-surface scale. A family takes the maximum across its lifecycle
stages, then source rows and clusters use conservative minima. Unmapped status
values fail closed, and distinct status labels can never inflate the count
above two.

## Comandos executados

Task-specific schema/emitter tests, Task 190 regressions, coordination and queue
validation, prepare, preflight, lint, output checks, workflow validation and
review.

## Testes e validações

- Build: not_applicable: evidence emitter is executed directly by Node
- Lint: passed
- Typecheck: not_applicable: no repository typecheck command

## Artifacts gerados

Pilot and bounded-32 manifests, summaries, gates, per-replay audits, exclusion
audits, independent ledgers, surface/truncation audits and sensitivity results.

## Limitações

Only two bounded structural challengers survived primary eligibility. They are
unconfirmed comparison clusters and cannot establish positive or negative
death truth. At 10 seconds the matched anchor/challenger rates are 0.5/1.0;
at 20 and 30 seconds they are 1.0/1.0. Later horizons have no eligible matched
challengers.

## Riscos

Low challenger count makes the operational specificity assessment unstable and
insufficient for promotion.

## Desvios

No parser upgrade or protected replay processing was performed.

## Não validado

Final death facts, who-died, attribution and independent Work acceptance.

## Gate técnico alegado

- Technical gate claim: task190_hard_challenger_lifecycle_specificity_bounded32_ready

Final acceptance remains pending independent ChatGPT Work validation.

## Push e estado final

- Push status: blocked:github_authentication_unavailable
- HEAD source: post-commit-attestation
- Origin ref: not_available:remote_branch_absent
- Final status: VALIDATING
