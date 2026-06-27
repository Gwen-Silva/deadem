import { createReadStream } from 'node:fs';
import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { InterceptorStage, Logger, MessagePacketType, Parser, ParserConfiguration, Player } from 'deadem';

const DEMO_ARGUMENT_PREFIX = '--demo=';
const DEFAULT_DEMO = './samples/partida_001.dem';
const TIMELINE_FILE = './output/09-canonical-player-timeline.json';
const SCHEMA_FILE = './output/09-canonical-schema.json';
const HERO_MAPPING_OUTPUT = './output/10-hero-id-mapping.json';
const PLAYER_MAPPING_OUTPUT = './output/10-player-hero-mapping.json';
const SOURCES_OUTPUT = './output/10-hero-mapping-sources.json';
const CONTROLLER_CLASS = 'CCitadelPlayerController';
const PAWN_CLASS = 'CCitadelPlayerPawn';
const OUTPUT_SIZE_LIMIT = 2 * 1024 * 1024;
const GENERIC_ABILITY_TOKENS = new Set([
    'ability',
    'aoemagic',
    'barrel',
    'blast',
    'blasted',
    'blood',
    'bomb',
    'bounce',
    'card',
    'charge',
    'cloud',
    'darkness',
    'dash',
    'defer',
    'dragonfire',
    'explosive',
    'fire',
    'fissure',
    'flame',
    'frenzy',
    'gravity',
    'guard',
    'healing',
    'incendiary',
    'kickflip',
    'killing',
    'knightbarrier',
    'knightcharge',
    'lasso',
    'leap',
    'lightning',
    'luminousstrike',
    'magic',
    'mark',
    'mobile',
    'netshot',
    'nikuman',
    'orb',
    'pad',
    'power',
    'prismaticguard',
    'projectile',
    'projectmind',
    'psychic',
    'rapidfire',
    'resupply',
    'rocket',
    'self',
    'shieldedsentry',
    'sphere',
    'static',
    'stomp',
    'storm',
    'surge',
    'toss',
    'transformation',
    'ult',
    'unloadgun',
    'upgrade',
    'upgrades',
    'vacuum',
    'void',
    'wall'
]);
const DIRECT_SOURCE_FILES = [
    'packages/deadem/src/bootstrap/Bootstrap.js',
    'packages/deadem/proto/source/demo.proto',
    'packages/deadem/proto/source/citadel_gcmessages_common.proto',
    'packages/deadem/proto/source/citadel_usermessages.proto',
    'packages/deadem/proto/compiled/proto.json',
    'packages/examples-node-deadem/scripts/105_parse_ability_feed.js',
    'packages/ui/src/components/Parser/components/MatchSummary/helpers/dotaPlayers.js'
];
const HERO_FIELD_PATTERN = /(hero|model|name|ability|class)/iu;

const demoPath = resolveDemoPath();
const timeline = JSON.parse(await readFile(TIMELINE_FILE, 'utf8'));
const schema = JSON.parse(await readFile(SCHEMA_FILE, 'utf8'));
const observedPlayers = readObservedPlayers(timeline);
const sources = await inspectSources();
const fileInfo = await inspectDemoFileInfo(demoPath);
const replayEvidence = await inspectReplayEvidence(demoPath, observedPlayers);
const mappings = buildHeroMappings(observedPlayers, sources, fileInfo, replayEvidence);
const playerMappings = buildPlayerMappings(observedPlayers, mappings);
const sourceReport = buildSourceReport(sources, fileInfo, replayEvidence, schema);

await writeJson(HERO_MAPPING_OUTPUT, mappings);
await writeJson(PLAYER_MAPPING_OUTPUT, playerMappings);
await writeJson(SOURCES_OUTPUT, sourceReport);
await validateOutputs();

console.log(`Observed hero IDs: ${mappings.map(entry => entry.heroIdRaw).join(', ')}`);
console.log(`Resolved high: ${mappings.filter(entry => entry.mappingConfidence === 'high').length}`);
console.log(`Resolved medium: ${mappings.filter(entry => entry.mappingConfidence === 'medium').length}`);
console.log(`Resolved low: ${mappings.filter(entry => entry.mappingConfidence === 'low').length}`);
console.log(`Wrote ${HERO_MAPPING_OUTPUT}`);
console.log(`Wrote ${PLAYER_MAPPING_OUTPUT}`);
console.log(`Wrote ${SOURCES_OUTPUT}`);

function resolveDemoPath() {
    const argument = process.argv.find(arg => arg.startsWith(DEMO_ARGUMENT_PREFIX));
    const file = argument ? argument.slice(DEMO_ARGUMENT_PREFIX.length) : DEFAULT_DEMO;

    return path.resolve(process.cwd(), file);
}

function readObservedPlayers(data) {
    return data.players
        .map(player => ({
            playerIndex: player.playerIndex,
            steamId: player.steamId,
            name: player.name,
            team: player.team,
            heroIdRaw: player.heroIdRaw,
            signedCandidates: getSignedCandidates(player.heroIdRaw)
        }))
        .sort((a, b) => a.playerIndex - b.playerIndex);
}

function getSignedCandidates(heroIdRaw) {
    return {
        raw: heroIdRaw,
        unsigned8: heroIdRaw & 0xFF,
        unsigned16: heroIdRaw & 0xFFFF,
        unsigned32: heroIdRaw >>> 0,
        absolute: Math.abs(heroIdRaw)
    };
}

async function inspectSources() {
    const records = [];
    const directTables = [];

    for (const file of DIRECT_SOURCE_FILES) {
        const content = await readExistingFile(file);

        if (content === null) {
            continue;
        }

        const snippets = findSourceSnippets(content);
        const record = {
            file,
            symbols: snippets,
            hasHeroId: /hero[_\s]?id|HeroID|m_nHeroID/iu.test(content),
            hasHeroName: /hero[_\s]?name|heroName/iu.test(content),
            hasHeroIdTable: getLooksLikeHeroIdTable(content),
            sourceKind: getSourceKind(file),
            staticOrReplayDerived: file.includes('proto') || file.includes('Bootstrap') ? 'static schema/code' : 'runtime example/ui'
        };

        records.push(record);

        if (record.hasHeroIdTable) {
            directTables.push(file);
        }
    }

    return {
        records,
        directTables,
        heroIdType: {
            typeName: 'HeroID_t',
            decoder: records.some(record => record.file.endsWith('Bootstrap.js')) ? 'VAR_INT_32' : null,
            likelyWireInterpretation: 'signed integer',
            evidence: 'packages/deadem/src/bootstrap/Bootstrap.js registers HeroID_t with FieldDecoderDescriptor.VAR_INT_32.'
        },
        repositoryHasDirectIdToNameTable: directTables.length > 0
    };
}

async function readExistingFile(file) {
    try {
        return await readFile(file, 'utf8');
    } catch {
        return null;
    }
}

function findSourceSnippets(content) {
    return content
        .split(/\r?\n/u)
        .map((line, index) => ({ line: index + 1, text: line.trim() }))
        .filter(entry => /m_nHeroID|HeroID_t|hero_id|heroName|hero_name|BannedHeroes|HeroKilled|abilityName/iu.test(entry.text))
        .slice(0, 20);
}

function getLooksLikeHeroIdTable(content) {
    return /(hero.*id.*name|id.*hero.*name|hero.*lookup|hero.*map)/iu.test(content)
        && /[{[]/u.test(content)
        && /hero[_\s]?name|display[_\s]?name|internal[_\s]?name/iu.test(content);
}

function getSourceKind(file) {
    if (file.includes('Bootstrap')) {
        return 'field decoder registration';
    }

    if (file.endsWith('demo.proto')) {
        return 'demo metadata schema';
    }

    if (file.includes('citadel_gcmessages_common')) {
        return 'GC message schema';
    }

    if (file.includes('citadel_usermessages')) {
        return 'user message schema';
    }

    if (file.includes('compiled')) {
        return 'compiled protobuf schema';
    }

    if (file.includes('examples-node')) {
        return 'example runtime code';
    }

    if (file.includes('ui')) {
        return 'UI code';
    }

    return 'unknown';
}

async function inspectDemoFileInfo(file) {
    const parser = new Parser(undefined, Logger.NOOP);
    const records = [];

    try {
        parser.registerPostInterceptor(InterceptorStage.DEMO_PACKET, (demoPacket) => {
            if (demoPacket.type?.code !== 'DEM_FileInfo') {
                return;
            }

            const playerInfo = demoPacket.data?.gameInfo?.dota?.playerInfo ?? [];
            const picksBans = demoPacket.data?.gameInfo?.dota?.picksBans ?? [];

            records.push({
                playbackTime: demoPacket.data?.playbackTime ?? null,
                playbackTicks: demoPacket.data?.playbackTicks ?? null,
                playerInfo: playerInfo.map(player => ({
                    heroName: player.heroName ?? null,
                    playerName: player.playerName ?? null,
                    steamid: normalizeValue(player.steamid ?? null),
                    gameTeam: player.gameTeam ?? null
                })),
                picksBans: picksBans.map(event => ({
                    isPick: event.isPick ?? null,
                    team: event.team ?? null,
                    heroId: event.heroId ?? null
                })),
                hasDirectHeroNames: playerInfo.some(player => player.heroName)
            });
        });

        await parser.parse(createReadStream(file));

        return records[0] ?? null;
    } finally {
        await parser.dispose();
    }
}

async function inspectReplayEvidence(file, players) {
    const staticEvidence = await inspectStaticEntityEvidence(file, players);
    const abilityEvidence = await inspectAbilityEvidence(file);

    return {
        staticEntityEvidence: staticEvidence,
        abilityEvidence
    };
}

async function inspectStaticEntityEvidence(file, players) {
    const player = new Player(undefined, Logger.NOOP);
    const firstSnapshot = timeline.snapshots[0];
    const evidence = [];

    try {
        await player.load(createReadStream(file));
        await player.seekToTick(firstSnapshot.demoTick);

        const demo = player.getDemo();
        const controllers = demo.getEntitiesByClassName(CONTROLLER_CLASS);
        const pawns = demo.getEntitiesByClassName(PAWN_CLASS);
        const controllerBySteamId = new Map(controllers.map(controller => [ getBigIntStringField(controller, 'm_steamID'), controller ]));
        const pawnByHandle = new Map(pawns.map(pawn => [ pawn.handle, pawn ]));

        for (const observed of players) {
            const controller = controllerBySteamId.get(observed.steamId) ?? null;
            const pawnHandle = getNumberField(controller, 'm_hHeroPawn');
            const pawn = pawnByHandle.get(pawnHandle) ?? null;
            const controllerHeroFields = collectCandidateFields(controller);
            const pawnHeroFields = collectCandidateFields(pawn);

            evidence.push({
                playerIndex: observed.playerIndex,
                steamId: observed.steamId,
                heroIdRaw: observed.heroIdRaw,
                controllerClassName: controller?.class.name ?? null,
                pawnClassName: pawn?.class.name ?? null,
                controllerFields: controllerHeroFields,
                pawnFields: pawnHeroFields,
                controllerHeroId: getNumberField(controller, 'm_nHeroID'),
                pawnHeroId: getNumberField(pawn, 'm_nHeroID'),
                pawnHandle: pawn?.handle ?? null
            });
        }

        return evidence;
    } finally {
        await player.dispose();
    }
}

function collectCandidateFields(entity) {
    if (entity === null) {
        return [];
    }

    const fields = [];

    for (const field of entity.fieldNames()) {
        if (HERO_FIELD_PATTERN.test(field)) {
            fields.push({
                field,
                value: normalizeValue(entity.getField(field))
            });
        }
    }

    return fields.slice(0, 60);
}

async function inspectAbilityEvidence(file) {
    const parser = new Parser(new ParserConfiguration({
        parserThreads: 0,
        messagePacketTypes: [
            MessagePacketType.CITADEL_USER_MESSAGE_IMPORTANT_ABILITY_USED,
            MessagePacketType.SVC_PACKET_ENTITIES
        ],
        entityClasses: [ CONTROLLER_CLASS, PAWN_CLASS ]
    }), Logger.NOOP);
    const bySteamId = new Map();

    try {
        parser.registerPostInterceptor(InterceptorStage.MESSAGE_PACKET, (demoPacket, messagePacket) => {
            if (messagePacket.type !== MessagePacketType.CITADEL_USER_MESSAGE_IMPORTANT_ABILITY_USED) {
                return;
            }

            const demo = parser.getDemo();
            const caster = demo.getEntityByHandle(messagePacket.data.caster);

            if (caster === null || caster.class.name !== PAWN_CLASS) {
                return;
            }

            const ownerHandle = getNumberField(caster, 'm_hOwnerEntity');
            const owner = ownerHandle === null ? null : demo.getEntityByHandle(ownerHandle);

            if (owner === null || owner.class.name !== CONTROLLER_CLASS) {
                return;
            }

            const steamId = getBigIntStringField(owner, 'm_steamID');
            const abilityName = messagePacket.data.abilityName ?? null;

            if (steamId === null || abilityName === null) {
                return;
            }

            if (!bySteamId.has(steamId)) {
                bySteamId.set(steamId, {
                    steamId,
                    heroIdRaw: getNumberField(owner, 'm_nHeroID'),
                    abilities: new Map(),
                    casterHandles: new Set()
                });
            }

            const record = bySteamId.get(steamId);

            record.abilities.set(abilityName, (record.abilities.get(abilityName) ?? 0) + 1);
            record.casterHandles.add(messagePacket.data.caster);
        });

        await parser.parse(createReadStream(file));

        return Object.fromEntries(Array.from(bySteamId.entries()).map(([ steamId, record ]) => [
            steamId,
            {
                steamId,
                heroIdRaw: record.heroIdRaw,
                abilities: Array.from(record.abilities.entries())
                    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
                    .slice(0, 20)
                    .map(([ abilityName, count ]) => ({
                        abilityName,
                        count,
                        inferredTokens: inferAbilityTokens(abilityName)
                    })),
                casterHandles: Array.from(record.casterHandles).slice(0, 10)
            }
        ]));
    } finally {
        await parser.dispose();
    }
}

function inferAbilityTokens(abilityName) {
    return abilityName
        .replace(/^citadel_ability_/iu, '')
        .replace(/^ability_/iu, '')
        .split(/[_\W]+/u)
        .filter(token => token.length > 2)
        .filter(token => !new Set([ 'ability', 'citadel', 'ult', 'gun', 'the', 'and' ]).has(token.toLowerCase()));
}

function buildHeroMappings(players, sources, fileInfo, replayEvidence) {
    const byHeroId = new Map();

    for (const player of players) {
        if (!byHeroId.has(player.heroIdRaw)) {
            byHeroId.set(player.heroIdRaw, []);
        }

        byHeroId.get(player.heroIdRaw).push(player);
    }

    return Array.from(byHeroId.entries())
        .sort(([ a ], [ b ]) => a - b)
        .map(([ heroIdRaw, heroPlayers ]) => {
            const evidence = buildEvidence(heroIdRaw, heroPlayers, sources, fileInfo, replayEvidence);
            const abilityMapping = inferInternalNameFromAbilities(heroPlayers, replayEvidence.abilityEvidence);
            const hasDirect = evidence.some(item => item.kind === 'direct_id_to_name');
            const hasAbilityEvidence = abilityMapping !== null;

            return {
                heroIdRaw,
                heroIdNormalized: hasDirect ? heroIdRaw : null,
                signedCandidates: getSignedCandidates(heroIdRaw),
                heroInternalName: hasAbilityEvidence ? abilityMapping.name : null,
                heroDisplayName: null,
                mappingConfidence: hasDirect ? 'high' : (abilityMapping?.confidence ?? 'low'),
                mappingMethod: [
                    ...(hasDirect ? [ 'direct_table' ] : []),
                    ...(hasAbilityEvidence ? [ abilityMapping.method ] : []),
                    'schema_type_analysis'
                ],
                evidence,
                players: heroPlayers.map(player => ({
                    playerIndex: player.playerIndex,
                    steamId: player.steamId,
                    name: player.name,
                    team: player.team
                }))
            };
        });
}

function buildEvidence(heroIdRaw, heroPlayers, sources, fileInfo, replayEvidence) {
    const evidence = [
        {
            kind: 'schema_type',
            source: 'packages/deadem/src/bootstrap/Bootstrap.js',
            detail: 'HeroID_t is decoded with FieldDecoderDescriptor.VAR_INT_32, so negative m_nHeroID values are expected signed varint results.',
            confidence: 'high'
        }
    ];

    if (fileInfo !== null) {
        evidence.push({
            kind: 'demo_file_info',
            source: 'DEM_FileInfo.gameInfo',
            detail: fileInfo.hasDirectHeroNames
                ? 'DEM_FileInfo contains hero names.'
                : 'DEM_FileInfo.gameInfo was present but did not contain player hero names for this replay.',
            confidence: fileInfo.hasDirectHeroNames ? 'high' : 'low'
        });
    }

    if (!sources.repositoryHasDirectIdToNameTable) {
        evidence.push({
            kind: 'missing_direct_table',
            source: 'repository scan',
            detail: 'No static ID-to-hero-name table was found in searched repository files.',
            confidence: 'medium'
        });
    }

    for (const player of heroPlayers) {
        const staticEvidence = replayEvidence.staticEntityEvidence.find(item => item.steamId === player.steamId);
        const abilityEvidence = replayEvidence.abilityEvidence[player.steamId] ?? null;

        evidence.push({
            kind: 'controller_field',
            source: 'CCitadelPlayerController.m_nHeroID',
            playerIndex: player.playerIndex,
            value: staticEvidence?.controllerHeroId ?? null,
            confidence: staticEvidence?.controllerHeroId === heroIdRaw ? 'high' : 'low'
        });

        if (staticEvidence?.pawnClassName !== null) {
            evidence.push({
                kind: 'pawn_class',
                source: 'resolved HeroPawn class name',
                playerIndex: player.playerIndex,
                value: staticEvidence?.pawnClassName ?? null,
                confidence: 'low'
            });
        }

        if (abilityEvidence !== null && abilityEvidence.abilities.length > 0) {
            evidence.push({
                kind: 'ability_names',
                source: 'k_EUserMsg_ImportantAbilityUsed.abilityName',
                playerIndex: player.playerIndex,
                values: abilityEvidence.abilities.slice(0, 8),
                confidence: 'medium'
            });
        }
    }

    return evidence;
}

function inferInternalNameFromAbilities(players, abilityEvidenceBySteamId) {
    const candidateTokens = new Map();

    for (const player of players) {
        const abilityEvidence = abilityEvidenceBySteamId[player.steamId] ?? null;

        if (abilityEvidence === null) {
            continue;
        }

        for (const ability of abilityEvidence.abilities) {
            const prefixToken = ability.inferredTokens[0]?.toLowerCase();

            if (prefixToken === undefined || GENERIC_ABILITY_TOKENS.has(prefixToken)) {
                continue;
            }

            if (!candidateTokens.has(prefixToken)) {
                candidateTokens.set(prefixToken, {
                    token: prefixToken,
                    totalCount: 0,
                    abilityNames: new Set()
                });
            }

            const candidate = candidateTokens.get(prefixToken);

            candidate.totalCount += ability.count;
            candidate.abilityNames.add(ability.abilityName);
        }
    }

    const sorted = Array.from(candidateTokens.values())
        .filter(candidate => candidate.abilityNames.size >= 2)
        .sort((a, b) => b.abilityNames.size - a.abilityNames.size || b.totalCount - a.totalCount || a.token.localeCompare(b.token));

    if (sorted.length === 0) {
        return null;
    }

    return {
        name: sorted[0].token,
        confidence: 'medium',
        method: 'repeated_ability_prefix_tokens'
    };
}

function buildPlayerMappings(players, mappings) {
    const mappingByRaw = new Map(mappings.map(mapping => [ mapping.heroIdRaw, mapping ]));

    return players.map(player => {
        const mapping = mappingByRaw.get(player.heroIdRaw);

        return {
            playerIndex: player.playerIndex,
            steamId: player.steamId,
            name: player.name,
            team: player.team,
            heroIdRaw: player.heroIdRaw,
            heroIdNormalized: mapping.heroIdNormalized,
            heroInternalName: mapping.heroInternalName,
            heroDisplayName: mapping.heroDisplayName,
            confidence: mapping.mappingConfidence,
            evidenceSummary: mapping.evidence.map(item => item.kind).slice(0, 8)
        };
    });
}

function buildSourceReport(sources, fileInfo, replayEvidence, schema) {
    return {
        filesAndSymbols: sources.records,
        tablesAvailable: {
            directHeroIdToNameTables: sources.directTables,
            foundDirectTable: sources.repositoryHasDirectIdToNameTable
        },
        heroIdField: {
            canonicalSchemaEntry: schema.fields?.heroIdRaw ?? null,
            typeName: sources.heroIdType.typeName,
            decoder: sources.heroIdType.decoder,
            realOrProbableType: sources.heroIdType.likelyWireInterpretation,
            explanationForNegativeValues: sources.heroIdType.evidence
        },
        conversionRules: {
            negativeIds: 'Do not convert negative IDs silently. Keep heroIdRaw as signed VAR_INT_32; compute unsigned/absolute candidates only for comparison.',
            normalizedId: 'Set heroIdNormalized only when a direct authoritative table confirms the conversion.'
        },
        replaySources: {
            demoFileInfo: fileInfo,
            staticEntityEvidenceCount: replayEvidence.staticEntityEvidence.length,
            abilityEvidencePlayers: Object.keys(replayEvidence.abilityEvidence).length
        },
        limitations: [
            'No authoritative hero ID to display-name table was found in the searched repository files.',
            'Ability names provide useful internal-name hints but are secondary evidence.',
            'heroDisplayName remains null without a direct localization/resource table.',
            'No internet sources were used.'
        ],
        buildOrVersion: {
            timelineSource: TIMELINE_FILE,
            demoFile: path.basename(demoPath)
        }
    };
}

async function validateOutputs() {
    for (const file of [ HERO_MAPPING_OUTPUT, PLAYER_MAPPING_OUTPUT, SOURCES_OUTPUT ]) {
        JSON.parse(await readFile(file, 'utf8'));
        const size = (await stat(file)).size;

        if (size > OUTPUT_SIZE_LIMIT) {
            throw new Error(`${file} exceeds 2 MiB (${size} bytes)`);
        }
    }

    const playerMappings = JSON.parse(await readFile(PLAYER_MAPPING_OUTPUT, 'utf8'));
    const heroMappings = JSON.parse(await readFile(HERO_MAPPING_OUTPUT, 'utf8'));

    if (playerMappings.length !== 12) {
        throw new Error(`Expected 12 player mappings, got ${playerMappings.length}`);
    }

    const byPlayer = new Set(playerMappings.map(player => player.playerIndex));

    if (byPlayer.size !== playerMappings.length) {
        throw new Error('Duplicate playerIndex in player mapping');
    }

    for (const mapping of heroMappings) {
        if (mapping.mappingConfidence === 'high' && !mapping.evidence.some(item => item.kind === 'direct_id_to_name')) {
            throw new Error(`High confidence mapping without direct evidence for ${mapping.heroIdRaw}`);
        }

        if (mapping.heroIdRaw < 0 && mapping.heroIdNormalized !== null && !mapping.evidence.some(item => item.kind === 'direct_id_to_name')) {
            throw new Error(`Negative ID converted without direct evidence for ${mapping.heroIdRaw}`);
        }
    }
}

function normalizeValue(value) {
    if (typeof value === 'bigint') {
        return value.toString();
    }

    if (ArrayBuffer.isView(value)) {
        return Array.from(value);
    }

    return value ?? null;
}

function getNumberField(entity, field) {
    const value = entity?.getField(field);

    return typeof value === 'number' ? value : null;
}

function getBigIntStringField(entity, field) {
    const value = entity?.getField(field);

    if (typeof value === 'bigint') {
        return value.toString();
    }

    return value === undefined || value === null ? null : String(value);
}

async function writeJson(file, data) {
    await writeFile(file, `${JSON.stringify(data, null, 4)}\n`);
}
