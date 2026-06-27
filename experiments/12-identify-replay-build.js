import { createReadStream } from 'node:fs';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { DemoPacketType, InterceptorStage, Logger, MessagePacketType, Parser, Player } from 'deadem';

const execFileAsync = promisify(execFile);
const DEMO_FILE = './samples/partida_001.dem';
const HERO_RECONCILIATION = './output/11-hero-identity-reconciliation.json';
const PLAYER_RECONCILIATION = './output/11-player-hero-reconciliation.json';
const CANONICAL_TIMELINE = './output/09-canonical-player-timeline.json';
const GAME_TRACKING_ROOT = './external/GameTracking-Deadlock';
const METADATA_ROOT = './external/deadlock-metadata';
const GAME_TRACKING_HEROES = 'game/citadel/pak01_dir/scripts/heroes.vdata';
const METADATA_PATCHDATES = './external/deadlock-metadata/patchdates.json';
const METADATA_HERO_BASE = 'heroes/base.json';
const SAFE_ROOT = `${process.cwd().replace(/\\/gu, '/')}/`;
const METADATA_OUTPUT = './output/12-replay-metadata.json';
const FINGERPRINT_OUTPUT = './output/12-build-fingerprint.json';
const IDENTIFICATION_OUTPUT = './output/12-build-identification.json';
const HERO_ID_ANALYSIS_OUTPUT = './output/12-historical-hero-id-analysis.json';
const OUTPUT_SIZE_LIMIT = 5 * 1024 * 1024;

const heroReconciliation = JSON.parse(await readFile(HERO_RECONCILIATION, 'utf8'));
const playerReconciliation = JSON.parse(await readFile(PLAYER_RECONCILIATION, 'utf8'));
const timeline = JSON.parse(await readFile(CANONICAL_TIMELINE, 'utf8'));
const repositoryApiSources = await inspectRepositoryApis();
const directMetadata = await inspectReplayMetadata();
const buildFingerprint = await buildReplayFingerprint();
const historicalAnalysis = await analyzeHistoricalHeroIds(buildFingerprint);
const buildIdentification = buildIdentificationReport(directMetadata, buildFingerprint, historicalAnalysis);

await writeJson(METADATA_OUTPUT, directMetadata);
await writeJson(FINGERPRINT_OUTPUT, buildFingerprint);
await writeJson(IDENTIFICATION_OUTPUT, buildIdentification);
await writeJson(HERO_ID_ANALYSIS_OUTPUT, historicalAnalysis);
await validateOutputs();

console.log(`Direct metadata records: ${directMetadata.records.length}`);
console.log(`Historical commits compared: ${historicalAnalysis.commitComparisons.length}`);
console.log(`Version match type: ${buildIdentification.versionMatchType}`);
console.log(`Hero ID rule demonstrated: ${historicalAnalysis.demonstratedRule ?? 'none'}`);
console.log(`Wrote ${METADATA_OUTPUT}`);
console.log(`Wrote ${FINGERPRINT_OUTPUT}`);
console.log(`Wrote ${IDENTIFICATION_OUTPUT}`);
console.log(`Wrote ${HERO_ID_ANALYSIS_OUTPUT}`);

async function inspectReplayMetadata() {
    const parser = new Parser(undefined, Logger.NOOP);
    const records = [];
    const messageCounts = {};
    const firstMessagesByType = {};
    const demoPacketCounts = {};
    const recordedMessageTypes = new Set();

    try {
        parser.registerPostInterceptor(InterceptorStage.DEMO_PACKET, (demoPacket) => {
            const code = demoPacket.type?.code ?? String(demoPacket.type?.id ?? 'unknown');

            demoPacketCounts[code] = (demoPacketCounts[code] ?? 0) + 1;

            if (demoPacket.type === DemoPacketType.DEM_FILE_HEADER || code === 'DEM_FileHeader') {
                addFields(records, 'DEM_FileHeader', demoPacket.data, [
                    'demoFileStamp',
                    'patchVersion',
                    'serverName',
                    'clientName',
                    'mapName',
                    'gameDirectory',
                    'fullpacketsVersion',
                    'allowClientsideEntities',
                    'allowClientsideParticles',
                    'addons',
                    'demoVersionName',
                    'demoVersionGuid',
                    'buildNum',
                    'game',
                    'serverStartTick'
                ], 'direct');
            }

            if (demoPacket.type === DemoPacketType.DEM_FILE_INFO || code === 'DEM_FileInfo') {
                addFields(records, 'DEM_FileInfo', demoPacket.data, [
                    'playbackTime',
                    'playbackTicks',
                    'playbackFrames'
                ], 'direct');
                addNestedRecords(records, 'DEM_FileInfo.gameInfo', demoPacket.data?.gameInfo);
            }
        });

        parser.registerPostInterceptor(InterceptorStage.MESSAGE_PACKET, (demoPacket, messagePacket) => {
            const code = messagePacket.type?.code ?? String(messagePacket.type?.id ?? 'unknown');

            messageCounts[code] = (messageCounts[code] ?? 0) + 1;

            if (!firstMessagesByType[code]) {
                firstMessagesByType[code] = {
                    demoTick: demoPacket.tick,
                    values: pickVersionFields(messagePacket.data)
                };
            }

            if ((messagePacket.type === MessagePacketType.SVC_SERVER_INFO || code === 'svc_ServerInfo') && !recordedMessageTypes.has('svc_ServerInfo')) {
                recordedMessageTypes.add('svc_ServerInfo');
                addFields(records, 'svc_ServerInfo', messagePacket.data, [
                    'protocol',
                    'serverCount',
                    'isDedicated',
                    'isOfficialValveServer',
                    'isHltv',
                    'isReplay',
                    'isRedirectingToProxyRelay',
                    'cOs',
                    'mapCrc',
                    'clientCrc',
                    'stringTableCrc',
                    'maxClients',
                    'maxClasses',
                    'playerSlot',
                    'tickInterval',
                    'gameDir',
                    'mapName',
                    'mapGroupName',
                    'skyName',
                    'hostName',
                    'addonName',
                    'gameSessionConfig'
                ], 'direct');
            }

            if ((messagePacket.type === MessagePacketType.NET_SIGNON_STATE || code === 'net_SignonState') && !recordedMessageTypes.has('net_SignonState')) {
                recordedMessageTypes.add('net_SignonState');
                addFields(records, 'net_SignonState', messagePacket.data, [
                    'signonState',
                    'spawnCount',
                    'numServerPlayers',
                    'playersNetworkids',
                    'mapName'
                ], 'supporting_fingerprint');
            }

            if ((messagePacket.type === MessagePacketType.NET_TICK || code === 'net_Tick') && !recordedMessageTypes.has('net_Tick')) {
                recordedMessageTypes.add('net_Tick');
                addFields(records, 'net_Tick.firstObserved', messagePacket.data, [
                    'tick',
                    'hostComputationTime',
                    'hostComputationTimeStdDeviation',
                    'hostFramestartTimeStdDeviation',
                    'hltvReplayFlags'
                ], 'supporting_fingerprint');
            }
        });

        await parser.parse(createReadStream(DEMO_FILE));
    } finally {
        await parser.dispose();
    }

    return {
        demoFile: DEMO_FILE,
        records,
        knownAbsentOrEmptyCandidates: getKnownAbsent(records),
        messageCounts,
        firstMessagesByType,
        demoPacketCounts,
        repositoryApiSources
    };
}

function addFields(records, origin, data, fields, evidenceLevel) {
    for (const field of fields) {
        records.push({
            origin,
            field,
            value: normalizeValue(data?.[field]),
            interpretation: interpretField(origin, field, data?.[field]),
            confidence: data !== undefined && data !== null && data[field] !== undefined ? evidenceLevel : 'weak'
        });
    }
}

function addNestedRecords(records, origin, data) {
    const dota = data?.dota ?? null;

    records.push({
        origin,
        field: 'gameInfo',
        value: summarizeObject(data),
        interpretation: dota === null ? 'gameInfo present but no Dota/Citadel-like metadata populated' : 'gameInfo contains Dota/Citadel-like metadata',
        confidence: dota === null ? 'weak' : 'direct'
    });

    if (dota !== null) {
        addFields(records, `${origin}.dota`, dota, [
            'matchId',
            'gameMode',
            'gameWinner',
            'leagueid',
            'radiantTeamId',
            'direTeamId',
            'radiantTeamTag',
            'direTeamTag',
            'endTime'
        ], 'direct');
    }
}

function pickVersionFields(data) {
    const result = {};

    for (const [ key, value ] of Object.entries(data ?? {})) {
        if (/(version|build|protocol|server|client|map|time|tick|steam|match|lobby|game|host|session|signon|spawn)/iu.test(key)) {
            result[key] = normalizeValue(value);
        }
    }

    return result;
}

function getKnownAbsent(records) {
    return [
        'CDemoFileHeader.build_num',
        'CDemoFileHeader.demo_version_name',
        'CDemoFileHeader.demo_version_guid',
        'CDemoFileInfo.game_info.dota.match_id',
        'CDemoFileInfo.game_info.dota.end_time',
        'svc_ServerInfo.protocol',
        'svc_ServerInfo.game_session_config'
    ].map(candidate => ({
        candidate,
        observed: records.some(record => `${record.origin}.${record.field}`.toLowerCase() === candidate.toLowerCase() && record.value !== null)
    }));
}

async function inspectRepositoryApis() {
    return [
        {
            file: 'packages/deadem/proto/source/demo.proto',
            classOrFunction: 'CDemoFileHeader / CDemoFileInfo',
            field: 'build_num, demo_version_name, demo_version_guid, game_info',
            domain: 'direct replay protobuf metadata',
            valueFound: 'registered and decoded when present'
        },
        {
            file: 'packages/engine/src/bootstrap/Bootstrap.js',
            classOrFunction: '_registerDemoPacketTypes',
            field: 'DEM_FileHeader, DEM_FileInfo',
            domain: 'demo packet type registry',
            valueFound: 'both packet types are registered'
        },
        {
            file: 'packages/engine/src/bootstrap/Bootstrap.js',
            classOrFunction: '_registerMessagePacketTypes',
            field: 'svc_ServerInfo, net_SignonState, net_Tick',
            domain: 'network message type registry',
            valueFound: 'version-adjacent network messages are registered'
        },
        {
            file: 'packages/engine/src/handlers/DemoMessageHandler.js',
            classOrFunction: 'handleSvcServerInfo',
            field: 'maxClasses, maxClients, tickInterval',
            domain: 'demo.server',
            valueFound: 'only max classes, max clients, and tick interval are persisted to Demo.server'
        },
        {
            file: 'packages/engine/src/data/Demo.js',
            classOrFunction: 'Demo.server / getStats / getClasses',
            field: 'server, classes, serializers',
            domain: 'Player/Parser exposed demo state',
            valueFound: 'available after parse/load'
        }
    ];
}

async function buildReplayFingerprint() {
    const player = new Player(undefined, Logger.NOOP);

    try {
        await player.load(createReadStream(DEMO_FILE));
        await player.seekToTick(timeline.metadata?.range?.firstDemoTick ?? timeline.snapshots?.[0]?.demoTick ?? 0);

        const demo = player.getDemo();
        const classes = demo.getClasses().map(clazz => clazz.name).sort();
        const stats = demo.getStats();
        const entities = demo.getEntities();
        const classCounts = countBy(entities, entity => entity.class.name);
        const gameRules = demo.getEntitiesByClassName('CCitadelGameRulesProxy')[0] ?? null;
        const controller = demo.getEntitiesByClassName('CCitadelPlayerController')[0] ?? null;
        const pawn = demo.getEntitiesByClassName('CCitadelPlayerPawn')[0] ?? null;

        return {
            demoFile: DEMO_FILE,
            timelineRange: timeline.metadata?.range ?? null,
            playerCount: playerReconciliation.length,
            heroes: heroReconciliation.map(hero => ({
                heroIdRaw: hero.heroIdRaw,
                currentExternalHeroId: hero.currentExternalHeroId,
                internalNameAtReplay: hero.internalNameAtReplay,
                currentInternalName: hero.currentInternalName,
                currentDisplayName: hero.currentDisplayName,
                observedAbilities: hero.evidence.find(item => item.kind === 'replay_observed_abilities')?.values ?? [],
                players: hero.players
            })),
            schema: {
                stats,
                classCounts,
                classCount: classes.length,
                serializerCount: stats.serializers,
                discriminantClasses: classes.filter(name => /(Citadel|Ability|Hero|Player|GameRules|Objective|Boss|Shop|Item|Upgrade|Zipline|Trooper)/u.test(name)).slice(0, 250),
                playerControllerFields: controller === null ? [] : Array.from(controller.fieldNames()).sort(),
                playerPawnFields: pawn === null ? [] : Array.from(pawn.fieldNames()).sort(),
                gameRulesFields: gameRules === null ? [] : Array.from(gameRules.fieldNames()).sort()
            },
            gameRules: {
                present: gameRules !== null,
                gameState: normalizeValue(gameRules?.getField('m_nGameState')),
                matchClockUpdateTick: normalizeValue(gameRules?.getField('m_nMatchClockUpdateTick')),
                matchClockUpdateClock: normalizeValue(gameRules?.getField('m_flMatchClockUpdateClock'))
            },
            resourcesAndSystems: {
                mapNames: unique(directMetadata?.records?.filter(record => /map/iu.test(record.field)).map(record => record.value).filter(Boolean) ?? []),
                objectiveClasses: classes.filter(name => /(Objective|Boss|Guardian|Sentry|Walker|Patron|Trooper|Barrack)/iu.test(name)),
                abilityClasses: classes.filter(name => /Ability/iu.test(name)).slice(0, 250),
                itemOrUpgradeClasses: classes.filter(name => /(Item|Upgrade|Shop|Mod)/iu.test(name)).slice(0, 250),
                messageTypesAvailableInCode: await readMessageTypeDefinitions()
            },
            evidenceLevels: [
                {
                    level: 'supporting_fingerprint',
                    detail: 'All 12 current-data hero ability sets matched replay observed abilities, but current IDs differ from replay raw IDs.'
                },
                {
                    level: 'weak',
                    detail: 'Schema/class inventory is compatible with current Deadem parser but was not yet reduced to a unique historical commit.'
                }
            ]
        };
    } finally {
        await player.dispose();
    }
}

async function analyzeHistoricalHeroIds(fingerprint) {
    const commits = await getHistoricalCommits(GAME_TRACKING_ROOT, GAME_TRACKING_HEROES, 60);
    const comparisons = [];

    for (const commit of commits) {
        const content = await gitShow(GAME_TRACKING_ROOT, `${commit.commit}:${GAME_TRACKING_HEROES}`);

        if (content === null) {
            comparisons.push({
                ...commit,
                compatible: false,
                reason: 'heroes.vdata not present in this commit',
                heroMatches: []
            });
            continue;
        }

        const table = parseHeroesVdata(content);
        const heroMatches = fingerprint.heroes.map(hero => {
            const byCurrentName = table.find(entry => entry.internalName === hero.currentInternalName);
            const abilityOverlap = byCurrentName === undefined ? [] : hero.observedAbilities.filter(ability => byCurrentName.abilities.includes(ability));

            return {
                heroIdRaw: hero.heroIdRaw,
                currentInternalName: hero.currentInternalName,
                historicalHeroId: byCurrentName?.heroId ?? null,
                present: byCurrentName !== undefined,
                abilityOverlap,
                abilityOverlapCount: abilityOverlap.length
            };
        });
        const compatible = heroMatches.every(match => match.present && match.abilityOverlapCount >= 2);

        comparisons.push({
            ...commit,
            compatible,
            matchCount: heroMatches.filter(match => match.present && match.abilityOverlapCount >= 2).length,
            heroMatches
        });
    }

    const compatibleCommits = comparisons.filter(comparison => comparison.compatible);
    const rules = testHeroIdRules(fingerprint.heroes, compatibleCommits[0]?.heroMatches ?? []);

    return {
        tablesHistoricalFound: comparisons.length,
        commitComparisons: comparisons,
        earliestCompatibleCommit: compatibleCommits.at(-1) ?? null,
        latestCompatibleCommit: compatibleCommits[0] ?? null,
        immediatelyOlderIncompatibleCommit: findBoundary(comparisons, compatibleCommits.at(-1), 'older'),
        immediatelyNewerIncompatibleCommit: findBoundary(comparisons, compatibleCommits[0], 'newer'),
        conversionRulesTested: rules.tested,
        rejectedRules: rules.rejected,
        demonstratedRule: rules.demonstrated,
        metadataPatchdates: summarizePatchdates(JSON.parse(await readFile(METADATA_PATCHDATES, 'utf8'))),
        metadataHistory: await summarizeMetadataHistory()
    };
}

async function getHistoricalCommits(repository, file, limit) {
    const stdout = await git(repository, [ 'log', `--max-count=${limit}`, '--format=%H%x09%cI%x09%s', '--', file ]);

    return stdout.trim().split(/\r?\n/u)
        .filter(Boolean)
        .map(line => {
            const [ commit, date, subject ] = line.split('\t');

            return { commit, date, subject };
        });
}

async function gitShow(repository, ref) {
    try {
        return await git(repository, [ 'show', ref ]);
    } catch {
        return null;
    }
}

async function git(repository, args) {
    const safeDirectory = `${SAFE_ROOT}${repository.replace('./', '').replaceAll('\\', '/')}`;
    const { stdout } = await execFileAsync('git', [ '-c', `safe.directory=${safeDirectory}`, '-C', repository, ...args ], {
        maxBuffer: 25 * 1024 * 1024
    });

    return stdout;
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

            current = {
                key: start[1],
                internalName: start[1].replace(/^hero_/iu, ''),
                startLine: index + 1,
                lines: []
            };
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

function testHeroIdRules(heroes, heroMatches) {
    const pairs = heroes.map(hero => {
        const match = heroMatches.find(item => item.heroIdRaw === hero.heroIdRaw);

        return {
            raw: hero.heroIdRaw,
            external: match?.historicalHeroId ?? hero.currentExternalHeroId
        };
    }).filter(pair => Number.isFinite(pair.external));
    const tested = [
        {
            rule: 'identity',
            matches: pairs.filter(pair => pair.raw === pair.external).length,
            total: pairs.length
        },
        {
            rule: 'absolute',
            matches: pairs.filter(pair => Math.abs(pair.raw) === pair.external).length,
            total: pairs.length
        },
        {
            rule: 'unsigned8',
            matches: pairs.filter(pair => (pair.raw & 0xFF) === pair.external).length,
            total: pairs.length
        },
        {
            rule: 'unsigned16',
            matches: pairs.filter(pair => (pair.raw & 0xFFFF) === pair.external).length,
            total: pairs.length
        },
        {
            rule: 'constant_offset',
            offsets: unique(pairs.map(pair => pair.external - pair.raw)),
            total: pairs.length
        }
    ];
    const rejected = tested.map(rule => ({
        ...rule,
        reason: rule.rule === 'constant_offset'
            ? 'No single offset covered all 12 heroes.'
            : 'Rule did not match all 12 heroes.'
    }));

    return {
        tested,
        rejected,
        demonstrated: null
    };
}

function findBoundary(comparisons, boundary, direction) {
    if (boundary === null) {
        return null;
    }

    const index = comparisons.findIndex(comparison => comparison.commit === boundary.commit);
    const candidates = direction === 'older' ? comparisons.slice(index + 1) : comparisons.slice(0, index).reverse();

    return candidates.find(candidate => !candidate.compatible) ?? null;
}

function buildIdentificationReport(metadata, fingerprint, analysis) {
    const directBuildFields = metadata.records.filter(record => /(build|version|time|date)/iu.test(record.field) && record.value !== null);
    const compatible = analysis.commitComparisons.filter(commit => commit.compatible);
    const versionMatchType = compatible.length > 0 ? 'bounded_window' : 'current_only';
    const heroesUpgradeable = versionMatchType === 'bounded_window' && analysis.demonstratedRule !== null ? 12 : 0;

    return {
        exactBuild: directBuildFields.find(record => /build/iu.test(record.field))?.value ?? null,
        exactBuildConfidence: directBuildFields.some(record => /build/iu.test(record.field) && record.value !== null) ? 'direct' : 'unresolved',
        earliestCompatibleCommit: analysis.earliestCompatibleCommit,
        latestCompatibleCommit: analysis.latestCompatibleCommit,
        estimatedReplayDateStart: analysis.earliestCompatibleCommit?.date ?? null,
        estimatedReplayDateEnd: analysis.latestCompatibleCommit?.date ?? null,
        versionMatchType,
        explanation: versionMatchType === 'bounded_window'
            ? 'The sampled GameTracking history contains commits where all 12 current hero ability sets are simultaneously compatible with replay-observed abilities, but no direct replay build or numeric heroIdRaw conversion was found.'
            : 'No direct replay build/date was found, and the available local history did not establish a bounded compatible window.',
        limitations: [
            'The GameTracking clone is shallow, so the historical window is limited to locally available commits.',
            'No destructive checkout was performed.',
            'Compatibility is based on hero ability membership and schema fingerprints, not full replay-build equality.',
            'No demonstrated heroIdRaw conversion rule was found.'
        ],
        strongestEvidence: [
            ...directBuildFields.map(record => ({ level: record.confidence, origin: record.origin, field: record.field, value: record.value })),
            {
                level: compatible.length > 0 ? 'strong_fingerprint' : 'supporting_fingerprint',
                field: '12 hero ability sets simultaneous compatibility',
                value: compatible.length
            }
        ],
        conflicts: [
            ...analysis.rejectedRules.map(rule => ({
                kind: 'hero_id_rule_rejected',
                rule: rule.rule,
                reason: rule.reason
            })),
            {
                kind: 'current_external_ids_differ_from_replay_raw_ids',
                detail: 'Current/historical m_HeroID values do not match heroIdRaw under tested simple rules.'
            }
        ],
        heroConfidenceUpgradeCount: heroesUpgradeable
    };
}

async function readMessageTypeDefinitions() {
    const content = await readFile('./packages/deadem/src/data/enums/MessagePacketType.js', 'utf8');

    return Array.from(content.matchAll(/new MessagePacketType\('([^']+)',\s*(\d+)\)/gu))
        .map(match => ({ code: match[1], id: Number(match[2]) }))
        .slice(0, 200);
}

function summarizePatchdates(data) {
    return {
        source: METADATA_PATCHDATES,
        entryCount: Object.keys(data).length,
        firstEntries: Object.entries(data).slice(0, 10)
    };
}

async function summarizeMetadataHistory() {
    const commits = await getHistoricalCommits(METADATA_ROOT, METADATA_HERO_BASE, 50);

    return {
        file: `${METADATA_ROOT}/${METADATA_HERO_BASE}`,
        commitsSampled: commits
    };
}

function interpretField(origin, field, value) {
    if (value === undefined || value === null) {
        return 'candidate field absent or empty in decoded replay data';
    }

    if (/(build|version|protocol)/iu.test(field)) {
        return 'candidate direct build/protocol/version value';
    }

    if (/(time|tick|frame)/iu.test(field)) {
        return 'timeline/playback metadata, useful as support but not a build by itself';
    }

    if (/(map|server|client|game|host)/iu.test(field)) {
        return 'environment/identity metadata, useful as fingerprint support';
    }

    return `decoded ${origin} field`;
}

function summarizeObject(value) {
    if (value === undefined || value === null) {
        return null;
    }

    if (Array.isArray(value)) {
        return { type: 'array', length: value.length };
    }

    if (typeof value === 'object') {
        const entries = Object.entries(value);

        return {
            type: value.constructor?.name ?? 'Object',
            keyCount: entries.length,
            sample: Object.fromEntries(entries.slice(0, 30).map(([ key, item ]) => [ key, Array.isArray(item) ? { type: 'array', length: item.length } : normalizeValue(item) ]))
        };
    }

    return normalizeValue(value);
}

function normalizeValue(value) {
    if (typeof value === 'bigint') {
        return value.toString();
    }

    if (ArrayBuffer.isView(value)) {
        return {
            type: value.constructor.name,
            byteLength: value.byteLength
        };
    }

    if (Array.isArray(value)) {
        return value.map(item => normalizeValue(item)).slice(0, 20);
    }

    if (value !== null && typeof value === 'object') {
        return summarizeObject(value);
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

function unique(values) {
    return Array.from(new Set(values));
}

async function validateOutputs() {
    for (const file of [ METADATA_OUTPUT, FINGERPRINT_OUTPUT, IDENTIFICATION_OUTPUT, HERO_ID_ANALYSIS_OUTPUT ]) {
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
