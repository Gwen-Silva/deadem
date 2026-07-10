# Death Event Directional Cycle Evidence Contract

`death_event_directional_cycle_evidence` records abstract, replay-sourced signal
directions, later inverse/recovery-side cycles, replay-end censoring, and
negative controls around unconfirmed Task 183 anchors. Task 184 is contextual
coverage evidence only; none of its booleans or counts become Task 185 evidence.

## Fixed Windows

- Anchor side: at most 2 normalized seconds before or after the Task 183 anchor.
- Later cycle: strictly greater than 0 and at most 180 normalized seconds after
  the anchor.

One transition may be used at most once across all anchor-side, later-cycle, and
unanchored-cycle associations. Equidistant anchor candidates are ambiguous and
do not become positive evidence. A row is replay-end censored when the complete
180-second later window is not observable; censoring is not a failed semantic
cycle.

## Source-Family Separation

The five abstract families are health boundary, strict boolean-like alive probe,
unproven life-state signature, respawn-related boundary/signature, and pawn link.
Controller and linked-pawn observations from the same family are coalesced into
one family candidate per participant/second. Several fields in one family never
count as several independent families. Raw values, field names, handles, IDs,
ticks, and timestamps are not persisted.

Family and probe labels do not prove Source 2 gameplay semantics. "Inverse" and
"cycle" describe abstract value-direction relations only; they do not establish
death, survival, return, respawn, or causality.

## Negative Controls

The runner measures equivalent anchor-direction patterns outside every ±2-second
anchor window, plus equivalent inverse cycles built entirely from unanchored
transitions. Rates use neutral labels because final truth is unavailable:
`anchorAlignmentRate`, `unanchoredPatternRate`,
`completeCycleCoverageRate`, and `uncensoredCompleteCycleCoverageRate`.

## Predeclared Coverage Thresholds

`strong` requires all of:

- at least 95% of anchors with at least two distinct anchor-side families;
- at least 90% of uncensored anchors with at least one complete cycle family;
- `unanchoredPatternRate` at most 5%;
- zero parser, mapping, replay-protection, schema, output-policy, size, or
  source-reuse failures.

`partial` requires at least 75% of anchors with one or more directional families
or at least 60% of uncensored anchors with a complete cycle family, while not
meeting every strong criterion. Evidence dominated by ambiguity or unanchored
equivalent patterns is `insufficient`. Results below partial are also
`insufficient`.

These are operational design thresholds, not proof of gameplay truth. A
technically valid baseline may be `partial` or `insufficient`.

## Readiness Boundary

`readyForFinalDeathSemanticContractDesign` may be true only for `strong`.
Regardless of level, final death facts, confirmed "who died", attribution,
killer/victim, teamfight detection, and gameplay interpretation remain false.
Task 185 emits no final death artifact.
