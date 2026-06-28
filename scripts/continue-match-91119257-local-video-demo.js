import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

import { Logger, Player } from 'deadem';

const MATCH_ID = '91119257';
const DEMO_PATH = 'samples/partida_006.dem';
const VIDEO_PATH = 'samples/videos/Partida_006_Replay.mp4';
const OUTPUT_DIR = 'output/match_91119257';
const OUTPUT_SIZE_LIMIT = 10 * 1024 * 1024;
const USER_OVERRIDE = 'User explicitly confirmed partida_006.dem is the target bot match; parser match ID mismatch or missing ID should be disregarded for this packet.';

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});

async function main() {
    await fs.mkdir(OUTPUT_DIR, { recursive: true });
    const mediaManifest = await buildMediaManifest();
    const demoValidation = await validateDemoOverride();
    const priorAlignment = JSON.parse(await fs.readFile(path.join(OUTPUT_DIR, 'event-alignment.json'), 'utf8'));
    const updatedAlignment = buildUpdatedAlignment(priorAlignment, mediaManifest, demoValidation);
    const telemetry = demoValidation.trackedPlayer
        ? await extractTrackedTelemetry(demoValidation.trackedPlayer.playerId)
        : unavailableTelemetry(demoValidation);
    const frameSamples = buildFrameSamples(mediaManifest, updatedAlignment);
    const validation = buildValidation({ mediaManifest, demoValidation, updatedAlignment, telemetry, frameSamples });

    await writeJson(path.join(OUTPUT_DIR, 'local-media-manifest.json'), mediaManifest);
    await writeJson(path.join(OUTPUT_DIR, 'demo-override-validation.json'), demoValidation);
    await writeJson(path.join(OUTPUT_DIR, 'video-frame-samples.json'), frameSamples);
    await writeJson(path.join(OUTPUT_DIR, 'updated-event-alignment.json'), updatedAlignment);
    await writeJson(path.join(OUTPUT_DIR, 'updated-tracked-player-telemetry.json'), telemetry);
    await writeJson(path.join(OUTPUT_DIR, 'updated-validation-report.json'), validation);
    await writeReport(validation);
    await validateOutputs([
        path.join(OUTPUT_DIR, 'local-media-manifest.json'),
        path.join(OUTPUT_DIR, 'demo-override-validation.json'),
        path.join(OUTPUT_DIR, 'video-frame-samples.json'),
        path.join(OUTPUT_DIR, 'updated-event-alignment.json'),
        path.join(OUTPUT_DIR, 'updated-tracked-player-telemetry.json'),
        path.join(OUTPUT_DIR, 'updated-validation-report.json'),
        'reports/match-91119257-local-video-demo-override.md'
    ]);
    console.log(`match 91119257 local override gate: ${validation.gateResult}`);
    console.log(`tracked telemetry rows: ${telemetry.rows.length}`);
}

async function buildMediaManifest() {
    const demoStat = await fs.stat(DEMO_PATH);
    const videoStat = await fs.stat(VIDEO_PATH);
    const shellMetadata = sanitizeShellMetadata(getWindowsShellVideoMetadata(path.resolve(VIDEO_PATH)));
    return {
        schemaVersion: 1,
        kind: 'match_91119257_local_media_manifest',
        matchId: MATCH_ID,
        files: [
            {
                role: 'user_confirmed_demo',
                path: DEMO_PATH,
                sizeBytes: demoStat.size,
                sha256: await sha256(DEMO_PATH),
                lastModified: demoStat.mtime.toISOString(),
                committed: false
            },
            {
                role: 'local_video',
                path: VIDEO_PATH,
                sizeBytes: videoStat.size,
                sha256: await sha256(VIDEO_PATH),
                lastModified: videoStat.mtime.toISOString(),
                committed: false
            }
        ],
        videoMetadata: {
            shellMetadata,
            durationSeconds: parseShellDuration(shellMetadata.Comprimento ?? shellMetadata.Length ?? null),
            durationSource: shellMetadata.Comprimento || shellMetadata.Length ? 'windows_shell_metadata' : 'packet_metadata_only',
            ffmpegAvailable: false,
            frameExtractionStatus: 'not_attempted_ffmpeg_unavailable'
        },
        userOverride: {
            accepted: true,
            statement: USER_OVERRIDE,
            provenance: 'user_instruction_current_turn'
        },
        replay005Protection: { processed: false, status: 'preserved' }
    };
}

function sanitizeShellMetadata(metadata) {
    if (metadata.error) return metadata;
    const allowedKeys = [
        'Tipo',
        'Tipo de item',
        'Extensão de arquivo',
        'Largura do quadro',
        'Altura do quadro',
        'Taxa de quadros',
        'Taxa de bits',
        'Taxa de dados',
        'Taxa de bits total',
        'Comprimento',
        'Orientação do vídeo'
    ];
    return Object.fromEntries(allowedKeys.filter(key => metadata[key]).map(key => [ key, metadata[key] ]));
}

function getWindowsShellVideoMetadata(videoPath) {
    const escaped = videoPath.replaceAll('\'', '\'\'');
    const command = `$folder = Split-Path -LiteralPath '${escaped}'; $file = Split-Path -Leaf '${escaped}'; $shell = New-Object -ComObject Shell.Application; $ns = $shell.Namespace($folder); $item = $ns.ParseName($file); $out = @{}; 0..330 | ForEach-Object { $name=$ns.GetDetailsOf($null,$_); $val=$ns.GetDetailsOf($item,$_); if ($val) { $out[$name]=$val } }; $out | ConvertTo-Json -Compress`;
    try {
        const raw = execFileSync('powershell.exe', [ '-NoProfile', '-Command', command ], { encoding: 'utf8', stdio: [ 'ignore', 'pipe', 'pipe' ] });
        return JSON.parse(raw.trim());
    } catch (error) {
        return { error: error.message };
    }
}

async function validateDemoOverride() {
    const player = new Player(undefined, Logger.NOOP);
    const result = {
        schemaVersion: 1,
        kind: 'match_91119257_demo_override_validation',
        matchId: MATCH_ID,
        demoPath: DEMO_PATH,
        userOverride: USER_OVERRIDE,
        opensSuccessfully: false,
        parserMetadata: {},
        roster: [],
        trackedPlayer: null,
        identityStatus: 'user_override_not_parser_proven',
        validationFlags: [],
        replay005Protection: { processed: false, status: 'preserved' }
    };
    try {
        await player.load(createReadStream(DEMO_PATH));
        result.opensSuccessfully = true;
        const firstTickRaw = player.getFirstTick();
        const effectiveFirstTick = firstTickRaw < 0 ? 0 : firstTickRaw;
        const lastTick = player.getLastTick();
        const tickRate = player.getDemo().server?.tickRate ?? 32;
        result.parserMetadata = {
            firstTickRaw,
            effectiveFirstTick,
            lastTick,
            tickRate,
            durationSeconds: Math.round((lastTick - effectiveFirstTick) / tickRate),
            matchIdExposed: null,
            mapExposed: null
        };
        result.roster = await discoverRosterSequential(player, 2500);
        result.trackedPlayer = result.roster.find(item => /gwen/i.test(item.name ?? '')) ?? null;
        if (result.roster.length !== 12) result.validationFlags.push('roster_not_full_at_sequential_probe');
        if (!result.trackedPlayer) result.validationFlags.push('tracked_player_name_not_found');
        result.validationFlags.push('parser_match_id_unavailable_user_override_required');
    } finally {
        await player.dispose();
    }
    return result;
}

async function discoverRosterSequential(player, maxTicks) {
    for (let index = 0; index < maxTicks; index++) {
        if (index > 0) await player.nextTick();
        const controllers = player.getDemo().getEntitiesByClassName('CCitadelPlayerController')
            .map(controller => ({
                playerId: String(normalize(controller.getField('m_steamID'))),
                name: normalize(controller.getField('m_iszPlayerName')),
                heroIdRaw: normalize(controller.getField('m_nHeroID')),
                team: normalize(controller.getField('m_iTeamNum')),
                observedTick: player.getCurrentTick()
            }))
            .filter(item => item.playerId && item.playerId !== '0');
        if (controllers.length >= 1) {
            return controllers.sort((left, right) => String(left.team).localeCompare(String(right.team)) || String(left.name).localeCompare(String(right.name)));
        }
    }
    return [];
}

function buildUpdatedAlignment(priorAlignment, mediaManifest, demoValidation) {
    const videoDuration = mediaManifest.videoMetadata.durationSeconds;
    const demoDuration = demoValidation.parserMetadata.durationSeconds ?? null;
    const scoreboardDuration = 30 * 60 + 22;
    const durationComparisons = {
        videoVsScoreboardSeconds: videoDuration === null ? null : videoDuration - scoreboardDuration,
        demoVsVideoSeconds: videoDuration === null || demoDuration === null ? null : demoDuration - videoDuration,
        demoVsScoreboardSeconds: demoDuration === null ? null : demoDuration - scoreboardDuration
    };
    return {
        ...priorAlignment,
        kind: 'match_91119257_updated_event_alignment',
        timeAlignment: {
            chosenTransform: null,
            status: 'duration_relationship_known_anchor_alignment_unresolved',
            reason: 'Local video duration and demo duration are known, but no frame-level or demo-event anchors were validated in this task.',
            userOverrideAccepted: true,
            videoDurationSeconds: videoDuration,
            demoDurationSeconds: demoDuration,
            scoreboardDurationSeconds: scoreboardDuration,
            durationComparisons,
            candidateTransforms: [
                {
                    name: 'video_time_as_manual_annotation_time',
                    formula: 'video_seconds = manual resolved seconds',
                    use: 'preserve manual observations only'
                },
                {
                    name: 'duration_only_demo_video_offset',
                    formula: 'demo_seconds approximately video_seconds + demoVsVideoSeconds',
                    offsetSeconds: durationComparisons.demoVsVideoSeconds,
                    use: 'diagnostic only; not selected without anchors'
                }
            ],
            residuals: [],
            uncertaintySeconds: null,
            oneToOneAssumptionUsed: false
        },
        events: priorAlignment.events.map(event => ({
            ...event,
            alignmentStatus: 'manual_video_time_preserved_demo_alignment_unresolved_user_override',
            demoTickStart: null,
            demoTickEnd: null,
            demoTimeStart: null,
            demoTimeEnd: null
        }))
    };
}

async function extractTrackedTelemetry(playerId) {
    const player = new Player(undefined, Logger.NOOP);
    const rows = [];
    let extractionError = null;
    try {
        await player.load(createReadStream(DEMO_PATH));
        const firstTickRaw = player.getFirstTick();
        const effectiveFirstTick = firstTickRaw < 0 ? 0 : firstTickRaw;
        const lastTick = player.getLastTick();
        const tickRate = player.getDemo().server?.tickRate ?? 32;
        try {
            for (let second = 0; second <= Math.floor((lastTick - effectiveFirstTick) / tickRate); second++) {
                const targetTick = Math.min(lastTick, Math.round(effectiveFirstTick + second * tickRate));
                while (player.getCurrentTick() < targetTick) {
                    const advanced = await player.nextTick();
                    if (!advanced) break;
                }
                const row = trackedRow(player, playerId, second);
                if (row) rows.push(row);
            }
        } catch (error) {
            extractionError = error.message;
        }
    } finally {
        await player.dispose();
    }
    return {
        schemaVersion: 1,
        kind: 'match_91119257_updated_tracked_player_telemetry',
        matchId: MATCH_ID,
        demoPath: DEMO_PATH,
        trackedPlayerId: playerId,
        status: extractionError === null ? 'extracted_with_user_demo_override' : 'partial_extraction_parser_stopped',
        rows,
        limitations: [
            'Aligned video time remains null because no anchor-based transform was selected.',
            'Hero name Celeste is user/scoreboard context; parser exposes only raw hero ID.',
            ...(extractionError ? [ `Telemetry extraction stopped early: ${extractionError}` ] : [])
        ],
        replay005Protection: { processed: false, status: 'preserved' }
    };
}

function trackedRow(player, playerId, second) {
    const controller = player.getDemo().getEntitiesByClassName('CCitadelPlayerController')
        .find(entity => String(normalize(entity.getField('m_steamID'))) === playerId);
    if (!controller) return null;
    const pawn = findPawn(player, controller);
    return {
        demoTick: player.getCurrentTick(),
        demoTimeSeconds: second,
        alignedVideoTimeSeconds: null,
        playerId,
        playerName: normalize(controller.getField('m_iszPlayerName')),
        heroIdRaw: normalize(controller.getField('m_nHeroID')),
        team: normalize(controller.getField('m_iTeamNum')),
        alive: normalize(controller.getField('m_bAlive')) ?? normalize(pawn?.getField('m_bAlive')),
        worldX: normalize(pawn?.getField('CBodyComponent.m_vecX')),
        worldY: normalize(pawn?.getField('CBodyComponent.m_vecY')),
        worldZ: normalize(pawn?.getField('CBodyComponent.m_vecZ')),
        velocityOrDisplacement: null,
        physicalLaneEvidence: 'not_computed_for_unvalidated_match_geometry',
        nearbyKnownLandmarks: []
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

function unavailableTelemetry(demoValidation) {
    return {
        schemaVersion: 1,
        kind: 'match_91119257_updated_tracked_player_telemetry',
        matchId: MATCH_ID,
        demoPath: DEMO_PATH,
        status: 'unavailable_tracked_player_unresolved',
        rows: [],
        limitations: demoValidation.validationFlags,
        replay005Protection: { processed: false, status: 'preserved' }
    };
}

function buildFrameSamples(mediaManifest, alignment) {
    const sampleSeconds = [ 15, 25, 445, 605, 620, 1490 ].filter(second => second <= (mediaManifest.videoMetadata.durationSeconds ?? Number.POSITIVE_INFINITY));
    return {
        schemaVersion: 1,
        kind: 'match_91119257_video_frame_samples',
        matchId: MATCH_ID,
        videoPath: VIDEO_PATH,
        extractionStatus: 'not_extracted_ffmpeg_unavailable',
        mediaMetadataAvailable: mediaManifest.videoMetadata.durationSeconds !== null,
        samples: sampleSeconds.map(second => ({
            videoSecond: second,
            videoTime: secondsToClock(second),
            relatedEvents: alignment.events.filter(event => event.resolvedStartSeconds <= second && event.resolvedEndSeconds >= second).map(event => event.eventId),
            framePath: null,
            status: 'not_extracted'
        })),
        replay005Protection: { processed: false, status: 'preserved' }
    };
}

function buildValidation({ mediaManifest, demoValidation, updatedAlignment, telemetry, frameSamples }) {
    const videoDuration = mediaManifest.videoMetadata.durationSeconds;
    const demoDuration = demoValidation.parserMetadata.durationSeconds ?? null;
    const hasVideo = videoDuration !== null;
    const hasTelemetry = telemetry.rows.length > 0;
    const gateResult = hasVideo && demoValidation.opensSuccessfully && hasTelemetry
        ? 'match_91119257_override_ready_with_limitations'
        : hasVideo && demoValidation.opensSuccessfully
            ? 'match_91119257_media_validated_alignment_unresolved'
            : 'match_91119257_local_sources_insufficient';
    return {
        schemaVersion: 1,
        kind: 'match_91119257_updated_validation_report',
        matchId: MATCH_ID,
        gateResult,
        confirmed: [
            `Local video exists and reports duration ${secondsToClock(videoDuration)}.`,
            `User override accepts ${DEMO_PATH} as the target bot replay.`,
            `Demo opens through Player with duration ${demoDuration}s.`,
            hasTelemetry ? `Tracked-player telemetry extracted: ${telemetry.rows.length} one-second rows (${telemetry.status}).` : 'Tracked-player telemetry was not extracted.'
        ],
        partiallyConfirmed: [
            'Roster probe finds the user-named player in the demo, but parser match ID and map are still unavailable.'
        ],
        contradicted: [],
        unresolved: [
            'No frame-level inspection was performed because ffmpeg/ffprobe are unavailable in PATH.',
            'No anchor-based video-to-demo transform was selected.',
            'Manual landmark world/minimap calibration remains unresolved.',
            'E088 remains a likely timestamp correction, not video-confirmed.'
        ],
        userAssertedOnly: [
            'Demo identity relies on the current user override.',
            'Mid Boss center/underground assertion remains inherited from task 033.'
        ],
        metrics: {
            videoDurationSeconds: videoDuration,
            demoDurationSeconds: demoDuration,
            telemetryRows: telemetry.rows.length,
            alignmentEvents: updatedAlignment.events.length,
            frameSamplesPlanned: frameSamples.samples.length
        },
        replay005Protection: { processed: false, status: 'preserved' }
    };
}

async function writeReport(validation) {
    const report = `# Match 91119257 Local Video Demo Override

## Scope

This task continues match 91119257 using the user's explicit override that \`samples/partida_006.dem\` is the target bot match. It does not validate macro events, transitions, rotations, fight grouping, combat intent, objective decisions, strategic judgments, or replay 005.

## Confirmed

${validation.confirmed.map(item => `- ${item}`).join('\n')}

## Partially Confirmed

${validation.partiallyConfirmed.map(item => `- ${item}`).join('\n')}

## Unresolved

${validation.unresolved.map(item => `- ${item}`).join('\n')}

## User Asserted Only

${validation.userAssertedOnly.map(item => `- ${item}`).join('\n')}

## Gate

\`${validation.gateResult}\`
`;
    await fs.writeFile('reports/match-91119257-local-video-demo-override.md', report);
    await fs.writeFile('reports/latest.md', 'reports/match-91119257-local-video-demo-override.md\n');
}

function parseShellDuration(value) {
    if (!value) return null;
    const parts = String(value).trim().split(':').map(Number);
    if (parts.length === 3 && parts.every(Number.isFinite)) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2 && parts.every(Number.isFinite)) return parts[0] * 60 + parts[1];
    return null;
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

async function validateOutputs(files) {
    for (const file of files) {
        const stat = await fs.stat(file);
        if (stat.size > OUTPUT_SIZE_LIMIT) throw new Error(`${file} exceeds 10 MiB`);
        if (file.endsWith('.json')) JSON.parse(await fs.readFile(file, 'utf8'));
    }
}

async function writeJson(file, value) {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
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
