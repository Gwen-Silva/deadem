# Task 219 — Close Generic Intake Protected-Alias Boundary

Status: completed
Coordination status: `VALIDATING`

Base: `3d1daa401a1e2ceef79cac1b58026ab53721a107`

Task 219 is the separately authorized remediation for Task 218's externally
accepted blocker `protected_alias_pre_filesystem_guard_incomplete`. It does not
reimplement Generic Scrim Intake V1.

Every Craig `entry.name` is now checked immediately after `readdir`, before
entry-specific `lstat`, `realpath`, open, read or hash. The registry validates
its complete entry-name set before any manifest is opened: 005–008 retain
`protected_target_id`; historical and malformed names fail closed with
`invalid_registry_entry`; only `review_match_009`–`review_match_999` proceeds.

Injected operation counters prove zero protected-path filesystem operations
for six Craig alias cases, four protected registry aliases and three invalid
registry namespaces. All 26 intake tests and 44 existing MVP regressions pass.
No real scrim, replay, protected input, ASR, synchronization, candidate,
frame, media or frontend operation occurred.

Technical gate claim:
`generic_scrim_intake_protected_alias_boundary_closed`.

Milestone claim:
`AlphaVeil Continuous Review Pipeline = GENERIC_INTAKE_READY`.

Final acceptance remains pending independent ChatGPT Work validation. Task 220
was not created and Generic Factual Processing was not started.
