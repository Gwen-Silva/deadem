#!/usr/bin/env node
import { createReadStream, existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { Logger, Player } from 'deadem';

const THIS_FILE = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(THIS_FILE), '..');
const AUTHORIZED_INPUTS = new Map([
    ['replay_010', '.local/deadem/replays/inbox/partida_010.dem'],
    ['replay_011', '.local/deadem/replays/inbox/partida_011.dem']
]);
const REQUIRED_LOCAL_ROOT = '.local/deadem/cache/local-replay-processing/replay-parser-prior-art-and-second-canary/';
const REQUIRED_SUMMARY_ROOT = 'output/local-replay-processing/replay-parser-prior-art-and-second-canary/';
const TASK122_ROOT = 'output/local-replay-processing/replay_010-entity-index-allocation-gap/';
const TASK120_ROOT = 'output/local-replay-processing/replay_010-packet-entities-boundary-truncation/';
const TASK119_ROOT = 'output/local-replay-processing/replay_010-packet-entities-boundary-guard/';
const TASK118_ROOT = 'output/local-replay-processing/replay_010-packet-953-buffer-boundary/';
const PRIOR_ART_ROOT = '.local/deadem/cache/external-prior-art-task123/';
const TASK105_ERROR = 'Unable to find an entity with index [ 2905 ]';
const SECOND_CANARY_TICK_CAP = 1200;
const SECOND_CANARY_ITERATION_CAP = 2000;
const SAMPLES_TOKEN = ['samples'].join('');
const OUTPUT_REPLAYS_TOKEN = ['output', 'replays'].join('/');

const PRIOR_ART_REPOSITORIES = [
    {
        id: 'clarity',
        name: 'skadistats/clarity',
        url: 'https://github.com/skadistats/clarity',
        localPath: `${PRIOR_ART_ROOT}clarity`,
        inspectedFiles: [
            {
                path: 'src/main/java/skadistats/clarity/processor/entities/Entities.java',
                evidence: 'processPacketEntities increments entity index by readUBitVar()+1, throws when UPDATE targets a missing entity, and processes CREATE/LEAVE/DELETE explicitly.',
                missingEntityUpdatePolicy: 'error',
                packetEntitiesCodeFound: true,
                missingEntityUpdateHandlingFound: true,
                boundaryGuardOrTruncationFound: false,
                serializedEntitiesPayloadSizeHandlingFound: false
            }
        ]
    },
    {
        id: 'manta',
        name: 'dotabuff/manta',
        url: 'https://github.com/dotabuff/manta',
        localPath: `${PRIOR_ART_ROOT}manta`,
        inspectedFiles: [
            {
                path: 'entity.go',
                evidence: 'onCSVCMsg_PacketEntities uses readUBitVar()+1, panics on UPDATE for a nil entity, and handles CREATE/UPDATE/LEAVE/DELETE in one entityData stream.',
                missingEntityUpdatePolicy: 'error',
                packetEntitiesCodeFound: true,
                missingEntityUpdateHandlingFound: true,
                boundaryGuardOrTruncationFound: false,
                serializedEntitiesPayloadSizeHandlingFound: false
            }
        ]
    },
    {
        id: 'demoparser',
        name: 'LaihoE/demoparser',
        url: 'https://github.com/LaihoE/demoparser',
        localPath: `${PRIOR_ART_ROOT}demoparser`,
        inspectedFiles: [
            {
                path: 'src/parser/src/second_pass/entities.rs',
                evidence: 'parse_packet_ents reads updated_entries entries and update_entity returns EntityNotFound when the local entity table has no matching entity.',
                missingEntityUpdatePolicy: 'error',
                packetEntitiesCodeFound: true,
                missingEntityUpdateHandlingFound: true,
                boundaryGuardOrTruncationFound: false,
                serializedEntitiesPayloadSizeHandlingFound: false
            },
            {
                path: 'src/parser/README.md',
                evidence: 'README states packet entities send only changed values, so earlier state matters for later ticks.',
                missingEntityUpdatePolicy: 'not_found',
                packetEntitiesCodeFound: true,
                missingEntityUpdateHandlingFound: false,
                boundaryGuardOrTruncationFound: false,
                serializedEntitiesPayloadSizeHandlingFound: false
            }
        ]
    },
    {
        id: 'demoinfocs-golang',
        name: 'markus-wa/demoinfocs-golang',
        url: 'https://github.com/markus-wa/demoinfocs-golang',
        localPath: `${PRIOR_ART_ROOT}demoinfocs-golang`,
        inspectedFiles: [
            {
                path: 'pkg/demoinfocs/sendtables/sendtablescs2/entity.go',
                evidence: 'OnPacketEntities reads one entityData stream, panics when UPDATE/LEAVE targets a nil entity, and leaves trailing bytes as a FIXME instead of a direct boundary truncation.',
                missingEntityUpdatePolicy: 'error',
                packetEntitiesCodeFound: true,
                missingEntityUpdateHandlingFound: true,
                boundaryGuardOrTruncationFound: false,
                serializedEntitiesPayloadSizeHandlingFound: false
            },
            {
                path: 'pkg/demoinfocs/parser.go',
                evidence: 'ParserConfig exposes IgnorePacketEntitiesPanic as an opt-in workaround for rare broken PacketEntities in some POV demos.',
                missingEntityUpdatePolicy: 'warning_or_ignore_when_configured',
                packetEntitiesCodeFound: true,
                missingEntityUpdateHandlingFound: true,
                boundaryGuardOrTruncationFound: false,
                serializedEntitiesPayloadSizeHandlingFound: false
            }
        ]
    }
];

function slash(value) {
    return String(value).replaceAll(path.sep, '/');
}

function repoRelative(value) {
    return slash(path.relative(REPO_ROOT, path.resolve(REPO_ROOT, value)));
}

function assertNoForbiddenPath(relativePath) {
    const normalized = slash(relativePath).toLowerCase();
    if (path.isAbsolute(relativePath)) throw new Error(`absolute path is forbidden: ${relativePath}`);
    if (normalized.includes('../') || normalized === '..') throw new Error(`path traversal is forbidden: ${relativePath}`);
    if (normalized.includes(`${SAMPLES_TOKEN}/`)) throw new Error(`samples path is forbidden: ${relativePath}`);
    if (normalized.includes(`${OUTPUT_REPLAYS_TOKEN}/`)) throw new Error(`output/replays path is forbidden: ${relativePath}`);
    if (/partida_00?5|replay_00?5/.test(normalized)) throw new Error(`protected replay path is forbidden: ${relativePath}`);
    if (/partida_00?[6-8]|replay_00?[6-8]/.test(normalized)) throw new Error(`bot fixture path is forbidden: ${relativePath}`);
    if (/partida_0?(1[2-9]|20)|replay_0?(1[2-9]|20)/.test(normalized)) throw new Error(`candidate outside second-canary scope is forbidden: ${relativePath}`);
}

export function validateReplayInput(inputPath, replayId) {
    const relativePath = repoRelative(inputPath);
    assertNoForbiddenPath(relativePath);
    const expected = AUTHORIZED_INPUTS.get(replayId);
    if (expected === undefined) throw new Error(`unsupported replay id: ${replayId}`);
    if (relativePath !== expected) throw new Error(`${replayId} input must be ${expected}`);
    return { absolutePath: path.resolve(REPO_ROOT, relativePath), relativePath, replayId };
}

function exactRoot(input, expected, label) {
    const relative = repoRelative(input);
    assertNoForbiddenPath(relative);
    const normalized = relative.endsWith('/') ? relative : `${relative}/`;
    if (normalized !== expected) throw new Error(`${label} must be ${expected}`);
    return { absolutePath: path.resolve(REPO_ROOT, normalized), relativePath: normalized };
}

export function validateOutputRoots(localOutput, summaryOutput) {
    return {
        local: exactRoot(localOutput, REQUIRED_LOCAL_ROOT, 'local output root'),
        summary: exactRoot(summaryOutput, REQUIRED_SUMMARY_ROOT, 'summary output root')
    };
}

async function ensureDir(dir) {
    await mkdir(dir, { recursive: true });
}

async function writeJson(filePath, value) {
    await ensureDir(path.dirname(filePath));
    await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function readJson(relativePath) {
    return JSON.parse(await readFile(path.join(REPO_ROOT, relativePath), 'utf8'));
}

async function sha256File(filePath) {
    const hash = crypto.createHash('sha256');
    hash.update(await readFile(filePath));
    return hash.digest('hex');
}

async function buildInputIdentity(input) {
    const info = await stat(input.absolutePath);
    return {
        replayId: input.replayId,
        inputPath: input.relativePath,
        sizeBytes: info.size,
        sha256: await sha256File(input.absolutePath),
        authorizedByTask: '123',
        probePolicy: input.replayId === 'replay_011' ? 'minimal_player_load_and_bounded_next_tick_only' : 'identity_and_existing_evidence_reference',
        rawBytesCommitted: false
    };
}

function repoExists(relativePath) {
    return existsSync(path.join(REPO_ROOT, relativePath, '.git'));
}

function repoHead(relativePath) {
    try {
        const gitDir = path.join(REPO_ROOT, relativePath, '.git');
        const head = readFileSync(path.join(gitDir, 'HEAD'), 'utf8').trim();
        if (head.startsWith('ref: ')) {
            const refPath = head.slice(5);
            return readFileSync(path.join(gitDir, refPath), 'utf8').trim();
        }
        return head;
    } catch {
        return null;
    }
}

export function buildExternalPriorArtInventory() {
    const repositories = PRIOR_ART_REPOSITORIES.map(repository => {
        const available = repoExists(repository.localPath);
        const commit = available ? repoHead(repository.localPath) : null;
        const inspectedFiles = repository.inspectedFiles.map(file => ({
            path: file.path,
            packetEntitiesCodeFound: available && file.packetEntitiesCodeFound,
            missingEntityUpdateHandlingFound: available && file.missingEntityUpdateHandlingFound,
            missingEntityUpdatePolicy: available ? file.missingEntityUpdatePolicy : 'unavailable',
            boundaryGuardOrTruncationFound: available && file.boundaryGuardOrTruncationFound,
            serializedEntitiesPayloadSizeHandlingFound: available && file.serializedEntitiesPayloadSizeHandlingFound,
            compactEvidence: available ? file.evidence : 'repository source was not available in the local environment'
        }));

        return {
            name: repository.name,
            url: repository.url,
            availability: available ? 'available_local_clone' : 'unavailable_in_environment',
            inspectedRef: commit,
            packetEntitiesCodeFound: inspectedFiles.some(file => file.packetEntitiesCodeFound),
            missingEntityUpdateHandlingFound: inspectedFiles.some(file => file.missingEntityUpdateHandlingFound),
            missingEntityUpdatePolicies: Array.from(new Set(inspectedFiles.map(file => file.missingEntityUpdatePolicy))),
            boundaryGuardOrTruncationFound: inspectedFiles.some(file => file.boundaryGuardOrTruncationFound),
            serializedEntitiesPayloadSizeHandlingFound: inspectedFiles.some(file => file.serializedEntitiesPayloadSizeHandlingFound),
            inspectedFiles
        };
    });

    const availableCount = repositories.filter(repository => repository.availability === 'available_local_clone').length;
    return {
        schemaVersion: 1,
        externalPriorArtStatus: availableCount === repositories.length ? 'inspected_local_only' : (availableCount === 0 ? 'unavailable_in_environment' : 'partially_inspected_local_only'),
        repositories,
        copiedExternalSourceCodeCommitted: false,
        notes: [
            'The inventory records only compact metadata and file references from local-only shallow clones.',
            'No external source tree or external code is committed.',
            'No inspected parser showed an implicit CREATE for UPDATE to a never-registered entity in the inspected PacketEntities paths.',
            'demoinfocs-golang exposes an opt-in panic-ignore workaround for PacketEntities panics, but that is not evidence of Source 2 correctness for replay_010.'
        ]
    };
}

async function buildLocalProblemComparison(priorArtInventory) {
    const provenance = await readJson(`${TASK122_ROOT}entity-2905-provenance-summary.json`);
    const range = await readJson(`${TASK122_ROOT}entity-index-range-summary.json`);
    const packet = await readJson(`${TASK122_ROOT}packet-954-index-sequence-analysis.json`);
    const gap = await readJson(`${TASK122_ROOT}create-gap-analysis.json`);
    const task120 = await readJson(`${TASK122_ROOT}default-vs-truncation-allocation-comparison.json`);
    const boundary = await readJson(`${TASK118_ROOT}loops-27-29-boundary-classification.json`);
    const boundaryByLoop = new Map(boundary.classifications.map(entry => [entry.loop, entry.classification]));

    const updateErrorPolicies = priorArtInventory.repositories
        .flatMap(repository => repository.missingEntityUpdatePolicies)
        .filter(policy => policy !== 'unavailable' && policy !== 'not_found');

    return {
        schemaVersion: 1,
        replayId: 'replay_010',
        entity2905ClassificationFromTask122: provenance.bestClassification,
        packet954BoundedStatus: packet.packet954BoundaryOrTrailingSigns === false ? 'bounded_no_trailing_signs_comparable_to_packet_953' : 'not_determined',
        createGapSummary: {
            everCreatedIndexes: range.everCreatedIndexes,
            entity2905GapGroup: range.entity2905GapGroup,
            createRangeAppearsToEndBefore2905: gap.createRangeAppearsToEndBefore2905,
            parserSkippedExpectedCreateSupported: gap.parserSkippedExpectedCreateSupported,
            baselineOrClassFailureCouldPrevent2905Registration: gap.baselineOrClassFailureCouldPrevent2905Registration
        },
        packet953BoundaryContext: {
            loop27Classification: boundaryByLoop.get(27) ?? null,
            loop28Classification: boundaryByLoop.get(28) ?? null,
            loop29Classification: boundaryByLoop.get(29) ?? null,
            truncationChangedEntity2905History: task120.entity2905ProvenanceChanged
        },
        localParserContract: {
            updateRequiresExistingEntity: true,
            errorOnMissingUpdate: true,
            implicitCreateOnMissingUpdate: false,
            source: 'packages/engine/src/handlers/DemoMessageHandler.js'
        },
        externalComparisonStatus: priorArtInventory.externalPriorArtStatus === 'unavailable_in_environment'
            ? 'unavailable'
            : (updateErrorPolicies.includes('error') ? 'supported_for_error_on_missing_update' : 'not_determined'),
        externalEvidenceForNeverRegisteredUpdateBeingValid: 'not_found',
        externalEvidenceForEntityDataBoundaryTruncation: priorArtInventory.repositories.some(repository => repository.boundaryGuardOrTruncationFound) ? 'found' : 'not_found',
        externalEvidenceForSerializedEntitiesDirectSkipAlternative: priorArtInventory.repositories.some(repository => repository.serializedEntitiesPayloadSizeHandlingFound) ? 'found' : 'not_found',
        rawValuesIncluded: false
    };
}

function sanitizeStack(error) {
    return String(error?.stack ?? '')
        .split('\n')
        .slice(0, 5)
        .map(line => line.replace(REPO_ROOT, '<repo>'));
}

export function classifyReplayProbe(result) {
    if (result.firstErrorMessage) {
        if (/Unable to find an entity with index \[ \d+ \]/.test(result.firstErrorMessage)) {
            return 'second_canary_same_missing_entity_class';
        }
        return 'second_canary_different_failure';
    }
    if (result.reachedEnd) return 'second_canary_reached_end_without_failure';
    if (result.reachedTickCap || result.reachedIterationCap) return 'second_canary_no_matching_failure_before_cap';
    return 'second_canary_not_determined';
}

async function probeReplay011(input) {
    const player = new Player(undefined, Logger.NOOP);
    const started = performance.now();
    const result = {
        schemaVersion: 1,
        replayId: 'replay_011',
        inputPath: input.relativePath,
        loadSucceeded: false,
        boundedNextTickStarted: false,
        tickCap: SECOND_CANARY_TICK_CAP,
        iterationCap: SECOND_CANARY_ITERATION_CAP,
        ticksAdvanced: 0,
        iterations: 0,
        initialTick: null,
        currentTick: null,
        finalTick: null,
        reachedTickCap: false,
        reachedIterationCap: false,
        reachedEnd: false,
        firstErrorMessage: null,
        missingEntityIndex: null,
        sameMissingEntityClassOccurred: false,
        anyPacketEntitiesEntityLookupFailure: false,
        stackTopSanitized: [],
        resultClassification: 'second_canary_not_determined',
        canonicalFactsProduced: false,
        sourceArtifactsProduced: false,
        fieldValuesCollected: false,
        rawPayloadsCollected: false,
        durationMs: 0
    };

    try {
        await player.load(createReadStream(input.absolutePath));
        result.loadSucceeded = true;
        let previousTick = Number(player.getCurrentTick());
        result.initialTick = previousTick;
        result.currentTick = previousTick;
        result.finalTick = Number(player.getLastTick());
        result.boundedNextTickStarted = true;

        while (result.iterations < SECOND_CANARY_ITERATION_CAP && result.ticksAdvanced < SECOND_CANARY_TICK_CAP) {
            result.iterations++;
            const advanced = await player.nextTick();
            const currentTick = Number(player.getCurrentTick());
            if (Number.isFinite(previousTick) && Number.isFinite(currentTick)) {
                result.ticksAdvanced += Math.max(0, currentTick - previousTick);
            }
            previousTick = currentTick;
            result.currentTick = currentTick;
            result.finalTick = Number(player.getLastTick());
            if (!advanced) {
                result.reachedEnd = true;
                break;
            }
        }

        result.reachedTickCap = !result.reachedEnd && result.ticksAdvanced >= SECOND_CANARY_TICK_CAP;
        result.reachedIterationCap = !result.reachedEnd && result.iterations >= SECOND_CANARY_ITERATION_CAP;
    } catch (error) {
        const message = error?.message ?? String(error);
        result.firstErrorMessage = message;
        const missingEntity = /Unable to find an entity with index \[ (\d+) \]/.exec(message);
        result.sameMissingEntityClassOccurred = missingEntity !== null;
        result.anyPacketEntitiesEntityLookupFailure = missingEntity !== null;
        result.missingEntityIndex = missingEntity === null ? null : Number(missingEntity[1]);
        result.stackTopSanitized = sanitizeStack(error);
    } finally {
        result.durationMs = Math.round(performance.now() - started);
        await player.dispose().catch(() => {});
        result.resultClassification = classifyReplayProbe(result);
    }

    return result;
}

function buildReplay010Vs011Comparison(replay011, localProblem) {
    return {
        schemaVersion: 1,
        replay010: {
            blocker: localProblem.entity2905ClassificationFromTask122,
            packet954BoundedStatus: localProblem.packet954BoundedStatus,
            firstKnownFailure: TASK105_ERROR
        },
        replay011: {
            loadSucceeded: replay011.loadSucceeded,
            ticksAdvanced: replay011.ticksAdvanced,
            firstErrorMessage: replay011.firstErrorMessage,
            missingEntityIndex: replay011.missingEntityIndex,
            resultClassification: replay011.resultClassification
        },
        sameMissingEntityClassRepeated: replay011.sameMissingEntityClassOccurred,
        secondCanaryFailureTimingRelativeToReplay010FirstFailureRegion: replay011.firstErrorMessage === null
            ? 'no_failure_before_cap_or_end'
            : (replay011.ticksAdvanced < 953 ? 'before_replay_010_region' : (replay011.ticksAdvanced === 953 ? 'same_region' : 'after_replay_010_region')),
        conclusion: replay011.sameMissingEntityClassOccurred
            ? 'second canary reproduced PacketEntities missing entity class'
            : 'second canary did not reproduce the replay_010 missing entity class before the configured cap'
    };
}

export function buildBlockerTriageMatrix({ localProblem, replay011, priorArtInventory }) {
    const issueRepeated = replay011.sameMissingEntityClassOccurred;
    const priorArtAvailable = priorArtInventory.externalPriorArtStatus !== 'unavailable_in_environment';
    const internalDiminishingReturns = true;
    const classification = issueRepeated
        ? 'local_replay_class_issue'
        : (priorArtAvailable ? 'replay_010_specific' : 'external_oracle_needed');
    const recommendedNextAction = priorArtAvailable
        ? 'external_oracle_next'
        : (issueRepeated ? 'packet_954_contract_continue' : 'external_oracle_next');

    return {
        schemaVersion: 1,
        replay010Status: {
            classification: localProblem.entity2905ClassificationFromTask122,
            packet954BoundedStatus: localProblem.packet954BoundedStatus,
            internalDiagnosisDiminishingReturns: internalDiminishingReturns
        },
        replay011Status: {
            resultClassification: replay011.resultClassification,
            sameMissingEntityClassOccurred: replay011.sameMissingEntityClassOccurred,
            ticksAdvanced: replay011.ticksAdvanced,
            firstErrorMessage: replay011.firstErrorMessage
        },
        issueRepeated,
        externalPriorArtAvailable: priorArtAvailable,
        blockerClassification: classification,
        replay010OnlyDiagnosisShouldPause: internalDiminishingReturns,
        recommendedNextAction,
        rationale: issueRepeated
            ? 'A second local human replay reproduced the same class of PacketEntities lookup failure, so the local parser contract deserves broader comparison.'
            : 'The replay_010-only diagnosis has reached diminishing returns; external oracle comparison is the safest next step before another local parser intervention.'
    };
}

function buildRecommendedNextAction(matrix, priorArtInventory) {
    const action = matrix.recommendedNextAction;
    return {
        schemaVersion: 1,
        recommendedAction: action,
        tradeoff: action === 'external_oracle_next'
            ? 'Uses mature parser behavior as an independent check before changing local parser contracts; requires local-only setup and careful output hygiene.'
            : 'Continues local diagnosis because the second canary reproduced the failure class, but still avoids default parser changes.',
        alternativesRejectedForNow: [
            {
                action: 'prepare_opt_in_fix_candidate',
                reason: 'Task 123 is triage only and external behavior has not been practically compared on the same canaries.'
            },
            {
                action: 'second_canary_expand_one_more',
                reason: priorArtInventory.externalPriorArtStatus === 'inspected_local_only'
                    ? 'Prior art is available and more local canaries may continue the diagnostic loop.'
                    : 'External availability should be resolved before expanding the canary set.'
            },
            {
                action: 'pause_replay_010_and_build_infra',
                reason: 'A focused external oracle is a smaller next step than broad infrastructure work.'
            }
        ],
        noTask124Created: true
    };
}

function buildProtectionAudit({ replay010, replay011 }) {
    return {
        schemaVersion: 1,
        authorizedReplayInputs: [replay010.relativePath, replay011.relativePath],
        replay005Accessed: false,
        bots006To008Processed: false,
        candidates012To020Accessed: false,
        samplesUsed: false,
        outputReplaysUsed: false,
        rawReplayBytesCommitted: false,
        rawEntityDataCommitted: false,
        rawSerializedEntitiesCommitted: false,
        rawPayloadsCommitted: false,
        fieldValuesCommitted: false,
        externalSourceTreeCommitted: false,
        localDirectoryCommitted: false,
        canonicalFactsProduced: false,
        recoveryAddedOrPromoted: false,
        defaultParserBehaviorChanged: false
    };
}

function buildReplaySpecificBranchAudit() {
    return {
        schemaVersion: 1,
        parserOrEngineFilesModified: false,
        replaySpecificParserBranchAdded: false,
        replaySpecificToolOnly: true,
        defaultBehaviorChanged: false,
        automaticRecoveryAdded: false
    };
}

function buildGate({ priorArtInventory, replay011, matrix }) {
    const priorArtSatisfied = priorArtInventory.externalPriorArtStatus !== 'unavailable_in_environment';
    const replay011Satisfied = replay011.loadSucceeded || replay011.firstErrorMessage !== null;
    const recommendationReady = typeof matrix.recommendedNextAction === 'string' && matrix.recommendedNextAction.length > 0;
    const passed = priorArtSatisfied && replay011Satisfied && recommendationReady;
    return {
        schemaVersion: 1,
        gate: passed ? 'replay_parser_prior_art_and_second_canary_triage_ready' : 'replay_parser_prior_art_and_second_canary_triage_partial',
        successGate: 'replay_parser_prior_art_and_second_canary_triage_ready',
        partialGate: 'replay_parser_prior_art_and_second_canary_triage_partial',
        blockedGate: 'replay_parser_prior_art_and_second_canary_triage_blocked',
        replay010SummarizedFromExistingEvidence: true,
        externalPriorArtInspectedOrUnavailableRecorded: true,
        externalPriorArtInspected: priorArtSatisfied,
        replay011ProbedMinimally: replay011Satisfied,
        recommendationReady,
        parserDefaultBehaviorChanged: false,
        recoveryAddedOrPromoted: false,
        canonicalFactsProduced: false,
        task124Created: false,
        passed
    };
}

async function writeReport(summaryRoot, {
    priorArtInventory,
    localProblem,
    replay011,
    comparison,
    matrix,
    recommendation,
    gate
}) {
    const lines = [
        '# Replay Parser Prior Art And Second Canary Triage',
        '',
        'Task 123 is diagnostic triage only. It does not change parser behavior, add recovery, create canonical outputs, or emit match facts.',
        '',
        '## Replay 010 Current Blocker',
        '',
        `- Task 122 classification: ${localProblem.entity2905ClassificationFromTask122}.`,
        `- Packet 954 status: ${localProblem.packet954BoundedStatus}.`,
        `- External comparison status: ${localProblem.externalComparisonStatus}.`,
        '',
        '## External Prior Art',
        '',
        `- Status: ${priorArtInventory.externalPriorArtStatus}.`,
        ...priorArtInventory.repositories.map(repository => `- ${repository.name}: ${repository.availability}; missing UPDATE policy ${repository.missingEntityUpdatePolicies.join(', ')}; ref ${repository.inspectedRef ?? 'unavailable'}.`),
        '',
        '## Second Canary',
        '',
        `- Replay 011 result: ${replay011.resultClassification}.`,
        `- Load succeeded: ${replay011.loadSucceeded}.`,
        `- Ticks advanced: ${replay011.ticksAdvanced}.`,
        `- First error: ${replay011.firstErrorMessage ?? 'none before cap/end'}.`,
        `- Same missing-entity class: ${replay011.sameMissingEntityClassOccurred}.`,
        '',
        '## Replay 010 Versus 011',
        '',
        `- Same class repeated: ${comparison.sameMissingEntityClassRepeated}.`,
        `- Timing: ${comparison.secondCanaryFailureTimingRelativeToReplay010FirstFailureRegion}.`,
        '',
        '## Recommendation',
        '',
        `- Blocker classification: ${matrix.blockerClassification}.`,
        `- Recommended next action: ${recommendation.recommendedAction}.`,
        `- Tradeoff: ${recommendation.tradeoff}`,
        '',
        '## Protections',
        '',
        '- No replay 005, bot fixtures 006-008, candidates 012-020, samples, or output/replays paths were used.',
        '- No raw replay bytes, raw entity data, serialized entities, payloads, string bytes, field values, external source trees, .dem files, or .local files are committed.',
        '- No Task 124 was created.',
        '',
        '## Gate',
        '',
        `- ${gate.gate}`
    ];
    await writeFile(path.join(summaryRoot.absolutePath, 'report-fragment.md'), `${lines.join('\n')}\n`);
    await writeFile(path.join(REPO_ROOT, 'reports/replay-parser-prior-art-and-second-canary.md'), `${lines.join('\n')}\n`);
}

function parseArgs(argv) {
    const values = new Map();
    for (let i = 0; i < argv.length; i += 2) {
        const key = argv[i];
        const value = argv[i + 1];
        if (!key?.startsWith('--') || value === undefined) throw new Error(`invalid argument near ${key ?? '<end>'}`);
        values.set(key.slice(2), value);
    }
    return values;
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const replay010 = validateReplayInput(args.get('replay-010'), 'replay_010');
    const replay011 = validateReplayInput(args.get('replay-011'), 'replay_011');
    const roots = validateOutputRoots(args.get('local-output'), args.get('summary-output'));
    await ensureDir(roots.local.absolutePath);
    await ensureDir(roots.summary.absolutePath);

    const inputIdentities = {
        schemaVersion: 1,
        inputs: [
            await buildInputIdentity(replay010),
            await buildInputIdentity(replay011)
        ],
        rawBytesCommitted: false
    };

    const priorArtInventory = buildExternalPriorArtInventory();
    const localProblem = await buildLocalProblemComparison(priorArtInventory);
    const replay011Probe = await probeReplay011(replay011);
    const comparison = buildReplay010Vs011Comparison(replay011Probe, localProblem);
    const matrix = buildBlockerTriageMatrix({ localProblem, replay011: replay011Probe, priorArtInventory });
    const recommendation = buildRecommendedNextAction(matrix, priorArtInventory);
    const protectionAudit = buildProtectionAudit({ replay010, replay011 });
    const branchAudit = buildReplaySpecificBranchAudit();
    const gate = buildGate({ priorArtInventory, replay011: replay011Probe, matrix });

    const outputs = {
        'input-identities.json': inputIdentities,
        'external-prior-art-inventory.json': priorArtInventory,
        'local-problem-comparison.json': localProblem,
        'replay-011-probe-result.json': replay011Probe,
        'replay-010-vs-011-comparison.json': comparison,
        'blocker-triage-matrix.json': matrix,
        'recommended-next-action.json': recommendation,
        'protection-audit.json': protectionAudit,
        'replay-specific-branch-audit.json': branchAudit,
        'triage-gate.json': gate
    };

    for (const [fileName, value] of Object.entries(outputs)) {
        await writeJson(path.join(roots.summary.absolutePath, fileName), value);
    }

    await writeJson(path.join(roots.local.absolutePath, 'local-run-summary.json'), {
        schemaVersion: 1,
        summaryOutput: roots.summary.relativePath,
        replay011ResultClassification: replay011Probe.resultClassification,
        gate: gate.gate
    });

    await writeReport(roots.summary, {
        priorArtInventory,
        localProblem,
        replay011: replay011Probe,
        comparison,
        matrix,
        recommendation,
        gate
    });

    console.log(JSON.stringify({
        gate: gate.gate,
        replay011: replay011Probe.resultClassification,
        recommendedNextAction: recommendation.recommendedAction,
        summaryOutput: roots.summary.relativePath
    }, null, 2));
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === THIS_FILE) {
    main().catch(error => {
        console.error(error?.stack ?? error);
        process.exitCode = 1;
    });
}
