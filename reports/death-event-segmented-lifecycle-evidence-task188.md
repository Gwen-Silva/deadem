# Task 188 Segmented Death Lifecycle Evidence Report

## Outcome

Task 188 passed the durable integrity, exact pilot, and bounded-32 technical
gates under `task187_corrected_segmented_lifecycle_bounded32_ready`. Its
operational assessment is `partial`; it emits no final death facts.

## Integrity repairs

The Task 187 SHA is assigned only to Task 187. All 32 expected Task 185 artifact
paths and contents are identical to commit
`8ca6d50fd99fdc6fc4b802ab3af2e74b06f4796e`. Exact manifests reject missing,
duplicate, extra, reordered, and protected IDs. Bounded processing validates
every pilot gate field before replay paths, while each replay validates strict
Task 180/182/183/186 provenance and exact control-row bridges before opening.

Task 187 correction results:

- prior/corrected coherent rows: 2,175/2,161;
- prior coherent rows crossing the next anchor: 41;
- recovery times changed by persistence confirmation: 2,225;
- prior uniqueness-violation and coherent-row intersection: 59;
- corrected forward/recovery rates: 0.944357/0.904337;
- corrected anchor-control difference: 0.846787;
- corrected assessment: `partial`.

## Pilot and bounded-32

Pilot completed 4/4 parsers with 341 anchors, rows, and exact controls. Bounded
completed 32/32 parsers with 2,552 anchors, rows, and exact controls. Both passed
provenance, mapping, bridge, source-reuse, protection, schema, output-policy,
size, and all-or-nothing gates with zero final facts and attribution.

Bounded lifecycle metrics:

- any complete same-family chain: 0.945533;
- at least two complete families: 0.858542;
- coherent segmented lifecycle: 0.846787;
- control coherent lifecycle: 0;
- anchor-control difference: 0.846787;
- pre-state/forward-persistence/recovery-persistence coverage:
  0.999216/0.953762/0.859718;
- cross-anchor violations: 42;
- opposing directions/persistence contradictions: 24/17;
- final censored anchors: 200;
- controls censored by real anchors: 1,694;
- stable replays: 0/32;
- run size: 14,789,694 bytes, below the 24 MiB limit.

Boolean-like alive completed 2,413 chains, respawn boundary 2,191, health
boundary 25, and pawn-link presence zero. Cross-anchor observations were never
counted as coherent evidence for the prior segment.

## Readiness

Same-family lifecycle evidence, segmented consistency, matched-control
discrimination, cross-anchor measurement, and candidate-level consumption are
available. The `partial` assessment keeps operational promotion review false.
Final deaths, confirmed who-died, attribution, killer/victim, teamfight, and
gameplay interpretation remain unavailable.

## Task 189 correction notice

Task 189 reprocessed the authorized replays and checked the Task 188 pre-state
against the expected origin of each selected forward family transition. Task
188 remains unchanged as historical segmented-lifecycle-v1 evidence. Its 2,161
prior coherent rows remain 2,161 after the isolated origin-continuity
correction; zero rows were invalidated by a wrong origin or intervening
transition, and lifecycle class/recovery-time changes from this isolated
correction are zero. Task 189 separately supersedes Task 188 for equal-exposure
control comparison and corrected promotion readiness.
