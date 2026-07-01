import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const OUT = path.join(ROOT, 'output', 'replay-009-walker-lane-evidence');
const REPORT = path.join(ROOT, 'reports', 'replay-009-walker-lane-identity-evidence-acquisition.md');

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

function sha256(value) {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function unique(values) {
    return [ ...new Set(values.filter(value => value !== null && value !== undefined)) ];
}

function commandStatus(command) {
    const located = spawnSync('where.exe', [ command ], { encoding: 'utf8' });
    if (located.status !== 0) {
        return {
            command,
            available: false,
            normalizedPath: null,
            version: null,
            limitations: [ `${command} was not found on PATH; no new frame extraction or ffprobe metadata was produced.` ]
        };
    }

    const version = spawnSync(command, [ '-version' ], { encoding: 'utf8' });
    return {
        command,
        available: true,
        normalizedPath: `PATH:${command}`,
        version: version.stdout.split(/\r?\n/u)[0] || null,
        limitations: [ 'Executable path is normalized to avoid committing machine-specific absolute paths.' ]
    };
}

function secondsFromGameTime(value) {
    if (!value) {
        return null;
    }
    const [ minutes, seconds ] = value.split(':').map(Number);
    return (minutes * 60) + seconds;
}

function flattenOutputText(files) {
    return files.map(file => JSON.stringify(file)).join('\n');
}

function main() {
    mkdirSync(OUT, { recursive: true });

    const roster = readJson('output/replay-009-validation/player-roster.json');
    const humanPacket = readJson('output/replay-009-human-annotations/annotation-packet.json');
    const humanEvents = readJson('output/replay-009-human-annotations/event-annotations.json');
    const walkerFingerprints = readJson('output/replay-009-walker-identity/walker-identity-fingerprints.json').fingerprints;
    const measurement = readJson('output/replay-009-landmark-measurement/measured-landmarks.json');
    const fitPlan = readJson('output/replay-009-landmark-measurement/fit-validation-anchor-plan.json');
    const mapResources = readJson('output/replay-009-transform-validation/map-resource-inventory.json');
    const extractionTools = readJson('output/replay-009-transform-validation/extraction-tool-inventory.json');
    const validationComparisons = readJsonl('output/replay-009-validation/event-source-comparison.jsonl');
    const objectiveEvents = readJsonl('output/replay-009-states/objective-structure-factual-events.jsonl');

    const players = roster.players ?? roster.roster ?? roster;
    const aresius = players.find(player => player.heroName === 'Aresius' || player.heroClass === 'Aresius' || player.playerKey === 'Aresius');
    const humanSource = humanPacket.source ?? humanPacket.provenance ?? humanPacket.annotationSource;
    const participantEvidence = {
        participantName: humanSource.participantPlayerName,
        participantHero: humanSource.participantHero,
        parserPlayerKey: aresius?.playerKey ?? null,
        parserRawTeamValue: aresius?.team ?? null,
        evidenceStatus: aresius ? 'supported' : 'not_found',
        limitations: [
            'Parser roster exposes player display names in the heroName/heroClass field path for this compact output.',
            'The participant packet is advisory human evidence, independent from parser output but not independent from the match origin.'
        ]
    };

    const hiddenKingEnemy = humanEvents.events.some(event => /hidden_king_enemy|Hidden King\/enemy/iu.test(`${event.eventType} ${event.summary}`));
    const archmotherAllied = humanEvents.events.some(event => /Archmother team takes|allied/iu.test(`${event.eventType} ${event.summary}`));
    const namedTeamControls = [];
    if (aresius?.team === 3 && hiddenKingEnemy && archmotherAllied) {
        namedTeamControls.push({
            rawTeamValue: 3,
            namedTeam: 'sapphire',
            faction: 'archmother',
            confidence: 'supported',
            evidence: [
                'Parser roster maps participant name Aresius to raw team value 3.',
                'Human packet identifies Archmother/Sapphire as the top replay-side faction and Hidden King as enemy in replay annotations.',
                'Human packet reports Archmother team taking Rejuvenator charges.'
            ],
            limitations: [
                'This maps raw team values to named factions only; it does not identify Walker lanes.',
                'Human participant evidence is advisory and cannot validate exact coordinates.'
            ]
        });
        namedTeamControls.push({
            rawTeamValue: 2,
            namedTeam: 'amber',
            faction: 'hidden_king',
            confidence: 'supported',
            evidence: [
                'Replay 009 roster has exactly two raw teams with six players each.',
                'Raw team value 3 is supported as the participant/Archmother/Sapphire side; the other player team is raw value 2.',
                'Human packet refers to Hidden King as enemy.'
            ],
            limitations: [
                'This is a derived two-team complement, not a direct parser faction label.',
                'It must not be used to infer lane identity or map symbol pairing.'
            ]
        });
    }

    const teamByRaw = new Map(namedTeamControls.map(row => [ row.rawTeamValue, row ]));
    const walkerEventsByEntity = new Map();
    for (const event of objectiveEvents.filter(event => event.mechanicId === 'walker')) {
        const rows = walkerEventsByEntity.get(event.entityKey) ?? [];
        rows.push(event);
        walkerEventsByEntity.set(event.entityKey, rows);
    }

    const rawTeamControlMapping = {
        schemaVersion: '1.0.0',
        taskId: '078',
        replayId: 'replay_009',
        participantControl: participantEvidence,
        namedTeamControls,
        rawTeamValuesMapped: namedTeamControls.length,
        walkerTeamAssignments: walkerFingerprints.map(walker => {
            const mapped = teamByRaw.get(walker.rawTeamValue);
            return {
                entityKey: walker.entityKey,
                className: walker.className,
                rawTeamValue: walker.rawTeamValue,
                namedTeam: mapped?.namedTeam ?? null,
                faction: mapped?.faction ?? null,
                confidence: mapped?.confidence ?? 'unknown',
                evidenceRefs: mapped ? [ `raw_team_control_${walker.rawTeamValue}` ] : [],
                coordinateUsedForIdentity: false,
                lane: null,
                mapLandmarkId: null,
                limitations: [
                    'Named team assignment does not imply lane or map landmark identity.',
                    'No coordinate sign, map position, symmetry, nearest symbol, residual, or permutation evidence was used.'
                ]
            };
        }),
        result: namedTeamControls.length === 2 ? 'raw_team_values_mapped_to_named_factions_with_constraints' : 'raw_team_mapping_unresolved'
    };

    const resources = mapResources.resources ?? mapResources;
    const walkerResourceMatches = resources
        .filter(resource => /tier2|boss_health_t2|boss_health_fill_t2|boss_defense|walker/iu.test(resource.relativePackagePath ?? resource.resourceId ?? ''))
        .map(resource => ({
            resourceId: resource.resourceId,
            relativePackagePath: resource.relativePackagePath,
            resourceType: resource.resourceType,
            inspectionStatus: resource.inspectionStatus,
            candidateMeaning: 'walker_or_tier2_material_or_model_metadata',
            explicitLaneOrTeamField: false,
            explicitReplayJoinKey: false,
            usableForHandleToLandmarkJoin: false,
            limitations: [
                'Package index metadata exposes resource names only; no entity-lump targetname, lane, route, spawn, or map entity ID join was decoded.',
                'Resource names are class/set-level clues, not individual replay handle identities.'
            ]
        }));

    const mapWalkerIdentityMetadata = {
        schemaVersion: '1.0.0',
        taskId: '078',
        sources: [
            'output/replay-009-transform-validation/map-resource-inventory.json',
            'output/replay-009-transform-validation/extraction-tool-inventory.json',
            'output/replay-009-landmark-measurement/measured-landmarks.json'
        ],
        extractionTools: (extractionTools.tools ?? extractionTools).map(tool => ({
            toolId: tool.toolId,
            used: tool.used,
            outputTypes: tool.outputTypes,
            limitations: tool.limitations
        })),
        walkerResourceMatches,
        measuredMapWalkerLandmarks: (measurement.landmarks ?? measurement)
            .filter(landmark => landmark.landmarkType === 'walker' && landmark.imageId === 'img_standard_replay_minimap')
            .map(landmark => ({
                landmarkId: landmark.landmarkId,
                team: landmark.team,
                lane: landmark.lane,
                identityStatus: landmark.identityStatus,
                pixelCoordinateAvailable: Boolean(landmark.pixelCoordinate),
                usableForIdentityJoin: false,
                limitations: [
                    'Map-side landmark label is available, but no non-coordinate replay handle join exists.',
                    'Pixel coordinates are not used in Task 078 identity decisions.'
                ]
            })),
        directJoinFound: false
    };

    const replayMapIdentityJoins = {
        schemaVersion: '1.0.0',
        taskId: '078',
        joins: rawTeamControlMapping.walkerTeamAssignments.flatMap(walker => {
            const mapLandmarks = mapWalkerIdentityMetadata.measuredMapWalkerLandmarks
                .filter(landmark => landmark.team === walker.namedTeam);
            if (!walker.namedTeam) {
                return [];
            }
            return mapLandmarks.map(landmark => ({
                replayEntityKey: walker.entityKey,
                rawTeamValue: walker.rawTeamValue,
                namedTeam: walker.namedTeam,
                mapLandmarkId: landmark.landmarkId,
                lane: landmark.lane,
                joinStatus: 'team_only_not_lane_or_landmark',
                coordinateUsedForIdentity: false,
                residualUsed: false,
                permutationSearchUsed: false,
                eligibleAsCorrespondence: false,
                limitations: [
                    'Named team narrows the possible Walker landmarks from six to three.',
                    'No non-coordinate evidence selects Yellow, Blue, or Green lane for this handle.'
                ]
            }));
        }),
        directHandleToNamedLandmarkJoins: 0,
        teamOnlyJoins: rawTeamControlMapping.walkerTeamAssignments.filter(walker => walker.namedTeam).length,
        laneResolvedJoins: 0
    };

    const ffmpeg = commandStatus('ffmpeg');
    const ffprobe = commandStatus('ffprobe');
    const videoPath = 'samples/videos/replay_009_independent_validation.mp4.mp4';
    const videoToolingStatus = {
        schemaVersion: '1.0.0',
        taskId: '078',
        videoPath,
        videoExists: existsSync(path.join(ROOT, videoPath)),
        tools: [ ffmpeg, ffprobe ],
        boundedFrameExtractionPerformed: false,
        reason: ffmpeg.available && ffprobe.available
            ? 'Tooling is available, but no deterministic non-coordinate signal was identified that could uniquely link visible Walker to replay handle.'
            : 'ffmpeg/ffprobe are unavailable on PATH in this environment.',
        limitations: [
            'Existing Task 064 visual overlays remain class/set-level for Walkers.',
            'Task 078 did not use visual fit, coordinate signs, or map position to identify handles.'
        ]
    };

    const walkerAnnotations = humanEvents.events.filter(event => /walker/iu.test(event.eventType));
    const walkerValidationRows = validationComparisons.filter(row => row.mechanicId === 'walker');
    const videoVisibleWalkerSignals = walkerAnnotations.map(annotation => ({
        annotationEventId: annotation.annotationEventId,
        humanReportedGameTime: annotation.humanReportedGameTime,
        reportedSeconds: secondsFromGameTime(annotation.humanReportedGameTime),
        visibleTeam: /allied/iu.test(annotation.eventType) ? 'sapphire' : /enemy/iu.test(annotation.eventType) ? 'amber' : 'unknown',
        visibleLane: /green/iu.test(annotation.eventType) ? 'green' : /blue/iu.test(annotation.eventType) ? 'blue' : /yellow/iu.test(annotation.eventType) ? 'yellow' : 'unknown',
        directVisibility: annotation.directVisibility,
        candidateReplayHandles: rawTeamControlMapping.walkerTeamAssignments
            .filter(walker => walker.namedTeam === (/allied/iu.test(annotation.eventType) ? 'sapphire' : /enemy/iu.test(annotation.eventType) ? 'amber' : 'unknown'))
            .map(walker => walker.entityKey),
        uniqueHandleResolved: false,
        classification: 'visible_named_team_lane_but_no_handle_join',
        limitations: [
            'Human annotation reports a visible named lane Walker, but no parser handle-specific temporal or visual signal selects one entity.',
            'Human-reported game time is not parserSeconds.'
        ]
    }));

    const replayWalkerWindowFingerprints = rawTeamControlMapping.walkerTeamAssignments.map(walker => {
        const events = walkerEventsByEntity.get(walker.entityKey) ?? [];
        return {
            entityKey: walker.entityKey,
            rawTeamValue: walker.rawTeamValue,
            namedTeam: walker.namedTeam,
            eventCount: events.length,
            firstEventTick: events.find(event => event.demoTick !== null)?.demoTick ?? null,
            lastEventTick: events.toReversed().find(event => event.demoTick !== null)?.demoTick ?? null,
            eventTypes: unique(events.map(event => event.eventType)).sort(),
            healthEventCount: events.filter(event => /^health_/u.test(event.eventType)).length,
            rawStateEventCount: events.filter(event => event.eventType === 'raw_state_changed').length,
            distinguishingPower: 'insufficient_for_video_handle_correlation',
            limitations: [
                'Event fingerprints distinguish raw event history but do not encode lane or visual landmark identity.',
                'No handle-specific visible UI marker or name is present in committed overlays.'
            ]
        };
    });

    const videoHandleCorrelations = walkerValidationRows.map(row => ({
        comparisonId: row.comparisonId,
        parserEventId: row.parserEventId,
        entityKey: row.entityKey,
        className: row.className,
        comparisonStatus: row.comparisonStatus,
        visibility: row.visibility,
        confidence: row.confidence,
        linkedNamedTeam: rawTeamControlMapping.walkerTeamAssignments.find(walker => walker.entityKey === row.entityKey)?.namedTeam ?? null,
        linkedLane: null,
        uniqueHandleCorrelation: false,
        correlationStatus: 'class_or_set_level_only',
        limitations: [
            'Task 064 supports Walker class/set visibility only.',
            'No sampled overlay maps a visible named lane Walker to this specific replay handle.'
        ]
    }));

    const walkerIdentityDecisions = {
        schemaVersion: '1.0.0',
        taskId: '078',
        decisions: rawTeamControlMapping.walkerTeamAssignments.map(walker => {
            const possibleLandmarks = mapWalkerIdentityMetadata.measuredMapWalkerLandmarks
                .filter(landmark => landmark.team === walker.namedTeam)
                .map(landmark => landmark.landmarkId);
            return {
                entityKey: walker.entityKey,
                rawTeamValue: walker.rawTeamValue,
                namedTeam: walker.namedTeam,
                namedTeamStatus: walker.namedTeam ? 'supported' : 'unresolved',
                lane: null,
                laneStatus: 'unresolved',
                mapLandmarkId: null,
                mapLandmarkStatus: 'unresolved',
                possibleMapLandmarks: possibleLandmarks,
                identityEstablishedWithoutCoordinates: Boolean(walker.namedTeam),
                handleToNamedWalkerLandmarkEstablished: false,
                eligibleForTransformCorrespondence: false,
                evidence: walker.namedTeam ? walker.evidenceRefs : [],
                limitations: [
                    'Named team support is not sufficient for a Walker correspondence because each team has three Walker landmarks.',
                    'Lane and map landmark identity remain unresolved before residual inspection.'
                ]
            };
        })
    };

    const coordinateReadyKeys = walkerFingerprints
        .filter(walker => walker.coordinateAvailability.coordinateStatus === 'stable_fixed')
        .map(walker => walker.entityKey);
    const correspondenceReadiness = {
        schemaVersion: '1.0.0',
        taskId: '078',
        summary: {
            walkerGenerations: walkerFingerprints.length,
            namedTeamResolvedWalkers: walkerIdentityDecisions.decisions.filter(row => row.namedTeamStatus === 'supported').length,
            laneResolvedWalkers: 0,
            coordinateReadyWalkers: coordinateReadyKeys.length,
            coordinateReadyNamedTeamWalkers: walkerIdentityDecisions.decisions
                .filter(row => coordinateReadyKeys.includes(row.entityKey) && row.namedTeamStatus === 'supported').length,
            fitEligibleCorrespondences: 0,
            validationEligibleCorrespondences: 0,
            transformRetryAllowed: false
        },
        rows: walkerIdentityDecisions.decisions.map(row => ({
            entityKey: row.entityKey,
            namedTeamReady: row.namedTeamStatus === 'supported',
            laneReady: false,
            mapLandmarkReady: false,
            coordinateReady: coordinateReadyKeys.includes(row.entityKey),
            fitEligible: false,
            validationEligible: false,
            exclusionReasons: [
                row.namedTeamStatus === 'supported' ? null : 'named_team_unresolved',
                'lane_identity_unresolved',
                'map_landmark_unresolved',
                coordinateReadyKeys.includes(row.entityKey) ? null : 'replay_coordinate_unavailable'
            ].filter(Boolean)
        })),
        sourceTask072FitPlan: {
            candidateFitAnchors: fitPlan.candidateFitAnchors,
            reservedValidationAnchors: fitPlan.reservedValidationAnchors
        }
    };

    const hasNamedTeams = correspondenceReadiness.summary.namedTeamResolvedWalkers > 0;
    const hasLaneOrLandmark = correspondenceReadiness.summary.fitEligibleCorrespondences > 0;
    const gate = hasLaneOrLandmark
        ? 'replay_009_walker_lane_identity_evidence_ready'
        : hasNamedTeams
            ? 'replay_009_walker_lane_identity_evidence_ready_with_gaps'
            : 'replay_009_walker_lane_identity_evidence_not_found';

    const acquisitionSummary = {
        schemaVersion: '1.0.0',
        taskId: '078',
        gate,
        rawTeamControlsEvaluated: 2,
        rawTeamValuesMappedToNamedFactions: rawTeamControlMapping.rawTeamValuesMapped,
        namedTeamResolvedWalkers: correspondenceReadiness.summary.namedTeamResolvedWalkers,
        laneResolvedWalkers: correspondenceReadiness.summary.laneResolvedWalkers,
        handleToNamedLandmarkJoins: replayMapIdentityJoins.directHandleToNamedLandmarkJoins,
        mapMetadataDirectJoins: 0,
        videoSignalsEvaluated: videoVisibleWalkerSignals.length,
        uniqueVideoToHandleCorrelations: 0,
        coordinateReadyNamedTeamWalkers: correspondenceReadiness.summary.coordinateReadyNamedTeamWalkers,
        fitEligibleCorrespondences: 0,
        validationEligibleCorrespondences: 0,
        transformFitted: false,
        residualsComputed: false,
        permutationSearchPerformed: false,
        lanesRegionsProximityEmitted: false,
        mechanicEffectsApplied: 0,
        highestImpactGap: 'lane identity and handle-to-named-Walker-landmark join remain unresolved',
        recommendedFollowUp: hasNamedTeams
            ? 'blocked_lane_only_walker_identity_capture'
            : 'blocked_spatial_milestone_reassessment',
        sourceHashes: {
            rawTeamControlMapping: sha256(rawTeamControlMapping),
            mapWalkerIdentityMetadata: sha256(mapWalkerIdentityMetadata),
            replayMapIdentityJoins: sha256(replayMapIdentityJoins),
            videoToolingStatus: sha256(videoToolingStatus),
            videoVisibleWalkerSignals: sha256(videoVisibleWalkerSignals),
            replayWalkerWindowFingerprints: sha256(replayWalkerWindowFingerprints),
            videoHandleCorrelations: sha256(videoHandleCorrelations),
            walkerIdentityDecisions: sha256(walkerIdentityDecisions),
            correspondenceReadiness: sha256(correspondenceReadiness)
        }
    };

    const acquisitionGate = {
        schemaVersion: '1.0.0',
        taskId: '078',
        gate,
        decision: hasNamedTeams
            ? 'named_team_identity_supported_lane_landmark_identity_missing'
            : 'walker_lane_identity_evidence_not_found',
        transformRetryAllowed: false,
        reason: acquisitionSummary.highestImpactGap,
        mechanicEffectsApplied: 0
    };

    const blockedTaskPath = hasNamedTeams
        ? path.join(ROOT, 'tasks', 'blocked', '079-acquire-replay-009-walker-lane-only-identity-capture.md')
        : path.join(ROOT, 'tasks', 'blocked', '079-reassess-replay-009-spatial-milestone-after-walker-identity-gap.md');
    const blockedTask = hasNamedTeams
        ? `# Task 079: Acquire Replay 009 Walker Lane-Only Identity Capture\n\nStatus: blocked\n\nExecution mode: autonomous after explicit authorization and new lane-specific evidence\n\nBlocked by: direct non-coordinate evidence linking at least one named-team Walker handle to Yellow, Blue, or Green lane\n\n## Objective\n\nAcquire the smallest missing non-coordinate evidence that links at least one replay-009 \`CNPC_Boss_Tier2\` Walker handle with supported named team identity to a named lane Walker landmark.\n\n## Constraints\n\nDo not use coordinate signs, map positions, symmetry, nearest landmarks, residuals, permutation search, regions, proximity, mechanic effects, replay 005, or bot fixtures 006-008.\n\n## Acceptance Criteria\n\nAt least one Walker handle has a named faction and lane identity before any transform fitting, or the task documents that the evidence remains unavailable.\n`
        : `# Task 079: Reassess Replay 009 Spatial Milestone After Walker Identity Gap\n\nStatus: blocked\n\nExecution mode: autonomous after explicit authorization\n\nBlocked by: Task 078 did not find direct non-coordinate Walker identity evidence\n\n## Objective\n\nReassess the replay-009 spatial milestone if no new direct Walker lane identity source is available.\n\n## Constraints\n\nDo not repeat Tasks 077-078 without genuinely new evidence. Do not process replay 005 or bot fixtures 006-008.\n`;

    writeJson('raw-team-control-mapping.json', rawTeamControlMapping);
    writeJson('map-walker-identity-metadata.json', mapWalkerIdentityMetadata);
    writeJson('replay-map-identity-joins.json', replayMapIdentityJoins);
    writeJson('video-tooling-status.json', videoToolingStatus);
    writeJson('video-visible-walker-signals.json', videoVisibleWalkerSignals);
    writeJson('replay-walker-window-fingerprints.json', replayWalkerWindowFingerprints);
    writeJson('video-handle-correlations.json', videoHandleCorrelations);
    writeJson('walker-identity-decisions.json', walkerIdentityDecisions);
    writeJson('correspondence-readiness.json', correspondenceReadiness);
    writeJson('acquisition-summary.json', acquisitionSummary);
    writeJson('acquisition-gate.json', acquisitionGate);

    writeText('README.md', `# Replay 009 Walker Lane Identity Evidence\n\nTask 078 acquires non-coordinate Walker identity evidence for replay 009.\n\nGate: \`${gate}\`\n\nRaw team value controls now support mapping raw team \`3\` to Sapphire/Archmother and raw team \`2\` to Amber/Hidden King, using the Aresius participant control plus two-team parser roster constraints. This resolves named faction for six Walker generations, but it does not resolve Yellow/Blue/Green lane identity or handle-to-map-landmark identity.\n\nNo coordinates, residuals, permutation search, transform fitting, lanes, regions, proximity, mechanic effects, or macro interpretation were used or emitted.\n`);

    writeFileSync(REPORT, `# Replay 009 Walker Lane Identity Evidence Acquisition\n\nTask: \`078-acquire-replay-009-walker-lane-identity-evidence\`\n\nGate: \`${gate}\`\n\n## Summary\n\nTask 078 acquired the smallest new non-coordinate evidence available for replay-009 Walker identity. The parser roster identifies participant \`Aresius\` on raw team \`3\`; the human annotation packet independently reports the participant context and identifies Hidden King as the enemy side while Archmother/Sapphire is the participant-side faction. Under the validated two-team 6v6 roster, this supports raw team \`3 -> sapphire\` and raw team \`2 -> amber\`.\n\nThis is deliberately limited. Named faction does not identify which Yellow, Blue, or Green Walker an individual \`CNPC_Boss_Tier2\` handle represents. Map package metadata still provides only class/set-level resource names, and existing video overlays are class/set-level rather than handle-specific.\n\n## Results\n\n- Walker generations: ${walkerFingerprints.length}\n- Named-team Walker assignments: ${correspondenceReadiness.summary.namedTeamResolvedWalkers}\n- Lane-resolved Walker assignments: 0\n- Handle-to-named-landmark joins: 0\n- Coordinate-ready named-team Walkers: ${correspondenceReadiness.summary.coordinateReadyNamedTeamWalkers}\n- Fit-eligible correspondences: 0\n- Validation-eligible correspondences: 0\n- Video signals evaluated: ${videoVisibleWalkerSignals.length}\n- Unique video-to-handle correlations: 0\n\n## Limits\n\nNo transform was fitted, no residuals were computed, no permutation search was performed, and no lane, region, proximity, mechanic-effect, or macro output was emitted. Replay 005 and bot fixtures 006-008 were not read or processed.\n\n## Follow-Up\n\nThe remaining gap is lane identity. A blocked follow-up task should acquire direct lane-only evidence for at least one named-team Walker handle, without using coordinates or fit quality.\n`);
    writeFileSync(path.join(ROOT, 'reports', 'latest.md'), `# Latest Report\n\n- [Replay 009 Walker Lane Identity Evidence Acquisition](replay-009-walker-lane-identity-evidence-acquisition.md)\n`);

    if (!existsSync(blockedTaskPath)) {
        writeFileSync(blockedTaskPath, blockedTask);
    }

    const outputText = flattenOutputText([
        rawTeamControlMapping,
        mapWalkerIdentityMetadata,
        replayMapIdentityJoins,
        videoToolingStatus,
        videoVisibleWalkerSignals,
        replayWalkerWindowFingerprints,
        videoHandleCorrelations,
        walkerIdentityDecisions,
        correspondenceReadiness,
        acquisitionSummary,
        acquisitionGate
    ]);
    if (/[A-Z]:[\\/]/u.test(outputText)) {
        throw new Error('Output contains an absolute Windows path');
    }
}

main();
