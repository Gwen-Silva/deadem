# Historical Artifact Recovery

Task222 removes 254 generated JSONL payloads (545585175 logical Git bytes) from
15 historical groups in the current tree. It does not delete Git history or
retire active AlphaVeil envelopes. The authority and complete group selectors
are in `artifacts/repository-hygiene/task222/retirement-manifest.json`.

Each group records its accepted base, original path, tree/blob identity,
retained names, consumer decision and recovery contract. The base is
`cc54371d58febb40ac56480a732bfa6f1db5389d`. Git still carries the historical
objects; current-tree byte reduction is not Git pack or fresh-clone savings.

## Operational historical readers

`scripts/historical-artifact-reader.mjs` preserves ordinary filesystem reads
when a file exists. Only an absent, explicitly retired JSONL path may fall back
to its exact historical Git blob. The adapter never restores or writes a file,
never extracts a replay and never reads media. Metadata uses `git cat-file -s`;
an explicitly invoked historical reader uses `git show base:path`. Git objects
must be present; a shallow clone lacking the accepted base must obtain that
history through an authorized Git fetch before historical execution.

The historical scripts listed in the manifest use the adapter. Their input
content contract is unchanged. Stored Git bytes use repository line endings;
do not compare a raw Windows working-tree hash with a historical Git-blob hash
as if they were the same representation. JSON records retain their semantics.
Current AlphaVeil paths do not use this fallback.

Historical indexes, reports and task records intentionally keep original
paths: they describe earlier executions. An absent path covered by the manifest
means retired-to-Git, not missing evidence. New current-runtime consumers must
not depend on a retired payload without a separately authorized design decision.

## Bounded manual recovery

First identify an exact manifest group and its retained-name exclusions. Check
the name against protected replay aliases before any filesystem/blob operation.
Resolve only the required blob at that group's base; materializing any payload
requires separate execution authority and an explicit local destination. Never
restore a whole replay root or run wildcard checkout. Do not use reset, history
rewrite, or extraction to repair an archival reference.

Replay002 match-state shards, compact quality/index/event files, active runtime
envelopes and the audit's conservative protected-name exclusions remain in the
tree. Historical canonicalization tests now use synthetic providers, while
production providers and factual transformations retain their defaults.
