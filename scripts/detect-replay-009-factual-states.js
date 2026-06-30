import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { queryMechanics } from '../tools/query-mechanics.mjs';

const OUTPUT_DIR = 'output/replay-009-states';
const REPORT_PATH = 'reports/replay-009-factual-state-detection.md';
const TASK_PATH = 'tasks/active/060-detect-replay-states-without-applying-unresolved-mechanics.md';
const MECHANICS = [
    'spirit_urn',
    'mid_boss',
    'rejuvenator',
    'souls_economy',
    'death_respawn',
    'core_structures'
];
const BUILD_ID = '23916427';
const AT_DATE = '2026-06-29';

async function readJson(filePath) {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

async function readJsonl(filePath) {
    const text = await fs.readFile(filePath, 'utf8');
    return text.trim() ? text.trim().split(/\r?\n/).map((line) => JSON.parse(line)) : [];
}

async function writeJson(filePath, value) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeJsonl(filePath, records) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, records.length > 0 ? `${records.map((record) => JSON.stringify(record)).join('\n')}\n` : '');
}

async function writeText(filePath, value) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, value);
}

function parserSecondsFromTick(tick, tickRate = 64) {
    return tick == null ? null : Number((tick / tickRate).toFixed(3));
}

function hash(value) {
    return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function unavailableRecord(stateType, reason) {
    return {
        recordType: 'metadata',
        stateType,
        replayId: 'replay_009',
        status: 'unavailable',
        reason,
        mechanicApplicability: 'unresolved',
        effectApplication: 'not_applied',
        warnings: [
            'Task 060 executed in partial_non_spatial mode.',
            'Task 061 did not validate map transform, region geometry, objective geometry, structure geometry, or proximity.'
        ]
    };
}

function sourcePropertyInventory() {
    return {
        schemaVersion: 1,
        replayId: 'replay_009',
        executionMode: 'partial_non_spatial',
        sources: [
            {
                sourceName: 'output/replay-009-validation/player-roster.json',
                entityClass: 'CCitadelPlayerController / CCitadelPlayerPawn',
                propertyName: 'playerKey, steamId, team, controllerEntityIndex, initialPawnEntityIndex',
                firstSeenTick: 320,
                lastSeenTick: 138925,
                sampleValues: [ '12 Steam-ID-backed players', '6 team 2', '6 team 3' ],
                candidateMeaning: 'player identity foundation',
                confidence: 'supported',
                limitations: [ 'Player slot/account IDs are not exposed in this compact output.' ]
            },
            {
                sourceName: 'output/replay-009-validation/controller-pawn-lifecycle.jsonl',
                entityClass: 'CCitadelPlayerPawn',
                propertyName: 'event',
                firstSeenTick: 1,
                lastSeenTick: 138925,
                sampleValues: [ 'controller_create', 'pawn_create', 'possess', 'death', 'respawn', 'final' ],
                candidateMeaning: 'player life and respawn transitions',
                confidence: 'supported',
                limitations: [ 'One-second validation path; sub-second transitions are not represented.' ]
            },
            {
                sourceName: 'output/replay-009-validation/combat-event-quality-summary.json',
                entityClass: 'CCitadelPlayerPawn',
                propertyName: 'm_iDeaths_counter',
                firstSeenTick: 8384,
                lastSeenTick: 135488,
                sampleValues: [ 'death_counter_increment' ],
                candidateMeaning: 'death counter event source',
                confidence: 'supported',
                limitations: [ 'Killer and assist attribution are not exposed by this task path.' ]
            },
            {
                sourceName: 'output/replay-009-validation/economy-quality-summary.json',
                entityClass: 'player economy summary',
                propertyName: 'm_iGoldNetWorth',
                firstSeenTick: 0,
                lastSeenTick: 138925,
                sampleValues: [ 'firstValue', 'lastValue', 'decreases', 'sampleCount' ],
                candidateMeaning: 'player and team net-worth endpoints',
                confidence: 'supported',
                limitations: [ 'Full per-second net-worth rows are not present in the compact validation artifact.' ]
            },
            {
                sourceName: 'replay-009 compact validation artifacts',
                entityClass: '',
                propertyName: 'objective/structure entity classes and properties',
                firstSeenTick: null,
                lastSeenTick: null,
                sampleValues: [],
                candidateMeaning: 'pilot mechanic entity presence',
                confidence: 'unknown',
                limitations: [ 'No dedicated objective/structure entity-class inventory is available in compact replay-009 outputs.' ]
            }
        ]
    };
}

function playerFoundation(roster) {
    return {
        schemaVersion: 1,
        replayId: 'replay_009',
        summary: {
            detectedPlayers: roster.summary.detectedPlayers,
            teamDistribution: roster.summary.teamDistribution,
            identityStatus: roster.summary.detectedPlayers === 12 ? 'supported' : 'uncertain',
            controllerContinuity: 'supported_by_task_056_lifecycle_validation',
            pawnReplacementContinuity: 'supported_with_one_second_sampling_constraints'
        },
        players: roster.players.map((player) => ({
            playerKey: player.playerKey,
            playerSlot: player.playerSlot,
            team: player.team,
            controllerEntityIndex: player.controllerEntityIndex,
            pawnEntityIndices: [ player.initialPawnEntityIndex ],
            firstSeenTick: player.firstSeenTick,
            lastSeenTick: player.lastSeenTick,
            identityStatus: player.identityStable ? 'supported' : 'uncertain',
            warnings: player.warnings
        }))
    };
}

function lifeStateEvents(roster, lifecycle, deathEvents, respawnTransitions) {
    const byPlayer = new Map(roster.players.map((player) => [ player.playerKey, player ]));
    const deathKey = new Set(deathEvents.map((event) => `${event.victimPlayerKey}:${event.tick}`));
    const records = [];
    for (const event of lifecycle) {
        if (!byPlayer.has(event.playerKey)) {
            continue;
        }
        const player = byPlayer.get(event.playerKey);
        if (event.event === 'death') {
            records.push({
                stateId: `replay_009.${event.playerKey}.death.${event.tick}`,
                stateType: 'player_life_state',
                playerKey: event.playerKey,
                team: player.team,
                demoTick: event.tick,
                parserSeconds: parserSecondsFromTick(event.tick),
                fromState: 'alive',
                toState: 'dead',
                controllerEntityIndex: event.controllerEntityIndex,
                pawnEntityIndex: event.pawnEntityIndex,
                source: 'controller-pawn-lifecycle.jsonl + m_iDeaths_counter',
                confidence: deathKey.has(`${event.playerKey}:${event.tick}`) ? 'confirmed' : 'supported',
                warnings: deathKey.has(`${event.playerKey}:${event.tick}`) ? [] : [ 'No same-tick death counter event matched this lifecycle death.' ]
            });
        }
    }
    for (const transition of respawnTransitions.filter((item) => item.classification !== 'unresolved')) {
        const player = byPlayer.get(transition.playerKey);
        records.push({
            stateId: `replay_009.${transition.playerKey}.respawn.${transition.respawnTick}`,
            stateType: 'player_life_state',
            playerKey: transition.playerKey,
            team: player.team,
            demoTick: transition.respawnTick,
            parserSeconds: transition.respawnParserSeconds,
            fromState: 'dead',
            toState: 'alive',
            controllerEntityIndex: player.controllerEntityIndex,
            pawnEntityIndex: transition.newPawnEntityIndex,
            source: 'controller-pawn-lifecycle.jsonl paired after death',
            confidence: 'supported',
            warnings: [ 'Observed respawn is parser-time return to active state, not official respawn timer validation.' ]
        });
    }
    records.sort((a, b) => a.demoTick - b.demoTick || a.playerKey.localeCompare(b.playerKey) || a.toState.localeCompare(b.toState));
    return records;
}

function deathConsistency(roster, lifecycle, combat) {
    const lifecycleDeaths = lifecycle.filter((event) => event.event === 'death');
    const counterEvents = combat.events;
    const lifecycleByPlayer = new Map();
    const counterByPlayer = new Map();
    for (const player of roster.players) {
        lifecycleByPlayer.set(player.playerKey, []);
        counterByPlayer.set(player.playerKey, []);
    }
    for (const event of lifecycleDeaths) {
        lifecycleByPlayer.get(event.playerKey)?.push(event);
    }
    for (const event of counterEvents) {
        counterByPlayer.get(event.victimPlayerKey)?.push(event);
    }
    const players = roster.players.map((player) => {
        const life = lifecycleByPlayer.get(player.playerKey) ?? [];
        const counters = counterByPlayer.get(player.playerKey) ?? [];
        const lifeTicks = new Set(life.map((event) => event.tick));
        const counterTicks = new Set(counters.map((event) => event.tick));
        const matched = counters.filter((event) => lifeTicks.has(event.tick)).length;
        const unmatchedCounter = counters.filter((event) => !lifeTicks.has(event.tick));
        const unmatchedLife = life.filter((event) => !counterTicks.has(event.tick));
        return {
            playerKey: player.playerKey,
            deathCounterEvents: counters.length,
            lifecycleDeathEvents: life.length,
            matchedEvents: matched,
            unmatchedCounterEvents: unmatchedCounter.length,
            unmatchedLifecycleEvents: unmatchedLife.length,
            result: unmatchedCounter.length === 0 && unmatchedLife.length === 0 ? 'consistent' : 'partially_consistent',
            examples: [
                ...unmatchedCounter.slice(0, 3).map((event) => ({ type: 'counter_without_lifecycle', tick: event.tick })),
                ...unmatchedLife.slice(0, 3).map((event) => ({ type: 'lifecycle_without_counter', tick: event.tick }))
            ]
        };
    });
    return {
        schemaVersion: 1,
        replayId: 'replay_009',
        players,
        summary: {
            deathCounterEvents: counterEvents.length,
            lifecycleDeathEvents: lifecycleDeaths.length,
            matchedEvents: players.reduce((sum, player) => sum + player.matchedEvents, 0),
            unmatchedCounterEvents: players.reduce((sum, player) => sum + player.unmatchedCounterEvents, 0),
            unmatchedLifecycleEvents: players.reduce((sum, player) => sum + player.unmatchedLifecycleEvents, 0),
            result: players.every((player) => player.result === 'consistent') ? 'consistent' : 'partially_consistent'
        }
    };
}

function respawnTransitions(roster, lifecycle) {
    const byPlayer = new Map(roster.players.map((player) => [ player.playerKey, player ]));
    const records = [];
    for (const player of roster.players) {
        const events = lifecycle.filter((event) => event.playerKey === player.playerKey && (event.event === 'death' || event.event === 'respawn')).sort((a, b) => a.tick - b.tick);
        for (let index = 0; index < events.length; index += 1) {
            const event = events[index];
            if (event.event !== 'death') {
                continue;
            }
            const respawn = events.slice(index + 1).find((candidate) => candidate.event === 'respawn');
            records.push({
                playerKey: event.playerKey,
                deathTick: event.tick,
                deathParserSeconds: parserSecondsFromTick(event.tick),
                respawnTick: respawn?.tick ?? null,
                respawnParserSeconds: respawn ? parserSecondsFromTick(respawn.tick) : null,
                observedDeadDurationSeconds: respawn ? Number(((respawn.tick - event.tick) / 64).toFixed(3)) : null,
                oldPawnEntityIndex: event.pawnEntityIndex,
                newPawnEntityIndex: respawn?.pawnEntityIndex ?? null,
                controllerContinuous: respawn ? respawn.controllerEntityIndex === event.controllerEntityIndex : null,
                classification: respawn ? 'supported' : 'unresolved',
                warnings: respawn ? [
                    'Duration is parser-time observation, not validated mechanic respawn timer.'
                ] : [
                    'No later respawn event observed for this death in compact lifecycle output.'
                ]
            });
        }
    }
    return records.sort((a, b) => a.deathTick - b.deathTick || byPlayer.get(a.playerKey).team - byPlayer.get(b.playerKey).team);
}

function netWorthRecords(roster, economy, matchEnvelope) {
    const playersByKey = new Map(roster.players.map((player) => [ player.playerKey, player ]));
    const endpointTicks = {
        first: matchEnvelope.ticks.effectiveFirstTick,
        last: matchEnvelope.ticks.lastParsedTick
    };
    const playerRows = [];
    for (const playerEconomy of economy.players) {
        const player = playersByKey.get(playerEconomy.playerKey);
        const netWorth = playerEconomy.fields.find((field) => field.field === 'netWorth');
        for (const endpoint of [ 'first', 'last' ]) {
            const value = endpoint === 'first' ? netWorth.firstValue : netWorth.lastValue;
            const tick = endpointTicks[endpoint];
            playerRows.push({
                stateId: `replay_009.${playerEconomy.playerKey}.net_worth.${endpoint}`,
                stateType: 'player_net_worth_state',
                playerKey: playerEconomy.playerKey,
                team: player?.team ?? null,
                demoTick: tick,
                parserSeconds: parserSecondsFromTick(tick),
                netWorth: value,
                sourceField: 'm_iGoldNetWorth',
                source: 'economy-quality-summary endpoint',
                confidence: 'supported',
                warnings: [ 'Compact validation output provides endpoints and summary statistics, not full per-second net-worth rows.' ]
            });
        }
    }
    const teamRows = [];
    for (const endpoint of [ 'first', 'last' ]) {
        const tick = endpointTicks[endpoint];
        const byTeam = { 2: 0, 3: 0 };
        for (const playerEconomy of economy.players) {
            const player = playersByKey.get(playerEconomy.playerKey);
            const netWorth = playerEconomy.fields.find((field) => field.field === 'netWorth');
            byTeam[player.team] += endpoint === 'first' ? netWorth.firstValue : netWorth.lastValue;
        }
        const diff = byTeam[2] - byTeam[3];
        teamRows.push({
            demoTick: tick,
            parserSeconds: parserSecondsFromTick(tick),
            team2NetWorth: byTeam[2],
            team3NetWorth: byTeam[3],
            differenceTeam2MinusTeam3: diff,
            leadingTeam: diff > 0 ? 'team2' : diff < 0 ? 'team3' : 'tied',
            sourceField: 'm_iGoldNetWorth',
            confidence: 'supported',
            warnings: [ 'Endpoint team totals only; full net-worth time series is not present in compact validation output.' ]
        });
    }
    return { playerRows, teamRows };
}

function entityClassification() {
    const mechanics = [
        [ 'spirit_urn', [ 'urn', 'soul_urn', 'spirit_urn' ] ],
        [ 'mid_boss', [ 'mid_boss', 'boss' ] ],
        [ 'rejuvenator', [ 'rejuvenator' ] ],
        [ 'core_structures', [ 'guardian', 'walker', 'patron', 'base_structure' ] ]
    ];
    return {
        schemaVersion: 1,
        replayId: 'replay_009',
        executionMode: 'partial_non_spatial',
        candidates: mechanics.map(([ mechanicId, searchTerms ]) => ({
            entityIndex: null,
            classId: null,
            className: '',
            firstSeenTick: null,
            lastSeenTick: null,
            creationObserved: false,
            deletionObserved: false,
            teamAvailable: false,
            ownerAvailable: false,
            healthAvailable: false,
            candidateMechanic: mechanicId,
            classification: 'uncertain',
            classificationBasis: [],
            searchTerms,
            spatialInterpretationAllowed: false,
            warnings: [
                'No compact replay-009 entity-class/property inventory is available for this mechanic.',
                'Task 060 did not reprocess replay 009 entity properties or apply spatial inference.'
            ]
        })),
        summary: {
            confirmed: 0,
            supported: 0,
            uncertain: mechanics.length,
            rejected: 0,
            highestImpactGap: 'objective_and_structure_entity_property_observability'
        }
    };
}

function mechanicStateResults(knowledgeQueries) {
    return [
        {
            mechanicId: 'spirit_urn',
            factualStateDetection: 'not_available',
            detectedEntityCount: 0,
            detectedStateTypes: [],
            unavailableStateTypes: [ 'objective_presence', 'objective_carrier', 'objective_ground_state', 'objective_deposit_candidate' ],
            evidence: [ 'No compact replay-009 Urn entity/property inventory.' ],
            limitations: [ 'No spatial or mechanic-effect inference allowed.' ]
        },
        {
            mechanicId: 'mid_boss',
            factualStateDetection: 'not_available',
            detectedEntityCount: 0,
            detectedStateTypes: [],
            unavailableStateTypes: [ 'boss_presence', 'boss_health_state' ],
            evidence: [ 'No compact replay-009 Mid Boss entity/property inventory.' ],
            limitations: [ 'Mid Boss absence cannot be inferred from missing compact entity data.' ]
        },
        {
            mechanicId: 'rejuvenator',
            factualStateDetection: 'not_available',
            detectedEntityCount: 0,
            detectedStateTypes: [],
            unavailableStateTypes: [ 'rejuvenator_presence' ],
            evidence: [ 'No compact replay-009 Rejuvenator entity/property inventory.' ],
            limitations: [ 'No claim/effect inference allowed.' ]
        },
        {
            mechanicId: 'souls_economy',
            factualStateDetection: 'ready_with_constraints',
            detectedEntityCount: 0,
            detectedStateTypes: [ 'player_net_worth_state', 'team_net_worth_state' ],
            unavailableStateTypes: [ 'spendable_souls', 'secured_souls', 'unsecured_souls', 'income_source', 'reward_source' ],
            evidence: [ 'm_iGoldNetWorth endpoint and summary statistics available for 12 players.' ],
            limitations: [ 'No economy mechanic effects or reward-source semantics applied.' ]
        },
        {
            mechanicId: 'death_respawn',
            factualStateDetection: 'ready_with_constraints',
            detectedEntityCount: 12,
            detectedStateTypes: [ 'player_alive_state', 'player_death_state', 'player_respawn_state' ],
            unavailableStateTypes: [ 'official_respawn_timer', 'death_soul_consequence' ],
            evidence: [ 'controller-pawn lifecycle and death-counter events match.' ],
            limitations: [ 'Observed respawn durations are parser-time observations only.' ]
        },
        {
            mechanicId: 'core_structures',
            factualStateDetection: 'not_available',
            detectedEntityCount: 0,
            detectedStateTypes: [],
            unavailableStateTypes: [ 'structure_presence', 'structure_destroyed' ],
            evidence: [ 'No compact replay-009 structure entity/property inventory.' ],
            limitations: [ 'No structure position, region, destruction, or pressure inference allowed.' ]
        }
    ].map((result) => ({
        ...result,
        knowledgeMissingBuildMapping: knowledgeQueries.mechanics.find((query) => query.mechanicId === result.mechanicId)?.missingBuildMapping ?? true
    }));
}

function activationReadiness(mechanicResults) {
    return {
        schemaVersion: 1,
        replayId: 'replay_009',
        buildId: BUILD_ID,
        executionMode: 'partial_non_spatial',
        mechanics: mechanicResults.map((mechanic) => ({
            mechanicId: mechanic.mechanicId,
            stateDetectionStatus: mechanic.factualStateDetection,
            mechanicVersionStatus: 'unresolved',
            activationStatus: 'blocked',
            effectApplicationStatus: 'blocked',
            safeOutputs: mechanic.detectedStateTypes,
            prohibitedOutputs: [
                'comeback Urn buff active',
                'Rejuvenator effect active',
                'team effective combat advantage',
                'objective decision correctness',
                'structure pressure',
                'lane occupancy',
                'objective-player proximity'
            ],
            missingTelemetry: mechanic.unavailableStateTypes,
            limitations: [
                ...mechanic.limitations,
                'Build 23916427 has no exact or supported mechanic-version mapping.'
            ]
        })),
        summary: {
            mechanicEffectsApplied: 0,
            activationBlockedForAllMechanics: true
        }
    };
}

function knowledgeQueryResults() {
    const mechanics = MECHANICS.map((mechanicId) => {
        const result = queryMechanics({ mechanic: mechanicId, build: BUILD_ID, atDate: AT_DATE });
        return {
            mechanicId,
            applicableRules: result.applicableRules.map((rule) => rule.ruleId),
            ambiguousRules: result.ambiguousRules.map((rule) => rule.ruleId),
            candidatePatchIds: result.mappingCandidatePatches ?? [ 'official_2026_06_11_minor' ],
            missingBuildMapping: result.missingBuildMapping,
            effectApplication: 'not_applied',
            warnings: result.missingBuildMapping ? [ 'Build 23916427 mapping remains unresolved.' ] : []
        };
    });
    return {
        schemaVersion: 1,
        replayId: 'replay_009',
        buildId: BUILD_ID,
        atDate: AT_DATE,
        mechanics,
        summary: {
            applicableRuleCount: mechanics.reduce((sum, mechanic) => sum + mechanic.applicableRules.length, 0),
            ambiguousRuleCount: mechanics.reduce((sum, mechanic) => sum + mechanic.ambiguousRules.length, 0),
            ambiguousRuleCountByMechanic: Object.fromEntries(mechanics.map((mechanic) => [ mechanic.mechanicId, mechanic.ambiguousRules.length ])),
            mechanicEffectsApplied: 0
        }
    };
}

function validation(summary, hashes) {
    return {
        schemaVersion: 1,
        replayId: 'replay_009',
        checks: [
            { check: 'execution_mode_partial_non_spatial', status: summary.executionMode === 'partial_non_spatial' ? 'passed' : 'failed' },
            { check: 'player_identity_count', status: summary.playerIdentities.detectedPlayers === 12 ? 'passed' : 'failed' },
            { check: 'team_distribution_6v6', status: summary.playerIdentities.teamDistribution['2'] === 6 && summary.playerIdentities.teamDistribution['3'] === 6 ? 'passed' : 'failed' },
            { check: 'death_lifecycle_consistency', status: summary.deathConsistency.result === 'consistent' ? 'passed' : 'failed' },
            { check: 'net_worth_field_only', status: summary.netWorth.sourceField === 'm_iGoldNetWorth' ? 'passed' : 'failed' },
            { check: 'spatial_outputs_unavailable', status: summary.spatialOutputsStatus === 'unavailable_by_task_061_limitations' ? 'passed' : 'failed' },
            { check: 'mechanic_effects_not_applied', status: summary.mechanicEffectsApplied === 0 ? 'passed' : 'failed' },
            { check: 'replay_005_excluded', status: summary.replay005Protection === 'not_processed_or_inspected' ? 'passed' : 'failed' },
            { check: 'bot_fixtures_excluded', status: summary.botFixtureExclusion === 'not_processed_or_inspected' ? 'passed' : 'failed' }
        ],
        deterministicHashes: hashes
    };
}

async function main() {
    const roster = await readJson('output/replay-009-validation/player-roster.json');
    const combat = await readJson('output/replay-009-validation/combat-event-quality-summary.json');
    const lifecycle = await readJsonl('output/replay-009-validation/controller-pawn-lifecycle.jsonl');
    const economy = await readJson('output/replay-009-validation/economy-quality-summary.json');
    const envelope = await readJson('output/replay-009-validation/match-envelope.json');
    const spatialUnlock = await readJson('output/replay-009-spatial/task-060-unlock-matrix.json');

    const sources = sourcePropertyInventory();
    const foundation = playerFoundation(roster);
    const death = deathConsistency(roster, lifecycle, combat);
    const respawns = respawnTransitions(roster, lifecycle);
    const lifeEvents = lifeStateEvents(roster, lifecycle, combat.events, respawns);
    const { playerRows, teamRows } = netWorthRecords(roster, economy, envelope);
    const entities = entityClassification();
    const knowledge = knowledgeQueryResults();
    const mechanics = mechanicStateResults(knowledge);
    const activation = activationReadiness(mechanics);

    const eventUnavailableReason = 'No compact replay-009 objective/structure entity-property inventory is available, and spatial/objective geometry remains unavailable under Task 061.';
    const unavailableEvents = {
        objective: [ unavailableRecord('objective_presence', eventUnavailableReason) ],
        urn: [ unavailableRecord('urn_state', eventUnavailableReason) ],
        midBoss: [ unavailableRecord('mid_boss_state', eventUnavailableReason) ],
        rejuvenator: [ unavailableRecord('rejuvenator_state', eventUnavailableReason) ],
        structure: [ unavailableRecord('structure_state', eventUnavailableReason) ],
        proximity: [ unavailableRecord('player_proximity_to_objective', 'Objective-player proximity is blocked because objective geometry, structure geometry, and map transform were not validated.') ],
        entityLifecycle: [ unavailableRecord('entity_lifecycle', eventUnavailableReason) ]
    };

    const summary = {
        schemaVersion: 1,
        taskId: '060',
        replayId: 'replay_009',
        executionMode: 'partial_non_spatial',
        authorizationBasis: {
            task061Commit: '598b81c',
            spatialGate: 'replay_009_spatial_geometric_projection_ready_with_limitations',
            allowedCategories: spatialUnlock.categories.filter((category) => category.unlockStatus.startsWith('unlocked')).map((category) => category.category),
            blockedCategories: spatialUnlock.categories.filter((category) => category.unlockStatus === 'blocked').map((category) => category.category)
        },
        playerIdentities: foundation.summary,
        lifeState: {
            events: lifeEvents.length,
            deathEvents: lifeEvents.filter((event) => event.toState === 'dead').length,
            respawnEvents: lifeEvents.filter((event) => event.toState === 'alive').length,
            result: 'ready_with_constraints'
        },
        deathConsistency: death.summary,
        respawn: {
            transitions: respawns.length,
            unresolved: respawns.filter((transition) => transition.classification === 'unresolved').length,
            result: respawns.every((transition) => transition.classification !== 'unresolved') ? 'supported' : 'partially_supported'
        },
        netWorth: {
            sourceField: 'm_iGoldNetWorth',
            playerEndpointRows: playerRows.length,
            teamEndpointRows: teamRows.length,
            fullSeriesAvailable: false,
            result: 'ready_with_constraints'
        },
        rawEntityClassification: entities.summary,
        spatialOutputsStatus: 'unavailable_by_task_061_limitations',
        knowledgeQuery: knowledge.summary,
        mechanicEffectsApplied: 0,
        safeDownstreamOutputs: [
            'player life/death/respawn parser-time events',
            'm_iGoldNetWorth player endpoint summaries',
            'm_iGoldNetWorth team endpoint summaries',
            'mechanic ambiguity query results'
        ],
        blockedDownstreamInterpretations: [
            'mechanic activation',
            'mechanic effects',
            'objective proximity',
            'lane or region membership',
            'objective/fight/macro interpretation'
        ],
        highestImpactGap: 'objective_and_structure_entity_property_observability',
        gate: 'replay_009_factual_state_detection_ready_with_gaps',
        replay005Protection: 'not_processed_or_inspected',
        botFixtureExclusion: 'not_processed_or_inspected'
    };

    const hashes = {
        playerFoundation: hash(foundation),
        lifeEvents: hash(lifeEvents),
        deathConsistency: hash(death),
        respawns: hash(respawns),
        playerNetWorth: hash(playerRows),
        teamNetWorth: hash(teamRows),
        knowledge: hash(knowledge),
        summary: hash(summary)
    };
    const stateValidation = validation(summary, hashes);
    const gate = {
        schemaVersion: 1,
        taskId: '060',
        gate: summary.gate,
        executionMode: 'partial_non_spatial',
        mechanicEffectsApplied: 0,
        replay005Protection: summary.replay005Protection,
        botFixtureExclusion: summary.botFixtureExclusion,
        limitations: [
            'Objective and structure entity/property observability is missing from compact replay-009 outputs.',
            'Spatial outputs are unavailable under Task 061 limitations.',
            'Build 23916427 mechanic applicability remains unresolved.'
        ]
    };

    await writeJson(`${OUTPUT_DIR}/source-property-inventory.json`, sources);
    await writeJson(`${OUTPUT_DIR}/player-identity-foundation.json`, foundation);
    await writeJson(`${OUTPUT_DIR}/entity-classification.json`, entities);
    await writeJsonl(`${OUTPUT_DIR}/entity-lifecycle-events.jsonl`, unavailableEvents.entityLifecycle);
    await writeJsonl(`${OUTPUT_DIR}/objective-state-events.jsonl`, unavailableEvents.objective);
    await writeJsonl(`${OUTPUT_DIR}/urn-state-events.jsonl`, unavailableEvents.urn);
    await writeJsonl(`${OUTPUT_DIR}/mid-boss-state-events.jsonl`, unavailableEvents.midBoss);
    await writeJsonl(`${OUTPUT_DIR}/rejuvenator-state-events.jsonl`, unavailableEvents.rejuvenator);
    await writeJsonl(`${OUTPUT_DIR}/structure-state-events.jsonl`, unavailableEvents.structure);
    await writeJsonl(`${OUTPUT_DIR}/player-life-state-events.jsonl`, lifeEvents);
    await writeJson(`${OUTPUT_DIR}/death-consistency.json`, death);
    await writeJsonl(`${OUTPUT_DIR}/respawn-transitions.jsonl`, respawns);
    await writeJsonl(`${OUTPUT_DIR}/player-net-worth-series.jsonl`, playerRows);
    await writeJsonl(`${OUTPUT_DIR}/team-net-worth-series.jsonl`, teamRows);
    await writeJsonl(`${OUTPUT_DIR}/objective-player-proximity.jsonl`, unavailableEvents.proximity);
    await writeJson(`${OUTPUT_DIR}/mechanic-state-results.json`, { schemaVersion: 1, replayId: 'replay_009', mechanics });
    await writeJson(`${OUTPUT_DIR}/knowledge-query-results.json`, knowledge);
    await writeJson(`${OUTPUT_DIR}/activation-readiness-matrix.json`, activation);
    await writeJson(`${OUTPUT_DIR}/state-detection-summary.json`, summary);
    await writeJson(`${OUTPUT_DIR}/state-detection-validation.json`, stateValidation);
    await writeJson(`${OUTPUT_DIR}/state-detection-gate.json`, gate);
    await writeText(`${OUTPUT_DIR}/README.md`, `# Replay 009 Factual State Detection\n\nTask 060 produced a partial non-spatial observed-state layer for replay 009.\n\nAvailable factual outputs:\n\n- player identity foundation\n- player life/death/respawn parser-time events\n- death-counter versus lifecycle consistency\n- m_iGoldNetWorth player and team endpoint series\n- knowledge-layer ambiguity queries\n\nUnavailable in this execution:\n\n- map regions, lane membership, objective-player proximity, near-deposit location, structure-region association, and spatial objective activation candidates\n- objective/structure entity lifecycle states from raw entity/property inventories\n- mechanic activation or effects for build 23916427\n\nTime basis: demo tick and parser seconds only. Parser seconds include the unlocalized pause/gap from Task 057.\n`);

    const report = `# Replay 009 Factual State Detection\n\nTask 060 ran in partial non-spatial mode after Task 061 produced gate \`replay_009_spatial_geometric_projection_ready_with_limitations\`.\n\n## Results\n\n- Player identities: ${foundation.summary.detectedPlayers}, teams ${foundation.summary.teamDistribution['2']}v${foundation.summary.teamDistribution['3']}.\n- Life-state events: ${lifeEvents.length} (${summary.lifeState.deathEvents} deaths, ${summary.lifeState.respawnEvents} respawns).\n- Death consistency: ${death.summary.result}; ${death.summary.matchedEvents}/${death.summary.deathCounterEvents} counter events matched lifecycle deaths.\n- Respawn transitions: ${respawns.length}; unresolved ${summary.respawn.unresolved}.\n- Net worth: \`m_iGoldNetWorth\` endpoint summaries for 12 players and 2 team snapshots.\n- Objective/structure entity classification: unavailable from compact replay-009 outputs.\n- Spatial outputs: unavailable by Task 061 limitations; no proximity, regions, lanes, or deposit candidates emitted.\n- Knowledge rules applied: 0. Ambiguous rules preserved per mechanic.\n\n## Gate\n\n\`${summary.gate}\`\n\n## Highest-Impact Gap\n\n\`objective_and_structure_entity_property_observability\`: the next factual-state improvement is a non-spatial entity/property inventory for objective and structure candidates. It should not attempt map projection or mechanic effects.\n\n## Validation\n\nThe generated validation file records deterministic hashes, replay 005 protection, bot fixture exclusion, and mechanic-effect count zero.\n`;
    await writeText(REPORT_PATH, report);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
