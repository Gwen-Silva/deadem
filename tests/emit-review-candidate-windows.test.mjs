import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
    accumulateLifecycleRows,
    accumulateNetWorthRows,
    accumulateObjectiveRows,
    accumulatePositiveDeltaRows,
    assertReviewTargetId,
    binStartFor,
    createBinStore,
    deterministicJson,
    linkVisualNavigation,
    mapWindowToVideo,
    mergeSeedsToWindows,
    percentileThreshold,
    priorityTierForFamilyCount,
    selectSeeds,
    validateTask199ArtifactBridge
} from '../tools/emit-review-candidate-windows.mjs';

const model = {
    reviewTargetId: 'review_match_001',
    coveredReplayRegion: { startSeconds: 0, endSeconds: 100 },
    estimatedErrorSeconds: 9,
    segments: [{ segmentId: 'review_match_001_linear_001', replayStartSeconds: 0, replayEndSeconds: 100, videoStartSeconds: 1938, videoEndSeconds: 2038, slope: 1, interceptSeconds: 1938 }]
};

function seed(id, seconds, family = 'damage', mappingStatus = 'mapped') {
    return {
        seedId: `review_match_001_seed_${String(id).padStart(5, '0')}`,
        reviewTargetId: 'review_match_001',
        replayElapsedSeconds: seconds,
        binStartSeconds: Math.floor(seconds / 5) * 5,
        binEndSeconds: Math.floor(seconds / 5) * 5 + 5,
        mappingStatus,
        sourceFamily: family,
        sourceType: `${family}_counter_activity`,
        metrics: { rowCount: 1, summedDelta: 10, absoluteDeltaSum: 10, participantRefs: ['controller:1'], entityRefs: [], transitionTypes: [] },
        provenanceClass: 'derived_metric/test',
        semanticLimitations: ['Review attention signal only.']
    };
}

test('Task 199 local artifact hash bridge validates the two real targets', async () => {
    const manifest = JSON.parse(await readFile(new URL('../output/local-replay-processing/minimum-review-telemetry/task199-bounded2/manifest.json', import.meta.url), 'utf8'));
    const bridges = await Promise.all(manifest.targets.map(validateTask199ArtifactBridge));
    assert.equal(bridges.length, 2);
    assert.equal(bridges.every(bridge => bridge.artifactCount === 9 && bridge.validatedArtifactCount === 9), true);
});

test('5-second binning has deterministic inclusive starts', () => {
    assert.equal(binStartFor(0), 0);
    assert.equal(binStartFor(4.999), 0);
    assert.equal(binStartFor(5), 5);
    assert.equal(binStartFor(99), 95);
});

test('lifecycle transitions compare only declared lifecycle fields and ignore ordinary health change', () => {
    const bins = createBinStore(model);
    accumulateLifecycleRows([
        { participantKey: 'controller:1', elapsedSeconds: 1, lifeState: null, alive: true, deaths: 0, respawnState: 0, health: 900 },
        { participantKey: 'controller:1', elapsedSeconds: 2, lifeState: null, alive: true, deaths: 0, respawnState: 0, health: 700 },
        { participantKey: 'controller:1', elapsedSeconds: 3, lifeState: null, alive: false, deaths: 1, respawnState: 1, health: 0 }
    ], bins, model);
    const family = bins.get('mapped:0').families.lifecycle;
    assert.equal(family.rowCount, 1);
    assert.equal(family.transitionTypes.has('death_counter_transition_observed'), true);
    assert.equal(family.transitionTypes.has('lifecycle_field_transition:alive'), true);
});

test('damage and healing aggregate only positive Task 199 counter deltas', () => {
    const bins = createBinStore(model);
    const rows = [{ participantKey: 'controller:1', elapsedSeconds: 6, delta: 3 }, { participantKey: 'controller:2', elapsedSeconds: 7, delta: 5 }, { participantKey: 'controller:3', elapsedSeconds: 8, delta: -2 }];
    accumulatePositiveDeltaRows(rows, bins, model, 'damage');
    accumulatePositiveDeltaRows(rows, bins, model, 'healing');
    assert.equal(bins.get('mapped:5').families.damage.summedDelta, 8);
    assert.equal(bins.get('mapped:5').families.healing.rowCount, 2);
});

test('net-worth derivation uses explicit absolute and signed participant counter changes', () => {
    const bins = createBinStore(model);
    accumulateNetWorthRows([
        { participantKey: 'controller:1', elapsedSeconds: 0, value: 600 },
        { participantKey: 'controller:1', elapsedSeconds: 5, value: 650 },
        { participantKey: 'controller:1', elapsedSeconds: 6, value: 625 }
    ], bins, model);
    const family = bins.get('mapped:5').families.economy;
    assert.equal(family.summedDelta, 25);
    assert.equal(family.absoluteDeltaSum, 75);
});

test('objective-like derivation requires a state change on the same entityRef', () => {
    const bins = createBinStore(model);
    accumulateObjectiveRows([
        { entityRef: 'entity:1', elapsedSeconds: 0, health: 100, maxHealth: 100, teamRef: 2 },
        { entityRef: 'entity:2', elapsedSeconds: 1, health: 90, maxHealth: 100, teamRef: 3 },
        { entityRef: 'entity:1', elapsedSeconds: 5, health: 80, maxHealth: 100, teamRef: 2 }
    ], bins, model);
    const family = bins.get('mapped:5').families.objective_like;
    assert.equal(family.rowCount, 1);
    assert.equal(family.summedDelta, -20);
    assert.equal(family.transitionTypes.has('objective_like_health_change'), true);
});

test('percentile thresholds are deterministic nearest-rank values', () => {
    assert.equal(percentileThreshold([0, 10, 20, 30, 40], 0.75), 30);
    assert.equal(percentileThreshold([40, 0, 20, 30, 10], 0.75), 30);
    assert.equal(percentileThreshold([], 0.75), null);
});

test('mandatory lifecycle and objective-like bins always become seeds', () => {
    const bins = createBinStore(model);
    accumulateLifecycleRows([{ participantKey: 'p', elapsedSeconds: 0, alive: true, deaths: 0, respawnState: 0, lifeState: null }, { participantKey: 'p', elapsedSeconds: 5, alive: false, deaths: 0, respawnState: 1, lifeState: null }], bins, model);
    accumulateObjectiveRows([{ entityRef: 'e', elapsedSeconds: 0, health: 100 }, { entityRef: 'e', elapsedSeconds: 10, health: 99 }], bins, model);
    const { seeds } = selectSeeds('review_match_001', bins);
    assert.deepEqual(seeds.map(item => item.sourceFamily), ['lifecycle', 'objective_like']);
});

test('seed IDs and deterministic JSON are reproducible', () => {
    const bins = createBinStore(model);
    accumulatePositiveDeltaRows([{ participantKey: 'p', elapsedSeconds: 5, delta: 10 }], bins, model, 'damage');
    const first = selectSeeds('review_match_001', bins);
    const second = selectSeeds('review_match_001', bins);
    assert.equal(deterministicJson(first), deterministicJson(second));
});

test('merge boundary joins seeds at 15 seconds and separates at 16 seconds', () => {
    const joined = mergeSeedsToWindows('review_match_001', [seed(1, 10), seed(2, 25)], model);
    const split = mergeSeedsToWindows('review_match_001', [seed(1, 10), seed(2, 26)], model);
    assert.equal(joined.length, 1);
    assert.equal(split.length, 2);
});

test('long seed sequences split deterministically below the 90-second cap', () => {
    const seeds = Array.from({ length: 11 }, (_, index) => seed(index + 1, index * 10));
    const first = mergeSeedsToWindows('review_match_001', seeds, model);
    const second = mergeSeedsToWindows('review_match_001', seeds, model);
    assert.equal(first.every(window => window.replayDurationSeconds <= 90), true);
    assert.equal(deterministicJson(first), deterministicJson(second));
});

test('every mapped seed is preserved exactly once across windows', () => {
    const seeds = [seed(1, 5), seed(2, 20, 'healing'), seed(3, 80, 'economy')];
    const windows = mergeSeedsToWindows('review_match_001', seeds, model);
    assert.deepEqual(windows.flatMap(window => window.seedIds).sort(), seeds.map(item => item.seedId).sort());
});

test('unmapped seeds are classified and excluded from mapped candidate windows', () => {
    const windows = mergeSeedsToWindows('review_match_001', [seed(1, 50), seed(2, 105, 'lifecycle', 'unmapped')], model);
    assert.deepEqual(windows.flatMap(window => window.seedIds), [seed(1, 50).seedId]);
});

test('priority tiers depend only on independent source-family count', () => {
    assert.equal(priorityTierForFamilyCount(3), 'high');
    assert.equal(priorityTierForFamilyCount(2), 'medium');
    assert.equal(priorityTierForFamilyCount(1), 'low');
});

test('candidate windows use review-priority semantics and explicitly reject probability meaning', () => {
    const windows = mergeSeedsToWindows('review_match_001', [seed(1, 10)], model);
    assert.equal(windows[0].prioritySemantics, 'review_priority_heuristic_not_probability');
    assert.equal('probability' in windows[0], false);
});

test('Task 200 mapping is consumed unchanged for replay bounds', () => {
    const window = mergeSeedsToWindows('review_match_001', [seed(1, 50)], model)[0];
    const mapped = mapWindowToVideo(window, model);
    assert.equal(mapped.mappedVodStartSeconds, window.replayStartSeconds + 1938);
    assert.equal(mapped.mappedVodEndSeconds, window.replayEndSeconds + 1938);
    assert.equal(mapped.syncSegmentId, model.segments[0].segmentId);
});

test('visual evidence range expands by sync error and clamps to mapping bounds', () => {
    const mapped = mapWindowToVideo({ replayStartSeconds: 0, replayEndSeconds: 100 }, model);
    assert.equal(mapped.visualEvidenceStartSeconds, 1938);
    assert.equal(mapped.visualEvidenceEndSeconds, 2038);
    assert.equal(mapped.syncEstimatedErrorSeconds, 9);
});

test('windows outside accepted coverage are unmapped rather than extrapolated', () => {
    assert.deepEqual(mapWindowToVideo({ replayStartSeconds: 95, replayEndSeconds: 105 }, model), { mapped: false, reason: 'unreviewable_by_current_sync' });
});

test('Task 201 linking selects before, inside, after and relevant sheet metadata', () => {
    const frames = [0, 30, 60, 90].map((seconds, index) => ({ reviewTargetId: 'review_match_001', replayElapsedSeconds: seconds, mappedVideoTimestampSeconds: seconds + 1938, visualIndexFrameId: `review_match_001_frame_${String(index + 1).padStart(4, '0')}`, localFramePath: `.local/deadem/visual-index/review_match_001/frames/${index}.jpg`, contactSheetId: 'review_match_001_sheet_001' }));
    const sheets = [{ reviewTargetId: 'review_match_001', sheetId: 'review_match_001_sheet_001', localPath: '.local/deadem/visual-index/review_match_001/contact-sheets/1.jpg' }];
    const linked = linkVisualNavigation({ reviewTargetId: 'review_match_001', replayStartSeconds: 20, replayEndSeconds: 70 }, frames, sheets);
    assert.equal(linked.nearestFrameBefore.replayElapsedSeconds, 0);
    assert.deepEqual(linked.coarseFramesInside.map(frame => frame.replayElapsedSeconds), [30, 60]);
    assert.equal(linked.nearestFrameAfter.replayElapsedSeconds, 90);
    assert.equal(linked.contactSheets.length, 1);
});

test('visual linking keeps targets isolated', () => {
    const frames = [{ reviewTargetId: 'review_match_002', replayElapsedSeconds: 30, visualIndexFrameId: 'review_match_002_frame_0001', mappedVideoTimestampSeconds: 30, localFramePath: '.local/deadem/visual-index/review_match_002/frames/1.jpg', contactSheetId: 'review_match_002_sheet_001' }];
    const linked = linkVisualNavigation({ reviewTargetId: 'review_match_001', replayStartSeconds: 0, replayEndSeconds: 60 }, frames, []);
    assert.equal(linked.nearestFrameBefore, null);
    assert.equal(linked.coarseFramesInside.length, 0);
});

test('protected and unsupported aliases fail before any filesystem access', () => {
    assert.throws(() => assertReviewTargetId('replay_005'));
    assert.throws(() => assertReviewTargetId('review_match_003'));
});

test('emitter contains no replay or VOD binary input paths', async () => {
    const source = await readFile(new URL('../tools/emit-review-candidate-windows.mjs', import.meta.url), 'utf8');
    assert.equal(/[.]dem(?:['"`]|$)/iu.test(source), false);
    assert.equal(/[.]mp4(?:['"`]|$)/iu.test(source), false);
});

test('output semantics never promote windows to gameplay events', () => {
    const windows = mergeSeedsToWindows('review_match_001', [seed(1, 10, 'lifecycle'), seed(2, 10, 'damage')], model);
    assert.equal(windows[0].sourceFamilies.includes('fight'), false);
    assert.equal(windows[0].sourceFamilies.includes('death'), false);
    assert.equal(windows[0].priorityTier, 'medium');
});

test('real bounded-two output preserves every seed and only links same-target Task 201 navigation', async () => {
    const outputUrl = new URL('../output/local-replay-processing/review-candidate-windows/task202-bounded2/candidate-windows.json', import.meta.url);
    if (!existsSync(outputUrl)) return;
    const output = JSON.parse(await readFile(outputUrl, 'utf8'));
    const frames = JSON.parse(await readFile(new URL('../output/local-replay-processing/whole-match-visual-index/task201-bounded2/frame-index.json', import.meta.url), 'utf8')).frames;
    const sheets = JSON.parse(await readFile(new URL('../output/local-replay-processing/whole-match-visual-index/task201-bounded2/contact-sheet-index.json', import.meta.url), 'utf8')).targets.flatMap(target => target.sheets);
    const frameTargets = new Map(frames.map(frame => [frame.visualIndexFrameId, frame.reviewTargetId]));
    const sheetTargets = new Map(sheets.map(sheet => [sheet.sheetId, sheet.reviewTargetId]));
    const usedSeeds = output.windows.flatMap(window => window.seedIds);
    const expectedMapped = [];
    for (const targetId of ['review_match_001', 'review_match_002']) {
        const local = JSON.parse(await readFile(new URL(`../.local/deadem/review-candidates/${targetId}/seeds.json`, import.meta.url), 'utf8'));
        expectedMapped.push(...local.seeds.filter(item => item.mappingStatus === 'mapped').map(item => item.seedId));
    }
    assert.equal(new Set(usedSeeds).size, usedSeeds.length);
    assert.deepEqual([...usedSeeds].sort(), expectedMapped.sort());
    for (const window of output.windows) {
        assert.equal(window.seedIds.every(id => id.startsWith(`${window.reviewTargetId}_seed_`)), true);
        const refs = [window.visualNavigation.nearestFrameBefore, ...window.visualNavigation.coarseFramesInside, window.visualNavigation.nearestFrameAfter].filter(Boolean);
        assert.equal(refs.every(ref => frameTargets.get(ref.visualIndexFrameId) === window.reviewTargetId), true);
        assert.equal(window.visualNavigation.contactSheets.every(sheet => sheetTargets.get(sheet.contactSheetId) === window.reviewTargetId), true);
        assert.equal(window.priorityTier, priorityTierForFamilyCount(window.sourceFamilyCount));
    }
});
