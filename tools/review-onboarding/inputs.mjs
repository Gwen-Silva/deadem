import { createReadStream } from 'node:fs';
import { readdir, realpath, lstat, open } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const TARGETS = Object.freeze(['review_match_003', 'review_match_004']);
export const OUTPUT = 'output/local-replay-processing/review-onboarding/task211-matches-003-004';
export function assertTarget(id) {
    if (/(?:replay|partida|match)[_-]?00?[5-8]/iu.test(String(id))) throw new Error('protected alias rejected before filesystem access');
    if (!TARGETS.includes(id)) throw new Error('target_not_authorized');
    return id;
}
export function selectUnique(entries, extension) {
    const selected = entries.filter(item => item.name.toLowerCase().endsWith(extension));
    if (selected.length !== 1) throw new Error(`exactly_one_${extension}_required`);
    const item = selected[0];
    if (!item.isFile() || item.isSymbolicLink() || /(?:replay|partida|match)[_-]?00?[5-8]/iu.test(item.name)) throw new Error('unsafe_or_protected_input');
    return item.name;
}
export async function resolveInput(id, kind, io = { readdir, realpath, lstat }) {
    assertTarget(id); // MUST precede every filesystem operation.
    if (!['replay', 'video'].includes(kind)) throw new Error('unsupported_input_kind');
    const dir = path.join(ROOT, '.local/deadem/review-targets', id, kind);
    if (path.resolve(await io.realpath(dir)).toLowerCase() !== dir.toLowerCase()) throw new Error('redirected_input_directory');
    const name = selectUnique(await io.readdir(dir, { withFileTypes: true }), kind === 'replay' ? '.dem' : '.mp4');
    const file = path.join(dir, name);
    if (path.resolve(await io.realpath(file)).toLowerCase() !== file.toLowerCase()) throw new Error('redirected_input_file');
    const info = await io.lstat(file);
    if (!info.isFile() || info.isSymbolicLink()) throw new Error('not_regular_file');
    return { file, filenameOriginal: name, sizeBytes: info.size };
}
export async function sha256File(file) {
    const hash = crypto.createHash('sha256');
    for await (const chunk of createReadStream(file, { highWaterMark: 4 * 1024 * 1024 })) hash.update(chunk);
    return hash.digest('hex');
}
export function validateHeader(bytes, sizeBytes) {
    if (bytes.length < 16 || bytes.subarray(0, 8).toString('ascii') !== 'PBDEMS2\0') throw new Error('invalid_PBDEMS2_header');
    const summaryOffset = bytes.readUInt32LE(8);
    if (summaryOffset < 16 || summaryOffset >= sizeBytes) throw new Error('invalid_replay_summary_offset');
    return { magic: 'PBDEMS2', headerBytes: 16, summaryOffset, status: 'valid_header_and_summary_offset' };
}
export async function readHeader(file, sizeBytes) {
    const handle = await open(file, 'r');
    try { const bytes = Buffer.alloc(16); const result = await handle.read(bytes, 0, 16, 0); return validateHeader(bytes.subarray(0, result.bytesRead), sizeBytes); }
    finally { await handle.close(); }
}
