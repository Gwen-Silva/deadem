# Task 208 — Real Craig Multitrack Call Evidence

## Resumo objetivo

Validou metadata, associação ordinal, áudio e timeline de uma gravação Craig
multitrack real e produziu um canary local de 18 clips para classificação humana.

## Commit

- Candidate SHA resolution: post-commit-attestation: .local/codex/208/post-commit-attestation.json
- Commit-base: ea5361c292c0419c50ae9382d390b3970fbbd827
- Branch: main
- Commits adicionados: 1

## Arquivos alterados

- Intake/runtime: `tools/craig-multitrack/`, helper ASR compartilhado, adapter
  Craig e runner Task 205 generalizado.
- Contrato/testes: schema, duas suites focadas e contrato multitrack.
- Coordenação: spec, conclusão, índices e documentos de estado autorizados.
- Evidência: cinco JSONs compactos e privacy-safe.

## Mudanças implementadas

### Resultado

O canary alega
`real_craig_multitrack_call_evidence_canary_ready_for_human_validation`.
Metadata real e nove tracks foram validadas; qualidade semântica do ASR ainda
não foi aprovada e depende da Gwen.

### O que passou a funcionar

- Parser bounded encerra no objeto JSON top-level do `raw.dat`.
- Associação 1–9 usa ordinal, nunca similaridade de nomes ou voz.
- Nove AACs são probadas e normalizadas localmente com timeline preservada.
- Adapter real preserva track attribution, words, metadata e overlap sem criar
  eixos de VOD/replay ou executar diarização.
- Seleção determinística distribui 18 regiões ao longo do tempo.
- ASR compartilhado mantém a configuração comparável à Task 205.

### Valor observável

- Base: `ea5361c292c0419c50ae9382d390b3970fbbd827`.
- recording track count: 9.
- AAC valid/invalid: 9/0.
- metadata mapping: `raw_header_and_info_consistent_ordinal_mapping_complete`.
- Header: 1.888 bytes consumidos de `raw.dat`; payload decoded: false.
- Codec/source format: 9 AAC, 48.000 Hz, 2 canais.
- Normalized format: PCM s16le, 16.000 Hz, mono.
- Duration range: 3.401,920–7.996,651 s.
- timelineSpreadStartSeconds: 0.
- timelineSpreadEndSeconds: 4.594,731.
- durationSpreadSeconds: 4.594,731.
- validation samples: 18; distribuição: 2 por cada `track_01`–`track_09`.
- ASR: faster-whisper small, CPU, int8, pt, beamSize 1, bestOf 1,
  temperature 0, VAD 500 ms, word timestamps, sem hotwords.
- Normalização: 156,296 s; ASR bounded: 30,356 s.
- overlapPairCount: 3.815; overlapDurationSeconds: 5.742,875.
- Classificação humana: 18/18 pendentes; criticalSemanticErrorCount: null.
- Emissão compacta: byte-idêntica em duas execuções.

### Impacto no módulo

O módulo Multitrack Call Evidence passa de fixture sintético para um canary real
com associação de source track e evidência mensurável. Isso remove ambiguidade
de speaker misto no nível da track, mas não prova a qualidade do transcript.

### Limitação relevante

`track_attributed` significa somente identidade declarada na metadata Craig.
Não há verificação biométrica, identidade real, intenção, relevância semântica,
sincronização com VOD/replay ou ligação a candidatos. O blocker
`mixed_vod_asr_semantic_accuracy_insufficient_for_automatic_call_review`
permanece até comparação humana.

### Próximo objetivo

Gwen classifica os 18 clips locais. Só depois comparar `usableRate >= 75%` e
`materiallyWrongRate <= 25%`, registrando manualmente erros semânticos críticos.
Nenhuma Task 209 foi criada.

### Previsão operacional

Uma etapa humana bounded sobre 18 clips; nenhum full-recording ASR ou candidate
integration antes desse gate.

## Comandos executados

- Preflight Git e `npm.cmd run codex:prepare -- --task 208`.
- Intake real, normalização/probe PyAV, seleção, ASR bounded e emissão.
- Suites focadas, regressão Task 205, Python compile, lint e workflow.

## Testes e validações

- Build: not_applicable: ferramentas JavaScript e Python executadas diretamente
- Lint: passed
- Typecheck: not_applicable: não há etapa TypeScript
- Testes focados e regressão: 21/21 passed.
- Python compile: passed.
- Privacy audit: passed, detectedPrivateValueLeakCount 0.
- Output-size: somente o baseline histórico permitido permanece acima do limite.

## Artifacts gerados

- `output/local-replay-processing/craig-multitrack/task208-real-canary/manifest.json`
- `output/local-replay-processing/craig-multitrack/task208-real-canary/audio-probe-summary.json`
- `output/local-replay-processing/craig-multitrack/task208-real-canary/canary-summary.json`
- `output/local-replay-processing/craig-multitrack/task208-real-canary/gate.json`
- `output/local-replay-processing/craig-multitrack/task208-real-canary/privacy-audit.json`

Packet humano local:
`.local/deadem/craig/recordings/craig_recording_task208_real_01/validation/`.

## Limitações

Os términos diferentes das tracks medem presença/duração do arquivo, não falha
de sincronização inicial. Overlap deriva de regiões de energia e não prova fala,
call, coordenação ou relevância.

## Riscos

ASR pode inverter ou perder termos semanticamente críticos. Human semantic
classification permanece a única autoridade para o quality gate.

## Desvios

O path solicitado com `/inbox/` não existia; a Gwen autorizou explicitamente o
pacote homônimo observado diretamente sob `.local/deadem/craig/`.

## Não validado

Não foram validados qualidade semântica, identidade biométrica/real, intenção,
estratégia, call correto, VOD/replay sync, candidato, autoria ou fato final.

## Gate técnico alegado

- Technical gate claim: real_craig_multitrack_call_evidence_canary_ready_for_human_validation

Final acceptance remains pending independent ChatGPT Work validation.

## Push e estado final

- Push status: not_attempted:pre_publication_review
- HEAD source: post-commit-attestation
- Origin ref: origin/main
- Final status: VALIDATING
