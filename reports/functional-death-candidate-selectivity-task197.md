# Task 197 Functional Death-Candidate Selectivity And Ranking V2 Report

### Resultado

A V2 não conseguiu demonstrar a separação exigida entre anchors e hard challengers no conjunto reservado. O gate técnico conclusivo é `structural_features_insufficient_for_candidate_selectivity`.

### O que passou a funcionar

A lista agora é realmente priorizada dentro de cada replay, com score V2 reproduzível, ranking e níveis `high`, `medium` e `low`. Os labels de avaliação são anexados depois do score e não participam do cálculo.

### Valor observável

No total, os candidatos caíram de 2.664 para 2.537. A distribuição ficou em 1.125 `high`, 1.073 `medium` e 339 `low`; p50/p90 passaram de 1,0/1,0 para 0,884278/0,988167.

No desenvolvimento, a captura foi 94,797% para anchors e 84,058% para hard challengers, diferença de 10,739 pontos percentuais, com 1.906 candidatos contra 2.005 na V1.

Na validação reservada, a captura foi 95,556% para anchors e 90,909% para hard challengers, diferença de somente 4,647 pontos, com 631 candidatos contra 659 na V1. O requisito era pelo menos 10 pontos.

Os 32/32 replays autorizados foram representados sem falhas. Duas execuções de replay_010 foram byte-idênticas. Houve zero acesso aos replays 005–008, zero fatos finais e zero atribuição.

### Impacto no módulo

A infraestrutura de ranking está funcional, mas a seletividade não está concluída. Os sinais estruturais atuais são insuficientes para separar os dois grupos no conjunto reservado.

### Próximo objetivo

Após validação independente de Work, uma evolução separadamente autorizada deve adicionar nova fonte de evidência semântica ou ground truth. Não cabe continuar ajustando os mesmos pesos e thresholds.

### Previsão

Uma execução funcional foi concluída; falta um gate independente de Work. Nenhuma Task 198 foi criada.

## Resumo objetivo

Built and executed a frozen deterministic V2 priority layer over the accepted Task 196 candidates. It improved ranking shape and reduced saturation, but failed the reserved 10-point selectivity requirement.

## Commit

- Candidate SHA resolution: post-commit-attestation: .local/codex/197/post-commit-attestation.json
- Commit-base: bf42beee0b22bd921c245ce1b6485a1b617543a8
- Branch: main
- Commits adicionados: 1

## Arquivos alterados

V2 prioritization tool, strict schema, tests, contract, package command, exact Task 197 outputs, coordination/navigation state, Task 197 spec/completion record and this report. The Task 196 tool and bounded output, packages, samples and replay files were not modified.

## Mudanças implementadas

Added a frozen five-feature structural score, per-replay ordering, priority tiers, label isolation, separate development/validation metrics, deterministic replay_010 audit and explicit positive/conclusive-negative gates.

## Comandos executados

Executed Task 197 prepare/preflight, focused unit/schema tests, the frozen V2 run, repository validation, lint, output checks, exact staging, commit, push, fetch and post-commit review.

## Testes e validações

- Build: not_applicable:node_tool_executes_directly
- Lint: passed
- Typecheck: not_applicable:no_repository_typecheck_command

Focused V2 tests passed 6/6 before the reserved run. Output schema and semantic boundaries passed for 2,537 rows. Thresholds were frozen before reserved validation and were not adjusted afterward.

## Artifacts gerados

Exact split manifest, frozen development configuration, prioritized candidate list, separate development and validation metrics, reproducibility audit, summary and gate.

## Limitações

The hard-challenger evaluation population is 91 overall and 22 in reserved validation. These structural labels are not ground-truth non-deaths, and scores are not death probabilities.

## Riscos

Consumers may over-interpret ranking as semantic certainty. Every row therefore retains unconfirmed structural semantics and `finalFact: false`.

## Desvios

The reserved result was retained without post-validation tuning. Two legacy
Task 191 coordination assertions remain hard-coded to the historical Task 190
accepted state and therefore fail after the authorized accepted state advanced
to Task 196; they are outside Task 197's authorized test scope. The Task 197
coordination validator, task queue validator and execution-contract tests pass.

The output-size workflow retains its pre-existing allowed failure for ignored
`output/04-controller-pawn-lifecycle.json`; Task 197 did not create or modify
that file.

## Não validado

Confirmed deaths, confirmed non-deaths, calibrated accuracy, precision, recall, victim identity, attribution, killer/victim, teamfight and gameplay interpretation remain unavailable.

## Gate técnico alegado

- Technical gate claim: structural_features_insufficient_for_candidate_selectivity

Final acceptance remains pending independent ChatGPT Work validation.

## Push e estado final

- Push status: not_attempted:versioned_report_precedes_push_verification
- HEAD source: post-commit-attestation
- Origin ref: origin/main
- Final status: VALIDATING
- Git status final: recorded_by_post_commit_review
