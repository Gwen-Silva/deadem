#!/usr/bin/env node
import { createReadStream } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
    CraigMultitrackAdapter,
    MixedVodAudioAdapter,
    assertAudioReviewTarget,
    candidateImmutableFingerprint,
    deterministicJson,
    linkSegmentsToCandidates,
    rangesIntersect
} from './audio-call-source-adapters.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INTAKE = 'output/local-replay-processing/two-match-assisted-review-intake/task198-bounded2/manifest.json';
const SYNC = 'output/local-replay-processing/replay-video-sync/task200-bounded2/mapping.json';
const WINDOWS = 'output/local-replay-processing/assisted-review-bundles/task204-bounded2/window-review-index.json';
const CRAIG_FIXTURE = 'tests/fixtures/audio-call-evidence/craig-multitrack.json';
const LOCAL_ROOT = '.local/deadem/call-evidence';
const OUTPUT_ROOT = 'output/local-replay-processing/audio-call-evidence/task205-bounded2';
const TARGET_IDS = ['review_match_001', 'review_match_002'];
const GAPS_GATE = 'two_match_audio_call_evidence_ready_with_asr_gaps';

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

async function bridge(file) {
    const metadata = await stat(file);
    return { path: path.relative(ROOT, file).replaceAll('\\', '/'), sizeBytes: metadata.size, sha256: await sha256File(file) };
}

async function readJson(file) {
    return JSON.parse(await readFile(path.resolve(ROOT, file), 'utf8'));
}

async function readJsonl(file) {
    const text = await readFile(file, 'utf8');
    return text.split(/\r?\n/u).filter(Boolean).map(line => JSON.parse(line));
}

async function writeJson(file, value) {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, deterministicJson(value), 'utf8');
}

async function writeJsonl(file, rows) {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, `${rows.map(row => JSON.stringify(row)).join('\n')}\n`, 'utf8');
}

function unionDuration(segments) {
    const ranges = segments.map(segment => [segment.audioStartSeconds, segment.audioEndSeconds]).sort((a, b) => a[0] - b[0]);
    let total = 0;
    let current = null;
    for (const range of ranges) {
        if (!current) current = [...range];
        else if (range[0] <= current[1]) current[1] = Math.max(current[1], range[1]);
        else { total += current[1] - current[0]; current = [...range]; }
    }
    if (current) total += current[1] - current[0];
    return Number(total.toFixed(3));
}

function deterministicSample(segments, count = 8) {
    if (segments.length <= count) return segments;
    return Array.from({ length: count }, (_, index) => segments[Math.round(index * (segments.length - 1) / (count - 1))]);
}

function assertNoForbiddenSemantics(value) {
    const text = JSON.stringify(value).toLowerCase();
    for (const forbidden of ['team_call_confirmed', 'player_intent_confirmed', 'correct_call', 'bad_call']) {
        if (text.includes(forbidden)) throw new Error(`forbidden semantic promotion detected: ${forbidden}`);
    }
}

export async function emit() {
    const intake = await readJson(INTAKE);
    const sync = await readJson(SYNC);
    const windowArtifact = await readJson(WINDOWS);
    const fixture = await readJson(CRAIG_FIXTURE);
    if (windowArtifact.candidateCount !== 102 || windowArtifact.windows.length !== 102) throw new Error('Task204 must remain exactly 102 windows');
    const immutableBefore = candidateImmutableFingerprint(windowArtifact.windows);
    const intakeById = new Map(intake.targets.map(target => [target.reviewTargetId, target]));
    const syncById = new Map(sync.models.map(model => [model.reviewTargetId, model]));
    const targetResults = [];
    const localBridges = [];
    const compactCandidateRows = [];
    const allSegmentText = [];

    for (const reviewTargetId of TARGET_IDS) {
        assertAudioReviewTarget(reviewTargetId);
        const targetRoot = path.resolve(ROOT, LOCAL_ROOT, reviewTargetId);
        const rawFile = path.join(targetRoot, 'transcript', 'raw-segments.jsonl');
        const raw = await readJsonl(rawFile);
        const metadata = JSON.parse(await readFile(path.join(targetRoot, 'transcript', 'transcription-metadata.json'), 'utf8'));
        const extraction = JSON.parse(await readFile(path.join(targetRoot, 'audio', 'extraction-metadata.json'), 'utf8'));
        const intakeTarget = intakeById.get(reviewTargetId);
        const syncModel = syncById.get(reviewTargetId);
        if (!intakeTarget || !syncModel) throw new Error(`missing immutable source mapping: ${reviewTargetId}`);
        if (extraction.sourceVodSha256 !== intakeTarget.inputs.video.sha256 || extraction.sourceVodSizeBytes !== intakeTarget.inputs.video.sizeBytes) {
            throw new Error(`Task198 VOD bridge changed: ${reviewTargetId}`);
        }
        if (extraction.videoStartSeconds !== syncModel.segments[0].videoStartSeconds || extraction.videoEndSeconds !== syncModel.segments.at(-1).videoEndSeconds) {
            throw new Error(`Task200 covered VOD range changed: ${reviewTargetId}`);
        }
        const adapter = new MixedVodAudioAdapter({ reviewTargetId, videoOffsetSeconds: extraction.videoStartSeconds, syncModel });
        const segments = adapter.normalize(raw);
        if (segments.length === 0 || segments.every(segment => !segment.text)) throw new Error(`ASR speech unusable: ${reviewTargetId}`);
        assertNoForbiddenSemantics(segments);
        allSegmentText.push(...segments.map(segment => segment.text).filter(text => text.length >= 8));
        const words = segments.flatMap(segment => segment.words.map(word => ({
            ...word,
            callSegmentId: segment.callSegmentId,
            reviewTargetId,
            provenance: segment.provenance
        })));
        const windows = windowArtifact.windows.filter(window => window.reviewTargetId === reviewTargetId);
        const links = linkSegmentsToCandidates(windows, segments);
        compactCandidateRows.push(...links.map(link => ({
            candidateWindowId: link.candidateWindowId,
            reviewTargetId,
            callSegmentCount: link.callSegmentCount,
            replayRangeCallSegmentCount: link.replayRangeCallEvidenceRefs.length,
            hasAudioCallEvidence: link.hasAudioCallEvidence
        })));
        const callFile = path.join(targetRoot, 'call-segments.jsonl');
        const wordsFile = path.join(targetRoot, 'word-timestamps.jsonl');
        const indexFile = path.join(targetRoot, 'candidate-call-index.json');
        await writeJsonl(callFile, segments);
        await writeJsonl(wordsFile, words);
        await writeJson(indexFile, {
            schemaVersion: 1,
            reviewTargetId,
            candidateSemantics: 'review_attention_region_not_gameplay_event',
            audioEvidenceSemantics: 'audio_observed_speech_asr_not_call_or_intent_confirmation',
            candidateImmutableFingerprint: immutableBefore,
            windows: links.map(link => ({
                ...link,
                audioCallEvidence: {
                    provenance: 'audio_observed_speech/mixed_vod_asr',
                    speakerStatus: 'unknown/mixed',
                    syncEstimatedErrorSeconds: syncModel.estimatedErrorSeconds,
                    asrTimestampUncertaintySeparate: true
                },
                analystInference: []
            }))
        });
        const sample = deterministicSample(segments, 8).map(segment => ({
            callSegmentId: segment.callSegmentId,
            audioStartSeconds: segment.audioStartSeconds,
            audioEndSeconds: segment.audioEndSeconds,
            transcriptText: segment.text,
            classification: null,
            allowedClassifications: ['correct', 'usable_with_minor_error', 'materially_wrong', 'unintelligible'],
            status: 'pending_manual_audio_comparison'
        }));
        await writeJson(path.join(targetRoot, 'validation-sample.json'), {
            reviewTargetId,
            preparedSampleCount: sample.length,
            classifiedSampleCount: 0,
            usableRate: null,
            status: 'pending_manual_audio_comparison_no_audio_perception_surface',
            samples: sample
        });
        const speechSeconds = unionDuration(segments);
        const languageDistribution = Object.fromEntries([...new Set(segments.map(segment => segment.language))].sort().map(language => [language, segments.filter(segment => segment.language === language).length]));
        const metrics = {
            reviewTargetId,
            audioDurationSeconds: extraction.extractedDurationSeconds,
            speechSegments: segments.length,
            transcribedSegments: segments.filter(segment => segment.text).length,
            failedSegments: 0,
            wordTimestampCount: words.length,
            languageDistribution,
            candidateWindows: links.length,
            candidateWindowsWithCallSegments: links.filter(link => link.hasAudioCallEvidence).length,
            candidateWindowsWithoutCalls: links.filter(link => !link.hasAudioCallEvidence).length,
            candidateLinkageCount: links.reduce((sum, link) => sum + link.callSegmentCount, 0),
            speechCoverageSeconds: speechSeconds,
            speechCoverageRatio: Number((speechSeconds / extraction.extractedDurationSeconds).toFixed(6)),
            asrProcessingTimeSeconds: metadata.processingTimeSeconds,
            model: metadata.model,
            device: metadata.device,
            computeType: metadata.computeType,
            syncEstimatedErrorSeconds: syncModel.estimatedErrorSeconds,
            manualValidationPreparedSegments: sample.length,
            manualValidationClassifiedSegments: 0,
            manualValidationUsableRate: null
        };
        const bridges = {
            extractionMetadata: await bridge(path.join(targetRoot, 'audio', 'extraction-metadata.json')),
            transcriptionMetadata: await bridge(path.join(targetRoot, 'transcript', 'transcription-metadata.json')),
            callSegments: await bridge(callFile),
            wordTimestamps: await bridge(wordsFile),
            candidateCallIndex: await bridge(indexFile),
            validationSample: await bridge(path.join(targetRoot, 'validation-sample.json'))
        };
        localBridges.push({ reviewTargetId, artifacts: bridges });
        targetResults.push({ reviewTargetId, status: 'available_with_asr_gaps', metrics });
    }

    if (candidateImmutableFingerprint(windowArtifact.windows) !== immutableBefore) throw new Error('candidate mutation detected');
    const craig = new CraigMultitrackAdapter(fixture).normalize();
    const speakers = new Set(craig.map(segment => segment.speaker.sourceSpeakerId));
    const overlapCount = craig.filter((segment, index) => craig.slice(index + 1).some(other => segment.speaker.sourceSpeakerId !== other.speaker.sourceSpeakerId
        && rangesIntersect(segment.recordingStartSeconds, segment.recordingEndSeconds, other.recordingStartSeconds, other.recordingEndSeconds))).length;
    if (speakers.size !== 2 || overlapCount < 1) throw new Error('Craig fixture did not preserve two speakers and overlap');

    const aggregate = {
        targets: targetResults.length,
        callSegments: targetResults.reduce((sum, target) => sum + target.metrics.speechSegments, 0),
        wordTimestamps: targetResults.reduce((sum, target) => sum + target.metrics.wordTimestampCount, 0),
        candidateWindows: compactCandidateRows.length,
        candidateWindowsWithCallSegments: compactCandidateRows.filter(row => row.hasAudioCallEvidence).length,
        candidateLinkageCount: targetResults.reduce((sum, target) => sum + target.metrics.candidateLinkageCount, 0),
        manualValidationPreparedSegments: targetResults.reduce((sum, target) => sum + target.metrics.manualValidationPreparedSegments, 0),
        manualValidationClassifiedSegments: 0,
        manualValidationUsableRate: null,
        replayAccessCount: 0,
        protectedAccessCount: 0,
        rawAudioVersionedCount: 0,
        fullTranscriptVersionedCount: 0,
        realSpeakerIdentityVersionedCount: 0,
        analystInferenceCount: 0,
        gameplayInterpretationCount: 0
    };
    const config = {
        schemaVersion: 1,
        engine: 'faster-whisper',
        engineVersion: '1.2.1',
        model: 'small',
        device: 'cpu',
        computeType: 'int8',
        languageHint: 'pt',
        vad: { enabled: true, minSilenceDurationMs: 500 },
        wordTimestamps: true,
        beamSize: 1,
        cloudRequired: false,
        deterministicNormalization: true
    };
    const artifacts = {
        'manifest.json': {
            schemaVersion: 1,
            artifactClass: 'timestamped_audio_call_evidence_manifest',
            generatedBy: 'tools/emit-timestamped-call-evidence.mjs',
            sourceArtifacts: [INTAKE, SYNC, WINDOWS],
            sourceAdapterContract: ['AudioCallSourceAdapter', 'MixedVodAudioAdapter', 'CraigMultitrackAdapter'],
            localOnlyArtifacts: localBridges,
            candidateImmutableFingerprint: immutableBefore,
            craigSyntheticFixture: { path: CRAIG_FIXTURE, trackCount: 2, speakerCount: speakers.size, segmentCount: craig.length, overlappingCrossSpeakerPairs: overlapCount }
        },
        'availability.json': { schemaVersion: 1, targets: targetResults.map(target => ({ reviewTargetId: target.reviewTargetId, status: target.status, speakerStatus: 'unknown/mixed', wordTimestamps: target.metrics.wordTimestampCount > 0 })) },
        'asr-config.json': config,
        'coverage.json': { schemaVersion: 1, targets: targetResults.map(target => target.metrics) },
        'candidate-call-summary.json': { schemaVersion: 1, candidateWindowCount: compactCandidateRows.length, rows: compactCandidateRows },
        'summary.json': { schemaVersion: 1, technicalGateStatus: GAPS_GATE, targets: targetResults, aggregate },
        'gate.json': {
            schemaVersion: 1,
            technicalGateStatus: GAPS_GATE,
            gateReason: 'Both VODs produced timestamped candidate-linked ASR evidence; bounded manual audio comparison remains pending because this execution surface cannot perceive audio.',
            blockers: ['manual_audio_transcript_validation_pending'],
            inheritedBlockers: ['review_candidate_selectivity_low', 'replay_video_sync_precision_limited'],
            acceptanceAuthority: 'ChatGPT Work'
        },
        'provenance-audit.json': {
            schemaVersion: 1,
            mixedVodProvenance: 'audio_observed_speech/mixed_vod_asr',
            craigProvenance: 'audio_observed_speech/craig_multitrack_asr',
            audioTimestampEqualsVodTimestamp: true,
            asrTimestampUncertaintySeparatedFromSync: true,
            privacy: aggregate,
            realTextLeakScan: { checkedSegmentCount: allSegmentText.length, leakedExactSegmentCount: 0 },
            forbiddenSemanticClaims: 0
        }
    };
    assertNoForbiddenSemantics(artifacts);
    for (const [name, value] of Object.entries(artifacts)) {
        const text = deterministicJson(value);
        if (allSegmentText.some(segmentText => text.includes(segmentText))) throw new Error(`real transcript text leaked into ${name}`);
        await writeJson(path.resolve(ROOT, OUTPUT_ROOT, name), value);
    }
    return { status: GAPS_GATE, aggregate, targets: targetResults.map(target => target.metrics) };
}

async function main() {
    console.log(deterministicJson(await emit()));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch(error => { console.error(error.stack ?? error.message); process.exitCode = 1; });
}

export const _test = { unionDuration, deterministicSample, assertNoForbiddenSemantics };
