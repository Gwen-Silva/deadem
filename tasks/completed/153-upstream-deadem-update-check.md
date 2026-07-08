# Task 153 - Upstream Deadem Update Check

Status: completed

Gate: `upstream_deadem_update_check_added`

Commit message: `Add upstream deadem update check`

## Summary

Added a manual, read-only upstream update check for `Igor-Losev/deadem`.

New command:

```bash
npm run check:upstream-deadem
```

The command writes compact outputs under
`output/local-replay-processing/upstream-update-check/` and never applies
updates automatically.

## Snapshot

The Task 153 snapshot ran in an environment where upstream GitHub access was
unavailable:

- classification: `upstream_check_unavailable`
- upstream reachable: `false`
- update detected: `false`
- recommended action: `manual_upstream_check_required`

This is not evidence that upstream has no update. It means the automated check
could not reach upstream from this environment and a manual browser/GitHub check
is required before deep parser investigation.

## Known Applied Fix

The check records the Task 149 upstream fix as known locally applied:

- upstream commit: `dba298dbed2b7978f9569e6e5e5c0bd787f36b4a`
- summary: `FieldFactory: resolved char fields without count as varint, not string`
- local evidence:
  - `char_without_count_var_uint_32`
  - `tests/fieldfactory-char-decoder.test.mjs`
  - Task 149 upstream-char-decoder-fix artifacts

## Operational Rule

When a future parser issue appears:

1. Run focused local tests.
2. Run `npm run check:upstream-deadem`.
3. If upstream has a relevant release or commit, review release notes and commits first.
4. Consider cherry-pick or update only in a separate explicit task.
5. Start deep local parser investigation only if upstream does not explain the issue or upstream cannot be checked.

No replay was processed. No parser/engine behavior or `packages/deadem/**`
behavior was modified. No pull, merge, cherry-pick, rebase, automatic update,
Java, Clarity, external parser, WSL, iaflow, Product Reviewer automation,
canonical/source/match output, recovery, skip, placeholder, new opt-in, or Task
154 was created.
