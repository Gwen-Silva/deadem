#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const OUT = 'output/replay-009-spatial-inputs';
const GENERATED_BY = 'tools/acquire-replay-009-spatial-inputs.mjs';
const GENERATED_AT = '2026-06-30T00:00:00.000Z';
const REPLAY_BUILD = '23916427';

const steamRoot = 'C:/Program Files (x86)/Steam';
const appManifestPath = `${steamRoot}/steamapps/appmanifest_1422450.acf`;
const deadlockRoot = `${steamRoot}/steamapps/common/Deadlock`;
const gameTrackingRoot = 'external/GameTracking-Deadlock';
const metadataRoot = 'external/deadlock-metadata';

async function writeJson(relativePath, value) {
    await mkdir(path.dirname(relativePath), { recursive: true });
    await writeFile(relativePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeText(relativePath, value) {
    await mkdir(path.dirname(relativePath), { recursive: true });
    await writeFile(relativePath, value);
}

async function sha256(filePath, maxBytes = 250 * 1024 * 1024) {
    if (!existsSync(filePath)) return '';
    const stat = statSync(filePath);
    if (stat.size > maxBytes) return '';
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    for await (const chunk of stream) hash.update(chunk);
    return hash.digest('hex');
}

function fileMeta(filePath) {
    if (!existsSync(filePath)) return { exists: false, sizeBytes: null, mtime: null };
    const stat = statSync(filePath);
    return { exists: true, sizeBytes: stat.size, mtime: stat.mtime.toISOString() };
}

function normalizeRepoPath(filePath) {
    return `repo:${filePath.replaceAll('\\', '/')}`;
}

function normalizeExternalPath(rootLabel, filePath) {
    const normalized = filePath.replaceAll('\\', '/');
    return `${rootLabel}:${normalized}`;
}

function normalizeSteamPath(filePath) {
    const normalizedFile = filePath.replaceAll('\\', '/');
    const normalizedRoot = steamRoot.replaceAll('\\', '/');
    return `steam:${normalizedFile.replace(normalizedRoot, '').replace(/^\//, '')}`;
}

async function maybeRead(filePath) {
    try {
        return await readFile(filePath, 'utf8');
    } catch {
        return '';
    }
}

function parseAcfValue(text, key) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = text.match(new RegExp(`"${escaped}"\\s+"([^"]+)"`));
    return match?.[1] ?? null;
}

async function collectSteamMetadata() {
    const acf = await maybeRead(appManifestPath);
    const manifest = {
        appId: parseAcfValue(acf, 'appid'),
        name: parseAcfValue(acf, 'name'),
        installDir: parseAcfValue(acf, 'installdir'),
        steamBuildId: parseAcfValue(acf, 'buildid'),
        targetBuildId: parseAcfValue(acf, 'TargetBuildID'),
        lastUpdatedUnix: parseAcfValue(acf, 'LastUpdated')
    };
    return {
        manifest,
        installedBuildRelationship: manifest.steamBuildId === REPLAY_BUILD || manifest.targetBuildId === REPLAY_BUILD
            ? 'exact_build_match'
            : 'newer_build_only',
        notes: manifest.steamBuildId
            ? [`Installed Steam build ID ${manifest.steamBuildId}; replay user metadata build is ${REPLAY_BUILD}. Steam build IDs and replay build identifiers are not assumed interchangeable.`]
            : ['Steam Deadlock app manifest was not available.']
    };
}

async function localSource(source) {
    const meta = fileMeta(source.realPath);
    const hash = meta.exists ? await sha256(source.realPath, source.maxHashBytes) : '';
    const limitations = [...source.limitations];
    if (meta.exists && !hash) limitations.push('sha256 not committed for large proprietary package; size and timestamp are recorded instead.');
    return {
        sourceId: source.sourceId,
        sourceType: source.sourceType,
        path: source.displayPath,
        exists: meta.exists,
        sizeBytes: meta.sizeBytes,
        sha256: hash,
        format: source.format,
        believedMapVersion: source.believedMapVersion,
        buildCompatibilityStatus: source.buildCompatibilityStatus,
        provenance: source.provenance,
        licenseOrUsageNotes: source.licenseOrUsageNotes,
        inspectionAllowed: source.inspectionAllowed,
        commitAllowed: source.commitAllowed,
        limitations
    };
}

function patchChronologyFromMetadata() {
    const patchdatesPath = path.join(metadataRoot, 'patchdates.json');
    if (!existsSync(patchdatesPath)) return [];
    const raw = JSON.parse(readFileSync(patchdatesPath, 'utf8'));
    return raw
        .filter(entry => Array.isArray(entry.tags) && entry.tags.includes('map'))
        .slice(-6)
        .map(entry => ({
            date: entry.title,
            buildOrPatchId: Array.isArray(entry.builds) ? entry.builds.join(',') : '',
            changeType: 'map-related patch metadata',
            description: `Local deadlock-metadata patchdates entry tagged as map-related: ${entry.title}`,
            spatialImpact: entry.tags.includes('three_lanes') ? 'material' : 'unknown',
            affectedElements: entry.tags,
            sourceIds: ['external_deadlock_metadata_patchdates'],
            confidence: 'supported',
            limitations: ['Patchdates metadata is not an official build-to-patch mapping for replay build 23916427.']
        }));
}

function entityAnchors() {
    const entityRegistryPath = 'output/replay-009-canonical/entity-registry.json';
    const registry = JSON.parse(readFileSync(entityRegistryPath, 'utf8'));
    const candidates = registry.entities.filter(entity => [
        'mid_boss',
        'walker',
        'guardian',
        'barrack_boss_candidate',
        'boss_tier3_candidate',
        'trooper_boss_candidate',
        'spirit_urn_candidate'
    ].includes(entity.classification));

    const entityAnchorRows = candidates.map(entity => {
        const isSupported = ['mid_boss', 'walker'].includes(entity.classification);
        return {
            anchorId: `anchor_${entity.entityKey.replaceAll(':', '_')}`,
            anchorType: entity.classification,
            replayEvidence: {
                entityKey: entity.entityKey,
                className: entity.className,
                worldCoordinate: null,
                sourcePath: entityRegistryPath,
                confidence: isSupported ? 'supported' : 'uncertain'
            },
            mapEvidence: {
                geometryId: null,
                pixelOrMapCoordinate: null,
                identificationMethod: 'No independent map coordinate has been acquired for this entity in Task 069.',
                confidence: 'unknown'
            },
            identityStatus: isSupported ? 'supported' : 'candidate',
            independenceStatus: 'replay entity evidence exists, but independent map-coordinate evidence is missing',
            usableForCalibration: false,
            limitations: [
                'Task 069 does not fit transforms.',
                'Accepted calibration requires an independently identified geometry coordinate for the same landmark.',
                ...(!isSupported ? ['This class remains candidate or ambiguous and cannot be accepted as an anchor without additional evidence.'] : [])
            ]
        };
    });

    const rejectedMethods = [
        ['anchor_rejected_spawn_clusters_from_player_trajectories', 'spawn_cluster_inference', 'Spawn clusters inferred solely from player trajectories are explicitly prohibited as accepted anchors.'],
        ['anchor_rejected_lane_centers_from_path_density', 'lane_path_density', 'Lane centers inferred from player path density are explicitly prohibited as accepted anchors.'],
        ['anchor_rejected_entity_deletion_locations', 'deletion_location', 'Entity deletion locations are not accepted as calibration anchors.'],
        ['anchor_rejected_symmetry_only_orientation', 'symmetry_assumption', 'Map symmetry assumptions cannot independently resolve orientation.']
    ].map(([anchorId, anchorType, reason]) => ({
        anchorId,
        anchorType,
        replayEvidence: {
            entityKey: null,
            className: null,
            worldCoordinate: null,
            sourcePath: '',
            confidence: 'rejected'
        },
        mapEvidence: {
            geometryId: null,
            pixelOrMapCoordinate: null,
            identificationMethod: reason,
            confidence: 'rejected'
        },
        identityStatus: 'rejected',
        independenceStatus: 'not independent or explicitly disallowed by Task 069',
        usableForCalibration: false,
        limitations: [reason]
    }));

    return [...entityAnchorRows, ...rejectedMethods];
}

function feasibility(anchors) {
    const supportedCount = anchors.filter(anchor => anchor.identityStatus === 'supported').length;
    const candidateCount = anchors.filter(anchor => anchor.identityStatus !== 'rejected').length;
    const row = (modelType, minimumAnchorCount) => ({
        modelType,
        minimumAnchorCount,
        availableCandidateAnchors: candidateCount,
        availableSupportedAnchors: supportedCount,
        spatialDistribution: 'unknown',
        orientationResolvable: false,
        scaleResolvable: false,
        validationHoldoutPossible: supportedCount > minimumAnchorCount,
        feasibility: 'not_ready',
        limitations: [
            'Replay entity classes provide candidate landmarks, but no independent map pixel/geometry coordinates were acquired.',
            'At least one accepted anchor must be reserved outside fitting for validation before transform validation is called ready.',
            'Build 23916427 remains unmapped to the installed or external geometry sources.'
        ]
    });
    return {
        schemaVersion: '1.0.0',
        generatedBy: GENERATED_BY,
        replayId: 'replay_009',
        buildId: REPLAY_BUILD,
        simplestFeasibleTransformClass: 'none_yet',
        transformFittingPerformed: false,
        models: [
            row('translation_only', 1),
            row('rigid_transform', 2),
            row('similarity_transform', 2),
            row('affine_transform', 3),
            row('projective_transform', 4),
            row('nonlinear_transform', 8)
        ]
    };
}

async function main() {
    const steam = await collectSteamMetadata();
    const appMeta = fileMeta(appManifestPath);
    const installedBuild = steam.manifest.steamBuildId ?? 'unknown';
    const targetBuild = steam.manifest.targetBuildId ?? 'unknown';

    const vpkFiles = [
        'game/citadel/maps/dl_midtown.vpk',
        'game/citadel/maps/dl_streets.vpk',
        'game/citadel/maps/street_test.vpk',
        'game/citadel/maps/1v1_test.vpk',
        'game/citadel/maps/dl_hideout.vpk',
        'game/citadel/maps/scenes/minimap_effects.vpk'
    ];
    const localSources = [
        await localSource({
            sourceId: 'local_steam_appmanifest_deadlock_1422450',
            sourceType: 'steam_app_manifest',
            realPath: appManifestPath,
            displayPath: normalizeSteamPath(appManifestPath),
            format: 'acf',
            believedMapVersion: `installed Steam build ${installedBuild}; target build ${targetBuild}`,
            buildCompatibilityStatus: 'unknown',
            provenance: 'Local Steam app manifest discovered through Steam metadata.',
            licenseOrUsageNotes: ['Metadata only; no game assets are committed.'],
            inspectionAllowed: true,
            commitAllowed: true,
            maxHashBytes: 5 * 1024 * 1024,
            limitations: ['Steam build ID is not proven to be the same identifier type as replay build 23916427.']
        }),
        await localSource({
            sourceId: 'local_gametracking_steam_inf',
            sourceType: 'versioned_game_metadata',
            realPath: path.join(gameTrackingRoot, 'game/citadel/steam.inf'),
            displayPath: normalizeExternalPath('external', 'GameTracking-Deadlock/game/citadel/steam.inf'),
            format: 'steam.inf',
            believedMapVersion: 'GameTracking local checkout reports SourceRevision and Jun 19 2026 version timestamp.',
            buildCompatibilityStatus: 'possible',
            provenance: 'Local versioned GameTracking-Deadlock checkout metadata.',
            licenseOrUsageNotes: ['Derived metadata only; source checkout is not vendored by this task.'],
            inspectionAllowed: true,
            commitAllowed: true,
            maxHashBytes: 5 * 1024 * 1024,
            limitations: ['Does not directly identify replay build 23916427.']
        }),
        await localSource({
            sourceId: 'local_gametracking_pak01_index',
            sourceType: 'package_index',
            realPath: path.join(gameTrackingRoot, 'game/citadel/pak01_dir.txt'),
            displayPath: normalizeExternalPath('external', 'GameTracking-Deadlock/game/citadel/pak01_dir.txt'),
            format: 'package index text',
            believedMapVersion: 'Local GameTracking package index, version tied to its checkout.',
            buildCompatibilityStatus: 'possible',
            provenance: 'Local versioned GameTracking-Deadlock package index.',
            licenseOrUsageNotes: ['Commit only metadata derived from this source.'],
            inspectionAllowed: true,
            commitAllowed: true,
            maxHashBytes: 50 * 1024 * 1024,
            limitations: ['Index references minimap/map materials but is not itself a usable map image or geometry.']
        }),
        await localSource({
            sourceId: 'local_match_91119257_map_reference',
            sourceType: 'legacy_map_reference_image',
            realPath: 'data/evidence/match_91119257/raw/map_reference.png',
            displayPath: normalizeRepoPath('data/evidence/match_91119257/raw/map_reference.png'),
            format: 'png',
            believedMapVersion: 'Unknown; belongs to match_91119257 context, not replay_009.',
            buildCompatibilityStatus: 'unknown',
            provenance: 'Existing repository evidence for another match context.',
            licenseOrUsageNotes: ['Do not reuse as replay_009 authoritative map geometry without provenance.'],
            inspectionAllowed: true,
            commitAllowed: false,
            maxHashBytes: 10 * 1024 * 1024,
            limitations: ['Not tied to replay_009 or build 23916427.']
        })
    ];

    for (const relative of vpkFiles) {
        const realPath = path.join(deadlockRoot, relative);
        localSources.push(await localSource({
            sourceId: `local_installed_${path.basename(relative, '.vpk')}_vpk`,
            sourceType: 'installed_game_map_package',
            realPath,
            displayPath: normalizeSteamPath(realPath),
            format: 'vpk',
            believedMapVersion: `installed Steam build ${installedBuild}; target build ${targetBuild}`,
            buildCompatibilityStatus: 'possible',
            provenance: 'Local Deadlock installation discovered through Steam app manifest.',
            licenseOrUsageNotes: [
                'Valve game package; local inspection only.',
                'Do not commit or redistribute the package.',
                'Only compact metadata and hashes may be committed.'
            ],
            inspectionAllowed: true,
            commitAllowed: false,
            maxHashBytes: 250 * 1024 * 1024,
            limitations: [
                'Installed package is not directly mapped to replay build 23916427.',
                'Raw VPK is not a bounded derived geometry representation.'
            ]
        }));
    }

    const externalSources = {
        schemaVersion: '1.0.0',
        generatedBy: GENERATED_BY,
        sources: [
            {
                sourceId: 'external_gametracking_deadlock_checkout',
                title: 'GameTracking-Deadlock local checkout',
                sourceType: 'versioned_public_repository_local_checkout',
                sourceReference: 'external/GameTracking-Deadlock',
                publisherOrMaintainer: 'local external checkout',
                retrievedAt: GENERATED_AT,
                versionOrDate: 'local checkout; git commit unavailable due local ownership restrictions',
                claimedBuild: '',
                provenanceChain: ['Local checkout includes game/citadel/steam.inf and pak01_dir.txt metadata.'],
                licenseOrUsageNotes: ['Use for metadata provenance; do not commit assets derived from packages without separate license review.'],
                locallyStored: true,
                localDerivedArtifact: null,
                buildCompatibilityStatus: 'possible',
                trustLevel: 'derived_primary',
                limitations: ['No direct build-23916427 mapping.']
            },
            {
                sourceId: 'external_deadlock_metadata_patchdates',
                title: 'deadlock-metadata patchdates.json local checkout',
                sourceType: 'community_metadata_local_checkout',
                sourceReference: 'external/deadlock-metadata/patchdates.json',
                publisherOrMaintainer: 'local external checkout',
                retrievedAt: GENERATED_AT,
                versionOrDate: 'local checkout',
                claimedBuild: '',
                provenanceChain: ['Patch metadata includes map-tagged historical entries.'],
                licenseOrUsageNotes: ['Commit compact derived chronology only.'],
                locallyStored: true,
                localDerivedArtifact: null,
                buildCompatibilityStatus: 'unknown',
                trustLevel: 'community',
                limitations: ['Not official and not a map geometry source.']
            },
            {
                sourceId: 'external_pcgamer_2026_05_urn_map_change',
                title: 'Deadlock urn midlane experiment news report',
                sourceType: 'community_news',
                sourceReference: 'https://www.pcgamer.com/games/moba/deadlock-new-midlane-objective-turned-games-into-such-a-mid-only-fiasco-that-it-only-lasted-one-weekend-though-valves-still-experimenting/',
                publisherOrMaintainer: 'PC Gamer',
                retrievedAt: GENERATED_AT,
                versionOrDate: '2026-05-26',
                claimedBuild: '',
                provenanceChain: ['Public news report describes a temporary urn placement/map-objective experiment and rollback.'],
                licenseOrUsageNotes: ['Use only as secondary chronology context; no copied article content.'],
                locallyStored: false,
                localDerivedArtifact: null,
                buildCompatibilityStatus: 'unknown',
                trustLevel: 'secondary',
                limitations: ['Not official, not geometry, and not a build mapping for 23916427.']
            },
            {
                sourceId: 'external_deadlock_wiki_map_reference',
                title: 'Deadlock Wiki current map reference',
                sourceType: 'deadlock_wiki_reference',
                sourceReference: 'https://deadlock.wiki/',
                publisherOrMaintainer: 'Deadlock Wiki contributors',
                retrievedAt: GENERATED_AT,
                versionOrDate: 'current page state not captured',
                claimedBuild: '',
                provenanceChain: ['Authorized source for future reference, but no versioned geometry artifact was acquired in Task 069.'],
                licenseOrUsageNotes: ['Do not copy full wiki pages; cite compact claims only.'],
                locallyStored: false,
                localDerivedArtifact: null,
                buildCompatibilityStatus: 'unknown',
                trustLevel: 'secondary',
                limitations: ['No versioned geometry or build-specific map image acquired.']
            }
        ]
    };

    const chronology = {
        schemaVersion: '1.0.0',
        generatedBy: GENERATED_BY,
        replayId: 'replay_009',
        entries: [
            ...patchChronologyFromMetadata(),
            {
                date: '2026-05-26',
                buildOrPatchId: '',
                changeType: 'secondary report of objective placement experiment',
                description: 'Public reporting described a temporary urn midlane experiment and rollback before replay_009 acquisition.',
                spatialImpact: 'material',
                affectedElements: ['Spirit Urn placement', 'Mid Boss adjacency context'],
                sourceIds: ['external_pcgamer_2026_05_urn_map_change'],
                confidence: 'uncertain',
                limitations: ['Secondary source only; not a map geometry source or build mapping.']
            },
            {
                date: '2026-06-19',
                buildOrPatchId: 'ClientVersion/ServerVersion 6592; SourceRevision 10757662',
                changeType: 'local GameTracking metadata timestamp',
                description: 'Local GameTracking steam.inf reports Jun 19 2026 version metadata.',
                spatialImpact: 'unknown',
                affectedElements: [],
                sourceIds: ['local_gametracking_steam_inf'],
                confidence: 'supported',
                limitations: ['Does not directly map to replay build 23916427.']
            },
            {
                date: '2026-06-29',
                buildOrPatchId: REPLAY_BUILD,
                changeType: 'replay metadata',
                description: 'Replay 009 user metadata reports build 23916427 and acquisition on 2026-06-29.',
                spatialImpact: 'unknown',
                affectedElements: [],
                sourceIds: ['user_replay_metadata'],
                confidence: 'supported',
                limitations: ['Replay metadata proves observed identifier only; it does not identify patch or map geometry.']
            },
            {
                date: appMeta.mtime ?? '',
                buildOrPatchId: `Steam build ${installedBuild}; target ${targetBuild}`,
                changeType: 'installed game metadata',
                description: 'Local Steam app manifest points to an installed Deadlock build newer than the replay build identifier under current evidence.',
                spatialImpact: 'unknown',
                affectedElements: ['installed map packages'],
                sourceIds: ['local_steam_appmanifest_deadlock_1422450'],
                confidence: 'supported',
                limitations: ['File timestamps are not used as build compatibility proof.']
            }
        ]
    };

    const geometryCandidates = {
        schemaVersion: '1.0.0',
        generatedBy: GENERATED_BY,
        candidates: [
            {
                geometryId: 'geom_installed_dl_midtown_vpk',
                sourceId: 'local_installed_dl_midtown_vpk',
                representationType: 'world_map_package',
                dimensions: {},
                coordinateSystemKnown: false,
                orientationKnown: false,
                scaleKnown: false,
                originKnown: false,
                boundsKnown: false,
                versionStatus: 'installed_newer_or_unknown_relative_to_replay_build',
                usableForAffineCalibration: false,
                usableForNonlinearCalibration: false,
                usableForRegionAuthoring: false,
                limitations: ['Likely map package candidate, but extraction and build compatibility remain unresolved.']
            },
            {
                geometryId: 'geom_gametracking_minimap_material_index',
                sourceId: 'local_gametracking_pak01_index',
                representationType: 'minimap_material_index',
                dimensions: {},
                coordinateSystemKnown: false,
                orientationKnown: false,
                scaleKnown: false,
                originKnown: false,
                boundsKnown: false,
                versionStatus: 'local_checkout_possible_candidate',
                usableForAffineCalibration: false,
                usableForNonlinearCalibration: false,
                usableForRegionAuthoring: false,
                limitations: ['Provides material names, not a raster/vector geometry artifact.']
            },
            {
                geometryId: 'geom_match_91119257_map_reference',
                sourceId: 'local_match_91119257_map_reference',
                representationType: 'raster_minimap_reference',
                dimensions: {},
                coordinateSystemKnown: false,
                orientationKnown: false,
                scaleKnown: false,
                originKnown: false,
                boundsKnown: false,
                versionStatus: 'not_tied_to_replay_009',
                usableForAffineCalibration: false,
                usableForNonlinearCalibration: false,
                usableForRegionAuthoring: false,
                limitations: ['Reference-only artifact from another match context.']
            }
        ]
    };

    const anchors = entityAnchors();
    const calibrationFeasibility = feasibility(anchors);
    const provenance = {
        schemaVersion: '1.0.0',
        generatedBy: GENERATED_BY,
        sources: [
            ...localSources.map(source => ({
                sourceId: source.sourceId,
                origin: source.provenance,
                officialOrDerived: source.sourceType.includes('installed') || source.sourceType.includes('steam') ? 'official_local_install_metadata_or_asset' : 'derived_or_local_reference',
                versionKnown: source.sourceId === 'local_steam_appmanifest_deadlock_1422450',
                redistributionAllowed: source.commitAllowed,
                committedContent: source.commitAllowed ? 'compact metadata and hash only' : 'metadata only; source artifact not committed',
                attributionRequired: source.sourceType.includes('legacy') ? 'unknown' : 'not_applicable_for_local_metadata',
                localUseOnly: source.commitAllowed ? false : true,
                limitations: source.limitations
            })),
            ...externalSources.sources.map(source => ({
                sourceId: source.sourceId,
                origin: source.sourceReference,
                officialOrDerived: source.trustLevel,
                versionKnown: Boolean(source.versionOrDate),
                redistributionAllowed: false,
                committedContent: 'compact source reference and claim summary only',
                attributionRequired: 'cite source when claims are used',
                localUseOnly: source.locallyStored,
                limitations: source.limitations
            }))
        ]
    };

    const inputManifest = {
        schemaVersion: '1.0.0',
        generatedBy: GENERATED_BY,
        replayId: 'replay_009',
        buildId: REPLAY_BUILD,
        selectedGeometryCandidate: {
            geometryId: 'geom_installed_dl_midtown_vpk',
            designation: 'preferred_candidate',
            reason: 'Local installed map package is the most complete available geometry-bearing candidate, but it is not committed and not proven build-compatible.'
        },
        alternateCandidates: [
            { geometryId: 'geom_gametracking_minimap_material_index', designation: 'alternate_candidate' },
            { geometryId: 'geom_match_91119257_map_reference', designation: 'reference_only' }
        ],
        candidateAnchors: anchors.filter(anchor => anchor.identityStatus !== 'rejected').map(anchor => anchor.anchorId),
        supportedAnchors: anchors.filter(anchor => anchor.identityStatus === 'supported').map(anchor => anchor.anchorId),
        rejectedAnchors: anchors.filter(anchor => anchor.identityStatus === 'rejected').map(anchor => anchor.anchorId),
        reservedValidationAnchors: [],
        versionEvidence: ['local_steam_appmanifest_deadlock_1422450', 'local_gametracking_steam_inf', 'external_deadlock_metadata_patchdates'],
        licensingConstraints: [
            'Installed Valve map packages are local-only and not committed.',
            'No uncleared raster map image is committed.',
            'Only compact metadata and derived inventories are committed.'
        ],
        localOnlyArtifacts: localSources.filter(source => source.commitAllowed === false).map(source => source.path),
        committedDerivedArtifacts: [
            `${OUT}/local-source-inventory.json`,
            `${OUT}/external-source-inventory.json`,
            `${OUT}/map-version-chronology.json`,
            `${OUT}/geometry-candidate-inventory.json`,
            `${OUT}/calibration-anchor-inventory.json`,
            `${OUT}/calibration-feasibility.json`
        ],
        missingInputs: [
            'authoritative map geometry or image known to match build 23916427',
            'independent map coordinates for Mid Boss, Walker, Guardian, or structure landmarks',
            'accepted validation anchor outside any future fitting set',
            'license-clear derived geometry representation suitable for committing or reproducible local extraction instructions'
        ]
    };

    const gate = 'replay_009_map_geometry_inputs_ready_with_limitations';
    const summary = {
        schemaVersion: '1.0.0',
        generatedBy: GENERATED_BY,
        replayId: 'replay_009',
        buildId: REPLAY_BUILD,
        localSourcesFound: localSources.filter(source => source.exists).length,
        externalSourcesFound: externalSources.sources.length,
        installedBuildRelationship: steam.installedBuildRelationship,
        geometryCandidatesFound: geometryCandidates.candidates.length,
        preferredGeometryCandidate: 'geom_installed_dl_midtown_vpk',
        buildCompatibilityStatus: 'possible_but_unconfirmed',
        candidateAnchors: anchors.filter(anchor => anchor.identityStatus !== 'rejected').length,
        supportedAnchors: anchors.filter(anchor => anchor.identityStatus === 'supported').length,
        rejectedAnchors: anchors.filter(anchor => anchor.identityStatus === 'rejected').length,
        reservedValidationAnchors: 0,
        simplestFeasibleTransformClass: calibrationFeasibility.simplestFeasibleTransformClass,
        transformFittingPerformed: false,
        licensingResult: 'metadata_commit_allowed_assets_local_only',
        gate,
        decision: 'transform validation may start only as a limited local extraction/calibration feasibility task; build compatibility and independent map coordinates remain unresolved',
        protections: {
            replay005Read: false,
            replay005Processed: false,
            botFixturesProcessed: false,
            transformFitted: false,
            laneLabelsEmitted: false,
            spatialSemanticEventsEmitted: false
        }
    };

    const gateOutput = {
        schemaVersion: '1.0.0',
        generatedBy: GENERATED_BY,
        gate,
        reason: 'Local map/package candidates and replay entity landmark candidates exist, but build compatibility, extracted geometry, and independent map-coordinate anchors remain limited.',
        allowedNextStep: 'blocked_transform_validation_task',
        protections: summary.protections
    };

    await writeJson(`${OUT}/local-source-inventory.json`, { schemaVersion: '1.0.0', generatedBy: GENERATED_BY, replayId: 'replay_009', buildId: REPLAY_BUILD, sources: localSources });
    await writeJson(`${OUT}/external-source-inventory.json`, externalSources);
    await writeJson(`${OUT}/map-version-chronology.json`, chronology);
    await writeJson(`${OUT}/geometry-candidate-inventory.json`, geometryCandidates);
    await writeJson(`${OUT}/calibration-anchor-inventory.json`, { schemaVersion: '1.0.0', generatedBy: GENERATED_BY, replayId: 'replay_009', anchors });
    await writeJson(`${OUT}/calibration-feasibility.json`, calibrationFeasibility);
    await writeJson(`${OUT}/provenance-license-audit.json`, provenance);
    await writeJson(`${OUT}/input-package-manifest.json`, inputManifest);
    await writeJson(`${OUT}/acquisition-summary.json`, summary);
    await writeJson(`${OUT}/acquisition-gate.json`, gateOutput);
    await writeText(`${OUT}/README.md`, `# Replay 009 Spatial Inputs\n\nTask 069 acquired compact metadata for local and external map-geometry candidates. The package is acquisition-only: no transform, lane, region, proximity, mechanic effect, or macro output is produced.\n\nGate: \`${gate}\`\n\nPrimary candidate: local installed \`dl_midtown.vpk\`, recorded as metadata only and not committed as an asset. Build compatibility with replay build \`${REPLAY_BUILD}\` remains unconfirmed.\n\nUse these outputs as inputs to a future bounded transform-validation task only. Do not treat any geometry candidate as authoritative for replay 009 until compatibility and independent anchors are validated.\n`);
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
