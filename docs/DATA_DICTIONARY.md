# Data Dictionary

This dictionary describes current working terms. Entries marked `Status: precisa de validacao` are hypotheses or derived labels that still need confirmation against Explorer or another trusted source.

## Entities

- `CCitadelPlayerController`: player controller entity from replay state. Status: observed.
- `CCitadelPlayerPawn`: player pawn entity from replay state. Status: observed.
- `controllerHandle`: handle for a player controller. Status: observed.
- `pawnHandle`: handle for a player pawn. Status: observed.
- `m_hHeroPawn`, `m_hPawn`, `m_hController`: fields used to relate controller and pawn. Status: observed, relationship logic derived.

## Identifiers

- `steamId`: string conversion of `m_steamID`. Status: observed.
- `name`: value from `m_iszPlayerName`. Status: observed.
- `lobbySlot`: value from `m_unLobbyPlayerSlot`. Status: observed.
- `heroIdRaw`: value from `m_nHeroID`. Status: precisa de validacao.

## Time

- `tick`: replay tick or derived timeline tick. Status: observed.
- `tickRate`: replay tick rate used for tick/second conversion. Status: observed.
- `second`: derived time in seconds. Status: derived.
- `relativeSecond`: time relative to a chosen baseline. Status: derived.
- `firstCompleteStateTick`: first tick where enough controller/pawn links were found for normalized player snapshots. Status: derived.

## Coordinates

- `position.x`, `position.y`, `position.z`: pawn position from body component fields. Status: observed.
- `laneDistance`: distance to a lane model or polyline. Status: derived.
- `region`: derived spatial region label. Status: precisa de validacao.

## Players

- `player`: one real replay participant, excluding SourceTV and controllers with `m_steamID = 0`. Status: derived.
- `alive`: value from player/pawn fields when available. Status: observed, interpretation precisa de validacao.
- `health`, `maxHealth`: health values, preferably from pawn fields. Status: observed.
- `level`: value from controller level field. Status: observed.

## Teams

- `team`: value from `m_iTeamNum`. Status: observed.
- Team names, colors, or side labels are derived unless explicitly validated. Status: precisa de validacao.

## Lanes

- `assignedLane`: value from `m_nAssignedLane`. Status: observed, semantics precisa de validacao.
- `originalLane`: value from `m_nOriginalLaneAssignment`. Status: observed, semantics precisa de validacao.
- `lane_1`, `lane_2`, `lane_3`: physical lane identifiers used by topology and occupancy models. Status: derived.
- Color or UI lane names should not be treated as facts until validated. Status: precisa de validacao.

## Episodes

- `episode`: contiguous derived interval matching a condition, such as stable lane occupancy. Status: derived.
- `briefContact`: short lane-like contact that did not meet stability criteria. Status: derived.
- `deployment`: sample classified near base/deployment area. Status: derived.

## Events

- `rotationCandidate`: potential movement between lane/region contexts. Status: precisa de validacao.
- Combat, objective, item, and macro events are not yet reliable derived facts. Status: precisa de validacao.

## Metrics

- `kills`, `deaths`, `assists`, `lastHits`, `denies`, `killStreak`: controller-derived stats. Status: observed.
- `heroDamage`, `objectiveDamage`, `heroHealing`, `selfHealing`: controller-derived metrics. Status: observed, semantics precisa de validacao.
- `netWorth`, `abilityPointsNetWorth`: controller-derived economy values. Status: observed, semantics precisa de validacao.

## Derived Fields

- `canonicalPlayerTimeline`: normalized player timeline used by later experiments. Status: derived.
- `laneOccupancy`: derived lane classification per sample. Status: precisa de validacao.
- `stableLaneOccupancyEpisode`: lane occupancy interval that passed stability thresholds. Status: precisa de validacao.
