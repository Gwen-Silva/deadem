# Replay 009 Factual Report

## Filters

```json
{
  "replay": "replay_009",
  "mechanic": "mid_boss",
  "output": "reports\\generated\\replay-009-mid-boss-factual-report.md"
}
```

Records matched: 28

Known unavailable layers: spatial regions, lane classification, objective proximity, active-game time, mechanic activation, mechanic effects, macro interpretation.

Mechanic effects applied: 0

## Events

| Parser seconds | Demo tick | Category | Type | Subject | Confidence | Validation | Source task | Semantic limitation |
| --- | ---: | --- | --- | --- | --- | --- | --- | --- |
| 11.969 | 766 | entity_present | entity_present | 2714:253:4147866:718:-1 | confirmed | visually_supported | 063 | entity_present is first reliable observed presence only |
| 11.969 | 766 | entity_health_observed | health_observed | 2714:253:4147866:718:-1 | confirmed | not_independently_validated | 063 | health value is a raw observed property; it does not prove damage source, kill, destruction, or mechanic effect |
| 11.984 | 767 | entity_health_changed | health_changed | 2714:253:4147866:718:-1 | confirmed | not_independently_validated | 063 | health change is a raw sampled property difference; it does not prove damage source, kill, destruction, or mechanic effect |
| 12 | 768 | entity_health_changed | health_changed | 2714:253:4147866:718:-1 | confirmed | not_independently_validated | 063 | health change is a raw sampled property difference; it does not prove damage source, kill, destruction, or mechanic effect |
| 12.016 | 769 | entity_health_changed | health_changed | 2714:253:4147866:718:-1 | confirmed | not_independently_validated | 063 | health change is a raw sampled property difference; it does not prove damage source, kill, destruction, or mechanic effect |
| 12.031 | 770 | entity_health_changed | health_changed | 2714:253:4147866:718:-1 | confirmed | not_independently_validated | 063 | health change is a raw sampled property difference; it does not prove damage source, kill, destruction, or mechanic effect |
| 1516.656 | 97066 | entity_deleted | entity_deleted | 2714:253:4147866:718:-1 | confirmed | visually_confirmed | 063 | entity_deleted != destroyed, entity_deleted != secured, entity_deleted != claimed, and entity_deleted != deposited |
| 1935.266 | 123857 | entity_created | entity_created | 3289:380:6229209:718:123857 | confirmed | not_independently_validated | 063 | entity_created != spawned objective and does not prove mechanic activation |
| 1935.281 | 123858 | entity_present | entity_present | 3289:380:6229209:718:123857 | confirmed | visually_supported | 063 | entity_present is first reliable observed presence only |
| 1935.281 | 123858 | entity_health_observed | health_observed | 3289:380:6229209:718:123857 | confirmed | not_independently_validated | 063 | health value is a raw observed property; it does not prove damage source, kill, destruction, or mechanic effect |
| 1935.297 | 123859 | entity_health_changed | health_changed | 3289:380:6229209:718:123857 | confirmed | not_independently_validated | 063 | health change is a raw sampled property difference; it does not prove damage source, kill, destruction, or mechanic effect |
| 1935.313 | 123860 | entity_health_changed | health_changed | 3289:380:6229209:718:123857 | confirmed | not_independently_validated | 063 | health change is a raw sampled property difference; it does not prove damage source, kill, destruction, or mechanic effect |
| 1935.328 | 123861 | entity_health_changed | health_changed | 3289:380:6229209:718:123857 | confirmed | not_independently_validated | 063 | health change is a raw sampled property difference; it does not prove damage source, kill, destruction, or mechanic effect |
| 1935.344 | 123862 | entity_health_changed | health_changed | 3289:380:6229209:718:123857 | confirmed | not_independently_validated | 063 | health change is a raw sampled property difference; it does not prove damage source, kill, destruction, or mechanic effect |
| 1979.797 | 126707 | entity_deleted | entity_deleted | 3289:380:6229209:718:123857 | confirmed | visually_confirmed | 063 | entity_deleted != destroyed, entity_deleted != secured, entity_deleted != claimed, and entity_deleted != deposited |
|  | -1 | entity_created | entity_created | 2714:253:4147866:718:-1 | confirmed | not_independently_validated | 063 | entity_created != spawned objective and does not prove mechanic activation |
|  |  | entity_team_observed | team_observed | 3289:380:6229209:718:123857 | confirmed | not_independently_validated | 063 | team value is a raw observed property; it does not prove ownership, objective control, or side-specific mechanic effect |
|  |  | entity_team_observed | team_observed | 2714:253:4147866:718:-1 | confirmed | not_independently_validated | 063 | team value is a raw observed property; it does not prove ownership, objective control, or side-specific mechanic effect |
|  |  | entity_team_observed | team_observed | 3289:380:6229209:718:123857 | confirmed | not_independently_validated | 063 | team value is a raw observed property; it does not prove ownership, objective control, or side-specific mechanic effect |
|  |  | entity_team_observed | team_observed | 2714:253:4147866:718:-1 | confirmed | not_independently_validated | 063 | team value is a raw observed property; it does not prove ownership, objective control, or side-specific mechanic effect |
|  |  | entity_raw_state_changed | raw_state_changed | 2714:253:4147866:718:-1 | confirmed | not_independently_validated | 063 | raw_state_changed != known gameplay state |
|  |  | entity_raw_state_changed | raw_state_changed | 3289:380:6229209:718:123857 | confirmed | not_independently_validated | 063 | raw_state_changed != known gameplay state |
|  |  | entity_raw_state_changed | raw_state_changed | 2714:253:4147866:718:-1 | confirmed | not_independently_validated | 063 | raw_state_changed != known gameplay state |
|  |  | entity_raw_state_changed | raw_state_changed | 3289:380:6229209:718:123857 | confirmed | not_independently_validated | 063 | raw_state_changed != known gameplay state |
|  |  | entity_raw_state_changed | raw_state_changed | 2714:253:4147866:718:-1 | confirmed | not_independently_validated | 063 | raw_state_changed != known gameplay state |
|  |  | entity_raw_state_changed | raw_state_changed | 2714:253:4147866:718:-1 | confirmed | not_independently_validated | 063 | raw_state_changed != known gameplay state |
|  |  | entity_raw_state_changed | raw_state_changed | 3289:380:6229209:718:123857 | confirmed | not_independently_validated | 063 | raw_state_changed != known gameplay state |
|  |  | entity_raw_state_changed | raw_state_changed | 3289:380:6229209:718:123857 | confirmed | not_independently_validated | 063 | raw_state_changed != known gameplay state |

## Provenance And Descriptions

- `canon:3f9098509969dd2e`: CNPC_MidBoss 2714:253:4147866:718:-1 event entity_present received visually_supported evidence within a synchronization window of +/-22.782s. Source: output/replay-009-states/objective-structure-factual-events.jsonl; validation: visually_supported.
- `canon:c0c7a3ca07036e58`: CNPC_MidBoss 2714:253:4147866:718:-1 produced factual event health_observed at parser time 11.969s. Source: output/replay-009-states/objective-structure-factual-events.jsonl; validation: not_independently_validated.
- `canon:5882eba1344d1437`: CNPC_MidBoss 2714:253:4147866:718:-1 produced factual event health_changed at parser time 11.984s. Source: output/replay-009-states/objective-structure-factual-events.jsonl; validation: not_independently_validated.
- `canon:e86dc1e39207926b`: CNPC_MidBoss 2714:253:4147866:718:-1 produced factual event health_changed at parser time 12s. Source: output/replay-009-states/objective-structure-factual-events.jsonl; validation: not_independently_validated.
- `canon:bfb5aba5b8165efa`: CNPC_MidBoss 2714:253:4147866:718:-1 produced factual event health_changed at parser time 12.016s. Source: output/replay-009-states/objective-structure-factual-events.jsonl; validation: not_independently_validated.
- `canon:3baffb79cd33ea1f`: CNPC_MidBoss 2714:253:4147866:718:-1 produced factual event health_changed at parser time 12.031s. Source: output/replay-009-states/objective-structure-factual-events.jsonl; validation: not_independently_validated.
- `canon:4fd68196f2bb5b6c`: CNPC_MidBoss 2714:253:4147866:718:-1 was deleted from the parser entity registry at parser time 1516.656s. This deletion was not interpreted as destruction or objective completion. Source: output/replay-009-states/objective-structure-factual-events.jsonl; validation: visually_confirmed.
- `canon:660e76848bc24e84`: CNPC_MidBoss 3289:380:6229209:718:123857 produced factual event entity_created at parser time 1935.266s. Source: output/replay-009-states/objective-structure-factual-events.jsonl; validation: not_independently_validated.
- `canon:0578064c05719bc3`: CNPC_MidBoss 3289:380:6229209:718:123857 event entity_present received visually_supported evidence within a synchronization window of +/-22.782s. Source: output/replay-009-states/objective-structure-factual-events.jsonl; validation: visually_supported.
- `canon:245ad6593163dc73`: CNPC_MidBoss 3289:380:6229209:718:123857 produced factual event health_observed at parser time 1935.281s. Source: output/replay-009-states/objective-structure-factual-events.jsonl; validation: not_independently_validated.
- `canon:96de80672529baca`: CNPC_MidBoss 3289:380:6229209:718:123857 produced factual event health_changed at parser time 1935.297s. Source: output/replay-009-states/objective-structure-factual-events.jsonl; validation: not_independently_validated.
- `canon:37172f27723ed8c8`: CNPC_MidBoss 3289:380:6229209:718:123857 produced factual event health_changed at parser time 1935.313s. Source: output/replay-009-states/objective-structure-factual-events.jsonl; validation: not_independently_validated.
- `canon:77c009cece66f8b5`: CNPC_MidBoss 3289:380:6229209:718:123857 produced factual event health_changed at parser time 1935.328s. Source: output/replay-009-states/objective-structure-factual-events.jsonl; validation: not_independently_validated.
- `canon:785f0842dde76e12`: CNPC_MidBoss 3289:380:6229209:718:123857 produced factual event health_changed at parser time 1935.344s. Source: output/replay-009-states/objective-structure-factual-events.jsonl; validation: not_independently_validated.
- `canon:df32c86af894806d`: CNPC_MidBoss 3289:380:6229209:718:123857 was deleted from the parser entity registry at parser time 1979.797s. This deletion was not interpreted as destruction or objective completion. Source: output/replay-009-states/objective-structure-factual-events.jsonl; validation: visually_confirmed.
- `canon:b7ae992b2779ec0f`: CNPC_MidBoss 2714:253:4147866:718:-1 produced factual event entity_created at parser time no parser time. Source: output/replay-009-states/objective-structure-factual-events.jsonl; validation: not_independently_validated.
- `canon:1210f0ac80cd099a`: CNPC_MidBoss 3289:380:6229209:718:123857 produced factual event team_observed at parser time no parser time. Source: output/replay-009-states/objective-structure-factual-events.jsonl; validation: not_independently_validated.
- `canon:8628274c488efbed`: CNPC_MidBoss 2714:253:4147866:718:-1 produced factual event team_observed at parser time no parser time. Source: output/replay-009-states/objective-structure-factual-events.jsonl; validation: not_independently_validated.
- `canon:a7c8fc267790c055`: CNPC_MidBoss 3289:380:6229209:718:123857 produced factual event team_observed at parser time no parser time. Source: output/replay-009-states/objective-structure-factual-events.jsonl; validation: not_independently_validated.
- `canon:e85bd3c4c4998040`: CNPC_MidBoss 2714:253:4147866:718:-1 produced factual event team_observed at parser time no parser time. Source: output/replay-009-states/objective-structure-factual-events.jsonl; validation: not_independently_validated.
- `canon:15a626c61d5e7446`: CNPC_MidBoss 2714:253:4147866:718:-1 produced factual event raw_state_changed at parser time no parser time. Source: output/replay-009-states/objective-structure-factual-events.jsonl; validation: not_independently_validated.
- `canon:2c4d56f831286cc9`: CNPC_MidBoss 3289:380:6229209:718:123857 produced factual event raw_state_changed at parser time no parser time. Source: output/replay-009-states/objective-structure-factual-events.jsonl; validation: not_independently_validated.
- `canon:3e37d3abf53747e2`: CNPC_MidBoss 2714:253:4147866:718:-1 produced factual event raw_state_changed at parser time no parser time. Source: output/replay-009-states/objective-structure-factual-events.jsonl; validation: not_independently_validated.
- `canon:4e077b46b34b7a47`: CNPC_MidBoss 3289:380:6229209:718:123857 produced factual event raw_state_changed at parser time no parser time. Source: output/replay-009-states/objective-structure-factual-events.jsonl; validation: not_independently_validated.
- `canon:4f7b67febbb5ad6b`: CNPC_MidBoss 2714:253:4147866:718:-1 produced factual event raw_state_changed at parser time no parser time. Source: output/replay-009-states/objective-structure-factual-events.jsonl; validation: not_independently_validated.
- `canon:712df392a31cc575`: CNPC_MidBoss 2714:253:4147866:718:-1 produced factual event raw_state_changed at parser time no parser time. Source: output/replay-009-states/objective-structure-factual-events.jsonl; validation: not_independently_validated.
- `canon:9fd573dc19690335`: CNPC_MidBoss 3289:380:6229209:718:123857 produced factual event raw_state_changed at parser time no parser time. Source: output/replay-009-states/objective-structure-factual-events.jsonl; validation: not_independently_validated.
- `canon:d7f37fc97dec718e`: CNPC_MidBoss 3289:380:6229209:718:123857 produced factual event raw_state_changed at parser time no parser time. Source: output/replay-009-states/objective-structure-factual-events.jsonl; validation: not_independently_validated.
