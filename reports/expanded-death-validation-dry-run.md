# Expanded Death Validation Dry-Run

Gate: `expanded_death_validation_dry_run_ready`

Task 166 ran `npm run dry-run:expanded-death-validation-batch` against the
Task 165 materialized authorization manifest. The runner evaluated authorization
entries only; it did not access, open, hash, copy, inspect, parse, or process any
replay file.

## Result

- eligible dry-run entries: 16
- ready entries: 16
- blocked entries: 4
- real emission authorized: false
- replay filesystem access performed: false
- parse attempted: false
- new real artifacts emitted: false
- final facts produced: false
- gameplay interpretation produced: false

The ready entries are replay_001, replay_002, replay_003, replay_004,
replay_009, replay_010, replay_011, and replay_012 through replay_020.

The blocked entries remain replay_005 as the protected final holdout and
replay_006 through replay_008 as unsupported bot fixtures.

## Fifteen-Replay Note

Task 166 did not select 15 replays from the 16 eligible entries. If the
operational target remains exactly 15 replays, a future task must explicitly
choose which eligible replay is excluded.

## Recommendation

Selected next action:
`decide_exact_15_replay_selection_or_authorize_16_replay_real_emission`.

No `death_validation.json`, `death_events`, `respawn_events`, timelines,
objective lifecycle, player identity rows, attribution, field values, raw data,
snapshots, full histories, final source/canonical/match facts, or gameplay
interpretation outputs were emitted.
