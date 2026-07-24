# Task 196 Functional Death-Candidate Detector MVP Report

### Resultado

Sucesso técnico. O detector recebeu os 32 replays autorizados e produziu uma
lista utilizável de candidatos estruturais em todos eles.

### O que passou a funcionar

Um replay autorizado entra pelo fluxo de observação aceito e sai como uma lista
determinística de candidatos com timestamp, score, sinais ponderados, horizonte
observado e identificador abstrato de superfície.

### Valor observável

Foram processados 32/32 replays em 1.534,3 segundos, com zero falhas e 2.664
candidatos. Cada replay produziu de 38 a 127 candidatos. O score variou de
0,853333 a 1,0; 2.434 candidatos coincidem com anchors estruturais e 85 com a
população aceita de hard challengers.

### Impacto no módulo

O MVP está tecnicamente concluído: `replay entra → lista de candidatos sai`.
Uma repetição real de replay_010 produziu duas listas de 46 candidatos com bytes
e SHA-256 idênticos.

### Limitação relevante

O score mede concordância estrutural, não probabilidade factual de morte. Os
candidatos não são mortes ou não-mortes confirmadas e não identificam vítima
ou atribuição.

### Próximo objetivo

ChatGPT Work deve validar independentemente a Task 196 e selecionar qualquer
capacidade prática posterior em uma autorização separada.

### Previsão

Falta um gate independente de Work para concluir este módulo. Nenhuma Task 197
foi criada; o prazo de um resultado funcional posterior depende da próxima
unidade que Work autorizar.

## Resumo objetivo

Built and executed a deterministic functional structural death-candidate
detector over the exact accepted bounded-32 replay membership. It emitted
2,664 candidates with complete replay coverage and no final facts or
attribution.

## Commit

- Candidate SHA resolution: post-commit-attestation: .local/codex/196/post-commit-attestation.json
- Commit-base: edf5dd86afae10b976d586e05c4b5016b7556700
- Branch: main
- Commits adicionados: 1

## Arquivos alterados

Detector tool, strict candidate schema, functional contract, focused detector
and validator tests, package command, exact bounded outputs, reproducibility
audit, coordination/navigation indexes, Task 196 spec/completion record and
this report. No package, sample, replay binary or accepted Task 190-195 factual
artifact was modified.

## Mudanças implementadas

Added a transparent score from immediate persistence, signal-family diversity,
abstract-surface support and observed follow-up. Added a 0.85 candidate
threshold, evaluation-only overlap flags, atomic publication and strict
unconfirmed semantics. Removed the overbroad factual-null alternative from the
report unresolved-marker expression and added focused regression coverage.

## Comandos executados

Executed Task 196 prepare/preflight, focused unit/schema/regression tests, two
real replay_010 reproducibility runs, the exact bounded-32 detector, repository
validators, lint, output checks, Codex validation/review, exact staging,
commit, push and fetch verification.

## Testes e validações

- Build: not_applicable:node_tool_executes_directly
- Lint: passed
- Typecheck: not_applicable:no_repository_typecheck_command

Detector schema and semantic validation passed for all 2,664 candidates. The
bounded parser completed 32/32 with zero failures. The replay_010 candidate
artifact was byte-identical across two real executions.

## Artifacts gerados

Exact bounded manifest, functional candidate list, gate, summary, root gate and
summary, plus the real-replay reproducibility audit.

## Limitações

The deterministic heuristic is not calibrated against confirmed death ground
truth. Most scores are high because the accepted structural path frequently
observes multi-family, multi-surface agreement. Evaluation overlaps do not
establish precision or recall.

## Riscos

Consumers may over-interpret a high structural score as semantic certainty.
Every row therefore preserves an unconfirmed semantic status and final-fact
false boundary.

## Desvios

The first real reproducibility attempt exposed AJV duplicate schema compilation
within one process. The detector now reuses one in-memory schema instance; the
subsequent two real executions passed with identical bytes.

The output-size check retains its pre-existing allowlisted local ignored file
`output/04-controller-pawn-lifecycle.json`; Task 196 did not create or modify
that file.

## Não validado

Confirmed deaths, confirmed non-deaths, victim identity, attribution,
killer/victim, teamfight detection, gameplay interpretation, calibrated
accuracy, precision and recall remain unvalidated and unavailable.

## Gate técnico alegado

- Technical gate claim: functional_death_candidate_detector_mvp_bounded32_ready

Final acceptance remains pending independent ChatGPT Work validation.

## Push e estado final

- Push status: not_attempted:versioned_report_precedes_push_verification
- HEAD source: post-commit-attestation
- Origin ref: origin/main
- Final status: VALIDATING
- Git status final: recorded_by_post_commit_review
