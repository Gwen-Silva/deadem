import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import Ajv2020 from 'ajv/dist/2020.js';

const schema = JSON.parse(await readFile(new URL('../schemas/two-match-replay-video-sync.schema.json', import.meta.url), 'utf8'));
const ajv = new Ajv2020({ allErrors: true, strict: true });
const validate = ajv.compile(schema);

function model(reviewTargetId, interceptSeconds) {
    return {
        reviewTargetId,
        modelType: 'linear',
        equation: 'video_seconds = slope * replay_elapsed_seconds + intercept_seconds',
        segments: [{
            segmentId: `${reviewTargetId}_linear_001`,
            replayStartSeconds: 0,
            replayEndSeconds: 100,
            videoStartSeconds: interceptSeconds,
            videoEndSeconds: 100 + interceptSeconds,
            slope: 1,
            interceptSeconds
        }],
        coveredReplayRegion: { startSeconds: 0, endSeconds: 100 },
        uncoveredReplayRegions: [{ afterSecondsExclusive: 100, endSecondsInclusive: 105 }],
        rejectionPolicy: 'reject_outside_covered_region_without_extrapolation',
        estimatedErrorSeconds: 2,
        fitAnchorCount: 3,
        validationAnchorCount: 3,
        validationMaximumAbsoluteErrorSeconds: 1
    };
}

function fixture() {
    return {
        schemaVersion: 1,
        artifactClass: 'two_match_replay_video_mapping',
        axisInput: 'task199_replay_elapsed_seconds',
        axisOutput: 'task198_vod_seconds',
        models: [model('review_match_001', 12), model('review_match_002', 0)],
        silentExtrapolationAllowed: false,
        displayedGameClockUsedAsGroundTruth: false
    };
}

test('strict mapping fixture is schema-valid', () => {
    const actual = fixture();
    assert.equal(validate(actual), true, JSON.stringify(validate.errors));
});

test('schema rejects silent extrapolation and displayed-clock ground truth', () => {
    const extrapolated = fixture();
    extrapolated.silentExtrapolationAllowed = true;
    assert.equal(validate(extrapolated), false);
    const clockPromoted = fixture();
    clockPromoted.displayedGameClockUsedAsGroundTruth = true;
    assert.equal(validate(clockPromoted), false);
});

test('schema rejects missing coverage and unexpected properties', () => {
    const missing = fixture();
    delete missing.models[0].coveredReplayRegion;
    assert.equal(validate(missing), false);
    const unexpected = fixture();
    unexpected.models[0].confirmedDeath = true;
    assert.equal(validate(unexpected), false);
});

test('schema requires exactly two bounded target mappings', () => {
    const one = fixture();
    one.models.pop();
    assert.equal(validate(one), false);
    const three = fixture();
    three.models.push(model('review_match_001', 5));
    assert.equal(validate(three), false);
});

test('schema rejects non-positive mapping slopes', () => {
    const actual = fixture();
    actual.models[0].segments[0].slope = 0;
    assert.equal(validate(actual), false);
});

test('real Task 200 mapping is schema-valid when present', async () => {
    const file = new URL('../output/local-replay-processing/replay-video-sync/task200-bounded2/mapping.json', import.meta.url);
    if (!existsSync(file)) return;
    const actual = JSON.parse(await readFile(file, 'utf8'));
    assert.equal(validate(actual), true, JSON.stringify(validate.errors));
});
