# Task 209 — Synchronized Craig Multitrack Review Playback

## Resumo objetivo

Player local com VOD master, nove tracks Craig em streaming, mixer independente
e correção de drift. Canary real de browser usa vídeo explicitamente sintético;
não declara alinhamento com VOD real.

## Commit

- Candidate SHA resolution: post-commit-attestation: .local/codex/209/post-commit-attestation.json
- Commit-base: db7cdded9b0e7539f8ac6d1ce09802fafa3b6efe
- Branch: main
- Commits adicionados: 1

## Arquivos alterados

- Runtime: `tools/review-workspace/scrim-model.mjs`, `scrim-media.mjs`,
  `public/scrim-controller.mjs`, `public/scrim-app.mjs`, `server.mjs`.
- UI: `tools/review-workspace/public/scrim.html`, `scrim.css`, `index.html`.
- Canary: `tools/review-workspace/prepare-scrim-fixture.py`,
  `scrim-browser-canary.mjs`, `emit-scrim-readiness.mjs`.
- Testes: `tests/scrim-player.test.mjs`, `tests/scrim-player-http.test.mjs`.
- Contrato: `docs/codex/SYNCHRONIZED_CRAIG_REVIEW_PLAYBACK_CONTRACT.md`.
- Coordenação: `package.json`, os quatro índices/estado autorizados de `data/`,
  `docs/PROJECT_STATE.md`, `docs/NEXT_MILESTONE.md`, `docs/codex/CURRENT_STATE.md`.
- Task: `tasks/specs/209.json`, `tasks/completed/209-synchronized-craig-review-playback.md`,
  este relatório e os três JSONs compactos em `task209-playback/`.

## Mudanças implementadas

### Resultado

Technical claim:
`craig_multitrack_synchronized_review_player_ready_for_real_sync_canary`.
Readiness: `READY_FOR_REAL_VOD_SYNC_CANARY`; Task 209 continua VALIDATING.

### O que passou a funcionar

Player da scrim opera sem transcript: play/pause, seek coordenado, velocidade,
nove gains independentes, mute/solo/multi-solo/volume, ações globais e áudio do
VOD separado. Mute prevalece sobre solo. Call isolada restaura o mix anterior.
`openScrimPlayer` aceita a futura ligação por reviewTargetId com pre-roll,
mas rejeita targets sem sessão registrada em vez de inventar associação.

### Valor observável

- 9/9 tracks existentes; um VOD sintético; zero VODs reais mapeados.
- 12 segundos contínuos, pause/resume, 10 seeks distribuídos.
- Rates 0.5x, 1x, 1.5x; slope de teste 1.002, intercept 2 s.
- startupLatencyMs: 21.4 (comando play até transporte coordenado, após preload).
- Initial page/media readiness: 352.146 ms.
- seekResyncLatencyMs: min 43.3, max 239.1, mean 135.24.
- maxObservedDriftMs: 68.155 antes da injeção deliberada.
- driftCorrectionCount: 0; hardSeekCorrectionCount: 0 no trecho natural.
- Teste separado de drift injetado: 800 ms, uma correção hard, recuperação válida.
- 1440/800/390 px: sem overflow horizontal, mixer presente; zero erros JS.
- 9/9 WAVs tiveram Range requests; maior chunk do backend: 65.536 bytes.
- Zero AudioBuffers de arquivo completo, novo ASR, .dem, replay ou VOD original.

### Impacto no módulo

Craig já é fonte multitrack/source attribution aceita. Agora há transporte e
mix operacional para escuta humana. Separação entre gravação e vodSessions
permite múltiplas scrims sem presumir uma gravação = uma partida.

### Limitação relevante

Sem VOD real autorizado para esta recording, o mapping é somente sintético.
Drift de reprodução não mede a precisão empírica Craig ↔ VOD nem gameplay.
O blocker `craig_multitrack_asr_semantic_accuracy_insufficient_for_automatic_call_evidence`
permanece. Medium é o melhor draft medido (53.85% usable / 46.15% materially
wrong em clips inteligíveis), mas ASR continua HUMAN_VALIDATION_REQUIRED.
Nenhum benchmark, sync por ASR ou interpretação estratégica foi executado.

### Próximo objetivo

Work valida o candidato independentemente. Um canary real posterior exigirá
VOD explicitamente autorizado e modelo de sync validado para esta recording.
Nenhuma Task 210 foi criada ou iniciada.

### Previsão operacional

Uma validação de Work sobre player/mixer e uma etapa futura bounded de sync real
após disponibilização/autorização do VOD e anchors. Não há previsão de qualidade
semântica automática nem transcrição integral nesta entrega.

## Comandos executados

- Git preflight e `npm.cmd run codex:prepare -- --task 209`.
- Geração de vídeo sintético local, sem leitura de mídia real nessa geração.
- `node tools/review-workspace/scrim-browser-canary.mjs`, com o módulo Playwright
  do runtime local fornecido como argumento de execução.
- `npm.cmd run emit:scrim-playback-readiness` (verifica hashes do código medido).
- Testes Node focados/regressão, Python compile e validators do workflow.

## Testes e validações

- Build: not_applicable: ferramentas JavaScript/Python executadas diretamente
- Lint: passed
- Typecheck: not_applicable: esta unidade não usa TypeScript
- Node tests: 30/30 passed; inclui 11 novos e 19 regressões do workspace.
- Browser canary: passed no Chrome headless local; métricas no artifact compacto.
- Privacy: somente código, contrato, estado e métricas compactas versionados.
- Output-size: somente `04-controller-pawn-lifecycle.json`, exceção histórica.

## Artifacts gerados

- `output/local-replay-processing/craig-multitrack/task209-playback/summary.json`
- `output/local-replay-processing/craig-multitrack/task209-playback/playback-canary.json`
- `output/local-replay-processing/craig-multitrack/task209-playback/gate.json`
- Local-only: `.local/deadem/review-workspace/scrim/` (sessão, vídeo sintético,
  medições e screenshots; os nove WAVs originais permanecem inalterados).

## Limitações

Não há replay/candidate linkage real, sync empírico com VOD, semântica de calls,
identidade biométrica ou composição de time confirmada. A medição é bounded em
um host/browser, não garante reprodução ininterrupta de duas horas.

## Riscos

Buffering e carga do host podem aumentar latência/drift. As políticas internas
são ajustáveis e testáveis, não thresholds metodológicos. O áudio original do
VOD pode duplicar Discord; por isso inicia mutado e recebe aviso explícito.

## Desvios

O Chromium bundled do Playwright não estava instalado; o canary usou o Chrome
local já existente. Nenhum download de navegador foi necessário.

## Não validado

Não foi validado mapping com VOD real, match identity, sincronização com replay,
fato final, estratégia ou precisão semântica de ASR.

## Gate técnico alegado

- Technical gate claim: craig_multitrack_synchronized_review_player_ready_for_real_sync_canary

Final acceptance remains pending independent ChatGPT Work validation.

## Push e estado final

- Push status: not_attempted:pre_publication_review
- HEAD source: post-commit-attestation
- Origin ref: origin/main
- Final status: VALIDATING
