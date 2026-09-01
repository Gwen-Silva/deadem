import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { assertCandidateId, assertTargetId, deepClone } from './data-model.mjs';

function safeMediaRefs(candidate) {
    return {
        status: candidate.videoEvidence.status,
        frames: candidate.videoEvidence.frames.map(({ role, frameId, mediaId, status, sha256 }) => ({ role, frameId, mediaId, status, sha256 })),
        storyboards: candidate.videoEvidence.storyboards.map(({ storyboardId, mediaId, status, sha256, sizeBytes }) => ({ storyboardId, mediaId, status, sha256, sizeBytes })),
        screeningAtlas: candidate.videoEvidence.screeningAtlas ? {
            atlasPageId: candidate.videoEvidence.screeningAtlas.atlasPageId,
            cardIndex: candidate.videoEvidence.screeningAtlas.cardIndex,
            mediaId: candidate.videoEvidence.screeningAtlas.mediaId,
            status: candidate.videoEvidence.screeningAtlas.status,
            sha256: candidate.videoEvidence.screeningAtlas.sha256
        } : null,
        visualVodRangeSeconds: candidate.videoEvidence.visualVodRangeSeconds
    };
}

function selectedSegments(candidateState, segmentIds) {
    const segments = candidateState?.reviewSegments ?? [];
    if (!segmentIds?.length) return segments;
    const wanted = new Set(segmentIds);
    const selected = segments.filter(segment => wanted.has(segment.reviewSegmentId));
    if (selected.length !== wanted.size) throw new Error('export_segment_not_found');
    return selected;
}

export function buildExportPacket(workspaceData, reviewState, selection) {
    const targetId = assertTargetId(selection.reviewTargetId);
    if (reviewState.reviewTargetId !== targetId) throw new Error('export_state_target_mismatch');
    const candidateIds = selection.candidateWindowIds?.length
        ? selection.candidateWindowIds
        : selection.candidateWindowId ? [selection.candidateWindowId] : [];
    if (candidateIds.length === 0) throw new Error('export_selection_empty');
    const candidates = candidateIds.map(candidateId => {
        assertCandidateId(candidateId, targetId);
        const candidate = workspaceData.candidateById.get(candidateId);
        if (!candidate) throw new Error('export_candidate_not_found');
        const humanState = reviewState.candidates[candidateId] ?? {
            reviewRecord: deepClone(candidate.initialReviewRecord),
            transcriptCorrections: {},
            reviewSegments: []
        };
        return {
            reviewTargetId: targetId,
            candidateWindowId: candidateId,
            candidateSemantics: candidate.candidateSemantics,
            ranges: {
                vod: deepClone(candidate.videoEvidence.visualVodRangeSeconds),
                replay: deepClone(candidate.replayObservedFacts.replayElapsedRangeSeconds)
            },
            syncEstimatedErrorSeconds: candidate.syncEstimatedErrorSeconds,
            replayObservedFacts: deepClone(candidate.replayObservedFacts),
            derivedMetrics: deepClone(candidate.derivedMetrics),
            videoEvidence: safeMediaRefs(candidate),
            audioCallEvidence: {
                status: candidate.audioCallEvidence.status,
                speakerStatus: 'unknown/mixed',
                label: candidate.audioCallEvidence.label,
                calls: candidate.audioCallEvidence.calls.map(call => ({
                    callSegmentId: call.callSegmentId,
                    vodStartSeconds: call.vodStartSeconds,
                    vodEndSeconds: call.vodEndSeconds,
                    replayApproxStartSeconds: call.replayApproxStartSeconds,
                    replayApproxEndSeconds: call.replayApproxEndSeconds,
                    syncEstimatedErrorSeconds: call.syncEstimatedErrorSeconds,
                    asrDraft: call.asrDraft,
                    humanTranscript: humanState.transcriptCorrections[call.callSegmentId]?.humanTranscript ?? null,
                    humanTranscriptClassification: humanState.transcriptCorrections[call.callSegmentId]?.classification ?? 'not_validated',
                    provenance: {
                        asrDraft: call.provenance,
                        humanTranscript: 'human_supplied/transcript_correction'
                    }
                }))
            },
            humanSuppliedContext: deepClone(candidate.humanSuppliedContext),
            reviewRecord: deepClone(humanState.reviewRecord),
            reviewSegments: deepClone(selectedSegments(humanState, selection.reviewSegmentIds)),
            provenance: {
                replayObservedFacts: 'Task199/factual_observation',
                derivedMetrics: 'Task202/structural_review_scheduling_metrics_not_probability',
                videoEvidence: 'Task203/local_visual_refs',
                audioCallEvidence: 'Task205/mixed_vod_asr_draft',
                humanSuppliedContext: 'human_supplied',
                reviewSegments: 'human_supplied/review_segmentation',
                analystInference: []
            }
        };
    });
    return {
        schemaVersion: 1,
        packetType: 'local_assisted_review_export',
        reviewTargetId: targetId,
        candidateCount: candidates.length,
        candidates,
        mediaEmbedded: false,
        automaticGameplayInterpretationCount: 0,
        generatedAt: new Date().toISOString()
    };
}

export function exportPacketMarkdown(packet) {
    const lines = [
        '# Local Assisted Review Packet',
        '',
        `Review target: ${packet.reviewTargetId}`,
        `Candidates: ${packet.candidateCount}`,
        '',
        'Candidate semantics: review attention regions, not gameplay events.',
        ''
    ];
    for (const candidate of packet.candidates) {
        lines.push(
            `## ${candidate.candidateWindowId}`,
            '',
            `VOD range: ${candidate.ranges.vod.start}s–${candidate.ranges.vod.end}s`,
            `Replay range: ${candidate.ranges.replay.start}s–${candidate.ranges.replay.end}s`,
            `Sync uncertainty: ±${candidate.syncEstimatedErrorSeconds}s`,
            `Review state: ${candidate.reviewRecord.reviewState}`,
            `Review segments: ${candidate.reviewSegments.length}`,
            `Audio calls: ${candidate.audioCallEvidence.calls.length}`,
            '',
            'ASR drafts require human validation; speaker remains unknown/mixed.',
            ''
        );
    }
    return `${lines.join('\n')}\n`;
}

async function atomicWrite(file, content) {
    const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
    try {
        await writeFile(temporary, content, { encoding: 'utf8', flag: 'wx' });
        await rename(temporary, file);
    } catch (error) {
        await rm(temporary, { force: true });
        throw error;
    }
}

export async function writeExportPacket({ workspaceData, reviewState, selection, exportRoot }) {
    const packet = buildExportPacket(workspaceData, reviewState, selection);
    const targetRoot = path.resolve(exportRoot, packet.reviewTargetId);
    await mkdir(targetRoot, { recursive: true });
    const jsonPath = path.join(targetRoot, 'review_packet.json');
    const markdownPath = path.join(targetRoot, 'review_packet.md');
    await atomicWrite(jsonPath, `${JSON.stringify(packet, null, 2)}\n`);
    await atomicWrite(markdownPath, exportPacketMarkdown(packet));
    return { packet, jsonPath, markdownPath };
}
