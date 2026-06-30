# Task 053: Complete Independent Parser Oracle Execution For Replay 006

Status: blocked

Dependencies:

- Task 052 completed.
- Gate `external_oracle_comparison_ready_without_resolution`.
Unlocked by: `independent_external_oracle_runtime_available`

Blocker:

- At least one independent non-deadem parser must be made executable in an isolated local oracle workspace without committing third-party code, replay files, dependencies, or large traces.

Objective:

Execute one or more independent parser oracles for replay 006 and compare behavior at tick 3808, packet loop 29, entity index 5594.

Task 055 reframing:

- Keep replay 006 tick 3808 / loop 29 / entity 5594 as the primary oracle target.
- If the selected external oracle can also process the build-23916427 bot samples without extra scope risk, answer these bounded secondary questions:
  - Does it classify replay 007 raw value `269035851` as an entity index, packed handle, bit-decoder desynchronization, or another identifier?
  - Does it classify replay 008 tick 3480 entity `4436` as a missing LEAVE, an alternate lifecycle event, a tolerated stale reference, or a different decode?
- Do not execute Task 053 until the existing independent runtime blocker is resolved.

Allowed candidates:

- `saul/demofile-net`, preferably from a non-shallow or full-history checkout so Nerdbank.GitVersioning can calculate version height.
- `Rupas1k/source2-demo`, after a Rust toolchain is available and the Deadlock feature can be built.
- `OpenSource-Deadlock-Tools/DemLockSharp`, after a controlled CLI or local instrumentation path accepts repository sample paths.

Constraints:

- Do not process replay 005.
- Do not implement entity-, baseline-, or class-specific skips.
- Do not vendor external parser code into this repository.
- Do not commit external clones, dependencies, binaries, replay files, large traces, or caches.
- Do not treat parser continuation alone as proof of correctness.

Required outputs:

- Updated external parser execution matrix.
- Tick-3808 loop-level comparison when observable.
- Entity-5594 provenance comparison when observable.
- Missing-update behavior comparison.
- Optional Task 055 addendum: replay 007 raw-value classification and replay 008 missing-LEAVE behavior when the same oracle can inspect them safely.
- Decision update identifying whether independent evidence supports a generic parser fix.

Gate:

Produce exactly one:

- `independent_oracle_confirms_generic_lifecycle_behavior`
- `independent_oracle_confirms_protocol_tolerated_missing_update`
- `independent_oracle_fails_equivalently`
- `independent_oracle_execution_blocked`

Execution mode: autonomous, after the blocker is resolved.
