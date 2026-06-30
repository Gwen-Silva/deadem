# Replay 009 Objective And Structure Entity Observability

Gate: `replay_009_objective_structure_observability_ready_with_gaps`

Task 062 inspected replay 009 parser-visible classes, serializers, entity mutation events, candidate raw properties, and network message names for objective/structure observability. It did not perform map projection, proximity, region/lane classification, mechanic activation, mechanic effects, fight interpretation, or macro interpretation.

## Inventory

- Classes inventoried: 825
- Serializers inventoried: 825
- Candidate properties inventoried: 490
- Lifecycle candidates found: 56
- Direct factual event messages found: 0

## Mechanic Observability

- spirit_urn: partial; classes: CCitadel_Ability_GoldenIdol, CCitadel_Ability_Tengu_Urn, CCitadel_HeroTestOrbSpawner, CCitadel_IdolCashIn, CCitadel_PickupItemSpawner, CCitadelIdolReturnTrigger, CCitadelItemPickupIdol.
- mid_boss: ready_with_constraints; classes: CNPC_MidBoss.
- rejuvenator: partial; classes: CCitadel_ArmorUpgrade_PersonalRejuvenator.
- guardian: ready_with_constraints; classes: CNPC_BaseDefenseSentry.
- walker: ready_with_constraints; classes: CNPC_Boss_Tier2.
- patron_base: ready_with_constraints; classes: CNPC_BarrackBoss, CNPC_Boss_Tier3, CNPC_TrooperBoss.

## Safe New Factual States

- mid_boss:entity_present
- mid_boss:health_value
- mid_boss:health_changed
- mid_boss:health_zero
- mid_boss:entity_deleted
- guardian:entity_present
- guardian:team
- guardian:health_value
- guardian:health_zero
- guardian:entity_deleted
- guardian:raw_state_value
- walker:entity_present
- walker:team
- walker:health_value
- walker:health_zero
- walker:entity_deleted
- walker:raw_state_value
- patron_base:entity_present
- patron_base:team
- patron_base:health_value
- patron_base:health_zero
- patron_base:entity_deleted
- patron_base:raw_state_value

## Still Prohibited

- objective secured
- urn deposited
- mid boss killed
- rejuvenator claimed
- structure strategically lost
- mechanic activation
- mechanic effects
- spatial linkage
- macro interpretation

## Next Task

Blocked follow-up: `tasks/blocked/063-convert-replay-009-objective-structure-observability-to-factual-state-events.md`.
