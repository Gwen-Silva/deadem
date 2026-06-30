# Replay 009 Factual Report

## Filters

```json
{
  "replay": "replay_009",
  "timeline-only": true,
  "player": "76561198835717166",
  "output": "reports/generated/replay-009-player-76561198835717166-life-state-report.md"
}
```

Records matched: 24

Included record set: timeline events only; non-timeline metadata excluded.

Known unavailable layers: spatial regions, lane classification, objective proximity, active-game time, mechanic activation, mechanic effects, macro interpretation.

Mechanic effects applied: 0

## Events

| Parser seconds | Demo tick | Category | Type | Subject | Confidence | Validation | Source task | Semantic limitation |
| --- | ---: | --- | --- | --- | --- | --- | --- | --- |
| 0 | 0 | player_net_worth | player_net_worth_observed | 76561198835717166 | supported | internally_consistent | 060 | m_iGoldNetWorth is not spendable, secured, unsecured, income source, or effective combat power |
|  | 320 | player_identity | player_identity | 76561198835717166 | supported | internally_consistent | 060 | player identity is parser-derived and does not prove visual identity |
| 131 | 8384 | player_dead | dead | 76561198835717166 | confirmed | internally_consistent | 060 | death event is factual; killer/assist and strategic meaning are not inferred |
| 139 | 8896 | player_respawned | alive | 76561198835717166 | supported | internally_consistent | 060 | respawn is parser-time active-state return, not official respawn timer validation |
| 223 | 14272 | player_dead | dead | 76561198835717166 | confirmed | internally_consistent | 060 | death event is factual; killer/assist and strategic meaning are not inferred |
| 231 | 14784 | player_respawned | alive | 76561198835717166 | supported | internally_consistent | 060 | respawn is parser-time active-state return, not official respawn timer validation |
| 317 | 20288 | player_dead | dead | 76561198835717166 | confirmed | internally_consistent | 060 | death event is factual; killer/assist and strategic meaning are not inferred |
| 326 | 20864 | player_respawned | alive | 76561198835717166 | supported | internally_consistent | 060 | respawn is parser-time active-state return, not official respawn timer validation |
| 423 | 27072 | player_dead | dead | 76561198835717166 | confirmed | internally_consistent | 060 | death event is factual; killer/assist and strategic meaning are not inferred |
| 435 | 27840 | player_respawned | alive | 76561198835717166 | supported | internally_consistent | 060 | respawn is parser-time active-state return, not official respawn timer validation |
| 663 | 42432 | player_dead | dead | 76561198835717166 | confirmed | internally_consistent | 060 | death event is factual; killer/assist and strategic meaning are not inferred |
| 681 | 43584 | player_respawned | alive | 76561198835717166 | supported | internally_consistent | 060 | respawn is parser-time active-state return, not official respawn timer validation |
| 788 | 50432 | player_dead | dead | 76561198835717166 | confirmed | internally_consistent | 060 | death event is factual; killer/assist and strategic meaning are not inferred |
| 808 | 51712 | player_respawned | alive | 76561198835717166 | supported | internally_consistent | 060 | respawn is parser-time active-state return, not official respawn timer validation |
| 1451 | 92864 | player_dead | dead | 76561198835717166 | confirmed | internally_consistent | 060 | death event is factual; killer/assist and strategic meaning are not inferred |
| 1452 | 92928 | player_respawned | alive | 76561198835717166 | supported | internally_consistent | 060 | respawn is parser-time active-state return, not official respawn timer validation |
| 1621 | 103744 | player_dead | dead | 76561198835717166 | confirmed | internally_consistent | 060 | death event is factual; killer/assist and strategic meaning are not inferred |
| 1680 | 107520 | player_respawned | alive | 76561198835717166 | supported | internally_consistent | 060 | respawn is parser-time active-state return, not official respawn timer validation |
| 1787 | 114368 | player_dead | dead | 76561198835717166 | confirmed | internally_consistent | 060 | death event is factual; killer/assist and strategic meaning are not inferred |
| 1857 | 118848 | player_respawned | alive | 76561198835717166 | supported | internally_consistent | 060 | respawn is parser-time active-state return, not official respawn timer validation |
| 2024 | 129536 | player_dead | dead | 76561198835717166 | confirmed | internally_consistent | 060 | death event is factual; killer/assist and strategic meaning are not inferred |
| 2099 | 134336 | player_respawned | alive | 76561198835717166 | supported | internally_consistent | 060 | respawn is parser-time active-state return, not official respawn timer validation |
| 2116 | 135424 | player_dead | dead | 76561198835717166 | confirmed | internally_consistent | 060 | death event is factual; killer/assist and strategic meaning are not inferred |
| 2170.703 | 138925 | player_net_worth | player_net_worth_observed | 76561198835717166 | supported | internally_consistent | 060 | m_iGoldNetWorth is not spendable, secured, unsecured, income source, or effective combat power |

## Provenance And Descriptions

- `canon:f02dd6f5b3d3b2fd`: Player 76561198835717166 produced factual event player_net_worth_observed at parser time 0s. Source: output/replay-009-states/player-net-worth-series.jsonl; validation: internally_consistent.
- `canon:a9f49698e2fcfcd0`: Player 76561198835717166 produced factual event player_identity at parser time no parser time. Source: output/replay-009-states/player-identity-foundation.json; validation: internally_consistent.
- `canon:a2c88940ed27fe83`: Player 76561198835717166 was observed transitioning to dead at parser time 131s. Source: output/replay-009-states/player-life-state-events.jsonl; validation: internally_consistent.
- `canon:17ae347e0a95905f`: Player 76561198835717166 was observed returning to active state at parser time 139s. Source: output/replay-009-states/player-life-state-events.jsonl; validation: internally_consistent.
- `canon:17137f38f227e8e5`: Player 76561198835717166 was observed transitioning to dead at parser time 223s. Source: output/replay-009-states/player-life-state-events.jsonl; validation: internally_consistent.
- `canon:d452e6346774643b`: Player 76561198835717166 was observed returning to active state at parser time 231s. Source: output/replay-009-states/player-life-state-events.jsonl; validation: internally_consistent.
- `canon:d9b2e28f65de100b`: Player 76561198835717166 was observed transitioning to dead at parser time 317s. Source: output/replay-009-states/player-life-state-events.jsonl; validation: internally_consistent.
- `canon:27c617cf271a1c61`: Player 76561198835717166 was observed returning to active state at parser time 326s. Source: output/replay-009-states/player-life-state-events.jsonl; validation: internally_consistent.
- `canon:5cc15c2a30fb51f1`: Player 76561198835717166 was observed transitioning to dead at parser time 423s. Source: output/replay-009-states/player-life-state-events.jsonl; validation: internally_consistent.
- `canon:2863d32c1f5d8ebf`: Player 76561198835717166 was observed returning to active state at parser time 435s. Source: output/replay-009-states/player-life-state-events.jsonl; validation: internally_consistent.
- `canon:cf0036b367fbd315`: Player 76561198835717166 was observed transitioning to dead at parser time 663s. Source: output/replay-009-states/player-life-state-events.jsonl; validation: internally_consistent.
- `canon:451d71ed4eb8803b`: Player 76561198835717166 was observed returning to active state at parser time 681s. Source: output/replay-009-states/player-life-state-events.jsonl; validation: internally_consistent.
- `canon:ddfb459a0da8e156`: Player 76561198835717166 was observed transitioning to dead at parser time 788s. Source: output/replay-009-states/player-life-state-events.jsonl; validation: internally_consistent.
- `canon:ca2aa2cfb0c9abaf`: Player 76561198835717166 was observed returning to active state at parser time 808s. Source: output/replay-009-states/player-life-state-events.jsonl; validation: internally_consistent.
- `canon:7126a2fafbc8f5a7`: Player 76561198835717166 was observed transitioning to dead at parser time 1451s. Source: output/replay-009-states/player-life-state-events.jsonl; validation: internally_consistent.
- `canon:5e13f78cfcece5e0`: Player 76561198835717166 was observed returning to active state at parser time 1452s. Source: output/replay-009-states/player-life-state-events.jsonl; validation: internally_consistent.
- `canon:b141dc65491d1596`: Player 76561198835717166 was observed transitioning to dead at parser time 1621s. Source: output/replay-009-states/player-life-state-events.jsonl; validation: internally_consistent.
- `canon:3596a2b17af11bb4`: Player 76561198835717166 was observed returning to active state at parser time 1680s. Source: output/replay-009-states/player-life-state-events.jsonl; validation: internally_consistent.
- `canon:6b807023fbd440d6`: Player 76561198835717166 was observed transitioning to dead at parser time 1787s. Source: output/replay-009-states/player-life-state-events.jsonl; validation: internally_consistent.
- `canon:c2d27aa6764dfbda`: Player 76561198835717166 was observed returning to active state at parser time 1857s. Source: output/replay-009-states/player-life-state-events.jsonl; validation: internally_consistent.
- `canon:f3e840a49efa1200`: Player 76561198835717166 was observed transitioning to dead at parser time 2024s. Source: output/replay-009-states/player-life-state-events.jsonl; validation: internally_consistent.
- `canon:a15a1aac412078a8`: Player 76561198835717166 was observed returning to active state at parser time 2099s. Source: output/replay-009-states/player-life-state-events.jsonl; validation: internally_consistent.
- `canon:b21c993c86fd620f`: Player 76561198835717166 was observed transitioning to dead at parser time 2116s. Source: output/replay-009-states/player-life-state-events.jsonl; validation: internally_consistent.
- `canon:1dcc95888a3e1d45`: Player 76561198835717166 produced factual event player_net_worth_observed at parser time 2170.703s. Source: output/replay-009-states/player-net-worth-series.jsonl; validation: internally_consistent.
