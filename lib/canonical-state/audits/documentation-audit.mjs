import { promises as fs } from 'node:fs';
import { sha256File } from './common.mjs';

const BASE_FILES = [
    'README.md',
    'docs/PROJECT_STATE.md',
    'docs/NEXT_MILESTONE.md',
    'docs/PROJECT_VISION_AND_ROADMAP.md',
    'docs/REPOSITORY_GUIDE.md',
    'output/README.md',
    'reports/INDEX.md',
    'reports/latest.md',
    'tasks/completed/082-generalize-canonical-factual-state-to-replay-002.md',
    'tasks/completed/083-correct-replay-002-canonical-generalization-foundation.md',
    'tasks/completed/084-enforce-canonical-contract-diff-io-and-final-gate.md',
    'tasks/completed/085-complete-nested-contract-event-diff-and-audit-gate.md',
    'tasks/completed/086-close-canonical-audit-coverage-and-independence.md',
    'tasks/completed/087-finalize-canonical-attestation-and-full-pipeline-determinism.md'
];

export async function auditDocumentation(options = {}) {
    const expectedGate = options.expectedGate ?? 'replay_002_canonical_factual_state_ready_with_constraints_v7';
    const nextTaskPath = options.nextTaskPath ?? 'tasks/blocked/089-select-next-canonical-generalization-control.md';
    const reportPath = options.reportPath ?? 'reports/replay-002-canonical-factual-state-v7-validation.md';
    const task088 = await firstExistingPath([
        'tasks/active/088-make-final-attestation-authoritative-and-schema-ledger-executable.md',
        'tasks/completed/088-make-final-attestation-authoritative-and-schema-ledger-executable.md'
    ]);
    const files = [...BASE_FILES, task088 ?? 'tasks/active/088-make-final-attestation-authoritative-and-schema-ledger-executable.md', nextTaskPath];
    const corpus = {};
    const filesExamined = [];
    for (const file of files) {
        try {
            const text = await fs.readFile(file, 'utf8');
            corpus[file] = text;
            filesExamined.push({ path: file, sha256: await sha256File(file), exists: true });
        } catch {
            corpus[file] = '';
            filesExamined.push({ path: file, sha256: null, exists: false });
        }
    }
    const rules = [
        fileRule('readme_declares_v7', ['README.md'], text => text.includes(expectedGate)),
        fileRule('project_state_declares_v7', ['docs/PROJECT_STATE.md'], text => text.includes(expectedGate)),
        fileRule('next_milestone_points_to_089', ['docs/NEXT_MILESTONE.md'], text => text.includes(nextTaskPath) || text.includes('Task 089')),
        fileRule('latest_points_to_v7_report', ['reports/latest.md'], text => text.includes(reportPath.replace('reports/', ''))),
        fileRule('index_points_to_v7_report', ['reports/INDEX.md'], text => text.includes(reportPath)),
        fileRule('previous_tasks_preserved', BASE_FILES.filter(file => file.includes('tasks/completed/08')), text => text.includes('Task 08') || text.includes('# Task 08')),
        fileRule('task088_records_scope', [task088 ?? 'tasks/active/088-make-final-attestation-authoritative-and-schema-ledger-executable.md'], text => text.includes('Do not process replays 001') && text.includes('Do not read, open, hash, or process replay 005')),
        multiFileRule('replay005_protected_in_state_docs', ['README.md', 'docs/PROJECT_STATE.md', 'docs/NEXT_MILESTONE.md'], text => /replay 005.*protected|Replay 005.*protected/i.test(text)),
        multiFileRule('no_full_corpus_generalization_claim', ['README.md', 'docs/PROJECT_STATE.md', 'docs/NEXT_MILESTONE.md'], text => !/full corpus generalization (is )?(proven|ready)/i.test(text)),
        multiFileRule('no_spatial_mechanics_macro_ready_claim', ['README.md', 'docs/PROJECT_STATE.md', 'docs/NEXT_MILESTONE.md', 'docs/REPOSITORY_GUIDE.md'], text => !/spatial semantics (are )?ready|mechanic effects applied:\s*[1-9]|macro analysis (is )?ready/i.test(text)),
        multiFileRule('no_stale_next_task_088_select', ['README.md', 'docs/PROJECT_STATE.md', 'docs/NEXT_MILESTONE.md', 'reports/latest.md'], text => !/next (task|follow-up)[^\n]*(088-select-next-canonical-generalization-control)/i.test(text))
    ];
    const evaluated = rules.map(rule => evaluateRule(rule, corpus));
    return {
        schemaVersion: 2,
        filesExamined,
        rules: evaluated,
        failures: evaluated.filter(rule => !rule.passed),
        passed: filesExamined.every(file => file.exists) && evaluated.every(rule => rule.passed)
    };
}

function fileRule(ruleId, files, predicate) {
    return { ruleId, files, predicate, mode: 'all' };
}

function multiFileRule(ruleId, files, predicate) {
    return { ruleId, files, predicate, mode: 'all' };
}

function evaluateRule(rule, corpus) {
    const matches = [];
    const failures = [];
    for (const file of rule.files) {
        const text = corpus[file] ?? '';
        const passed = rule.predicate(text);
        if (passed) matches.push({ file });
        else failures.push({ file });
    }
    return { ruleId: rule.ruleId, files: rule.files, matches, failures, passed: failures.length === 0 };
}

async function firstExistingPath(paths) {
    for (const file of paths) {
        try {
            await fs.access(file);
            return file;
        } catch {
            // Try next queue state.
        }
    }
    return null;
}
