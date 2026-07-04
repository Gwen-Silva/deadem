import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJson, sha256File } from '../lib/canonical-state/audits/common.mjs';

function parseArgs() {
    const args = process.argv.slice(2);
    const options = { assessmentDir: 'output/replay-002-canonical-v6-validation' };
    for (let index = 0; index < args.length; index += 1) {
        if (args[index] === '--assessment-output') options.assessmentDir = args[++index];
    }
    return options;
}

export async function verifyAttestation({ assessmentDir }) {
    const attestationPath = path.join(assessmentDir, 'final-attestation.json');
    const attestation = await readJson(attestationPath);
    const mismatches = [];
    for (const artifact of attestation.artifacts ?? []) {
        try {
            const actualHash = await sha256File(artifact.path);
            const actualSize = (await fs.stat(artifact.path)).size;
            if (actualHash !== artifact.sha256 || actualSize !== artifact.sizeBytes) {
                mismatches.push({ artifact, actualHash, actualSize });
            }
        } catch (error) {
            mismatches.push({ artifact, error: error.message });
        }
    }
    return {
        schemaVersion: 1,
        attestationPath: attestationPath.replaceAll(path.sep, '/'),
        artifactCount: attestation.artifacts?.length ?? 0,
        mismatches,
        passed: mismatches.length === 0 && attestation.passed === true
    };
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
    const result = await verifyAttestation(parseArgs());
    console.log(JSON.stringify(result, null, 2));
    if (!result.passed) process.exitCode = 1;
}

