#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {validateJsonSchema} from '../lib/json-schema-validator.mjs';
import {ROOT,PROCESSING_ROOT,validateTarget,requireCondition,freshAudit,safePath,readJson,digest,atomicJson,identity,hashFile,inside} from './processing-safety.mjs';
import {resolveRegistered,resolveHistoricalCanary,resolveSyncEvidence} from './processing-inputs.mjs';
import {PROCESSOR_VERSION,STAGES,EPISTEMIC_TYPES,envelope,factualStage,syncStage,candidateStage,visualStage,buildBundle} from './processing-stages.mjs';
export function processingIdentity(descriptor,syncEvidence,version=PROCESSOR_VERSION){return digest({version,mode:descriptor.mode,target:descriptor.reviewTargetId,intakeFingerprint:descriptor.intakeFingerprint,manifestSha256:descriptor.manifestSha256,syncEvidenceSha256:digest(syncEvidence)});}
export async function validateEnvelope(value){const schema=await readJson(path.join(ROOT,'schemas/continuous-review-processing-stage.schema.json'));const result=validateJsonSchema(schema,value);requireCondition(result.valid,'invalid_stage_schema:'+result.errors.join(';'));requireCondition(EPISTEMIC_TYPES[STAGES.indexOf(value.stage)]===value.epistemicType,'stage_epistemic_type_mismatch');}
export async function withTargetLock(targetRoot,action){
 requireCondition(inside(PROCESSING_ROOT,targetRoot),'lock_outside_processing');
 const file=path.join(targetRoot,'processing.lock');await safePath(file,{allowMissing:true});
 let handle;try{handle=await fs.open(file,'wx');}catch(e){if(e.code==='EEXIST')throw new Error('processing_target_locked_no_automatic_lock_removal');throw e;}
 try{await handle.writeFile(String(process.pid));return await action();}
 finally{await handle.close();await safePath(file);await fs.unlink(file);}
}
export async function verifyPublished(result,runDir){
 requireCondition(result.status==='REVIEW_BUNDLE_READY'&&result.stages.length===STAGES.length,'existing_run_incomplete');
 const parents=[];
 for(const [i,stage] of result.stages.entries()){
  requireCondition(stage.stage===STAGES[i]&&inside(runDir,path.join(ROOT,stage.path)),'existing_run_stage_chain_conflict');
  const value=await readJson(path.join(ROOT,stage.path));await validateEnvelope(value);
  requireCondition(value.runId===result.runId&&value.stage===STAGES[i]&&value.reviewTargetId===result.reviewTargetId,'existing_run_stage_identity_conflict');
  requireCondition(digest(value.provenance.parentStageIdentities)===digest(parents),'existing_run_provenance_chain_conflict');
  requireCondition((await identity(path.join(ROOT,stage.path))).sha256===stage.sha256,'existing_run_stage_hash_conflict');
  parents.push(stage.sha256);
  if(value.stage==='VISUAL_EVIDENCE_READY'&&value.data.frames.length){
   const index=await readJson(path.join(runDir,'visual/frame-index.json'));
   requireCondition(digest(index.frames)===digest(value.data.frames),'existing_run_visual_index_conflict');
  }
 }
 requireCondition(digest(result.provenance.stageHashChain)===digest(parents),'existing_run_result_chain_conflict');
 for(const artifact of result.integrity){const file=path.join(ROOT,artifact.path);requireCondition(inside(runDir,file),'published_artifact_outside_run');await safePath(file);requireCondition((await fs.stat(file)).size===artifact.sizeBytes&&await hashFile(file)===artifact.sha256,'existing_run_artifact_conflict');}
 return result;
}
export async function executeStages(context,{stages={factual:factualStage,sync:syncStage,candidates:candidateStage,visual:visualStage,bundle:buildBundle}}={}){
 const {runDir,descriptor:d}=context;
 validateTarget(d.reviewTargetId,d.mode);requireCondition(inside(PROCESSING_ROOT,runDir),'run_outside_local_processing');
 const complete=path.join(runDir,'result.json');
 await safePath(runDir,{allowMissing:true});
 try{await fs.mkdir(runDir,{recursive:false});}
 catch(e){if(e.code!=='EEXIST')throw e;const prior=await readJson(complete).catch(()=>null);requireCondition(prior,'existing_failed_or_partial_run_requires_distinct_identity');requireCondition(prior.runId===context.runId,'run_identity_conflict');return{...await verifyPublished(prior,runDir),reused:true};}
 const published=[],outputs={};let stage=STAGES[0];
 const publish=async(name,data)=>{stage=name;const value=envelope(name,context,data,published.map(s=>s.sha256));await validateEnvelope(value);const file=path.join(runDir,`${name}.json`);await atomicJson(file,value);published.push({stage:name,...await identity(file)});outputs[name]=data;};
 try{
  await publish(stage,{descriptor:d,sourceIdentityRevalidated:true,noCopy:true});
  stage=STAGES[1];const factual=await stages.factual(context);await publish(stage,factual);
  stage=STAGES[2];const sync=await stages.sync(context,factual);await publish(stage,sync);
  stage=STAGES[3];const candidates=await stages.candidates(context,factual,sync);await publish(stage,candidates);
  stage=STAGES[4];const visual=await stages.visual(context,candidates,sync);await publish(stage,visual);
  stage=STAGES[5];const bundle=await stages.bundle(context,factual,sync,candidates,visual);await publish(stage,bundle);
  const integrity=[...published,...Object.values(factual.localArtifacts),...visual.frames.map(f=>({path:f.localPath,sha256:f.sha256,sizeBytes:f.sizeBytes}))];
  const result={schemaVersion:1,processorVersion:PROCESSOR_VERSION,reviewTargetId:d.reviewTargetId,runId:context.runId,intakeFingerprint:d.intakeFingerprint,status:'REVIEW_BUNDLE_READY',epistemicType:'processing_status_not_gameplay_claim',provenance:{stageHashChain:published.map(s=>s.sha256),automaticSemanticPromotion:false},stages:published,integrity,candidateCount:candidates.candidateCount,visualCoverage:visual.coverage,productRegistered:false,communicationStatus:bundle.communication,security:context.audit};
  await atomicJson(complete,result);return{...result,reused:false};
 }catch(error){await atomicJson(path.join(runDir,'failure.json'),{schemaVersion:1,runId:context.runId,reviewTargetId:d.reviewTargetId,status:'BLOCKED',failedStage:stage,reason:error.message,completedStages:published,downstreamPublished:false,provenance:{intakeFingerprint:d.intakeFingerprint,epistemicType:'execution_failure'},security:context.audit});throw error;}
}
export async function processTarget({target,mode='production',syncEvidencePath,progress=console.log}={}){
 let descriptor,syncEvidence;const audit=freshAudit();
 try{validateTarget(target,mode);descriptor=mode==='production'?await resolveRegistered(target,{audit}):await resolveHistoricalCanary(target,{audit});}
 catch(error){error.failedStage='INTAKE_RESOLVED';throw error;}
 try{syncEvidence=await resolveSyncEvidence(descriptor,syncEvidencePath);}
 catch(error){error.failedStage='REPLAY_VOD_SYNC_READY';throw error;}
 const runId=processingIdentity(descriptor,syncEvidence),targetRoot=path.join(PROCESSING_ROOT,mode==='historical-canary'?'task223-canaries':'registered',target);
 await safePath(targetRoot,{allowMissing:true});await fs.mkdir(targetRoot,{recursive:true});
 const runDir=path.join(targetRoot,runId),currentFile=path.join(targetRoot,'current.json');
 return withTargetLock(targetRoot,async()=>{
  let current;try{current=await readJson(currentFile);}catch(e){if(e.code!=='ENOENT')throw e;}
  requireCondition(!current||current.runId===runId,'current_processing_identity_conflict');
  const result=await executeStages({descriptor,syncEvidence,runId,runDir,audit,progress});
  if(!current)await atomicJson(currentFile,{schemaVersion:1,reviewTargetId:target,runId,status:'REVIEW_BUNDLE_READY',resultPath:path.relative(ROOT,path.join(runDir,'result.json')).replaceAll('\\','/'),provenance:{intakeFingerprint:descriptor.intakeFingerprint,epistemicType:'processing_current_pointer'}});
  return{...result,runDirectory:path.relative(ROOT,runDir).replaceAll('\\','/'),invocationAudit:audit};
 });
}
export function parseArguments(args){const parsed={mode:'production'};for(let i=0;i<args.length;i++){const a=args[i];if(a==='--target')parsed.target=args[++i];else if(a==='--sync-evidence')parsed.syncEvidencePath=args[++i];else if(a==='--historical-canary')parsed.mode='historical-canary';else if(a==='--help')parsed.help=true;else throw new Error('unsupported_processing_argument');}if(!parsed.help)validateTarget(parsed.target,parsed.mode);return parsed;}
export async function main(){const args=parseArguments(process.argv.slice(2));if(args.help){console.log('npm.cmd run review:process -- --target review_match_009 --sync-evidence path/to/identity-bound-anchors.json\nHistorical validation only: --historical-canary --target review_match_003 (or 004). No arbitrary replay/video paths; no registration or Product onboarding.');return;}const result=await processTarget(args);console.log(JSON.stringify({status:result.status,reviewTargetId:result.reviewTargetId,runId:result.runId,candidateCount:result.candidateCount,visualCoverage:result.visualCoverage,reused:result.reused,runDirectory:result.runDirectory,invocationAudit:result.invocationAudit},null,2));}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url)main().catch(e=>{console.error(JSON.stringify({status:'BLOCKED',failedStage:e.failedStage??'PROCESSING_STOPPED',reason:e.message,downstreamPublished:false,epistemicType:'execution_failure'}));process.exitCode=1;});
