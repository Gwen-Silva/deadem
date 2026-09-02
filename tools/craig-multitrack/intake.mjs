import crypto from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { readBoundedJsonHeader, tracksFromCraigHeader } from './metadata.mjs';

async function sha256File(filePath) {
    const digest = crypto.createHash('sha256');
    await new Promise((resolve, reject) => createReadStream(filePath)
        .on('data', chunk => digest.update(chunk)).on('error', reject).on('end', resolve));
    return digest.digest('hex');
}

export function mapTrackFiles(fileNames, metadataTracks) {
    const audioRows = fileNames.filter(name => name.toLowerCase().endsWith('.aac')).map(name => {
        const match = /^(\d+)-.+[.]aac$/iu.exec(name);
        if (!match) throw new Error('craig_aac_filename_ordinal_missing');
        return { trackOrdinal: Number.parseInt(match[1], 10), fileName: name };
    });
    const ordinals = audioRows.map(row => row.trackOrdinal);
    if (new Set(ordinals).size !== ordinals.length) throw new Error('craig_aac_duplicate_ordinal');
    const metadataOrdinals = metadataTracks.map(row => row.trackOrdinal);
    if (new Set(metadataOrdinals).size !== metadataOrdinals.length) throw new Error('craig_metadata_duplicate_ordinal');
    const expected = Array.from({ length: metadataTracks.length }, (_, index) => index + 1);
    if (expected.some(value => !ordinals.includes(value))) throw new Error('craig_aac_missing_ordinal');
    if (expected.some(value => !metadataOrdinals.includes(value))) throw new Error('craig_metadata_missing_ordinal');
    if (audioRows.some(row => !metadataOrdinals.includes(row.trackOrdinal))) throw new Error('craig_aac_without_metadata');
    if (metadataTracks.some(row => !ordinals.includes(row.trackOrdinal))) throw new Error('craig_metadata_without_aac');
    return metadataTracks.map(metadata => ({ ...metadata, ...audioRows.find(audio => audio.trackOrdinal === metadata.trackOrdinal) }));
}

export function assertCraigPackageRoot(packageRoot) {
    const text = String(packageRoot);
    if (/(?:replay|partida|match)[_-]?00?[5-8]/iu.test(text) || /[.]dem(?:$|[\\/])/iu.test(text)) {
        throw new Error('protected_or_replay_input_rejected_before_filesystem_access');
    }
    if (/vod/iu.test(path.basename(text))) throw new Error('vod_input_rejected_before_filesystem_access');
    return path.resolve(text);
}

function parseInfo(text) {
    const startTime = /startTime\s*[:=]\s*([^\r\n]+)/iu.exec(text)?.[1]?.trim() ?? null;
    const trackCountText = /trackCount\s*[:=]\s*(\d+)/iu.exec(text)?.[1] ?? null;
    return { startTime, trackCount: trackCountText ? Number.parseInt(trackCountText, 10) : null };
}

export async function loadCraigIntake(packageRoot) {
    const root = assertCraigPackageRoot(packageRoot);
    const names = await readdir(root);
    if (!names.includes('raw.dat') || !names.includes('info.txt')) throw new Error('craig_required_metadata_file_missing');
    const boundedHeader = await readBoundedJsonHeader(path.join(root, 'raw.dat'));
    const metadataTracks = tracksFromCraigHeader(boundedHeader.value);
    const mapped = mapTrackFiles(names, metadataTracks);
    const info = parseInfo(await readFile(path.join(root, 'info.txt'), 'utf8'));
    if (info.trackCount !== null && info.trackCount !== mapped.length) throw new Error('craig_info_track_count_contradiction');
    if (boundedHeader.value.startTime && info.startTime && boundedHeader.value.startTime !== info.startTime) {
        throw new Error('craig_start_time_contradiction');
    }
    const tracks = [];
    for (const row of mapped) {
        const sourceAudioPath = path.join(root, row.fileName);
        const fileStat = await stat(sourceAudioPath);
        tracks.push({
            trackOrdinal: row.trackOrdinal,
            trackRef: `track_${String(row.trackOrdinal).padStart(2, '0')}`,
            sourceSpeakerId: row.sourceSpeakerId,
            sourceUsername: row.sourceUsername,
            sourceDisplayName: row.sourceDisplayName,
            sourceMetadataStatus: row.sourceMetadataStatus,
            sourceAudioPath,
            sourceAudioSha256: await sha256File(sourceAudioPath),
            sourceAudioSizeBytes: fileStat.size
        });
    }
    return {
        recording: {
            recordingId: 'craig_recording_task208_real_01',
            startTime: boundedHeader.value.startTime ?? info.startTime,
            trackCount: tracks.length,
            sourcePackageRoot: root,
            rawHeaderReadBytes: boundedHeader.bytesRead,
            rawHeaderEndByte: boundedHeader.headerEndByte,
            rawFileSizeBytes: (await stat(path.join(root, 'raw.dat'))).size,
            metadataPriority: ['raw.dat_json_header', 'info.txt', 'filename_ordinal']
        },
        tracks
    };
}
