# Task 125 — Decide Clarity Oracle Viability

Status: completed

Gate: `clarity_oracle_viability_decided`

Final category: `oracle_inviavel_no_ambiente_atual`

## Objective

Decide whether `skadistats/clarity` is a viable external oracle for the
authorized local Deadlock canaries under current project conditions, without
modifying Clarity, debugging Clarity, adapting it to Deadem, changing the local
parser, adding recovery, or producing factual outputs.

## Evidence

- The local Clarity clone exists at
  `.local/deadem/cache/external-prior-art-task123/clarity`.
- The inspected Clarity ref is `7fb3f1d07564a12efa99194d45cfbf5762ba5910`.
- The Gradle wrapper is present.
- `java -version` failed because `java` is unavailable in the environment.
- `javac -version` failed because `javac` is unavailable in the environment.
- `JAVA_HOME` is unset.
- Static entrypoint evidence shows library runner classes, but no obvious
  replay execution path was validated without a wrapper or adaptation step.
- No Clarity canary execution was attempted.

## Decision

Clarity is not a viable oracle in the current environment.

This does not prove the local parser is correct, does not prove replay
corruption, does not establish Source 2 semantics, and does not validate a
parser fix or recovery path.

## Recommendation

`manual_environment_setup_outside_codex_needed`

If Clarity remains desired as an oracle, the next work must first provide a
manual local Java/JDK setup and a simple reproducible Clarity invocation outside
this task's scope.

## Protections

- No local parser or engine file was modified.
- No Clarity code was modified, debugged, adapted, vendored, or committed.
- No recovery was added or promoted.
- No canonical package, source artifact, match fact, spatial output, mechanics
  output, macro output, fight output, decision output, or ML output was
  produced.
- No raw replay bytes, raw payloads, raw entityData, raw serializedEntities,
  string bytes, string values, field values, full send-table payload, external
  source tree, jar, binary, build artifact, `.dem`, or `.local` file was
  committed.
- Replay 005, bot fixtures 006-008, candidates 012-020, `samples/**`, and
  `output/replays/**` were not used.
- No Task 126 was created.

## Outputs

- `output/local-replay-processing/clarity-oracle-viability/`
- `reports/clarity-oracle-viability.md`
