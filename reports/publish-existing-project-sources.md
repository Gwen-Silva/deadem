# Publicacao dos fontes existentes do projeto

Status: completed

## Arquivos e diretorios publicados

- `.gitignore`
- `experiments/01-validate-replay.js`
- `experiments/02-inspect-player-fields.js`
- `experiments/03-normalize-player-snapshots.js`
- `experiments/04-analyze-controller-pawn-lifecycle.js`
- `experiments/05-discover-game-clock.js`
- `experiments/06-reconcile-tick-domains.js`
- `experiments/07-player-timeline.js`
- `experiments/08-analyze-data-quality.js`
- `experiments/09-build-canonical-player-timeline.js`
- `experiments/10-map-hero-identities.js`
- `experiments/11-reconcile-hero-identities.js`
- `experiments/12-identify-replay-build.js`
- `experiments/13-enrich-heroes-and-map-lanes.js`
- `experiments/14-discover-items-and-upgrades.js`
- `experiments/15-decode-upgrade-tokens.js`
- `experiments/16-reconcile-lane-topology.js`
- `experiments/17-build-spatial-presence-model.js`
- `experiments/18-build-movement-segments.js`
- `experiments/19-audit-rotation-candidates.js`
- `experiments/20-resolve-journey-destinations.js`
- `experiments/21-validate-and-consolidate-rotation-candidates.js`
- `experiments/22-build-lane-occupancy-model.js`
- `experiments/23-calibrate-lane-occupancy.js`

## Experimentos identificados

Foram identificados e publicados 23 experimentos numerados, de `01-validate-replay.js` ate `23-calibrate-lane-occupancy.js`.

`docs/EXPERIMENT_INDEX.md` foi comparado com a lista real de scripts e nao apresentou entradas ausentes ou extras.

## Arquivos mantidos apenas localmente

- `output/`: dados derivados.
- `samples/`: inclui `samples/partida_001.dem`, replay bruto grande.
- `external/`: fontes externas locais, incluindo arquivo grande de GameTracking.
- `node_modules/`: dependencias instaladas localmente.

## Regras finais de .gitignore

- `node_modules/`
- `output/`
- `external/`
- `tmp/`
- `temp/`
- `.env`
- `.env.*`
- `*.log`
- `*.dem`
- `samples/*.dem`

Essas regras preservam `experiments/`, `scripts/`, `docs/`, `tasks/`, `reports/`, `package.json` e `package-lock.json` como publicaveis.

## Validacoes executadas

- `git status --short`
- `git status --ignored --short`
- `git ls-files`
- `git diff -- .gitignore`
- `git check-ignore -v samples\partida_001.dem output\04-controller-pawn-lifecycle.json external\GameTracking-Deadlock\game\citadel\pak01_dir.txt experiments\01-validate-replay.js`
- `npm.cmd run`
- `npx.cmd eslint --config eslint.common.config.js experiments\*.js scripts\validate-experiment.js scripts\check-output-sizes.js scripts\summarize-experiment.js`
- `npm.cmd run validate:experiment -- 23`
- `npm.cmd run check:outputs -- 23`
- `npm.cmd run summarize:experiment -- 23`
- `git diff -- output`
- Aggregate `output/*` hash check.
- Staged diff review with `git diff --cached --stat`, `git diff --cached --name-only`, and `git status --short`.

## Commit criado

- Hash: `72c688847af2d049e2088ce8e3a37fd269775b55`
- Mensagem: `feat: publish replay analysis experiments`

## Resultado do push

`main` foi publicado em `origin/main`.

Final remotes:

- `origin`: `https://github.com/Gwen-Silva/deadem.git`
- `upstream`: `https://github.com/Igor-Losev/deadem.git`

## Inconsistencias entre experimentos e indice

Nenhuma. A lista real de 23 scripts corresponde ao indice.

## Codigo ainda nao versionado

Nenhum codigo-fonte local ficou fora do Git. Permanecem fora somente dados derivados, replay bruto, fontes externas locais, dependencias instaladas e outros arquivos ignorados.

## Evidencias

- `output/*` preservado com hash agregado `1bac112a8e75669b288510ecb7570522455e774029cce6f014f1dd16696f5130`.
- `git diff -- output` nao mostrou diferencas.
- `git status` apos o push principal informou working tree limpo.
- Nenhum novo experimento foi executado.
- Nenhum replay foi reprocessado.
- Nenhum `output/*`, `samples/partida_001.dem` ou `external/*` foi staged ou publicado.
