import assert from 'node:assert/strict';
import { mkdtemp, open, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { CraigMultitrackAdapter } from '../tools/audio-call-source-adapters.mjs';
import { overlapMetrics, summarizeTimeline } from '../tools/craig-multitrack/audio-probe.mjs';
import { assertCraigPackageRoot, mapTrackFiles } from '../tools/craig-multitrack/intake.mjs';
import { readBoundedJsonHeader, tracksFromCraigHeader } from '../tools/craig-multitrack/metadata.mjs';
import { selectDeterministicCanary } from '../tools/craig-multitrack/validation-canary.mjs';

const metadata = Array.from({ length: 9 }, (_, index) => ({
    trackOrdinal: index + 1, sourceSpeakerId: `speaker-${index + 1}`, sourceUsername: `user-${index + 1}`,
    sourceDisplayName: `Display ${index + 1}`, sourceMetadataStatus: 'complete'
}));

test('raw.dat parser stops at bounded top-level JSON header', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'craig-header-'));
    try {
        const file = path.join(root, 'raw.dat');
        await writeFile(file, `${JSON.stringify({ tracks: { 1: { id: 'a', username: 'u' } } })}${'O'.repeat(20_000)}`);
        const result = await readBoundedJsonHeader(file, { maxBytes: 8192, chunkBytes: 256 });
        assert.equal(result.value.tracks[1].id, 'a');
        assert.ok(result.bytesRead < 20_000);
        assert.ok(result.headerEndByte <= result.bytesRead);
    } finally { await rm(root, { recursive: true, force: true }); }
});

test('Craig header maps track metadata without voice identity inference', () => {
    const tracks = tracksFromCraigHeader({ tracks: Object.fromEntries(metadata.map(row => [row.trackOrdinal, {
        id: row.sourceSpeakerId, username: row.sourceUsername, globalName: row.sourceDisplayName
    }])) });
    assert.equal(tracks.length, 9);
    assert.equal(tracks[0].sourceDisplayName, 'Display 1');
});

test('nine AAC files map by ordinal and reject duplicate or missing ordinals', () => {
    const files = metadata.map(row => `${row.trackOrdinal}-private-name.aac`);
    assert.deepEqual(mapTrackFiles(files, metadata).map(row => row.trackOrdinal), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
    assert.throws(() => mapTrackFiles([...files, '1-other.aac'], metadata), /duplicate_ordinal/u);
    assert.throws(() => mapTrackFiles(files.slice(1), metadata), /missing_ordinal/u);
});

test('protected replay aliases, dem and VOD inputs are rejected before access', () => {
    assert.throws(() => assertCraigPackageRoot('input/replay_005/package'), /rejected_before_filesystem_access/u);
    assert.throws(() => assertCraigPackageRoot('input/sample.dem'), /rejected_before_filesystem_access/u);
    assert.throws(() => assertCraigPackageRoot('input/vod'), /rejected_before_filesystem_access/u);
});

test('timeline spreads and simultaneous cross-track overlap remain measured', () => {
    const timeline = summarizeTimeline([
        { decodeSmoke: true, firstTimestampSeconds: 0, lastTimestampSeconds: 10, durationSeconds: 10 },
        { decodeSmoke: true, firstTimestampSeconds: 0.1, lastTimestampSeconds: 12, durationSeconds: 11.9 }
    ]);
    assert.deepEqual(timeline, { timelineSpreadStartSeconds: 0.1, timelineSpreadEndSeconds: 2,
        durationSpreadSeconds: 1.9, durationRangeSeconds: { min: 10, max: 11.9 } });
    assert.deepEqual(overlapMetrics([
        { trackOrdinal: 1, startSeconds: 120, endSeconds: 122 },
        { trackOrdinal: 2, startSeconds: 121, endSeconds: 123 }
    ]), { overlapPairCount: 1, overlapDurationSeconds: 1 });
});

test('canary selection is deterministic, distributed and exactly 18 samples', () => {
    const regions = Object.fromEntries(Array.from({ length: 9 }, (_, index) => [String(index + 1), [
        { startSeconds: index * 100 + 10, endSeconds: index * 100 + 15 },
        { startSeconds: index * 100 + 50, endSeconds: index * 100 + 55 },
        { startSeconds: index * 100 + 90, endSeconds: index * 100 + 95 }
    ]]));
    const first = selectDeterministicCanary(regions);
    const second = selectDeterministicCanary(regions);
    assert.deepEqual(first, second);
    assert.equal(first.length, 18);
    assert.deepEqual(Object.fromEntries(Array.from({ length: 9 }, (_, index) => [index + 1,
        first.filter(row => row.trackOrdinal === index + 1).length])), { 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 2, 7: 2, 8: 2, 9: 2 });
});

test('real Craig adapter shape preserves overlap, track attribution, words and no absent time axes', () => {
    const adapter = new CraigMultitrackAdapter({ recordingRoot: 'local', recordingId: 'recording_local', tracks: [
        { trackOrdinal: 1, trackRef: 'track_01', sourceSpeakerId: 's1', displayName: 'One', segments: [{ startSeconds: 120, endSeconds: 122, text: 'a', transcriptionMetadata: { model: 'small' }, words: [{ word: 'a', startSeconds: 0, endSeconds: 1 }] }] },
        { trackOrdinal: 2, trackRef: 'track_02', sourceSpeakerId: 's2', displayName: 'Two', segments: [{ startSeconds: 121, endSeconds: 123, text: 'b', words: [] }] }
    ] });
    const rows = adapter.normalize();
    assert.equal(rows.length, 2);
    assert.equal(rows[0].speaker.status, 'track_attributed');
    assert.equal(rows[0].transcriptionMetadata.model, 'small');
    assert.equal(rows[0].words[0].recordingStartSeconds, 120);
    assert.ok(!('videoStartSeconds' in rows[0]));
    assert.ok(!('replayApproxStartSeconds' in rows[0]));
    assert.ok(!('diarization' in rows[0]));
});

test('real normalized tracks and clips preserve measured duration and selected PCM offsets', async () => {
    const root = '.local/deadem/craig/recordings/craig_recording_task208_real_01';
    const pipeline = JSON.parse(await readFile(path.join(root, 'pipeline-result.json'), 'utf8'));
    const validation = JSON.parse(await readFile(path.join(root, 'validation/validation-sheet.json'), 'utf8'));
    const privateMetadata = JSON.parse(await readFile(path.join(root, 'validation/recording-private-metadata.json'), 'utf8'));
    const selected = selectDeterministicCanary(Object.fromEntries(privateMetadata.tracks.map(track => [track.trackOrdinal, track.activityRegions])));
    assert.equal(pipeline.tracks.length, 9);
    assert.equal(validation.samples.length, 18);
    assert.deepEqual(overlapMetrics(pipeline.activityRegions), {
        overlapPairCount: pipeline.overlapPairCount, overlapDurationSeconds: pipeline.overlapDurationSeconds
    });
    for (const track of privateMetadata.tracks) {
        const handle = await open(track.normalizedAudioPath, 'r');
        try {
            const header = Buffer.alloc(44);
            await handle.read(header, 0, 44, 0);
            assert.equal(header.toString('ascii', 0, 4), 'RIFF');
            assert.equal(header.toString('ascii', 36, 40), 'data');
            assert.equal(header.readUInt16LE(22), 1);
            assert.equal(header.readUInt32LE(24), 16000);
            assert.equal(header.readUInt16LE(34), 16);
            assert.equal(track.startTimeSeconds, 0);
            assert.equal(track.timelineStatus, 'measured');
            assert.ok(Math.abs(header.readUInt32LE(40) / 32000 - track.lastTimestampSeconds) <= 0.001);
        } finally { await handle.close(); }
    }
    for (const [index, sample] of validation.samples.entries()) {
        const region = selected[index];
        assert.equal(sample.sampleId, region.sampleId);
        assert.equal(sample.recordingStartSeconds, region.startSeconds);
        assert.equal(sample.recordingEndSeconds, region.endSeconds);
        assert.equal(sample.humanClassification, null);
        const clip = await readFile(sample.audioClipPath);
        const source = privateMetadata.tracks.find(track => track.trackOrdinal === sample.trackOrdinal);
        const handle = await open(source.normalizedAudioPath, 'r');
        try {
            const expected = Buffer.alloc(clip.length - 44);
            const read = await handle.read(expected, 0, expected.length, 44 + Math.round(region.startSeconds * 16000) * 2);
            assert.equal(read.bytesRead, expected.length);
            assert.deepEqual(clip.subarray(44), expected);
        } finally { await handle.close(); }
    }
});

test('versioned real outputs contain no local identities, transcripts, filenames or absolute paths', async () => {
    const outputRoot = 'output/local-replay-processing/craig-multitrack/task208-real-canary';
    const versioned = (await Promise.all(['manifest.json', 'audio-probe-summary.json', 'canary-summary.json', 'gate.json', 'privacy-audit.json']
        .map(name => readFile(path.join(outputRoot, name), 'utf8')))).join('\n');
    const privateSheet = JSON.parse(await readFile('.local/deadem/craig/recordings/craig_recording_task208_real_01/validation/validation-sheet.json', 'utf8'));
    for (const sample of privateSheet.samples) {
        assert.ok(!versioned.includes(sample.speaker.sourceSpeakerId));
        if (sample.speaker.displayName?.length >= 4) assert.ok(!versioned.includes(sample.speaker.displayName));
        if (sample.asrTranscript.length >= 8) assert.ok(!versioned.includes(sample.asrTranscript));
    }
    assert.doesNotMatch(versioned, /[A-Z]:[\\/]/u);
    assert.doesNotMatch(versioned, /[.]aac|[.]wav|raw[.]dat|info[.]txt/iu);
});
