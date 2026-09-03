import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { TARGETS, ROOT, OUTPUT, assertTarget, resolveInput, selectUnique, validateHeader, sha256File } from '../tools/review-onboarding/inputs.mjs';
import { ACCEPTED_TASK210, BRIDGE_FILES, BRIDGE_DIR, sha256, validateAnchors, fitModel, selectModel, selectSegmentedModel, mapReplayToVod, validateBridge, loadTask210Bridges, mapReplayToReviewContext } from '../tools/review-onboarding/timeline.mjs';
import { calibrateRawOrigin, replayCoordinateFromTimer } from '../tools/review-onboarding/anchors.mjs';
import { technicalGate } from '../tools/review-onboarding/emit.mjs';
import { assertReviewTargetId, positiveCounterDeltas, validateMonotonicTimeline, processFactualTarget, snapshot, objectiveRows, derive } from '../tools/emit-minimum-factual-review-telemetry.mjs';

const entry = (name, file = true, symlink = false) => ({ name, isFile: () => file, isSymbolicLink: () => symlink });
const anchorSet = (slope = 1, intercept = 20, start = 0) => Array.from({ length: 12 }, (_, i) => ({ anchorId: `a${start}_${i}`, replayElapsedSeconds: start + i * 100, vodTimeSeconds: slope * (start + i * 100) + intercept, role: i % 2 ? 'validation' : 'fit', region: ['start', 'start', 'early', 'early', 'mid', 'mid', 'mid', 'mid', 'late', 'late', 'end', 'end'][i], uncertaintySeconds: 0.5, evidence: { replay: 'synthetic_raw_observation', vod: 'synthetic_independent_visual_observation' } }));
const bridgeFixture = () => ({ taskId: '210', reviewTargetId: TARGETS[0], associationSupported: true, validationUsedInFit: false, precisionStatus: 'preferred_precision', slope: 2, interceptSeconds: 10, estimatedOperationalSyncErrorSeconds: 0.2, craigRangeSeconds: { start: 0, end: 1000 }, vodRangeSeconds: { start: 10, end: 2010 } });
const json = async ref => JSON.parse(await readFile(path.join(ROOT, ref)));

test('only 003 and 004 are authorized; protected and unsupported IDs cause zero filesystem calls', async () => {
    let calls = 0;
    const io = { readdir() { calls++; }, realpath() { calls++; }, lstat() { calls++; } };
    for (const id of ['replay_005', 'replay_006', 'replay_007', 'replay_008', 'review_match_005', 'review_match_001', '../review_match_003']) await assert.rejects(resolveInput(id, 'replay', io));
    assert.equal(calls, 0);
    for (const id of TARGETS) assert.equal(assertTarget(id), id);
});
test('unique .dem and .mp4 resolution is non-recursive and rejects zero/multiple/link/directory/protected aliases', () => {
    for (const ext of ['.dem', '.mp4']) {
        assert.equal(selectUnique([entry('one' + ext), entry('subdir', false)], ext), 'one' + ext);
        for (const entries of [[], [entry('a' + ext), entry('b' + ext)], [entry('a' + ext, false)], [entry('a' + ext, true, true)], [entry('replay_005' + ext)]]) assert.throws(() => selectUnique(entries, ext));
    }
});
test('redirected input directory fails before enumeration', async () => {
    let listed = false;
    await assert.rejects(resolveInput(TARGETS[0], 'replay', { realpath: async () => 'C:/outside', readdir: async () => { listed = true; } }), /redirected/);
    assert.equal(listed, false);
});
test('PBDEMS2 header validates exact magic and in-file summary pointer', () => {
    const bytes = Buffer.alloc(16); bytes.write('PBDEMS2\0'); bytes.writeUInt32LE(32, 8);
    assert.equal(validateHeader(bytes, 100).magic, 'PBDEMS2');
    assert.throws(() => validateHeader(bytes.subarray(0, 7), 100));
    assert.throws(() => validateHeader(bytes, 32));
    bytes[0] = 0; assert.throws(() => validateHeader(bytes, 100));
});
test('streaming SHA checks independent synthetic replay/video bytes without media access', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'deadem-211-test-'));
    try {
        for (const name of ['synthetic.dem', 'synthetic.mp4']) {
            const bytes = Buffer.from('synthetic-only-' + name), file = path.join(dir, name);
            await writeFile(file, bytes);
            assert.equal(await sha256File(file), sha256(bytes));
        }
    } finally { await rm(dir, { recursive: true }); }
});
test('Task199 default allowlist and protected rejection remain intact without parsing real files', async () => {
    assert.equal(assertReviewTargetId('review_match_001'), 'review_match_001');
    assert.throws(() => assertReviewTargetId(TARGETS[0]));
    await assert.rejects(processFactualTarget({ reviewTargetId: 'replay_005' }, { targetValidator: id => id }), /protected/);
});
test('monotonic 1Hz rows and only positive aggregate deltas retain safe semantics', () => {
    assert.equal(validateMonotonicTimeline([{ elapsedSeconds: 0, sourceTick: 1 }, { elapsedSeconds: 1, sourceTick: 64 }]).monotonic, true);
    assert.equal(validateMonotonicTimeline([{ elapsedSeconds: 1, sourceTick: 64 }, { elapsedSeconds: 1, sourceTick: 63 }]).monotonic, false);
    const rows = positiveCounterDeltas({ a: 8, b: 4 }, { a: 10, b: 3 }, { fields: ['a', 'b'], participantKey: 'controller:1' });
    assert.equal(rows.length, 1); assert.equal(rows[0].delta, 2);
    assert.equal(rows[0].semanticClass, 'aggregate_counter_delta');
    assert.equal('victim' in rows[0], false);
});
test('real reusable sampler preserves raw local refs, zero health, objectives and positions without promotion', () => {
    const entity = (handle, values) => ({ handle, getField: name => values[name] });
    const c = entity(10, { m_hHeroPawn: 20, m_iTeamNum: 2, m_nHeroID: 7, m_lifeState: 2, m_iDeaths: 1, m_iGoldNetWorth: 100 });
    const pawn = entity(20, { m_iHealth: 0, m_vecAbsOrigin: { x: 3, y: 4, z: 5 } });
    const structure = entity(30, { m_iHealth: 0 });
    const p = { getDemo: () => ({ getEntitiesByClassName: name => name === 'CCitadelPlayerController' ? [c] : name === 'CCitadelPlayerPawn' ? [pawn] : name === 'CNPC_Boss_Tier2' ? [structure] : [] }) };
    const rows = snapshot(p, TARGETS[0], 1, 64);
    assert.equal(rows[0].participantKey, 'controller:10'); assert.equal(rows[0].health, 0); assert.equal(rows[0].pawnRef, 20);
    const prior = new Map([['controller:10', { ...rows[0], elapsedSeconds: 0, position: { x: 0, y: 0, z: 0 } }]]);
    const d = derive(rows, prior), objectives = objectiveRows(p, TARGETS[0], 1, 64);
    assert.equal(d.positions[0].displacement2d, 5); assert.equal(d.positions[0].approximateSpeed2d, 5);
    assert.equal(d.positions[0].provenanceClass, 'factual/replay_observed_position_with_derived_metrics');
    assert.equal(objectives[0].health, 0);
    for (const r of [...rows, ...d.life, ...d.positions, ...objectives]) for (const forbidden of ['playerName', 'playerId', 'confirmedDeath', 'killer', 'victim', 'objectiveCompleted', 'mapRegion', 'lane', 'namedArea']) assert.equal(forbidden in r, false);
});
test('anchors require six independent fit/validation and start through end coverage', () => {
    validateAnchors(anchorSet());
    assert.throws(() => validateAnchors(anchorSet().slice(1)), /six/);
    const duplicate = anchorSet(); duplicate[1].replayElapsedSeconds = duplicate[0].replayElapsedSeconds;
    assert.throws(() => validateAnchors(duplicate), /duplicate/);
    assert.throws(() => validateAnchors(anchorSet().map(a => ({ ...a, region: 'start' }))), /distributed/);
});
test('offset and affine parameters never use validation values', () => {
    const a = anchorSet(1.01, 12);
    assert.ok(Math.abs(fitModel(a, 'affine').slope - 1.01) < 1e-12);
    const mutated = a.map(r => r.role === 'validation' ? { ...r, vodTimeSeconds: 99999 } : r);
    assert.deepEqual(fitModel(a, 'affine'), fitModel(mutated, 'affine'));
    assert.deepEqual(fitModel(a, 'offset_only'), fitModel(mutated, 'offset_only'));
});
test('model selection prefers simple offset and selects affine only for material held-out gain', () => {
    assert.equal(selectModel(anchorSet()).selectedModel, 'offset_only');
    assert.equal(selectModel(anchorSet(1.01, 20)).selectedModel, 'affine');
    assert.equal(selectModel(anchorSet(1.00001, 20)).selectedModel, 'offset_only');
});
test('unusable validation prevents mapped output', () => {
    const a = anchorSet().map(r => r.role === 'validation' ? { ...r, vodTimeSeconds: r.vodTimeSeconds + 10 } : r);
    const m = selectModel(a); assert.equal(m.precisionStatus, 'unusable_precision');
    assert.equal(mapReplayToVod(m, 100).mapped, false);
});
test('forward mapping includes exact bounded edges and rejects invalid/outside times', () => {
    const m = selectModel(anchorSet());
    assert.equal(mapReplayToVod(m, 0).seconds, 20);
    assert.equal(mapReplayToVod(m, 1100).seconds, 1120);
    for (const t of [-0.001, 1100.001, NaN, Infinity]) assert.equal(mapReplayToVod(m, t).mapped, false);
});
test('segmentation needs independent discontinuity evidence and material validation improvement', () => {
    const groups = [{ segmentId: 'before', anchors: anchorSet() }, { segmentId: 'after', anchors: anchorSet(1, 50, 1300) }];
    const global = selectModel(groups.flatMap(g => g.anchors));
    assert.throws(() => selectSegmentedModel(groups, {}, global), /independent_discontinuity/);
    const segmented = selectSegmentedModel(groups, { independentObservation: true, replayEvidence: 'synthetic discontinuity', vodEvidence: 'independent synthetic freeze', gaps: [[1100, 1300]] }, global);
    assert.equal(segmented.selectedModel, 'segmented');
    assert.equal(mapReplayToVod(segmented, 1200).mapped, false);
    assert.equal(mapReplayToVod(segmented, 1500).seconds, 1550);
});
test('Task210 bridge validates identity metadata, slope, error and consistent coverage', () => {
    assert.equal(validateBridge(bridgeFixture(), TARGETS[0]).slope, 2);
    for (const mutation of [{ slope: 0 }, { slope: NaN }, { taskId: '209' }, { reviewTargetId: TARGETS[1] }, { validationUsedInFit: true }, { estimatedOperationalSyncErrorSeconds: -1 }, { vodRangeSeconds: { start: 0, end: 2010 } }]) assert.throws(() => validateBridge({ ...bridgeFixture(), ...mutation }, TARGETS[0]));
});
test('composition supports slope != 1 and preserves separate uncertainty units', () => {
    const model = selectModel(anchorSet());
    const b = validateBridge(bridgeFixture(), TARGETS[0]);
    const timeline = { targets: [{ reviewTargetId: TARGETS[0], replayVodModel: model, task210Bridge: b }] };
    const p = mapReplayToReviewContext(timeline, { reviewTargetId: TARGETS[0], replayElapsedSeconds: 100 });
    assert.equal(p.vod.seconds, 120); assert.equal(p.craig.recordingSeconds, 55);
    assert.equal(p.craig.operationalErrorSeconds, (model.estimatedOperationalReplayVodErrorSeconds + 0.2) / 2);
    assert.deepEqual(p.semantics, { replay: 'replay_elapsed_time', vod: 'vod_media_time', craig: 'craig_recording_time' });
    assert.equal('browserDrift' in p, false);
    const outside = mapReplayToReviewContext(timeline, { reviewTargetId: TARGETS[0], replayElapsedSeconds: -1 });
    assert.equal(outside.vod.mapped || outside.craig.mapped, false);
    b.vodRangeSeconds.start = 500;
    assert.equal(mapReplayToReviewContext(timeline, { reviewTargetId: TARGETS[0], replayElapsedSeconds: 100 }).craig.mapped, false);
});
test('raw origin calibration uses replay transitions only and fails inconsistent timing', () => {
    const rows = [
        { elapsedSeconds: 0, tickRate: 64, values: { m_eGameState: 6, m_nPauseStartTick: 0, m_nTotalPausedTicks: 0 } },
        { elapsedSeconds: 1, tickRate: 64, values: { m_eGameState: 7, m_flGameStateStartTime: 20.5, m_nPauseStartTick: 0, m_nTotalPausedTicks: 0 } },
        { elapsedSeconds: 2, tickRate: 64, values: { m_eGameState: 8, m_flGameStateStartTime: 21.5, m_nPauseStartTick: 0, m_nTotalPausedTicks: 0 } }
    ];
    assert.equal(calibrateRawOrigin(rows).seconds, 20);
    rows[2].values.m_flGameStateStartTime = 999;
    assert.throws(() => calibrateRawOrigin(rows), /inconsistent/);
});
test('visual timer yields no coordinate during a frozen plateau or unsupported state', () => {
    const r = { elapsedSeconds: 30.5, tickRate: 64, values: { m_bGamePaused: false, m_eGameState: 7, m_flGameStartTime: 50, m_nTotalPausedTicks: 0 } };
    assert.equal(replayCoordinateFromTimer([r], { seconds: 20 }, 0).replayElapsedSeconds, 30.5);
    r.values.m_bGamePaused = true;
    assert.throws(() => replayCoordinateFromTimer([r], { seconds: 20 }, 0), /not_unique/);
});
test('accepted Task210 five compact artifacts are byte-identical and two bridges load', async () => {
    const loaded = await loadTask210Bridges();
    assert.equal(loaded.identities.length, 5); assert.equal(loaded.targets.length, 2);
    for (const name of BRIDGE_FILES) {
        const ref = `${BRIDGE_DIR}/${name}`;
        assert.deepEqual(await readFile(path.join(ROOT, ref)), execFileSync('git', ['show', `${ACCEPTED_TASK210}:${ref}`], { cwd: ROOT, windowsHide: true }));
    }
});
test('real compact intake and telemetry establish four input hashes and two useful monotonic timelines', async () => {
    const m = await json(`${OUTPUT}/manifest.json`), t = await json(`${OUTPUT}/telemetry-summary.json`), av = await json(`${OUTPUT}/availability.json`);
    assert.deepEqual(m.targets.map(t => t.reviewTargetId), TARGETS);
    for (const target of m.targets) {
        for (const input of [target.replay, target.video]) { assert.match(input.sha256, /^[0-9a-f]{64}$/); assert.ok(input.sizeBytes > 0); }
        assert.equal(target.replay.header.magic, 'PBDEMS2'); assert.ok(target.video.durationSeconds > 0);
        assert.equal(target.identityMetadata.playerNames, null);
    }
    for (const target of t.targets) {
        assert.equal(target.replayCoverage.monotonic, true); assert.equal(target.gapCount, 0);
        assert.equal(target.parser.tickRate, 64); assert.ok(target.counts.participantLocalRefCount > 0);
        assert.ok(target.counts.lifeState > 0 && target.counts.netWorth > 0 && target.counts.damage > 0);
        assert.equal('players' in target.counts, false); assert.deepEqual(target.analystInference, []);
        const available = av.targets.find(t => t.reviewTargetId === target.reviewTargetId).availability;
        assert.ok(Object.entries(available).filter(([k, v]) => k !== 'time' && v.rows > 0).length >= 2);
    }
});
test('real frozen anchors, safe semantics, bounded mapping and independent pause checks validate', async () => {
    const v = await json(`${OUTPUT}/replay-vod-validation.json`), u = await json(`${OUTPUT}/unified-timeline.json`);
    for (const target of v.targets) {
        validateAnchors(target.anchors); assert.equal(target.fit.count, 6); assert.equal(target.validation.count, 6);
        assert.ok(target.validation.mae <= 0.5 && target.validation.p90 <= 1 && target.validation.max <= 2);
        assert.ok(target.estimatedOperationalReplayVodErrorSeconds > target.validation.max);
        assert.ok(target.discontinuityCheck.pauseChecks.every(c => c.passed));
    }
    for (const t of u.targets) {
        const c = t.composition;
        assert.equal(c.composedOperationalErrorSeconds, (c.replayVodMappingErrorSeconds + c.craigVodMappingErrorSeconds) / Math.abs(t.task210Bridge.slope));
        assert.equal(c.uncertaintyPolicy, 'conservative_operational_sum_not_statistical_confidence_bound');
        assert.equal(c.browserTransportDriftIncluded, false);
        assert.equal(mapReplayToReviewContext(u, { reviewTargetId: t.reviewTargetId, replayElapsedSeconds: t.replayVodModel.coveredReplayRange.start }).craig.mapped, true);
        assert.equal(mapReplayToReviewContext(u, { reviewTargetId: t.reviewTargetId, replayElapsedSeconds: 0 }).vod.mapped, false);
    }
});
test('compact privacy audit forbids ASR, final fact, automatic attribution, inference and protected access', async () => {
    const a = await json(`${OUTPUT}/provenance-audit.json`);
    for (const k of ['asrExecutionCount', 'craigRefitCount', 'candidateGenerationCount', 'workspaceMutationCount', 'finalFactCount', 'automaticAttributionCount', 'gameplayInterpretationCount', 'protectedReplayAccessCount', 'heavyBinariesVersioned', 'privateTranscriptsVersioned']) assert.equal(a[k], 0);
    assert.equal(a.humanContextUsedAsFactualReplayInput, false); assert.deepEqual(a.analystInference, []);
    for (const name of ['manifest.json', 'telemetry-summary.json', 'availability.json', 'replay-vod-mapping.json', 'replay-vod-validation.json', 'unified-timeline.json', 'gate.json', 'provenance-audit.json']) {
        const text = await readFile(path.join(ROOT, OUTPUT, name), 'utf8');
        assert.doesNotMatch(text, /[A-Za-z]:[\\/]|"(?:confirmedDeath|killer|victim|completedObjective|mapRegion|playerName|transcript)"\s*:/);
    }
});
test('gate fails closed for unsafe telemetry, unusable mappings and incomplete composition', async () => {
    const t = await json(`${OUTPUT}/telemetry-summary.json`), m = await json(`${OUTPUT}/replay-vod-mapping.json`);
    const state = { inputTargets: 2, telemetryTargets: t.targets, models: m.models, composedTargets: 2 };
    assert.equal(technicalGate(state), 'two_new_review_targets_replay_vod_craig_timeline_ready');
    assert.match(technicalGate({ ...state, protectedAccessCount: 1 }), /SAFE_TIMELINE_UNAVAILABLE/);
    assert.match(technicalGate({ ...state, models: [] }), /SYNC_UNUSABLE/);
    assert.match(technicalGate({ ...state, composedTargets: 1 }), /partial/);
});
