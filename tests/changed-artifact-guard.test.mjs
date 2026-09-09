import assert from 'node:assert/strict';
import test from 'node:test';
import { checkChangedArtifacts, parseNameStatus, validateLargeExceptions, collectChanges } from '../scripts/check-output-sizes.js';
import { assertUnprotectedName } from '../scripts/hygiene-paths.mjs';
import { boundedGitStatus, boundedReviewChanges } from '../scripts/codex-workflow.js';

function run(changes, bytes = 102400, largeOutputsAllowed = []) {
    const calls = [];
    const result = checkChangedArtifacts(changes, { largeOutputsAllowed }, {
        ancestorCheck: p => calls.push(['ancestor', p]),
        io: { lstatSync: p => { calls.push(['lstat', p]); return { size: bytes, isFile: () => true, isSymbolicLink: () => false }; } }
    });
    return { result, calls };
}
test('nested destinations of any extension use exactly 100 KiB limit', () => {
    for (const ext of ['json', 'jsonl', 'bin', 'md', 'mjs']) {
        const changes = [{ status: 'A', path: `artifacts/unit/nested/file.${ext}` }];
        assert(run(changes).result.passed);
        assert(!run(changes, 102401).result.passed);
    }
});
test('deleted files are not statted and renamed destinations are evaluated', () => {
    const changes = parseNameStatus('D\0output/old.json\0R100\0output/prior.json\0artifacts/nested/new.bin\0');
    const { result, calls } = run(changes);
    assert(result.passed);assert.equal(calls.length, 2);
    assert.equal(result.results[0].action, 'deleted_no_stat');
    assert(calls.every(([,p])=>!p.endsWith('old.json')&&!p.endsWith('prior.json')));
});
test('all protected names and encoded aliases are rejected before any IO, including deletions', () => {
    for (const id of ['005','006','007','008']) for (const alias of [`replay_${id}`,`review-match-${id}`,`partida_${id}`,`MATCH${id}`,`replay%5f${id}`]) {
        for (const status of ['A','M','D']) {
            const { result, calls } = run([{status,path:`output/${alias}/x.json`}]);
            assert(!result.passed);assert.equal(calls.length,0);
        }
    }
    assert.doesNotThrow(()=>assertUnprotectedName('output/replays/replay_003/chunk_005.jsonl'));
});
test('exceptions require exact path and meaningful reason, never glob or legacy string bypass', () => {
    for(const entries of [['artifacts/**'],[{path:'artifacts/**',reason:'large'}],[{path:'artifacts/x.bin'}],[{path:'artifacts/x.bin',reason:' '}],[{path:'output/replay_005/x',reason:'no'}]]) assert.throws(()=>validateLargeExceptions(entries));
    const changes=[{status:'M',path:'artifacts/x.bin'}];
    assert(run(changes,102401,[{path:'artifacts/x.bin',reason:'Explicit bounded fixture approved by Work'}]).result.passed);
    assert(!run(changes,102401,[{path:'artifacts/y.bin',reason:'Different path'}]).result.passed);
});
test('traversal, absolute paths, linked destination and invalid rename fail closed', () => {
    for(const p of ['../escape','C:/secret','/tmp/file','a/../b']) {const x=run([{status:'A',path:p}]);assert(!x.result.passed);assert.equal(x.calls.length,0);}
    const result=checkChangedArtifacts([{status:'A',path:'artifacts/link'}],{}, {ancestorCheck:()=>{},io:{lstatSync:()=>({isFile:()=>true,isSymbolicLink:()=>true})}});
    assert(!result.passed);assert.throws(()=>parseNameStatus('R100\0only-source\0'));
});
test('Git discovery asks only for task diff and untracked names, not historical output scan', () => {
    const commands=[];
    const rows=collectChanges('a'.repeat(40),process.cwd(),a=>{commands.push(a);return a[0]==='diff'?'M\0scripts/guard.js\0':'artifacts/new.json\0';});
    assert.equal(commands.length,2);assert.equal(rows.length,2);
    assert.deepEqual(commands[0].slice(0,4),['diff','--name-status','-z','-M']);
});

test('linked ancestor fails before destination metadata and protected rename source uses no IO', () => {
    const calls = [];
    const result = checkChangedArtifacts([{ status: 'A', path: 'artifacts/link/file.json' }], {}, {
        io: { lstatSync: p => { calls.push(p); return { isSymbolicLink: () => p.endsWith('link'), isDirectory: () => true }; } }
    });
    assert(!result.passed);
    assert.equal(calls.length, 2);
    assert(!calls.some(p => p.endsWith('file.json')));
    const rename = run([{ status: 'R100', oldPath: 'output/replay_005/x', path: 'artifacts/x' }]);
    assert(!rename.result.passed); assert.equal(rename.calls.length, 0);
});

test('large retirement status is bounded without losing operation counts', () => {
    assert.equal(boundedGitStatus(''), 'clean');
    assert.equal(boundedGitStatus(' M code.js'), ' M code.js');
    const status = Array.from({length:254}, (_, i) => `D  output/historical/long-file-${i}.jsonl`).join('\n');
    const bounded = boundedGitStatus(status);
    assert(Buffer.byteLength(bounded) < 2048);
    assert.match(bounded, /254 status entries/u);
    assert.match(bounded, /"D":254/u);
    assert.match(bounded, /complete changed-file list/u);
    const files = status.split('\n').map(line => line.slice(3));
    const review = boundedReviewChanges('222', files);
    assert.deepEqual(review.changedFiles, []);
    assert.equal(review.changedFileCount, 254);
    assert.equal(review.changedFilesManifest.path, '.local/codex/222/review-changed-files.json');
    assert.match(review.changedFilesManifest.sha256, /^[a-f0-9]{64}$/u);
    assert.deepEqual(boundedReviewChanges('222', ['source.js']), { changedFiles: ['source.js'] });
});
