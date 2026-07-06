import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import {
    buildBlockerTriageMatrix,
    buildExternalPriorArtInventory,
    classifyReplayProbe,
    validateOutputRoots,
    validateReplayInput
} from '../tools/triage-replay-parser-prior-art-and-second-canary.mjs';

const OUTPUT_ROOT = 'output/local-replay-processing/replay-parser-prior-art-and-second-canary';

async function readOutput(name) {
    return JSON.parse(await readFile(`${OUTPUT_ROOT}/${name}`, 'utf8'));
}

test('path guards allow only replay 010 and replay 011 canaries', () => {
    assert.doesNotThrow(() => validateReplayInput('.local/deadem/replays/inbox/partida_010.dem', 'replay_010'));
    assert.doesNotThrow(() => validateReplayInput('.local/deadem/replays/inbox/partida_011.dem', 'replay_011'));

    assert.throws(() => validateReplayInput('.local/deadem/replays/inbox/partida_005.dem', 'replay_010'), /protected replay path/);
    assert.throws(() => validateReplayInput('.local/deadem/replays/inbox/partida_006.dem', 'replay_010'), /bot fixture path/);
    assert.throws(() => validateReplayInput('.local/deadem/replays/inbox/partida_012.dem', 'replay_011'), /candidate outside second-canary scope/);
    assert.throws(() => validateReplayInput('samples/partida_011.dem', 'replay_011'), /samples path is forbidden/);
    assert.throws(() => validateReplayInput('output/replays/partida_011.dem', 'replay_011'), /output\/replays path is forbidden/);
    assert.throws(() => validateReplayInput('.local/deadem/replays/inbox/partida_011.dem', 'replay_010'), /replay_010 input must/);
});

test('output roots are fixed to local-only cache and compact summary output', () => {
    assert.doesNotThrow(() => validateOutputRoots(
        '.local/deadem/cache/local-replay-processing/replay-parser-prior-art-and-second-canary/',
        'output/local-replay-processing/replay-parser-prior-art-and-second-canary/'
    ));
    assert.throws(() => validateOutputRoots(
        '.local/deadem/cache/local-replay-processing/replay-parser-prior-art-and-second-canary/',
        'output/replays/replay-parser-prior-art-and-second-canary/'
    ), /output\/replays path is forbidden/);
    assert.throws(() => validateOutputRoots(
        '.local/deadem/cache/local-replay-processing/other/',
        'output/local-replay-processing/replay-parser-prior-art-and-second-canary/'
    ), /local output root/);
});

test('external prior art inventory is compact and never claims committed external source', () => {
    const inventory = buildExternalPriorArtInventory();
    assert.equal(inventory.copiedExternalSourceCodeCommitted, false);
    assert.equal(inventory.repositories.length, 4);
    assert.ok(inventory.repositories.every(repository => repository.url.startsWith('https://github.com/')));
    assert.ok(inventory.repositories.every(repository => Array.isArray(repository.inspectedFiles)));
    assert.ok(inventory.repositories.some(repository => repository.name === 'markus-wa/demoinfocs-golang'));
});

test('probe classification distinguishes same missing entity class from other outcomes', () => {
    assert.equal(classifyReplayProbe({
        firstErrorMessage: 'Unable to find an entity with index [ 2905 ]'
    }), 'second_canary_same_missing_entity_class');
    assert.equal(classifyReplayProbe({
        firstErrorMessage: 'Malformed message'
    }), 'second_canary_different_failure');
    assert.equal(classifyReplayProbe({
        firstErrorMessage: null,
        reachedEnd: false,
        reachedTickCap: true,
        reachedIterationCap: false
    }), 'second_canary_no_matching_failure_before_cap');
    assert.equal(classifyReplayProbe({
        firstErrorMessage: null,
        reachedEnd: true
    }), 'second_canary_reached_end_without_failure');
});

test('blocker triage recommends external oracle when replay 011 does not repeat replay 010 failure', () => {
    const matrix = buildBlockerTriageMatrix({
        localProblem: {
            entity2905ClassificationFromTask122: 'never_registered_entity_with_create_gap',
            packet954BoundedStatus: 'bounded_no_trailing_signs_comparable_to_packet_953'
        },
        replay011: {
            sameMissingEntityClassOccurred: false,
            resultClassification: 'second_canary_no_matching_failure_before_cap',
            ticksAdvanced: 1200,
            firstErrorMessage: null
        },
        priorArtInventory: {
            externalPriorArtStatus: 'inspected_local_only'
        }
    });

    assert.equal(matrix.blockerClassification, 'replay_010_specific');
    assert.equal(matrix.recommendedNextAction, 'external_oracle_next');
    assert.equal(matrix.replay010OnlyDiagnosisShouldPause, true);
});

test('summary outputs are compact triage artifacts without raw or canonical data', async () => {
    const identities = await readOutput('input-identities.json');
    const priorArt = await readOutput('external-prior-art-inventory.json');
    const localProblem = await readOutput('local-problem-comparison.json');
    const replay011 = await readOutput('replay-011-probe-result.json');
    const comparison = await readOutput('replay-010-vs-011-comparison.json');
    const matrix = await readOutput('blocker-triage-matrix.json');
    const recommendation = await readOutput('recommended-next-action.json');
    const protection = await readOutput('protection-audit.json');
    const branch = await readOutput('replay-specific-branch-audit.json');
    const gate = await readOutput('triage-gate.json');

    assert.equal(identities.rawBytesCommitted, false);
    assert.equal(identities.inputs.length, 2);
    assert.equal(priorArt.copiedExternalSourceCodeCommitted, false);
    assert.equal(localProblem.entity2905ClassificationFromTask122, 'never_registered_entity_with_create_gap');
    assert.match(replay011.resultClassification, /^second_canary_/);
    assert.equal(typeof comparison.sameMissingEntityClassRepeated, 'boolean');
    assert.ok([
        'replay_010_specific',
        'local_replay_class_issue',
        'parser_contract_gap',
        'external_oracle_needed',
        'not_determined'
    ].includes(matrix.blockerClassification));
    assert.ok([
        'external_oracle_next',
        'second_canary_expand_one_more',
        'packet_954_contract_continue',
        'pause_replay_010_and_build_infra',
        'prepare_opt_in_fix_candidate',
        'blocked'
    ].includes(recommendation.recommendedAction));
    assert.equal(protection.replay005Accessed, false);
    assert.equal(protection.candidates012To020Accessed, false);
    assert.equal(protection.rawEntityDataCommitted, false);
    assert.equal(branch.parserOrEngineFilesModified, false);
    assert.equal(gate.parserDefaultBehaviorChanged, false);
    assert.equal(gate.recoveryAddedOrPromoted, false);
    assert.equal(gate.canonicalFactsProduced, false);
    assert.equal(gate.task124Created, false);
    assert.ok(existsSync('reports/replay-parser-prior-art-and-second-canary.md'));
});
