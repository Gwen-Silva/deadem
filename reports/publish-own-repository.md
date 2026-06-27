# Publicacao do repositorio proprio

Status: completed

## Repositorio

- Nome: deadem
- Visibilidade: private
- Branch publicado: `main`
- Origin: `https://github.com/Gwen-Silva/deadem.git`
- Upstream: `https://github.com/Igor-Losev/deadem.git`

## Commits criados

- Hash: `a250cd3479c52ad993517435ca796366d387d18c`
- Mensagem: `chore: add persistent Codex workflow`
- Arquivos principais: `AGENTS.md`, `docs/*`, `tasks/*`, `reports/REPORT_TEMPLATE.md`, `reports/latest.md`, `reports/setup-efficient-codex-workflow.md`, `scripts/validate-experiment.js`, `scripts/check-output-sizes.js`, `scripts/summarize-experiment.js`, `package.json`
- Hash: `d81cead`
- Mensagem: `docs: record repository publication`
- Arquivos principais: `reports/publish-own-repository.md`, `reports/latest.md`

## Validacoes

- Lint: passed with `npx.cmd eslint --config eslint.common.config.js scripts\validate-experiment.js scripts\check-output-sizes.js scripts\summarize-experiment.js`
- Validacao do experimento 23: passed with `npm.cmd run validate:experiment -- 23`
- Tamanhos: passed for experiment 23 with `npm.cmd run check:outputs -- 23`; all 10 experiment 23 JSON outputs are below 10 MiB
- Outputs preservados: aggregate `output/*` hash stayed `1bac112a8e75669b288510ecb7570522455e774029cce6f014f1dd16696f5130`
- Verificacao de segredos: no publish-scope matches for credentials, absolute local paths, or private chat-history markers
- Verificacao de arquivos grandes: no tracked files above 10 MiB; untracked/ignored large files are `samples/partida_001.dem`, `output/04-controller-pawn-lifecycle.json`, and `external/GameTracking-Deadlock/game/citadel/pak01_dir.txt`

## Alteracoes deixadas de fora

- Arquivo: `.gitignore`
- Motivo: preexisting local change adding `external`; kept outside commits as requested.
- Arquivo: `experiments/`
- Motivo: untracked local experiment scripts; outside publication commit scope.
- Arquivo: `output/`
- Motivo: untracked derived outputs; preserved and not committed.

## Verificacao do contexto persistente

- Ultimo experimento: `23-calibrate-lane-occupancy`
- Objetivo atual: improve derived datasets and lane occupancy quality before higher-level event analysis
- Limitacoes: lane occupancy is not ready for transition detection; old outputs can be large; hero/item/lane/event labels need validation
- Proxima decisao: improve or validate lane occupancy calibration before using it for rotations, combat, objectives, or macro events
- Contradicoes: none found from `AGENTS.md`, `docs/PROJECT_STATE.md`, `docs/EXPERIMENT_INDEX.md`, and `reports/latest.md`

## Problemas ou acoes manuais restantes

None.

## Evidencias

- Initial branch: `main`
- Original remote before rename: `origin -> https://github.com/Igor-Losev/deadem.git`
- Original remote after rename: `upstream -> https://github.com/Igor-Losev/deadem.git`
- `gh --version`, `gh auth status`, and `gh api user --jq .login` failed because `gh` was not recognized; repository creation was completed through the authenticated browser session instead.
- Created repository URL: `https://github.com/Gwen-Silva/deadem`
- Final origin: `https://github.com/Gwen-Silva/deadem.git`
- Published branch: `main`
- No replay-processing command was run.
- No `git push --force`, history rewrite, branch deletion, or destructive command was run.
