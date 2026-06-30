# Versioned Mechanics Knowledge Foundation

Task 058 created a versioned mechanics knowledge layer under `knowledge/`.

## What Changed

- Added JSON schemas for mechanic identities, versioned mechanic rules,
  evidence, analytical implications, and telemetry requirements.
- Added pilot mechanic packages for Spirit Urn / Soul Urn, Mid Boss,
  Rejuvenator, Souls/economy, Death/respawn, and core structures.
- Added compact source evidence records using Deadlock Wiki pages as maintained
  secondary sources and one official patch-note source as evidence that mechanics
  are patch-sensitive.
- Added `knowledge/patches/build-patch-mapping.json` with build `23916427`
  recorded as unresolved rather than guessed from date.
- Added `tools/query-mechanics.mjs` for deterministic validation and rule
  queries.
- Added `tests/knowledge/query-mechanics.test.mjs`.

## Evidence Sources

- Deadlock Wiki: Soul Urn, Mid Boss, Rejuvenator, Souls, Death, Guardian,
  Walker, and Patron.
- Valve Deadlock forum update: May 27, 2025.
- Project replay 009 telemetry validation report.

The wiki is treated as a secondary source. No rule from current wiki state is
automatically applied to build `23916427`.

## Pilot Result

The foundation is usable for bounded questions such as:

- what mechanics records exist;
- which evidence supports each rule;
- which telemetry fields are required before a rule can be applied;
- whether build mapping is missing.

It is not usable for macro analysis, fight classification, rotation detection,
or decision quality.

## Query Check

Conceptual command:

```powershell
node tools/query-mechanics.mjs --mechanic spirit_urn --build 23916427 --at-date 2026-06-29
```

Expected result: no applicable rules, ambiguous Spirit Urn rules, and
`missingBuildMapping: true`.

## Validation

Task validation covers:

- duplicate mechanic IDs;
- duplicate rule IDs;
- missing evidence references;
- invalid temporal intervals;
- unresolved build mapping behavior;
- query ambiguity behavior.

## Gate

`versioned_mechanics_knowledge_foundation_ready_with_unresolved_build_mapping`

The knowledge architecture and pilot records are ready, but build `23916427`
cannot yet be mapped to applicable patch/mechanic versions through strong
evidence.

## Follow-Up Tasks

- Map build `23916427` to applicable patch/mechanic versions.
- Connect detected replay states to mechanic activation conditions.
