import crypto from 'node:crypto';

const TARGET_IDS = new Set(['review_match_001', 'review_match_002']);

export function assertAudioReviewTarget(value) {
    const text = String(value);
    if (/(?:replay|partida|match)[_-]?00?[5-8]/iu.test(text)) {
        throw new Error(`protected replay alias rejected before filesystem access: ${text}`);
    }
    if (!TARGET_IDS.has(text)) throw new Error(`unsupported review target: ${text}`);
    return text;
}

export function deterministicJson(value) {
    const sort = item => {
        if (Array.isArray(item)) return item.map(sort);
        if (item && typeof item === 'object') {
            return Object.fromEntries(Object.keys(item).sort().map(key => [key, sort(item[key])]));
        }
        return item;
    };
    return `${JSON.stringify(sort(value), null, 2)}\n`;
}

const round = value => Number(Number(value).toFixed(3));

export class AudioCallSourceAdapter {
    constructor(mode) {
        if (new.target === AudioCallSourceAdapter) throw new Error('AudioCallSourceAdapter is abstract');
        this.mode = mode;
    }

    normalize() {
        throw new Error('normalize must be implemented');
    }
}

export class MixedVodAudioAdapter extends AudioCallSourceAdapter {
    constructor({ reviewTargetId, videoOffsetSeconds, syncModel }) {
        super('mixed_vod');
        this.reviewTargetId = assertAudioReviewTarget(reviewTargetId);
        this.videoOffsetSeconds = Number(videoOffsetSeconds);
        this.syncModel = structuredClone(syncModel);
    }

    normalize(rawSegments) {
        return rawSegments.map((raw, index) => {
            const videoStartSeconds = round(this.videoOffsetSeconds + raw.startSeconds);
            const videoEndSeconds = round(this.videoOffsetSeconds + raw.endSeconds);
            const replayStart = this.#toReplay(videoStartSeconds);
            const replayEnd = this.#toReplay(videoEndSeconds);
            return {
                callSegmentId: `${this.reviewTargetId}_call_${String(index + 1).padStart(6, '0')}`,
                reviewTargetId: this.reviewTargetId,
                speaker: { status: 'unknown/mixed', sourceSpeakerId: null, displayName: null },
                audioStartSeconds: videoStartSeconds,
                audioEndSeconds: videoEndSeconds,
                videoStartSeconds,
                videoEndSeconds,
                replayApproxStartSeconds: replayStart,
                replayApproxEndSeconds: replayEnd,
                syncEstimatedErrorSeconds: this.syncModel.estimatedErrorSeconds,
                asrTimestampUncertainty: {
                    class: 'model_segment_boundary_uncertainty',
                    numericBoundSeconds: null,
                    separateFromReplayVideoSync: true
                },
                text: String(raw.text ?? '').trim(),
                language: raw.language ?? 'pt',
                transcriptionMetadata: {
                    engine: raw.engine,
                    model: raw.model,
                    device: raw.device,
                    computeType: raw.computeType,
                    averageLogProbability: raw.averageLogProbability ?? null,
                    noSpeechProbability: raw.noSpeechProbability ?? null,
                    temperature: raw.temperature ?? null,
                    vadApplied: raw.vadApplied === true,
                    wordTimestampsAvailable: Array.isArray(raw.words) && raw.words.length > 0
                },
                words: (raw.words ?? []).map((word, wordIndex) => ({
                    wordTimestampId: `${this.reviewTargetId}_call_${String(index + 1).padStart(6, '0')}_word_${String(wordIndex + 1).padStart(4, '0')}`,
                    word: word.word,
                    probability: word.probability ?? null,
                    audioStartSeconds: round(this.videoOffsetSeconds + word.startSeconds),
                    audioEndSeconds: round(this.videoOffsetSeconds + word.endSeconds)
                })),
                provenance: 'audio_observed_speech/mixed_vod_asr',
                semanticLimitations: [
                    'ASR text is machine transcription of mixed audio, not a confirmed team call or player intent.',
                    'Speaker identity is unavailable because game sound and Discord speech remain mixed.',
                    'ASR timestamp uncertainty is separate from replay/VOD synchronization uncertainty.'
                ]
            };
        });
    }

    #toReplay(videoSeconds) {
        const segment = this.syncModel.segments.find(item => videoSeconds >= item.videoStartSeconds && videoSeconds <= item.videoEndSeconds);
        if (!segment) return null;
        return round((videoSeconds - segment.interceptSeconds) / segment.slope);
    }
}

export class CraigMultitrackAdapter extends AudioCallSourceAdapter {
    constructor({ recordingRoot, recordingId = null, tracks }) {
        super('craig_multitrack');
        this.recordingRoot = recordingRoot;
        this.recordingId = recordingId ?? 'craig_recording_local';
        this.tracks = structuredClone(tracks);
    }

    normalize() {
        const global = this.tracks.flatMap(track => track.segments.map((segment, index) => ({
            callSegmentId: `${this.recordingId}_${track.trackRef ?? `track_${String(track.trackOrdinal).padStart(2, '0')}`}_${String(index + 1).padStart(4, '0')}`,
            recordingId: this.recordingId,
            speaker: {
                status: 'track_attributed',
                sourceSpeakerId: track.sourceSpeakerId,
                displayName: track.displayName
            },
            recordingStartSeconds: round(segment.startSeconds),
            recordingEndSeconds: round(segment.endSeconds),
            text: segment.text,
            language: segment.language ?? 'pt',
            transcriptionMetadata: structuredClone(segment.transcriptionMetadata ?? {}),
            words: (segment.words ?? []).map(word => ({
                word: word.word,
                probability: word.probability ?? null,
                recordingStartSeconds: round(word.recordingStartSeconds ?? segment.startSeconds + word.startSeconds),
                recordingEndSeconds: round(word.recordingEndSeconds ?? segment.startSeconds + word.endSeconds)
            })),
            provenance: 'audio_observed_speech/craig_multitrack_asr',
            semanticLimitations: [
                'Track attribution comes from Craig source metadata, not biometric or real-world identity verification.',
                'Transcript text is ASR evidence pending human semantic validation, not speaker intent or strategic interpretation.'
            ]
        })));
        return global.sort((left, right) => left.recordingStartSeconds - right.recordingStartSeconds
            || left.recordingEndSeconds - right.recordingEndSeconds
            || left.callSegmentId.localeCompare(right.callSegmentId));
    }
}

export function rangesIntersect(leftStart, leftEnd, rightStart, rightEnd) {
    return leftStart <= rightEnd && leftEnd >= rightStart;
}

export function linkSegmentsToCandidates(windows, segments) {
    return windows.map(window => {
        const visual = window.videoEvidence.visualVodRangeSeconds;
        const replay = window.replayObservedFacts.replayElapsedRangeSeconds;
        const visualRefs = segments.filter(segment => rangesIntersect(
            segment.videoStartSeconds,
            segment.videoEndSeconds,
            visual.start,
            visual.end
        )).map(segment => segment.callSegmentId);
        const replayRefs = segments.filter(segment => segment.replayApproxStartSeconds !== null
            && segment.replayApproxEndSeconds !== null
            && rangesIntersect(segment.replayApproxStartSeconds, segment.replayApproxEndSeconds, replay.start, replay.end))
            .map(segment => segment.callSegmentId);
        return {
            candidateWindowId: window.candidateWindowId,
            reviewTargetId: window.reviewTargetId,
            audioCallEvidenceRefs: visualRefs,
            replayRangeCallEvidenceRefs: replayRefs,
            callSegmentCount: visualRefs.length,
            hasAudioCallEvidence: visualRefs.length > 0
        };
    });
}

export function candidateImmutableFingerprint(windows) {
    return crypto.createHash('sha256').update(deterministicJson(windows.map(window => ({
        candidateWindowId: window.candidateWindowId,
        reviewTargetId: window.reviewTargetId,
        priorityTier: window.derivedMetrics.priorityTier,
        sourceFamilies: window.derivedMetrics.sourceFamilies,
        replayRange: window.replayObservedFacts.replayElapsedRangeSeconds,
        visualRange: window.videoEvidence.visualVodRangeSeconds
    })))).digest('hex');
}

export function representAsrFailure({ reviewTargetId, stage, message }) {
    return {
        reviewTargetId: assertAudioReviewTarget(reviewTargetId),
        status: 'failed',
        stage,
        messageClass: message ? 'runtime_error_recorded_locally' : 'unknown_runtime_error',
        transcriptTextVersioned: false,
        semanticInterpretationProduced: false
    };
}
