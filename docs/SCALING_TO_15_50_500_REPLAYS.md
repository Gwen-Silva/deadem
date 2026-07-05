# Scaling To 15, 50, 100, And 500 Replays

The estimates in `output/five-replay-pilot/storage-cache-strategy/scaling-estimates.json`
are rough projections from the five-human-replay pilot. They are not exact
capacity predictions and do not include historical oversized outputs.

## Scenarios

| Replay count | Compact manifests committed | Full packages committed | Full packages local cache plus compact manifests |
| --- | ---: | ---: | ---: |
| 15 | 52,885 bytes | 212,978,985 bytes | 52,885 committed plus 212,978,985 local |
| 50 | 176,283 bytes | 709,929,950 bytes | 176,283 committed plus 709,929,950 local |
| 100 | 352,567 bytes | 1,419,859,900 bytes | 352,567 committed plus 1,419,859,900 local |
| 500 | 1,762,833 bytes | 7,099,299,500 bytes | 1,762,833 committed plus 7,099,299,500 local |

## Recommendation

Before 15 replays, keep the Task 095 pattern: commit compact package manifests,
validation summaries, gates, and bounded reports. Keep full package material in
local cache unless a task explicitly needs a compact committed subset.

Before 50, 100, or 500 replays, add a cache manifest and eviction policy for
`.local/deadem/cache/factual-batches/<batch-id>/`, measure real cache hit rate,
and keep large reruns/logs outside Git.

## Future Batch Layout

Committed:

```text
output/factual-batches/<batch-id>/
  manifest.json
  compatibility-matrix.json
  processing-summary.json
  performance-baseline.json
  storage-baseline.json
  replay_<id>/
    compact-package-manifest.json
    validation-summary.json
```

Local cache:

```text
.local/deadem/cache/factual-batches/<batch-id>/
```

## Boundaries

Do not release replay 005, process bot fixtures 006-008, begin spatial or
mechanics work, add local AI runtime, or create Task 098 automatically from
this strategy.
