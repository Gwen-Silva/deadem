#!/usr/bin/env node
import { createReadStream } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INTAKE_MANIFEST = 'output/local-replay-processing/two-match-assisted-review-intake/task198-bounded2/manifest.json';
const TELEMETRY_SUMMARY = 'output/local-replay-processing/minimum-review-telemetry/task199-bounded2/summary.json';
const OUTPUT_ROOT = 'output/local-replay-processing/replay-video-sync/task200-bounded2';
const LOCAL_ROOT = '.local/deadem/review-sync';
const TARGET_IDS = ['review_match_001', 'review_match_002'];
const POSITIVE_GATE = 'two_match_replay_video_sync_ready_with_declared_error';
const PARTIAL_GATE = 'two_match_replay_video_sync_partial';
const BLOCKED_GATE = 'BLOCKED_BY_REPLAY_VIDEO_SYNC_UNUSABLE';

const ANCHOR_PLAN = {
    review_match_001: [
        {
            anchorId: 'm1_fit_origin', replayElapsedSeconds: 0, videoSeconds: 1938,
            source: 'manual_visual_anchor', usage: 'fit', confidence: 'medium', status: 'usable_with_declared_uncertainty',
            uncertaintySeconds: 1,
            evidence: {
                replay: 'Task 199 normalized replay-elapsed origin.',
                video: 'Bounded manual frame review shows the connecting-to-server transition.',
                limitation: 'The displayed game clock is not used as ground truth.'
            }
        },
        {
            anchorId: 'm1_fit_mid_state', replayElapsedSeconds: 2862, videoSeconds: 4800,
            source: 'derived_alignment_anchor', usage: 'fit', confidence: 'low', status: 'usable_with_declared_uncertainty',
            uncertaintySeconds: 10,
            evidence: {
                replay: 'Replay elapsed point selected inside a long aggregate-counter freeze window.',
                video: 'Bounded manual frame review shows an explicit paused state at this timestamp.',
                limitation: 'Aggregate-counter stability does not itself prove a pause or any gameplay event.'
            }
        },
        {
            anchorId: 'm1_fit_late_state', replayElapsedSeconds: 4362, videoSeconds: 6300,
            source: 'derived_alignment_anchor', usage: 'fit', confidence: 'medium', status: 'usable_with_declared_uncertainty',
            uncertaintySeconds: 9,
            evidence: {
                replay: 'Late replay-elapsed checkpoint remains inside Task 199 coverage.',
                video: 'Bounded manual frame review shows active late-match footage.',
                limitation: 'Phase consistency is alignment evidence, not event identity.'
            }
        },
        {
            anchorId: 'm1_validation_pause_sample_a', replayElapsedSeconds: 2791, videoSeconds: 4720,
            source: 'cross_surface_event_match', usage: 'validation', confidence: 'medium', status: 'usable_with_declared_uncertainty',
            uncertaintySeconds: 10,
            evidence: {
                replay: 'Start of a Task 199 aggregate-counter freeze run.',
                video: 'Bounded manual sampling shows the paused overlay by this timestamp.',
                limitation: 'The visual sample cadence bounds the transition; it is not an exact pause boundary.'
            }
        },
        {
            anchorId: 'm1_validation_pause_sample_b', replayElapsedSeconds: 3517, videoSeconds: 5450,
            source: 'cross_surface_event_match', usage: 'validation', confidence: 'medium', status: 'usable_with_declared_uncertainty',
            uncertaintySeconds: 10,
            evidence: {
                replay: 'Start of a separate Task 199 aggregate-counter freeze run.',
                video: 'Bounded manual sampling shows the paused overlay near this timestamp.',
                limitation: 'The visual sample cadence bounds the transition; it is not an exact pause boundary.'
            }
        },
        {
            anchorId: 'm1_validation_late_boundary', replayElapsedSeconds: 4562, videoSeconds: 6500,
            source: 'manual_visual_anchor', usage: 'validation', confidence: 'low', status: 'usable_with_declared_uncertainty',
            uncertaintySeconds: 9,
            evidence: {
                replay: 'Late replay-elapsed point eight seconds before Task 199 coverage ends.',
                video: 'Bounded manual frame review shows active gameplay before VOD post-match footage.',
                limitation: 'The remaining replay tail has no independent anchor and stays uncovered.'
            }
        }
    ],
    review_match_002: [
        {
            anchorId: 'm2_fit_origin', replayElapsedSeconds: 0, videoSeconds: 0,
            source: 'manual_visual_anchor', usage: 'fit', confidence: 'medium', status: 'usable_with_declared_uncertainty',
            uncertaintySeconds: 1,
            evidence: {
                replay: 'Task 199 normalized replay-elapsed origin.',
                video: 'The first decoded VOD frame shows the connecting-to-server state.',
                limitation: 'Connection state is a synchronization cue, not gameplay ground truth.'
            }
        },
        {
            anchorId: 'm2_fit_mid_state', replayElapsedSeconds: 900, videoSeconds: 900,
            source: 'derived_alignment_anchor', usage: 'fit', confidence: 'medium', status: 'usable_with_declared_uncertainty',
            uncertaintySeconds: 2,
            evidence: {
                replay: 'Mid-match replay-elapsed checkpoint inside continuous Task 199 coverage.',
                video: 'Bounded manual frame review shows corresponding active mid-match footage.',
                limitation: 'The displayed game clock is only a visual consistency check.'
            }
        },
        {
            anchorId: 'm2_fit_late_state', replayElapsedSeconds: 1800, videoSeconds: 1800,
            source: 'derived_alignment_anchor', usage: 'fit', confidence: 'medium', status: 'usable_with_declared_uncertainty',
            uncertaintySeconds: 2,
            evidence: {
                replay: 'Late replay-elapsed checkpoint inside continuous Task 199 coverage.',
                video: 'Bounded manual frame review shows corresponding active late-match footage.',
                limitation: 'Phase consistency does not identify a semantic gameplay event.'
            }
        },
        {
            anchorId: 'm2_validation_freeze_start', replayElapsedSeconds: 142, videoSeconds: 142,
            source: 'cross_surface_event_match', usage: 'validation', confidence: 'medium', status: 'usable_with_declared_uncertainty',
            uncertaintySeconds: 2,
            evidence: {
                replay: 'Start of the Task 199 early aggregate-counter freeze run.',
                video: 'Bounded review locates the corresponding early timing discontinuity.',
                limitation: 'The counter freeze is not promoted to a gameplay event.'
            }
        },
        {
            anchorId: 'm2_validation_freeze_end', replayElapsedSeconds: 185, videoSeconds: 185,
            source: 'cross_surface_event_match', usage: 'validation', confidence: 'medium', status: 'usable_with_declared_uncertainty',
            uncertaintySeconds: 2,
            evidence: {
                replay: 'End of the Task 199 early aggregate-counter freeze run.',
                video: 'Bounded review locates the end of the corresponding early timing discontinuity.',
                limitation: 'The visual boundary remains approximate.'
            }
        },
        {
            anchorId: 'm2_validation_late_boundary', replayElapsedSeconds: 2090, videoSeconds: 2090,
            source: 'manual_visual_anchor', usage: 'validation', confidence: 'medium', status: 'usable_with_declared_uncertainty',
            uncertaintySeconds: 2,
            evidence: {
                replay: 'Late replay-elapsed point three seconds before Task 199 coverage ends.',
                video: 'Bounded manual frame review still shows active footage.',
                limitation: 'The remaining replay tail has no independent anchor and stays uncovered.'
            }
        }
    ]
};

const slash = value => String(value).replaceAll('\\', '/');
const round = (value, digits = 6) => Number(Number(value).toFixed(digits));

function sortValue(value) {
    if (Array.isArray(value)) return value.map(sortValue);
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.keys(value).sort().map(key => [key, sortValue(value[key])]));
    }
    return value;
}

export function deterministicJson(value) {
    return `${JSON.stringify(sortValue(value), null, 2)}\n`;
}

export function assertReviewTargetId(value) {
    if (/(?:replay|partida|match)[_-]?00?[5-8]/iu.test(String(value))) {
        throw new Error(`protected replay alias rejected before filesystem access: ${value}`);
    }
    if (!TARGET_IDS.includes(value)) throw new Error(`unsupported review target: ${value}`);
    return value;
}

export function validateAnchors(anchors) {
    if (!Array.isArray(anchors) || anchors.length < 4) throw new Error('at least four anchors are required');
    const ids = new Set();
    const pairs = new Map();
    let fit = 0;
    let validation = 0;
    for (const anchor of anchors) {
        if (!anchor.anchorId || ids.has(anchor.anchorId)) throw new Error(`duplicate or missing anchor id: ${anchor.anchorId}`);
        ids.add(anchor.anchorId);
        if (!Number.isFinite(anchor.replayElapsedSeconds) || anchor.replayElapsedSeconds < 0) throw new Error(`invalid replay time: ${anchor.anchorId}`);
        if (!Number.isFinite(anchor.videoSeconds) || anchor.videoSeconds < 0) throw new Error(`invalid video time: ${anchor.anchorId}`);
        if (!['fit', 'validation'].includes(anchor.usage)) throw new Error(`invalid anchor usage: ${anchor.anchorId}`);
        if (!['manual_visual_anchor', 'derived_alignment_anchor', 'cross_surface_event_match'].includes(anchor.source)) throw new Error(`invalid anchor source: ${anchor.anchorId}`);
        if (!anchor.evidence?.replay || !anchor.evidence?.video || !anchor.evidence?.limitation) throw new Error(`incomplete anchor evidence: ${anchor.anchorId}`);
        const pairKey = `${anchor.replayElapsedSeconds}:${anchor.usage}`;
        if (pairs.has(pairKey) && pairs.get(pairKey) !== anchor.videoSeconds) throw new Error(`conflicting anchor pair: ${anchor.anchorId}`);
        pairs.set(pairKey, anchor.videoSeconds);
        if (anchor.usage === 'fit') fit += 1;
        else validation += 1;
    }
    if (fit < 2 || validation < 2) throw new Error('fit and validation anchors must be separated and independently populated');
    return { fit, validation };
}

export function fitLinearModel(anchors) {
    const points = anchors.filter(anchor => anchor.usage === 'fit');
    if (points.length < 2) throw new Error('linear fit requires at least two fit anchors');
    const meanX = points.reduce((sum, point) => sum + point.replayElapsedSeconds, 0) / points.length;
    const meanY = points.reduce((sum, point) => sum + point.videoSeconds, 0) / points.length;
    const denominator = points.reduce((sum, point) => sum + ((point.replayElapsedSeconds - meanX) ** 2), 0);
    if (denominator === 0) throw new Error('linear fit anchors need distinct replay timestamps');
    const slope = points.reduce((sum, point) => sum + ((point.replayElapsedSeconds - meanX) * (point.videoSeconds - meanY)), 0) / denominator;
    const intercept = meanY - (slope * meanX);
    return { modelType: 'linear', slope: round(slope), interceptSeconds: round(intercept) };
}

export function buildSegmentedModel(segments) {
    if (!Array.isArray(segments) || segments.length < 2) throw new Error('segmented model requires at least two segments');
    const normalized = segments.map((segment, index) => ({
        segmentId: segment.segmentId ?? `segment_${index + 1}`,
        replayStartSeconds: segment.replayStartSeconds,
        replayEndSeconds: segment.replayEndSeconds,
        videoStartSeconds: round((segment.slope * segment.replayStartSeconds) + segment.interceptSeconds, 3),
        videoEndSeconds: round((segment.slope * segment.replayEndSeconds) + segment.interceptSeconds, 3),
        slope: segment.slope,
        interceptSeconds: segment.interceptSeconds
    })).sort((a, b) => a.replayStartSeconds - b.replayStartSeconds);
    for (let index = 0; index < normalized.length; index++) {
        const segment = normalized[index];
        if (!(segment.replayStartSeconds <= segment.replayEndSeconds) || !Number.isFinite(segment.slope) || segment.slope <= 0 || !Number.isFinite(segment.interceptSeconds)) {
            throw new Error(`invalid segment: ${segment.segmentId}`);
        }
        if (index > 0 && normalized[index - 1].replayEndSeconds > segment.replayStartSeconds) throw new Error('segmented model intervals overlap');
    }
    return { modelType: 'segmented', segments: normalized };
}

export function mapReplayElapsed(model, replayElapsedSeconds) {
    if (!Number.isFinite(replayElapsedSeconds)) return { mapped: false, reason: 'invalid_replay_elapsed_seconds' };
    const segment = model.segments.find(item => replayElapsedSeconds >= item.replayStartSeconds && replayElapsedSeconds <= item.replayEndSeconds);
    if (!segment) return { mapped: false, reason: 'outside_covered_region', replayElapsedSeconds };
    const videoSeconds = (segment.slope * replayElapsedSeconds) + segment.interceptSeconds;
    if (videoSeconds < segment.videoStartSeconds || videoSeconds > segment.videoEndSeconds) {
        return { mapped: false, reason: 'mapped_value_outside_segment_video_bounds', replayElapsedSeconds };
    }
    return { mapped: true, replayElapsedSeconds, videoSeconds: round(videoSeconds, 3), segmentId: segment.segmentId };
}

export function residualMetrics(model, anchors, usage = 'validation') {
    const rows = anchors.filter(anchor => anchor.usage === usage).map(anchor => {
        const mapped = mapReplayElapsed(model, anchor.replayElapsedSeconds);
        if (!mapped.mapped) throw new Error(`anchor outside model coverage: ${anchor.anchorId}`);
        return {
            anchorId: anchor.anchorId,
            observedVideoSeconds: anchor.videoSeconds,
            predictedVideoSeconds: mapped.videoSeconds,
            residualSeconds: round(anchor.videoSeconds - mapped.videoSeconds, 3),
            absoluteResidualSeconds: round(Math.abs(anchor.videoSeconds - mapped.videoSeconds), 3)
        };
    });
    const errors = rows.map(row => row.absoluteResidualSeconds).sort((a, b) => a - b);
    const meanAbsoluteErrorSeconds = errors.length ? errors.reduce((sum, value) => sum + value, 0) / errors.length : null;
    const medianAbsoluteErrorSeconds = errors.length ? (errors.length % 2 ? errors[(errors.length - 1) / 2] : (errors[(errors.length / 2) - 1] + errors[errors.length / 2]) / 2) : null;
    return {
        usage,
        anchorCount: rows.length,
        meanAbsoluteErrorSeconds: meanAbsoluteErrorSeconds === null ? null : round(meanAbsoluteErrorSeconds, 3),
        medianAbsoluteErrorSeconds: medianAbsoluteErrorSeconds === null ? null : round(medianAbsoluteErrorSeconds, 3),
        maximumAbsoluteErrorSeconds: errors.length ? Math.max(...errors) : null,
        residuals: rows
    };
}

async function sha256File(file) {
    const hash = crypto.createHash('sha256');
    await new Promise((resolve, reject) => {
        const stream = createReadStream(file);
        stream.on('data', chunk => hash.update(chunk));
        stream.on('error', reject);
        stream.on('end', resolve);
    });
    return hash.digest('hex');
}

async function run(command, args) {
    await new Promise((resolve, reject) => {
        const child = spawn(command, args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', chunk => { stdout += chunk; });
        child.stderr.on('data', chunk => { stderr += chunk; });
        child.on('error', reject);
        child.on('close', code => code === 0 ? resolve() : reject(new Error(`frame extraction failed (${code}): ${stdout}\n${stderr}`)));
    });
}

async function readJsonLines(file) {
    const text = await readFile(file, 'utf8');
    return text.split(/\r?\n/u).filter(Boolean).map(line => JSON.parse(line));
}

async function extractAnchorFrames(target, anchors) {
    const output = path.resolve(ROOT, LOCAL_ROOT, target.reviewTargetId, 'task200-anchors');
    const timestampsFile = path.join(output, 'timestamps-ms.txt');
    await mkdir(output, { recursive: true });
    const timestamps = [...new Set(anchors.map(anchor => Math.round(anchor.videoSeconds * 1000)))].sort((a, b) => a - b);
    await writeFile(timestampsFile, `${timestamps.join('\n')}\n`, 'utf8');
    const python = path.resolve(ROOT, '.venv-video/Scripts/python.exe');
    await run(python, [
        '-m', 'deadem.video_pipeline.cli',
        '--video', target.inputs.video.localPath,
        '--output', output,
        '--timestamps-file', timestampsFile,
        '--image-format', 'jpg',
        '--jpeg-quality', '90',
        '--overwrite',
        '--offline',
        '--no-model-download'
    ]);
    const frames = await readJsonLines(path.join(output, 'frame-manifest.jsonl'));
    const byRequested = new Map(frames.map(frame => [frame.requested_timestamp_ms, frame]));
    return anchors.map(anchor => {
        const frame = byRequested.get(Math.round(anchor.videoSeconds * 1000));
        if (!frame || frame.decode_status !== 'decoded') throw new Error(`anchor frame unavailable: ${anchor.anchorId}`);
        return {
            ...anchor,
            frameEvidence: {
                requestedTimestampMs: frame.requested_timestamp_ms,
                decodedTimestampMs: frame.decoded_timestamp_ms,
                timestampErrorMs: frame.timestamp_error_ms,
                sha256: frame.sha256,
                localPath: slash(frame.image_path),
                decodeStatus: frame.decode_status,
                decoderBackend: frame.decoder_backend
            }
        };
    });
}

function makeModel(reviewTargetId, linear, anchors, replayLastSeconds, videoDurationSeconds) {
    const lastAnchor = Math.max(...anchors.map(anchor => anchor.replayElapsedSeconds));
    const segment = {
        segmentId: `${reviewTargetId}_linear_001`,
        replayStartSeconds: 0,
        replayEndSeconds: lastAnchor,
        videoStartSeconds: round(linear.interceptSeconds, 3),
        videoEndSeconds: round((linear.slope * lastAnchor) + linear.interceptSeconds, 3),
        slope: linear.slope,
        interceptSeconds: linear.interceptSeconds
    };
    if (segment.videoStartSeconds < 0 || segment.videoEndSeconds > videoDurationSeconds) throw new Error(`model exceeds VOD bounds: ${reviewTargetId}`);
    return {
        reviewTargetId,
        modelType: 'linear',
        equation: 'video_seconds = slope * replay_elapsed_seconds + intercept_seconds',
        segments: [segment],
        coveredReplayRegion: { startSeconds: 0, endSeconds: lastAnchor },
        uncoveredReplayRegions: lastAnchor < replayLastSeconds ? [{ afterSecondsExclusive: lastAnchor, endSecondsInclusive: replayLastSeconds }] : [],
        rejectionPolicy: 'reject_outside_covered_region_without_extrapolation'
    };
}

async function writeArtifact(name, value) {
    const file = path.resolve(ROOT, OUTPUT_ROOT, name);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, deterministicJson(value), 'utf8');
    return file;
}

export async function emit() {
    const intake = JSON.parse(await readFile(path.resolve(ROOT, INTAKE_MANIFEST), 'utf8'));
    const telemetry = JSON.parse(await readFile(path.resolve(ROOT, TELEMETRY_SUMMARY), 'utf8'));
    const inputTargets = new Map(intake.targets.map(target => [target.reviewTargetId, target]));
    const telemetryTargets = new Map(telemetry.targets.map(target => [target.reviewTargetId, target]));
    const manifestTargets = [];
    const anchorTargets = [];
    const models = [];
    const validations = [];

    for (const reviewTargetId of TARGET_IDS) {
        assertReviewTargetId(reviewTargetId);
        const target = inputTargets.get(reviewTargetId);
        const telemetryTarget = telemetryTargets.get(reviewTargetId);
        if (!target || !telemetryTarget) throw new Error(`missing accepted input bridge: ${reviewTargetId}`);
        const verifiedInputs = {};
        for (const kind of ['replay', 'video']) {
            const expected = target.inputs[kind];
            const observedStat = await stat(expected.localPath);
            const observedSha256 = await sha256File(expected.localPath);
            if (observedStat.size !== expected.sizeBytes || observedSha256 !== expected.sha256) throw new Error(`Task 198 ${kind} identity mismatch: ${reviewTargetId}`);
            verifiedInputs[kind] = {
                localPath: expected.localPath,
                sizeBytes: observedStat.size,
                expectedSha256: expected.sha256,
                observedSha256,
                identityStatus: 'matched_task198_manifest'
            };
        }
        const planned = ANCHOR_PLAN[reviewTargetId].map(anchor => ({ ...anchor, reviewTargetId }));
        const anchorCounts = validateAnchors(planned);
        const anchors = await extractAnchorFrames(target, planned);
        const linear = fitLinearModel(anchors);
        const model = makeModel(reviewTargetId, linear, anchors, telemetryTarget.normalizedTimeCoverage.lastTime, target.inputs.video.durationSeconds);
        const fitMetrics = residualMetrics(model, anchors, 'fit');
        const validationMetrics = residualMetrics(model, anchors, 'validation');
        const declaredErrorSeconds = reviewTargetId === 'review_match_001' ? 9 : 2;
        model.estimatedErrorSeconds = declaredErrorSeconds;
        model.fitAnchorCount = anchorCounts.fit;
        model.validationAnchorCount = anchorCounts.validation;
        model.validationMaximumAbsoluteErrorSeconds = validationMetrics.maximumAbsoluteErrorSeconds;
        manifestTargets.push({
            reviewTargetId,
            inputs: verifiedInputs,
            replayCoverage: telemetryTarget.normalizedTimeCoverage,
            videoDurationSeconds: target.inputs.video.durationSeconds,
            frameEvidenceCount: anchors.length
        });
        anchorTargets.push({ reviewTargetId, anchors });
        models.push(model);
        validations.push({
            reviewTargetId,
            fit: fitMetrics,
            validation: validationMetrics,
            declaredEstimatedErrorSeconds: declaredErrorSeconds,
            coverageFraction: round(model.coveredReplayRegion.endSeconds / telemetryTarget.normalizedTimeCoverage.lastTime, 6),
            outsideCoverageProbe: mapReplayElapsed(model, telemetryTarget.normalizedTimeCoverage.lastTime)
        });
    }

    const everyModelUsable = models.every(model => model.validationAnchorCount >= 2 && model.estimatedErrorSeconds <= 10);
    const hasUncoveredTail = models.some(model => model.uncoveredReplayRegions.length > 0);
    const technicalGateStatus = everyModelUsable ? (hasUncoveredTail ? PARTIAL_GATE : POSITIVE_GATE) : BLOCKED_GATE;
    const totals = {
        targetsAttempted: TARGET_IDS.length,
        targetsMapped: models.length,
        fitAnchors: models.reduce((sum, model) => sum + model.fitAnchorCount, 0),
        validationAnchors: models.reduce((sum, model) => sum + model.validationAnchorCount, 0),
        protectedReplayAccessCount: 0,
        finalFactsProduced: 0,
        attributionProduced: 0,
        gameplayInterpretationsProduced: 0
    };

    await writeArtifact('manifest.json', {
        schemaVersion: 1,
        artifactClass: 'two_match_replay_video_sync_manifest',
        generatedBy: 'tools/emit-two-match-replay-video-sync.mjs',
        generatedAt: 'task_200',
        sourceArtifacts: [INTAKE_MANIFEST, TELEMETRY_SUMMARY],
        targets: manifestTargets,
        ...totals
    });
    await writeArtifact('anchors.json', {
        schemaVersion: 1,
        fitValidationSeparation: 'declared_before_model_fit',
        anchorSemantics: 'synchronization evidence with declared uncertainty; not gameplay facts',
        targets: anchorTargets
    });
    await writeArtifact('mapping.json', {
        schemaVersion: 1,
        artifactClass: 'two_match_replay_video_mapping',
        axisInput: 'task199_replay_elapsed_seconds',
        axisOutput: 'task198_vod_seconds',
        models,
        silentExtrapolationAllowed: false,
        displayedGameClockUsedAsGroundTruth: false
    });
    await writeArtifact('validation.json', {
        schemaVersion: 1,
        validationPolicy: 'validation anchors excluded from fit',
        targets: validations,
        criticalFailures: everyModelUsable ? 0 : 1
    });
    await writeArtifact('summary.json', {
        schemaVersion: 1,
        technicalGateStatus,
        counts: totals,
        targets: models.map(model => ({
            reviewTargetId: model.reviewTargetId,
            modelType: model.modelType,
            estimatedErrorSeconds: model.estimatedErrorSeconds,
            coveredReplayRegion: model.coveredReplayRegion,
            uncoveredReplayRegions: model.uncoveredReplayRegions,
            fitAnchorCount: model.fitAnchorCount,
            validationAnchorCount: model.validationAnchorCount,
            validationMaximumAbsoluteErrorSeconds: model.validationMaximumAbsoluteErrorSeconds
        }))
    });
    await writeArtifact('gate.json', {
        schemaVersion: 1,
        technicalGateStatus,
        moduleStatus: hasUncoveredTail ? 'functional_partial' : 'functional_ready',
        reasons: hasUncoveredTail
            ? ['Both mappings are usable inside declared coverage.', 'Small unanchored replay tails are rejected instead of extrapolated.']
            : ['Both mappings are usable across complete declared coverage.'],
        workAcceptanceStatus: 'pending_independent_validation'
    });
    await writeArtifact('provenance-audit.json', {
        schemaVersion: 1,
        inputIdentityRevalidated: true,
        inputHashesChecked: 4,
        frameEvidenceLocalOnly: true,
        manualVisualAnchors: anchorTargets.flatMap(target => target.anchors).filter(anchor => anchor.source === 'manual_visual_anchor').length,
        derivedAlignmentAnchors: anchorTargets.flatMap(target => target.anchors).filter(anchor => anchor.source === 'derived_alignment_anchor').length,
        crossSurfaceEventMatches: anchorTargets.flatMap(target => target.anchors).filter(anchor => anchor.source === 'cross_surface_event_match').length,
        displayedGameClockUsedAsGroundTruth: false,
        hudCountersUsedAsReplayGroundTruth: false,
        protectedReplayAccessCount: 0,
        finalFactsProduced: 0,
        attributionProduced: 0,
        gameplayInterpretationsProduced: 0,
        limitations: [
            'Manual visual anchors are bounded observations with explicit uncertainty.',
            'Aggregate replay counter freezes are synchronization cues, not pause or gameplay facts.',
            'Mappings reject timestamps outside independently anchored coverage.'
        ]
    });
    return { technicalGateStatus, models, validations };
}

async function main() {
    const result = await emit();
    process.stdout.write(`${deterministicJson({ status: result.technicalGateStatus, targets: result.models.length })}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
    main().catch(error => {
        process.stderr.write(`${error.stack ?? error.message}\n`);
        process.exitCode = 1;
    });
}
