import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

import { Logger, Player } from 'deadem';

const PACKET_DIR = 'C:/Users/gwenm/Downloads/deadlock_match_91119257_packet';
const RAW_DIR = 'data/evidence/match_91119257/raw';
const OUTPUT_DIR = 'output/match_91119257';
const CANDIDATE_DEMO = 'samples/partida_006.dem';
const MATCH_ID = '91119257';
const PACKET_FILES = [
    'match_91119257_events.csv',
    'match_91119257_metadata.json',
    'README.md',
    'CODEX_INSTRUCTION.md',
    'map_reference.png',
    'postgame_scoreboard.png'
];
const REQUIRED_COLUMNS = [
    'event_id',
    'video_start',
    'video_end',
    'start_seconds',
    'end_seconds',
    'duration_seconds',
    'event_group',
    'object_type',
    'object_tier',
    'allegiance',
    'lane_reference',
    'map_sector',
    'vertical_level',
    'description_pt_br',
    'validation_status',
    'validation_note',
    'source'
];
const TERMINOLOGY = new Map([
    [ 'T1', 'easy_camp' ],
    [ 'T2', 'medium_camp' ],
    [ 'T3', 'hard_camp' ],
    [ 'Vault', 'vault_camp' ],
    [ 'Sinner\'s Sacrifice', 'vault_camp' ],
    [ 'Powerup', 'powerup' ],
    [ 'Buff', 'powerup' ]
]);
const OUTPUT_SIZE_LIMIT = 10 * 1024 * 1024;
const PRESERVATION_DATE = '2026-06-28';

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});

async function main() {
    await fs.mkdir(RAW_DIR, { recursive: true });
    await fs.mkdir(OUTPUT_DIR, { recursive: true });
    const manifest = await preservePacket();
    const metadata = JSON.parse(await fs.readFile(path.join(PACKET_DIR, 'match_91119257_metadata.json'), 'utf8'));
    const csvRows = parseCsv(await fs.readFile(path.join(PACKET_DIR, 'match_91119257_events.csv'), 'utf8'));
    validateSchema(csvRows);
    const demoValidation = await validateCandidateDemo(metadata);
    const alignedEvents = buildEventAlignment(csvRows, demoValidation);
    const observations = buildLandmarkObservations(alignedEvents);
    const canonicalLandmarks = buildCanonicalLandmarks(observations);
    const telemetry = demoValidation.trackedPlayer?.playerId
        ? await extractTrackedTelemetry(demoValidation.trackedPlayer.playerId)
        : buildUnavailableTelemetry(demoValidation);
    const validation = buildValidationReport({ manifest, metadata, csvRows, demoValidation, alignedEvents, observations, canonicalLandmarks, telemetry });

    await writeJson(path.join(OUTPUT_DIR, 'input-file-manifest.json'), manifest);
    await writeJson(path.join(OUTPUT_DIR, 'event-alignment.json'), alignedEvents);
    await writeJson(path.join(OUTPUT_DIR, 'landmark-observations.json'), observations);
    await writeJson(path.join(OUTPUT_DIR, 'canonical-landmarks.json'), canonicalLandmarks);
    await writeJson(path.join(OUTPUT_DIR, 'tracked-player-telemetry.json'), telemetry);
    await writeJson(path.join(OUTPUT_DIR, 'validation-report.json'), validation);
    await writeReport(validation);
    await validateOutputs([
        path.join(OUTPUT_DIR, 'input-file-manifest.json'),
        path.join(OUTPUT_DIR, 'event-alignment.json'),
        path.join(OUTPUT_DIR, 'landmark-observations.json'),
        path.join(OUTPUT_DIR, 'canonical-landmarks.json'),
        path.join(OUTPUT_DIR, 'tracked-player-telemetry.json'),
        path.join(OUTPUT_DIR, 'validation-report.json'),
        'reports/match-91119257-landmark-packet.md'
    ]);
    console.log(`match 91119257 gate: ${validation.gateResult}`);
    console.log(`events: ${alignedEvents.events.length}, landmarks: ${canonicalLandmarks.landmarks.length}`);
}

async function preservePacket() {
    const files = [];
    for (const fileName of PACKET_FILES) {
        const source = path.join(PACKET_DIR, fileName);
        const target = path.join(RAW_DIR, fileName);
        await fs.copyFile(source, target);
        const sourceHash = await sha256(source);
        const targetHash = await sha256(target);
        const stat = await fs.stat(source);
        files.push({
            fileName,
            sourcePath: source,
            repositoryPath: target,
            sizeBytes: stat.size,
            sha256: sourceHash,
            copiedSha256: targetHash,
            checksumVerified: sourceHash === targetHash,
            lastModified: stat.mtime.toISOString()
        });
    }
    return {
        schemaVersion: 1,
        kind: 'match_91119257_input_file_manifest',
        matchId: MATCH_ID,
        preservedAt: PRESERVATION_DATE,
        files,
        externalSources: {
            videoUrl: 'https://drive.google.com/file/d/1VPloEzjF6qWFBg3G1RUeUDCE6Xe48aq3/view?usp=drive_link',
            demoUrl: 'https://drive.google.com/file/d/1jwYnzR9RCNd_QdKq2n_KDA5bicxSlDMC/view?usp=drive_link',
            mapReferenceUrl: 'https://deadlock.wiki/The_Cursed_Apple',
            retrievalStatus: 'not_downloaded_by_this_task',
            retrievalDate: PRESERVATION_DATE
        },
        replay005Protection: { processed: false, status: 'preserved' }
    };
}

async function validateCandidateDemo(metadata) {
    const result = {
        candidatePath: CANDIDATE_DEMO,
        fileExists: false,
        opensSuccessfully: false,
        parserMetadata: {},
        identityChecks: [],
        roster: [],
        trackedPlayer: null,
        limitations: [],
        replay005Protection: { processed: false, status: 'preserved' }
    };
    try {
        await fs.access(CANDIDATE_DEMO);
        result.fileExists = true;
    } catch {
        result.limitations.push('Candidate demo samples/partida_006.dem is not present.');
        return result;
    }
    const player = new Player(undefined, Logger.NOOP);
    try {
        await player.load(createReadStream(CANDIDATE_DEMO));
        result.opensSuccessfully = true;
        const firstTickRaw = player.getFirstTick();
        const effectiveFirstTick = firstTickRaw < 0 ? 0 : firstTickRaw;
        const lastTick = player.getLastTick();
        const tickRate = player.getDemo().server?.tickRate ?? null;
        const durationSeconds = tickRate ? Math.round((lastTick - effectiveFirstTick) / tickRate) : null;
        result.parserMetadata = {
            firstTickRaw,
            effectiveFirstTick,
            lastTick,
            tickRate,
            durationSeconds,
            expectedScoreboardDurationSeconds: parseDuration(metadata.scoreboard_match_duration),
            matchIdExposed: null,
            mapExposed: null
        };
        result.identityChecks.push(check('demo_opens', true, 'Candidate demo opens through Player.'));
        result.identityChecks.push(check('duration_close_to_scoreboard', durationSeconds !== null && Math.abs(durationSeconds - parseDuration(metadata.scoreboard_match_duration)) <= 5, `Demo duration ${durationSeconds}s vs scoreboard ${metadata.scoreboard_match_duration}.`));
        try {
            const roster = await discoverRoster(player, effectiveFirstTick, lastTick, tickRate ?? 64);
            result.roster = roster;
            result.identityChecks.push(check('twelve_real_players', roster.length === 12, `${roster.length} real players observed.`));
            const tracked = roster.find(item => /gwen/i.test(item.name ?? '')) ?? null;
            result.trackedPlayer = tracked;
            result.identityChecks.push(check('tracked_player_name_candidate', tracked !== null, tracked ? `Tracked player candidate by name: ${tracked.name}. Hero name is not parser-exposed.` : 'No player name matching Gwen/Celeste was found; hero-name mapping unavailable.'));
        } catch (error) {
            result.identityChecks.push(check('roster_extraction', false, `Roster extraction failed: ${error.message}`));
            result.limitations.push(`Roster extraction failed after demo opened: ${error.message}`);
        }
        result.limitations.push('Direct match ID and map name were not exposed by this parser path.');
        result.limitations.push('Hero names are not mapped from raw hero IDs in this task.');
    } catch (error) {
        result.limitations.push(`Candidate demo failed to open: ${error.message}`);
    } finally {
        await player.dispose();
    }
    return result;
}

async function discoverRoster(player, firstTick, lastTick, tickRate) {
    const candidates = new Map();
    const seekSeconds = [ 0, 30, 60, 120, 300, 600, 900, 1200, 1500, 1800 ].filter(second => firstTick + second * tickRate <= lastTick);
    for (const second of seekSeconds) {
        await player.seekToTick(Math.min(lastTick, Math.round(firstTick + second * tickRate)));
        for (const controller of player.getDemo().getEntitiesByClassName('CCitadelPlayerController')) {
            const steamId = normalize(controller.getField('m_steamID'));
            if (steamId === null || steamId === '0' || steamId === 0) continue;
            const playerId = String(steamId);
            const current = candidates.get(playerId) ?? {
                playerId,
                name: null,
                heroIdRaw: null,
                team: null,
                observations: 0
            };
            current.name ??= normalize(controller.getField('m_iszPlayerName'));
            current.heroIdRaw ??= normalize(controller.getField('m_nHeroID'));
            current.team ??= normalize(controller.getField('m_iTeamNum'));
            current.observations += 1;
            candidates.set(playerId, current);
        }
    }
    return Array.from(candidates.values()).sort((left, right) => String(left.team).localeCompare(String(right.team)) || String(left.name).localeCompare(String(right.name)));
}

function buildEventAlignment(rows, demoValidation) {
    const events = rows.map((row, index) => {
        const issue = timestampIssue(row, rows[index - 1]);
        const resolved = resolveVideoInterval(row, issue);
        return {
            eventId: row.event_id,
            originalVideoStart: row.video_start,
            originalVideoEnd: row.video_end,
            originalStartSeconds: number(row.start_seconds),
            originalEndSeconds: number(row.end_seconds),
            resolvedVideoStart: secondsToClock(resolved.start),
            resolvedVideoEnd: secondsToClock(resolved.end),
            resolvedStartSeconds: resolved.start,
            resolvedEndSeconds: resolved.end,
            resolutionMethod: resolved.method,
            resolutionConfidence: resolved.confidence,
            alignmentStatus: 'video_annotation_only_no_demo_anchor',
            demoTickStart: null,
            demoTickEnd: null,
            demoTimeStart: null,
            demoTimeEnd: null,
            eventGroup: row.event_group,
            objectType: row.object_type,
            objectTier: row.object_tier,
            canonicalTypes: canonicalTypes(row),
            allegiance: row.allegiance || null,
            laneReference: row.lane_reference || null,
            mapSector: row.map_sector || null,
            verticalLevel: normalizeVertical(row.vertical_level),
            descriptionPtBr: row.description_pt_br,
            validationStatus: row.validation_status,
            validationNote: row.validation_note || null,
            source: row.source,
            timestampIssue: issue
        };
    });
    return {
        schemaVersion: 1,
        kind: 'match_91119257_event_alignment',
        matchId: MATCH_ID,
        timeAlignment: {
            chosenTransform: null,
            status: 'unresolved_no_video_demo_shared_anchors',
            reason: 'Local packet does not include video frames, and parser path did not expose match-clock anchors for the manual windows.',
            candidateDemoOpened: demoValidation.opensSuccessfully,
            residuals: [],
            uncertaintySeconds: null,
            oneToOneAssumptionUsed: false
        },
        events,
        replay005Protection: { processed: false, status: 'preserved' }
    };
}

function timestampIssue(row, previous) {
    const start = number(row.start_seconds);
    const end = number(row.end_seconds);
    const issues = [];
    if (end < start) issues.push('end_before_start');
    if (previous && start < number(previous.start_seconds)) issues.push('out_of_order');
    if (previous && start === number(previous.start_seconds) && end === number(previous.end_seconds)) issues.push('duplicate_previous_interval');
    if (row.event_id === 'E088') issues.push('known_likely_manual_timestamp_error');
    return issues;
}

function resolveVideoInterval(row, issues) {
    if (row.event_id === 'E088') {
        return {
            start: 1490,
            end: 1495,
            method: 'metadata_likely_correction_preserved_original_unverified_against_video',
            confidence: 'low_unverified'
        };
    }
    return {
        start: number(row.start_seconds),
        end: number(row.end_seconds),
        method: issues.length ? 'original_preserved_with_issue' : 'original_manual_annotation',
        confidence: issues.length ? 'low' : 'manual_annotation'
    };
}

function buildLandmarkObservations(alignment) {
    const observations = [];
    for (const event of alignment.events) {
        for (const canonicalType of event.canonicalTypes) {
            observations.push({
                observationId: `${event.eventId}_${canonicalType}`,
                sourceEventId: event.eventId,
                sourceMatchId: MATCH_ID,
                canonicalType,
                tier: normalizedTier(event.objectTier),
                allegiance: event.allegiance,
                lane: event.laneReference,
                sector: event.mapSector,
                verticalLevel: event.verticalLevel,
                worldX: null,
                worldY: null,
                worldZ: null,
                mapXNorm: null,
                mapYNorm: null,
                evidenceType: 'manual_video_annotation_packet',
                confidence: event.alignmentStatus === 'video_annotation_only_no_demo_anchor' ? 'manual_unaligned' : 'unknown',
                cameraRelation: 'unknown_without_video_frame_inspection',
                notes: event.descriptionPtBr,
                originalVideoStart: event.originalVideoStart,
                originalVideoEnd: event.originalVideoEnd,
                resolvedVideoStart: event.resolvedVideoStart,
                resolvedVideoEnd: event.resolvedVideoEnd
            });
        }
    }
    observations.push({
        observationId: 'user_asserted_mid_boss_center_underground',
        sourceEventId: null,
        sourceMatchId: MATCH_ID,
        canonicalType: 'mid_boss',
        tier: null,
        allegiance: null,
        lane: null,
        sector: 'map_center',
        verticalLevel: 'underground',
        worldX: null,
        worldY: null,
        worldZ: null,
        mapXNorm: 0.5,
        mapYNorm: 0.5,
        evidenceType: 'user_asserted_map_reference',
        confidence: 'user_asserted',
        cameraRelation: 'not_video_confirmed',
        notes: 'Mid Boss was not shown in the manual video sweep; stored only as user-asserted underground center evidence.',
        originalVideoStart: null,
        originalVideoEnd: null,
        resolvedVideoStart: null,
        resolvedVideoEnd: null
    });
    return {
        schemaVersion: 1,
        kind: 'match_91119257_landmark_observations',
        matchId: MATCH_ID,
        observations,
        replay005Protection: { processed: false, status: 'preserved' }
    };
}

function buildCanonicalLandmarks(observationsOutput) {
    const groups = new Map();
    for (const observation of observationsOutput.observations) {
        const key = [
            observation.canonicalType,
            observation.tier ?? '',
            observation.allegiance ?? '',
            observation.lane ?? '',
            observation.sector ?? '',
            observation.verticalLevel ?? ''
        ].join('|');
        const group = groups.get(key) ?? [];
        group.push(observation);
        groups.set(key, group);
    }
    const landmarks = Array.from(groups.entries()).map(([ key, items ], index) => {
        const first = items[0];
        const assertedCenter = first.canonicalType === 'mid_boss' && first.confidence === 'user_asserted';
        return {
            landmarkId: `match_91119257_landmark_${String(index + 1).padStart(3, '0')}`,
            groupingKey: key,
            canonicalType: first.canonicalType,
            tier: first.tier,
            allegiance: first.allegiance,
            lane: first.lane,
            sector: first.sector,
            verticalLevel: first.verticalLevel,
            worldX: null,
            worldY: null,
            worldZ: null,
            mapXNorm: assertedCenter ? 0.5 : null,
            mapYNorm: assertedCenter ? 0.5 : null,
            sourceMatchId: MATCH_ID,
            sourceEventIds: items.map(item => item.sourceEventId).filter(Boolean),
            evidenceType: assertedCenter ? 'user_asserted_map_reference' : 'manual_video_annotation_packet',
            confidence: assertedCenter ? 'user_asserted' : 'manual_unaligned',
            repeatedObservationCount: items.length,
            coordinateSpread: {
                worldXY: null,
                mapXY: null,
                status: 'not_computable_without_demo_or_frame_coordinate_calibration'
            },
            notes: assertedCenter
                ? 'Mid Boss center is user asserted and not video confirmed.'
                : 'Canonical landmark groups manual annotations but has no calibrated world/minimap coordinate yet.'
        };
    });
    return {
        schemaVersion: 1,
        kind: 'match_91119257_canonical_landmarks',
        matchId: MATCH_ID,
        landmarks,
        unmappedFeatures: [
            { feature: 'tunnels', status: 'unmapped_no_direct_evidence' },
            { feature: 'stairs', status: 'unmapped_no_direct_evidence' }
        ],
        replay005Protection: { processed: false, status: 'preserved' }
    };
}

async function extractTrackedTelemetry(playerId) {
    const player = new Player(undefined, Logger.NOOP);
    const rows = [];
    try {
        await player.load(createReadStream(CANDIDATE_DEMO));
        const firstTickRaw = player.getFirstTick();
        const effectiveFirstTick = firstTickRaw < 0 ? 0 : firstTickRaw;
        const lastTick = player.getLastTick();
        const tickRate = player.getDemo().server?.tickRate ?? 64;
        const durationSeconds = Math.floor((lastTick - effectiveFirstTick) / tickRate);
        await player.seekToTick(effectiveFirstTick);
        for (let second = 0; second <= durationSeconds; second++) {
            const targetTick = Math.min(lastTick, Math.round(effectiveFirstTick + second * tickRate));
            await advanceToTick(player, targetTick);
            const row = trackedPlayerRow(player, playerId, second);
            if (row) rows.push(row);
        }
    } finally {
        await player.dispose();
    }
    return {
        schemaVersion: 1,
        kind: 'match_91119257_tracked_player_telemetry',
        matchId: MATCH_ID,
        candidateDemo: CANDIDATE_DEMO,
        trackedPlayerId: playerId,
        status: rows.length ? 'extracted_candidate_by_player_name' : 'unavailable',
        rows,
        limitations: [
            'Aligned video time is unavailable because no defensible video-demo transform was established.',
            'Hero name Celeste is not independently mapped from raw hero ID by this task.'
        ],
        replay005Protection: { processed: false, status: 'preserved' }
    };
}

function trackedPlayerRow(player, playerId, second) {
    const controllers = player.getDemo().getEntitiesByClassName('CCitadelPlayerController');
    const controller = controllers.find(entity => String(normalize(entity.getField('m_steamID'))) === playerId);
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

async function advanceToTick(player, targetTick) {
    while (player.getCurrentTick() < targetTick) {
        const advanced = await player.nextTick();
        if (!advanced) break;
    }
}

function buildUnavailableTelemetry(demoValidation) {
    return {
        schemaVersion: 1,
        kind: 'match_91119257_tracked_player_telemetry',
        matchId: MATCH_ID,
        candidateDemo: CANDIDATE_DEMO,
        status: 'unavailable_tracked_player_unresolved',
        rows: [],
        limitations: demoValidation.limitations,
        replay005Protection: { processed: false, status: 'preserved' }
    };
}

function buildValidationReport(context) {
    const { manifest, csvRows, demoValidation, alignedEvents, observations, canonicalLandmarks } = context;
    const corrected = alignedEvents.events.filter(event => event.resolutionMethod.includes('correction'));
    const demoHasIdentityConflict = demoValidation.identityChecks.some(item => item.status === 'fail' && [ 'duration_close_to_scoreboard', 'roster_extraction' ].includes(item.id));
    const confirmed = [
        `Preserved ${manifest.files.length} local packet files with matching SHA-256 checksums.`,
        `Parsed ${csvRows.length} CSV events with required schema.`,
        `Generated ${observations.observations.length} landmark observations and ${canonicalLandmarks.landmarks.length} canonical landmark groups.`
    ];
    if (demoValidation.opensSuccessfully) confirmed.push('Candidate demo samples/partida_006.dem opens as a file, but identity is not validated.');
    const partiallyConfirmed = demoValidation.identityChecks.filter(item => item.status === 'pass' && item.id !== 'demo_opens').map(item => item.note);
    const contradicted = demoValidation.identityChecks.filter(item => item.status === 'fail' && [ 'duration_close_to_scoreboard', 'roster_extraction' ].includes(item.id)).map(item => item.note);
    const unresolved = [
        'Video file was not available locally, so manual windows were not verified against frames.',
        'No defensible video-to-demo transform was established because shared anchors were unavailable.',
        'Direct match ID and map name were not exposed by the parser path.',
        'World-to-minimap calibration remains unresolved for manual landmarks without stable demo entity or frame-coordinate correspondence.',
        'The E088 correction remains unverified against video frames.'
    ];
    const userAssertedOnly = [
        'Mid Boss stored at normalized minimap center (0.5, 0.5), vertical_level underground.',
        'Tunnels and stairs remain unmapped.'
    ];
    const gateResult = demoHasIdentityConflict
        ? 'match_91119257_identity_blocked'
        : demoValidation.opensSuccessfully && csvRows.length > 0
            ? 'match_91119257_packet_integrated_with_limitations'
            : 'match_91119257_sources_insufficient';
    return {
        schemaVersion: 1,
        kind: 'match_91119257_validation_report',
        matchId: MATCH_ID,
        gateResult,
        confirmed,
        partiallyConfirmed,
        contradicted,
        unresolved,
        userAssertedOnly,
        metrics: {
            eventCoverageCount: csvRows.length,
            eventsSuccessfullyAlignedToDemo: 0,
            ambiguousWindows: alignedEvents.events.filter(event => event.resolutionConfidence.startsWith('low')).length,
            correctedTimestamps: corrected.map(event => ({
                eventId: event.eventId,
                original: `${event.originalVideoStart}-${event.originalVideoEnd}`,
                resolved: `${event.resolvedVideoStart}-${event.resolvedVideoEnd}`,
                method: event.resolutionMethod,
                confidence: event.resolutionConfidence
            })),
            canonicalLandmarkCount: canonicalLandmarks.landmarks.length,
            videoOnlyLandmarkCount: canonicalLandmarks.landmarks.filter(item => item.confidence === 'manual_unaligned').length,
            demoResolvedLandmarkCount: 0
        },
        demoValidation,
        replay005Protection: { processed: false, status: 'preserved' }
    };
}

async function writeReport(validation) {
    const report = `# Match 91119257 Landmark Packet

## Scope

This report integrates the supplied local evidence packet for match 91119257. It does not validate lane transitions, rotations, fight grouping, combat intent, objective decisions, macro events, or replay 005.

## Confirmed

${validation.confirmed.map(item => `- ${item}`).join('\n')}

## Partially Confirmed

${validation.partiallyConfirmed.map(item => `- ${item}`).join('\n') || '- None.'}

## Contradicted

${validation.contradicted.map(item => `- ${item}`).join('\n') || '- None.'}

## Unresolved

${validation.unresolved.map(item => `- ${item}`).join('\n')}

## User Asserted Only

${validation.userAssertedOnly.map(item => `- ${item}`).join('\n')}

## Metrics

- CSV events: ${validation.metrics.eventCoverageCount}
- Events aligned to demo: ${validation.metrics.eventsSuccessfullyAlignedToDemo}
- Ambiguous/low-confidence windows: ${validation.metrics.ambiguousWindows}
- Corrected timestamp candidates: ${validation.metrics.correctedTimestamps.length}
- Canonical landmark groups: ${validation.metrics.canonicalLandmarkCount}
- Demo-resolved landmarks: ${validation.metrics.demoResolvedLandmarkCount}

## Gate

\`${validation.gateResult}\`
`;
    await fs.writeFile('reports/match-91119257-landmark-packet.md', report);
    await fs.writeFile('reports/latest.md', 'reports/match-91119257-landmark-packet.md\n');
}

function canonicalTypes(row) {
    const values = [];
    for (const raw of [ row.object_type, row.object_tier ].filter(Boolean).flatMap(value => String(value).split('+'))) {
        const trimmed = raw.trim();
        values.push(TERMINOLOGY.get(trimmed) ?? normalizeToken(trimmed));
    }
    return Array.from(new Set(values.filter(Boolean)));
}

function normalizedTier(value) {
    if (!value) return null;
    return String(value).split('+').map(item => TERMINOLOGY.get(item.trim()) ?? normalizeToken(item.trim())).join('+');
}

function normalizeVertical(value) {
    if (!value || value === 'surface_or_unspecified') return 'unknown';
    if (value === 'elevated') return 'elevated_bridge';
    return normalizeToken(value);
}

function normalizeToken(value) {
    return String(value)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
}

function check(id, ok, note) {
    return { id, status: ok ? 'pass' : 'fail', note };
}

function parseDuration(value) {
    const [ minutes, seconds ] = String(value).split(':').map(Number);
    return minutes * 60 + seconds;
}

function parseCsv(text) {
    const lines = text.replace(/^\uFEFF/, '').trim().split(/\r?\n/);
    const headers = splitCsvLine(lines[0]);
    return lines.slice(1).map(line => Object.fromEntries(splitCsvLine(line).map((value, index) => [ headers[index], value ])));
}

function splitCsvLine(line) {
    const values = [];
    let current = '';
    let quoted = false;
    for (let index = 0; index < line.length; index++) {
        const char = line[index];
        const next = line[index + 1];
        if (char === '"' && quoted && next === '"') {
            current += '"';
            index += 1;
        } else if (char === '"') {
            quoted = !quoted;
        } else if (char === ',' && !quoted) {
            values.push(current);
            current = '';
        } else {
            current += char;
        }
    }
    values.push(current);
    return values;
}

function validateSchema(rows) {
    if (rows.length === 0) throw new Error('CSV has no rows.');
    const keys = Object.keys(rows[0]);
    const missing = REQUIRED_COLUMNS.filter(column => !keys.includes(column));
    if (missing.length) throw new Error(`CSV missing required columns: ${missing.join(', ')}`);
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

function number(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function secondsToClock(value) {
    const minutes = Math.floor(value / 60);
    const seconds = value % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function normalize(value) {
    if (value === undefined) return null;
    if (typeof value === 'bigint') return value.toString();
    return value;
}
