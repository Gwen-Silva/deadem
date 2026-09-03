import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { assertCandidateId, deepFreeze, normalizeReviewRecord, resolveFrameMedia, sha256, stableJson } from './data-model.mjs';
import { buildScrimContextUrl } from './scrim-navigation.mjs';

const OUTPUT = 'output/local-replay-processing/assisted-review/task212-matches-003-004';
const TARGETS = ['review_match_003', 'review_match_004'];

export function loadTask212Provider({ root, registry, accessLog }) {
    const read = relative => { accessLog.push(relative); return JSON.parse(readFileSync(path.join(root, relative), 'utf8')); };
    if (!existsSync(path.join(root, OUTPUT, 'workspace-index.json'))) return [];
    const index = read(`${OUTPUT}/workspace-index.json`);
    if (index.provider !== 'task212' || index.targets.length !== 2 || !TARGETS.every(id => index.targets.some(t => t.reviewTargetId === id))) throw new Error('invalid_task212_provider');
    const source = read(`${OUTPUT}/candidate-windows.json`);
    return TARGETS.map(id => {
        const target = index.targets.find(t => t.reviewTargetId === id);
        const local = `.local/deadem/dense-review/${id}`;
        if (target.localFrameIndex !== `${local}/frame-evidence-index.json` || target.localWindowIndex !== `${local}/window-evidence-index.json`) throw new Error('invalid_task212_local_index');
        const frames = read(target.localFrameIndex);
        const evidence = read(target.localWindowIndex);
        const byFrame = new Map(frames.frames.map(f => [f.denseFrameId, f]));
        const windows = source.windows.filter(w => w.reviewTargetId === id);
        if (!windows.length || windows.length !== target.candidateCount) throw new Error('task212_candidate_count_mismatch');
        const priorities = [...windows].sort((a,b) => ({high:0,medium:1,low:2}[a.priorityTier] - {high:0,medium:1,low:2}[b.priorityTier]) || a.replayStartSeconds - b.replayStartSeconds);
        const candidates = windows.map((w, ordinal) => {
            assertCandidateId(w.candidateWindowId, id);
            if (w.candidateSemantics !== 'review_attention_region_not_gameplay_event' || w.prioritySemantics !== 'review_priority_heuristic_not_probability') throw new Error('candidate_semantics_changed');
            const visual = evidence.windows.find(e => e.candidateWindowId === w.candidateWindowId);
            if (!visual) throw new Error('task212_visual_window_missing');
            const scrimContextEvidence = { ...w.scrimContextEvidence, url:buildScrimContextUrl(w.scrimContextEvidence) };
            if (scrimContextEvidence.reviewTargetId !== id) throw new Error('scrim_candidate_target_mismatch');
            const videoEvidence = resolveFrameMedia({ ...w, videoEvidence: { ...visual,
                visualVodRangeSeconds:{ start:visual.visualVodStartSeconds, end:visual.visualVodEndSeconds } } }, byFrame, registry);
            return deepFreeze({ candidateWindowId:w.candidateWindowId, reviewTargetId:id, candidateSemantics:w.candidateSemantics,
                priority:{ tier:w.priorityTier, rank:priorities.indexOf(w)+1, label:'review scheduling heuristic', semantics:w.prioritySemantics },
                chronologicalRank:ordinal+1, syncEstimatedErrorSeconds:w.videoMapping.syncEstimatedErrorSeconds,
                replayObservedFacts:{ replayElapsedRangeSeconds:{start:w.replayStartSeconds,end:w.replayEndSeconds}, sourceFamilies:w.sourceFamilies,
                    provenance:'Task211/factual_observations', semanticLimitations:w.semanticLimitations },
                derivedMetrics:{ priorityTier:w.priorityTier, seedCount:w.seedCount, perFamilyMetrics:w.perFamilyMetrics, limitation:'review_candidate_selectivity_low' },
                videoEvidence, scrimContextEvidence, humanSuppliedContext:[], analystInference:[],
                initialReviewRecord:normalizeReviewRecord({}), immutableFingerprint:sha256(stableJson(w)) });
        });
        return { candidates, summary:deepFreeze({ reviewTargetId:id, candidateCount:candidates.length,
            visualAvailability:candidates.every(c => c.videoEvidence.status === 'available') ? 'available' : 'available_with_gaps',
            audioAvailability:'not_applicable', scrimContextAvailability:'available', callSegmentCount:0, reviewStateAvailability:'available' }) };
    });
}
