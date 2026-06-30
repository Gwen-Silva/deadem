# Build 23916427 Mechanics Mapping

Task 059 investigated whether Deadlock build `23916427` can be mapped to
applicable mechanics versions.

## Result

Decision model: `build_23916427_date_only_candidate_identified`

Gate: `build_23916427_mechanics_mapping_unresolved`

No exact build-to-patch mapping was found. The identifier remains classified as
`unknown_build_identifier` because no official source, Steam metadata, or local
non-replay artifact establishes whether `23916427` is a Steam build ID,
game-internal build, demo-header build, server build, or client build.

## Evidence

Official Deadlock changelog material around the replay acquisition date was
found:

- May 22, 2026 update thread
- May 25, 2026 Urn adjustments
- May 28, 2026 Urn adjustments
- June 4, 2026 Urn rework
- June 11, 2026 minor update

The replay metadata says replay 009 was acquired on 2026-06-29 with build
`23916427`. That supports only a date-supported candidate patch state after the
June 11 update and before the replay date. It does not prove exact applicability.

SteamDB/static public search did not expose a direct match for `23916427`. This
is negative evidence only, not proof that no private or API-accessible metadata
exists.

## Mechanic Applicability

- Spirit Urn: `bounded_candidate`
- Mid Boss: `unresolved_build_mapping`
- Rejuvenator: `unresolved_build_mapping`
- Souls/economy: `bounded_candidate`
- Death/respawn: `bounded_candidate`
- Core structures: `bounded_candidate`

No pilot mechanic is `confirmed_for_build` or `supported_for_build`.

## Query Behavior

`node tools/query-mechanics.mjs --mechanic spirit_urn --build 23916427 --at-date 2026-06-29`

Result remains conservative:

- applicable rules: 0
- ambiguous rules: 2
- missing build mapping: true
- candidate patch IDs: `official_2026_06_11_minor`

Task 060 remains blocked because no mechanic has confirmed or supported build
applicability.

## Validation

Validation covered knowledge schema/reference checks, query tests, Spirit Urn
and Mid Boss/Rejuvenator build queries, JSON/YAML parsing, ESLint, engine tests,
video-pipeline tests, task queue validation, and Git status validation.

No replay was processed. Replay 005 was not inspected.
