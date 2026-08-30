# Task 200 Two-Match Replay-VOD Synchronization Report

### Resultado

Sincronização funcional parcial para 2/2 partidas. Os dois modelos lineares
convertem replay elapsed time em VOD time dentro de regiões declaradas; pequenas
caudas sem âncora são rejeitadas sob `two_match_replay_video_sync_partial`.

### O que passou a funcionar

Um timestamp factual da timeline da Task 199 agora pode abrir uma região
reproduzível do VOD da Task 198 com erro explícito, provenance de âncora e sem
extrapolação silenciosa. Fit e validação usam conjuntos separados.

### Valor observável

- 2/2 pares sincronizados e 4/4 identidades SHA-256 revalidadas.
- `review_match_001`: `video = replay + 1938`; cobertura 0-4562 de 0-4570
  segundos (99,825%); validação MAE 4,667 s, mediana 5 s, máximo/erro declarado
  9 s; cauda final de 8 s rejeitada.
- `review_match_002`: `video = replay`; cobertura 0-2090 de 0-2093 segundos
  (99,857%); residual held-out 0 s e erro declarado 2 s; cauda final de 3 s
  rejeitada.
- 6 âncoras de fit, 6 de validação, 12 frames locais de evidência e 7/7
  artifacts compactos byte-idênticos em duas execuções reais.
- 18/18 testes focados e de schema aprovados.

### Impacto no módulo

O módulo está funcionalmente parcial: lookup visual já é operacional na quase
totalidade das duas timelines, com erro limitado e rejeição explícita fora da
cobertura. A precisão não é promovida a frame-exact nem a fato semântico.

### Limitação relevante

Âncoras visuais manuais e freezes de contadores replay-local são sinais de
sincronização com incerteza. Não provam pausa, evento de jogo, morte, objetivo,
luta ou decisão. O relógio exibido e valores HUD não são ground truth do replay.

### Próximo objetivo

Após validação independente de Work, usar o lookup bounded para revisão
semântica assistida sob uma task separadamente autorizada. Nenhuma Task 201 foi
criada ou iniciada.

### Previsão operacional

Uma execução funcional parcial e um gate de Work.

## Resumo objetivo

Built deterministic bounded-two replay-to-VOD mappings with four input identity
checks, separate fit/validation anchors, explicit error limits and no silent
extrapolation.

## Commit

- Candidate SHA resolution: post-commit-attestation: .local/codex/200/post-commit-attestation.json
- Commit-base: d5f3973d9ede6bf472f3d4e7e2130476902b0fca
- Branch: main
- Commits adicionados: 1

## Arquivos alterados

Task 200 emitter, strict schema, focused tests, contract, seven compact
artifacts, report/spec/completion and necessary coordination/navigation files.
No parser package, replay, VOD, sample or protected path is modified.

## Mudanças implementadas

Task 198 identity bridge with streaming revalidation; bounded local frame
extraction through the existing video pipeline; declared manual, derived and
cross-surface anchor provenance; least-squares linear fit; held-out residuals;
segmented-model support; deterministic serialization; explicit uncovered-region
rejection.

## Comandos executados

Git/base preflight, historical infrastructure inspection, bounded frame
extraction, two real emissions with compact hash comparison, focused tests,
repository validation, exact staging, one commit, normal push and post-commit
review.

## Testes e validações

- Build: not_applicable:node_tool_and_existing_python_pipeline_execute_directly
- Lint: passed
- Typecheck: not_applicable:no_repository_typecheck_command
- Focused tests: 18/18 passed
- Real inputs: 2/2 mappings; 4/4 identities matched; 7/7 compact artifacts
  byte-identical across two executions
- Coordination/task validators and task preflight: passed
- Global output-size check: allowed pre-existing failure for
  `output/04-controller-pawn-lifecycle.json` at 106.64 MiB; every Task 200
  compact artifact is under 15 KiB
- Protected access/final facts/attribution/gameplay interpretation: 0/0/0/0

## Artifacts gerados

Seven compact artifacts under
`output/local-replay-processing/replay-video-sync/task200-bounded2/`; frame
evidence remains local-only under `.local/deadem/review-sync/`.

## Limitações

The final 8 and 3 replay seconds are uncovered. Anchor uncertainty is retained
even where arithmetic residual is zero. This is synchronization evidence, not
semantic review.

## Riscos

Visual timing cues or aggregate-counter freezes could be overread as gameplay
facts; provenance classes, limitations and zero semantic outputs prohibit that
promotion.

## Desvios

None in authorized scope. Both pairs are adequately represented by linear
models, so segmented fitting was implemented and tested synthetically but not
selected for the real mappings.

## Não validado

Frame-exact ground truth, OCR generalization, displayed-clock equivalence,
confirmed deaths, attribution, fight identity, objective completion, decision
quality and strategy.

## Gate técnico alegado

- Technical gate claim: two_match_replay_video_sync_partial

Final acceptance remains pending independent ChatGPT Work validation.

## Push e estado final

- Push status: not_attempted:versioned_report_precedes_publication
- HEAD source: post-commit-attestation
- Origin ref: origin/main
- Final status: VALIDATING
- Git status final: recorded_by_post_commit_review
