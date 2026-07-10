# Task 185 Directional-Cycle Evidence Report

## Outcome

Task 185 passed its technical pilot and bounded-32 gates. The final gate is
`task184_commit_recorded_directional_cycle_evidence_bounded32_ready`, meaning
only that the directional-cycle and negative-control evidence baseline is
reproducible and consumable. Death semantics remain unconfirmed.

The pilot emitted 341 rows and the bounded-32 run emitted 2,552 rows, exactly
one per Task 183 anchor. Ajv Draft 2020-12 validation, output policy,
participant mapping, Task 183/184 bridges, parser completion, source-family
separation, source reuse, replay protection, and size audits passed. Final facts
and attribution remained zero.

## Task 184 Correction

The Task 184 commit is recorded as
`065d0fa0a1d422b3dcf342078100386e2ca7d793`. Task 184 independence means the
signals were observed separately from the death-counter anchor and came from
distinct probe families. It does not mean statistical independence, causal
independence, or proven Source 2 gameplay semantics. Its historical
`confirmationEvidenceLevel` field is a coverage-strength label only. Task 185
uses `corroborationCoverageLevel` for that context.

## Pilot

- Replays: replay_010, replay_011, replay_021, replay_036.
- Parsers completed: 4/4.
- Anchors and rows: 341/341.
- Anchors with directional evidence: 341.
- Anchors with multiple directional families: 341.
- Anchors with complete inverse-cycle evidence: 341.
- Replay-end-censored anchors: 34.
- Ambiguous anchors: 0.
- Unanchored equivalent directional patterns: 417.
- Unanchored equivalent complete cycles: 59.
- Unmatched directional transitions: 1,012.
- Unanchored equivalent-pattern rate: 0.23493.
- Coverage level: `partial`.

## Bounded-32

- Parsers completed: 32/32.
- Anchors and rows: 2,552/2,552.
- Anchors with directional evidence: 2,552.
- Anchors with multiple directional families: 2,552.
- Anchors with complete inverse-cycle evidence: 2,552.
- Uncensored anchors with complete cycles: 2,297/2,297.
- Replay-end-censored anchors: 255.
- Ambiguous anchors: 0.
- Unanchored equivalent directional patterns: 3,218.
- Unanchored equivalent complete cycles: 477.
- Unmatched directional transitions: 7,766.
- Anchor alignment rate: 1.0.
- Multiple-family anchor rate: 1.0.
- Complete-cycle coverage rate: 1.0.
- Uncensored complete-cycle coverage rate: 1.0.
- Unanchored equivalent-pattern rate: 0.24067.
- Coverage level: `partial`.

Every technical requirement passed, including exactly zero duplicate evidence
keys, participant mapping failures, source-transition reuse, protected replay
access, final facts, and attribution. The bounded run occupied 4,934,237 bytes
under the 16 MiB run limit; each artifact remained below 512 KiB.

## Assessment

The existing same-second correlation is not specific enough to satisfy the
predeclared strong design criteria. Directional evidence and cycles are highly
available around anchors, but equivalent directional patterns also occur too
often outside anchor windows. This supports candidate-level evidence
consumption, but not final death semantic contract design.

The active Task 180, Task 182, Task 183, and Task 184 baselines remain in force.
Task 185 adds `death_event_directional_cycle_evidence_bounded32_task185`; it
does not replace or reinterpret its sources.

## Task 186 Correction Notice

Task 185 commit: `8ca6d50fd99fdc6fc4b802ab3af2e74b06f4796e`.
The Task 185 matcher allowed non-directional signature recurrence to satisfy an
inverse relation. Its historical complete-cycle counts, family counts, coverage
rates, and cycle-derived evidence classes therefore require Task 186 corrected
recalculation. The artifacts and technical gate are preserved as historical
observation evidence and are not silently rewritten.
