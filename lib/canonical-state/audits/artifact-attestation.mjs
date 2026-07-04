import { promises as fs } from 'node:fs';
import path from 'node:path';
import { sha256File, writeJson } from './common.mjs';

export const BASE_MANIFEST_EXCLUSIONS = new Set([
    'audit-artifact-manifest.json',
    'audit-artifact-verification.json',
    'evidence-matrix.json',
    'validation-matrix.json',
    'correction-gate.json',
    'correction-summary.json',
    'final-attestation.json',
    'final-attestation-verification.json',
    'release-decision.json'
]);

export const BASE_CANONICAL_EXCLUSIONS = new Set([
    'canonical-state-gate.json',
    'validation-summary.json'
]);

export const FINAL_ATTESTATION_REQUIRED_ROLES = [
    'audit artifact manifest',
    'audit artifact verification',
    'evidence matrix',
    'validation matrix',
    'correction gate',
    'correction summary',
    'canonical gate',
    'validation summary',
    'deterministic rerun',
    'final report'
];

export function assertPathWithinRoots(resolvedPath, allowedRoots) {
    const absolutePath = path.resolve(resolvedPath);
    const roots = allowedRoots.map(root => path.resolve(root));
    for (const root of roots) {
        const relative = path.relative(root, absolutePath);
        if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) {
            return absolutePath;
        }
    }
    throw new Error(`Path outside allowed roots: ${resolvedPath}`);
}

function relativeInside(root, file) {
    const relative = path.relative(path.resolve(root), path.resolve(file));
    if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new Error(`Path escaped manifest root: ${file}`);
    }
    return relative.replaceAll(path.sep, '/');
}

export async function listFilesRecursive(root, allowedRoots = [root]) {
    const safeRoot = assertPathWithinRoots(root, allowedRoots);
    const entries = await fs.readdir(safeRoot, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
        const full = assertPathWithinRoots(path.join(safeRoot, entry.name), allowedRoots);
        if (entry.isDirectory()) files.push(...await listFilesRecursive(full, allowedRoots));
        else files.push(full);
    }
    return files.sort();
}

async function artifactRecord({ scope, root, file }) {
    const stat = await fs.stat(assertPathWithinRoots(file, [root]));
    return {
        scope,
        relativePath: relativeInside(root, file),
        sizeBytes: stat.size,
        sha256: await sha256File(file)
    };
}

export async function buildBaseAuditManifest({ canonicalDir, assessmentDir }) {
    const canonicalFiles = (await listFilesRecursive(canonicalDir, [canonicalDir]))
        .filter(file => !BASE_CANONICAL_EXCLUSIONS.has(path.basename(file)));
    const assessmentFiles = (await listFilesRecursive(assessmentDir, [assessmentDir]))
        .filter(file => !BASE_MANIFEST_EXCLUSIONS.has(path.basename(file)));
    const artifacts = [];
    for (const file of canonicalFiles) {
        artifacts.push(await artifactRecord({ scope: 'canonical_package', root: canonicalDir, file }));
    }
    for (const file of assessmentFiles) {
        artifacts.push(await artifactRecord({ scope: 'assessment', root: assessmentDir, file }));
    }
    artifacts.sort((a, b) => `${a.scope}:${a.relativePath}`.localeCompare(`${b.scope}:${b.relativePath}`));
    return {
        schemaVersion: 2,
        closedSet: true,
        scopes: {
            canonical_package: 'canonical_package',
            assessment: 'assessment'
        },
        exclusions: {
            canonical_package: [...BASE_CANONICAL_EXCLUSIONS].sort(),
            assessment: [...BASE_MANIFEST_EXCLUSIONS].sort()
        },
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
        schemaVersion: 2,
        closedSet: manifest.closedSet === true,
        expectedArtifacts: expected.size,
        currentArtifacts: currentManifest.artifacts.length,
        missingArtifacts,
        extraArtifacts,
        mismatches,
        canonicalGateCoveredByBaseManifest: false,
        validationSummaryCoveredByBaseManifest: false,
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

async function attestationArtifact({ role, scope, root, file }) {
    const safeFile = assertPathWithinRoots(file, [root]);
    const stat = await fs.stat(safeFile);
    return {
        role,
        scope,
        relativePath: relativeInside(root, safeFile),
        sha256: await sha256File(safeFile),
        sizeBytes: stat.size
    };
}

export async function buildFinalAttestation({ canonicalDir, assessmentDir, reportPath }) {
    const assessmentRoles = [
        ['audit artifact manifest', 'audit-artifact-manifest.json'],
        ['audit artifact verification', 'audit-artifact-verification.json'],
        ['evidence matrix', 'evidence-matrix.json'],
        ['validation matrix', 'validation-matrix.json'],
        ['correction gate', 'correction-gate.json'],
        ['correction summary', 'correction-summary.json'],
        ['deterministic rerun', 'deterministic-rerun.json']
    ];
    const artifacts = [];
    for (const [role, file] of assessmentRoles) {
        artifacts.push(await attestationArtifact({ role, scope: 'assessment', root: assessmentDir, file: path.join(assessmentDir, file) }));
    }
    artifacts.push(await attestationArtifact({ role: 'canonical gate', scope: 'canonical_package', root: canonicalDir, file: path.join(canonicalDir, 'canonical-state-gate.json') }));
    artifacts.push(await attestationArtifact({ role: 'validation summary', scope: 'canonical_package', root: canonicalDir, file: path.join(canonicalDir, 'validation-summary.json') }));
    artifacts.push(await attestationArtifact({ role: 'final report', scope: 'report', root: path.dirname(reportPath), file: reportPath }));
    return {
        schemaVersion: 2,
        attestationType: 'replay_002_canonical_v7_final',
        requiredRoles: FINAL_ATTESTATION_REQUIRED_ROLES,
        artifacts
    };
}

export async function verifyFinalAttestation({ canonicalDir, assessmentDir, reportPath, attestation }) {
    const allowedRootsByScope = {
        canonical_package: canonicalDir,
        assessment: assessmentDir,
        report: path.dirname(reportPath)
    };
    const roleCounts = new Map();
    const missingRoles = [];
    const duplicateRoles = [];
    const unknownRoles = [];
    const pathViolations = [];
    const mismatches = [];
    const declaredPassedFieldPresent = Object.hasOwn(attestation, 'passed');
    for (const artifact of attestation.artifacts ?? []) {
        roleCounts.set(artifact.role, (roleCounts.get(artifact.role) ?? 0) + 1);
        if (!FINAL_ATTESTATION_REQUIRED_ROLES.includes(artifact.role)) unknownRoles.push(artifact.role);
        const root = allowedRootsByScope[artifact.scope];
        if (!root) {
            pathViolations.push({ artifact, reason: 'unknown_scope' });
            continue;
        }
        let resolved;
        try {
            resolved = assertPathWithinRoots(path.join(root, artifact.relativePath), [root]);
        } catch (error) {
            pathViolations.push({ artifact, reason: error.message });
            continue;
        }
        try {
            const stat = await fs.stat(resolved);
            const actualHash = await sha256File(resolved);
            if (stat.size !== artifact.sizeBytes || actualHash !== artifact.sha256) {
                mismatches.push({ artifact, actual: { sizeBytes: stat.size, sha256: actualHash } });
            }
        } catch (error) {
            mismatches.push({ artifact, actual: null, error: error.message });
        }
    }
    for (const role of FINAL_ATTESTATION_REQUIRED_ROLES) {
        const count = roleCounts.get(role) ?? 0;
        if (count === 0) missingRoles.push(role);
        if (count > 1) duplicateRoles.push(role);
    }
    return {
        schemaVersion: 1,
        requiredRoles: FINAL_ATTESTATION_REQUIRED_ROLES,
        artifactCount: attestation.artifacts?.length ?? 0,
        declaredPassedFieldPresent,
        missingRoles,
        duplicateRoles,
        unknownRoles,
        pathViolations,
        mismatches,
        passed: !declaredPassedFieldPresent
            && missingRoles.length === 0
            && duplicateRoles.length === 0
            && unknownRoles.length === 0
            && pathViolations.length === 0
            && mismatches.length === 0
    };
}
