#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AGENTS_LIMIT = 8 * 1024;
const CURRENT_STATE_LIMIT = 4 * 1024;

const COORDINATION_STATUSES = Object.freeze([
    'DISCOVERY',
    'WORK_ANALYSIS',
    'READY_FOR_CODEX',
    'CODEX_RUNNING',
    'VALIDATING',
    'ACCEPTED',
    'ACCEPTED_WITH_BLOCKER',
    'REJECTED',
    'BLOCKED',
    'BLOCKED_BY_SURFACE',
    'COMPLETED'
]);

const CONTRACT_KEYS = Object.freeze([
    'reasoningComplexity',
    'objective',
    'technicalContext',
    'confirmedState',
    'expectedBaseCommit',
    'branchEnvironment',
    'allowedScope',
    'protectedAreas',
    'expectedChanges',
    'acceptanceCriteria',
    'mandatoryTests',
    'requiredEvidence',
    'commitPolicy',
    'stopConditions',
    'returnReportFormat'
]);

const REPORT_HEADINGS = Object.freeze([
    'Resumo objetivo',
    'Commit',
    'Arquivos alterados',
    'Mudanças implementadas',
    'Comandos executados',
    'Testes e validações',
    'Artifacts gerados',
    'Limitações',
    'Riscos',
    'Desvios',
    'Não validado',
    'Gate técnico alegado',
    'Push e estado final'
]);

const REPORT_CHECKS = Object.freeze([
    ['resumo objetivo', /## Resumo objetivo/u],
    ['commit criado', /(?:SHA|commit criado)/iu],
    ['commit-base utilizado', /commit-base/iu],
    ['branch', /branch/iu],
    ['lista de commits adicionados', /commits adicionados/iu],
    ['arquivos alterados', /## Arquivos alterados/u],
    ['descrição das mudanças', /## Mudanças implementadas/u],
    ['comandos executados', /## Comandos executados/u],
    ['resultados dos testes', /## Testes e validações/u],
    ['compilação', /compila(?:ção|tion)/iu],
    ['lint', /\blint\b/iu],
    ['typecheck', /\btypecheck\b/iu],
    ['artifacts gerados', /## Artifacts gerados/u],
    ['limitações', /## Limitações/u],
    ['riscos', /## Riscos/u],
    ['desvios', /## Desvios/u],
    ['itens não validados', /## Não validado/u],
    ['push status', /push status/iu],
    ['git status final', /git status --short/iu],
    ['gate técnico alegado', /## Gate técnico alegado/u]
]);

function readJson(root, relativePath) {
    return JSON.parse(readFileSync(path.join(root, relativePath), 'utf8'));
}

function schemaValidator(root, relativePath) {
    const ajv = new Ajv2020({ allErrors: true, strict: true });
    return ajv.compile(readJson(root, relativePath));
}

function formatAjvErrors(errors = []) {
    return errors.map(error => `${error.instancePath || '/'} ${error.message}`).join('; ');
}

function validateStateData(state, root = ROOT) {
    const validate = schemaValidator(root, 'schemas/project-coordination-state.schema.json');
    const valid = validate(state);
    const errors = valid ? [] : [formatAjvErrors(validate.errors)];
    if (state?.activeBaseCommit !== state?.lastAcceptedCommit) errors.push('activeBaseCommit must equal lastAcceptedCommit');
    if (state?.acceptanceAuthority !== 'ChatGPT Work') errors.push('acceptanceAuthority must be ChatGPT Work');
    if (['CODEX_RUNNING', 'VALIDATING'].includes(state?.status) && state?.activeTaskId === state?.lastAcceptedTaskId) {
        errors.push('an active Codex task cannot be its own accepted task');
    }
    return { valid: errors.length === 0, errors };
}

function validateTaskContractData(contract, root = ROOT) {
    const validate = schemaValidator(root, 'schemas/task-execution-contract.schema.json');
    const valid = validate(contract);
    const errors = valid ? [] : [formatAjvErrors(validate.errors)];
    if (contract && JSON.stringify(Object.keys(contract)) !== JSON.stringify(CONTRACT_KEYS)) {
        errors.push(`executionContract keys must appear in normative order: ${CONTRACT_KEYS.join(', ')}`);
    }
    return { valid: errors.length === 0, errors };
}

function validateReportText(text) {
    const missing = REPORT_HEADINGS.filter(heading => !text.includes(`## ${heading}`));
    const missingFields = REPORT_CHECKS.filter(([, pattern]) => !pattern.test(text)).map(([field]) => field);
    const errors = [
        ...missing.map(heading => `missing report heading: ${heading}`),
        ...missingFields.map(field => `missing report field: ${field}`)
    ];
    if (!/Final\s+acceptance remains pending independent ChatGPT Work validation\./u.test(text)) {
        errors.push('report must preserve pending independent Work validation');
    }
    if (/final(?:AcceptanceStatus|\s+acceptance(?:\s+status)?)\s*[:=]\s*["'`]?accepted\b/iu.test(text)) {
        errors.push('report must not mark final acceptance as accepted');
    }
    return { valid: errors.length === 0, missing, missingFields, errors };
}

function validateCoordinationInvariants(state, spec) {
    const errors = [];
    if (state.activeBaseCommit !== state.lastAcceptedCommit) errors.push('activeBaseCommit must equal lastAcceptedCommit');
    if (state.acceptanceAuthority !== 'ChatGPT Work') errors.push('acceptance authority must be ChatGPT Work');
    if (state.activeTaskId !== spec.taskId) errors.push('active task must equal executable spec');
    if (spec.baseCommitExpected !== state.lastAcceptedCommit) errors.push('task base must equal last accepted commit');
    if (spec.taskId === '191') {
        if (state.lastAcceptedTaskId === '191') errors.push('Task 191 cannot mark itself as the accepted task');
        if (state.status !== 'VALIDATING') errors.push('Task 191 must remain VALIDATING');
        if (state.candidateCommit !== null) errors.push('Task 191 candidateCommit must remain null during Codex handoff');
    }
    if (state.status === 'REJECTED' && spec.baseCommitExpected === state.candidateCommit) errors.push('rejected candidate cannot become a task base');
    return { valid: errors.length === 0, errors };
}

function assertText(errors, text, pattern, message) {
    if (!pattern.test(text)) errors.push(message);
}

function validateProjectCoordination(root = ROOT) {
    const errors = [];
    const requiredFiles = [
        'docs/codex/AUTONOMOUS_COORDINATION_POLICY.md',
        'docs/codex/TASK_INSTRUCTION_TEMPLATE.md',
        'docs/codex/CODEX_REPORT_TEMPLATE.md',
        'schemas/project-coordination-state.schema.json',
        'schemas/task-execution-contract.schema.json',
        'data/project-coordination-state.json',
        'tasks/specs/191.json'
    ];
    for (const file of requiredFiles) if (!existsSync(path.join(root, file))) errors.push(`missing required file: ${file}`);
    if (errors.length > 0) return { passed: false, errors };

    const agents = readFileSync(path.join(root, 'AGENTS.md'), 'utf8');
    const workflow = readFileSync(path.join(root, 'docs/codex/WORKFLOW.md'), 'utf8');
    const execution = readFileSync(path.join(root, 'docs/codex/TASK_EXECUTION.md'), 'utf8');
    const policy = readFileSync(path.join(root, 'docs/codex/AUTONOMOUS_COORDINATION_POLICY.md'), 'utf8');
    const reportTemplate = readFileSync(path.join(root, 'docs/codex/CODEX_REPORT_TEMPLATE.md'), 'utf8');
    const currentState = readFileSync(path.join(root, 'docs/codex/CURRENT_STATE.md'), 'utf8');
    const combinedRules = [agents, workflow, execution, policy].join('\n');

    for (const [name, text] of [['AGENTS.md', agents], ['WORKFLOW.md', workflow], ['TASK_EXECUTION.md', execution]]) {
        if (!text.includes('AUTONOMOUS_COORDINATION_POLICY.md')) errors.push(`${name} does not reference the normative policy`);
    }
    if (Buffer.byteLength(agents, 'utf8') > AGENTS_LIMIT) errors.push(`AGENTS.md exceeds ${AGENTS_LIMIT} bytes`);
    if (Buffer.byteLength(currentState, 'utf8') > CURRENT_STATE_LIMIT) errors.push(`CURRENT_STATE.md exceeds ${CURRENT_STATE_LIMIT} bytes`);

    assertText(errors, policy, /ChatGPT Work é o coordenador principal/u, 'policy must name Work as primary coordinator');
    assertText(errors, policy, /Codex não pode\s+aprovar o próprio trabalho/u, 'policy must prohibit Codex self-approval');
    assertText(errors, policy, /HEAD[^\n]*não implica aceitação/u, 'policy must state that HEAD does not imply acceptance');
    assertText(errors, policy, /BLOCKED_BY_SURFACE/u, 'policy must define BLOCKED_BY_SURFACE');
    assertText(errors, policy, /Commits rejeitados nunca se tornam base/u, 'policy must prohibit rejected commits as base');
    assertText(errors, policy, /`REJECTED`[\s\S]{0,120}nunca autorizam avanço/u, 'policy must prohibit advancement from REJECTED');
    for (const status of COORDINATION_STATUSES) if (!policy.includes(`\`${status}\``)) errors.push(`policy missing coordination status: ${status}`);
    if (/Gwen\s+(?:deve|deverá|must|should)[^\n]{0,80}(?:escolh|selecion|choose|select).{0,40}(?:Work|Codex)/iu.test(combinedRules)) {
        errors.push('rules must not require Gwen to select Work or Codex');
    }
    if (!/nunca inventa integração,\s*envio, execução, commit, teste/iu.test(policy)) errors.push('policy lacks explicit surface-honesty prohibition');
    if (!/não implica aceitação/iu.test(combinedRules)) errors.push('rules must not allow HEAD or push to imply acceptance');

    const state = readJson(root, 'data/project-coordination-state.json');
    const stateResult = validateStateData(state, root);
    errors.push(...stateResult.errors.map(error => `coordination state schema: ${error}`));
    if (!COORDINATION_STATUSES.includes(state.status)) errors.push(`invalid coordination status: ${state.status}`);
    if (!/^[0-9a-f]{40}$/u.test(state.lastAcceptedCommit)) errors.push('lastAcceptedCommit is not a 40-character SHA');
    if (state.activeBaseCommit !== state.lastAcceptedCommit) errors.push('activeBaseCommit must equal lastAcceptedCommit');
    if (state.acceptanceAuthority !== 'ChatGPT Work') errors.push('acceptance authority must be ChatGPT Work');
    if (state.activeTaskId === state.lastAcceptedTaskId && ['VALIDATING', 'CODEX_RUNNING'].includes(state.status)) errors.push('active task cannot self-mark as the accepted task');
    try {
        execFileSync('git', ['cat-file', '-e', `${state.lastAcceptedCommit}^{commit}`], { cwd: root, stdio: 'ignore' });
    } catch {
        errors.push(`lastAcceptedCommit does not exist in Git: ${state.lastAcceptedCommit}`);
    }

    const spec = readJson(root, 'tasks/specs/191.json');
    const invariantResult = validateCoordinationInvariants(state, spec);
    errors.push(...invariantResult.errors);
    if (spec.coordinationPolicyVersion !== 1) errors.push('Task 191 must use coordination policy v1');
    if (spec.baseCommitExpected !== state.lastAcceptedCommit) errors.push('Task 191 base must equal last accepted commit');
    if (spec.executionMode !== 'codex') errors.push('Task 191 technical execution mode must be codex');
    const contractResult = validateTaskContractData(spec.executionContract, root);
    errors.push(...contractResult.errors.map(error => `Task 191 contract: ${error}`));
    if (state.lastAcceptedTaskId === '191' || state.lastAcceptedCommit === state.candidateCommit || state.status === 'ACCEPTED') {
        errors.push('Task 191 must not mark itself accepted');
    }

    const reportContractResult = validateReportText(reportTemplate);
    errors.push(...reportContractResult.errors.map(error => `report template: ${error}`));
    const reportPath = path.join(root, 'reports/autonomous-work-codex-coordination-policy-task191.md');
    if (existsSync(reportPath)) {
        const reportResult = validateReportText(readFileSync(reportPath, 'utf8'));
        errors.push(...reportResult.errors.map(error => `Task 191 report: ${error}`));
    }

    const gatePath = path.join(root, 'output/project-coordination/task191-gate.json');
    if (existsSync(gatePath)) {
        const gate = readJson(root, 'output/project-coordination/task191-gate.json');
        if (gate.finalAcceptanceStatus !== 'pending_work_validation') errors.push('Task 191 final acceptance must remain pending Work validation');
    }

    return { passed: errors.length === 0, errors, state, taskId: spec.taskId };
}

function main() {
    const result = validateProjectCoordination();
    if (!result.passed) {
        console.error('Project coordination validation failed');
        for (const error of result.errors) console.error(`- ${error}`);
        process.exitCode = 1;
        return;
    }
    console.log('Project coordination validation passed');
    console.log(`active task: ${result.state.activeTaskId}`);
    console.log(`status: ${result.state.status}`);
    console.log(`last accepted task: ${result.state.lastAcceptedTaskId}`);
    console.log(`last accepted commit: ${result.state.lastAcceptedCommit}`);
    console.log(`acceptance authority: ${result.state.acceptanceAuthority}`);
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();

export {
    AGENTS_LIMIT,
    CONTRACT_KEYS,
    COORDINATION_STATUSES,
    CURRENT_STATE_LIMIT,
    REPORT_HEADINGS,
    REPORT_CHECKS,
    validateProjectCoordination,
    validateCoordinationInvariants,
    validateReportText,
    validateStateData,
    validateTaskContractData
};
