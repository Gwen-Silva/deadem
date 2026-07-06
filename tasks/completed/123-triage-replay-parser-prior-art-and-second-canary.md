# Task 123: External Parser Prior-Art And Second Canary Triage

Status: completed

Gate: `replay_parser_prior_art_and_second_canary_triage_ready`

## Objective

Run bounded triage so replay_010 diagnosis does not continue indefinitely:

- inspect public parser prior art in local-only shallow clones;
- compare that prior art with replay_010 entity 2905 evidence;
- minimally probe authorized replay_011;
- recommend the safest next direction without parser fixes, recovery promotion, canonicalization, or match facts.

## Outputs

- `output/local-replay-processing/replay-parser-prior-art-and-second-canary/input-identities.json`
- `output/local-replay-processing/replay-parser-prior-art-and-second-canary/external-prior-art-inventory.json`
- `output/local-replay-processing/replay-parser-prior-art-and-second-canary/local-problem-comparison.json`
- `output/local-replay-processing/replay-parser-prior-art-and-second-canary/replay-011-probe-result.json`
- `output/local-replay-processing/replay-parser-prior-art-and-second-canary/replay-010-vs-011-comparison.json`
- `output/local-replay-processing/replay-parser-prior-art-and-second-canary/blocker-triage-matrix.json`
- `output/local-replay-processing/replay-parser-prior-art-and-second-canary/recommended-next-action.json`
- `output/local-replay-processing/replay-parser-prior-art-and-second-canary/protection-audit.json`
- `output/local-replay-processing/replay-parser-prior-art-and-second-canary/replay-specific-branch-audit.json`
- `output/local-replay-processing/replay-parser-prior-art-and-second-canary/triage-gate.json`
- `reports/replay-parser-prior-art-and-second-canary.md`

## Result

The current replay_010 blocker remains summarized as
`never_registered_entity_with_create_gap`. Public prior art from clarity, manta,
demoparser, and demoinfocs-golang was inspected in local-only shallow clones;
the inspected PacketEntities paths did not show implicit CREATE behavior for
UPDATE to a never-registered entity.

Replay_011 was probed only through load plus bounded `nextTick` advancement. It
loaded successfully, advanced 1051 ticks, and failed with the same missing
entity lookup class, on entity 5624. This makes the issue no longer
replay_010-only based on local evidence.

The recommended next action is `external_oracle_next`: compare the same local
canaries against an external parser/oracle before further local parser
intervention.

## Protections

No parser default behavior changed. No recovery was added or promoted. No
canonical package, factual source artifact, snapshots, registries, match facts,
spatial/macro/mechanics/fight/decision/ML output, placeholder entity, or fake
field was emitted. No replay 005, bot fixture 006-008, candidate 012-020,
`samples/**`, or `output/replays/**` path was accessed. No raw replay bytes,
raw payloads, raw entityData, raw serializedEntities, field values, external
source tree, `.dem`, or `.local` file was committed.

No Task 124 was created.
