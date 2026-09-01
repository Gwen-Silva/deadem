import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const TARGET_IDS = Object.freeze(['review_match_001', 'review_match_002']);
export const REVIEW_STATES = Object.freeze(['unreviewed', 'in_review', 'reviewed', 'skipped']);
export const TRANSCRIPT_CLASSIFICATIONS = Object.freeze([
    'correct',
    'usable_with_minor_error',
    'materially_wrong',
    'unintelligible',
    'not_validated'
]);
export const ERROR_VOCABULARY = Object.freeze([
    'mechanical_error',
    'information_error',
    'positioning_error',
    'timing_error',
    'priority_error',
    'map_read_error',
    'risk_evaluation_error',
    'execution_error',
    'planning_error',
    'team_coordination_failure',
    'composition_identity_failure',
    'correct_decision_bad_result',
    'bad_decision_favorable_result',
    'not_an_error',
    'uncertain'
]);

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_REPO_ROOT = path.resolve(MODULE_DIR, '../..');
const MEDIA_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.wav']);
const PROTECTED_PATTERN = /(?:^|[\\/_-])(?:replay[_-]?00[5-8]|partida[_-]?00[5-8])(?:[\\/_.-]|$)|\.dem$|\.mp4$/iu;

export function sha256(value) {
    return createHash('sha256').update(value).digest('hex');
}

export function stableJson(value) {
    if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
    if (value && typeof value === 'object') {
        return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
}

export function deepClone(value) {
    return structuredClone(value);
}

export function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
    return value;
}

export function assertSafeRequestPath(value) {
    if (typeof value !== 'string' || value.includes('\0')) throw new Error('invalid_request_path');
    let decoded;
    try {
        decoded = decodeURIComponent(value);
    } catch {
        throw new Error('invalid_request_path');
    }
    if (decoded.includes('..') || decoded.includes('\\') || PROTECTED_PATTERN.test(decoded)) {
        throw new Error('unsafe_request_path');
    }
    return decoded;
}

export function assertTargetId(targetId) {
    if (!TARGET_IDS.includes(targetId)) throw new Error('target_not_allowlisted');
    return targetId;
}

export function assertCandidateId(candidateId, targetId = null) {
    if (!/^review_match_00[12]_window_\d{4}$/u.test(candidateId ?? '')) throw new Error('invalid_candidate_id');
    const candidateTarget = candidateId.slice(0, 'review_match_001'.length);
    assertTargetId(candidateTarget);
    if (targetId && candidateTarget !== targetId) throw new Error('candidate_target_mismatch');
    return candidateId;
}

function readJson(repoRoot, relativePath, accessLog) {
    const absolutePath = path.resolve(repoRoot, relativePath);
    accessLog.push(relativePath.replaceAll('\\', '/'));
    return JSON.parse(readFileSync(absolutePath, 'utf8'));
}

function readJsonLines(repoRoot, relativePath, accessLog) {
    const absolutePath = path.resolve(repoRoot, relativePath);
    accessLog.push(relativePath.replaceAll('\\', '/'));
    return readFileSync(absolutePath, 'utf8').split(/\r?\n/u).filter(Boolean).map(line => JSON.parse(line));
}

export class MediaRegistry {
    constructor(repoRoot) {
        this.repoRoot = path.resolve(repoRoot);
        this.entries = new Map();
    }

    registerTrusted({ kind, targetId, refId, relativePath, sha256: expectedSha256 = null, sizeBytes = null }) {
        assertTargetId(targetId);
        const normalized = String(relativePath ?? '').replaceAll('\\', '/');
        if (!normalized || path.isAbsolute(normalized) || normalized.includes('..') || PROTECTED_PATTERN.test(normalized)) {
            throw new Error('unsafe_trusted_media_path');
        }
        const absolutePath = path.resolve(this.repoRoot, normalized);
        const relative = path.relative(this.repoRoot, absolutePath).replaceAll('\\', '/');
        const extension = path.extname(absolutePath).toLowerCase();
        if (relative.startsWith('../') || !MEDIA_EXTENSIONS.has(extension)) throw new Error('media_path_outside_allowlist');
        const mediaId = sha256(`${kind}:${targetId}:${refId}:${normalized}`).slice(0, 32);
        const available = existsSync(absolutePath);
        const entry = deepFreeze({
            mediaId,
            kind,
            reviewTargetId: targetId,
            refId,
            absolutePath,
            expectedSha256,
            sizeBytes,
            contentType: extension === '.wav' ? 'audio/wav' : extension === '.png' ? 'image/png' : 'image/jpeg',
            available
        });
        this.entries.set(mediaId, entry);
        return { mediaId, url: `/media/${mediaId}`, status: available ? 'available' : 'unavailable', sha256: expectedSha256, sizeBytes };
    }

    resolve(mediaId) {
        if (!/^[0-9a-f]{32}$/u.test(mediaId ?? '')) return null;
        return this.entries.get(mediaId) ?? null;
    }
}

function defaultReviewRecord() {
    return {
        facts: [],
        humanContext: [],
        knownInformation: [],
        unknownInformation: [],
        teamCall: null,
        playerIntent: null,
        compositionIdentityContext: [],
        observedAction: null,
        alternatives: [],
        immediateResult: null,
        longTermResult: null,
        decisionQuality: null,
        executionQuality: null,
        errorClasses: [],
        confidence: null,
        evidenceRefs: [],
        reviewNotes: [],
        reviewState: 'unreviewed',
        visualRelevance: null
    };
}

export function normalizeReviewRecord(input = {}) {
    const record = { ...defaultReviewRecord(), ...deepClone(input) };
    if (!REVIEW_STATES.includes(record.reviewState)) throw new Error('invalid_review_state');
    if (!Array.isArray(record.errorClasses) || record.errorClasses.some(value => !ERROR_VOCABULARY.includes(value))) {
        throw new Error('invalid_error_class');
    }
    return record;
}

function availabilityStatus(availableCount, requiredCount) {
    if (availableCount === 0) return 'unavailable';
    if (availableCount < requiredCount) return 'available_with_gaps';
    return 'available';
}

function resolveFrameMedia(window, frameMap, registry) {
    const refs = [
        ['first', window.videoEvidence.firstFrameId],
        ['representative', window.videoEvidence.representativeFrameId],
        ['last', window.videoEvidence.lastFrameId]
    ].map(([role, frameId]) => {
        const frame = frameMap.get(frameId);
        if (!frame) return { role, frameId, status: 'unavailable' };
        return {
            role,
            frameId,
            requestedVodSeconds: frame.requestedVodSeconds,
            decodedTimestampMs: frame.decodedTimestampMs,
            ...registry.registerTrusted({
                kind: 'frame',
                targetId: window.reviewTargetId,
                refId: frameId,
                relativePath: frame.localPath,
                sha256: frame.frameSha256
            })
        };
    });
    const storyboards = window.videoEvidence.storyboards.map(storyboard => ({
        storyboardId: storyboard.storyboardId,
        denseFrameIds: storyboard.denseFrameIds,
        ...registry.registerTrusted({
            kind: 'storyboard',
            targetId: window.reviewTargetId,
            refId: storyboard.storyboardId,
            relativePath: storyboard.localPath,
            sha256: storyboard.sha256,
            sizeBytes: storyboard.sizeBytes
        })
    }));
    const atlas = window.videoEvidence.screeningCard ? {
        atlasPageId: window.videoEvidence.screeningCard.atlasPageId,
        cardIndex: window.videoEvidence.screeningCard.cardIndex,
        ...registry.registerTrusted({
            kind: 'atlas',
            targetId: window.reviewTargetId,
            refId: window.videoEvidence.screeningCard.atlasPageId,
            relativePath: window.videoEvidence.screeningCard.atlasLocalPath,
            sha256: window.videoEvidence.screeningCard.atlasSha256
        })
    } : null;
    const items = [...refs, ...storyboards, ...(atlas ? [atlas] : [])];
    return {
        status: availabilityStatus(items.filter(item => item.status === 'available').length, items.length),
        syncEstimatedErrorSeconds: window.videoEvidence.syncEstimatedErrorSeconds,
        visualVodRangeSeconds: window.videoEvidence.visualVodRangeSeconds,
        frames: refs,
        storyboards,
        screeningAtlas: atlas
    };
}

function resolveAudioCalls({ window, callWindow, callMap, audioMedia, audioMetadata }) {
    const callIds = callWindow?.audioCallEvidenceRefs ?? [];
    const calls = callIds.map(callId => callMap.get(callId)).filter(Boolean).map(call => {
        const audioStart = audioMetadata ? Math.max(0, call.videoStartSeconds - audioMetadata.videoStartSeconds - 1.5) : null;
        const audioEnd = audioMetadata ? Math.min(
            audioMetadata.extractedDurationSeconds,
            call.videoEndSeconds - audioMetadata.videoStartSeconds + 1.5
        ) : null;
        return {
            callSegmentId: call.callSegmentId,
            vodStartSeconds: call.videoStartSeconds,
            vodEndSeconds: call.videoEndSeconds,
            replayApproxStartSeconds: call.replayApproxStartSeconds,
            replayApproxEndSeconds: call.replayApproxEndSeconds,
            syncEstimatedErrorSeconds: call.syncEstimatedErrorSeconds,
            asrDraft: call.text,
            semanticStatus: 'asr_draft_requires_human_validation',
            speakerStatus: 'unknown/mixed',
            provenance: call.provenance,
            playback: audioMedia?.status === 'available' ? {
                mediaId: audioMedia.mediaId,
                url: audioMedia.url,
                startSeconds: Number(audioStart.toFixed(3)),
                endSeconds: Number(audioEnd.toFixed(3))
            } : null
        };
    });
    const status = calls.length === 0 ? 'unavailable' : audioMedia?.status === 'available' && calls.length === callIds.length
        ? 'available'
        : 'available_with_gaps';
    return {
        status,
        label: 'ASR DRAFT — HUMAN VALIDATION REQUIRED',
        speakerStatus: 'unknown/mixed',
        callSegmentCount: calls.length,
        calls
    };
}

export function validateReviewState(targetId, input, workspaceData) {
    assertTargetId(targetId);
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('invalid_review_state_payload');
    if (input.reviewTargetId !== targetId) throw new Error('review_state_target_mismatch');
    const candidates = {};
    const overlaps = [];
    for (const [candidateId, candidateState] of Object.entries(input.candidates ?? {})) {
        assertCandidateId(candidateId, targetId);
        const candidate = workspaceData.candidateById.get(candidateId);
        if (!candidate) throw new Error('candidate_not_found');
        const reviewRecord = normalizeReviewRecord(candidateState.reviewRecord);
        const transcriptCorrections = {};
        for (const [callId, correction] of Object.entries(candidateState.transcriptCorrections ?? {})) {
            if (!candidate.audioCallEvidence.calls.some(call => call.callSegmentId === callId)) throw new Error('call_not_in_candidate');
            if (!TRANSCRIPT_CLASSIFICATIONS.includes(correction.classification ?? 'not_validated')) {
                throw new Error('invalid_transcript_classification');
            }
            transcriptCorrections[callId] = {
                humanTranscript: correction.humanTranscript ?? null,
                classification: correction.classification ?? 'not_validated',
                provenance: 'human_supplied/transcript_correction'
            };
        }
        const reviewSegments = (candidateState.reviewSegments ?? []).map((segment, index) => {
            if (segment.reviewTargetId !== targetId || segment.candidateWindowId !== candidateId) throw new Error('segment_identity_mismatch');
            if (!/^review_match_00[12]_window_\d{4}_segment_\d{2,}$/u.test(segment.reviewSegmentId ?? '')) {
                throw new Error('invalid_review_segment_id');
            }
            const range = candidate.videoEvidence.visualVodRangeSeconds;
            if (!(Number.isFinite(segment.vodStartSeconds) && Number.isFinite(segment.vodEndSeconds)
                && segment.vodStartSeconds < segment.vodEndSeconds
                && segment.vodStartSeconds >= range.start && segment.vodEndSeconds <= range.end)) {
                throw new Error('review_segment_outside_candidate');
            }
            return {
                reviewSegmentId: segment.reviewSegmentId,
                candidateWindowId: candidateId,
                reviewTargetId: targetId,
                vodStartSeconds: segment.vodStartSeconds,
                vodEndSeconds: segment.vodEndSeconds,
                replayApproxStartSeconds: segment.replayApproxStartSeconds ?? null,
                replayApproxEndSeconds: segment.replayApproxEndSeconds ?? null,
                humanLabel: segment.humanLabel ?? null,
                humanNotes: segment.humanNotes ?? null,
                evidenceRefs: Array.isArray(segment.evidenceRefs) ? [...segment.evidenceRefs] : [],
                reviewRecord: normalizeReviewRecord(segment.reviewRecord),
                provenance: 'human_supplied/review_segmentation',
                ordinal: index + 1
            };
        }).sort((left, right) => left.vodStartSeconds - right.vodStartSeconds || left.reviewSegmentId.localeCompare(right.reviewSegmentId));
        for (let index = 1; index < reviewSegments.length; index += 1) {
            const previous = reviewSegments[index - 1];
            const current = reviewSegments[index];
            if (current.vodStartSeconds < previous.vodEndSeconds) {
                overlaps.push({ candidateWindowId: candidateId, left: previous.reviewSegmentId, right: current.reviewSegmentId });
            }
        }
        candidates[candidateId] = { reviewRecord, transcriptCorrections, reviewSegments };
    }
    return {
        schemaVersion: 1,
        reviewTargetId: targetId,
        candidates,
        overlaps,
        updatedAt: input.updatedAt ?? new Date().toISOString()
    };
}

export async function loadWorkspaceData({ repoRoot = DEFAULT_REPO_ROOT } = {}) {
    const root = path.resolve(repoRoot);
    const accessLog = [];
    const windowsArtifact = readJson(root, 'output/local-replay-processing/assisted-review-bundles/task204-bounded2/window-review-index.json', accessLog);
    const queueArtifact = readJson(root, 'output/local-replay-processing/assisted-review-bundles/task204-bounded2/review-queue.json', accessLog);
    const protocol = readJson(root, 'output/local-replay-processing/assisted-review-bundles/task204-bounded2/review-protocol-template.json', accessLog);
    if (windowsArtifact.candidateCount !== 102 || windowsArtifact.windows.length !== 102) throw new Error('task204_core_candidates_unavailable');
    const sourceFingerprint = sha256(stableJson(windowsArtifact));
    const registry = new MediaRegistry(root);
    const candidateById = new Map();
    const candidatesByTarget = new Map();
    const targetSummaries = [];

    for (const targetId of TARGET_IDS) {
        const frameIndexPath = `.local/deadem/dense-review/${targetId}/frame-evidence-index.json`;
        const callIndexPath = `.local/deadem/call-evidence/${targetId}/candidate-call-index.json`;
        const callSegmentsPath = `.local/deadem/call-evidence/${targetId}/call-segments.jsonl`;
        const audioMetadataPath = `.local/deadem/call-evidence/${targetId}/audio/extraction-metadata.json`;
        const audioPath = `.local/deadem/call-evidence/${targetId}/audio/mixed-16k-mono.wav`;
        const frameArtifact = existsSync(path.resolve(root, frameIndexPath)) ? readJson(root, frameIndexPath, accessLog) : { frames: [] };
        const callArtifact = existsSync(path.resolve(root, callIndexPath)) ? readJson(root, callIndexPath, accessLog) : { windows: [] };
        const calls = existsSync(path.resolve(root, callSegmentsPath)) ? readJsonLines(root, callSegmentsPath, accessLog) : [];
        const audioMetadata = existsSync(path.resolve(root, audioMetadataPath)) ? readJson(root, audioMetadataPath, accessLog) : null;
        const audioMedia = audioMetadata ? registry.registerTrusted({
            kind: 'audio',
            targetId,
            refId: `${targetId}_mixed_audio`,
            relativePath: audioPath,
            sha256: audioMetadata.outputSha256,
            sizeBytes: audioMetadata.outputSizeBytes
        }) : null;
        const frameMap = new Map(frameArtifact.frames.map(frame => [frame.denseFrameId, frame]));
        const callMap = new Map(calls.map(call => [call.callSegmentId, call]));
        const callWindows = new Map(callArtifact.windows.map(window => [window.candidateWindowId, window]));
        const queue = queueArtifact.targets.find(target => target.reviewTargetId === targetId);
        const chronologicalRank = new Map(queue.chronologicalOrder.map((id, index) => [id, index + 1]));
        const priorityRank = new Map(queue.priorityOrder.map((id, index) => [id, index + 1]));
        const targetWindows = windowsArtifact.windows.filter(window => window.reviewTargetId === targetId);
        const candidates = targetWindows.map(window => {
            assertCandidateId(window.candidateWindowId, targetId);
            if (window.candidateSemantics !== 'review_attention_region_not_gameplay_event') throw new Error('candidate_semantics_changed');
            const videoEvidence = resolveFrameMedia(window, frameMap, registry);
            const audioCallEvidence = resolveAudioCalls({
                window,
                callWindow: callWindows.get(window.candidateWindowId),
                callMap,
                audioMedia,
                audioMetadata
            });
            const candidate = deepFreeze({
                candidateWindowId: window.candidateWindowId,
                reviewTargetId: targetId,
                candidateSemantics: 'review_attention_region_not_gameplay_event',
                priority: {
                    tier: window.derivedMetrics.priorityTier,
                    rank: priorityRank.get(window.candidateWindowId),
                    label: 'review scheduling heuristic',
                    semantics: 'review_priority_heuristic_not_probability'
                },
                chronologicalRank: chronologicalRank.get(window.candidateWindowId),
                syncEstimatedErrorSeconds: window.videoEvidence.syncEstimatedErrorSeconds,
                replayObservedFacts: deepClone(window.replayObservedFacts),
                derivedMetrics: deepClone(window.derivedMetrics),
                videoEvidence,
                audioCallEvidence,
                humanSuppliedContext: deepClone(window.humanSuppliedContext),
                analystInference: [],
                initialReviewRecord: normalizeReviewRecord(window.reviewRecord),
                immutableFingerprint: sha256(stableJson(window))
            });
            candidateById.set(candidate.candidateWindowId, candidate);
            return candidate;
        });
        candidatesByTarget.set(targetId, deepFreeze(candidates));
        targetSummaries.push(deepFreeze({
            reviewTargetId: targetId,
            candidateCount: candidates.length,
            visualAvailability: availabilityStatus(candidates.filter(candidate => candidate.videoEvidence.status === 'available').length, candidates.length),
            audioAvailability: availabilityStatus(candidates.filter(candidate => candidate.audioCallEvidence.status === 'available').length, candidates.length),
            callSegmentCount: calls.length,
            reviewStateAvailability: 'available'
        }));
    }
    if (candidateById.size !== 102) throw new Error('candidate_count_mismatch');
    if (accessLog.some(item => PROTECTED_PATTERN.test(item))) throw new Error('protected_access_detected');
    const data = {
        repoRoot: root,
        candidateSemantics: 'review_attention_region_not_gameplay_event',
        prioritySemantics: 'review scheduling heuristic',
        targets: deepFreeze(targetSummaries),
        candidateById,
        candidatesByTarget,
        mediaRegistry: registry,
        reviewProtocol: deepFreeze({
            template: normalizeReviewRecord(protocol.template),
            errorVocabulary: [...ERROR_VOCABULARY]
        }),
        sourceFingerprint,
        accessAudit: deepFreeze({
            paths: [...accessLog],
            replayAccessCount: 0,
            vodAccessCount: 0,
            protectedAccessCount: 0
        })
    };
    return data;
}

export function listCandidates(workspaceData, {
    reviewTargetId,
    order = 'chronological',
    status = null,
    search = '',
    reviewState = null
}) {
    assertTargetId(reviewTargetId);
    if (!['chronological', 'priority'].includes(order)) throw new Error('invalid_candidate_order');
    if (status && !REVIEW_STATES.includes(status)) throw new Error('invalid_review_state_filter');
    const stateCandidates = reviewState?.candidates ?? {};
    const normalizedSearch = search.trim().toLowerCase();
    return workspaceData.candidatesByTarget.get(reviewTargetId)
        .filter(candidate => !normalizedSearch || candidate.candidateWindowId.toLowerCase().includes(normalizedSearch))
        .filter(candidate => !status || (stateCandidates[candidate.candidateWindowId]?.reviewRecord?.reviewState ?? 'unreviewed') === status)
        .toSorted((left, right) => order === 'priority'
            ? left.priority.rank - right.priority.rank
            : left.chronologicalRank - right.chronologicalRank)
        .map(candidate => ({
            candidateWindowId: candidate.candidateWindowId,
            reviewTargetId: candidate.reviewTargetId,
            candidateSemantics: candidate.candidateSemantics,
            priority: candidate.priority,
            chronologicalRank: candidate.chronologicalRank,
            reviewState: stateCandidates[candidate.candidateWindowId]?.reviewRecord?.reviewState ?? 'unreviewed',
            visualAvailability: candidate.videoEvidence.status,
            audioAvailability: candidate.audioCallEvidence.status,
            callSegmentCount: candidate.audioCallEvidence.callSegmentCount
        }));
}
