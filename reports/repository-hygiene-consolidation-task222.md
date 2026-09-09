# Task 222 — Repository Hygiene Consolidation

## Resumo objetivo

Alegação técnica: higiene consolidada com retirement material e audit trail preservado. 254 arquivos históricos / 545.585.175 bytes Git (520,31 MiB; 59,38% do pool) saíram apenas do current tree, em 15 grupos. A meta absoluta de 500 MiB foi atingida sem ampliar retirement. Cleanup local autorizado removeu 2.696 caches / 42.993.154 bytes; já ausentes, skipped e failed: zero. Sources, ambientes, modelos, mídia, screenshots, logs e runtime foram preservados.

## Commit

- Candidate SHA resolution: post-commit-attestation: .local/codex/222/post-commit-attestation.json
- Commit-base: cc54371d58febb40ac56480a732bfa6f1db5389d
- Branch: main
- Commits adicionados: 1

## Arquivos alterados

Este relatório, mais os seguintes arquivos novos/modificados:

- AGENTS.md
- artifacts/repository-hygiene/task222/experiment-index.json
- artifacts/repository-hygiene/task222/gate.json
- artifacts/repository-hygiene/task222/kept-groups.json
- artifacts/repository-hygiene/task222/protected-path-preflight.json
- artifacts/repository-hygiene/task222/reference-closure.json
- artifacts/repository-hygiene/task222/retirement-manifest.json
- artifacts/repository-hygiene/task222/summary.json
- artifacts/repository-hygiene/task222/validation-evidence.json
- data/artifact-storage-policy.json
- data/current-project-index.json
- data/project-coordination-state.json
- docs/codex/CURRENT_STATE.md
- docs/codex/HISTORICAL_ARTIFACT_RECOVERY.md
- docs/codex/OUTPUT_AND_ARTIFACT_POLICY.md
- docs/codex/WORKFLOW.md
- scripts/apply-frozen-occupancy-generalization.js
- scripts/build-one-second-spatial-extraction.js
- scripts/build-unified-match-state-timeline.js
- scripts/check-output-sizes.js
- scripts/codex-workflow.js
- scripts/compare-frozen-occupancy-one-second.js
- scripts/extract-multi-replay-death-events.js
- scripts/historical-artifact-reader.mjs
- scripts/hygiene-paths.mjs
- scripts/task222-validation-guard.mjs
- scripts/validate-task-queue.js
- tasks/completed/222-repository-hygiene-consolidation.md
- tasks/specs/222.json
- tests/changed-artifact-guard.test.mjs
- tests/codex-workflow-coordination.test.mjs
- tests/codex-workflow/codex-workflow.test.mjs
- tests/helpers/coordination-state-fixture.mjs
- tests/historical-artifact-reader.test.mjs
- tests/hygiene-metadata-context.test.mjs
- tests/hygiene-protected-boundary.test.mjs
- tests/project-coordination-policy.test.mjs
- tests/remaining-human-controls-canonicalization.test.mjs
- tests/repository-hygiene-consolidation.test.mjs
- tools/canonicalize-remaining-human-pilot-replays.mjs
- tools/continuous-review/intake-model.mjs

Deleções: somente os 254 membros dos 15 seletores exatos em retirement-manifest.json, com OIDs base e retainedNames. A lista individual completa está em .local/codex/222/remediation-index-verification.json; nenhuma outra deleção. O manifesto permite enumerar a mesma lista no Git histórico sem confiar na cópia local.

## Mudanças implementadas

Antes → depois (escopo auditável comparável, exclusões da Task221 preservadas): 4778 arquivos / 935792590 bytes → 4546 arquivos / 390314518 bytes. Contabilidade por blobs Git, não espaço físico de packs; exclusões não recebem tamanho individual. Inventários completos locais; projeção final será conferida contra o index antes do commit.

Retirement: objective shards e one-second spatial de 001–004; match-state shards de 001/003/004 com exceções conservadoras preservadas; quatro full-spatial row files. Compact indexes, quality e eventos permanecem. Replay002 match-state shards permanecem para seu leitor canônico. Seis leitores históricos recebem fallback exato ao Git aceito, sem restauração ou regeneração; contratos mantidos com fixtures sintéticas.

Permaneceram 238 grupos do plano: 235 por incerteza de consumidores/evidência, 2 envelopes ativos e 1 região de exclusão. O restante do pool inicial é 2.930 arquivos / 373.211.499 bytes. Não é alegação de que o restante inteiro seja removível. Detalhes em kept-groups.json e no plano local.

Arquitetura forward-only: artifacts/ para evidência compacta; .local/ para payload denso, privado e runtime; output/ como compatibilidade histórica. Ignore não remove arquivos já tracked. Guard de novos/modificados: qualquer extensão/profundidade, 102.400 bytes, exceção somente path exato + razão, D sem stat e R pelo destino. Nenhuma exceção grande concedida nesta task.

Navegação: coordination state → current-project-index → história sob demanda. History indexes preservados integralmente. Experiments: 18 ACTIVE_REFERENCE, 12 HISTORICAL, nenhum OBSOLETE comprovado; zero movimentos.

Proteção: target identity e namespace, não strings em documentos. readTaskFiles classifica antes de lstat/read; snapshot legado agora usa dois roots locais explícitos com orçamento, sem varredura ampla. Metadados de tasks/reports/source que mencionam 005–008 são permitidos, inputs reais rejeitados antes de IO.

## Comandos executados

Git metadata: ls-tree, ls-files, diff, cat-file --batch-check e rev-parse; nenhum Git show de payload real nesta validação. Cleanup e git rm históricos já executados e não repetidos. Preflight lexical completo; close-references.mjs; regressões node --test sob guard; npm.cmd run validate:coordination, validate:tasks, lint, check:outputs. Workflow canônico prepare/preflight/validate/review e publicação: evidência observada sincronizada na atestação local, sem alegar execução futura como concluída.

## Testes e validações

- Build: not_applicable: repository hygiene sem alteração do produto compilado
- Lint: passed
- Typecheck: not_applicable: repository sem comando de typecheck

127/127 testes, zero failed/skipped na execução completa final: 40 contratos de higiene/histórico, 23 coordenação/execução e 64 Product/Review/Scrim/Intake. Validators de coordenação, tasks e guard: exit 0; lint: exit 0. Warnings Git de normalização LF/CRLF são informativos. Logs e durações em validation-evidence.json; checks canônicos e fingerprints em .local/codex/222/validate-result.json.

Referências: 16 fontes operacionais revisadas, 6 adaptadas, 272 referências de índices compactos: 254 recuperáveis no manifesto histórico e 18 ainda no index. Zero referência operacional quebrada no escopo medido. Um documento de metadata grande foi excluído da busca textual limitada; grafo anterior e readers explícitos completam a avaliação do retirement, sem alegar cobertura de consumidores externos arbitrários.

Runtime reconfirmado por loaders metadata-only: 4 targets, 207 momentos, 102 legacy, 48/57 markers, 11 campos, 15 classes de erro, 9 tracks Craig. Diff de packages, tools/review-workspace, envelopes ativos e índices históricos canônicos: vazio.

## Artifacts gerados

artifacts/repository-hygiene/task222/: summary, gate, retirement-manifest, kept-groups, protected-path-preflight, reference-closure, experiment-index e validation-evidence. .local/codex/222/: cleanup-summary, retirement-plan, reference-graph, broken-reference-checks, before-after-inventory, post-remediation-final logs/counters, context/validation/review e atestação pós-commit.

## Limitações

O incidente original mantém protected access indeterminado, registrado literalmente no JSON original; nunca convertido em zero. Epoch1 e epoch2 permanecem bloqueados e imutáveis. O último preflight não teve classificações não resolvidas. Somente post-remediation-final sustenta protected access=0, media content read=0 e replay processing=0. Um teste preliminar dessa fase falhou por classificar um documento da raiz como operacional em vez de metadata; foi corrigido e preservado no log antes da execução completa 127/127.

A instrumentação cobre APIs públicas Node e combina inspeção dos callers/Git metadata; não é sandbox de sistema operacional, nem prova retroativa do incidente. Fixtures de mídia sintéticas dos testes de intake não são mídia real.

## Riscos

Histórico exige que o commit base esteja disponível: shallow clones devem obtê-lo antes de ler artifacts retirados. Hashes antigos de arquivos Windows podem refletir CRLF; identidade Git é a referência de recuperação. .git não encolhe por retirement; não foi feito history rewrite. O tamanho local ativo da Task221 é evidência herdada, sem novo scan de dezenas de GB.

## Desvios

Suite legada tests/codex-workflow/codex-workflow.test.mjs não reexecutada integralmente: pressupostos antigos de Task900 e operações de fixture compartilhada não representam o contrato atual e causaram o incidente. Seu snapshot foi corrigido e coberto por testes injetados de limites e proteção; suites atuais de workflow/coordenação executadas. Testes canônicos antes acoplados ao HEAD/Task191 agora usam estado histórico explícito; teste de remaining canonicalization usa inputs sintéticos mantendo os asserts contratuais. Não se alega reprocessamento real dos antigos artifacts.

## Não validado

Aceitação independente de Work, gameplay, precisão semântica, ASR, sincronização, reprodução audiovisual e consumidores externos arbitrários. Não houve nova mídia, replay, candidate, frame ou registro Product. Task223 não criada.

## Gate técnico alegado

- Technical gate claim: repository_hygiene_consolidated_and_historical_output_retired

Repository Hygiene = CONSOLIDATED é alegação candidata. AlphaVeil Continuous Review Pipeline permanece GENERIC_INTAKE_READY. Próximo macro entregável informado por Work: Continuous Review Processing V1, não iniciado e dependente de aceitação/autorização separada.

Final acceptance remains pending independent ChatGPT Work validation.

## Push e estado final

- Push status: not_attempted:at_report_freeze_see_synchronized_post_commit_attestation
- HEAD source: post-commit-attestation
- Origin ref: origin/main
- Final status: VALIDATING

O relatório versionado congela antes do commit; SHA, merge-base, contagem, árvore limpa e resultado real de push são resolvidos na atestação sincronizada sem amend ou commit adicional. lastAcceptedTaskId continua 221 e lastAcceptedCommit permanece a base aceita.
