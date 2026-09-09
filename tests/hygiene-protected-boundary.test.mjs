import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { snapshotAllowedMetadata, assertUnprotectedName } from '../scripts/hygiene-paths.mjs';
import { assertNoProtectedAlias } from '../tools/continuous-review/intake-model.mjs';
import { checkChangedArtifacts } from '../scripts/check-output-sizes.js';

function spyIo() {
    const calls = [];
    return { calls, io: {
        lstatSync(p) { calls.push(['lstat', p]); return { size: 1, isDirectory: () => !p.endsWith('.txt'), isFile: () => p.endsWith('.txt'), isSymbolicLink: () => false }; },
        readdirSync(p) { calls.push(['readdir', p]); return p.endsWith('fixture') ? ['allowed.txt', 'nested'] : p.endsWith('nested') ? ['alias-blocked.txt', 'allowed.txt'] : []; }
    } };
}
const syntheticPolicy = p => { if (p.includes('alias-blocked')) throw new Error('synthetic_policy_denied'); };

test('direct and nested injected blocked candidates cause zero filesystem calls', () => {
    for (const candidate of ['.local/test/alias-blocked', '.local/test/nested/alias-blocked.txt']) {
        const { calls, io } = spyIo();
        const result = snapshotAllowedMetadata([candidate], { io, assertAllowed: syntheticPolicy });
        assert.equal(calls.length, 0); assert.equal(result.excluded.length, 1);
    }
});
test('enumeration classifies child names before child metadata and never follows links', () => {
    const { calls, io } = spyIo();
    const result = snapshotAllowedMetadata(['.local/test/fixture'], { io, assertAllowed: syntheticPolicy });
    assert.equal(result.files.length, 2); assert.equal(result.excluded.length, 1);
    assert(!calls.some(([, p]) => p.includes('alias-blocked')));
    const linked = spyIo();
    linked.io.lstatSync = p => { linked.calls.push(['lstat',p]); return { isDirectory:()=>true,isSymbolicLink:()=>p.endsWith('fixture') }; };
    const stopped = snapshotAllowedMetadata(['.local/test/fixture'], { io:linked.io });
    assert.equal(stopped.excluded[0].reason,'link_not_followed');
    assert(!linked.calls.some(([op])=>op==='readdir'));
});
test('intake and hygiene share one protected definition; strings only, no canaries', () => {
    for (const id of ['005', '006', '007', '008']) for (const alias of [`replay_${id}`, `replay-${id}.dem`, `review_match_${id}`, `review-match-${id}`, `match_${id}`, `partida_${id}.dem`, `replay%5f${id}`, `replays/${id}/file`, `samples/partida_${id}.dem`, `output/replays/replay_${id}/evidence.json`]) {
        assert.throws(() => assertNoProtectedAlias(alias)); assert.throws(() => assertUnprotectedName(alias));
        const {calls,io}=spyIo();
        snapshotAllowedMetadata([`.local/test/${alias}`],{io});
        assert.equal(calls.length,0);
    }
});
test('task/document IDs and unrelated numbers are ordinary metadata, not replay aliases', () => {
    for (const candidate of ['tasks/completed/005-revise-lane-occupancy-model.md', 'tasks/completed/006-history.md', 'tasks/specs/007.json', 'reports/task-008-history.md', 'Task 005', 'metadata/1005.json', 'docs/numbers/005.txt']) {
        assert.doesNotThrow(()=>assertNoProtectedAlias(candidate));
        assert.doesNotThrow(()=>assertUnprotectedName(candidate));
        let lookups=0;
        const result=checkChangedArtifacts([{status:'M',path:candidate}],{}, {ancestorCheck:()=>{},io:{lstatSync:()=>{lookups++;return{size:102400,isFile:()=>true,isSymbolicLink:()=>false};}}});
        assert.equal(result.passed,true,candidate);assert.equal(lookups,1);
    }
});
test('deleted, rename destination and size guard reject protected candidates before all IO', () => {
    for (const status of ['D','R100','A','M']) {
        let calls=0;
        const result=checkChangedArtifacts([{status,path:'artifacts/review_match_005/large.any',...(status==='R100'?{oldPath:'artifacts/allowed.any'}:{})}], {}, {
            ancestorCheck:()=>calls++, io:{lstatSync:()=>{calls++;throw new Error('should not reach');}}
        });
        assert.equal(calls,0); assert.equal(result.passed,false);
    }
});
test('broad roots are rejected before metadata; bounded snapshots retain explicit budgets', () => {
    for(const candidate of ['.local','.local/codex','.local/deadem']) {
        const {calls,io}=spyIo();
        assert.throws(()=>snapshotAllowedMetadata([candidate],{io}));assert.equal(calls.length,0);
    }
    const {io}=spyIo();
    assert.throws(()=>snapshotAllowedMetadata(['.local/test/fixture'],{io,maxEntries:1}),/limit/);
    assert.equal(path.basename('allowed.txt'),'allowed.txt');
});
