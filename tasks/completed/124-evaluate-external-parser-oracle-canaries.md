# Task 124 — Evaluate External Parser Oracle Canaries

Status: completed

Gate: `external_parser_oracle_canaries_ready`

## Objective

Evaluate whether mature external parser clones can serve as practical
local-only oracles for the authorized `replay_010` and `replay_011` canaries
without changing the local parser, adding recovery, constructing canonical
outputs, or emitting match facts.

## Result

- Replay identities for `partida_010.dem` and `partida_011.dem` were recorded
  as compact size/hash summaries only.
- `skadistats/clarity` was the strongest oracle candidate because its local
  source advertises Deadlock/citadel support.
- The clarity feasibility probe blocked before canary execution because the
  local Java/runtime setup was unavailable.
- `dotabuff/manta`, `LaihoE/demoparser`, and `markus-wa/demoinfocs-golang` did
  not show practical Deadlock support in the inspected local evidence.
- No external parser confirmed or contradicted the local missing-entity
  failures because no practical canary oracle ran.

## Recommendation

`manual_external_oracle_setup_needed`

A manual local-only clarity setup is the next safest step if an independent
external oracle is still desired. Further local parser interventions should
wait for either that oracle or a separately authorized opt-in fix candidate.

## Protections

- No parser or engine default behavior changed.
- No recovery was added or promoted.
- No canonical package, source artifact, factual output, spatial output,
  mechanics output, macro output, fight output, decision output, or ML output
  was produced.
- No raw replay bytes, raw payloads, raw entityData, raw serializedEntities,
  string bytes, string values, field values, external source trees, binaries,
  build artifacts, `.dem`, or `.local` files were committed.
- Replay 005, bot fixtures 006-008, candidates 012-020, `samples/**`, and
  `output/replays/**` were not used.
- No Task 125 was created.

## Outputs

- `output/local-replay-processing/external-parser-oracle-canaries/`
- `reports/external-parser-oracle-canaries.md`
