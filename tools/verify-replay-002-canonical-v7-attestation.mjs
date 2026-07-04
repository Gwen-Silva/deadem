import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyFinalAttestation } from '../lib/canonical-state/audits/artifact-attestation.mjs';
import { readJson } from '../lib/canonical-state/audits/common.mjs';

function parseArgs() {
    const args = process.argv.slice(2);
    const options = {
        canonicalDir: 'output/replay-002-canonical',
        assessmentDir: 'output/replay-002-canonical-v7-validation',
        reportPath: 'reports/replay-002-canonical-factual-state-v7-validation.md'
    };
    for (let index = 0; index < args.length; index += 1) {
        if (args[index] === '--canonical-output') options.canonicalDir = args[++index];
        else if (args[index] === '--assessment-output') options.assessmentDir = args[++index];
        else if (args[index] === '--report') options.reportPath = args[++index];
    }
    return options;
}

export async function verifyAttestation({ canonicalDir, assessmentDir, reportPath }) {
    const attestationPath = path.join(assessmentDir, 'final-attestation.json');
    const attestation = await readJson(attestationPath);
    return verifyFinalAttestation({ canonicalDir, assessmentDir, reportPath, attestation });
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
    const result = await verifyAttestation(parseArgs());
    console.log(JSON.stringify(result, null, 2));
    if (!result.passed) process.exitCode = 1;
}
