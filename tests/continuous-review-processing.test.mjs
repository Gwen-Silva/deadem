import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {validateTarget,safePath,freshAudit,digest,PROCESSING_ROOT,ROOT,atomicJson} from '../tools/continuous-review/processing-safety.mjs';
import {resolveRegistered,resolveHistoricalCanary,verifyDescriptor,resolveSyncEvidence} from '../tools/continuous-review/processing-inputs.mjs';
import {processingIdentity,executeStages,validateEnvelope,parseArguments,withTargetLock} from '../tools/continuous-review/process.mjs';
import {compareFactual,fitSynchronization,compareSync,generateCandidates,planVisuals,validateVisuals,buildBundle,envelope,STAGES} from '../tools/continuous-review/processing-stages.mjs';
import {buildManifest} from '../tools/continuous-review/intake-model.mjs';
import {syntheticMp4,syntheticReplay} from '../tools/continuous-review/canary.mjs';
const fakeDescriptor=()=>({reviewTargetId:'review_match_009',mode:'production',intakeFingerprint:'a'.repeat(64),manifestSha256:'b'.repeat(64),association:{method:'human_supplied_local_scrim_bundle'},inputs:{replay:{sha256:'c'.repeat(64)},video:{sha256:'d'.repeat(64),durationSeconds:200},communication:{status:'not_supplied',trackCount:0,tracks:[]}}});
const anchors=()=>Array.from({length:12},(_,i)=>({anchorId:`a${i}`,role:i%2?'validation':'fit',region:['start','start','early','early','mid','mid','late','late','end','end','end','end'][i],replayElapsedSeconds:i*10,vodTimeSeconds:i*10+5,uncertaintySeconds:0.25,evidence:{replay:'synthetic_raw_time',vod:'synthetic_observation'}}));
const factual=()=>({counts:{time:121,participants:1,teams:1,heroes:1,lifeState:2,netWorth:2,damage:1,healing:1,objectives:2,positions:0},normalizedTimeCoverage:{firstTime:0,lastTime:120,monotonic:true,gaps:[]},parser:{tickRate:64},localArtifacts:{},availability:{positions:{status:'unavailable'}},semanticContract:{positions:'missing_remains_missing'}});
const rows=()=>({lifeState:[{participantKey:'ref',elapsedSeconds:10,lifeState:0},{participantKey:'ref',elapsedSeconds:20,lifeState:1}],netWorth:[{participantKey:'ref',elapsedSeconds:10,value:1},{participantKey:'ref',elapsedSeconds:20,value:2}],damage:[{participantKey:'ref',elapsedSeconds:20,delta:4}],healing:[{participantKey:'ref',elapsedSeconds:20,delta:3}],objectives:[{entityRef:'structure',elapsedSeconds:10,health:20},{entityRef:'structure',elapsedSeconds:20,health:10}]});
async function localFixture(){const root=path.join(PROCESSING_ROOT,'task223-test-fixtures');await fs.mkdir(root,{recursive:true});return fs.mkdtemp(path.join(root,'run-'));}

test('production and historical namespaces are disjoint and protected IDs invoke zero filesystem primitives',async()=>{
 for(const n of ['009','050','099','999'])assert.equal(validateTarget(`review_match_${n}`),`review_match_${n}`);
 for(const n of ['001','002','003','004'])assert.throws(()=>validateTarget(`review_match_${n}`));
 for(const n of ['005','006','007','008']){
  let calls=0;const io={readJson:async()=>{calls++;},readdir:async()=>{calls++;return[];}};
  await assert.rejects(resolveRegistered(`review_match_${n}`,{io}));
  await assert.rejects(safePath(`Z:/replay_${n}/input.dem`,{io:{lstat:async()=>{calls++;}}}));
  await assert.rejects(resolveHistoricalCanary(`review_match_${n}`,{loadAccepted:async()=>{calls++;},loadPrivate:async()=>{calls++;}}));
  assert.equal(calls,0);
 }
 assert.equal(validateTarget('review_match_003','historical-canary'),'review_match_003');
 assert.throws(()=>parseArguments(['--target','review_match_009','--replay','arbitrary.dem']));
});
test('unsafe linked ancestor is rejected before protected destination can be followed',async()=>{
 const calls=[];await assert.rejects(safePath(path.join(ROOT,'synthetic-link','file'),{io:{lstat:async p=>{calls.push(p);return{isSymbolicLink:()=>p.endsWith('synthetic-link'),isDirectory:()=>true};}}}),/linked/);
 assert(!calls.some(p=>p.endsWith('file')));
});
test('registered descriptor validates exact real synthetic sources without registration writes; conflicts fail closed',async()=>{
 const dir=await localFixture();for(const kind of ['replay','video'])await fs.mkdir(path.join(dir,kind));
 const rb=syntheticReplay(),vb=syntheticMp4();const rp=path.join(dir,'replay/input.dem'),vp=path.join(dir,'video/input.mp4');await fs.writeFile(rp,rb);await fs.writeFile(vp,vb);
 const manifest=buildManifest({reviewTargetId:'review_match_009',sourceRoot:dir,replay:{status:'available',sourcePath:rp,localIdentifier:'replay_input',extension:'.dem',sizeBytes:rb.length,sha256:digest(rb),format:'source2_demo_pbde_ms2',signature:'PBDEMS2',summaryOffset:16,probeMethod:'pbde_ms2_header_only',provenance:'factual/local_file_identity'},video:{status:'available',sourcePath:vp,localIdentifier:'video_input',extension:'.mp4',sizeBytes:vb.length,sha256:digest(vb),format:'iso_base_media_mp4',majorBrand:'isom',durationSeconds:60,probeMethod:'mp4_mvhd_random_access',provenance:'factual/local_file_identity'},communication:{status:'not_supplied',trackCount:0,ordering:'natural_filename_order_en_numeric',tracks:[],supportFiles:{infoTxt:false,rawDat:false},provenance:'unprocessed/not_supplied'}});
 manifest.inputs.replay.summaryOffset=32;manifest.inputs.video.majorBrand='iso4';manifest.inputs.video.durationSeconds=12.345;manifest.metadata.factual.videoDurationSeconds=12.345;
 const io={readJson:async()=>manifest,readdir:async()=>['review_match_009']};const audit=freshAudit();
 const descriptor=await resolveRegistered('review_match_009',{registryRoot:dir,io,audit});assert.equal(descriptor.copyPolicy,'reference_in_place_no_copy');assert.equal(audit.protectedAccessCount,0);
 await fs.writeFile(rp,Buffer.alloc(rb.length));await assert.rejects(verifyDescriptor(descriptor,freshAudit()),/fingerprint/);
 const corrupt={...manifest,intakeFingerprint:'0'.repeat(64)};await assert.rejects(resolveRegistered('review_match_009',{registryRoot:dir,io:{...io,readJson:async()=>corrupt}}),/fingerprint/);
});
test('missing registered manifest never falls back to arbitrary source discovery',async()=>{
 let reads=0;await assert.rejects(resolveRegistered('review_match_009',{io:{readJson:async()=>{reads++;throw Object.assign(new Error('missing'),{code:'ENOENT'});},readdir:async()=>{throw new Error('must_not_discover');}}}),/missing/);assert.equal(reads,1);
});
test('factual comparison preserves all declared fields, absent positions and baseline mismatches',()=>{
 const f=factual(),baseline={counts:f.counts,replayCoverage:f.normalizedTimeCoverage,parser:f.parser,gapCount:0};assert(compareFactual(f,baseline).passed);
 assert(!compareFactual({...f,counts:{...f.counts,lifeState:3}},baseline).passed);assert.equal(f.counts.positions,0);
 const historical={...baseline,counts:{...baseline.counts,time:2837,participants:14,teams:3,heroes:13,lifeState:39688,netWorth:39688,damage:4200,healing:5137,objectives:11275,positions:0},replayCoverage:{firstTime:0,lastTime:2836,monotonic:true,gaps:[]}};
 assert(compareFactual({...f,counts:historical.counts,normalizedTimeCoverage:historical.replayCoverage},historical).passed);
});
test('synchronization is deterministic, identity-independent of baseline and retains uncovered ranges and uncertainty',()=>{
 const model=fitSynchronization(factual(),{anchors:anchors()},200);assert.deepEqual(model,fitSynchronization(factual(),{anchors:anchors()},200));
 assert.equal(model.interceptSeconds,5);assert.equal(model.estimatedOperationalReplayVodErrorSeconds,0.25);assert.deepEqual(model.uncoveredReplayRanges,[{start:110,end:120}]);
 assert(!compareSync(model,{interceptSeconds:9,estimatedOperationalReplayVodErrorSeconds:0.25}).passed);
 assert.throws(()=>fitSynchronization(factual(),{anchors:anchors().slice(0,2)},200));assert.throws(()=>fitSynchronization(factual(),{anchors:anchors()},10));
});
test('frozen Task202 creates heuristic windows without gameplay event labels or fitting to population counts',()=>{
 const sync=fitSynchronization(factual(),{anchors:anchors()},200),c=generateCandidates('review_match_009','production',rows(),sync);
 assert.deepEqual(c.policy,{binSeconds:5,activityPercentile:0.75,mergeGapSeconds:15,paddingSeconds:12,maximumWindowSeconds:90});assert(c.windows.length>0);
 for(const w of c.windows){assert.equal(w.prioritySemantics,'review_priority_heuristic_not_probability');assert.equal(w.candidateSemantics,'review_attention_region_not_gameplay_event');assert.equal(w.priorityTier,'high');assert.deepEqual(w.analystInference,[]);assert(!('eventType'in w));}
 const changed=execFileSync('git',['diff','--name-only','61d1ac0586e45009b7672bf33643a3924ed260a0','--','tools/emit-review-candidate-windows.mjs'],{encoding:'utf8'}).trim();assert.equal(changed,'');
});
test('visual plan requires current sync, complete three-role decoding, local media and no embedded image bytes',()=>{
 const sync=fitSynchronization(factual(),{anchors:anchors()},200),c=generateCandidates('review_match_009','production',rows(),sync),plan=planVisuals(c,sync);
 assert.equal(plan.rows.length,c.windows.length*3);const frames=plan.rows.map(r=>({...r,status:'decoded',decodedVodSeconds:r.requestedVodSeconds,sha256:'a'.repeat(64)}));assert.equal(validateVisuals(plan,frames).coverage,1);
 assert.throws(()=>validateVisuals(plan,frames.slice(1)));assert.throws(()=>validateVisuals(plan,frames.map(f=>({...f,status:'failed'}))));assert(!JSON.stringify(plan).includes('base64'));
 assert.throws(()=>planVisuals(c,{...sync,interceptSeconds:sync.interceptSeconds+1}));
});
test('review bundle has exact 11 blank human fields and 15 accepted error classes; no Product registration',()=>{
 const d=fakeDescriptor(),context={descriptor:d,runId:'e'.repeat(64)},f=factual(),sync=fitSynchronization(f,{anchors:anchors()},200),c=generateCandidates(d.reviewTargetId,d.mode,rows(),sync),plan=planVisuals(c,sync);
 const bundle=buildBundle(context,f,sync,c,{coverage:1,coveredCandidates:c.windows.length,windows:plan.windows});
 assert.equal(bundle.reviewProtocol.fields.length,11);assert.equal(bundle.reviewProtocol.errorClasses.length,15);assert.equal(bundle.productRegistration,false);assert.equal(bundle.communication.status,'not_supplied');
 for(const m of bundle.moments)for(const key of bundle.reviewProtocol.fields)assert(m.reviewState[key]===null||Array.isArray(m.reviewState[key])&&m.reviewState[key].length===0);
 assert.throws(()=>buildBundle(context,f,sync,c,{coverage:0,coveredCandidates:0}));
});
test('stage schema enforces epistemic role and provenance, never automatic promotion',async()=>{
 const context={descriptor:fakeDescriptor(),runId:'e'.repeat(64)};const value=envelope(STAGES[0],context,{});await validateEnvelope(value);
 await assert.rejects(validateEnvelope({...value,epistemicType:'derived_attention_regions'}));await assert.rejects(validateEnvelope({...value,provenance:{...value.provenance,automaticSemanticPromotion:true}}));
});
test('same identity is stable, changed input creates distinct identity, and failed stages publish no successful result',async()=>{
 const d=fakeDescriptor(),e={anchors:anchors()};assert.equal(processingIdentity(d,e),processingIdentity(structuredClone(d),structuredClone(e)));assert.notEqual(processingIdentity(d,e),processingIdentity({...d,intakeFingerprint:'f'.repeat(64)},e));
 const root=await localFixture(),runId=processingIdentity(d,e),runDir=path.join(root,runId),context={descriptor:d,runId,runDir,audit:freshAudit()};let downstream=0;
 const stages={factual:async()=>{throw new Error('synthetic_factual_failure');},sync:async()=>{downstream++;}};
 await assert.rejects(executeStages(context,{stages}),/synthetic_factual_failure/);assert.equal(downstream,0);
 const failure=JSON.parse(await fs.readFile(path.join(runDir,'failure.json')));assert.equal(failure.failedStage,STAGES[1]);await assert.rejects(fs.stat(path.join(runDir,'result.json')),{code:'ENOENT'});
 await assert.rejects(executeStages(context,{stages}),/partial/);
});
test('successful synthetic orchestration is immutable and second execution verifies hashes without rerunning stages',async()=>{
 const d=fakeDescriptor(),e={anchors:anchors()},root=await localFixture(),runId=processingIdentity(d,e),context={descriptor:d,runId,runDir:path.join(root,runId),audit:freshAudit()};let calls=0;
 const stages={factual:async()=>{calls++;return factual();},sync:async()=>({}),candidates:async()=>({candidateCount:0}),visual:async()=>({coverage:1,frames:[]}),bundle:async()=>({communication:{status:'not_supplied'}})};
 const a=await executeStages(context,{stages}),b=await executeStages(context,{stages});assert.equal(a.status,'REVIEW_BUNDLE_READY');assert.equal(b.reused,true);assert.equal(calls,1);assert.deepEqual(a.stages,b.stages);
 await atomicJson(path.join(context.runDir,STAGES[1]+'.json'),{});await assert.rejects(executeStages(context,{stages}));
});

test('target publication lock excludes concurrent runs and removes only its own lock',async()=>{
 const root=await localFixture();let calls=0;
 await withTargetLock(root,async()=>{calls++;await assert.rejects(withTargetLock(root,async()=>{calls++;}),/target_locked/);});
 assert.equal(calls,1);await assert.rejects(fs.stat(path.join(root,'processing.lock')),{code:'ENOENT'});
 await withTargetLock(root,async()=>{calls++;});assert.equal(calls,2);
});

test('production sync evidence is explicitly bound to both source hashes and target',async()=>{
 const dir=await localFixture(),file=path.join(dir,'anchors.json'),d=fakeDescriptor();
 const e={schemaVersion:1,reviewTargetId:d.reviewTargetId,replaySha256:d.inputs.replay.sha256,videoSha256:d.inputs.video.sha256,anchors:anchors(),provenance:'human_supplied/synthetic_test'};
 await atomicJson(file,e);assert.deepEqual(await resolveSyncEvidence(d,file),e);
 await atomicJson(file,{...e,videoSha256:'0'.repeat(64)});await assert.rejects(resolveSyncEvidence(d,file),/identity_conflict/);
 await atomicJson(file,{...e,reviewTargetId:'review_match_010'});await assert.rejects(resolveSyncEvidence(d,file),/target_mismatch/);
 await assert.rejects(resolveSyncEvidence(d),/explicit_sync/);
});

test('every required downstream failure leaves an explicit stopped run and no result',async()=>{
 for(const [failedStage,key] of [[STAGES[2],'sync'],[STAGES[3],'candidates'],[STAGES[4],'visual'],[STAGES[5],'bundle']]){
  const root=await localFixture(),d=fakeDescriptor(),runId=processingIdentity(d,{case:failedStage}),context={descriptor:d,runId,runDir:path.join(root,runId),audit:freshAudit()};
  const stages={factual:async()=>factual(),sync:async()=>({}),candidates:async()=>({candidateCount:0}),visual:async()=>({coverage:1,frames:[]}),bundle:async()=>({})};
  stages[key]=async()=>{throw new Error('bounded_stage_failure');};await assert.rejects(executeStages(context,{stages}),/bounded_stage_failure/);
  const failure=JSON.parse(await fs.readFile(path.join(context.runDir,'failure.json')));assert.equal(failure.failedStage,failedStage);assert.equal(failure.downstreamPublished,false);
  await assert.rejects(fs.stat(path.join(context.runDir,'result.json')),{code:'ENOENT'});
 }
});

test('compact real-canary evidence records the separate adapter, exact baselines, stage provenance and unchanged Product',async()=>{
 for(const n of ['003','004']){
  const c=JSON.parse(await fs.readFile(path.join(ROOT,`artifacts/continuous-review/task223/canary-${n}.json`)));
  assert.equal(c.mode,'historical-canary');assert.deepEqual(c.stages.map(s=>s.stage),STAGES);assert(c.stages.every(s=>s.status==='PASS'));
  assert.equal(c.factual.comparison.passed,true);assert.equal(c.factual.comparison.artifactComparisons.filter(a=>a.sha256Identical).length,9);
  assert.equal(c.synchronization.baselineValuesUsedInFit,false);assert.equal(c.synchronization.baselineDelta.interceptDeltaSeconds,0);
  assert.equal(c.candidates.count,n==='003'?48:57);assert.equal(c.visual.coverage,1);assert.equal(c.visual.decodedFrames,c.candidates.count*3);
  assert.equal(c.authorizedInitialRun.productRegistrations,0);assert.equal(c.authorizedInitialRun.protectedAccessCount,0);assert(c.idempotency.reused);
  assert.equal(c.bundle.productRegistration,false);assert.equal(c.bundle.humanFieldsBlank,true);
 }
});
