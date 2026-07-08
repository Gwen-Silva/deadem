# Task 166 - Run Expanded Death Validation Dry-Run

Status: completed

Gate: `expanded_death_validation_dry_run_ready`

Commit message: `Run expanded death validation dry-run`

Task 166 implemented `npm run dry-run:expanded-death-validation-batch` via
`tools/dry-run-expanded-death-validation-batch.mjs` and executed it against the
Task 165 materialized authorization manifest.

The dry-run evaluated 16 eligible replay authorization entries as
`dry_run_ready`:

- replay_001
- replay_002
- replay_003
- replay_004
- replay_009
- replay_010
- replay_011
- replay_012
- replay_013
- replay_014
- replay_015
- replay_016
- replay_017
- replay_018
- replay_019
- replay_020

The blocked policy remains:

- replay_005: protected final holdout
- replay_006: unsupported bot fixture
- replay_007: unsupported bot fixture
- replay_008: unsupported bot fixture

The run preserved `realEmissionAuthorizedForExpansion: false`. It did not
access, open, hash, copy, inspect, parse, or process replay files. It did not
execute `emit:batch-death-validation-compact`, `emit:death-validation-compact`,
or real `death_validation_compact_emission`. It emitted only compact readiness
manifests for Task 166.

No new real `death_validation.json`, death events, respawn events, timelines,
objective lifecycle, player identity rows, killer/victim/assist attribution,
field values, raw data, snapshots, full entity histories, source/canonical/match
final facts, or gameplay interpretation outputs were produced.

Task 166 did not automatically select 15 replays from the 16 eligible entries.
If exactly 15 replays are required operationally, a future task must explicitly
choose the exclusion.

Recommended next action:
`decide_exact_15_replay_selection_or_authorize_16_replay_real_emission`.

No parser/engine behavior, `packages/deadem/**`, recovery, skip, placeholder,
default behavior, parser opt-in, Java/Clarity/external parser, WSL, iaflow,
Product Reviewer automation, pull/merge/cherry-pick/rebase, or Task 167 was
created or used.
