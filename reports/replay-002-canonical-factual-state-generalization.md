# Replay 002 Canonical Factual State Generalization

## Gate

`replay_002_canonical_factual_state_ready_with_constraints`

This is a limited first external generalization case, not proof that the whole project has generalized.

## Confirmed Facts

- Raw replay processed: `samples/partida_002.dem`
- Replay SHA-256: `8175e5cdd4b590fb92ba2b7e6ae3709af28ff645fcbeaa2fadd9a8d40d22912c`
- Parser completion: true
- Final parsed tick: 117423
- Parser duration: 3669s
- Players observed: 12
- Raw team distribution: {"2":6,"3":6}
- Objective/structure candidates: 47

## Deterministic Derivations

- 56 player death records were converted without promoting killer/assist/cause as direct canonical facts.
- 54 respawn/return records were converted with direct versus inferred status preserved.
- Team net-worth observations are derived from per-player `m_iGoldNetWorth` values in match-state rows.

## Gaps

- No replay-002 independent visual-validation overlay is available.
- Build/mechanic version is not inherited from replay 009.
- Spatial semantics are not emitted. Raw replay-side coordinates are preserved only in snapshots.
- Objective/structure terminal source labels are not promoted to destruction, secure, claim, deposit, or strategic conclusions.

## Assumptions

Replay-009 hard-coded match/build/source paths and Task 064 visual overlays were removed for replay 002. Raw team IDs remain raw and are not mapped to faction names.

## Protections

Replay 005 was not read or processed. Bot fixtures 006-008 were not processed. No lane, region, proximity, transform, residual, mechanic, fight, rotation, pressure, macro, or decision output was produced.
