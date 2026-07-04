import { promises as fs } from 'node:fs';
import path from 'node:path';
import { sha256File, writeJson } from './common.mjs';

export const BASE_MANIFEST_EXCLUSIONS = new Set([
    'audit-artifact-manifest.json',
    'audit-artifact-verification.json',
    'validation-matrix.json',
    'correction-gate.json',
    'correction-summary.json',
    'final-attestation.json'
]);

export async function listFilesRecursive(root) {
    const entries = await fs.readdir(root, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
        const full = path.join(root, entry.name);
        if (entry.isDirectory()) files.push(...await listFilesRecursive(full));
        else files.push(full);
    }
    return files.sort();
}

export async function buildBaseAuditManifest({ canonicalDir, assessmentDir }) {
    const canonicalFiles = await listFilesRecursive(canonicalDir);
    const assessmentFiles = (await listFilesRecursive(assessmentDir))
        .filter(file => !BASE_MANIFEST_EXCLUSIONS.has(path.basename(file)));
    const artifacts = [];
    for (const file of [...canonicalFiles, ...assessmentFiles].sort()) {
        const root = file.startsWith(canonicalDir) ? canonicalDir : assessmentDir;
        const scope = file.startsWith(canonicalDir) ? 'canonical_package' : 'assessment';
        const relativePath = path.relative(root, file).replaceAll(path.sep, '/');
        const stat = await fs.stat(file);
        artifacts.push({
            scope,
            relativePath,
            path: file.replaceAll(path.sep, '/'),
            sizeBytes: stat.size,
            sha256: await sha256File(file)
        });
    }
    return {
        schemaVersion: 1,
        closedSet: true,
        exclusions: [...BASE_MANIFEST_EXCLUSIONS].sort(),
        artifactCount: artifacts.length,
        artifacts
    };
}

export async function verifyBaseAuditManifest({ canonicalDir, assessmentDir, manifest }) {
    const expected = new Map(manifest.artifacts.map(artifact => [`${artifact.scope}:${artifact.relativePath}`, artifact]));
    const currentManifest = await buildBaseAuditManifest({ canonicalDir, assessmentDir });
    const current = new Map(currentManifest.artifacts.map(artifact => [`${artifact.scope}:${artifact.relativePath}`, artifact]));
    const missingArtifacts = [];
    const extraArtifacts = [];
    const mismatches = [];
    for (const [key, artifact] of expected) {
        const actual = current.get(key);
        if (!actual) {
            missingArtifacts.push(artifact);
            continue;
        }
        if (actual.sizeBytes !== artifact.sizeBytes || actual.sha256 !== artifact.sha256) {
            mismatches.push({ expected: artifact, actual });
        }
        current.delete(key);
    }
    for (const artifact of current.values()) extraArtifacts.push(artifact);
    return {
        schemaVersion: 1,
        closedSet: manifest.closedSet === true,
        expectedArtifacts: expected.size,
        currentArtifacts: currentManifest.artifacts.length,
        missingArtifacts,
        extraArtifacts,
        mismatches,
        passed: manifest.closedSet === true
            && missingArtifacts.length === 0
            && extraArtifacts.length === 0
            && mismatches.length === 0
    };
}

export async function writeBaseManifestAndVerification({ canonicalDir, assessmentDir }) {
    const manifest = await buildBaseAuditManifest({ canonicalDir, assessmentDir });
    await writeJson(path.join(assessmentDir, 'audit-artifact-manifest.json'), manifest);
    const verification = await verifyBaseAuditManifest({ canonicalDir, assessmentDir, manifest });
    await writeJson(path.join(assessmentDir, 'audit-artifact-verification.json'), verification);
    return { manifest, verification };
}

export async function buildFinalAttestation({ canonicalDir, assessmentDir, reportPath }) {
    const files = [
        'audit-artifact-manifest.json',
        'audit-artifact-verification.json',
        'validation-matrix.json',
        'correction-gate.json',
        'correction-summary.json',
        'deterministic-rerun.json'
    ];
    const artifacts = [];
    for (const file of files) {
        const resolved = path.normalize(path.join(assessmentDir, file));
        artifacts.push({
            role: file,
            path: resolved.replaceAll(path.sep, '/'),
            sha256: await sha256File(resolved),
            sizeBytes: (await fs.stat(resolved)).size
        });
    }
    for (const file of ['canonical-state-gate.json', 'validation-summary.json']) {
        const resolved = path.join(canonicalDir, file);
        artifacts.push({
            role: file,
            path: resolved.replaceAll(path.sep, '/'),
            sha256: await sha256File(resolved),
            sizeBytes: (await fs.stat(resolved)).size
        });
    }
    artifacts.push({
        role: 'report',
        path: reportPath.replaceAll(path.sep, '/'),
        sha256: await sha256File(reportPath),
        sizeBytes: (await fs.stat(reportPath)).size
    });
    return {
        schemaVersion: 1,
        attestationType: 'replay_002_canonical_v6_final',
        artifacts,
        passed: true
    };
}
