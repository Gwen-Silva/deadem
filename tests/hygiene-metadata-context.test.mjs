import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { classifyFilesystemTarget, assertUnprotectedName } from '../scripts/hygiene-paths.mjs';
import { checkChangedArtifacts } from '../scripts/check-output-sizes.js';
import { readTaskFiles } from '../scripts/validate-task-queue.js';

test('all protected IDs distinguish input packages from documentation and code', () => {
    for(const id of ['005','006','007','008']) {
        for(const file of [`replay_${id}`,`replay_${id}.json`,`replay-${id}.dem`,`review_match_${id}`,`partida_${id}.dem`,`samples/partida_${id}.dem`,`output/replays/replay_${id}/example.json`,`.local/deadem/review-targets/review_match_${id}/metadata.json`]) {
            assert.equal(classifyFilesystemTarget(file),'PROTECTED_INPUT',file);
            let calls=0;
            const result=checkChangedArtifacts([{status:'M',path:file}],{}, {ancestorCheck:()=>calls++,io:{lstatSync:()=>{calls++;}}});
            assert.equal(result.passed,false);assert.equal(calls,0);
        }
        for(const file of [`tasks/completed/051-investigate-replay-${id}-foo.md`,`reports/replay-${id}-oracle-comparison.md`,`scripts/investigate-replay-${id}-entity-lifecycle.js`,`tasks/specs/${id}.json`,`reports/task-${id}-example.md`]) {
            assert.equal(classifyFilesystemTarget(file),'SAFE_REPOSITORY_METADATA',file);
            assert.doesNotThrow(()=>assertUnprotectedName(path.resolve(file)));
            let calls=0;
            const result=checkChangedArtifacts([{status:'R100',oldPath:'docs/prior.md',path:file}],{}, {ancestorCheck:()=>{},io:{lstatSync:()=>{calls++;return{size:1,isFile:()=>true,isSymbolicLink:()=>false};}}});
            assert(result.passed);assert.equal(calls,1);
        }
    }
    assert.equal(classifyFilesystemTarget('docs/PARSER_FAILURE_CATALOG.md'),'SAFE_REPOSITORY_METADATA');
    assert.equal(classifyFilesystemTarget('tasks/completed/005-revise-lane-occupancy-model.md'),'SAFE_REPOSITORY_METADATA');
    assert.equal(classifyFilesystemTarget('tasks/completed/partida_006.dem'),'PROTECTED_INPUT');
});
test('task reader classifies lexical entries before primitives and never treats content as input',()=>{
    const taskList=[];const calls=[];
    const base=path.resolve('tasks');
    const io={existsSync:()=>true,readdirSync:()=>['051-investigate-replay-006-foo.md'],lstatSync:p=>{calls.push(['stat',p]);return{isFile:()=>true,isSymbolicLink:()=>false};},readFileSync:p=>{calls.push(['read',p]);return 'Status: completed\nText mentions partida_006.dem, not a replay read.\n';}};
    readTaskFiles('completed',{io,taskRoot:base,taskList,errorList:[]});
    assert.equal(taskList.length,1);assert.equal(calls.length,2);
    assert.match(taskList[0].text,/partida_006.dem/);
    calls.length=0;
    io.readdirSync=()=>['partida_006.dem'];
    assert.throws(()=>readTaskFiles('completed',{io,taskRoot:base,taskList:[],errorList:[]}),/protected/);
    assert.equal(calls.length,0);
});
test('metadata classification does not grant directories or media an exemption',()=>{
    for(const file of ['reports/replay_006','tasks/completed/replay_007','scripts/replay_005/input.dem','output/replays/replay_008/report.md'])assert.equal(classifyFilesystemTarget(file),'PROTECTED_INPUT');
    assert.equal(classifyFilesystemTarget('../reports/replay_006.md'),'UNRESOLVED');
});
