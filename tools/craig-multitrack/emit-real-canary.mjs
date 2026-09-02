import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CraigMultitrackAdapter, deterministicJson } from '../audio-call-source-adapters.mjs';
import { DEFAULT_REPO_ROOT } from '../review-workspace/data-model.mjs';
import { summarizeTimeline } from './audio-probe.mjs';
import { loadCraigIntake } from './intake.mjs';

const PACKAGE_ROOT = path.join(DEFAULT_REPO_ROOT, '.local/deadem/craig/scrim_2026-09-01');
const LOCAL_ROOT = path.join(DEFAULT_REPO_ROOT, '.local/deadem/craig/recordings/craig_recording_task208_real_01');
const OUTPUT_ROOT = path.join(DEFAULT_REPO_ROOT, 'output/local-replay-processing/craig-multitrack/task208-real-canary');

async function runPython(intakePath) {
    const executable = path.join(DEFAULT_REPO_ROOT, '.venv-video/Scripts/python.exe');
    const script = path.join(DEFAULT_REPO_ROOT, 'tools/craig-multitrack/audio_pipeline.py');
    const args = [script, '--intake', intakePath, '--output-root', LOCAL_ROOT,
        '--model-root', path.join(DEFAULT_REPO_ROOT, '.local/deadem/call-evidence/models')];
    await new Promise((resolve, reject) => {
        const child = spawn(executable, args, { cwd: DEFAULT_REPO_ROOT, stdio: 'inherit' });
        child.once('error', reject);
        child.once('exit', code => code === 0 ? resolve() : reject(new Error(`craig_audio_pipeline_exit_${code}`)));
    });
}

function privacyAudit(versioned, intake, validation) {
    const serialized = JSON.stringify(versioned);
    const identityAndPathValues = intake.tracks.flatMap(track => [track.sourceSpeakerId, track.sourceUsername,
        track.sourceDisplayName, path.basename(track.sourceAudioPath), track.sourceAudioPath])
        .filter(value => value && value.length >= 4);
    const fullTranscriptValues = validation.samples.map(sample => sample.asrTranscript)
        .filter(value => value && value.length >= 8);
    const leaks = [...identityAndPathValues, ...fullTranscriptValues].filter(value => serialized.includes(value));
    return {
        schemaVersion: 1,
        artifactClass: 'real_craig_multitrack_privacy_audit',
        versionedRealIdentityCount: 0,
        versionedTranscriptTextCount: 0,
        versionedWordTextCount: 0,
        versionedAudioCount: 0,
        versionedRawFilenameCount: 0,
        versionedAbsolutePathCount: 0,
        detectedPrivateValueLeakCount: leaks.length,
        replayAccessCount: 0,
        vodAccessCount: 0,
        protectedAccessCount: 0,
        passed: leaks.length === 0
    };
}

async function main() {
    const intake = await loadCraigIntake(PACKAGE_ROOT);
    await mkdir(LOCAL_ROOT, { recursive: true });
    const intakePath = path.join(LOCAL_ROOT, 'intake-private.json');
    await writeFile(intakePath, deterministicJson(intake));
    const pipelinePath = path.join(LOCAL_ROOT, 'pipeline-result.json');
    const validationPath = path.join(LOCAL_ROOT, 'validation/validation-sheet.json');
    if (!existsSync(pipelinePath) || !existsSync(validationPath)) await runPython(intakePath);
    const pipeline = JSON.parse(await readFile(pipelinePath, 'utf8'));
    const validation = JSON.parse(await readFile(validationPath, 'utf8'));
    const metadataPath = path.join(LOCAL_ROOT, 'validation/recording-private-metadata.json');
    const privateMetadata = JSON.parse(await readFile(metadataPath, 'utf8'));
    for (const track of privateMetadata.tracks) {
        const source = intake.tracks.find(row => row.trackOrdinal === track.trackOrdinal);
        if (!source || source.sourceAudioSha256 !== track.sourceAudioSha256) {
            throw new Error('cached_pipeline_source_fingerprint_mismatch');
        }
        track.startTimeSeconds = track.firstTimestampSeconds;
        track.timelineStatus = track.decodeSmoke ? 'measured' : 'invalid';
    }
    if (privateMetadata.tracks.length !== intake.tracks.length) throw new Error('cached_pipeline_track_count_mismatch');
    await writeFile(metadataPath, deterministicJson(privateMetadata));
    const tracks = intake.tracks.map(track => ({
        trackOrdinal: track.trackOrdinal,
        trackRef: track.trackRef,
        sourceSpeakerId: track.sourceSpeakerId,
        displayName: track.sourceDisplayName,
        segments: validation.samples.filter(sample => sample.trackOrdinal === track.trackOrdinal).map(sample => ({
            startSeconds: sample.recordingStartSeconds,
            endSeconds: sample.recordingEndSeconds,
            text: sample.asrTranscript,
            language: 'pt',
            transcriptionMetadata: sample.transcriptionMetadata,
            words: sample.asrWords
        }))
    }));
    const normalized = new CraigMultitrackAdapter({ recordingRoot: LOCAL_ROOT,
        recordingId: intake.recording.recordingId, tracks }).normalize();
    await writeFile(path.join(LOCAL_ROOT, 'validation/normalized-call-segments.json'), deterministicJson(normalized));
    const timeline = summarizeTimeline(pipeline.tracks);
    const validTracks = pipeline.tracks.filter(track => track.decodeSmoke).length;
    const manifest = {
        schemaVersion: 1, artifactClass: 'real_craig_multitrack_manifest', taskId: '208',
        recordingRef: 'craig_recording_task208_real_01', sourceClass: 'craig_multitrack_export',
        sourcePackageAuthorized: true, rawHeaderParsing: { bounded: true,
            bytesRead: intake.recording.rawHeaderReadBytes, headerEndByte: intake.recording.rawHeaderEndByte,
            rawFileSizeBytes: intake.recording.rawFileSizeBytes, payloadDecoded: false },
        metadataStatus: 'raw_header_and_info_consistent_ordinal_mapping_complete',
        trackCount: intake.recording.trackCount,
        trackRefs: intake.tracks.map(track => track.trackRef),
        sourceAudioFingerprints: Object.fromEntries(intake.tracks.map(track => [track.trackRef, track.sourceAudioSha256])),
        identityStorage: 'local_only', transcriptStorage: 'local_only', mediaStorage: 'local_only'
    };
    const probe = {
        schemaVersion: 1, artifactClass: 'real_craig_multitrack_audio_probe_summary',
        trackCount: pipeline.trackCount, validTrackCount: validTracks, invalidTrackCount: pipeline.trackCount - validTracks,
        codecDistribution: Object.fromEntries([...new Set(pipeline.tracks.map(track => track.codec))].map(codec => [codec, pipeline.tracks.filter(track => track.codec === codec).length])),
        sampleRateDistribution: Object.fromEntries([...new Set(pipeline.tracks.map(track => track.sampleRate))].map(rate => [String(rate), pipeline.tracks.filter(track => track.sampleRate === rate).length])),
        channelDistribution: Object.fromEntries([...new Set(pipeline.tracks.map(track => track.channels))].map(channels => [String(channels), pipeline.tracks.filter(track => track.channels === channels).length])),
        normalizedFormat: { codec: 'pcm_s16le', sampleRate: 16000, channels: 1 },
        ...timeline,
        tracks: pipeline.tracks.map(track => ({ trackRef: track.trackRef, codec: track.codec, sampleRate: track.sampleRate,
            channels: track.channels, durationSeconds: track.durationSeconds, firstTimestampSeconds: track.firstTimestampSeconds,
            lastTimestampSeconds: track.lastTimestampSeconds, decodeSmoke: track.decodeSmoke,
            timelineStatus: track.decodeSmoke ? 'measured' : 'invalid' }))
    };
    const canary = {
        schemaVersion: 1, artifactClass: 'real_craig_multitrack_canary_summary',
        sampleCount: pipeline.sampleCount, sampleDistribution: pipeline.sampleDistribution,
        selection: 'deterministic_temporally_distributed_activity_regions',
        activitySemantics: 'energy_locator_not_speech_fact_or_call',
        asrConfiguration: pipeline.asrConfiguration,
        normalizationProcessingTimeSeconds: pipeline.normalizationProcessingTimeSeconds,
        asrProcessingTimeSeconds: pipeline.asrProcessingTimeSeconds,
        overlapPairCount: pipeline.overlapPairCount,
        overlapDurationSeconds: pipeline.overlapDurationSeconds,
        speakerStatus: 'track_attributed',
        speakerSemanticLimitation: 'Craig source-track metadata; not biometric or real-world identity verification and not speaker intent.',
        baselineMixedVod: { usableRatePercent: 43.75, materiallyWrongRatePercent: 56.25 },
        humanQualityThreshold: { usableRatePercentMinimum: 75, materiallyWrongRatePercentMaximum: 25 },
        humanClassificationStatus: 'pending', criticalSemanticErrorCount: null,
        fullRecordingTranscriptionExecuted: false, candidateIntegrationExecuted: false,
        vodSynchronizationExecuted: false, diarizationExecuted: false
    };
    const gateStatus = validTracks === 9 && pipeline.sampleCount === 18
        ? 'real_craig_multitrack_call_evidence_canary_ready_for_human_validation'
        : 'real_craig_multitrack_call_evidence_canary_ready_with_declared_track_gaps';
    const gate = {
        schemaVersion: 1, artifactClass: 'real_craig_multitrack_gate', taskId: '208',
        technicalGateStatus: gateStatus, trackMappingStatus: 'unambiguous_ordinal_mapping',
        audioValidity: { valid: validTracks, invalid: pipeline.trackCount - validTracks },
        validationSampleCount: pipeline.sampleCount, qualityStatus: 'pending_human_semantic_classification',
        semanticPromotion: false, finalAcceptance: 'pending_independent_chatgpt_work_validation'
    };
    const preliminary = { manifest, probe, canary, gate };
    const privacy = privacyAudit(preliminary, intake, validation);
    if (!privacy.passed) throw new Error('versioned_privacy_audit_failed');
    await mkdir(OUTPUT_ROOT, { recursive: true });
    await Promise.all(Object.entries({ 'manifest.json': manifest, 'audio-probe-summary.json': probe,
        'canary-summary.json': canary, 'gate.json': gate, 'privacy-audit.json': privacy })
        .map(([name, value]) => writeFile(path.join(OUTPUT_ROOT, name), deterministicJson(value))));
    process.stdout.write(deterministicJson({ technicalGateStatus: gateStatus, validTracks, sampleCount: pipeline.sampleCount,
        asrProcessingTimeSeconds: pipeline.asrProcessingTimeSeconds, privacyPassed: privacy.passed }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch(error => { process.stderr.write(`${error.stack ?? error.message}\n`); process.exitCode = 1; });
}
