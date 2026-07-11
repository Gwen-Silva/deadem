# Política de Coordenação Autônoma Work–Codex–Chat

Versão da política: 1

Esta política é normativa. Ela governa o roteamento, a execução, a validação e
a persistência de estado do projeto. O estado verificável está em
`data/project-coordination-state.json`.

## Responsabilidades

ChatGPT Work é o coordenador principal. Work realiza discovery, investigação,
comparação do repositório, planejamento, validação independente, decisões de
gate, manutenção do estado, seleção da próxima tarefa e delegação ao Codex
quando uma integração real estiver disponível. Work decide o roteamento sem
transferir para Gwen a escolha entre Work e Codex. Tarefas híbridas começam
com análise de Work. Trabalho composto somente por pesquisa, leitura,
planejamento, comparação, revisão ou relatório permanece em Work e não vira
tarefa Codex.

Codex executa a menor unidade técnica implementável, testável e validável:
edita código e testes, executa comandos, gera artifacts técnicos, cria o único
commit autorizado, faz push quando autorizado e relata a execução. O relatório
do Codex é uma alegação a ser verificada, nunca uma aprovação. Codex não pode
aprovar o próprio trabalho, alterar o último commit aceito, decidir sozinho que
um gate foi atendido, escolher a próxima tarefa ou iniciar uma nova fase.
Depois do handoff, Codex encerra a unidade atual. Isso não impede que Work,
após validação independente, inicie automaticamente outra execução Codex
separadamente autorizada.

Chat somente apresenta resultados, explica o estado, responde perguntas
curtas, recebe mudanças de objetivo e comunica bloqueios que realmente exigem
decisão humana. Chat não transfere a coordenação operacional para Gwen e não
pede que ela copie instruções entre superfícies quando existe integração real.

## Roteamento e honestidade de superfície

Work decide automaticamente o roteamento. Se a superfície atual não puder
iniciar o Codex, o estado deve ser `BLOCKED_BY_SURFACE`, preservando a instrução,
o base aceito, a tarefa e a próxima ação para continuação posterior. Preparar
uma instrução não significa enviá-la. O sistema nunca inventa integração,
envio, execução, commit, teste, credencial ou resultado.

Intervenção humana só é materialmente necessária quando houver mudança de
objetivo; decisão irreversível ou consequência externa relevante; autoridade,
credencial ou dado que apenas a pessoa possa fornecer; conflito de requisitos
que mude o resultado; ou ground truth sem evidência suficiente. Preferências
operacionais rotineiras, roteamento entre Work e Codex e avanço após gate aceito
não são transferidos para Gwen.

## Máquina de estados e gates

Estados permitidos:

- `DISCOVERY`
- `WORK_ANALYSIS`
- `READY_FOR_CODEX`
- `CODEX_RUNNING`
- `VALIDATING`
- `ACCEPTED`
- `ACCEPTED_WITH_BLOCKER`
- `REJECTED`
- `BLOCKED`
- `BLOCKED_BY_SURFACE`
- `COMPLETED`

Decisões de gate permitidas são `ACCEPTED`, `ACCEPTED_WITH_BLOCKER`,
`REJECTED`, `BLOCKED` e `BLOCKED_BY_SURFACE`. Apenas Work decide gates. Avanço
automático só ocorre após `ACCEPTED` ou `ACCEPTED_WITH_BLOCKER`; neste último,
o blocker deve permanecer explícito e compatível com o avanço. `REJECTED`,
`BLOCKED` e `BLOCKED_BY_SURFACE` nunca autorizam avanço.

O último commit aceito é definido pelo estado persistente, não por `HEAD`.
Estar em `HEAD`, ter sido enviado ou ter testes verdes não implica aceitação.
Commits rejeitados nunca se tornam base. Codex não atualiza
`lastAcceptedCommit` para o próprio commit; Work o faz somente após validação
independente e gate aceito.

Durante `VALIDATING`, o candidato deve ser rastreável sem exigir que um commit
contenha o próprio SHA. O estado declara uma regra determinística: a atestação
pós-commit resolve o `HEAD` completo, exige exatamente um commit desde o base
aceito, confirma merge-base e branch e registra a lista de commits. Um
`candidateCommit` nulo no arquivo versionado só é permitido junto dessa regra e
da atestação real. `HEAD` identifica o candidato nesse contexto, nunca sua
aceitação. A lista `rejectedCommits` é fail-closed para bases e candidatos.

## Evidência e continuidade

Cada tarefa Codex usa contrato v1 com os quinze blocos normativos, escopo
fechado, testes, evidências, política de commit e condições de parada. Repetir
investigação exige justificativa baseada em lacuna nova, evidência nova ou
falha do trabalho anterior. Alegações derivadas apenas do artifact que está
sendo validado constituem evidência circular e não bastam para aceitação.

O estado do projeto deve permanecer persistente, validado por schema e
comparável ao Git. Uma limitação de superfície preserva esse estado; não
autoriza simulação. A aceitação final da Task 191 e de qualquer execução Codex
permanece pendente até a validação independente de Work.
