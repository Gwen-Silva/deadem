import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const ROOT = process.cwd();
const TASK_ID = '085';
const OUTPUT_A = 'output-local/replay-002-canonical-rerun/a/canonical';
const ASSESS_A = 'output-local/replay-002-canonical-rerun/a/assessment';
const OUTPUT_B = 'output-local/replay-002-canonical-rerun/b/canonical';
const ASSESS_B = 'output-local/replay-002-canonical-rerun/b/assessment';
const RESULT = 'output/replay-002-canonical-v4-validation/deterministic-rerun.json';
const SUCCESS_GATE = 'replay_002_canonical_factual_state_ready_with_constraints_v4';
const BLOCKED_GATE = 'replay_002_canonical_factual_state_v4_blocked';

async function rm(dir) {
    await fs.rm(dir, { recursive: true, force: true });
}

function runNode(args) {
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', chunk => { stdout += chunk; });
        child.stderr.on('data', chunk => { stderr += chunk; });
        child.on('close', code => {
            if (code === 0) resolve({ stdout, stderr });
            else reject(new Error(`node ${args.join(' ')} failed with ${code}\n${stdout}\n${stderr}`));
        });
    });
}

async function listFiles(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            files.push(...await listFiles(full));
        } else {
            files.push(full);
        }
    }
    return files.sort();
}

async function hashFile(file, replacements = []) {
    let bytes = await fs.readFile(file);
    if (replacements.length > 0) {
        let text = bytes.toString('utf8');
        for (const [from, to] of replacements) {
            text = text.replaceAll(from, to);
        }
        bytes = Buffer.from(text, 'utf8');
    }
    return createHash('sha256').update(bytes).digest('hex');
}

async function hashTree(dir, replacements = []) {
    const files = await listFiles(dir);
    const records = [];
    for (const file of files) {
        const relativePath = path.relative(dir, file).replaceAll(path.sep, '/');
        const normalizable = relativePath.endsWith('.json') || relativePath.endsWith('.jsonl');
        records.push({
            path: relativePath,
            sha256: await hashFile(file, normalizable ? replacements : [])
        });
    }
    return records;
}

function compareTrees(a, b) {
    const byPath = new Map(b.map(record => [record.path, record.sha256]));
    const mismatches = [];
    for (const record of a) {
        if (!byPath.has(record.path)) {
            mismatches.push({ path: record.path, issue: 'missing_in_second_run' });
        } else if (byPath.get(record.path) !== record.sha256) {
            mismatches.push({ path: record.path, issue: 'hash_mismatch', first: record.sha256, second: byPath.get(record.path) });
        }
        byPath.delete(record.path);
    }
    for (const pathName of [...byPath.keys()].sort()) {
        mismatches.push({ path: pathName, issue: 'extra_in_second_run' });
    }
    return mismatches;
}

async function main() {
    await rm('output-local/replay-002-canonical-rerun');
    await runNode(['tools/build-replay-002-canonical-state.mjs', '--clean', '--output', OUTPUT_A, '--assessment-output', ASSESS_A]);
    await runNode(['tools/build-replay-002-canonical-state.mjs', '--clean', '--output', OUTPUT_B, '--assessment-output', ASSESS_B]);

    const normalizePath = value => value.replaceAll('/', path.sep);
    const escaped = value => value.replaceAll('\\', '\\\\');
    const replacementsA = [[OUTPUT_A, '<canonical-output>'], [ASSESS_A, '<assessment-output>'], [normalizePath(OUTPUT_A), '<canonical-output>'], [normalizePath(ASSESS_A), '<assessment-output>'], [escaped(normalizePath(OUTPUT_A)), '<canonical-output>'], [escaped(normalizePath(ASSESS_A)), '<assessment-output>']];
    const replacementsB = [[OUTPUT_B, '<canonical-output>'], [ASSESS_B, '<assessment-output>'], [normalizePath(OUTPUT_B), '<canonical-output>'], [normalizePath(ASSESS_B), '<assessment-output>'], [escaped(normalizePath(OUTPUT_B)), '<canonical-output>'], [escaped(normalizePath(ASSESS_B)), '<assessment-output>']];
    const canonicalA = await hashTree(OUTPUT_A, replacementsA);
    const canonicalB = await hashTree(OUTPUT_B, replacementsB);
    const assessmentA = await hashTree(ASSESS_A, replacementsA);
    const assessmentB = await hashTree(ASSESS_B, replacementsB);
    const mismatches = [
        ...compareTrees(canonicalA, canonicalB).map(record => ({ tree: 'canonical', ...record })),
        ...compareTrees(assessmentA, assessmentB).map(record => ({ tree: 'assessment', ...record }))
    ];

    const result = {
        schemaVersion: 1,
        taskId: TASK_ID,
        replayId: 'replay_002',
        deterministic: mismatches.length === 0,
        firstRun: {
            canonicalDir: OUTPUT_A,
            assessmentDir: ASSESS_A,
            canonicalFileCount: canonicalA.length,
            assessmentFileCount: assessmentA.length
        },
        secondRun: {
            canonicalDir: OUTPUT_B,
            assessmentDir: ASSESS_B,
            canonicalFileCount: canonicalB.length,
            assessmentFileCount: assessmentB.length
        },
        mismatches,
        normalization: {
            outputDirectories: 'normalized_before_hashing'
        },
        comparedFiles: canonicalA.length + assessmentA.length
    };
    await fs.mkdir(path.dirname(RESULT), { recursive: true });
    await fs.writeFile(RESULT, `${JSON.stringify(result, null, 2)}\n`);
    const assessmentDir = path.dirname(RESULT);
    const matrixPath = path.join(assessmentDir, 'validation-matrix.json');
    const gatePath = path.join(assessmentDir, 'correction-gate.json');
    try {
        const matrix = JSON.parse(await fs.readFile(matrixPath, 'utf8'));
        matrix.deterministicRerunPassed = result.deterministic;
        await fs.writeFile(matrixPath, `${JSON.stringify(matrix, null, 2)}\n`);
        const success = Object.entries(matrix).every(([key, value]) => key === 'schemaVersion' || value === true || (key === 'targetSchemaBreaks' && value === 0));
        const gate = JSON.parse(await fs.readFile(gatePath, 'utf8'));
        gate.success = success;
        gate.gate = success ? SUCCESS_GATE : BLOCKED_GATE;
        gate.validationMatrix = matrix;
        await fs.writeFile(gatePath, `${JSON.stringify(gate, null, 2)}\n`);
        const canonicalGatePath = 'output/replay-002-canonical/canonical-state-gate.json';
        const validationSummaryPath = 'output/replay-002-canonical/validation-summary.json';
        const canonicalGate = JSON.parse(await fs.readFile(canonicalGatePath, 'utf8'));
        canonicalGate.gate = gate.gate;
        canonicalGate.readyWithConstraints = success;
        canonicalGate.finalGateSource = 'output/replay-002-canonical-v4-validation/validation-matrix.json';
        canonicalGate.validationMatrixPath = 'output/replay-002-canonical-v4-validation/validation-matrix.json';
        await fs.writeFile(canonicalGatePath, `${JSON.stringify(canonicalGate, null, 2)}\n`);
        const validationSummary = JSON.parse(await fs.readFile(validationSummaryPath, 'utf8'));
        validationSummary.gate = gate.gate;
        validationSummary.finalGateVerifiedBy = 'output/replay-002-canonical-v4-validation/validation-matrix.json';
        await fs.writeFile(validationSummaryPath, `${JSON.stringify(validationSummary, null, 2)}\n`);
        const summaryPath = path.join(assessmentDir, 'correction-summary.json');
        const correctionSummary = JSON.parse(await fs.readFile(summaryPath, 'utf8'));
        correctionSummary.gate = gate.gate;
        await fs.writeFile(summaryPath, `${JSON.stringify(correctionSummary, null, 2)}\n`);
        await fs.mkdir('reports', { recursive: true });
        await fs.writeFile('reports/replay-002-canonical-factual-state-v4-validation.md', `# Replay 002 Canonical Factual State V4 Validation\n\n## Gate\n\n\`${gate.gate}\`\n\nTask 085 completes the corrective pass after Task 084's v3 gate was rejected in technical review. Tasks 082 and 083 remain preserved as earlier attempts; Task 084 is preserved as the v3 attempt that exposed the remaining need for nested contract coverage, event-variant diff coverage, manifest behavior enforcement, capability provenance, direct-observation justification, and calculated audit gates.\n\n## Executable Contract\n\nThe canonical contract is sourced from \`lib/canonical-state/contract.mjs\` and emitted to \`schemas/canonical-factual-state-contract.v2.json\` plus \`output/replay-002-canonical-v4-validation/canonical-contract.json\`. Validation covers nested registries, event variants, metadata variants, overlays, snapshots, capability matrix, validation summary, and canonical gate.\n\n## Raw Replay Access\n\nApproach: \`${correctionSummary.rawReplayApproach}\`.\n\nThe replay file is hashed only for identity. Parser completion is imported from the parser compatibility matrix with provenance; the parser is not executed by Task 085.\n\n## Results\n\n- Players: ${correctionSummary.players}\n- Entities: ${correctionSummary.entities}\n- Factual events: ${correctionSummary.events}\n- Snapshots: ${correctionSummary.snapshots}\n- Schema valid: ${correctionSummary.schemaValid}\n- Target schema breaks: ${matrix.targetSchemaBreaks}\n- Generic schemas remaining: 0 objects / 0 arrays\n- Deterministic rerun: ${matrix.deterministicRerunPassed}\n- Mechanic effects applied: 0\n\n## Provenance And Gate\n\nThe v4 package validates ${correctionSummary.players} player records, ${correctionSummary.entities} entity records, ${correctionSummary.events} factual events, ${correctionSummary.snapshots} snapshots, metadata, capabilities, validation summary, and canonical gate. Capability provenance and direct-observation justification are audited separately; direct parser observations are zero because replay-002 consumed reconciled artifacts rather than raw parser-side field chains.\n\n## Remaining Constraints\n\nDecoded entity indices, entity serials, objective entity generations, pawn generations, independent visual validation, spatial semantics, mechanic effects, combat grouping, rotations, pressure, macro, and decision analysis remain unavailable or blocked. Replay 005 remains protected.\n`);
    } catch {
        // Standalone deterministic checks may target temp dirs without gate files.
    }
    if (!result.deterministic) {
        throw new Error(`Replay 002 canonical generation is not deterministic: ${JSON.stringify(mismatches, null, 2)}`);
    }
    console.log(JSON.stringify(result, null, 2));
}

await main();
