# Publicacao do repositorio proprio

Status: partial

## Repositorio

- Nome: deadem
- Visibilidade: private
- Branch publicado: not published; local branch is `main`
- Origin: not configured; blocked because `gh` is not available
- Upstream: `https://github.com/Igor-Losev/deadem.git`

## Commits criados

- Hash: `a250cd3479c52ad993517435ca796366d387d18c`
- Mensagem: `chore: add persistent Codex workflow`
- Arquivos principais: `AGENTS.md`, `docs/*`, `tasks/*`, `reports/REPORT_TEMPLATE.md`, `reports/latest.md`, `reports/setup-efficient-codex-workflow.md`, `scripts/validate-experiment.js`, `scripts/check-output-sizes.js`, `scripts/summarize-experiment.js`, `package.json`

## Validacoes

- Lint: passed with `npx.cmd eslint --config eslint.common.config.js scripts\validate-experiment.js scripts\check-output-sizes.js scripts\summarize-experiment.js`
- Validacao do experimento 23: passed with `npm.cmd run validate:experiment -- 23`
- Tamanhos: passed for experiment 23 with `npm.cmd run check:outputs -- 23`; all 10 experiment 23 JSON outputs are below 10 MiB
- Outputs preservados: aggregate `output/*` hash stayed `1bac112a8e75669b288510ecb7570522455e774029cce6f014f1dd16696f5130`
- Verificacao de segredos: no publish-scope matches for credentials, absolute local paths, or `external/chat`
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

`gh` is not installed or not available in PATH, so repository creation and push could not be completed here.

Recommended manual flow:

```powershell
gh auth status
gh repo create deadem --private
git remote add origin <URL_DO_NOVO_REPOSITORIO>
git push -u origin main
git remote -v
git branch -vv
git status
```

If `deadem` already exists in the authenticated account, use this order: `deadlock-deadem`, `deadem-analysis`, `deadem-replay-analysis`.

## Evidencias

- Initial branch: `main`
- Original remote before rename: `origin -> https://github.com/Igor-Losev/deadem.git`
- Original remote after rename: `upstream -> https://github.com/Igor-Losev/deadem.git`
- `gh --version`, `gh auth status`, and `gh api user --jq .login` failed because `gh` was not recognized.
- No replay-processing command was run.
- No `git push --force`, history rewrite, branch deletion, or destructive command was run.
