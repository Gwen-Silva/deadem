#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const TASK_ID = '072';
const GENERATED_BY = 'tools/measure-replay-009-user-map-landmarks.mjs';
const INPUT_DIR = '.local/spatial-inputs/replay-009-user-maps';
const OUT_DIR = 'output/replay-009-landmark-measurement';
const REPORT_PATH = 'reports/replay-009-user-map-landmark-measurement.md';
const TODAY = '2026-07-01';
const GATE = 'replay_009_independent_landmark_coordinates_ready_with_limitations';

function stableJson(value) {
    return `${JSON.stringify(value, null, 2)}\n`;
}

async function writeJson(file, value) {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, stableJson(value));
}

async function writeText(file, value) {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, value);
}

function sha256(buffer) {
    return createHash('sha256').update(buffer).digest('hex');
}

function readPngDimensions(buffer) {
    if (buffer.length < 24) return null;
    if (buffer.toString('ascii', 1, 4) !== 'PNG') return null;
    return {
        width: buffer.readUInt32BE(16),
        height: buffer.readUInt32BE(20),
        format: 'png'
    };
}

function readJpegDimensions(buffer) {
    if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
    let offset = 2;
    while (offset < buffer.length) {
        if (buffer[offset] !== 0xff) {
            offset += 1;
            continue;
        }
        const marker = buffer[offset + 1];
        offset += 2;
        if (marker === 0xd9 || marker === 0xda) break;
        if (offset + 2 > buffer.length) break;
        const length = buffer.readUInt16BE(offset);
        if (length < 2 || offset + length > buffer.length) break;
        const isSof = [
            0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7,
            0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf
        ].includes(marker);
        if (isSof && length >= 7) {
            return {
                width: buffer.readUInt16BE(offset + 5),
                height: buffer.readUInt16BE(offset + 3),
                format: 'jpeg'
            };
        }
        offset += length;
    }
    return null;
}

function readWebpDimensions(buffer) {
    if (buffer.length < 30) return null;
    if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WEBP') return null;
    const chunk = buffer.toString('ascii', 12, 16);
    if (chunk === 'VP8X') {
        return {
            width: 1 + buffer.readUIntLE(24, 3),
            height: 1 + buffer.readUIntLE(27, 3),
            format: 'webp'
        };
    }
    return { width: null, height: null, format: 'webp' };
}

function readImageInfo(file) {
    const buffer = readFileSync(file);
    const dimensions = readPngDimensions(buffer) ?? readJpegDimensions(buffer) ?? readWebpDimensions(buffer) ?? {
        width: null,
        height: null,
        format: path.extname(file).replace('.', '').toLowerCase() || 'unknown'
    };
    return {
        sha256: sha256(buffer),
        sizeBytes: buffer.length,
        ...dimensions
    };
}

function safeRelative(file) {
    return file.replaceAll('\\', '/');
}

function classifyRole(filename) {
    const lower = filename.toLowerCase();
    if (lower.includes('standard') || lower.includes('replay-minimap')) return 'replay_observed_standard_minimap';
    if (lower.includes('landmarks')) return 'derived_landmark_map';
    if (lower.includes('urn')) return 'mechanic_spawn_diagram';
    if (lower.includes('modded') || lower.includes('overlay')) return 'user_modded_minimap';
    return 'unknown';
}

function imageIdFor(filename, index) {
    const lower = filename.toLowerCase();
    if (lower.includes('standard')) return 'img_standard_replay_minimap';
    if (lower.includes('landmarks')) return 'img_derived_landmark_map';
    if (lower.includes('urn')) return 'img_urn_spawn_diagram';
    if (lower.includes('reduced')) return 'img_modded_reduced_overlay';
    if (lower.includes('_01')) return 'img_modded_full_overlay_01';
    if (lower.includes('_02')) return 'img_modded_full_overlay_02';
    if (lower.includes('_03')) return 'img_modded_full_overlay_03';
    if (lower.includes('_04')) return 'img_modded_full_overlay_04';
    return `img_unknown_${String(index + 1).padStart(2, '0')}`;
}

function directnessFor(role) {
    if (role === 'replay_observed_standard_minimap') return 'direct_visual_replay_evidence';
    if (role === 'mechanic_spawn_diagram') return 'diagram_derived';
    if (role === 'derived_landmark_map') return 'derived_visual_aid';
    if (role === 'user_modded_minimap') return 'modded_derived';
    return 'unknown';
}

function calibrationSuitability(role) {
    if (role === 'replay_observed_standard_minimap') return 'usable_with_high_pixel_uncertainty';
    if (role === 'derived_landmark_map') return 'usable_as_high_resolution_support_after_standard_registration';
    if (role === 'user_modded_minimap') return 'supporting_only_due_to_modded_overlays';
    if (role === 'mechanic_spawn_diagram') return 'not_usable_for_transform_fit';
    return 'not_evaluated';
}

function inventoryImages() {
    if (!existsSync(INPUT_DIR)) return [];
    return readdirSync(INPUT_DIR, { withFileTypes: true })
        .filter(entry => entry.isFile() && /\.(png|jpe?g|webp)$/i.test(entry.name))
        .map((entry, index) => {
            const relativePath = safeRelative(path.join(INPUT_DIR, entry.name));
            const info = readImageInfo(relativePath);
            const sourceRole = classifyRole(entry.name);
            return {
                imageId: imageIdFor(entry.name, index),
                relativePath,
                filename: entry.name,
                sha256: info.sha256,
                sizeBytes: info.sizeBytes,
                dimensions: { width: info.width, height: info.height },
                format: info.format,
                sourceRole,
                directOrDerivedStatus: directnessFor(sourceRole),
                believedReplayBuildRelationship: sourceRole === 'replay_observed_standard_minimap'
                    ? 'direct replay-009 minimap frame supplied by participant'
                    : 'participant-supplied current/modded/reference image; build relationship advisory only',
                coordinateOriginConvention: {
                    origin: 'top_left',
                    xDirection: 'rightward',
                    yDirection: 'downward',
                    normalizedX: 'x / image width',
                    normalizedY: 'y / image height',
                    measuredPoint: 'symbol_center'
                },
                orientation: {
                    top: 'Archmother/Sapphire per participant annotation',
                    bottom: 'Hidden King/Amber per participant annotation',
                    confidence: sourceRole === 'unknown' ? 'unknown' : 'supported_by_human_annotation'
                },
                cropping: sourceRole === 'replay_observed_standard_minimap'
                    ? 'square circular replay minimap crop'
                    : sourceRole === 'derived_landmark_map'
                        ? 'wide image with full circular map and side padding'
                        : 'varies_by_user_supplied_image',
                scaling: 'pixel scale is image-specific; no metric scale assumed',
                modificationStatus: sourceRole === 'replay_observed_standard_minimap'
                    ? 'standard replay minimap screenshot'
                    : sourceRole === 'mechanic_spawn_diagram'
                        ? 'derived diagram'
                        : 'modified or derived minimap visual aid',
                suitabilityForCalibration: calibrationSuitability(sourceRole),
                commitAllowed: false,
                limitations: [
                    'Image file remains local-only and untracked.',
                    'Pixel coordinates are visual measurements, not official map coordinates.',
                    'No world-to-map transform is fitted by Task 072.'
                ]
            };
        }).sort((a, b) => a.filename.localeCompare(b.filename));
}

function normalizeCoordinate(point, image) {
    return {
        x: Number((point.x / image.dimensions.width).toFixed(6)),
        y: Number((point.y / image.dimensions.height).toFixed(6))
    };
}

function point(id, imageId, type, team, lane, x, y, uncertainty, evidence, identityStatus, directness, fit, validation, limitations = []) {
    return {
        landmarkId: id,
        imageId,
        landmarkType: type,
        team,
        lane,
        pixelCoordinate: { x, y },
        normalizedCoordinate: { x: null, y: null },
        uncertaintyRadiusPixels: uncertainty,
        identificationEvidence: evidence,
        identityStatus,
        directness,
        usableForFit: fit,
        usableForValidation: validation,
        limitations
    };
}

function measuredLandmarks() {
    const standard = 'img_standard_replay_minimap';
    const derived = 'img_derived_landmark_map';
    return [
        point('standard_mid_boss_center', standard, 'mid_boss_center', 'neutral', null, 190, 191, 6, ['golden angel symbol at map center', 'participant reports Mid Boss at exact visual center'], 'confirmed_by_participant', 'replay_observed', true, false),
        point('standard_sapphire_yellow_walker', standard, 'walker', 'sapphire', 'yellow', 86, 87, 8, ['large fixed diamond on upper-left lane', 'participant reports one Walker per lane per team'], 'supported', 'replay_observed', true, false),
        point('standard_sapphire_blue_walker', standard, 'walker', 'sapphire', 'blue', 219, 131, 8, ['large fixed diamond on upper-center lane', 'participant reports one Walker per lane per team'], 'supported', 'replay_observed', false, true),
        point('standard_sapphire_green_walker', standard, 'walker', 'sapphire', 'green', 302, 88, 8, ['large fixed diamond on upper-right lane', 'participant reports one Walker per lane per team'], 'supported', 'replay_observed', true, false),
        point('standard_amber_yellow_walker', standard, 'walker', 'amber', 'yellow', 81, 283, 8, ['large fixed diamond on lower-left lane', 'participant reports one Walker per lane per team'], 'supported', 'replay_observed', true, false),
        point('standard_amber_blue_walker', standard, 'walker', 'amber', 'blue', 160, 247, 8, ['large fixed diamond on lower-center lane', 'participant reports one Walker per lane per team'], 'supported', 'replay_observed', true, false),
        point('standard_amber_green_walker', standard, 'walker', 'amber', 'green', 303, 283, 8, ['large fixed diamond on lower-right lane', 'participant reports one Walker per lane per team'], 'supported', 'replay_observed', false, true),
        point('standard_sapphire_patron', standard, 'patron_or_base_center', 'sapphire', null, 190, 24, 9, ['top base semicircle/diamond symbol', 'participant reports Archmother/Sapphire at top'], 'supported', 'replay_observed', false, false, ['Patron/base internal class identity remains unresolved.']),
        point('standard_amber_patron', standard, 'patron_or_base_center', 'amber', null, 190, 359, 9, ['bottom base semicircle/diamond symbol', 'participant reports Hidden King/Amber at bottom'], 'supported', 'replay_observed', false, false, ['Patron/base internal class identity remains unresolved.']),
        point('derived_mid_boss_center', derived, 'mid_boss_center', 'neutral', null, 561, 443, 5, ['golden angel symbol at visual center on clean landmark map', 'matches standard replay minimap center'], 'confirmed_by_participant', 'modded_derived', true, false),
        point('derived_sapphire_yellow_walker', derived, 'walker', 'sapphire', 'yellow', 326, 240, 7, ['large fixed diamond on upper-left lane', 'same relative position as standard minimap'], 'supported', 'modded_derived', true, false),
        point('derived_sapphire_blue_walker', derived, 'walker', 'sapphire', 'blue', 624, 309, 8, ['large fixed diamond on upper-center lane', 'same relative position as standard minimap'], 'supported', 'modded_derived', false, true),
        point('derived_sapphire_green_walker', derived, 'walker', 'sapphire', 'green', 824, 242, 7, ['large fixed diamond on upper-right lane', 'same relative position as standard minimap'], 'supported', 'modded_derived', true, false),
        point('derived_amber_yellow_walker', derived, 'walker', 'amber', 'yellow', 287, 609, 7, ['large fixed diamond on lower-left lane', 'same relative position as standard minimap'], 'supported', 'modded_derived', true, false),
        point('derived_amber_blue_walker', derived, 'walker', 'amber', 'blue', 494, 576, 8, ['large fixed diamond on lower-center lane', 'same relative position as standard minimap'], 'supported', 'modded_derived', true, false),
        point('derived_amber_green_walker', derived, 'walker', 'amber', 'green', 797, 660, 7, ['large fixed diamond on lower-right lane', 'same relative position as standard minimap'], 'supported', 'modded_derived', false, true),
        point('derived_sapphire_yellow_guardian', derived, 'guardian', 'sapphire', 'yellow', 255, 358, 10, ['small fixed diamond near upper-left midline', 'participant reports one Guardian per lane per team'], 'candidate', 'modded_derived', false, false, ['Guardian pairing to replay-side entities is not preregistered for transform fitting.']),
        point('derived_sapphire_blue_guardian', derived, 'guardian', 'sapphire', 'blue', 551, 399, 14, ['small fixed diamond on central lane path', 'participant reports one Guardian per lane per team'], 'candidate', 'modded_derived', false, false, ['Coordinate is less visually distinct than Walker landmarks.']),
        point('derived_sapphire_green_guardian', derived, 'guardian', 'sapphire', 'green', 908, 363, 10, ['small fixed diamond near upper-right midline', 'participant reports one Guardian per lane per team'], 'candidate', 'modded_derived', false, false, ['Guardian pairing to replay-side entities is not preregistered for transform fitting.']),
        point('derived_amber_yellow_guardian', derived, 'guardian', 'amber', 'yellow', 221, 496, 10, ['small fixed diamond near lower-left midline', 'participant reports one Guardian per lane per team'], 'candidate', 'modded_derived', false, false, ['Guardian pairing to replay-side entities is not preregistered for transform fitting.']),
        point('derived_amber_blue_guardian', derived, 'guardian', 'amber', 'blue', 565, 690, 12, ['small fixed diamond on lower central lane path', 'participant reports one Guardian per lane per team'], 'candidate', 'modded_derived', false, false, ['Coordinate is less visually distinct than Walker landmarks.']),
        point('derived_amber_green_guardian', derived, 'guardian', 'amber', 'green', 854, 512, 10, ['small fixed diamond near lower-right midline', 'participant reports one Guardian per lane per team'], 'candidate', 'modded_derived', false, false, ['Guardian pairing to replay-side entities is not preregistered for transform fitting.']),
        point('derived_sapphire_patron', derived, 'patron_or_base_center', 'sapphire', null, 561, 112, 10, ['top base diamond under semicircle', 'participant reports Archmother/Sapphire at top'], 'supported', 'modded_derived', false, false, ['Patron/base internal class identity remains unresolved.']),
        point('derived_amber_patron', derived, 'patron_or_base_center', 'amber', null, 561, 765, 10, ['bottom base diamond under semicircle', 'participant reports Hidden King/Amber at bottom'], 'supported', 'modded_derived', false, false, ['Patron/base internal class identity remains unresolved.']),
        point('derived_sapphire_left_shrine', derived, 'shrine', 'sapphire', null, 490, 114, 8, ['small hollow diamond near top patron'], 'candidate', 'modded_derived', false, false, ['Shrine identity is human-annotated and not replay-side paired.']),
        point('derived_sapphire_right_shrine', derived, 'shrine', 'sapphire', null, 635, 113, 8, ['small hollow diamond near top patron'], 'candidate', 'modded_derived', false, false, ['Shrine identity is human-annotated and not replay-side paired.']),
        point('derived_amber_left_shrine', derived, 'shrine', 'amber', null, 489, 761, 8, ['small hollow diamond near bottom patron'], 'candidate', 'modded_derived', false, false, ['Shrine identity is human-annotated and not replay-side paired.']),
        point('derived_amber_right_shrine', derived, 'shrine', 'amber', null, 634, 761, 8, ['small hollow diamond near bottom patron'], 'candidate', 'modded_derived', false, false, ['Shrine identity is human-annotated and not replay-side paired.']),
        point('derived_sapphire_left_base_guardian', derived, 'base_guardian', 'sapphire', null, 486, 169, 8, ['small base diamond near top patron'], 'candidate', 'modded_derived', false, false, ['Base Guardian class mapping is not resolved.']),
        point('derived_sapphire_center_base_guardian', derived, 'base_guardian', 'sapphire', null, 561, 188, 8, ['small base diamond near top patron'], 'candidate', 'modded_derived', false, false, ['Base Guardian class mapping is not resolved.']),
        point('derived_sapphire_right_base_guardian', derived, 'base_guardian', 'sapphire', null, 633, 169, 8, ['small base diamond near top patron'], 'candidate', 'modded_derived', false, false, ['Base Guardian class mapping is not resolved.']),
        point('derived_amber_left_base_guardian', derived, 'base_guardian', 'amber', null, 487, 709, 8, ['small base diamond near bottom patron'], 'candidate', 'modded_derived', false, false, ['Base Guardian class mapping is not resolved.']),
        point('derived_amber_center_base_guardian', derived, 'base_guardian', 'amber', null, 561, 691, 8, ['small base diamond near bottom patron'], 'candidate', 'modded_derived', false, false, ['Base Guardian class mapping is not resolved.']),
        point('derived_amber_right_base_guardian', derived, 'base_guardian', 'amber', null, 634, 709, 8, ['small base diamond near bottom patron'], 'candidate', 'modded_derived', false, false, ['Base Guardian class mapping is not resolved.'])
    ];
}

function attachNormalization(records, images) {
    const byId = new Map(images.map(image => [image.imageId, image]));
    return records.map(record => {
        const image = byId.get(record.imageId);
        if (!image || !image.dimensions.width || !image.dimensions.height) return record;
        return {
            ...record,
            normalizedCoordinate: normalizeCoordinate(record.pixelCoordinate, image)
        };
    });
}

function orientationAnnotations() {
    return {
        schemaVersion: '1.0.0',
        taskId: TASK_ID,
        generatedBy: GENERATED_BY,
        evidenceType: 'human_annotation',
        authority: 'advisory',
        assertions: [
            'Replay minimap is fixed.',
            'Archmother / Sapphire is at the top.',
            'Hidden King / Amber is at the bottom.',
            'The current normal in-game minimap usually rotates or orients allied team to the bottom.',
            'From Archmother perspective, lanes left-to-right are Yellow, Blue, Green.',
            'From Hidden King perspective, lanes left-to-right are Green, Blue, Yellow.',
            'Mid Boss is at the exact center, underground.',
            'Mid Boss symbol is the golden angel.',
            'Walkers are fixed and mirrored, not perfectly symmetric.',
            'Guardians are fixed, one per lane.',
            'Patron, shrines, and base guardians have distinct minimap symbols.'
        ],
        limitations: [
            'These annotations guide landmark identity but do not validate a replay world-to-map transform.',
            'Human annotation is advisory and not exact metric geometry.'
        ]
    };
}

function roleClassification(images) {
    return {
        schemaVersion: '1.0.0',
        taskId: TASK_ID,
        generatedBy: GENERATED_BY,
        images: images.map(image => ({
            imageId: image.imageId,
            filename: image.filename,
            sourceRole: image.sourceRole,
            directOrDerivedStatus: image.directOrDerivedStatus,
            calibrationSuitability: image.suitabilityForCalibration,
            roleConfidence: image.sourceRole === 'unknown' ? 'unknown' : 'supported',
            limitations: image.limitations
        })),
        roleCounts: Object.fromEntries([...new Set(images.map(image => image.sourceRole))].sort()
            .map(role => [role, images.filter(image => image.sourceRole === role).length]))
    };
}

function crossImageRegistration() {
    return {
        schemaVersion: '1.0.0',
        taskId: TASK_ID,
        generatedBy: GENERATED_BY,
        result: 'same_underlying_geometry_with_crop_scale_limitations',
        minimapLikeImagesCompared: [
            'img_standard_replay_minimap',
            'img_derived_landmark_map',
            'img_modded_reduced_overlay',
            'img_modded_full_overlay_01',
            'img_modded_full_overlay_02',
            'img_modded_full_overlay_03',
            'img_modded_full_overlay_04'
        ],
        sharedProperties: {
            orientation: 'supported_same_top_bottom_orientation',
            underlyingFixedLandmarkLayout: 'supported_by_mid_boss_walkers_base_symbols',
            aspectRatio: 'not_identical',
            crop: 'not_identical',
            scale: 'not_identical',
            center: 'supported_within_visual_uncertainty',
            projection: 'not_metric_or_world_transform'
        },
        stableVisualLandmarksUsed: [
            'Mid Boss center golden angel',
            'six Walker diamonds',
            'top and bottom base/Patron symbols',
            'major lane-line geometry'
        ],
        projectedAnnotationsBetweenImages: false,
        limitations: [
            'Registration is visual and qualitative. It supports identity consistency, not a pixel-perfect image transform.',
            'The derived/modded maps remain non-authoritative visual aids.',
            'No replay world coordinate was projected into any image.'
        ]
    };
}

function loadEntityKeys() {
    const file = 'output/replay-009-states/objective-structure-entity-keys.json';
    if (!existsSync(file)) return { midBoss: [], walkers: [] };
    const data = JSON.parse(readFileSync(file, 'utf8'));
    return {
        midBoss: data.entities.filter(row => row.mechanicId === 'mid_boss').map(row => row.entityKey),
        walkers: data.entities.filter(row => row.mechanicId === 'walker').map(row => row.entityKey)
    };
}

function correspondenceCandidates(entityKeys) {
    const walkerLandmarks = [
        'standard_sapphire_yellow_walker',
        'standard_sapphire_blue_walker',
        'standard_sapphire_green_walker',
        'standard_amber_yellow_walker',
        'standard_amber_blue_walker',
        'standard_amber_green_walker'
    ];
    return {
        schemaVersion: '1.0.0',
        taskId: TASK_ID,
        generatedBy: GENERATED_BY,
        candidates: [
            {
                candidateId: 'corr_mid_boss_center',
                landmarkType: 'mid_boss_center',
                mapLandmarkIds: ['standard_mid_boss_center', 'derived_mid_boss_center'],
                replayEntityKeys: entityKeys.midBoss,
                identityEvidence: ['CNPC_MidBoss class confirmed in replay outputs', 'human annotation places Mid Boss at exact visual center'],
                identityConfidence: 'supported',
                coordinateIndependence: 'independent_map_image_coordinate_vs_parser_entity_coordinate',
                role: 'fit_candidate',
                limitations: ['Two Mid Boss generations share the same fixed map landmark; future task must select entity generation/time window before fitting.']
            },
            {
                candidateId: 'corr_six_walkers_unordered',
                landmarkType: 'walker',
                mapLandmarkIds: walkerLandmarks,
                replayEntityKeys: entityKeys.walkers,
                identityEvidence: ['Six CNPC_Boss_Tier2 walker entities in replay outputs', 'six fixed Walker symbols measured on the map image'],
                identityConfidence: 'candidate',
                coordinateIndependence: 'independent_map_image_coordinate_vs_parser_entity_coordinate',
                role: 'fit_or_validation_candidate',
                limitations: [
                    'This task does not solve which replay Walker entity corresponds to which map-side Walker symbol.',
                    'Future transform task must ground pair identities before residual inspection and must not try permutations to minimize error.'
                ]
            }
        ],
        rejected: [
            {
                candidateId: 'rejected_spirit_urn_spawn_points',
                reason: 'Urn spawn diagram is mechanic/spawn-location evidence and is prohibited as a transform anchor in this task.'
            },
            {
                candidateId: 'rejected_player_icons',
                reason: 'Player and temporary unit icons are not fixed landmarks.'
            },
            {
                candidateId: 'rejected_boxes_statues_overlay_dots',
                reason: 'Boxes, golden statues, and overlay dots are not accepted fixed calibration anchors.'
            }
        ]
    };
}

function fitValidationPlan() {
    return {
        schemaVersion: '1.0.0',
        taskId: TASK_ID,
        generatedBy: GENERATED_BY,
        transformFitted: false,
        residualsComputed: false,
        anchorPlanStatus: 'pre_registered_for_future_task_with_limitations',
        candidateFitAnchors: [
            'standard_mid_boss_center',
            'standard_sapphire_yellow_walker',
            'standard_sapphire_green_walker',
            'standard_amber_yellow_walker',
            'standard_amber_blue_walker'
        ],
        reservedValidationAnchors: [
            'standard_sapphire_blue_walker',
            'standard_amber_green_walker'
        ],
        distribution: {
            central: 1,
            upper: 3,
            lower: 3,
            lateral: 4,
            status: 'distributed_with_visual_measurement_limitations'
        },
        prerequisitesForNextTask: [
            'Resolve or preregister exact replay Walker entity to map Walker landmark pairings before residual inspection.',
            'Reserve validation anchors before fitting.',
            'Retain build and image-source limitations.',
            'Do not use Spirit Urn candidates, player positions, symmetry-generated points, or deletion locations.'
        ],
        limitations: [
            'Anchor plan identifies map-side landmarks, not final replay-world correspondences.',
            'No transform can be called validated until held-out validation residuals are computed in a future task.'
        ]
    };
}

function summary(images, landmarks, plan) {
    const countByType = type => landmarks.filter(row => row.landmarkType === type).length;
    return {
        schemaVersion: '1.0.0',
        taskId: TASK_ID,
        generatedBy: GENERATED_BY,
        imagesFound: images.length,
        rolesClassified: roleClassification(images).roleCounts,
        standardReplayMinimapIdentified: images.some(image => image.sourceRole === 'replay_observed_standard_minimap'),
        moddedMapsIdentified: images.filter(image => image.sourceRole === 'user_modded_minimap').length,
        derivedLandmarkMapIdentified: images.some(image => image.sourceRole === 'derived_landmark_map'),
        urnDiagramIdentified: images.some(image => image.sourceRole === 'mechanic_spawn_diagram'),
        landmarkMeasurements: landmarks.length,
        midBossMeasurements: countByType('mid_boss_center'),
        walkerMeasurements: countByType('walker'),
        guardianMeasurements: countByType('guardian'),
        baseLandmarkMeasurements: landmarks.filter(row => ['patron_or_base_center', 'shrine', 'base_guardian'].includes(row.landmarkType)).length,
        crossImageRegistration: 'same_underlying_geometry_with_crop_scale_limitations',
        correspondenceCandidates: 2,
        fitAnchorsPlanned: plan.candidateFitAnchors.length,
        validationAnchorsReserved: plan.reservedValidationAnchors.length,
        rejectedLandmarkClasses: 3,
        transformFitted: false,
        lanesRegionsProximityEmitted: false,
        mechanicEffectsApplied: 0,
        gate: GATE,
        blockedTransformValidationContinuation: 'tasks/blocked/073-retry-replay-009-transform-validation-with-measured-landmarks.md',
        protections: {
            replay005Read: false,
            replay005Processed: false,
            botFixturesProcessed: false,
            userImagesCommitted: false
        }
    };
}

function gate(summaryData) {
    return {
        schemaVersion: '1.0.0',
        taskId: TASK_ID,
        gate: GATE,
        reason: 'User-supplied images are now locally available, roles are classified, fixed landmark pixel coordinates are measured, and a future fit/validation split is preregistered. The result remains limited because sources are human-supplied, modded or visually measured, exact replay Walker-to-map Walker pairing is not yet solved, and no transform was fitted.',
        readyConditions: {
            imageRolesKnown: true,
            pixelCoordinatesMeasured: true,
            standardModdedRegistrationEstablishedWhereNeeded: true,
            enoughIndependentlyIdentifiedLandmarks: true,
            heldOutValidationSetReserved: true,
            replaySidePairingIdentityGrounded: 'partial_mid_boss_and_walker_classes_only'
        },
        summary: summaryData
    };
}

function readme() {
    return `# Replay 009 Landmark Measurement

Task 072 measures user-supplied replay-009 map/minimap images that were missing during Task 071.

The images remain local-only under \`.local/spatial-inputs/replay-009-user-maps/\` and are not committed. This directory contains only compact hashes, dimensions, role classifications, visual pixel measurements, and a future fit/validation anchor plan.

Important limits:

- Measurements use top-left image pixel coordinates and normalized image coordinates.
- The standard replay minimap is direct visual evidence from replay 009.
- Modded maps and diagrams are human-supplied visual aids, not official map assets.
- No replay world-to-map transform, lane, region, proximity, mechanic effect, or macro interpretation is emitted.
`;
}

function report(summaryData) {
    return `# Replay 009 User Map Landmark Measurement

Task 072 measured the user-supplied replay-009 map images placed under \`.local/spatial-inputs/replay-009-user-maps/\`.

## Result

Gate: \`${summaryData.gate}\`

- Images found: ${summaryData.imagesFound}
- Standard replay minimap identified: ${summaryData.standardReplayMinimapIdentified}
- Modded maps identified: ${summaryData.moddedMapsIdentified}
- Derived landmark map identified: ${summaryData.derivedLandmarkMapIdentified}
- Urn diagram identified: ${summaryData.urnDiagramIdentified}
- Landmark measurements: ${summaryData.landmarkMeasurements}
- Mid Boss measurements: ${summaryData.midBossMeasurements}
- Walker measurements: ${summaryData.walkerMeasurements}
- Guardian measurements: ${summaryData.guardianMeasurements}
- Base landmark measurements: ${summaryData.baseLandmarkMeasurements}
- Fit anchors planned: ${summaryData.fitAnchorsPlanned}
- Validation anchors reserved: ${summaryData.validationAnchorsReserved}

## Interpretation

The images are sufficient to retry a bounded transform-validation task with explicit limitations. The standard replay minimap provides direct visual replay evidence; the cleaner map provides higher-resolution supporting measurements after qualitative registration. The Urn diagram is retained as mechanic/spawn-location evidence and is not a transform anchor.

No transform was fitted. No lanes, regions, objective proximity, mechanic effects, rotations, pressure, fight grouping, or macro interpretation were emitted.

## Next Step

Created blocked follow-up task:

- \`tasks/blocked/073-retry-replay-009-transform-validation-with-measured-landmarks.md\`
`;
}

async function main() {
    const images = inventoryImages();
    const landmarks = attachNormalization(measuredLandmarks(), images);
    const plan = fitValidationPlan();
    const summaryData = summary(images, landmarks, plan);
    const entities = loadEntityKeys();

    await writeJson(`${OUT_DIR}/image-inventory.json`, {
        schemaVersion: '1.0.0',
        taskId: TASK_ID,
        generatedBy: GENERATED_BY,
        inputDirectory: INPUT_DIR,
        generatedAt: TODAY,
        images
    });
    await writeJson(`${OUT_DIR}/image-role-classification.json`, roleClassification(images));
    await writeJson(`${OUT_DIR}/orientation-annotations.json`, orientationAnnotations());
    await writeJson(`${OUT_DIR}/measured-landmarks.json`, {
        schemaVersion: '1.0.0',
        taskId: TASK_ID,
        generatedBy: GENERATED_BY,
        coordinateConvention: {
            origin: 'top_left',
            xDirection: 'rightward',
            yDirection: 'downward',
            normalizedCoordinate: 'raw pixel divided by source image dimensions',
            pointMeasured: 'visual symbol center'
        },
        landmarks
    });
    await writeJson(`${OUT_DIR}/cross-image-registration.json`, crossImageRegistration());
    await writeJson(`${OUT_DIR}/replay-landmark-correspondence-candidates.json`, correspondenceCandidates(entities));
    await writeJson(`${OUT_DIR}/fit-validation-anchor-plan.json`, plan);
    await writeJson(`${OUT_DIR}/measurement-summary.json`, summaryData);
    await writeJson(`${OUT_DIR}/measurement-gate.json`, gate(summaryData));
    await writeText(`${OUT_DIR}/README.md`, readme());
    await writeText(REPORT_PATH, report(summaryData));
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
