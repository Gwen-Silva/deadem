# Task 211 — Review Matches 003/004 Factual Timeline

## Resumo objetivo

### Resultado

Intake factual, telemetria replay-elapsed e composição replay → VOD → Craig
funcionam para 2/2 targets dentro da cobertura declarada. Gate técnico alegado:
`two_new_review_targets_replay_vod_craig_timeline_ready`. Task211 permanece
VALIDATING; isto não é aceitação de Work.

### O que passou a funcionar

Uma função reutilizável recebe target e replay elapsed e retorna VOD/Craig,
semântica de cada eixo e incerteza operacional. Os cinco compact artifacts
autorizados da Task210 foram comparados byte a byte com o commit aceito.
Nenhum refit Craig, tuning de playback/mixer/drift, ASR ou alteração do Workspace.

### Valor observável

| Medida | review_match_003 | review_match_004 |
|---|---:|---:|
| Replay pseudônimo | review_match_003.dem | review_match_004.dem |
| Replay bytes | 675902138 | 910296654 |
| Header | PBDEMS2 válido | PBDEMS2 válido |
| VOD bytes | 2302376421 | 3034725819 |
| VOD duração (s) | 2828.970000 | 3730.966016 |
| Replay elapsed (s) | 0–2836 | 0–3735 |
| Amostras 1Hz | 2837 | 3736 |
| Tick rate | 64 | 64 |
| Primeiro/último tick amostrado | 1 / 181504 | 1 / 239040 |
| Parser first / end tick | -1 / 181550 | -1 / 239074 |
| Monotonicidade / gaps | true / 0 | true / 0 |
| Participant local refs | 14 | 14 |
| Team refs / hero refs | 3 / 13 | 3 / 13 |
| Life-state rows | 39688 | 52269 |
| Net-worth rows | 39688 | 52269 |
| Damage positive-delta rows | 4200 | 5903 |
| Healing positive-delta rows | 5137 | 11250 |
| Objective-like rows (cadência 5s) | 11275 | 14676 |
| Position rows | 0 | 0 |

SHA-256 dos inputs, calculados por streaming:

- 003 replay: `26816db18c241ec22742802f490d036918fb2925f1d38f654c0fda8d37be10f0`.
- 003 VOD: `69fbae9ad12ba1519170372e8ced3c1cbd02a2947131e8d33ebd9904cdec0b22`.
- 004 replay: `7203a63c055f4b475cbb92d57f6371cf84009f28ae9ca899fd42e0362182161c`.
- 004 VOD: `346fd6b38e44b22dba021a069f065e52aabb2ab6e0f99bc2eb6d23e4787c6df1`.

Associação inequívoca pela pasta target explicitamente autorizada, não pelo nome.
Não se estabelecem match ID, build, data, nomes, times nomeados ou resultado.
Os 14 local refs não são uma contagem de pessoas. Nenhum warning de processamento
capturado; Logger.NOOP não fornece auditoria de todos os avisos internos do parser.
Posição é indisponível pelos campos aceitos, não declarada inexistente no binário.

| Replay → VOD | 003 | 004 |
|---|---:|---:|
| Fit / validation anchors | 6 / 6 | 6 / 6 |
| Modelo selecionado | offset_only | offset_only |
| Slope | 1 | 1 |
| Intercept (s) | 17.359375 | 21.328125 |
| Fit MAE / median / p90 / max (s) | 0 / 0 / 0 / 0 | 0.072917 / 0.093750 / 0.109375 / 0.109375 |
| Validation MAE (s) | 0.500000 | 0.072917 |
| Validation median (s) | 0.500000 | 0.093750 |
| Validation p90 / max (s) | 1.000000 / 1.000000 | 0.109375 / 0.109375 |
| Operational error (s) | 2.140625 | 1.187500 |
| Covered replay range (s) | 47.640625–2792.640625 | 53.578125–3688.781250 |
| Uncovered beginning | [0, 47.640625) | [0, 53.578125) |
| Uncovered tail | (2792.640625, 2836] | (3688.781250, 3735] |

Ambos atendem aos limites preferred de resíduos reservados. Não se afirma
precisão subsegundo a partir de relógios visuais quantizados. A margem operacional
inclui maior resíduo observado, 0.5s de quantização, 0.5s de atualização de UI e
incerteza da origem bruta. Em 003, zeros no fit refletem bins inteiros, não exatidão.

Affine 003 ficou idêntico ao offset. Affine 004 reduziu validation MAE para
0.019775s, ganho de apenas 0.053141s: abaixo dos 0.1s congelados, portanto rejeitado
por complexidade sem ganho material. Nenhum peso/threshold foi ajustado após ver
validation. Sete brackets adicionais de pausa em 004 passaram como sanity
cross-surface pós-fit; não foram usados para ajustar o modelo. Pausas existem
nos dois eixos, sem evidência de descontinuidade exclusiva que exija segmentação.

### Impacto no módulo

003/004 passam a ter uma timeline factual segura e um contrato temporal reutilizável.
O milestone de playback da Task210 já estava operacionalmente concluído pela
aceitação externa e validação humana posterior; esta task só consome sua ponte.

| Ponte Task210 / composição | 003 | 004 |
|---|---:|---:|
| Status compact artifact identity | loaded / byte-identical | loaded / byte-identical |
| Craig range (s) | 0–2790.315500 | 4226.330875–7957.296891 |
| VOD range (s) | 38.654500–2828.970000 | 0–3730.966016 |
| Craig → VOD slope / intercept | 1 / 38.654500 | 1 / -4226.330875 |
| Craig/VOD mapping error (s) | 0.201125 | 0.253500 |
| Composed operational error (s) | 2.341750 | 1.441000 |

Identidades dos summaries Task210: 003
`376c271cb5dbf503231b05d9c5518f9d1a6cfcee0d038f61f2867c5aab634ce8`;
004 `7482030f038ff273c15175be72f6c091c88040d3a94bb12ab907d699ef3b8d71`.
Manifest, validation-summary e gate também são byte-idênticos; hashes completos
constam em unified-timeline e provenance-audit. A identidade validada é a dos
artifacts aceitos: Task210 não fornecia nesses cinco arquivos SHA do VOD original;
a nova identidade binária é registrada nesta task e a duração foi confrontada.

Composição geral: `(replayModel(replay) - craigVodIntercept) / craigVodSlope`.
Contrato testado com slope != 1. Erros de origem permanecem separados em segundos
VOD; erro composto em segundos Craig divide a soma por abs(slope). Rótulo:
`conservative_operational_sum_not_statistical_confidence_bound`. Browser drift
não entra nessa soma. Start/middle/end e exterior foram exercitados em cada target;
fora da cobertura replay ambos retornam mapped=false, sem extrapolação.

### Limitação relevante

O início e o fim sem anchors permanecem descobertos. A evidência principal é
visual-temporal e raw-state, não eventos semânticos. Não se promove replay elapsed,
VOD time ou Craig time a game clock factual. Nenhuma identidade confirmada,
morte, objetivo concluído, atacante/vítima, região de mapa ou interpretação.
O blocker semântico ASR da Task208 permanece integralmente.

### Próximo objetivo

Validação independente de Work da Task211. Candidates, evidência visual densa,
bundles e integração exigem outra autorização, não iniciada aqui. Task212 inexistente.

### Previsão operacional

Uma execução técnica funcional entregue para um gate independente de Work.
Nenhuma fase posterior iniciada; sem estimativa fictícia para trabalho não autorizado.

## Commit

- Candidate SHA resolution: post-commit-attestation: .local/codex/211/post-commit-attestation.json
- Commit-base: aeb68e3ea6b9c5cc74b0f78171796728541b0b8b
- Branch: main
- Commits adicionados: 1
- Mensagem: Onboard review matches 003 and 004 into factual timeline

Merge-base, SHA real, lista de commits, estado remoto e árvore limpa são resolvidos
pela atestação pós-commit; este relatório não tenta conter o próprio SHA.

## Arquivos alterados

- `tools/emit-minimum-factual-review-telemetry.mjs` (exports/adaptação aditiva).
- `tools/review-onboarding/inputs.mjs`, `intake-telemetry.mjs`, `sample-timing.mjs`,
  `media.py`, `anchors.mjs`, `timeline.mjs`, `emit.mjs`, `anchor-plan.json`,
  `visual-observations.json`, `pause-observations.json`.
- `tests/review-onboarding.test.mjs`.
- `docs/codex/REVIEW_ONBOARDING_TIMELINE_CONTRACT.md`.
- `data/project-coordination-state.json`, `data/task-contribution-index.json`,
  `data/capability-index.json`, `data/current-artifact-registry.json`.
- `docs/PROJECT_STATE.md`, `docs/NEXT_MILESTONE.md`, `docs/codex/CURRENT_STATE.md`.
- `tasks/specs/211.json`, `tasks/completed/211-review-matches-factual-timeline.md`.
- Este relatório: `reports/review-matches-003-004-factual-timeline-task211.md`.
- Em `output/local-replay-processing/review-onboarding/task211-matches-003-004/`:
  `manifest.json`, `telemetry-summary.json`, `availability.json`,
  `replay-vod-mapping.json`, `replay-vod-validation.json`, `unified-timeline.json`,
  `gate.json`, `provenance-audit.json`.

## Mudanças implementadas

Allowlist antes de IO, resolução não recursiva, arquivos regulares sem redirects,
hashes/header/container; sampler aceito com hook opcional e defaults preservados.
Separação explícita de origens temporais, fit/validation, cobertura e incertezas.
Leitura somente dos cinco artifacts Task210, sem refit. Aceitação externa Task210
persistida sem aceitar Task211. Nenhum arquivo de package, mídia ou output aceito alterado.

## Comandos executados

- Git status/HEAD/origin/main/branch e inspeção de diff limitado.
- `npm.cmd run codex:prepare -- --task 211` e leitura integral do context packet.
- `node --max-old-space-size=8192 tools/review-onboarding/intake-telemetry.mjs`.
- `node tools/review-onboarding/sample-timing.mjs` (somente fields temporais).
- Python `-B tools/review-onboarding/media.py` com timestamps visuais explícitos
  e limitados; nenhuma extração de áudio/ASR.
- `node tools/review-onboarding/emit.mjs` e provas da composição.
- `node --test` nos cinco arquivos de onboarding e regressões 199/200.
- Python AST de `media.py`; nenhum bytecode versionado.
- `npm.cmd run validate:coordination`, `validate:tasks`, `lint`, `check:outputs`.
- Preflight/validate/review Task211 são registrados em `.local/codex/211/`;
  a atestação pós-publicação registra o Git final sem outro commit.

## Testes e validações

50/50 testes específicos e regressões 199/200 passaram, exit 0: 23 novos,
27 regressões existentes. Testes incluem sampler sintético com saúde zero,
posição e estrutura raw sem promoção; allowlist antes de FS, header/hash,
origem temporal, anchors independentes, seleção offset/affine, segmentação
condicionada, cobertura, bridges Task210 byte-idênticos e incertezas compostas.
Coordination e task queue passaram, exit 0. Python AST válido, exit 0.

- Build: not_applicable: no_compiled_package_changes_ES_modules_executed_by_tests
- Lint: passed
- Typecheck: not_applicable: no_typed_source_changes_Node_tests_and_Python_AST_used

`check:outputs` exit 1 somente pelo histórico inalterado
`output/04-controller-pawn-lifecycle.json` (106.64 MiB), exceção declarada na spec.
Maior novo output compacto: replay-vod-validation.json, abaixo de 100 KiB.
Logs finais de codex:validate/review e resultados pós-commit ficam no pacote local.

## Artifacts gerados

Oito compact artifacts versionados listados acima. Telemetria pesada somente em
`.local/deadem/review-telemetry/review_match_003/` e `review_match_004/`.
Intake privado, campos temporais, anchors e frames somente em
`.local/deadem/review-sync/review_match_003/task211/` e `review_match_004/task211/`.
Context/review/atestação em `.local/codex/211/`. Nenhum binário pesado ou transcript.

## Limitações

Posições ausentes pelos campos existentes; metadata secundária não estabelecida.
Cobertura temporal não é integral. Timers visuais quantizados são cues, não
ground truth semântico ou prova de precisão subsegundo. Nenhum output factual de
199/200 ou artifact de 210 foi regenerado. Nenhuma interpretação de gameplay.

## Riscos

UI refresh e snapshots 1Hz limitam a precisão; a margem operacional não é limite
estatístico para qualquer instante. Divergência futura dos inputs exige revalidação
explícita, não aplicação silenciosa de modelos antigos. Contagem local-ref nunca
estabelece player identity. Aceitação cabe exclusivamente a Work.

## Desvios

Necessária passagem temporal suplementar porque o sampler legado não retinha
paused-tick e timestamps brutos de transições. Famílias factuais não foram reemitidas.
Uma inspeção curta do replay003 listou somente nomes de fields GameRules para
selecionar esses campos; nenhum nome pessoal foi extraído. Um frame validation
obscurecido foi substituído antes do primeiro fit, preservando role e evidência.
Leitura opcional do helper PyAV da Task210 apenas para reutilizar API instalada;
nenhuma execução do helper ou leitura de seus inputs privados.

## Não validado

Sem aceitação independente Work nesta execução, evento semântico ground truth,
identidade real, posição/transform, ASR, candidate quality, review bundle ou
integração de candidates no Workspace. Sem nova avaliação humana de playback;
a anterior foi fornecida externamente como aceita. Nenhuma Task212.

## Gate técnico alegado

- Technical gate claim: two_new_review_targets_replay_vod_craig_timeline_ready

Privacy audit: protected access 0, final facts 0, attribution 0, interpretation 0,
ASR 0, Craig refit 0, private transcript/media versionados 0, analystInference vazio.

Final acceptance remains pending independent ChatGPT Work validation.

## Push e estado final

- Push status: not_attempted:pre_publication_review
- HEAD source: post-commit-attestation
- Origin ref: origin/main
- Final status: VALIDATING

Este relatório foi congelado antes da publicação. A atestação pós-publicação local
é a fonte sincronizada de SHA, merge-base, commit count, remote e working tree.
Nenhum segundo commit será criado apenas para alterar esta descrição temporal.
