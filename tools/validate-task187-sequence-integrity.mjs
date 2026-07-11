#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdir, readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TASK185_COMMIT = '8ca6d50fd99fdc6fc4b802ab3af2e74b06f4796e';
const TASK187_COMMIT = 'f5825e4ffc537e5986de699fd34d1a3df1a91b0f';
const TASK185_ROOT = 'output/local-replay-processing/death-event-directional-cycle-evidence/task185-bounded32/artifacts';
const OUTPUT = 'output/local-replay-processing/death-event-segmented-lifecycle-evidence/integrity';
export const PILOT_IDS = ['replay_010', 'replay_011', 'replay_021', 'replay_036'];
export const BOUNDED_IDS = ['replay_001', 'replay_002', 'replay_003', 'replay_004', 'replay_009', ...Array.from({ length: 27 }, (_, index) => `replay_${String(index + 10).padStart(3, '0')}`)];

function git(args, options = {}) { return execFileSync('git', args, { cwd: ROOT, encoding: options.encoding ?? 'utf8', maxBuffer: 32 * 1024 * 1024 }); }
function sha256(value) { return createHash('sha256').update(value).digest('hex'); }
async function json(relative) { return JSON.parse(await readFile(path.resolve(ROOT, relative), 'utf8')); }
async function writeJson(name, value) { const target = path.resolve(ROOT, OUTPUT, name); await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, `${JSON.stringify(value, null, 2)}\n`); }
function section(text, taskId) { const marker = `## Task ${taskId}`; const start = text.indexOf(marker); if (start < 0) return ''; const next = text.indexOf('\n## Task ', start + marker.length); return text.slice(start, next < 0 ? text.length : next); }

export function exactTaskCommitChecks(index, completed187, projectState) {
    const entries = index.tasks ?? index;
    const task187 = entries.find(row => String(row.taskId) === '187');
    const owners = entries.filter(row => row.commitSha === TASK187_COMMIT).map(row => String(row.taskId));
    return {
        task187EntryExists: Boolean(task187),
        task187CommitExact: task187?.commitSha === TASK187_COMMIT,
        task187OnlyOwner: owners.length === 1 && owners[0] === '187',
        completedFileExact: /^Commit: f5825e4ffc537e5986de699fd34d1a3df1a91b0f$/mu.test(completed187),
        projectSectionExact: section(projectState, '187').includes(`Task 187 commit: \`${TASK187_COMMIT}\`.`)
    };
}

async function walkFiles(directory) {
    const rows = [];
    for (const entry of await readdir(directory, { withFileTypes: true })) {
        const full = path.join(directory, entry.name);
        if (entry.isDirectory()) rows.push(...await walkFiles(full)); else if (entry.isFile()) rows.push(full);
    }
    return rows;
}

export async function durableTask185ArtifactAudit() {
    const historicalPaths = git(['ls-tree', '-r', '--name-only', TASK185_COMMIT, '--', TASK185_ROOT]).trim().split(/\r?\n/u).filter(Boolean).sort();
    const diskRoot = path.resolve(ROOT, TASK185_ROOT);
    const currentPaths = (await walkFiles(diskRoot)).map(full => path.relative(ROOT, full).replaceAll('\\', '/')).sort();
    const expectedShape = historicalPaths.length === 32 && historicalPaths.every((value, index) => value === `${TASK185_ROOT}/${BOUNDED_IDS[index]}/death_event_directional_cycle_evidence.json`);
    const sameSet = historicalPaths.length === currentPaths.length && historicalPaths.every((value, index) => value === currentPaths[index]);
    const rows = [];
    for (const artifactPath of historicalPaths) {
        const historical = git(['show', `${TASK185_COMMIT}:${artifactPath}`], { encoding: 'buffer' });
        const current = await readFile(path.resolve(ROOT, artifactPath));
        rows.push({ artifactPath, historicalBlobSha: git(['rev-parse', `${TASK185_COMMIT}:${artifactPath}`]).trim(), historicalContentSha256: sha256(historical), currentContentSha256: sha256(current), identical: Buffer.compare(historical, current) === 0 });
    }
    const checks = { exactly32ExpectedPaths: historicalPaths.length === 32, exactExpectedPathShape: expectedShape, everyPathPresent: sameSet, zeroNewOrRemovedFiles: sameSet, everyContentHashIdentical: rows.every(row => row.identical) };
    return { schemaVersion: 1, status: Object.values(checks).every(Boolean) ? 'passed' : 'failed', sourceCommit: TASK185_COMMIT, checks, artifactCount: rows.length, rows };
}

export function validateExactManifest(manifest) {
    const expected = manifest.runKind === 'task188-pilot' ? PILOT_IDS : manifest.runKind === 'task188-bounded32' ? BOUNDED_IDS : null;
    const expectedIdentity = manifest.runKind === 'task188-pilot' ? 'task188_segmented_lifecycle_pilot_v1' : manifest.runKind === 'task188-bounded32' ? 'task188_segmented_lifecycle_bounded32_v1' : null;
    if (manifest.version !== 1 || !expected || manifest.manifestIdentity !== expectedIdentity || !Array.isArray(manifest.replayIds)) throw new Error('invalid Task 188 manifest identity');
    if (manifest.replayIds.length !== expected.length || manifest.replayIds.some((id, index) => id !== expected[index]) || new Set(manifest.replayIds).size !== expected.length) throw new Error('Task 188 manifest must contain the exact authorized replay set in exact order');
    return true;
}

export function validateExactPilotGate(gate) {
    const checks = {
        gate: gate.gate === 'death_segmented_lifecycle_pilot_ready',
        status: gate.status === 'passed', manifestIdentity: gate.manifestIdentity === 'task188_segmented_lifecycle_pilot_v1',
        replayIds: JSON.stringify(gate.replayIds) === JSON.stringify(PILOT_IDS), parserCompletion: gate.parserCompleted === 4 && gate.parserExpected === 4,
        anchors: gate.anchorCount === 341, controls: gate.controlBridgeCount === 341 && gate.controlBridgeExpected === 341,
        rows: gate.evidenceRowCount === 341, mapping: gate.participantMappingFailures === 0,
        task183Bridge: gate.task183BridgeFailures === 0, task186Bridge: gate.task186ControlBridgeFailures === 0,
        reuse: gate.sourceReuseCount === 0, protection: gate.protectedReplayAccessCount === 0,
        schema: gate.schemaFailures === 0, policy: gate.outputPolicyFailures === 0,
        finalFacts: gate.finalFacts === 0, attribution: gate.attribution === 0,
        size: gate.sizeGatePassed === true, atomic: gate.allOrNothingGatePassed === true
    };
    if (!Object.values(checks).every(Boolean)) throw new Error(`Task 188 pilot precondition failed: ${Object.entries(checks).filter(([, value]) => !value).map(([key]) => key).join(',')}`);
    return checks;
}

export function validateSourceProvenance(replayId, sources) {
    const classChecks = [
        [sources.identity, 'participant_identity', 'task_180'], [sources.transitions, 'life_state_transition_candidates', 'task_182'],
        [sources.candidates, 'death_event_candidates', 'task_183'], [sources.controls, 'death_event_directional_discrimination_evidence', 'task_186']
    ];
    const failures = [];
    for (const [artifact, artifactClass, generatedAt] of classChecks) if (artifact?.replayId !== replayId || artifact?.artifactClass !== artifactClass || artifact?.generatedAt !== generatedAt) failures.push(`${artifactClass}:provenance`);
    const controlsByKey = new Map((sources.controls?.evidenceRows ?? []).map(row => [row.eventCandidateKey, row]));
    for (const candidate of sources.candidates?.candidates ?? []) {
        const control = controlsByKey.get(candidate.eventCandidateKey);
        const exact = control && control.eventCandidateKey === candidate.eventCandidateKey && control.sourceTransitionKey === candidate.sourceTransitionKey && control.participantKey === candidate.participantKey && control.heroRefKey === candidate.heroRefKey && control.teamRefKey === candidate.teamRefKey && control.anchorNormalizedElapsedSecond === candidate.normalizedElapsedSecond && control.controlSelectionStatus === 'selected' && Number.isInteger(control.controlNormalizedElapsedSecond) && control.truthStatus === 'unconfirmed_candidate' && control.finalFact === false;
        if (!exact) failures.push(`${candidate.eventCandidateKey}:control-row`);
    }
    if ((sources.controls?.evidenceRows ?? []).length !== (sources.candidates?.candidates ?? []).length) failures.push('control-row-count');
    return { status: failures.length ? 'failed' : 'passed', failures };
}

export async function runIntegrityAudit() {
    const [index, completed187, projectState, historical] = await Promise.all([
        json('data/task-contribution-index.json'), readFile(path.resolve(ROOT, 'tasks/completed/187-death-event-semantic-sequence-evidence.md'), 'utf8'),
        readFile(path.resolve(ROOT, 'docs/PROJECT_STATE.md'), 'utf8'), durableTask185ArtifactAudit()
    ]);
    const commitChecks = exactTaskCommitChecks(index, completed187, projectState);
    const commitAudit = { schemaVersion: 1, status: Object.values(commitChecks).every(Boolean) ? 'passed' : 'failed', expectedCommit: TASK187_COMMIT, checks: commitChecks };
    const passed = commitAudit.status === 'passed' && historical.status === 'passed';
    const gate = { schemaVersion: 1, gate: passed ? 'task187_sequence_integrity_repaired' : 'task187_sequence_integrity_blocked', status: passed ? 'passed' : 'failed', replayPathResolved: false, playerConstructed: false, parserRun: false };
    await writeJson('task187-exact-commit-audit.json', commitAudit); await writeJson('task185-durable-historical-artifact-integrity-audit.json', historical); await writeJson('task187-sequence-integrity-gate.json', gate);
    return gate;
}

async function main() { const gate = await runIntegrityAudit(); process.stdout.write(`${JSON.stringify(gate)}\n`); if (gate.status !== 'passed') process.exitCode = 1; }
if (pathToFileURL(process.argv[1] ?? '').href === import.meta.url) main().catch(error => { process.stderr.write(`${error.stack ?? error}\n`); process.exitCode = 1; });
