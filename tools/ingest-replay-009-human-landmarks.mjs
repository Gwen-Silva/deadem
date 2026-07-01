#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ANNO_OUT = 'output/replay-009-human-annotations';
const LANDMARK_OUT = 'output/replay-009-independent-landmarks';
const GENERATED_BY = 'tools/ingest-replay-009-human-landmarks.mjs';
const SOURCE_ID = 'user_replay_009_participant_2026_07_01';
const TODAY = '2026-07-01';

async function writeJson(relativePath, value) {
    await mkdir(path.dirname(relativePath), { recursive: true });
    await writeFile(relativePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeText(relativePath, value) {
    await mkdir(path.dirname(relativePath), { recursive: true });
    await writeFile(relativePath, value);
}

function hashText(value) {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function sourceProvenance(extra = {}) {
    return {
        annotationSourceId: SOURCE_ID,
        sourceType: 'human_player_annotation',
        participantStatus: 'played_in_match',
        participantPlayerName: 'Aresius',
        participantHero: 'Warden',
        recordedAt: TODAY,
        independenceFromParser: true,
        independenceFromMatchDataOrigin: false,
        authority: 'advisory',
        mayGuideSearch: true,
        mayConstrainIdentity: true,
        mayValidateExactCoordinates: false,
        mayValidateMechanicVersion: false,
        ...extra
    };
}

function event(id, time, eventType, directVisibility, confidence, summary, limitations = []) {
    return {
        annotationEventId: id,
        humanReportedGameTime: time,
        parserSeconds: null,
        videoSeconds: null,
        eventType,
        summary,
        directVisibility,
        humanConfidence: confidence,
        canonicalFactStatus: 'not_integrated',
        semanticStatus: 'human_annotation',
        requiresTechnicalCorrelation: true,
        sourceType: 'human_player_annotation',
        sourceAuthority: 'advisory',
        limitations: [
            'Human-reported game time is not parserSeconds.',
            'This record does not overwrite canonical facts.',
            ...limitations
        ]
    };
}

function mechanic(id, mechanicId, statement, status = 'current_player_understanding', limitations = []) {
    return {
        annotationId: id,
        mechanicId,
        sourceType: 'human_mechanics_statement',
        versionStatus: status,
        applicabilityToReplayBuild: 'likely_but_not_version_validated',
        mechanicEffectApplied: false,
        statement,
        limitations: [
            'Do not apply this rule to canonical replay events until build applicability is resolved.',
            ...limitations
        ]
    };
}

function walkImages(root) {
    const results = [];
    if (!existsSync(root)) return results;
    const stack = [root];
    while (stack.length) {
        const current = stack.pop();
        for (const entry of readdirSync(current, { withFileTypes: true })) {
            const full = path.join(current, entry.name);
            if (entry.isDirectory()) {
                if (['node_modules', '.git', '.venv-video'].includes(entry.name)) continue;
                stack.push(full);
            } else if (/\.(png|jpe?g|webp)$/i.test(entry.name)) {
                results.push(full);
            }
        }
    }
    return results;
}

function discoverImages() {
    const roots = ['.', '.local', 'input', 'samples', 'samples/images', 'images', 'output-local'];
    const all = [];
    for (const root of roots) all.push(...walkImages(root));
    const attachmentRoot = 'C:/Users/gwenm/.codex/attachments';
    all.push(...walkImages(attachmentRoot));
    const unique = [...new Set(all)];
    const likely = unique.filter(file => {
        const name = file.toLowerCase();
        return name.includes('replay-009') && (name.includes('map') || name.includes('minimap') || name.includes('urn'));
    });
    return { allCount: unique.length, likely };
}

function expectedImageRows(found) {
    const roles = [
        ['custom_map_dense', 'custom full minimap with dense colored resource annotations and live icons', true],
        ['custom_map_reduced', 'custom full minimap with fewer live overlays', true],
        ['custom_map_clean', 'cleaner custom full minimap showing fixed structures and resource markers', true],
        ['standard_circular_minimap', 'standard circular minimap screenshot with gameplay icons', false],
        ['urn_spawn_diagram', 'three-panel grey Urn spawn diagram labeled AMBER LEAD / TEAMS EVEN / SAPPHIRE LEAD', false]
    ];
    return roles.map(([imageId, semanticRole, modded]) => ({
        imageId,
        relativeOrNamedLocalPath: null,
        sha256: '',
        width: null,
        height: null,
        semanticRole,
        sourceType: 'user_supplied_chat_attachment',
        locallyAccessible: false,
        commitAllowed: false,
        licenseStatus: 'user_supplied_for_project_analysis',
        mapVersionStatus: 'reported_current_and_match_compatible',
        modded,
        limitations: [
            'Image was referenced in the ChatGPT conversation but no matching local image file was found by Task 071.',
            'Place the file under .local/spatial-inputs/replay-009-user-maps/ for coordinate acquisition.'
        ],
        discoveryCandidatesConsidered: found.likely.length
    }));
}

function mainRecords() {
    const general = sourceProvenance();
    const replayContext = {
        replayId: 'replay_009',
        matchId: '91381179',
        userPlayedInMatch: true,
        playerName: 'Aresius',
        hero: 'Warden',
        approximateMatchDate: 'approximately one day before 2026-07-01',
        mapVisualCompatibilityStatement: 'Map visually matches the current map used by the player; no major map-layout changes were known between the match and current play.',
        updateRegressionStatement: 'Replay opened before a game update on 2026-06-30; after the update it began failing approximately 5-10 seconds after heroes left the zipline.',
        datePrecision: 'approximate_user_report',
        limitations: ['Replay date and update behavior are participant reports, not independently verified by Task 071.']
    };
    const video = {
        videoRecordedAtNormalSpeed: true,
        noSeeking: true,
        noAcceleration: true,
        noRewinding: true,
        noSkippedSections: true,
        replayTimelineVisible: true,
        minimapContinuouslyVisible: true,
        cameraRemainedAttachedToPlayer: true,
        fullMapViewOpened: false,
        minimapUsedCustomMod: true,
        limitations: ['Custom minimap is suitable for relative identity/search guidance, not automatically official or version-authoritative geometry.']
    };
    const orientation = {
        replayMinimapOrientationFixed: true,
        top: ['Archmother', 'Sapphire team', 'blue team'],
        bottom: ['Hidden King', 'Amber team', 'yellow team'],
        livePlayCaution: 'In normal live play, the minimap usually places the allied team at the bottom; in replay mode Archmother remains top and Hidden King remains bottom.',
        limitations: ['Do not confuse replay orientation with player-relative live orientation.']
    };
    const laneOrder = [
        { perspective: 'Archmother/Sapphire', left: 'Yellow lane', center: 'Blue lane', right: 'Green lane', sourceType: 'human_player_annotation', semanticStatus: 'human_semantic_annotation' },
        { perspective: 'Hidden King/Amber', left: 'Green lane', center: 'Blue lane', right: 'Yellow lane', sourceType: 'human_player_annotation', semanticStatus: 'human_semantic_annotation' }
    ];
    return { general, replayContext, video, orientation, laneOrder };
}

async function main() {
    const packet = mainRecords();
    const foundImages = discoverImages();
    const imageInventory = {
        schemaVersion: '1.0.0',
        generatedBy: GENERATED_BY,
        searchedRoots: ['repo root', 'input/', 'samples/', 'samples/images/', 'images/', '.local/', '.local/spatial-inputs/', 'output-local/', 'codex-attachments-root'],
        totalImagesSeen: foundImages.allCount,
        matchingUserMapImagesFound: 0,
        expectedImages: expectedImageRows(foundImages),
        likelyLocalCandidates: foundImages.likely.map(file => ({
            pathHint: file.replaceAll('\\', '/').replace(process.cwd().replaceAll('\\', '/'), 'repo:'),
            sizeBytes: statSync(file).size,
            limitations: ['Candidate name matched replay-009 map/urn terms but it is not one of the five user-supplied map images.']
        }))
    };

    const eventAnnotations = [
        event('human_event_0006_pause_lane_swap', '00:06', 'human_reported_pause_for_lane_swapping', 'reported', 'medium', 'Pause reportedly used for early lane swapping.', ['Does not establish full pause duration or explain the full 39.703s parser/reported duration difference.']),
        event('human_event_0135_enemy_green_guardian', '01:35', 'human_reported_enemy_green_lane_guardian_centered', 'direct', 'high', 'Enemy Green-lane Guardian centered on screen.'),
        event('human_event_0147_allied_green_guardian', '01:47', 'human_reported_allied_green_lane_guardian_centered', 'direct', 'high', 'Allied Green-lane Guardian centered on screen.'),
        event('human_event_1141_archmother_base', '11:41', 'human_reported_archmother_base_spawn', 'direct', 'high', 'Archmother base/spawn visible.'),
        event('human_event_1355_enemy_green_walker', '13:55', 'human_reported_enemy_green_lane_walker_centered', 'direct', 'high', 'Enemy Green-lane Walker centered on screen.'),
        event('human_event_1555_urn_pickup_site', '15:55', 'human_reported_spirit_urn_visible_pickup_site', 'direct', 'high', 'Spirit Urn visible at pickup site on left side; displayed value 2915 souls from Paige view.', ['Not parser-validated Urn state.']),
        event('human_event_1820_paige_picks_urn', '18:20', 'human_reported_paige_urn_pickup', 'direct', 'high', 'Allied Paige picks up Urn on right side to carry toward left.', ['Not parser-validated carry state.']),
        event('human_event_1847_urn_deposited', '18:47', 'human_reported_urn_deposited', 'custom_minimap_only', 'medium', 'Urn deposited on left side, observed through minimap rather than direct camera.', ['Do not label as canonical Urn deposit.']),
        event('human_event_1906_allied_green_walker', '19:06', 'human_reported_allied_green_lane_walker_visible', 'direct', 'high', 'Allied Green-lane Walker visible.'),
        event('human_event_1910_urn_claimed_hidden_king', '19:10', 'human_reported_urn_claimed_hidden_king_koth', 'reported', 'medium', 'Urn claimed by Hidden King/enemy team in King of the Hill.', ['Not parser-validated objective claim.']),
        event('human_event_2235_allied_blue_walker', '22:35', 'human_reported_allied_blue_lane_walker_visible', 'direct', 'high', 'Allied Blue-lane Walker visible.'),
        event('human_event_2450_mid_boss_visible', '24:50', 'human_reported_mid_boss_visible', 'direct', 'high', 'Mid Boss visible; preceding section shows route toward it.'),
        event('human_event_2515_mid_boss_defeated', '25:15', 'human_reported_mid_boss_defeated', 'reported', 'medium', 'Participant reports Mid Boss death/destruction.', ['Do not label as canonical mid_boss_killed.']),
        event('human_event_2517_rejuvenator_descends', '25:17', 'human_reported_rejuvenator_descending', 'direct', 'high', 'Rejuvenator begins descending where Mid Boss was.'),
        event('human_event_2520_rejuvenator_claimable', '25:20', 'human_reported_rejuvenator_claimable_and_taken', 'direct', 'high', 'Rejuvenator reaches ground and becomes claimable; Archmother team takes three charges.', ['Not parser-validated Rejuvenator claim/effect.']),
        event('human_event_2723_hidden_king_base', '27:23', 'human_reported_hidden_king_enemy_base', 'direct', 'high', 'Hidden King enemy base visible.'),
        event('human_event_late_wraith_disconnect', null, 'human_reported_enemy_wraith_disconnect', 'reported', 'low', 'Enemy Wraith reportedly disconnected shortly before match end.', ['Do not create parser disconnect event without technical evidence.'])
    ];

    const landmarkAnnotations = {
        schemaVersion: '1.0.0',
        generatedBy: GENERATED_BY,
        source: sourceProvenance(),
        stableLandmarks: [
            {
                landmarkType: 'mid_boss',
                statements: [
                    'Located exactly at the visual center of the map.',
                    'Located underground on the lowest relevant level.',
                    'Accessed by stairs adjacent to the center.',
                    'Marked on minimap by a golden/yellow angel symbol.',
                    'Similar angel symbols point toward stair access.',
                    'Location has not changed relative to the current map.'
                ],
                coordinateAvailable: false
            },
            {
                landmarkType: 'walker',
                statements: [
                    'Six fixed Walker positions.',
                    'Positions are mirrored rather than perfectly symmetric.',
                    'One Walker per lane per team.',
                    'Lane line passes through the large Walker diamond on the minimap.',
                    'Team can be identified by side or color.',
                    'Positions have not changed relative to the current map.'
                ],
                coordinateAvailable: false
            },
            {
                landmarkType: 'lane_guardian',
                statements: [
                    'One Guardian per lane per team.',
                    'Small diamonds near the map midline/equator.',
                    'Lane line passes through the corresponding Guardian.',
                    'Positions have not changed.',
                    'Guardian visual model is humanoid, grey, armored, and holds a large staff.'
                ],
                coordinateAvailable: false
            },
            {
                landmarkType: 'patron_base_structures',
                statements: [
                    'Patron represented by a diamond covered by a semicircle at top or bottom.',
                    'Weakened Patron occupies same location after Patron state transition.',
                    'Two smaller hollow diamonds are Shrines.',
                    'Three nearby smaller diamonds correspond to three base Guardians.'
                ],
                coordinateAvailable: false,
                limitations: ['Internal class mappings remain unresolved.']
            }
        ],
        orientation: packet.orientation,
        laneOrder: packet.laneOrder
    };

    const mechanicsAnnotations = [
        mechanic('mechanic_urn_spawn_after_10', 'spirit_urn', 'After 10 minutes, Soul Urn spawns in one of six possible locations.'),
        mechanic('mechanic_urn_neutral_bridge', 'spirit_urn', 'Neutral Urn location is next to the bridge in either Yellow or Green lane.'),
        mechanic('mechanic_urn_favored', 'spirit_urn', "Favored Urn location is next to a jungle camp near either the favored team's Yellow or Green Walker."),
        mechanic('mechanic_urn_unfavored', 'spirit_urn', "Unfavored Urn location is next to a jungle camp near either the enemy team's Yellow or Green Walker."),
        mechanic('mechanic_urn_respawn_alternates', 'spirit_urn', 'The Urn respawns and alternates lanes every five minutes.'),
        mechanic('mechanic_urn_delayed_respawn', 'spirit_urn', 'If picked up before a scheduled spawn time and delivered after it, it does not spawn again until the next scheduled spawn time.'),
        mechanic('mechanic_urn_descends', 'spirit_urn', 'The Urn descends from the sky for 12 seconds before becoming available.'),
        mechanic('mechanic_urn_melee_pickup', 'spirit_urn', 'A landed Urn is picked up using a melee attack.'),
        mechanic('mechanic_rejuv_visual', 'rejuvenator', 'Rejuvenator appears as a green crystal with green aura and contains the golden angel symbol.'),
        mechanic('mechanic_rejuv_descends', 'rejuvenator', 'Rejuvenator descends where Mid Boss was and becomes claimable after reaching the ground.'),
        mechanic('mechanic_rejuv_three_charges', 'rejuvenator', 'Rejuvenator may be claimed three times using heavy melee; each claimed charge grants a team member a personal Rejuvenator buff.'),
        mechanic('mechanic_rejuv_personal_consumption', 'rejuvenator', 'On death, a player consumes one personal buff; one player cannot consume more than the buff they possess.'),
        mechanic('hypothesis_personal_rejuvenator_class', 'rejuvenator', 'CCitadel_ArmorUpgrade_PersonalRejuvenator may represent the personal post-claim buff.', 'hypothesis', ['Treat as hypothesis, not confirmed class mapping.'])
    ];
    const classUncertainty = [
        'user does not recognize the internal entity classes directly',
        'CNPC_Boss_Tier2 may correspond to Walker',
        'Guardian may conceptually be Tier 1',
        'CCitadel_ArmorUpgrade_PersonalRejuvenator may represent the individual buff',
        'CNPC_BarrackBoss identity unresolved',
        'CNPC_Boss_Tier3 identity unresolved',
        'CNPC_TrooperBoss identity unresolved'
    ];

    const annotationPacket = {
        schemaVersion: '1.0.0',
        generatedBy: GENERATED_BY,
        source: packet.general,
        replayContext: packet.replayContext,
        videoRecording: packet.video,
        orientation: packet.orientation,
        laneOrder: packet.laneOrder,
        eventAnnotationCount: eventAnnotations.length,
        mechanicsAnnotationCount: mechanicsAnnotations.length,
        annotationHash: hashText({ eventAnnotations, mechanicsAnnotations, landmarkAnnotations })
    };
    const annotationGate = {
        schemaVersion: '1.0.0',
        generatedBy: GENERATED_BY,
        gate: 'replay_009_human_annotation_packet_ingested_with_missing_images',
        reason: 'Text annotation packet was ingested; five referenced map/minimap images were not locally accessible.'
    };
    const annotationSummary = {
        schemaVersion: '1.0.0',
        generatedBy: GENERATED_BY,
        participant: 'Aresius',
        hero: 'Warden',
        replayDateStatus: 'approximate',
        pauseAnnotationStatus: 'ingested_human_report',
        eventAnnotations: eventAnnotations.length,
        mechanicsAnnotations: mechanicsAnnotations.length,
        imagesFound: 0,
        canonicalFactsOverwritten: false,
        parserSecondsAssignedFromHumanTimes: false,
        currentMechanicsAppliedToBuild23916427: false,
        limitations: ['Image files were not accessible locally, so no pixel coordinates were measured.']
    };

    const imageGeometry = {
        schemaVersion: '1.0.0',
        generatedBy: GENERATED_BY,
        images: imageInventory.expectedImages.map(image => ({
            imageId: image.imageId,
            locallyAccessible: false,
            width: null,
            height: null,
            circularMapBounds: null,
            mapCenterPixels: null,
            visibleOrientation: 'reported_by_human_annotation',
            topBaseIdentity: 'Archmother/Sapphire/blue',
            bottomBaseIdentity: 'Hidden King/Amber/yellow',
            cropped: null,
            obscuredByGameplayIcons: null,
            obscuredByResourceMarkers: null,
            aspectRatioPreserved: null,
            limitations: image.limitations
        }))
    };
    const emptyCoordinates = {
        schemaVersion: '1.0.0',
        generatedBy: GENERATED_BY,
        landmarks: [],
        reason: 'No locally accessible user map images or coordinate-bearing map resources were found.'
    };
    const moddedComparison = {
        schemaVersion: '1.0.0',
        generatedBy: GENERATED_BY,
        classification: 'not_evaluable',
        customImagesFound: 0,
        standardImagesFound: 0,
        comparisons: [],
        limitations: ['The five referenced images are not present locally.']
    };
    const sourceInventory = {
        schemaVersion: '1.0.0',
        generatedBy: GENERATED_BY,
        sources: [
            {
                sourceId: SOURCE_ID,
                sourceType: 'human_player_annotation',
                authority: 'advisory',
                available: true,
                mayGuideSearch: true,
                mayDirectlyValidateTransform: false
            },
            {
                sourceId: 'user_supplied_chat_map_images',
                sourceType: 'user_supplied_chat_attachment',
                available: false,
                expectedCount: 5,
                mayGuideSearch: true,
                mayDirectlyValidateTransform: false,
                limitations: ['Referenced in conversation but not accessible as local files to Codex.']
            }
        ]
    };
    const accepted = {
        schemaVersion: '1.0.0',
        generatedBy: GENERATED_BY,
        landmarks: [],
        reservedValidationAnchor: null,
        reason: 'No pixel or map coordinates were measured.'
    };
    const rejected = {
        schemaVersion: '1.0.0',
        generatedBy: GENERATED_BY,
        landmarks: [
            {
                landmarkId: 'all_human_text_landmarks_without_local_image',
                reason: 'Human text supports identity and search, but not exact coordinates.',
                affectedTypes: ['mid_boss', 'walker', 'guardian', 'patron_base', 'urn_spawn'],
                rejectedForFit: true
            }
        ]
    };
    const distribution = {
        schemaVersion: '1.0.0',
        generatedBy: GENERATED_BY,
        central: 0,
        upperHalf: 0,
        lowerHalf: 0,
        lateral: 0,
        acceptedCount: 0,
        distributionStatus: 'not_available',
        readyThresholdMet: false
    };
    const provenance = {
        schemaVersion: '1.0.0',
        generatedBy: GENERATED_BY,
        coordinateRecords: [],
        annotationSource: packet.general,
        imageCommitPolicy: 'do_not_commit_source_images_without_explicit_authorization',
        limitations: ['No coordinate provenance exists because image files were absent.']
    };
    const humanVideoCorrelation = {
        schemaVersion: '1.0.0',
        generatedBy: GENERATED_BY,
        videoAvailable: existsSync('samples/videos/replay_009_independent_validation.mp4.mp4'),
        records: eventAnnotations.map(row => ({
            annotationEventId: row.annotationEventId,
            humanReportedGameTime: row.humanReportedGameTime,
            videoSeconds: null,
            visibleTimelineReading: '',
            correlationStatus: 'not_checked',
            identityObserved: [],
            limitations: ['Task 071 did not perform bounded video frame review because coordinate acquisition was blocked by missing map images.']
        }))
    };
    const acquisitionGate = {
        schemaVersion: '1.0.0',
        generatedBy: GENERATED_BY,
        gate: 'replay_009_independent_landmark_coordinates_missing',
        reason: 'Text annotations were ingested, but the five user-supplied map images were not locally accessible and no independent map-side coordinates could be measured.',
        requiredUserAction: {
            directory: '.local/spatial-inputs/replay-009-user-maps/',
            filenames: [
                'replay-009-custom-map-dense.jpg',
                'replay-009-custom-map-reduced.jpg',
                'replay-009-custom-map-clean.jpg',
                'replay-009-standard-minimap.jpg',
                'replay-009-urn-spawn-diagram.png'
            ]
        }
    };
    const acquisitionSummary = {
        schemaVersion: '1.0.0',
        generatedBy: GENERATED_BY,
        humanAnnotationGate: annotationGate.gate,
        participant: 'Aresius',
        hero: 'Warden',
        replayDateStatus: 'approximate',
        pauseAnnotationStatus: 'ingested_human_report',
        humanEventAnnotations: eventAnnotations.length,
        mechanicsAnnotations: mechanicsAnnotations.length,
        imageFilesFound: 0,
        imageRolesIdentified: 0,
        moddedStandardComparison: 'not_evaluable',
        mapLandmarksMeasured: 0,
        acceptedLandmarks: 0,
        rejectedLandmarks: 1,
        distribution: distribution.distributionStatus,
        preRegisteredValidationAnchor: null,
        humanVideoCorrelationsCompleted: 0,
        transformFitted: false,
        lanesRegionsProximityEmitted: false,
        mechanicEffectsApplied: 0,
        gate: acquisitionGate.gate,
        protections: {
            canonicalFactsOverwritten: false,
            replay005Read: false,
            replay005Processed: false,
            botFixturesProcessed: false,
            mapAssetCommitted: false
        }
    };

    await writeJson('schemas/replay-human-annotation.schema.json', {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        title: 'Replay Human Annotation Packet',
        type: 'object',
        required: ['schemaVersion', 'source', 'replayContext'],
        properties: {
            schemaVersion: { type: 'string' },
            source: { type: 'object' },
            replayContext: { type: 'object' },
            eventAnnotationCount: { type: 'number' },
            mechanicsAnnotationCount: { type: 'number' }
        },
        additionalProperties: true
    });
    await writeJson(`${ANNO_OUT}/annotation-packet.json`, annotationPacket);
    await writeJson(`${ANNO_OUT}/event-annotations.json`, { schemaVersion: '1.0.0', generatedBy: GENERATED_BY, source: packet.general, events: eventAnnotations });
    await writeJson(`${ANNO_OUT}/landmark-annotations.json`, landmarkAnnotations);
    await writeJson(`${ANNO_OUT}/mechanics-annotations.json`, { schemaVersion: '1.0.0', generatedBy: GENERATED_BY, source: sourceProvenance({ sourceType: 'human_mechanics_statement' }), mechanics: mechanicsAnnotations, internalClassUncertainty: classUncertainty });
    await writeJson(`${ANNO_OUT}/image-source-inventory.json`, imageInventory);
    await writeJson(`${ANNO_OUT}/annotation-summary.json`, annotationSummary);
    await writeJson(`${ANNO_OUT}/annotation-gate.json`, annotationGate);
    await writeJson(`${ANNO_OUT}/human-video-timestamp-correlation.json`, humanVideoCorrelation);
    await writeText(`${ANNO_OUT}/README.md`, `# Replay 009 Human Annotations\n\nTask 071 ingested the user-provided participant annotation packet as advisory human evidence. It does not overwrite canonical parser facts, convert human game times to parser seconds, apply mechanics, or validate exact coordinates.\n\nGate: \`${annotationGate.gate}\`\n\nThe five referenced map/minimap images were not locally accessible. Place them under \`.local/spatial-inputs/replay-009-user-maps/\` using the semantic filenames listed in the independent-landmark acquisition gate.\n`);

    await writeJson(`${LANDMARK_OUT}/source-inventory.json`, sourceInventory);
    await writeJson(`${LANDMARK_OUT}/image-geometry-inventory.json`, imageGeometry);
    await writeJson(`${LANDMARK_OUT}/map-image-landmark-coordinates.json`, emptyCoordinates);
    await writeJson(`${LANDMARK_OUT}/modded-standard-map-comparison.json`, moddedComparison);
    await writeJson(`${LANDMARK_OUT}/accepted-map-landmarks.json`, accepted);
    await writeJson(`${LANDMARK_OUT}/rejected-map-landmarks.json`, rejected);
    await writeJson(`${LANDMARK_OUT}/landmark-distribution-audit.json`, distribution);
    await writeJson(`${LANDMARK_OUT}/provenance-audit.json`, provenance);
    await writeJson(`${LANDMARK_OUT}/acquisition-summary.json`, acquisitionSummary);
    await writeJson(`${LANDMARK_OUT}/acquisition-gate.json`, acquisitionGate);
    await writeText(`${LANDMARK_OUT}/README.md`, `# Replay 009 Independent Landmark Coordinates\n\nTask 071 did not acquire independent landmark coordinates because the five user-supplied map images are not available as local files.\n\nGate: \`${acquisitionGate.gate}\`\n\nRequired placement:\n\n\`\`\`text\n.local/spatial-inputs/replay-009-user-maps/replay-009-custom-map-dense.jpg\n.local/spatial-inputs/replay-009-user-maps/replay-009-custom-map-reduced.jpg\n.local/spatial-inputs/replay-009-user-maps/replay-009-custom-map-clean.jpg\n.local/spatial-inputs/replay-009-user-maps/replay-009-standard-minimap.jpg\n.local/spatial-inputs/replay-009-user-maps/replay-009-urn-spawn-diagram.png\n\`\`\`\n\nNo transform, lane, region, proximity, mechanic-effect, or macro output is produced.\n`);
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
