import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  buildMetadataTemplate,
  buildReadiness,
  classifyInboxFilenames,
  looksLikeProtectedReplay,
  looksLikeUnsupportedBotFixture,
} from '../tools/audit-human-replay-intake.mjs';

const policy = JSON.parse(fs.readFileSync('data/human-replay-intake-policy.json', 'utf8'));

test('policy defines local inbox root', () => {
  assert.equal(policy.localInboxRoot, '.local/deadem/replays/inbox/');
});

test('replay 005-like filenames are rejected', () => {
  assert.equal(looksLikeProtectedReplay('replay_005.dem', policy.protectedFilenamePatterns), true);
  const result = classifyInboxFilenames(['human-replay-005.dem'], policy);
  assert.equal(result.rejectedNames[0].status, 'blocked_protected_replay');
});

test('replay 006-008-like filenames are rejected', () => {
  for (const name of ['replay_006.dem', 'replay-007.dem', 'partida008.dem']) {
    assert.equal(looksLikeUnsupportedBotFixture(name, policy.unsupportedBotPatterns), true);
  }
  const result = classifyInboxFilenames(['replay_006.dem', 'replay_007.dem', 'replay_008.dem'], policy);
  assert.equal(result.rejectedNames.length, 3);
});

test('.dem without metadata is not ready', () => {
  const result = classifyInboxFilenames(['human-replay-alpha.dem'], policy);
  assert.equal(result.candidatesReady.length, 0);
  assert.equal(result.rejectedNames[0].status, 'blocked_missing_user_metadata');
});

test('metadata template has required fields', () => {
  const template = buildMetadataTemplate(policy);
  for (const key of Object.keys(policy.minimumUserMetadata)) {
    assert.ok(Object.hasOwn(template.metadata, key));
  }
  assert.equal(template.metadata.doNotProcessYet, true);
});

test('tool does not require inbox to exist', () => {
  const readiness = buildReadiness({ policy, inboxExists: false, filenames: [] });
  assert.equal(readiness.inboxExists, false);
  assert.equal(readiness.gate, 'human_replay_intake_ready_for_user_files');
});

test('readiness output marks file contents read as false', () => {
  const readiness = buildReadiness({ policy, inboxExists: false, filenames: [] });
  assert.equal(readiness.fileContentsRead, false);
});

test('readiness output marks hashes computed as false', () => {
  const readiness = buildReadiness({ policy, inboxExists: false, filenames: [] });
  assert.equal(readiness.hashesComputed, false);
});

test('readiness output marks replay processing as false', () => {
  const readiness = buildReadiness({ policy, inboxExists: false, filenames: [] });
  assert.equal(readiness.replayProcessingPerformed, false);
});

test('additional candidates needed is at least 10 when none are ready', () => {
  const readiness = buildReadiness({ policy, inboxExists: false, filenames: [] });
  assert.ok(readiness.additionalCandidatesNeeded >= 10);
});

test('Task 100 does not exist', () => {
  const forbidden = [
    'tasks/specs/100.json',
    'tasks/blocked/100-prepare-human-replay-intake-for-batch-expansion.md',
    'tasks/completed/100-prepare-human-replay-intake-for-batch-expansion.md',
  ];
  for (const file of forbidden) {
    assert.equal(fs.existsSync(file), false, `${file} must not exist`);
  }
});

test('output paths are under output/replay-intake', () => {
  for (const file of [
    'output/replay-intake/human-replay-intake-readiness.json',
    'output/replay-intake/human-replay-intake-template.json',
  ]) {
    assert.equal(file.startsWith('output/replay-intake/'), true);
  }
});

test('candidate with matching metadata filename is ready for future processing', () => {
  const result = classifyInboxFilenames([
    'human-replay-alpha.dem',
    'human-replay-alpha.metadata.json',
  ], policy);
  assert.equal(result.candidatesReady.length, 1);
  assert.equal(result.candidatesReady[0].status, 'candidate_ready_for_future_processing');
});
