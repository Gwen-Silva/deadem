# Codex Executor Contract

Codex receives only an approved execution task.

- Execute only the approved task.
- Do not make strategic decisions.
- Do not broaden scope.
- Do not refactor unrelated areas.
- Run validations.
- Stop if the task requires unclear product decisions.
- Produce a final report with summary, files changed, commands run, validation
  results, evidence, risks, commit hash, and suggested next step.


# Task

Segue o brief estratégico atualizado para enviar ao Product Reviewer. Ele inclui a exigência nova: produzir um review artifact válido, sem acionar Codex nem modificar código. 

Texto colado

Editar
Task Brief

Task ID: TASK-LOCAL-VALIDATION

Nome: Local validation — Strategic GPT to Product Reviewer transfer with review artifact

Categoria de progresso: Infraestrutura/processo

Estado: NEW

Objetivo

Validar se o backend browser CDP do iaflow consegue transferir uma task do Strategic GPT para o Product Reviewer e receber de volta um review artifact válido.

Esta é uma validação local de workflow. Não é uma task de código, parser, replay, produto ou análise técnica do Deadem.

Pergunta central
O fluxo local consegue transferir um brief do Strategic GPT para o Product Reviewer e produzir um review artifact estruturado, sem acionar Codex e sem modificar código?
Fatos conhecidos
- A task está em estado NEW.
- O objetivo é validar transferência Strategic GPT → Product Reviewer.
- O fluxo deve produzir um review artifact válido.
- Não há erro registrado.
- Não há intenção de alterar código.
- Codex não deve ser executado.
Hipótese a validar
O backend browser CDP do iaflow consegue entregar o brief ao Product Reviewer e capturar uma resposta estruturada utilizável como artifact de revisão.
Por que isso importa

O Deadem passou a usar um fluxo com três papéis:

Strategic GPT → define estratégia e brief
Product Reviewer → revisa valor, prioridade e alinhamento
Codex → executa apenas tasks aprovadas

Antes de usar esse fluxo em tasks reais, é necessário validar se o Product Reviewer consegue receber o brief e produzir uma decisão estruturada.

O que desbloqueia

Se a validação passar, o projeto poderá usar o Product Reviewer como checkpoint formal antes de gerar instruções executáveis para Codex.

Isso reduz risco de:

- diagnóstico infinito;
- execução prematura;
- task técnica sem valor claro;
- perda de alinhamento com o cliente;
- Codex executar trabalho não aprovado.
Escopo

Validar apenas:

- criação do brief pelo Strategic GPT;
- transferência do brief para o Product Reviewer;
- interpretação da task pelo Product Reviewer;
- produção de um review artifact válido;
- retorno de uma decisão estruturada.
Fora de escopo

Não fazer:

- rodar Codex;
- modificar código;
- alterar produção;
- alterar parser/engine;
- processar replays;
- acessar replay 005;
- acessar replays 006–008;
- acessar candidatos 010–020;
- usar samples/**;
- usar output/replays/**;
- criar canonical package;
- emitir fatos de partida;
- criar source artifacts;
- criar commit;
- preparar task técnica real para execução.
Review artifact esperado

O Product Reviewer deve produzir um artifact estruturado contendo, no mínimo:

task_id
decision
rationale
value_assessment
risk_assessment
success_criteria_check
stop_criteria_check
scope_check
codex_execution_allowed
production_code_change_allowed
next_action
Decisões válidas do Product Reviewer
APPROVE
APPROVE_WITH_CHANGES
REJECT
Regras para a decisão
APPROVE

Usar somente se:

- o brief foi recebido corretamente;
- o Product Reviewer entendeu que é uma validação local de workflow;
- o artifact foi produzido em formato estruturado;
- Codex não foi acionado;
- nenhuma modificação de código foi solicitada.
APPROVE_WITH_CHANGES

Usar se:

- a transferência funcionou;
- mas o artifact veio incompleto;
- ou faltou algum campo de revisão;
- ou a task precisa deixar mais explícito que Codex não deve rodar.
REJECT

Usar se:

- o Product Reviewer não recebeu o brief;
- o artifact não foi produzido;
- o fluxo tentou acionar Codex;
- o fluxo tentou modificar código;
- a task foi interpretada como implementação real.
Critério de sucesso

A validação é considerada bem-sucedida se:

1. O Product Reviewer recebe o brief.
2. O Product Reviewer entende que é apenas validação local de workflow.
3. O Product Reviewer produz um review artifact estruturado.
4. O artifact contém uma decisão válida.
5. O artifact indica explicitamente que Codex não deve ser executado.
6. O artifact indica explicitamente que nenhuma mudança em production code deve ser feita.
7. Nenhum código é modificado.
8. Nenhum commit é criado.
Critério de parada

Parar imediatamente se:

- o fluxo tentar acionar Codex;
- o fluxo tentar modificar código;
- o Product Reviewer interpretar a task como implementação;
- houver tentativa de criar commit;
- houver tentativa de acessar replays;
- houver tentativa de gerar outputs técnicos do Deadem;
- o review artifact não puder ser produzido.
Riscos
- Confundir validação de workflow com task real de desenvolvimento.
- Acionar Codex indevidamente.
- Solicitar mudanças de código sem necessidade.
- Produzir artifact informal demais para ser validável.
- Validar apenas a mensagem, mas não o artifact.
- Tirar conclusão falsa sobre o fluxo se o artifact não for estruturado.
Proteções obrigatórias
- Não executar Codex.
- Não modificar production code.
- Não modificar arquivos do repositório.
- Não criar commit.
- Não processar replays.
- Não tocar em .local.
- Não tocar em .dem.
- Não usar samples/**.
- Não usar output/replays/**.
Métrica de progresso
Transferência Strategic GPT → Product Reviewer validada com artifact estruturado,
ou falha do fluxo identificada com causa clara.
Valor esperado

Esta task valida o mecanismo de governança antes de aplicá-lo a decisões técnicas reais.

Valor principal:

- aumentar confiança no fluxo Strategic GPT → Product Reviewer;
- garantir que Product Reviewer produz artifact auditável;
- impedir execução prematura pelo Codex;
- reduzir risco de trabalho desnecessário.
Recomendação do Strategic GPT

APPROVE para validação local do fluxo, desde que:

- Codex não seja executado;
- nenhum código seja modificado;
- o Product Reviewer produza artifact estruturado;
- o resultado seja tratado como validação de processo, não como entrega técnica do Deadem.
Próxima ação se aprovado

Executar apenas a transferência local do brief para o Product Reviewer e capturar o review artifact.

Não gerar instrução Codex.

Não criar task executável de código.


# Scope

## Allowed

Use the allowed scope from the approved Strategic GPT brief and reviewer instructions.

## Not allowed

Do not execute blocked follow-up work, broaden scope, or alter unrelated files.

# Evidence required

Preserve factual evidence, uncertainty, and validation output in the report.

# Commands to run

Run the validations specified in the approved brief. If a command cannot run, report why.

# Success criteria

Use the success criteria from the approved brief and any reviewer-visible instructions.

# Stop criteria

Use the stop criteria from the approved brief. Stop if unclear product decisions are required.

# Product Reviewer Instructions Visible To Codex

- Do not execute Codex.
- Do not modify production code.
- Do not create commits.
- Do not modify repository files.
- Do not process replays or project outputs.
- Produce only the structured review artifact required by the workflow.

# Report format

Include: summary, files changed, commands run, validation results, evidence, risks, commit hash, and suggested next step.
