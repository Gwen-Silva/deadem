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
