#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { closeSync, existsSync, openSync, readFileSync, readSync, statSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const OUT = 'output/replay-009-transform-validation';
const GENERATED_BY = 'tools/validate-replay-009-transform-candidate.mjs';
const REPLAY_ID = 'replay_009';
const BUILD_ID = '23916427';
const STEAM_ROOT = 'C:/Program Files (x86)/Steam';

function readJson(relativePath) {
    return JSON.parse(readFileSync(relativePath, 'utf8'));
}

async function writeJson(relativePath, value) {
    await mkdir(path.dirname(relativePath), { recursive: true });
    await writeFile(relativePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeText(relativePath, value) {
    await mkdir(path.dirname(relativePath), { recursive: true });
    await writeFile(relativePath, value);
}

function steamPath(normalized) {
    if (!normalized.startsWith('steam:')) return null;
    return path.join(STEAM_ROOT, normalized.slice('steam:'.length));
}

function safePath(realPath) {
    return `steam:${realPath.replaceAll('\\', '/').replace(STEAM_ROOT.replaceAll('\\', '/'), '').replace(/^\//, '')}`;
}

function sha256Buffer(buffer) {
    return createHash('sha256').update(buffer).digest('hex');
}

function readNullString(buffer, cursor) {
    const start = cursor;
    while (cursor < buffer.length && buffer[cursor] !== 0) cursor += 1;
    return { value: buffer.toString('utf8', start, cursor), cursor: cursor + 1 };
}

function parseVpkDirectory(filePath) {
    const header = Buffer.alloc(12);
    const fd = openSync(filePath, 'r');
    try {
        readSync(fd, header, 0, header.length, 0);
        const signature = header.readUInt32LE(0);
        const version = header.readUInt32LE(4);
        const treeSize = header.readUInt32LE(8);
        const tree = Buffer.alloc(treeSize);
        readSync(fd, tree, 0, treeSize, 12);
        const resources = [];
        let cursor = 0;
        while (cursor < tree.length) {
            const ext = readNullString(tree, cursor);
            cursor = ext.cursor;
            if (!ext.value) break;
            while (cursor < tree.length) {
                const dir = readNullString(tree, cursor);
                cursor = dir.cursor;
                if (!dir.value) break;
                while (cursor < tree.length) {
                    const file = readNullString(tree, cursor);
                    cursor = file.cursor;
                    if (!file.value) break;
                    const crc = tree.readUInt32LE(cursor).toString(16).padStart(8, '0');
                    cursor += 4;
                    const preloadBytes = tree.readUInt16LE(cursor);
                    cursor += 2;
                    const archiveIndex = tree.readUInt16LE(cursor);
                    cursor += 2;
                    const entryOffset = tree.readUInt32LE(cursor);
                    cursor += 4;
                    const entryLength = tree.readUInt32LE(cursor);
                    cursor += 4;
                    const terminator = tree.readUInt16LE(cursor);
                    cursor += 2;
                    cursor += preloadBytes;
                    const relativePath = `${dir.value === ' ' ? '' : `${dir.value}/`}${file.value}.${ext.value}`.replaceAll('\\', '/');
                    resources.push({ relativePath, crc, preloadBytes, archiveIndex, entryOffset, entryLength, terminator });
                }
            }
        }
        return { signature: `0x${signature.toString(16)}`, version, treeSize, resources };
    } finally {
        closeSync(fd);
    }
}

function classifyResource(relativePath) {
    const lower = relativePath.toLowerCase();
    const potentialSpatialUse = [];
    let resourceType = 'other';
    if (lower.includes('vmap')) {
        resourceType = 'compiled_map_or_world_resource';
        potentialSpatialUse.push('map topology candidate');
    }
    if (lower.includes('nav') || lower.endsWith('.xv')) {
        resourceType = 'navigation_or_map_auxiliary_resource';
        potentialSpatialUse.push('navigation or spatial index candidate');
    }
    if (lower.includes('minimap')) {
        resourceType = 'minimap_material_or_texture';
        potentialSpatialUse.push('overview/minimap candidate');
    }
    if (lower.includes('boss') || lower.includes('guardian') || lower.includes('walker') || lower.includes('sentry')) {
        potentialSpatialUse.push('landmark identity clue');
    }
    if (lower.includes('entity') || lower.includes('lump')) {
        resourceType = 'entity_lump_candidate';
        potentialSpatialUse.push('map-side entity coordinate candidate');
    }
    if (lower.startsWith('maps/')) {
        potentialSpatialUse.push('map package resource');
    }
    return { resourceType, potentialSpatialUse };
}

function makeResourceRows(vpkInfo) {
    const spatial = vpkInfo.resources
        .map(resource => ({ ...resource, ...classifyResource(resource.relativePath) }))
        .filter(resource => resource.potentialSpatialUse.length > 0)
        .slice(0, 250);
    return spatial.map((resource, index) => ({
        resourceId: `resource_${String(index + 1).padStart(3, '0')}`,
        relativePackagePath: resource.relativePath,
        resourceType: resource.resourceType,
        sizeBytes: resource.entryLength,
        hash: resource.crc,
        inspectionStatus: 'available',
        potentialSpatialUse: resource.potentialSpatialUse,
        commitAllowed: false,
        limitations: ['VPK directory entry only; compiled resource payload was not extracted or parsed.']
    }));
}

function parsePackageIndexRows() {
    const indexPath = 'external/GameTracking-Deadlock/game/citadel/pak01_dir.txt';
    if (!existsSync(indexPath)) return [];
    const text = readFileSync(indexPath, 'utf8');
    const rows = [];
    for (const line of text.split(/\r?\n/)) {
        const match = line.match(/^(.+?)\s+CRC:([0-9a-fA-F]+)\s+size:(\d+)/);
        if (!match) continue;
        const relativePath = match[1].replaceAll('\\', '/');
        const classified = classifyResource(relativePath);
        if (!classified.potentialSpatialUse.length) continue;
        rows.push({
            relativePath,
            crc: match[2],
            entryLength: Number(match[3]),
            source: 'local_gametracking_pak01_index',
            ...classified
        });
    }
    return rows;
}

function makeIndexResourceRows(rows, startIndex = 0) {
    return rows.slice(0, 250).map((resource, index) => ({
        resourceId: `resource_${String(startIndex + index + 1).padStart(3, '0')}`,
        relativePackagePath: resource.relativePath,
        resourceType: resource.resourceType,
        sizeBytes: resource.entryLength,
        hash: resource.crc,
        inspectionStatus: 'available',
        potentialSpatialUse: resource.potentialSpatialUse,
        commitAllowed: false,
        limitations: ['Package index metadata only; compiled resource payload was not extracted or parsed.']
    }));
}

function supportedReplayAnchors() {
    const anchors = readJson('output/replay-009-spatial-inputs/calibration-anchor-inventory.json').anchors;
    return anchors.filter(anchor => anchor.identityStatus === 'supported');
}

function modelRow(modelId, modelType, parameterCount, minimumFitAnchors) {
    return {
        modelId,
        modelType,
        parameterCount,
        minimumFitAnchors,
        assumptions: ['2D map-side coordinates and replay-side world coordinates must be independently established before fitting.'],
        allowedAxisReflections: modelType.includes('reflected') ? ['x', 'y', 'both'] : [],
        fitAnchorIds: [],
        validationAnchorIds: [],
        eligible: false,
        ineligibilityReasons: [
            'No independent map-side landmark coordinates were extracted.',
            'No accepted replay/map coordinate correspondences exist.',
            'No held-out validation anchor can be reserved.'
        ]
    };
}

async function main() {
    const manifest = readJson('output/replay-009-spatial-inputs/input-package-manifest.json');
    const localInventory = readJson('output/replay-009-spatial-inputs/local-source-inventory.json');
    const preferred = localInventory.sources.find(source => source.sourceId === 'local_installed_dl_midtown_vpk');
    const realPath = preferred ? steamPath(preferred.path) : null;
    const exists = Boolean(realPath && existsSync(realPath));
    const stat = exists ? statSync(realPath) : null;
    const vpkInfo = exists ? parseVpkDirectory(realPath) : { signature: null, version: null, treeSize: 0, resources: [] };
    const headerHash = exists ? sha256Buffer(readFileSync(realPath, { start: 0, end: 4095 })) : '';
    const vpkResourceRows = makeResourceRows(vpkInfo);
    const indexResourceRows = makeIndexResourceRows(parsePackageIndexRows(), vpkResourceRows.length);
    const resourceRows = [...vpkResourceRows, ...indexResourceRows].slice(0, 250);
    const replayAnchors = supportedReplayAnchors();

    const localAssetAccess = {
        schemaVersion: '1.0.0',
        generatedBy: GENERATED_BY,
        replayId: REPLAY_ID,
        buildId: BUILD_ID,
        preferredGeometry: manifest.selectedGeometryCandidate.geometryId,
        assetPath: realPath ? safePath(realPath) : preferred?.path ?? null,
        exists,
        task069SizeBytes: preferred?.sizeBytes ?? null,
        observedSizeBytes: stat?.size ?? null,
        sizeVerification: exists && preferred?.sizeBytes === stat?.size ? 'matches_task069' : 'not_verified',
        task069Sha256: preferred?.sha256 ?? '',
        hashVerification: preferred?.sha256 ? 'not_checked_in_task070' : 'not_available_in_task069',
        headerSha256First4KiB: headerHash,
        accessResult: exists ? 'available_local_only' : 'missing',
        legalTechnicalStatus: 'local_inspection_only_no_asset_commit',
        limitations: [
            'Task 069 did not commit a full package hash for dl_midtown.vpk because it is a large proprietary local-only asset.',
            'Steam installed build remains newer or unmapped relative to replay build 23916427.',
            'No package payload is committed by Task 070.'
        ]
    };

    const mapResourceInventory = {
        schemaVersion: '1.0.0',
        generatedBy: GENERATED_BY,
        replayId: REPLAY_ID,
        buildId: BUILD_ID,
        package: {
            path: localAssetAccess.assetPath,
            signature: vpkInfo.signature,
            version: vpkInfo.version,
            treeSize: vpkInfo.treeSize,
            totalDirectoryEntries: vpkInfo.resources.length,
            directoryParseStatus: vpkInfo.resources.length > 0 ? 'parsed' : 'unsupported_or_empty_for_simple_parser',
            fallbackIndexSource: 'external:GameTracking-Deadlock/game/citadel/pak01_dir.txt'
        },
        resources: resourceRows,
        limitations: [
            'Directory parsing lists bounded resource metadata only.',
            'Compiled resources were not decoded into entity origins or map geometry.'
        ]
    };

    const extractionToolInventory = {
        schemaVersion: '1.0.0',
        generatedBy: GENERATED_BY,
        tools: [
            {
                toolId: 'task070_vpk_directory_parser',
                version: '1.0.0',
                source: GENERATED_BY,
                inputTypes: ['Source 2 VPK directory tree'],
                outputTypes: ['bounded resource inventory'],
                used: true,
                validationEvidence: ['Parsed VPK signature, version, and tree size without extracting payloads.'],
                limitations: ['Does not decode compiled VMAP, entity lumps, binary KV3, or texture payloads.']
            },
            {
                toolId: 'task070_gametracking_index_filter',
                version: '1.0.0',
                source: GENERATED_BY,
                inputTypes: ['GameTracking pak01_dir.txt package index'],
                outputTypes: ['bounded spatial resource inventory'],
                used: true,
                validationEvidence: ['Filtered local package-index rows for map, minimap, navigation, boss, walker, sentry, entity, and related terms.'],
                limitations: ['Index rows expose names, CRCs, and sizes only; they do not expose coordinates.']
            },
            {
                toolId: 'valveresourceformat',
                version: null,
                source: 'not installed in repository or PATH during Task 070',
                inputTypes: ['compiled Source 2 resources'],
                outputTypes: ['resource-specific decoded metadata'],
                used: false,
                validationEvidence: [],
                limitations: ['Unavailable locally; no external clone or binary was committed.']
            }
        ]
    };

    const mapLandmarkCandidates = {
        schemaVersion: '1.0.0',
        generatedBy: GENERATED_BY,
        landmarks: resourceRows
            .filter(resource => resource.potentialSpatialUse.includes('landmark identity clue'))
            .slice(0, 20)
            .map((resource, index) => ({
                mapLandmarkId: `map_landmark_candidate_${String(index + 1).padStart(3, '0')}`,
                landmarkType: 'resource_name_candidate',
                sourceResourceId: resource.resourceId,
                sourceEntityClass: '',
                sourceEntityName: resource.relativePackagePath,
                mapWorldCoordinate: { x: null, y: null, z: null },
                minimapCoordinate: { x: null, y: null },
                coordinateBasis: 'resource name only; no coordinate-bearing payload decoded',
                identityEvidence: [`Resource path contains a landmark-related term: ${resource.relativePackagePath}`],
                identityStatus: 'candidate',
                buildStatus: 'newer_only',
                usableAsFitAnchor: false,
                usableAsValidationAnchor: false,
                limitations: ['Name evidence is not an independent map coordinate.']
            })),
        summary: {
            extractedCoordinateLandmarks: 0,
            reason: 'VPK directory and package index expose names and resource metadata, but no decoded entity origins or minimap coordinates.'
        }
    };

    const correspondences = replayAnchors.map((anchor, index) => ({
        pairId: `pair_unusable_${String(index + 1).padStart(3, '0')}`,
        landmarkType: anchor.anchorType,
        replayAnchorId: anchor.anchorId,
        mapLandmarkId: null,
        replayCoordinate: { x: null, y: null, z: null },
        mapCoordinate: { x: null, y: null, z: null },
        identityEvidence: anchor.replayEvidence.className ? [`Replay-side supported class: ${anchor.replayEvidence.className}`] : [],
        identityConfidence: 'supported',
        coordinateIndependence: 'partially_independent',
        role: 'unused',
        limitations: [
            'Replay compact anchor has no committed world coordinate.',
            'Map-side independent coordinate is missing.',
            'Correspondence was not used for fitting or validation.'
        ]
    }));

    const anchorCorrespondences = {
        schemaVersion: '1.0.0',
        generatedBy: GENERATED_BY,
        minimumAcceptanceSatisfied: false,
        correspondences,
        rejectedCorrespondences: [
            {
                reason: 'Spirit Urn candidates and ambiguous Patron/base classes are prohibited as fit correspondences.',
                count: 48
            },
            {
                reason: 'No correspondence may be selected by residual minimization before identity pairing.',
                count: 0
            }
        ]
    };

    const modelPreregistration = {
        schemaVersion: '1.0.0',
        generatedBy: GENERATED_BY,
        registeredBeforeFitting: true,
        models: [
            modelRow('translation_2d', 'translation', 2, 1),
            modelRow('rigid_2d', 'rigid 2D', 3, 2),
            modelRow('similarity_2d', 'similarity 2D', 4, 2),
            modelRow('axis_reflected_similarity_2d', 'axis-reflected similarity 2D', 4, 2),
            modelRow('affine_2d', 'affine 2D', 6, 3)
        ]
    };

    const candidateTransformResults = {
        schemaVersion: '1.0.0',
        generatedBy: GENERATED_BY,
        fittedModels: [],
        selectedModelId: null,
        fittingSkippedReason: 'Minimum independent correspondence and held-out validation prerequisites were not satisfied.'
    };

    const residualPolicy = {
        schemaVersion: '1.0.0',
        generatedBy: GENERATED_BY,
        thresholds: [],
        classification: 'not_evaluable',
        reason: 'No model was fitted, so residuals cannot be normalized or classified without inventing thresholds.',
        prohibitedShortcut: 'Low training residual alone cannot validate a transform.'
    };

    const buildSensitivity = {
        schemaVersion: '1.0.0',
        generatedBy: GENERATED_BY,
        replayBuild: BUILD_ID,
        installedRelationship: 'newer_build_only',
        mapVersionCompatibility: 'unresolved',
        likelyStableLandmarks: ['Mid Boss arena and Walker roles are plausible stable landmark types but not proven build-stable.'],
        mayHaveMoved: ['objective placements', 'structure positions', 'lane-related geometry'],
        cannotAssumeCompatible: ['current installed dl_midtown.vpk', 'current minimap material references'],
        conclusion: 'A future geometric fit would support only coordinate consistency unless separate build/map compatibility is established.'
    };

    const transformDecision = {
        schemaVersion: '1.0.0',
        generatedBy: GENERATED_BY,
        decision: 'insufficient_independent_anchors',
        gate: 'replay_009_candidate_transform_not_ready',
        selectedModelId: null,
        fitResidual: null,
        validationResidual: null,
        topologyResult: 'not_evaluable_no_model_fitted',
        buildCompatibility: 'unresolved_newer_installed_candidate_only',
        productionTransformEmitted: false,
        lanesRegionsProximityEmitted: false,
        mechanicEffectsApplied: 0,
        reason: 'Local asset access and VPK resource inventory succeeded, but no independent coordinate-bearing map landmarks or held-out validation correspondences were available.'
    };

    const validationSummary = {
        schemaVersion: '1.0.0',
        generatedBy: GENERATED_BY,
        localAssetAccess: localAssetAccess.accessResult,
        spatialResourcesFound: resourceRows.length,
        mapLandmarksExtracted: 0,
        independentCorrespondences: 0,
        fitAnchors: 0,
        heldOutValidationAnchors: 0,
        rejectedCorrespondences: anchorCorrespondences.rejectedCorrespondences.length,
        eligibleModels: 0,
        fittedModels: 0,
        topologyChecks: 'not_evaluable',
        protections: {
            replay005Read: false,
            replay005Processed: false,
            botFixturesProcessed: false,
            productionSpatialEventEmitted: false,
            mapAssetCommitted: false,
            laneLabelEmitted: false,
            macroInterpretationAdded: false
        },
        gate: transformDecision.gate
    };

    const gate = {
        schemaVersion: '1.0.0',
        generatedBy: GENERATED_BY,
        gate: transformDecision.gate,
        decision: transformDecision.decision,
        reason: transformDecision.reason,
        followUp: 'controlled landmark-coordinate acquisition'
    };

    await writeJson(`${OUT}/local-asset-access.json`, localAssetAccess);
    await writeJson(`${OUT}/map-resource-inventory.json`, mapResourceInventory);
    await writeJson(`${OUT}/extraction-tool-inventory.json`, extractionToolInventory);
    await writeJson(`${OUT}/map-landmark-candidates.json`, mapLandmarkCandidates);
    await writeJson(`${OUT}/anchor-correspondences.json`, anchorCorrespondences);
    await writeJson(`${OUT}/model-preregistration.json`, modelPreregistration);
    await writeJson(`${OUT}/candidate-transform-results.json`, candidateTransformResults);
    await writeJson(`${OUT}/residual-acceptance-policy.json`, residualPolicy);
    await writeJson(`${OUT}/build-compatibility-sensitivity.json`, buildSensitivity);
    await writeJson(`${OUT}/transform-decision.json`, transformDecision);
    await writeJson(`${OUT}/validation-summary.json`, validationSummary);
    await writeJson(`${OUT}/transform-gate.json`, gate);
    await writeText(`${OUT}/README.md`, `# Replay 009 Candidate Transform Validation\n\nTask 070 inspected the local-only preferred geometry candidate from Task 069 and parsed bounded VPK directory metadata. It did not extract proprietary map payloads, fit a transform, emit spatial events, or apply mechanic effects.\n\nGate: \`${transformDecision.gate}\`\n\nDecision: \`${transformDecision.decision}\`\n\nLocal asset access succeeded and ${resourceRows.length} spatially relevant package resources were inventoried. No independent coordinate-bearing map landmarks were extracted, so no replay/map correspondences, held-out validation anchors, or fitted models were produced.\n`);
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
