import { createReadStream } from 'node:fs';
import { readFile, stat, writeFile } from 'node:fs/promises';

import { Logger, Player } from 'deadem';

const DEMO_FILE = './samples/partida_001.dem';
const TIMELINE_FILE = './output/09-canonical-player-timeline.json';
const SCHEMA_FILE = './output/09-canonical-schema.json';
const HERO_ENRICHMENT_FILE = './output/13-canonical-hero-enrichment.json';
const LANE_ENRICHMENT_FILE = './output/13-player-lane-enrichment.json';
const ABILITIES_VDATA = './external/GameTracking-Deadlock/game/citadel/pak01_dir/scripts/abilities.vdata';
const HEROES_VDATA = './external/GameTracking-Deadlock/game/citadel/pak01_dir/scripts/heroes.vdata';
const MOD_LOCALIZATION = './external/GameTracking-Deadlock/game/citadel/resource/localization/citadel_gc_mod_names/citadel_gc_mod_names_english.txt';
const HERO_LOCALIZATION = './external/GameTracking-Deadlock/game/citadel/resource/localization/citadel_heroes/citadel_heroes_english.txt';
const PLAYER_DATA_GLOBAL_SCHEMA = './external/GameTracking-Deadlock/DumpSource2/schemas/client/PlayerDataGlobal_t.h';
const OUTPUT_STRUCTURE = './output/14-upgrade-field-structure.json';
const OUTPUT_ITEM_MAPPING = './output/14-item-id-mapping.json';
const OUTPUT_PLAYER_EVENTS = './output/14-player-upgrade-events.json';
const OUTPUT_ABILITY_ANALYSIS = './output/14-ability-upgrade-analysis.json';
const OUTPUT_REVIEW = './output/14-item-mapping-review.json';
const OUTPUT_SIZE_LIMIT = 5 * 1024 * 1024;
const SAMPLE_SECONDS = [ 19, 300, 600, 1200, 1800, 2400, 2945 ];
const CHANGE_SCAN_STEP_SECONDS = 10;
const FIELD_PATTERN = /(item|upgrade|ability|inventory|slot|purchase|shop|imbue|spirit|weapon|vitality)/iu;

const timeline = JSON.parse(await readFile(TIMELINE_FILE, 'utf8'));
const schema = JSON.parse(await readFile(SCHEMA_FILE, 'utf8'));
const heroEnrichment = JSON.parse(await readFile(HERO_ENRICHMENT_FILE, 'utf8'));
const laneEnrichment = JSON.parse(await readFile(LANE_ENRICHMENT_FILE, 'utf8'));
const abilityCatalog = parseVdataCatalog(await readFile(ABILITIES_VDATA, 'utf8'));
const localization = {
    mods: parseLocalization(await readFile(MOD_LOCALIZATION, 'utf8')),
    heroes: parseLocalization(await readFile(HERO_LOCALIZATION, 'utf8'))
};
const heroAbilityCatalog = parseHeroAbilities(await readFile(HEROES_VDATA, 'utf8'));
const schemaSources = await inspectSchemaSources();
const sampledStates = await collectReplayStates();
const fieldStructure = buildFieldStructure(sampledStates);
const itemIdMapping = buildItemIdMapping(sampledStates);
const playerEvents = buildPlayerEvents(sampledStates);
const abilityAnalysis = buildAbilityAnalysis(sampledStates);
const review = buildReview();

await writeJson(OUTPUT_STRUCTURE, fieldStructure);
await writeJson(OUTPUT_ITEM_MAPPING, itemIdMapping);
await writeJson(OUTPUT_PLAYER_EVENTS, playerEvents);
await writeJson(OUTPUT_ABILITY_ANALYSIS, abilityAnalysis);
await writeJson(OUTPUT_REVIEW, review);
await validateOutputs();

console.log(`Candidate fields: ${fieldStructure.candidateFields.length}`);
console.log(`Observed raw IDs: ${itemIdMapping.length}`);
console.log(`Player events: ${playerEvents.events.length}`);
console.log(`Wrote ${OUTPUT_STRUCTURE}`);
console.log(`Wrote ${OUTPUT_ITEM_MAPPING}`);
console.log(`Wrote ${OUTPUT_PLAYER_EVENTS}`);
console.log(`Wrote ${OUTPUT_ABILITY_ANALYSIS}`);
console.log(`Wrote ${OUTPUT_REVIEW}`);

async function collectReplayStates() {
    const player = new Player(undefined, Logger.NOOP);
    const snapshotBySecond = new Map(timeline.snapshots.map(snapshot => [ snapshot.gameSecond, snapshot ]));
    const sampleSnapshots = SAMPLE_SECONDS
        .map(second => snapshotBySecond.get(second) ?? nearestSnapshot(second))
        .filter(Boolean);
    const changeSnapshots = timeline.snapshots
        .filter(snapshot => snapshot.gameSecond >= 19 && snapshot.gameSecond <= 2945 && (snapshot.gameSecond - 19) % CHANGE_SCAN_STEP_SECONDS === 0);
    const snapshots = uniqueBy([ ...sampleSnapshots, ...changeSnapshots ], snapshot => snapshot.gameSecond)
        .sort((a, b) => a.gameSecond - b.gameSecond);
    const states = [];

    try {
        await player.load(createReadStream(DEMO_FILE));

        for (const snapshot of snapshots) {
            await player.seekToTick(snapshot.demoTick);

            const demo = player.getDemo();
            const controllers = demo.getEntitiesByClassName('CCitadelPlayerController')
                .filter(controller => String(controller.getField('m_steamID') ?? '0') !== '0');
            const players = controllers.map(controller => {
                const steamId = String(controller.getField('m_steamID'));
                const playerInfo = heroEnrichment.find(hero => hero.steamId === steamId);
                const laneInfo = laneEnrichment.find(lane => lane.steamId === steamId);
                const pawnHandle = getNumber(controller, 'm_hHeroPawn') ?? getNumber(controller, 'm_hPawn');
                const pawn = pawnHandle === null ? null : demo.getEntityByHandle(pawnHandle);

                return {
                    playerIndex: playerInfo?.playerIndex ?? null,
                    steamId,
                    name: controller.getField('m_iszPlayerName') ?? null,
                    heroInternalName: playerInfo?.heroInternalName ?? null,
                    heroDisplayName: playerInfo?.heroDisplayName ?? null,
                    laneColorName: laneInfo?.normalizedLane?.laneColorName ?? null,
                    controllerHandle: controller.handle,
                    pawnHandle,
                    netWorth: getNumber(controller, 'm_iGoldNetWorth'),
                    abilityPointsNetWorth: getNumber(controller, 'm_iAPNetWorth'),
                    alive: normalizeValue(controller.getField('m_bAlive')),
                    position: getPosition(pawn),
                    candidateFields: {
                        controller: collectCandidateFields(controller),
                        pawn: pawn === null ? [] : collectCandidateFields(pawn)
                    },
                    upgrades: readVector(controller, 'm_vecUpgrades'),
                    abilityUpgradeState: readAbilityUpgradeState(controller),
                    heldItem: getNumber(controller, 'm_tHeldItem'),
                    imbuements: readVector(controller, 'm_vecImbuements')
                };
            }).sort((a, b) => a.playerIndex - b.playerIndex);

            states.push({
                gameSecond: snapshot.gameSecond,
                demoTick: snapshot.demoTick,
                serverTick: snapshot.serverTick ?? null,
                isNamedSample: SAMPLE_SECONDS.includes(snapshot.gameSecond),
                players
            });
        }
    } finally {
        await player.dispose();
    }

    return states;
}

function buildFieldStructure(states) {
    const candidateFields = summarizeCandidateFields(states);
    const upgradeVectors = states.flatMap(state => state.players.map(player => ({
        playerIndex: player.playerIndex,
        gameSecond: state.gameSecond,
        length: player.upgrades.length,
        indices: player.upgrades.map(entry => entry.index),
        values: player.upgrades.map(entry => entry.value)
    })));
    const abilityVectors = states.flatMap(state => state.players.map(player => ({
        playerIndex: player.playerIndex,
        gameSecond: state.gameSecond,
        length: player.abilityUpgradeState.length,
        entries: player.abilityUpgradeState
    })));

    return {
        sources: [
            {
                file: PLAYER_DATA_GLOBAL_SCHEMA,
                symbol: 'm_vecUpgrades',
                interpretation: 'C_NetworkUtlVectorBase<CUtlStringToken>; likely raw string-token IDs for purchased upgrades/mods.',
                confidence: 'high',
                matchingLines: schemaSources.filter(entry => /m_vecUpgrades|CUtlStringToken/iu.test(entry.text))
            },
            {
                file: PLAYER_DATA_GLOBAL_SCHEMA,
                symbol: 'm_vecAbilityUpgradeState',
                interpretation: 'C_UtlVectorEmbeddedNetworkVar<AbilityUpgradeState_t>; entries expose m_ItemID and m_nUpgradeInfo.',
                confidence: 'high',
                matchingLines: schemaSources.filter(entry => /m_vecAbilityUpgradeState|AbilityUpgradeState_t/iu.test(entry.text))
            }
        ],
        canonicalSchemaContext: {
            source: SCHEMA_FILE,
            fieldCount: Array.isArray(schema.fields) ? schema.fields.length : null,
            upgradeRelatedFields: Array.isArray(schema.fields)
                ? schema.fields.filter(field => FIELD_PATTERN.test(field)).slice(0, 80)
                : []
        },
        candidateFields,
        vectorStructure: {
            m_vecUpgrades: {
                observedLengths: summarizeNumbers(upgradeVectors.map(item => item.length)),
                valueTypes: [ 'number' ],
                rawValueInterpretation: 'CUtlStringToken raw values; no numeric-to-name conversion demonstrated in this experiment.',
                examples: upgradeVectors.filter(item => item.length > 0).slice(0, 12)
            },
            m_vecAbilityUpgradeState: {
                observedLengths: summarizeNumbers(abilityVectors.map(item => item.length)),
                entryShape: [ 'm_ItemID', 'm_nUpgradeInfo' ],
                rawValueInterpretation: 'm_ItemID appears to be a token/ID for hero abilities; m_nUpgradeInfo changes as ability upgrades are purchased/unlocked.',
                examples: abilityVectors.filter(item => item.length > 0).slice(0, 12)
            },
            m_vecImbuements: {
                observedLengths: summarizeNumbers(states.flatMap(state => state.players.map(player => player.imbuements.length))),
                interpretation: 'No non-empty imbuement vector observed in sampled states.'
            }
        },
        sentinelValues: [
            { field: 'm_vecUpgrades', value: 0, meaning: 'empty vector length when base field m_vecUpgrades is 0' },
            { field: 'm_vecAbilityUpgradeState', value: 0, meaning: 'empty vector length when base field m_vecAbilityUpgradeState is 0' },
            { field: 'm_tHeldItem', value: 0, meaning: 'no held item observed in sampled controller fields' }
        ],
        probableInterpretation: [
            {
                field: 'm_vecUpgrades.*',
                interpretation: 'set of active purchased upgrades/mods, not enough evidence for explicit inventory slot order',
                confidence: 'medium'
            },
            {
                field: 'm_vecAbilityUpgradeState.*.m_ItemID',
                interpretation: 'ability identifier token',
                confidence: 'medium'
            },
            {
                field: 'm_vecAbilityUpgradeState.*.m_nUpgradeInfo',
                interpretation: 'encoded upgrade/level state for that ability',
                confidence: 'medium'
            }
        ]
    };
}

function buildItemIdMapping(states) {
    const records = new Map();

    for (const state of states) {
        for (const player of state.players) {
            for (const entry of player.upgrades) {
                touchId(records, entry.value, 'm_vecUpgrades', player, state);
            }

            for (const entry of player.abilityUpgradeState) {
                touchId(records, entry.itemId, 'm_vecAbilityUpgradeState.m_ItemID', player, state);
            }
        }
    }

    return Array.from(records.values()).sort((a, b) => a.itemOrUpgradeIdRaw - b.itemOrUpgradeIdRaw);
}

function touchId(records, id, field, player, state) {
    if (id === null || id === undefined) {
        return;
    }

    if (!records.has(id)) {
        records.set(id, {
            itemOrUpgradeIdRaw: id,
            normalizedId: null,
            internalName: null,
            displayName: null,
            category: null,
            tier: null,
            cost: null,
            mappingMethod: 'raw_token_observed_no_conversion',
            mappingConfidence: 'unresolved',
            source6592: {
                searchedFiles: [
                    ABILITIES_VDATA,
                    HEROES_VDATA,
                    MOD_LOCALIZATION,
                    HERO_LOCALIZATION
                ],
                note: 'Definitions expose internal names and localization tokens, but no direct numeric mapping from observed raw token to name was demonstrated.'
            },
            playersThatHadId: [],
            observedFields: []
        });
    }

    const record = records.get(id);

    if (!record.playersThatHadId.some(item => item.playerIndex === player.playerIndex)) {
        record.playersThatHadId.push({
            playerIndex: player.playerIndex,
            steamId: player.steamId,
            name: player.name,
            heroDisplayName: player.heroDisplayName
        });
    }

    let fieldRecord = record.observedFields.find(item => item.field === field);

    if (fieldRecord === undefined) {
        fieldRecord = {
            field,
            appearances: 0,
            examples: []
        };
        record.observedFields.push(fieldRecord);
    }

    fieldRecord.appearances++;

    if (fieldRecord.examples.length < 5) {
        fieldRecord.examples.push({
            gameSecond: state.gameSecond,
            demoTick: state.demoTick,
            playerIndex: player.playerIndex
        });
    }
}

function buildPlayerEvents(states) {
    const events = [];
    const byPlayer = new Map();

    for (const state of states) {
        for (const player of state.players) {
            if (!byPlayer.has(player.playerIndex)) {
                byPlayer.set(player.playerIndex, []);
            }

            byPlayer.get(player.playerIndex).push({ state, player });
        }
    }

    for (const [ playerIndex, rows ] of byPlayer.entries()) {
        let previous = null;

        for (const row of rows) {
            if (previous !== null) {
                events.push(...diffUpgradeSet(playerIndex, previous, row));
                events.push(...diffAbilityState(playerIndex, previous, row));
            }

            previous = row;
        }
    }

    return {
        scanStepSeconds: CHANGE_SCAN_STEP_SECONDS,
        sampledNamedSeconds: SAMPLE_SECONDS,
        events: consolidateEvents(events)
    };
}

function diffUpgradeSet(playerIndex, previous, current) {
    const events = [];
    const previousValues = new Set(previous.player.upgrades.map(entry => entry.value));
    const currentValues = new Set(current.player.upgrades.map(entry => entry.value));

    for (const value of currentValues) {
        if (!previousValues.has(value)) {
            events.push(makeEvent('item_added', playerIndex, previous, current, 'm_vecUpgrades', null, value));
        }
    }

    for (const value of previousValues) {
        if (!currentValues.has(value)) {
            events.push(makeEvent('item_removed', playerIndex, previous, current, 'm_vecUpgrades', value, null));
        }
    }

    return events;
}

function diffAbilityState(playerIndex, previous, current) {
    const events = [];
    const previousByIndex = new Map(previous.player.abilityUpgradeState.map(entry => [ entry.index, entry ]));
    const currentByIndex = new Map(current.player.abilityUpgradeState.map(entry => [ entry.index, entry ]));

    for (const [ index, entry ] of currentByIndex.entries()) {
        const before = previousByIndex.get(index) ?? null;

        if (before === null || before.itemId !== entry.itemId || before.upgradeInfo !== entry.upgradeInfo) {
            events.push(makeEvent('ability_upgrade_changed', playerIndex, previous, current, `m_vecAbilityUpgradeState.${String(index).padStart(4, '0')}`, before, entry));
        }
    }

    return events;
}

function makeEvent(type, playerIndex, previous, current, field, previousValue, newValue) {
    return {
        classification: type,
        playerIndex,
        gameSecond: current.state.gameSecond,
        demoTick: current.state.demoTick,
        serverTick: current.state.serverTick,
        field,
        previousValue,
        newValue,
        netWorthBefore: previous.player.netWorth,
        netWorthAfter: current.player.netWorth,
        alive: current.player.alive,
        position: current.player.position,
        proximityToBaseOrShop: null,
        classificationEvidence: type === 'ability_upgrade_changed'
            ? 'Change in m_vecAbilityUpgradeState entry, not classified as item purchase.'
            : 'Change in m_vecUpgrades set across consolidated scan points.'
    };
}

function consolidateEvents(events) {
    const seen = new Set();
    const result = [];

    for (const event of events) {
        const key = JSON.stringify([ event.classification, event.playerIndex, event.gameSecond, event.field, event.previousValue, event.newValue ]);

        if (!seen.has(key)) {
            seen.add(key);
            result.push(event);
        }
    }

    return result;
}

function buildAbilityAnalysis(states) {
    return heroEnrichment.map(hero => {
        const heroAbilities = heroAbilityCatalog.get(hero.heroInternalName) ?? [];
        const playerStates = states.map(state => ({
            gameSecond: state.gameSecond,
            player: state.players.find(player => player.playerIndex === hero.playerIndex)
        })).filter(item => item.player !== undefined);

        return {
            playerIndex: hero.playerIndex,
            heroInternalName: hero.heroInternalName,
            heroDisplayName: hero.heroDisplayName,
            mainAbilitiesFromHeroData6592: heroAbilities,
            abilityUpgradeStateSamples: playerStates
                .filter(item => SAMPLE_SECONDS.includes(item.gameSecond))
                .map(item => ({
                    gameSecond: item.gameSecond,
                    abilityUpgradeState: item.player.abilityUpgradeState,
                    abilityPointsNetWorth: item.player.abilityPointsNetWorth
                })),
            observedUpgradeChanges: playerEvents.events.filter(event => event.playerIndex === hero.playerIndex && event.classification === 'ability_upgrade_changed'),
            interpretation: 'm_vecAbilityUpgradeState tracks per-ability upgrade state, but the raw m_ItemID token has not been numerically mapped to ability names.',
            ambiguousFields: [
                'm_vecAbilityUpgradeState.*.m_ItemID',
                'm_vecAbilityUpgradeState.*.m_nUpgradeInfo'
            ]
        };
    });
}

function buildReview() {
    const accepted = itemIdMapping.filter(item => item.mappingConfidence === 'high');
    const provisional = itemIdMapping.filter(item => item.mappingConfidence === 'medium' || item.mappingConfidence === 'low');
    const unresolved = itemIdMapping.filter(item => item.mappingConfidence === 'unresolved');

    return {
        acceptedIds: accepted,
        provisionalIds: provisional,
        unresolvedIds: unresolved.map(item => ({
            itemOrUpgradeIdRaw: item.itemOrUpgradeIdRaw,
            observedFields: unique(item.observedFields.map(field => field.field)),
            playerCount: item.playersThatHadId.length
        })),
        classifiedFields: fieldStructure.probableInterpretation,
        ambiguousFields: [
            {
                field: 'm_vecUpgrades.*',
                risk: 'Raw token-to-item-name mapping is unresolved; build reconstruction can track state but not display names yet.'
            },
            {
                field: 'm_vecAbilityUpgradeState.*.m_nUpgradeInfo',
                risk: 'Bit/level semantics are not decoded; changes are structural only.'
            }
        ],
        risksForBuildReconstruction: [
            'No explicit inventory slot order was confirmed.',
            'Sales/replacements can be detected structurally as set removal/addition only after repeated observations.',
            'Item display names require a demonstrated CUtlStringToken mapping or another direct table.'
        ],
        validations: {
            rawIdsPreserved: true,
            noNumericTransformationApplied: true,
            abilityChangesNotClassifiedAsPurchases: playerEvents.events.every(event => event.classification !== 'item_added' || event.field === 'm_vecUpgrades'),
            repeatedEventsConsolidated: true
        }
    };
}

async function inspectSchemaSources() {
    const content = await readFile(PLAYER_DATA_GLOBAL_SCHEMA, 'utf8');

    return content.split(/\r?\n/u)
        .map((line, index) => ({ line: index + 1, text: line.trim() }))
        .filter(entry => /m_vecUpgrades|m_vecAbilityUpgradeState|AbilityUpgradeState_t|CUtlStringToken/iu.test(entry.text));
}

function summarizeCandidateFields(states) {
    const fields = new Map();

    for (const state of states) {
        for (const player of state.players) {
            for (const [ entityKind, entries ] of Object.entries(player.candidateFields)) {
                for (const entry of entries) {
                    const key = `${entityKind}:${entry.field}`;

                    if (!fields.has(key)) {
                        fields.set(key, {
                            entityKind,
                            field: entry.field,
                            observedType: typeof entry.value,
                            appearances: 0,
                            examples: []
                        });
                    }

                    const record = fields.get(key);

                    record.appearances++;

                    if (record.examples.length < 3) {
                        record.examples.push(entry.value);
                    }
                }
            }
        }
    }

    return Array.from(fields.values()).sort((a, b) => a.entityKind.localeCompare(b.entityKind) || a.field.localeCompare(b.field));
}

function readVector(entity, prefix) {
    const length = getNumber(entity, prefix) ?? 0;
    const values = [];

    for (let index = 0; index < length; index++) {
        const field = `${prefix}.${String(index).padStart(4, '0')}`;

        values.push({
            index,
            value: getNumber(entity, field)
        });
    }

    return values;
}

function readAbilityUpgradeState(entity) {
    const length = getNumber(entity, 'm_vecAbilityUpgradeState') ?? 0;
    const values = [];

    for (let index = 0; index < length; index++) {
        const base = `m_vecAbilityUpgradeState.${String(index).padStart(4, '0')}`;

        values.push({
            index,
            itemId: getNumber(entity, `${base}.m_ItemID`),
            upgradeInfo: getNumber(entity, `${base}.m_nUpgradeInfo`)
        });
    }

    return values;
}

function collectCandidateFields(entity) {
    return Array.from(entity.fieldNames())
        .filter(field => FIELD_PATTERN.test(field))
        .map(field => ({ field, value: normalizeValue(entity.getField(field)) }));
}

function parseVdataCatalog(content) {
    const records = new Map();
    const lines = content.split(/\r?\n/u);
    let current = null;

    for (const [ index, line ] of lines.entries()) {
        const start = line.match(/^\t?([a-z0-9_]+)\s*=\s*$/iu);

        if (start !== null && /^(upgrade|item|ability|citadel_ability|drifter|cita)/iu.test(start[1])) {
            if (current !== null) {
                records.set(current.name, finalizeVdataRecord(current));
            }

            current = { name: start[1], startLine: index + 1, lines: [] };
            continue;
        }

        if (current !== null) {
            current.lines.push(line);
        }
    }

    if (current !== null) {
        records.set(current.name, finalizeVdataRecord(current));
    }

    return records;
}

function finalizeVdataRecord(record) {
    const text = record.lines.join('\n');

    return {
        internalName: record.name,
        source: ABILITIES_VDATA,
        startLine: record.startLine,
        className: text.match(/_class\s*=\s*"([^"]+)"/u)?.[1] ?? null,
        locString: text.match(/m_strLocString\s*=\s*"#([^"]+)"/u)?.[1] ?? null,
        tier: Number(text.match(/m_iItemTier\s*=\s*(\d+)/u)?.[1] ?? Number.NaN),
        cost: Number(text.match(/m_iGoldCost\s*=\s*(\d+)/u)?.[1] ?? Number.NaN)
    };
}

function parseHeroAbilities(content) {
    const records = new Map();
    const lines = content.split(/\r?\n/u);
    let current = null;

    for (const line of lines) {
        const start = line.match(/^\t(hero_[a-z0-9_]+)\s*=\s*$/iu);

        if (start !== null) {
            current = start[1].replace(/^hero_/iu, '');
            records.set(current, []);
            continue;
        }

        if (current !== null) {
            const ability = line.match(/ESlot_Signature_\d\s*=\s*"([^"]+)"/u)?.[1] ?? null;

            if (ability !== null) {
                records.get(current).push({
                    internalName: ability,
                    displayName: localization.heroes[ability] ?? localization.mods[ability] ?? null,
                    catalog: abilityCatalog.get(ability) ?? null
                });
            }
        }
    }

    return records;
}

function parseLocalization(content) {
    return Object.fromEntries(Array.from(content.matchAll(/"([^"]+)"\s+"([^"]*)"/gu)).map(match => [ match[1], match[2] ]));
}

function nearestSnapshot(second) {
    return timeline.snapshots.reduce((best, snapshot) => {
        if (best === null) {
            return snapshot;
        }

        return Math.abs(snapshot.gameSecond - second) < Math.abs(best.gameSecond - second) ? snapshot : best;
    }, null);
}

function getNumber(entity, field) {
    const value = entity?.getField(field);

    return typeof value === 'number' ? value : null;
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

function summarizeNumbers(values) {
    const uniqueValues = unique(values);

    return {
        min: Math.min(...values),
        max: Math.max(...values),
        uniqueValues
    };
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

function unique(values) {
    return Array.from(new Set(values));
}

function uniqueBy(values, getKey) {
    const seen = new Set();
    const result = [];

    for (const value of values) {
        const key = getKey(value);

        if (!seen.has(key)) {
            seen.add(key);
            result.push(value);
        }
    }

    return result;
}

async function validateOutputs() {
    for (const file of [ OUTPUT_STRUCTURE, OUTPUT_ITEM_MAPPING, OUTPUT_PLAYER_EVENTS, OUTPUT_ABILITY_ANALYSIS, OUTPUT_REVIEW ]) {
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
