# Versioned Mechanics Knowledge

This directory stores mechanics knowledge as versioned, evidence-linked records.
It is intentionally separate from replay telemetry.

The intended analysis model is:

```text
replay telemetry
+
versioned mechanics knowledge
+
context detector
=
bounded analytical interpretation
```

The context detector does not exist yet. Current records must not be used to
classify macro decisions, rotations, fight quality, or player intent.

## Layout

- `schema/`: JSON schemas for mechanic identities, versioned rules, evidence,
  analytical implications, and telemetry requirements.
- `mechanics/`: stable mechanic packages and versioned rule records.
- `patches/`: patch registry and build-to-patch mapping.
- `sources/`: compact evidence index with source links and claim summaries.
- `validation/`: generated validation summaries.

## Validity Rules

Rules are not overwritten when mechanics change. Add a new versioned rule and
mark the previous one superseded when a patch change is confirmed.

Every rule carries:

- patch/build/date validity fields;
- a validity confidence;
- activation conditions;
- effects;
- telemetry requirements;
- analytical implications;
- prohibited inferences;
- evidence references.

Build `23916427` is currently known only from user metadata and is not mapped to
a patch. Task 059 found only a date-supported candidate patch state after the
June 11, 2026 official update and before the 2026-06-29 replay acquisition
date. Query tools must not silently apply current mechanics to that build.

Mapping categories used by this repository:

- exact build mapping: an official or direct metadata source names the build and patch.
- bounded build mapping: strong source data bounds a build interval.
- mechanic-specific bounded applicability: a mechanic rule is directly bounded even if the global build is not.
- date-only candidate: a patch date precedes the replay acquisition date, without build proof.
- unresolved applicability: no defensible mapping exists.

## Query Example

```powershell
node tools/query-mechanics.mjs --mechanic spirit_urn --build 23916427 --at-date 2026-06-29
```

Expected behavior: the query returns ambiguous rules and
`missingBuildMapping: true` until independent patch/build evidence exists.

## Evidence Policy

Source hierarchy:

1. Official Deadlock patch notes or official game data
2. Current Deadlock Wiki pages with citations/references
3. Direct controlled observations from replay or game experiments
4. Reliable community technical sources
5. Unverified community claims
6. Project hypotheses

Short claim summaries and links are stored. Full wiki pages, large HTML
snapshots, and scraped site copies should not be committed.

## Current Pilot Scope

Pilot packages exist for:

- Spirit Urn / Soul Urn
- Mid Boss
- Rejuvenator
- Souls and economy
- Death and respawn
- Core structures

Full hero and item catalogs are intentionally out of scope for this task.
