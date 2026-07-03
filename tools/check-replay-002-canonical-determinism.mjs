import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const ROOT = process.cwd();
const TASK_ID = '083';
const OUTPUT_A = 'output-local/replay-002-canonical-rerun/a/canonical';
const ASSESS_A = 'output-local/replay-002-canonical-rerun/a/assessment';
const OUTPUT_B = 'output-local/replay-002-canonical-rerun/b/canonical';
const ASSESS_B = 'output-local/replay-002-canonical-rerun/b/assessment';
const RESULT = 'output/replay-002-canonical-correction/deterministic-rerun.json';

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
        records.push({
            path: relativePath,
            sha256: await hashFile(file, ['input-access-log.json', 'input-manifest.json'].includes(relativePath) ? replacements : [])
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

    const canonicalA = await hashTree(OUTPUT_A);
    const canonicalB = await hashTree(OUTPUT_B);
    const assessmentA = await hashTree(ASSESS_A, [[OUTPUT_A, '<canonical-output>'], [ASSESS_A, '<assessment-output>']]);
    const assessmentB = await hashTree(ASSESS_B, [[OUTPUT_B, '<canonical-output>'], [ASSESS_B, '<assessment-output>']]);
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
            inputAccessLogAndManifestOutputDirectories: 'normalized_before_hashing'
        },
        comparedFiles: canonicalA.length + assessmentA.length
    };
    await fs.mkdir(path.dirname(RESULT), { recursive: true });
    await fs.writeFile(RESULT, `${JSON.stringify(result, null, 2)}\n`);
    if (!result.deterministic) {
        throw new Error(`Replay 002 canonical generation is not deterministic: ${JSON.stringify(mismatches, null, 2)}`);
    }
    console.log(JSON.stringify(result, null, 2));
}

await main();
