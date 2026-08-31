# Task 205 — Timestamped Call Evidence Pipeline

## Resumo objetivo

Produziu transcrição temporal local dos dois VODs autorizados, converteu timestamps VOD para tempo aproximado de replay via Task 200 e vinculou segmentos a todos os 102 candidatos da Task 204. A saída versionada contém apenas métricas, hashes, configuração, contagens e limitações.

## Commit

- Candidate SHA resolution: post-commit-attestation: .local/codex/205/post-commit-attestation.json
- Commit-base: 225f570a68c3d53ecfa17986e674fe21be7d2dc6
- Branch: main
- Commits adicionados: 1

## Arquivos alterados

- Runtime: `tools/transcribe-local-call-audio.py`, `tools/audio-call-source-adapters.mjs`, `tools/emit-timestamped-call-evidence.mjs`, `package.json`.
- Contrato/testes: `schemas/timestamped-call-evidence.schema.json`, `tests/emit-timestamped-call-evidence.test.mjs`, `tests/timestamped-call-evidence-schema.test.mjs`, `tests/fixtures/audio-call-evidence/craig-multitrack.json`, `docs/codex/TIMESTAMPED_CALL_EVIDENCE_CONTRACT.md`.
- Coordenação: `tasks/specs/205.json`, `tasks/completed/205-timestamped-call-evidence.md`, `data/project-coordination-state.json`, índices e documentos de estado autorizados.
- Oito JSONs compactos em `output/local-replay-processing/audio-call-evidence/task205-bounded2/`.

## Mudanças implementadas

### Resultado

O pipeline processou 2/2 VODs e alegou o gate `two_match_audio_call_evidence_ready_with_asr_gaps`. A lacuna é a validação auditiva humana delimitada, não ausência de transcrição ou linkage.

### O que passou a funcionar

Cada janela possui overlay local com `audioCallEvidenceRefs`, refs no eixo aproximado do replay, provenance e speaker `unknown/mixed`. O transcript pode ser consultado por tempo sem promover fala a intenção, call coletivo, decisão ou coordenação confirmada.

### Valor observável

- ASR: faster-whisper 1.2.1, `small`, CPU/int8, PT, VAD, 16 kHz mono e word timestamps.
- Áudio: 4.562 s + 2.090 s = 6.652 s processados.
- Segmentos: 1.338 + 538 = 1.876; falhas zero.
- Palavras temporais: 8.158 + 3.585 = 11.743.
- Linkage: 1.557 + 636 = 2.193; 102/102 candidatos possuem ao menos uma referência.
- Cobertura de fala: 2.513,85 s (55,1041%) e 1.096,19 s (52,4493%).
- Processamento ASR: 660,880 s e 355,314 s.
- Sync preservado: 9 s e 2 s; incerteza ASR separada.
- Craig: duas tracks sintéticas, dois speakers distintos, quatro segmentos, sobreposição e ordenação global preservadas.
- Determinismo: 8/8 outputs compactos byte-idênticos.

### Validação delimitada

Foram selecionados deterministicamente 16 trechos distribuídos, oito por VOD. Classificações `correct`, `usable_with_minor_error`, `materially_wrong` e `unintelligible` foram disponibilizadas, mas nenhuma foi preenchida: esta superfície não percebe áudio. `usable rate` permanece `null`; inventá-la violaria o contrato epistemológico.

### Impacto no módulo

Audio Call Evidence está funcional para navegação temporal e review assistida, com gap explícito de qualidade humana. A ausência de diarização mantém speakers mistos, e os blockers de seletividade/sincronização permanecem herdados.

### Próximo objetivo

Após aceitação independente, completar a pequena classificação auditiva em uma superfície humana e retomar a review real de `review_match_001_window_0013`, `0015` e `0016`. Não criar infraestrutura adicional.

## Comandos executados

- Preflight Git, hashes SHA-256 dos VODs e `npm.cmd run codex:prepare -- --task 205`.
- Instalação local de `faster-whisper==1.2.1` no `.venv-video`.
- Probe de 60 s e transcrição integral das duas regiões Task 200.
- `npm.cmd run emit:timestamped-call-evidence` em duas emissões finais.
- Testes específicos, schema, sintaxe Python/Node e validadores do workflow.

## Testes e validações

- Build: not_applicable: scripts JavaScript e Python executados diretamente
- Lint: passed
- Typecheck: not_applicable: não há etapa de typecheck para estes scripts
- Testes específicos: 12/12 aprovados.
- ASR: 2/2 targets, 1.876/1.876 segmentos com texto e zero falhas.
- Privacidade: scan contra 1.876 textos reais, zero vazamentos exatos nos outputs compactos.
- Output-size check: somente o baseline histórico permitido `output/04-controller-pawn-lifecycle.json` permanece acima do limite.

## Artifacts gerados

- Locais: `.local/deadem/call-evidence/review_match_001/` e `review_match_002/` com WAV, transcript, segmentos, palavras, linkage e fila de validação.
- Versionados: oito JSONs compactos em `output/local-replay-processing/audio-call-evidence/task205-bounded2/`.

## Limitações

Speaker permanece `unknown/mixed`; não há diarização. ASR pode errar palavras e limites. A validação auditiva de 16 trechos está preparada, porém ainda não classificada, logo `usable rate` é desconhecida.

## Riscos

Áudio de jogo pode gerar falsos segmentos ou degradar palavras. Interseção temporal não prova que uma fala se refere ao evento visual, nem estabelece intenção ou qualidade da decisão.

## Desvios

O preparador tentou incluir o VOD de 5,17 GB no context packet e atingiu seu limite de 2 GiB; os VODs permaneceram inputs operacionais declarados, enquanto `readPaths` ficou restrito aos manifests compactos. Nenhum dado foi omitido do processamento autorizado.

## Não validado

Não foram validados WER, diarização, speaker real, intenção, team call, recommit, disengage, coordenação, estratégia, decisão ou resultado. A taxa humana utilizável permanece pendente.

## Gate técnico alegado

- Technical gate claim: two_match_audio_call_evidence_ready_with_asr_gaps

Final acceptance remains pending independent ChatGPT Work validation.

## Push e estado final

- Push status: not_attempted:pre_publication_review
- HEAD source: post-commit-attestation
- Origin ref: not_available:pre_publication_review
- Final status: VALIDATING
