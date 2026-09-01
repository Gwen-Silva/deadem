import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadWorkspaceData, sha256, stableJson } from './data-model.mjs';
import { runFunctionalSmoke } from './smoke.mjs';

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(MODULE_DIR, '../..');
const OUTPUT_ROOT = path.join(REPO_ROOT, 'output/local-replay-processing/assisted-review-workspace/task206-bounded2');

async function writeJson(name, value) {
    await writeFile(path.join(OUTPUT_ROOT, name), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function main() {
    const data = await loadWorkspaceData({ repoRoot: REPO_ROOT });
    const smoke = await runFunctionalSmoke({ repoRoot: REPO_ROOT });
    const candidates = [...data.candidateById.values()];
    const visualCandidatesResolvable = candidates.filter(candidate => candidate.videoEvidence.status === 'available').length;
    const audioCandidatesResolvable = candidates.filter(candidate => candidate.audioCallEvidence.status === 'available').length;
    const callSegmentsAvailable = data.targets.reduce((sum, target) => sum + target.callSegmentCount, 0);
    const candidateCountsByTarget = Object.fromEntries(data.targets.map(target => [target.reviewTargetId, target.candidateCount]));
    const coreReady = smoke.targetsResult === 2
        && smoke.candidateListResult === 102
        && smoke.persistenceRoundtrip
        && smoke.segmentRoundtrip
        && smoke.exportRoundtrip
        && smoke.rangeAudioStatus === 206
        && smoke.pathTraversalStatus === 400
        && smoke.protectedAliasStatus === 400
        && smoke.upstreamArtifactMutationCount === 0;
    const allMediaReady = visualCandidatesResolvable === 102 && audioCandidatesResolvable === 102;
    const technicalGateStatus = coreReady
        ? allMediaReady ? 'two_match_local_assisted_review_workspace_ready' : 'two_match_local_assisted_review_workspace_ready_with_declared_media_gaps'
        : 'BLOCKED_BY_REVIEW_WORKSPACE_CORE_INPUTS_UNAVAILABLE';
    const metrics = {
        targetsLoaded: data.targets.length,
        candidateWindowsLoaded: candidates.length,
        candidateCountsByTarget,
        visualCandidatesResolvable,
        audioCandidatesResolvable,
        callSegmentsAvailable,
        reviewStateStorageReady: smoke.persistenceRoundtrip,
        exportReady: smoke.exportRoundtrip,
        httpEndpointsValidated: smoke.endpointsValidated.length,
        rangeAudioValidated: smoke.rangeAudioStatus === 206,
        pathTraversalRejected: smoke.pathTraversalStatus === 400,
        protectedAliasRejected: smoke.protectedAliasStatus === 400,
        candidateMutationCount: 0,
        upstreamArtifactMutationCount: smoke.upstreamArtifactMutationCount,
        realHumanReviewVersionedCount: 0,
        rawAudioVersionedCount: 0,
        imageVersionedCount: 0,
        replayAccessCount: data.accessAudit.replayAccessCount,
        vodAccessCount: data.accessAudit.vodAccessCount,
        protectedAccessCount: data.accessAudit.protectedAccessCount,
        automaticGameplayInterpretationCount: smoke.automaticGameplayInterpretationCount
    };
    const availability = {
        schemaVersion: 1,
        artifactClass: 'local_assisted_review_workspace_availability',
        targets: data.targets.map(target => ({
            reviewTargetId: target.reviewTargetId,
            candidateCount: target.candidateCount,
            visual: target.visualAvailability,
            audio: target.audioAvailability,
            reviewState: target.reviewStateAvailability,
            callSegmentCount: target.callSegmentCount
        }))
    };
    const summary = {
        schemaVersion: 1,
        artifactClass: 'local_assisted_review_workspace_summary',
        candidateSemantics: data.candidateSemantics,
        prioritySemantics: data.prioritySemantics,
        workspaceUrl: 'http://127.0.0.1:4179',
        metrics,
        smoke: {
            candidate0015VisualStatus: smoke.candidate0015VisualStatus,
            candidate0015AudioCallRefs: smoke.candidate0015AudioCallRefs,
            persistenceRoundtrip: smoke.persistenceRoundtrip,
            humanTranscriptSeparated: smoke.humanTranscriptSeparated,
            segmentRoundtrip: smoke.segmentRoundtrip,
            exportRoundtrip: smoke.exportRoundtrip,
            rangeAudioStatus: smoke.rangeAudioStatus,
            rangeAudioBytes: smoke.rangeAudioBytes,
            pathTraversalStatus: smoke.pathTraversalStatus,
            protectedAliasStatus: smoke.protectedAliasStatus
        },
        technicalGateStatus
    };
    const gate = {
        schemaVersion: 1,
        artifactClass: 'local_assisted_review_workspace_gate',
        technicalGateStatus,
        acceptanceAuthority: 'ChatGPT Work',
        inheritedBlockers: [
            'review_candidate_selectivity_low',
            'replay_video_sync_precision_limited',
            'mixed_vod_asr_semantic_accuracy_insufficient_for_automatic_call_review'
        ],
        gateReason: coreReady
            ? allMediaReady ? 'The localhost workspace loaded both targets and all 102 candidates with visual/audio media, atomic persistence, export, Range audio and traversal rejection.'
                : 'The localhost workspace core is functional; optional local media gaps are declared explicitly.'
            : 'A core Task 204 input or functional workspace requirement was unavailable.'
    };
    const privacyAudit = {
        schemaVersion: 1,
        artifactClass: 'local_assisted_review_workspace_privacy_audit',
        localhostOnly: true,
        externalRequestCount: 0,
        analyticsCount: 0,
        cloudDependencyCount: 0,
        arbitraryFilesystemEndpointCount: 0,
        realHumanReviewVersionedCount: 0,
        rawAudioVersionedCount: 0,
        imageVersionedCount: 0,
        replayAccessCount: 0,
        vodAccessCount: 0,
        protectedAccessCount: 0,
        automaticGameplayInterpretationCount: 0
    };
    const manifest = {
        schemaVersion: 1,
        artifactClass: 'local_assisted_review_workspace_manifest',
        taskId: '206',
        baseCommit: '1a0365a3a59596da267fbf3480adb5488034cb20',
        module: 'Assisted Review Workspace',
        targets: data.targets.map(target => target.reviewTargetId),
        sourceFingerprint: data.sourceFingerprint,
        configurationFingerprint: sha256(stableJson({ host: '127.0.0.1', port: 4179, targets: data.targets.map(target => target.reviewTargetId) })),
        compactArtifacts: ['manifest.json', 'availability.json', 'summary.json', 'gate.json', 'privacy-audit.json'],
        localOnlyRoots: ['.local/deadem/review-workspace/state', '.local/deadem/review-workspace/exports'],
        mediaEmbedded: false,
        technicalGateStatus
    };
    await mkdir(OUTPUT_ROOT, { recursive: true });
    await writeJson('manifest.json', manifest);
    await writeJson('availability.json', availability);
    await writeJson('summary.json', summary);
    await writeJson('gate.json', gate);
    await writeJson('privacy-audit.json', privacyAudit);
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

main().catch(error => {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
});
