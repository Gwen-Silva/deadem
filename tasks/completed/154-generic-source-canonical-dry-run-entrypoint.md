# Task 154 - Generic Source Canonical Dry-Run Entrypoint

Status: completed

Gate: `generic_source_canonical_dry_run_entrypoint_added`

Commit message: `Add generic compact source canonical dry run entrypoint`

## Summary

Added a generic compact dry-run/readiness entrypoint for replay_010 and
replay_011:

```bash
npm run dry-run:source-canonical-readiness
```

The entrypoint confirms parser completion, plans compact source/canonical
readiness manifests, validates readiness schema and output policy, and does not
write final source, canonical, or match facts.

## Result

- classification: `generic_source_canonical_dry_run_ready`
- replay_010 parser completion: passed
- replay_011 parser completion: passed
- first blocker: none
- next milestone: `emit_controlled_source_canonical_artifacts_for_replay_010_011`

## Scope Control

Only replay_010 and replay_011 were processed. The dry-run did not process
replay 005, bot fixtures 006-008, candidates 012-020, samples, or
`output/replays/**`.

No parser/engine behavior, `packages/deadem/**`, recovery, skip mode,
placeholder, parser fix, default behavior, new opt-in, upstream pull, merge,
cherry-pick, rebase, Java, Clarity, external parser, WSL, iaflow, Product
Reviewer automation, final source/canonical/match facts, raw data, field
values, or gameplay interpretation output was produced.
