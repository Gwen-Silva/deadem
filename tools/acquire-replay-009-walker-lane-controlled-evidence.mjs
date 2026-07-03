import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const OUT = path.join(ROOT, 'output', 'replay-009-walker-lane-controlled-evidence');
const REPORT = path.join(ROOT, 'reports', 'replay-009-walker-lane-controlled-evidence.md');

function readJson(relativePath) {
    return JSON.parse(readFileSync(path.join(ROOT, relativePath), 'utf8'));
}

function readJsonl(relativePath) {
    const fullPath = path.join(ROOT, relativePath);
    if (!existsSync(fullPath)) {
        return [];
    }
    const text = readFileSync(fullPath, 'utf8').trim();
    return text ? text.split(/\r?\n/u).map(line => JSON.parse(line)) : [];
}

function writeJson(name, value) {
    writeFileSync(path.join(OUT, name), `${JSON.stringify(value, null, 2)}\n`);
}

function writeText(name, value) {
    writeFileSync(path.join(OUT, name), value);
}

function commandAvailable(command) {
    const result = spawnSync('where.exe', [ command ], { encoding: 'utf8' });
    return result.status === 0;
}

function pythonOpenCvStatus() {
    const pythonPath = path.join(ROOT, '.venv-video', 'Scripts', 'python.exe');
    if (!existsSync(pythonPath)) {
        return { available: false, version: null };
    }
    const result = spawnSync(pythonPath, [ '-c', 'import cv2; print(cv2.__version__)' ], { encoding: 'utf8' });
    return {
        available: result.status === 0,
        version: result.status === 0 ? result.stdout.trim() : null
    };
}

function sha256(value) {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function secondsFromGameTime(value) {
    if (!value) {
        return null;
    }
    const [ minutes, seconds ] = value.split(':').map(Number);
    return (minutes * 60) + seconds;
}

function main() {
    mkdirSync(OUT, { recursive: true });

    const task078Summary = readJson('output/replay-009-walker-lane-evidence/acquisition-summary.json');
    const task078Decisions = readJson('output/replay-009-walker-lane-evidence/walker-identity-decisions.json');
    const task078Correspondence = readJson('output/replay-009-walker-lane-evidence/correspondence-readiness.json');
    const mapResourceInventory = readJson('output/replay-009-transform-validation/map-resource-inventory.json');
    const extractionTools = readJson('output/replay-009-transform-validation/extraction-tool-inventory.json');
    const localSpatialSources = readJson('output/replay-009-spatial-inputs/local-source-inventory.json');
    const humanEvents = readJson('output/replay-009-human-annotations/event-annotations.json');
    const videoComparisons = readJsonl('output/replay-009-validation/event-source-comparison.jsonl');

    const videoPath = 'samples/videos/replay_009_independent_validation.mp4.mp4';
    const localFrameDir = 'output-local/replay-009-walker-lane-controlled-evidence';
    const localFrameManifest = `${localFrameDir}/frame-extraction-manifest.txt`;
    const openCv = pythonOpenCvStatus();

    const sourceAvailability = {
        schemaVersion: '1.0.0',
        taskId: '079',
        sources: [
            {
                sourceId: 'current_deadlock_client_replay_open',
                available: false,
                newRelativeToTasks077And078: true,
                independentOfCoordinates: true,
                transferableToReplay009: false,
                limitations: [
                    'No automated, non-interactive client replay-open check is available in this repository task.',
                    'Launching the game client would be interactive and was not required after deterministic video/local metadata sources were examined.',
                    'Participant report says replay 009 began failing after a 2026-06-30 update; this task did not modify or open the replay.'
                ]
            },
            {
                sourceId: 'older_compatible_deadlock_build',
                available: false,
                newRelativeToTasks077And078: false,
                independentOfCoordinates: true,
                transferableToReplay009: false,
                limitations: [
                    'Task 069/070 metadata records installed build relationship as newer or unresolved, not exact replay-build compatibility.',
                    'No older compatible build was found or used.'
                ]
            },
            {
                sourceId: 'existing_replay_009_video_opencv',
                available: existsSync(path.join(ROOT, videoPath)) && openCv.available,
                newRelativeToTasks077And078: true,
                independentOfCoordinates: true,
                transferableToReplay009: true,
                limitations: [
                    `Video path exists: ${existsSync(path.join(ROOT, videoPath))}.`,
                    `OpenCV available: ${openCv.available}${openCv.version ? ` (${openCv.version})` : ''}.`,
                    'Bounded local contact sheets were inspected, but no unique handle-specific Walker signal was visible.'
                ]
            },
            {
                sourceId: 'ffmpeg_ffprobe_video_tooling',
                available: commandAvailable('ffmpeg') && commandAvailable('ffprobe'),
                newRelativeToTasks077And078: false,
                independentOfCoordinates: true,
                transferableToReplay009: true,
                limitations: [
                    'ffmpeg and ffprobe are not both available on PATH in this environment.',
                    'OpenCV was used instead for bounded local contact sheets.'
                ]
            },
            {
                sourceId: 'task064_local_frame_artifacts',
                available: existsSync(path.join(ROOT, 'output-local', 'replay-009-validation', 'task064-windows')),
                newRelativeToTasks077And078: false,
                independentOfCoordinates: true,
                transferableToReplay009: true,
                limitations: [
                    'Existing Task 064 frame artifacts are local-only and class/set-level for Walker evidence.',
                    'They do not provide a new handle-to-lane identity source.'
                ]
            },
            {
                sourceId: 'valveresourceformat_or_equivalent',
                available: commandAvailable('Source2Viewer-CLI') || commandAvailable('VRF.CLI'),
                newRelativeToTasks077And078: true,
                independentOfCoordinates: true,
                transferableToReplay009: false,
                limitations: [
                    'Source2Viewer-CLI and VRF.CLI were not found on PATH.',
                    'Task 070 tools still expose package/index metadata only, not identity-bearing entity lumps.'
                ]
            },
            {
                sourceId: 'new_parser_lane_fields',
                available: false,
                newRelativeToTasks077And078: false,
                independentOfCoordinates: true,
                transferableToReplay009: false,
                limitations: [
                    'Task 077 and 078 bounded fields found raw team values but no lane, route, spawn, targetname, or stable map entity identifier.',
                    'Task 079 found no newly available parser field outside those prior compact outputs.'
                ]
            },
            {
                sourceId: 'controlled_custom_match_transfer',
                available: false,
                newRelativeToTasks077And078: true,
                independentOfCoordinates: true,
                transferableToReplay009: false,
                limitations: [
                    'No controlled custom-match capture was provided or produced.',
                    'Current-build observations would not identify replay-009 handles unless the same replay-exposed field was present.'
                ]
            }
        ]
    };

    const installedSource = localSpatialSources.sources.find(source => source.sourceId === 'local_installed_dl_midtown_vpk');
    const replayClientCompatibility = {
        schemaVersion: '1.0.0',
        taskId: '079',
        replayId: 'replay_009',
        currentClientOpenAttempted: false,
        currentClientOpenStatus: 'not_attempted_interactive_client_required',
        observedFailure: null,
        clientBuildEvidence: localSpatialSources.sources
            .filter(source => source.sourceType === 'steam_app_manifest' || source.sourceType === 'installed_game_map_package')
            .map(source => ({
                sourceId: source.sourceId,
                believedMapVersion: source.believedMapVersion,
                buildCompatibilityStatus: source.buildCompatibilityStatus,
                limitations: source.limitations
            })),
        olderCompatibleBuildAvailable: false,
        unsafeModificationRequired: null,
        controlledOriginalReplayCapturePossible: false,
        limitations: [
            'No replay was opened or modified.',
            'Installed map package remains possible but unconfirmed for replay build 23916427.',
            installedSource ? `Installed candidate source: ${installedSource.path}.` : 'Installed map source not found in Task 069 inventory.'
        ]
    };

    const resourceMatches = (mapResourceInventory.resources ?? [])
        .filter(resource => /walker|tier2|boss_health_t2|boss_defense|sentry|route|lane|spawn/iu.test(resource.relativePackagePath ?? ''))
        .map(resource => ({
            resourceId: resource.resourceId,
            relativePackagePath: resource.relativePackagePath,
            resourceType: resource.resourceType,
            inspectionStatus: resource.inspectionStatus,
            targetFieldsDecoded: [],
            exactReplayIdentifierFound: false,
            exactMapLaneFound: false,
            usableForReplayMapJoin: false,
            limitations: [
                'Available metadata is package/index-level only.',
                'No targetname, hammer ID, lane, route, spawn group, or exact replay-observable identifier was decoded.'
            ]
        }));
    const mapIdentityExtraction = {
        schemaVersion: '1.0.0',
        taskId: '079',
        tooling: (extractionTools.tools ?? []).map(tool => ({
            toolId: tool.toolId,
            used: tool.used,
            limitations: tool.limitations
        })),
        targetFields: [
            'targetname',
            'hammer_id',
            'entity_id',
            'lane',
            'route',
            'path',
            'spawn_group',
            'team',
            'objective_index',
            'parent_or_owner',
            'yellow_blue_green_name',
            'stable_replay_identifier'
        ],
        resourceMatches,
        exactReplayMapIdentityJoins: [],
        status: 'no_identity_bearing_metadata_decoded'
    };

    const targetAnnotations = [
        {
            annotationEventId: 'human_event_1355_enemy_green_walker',
            namedTeam: 'amber',
            namedLane: 'green'
        },
        {
            annotationEventId: 'human_event_1906_allied_green_walker',
            namedTeam: 'sapphire',
            namedLane: 'green'
        },
        {
            annotationEventId: 'human_event_2235_allied_blue_walker',
            namedTeam: 'sapphire',
            namedLane: 'blue'
        }
    ];
    const eventById = new Map(humanEvents.events.map(event => [ event.annotationEventId, event ]));
    const controlledVideoObservations = {
        schemaVersion: '1.0.0',
        taskId: '079',
        localFrameArtifacts: {
            directory: localFrameDir,
            manifestAvailable: existsSync(path.join(ROOT, localFrameManifest)),
            committed: false,
            limitations: [
                'Contact sheets are local-only and intentionally untracked.',
                'They were used only to look for non-spatial unique signals.'
            ]
        },
        observations: targetAnnotations.map(target => {
            const annotation = eventById.get(target.annotationEventId);
            const candidateEntityKeys = task078Decisions.decisions
                .filter(decision => decision.namedTeam === target.namedTeam)
                .map(decision => decision.entityKey);
            return {
                observationId: `obs_${target.annotationEventId}`,
                namedTeam: target.namedTeam,
                namedLane: target.namedLane,
                videoOrClientTime: annotation?.humanReportedGameTime ?? null,
                parserWindow: {
                    status: 'not_directly_mapped',
                    humanReportedSeconds: secondsFromGameTime(annotation?.humanReportedGameTime),
                    limitations: [
                        'Human reported game time is not parserSeconds.',
                        'Task 057 found no reliable active-game or pause-adjusted time mapping.'
                    ]
                },
                visibleNonSpatialSignals: [],
                candidateEntityKeys,
                uniquelyLinkedEntityKey: null,
                status: 'set_level_only',
                coordinatesUsed: false,
                limitations: [
                    'Bounded contact-sheet inspection showed no readable exact Walker health, debug/entity identifier, or unique state signal.',
                    'Named team and lane are human visual annotation, but no handle-specific signal links the visible Walker to one parser entity.',
                    'Existing Task 064 Walker overlays remain class/set-level.'
                ]
            };
        })
    };

    const transferabilityAssessment = {
        schemaVersion: '1.0.0',
        taskId: '079',
        customMatchUsed: false,
        transferableFieldSemanticsFound: [],
        currentMapEntityIdentityUsed: false,
        replay009SpecificHandleIdentityUsed: false,
        fieldSemanticBoundary: [
            'A current-build custom match could only transfer field semantics if the same serializer/property exists in replay 009 and raw encoding compatibility is documented.',
            'No such custom-match field evidence was available for this task.',
            'Current-map entity identity cannot identify replay-009 handles without a shared replay-exposed field.'
        ],
        status: 'no_transferable_custom_match_evidence'
    };

    const decisionByEntity = new Map(task078Decisions.decisions.map(decision => [ decision.entityKey, decision ]));
    const walkerLaneDecisions = {
        schemaVersion: '1.0.0',
        taskId: '079',
        decisions: task078Decisions.decisions.map(decision => ({
            entityKey: decision.entityKey,
            namedTeam: decision.namedTeam,
            lane: 'unknown',
            mapLandmarkId: null,
            laneStatus: 'unresolved',
            landmarkStatus: 'unresolved',
            newEvidenceSourceIds: [],
            identityEstablishedBeforeResiduals: false,
            coordinatesUsedForIdentity: false,
            limitations: [
                'Named faction is inherited from Task 078.',
                'Task 079 found no new replay-009-specific non-coordinate lane identity.',
                'No lane or map landmark assignment was forced.'
            ]
        }))
    };

    const coordinateReadyEntityKeys = task078Correspondence.rows
        .filter(row => row.coordinateReady)
        .map(row => row.entityKey);
    const identityReadyCoordinateRows = walkerLaneDecisions.decisions
        .filter(decision => coordinateReadyEntityKeys.includes(decision.entityKey) && decision.laneStatus !== 'unresolved');
    const transformPrerequisiteDecision = {
        schemaVersion: '1.0.0',
        taskId: '079',
        coordinateReadyWalkers: coordinateReadyEntityKeys.length,
        laneIdentityReadyWalkers: walkerLaneDecisions.decisions.filter(decision => decision.laneStatus !== 'unresolved').length,
        coordinateReadyIdentifiedWalkers: identityReadyCoordinateRows.length,
        fitEligibleCorrespondences: 0,
        validationEligibleCorrespondences: 0,
        fitAndValidationIdentitiesIndependent: false,
        transformRetryEligible: false,
        transformFitted: false,
        residualsCalculated: false,
        permutationSearchPerformed: false,
        coordinatesUsedForIdentity: false,
        reasons: [
            'No Walker handle has a newly grounded Yellow/Blue/Green lane identity.',
            'No handle is joined to a specific Task 072 map-side Walker landmark.',
            'No held-out validation anchor can be preregistered.'
        ]
    };

    const summary = {
        schemaVersion: '1.0.0',
        taskId: '079',
        gate: 'replay_009_walker_lane_identity_evidence_unavailable',
        newEvidenceSourcesAudited: sourceAvailability.sources.length,
        meaningfulSourcesExamined: [
            'existing_replay_009_video_opencv',
            'task064_local_frame_artifacts',
            'task070_map_resource_metadata',
            'task078_parser_team_controls'
        ],
        controlledVideoWindowsInspected: controlledVideoObservations.observations.length,
        exactReplayMapIdentityJoins: 0,
        uniqueVideoToHandleLinks: 0,
        customMatchEvidenceUsed: false,
        transferableFieldSemanticsFound: 0,
        namedLanesResolved: 0,
        namedMapLandmarksResolved: 0,
        coordinateReadyIdentifiedWalkers: 0,
        fitEligibleCorrespondences: 0,
        validationEligibleCorrespondences: 0,
        transformRetryEligible: false,
        coordinatesUsedForIdentity: false,
        permutationSearchPerformed: false,
        residualsCalculated: false,
        transformFitted: false,
        spatialOutputsEmitted: false,
        mechanicEffectsApplied: 0,
        highestImpactGap: 'no replay-009-specific non-coordinate signal links a Walker handle to Yellow, Blue, or Green lane',
        recommendedFollowUp: 'blocked_spatial_milestone_reassessment',
        sourceHashes: {
            sourceAvailability: sha256(sourceAvailability),
            replayClientCompatibility: sha256(replayClientCompatibility),
            mapIdentityExtraction: sha256(mapIdentityExtraction),
            controlledVideoObservations: sha256(controlledVideoObservations),
            transferabilityAssessment: sha256(transferabilityAssessment),
            walkerLaneDecisions: sha256(walkerLaneDecisions),
            transformPrerequisiteDecision: sha256(transformPrerequisiteDecision)
        }
    };

    const gate = {
        schemaVersion: '1.0.0',
        taskId: '079',
        gate: summary.gate,
        decision: 'permitted_sources_examined_no_handle_to_lane_identity',
        transformRetryAllowed: false,
        repeatBroadIdentitySearchAllowed: false,
        mechanicEffectsApplied: 0
    };

    writeJson('source-availability.json', sourceAvailability);
    writeJson('replay-client-compatibility.json', replayClientCompatibility);
    writeJson('map-identity-extraction.json', mapIdentityExtraction);
    writeJson('controlled-video-observations.json', controlledVideoObservations);
    writeJson('transferability-assessment.json', transferabilityAssessment);
    writeJson('walker-lane-decisions.json', walkerLaneDecisions);
    writeJson('transform-prerequisite-decision.json', transformPrerequisiteDecision);
    writeJson('summary.json', summary);
    writeJson('gate.json', gate);
    writeText('README.md', `# Replay 009 Walker Lane Controlled Evidence\n\nTask 079 audits genuinely new non-coordinate sources for replay-009 Walker lane identity.\n\nGate: \`${summary.gate}\`\n\nTask 079 preserves Task 078 named faction support for all six \`CNPC_Boss_Tier2\` Walker handles, but it resolves zero Yellow/Blue/Green lanes and zero specific map-side Walker landmarks. OpenCV-based local contact sheets were inspected for the three participant Walker windows, existing Task 064 local frames were considered, and map-resource tooling availability was checked. No replay-specific handle-to-lane signal was found.\n\nNo coordinates, residuals, permutation search, transform, regions, proximity, mechanic effects, or macro conclusions were used or emitted.\n`);

    writeFileSync(REPORT, `# Replay 009 Walker Lane Controlled Evidence\n\nTask: \`079-acquire-replay-009-walker-lane-only-identity-capture\`\n\nGate: \`${summary.gate}\`\n\n## Summary\n\nTask 079 examined the permitted new-source paths for linking replay-009 Walker handles to Yellow/Blue/Green lanes. It preserved Task 078's named faction mapping for all six \`CNPC_Boss_Tier2\` Walker handles, then checked whether any new source could resolve individual lane identity before residual inspection.\n\nNo valid handle-to-lane source was found. OpenCV is available and the replay-009 validation video exists, so bounded local contact sheets were extracted and inspected for the three participant Walker annotations. They did not expose readable exact Walker health, debug/entity identifiers, or another handle-unique non-spatial signal. Existing Task 064 frames and overlays remain class/set-level. ffmpeg/ffprobe and VRF/Source2Viewer CLI were unavailable on PATH; Task 070 map metadata still exposes package/index names only, not identity-bearing entity lumps.\n\n## Results\n\n- New evidence sources audited: ${summary.newEvidenceSourcesAudited}\n- Controlled video windows inspected: ${summary.controlledVideoWindowsInspected}\n- Exact replay/map identity joins: 0\n- Unique video-to-handle links: 0\n- Custom-match evidence used: false\n- Transferable field semantics found: 0\n- Named lanes resolved: 0\n- Named map landmarks resolved: 0\n- Coordinate-ready identified Walkers: 0\n- Fit-eligible correspondences: 0\n- Validation-eligible correspondences: 0\n- Transform retry eligible: false\n\n## Limits\n\nNo replay was opened or modified. Replay 005 and bot fixtures 006-008 were not read or processed. No coordinates, coordinate ordering, coordinate signs, nearest landmarks, symmetry, player paths, residuals, permutation search, transform fitting, production spatial fields, regions, proximity, mechanic effects, or macro interpretation were used.\n\n## Recommendation\n\nDo not repeat Tasks 077-079 without a genuinely new replay-compatible source. The next blocked step should reassess the spatial milestone and decide whether to pause replay-009 transform work, proceed with cross-replay canonical generalization, improve map/resource extraction tooling, or wait for a new replay-compatible evidence source.\n`);

    const task081 = path.join(ROOT, 'tasks', 'blocked', '081-reassess-spatial-milestone-after-walker-lane-evidence-unavailable.md');
    if (!existsSync(task081)) {
        writeFileSync(task081, `# Task 081: Reassess Spatial Milestone After Walker Lane Evidence Unavailable\n\nStatus: blocked\n\nExecution mode: autonomous after explicit authorization\n\nBlocked by: Task 079 gate \`replay_009_walker_lane_identity_evidence_unavailable\`\n\nUnlocked by: explicit user authorization to reassess the spatial milestone after Task 079\n\n## Objective\n\nReassess the replay-009 spatial-foundation milestone after Tasks 077-079 failed to produce replay-specific non-coordinate Walker lane identity evidence.\n\n## Constraints\n\nDo not repeat broad Walker identity searches without genuinely new evidence. Do not process replay 005 or bot fixtures 006-008. Do not fit a transform, calculate residuals, emit regions/proximity, apply mechanic effects, or infer macro conclusions.\n\n## Acceptance Criteria\n\nRecommend whether to pause replay-009 transform work, proceed with cross-replay canonical generalization using replays 001-004, improve map/resource extraction tooling, or wait for a genuinely new replay-compatible evidence source.\n\n## Required validation\n\nTask queue validation, documentation consistency checks, and Git status validation.\n\n## Stop conditions\n\nStop if reassessment would require a methodological decision not specified by the task.\n`);
    }

    const outputText = JSON.stringify({
        sourceAvailability,
        replayClientCompatibility,
        mapIdentityExtraction,
        controlledVideoObservations,
        transferabilityAssessment,
        walkerLaneDecisions,
        transformPrerequisiteDecision,
        summary,
        gate
    });
    if (/[A-Z]:[\\/]/u.test(outputText)) {
        throw new Error('Committed outputs must not contain absolute local paths');
    }
}

main();
