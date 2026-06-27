import { createReadStream } from 'node:fs';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { Logger, Player } from 'deadem';

const execFileAsync = promisify(execFile);
const DEMO_FILE = './samples/partida_001.dem';
const HERO_ID_MAPPING = './output/10-hero-id-mapping.json';
const HERO_RECONCILIATION = './output/11-hero-identity-reconciliation.json';
const PLAYER_RECONCILIATION = './output/11-player-hero-reconciliation.json';
const BUILD_IDENTIFICATION = './output/12-build-identification.json';
const BUILD_FINGERPRINT = './output/12-build-fingerprint.json';
const CANONICAL_TIMELINE = './output/09-canonical-player-timeline.json';
const GAME_TRACKING_ROOT = './external/GameTracking-Deadlock';
const HEROES_VDATA = './external/GameTracking-Deadlock/game/citadel/pak01_dir/scripts/heroes.vdata';
const HERO_NAME_LOCALIZATION = './external/GameTracking-Deadlock/game/citadel/resource/localization/citadel_gc_hero_names/citadel_gc_hero_names_english.txt';
const LANE_COLOR_ENUM = './external/GameTracking-Deadlock/DumpSource2/schemas/client/CMsgLaneColor.h';
const OUTPUT_HERO_ENRICHMENT = './output/13-canonical-hero-enrichment.json';
const OUTPUT_LANE_CODE_MAPPING = './output/13-lane-code-mapping.json';
const OUTPUT_PLAYER_LANE_ENRICHMENT = './output/13-player-lane-enrichment.json';
const OUTPUT_MAP_LANE_REFERENCE = './output/13-map-lane-reference.json';
const OUTPUT_REVIEW = './output/13-enrichment-review.json';
const OUTPUT_SIZE_LIMIT = 5 * 1024 * 1024;
const SAFE_ROOT = `${process.cwd().replace(/\\/gu, '/')}/`;
const SAMPLE_SECONDS = [ 19, 30, 45, 60, 90, 120 ];

const heroIdMapping = JSON.parse(await readFile(HERO_ID_MAPPING, 'utf8'));
const heroReconciliation = JSON.parse(await readFile(HERO_RECONCILIATION, 'utf8'));
const playerReconciliation = JSON.parse(await readFile(PLAYER_RECONCILIATION, 'utf8'));
const buildIdentification = JSON.parse(await readFile(BUILD_IDENTIFICATION, 'utf8'));
const buildFingerprint = JSON.parse(await readFile(BUILD_FINGERPRINT, 'utf8'));
const timeline = JSON.parse(await readFile(CANONICAL_TIMELINE, 'utf8'));
const heroesVdata = parseHeroesVdata(await readFile(HEROES_VDATA, 'utf8'));
const heroNames = parseLocalization(await readFile(HERO_NAME_LOCALIZATION, 'utf8'));
const laneColorEnum = parseLaneColorEnum(await readFile(LANE_COLOR_ENUM, 'utf8'));
const gameTrackingCommit = await gitHead();
const heroEnrichment = buildHeroEnrichment();
const laneRuntime = await inspectLanesFromReplay();
const laneCodeMapping = buildLaneCodeMapping(laneRuntime);
const playerLaneEnrichment = buildPlayerLaneEnrichment(laneRuntime, laneCodeMapping);
const mapLaneReference = buildMapLaneReference(laneRuntime, laneCodeMapping);
const review = buildReview();

await writeJson(OUTPUT_HERO_ENRICHMENT, heroEnrichment);
await writeJson(OUTPUT_LANE_CODE_MAPPING, laneCodeMapping);
await writeJson(OUTPUT_PLAYER_LANE_ENRICHMENT, playerLaneEnrichment);
await writeJson(OUTPUT_MAP_LANE_REFERENCE, mapLaneReference);
await writeJson(OUTPUT_REVIEW, review);
await validateOutputs();

console.log(`Hero enrichments: ${heroEnrichment.length}`);
console.log(`Hero identity high: ${heroEnrichment.filter(entry => entry.heroIdentityConfidence === 'high').length}`);
console.log(`Lane codes observed: ${laneCodeMapping.map(entry => entry.laneCodeRaw).join(', ')}`);
console.log(`Wrote ${OUTPUT_HERO_ENRICHMENT}`);
console.log(`Wrote ${OUTPUT_LANE_CODE_MAPPING}`);
console.log(`Wrote ${OUTPUT_PLAYER_LANE_ENRICHMENT}`);
console.log(`Wrote ${OUTPUT_MAP_LANE_REFERENCE}`);
console.log(`Wrote ${OUTPUT_REVIEW}`);

function buildHeroEnrichment() {
    const byRaw = new Map(heroReconciliation.map(entry => [ entry.heroIdRaw, entry ]));
    const observedByRaw = new Map(heroIdMapping.map(entry => [
        entry.heroIdRaw,
        unique(entry.evidence
            .filter(item => item.kind === 'ability_names')
            .flatMap(item => item.values ?? [])
            .map(item => item.abilityName)
            .filter(isHeroAbility))
    ]));

    return playerReconciliation.map(player => {
        const reconciliation = byRaw.get(player.heroIdRaw);
        const observedAbilities = observedByRaw.get(player.heroIdRaw) ?? [];
        const matchingHero = heroesVdata.find(hero => hero.internalName === reconciliation.currentInternalName) ?? null;
        const abilityOverlap = matchingHero === null ? [] : observedAbilities.filter(ability => matchingHero.abilities.includes(ability));
        const competingHeroes = heroesVdata
            .filter(hero => hero.internalName !== reconciliation.currentInternalName)
            .map(hero => ({
                internalName: hero.internalName,
                displayName: heroNames[`${hero.key}:n`] ?? null,
                abilityOverlap: observedAbilities.filter(ability => hero.abilities.includes(ability))
            }))
            .filter(hero => hero.abilityOverlap.length >= 2);
        const displayName = matchingHero === null ? reconciliation.currentDisplayName : heroNames[`${matchingHero.key}:n`] ?? reconciliation.currentDisplayName;
        const isBuildExact = buildIdentification.exactBuild === 10725 && buildIdentification.latestCompatibleCommit?.subject?.includes('6592');
        const high = isBuildExact && matchingHero !== null && abilityOverlap.length >= 2 && competingHeroes.length === 0 && displayName !== null;

        return {
            playerIndex: player.playerIndex,
            steamId: player.steamId,
            name: player.name,
            team: player.team,
            heroIdRaw: player.heroIdRaw,
            heroIdNormalized: null,
            heroInternalName: reconciliation.currentInternalName,
            heroDisplayName: displayName,
            heroIdentityMethod: 'build_exact_ability_fingerprint',
            heroIdentityConfidence: high ? 'high' : 'medium',
            numericHeroIdMappingConfidence: 'unresolved',
            contentVersion: 6592,
            evidence: {
                build: {
                    buildNum: buildIdentification.exactBuild,
                    contentVersion: 6592,
                    gameTrackingCommit
                },
                observedAbilities,
                heroesVdataEntry: matchingHero === null ? null : {
                    key: matchingHero.key,
                    currentExternalHeroId: matchingHero.heroId,
                    abilities: matchingHero.abilities,
                    localizationToken: `${matchingHero.key}:n`
                },
                abilityOverlap,
                competingHeroes
            },
            conflicts: [
                {
                    kind: 'numeric_id_unresolved',
                    detail: 'heroIdRaw is preserved; no demonstrated conversion to heroes.vdata m_HeroID was applied.'
                },
                ...competingHeroes.map(hero => ({
                    kind: 'competing_ability_fingerprint',
                    internalName: hero.internalName,
                    abilityOverlap: hero.abilityOverlap
                }))
            ]
        };
    }).sort((a, b) => a.playerIndex - b.playerIndex);
}

async function inspectLanesFromReplay() {
    const player = new Player(undefined, Logger.NOOP);
    const sampleTicks = SAMPLE_SECONDS
        .map(second => timeline.snapshots.find(snapshot => snapshot.gameSecond === second))
        .filter(Boolean)
        .map(snapshot => ({ gameSecond: snapshot.gameSecond, demoTick: snapshot.demoTick }));
    const samples = [];
    const objectiveAnchors = [];

    try {
        await player.load(createReadStream(DEMO_FILE));

        for (const sample of sampleTicks) {
            await player.seekToTick(sample.demoTick);

            const demo = player.getDemo();
            const controllers = demo.getEntitiesByClassName('CCitadelPlayerController')
                .filter(controller => String(controller.getField('m_steamID') ?? '0') !== '0');
            const playerSamples = controllers.map(controller => {
                const pawnHandle = getNumber(controller, 'm_hHeroPawn') ?? getNumber(controller, 'm_hPawn');
                const pawn = pawnHandle === null ? null : demo.getEntityByHandle(pawnHandle);

                return {
                    gameSecond: sample.gameSecond,
                    demoTick: sample.demoTick,
                    steamId: String(controller.getField('m_steamID')),
                    name: controller.getField('m_iszPlayerName') ?? null,
                    team: getNumber(controller, 'm_iTeamNum'),
                    assignedLaneRaw: getNumber(controller, 'm_nAssignedLane'),
                    originalLaneRaw: getNumber(controller, 'm_nOriginalLaneAssignment'),
                    deducedLaneRaw: getNumber(pawn, 'm_nDeducedLane'),
                    position: getPosition(pawn)
                };
            });

            samples.push({
                gameSecond: sample.gameSecond,
                demoTick: sample.demoTick,
                players: playerSamples
            });

            if (sample.gameSecond === 120) {
                for (const entity of demo.getEntities()) {
                    const className = entity.class.name;
                    const lane = getFirstNumberField(entity, [ 'm_iLane', 'm_iLaneNumber', 'm_nLane', 'm_iLaneNum' ]);

                    if (lane === null && !/(Lane|Guardian|Walker|Boss|Trooper|Zipline|Sentry|Barrack|Objective)/iu.test(className)) {
                        continue;
                    }

                    objectiveAnchors.push({
                        className,
                        handle: entity.handle,
                        team: getFirstNumberField(entity, [ 'm_iTeamNum', 'm_iTeam', 'm_teamNumber' ]),
                        lane,
                        laneSide: normalizeValue(entity.getField('m_LaneSide')),
                        entityName: normalizeValue(entity.getField('m_iName') ?? entity.getField('m_iszName') ?? entity.getField('m_nameStringableIndex')),
                        position: getPosition(entity),
                        laneFields: collectLaneFields(entity)
                    });
                }
            }
        }
    } finally {
        await player.dispose();
    }

    return {
        sampleTicks,
        samples,
        objectiveAnchors: objectiveAnchors.slice(0, 400),
        laneSources: collectLaneSources()
    };
}

function buildLaneCodeMapping(laneRuntime) {
    const observedCodes = unique(laneRuntime.samples.flatMap(sample => sample.players.map(player => player.assignedLaneRaw).filter(value => value !== null))).sort((a, b) => a - b);

    return observedCodes.map(code => {
        const playerSamples = laneRuntime.samples.flatMap(sample => sample.players.filter(player => player.assignedLaneRaw === code).map(player => ({ ...player, gameSecond: sample.gameSecond })));
        const earlySamples = playerSamples.filter(sample => sample.gameSecond <= 120);
        const teams = countBy(earlySamples, sample => sample.team);
        const positions = earlySamples.map(sample => sample.position).filter(Boolean);
        const anchors = laneRuntime.objectiveAnchors.filter(anchor => anchor.lane === code);
        const center = averagePosition([ ...positions, ...anchors.map(anchor => anchor.position).filter(Boolean) ]);
        const colorName = laneColorEnum[code]?.name ?? null;
        const laneIndex = getLaneIndexFromColor(code);

        return {
            laneCodeRaw: code,
            laneIndex,
            laneInternalName: colorName === null ? null : colorName.toLowerCase(),
            laneDisplayName: colorName,
            laneColorName: colorName,
            sources: [
                {
                    file: LANE_COLOR_ENUM,
                    symbol: laneColorEnum[code]?.symbol ?? null,
                    value: code,
                    meaning: colorName,
                    contentVersionCompatibility: 'schema from GameTracking content version 6592 checkout'
                },
                ...laneRuntime.laneSources.filter(source => source.value === code || source.value === null)
            ],
            spatialEvidence: {
                sampleSeconds: SAMPLE_SECONDS,
                averagePosition: center,
                playerSamples: earlySamples.map(sample => ({
                    gameSecond: sample.gameSecond,
                    steamId: sample.steamId,
                    team: sample.team,
                    position: sample.position,
                    deducedLaneRaw: sample.deducedLaneRaw
                })),
                teamDistribution: teams,
                objectiveAnchors: anchors.slice(0, 30)
            },
            originallyAssignedPlayers: unique(playerSamples.map(sample => sample.steamId)).map(steamId => {
                const player = playerSamples.find(sample => sample.steamId === steamId);

                return {
                    steamId,
                    name: player?.name ?? null,
                    team: player?.team ?? null
                };
            }),
            associatedObjectives: anchors.slice(0, 30),
            confidence: colorName !== null && Object.keys(teams).length >= 2 ? 'high' : 'medium'
        };
    });
}

function buildPlayerLaneEnrichment(laneRuntime, laneMappings) {
    const byCode = new Map(laneMappings.map(mapping => [ mapping.laneCodeRaw, mapping ]));
    const firstSample = laneRuntime.samples[0];
    const allPlayerSamples = laneRuntime.samples.flatMap(sample => sample.players.map(player => ({ ...player, gameSecond: sample.gameSecond })));

    return playerReconciliation.map(player => {
        const first = firstSample.players.find(sample => sample.steamId === player.steamId);
        const samples = allPlayerSamples.filter(sample => sample.steamId === player.steamId);
        const assigned = first?.assignedLaneRaw ?? null;
        const lane = byCode.get(assigned) ?? null;
        const sameLanePlayers = firstSample.players.filter(sample => sample.assignedLaneRaw === assigned && sample.steamId !== player.steamId);
        const allies = sameLanePlayers.filter(sample => sample.team === player.team);
        const enemies = sameLanePlayers.filter(sample => sample.team !== player.team);
        const deducedChanges = samples.filter(sample => sample.deducedLaneRaw !== assigned);

        return {
            playerIndex: player.playerIndex,
            steamId: player.steamId,
            name: player.name,
            team: player.team,
            assignedLaneRaw: assigned,
            originalLaneRaw: first?.originalLaneRaw ?? null,
            initialDeducedLaneRaw: first?.deducedLaneRaw ?? null,
            normalizedLane: lane === null ? null : {
                laneIndex: lane.laneIndex,
                laneInternalName: lane.laneInternalName,
                laneDisplayName: lane.laneDisplayName,
                laneColorName: lane.laneColorName
            },
            probableInitialOpponents: enemies.map(sample => ({ steamId: sample.steamId, name: sample.name, team: sample.team })),
            probableInitialAlly: allies[0] === undefined ? null : { steamId: allies[0].steamId, name: allies[0].name, team: allies[0].team },
            confidence: lane?.confidence ?? 'unresolved',
            divergences: [
                ...(first?.originalLaneRaw !== assigned ? [ { kind: 'assigned_original_mismatch', assigned, original: first?.originalLaneRaw ?? null } ] : []),
                ...deducedChanges.map(sample => ({
                    kind: 'deduced_lane_differs_from_assigned',
                    gameSecond: sample.gameSecond,
                    assignedLaneRaw: assigned,
                    deducedLaneRaw: sample.deducedLaneRaw
                }))
            ],
            samples: samples.map(sample => ({
                gameSecond: sample.gameSecond,
                assignedLaneRaw: sample.assignedLaneRaw,
                originalLaneRaw: sample.originalLaneRaw,
                deducedLaneRaw: sample.deducedLaneRaw,
                position: sample.position
            }))
        };
    }).sort((a, b) => a.playerIndex - b.playerIndex);
}

function buildMapLaneReference(laneRuntime, laneMappings) {
    return {
        contentVersion: 6592,
        gameTrackingCommit,
        buildFingerprintSource: {
            timelineRange: buildFingerprint.timelineRange,
            schemaClassCount: buildFingerprint.schema?.classCount ?? null,
            serializerCount: buildFingerprint.schema?.serializerCount ?? null
        },
        laneColorEnum,
        anchorsUsed: laneRuntime.objectiveAnchors,
        laneCenters: laneMappings.map(mapping => ({
            laneCodeRaw: mapping.laneCodeRaw,
            laneColorName: mapping.laneColorName,
            averagePosition: mapping.spatialEvidence.averagePosition
        })),
        orientation: {
            coordinateSystem: 'Replay CBodyComponent vectors as exposed by Deadem',
            inferredFrom: 'player and lane/objective entity positions at early game samples',
            warning: 'No public north/south/east/west labels were assigned without an explicit source.'
        },
        limitations: [
            'Only lane codes observed in the replay are mapped as observed lanes.',
            'CMsgLaneColor defines Green=3, but no player was assigned code 3 in this replay sample.',
            'Spatial positions are used as validation support; color names come from GameTracking schema.',
            'Movement after lane assignment is not treated as lane swap.'
        ]
    };
}

function buildReview() {
    return {
        heroesAcceptedForEnrichment: heroEnrichment.filter(hero => hero.heroIdentityConfidence === 'high').map(hero => ({
            playerIndex: hero.playerIndex,
            heroIdRaw: hero.heroIdRaw,
            heroInternalName: hero.heroInternalName,
            heroDisplayName: hero.heroDisplayName,
            method: hero.heroIdentityMethod
        })),
        lanesAccepted: laneCodeMapping.filter(lane => lane.confidence === 'high').map(lane => ({
            laneCodeRaw: lane.laneCodeRaw,
            laneDisplayName: lane.laneDisplayName,
            laneColorName: lane.laneColorName
        })),
        provisionalMappings: [
            ...laneCodeMapping.filter(lane => lane.confidence !== 'high').map(lane => ({ type: 'lane', laneCodeRaw: lane.laneCodeRaw, confidence: lane.confidence }))
        ],
        unresolvedMappings: [
            ...Object.entries(laneColorEnum)
                .filter(([ code ]) => !laneCodeMapping.some(lane => lane.laneCodeRaw === Number(code)))
                .map(([ code, value ]) => ({ type: 'unobserved_lane_color', laneCodeRaw: Number(code), laneColorName: value.name }))
        ],
        conflicts: [
            ...heroEnrichment.flatMap(hero => hero.conflicts.map(conflict => ({ type: 'hero', playerIndex: hero.playerIndex, ...conflict }))),
            ...playerLaneEnrichment.flatMap(player => player.divergences.map(divergence => ({ type: 'lane', playerIndex: player.playerIndex, ...divergence })))
        ]
    };
}

function collectLaneSources() {
    return [
        {
            file: LANE_COLOR_ENUM,
            symbol: 'CMsgLaneColor',
            value: null,
            meaning: 'Lane color enum: Invalid=0, Yellow=1, Green=3, Blue=4, Purple=6',
            contentVersionCompatibility: 'GameTracking content version 6592'
        },
        {
            file: './external/GameTracking-Deadlock/DumpSource2/schemas/client/C_CitadelPlayerPawn.h',
            symbol: 'm_nDeducedLane',
            value: null,
            meaning: 'Pawn deduced lane field',
            contentVersionCompatibility: 'GameTracking content version 6592'
        },
        {
            file: './external/GameTracking-Deadlock/DumpSource2/schemas/client/C_CitadelZiplinePath.h',
            symbol: 'm_iLaneNumber',
            value: null,
            meaning: 'Zipline path lane number field',
            contentVersionCompatibility: 'GameTracking content version 6592'
        }
    ];
}

function parseHeroesVdata(content) {
    const lines = content.split(/\r?\n/u);
    const records = [];
    let current = null;

    for (const [ index, line ] of lines.entries()) {
        const start = line.match(/^\t(hero_[a-z0-9_]+)\s*=\s*$/iu);

        if (start !== null) {
            if (current !== null) {
                records.push(finalizeHeroRecord(current));
            }

            current = { key: start[1], internalName: start[1].replace(/^hero_/iu, ''), startLine: index + 1, lines: [] };
            continue;
        }

        if (current !== null) {
            current.lines.push(line);
        }
    }

    if (current !== null) {
        records.push(finalizeHeroRecord(current));
    }

    return records;
}

function finalizeHeroRecord(record) {
    const text = record.lines.join('\n');

    return {
        key: record.key,
        internalName: record.internalName,
        heroId: Number(text.match(/m_HeroID\s*=\s*(-?\d+)/iu)?.[1] ?? Number.NaN),
        startLine: record.startLine,
        abilities: unique(Array.from(text.matchAll(/ESlot_(?:Signature|Weapon|Ability)_[A-Za-z0-9_]+\s*=\s*"([^"]+)"/giu))
            .map(match => match[1])
            .filter(isHeroAbility))
    };
}

function parseLocalization(content) {
    return Object.fromEntries(Array.from(content.matchAll(/"([^"]+)"\s+"([^"]*)"/gu)).map(match => [ match[1], match[2] ]));
}

function parseLaneColorEnum(content) {
    return Object.fromEntries(Array.from(content.matchAll(/k_ELaneColor_([A-Za-z]+)\s*=\s*(\d+)/gu))
        .map(match => [ Number(match[2]), { symbol: `k_ELaneColor_${match[1]}`, name: match[1] } ]));
}

async function gitHead() {
    const { stdout } = await execFileAsync('git', [
        '-c',
        `safe.directory=${SAFE_ROOT}${GAME_TRACKING_ROOT.replace('./', '')}`,
        '-C',
        GAME_TRACKING_ROOT,
        'log',
        '-1',
        '--format=%H'
    ]);

    return stdout.trim();
}

function getNumber(entity, field) {
    const value = entity?.getField(field);

    return typeof value === 'number' ? value : null;
}

function getFirstNumberField(entity, fields) {
    for (const field of fields) {
        const value = getNumber(entity, field);

        if (value !== null) {
            return value;
        }
    }

    return null;
}

function getPosition(entity) {
    if (entity === null || entity === undefined) {
        return null;
    }

    const x = getNumber(entity, 'CBodyComponent.m_vecX');
    const y = getNumber(entity, 'CBodyComponent.m_vecY');
    const z = getNumber(entity, 'CBodyComponent.m_vecZ');

    return x === null || y === null || z === null ? null : { x, y, z };
}

function collectLaneFields(entity) {
    return Array.from(entity.fieldNames())
        .filter(field => /lane/iu.test(field))
        .map(field => ({ field, value: normalizeValue(entity.getField(field)) }));
}

function averagePosition(positions) {
    if (positions.length === 0) {
        return null;
    }

    return {
        x: positions.reduce((sum, position) => sum + position.x, 0) / positions.length,
        y: positions.reduce((sum, position) => sum + position.y, 0) / positions.length,
        z: positions.reduce((sum, position) => sum + position.z, 0) / positions.length
    };
}

function getLaneIndexFromColor(code) {
    const order = [ 1, 3, 4, 6 ];
    const index = order.indexOf(code);

    return index === -1 ? null : index;
}

function isHeroAbility(value) {
    return typeof value === 'string'
        && !value.startsWith('upgrade_')
        && ![
            'citadel_ability_mantle',
            'citadel_ability_jump',
            'citadel_ability_slide',
            'citadel_ability_zip_line',
            'citadel_ability_zipline_boost',
            'citadel_ability_climb_rope',
            'citadel_ability_dash',
            'citadel_ability_sprint',
            'citadel_ability_melee_parry'
        ].includes(value);
}

function normalizeValue(value) {
    if (typeof value === 'bigint') {
        return value.toString();
    }

    if (ArrayBuffer.isView(value)) {
        return { type: value.constructor.name, byteLength: value.byteLength };
    }

    return value ?? null;
}

function countBy(items, getKey) {
    return items.reduce((counts, item) => {
        const key = getKey(item);

        counts[key] = (counts[key] ?? 0) + 1;

        return counts;
    }, {});
}

function unique(values) {
    return Array.from(new Set(values));
}

async function validateOutputs() {
    for (const file of [ OUTPUT_HERO_ENRICHMENT, OUTPUT_LANE_CODE_MAPPING, OUTPUT_PLAYER_LANE_ENRICHMENT, OUTPUT_MAP_LANE_REFERENCE, OUTPUT_REVIEW ]) {
        JSON.parse(await readFile(file, 'utf8'));
        const size = (await stat(file)).size;

        if (size > OUTPUT_SIZE_LIMIT) {
            throw new Error(`${file} exceeds 5 MiB (${size} bytes)`);
        }
    }

    if (heroEnrichment.length !== 12) {
        throw new Error(`Expected 12 hero enrichments, got ${heroEnrichment.length}`);
    }

    if (playerLaneEnrichment.length !== 12) {
        throw new Error(`Expected 12 player lane enrichments, got ${playerLaneEnrichment.length}`);
    }

    for (const hero of heroEnrichment) {
        if (hero.heroIdNormalized !== null) {
            throw new Error(`Unexpected heroIdNormalized for player ${hero.playerIndex}`);
        }
    }
}

async function writeJson(file, data) {
    await writeFile(file, `${JSON.stringify(data, null, 4)}\n`);
}
