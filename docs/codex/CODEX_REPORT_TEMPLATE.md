# Template de Relatório de Execução Codex

O relatório é uma alegação de execução para validação independente. Nenhum
campo representa autoaprovação, e o gate final permanece com ChatGPT Work.

## Resumo objetivo

Descreva somente o que foi executado e sustentado por evidência acessível.

## Commit

Use os campos estruturados abaixo. O relatório versionado referencia a
atestação pós-commit; a atestação deve conter o SHA real resolvido pelo Git.

- Candidate SHA resolution: post-commit-attestation: .local/codex/NNN/post-commit-attestation.json
- Commit-base: SHA completo
- Branch: branch real
- Commits adicionados: 1

## Arquivos alterados

Fornecer a lista completa, agrupada quando útil.

## Mudanças implementadas

Fornecer a descrição das mudanças.

## Comandos executados

## Testes e validações

Incluir resultados, exit codes, warnings e logs. Separar compilação, lint e
typecheck, inclusive quando não aplicáveis.

- Build: passed ou not_applicable com justificativa
- Lint: passed ou failed com justificativa
- Typecheck: passed, failed ou not_applicable com justificativa

## Artifacts gerados

## Limitações

## Riscos

## Desvios

## Não validado

## Gate técnico alegado

Declarar o gate técnico como alegação do Codex e encerrar com: “Final
acceptance remains pending independent ChatGPT Work validation.”

- Technical gate claim: nome_do_gate

## Push e estado final

Incluir valores observados, nunca promessas futuras.

- Push status: pushed:origin/branch, not_attempted:motivo ou blocked:motivo
- HEAD source: SHA completo ou post-commit-attestation
- Origin ref: origin/branch ou not_available:motivo
- Final status: VALIDATING
