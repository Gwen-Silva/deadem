import { promises as fs } from 'node:fs';
import { sha256File } from './common.mjs';

const DOC_FILES = [
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
    'tasks/blocked/087-select-next-canonical-generalization-control.md'
];

export async function auditDocumentation() {
    const filesExamined = [];
    const corpus = {};
    const task086Path = await firstExistingPath([
        'tasks/active/086-close-canonical-audit-coverage-and-independence.md',
        'tasks/completed/086-close-canonical-audit-coverage-and-independence.md'
    ]);
    const filesToRead = task086Path ? [...DOC_FILES, task086Path] : [...DOC_FILES, 'tasks/active/086-close-canonical-audit-coverage-and-independence.md'];
    for (const file of filesToRead) {
        try {
            const text = await fs.readFile(file, 'utf8');
            corpus[file] = text;
            filesExamined.push({ path: file, sha256: await sha256File(file), exists: true });
        } catch {
            filesExamined.push({ path: file, sha256: null, exists: false });
            corpus[file] = '';
        }
    }
    const allText = Object.values(corpus).join('\n');
    const rules = [
        { ruleId: 'previous_tasks_preserved', passed: allText.includes('Task 082') && allText.includes('Task 083') && allText.includes('Task 084') && allText.includes('Task 085') },
        { ruleId: 'current_gate_v5', passed: allText.includes('replay_002_canonical_factual_state_ready_with_constraints_v5') },
        { ruleId: 'next_task_087', passed: allText.includes('tasks/blocked/087-select-next-canonical-generalization-control.md') || allText.includes('Task 087') },
        { ruleId: 'no_stale_next_task_085_or_086_select', passed: !/next (task|follow-up)[^\n]*(085|086)-select-next-canonical-generalization-control/i.test(allText) },
        { ruleId: 'replay_005_protected', passed: allText.includes('Replay 005 remains protected') || allText.includes('replay 005') },
        { ruleId: 'spatial_paused', passed: allText.includes('spatial') && allText.includes('paused') || allText.includes('pausada') },
        { ruleId: 'no_full_corpus_generalization_claim', passed: !allText.includes('full corpus generalization is proven') && !allText.includes('proves full corpus generalization') },
        { ruleId: 'no_macro_mechanics_spatial_claim', passed: !/mechanic effects applied:\s*[1-9]/i.test(allText) && !/macro analysis (is )?ready/i.test(allText) && !/spatial semantics (are )?ready/i.test(allText) }
    ];
    return {
        schemaVersion: 1,
        filesExamined,
        rules,
        failures: rules.filter(rule => !rule.passed),
        passed: filesExamined.every(file => file.exists) && rules.every(rule => rule.passed)
    };
}

async function firstExistingPath(paths) {
    for (const file of paths) {
        try {
            await fs.access(file);
            return file;
        } catch {
            // Try the next queue state.
        }
    }
    return null;
}
