# Multi-Replay Damage Healing Field Discovery

## Scope

This task discovers descriptive damage and healing fields for replays 001-004. It does not process replay 005, define fights, infer intent, judge combat quality, use occupancy episodes, or detect transitions.

## Fields found

- Controller counters: `m_iHeroDamage`, `m_iObjectiveDamage`, `m_iHeroHealing`, `m_iSelfHealing`, `m_iGuidedBotMatchDamageTaken`, `m_iGuidedBotMatchDamageToPlayers`, `m_iGuidedBotMatchDamageToGuardians`, `m_iGoldNetWorth`, `m_iAPNetWorth`.
- Pawn state fields: `m_flCurrentHealingAmount`, `m_flLastDamageTime`, `m_iHealth`, `m_iHealthMax`, `m_iMaxHealth`.

## Results

- replay_001: 35904 rows, changing fields m_iHeroDamage, m_iObjectiveDamage, m_iHeroHealing, m_iSelfHealing, m_iGoldNetWorth, m_iAPNetWorth, hero damage delta 590565, healing delta 329754.
- replay_002: 22020 rows, changing fields m_iHeroDamage, m_iObjectiveDamage, m_iHeroHealing, m_iSelfHealing, m_iGoldNetWorth, m_iAPNetWorth, hero damage delta 234409, healing delta 123614.
- replay_003: 27360 rows, changing fields m_iHeroDamage, m_iObjectiveDamage, m_iHeroHealing, m_iSelfHealing, m_iGoldNetWorth, m_iAPNetWorth, hero damage delta 493478, healing delta 331484.
- replay_004: 24156 rows, changing fields m_iHeroDamage, m_iObjectiveDamage, m_iHeroHealing, m_iSelfHealing, m_iGoldNetWorth, m_iAPNetWorth, hero damage delta 298101, healing delta 170157.

## Interpretation limits

- The useful fields are cumulative or state fields sampled once per canonical second.
- No source-target damage log is claimed.
- Deltas support descriptive temporal feasibility, not fight grouping or strategic interpretation.
- Negative or reset-like deltas are preserved in outputs instead of discarded.

## Gate

`damage_healing_fields_ready_with_limitations`
