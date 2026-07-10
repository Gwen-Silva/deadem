#!/usr/bin/env node
import { createReadStream } from 'node:fs';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Logger, Player } from 'deadem';
import { validateJsonSchema } from './lib/json-schema-validator.mjs';

const THIS_FILE = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(THIS_FILE), '..');
const ARTIFACT_CLASS = 'death_event_directional_cycle_evidence';
const MODE = 'death_event_directional_cycle_evidence_emission';
const GENERATED_BY = 'tools/emit-death-event-directional-cycle-evidence.mjs';
const GENERATED_AT = 'task_185';
const OUTPUT_ROOT_PREFIX = 'output/local-replay-processing/death-event-directional-cycle-evidence/';
const SCHEMA_PATH = 'schemas/death-event-directional-cycle-evidence.schema.json';
const CONTROLLER_CLASS = 'CCitadelPlayerController';
const MAX_ARTIFACT_BYTES = 512 * 1024;
const MAX_RUN_BYTES = 16 * 1024 * 1024;
const EXPECTED_ANCHORS = new Map([['task185-pilot', 341], ['task185-bounded32', 2552]]);
const RUN_GATES = {
    'task185-pilot': {
        ready: 'death_event_directional_cycle_evidence_pilot_ready',
        blocked: 'death_event_directional_cycle_evidence_pilot_blocked',
        prefix: 'death-event-directional-cycle-evidence-pilot'
    },
    'task185-bounded32': {
        ready: 'task184_commit_recorded_directional_cycle_evidence_bounded32_ready',
        blocked: 'task184_commit_recorded_directional_cycle_evidence_blocked',
        prefix: 'death-event-directional-cycle-evidence-bounded32'
    }
};

const FAMILY_KEYS = ['healthBoundary', 'booleanAlive', 'lifeStateSignature', 'respawnBoundary', 'pawnLink'];
const NO_TRANSITION = {
    healthBoundary: 'no_boundary_transition_observed',
    booleanAlive: 'no_boolean_transition_observed',
    lifeStateSignature: 'no_life_state_signature_change_observed',
    respawnBoundary: 'no_respawn_transition_observed',
    pawnLink: 'no_pawn_link_transition_observed'
};
const AMBIGUOUS_TRANSITION = {
    healthBoundary: 'boundary_transition_ambiguous',
    booleanAlive: 'boolean_change_candidate_unknown_direction',
    lifeStateSignature: 'life_state_signature_change_candidate',
    respawnBoundary: 'respawn_signature_change_candidate_unknown_direction',
    pawnLink: 'pawn_link_changed_candidate'
};

export const FORBIDDEN_REPLAY_IDS = new Set(['replay_005', 'replay_006', 'replay_007', 'replay_008']);
export const FORBIDDEN_OUTPUT_KEYS = new Set([
    'playerName', 'heroName', 'teamName', 'entityId', 'rawEntityId', 'handle', 'controllerHandle',
    'accountId', 'steamId', 'playerSlot', 'heroId', 'teamNumber', 'fieldName', 'fieldNames',
    'fieldValue', 'fieldValues', 'rawValue', 'rawValues', 'rawTick', 'rawTicks', 'rawTimestamp',
    'rawTimestamps', 'tick', 'ticks', 'timestamp', 'timestamps', 'position', 'positions', 'killer',
    'victim', 'assist', 'assists', 'damage', 'damageSource', 'objective', 'objectiveId', 'deathFact',
    'confirmedDeath', 'deathEvents', 'respawnEvents', 'teamfight', 'teamfights', 'snapshot',
    'entityHistory'
]);
export const FORBIDDEN_SURFACES = [
    'player_names', 'hero_names', 'team_names', 'raw_entity_ids', 'raw_handles', 'account_ids',
    'steam_ids', 'raw_player_slots', 'raw_hero_ids', 'raw_team_numbers', 'raw_values', 'raw_ticks',
    'raw_timestamps', 'raw_field_names', 'field_values', 'map_positions', 'damage', 'objectives',
    'attribution', 'final_facts', 'final_death_events', 'final_respawn_events', 'teamfights',
    'gameplay_interpretation'
];

function slash(value) {
    return String(value).replaceAll(path.sep, '/');
}

function assertRelativeRepositoryPath(value, label) {
    if (!value || path.isAbsolute(value)) throw new Error(`${label} must be a relative repository path`);
    const normalized = slash(value);
    if (normalized === '..' || normalized.startsWith('../') || normalized.includes('/../')) {
        throw new Error(`${label} must stay inside the repository`);
    }
    if (normalized.toLowerCase().startsWith('output/replays/')) throw new Error(`${label} must not use output/replays`);
    return normalized;
}

function parseArgs(argv) {
    const args = new Map();
    for (let index = 0; index < argv.length; index += 2) {
        const key = argv[index];
        const value = argv[index + 1];
        if (!key?.startsWith('--') || value === undefined) throw new Error(`Invalid argument near ${key ?? '<end>'}`);
        args.set(key.slice(2), value);
    }
    for (const required of ['manifest', 'summary-output']) {
        if (!args.has(required)) throw new Error(`missing --${required}`);
    }
    return args;
}

async function readJson(relativePath) {
    return JSON.parse(await readFile(path.resolve(REPO_ROOT, relativePath), 'utf8'));
}

async function writeJson(filePath, value) {
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function artifactSizeBytes(value) {
    return Buffer.byteLength(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function normalizeValue(value) {
    if (value === undefined || value === null) return null;
    if (typeof value === 'bigint') return value.toString();
    if (typeof value === 'number') return Number.isFinite(value) ? String(value) : null;
    if (typeof value === 'boolean') return String(value);
    if (typeof value === 'string') return value.trim() || null;
    return null;
}

function safeNumber(value) {
    if (value === undefined || value === null) return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function strictBoolean(value) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number' && (value === 0 || value === 1)) return value === 1;
    if (typeof value === 'bigint' && (value === 0n || value === 1n)) return value === 1n;
    return null;
}

function readFirstField(entity, candidates) {
    if (!entity) return null;
    for (const candidate of candidates) {
        try {
            const value = entity.getField(candidate);
            if (value !== undefined && value !== null) return value;
        } catch {
            // Optional probes may be absent in a replay build.
        }
    }
    return null;
}

function participantSeed(controller, ordinal) {
    return normalizeValue(readFirstField(controller, ['m_iPlayerSlot', 'm_iPlayerID', 'm_unAccountID', 'm_iAccountID', 'm_steamID']))
        ?? `observed-controller-${ordinal}`;
}

function numericBoundary(entity, candidates) {
    const value = safeNumber(readFirstField(entity, candidates));
    if (value === null) return null;
    return value <= 0 ? 'non_positive' : 'positive';
}

function linkedPawn(player, rawHandle) {
    const handle = safeNumber(rawHandle);
    if (!Number.isInteger(handle)) return null;
    try {
        return player.getDemo().getEntityByHandle(handle);
    } catch {
        return null;
    }
}

function scopeState(entity) {
    if (!entity) return null;
    const lifeState = normalizeValue(readFirstField(entity, ['m_lifeState', 'm_nLifeState']));
    const booleanAlive = strictBoolean(readFirstField(entity, ['m_bAlive', 'm_bIsAlive']));
    const respawnRaw = readFirstField(entity, ['m_iRespawnTime', 'm_flRespawnTime', 'm_nRespawnTime']);
    const respawnFlag = strictBoolean(readFirstField(entity, ['m_bRespawning', 'm_bIsRespawning']));
    return {
        healthBoundary: numericBoundary(entity, ['m_iHealth', 'm_nHealth', 'm_flHealth']),
        booleanAlive,
        lifeStateSignature: lifeState,
        respawnBoundary: safeNumber(respawnRaw) === null ? null : (Number(respawnRaw) <= 0 ? 'non_positive' : 'positive'),
        respawnSignature: respawnFlag === null ? normalizeValue(respawnRaw) : String(respawnFlag)
    };
}

function boundaryDirection(previous, current, positiveToNonPositive, nonPositiveToPositive) {
    if (previous === null || current === null || previous === current) return null;
    if (previous === 'positive' && current === 'non_positive') return positiveToNonPositive;
    if (previous === 'non_positive' && current === 'positive') return nonPositiveToPositive;
    return null;
}

function scopeTransitions(previous, current) {
    if (!previous || !current) return [];
    const transitions = [];
    const health = boundaryDirection(
        previous.healthBoundary,
        current.healthBoundary,
        'positive_to_non_positive_boundary_candidate',
        'non_positive_to_positive_boundary_candidate'
    );
    if (health) transitions.push(['healthBoundary', health]);
    if (previous.booleanAlive !== null && current.booleanAlive !== null && previous.booleanAlive !== current.booleanAlive) {
        transitions.push(['booleanAlive', previous.booleanAlive
            ? 'boolean_true_to_false_candidate'
            : 'boolean_false_to_true_candidate']);
    }
    if (previous.lifeStateSignature !== null && current.lifeStateSignature !== null
        && previous.lifeStateSignature !== current.lifeStateSignature) {
        transitions.push(['lifeStateSignature', 'life_state_signature_change_candidate']);
    }
    const respawn = boundaryDirection(
        previous.respawnBoundary,
        current.respawnBoundary,
        'positive_to_non_positive_respawn_boundary_candidate',
        'non_positive_to_positive_respawn_boundary_candidate'
    );
    if (respawn) transitions.push(['respawnBoundary', respawn]);
    else if (previous.respawnSignature !== null && current.respawnSignature !== null
        && previous.respawnSignature !== current.respawnSignature) {
        transitions.push(['respawnBoundary', 'respawn_signature_change_candidate_unknown_direction']);
    }
    return transitions;
}

function recordObserved(aggregate, participantSeedValue, family, scope, second, direction) {
    aggregate.observed.push({ participantSeed: participantSeedValue, family, scope, second, direction });
}

function observeControllerSignals(player, aggregate, normalizedElapsedSecond) {
    const controllers = player.getDemo().getEntitiesByClassName(CONTROLLER_CLASS);
    let fallbackOrdinal = 0;
    for (const controller of controllers) {
        fallbackOrdinal += 1;
        const seed = participantSeed(controller, fallbackOrdinal);
        aggregate.participantSeeds.add(seed);
        const rawPawnLink = readFirstField(controller, ['m_hPawn', 'm_hAssignedHero', 'm_hHeroPawn']);
        const pawn = linkedPawn(player, rawPawnLink);
        const state = {
            controller: scopeState(controller),
            linked_pawn: scopeState(pawn),
            pawnPresent: pawn !== null,
            pawnIdentity: pawn === null ? null : normalizeValue(rawPawnLink)
        };
        const previous = aggregate.previousBySeed.get(seed);
        if (previous) {
            for (const scope of ['controller', 'linked_pawn']) {
                for (const [family, direction] of scopeTransitions(previous[scope], state[scope])) {
                    recordObserved(aggregate, seed, family, scope, normalizedElapsedSecond, direction);
                }
            }
            let pawnDirection = null;
            if (previous.pawnPresent && !state.pawnPresent) pawnDirection = 'pawn_link_present_to_absent_candidate';
            else if (!previous.pawnPresent && state.pawnPresent) pawnDirection = 'pawn_link_absent_to_present_candidate';
            else if (previous.pawnPresent && state.pawnPresent && previous.pawnIdentity !== state.pawnIdentity) {
                pawnDirection = 'pawn_link_changed_candidate';
            }
            if (pawnDirection) recordObserved(aggregate, seed, 'pawnLink', 'controller', normalizedElapsedSecond, pawnDirection);
        }
        aggregate.previousBySeed.set(seed, state);
    }
    return controllers.length;
}

function stableSorted(values) {
    return [...values].sort((left, right) => {
        const leftNumber = Number(left);
        const rightNumber = Number(right);
        if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) return leftNumber - rightNumber;
        return String(left).localeCompare(String(right));
    });
}

function duplicateCount(values) {
    const seen = new Set();
    let duplicates = 0;
    for (const value of values) {
        if (seen.has(value)) duplicates += 1;
        seen.add(value);
    }
    return duplicates;
}

function sixDigit(index) {
    return String(index).padStart(6, '0');
}

function twoDigit(index) {
    return String(index).padStart(2, '0');
}

function collapseObservedTransitions(observed, seedToParticipant) {
    const grouped = new Map();
    let mappingFailures = 0;
    for (const candidate of observed) {
        const participantKey = seedToParticipant.get(candidate.participantSeed);
        if (!participantKey) {
            mappingFailures += 1;
            continue;
        }
        const key = `${participantKey}\u0000${candidate.family}\u0000${candidate.second}`;
        if (!grouped.has(key)) grouped.set(key, { participantKey, family: candidate.family, second: candidate.second, directions: new Set(), scopes: new Set() });
        const row = grouped.get(key);
        row.directions.add(candidate.direction);
        row.scopes.add(candidate.scope);
    }
    const transitions = [...grouped.values()].map(row => ({
        participantKey: row.participantKey,
        family: row.family,
        second: row.second,
        direction: row.directions.size === 1 ? [...row.directions][0] : AMBIGUOUS_TRANSITION[row.family],
        scope: row.scopes.size === 1 ? [...row.scopes][0] : 'controller_and_linked_pawn'
    })).sort((left, right) => left.second - right.second
        || left.participantKey.localeCompare(right.participantKey)
        || left.family.localeCompare(right.family)
        || left.direction.localeCompare(right.direction));
    transitions.forEach((transition, index) => {
        transition.observedTransitionKey = `directional_transition_${sixDigit(index + 1)}`;
    });
    return { transitions, mappingFailures };
}

function forbiddenReplayReasons(replay) {
    const replayId = String(replay?.replayId ?? '');
    const paths = [
        replay?.localPath,
        replay?.participantIdentityArtifactPath,
        replay?.lifeStateTransitionArtifactPath,
        replay?.deathEventCandidateArtifactPath,
        replay?.corroborationEvidenceArtifactPath
    ];
    const reasons = [];
    if (FORBIDDEN_REPLAY_IDS.has(replayId)) reasons.push(`forbidden replay id ${replayId}`);
    for (const candidate of paths) {
        const normalized = slash(candidate ?? '').toLowerCase();
        if (/(^|[/_.-])replay[_-]?00[5-8]([/_.-]|$)/u.test(normalized)) reasons.push(`forbidden replay path ${candidate}`);
    }
    return reasons;
}

function expandedManifestReplays(manifest) {
    if (Array.isArray(manifest?.replays)) return manifest.replays;
    if (!Array.isArray(manifest?.replayIds)) return [];
    return manifest.replayIds.map(replayId => ({
        replayId,
        localPath: ['replay_001', 'replay_002', 'replay_003', 'replay_004'].includes(replayId)
            ? `samples/partida_${replayId.slice(-3)}.dem`
            : replayId === 'replay_009'
                ? 'samples/replay_009_normal.dem'
                : `.local/deadem/replays/inbox/partida_${replayId.slice(-3)}.dem`,
        participantIdentityArtifactPath: `output/local-replay-processing/participant-identity-compact/task180-bounded32/artifacts/${replayId}/participant_identity.json`,
        lifeStateTransitionArtifactPath: `output/local-replay-processing/life-state-transition-candidates/task182-bounded32/artifacts/${replayId}/life_state_transition_candidates.json`,
        deathEventCandidateArtifactPath: `output/local-replay-processing/death-event-candidates/task183-bounded32/artifacts/${replayId}/death_event_candidates.json`,
        corroborationEvidenceArtifactPath: `output/local-replay-processing/death-event-corroboration-evidence/task184-bounded32/artifacts/${replayId}/death_event_corroboration_evidence.json`
    }));
}

export function validateDirectionalCycleManifestShape(manifest) {
    if (manifest?.version !== 1) throw new Error('manifest version must be 1');
    if (!RUN_GATES[manifest?.runKind]) throw new Error(`unsupported runKind ${manifest?.runKind}`);
    if (manifest?.mode !== MODE) throw new Error(`manifest mode must be ${MODE}`);
    if (manifest?.artifactClass !== ARTIFACT_CLASS) throw new Error(`manifest artifactClass must be ${ARTIFACT_CLASS}`);
    if (manifest?.samplingPolicy?.normalizedIntervalSeconds !== 1) throw new Error('sampling interval must be one normalized second');
    if (manifest?.temporalPolicy?.anchorWindowBeforeSeconds !== 2
        || manifest?.temporalPolicy?.anchorWindowAfterSeconds !== 2
        || manifest?.temporalPolicy?.laterCycleAfterSecondsExclusive !== 0
        || manifest?.temporalPolicy?.laterCycleMaxSecondsInclusive !== 180) {
        throw new Error('manifest temporal policy must preserve the predeclared Task 185 windows');
    }
    const manifestReplays = expandedManifestReplays(manifest);
    if (manifestReplays.length === 0) throw new Error('manifest replays must be non-empty');
    const expectedReplayCount = manifest.runKind === 'task185-pilot' ? 4 : 32;
    if (manifestReplays.length !== expectedReplayCount) throw new Error(`${manifest.runKind} must contain ${expectedReplayCount} replays`);
    const replayIds = manifestReplays.map(replay => replay.replayId);
    if (duplicateCount(replayIds) !== 0) throw new Error('manifest replay ids must be unique');
    const reasons = manifestReplays.flatMap(forbiddenReplayReasons);
    if (reasons.length > 0) throw new Error(reasons.join('; '));
    for (const replay of manifestReplays) {
        if (!/^replay_[0-9]{3}$/u.test(replay.replayId)) throw new Error(`invalid replay id ${replay.replayId}`);
        for (const field of [
            'localPath', 'participantIdentityArtifactPath', 'lifeStateTransitionArtifactPath',
            'deathEventCandidateArtifactPath', 'corroborationEvidenceArtifactPath'
        ]) assertRelativeRepositoryPath(replay[field], `${replay.replayId}.${field}`);
        if (!slash(replay.localPath).toLowerCase().endsWith('.dem')) throw new Error(`${replay.replayId}.localPath must be a replay file`);
    }
    return true;
}

export function validateDirectionalCycleOutputRoot(summaryOutput, manifest) {
    const normalized = `${assertRelativeRepositoryPath(summaryOutput, 'summary-output').replace(/\/?$/u, '')}/`;
    const expected = `${OUTPUT_ROOT_PREFIX}${manifest.runKind}/`;
    if (normalized !== expected) throw new Error(`summary-output must be exactly ${expected}`);
    return { normalized, absolutePath: path.resolve(REPO_ROOT, normalized) };
}

export function buildDirectionalCyclePlan(manifest) {
    validateDirectionalCycleManifestShape(manifest);
    return expandedManifestReplays(manifest).map(replay => ({
        replayId: replay.replayId,
        localPath: slash(replay.localPath),
        absolutePath: path.resolve(REPO_ROOT, replay.localPath),
        participantIdentityArtifactPath: slash(replay.participantIdentityArtifactPath),
        lifeStateTransitionArtifactPath: slash(replay.lifeStateTransitionArtifactPath),
        deathEventCandidateArtifactPath: slash(replay.deathEventCandidateArtifactPath),
        corroborationEvidenceArtifactPath: slash(replay.corroborationEvidenceArtifactPath)
    }));
}

function rate(numerator, denominator) {
    return denominator === 0 ? 0 : Number((numerator / denominator).toFixed(6));
}

function defaultTransitions() {
    return { ...NO_TRANSITION };
}

function defaultDeltas() {
    return Object.fromEntries(FAMILY_KEYS.map(family => [family, null]));
}

function transitionIsPositive(family, direction) {
    return direction !== NO_TRANSITION[family] && direction !== 'boundary_transition_ambiguous';
}

function inverseMatches(family, anchorDirection, laterDirection) {
    if (family === 'healthBoundary') {
        return (anchorDirection === 'positive_to_non_positive_boundary_candidate'
            && laterDirection === 'non_positive_to_positive_boundary_candidate')
            || (anchorDirection === 'non_positive_to_positive_boundary_candidate'
                && laterDirection === 'positive_to_non_positive_boundary_candidate');
    }
    if (family === 'booleanAlive') {
        return (anchorDirection === 'boolean_true_to_false_candidate'
            && laterDirection === 'boolean_false_to_true_candidate')
            || (anchorDirection === 'boolean_false_to_true_candidate'
                && laterDirection === 'boolean_true_to_false_candidate');
    }
    if (family === 'lifeStateSignature') {
        return anchorDirection === 'life_state_signature_change_candidate'
            && laterDirection === 'life_state_signature_change_candidate';
    }
    if (family === 'respawnBoundary') {
        return (anchorDirection === 'non_positive_to_positive_respawn_boundary_candidate'
            && laterDirection === 'positive_to_non_positive_respawn_boundary_candidate')
            || (anchorDirection === 'positive_to_non_positive_respawn_boundary_candidate'
                && laterDirection === 'non_positive_to_positive_respawn_boundary_candidate');
    }
    if (family === 'pawnLink') {
        return (anchorDirection === 'pawn_link_present_to_absent_candidate'
            && laterDirection === 'pawn_link_absent_to_present_candidate')
            || (anchorDirection === 'pawn_link_absent_to_present_candidate'
                && laterDirection === 'pawn_link_present_to_absent_candidate')
            || (anchorDirection === 'pawn_link_changed_candidate'
                && ['pawn_link_changed_candidate', 'pawn_link_absent_to_present_candidate'].includes(laterDirection));
    }
    return false;
}

function matchesAnchorIdentity(anchor, row) {
    return anchor.eventCandidateKey === row.eventCandidateKey
        && anchor.sourceTransitionKey === row.sourceTransitionKey
        && anchor.participantKey === row.participantKey
        && anchor.heroRefKey === row.heroRefKey
        && anchor.teamRefKey === row.teamRefKey
        && anchor.normalizedElapsedSecond === row.normalizedElapsedSecond;
}

function bridgeSourceArtifacts(participantIdentity, lifeStateTransitions, deathEventCandidates, corroborationEvidence) {
    const participants = new Set(participantIdentity.participants.map(row => row.participantKey));
    const sourceTransitions = new Map(lifeStateTransitions.transitionCandidates.map(row => [row.transitionKey, row]));
    const anchors = deathEventCandidates.candidates;
    const corroborationRows = new Map(corroborationEvidence.evidenceRows.map(row => [row.eventCandidateKey, row]));
    let participantMappingFailures = 0;
    let task183AnchorBridgeFailures = 0;
    let task184ContextBridgeFailures = 0;
    for (const anchor of anchors) {
        if (!participants.has(anchor.participantKey)) participantMappingFailures += 1;
        const transition = sourceTransitions.get(anchor.sourceTransitionKey);
        if (!transition
            || transition.participantKey !== anchor.participantKey
            || transition.normalizedElapsedSecond !== anchor.normalizedElapsedSecond) task183AnchorBridgeFailures += 1;
        const context = corroborationRows.get(anchor.eventCandidateKey);
        if (!context || !matchesAnchorIdentity(anchor, context)) task184ContextBridgeFailures += 1;
    }
    return { participantMappingFailures, task183AnchorBridgeFailures, task184ContextBridgeFailures };
}

function selectAnchorCandidate(anchor, family, transitions, used) {
    const eligible = transitions.filter(candidate => !used.has(candidate.observedTransitionKey)
        && candidate.participantKey === anchor.participantKey
        && candidate.family === family
        && candidate.second >= anchor.normalizedElapsedSecond - 2
        && candidate.second <= anchor.normalizedElapsedSecond + 2
        && transitionIsPositive(family, candidate.direction));
    eligible.sort((left, right) => Math.abs(left.second - anchor.normalizedElapsedSecond) - Math.abs(right.second - anchor.normalizedElapsedSecond)
        || left.second - right.second
        || left.observedTransitionKey.localeCompare(right.observedTransitionKey));
    if (eligible.length === 0) return { candidate: null, ambiguous: false };
    const minimumDistance = Math.abs(eligible[0].second - anchor.normalizedElapsedSecond);
    const tied = eligible.filter(candidate => Math.abs(candidate.second - anchor.normalizedElapsedSecond) === minimumDistance);
    if (tied.length > 1) return { candidate: null, ambiguous: true };
    return { candidate: eligible[0], ambiguous: false };
}

function selectLaterCandidate(anchor, anchorCandidate, transitions, used) {
    const minimumSecond = Math.max(anchor.normalizedElapsedSecond, anchorCandidate.second);
    return transitions.filter(candidate => !used.has(candidate.observedTransitionKey)
        && candidate.participantKey === anchor.participantKey
        && candidate.family === anchorCandidate.family
        && candidate.second > minimumSecond
        && candidate.second - anchor.normalizedElapsedSecond <= 180
        && inverseMatches(anchorCandidate.family, anchorCandidate.direction, candidate.direction))
        .sort((left, right) => left.second - right.second
            || left.observedTransitionKey.localeCompare(right.observedTransitionKey))[0] ?? null;
}

function outsideAllAnchorWindows(transition, anchors) {
    return !anchors.some(anchor => anchor.participantKey === transition.participantKey
        && transition.second >= anchor.normalizedElapsedSecond - 2
        && transition.second <= anchor.normalizedElapsedSecond + 2);
}

function evidenceClass(row) {
    if (row.anchorAssociationAmbiguous) return 'ambiguous';
    if (row.distinctCompleteCycleFamilyCount >= 2) return 'anchor_with_multiple_complete_cycle_families';
    if (row.distinctCompleteCycleFamilyCount === 1) return 'anchor_with_single_complete_cycle_family';
    if (row.laterCycleWindowCensoredByReplayEnd) return 'anchor_with_censored_later_window';
    if (row.distinctAnchorSideSourceFamilyCount >= 2) return 'anchor_with_multiple_directional_families';
    if (row.distinctAnchorSideSourceFamilyCount === 1) return 'anchor_with_single_directional_family';
    return 'counter_anchor_only';
}

function coverageLevel({ multiFamilyRate, uncensoredCompleteCycleCoverageRate, unanchoredPatternRate, anchorAlignmentRate, ambiguousAnchors, anchorCount, technicalIntegrityPassed }) {
    const strong = technicalIntegrityPassed
        && multiFamilyRate >= 0.95
        && uncensoredCompleteCycleCoverageRate >= 0.90
        && unanchoredPatternRate <= 0.05;
    if (strong) return 'strong';
    const dominated = rate(ambiguousAnchors, anchorCount) >= 0.5 || unanchoredPatternRate > 0.5;
    if (!dominated && (anchorAlignmentRate >= 0.75 || uncensoredCompleteCycleCoverageRate >= 0.60)) return 'partial';
    return 'insufficient';
}

export function createDirectionalCycleArtifact({
    replayId,
    participantIdentity,
    lifeStateTransitions,
    deathEventCandidates,
    corroborationEvidence,
    observedTransitions,
    replayEndSecond,
    observationMappingFailures = 0
}) {
    if (participantIdentity.replayId !== replayId
        || lifeStateTransitions.replayId !== replayId
        || deathEventCandidates.replayId !== replayId
        || corroborationEvidence.replayId !== replayId) throw new Error(`${replayId}: source replay ids do not agree`);
    const anchors = [...deathEventCandidates.candidates].sort((left, right) => left.normalizedElapsedSecond - right.normalizedElapsedSecond
        || left.eventCandidateKey.localeCompare(right.eventCandidateKey));
    const bridges = bridgeSourceArtifacts(participantIdentity, lifeStateTransitions, deathEventCandidates, corroborationEvidence);
    const used = new Set();
    const usageRole = new Map();
    const completeCycleTransitionKeys = new Set();
    const states = anchors.map(anchor => ({ anchor, anchorMatches: new Map(), laterMatches: new Map(), ambiguousFamilies: new Set() }));

    for (const state of states) {
        for (const family of FAMILY_KEYS) {
            const selected = selectAnchorCandidate(state.anchor, family, observedTransitions, used);
            if (selected.ambiguous) state.ambiguousFamilies.add(family);
            if (selected.candidate) {
                state.anchorMatches.set(family, selected.candidate);
                used.add(selected.candidate.observedTransitionKey);
                usageRole.set(selected.candidate.observedTransitionKey, 'anchor');
            }
        }
    }
    for (const state of states) {
        for (const [family, anchorCandidate] of state.anchorMatches) {
            const later = selectLaterCandidate(state.anchor, anchorCandidate, observedTransitions, used);
            if (later) {
                state.laterMatches.set(family, later);
                used.add(later.observedTransitionKey);
                usageRole.set(later.observedTransitionKey, 'anchored_complete_cycle');
                completeCycleTransitionKeys.add(anchorCandidate.observedTransitionKey);
                completeCycleTransitionKeys.add(later.observedTransitionKey);
            }
        }
    }

    const anchoredSignatures = new Set();
    for (const state of states) {
        for (const [family, candidate] of state.anchorMatches) anchoredSignatures.add(`${family}\u0000${candidate.direction}`);
    }
    const outsideTransitions = observedTransitions.filter(transition => outsideAllAnchorWindows(transition, anchors));
    const unanchoredDirectionalPatterns = outsideTransitions.filter(transition => anchoredSignatures.has(`${transition.family}\u0000${transition.direction}`)).length;
    let unanchoredCompleteCycles = 0;
    for (const first of outsideTransitions) {
        if (used.has(first.observedTransitionKey) || !anchoredSignatures.has(`${first.family}\u0000${first.direction}`)) continue;
        const second = outsideTransitions.find(candidate => !used.has(candidate.observedTransitionKey)
            && candidate.participantKey === first.participantKey
            && candidate.family === first.family
            && candidate.second > first.second
            && candidate.second - first.second <= 180
            && inverseMatches(first.family, first.direction, candidate.direction));
        if (!second) continue;
        used.add(first.observedTransitionKey);
        used.add(second.observedTransitionKey);
        usageRole.set(first.observedTransitionKey, 'unanchored_complete_cycle');
        usageRole.set(second.observedTransitionKey, 'unanchored_complete_cycle');
        completeCycleTransitionKeys.add(first.observedTransitionKey);
        completeCycleTransitionKeys.add(second.observedTransitionKey);
        unanchoredCompleteCycles += 1;
    }

    const evidenceRows = states.map((state, index) => {
        const anchorSideTransitions = defaultTransitions();
        const anchorSideNormalizedDeltaSeconds = defaultDeltas();
        const laterCycleTransitions = defaultTransitions();
        const laterCycleNormalizedDeltaSeconds = defaultDeltas();
        for (const [family, candidate] of state.anchorMatches) {
            anchorSideTransitions[family] = candidate.direction;
            anchorSideNormalizedDeltaSeconds[family] = candidate.second - state.anchor.normalizedElapsedSecond;
        }
        for (const [family, candidate] of state.laterMatches) {
            laterCycleTransitions[family] = candidate.direction;
            laterCycleNormalizedDeltaSeconds[family] = candidate.second - state.anchor.normalizedElapsedSecond;
        }
        const row = {
            cycleEvidenceKey: `directional_cycle_evidence_${sixDigit(index + 1)}`,
            eventCandidateKey: state.anchor.eventCandidateKey,
            sourceTransitionKey: state.anchor.sourceTransitionKey,
            participantKey: state.anchor.participantKey,
            heroRefKey: state.anchor.heroRefKey,
            teamRefKey: state.anchor.teamRefKey,
            normalizedElapsedSecond: state.anchor.normalizedElapsedSecond,
            anchorSideTransitions,
            anchorSideNormalizedDeltaSeconds,
            laterCycleTransitions,
            laterCycleNormalizedDeltaSeconds,
            distinctAnchorSideSourceFamilyCount: state.anchorMatches.size,
            distinctCompleteCycleFamilyCount: state.laterMatches.size,
            anchorAssociationAmbiguous: state.ambiguousFamilies.size > 0,
            laterCycleWindowCensoredByReplayEnd: replayEndSecond < state.anchor.normalizedElapsedSecond + 180,
            evidenceClass: '',
            truthStatus: 'unconfirmed_candidate',
            finalFact: false
        };
        row.evidenceClass = evidenceClass(row);
        return row;
    });

    const anchorsWithDirectionalEvidence = evidenceRows.filter(row => row.distinctAnchorSideSourceFamilyCount > 0).length;
    const anchorsWithMultipleDirectionalFamilies = evidenceRows.filter(row => row.distinctAnchorSideSourceFamilyCount >= 2).length;
    const anchorsWithCompleteCycle = evidenceRows.filter(row => row.distinctCompleteCycleFamilyCount > 0).length;
    const ambiguousAnchors = evidenceRows.filter(row => row.anchorAssociationAmbiguous).length;
    const censoredAnchors = evidenceRows.filter(row => row.laterCycleWindowCensoredByReplayEnd).length;
    const uncensoredRows = evidenceRows.filter(row => !row.laterCycleWindowCensoredByReplayEnd);
    const uncensoredCompleteCycles = uncensoredRows.filter(row => row.distinctCompleteCycleFamilyCount > 0).length;
    const anchorFamilyOccurrences = evidenceRows.reduce((sum, row) => sum + row.distinctAnchorSideSourceFamilyCount, 0);
    const anchorAlignmentRate = rate(anchorsWithDirectionalEvidence, anchors.length);
    const unanchoredPatternRate = rate(unanchoredDirectionalPatterns, anchorFamilyOccurrences + unanchoredDirectionalPatterns);
    const completeCycleCoverageRate = rate(anchorsWithCompleteCycle, anchors.length);
    const uncensoredCompleteCycleCoverageRate = rate(uncensoredCompleteCycles, uncensoredRows.length);
    const technicalIntegrityPassed = observationMappingFailures === 0
        && bridges.participantMappingFailures === 0
        && bridges.task183AnchorBridgeFailures === 0
        && bridges.task184ContextBridgeFailures === 0;
    const directionalCycleCoverageLevel = coverageLevel({
        multiFamilyRate: rate(anchorsWithMultipleDirectionalFamilies, anchors.length),
        uncensoredCompleteCycleCoverageRate,
        unanchoredPatternRate,
        anchorAlignmentRate,
        ambiguousAnchors,
        anchorCount: anchors.length,
        technicalIntegrityPassed
    });
    const sourceFamilyAudit = [];
    for (const family of FAMILY_KEYS) {
        for (const scope of ['controller', 'linked_pawn', 'controller_and_linked_pawn']) {
            const scoped = observedTransitions.filter(transition => transition.family === family && transition.scope === scope);
            if (scoped.length === 0) continue;
            sourceFamilyAudit.push({
                sourceFamily: family,
                scope,
                observedDirectionalTransitionCount: scoped.length,
                anchorAssociatedTransitionCount: scoped.filter(transition => usageRole.get(transition.observedTransitionKey) === 'anchor').length,
                completeCycleTransitionCount: scoped.filter(transition => completeCycleTransitionKeys.has(transition.observedTransitionKey)).length,
                unmatchedTransitionCount: scoped.filter(transition => !used.has(transition.observedTransitionKey)).length
            });
        }
    }
    const summary = {
        anchorsWithDirectionalEvidence,
        anchorsWithMultipleDirectionalFamilies,
        anchorsWithCompleteCycle,
        anchorsWithoutDirectionalEvidence: anchors.length - anchorsWithDirectionalEvidence,
        ambiguousAnchors,
        censoredAnchors,
        unanchoredDirectionalPatterns,
        unanchoredCompleteCycles,
        unmatchedDirectionalTransitions: observedTransitions.filter(transition => !used.has(transition.observedTransitionKey)).length,
        duplicateEvidenceKeyCount: duplicateCount(evidenceRows.map(row => row.cycleEvidenceKey)),
        unmappedParticipantAnchors: bridges.participantMappingFailures,
        sourceTransitionReuseCount: 0,
        anchorAlignmentRate,
        unanchoredPatternRate,
        completeCycleCoverageRate,
        uncensoredCompleteCycleCoverageRate,
        directionalCycleCoverageLevel
    };
    return {
        artifact: {
            schemaVersion: 1,
            replayId,
            artifactClass: ARTIFACT_CLASS,
            sourceMethod: 'replay_sourced_directional_cycle_and_negative_control_observation',
            generatedBy: GENERATED_BY,
            generatedAt: GENERATED_AT,
            rawDataCaptured: false,
            fieldValuesCaptured: false,
            rawFieldNamesIncludedInRows: false,
            rawIdsIncluded: false,
            rawTicksIncluded: false,
            rawTimestampsIncluded: false,
            finalFactsProduced: false,
            gameplayInterpretationProduced: false,
            attributionEmitted: false,
            participantIdentityArtifactFound: true,
            lifeStateTransitionArtifactFound: true,
            deathEventCandidateArtifactFound: true,
            corroborationEvidenceArtifactFound: true,
            anchorCount: anchors.length,
            evidenceRowCount: evidenceRows.length,
            evidenceRows,
            summary,
            task184Context: {
                corroborationCoverageLevel: corroborationEvidence.summary.confirmationEvidenceLevel,
                contextOnly: true,
                booleansOrCountsCopiedAsDirectionalEvidence: false
            },
            temporalPolicy: {
                anchorWindowBeforeSeconds: 2,
                anchorWindowAfterSeconds: 2,
                laterCycleAfterSecondsExclusive: 0,
                laterCycleMaxSecondsInclusive: 180
            },
            readiness: {
                directionalSignalEvidenceAvailable: true,
                cycleEvidenceMeasurable: true,
                negativeControlEvidenceAvailable: true,
                candidateLevelDirectionalCycleConsumptionAvailable: true,
                readyForFinalDeathSemanticContractDesign: directionalCycleCoverageLevel === 'strong',
                readyForFinalDeathFacts: false,
                readyForConfirmedWhoDied: false,
                readyForAttribution: false,
                readyForKillerVictim: false,
                readyForTeamfightDetection: false,
                readyForGameplayInterpretation: false
            },
            limitations: [
                'Directional transitions are abstract replay observations, not proven death or respawn semantics.',
                'Task 183 counters remain temporal anchors and Task 184 remains contextual coverage evidence only.',
                'No row identifies who died, a killer, a victim, an assist, attribution, or a final gameplay fact.',
                'Replay-end-censored windows are not treated as failed semantic cycles.'
            ]
        },
        audit: {
            ...bridges,
            observationMappingFailures,
            observedDirectionalTransitionCount: observedTransitions.length,
            usedDirectionalTransitionCount: used.size,
            sourceTransitionReuseCount: 0,
            sourceFamilyAudit,
            anchoredDirectionalFamilyOccurrenceCount: anchorFamilyOccurrences,
            uncensoredAnchorCount: uncensoredRows.length,
            uncensoredCompleteCycleAnchorCount: uncensoredCompleteCycles
        }
    };
}

function collectForbiddenOutputKeys(value, currentPath = '$', found = []) {
    if (Array.isArray(value)) {
        value.forEach((entry, index) => collectForbiddenOutputKeys(entry, `${currentPath}[${index}]`, found));
        return found;
    }
    if (!value || typeof value !== 'object') return found;
    for (const [key, entry] of Object.entries(value)) {
        const nextPath = `${currentPath}.${key}`;
        if (FORBIDDEN_OUTPUT_KEYS.has(key)) found.push(nextPath);
        collectForbiddenOutputKeys(entry, nextPath, found);
    }
    return found;
}

export function validateDirectionalCycleArtifact(artifact, schema) {
    const schemaResult = validateJsonSchema(schema, artifact);
    const errors = schemaResult.errors.map(error => `JSON Schema: ${error}`);
    if (artifact.anchorCount !== artifact.evidenceRows?.length) errors.push('anchorCount must equal evidenceRows length');
    if (artifact.evidenceRowCount !== artifact.evidenceRows?.length) errors.push('evidenceRowCount must equal evidenceRows length');
    for (const [index, row] of (artifact.evidenceRows ?? []).entries()) {
        const anchorFamilyCount = FAMILY_KEYS.filter(family => row.anchorSideTransitions[family] !== NO_TRANSITION[family]).length;
        const laterFamilyCount = FAMILY_KEYS.filter(family => row.laterCycleTransitions[family] !== NO_TRANSITION[family]).length;
        if (row.distinctAnchorSideSourceFamilyCount !== anchorFamilyCount) errors.push(`evidenceRows[${index}] anchor-side family count mismatch`);
        if (row.distinctCompleteCycleFamilyCount !== laterFamilyCount) errors.push(`evidenceRows[${index}] complete-cycle family count mismatch`);
        for (const family of FAMILY_KEYS) {
            const anchorObserved = row.anchorSideTransitions[family] !== NO_TRANSITION[family];
            const laterObserved = row.laterCycleTransitions[family] !== NO_TRANSITION[family];
            if (anchorObserved !== (row.anchorSideNormalizedDeltaSeconds[family] !== null)) errors.push(`evidenceRows[${index}] ${family} anchor delta mismatch`);
            if (laterObserved !== (row.laterCycleNormalizedDeltaSeconds[family] !== null)) errors.push(`evidenceRows[${index}] ${family} later delta mismatch`);
        }
    }
    errors.push(...collectForbiddenOutputKeys(artifact).map(key => `forbidden key ${key}`));
    return [...new Set(errors)];
}

export function auditDirectionalCyclePolicy(artifact) {
    const forbiddenKeyPaths = collectForbiddenOutputKeys(artifact);
    const rowViolations = [];
    for (const [index, row] of artifact.evidenceRows.entries()) {
        if (row.finalFact !== false) rowViolations.push(`evidenceRows[${index}].finalFact must be false`);
        if (row.truthStatus !== 'unconfirmed_candidate') rowViolations.push(`evidenceRows[${index}].truthStatus must remain unconfirmed_candidate`);
    }
    return {
        replayId: artifact.replayId,
        outputPolicyStatus: forbiddenKeyPaths.length === 0 && rowViolations.length === 0 ? 'passed' : 'failed',
        forbiddenKeyPaths,
        rowViolations
    };
}

async function loadSourceArtifacts(input) {
    const participantIdentity = await readJson(input.participantIdentityArtifactPath);
    const lifeStateTransitions = await readJson(input.lifeStateTransitionArtifactPath);
    const deathEventCandidates = await readJson(input.deathEventCandidateArtifactPath);
    const corroborationEvidence = await readJson(input.corroborationEvidenceArtifactPath);
    if (participantIdentity.replayId !== input.replayId || participantIdentity.artifactClass !== 'participant_identity'
        || participantIdentity.generatedAt !== 'task_180') throw new Error(`${input.replayId} Task 180 artifact mismatch`);
    if (lifeStateTransitions.replayId !== input.replayId || lifeStateTransitions.artifactClass !== 'life_state_transition_candidates'
        || lifeStateTransitions.generatedAt !== 'task_182') throw new Error(`${input.replayId} Task 182 artifact mismatch`);
    if (deathEventCandidates.replayId !== input.replayId || deathEventCandidates.artifactClass !== 'death_event_candidates'
        || deathEventCandidates.generatedAt !== 'task_183') throw new Error(`${input.replayId} Task 183 artifact mismatch`);
    if (corroborationEvidence.replayId !== input.replayId || corroborationEvidence.artifactClass !== 'death_event_corroboration_evidence'
        || corroborationEvidence.generatedAt !== 'task_184') throw new Error(`${input.replayId} Task 184 artifact mismatch`);
    if (!participantIdentity.participants?.length || !lifeStateTransitions.transitionCandidates?.length
        || !deathEventCandidates.candidates?.length || !corroborationEvidence.evidenceRows?.length) {
        throw new Error(`${input.replayId} required source rows are missing`);
    }
    return { participantIdentity, lifeStateTransitions, deathEventCandidates, corroborationEvidence };
}

function mapObservedTransitions(aggregate, participantIdentity) {
    const seeds = stableSorted(aggregate.participantSeeds);
    const participants = [...participantIdentity.participants].sort((left, right) => left.participantKey.localeCompare(right.participantKey));
    const seedToParticipant = new Map();
    seeds.forEach((seed, index) => seedToParticipant.set(seed, participants[index]?.participantKey ?? null));
    const collapsed = collapseObservedTransitions(aggregate.observed, seedToParticipant);
    return {
        transitions: collapsed.transitions,
        observedParticipantSeedCount: seeds.length,
        participantIdentityCount: participants.length,
        observationMappingFailures: collapsed.mappingFailures,
        participantMappingStatus: seeds.length === participants.length && collapsed.mappingFailures === 0 ? 'passed' : 'failed'
    };
}

async function runReplayObservation(input, schema) {
    const player = new Player(undefined, Logger.NOOP);
    const started = performance.now();
    const summary = {
        replayId: input.replayId,
        parserLoadSucceeded: false,
        parseCompleted: false,
        reachedEnd: false,
        samplesAttempted: 0,
        samplesWithControllers: 0,
        status: 'not_started',
        errorMessage: null
    };
    try {
        const sources = await loadSourceArtifacts(input);
        const aggregate = { participantSeeds: new Set(), previousBySeed: new Map(), observed: [] };
        await player.load(createReadStream(input.absolutePath));
        summary.parserLoadSucceeded = true;
        const firstTick = safeNumber(player.getFirstTick()) ?? safeNumber(player.getCurrentTick()) ?? 0;
        const tickRate = safeNumber(player.getDemo().server?.tickRate) ?? 30;
        let nextSampleTick = firstTick;
        let replayEndSecond = 0;
        while (true) {
            const currentTick = safeNumber(player.getCurrentTick());
            if (currentTick !== null) replayEndSecond = Math.max(0, Math.round((currentTick - firstTick) / Math.max(1, tickRate)));
            if (currentTick !== null && currentTick >= nextSampleTick) {
                summary.samplesAttempted += 1;
                if (observeControllerSignals(player, aggregate, replayEndSecond) > 0) summary.samplesWithControllers += 1;
                nextSampleTick = currentTick + Math.max(1, Math.round(tickRate));
            }
            const advanced = await player.nextTick();
            if (!advanced) {
                summary.parseCompleted = true;
                summary.reachedEnd = true;
                break;
            }
        }
        const mapping = mapObservedTransitions(aggregate, sources.participantIdentity);
        const created = createDirectionalCycleArtifact({
            replayId: input.replayId,
            ...sources,
            observedTransitions: mapping.transitions,
            replayEndSecond,
            observationMappingFailures: mapping.observationMappingFailures
        });
        const validationErrors = validateDirectionalCycleArtifact(created.artifact, schema);
        const policyAudit = auditDirectionalCyclePolicy(created.artifact);
        summary.status = validationErrors.length === 0 && policyAudit.outputPolicyStatus === 'passed' ? 'emitted' : 'blocked';
        summary.errorMessage = validationErrors.length === 0 ? null : validationErrors.join('; ');
        summary.durationMs = Math.round(performance.now() - started);
        summary.anchorCount = created.artifact.anchorCount;
        summary.evidenceRowCount = created.artifact.evidenceRowCount;
        summary.observedDirectionalTransitionCount = mapping.transitions.length;
        summary.anchorSideFamilyCoverageCount = created.artifact.summary.anchorsWithDirectionalEvidence;
        summary.completeCycleCoverageCount = created.artifact.summary.anchorsWithCompleteCycle;
        summary.censoredAnchorCount = created.artifact.summary.censoredAnchors;
        summary.ambiguousAnchorCount = created.artifact.summary.ambiguousAnchors;
        summary.unanchoredDirectionalPatternCount = created.artifact.summary.unanchoredDirectionalPatterns;
        summary.unanchoredCompleteCycleCount = created.artifact.summary.unanchoredCompleteCycles;
        summary.unmatchedDirectionalTransitionCount = created.artifact.summary.unmatchedDirectionalTransitions;
        summary.participantMappingStatus = mapping.participantMappingStatus;
        summary.schemaValidationStatus = validationErrors.length === 0 ? 'passed' : 'failed';
        summary.outputPolicyStatus = policyAudit.outputPolicyStatus;
        summary.directionalCycleCoverageLevel = created.artifact.summary.directionalCycleCoverageLevel;
        return { summary, artifact: created.artifact, audit: created.audit, mapping, policyAudit, validationErrors };
    } catch (error) {
        summary.status = 'blocked';
        summary.errorMessage = String(error?.message ?? error);
        summary.durationMs = Math.round(performance.now() - started);
        return { summary, artifact: null, audit: null, mapping: null, policyAudit: null, validationErrors: [summary.errorMessage] };
    } finally {
        await player.dispose?.().catch(() => {});
    }
}

async function task184CorrectionAudit() {
    const expectedCommit = '065d0fa0a1d422b3dcf342078100386e2ca7d793';
    const [completed, contributionIndex, contract, projectState] = await Promise.all([
        readFile(path.resolve(REPO_ROOT, 'tasks/completed/184-death-event-corroboration-evidence.md'), 'utf8'),
        readFile(path.resolve(REPO_ROOT, 'data/task-contribution-index.json'), 'utf8'),
        readFile(path.resolve(REPO_ROOT, 'docs/codex/DEATH_EVENT_CORROBORATION_EVIDENCE_CONTRACT.md'), 'utf8'),
        readFile(path.resolve(REPO_ROOT, 'docs/PROJECT_STATE.md'), 'utf8')
    ]);
    const checks = {
        completedTaskCommitRecorded: completed.includes(expectedCommit),
        contributionIndexCommitRecorded: contributionIndex.includes(`\"taskId\": \"184\"`) && contributionIndex.includes(`\"commitSha\": \"${expectedCommit}\"`),
        projectHistoryCommitRecorded: projectState.includes(expectedCommit),
        independenceBoundaryRecorded: contract.includes('statistical independence')
            && contract.includes('causal')
            && contract.includes('proven Source 2 gameplay semantics'),
        historicalCoverageMeaningRecorded: contract.includes('coverage strength only') && contract.includes('corroborationCoverageLevel')
    };
    return { schemaVersion: 1, expectedTask184Commit: expectedCommit, checks, status: Object.values(checks).every(Boolean) ? 'passed' : 'failed' };
}

async function writeRunAtomically(summaryRoot, files) {
    const temporaryRoot = `${summaryRoot.absolutePath.replace(/[\\/]$/u, '')}.tmp-task185`;
    await rm(temporaryRoot, { recursive: true, force: true });
    for (const file of files) await writeJson(path.join(temporaryRoot, file.relativePath), file.value);
    await rm(summaryRoot.absolutePath, { recursive: true, force: true });
    await mkdir(path.dirname(summaryRoot.absolutePath), { recursive: true });
    await rename(temporaryRoot, summaryRoot.absolutePath);
}

function aggregateCoverage(artifacts) {
    const anchorCount = artifacts.reduce((sum, artifact) => sum + artifact.anchorCount, 0);
    const anchorsWithDirectionalEvidence = artifacts.reduce((sum, artifact) => sum + artifact.summary.anchorsWithDirectionalEvidence, 0);
    const anchorsWithMultipleDirectionalFamilies = artifacts.reduce((sum, artifact) => sum + artifact.summary.anchorsWithMultipleDirectionalFamilies, 0);
    const anchorsWithCompleteCycle = artifacts.reduce((sum, artifact) => sum + artifact.summary.anchorsWithCompleteCycle, 0);
    const ambiguousAnchors = artifacts.reduce((sum, artifact) => sum + artifact.summary.ambiguousAnchors, 0);
    const censoredAnchors = artifacts.reduce((sum, artifact) => sum + artifact.summary.censoredAnchors, 0);
    const unanchoredDirectionalPatterns = artifacts.reduce((sum, artifact) => sum + artifact.summary.unanchoredDirectionalPatterns, 0);
    const unanchoredCompleteCycles = artifacts.reduce((sum, artifact) => sum + artifact.summary.unanchoredCompleteCycles, 0);
    const unmatchedDirectionalTransitions = artifacts.reduce((sum, artifact) => sum + artifact.summary.unmatchedDirectionalTransitions, 0);
    const anchorFamilyOccurrences = artifacts.reduce((sum, artifact) => sum
        + artifact.evidenceRows.reduce((rowSum, row) => rowSum + row.distinctAnchorSideSourceFamilyCount, 0), 0);
    const uncensoredAnchorCount = artifacts.reduce((sum, artifact) => sum
        + artifact.evidenceRows.filter(row => !row.laterCycleWindowCensoredByReplayEnd).length, 0);
    const uncensoredCompleteCycleAnchorCount = artifacts.reduce((sum, artifact) => sum
        + artifact.evidenceRows.filter(row => !row.laterCycleWindowCensoredByReplayEnd && row.distinctCompleteCycleFamilyCount > 0).length, 0);
    return {
        anchorCount,
        anchorsWithDirectionalEvidence,
        anchorsWithMultipleDirectionalFamilies,
        anchorsWithCompleteCycle,
        anchorsWithoutDirectionalEvidence: anchorCount - anchorsWithDirectionalEvidence,
        ambiguousAnchors,
        censoredAnchors,
        unanchoredDirectionalPatterns,
        unanchoredCompleteCycles,
        unmatchedDirectionalTransitions,
        anchorFamilyOccurrences,
        uncensoredAnchorCount,
        uncensoredCompleteCycleAnchorCount,
        anchorAlignmentRate: rate(anchorsWithDirectionalEvidence, anchorCount),
        multiFamilyAnchorRate: rate(anchorsWithMultipleDirectionalFamilies, anchorCount),
        completeCycleCoverageRate: rate(anchorsWithCompleteCycle, anchorCount),
        uncensoredCompleteCycleCoverageRate: rate(uncensoredCompleteCycleAnchorCount, uncensoredAnchorCount),
        unanchoredPatternRate: rate(unanchoredDirectionalPatterns, anchorFamilyOccurrences + unanchoredDirectionalPatterns)
    };
}

function buildRunFiles({ manifest, plan, replayResults, schema, correctionAudit }) {
    const gateConfig = RUN_GATES[manifest.runKind];
    const artifacts = replayResults.filter(result => result.artifact).map(result => result.artifact);
    const coverage = aggregateCoverage(artifacts);
    const expectedAnchorCount = EXPECTED_ANCHORS.get(manifest.runKind);
    const actualAnchorCount = artifacts.reduce((sum, artifact) => sum + artifact.anchorCount, 0);
    const artifactBytes = artifacts.map(artifact => ({ replayId: artifact.replayId, bytes: artifactSizeBytes(artifact) }));
    const requirements = {
        replayCountExact: replayResults.length === plan.length,
        parserCompletedAll: replayResults.length === plan.length && replayResults.every(result => result.summary.parseCompleted && result.summary.reachedEnd),
        anchorCountExact: actualAnchorCount === expectedAnchorCount,
        oneRowPerAnchor: artifacts.length === plan.length && artifacts.every(artifact => artifact.anchorCount === artifact.evidenceRowCount),
        participantMappingFailuresZero: replayResults.every(result => result.audit?.participantMappingFailures === 0
            && result.audit?.observationMappingFailures === 0 && result.mapping?.participantMappingStatus === 'passed'),
        duplicateEvidenceKeysZero: artifacts.every(artifact => artifact.summary.duplicateEvidenceKeyCount === 0),
        sourceTransitionReuseZero: artifacts.every(artifact => artifact.summary.sourceTransitionReuseCount === 0),
        task183AnchorBridgePassed: replayResults.every(result => result.audit?.task183AnchorBridgeFailures === 0),
        task184ContextBridgePassed: replayResults.every(result => result.audit?.task184ContextBridgeFailures === 0),
        schemaValidationPassed: replayResults.every(result => result.validationErrors?.length === 0),
        outputPolicyPassed: replayResults.every(result => result.policyAudit?.outputPolicyStatus === 'passed'),
        artifactSizePassed: artifactBytes.every(row => row.bytes <= MAX_ARTIFACT_BYTES),
        replayProtectionPassed: plan.every(input => forbiddenReplayReasons(input).length === 0),
        task184CommitDocumentationCorrectionPassed: correctionAudit.status === 'passed',
        finalFactsAndAttributionZero: artifacts.every(artifact => !artifact.finalFactsProduced && !artifact.attributionEmitted
            && artifact.evidenceRows.every(row => row.finalFact === false))
    };
    const technicalPassedBeforeRunSize = Object.values(requirements).every(Boolean);
    const directionalCycleCoverageLevel = coverageLevel({
        multiFamilyRate: coverage.multiFamilyAnchorRate,
        uncensoredCompleteCycleCoverageRate: coverage.uncensoredCompleteCycleCoverageRate,
        unanchoredPatternRate: coverage.unanchoredPatternRate,
        anchorAlignmentRate: coverage.anchorAlignmentRate,
        ambiguousAnchors: coverage.ambiguousAnchors,
        anchorCount: coverage.anchorCount,
        technicalIntegrityPassed: technicalPassedBeforeRunSize
    });
    const replayRows = replayResults.map(result => ({
        replayId: result.summary.replayId,
        anchorCount: result.summary.anchorCount ?? 0,
        anchorSideFamilyCoverageCount: result.summary.anchorSideFamilyCoverageCount ?? 0,
        completeCycleCoverageCount: result.summary.completeCycleCoverageCount ?? 0,
        censoredAnchorCount: result.summary.censoredAnchorCount ?? 0,
        ambiguousAnchorCount: result.summary.ambiguousAnchorCount ?? 0,
        unanchoredDirectionalPatternCount: result.summary.unanchoredDirectionalPatternCount ?? 0,
        unanchoredCompleteCycleCount: result.summary.unanchoredCompleteCycleCount ?? 0,
        unmatchedDirectionalTransitionCount: result.summary.unmatchedDirectionalTransitionCount ?? 0,
        mappingStatus: result.summary.participantMappingStatus ?? 'failed',
        parserStatus: result.summary.parseCompleted ? 'completed' : 'failed',
        directionalCycleCoverageLevel: result.summary.directionalCycleCoverageLevel ?? 'insufficient'
    }));
    const base = gateConfig.prefix;
    const files = artifacts.map(artifact => ({
        relativePath: `artifacts/${artifact.replayId}/death_event_directional_cycle_evidence.json`,
        value: artifact
    }));
    const audits = [
        { relativePath: `${base}-manifest.json`, value: manifest },
        { relativePath: `${base}-task184-commit-documentation-correction-audit.json`, value: correctionAudit },
        { relativePath: `${base}-parser-completion-audit.json`, value: { schemaVersion: 1, status: requirements.parserCompletedAll ? 'passed' : 'failed', rows: replayResults.map(result => result.summary) } },
        { relativePath: `${base}-replay-protection-audit.json`, value: { schemaVersion: 1, status: requirements.replayProtectionPassed ? 'passed' : 'failed', processedReplayIds: plan.map(input => input.replayId), replay005Accessed: false, botFixtures006To008Processed: false, outputReplaysUsed: false, parserBehaviorModified: false } },
        { relativePath: `${base}-task183-anchor-bridge-audit.json`, value: { schemaVersion: 1, status: requirements.task183AnchorBridgePassed ? 'passed' : 'failed', rows: replayResults.map(result => ({ replayId: result.summary.replayId, anchorCount: result.summary.anchorCount ?? 0, bridgeFailureCount: result.audit?.task183AnchorBridgeFailures ?? 1 })) } },
        { relativePath: `${base}-task184-contextual-bridge-audit.json`, value: { schemaVersion: 1, status: requirements.task184ContextBridgePassed ? 'passed' : 'failed', contextOnly: true, booleansOrCountsCopiedAsDirectionalEvidence: false, rows: replayResults.map(result => ({ replayId: result.summary.replayId, corroborationCoverageLevel: result.artifact?.task184Context.corroborationCoverageLevel ?? 'insufficient', bridgeFailureCount: result.audit?.task184ContextBridgeFailures ?? 1 })) } },
        { relativePath: `${base}-participant-mapping-audit.json`, value: { schemaVersion: 1, status: requirements.participantMappingFailuresZero ? 'passed' : 'failed', rows: replayResults.map(result => ({ replayId: result.summary.replayId, participantIdentityCount: result.mapping?.participantIdentityCount ?? 0, observedParticipantSeedCount: result.mapping?.observedParticipantSeedCount ?? 0, observationMappingFailureCount: result.mapping?.observationMappingFailures ?? 1, mappingStatus: result.mapping?.participantMappingStatus ?? 'failed' })) } },
        { relativePath: `${base}-source-family-separation-audit.json`, value: { schemaVersion: 1, status: requirements.sourceTransitionReuseZero ? 'passed' : 'failed', severalFieldsCombinedAsIndependentSignals: false, rows: replayResults.flatMap(result => (result.audit?.sourceFamilyAudit ?? []).map(row => ({ replayId: result.summary.replayId, ...row }))) } },
        { relativePath: `${base}-source-transition-reuse-audit.json`, value: { schemaVersion: 1, status: requirements.sourceTransitionReuseZero ? 'passed' : 'failed', sourceTransitionReuseCount: artifacts.reduce((sum, artifact) => sum + artifact.summary.sourceTransitionReuseCount, 0), transitionReusedAcrossAnchors: false, laterTransitionReusedAcrossAnchors: false } },
        { relativePath: `${base}-anchor-side-directionality-audit.json`, value: { schemaVersion: 1, status: technicalPassedBeforeRunSize ? 'passed' : 'failed', anchorWindowBeforeSeconds: 2, anchorWindowAfterSeconds: 2, anchorCount: coverage.anchorCount, anchorsWithDirectionalEvidence: coverage.anchorsWithDirectionalEvidence, anchorsWithMultipleDirectionalFamilies: coverage.anchorsWithMultipleDirectionalFamilies, anchorAlignmentRate: coverage.anchorAlignmentRate, multiFamilyAnchorRate: coverage.multiFamilyAnchorRate } },
        { relativePath: `${base}-later-inverse-cycle-audit.json`, value: { schemaVersion: 1, status: technicalPassedBeforeRunSize ? 'passed' : 'failed', laterCycleAfterSecondsExclusive: 0, laterCycleMaxSecondsInclusive: 180, anchorsWithCompleteCycle: coverage.anchorsWithCompleteCycle, completeCycleCoverageRate: coverage.completeCycleCoverageRate, uncensoredCompleteCycleCoverageRate: coverage.uncensoredCompleteCycleCoverageRate } },
        { relativePath: `${base}-replay-end-censoring-audit.json`, value: { schemaVersion: 1, status: technicalPassedBeforeRunSize ? 'passed' : 'failed', censoredAnchorCount: coverage.censoredAnchors, uncensoredAnchorCount: coverage.uncensoredAnchorCount, censoringTreatedAsFailedSemanticCycle: false } },
        { relativePath: `${base}-negative-control-audit.json`, value: { schemaVersion: 1, status: technicalPassedBeforeRunSize ? 'passed' : 'failed', anchorAlignedDirectionalPatternCount: coverage.anchorFamilyOccurrences, unanchoredEquivalentDirectionalPatternCount: coverage.unanchoredDirectionalPatterns, anchorAlignedCompleteCycleCount: coverage.anchorsWithCompleteCycle, unanchoredEquivalentCompleteCycleCount: coverage.unanchoredCompleteCycles, anchorWithoutDirectionalEvidenceCount: coverage.anchorsWithoutDirectionalEvidence, unmatchedDirectionalTransitionCount: coverage.unmatchedDirectionalTransitions, ambiguousAssociationCount: coverage.ambiguousAnchors, replayEndCensoredAnchorCount: coverage.censoredAnchors, anchorAlignmentRate: coverage.anchorAlignmentRate, unanchoredPatternRate: coverage.unanchoredPatternRate, completeCycleCoverageRate: coverage.completeCycleCoverageRate, uncensoredCompleteCycleCoverageRate: coverage.uncensoredCompleteCycleCoverageRate, ratesAreTruthMetrics: false } },
        { relativePath: `${base}-temporal-association-audit.json`, value: { schemaVersion: 1, status: requirements.sourceTransitionReuseZero ? 'passed' : 'failed', anchorWindowSecondsInclusive: [-2, 2], laterCycleWindowSeconds: { greaterThan: 0, atMost: 180 }, equidistantCandidatesUsedAsPositiveEvidence: false, transitionReuseCount: 0 } },
        { relativePath: `${base}-ambiguity-audit.json`, value: { schemaVersion: 1, status: technicalPassedBeforeRunSize ? 'passed' : 'failed', ambiguousAnchorCount: coverage.ambiguousAnchors, ambiguousAnchorRate: rate(coverage.ambiguousAnchors, coverage.anchorCount), ambiguousAssociationsUsedAsPositiveEvidence: false } },
        { relativePath: `${base}-coverage-level-assessment.json`, value: { schemaVersion: 1, status: technicalPassedBeforeRunSize ? 'passed' : 'failed', directionalCycleCoverageLevel, operationalThresholdsAreGameplayTruthProof: false, measurements: coverage, thresholds: { strong: { anchorsWithAtLeastTwoFamiliesRateAtLeast: 0.95, uncensoredCompleteCycleCoverageRateAtLeast: 0.90, unanchoredPatternRateAtMost: 0.05, technicalFailures: 0 }, partial: { anchorAlignmentRateAtLeast: 0.75, orUncensoredCompleteCycleCoverageRateAtLeast: 0.60 }, insufficient: 'below partial thresholds or dominated by ambiguous or unanchored patterns' } } },
        { relativePath: `${base}-question-readiness.json`, value: { schemaVersion: 1, directionalSignalEvidenceAvailable: technicalPassedBeforeRunSize, cycleEvidenceMeasurable: technicalPassedBeforeRunSize, negativeControlEvidenceAvailable: technicalPassedBeforeRunSize, candidateLevelDirectionalCycleConsumptionAvailable: technicalPassedBeforeRunSize, readyForFinalDeathSemanticContractDesign: technicalPassedBeforeRunSize && directionalCycleCoverageLevel === 'strong', readyForFinalDeathFacts: false, readyForConfirmedWhoDied: false, readyForAttribution: false, readyForKillerVictim: false, readyForTeamfightDetection: false, readyForGameplayInterpretation: false } },
        { relativePath: `${base}-ajv-draft-2020-12-schema-validation-summary.json`, value: { schemaVersion: 1, status: requirements.schemaValidationPassed ? 'passed' : 'failed', validator: 'Ajv Draft 2020-12', schemaId: schema.$id, artifactCount: artifacts.length, validationFailureCount: replayResults.reduce((sum, result) => sum + result.validationErrors.length, 0), realJsonSchemaValidationUsed: true } },
        { relativePath: `${base}-output-policy-audit.json`, value: { schemaVersion: 1, status: requirements.outputPolicyPassed ? 'passed' : 'failed', forbiddenSurfaces: FORBIDDEN_SURFACES, rows: replayResults.map(result => result.policyAudit ?? { replayId: result.summary.replayId, outputPolicyStatus: 'failed' }), finalFactsProduced: 0, attributionProduced: 0 } },
        { relativePath: `${base}-summary.json`, value: { schemaVersion: 1, runKind: manifest.runKind, artifactClass: ARTIFACT_CLASS, technicalEvidenceBaselineStatus: technicalPassedBeforeRunSize ? 'ready_pending_size' : 'blocked', expectedAnchorCount, actualAnchorCount, evidenceRowCount: artifacts.reduce((sum, artifact) => sum + artifact.evidenceRowCount, 0), directionalCycleCoverageLevel, coverage, rows: replayRows, limitations: ['Technical readiness does not confirm deaths or respawns.', 'Coverage thresholds are operational design criteria, not gameplay truth metrics.'] } },
        { relativePath: 'run-index.json', value: { schemaVersion: 1, runKind: manifest.runKind, generatedBy: GENERATED_BY, generatedAt: GENERATED_AT, plan: plan.map(input => ({ replayId: input.replayId, localPath: input.localPath, participantIdentityArtifactPath: input.participantIdentityArtifactPath, lifeStateTransitionArtifactPath: input.lifeStateTransitionArtifactPath, deathEventCandidateArtifactPath: input.deathEventCandidateArtifactPath, corroborationEvidenceArtifactPath: input.corroborationEvidenceArtifactPath })), artifactClass: ARTIFACT_CLASS, rawReplayValuesPersisted: false } }
    ];
    files.push(...audits);
    const preliminaryBytes = files.reduce((sum, file) => sum + artifactSizeBytes(file.value), 0);
    requirements.totalRunSizePassed = preliminaryBytes <= MAX_RUN_BYTES;
    const technicalEvidenceBaselinePassed = Object.values(requirements).every(Boolean);
    const gate = {
        schemaVersion: 1,
        runKind: manifest.runKind,
        gate: technicalEvidenceBaselinePassed ? gateConfig.ready : gateConfig.blocked,
        status: technicalEvidenceBaselinePassed ? 'passed' : 'blocked',
        technicalEvidenceBaselinePassed,
        directionalCycleCoverageLevel,
        lowCycleCoverageBlocksTechnicalBaseline: false,
        expectedAnchorCount,
        actualAnchorCount,
        requirements
    };
    files.push({ relativePath: `${base}-artifact-and-total-run-size-audit.json`, value: { schemaVersion: 1, status: requirements.artifactSizePassed && requirements.totalRunSizePassed ? 'passed' : 'failed', maximumArtifactBytes: MAX_ARTIFACT_BYTES, maximumRunBytes: MAX_RUN_BYTES, totalRunBytes: preliminaryBytes, artifacts: artifactBytes } });
    files.push({ relativePath: `${base}-gate.json`, value: gate });
    const summaryFile = files.find(file => file.relativePath === `${base}-summary.json`);
    summaryFile.value.technicalEvidenceBaselineStatus = technicalEvidenceBaselinePassed ? 'ready' : 'blocked';
    summaryFile.value.gate = gate.gate;
    return { files, gate, coverage, directionalCycleCoverageLevel };
}

async function finalizeTask185(runResult) {
    if (runResult.gate.runKind !== 'task185-bounded32') return;
    const outputRoot = path.resolve(REPO_ROOT, OUTPUT_ROOT_PREFIX);
    const pilotGate = await readJson(`${OUTPUT_ROOT_PREFIX}task185-pilot/death-event-directional-cycle-evidence-pilot-gate.json`);
    const pilotSummary = await readJson(`${OUTPUT_ROOT_PREFIX}task185-pilot/death-event-directional-cycle-evidence-pilot-summary.json`);
    const correctionAudit = await task184CorrectionAudit();
    const success = pilotGate.technicalEvidenceBaselinePassed && runResult.gate.technicalEvidenceBaselinePassed && correctionAudit.status === 'passed';
    const finalGate = success ? 'task184_commit_recorded_directional_cycle_evidence_bounded32_ready' : 'task184_commit_recorded_directional_cycle_evidence_blocked';
    const boundedSummary = runResult.files.find(file => file.relativePath === `${RUN_GATES['task185-bounded32'].prefix}-summary.json`).value;
    const finalFiles = [
        ['task184-commit-documentation-correction-audit.json', correctionAudit],
        ['death-event-directional-cycle-evidence-consumption-contract.json', {
            schemaVersion: 1,
            artifactClass: ARTIFACT_CLASS,
            activeBaseline: 'death_event_directional_cycle_evidence_bounded32_task185',
            sourceBaselinesRemainActive: [
                'participant_identity_compact_bounded32_task180',
                'life_state_transition_candidates_bounded32_task182',
                'death_event_candidates_bounded32_task183',
                'death_event_corroboration_evidence_bounded32_task184'
            ],
            candidateLevelConsumptionAvailable: success,
            task183RemainsTemporalAnchor: true,
            task184ContextOnly: true,
            corroborationCoverageLevelMeaning: 'coverage strength only',
            finalFactsAvailable: false,
            attributionAvailable: false,
            gameplayInterpretationAvailable: false
        }],
        ['task185-question-readiness.json', {
            schemaVersion: 1,
            directionalSignalEvidenceAvailable: success,
            cycleEvidenceMeasurable: success,
            negativeControlEvidenceAvailable: success,
            candidateLevelDirectionalCycleConsumptionAvailable: success,
            readyForFinalDeathSemanticContractDesign: success && boundedSummary.directionalCycleCoverageLevel === 'strong',
            readyForFinalDeathFacts: false,
            readyForConfirmedWhoDied: false,
            readyForAttribution: false,
            readyForKillerVictim: false,
            readyForTeamfightDetection: false,
            readyForGameplayInterpretation: false
        }],
        ['task185-summary.json', {
            schemaVersion: 1,
            gate: finalGate,
            technicalEvidenceBaselinePassed: success,
            pilot: { gate: pilotGate.gate, anchorCount: pilotSummary.actualAnchorCount, directionalCycleCoverageLevel: pilotSummary.directionalCycleCoverageLevel },
            bounded32: { gate: runResult.gate.gate, anchorCount: boundedSummary.actualAnchorCount, directionalCycleCoverageLevel: boundedSummary.directionalCycleCoverageLevel, coverage: boundedSummary.coverage },
            finalFactsProduced: 0,
            attributionProduced: 0,
            activeBaseline: success ? 'death_event_directional_cycle_evidence_bounded32_task185' : null
        }],
        ['task185-gate.json', {
            schemaVersion: 1,
            gate: finalGate,
            status: success ? 'passed' : 'blocked',
            meaning: 'Directional-cycle and negative-control evidence baseline is reproducible and consumable; deaths remain unconfirmed.',
            readyForFinalDeathSemanticContractDesign: success && boundedSummary.directionalCycleCoverageLevel === 'strong',
            readyForFinalDeathFacts: false,
            readyForConfirmedWhoDied: false,
            readyForAttribution: false
        }]
    ];
    for (const [name, value] of finalFiles) await writeJson(path.join(outputRoot, name), value);
}

export async function runDirectionalCycleEmission({ manifest, summaryOutput }) {
    const plan = buildDirectionalCyclePlan(manifest);
    const summaryRoot = validateDirectionalCycleOutputRoot(summaryOutput, manifest);
    const schema = await readJson(SCHEMA_PATH);
    const correctionAudit = await task184CorrectionAudit();
    const replayResults = [];
    for (const input of plan) replayResults.push(await runReplayObservation(input, schema));
    const built = buildRunFiles({ manifest, plan, replayResults, schema, correctionAudit });
    await writeRunAtomically(summaryRoot, built.files);
    const runResult = { ...built, runKind: manifest.runKind };
    await finalizeTask185(runResult);
    if (!built.gate.technicalEvidenceBaselinePassed) throw new Error(`${manifest.runKind} blocked: ${built.gate.gate}`);
    return runResult;
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const manifestPath = assertRelativeRepositoryPath(args.get('manifest'), 'manifest');
    const manifest = await readJson(manifestPath);
    const result = await runDirectionalCycleEmission({ manifest, summaryOutput: args.get('summary-output') });
    process.stdout.write(`${JSON.stringify({ runKind: manifest.runKind, gate: result.gate.gate, anchorCount: result.gate.actualAnchorCount, directionalCycleCoverageLevel: result.directionalCycleCoverageLevel })}\n`);
}

if (pathToFileURL(process.argv[1] ?? '').href === import.meta.url) {
    main().catch(error => {
        process.stderr.write(`${error.stack ?? error}\n`);
        process.exitCode = 1;
    });
}
