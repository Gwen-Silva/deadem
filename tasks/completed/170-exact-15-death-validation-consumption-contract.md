# Task 170 - Define Safe Consumption Contract For Exact 15 Death Validation Summary

Status: completed

Gate: `exact_15_death_validation_consumption_contract_ready`

Commit message: `Define exact 15 death validation consumption contract`

Task 170 defined a safe consumption contract for the Task 169 exact-15 compact
summary outputs. It did not access replay files, run the parser, run emission
runners, run the Task 169 summary runner, or emit new replay artifacts.

Outputs produced:

- `output/local-replay-processing/exact-15-death-validation-consumption-contract/consumption-contract-gate.json`
- `output/local-replay-processing/exact-15-death-validation-consumption-contract/safe-field-contract.json`
- `output/local-replay-processing/exact-15-death-validation-consumption-contract/safe-label-mapping.json`
- `output/local-replay-processing/exact-15-death-validation-consumption-contract/forbidden-interpretation-policy.json`
- `output/local-replay-processing/exact-15-death-validation-consumption-contract/consumer-readiness-checklist.json`
- `output/local-replay-processing/exact-15-death-validation-consumption-contract/allowed-consumption-examples.json`
- `output/local-replay-processing/exact-15-death-validation-consumption-contract/rejected-consumption-examples.json`
- `output/local-replay-processing/exact-15-death-validation-consumption-contract/protection-audit.json`
- `reports/exact-15-death-validation-consumption-contract.md`

Safe labels:

- `eventCount` -> `Source-observed counter transition candidates`
- `sourceObservedCounterTransitionCandidateTotal` -> `Total source-observed counter transition candidates`
- `duplicateKeyCount` -> `Duplicate transition-key count`
- `validationStatus` -> `Compact source validation status`

Forbidden labels include `Deaths`, `Total deaths`, `Kills`, `Total kills`,
`Death events`, `Player deaths`, `Match deaths`, `Combat deaths`, `Confirmed
deaths`, and `Final deaths`.

The contract allows compact displays of per-replay candidate counts, aggregate
candidate totals, min/max candidate ranges, validation status, duplicate-key
counts, artifact links, and limitation notices. It rejects using the counts as
deaths, kills, confirmed deaths, final facts, timelines, player identity,
killer/victim/assist attribution, objective involvement, fight causality,
Source 2 semantics, parser correctness, replay corruption/non-corruption, or
gameplay truth.

No replay was accessed, opened, hashed, copied, inspected, parsed, or
processed. No parser, emission runner, summary runner, Java/Clarity/external
parser, WSL, iaflow, Product Reviewer automation, pull/merge/cherry-pick/rebase,
Task 171, `packages/deadem/**` change, parser/engine behavior change, recovery,
skip, placeholder, default behavior change, parser opt-in, final fact,
attribution, or gameplay interpretation was produced.

Recommended next action:
use this contract as a required review gate before any future dashboard,
report, script, or documentation consumes Task 169 compact summary fields.
