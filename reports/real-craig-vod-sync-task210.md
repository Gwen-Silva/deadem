# Task 210 — Validate Real Craig to VOD Synchronization

## Resumo objetivo

Dois VODs reais foram alinhados à gravação Craig aceita por correlação de áudio,
com anchors separados de ajuste e validação. Ambos atingiram os limites
preferenciais declarados. O player oferece as duas sessões reais. Trata-se de
alegação técnica para validação independente de Work, não autoaceitação.

## Commit

- Candidate SHA resolution: post-commit-attestation: .local/codex/210/post-commit-attestation.json
- Commit-base: 6a8fa7433f75f6cd94499e7e32e31f4e81da86d8
- Branch: main
- Commits adicionados: 1
- Mensagem: Validate real Craig to VOD synchronization

A aceitação da Task 209 foi fornecida externamente e persistida nesta Task 210.
O candidato atual não altera seu próprio `lastAcceptedCommit`. A atestação
resolve SHA, merge-base, lista de commits e publicação sem commit adicional.

## O que passou a funcionar

`npm.cmd run review:scrim` oferece `review_match_003` e `review_match_004` com
VOD real, nove linhas do mixer e modelos `audio_cross_correlation`, status
`validated`. A sessão sintética da Task 209 permanece disponível e rotulada.
Controles só são liberados após o seek inicial, corrigindo uma corrida observada
no primeiro canário real. O canário final exige atingir o timestamp solicitado.

Na segunda partida, seis tracks estão ativas no início e cinco no meio/fim:
as demais já terminaram na gravação. Elas ficam visíveis como fora da track,
sem silêncio acrescentado, conteúdo fabricado ou alongamento dos originais.

## Valor observável

Todos os tempos abaixo são segundos, exceto onde indicado. Craig e VOD são
eixos de mídia; não representam automaticamente o relógio interno da partida.

| Métrica | review_match_003 | review_match_004 |
|---|---:|---:|
| Duração VOD | 2828.970000 | 3730.966016 |
| Craig range | 0–2790.315500 | 4226.330875–7957.296891 |
| VOD range | 38.654500–2828.970000 | 0–3730.966016 |
| Fit / validation anchors | 12 / 11 | 11 / 10 |
| Modelo escolhido | offset_only | offset_only |
| Slope | 1 | 1 |
| Intercept | 38.654500 | -4226.330875 |
| Fit MAE / mediana / máximo | .145000 / .142562 / .181125 | .127625 / .151625 / .233500 |
| Validation MAE | .148318 | .117750 |
| Validation mediana absoluta | .150875 | .101125 |
| Validation p90 absoluto | .158000 | .216238 |
| Validation máximo absoluto | .168250 | .221750 |
| Residual início, média assinada | -.040750 | .001667 |
| Residual fim, média assinada | -.045292 | .054375 |
| Variação início/fim | .004542 | .052708 |
| Erro operacional estimado | .201125 | .253500 |
| Outliers do fit rejeitados | 0 | 0 |
| Regiões/grupos rejeitados por qualidade | 1 | 3 |
| Browser start/middle/end | 3/3 passou | 3/3 passou |
| Drift máximo do transporte, ms | 83.580 | 64.934 |
| Correções de rate / hard seek | 16 / 0 | 0 / 0 |
| Startup após carga, ms | 24.600 | 23.600 |

O erro operacional é o maior residual observado em fit ou validação mais
20ms de margem de análise. Não é intervalo estatístico para áudio não medido.
O residual de mapping e o drift do transporte nunca são somados ou confundidos
como se fossem a mesma medida.

### Comparação de modelos

Match 003: affine slope .999998320823, intercept 38.662078436, validation MAE
.147642 e máximo .172126. O ganho de MAE é inferior a 1ms e o máximo piora.
Match 004: affine slope .999973674034, intercept -4226.238522449, validation
MAE .131435 e máximo .168118. O máximo melhora, mas o MAE piora.
Em ambos, a regra congelada de ganho mínimo de 20ms e 20% sem pior máximo
favorece o modelo simples. Validation não participou do fit de nenhum modelo.

### Associação e checks visuais

Múltiplos matches de waveform distribuídos sustentam dois ranges Craig
distintos e ordenados, sem inversão de targets. Na inspeção visual local:
003 mostra início de partida em VOD 38–46s, clock 0:10 em VOD 58s, 46:12 em
2820s e 46:16 em 2825s com overlay de finalização. 004 mostra pré-jogo em 25s,
clock 0:23 em 75s, pausa em 4:02 nos VOD timestamps 330/355/365s e 56:04 em
3725s com overlay de finalização. A pausa explica parte da diferença entre
duração do vídeo e clock interno. Esses checks não criam fatos canônicos de
resultado, identidade ou gameplay.

Os countdowns numéricos exatos não foram lidos nos frames selecionados.
As durações de leaderboard fornecidas pela usuária continuam hipóteses humanas:
os frames finais amostrados mostram loading, não essa duração. Frases lembradas
foram preservadas apenas localmente; não viraram ground truth sub-frame.

## Arquivos alterados

- `package.json`
- `tools/review-workspace/measure-real-craig-sync.py`
- `tools/review-workspace/real-sync-model.mjs`
- `tools/review-workspace/prepare-real-sync.mjs`
- `tools/review-workspace/real-sync-browser-canary.mjs`
- `tools/review-workspace/emit-real-sync-readiness.mjs`
- `tools/review-workspace/scrim-model.mjs`
- `tools/review-workspace/scrim-media.mjs`
- `tools/review-workspace/scrim-browser-canary.mjs`
- `tools/review-workspace/public/scrim-app.mjs`
- `tests/real-craig-vod-sync.test.mjs`
- `tests/scrim-player-http.test.mjs`
- `docs/codex/REAL_CRAIG_VOD_SYNC_CONTRACT.md`
- `data/project-coordination-state.json`
- `data/task-contribution-index.json`
- `data/capability-index.json`
- `data/current-artifact-registry.json`
- `docs/PROJECT_STATE.md`
- `docs/NEXT_MILESTONE.md`
- `docs/codex/CURRENT_STATE.md`
- `tasks/specs/210.json`
- `tasks/completed/210-real-craig-vod-sync.md`
- `reports/real-craig-vod-sync-task210.md`
- `output/local-replay-processing/craig-multitrack/task210-real-sync/manifest.json`
- `output/local-replay-processing/craig-multitrack/task210-real-sync/match-003-sync-summary.json`
- `output/local-replay-processing/craig-multitrack/task210-real-sync/match-004-sync-summary.json`
- `output/local-replay-processing/craig-multitrack/task210-real-sync/validation-summary.json`
- `output/local-replay-processing/craig-multitrack/task210-real-sync/gate.json`
- `output/local-replay-processing/craig-multitrack/task210-real-sync/privacy-audit.json`

## Mudanças implementadas

Extração temporária mono com PTS preservado; coarse alignment por envelope RMS;
fine alignment por waveform individual; política de regiões, confiança e split
declarada antes do fit; rejeição robusta apenas no fit; comparação independente
offset/affine. Registro local de sessões reais exige métricas suficientes,
precisão rotulada corretamente e source refs allowlisted antes de acessar mídia.
HTTP Range e opaque IDs são preservados. Nenhum path arbitrário vem do browser.
O emitter verifica fingerprints do código/browser e refaz apenas a análise
aritmética das anchors existentes, sem reprocessar áudio.

## Comandos executados

- `git status --short`, `git branch --show-current`, `git rev-parse HEAD`, `git rev-parse origin/main`
- `npm.cmd run codex:prepare -- --task 210`
- `.venv-video/Scripts/python.exe -B tools/review-workspace/measure-real-craig-sync.py extract`
- Mesmo tool com `coarse`, `anchors` e `frames`
- `node tools/review-workspace/prepare-real-sync.mjs`
- `node tools/review-workspace/real-sync-browser-canary.mjs` com módulo Playwright local explícito
- `node tools/review-workspace/scrim-browser-canary.mjs` com o mesmo runtime
- `npm.cmd run emit:real-craig-vod-sync-readiness`
- `node --test` para as seis suítes sync/scrim/workspace declaradas no spec
- `npm.cmd run validate:coordination`, `npm.cmd run validate:tasks`, `npm.cmd run lint`, `npm.cmd run check:outputs`
- `git fetch origin main`

Preflight, validate e review formais usam task 210 e a base completa acima;
seus resultados e o estado de publicação são resolvidos na evidência local
do workflow e na atestação pós-commit, sem embutir SHA autorreferente.

## Testes e validações

40/40 testes nas seis suítes específicas/regressivas passaram, exit 0.
Cobrem offset/affine, seleção por validação, independência, outliers, clocks,
schema real, targets/refs, Range MP4/WAV, traversal, replay/.dem e aliases
protegidos, nove tracks, mute/solo/multi-solo, drift e workspace anterior.
Canário real final passou para 2/2 sessões e 6/6 regiões; zero browser errors.
Sintético passou nove tracks, dez seeks, .5/1/1.5x, recuperação de 800ms
injetados e três larguras sem overflow. Drift natural máximo sintético 106.618ms.

- Build: not_applicable: standalone Node browser modules and local Python analysis; no package build changed
- Lint: passed
- Typecheck: not_applicable: JavaScript and Python without a task-specific static type build

Coordination e task queue passaram. `check:outputs` retorna exit 1 apenas pela
pendência histórica `output/04-controller-pawn-lifecycle.json`, 106.64MiB,
explicitamente tolerada pelo spec; esse arquivo não foi alterado. Warnings
LF→CRLF do Git refletem a configuração Windows existente, sem mudança de config.
Logs formais ficam em `.local/codex/210/logs/`.

A execução adicional das três suítes históricas de governança teve 18/23
passando, exit 1. Cinco testes ainda exigem Task 191, base 13a3da64 e branch
task191-correction no estado corrente. Comparação read-only com a base aceita
mostrou que ela já declara Task 209, base db7cdded e main; os testes e scripts
de governança não têm diff nesta task. São premissas históricas incompatíveis
com o estado já aceito, não uma regressão do player. Não foram corrigidas nem
silenciadas. Os validators correntes de coordenação/task queue passam. O
primeiro validate formal também apontou o campo Status do arquivo completed;
foi corrigido para completed, mantendo Coordination status VALIDATING.

## Artifacts gerados

Seis JSONs compactos no diretório Task 210 listado acima. Áudio temporário,
diagnósticos, anchors detalhadas, hipóteses humanas, 24 frames, seis screenshots
do player, configuração e canários ficam exclusivamente em
`.local/deadem/review-workspace/scrim/real-sync-task210/`.
Nenhum output versionado aceito da Task 208/209 foi regenerado.

Privacy audit passou: zero nomes reais, transcript fields, paths absolutos ou
mídia embutida nos artifacts compactos. Auditoria cobre conteúdo e allowlists
fixas; não é alegada como trace completo do sistema operacional. Sem .dem,
diretórios replay, aliases 005–008 ou pacotes protegidos modificados.

## Impacto no módulo

O transporte antes sintético agora possui dois mappings reais medidos e sessões
operacionais para revisão humana. Essa capacidade continua candidata até Work
inspecionar o commit. O blocker ASR da Task 208 permanece integralmente ativo.

## Limitações

Não houve julgamento humano de escuta. O canário combina frames reais vistos,
waveform correlation e transporte medido; não prova percepção perfeita.
As latências de caminhos de áudio distintos explicam parte do residual.
Nem todas as nove tracks aparecem no áudio do VOD; a precisão individual de
tracks sem anchor não foi demonstrada. A seleção entre dois modelos usou o
conjunto de validação declarado, não um terceiro teste independente.

## Riscos

Ativar VOD audio junto de Craig pode duplicar vozes. Precisão é operacional,
não sub-frame garantida nem evidência semântica. As incertezas replay-to-VOD
anteriores não são resolvidas por este mapping Craig-to-VOD.

## Desvios

O runtime não possui SciPy nem Pillow. A implementação usa NumPy FFT e PyAV
para as mesmas operações locais, sem instalação adicional. O primeiro canário
revelou a corrida de carregamento/seek; foi preservado como diagnóstico local,
corrigido e substituído por evidência final válida. Nenhum threshold de áudio
foi ajustado após ver os residuals de validação.

## Não validado

Sem ASR novo, benchmark, transcript semântico, fatos de morte, resultado
canônico, intenção, estratégia, identidade biométrica ou replay parsing.
Sem leaderboard factual nem verdict humano de escuta.

## Próximo objetivo

Somente validação independente de Work desta Task 210. Não iniciar nova fase,
Task 211 ou benchmark ASR nesta execução.

## Previsão operacional

Uma execução técnica funcional concluída; um gate de Work permanece pendente.
Não se promete prazo para a validação independente.

## Gate técnico alegado

- Technical gate claim: two_real_craig_vod_sessions_synchronized_and_player_ready

Final acceptance remains pending independent ChatGPT Work validation.

## Push e estado final

- Push status: not_attempted:pre_publication_review
- HEAD source: post-commit-attestation
- Origin ref: origin/main
- Final status: VALIDATING

Este relatório é congelado antes do commit. A atestação local sincronizada
registra o resultado efetivo posterior de commit/push/review. Task 211 inexistente.
