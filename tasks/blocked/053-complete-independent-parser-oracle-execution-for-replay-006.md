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
- Decision update identifying whether independent evidence supports a generic parser fix.

Gate:

Produce exactly one:

- `independent_oracle_confirms_generic_lifecycle_behavior`
- `independent_oracle_confirms_protocol_tolerated_missing_update`
- `independent_oracle_fails_equivalently`
- `independent_oracle_execution_blocked`

Execution mode: autonomous, after the blocker is resolved.
