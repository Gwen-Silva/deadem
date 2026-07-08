# Exact 15 Death Validation Consumption Contract

Gate: `exact_15_death_validation_consumption_contract_ready`

Task 170 defines how future consumers may use the Task 169 compact summary
without converting candidate counts into facts, deaths, kills, attribution, or
gameplay interpretation.

## Safe Labels

- `eventCount`: Source-observed counter transition candidates
- `sourceObservedCounterTransitionCandidateTotal`: Total source-observed counter transition candidates
- `duplicateKeyCount`: Duplicate transition-key count
- `validationStatus`: Compact source validation status

Forbidden labels include `Deaths`, `Total deaths`, `Kills`, `Total kills`,
`Death events`, `Player deaths`, `Match deaths`, `Combat deaths`, `Confirmed
deaths`, and `Final deaths`.

## Contract

Consumers may display compact counts, validation statuses, duplicate-key counts,
artifact paths, and explicit limitation notices. Consumers must not create
death events, respawn events, timelines, player identity, killer/victim/assist
attribution, objective attribution, final facts, canonical truth, Source 2
semantic claims, parser correctness claims, replay corruption claims, or
gameplay interpretation.

No replay was accessed or processed. No parser, emission runner, or summary
runner was executed. No new `death_validation.json` or real replay artifact was
emitted.
