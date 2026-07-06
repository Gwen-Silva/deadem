import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import {
    decideViability,
    inspectClarityEntrypoint,
    validateOutputRoots,
    validateReplayInput
} from '../tools/decide-clarity-oracle-viability.mjs';

const OUTPUT_ROOT = 'output/local-replay-processing/clarity-oracle-viability';
const VALID_CATEGORIES = new Set([
    'oracle_utilizavel',
    'oracle_utilizavel_com_limitacoes',
    'oracle_inviavel_no_ambiente_atual'
]);

async function readOutput(name) {
    return JSON.parse(await readFile(`${OUTPUT_ROOT}/${name}`, 'utf8'));
}

test('path guards allow only replay 010 and replay 011 canaries', () => {
    assert.doesNotThrow(() => validateReplayInput('.local/deadem/replays/inbox/partida_010.dem', 'replay_010'));
    assert.doesNotThrow(() => validateReplayInput('.local/deadem/replays/inbox/partida_011.dem', 'replay_011'));

    assert.throws(() => validateReplayInput('.local/deadem/replays/inbox/partida_005.dem', 'replay_010'), /protected replay path/);
    assert.throws(() => validateReplayInput('.local/deadem/replays/inbox/partida_006.dem', 'replay_010'), /bot fixture path/);
    assert.throws(() => validateReplayInput('.local/deadem/replays/inbox/partida_012.dem', 'replay_011'), /candidate outside canary scope/);
    assert.throws(() => validateReplayInput('samples/partida_010.dem', 'replay_010'), /samples path is forbidden/);
    assert.throws(() => validateReplayInput('output/replays/partida_011.dem', 'replay_011'), /output\/replays path is forbidden/);
    assert.throws(() => validateReplayInput('.local/deadem/replays/inbox/partida_011.dem', 'replay_010'), /replay_010 input must/);
});

test('output roots are fixed to local-only cache and compact summary output', () => {
    assert.doesNotThrow(() => validateOutputRoots(
        '.local/deadem/cache/local-replay-processing/clarity-oracle-viability/',
        'output/local-replay-processing/clarity-oracle-viability/'
    ));
    assert.throws(() => validateOutputRoots(
        '.local/deadem/cache/local-replay-processing/clarity-oracle-viability/',
        'output/replays/clarity-oracle-viability/'
    ), /output\/replays path is forbidden/);
    assert.throws(() => validateOutputRoots(
        '.local/deadem/cache/local-replay-processing/other/',
        'output/local-replay-processing/clarity-oracle-viability/'
    ), /local output root/);
});

test('viability categories collapse environment evidence to exactly one category', () => {
    const unavailable = decideViability({
        environmentSummary: {
            javaAvailable: false,
            gradleWrapperPresent: true
        },
        entrypointSummary: {
            minimalCliApiEntrypointFound: true,
            replayExecutionPathObvious: false
        },
        canaryExecutionAttempted: false
    });
    assert.equal(unavailable.viabilityCategory, 'oracle_inviavel_no_ambiente_atual');
    assert.ok(VALID_CATEGORIES.has(unavailable.viabilityCategory));

    const limited = decideViability({
        environmentSummary: {
            javaAvailable: true,
            gradleWrapperPresent: true
        },
        entrypointSummary: {
            minimalCliApiEntrypointFound: true,
            replayExecutionPathObvious: false
        },
        canaryExecutionAttempted: false
    });
    assert.equal(limited.viabilityCategory, 'oracle_utilizavel_com_limitacoes');

    const usable = decideViability({
        environmentSummary: {
            javaAvailable: true,
            gradleWrapperPresent: true
        },
        entrypointSummary: {
            minimalCliApiEntrypointFound: true,
            replayExecutionPathObvious: true
        },
        canaryExecutionAttempted: true
    });
    assert.equal(usable.viabilityCategory, 'oracle_utilizavel');
});

test('clarity entrypoint inspection stays static and does not require adaptation when clone is absent', () => {
    const summary = inspectClarityEntrypoint(null);
    assert.equal(summary.gradleTasksListAttempted, false);
    assert.equal(summary.minimalCliApiEntrypointFound, false);
    assert.equal(summary.requiresCodeChangesToClarity, false);
    assert.equal(summary.requiresClarityDebugging, false);
    assert.equal(summary.stopReason, 'clarity_clone_unavailable');
});

test('summary outputs decide clarity viability without raw or canonical data', async () => {
    const identities = await readOutput('input-identities.json');
    const environment = await readOutput('environment-summary.json');
    const entrypoint = await readOutput('clarity-entrypoint-summary.json');
    const replay010 = await readOutput('replay-010-clarity-status.json');
    const replay011 = await readOutput('replay-011-clarity-status.json');
    const decision = await readOutput('final-viability-decision.json');
    const task124 = await readOutput('task124-comparison.json');
    const alignment = await readOutput('product-reviewer-alignment.json');
    const recommendation = await readOutput('recommended-next-action.json');
    const protection = await readOutput('protection-audit.json');
    const branch = await readOutput('replay-specific-branch-audit.json');
    const gate = await readOutput('clarity-viability-gate.json');

    assert.equal(identities.rawBytesCommitted, false);
    assert.equal(identities.inputs.length, 2);
    assert.equal(typeof environment.javaAvailable, 'boolean');
    assert.equal(typeof environment.gradleWrapperPresent, 'boolean');
    assert.equal(entrypoint.gradleTasksListAttempted, false);
    assert.equal(replay010.localParserReferenceFailure, 'Unable to find an entity with index [ 2905 ]');
    assert.equal(replay011.localParserReferenceFailure, 'Unable to find an entity with index [ 5624 ]');
    assert.ok(VALID_CATEGORIES.has(decision.viabilityCategory));
    assert.equal(decision.source2SemanticsNotConcluded, true);
    assert.equal(task124.task124Gate, 'external_parser_oracle_canaries_ready');
    assert.equal(alignment.trueObjectiveRespected, true);
    assert.equal(alignment.setupKeptAsMeansNotGoal, true);
    assert.equal(alignment.noClarityModification, true);
    assert.ok([
        'run_clarity_oracle_comparison_next',
        'manual_environment_setup_outside_codex_needed',
        'abandon_clarity_oracle_for_now',
        'return_to_local_parser_strategy_review',
        'pause_replay_expansion'
    ].includes(recommendation.recommendedAction));
    assert.equal(protection.replay005Accessed, false);
    assert.equal(protection.candidates012To020Accessed, false);
    assert.equal(protection.rawEntityDataCommitted, false);
    assert.equal(branch.parserOrEngineFilesModified, false);
    assert.equal(branch.clarityModified, false);
    assert.equal(gate.parserDefaultBehaviorChanged, false);
    assert.equal(gate.recoveryAddedOrPromoted, false);
    assert.equal(gate.canonicalFactsProduced, false);
    assert.equal(gate.task126Created, false);
    assert.ok(existsSync('reports/clarity-oracle-viability.md'));
});
