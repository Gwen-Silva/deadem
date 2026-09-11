import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {assertNoProtectedAlias,assertSafeSourceText,assertContinuousReviewTargetId} from './intake-model.mjs';
export const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
export const PROCESSING_ROOT=path.join(ROOT,'.local/deadem/continuous-review/processing');
export const stableJson=value=>JSON.stringify(sort(value),null,2)+'\n';
function sort(value){return Array.isArray(value)?value.map(sort):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,sort(value[k])])):value;}
export const digest=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:stableJson(value)).digest('hex');
export function requireCondition(condition,code){if(!condition)throw new Error(code);}
export function validateTarget(id,mode='production'){
 assertNoProtectedAlias(id);
 if(mode==='historical-canary'){requireCondition(['review_match_003','review_match_004'].includes(id),'invalid_historical_canary');return id;}
 requireCondition(mode==='production','invalid_processing_mode');return assertContinuousReviewTargetId(id);
}
export function freshAudit(){return{protectedAccessCount:0,events:[],replayTargetsProcessed:[],vodTargetsRead:[],framesExtracted:0,craigTracksRead:0,asrExecutions:0,historyRewritePerformed:false,productRegistrations:0};}
export function lexical(file){assertSafeSourceText(file);return path.resolve(file);}
// Inspect ancestors one at a time. Reject links/junctions before following them;
// do not resolve a target first to discover that it was protected afterwards.
export async function safePath(file,{allowMissing=false,io=fs}={}){
 const absolute=lexical(file),root=path.parse(absolute).root,parts=absolute.slice(root.length).split(path.sep).filter(Boolean);
 let current=root;
 for(let i=0;i<parts.length;i++){
  current=path.join(current,parts[i]);assertNoProtectedAlias(current);
  try{const info=await io.lstat(current);requireCondition(!info.isSymbolicLink(),'linked_processing_path');if(i<parts.length-1)requireCondition(info.isDirectory(),'non_directory_processing_ancestor');}
  catch(e){if(allowMissing&&e.code==='ENOENT')return absolute;throw e;}
 }
 return absolute;
}
export async function readJson(file){await safePath(file);return JSON.parse(await fs.readFile(file,'utf8'));}
export async function hashFile(file,audit,kind='artifact'){
 await safePath(file);const h=createHash('sha256');audit?.events.push({operation:'hash_open',kind});
 for await(const bytes of createReadStream(file))h.update(bytes);return h.digest('hex');
}
export async function verifySource(source,kind,audit){
 const file=await safePath(source.sourcePath);const stat=await fs.lstat(file);
 requireCondition(stat.isFile()&&stat.size===source.sizeBytes,'source_size_or_type_conflict');
 requireCondition(await hashFile(file,audit,kind)===source.sha256,'source_fingerprint_conflict');return file;
}
export async function atomicJson(file,value){
 await safePath(file,{allowMissing:true});await fs.mkdir(path.dirname(file),{recursive:true});
 const temporary=file+`.tmp-${process.pid}`;await safePath(temporary,{allowMissing:true});
 await fs.writeFile(temporary,stableJson(value),{flag:'wx'});await fs.rename(temporary,file);
}
export function inside(root,file){const r=path.relative(root,lexical(file));return r!==''&&!r.startsWith('..')&&!path.isAbsolute(r);}
export async function identity(file){await safePath(file);return{path:path.relative(ROOT,file).replaceAll('\\','/'),sizeBytes:(await fs.stat(file)).size,sha256:await hashFile(file)};}
