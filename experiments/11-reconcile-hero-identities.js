import { createHash } from 'node:crypto';
import { readFile, stat, writeFile } from 'node:fs/promises';

const INPUT_HERO_MAPPING = './output/10-hero-id-mapping.json';
const INPUT_PLAYER_MAPPING = './output/10-player-hero-mapping.json';
const INPUT_SOURCE_MAPPING = './output/10-hero-mapping-sources.json';
const INPUT_TIMELINE = './output/09-canonical-player-timeline.json';
const GAME_TRACKING_ROOT = './external/GameTracking-Deadlock';
const METADATA_ROOT = './external/deadlock-metadata';
const HEROES_VDATA = `${GAME_TRACKING_ROOT}/game/citadel/pak01_dir/scripts/heroes.vdata`;
const HERO_NAME_LOCALIZATION = `${GAME_TRACKING_ROOT}/game/citadel/resource/localization/citadel_gc_hero_names/citadel_gc_hero_names_english.txt`;
const HERO_TEXT_LOCALIZATION = `${GAME_TRACKING_ROOT}/game/citadel/resource/localization/citadel_heroes/citadel_heroes_english.txt`;
const METADATA_HERO_NAMES = `${METADATA_ROOT}/heroes/names.json`;
const METADATA_HERO_BASE = `${METADATA_ROOT}/heroes/base.json`;
const METADATA_HERO_ABILITIES = `${METADATA_ROOT}/heroes/abilities.json`;
const METADATA_HERO_ABILITY_NAMES = `${METADATA_ROOT}/heroes/abilities_names.json`;
const PATCH_DATES = `${METADATA_ROOT}/patchdates.json`;
const HERO_RECONCILIATION_OUTPUT = './output/11-hero-identity-reconciliation.json';
const PLAYER_RECONCILIATION_OUTPUT = './output/11-player-hero-reconciliation.json';
const SOURCE_MANIFEST_OUTPUT = './output/11-external-source-manifest.json';
const REVIEW_OUTPUT = './output/11-hero-mapping-review.json';
const OUTPUT_SIZE_LIMIT = 3 * 1024 * 1024;
const SAFE_DIRECTORY_PREFIX = `${process.cwd().replace(/\\/gu, '/')}/`;
const CURRENT_DATA_CROSSCHECK = 'current_data_crosscheck';
const ABILITY_IGNORE_PREFIXES = [ 'upgrade_' ];

const heroMappings = JSON.parse(await readFile(INPUT_HERO_MAPPING, 'utf8'));
const playerMappings = JSON.parse(await readFile(INPUT_PLAYER_MAPPING, 'utf8'));
const sourceMapping = JSON.parse(await readFile(INPUT_SOURCE_MAPPING, 'utf8'));
const timeline = JSON.parse(await readFile(INPUT_TIMELINE, 'utf8'));
const gameTrackingHeroes = parseHeroesVdata(await readFile(HEROES_VDATA, 'utf8'));
const gameTrackingNameLocalization = parseLocalization(await readFile(HERO_NAME_LOCALIZATION, 'utf8'));
const gameTrackingTextLocalization = parseLocalization(await readFile(HERO_TEXT_LOCALIZATION, 'utf8'));
const metadataNames = JSON.parse(await readFile(METADATA_HERO_NAMES, 'utf8'));
const metadataBase = JSON.parse(await readFile(METADATA_HERO_BASE, 'utf8'));
const metadataAbilities = JSON.parse(await readFile(METADATA_HERO_ABILITIES, 'utf8'));
const patchDates = JSON.parse(await readFile(PATCH_DATES, 'utf8'));
const sourceVersions = await collectSourceVersions();
const sourceFileRecords = await collectFileRecords([
    HEROES_VDATA,
    HERO_NAME_LOCALIZATION,
    HERO_TEXT_LOCALIZATION,
    METADATA_HERO_NAMES,
    METADATA_HERO_BASE,
    METADATA_HERO_ABILITIES,
    METADATA_HERO_ABILITY_NAMES,
    PATCH_DATES,
    INPUT_HERO_MAPPING,
    INPUT_PLAYER_MAPPING,
    INPUT_SOURCE_MAPPING,
    INPUT_TIMELINE
]);
const currentHeroCatalog = buildCurrentHeroCatalog();
const reconciliations = buildHeroReconciliations();
const playerReconciliations = buildPlayerReconciliations(reconciliations);
const manifest = buildManifest(reconciliations);
const review = buildReview(reconciliations);

await writeJson(HERO_RECONCILIATION_OUTPUT, reconciliations);
await writeJson(PLAYER_RECONCILIATION_OUTPUT, playerReconciliations);
await writeJson(SOURCE_MANIFEST_OUTPUT, manifest);
await writeJson(REVIEW_OUTPUT, review);
await validateOutputs();

const confidenceCounts = countBy(reconciliations, entry => entry.mappingConfidence);

console.log(`Hero IDs: ${reconciliations.length}`);
console.log(`High: ${confidenceCounts.high ?? 0}`);
console.log(`Medium: ${confidenceCounts.medium ?? 0}`);
console.log(`Low: ${confidenceCounts.low ?? 0}`);
console.log(`Unresolved: ${confidenceCounts.unresolved ?? 0}`);
console.log(`Canonical-safe mappings: ${review.acceptedForCanonicalEnrichment.length}`);
console.log(`Wrote ${HERO_RECONCILIATION_OUTPUT}`);
console.log(`Wrote ${PLAYER_RECONCILIATION_OUTPUT}`);
console.log(`Wrote ${SOURCE_MANIFEST_OUTPUT}`);
console.log(`Wrote ${REVIEW_OUTPUT}`);

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
    const heroId = readNumber(text, /m_HeroID\s*=\s*(-?\d+)/iu);
    const logo = readString(text, /m_strLogoImageEnglish\s*=\s*panorama:"file:\/\/\{images\}\/heroes\/hero_names\/([^"]+)"/iu);
    const searchToken = readString(text, /m_strHeroSearchName\s*=\s*"(#[^"]+)"/iu);
    const sortToken = readString(text, /m_strHeroSortName\s*=\s*"(#[^"]+)"/iu);
    const abilities = unique(Array.from(text.matchAll(/ESlot_(?:Signature|Weapon|Ability)_[A-Za-z0-9_]+\s*=\s*"([^"]+)"/giu))
        .map(match => match[1])
        .filter(isHeroAbility));

    return {
        source: HEROES_VDATA,
        key: record.key,
        internalName: record.internalName,
        currentHeroId: heroId,
        startLine: record.startLine,
        displayNameFromLogo: logo === null ? null : logo.replace(/\.svg$/iu, '').replace(/_/gu, ' '),
        localizationTokens: unique([
            `#${record.key}`,
            searchToken,
            sortToken
        ].filter(Boolean)),
        abilities,
        statusFlags: {
            playerSelectable: readBoolean(text, /m_bPlayerSelectable\s*=\s*(true|false)/iu),
            disabled: readBoolean(text, /m_bDisabled\s*=\s*(true|false)/iu),
            inDevelopment: readBoolean(text, /m_bInDevelopment\s*=\s*(true|false)/iu),
            needsTesting: readBoolean(text, /m_bNeedsTesting\s*=\s*(true|false)/iu),
            limitedTesting: readBoolean(text, /m_bLimitedTesting\s*=\s*(true|false)/iu),
            prereleaseOnly: readBoolean(text, /m_bPrereleaseOnly\s*=\s*(true|false)/iu)
        }
    };
}

function parseLocalization(content) {
    return Object.fromEntries(Array.from(content.matchAll(/"([^"]+)"\s+"([^"]*)"/gu)).map(match => [ match[1], match[2] ]));
}

function buildCurrentHeroCatalog() {
    const metadataByTag = new Map();

    for (const [ id, entry ] of Object.entries(metadataBase)) {
        for (const tag of unique([ entry.tag, entry.internal_tag, entry.tag_alt, ...(Array.isArray(entry.old_name) ? entry.old_name : []) ].filter(Boolean))) {
            metadataByTag.set(tag, {
                metadataId: Number(id),
                ...entry,
                localizedNames: metadataNames[id] ?? null,
                abilities: metadataAbilities[id] ?? null
            });
        }
    }

    return gameTrackingHeroes.map(hero => {
        const metadata = metadataByTag.get(hero.internalName) ?? null;
        const metadataId = metadata?.metadataId ?? null;
        const localizationKey = `${hero.key}:n`;
        const localizedDisplayName = gameTrackingNameLocalization[localizationKey] ?? null;
        const metadataAbilityList = metadata?.abilities?.list ?? [];

        return {
            ...hero,
            currentDisplayName: localizedDisplayName ?? metadata?.name ?? null,
            currentInternalName: metadata?.internal_tag ?? metadata?.tag ?? hero.internalName,
            metadataId,
            metadata,
            metadataAbilityNames: metadataAbilityList,
            allAbilityNames: unique([ ...hero.abilities, ...metadataAbilityList ]),
            localization: {
                displayNameToken: localizationKey,
                displayName: localizedDisplayName,
                searchName: gameTrackingNameLocalization[`${hero.key}_search:n`] ?? null,
                sortName: gameTrackingNameLocalization[`${hero.key}_sort:n`] ?? null,
                lore: gameTrackingTextLocalization[`${hero.key}_lore`] ?? null
            }
        };
    });
}

function buildHeroReconciliations() {
    return heroMappings.map(mapping => {
        const observedAbilities = extractObservedAbilities(mapping);
        const rankedMatches = currentHeroCatalog
            .map(hero => scoreHeroMatch(mapping, observedAbilities, hero))
            .filter(match => match.score > 0)
            .sort((a, b) => b.score - a.score || b.abilityOverlap.length - a.abilityOverlap.length || a.hero.internalName.localeCompare(b.hero.internalName));
        const best = rankedMatches[0] ?? null;
        const hasDirectId = false;
        const hasDemonstratedConversion = false;
        const abilityOverlapCount = best?.abilityOverlap.length ?? 0;
        const hasDisplayName = best?.hero.currentDisplayName !== null;
        const mappingConfidence = getMappingConfidence(hasDirectId, hasDemonstratedConversion, abilityOverlapCount, hasDisplayName);
        const conflicts = getConflicts(mapping, best, rankedMatches);

        return {
            heroIdRaw: mapping.heroIdRaw,
            heroIdNormalized: hasDirectId || hasDemonstratedConversion ? best.hero.currentHeroId : null,
            internalNameAtReplay: mapping.heroInternalName,
            currentInternalName: best?.hero.currentInternalName ?? null,
            displayNameAtReplay: null,
            currentDisplayName: best?.hero.currentDisplayName ?? null,
            currentExternalHeroId: best?.hero.currentHeroId ?? null,
            metadataHeroId: best?.hero.metadataId ?? null,
            mappingConfidence,
            versionMatch: CURRENT_DATA_CROSSCHECK,
            evidence: buildEvidence(mapping, observedAbilities, best, rankedMatches),
            conflicts,
            players: mapping.players
        };
    });
}

function extractObservedAbilities(mapping) {
    const abilities = [];

    for (const item of mapping.evidence) {
        if (item.kind !== 'ability_names') {
            continue;
        }

        for (const value of item.values ?? []) {
            if (isHeroAbility(value.abilityName)) {
                abilities.push(value.abilityName);
            }
        }
    }

    return unique(abilities);
}

function scoreHeroMatch(mapping, observedAbilities, hero) {
    const abilityOverlap = observedAbilities.filter(ability => hero.allAbilityNames.includes(ability));
    const codenameMatches = mapping.heroInternalName !== null && [ hero.internalName, hero.currentInternalName, hero.metadata?.tag, hero.metadata?.internal_tag ].includes(mapping.heroInternalName);
    const score = abilityOverlap.length * 10 + (codenameMatches ? 5 : 0);

    return {
        hero,
        score,
        abilityOverlap,
        codenameMatches
    };
}

function getMappingConfidence(hasDirectId, hasDemonstratedConversion, abilityOverlapCount, hasDisplayName) {
    if ((hasDirectId || hasDemonstratedConversion) && hasDisplayName) {
        return 'high';
    }

    if (abilityOverlapCount >= 2 && hasDisplayName) {
        return 'medium';
    }

    if (abilityOverlapCount === 1) {
        return 'low';
    }

    return 'unresolved';
}

function buildEvidence(mapping, observedAbilities, best, rankedMatches) {
    return [
        {
            kind: 'replay_observed_abilities',
            source: INPUT_HERO_MAPPING,
            values: observedAbilities,
            confidence: observedAbilities.length >= 2 ? 'medium' : 'low'
        },
        {
            kind: 'current_gametracking_match',
            source: HEROES_VDATA,
            commit: sourceVersions.gameTracking.commit,
            currentHeroKey: best?.hero.key ?? null,
            currentHeroId: best?.hero.currentHeroId ?? null,
            currentInternalName: best?.hero.currentInternalName ?? null,
            abilityOverlap: best?.abilityOverlap ?? [],
            codenameMatches: best?.codenameMatches ?? false,
            confidence: (best?.abilityOverlap.length ?? 0) >= 2 ? 'medium' : 'low'
        },
        {
            kind: 'current_localization',
            source: HERO_NAME_LOCALIZATION,
            commit: sourceVersions.gameTracking.commit,
            token: best?.hero.localization.displayNameToken ?? null,
            displayName: best?.hero.currentDisplayName ?? null,
            confidence: best?.hero.currentDisplayName === null ? 'low' : 'medium'
        },
        {
            kind: 'deadlock_metadata_crosscheck',
            source: METADATA_HERO_BASE,
            commit: sourceVersions.deadlockMetadata.commit,
            metadataHeroId: best?.hero.metadataId ?? null,
            status: best?.hero.metadata?.status ?? null,
            released: best?.hero.metadata?.released ?? null,
            aliases: best?.hero.metadata?.aliases ?? null,
            oldName: best?.hero.metadata?.old_name ?? null,
            abilityOverlap: best?.hero.metadataAbilityNames.filter(ability => observedAbilities.includes(ability)) ?? [],
            confidence: best === null ? 'low' : 'medium'
        },
        {
            kind: 'ranked_candidates',
            source: 'computed ability overlap',
            values: rankedMatches.slice(0, 5).map(match => ({
                key: match.hero.key,
                currentHeroId: match.hero.currentHeroId,
                currentDisplayName: match.hero.currentDisplayName,
                score: match.score,
                abilityOverlap: match.abilityOverlap
            })),
            confidence: rankedMatches.length === 1 ? 'medium' : 'low'
        },
        {
            kind: 'signed_id_rule',
            source: INPUT_SOURCE_MAPPING,
            detail: sourceMapping.heroIdField?.explanationForNegativeValues ?? 'HeroID_t is treated as signed VAR_INT_32 in the replay parser.',
            conversionApplied: false,
            confidence: 'high'
        }
    ];
}

function getConflicts(mapping, best, rankedMatches) {
    const conflicts = [];

    if (best === null) {
        conflicts.push({
            kind: 'no_external_match',
            detail: 'No current external hero matched the observed replay abilities.'
        });
        return conflicts;
    }

    if (mapping.heroIdRaw !== best.hero.currentHeroId) {
        conflicts.push({
            kind: 'raw_id_differs_from_current_external_id',
            heroIdRaw: mapping.heroIdRaw,
            currentExternalHeroId: best.hero.currentHeroId,
            detail: 'Ability/codename evidence points to a current external hero, but no numeric conversion from replay heroIdRaw to current m_HeroID was demonstrated.'
        });
    }

    if (mapping.heroInternalName !== null && mapping.heroInternalName !== best.hero.currentInternalName && mapping.heroInternalName !== best.hero.internalName) {
        conflicts.push({
            kind: 'codename_changed_or_alias',
            internalNameAtReplay: mapping.heroInternalName,
            currentInternalName: best.hero.currentInternalName,
            detail: 'Current metadata uses a different internal tag or alias.'
        });
    }

    if (rankedMatches.length > 1 && rankedMatches[0].score === rankedMatches[1].score) {
        conflicts.push({
            kind: 'ambiguous_ability_overlap',
            candidates: rankedMatches.slice(0, 3).map(match => match.hero.key),
            detail: 'More than one current hero had the same top score.'
        });
    }

    if (best.hero.metadata?.old_name !== null && best.hero.metadata?.old_name !== undefined) {
        conflicts.push({
            kind: 'metadata_old_name_present',
            values: best.hero.metadata.old_name,
            detail: 'Metadata records one or more previous names/tags.'
        });
    }

    conflicts.push({
        kind: 'version_not_exact',
        detail: 'The replay build/date was not identified; external data is current-data crosscheck, not build-exact evidence.'
    });

    return conflicts;
}

function buildPlayerReconciliations(reconciliations) {
    const byRaw = new Map(reconciliations.map(entry => [ entry.heroIdRaw, entry ]));

    return playerMappings.map(player => {
        const reconciliation = byRaw.get(player.heroIdRaw);

        return {
            playerIndex: player.playerIndex,
            steamId: player.steamId,
            name: player.name,
            team: player.team,
            heroIdRaw: player.heroIdRaw,
            heroIdNormalized: reconciliation.heroIdNormalized,
            internalNameAtReplay: reconciliation.internalNameAtReplay,
            currentInternalName: reconciliation.currentInternalName,
            displayNameAtReplay: reconciliation.displayNameAtReplay,
            currentDisplayName: reconciliation.currentDisplayName,
            currentExternalHeroId: reconciliation.currentExternalHeroId,
            mappingConfidence: reconciliation.mappingConfidence,
            versionMatch: reconciliation.versionMatch,
            canonicalEnrichmentSafe: reconciliation.mappingConfidence === 'high'
        };
    });
}

function buildManifest(reconciliations) {
    return {
        repositories: {
            gameTrackingDeadlock: sourceVersions.gameTracking,
            deadlockMetadata: sourceVersions.deadlockMetadata
        },
        filesUsed: sourceFileRecords,
        replayBuildOrDate: {
            exactBuild: null,
            exactDate: null,
            reason: 'No reliable build/date field was available from the prior replay extraction outputs.',
            timelineRange: timeline.metadata?.range ?? null
        },
        conversionRules: {
            negativeIds: 'Preserve heroIdRaw as signed VAR_INT_32. Do not apply abs, unsigned8, unsigned16, or unsigned32 conversion unless a versioned source demonstrates that exact conversion.',
            normalizedId: 'Set heroIdNormalized only for direct signed ID matches or a demonstrated versioned conversion.',
            currentExternalIds: 'Record currentExternalHeroId separately when ability/codename evidence matches current external data.'
        },
        limitations: [
            'External repositories were read at current cloned commits, not a replay-exact build.',
            'GameTracking current m_HeroID values do not numerically match the replay heroIdRaw values for these 12 players.',
            'deadlock-metadata is treated as secondary interpretation, not primary evidence.',
            'Public display names from current localization are not used as proof that replay IDs map numerically to current IDs.',
            'No lanes, items, performance metrics, or canonical timeline enrichment were generated.'
        ],
        differencesBetweenReplayAndCurrentData: reconciliations.map(entry => ({
            heroIdRaw: entry.heroIdRaw,
            currentExternalHeroId: entry.currentExternalHeroId,
            currentInternalName: entry.currentInternalName,
            currentDisplayName: entry.currentDisplayName,
            numericIdMatches: entry.heroIdRaw === entry.currentExternalHeroId,
            versionMatch: entry.versionMatch
        })),
        patchDatesSummary: {
            source: PATCH_DATES,
            keys: Object.keys(patchDates).slice(0, 20),
            count: Object.keys(patchDates).length
        }
    };
}

function buildReview(reconciliations) {
    return {
        acceptedForCanonicalEnrichment: reconciliations
            .filter(entry => entry.mappingConfidence === 'high')
            .map(reviewEntry),
        provisionalOnly: reconciliations
            .filter(entry => entry.mappingConfidence === 'medium' || entry.mappingConfidence === 'low')
            .map(reviewEntry),
        unresolved: reconciliations
            .filter(entry => entry.mappingConfidence === 'unresolved')
            .map(reviewEntry)
    };
}

function reviewEntry(entry) {
    return {
        heroIdRaw: entry.heroIdRaw,
        heroIdNormalized: entry.heroIdNormalized,
        internalNameAtReplay: entry.internalNameAtReplay,
        currentInternalName: entry.currentInternalName,
        currentDisplayName: entry.currentDisplayName,
        mappingConfidence: entry.mappingConfidence,
        reason: entry.mappingConfidence === 'high'
            ? 'Direct version-compatible numeric mapping found.'
            : 'Useful external crosscheck, but no replay-build-exact numeric mapping was demonstrated.'
    };
}

async function collectSourceVersions() {
    return {
        gameTracking: await gitVersion(GAME_TRACKING_ROOT),
        deadlockMetadata: await gitVersion(METADATA_ROOT)
    };
}

async function gitVersion(repository) {
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const execFileAsync = promisify(execFile);
    const safeDirectory = `${SAFE_DIRECTORY_PREFIX}${repository.replace('./', '').replaceAll('\\', '/')}`;
    const { stdout } = await execFileAsync('git', [
        '-c',
        `safe.directory=${safeDirectory}`,
        '-C',
        repository,
        'log',
        '-1',
        '--format=%H%n%cI%n%s'
    ]);
    const [ commit, date, subject ] = stdout.trim().split(/\r?\n/u);

    return {
        repository,
        commit,
        date,
        subject
    };
}

async function collectFileRecords(files) {
    return Promise.all(files.map(async file => ({
        path: file,
        sha256: await sha256(file),
        hashAvailable: true
    })));
}

async function validateOutputs() {
    for (const file of [ HERO_RECONCILIATION_OUTPUT, PLAYER_RECONCILIATION_OUTPUT, SOURCE_MANIFEST_OUTPUT, REVIEW_OUTPUT ]) {
        JSON.parse(await readFile(file, 'utf8'));
        const size = (await stat(file)).size;

        if (size > OUTPUT_SIZE_LIMIT) {
            throw new Error(`${file} exceeds 3 MiB (${size} bytes)`);
        }
    }

    const players = JSON.parse(await readFile(PLAYER_RECONCILIATION_OUTPUT, 'utf8'));
    const heroes = JSON.parse(await readFile(HERO_RECONCILIATION_OUTPUT, 'utf8'));

    if (players.length !== 12) {
        throw new Error(`Expected 12 player mappings, got ${players.length}`);
    }

    if (heroes.length !== heroMappings.length) {
        throw new Error(`Expected ${heroMappings.length} hero reconciliations, got ${heroes.length}`);
    }

    for (const hero of heroes) {
        if (hero.heroIdRaw < 0 && hero.heroIdNormalized !== null && hero.mappingConfidence !== 'high') {
            throw new Error(`Negative ID normalized without high-confidence evidence: ${hero.heroIdRaw}`);
        }
    }
}

async function writeJson(file, data) {
    await writeFile(file, `${JSON.stringify(data, null, 4)}\n`);
}

function readString(text, pattern) {
    return text.match(pattern)?.[1] ?? null;
}

function readNumber(text, pattern) {
    const value = readString(text, pattern);

    return value === null ? null : Number(value);
}

function readBoolean(text, pattern) {
    const value = readString(text, pattern);

    return value === null ? null : value === 'true';
}

function isHeroAbility(value) {
    return typeof value === 'string'
        && !ABILITY_IGNORE_PREFIXES.some(prefix => value.startsWith(prefix))
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

function countBy(items, getKey) {
    return items.reduce((counts, item) => {
        const key = getKey(item);

        counts[key] = (counts[key] ?? 0) + 1;

        return counts;
    }, {});
}

async function sha256(file) {
    return createHash('sha256').update(await readFile(file)).digest('hex');
}
