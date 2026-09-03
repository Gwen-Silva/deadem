import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ROOT, OUTPUT, TARGETS, hash, writeJson } from './candidates.mjs';
import { loadWorkspaceData } from '../review-workspace/data-model.mjs';
import { loadLocalScrimData } from '../review-workspace/scrim-media.mjs';
import { resolveScrimNavigation, parseScrimNavigation } from '../review-workspace/scrim-navigation.mjs';
import { buildExportPacket } from '../review-workspace/export.mjs';
import { emptyReviewState } from '../review-workspace/persistence.mjs';
const json = async p => JSON.parse(await readFile(path.join(ROOT,p)));
const data=await loadWorkspaceData(), sessions=loadLocalScrimData(ROOT).view.vodSessions;
const canaryPath='.local/codex/212/browser-canary/result.json';
const bytes=await readFile(path.join(ROOT,canaryPath)), canary=JSON.parse(bytes);
const dense=await json(`${OUTPUT}/dense-evidence-summary.json`), coverage=await json(`${OUTPUT}/coverage.json`);
const targets=TARGETS.map(id=>{
    const candidates=data.candidatesByTarget.get(id), checked=canary.targets.find(t=>t.reviewTargetId===id);
    let scrimCount=0, exportCount=0;
    for(const candidate of candidates) {
        const request=parseScrimNavigation(candidate.scrimContextEvidence.url.split('?')[1]);
        assert.equal(resolveScrimNavigation(request,sessions).session.reviewTargetId,id); scrimCount++;
        assert.equal(buildExportPacket(data,emptyReviewState(id),{reviewTargetId:id,candidateWindowId:candidate.candidateWindowId}).candidateCount,1); exportCount++;
    }
    return {reviewTargetId:id,candidatesResolvable:candidates.length,visualCandidatesResolvable:candidates.filter(c=>c.videoEvidence.status==='available').length,
        scrimContextCandidatesResolvable:scrimCount,exportCandidatesResolvable:exportCount,reviewStateReady:checked.stateSaveReopen,exportReady:checked.exportJsonMarkdown};
});
const ready=targets.every(t=>t.candidatesResolvable>0&&t.visualCandidatesResolvable/t.candidatesResolvable>=0.99&&t.scrimContextCandidatesResolvable===t.candidatesResolvable&&t.exportCandidatesResolvable===t.candidatesResolvable&&t.reviewStateReady&&t.exportReady)
    &&dense.targets.every(t=>t.visualCoverage>=0.99&&t.windowsWithFirstRepresentativeLast===t.candidateCount)
    &&coverage.targets.every(t=>t.candidatesWithinCoverage)&&canary.legacy0015Ready&&canary.browserErrors.length===0;
const index=await json(`${OUTPUT}/workspace-index.json`);
index.metrics=targets; await writeJson(`${OUTPUT}/workspace-index.json`,index);
await writeJson(`${OUTPUT}/gate.json`,{schemaVersion:1,taskId:'212',status:'VALIDATING',acceptanceAuthority:'ChatGPT Work',
    technicalGateStatus:ready?'review_matches_003_004_assisted_workspace_ready':'review_matches_003_004_assisted_workspace_partial_with_declared_gaps',
    targets,legacyCandidateCount:102,totalCandidateCount:data.candidateById.size,
    canary:{path:canaryPath,sha256:hash(bytes),technicalOnly:true,targets:canary.targets,legacy0015Ready:canary.legacy0015Ready,browserErrors:canary.browserErrors},
    inheritedLimitations:['review_candidate_selectivity_low','craig_multitrack_asr_semantic_accuracy_insufficient_for_automatic_call_evidence'],
    replayAccessCount:0,protectedAccessCount:0,asrExecutionCount:0,automaticGameplayInterpretationCount:0});
console.log(JSON.stringify({ready,targets},null,2));
