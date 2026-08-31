import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import Ajv2020 from 'ajv/dist/2020.js';

const schema = JSON.parse(await readFile(new URL('../schemas/whole-match-visual-index.schema.json', import.meta.url), 'utf8'));
const ajv = new Ajv2020({ allErrors: true, strict: true });
const validate = ajv.compile(schema);

function fixture() {
    return {
        schemaVersion: 1,
        artifactClass: 'whole_match_visual_frame_index',
        samplingIntervalSeconds: 30,
        frameCount: 1,
        frames: [{
            reviewTargetId: 'review_match_001',
            visualIndexFrameId: 'review_match_001_frame_0001',
            replayElapsedSeconds: 0,
            mappedVideoTimestampSeconds: 1938,
            syncSegmentId: 'review_match_001_linear_001',
            syncEstimatedErrorSeconds: 9,
            requestedVideoTimestampMs: 1938000,
            decodedVideoTimestampMs: 1938000,
            seekErrorMs: 0,
            frameSha256: 'a'.repeat(64),
            localFramePath: '.local/deadem/visual-index/review_match_001/frames/frame.jpg',
            extractionStatus: 'decoded',
            sourceFrameIndex: 58140,
            width: 2580,
            height: 1080,
            factualContext: {
                observedParticipantCount: 14,
                netWorthSnapshot: {
                    nearestReplayElapsedSeconds: 0,
                    participantCount: 14,
                    totalObservedValue: 7200,
                    minObservedValue: 0,
                    maxObservedValue: 600,
                    provenanceClass: 'derived/replay_observed_counter_aggregate_without_interpretation'
                },
                objectiveObservation: {
                    observationCount: 4,
                    sampleAvailable: true,
                    semanticClass: 'raw_structure_or_objective_like_observation_count'
                },
                lifeStateObservation: {
                    availabilityStatus: 'partial',
                    observationCount: 14,
                    sampleAvailable: true,
                    semanticClass: 'raw_lifecycle_related_observation_availability'
                }
            },
            provenance: {
                frame: 'factual/local_video_decoded_frame',
                timestampMapping: 'derived/task200_replay_video_sync',
                context: 'factual_replay_observations_and_declared_aggregates',
                semanticInterpretation: false
            },
            contactSheetId: 'review_match_001_sheet_001',
            contactSheetPosition: 0
        }]
    };
}

test('strict visual frame index fixture is schema-valid', () => {
    const actual = fixture();
    assert.equal(validate(actual), true, JSON.stringify(validate.errors));
});

test('schema rejects hidden sync uncertainty and gameplay interpretation', () => {
    const missingError = fixture();
    delete missingError.frames[0].syncEstimatedErrorSeconds;
    assert.equal(validate(missingError), false);
    const interpreted = fixture();
    interpreted.frames[0].provenance.semanticInterpretation = true;
    assert.equal(validate(interpreted), false);
});

test('schema rejects non-local heavy image paths', () => {
    const actual = fixture();
    actual.frames[0].localFramePath = 'output/committed/frame.jpg';
    assert.equal(validate(actual), false);
});

test('schema represents graceful frame failure with nullable evidence', () => {
    const actual = fixture();
    Object.assign(actual.frames[0], {
        decodedVideoTimestampMs: null,
        seekErrorMs: null,
        frameSha256: null,
        localFramePath: null,
        extractionStatus: 'seek_failed',
        sourceFrameIndex: null,
        width: null,
        height: null,
        contactSheetId: null,
        contactSheetPosition: null
    });
    assert.equal(validate(actual), true, JSON.stringify(validate.errors));
});

test('schema rejects unexpected semantic labels', () => {
    const actual = fixture();
    actual.frames[0].fight = true;
    assert.equal(validate(actual), false);
});

test('real Task 201 frame index is schema-valid when present', async () => {
    const file = new URL('../output/local-replay-processing/whole-match-visual-index/task201-bounded2/frame-index.json', import.meta.url);
    if (!existsSync(file)) return;
    const actual = JSON.parse(await readFile(file, 'utf8'));
    assert.equal(validate(actual), true, JSON.stringify(validate.errors));
    assert.equal(actual.frameCount, actual.frames.length);
});
