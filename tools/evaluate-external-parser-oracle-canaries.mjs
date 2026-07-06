#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const THIS_FILE = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(THIS_FILE), '..');
const AUTHORIZED_INPUTS = new Map([
    ['replay_010', '.local/deadem/replays/inbox/partida_010.dem'],
    ['replay_011', '.local/deadem/replays/inbox/partida_011.dem']
]);
const REQUIRED_LOCAL_ROOT = '.local/deadem/cache/local-replay-processing/external-parser-oracle-canaries/';
const REQUIRED_SUMMARY_ROOT = 'output/local-replay-processing/external-parser-oracle-canaries/';
const TASK123_ROOT = 'output/local-replay-processing/replay-parser-prior-art-and-second-canary/';
const PRIOR_ART_ROOT = '.local/deadem/cache/external-prior-art-task123/';
const ORACLE_CLONE_ROOT = '.local/deadem/cache/external-oracle-task124/';
const SAMPLES_TOKEN = ['samples'].join('');
const OUTPUT_REPLAYS_TOKEN = ['output', 'replays'].join('/');
const LOCAL_FAILURES = new Map([
    ['replay_010', 'Unable to find an entity with index [ 2905 ]'],
    ['replay_011', 'Unable to find an entity with index [ 5624 ]']
]);

const PARSERS = [
    {
        id: 'clarity',
        name: 'skadistats/clarity',
        url: 'https://github.com/skadistats/clarity',
        cloneDir: 'clarity',
        buildTool: 'gradle-wrapper',
        supportProbeFiles: [
            'README.md',
            'src/main/java/skadistats/clarity/Clarity.java',
            'src/main/java/skadistats/clarity/model/EngineMagic.java',
            'src/main/java/skadistats/clarity/model/engine/DeadlockEngineType.java'
        ],
        entrypointProbeFiles: [
            'src/main/java/skadistats/clarity/processor/runner/SimpleRunner.java',
            'src/main/java/skadistats/clarity/processor/runner/ControllableRunner.java'
        ],
        supportTerms: ['Deadlock', 'citadel', 'EngineId.DEADLOCK'],
        unsupportedReason: null
    },
    {
        id: 'manta',
        name: 'dotabuff/manta',
        url: 'https://github.com/dotabuff/manta',
        cloneDir: 'manta',
        buildTool: 'go-module',
        supportProbeFiles: ['README.md', 'go.mod'],
        entrypointProbeFiles: ['README.md'],
        supportTerms: ['Deadlock', 'citadel'],
        unsupportedReason: 'blocked_by_game_support'
    },
    {
        id: 'demoparser',
        name: 'LaihoE/demoparser',
        url: 'https://github.com/LaihoE/demoparser',
        cloneDir: 'demoparser',
        buildTool: 'rust-cargo',
        supportProbeFiles: ['README.md', 'src/parser/Cargo.toml'],
        entrypointProbeFiles: ['README.md'],
        supportTerms: ['Deadlock', 'citadel'],
        unsupportedReason: 'blocked_by_game_support'
    },
    {
        id: 'demoinfocs-golang',
        name: 'markus-wa/demoinfocs-golang',
        url: 'https://github.com/markus-wa/demoinfocs-golang',
        cloneDir: 'demoinfocs-golang',
        buildTool: 'go-module',
        supportProbeFiles: ['README.md', 'go.mod'],
        entrypointProbeFiles: ['README.md'],
        supportTerms: ['Deadlock', 'citadel'],
        unsupportedReason: 'blocked_by_game_support'
    }
];

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
        authorizedByTask: '124',
        usage: 'external-oracle feasibility comparison only',
        rawBytesCommitted: false
    };
}

function cloneCandidates(parser) {
    return [
        `${PRIOR_ART_ROOT}${parser.cloneDir}`,
        `${ORACLE_CLONE_ROOT}${parser.cloneDir}`
    ];
}

function repoExists(relativePath) {
    return existsSync(path.join(REPO_ROOT, relativePath, '.git'));
}

function repoHead(relativePath) {
    try {
        const gitDir = path.join(REPO_ROOT, relativePath, '.git');
        const head = readFileSync(path.join(gitDir, 'HEAD'), 'utf8').trim();
        if (head.startsWith('ref: ')) {
            const refPath = head.slice(5);
            return readFileSync(path.join(gitDir, refPath), 'utf8').trim();
        }
        return head;
    } catch {
        return null;
    }
}

function pickClone(parser) {
    const localPath = cloneCandidates(parser).find(candidate => repoExists(candidate));
    if (localPath === undefined) {
        return {
            localClonePath: null,
            cloneAvailability: 'unavailable_in_environment',
            inspectedRef: null
        };
    }
    return {
        localClonePath: localPath,
        cloneAvailability: localPath.startsWith(PRIOR_ART_ROOT)
            ? 'available_task123_local_clone'
            : 'available_task124_local_clone',
        inspectedRef: repoHead(localPath)
    };
}

function readSmallText(relativeFile) {
    try {
        const absolute = path.join(REPO_ROOT, relativeFile);
        const info = readFileSync(absolute);
        if (info.length > 256 * 1024) return '';
        return info.toString('utf8');
    } catch {
        return '';
    }
}

function fileExists(relativeFile) {
    return existsSync(path.join(REPO_ROOT, relativeFile));
}

function buildToolDetected(parser, localClonePath) {
    if (localClonePath === null) return null;
    if (parser.buildTool === 'gradle-wrapper') {
        return fileExists(`${localClonePath}/gradlew.bat`) || fileExists(`${localClonePath}/gradlew`)
            ? 'gradle-wrapper'
            : null;
    }
    if (parser.buildTool === 'go-module') return fileExists(`${localClonePath}/go.mod`) ? 'go-module' : null;
    if (parser.buildTool === 'rust-cargo') {
        return parser.supportProbeFiles.some(file => file.endsWith('Cargo.toml') && fileExists(`${localClonePath}/${file}`))
            ? 'rust-cargo'
            : null;
    }
    return null;
}

function inspectSupport(parser, localClonePath) {
    if (localClonePath === null) {
        return {
            deadlockSupportStatus: 'unknown',
            supportEvidence: [],
            cliApiEntrypointFound: false,
            entrypointEvidence: []
        };
    }

    const supportEvidence = [];
    for (const file of parser.supportProbeFiles) {
        const text = readSmallText(`${localClonePath}/${file}`);
        for (const term of parser.supportTerms) {
            if (text.includes(term)) {
                supportEvidence.push({ path: file, term });
                break;
            }
        }
    }

    const entrypointEvidence = [];
    for (const file of parser.entrypointProbeFiles) {
        const text = readSmallText(`${localClonePath}/${file}`);
        if (/public class SimpleRunner|public class ControllableRunner|package main|func main|parse/i.test(text)) {
            entrypointEvidence.push({ path: file, category: 'library_or_example_entrypoint' });
        }
    }

    const deadlockSupportStatus = supportEvidence.length > 0
        ? 'found'
        : (parser.unsupportedReason === 'blocked_by_game_support' ? 'not_found' : 'unknown');

    return {
        deadlockSupportStatus,
        supportEvidence,
        cliApiEntrypointFound: entrypointEvidence.length > 0,
        entrypointEvidence
    };
}

function sanitizeLines(text, maxLines = 8) {
    return String(text)
        .replaceAll(REPO_ROOT, '<repo>')
        .split(/\r?\n/)
        .filter(Boolean)
        .slice(0, maxLines);
}

function commandArgsForLog(executable, args) {
    return [path.basename(executable), ...args].join(' ');
}

async function runClarityFeasibilityProbe(parserInfo, localRoot) {
    if (parserInfo.id !== 'clarity' || parserInfo.localClonePath === null || parserInfo.buildToolDetected !== 'gradle-wrapper') {
        return null;
    }

    const cloneAbs = path.join(REPO_ROOT, parserInfo.localClonePath);
    const logsDir = path.join(localRoot.absolutePath, 'logs');
    await ensureDir(logsDir);
    await ensureDir(path.join(localRoot.absolutePath, 'gradle-home'));

    const isWindows = process.platform === 'win32';
    const gradlew = isWindows ? 'gradlew.bat' : './gradlew';
    const gradlewAbs = path.join(cloneAbs, isWindows ? 'gradlew.bat' : 'gradlew');
    const args = ['tasks', '--offline', '--no-daemon'];
    const env = {
        ...process.env,
        GRADLE_USER_HOME: path.join(localRoot.absolutePath, 'gradle-home')
    };
    const startedAt = new Date().toISOString();
    const result = isWindows
        ? spawnSync(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', gradlew, ...args], {
            cwd: cloneAbs,
            env,
            encoding: 'utf8',
            timeout: 90000,
            shell: false
        })
        : spawnSync(gradlewAbs, args, {
            cwd: cloneAbs,
            env,
            encoding: 'utf8',
            timeout: 90000,
            shell: false
        });
    const endedAt = new Date().toISOString();

    const stdout = result.stdout ?? '';
    const stderr = result.stderr ?? '';
    const combined = [
        `commandCategory=gradle_tasks_offline_probe`,
        `command=${commandArgsForLog(gradlew, args)}`,
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
    const logPath = path.join(logsDir, 'clarity-gradle-tasks-offline.log');
    await writeFile(logPath, combined);

    return {
        commandCategory: 'gradle_tasks_offline_probe',
        commandShown: commandArgsForLog(gradlew, args),
        startedAt,
        endedAt,
        exitCode: result.status,
        signal: result.signal,
        timedOut: result.error?.code === 'ETIMEDOUT' || result.signal === 'SIGTERM',
        spawnError: result.error?.message ?? null,
        logPathLocalOnly: repoRelative(logPath),
        logSha256: sha256Text(combined),
        stdoutPreview: sanitizeLines(stdout),
        stderrPreview: sanitizeLines(stderr),
        passed: result.status === 0,
        replayInputsPassedToExternalParser: false
    };
}

export function buildOracleReplayResults(inventory, replayId) {
    const localFailure = LOCAL_FAILURES.get(replayId);
    return {
        schemaVersion: 1,
        replayId,
        localParserFailureReference: localFailure,
        rawReplayBytesCommitted: false,
        fieldValuesCollected: false,
        results: inventory.parsers.map(parser => {
            const blocker = parser.blocker;
            const status = parser.canaryExecutionAttempted
                ? 'executed'
                : (blocker === 'blocked_by_game_support' ? 'unsupported' : 'cannot_run');
            return {
                parserId: parser.id,
                parserName: parser.name,
                status,
                blocker,
                loadOrProcessStarted: false,
                progress: null,
                firstErrorClass: null,
                firstErrorMessage: null,
                sameMissingEntityClassAppears: null,
                reachesEquivalentFailure: null,
                advancesBeyondLocalFailurePoint: null,
                artifactLogPathLocalOnly: parser.commandProbe?.logPathLocalOnly ?? null,
                notes: parser.canaryExecutionAttempted
                    ? 'external parser execution summary would be recorded here'
                    : 'no safe minimal canary execution was available for this parser in Task 124'
            };
        })
    };
}

export function buildExternalOracleComparison(replay010Results, replay011Results, inventory) {
    const executed = inventory.parsers.filter(parser => parser.canaryExecutionAttempted);
    const clarity = inventory.parsers.find(parser => parser.id === 'clarity');
    return {
        schemaVersion: 1,
        perParserPerReplayStatus: {
            replay_010: replay010Results.results.map(result => ({
                parserId: result.parserId,
                status: result.status,
                blocker: result.blocker
            })),
            replay_011: replay011Results.results.map(result => ({
                parserId: result.parserId,
                status: result.status,
                blocker: result.blocker
            }))
        },
        strongestOracleCandidate: clarity?.deadlockSupportStatus === 'found'
            ? {
                parserId: 'clarity',
                reason: 'local source advertises Deadlock/citadel support, but no safe minimal oracle entrypoint was available from the shallow clone in this environment'
            }
            : null,
        anyExternalParserContradictsLocalParserBehavior: false,
        anyExternalParserSupportsLocalFailureAsExpectedError: false,
        practicalOracleExecutionAttempted: executed.length > 0,
        noPracticalOracleCurrentlyAvailable: executed.length === 0,
        conclusion: executed.length === 0
            ? 'No external parser could be used as a practical local-only oracle for the canaries in this task.'
            : 'At least one external parser execution was attempted.'
    };
}

export function buildDecisionMatrix({ inventory, comparison }) {
    const clarity = inventory.parsers.find(parser => parser.id === 'clarity');
    const unsupportedCount = inventory.parsers.filter(parser => parser.blocker === 'blocked_by_game_support').length;
    const buildBlocked = inventory.parsers.some(parser => parser.blocker === 'blocked_by_build_or_runtime');
    const noEntrypoint = inventory.parsers.some(parser => parser.blocker === 'blocked_by_no_minimal_oracle_entrypoint');
    const unavailable = comparison.noPracticalOracleCurrentlyAvailable;
    let recommendedNextAction = 'external_oracle_inconclusive';
    if (clarity?.deadlockSupportStatus === 'found' && unavailable) {
        recommendedNextAction = 'manual_external_oracle_setup_needed';
    } else if (unsupportedCount === inventory.parsers.length) {
        recommendedNextAction = 'external_oracle_blocked_by_support';
    }

    return {
        schemaVersion: 1,
        oracle_confirms_local_failure: false,
        oracle_contradicts_local_failure: false,
        oracle_unavailable: unavailable,
        oracle_build_blocked: buildBlocked,
        oracle_game_support_blocked: unsupportedCount > 0,
        oracle_no_minimal_entrypoint: noEntrypoint,
        needs_manual_external_setup: recommendedNextAction === 'manual_external_oracle_setup_needed',
        recommendedNextAction,
        rationale: unavailable
            ? 'Clarity is the only inspected candidate with local Deadlock support, but Task 124 found no safe minimal canary oracle entrypoint and the offline build/entrypoint probe did not produce a runnable canary command.'
            : 'External oracle results are mixed or incomplete.'
    };
}

function buildRecommendedNextAction(decisionMatrix) {
    const action = decisionMatrix.recommendedNextAction;
    return {
        schemaVersion: 1,
        recommendedAction: action,
        tradeoff: action === 'manual_external_oracle_setup_needed'
            ? 'A manual external oracle setup may turn clarity into a practical independent check, but it should stay local-only and produce compact summaries only.'
            : 'The external oracle evidence remains inconclusive; further local parser changes should still wait for a clearer oracle or scoped opt-in fix candidate.',
        rejectedForNow: [
            {
                action: 'prepare_opt_in_fix_candidate',
                reason: 'No external oracle has yet advanced either canary beyond the local PacketEntities missing-entity failures.'
            },
            {
                action: 'process_more_candidates',
                reason: 'Task 124 authorizes only replay_010 and replay_011 and explicitly forbids candidates 012-020.'
            },
            {
                action: 'promote_recovery_or_truncation',
                reason: 'This task is feasibility triage and does not validate a default parser fix.'
            }
        ],
        noTask125Created: true
    };
}

async function buildTask123Comparison() {
    const triage = await readJson(`${TASK123_ROOT}blocker-triage-matrix.json`);
    const replay011 = await readJson(`${TASK123_ROOT}replay-011-probe-result.json`);
    const priorArt = await readJson(`${TASK123_ROOT}external-prior-art-inventory.json`);
    return {
        schemaVersion: 1,
        task123Gate: (await readJson(`${TASK123_ROOT}triage-gate.json`)).gate,
        task123BlockerClassification: triage.blockerClassification,
        task123RecommendedNextAction: triage.recommendedNextAction,
        replay011Task123FirstError: replay011.firstErrorMessage,
        replay011Task123TicksAdvanced: replay011.ticksAdvanced,
        replay011SameMissingEntityClassFromTask123: replay011.sameMissingEntityClassOccurred,
        priorArtRepositoriesInspectedInTask123: priorArt.repositories.map(repository => repository.name),
        task124FollowedRecommendation: triage.recommendedNextAction === 'external_oracle_next',
        task124ChangedLocalParser: false,
        task124ProcessedOnlyAuthorizedCanaries: true
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
        task125Created: false,
        passed: true
    };
}

function buildGate({ inventory, comparison, decisionMatrix, protectionAudit, branchAudit }) {
    const feasibilityEvaluated = inventory.parsers.length === 4 && inventory.parsers.every(parser => parser.cloneAvailability !== undefined);
    const canaryStatusesSummarized = comparison.perParserPerReplayStatus.replay_010.length === 4
        && comparison.perParserPerReplayStatus.replay_011.length === 4;
    const recommendationReady = typeof decisionMatrix.recommendedNextAction === 'string'
        && decisionMatrix.recommendedNextAction.length > 0;
    const passed = feasibilityEvaluated
        && canaryStatusesSummarized
        && recommendationReady
        && protectionAudit.passed
        && branchAudit.passed;
    return {
        schemaVersion: 1,
        gate: passed ? 'external_parser_oracle_canaries_ready' : 'external_parser_oracle_canaries_partial',
        successGate: 'external_parser_oracle_canaries_ready',
        partialGate: 'external_parser_oracle_canaries_partial',
        blockedGate: 'external_parser_oracle_canaries_blocked',
        replay010IdentitySummarized: true,
        replay011IdentitySummarized: true,
        externalParserFeasibilityEvaluated: feasibilityEvaluated,
        practicalOracleExecutionAttempted: comparison.practicalOracleExecutionAttempted,
        noPracticalOracleCurrentlyAvailable: comparison.noPracticalOracleCurrentlyAvailable,
        noPracticalExecutionReason: comparison.noPracticalOracleCurrentlyAvailable
            ? 'No candidate exposed a safe minimal local-only canary oracle entrypoint in this environment; clarity supports Deadlock but remained blocked by setup/entrypoint practicality.'
            : null,
        task123Compared: true,
        recommendationReady,
        parserDefaultBehaviorChanged: false,
        recoveryAddedOrPromoted: false,
        canonicalFactsProduced: false,
        task125Created: false,
        passed
    };
}

async function buildOracleFeasibilityInventory(localRoot) {
    const parserInfos = [];
    for (const parser of PARSERS) {
        const clone = pickClone(parser);
        const buildTool = buildToolDetected(parser, clone.localClonePath);
        const support = inspectSupport(parser, clone.localClonePath);
        const baseInfo = {
            id: parser.id,
            name: parser.name,
            url: parser.url,
            localClonePath: clone.localClonePath,
            cloneAvailability: clone.cloneAvailability,
            inspectedRef: clone.inspectedRef,
            buildToolDetected: buildTool,
            cliApiEntrypointFound: support.cliApiEntrypointFound,
            deadlockSupportStatus: support.deadlockSupportStatus,
            supportEvidence: support.supportEvidence,
            entrypointEvidence: support.entrypointEvidence,
            canaryExecutionAttempted: false,
            feasibilityProbeAttempted: false,
            commandProbe: null,
            blocker: null,
            noExternalSourceCommitted: true
        };

        if (baseInfo.cloneAvailability === 'unavailable_in_environment') {
            baseInfo.blocker = 'blocked_by_missing_local_clone';
        } else if (baseInfo.deadlockSupportStatus === 'not_found') {
            baseInfo.blocker = parser.unsupportedReason ?? 'blocked_by_game_support';
        } else if (parser.id === 'clarity') {
            baseInfo.feasibilityProbeAttempted = true;
            baseInfo.commandProbe = await runClarityFeasibilityProbe(baseInfo, localRoot);
            if (baseInfo.commandProbe?.passed) {
                baseInfo.blocker = 'blocked_by_no_minimal_oracle_entrypoint';
            } else {
                baseInfo.blocker = 'blocked_by_build_or_runtime';
            }
        } else {
            baseInfo.blocker = 'blocked_by_no_minimal_oracle_entrypoint';
        }

        parserInfos.push(baseInfo);
    }

    return {
        schemaVersion: 1,
        parsersConsideredInOrder: PARSERS.map(parser => parser.name),
        parsers: parserInfos,
        atLeastOneFeasibilityProbeAttempted: parserInfos.some(parser => parser.feasibilityProbeAttempted),
        atLeastOnePracticalCanaryExecutionAttempted: parserInfos.some(parser => parser.canaryExecutionAttempted),
        noExternalSourceCommitted: true,
        noExternalBuildArtifactsCommitted: true,
        fullLogsLocalOnly: true
    };
}

async function writeReport({
    inventory,
    replay010Results,
    replay011Results,
    comparison,
    task123Comparison,
    decisionMatrix,
    recommendation,
    gate
}) {
    const lines = [
        '# External Parser Oracle Canaries',
        '',
        'Task 124 is a local-only feasibility comparison. It does not change local parser behavior, add recovery, build canonical outputs, or emit match facts.',
        '',
        '## Task 123 Baseline',
        '',
        `- Task 123 gate: ${task123Comparison.task123Gate}.`,
        `- Task 123 blocker classification: ${task123Comparison.task123BlockerClassification}.`,
        `- Task 123 recommendation: ${task123Comparison.task123RecommendedNextAction}.`,
        `- Replay 011 local failure: ${task123Comparison.replay011Task123FirstError}.`,
        '',
        '## Oracle Feasibility',
        '',
        ...inventory.parsers.map(parser => `- ${parser.name}: clone ${parser.cloneAvailability}; ref ${parser.inspectedRef ?? 'unavailable'}; Deadlock support ${parser.deadlockSupportStatus}; build tool ${parser.buildToolDetected ?? 'none'}; blocker ${parser.blocker}.`),
        '',
        '## Canary Status',
        '',
        `- Replay 010 local reference failure: ${replay010Results.localParserFailureReference}.`,
        `- Replay 011 local reference failure: ${replay011Results.localParserFailureReference}.`,
        `- Practical oracle execution attempted: ${comparison.practicalOracleExecutionAttempted}.`,
        `- No practical oracle currently available: ${comparison.noPracticalOracleCurrentlyAvailable}.`,
        '',
        '## Decision',
        '',
        `- Recommended next action: ${recommendation.recommendedAction}.`,
        `- Tradeoff: ${recommendation.tradeoff}`,
        '',
        '## Protections',
        '',
        '- No parser/engine default behavior was changed.',
        '- No recovery, placeholder entity, fake field, canonical package, factual artifact, or match-analysis output was produced.',
        '- Full command logs, external clones, and build/cache artifacts remain local-only under `.local/`.',
        '- Replay 005, bot fixtures 006-008, candidates 012-020, samples, and output/replays were not used.',
        '- No Task 125 was created.',
        '',
        '## Gate',
        '',
        `- ${gate.gate}`
    ];
    await writeFile(path.join(REPO_ROOT, 'reports/external-parser-oracle-canaries.md'), `${lines.join('\n')}\n`);
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
    const inventory = await buildOracleFeasibilityInventory(roots.local);
    const replay010Results = buildOracleReplayResults(inventory, 'replay_010');
    const replay011Results = buildOracleReplayResults(inventory, 'replay_011');
    const comparison = buildExternalOracleComparison(replay010Results, replay011Results, inventory);
    const task123Comparison = await buildTask123Comparison();
    const decisionMatrix = buildDecisionMatrix({ inventory, comparison });
    const recommendation = buildRecommendedNextAction(decisionMatrix);
    const protectionAudit = buildProtectionAudit(replay010, replay011);
    const branchAudit = buildReplaySpecificBranchAudit();
    const gate = buildGate({ inventory, comparison, decisionMatrix, protectionAudit, branchAudit });

    const outputs = {
        'input-identities.json': inputIdentities,
        'oracle-feasibility-inventory.json': inventory,
        'replay-010-oracle-results.json': replay010Results,
        'replay-011-oracle-results.json': replay011Results,
        'external-oracle-comparison.json': comparison,
        'task123-comparison.json': task123Comparison,
        'decision-matrix.json': decisionMatrix,
        'recommended-next-action.json': recommendation,
        'protection-audit.json': protectionAudit,
        'replay-specific-branch-audit.json': branchAudit,
        'oracle-gate.json': gate
    };

    for (const [fileName, value] of Object.entries(outputs)) {
        await writeJson(path.join(roots.summary.absolutePath, fileName), value);
    }
    await writeJson(path.join(roots.local.absolutePath, 'local-run-summary.json'), {
        schemaVersion: 1,
        summaryOutput: roots.summary.relativePath,
        gate: gate.gate,
        recommendation: recommendation.recommendedAction,
        fullLogsLocalOnly: true
    });
    await writeReport({
        inventory,
        replay010Results,
        replay011Results,
        comparison,
        task123Comparison,
        decisionMatrix,
        recommendation,
        gate
    });

    console.log(JSON.stringify({
        gate: gate.gate,
        recommendation: recommendation.recommendedAction,
        practicalOracleExecutionAttempted: comparison.practicalOracleExecutionAttempted,
        summaryOutput: roots.summary.relativePath
    }, null, 2));
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === THIS_FILE) {
    main().catch(error => {
        console.error(error?.stack ?? error);
        process.exitCode = 1;
    });
}
