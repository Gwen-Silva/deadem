# Task 221 — Repository and Local Workspace Hygiene

## Resumo objetivo

Auditoria somente de metadata, nomes, referências textuais limitadas e object IDs
já existentes. Nenhum material anterior foi deletado, movido ou regenerado.
Nenhum replay foi processado; nenhum conteúdo de mídia foi lido. Task 222 não
foi criada. O milestone permanece **GENERIC_INTAKE_READY**.

A medição existente foi preservada. Work confirmou independentemente a aceitação
da Task 220 no gate continuous_review_audit_index_consistency_restored e autorizou
a sincronização e publicação da Task 221. A retomada não repetiu o scan amplo.
Somente o blocker histórico encerrado pela Task220 foi removido dos ativos;
os demais blockers foram mantidos. Task221 permanece candidata, não aceita.

## Commit

- Candidate SHA resolution: post-commit-attestation: .local/codex/221/post-commit-attestation.json
- Commit-base: 61355485cd4cc95719b91db9f296760ba5a7ea84
- Branch: main
- Commits adicionados: 1

Mensagem: `Audit repository and local workspace hygiene`.
A lista com SHA real, merge-base e evidência de publicação é resolvida pela
atestação pós-commit, sem fazer o commit conter o próprio SHA.

## Medição e fronteiras

Snapshot anterior aos cinco outputs desta task; detalhes ficam somente em
`.local/codex/221/hygiene-audit/`. Bytes são lógicos/aparentes, não blocos
alocados, espaço de pack Git ou promessa de espaço físico recuperável.

| Visão / métrica | Arquivos | Bytes |
| --- | ---: | ---: |
| Git tracked, excluídos nomes protegidos | 4.773 | 935.705.917 |
| Subconjunto tracked em output/ | 3.200 | 920.649.891 |
| Local visível não tracked, incluindo ignored | 167.029 | 47.959.953.183 |
| Diretórios dependency/cache locais, subconjunto | 132.931 | 735.358.022 |
| Envelope de artifacts do runtime ativo, Git + local | 11.492 | 10.812.179.431 |
| Plano A, cache com reprodução verificada por nomes | 2.696 | 42.993.154 |
| Plano B, pool de revisão para retirada do current tree | 3.184 | 918.796.674 |
| indeterminada, sem proveniência suficiente | 19.085 | 2.624.476.149 |

As cinco visões não são aditivas: runtime, dependências e outputs são
subconjuntos das duas primeiras populações. Git usa tamanho de blob do índice;
workspace usa lstat. Conversão CRLF pode diferir entre blob e checkout.
Foram vistos 171.802 arquivos físicos regulares, 9.055 diretórios, zero erros
de metadata e 18 links/junctions não percorridos. `.git/`, alvos fora do
workspace, caches externos ao workspace e os próprios outputs da Task 221 não
entram nos totais. Não se mediu armazenamento Git histórico.

005–008 foram rejeitados por nome antes de lstat, open, hash, read ou consulta
de tamanho de blob. `protectedExcludedCount=99` conta paths de fronteira
distintos, não replays nem descendentes enumerados. Sessenta nomes tracked
foram omitidos da população Git; tamanhos individuais não foram coletados.
O inventário de exclusão contém somente path e `protected_excluded=true`.

## Classificação

| Classe | Arquivos | Bytes | Interpretação |
| --- | ---: | ---: | --- |
| KEEP_SOURCE | 1.005 | 28.445.099.942 | Código, configuração e fontes/mídias sem reprodução presumida |
| KEEP_ACTIVE | 11.492 | 10.812.179.431 | Envelope conservador de dependências atuais |
| KEEP_AUDIT | 5.872 | 6.072.692.169 | Evidência, decisões, índices e rastreabilidade |
| REGENERABLE_CACHE | 134.267 | 940.896.893 | Nem cada cache é removível agora; inclui runtime/modelos |
| EPHEMERAL | 80 | 314.182 | Nome temporário/log, mas propriedade ainda não demonstrada |
| SUPERSEDED | 1 | 334 | Registro explicitamente histórico/rejeitado; não equivale a descarte |
| indeterminada | 19.085 | 2.624.476.149 | Sem evidência suficiente para limpeza |

KEEP_AUDIT e plano B podem coexistir: o plano B é uma proposta condicionada a
fechar referências, e não a conclusão de que 3.184 arquivos são obsoletos.
Nenhum arquivo foi classificado SUPERSEDED somente pela idade/número da task.

## Consumers do AlphaVeil atual

O grafo foi obtido estaticamente do servidor e providers; loaders, canaries,
ASR, VOD, Craig e replay não foram executados nem abertos. Referências de
produtores, testes, documentos e specs são separadas de consumers de runtime.

| Artifact / envelope preservado | Consumer atual | Bytes |
| --- | --- | ---: |
| .local/deadem/review-targets/review_match_003/video e 004/video | scrim-media.mjs: VOD real | 5.337.102.240 |
| .local/deadem/dense-review/review_match_001–004 | data-model.mjs e task212-provider.mjs: frames/storyboards/índices | 2.816.724.238 |
| Craig task208 real: normalized e validation | scrim-media.mjs: tracks e metadata privada | 1.786.249.820 |
| .local/deadem/review-workspace/** | server.mjs, store/export, scrim-media.mjs | 653.231.885 |
| call-evidence 001/002: índices, segments, metadata de extração e mixed audio | data-model.mjs | 217.018.031 |
| output/.../assisted-review-bundles/task204-bounded2 | data-model.mjs | 1.486.760 |
| output/.../assisted-review/task212-matches-003-004 | task212-provider.mjs | 366.457 |

Os nomes acima abreviam prefixes; o arquivo local active-runtime-consumers.json
contém os paths completos e a razão de cada regra. O envelope preserva assets
adjacentes conservadoramente, portanto activeRuntimeBytes é um limite superior
de artifacts, não soma exata de todos os arquivos abertos em uma sessão.
Código público do workspace e node_modules também são dependências de UI e
continuam retidos; não estão somados ao campo activeRuntimeBytes.

O registro `.local/deadem/continuous-review/intakes/` é consumer de
tools/continuous-review/intake.mjs, mas ainda não é catálogo dinâmico da UI.
Não se encontraram arquivos regulares nesse prefix no snapshot. Estado humano,
exports e configuração real-sync-task210 são protegidos. O fixture sintético
do scrim continua sendo fallback/opção suportada: não é lixo só por ser fixture.
Fontes originais em review-targets/Craig/replays permanecem KEEP_SOURCE; nenhuma
reprodução de mídia é presumida. Transcripts privados permanecem locais.

## Achados por área

- `output/replays/**`: 422 arquivos visíveis medidos, 699.379.112 bytes,
  excluídos os protegidos. Predominam shards/timelines históricos.
- `output/local-replay-processing/**`: 1.981 arquivos, 120.518.212 bytes.
  Os bundles Task204 e Task212 ainda são consumers diretos; não retirar em lote.
- `experiments/**`: 30 arquivos, 958.550 bytes. `reports/**`: 229 arquivos,
  1.414.397 bytes. `tasks/**`: 349 arquivos, 1.612.835 bytes. Pequenos frente
  aos outputs e importantes como fontes de reprodução/evidência.
- `data/*index*` e registry: lidos de forma limitada para referências e
  status; current-artifact-registry mistura entradas históricas, bloqueadas e
  atuais. Docs current-state também participam das referências, mas não
  substituem a autoridade do coordination-state.
- `.local/codex/**`: 1.950 arquivos, 34.210.377 bytes, excluída esta task.
  Review packets, validações, logs e attestations são KEEP_AUDIT.
- `output-local/**`: 1.774.757.886 bytes classificados indeterminada; mistura de
  oráculos externos/derivados sem demonstração suficiente de reprodução.
  Não remover só porque o path é local.
- `.local/deadem/review-telemetry`, visual-index e review-sync somam evidência
  intermediária sem consumer atual de UI demonstrado; indeterminada não significa
  dispensável. Fontes e registros humanos devem ser rastreados antes de ação.

### Duplicatas, versões e possível material stale

169 grupos de blobs Git idênticos reutilizam object IDs existentes; representam
11.757.150 bytes lógicos repetidos. Não houve novo hash de arquivo. Exemplo:
Task190 pilot e bounded32 contêm o mesmo artifact replay_036 com 1.341.162 bytes
por cópia (OID edc46eafd9d3f4880840412baec80688a24e68f8). Também existem cópias
idênticas para replay_021 e replay_011. Isto demonstra cópias repetidas em
diretórios de execução distintos, não permite inferir quais são descartáveis.
Git já pode compartilhar o blob: não somar duplicatas ao espaço físico de pack
nem somá-las novamente aos planos A/B. Duplicatas locais sem hash registrado
não foram inferidas por tamanho; nenhum hashing de mídia foi feito.

Há 227 agrupamentos nominais de version chains. O inventário registra paths,
mtime e referências de screenshots/canaries/logs/temp. Exemplos de screenshots
históricos em Tasks213–217 somam 19.293.759 bytes; são evidência de QA e continuam
KEEP_AUDIT. Perfis browser edge-task207, -medium, -narrow e -wide têm proveniência
insuficiente para descarte. 1.271 logs locais somam 2.907.563 bytes, muitos como
evidência de task: não existe política de expiração que autorize removê-los.

Nomes temporários e diretórios canary antigos foram sinalizados, mas nenhum
diretório foi declarado órfão com alta confiança: atividade de processos e
propriedade humana não foram auditadas. Sem TTL aprovado, idade não prova stale.
`staleness-review-candidates.json` usa staleConfirmed=false para deixar isso
explícito e também contém falsos positivos nominais (por exemplo ícones de
screenshot em dependências), que não são candidatos do plano A.

50 dos 80 scripts/experiments examinados não têm consumer direto em código ou
comando atual identificado. Exemplos: experiments/11-reconcile-hero-identities.js,
14-discover-items-and-upgrades.js e 15-decode-upgrade-tokens.js. Referências
históricas/testes podem existir. Há 150.311 arquivos sem consumer no grafo
limitado, dominados por dependências: isso não é contagem de arquivos órfãos.

## Plano A — SAFE CLEANUP, não executado

2.696 arquivos / 42.993.154 bytes potenciais. Somente caches ignorados:

- 2.663 bytecodes de `.venv-video/Lib/site-packages/**/__pycache__`: 42.733.199
  bytes. O source .py correspondente está presente por metadata.
- 33 caches restantes em python/scripts/tests/tools e `.pytest_cache`:
  259.955 bytes. Cada bytecode aceito tem source .py visível; pytest reconstrói
  seus cinco arquivos de cache (1.506 bytes).

Consumer: interpretador/test runner, não artifact factual. Reprodução: source
exato listado por arquivo em cleanup-candidates.jsonl; próxima execução Python
ou pytest. Risco baixo condicionado a fechar processos relevantes e revalidar
os nomes no momento de uma futura limpeza. Os 14 bytecodes sem source
correspondente demonstrado foram excluídos do plano seguro.

Não remover o ambiente .venv, node_modules, modelos, áudio, exports, screenshots
ou logs neste plano. Reinstalação de dependências é condicional à rede e aos
pins; não é perda zero garantida. Esta auditoria não executou nem autorizou a
limpeza futura.

## Plano B — ARCHIVE / CURRENT-TREE RETIREMENT, não executado

Pool de 3.184 arquivos tracked / 918.796.674 bytes, sem consumer direto no
runtime AlphaVeil identificado, concentrado em outputs históricos. Manter os
16 artifacts/envelopes tracked ativos fora desse pool. Exemplo de grande grupo:
objective-timeline-shards do replay_001, 47 arquivos / 90.089.245 bytes.

Antes de qualquer retirada: fechar referências de scripts, tests, task specs,
índices, relatórios e evidência aceita; conservar manifest compacto com SHA,
paths, produtor, parâmetros, versão e motivação; confirmar que recuperação
pela história Git supre o uso de auditoria. Não se demonstrou regeneração
semântica byte-idêntica: Git preserva o snapshot, o replay não será reprocessado.
Risco médio/alto. Manter baselines rejeitadas e aceitas rastreáveis, mesmo quando
o payload sai do current tree. Reports/tasks/docs/indices não entram em retirada
automática. A economia estimada é do checkout corrente, não do histórico remoto.

## Plano C — STRUCTURAL IMPROVEMENT, não executado

1. Para compact evidence **futura**, adotar `artifacts/module/taskNNN/` com
   manifest e schema. Não mover outputs aceitos nesta task. Usar allowlist
   explícita para os atuais bundles do runtime até migração autorizada.
2. Fazer o guard de tamanho refletir OUTPUT_AND_ARTIFACT_POLICY: política exige
   exceção explícita para arquivo novo/alterado >100 KiB, enquanto
   check-output-sizes.js usa 10 MiB, só JSON no primeiro nível de output/,
   sem recursão nem fronteira protegida por nome. data/artifact-storage-policy.json
   ainda declara o limiar legado de 10 MiB. Há 629 blobs tracked de output acima
   de 100 KiB; 608 são aninhados e escapam da varredura rasa. Isso não torna
   retroativamente inválidas exceções históricas. O JSON local não tracked
   output/04-controller-pawn-lifecycle.json tem 111.818.723 bytes; o guard atual
   mistura esse legado local com o escopo de uma nova mudança.
3. Guard recursivo futuro deve operar primeiro sobre changed/staged paths,
   rejeitar aliases protegidos antes de stat/read, cobrir artifacts/ e outros
   outputs declarados, separar exceções históricas e aplicar teto de pacote.
   Não executar o guard amplo atual nesta auditoria.
4. `output/` é ignored, mas continua com 3.200 arquivos tracked medidos.
   `.gitignore` não retira arquivos do índice. `git check-ignore --no-index`
   confirmou a regra em um path seguro. Retirada exige futura revisão explícita,
   não um comando abrangente no índice nesta task.
5. Separar índices current (pequeno catálogo consumido em runtime) de history
   (append-only por task/módulo), preservando schema, IDs e ligações. Não mover
   entradas silenciosamente nem transformar arquivo antigo em aceitação atual.
6. Retention policy por categoria, owner, lease de processo e dependência:
   cache descartável, logs operacionais com TTL, screenshot/canary com resumo
   retido, evidência aceita/decisão humana sem TTL automático, fontes preservadas.
   Catalogar outputs locais com produtor/input digest já existente, custo de
   reprodução e consumer para reduzir indeterminada antes de qualquer limpeza.

Nenhum plano propõe history rewrite ou git filter-repo. Nenhuma Task 222 foi
criada, escolhida ou autorizada.

## Arquivos alterados

Somente os seis arquivos autorizados:

- reports/repository-and-local-workspace-hygiene-task221.md
- tasks/specs/221.json
- tasks/completed/221-repository-local-workspace-hygiene-audit.md
- artifacts/repository-hygiene/task221/summary.json
- artifacts/repository-hygiene/task221/gate.json
- data/project-coordination-state.json

## Mudanças implementadas

Auditoria, classificação e planos preservados; sincronização expressamente
autorizada de lastAcceptedTaskId=220, lastAcceptedCommit e activeBaseCommit na
base fornecida, activeTaskId=221, completedTasks incluindo 220 e pendingTasks
somente 221. READY_FOR_CODEX foi usado no preflight; o candidato versionado
fica VALIDATING com resolução determinística. Nenhum runtime, index histórico,
fonte ou artifact aceito foi modificado.

## Comandos executados

Inventário original: Git metadata, node .local/codex/221/hygiene-audit/audit.mjs,
prepare, preflight e validate. O scan não foi repetido na retomada.
Retomada: prepare/preflight/validate/review da Task221 com npm.cmd; reconciliação
dos inventários existentes por resumption-check.mjs; stage explícito dos seis
paths; commit único; push normal origin main. Evidência observada por fase nos
logs locais e na atestação, sem inferir sucesso de publicação antecipadamente.

## Testes e validações

Preflight READY_FOR_CODEX passou após a sincronização autorizada. O primeiro
validate de retomada encontrou candidateResolution ainda nulo nessa fase e
Status ausente no completed record. Ambos foram corrigidos no escopo antes
do commit; as falhas antigas permanecem rastreáveis nos registros locais.

- Build: not_applicable:audit_and_coordination_only
- Lint: passed
- Typecheck: not_applicable:no_TypeScript_change

O lint do monorepo passou, exit 0. Validação da coordenação passou. A fila de
tasks e a validação canônica são repetidas após o formato final e contra o
commit limpo; os resultados sincronizados ficam em validate-result.json e
review-packet.json. O relatório não dispensa falhas nessas verificações.

Resumption-check reconcilia os dois inventários já existentes, classes, bytes,
19 nomes sintéticos de proteção, campos de segurança, escopo e preservação dos
blockers históricos. Não importa nem executa o scanner original. Evidências:
.local/codex/221/hygiene-audit/resumption-validation.json e tests.json original.
O guard de tamanho local confere os seis outputs abaixo de 100 KiB.

As suites legadas acopladas à Task191 não foram rerodadas: contêm expectativas
fixas de branch/base/status antigos e uma execução que grava contexto Task191.
Foram usados validadores atuais de coordenação/fila e os testes locais deste
audit. O check-output-sizes amplo não foi executado, pois não implementa a
fronteira protegida antes de stat e mede outputs fora da mudança. Nenhum
canary, ASR, replay ou conteúdo de mídia foi executado/lido.

## Artifacts gerados

Os cinco compactos e a sincronização de coordenação acima; detalhes somente
em .local/codex/221/hygiene-audit/: tracked-inventory.jsonl,
local-inventory.jsonl, cleanup-candidates.jsonl, protected-exclusions.json,
coverage.json, active-runtime-consumers.json, content-read-ledger.json,
duplicate-groups.json, version-chains.json, directory-metadata.json,
staleness-review-candidates.json, script-consumers.json,
no-observed-consumer.json, tests.json e resumption-validation.json.
Por candidato há path, categoria, size, fileCount, consumers/references,
regenerability, reproductionSource, cleanupRisk e estimatedReclaimableBytes.
A atestação pós-commit e review packet ficam em .local/codex/221/.

## Limitações

Grafo estático limitado não resolve consumidores dinâmicos, humanos ou externos.
Envelope ativo conservador. Números refletem o snapshot original, não um novo
censo após a sincronização. Nenhum tamanho protegido ou Git pack foi medido;
links/junctions não foram atravessados. Caches externos ficam fora do inventário.

## Riscos

Ausência de referência/idade não prova dispensabilidade. Retirar arquivos pode
quebrar reprodutibilidade, evidência humana e runtime. Planos A/B dependem de
autorização futura e revalidação dos alvos; nenhum deles foi executado.

## Desvios

O bloqueio original de coordenação foi resolvido exclusivamente pela decisão
explícita de Work. Acrescentou-se somente data/project-coordination-state.json
ao escopo versionado. A classe indeterminada usa seu código exato no summary
JSON; nesta prosa evita-se o token reservado pelo validador de relatórios.

## Não validado

Aceitação independente da Task221 por Work; limpeza futura; reprodução de
mídia; identidade de conteúdo oculto sob nomes distintos; consumidores humanos
externos; estado de processos proprietários de caches; espaço físico recuperável.

## Gate técnico alegado

- Technical gate claim: repository_local_workspace_hygiene_audit_ready

Medição e planos apenas, não aprovação de cleanup nem aceitação Work.
protectedAccessCount=0; replayProcessingCount=0; mediaContentReadCount=0;
proposedHistoryRewrite=false; task222Created=false.
Milestone: AlphaVeil Continuous Review Pipeline = GENERIC_INTAKE_READY.

## Push e estado final

- Push status: not_attempted:at_report_freeze_see_synchronized_post_commit_attestation
- HEAD source: post-commit-attestation
- Origin ref: origin/main
- Final status: VALIDATING

O status de push acima registra o congelamento pré-commit deste relatório.
A atestação pós-publicação é a fonte do resultado remoto observado, SHA,
commit count e working tree, sem amend para inserir o próprio SHA no relatório.
O lastAcceptedCommit permanece na Task220. Task222 não existe; Generic Factual
Processing não foi iniciado.

Final acceptance remains pending independent ChatGPT Work validation.
