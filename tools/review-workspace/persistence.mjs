import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { assertTargetId, validateReviewState } from './data-model.mjs';

export function emptyReviewState(targetId) {
    assertTargetId(targetId);
    return {
        schemaVersion: 1,
        reviewTargetId: targetId,
        candidates: {},
        overlaps: [],
        updatedAt: null
    };
}

export class ReviewStateStore {
    constructor({ root, workspaceData }) {
        this.root = path.resolve(root);
        this.workspaceData = workspaceData;
    }

    statePath(targetId) {
        assertTargetId(targetId);
        return path.join(this.root, `${targetId}.json`);
    }

    async load(targetId) {
        const file = this.statePath(targetId);
        try {
            const parsed = JSON.parse(await readFile(file, 'utf8'));
            return validateReviewState(targetId, parsed, this.workspaceData);
        } catch (error) {
            if (error.code === 'ENOENT') return emptyReviewState(targetId);
            throw error;
        }
    }

    async save(targetId, input) {
        const validated = validateReviewState(targetId, {
            ...input,
            updatedAt: new Date().toISOString()
        }, this.workspaceData);
        await mkdir(this.root, { recursive: true });
        const target = this.statePath(targetId);
        const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
        try {
            await writeFile(temporary, `${JSON.stringify(validated, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
            await rename(temporary, target);
        } catch (error) {
            await rm(temporary, { force: true });
            throw error;
        }
        return validated;
    }
}
