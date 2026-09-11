import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {validateManifest,DEFAULT_REGISTRY_ROOT} from './intake.mjs';
import {assertNoProtectedAlias,assertContinuousReviewTargetId,stableHash} from './intake-model.mjs';
import {probeReplay,probeMp4} from './intake-paths.mjs';
import {ROOT,validateTarget,requireCondition,safePath,readJson,verifySource,digest,lexical,inside} from './processing-safety.mjs';
export const ACCEPTED_BASE='61d1ac0586e45009b7672bf33643a3924ed260a0';
export const HISTORICAL='output/local-replay-processing/review-onboarding/task211-matches-003-004';
export async function acceptedJson(name){
 requireCondition(['manifest','telemetry-summary','replay-vod-validation','replay-vod-mapping'].includes(name),'invalid_baseline_metadata');
 const relative=`${HISTORICAL}/${name}.json`;await safePath(path.join(ROOT,relative));
 const bytes=await fs.readFile(path.join(ROOT,relative));
 const baseline=execFileSync('git',['show',`${ACCEPTED_BASE}:${relative}`],{cwd:ROOT,maxBuffer:102400});
 // Git stores LF while Windows may materialize CRLF; compare normalized text.
 requireCondition(bytes.toString().replaceAll('\r\n','\n')===baseline.toString().replaceAll('\r\n','\n'),'accepted_metadata_changed');
 return JSON.parse(bytes);
}
export async function resolveRegistered(target,{registryRoot=DEFAULT_REGISTRY_ROOT,audit,io={readJson,readdir:fs.readdir}}={}){
 validateTarget(target);lexical(registryRoot);
 const manifestPath=path.join(registryRoot,target,'manifest.json');
 const manifest=await io.readJson(manifestPath);validateManifest(manifest);
 requireCondition(manifest.reviewTargetId===target,'registered_target_mismatch');
 // Recheck the immutable no-duplicate association using names, not Dirents.
 const names=await io.readdir(registryRoot);
 for(const name of names)assertContinuousReviewTargetId(name);
 for(const name of names){if(name===target)continue;const other=await io.readJson(path.join(registryRoot,name,'manifest.json'));validateManifest(other);requireCondition(other.reviewTargetId===name,'registry_target_mismatch');requireCondition(other.coreInputFingerprint!==manifest.coreInputFingerprint,'duplicate_registered_inputs');}
 const inputs={replay:manifest.inputs.replay,video:manifest.inputs.video,communication:manifest.inputs.communication};
 // Validate every declared input lexically before accessing even the first one.
 lexical(manifest.source.rootPath);
 for(const [kind,items] of [['replay',[inputs.replay]],['video',[inputs.video]],['craig',inputs.communication.tracks]])for(const item of items){lexical(item.sourcePath);requireCondition(inside(path.join(manifest.source.rootPath,kind),item.sourcePath)&&path.dirname(path.resolve(item.sourcePath))===path.resolve(manifest.source.rootPath,kind),'registered_source_slot_mismatch');}
 return verifyDescriptor({schemaVersion:1,reviewTargetId:target,mode:'production',intakeFingerprint:manifest.intakeFingerprint,manifestSha256:digest(manifest),association:manifest.association,copyPolicy:manifest.source.copyPolicy,inputs,provenance:{factual:'factual/intake_file_identity',human:'human_supplied/source_association',inferred:[]}},audit);
}
export async function resolveHistoricalCanary(target,{audit,loadAccepted=acceptedJson,loadPrivate=readJson}={}){
 validateTarget(target,'historical-canary');
 const manifest=await loadAccepted('manifest'),entry=manifest.targets.find(t=>t.reviewTargetId===target);requireCondition(entry,'historical_manifest_target_missing');
 const privateInput=await loadPrivate(path.join(ROOT,'.local/deadem/review-sync',target,'task211/private-intake.json'));
 requireCondition(privateInput.reviewTargetId===target,'historical_private_target_mismatch');
 const inputs={communication:{status:'not_exercised_historical_optional_bridge',trackCount:0,tracks:[]}};
 for(const kind of ['replay','video']){
  const file=privateInput.inputs[kind].localPath;lexical(file);
  requireCondition(path.dirname(file)===path.join(ROOT,'.local/deadem/review-targets',target,kind),'historical_source_slot_mismatch');
  inputs[kind]={...entry[kind],sourcePath:file};
 }
 return verifyDescriptor({schemaVersion:1,reviewTargetId:target,mode:'historical-canary',intakeFingerprint:stableHash(['historical-canary-v1',target,inputs.replay.sha256,inputs.video.sha256]),manifestSha256:digest(entry),association:{method:'accepted_explicit_historical_source_references',ambiguityCount:0},copyPolicy:'reference_in_place_no_copy',inputs,provenance:{factual:'factual/accepted_historical_file_identity',human:'human_supplied/historical_association',inferred:[]}},audit);
}
export async function verifyDescriptor(descriptor,audit){
 validateTarget(descriptor.reviewTargetId,descriptor.mode);
 const {replay,video,communication}=descriptor.inputs;
 for(const s of [replay,video,...communication.tracks])lexical(s.sourcePath);
 await verifySource(replay,'replay',audit);await verifySource(video,'video',audit);
 audit?.events.push({operation:'header_open',kind:'replay'},{operation:'container_metadata_open',kind:'video'});
 const replayMetadata=await probeReplay(replay.sourcePath,replay.sizeBytes);
 requireCondition(replayMetadata.summaryOffset===(replay.summaryOffset??replay.header?.summaryOffset),'replay_header_conflict');
 const metadata=await probeMp4(video.sourcePath,video.sizeBytes);
 requireCondition(Math.abs(metadata.durationSeconds-video.durationSeconds)<0.01,'video_duration_conflict');
 requireCondition(!video.majorBrand||metadata.majorBrand===video.majorBrand,'video_brand_conflict');
 for(const track of communication.tracks){await verifySource(track,'craig',audit);if(audit)audit.craigTracksRead++;}
 return descriptor;
}
export async function resolveSyncEvidence(descriptor,file){
 let evidence;
 if(descriptor.mode==='historical-canary'){
  requireCondition(!file,'canary_sync_override_forbidden');
  const accepted=await acceptedJson('replay-vod-validation');
  const entry=accepted.targets.find(t=>t.reviewTargetId===descriptor.reviewTargetId);
  // Only raw anchors enter fitting; accepted model/error comparator stays separate.
  evidence={schemaVersion:1,reviewTargetId:descriptor.reviewTargetId,replaySha256:descriptor.inputs.replay.sha256,videoSha256:descriptor.inputs.video.sha256,anchors:entry.anchors,provenance:'human_supplied/accepted_cross_surface_timer_observations',baselineValuesUsedInFit:false};
 }else{
  requireCondition(file,'explicit_sync_evidence_required');assertNoProtectedAlias(file);evidence=await readJson(file);
 }
 requireCondition(evidence.schemaVersion===1&&evidence.reviewTargetId===descriptor.reviewTargetId,'sync_evidence_target_mismatch');
 requireCondition(evidence.replaySha256===descriptor.inputs.replay.sha256&&evidence.videoSha256===descriptor.inputs.video.sha256,'sync_evidence_identity_conflict');
 requireCondition(Array.isArray(evidence.anchors)&&typeof evidence.provenance==='string'&&evidence.provenance.length>0,'invalid_sync_evidence');
 return evidence;
}
