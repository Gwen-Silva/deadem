import { finalize } from './finalize-replay-002-canonical-v6.mjs';

const result = await finalize({
    outputDir: 'output/replay-002-canonical',
    assessmentDir: 'output/replay-002-canonical-v6-validation',
    clean: true,
    skipRerun: false
});

console.log(JSON.stringify(result.deterministic, null, 2));
if (!result.deterministic.deterministic) process.exitCode = 1;
