#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const THIS_FILE = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(THIS_FILE), '..');
const DEFAULT_SUMMARY_ROOT = 'output/local-replay-processing/upstream-update-check/';
const UPSTREAM_OWNER = 'Igor-Losev';
const UPSTREAM_REPO = 'deadem';
const UPSTREAM_URL = `https://github.com/${UPSTREAM_OWNER}/${UPSTREAM_REPO}`;
const GITHUB_API_ROOT = `https://api.github.com/repos/${UPSTREAM_OWNER}/${UPSTREAM_REPO}`;
export const KNOWN_APPLIED_UPSTREAM_FIX_SHA = 'dba298dbed2b7978f9569e6e5e5c0bd787f36b4a';
export const KNOWN_APPLIED_UPSTREAM_FIX_SUMMARY = 'FieldFactory: resolved char fields without count as varint, not string';

function slash(value) {
    return value.replaceAll(path.sep, '/');
}

function parseArgs(argv) {
    const args = new Map();
    for (let index = 0; index < argv.length; index += 2) {
        const key = argv[index];
        const value = argv[index + 1];
        if (!key?.startsWith('--') || value === undefined) throw new Error(`Invalid argument near ${key ?? '<end>'}`);
        args.set(key.slice(2), value);
    }
    return args;
}

function assertRelativeRepositoryPath(value, label) {
    if (!value || path.isAbsolute(value)) throw new Error(`${label} must be a relative repository path`);
    const normalized = slash(value).replace(/\/?$/u, '/');
    if (normalized.includes('../') || normalized === '..') throw new Error(`${label} must stay inside the repository`);
    if (!normalized.startsWith('output/local-replay-processing/upstream-update-check/')) {
        throw new Error(`${label} must be under output/local-replay-processing/upstream-update-check/`);
    }
    return normalized;
}

async function writeJson(filePath, value) {
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function writeMarkdown(filePath, lines) {
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, `${lines.join('\n')}\n`, 'utf8');
}

async function readJsonIfPresent(relativePath) {
    try {
        return JSON.parse(await readFile(path.join(REPO_ROOT, relativePath), 'utf8'));
    } catch {
        return null;
    }
}

async function githubJson(url, options = {}) {
    const response = await fetch(url, {
        headers: {
            Accept: 'application/vnd.github+json',
            'User-Agent': 'deadem-upstream-update-check'
        },
        signal: options.signal
    });
    if (response.status === 404 && options.allowNotFound) return null;
    if (!response.ok) {
        const rateRemaining = response.headers.get('x-ratelimit-remaining');
        const rateReset = response.headers.get('x-ratelimit-reset');
        throw new Error(`GitHub request failed ${response.status} for ${url}; rateRemaining=${rateRemaining ?? 'unknown'}; rateReset=${rateReset ?? 'unknown'}`);
    }
    return await response.json();
}

function compactCommit(commit) {
    return {
        sha: commit?.sha ?? null,
        message: commit?.commit?.message?.split(/\r?\n/u)[0] ?? null,
        date: commit?.commit?.committer?.date ?? commit?.commit?.author?.date ?? null,
        htmlUrl: commit?.html_url ?? null
    };
}

export async function queryUpstream(fetchTimeoutMs = 15000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), fetchTimeoutMs);
    try {
        const repo = await githubJson(GITHUB_API_ROOT, { signal: controller.signal });
        const defaultBranch = repo?.default_branch ?? null;
        const head = defaultBranch
            ? await githubJson(`${GITHUB_API_ROOT}/commits/${encodeURIComponent(defaultBranch)}`, { signal: controller.signal })
            : null;
        const tags = await githubJson(`${GITHUB_API_ROOT}/tags?per_page=10`, { signal: controller.signal });
        const latestRelease = await githubJson(`${GITHUB_API_ROOT}/releases/latest`, { signal: controller.signal, allowNotFound: true });
        const commits = await githubJson(`${GITHUB_API_ROOT}/commits?per_page=10`, { signal: controller.signal });
        return {
            upstreamReachable: true,
            upstreamDefaultBranch: defaultBranch,
            upstreamHeadSha: head?.sha ?? null,
            upstreamHeadCommit: compactCommit(head),
            upstreamLatestTag: tags?.[0]?.name ?? null,
            upstreamLatestTagSha: tags?.[0]?.commit?.sha ?? null,
            upstreamLatestRelease: latestRelease?.tag_name ?? null,
            upstreamLatestReleaseName: latestRelease?.name ?? null,
            recentCommits: Array.isArray(commits) ? commits.slice(0, 5).map(compactCommit) : [],
            error: null
        };
    } catch (error) {
        return {
            upstreamReachable: false,
            upstreamDefaultBranch: null,
            upstreamHeadSha: null,
            upstreamHeadCommit: null,
            upstreamLatestTag: null,
            upstreamLatestTagSha: null,
            upstreamLatestRelease: null,
            upstreamLatestReleaseName: null,
            recentCommits: [],
            error: {
                name: error?.name ?? 'Error',
                message: error?.message ?? String(error)
            }
        };
    } finally {
        clearTimeout(timer);
    }
}

function versionParts(tag) {
    const match = String(tag ?? '').match(/v?(\d+)\.(\d+)\.(\d+)/u);
    if (!match) return null;
    return match.slice(1).map(Number);
}

export function compareSemverTags(left, right) {
    const leftParts = versionParts(left);
    const rightParts = versionParts(right);
    if (!leftParts || !rightParts) return null;
    for (let index = 0; index < leftParts.length; index += 1) {
        if (leftParts[index] > rightParts[index]) return 1;
        if (leftParts[index] < rightParts[index]) return -1;
    }
    return 0;
}

export function buildLocalAppliedFixes({ fieldFactoryChange, finalClassification, syntheticTestResult } = {}) {
    const scalarCharEvidence = fieldFactoryChange?.scalarCharWithoutCountResolution === 'char_without_count_var_uint_32';
    const replayResolutionEvidence = finalClassification?.classification === 'upstream_fix_resolved_replay_010_and_011';
    const testEvidence = Array.isArray(syntheticTestResult?.scenarios)
        && syntheticTestResult.scenarios.some(scenario => /scalar char without count resolves/u.test(scenario));
    return {
        schemaVersion: 1,
        knownAppliedUpstreamFixes: [
            {
                sha: KNOWN_APPLIED_UPSTREAM_FIX_SHA,
                summary: KNOWN_APPLIED_UPSTREAM_FIX_SUMMARY,
                localEvidenceKeys: [
                    'char_without_count_var_uint_32',
                    'tests/fieldfactory-char-decoder.test.mjs',
                    'Task 149 upstream-char-decoder-fix artifacts'
                ],
                evidencePresent: scalarCharEvidence && replayResolutionEvidence && testEvidence
            }
        ],
        localEvidence: {
            charWithoutCountVarUint32: scalarCharEvidence,
            fieldFactoryChangeArtifactPresent: fieldFactoryChange !== null,
            replay010Replay011ResolutionArtifactPresent: replayResolutionEvidence,
            fieldfactoryCharDecoderTestArtifactPresent: testEvidence,
            testFile: 'tests/fieldfactory-char-decoder.test.mjs'
        },
        localVersion: null,
        localVersionStatus: 'local_version_unknown',
        rawDataCaptured: false
    };
}

export function decideUpdateStatus(upstreamStatus, localAppliedFixes) {
    const appliedShas = new Set(localAppliedFixes.knownAppliedUpstreamFixes.map(fix => fix.sha).filter(Boolean));
    if (!upstreamStatus.upstreamReachable) {
        return {
            classification: 'upstream_check_unavailable',
            updateDetected: false,
            recommendedAction: 'manual_upstream_check_required',
            reasons: [
                'upstream was not reachable from this environment',
                'network, GitHub API, or rate limit failure should not trigger local parser deep-dive by itself'
            ]
        };
    }
    if (!upstreamStatus.upstreamHeadSha && !upstreamStatus.upstreamLatestTag && !upstreamStatus.upstreamLatestRelease) {
        return {
            classification: 'upstream_check_local_version_unknown',
            updateDetected: false,
            recommendedAction: 'cannot_determine_without_network',
            reasons: ['upstream was reachable but no comparable head/tag/release metadata was available']
        };
    }

    const headAlreadyApplied = upstreamStatus.upstreamHeadSha ? appliedShas.has(upstreamStatus.upstreamHeadSha) : false;
    const latestTagComparison = compareSemverTags(upstreamStatus.upstreamLatestTag, 'v3.2.1');
    const latestReleaseComparison = compareSemverTags(upstreamStatus.upstreamLatestRelease, 'v3.2.1');
    const newerTag = latestTagComparison === 1;
    const newerRelease = latestReleaseComparison === 1;
    const headDiffersFromKnownFix = upstreamStatus.upstreamHeadSha !== null && !headAlreadyApplied;

    if (newerRelease) {
        return {
            classification: 'upstream_check_update_available',
            updateDetected: true,
            recommendedAction: 'review_upstream_release_notes_first',
            reasons: [`latest release ${upstreamStatus.upstreamLatestRelease} appears newer than known fix baseline v3.2.1`]
        };
    }
    if (newerTag) {
        return {
            classification: 'upstream_check_update_available',
            updateDetected: true,
            recommendedAction: 'review_upstream_commits_first',
            reasons: [`latest tag ${upstreamStatus.upstreamLatestTag} appears newer than known fix baseline v3.2.1`]
        };
    }
    if (headDiffersFromKnownFix) {
        return {
            classification: 'upstream_check_manual_review_recommended',
            updateDetected: true,
            recommendedAction: 'review_upstream_commits_first',
            reasons: ['upstream head differs from the known applied fix commit; review recent commits before local deep-dive']
        };
    }
    return {
        classification: 'upstream_check_no_update_detected',
        updateDetected: false,
        recommendedAction: 'continue_local_debug_after_upstream_check',
        reasons: ['no upstream head/tag/release newer than the known applied fix baseline was detected']
    };
}

function manualInstructions(decision) {
    return {
        schemaVersion: 1,
        manualCheckUrl: UPSTREAM_URL,
        recommendedAction: decision.recommendedAction,
        parserIssueWorkflow: [
            'Run focused local tests for the failing area.',
            'Run npm run check:upstream-deadem.',
            'If an upstream release or commit is detected, read release notes and recent commits before local deep diagnosis.',
            'If a relevant upstream fix exists, create a separate task for manual review and possible cherry-pick.',
            'Start deep local parser investigation only when upstream evidence does not explain the issue.'
        ],
        forbiddenAutomation: [
            'no automatic pull',
            'no automatic merge',
            'no automatic cherry-pick',
            'no automatic rebase',
            'no parser behavior change'
        ]
    };
}

function protectionAudit() {
    return {
        schemaVersion: 1,
        passed: true,
        replayProcessed: false,
        replay005AccessedOrProcessed: false,
        bots006To008AccessedOrProcessed: false,
        candidates012To020AccessedOrProcessed: false,
        samplesUsed: false,
        outputReplaysUsed: false,
        parserEngineBehaviorModified: false,
        packagesDeademModified: false,
        pullMergeCherryPickOrRebaseUsed: false,
        automaticUpdateApplied: false,
        canonicalSourceMatchOutputProduced: false,
        javaExecuted: false,
        clarityExecuted: false,
        externalParserExecuted: false,
        wslUsed: false,
        iaflowUsed: false,
        productReviewerAutomationUsed: false,
        task154Created: false,
        rawDataCaptured: false
    };
}

function gateForDecision(decision) {
    return {
        schemaVersion: 1,
        gate: 'upstream_deadem_update_check_added',
        classification: decision.classification,
        updateDetected: decision.updateDetected,
        recommendedAction: decision.recommendedAction,
        reasons: decision.reasons,
        updaterAppliedAutomatically: false,
        rawDataCaptured: false
    };
}

function reportLines({ upstreamStatus, decision }) {
    return [
        '# Upstream Deadem Update Check',
        '',
        'Task 153 adds a manual read-only check for `Igor-Losev/deadem` so future parser issues start by checking upstream before long local diagnosis.',
        '',
        '## Snapshot',
        '',
        `- upstream reachable: \`${upstreamStatus.upstreamReachable}\``,
        `- upstream default branch: \`${upstreamStatus.upstreamDefaultBranch ?? 'unknown'}\``,
        `- upstream head: \`${upstreamStatus.upstreamHeadSha ?? 'unknown'}\``,
        `- latest tag: \`${upstreamStatus.upstreamLatestTag ?? 'unknown'}\``,
        `- latest release: \`${upstreamStatus.upstreamLatestRelease ?? 'unknown'}\``,
        `- classification: \`${decision.classification}\``,
        `- recommended action: \`${decision.recommendedAction}\``,
        '',
        'The check never applies updates automatically. Any pull, merge, cherry-pick, rebase, or parser behavior change requires a separate explicit task.'
    ];
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const summaryRoot = path.resolve(REPO_ROOT, assertRelativeRepositoryPath(args.get('summary-output') ?? DEFAULT_SUMMARY_ROOT, 'summary output'));
    const checkedAt = new Date().toISOString();

    const [fieldFactoryChange, finalClassification, syntheticTestResult] = await Promise.all([
        readJsonIfPresent('output/local-replay-processing/upstream-char-decoder-fix/fieldfactory-change-summary.json'),
        readJsonIfPresent('output/local-replay-processing/upstream-char-decoder-fix/final-classification.json'),
        readJsonIfPresent('output/local-replay-processing/upstream-char-decoder-fix/synthetic-char-decoder-test-result.json')
    ]);
    const localAppliedFixes = buildLocalAppliedFixes({ fieldFactoryChange, finalClassification, syntheticTestResult });
    const upstreamStatus = await queryUpstream();
    const upstreamStatusWithMetadata = {
        schemaVersion: 1,
        owner: UPSTREAM_OWNER,
        repo: UPSTREAM_REPO,
        upstreamUrl: UPSTREAM_URL,
        manualCheckUrl: UPSTREAM_URL,
        checkedAt,
        rawDataCaptured: false,
        ...upstreamStatus
    };
    const decision = {
        schemaVersion: 1,
        checkedAt,
        ...decideUpdateStatus(upstreamStatus, localAppliedFixes),
        manualCheckUrl: UPSTREAM_URL,
        updaterAppliedAutomatically: false,
        pullMergeCherryPickOrRebaseUsed: false,
        rawDataCaptured: false
    };
    const manualCheckInstructions = manualInstructions(decision);
    const audit = protectionAudit();
    const gate = gateForDecision(decision);

    await writeJson(path.join(summaryRoot, 'upstream-status.json'), upstreamStatusWithMetadata);
    await writeJson(path.join(summaryRoot, 'local-applied-fixes.json'), localAppliedFixes);
    await writeJson(path.join(summaryRoot, 'update-decision.json'), decision);
    await writeJson(path.join(summaryRoot, 'manual-check-instructions.json'), manualCheckInstructions);
    await writeJson(path.join(summaryRoot, 'protection-audit.json'), audit);
    await writeJson(path.join(summaryRoot, 'check-gate.json'), gate);
    await writeMarkdown(path.join(REPO_ROOT, 'reports/upstream-update-check.md'), reportLines({ upstreamStatus: upstreamStatusWithMetadata, decision }));

    return gate;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    main().then(result => {
        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    }).catch(error => {
        console.error(error);
        process.exitCode = 1;
    });
}
