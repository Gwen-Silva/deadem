#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..');
const POLICY_PATH = 'data/human-replay-intake-policy.json';
const OUTPUT_ROOT = 'output/replay-intake';
const READINESS_PATH = `${OUTPUT_ROOT}/human-replay-intake-readiness.json`;
const TEMPLATE_PATH = `${OUTPUT_ROOT}/human-replay-intake-template.json`;
const REPORT_PATH = 'reports/human-replay-intake-for-batch-expansion.md';

const PROTECTED_REPLAY_ID = 'replay_005';
const UNSUPPORTED_BOT_REPLAY_IDS = new Set(['replay_006', 'replay_007', 'replay_008']);

export function normalizeCandidateName(name) {
  return name.toLowerCase().replaceAll('\\', '/');
}

export function isReplayFileName(name) {
  return normalizeCandidateName(name).endsWith('.dem');
}

export function isMetadataFileName(name) {
  const normalized = normalizeCandidateName(name);
  return normalized.endsWith('.metadata.json') || normalized.endsWith('.replay-metadata.json');
}

export function looksLikeProtectedReplay(name, patterns = []) {
  const normalized = normalizeCandidateName(name);
  if (normalized.includes('005')) {
    return patterns.some((pattern) => normalized.includes(pattern.toLowerCase())) ||
      /(^|[^0-9])005([^0-9]|$)/u.test(normalized);
  }
  return false;
}

export function looksLikeUnsupportedBotFixture(name, patterns = []) {
  const normalized = normalizeCandidateName(name);
  if (patterns.some((pattern) => normalized.includes(pattern.toLowerCase()))) {
    return true;
  }
  return /(^|[^0-9])00[6-8]([^0-9]|$)/u.test(normalized);
}

function baseNameWithoutReplayExtension(name) {
  const normalized = name.replace(/\.dem$/iu, '');
  return normalized.toLowerCase();
}

function metadataKeysForName(name) {
  const normalized = name.toLowerCase();
  return [
    normalized.replace(/\.metadata\.json$/iu, ''),
    normalized.replace(/\.replay-metadata\.json$/iu, ''),
  ];
}

export function classifyInboxFilenames(filenames, policy) {
  const metadataKeys = new Set(
    filenames
      .filter((name) => isMetadataFileName(name))
      .flatMap((name) => metadataKeysForName(name)),
  );
  const replayNames = filenames.filter((name) => isReplayFileName(name));
  const seenReplayNames = new Set();
  const entries = [];

  for (const filename of replayNames) {
    let status = 'candidate_pending_metadata';
    const limitations = [];
    const normalizedReplayBase = baseNameWithoutReplayExtension(filename);

    if (looksLikeProtectedReplay(filename, policy.protectedFilenamePatterns)) {
      status = 'blocked_protected_replay';
      limitations.push('filename resembles protected replay 005');
    } else if (looksLikeUnsupportedBotFixture(filename, policy.unsupportedBotPatterns)) {
      status = 'blocked_unsupported_bot_fixture';
      limitations.push('filename resembles unsupported bot fixture 006-008');
    } else if (seenReplayNames.has(normalizeCandidateName(filename))) {
      status = 'blocked_duplicate';
      limitations.push('duplicate replay filename');
    } else if (!metadataKeys.has(normalizedReplayBase)) {
      status = 'blocked_missing_user_metadata';
      limitations.push('matching metadata filename not observed');
    } else {
      status = 'candidate_ready_for_future_processing';
      limitations.push('future processing still requires explicit authorization');
    }

    seenReplayNames.add(normalizeCandidateName(filename));
    entries.push({
      filename,
      status,
      metadataEntryFoundByFilename: metadataKeys.has(normalizedReplayBase),
      readyForFutureProcessing: status === 'candidate_ready_for_future_processing',
      limitations,
    });
  }

  const metadataEntriesFound = filenames
    .filter((name) => isMetadataFileName(name))
    .map((name) => ({
      filename: name,
      contentRead: false,
    }));

  return {
    filenamesObserved: [...filenames].sort(),
    replayFilenamesObserved: replayNames.sort(),
    metadataEntriesFound,
    rejectedNames: entries.filter((entry) => entry.status.startsWith('blocked_')),
    candidateEntries: entries,
    candidatesReady: entries.filter((entry) => entry.readyForFutureProcessing),
  };
}

export function buildMetadataTemplate(policy) {
  return {
    schemaVersion: 1,
    templatePurpose: 'human_replay_candidate_metadata',
    localInboxRoot: policy.localInboxRoot,
    metadata: {
      ...policy.minimumUserMetadata,
      candidateId: 'human_replay_short_label',
      localFileName: 'human-replay-short-label.dem',
      source: 'user_supplied_local_file',
      notes: 'Describe match source, approximate date, and why it is a human match.',
    },
    policyReminder: {
      doNotProcessYetMustRemainTrue: true,
      replay005MustNotBeIncluded: true,
      botFixtures006To008MustNotBeIncluded: true,
      replayHashNotRequiredForIntake: true,
      fileContentsMustNotBeReadByIntakeAudit: true,
    },
  };
}

async function readJson(relativePath) {
  const fullPath = path.join(REPO_ROOT, relativePath);
  return JSON.parse(await fs.readFile(fullPath, 'utf8'));
}

async function writeJson(relativePath, value) {
  const fullPath = path.join(REPO_ROOT, relativePath);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeText(relativePath, value) {
  const fullPath = path.join(REPO_ROOT, relativePath);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, value);
}

async function inboxStatus(policy) {
  const inboxPath = path.join(REPO_ROOT, policy.localInboxRoot);
  let exists = false;
  let filenames = [];

  try {
    const stat = await fs.stat(inboxPath);
    exists = stat.isDirectory();
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }

  if (exists) {
    filenames = (await fs.readdir(inboxPath)).sort();
  }

  return { exists, filenames };
}

export function buildReadiness({ policy, inboxExists, filenames }) {
  const classified = classifyInboxFilenames(filenames, policy);
  const candidatesReadyCount = classified.candidatesReady.length;
  const additionalCandidatesNeeded = Math.max(
    0,
    policy.additionalEligibleReplaysNeededForNext15ReplayAttempt - candidatesReadyCount,
  );
  const gate = 'human_replay_intake_ready_for_user_files';

  return {
    schemaVersion: 1,
    taskId: '099',
    gate,
    success: true,
    inboxRoot: policy.localInboxRoot,
    inboxExists,
    filenamesObserved: classified.filenamesObserved,
    rejectedNames: classified.rejectedNames,
    metadataEntriesFound: classified.metadataEntriesFound,
    candidatesReady: classified.candidatesReady,
    candidatesReadyCount,
    additionalCandidatesNeeded,
    replay005Touched: false,
    botFixturesProcessed: false,
    fileContentsRead: false,
    hashesComputed: false,
    replayProcessingPerformed: false,
    task100Created: false,
    nextActionForHumanUser: inboxExists
      ? 'Add one metadata JSON for each new human replay filename, keeping doNotProcessYet true.'
      : `Create ${policy.localInboxRoot} locally and place future human replay files plus metadata JSON entries there.`,
  };
}

function buildReport(readiness) {
  return `# Human Replay Intake For Batch Expansion

## Frozen Acceptance Matrix

| Requirement | Status |
| --- | --- |
| Intake policy exists. | met |
| Documentation exists. | met |
| Audit tool exists. | met |
| Readiness output exists. | met |
| Replay 005 not touched. | met |
| Bot fixtures 006-008 not processed. | met |
| File contents not read. | met |
| Hashes not computed. | met |
| Replay processing not performed. | met |
| Task 100 not created. | met |

Gate: \`${readiness.gate}\`

Task 098 blocked because the 15-replay target had only 5 included accepted
human replays and still needs 10 additional eligible generated human replay
entries.

## Intake Status

- Inbox root: \`${readiness.inboxRoot}\`
- Inbox exists: ${readiness.inboxExists}
- Candidate filenames observed: ${readiness.filenamesObserved.length}
- Candidates ready: ${readiness.candidatesReadyCount}
- Additional candidates needed: ${readiness.additionalCandidatesNeeded}

## Protection Status

- Replay 005 touched: ${readiness.replay005Touched}
- Bot fixtures processed: ${readiness.botFixturesProcessed}
- File contents read: ${readiness.fileContentsRead}
- Hashes computed: ${readiness.hashesComputed}
- Replay processing performed: ${readiness.replayProcessingPerformed}

## Next User Action

${readiness.nextActionForHumanUser}

Task 100 was not created.
`;
}

async function main() {
  const clean = process.argv.includes('--clean');
  const policy = await readJson(POLICY_PATH);
  if (clean) {
    await fs.rm(path.join(REPO_ROOT, OUTPUT_ROOT), { recursive: true, force: true });
  }

  const { exists, filenames } = await inboxStatus(policy);
  const readiness = buildReadiness({ policy, inboxExists: exists, filenames });
  const template = buildMetadataTemplate(policy);

  await writeJson(READINESS_PATH, readiness);
  await writeJson(TEMPLATE_PATH, template);
  await writeText(REPORT_PATH, buildReport(readiness));

  console.log(JSON.stringify({
    taskId: readiness.taskId,
    gate: readiness.gate,
    inboxExists: readiness.inboxExists,
    candidateFilenamesObserved: readiness.filenamesObserved.length,
    candidatesReady: readiness.candidatesReadyCount,
    additionalCandidatesNeeded: readiness.additionalCandidatesNeeded,
    replayProcessingPerformed: readiness.replayProcessingPerformed,
  }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
