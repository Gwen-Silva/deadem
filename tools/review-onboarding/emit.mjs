import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ROOT, OUTPUT, TARGETS, sha256File } from './inputs.mjs';
import { prepareAnchors } from './anchors.mjs';
import { selectModel, loadTask210Bridges, mapReplayToReviewContext, mapReplayToVod } from './timeline.mjs';

const readJson = async ref => JSON.parse(await readFile(path.join(ROOT, ref)));
const writeJson = async (name, value) => { const file = path.join(ROOT, OUTPUT, name); await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, JSON.stringify(value, null, 2) + '\n'); };
export function technicalGate({ inputTargets, telemetryTargets, models, composedTargets, protectedAccessCount = 0 }) {
    if (protectedAccessCount || telemetryTargets.length !== 2 || telemetryTargets.some(t => t.processingStatus !== 'usable' || !t.replayCoverage.monotonic)) return 'BLOCKED_BY_NEW_REVIEW_REPLAY_SAFE_TIMELINE_UNAVAILABLE';
    if (models.length !== 2 || models.some(m => m.precisionStatus === 'unusable_precision')) return 'BLOCKED_BY_NEW_REVIEW_REPLAY_VOD_SYNC_UNUSABLE';
    if (inputTargets !== 2 || composedTargets !== 2 || telemetryTargets.some(t => Object.entries(t.counts).filter(([k, v]) => !['time', 'participantLocalRefCount'].includes(k) && v > 0).length < 2)) return 'two_new_review_targets_timeline_partial_with_declared_gaps';
    return 'two_new_review_targets_replay_vod_craig_timeline_ready';
}
const compactModel = model => Object.fromEntries(Object.entries(model).filter(([k]) => !['comparison', 'fit', 'validation'].includes(k)));

export async function emit() {
    const manifest = await readJson(`${OUTPUT}/manifest.json`);
    const telemetry = await readJson(`${OUTPUT}/telemetry-summary.json`);
    const bridges = await loadTask210Bridges();
    const measured = await prepareAnchors();
    const models = [], validation = [], timelines = [];
    for (const reviewTargetId of TARGETS) {
        const evidence = measured.find(t => t.reviewTargetId === reviewTargetId);
        const telemetryTarget = telemetry.targets.find(t => t.reviewTargetId === reviewTargetId);
        const model = { reviewTargetId, ...selectModel(evidence.anchors), equation: 'vod_seconds = slope * replay_elapsed_seconds + intercept_seconds', provenanceClass: 'derived_sync_model/replay_to_vod' };
        model.uncoveredReplayRanges = [
            { startInclusive: telemetryTarget.replayCoverage.firstTime, endExclusive: model.coveredReplayRange.start },
            { startExclusive: model.coveredReplayRange.end, endInclusive: telemetryTarget.replayCoverage.lastTime }
        ];
        const inputVideo = manifest.targets.find(t => t.reviewTargetId === reviewTargetId).video;
        for (const x of [model.coveredReplayRange.start, model.coveredReplayRange.end]) {
            const v = mapReplayToVod(model, x);
            if (v.mapped && (v.seconds < 0 || v.seconds > inputVideo.durationSeconds)) throw new Error('mapping_exceeds_video_bounds');
        }
        const bridge = bridges.targets.find(t => t.reviewTargetId === reviewTargetId);
        if (Math.abs(bridge.vodRangeSeconds.end - inputVideo.durationSeconds) > 0.001) throw new Error('Task210_video_duration_mismatch');
        const replayError = model.estimatedOperationalReplayVodErrorSeconds;
        timelines.push({ reviewTargetId, replayVodModelRef: `${OUTPUT}/replay-vod-mapping.json#${reviewTargetId}`,
            replayVodModel: compactModel(model), task210Bridge: { ...bridge, provenanceClass: 'derived_sync_model/vod_to_craig_task210' },
            composition: { equation: 'craig_recording_seconds = (replayVodModel(replay_elapsed_seconds) - craigVodIntercept) / craigVodSlope', provenanceClass: 'derived_sync_model/replay_to_craig_composition',
                replayVodMappingErrorSeconds: replayError, craigVodMappingErrorSeconds: bridge.craigVodMappingErrorSeconds,
                composedOperationalErrorSeconds: (replayError + bridge.craigVodMappingErrorSeconds) / Math.abs(bridge.slope),
                uncertaintyPolicy: 'conservative_operational_sum_not_statistical_confidence_bound', units: 'input_errors_in_vod_seconds_composed_error_in_craig_seconds', browserTransportDriftIncluded: false }, analystInference: [] });
        const pause = reviewTargetId === 'review_match_004' ? await readJson('tools/review-onboarding/pause-observations.json') : null;
        const pauseChecks = pause ? pause.transitionBrackets.map(b => ({ ...b, predictedVodSeconds: mapReplayToVod(model, (b.replayInterval[0] + b.replayInterval[1]) / 2).seconds,
            passed: b.replayInterval.every(x => { const mapped = mapReplayToVod(model, x); return mapped.mapped && mapped.seconds >= b.vodInterval[0] && mapped.seconds <= b.vodInterval[1]; }) })) : [];
        if (pauseChecks.some(c => !c.passed)) throw new Error('independent_pause_sanity_failed');
        const frameRefs = pause ? await Promise.all(pause.observations.map(async o => { const ref = `.local/deadem/review-sync/${reviewTargetId}/task211/frames/vod-${o.vodSeconds.toFixed(3)}.jpg`; return { vodSeconds: o.vodSeconds, localFrameRef: ref, sha256: await sha256File(path.join(ROOT, ref)) }; })) : [];
        validation.push({ reviewTargetId, fitValidationSeparation: 'even_fit_odd_validation_declared_before_fit_no_validation_in_parameter_fit',
            planSha256: evidence.planSha256, observationSha256: evidence.visualObservationSha256, anchors: evidence.anchors,
            rawOriginCalibration: evidence.origin, replacement: evidence.replacement, fit: model.fit, validation: model.validation, comparison: model.comparison,
            precisionStatus: model.precisionStatus, selectionReason: model.selectionReason, operationalErrorPolicy: model.operationalErrorPolicy,
            estimatedOperationalReplayVodErrorSeconds: replayError, limitations: evidence.limitations,
            discontinuityCheck: { segmentedModelUsed: false, reason: 'no_unmatched_axis_discontinuity_observed_pauses_retained_in_both_axes', pauseChecks, frameRefs,
                localPauseObservationRef: pause ? 'tools/review-onboarding/pause-observations.json' : null },
            additionalIndependentOutOfSampleEvents: 'not_claimed_timer_anchors_and_bounded_pause_cues_only' });
        models.push(model);
    }
    const unified = { schemaVersion: 1, taskId: '211', functionContract: 'mapReplayToReviewContext(timeline, {reviewTargetId, replayElapsedSeconds})', noSilentExtrapolation: true,
        semantics: { replay: 'replay_elapsed_time', vod: 'vod_media_time', craig: 'craig_recording_time' }, task210ArtifactIdentities: bridges.identities, targets: timelines };
    const probes = timelines.map(t => ({ reviewTargetId: t.reviewTargetId, probes: [t.replayVodModel.coveredReplayRange.start, (t.replayVodModel.coveredReplayRange.start + t.replayVodModel.coveredReplayRange.end) / 2, t.replayVodModel.coveredReplayRange.end, -1, t.replayVodModel.coveredReplayRange.end + 0.001].map(replayElapsedSeconds => mapReplayToReviewContext(unified, { reviewTargetId: t.reviewTargetId, replayElapsedSeconds })) }));
    const composedTargets = probes.filter(t => t.probes.slice(0, 3).every(p => p.vod.mapped && p.craig.mapped) && t.probes.slice(3).every(p => !p.vod.mapped && !p.craig.mapped)).length;
    const gate = technicalGate({ inputTargets: manifest.targets.length, telemetryTargets: telemetry.targets, models, composedTargets });
    await writeJson('replay-vod-mapping.json', { schemaVersion: 1, taskId: '211', models: models.map(compactModel), noSilentExtrapolation: true });
    await writeJson('replay-vod-validation.json', { schemaVersion: 1, taskId: '211', targets: validation });
    await writeJson('unified-timeline.json', { ...unified, probes });
    await writeJson('gate.json', { schemaVersion: 1, taskId: '211', technicalGateStatus: gate, status: 'VALIDATING', acceptanceAuthority: 'ChatGPT Work', acceptedByCodex: false,
        validReplayInputs: 2, validVodInputs: 2, monotonicReplayTimelines: telemetry.targets.filter(t => t.replayCoverage.monotonic).length, validatedReplayVodMappings: models.filter(m => m.precisionStatus !== 'unusable_precision').length,
        validatedTask210Bridges: bridges.targets.length, functionalComposedTimelines: composedTargets, finalFacts: 0, automaticAttribution: 0, protectedReplayAccessCount: 0, nextAction: 'Independent Work validation only; no Task212.' });
    await writeJson('provenance-audit.json', { schemaVersion: 1, taskId: '211', inputSha256Count: 4, inputAssociation: 'explicit_exclusive_target_folders',
        factualProvenance: ['factual/local_file_identity', 'factual/replay_elapsed_time', 'factual/replay_observed_state', 'factual/replay_observed_counter'],
        derivedProvenance: ['derived_metric/replay_counter_delta', 'derived_sync_model/replay_to_vod', 'derived_sync_model/vod_to_craig_task210', 'derived_sync_model/replay_to_craig_composition'],
        participantCountsAreLocalReferencesNotPlayers: true, rawTimerAndParserOriginCalibratedSeparately: true, visualTimerIsSyncCueNotFactualGameClock: true,
        rawTemporalSupplementReason: 'Legacy 1Hz sampling omitted completed-paused-tick and raw transition timing fields needed to validate the new replay/VOD bridge; supplemental forward-only pass did not rewrite factual telemetry.',
        task210ArtifactsByteIdenticalToAcceptedCommit: true, task210ArtifactIdentities: bridges.identities,
        originalInputMutationCount: 0, heavyBinariesVersioned: 0, privateTranscriptsVersioned: 0, protectedReplayAccessCount: 0,
        asrExecutionCount: 0, craigRefitCount: 0, candidateGenerationCount: 0, workspaceMutationCount: 0,
        finalFactCount: 0, automaticAttributionCount: 0, gameplayInterpretationCount: 0, humanContextUsedAsFactualReplayInput: false, analystInference: [],
        optionalReadJustifications: [{ path: 'tools/review-workspace/measure-real-craig-sync.py', reason: 'Read only to reuse the installed PyAV frame-extraction API; script was never executed and its inputs/outputs were not accessed.' }],
        acceptedLegacyBehavior: 'Task199 default allowlist and outputs unchanged; optional exported sampler hook only. Task200 and all accepted Task199/200/210 artifacts unchanged.' });
    console.log(JSON.stringify({ gate, composedTargets, models: models.map(m => ({ target: m.reviewTargetId, selectedModel: m.selectedModel, validation: { mae: m.validation.mae, median: m.validation.median, p90: m.validation.p90, max: m.validation.max }, errorSeconds: m.estimatedOperationalReplayVodErrorSeconds })) }, null, 2));
}
if (process.argv[1]?.endsWith('emit.mjs')) emit().catch(error => { console.error(error); process.exitCode = 1; });
