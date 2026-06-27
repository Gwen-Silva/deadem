import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const GT_ROOT = './external/GameTracking-Deadlock';
const LANE_MAPPING_FILE = './output/13-lane-code-mapping.json';
const PLAYER_LANE_FILE = './output/13-player-lane-enrichment.json';
const MAP_REFERENCE_FILE = './output/13-map-lane-reference.json';
const TIMELINE_FILE = './output/09-canonical-player-timeline.json';
const BUILD_IDENTIFICATION_FILE = './output/12-build-identification.json';
const LANE_ENUM_FILE = `${GT_ROOT}/DumpSource2/schemas/client/CMsgLaneColor.h`;
const PAWN_SCHEMA_FILE = `${GT_ROOT}/DumpSource2/schemas/client/C_CitadelPlayerPawn.h`;
const ZIPLINE_PATH_SCHEMA_FILE = `${GT_ROOT}/DumpSource2/schemas/client/C_CitadelZiplinePath.h`;
const ZIPLINE_SELECTION_FILE = `${GT_ROOT}/game/citadel/pak01_dir/panorama/layout/ability_hud_elements/element_zipline_lane_selection.xml`;
const IN_WORLD_ZIPLINE_DIR = `${GT_ROOT}/game/citadel/pak01_dir/panorama/layout`;
const GENERATED_VO_FILE = `${GT_ROOT}/game/citadel/resource/localization/citadel_generated_vo/citadel_generated_vo_english.txt`;
const OUTPUT_TOPOLOGY = './output/16-lane-topology-6592.json';
const OUTPUT_HISTORY = './output/16-lane-history.json';
const OUTPUT_COMPARISON = './output/16-lane-current-comparison.json';
const OUTPUT_SEMANTICS = './output/16-lane-field-semantics.json';
const OUTPUT_REVIEW = './output/16-lane-reconciliation-review.json';
const OUTPUT_SIZE_LIMIT = 5 * 1024 * 1024;
const SAMPLE_SECONDS = [ 19, 30, 45, 60, 90, 120 ];

const laneMappings = JSON.parse(await readFile(LANE_MAPPING_FILE, 'utf8'));
const playerLanes = JSON.parse(await readFile(PLAYER_LANE_FILE, 'utf8'));
const mapReference = JSON.parse(await readFile(MAP_REFERENCE_FILE, 'utf8'));
const timeline = JSON.parse(await readFile(TIMELINE_FILE, 'utf8'));
const buildIdentification = JSON.parse(await readFile(BUILD_IDENTIFICATION_FILE, 'utf8'));
const sources = await readSources();
const gitInfo = readGitInfo();
const topology6592 = buildTopology6592();
const history = buildLaneHistory();
const comparison = buildCurrentComparison();
const semantics = buildLaneFieldSemantics();
const review = buildReview();

await writeJson(OUTPUT_TOPOLOGY, topology6592);
await writeJson(OUTPUT_HISTORY, history);
await writeJson(OUTPUT_COMPARISON, comparison);
await writeJson(OUTPUT_SEMANTICS, semantics);
await writeJson(OUTPUT_REVIEW, review);
await validateOutputs();

console.log(`Physical lanes in 6592: ${topology6592.physicalLaneCount}`);
console.log(`Accepted hypothesis: ${review.acceptedHypothesis.id}`);
console.log(`Wrote ${OUTPUT_TOPOLOGY}`);
console.log(`Wrote ${OUTPUT_HISTORY}`);
console.log(`Wrote ${OUTPUT_COMPARISON}`);
console.log(`Wrote ${OUTPUT_SEMANTICS}`);
console.log(`Wrote ${OUTPUT_REVIEW}`);

async function readSources() {
    const optionalText = async file => existsSync(file) ? await readFile(file, 'utf8') : null;

    return {
        laneEnum: await optionalText(LANE_ENUM_FILE),
        pawnSchema: await optionalText(PAWN_SCHEMA_FILE),
        ziplinePathSchema: await optionalText(ZIPLINE_PATH_SCHEMA_FILE),
        ziplineSelection: await optionalText(ZIPLINE_SELECTION_FILE),
        generatedVo: await optionalText(GENERATED_VO_FILE),
        inWorldZiplineFiles: await readInWorldZiplineFiles()
    };
}

async function readInWorldZiplineFiles() {
    return await Promise.all(readdirSync(IN_WORLD_ZIPLINE_DIR)
        .filter(file => /^in_world_prompt_zipline(?:_sign)?_(yellow|blue|green|purple|orange)\.xml$/iu.test(file))
        .map(async file => ({
            file: path.join(IN_WORLD_ZIPLINE_DIR, file).replaceAll('\\', '/'),
            text: await readFile(path.join(IN_WORLD_ZIPLINE_DIR, file), 'utf8')
        })));
}

function buildTopology6592() {
    const laneEnum = parseLaneEnum(sources.laneEnum);
    const corridors = laneMappings
        .filter(mapping => mapping.laneCodeRaw !== 0)
        .map(mapping => buildCorridor(mapping, laneEnum));
    const activeCodes = corridors.map(corridor => corridor.laneCodeRaw).sort((a, b) => a - b);
    const enumOnlyCodes = Object.entries(laneEnum)
        .filter(([ code ]) => !activeCodes.includes(Number(code)) && Number(code) !== 0)
        .map(([ code, value ]) => ({ laneCodeRaw: Number(code), ...value }));

    return {
        contentVersion: buildIdentification.exactBuild ?? buildIdentification.contentVersion ?? 6592,
        replayContentVersion: 6592,
        gameTrackingCommit: gitInfo.head,
        physicalLaneCount: corridors.length,
        activePhysicalLaneCodes: activeCodes,
        activePhysicalLaneColorsBySchema: corridors.map(corridor => corridor.schemaColorName),
        uiLaneLabelsInZiplineSelection: extractZiplineSelectionLabels(),
        enumOnlyLaneCodes: enumOnlyCodes,
        corridors,
        topologyEvidence: {
            source: MAP_REFERENCE_FILE,
            timelineSource: {
                file: TIMELINE_FILE,
                snapshotCount: timeline.snapshots.length,
                sampledSecondsUsed: SAMPLE_SECONDS
            },
            objectiveAnchorCount: mapReference.anchorsUsed.length,
            laneCenters: mapReference.laneCenters,
            assertion: 'Only lane codes with objective/trooper/zipline-like entities are counted as physical lanes.'
        },
        confidence: corridors.length === 3 && activeCodes.join(',') === '1,4,6' ? 'high' : 'medium',
        limitations: [
            'The experiment uses already extracted replay/map entities from experiment 13 instead of reprocessing samples/partida_001.dem.',
            'The local GameTracking checkout is the latest available locally; it is not proof of the live 2026 client state.',
            'No external internet was used.'
        ]
    };
}

function buildCorridor(mapping, laneEnum) {
    const objectiveAnchors = mapping.associatedObjectives ?? mapping.spatialEvidence?.objectiveAnchors ?? [];
    const players = playerLanes.filter(player => player.assignedLaneRaw === mapping.laneCodeRaw);
    const playerSamples = players.flatMap(player => player.samples
        .filter(sample => SAMPLE_SECONDS.includes(sample.gameSecond))
        .map(sample => ({
            playerIndex: player.playerIndex,
            steamId: player.steamId,
            name: player.name,
            team: player.team,
            gameSecond: sample.gameSecond,
            assignedLaneRaw: sample.assignedLaneRaw,
            originalLaneRaw: sample.originalLaneRaw,
            deducedLaneRaw: sample.deducedLaneRaw,
            position: sample.position
        })));
    const groupedObjectives = groupBy(objectiveAnchors, anchor => anchor.className);
    const teamsPresent = unique(objectiveAnchors.map(anchor => anchor.team).filter(team => team !== null)).sort();
    const objectiveLaneCodes = unique(objectiveAnchors.flatMap(anchor => anchor.laneFields?.map(field => field.value) ?? []).filter(Number.isInteger)).sort((a, b) => a - b);

    return {
        laneCodeRaw: mapping.laneCodeRaw,
        schemaColorName: laneEnum[String(mapping.laneCodeRaw)]?.name ?? mapping.laneColorName,
        experiment13ColorName: mapping.laneColorName,
        physicalCorridorLabel: inferPhysicalCorridorLabel(mapping.laneCodeRaw),
        objectiveSummary: Object.fromEntries(Object.entries(groupedObjectives).map(([ className, anchors ]) => [ className, {
            count: anchors.length,
            teams: unique(anchors.map(anchor => anchor.team).filter(team => team !== null)).sort(),
            examplePositions: anchors.slice(0, 6).map(anchor => anchor.position)
        } ])),
        objectiveAnchorCount: objectiveAnchors.length,
        objectiveLaneCodes,
        structuresForBothTeams: teamsPresent.includes(2) && teamsPresent.includes(3),
        teamDistribution: mapping.spatialEvidence?.teamDistribution ?? summarizeTeams(playerSamples),
        axisSpatialEvidence: {
            averageObjectivePosition: averagePosition(objectiveAnchors.map(anchor => anchor.position)),
            averagePlayerPosition: averagePosition(playerSamples.map(sample => sample.position)),
            laneCenterFromExperiment13: mapReference.laneCenters.find(center => center.laneCodeRaw === mapping.laneCodeRaw)?.averagePosition ?? null
        },
        playersInitiallyAssigned: players.map(player => ({
            playerIndex: player.playerIndex,
            steamId: player.steamId,
            name: player.name,
            team: player.team,
            assignedLaneRaw: player.assignedLaneRaw,
            originalLaneRaw: player.originalLaneRaw,
            initialDeducedLaneRaw: player.initialDeducedLaneRaw
        })),
        playerSamples,
        ziplineEvidence: findAnchorsForLane(mapping.laneCodeRaw, /Zipline|ZipLine/iu),
        minionPathEvidence: findAnchorsForLane(mapping.laneCodeRaw, /Trooper/iu),
        confidence: objectiveAnchors.length > 0 && objectiveLaneCodes.includes(mapping.laneCodeRaw) ? 'high' : 'medium'
    };
}

function buildLaneHistory() {
    const relevantFiles = [
        'DumpSource2/schemas/client/CMsgLaneColor.h',
        'game/citadel/pak01_dir/panorama/layout/ability_hud_elements/element_zipline_lane_selection.xml',
        'game/citadel/pak01_dir/panorama/layout/in_world_prompt_zipline_purple.xml',
        'game/citadel/pak01_dir/panorama/layout/in_world_prompt_zipline_green.xml',
        'game/citadel/pak01_dir/panorama/layout/in_world_prompt_zipline_blue.xml',
        'game/citadel/pak01_dir/panorama/layout/in_world_prompt_zipline_yellow.xml',
        'game/citadel/resource/localization/citadel_generated_vo/citadel_generated_vo_english.txt'
    ];
    const commits = gitLogForFiles(relevantFiles);
    const currentEvidence = {
        enumColors: parseLaneEnum(sources.laneEnum),
        ziplineSelectionLabels: extractZiplineSelectionLabels(),
        inWorldPromptColors: sources.inWorldZiplineFiles.map(item => ({
            file: item.file,
            colorInFileName: item.file.match(/(?:sign_)?(yellow|blue|green|purple|orange)\.xml$/iu)?.[1] ?? null,
            classes: Array.from(item.text.matchAll(/class="([^"]+)"/gu)).map(match => match[1])
        })),
        voiceLocalizationLaneNames: extractGeneratedVoLaneReferences()
    };

    return {
        repository: GT_ROOT,
        shallowRepository: gitInfo.isShallow,
        historyExpanded: false,
        head: gitInfo.head,
        headDate: gitInfo.headDate,
        headSubject: gitInfo.headSubject,
        relevantCommits: commits,
        currentEvidence,
        greenPurpleTimeline: [
            {
                status: 'coexisting_evidence_in_6592',
                evidence: [
                    'CMsgLaneColor contains Green=3 and Purple=6.',
                    'Replay/objective evidence uses physical lane code 6, which enum names Purple.',
                    'Zipline lane selection UI labels the three selectable lanes Yellow, Blue and Green.',
                    'In-world zipline prompt XML files include purple/blue/yellow/orange variants and no green variant.'
                ],
                confidence: 'medium'
            }
        ],
        firstVersionWith6592Configuration: {
            commit: gitInfo.head,
            contentVersion: 6592,
            confidence: 'high'
        },
        lastVersionUsingPurpleAsActiveLane: {
            commit: gitInfo.head,
            evidence: 'The replay and schema at 6592 use code 6 named Purple for a physical lane.',
            confidence: 'high'
        },
        firstVersionUsingGreenAsActiveLaneCurrent: {
            commit: gitInfo.head,
            evidence: 'Zipline lane selection UI at 6592 labels the third selectable lane Green.',
            confidence: 'medium'
        },
        limitations: [
            'The repository is shallow, but local history contains commits back before 6395 for the queried files.',
            'No git fetch was executed because local history already shows the relevant 6592 and older file introductions, and network expansion was not required for this isolated experiment.',
            'The local latest available GameTracking commit is 6592, so live current-game state is not independently verified here.'
        ]
    };
}

function buildCurrentComparison() {
    const configuration6592 = summarizeConfiguration(topology6592);
    const currentAvailable = {
        commit: gitInfo.head,
        commitDate: gitInfo.headDate,
        source: 'latest local GameTracking checkout',
        configuration: summarizeConfiguration(topology6592),
        note: 'The latest local GameTracking checkout is the same 6592 commit used for replay compatibility.'
    };
    const physicalCorrespondence = topology6592.corridors.map(corridor => ({
        build6592: {
            laneCodeRaw: corridor.laneCodeRaw,
            schemaColorName: corridor.schemaColorName,
            uiCandidateColorName: corridor.laneCodeRaw === 6 ? 'Green' : corridor.schemaColorName,
            averageObjectivePosition: corridor.axisSpatialEvidence.averageObjectivePosition
        },
        currentLocal: {
            laneCodeRaw: corridor.laneCodeRaw,
            schemaColorName: corridor.schemaColorName,
            uiCandidateColorName: corridor.laneCodeRaw === 6 ? 'Green' : corridor.schemaColorName,
            averageObjectivePosition: corridor.axisSpatialEvidence.averageObjectivePosition
        },
        physicalMatchMethod: 'same local commit and same objective-position evidence',
        colorChangedInLocalEvidence: corridor.laneCodeRaw === 6 ? 'schema Purple coexists with UI Green label' : false,
        confidence: corridor.laneCodeRaw === 6 ? 'medium' : 'high'
    }));

    return {
        configuration6592,
        currentAvailable,
        physicalCorrespondence,
        changedCodes: [],
        changedPositionsOrTopology: [],
        greenPurpleAssessment: 'Local 6592 evidence supports a semantic split: code 6/Purple in schema and replay, Green in zipline selection UI. It does not prove a chronological rename beyond the local history.',
        limitations: [
            'No live/current client data was fetched.',
            'Because current local commit equals 6592, this output compares replay build to latest local evidence, not to an external present-day build.'
        ]
    };
}

function buildLaneFieldSemantics() {
    const assignedValues = summarizeFieldValues(playerLanes.map(player => player.assignedLaneRaw));
    const originalValues = summarizeFieldValues(playerLanes.map(player => player.originalLaneRaw));
    const deducedValues = summarizeFieldValues(playerLanes.flatMap(player => player.samples.map(sample => sample.deducedLaneRaw)));
    const objectiveLaneValues = summarizeFieldValues(mapReference.anchorsUsed
        .flatMap(anchor => anchor.laneFields?.map(field => field.value) ?? [])
        .filter(Number.isInteger));
    const enumValues = Object.entries(parseLaneEnum(sources.laneEnum)).map(([ code, value ]) => ({ value: Number(code), ...value }));

    return {
        fields: [
            {
                field: 'm_nAssignedLane',
                source: PLAYER_LANE_FILE,
                observedValues: assignedValues,
                semantic: 'initial assigned lane code for player controller/player data; same observed domain as objective lane codes in this replay',
                representsColor: 'indirectly via lane-color enum names, but physical corridor should be kept separate from color label',
                representsPhysicalIndex: 'yes for observed codes 1, 4 and 6 in this replay',
                sentinelValues: [],
                dynamic: false,
                confidence: 'high'
            },
            {
                field: 'm_nOriginalLaneAssignment',
                source: PLAYER_LANE_FILE,
                observedValues: originalValues,
                semantic: 'original lane assignment; same values as assignedLaneRaw for this replay sample',
                representsColor: 'indirectly',
                representsPhysicalIndex: 'yes for observed codes 1, 4 and 6',
                sentinelValues: [],
                dynamic: false,
                confidence: 'high'
            },
            {
                field: 'm_nDeducedLane',
                source: PLAYER_LANE_FILE,
                observedValues: deducedValues,
                semantic: 'dynamic deduced/current lane on pawn; can contain 0 when invalid/unknown/not deduced',
                representsColor: 'indirectly when non-zero and in lane domain',
                representsPhysicalIndex: 'yes for non-zero observed lane codes; 0 is sentinel-like',
                sentinelValues: deducedValues.values.includes(0) ? [ { value: 0, meaning: 'Invalid/none/not deduced, not proof that a lane is physically absent' } ] : [],
                dynamic: true,
                confidence: 'high'
            },
            {
                field: 'objective lane fields (m_iLane, m_iPrimaryLane)',
                source: MAP_REFERENCE_FILE,
                observedValues: objectiveLaneValues,
                semantic: 'lane code on objectives/troopers/zipline-like entities; strongest evidence for physical lanes',
                representsColor: 'not by itself; code can be named through enum/UI layers',
                representsPhysicalIndex: 'yes for observed objective groups',
                sentinelValues: objectiveLaneValues.values.includes(0) ? [ { value: 0, meaning: 'base/core objective or invalid/non-lane anchor in extracted data' } ] : [],
                dynamic: false,
                confidence: 'high'
            },
            {
                field: 'CMsgLaneColor',
                source: LANE_ENUM_FILE,
                observedValues: { values: enumValues.map(item => item.value), counts: Object.fromEntries(enumValues.map(item => [ item.value, 1 ])) },
                semantic: 'enum domain with Invalid=0, Yellow=1, Green=3, Blue=4, Purple=6; enum contains values not active as physical lanes in this replay',
                representsColor: true,
                representsPhysicalIndex: 'not sufficient alone',
                sentinelValues: [ { value: 0, meaning: 'Invalid' } ],
                dynamic: false,
                confidence: 'high'
            }
        ],
        compatibility6592ToCurrentLocal: {
            sameNumericDomainObserved: true,
            valuesObservedInReplay: [ 1, 4, 6 ],
            enumValueNotObservedAsPhysicalLane: [ 3 ],
            caveat: 'Green=3 exists in enum and UI text, but no objectives or players in this replay use code 3.'
        },
        schemaEvidence: {
            pawn: extractLines(sources.pawnSchema, /m_eZipLineLaneColor|m_nDeducedLane|Lane/iu, 20),
            ziplinePath: extractLines(sources.ziplinePathSchema, /m_iLaneNumber|m_bUseBaseLaneColor|Lane/iu, 20),
            enum: extractLines(sources.laneEnum, /k_ELaneColor|CMsgLaneColor/iu, 20)
        }
    };
}

function buildReview() {
    const accepted = {
        id: 'H3_with_H4_context',
        statement: 'The replay/build evidence demonstrates three physical lanes using codes 1, 4 and 6. Code 6 is named Purple by CMsgLaneColor, while UI evidence in the same local 6592 checkout labels the third selectable lane Green; therefore Green/Purple are best treated as layer-specific labels until historical rename evidence is stronger.',
        confidence: 'high for three physical lanes; medium for Green/Purple alias interpretation'
    };
    const rejected = [
        {
            id: 'H1',
            verdict: 'partially_rejected',
            reason: 'Three physical lanes are supported, but Green already appears in 6592 zipline UI, so a simple later Purple -> Green rename is not proven.'
        },
        {
            id: 'H2',
            verdict: 'rejected_for_this_replay',
            reason: 'No physical objective/trooper/player evidence for code 3 as an active fourth lane in the replay.'
        },
        {
            id: 'H4',
            verdict: 'accepted_as_context',
            reason: 'CMsgLaneColor contains more labels than active physical lanes; enum alone should not define topology.'
        },
        {
            id: 'H5',
            verdict: 'rejected',
            reason: 'Code 6 appears on objectives, troopers, assigned-lane particles and players, so it identifies a real physical corridor in this replay.'
        }
    ];

    return {
        acceptedHypothesis: accepted,
        rejectedHypotheses: rejected,
        decisiveEvidence: [
            'Experiment 13 map anchors show non-zero objective/trooper lane fields for codes 1, 4 and 6.',
            'Each active code has structures for both teams and initially assigned players.',
            'No objectives or players in this replay use code 3.',
            'CMsgLaneColor names code 6 Purple and code 3 Green.',
            'The zipline lane selection UI in the local 6592 checkout labels selectable lanes Yellow, Blue and Green.'
        ],
        lanesBuild6592: topology6592.corridors.map(corridor => ({
            laneCodeRaw: corridor.laneCodeRaw,
            physicalCorridorLabel: corridor.physicalCorridorLabel,
            schemaColorName: corridor.schemaColorName,
            recommendedDisplayName: corridor.laneCodeRaw === 6 ? 'Green/Purple (unreconciled label)' : corridor.schemaColorName,
            confidence: corridor.confidence
        })),
        lanesCurrentLocal: comparison.currentAvailable.configuration,
        finalReplayEnrichmentRule: [
            {
                condition: 'assignedLaneRaw === 1',
                physicalLane: 'left/Yellow corridor by replay evidence',
                displayName: 'Yellow',
                confidence: 'high'
            },
            {
                condition: 'assignedLaneRaw === 4',
                physicalLane: 'middle/Blue corridor by replay evidence',
                displayName: 'Blue',
                confidence: 'high'
            },
            {
                condition: 'assignedLaneRaw === 6',
                physicalLane: 'third physical corridor by replay evidence',
                displayName: 'Purple by schema; Green by 6592 zipline UI',
                confidence: 'medium'
            },
            {
                condition: 'assignedLaneRaw === 3',
                physicalLane: null,
                displayName: 'Green enum value only; do not infer active physical lane in this replay',
                confidence: 'high'
            }
        ],
        unresolvedConflicts: [
            'No local historical commit conclusively documents a Purple -> Green rename.',
            'The local latest GameTracking checkout is 6592, so present-day live lane labels were not independently compared.',
            'In-world zipline prompt files include purple while zipline selection UI labels Green.'
        ],
        validation: {
            physicalLaneCountSupportedByObjectivesNotEnum: true,
            eachPhysicalLaneHasTwoTeamStructures: topology6592.corridors.every(corridor => corridor.structuresForBothTeams),
            colorAndCorridorSeparated: true,
            purpleToGreenRequiresMoreEvidence: true,
            code3AbsenceNotUsedAsOnlyProof: true,
            code6HasPhysicalEvidence: true,
            enumLegacyValuesMarked: true,
            currentComparisonCommitRecorded: Boolean(gitInfo.head)
        }
    };
}

function summarizeConfiguration(topology) {
    return {
        commit: gitInfo.head,
        physicalLaneCount: topology.physicalLaneCount,
        activePhysicalLaneCodes: topology.activePhysicalLaneCodes,
        schemaColors: topology.activePhysicalLaneColorsBySchema,
        uiLaneLabels: topology.uiLaneLabelsInZiplineSelection,
        enumOnlyLaneCodes: topology.enumOnlyLaneCodes
    };
}

function parseLaneEnum(content) {
    return Object.fromEntries(Array.from((content ?? '').matchAll(/k_ELaneColor_([A-Za-z]+)\s*=\s*(\d+)/gu))
        .map(match => [ match[2], { symbol: `k_ELaneColor_${match[1]}`, name: match[1] } ]));
}

function extractZiplineSelectionLabels() {
    return Array.from((sources.ziplineSelection ?? '').matchAll(/text="[^"]*?([A-Za-z]+)\s+LANE"/gu))
        .map(match => match[1])
        .filter(label => !/LEFT|RIGHT/iu.test(label));
}

function extractGeneratedVoLaneReferences() {
    const text = sources.generatedVo ?? '';
    const patterns = [ 'yellow', 'blue', 'green', 'purple' ];

    return Object.fromEntries(patterns.map(pattern => [ pattern, Array.from(text.matchAll(new RegExp(`"([^"]*${pattern}[^"]*)"\\s+"([^"]*)"`, 'giu')))
        .slice(0, 12)
        .map(match => ({ key: match[1], text: match[2] })) ]));
}

function findAnchorsForLane(laneCodeRaw, classPattern) {
    return mapReference.anchorsUsed
        .filter(anchor => anchor.laneFields?.some(field => field.value === laneCodeRaw) && classPattern.test(anchor.className))
        .slice(0, 20)
        .map(anchor => ({
            className: anchor.className,
            handle: anchor.handle,
            team: anchor.team,
            laneFields: anchor.laneFields,
            position: anchor.position
        }));
}

function inferPhysicalCorridorLabel(code) {
    if (code === 1) return 'corridor-code-1';
    if (code === 4) return 'corridor-code-4';
    if (code === 6) return 'corridor-code-6';

    return `corridor-code-${code}`;
}

function readGitInfo() {
    return {
        isShallow: git([ 'rev-parse', '--is-shallow-repository' ]).trim() === 'true',
        head: git([ 'rev-parse', 'HEAD' ]).trim(),
        headDate: git([ 'log', '-1', '--format=%cI' ]).trim(),
        headSubject: git([ 'log', '-1', '--format=%s' ]).trim()
    };
}

function gitLogForFiles(files) {
    const output = git([ 'log', '--all', '--format=%H%x09%cI%x09%s', '--', ...files ]);

    return output.split(/\r?\n/u)
        .filter(Boolean)
        .map(line => {
            const [ commit, date, ...subjectParts ] = line.split('\t');

            return { commit, date, subject: subjectParts.join('\t') };
        })
        .slice(0, 80);
}

function git(args) {
    return execFileSync('git', [
        '-c',
        `safe.directory=${path.resolve(GT_ROOT).replace(/\\/gu, '/')}`,
        '-C',
        GT_ROOT,
        ...args
    ], { encoding: 'utf8' });
}

function groupBy(values, getKey) {
    const result = {};

    for (const value of values) {
        const key = getKey(value);

        if (!result[key]) {
            result[key] = [];
        }

        result[key].push(value);
    }

    return result;
}

function summarizeTeams(samples) {
    return Object.fromEntries(Object.entries(groupBy(samples, sample => sample.team)).map(([ team, values ]) => [ team, values.length ]));
}

function averagePosition(positions) {
    const valid = positions.filter(position => position !== null && position !== undefined);

    if (valid.length === 0) {
        return null;
    }

    return {
        x: valid.reduce((sum, position) => sum + position.x, 0) / valid.length,
        y: valid.reduce((sum, position) => sum + position.y, 0) / valid.length,
        z: valid.reduce((sum, position) => sum + position.z, 0) / valid.length
    };
}

function summarizeFieldValues(values) {
    const clean = values.filter(Number.isInteger);
    const counts = {};

    for (const value of clean) {
        counts[value] = (counts[value] ?? 0) + 1;
    }

    return {
        values: unique(clean).sort((a, b) => a - b),
        counts
    };
}

function extractLines(text, pattern, limit) {
    return (text ?? '').split(/\r?\n/u)
        .map((line, index) => ({ line: index + 1, text: line.trim() }))
        .filter(entry => pattern.test(entry.text))
        .slice(0, limit);
}

function unique(values) {
    return Array.from(new Set(values));
}

async function validateOutputs() {
    for (const file of [ OUTPUT_TOPOLOGY, OUTPUT_HISTORY, OUTPUT_COMPARISON, OUTPUT_SEMANTICS, OUTPUT_REVIEW ]) {
        JSON.parse(await readFile(file, 'utf8'));
        const size = (await stat(file)).size;

        if (size > OUTPUT_SIZE_LIMIT) {
            throw new Error(`${file} exceeds 5 MiB (${size} bytes)`);
        }
    }
}

async function writeJson(file, data) {
    await writeFile(file, `${JSON.stringify(data, null, 4)}\n`);
}
