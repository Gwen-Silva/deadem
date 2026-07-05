import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  auditReplaySpecificBranches,
  buildSyntheticOutcome,
  candidateFilenameToReplayId,
  committedOutputPathAllowed,
  decideGate,
  looksLikeProtectedReplay,
  looksLikeUnsupportedBotFixture,
  noForbiddenSemanticLayers,
  selectProcessingWindow,
  stableCandidateOrder,
} from '../tools/process-local-human-candidates-for-15-batch.mjs';

test('filename partida_010.dem maps to replay_010', () => {
  assert.equal(candidateFilenameToReplayId('partida_010.dem'), 'replay_010');
});

test('filename partida_020.dem maps to replay_020', () => {
  assert.equal(candidateFilenameToReplayId('partida_020.dem'), 'replay_020');
});

test('005-like filename is rejected', () => {
  assert.equal(looksLikeProtectedReplay('partida_005.dem'), true);
});

test('006-008-like filenames are rejected', () => {
  for (const filename of ['partida_006.dem', 'partida_007.dem', 'partida_008.dem']) {
    assert.equal(looksLikeUnsupportedBotFixture(filename), true);
  }
});

test('stable order processes candidates 010-020', () => {
  const input = ['partida_012.dem', 'partida_010.dem', 'partida_020.dem', 'partida_011.dem'];
  assert.deepEqual(stableCandidateOrder(input), ['partida_010.dem', 'partida_011.dem', 'partida_012.dem', 'partida_020.dem']);
});

test('processing stops after 10 accepted candidates', () => {
  const candidates = Array.from({ length: 11 }, (_, index) => ({ id: index, accepted: true }));
  const window = selectProcessingWindow(candidates);
  assert.equal(window.accepted.length, 10);
  assert.equal(window.reserve.length, 1);
});

test('reserve candidate is recorded when not needed', () => {
  const candidates = Array.from({ length: 11 }, (_, index) => ({ id: index, accepted: true }));
  const window = selectProcessingWindow(candidates);
  assert.deepEqual(window.reserve, [{ id: 10, accepted: true }]);
});

test('fewer than 10 successes produces blocked gate', () => {
  assert.equal(decideGate(9), 'factual_batch_15_candidate_processing_blocked');
});

test('exactly 10 new successes plus five pilot replays produces success gate', () => {
  assert.equal(decideGate(10), 'factual_batch_15_ready');
});

test('no copy fallback is allowed in synthetic blocked outcome', () => {
  const outcome = buildSyntheticOutcome({ acceptedCount: 0, failures: [{ copyFallbackUsed: false }] });
  assert.equal(outcome.gate, 'factual_batch_15_candidate_processing_blocked');
  assert.equal(outcome.failures[0].copyFallbackUsed, false);
});

test('.dem paths are not committed outputs', () => {
  assert.equal(committedOutputPathAllowed('output/factual-batches/x/replay.dem'), false);
});

test('.local paths are not committed outputs', () => {
  assert.equal(committedOutputPathAllowed('.local/deadem/cache/file.json'), false);
});

test('replay 002 acceptance uses v9 gate in generated tool source', () => {
  const source = fs.readFileSync('tools/process-local-human-candidates-for-15-batch.mjs', 'utf8');
  assert.match(source, /output\/replay-002-canonical-v9-validation\/terminal-release-verification\.json/u);
});

test('no forbidden semantic layers are emitted in compact sample', () => {
  assert.equal(noForbiddenSemanticLayers({ categoryCoverage: [], factual: true }), true);
});

test('branch audit detects synthetic hardcode', () => {
  const audit = auditReplaySpecificBranches('if (replayId === "replay_010") { return "special"; }');
  assert.equal(audit.passed, false);
});

test('Task 102 does not exist', () => {
  for (const file of ['tasks/specs/102.json', 'tasks/blocked/102-next.md', 'tasks/completed/102-next.md']) {
    assert.equal(fs.existsSync(file), false, `${file} must not exist`);
  }
});
