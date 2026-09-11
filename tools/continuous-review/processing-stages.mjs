import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {processFactualTarget} from '../emit-minimum-factual-review-telemetry.mjs';
import {selectModel,mapReplayToVod} from '../review-onboarding/timeline.mjs';
import {CANDIDATE_HEURISTIC,createBinStore,accumulateLifecycleRows,accumulateNetWorthRows,accumulateObjectiveRows,accumulatePositiveDeltaRows,selectSeeds,mergeSeedsToWindows,mapWindowToVideo} from '../emit-review-candidate-windows.mjs';
import {REVIEW_FIELD_DEFINITIONS} from '../review-workspace/ux-model.mjs';
import {ERROR_VOCABULARY} from '../review-workspace/data-model.mjs';
import {ROOT,validateTarget,requireCondition,safePath,readJson,atomicJson,digest,identity} from './processing-safety.mjs';
import {acceptedJson} from './processing-inputs.mjs';
export const PROCESSOR_VERSION='continuous-review-processing-v1.0.0';
export const STAGES=['INTAKE_RESOLVED','FACTUAL_PROCESSING_READY','REPLAY_VOD_SYNC_READY','CANDIDATES_READY','VISUAL_EVIDENCE_READY','REVIEW_BUNDLE_READY'];
export const EPISTEMIC_TYPES=['factual_identity_and_human_association','factual_observations_and_derived_counter_deltas','derived_timing_model','derived_attention_regions','decoded_visual_evidence','unreviewed_human_template'];
export function envelope(stage,context,data,parents=[]){
 const i=STAGES.indexOf(stage);requireCondition(i>=0,'unknown_stage');
 return{schemaVersion:1,processorVersion:PROCESSOR_VERSION,reviewTargetId:context.descriptor.reviewTargetId,runId:context.runId,stage,status:'PASS',epistemicType:EPISTEMIC_TYPES[i],provenance:{intakeFingerprint:context.descriptor.intakeFingerprint,sourceReplaySha256:context.descriptor.inputs.replay.sha256,sourceVideoSha256:context.descriptor.inputs.video.sha256,parentStageIdentities:parents,humanAssociation:context.descriptor.association.method,automaticSemanticPromotion:false},data};
}
export function compareFactual(observed,expected){
 const comparisons=Object.keys(observed.counts).map(field=>({field,expected:expected.counts[field],observed:observed.counts[field],passed:observed.counts[field]===expected.counts[field]}));
 for(const field of ['firstTime','lastTime','monotonic'])comparisons.push({field,expected:expected.replayCoverage[field],observed:observed.normalizedTimeCoverage[field],passed:observed.normalizedTimeCoverage[field]===expected.replayCoverage[field]});
 comparisons.push({field:'tickRate',expected:expected.parser.tickRate,observed:observed.parser.tickRate,passed:observed.parser.tickRate===expected.parser.tickRate});
 comparisons.push({field:'gapCount',expected:expected.gapCount,observed:observed.normalizedTimeCoverage.gaps.length,passed:observed.normalizedTimeCoverage.gaps.length===expected.gapCount});
 const artifactComparisons=Object.entries(expected.localArtifactIdentities??{}).map(([family,value])=>({family,sha256Identical:observed.localArtifacts[family]?.sha256===value.sha256}));
 return{passed:comparisons.every(c=>c.passed)&&artifactComparisons.every(c=>c.sha256Identical),comparisons,artifactComparisons,usage:'regression_only_no_extraction_tuning'};
}
export async function factualStage(context){
 const {descriptor:d,runDir,audit}=context,id=d.reviewTargetId;
 await safePath(d.inputs.replay.sourcePath);const outputDirectory=path.join(runDir,'factual');await safePath(outputDirectory,{allowMissing:true});
 audit.replayTargetsProcessed.push(id);audit.events.push({operation:'parser_load_open',kind:'replay'},{operation:'sampler_hash_open',kind:'replay'});
 const summary=await processFactualTarget({reviewTargetId:id,inputs:{replay:{...d.inputs.replay,localPath:d.inputs.replay.sourcePath,filenameOriginal:path.basename(d.inputs.replay.sourcePath)}}},{
  targetValidator:value=>validateTarget(value,d.mode),inputResolver:async()=>safePath(d.inputs.replay.sourcePath),outputDirectory,
  onSample:({elapsedSeconds})=>{if(elapsedSeconds%600===0)context.progress?.(`${id}: factual elapsed ${elapsedSeconds}s`);}
 });
 requireCondition(summary.processingStatus==='usable'&&summary.normalizedTimeCoverage.monotonic&&summary.counts.time>0,'factual_timeline_unavailable');
 summary.semanticContract={lifeState:'observation_not_confirmed_death',objectives:'structural_observation_not_completion',participants:'local_ref_not_identified_player',positions:'missing_remains_missing',counterDeltas:'derived_metric_not_attribution',humanContextUsedAsParserInput:false};
 if(d.mode==='historical-canary'){
  const baseline=(await acceptedJson('telemetry-summary')).targets.find(t=>t.reviewTargetId===id);
  summary.baselineComparison=compareFactual(summary,baseline);requireCondition(summary.baselineComparison.passed,'historical_factual_baseline_mismatch');
 }
 return summary;
}
export function fitSynchronization(factual,evidence,duration){
 const model=selectModel(evidence.anchors);
 requireCondition(model.precisionStatus!=='unusable_precision','sync_precision_unusable');
 requireCondition(model.coveredReplayRange.start>=factual.normalizedTimeCoverage.firstTime&&model.coveredReplayRange.end<=factual.normalizedTimeCoverage.lastTime,'sync_outside_factual_range');
 for(const t of [model.coveredReplayRange.start,model.coveredReplayRange.end]){const m=mapReplayToVod(model,t);requireCondition(m.mapped&&m.seconds>=0&&m.seconds<=duration,'sync_outside_video');}
 return{...model,equation:'vod_seconds = slope * replay_elapsed_seconds + intercept_seconds',anchors:evidence.anchors,evidenceSha256:digest(evidence),provenance:'derived_sync_model/independent_fit_and_validation_anchors',baselineValuesUsedInFit:false,usableVodRange:{start:mapReplayToVod(model,model.coveredReplayRange.start).seconds,end:mapReplayToVod(model,model.coveredReplayRange.end).seconds},uncoveredReplayRanges:[{start:factual.normalizedTimeCoverage.firstTime,end:model.coveredReplayRange.start},{start:model.coveredReplayRange.end,end:factual.normalizedTimeCoverage.lastTime}].filter(r=>r.end>r.start),uncertaintyIsStatisticalBound:false};
}
export function compareSync(model,baseline){const interceptDeltaSeconds=model.interceptSeconds-baseline.interceptSeconds,errorDeltaSeconds=model.estimatedOperationalReplayVodErrorSeconds-baseline.estimatedOperationalReplayVodErrorSeconds;return{passed:Math.abs(interceptDeltaSeconds)<=0.5&&errorDeltaSeconds<=0.5,interceptDeltaSeconds,errorDeltaSeconds,usage:'after_fit_regression_comparator_only'};}
export async function syncStage(context,factual){
 const model=fitSynchronization(factual,context.syncEvidence,context.descriptor.inputs.video.durationSeconds);
 if(context.descriptor.mode==='historical-canary'){
  const baseline=(await acceptedJson('replay-vod-mapping')).models.find(m=>m.reviewTargetId===context.descriptor.reviewTargetId);
  model.baselineComparison=compareSync(model,baseline);requireCondition(model.baselineComparison.passed,'historical_sync_regression');
 }
 return model;
}
export function candidateModel(model,id){const {start,end}=model.coveredReplayRange;return{coveredReplayRegion:{startSeconds:start,endSeconds:end},estimatedErrorSeconds:model.estimatedOperationalReplayVodErrorSeconds,segments:[{segmentId:`${id}_validated_sync`,replayStartSeconds:start,replayEndSeconds:end,videoStartSeconds:model.slope*start+model.interceptSeconds,videoEndSeconds:model.slope*end+model.interceptSeconds,slope:model.slope,interceptSeconds:model.interceptSeconds}]};}
export function generateCandidates(id,mode,rows,sync){
 validateTarget(id,mode);const model=candidateModel(sync,id),bins=createBinStore(model);
 accumulateLifecycleRows(rows.lifeState,bins,model);accumulateNetWorthRows(rows.netWorth,bins,model);accumulateObjectiveRows(rows.objectives,bins,model);
 accumulatePositiveDeltaRows(rows.damage,bins,model,'damage');accumulatePositiveDeltaRows(rows.healing,bins,model,'healing');
 const validate=value=>validateTarget(value,mode),{seeds,thresholds}=selectSeeds(id,bins,undefined,validate);
 const windows=mergeSeedsToWindows(id,seeds,model,{validateTarget:validate}).map(w=>({...w,candidateSemantics:'review_attention_region_not_gameplay_event',videoMapping:mapWindowToVideo(w,model),humanSuppliedContext:[],analystInference:[]}));
 requireCondition(windows.every(w=>w.videoMapping.mapped),'candidate_mapping_failed');
 return{policy:CANDIDATE_HEURISTIC,heuristicSource:'Task202_unchanged_import',thresholds,seeds,windows,candidateCount:windows.length,prioritySemantics:'review_priority_heuristic_not_probability'};
}
export async function candidateStage(context,factual,sync){
 const rows={};for(const family of ['lifeState','netWorth','objectives','damage','healing']){const file=path.join(ROOT,factual.localArtifacts[family].path);await safePath(file);rows[family]=(await fs.readFile(file,'utf8')).split(/\r?\n/u).filter(Boolean).map(JSON.parse);}
 const result=generateCandidates(context.descriptor.reviewTargetId,context.descriptor.mode,rows,sync);
 if(context.descriptor.mode==='historical-canary'){
  const expected=context.descriptor.reviewTargetId==='review_match_003'?48:57;
  result.baselineComparison={expected,observed:result.candidateCount,passed:result.candidateCount===expected,retuning:false};requireCondition(result.baselineComparison.passed,'historical_candidate_population_mismatch');
 }
 return result;
}
export function planVisuals(candidates,sync){
 const model=candidateModel(sync,candidates.windows[0]?.reviewTargetId??'empty'),rows=[],windows=[];
 for(const w of candidates.windows){
  const mapping=mapWindowToVideo(w,model);requireCondition(mapping.mapped&&digest(mapping)===digest(w.videoMapping),'visual_requires_validated_sync_mapping');
  const start=mapping.mappedVodStartSeconds,end=mapping.mappedVodEndSeconds;
  const roles=[['first',start],['representative',(start+end)/2],['last',end]];
  const frameIds=[];
  for(const [role,seconds] of roles){const frameId=`${w.candidateWindowId}_${role}`;frameIds.push(frameId);rows.push({frameId,candidateWindowId:w.candidateWindowId,role,requestedVodSeconds:seconds,provenance:'derived_sync_model/candidate_window_to_VOD'});}
  windows.push({candidateWindowId:w.candidateWindowId,frameIds});
 }
 return{representation:'first_representative_last_v1',rows,windows};
}
export function validateVisuals(plan,frames){
 requireCondition(frames.length===plan.rows.length&&new Set(frames.map(f=>f.frameId)).size===frames.length,'visual_frame_population_mismatch');
 for(const r of plan.rows){const f=frames.find(v=>v.frameId===r.frameId);requireCondition(f?.status==='decoded'&&f.requestedVodSeconds===r.requestedVodSeconds&&Number.isFinite(f.decodedVodSeconds)&&Math.abs(f.decodedVodSeconds-r.requestedVodSeconds)<=0.1&&typeof f.sha256==='string'&&/^[a-f0-9]{64}$/u.test(f.sha256),'required_visual_frame_unavailable');}
 return{candidateCount:plan.windows.length,coveredCandidates:plan.windows.length,coverage:1,requiredFrames:plan.rows.length,decodedFrames:frames.length,failures:0};
}
export async function visualStage(context,candidates,sync){
 const plan=planVisuals(candidates,sync),job={schemaVersion:1,reviewTargetId:context.descriptor.reviewTargetId,mode:context.descriptor.mode,runDir:context.runDir,video:context.descriptor.inputs.video,plan};
 const jobPath=path.join(context.runDir,'visual-job.json');await atomicJson(jobPath,job);
 const python=path.join(ROOT,'.venv-video/Scripts/python.exe');await safePath(python);
 const result=await new Promise((resolve,reject)=>{const child=spawn(python,['-B',path.join(ROOT,'tools/continuous-review/processing-frames.py'),jobPath],{cwd:ROOT,windowsHide:true,stdio:['ignore','pipe','pipe']});let output='';for(const stream of [child.stdout,child.stderr])stream.on('data',b=>{output+=b;context.progress?.(b.toString().trim());});child.on('error',reject);child.on('exit',code=>resolve({code,output}));});
 await fs.writeFile(path.join(context.runDir,'visual-extraction.log'),result.output);
 requireCondition(result.code===0,'visual_extractor_failed');
 const index=await readJson(path.join(context.runDir,'visual/frame-index.json'));const coverage=validateVisuals(plan,index.frames);
 context.audit.vodTargetsRead.push(context.descriptor.reviewTargetId);context.audit.events.push({operation:'decoder_open',kind:'video'},{operation:'decoder_identity_hash_open',kind:'video'});context.audit.framesExtracted+=index.frames.length;
 return{...coverage,representation:plan.representation,windows:plan.windows,frames:index.frames,videoSha256:context.descriptor.inputs.video.sha256,semanticClass:'visual_evidence_not_gameplay_truth',localOnly:true};
}
export function buildBundle(context,factual,sync,candidates,visual){
 requireCondition(visual.coverage===1&&visual.coveredCandidates===candidates.windows.length,'bundle_upstream_incomplete');
 return{schemaVersion:1,reviewTargetId:context.descriptor.reviewTargetId,processingIdentity:context.runId,status:'REVIEW_BUNDLE_READY',productRegistration:false,intake:{fingerprint:context.descriptor.intakeFingerprint,mode:context.descriptor.mode,association:context.descriptor.association},factual:{artifacts:factual.localArtifacts,availability:factual.availability,semanticContract:factual.semanticContract},synchronization:sync,uncertainty:{replayVodSeconds:sync.estimatedOperationalReplayVodErrorSeconds,uncoveredReplayRanges:sync.uncoveredReplayRanges,statisticalConfidence:false},communication:{status:context.descriptor.inputs.communication.status,attachmentStatus:context.descriptor.inputs.communication.trackCount?'timing_not_validated':'NOT_APPLICABLE',semanticStatus:'HUMAN_VALIDATION_REQUIRED',asrPerformed:false},reviewProtocol:{fields:REVIEW_FIELD_DEFINITIONS.map(f=>f.key),errorClasses:[...ERROR_VOCABULARY]},moments:candidates.windows.map(w=>({candidate:w,visualEvidence:visual.windows.find(v=>v.candidateWindowId===w.candidateWindowId),reviewState:{status:'unreviewed',...Object.fromEntries(REVIEW_FIELD_DEFINITIONS.map(f=>[f.key,f.kind==='lines'?[]:null])),errorClasses:[]},provenance:{factual:'linked_parser_observations',human:'unreviewed_empty',inferred:'attention_window_only'}})),visualFrameIndex:'visual/frame-index.json',epistemicContract:['result != decision quality','candidate != event','ASR != confirmed team call','structural fact != semantic interpretation']};
}
export async function outputIdentity(file){return identity(file);}
