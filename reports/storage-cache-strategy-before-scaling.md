# Storage Cache Strategy Before Scaling

## Frozen Acceptance Matrix

| Requirement | Classification |
| --- | --- |
| Define artifact classes. | required |
| Decide what belongs in Git versus local cache. | required |
| Define compact manifest strategy. | required |
| Define cache key strategy. | required |
| Define regeneration policy. | required |
| Define storage tiers. | required |
| Define scaling estimates for 15, 50, 100, and 500 replays. | required |
| Identify current known large artifacts. | required |
| Define output-size guard policy for future tasks. | required |
| Define local-only directories. | required |
| Define what must never be versioned. | required |
| Define how to preserve provenance without committing huge outputs. | required |
| Define batch-output layout for future factual expansion. | required |
| Define what Task 098 or next milestone should not do automatically. | required |
| Preserve replay 005 protection and bot-fixture restrictions. | required |
| Implement batch to 15 replays. | explicit_non_goal |
| Process new replays. | explicit_non_goal |
| Migrate existing outputs. | explicit_non_goal |
| Delete historical artifacts. | explicit_non_goal |
| Introduce Git LFS. | explicit_non_goal |
| Implement local AI. | explicit_non_goal |
| Change factual schema, canonical builder, or parser. | explicit_non_goal |
| Estimates are rough projections based on current pilot artifacts. | accepted_limitation |
| Storage cleanup remains deferred until explicitly authorized. | backlog |

Gate: `storage_cache_strategy_ready_for_scaling_decision`

## Artifact Classes

The policy defines 17 classes in `data/artifact-storage-policy.json`, including
raw replay, protected replay, unsupported bot replay, parser output, source
extraction artifact, canonical factual package, compact package manifest,
validation/audit artifact, report, benchmark/profiling artifact, local cache,
temporary rerun, logs, screenshots/videos/frames, VPK/map extracted assets,
model/runtime artifacts, and human annotations.

## Git, Local, And Forbidden Policy

Commit compact evidence: code, tests, schemas, compact docs, manifests, hashes,
small validation summaries, and bounded reports.

Keep local by default: full replay files, videos, frames, VPKs, extracted maps,
dense traces, logs, profiling, huge reruns, and large generated full packages.

Forbidden by default: raw replay commitment, protected replay access before
release, and bot-fixture processing outside authorized parser work.

## Cache-Key Policy

Required fields are replay ID, raw replay hash when allowed, source artifact
hashes, parser version or commit, canonical contract version, tool version or
commit, manifest hash, category set, extraction mode, build/version metadata
when available, and validation policy version.

Replay 005 cache keys must not require reading or hashing replay 005 before
final-holdout release.

## Regeneration Policy

Report-only or validation-only tasks must not regenerate canonical factual
packages. Human annotations and external evidence metadata are preserved.
Temporary reruns and logs remain local unless explicitly promoted as compact
evidence.

## Large-Output Policy

The current threshold is 10 MiB. New or modified large outputs require explicit
authorization, compact summary, provenance, and hash/manifest evidence.
Preexisting historical warnings are recorded but not modified.

Known current warning:

```text
output/04-controller-pawn-lifecycle.json
```

## Scaling Estimates

The projections are approximate:

| Replay count | Compact committed | Full committed | Full local plus compact committed |
| --- | ---: | ---: | ---: |
| 15 | 52,885 bytes | 212,978,985 bytes | 52,885 committed plus 212,978,985 local |
| 50 | 176,283 bytes | 709,929,950 bytes | 176,283 committed plus 709,929,950 local |
| 100 | 352,567 bytes | 1,419,859,900 bytes | 352,567 committed plus 1,419,859,900 local |
| 500 | 1,762,833 bytes | 7,099,299,500 bytes | 1,762,833 committed plus 7,099,299,500 local |

## Practical Recommendation

Before 15 replays, continue with compact package manifests and local full
package cache. Before 50, 100, or 500 replays, define cache eviction and
retention, measure real cache hit rate, and keep dense outputs outside Git.

## Before The Next Milestone

Do not create Task 098 automatically. A human decision should choose whether to
scale factual batching, improve cache tooling, or defer to another milestone.

## Protection And Migration

Replay access: none. Protected replay access: none. Bot fixture access: none.
Output migration performed: false. No historical output was deleted, moved,
compressed, archived, or rewritten.
