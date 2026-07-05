import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJsonWithinRoots, writeJsonWithinRoots } from '../lib/canonical-state/audits/common.mjs';
import { verifyReleaseEnvelope } from './finalize-replay-002-canonical-v9.mjs';

const DEFAULT_ASSESSMENT = 'output/replay-002-canonical-v9-validation';
const REPORT = 'reports/replay-002-canonical-factual-state-v9-validation.md';

function parseArgs() {
    const args = process.argv.slice(2);
    const options = { assessmentDir: DEFAULT_ASSESSMENT, reportPath: REPORT, write: false };
    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index];
        if (arg === '--assessment-output') options.assessmentDir = args[++index];
        else if (arg === '--report') options.reportPath = args[++index];
        else if (arg === '--write') options.write = true;
    }
    return options;
}

export async function verify(options = parseArgs()) {
    const envelope = await readJsonWithinRoots(path.join(options.assessmentDir, 'release-envelope.json'), [options.assessmentDir]);
    const result = await verifyReleaseEnvelope({ assessmentDir: options.assessmentDir, reportPath: options.reportPath, envelope });
    if (options.write) await writeJsonWithinRoots(path.join(options.assessmentDir, 'release-envelope-verification.json'), result, [options.assessmentDir]);
    return result;
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
    const result = await verify();
    console.log(JSON.stringify(result, null, 2));
    if (!result.passed) process.exitCode = 1;
}
