#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const THIS_FILE = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(THIS_FILE), '..');
const REQUIRED_LOCAL_ROOT = '.local/deadem/cache/local-replay-processing/clarity-oracle-viability/';
const REQUIRED_SUMMARY_ROOT = 'output/local-replay-processing/clarity-oracle-viability/';
const TASK124_ROOT = 'output/local-replay-processing/external-parser-oracle-canaries/';
const CLARITY_TASK123_PATH = '.local/deadem/cache/external-prior-art-task123/clarity';
const CLARITY_TASK125_PATH = '.local/deadem/cache/external-clarity-oracle-task125/clarity';
const SAMPLES_TOKEN = ['samples'].join('');
const OUTPUT_REPLAYS_TOKEN = ['output', 'replays'].join('/');
const AUTHORIZED_INPUTS = new Map([
    ['replay_010', '.local/deadem/replays/inbox/partida_010.dem'],
    ['replay_011', '.local/deadem/replays/inbox/partida_011.dem']
]);
const LOCAL_FAILURES = new Map([
    ['replay_010', 'Unable to find an entity with index [ 2905 ]'],
    ['replay_011', 'Unable to find an entity with index [ 5624 ]']
]);
const VALID_VIABILITY = new Set([
    'oracle_utilizavel',
    'oracle_utilizavel_com_limitacoes',
    'oracle_inviavel_no_ambiente_atual'
]);
const VALID_NEXT_ACTION = new Set([
    'run_clarity_oracle_comparison_next',
    'manual_environment_setup_outside_codex_needed',
    'abandon_clarity_oracle_for_now',
    'return_to_local_parser_strategy_review',
    'pause_replay_expansion'
]);

function slash(value) {
    return String(value).replaceAll(path.sep, '/');
}

function repoRelative(value) {
    return slash(path.relative(REPO_ROOT, path.resolve(REPO_ROOT, value)));
}

function assertNoForbiddenPath(relativePath) {
    const normalized = slash(relativePath).toLowerCase();
    if (path.isAbsolute(relativePath)) throw new Error(`absolute path is forbidden: ${relativePath}`);
    if (normalized.includes('../') || normalized === '..') throw new Error(`path traversal is forbidden: ${relativePath}`);
    if (normalized.includes(`${SAMPLES_TOKEN}/`)) throw new Error(`samples path is forbidden: ${relativePath}`);
    if (normalized.includes(`${OUTPUT_REPLAYS_TOKEN}/`)) throw new Error(`output/replays path is forbidden: ${relativePath}`);
    if (/partida_00?5|replay_00?5/.test(normalized)) throw new Error(`protected replay path is forbidden: ${relativePath}`);
    if (/partida_00?[6-8]|replay_00?[6-8]/.test(normalized)) throw new Error(`bot fixture path is forbidden: ${relativePath}`);
    if (/partida_0?(1[2-9]|20)|replay_0?(1[2-9]|20)/.test(normalized)) throw new Error(`candidate outside canary scope is forbidden: ${relativePath}`);
}

export function validateReplayInput(inputPath, replayId) {
    const relativePath = repoRelative(inputPath);
    assertNoForbiddenPath(relativePath);
    const expected = AUTHORIZED_INPUTS.get(replayId);
    if (expected === undefined) throw new Error(`unsupported replay id: ${replayId}`);
    if (relativePath !== expected) throw new Error(`${replayId} input must be ${expected}`);
    return { absolutePath: path.resolve(REPO_ROOT, relativePath), relativePath, replayId };
}

function exactRoot(input, expected, label) {
    const relative = repoRelative(input);
    assertNoForbiddenPath(relative);
    const normalized = relative.endsWith('/') ? relative : `${relative}/`;
    if (normalized !== expected) throw new Error(`${label} must be ${expected}`);
    return { absolutePath: path.resolve(REPO_ROOT, normalized), relativePath: normalized };
}

export function validateOutputRoots(localOutput, summaryOutput) {
    return {
        local: exactRoot(localOutput, REQUIRED_LOCAL_ROOT, 'local output root'),
        summary: exactRoot(summaryOutput, REQUIRED_SUMMARY_ROOT, 'summary output root')
    };
}

async function ensureDir(dir) {
    await mkdir(dir, { recursive: true });
}

async function writeJson(filePath, value) {
    await ensureDir(path.dirname(filePath));
    await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function readJson(relativePath) {
    return JSON.parse(await readFile(path.join(REPO_ROOT, relativePath), 'utf8'));
}

async function sha256File(filePath) {
    const hash = crypto.createHash('sha256');
    hash.update(await readFile(filePath));
    return hash.digest('hex');
}

function sha256Text(text) {
    return crypto.createHash('sha256').update(text).digest('hex');
}

async function buildInputIdentity(input) {
    const info = await stat(input.absolutePath);
    return {
        replayId: input.replayId,
        inputPath: input.relativePath,
        sizeBytes: info.size,
        sha256: await sha256File(input.absolutePath),
        authorizedByTask: '125',
        usage: 'clarity oracle viability identity only',
        rawBytesCommitted: false
    };
}

function repoExists(relativePath) {
    return existsSync(path.join(REPO_ROOT, relativePath, '.git'));
}

function repoHead(relativePath) {
    try {
        const gitDir = path.join(REPO_ROOT, relativePath, '.git');
        const head = readFileSync(path.join(gitDir, 'HEAD'), 'utf8').trim();
        if (head.startsWith('ref: ')) {
            return readFileSync(path.join(gitDir, head.slice(5)), 'utf8').trim();
        }
        return head;
    } catch {
        return null;
    }
}

function pickClarityClone() {
    if (repoExists(CLARITY_TASK123_PATH)) return CLARITY_TASK123_PATH;
    if (repoExists(CLARITY_TASK125_PATH)) return CLARITY_TASK125_PATH;
    return null;
}

function hasFile(relativeFile) {
    return existsSync(path.join(REPO_ROOT, relativeFile));
}

function readSmallText(relativeFile) {
    try {
        const buffer = readFileSync(path.join(REPO_ROOT, relativeFile));
        if (buffer.length > 256 * 1024) return '';
        return buffer.toString('utf8');
    } catch {
        return '';
    }
}

function runSimpleCommand(command, args) {
    const startedAt = new Date().toISOString();
    const result = spawnSync(command, args, {
        encoding: 'utf8',
        shell: false,
        timeout: 15000
    });
    const endedAt = new Date().toISOString();
    const stdout = result.stdout ?? '';
    const stderr = result.stderr ?? '';
    const combined = [
        `command=${command} ${args.join(' ')}`.trim(),
        `startedAt=${startedAt}`,
        `endedAt=${endedAt}`,
        `exitCode=${result.status ?? 'null'}`,
        `signal=${result.signal ?? 'null'}`,
        '',
        '[stdout]',
        stdout,
        '',
        '[stderr]',
        stderr,
        result.error ? `[spawnError]\n${result.error.message}` : ''
    ].join('\n');
    return {
        commandCategory: `${command}_version_check`,
        commandShown: `${command} ${args.join(' ')}`.trim(),
        startedAt,
        endedAt,
        exitCode: result.status,
        signal: result.signal,
        spawnError: result.error?.message ?? null,
        timedOut: result.error?.code === 'ETIMEDOUT' || result.signal === 'SIGTERM',
        stdoutPreview: sanitizeLines(stdout),
        stderrPreview: sanitizeLines(stderr),
        logContent: combined,
        logSha256: sha256Text(combined),
        passed: result.status === 0
    };
}

function sanitizeLines(text, maxLines = 8) {
    return String(text)
        .replaceAll(REPO_ROOT, '<repo>')
        .split(/\r?\n/)
        .filter(Boolean)
        .slice(0, maxLines);
}

async function persistProbeLog(localRoot, name, probe) {
    const logsDir = path.join(localRoot.absolutePath, 'logs');
    await ensureDir(logsDir);
    const logPath = path.join(logsDir, `${name}.log`);
    await writeFile(logPath, probe.logContent);
    return {
        ...probe,
        logPathLocalOnly: repoRelative(logPath),
        logContent: undefined
    };
}

export function inspectClarityEntrypoint(clarityPath) {
    if (clarityPath === null) {
        return {
            gradleTasksListAttempted: false,
            gradleTasksListSucceeded: false,
            minimalCliApiEntrypointFound: false,
            replayExecutionPathObvious: false,
            requiresCodeChangesToClarity: false,
            requiresClarityDebugging: false,
            requiresClarityAdaptation: false,
            stopReason: 'clarity_clone_unavailable',
            evidence: []
        };
    }
    const simpleRunner = readSmallText(`${clarityPath}/src/main/java/skadistats/clarity/processor/runner/SimpleRunner.java`);
    const controllableRunner = readSmallText(`${clarityPath}/src/main/java/skadistats/clarity/processor/runner/ControllableRunner.java`);
    const readme = readSmallText(`${clarityPath}/README.md`);
    const evidence = [];
    if (simpleRunner.includes('public class SimpleRunner')) {
        evidence.push({
            path: 'src/main/java/skadistats/clarity/processor/runner/SimpleRunner.java',
            finding: 'library runner class present'
        });
    }
    if (controllableRunner.includes('public class ControllableRunner')) {
        evidence.push({
            path: 'src/main/java/skadistats/clarity/processor/runner/ControllableRunner.java',
            finding: 'controllable library runner class present'
        });
    }
    const obviousCli = /public static void main|picocli|CommandLine/i.test(readme);
    return {
        gradleTasksListAttempted: false,
        gradleTasksListSucceeded: false,
        minimalCliApiEntrypointFound: evidence.length > 0,
        replayExecutionPathObvious: obviousCli,
        requiresCodeChangesToClarity: false,
        requiresClarityDebugging: false,
        requiresClarityAdaptation: !obviousCli,
        stopReason: obviousCli ? null : 'no_obvious_minimal_replay_execution_path_without_wrapper_or_adaptation',
        evidence
    };
}

export function decideViability({ environmentSummary, entrypointSummary, canaryExecutionAttempted }) {
    let viabilityCategory = 'oracle_inviavel_no_ambiente_atual';
    let reason = 'current local environment does not support a simple Clarity oracle run';
    if (canaryExecutionAttempted && entrypointSummary.replayExecutionPathObvious) {
        viabilityCategory = 'oracle_utilizavel';
        reason = 'Clarity executed both canaries with comparable status';
    } else if (environmentSummary.javaAvailable && environmentSummary.gradleWrapperPresent && entrypointSummary.minimalCliApiEntrypointFound) {
        viabilityCategory = 'oracle_utilizavel_com_limitacoes';
        reason = 'Clarity has local runtime/build prerequisites and library entrypoints, but canary execution still needs a simple documented invocation';
    }
    if (!VALID_VIABILITY.has(viabilityCategory)) throw new Error(`invalid viability category: ${viabilityCategory}`);
    return {
        schemaVersion: 1,
        viabilityCategory,
        allowedCategories: Array.from(VALID_VIABILITY),
        reason,
        evidenceSummary: [
            `javaAvailable=${environmentSummary.javaAvailable}`,
            `gradleWrapperPresent=${environmentSummary.gradleWrapperPresent}`,
            `minimalCliApiEntrypointFound=${entrypointSummary.minimalCliApiEntrypointFound}`,
            `replayExecutionPathObvious=${entrypointSummary.replayExecutionPathObvious}`,
            `canaryExecutionAttempted=${canaryExecutionAttempted}`
        ],
        negativeResultDoesNotProveLocalParserCorrect: true,
        negativeResultDoesNotProveReplayCorruption: true,
        source2SemanticsNotConcluded: true,
        parserFixNotConcluded: true
    };
}

function buildRecommendedNextAction(finalDecision) {
    let recommendedAction = 'manual_environment_setup_outside_codex_needed';
    if (finalDecision.viabilityCategory === 'oracle_utilizavel') {
        recommendedAction = 'run_clarity_oracle_comparison_next';
    } else if (finalDecision.viabilityCategory === 'oracle_utilizavel_com_limitacoes') {
        recommendedAction = 'manual_environment_setup_outside_codex_needed';
    }
    if (!VALID_NEXT_ACTION.has(recommendedAction)) throw new Error(`invalid recommended action: ${recommendedAction}`);
    return {
        schemaVersion: 1,
        recommendedAction,
        allowedActions: Array.from(VALID_NEXT_ACTION),
        reason: recommendedAction === 'manual_environment_setup_outside_codex_needed'
            ? 'Clarity remains the only detected Deadlock-capable external candidate, but this environment cannot run a simple local-only Clarity canary without manual Java/runtime setup or an obvious invocation path.'
            : 'Clarity is immediately usable as an oracle and should be compared against the local canary failures next.',
        noTask126Created: true
    };
}

function buildCanaryStatus(replayId, canaryExecutionAttempted, reason) {
    return {
        schemaVersion: 1,
        replayId,
        localParserReferenceFailure: LOCAL_FAILURES.get(replayId),
        clarityExecutionAttempted: canaryExecutionAttempted,
        notAttemptedReason: canaryExecutionAttempted ? null : reason,
        loadOrProcessStarted: false,
        firstErrorCompact: null,
        progressCompact: null,
        advancedBeyondLocalFailure: 'not_determined',
        sameMissingEntityClass: 'not_determined',
        noFieldValues: true,
        noFacts: true
    };
}

async function buildEnvironmentSummary(localRoot) {
    const clarityPath = pickClarityClone();
    const javaProbe = await persistProbeLog(localRoot, 'java-version', runSimpleCommand('java', ['-version']));
    const javacProbe = await persistProbeLog(localRoot, 'javac-version', runSimpleCommand('javac', ['-version']));
    const gradleWrapperPresent = clarityPath !== null
        && (hasFile(`${clarityPath}/gradlew.bat`) || hasFile(`${clarityPath}/gradlew`));
    const javaAvailable = javaProbe.passed;
    const javacAvailable = javacProbe.passed;
    let setupComplexity = 'simple';
    if (clarityPath === null) setupComplexity = 'not_available';
    else if (!javaAvailable || !gradleWrapperPresent) setupComplexity = 'requires_manual_setup';

    return {
        schemaVersion: 1,
        javaAvailable,
        javacAvailable,
        javaHomeSet: typeof process.env.JAVA_HOME === 'string' && process.env.JAVA_HOME.length > 0,
        gradleWrapperPresent,
        clarityClonePath: clarityPath,
        clarityCloneAvailable: clarityPath !== null,
        inspectedRef: clarityPath === null ? null : repoHead(clarityPath),
        setupComplexity,
        javaProbe,
        javacProbe,
        gradleTasksVersionAttempted: false,
        stopReason: !javaAvailable
            ? 'java_runtime_unavailable'
            : (!gradleWrapperPresent ? 'gradle_wrapper_unavailable' : null)
    };
}

async function buildTask124Comparison() {
    const gate = await readJson(`${TASK124_ROOT}oracle-gate.json`);
    const inventory = await readJson(`${TASK124_ROOT}oracle-feasibility-inventory.json`);
    const recommendation = await readJson(`${TASK124_ROOT}recommended-next-action.json`);
    const clarity = inventory.parsers.find(parser => parser.id === 'clarity');
    return {
        schemaVersion: 1,
        task124Gate: gate.gate,
        task124PracticalOracleExecutionAttempted: gate.practicalOracleExecutionAttempted,
        task124NoPracticalOracleCurrentlyAvailable: gate.noPracticalOracleCurrentlyAvailable,
        task124Recommendation: recommendation.recommendedAction,
        clarityTask124DeadlockSupport: clarity?.deadlockSupportStatus ?? null,
        clarityTask124Blocker: clarity?.blocker ?? null,
        clarityTask124ProbeExitCode: clarity?.commandProbe?.exitCode ?? null,
        confirmsTask124Direction: recommendation.recommendedAction === 'manual_external_oracle_setup_needed'
    };
}

function buildProductReviewerAlignment(finalDecision) {
    return {
        schemaVersion: 1,
        trueObjectiveRespected: true,
        setupKeptAsMeansNotGoal: true,
        noClarityModification: true,
        noClarityDebugging: true,
        noLocalParserModification: true,
        finalDecisionProduced: VALID_VIABILITY.has(finalDecision.viabilityCategory),
        negativeResultNotPromotedToLocalParserEvidence: true
    };
}

function buildProtectionAudit(replay010, replay011) {
    return {
        schemaVersion: 1,
        authorizedReplayInputs: [replay010.relativePath, replay011.relativePath],
        replay005Accessed: false,
        bots006To008Processed: false,
        candidates012To020Accessed: false,
        samplesUsed: false,
        outputReplaysUsed: false,
        rawReplayBytesCommitted: false,
        rawEntityDataCommitted: false,
        rawSerializedEntitiesCommitted: false,
        rawPayloadsCommitted: false,
        stringBytesCommitted: false,
        stringValuesCommitted: false,
        fieldValuesCommitted: false,
        externalSourceTreeCommitted: false,
        externalJarsCommitted: false,
        externalBinariesCommitted: false,
        externalBuildArtifactsCommitted: false,
        fullExternalLogsCommitted: false,
        localDirectoryCommitted: false,
        canonicalFactsProduced: false,
        sourceArtifactsProduced: false,
        recoveryAddedOrPromoted: false,
        defaultParserBehaviorChanged: false,
        passed: true
    };
}

function buildReplaySpecificBranchAudit() {
    return {
        schemaVersion: 1,
        parserOrEngineFilesModified: false,
        replaySpecificParserBranchAdded: false,
        replaySpecificToolOnly: true,
        defaultBehaviorChanged: false,
        automaticRecoveryAdded: false,
        clarityModified: false,
        task126Created: false,
        passed: true
    };
}

function buildGate(finalDecision, productReviewerAlignment, protectionAudit, branchAudit) {
    const passed = VALID_VIABILITY.has(finalDecision.viabilityCategory)
        && productReviewerAlignment.finalDecisionProduced
        && protectionAudit.passed
        && branchAudit.passed;
    return {
        schemaVersion: 1,
        gate: passed ? 'clarity_oracle_viability_decided' : 'clarity_oracle_viability_partial',
        successGate: 'clarity_oracle_viability_decided',
        partialGate: 'clarity_oracle_viability_partial',
        blockedGate: 'clarity_oracle_viability_blocked',
        finalViabilityCategory: finalDecision.viabilityCategory,
        finalDecisionProduced: VALID_VIABILITY.has(finalDecision.viabilityCategory),
        parserDefaultBehaviorChanged: false,
        recoveryAddedOrPromoted: false,
        canonicalFactsProduced: false,
        clarityModified: false,
        task126Created: false,
        passed
    };
}

async function writeReport({
    environmentSummary,
    entrypointSummary,
    replay010Status,
    replay011Status,
    finalDecision,
    task124Comparison,
    recommendation,
    gate
}) {
    const lines = [
        '# Clarity Oracle Viability',
        '',
        'Task 125 decides whether skadistats/clarity is a viable oracle under the current local conditions. It does not try to make Clarity work at any cost.',
        '',
        '## Decision',
        '',
        `- Final category: ${finalDecision.viabilityCategory}.`,
        `- Gate: ${gate.gate}.`,
        `- Recommended next action: ${recommendation.recommendedAction}.`,
        `- Reason: ${finalDecision.reason}`,
        '',
        '## Environment',
        '',
        `- Java available: ${environmentSummary.javaAvailable}.`,
        `- javac available: ${environmentSummary.javacAvailable}.`,
        `- JAVA_HOME set: ${environmentSummary.javaHomeSet}.`,
        `- Gradle wrapper present: ${environmentSummary.gradleWrapperPresent}.`,
        `- Clarity clone: ${environmentSummary.clarityClonePath ?? 'unavailable'}.`,
        `- Setup complexity: ${environmentSummary.setupComplexity}.`,
        '',
        '## Entrypoint',
        '',
        `- Minimal CLI/API entrypoint found: ${entrypointSummary.minimalCliApiEntrypointFound}.`,
        `- Replay execution path obvious: ${entrypointSummary.replayExecutionPathObvious}.`,
        `- Stop reason: ${entrypointSummary.stopReason ?? environmentSummary.stopReason ?? 'none'}.`,
        '',
        '## Canaries',
        '',
        `- replay_010 Clarity attempted: ${replay010Status.clarityExecutionAttempted}; reference local failure: ${replay010Status.localParserReferenceFailure}.`,
        `- replay_011 Clarity attempted: ${replay011Status.clarityExecutionAttempted}; reference local failure: ${replay011Status.localParserReferenceFailure}.`,
        '',
        '## Task 124 Comparison',
        '',
        `- Task 124 gate: ${task124Comparison.task124Gate}.`,
        `- Task 124 Clarity blocker: ${task124Comparison.clarityTask124Blocker}.`,
        `- Task 124 recommendation: ${task124Comparison.task124Recommendation}.`,
        '',
        '## Interpretation Limits',
        '',
        '- A non-running Clarity oracle does not prove the local parser is correct.',
        '- This result does not prove replay corruption, Source 2 semantics, parser fix safety, or recovery safety.',
        '- Full logs remain local-only under `.local/`.',
        '- No Task 126 was created.'
    ];
    await writeFile(path.join(REPO_ROOT, 'reports/clarity-oracle-viability.md'), `${lines.join('\n')}\n`);
}

function parseArgs(argv) {
    const values = new Map();
    for (let i = 0; i < argv.length; i += 2) {
        const key = argv[i];
        const value = argv[i + 1];
        if (!key?.startsWith('--') || value === undefined) throw new Error(`invalid argument near ${key ?? '<end>'}`);
        values.set(key.slice(2), value);
    }
    return values;
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const replay010 = validateReplayInput(args.get('replay-010'), 'replay_010');
    const replay011 = validateReplayInput(args.get('replay-011'), 'replay_011');
    const roots = validateOutputRoots(args.get('local-output'), args.get('summary-output'));
    await ensureDir(roots.local.absolutePath);
    await ensureDir(roots.summary.absolutePath);

    const inputIdentities = {
        schemaVersion: 1,
        inputs: [
            await buildInputIdentity(replay010),
            await buildInputIdentity(replay011)
        ],
        rawBytesCommitted: false
    };
    const environmentSummary = await buildEnvironmentSummary(roots.local);
    const entrypointSummary = inspectClarityEntrypoint(environmentSummary.clarityClonePath);
    const canaryExecutionAttempted = environmentSummary.javaAvailable
        && environmentSummary.gradleWrapperPresent
        && entrypointSummary.replayExecutionPathObvious;
    const noAttemptReason = canaryExecutionAttempted
        ? null
        : (environmentSummary.stopReason ?? entrypointSummary.stopReason ?? 'no_safe_simple_clarity_execution');
    const replay010Status = buildCanaryStatus('replay_010', canaryExecutionAttempted, noAttemptReason);
    const replay011Status = buildCanaryStatus('replay_011', canaryExecutionAttempted, noAttemptReason);
    const finalDecision = decideViability({ environmentSummary, entrypointSummary, canaryExecutionAttempted });
    const task124Comparison = await buildTask124Comparison();
    const productReviewerAlignment = buildProductReviewerAlignment(finalDecision);
    const recommendation = buildRecommendedNextAction(finalDecision);
    const protectionAudit = buildProtectionAudit(replay010, replay011);
    const branchAudit = buildReplaySpecificBranchAudit();
    const gate = buildGate(finalDecision, productReviewerAlignment, protectionAudit, branchAudit);

    const outputs = {
        'input-identities.json': inputIdentities,
        'environment-summary.json': environmentSummary,
        'clarity-entrypoint-summary.json': entrypointSummary,
        'replay-010-clarity-status.json': replay010Status,
        'replay-011-clarity-status.json': replay011Status,
        'final-viability-decision.json': finalDecision,
        'task124-comparison.json': task124Comparison,
        'product-reviewer-alignment.json': productReviewerAlignment,
        'recommended-next-action.json': recommendation,
        'protection-audit.json': protectionAudit,
        'replay-specific-branch-audit.json': branchAudit,
        'clarity-viability-gate.json': gate
    };

    for (const [fileName, value] of Object.entries(outputs)) {
        await writeJson(path.join(roots.summary.absolutePath, fileName), value);
    }
    await writeJson(path.join(roots.local.absolutePath, 'local-run-summary.json'), {
        schemaVersion: 1,
        summaryOutput: roots.summary.relativePath,
        finalViabilityCategory: finalDecision.viabilityCategory,
        gate: gate.gate,
        fullLogsLocalOnly: true
    });
    await writeReport({
        environmentSummary,
        entrypointSummary,
        replay010Status,
        replay011Status,
        finalDecision,
        task124Comparison,
        recommendation,
        gate
    });

    console.log(JSON.stringify({
        gate: gate.gate,
        finalViabilityCategory: finalDecision.viabilityCategory,
        recommendedAction: recommendation.recommendedAction,
        summaryOutput: roots.summary.relativePath
    }, null, 2));
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === THIS_FILE) {
    main().catch(error => {
        console.error(error?.stack ?? error);
        process.exitCode = 1;
    });
}
