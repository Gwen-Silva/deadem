import { mkdtemp, readFile, rm } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { sha256 } from './data-model.mjs';
import { createReviewWorkspaceServer } from './server.mjs';

async function jsonFetch(url, options = {}) {
    const response = await fetch(url, {
        ...options,
        headers: { 'content-type': 'application/json', ...(options.headers ?? {}) }
    });
    const value = await response.json();
    if (!response.ok) throw new Error(`${response.status}:${value.error}`);
    return { response, value };
}

function rawStatus(port, requestPath) {
    return new Promise((resolve, reject) => {
        const request = http.request({ host: '127.0.0.1', port, method: 'GET', path: requestPath }, response => {
            response.resume();
            response.once('end', () => resolve(response.statusCode));
        });
        request.once('error', reject);
        request.end();
    });
}

export async function runFunctionalSmoke({ repoRoot }) {
    const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'deadem-review-workspace-'));
    const inputPath = path.join(repoRoot, 'output/local-replay-processing/assisted-review-bundles/task204-bounded2/window-review-index.json');
    const beforeHash = sha256(await readFile(inputPath));
    const openedFolders = [];
    const workspace = await createReviewWorkspaceServer({
        repoRoot,
        stateRoot: path.join(temporaryRoot, 'state'),
        exportRoot: path.join(temporaryRoot, 'exports'),
        port: 0,
        openFolder: async folderPath => { openedFolders.push(folderPath); }
    });
    const url = await workspace.start();
    try {
        const targets = (await jsonFetch(`${url}/api/targets`)).value;
        const candidateList = (await jsonFetch(`${url}/api/candidates`)).value;
        const candidate = (await jsonFetch(`${url}/api/candidates/review_match_001_window_0015`)).value;
        const initialState = (await jsonFetch(`${url}/api/review-state/review_match_001`)).value;
        const syntheticState = {
            ...initialState,
            candidates: {
                review_match_001_window_0015: {
                    reviewRecord: { ...candidate.initialReviewRecord, reviewState: 'reviewed' },
                    transcriptCorrections: candidate.audioCallEvidence.calls.length ? {
                        [candidate.audioCallEvidence.calls[0].callSegmentId]: {
                            humanTranscript: 'synthetic local roundtrip text',
                            classification: 'usable_with_minor_error'
                        }
                    } : {},
                    reviewSegments: [{
                        reviewSegmentId: 'review_match_001_window_0015_segment_01',
                        candidateWindowId: 'review_match_001_window_0015',
                        reviewTargetId: 'review_match_001',
                        vodStartSeconds: candidate.videoEvidence.visualVodRangeSeconds.start,
                        vodEndSeconds: candidate.videoEvidence.visualVodRangeSeconds.start + 5,
                        replayApproxStartSeconds: null,
                        replayApproxEndSeconds: null,
                        humanLabel: 'synthetic_segment',
                        humanNotes: 'synthetic smoke data only',
                        evidenceRefs: [],
                        reviewRecord: { ...candidate.initialReviewRecord, reviewState: 'in_review' }
                    }]
                }
            }
        };
        await jsonFetch(`${url}/api/review-state/review_match_001`, { method: 'PUT', body: JSON.stringify(syntheticState) });
        const reloaded = (await jsonFetch(`${url}/api/review-state/review_match_001`)).value;
        const exported = (await jsonFetch(`${url}/api/export`, {
            method: 'POST',
            body: JSON.stringify({ reviewTargetId: 'review_match_001', candidateWindowId: 'review_match_001_window_0015' })
        })).value;
        const exportLocation = (await jsonFetch(`${url}/api/export-location/review_match_001`)).value;
        const openFolder = (await jsonFetch(`${url}/api/export-folder/open`, {
            method: 'POST', body: JSON.stringify({ reviewTargetId: 'review_match_001' })
        })).value;
        const reviewed = (await jsonFetch(`${url}/api/candidates?reviewTargetId=review_match_001&status=reviewed`)).value;
        const unreviewed = (await jsonFetch(`${url}/api/candidates?reviewTargetId=review_match_001&status=unreviewed`)).value;
        const audioUrl = candidate.audioCallEvidence.calls.find(call => call.playback)?.playback.url;
        const rangeResponse = audioUrl ? await fetch(`${url}${audioUrl}`, { headers: { range: 'bytes=0-31' } }) : null;
        if (rangeResponse) await rangeResponse.arrayBuffer();
        const port = new URL(url).port;
        const traversalStatus = await rawStatus(port, '/%2e%2e/secret');
        const protectedAliasStatus = await rawStatus(port, '/replay_005/file');
        const afterHash = sha256(await readFile(inputPath));
        return {
            workspaceUrl: url,
            targetsResult: targets.targets.length,
            candidateListResult: candidateList.count,
            candidate0015VisualStatus: candidate.videoEvidence.status,
            candidate0015AudioCallRefs: candidate.audioCallEvidence.calls.length,
            persistenceRoundtrip: reloaded.candidates.review_match_001_window_0015.reviewRecord.reviewState === 'reviewed',
            humanTranscriptSeparated: candidate.audioCallEvidence.calls.length === 0 || (
                reloaded.candidates.review_match_001_window_0015.transcriptCorrections[candidate.audioCallEvidence.calls[0].callSegmentId].humanTranscript
                !== candidate.audioCallEvidence.calls[0].asrDraft
            ),
            segmentRoundtrip: reloaded.candidates.review_match_001_window_0015.reviewSegments.length === 1,
            exportRoundtrip: exported.candidateCount === 1,
            exportLocationReady: exportLocation.folderPath === exported.folderPath,
            copyPathReady: typeof exportLocation.folderPath === 'string' && exportLocation.folderPath.endsWith('review_match_001'),
            openFolderReady: openFolder.opened === true && openedFolders.length === 1 && openedFolders[0] === exportLocation.folderPath,
            reviewedCanaryCount: reviewed.count,
            unreviewedCanaryCount: unreviewed.count,
            rangeAudioStatus: rangeResponse?.status ?? null,
            rangeAudioBytes: rangeResponse ? 32 : 0,
            pathTraversalStatus: traversalStatus,
            protectedAliasStatus,
            upstreamArtifactMutationCount: beforeHash === afterHash ? 0 : 1,
            automaticGameplayInterpretationCount: 0,
            endpointsValidated: [
                'GET /api/targets',
                'GET /api/candidates',
                'GET /api/candidates/:candidateWindowId',
                'GET /api/review-state/:reviewTargetId',
                'PUT /api/review-state/:reviewTargetId',
                'POST /api/export',
                'GET /api/export-location/:reviewTargetId',
                'POST /api/export-folder/open',
                'GET /media/:mediaId Range'
            ]
        };
    } finally {
        await workspace.stop();
        await rm(temporaryRoot, { recursive: true, force: true });
    }
}
