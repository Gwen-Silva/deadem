import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stat } from 'node:fs/promises';
import { assertPathWithinRoots, readJson, sha256File } from '../lib/canonical-state/audits/common.mjs';

const REQUIRED_ROLES = ['release decision', 'release consistency verification', 'correction gate', 'correction summary', 'canonical gate', 'validation summary', 'final report', 'evidence attestation verification'];

function parseArgs() {
    const args = process.argv.slice(2);
    const options = {
        canonicalDir: 'output/replay-002-canonical',
        assessmentDir: 'output/replay-002-canonical-v8-validation',
        reportPath: 'reports/replay-002-canonical-factual-state-v8-validation.md'
    };
    for (let index = 0; index < args.length; index += 1) {
        if (args[index] === '--canonical-output') options.canonicalDir = args[++index];
        else if (args[index] === '--assessment-output') options.assessmentDir = args[++index];
        else if (args[index] === '--report') options.reportPath = args[++index];
    }
    return options;
}

export async function verifyReleaseEnvelope({ canonicalDir, assessmentDir, reportPath }) {
    const envelope = await readJson(path.join(assessmentDir, 'release-envelope.json'));
    const roots = { canonical_package: canonicalDir, assessment: assessmentDir, report: path.dirname(reportPath) };
    const counts = new Map();
    const missingRoles = [];
    const duplicateRoles = [];
    const unknownRoles = [];
    const mismatches = [];
    for (const artifact of envelope.artifacts ?? []) {
        counts.set(artifact.role, (counts.get(artifact.role) ?? 0) + 1);
        if (!REQUIRED_ROLES.includes(artifact.role)) unknownRoles.push(artifact.role);
        try {
            const resolved = assertPathWithinRoots(path.join(roots[artifact.scope] ?? '__invalid__', artifact.relativePath ?? ''));
            const actualHash = await sha256File(resolved);
            const actualSize = (await stat(resolved)).size;
            if (actualHash !== artifact.sha256 || actualSize !== artifact.sizeBytes) mismatches.push({ artifact, actualHash, actualSize });
        } catch (error) {
            mismatches.push({ artifact, error: error.message });
        }
    }
    for (const role of REQUIRED_ROLES) {
        const count = counts.get(role) ?? 0;
        if (count === 0) missingRoles.push(role);
        if (count > 1) duplicateRoles.push(role);
    }
    return { schemaVersion: 1, requiredRoles: REQUIRED_ROLES, missingRoles, duplicateRoles, unknownRoles, mismatches, passed: missingRoles.length === 0 && duplicateRoles.length === 0 && unknownRoles.length === 0 && mismatches.length === 0 };
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
    const result = await verifyReleaseEnvelope(parseArgs());
    console.log(JSON.stringify(result, null, 2));
    if (!result.passed) process.exitCode = 1;
}
