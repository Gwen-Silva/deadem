# AlphaVeil Brand, Design System and App Shell Contract

Task 213 establishes the public presentation layer around the accepted local
Review and synchronized Replay applications. `AlphaVeil` and `Competitive
Review for Deadlock` are public product language. Repository, package, API,
candidate, review-target and artifact identities remain internal and unchanged.

## Routes and surfaces

- `/`: minimal Home with direct access to Review and Matches.
- `/matches`, `/patterns`, `/training`: explicit Preview surfaces with no
  invented data, inferred patterns or generated recommendations.
- `/review`: canonical existing assisted review workspace.
- `/scrim`: canonical existing synchronized replay and multitrack mixer.

No match-detail route is part of this contract.

## Design and interaction

Near-black layered surfaces, restrained violet accents and a subtle veil
gradient form the visual direction. Shared tokens cover color, radii, shadows
and motion. Fast, normal and slow motion are 120, 180 and 260 milliseconds;
`prefers-reduced-motion: reduce` collapses motion. Plain HTML, CSS and ES
modules provide the shell, sidebar, navigation, mobile drawer, brand lockup,
cards, buttons, badges, divider, placeholder, tooltip, progress and thumbnail
primitives without external frameworks, fonts, CDNs or images.

Desktop uses a persistent sidebar. At compact widths it becomes a drawer with
an overlay, `aria-expanded`, Escape dismissal and focus return. Active
navigation uses `aria-current="page"`; keyboard focus remains visible.

## Functional and semantic boundary

The shell does not alter candidates, priority, providers, evidence, state,
save/export, segment editing, deep-link mapping, VOD transport, mixer, pre-roll,
drift correction or synchronization uncertainty. A candidate remains a
structural attention region, never a confirmed gameplay event. Private media,
screenshots, state and canary exports stay under `.local/codex/213/`. Replays
005-008 remain outside the execution boundary.
