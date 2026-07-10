# Product Value Roadmap

Task 178 translates current technical state into product-facing capability boundaries.

## What We Can Answer Today

- Whether explicitly authorized replays can be processed through the protected compact pipeline.
- Whether compact death_validation artifacts were emitted, schema-valid, size-safe, and policy-safe for an allowlisted batch.
- Which replay set is the active compact baseline: `bounded_inbox_batch_pilot_32_task177`.
- Whether a replay has source-observed counter-transition candidates in the compact death_validation artifact.

## What We Cannot Answer Yet

- Who killed whom.
- Whether a counter transition is a true death.
- Whether an event was a teamfight.
- Whether a play or decision was good.
- Position, map region, objective relation, damage interaction, or strategic explanation.

## Customer Question Dependencies

- "Can you process this replay safely?" depends on replay protection, parser completion, manifest authorization, and output policy.
- "How many death-like counter transitions were observed?" depends on death_validation and its consumption contract.
- "Who died and who killed them?" requires identity mapping, hero/team mapping, alive/dead/respawn state, and canonical death-event schema.
- "Was this a teamfight?" requires canonical death events, time normalization, position/map context, participant grouping, and fight detection policy.
- "Was this objective-related?" requires objective relation and temporal/spatial context after canonical events exist.

## Recommended Order

1. Replay processing seguro.
2. Identity mapping.
3. Hero/team mapping.
4. Time/tick normalization.
5. Alive/dead/respawn.
6. Canonical death event.
7. Killer/victim attribution.
8. Position/map context.
9. Damage/interaction.
10. Fight/teamfight detection.
11. Objective relation.
12. Gameplay question answering.

## Current Product Interpretation

The project has made substantial infrastructure progress: replay protection, parser stability, compact artifacts, batch execution, provenance, and audits. It has not yet started the gameplay semantic layer. The next valuable milestone is to move from compact counter-transition validation toward identity/time/state prerequisites for a canonical death-event artifact, while preserving the existing policy boundaries.

## Task 179 Semantic Foundation Result

The project now has a compact `semantic_foundation` baseline for the active 32
replays. It can say that the parser/pipeline exposed enough compact signals to
make identity, hero/team, time/tick, and life-state readiness plausible across
the bounded set. It still cannot answer who killed whom, whether an event is a
true death, whether a fight occurred, or why a play mattered.

Recommended next product-value step: build the first identity mapping artifact
with strict policy boundaries. Canonical death events should wait until identity,
hero/team, time normalization, and life-state artifacts have explicit schemas and
safe consumption contracts.

## Task 180 Participant Identity Result

The project now has a bounded-32 `participant_identity` baseline with synthetic
participant/controller/pawn/team/hero refs and compact time/life-state readiness.
This is the first usable semantic foundation above readiness-only artifacts, but
it still does not expose names, raw IDs, event rows, attribution, positions, or
final gameplay facts.

Recommended next product-value step: build `alive_dead_respawn` as a compact,
policy-safe state artifact. Canonical death events should wait until life-state
state transitions are explicit and safely consumable. Killer/victim attribution
and teamfight detection remain later layers.

## Task 181 Alive Dead Respawn Result

The project now has a bounded-32 `alive_dead_respawn` compact baseline. It can
state that participant refs and life-state coverage are available and that
2,552 source-observed death-counter increment candidates match the existing
`death_validation.eventCount` bridge across the bounded-32 set.

This still does not answer "who died", "who killed whom", or "was it a
teamfight". The current safe inputs do not include per-participant transition
rows or policy-safe transition timing, so canonical death-event design remains
blocked until that contract is designed explicitly.

Recommended next product-value step: design the canonical death-event input
contract, including whether a future policy-safe transition row layer is needed
before any attribution or fight detection.
## Task 182 Product Impact

The project now has the first replay-sourced compact life-state transition row
layer. This moves the roadmap from aggregate readiness into candidate rows that
can support canonical death-event candidate design.

What is now possible:

- reason over candidate death-counter increments per synthetic participant;
- use normalized elapsed seconds without raw ticks or timestamps;
- compare materialized candidate rows against the previous `death_validation`
  aggregate count.

What is still not possible:

- answer who killed whom;
- attribute assists or damage;
- identify teamfights;
- assert final death or respawn events;
- interpret gameplay decisions.

## Task 183 Product Implication

Task 183 creates the first policy-safe death-event candidate layer. The project
can now answer bounded questions about synthetic participant/hero/team refs and
normalized seconds for counter-increment candidates. It still cannot answer
"who died", "who killed whom", "was this a teamfight", or any gameplay
interpretation question. The next product step is a candidate-safe consumption
surface or a separately reviewed final death-event confirmation contract.
