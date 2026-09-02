import { open } from 'node:fs/promises';

export async function readBoundedJsonHeader(filePath, { maxBytes = 1024 * 1024, chunkBytes = 1 } = {}) {
    const handle = await open(filePath, 'r');
    const chunks = [];
    let bytesRead = 0;
    let start = -1;
    let end = -1;
    let depth = 0;
    let inString = false;
    let escaped = false;
    try {
        while (bytesRead < maxBytes && end < 0) {
            const buffer = Buffer.alloc(Math.min(chunkBytes, maxBytes - bytesRead));
            const result = await handle.read(buffer, 0, buffer.length, bytesRead);
            if (result.bytesRead === 0) break;
            chunks.push(buffer.subarray(0, result.bytesRead));
            const text = Buffer.concat(chunks).toString('utf8');
            start = start < 0 ? text.indexOf('{') : start;
            if (start < 0) {
                bytesRead += result.bytesRead;
                continue;
            }
            depth = 0; inString = false; escaped = false;
            for (let index = start; index < text.length; index += 1) {
                const character = text[index];
                if (inString) {
                    if (escaped) escaped = false;
                    else if (character === '\\') escaped = true;
                    else if (character === '"') inString = false;
                } else if (character === '"') inString = true;
                else if (character === '{') depth += 1;
                else if (character === '}' && --depth === 0) { end = index + 1; break; }
            }
            bytesRead += result.bytesRead;
        }
    } finally {
        await handle.close();
    }
    if (start < 0 || end < 0) throw new Error('craig_json_header_not_found_within_bound');
    const text = Buffer.concat(chunks).toString('utf8');
    return {
        value: JSON.parse(text.slice(start, end)),
        bytesRead,
        headerStartByte: Buffer.byteLength(text.slice(0, start)),
        headerEndByte: Buffer.byteLength(text.slice(0, end)),
        maxBytes
    };
}

export function describeMetadataShape(value) {
    const visit = (item, depth = 0) => {
        if (Array.isArray(item)) return { type: 'array', length: item.length, item: item.length && depth < 3 ? visit(item[0], depth + 1) : null };
        if (!item || typeof item !== 'object') return typeof item;
        if (depth >= 3) return { type: 'object', keys: Object.keys(item) };
        return Object.fromEntries(Object.entries(item).map(([key, child]) => [key, visit(child, depth + 1)]));
    };
    return visit(value);
}

export function tracksFromCraigHeader(header) {
    if (!header?.tracks || typeof header.tracks !== 'object' || Array.isArray(header.tracks)) {
        throw new Error('craig_tracks_metadata_missing');
    }
    return Object.entries(header.tracks).map(([ordinalText, source]) => {
        const trackOrdinal = Number.parseInt(ordinalText, 10);
        if (!Number.isInteger(trackOrdinal) || trackOrdinal < 1) throw new Error('craig_track_ordinal_invalid');
        if (!source?.id) throw new Error('craig_track_identity_missing');
        return {
            trackOrdinal,
            sourceSpeakerId: String(source.id),
            sourceUsername: source.username ? String(source.username) : null,
            sourceDisplayName: source.globalName ? String(source.globalName) : source.username ? String(source.username) : null,
            sourceMetadataStatus: source.globalName || source.username ? 'complete' : 'identity_only'
        };
    }).sort((left, right) => left.trackOrdinal - right.trackOrdinal);
}
