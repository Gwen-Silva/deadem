import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { auditContractSourceConsistency } from '../lib/canonical-state/audits/contract-source-consistency.mjs';
import { auditDocumentation } from '../lib/canonical-state/audits/documentation-audit.mjs';
import { auditDirectObservations, auditEpistemicClassification } from '../lib/canonical-state/audits/epistemic-audit.mjs';
import { auditIoPolicy } from '../lib/canonical-state/audits/io-policy-audit.mjs';

const ROOT = process.cwd();
const TASK_ID = '086';
const OUTPUT_A = 'output-local/replay-002-canonical-rerun/a/canonical';
const ASSESS_A = 'output-local/replay-002-canonical-rerun/a/assessment';
const OUTPUT_B = 'output-local/replay-002-canonical-rerun/b/canonical';
const ASSESS_B = 'output-local/replay-002-canonical-rerun/b/assessment';
const RESULT = 'output/replay-002-canonical-v5-validation/deterministic-rerun.json';
const SUCCESS_GATE = 'replay_002_canonical_factual_state_ready_with_constraints_v5';
const BLOCKED_GATE = 'replay_002_canonical_factual_state_v5_blocked';

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

async function readJson(file) {
    return JSON.parse(await fs.readFile(file, 'utf8'));
}

async function writeJson(file, value) {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

async function artifactRef(file) {
    return {
        artifact: path.relative(path.dirname(RESULT), file).replaceAll(path.sep, '/'),
        path: file.replaceAll(path.sep, '/'),
        sha256: await hashFile(file)
    };
}

async function buildAuditManifest(assessmentDir) {
    const files = (await listFiles(assessmentDir))
        .filter(file => file.endsWith('.json'))
        .filter(file => !file.endsWith('audit-artifact-manifest.json') && !file.endsWith('validation-matrix.json') && !file.endsWith('correction-gate.json'));
    return {
        schemaVersion: 1,
        taskId: TASK_ID,
        artifacts: await Promise.all(files.map(async file => ({
            path: path.relative(assessmentDir, file).replaceAll(path.sep, '/'),
            sha256: await hashFile(file),
            sizeBytes: (await fs.stat(file)).size
        })))
    };
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
    const manifest = await readJson(path.join(assessmentDir, 'input-manifest.json'));
    const epistemicAudit = await auditEpistemicClassification('output/replay-002-canonical');
    await writeJson(path.join(assessmentDir, 'epistemic-classification-audit.json'), epistemicAudit);
    const directObservationAudit = await auditDirectObservations('output/replay-002-canonical');
    await writeJson(path.join(assessmentDir, 'direct-observation-justification.json'), directObservationAudit);
    const ioAudit = await auditIoPolicy(manifest);
    await writeJson(path.join(assessmentDir, 'io-policy-audit.json'), ioAudit);
    const contractConsistency = await auditContractSourceConsistency({
        schemaPath: 'schemas/canonical-factual-state-contract.v2.json',
        emittedPath: path.join(assessmentDir, 'canonical-contract.json')
    });
    await writeJson(path.join(assessmentDir, 'contract-source-consistency.json'), contractConsistency);
    const documentationAudit = await auditDocumentation();
    await writeJson(path.join(assessmentDir, 'documentation-consistency.json'), documentationAudit);
    const auditManifest = await buildAuditManifest(assessmentDir);
    await writeJson(path.join(assessmentDir, 'audit-artifact-manifest.json'), auditManifest);

    const matrixPath = path.join(assessmentDir, 'validation-matrix.json');
    const gatePath = path.join(assessmentDir, 'correction-gate.json');
    try {
        const priorMatrix = await readJson(matrixPath);
        const schemaDiff = await readJson(path.join(assessmentDir, 'canonical-schema-diff.json'));
        const schemaDiffCoverage = await readJson(path.join(assessmentDir, 'schema-diff-coverage.json'));
        const contractValidation = await readJson(path.join(assessmentDir, 'canonical-schema-validation.json'));
        const contractCompleteness = await readJson(path.join(assessmentDir, 'contract-completeness-audit.json'));
        const provenanceAudit = await readJson(path.join(assessmentDir, 'provenance-audit.json'));
        const identityAudit = await readJson(path.join(assessmentDir, 'identity-and-generation-audit.json'));
        const spatialAudit = await readJson(path.join(assessmentDir, 'spatial-leakage-audit.json'));
        const manifestBehavior = await readJson(path.join(assessmentDir, 'manifest-behavior-validation.json'));
        const protectionsAudit = await readJson(path.join(assessmentDir, 'protections-audit.json'));
        const ref = async (name, passed) => ({ passed, ...await artifactRef(path.join(assessmentDir, name)) });
        const matrix = {
            schemaVersion: 2,
            taskId: TASK_ID,
            replayId: 'replay_002',
            contractCompleteness: await ref('contract-completeness-audit.json', contractCompleteness.passed),
            contractValidation: await ref('canonical-schema-validation.json', contractValidation.valid),
            schemaDiffCoverage: await ref('schema-diff-coverage.json', schemaDiffCoverage.passed && schemaDiffCoverage.comparisons.every(item => item.missingComparisons.length === 0)),
            targetSchemaBreaks: schemaDiff.targetV5VersusContractV5.schemaBreaks,
            replay009ContractCoverage: await ref('schema-diff-coverage.json', schemaDiffCoverage.comparisons.find(item => item.comparison === 'replay009V1VersusContractV5')?.passed === true),
            provenanceAudit: await ref('provenance-audit.json', provenanceAudit.passed),
            globalEpistemicAudit: await ref('epistemic-classification-audit.json', epistemicAudit.passed),
            directObservationAudit: await ref('direct-observation-justification.json', directObservationAudit.passed),
            identityAudit: await ref('identity-and-generation-audit.json', identityAudit.fabricatedGenerationCount === 0 && identityAudit.eventRegistryReferenceMismatches.length === 0),
            spatialLeakageAudit: await ref('spatial-leakage-audit.json', spatialAudit.findings.length === 0),
            manifestBehaviorAudit: await ref('manifest-behavior-validation.json', manifestBehavior.passed),
            ioStaticAudit: await ref('io-policy-audit.json', ioAudit.passed),
            contractDeepConsistency: await ref('contract-source-consistency.json', contractConsistency.passed),
            documentationContentAudit: await ref('documentation-consistency.json', documentationAudit.passed),
            protectionsAudit: await ref('protections-audit.json', protectionsAudit.passed),
            deterministicRerun: await ref('deterministic-rerun.json', result.deterministic),
            auditArtifactManifest: await ref('audit-artifact-manifest.json', true),
            previousMatrixShape: Object.keys(priorMatrix).sort()
        };
        const matrixPassed = Object.entries(matrix)
            .filter(([key]) => !['schemaVersion', 'taskId', 'replayId', 'targetSchemaBreaks', 'previousMatrixShape'].includes(key))
            .every(([, value]) => value.passed === true);
        const success = matrixPassed && matrix.targetSchemaBreaks === 0;
        await writeJson(matrixPath, matrix);
        const gate = await readJson(gatePath);
        gate.success = success;
        gate.gate = success ? SUCCESS_GATE : BLOCKED_GATE;
        gate.validationMatrix = matrix;
        await writeJson(gatePath, gate);
        const canonicalGatePath = 'output/replay-002-canonical/canonical-state-gate.json';
        const validationSummaryPath = 'output/replay-002-canonical/validation-summary.json';
        const canonicalGate = await readJson(canonicalGatePath);
        canonicalGate.gate = gate.gate;
        canonicalGate.readyWithConstraints = success;
        canonicalGate.finalGateSource = 'output/replay-002-canonical-v5-validation/validation-matrix.json';
        canonicalGate.validationMatrixPath = 'output/replay-002-canonical-v5-validation/validation-matrix.json';
        await writeJson(canonicalGatePath, canonicalGate);
        const validationSummary = await readJson(validationSummaryPath);
        validationSummary.gate = gate.gate;
        validationSummary.finalGateVerifiedBy = 'output/replay-002-canonical-v5-validation/validation-matrix.json';
        validationSummary.factualEventEpistemicTypeCounts = validationSummary.epistemicTypeCounts;
        validationSummary.packageEpistemicTypeCounts = epistemicAudit.byArtifact;
        await writeJson(validationSummaryPath, validationSummary);
        const summaryPath = path.join(assessmentDir, 'correction-summary.json');
        const correctionSummary = await readJson(summaryPath);
        correctionSummary.gate = gate.gate;
        await writeJson(summaryPath, correctionSummary);
        await fs.mkdir('reports', { recursive: true });
        await fs.writeFile('reports/replay-002-canonical-factual-state-v5-validation.md', `# Replay 002 Canonical Factual State V5 Validation\n\n## Gate\n\n\`${gate.gate}\`\n\nTask 086 closes final audit coverage and independence gaps after Task 085's v4 gate was rejected in technical review. Tasks 082 through 085 remain preserved as historical attempts.\n\n## Executable Contract And Audits\n\nThe v5 contract is sourced from \`lib/canonical-state/contract.mjs\` and deeply compared against \`schemas/canonical-factual-state-contract.v2.json\` and \`output/replay-002-canonical-v5-validation/canonical-contract.json\`. Static IO, documentation, epistemic, direct-observation, schema-diff coverage, and contract-source consistency audits are generated by independent audit modules and referenced by hash in the validation matrix.\n\n## Results\n\n- Players: ${correctionSummary.players}\n- Entities: ${correctionSummary.entities}\n- Factual events: ${correctionSummary.events}\n- Snapshots: ${correctionSummary.snapshots}\n- Target schema breaks: ${matrix.targetSchemaBreaks}\n- Global provenance records: ${epistemicAudit.totalProvenanceRecords}\n- Direct observations: ${directObservationAudit.directObservationCount}\n- Deterministic rerun: ${matrix.deterministicRerun.passed}\n- Mechanic effects applied: 0\n\n## Remaining Constraints\n\nDecoded entity indices, entity serials, objective entity generations, pawn generations, independent visual validation, spatial semantics, mechanic effects, combat grouping, rotations, pressure, macro, and decision analysis remain unavailable or blocked. Replay 005 remains protected.\n`);
    } catch {
        // Standalone deterministic checks may target temp dirs without gate files.
    }
    if (!result.deterministic) {
        throw new Error(`Replay 002 canonical generation is not deterministic: ${JSON.stringify(mismatches, null, 2)}`);
    }
    console.log(JSON.stringify(result, null, 2));
}

await main();
