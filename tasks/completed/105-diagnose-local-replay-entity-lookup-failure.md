# Task 105: Diagnose Local Replay Entity Lookup Failure

Status: completed

Gate: `local_replay_entity_lookup_failure_diagnosed`

## Objective

Diagnose the exact cause of the local replay canary failure:

`Unable to find an entity with index [ 2905 ]`

Authorized replay input:

`.local/deadem/replays/inbox/partida_010.dem`

Replay ID: `replay_010`

## Result

The failure was localized to parser tick advancement itself.

Probe 1, load-only, passed without tick advancement, entity class lookup, or field access.

Probe 2, `nextTick` only, failed after 953 attempted/advanced ticks with:

`Unable to find an entity with index [ 2905 ]`

No `getEntitiesByClassName`, `getField`, pawn/controller relationship resolution, or extractor snapshot logic was used before the failure. Later probes were skipped because the smallest useful diagnostic set had already localized the failure.

## Diagnosis

- First failing probe: `probe_2_next_tick_only`
- First failing operation: `nextTick`
- Suspected layer: `parser_advancement`
- Next recommended fix scope: `parser_api_investigation`
- Tool-level workaround ready: false
- Minimal safe snapshot possible: null, not tested because advancement failed first

## Outputs

- `output/local-replay-processing/replay_010-entity-lookup-diagnosis/input-identity.json`
- `output/local-replay-processing/replay_010-entity-lookup-diagnosis/probe-results.json`
- `output/local-replay-processing/replay_010-entity-lookup-diagnosis/failure-localization.json`
- `output/local-replay-processing/replay_010-entity-lookup-diagnosis/safe-access-capability.json`
- `output/local-replay-processing/replay_010-entity-lookup-diagnosis/protection-audit.json`
- `output/local-replay-processing/replay_010-entity-lookup-diagnosis/replay-specific-branch-audit.json`
- `output/local-replay-processing/replay_010-entity-lookup-diagnosis/diagnosis-gate.json`
- `reports/local-replay-entity-lookup-diagnosis.md`

## Protections

- Replay 005 was not read, hashed, opened, copied, or processed.
- Replays 006-008 were not processed.
- Candidates 011-020 were not touched.
- `samples/**` was not read or written.
- `output/replays/**` was not modified.
- No replay bytes were copied.
- No parser internals were modified.
- No canonical schema was modified.
- No canonical package was constructed.
- No spatial, mechanic, fight, rotation, pressure, macro, role, ML, or decision output was emitted.
- Task 106 was not created.

## Validation

- `node --test tests/local-replay-entity-lookup-diagnosis.test.mjs`
- `node tools/diagnose-local-replay-entity-lookup.mjs --input .local/deadem/replays/inbox/partida_010.dem --replay-id replay_010 --local-output .local/deadem/cache/local-replay-processing/replay_010/entity-lookup-diagnosis/ --summary-output output/local-replay-processing/replay_010-entity-lookup-diagnosis/`
- `npm run validate:tasks`
- `npm run lint`
- `npm run check:outputs`

`npm run check:outputs` continues to report only the preexisting `output/04-controller-pawn-lifecycle.json` size warning.

## Stop

Do not execute or create Task 106 without explicit authorization.
