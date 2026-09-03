# Task 214 — AlphaVeil Home, Matches and Match Overview

## Resumo objetivo

### Resultado

The accepted AlphaVeil shell now provides a real-data Home, functional match
library and allowlisted Overview for Scrim 01–04. Technical gate claim:
`alphaveil_home_matches_match_overview_ready`. Task 214 remains `VALIDATING`.

### O que passou a funcionar

Home uses the real four-target catalog, real safe covers and a real-state
Continue block. `/matches` lists all four scrims with derived progress and
useful capability labels. Each Overview presents a cover, available materials,
actual review counts, deterministic real moments and friendly Review links.
Only 003/004 expose real synchronized Replay actions.

### Valor observável

| Match | Moments | Cover | Communication | Synchronized Replay |
| --- | ---: | --- | --- | --- |
| Scrim 01 | 67 | real representative frame | legacy evidence | unavailable |
| Scrim 02 | 35 | real representative frame | legacy evidence | unavailable |
| Scrim 03 | 48 | real representative frame | multitrack context | available |
| Scrim 04 | 57 | real representative frame | multitrack context | available |

Total: four matches, 207 existing candidates represented as prepared moments,
102 historical 001/002 fingerprints preserved. Progress states and counts are
computed from local human review state; `skipped` counts as processed but stays
distinct from `reviewed`. No arbitrary percentage remains.

### Experiência visual

Real gameplay imagery is framed by the accepted near-black/violet AlphaVeil
system. Home is spacious and editorial; Matches uses image-led cards; Overview
uses a large cover, capability cards, a simple progress surface and six
deterministic pending/active moments. Small hover lift, border/cover emphasis,
focus-visible and reduced-motion behavior are preserved. Desktop sidebar and
mobile drawer layouts passed without horizontal overflow.

### Product data integrity

Names derive only from allowlisted target suffixes. Covers come only from
existing visual evidence through opaque media URLs. Materials derive from the
workspace, legacy audio evidence, multitrack context and real session registry.
Dates, opponents, results, maps, lineups, competitions, highlights, errors and
importance are absent because the accepted data does not establish them.

### Navegação

Home → Matches → Overview → Moment → Review resolves target and candidate via
friendly allowlisted URLs. The isolated canary selected Scrim 03 / Moment 25,
saved state, returned through Home Continue Review, opened the real 003 session,
used the nine-track mixer and returned. Overview 001 correctly omits Replay and
still opens the legacy Review flow.

## Commit

- Candidate SHA resolution: post-commit-attestation: .local/codex/214/post-commit-attestation.json
- Commit-base: 9fb3cb8ebb63f1f2655439297e59f3b4dd03a9f1
- Branch: main
- Commits adicionados: 1

Exact message: `Build AlphaVeil home and match experience`. This report is
frozen before commit; the exact candidate SHA, merge-base, remote equality and
clean-tree evidence are resolved by the referenced local post-commit attestation.

## Arquivos alterados

- `tools/review-workspace/product-view-model.mjs`
- `tools/review-workspace/server.mjs`
- `tools/review-workspace/alphaveil-match-experience-browser-canary.mjs`
- `tools/review-workspace/public/product-app.mjs`
- `tools/review-workspace/public/product-navigation.mjs`
- `tools/review-workspace/public/app.js`
- `tools/review-workspace/public/shell.mjs`
- `tools/review-workspace/public/styles.css`
- `tools/review-workspace/public/styles/components.css`
- `tools/review-workspace/public/styles/product.css`
- `tests/product-view-model.test.mjs`
- `tests/alphaveil-app-shell.test.mjs`
- `docs/codex/ALPHAVEIL_MATCH_EXPERIENCE_CONTRACT.md`
- coordination/current-state documents and indexes
- Task 214 spec, completion record, report and two compact outputs

## Mudanças implementadas

A dedicated product view model translates accepted workspace structures into
safe match, progress, cover, material and moment concepts. The server adds
allowlisted product APIs and dynamic Overview routes. The browser layer renders
Home, match filters/cards and Overview without exposing private paths. Friendly
navigation resolves public match/moment numbers back to existing Review items.
Sidebar Preview badges are explicit and the fake 42% component width is removed.

## Comandos executados

- `git fetch origin main` plus branch/base/status preflight.
- `npm.cmd run codex:prepare -- --task 214`.
- Node syntax checks and dedicated/integrated/regression test matrices.
- Real Chromium browser canary using isolated `.local/codex/214/` state.
- Task preflight, coordination/task validators, lint and output checks.
- Explicit staging audit, one commit and normal push are recorded in the local
  post-commit attestation.

## Testes e validações

Product plus integrated Review/Replay tests: 53/53 passed. Accepted Task 212
regression: 74/74 passed. Chromium 152 passed six flow/check groups with zero
browser errors and six screenshots at 1920×1080, 1440×900 and 390×844.
Coverage includes identities, states, covers/fallback, capabilities, safe APIs,
friendly links, protected rejection, legacy fingerprints, save/export/reopen,
real session/pre-roll/mixer, mobile drawer and reduced motion.

- Build: not_applicable: direct Node browser modules are served without a bundle build.
- Lint: passed
- Typecheck: not_applicable: JavaScript scope has no separately configured typecheck; syntax and runtime tests passed.

## Artifacts gerados

Compact versioned summary and gate are under
`output/local-replay-processing/presentation-ux/task214-match-experience/`.
Six screenshots, isolated review state and browser evidence remain local-only
under `.local/codex/214/browser-canary/`. No image or media was duplicated.
Post-commit evidence is `.local/codex/214/post-commit-attestation.json`.

## Limitações

Assisted Review Workspace UX V2 and Synchronized Replay UX V2 are not
implemented. Patterns and Training remain Preview. Candidate selectivity,
synchronization uncertainty and ASR semantic limitations remain unchanged.
Candidates are attention regions, never confirmed gameplay events.

## Riscos

Local covers degrade to the AlphaVeil fallback if source media is unavailable.
Review progress is intentionally local, so another local state directory may
show a different honest state. No recency is claimed without timestamps.

## Desvios

The first browser run reached the required desktop flows but a mobile assertion
could not find Moment 25 after it became `in_review`. The deterministic Overview
ordering was corrected to show an active moment before pending moments; the
complete rerun passed. No accepted Review, evidence or playback logic changed.

## Não validado

No semantic accuracy, gameplay interpretation, newly inferred metadata, Task
215 behavior or independent Work acceptance is claimed. No replay, protected
fixture, ASR or new media extraction was executed.

## Gate técnico alegado

- Technical gate claim: alphaveil_home_matches_match_overview_ready

Final acceptance remains pending independent ChatGPT Work validation.

## Push e estado final

- Push status: not_attempted:pre_publication_review
- HEAD source: post-commit-attestation
- Origin ref: origin/main
- Final status: VALIDATING

The synchronized attestation records the actual push result, exact one-commit
relation, merge-base, HEAD/origin equality, clean tree and media audit. No
additional commit is created for the attestation, and no Task 215 is created.
