import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CANDIDATE_HEURISTIC, createBinStore, accumulateLifecycleRows, accumulateNetWorthRows, accumulateObjectiveRows, accumulatePositiveDeltaRows, selectSeeds, mergeSeedsToWindows, mapWindowToVideo, percentileValue, deterministicJson } from '../emit-review-candidate-windows.mjs';
import { buildTargetExtractionPlan } from '../emit-dense-visual-review-evidence.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const BASE = '03de4f108d125237428faab417b8e68530d2824c';
export const TARGETS = Object.freeze(['review_match_003', 'review_match_004']);
export const INPUT = 'output/local-replay-processing/review-onboarding/task211-matches-003-004';
export const OUTPUT = 'output/local-replay-processing/assisted-review/task212-matches-003-004';
export const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export function assertNewTarget(id) {
    if (!TARGETS.includes(id)) throw new Error('unauthorized_target_before_filesystem');
    return id;
}
export async function acceptedJson(name, root = ROOT) {
    if (!['manifest', 'telemetry-summary', 'replay-vod-mapping', 'unified-timeline'].includes(name)) throw new Error('unauthorized_artifact');
    const relative = `${INPUT}/${name}.json`;
    const bytes = await readFile(path.join(root, relative));
    const accepted = execFileSync('git', ['show', `${BASE}:${relative}`], { cwd: root, maxBuffer: 4 * 1024 * 1024 });
    if (!bytes.equals(accepted)) throw new Error(`accepted_artifact_changed:${name}`);
    return JSON.parse(bytes);
}
export function adaptMapping(model) {
    assertNewTarget(model.reviewTargetId);
    const { start, end } = model.coveredReplayRange;
    const error = model.estimatedOperationalReplayVodErrorSeconds;
    if (!(Number.isFinite(start) && Number.isFinite(end) && start < end && Number.isFinite(error) && error >= 0 && model.noExtrapolation === true)) throw new Error('invalid_task211_mapping');
    return {
        coveredReplayRegion: { startSeconds: start, endSeconds: end }, estimatedErrorSeconds: error,
        segments: [{ segmentId: `${model.reviewTargetId}_task211`, replayStartSeconds: start, replayEndSeconds: end,
            videoStartSeconds: model.slope * start + model.interceptSeconds,
            videoEndSeconds: model.slope * end + model.interceptSeconds,
            slope: model.slope, interceptSeconds: model.interceptSeconds }]
    };
}
export function generateCandidates(id, rows, sourceModel, timelineTarget) {
    assertNewTarget(id);
    const model = adaptMapping(sourceModel);
    const bins = createBinStore(model);
    accumulateLifecycleRows(rows.lifeState, bins, model);
    accumulateNetWorthRows(rows.netWorth, bins, model);
    accumulateObjectiveRows(rows.objectives, bins, model);
    accumulatePositiveDeltaRows(rows.damage, bins, model, 'damage');
    accumulatePositiveDeltaRows(rows.healing, bins, model, 'healing');
    const { seeds, thresholds } = selectSeeds(id, bins, undefined, assertNewTarget);
    const windows = mergeSeedsToWindows(id, seeds, model, { validateTarget: assertNewTarget }).map(window => {
        const videoMapping = mapWindowToVideo(window, model);
        const errors = timelineTarget.composition;
        if (errors.replayVodMappingErrorSeconds !== model.estimatedErrorSeconds) throw new Error('composition_error_mismatch');
        return { ...window, candidateSemantics: 'review_attention_region_not_gameplay_event', videoMapping,
            scrimContextEvidence: { status: 'available', reviewTargetId: id,
                vodStartSeconds: videoMapping.mappedVodStartSeconds, vodEndSeconds: videoMapping.mappedVodEndSeconds,
                suggestedOpenVodSeconds: videoMapping.mappedVodStartSeconds, preRollSeconds: 10,
                replayVodMappingErrorSeconds: errors.replayVodMappingErrorSeconds,
                craigVodMappingErrorSeconds: errors.craigVodMappingErrorSeconds,
                composedOperationalErrorSeconds: errors.composedOperationalErrorSeconds },
            humanSuppliedContext: [], analystInference: [] };
    });
    let covered = 0, previousEnd = -Infinity;
    for (const w of windows) { covered += Math.max(0, w.replayEndSeconds - Math.max(previousEnd, w.replayStartSeconds)); previousEnd = Math.max(previousEnd, w.replayEndSeconds); }
    const durations = windows.map(w => w.replayDurationSeconds);
    const metrics = { reviewTargetId: id, seedCount: seeds.length, candidateCount: windows.length,
        priority: Object.fromEntries(['high','medium','low'].map(t => [t, windows.filter(w => w.priorityTier === t).length])),
        mappedSeedCount: seeds.filter(s => s.mappingStatus === 'mapped').length,
        unmappedSeedCount: seeds.filter(s => s.mappingStatus !== 'mapped').length,
        candidateReplayCoverageFraction: covered / (sourceModel.coveredReplayRange.end - sourceModel.coveredReplayRange.start),
        medianDurationSeconds: percentileValue(durations, 0.5), p90DurationSeconds: percentileValue(durations, 0.9),
        candidatesWithinCoverage: windows.every(w => w.replayStartSeconds >= sourceModel.coveredReplayRange.start && w.replayEndSeconds <= sourceModel.coveredReplayRange.end),
        coveredReplayRange: sourceModel.coveredReplayRange, thresholds, limitation: 'review_candidate_selectivity_low' };
    return { seeds, windows, metrics };
}
export async function writeJson(relative, value) {
    const file = path.join(ROOT, relative); await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, deterministicJson(value));
}
export async function main() {
    const telemetry = await acceptedJson('telemetry-summary');
    const mapping = await acceptedJson('replay-vod-mapping');
    const timeline = await acceptedJson('unified-timeline');
    const all = [], metrics = [], inputIdentities = [];
    const filenames = { lifeState:'life-state-observations.jsonl', netWorth:'net-worth-samples.jsonl', objectives:'objective-observations.jsonl', damage:'damage-deltas.jsonl', healing:'healing-deltas.jsonl' };
    for (const id of TARGETS) {
        const target = telemetry.targets.find(t => t.reviewTargetId === id); const rows = {};
        for (const [family, filename] of Object.entries(filenames)) {
            const relative = `.local/deadem/review-telemetry/${id}/${filename}`;
            const identity = target.localArtifactIdentities[family];
            if (identity.path !== relative) throw new Error('telemetry_path_mismatch');
            const bytes = await readFile(path.join(ROOT, relative));
            if (bytes.length !== identity.sizeBytes || hash(bytes) !== identity.sha256) throw new Error('telemetry_identity_mismatch');
            rows[family] = bytes.toString('utf8').trim().split(/\r?\n/u).filter(Boolean).map(JSON.parse);
            inputIdentities.push(identity);
        }
        const result = generateCandidates(id, rows, mapping.models.find(m => m.reviewTargetId === id), timeline.targets.find(t => t.reviewTargetId === id));
        const local = `.local/deadem/dense-review/${id}`;
        await writeJson(`${local}/candidate-seeds.json`, { seeds: result.seeds, unmappedDisposition: 'ignored-for-review-generation' });
        await writeJson(`${local}/extraction-plan.json`, buildTargetExtractionPlan(id, result.windows, 0, assertNewTarget));
        all.push(...result.windows); metrics.push(result.metrics);
    }
    await writeJson(`${OUTPUT}/candidate-windows.json`, { schemaVersion:1, taskId:'212', policy:CANDIDATE_HEURISTIC, windows:all });
    await writeJson(`${OUTPUT}/coverage.json`, { schemaVersion:1, taskId:'212', targets:metrics, noExtrapolation:true, unmappedDisposition:'ignored-for-review-generation' });
    await writeJson(`${OUTPUT}/provenance-audit.json`, { schemaVersion:1, taskId:'212', acceptedBase:BASE, inputIdentities,
        heuristicSource:'Task202_unchanged', visualCadenceSource:'Task203_without_density_adjustment', mappingSource:'Task211_operational_error',
        replayAccessCount:0, protectedAccessCount:0, asrExecutionCount:0, automaticGameplayInterpretationCount:0, humanSelectionInputCount:0, acceptedArtifactsMutated:0 });
    console.log(JSON.stringify(metrics, null, 2));
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) await main();
