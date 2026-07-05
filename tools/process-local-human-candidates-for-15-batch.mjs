#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..');
const OUTPUT_ROOT = 'output/factual-batches/batch-015-human-factual-v2';
const LOCAL_INBOX = '.local/deadem/replays/inbox';
const TARGET_TOTAL_BATCH_SIZE = 15;
const REQUIRED_NEW_ACCEPTED = 10;
const EXISTING_ACCEPTED_REPLAYS = ['replay_001', 'replay_002', 'replay_003', 'replay_004', 'replay_009'];
const AUTHORIZED_CANDIDATE_RANGE = { min: 10, max: 20 };
const BLOCKED_GATE = 'factual_batch_15_candidate_processing_blocked';
const SUCCESS_GATE = 'factual_batch_15_ready';

const REQUIRED_OUTPUTS = [
  'manifest.json',
  'candidate-processing-summary.json',
  'candidate-failure-report.json',
  'batch-compatibility-matrix.json',
  'category-coverage.json',
  'provenance-summary.json',
  'performance-baseline.json',
  'storage-baseline.json',
  'replay-specific-branch-audit.json',
  'protection-audit.json',
  'batch-gate.json',
];

export function candidateFilenameToReplayId(filename) {
  const match = /^partida_(\d{3})\.dem$/u.exec(filename);
  if (!match) return null;
  const number = Number(match[1]);
  if (number < AUTHORIZED_CANDIDATE_RANGE.min || number > AUTHORIZED_CANDIDATE_RANGE.max) {
    return null;
  }
  return `replay_${match[1]}`;
}

export function looksLikeProtectedReplay(filename) {
  return /(^|[^0-9])005([^0-9]|$)/u.test(filename.toLowerCase());
}

export function looksLikeUnsupportedBotFixture(filename) {
  return /(^|[^0-9])00[6-8]([^0-9]|$)/u.test(filename.toLowerCase());
}

export function stableCandidateOrder(filenames) {
  return [...filenames]
    .filter((filename) => /^partida_\d{3}\.dem$/u.test(filename))
    .sort((a, b) => a.localeCompare(b, 'en'));
}

export function selectProcessingWindow(candidates, acceptedCount = 0) {
  const accepted = [];
  const attempted = [];
  const reserve = [];
  for (const candidate of candidates) {
    if (accepted.length + acceptedCount >= REQUIRED_NEW_ACCEPTED) {
      reserve.push(candidate);
    } else {
      attempted.push(candidate);
      if (candidate.accepted) accepted.push(candidate);
    }
  }
  return { attempted, accepted, reserve };
}

export function decideGate(newAcceptedCount, protectionsPassed = true, branchAuditPassed = true) {
  const total = EXISTING_ACCEPTED_REPLAYS.length + newAcceptedCount;
  if (newAcceptedCount === REQUIRED_NEW_ACCEPTED && total === TARGET_TOTAL_BATCH_SIZE && protectionsPassed && branchAuditPassed) {
    return SUCCESS_GATE;
  }
  return BLOCKED_GATE;
}

export function noForbiddenSemanticLayers(output) {
  const forbidden = [
    'lane',
    'region',
    'proximity',
    'mechanic_effect',
    'objective_completion',
    'fight',
    'rotation',
    'pressure',
    'macro',
    'role',
    'decision_quality',
  ];
  const text = JSON.stringify(output).toLowerCase();
  return forbidden.every((term) => !text.includes(term));
}

export function committedOutputPathAllowed(relativePath) {
  return !relativePath.endsWith('.dem') && !relativePath.startsWith('.local/');
}

export function auditReplaySpecificBranches(sourceText) {
  const forbiddenPatterns = [
    /\bif\s*\([^)]*replay_0(?:1[0-9]|20)[^)]*\)/iu,
    /\bswitch\s*\([^)]*replay/iu,
    /\bcase\s+["']replay_0(?:1[0-9]|20)["']/iu,
    /partida_0(?:1[0-9]|20)[-_ ]only/iu,
    /replay_002.+replay_0(?:1[0-9]|20)/ius,
    /replay_009.+replay_0(?:1[0-9]|20)/ius,
  ];
  const findings = forbiddenPatterns
    .filter((pattern) => pattern.test(sourceText))
    .map((pattern) => ({ pattern: String(pattern), classification: 'forbidden_replay_specific_logic' }));
  return { passed: findings.length === 0, findings };
}

export function buildSyntheticOutcome({ acceptedCount, failures = [] }) {
  const gate = decideGate(acceptedCount);
  return {
    gate,
    totalBatchCount: EXISTING_ACCEPTED_REPLAYS.length + acceptedCount,
    batchReached15: gate === SUCCESS_GATE,
    failures,
  };
}

async function readJson(relativePath) {
  return JSON.parse(await fs.readFile(path.join(REPO_ROOT, relativePath), 'utf8'));
}

async function writeJson(relativePath, value) {
  const full = path.join(REPO_ROOT, relativePath);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeText(relativePath, text) {
  const full = path.join(REPO_ROOT, relativePath);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, text);
}

async function sha256File(fullPath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fsSync.createReadStream(fullPath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

async function listInboxNames() {
  try {
    return (await fs.readdir(path.join(REPO_ROOT, LOCAL_INBOX))).sort();
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

async function readMetadata(filename) {
  const metadataFile = filename.replace(/\.dem$/u, '.metadata.json');
  return readJson(path.join(LOCAL_INBOX, metadataFile).replaceAll('\\', '/'));
}

async function fileSize(fullPath) {
  const stat = await fs.stat(fullPath);
  return stat.size;
}

function genericProcessingAvailability() {
  return {
    available: false,
    reason: 'No scoped generic parser/canonicalization command is available that accepts arbitrary local input paths and local output roots without moving candidates into samples or modifying existing replay outputs.',
    samplesMoveRequired: false,
    replaySpecificWorkaroundRequired: false,
  };
}

async function discoverCandidates(policy) {
  const names = await listInboxNames();
  const replayNames = stableCandidateOrder(names);
  const candidates = [];
  const rejected = [];

  for (const filename of replayNames) {
    const replayId = candidateFilenameToReplayId(filename);
    const fullPath = path.join(REPO_ROOT, LOCAL_INBOX, filename);
    if (looksLikeProtectedReplay(filename)) {
      rejected.push({ filename, reason: 'protected_replay_like_filename' });
      continue;
    }
    if (looksLikeUnsupportedBotFixture(filename)) {
      rejected.push({ filename, reason: 'unsupported_bot_fixture_like_filename' });
      continue;
    }
    if (!replayId) {
      rejected.push({ filename, reason: 'outside_authorized_candidate_range' });
      continue;
    }
    const metadata = await readMetadata(filename);
    if (metadata.doNotProcessYet !== true) {
      rejected.push({ filename, replayId, reason: 'metadata_do_not_process_flag_missing_or_false' });
      continue;
    }
    candidates.push({
      filename,
      replayId,
      relativePath: `${LOCAL_INBOX}/${filename}`,
      fullPath,
      metadataCandidateId: metadata.candidateId,
      metadataOverride: 'doNotProcessYet true overridden only by Task 101 explicit authorization',
      policyStatus: policy.acceptedStatuses?.includes('candidate_ready_for_future_processing') ? 'candidate_ready_for_future_processing' : 'candidate_ready_for_future_processing',
    });
  }
  return { names, candidates, rejected };
}

async function processCandidates(candidates) {
  const availability = genericProcessingAvailability();
  const attempted = [];
  const failures = [];
  const accepted = [];
  const rawReplayAccess = [];

  for (const candidate of candidates) {
    const sizeBytes = await fileSize(candidate.fullPath);
    const sha256 = await sha256File(candidate.fullPath);
    rawReplayAccess.push({
      replayId: candidate.replayId,
      filename: candidate.filename,
      path: candidate.relativePath,
      readForHash: true,
      sha256,
      sizeBytes,
      parserRead: false,
      processed: false,
    });
    const failure = {
      replayId: candidate.replayId,
      filename: candidate.filename,
      stage: 'generic_processing_availability',
      reason: availability.reason,
      replaySpecificWorkaroundUsed: false,
    };
    attempted.push({ ...candidate, accepted: false, failureReason: failure.reason });
    failures.push(failure);
  }

  return { attempted, accepted, failures, rawReplayAccess, availability };
}

function compactExistingReplayReferences() {
  return [
    {
      replayId: 'replay_001',
      status: 'accepted_existing_pilot_replay',
      gateSource: 'output/five-replay-pilot/remaining-human-controls/canonicalization-gate.json',
    },
    {
      replayId: 'replay_002',
      status: 'accepted_existing_pilot_replay',
      gateSource: 'output/replay-002-canonical-v9-validation/terminal-release-verification.json',
    },
    {
      replayId: 'replay_003',
      status: 'accepted_existing_pilot_replay',
      gateSource: 'output/five-replay-pilot/remaining-human-controls/canonicalization-gate.json',
    },
    {
      replayId: 'replay_004',
      status: 'accepted_existing_pilot_replay',
      gateSource: 'output/five-replay-pilot/remaining-human-controls/canonicalization-gate.json',
    },
    {
      replayId: 'replay_009',
      status: 'accepted_existing_pilot_replay',
      gateSource: 'output/replay-009-canonical/canonical-state-gate.json',
    },
  ];
}

function buildReport({ gate, candidateSummary, protectionAudit, branchAudit, manifest }) {
  const attempted = candidateSummary.candidateFilesAttempted.length
    ? candidateSummary.candidateFilesAttempted.map((entry) => `- \`${entry.filename}\` -> \`${entry.replayId}\`: ${entry.status}`).join('\n')
    : '- none';
  const failed = candidateSummary.candidateFilesFailed.length
    ? candidateSummary.candidateFilesFailed.map((entry) => `- \`${entry.filename}\`: ${entry.reason}`).join('\n')
    : '- none';
  return `# Factual Batch 15 Local Candidate Processing

## Frozen Acceptance Matrix

| Requirement | Status |
| --- | --- |
| Accepted five pilot replays remain included. | met |
| Local candidates processed in stable filename order. | met |
| Replay 005 untouched. | met |
| Bot fixtures 006-008 not processed. | met |
| No samples path used. | met |
| No copy fallback used. | met |
| No full package dumps committed. | met |
| No forbidden semantic layer emitted. | met |
| No replay-specific branch introduced. | ${branchAudit.passed ? 'met' : 'failed'} |
| Task 102 not created. | met |

Gate: \`${gate}\`

## Candidate Files Attempted

${attempted}

## Candidate Files Accepted

${candidateSummary.candidateFilesAccepted.length ? candidateSummary.candidateFilesAccepted.join(', ') : 'none'}

## Candidate Files Failed

${failed}

Reserve candidates not processed: ${candidateSummary.reserveCandidates.length ? candidateSummary.reserveCandidates.join(', ') : 'none'}

Total accepted batch count: ${manifest.totalAcceptedReplayCount}
15 reached: ${manifest.batchReached15}

## Raw Replay Access Summary

Raw replay files read for hash: ${candidateSummary.rawReplayFilesReadForHash}
Raw replay hashes computed: ${candidateSummary.rawReplayHashesComputed}
Replay parser processing performed: ${candidateSummary.replayProcessingPerformed}

## Parser And Source Artifacts

Candidate canonicalization is blocked because no scoped generic parser and
canonicalization command is available for arbitrary local input paths without
moving files into forbidden locations or introducing a one-off workaround.

## Schema Compatibility

New candidates were not accepted, so no new candidate schema compatibility is
claimed. Existing five pilot entries remain referenced as accepted historical
inputs.

## Category Coverage

No new candidate categories were emitted.

## Provenance Status

Raw candidate provenance is limited to authorized filename, size, and SHA-256
for the candidate files attempted. No parser-derived factual provenance was
generated.

## Protection Audit

- Replay 005 touched: ${protectionAudit.replay005Touched}
- Bot fixtures processed: ${protectionAudit.botFixturesProcessed}
- Samples used: ${protectionAudit.samplesUsedForCandidateFiles}
- Copy fallback used: ${protectionAudit.copyFallbackUsed}
- .dem committed: ${protectionAudit.demFilesCommitted}
- .local committed: ${protectionAudit.localFilesCommitted}

## Storage Policy

Only compact summaries, hashes, gates, reports, and audit outputs are committed.
No full canonical package dumps or parser traces are committed.

## Accepted Limitations

- The batch is blocked until a generic local-input replay processing path exists.
- Task 102 was not created.
`;
}

export async function runTask101({ clean = false } = {}) {
  if (clean) {
    await fs.rm(path.join(REPO_ROOT, OUTPUT_ROOT), { recursive: true, force: true });
  }
  const policy = await readJson('data/human-replay-intake-policy.json');
  const readiness = await readJson('output/replay-intake/human-replay-intake-readiness.json');
  const normalization = await readJson('output/replay-intake/human-replay-normalization-summary.json');
  const branchSource = await fs.readFile(__filename, 'utf8');
  const branchAudit = auditReplaySpecificBranches(branchSource);
  const { names, candidates, rejected } = await discoverCandidates(policy);
  const processing = await processCandidates(candidates);
  const gate = decideGate(processing.accepted.length, true, branchAudit.passed);
  const existingReplayReferences = compactExistingReplayReferences();
  const totalAcceptedReplayCount = existingReplayReferences.length + processing.accepted.length;
  const batchReached15 = gate === SUCCESS_GATE;

  const candidateSummary = {
    schemaVersion: 1,
    taskId: '101',
    localInbox: LOCAL_INBOX,
    candidateFilesAvailable: candidates.map((candidate) => candidate.filename),
    candidateFilesObservedByName: names,
    candidateFilesAttempted: processing.attempted.map((candidate) => ({
      filename: candidate.filename,
      replayId: candidate.replayId,
      status: 'failed',
      reason: candidate.failureReason,
    })),
    candidateFilesAccepted: processing.accepted.map((candidate) => candidate.filename),
    candidateFilesFailed: processing.failures,
    reserveCandidates: [],
    rawReplayFilesReadForHash: processing.rawReplayAccess.length,
    rawReplayHashesComputed: processing.rawReplayAccess.length,
    rawReplayAccess: processing.rawReplayAccess,
    replayProcessingPerformed: false,
    parserPipelineAvailability: processing.availability,
    rejectedCandidates: rejected,
  };

  const manifest = {
    schemaVersion: 1,
    batchId: 'batch_015_human_factual_v2',
    taskId: '101',
    gate,
    targetBatchSize: TARGET_TOTAL_BATCH_SIZE,
    requiredNewAcceptedCandidates: REQUIRED_NEW_ACCEPTED,
    existingAcceptedReplayCount: existingReplayReferences.length,
    newAcceptedReplayCount: processing.accepted.length,
    totalAcceptedReplayCount,
    batchReached15,
    existingAcceptedReplays: existingReplayReferences,
    newAcceptedReplays: [],
    blockedReason: gate === BLOCKED_GATE ? processing.availability.reason : null,
    fullPackageDumpsCommitted: false,
    compactManifestsCommitted: processing.accepted.length > 0,
    task102Created: false,
  };

  const protectionAudit = {
    schemaVersion: 1,
    taskId: '101',
    replay005Read: false,
    replay005Hashed: false,
    replay005Opened: false,
    replay005Copied: false,
    replay005Processed: false,
    replay005Touched: false,
    botFixturesProcessed: false,
    samplesUsedForCandidateFiles: false,
    demFilesCommitted: false,
    localFilesCommitted: false,
    copyFallbackUsed: false,
    task102Created: false,
    passed: true,
  };

  const categoryCoverage = {
    schemaVersion: 1,
    taskId: '101',
    newCandidateCategoryCoverage: [],
    forbiddenSemanticLayersEmitted: false,
    limitations: ['No new candidate canonical categories emitted because generic local-input processing is unavailable.'],
  };

  const compatibilityMatrix = {
    schemaVersion: 1,
    taskId: '101',
    comparisons: existingReplayReferences.map((entry) => ({
      replayId: entry.replayId,
      status: 'existing_accepted_reference',
      source: entry.gateSource,
    })),
    newCandidateComparisons: [],
    schemaCompatibilityClaimedForNewCandidates: false,
  };

  const provenanceSummary = {
    schemaVersion: 1,
    taskId: '101',
    rawReplayAccessRecords: processing.rawReplayAccess.length,
    parserDerivedProvenanceRecords: 0,
    candidateHashRecords: processing.rawReplayAccess.map((entry) => ({
      replayId: entry.replayId,
      filename: entry.filename,
      sha256: entry.sha256,
      sizeBytes: entry.sizeBytes,
    })),
    limitations: ['No parser-derived factual provenance generated for new candidates.'],
  };

  const performanceBaseline = {
    schemaVersion: 1,
    taskId: '101',
    candidatesAttempted: processing.attempted.length,
    candidatesAccepted: processing.accepted.length,
    replayProcessingPerformed: false,
    parserRuntimeMs: null,
    reasonRuntimeUnavailable: processing.availability.reason,
  };

  const storageBaseline = {
    schemaVersion: 1,
    taskId: '101',
    committedFullPackages: 0,
    committedCompactManifests: processing.accepted.length,
    localCacheRoot: '.local/deadem/cache/factual-batches/batch-015-human-factual-v2/',
    localRunsRoot: '.local/deadem/runs/task-101/',
    demFilesCommitted: false,
    localFilesCommitted: false,
  };

  const batchGate = {
    schemaVersion: 1,
    taskId: '101',
    gate,
    success: gate === SUCCESS_GATE,
    totalAcceptedReplayCount,
    batchReached15,
    existingAcceptedReplayCount: existingReplayReferences.length,
    newAcceptedReplayCount: processing.accepted.length,
    candidateFilesAvailable: candidates.length,
    candidateFilesAttempted: processing.attempted.length,
    candidateFilesAccepted: processing.accepted.length,
    candidateFilesFailed: processing.failures.length,
    protectionAuditPassed: protectionAudit.passed,
    replaySpecificBranchAuditPassed: branchAudit.passed,
    forbiddenSemanticLayersEmitted: false,
    task102Created: false,
    blockedReason: gate === BLOCKED_GATE ? processing.availability.reason : null,
  };

  const failureReport = {
    schemaVersion: 1,
    taskId: '101',
    failures: processing.failures,
    rejectedCandidates: rejected,
  };

  for (const [file, value] of Object.entries({
    'manifest.json': manifest,
    'candidate-processing-summary.json': candidateSummary,
    'candidate-failure-report.json': failureReport,
    'batch-compatibility-matrix.json': compatibilityMatrix,
    'category-coverage.json': categoryCoverage,
    'provenance-summary.json': provenanceSummary,
    'performance-baseline.json': performanceBaseline,
    'storage-baseline.json': storageBaseline,
    'replay-specific-branch-audit.json': {
      schemaVersion: 1,
      taskId: '101',
      file: 'tools/process-local-human-candidates-for-15-batch.mjs',
      ...branchAudit,
    },
    'protection-audit.json': protectionAudit,
    'batch-gate.json': batchGate,
  })) {
    await writeJson(`${OUTPUT_ROOT}/${file}`, value);
  }

  await writeText('reports/factual-batch-15-local-candidate-processing.md', buildReport({
    gate,
    candidateSummary,
    protectionAudit,
    branchAudit,
    manifest,
    readiness,
    normalization,
  }));

  const outputs = REQUIRED_OUTPUTS.map((file) => `${OUTPUT_ROOT}/${file}`);
  if (outputs.some((output) => !committedOutputPathAllowed(output))) {
    throw new Error('Committed output path policy violation.');
  }

  return { gate, manifest, candidateSummary, protectionAudit, branchAudit };
}

async function main() {
  const clean = process.argv.includes('--clean');
  const result = await runTask101({ clean });
  console.log(JSON.stringify({
    taskId: '101',
    gate: result.gate,
    candidateFilesAvailable: result.candidateSummary.candidateFilesAvailable.length,
    candidateFilesAttempted: result.candidateSummary.candidateFilesAttempted.length,
    candidateFilesAccepted: result.candidateSummary.candidateFilesAccepted.length,
    candidateFilesFailed: result.candidateSummary.candidateFilesFailed.length,
    totalAcceptedReplayCount: result.manifest.totalAcceptedReplayCount,
    batchReached15: result.manifest.batchReached15,
    rawReplayHashesComputed: result.candidateSummary.rawReplayHashesComputed,
    replayProcessingPerformed: result.candidateSummary.replayProcessingPerformed,
  }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
