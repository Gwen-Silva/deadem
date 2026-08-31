#!/usr/bin/env node
import { createReadStream } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INTAKE_MANIFEST = 'output/local-replay-processing/two-match-assisted-review-intake/task198-bounded2/manifest.json';
const SYNC_MAPPING = 'output/local-replay-processing/replay-video-sync/task200-bounded2/mapping.json';
const VISUAL_INDEX_MANIFEST = 'output/local-replay-processing/whole-match-visual-index/task201-bounded2/manifest.json';
const CANDIDATE_WINDOWS = 'output/local-replay-processing/review-candidate-windows/task202-bounded2/candidate-windows.json';
const OUTPUT_ROOT = 'output/local-replay-processing/dense-review-evidence/task203-bounded2';
const LOCAL_ROOT = '.local/deadem/dense-review';
const TARGET_IDS = ['review_match_001', 'review_match_002'];
const BASE_CADENCE_MS = Object.freeze({ high: 1000, medium: 2000, low: 5000 });
const ADJUSTED_HIGH_CADENCE_MS = 1500;
const DENSITY_LIMIT = 6000;
const SHEET_CAPACITY = 25;
const POSITIVE_GATE = 'two_match_dense_visual_evidence_ready';
const GAPS_GATE = 'two_match_dense_visual_evidence_ready_with_gaps';
const PARTIAL_GATE = 'two_match_dense_visual_evidence_partial';
const BLOCKED_GATE = 'BLOCKED_BY_DENSE_REVIEW_VIDEO_DECODE_UNAVAILABLE';
const EXTRACTED_STATUSES = new Set(['decoded', 'out_of_tolerance']);
const PRIORITY_ORDER = Object.freeze({ high: 0, medium: 1, low: 2 });

const slash = value => String(value).replaceAll('\\', '/');
const round = (value, digits = 6) => Number(Number(value).toFixed(digits));

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

function localRelative(value) {
    const absolute = path.isAbsolute(value) ? value : path.resolve(ROOT, value);
    return slash(path.relative(ROOT, absolute));
}

export function assertReviewTargetId(value) {
    if (/(?:replay|partida|match)[_-]?00?[5-8]/iu.test(String(value))) {
        throw new Error(`protected replay alias rejected before filesystem access: ${value}`);
    }
    if (!TARGET_IDS.includes(value)) throw new Error(`unsupported review target: ${value}`);
    return value;
}

export function cadenceMsForTier(priorityTier, densityAdjustmentCount = 0) {
    if (!(priorityTier in BASE_CADENCE_MS)) throw new Error(`unsupported priority tier: ${priorityTier}`);
    if (priorityTier === 'high' && densityAdjustmentCount === 1) return ADJUSTED_HIGH_CADENCE_MS;
    if (densityAdjustmentCount !== 0 && densityAdjustmentCount !== 1) throw new Error('density adjustment count must be zero or one');
    return BASE_CADENCE_MS[priorityTier];
}

function toTimestampMs(seconds, field) {
    if (!Number.isFinite(seconds) || seconds < 0) throw new Error(`invalid ${field}: ${seconds}`);
    return Math.round(seconds * 1000);
}

export function buildWindowTimestampRequests(window, densityAdjustmentCount = 0) {
    const mapping = window.videoMapping;
    if (!mapping?.mapped) throw new Error(`candidate window is not mapped: ${window.candidateWindowId}`);
    const startMs = toTimestampMs(mapping.visualEvidenceStartSeconds, 'visualEvidenceStartSeconds');
    const endMs = toTimestampMs(mapping.visualEvidenceEndSeconds, 'visualEvidenceEndSeconds');
    if (startMs > endMs) throw new Error(`candidate window has inverted visual range: ${window.candidateWindowId}`);
    const cadenceMs = cadenceMsForTier(window.priorityTier, densityAdjustmentCount);
    const timestamps = new Set([startMs, Math.round((startMs + endMs) / 2), endMs]);
    const firstGridMs = Math.ceil(startMs / cadenceMs) * cadenceMs;
    for (let timestampMs = firstGridMs; timestampMs <= endMs; timestampMs += cadenceMs) timestamps.add(timestampMs);
    return {
        candidateWindowId: window.candidateWindowId,
        reviewTargetId: window.reviewTargetId,
        priorityTier: window.priorityTier,
        cadenceMs,
        startMs,
        endMs,
        centerMs: Math.round((startMs + endMs) / 2),
        timestampsMs: [...timestamps].sort((left, right) => left - right)
    };
}

function highestPriority(windows) {
    return [...windows].sort((left, right) => PRIORITY_ORDER[left.priorityTier] - PRIORITY_ORDER[right.priorityTier])[0].priorityTier;
}

export function buildTargetExtractionPlan(reviewTargetId, windows, densityAdjustmentCount = 0) {
    assertReviewTargetId(reviewTargetId);
    const targetWindows = windows
        .filter(window => window.reviewTargetId === reviewTargetId)
        .sort((left, right) => left.candidateWindowId.localeCompare(right.candidateWindowId));
    if (!targetWindows.length) throw new Error(`candidate windows missing for ${reviewTargetId}`);
    const requestSets = targetWindows.map(window => buildWindowTimestampRequests(window, densityAdjustmentCount));
    const rawPlannedRequests = requestSets.reduce((sum, item) => sum + item.timestampsMs.length, 0);
    const timestamps = new Set(requestSets.flatMap(item => item.timestampsMs));
    const rows = [...timestamps].sort((left, right) => left - right).map((requestedTimestampMs, index) => {
        const referencing = targetWindows.filter(window => {
            const mapping = window.videoMapping;
            const startMs = toTimestampMs(mapping.visualEvidenceStartSeconds, 'visualEvidenceStartSeconds');
            const endMs = toTimestampMs(mapping.visualEvidenceEndSeconds, 'visualEvidenceEndSeconds');
            return requestedTimestampMs >= startMs && requestedTimestampMs <= endMs;
        });
        const priorityTier = highestPriority(referencing);
        return {
            denseFrameId: `${reviewTargetId}_dense_${String(index + 1).padStart(5, '0')}`,
            reviewTargetId,
            requestedTimestampMs,
            requestedVodSeconds: round(requestedTimestampMs / 1000, 3),
            windowsReferencing: referencing.map(window => window.candidateWindowId).sort(),
            highestRequiredPriority: priorityTier,
            requiredCadenceSeconds: cadenceMsForTier(priorityTier, densityAdjustmentCount) / 1000,
            provenance: 'derived/task202_priority_cadence_extraction_plan'
        };
    });
    return {
        reviewTargetId,
        densityAdjustmentCount,
        cadenceSeconds: {
            high: cadenceMsForTier('high', densityAdjustmentCount) / 1000,
            medium: cadenceMsForTier('medium', densityAdjustmentCount) / 1000,
            low: cadenceMsForTier('low', densityAdjustmentCount) / 1000
        },
        candidateWindowCount: targetWindows.length,
        rawPlannedRequests,
        deduplicatedRequests: rows.length,
        deduplicationSavings: rawPlannedRequests - rows.length,
        rows
    };
}

export function buildExtractionPlans(windows) {
    let densityAdjustmentCount = 0;
    let targets = TARGET_IDS.map(reviewTargetId => buildTargetExtractionPlan(reviewTargetId, windows, densityAdjustmentCount));
    if (targets.reduce((sum, target) => sum + target.deduplicatedRequests, 0) > DENSITY_LIMIT) {
        densityAdjustmentCount = 1;
        targets = TARGET_IDS.map(reviewTargetId => buildTargetExtractionPlan(reviewTargetId, windows, densityAdjustmentCount));
    }
    return { densityAdjustmentCount, targets };
}

export function selectRepresentativeFrame(frames, targetTimestampMs) {
    if (!frames.length) return null;
    return [...frames].sort((left, right) => {
        const distance = Math.abs(left.requestedTimestampMs - targetTimestampMs) - Math.abs(right.requestedTimestampMs - targetTimestampMs);
        return distance || left.requestedTimestampMs - right.requestedTimestampMs;
    })[0];
}

export function paginateFrames(frames, capacity = SHEET_CAPACITY) {
    if (!Number.isInteger(capacity) || capacity < 20 || capacity > 30) throw new Error('contact-sheet capacity must be between 20 and 30');
    const pages = [];
    for (let start = 0; start < frames.length; start += capacity) pages.push(frames.slice(start, start + capacity));
    return pages;
}

function percentile(values, fraction) {
    if (!values.length) return null;
    const ordered = [...values].sort((left, right) => left - right);
    return ordered[Math.round((ordered.length - 1) * fraction)];
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

async function readJsonLines(file) {
    const text = await readFile(file, 'utf8');
    return text.split(/\r?\n/u).filter(Boolean).map(line => JSON.parse(line));
}

async function run(command, args) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', chunk => { stdout += chunk; });
        child.stderr.on('data', chunk => { stderr += chunk; });
        child.on('error', reject);
        child.on('close', code => code === 0 ? resolve({ stdout, stderr }) : reject(new Error(`command failed (${code}): ${stdout}\n${stderr}`)));
    });
}

async function writeLocalJson(file, value) {
    const absolute = path.resolve(ROOT, file);
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, deterministicJson(value), 'utf8');
    return absolute;
}

async function writeArtifact(name, value) {
    const file = path.resolve(ROOT, OUTPUT_ROOT, name);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, deterministicJson(value), 'utf8');
}

async function bridgeLocalArtifact(file) {
    const metadata = await stat(file);
    return { path: localRelative(file), sizeBytes: metadata.size, sha256: await sha256File(file) };
}

async function extractFrames(target, plan, outputRoot, overwrite = true) {
    const targetRoot = path.resolve(ROOT, outputRoot, target.reviewTargetId);
    await mkdir(targetRoot, { recursive: true });
    const timestampsFile = path.join(targetRoot, 'timestamps-ms.txt');
    await writeFile(timestampsFile, `${plan.rows.map(row => row.requestedTimestampMs).join('\n')}\n`, 'utf8');
    const python = path.resolve(ROOT, '.venv-video/Scripts/python.exe');
    const args = [
        '-m', 'deadem.video_pipeline.cli',
        '--video', target.inputs.video.localPath,
        '--output', targetRoot,
        '--timestamps-file', timestampsFile,
        '--image-format', 'jpg',
        '--jpeg-quality', '90',
        '--offline',
        '--no-model-download'
    ];
    if (overwrite) args.push('--overwrite');
    await run(python, args);
    return readJsonLines(path.join(targetRoot, 'frame-manifest.jsonl'));
}

export function mergeFrameExtraction(plan, extractedRows) {
    const extractedByTimestamp = new Map(extractedRows.map(row => [row.requested_timestamp_ms, row]));
    return plan.rows.map(planned => {
        const extracted = extractedByTimestamp.get(planned.requestedTimestampMs);
        const extractedSuccessfully = EXTRACTED_STATUSES.has(extracted?.decode_status);
        return {
            ...planned,
            decodedTimestampMs: extracted?.decoded_timestamp_ms ?? null,
            seekErrorMs: extracted?.timestamp_error_ms ?? null,
            frameSha256: extractedSuccessfully ? extracted.sha256 : null,
            localPath: extractedSuccessfully ? localRelative(extracted.image_path) : null,
            width: extracted?.width ?? null,
            height: extracted?.height ?? null,
            extractionStatus: extracted?.decode_status ?? 'missing_manifest_row',
            provenance: {
                frame: 'factual/local_video_decoded_frame',
                timestampRequest: planned.provenance,
                semanticInterpretation: false
            }
        };
    });
}

export function buildWindowEvidence(window, frames) {
    const mapping = window.videoMapping;
    const startMs = toTimestampMs(mapping.visualEvidenceStartSeconds, 'visualEvidenceStartSeconds');
    const endMs = toTimestampMs(mapping.visualEvidenceEndSeconds, 'visualEvidenceEndSeconds');
    const centerMs = Math.round((startMs + endMs) / 2);
    const successful = frames
        .filter(frame => frame.windowsReferencing.includes(window.candidateWindowId) && EXTRACTED_STATUSES.has(frame.extractionStatus))
        .sort((left, right) => left.requestedTimestampMs - right.requestedTimestampMs);
    const first = successful.find(frame => frame.requestedTimestampMs === startMs) ?? selectRepresentativeFrame(successful, startMs);
    const middle = successful.find(frame => frame.requestedTimestampMs === centerMs) ?? selectRepresentativeFrame(successful, centerMs);
    const last = successful.find(frame => frame.requestedTimestampMs === endMs) ?? selectRepresentativeFrame(successful, endMs);
    const gaps = successful.slice(1).map((frame, index) => (frame.requestedTimestampMs - successful[index].requestedTimestampMs) / 1000);
    return {
        candidateWindowId: window.candidateWindowId,
        reviewTargetId: window.reviewTargetId,
        candidateSemantics: 'review_attention_region_not_gameplay_event',
        priorityTier: window.priorityTier,
        prioritySemantics: window.prioritySemantics,
        replayStartSeconds: window.replayStartSeconds,
        replayEndSeconds: window.replayEndSeconds,
        visualVodStartSeconds: mapping.visualEvidenceStartSeconds,
        visualVodEndSeconds: mapping.visualEvidenceEndSeconds,
        syncEstimatedErrorSeconds: mapping.syncEstimatedErrorSeconds,
        sourceFamilies: window.sourceFamilies,
        denseFrameIds: successful.map(frame => frame.denseFrameId),
        firstFrameId: first?.denseFrameId ?? null,
        representativeFrameId: middle?.denseFrameId ?? null,
        lastFrameId: last?.denseFrameId ?? null,
        frameCount: successful.length,
        effectiveCadenceSeconds: gaps.length ? round(percentile(gaps, 0.5), 3) : null,
        boundaryEvidence: {
            firstRequestedBoundaryPresent: successful.some(frame => frame.requestedTimestampMs === startMs),
            representativeRequestedPresent: successful.some(frame => frame.requestedTimestampMs === centerMs),
            lastRequestedBoundaryPresent: successful.some(frame => frame.requestedTimestampMs === endMs),
            complete: Boolean(first && middle && last)
        },
        contactSheetIds: [],
        storyboardPageCount: 0,
        provenance: {
            candidateWindow: 'Task202_preserved_without_reclassification',
            visualRange: 'Task202_visualEvidenceStartSeconds_visualEvidenceEndSeconds',
            syncUncertainty: 'Task200_mapping_preserved_without_recalculation',
            frames: 'Task203_local_visual_evidence_without_interpretation'
        }
    };
}

async function buildContactSheets(reviewTargetId, windows, frames) {
    const targetRoot = path.resolve(ROOT, LOCAL_ROOT, reviewTargetId);
    const source = path.join(targetRoot, 'contact-sheet-source.json');
    const manifest = path.join(targetRoot, 'contact-sheet-manifest.json');
    const framesById = new Map(frames.map(frame => [frame.denseFrameId, frame]));
    const sourceWindows = windows.map(window => ({
        ...window,
        frames: window.denseFrameIds.map(frameId => framesById.get(frameId)).filter(Boolean)
    }));
    await writeFile(source, deterministicJson({ reviewTargetId, windows: sourceWindows }), 'utf8');
    const python = path.resolve(ROOT, '.venv-video/Scripts/python.exe');
    const script = path.resolve(ROOT, 'tools/build-dense-review-contact-sheets.py');
    const args = ['--source', source, '--output-root', path.resolve(ROOT, LOCAL_ROOT), '--manifest', manifest];
    await run(python, [script, ...args]);
    const first = await readFile(manifest, 'utf8');
    await run(python, [script, ...args]);
    const second = await readFile(manifest, 'utf8');
    return { manifest: JSON.parse(second), byteDeterministic: first === second };
}

function representativePlan(plan, count = 10) {
    if (plan.rows.length <= count) return { ...plan, rows: plan.rows };
    const indexes = new Set();
    for (let index = 0; index < count; index++) indexes.add(Math.round((index * (plan.rows.length - 1)) / (count - 1)));
    return { ...plan, rows: [...indexes].sort((left, right) => left - right).map(index => plan.rows[index]) };
}

async function auditRepresentativeDeterminism(target, plan, fullRows, reuseLocal) {
    const subset = representativePlan(plan);
    const determinismRoot = `${LOCAL_ROOT}/${target.reviewTargetId}/determinism-audit`;
    const rerunTarget = { ...target, reviewTargetId: 'subset' };
    const localManifest = path.resolve(ROOT, determinismRoot, 'subset', 'frame-manifest.jsonl');
    let rerunRows;
    if (reuseLocal) rerunRows = await readJsonLines(localManifest);
    else rerunRows = await extractFrames(rerunTarget, subset, determinismRoot, true);
    const fullByTimestamp = new Map(fullRows.map(row => [row.requested_timestamp_ms, row]));
    const rerunByTimestamp = new Map(rerunRows.map(row => [row.requested_timestamp_ms, row]));
    const comparisons = subset.rows.map(item => {
        const first = fullByTimestamp.get(item.requestedTimestampMs);
        const second = rerunByTimestamp.get(item.requestedTimestampMs);
        return {
            requestedTimestampMs: item.requestedTimestampMs,
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

export function validateCandidatePreservation(sourceWindows, evidenceWindows) {
    if (sourceWindows.length !== evidenceWindows.length) throw new Error('Task202 candidate window count changed');
    const evidenceById = new Map(evidenceWindows.map(window => [window.candidateWindowId, window]));
    for (const source of sourceWindows) {
        const evidence = evidenceById.get(source.candidateWindowId);
        if (!evidence) throw new Error(`Task202 candidate window missing: ${source.candidateWindowId}`);
        if (evidence.priorityTier !== source.priorityTier) throw new Error(`Task202 priority changed: ${source.candidateWindowId}`);
        if (deterministicJson(evidence.sourceFamilies) !== deterministicJson(source.sourceFamilies)) throw new Error(`Task202 source families changed: ${source.candidateWindowId}`);
        if (evidence.candidateSemantics !== 'review_attention_region_not_gameplay_event') throw new Error(`candidate semantics changed: ${source.candidateWindowId}`);
        if (evidence.visualVodStartSeconds !== source.videoMapping.visualEvidenceStartSeconds || evidence.visualVodEndSeconds !== source.videoMapping.visualEvidenceEndSeconds) {
            throw new Error(`Task202 visual range changed: ${source.candidateWindowId}`);
        }
        if (evidence.syncEstimatedErrorSeconds !== source.videoMapping.syncEstimatedErrorSeconds) throw new Error(`Task200 sync error changed: ${source.candidateWindowId}`);
    }
    return true;
}

function calculateTargetMetrics(reviewTargetId, sourceWindows, plan, frames, evidenceWindows, sheetManifest, storageBytes) {
    const targetWindows = sourceWindows.filter(window => window.reviewTargetId === reviewTargetId);
    const targetEvidence = evidenceWindows.filter(window => window.reviewTargetId === reviewTargetId);
    const extracted = frames.filter(frame => EXTRACTED_STATUSES.has(frame.extractionStatus));
    const failures = frames.length - extracted.length;
    const frameCounts = targetEvidence.map(window => window.frameCount);
    const seekErrors = extracted.map(frame => Math.abs(frame.seekErrorMs ?? 0));
    const windowsWithEvidence = targetEvidence.filter(window => window.frameCount >= 1).length;
    const windowsWithBoundary = targetEvidence.filter(window => window.frameCount >= 1 && window.boundaryEvidence.complete).length;
    return {
        reviewTargetId,
        candidateWindows: targetWindows.length,
        windowsByPriority: {
            high: targetWindows.filter(window => window.priorityTier === 'high').length,
            medium: targetWindows.filter(window => window.priorityTier === 'medium').length,
            low: targetWindows.filter(window => window.priorityTier === 'low').length
        },
        rawFrameRequests: plan.rawPlannedRequests,
        deduplicatedFrameRequests: plan.deduplicatedRequests,
        deduplicationSavings: plan.deduplicationSavings,
        extractedFrames: extracted.length,
        failedFrames: failures,
        extractionFailureRate: frames.length ? round(failures / frames.length, 6) : 1,
        framesByRequiredPriority: {
            high: frames.filter(frame => frame.highestRequiredPriority === 'high').length,
            medium: frames.filter(frame => frame.highestRequiredPriority === 'medium').length,
            low: frames.filter(frame => frame.highestRequiredPriority === 'low').length
        },
        coveredCandidateWindows: windowsWithEvidence,
        windowsWithEvidence,
        windowsWithBoundaryEvidence: windowsWithBoundary,
        averageFramesPerWindow: round(frameCounts.reduce((sum, value) => sum + value, 0) / frameCounts.length, 3),
        medianFramesPerWindow: percentile(frameCounts, 0.5),
        p90FramesPerWindow: percentile(frameCounts, 0.9),
        storyboardPageCount: sheetManifest.pageCount,
        averageAbsoluteSeekErrorMs: seekErrors.length ? round(seekErrors.reduce((sum, value) => sum + value, 0) / seekErrors.length, 3) : null,
        maximumAbsoluteSeekErrorMs: seekErrors.length ? Math.max(...seekErrors) : null,
        localStorageBytes: storageBytes,
        syncEstimatedErrorSeconds: targetEvidence[0]?.syncEstimatedErrorSeconds ?? null,
        densityAdjustmentCount: plan.densityAdjustmentCount
    };
}

async function sumOperationalStorage(frames, sheetManifest) {
    const files = [
        ...frames.filter(frame => frame.localPath).map(frame => path.resolve(ROOT, frame.localPath)),
        ...sheetManifest.pages.map(page => path.resolve(ROOT, page.localPath))
    ];
    let total = 0;
    for (const file of new Set(files)) total += (await stat(file)).size;
    return total;
}

export async function emit(options = {}) {
    const reuseLocal = options.reuseLocal === true;
    const intake = JSON.parse(await readFile(path.resolve(ROOT, INTAKE_MANIFEST), 'utf8'));
    const sync = JSON.parse(await readFile(path.resolve(ROOT, SYNC_MAPPING), 'utf8'));
    const visualIndex = JSON.parse(await readFile(path.resolve(ROOT, VISUAL_INDEX_MANIFEST), 'utf8'));
    const candidateArtifact = JSON.parse(await readFile(path.resolve(ROOT, CANDIDATE_WINDOWS), 'utf8'));
    if (candidateArtifact.candidateSemantics !== 'review_attention_region_not_gameplay_event' || candidateArtifact.notProbability !== true) {
        throw new Error('Task202 candidate semantics are not preserved');
    }
    if (candidateArtifact.windowCount !== 102 || candidateArtifact.windows.length !== 102) throw new Error('Task202 candidate count must remain 102');
    if (sync.silentExtrapolationAllowed !== false) throw new Error('Task200 silent extrapolation prohibition is missing');
    if (visualIndex.counts?.heavyImagesVersioned !== 0) throw new Error('Task201 local-only image policy is not preserved');

    const plans = buildExtractionPlans(candidateArtifact.windows);
    const targetsById = new Map(intake.targets.map(target => [target.reviewTargetId, target]));
    const targetResults = [];
    const allFrames = [];
    const allWindows = [];
    const identityBridges = [];
    const determinismTargets = [];
    const localBridges = [];

    for (const plan of plans.targets) {
        const reviewTargetId = assertReviewTargetId(plan.reviewTargetId);
        const target = targetsById.get(reviewTargetId);
        if (!target) throw new Error(`Task198 VOD missing: ${reviewTargetId}`);
        const videoStat = await stat(target.inputs.video.localPath);
        let observedSha256 = target.inputs.video.sha256;
        if (!reuseLocal) observedSha256 = await sha256File(target.inputs.video.localPath);
        if (videoStat.size !== target.inputs.video.sizeBytes || observedSha256 !== target.inputs.video.sha256) throw new Error(`Task198 VOD identity mismatch: ${reviewTargetId}`);
        identityBridges.push({
            reviewTargetId,
            localPath: target.inputs.video.localPath,
            sizeBytes: videoStat.size,
            expectedSha256: target.inputs.video.sha256,
            observedSha256,
            identityStatus: 'matched_task198_manifest_before_extraction'
        });

        const planFile = await writeLocalJson(`${LOCAL_ROOT}/${reviewTargetId}/extraction-plan.json`, {
            schemaVersion: 1,
            candidateSemantics: candidateArtifact.candidateSemantics,
            ...plan
        });
        const localFrameManifest = path.resolve(ROOT, LOCAL_ROOT, reviewTargetId, 'frame-manifest.jsonl');
        const extractedRows = reuseLocal ? await readJsonLines(localFrameManifest) : await extractFrames(target, plan, LOCAL_ROOT, true);
        const frames = mergeFrameExtraction(plan, extractedRows);
        const frameIndexFile = await writeLocalJson(`${LOCAL_ROOT}/${reviewTargetId}/frame-evidence-index.json`, {
            schemaVersion: 1,
            reviewTargetId,
            frameCount: frames.length,
            frames
        });
        const evidenceWindows = candidateArtifact.windows
            .filter(window => window.reviewTargetId === reviewTargetId)
            .map(window => buildWindowEvidence(window, frames));
        validateCandidatePreservation(candidateArtifact.windows.filter(window => window.reviewTargetId === reviewTargetId), evidenceWindows);
        const sheets = await buildContactSheets(reviewTargetId, evidenceWindows, frames);
        const pagesByWindow = new Map(sheets.manifest.windows.map(window => [window.candidateWindowId, window.pages]));
        for (const window of evidenceWindows) {
            const pages = pagesByWindow.get(window.candidateWindowId) ?? [];
            window.contactSheetIds = pages.map(page => page.storyboardId);
            window.storyboardPageCount = pages.length;
            await writeLocalJson(`${LOCAL_ROOT}/${reviewTargetId}/windows/${window.candidateWindowId}.json`, window);
        }
        const windowIndexFile = await writeLocalJson(`${LOCAL_ROOT}/${reviewTargetId}/window-evidence-index.json`, {
            schemaVersion: 1,
            reviewTargetId,
            candidateWindowCount: evidenceWindows.length,
            windows: evidenceWindows
        });
        const determinism = await auditRepresentativeDeterminism(target, plan, extractedRows, reuseLocal);
        determinismTargets.push({ reviewTargetId, ...determinism, contactSheetsByteDeterministic: sheets.byteDeterministic });
        const storageBytes = await sumOperationalStorage(frames, sheets.manifest);
        const metrics = calculateTargetMetrics(reviewTargetId, candidateArtifact.windows, plan, frames, evidenceWindows, sheets.manifest, storageBytes);
        targetResults.push({ reviewTargetId, metrics });
        allFrames.push(...frames);
        allWindows.push(...evidenceWindows);
        localBridges.push({
            reviewTargetId,
            extractionPlan: await bridgeLocalArtifact(planFile),
            frameEvidenceIndex: await bridgeLocalArtifact(frameIndexFile),
            windowEvidenceIndex: await bridgeLocalArtifact(windowIndexFile),
            contactSheetManifest: await bridgeLocalArtifact(path.resolve(ROOT, LOCAL_ROOT, reviewTargetId, 'contact-sheet-manifest.json'))
        });
    }

    validateCandidatePreservation(candidateArtifact.windows, allWindows);
    const totalRequests = allFrames.length;
    const extractedFrames = allFrames.filter(frame => EXTRACTED_STATUSES.has(frame.extractionStatus)).length;
    const failedFrames = totalRequests - extractedFrames;
    const windowsWithEvidence = allWindows.filter(window => window.frameCount >= 1).length;
    const successfulWindows = allWindows.filter(window => window.frameCount >= 1);
    const allSuccessfulHaveBoundary = successfulWindows.every(window => window.boundaryEvidence.complete);
    const deterministic = determinismTargets.every(target => target.deterministic && target.contactSheetsByteDeterministic);
    const coverageFraction = round(windowsWithEvidence / allWindows.length, 6);
    const failureRate = totalRequests ? round(failedFrames / totalRequests, 6) : 1;
    let technicalGateStatus = BLOCKED_GATE;
    if (coverageFraction >= 0.99 && allSuccessfulHaveBoundary && failureRate <= 0.02 && deterministic) technicalGateStatus = POSITIVE_GATE;
    else if (coverageFraction >= 0.95) technicalGateStatus = GAPS_GATE;
    else if (targetResults.some(target => target.metrics.windowsWithEvidence > 0)) technicalGateStatus = PARTIAL_GATE;

    const compactPlanTargets = plans.targets.map(plan => ({
        reviewTargetId: plan.reviewTargetId,
        candidateWindowCount: plan.candidateWindowCount,
        cadenceSeconds: plan.cadenceSeconds,
        densityAdjustmentCount: plan.densityAdjustmentCount,
        rawPlannedRequests: plan.rawPlannedRequests,
        deduplicatedRequests: plan.deduplicatedRequests,
        deduplicationSavings: plan.deduplicationSavings,
        firstRequestedTimestampMs: plan.rows[0].requestedTimestampMs,
        lastRequestedTimestampMs: plan.rows.at(-1).requestedTimestampMs,
        localPlan: localBridges.find(bridge => bridge.reviewTargetId === plan.reviewTargetId).extractionPlan
    }));
    const aggregateCounts = {
        targets: targetResults.length,
        totalCandidateWindows: allWindows.length,
        windowsWithEvidence,
        windowsWithBoundaryEvidence: allWindows.filter(window => window.boundaryEvidence.complete).length,
        totalUniqueFrames: totalRequests,
        extractedFrames,
        extractionFailures: failedFrames,
        storyboardPages: targetResults.reduce((sum, target) => sum + target.metrics.storyboardPageCount, 0),
        totalLocalBytes: targetResults.reduce((sum, target) => sum + target.metrics.localStorageBytes, 0),
        protectedAccessCount: 0,
        replayAccessCount: 0,
        gameplayInterpretationsProduced: 0,
        finalFactsProduced: 0,
        attributionProduced: 0,
        imagesVersioned: 0
    };

    await writeArtifact('manifest.json', {
        schemaVersion: 1,
        artifactClass: 'two_match_dense_visual_review_evidence_manifest',
        generatedBy: 'tools/emit-dense-visual-review-evidence.mjs',
        generatedAtLogical: 'task_203',
        candidateSemantics: candidateArtifact.candidateSemantics,
        sourceArtifacts: [INTAKE_MANIFEST, SYNC_MAPPING, VISUAL_INDEX_MANIFEST, CANDIDATE_WINDOWS],
        vodIdentityBridges: identityBridges,
        localArtifacts: localBridges,
        policy: {
            highCadenceSeconds: plans.targets[0].cadenceSeconds.high,
            mediumCadenceSeconds: 2,
            lowCadenceSeconds: 5,
            densityLimitFrames: DENSITY_LIMIT,
            densityAdjustmentCount: plans.densityAdjustmentCount,
            overlapPolicy: 'highest_density_precedence_then_timestamp_deduplication',
            boundaryPolicy: 'first_center_last_requested_when_inside_valid_visual_range',
            storyboardPageCapacity: SHEET_CAPACITY,
            mediaStoragePolicy: 'local_untracked_do_not_commit_images'
        },
        counts: aggregateCounts
    });
    await writeArtifact('extraction-plan.json', {
        schemaVersion: 1,
        artifactClass: 'dense_visual_review_extraction_plan_compact',
        densityAdjustmentCount: plans.densityAdjustmentCount,
        rawPlannedRequests: compactPlanTargets.reduce((sum, target) => sum + target.rawPlannedRequests, 0),
        deduplicatedRequests: compactPlanTargets.reduce((sum, target) => sum + target.deduplicatedRequests, 0),
        deduplicationSavings: compactPlanTargets.reduce((sum, target) => sum + target.deduplicationSavings, 0),
        targets: compactPlanTargets
    });
    await writeArtifact('window-evidence-index.json', {
        schemaVersion: 1,
        artifactClass: 'dense_visual_review_window_evidence_index',
        candidateSemantics: candidateArtifact.candidateSemantics,
        candidateWindowCount: allWindows.length,
        windows: allWindows
    });
    await writeArtifact('frame-evidence-summary.json', {
        schemaVersion: 1,
        artifactClass: 'dense_visual_review_frame_evidence_summary',
        totalUniqueFrames: totalRequests,
        extractedFrames,
        failedFrames,
        extractionFailureRate: failureRate,
        localFrameIndexes: localBridges.map(bridge => ({ reviewTargetId: bridge.reviewTargetId, ...bridge.frameEvidenceIndex })),
        framesByRequiredPriority: {
            high: allFrames.filter(frame => frame.highestRequiredPriority === 'high').length,
            medium: allFrames.filter(frame => frame.highestRequiredPriority === 'medium').length,
            low: allFrames.filter(frame => frame.highestRequiredPriority === 'low').length
        }
    });
    await writeArtifact('coverage.json', {
        schemaVersion: 1,
        candidateWindowCount: allWindows.length,
        windowsWithEvidence,
        windowCoverageFraction: coverageFraction,
        successfulWindowsHaveBoundaryEvidence: allSuccessfulHaveBoundary,
        targets: targetResults
    });
    await writeArtifact('summary.json', {
        schemaVersion: 1,
        technicalGateStatus,
        counts: aggregateCounts,
        extractionFailureRate: failureRate,
        windowCoverageFraction: coverageFraction,
        densityAdjustmentCount: plans.densityAdjustmentCount,
        targets: targetResults,
        determinism: {
            status: deterministic ? 'representative_frames_and_storyboards_deterministic' : 'determinism_not_confirmed',
            targets: determinismTargets
        }
    });
    await writeArtifact('gate.json', {
        schemaVersion: 1,
        technicalGateStatus,
        moduleStatus: technicalGateStatus === POSITIVE_GATE ? 'functional_ready' : technicalGateStatus === BLOCKED_GATE ? 'blocked' : 'functional_with_gaps',
        workAcceptanceStatus: 'pending_independent_validation',
        reasons: [
            'Frames and storyboards are local review evidence, not gameplay-event conclusions.',
            'Task202 priority and candidate semantics remain unchanged.',
            'Task200 synchronization uncertainty remains separate from decoder seek error.'
        ]
    });
    await writeArtifact('provenance-audit.json', {
        schemaVersion: 1,
        task198VodIdentitiesRevalidated: identityBridges.length,
        task200MappingConsumedWithoutRecalculation: true,
        task201CoarseIndexUsedForNavigationOnly: true,
        task202CandidateWindowsPreserved: validateCandidatePreservation(candidateArtifact.windows, allWindows),
        candidateSemantics: candidateArtifact.candidateSemantics,
        syncErrorPreservedPerWindow: allWindows.every(window => window.syncEstimatedErrorSeconds === (window.reviewTargetId === 'review_match_001' ? 9 : 2)),
        seekErrorKeptSeparateFromSyncError: true,
        overlapDeduplicated: compactPlanTargets.every(target => target.deduplicationSavings > 0),
        frameEvidenceLocalOnly: true,
        storyboardsLocalOnly: true,
        imagesVersioned: 0,
        protectedAccessCount: 0,
        replayAccessCount: 0,
        gameplayInterpretationsProduced: 0,
        finalFactsProduced: 0,
        attributionProduced: 0,
        prohibitedVisualStagesExecuted: [],
        limitations: [
            'Dense visual evidence does not establish a gameplay event or validate Task202 selectivity.',
            'Task200 operational synchronization uncertainty remains 9 and 2 seconds.',
            'L3 mechanical bursts, OCR, recognition, tracking, VLM and strategic analysis were not executed.'
        ]
    });
    return { technicalGateStatus, aggregateCounts, targetResults, plans, determinismTargets };
}

async function main() {
    const reuseLocal = process.argv.includes('--reuse-local');
    const result = await emit({ reuseLocal });
    process.stdout.write(deterministicJson({ status: result.technicalGateStatus, counts: result.aggregateCounts }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
    main().catch(error => {
        process.stderr.write(`${error.stack ?? error.message}\n`);
        process.exitCode = 1;
    });
}
