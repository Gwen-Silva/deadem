import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

import { Logger, Player } from 'deadem';

const SAMPLES_DIR = 'samples';
const DATA_DIR = 'data';
const OUTPUT_DIR = 'output';
const OUTPUT_REPLAY_DIR = path.join(OUTPUT_DIR, 'replays');
const OUTPUT_SIZE_LIMIT = 10 * 1024 * 1024;
const MAX_REPLAYS = 5;
const ROLE_BY_INDEX = [
    'development',
    'generalization',
    'generalization',
    'generalization',
    'final_holdout'
];
const STAGES = [
    'replay_loading',
    'player_field_discovery',
    'snapshot_normalization',
    'controller_pawn_lifecycle',
    'clock_discovery',
    'tick_reconciliation',
    'player_timeline',
    'data_quality',
    'canonical_timeline',
    'hero_identity',
    'build_identification',
    'lane_mapping',
    'topology',
    'spatial_regions',
    'movement',
    'occupancy_optional'
];
const CRITICAL_CLASSES = [
    'CCitadelPlayerController',
    'CCitadelPlayerPawn',
    'CCitadelGameRulesProxy'
];
const OUTPUTS = {
    manifest: path.join(DATA_DIR, 'replay-manifest.json'),
    summary: path.join(OUTPUT_DIR, 'replay-intake-summary.json'),
    matrix: path.join(OUTPUT_DIR, 'replay-compatibility-matrix.json'),
    plan: path.join(OUTPUT_DIR, 'replay-processing-plan.json'),
    audit: path.join(OUTPUT_DIR, 'replay-script-parameterization-audit.json')
};

main();

async function main() {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.mkdir(OUTPUT_DIR, { recursive: true });
    await fs.mkdir(OUTPUT_REPLAY_DIR, { recursive: true });

    const files = await discoverReplayFiles();
    const replayEntries = [];

    for (const [ index, file ] of files.entries()) {
        const replayId = `replay_${String(index + 1).padStart(3, '0')}`;
        const assignedRole = ROLE_BY_INDEX[index] ?? 'unassigned';
        const base = await buildBaseReplayEntry(file, replayId, assignedRole);
        const metadata = await inspectReplay(base);
        replayEntries.push({ ...base, ...metadata.manifestFields, intake: metadata.intake });
        await fs.mkdir(path.join(OUTPUT_REPLAY_DIR, replayId), { recursive: true });
        await fs.writeFile(path.join(OUTPUT_REPLAY_DIR, replayId, '.gitkeep'), '');
    }

    const baseline = replayEntries.find(replay => replay.replayId === 'replay_001') ?? null;
    const compatibility = buildCompatibilityMatrix(replayEntries, baseline);
    const manifest = buildManifest(replayEntries, compatibility);
    const plan = buildProcessingPlan(replayEntries, compatibility);
    const audit = await buildScriptParameterizationAudit();
    const summary = buildSummary(replayEntries, compatibility, plan, audit);

    await writeJson(OUTPUTS.manifest, manifest);
    await writeJson(OUTPUTS.summary, summary);
    await writeJson(OUTPUTS.matrix, compatibility);
    await writeJson(OUTPUTS.plan, plan);
    await writeJson(OUTPUTS.audit, audit);
    await validateOutputs(Object.values(OUTPUTS));

    console.log(`replays found: ${replayEntries.length}`);
    console.log(`gate: ${summary.gateResult}`);
    console.log(`manifest: ${OUTPUTS.manifest}`);
}

async function discoverReplayFiles() {
    const entries = await fs.readdir(SAMPLES_DIR, { withFileTypes: true }).catch(() => []);
    return entries
        .filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith('.dem'))
        .map(entry => path.join(SAMPLES_DIR, entry.name))
        .sort((left, right) => left.localeCompare(right))
        .slice(0, MAX_REPLAYS);
}

async function buildBaseReplayEntry(filePath, replayId, role) {
    const stats = await fs.stat(filePath);
    return {
        replayId,
        originalFilename: path.basename(filePath),
        localPath: normalizeRelativePath(filePath),
        sha256: await sha256File(filePath),
        sizeBytes: stats.size,
        modifiedTimeUtc: stats.mtime.toISOString(),
        role,
        privacyDistributionStatus: 'local_private_not_committed',
        notes: replayNotes(replayId)
    };
}

async function inspectReplay(entry) {
    const player = new Player(undefined, Logger.NOOP);
    const warnings = [];
    const errors = [];
    let loadSuccess = false;
    let firstTick = null;
    let effectiveFirstTick = null;
    let lastTick = null;
    let tickRate = null;
    let durationSeconds = null;
    let currentTick = null;
    let classCounts = {};
    let criticalEntityClasses = {};
    let playerControllers = [];
    let playerPawns = [];
    let heroIdentities = [];
    let teamDistribution = {};
    let clockAvailability = {};
    let parserStats = null;
    let map = null;
    let build = null;
    let contentVersion = null;

    try {
        await player.load(createReadStream(entry.localPath));
        loadSuccess = true;
        firstTick = player.getFirstTick();
        effectiveFirstTick = firstTick < 0 ? 0 : firstTick;
        lastTick = player.getLastTick();
        tickRate = player.getDemo().server?.tickRate ?? null;
        durationSeconds = tickRate === null ? null : round((lastTick - effectiveFirstTick) / tickRate);
        await player.seekToTick(Math.min(Math.max(effectiveFirstTick, 0), lastTick));
        await player.seekToTick(lastTick);
        currentTick = player.getCurrentTick();

        const demo = player.getDemo();
        parserStats = normalizeValue(demo.getStats());
        classCounts = Object.fromEntries(demo.getClasses()
            .map(clazz => [ clazz.name, demo.getEntitiesByClassName(clazz.name).length ])
            .sort(([ left ], [ right ]) => left.localeCompare(right)));
        criticalEntityClasses = Object.fromEntries(CRITICAL_CLASSES.map(className => [ className, classCounts[className] ?? 0 ]));
        playerControllers = inspectControllers(demo);
        playerPawns = inspectPawns(demo);
        heroIdentities = playerControllers
            .filter(controller => controller.steamId !== '0')
            .map(controller => ({
                playerName: controller.playerName,
                steamId: controller.steamId,
                heroIdRaw: controller.heroIdRaw,
                team: controller.team
            }));
        teamDistribution = countBy(playerControllers.filter(controller => controller.steamId !== '0'), controller => String(controller.team ?? 'unknown'));
        clockAvailability = inspectClock(demo);
        map = demo.server?.mapName ?? null;
        build = demo.server?.buildNum ?? null;
        contentVersion = demo.server?.contentVersion ?? null;

        if (build === null) {
            warnings.push('build_not_exposed_by_demo_server_metadata');
        }
        if (map === null) {
            warnings.push('map_not_exposed_by_demo_server_metadata');
        }
    } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
    } finally {
        await player.dispose();
    }

    const parserVersion = await packageVersion('packages/deadem/package.json');
    const playerCount = playerControllers.filter(controller => controller.steamId !== '0').length || null;
    const pawnCount = playerPawns.length || null;
    const compatibilityStatus = classifyPrimaryStatus({ loadSuccess, errors, build, map, playerCount, pawnCount, durationSeconds });

    return {
        manifestFields: {
            build,
            contentVersion,
            map,
            durationSeconds,
            playerCount,
            heroCount: unique(heroIdentities.map(hero => hero.heroIdRaw).filter(value => value !== null)).length || null,
            compatibilityStatus,
            processingStatus: 'intake_only',
            parserVersion,
            geometryProfile: null,
            validationFlags: validationFlags({ loadSuccess, errors, warnings, build, map, playerCount, pawnCount })
        },
        intake: {
            loadSuccess,
            firstTick,
            effectiveFirstTick,
            lastTick,
            currentTick,
            tickRate,
            durationSeconds,
            parserStats,
            playerControllerCount: playerControllers.length,
            realPlayerControllerCount: playerCount,
            pawnCount,
            heroIdentities,
            teamDistribution,
            clockAvailability,
            criticalEntityClasses,
            playerRelatedClasses: Object.entries(classCounts)
                .filter(([ className ]) => /(player|hero|citadel)/i.test(className))
                .map(([ className, count ]) => ({ className, count }))
                .slice(0, 120),
            warnings,
            errors
        }
    };
}

function inspectControllers(demo) {
    return demo.getEntitiesByClassName('CCitadelPlayerController').map(entity => ({
        index: entity.index,
        handle: entity.handle,
        playerName: normalizeScalar(entity.getField('m_iszPlayerName')),
        steamId: normalizeScalar(entity.getField('m_steamID')) ?? '0',
        team: normalizeScalar(entity.getField('m_iTeamNum')),
        heroIdRaw: normalizeScalar(entity.getField('m_nHeroID')),
        heroPawnHandle: normalizeScalar(entity.getField('m_hHeroPawn')),
        pawnHandle: normalizeScalar(entity.getField('m_hPawn'))
    }));
}

function inspectPawns(demo) {
    return demo.getEntitiesByClassName('CCitadelPlayerPawn').map(entity => ({
        index: entity.index,
        handle: entity.handle,
        team: normalizeScalar(entity.getField('m_iTeamNum')),
        controllerHandle: normalizeScalar(entity.getField('m_hController')),
        alive: normalizeScalar(entity.getField('m_bAlive'))
    }));
}

function inspectClock(demo) {
    const gameRules = demo.getEntitiesByClassName('CCitadelGameRulesProxy')[0] ?? null;
    return {
        gameRulesPresent: gameRules !== null,
        matchClockUpdateTick: normalizeScalar(gameRules?.getField('m_nMatchClockUpdateTick')),
        matchClockUpdateClock: normalizeScalar(gameRules?.getField('m_flMatchClockUpdateClock')),
        gameState: normalizeScalar(gameRules?.getField('m_nGameState'))
    };
}

function buildManifest(entries, compatibility) {
    const byReplay = new Map(compatibility.replays.map(replay => [ replay.replayId, replay ]));
    return {
        schemaVersion: 1,
        datasetId: 'deadlock-five-replay-study',
        replays: entries.map(entry => ({
            replayId: entry.replayId,
            originalFilename: entry.originalFilename,
            localPath: entry.localPath,
            sha256: entry.sha256,
            sizeBytes: entry.sizeBytes,
            modifiedTimeUtc: entry.modifiedTimeUtc,
            role: entry.role,
            privacyDistributionStatus: entry.privacyDistributionStatus,
            notes: entry.notes,
            build: entry.build,
            contentVersion: entry.contentVersion,
            map: entry.map,
            durationSeconds: entry.durationSeconds,
            playerCount: entry.playerCount,
            heroCount: entry.heroCount,
            compatibilityStatus: byReplay.get(entry.replayId)?.primaryCompatibilityStatus ?? entry.compatibilityStatus,
            processingStatus: entry.processingStatus,
            parserVersion: entry.parserVersion,
            geometryProfile: entry.geometryProfile,
            validationFlags: entry.validationFlags
        }))
    };
}

function buildCompatibilityMatrix(entries, baseline) {
    const replays = entries.map(entry => {
        const dimensions = compatibilityDimensions(entry, baseline);
        return {
            replayId: entry.replayId,
            originalFilename: entry.originalFilename,
            role: entry.role,
            primaryCompatibilityStatus: primaryStatusFromDimensions(entry, dimensions),
            dimensions,
            buildComparisonToReplay001: compareValue(entry.build, baseline?.build),
            contentVersionComparisonToReplay001: compareValue(entry.contentVersion, baseline?.contentVersion),
            mapComparisonToReplay001: compareValue(entry.map, baseline?.map),
            geometryRisk: geometryRisk(entry, dimensions),
            parserWarnings: entry.intake.warnings,
            parserErrors: entry.intake.errors
        };
    });

    return {
        schemaVersion: 1,
        datasetId: 'deadlock-five-replay-study',
        baselineReplayId: baseline?.replayId ?? null,
        compatibilityStatuses: [
            'compatible_same_build',
            'compatible_known_geometry',
            'compatible_geometry_unverified',
            'different_build_supported',
            'different_build_requires_geometry',
            'parser_incompatible',
            'corrupted_or_incomplete',
            'insufficient_metadata'
        ],
        replays,
        groups: {
            byBuild: countBy(replays, replay => String(entries.find(entry => entry.replayId === replay.replayId)?.build ?? 'unknown')),
            byMap: countBy(replays, replay => String(entries.find(entry => entry.replayId === replay.replayId)?.map ?? 'unknown')),
            byPrimaryStatus: countBy(replays, replay => replay.primaryCompatibilityStatus)
        },
        finalHoldoutProtection: {
            replayId: 'replay_005',
            allowedDuringIntake: [ 'file hash', 'file size', 'basic parser metadata', 'compatibility dimensions' ],
            prohibitedUntilPipelineFrozen: [
                'threshold selection',
                'rule design',
                'geometry calibration',
                'architecture selection',
                'debugging based on expected outputs',
                'best-model selection'
            ]
        }
    };
}

function compatibilityDimensions(entry, baseline) {
    const parserCompatible = entry.intake.loadSuccess && entry.intake.errors.length === 0;
    const tickCompatible = parserCompatible && Number.isFinite(entry.intake.lastTick) && entry.intake.lastTick > 0 && Number.isFinite(entry.intake.tickRate);
    const playerCompatible = parserCompatible && entry.playerCount === 12;
    const heroCompatible = parserCompatible && (entry.heroCount ?? 0) >= 10;
    const mapKnown = entry.map !== null;
    const buildKnown = entry.build !== null || entry.contentVersion !== null;
    const sameBuild = buildKnown && baseline && (entry.build === baseline.build || entry.contentVersion === baseline.contentVersion);
    return {
        parserCompatibility: parserCompatible ? 'pass' : 'fail',
        tickDomainCompatibility: tickCompatible ? 'pass' : 'fail',
        canonicalTimelineCompatibility: tickCompatible && playerCompatible ? 'likely_parameterizable' : 'blocked',
        playerIdentityCompatibility: playerCompatible ? 'pass' : 'needs_review',
        heroIdentityCompatibility: heroCompatible ? 'pass' : 'needs_review',
        mapCompatibility: mapKnown ? baseline?.map === entry.map ? 'same_as_replay_001' : 'map_known_differs_or_unverified' : 'unknown',
        geometryCompatibility: sameBuild && mapKnown ? 'same_build_but_unverified' : 'unverified',
        occupancyModelCompatibility: 'blocked_until_geometry_confirmed',
        buildMetadataCompatibility: buildKnown ? sameBuild ? 'same_as_replay_001' : 'different_or_unverified' : 'unknown'
    };
}

function primaryStatusFromDimensions(entry, dimensions) {
    if (!entry.intake.loadSuccess) {
        return entry.sizeBytes > 0 ? 'parser_incompatible' : 'corrupted_or_incomplete';
    }
    if (dimensions.buildMetadataCompatibility === 'unknown' || dimensions.mapCompatibility === 'unknown') {
        return 'insufficient_metadata';
    }
    if (dimensions.geometryCompatibility === 'same_build_but_unverified') {
        return 'compatible_geometry_unverified';
    }
    if (dimensions.buildMetadataCompatibility === 'different_or_unverified') {
        return 'different_build_requires_geometry';
    }
    return 'compatible_geometry_unverified';
}

function classifyPrimaryStatus({ loadSuccess, errors, build, map, playerCount, pawnCount, durationSeconds }) {
    if (!loadSuccess) {
        return errors.length > 0 ? 'parser_incompatible' : 'corrupted_or_incomplete';
    }
    if (!Number.isFinite(durationSeconds) || playerCount === null || pawnCount === null) {
        return 'insufficient_metadata';
    }
    if (build === null || map === null) {
        return 'insufficient_metadata';
    }
    return 'compatible_geometry_unverified';
}

function replayNotes(replayId) {
    if (replayId === 'replay_004') {
        return [ 'initial_role_includes_generalization_and_stability' ];
    }
    if (replayId === 'replay_005') {
        return [ 'final_holdout_metadata_only_until_pipeline_and_hypothesis_are_frozen' ];
    }
    return [];
}

function buildProcessingPlan(entries, compatibility) {
    return {
        schemaVersion: 1,
        outputIsolation: {
            futureDirectories: entries.map(entry => `output/replays/${entry.replayId}/`),
            currentPolicy: 'directories contain .gitkeep placeholders only; existing output files are not moved',
            replay001MigrationPlan: [
                { existingPattern: 'output/01-*.json', futureDirectory: 'output/replays/replay_001/01/' },
                { existingPattern: 'output/02-*.json', futureDirectory: 'output/replays/replay_001/02/' },
                { existingPattern: 'output/03-*.json through output/18-*.json', futureDirectory: 'output/replays/replay_001/experiments_03_18/' },
                { existingPattern: 'output/22-*.json through output/24-*.json', futureDirectory: 'output/replays/replay_001/lane_occupancy_diagnostics/' }
            ],
            destructiveMigrationPerformed: false
        },
        replays: entries.map(entry => ({
            replayId: entry.replayId,
            role: entry.role,
            processingStatus: entry.processingStatus,
            primaryCompatibilityStatus: compatibility.replays.find(replay => replay.replayId === entry.replayId)?.primaryCompatibilityStatus ?? entry.compatibilityStatus,
            stages: STAGES.map(stage => stagePlan(stage, entry))
        }))
    };
}

function stagePlan(stage, entry) {
    const script = scriptForStage(stage);
    const occupancy = stage === 'occupancy_optional';
    const blockedByGeometry = [ 'lane_mapping', 'topology', 'spatial_regions', 'movement', 'occupancy_optional' ].includes(stage);
    return {
        stage,
        status: occupancy ? 'blocked_optional' : blockedByGeometry ? 'blocked_until_geometry_compatibility' : 'planned',
        dependencies: dependenciesForStage(stage),
        expectedInput: expectedInputForStage(stage, entry),
        expectedOutput: `output/replays/${entry.replayId}/${stage}.json`,
        canReuseExistingScript: script !== null && !occupancy,
        existingScript: script,
        requiresParameterization: true,
        requiresReplayReprocessing: ![ 'lane_mapping', 'topology', 'spatial_regions', 'movement', 'occupancy_optional' ].includes(stage),
        blockingReason: occupancy
            ? 'occupancy is explicitly excluded until geometry compatibility is confirmed'
            : blockedByGeometry
                ? 'geometry and map/build compatibility are unverified'
                : null
    };
}

async function buildScriptParameterizationAudit() {
    const scripts = [];
    const files = (await fs.readdir('experiments'))
        .filter(file => /^(0[1-9]|1[0-8])-.*\.js$/u.test(file))
        .sort((left, right) => left.localeCompare(right));

    for (const file of files) {
        const filePath = path.join('experiments', file);
        const text = await fs.readFile(filePath, 'utf8');
        const assumptions = {
            hardCodedDemo: /partida_001\.dem|DEFAULT_DEMO|DEMO_FILE/u.test(text),
            hardCodedOutputPaths: /const OUTPUT_|OUTPUT_FILE|writeJson\('\.\/output/u.test(text),
            build6592: /6592|lane-topology-6592/u.test(text),
            oneReplayOnly: !/process\.argv|--demo=|DEMO_ARGUMENT_PREFIX/u.test(text) || /partida_001\.dem/u.test(text),
            oneMapOnly: /lane|topology|region|map/iu.test(text) && /6592|spatial|topology/u.test(text),
            fixedPlayerIds: /playerIndex|playerIndexes|playerRows/u.test(text) && !/replayId/u.test(text),
            fixedHeroLists: /hero|heroes|heroId/iu.test(text) && !/replayId/u.test(text),
            fixedLaneColors: /Yellow|Blue|Purple|Green|laneCodeRaw|lane_1|lane_2|lane_3/u.test(text),
            globalOutputs: /'\.\/output\//u.test(text)
        };
        scripts.push({
            script: filePath.replaceAll('\\', '/'),
            classification: classifyScript(assumptions),
            assumptions,
            recommendedAction: recommendedAction(assumptions)
        });
    }

    return {
        schemaVersion: 1,
        scope: 'experiments 01-18',
        classifications: {
            multi_replay_ready: scripts.filter(script => script.classification === 'multi_replay_ready').map(script => script.script),
            parameterizable: scripts.filter(script => script.classification === 'parameterizable').map(script => script.script),
            requires_refactor: scripts.filter(script => script.classification === 'requires_refactor').map(script => script.script),
            build_specific: scripts.filter(script => script.classification === 'build_specific').map(script => script.script),
            replay_specific: scripts.filter(script => script.classification === 'replay_specific').map(script => script.script)
        },
        scripts
    };
}

function classifyScript(assumptions) {
    if (assumptions.build6592 || assumptions.oneMapOnly || assumptions.fixedLaneColors) {
        return 'build_specific';
    }
    if (assumptions.hardCodedDemo && assumptions.hardCodedOutputPaths && assumptions.oneReplayOnly) {
        return 'replay_specific';
    }
    if (assumptions.hardCodedDemo || assumptions.hardCodedOutputPaths || assumptions.globalOutputs) {
        return 'parameterizable';
    }
    if (assumptions.fixedPlayerIds || assumptions.fixedHeroLists) {
        return 'requires_refactor';
    }
    return 'multi_replay_ready';
}

function buildSummary(entries, compatibility, plan, audit) {
    const loadable = entries.filter(entry => entry.intake.loadSuccess && entry.intake.errors.length === 0);
    const additionalLoadable = loadable.filter(entry => entry.replayId !== 'replay_001');
    const statuses = compatibility.replays.map(replay => replay.primaryCompatibilityStatus);
    let gateResult = 'replay_intake_blocked';
    if (statuses.some(status => status === 'different_build_requires_geometry') || statuses.some(status => status === 'insufficient_metadata')) {
        gateResult = loadable.length >= 2 ? 'replays_require_build_specific_work' : 'replay_intake_blocked';
    } else if (entries.length === 5 && loadable.length === 5) {
        gateResult = 'five_replays_ready_for_pipeline_refactor';
    } else if (loadable.length >= 2) {
        gateResult = 'partial_replay_set_ready';
    }

    return {
        schemaVersion: 1,
        datasetId: 'deadlock-five-replay-study',
        gateResult,
        replayFilesFound: entries.length,
        missingReplayCount: Math.max(0, MAX_REPLAYS - entries.length),
        loadableReplayCount: loadable.length,
        loadableAdditionalReplayCount: additionalLoadable.length,
        replayInventory: entries.map(entry => ({
            replayId: entry.replayId,
            originalFilename: entry.originalFilename,
            sizeBytes: entry.sizeBytes,
            sha256: entry.sha256,
            modifiedTimeUtc: entry.modifiedTimeUtc,
            role: entry.role,
            primaryCompatibilityStatus: compatibility.replays.find(replay => replay.replayId === entry.replayId)?.primaryCompatibilityStatus,
            parserErrors: entry.intake.errors
        })),
        buildsDetected: Object.fromEntries(entries.map(entry => [ entry.replayId, entry.build ])),
        mapsDetected: Object.fromEntries(entries.map(entry => [ entry.replayId, entry.map ])),
        geometryRisks: Object.fromEntries(compatibility.replays.map(replay => [ replay.replayId, replay.geometryRisk ])),
        reusablePipelineStages: STAGES.filter(stage => ![ 'lane_mapping', 'topology', 'spatial_regions', 'movement', 'occupancy_optional' ].includes(stage)),
        scriptsReadyWithoutRefactor: audit.classifications.multi_replay_ready,
        scriptsRequiringParameterization: [
            ...audit.classifications.parameterizable,
            ...audit.classifications.replay_specific,
            ...audit.classifications.build_specific,
            ...audit.classifications.requires_refactor
        ],
        nextRecommendedTask: gateResult === 'replays_require_build_specific_work'
            ? 'abstract replay build/map metadata and geometry compatibility before common pipeline parameterization'
            : 'parameterize common pipeline stages 01-18, process replay_002 first as smoke test',
        finalHoldoutProtection: compatibility.finalHoldoutProtection,
        outputIsolation: plan.outputIsolation,
        parserFailures: Object.fromEntries(entries.map(entry => [ entry.replayId, entry.intake.errors ]))
    };
}

function validationFlags({ loadSuccess, errors, warnings, build, map, playerCount, pawnCount }) {
    const flags = [];
    if (!loadSuccess || errors.length > 0) {
        flags.push('parser_load_failed');
    }
    if (build === null) {
        flags.push('build_metadata_missing');
    }
    if (map === null) {
        flags.push('map_metadata_missing');
    }
    if (playerCount !== 12) {
        flags.push('unexpected_real_player_count');
    }
    if ((pawnCount ?? 0) < 12) {
        flags.push('unexpected_pawn_count');
    }
    flags.push(...warnings);
    return unique(flags);
}

function geometryRisk(entry, dimensions) {
    if (dimensions.geometryCompatibility === 'same_build_but_unverified') {
        return 'same build/content metadata if available, but lane topology must still be verified before reuse';
    }
    if (entry.build === null && entry.map === null) {
        return 'build and map metadata unavailable; build 6592 geometry must not be reused automatically';
    }
    return 'geometry unverified; preserve historical map/lane differences';
}

function compareValue(value, baselineValue) {
    if (value === null || baselineValue === null || baselineValue === undefined) {
        return 'unknown';
    }
    return value === baselineValue ? 'same' : 'different';
}

function scriptForStage(stage) {
    return {
        replay_loading: 'experiments/01-validate-replay.js',
        player_field_discovery: 'experiments/02-inspect-player-fields.js',
        snapshot_normalization: 'experiments/03-normalize-player-snapshots.js',
        controller_pawn_lifecycle: 'experiments/04-analyze-controller-pawn-lifecycle.js',
        clock_discovery: 'experiments/05-discover-game-clock.js',
        tick_reconciliation: 'experiments/06-reconcile-tick-domains.js',
        player_timeline: 'experiments/07-player-timeline.js',
        data_quality: 'experiments/08-analyze-data-quality.js',
        canonical_timeline: 'experiments/09-build-canonical-player-timeline.js',
        hero_identity: 'experiments/10-map-hero-identities.js',
        build_identification: 'experiments/12-identify-replay-build.js',
        lane_mapping: 'experiments/13-enrich-heroes-and-map-lanes.js',
        topology: 'experiments/16-reconcile-lane-topology.js',
        spatial_regions: 'experiments/17-build-spatial-presence-model.js',
        movement: 'experiments/18-build-movement-segments.js',
        occupancy_optional: null
    }[stage] ?? null;
}

function dependenciesForStage(stage) {
    const map = {
        replay_loading: [],
        player_field_discovery: [ 'replay_loading' ],
        snapshot_normalization: [ 'player_field_discovery' ],
        controller_pawn_lifecycle: [ 'snapshot_normalization' ],
        clock_discovery: [ 'snapshot_normalization' ],
        tick_reconciliation: [ 'clock_discovery' ],
        player_timeline: [ 'tick_reconciliation' ],
        data_quality: [ 'player_timeline' ],
        canonical_timeline: [ 'data_quality' ],
        hero_identity: [ 'canonical_timeline' ],
        build_identification: [ 'hero_identity' ],
        lane_mapping: [ 'build_identification' ],
        topology: [ 'lane_mapping' ],
        spatial_regions: [ 'topology' ],
        movement: [ 'spatial_regions' ],
        occupancy_optional: [ 'movement', 'geometry_compatibility_confirmed' ]
    };
    return map[stage] ?? [];
}

function expectedInputForStage(stage, entry) {
    if (stage === 'replay_loading') {
        return entry.localPath;
    }
    return `output/replays/${entry.replayId}/${dependenciesForStage(stage).at(-1) ?? 'previous_stage'}.json`;
}

function recommendedAction(assumptions) {
    if (assumptions.build6592 || assumptions.oneMapOnly || assumptions.fixedLaneColors) {
        return 'separate build/map geometry inputs before multi-replay use';
    }
    if (assumptions.hardCodedDemo || assumptions.hardCodedOutputPaths || assumptions.globalOutputs) {
        return 'parameterize replay path, replay ID, and output directory';
    }
    if (assumptions.fixedPlayerIds || assumptions.fixedHeroLists) {
        return 'verify player/hero source fields per replay before reuse';
    }
    return 'no immediate refactor identified by static audit';
}

async function sha256File(filePath) {
    const hash = createHash('sha256');
    await new Promise((resolve, reject) => {
        const stream = createReadStream(filePath);
        stream.on('data', chunk => hash.update(chunk));
        stream.on('error', reject);
        stream.on('end', resolve);
    });
    return hash.digest('hex');
}

async function packageVersion(packageFile) {
    const data = JSON.parse(await fs.readFile(packageFile, 'utf8'));
    return data.version ?? null;
}

async function writeJson(filePath, value) {
    await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function validateOutputs(files) {
    for (const file of files) {
        JSON.parse(await fs.readFile(file, 'utf8'));
        const stats = await fs.stat(file);
        if (stats.size > OUTPUT_SIZE_LIMIT) {
            throw new Error(`${file} is ${stats.size} bytes, above ${OUTPUT_SIZE_LIMIT}`);
        }
    }
}

function normalizeRelativePath(filePath) {
    return filePath.replaceAll('\\', '/');
}

function normalizeScalar(value) {
    if (typeof value === 'bigint') {
        return value.toString();
    }
    if (value === undefined) {
        return null;
    }
    return value;
}

function normalizeValue(value) {
    if (typeof value === 'bigint') {
        return value.toString();
    }
    if (Array.isArray(value)) {
        return value.map(item => normalizeValue(item));
    }
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([ key, item ]) => [ key, normalizeValue(item) ]));
    }
    return value ?? null;
}

function countBy(items, keyFn) {
    const counts = {};
    for (const item of items) {
        const keyValue = keyFn(item);
        counts[keyValue] = (counts[keyValue] ?? 0) + 1;
    }
    return Object.fromEntries(Object.entries(counts).sort(([ left ], [ right ]) => String(left).localeCompare(String(right))));
}

function unique(values) {
    return Array.from(new Set(values));
}

function round(value) {
    return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
}
