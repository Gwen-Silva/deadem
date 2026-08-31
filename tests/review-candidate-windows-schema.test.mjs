import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import Ajv2020 from 'ajv/dist/2020.js';

const schema = JSON.parse(await readFile(new URL('../schemas/review-candidate-windows.schema.json', import.meta.url), 'utf8'));
const ajv = new Ajv2020({ allErrors: true, strict: true });
const validate = ajv.compile(schema);

function fixture() {
    const frame = {
        visualIndexFrameId: 'review_match_001_frame_0001',
        replayElapsedSeconds: 30,
        mappedVideoTimestampSeconds: 1968,
        localFramePath: '.local/deadem/visual-index/review_match_001/frames/frame.jpg',
        contactSheetId: 'review_match_001_sheet_001'
    };
    return {
        schemaVersion: 1,
        artifactClass: 'review_attention_region_candidates',
        candidateSemantics: 'review_attention_region_not_gameplay_event',
        notProbability: true,
        windowCount: 1,
        windows: [{
            candidateWindowId: 'review_match_001_window_0001',
            reviewTargetId: 'review_match_001',
            replayStartSeconds: 20,
            replayEndSeconds: 50,
            replayDurationSeconds: 30,
            seedIds: ['review_match_001_seed_00001'],
            seedCount: 1,
            sourceFamilies: ['damage'],
            sourceFamilyCount: 1,
            priorityTier: 'low',
            prioritySemantics: 'review_priority_heuristic_not_probability',
            perFamilyMetrics: [{ sourceFamily: 'damage', seedCount: 1, rowCount: 2, summedDelta: 100, absoluteDeltaSum: 100, participantRefCount: 2, entityRefCount: 0 }],
            provenance: ['derived_metric/aggregate_counter_delta_bin'],
            semanticLimitations: ['Aggregate counter activity only.'],
            videoMapping: { mapped: true, syncSegmentId: 'review_match_001_linear_001', syncEstimatedErrorSeconds: 9, mappedVodStartSeconds: 1958, mappedVodEndSeconds: 1988, visualEvidenceStartSeconds: 1949, visualEvidenceEndSeconds: 1997 },
            visualNavigation: {
                nearestFrameBefore: frame,
                coarseFramesInside: [frame],
                nearestFrameAfter: frame,
                contactSheets: [{ contactSheetId: 'review_match_001_sheet_001', localPath: '.local/deadem/visual-index/review_match_001/contact-sheets/sheet.jpg' }]
            },
            notProbability: true
        }]
    };
}

test('strict review candidate window fixture is schema-valid', () => {
    const actual = fixture();
    assert.equal(validate(actual), true, JSON.stringify(validate.errors));
});

test('schema requires review-attention and not-probability semantics', () => {
    const actual = fixture();
    actual.notProbability = false;
    actual.windows[0].prioritySemantics = 'probability_of_fight';
    assert.equal(validate(actual), false);
});

test('schema rejects gameplay-semantic source families and fields', () => {
    const actual = fixture();
    actual.windows[0].sourceFamilies = ['fight'];
    actual.windows[0].fightProbability = 0.8;
    assert.equal(validate(actual), false);
});

test('schema enforces the 90-second maximum window', () => {
    const actual = fixture();
    actual.windows[0].replayDurationSeconds = 91;
    assert.equal(validate(actual), false);
});

test('schema rejects non-local frame and sheet navigation paths', () => {
    const actual = fixture();
    actual.windows[0].visualNavigation.nearestFrameBefore.localFramePath = 'output/frame.jpg';
    actual.windows[0].visualNavigation.contactSheets[0].localPath = 'output/sheet.jpg';
    assert.equal(validate(actual), false);
});

test('real Task 202 candidate windows are schema-valid when present', async () => {
    const relative = '../output/local-replay-processing/review-candidate-windows/task202-bounded2/candidate-windows.json';
    const fileUrl = new URL(relative, import.meta.url);
    if (!existsSync(fileUrl)) return;
    const actual = JSON.parse(await readFile(fileUrl, 'utf8'));
    assert.equal(validate(actual), true, JSON.stringify(validate.errors));
    assert.equal(actual.windowCount, actual.windows.length);
});
