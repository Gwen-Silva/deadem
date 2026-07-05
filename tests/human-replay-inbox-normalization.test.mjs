import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { normalizeHumanReplayInbox } from '../tools/normalize-human-replay-inbox.mjs';

const basePolicy = JSON.parse(await fs.readFile('data/human-replay-intake-policy.json', 'utf8'));

async function fixtureRoot(name) {
  const root = path.join('.local', 'codex', '100', name);
  await fs.rm(root, { recursive: true, force: true });
  await fs.mkdir(root, { recursive: true });
  return root;
}

async function makePolicy(root) {
  const policy = {
    ...basePolicy,
    accidentalInboxRoot: 'replays/inbox/',
    localInboxRoot: '.local/deadem/replays/inbox/',
  };
  await fs.mkdir(path.join(root, 'data'), { recursive: true });
  await fs.writeFile(path.join(root, 'data', 'human-replay-intake-policy.json'), `${JSON.stringify(policy, null, 2)}\n`);
  return policy;
}

async function writeSyntheticReplay(root, relativePath) {
  const fullPath = path.join(root, relativePath);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, 'synthetic replay filename fixture only\n');
}

test('eligible .dem filename is moved from accidental inbox to canonical inbox by rename', async () => {
  const root = await fixtureRoot('move-eligible');
  await makePolicy(root);
  await writeSyntheticReplay(root, 'replays/inbox/partida_010.dem');
  const { summary } = await normalizeHumanReplayInbox({ repoRoot: root, apply: true });
  assert.deepEqual(summary.filesMoved.map((entry) => entry.filename), ['partida_010.dem']);
  await assert.rejects(fs.stat(path.join(root, 'replays/inbox/partida_010.dem')), { code: 'ENOENT' });
  assert.ok(await fs.stat(path.join(root, '.local/deadem/replays/inbox/partida_010.dem')));
});

test('metadata is created for eligible .dem', async () => {
  const root = await fixtureRoot('metadata-created');
  await makePolicy(root);
  await writeSyntheticReplay(root, 'replays/inbox/partida_011.dem');
  const { summary } = await normalizeHumanReplayInbox({ repoRoot: root, apply: true });
  assert.deepEqual(summary.metadataFilesCreated, ['partida_011.metadata.json']);
  const metadata = JSON.parse(await fs.readFile(path.join(root, '.local/deadem/replays/inbox/partida_011.metadata.json'), 'utf8'));
  assert.equal(metadata.localFileName, 'partida_011.dem');
  assert.equal(metadata.doNotProcessYet, true);
});

test('existing valid metadata is preserved', async () => {
  const root = await fixtureRoot('metadata-preserved');
  await makePolicy(root);
  await writeSyntheticReplay(root, '.local/deadem/replays/inbox/partida_012.dem');
  const metadata = {
    schemaVersion: 1,
    candidateId: 'custom_candidate',
    localFileName: 'partida_012.dem',
    source: 'user_supplied_local_file',
    isHumanMatch: true,
    knownReplayId: null,
    notes: 'User note',
    doNotProcessYet: true,
    fileContentsRead: false,
    hashComputed: false,
    replayProcessingPerformed: false,
  };
  await fs.writeFile(path.join(root, '.local/deadem/replays/inbox/partida_012.metadata.json'), `${JSON.stringify(metadata, null, 2)}\n`);
  const { summary } = await normalizeHumanReplayInbox({ repoRoot: root, apply: true });
  assert.deepEqual(summary.metadataFilesPreserved, ['partida_012.metadata.json']);
  const preserved = JSON.parse(await fs.readFile(path.join(root, '.local/deadem/replays/inbox/partida_012.metadata.json'), 'utf8'));
  assert.equal(preserved.candidateId, 'custom_candidate');
});

test('metadata with missing fields is repaired without setting doNotProcessYet false', async () => {
  const root = await fixtureRoot('metadata-repaired');
  await makePolicy(root);
  await writeSyntheticReplay(root, '.local/deadem/replays/inbox/partida_013.dem');
  await fs.writeFile(path.join(root, '.local/deadem/replays/inbox/partida_013.metadata.json'), '{"candidateId":"partida_013","doNotProcessYet":false}\n');
  const { summary } = await normalizeHumanReplayInbox({ repoRoot: root, apply: true });
  assert.deepEqual(summary.metadataFilesRepaired, ['partida_013.metadata.json']);
  const repaired = JSON.parse(await fs.readFile(path.join(root, '.local/deadem/replays/inbox/partida_013.metadata.json'), 'utf8'));
  assert.equal(repaired.doNotProcessYet, true);
  assert.equal(repaired.fileContentsRead, false);
});

test('replay 005-like filename is rejected', async () => {
  const root = await fixtureRoot('reject-005');
  await makePolicy(root);
  await writeSyntheticReplay(root, 'replays/inbox/partida_005.dem');
  const { summary } = await normalizeHumanReplayInbox({ repoRoot: root, apply: true });
  assert.equal(summary.rejectedFilenames[0].status, 'blocked_protected_replay');
  assert.equal(summary.filesMoved.length, 0);
});

test('replay 006-008-like filenames are rejected', async () => {
  const root = await fixtureRoot('reject-bots');
  await makePolicy(root);
  for (const name of ['partida_006.dem', 'partida_007.dem', 'partida_008.dem']) {
    await writeSyntheticReplay(root, `replays/inbox/${name}`);
  }
  const { summary } = await normalizeHumanReplayInbox({ repoRoot: root, apply: true });
  assert.equal(summary.rejectedFilenames.length, 3);
  assert.ok(summary.rejectedFilenames.every((entry) => entry.status === 'blocked_unsupported_bot_fixture'));
});

test('no file contents are read in the classifier path', async () => {
  const root = await fixtureRoot('no-contents');
  await makePolicy(root);
  await writeSyntheticReplay(root, 'replays/inbox/partida_014.dem');
  const { summary } = await normalizeHumanReplayInbox({ repoRoot: root, apply: true });
  assert.equal(summary.fileContentsRead, false);
});

test('no hash is computed', async () => {
  const root = await fixtureRoot('no-hash');
  await makePolicy(root);
  await writeSyntheticReplay(root, 'replays/inbox/partida_015.dem');
  const { summary } = await normalizeHumanReplayInbox({ repoRoot: root, apply: true });
  assert.equal(summary.hashesComputed, false);
});

test('readiness counts candidates with metadata as ready', async () => {
  const root = await fixtureRoot('ready-count');
  await makePolicy(root);
  await writeSyntheticReplay(root, 'replays/inbox/partida_016.dem');
  const { readiness } = await normalizeHumanReplayInbox({ repoRoot: root, apply: true });
  assert.equal(readiness.candidatesReadyCount, 1);
});

test('missing metadata is created automatically', async () => {
  const root = await fixtureRoot('missing-metadata');
  await makePolicy(root);
  await writeSyntheticReplay(root, '.local/deadem/replays/inbox/partida_017.dem');
  const { summary } = await normalizeHumanReplayInbox({ repoRoot: root, apply: true });
  assert.deepEqual(summary.metadataFilesCreated, ['partida_017.metadata.json']);
});

test('.gitignore protects replays/ and .local/', async () => {
  const gitignore = await fs.readFile('.gitignore', 'utf8');
  assert.match(gitignore, /^replays\/$/m);
  assert.match(gitignore, /^\.local\/$/m);
});

test('Task 101 does not exist', async () => {
  for (const file of ['tasks/specs/101.json', 'tasks/blocked/101-next.md', 'tasks/completed/101-next.md']) {
    await assert.rejects(fs.stat(file), { code: 'ENOENT' });
  }
});
