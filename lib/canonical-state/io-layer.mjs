import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const FORBIDDEN_PATTERNS = [
    /partida_005\.dem/iu,
    /replay_005/iu,
    /partida_006\.dem/iu,
    /replay_006/iu,
    /replay_007/iu,
    /replay_008/iu,
    /bots01/iu,
    /bots02/iu
];

function normalizePath(file) {
    return file.replaceAll('\\', '/');
}

function assertAllowed(file, allowlist) {
    const normalized = normalizePath(file);
    if (FORBIDDEN_PATTERNS.some(pattern => pattern.test(normalized))) {
        throw new Error(`Forbidden input path rejected: ${normalized}`);
    }
    if (!allowlist.has(normalized)) {
        throw new Error(`Input path is not allowlisted: ${normalized}`);
    }
    return normalized;
}

export class CanonicalIo {
    constructor({ allowlist, generatedRootPrefixes = [] }) {
        this.allowlist = new Set([...allowlist].map(normalizePath));
        this.generatedRootPrefixes = generatedRootPrefixes.map(normalizePath);
        this.accesses = [];
    }

    async readText(file, { accessClass, sourceId }) {
        const normalized = assertAllowed(file, this.allowlist);
        const text = await readFile(normalized, 'utf8');
        this.accesses.push({
            path: normalized,
            sourceId: sourceId ?? null,
            operation: 'read_text',
            accessClass,
            byteLength: Buffer.byteLength(text)
        });
        return text;
    }

    async readJson(file, options) {
        return JSON.parse(await this.readText(file, options));
    }

    async readJsonl(file, options) {
        const text = await this.readText(file, options);
        return text.trim().split(/\r?\n/u).filter(Boolean).map(line => JSON.parse(line));
    }

    async hashAllowedFile(file, { accessClass, sourceId, mode }) {
        const normalized = assertAllowed(file, this.allowlist);
        const hash = createHash('sha256');
        let sizeBytes = 0;
        await new Promise((resolve, reject) => {
            const stream = createReadStream(normalized);
            stream.on('data', chunk => {
                sizeBytes += chunk.length;
                hash.update(chunk);
            });
            stream.on('end', resolve);
            stream.on('error', reject);
        });
        const sha256 = hash.digest('hex');
        this.accesses.push({
            path: normalized,
            sourceId: sourceId ?? null,
            operation: 'sha256',
            accessClass,
            mode,
            sizeBytes,
            sha256
        });
        return { path: normalized, sizeBytes, sha256 };
    }

    async cleanDir(dir) {
        const normalized = normalizePath(dir);
        if (!this.generatedRootPrefixes.some(prefix => normalized === prefix || normalized.startsWith(`${prefix}/`))) {
            throw new Error(`Refusing to clean non-generated directory: ${normalized}`);
        }
        await rm(normalized, { recursive: true, force: true });
    }

    async writeText(file, text, { accessClass = 'generated' } = {}) {
        const normalized = normalizePath(file);
        await mkdir(path.dirname(normalized), { recursive: true });
        await writeFile(normalized, text);
        this.accesses.push({
            path: normalized,
            operation: 'write_text',
            accessClass,
            byteLength: Buffer.byteLength(text)
        });
    }

    async writeJson(file, value) {
        await this.writeText(file, `${JSON.stringify(value, null, 2)}\n`, { accessClass: 'generated_json' });
    }

    async writeJsonl(file, rows) {
        await this.writeText(file, rows.map(row => JSON.stringify(row)).join('\n') + (rows.length ? '\n' : ''), { accessClass: 'generated_jsonl' });
    }

    accessLog() {
        return this.accesses.map(record => ({ ...record }));
    }
}

export function createCanonicalIo(options) {
    return new CanonicalIo(options);
}
