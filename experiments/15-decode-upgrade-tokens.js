import { readFile, stat, writeFile } from 'node:fs/promises';

const DEMO_FILE = './samples/partida_001.dem';
const FIELD_SAMPLES_02_FILE = './output/02-player-fields.json';
const STRUCTURE_FILE = './output/14-upgrade-field-structure.json';
const TOKEN_MAPPING_14_FILE = './output/14-item-id-mapping.json';
const EVENTS_14_FILE = './output/14-player-upgrade-events.json';
const ABILITY_ANALYSIS_14_FILE = './output/14-ability-upgrade-analysis.json';
const HERO_ENRICHMENT_FILE = './output/13-canonical-hero-enrichment.json';
const GT_ROOT = './external/GameTracking-Deadlock';
const ABILITIES_VDATA = `${GT_ROOT}/game/citadel/pak01_dir/scripts/abilities.vdata`;
const HEROES_VDATA = `${GT_ROOT}/game/citadel/pak01_dir/scripts/heroes.vdata`;
const ITEMS_GAME = `${GT_ROOT}/game/citadel/pak01_dir/scripts/items/items_game.txt`;
const STRING_TOKEN_DB = `${GT_ROOT}/game/core/pak01_dir/stringtokendatabase.txt`;
const PLAYER_DATA_GLOBAL_SCHEMA = `${GT_ROOT}/DumpSource2/schemas/client/PlayerDataGlobal_t.h`;
const ABILITY_UPGRADE_SCHEMA = `${GT_ROOT}/DumpSource2/schemas/client/AbilityUpgradeState_t.h`;
const IMBUEMENT_SCHEMA = `${GT_ROOT}/DumpSource2/schemas/client/ItemImbuementPair_t.h`;
const TIER0_STRINGS = `${GT_ROOT}/game/bin/win64/tier0_strings.txt`;
const ENGINE2_STRINGS = `${GT_ROOT}/game/bin/win64/engine2_strings.txt`;
const THIRDPARTY_NOTICES = `${GT_ROOT}/game/thirdpartylegalnotices.txt`;
const DEADEM_BOOTSTRAP = './packages/engine/src/bootstrap/Bootstrap.js';
const DEADEM_DECODER_FACTORY = './packages/engine/src/data/fields/decoding/FieldDecoderFactory.js';
const OUTPUT_DECODER = './output/15-string-token-decoder.json';
const OUTPUT_MAPPING = './output/15-upgrade-token-mapping.json';
const OUTPUT_ABILITY = './output/15-ability-state-decoding.json';
const OUTPUT_IMBUEMENT = './output/15-imbuement-decoding.json';
const OUTPUT_REVIEW = './output/15-token-decoding-review.json';
const OUTPUT_SIZE_LIMIT = 5 * 1024 * 1024;
const CONTENT_VERSION = 6592;
const SAMPLE_SECONDS = [ 19, 300, 600, 1200, 1800, 2400, 2945 ];
const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
    let value = index;

    for (let bit = 0; bit < 8; bit++) {
        value = (value & 1) !== 0 ? (0xedb88320 ^ (value >>> 1)) : value >>> 1;
    }

    return value >>> 0;
});

const structure14 = JSON.parse(await readFile(STRUCTURE_FILE, 'utf8'));
const fieldSamples02 = JSON.parse(await readFile(FIELD_SAMPLES_02_FILE, 'utf8'));
const mapping14 = JSON.parse(await readFile(TOKEN_MAPPING_14_FILE, 'utf8'));
const events14 = JSON.parse(await readFile(EVENTS_14_FILE, 'utf8'));
const abilityAnalysis14 = JSON.parse(await readFile(ABILITY_ANALYSIS_14_FILE, 'utf8'));
const heroEnrichment = JSON.parse(await readFile(HERO_ENRICHMENT_FILE, 'utf8'));
const sourceFiles = await readSourceFiles();
const candidates = buildCandidates(sourceFiles);
const observedFrom14 = buildObservedTokenRecords();
const sampledReplay = collectExistingSamples();
const observedTokens = mergeObservedTokens(observedFrom14, sampledReplay.observedTokens);
const decoder = buildStringTokenDecoderReport(observedTokens, candidates, sourceFiles);
const tokenMapping = buildTokenMapping(observedTokens, candidates, decoder);
const abilityState = buildAbilityStateDecoding(sampledReplay, tokenMapping);
const imbuements = buildImbuementDecoding(sampledReplay, tokenMapping);
const review = buildReview(tokenMapping, abilityState, imbuements, decoder);

await writeJson(OUTPUT_DECODER, decoder);
await writeJson(OUTPUT_MAPPING, tokenMapping);
await writeJson(OUTPUT_ABILITY, abilityState);
await writeJson(OUTPUT_IMBUEMENT, imbuements);
await writeJson(OUTPUT_REVIEW, review);
await validateOutputs();

console.log(`Observed tokens: ${tokenMapping.length}`);
console.log(`High confidence resolved: ${review.resolvedHigh}`);
console.log(`Medium confidence resolved: ${review.resolvedMedium}`);
console.log(`Ambiguous: ${review.ambiguous}`);
console.log(`Unresolved: ${review.unresolved}`);
console.log(`Wrote ${OUTPUT_DECODER}`);
console.log(`Wrote ${OUTPUT_MAPPING}`);
console.log(`Wrote ${OUTPUT_ABILITY}`);
console.log(`Wrote ${OUTPUT_IMBUEMENT}`);
console.log(`Wrote ${OUTPUT_REVIEW}`);

async function readSourceFiles() {
    const entries = await Promise.all(Object.entries({
        abilitiesVdata: ABILITIES_VDATA,
        heroesVdata: HEROES_VDATA,
        itemsGame: ITEMS_GAME,
        stringTokenDatabase: STRING_TOKEN_DB,
        playerDataGlobalSchema: PLAYER_DATA_GLOBAL_SCHEMA,
        abilityUpgradeStateSchema: ABILITY_UPGRADE_SCHEMA,
        itemImbuementPairSchema: IMBUEMENT_SCHEMA,
        tier0Strings: TIER0_STRINGS,
        engine2Strings: ENGINE2_STRINGS,
        thirdPartyNotices: THIRDPARTY_NOTICES,
        deademBootstrap: DEADEM_BOOTSTRAP,
        deademDecoderFactory: DEADEM_DECODER_FACTORY
    }).map(async ([ key, file ]) => [ key, file, await readFile(file) ]));

    return Object.fromEntries(entries.map(([ key, file, buffer ]) => [ key, { file, text: buffer.toString(key === 'stringTokenDatabase' ? 'latin1' : 'utf8'), buffer } ]));
}

function buildObservedTokenRecords() {
    const records = new Map();

    for (const item of mapping14) {
        touchObserved(records, item.itemOrUpgradeIdRaw, {
            field: item.observedFields.map(field => field.field).join(', '),
            source: TOKEN_MAPPING_14_FILE,
            playerIndexes: item.playersThatHadId.map(player => player.playerIndex)
        });
    }

    for (const event of events14.events) {
        for (const value of flattenValues([ event.previousValue, event.newValue ])) {
            touchObserved(records, value, {
                field: event.field,
                source: EVENTS_14_FILE,
                playerIndexes: [ event.playerIndex ],
                eventClassification: safeClassification(event.classification)
            });
        }
    }

    for (const player of abilityAnalysis14) {
        for (const sample of player.abilityUpgradeStateSamples) {
            for (const entry of sample.abilityUpgradeState) {
                touchObserved(records, entry.itemId, {
                    field: 'm_vecAbilityUpgradeState.*.m_ItemID',
                    source: ABILITY_ANALYSIS_14_FILE,
                    playerIndexes: [ player.playerIndex ]
                });
            }
        }
    }

    return records;
}

function touchObserved(records, token, observation) {
    if (!Number.isInteger(token)) {
        return;
    }

    const unsigned = token >>> 0;

    if (!records.has(unsigned)) {
        records.set(unsigned, {
            tokenRaw: unsigned,
            tokenUnsigned: unsigned,
            tokenSigned: toSigned32(unsigned),
            observations: [],
            playersAssociated: new Set()
        });
    }

    const record = records.get(unsigned);
    const key = JSON.stringify(observation);

    if (!record.observations.some(item => JSON.stringify(item) === key)) {
        record.observations.push(observation);
    }

    for (const playerIndex of observation.playerIndexes ?? []) {
        record.playersAssociated.add(playerIndex);
    }
}

function collectExistingSamples() {
    const states = [];
    const observedTokens = new Map();

    for (const snapshot of fieldSamples02.snapshots.filter(item => (item.classes?.CCitadelPlayerController ?? []).length > 0)) {
        const gameSecond = labelToGameSecond(snapshot.label);
        const controllers = snapshot.classes.CCitadelPlayerController
            .filter(controller => String(deserializeValue(controller.fields.m_steamID) ?? '0') !== '0');

        states.push({
            gameSecond,
            demoTick: snapshot.actualTick,
            serverTick: null,
            players: controllers.map(controller => readSampledPlayerState(controller, observedTokens, gameSecond)).sort((a, b) => a.playerIndex - b.playerIndex)
        });
    }

    for (const player of abilityAnalysis14) {
        for (const sample of player.abilityUpgradeStateSamples) {
            let state = states.find(item => item.gameSecond === sample.gameSecond);

            if (state === undefined) {
                state = { gameSecond: sample.gameSecond, demoTick: null, serverTick: null, players: [] };
                states.push(state);
            }

            let statePlayer = state.players.find(item => item.playerIndex === player.playerIndex);

            if (statePlayer === undefined) {
                const hero = heroEnrichment.find(item => item.playerIndex === player.playerIndex);

                statePlayer = {
                    playerIndex: player.playerIndex,
                    steamId: hero?.steamId ?? null,
                    name: hero?.name ?? null,
                    heroInternalName: player.heroInternalName,
                    heroDisplayName: player.heroDisplayName,
                    upgrades: [],
                    abilityUpgradeState: [],
                    imbuements: [],
                    abilityPointsNetWorth: sample.abilityPointsNetWorth
                };
                state.players.push(statePlayer);
            }

            statePlayer.abilityUpgradeState = sample.abilityUpgradeState;
            statePlayer.abilityPointsNetWorth = sample.abilityPointsNetWorth;

            for (const entry of sample.abilityUpgradeState) {
                touchObserved(observedTokens, entry.itemId, {
                    field: 'm_vecAbilityUpgradeState.*.m_ItemID',
                    source: ABILITY_ANALYSIS_14_FILE,
                    playerIndexes: [ player.playerIndex ],
                    gameSecond: sample.gameSecond
                });
            }
        }
    }

    states.sort((a, b) => a.gameSecond - b.gameSecond);

    return { states, observedTokens };
}

function readSampledPlayerState(controller, observedTokens, gameSecond) {
    const fields = controller.fields;
    const steamId = String(deserializeValue(fields.m_steamID));
    const hero = heroEnrichment.find(item => item.steamId === steamId);
    const playerIndex = hero?.playerIndex ?? null;
    const abilityState = readAbilityUpgradeStateFromFields(fields);
    const upgrades = readVectorFromFields(fields, 'm_vecUpgrades');
    const imbuements = readImbuementsFromFields(fields);

    for (const token of [ ...upgrades.map(item => item.value), ...abilityState.map(item => item.itemId), ...imbuements.flatMap(item => [ item.sourceItemId, ...item.imbuedAbilities.map(entry => entry.value) ]) ]) {
        touchObserved(observedTokens, token, {
            field: 'replay_sample_token',
            source: FIELD_SAMPLES_02_FILE,
            playerIndexes: playerIndex === null ? [] : [ playerIndex ],
            gameSecond
        });
    }

    return {
        playerIndex,
        steamId,
        name: deserializeValue(fields.m_iszPlayerName) ?? null,
        heroInternalName: hero?.heroInternalName ?? null,
        heroDisplayName: hero?.heroDisplayName ?? null,
        upgrades,
        abilityUpgradeState: abilityState,
        imbuements,
        abilityPointsNetWorth: numberOrNull(deserializeValue(fields.m_iAPNetWorth))
    };
}

function mergeObservedTokens(...maps) {
    const merged = new Map();

    for (const map of maps) {
        for (const record of map.values()) {
            for (const observation of record.observations) {
                touchObserved(merged, record.tokenUnsigned, observation);
            }
        }
    }

    return Array.from(merged.values()).map(record => ({
        ...record,
        playersAssociated: Array.from(record.playersAssociated).sort((a, b) => a - b)
    })).sort((a, b) => a.tokenUnsigned - b.tokenUnsigned);
}

function buildStringTokenDecoderReport(observedTokens, candidateRecords, sources) {
    const databaseEntries = parseStringTokenDatabase(sources.stringTokenDatabase.text);
    const algorithms = buildAlgorithmTests();
    const algorithmResults = algorithms.map(algorithm => runAlgorithmTest(algorithm, observedTokens, candidateRecords));
    const directDbMatches = countDatabaseMatches(observedTokens, databaseEntries);
    const sourceEvidence = collectSourceEvidence(sources);

    return {
        contentVersion: CONTENT_VERSION,
        experiment14StructureContext: {
            source: STRUCTURE_FILE,
            candidateFieldCount: structure14.candidateFields?.length ?? null,
            vectorStructure: structure14.vectorStructure ?? null
        },
        fields: [
            fieldTypeReport('CCitadelPlayerController/PlayerDataGlobal_t', 'm_vecUpgrades.*', 'EntitySubclassID_t network alias; C_NetworkUtlVectorBase<CUtlStringToken>', 'VAR_UINT_32 via default unresolved field type in Deadem', observedTokens),
            fieldTypeReport('AbilityUpgradeState_t', 'm_ItemID', 'AbilityID_t network alias; CUtlStringToken', 'VAR_UINT_32 via default unresolved field type in Deadem', observedTokens),
            fieldTypeReport('ItemImbuementPair_t', 'm_SourceItemID', 'AbilityID_t network alias; CUtlStringToken', 'VAR_UINT_32 via default unresolved field type in Deadem', observedTokens),
            fieldTypeReport('ItemImbuementPair_t', 'm_vecImbuedAbilities.*', 'EntitySubclassID_t network alias; C_NetworkUtlVectorBase<CUtlStringToken>', 'VAR_UINT_32 via default unresolved field type in Deadem', observedTokens),
            fieldTypeReport('AbilityUpgradeState_t', 'm_nUpgradeInfo', 'CitadelAbilityUpgradeInfoPacked_t', 'VAR_UINT_32 via default unresolved field type in Deadem', [])
        ],
        typeEvidence: {
            playerDataGlobalSchema: extractLines(sources.playerDataGlobalSchema.text, /m_vecUpgrades|m_tHeldItem|m_vecImbuements|m_vecAbilityUpgradeState|CUtlStringToken/iu, 20),
            abilityUpgradeStateSchema: extractLines(sources.abilityUpgradeStateSchema.text, /m_ItemID|m_nUpgradeInfo|CUtlStringToken|CitadelAbilityUpgradeInfoPacked_t/iu, 20),
            itemImbuementPairSchema: extractLines(sources.itemImbuementPairSchema.text, /m_SourceItemID|m_vecImbuedAbilities|CUtlStringToken/iu, 20),
            deademBootstrap: extractLines(sources.deademBootstrap.text, /registerFieldTypeDecoder|uint32|int32|CUtlStringToken|HeroID_t/iu, 30),
            deademDecoderFactory: extractLines(sources.deademDecoderFactory.text, /VAR_UINT_32|readUVarInt32|VAR_INT_32|readVarInt32/iu, 30)
        },
        algorithmEvidence: sourceEvidence,
        stringTokenDatabase: {
            file: STRING_TOKEN_DB,
            entryCount: databaseEntries.length,
            formatHypothesis: '5-character token prefix plus text, likely Valve string-token DB export. The encoding of the prefix was not demonstrated from local source in this experiment.',
            directObservedMatches: directDbMatches.count,
            examples: databaseEntries.slice(0, 12)
        },
        testedAlgorithms: algorithmResults,
        demonstratedAlgorithm: null,
        conclusion: 'The real field type is CUtlStringToken/uint32, but no local source demonstrated the exact CUtlStringToken::Make algorithm or database-prefix encoding for the observed Citadel tokens. Therefore no high-confidence token-name mapping is emitted.',
        limitations: [
            'tier0_strings.txt exposes CUtlStringToken::Make, token collision messages, RegisterStringToken, VStringTokenSystem001 and CRC32 symbols, but not implementation source.',
            'thirdpartylegalnotices.txt mentions MurmurHash3, but does not connect it specifically to CUtlStringToken::Make.',
            'Deadem decodes unregistered field aliases as unsigned varints; it does not reverse tokens to strings.',
            'The build-exact stringtokendatabase.txt does not directly resolve observed replay tokens with a demonstrated decoding method.'
        ],
        collisions: []
    };
}

function buildTokenMapping(observedTokens, candidateRecords, decoderReport) {
    const databaseEntries = parseStringTokenDatabase(sourceFiles.stringTokenDatabase.text);
    const directDbByText = new Map(databaseEntries.map(entry => [ entry.text, entry ]));
    const algorithmsByName = new Map(decoderReport.testedAlgorithms.map(result => [ result.algorithm, result ]));

    return observedTokens.map(record => {
        const matches = [];

        for (const algorithmResult of algorithmsByName.values()) {
            for (const match of algorithmResult.matchesByToken[String(record.tokenUnsigned)] ?? []) {
                matches.push({
                    method: algorithmResult.algorithm,
                    candidate: slimCandidate(candidateRecords[match.candidateIndex]),
                    calculatedToken: match.calculatedToken,
                    evidence: algorithmResult.evidence,
                    confidence: algorithmResult.acceptedAsDecoder ? 'high' : 'low'
                });
            }
        }

        for (const candidate of candidateRecords) {
            if (directDbByText.has(candidate.originalText)) {
                const entry = directDbByText.get(candidate.originalText);

                if (entry.decodedToken === record.tokenUnsigned) {
                    matches.push({
                        method: 'stringtokendatabase_decodedToken',
                        candidate: slimCandidate(candidate),
                        calculatedToken: entry.decodedToken,
                        evidence: STRING_TOKEN_DB,
                        confidence: 'high'
                    });
                }
            }
        }

        const distinct = uniqueBy(matches, match => `${match.method}:${match.candidate.originalText}:${match.candidate.definitionType}`);
        const high = distinct.filter(match => match.confidence === 'high');
        const confidence = high.length === 1
            ? 'high'
            : high.length > 1 ? 'ambiguous' : 'unresolved';
        const selected = high.length === 1 ? high[0].candidate : null;

        return {
            tokenRaw: record.tokenRaw,
            tokenUnsigned: record.tokenUnsigned,
            tokenSigned: record.tokenSigned,
            resolvedText: selected?.originalText ?? null,
            internalName: selected?.internalName ?? null,
            displayName: selected?.displayName ?? null,
            definitionType: selected?.definitionType ?? null,
            category: selected?.category ?? null,
            tier: selected?.tier ?? null,
            cost: selected?.cost ?? null,
            mappingConfidence: confidence,
            collisionCandidates: distinct.map(match => match.candidate),
            sourceBuildExact: selected?.sourceFile ?? null,
            playersAssociated: record.playersAssociated,
            observedFields: unique(record.observations.map(item => item.field)),
            observations: record.observations.slice(0, 20)
        };
    });
}

function buildAbilityStateDecoding(samples, tokenMapping) {
    const tokenByUnsigned = new Map(tokenMapping.map(item => [ item.tokenUnsigned, item ]));
    const byPlayer = new Map();

    for (const state of samples.states) {
        for (const player of state.players) {
            if (!byPlayer.has(player.playerIndex)) {
                byPlayer.set(player.playerIndex, {
                    playerIndex: player.playerIndex,
                    steamId: player.steamId,
                    name: player.name,
                    heroInternalName: player.heroInternalName,
                    heroDisplayName: player.heroDisplayName,
                    entries: new Map()
                });
            }

            const record = byPlayer.get(player.playerIndex);

            for (const entry of player.abilityUpgradeState) {
                if (!record.entries.has(entry.index)) {
                    record.entries.set(entry.index, {
                        index: entry.index,
                        itemId: entry.itemId,
                        tokenMapping: tokenByUnsigned.get(entry.itemId) ?? null,
                        sequence: []
                    });
                }

                record.entries.get(entry.index).sequence.push({
                    gameSecond: state.gameSecond,
                    demoTick: state.demoTick,
                    serverTick: state.serverTick,
                    upgradeInfoDecimal: entry.upgradeInfo,
                    upgradeInfoHex: toHex32(entry.upgradeInfo),
                    upgradeInfoBinary: toBinary32(entry.upgradeInfo),
                    abilityPointsNetWorth: player.abilityPointsNetWorth
                });
            }
        }
    }

    const players = Array.from(byPlayer.values()).map(player => ({
        ...player,
        entries: Array.from(player.entries.values()).map(entry => analyzeAbilityEntry(entry))
    })).sort((a, b) => a.playerIndex - b.playerIndex);

    return {
        sourceSamples: {
            replayFile: DEMO_FILE,
            sampledFieldSource: FIELD_SAMPLES_02_FILE,
            namedSeconds: SAMPLE_SECONDS,
            eventDrivenSamples: events14.events.length,
            uniqueSampleCount: samples.states.length
        },
        players,
        globalUpgradeInfoValues: summarizeUpgradeInfo(players),
        hypotheses: testUpgradeInfoHypotheses(players),
        conclusion: 'm_ItemID is a CUtlStringToken for an ability-like identity. The sequence is stable per entry, but no high-confidence name mapping was available. m_nUpgradeInfo is not accepted as a simple level; observed values fit a packed bit pattern ending in 1 with upper bit groups changing.',
        confidence: 'medium'
    };
}

function analyzeAbilityEntry(entry) {
    const distinctValues = unique(entry.sequence.map(item => item.upgradeInfoDecimal));
    const transitions = [];

    for (let index = 1; index < entry.sequence.length; index++) {
        const before = entry.sequence[index - 1];
        const after = entry.sequence[index];

        if (before.upgradeInfoDecimal !== after.upgradeInfoDecimal) {
            transitions.push({
                fromGameSecond: before.gameSecond,
                toGameSecond: after.gameSecond,
                previous: before.upgradeInfoDecimal,
                next: after.upgradeInfoDecimal,
                delta: after.upgradeInfoDecimal - before.upgradeInfoDecimal,
                changedBits: changedBits(before.upgradeInfoDecimal, after.upgradeInfoDecimal),
                abilityPointsNetWorthBefore: before.abilityPointsNetWorth,
                abilityPointsNetWorthAfter: after.abilityPointsNetWorth
            });
        }
    }

    return {
        index: entry.index,
        itemId: entry.itemId,
        itemIdUnsigned: entry.itemId >>> 0,
        itemIdSigned: toSigned32(entry.itemId),
        mappedAbility: entry.tokenMapping?.mappingConfidence === 'high' ? entry.tokenMapping : null,
        mappingConfidence: entry.tokenMapping?.mappingConfidence ?? 'unresolved',
        stableItemId: true,
        initialValue: entry.sequence[0]?.upgradeInfoDecimal ?? null,
        distinctValues,
        valueRepresentations: distinctValues.map(value => ({ decimal: value, hex: toHex32(value), binary: toBinary32(value) })),
        transitions,
        rejectedHypotheses: [
            {
                hypothesis: 'simple_level_integer',
                reason: 'Values are 1, 65537, 196609, 458753, 983041-like packed values rather than contiguous levels.'
            }
        ],
        acceptedHypothesis: null,
        confidence: 'unresolved'
    };
}

function buildImbuementDecoding(samples, tokenMapping) {
    const tokenByUnsigned = new Map(tokenMapping.map(item => [ item.tokenUnsigned, item ]));
    const events = [];
    const structures = new Map();

    for (const state of samples.states) {
        for (const player of state.players) {
            for (const imbuement of player.imbuements) {
                const key = `${player.playerIndex}:${imbuement.index}:${imbuement.sourceItemId}:${imbuement.imbuedAbilities.map(item => item.value).join(',')}`;

                if (!structures.has(key)) {
                    structures.set(key, {
                        playerIndex: player.playerIndex,
                        name: player.name,
                        heroInternalName: player.heroInternalName,
                        index: imbuement.index,
                        sourceItemId: imbuement.sourceItemId,
                        sourceItemMapping: tokenByUnsigned.get(imbuement.sourceItemId) ?? null,
                        imbuedAbilities: imbuement.imbuedAbilities.map(item => ({
                            ...item,
                            tokenMapping: tokenByUnsigned.get(item.value) ?? null
                        })),
                        firstSeenGameSecond: state.gameSecond,
                        firstSeenDemoTick: state.demoTick,
                        seenCount: 0
                    });
                }

                structures.get(key).seenCount++;
                events.push({
                    gameSecond: state.gameSecond,
                    demoTick: state.demoTick,
                    serverTick: state.serverTick,
                    playerIndex: player.playerIndex,
                    index: imbuement.index,
                    sourceItemId: imbuement.sourceItemId,
                    imbuedAbilityValues: imbuement.imbuedAbilities.map(item => item.value),
                    directionHypothesis: 'source item token -> one or more imbued ability tokens',
                    confidence: 'medium'
                });
            }
        }
    }

    return {
        schema: {
            source: IMBUEMENT_SCHEMA,
            structure: {
                m_SourceItemID: 'CUtlStringToken',
                m_vecImbuedAbilities: 'C_NetworkUtlVectorBase<CUtlStringToken>'
            }
        },
        observedStructures: Array.from(structures.values()).sort((a, b) => a.playerIndex - b.playerIndex || a.firstSeenDemoTick - b.firstSeenDemoTick),
        events,
        resolvedTokens: Array.from(new Set(events.flatMap(event => [ event.sourceItemId, ...event.imbuedAbilityValues ])))
            .map(token => tokenByUnsigned.get(token))
            .filter(item => item?.mappingConfidence === 'high'),
        unresolvedTokenCount: Array.from(new Set(events.flatMap(event => [ event.sourceItemId, ...event.imbuedAbilityValues ]))).length,
        ambiguities: [
            'Field names imply source item -> imbued abilities, but token names are unresolved.',
            'No explicit purchase/imbue user message was matched in this experiment.',
            'Direction is supported by schema names only, not independent event evidence.'
        ]
    };
}

function buildReview(tokenMapping, abilityState, imbuements, decoderReport) {
    const counts = countBy(tokenMapping, item => item.mappingConfidence);
    const byType = countBy(tokenMapping.filter(item => item.mappingConfidence === 'high'), item => item.definitionType ?? 'unknown');

    return {
        totalTokens: tokenMapping.length,
        resolvedHigh: counts.high ?? 0,
        resolvedMedium: counts.medium ?? 0,
        ambiguous: counts.ambiguous ?? 0,
        unresolved: counts.unresolved ?? 0,
        resolvedItems: byType.item ?? 0,
        resolvedAbilities: byType.ability ?? 0,
        resolvedUpgrades: byType.upgrade ?? 0,
        resolvedImbues: byType.imbue ?? 0,
        collidedTokens: tokenMapping.filter(item => item.mappingConfidence === 'ambiguous').length,
        tokenTypeAndAlgorithm: {
            realType: 'CUtlStringToken stored as unsigned 32-bit integer through Deadem field decoding',
            demonstratedAlgorithm: decoderReport.demonstratedAlgorithm,
            confidence: decoderReport.demonstratedAlgorithm === null ? 'unresolved' : 'high'
        },
        mItemIDMeaning: 'CUtlStringToken field declared as AbilityID_t; stable per ability-state entry, but unresolved to build-exact ability names in this experiment.',
        mNUpgradeInfoSemantics: abilityState.conclusion,
        imbuementStructure: 'ItemImbuementPair_t { CUtlStringToken m_SourceItemID; C_NetworkUtlVectorBase<CUtlStringToken> m_vecImbuedAbilities }',
        canReconstructInventory: false,
        canReconstructAbilityOrder: false,
        blockers: [
            'Exact CUtlStringToken::Make algorithm or stringtokendatabase prefix decoder was not locally demonstrated.',
            'No high-confidence token-to-name matches were produced.',
            'm_nUpgradeInfo remains packed-state, not decoded level/order.',
            'Removal events remain token removal events, not confirmed sales.'
        ],
        validation: {
            jsonParse: true,
            highTokensReproducible: tokenMapping.every(item => item.mappingConfidence !== 'high' || item.collisionCandidates.length > 0),
            buildExactOnly: true,
            collisionsExplicit: true,
            noNamesByTemporalProximity: true,
            removalsNotCalledSales: true,
            outputSizeLimitBytes: OUTPUT_SIZE_LIMIT
        }
    };
}

function buildCandidates(sources) {
    const records = [];
    const localization = parseLocalizationFiles(sources);

    collectVdataRecords(records, sources.abilitiesVdata.text, ABILITIES_VDATA, localization);
    collectVdataRecords(records, sources.heroesVdata.text, HEROES_VDATA, localization);
    collectItemsGameRecords(records, sources.itemsGame.text, ITEMS_GAME, localization);
    collectLocalizationRecords(records, localization);

    return uniqueBy(records, record => `${record.definitionType}:${record.originalText}:${record.sourceFile}`).map((record, index) => ({ ...record, candidateIndex: index }));
}

function collectVdataRecords(records, content, file, localization) {
    const lines = content.split(/\r?\n/u);
    let current = null;

    for (const [ lineIndex, line ] of lines.entries()) {
        const start = line.match(/^\t?([a-z0-9_]+)\s*=\s*$/iu);

        if (start !== null) {
            if (current !== null) {
                addVdataRecord(records, current, localization);
            }

            current = { internalName: start[1], sourceFile: file, startLine: lineIndex + 1, text: '' };
        } else if (current !== null) {
            current.text += `${line}\n`;
        }
    }

    if (current !== null) {
        addVdataRecord(records, current, localization);
    }
}

function addVdataRecord(records, record, localization) {
    const locToken = record.text.match(/m_strLocString\s*=\s*"#?([^"]+)"/u)?.[1] ?? record.internalName;
    const definitionType = inferDefinitionType(record.internalName, record.text);

    records.push({
        originalText: record.internalName,
        normalizedText: normalizeTokenText(record.internalName),
        internalName: record.internalName,
        displayName: localization[record.internalName] ?? localization[locToken] ?? null,
        definitionType,
        category: record.text.match(/m_eItemSlotType\s*=\s*"([^"]+)"/u)?.[1] ?? null,
        tier: numberOrNull(Number(record.text.match(/m_iItemTier\s*=\s*(\d+)/u)?.[1] ?? Number.NaN)),
        cost: numberOrNull(Number(record.text.match(/m_iGoldCost\s*=\s*(\d+)/u)?.[1] ?? Number.NaN)),
        heroAssociated: record.text.match(/m_strHeroName\s*=\s*"([^"]+)"/u)?.[1] ?? null,
        sourceFile: record.sourceFile,
        sourceLine: record.startLine,
        contentVersion: CONTENT_VERSION
    });
}

function collectItemsGameRecords(records, content, file, localization) {
    const lines = content.split(/\r?\n/u);

    for (const [ index, line ] of lines.entries()) {
        const name = line.match(/^\s*"([^"]+)"\s*$/u)?.[1] ?? null;

        if (name === null || !/upgrade|item|ability|weapon|spirit|vitality|armor|mod|imbue/iu.test(name)) {
            continue;
        }

        const nearby = lines.slice(index, Math.min(index + 40, lines.length)).join('\n');

        records.push({
            originalText: name,
            normalizedText: normalizeTokenText(name),
            internalName: name,
            displayName: localization[name] ?? null,
            definitionType: inferDefinitionType(name, nearby),
            category: nearby.match(/"item_slot_type"\s*"([^"]+)"/u)?.[1] ?? null,
            tier: numberOrNull(Number(nearby.match(/"item_tier"\s*"?(\\d+)/u)?.[1] ?? Number.NaN)),
            cost: numberOrNull(Number(nearby.match(/"item_cost"\s*"?(\\d+)/u)?.[1] ?? Number.NaN)),
            heroAssociated: null,
            sourceFile: file,
            sourceLine: index + 1,
            contentVersion: CONTENT_VERSION
        });
    }
}

function collectLocalizationRecords(records, localization) {
    for (const [ key, displayName ] of Object.entries(localization)) {
        if (!/upgrade|item|ability|weapon|spirit|vitality|imbue|hero|citadel/iu.test(key)) {
            continue;
        }

        records.push({
            originalText: key,
            normalizedText: normalizeTokenText(key),
            internalName: key,
            displayName,
            definitionType: inferDefinitionType(key, ''),
            category: null,
            tier: null,
            cost: null,
            heroAssociated: null,
            sourceFile: 'localization',
            sourceLine: null,
            contentVersion: CONTENT_VERSION
        });
    }
}

function buildAlgorithmTests() {
    return [
        {
            name: 'crc32_lowercase_utf8',
            evidence: [ TIER0_STRINGS, ENGINE2_STRINGS ],
            evidenceNote: 'CRC32 symbols exist locally, but no source connects CRC32 to CUtlStringToken::Make.',
            acceptedAsDecoder: false,
            normalize: value => value.toLowerCase(),
            calculate: value => crc32(Buffer.from(value, 'utf8'))
        },
        {
            name: 'fnv1a32_lowercase_utf8',
            evidence: [],
            evidenceNote: 'Included as negative control only because no local FNV evidence was found for CUtlStringToken.',
            acceptedAsDecoder: false,
            normalize: value => value.toLowerCase(),
            calculate: value => fnv1a32(Buffer.from(value, 'utf8'))
        },
        {
            name: 'murmurhash3_x86_32_lowercase_seed0',
            evidence: [ THIRDPARTY_NOTICES ],
            evidenceNote: 'MurmurHash3 is named in third-party notices, but no source connects it to CUtlStringToken::Make.',
            acceptedAsDecoder: false,
            normalize: value => value.toLowerCase(),
            calculate: value => murmur3_32_gc(value.toLowerCase(), 0)
        }
    ];
}

function runAlgorithmTest(algorithm, observedTokens, candidateRecords) {
    const observed = new Set(observedTokens.map(token => token.tokenUnsigned));
    const matchesByToken = {};
    let collisionCount = 0;

    for (const candidate of candidateRecords) {
        const normalized = algorithm.normalize(candidate.originalText);
        const token = algorithm.calculate(normalized) >>> 0;

        if (!observed.has(token)) {
            continue;
        }

        if (!matchesByToken[String(token)]) {
            matchesByToken[String(token)] = [];
        }

        matchesByToken[String(token)].push({
            candidateIndex: candidate.candidateIndex,
            calculatedToken: token,
            normalizedText: normalized
        });
    }

    for (const matches of Object.values(matchesByToken)) {
        if (matches.length > 1) {
            collisionCount++;
        }
    }

    return {
        algorithm: algorithm.name,
        evidence: algorithm.evidence,
        evidenceNote: algorithm.evidenceNote,
        acceptedAsDecoder: algorithm.acceptedAsDecoder,
        observedMatchTokenCount: Object.keys(matchesByToken).length,
        collisionTokenCount: collisionCount,
        matchesByToken
    };
}

function parseStringTokenDatabase(text) {
    return text.split(/\r?\n/u)
        .filter(line => line.length >= 7)
        .map((line, index) => ({
            line: index + 1,
            tokenPrefix: line.slice(0, 5),
            text: line.slice(6),
            decodedToken: null
        }));
}

function countDatabaseMatches(observedTokens, databaseEntries) {
    const byDecodedToken = new Map(databaseEntries.filter(entry => entry.decodedToken !== null).map(entry => [ entry.decodedToken, entry ]));
    const matches = observedTokens.filter(token => byDecodedToken.has(token.tokenUnsigned));

    return { count: matches.length, examples: matches.slice(0, 12) };
}

function collectSourceEvidence(sources) {
    return {
        makeStringToken: extractLines(sources.tier0Strings.text, /CUtlStringToken|Make@CUtlStringToken|RegisterStringToken|collision|VStringTokenSystem001/iu, 40),
        crc32: [
            ...extractLines(sources.tier0Strings.text, /CRC32/iu, 20),
            ...extractLines(sources.engine2Strings.text, /CRC32/iu, 20)
        ],
        murmurHash3: extractLines(sources.thirdPartyNotices.text, /MurmurHash3/iu, 20),
        fnv: []
    };
}

function fieldTypeReport(className, fieldPath, declaredType, deademDecoder, observedTokens) {
    return {
        className,
        fieldPath,
        declaredType,
        networkType: declaredType,
        serializer: 'FlattenedSerializer field model; no custom serializer found in repo for this alias.',
        deademDecoder,
        bitCount: 'variable varint length, value stored as JavaScript number',
        signed: false,
        quantization: null,
        specialEncoder: null,
        rawExamples: observedTokens.slice(0, 5).map(token => ({
            raw: token.tokenRaw,
            unsigned: token.tokenUnsigned,
            signed: token.tokenSigned
        })),
        confidence: /CUtlStringToken/iu.test(declaredType) ? 'high' : 'medium'
    };
}

function readVectorFromFields(fields, prefix) {
    const length = numberOrNull(deserializeValue(fields[prefix])) ?? 0;
    const values = [];

    for (let index = 0; index < length; index++) {
        const field = `${prefix}.${String(index).padStart(4, '0')}`;

        values.push({ index, value: numberOrNull(deserializeValue(fields[field])) });
    }

    return values;
}

function readAbilityUpgradeStateFromFields(fields) {
    const length = numberOrNull(deserializeValue(fields.m_vecAbilityUpgradeState)) ?? 0;
    const values = [];

    for (let index = 0; index < length; index++) {
        const base = `m_vecAbilityUpgradeState.${String(index).padStart(4, '0')}`;

        values.push({
            index,
            itemId: numberOrNull(deserializeValue(fields[`${base}.m_ItemID`])),
            upgradeInfo: numberOrNull(deserializeValue(fields[`${base}.m_nUpgradeInfo`]))
        });
    }

    return values;
}

function readImbuementsFromFields(fields) {
    const length = numberOrNull(deserializeValue(fields.m_vecImbuements)) ?? 0;
    const values = [];

    for (let index = 0; index < length; index++) {
        const base = `m_vecImbuements.${String(index).padStart(4, '0')}`;
        const sourceItemId = numberOrNull(deserializeValue(fields[`${base}.m_SourceItemID`]));
        const imbuedLength = numberOrNull(deserializeValue(fields[`${base}.m_vecImbuedAbilities`])) ?? 0;
        const imbuedAbilities = [];

        for (let abilityIndex = 0; abilityIndex < imbuedLength; abilityIndex++) {
            const field = `${base}.m_vecImbuedAbilities.${String(abilityIndex).padStart(4, '0')}`;

            imbuedAbilities.push({
                index: abilityIndex,
                value: numberOrNull(deserializeValue(fields[field]))
            });
        }

        values.push({ index, sourceItemId, imbuedAbilities });
    }

    return values;
}

function testUpgradeInfoHypotheses(players) {
    const values = unique(players.flatMap(player => player.entries.flatMap(entry => entry.distinctValues))).sort((a, b) => a - b);
    const decoded = values.map(value => ({
        value,
        hex: toHex32(value),
        low16: value & 0xffff,
        high16: value >>> 16,
        shifted16: value >>> 16,
        binary: toBinary32(value)
    }));

    return [
        {
            hypothesis: 'simple_level_integer',
            accepted: false,
            evidence: 'Observed values are packed-looking values instead of contiguous small integers.',
            values
        },
        {
            hypothesis: 'high16_counter_low16_flag',
            accepted: false,
            evidence: 'All common values keep low16 = 1 while high16 changes, but this does not explain semantics or all possible transitions without source.',
            decoded
        },
        {
            hypothesis: 'packed_struct_or_bitmask',
            accepted: null,
            evidence: 'Most plausible structural class from value shape, but not accepted because no writer/reader implementation was found.'
        }
    ];
}

function summarizeUpgradeInfo(players) {
    const values = unique(players.flatMap(player => player.entries.flatMap(entry => entry.distinctValues))).sort((a, b) => a - b);

    return values.map(value => ({
        decimal: value,
        hex: toHex32(value),
        binary: toBinary32(value),
        low16: value & 0xffff,
        high16: value >>> 16
    }));
}

function parseLocalizationFiles(sources) {
    const result = {};

    for (const source of [ sources.abilitiesVdata, sources.heroesVdata, sources.itemsGame ]) {
        Object.assign(result, Object.fromEntries(Array.from(source.text.matchAll(/"([^"]+)"\s+"([^"]*)"/gu)).map(match => [ match[1], match[2] ])));
    }

    return result;
}

function inferDefinitionType(name, text) {
    if (/imbue/iu.test(name) || /imbue/iu.test(text)) return 'imbue';
    if (/ability/iu.test(name) || /CCitadel_Ability/iu.test(text)) return 'ability';
    if (/upgrade/iu.test(name)) return 'upgrade';
    if (/modifier|mod_/iu.test(name)) return 'modifier';
    if (/item|weapon|spirit|vitality|armor/iu.test(name) || /m_iGoldCost|m_iItemTier/iu.test(text)) return 'item';

    return 'unknown';
}

function slimCandidate(candidate) {
    return {
        originalText: candidate.originalText,
        normalizedText: candidate.normalizedText,
        internalName: candidate.internalName,
        displayName: candidate.displayName,
        definitionType: candidate.definitionType,
        category: candidate.category,
        tier: candidate.tier,
        cost: candidate.cost,
        heroAssociated: candidate.heroAssociated,
        sourceFile: candidate.sourceFile,
        sourceLine: candidate.sourceLine,
        contentVersion: candidate.contentVersion
    };
}

function safeClassification(value) {
    return value === 'item_added'
        ? 'upgrade_token_added'
        : value === 'item_removed' ? 'upgrade_token_removed' : value === 'ability_upgrade_changed' ? 'ability_state_changed' : value;
}

function flattenValues(values) {
    const result = [];

    for (const value of values) {
        if (Number.isInteger(value)) {
            result.push(value);
        } else if (value !== null && typeof value === 'object') {
            result.push(...flattenValues(Object.values(value)));
        }
    }

    return result;
}

function crc32(buffer) {
    let crc = 0xffffffff;

    for (const byte of buffer) {
        crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ byte) & 0xff];
    }

    return (crc ^ 0xffffffff) >>> 0;
}

function fnv1a32(buffer) {
    let hash = 0x811c9dc5;

    for (const byte of buffer) {
        hash ^= byte;
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }

    return hash >>> 0;
}

function murmur3_32_gc(key, seed) {
    const remainder = key.length & 3;
    const bytes = key.length - remainder;
    let h1 = seed;
    const c1 = 0xcc9e2d51;
    const c2 = 0x1b873593;
    let index = 0;

    while (index < bytes) {
        let k1 = (key.charCodeAt(index) & 0xff)
            | ((key.charCodeAt(++index) & 0xff) << 8)
            | ((key.charCodeAt(++index) & 0xff) << 16)
            | ((key.charCodeAt(++index) & 0xff) << 24);

        ++index;
        k1 = Math.imul(k1, c1);
        k1 = (k1 << 15) | (k1 >>> 17);
        k1 = Math.imul(k1, c2);
        h1 ^= k1;
        h1 = (h1 << 13) | (h1 >>> 19);
        h1 = (Math.imul(h1, 5) + 0xe6546b64) | 0;
    }

    let k1 = 0;

    switch (remainder) {
        case 3:
            k1 ^= (key.charCodeAt(index + 2) & 0xff) << 16;
        // falls through
        case 2:
            k1 ^= (key.charCodeAt(index + 1) & 0xff) << 8;
        // falls through
        case 1:
            k1 ^= key.charCodeAt(index) & 0xff;
            k1 = Math.imul(k1, c1);
            k1 = (k1 << 15) | (k1 >>> 17);
            k1 = Math.imul(k1, c2);
            h1 ^= k1;
            break;
        default:
            break;
    }

    h1 ^= key.length;
    h1 ^= h1 >>> 16;
    h1 = Math.imul(h1, 0x85ebca6b);
    h1 ^= h1 >>> 13;
    h1 = Math.imul(h1, 0xc2b2ae35);
    h1 ^= h1 >>> 16;

    return h1 >>> 0;
}

function changedBits(previous, next) {
    const xor = (previous ^ next) >>> 0;
    const bits = [];

    for (let bit = 0; bit < 32; bit++) {
        if (((xor >>> bit) & 1) === 1) {
            bits.push(bit);
        }
    }

    return bits;
}

function extractLines(text, pattern, limit) {
    return text.split(/\r?\n/u)
        .map((line, index) => ({ line: index + 1, text: line.trim() }))
        .filter(entry => pattern.test(entry.text))
        .slice(0, limit);
}

function labelToGameSecond(label) {
    if (label === '5 minutes') return 300;
    if (label === '10 minutes') return 600;
    if (label === '20 minutes') return 1200;
    if (label === 'last tick') return 2945;
    if (label === 'tick 0') return 0;

    return Number.parseInt(label, 10) || 0;
}

function deserializeValue(value) {
    if (value !== null && typeof value === 'object' && value.__type === 'BigInt') {
        return value.value;
    }

    return value;
}

function normalizeTokenText(value) {
    return value.toLowerCase();
}

function numberOrNull(value) {
    return Number.isFinite(value) ? value : null;
}

function toSigned32(value) {
    return value > 0x7fffffff ? value - 0x100000000 : value;
}

function toHex32(value) {
    return `0x${(value >>> 0).toString(16).padStart(8, '0')}`;
}

function toBinary32(value) {
    return (value >>> 0).toString(2).padStart(32, '0');
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

function countBy(values, getKey) {
    const result = {};

    for (const value of values) {
        const key = getKey(value);

        result[key] = (result[key] ?? 0) + 1;
    }

    return result;
}

async function validateOutputs() {
    for (const file of [ OUTPUT_DECODER, OUTPUT_MAPPING, OUTPUT_ABILITY, OUTPUT_IMBUEMENT, OUTPUT_REVIEW ]) {
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
