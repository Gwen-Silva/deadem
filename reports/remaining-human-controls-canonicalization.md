# Remaining Human Controls Canonicalization

## Frozen Acceptance Matrix

| Requirement | Classification |
| --- | --- |
| Process only `replay_001`, `replay_003`, and `replay_004`. | required |
| Reuse the existing canonical factual core and contract validation helpers. | required |
| Do not add replay-specific branches or one-off patches. | required |
| Preserve replay 005 protection. | required |
| Leave bot fixtures 006-008 unsupported and unprocessed. | required |
| Emit no spatial, mechanic-effect, fight, rotation, pressure, macro, role, or decision analysis. | required |
| Treat event-count differences as content differences, not schema breaks. | required |
| Report unavailable categories explicitly instead of zero-filling. | required |
| Keep outputs compact and use manifests/hashes for large package material. | required |
| Full five-replay pilot audit belongs to Task 096. | explicit_non_goal |
| Replay 005 release or validation. | explicit_non_goal |
| Spatial, mechanic, ML, macro, fight, role, pressure, or decision layers. | explicit_non_goal |
| Raw replay processing is avoided because existing generated artifacts are available. | accepted_limitation |
| Per-replay canonical data is represented as compact package manifests rather than large event/snapshot dumps. | accepted_limitation |
| Expansion beyond the five-human-replay pilot. | backlog |

Gate: `remaining_human_controls_canonicalized`

Replays attempted: replay_001
Replays succeeded: replay_001
Replays blocked: none
Raw replay access: none; existing generated artifacts only.
Schema compatibility: all emitted compact packages validated against the canonical contract.
Provenance status: complete for emitted records.
Missing categories: replay_001=none
Replay-specific branch audit: passed with 0 findings.
Protections: replay 005 not accessed; bot fixtures 006-008 not processed.
Output-size status: compact outputs under .local/codex/095/test-output; largest committed package output remains bounded.
Performance baseline: replay_001:517ms
Validation commands: see compact review packet after `codex:review`.
Accepted limitations: full package material is represented by hashes and counts; Task 096 performs the pilot-wide audit.
Next task blocked: Task 096.
