import assert from 'node:assert/strict';
import test from 'node:test';
import { createHistoricalReader, retiredGroup } from '../scripts/historical-artifact-reader.mjs';
const root=process.cwd();
const base='a'.repeat(40);
const data={groups:[{originalPath:'output/replays/replay_003/shards',selector:'direct_jsonl_children',retainedNames:['kept.jsonl'],baseCommit:base,status:'RETIRED'}]};
const file='output/replays/replay_003/shards/a.jsonl';
const absent=()=>{const e=new Error('missing');e.code='ENOENT';throw e;};
test('manifest resolves only explicit safe retired JSONL groups, not media, protected, nested or retained paths',()=>{
    assert.equal(retiredGroup(file,data,root).baseCommit,base);
    for(const p of ['output/replays/replay_003/shards/kept.jsonl','output/replays/replay_003/shards/video.mp4','output/replays/replay_003/shards/sub/a.jsonl','output/other/a.jsonl'])assert.equal(retiredGroup(p,data,root),null);
    assert.throws(()=>retiredGroup('output/replays/replay_005/x.jsonl',data,root));
});
test('historical fallback returns exact bytes/text and never writes or restores',async()=>{
    const bytes=Buffer.from('{"synthetic":true}\n');const calls=[];
    const reader=createHistoricalReader({root,readFile:absent,stat:absent,getManifest:()=>data,git:async(c,args)=>{calls.push([c,args]);return{stdout:args[0]==='show'?bytes:String(bytes.length)};}});
    assert.deepEqual(await reader.readFile(file),bytes);
    assert.equal(await reader.readFile(file,'utf8'),bytes.toString());
    assert.equal((await reader.stat(file)).size,bytes.length);
    assert(calls.every(([c,args])=>c==='git'&&['show','cat-file'].includes(args[0])));
    assert(calls.every(([,args])=>args.at(-1)===`${base}:${file}`));
});
test('live filesystem takes precedence and nonmissing errors never fallback',async()=>{
    const reader=createHistoricalReader({readFile:async()=>Buffer.from('current'),getManifest:()=>{throw Error('should not consult history');}});
    assert.equal((await reader.readFile(file)).toString(),'current');
    const denied=createHistoricalReader({readFile:()=>{const e=new Error('denied');e.code='EACCES';throw e;},getManifest:()=>{throw Error('not reached');}});
    await assert.rejects(denied.readFile(file),/denied/);
});
test('protected alias stops before read/stat/manifest/Git; unrelated absence stays an error',async()=>{
    let calls=0;const spy=()=>{calls++;throw Error('IO forbidden');};
    const reader=createHistoricalReader({readFile:spy,stat:spy,getManifest:spy,git:spy});
    for(const p of ['output/replay_005/a.jsonl','output/review_match_008/a.jsonl','output/replay%5f006/a.jsonl']){await assert.rejects(reader.readFile(p),/protected/);await assert.rejects(reader.stat(p),/protected/);}
    assert.equal(calls,0);
    const missing=createHistoricalReader({readFile:absent,getManifest:()=>data});
    await assert.rejects(missing.readFile('output/unrelated.jsonl'),/missing/);
});
