# Task 202 Review Candidate Window Generator Report

### Resultado

O gerador funcional reduziu os dois timelines sincronizados a 102 regiões de
atenção para revisão. O gate técnico é
`two_match_review_candidate_windows_ready_with_low_selectivity` porque a
segunda partida ainda ocupa 90,9569% da cobertura sincronizada.

### O que passou a funcionar

Artifacts Task 199 são revalidados por tamanho/SHA antes do uso; cinco famílias
factuais alimentam bins de 5 s; seeds são selecionados por política high-recall,
mesclados, padded/split e mapeados para VOD sem refit. Cada window liga frames e
sheets coarse da Task 201 sem ler ou interpretar imagens.

### Valor observável

- `review_match_001`: 913 bins; thresholds damage/healing/economy
  2367/998/1614; seeds 126 lifecycle, 119 damage, 160 healing, 178 economy e
  212 objective-like; 795 total; 67 windows; coverage 73,2135%; duração
  mediana/p90 59/89 s; tiers high/medium/low 41/11/15.
- `review_match_002`: 419 bins; thresholds 1600/743/1313; seeds 84 lifecycle,
  80 damage, 87 healing, 99 economy e 155 objective-like; 505 total; 35
  windows; coverage 90,9569%; duração mediana/p90 78/89 s; tiers 23/4/8.
- Agregado: 1.332 bins, 1.300 seeds, 102 windows e coverage 78,7883%.
- Families por window: Match 001 = 1/2/3/4/5 families: 15/11/11/5/25;
  Match 002 = 8/4/3/4/16.
- Seeds mapped/unmapped: 1.300/0. Links: 124+68 frames coarse e 7+3 sheets.
- Task 199 bridge: 18/18 artifacts válidos. Sete outputs byte-idênticos em
  duas execuções reais.

### Impacto no módulo

O módulo `Review Window Candidate Generator` está funcional: oferece uma lista
reproduzível e navegável para escolher onde extrair evidência visual densa, sem
chamar as windows de eventos de gameplay.

### Limitação relevante

A seletividade operacional é baixa no segundo target. Nenhum retuning foi
feito: recall é prioritário e lifecycle/objective-like são seeds obrigatórios.
O blocker herdado `replay_video_sync_precision_limited` permanece explícito.

### Próximo objetivo

Após validação independente de Work, Dense Visual Extraction pode ser
separadamente autorizada sobre essas windows. Não foi iniciada e nenhuma Task
203 foi criada.

### Previsão operacional

Uma execução funcional e um gate de Work.

## Resumo objetivo

Built deterministic high-recall review-attention windows from hash-validated
Task 199 telemetry, accepted Task 200 mapping and Task 201 navigation metadata.

## Commit

- Candidate SHA resolution: post-commit-attestation: .local/codex/202/post-commit-attestation.json
- Commit-base: 3d1162d6e1d1afea4de98fdd022b91fab6388d2c
- Branch: main
- Commits adicionados: 1

## Arquivos alterados

Task 202 emitter, schema, tests, contract, seven compact outputs,
report/spec/completion and necessary coordination/navigation files. No replay,
VOD, frame, image or local detailed bin/seed file is staged.

## Mudanças implementadas

Task 199 hash bridge; 5-second factual bins; mandatory lifecycle/objective-like
seeds; 75th-percentile damage/healing/economy seeds; deterministic merge,
padding and split; review priority tiers; unchanged Task 200 mapping; Task 201
navigation links; coverage/selectivity audit.

## Comandos executados

Git/base preflight, policy/input inspection, Task 199 hash validation, Node
syntax/tests, two real deterministic emissions, repository validation, exact
staging, one commit, normal push and post-publication review.

## Testes e validações

- Build: not_applicable:node_emitter_executes_directly
- Lint: passed
- Typecheck: not_applicable:no_repository_typecheck_command
- Focused tests: 30/30 passed including the real Task 199 bridge, seed
  preservation, cross-target navigation isolation and output schema
- Determinism: 7/7 versioned artifacts byte-identical across two executions
- Real inputs: 2/2 targets, 18/18 local artifacts validated
- Replay/VOD/protected access: 0/0/0
- Interpretation/final facts/attribution: 0/0/0
- Output-size audit: passed with the pre-existing allowlisted
  `output/04-controller-pawn-lifecycle.json` exception

## Artifacts gerados

Seven bounded metadata artifacts under
`output/local-replay-processing/review-candidate-windows/task202-bounded2/`.
Detailed bins and seeds remain local-only under
`.local/deadem/review-candidates/`.

## Limitações

Match 002 coverage is operationally high. Position remains unavailable;
Task 197 has no direct review-target bridge; sync precision remains 9/2 s.

## Riscos

Review-attention windows can be overread as fights or deaths; schema and
provenance prohibit that semantic promotion.

## Desvios

None. No threshold revision was used.

## Não validado

Dense images, OCR, VLM, fight/death/killfeed/lane/minimap recognition,
composition, strategy, decision quality and player attribution.

## Gate técnico alegado

- Technical gate claim: two_match_review_candidate_windows_ready_with_low_selectivity

Final acceptance remains pending independent ChatGPT Work validation.

## Push e estado final

- Push status: not_attempted:versioned_report_precedes_publication
- HEAD source: post-commit-attestation
- Origin ref: origin/main
- Final status: VALIDATING
