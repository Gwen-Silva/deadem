#!/usr/bin/env node
import { createReadStream } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INTAKE_MANIFEST = 'output/local-replay-processing/two-match-assisted-review-intake/task198-bounded2/manifest.json';
const TELEMETRY_AVAILABILITY = 'output/local-replay-processing/minimum-review-telemetry/task199-bounded2/availability.json';
const TELEMETRY_SUMMARY = 'output/local-replay-processing/minimum-review-telemetry/task199-bounded2/summary.json';
const SYNC_MAPPING = 'output/local-replay-processing/replay-video-sync/task200-bounded2/mapping.json';
const OUTPUT_ROOT = 'output/local-replay-processing/whole-match-visual-index/task201-bounded2';
const LOCAL_ROOT = '.local/deadem/visual-index';
const TARGET_IDS = ['review_match_001', 'review_match_002'];
const SAMPLE_INTERVAL_SECONDS = 30;
const CONTACT_SHEET_CAPACITY = 25;
const POSITIVE_GATE = 'whole_match_visual_index_ready';
const GAPS_GATE = 'whole_match_visual_index_ready_with_gaps';
const PARTIAL_GATE = 'whole_match_visual_index_partial';
const BLOCKED_GATE = 'BLOCKED_BY_VISUAL_INDEX_VIDEO_DECODE_UNAVAILABLE';

const slash = value => String(value).replaceAll('\\', '/');
const round = (value, digits = 6) => Number(Number(value).toFixed(digits));

function localRelative(value) {
    const absolute = path.isAbsolute(value) ? value : path.resolve(ROOT, value);
    return slash(path.relative(ROOT, absolute));
}

function sorted(value) {
    if (Array.isArray(value)) return value.map(sorted);
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.keys(value).sort().map(key => [key, sorted(value[key])]));
    }
    return value;
}

export function deterministicJson(value) {
    return `${JSON.stringify(sorted(value), null, 2)}\n`;
}

export function assertReviewTargetId(value) {
    if (/(?:replay|partida|match)[_-]?00?[5-8]/iu.test(String(value))) {
        throw new Error(`protected replay alias rejected before filesystem access: ${value}`);
    }
    if (!TARGET_IDS.includes(value)) throw new Error(`unsupported review target: ${value}`);
    return value;
}

export function consumeSyncMapping(model, replayElapsedSeconds) {
    if (!Number.isFinite(replayElapsedSeconds) || replayElapsedSeconds < 0) {
        return { mapped: false, reason: 'invalid_replay_elapsed_seconds' };
    }
    const segment = model.segments.find(item => replayElapsedSeconds >= item.replayStartSeconds && replayElapsedSeconds <= item.replayEndSeconds);
    if (!segment) return { mapped: false, reason: 'outside_task200_covered_segment', replayElapsedSeconds };
    const mappedVideoTimestampSeconds = round((segment.slope * replayElapsedSeconds) + segment.interceptSeconds, 3);
    if (mappedVideoTimestampSeconds < segment.videoStartSeconds || mappedVideoTimestampSeconds > segment.videoEndSeconds) {
        return { mapped: false, reason: 'outside_task200_video_segment', replayElapsedSeconds };
    }
    return {
        mapped: true,
        replayElapsedSeconds,
        mappedVideoTimestampSeconds,
        syncSegmentId: segment.segmentId,
        syncEstimatedErrorSeconds: model.estimatedErrorSeconds
    };
}

export function generateSamplePlan(reviewTargetId, model, intervalSeconds = SAMPLE_INTERVAL_SECONDS) {
    assertReviewTargetId(reviewTargetId);
    if (!Number.isInteger(intervalSeconds) || intervalSeconds < 20 || intervalSeconds > 45) {
        throw new Error('sampling interval must be an integer from 20 through 45 seconds');
    }
    const start = model.coveredReplayRegion.startSeconds;
    const end = model.coveredReplayRegion.endSeconds;
    const rows = [];
    for (let replayElapsedSeconds = start; replayElapsedSeconds <= end; replayElapsedSeconds += intervalSeconds) {
        const mapped = consumeSyncMapping(model, replayElapsedSeconds);
        if (!mapped.mapped) continue;
        rows.push({
            reviewTargetId,
            visualIndexFrameId: `${reviewTargetId}_frame_${String(rows.length + 1).padStart(4, '0')}`,
            replayElapsedSeconds,
            mappedVideoTimestampSeconds: mapped.mappedVideoTimestampSeconds,
            syncSegmentId: mapped.syncSegmentId,
            syncEstimatedErrorSeconds: mapped.syncEstimatedErrorSeconds,
            requestedVideoTimestampMs: Math.round(mapped.mappedVideoTimestampSeconds * 1000)
        });
    }
    return rows;
}

export function validateSamplePlan(rows, expectedTargetId = null) {
    const ids = new Set();
    let ordered = true;
    let crossTargetMixing = false;
    for (let index = 0; index < rows.length; index++) {
        const row = rows[index];
        if (ids.has(row.visualIndexFrameId)) throw new Error(`duplicate frame id: ${row.visualIndexFrameId}`);
        ids.add(row.visualIndexFrameId);
        if (expectedTargetId && row.reviewTargetId !== expectedTargetId) crossTargetMixing = true;
        if (index > 0 && (row.replayElapsedSeconds <= rows[index - 1].replayElapsedSeconds || row.mappedVideoTimestampSeconds <= rows[index - 1].mappedVideoTimestampSeconds)) ordered = false;
        if (row.requestedVideoTimestampMs !== Math.round(row.mappedVideoTimestampSeconds * 1000)) throw new Error(`timestamp pair was not preserved: ${row.visualIndexFrameId}`);
        if (!Number.isFinite(row.syncEstimatedErrorSeconds)) throw new Error(`sync error missing: ${row.visualIndexFrameId}`);
    }
    if (!ordered) throw new Error('sample plan is not strictly chronological');
    if (crossTargetMixing) throw new Error('cross-target sample mixing detected');
    return { frameCount: rows.length, ordered, crossTargetMixing };
}

export function assignContactSheetMembership(frames, capacity = CONTACT_SHEET_CAPACITY) {
    if (!Number.isInteger(capacity) || capacity < 1) throw new Error('contact sheet capacity must be positive');
    let successfulIndex = 0;
    return frames.map(frame => {
        if (frame.extractionStatus !== 'decoded') return { ...frame, contactSheetId: null, contactSheetPosition: null };
        const member = {
            ...frame,
            contactSheetId: `${frame.reviewTargetId}_sheet_${String(Math.floor(successfulIndex / capacity) + 1).padStart(3, '0')}`,
            contactSheetPosition: successfulIndex % capacity
        };
        successfulIndex += 1;
        return member;
    });
}

export function mergeFrameExtraction(plan, extractedRows, contextByReplaySecond = new Map()) {
    const byRequested = new Map(extractedRows.map(row => [row.requested_timestamp_ms, row]));
    return plan.map(planned => {
        const extracted = byRequested.get(planned.requestedVideoTimestampMs);
        const decoded = extracted?.decode_status === 'decoded';
        return {
            ...planned,
            decodedVideoTimestampMs: extracted?.decoded_timestamp_ms ?? null,
            seekErrorMs: extracted?.timestamp_error_ms ?? null,
            frameSha256: decoded ? extracted.sha256 : null,
            localFramePath: decoded ? localRelative(extracted.image_path) : null,
            extractionStatus: extracted?.decode_status ?? 'missing_manifest_row',
            sourceFrameIndex: extracted?.source_frame_index ?? null,
            width: extracted?.width ?? null,
            height: extracted?.height ?? null,
            factualContext: contextByReplaySecond.get(planned.replayElapsedSeconds) ?? null,
            provenance: {
                frame: 'factual/local_video_decoded_frame',
                timestampMapping: 'derived/task200_replay_video_sync',
                context: 'factual_replay_observations_and_declared_aggregates',
                semanticInterpretation: false
            }
        };
    });
}

export function calculateCoverage(frames, model, intervalSeconds, contactSheetCount) {
    const successful = frames.filter(frame => frame.extractionStatus === 'decoded');
    const errors = successful.map(frame => Math.abs(frame.seekErrorMs ?? 0));
    const expectedSamples = frames.length;
    const extractedSamples = successful.length;
    return {
        replayCoveredStartSeconds: model.coveredReplayRegion.startSeconds,
        replayCoveredEndSeconds: model.coveredReplayRegion.endSeconds,
        samplingIntervalSeconds: intervalSeconds,
        expectedSamples,
        extractedSamples,
        failedSamples: expectedSamples - extractedSamples,
        extractionRate: expectedSamples ? round(extractedSamples / expectedSamples, 6) : 0,
        firstSuccessfulReplaySeconds: successful[0]?.replayElapsedSeconds ?? null,
        lastSuccessfulReplaySeconds: successful.at(-1)?.replayElapsedSeconds ?? null,
        mappedVodStartSeconds: successful[0]?.mappedVideoTimestampSeconds ?? null,
        mappedVodEndSeconds: successful.at(-1)?.mappedVideoTimestampSeconds ?? null,
        syncEstimatedErrorSeconds: model.estimatedErrorSeconds,
        averageAbsoluteSeekErrorMs: errors.length ? round(errors.reduce((sum, value) => sum + value, 0) / errors.length, 3) : null,
        maximumAbsoluteSeekErrorMs: errors.length ? Math.max(...errors) : null,
        uncoveredReplayRanges: model.uncoveredReplayRegions.map(region => ({
            startSecondsInclusive: region.afterSecondsExclusive + 1,
            endSecondsInclusive: region.endSecondsInclusive
        })),
        contactSheetCount
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
        child.on('close', code => code === 0 ? resolve({ stdout, stderr }) : reject(new Error(`command failed (${code}): ${stdout}\n${stderr}`)));
    });
}

async function readJsonLines(file) {
    const text = await readFile(file, 'utf8');
    return text.split(/\r?\n/u).filter(Boolean).map(line => JSON.parse(line));
}

async function forEachJsonLine(file, callback) {
    const input = createReadStream(file, { encoding: 'utf8' });
    const lines = readline.createInterface({ input, crlfDelay: Infinity });
    for await (const line of lines) {
        if (line) callback(JSON.parse(line));
    }
}

function nearestMapEntry(map, replayElapsedSeconds) {
    if (map.has(replayElapsedSeconds)) return [replayElapsedSeconds, map.get(replayElapsedSeconds)];
    let nearestTime = null;
    let nearestValue = null;
    for (const [time, value] of map.entries()) {
        if (nearestTime === null || Math.abs(time - replayElapsedSeconds) < Math.abs(nearestTime - replayElapsedSeconds)) {
            nearestTime = time;
            nearestValue = value;
        }
    }
    return [nearestTime, nearestValue];
}

async function loadFactualContext(reviewTargetId, sampleTimes, availability) {
    const local = path.resolve(ROOT, '.local/deadem/review-telemetry', reviewTargetId);
    const selected = new Set(sampleTimes);
    const participants = new Map();
    const netWorth = new Map();
    const objectives = new Map();
    const lifeState = new Map();
    await forEachJsonLine(path.join(local, 'timeline.jsonl'), row => {
        if (selected.has(row.elapsedSeconds)) participants.set(row.elapsedSeconds, row.observedParticipants);
    });
    await forEachJsonLine(path.join(local, 'net-worth-samples.jsonl'), row => {
        if (!selected.has(row.elapsedSeconds)) return;
        const current = netWorth.get(row.elapsedSeconds) ?? { participantCount: 0, totalObservedValue: 0, minObservedValue: null, maxObservedValue: null };
        current.participantCount += 1;
        current.totalObservedValue += row.value;
        current.minObservedValue = current.minObservedValue === null ? row.value : Math.min(current.minObservedValue, row.value);
        current.maxObservedValue = current.maxObservedValue === null ? row.value : Math.max(current.maxObservedValue, row.value);
        netWorth.set(row.elapsedSeconds, current);
    });
    await forEachJsonLine(path.join(local, 'objective-observations.jsonl'), row => {
        if (selected.has(row.elapsedSeconds)) objectives.set(row.elapsedSeconds, (objectives.get(row.elapsedSeconds) ?? 0) + 1);
    });
    await forEachJsonLine(path.join(local, 'life-state-observations.jsonl'), row => {
        if (selected.has(row.elapsedSeconds)) lifeState.set(row.elapsedSeconds, (lifeState.get(row.elapsedSeconds) ?? 0) + 1);
    });
    const context = new Map();
    for (const replayElapsedSeconds of sampleTimes) {
        const [netWorthTime, netWorthValue] = nearestMapEntry(netWorth, replayElapsedSeconds);
        const objectiveCount = objectives.get(replayElapsedSeconds) ?? 0;
        const lifeStateCount = lifeState.get(replayElapsedSeconds) ?? 0;
        context.set(replayElapsedSeconds, {
            observedParticipantCount: participants.get(replayElapsedSeconds) ?? null,
            netWorthSnapshot: netWorthValue ? {
                nearestReplayElapsedSeconds: netWorthTime,
                ...netWorthValue,
                provenanceClass: 'derived/replay_observed_counter_aggregate_without_interpretation'
            } : null,
            objectiveObservation: {
                observationCount: objectiveCount,
                sampleAvailable: objectiveCount > 0,
                semanticClass: 'raw_structure_or_objective_like_observation_count'
            },
            lifeStateObservation: {
                availabilityStatus: availability.lifeState.status,
                observationCount: lifeStateCount,
                sampleAvailable: lifeStateCount > 0,
                semanticClass: 'raw_lifecycle_related_observation_availability'
            }
        });
    }
    return context;
}

async function extractFrames(target, plan, outputRoot, suffix = '') {
    const targetRoot = path.resolve(ROOT, outputRoot, `${target.reviewTargetId}${suffix}`);
    const timestampsFile = path.join(targetRoot, 'timestamps-ms.txt');
    await mkdir(targetRoot, { recursive: true });
    await writeFile(timestampsFile, `${plan.map(row => row.requestedVideoTimestampMs).join('\n')}\n`, 'utf8');
    const python = path.resolve(ROOT, '.venv-video/Scripts/python.exe');
    await run(python, [
        '-m', 'deadem.video_pipeline.cli',
        '--video', target.inputs.video.localPath,
        '--output', targetRoot,
        '--timestamps-file', timestampsFile,
        '--image-format', 'jpg',
        '--jpeg-quality', '90',
        '--overwrite',
        '--offline',
        '--no-model-download'
    ]);
    return readJsonLines(path.join(targetRoot, 'frame-manifest.jsonl'));
}

function representativePlan(plan, count = 10) {
    if (plan.length <= count) return plan;
    const indexes = new Set();
    for (let index = 0; index < count; index++) indexes.add(Math.round((index * (plan.length - 1)) / (count - 1)));
    return [...indexes].sort((a, b) => a - b).map(index => plan[index]);
}

async function auditRepresentativeDeterminism(target, plan, fullRows) {
    const subset = representativePlan(plan);
    const rerunRows = await extractFrames(target, subset, `${LOCAL_ROOT}/determinism-rerun`, '');
    const fullByTimestamp = new Map(fullRows.map(row => [row.requested_timestamp_ms, row]));
    const rerunByTimestamp = new Map(rerunRows.map(row => [row.requested_timestamp_ms, row]));
    const comparisons = subset.map(item => {
        const first = fullByTimestamp.get(item.requestedVideoTimestampMs);
        const second = rerunByTimestamp.get(item.requestedVideoTimestampMs);
        return {
            requestedVideoTimestampMs: item.requestedVideoTimestampMs,
            requestedTimestampMatched: first?.requested_timestamp_ms === second?.requested_timestamp_ms,
            decodedTimestampMatched: first?.decoded_timestamp_ms === second?.decoded_timestamp_ms,
            frameHashMatched: Boolean(first?.sha256 && first.sha256 === second?.sha256)
        };
    });
    return {
        representativeSamples: comparisons.length,
        requestedTimestampsMatched: comparisons.filter(item => item.requestedTimestampMatched).length,
        decodedTimestampsMatched: comparisons.filter(item => item.decodedTimestampMatched).length,
        frameHashesMatched: comparisons.filter(item => item.frameHashMatched).length,
        deterministic: comparisons.every(item => item.requestedTimestampMatched && item.decodedTimestampMatched && item.frameHashMatched)
    };
}

async function buildContactSheets(reviewTargetId, frames) {
    const targetRoot = path.resolve(ROOT, LOCAL_ROOT, reviewTargetId);
    const source = path.join(targetRoot, 'contact-sheet-source.json');
    const manifest = path.join(targetRoot, 'contact-sheet-manifest.json');
    await writeFile(source, deterministicJson({ reviewTargetId, frames }), 'utf8');
    const python = path.resolve(ROOT, '.venv-video/Scripts/python.exe');
    const script = path.resolve(ROOT, 'tools/build-whole-match-contact-sheets.py');
    const args = ['--source', source, '--output-root', path.resolve(ROOT, LOCAL_ROOT), '--manifest', manifest];
    await run(python, [script, ...args]);
    const first = JSON.parse(await readFile(manifest, 'utf8'));
    await run(python, [script, ...args]);
    const second = JSON.parse(await readFile(manifest, 'utf8'));
    return {
        manifest: second,
        byteDeterministic: deterministicJson(first) === deterministicJson(second)
    };
}

async function writeArtifact(name, value) {
    const file = path.resolve(ROOT, OUTPUT_ROOT, name);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, deterministicJson(value), 'utf8');
}

export async function emit() {
    const intake = JSON.parse(await readFile(path.resolve(ROOT, INTAKE_MANIFEST), 'utf8'));
    const availabilityArtifact = JSON.parse(await readFile(path.resolve(ROOT, TELEMETRY_AVAILABILITY), 'utf8'));
    const telemetrySummary = JSON.parse(await readFile(path.resolve(ROOT, TELEMETRY_SUMMARY), 'utf8'));
    const sync = JSON.parse(await readFile(path.resolve(ROOT, SYNC_MAPPING), 'utf8'));
    if (sync.silentExtrapolationAllowed !== false) throw new Error('Task 200 mapping does not prohibit silent extrapolation');
    const targetsById = new Map(intake.targets.map(target => [target.reviewTargetId, target]));
    const modelsById = new Map(sync.models.map(model => [model.reviewTargetId, model]));
    const availabilityById = new Map(availabilityArtifact.targets.map(target => [target.reviewTargetId, target.availability]));
    const telemetryById = new Map(telemetrySummary.targets.map(target => [target.reviewTargetId, target]));
    const manifestTargets = [];
    const allFrames = [];
    const contactTargets = [];
    const coverageTargets = [];
    const determinismTargets = [];

    for (const reviewTargetId of TARGET_IDS) {
        assertReviewTargetId(reviewTargetId);
        const target = targetsById.get(reviewTargetId);
        const model = modelsById.get(reviewTargetId);
        const availability = availabilityById.get(reviewTargetId);
        const telemetry = telemetryById.get(reviewTargetId);
        if (!target || !model || !availability || !telemetry) throw new Error(`canonical Task 198/199/200 bridge missing: ${reviewTargetId}`);
        const videoStat = await stat(target.inputs.video.localPath);
        const videoSha256 = await sha256File(target.inputs.video.localPath);
        if (videoStat.size !== target.inputs.video.sizeBytes || videoSha256 !== target.inputs.video.sha256) throw new Error(`Task 198 VOD identity mismatch: ${reviewTargetId}`);
        const plan = generateSamplePlan(reviewTargetId, model);
        validateSamplePlan(plan, reviewTargetId);
        const context = await loadFactualContext(reviewTargetId, plan.map(row => row.replayElapsedSeconds), availability);
        const extractedRows = await extractFrames(target, plan, LOCAL_ROOT);
        const mergedFrames = assignContactSheetMembership(mergeFrameExtraction(plan, extractedRows, context));
        const contact = await buildContactSheets(reviewTargetId, mergedFrames);
        const determinism = await auditRepresentativeDeterminism(target, plan, extractedRows);
        const coverage = calculateCoverage(mergedFrames, model, SAMPLE_INTERVAL_SECONDS, contact.manifest.contactSheetCount);
        if (coverage.lastSuccessfulReplaySeconds > model.coveredReplayRegion.endSeconds) throw new Error(`uncovered replay sample extracted: ${reviewTargetId}`);
        manifestTargets.push({
            reviewTargetId,
            video: {
                localPath: target.inputs.video.localPath,
                sizeBytes: videoStat.size,
                expectedSha256: target.inputs.video.sha256,
                observedSha256: videoSha256,
                identityStatus: 'matched_task198_manifest'
            },
            telemetryStatus: telemetry.processingStatus,
            syncModelSource: SYNC_MAPPING,
            samplingPolicy: 'uniform_replay_elapsed_only_inside_task200_covered_segments'
        });
        allFrames.push(...mergedFrames);
        contactTargets.push({
            reviewTargetId,
            storagePolicy: contact.manifest.storagePolicy,
            contactSheetCount: contact.manifest.contactSheetCount,
            frameCount: contact.manifest.frameCount,
            byteDeterministicAcrossTwoBuilds: contact.byteDeterministic,
            sheets: contact.manifest.sheets
        });
        coverageTargets.push({ reviewTargetId, ...coverage });
        determinismTargets.push({ reviewTargetId, ...determinism, contactSheetsByteDeterministic: contact.byteDeterministic });
    }

    validateSamplePlan(allFrames.filter(frame => frame.reviewTargetId === 'review_match_001'), 'review_match_001');
    validateSamplePlan(allFrames.filter(frame => frame.reviewTargetId === 'review_match_002'), 'review_match_002');
    const totalExpected = coverageTargets.reduce((sum, target) => sum + target.expectedSamples, 0);
    const totalExtracted = coverageTargets.reduce((sum, target) => sum + target.extractedSamples, 0);
    const allAbove98 = coverageTargets.every(target => target.extractionRate >= 0.98);
    const allAbove95 = coverageTargets.every(target => target.extractionRate >= 0.95);
    const atLeastOneNavigable = coverageTargets.some(target => target.extractionRate >= 0.95);
    const allDeterministic = determinismTargets.every(target => target.deterministic && target.contactSheetsByteDeterministic);
    const technicalGateStatus = allAbove98 && allDeterministic ? POSITIVE_GATE : allAbove95 ? GAPS_GATE : atLeastOneNavigable ? PARTIAL_GATE : BLOCKED_GATE;
    const counts = {
        targetsAttempted: 2,
        targetsIndexed: coverageTargets.filter(target => target.extractionRate >= 0.95).length,
        plannedFrames: totalExpected,
        extractedFrames: totalExtracted,
        failedFrames: totalExpected - totalExtracted,
        contactSheets: contactTargets.reduce((sum, target) => sum + target.contactSheetCount, 0),
        protectedReplayAccessCount: 0,
        heavyImagesVersioned: 0,
        gameplayInterpretationsProduced: 0,
        finalFactsProduced: 0,
        attributionProduced: 0
    };

    await writeArtifact('manifest.json', {
        schemaVersion: 1,
        artifactClass: 'whole_match_visual_index_manifest',
        generatedBy: 'tools/emit-whole-match-visual-index.mjs',
        generatedAt: 'task_201',
        sourceArtifacts: [INTAKE_MANIFEST, TELEMETRY_AVAILABILITY, TELEMETRY_SUMMARY, SYNC_MAPPING],
        targets: manifestTargets,
        counts
    });
    await writeArtifact('frame-index.json', {
        schemaVersion: 1,
        artifactClass: 'whole_match_visual_frame_index',
        samplingIntervalSeconds: SAMPLE_INTERVAL_SECONDS,
        frameCount: allFrames.length,
        frames: allFrames
    });
    await writeArtifact('contact-sheet-index.json', {
        schemaVersion: 1,
        artifactClass: 'whole_match_visual_contact_sheet_index',
        imagesVersioned: false,
        targets: contactTargets
    });
    await writeArtifact('coverage.json', {
        schemaVersion: 1,
        targets: coverageTargets,
        plannedFrames: totalExpected,
        extractedFrames: totalExtracted,
        overallExtractionRate: round(totalExtracted / totalExpected, 6)
    });
    await writeArtifact('summary.json', {
        schemaVersion: 1,
        technicalGateStatus,
        counts,
        samplingIntervalSeconds: SAMPLE_INTERVAL_SECONDS,
        targets: coverageTargets,
        determinism: {
            status: allDeterministic ? 'representative_frame_and_contact_sheet_determinism_confirmed' : 'determinism_not_confirmed',
            targets: determinismTargets
        }
    });
    await writeArtifact('gate.json', {
        schemaVersion: 1,
        technicalGateStatus,
        moduleStatus: technicalGateStatus === POSITIVE_GATE ? 'functional_ready' : technicalGateStatus === BLOCKED_GATE ? 'blocked' : 'functional_with_gaps',
        workAcceptanceStatus: 'pending_independent_validation',
        reasons: [
            'Sampling is limited to Task 200 covered replay regions.',
            'Replay-to-VOD alignment error remains separate from decoder seek error.',
            'Contact sheets and frame images remain local and unversioned.'
        ]
    });
    await writeArtifact('provenance-audit.json', {
        schemaVersion: 1,
        task198VideoIdentitiesRevalidated: 2,
        task199FactualContextConsumed: true,
        task200MappingConsumedWithoutRecalculation: true,
        frameEvidenceLocalOnly: true,
        contactSheetsLocalOnly: true,
        syncErrorPreservedPerFrame: allFrames.every(frame => frame.syncEstimatedErrorSeconds === (frame.reviewTargetId === 'review_match_001' ? 9 : 2)),
        seekErrorKeptSeparateFromSyncError: true,
        uncoveredRangesSampled: 0,
        protectedReplayAccessCount: 0,
        heavyImagesVersioned: 0,
        gameplayInterpretationsProduced: 0,
        finalFactsProduced: 0,
        attributionProduced: 0,
        prohibitedVisualStagesExecuted: [],
        limitations: [
            'Frames are visual evidence and receive no automatic gameplay labels.',
            'Task 200 alignment error remains 9 and 2 seconds even when OpenCV seek error is zero.',
            'The final uncovered replay tails remain unavailable in this index.'
        ]
    });
    return { technicalGateStatus, counts, coverageTargets, determinismTargets };
}

async function main() {
    const result = await emit();
    process.stdout.write(deterministicJson({ status: result.technicalGateStatus, counts: result.counts }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
    main().catch(error => {
        process.stderr.write(`${error.stack ?? error.message}\n`);
        process.exitCode = 1;
    });
}
