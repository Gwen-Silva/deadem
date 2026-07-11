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
    ['resumo objetivo', 'Resumo objetivo'],
    ['commit criado', 'Commit'],
    ['commit-base utilizado', 'Commit'],
    ['branch', 'Commit'],
    ['lista de commits adicionados', 'Commit'],
    ['arquivos alterados', 'Arquivos alterados'],
    ['descrição das mudanças', 'Mudanças implementadas'],
    ['comandos executados', 'Comandos executados'],
    ['resultados dos testes', 'Testes e validações'],
    ['compilação', 'Testes e validações'],
    ['lint', 'Testes e validações'],
    ['typecheck', 'Testes e validações'],
    ['artifacts gerados', 'Artifacts gerados'],
    ['limitações', 'Limitações'],
    ['riscos', 'Riscos'],
    ['desvios', 'Desvios'],
    ['itens não validados', 'Não validado'],
    ['push status', 'Push e estado final'],
    ['git status final', 'Push e estado final'],
    ['gate técnico alegado', 'Gate técnico alegado']
]);

const REPORT_FIELD_RULES = Object.freeze({
    'Candidate SHA resolution': /^(?:[0-9a-f]{40}|post-commit-attestation:\s*\.local\/codex\/[0-9]{3}\/post-commit-attestation\.json)$/u,
    'Commit-base': /^[0-9a-f]{40}$/u,
    Branch: /^[A-Za-z0-9._/-]+$/u,
    'Commits adicionados': /^1$/u,
    Build: /^(?:passed|not_applicable:.+)$/u,
    Lint: /^(?:passed|failed:.+)$/u,
    Typecheck: /^(?:passed|not_applicable:.+|failed:.+)$/u,
    'Technical gate claim': /^[a-z0-9_]+$/u,
    'Push status': /^(?:pushed:[A-Za-z0-9._/-]+|not_attempted:.+|blocked:.+)$/u,
    'HEAD source': /^(?:[0-9a-f]{40}|post-commit-attestation)$/u,
    'Origin ref': /^(?:origin\/[A-Za-z0-9._/-]+|not_available:.+)$/u,
    'Final status': /^VALIDATING$/u
});

const PLACEHOLDER_PATTERN = /(?:<[^>]+>|\bTBD\b|\bTODO\b|\bplaceholder\b|created after|reported after|will be reported|\bnull\b|\bunknown\b)/iu;

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

function reportSections(text) {
    const sections = new Map();
    const matches = [...text.matchAll(/^## (.+)$/gmu)];
    for (let index = 0; index < matches.length; index += 1) {
        const start = matches[index].index + matches[index][0].length;
        const end = matches[index + 1]?.index ?? text.length;
        sections.set(matches[index][1].trim(), text.slice(start, end).trim());
    }
    return sections;
}

function reportFields(text) {
    const fields = new Map();
    for (const match of text.matchAll(/^- ([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ -]+):\s*(.+)$/gmu)) {
        fields.set(match[1].trim(), match[2].trim());
    }
    return fields;
}

function validateReportTemplate(text) {
    const sections = reportSections(text);
    const errors = REPORT_HEADINGS.filter(heading => !sections.has(heading)).map(heading => `missing report heading: ${heading}`);
    return { valid: errors.length === 0, errors };
}

function validateReportText(text) {
    const sections = reportSections(text);
    const fields = reportFields(text);
    const missing = REPORT_HEADINGS.filter(heading => !sections.has(heading));
    const empty = REPORT_HEADINGS.filter(heading => sections.has(heading) && !sections.get(heading));
    const missingFields = Object.keys(REPORT_FIELD_RULES).filter(field => !fields.has(field));
    const errors = [
        ...missing.map(heading => `missing report heading: ${heading}`),
        ...empty.map(heading => `empty report section: ${heading}`),
        ...missingFields.map(field => `missing report field: ${field}`)
    ];
    for (const [field, rule] of Object.entries(REPORT_FIELD_RULES)) {
        const value = fields.get(field);
        if (value && (!rule.test(value) || PLACEHOLDER_PATTERN.test(value))) errors.push(`invalid report field: ${field}`);
    }
    if (PLACEHOLDER_PATTERN.test(text)) errors.push('report contains a placeholder or unresolved value');
    if (!/Final\s+acceptance remains pending independent ChatGPT Work validation\./u.test(text)) {
        errors.push('report must preserve pending independent Work validation');
    }
    if (/final(?:AcceptanceStatus|\s+acceptance(?:\s+status)?)\s*[:=]\s*["'`]?accepted\b/iu.test(text)) {
        errors.push('report must not mark final acceptance as accepted');
    }
    return { valid: errors.length === 0, missing, missingFields, errors };
}

function validatePostCommitAttestation(data) {
    const errors = [];
    const requiredStrings = ['taskId', 'candidateCommit', 'baseCommit', 'branch', 'technicalGateClaim', 'pushStatus', 'head', 'originRef', 'finalStatus', 'coordinationStatus', 'finalAcceptanceStatus', 'generatedAt'];
    const requiredArrays = ['commitList', 'files', 'commands', 'artifacts', 'limitations', 'risks', 'deviations', 'unvalidated'];
    if (!data || typeof data !== 'object' || Array.isArray(data)) return { valid: false, errors: ['attestation must be an object'] };
    for (const field of requiredStrings) if (typeof data[field] !== 'string' || !data[field].trim() || PLACEHOLDER_PATTERN.test(data[field])) errors.push(`invalid attestation field: ${field}`);
    for (const field of requiredArrays) if (!Array.isArray(data[field])) errors.push(`invalid attestation array: ${field}`);
    if (!/^[0-9]{3}$/u.test(data.taskId ?? '')) errors.push('invalid attestation taskId');
    for (const field of ['candidateCommit', 'baseCommit', 'head']) if (!/^[0-9a-f]{40}$/u.test(data[field] ?? '')) errors.push(`invalid attestation SHA: ${field}`);
    if (data.candidateCommit !== data.head) errors.push('attestation candidateCommit must equal HEAD');
    if (!/^(?:pushed:[A-Za-z0-9._/-]+|not_attempted:.+|blocked:.+)$/u.test(data.pushStatus ?? '')) errors.push('invalid attestation pushStatus');
    if (data.commitCount !== 1 || data.commitList?.length !== 1 || data.commitList?.[0] !== data.candidateCommit) errors.push('attestation must identify exactly one candidate commit');
    if (!data.tests || typeof data.tests !== 'object' || Array.isArray(data.tests)) errors.push('attestation tests must be an object');
    for (const field of ['build', 'lint', 'typecheck']) if (typeof data[field] !== 'string' || !data[field]) errors.push(`invalid attestation field: ${field}`);
    if (data.finalStatus !== 'VALIDATING' || data.coordinationStatus !== 'VALIDATING') errors.push('attestation must remain VALIDATING');
    if (data.finalAcceptanceStatus !== 'pending_work_validation') errors.push('attestation must preserve pending Work validation');
    return { valid: errors.length === 0, errors };
}

function validateCoordinationInvariants(state, spec, options = {}) {
    const errors = [];
    const expectedBaseCommit = options.expectedBaseCommit;
    const acceptedState = options.acceptedState;
    const actualBranch = options.actualBranch;
    const resolvedCandidateCommit = options.resolvedCandidateCommit;
    if (state.activeBaseCommit !== state.lastAcceptedCommit) errors.push('activeBaseCommit must equal lastAcceptedCommit');
    if (state.acceptanceAuthority !== 'ChatGPT Work') errors.push('acceptance authority must be ChatGPT Work');
    if (state.activeTaskId !== spec.taskId) errors.push('active task must equal executable spec');
    if (spec.baseCommitExpected !== state.lastAcceptedCommit) errors.push('task base must equal last accepted commit');
    if (expectedBaseCommit && state.lastAcceptedCommit !== expectedBaseCommit) errors.push('Codex cannot change lastAcceptedCommit from the Work-authorized base');
    if (expectedBaseCommit && spec.baseCommitExpected !== expectedBaseCommit) errors.push('spec base diverges from the Work-authorized base');
    if (acceptedState && state.updatedBy === 'Codex' && (state.lastAcceptedCommit !== acceptedState.lastAcceptedCommit || state.lastAcceptedTaskId !== acceptedState.lastAcceptedTaskId)) {
        errors.push('Codex cannot change the last accepted task or commit');
    }
    if (actualBranch && state.branch !== actualBranch) errors.push('coordination branch diverges from the execution branch');
    if (state.updatedBy === 'Codex' && ['ACCEPTED', 'ACCEPTED_WITH_BLOCKER', 'COMPLETED'].includes(state.status)) errors.push('Codex cannot set an acceptance status');
    if (state.activeTaskId === state.lastAcceptedTaskId) errors.push('active task cannot be its own accepted task');
    if (state.rejectedCommits?.includes(state.activeBaseCommit) || state.rejectedCommits?.includes(spec.baseCommitExpected)) errors.push('rejected commit cannot be used as a base');
    if (state.status === 'VALIDATING') {
        if (!state.candidateResolution || state.candidateResolution.strategy !== 'git_head_exactly_one_commit_from_active_base') errors.push('VALIDATING state requires deterministic candidate resolution');
        if (state.candidateResolution?.branch !== state.branch) errors.push('candidate resolution branch must equal coordination branch');
        if (state.candidateResolution?.requiredCommitCount !== 1) errors.push('candidate resolution must require exactly one commit');
    }
    if (state.status === 'READY_FOR_CODEX') {
        if (state.candidateCommit !== null) errors.push('READY_FOR_CODEX cannot have a candidate commit');
        if (state.candidateResolution !== null) errors.push('READY_FOR_CODEX cannot have candidate resolution');
    }
    if (resolvedCandidateCommit) {
        if (state.rejectedCommits?.includes(resolvedCandidateCommit)) errors.push('rejected commit cannot be the resolved candidate');
        if (resolvedCandidateCommit === state.lastAcceptedCommit) errors.push('candidate cannot equal the accepted commit');
        if (state.candidateCommit && state.candidateCommit !== resolvedCandidateCommit) errors.push('recorded candidate differs from Git-resolved candidate');
    }
    return { valid: errors.length === 0, errors };
}

function assertText(errors, text, pattern, message) {
    if (!pattern.test(text)) errors.push(message);
}

function validateProjectCoordination(root = ROOT, options = {}) {
    const errors = [];
    const statePath = path.join(root, 'data/project-coordination-state.json');
    if (!options.stateOverride && !existsSync(statePath)) return { passed: false, errors: ['missing required file: data/project-coordination-state.json'] };
    const state = options.stateOverride ?? readJson(root, 'data/project-coordination-state.json');
    const activeSpecPath = `tasks/specs/${state.activeTaskId}.json`;
    const requiredFiles = [
        'docs/codex/AUTONOMOUS_COORDINATION_POLICY.md',
        'docs/codex/TASK_INSTRUCTION_TEMPLATE.md',
        'docs/codex/CODEX_REPORT_TEMPLATE.md',
        'schemas/project-coordination-state.schema.json',
        'schemas/task-execution-contract.schema.json',
        'data/project-coordination-state.json',
        activeSpecPath
    ];
    for (const file of requiredFiles) if (!(file === 'data/project-coordination-state.json' && options.stateOverride) && !(file === activeSpecPath && options.specOverride) && !existsSync(path.join(root, file))) errors.push(`missing required file: ${file}`);
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

    const spec = options.specOverride ?? readJson(root, activeSpecPath);
    const invariantResult = validateCoordinationInvariants(state, spec);
    errors.push(...invariantResult.errors);
    if (spec.coordinationPolicyVersion !== 1) errors.push(`active Task ${spec.taskId} must use coordination policy v1`);
    if (spec.baseCommitExpected !== state.lastAcceptedCommit) errors.push(`active Task ${spec.taskId} base must equal last accepted commit`);
    if (spec.executionMode !== 'codex') errors.push(`active Task ${spec.taskId} technical execution mode must be codex`);
    const contractResult = validateTaskContractData(spec.executionContract, root);
    errors.push(...contractResult.errors.map(error => `Task ${spec.taskId} contract: ${error}`));

    const reportContractResult = validateReportTemplate(reportTemplate);
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
    validatePostCommitAttestation,
    validateProjectCoordination,
    validateCoordinationInvariants,
    validateReportText,
    validateReportTemplate,
    validateStateData,
    validateTaskContractData
};
