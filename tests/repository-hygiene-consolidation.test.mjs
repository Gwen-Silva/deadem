import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {execFileSync} from 'node:child_process';
import {assertUnprotectedName,classifyFilesystemTarget} from '../scripts/hygiene-paths.mjs';
import {loadWorkspaceData,DEFAULT_REPO_ROOT} from '../tools/review-workspace/data-model.mjs';
import {loadLocalScrimData} from '../tools/review-workspace/scrim-media.mjs';
import {REVIEW_FIELD_DEFINITIONS} from '../tools/review-workspace/ux-model.mjs';
import {validateSpecObject,largeAllowed} from '../scripts/codex-workflow.js';
const json=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const git=(args,input)=>execFileSync('git',args,{encoding:'utf8',input,maxBuffer:16*1024*1024}).trim();
const manifest=json('artifacts/repository-hygiene/task222/retirement-manifest.json');

test('all retired selectors resolve exact accepted Git identities and logical bytes without destination IO',()=>{
    let count=0,bytes=0;
    for(const g of manifest.groups){
        assertUnprotectedName(g.originalPath);assert.equal(g.status,'RETIRED');
        assert.equal(git(['rev-parse',`${g.baseCommit}:${g.originalPath}`]),g.gitIdentity);
        const members=g.selector==='exact_file'?[{path:g.originalPath,oid:g.gitIdentity}]:git(['ls-tree',`${g.baseCommit}:${g.originalPath}`]).split('\n').filter(Boolean).map(line=>{const [meta,name]=line.split('\t');return{path:g.originalPath+'/'+name,oid:meta.split(' ')[2]};}).filter(r=>r.path.endsWith('.jsonl')&&!g.retainedNames.includes(path.posix.basename(r.path)));
        for(const r of members)assertUnprotectedName(r.path);
        const sizes=git(['cat-file','--batch-check=%(objectsize)'],members.map(r=>r.oid).join('\n')+'\n').split('\n').map(Number);
        assert.equal(members.length,g.fileCount);assert.equal(sizes.reduce((a,b)=>a+b,0),g.logicalBytes);
        count+=members.length;bytes+=g.logicalBytes;
    }
    assert.equal(count,254);assert.equal(bytes,545585175);assert(bytes>=500*1024*1024);
});
test('current navigation, exact-path guard and forward storage policy agree',()=>{
    const view=json('data/current-project-index.json');const state=json('data/project-coordination-state.json');const storage=json('data/artifact-storage-policy.json');const spec=json('tasks/specs/222.json');
    assert.equal(view.acceptedBase.commit,state.lastAcceptedCommit);
    assert.equal(view.currentMilestone.status,'GENERIC_INTAKE_READY');
    assert.equal(storage.largeOutputThresholdBytes,102400);assert.equal(storage.compactEvidenceRoot,'artifacts/');
    assert(Buffer.byteLength(JSON.stringify(view))<8192);
    for(const p of [...view.currentDocs,...view.activeCapabilities.map(c=>c.entry)]){assert.equal(classifyFilesystemTarget(p),'SAFE_REPOSITORY_METADATA');assert(fs.existsSync(p));}
    const allowed={...spec,largeOutputsAllowed:[{path:'artifacts/approved.bin',reason:'Work authorized exact fixture'}]};
    assert(validateSpecObject(allowed,'tasks/specs/222.json').valid);assert(largeAllowed(allowed,'artifacts/approved.bin'));
    for(const exceptions of [[{path:'artifacts/**',reason:'bypass'}],[{path:'artifacts/approved.bin',reason:''}],['artifacts/approved.bin']])assert(!validateSpecObject({...spec,largeOutputsAllowed:exceptions},'tasks/specs/222.json').valid);
});
test('accepted runtime source and envelopes remain unchanged and preserve all product cardinalities',async()=>{
    const prefixes=['packages','tools/review-workspace','output/local-replay-processing/assisted-review-bundles/task204-bounded2','output/local-replay-processing/assisted-review/task212-matches-003-004','data/task-contribution-index.json','data/capability-index.json','data/current-artifact-registry.json'];
    assert.equal(git(['diff','--name-only',manifest.baseCommit,'--',...prefixes]),'');
    const data=await loadWorkspaceData();const scrim=loadLocalScrimData(DEFAULT_REPO_ROOT).view;
    const metrics={targets:data.targets.length,moments:data.candidateById.size,legacy:[...data.candidateById.values()].filter(c=>['review_match_001','review_match_002'].includes(c.reviewTargetId)).length,markers003:data.candidatesByTarget.get('review_match_003').length,markers004:data.candidatesByTarget.get('review_match_004').length,reviewFields:REVIEW_FIELD_DEFINITIONS.length,errorClasses:data.reviewProtocol.errorVocabulary.length,craigTracks:scrim.tracks.length};
    assert.deepEqual(metrics,{targets:4,moments:207,legacy:102,markers003:48,markers004:57,reviewFields:11,errorClasses:15,craigTracks:9});
    console.log('Task222 runtime invariants '+JSON.stringify(metrics));
    assert.equal(data.accessAudit.protectedAccessCount,0);assert.equal(data.accessAudit.replayAccessCount,0);assert.equal(data.accessAudit.vodAccessCount,0);
});
