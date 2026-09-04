# Current Codex State

Policy version: 1. Branch: main. Last accepted Task 218:
`3d1daa401a1e2ceef79cac1b58026ab53721a107`, externally
`ACCEPTED_WITH_BLOCKER` under
`generic_scrim_intake_v1_partial_with_declared_gaps`.

Accepted blocker: `protected_alias_pre_filesystem_guard_incomplete`.

Active Task 219: Close Generic Intake Protected-Alias Boundary. Status:
`VALIDATING`. Technical gate claim:
`generic_scrim_intake_protected_alias_boundary_closed`.

The Task 218 functional intake is preserved. Task 219 checks every Craig
entry name immediately after `readdir`, before entry-specific filesystem
operations. Registry scanning validates its complete directory namespace
before any manifest read; only `review_match_009`–`review_match_999` can be
opened. Protected aliases retain `protected_target_id`; historical or malformed
entries fail closed with `invalid_registry_entry`.

Synthetic operation counters prove zero protected-path lstat, realpath,
open/read/hash and protected/invalid registry manifest reads across six Craig,
four protected registry and three invalid registry cases. All 26 intake tests
and 44 focused MVP regressions pass.

No real match was registered. Product cardinalities remain
4/207/102/48/57/11/15/9. Replay/protected access, replay processing, ASR,
synchronization, candidates, frames, media copy/versioning, frontend changes,
gameplay facts and attribution are zero.

Milestone claim: `AlphaVeil Continuous Review Pipeline = GENERIC_INTAKE_READY`.

Next action: independent ChatGPT Work validation of Task 219 only. Do not
create Task 220 or connect Generic Factual Processing. Machine state:
`data/project-coordination-state.json`.
