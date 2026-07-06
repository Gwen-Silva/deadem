# Replay 010 PacketEntities Boundary Truncation Evaluation

Gate: `local_replay_packet_entities_boundary_truncation_no_progress`

## Result

- Default pass reproduced Task 105 missing entity 2905: `true`
- Guard pass reproduced Task 119 boundary: `true`
- Truncation triggered: `true`
- Truncation packet/loop/read count: `953/27/5343`
- Original missing entity 2905 reached by truncation pass: `true`
- Advanced past original failure: `false`
- Reached end: `false`
- Next error: `Unable to find an entity with index [ 2905 ]`
- Matches Task 119 boundary context: `true`
- Phantom loops 27-29 applied as semantic updates: `false`

## Limits

- Truncation is opt-in structural recovery only and remains disabled by default.
- No missing-entity recovery, placeholder entity, fake field, canonical package, source artifact, or match fact was produced.
- No Source 2 semantic conclusion, parser bug conclusion, replay corruption conclusion, or final parser fix is made.
