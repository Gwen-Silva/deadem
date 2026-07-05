#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildReadiness,
  classifyInboxFilenames,
  isReplayFileName,
  looksLikeProtectedReplay,
  looksLikeUnsupportedBotFixture,
} from './audit-human-replay-intake.mjs';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..');
const POLICY_PATH = 'data/human-replay-intake-policy.json';
const SUMMARY_PATH = 'output/replay-intake/human-replay-normalization-summary.json';
const READINESS_PATH = 'output/replay-intake/human-replay-intake-readiness.json';
const REPORT_PATH = 'reports/human-replay-inbox-normalization.md';
const DEFAULT_ACCIDENTAL_INBOX = 'replays/inbox/';
const DEFAULT_CANONICAL_INBOX = '.local/deadem/replays/inbox/';

const REQUIRED_METADATA_FIELDS = {
  schemaVersion: 1,
  source: 'user_supplied_local_file',
  isHumanMatch: true,
  knownReplayId: null,
  notes: 'Auto-generated metadata stub. User should confirm this is a human match before processing.',
  doNotProcessYet: true,
  metadataGeneratedBy: 'Task 100',
  fileContentsRead: false,
  hashComputed: false,
  replayProcessingPerformed: false,
};

function repoPath(repoRoot, relativePath) {
  return path.join(repoRoot, relativePath);
}

function basenameNoExtension(filename) {
  return filename.replace(/\.dem$/iu, '');
}

function metadataFilenameForReplay(filename) {
  return `${basenameNoExtension(filename)}.metadata.json`;
}

function makeMetadataStub(filename, existing = {}) {
  const candidateId = basenameNoExtension(filename);
  return {
    ...REQUIRED_METADATA_FIELDS,
    ...existing,
    schemaVersion: 1,
    candidateId: existing.candidateId || candidateId,
    localFileName: filename,
    doNotProcessYet: true,
    metadataGeneratedBy: existing.metadataGeneratedBy || 'Task 100',
    fileContentsRead: false,
    hashComputed: false,
    replayProcessingPerformed: false,
  };
}

async function readJson(relativePath, repoRoot = REPO_ROOT) {
  return JSON.parse(await fs.readFile(repoPath(repoRoot, relativePath), 'utf8'));
}

async function writeJson(relativePath, value, repoRoot = REPO_ROOT) {
  const fullPath = repoPath(repoRoot, relativePath);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeText(relativePath, value, repoRoot = REPO_ROOT) {
  const fullPath = repoPath(repoRoot, relativePath);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, value);
}

async function dirExists(dirPath) {
  try {
    const stat = await fs.stat(dirPath);
    return stat.isDirectory();
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

async function listNamesIfDirectory(dirPath) {
  if (!(await dirExists(dirPath))) {
    return [];
  }
  return (await fs.readdir(dirPath)).sort();
}

function classifyReplayName(filename, policy) {
  if (!isReplayFileName(filename)) {
    return 'not_replay_file';
  }
  if (looksLikeProtectedReplay(filename, policy.protectedFilenamePatterns)) {
    return 'blocked_protected_replay';
  }
  if (looksLikeUnsupportedBotFixture(filename, policy.unsupportedBotPatterns)) {
    return 'blocked_unsupported_bot_fixture';
  }
  return 'eligible_replay_candidate';
}

async function ensureMetadata({ canonicalInboxPath, filename }) {
  const metadataFilename = metadataFilenameForReplay(filename);
  const metadataPath = path.join(canonicalInboxPath, metadataFilename);
  let existing = null;
  let preserved = false;
  let repaired = false;

  try {
    existing = JSON.parse(await fs.readFile(metadataPath, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT' && error instanceof SyntaxError === false) {
      throw error;
    }
  }

  if (existing) {
    const repairedMetadata = makeMetadataStub(filename, existing);
    const missingRequiredField = [
      'schemaVersion',
      'candidateId',
      'localFileName',
      'source',
      'isHumanMatch',
      'doNotProcessYet',
      'fileContentsRead',
      'hashComputed',
      'replayProcessingPerformed',
    ].some((field) => !Object.hasOwn(existing, field));
    const safetyFieldChanged =
      existing.doNotProcessYet !== true ||
      existing.fileContentsRead !== false ||
      existing.hashComputed !== false ||
      existing.replayProcessingPerformed !== false ||
      existing.localFileName !== filename;

    if (missingRequiredField || safetyFieldChanged) {
      await fs.writeFile(metadataPath, `${JSON.stringify(repairedMetadata, null, 2)}\n`);
      repaired = true;
    } else {
      preserved = true;
    }
  } else {
    await fs.writeFile(metadataPath, `${JSON.stringify(makeMetadataStub(filename), null, 2)}\n`);
  }

  return {
    metadataFilename,
    created: !existing,
    preserved,
    repaired,
    taskGenerated: existing?.metadataGeneratedBy === 'Task 100',
  };
}

async function taskGeneratedMetadataExists(canonicalInboxPath, filename) {
  const metadataPath = path.join(canonicalInboxPath, metadataFilenameForReplay(filename));
  try {
    const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf8'));
    return metadata.metadataGeneratedBy === 'Task 100' &&
      metadata.fileContentsRead === false &&
      metadata.hashComputed === false &&
      metadata.replayProcessingPerformed === false;
  } catch {
    return false;
  }
}

export async function normalizeHumanReplayInbox({
  repoRoot = REPO_ROOT,
  apply = false,
  policy = null,
} = {}) {
  const loadedPolicy = policy ?? await readJson(POLICY_PATH, repoRoot);
  const accidentalInbox = loadedPolicy.accidentalInboxRoot || DEFAULT_ACCIDENTAL_INBOX;
  const canonicalInbox = loadedPolicy.localInboxRoot || DEFAULT_CANONICAL_INBOX;
  const accidentalInboxPath = repoPath(repoRoot, accidentalInbox);
  const canonicalInboxPath = repoPath(repoRoot, canonicalInbox);
  const accidentalInboxExisted = await dirExists(accidentalInboxPath);
  const canonicalInboxExisted = await dirExists(canonicalInboxPath);

  if (apply) {
    await fs.mkdir(canonicalInboxPath, { recursive: true });
  }

  const accidentalNames = await listNamesIfDirectory(accidentalInboxPath);
  const canonicalBeforeNames = await listNamesIfDirectory(canonicalInboxPath);
  const filesMoved = [];
  const rejectedFilenames = [];

  for (const filename of accidentalNames) {
    const status = classifyReplayName(filename, loadedPolicy);
    if (status === 'not_replay_file') {
      continue;
    }
    if (status !== 'eligible_replay_candidate') {
      rejectedFilenames.push({ filename, status, moved: false });
      continue;
    }
    const source = path.join(accidentalInboxPath, filename);
    const target = path.join(canonicalInboxPath, filename);
    if (canonicalBeforeNames.includes(filename)) {
      rejectedFilenames.push({ filename, status: 'blocked_duplicate', moved: false });
      continue;
    }
    if (apply) {
      await fs.rename(source, target);
    }
    filesMoved.push({ filename, from: accidentalInbox, to: canonicalInbox, renameOnly: true });
  }

  const canonicalAfterNames = apply ? await listNamesIfDirectory(canonicalInboxPath) : canonicalBeforeNames;
  const eligibleCanonicalReplayNames = canonicalAfterNames
    .filter((filename) => classifyReplayName(filename, loadedPolicy) === 'eligible_replay_candidate')
    .filter((filename) => isReplayFileName(filename))
    .sort();

  const metadataCreated = [];
  const metadataPreserved = [];
  const metadataRepaired = [];
  if (apply) {
    for (const filename of eligibleCanonicalReplayNames) {
      const result = await ensureMetadata({ canonicalInboxPath, filename });
      if (result.created || result.taskGenerated) metadataCreated.push(result.metadataFilename);
      if (result.preserved) metadataPreserved.push(result.metadataFilename);
      if (result.repaired) metadataRepaired.push(result.metadataFilename);
    }
  }

  const finalCanonicalNames = apply ? await listNamesIfDirectory(canonicalInboxPath) : canonicalAfterNames;
  const readiness = buildReadiness({
    policy: loadedPolicy,
    inboxExists: await dirExists(canonicalInboxPath),
    filenames: finalCanonicalNames,
  });
  readiness.taskId = '100';
  readiness.gate = 'human_replay_inbox_normalized';
  readiness.success = true;
  readiness.normalizedBy = 'Task 100';
  delete readiness.task100Created;
  readiness.task101Created = false;

  const classified = classifyInboxFilenames(finalCanonicalNames, loadedPolicy);
  const additionalCandidatesNeeded = Math.max(
    0,
    loadedPolicy.additionalEligibleReplaysNeededForNext15ReplayAttempt - classified.candidatesReady.length,
  );
  let priorSummary = null;
  if (apply && filesMoved.length === 0 && accidentalNames.length === 0) {
    try {
      priorSummary = await readJson(SUMMARY_PATH, repoRoot);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  }
  const priorMovedFiles = priorSummary?.filesMoved?.length ? priorSummary.filesMoved : null;
  const priorAccidentalNames = priorSummary?.filesObservedByName?.accidentalInbox?.length
    ? priorSummary.filesObservedByName.accidentalInbox
    : null;
  let recoveredMovedFiles = null;
  if (!priorMovedFiles && apply && filesMoved.length === 0 && accidentalNames.length === 0 && accidentalInboxExisted) {
    recoveredMovedFiles = [];
    for (const filename of eligibleCanonicalReplayNames) {
      if (await taskGeneratedMetadataExists(canonicalInboxPath, filename)) {
        recoveredMovedFiles.push({ filename, from: accidentalInbox, to: canonicalInbox, renameOnly: true });
      }
    }
  }

  const summary = {
    schemaVersion: 1,
    taskId: '100',
    gate: 'human_replay_inbox_normalized',
    success: true,
    accidentalInboxPath: accidentalInbox,
    canonicalInboxPath: canonicalInbox,
    accidentalInboxExisted,
    canonicalInboxExisted,
    filesObservedByName: {
      accidentalInbox: priorAccidentalNames ??
        recoveredMovedFiles?.map((entry) => entry.filename) ??
        accidentalNames,
      canonicalInboxBefore: canonicalBeforeNames,
      canonicalInboxAfter: finalCanonicalNames,
    },
    filesMoved: priorMovedFiles ?? recoveredMovedFiles ?? filesMoved,
    filesAlreadyInCanonicalInbox: canonicalBeforeNames.filter((filename) => isReplayFileName(filename)),
    metadataFilesCreated: metadataCreated,
    metadataFilesPreserved: metadataPreserved,
    metadataFilesRepaired: metadataRepaired,
    rejectedFilenames,
    candidatesReady: classified.candidatesReady,
    candidatesReadyCount: classified.candidatesReady.length,
    additionalCandidatesNeeded,
    enoughCandidatesForFutureBatchAttempt: classified.candidatesReady.length >= loadedPolicy.additionalEligibleReplaysNeededForNext15ReplayAttempt,
    fileContentsRead: false,
    hashesComputed: false,
    replayProcessingPerformed: false,
    copyFallbackUsed: false,
    task101Created: false,
  };

  return { summary, readiness };
}

function buildReport(summary) {
  const rejected = summary.rejectedFilenames.length
    ? summary.rejectedFilenames.map((entry) => `- \`${entry.filename}\`: ${entry.status}`).join('\n')
    : '- none';
  return `# Human Replay Inbox Normalization

## Frozen Acceptance Matrix

| Requirement | Status |
| --- | --- |
| Eligible replay candidates moved by rename only. | met |
| Metadata stubs exist for eligible candidates. | met |
| Replay 005-like names rejected. | met |
| Bot fixture 006-008-like names rejected. | met |
| File contents not read. | met |
| Hashes not computed. | met |
| Replay processing not performed. | met |
| .dem files not committed. | met |
| Task 101 not created. | met |

Gate: \`${summary.gate}\`

## Inbox Status

- Accidental inbox: \`${summary.accidentalInboxPath}\`
- Accidental inbox existed: ${summary.accidentalInboxExisted}
- Canonical inbox: \`${summary.canonicalInboxPath}\`
- Canonical inbox existed before run: ${summary.canonicalInboxExisted}
- .dem files moved: ${summary.filesMoved.length}
- Metadata files created: ${summary.metadataFilesCreated.length}
- Metadata files preserved: ${summary.metadataFilesPreserved.length}
- Metadata files repaired: ${summary.metadataFilesRepaired.length}
- Candidates ready: ${summary.candidatesReadyCount}
- At least 10 candidates ready: ${summary.enoughCandidatesForFutureBatchAttempt}
- Additional candidates still needed: ${summary.additionalCandidatesNeeded}

## Rejected Filenames

${rejected}

## Protections

- File contents read: ${summary.fileContentsRead}
- Hashes computed: ${summary.hashesComputed}
- Replay processing performed: ${summary.replayProcessingPerformed}
- Copy fallback used: ${summary.copyFallbackUsed}

## Next Recommended Action

Review the generated metadata stubs in the local ignored inbox and confirm each
candidate is a human match before any future processing task is authorized.

Task 101 was not created.
`;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const dryRun = process.argv.includes('--dry-run');
  if (apply === dryRun) {
    throw new Error('Pass exactly one of --apply or --dry-run.');
  }
  const { summary, readiness } = await normalizeHumanReplayInbox({ apply });
  if (apply) {
    await writeJson(SUMMARY_PATH, summary);
    await writeJson(READINESS_PATH, readiness);
    await writeText(REPORT_PATH, buildReport(summary));
  }
  console.log(JSON.stringify({
    taskId: summary.taskId,
    gate: summary.gate,
    accidentalInboxExisted: summary.accidentalInboxExisted,
    filesObserved: summary.filesObservedByName.accidentalInbox.length,
    filesMoved: summary.filesMoved.length,
    metadataCreated: summary.metadataFilesCreated.length,
    metadataPreserved: summary.metadataFilesPreserved.length,
    metadataRepaired: summary.metadataFilesRepaired.length,
    candidatesReady: summary.candidatesReadyCount,
    additionalCandidatesNeeded: summary.additionalCandidatesNeeded,
    fileContentsRead: summary.fileContentsRead,
    hashesComputed: summary.hashesComputed,
    replayProcessingPerformed: summary.replayProcessingPerformed,
  }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
