import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

import DemoMessageHandler from '../packages/engine/src/handlers/DemoMessageHandler.js';
import { Logger, Player } from 'deadem';

const MATCH_ID = '91119257';
const DEMO_PATH = 'samples/partida_006.dem';
const VIDEO_PATH = 'samples/videos/Partida_006_Replay.mp4';
const OUTPUT_DIR = 'output/match_91119257';
const FRAME_DIR = path.join(OUTPUT_DIR, 'local-frame-evidence', 'task035-frames');
const FRAME_WIDTH = 1290;
const FRAME_HEIGHT = 540;
const OUTPUT_SIZE_LIMIT = 10 * 1024 * 1024;
const SCOREBOARD_DURATION_SECONDS = 1822;
const VIDEO_DURATION_SECONDS = 1843;
const DEMO_DURATION_SECONDS = 1863;
const TICK_RATE = 32;
const RECOVERY_WARNING_LIMIT = 1000;
const TRACKED_PLAYER_ID = '76561198083279289';

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});

async function main() {
    await fs.mkdir(OUTPUT_DIR, { recursive: true });
    await fs.mkdir(FRAME_DIR, { recursive: true });

    const alignment = JSON.parse(await fs.readFile(path.join(OUTPUT_DIR, 'updated-event-alignment.json'), 'utf8'));
    const events = alignment.events;
    const decoderAudit = await auditVideoDecoders();
    const frameRequests = buildFrameRequests(events);
    const extractedFrames = decoderAudit.selectedDecoder === 'windows_wpf_mediaplayer'
        ? await extractFramesWithWpf(frameRequests)
        : frameRequests.map(request => ({ ...request, decodeStatus: 'decoder_unavailable', framePath: null, frameSha256: null, sizeBytes: 0 }));
    const frameIndex = buildFrameIndex(extractedFrames, decoderAudit);
    const visualValidation = buildVisualAnnotationValidation(events, frameIndex);
    const e088Resolution = buildE088Resolution(events, frameIndex);
    const parserDiagnostic = await diagnoseParserFailure();
    const recovery = await runFaultTolerantTelemetry();
    const telemetryRows = recovery.rows;
    const structuralTelemetry = buildStructuralTelemetry(recovery.structuralSnapshots);
    const timeAlignment = buildVideoDemoTimeAlignment(telemetryRows, events, parserDiagnostic);
    const annotationMatches = buildAnnotationEntityMatches(events, telemetryRows, structuralTelemetry, timeAlignment, visualValidation);
    const aliases = buildCanonicalAliases(visualValidation, annotationMatches);
    const gate = buildGate({ decoderAudit, frameIndex, parserDiagnostic, recovery, timeAlignment, annotationMatches, aliases });

    await writeJson(path.join(OUTPUT_DIR, 'video-decoder-audit.json'), decoderAudit);
    await writeJson(path.join(OUTPUT_DIR, 'video-frame-index.json'), frameIndex);
    await writeJson(path.join(OUTPUT_DIR, 'visual-annotation-validation.json'), visualValidation);
    await writeJson(path.join(OUTPUT_DIR, 'e088-resolution.json'), e088Resolution);
    await writeJson(path.join(OUTPUT_DIR, 'parser-entity-5594-diagnostic.json'), parserDiagnostic);
    await writeJson(path.join(OUTPUT_DIR, 'parser-recovery-log.json'), recovery.recoveryLog);
    await writeJsonl(path.join(OUTPUT_DIR, 'full-tracked-player-telemetry.jsonl'), telemetryRows);
    await writeJson(path.join(OUTPUT_DIR, 'structural-entity-telemetry.json'), structuralTelemetry);
    await writeJson(path.join(OUTPUT_DIR, 'video-demo-time-alignment.json'), timeAlignment);
    await writeJson(path.join(OUTPUT_DIR, 'annotation-entity-matches.json'), annotationMatches);
    await writeJson(path.join(OUTPUT_DIR, 'canonical-map-aliases.json'), aliases);
    await writeJson(path.join(OUTPUT_DIR, 'visual-demo-calibration-gate.json'), gate);
    await writeReport({ decoderAudit, frameIndex, visualValidation, e088Resolution, parserDiagnostic, recovery, timeAlignment, annotationMatches, aliases, gate });
    await validateGeneratedOutputs(events.length);

    console.log(`match 91119257 visual/demo calibration gate: ${gate.gateResult}`);
    console.log(`frames decoded: ${frameIndex.summary.decodedFrames}/${frameIndex.summary.frameRequests}`);
    console.log(`telemetry rows: ${telemetryRows.length}`);
}

async function auditVideoDecoders() {
    const candidates = [];
    for (const name of [ 'ffmpeg', 'ffprobe', 'node_modules\\.bin\\ffmpeg.cmd', 'node_modules\\.bin\\ffprobe.cmd' ]) {
        candidates.push(checkCommand(name));
    }
    for (const candidatePath of [
        'C:\\ffmpeg\\bin\\ffmpeg.exe',
        'C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe',
        'C:\\Program Files (x86)\\ffmpeg\\bin\\ffmpeg.exe',
        path.join(process.env.LOCALAPPDATA ?? '', 'Programs', 'ffmpeg', 'bin', 'ffmpeg.exe')
    ]) {
        candidates.push(await checkPath(candidatePath));
    }
    candidates.push(checkPythonMediaModules());

    const wpfProbe = await probeWpfDecoder();
    candidates.push(wpfProbe);

    return {
        schemaVersion: 1,
        kind: 'match_91119257_video_decoder_audit',
        matchId: MATCH_ID,
        videoPath: VIDEO_PATH,
        durationDomains: {
            scoreboardDurationSeconds: SCOREBOARD_DURATION_SECONDS,
            videoDurationSeconds: VIDEO_DURATION_SECONDS,
            demoContainerPlayerDurationSeconds: DEMO_DURATION_SECONDS,
            interpretation: [
                'Duration differences are recorded as separate domains, not mismatch proof.',
                'Possible causes include pre-match time, post-match time, replay startup, scoreboard clock offset, recording offset, demo canonical-clock offset, pause/freeze, or media metadata inaccuracy.'
            ]
        },
        candidates,
        selectedDecoder: wpfProbe.available ? 'windows_wpf_mediaplayer' : null,
        selectedDecoderVersion: wpfProbe.version,
        frameRate: '30.00 from Windows Shell metadata',
        timeBase: 'seconds via MediaPlayer.Position',
        frameCount: null,
        variableFrameRateBehavior: 'not_reported_by_wpf_shell_path',
        decodeWarnings: wpfProbe.warnings,
        replay005Protection: { processed: false, status: 'preserved' }
    };
}

function checkCommand(command) {
    try {
        const found = execFileSync('where.exe', [ command ], { encoding: 'utf8', stdio: [ 'ignore', 'pipe', 'pipe' ] }).trim();
        return { candidate: command, available: found.length > 0, path: found, version: tryVersion(found.split(/\r?\n/)[0]) };
    } catch {
        return { candidate: command, available: false, path: null, version: null };
    }
}

async function checkPath(candidatePath) {
    try {
        await fs.access(candidatePath);
        return { candidate: candidatePath, available: true, path: candidatePath, version: tryVersion(candidatePath) };
    } catch {
        return { candidate: candidatePath, available: false, path: null, version: null };
    }
}

function tryVersion(binaryPath) {
    try {
        return execFileSync(binaryPath, [ '-version' ], { encoding: 'utf8', stdio: [ 'ignore', 'pipe', 'pipe' ], timeout: 5000 }).split(/\r?\n/)[0];
    } catch {
        return null;
    }
}

function checkPythonMediaModules() {
    try {
        const script = 'import importlib.util\\nfor n in ["cv2","imageio","imageio_ffmpeg","av","PIL"]:\\n print(n + ":" + ("FOUND" if importlib.util.find_spec(n) else "NOT_FOUND"))';
        const output = execFileSync('python.exe', [ '-c', script ], { encoding: 'utf8', stdio: [ 'ignore', 'pipe', 'pipe' ], timeout: 10000 });
        return { candidate: 'python_media_modules', available: /FOUND/.test(output), path: 'python.exe', version: output.trim() };
    } catch (error) {
        return { candidate: 'python_media_modules', available: false, path: null, version: null, error: cleanError(error.message) };
    }
}

async function probeWpfDecoder() {
    const probePath = path.join(FRAME_DIR, 'decoder_probe_25s.jpg');
    const result = await runWpfExtraction([
        { frameId: 'decoder_probe_25s', requestedVideoTimeSeconds: 25, framePath: probePath }
    ]);
    const stat = await safeStat(probePath);
    const available = result.ok && stat !== null && stat.size > 10000;
    return {
        candidate: 'windows_wpf_mediaplayer',
        available,
        path: 'PresentationCore MediaPlayer via powershell.exe -STA',
        version: 'Windows WPF MediaPlayer',
        probeFrame: probePath,
        probeFrameSizeBytes: stat?.size ?? 0,
        warnings: [
            ...(result.stderr ? [ cleanError(result.stderr) ] : []),
            ...(available ? [] : [ 'WPF probe did not produce a non-empty frame.' ])
        ]
    };
}

function buildFrameRequests(events) {
    const requests = [];
    for (const event of events) {
        const midpoint = Math.round((event.resolvedStartSeconds + event.resolvedEndSeconds) / 2);
        for (const [ role, second ] of [
            [ 'start', event.resolvedStartSeconds ],
            [ 'midpoint', midpoint ],
            [ 'end', event.resolvedEndSeconds ]
        ]) {
            requests.push(frameRequest(event.eventId, role, second, [ `annotation_${role}` ]));
        }
    }
    for (const second of [ 15, 25, 60, 90, 120, 300, 600, 900, 1200, 1500, 1800 ]) {
        requests.push(frameRequest('SYNC', `sync_${second}`, second, [ 'synchronization', 'clock', 'minimap' ]));
    }
    for (const second of [ 1430, 1433, 1435, 1490, 1493, 1495 ]) {
        requests.push(frameRequest('E088', `e088_candidate_${second}`, second, [ 'e088_verification' ]));
    }
    const byPath = new Map();
    for (const request of requests) byPath.set(request.framePath, request);
    return [ ...byPath.values() ].sort((left, right) => left.requestedVideoTimeSeconds - right.requestedVideoTimeSeconds || left.frameId.localeCompare(right.frameId));
}

function frameRequest(annotationId, role, second, purposes) {
    const safeId = `${annotationId}_${role}_${String(second).padStart(4, '0')}`.replaceAll(/[^a-zA-Z0-9_-]/g, '_');
    return {
        frameId: safeId,
        annotationId,
        role,
        requestedVideoTimeSeconds: second,
        requestedVideoTime: secondsToClock(second),
        decodedFrameTimeSeconds: second,
        frameNumber: Math.round(second * 30),
        framePath: path.join(FRAME_DIR, `${safeId}.jpg`).replaceAll('\\', '/'),
        decodeStatus: 'pending',
        clockVisible: null,
        minimapVisible: null,
        purposes,
        notes: []
    };
}

async function extractFramesWithWpf(requests) {
    await runWpfExtraction(requests);
    const results = [];
    for (const request of requests) {
        const stat = await safeStat(request.framePath);
        results.push({
            ...request,
            decodeStatus: stat && stat.size > 10000 ? 'decoded' : 'frame_unavailable_or_blank',
            frameSha256: stat && stat.size > 0 ? await sha256(request.framePath) : null,
            sizeBytes: stat?.size ?? 0
        });
    }
    return results;
}

async function runWpfExtraction(requests) {
    const requestPath = path.resolve(path.join(FRAME_DIR, 'frame-requests.json'));
    const scriptPath = path.resolve(path.join(FRAME_DIR, 'extract-frames.ps1'));
    const json = JSON.stringify(requests.map(request => ({
        time: request.requestedVideoTimeSeconds,
        path: path.resolve(request.framePath)
    })));
    const psScript = `
Add-Type -AssemblyName PresentationCore,WindowsBase
$video = (Resolve-Path '${escapePs(VIDEO_PATH)}').Path
$requests = Get-Content -LiteralPath '${escapePs(requestPath)}' -Raw | ConvertFrom-Json
$player = New-Object System.Windows.Media.MediaPlayer
$player.ScrubbingEnabled = $true
$player.Open([Uri]$video)
Start-Sleep -Milliseconds 2500
foreach ($request in $requests) {
  New-Item -ItemType Directory -Force -Path (Split-Path $request.path) | Out-Null
  $player.Position = [TimeSpan]::FromSeconds([double]$request.time)
  $player.Play()
  Start-Sleep -Milliseconds 450
  $player.Pause()
  Start-Sleep -Milliseconds 80
  $w = ${FRAME_WIDTH}; $h = ${FRAME_HEIGHT}
  $dv = New-Object System.Windows.Media.DrawingVisual
  $dc = $dv.RenderOpen()
  $dc.DrawVideo($player, [System.Windows.Rect]::new(0,0,$w,$h))
  $dc.Close()
  $bmp = New-Object System.Windows.Media.Imaging.RenderTargetBitmap($w,$h,96,96,[System.Windows.Media.PixelFormats]::Pbgra32)
  $bmp.Render($dv)
  $enc = New-Object System.Windows.Media.Imaging.JpegBitmapEncoder
  $enc.QualityLevel = 90
  $enc.Frames.Add([System.Windows.Media.Imaging.BitmapFrame]::Create($bmp))
  $fs = [System.IO.File]::Open($request.path,[System.IO.FileMode]::Create)
  $enc.Save($fs)
  $fs.Close()
}
$player.Close()
`;
    await fs.writeFile(requestPath, json);
    await fs.writeFile(scriptPath, psScript);
    return runPowerShellScript(scriptPath);
}

function runPowerShellScript(scriptPath) {
    try {
        const stdout = execFileSync('powershell.exe', [ '-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-File', scriptPath ], { encoding: 'utf8', stdio: [ 'ignore', 'pipe', 'pipe' ], timeout: 240000 });
        return { ok: true, stdout, stderr: '' };
    } catch (error) {
        return { ok: false, stdout: error.stdout?.toString() ?? '', stderr: error.stderr?.toString() || error.message };
    }
}

function buildFrameIndex(frames, decoderAudit) {
    const decodedFrames = frames.filter(frame => frame.decodeStatus === 'decoded').length;
    return {
        schemaVersion: 1,
        kind: 'match_91119257_video_frame_index',
        matchId: MATCH_ID,
        sourceVideoPath: VIDEO_PATH,
        decoder: decoderAudit.selectedDecoder,
        frameStoragePolicy: 'derived_frames_local_untracked_do_not_commit_source_mp4',
        summary: {
            sourceAnnotations: 88,
            frameRequests: frames.length,
            decodedFrames,
            unavailableFrames: frames.length - decodedFrames
        },
        frames,
        replay005Protection: { processed: false, status: 'preserved' }
    };
}

function buildVisualAnnotationValidation(events, frameIndex) {
    const byAnnotation = new Map();
    for (const frame of frameIndex.frames) {
        if (!/^E\d{3}$/.test(frame.annotationId)) continue;
        const list = byAnnotation.get(frame.annotationId) ?? [];
        list.push(frame);
        byAnnotation.set(frame.annotationId, list);
    }
    const annotations = events.map(event => {
        const frames = byAnnotation.get(event.eventId) ?? [];
        const decoded = frames.filter(frame => frame.decodeStatus === 'decoded').length;
        return {
            annotationId: event.eventId,
            eventGroup: event.eventGroup,
            annotationObjectType: event.objectType,
            laneReference: event.laneReference,
            mapSector: event.mapSector,
            visualElementShown: null,
            laneColorVisible: null,
            mapSideVisible: null,
            minimapRelativeColor: null,
            structureType: null,
            structureTeam: null,
            structureHealthState: null,
            playerPositionContext: null,
            frameCount: frames.length,
            decodedFrameCount: decoded,
            status: decoded === 0 ? 'frame_unavailable' : 'visual_ambiguous',
            reason: decoded === 0
                ? 'No decoded frames are available for this annotation.'
                : 'Frames were decoded, but no deterministic semantic visual classifier or direct manual frame review was applied in this autonomous run.',
            evidence: frames.map(frame => ({ frameId: frame.frameId, framePath: frame.framePath, decodeStatus: frame.decodeStatus }))
        };
    });
    return {
        schemaVersion: 1,
        kind: 'match_91119257_visual_annotation_validation',
        matchId: MATCH_ID,
        sourceAnnotationCount: events.length,
        counts: countBy(annotations, item => item.status),
        annotations,
        limitations: [
            'Frame-level evidence exists for decoded annotations, but semantic visual confirmation remains unresolved.',
            'No OCR or image classifier was used as primary evidence.',
            'Statuses are evidence classifications, not claims about annotation truth.'
        ],
        replay005Protection: { processed: false, status: 'preserved' }
    };
}

function buildE088Resolution(events, frameIndex) {
    const event = events.find(item => item.eventId === 'E088');
    const candidateFrames = frameIndex.frames.filter(frame => frame.annotationId === 'E088' && frame.role.startsWith('e088_candidate'));
    const originalFrames = candidateFrames.filter(frame => frame.requestedVideoTimeSeconds >= 1430 && frame.requestedVideoTimeSeconds <= 1435);
    const correctedFrames = candidateFrames.filter(frame => frame.requestedVideoTimeSeconds >= 1490 && frame.requestedVideoTimeSeconds <= 1495);
    return {
        schemaVersion: 1,
        kind: 'match_91119257_e088_resolution',
        matchId: MATCH_ID,
        event: event ?? null,
        originalWindow: { startSeconds: 1430, endSeconds: 1435, frames: originalFrames },
        probableCorrectionWindow: { startSeconds: 1490, endSeconds: 1495, frames: correctedFrames },
        result: originalFrames.some(frame => frame.decodeStatus === 'decoded') || correctedFrames.some(frame => frame.decodeStatus === 'decoded')
            ? 'both_ambiguous'
            : 'frame_unavailable',
        reason: 'Both candidate windows were decoded where possible, but this autonomous run did not perform semantic frame review sufficient to confirm which window matches the annotation.',
        neighboringEvents: events.filter(item => [ 'E087', 'E089' ].includes(item.eventId)),
        replay005Protection: { processed: false, status: 'preserved' }
    };
}

async function diagnoseParserFailure() {
    const player = new Player(undefined, Logger.NOOP);
    const result = {
        schemaVersion: 1,
        kind: 'match_91119257_parser_entity_5594_diagnostic',
        matchId: MATCH_ID,
        demoPath: DEMO_PATH,
        targetEntityIndex: 5594,
        reproduced: false,
        currentTickBeforeFailure: null,
        targetTick: null,
        canonicalGameTimeBeforeFailure: null,
        errorMessage: null,
        stack: [],
        entity5594PresentBeforeFailure: null,
        likelyOrigin: null,
        recoveryAssessment: null,
        replay005Protection: { processed: false, status: 'preserved' }
    };
    try {
        await player.load(createReadStream(DEMO_PATH));
        for (let second = 0; second <= 200; second++) {
            result.targetTick = second * TICK_RATE;
            try {
                while (player.getCurrentTick() < result.targetTick) await player.nextTick();
            } catch (error) {
                result.reproduced = /5594/.test(error.message);
                result.currentTickBeforeFailure = player.getCurrentTick();
                result.canonicalGameTimeBeforeFailure = Math.round(player.getCurrentTick() / TICK_RATE);
                result.errorMessage = error.message;
                result.stack = String(error.stack).split('\n').slice(0, 10);
                result.entity5594PresentBeforeFailure = player.getDemo().getEntity(5594) !== null;
                result.likelyOrigin = 'parser_library_entity_registry_update_path';
                result.recoveryAssessment = 'Exception is thrown inside DemoMessageHandler.handleSvcPacketEntities before script-level field access; safe recovery requires skipping entire affected packet and causes cascading missing-entity warnings.';
                break;
            }
        }
    } finally {
        await player.dispose();
    }
    return result;
}

async function runFaultTolerantTelemetry() {
    const original = DemoMessageHandler.prototype.handleSvcPacketEntities;
    const warnings = [];
    DemoMessageHandler.prototype.handleSvcPacketEntities = function patchedHandleSvcPacketEntities(messagePacket, ...args) {
        try {
            return original.call(this, messagePacket, ...args);
        } catch (error) {
            if (/Unable to find an entity with index \[ \d+ \]|Baseline not found \[ \d+ \]/.test(error.message)) {
                warnings.push({
                    sequence: warnings.length + 1,
                    tick: null,
                    timeSeconds: null,
                    entityIndex: extractEntityIndex(error.message),
                    context: 'DemoMessageHandler.handleSvcPacketEntities',
                    errorMessage: error.message,
                    recoveryAction: 'skipped_entire_packet_returned_empty_mutation_batch',
                    affectedFields: 'unknown_packet_level',
                    downstreamConfidenceImpact: 'high_after_first_warning'
                });
                return args[3] === true ? null : [];
            }
            throw error;
        }
    };

    const player = new Player(undefined, Logger.NOOP);
    const rows = [];
    const structuralSnapshots = [];
    let finalError = null;
    let status = 'completed_with_packet_skip_recovery';
    try {
        await player.load(createReadStream(DEMO_PATH));
        for (let second = 0; second <= DEMO_DURATION_SECONDS; second++) {
            const targetTick = second * TICK_RATE;
            try {
                while (player.getCurrentTick() < targetTick) {
                    const advanced = await player.nextTick();
                    if (!advanced) break;
                    if (warnings.length > RECOVERY_WARNING_LIMIT) throw new Error('recovery_warning_limit_exceeded');
                }
            } catch (error) {
                finalError = error.message;
                status = 'stopped_recovery_warning_limit_or_unhandled_parser_error';
                break;
            }
            const row = trackedRow(player, second, warnings.length);
            if (row) rows.push(row);
            if (second % 30 === 0 || second <= 120) structuralSnapshots.push(...structuralRows(player, second));
        }
    } finally {
        await player.dispose();
        DemoMessageHandler.prototype.handleSvcPacketEntities = original;
    }

    for (const warning of warnings) {
        warning.timeSeconds = rows.at(-1)?.demoTimeSeconds ?? null;
    }

    return {
        rows,
        structuralSnapshots,
        recoveryLog: {
            schemaVersion: 1,
            kind: 'match_91119257_parser_recovery_log',
            matchId: MATCH_ID,
            status,
            strategy: 'script_local_monkey_patch_packet_skip_for_known_entity_registry_errors',
            finalError,
            warnings,
            warningCount: warnings.length,
            firstWarning: warnings[0] ?? null,
            lastWarning: warnings.at(-1) ?? null,
            conclusion: warnings.length > RECOVERY_WARNING_LIMIT
                ? 'Recovery is not trustworthy beyond the early window because missing entity references cascade.'
                : 'Recovery completed within warning budget.',
            replay005Protection: { processed: false, status: 'preserved' }
        }
    };
}

function trackedRow(player, second, recoveryWarningsSeen) {
    const controller = player.getDemo().getEntitiesByClassName('CCitadelPlayerController')
        .find(entity => String(normalize(entity.getField('m_steamID'))) === TRACKED_PLAYER_ID);
    if (!controller) return null;
    const pawn = findPawn(player, controller);
    const position = {
        x: normalize(pawn?.getField('CBodyComponent.m_vecX')),
        y: normalize(pawn?.getField('CBodyComponent.m_vecY')),
        z: normalize(pawn?.getField('CBodyComponent.m_vecZ'))
    };
    return {
        matchId: MATCH_ID,
        demoPath: DEMO_PATH,
        demoTick: player.getCurrentTick(),
        demoTimeSeconds: second,
        playerId: TRACKED_PLAYER_ID,
        playerName: normalize(controller.getField('m_iszPlayerName')),
        controllerHandle: normalize(controller.handle),
        pawnHandle: normalize(pawn?.handle),
        heroIdRaw: normalize(controller.getField('m_nHeroID')),
        team: normalize(controller.getField('m_iTeamNum')),
        alive: normalize(controller.getField('m_bAlive')) ?? normalize(pawn?.getField('m_bAlive')),
        health: normalize(pawn?.getField('m_iHealth')) ?? normalize(pawn?.getField('m_iHealthCurrent')),
        position,
        movement: { distanceFromPrevious: null, speed: null },
        nearestPhysicalLane: null,
        nearbyStructuralEntities: [],
        parserRecoveryWarningsSeen: recoveryWarningsSeen,
        confidence: recoveryWarningsSeen === 0 ? 'medium_user_override_parser_state' : 'low_after_packet_skip_recovery'
    };
}

function findPawn(player, controller) {
    const pawns = player.getDemo().getEntitiesByClassName('CCitadelPlayerPawn');
    const controllerHandle = normalize(controller.handle);
    const heroPawnHandle = normalize(controller.getField('m_hHeroPawn'));
    const pawnHandle = normalize(controller.getField('m_hPawn'));
    return pawns.find(pawn => String(normalize(pawn.handle)) === String(heroPawnHandle))
        ?? pawns.find(pawn => String(normalize(pawn.handle)) === String(pawnHandle))
        ?? pawns.find(pawn => String(normalize(pawn.getField('m_hController'))) === String(controllerHandle))
        ?? null;
}

function structuralRows(player, second) {
    const rows = [];
    for (const entity of player.getDemo().getEntities()) {
        const className = entity.class?.name ?? '';
        if (!/(Guardian|Walker|Boss|Barrack|Patron|Shrine|Shop|Spawn|Objective|Building|MidBoss|TrooperBoss|TriggerCapturePoint)/i.test(className)) continue;
        rows.push({
            demoTimeSeconds: second,
            demoTick: player.getCurrentTick(),
            entityIndex: normalize(entity.index),
            handle: normalize(entity.handle),
            className,
            stableIdentity: null,
            team: firstField(entity, [ 'm_iTeamNum', 'm_iTeam', 'm_iLane' ]),
            position: {
                x: firstField(entity, [ 'CBodyComponent.m_vecX', 'm_vecOrigin.x', 'm_vOrigin.x' ]),
                y: firstField(entity, [ 'CBodyComponent.m_vecY', 'm_vecOrigin.y', 'm_vOrigin.y' ]),
                z: firstField(entity, [ 'CBodyComponent.m_vecZ', 'm_vecOrigin.z', 'm_vOrigin.z' ])
            },
            health: firstField(entity, [ 'm_iHealth', 'm_iMaxHealth', 'm_flHealth' ]),
            state: {
                alive: firstField(entity, [ 'm_bAlive', 'm_lifeState' ]),
                dormant: firstField(entity, [ 'm_bDormant' ])
            },
            laneAxisAssociation: 'not_assigned_without_visual_matching'
        });
    }
    return rows;
}

function buildStructuralTelemetry(snapshots) {
    const byKey = new Map();
    for (const row of snapshots) {
        const key = `${row.className}|${row.entityIndex}|${row.handle}`;
        const existing = byKey.get(key) ?? {
            entityIndex: row.entityIndex,
            handle: row.handle,
            className: row.className,
            stableIdentity: null,
            team: row.team,
            firstObservedTime: row.demoTimeSeconds,
            lastObservedTime: row.demoTimeSeconds,
            position: row.position,
            healthSamples: [],
            stateSamples: [],
            laneAxisAssociation: row.laneAxisAssociation,
            confidence: 'parser_entity_user_override_demo'
        };
        existing.firstObservedTime = Math.min(existing.firstObservedTime, row.demoTimeSeconds);
        existing.lastObservedTime = Math.max(existing.lastObservedTime, row.demoTimeSeconds);
        if (row.health !== null) existing.healthSamples.push({ time: row.demoTimeSeconds, value: row.health });
        existing.stateSamples.push({ time: row.demoTimeSeconds, state: row.state });
        byKey.set(key, existing);
    }
    return {
        schemaVersion: 1,
        kind: 'match_91119257_structural_entity_telemetry',
        matchId: MATCH_ID,
        extractionStatus: 'early_window_only_parser_recovery_unstable_after_entity_5594',
        entityCount: byKey.size,
        entities: [ ...byKey.values() ],
        limitations: [
            'Only structures visible to parser state before recovery instability are included.',
            'No visual names or lane aliases are assigned here.'
        ],
        replay005Protection: { processed: false, status: 'preserved' }
    };
}

function buildVideoDemoTimeAlignment(rows, events, diagnostic) {
    const anchors = [];
    const firstMotion = rows.find(row => row.position.x !== null && row.demoTimeSeconds >= 15);
    if (firstMotion) {
        anchors.push({
            anchorId: 'user_spawn_initial_visual_window',
            anchorType: 'initial_movement_marker',
            videoTimeSeconds: 15,
            demoTimeSeconds: firstMotion.demoTimeSeconds,
            residualSeconds: firstMotion.demoTimeSeconds - 15,
            confidence: 'low',
            reason: 'Uses first available tracked coordinate near the first manual spawn annotation; not visually confirmed.'
        });
    }
    const selectedAnchors = anchors.filter(anchor => anchor.confidence !== 'low');
    const scale = 1;
    const offset = selectedAnchors.length >= 2 ? median(selectedAnchors.map(anchor => anchor.demoTimeSeconds - anchor.videoTimeSeconds)) : null;
    return {
        schemaVersion: 1,
        kind: 'match_91119257_video_demo_time_alignment',
        matchId: MATCH_ID,
        transform: offset === null ? null : { formula: 'demo_time = video_time + offset', scale, offsetSeconds: offset },
        durationDomains: {
            scoreboardDurationSeconds: SCOREBOARD_DURATION_SECONDS,
            videoDurationSeconds: VIDEO_DURATION_SECONDS,
            demoContainerPlayerDurationSeconds: DEMO_DURATION_SECONDS
        },
        anchors,
        anchorCount: anchors.length,
        residuals: offset === null ? [] : selectedAnchors.map(anchor => anchor.residualSeconds),
        residualSummary: offset === null ? summarizeNumbers([]) : summarizeNumbers(selectedAnchors.map(anchor => Math.abs(anchor.residualSeconds))),
        rejectedAnchors: [
            ...anchors.filter(anchor => !selectedAnchors.includes(anchor)).map(anchor => ({
                anchorId: anchor.anchorId,
                reason: 'low_confidence_single_anchor_cannot_define_transform'
            })),
            ...events.map(event => ({
                annotationId: event.eventId,
                reason: diagnostic.reproduced && event.resolvedStartSeconds > (diagnostic.canonicalGameTimeBeforeFailure ?? 0)
                    ? 'parser_telemetry_unavailable_after_failure'
                    : 'visual_semantic_anchor_not_confirmed'
            }))
        ],
        globalTransformSufficient: false,
        piecewiseOffsetsRequired: 'not_evaluated',
        status: 'insufficient_independent_anchors_for_defensible_transform',
        replay005Protection: { processed: false, status: 'preserved' }
    };
}

function buildAnnotationEntityMatches(events, rows, structuralTelemetry, timeAlignment, visualValidation) {
    const validationById = new Map(visualValidation.annotations.map(item => [ item.annotationId, item ]));
    const transform = timeAlignment.transform;
    const matches = events.map(event => {
        const demoTime = transform ? event.resolvedStartSeconds + transform.offsetSeconds : null;
        const row = demoTime === null ? null : nearestRow(rows, demoTime);
        return {
            annotationId: event.eventId,
            visualStatus: validationById.get(event.eventId)?.status ?? 'frame_unavailable',
            videoTimeSeconds: event.resolvedStartSeconds,
            demoTimeSeconds: demoTime,
            playerPosition: row?.position ?? null,
            candidateEntities: [],
            selectedEntity: null,
            matchConfidence: 'unresolved',
            evidence: row ? [ 'tracked-player row exists near transformed time' ] : [],
            contradictions: [
                'No defensible video-to-demo transform exists.',
                'No annotation-specific visual entity confirmation exists.',
                structuralTelemetry.entityCount > 0 ? 'Structural telemetry exists only in early parser-safe window.' : 'No structural telemetry candidates.'
            ]
        };
    });
    return {
        schemaVersion: 1,
        kind: 'match_91119257_annotation_entity_matches',
        matchId: MATCH_ID,
        resolvedCount: 0,
        unresolvedCount: matches.length,
        matches,
        replay005Protection: { processed: false, status: 'preserved' }
    };
}

function buildCanonicalAliases() {
    const aliases = [
        'structural_side_a_archmother',
        'structural_side_b_hidden_king',
        'lane_axis_1_green',
        'lane_axis_2_blue',
        'lane_axis_3_yellow'
    ].map(alias => ({
        alias,
        neutralId: null,
        status: 'unresolved',
        provenance: 'unresolved',
        evidence: [],
        reason: 'Requires sufficient visual-to-entity matches and side orientation; not established in this task.'
    }));
    return {
        schemaVersion: 1,
        kind: 'match_91119257_canonical_map_aliases',
        matchId: MATCH_ID,
        aliases,
        rulesApplied: [
            'Neutral structural IDs are preserved.',
            'Red minimap display color is not treated as canonical side or lane identity.',
            'Lane color aliases require visual confirmation and are unresolved here.'
        ],
        replay005Protection: { processed: false, status: 'preserved' }
    };
}

function buildGate({ decoderAudit, frameIndex, parserDiagnostic, recovery, timeAlignment, annotationMatches }) {
    const gateResult = !decoderAudit.selectedDecoder || frameIndex.summary.decodedFrames === 0
        ? 'visual_demo_calibration_video_blocked'
        : parserDiagnostic.reproduced && recovery.recoveryLog.warningCount > RECOVERY_WARNING_LIMIT
            ? 'visual_demo_calibration_parser_blocked'
            : timeAlignment.transform && annotationMatches.resolvedCount > 0
                ? 'visual_demo_calibration_ready_with_limitations'
                : 'visual_demo_calibration_parser_blocked';
    return {
        schemaVersion: 1,
        kind: 'match_91119257_visual_demo_calibration_gate',
        matchId: MATCH_ID,
        gateResult,
        videoFramesInspected: frameIndex.summary.decodedFrames > 0,
        defensibleVideoDemoTransformExists: timeAlignment.status !== 'insufficient_independent_anchors_for_defensible_transform',
        trackedPlayerTelemetryCoverage: {
            rows: recovery.rows.length,
            firstSecond: recovery.rows[0]?.demoTimeSeconds ?? null,
            lastSecond: recovery.rows.at(-1)?.demoTimeSeconds ?? null,
            reachesMatchEnd: (recovery.rows.at(-1)?.demoTimeSeconds ?? 0) >= SCOREBOARD_DURATION_SECONDS
        },
        annotationEntityResolutionCount: annotationMatches.resolvedCount,
        sideAliasesValidated: 0,
        laneColorAliasesValidated: 0,
        reasons: [
            'Video frame extraction succeeded via local WPF decoder.',
            'Parser entity-registry errors cascade after entity 5594, preventing trustworthy full-demo telemetry.',
            'No sufficient independent anchors exist for a defensible video-to-demo transform.',
            'Annotation-to-entity matches and canonical aliases remain unresolved.'
        ],
        replay005Protection: { processed: false, status: 'preserved' }
    };
}

async function writeReport(data) {
    const report = `# Match 91119257 Visual Demo Calibration

## Scope

This task uses the user override that \`samples/partida_006.dem\` corresponds to the supplied match packet and local video. The override is provenance for controlled calibration work, not parser-proven match identity. Replay 005 was not processed.

## Video Decoder

- Selected decoder: \`${data.decoderAudit.selectedDecoder ?? 'none'}\`
- Duration domains: scoreboard ${SCOREBOARD_DURATION_SECONDS}s; video ${VIDEO_DURATION_SECONDS}s; demo container/player ${DEMO_DURATION_SECONDS}s
- Frames decoded: ${data.frameIndex.summary.decodedFrames}/${data.frameIndex.summary.frameRequests}
- Large frame files are local derived evidence under \`${FRAME_DIR.replaceAll('\\', '/')}\` and should not be committed.

## Annotation Validation

- visual_confirmed: ${data.visualValidation.counts.visual_confirmed ?? 0}
- visual_partially_confirmed: ${data.visualValidation.counts.visual_partially_confirmed ?? 0}
- visual_ambiguous: ${data.visualValidation.counts.visual_ambiguous ?? 0}
- visual_contradicted: ${data.visualValidation.counts.visual_contradicted ?? 0}
- frame_unavailable: ${data.visualValidation.counts.frame_unavailable ?? 0}

Frame-level evidence now exists, but semantic visual confirmation was not automated in this run. Annotation statuses remain evidence classifications, not ground truth.

## E088

- Result: \`${data.e088Resolution.result}\`
- Reason: ${data.e088Resolution.reason}

## Parser Diagnostic

- Entity 5594 reproduced: ${data.parserDiagnostic.reproduced}
- Current tick before failure: ${data.parserDiagnostic.currentTickBeforeFailure}
- Time before failure: ${data.parserDiagnostic.canonicalGameTimeBeforeFailure}s
- Root cause area: ${data.parserDiagnostic.likelyOrigin}
- Recovery behavior: ${data.recovery.recoveryLog.strategy}
- Recovery warnings: ${data.recovery.recoveryLog.warningCount}

The script-local recovery can skip affected packets, but warnings cascade, so telemetry after the early parser-safe window is low confidence and not suitable for alignment.

## Telemetry And Alignment

- Tracked-player rows: ${data.recovery.rows.length}
- First/last telemetry second: ${data.recovery.rows[0]?.demoTimeSeconds ?? null}/${data.recovery.rows.at(-1)?.demoTimeSeconds ?? null}
- Alignment transform: ${data.timeAlignment.transform === null ? 'none' : JSON.stringify(data.timeAlignment.transform)}
- Residual summary: ${JSON.stringify(data.timeAlignment.residualSummary)}
- Annotation/entity resolved count: ${data.annotationMatches.resolvedCount}

## Aliases

No side or lane color alias was visually validated. Neutral structural IDs remain authoritative; Archmother/Hidden King and Green/Blue/Yellow aliases remain unresolved.

## Gate

\`${data.gate.gateResult}\`
`;
    await fs.writeFile('reports/match-91119257-visual-demo-calibration.md', report);
    await fs.writeFile('reports/latest.md', 'reports/match-91119257-visual-demo-calibration.md\n');
}

async function validateGeneratedOutputs(expectedAnnotationCount) {
    const jsonFiles = [
        'video-decoder-audit.json',
        'video-frame-index.json',
        'visual-annotation-validation.json',
        'e088-resolution.json',
        'parser-entity-5594-diagnostic.json',
        'parser-recovery-log.json',
        'structural-entity-telemetry.json',
        'video-demo-time-alignment.json',
        'annotation-entity-matches.json',
        'canonical-map-aliases.json',
        'visual-demo-calibration-gate.json'
    ].map(file => path.join(OUTPUT_DIR, file));
    for (const file of jsonFiles) {
        const text = await fs.readFile(file, 'utf8');
        JSON.parse(text);
        const stat = await fs.stat(file);
        if (stat.size > OUTPUT_SIZE_LIMIT) throw new Error(`${file} exceeds 10 MiB`);
    }
    const jsonlPath = path.join(OUTPUT_DIR, 'full-tracked-player-telemetry.jsonl');
    const jsonlStat = await fs.stat(jsonlPath);
    if (jsonlStat.size > OUTPUT_SIZE_LIMIT) throw new Error(`${jsonlPath} exceeds 10 MiB`);
    const jsonl = await fs.readFile(jsonlPath, 'utf8');
    let previousTime = -1;
    for (const line of jsonl.split(/\r?\n/).filter(Boolean)) {
        const row = JSON.parse(line);
        if (row.demoTimeSeconds < previousTime) throw new Error('telemetry JSONL is not chronological');
        previousTime = row.demoTimeSeconds;
    }
    const visual = JSON.parse(await fs.readFile(path.join(OUTPUT_DIR, 'visual-annotation-validation.json'), 'utf8'));
    if (visual.sourceAnnotationCount !== expectedAnnotationCount || visual.annotations.length !== expectedAnnotationCount) throw new Error('annotation count mismatch');
    const aliases = JSON.parse(await fs.readFile(path.join(OUTPUT_DIR, 'canonical-map-aliases.json'), 'utf8'));
    if (aliases.aliases.some(alias => !alias.provenance || !alias.status)) throw new Error('alias provenance missing');
}

function nearestRow(rows, second) {
    let best = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const row of rows) {
        const distance = Math.abs(row.demoTimeSeconds - second);
        if (distance < bestDistance) {
            best = row;
            bestDistance = distance;
        }
    }
    return bestDistance <= 2 ? best : null;
}

function firstField(entity, fields) {
    for (const field of fields) {
        const value = normalize(entity.getField(field));
        if (value !== null && value !== undefined) return value;
    }
    return null;
}

function extractEntityIndex(message) {
    const match = /\[ (\d+) \]/.exec(message);
    return match ? Number(match[1]) : null;
}

function summarizeNumbers(values) {
    if (values.length === 0) return { count: 0, median: null, p90: null, max: null };
    const sorted = [ ...values ].sort((left, right) => left - right);
    return {
        count: sorted.length,
        median: sorted[Math.floor(sorted.length / 2)],
        p90: sorted[Math.floor(sorted.length * 0.9)],
        max: sorted.at(-1)
    };
}

function median(values) {
    if (values.length === 0) return null;
    const sorted = [ ...values ].sort((left, right) => left - right);
    return sorted[Math.floor(sorted.length / 2)];
}

function countBy(values, keyFn) {
    return values.reduce((accumulator, value) => {
        const key = keyFn(value);
        accumulator[key] = (accumulator[key] ?? 0) + 1;
        return accumulator;
    }, {});
}

async function writeJson(file, value) {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeJsonl(file, rows) {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, rows.map(row => JSON.stringify(row)).join('\n') + (rows.length > 0 ? '\n' : ''));
}

async function safeStat(file) {
    try {
        return await fs.stat(file);
    } catch {
        return null;
    }
}

async function sha256(file) {
    const hash = createHash('sha256');
    hash.update(await fs.readFile(file));
    return hash.digest('hex');
}

function normalize(value) {
    if (value === undefined) return null;
    if (typeof value === 'bigint') return value.toString();
    if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value * 1000) / 1000;
    return value;
}

function secondsToClock(value) {
    if (!Number.isFinite(value)) return null;
    const hours = Math.floor(value / 3600);
    const minutes = Math.floor((value % 3600) / 60);
    const seconds = value % 60;
    return hours > 0
        ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
        : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function cleanError(message) {
    return String(message).replaceAll(/\s+/g, ' ').slice(0, 500);
}

function escapePs(value) {
    return String(value).replaceAll('\'', '\'\'');
}
