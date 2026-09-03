import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT, BASE, TARGETS, OUTPUT, assertNewTarget, adaptMapping, generateCandidates } from '../tools/review-integration/candidates.mjs';
import { CANDIDATE_HEURISTIC, createBinStore, accumulateLifecycleRows, accumulatePositiveDeltaRows, selectSeeds, mergeSeedsToWindows } from '../tools/emit-review-candidate-windows.mjs';
import { buildTargetExtractionPlan, buildWindowEvidence } from '../tools/emit-dense-visual-review-evidence.mjs';
import { loadWorkspaceData, assertTargetId, assertCandidateId, sha256, stableJson } from '../tools/review-workspace/data-model.mjs';
import { ReviewStateStore } from '../tools/review-workspace/persistence.mjs';
import { buildExportPacket, exportPacketMarkdown } from '../tools/review-workspace/export.mjs';
import { buildScrimContextUrl, parseScrimNavigation, resolveScrimNavigation } from '../tools/review-workspace/scrim-navigation.mjs';
import { loadLocalScrimData } from '../tools/review-workspace/scrim-media.mjs';
import { createReviewWorkspaceServer } from '../tools/review-workspace/server.mjs';
const json = async p => JSON.parse(await readFile(path.join(ROOT,p)));
let data;
test.before(async () => { data = await loadWorkspaceData(); });
test('Task202 constants are exactly preserved without revision', () => {
    assert.deepEqual(CANDIDATE_HEURISTIC, {binSeconds:5,activityPercentile:0.75,mergeGapSeconds:15,paddingSeconds:12,maximumWindowSeconds:90});
    assert.ok(Object.isFrozen(CANDIDATE_HEURISTIC));
});
const model = {reviewTargetId:TARGETS[0],coveredReplayRange:{start:10,end:100},slope:1,interceptSeconds:20,estimatedOperationalReplayVodErrorSeconds:2.140625,noExtrapolation:true};
const timeline = {composition:{replayVodMappingErrorSeconds:2.140625,craigVodMappingErrorSeconds:0.2,composedOperationalErrorSeconds:2.340625}};
const rows = { lifeState:[{participantKey:'p',elapsedSeconds:0,alive:true},{participantKey:'p',elapsedSeconds:20,alive:false},{participantKey:'p',elapsedSeconds:110,alive:true}], damage:[{elapsedSeconds:21,delta:20},{elapsedSeconds:22,delta:10}], healing:[],netWorth:[],objectives:[] };
test('new target reuses identical Task202 bin/seed/merge behavior', () => {
    const actual = generateCandidates(TARGETS[0], rows, model, timeline);
    const adapted = adaptMapping(model); const bins = createBinStore(adapted);
    accumulateLifecycleRows(rows.lifeState,bins,adapted); accumulatePositiveDeltaRows(rows.damage,bins,adapted,'damage');
    const old = selectSeeds('review_match_001',bins);
    const legacy = mergeSeedsToWindows('review_match_001',old.seeds,adapted);
    const remap = x => JSON.parse(JSON.stringify(x).replaceAll('review_match_001',TARGETS[0]));
    assert.deepEqual(actual.seeds,remap(old.seeds));
    for (let i=0;i<legacy.length;i++) for (const [k,v] of Object.entries(remap(legacy[i]))) assert.deepEqual(actual.windows[i][k],v);
    assert.equal(actual.metrics.unmappedSeedCount,1);
});
test('Task211 operational error expands bounds and validation MAE is ignored', () => {
    const actual = generateCandidates(TARGETS[0],rows,{...model,validationMAE:0.001},timeline);
    const w=actual.windows[0];
    assert.equal(w.videoMapping.syncEstimatedErrorSeconds,2.140625);
    assert.equal(w.videoMapping.visualEvidenceEndSeconds,Number((w.videoMapping.mappedVodEndSeconds+2.140625).toFixed(3)));
    assert.ok(w.replayStartSeconds>=10 && w.replayEndSeconds<=100);
    assert.throws(() => adaptMapping({...model,noExtrapolation:false}),/invalid_task211_mapping/);
});
test('Task203 exact cadence deduplicates shared physical requests and all boundary roles', () => {
    const {windows}=generateCandidates(TARGETS[0],rows,model,timeline);
    const duplicate={...windows[0],candidateWindowId:`${TARGETS[0]}_window_0002`};
    const plan=buildTargetExtractionPlan(TARGETS[0],[...windows,duplicate],0,assertNewTarget);
    assert.deepEqual(plan.cadenceSeconds,{high:1,medium:2,low:5});
    assert.equal(plan.rawPlannedRequests,2*plan.rows.length);
    const frames=plan.rows.map(f=>({...f,extractionStatus:'decoded'}));
    assert.equal(buildWindowEvidence(windows[0],frames).boundaryEvidence.complete,true);
});
test('all protected/unknown targets reject before resolver or filesystem', () => {
    for (const suffix of ['005','006','007','008','009']) {
        const id=`review_match_${suffix}`;
        assert.throws(()=>assertNewTarget(id)); assert.throws(()=>assertTargetId(id)); assert.throws(()=>assertCandidateId(`${id}_window_0001`));
        assert.throws(()=>parseScrimNavigation(`reviewTargetId=${id}&vodTimeSeconds=60&preRollSeconds=10`));
    }
});
test('scrim URL rejects arbitrary paths, duplicate values and out-of-session times', () => {
    const sessions=[{reviewTargetId:TARGETS[0],syncStatus:'validated',vodRange:{start:30,end:100}}];
    assert.throws(()=>parseScrimNavigation('path=C:/private.mp4'));
    assert.throws(()=>parseScrimNavigation(`reviewTargetId=${TARGETS[0]}&vodTimeSeconds=60&vodTimeSeconds=70&preRollSeconds=10`));
    assert.throws(()=>resolveScrimNavigation({reviewTargetId:TARGETS[0],vodTimeSeconds:101,preRollSeconds:10},sessions),/outside_session/);
    assert.equal(resolveScrimNavigation({reviewTargetId:TARGETS[0],vodTimeSeconds:35,preRollSeconds:10},sessions).seekVodSeconds,30);
    assert.equal(resolveScrimNavigation({reviewTargetId:TARGETS[0],vodTimeSeconds:60,preRollSeconds:10},sessions).seekVodSeconds,50);
});
test('accepted 102 historical candidate fingerprints and legacy provider remain intact', async () => {
    const p='output/local-replay-processing/assisted-review-bundles/task204-bounded2/window-review-index.json';
    const accepted=execFileSync('git',['show',`${BASE}:${p}`],{cwd:ROOT,maxBuffer:8*1024*1024});
    assert.deepEqual(await readFile(path.join(ROOT,p)),accepted);
    const source=JSON.parse(accepted); assert.equal(source.windows.length,102);
    for(const w of source.windows) { const c=data.candidateById.get(w.candidateWindowId); assert.equal(c.immutableFingerprint,sha256(stableJson(w))); assert.ok(c.audioCallEvidence); assert.equal(c.scrimContextEvidence,undefined); }
});
test('all new candidates have safe semantics, mapped coverage, visual roles and real scrim context', async () => {
    assert.deepEqual(data.targets.map(t=>t.reviewTargetId),['review_match_001','review_match_002',...TARGETS]);
    const mapping=await json('output/local-replay-processing/review-onboarding/task211-matches-003-004/replay-vod-mapping.json');
    const sessions=loadLocalScrimData(ROOT).view.vodSessions;
    for(const id of TARGETS) {
        const candidates=data.candidatesByTarget.get(id); assert.ok(candidates.length>0);
        const m=mapping.models.find(m=>m.reviewTargetId===id);
        for(const c of candidates) {
            assert.equal(c.candidateSemantics,'review_attention_region_not_gameplay_event'); assert.equal(c.priority.semantics,'review_priority_heuristic_not_probability');
            assert.equal(c.audioCallEvidence,undefined); assert.deepEqual(c.humanSuppliedContext,[]); assert.deepEqual(c.analystInference,[]);
            assert.ok(Object.isFrozen(c)); assert.equal(c.videoEvidence.status,'available');
            assert.deepEqual(c.videoEvidence.frames.map(f=>f.role),['first','representative','last']); assert.ok(c.videoEvidence.storyboards.length>0);
            const range=c.replayObservedFacts.replayElapsedRangeSeconds; assert.ok(range.start>=m.coveredReplayRange.start && range.end<=m.coveredReplayRange.end);
            const request=parseScrimNavigation(buildScrimContextUrl(c.scrimContextEvidence).split('?')[1]);
            assert.equal(resolveScrimNavigation(request,sessions).session.reviewTargetId,id);
        }
    }
});
test('new target local state and export roundtrip; no fabricated calls or interpretation', async () => {
    const root=await mkdtemp(path.join(ROOT,'.local/codex/212/state-test-'));
    const store=new ReviewStateStore({root,workspaceData:data});
    for(const id of TARGETS) {
        const c=data.candidatesByTarget.get(id)[0], start=c.videoEvidence.visualVodRangeSeconds.start;
        const input={reviewTargetId:id,candidates:{[c.candidateWindowId]:{reviewRecord:{reviewState:'in_review',reviewNotes:['synthetic technical canary, not human judgment']},transcriptCorrections:{},reviewSegments:[{reviewTargetId:id,candidateWindowId:c.candidateWindowId,reviewSegmentId:`${c.candidateWindowId}_segment_01`,vodStartSeconds:start,vodEndSeconds:start+1,humanLabel:'synthetic canary'}]}}};
        const saved=await store.save(id,input); assert.deepEqual(await store.load(id),saved);
        const packet=buildExportPacket(data,saved,{reviewTargetId:id,candidateWindowId:c.candidateWindowId});
        assert.equal(packet.candidates[0].audioCallEvidence,undefined); assert.ok(packet.candidates[0].scrimContextEvidence); assert.equal(packet.candidates[0].reviewSegments.length,1);
        assert.match(exportPacketMarkdown(packet),/Automatic transcription not used/); assert.equal(packet.automaticGameplayInterpretationCount,0);
    }
});
test('compact audit and dense counts show no replay, ASR or inference operations', async () => {
    const audit=await json(`${OUTPUT}/provenance-audit.json`);
    for(const k of ['replayAccessCount','protectedAccessCount','asrExecutionCount','automaticGameplayInterpretationCount','humanSelectionInputCount','acceptedArtifactsMutated']) assert.equal(audit[k],0);
    const dense=await json(`${OUTPUT}/dense-evidence-summary.json`);
    for(const t of dense.targets) { assert.equal(t.extractionFailures,0); assert.equal(t.visualCoverage,1); assert.equal(t.windowsWithFirstRepresentativeLast,t.candidateCount); assert.equal(t.densityAdjustmentCount,0); }
});
test('HTTP scrim navigation rejects paths, protected targets and out-of-session requests', async () => {
    const workspace=await createReviewWorkspaceServer({port:0,workspaceData:data});
    const url=await workspace.start();
    try {
        for(const suffix of ['005','006','007','008']) {
            const response=await fetch(`${url}/scrim?reviewTargetId=review_match_${suffix}&vodTimeSeconds=60&preRollSeconds=10`);
            assert.equal(response.status,400); assert.match((await response.json()).error,/not_allowlisted/);
        }
        for(const query of ['path=C:/secret.mp4','reviewTargetId=review_match_003&vodTimeSeconds=99999&preRollSeconds=10','reviewTargetId=review_match_003&vodTimeSeconds=NaN&preRollSeconds=10']) {
            const response=await fetch(`${url}/scrim?${query}`); assert.equal(response.status,400); await response.text();
        }
        const response=await fetch(url+data.candidatesByTarget.get(TARGETS[0])[0].scrimContextEvidence.url);
        assert.equal(response.status,200); assert.match(await response.text(),/scrim-app/);
    } finally { await workspace.stop(); }
});
